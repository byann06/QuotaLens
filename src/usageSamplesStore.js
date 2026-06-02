import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const samplesFileName = 'quotalens-usage-samples.json';
const maxSamples = 1000;

let samplesFilePath;

const emptySamples = () => ({
  samples: [],
});

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toSafeTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const toNonNegativeBytes = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.round(numericValue);
};

const normalizeSample = (sample = {}) => ({
  id: sample.id || createId(),
  timestamp: sample.timestamp || new Date().toISOString(),
  ssid: String(sample.ssid ?? '').trim(),
  adapterName: String(sample.adapterName ?? '').trim(),
  sessionTotalBytes: toNonNegativeBytes(sample.sessionTotalBytes),
  sessionReceivedBytes: toNonNegativeBytes(sample.sessionReceivedBytes),
  sessionSentBytes: toNonNegativeBytes(sample.sessionSentBytes),
  todayTotalBytes: toNonNegativeBytes(sample.todayTotalBytes),
});

const normalizeSamples = (samples) =>
  (Array.isArray(samples) ? samples : [])
    .map(normalizeSample)
    .filter((sample) => !Number.isNaN(new Date(sample.timestamp).getTime()))
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
    .slice(-maxSamples);

export const getUsageSamplesFilePath = () => {
  if (!samplesFilePath) {
    throw new Error('Usage samples store has not been initialized.');
  }

  return samplesFilePath;
};

const writeSamplesData = async (samplesData) => {
  const filePath = getUsageSamplesFilePath();
  const tempFilePath = `${filePath}.tmp`;
  const json = `${JSON.stringify({ samples: normalizeSamples(samplesData.samples) }, null, 2)}\n`;

  await writeFile(tempFilePath, json, 'utf8');
  await rename(tempFilePath, filePath);
};

const backupCorruptSamples = async () => {
  const filePath = getUsageSamplesFilePath();
  const corruptPath = path.join(
    path.dirname(filePath),
    `quotalens-usage-samples.corrupt-${toSafeTimestamp()}.json`,
  );

  await copyFile(filePath, corruptPath);
  await writeSamplesData(emptySamples());
};

export const initializeUsageSamplesStore = async (userDataPath) => {
  await mkdir(userDataPath, { recursive: true });
  samplesFilePath = path.join(userDataPath, samplesFileName);

  try {
    await access(samplesFilePath);
  } catch {
    await writeSamplesData(emptySamples());
  }
};

export const readUsageSamples = async () => {
  const filePath = getUsageSamplesFilePath();

  try {
    const content = await readFile(filePath, 'utf8');
    const samplesData = JSON.parse(content);

    if (!samplesData || !Array.isArray(samplesData.samples)) {
      throw new Error('Invalid usage samples schema.');
    }

    const normalizedSamples = normalizeSamples(samplesData.samples);

    if (JSON.stringify(samplesData.samples) !== JSON.stringify(normalizedSamples)) {
      await writeSamplesData({ samples: normalizedSamples });
    }

    return { samples: normalizedSamples };
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeSamplesData(emptySamples());
      return emptySamples();
    }

    await backupCorruptSamples();
    return emptySamples();
  }
};

export const addUsageSample = async (sample) => {
  const samplesData = await readUsageSamples();
  const usageSample = normalizeSample(sample);
  const samples = normalizeSamples([...samplesData.samples, usageSample]);

  await writeSamplesData({ samples });

  return usageSample;
};

export const getUsageSamples = async () => {
  const samplesData = await readUsageSamples();

  return samplesData.samples.slice().sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
};

export const clearUsageSamples = async () => {
  await writeSamplesData(emptySamples());
  return emptySamples();
};
