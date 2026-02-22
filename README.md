# FocusFlow

A modern, lightweight Pomodoro Timer & Task Manager for Windows.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-0078d4.svg)
![Electron](https://img.shields.io/badge/electron-33-47848f.svg)

## Features

- **Pomodoro Timer** - Configurable work/break intervals with auto-cycling
- **Task Management** - Add, complete, and track tasks with estimated pomodoros
- **Statistics** - Daily focus time, session counts, weekly charts, and streaks
- **Dark & Light Themes** - Modern glassmorphism UI with smooth transitions
- **System Tray** - Minimize to tray, desktop notifications
- **Keyboard Shortcuts** - Space (start/pause), R (reset), S (skip)
- **Local Storage** - All data stays on your machine, no account required
- **Single Instance** - Prevents multiple windows from opening

## Installation

### Download

Download the latest release from the [**Releases**](https://github.com/themsoft/focusflow/releases/latest) page:

| File | Description |
|------|-------------|
| `FocusFlow Setup 1.0.0.exe` | Windows Installer (recommended) |
| `FocusFlow 1.0.0.exe` | Portable version (no install needed) |

### Build from Source

```bash
# Clone the repository
git clone https://github.com/themsoft/focusflow.git
cd focusflow

# Install dependencies
npm install

# Run in development mode
npm start

# Build for Windows
npm run build
```

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **Vanilla JS** - No heavy frameworks, fast and lightweight
- **CSS Custom Properties** - Theming with 45+ design tokens
- **electron-builder** - Professional Windows packaging (NSIS installer + portable)

## Security

- `contextIsolation: true` - Renderer process is fully sandboxed
- `nodeIntegration: false` - No Node.js access from web content
- Secure `contextBridge` for IPC communication
- Content Security Policy (CSP) headers
- Input sanitization on all IPC channels
- Data stored locally in `%APPDATA%/FocusFlow/data/`

## Project Structure

```
focusflow/
  src/
    main/
      main.js        # Electron main process
      preload.js     # Secure context bridge
      store.js       # Local JSON file storage
    renderer/
      index.html     # App UI
      styles.css     # Theming & layout
      app.js         # Timer, tasks, settings logic
  assets/
    icon.svg         # App icon (source)
  package.json
  LICENSE
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
