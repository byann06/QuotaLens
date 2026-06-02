import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const networkStatsCommand =
  'Get-NetAdapterStatistics | Select-Object Name, ReceivedBytes, SentBytes | ConvertTo-Json';

const toNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeAdapter = (adapter) => {
  const receivedBytes = toNumber(adapter.ReceivedBytes);
  const sentBytes = toNumber(adapter.SentBytes);

  return {
    name: String(adapter.Name ?? 'Unknown Adapter'),
    receivedBytes,
    sentBytes,
    totalBytes: receivedBytes + sentBytes,
  };
};

const chooseRelevantAdapter = (adapters) => {
  const wifiAdapter = adapters.find((adapter) => /wi-fi|wireless/i.test(adapter.name));

  if (wifiAdapter) {
    return wifiAdapter;
  }

  return adapters.reduce((largest, adapter) => {
    if (!largest || adapter.totalBytes > largest.totalBytes) {
      return adapter;
    }

    return largest;
  }, null);
};

const parseNetworkStats = (stdout) => {
  const trimmedOutput = stdout.trim().replace(/^\uFEFF/, '');

  if (!trimmedOutput) {
    throw new Error('PowerShell returned empty network adapter statistics.');
  }

  const parsed = JSON.parse(trimmedOutput);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const adapters = rows.filter(Boolean).map(normalizeAdapter);

  if (adapters.length === 0) {
    throw new Error('No network adapter statistics were returned by PowerShell.');
  }

  return {
    adapter: chooseRelevantAdapter(adapters),
    adapters,
    collectedAt: new Date().toISOString(),
  };
};

export const getNetworkStats = async () => {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', networkStatsCommand],
      {
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      },
    );

    return parseNetworkStats(stdout);
  } catch (error) {
    const message = error.stderr?.trim() || error.message || 'Unknown PowerShell error.';
    throw new Error(`Failed to read Windows network adapter statistics: ${message}`);
  }
};
