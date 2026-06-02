import { getNetworkStats } from './networkStats';

let baseline = null;

const createBaseline = (adapter, startedAt = new Date().toISOString()) => ({
  adapterName: adapter.name,
  baselineReceivedBytes: adapter.receivedBytes,
  baselineSentBytes: adapter.sentBytes,
  baselineTotalBytes: adapter.totalBytes,
  startedAt,
});

const hasCounterReset = (adapter) =>
  !baseline ||
  adapter.name !== baseline.adapterName ||
  adapter.receivedBytes < baseline.baselineReceivedBytes ||
  adapter.sentBytes < baseline.baselineSentBytes ||
  adapter.totalBytes < baseline.baselineTotalBytes;

const buildSessionUsage = (adapter, updatedAt) => ({
  sessionReceivedBytes: Math.max(0, adapter.receivedBytes - baseline.baselineReceivedBytes),
  sessionSentBytes: Math.max(0, adapter.sentBytes - baseline.baselineSentBytes),
  sessionTotalBytes: Math.max(0, adapter.totalBytes - baseline.baselineTotalBytes),
  startedAt: baseline.startedAt,
  updatedAt,
  adapterName: adapter.name,
  rawReceivedBytes: adapter.receivedBytes,
  rawSentBytes: adapter.sentBytes,
  rawTotalBytes: adapter.totalBytes,
});

export const getSessionUsage = async () => {
  const networkStats = await getNetworkStats();
  const { adapter } = networkStats;

  if (hasCounterReset(adapter)) {
    baseline = createBaseline(adapter);
  }

  return buildSessionUsage(adapter, networkStats.collectedAt);
};

export const resetSession = async () => {
  const networkStats = await getNetworkStats();
  const resetAt = new Date().toISOString();

  baseline = createBaseline(networkStats.adapter, resetAt);

  return buildSessionUsage(networkStats.adapter, resetAt);
};
