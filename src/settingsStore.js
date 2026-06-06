import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultLanguage, normalizeLanguage } from './i18n';

const settingsFileName = 'quotalens-settings.json';

export const miniBarDefaultSettings = {
  miniBarEnabled: true,
  miniBarAlwaysOnTop: true,
  miniBarOpacity: 0.95,
  miniBarSize: 'normal',
  miniBarLayout: 'standard',
  miniBarPosition: 'top-right',
  miniBarLockPosition: false,
  miniBarShowSsid: true,
  miniBarShowTodayUsage: true,
  miniBarShowSessionUsage: true,
  miniBarShowTopApp: true,
  miniBarShowStatus: true,
  miniBarShowRefreshButton: true,
  miniBarShowOpenButton: true,
  miniBarShowResetButton: false,
  miniBarShowHideButton: true,
  miniBarUseShortLabels: true,
  miniBarBgColor: '#081020',
  miniBarBorderColor: '#1f3b5f',
  miniBarTextColor: '#ffffff',
  miniBarMutedTextColor: '#a9c4e8',
  miniBarAccentColor: '#22c7b8',
  miniBarButtonBgColor: '#101a2f',
  miniBarButtonTextColor: '#ffffff',
  miniBarDangerColor: '#ff6b6b',
  miniBarSafeColor: '#4ade80',
  miniBarWarningColor: '#facc15',
  miniBarExceededColor: '#fb7185',
  miniBarCustomBounds: null,
};

const defaultSettings = {
  dailyLimitBytes: 2147483648,
  sessionLimitBytes: 1073741824,
  notificationsEnabled: true,
  monitoredSsids: [],
  autoResetOnSsidChange: true,
  monitorOnlyListedSsids: false,
  launchAtStartup: false,
  startMinimizedToTray: false,
  developerMode: false,
  ...miniBarDefaultSettings,
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

const normalizeNumberInRange = (value, fallback, min, max) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
};

const normalizeOpacitySetting = (value, fallback) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  if (numericValue > 1) {
    return normalizeNumberInRange(numericValue / 100, fallback, 0, 1);
  }

  return normalizeNumberInRange(numericValue, fallback, 0, 1);
};

const normalizeHexColor = (value, fallback) => {
  const rawValue = String(value || '').trim().toLowerCase();
  const color = rawValue.startsWith('#') ? rawValue : `#${rawValue}`;

  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${color
      .slice(1)
      .split('')
      .map((character) => `${character}${character}`)
      .join('')}`;
  }

  if (/^#[0-9a-f]{6}$/.test(color)) {
    return color;
  }

  return fallback;
};

const normalizeChoice = (value, allowedValues, fallback) => {
  const normalizedValue = String(value || '').trim();

  return allowedValues.includes(normalizedValue) ? normalizedValue : fallback;
};

const normalizeMiniBarCustomBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
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
  developerMode:
    typeof settings.developerMode === 'boolean'
      ? settings.developerMode
      : defaultSettings.developerMode,
  miniBarEnabled:
    typeof settings.miniBarEnabled === 'boolean'
      ? settings.miniBarEnabled
      : defaultSettings.miniBarEnabled,
  miniBarAlwaysOnTop:
    typeof settings.miniBarAlwaysOnTop === 'boolean'
      ? settings.miniBarAlwaysOnTop
      : typeof settings.alwaysOnTopMiniBar === 'boolean'
        ? settings.alwaysOnTopMiniBar
        : defaultSettings.miniBarAlwaysOnTop,
  miniBarOpacity: normalizeOpacitySetting(settings.miniBarOpacity, defaultSettings.miniBarOpacity),
  miniBarSize: normalizeChoice(settings.miniBarSize, ['compact', 'normal', 'wide'], 'normal'),
  miniBarLayout: normalizeChoice(
    settings.miniBarLayout,
    ['minimal', 'standard', 'detailed'],
    'standard',
  ),
  miniBarPosition: normalizeChoice(
    settings.miniBarPosition,
    ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'custom'],
    'top-right',
  ),
  miniBarLockPosition:
    typeof settings.miniBarLockPosition === 'boolean'
      ? settings.miniBarLockPosition
      : defaultSettings.miniBarLockPosition,
  miniBarShowSsid:
    typeof settings.miniBarShowSsid === 'boolean'
      ? settings.miniBarShowSsid
      : defaultSettings.miniBarShowSsid,
  miniBarShowTodayUsage:
    typeof settings.miniBarShowTodayUsage === 'boolean'
      ? settings.miniBarShowTodayUsage
      : defaultSettings.miniBarShowTodayUsage,
  miniBarShowSessionUsage:
    typeof settings.miniBarShowSessionUsage === 'boolean'
      ? settings.miniBarShowSessionUsage
      : defaultSettings.miniBarShowSessionUsage,
  miniBarShowTopApp:
    typeof settings.miniBarShowTopApp === 'boolean'
      ? settings.miniBarShowTopApp
      : defaultSettings.miniBarShowTopApp,
  miniBarShowStatus:
    typeof settings.miniBarShowStatus === 'boolean'
      ? settings.miniBarShowStatus
      : defaultSettings.miniBarShowStatus,
  miniBarShowRefreshButton:
    typeof settings.miniBarShowRefreshButton === 'boolean'
      ? settings.miniBarShowRefreshButton
      : defaultSettings.miniBarShowRefreshButton,
  miniBarShowOpenButton:
    typeof settings.miniBarShowOpenButton === 'boolean'
      ? settings.miniBarShowOpenButton
      : defaultSettings.miniBarShowOpenButton,
  miniBarShowResetButton:
    typeof settings.miniBarShowResetButton === 'boolean'
      ? settings.miniBarShowResetButton
      : defaultSettings.miniBarShowResetButton,
  miniBarShowHideButton:
    typeof settings.miniBarShowHideButton === 'boolean'
      ? settings.miniBarShowHideButton
      : defaultSettings.miniBarShowHideButton,
  miniBarUseShortLabels:
    typeof settings.miniBarUseShortLabels === 'boolean'
      ? settings.miniBarUseShortLabels
      : defaultSettings.miniBarUseShortLabels,
  miniBarBgColor: normalizeHexColor(settings.miniBarBgColor, defaultSettings.miniBarBgColor),
  miniBarBorderColor: normalizeHexColor(
    settings.miniBarBorderColor,
    defaultSettings.miniBarBorderColor,
  ),
  miniBarTextColor: normalizeHexColor(settings.miniBarTextColor, defaultSettings.miniBarTextColor),
  miniBarMutedTextColor: normalizeHexColor(
    settings.miniBarMutedTextColor,
    defaultSettings.miniBarMutedTextColor,
  ),
  miniBarAccentColor: normalizeHexColor(
    settings.miniBarAccentColor,
    defaultSettings.miniBarAccentColor,
  ),
  miniBarButtonBgColor: normalizeHexColor(
    settings.miniBarButtonBgColor,
    defaultSettings.miniBarButtonBgColor,
  ),
  miniBarButtonTextColor: normalizeHexColor(
    settings.miniBarButtonTextColor,
    defaultSettings.miniBarButtonTextColor,
  ),
  miniBarDangerColor: normalizeHexColor(
    settings.miniBarDangerColor,
    defaultSettings.miniBarDangerColor,
  ),
  miniBarSafeColor: normalizeHexColor(settings.miniBarSafeColor, defaultSettings.miniBarSafeColor),
  miniBarWarningColor: normalizeHexColor(
    settings.miniBarWarningColor,
    defaultSettings.miniBarWarningColor,
  ),
  miniBarExceededColor: normalizeHexColor(
    settings.miniBarExceededColor,
    defaultSettings.miniBarExceededColor,
  ),
  miniBarCustomBounds: normalizeMiniBarCustomBounds(settings.miniBarCustomBounds),
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
