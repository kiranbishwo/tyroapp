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
  // Activity processing and categorization
  processActivity: (input) => ipcRenderer.invoke('process-activity', input),
  getActivityInsights: (timeWindow) => ipcRenderer.invoke('get-activity-insights', timeWindow)
});

