import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultLanguage, normalizeLanguage } from './i18n';

const settingsFileName = 'quotalens-settings.json';

const defaultSettings = {
  dailyLimitBytes: 2147483648,
  sessionLimitBytes: 1073741824,
  notificationsEnabled: true,
  monitoredSsids: [],
  autoResetOnSsidChange: true,
  monitorOnlyListedSsids: false,
  launchAtStartup: false,
  startMinimizedToTray: false,
  language: defaultLanguage,
};

let settingsFilePath;

const toSafeTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export const getSettingsFilePath = () => {
  if (!settingsFilePath) {
    throw new Error('Settings store has not been initialized.');
  }

  return settingsFilePath;
};

const toPositiveBytes = (value, fallback) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.round(numericValue);
};

const normalizeMonitoredSsids = (ssids) => {
  if (!Array.isArray(ssids)) {
    return defaultSettings.monitoredSsids;
  }

  return Array.from(
    new Set(
      ssids
        .map((ssid) => String(ssid ?? '').trim())
        .filter(Boolean),
    ),
  );
};

const normalizeSettings = (settings = {}) => ({
  dailyLimitBytes: toPositiveBytes(settings.dailyLimitBytes, defaultSettings.dailyLimitBytes),
  sessionLimitBytes: toPositiveBytes(settings.sessionLimitBytes, defaultSettings.sessionLimitBytes),
  notificationsEnabled:
    typeof settings.notificationsEnabled === 'boolean'
      ? settings.notificationsEnabled
      : defaultSettings.notificationsEnabled,
  monitoredSsids: normalizeMonitoredSsids(settings.monitoredSsids),
  autoResetOnSsidChange:
    typeof settings.autoResetOnSsidChange === 'boolean'
      ? settings.autoResetOnSsidChange
      : defaultSettings.autoResetOnSsidChange,
  monitorOnlyListedSsids:
    typeof settings.monitorOnlyListedSsids === 'boolean'
      ? settings.monitorOnlyListedSsids
      : defaultSettings.monitorOnlyListedSsids,
  launchAtStartup:
    typeof settings.launchAtStartup === 'boolean'
      ? settings.launchAtStartup
      : defaultSettings.launchAtStartup,
  startMinimizedToTray:
    typeof settings.startMinimizedToTray === 'boolean'
      ? settings.startMinimizedToTray
      : defaultSettings.startMinimizedToTray,
  language: normalizeLanguage(settings.language),
});

const writeSettingsData = async (settings) => {
  const filePath = getSettingsFilePath();
  const tempFilePath = `${filePath}.tmp`;
  const json = `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`;

  await writeFile(tempFilePath, json, 'utf8');
  await rename(tempFilePath, filePath);
};

const backupCorruptSettings = async () => {
  const filePath = getSettingsFilePath();
  const corruptPath = path.join(
    path.dirname(filePath),
    `quotalens-settings.corrupt-${toSafeTimestamp()}.json`,
  );

  await copyFile(filePath, corruptPath);
  await writeSettingsData(defaultSettings);
};

export const initializeSettingsStore = async (userDataPath) => {
  await mkdir(userDataPath, { recursive: true });
  settingsFilePath = path.join(userDataPath, settingsFileName);

  try {
    await access(settingsFilePath);
  } catch {
    await writeSettingsData(defaultSettings);
  }
};

export const readSettings = async () => {
  const filePath = getSettingsFilePath();

  try {
    const content = await readFile(filePath, 'utf8');
    const parsedSettings = JSON.parse(content);
    const normalizedSettings = normalizeSettings(parsedSettings);

    if (JSON.stringify(parsedSettings) !== JSON.stringify(normalizedSettings)) {
      await writeSettingsData(normalizedSettings);
    }

    return normalizedSettings;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeSettingsData(defaultSettings);
      return defaultSettings;
    }

    await backupCorruptSettings();
    return defaultSettings;
  }
};

export const writeSettings = async (settings) => {
  const normalizedSettings = normalizeSettings(settings);

  await writeSettingsData(normalizedSettings);

  return normalizedSettings;
};

export const updateSettings = async (updates) => {
  const currentSettings = await readSettings();
  const nextSettings = normalizeSettings({
    ...currentSettings,
    ...updates,
  });

  await writeSettingsData(nextSettings);

  return nextSettings;
};
