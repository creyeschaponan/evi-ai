// =====================================================================
// EVI Desktop — Main Process (Electron)
// Ventana frameless, System Tray, Settings, Wake Word IPC
// =====================================================================
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Persistent settings store
const store = new Store({
  defaults: {
    startWithWindows: false,
    wakeWordEnabled: true,
    wakeWordSensitivity: 0.5,
    orchestratorUrl: 'http://localhost:3000',
    listeningMode: 'push', // 'push' (push-to-talk) | 'alexa' (wake word always-on)
    windowBounds: { width: 1440, height: 900 },
  },
});

let mainWindow = null;
let tray = null;
app.isQuitting = false;

// =====================================================================
// Create Main Window (Frameless Cyberpunk HUD)
// =====================================================================
function createMainWindow() {
  const bounds = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#070812',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    // Check if launched with --hidden flag (auto-start)
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
    }
  });

  // Close = Hide (stay in tray)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Save window bounds on resize
  mainWindow.on('resized', () => {
    const [width, height] = mainWindow.getSize();
    store.set('windowBounds', { width, height });
  });
}

// =====================================================================
// System Tray (Always Visible)
// =====================================================================
function createTray() {
  const trayIconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(trayIconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('EVI — Enhanced Virtual Intelligence');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🖥️ Mostrar EVI',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: '🎙️ Modo Alexa',
      type: 'radio',
      checked: store.get('listeningMode') === 'alexa',
      click: () => {
        store.set('listeningMode', 'alexa');
        if (mainWindow) mainWindow.webContents.send('settings-changed', { listeningMode: 'alexa' });
      },
    },
    {
      label: '🔘 Modo Push-to-Talk',
      type: 'radio',
      checked: store.get('listeningMode') === 'push',
      click: () => {
        store.set('listeningMode', 'push');
        if (mainWindow) mainWindow.webContents.send('settings-changed', { listeningMode: 'push' });
      },
    },
    { type: 'separator' },
    {
      label: '❌ Salir de EVI',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click on tray icon = show window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// =====================================================================
// IPC Handlers (Main ↔ Renderer Bridge)
// =====================================================================
function setupIPC() {
  // Window controls
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  // Settings
  ipcMain.handle('get-settings', () => store.store);

  ipcMain.handle('update-settings', (_event, key, value) => {
    store.set(key, value);

    // Handle "start with Windows" toggle
    if (key === 'startWithWindows') {
      app.setLoginItemSettings({
        openAtLogin: value,
        args: value ? ['--hidden'] : [],
      });
    }

    return store.store;
  });

  // Wake word detected notification (from future wake word engine)
  ipcMain.on('wake-word-trigger', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.webContents.send('wake-word-detected');
    }
  });
}

// =====================================================================
// App Lifecycle
// =====================================================================
app.on('ready', () => {
  createMainWindow();
  createTray();
  setupIPC();

  // Apply "start with Windows" setting from store
  const startWithWin = store.get('startWithWindows');
  app.setLoginItemSettings({
    openAtLogin: startWithWin,
    args: startWithWin ? ['--hidden'] : [],
  });

  console.log('[EVI Desktop] App ready. Tray active. Listening mode:', store.get('listeningMode'));
});

app.on('window-all-closed', () => {
  // Don't quit — stay in tray
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
  }
});
