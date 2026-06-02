import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const historyFileName = 'quotalens-history.json';

let historyFilePath;

const emptyHistory = () => ({
  sessions: [],
});

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toSafeTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const isSameLocalDay = (left, right = new Date()) => {
  const leftDate = new Date(left);

  return (
    leftDate.getFullYear() === right.getFullYear() &&
    leftDate.getMonth() === right.getMonth() &&
    leftDate.getDate() === right.getDate()
  );
};

export const getHistoryFilePath = () => {
  if (!historyFilePath) {
    throw new Error('History store has not been initialized.');
  }

  return historyFilePath;
};

const writeHistoryData = async (history) => {
  const filePath = getHistoryFilePath();
  const tempFilePath = `${filePath}.tmp`;
  const json = `${JSON.stringify(history, null, 2)}\n`;

  await writeFile(tempFilePath, json, 'utf8');
  await rename(tempFilePath, filePath);
};

const backupCorruptHistory = async () => {
  const filePath = getHistoryFilePath();
  const corruptPath = path.join(
    path.dirname(filePath),
    `quotalens-history.corrupt-${toSafeTimestamp()}.json`,
  );

  await copyFile(filePath, corruptPath);
  await writeHistoryData(emptyHistory());
};

export const initializeHistoryStore = async (userDataPath) => {
  await mkdir(userDataPath, { recursive: true });
  historyFilePath = path.join(userDataPath, historyFileName);

  try {
    await access(historyFilePath);
  } catch {
    await writeHistoryData(emptyHistory());
  }
};

export const readHistory = async () => {
  const filePath = getHistoryFilePath();

  try {
    const content = await readFile(filePath, 'utf8');
    const history = JSON.parse(content);

    if (!history || !Array.isArray(history.sessions)) {
      throw new Error('Invalid history schema.');
    }

    return history;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeHistoryData(emptyHistory());
      return emptyHistory();
    }

    await backupCorruptHistory();
    return emptyHistory();
  }
};

export const writeHistory = async (history) => {
  const sessions = Array.isArray(history.sessions) ? history.sessions : [];
  await writeHistoryData({ sessions });
};

export const addCompletedSession = async (session) => {
  const history = await readHistory();
  const completedSession = {
    id: session.id || createId(),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    adapterName: session.adapterName,
    receivedBytes: session.receivedBytes,
    sentBytes: session.sentBytes,
    totalBytes: session.totalBytes,
  };

  history.sessions.push(completedSession);
  await writeHistory(history);

  return completedSession;
};

export const getHistory = async () => {
  const history = await readHistory();

  return history.sessions
    .slice()
    .sort((left, right) => new Date(right.endedAt) - new Date(left.endedAt));
};

export const getTodayHistory = async () => {
  const sessions = await getHistory();

  return sessions.filter((session) => isSameLocalDay(session.endedAt));
};

export const getTodayUsage = async () => {
  const sessions = await getTodayHistory();

  return sessions.reduce(
    (total, session) => ({
      receivedBytes: total.receivedBytes + (session.receivedBytes || 0),
      sentBytes: total.sentBytes + (session.sentBytes || 0),
      totalBytes: total.totalBytes + (session.totalBytes || 0),
      sessionsCount: total.sessionsCount + 1,
    }),
    {
      receivedBytes: 0,
      sentBytes: 0,
      totalBytes: 0,
      sessionsCount: 0,
    },
  );
};

export const clearHistory = async () => {
  await writeHistory(emptyHistory());
  return emptyHistory();
};
