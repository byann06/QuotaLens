const fiveMinutesMs = 5 * 60 * 1000;
const fallbackSampleCount = 10;

const toNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const getSortedSamples = (samples) =>
  (Array.isArray(samples) ? samples : [])
    .filter((sample) => !Number.isNaN(new Date(sample.timestamp).getTime()))
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

const getSamplesSinceLastSessionReset = (samples) => {
  const sortedSamples = getSortedSamples(samples);
  let resetIndex = 0;

  for (let index = 1; index < sortedSamples.length; index += 1) {
    if (toNumber(sortedSamples[index].sessionTotalBytes) < toNumber(sortedSamples[index - 1].sessionTotalBytes)) {
      resetIndex = index;
    }
  }

  return sortedSamples.slice(resetIndex);
};

const getObservedSamples = (samples) => {
  const sortedSamples = getSamplesSinceLastSessionReset(samples);

  if (sortedSamples.length <= 1) {
    return sortedSamples;
  }

  const latestSample = sortedSamples.at(-1);
  const latestTime = new Date(latestSample.timestamp).getTime();
  const recentSamples = sortedSamples.filter(
    (sample) => latestTime - new Date(sample.timestamp).getTime() <= fiveMinutesMs,
  );

  if (recentSamples.length >= 2) {
    return recentSamples;
  }

  return sortedSamples.slice(-fallbackSampleCount);
};

const calculateWindow = (samples) => {
  const observedSamples = getObservedSamples(samples);

  if (observedSamples.length < 2) {
    return {
      deltaTotalBytes: 0,
      deltaReceivedBytes: 0,
      deltaSentBytes: 0,
      durationSeconds: 0,
      averageBytesPerSecond: 0,
      observedWindowSeconds: 0,
      sampleCount: observedSamples.length,
    };
  }

  const firstSample = observedSamples[0];
  const lastSample = observedSamples.at(-1);
  const durationSeconds = Math.max(
    1,
    Math.round((new Date(lastSample.timestamp) - new Date(firstSample.timestamp)) / 1000),
  );
  const deltaTotalBytes = Math.max(
    0,
    toNumber(lastSample.sessionTotalBytes) - toNumber(firstSample.sessionTotalBytes),
  );
  const deltaReceivedBytes = Math.max(
    0,
    toNumber(lastSample.sessionReceivedBytes) - toNumber(firstSample.sessionReceivedBytes),
  );
  const deltaSentBytes = Math.max(
    0,
    toNumber(lastSample.sessionSentBytes) - toNumber(firstSample.sessionSentBytes),
  );

  return {
    deltaTotalBytes,
    deltaReceivedBytes,
    deltaSentBytes,
    durationSeconds,
    averageBytesPerSecond: deltaTotalBytes / durationSeconds,
    observedWindowSeconds: durationSeconds,
    sampleCount: observedSamples.length,
  };
};

const getBaseScore = (appKind) => {
  if (['steam', 'epicgameslauncher'].includes(appKind)) {
    return 35;
  }

  if (['chrome', 'msedge', 'firefox', 'brave'].includes(appKind)) {
    return 25;
  }

  if (appKind === 'onedrive') {
    return 25;
  }

  if (['telegram', 'whatsapp', 'discord'].includes(appKind)) {
    return 16;
  }

  if (appKind === 'spotify') {
    return 18;
  }

  if (['svchost', 'system'].includes(appKind)) {
    return 22;
  }

  if (['code', 'codex', 'node', 'powershell'].includes(appKind)) {
    return 15;
  }

  return 10;
};

const getDeltaScore = (deltaTotalBytes) => {
  const megabytes = deltaTotalBytes / 1024 / 1024;

  if (megabytes >= 500) {
    return 30;
  }

  if (megabytes >= 100) {
    return 22;
  }

  if (megabytes >= 25) {
    return 14;
  }

  if (megabytes >= 5) {
    return 7;
  }

  return 0;
};

const getConnectionScore = (connectionCount) => Math.min(20, Math.max(0, connectionCount) * 2);

const getPatternScore = (suspect, windowSummary) => {
  const { deltaTotalBytes, deltaReceivedBytes, deltaSentBytes } = windowSummary;
  const deltaMegabytes = deltaTotalBytes / 1024 / 1024;
  const uploadRatio = deltaTotalBytes > 0 ? deltaSentBytes / deltaTotalBytes : 0;
  const downloadRatio = deltaTotalBytes > 0 ? deltaReceivedBytes / deltaTotalBytes : 0;

  if (['steam', 'epicgameslauncher'].includes(suspect.appKind)) {
    return deltaMegabytes >= 50 ? 22 : 10;
  }

  if (['chrome', 'msedge', 'firefox', 'brave'].includes(suspect.appKind)) {
    return deltaMegabytes >= 25 ? 15 : 6;
  }

  if (suspect.appKind === 'onedrive') {
    return uploadRatio >= 0.35 || deltaMegabytes >= 25 ? 20 : 8;
  }

  if (suspect.appKind === 'spotify') {
    return downloadRatio >= 0.55 && deltaMegabytes >= 5 ? 10 : 5;
  }

  if (['telegram', 'whatsapp', 'discord'].includes(suspect.appKind)) {
    return deltaMegabytes >= 20 ? 10 : 5;
  }

  if (['svchost', 'system'].includes(suspect.appKind)) {
    return deltaMegabytes >= 50 ? 16 : 8;
  }

  if (['code', 'codex', 'node', 'powershell'].includes(suspect.appKind)) {
    return suspect.connectionCount >= 8 || deltaMegabytes >= 25 ? 12 : 5;
  }

  return suspect.connectionCount >= 6 ? 8 : 3;
};

const clampScore = (score) => Math.max(0, Math.min(100, Math.round(score)));

const getConfidence = (score) => {
  if (score >= 70) {
    return 'high';
  }

  if (score >= 40) {
    return 'medium';
  }

  return 'low';
};

const impactLabels = {
  high: {
    id: 'Tinggi',
    en: 'High',
  },
  medium: {
    id: 'Sedang',
    en: 'Medium',
  },
  low: {
    id: 'Rendah',
    en: 'Low',
  },
};

const reasons = {
  gameLauncherLargeDelta: {
    id: 'Game launcher aktif saat lonjakan pemakaian terjadi. Download atau update game bisa memakai kuota besar.',
    en: 'A game launcher is active while usage is rising. Game downloads or updates can use a lot of data.',
  },
  browserDelta: {
    id: 'Browser aktif saat pemakaian naik. Tab streaming, download, atau website aktif bisa menjadi penyebab.',
    en: 'A browser is active while usage is rising. Streaming tabs, downloads, or active websites may be involved.',
  },
  cloudUpload: {
    id: 'Aplikasi sinkronisasi cloud aktif dan ada indikasi upload. Sinkronisasi file bisa menaikkan pemakaian.',
    en: 'A cloud sync app is active and upload is visible. File syncing may increase usage.',
  },
  chatActive: {
    id: 'Aplikasi chat aktif. Media, panggilan, atau file yang sedang dimuat bisa memakai internet.',
    en: 'A chat app is active. Media, calls, or loaded files may use internet.',
  },
  spotifyActive: {
    id: 'Spotify aktif. Streaming atau memuat lagu bisa memakai internet.',
    en: 'Spotify is active. Streaming or loading songs may use internet.',
  },
  windowsService: {
    id: 'Layanan Windows aktif. Ini bisa terkait update, DNS, Defender, atau layanan jaringan lain.',
    en: 'A Windows service is active. It may be related to updates, DNS, Defender, or other network services.',
  },
  developmentTool: {
    id: 'Tool development aktif. Koneksi bisa berasal dari dev server, package tooling, sync, atau request layanan.',
    en: 'A development tool is active. Connections may come from dev servers, package tooling, sync, or service requests.',
  },
  manyConnections: {
    id: 'Aplikasi ini punya beberapa koneksi aktif saat pemakaian naik, jadi layak diperiksa.',
    en: 'This app has several active connections while usage is rising, so it is worth checking.',
  },
  lowActivity: {
    id: 'Aplikasi ini aktif di jaringan, tetapi bukti lonjakan pemakaian masih rendah.',
    en: 'This app is active on the network, but evidence of a usage spike is still low.',
  },
};

const getReasonKey = (suspect, windowSummary, confidence) => {
  const deltaMegabytes = windowSummary.deltaTotalBytes / 1024 / 1024;
  const uploadRatio =
    windowSummary.deltaTotalBytes > 0 ? windowSummary.deltaSentBytes / windowSummary.deltaTotalBytes : 0;

  if (['steam', 'epicgameslauncher'].includes(suspect.appKind) && deltaMegabytes >= 25) {
    return 'gameLauncherLargeDelta';
  }

  if (['chrome', 'msedge', 'firefox', 'brave'].includes(suspect.appKind) && deltaMegabytes >= 5) {
    return 'browserDelta';
  }

  if (suspect.appKind === 'onedrive' && (uploadRatio >= 0.25 || deltaMegabytes >= 10)) {
    return 'cloudUpload';
  }

  if (suspect.appKind === 'spotify') {
    return 'spotifyActive';
  }

  if (['telegram', 'whatsapp', 'discord'].includes(suspect.appKind)) {
    return 'chatActive';
  }

  if (['svchost', 'system'].includes(suspect.appKind)) {
    return 'windowsService';
  }

  if (['code', 'codex', 'node', 'powershell'].includes(suspect.appKind)) {
    return 'developmentTool';
  }

  if (confidence !== 'low' || suspect.connectionCount >= 4) {
    return 'manyConnections';
  }

  return 'lowActivity';
};

const estimateSuspect = (suspect, windowSummary) => {
  const score = clampScore(
    getBaseScore(suspect.appKind) +
      getDeltaScore(windowSummary.deltaTotalBytes) +
      getConnectionScore(suspect.connectionCount) +
      getPatternScore(suspect, windowSummary),
  );
  const confidence = getConfidence(score);
  const reasonKey = getReasonKey(suspect, windowSummary, confidence);
  const processNames = Array.isArray(suspect.technicalDetails?.processNames)
    ? suspect.technicalDetails.processNames
    : [suspect.processName].filter(Boolean);

  return {
    friendlyName: suspect.friendlyName,
    category: suspect.category,
    appKind: suspect.appKind,
    processNames,
    confidence,
    confidenceScore: score,
    estimatedImpactLabel: impactLabels[confidence],
    reason: reasons[reasonKey],
    reasonKey,
    deltaTotalBytes: windowSummary.deltaTotalBytes,
    observedWindowSeconds: windowSummary.observedWindowSeconds,
  };
};

export const estimateAppUsage = ({ usageSamples, appSuspects }) => {
  const windowSummary = calculateWindow(usageSamples);
  const suspects = Array.isArray(appSuspects?.suspects) ? appSuspects.suspects : [];

  if (windowSummary.sampleCount < 2) {
    return {
      window: windowSummary,
      estimates: [],
      status: 'not_enough_samples',
      message: {
        id: 'Belum cukup data untuk membuat estimasi. Gunakan internet beberapa menit agar QuotaLens mengumpulkan sample.',
        en: 'Not enough data to estimate yet. Use the internet for a few minutes so QuotaLens can collect samples.',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  if (windowSummary.deltaTotalBytes === 0) {
    return {
      window: windowSummary,
      estimates: [],
      status: 'no_usage_increase',
      message: {
        id: 'Belum ada kenaikan pemakaian yang terdeteksi pada rentang pengamatan.',
        en: 'No usage increase detected in the observation window yet.',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  if (suspects.length === 0) {
    return {
      window: windowSummary,
      estimates: [],
      status: 'no_app_suspects',
      message: {
        id: 'Belum ada aplikasi aktif yang terdeteksi untuk dibandingkan dengan lonjakan pemakaian.',
        en: 'No active apps were detected to compare against the usage increase.',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  const estimates = suspects
    .map((suspect) => estimateSuspect(suspect, windowSummary))
    .sort((left, right) => right.confidenceScore - left.confidenceScore);

  return {
    window: windowSummary,
    estimates,
    status: 'ready',
    generatedAt: new Date().toISOString(),
  };
};
