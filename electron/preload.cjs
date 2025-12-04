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
  captureScreenshot: (isBlurred) => ipcRenderer.invoke('capture-screenshot', isBlurred),
  // System activity tracking
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  startActivityMonitoring: (projectId, taskId, taskName, projectName) => ipcRenderer.invoke('start-activity-monitoring', projectId, taskId, taskName, projectName),
  stopActivityMonitoring: () => ipcRenderer.invoke('stop-activity-monitoring'),
  updateTaskTracking: (projectId, taskId, taskName, projectName) => ipcRenderer.invoke('update-task-tracking', projectId, taskId, taskName, projectName),
  // Task tracking data management
  getCurrentTaskTracking: () => ipcRenderer.invoke('get-current-task-tracking'),
  addActivityLogToTask: (activityLog) => ipcRenderer.invoke('add-activity-log-to-task', activityLog),
  addWebcamPhotoToTask: (photoDataUrl) => ipcRenderer.invoke('add-webcam-photo-to-task', photoDataUrl),
  saveTaskTrackingData: (projectId, taskId, taskName, projectName) => ipcRenderer.invoke('save-task-tracking-data', projectId, taskId, taskName, projectName),
  loadTaskTrackingData: (projectId, taskId, dateFilter = 'today') => ipcRenderer.invoke('load-task-tracking-data', projectId, taskId, dateFilter),
  getProjectTasksTracking: (projectId) => ipcRenderer.invoke('get-project-tasks-tracking', projectId),
  getTodayTasks: () => ipcRenderer.invoke('get-today-tasks'),
  getTrackingDataPath: () => ipcRenderer.invoke('get-tracking-data-path'),
  verifyTrackingData: (projectId) => ipcRenderer.invoke('verify-tracking-data', projectId),
  // Active task state management (for restoration on app restart)
  getLastActiveTaskState: () => ipcRenderer.invoke('get-last-active-task-state'),
  // Combined insights
  getCombinedInsights: (dateFilter = 'today') => ipcRenderer.invoke('get-combined-insights', dateFilter),
  subscribeCombinedInsights: (dateFilter = 'today') => ipcRenderer.invoke('subscribe-combined-insights', dateFilter),
  unsubscribeCombinedInsights: () => ipcRenderer.invoke('unsubscribe-combined-insights'),
  onCombinedInsightsUpdate: (callback) => {
    ipcRenderer.on('combined-insights-update', (_, data) => callback(data));
  },
  removeCombinedInsightsListener: () => {
    ipcRenderer.removeAllListeners('combined-insights-update');
  },
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

