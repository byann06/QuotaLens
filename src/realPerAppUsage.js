import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const sourceMethod = 'srum-ese-inspect';
const defaultPeriod = '7d';
const validPeriods = new Set(['today', '7d', '30d', 'all']);
const lightweightUnsupportedReason =
  'Windows does not provide this through the lightweight commands currently used. This feature requires tracing methods or additional permissions.';

const normalizePeriod = (period) => {
  const normalizedPeriod = String(period || defaultPeriod).trim().toLowerCase();

  return validPeriods.has(normalizedPeriod) ? normalizedPeriod : defaultPeriod;
};

const requiresAdministratorFromReason = (reason) => {
  const normalizedReason = String(reason || '').toLowerCase();

  return (
    normalizedReason.includes('administrator') ||
    normalizedReason.includes('access is denied') ||
    normalizedReason.includes('access denied') ||
    normalizedReason.includes('permission') ||
    normalizedReason.includes('locked') ||
    normalizedReason.includes('restricted')
  );
};

const parseHelperStdout = (stdout) => {
  if (!stdout) {
    return null;
  }

  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
};

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
  managedEsentStatus: 'not_started',
  eseApiStatus: 'not_started',
  esentutlStatus: 'not_started',
  esentutlOutputPreview: '',
  catalogStatus: 'not_started',
  tableEnumerationStatus: 'not_started',
  copyStrategyUsed: 'not_started',
  fileCopyStatus: 'not_started',
  esentutlCopyStatus: 'not_started',
  vssCopyStatus: 'not_started',
  copyError: '',
  recoveryStatus: 'not_needed',
  recoveryStrategyUsed: 'none',
  copiedSupportFiles: [],
  recoveryError: '',
  period: defaultPeriod,
  periodStart: '',
  periodEnd: '',
  isAdministrator: false,
  requiresAdministrator: requiresAdministratorFromReason(reason),
  apps: [],
  collectedAt: new Date().toISOString(),
});

const toNumber = (value) => {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;
};

const normalizeAppUsage = (appUsage = {}) => ({
  appId: toNumber(appUsage.appId),
  processId: toNumber(appUsage.processId),
  processName: String(appUsage.processName || appUsage.name || 'Unknown'),
  appName: String(appUsage.appName || appUsage.processName || appUsage.name || 'Unknown'),
  packageName: appUsage.packageName ? String(appUsage.packageName) : '',
  category: appUsage.category ? String(appUsage.category) : 'Unknown',
  rawIdentity: appUsage.rawIdentity ? String(appUsage.rawIdentity) : '',
  normalizedIdentity: appUsage.normalizedIdentity ? String(appUsage.normalizedIdentity) : '',
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
  managedEsentStatus: result.managedEsentStatus
    ? String(result.managedEsentStatus)
    : 'unknown',
  eseApiStatus: result.eseApiStatus ? String(result.eseApiStatus) : 'unknown',
  esentutlStatus: result.esentutlStatus ? String(result.esentutlStatus) : 'unknown',
  esentutlOutputPreview: result.esentutlOutputPreview
    ? String(result.esentutlOutputPreview)
    : '',
  catalogStatus: result.catalogStatus ? String(result.catalogStatus) : 'unknown',
  tableEnumerationStatus: result.tableEnumerationStatus
    ? String(result.tableEnumerationStatus)
    : 'unknown',
  copyStrategyUsed: result.copyStrategyUsed ? String(result.copyStrategyUsed) : 'unknown',
  fileCopyStatus: result.fileCopyStatus ? String(result.fileCopyStatus) : 'unknown',
  esentutlCopyStatus: result.esentutlCopyStatus
    ? String(result.esentutlCopyStatus)
    : 'unknown',
  vssCopyStatus: result.vssCopyStatus ? String(result.vssCopyStatus) : 'unknown',
  copyError: result.copyError ? String(result.copyError) : '',
  recoveryStatus: result.recoveryStatus ? String(result.recoveryStatus) : 'unknown',
  recoveryStrategyUsed: result.recoveryStrategyUsed
    ? String(result.recoveryStrategyUsed)
    : 'unknown',
  copiedSupportFiles: Array.isArray(result.copiedSupportFiles)
    ? result.copiedSupportFiles.map(String)
    : [],
  recoveryError: result.recoveryError ? String(result.recoveryError) : '',
  period: result.period ? String(result.period) : defaultPeriod,
  periodStart: result.periodStart ? String(result.periodStart) : '',
  periodEnd: result.periodEnd ? String(result.periodEnd) : '',
  isAdministrator: Boolean(result.isAdministrator),
  requiresAdministrator:
    Boolean(result.requiresAdministrator) ||
    requiresAdministratorFromReason(
      [
        result.reason,
        result.accessStatus,
        result.discoveryStatus,
        result.copyError,
        result.recoveryError,
      ].join(' '),
    ),
  tableNames: Array.isArray(result.tableNames) ? result.tableNames.map(String) : [],
  networkTableCandidates: Array.isArray(result.networkTableCandidates)
    ? result.networkTableCandidates.map(String)
    : [],
  tableSchemas: Array.isArray(result.tableSchemas)
    ? result.tableSchemas.map((schema) => ({
        tableName: String(schema.tableName || ''),
        columns: Array.isArray(schema.columns)
          ? schema.columns.map((column) => ({
              name: String(column.name || ''),
              type: String(column.type || ''),
            }))
          : [],
      }))
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

export const getRealPerAppUsage = async ({ appPath, period = defaultPeriod }) => {
  const helperPath = getHelperPathCandidates(appPath).find((candidatePath) =>
    existsSync(candidatePath),
  );
  const normalizedPeriod = normalizePeriod(period);

  if (!helperPath) {
    return {
      ...createUnsupportedResult(
        'Native SRUM helper is not built yet. Real per-app byte counters require a built helper and SRUM parsing support.',
      ),
      period: normalizedPeriod,
    };
  }

  try {
    const { stdout } = await execFileAsync(helperPath, [
      '--mode',
      'srum-inspect',
      '--period',
      normalizedPeriod,
    ], {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const parsedResult = JSON.parse(stdout);

    return normalizeResult(parsedResult);
  } catch (error) {
    const parsedStdout = parseHelperStdout(error.stdout);

    if (parsedStdout) {
      return normalizeResult({
        ...parsedStdout,
        period: parsedStdout.period || normalizedPeriod,
      });
    }

    const errorMessage = error.message || 'Unknown helper error.';
    const requiresAdministrator = requiresAdministratorFromReason(errorMessage);
    const unsupportedResult = createUnsupportedResult(
      `Native per-app usage helper failed: ${errorMessage}`,
    );

    return {
      ...unsupportedResult,
      accessStatus: requiresAdministrator ? 'access_denied' : unsupportedResult.accessStatus,
      period: normalizedPeriod,
      requiresAdministrator,
    };
  }
};
