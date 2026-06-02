import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const normalizeKey = (key) => key.trim().toLowerCase();

const parseNetshOutput = (stdout) => {
  const wifiInfo = {
    ssid: '',
    state: 'unknown',
    signal: '',
    interfaceName: '',
  };

  stdout.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);

    if (!match) {
      return;
    }

    const [, rawKey, value] = match;
    const key = normalizeKey(rawKey);

    if (key === 'name' && !wifiInfo.interfaceName) {
      wifiInfo.interfaceName = value;
    }

    if (key === 'state') {
      wifiInfo.state = value;
    }

    if (key === 'ssid') {
      wifiInfo.ssid = value;
    }

    if (key === 'signal') {
      wifiInfo.signal = value;
    }
  });

  return {
    ...wifiInfo,
    connected: /connected/i.test(wifiInfo.state),
    collectedAt: new Date().toISOString(),
  };
};

export const getWifiInfo = async () => {
  try {
    const { stdout } = await execFileAsync('netsh.exe', ['wlan', 'show', 'interfaces'], {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });

    return parseNetshOutput(stdout);
  } catch (error) {
    const message = error.stderr?.trim() || error.message || 'Unknown netsh error.';
    throw new Error(`Failed to read Windows Wi-Fi information: ${message}`);
  }
};
