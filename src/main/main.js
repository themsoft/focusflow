const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./store');

let mainWindow = null;
let tray = null;
const store = new Store();

function getIconPath() {
  const pngPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  if (fs.existsSync(pngPath)) return pngPath;
  const icoPath = path.join(__dirname, '..', '..', 'assets', 'icon.ico');
  if (fs.existsSync(icoPath)) return icoPath;
  return null;
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    registerIpcHandlers();
  });
}

function createWindow() {
  const iconPath = getIconPath();

  const windowOpts = {
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false
    }
  };

  if (iconPath) windowOpts.icon = iconPath;

  mainWindow = new BrowserWindow(windowOpts);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    const closeToTray = store.get('settings')?.closeToTray ?? true;

    if (closeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = getIconPath();

  // Create a small 16x16 icon for the tray
  let trayIcon;
  try {
    if (iconPath) {
      trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } else {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('FocusFlow');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function registerIpcHandlers() {
  // Store operations
  ipcMain.handle('store:get', (_event, key) => {
    if (typeof key !== 'string') return null;
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key, value) => {
    if (typeof key !== 'string') return false;
    return store.set(key, value);
  });

  ipcMain.handle('store:delete', (_event, key) => {
    if (typeof key !== 'string') return false;
    return store.delete(key);
  });

  // Window controls
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });

  // Notifications
  ipcMain.handle('notification:show', (_event, title, body) => {
    if (typeof title !== 'string' || typeof body !== 'string') return false;

    if (Notification.isSupported()) {
      const notification = new Notification({
        title: title.slice(0, 256),
        body: body.slice(0, 1024),
        icon: getIconPath() || undefined
      });
      notification.show();
      return true;
    }
    return false;
  });

  // App info
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
