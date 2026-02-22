const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  tasks: [],
  settings: {
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLongBreak: 4,
    autoStartBreaks: false,
    autoStartFocus: false,
    closeToTray: true,
    notifications: true,
    tickSound: false,
    theme: 'dark',
    language: 'tr'
  },
  statistics: {
    totalFocusMinutes: 0,
    totalSessions: 0,
    completedTasks: 0,
    dailyStats: {}
  }
};

class Store {
  constructor() {
    this.storePath = path.join(app.getPath('userData'), 'data');
    this._ensureDirectory();
  }

  _ensureDirectory() {
    if (!fs.existsSync(this.storePath)) {
      fs.mkdirSync(this.storePath, { recursive: true });
    }
  }

  _getFilePath(key) {
    // Sanitize key to prevent directory traversal
    const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitized) return null;
    return path.join(this.storePath, `${sanitized}.json`);
  }

  get(key) {
    const filePath = this._getFilePath(key);
    if (!filePath) return null;

    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error(`Store read error [${key}]:`, err.message);
    }

    // Return default value if exists
    if (key in DEFAULTS) {
      this.set(key, DEFAULTS[key]);
      return DEFAULTS[key];
    }

    return null;
  }

  set(key, value) {
    const filePath = this._getFilePath(key);
    if (!filePath) return false;

    try {
      const data = JSON.stringify(value, null, 2);
      // Write to temp file first, then rename for atomicity
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, data, 'utf-8');
      fs.renameSync(tmpPath, filePath);
      return true;
    } catch (err) {
      console.error(`Store write error [${key}]:`, err.message);
      return false;
    }
  }

  delete(key) {
    const filePath = this._getFilePath(key);
    if (!filePath) return false;

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (err) {
      console.error(`Store delete error [${key}]:`, err.message);
      return false;
    }
  }

  getAll() {
    try {
      const files = fs.readdirSync(this.storePath);
      const result = {};

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const key = file.replace('.json', '');
        result[key] = this.get(key);
      }

      return result;
    } catch (err) {
      console.error('Store getAll error:', err.message);
      return {};
    }
  }
}

module.exports = Store;
