// Preload script runs in a context that has access to both
// the DOM and Node.js APIs, but cannot directly access the main process
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the APIs in a safe way
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  // Screenshot capture (no screen share needed)
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
  // System activity tracking
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  startActivityMonitoring: () => ipcRenderer.invoke('start-activity-monitoring'),
  stopActivityMonitoring: () => ipcRenderer.invoke('stop-activity-monitoring'),
  // Listen for activity updates
  onActivityUpdate: (callback) => {
    ipcRenderer.on('activity-update', (_, data) => callback(data));
  },
  removeActivityListener: () => {
    ipcRenderer.removeAllListeners('activity-update');
  },
  // Listen for all windows updates (all opened windows with their stats)
  onAllWindowsUpdate: (callback) => {
    ipcRenderer.on('all-windows-update', (_, data) => callback(data));
  },
  removeAllWindowsListener: () => {
    ipcRenderer.removeAllListeners('all-windows-update');
  },
  // Listen for real-time keystroke updates
  onKeystrokeUpdate: (callback) => {
    ipcRenderer.on('keystroke-update', (_, count) => callback(count));
  },
  // Listen for real-time mouse click updates
  onMouseClickUpdate: (callback) => {
    ipcRenderer.on('mouseclick-update', (_, count) => callback(count));
  },
  // Activity processing and categorization
  processActivity: (input) => ipcRenderer.invoke('process-activity', input),
  getActivityInsights: (timeWindow) => ipcRenderer.invoke('get-activity-insights', timeWindow),
  // Consent management
  getUserConsent: () => ipcRenderer.invoke('get-user-consent'),
  setUserConsent: (consent, remember) => ipcRenderer.invoke('set-user-consent', consent, remember),
  revokeConsent: () => ipcRenderer.invoke('revoke-consent'),
  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  // Data export/delete
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  deleteAllData: () => ipcRenderer.invoke('delete-all-data'),
  // Idle detection
  getLastActivityTimestamp: () => ipcRenderer.invoke('get-last-activity-timestamp')
});

