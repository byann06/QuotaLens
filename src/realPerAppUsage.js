import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const sourceMethod = 'srum-parser-prototype';
const lightweightUnsupportedReason =
  'Windows does not provide this through the lightweight commands currently used. This feature requires tracing methods or additional permissions.';

const createUnsupportedResult = (reason = lightweightUnsupportedReason) => ({
  supported: false,
  sourceMethod,
  reason,
  srumPath: '',
  foundPath: '',
  copiedPath: '',
  checkedPaths: [],
  discoveryStatus: 'error',
  accessStatus: 'helper_not_available',
  parseStatus: 'not_started',
  apps: [],
  collectedAt: new Date().toISOString(),
});

const toNumber = (value) => {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;
};

const normalizeAppUsage = (appUsage = {}) => ({
  processId: toNumber(appUsage.processId),
  processName: String(appUsage.processName || appUsage.name || 'Unknown'),
  appName: String(appUsage.appName || appUsage.processName || appUsage.name || 'Unknown'),
  packageName: appUsage.packageName ? String(appUsage.packageName) : '',
  category: appUsage.category ? String(appUsage.category) : 'Unknown',
  rawIdentity: appUsage.rawIdentity ? String(appUsage.rawIdentity) : '',
  downloadBytes: toNumber(appUsage.downloadBytes ?? appUsage.receivedBytes),
  uploadBytes: toNumber(appUsage.uploadBytes ?? appUsage.sentBytes),
  totalBytes: toNumber(
    appUsage.totalBytes ??
      toNumber(appUsage.downloadBytes ?? appUsage.receivedBytes) +
        toNumber(appUsage.uploadBytes ?? appUsage.sentBytes),
  ),
  lastSeen: appUsage.lastSeen ? String(appUsage.lastSeen) : '',
  sourceMethod: String(appUsage.sourceMethod || sourceMethod),
});

const normalizeResult = (result = {}) => ({
  supported: Boolean(result.supported),
  sourceMethod: String(result.sourceMethod || sourceMethod),
  dataType: result.dataType ? String(result.dataType) : '',
  note: result.note ? String(result.note) : '',
  reason: String(result.reason || ''),
  srumPath: result.srumPath ? String(result.srumPath) : '',
  foundPath: result.foundPath ? String(result.foundPath) : '',
  copiedPath: result.copiedPath ? String(result.copiedPath) : '',
  checkedPaths: Array.isArray(result.checkedPaths) ? result.checkedPaths.map(String) : [],
  discoveryStatus: result.discoveryStatus ? String(result.discoveryStatus) : 'unknown',
  accessStatus: result.accessStatus ? String(result.accessStatus) : 'unknown',
  parseStatus: result.parseStatus ? String(result.parseStatus) : 'unknown',
  tableNames: Array.isArray(result.tableNames) ? result.tableNames.map(String) : [],
  networkTableCandidates: Array.isArray(result.networkTableCandidates)
    ? result.networkTableCandidates.map(String)
    : [],
  apps: Array.isArray(result.apps) ? result.apps.map(normalizeAppUsage) : [],
  collectedAt: result.collectedAt || new Date().toISOString(),
});

const getHelperPathCandidates = (appPath) => [
  path.join(
    appPath,
    'native',
    'per-app-usage-helper',
    'bin',
    'Release',
    'net8.0',
    'QuotaLens.PerAppUsageHelper.exe',
  ),
  path.join(
    appPath,
    'native',
    'per-app-usage-helper',
    'bin',
    'Debug',
    'net8.0',
    'QuotaLens.PerAppUsageHelper.exe',
  ),
];

export const getRealPerAppUsage = async ({ appPath }) => {
  const helperPath = getHelperPathCandidates(appPath).find((candidatePath) =>
    existsSync(candidatePath),
  );

  if (!helperPath) {
    return createUnsupportedResult(
      'Native SRUM helper is not built yet. Real per-app byte counters require a built helper and SRUM parsing support.',
    );
  }

  try {
    const { stdout } = await execFileAsync(helperPath, [], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const parsedResult = JSON.parse(stdout);

    return normalizeResult(parsedResult);
  } catch (error) {
    return createUnsupportedResult(
      `Native per-app usage helper failed: ${error.message || 'Unknown helper error.'}`,
    );
  }
};
