import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, shell } from 'electron';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getAppNetworkSuspects } from './appNetworkDetector';
import { estimateAppUsage } from './appUsageEstimator';
import {
  addCompletedSession,
  clearHistory,
  getHistoryFilePath,
  getHistory,
  getTodayUsage,
  initializeHistoryStore,
} from './historyStore';
import { getNetworkStats } from './networkStats';
import { getRealPerAppUsage } from './realPerAppUsage';
import { formatTranslation, normalizeLanguage, translate } from './i18n';
import {
  getSettingsFilePath,
  initializeSettingsStore,
  readSettings,
  updateSettings,
} from './settingsStore';
import { getSessionUsage, resetSession } from './sessionUsage';
import {
  addUsageSample,
  clearUsageSamples,
  getUsageSamples,
  initializeUsageSamplesStore,
} from './usageSamplesStore';
import { getWifiInfo } from './wifiInfo';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow;
let tray;
let isQuitting = false;
const notificationState = {
  dailyWarning: false,
  dailyExceeded: false,
  sessionWarning: false,
  sessionExceeded: false,
};

const fallbackTrayIcon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAjElEQVR4Ae3VAQbAIAwEwLz/0+4lYRYErBgiILia2c1eDY0kSRJEeA/wnbt9A1ts5BhZA4T0q2DkczPUoZo1BOIP4A5gCNHByCk/0wDOPfIu7Ag+4ALHUQdoAAdYAbwO+JI88A4BdcANUoQnyQP/A7wCCrAigAcwmKrBLZJduJ+VJLtIKG0CRfTjQZIkSeJP9Qc3ayAhrko3iwAAAABJRU5ErkJggg==';

const getTrayIcon = () => {
  const trayIconPath = path.join(app.getAppPath(), 'assets', 'tray-icon.png');

  if (existsSync(trayIconPath)) {
    const icon = nativeImage.createFromPath(trayIconPath);

    if (!icon.isEmpty()) {
      return icon;
    }

    console.warn(`QuotaLens tray icon is empty: ${trayIconPath}`);
  } else {
    console.warn(`QuotaLens tray icon not found: ${trayIconPath}`);
  }

  return nativeImage.createFromDataURL(fallbackTrayIcon);
};

const showMainWindow = () => {
  if (!mainWindow) {
    createWindow({ show: true });
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
};

app.on('second-instance', () => {
  showMainWindow();
});

const toggleMainWindow = () => {
  if (!mainWindow || !mainWindow.isVisible()) {
    showMainWindow();
    return;
  }

  mainWindow.hide();
};

const sendMonitoringCommand = (command) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('quotalens:monitoring-command', command);
  }
};

const resetSessionNotificationState = () => {
  notificationState.sessionWarning = false;
  notificationState.sessionExceeded = false;
};

const toUsagePercent = (usageBytes, limitBytes) => {
  if (!Number.isFinite(usageBytes) || !Number.isFinite(limitBytes) || limitBytes <= 0) {
    return 0;
  }

  return usageBytes / limitBytes;
};

const showLimitNotification = (title, body) => {
  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    title,
    body,
    silent: false,
  }).show();
};

const maybeNotifyLimit = ({ usageBytes, limitBytes, warningKey, exceededKey, labelKey, language }) => {
  const percent = toUsagePercent(usageBytes, limitBytes);
  const label = translate(language, labelKey);

  if (percent >= 1) {
    if (!notificationState[exceededKey]) {
      showLimitNotification(
        formatTranslation(language, 'notification.exceededTitle', { label }),
        formatTranslation(language, 'notification.exceededBody', { label }),
      );
    }

    notificationState[warningKey] = true;
    notificationState[exceededKey] = true;
    return 'exceeded';
  }

  if (percent >= 0.8) {
    if (!notificationState[warningKey]) {
      showLimitNotification(
        formatTranslation(language, 'notification.warningTitle', { label }),
        formatTranslation(language, 'notification.warningBody', { label }),
      );
    }

    notificationState[warningKey] = true;
    return 'warning';
  }

  return 'safe';
};

const toSafeTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const summarizeSettings = (settings) => ({
  dailyLimitBytes: settings.dailyLimitBytes,
  sessionLimitBytes: settings.sessionLimitBytes,
  notificationsEnabled: settings.notificationsEnabled,
  monitoredSsids: settings.monitoredSsids,
  autoResetOnSsidChange: settings.autoResetOnSsidChange,
  monitorOnlyListedSsids: settings.monitorOnlyListedSsids,
  launchAtStartup: settings.launchAtStartup,
  startMinimizedToTray: settings.startMinimizedToTray,
  language: settings.language,
});

const runProbe = async (probe) => {
  try {
    return {
      ok: true,
      data: await probe(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'Probe failed.',
    };
  }
};

const buildDiagnostics = async () => {
  const [settings, history, networkProbe, wifiProbe] = await Promise.all([
    readSettings(),
    getHistory(),
    runProbe(getNetworkStats),
    runProbe(getWifiInfo),
  ]);

  return {
    appName: 'QuotaLens',
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    settingsFilePath: getSettingsFilePath(),
    historyFilePath: getHistoryFilePath(),
    networkProbe,
    wifiProbe,
    settingsSummary: summarizeSettings(settings),
    historyCount: history.length,
    timestamp: new Date().toISOString(),
  };
};

const buildTrayMenu = (language) =>
  Menu.buildFromTemplate([
    {
      label: translate(language, 'tray.open'),
      click: showMainWindow,
    },
    {
      label: translate(language, 'tray.pause'),
      click: () => sendMonitoringCommand('pause'),
    },
    {
      label: translate(language, 'tray.resume'),
      click: () => sendMonitoringCommand('resume'),
    },
    {
      label: translate(language, 'tray.hide'),
      click: () => mainWindow?.hide(),
    },
    { type: 'separator' },
    {
      label: translate(language, 'tray.quit'),
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

const refreshTrayMenu = (language) => {
  if (!tray) {
    return;
  }

  tray.setContextMenu(buildTrayMenu(normalizeLanguage(language)));
};

const createTray = (language) => {
  if (tray) {
    refreshTrayMenu(language);
    return;
  }

  tray = new Tray(getTrayIcon());
  tray.setToolTip('QuotaLens');
  refreshTrayMenu(language);

  tray.on('click', toggleMainWindow);
};

const applyLoginItemSettings = (settings) => {
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtStartup,
    openAsHidden: settings.startMinimizedToTray,
    args: settings.startMinimizedToTray ? ['--hidden'] : [],
  });
};

const createWindow = ({ show = true } = {}) => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 900,
    minHeight: 640,
    show,
    title: 'QuotaLens',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  try {
    await initializeHistoryStore(app.getPath('userData'));
  } catch (error) {
    console.error('Failed to initialize QuotaLens history store:', error);
  }

  try {
    await initializeSettingsStore(app.getPath('userData'));
  } catch (error) {
    console.error('Failed to initialize QuotaLens settings store:', error);
  }

  try {
    await initializeUsageSamplesStore(app.getPath('userData'));
  } catch (error) {
    console.error('Failed to initialize QuotaLens usage samples store:', error);
  }

  const initialSettings = await readSettings();
  applyLoginItemSettings(initialSettings);

  ipcMain.handle('quotalens:get-network-stats', async () => {
    try {
      const stats = await getNetworkStats();
      return { ok: true, stats };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read network adapter statistics.',
      };
    }
  });

  ipcMain.handle('quotalens:get-wifi-info', async () => {
    try {
      const wifiInfo = await getWifiInfo();
      return { ok: true, wifiInfo };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read Wi-Fi information.',
      };
    }
  });

  ipcMain.handle('quotalens:get-session-usage', async () => {
    try {
      const usage = await getSessionUsage();
      return { ok: true, usage };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read session usage.',
      };
    }
  });

  ipcMain.handle('quotalens:reset-session', async () => {
    try {
      const currentUsage = await getSessionUsage();
      console.debug('QuotaLens main reset current session usage:', {
        sessionTotalBytes: currentUsage.sessionTotalBytes,
        startedAt: currentUsage.startedAt,
      });

      if (currentUsage.sessionTotalBytes > 0) {
        await addCompletedSession({
          startedAt: currentUsage.startedAt,
          endedAt: currentUsage.updatedAt,
          adapterName: currentUsage.adapterName,
          receivedBytes: currentUsage.sessionReceivedBytes,
          sentBytes: currentUsage.sessionSentBytes,
          totalBytes: currentUsage.sessionTotalBytes,
        });
      }

      const usage = await resetSession();
      resetSessionNotificationState();
      console.debug('QuotaLens main reset baseline created:', {
        sessionTotalBytes: usage.sessionTotalBytes,
        startedAt: usage.startedAt,
      });
      return { ok: true, usage };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to reset session usage.',
      };
    }
  });

  ipcMain.handle('quotalens:get-settings', async () => {
    try {
      const settings = await readSettings();
      return { ok: true, settings };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read settings.',
      };
    }
  });

  ipcMain.handle('quotalens:update-settings', async (_event, settings) => {
    try {
      const savedSettings = await updateSettings(settings);
      refreshTrayMenu(savedSettings.language);
      return { ok: true, settings: savedSettings };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to update settings.',
      };
    }
  });

  ipcMain.handle('quotalens:get-startup-settings', async () => {
    try {
      const settings = await readSettings();
      return {
        ok: true,
        startupSettings: {
          launchAtStartup: settings.launchAtStartup,
          startMinimizedToTray: settings.startMinimizedToTray,
          isPackaged: app.isPackaged,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read startup settings.',
      };
    }
  });

  ipcMain.handle('quotalens:update-startup-settings', async (_event, startupSettings) => {
    try {
      const savedSettings = await updateSettings({
        launchAtStartup: Boolean(startupSettings?.launchAtStartup),
        startMinimizedToTray: Boolean(startupSettings?.startMinimizedToTray),
      });

      applyLoginItemSettings(savedSettings);

      return {
        ok: true,
        startupSettings: {
          launchAtStartup: savedSettings.launchAtStartup,
          startMinimizedToTray: savedSettings.startMinimizedToTray,
          isPackaged: app.isPackaged,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to update startup settings.',
      };
    }
  });

  ipcMain.handle('quotalens:check-limit-notifications', async (_event, usage) => {
    try {
      const settings = await readSettings();

      if (!settings.notificationsEnabled) {
        return { ok: true, notified: false };
      }

      const dailyStatus = maybeNotifyLimit({
        usageBytes: Number(usage?.todayUsageBytes) || 0,
        limitBytes: settings.dailyLimitBytes,
        warningKey: 'dailyWarning',
        exceededKey: 'dailyExceeded',
        labelKey: 'notification.todayUsage',
        language: settings.language,
      });
      const sessionStatus = maybeNotifyLimit({
        usageBytes: Number(usage?.sessionUsageBytes) || 0,
        limitBytes: settings.sessionLimitBytes,
        warningKey: 'sessionWarning',
        exceededKey: 'sessionExceeded',
        labelKey: 'notification.currentSession',
        language: settings.language,
      });

      return {
        ok: true,
        notified: dailyStatus !== 'safe' || sessionStatus !== 'safe',
        dailyStatus,
        sessionStatus,
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to check limit notifications.',
      };
    }
  });

  ipcMain.handle('quotalens:get-today-usage', async () => {
    try {
      const todayUsage = await getTodayUsage();
      return { ok: true, todayUsage };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read today usage.',
      };
    }
  });

  ipcMain.handle('quotalens:get-history', async () => {
    try {
      const sessions = await getHistory();
      return { ok: true, sessions };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read history.',
      };
    }
  });

  ipcMain.handle('quotalens:clear-history', async () => {
    try {
      await clearHistory();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to clear history.',
      };
    }
  });

  ipcMain.handle('quotalens:add-usage-sample', async (_event, sample) => {
    try {
      const usageSample = await addUsageSample(sample);
      return { ok: true, sample: usageSample };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to add usage sample.',
      };
    }
  });

  ipcMain.handle('quotalens:get-usage-samples', async () => {
    try {
      const samples = await getUsageSamples();
      return { ok: true, samples };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read usage samples.',
      };
    }
  });

  ipcMain.handle('quotalens:clear-usage-samples', async () => {
    try {
      await clearUsageSamples();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to clear usage samples.',
      };
    }
  });

  ipcMain.handle('quotalens:get-app-network-suspects', async () => {
    try {
      const suspects = await getAppNetworkSuspects();
      return { ok: true, suspects };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to detect active app network connections.',
      };
    }
  });

  ipcMain.handle('quotalens:get-app-usage-estimates', async () => {
    try {
      const [usageSamples, appSuspects] = await Promise.all([
        getUsageSamples(),
        getAppNetworkSuspects(),
      ]);
      const estimates = estimateAppUsage({
        usageSamples,
        appSuspects,
      });

      return { ok: true, estimates };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to estimate app usage impact.',
      };
    }
  });

  ipcMain.handle('quotalens:get-real-per-app-usage', async () => {
    try {
      const perAppUsage = await getRealPerAppUsage({
        appPath: app.getAppPath(),
      });

      return { ok: true, perAppUsage };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to read real per-app usage.',
      };
    }
  });

  ipcMain.handle('quotalens:get-diagnostics', async () => {
    try {
      const diagnostics = await buildDiagnostics();
      return { ok: true, diagnostics };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to build diagnostics.',
      };
    }
  });

  ipcMain.handle('quotalens:open-data-folder', async () => {
    try {
      const errorMessage = await shell.openPath(app.getPath('userData'));

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to open data folder.',
      };
    }
  });

  ipcMain.handle('quotalens:export-diagnostics', async () => {
    try {
      const diagnostics = await buildDiagnostics();
      const exportPath = path.join(
        app.getPath('userData'),
        `quotalens-diagnostics-${toSafeTimestamp()}.json`,
      );

      await writeFile(exportPath, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');

      return { ok: true, exportPath };
    } catch (error) {
      return {
        ok: false,
        error: error.message || 'Failed to export diagnostics.',
      };
    }
  });

  createTray(initialSettings.language);
  createWindow({
    show: !initialSettings.startMinimizedToTray,
  });

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow({ show: true });
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Keep the app alive in the tray until the user chooses Quit.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
