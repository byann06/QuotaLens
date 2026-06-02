import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('quotaLens', {
  getNetworkStats: () => ipcRenderer.invoke('quotalens:get-network-stats'),
  getWifiInfo: () => ipcRenderer.invoke('quotalens:get-wifi-info'),
  getSessionUsage: () => ipcRenderer.invoke('quotalens:get-session-usage'),
  resetSession: () => ipcRenderer.invoke('quotalens:reset-session'),
  getTodayUsage: () => ipcRenderer.invoke('quotalens:get-today-usage'),
  getHistory: () => ipcRenderer.invoke('quotalens:get-history'),
  clearHistory: () => ipcRenderer.invoke('quotalens:clear-history'),
  addUsageSample: (sample) => ipcRenderer.invoke('quotalens:add-usage-sample', sample),
  getUsageSamples: () => ipcRenderer.invoke('quotalens:get-usage-samples'),
  clearUsageSamples: () => ipcRenderer.invoke('quotalens:clear-usage-samples'),
  getAppNetworkSuspects: () => ipcRenderer.invoke('quotalens:get-app-network-suspects'),
  getAppUsageEstimates: () => ipcRenderer.invoke('quotalens:get-app-usage-estimates'),
  getRealPerAppUsage: () => ipcRenderer.invoke('quotalens:get-real-per-app-usage'),
  getDiagnostics: () => ipcRenderer.invoke('quotalens:get-diagnostics'),
  openDataFolder: () => ipcRenderer.invoke('quotalens:open-data-folder'),
  exportDiagnostics: () => ipcRenderer.invoke('quotalens:export-diagnostics'),
  getSettings: () => ipcRenderer.invoke('quotalens:get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('quotalens:update-settings', settings),
  getStartupSettings: () => ipcRenderer.invoke('quotalens:get-startup-settings'),
  updateStartupSettings: (settings) =>
    ipcRenderer.invoke('quotalens:update-startup-settings', settings),
  checkLimitNotifications: (usage) =>
    ipcRenderer.invoke('quotalens:check-limit-notifications', usage),
  onMonitoringCommand: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const handler = (_event, command) => callback(command);

    ipcRenderer.on('quotalens:monitoring-command', handler);

    return () => {
      ipcRenderer.removeListener('quotalens:monitoring-command', handler);
    };
  },
});
