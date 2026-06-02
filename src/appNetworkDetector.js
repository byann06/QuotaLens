import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const appNetworkSuspectsCommand = `
$connections = Get-NetTCPConnection -ErrorAction Stop |
  Where-Object {
    $_.State -eq 'Established' -and
    $_.RemoteAddress -notin @('127.0.0.1', '::1', '0.0.0.0', '::') -and
    $_.RemoteAddress -notmatch '^::ffff:127\\.'
  }

$items = @(
  $connections |
    Group-Object OwningProcess |
    ForEach-Object {
      $processIdValue = [int]$_.Name
      $process = Get-Process -Id $processIdValue -ErrorAction SilentlyContinue
      [PSCustomObject]@{
        ProcessId = $processIdValue
        ProcessName = if ($process) { $process.ProcessName } else { 'Unknown' }
        ConnectionCount = $_.Count
        RemoteAddresses = @($_.Group | Select-Object -ExpandProperty RemoteAddress -Unique | Select-Object -First 3)
        States = @($_.Group | Group-Object State | ForEach-Object { "$($_.Name):$($_.Count)" })
      }
    } |
    Sort-Object ConnectionCount -Descending |
    Select-Object -First 20
)

$items | ConvertTo-Json -Depth 4
`;

const toNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const toArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === '') {
    return [];
  }

  return [value];
};

const appMappings = [
  {
    pattern: /chrome/i,
    appKind: 'chrome',
    friendlyName: 'Google Chrome',
    category: 'Browser',
    description: 'Browser. Usage depends on open tabs, streaming, downloads, or active websites.',
  },
  {
    pattern: /msedge/i,
    appKind: 'msedge',
    friendlyName: 'Microsoft Edge',
    category: 'Browser',
    description: 'Browser. Usage depends on open tabs, streaming, downloads, or active websites.',
  },
  {
    pattern: /firefox/i,
    appKind: 'firefox',
    friendlyName: 'Firefox',
    category: 'Browser',
    description: 'Browser. Usage depends on open tabs, streaming, downloads, or active websites.',
  },
  {
    pattern: /brave/i,
    appKind: 'brave',
    friendlyName: 'Brave',
    category: 'Browser',
    description: 'Browser. Usage depends on open tabs, streaming, downloads, or active websites.',
  },
  {
    pattern: /spotify/i,
    appKind: 'spotify',
    friendlyName: 'Spotify',
    category: 'Spotify / Music Streaming',
    description: 'Music streaming app. It may use internet while playing or loading songs.',
  },
  {
    pattern: /steam/i,
    appKind: 'steam',
    friendlyName: 'Steam',
    category: 'Steam / Game Launcher',
    description: 'Game launcher. It may use a lot of data while downloading or updating games.',
  },
  {
    pattern: /epicgameslauncher/i,
    appKind: 'epicgameslauncher',
    friendlyName: 'Epic Games',
    category: 'Epic Games / Game Launcher',
    description: 'Game launcher. It may use a lot of data while downloading or updating games.',
  },
  {
    pattern: /onedrive/i,
    appKind: 'onedrive',
    friendlyName: 'OneDrive',
    category: 'OneDrive / Cloud Sync',
    description: 'Cloud sync app. It may use internet while syncing files.',
  },
  {
    pattern: /telegram/i,
    appKind: 'telegram',
    friendlyName: 'Telegram',
    category: 'Telegram / Chat App',
    description: 'Chat app. It may use internet for messages, calls, or media downloads.',
  },
  {
    pattern: /whatsapp/i,
    appKind: 'whatsapp',
    friendlyName: 'WhatsApp',
    category: 'WhatsApp / Chat App',
    description: 'Chat app. It may use internet for messages, calls, or media downloads.',
  },
  {
    pattern: /discord/i,
    appKind: 'discord',
    friendlyName: 'Discord',
    category: 'Discord / Chat App',
    description: 'Chat app. It may use internet for messages, voice, streams, or media downloads.',
  },
  {
    pattern: /^code$/i,
    appKind: 'code',
    friendlyName: 'VS Code',
    category: 'VS Code / Code Editor',
    description: 'Code editor. It may use internet for extensions, sync, or development tools.',
  },
  {
    pattern: /codex/i,
    appKind: 'codex',
    friendlyName: 'Codex',
    category: 'Codex / AI Coding Tool',
    description: 'AI coding tool. It may use internet for model requests or workspace services.',
  },
  {
    pattern: /^node$/i,
    appKind: 'node',
    friendlyName: 'Node.js',
    category: 'Node.js / Development Tool',
    description: 'Development tool. It may use internet for local dev servers or package tooling.',
  },
  {
    pattern: /powershell/i,
    appKind: 'powershell',
    friendlyName: 'PowerShell',
    category: 'PowerShell / System Tool',
    description: 'System tool. It may have network connections from scripts or system commands.',
  },
  {
    pattern: /svchost/i,
    appKind: 'svchost',
    friendlyName: 'Windows Service Host',
    category: 'Windows Service',
    description:
      'Windows service host. It may be related to updates, DNS, Defender, or other network services.',
  },
  {
    pattern: /^system$/i,
    appKind: 'system',
    friendlyName: 'Windows System',
    category: 'Windows System',
    description: 'Windows system process. It may be related to core networking services.',
  },
];

const getAppInfo = (processName) => {
  const normalizedName = String(processName || 'Unknown');
  const mapping = appMappings.find((entry) => entry.pattern.test(normalizedName));

  if (mapping) {
    return mapping;
  }

  return {
    appKind: 'unknown',
    friendlyName: normalizedName,
    category: 'Unknown',
    description: 'Unrecognized process with active internet connections.',
  };
};

const normalizeSuspect = (suspect) => {
  const processName = String(suspect.ProcessName || 'Unknown');
  const appInfo = getAppInfo(processName);
  const remoteAddresses = toArray(suspect.RemoteAddresses)
    .map((address) => String(address ?? '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const states = toArray(suspect.States)
    .map((state) => String(state ?? '').trim())
    .filter(Boolean);
  const processId = toNumber(suspect.ProcessId);

  return {
    appKind: appInfo.appKind,
    friendlyName: appInfo.friendlyName,
    category: appInfo.category,
    description: appInfo.description,
    processId,
    processName,
    connectionCount: toNumber(suspect.ConnectionCount),
    remoteAddresses,
    states,
    technicalDetails: {
      processIds: [processId],
      processNames: [processName],
      remoteAddresses,
      states,
    },
  };
};

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const mergeStates = (leftStates, rightStates) => {
  const totals = new Map();

  [...leftStates, ...rightStates].forEach((state) => {
    const [name, count] = String(state).split(':');
    const key = name || 'Unknown';
    totals.set(key, (totals.get(key) || 0) + (toNumber(count) || 1));
  });

  return Array.from(totals.entries()).map(([name, count]) => `${name}:${count}`);
};

const groupSuspects = (suspects) => {
  const grouped = new Map();

  suspects.forEach((suspect) => {
    const key = `${suspect.appKind}:${suspect.friendlyName.toLowerCase()}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, suspect);
      return;
    }

    const processIds = unique([
      ...existing.technicalDetails.processIds,
      ...suspect.technicalDetails.processIds,
    ]);
    const processNames = unique([
      ...existing.technicalDetails.processNames,
      ...suspect.technicalDetails.processNames,
    ]);
    const remoteAddresses = unique([
      ...existing.technicalDetails.remoteAddresses,
      ...suspect.technicalDetails.remoteAddresses,
    ]).slice(0, 3);
    const states = mergeStates(existing.technicalDetails.states, suspect.technicalDetails.states);

    grouped.set(key, {
      ...existing,
      processId: processIds[0] || existing.processId,
      processName: processNames.join(', '),
      connectionCount: existing.connectionCount + suspect.connectionCount,
      remoteAddresses,
      states,
      technicalDetails: {
        processIds,
        processNames,
        remoteAddresses,
        states,
      },
    });
  });

  return Array.from(grouped.values()).sort(
    (left, right) => right.connectionCount - left.connectionCount,
  );
};

const parseAppNetworkSuspects = (stdout) => {
  const trimmedOutput = stdout.trim().replace(/^\uFEFF/, '');

  if (!trimmedOutput) {
    return {
      suspects: [],
      collectedAt: new Date().toISOString(),
    };
  }

  const parsed = JSON.parse(trimmedOutput);
  const rows = Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);

  return {
    suspects: groupSuspects(
      rows
        .map(normalizeSuspect)
        .filter((suspect) => suspect.processId > 0 && suspect.connectionCount > 0),
    ),
    collectedAt: new Date().toISOString(),
  };
};

export const getAppNetworkSuspects = async () => {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', appNetworkSuspectsCommand],
      {
        windowsHide: true,
        timeout: 12000,
        maxBuffer: 1024 * 1024,
      },
    );

    return parseAppNetworkSuspects(stdout);
  } catch (error) {
    const message = error.stderr?.trim() || error.message || 'Unknown PowerShell error.';
    throw new Error(`Failed to detect active app network connections: ${message}`);
  }
};
