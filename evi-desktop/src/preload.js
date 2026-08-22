// =====================================================================
// EVI Desktop — Preload Bridge (Secure Context Isolation)
// =====================================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window Controls for Frameless Titlebar
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Settings Management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (key, value) => ipcRenderer.invoke('update-settings', key, value),

  // Events from Main Process
  onWakeWordDetected: (callback) => {
    ipcRenderer.on('wake-word-detected', (_event, ...args) => callback(...args));
  },
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings-changed', (_event, ...args) => callback(...args));
  },

  // Wake Word Manual Trigger (for testing / bridge)
  triggerWakeWord: () => ipcRenderer.send('wake-word-trigger'),

  // Environment identifier
  isElectron: true,
});
