import './index.css';
import { formatTranslation, normalizeLanguage, translate } from './i18n';

const app = document.querySelector('#app');

const refreshIntervalOptions = [5000, 15000, 30000];
const suspectsRefreshIntervalMs = 30000;
const bytesPerGb = 1024 * 1024 * 1024;
const fallbackSettings = {
  dailyLimitBytes: 2147483648,
  sessionLimitBytes: 1073741824,
  notificationsEnabled: true,
  monitoredSsids: [],
  autoResetOnSsidChange: true,
  monitorOnlyListedSsids: false,
  launchAtStartup: false,
  startMinimizedToTray: false,
  language: 'id',
};

let currentLanguage = fallbackSettings.language;

const t = (key) => translate(currentLanguage, key);
const tf = (key, values = {}) => formatTranslation(currentLanguage, key, values);

const formatInteger = (value) =>
  new Intl.NumberFormat(currentLanguage === 'id' ? 'id-ID' : 'en-US').format(value ?? 0);

const formatUsage = (bytes) => {
  const safeBytes = Number.isFinite(bytes) ? bytes : 0;
  const megabytes = safeBytes / 1024 / 1024;

  if (megabytes >= 1024) {
    return `${(megabytes / 1024).toFixed(2)} GB`;
  }

  return `${megabytes.toFixed(2)} MB`;
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString(currentLanguage === 'id' ? 'id-ID' : 'en-US');
};

const toFriendlyError = (message) => {
  const text = String(message || t('error.unknown'));

  if (/Access denied/i.test(text)) {
    return t('error.accessDenied');
  }

  if (/Get-NetAdapterStatistics/i.test(text)) {
    return t('error.networkStats');
  }

  if (/netsh|Wi-Fi|wlan/i.test(text)) {
    return t('error.wifiInfo');
  }

  if (/Get-NetTCPConnection|active app network|TCP/i.test(text)) {
    return t('error.appSuspects');
  }

  if (/estimate app usage|usage impact/i.test(text)) {
    return t('error.appEstimates');
  }

  if (/real per-app|per-app usage|native per-app|ETW|WFP|SRUM/i.test(text)) {
    return t('error.realPerAppUsage');
  }

  if (/preload API/i.test(text)) {
    return t('error.preloadApi');
  }

  return text;
};

const bytesToGbInput = (bytes) => (bytes / bytesPerGb).toFixed(2).replace(/\.?0+$/, '');

const gbInputToBytes = (value, fallbackBytes) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallbackBytes;
  }

  return Math.round(numericValue * bytesPerGb);
};

const getLimitStatus = (usageBytes, limitBytes) => {
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) {
    return 'Safe';
  }

  const usageRatio = usageBytes / limitBytes;

  if (usageRatio >= 1) {
    return 'Exceeded';
  }

  if (usageRatio >= 0.8) {
    return 'Warning';
  }

  return 'Safe';
};

const getOverallLimitStatus = (dailyStatus, sessionStatus) => {
  if (dailyStatus === 'Exceeded' || sessionStatus === 'Exceeded') {
    return 'Exceeded';
  }

  if (dailyStatus === 'Warning' || sessionStatus === 'Warning') {
    return 'Warning';
  }

  return 'Safe';
};

const normalizeSsid = (ssid) => String(ssid ?? '').trim();

const isSsidMonitored = (ssid, settings) => {
  const currentSsid = normalizeSsid(ssid);

  if (!settings.monitorOnlyListedSsids) {
    return true;
  }

  if (!currentSsid) {
    return false;
  }

  return settings.monitoredSsids.some(
    (monitoredSsid) => monitoredSsid.toLowerCase() === currentSsid.toLowerCase(),
  );
};

const translateWifiState = (state) => {
  const normalizedState = String(state || '').toLowerCase();

  if (normalizedState.includes('disconnected')) {
    return t('status.disconnected');
  }

  if (normalizedState.includes('connected')) {
    return t('status.connected');
  }

  return state || '';
};

const isSameLocalDay = (value, reference = new Date()) => {
  const date = new Date(value);

  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
};

const formatShortTime = (value) =>
  new Date(value).toLocaleTimeString(currentLanguage === 'id' ? 'id-ID' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow" data-i18n="app.tagline">Pemantau Kuota Desktop</p>
        <h1>QuotaLens</h1>
      </div>
      <div class="connection-pill" id="statusPill">
        <span class="status-dot"></span>
        <span id="statusText">Memuat sesi</span>
      </div>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <p class="section-label" data-i18n="hero.activeConnection">Koneksi Aktif</p>
        <h2 id="adapterName">Membaca koneksi...</h2>
        <p class="hero-text" data-i18n="hero.description">
          Pantau pemakaian hotspot dari sesi aktif, batas harian, dan Wi-Fi yang sedang tersambung.
        </p>
        <div class="wifi-summary">
          <div>
            <span data-i18n="metric.currentWifi">Wi-Fi Saat Ini</span>
            <strong id="wifiSsid">Mendeteksi...</strong>
          </div>
          <div>
            <span data-i18n="metric.wifiState">Status Wi-Fi</span>
            <strong id="wifiState">-</strong>
          </div>
          <div>
            <span data-i18n="metric.signal">Sinyal</span>
            <strong id="wifiSignal">-</strong>
          </div>
        </div>
        <div class="toolbar">
          <button class="refresh-button" data-i18n="button.refreshStats" id="refreshButton" type="button">Segarkan Statistik</button>
          <button class="secondary-button" data-i18n="button.resetSession" id="resetButton" type="button">Reset Sesi</button>
          <button class="secondary-button" id="monitoringButton" type="button">Jeda Monitoring</button>
          <label class="interval-control">
            <span data-i18n="label.refresh">Segarkan</span>
            <select id="intervalSelect">
              <option data-i18n="label.fiveSeconds" value="5000">5 detik</option>
              <option data-i18n="label.fifteenSeconds" value="15000" selected>15 detik</option>
              <option data-i18n="label.thirtySeconds" value="30000">30 detik</option>
            </select>
          </label>
          <span class="last-updated" data-i18n="label.waitingRefresh" id="lastUpdated">Menunggu penyegaran pertama</span>
        </div>
      </div>
      <div class="limit-panel">
        <span data-i18n="metric.todayUsage">Pemakaian Hari Ini</span>
        <strong id="totalUsage">0 MB</strong>
      </div>
    </section>

    <p class="error-message" id="errorMessage" role="alert"></p>

    <section class="stats-grid" aria-live="polite">
      <article class="stat-card">
        <span data-i18n="metric.todayUsage">Pemakaian Hari Ini</span>
        <strong id="todayUsage">0 MB</strong>
      </article>
      <article class="stat-card">
        <span data-i18n="metric.currentSession">Sesi Saat Ini</span>
        <strong id="sessionUsage">0 MB</strong>
      </article>
      <article class="stat-card">
        <span data-i18n="metric.currentWifi">Wi-Fi Saat Ini</span>
        <strong id="primaryWifiSsid">Mendeteksi...</strong>
      </article>
      <article class="stat-card limit-status-card">
        <span data-i18n="metric.limitStatus">Status Batas</span>
        <strong id="limitStatus">Aman</strong>
        <small id="limitStatusDetail">Harian Aman / Sesi Aman</small>
      </article>
    </section>

    <section class="details-panel">
      <div>
        <span data-i18n="metric.startedAt">Mulai Pada</span>
        <strong id="startedAt">-</strong>
      </div>
      <div>
        <span data-i18n="metric.rawReceivedBytes">Byte Diterima Mentah</span>
        <strong id="rawReceivedBytes">0</strong>
      </div>
      <div>
        <span data-i18n="metric.rawSentBytes">Byte Dikirim Mentah</span>
        <strong id="rawSentBytes">0</strong>
      </div>
      <div>
        <span data-i18n="metric.rawTotalBytes">Total Byte Mentah</span>
        <strong id="rawTotalBytes">0</strong>
      </div>
      <div>
        <span data-i18n="metric.sessionDownload">Unduhan Sesi</span>
        <strong id="downloadSession">0 MB</strong>
      </div>
      <div>
        <span data-i18n="metric.sessionUpload">Unggahan Sesi</span>
        <strong id="uploadSession">0 MB</strong>
      </div>
      <div>
        <span data-i18n="metric.wifiInterface">Interface Wi-Fi</span>
        <strong id="wifiInterfaceName">-</strong>
      </div>
      <div>
        <span data-i18n="metric.networkTarget">Target Jaringan</span>
        <strong id="networkTargetStatus">Monitoring aktif</strong>
      </div>
    </section>

    <section class="chart-panel">
      <div class="chart-header">
        <div>
          <p class="section-label" data-i18n="chart.title">Grafik Pemakaian</p>
          <h3 data-i18n="chart.subtitle">Pemakaian sesi dari waktu ke waktu</h3>
        </div>
        <div class="chart-actions">
          <label class="chart-filter">
            <span data-i18n="chart.filter">Filter Grafik</span>
            <select id="chartFilterSelect">
              <option data-i18n="label.sample30" value="30">30 sample terakhir</option>
              <option data-i18n="label.sample100" value="100">100 sample terakhir</option>
              <option data-i18n="label.today" value="today">Hari ini</option>
            </select>
          </label>
          <button class="danger-button" data-i18n="button.clearChartData" id="clearChartButton" type="button">Hapus Data Grafik</button>
        </div>
      </div>
      <div class="chart-summary">
        <div>
          <span data-i18n="chart.totalSamples">Total Sample</span>
          <strong id="chartTotalSamples">0</strong>
        </div>
        <div>
          <span data-i18n="chart.peakUsage">Pemakaian Tertinggi</span>
          <strong id="chartPeakUsage">0 MB</strong>
        </div>
        <div>
          <span data-i18n="chart.monitoredSsid">SSID yang Dipantau</span>
          <strong id="chartMonitoredSsid">-</strong>
        </div>
      </div>
      <div class="usage-chart-canvas" id="usageChartCanvas"></div>
      <p class="settings-note" id="chartNote"></p>
    </section>

    <section class="suspects-panel">
      <div class="suspects-header">
        <div>
          <p class="section-label" data-i18n="suspects.title">Aplikasi yang Sedang Terhubung ke Internet</p>
          <h3 data-i18n="suspects.subtitle">Koneksi aktif per proses</h3>
        </div>
        <button class="secondary-button" data-i18n="button.refreshSuspects" id="refreshSuspectsButton" type="button">Segarkan Tersangka</button>
      </div>
      <p class="suspects-note" data-i18n="suspects.note">
        Panel ini belum menghitung pemakaian MB/GB per aplikasi. Ini hanya menunjukkan aplikasi yang sedang punya koneksi internet aktif.
      </p>
      <div class="suspects-list" id="suspectsList">
        <p class="history-empty" data-i18n="suspects.notRefreshed">Daftar tersangka belum disegarkan.</p>
      </div>
      <p class="settings-note" id="suspectsStatus">-</p>
    </section>

    <section class="estimates-panel">
      <div class="estimates-header">
        <div>
          <p class="section-label" data-i18n="estimates.title">Perkiraan Penyebab Pemakaian Kuota</p>
          <h3 data-i18n="estimates.subtitle">Estimasi dari lonjakan total dan aplikasi aktif</h3>
        </div>
        <button class="secondary-button" data-i18n="button.refreshEstimates" id="refreshEstimatesButton" type="button">Segarkan Estimasi</button>
      </div>
      <p class="estimates-note" data-i18n="estimates.note">
        Ini adalah estimasi berdasarkan lonjakan total pemakaian dan aplikasi yang sedang aktif. Ini belum menjadi hitungan kuota per aplikasi yang akurat.
      </p>
      <div class="estimate-summary">
        <div>
          <span data-i18n="estimates.totalIncrease">Kenaikan total pada periode ini</span>
          <strong id="estimateDeltaUsage">0 MB</strong>
        </div>
        <div>
          <span data-i18n="estimates.observationDuration">Durasi Pengamatan</span>
          <strong id="estimateDuration">0 detik</strong>
        </div>
        <div>
          <span data-i18n="estimates.averageSpeed">Kecepatan Rata-rata</span>
          <strong id="estimateAverageSpeed">0 MB/detik</strong>
        </div>
      </div>
      <div class="estimates-list" id="estimatesList">
        <p class="history-empty" data-i18n="estimates.notGenerated">Estimasi belum dibuat.</p>
      </div>
      <p class="estimates-footnote" data-i18n="estimates.totalIncreaseNote">
        Angka kenaikan data adalah total pemakaian selama periode pengamatan, bukan pembagian kuota per aplikasi.
      </p>
      <p class="settings-note" id="estimatesStatus">-</p>
    </section>

    <section class="per-app-panel">
      <div class="per-app-header">
        <div>
          <p class="section-label" data-i18n="perApp.title">Pemakaian Kuota per Aplikasi (Eksperimental)</p>
          <h3 data-i18n="perApp.subtitle">Prototype pembacaan byte per proses</h3>
        </div>
        <button class="secondary-button" data-i18n="button.refreshPerAppUsage" id="refreshRealPerAppUsageButton" type="button">Segarkan Per Aplikasi</button>
      </div>
      <p class="per-app-note" data-i18n="perApp.note">
        Panel ini hanya menampilkan data MB/GB per aplikasi jika helper native punya sumber data byte yang valid.
      </p>
      <div class="per-app-summary">
        <div>
          <span data-i18n="perApp.status">Status</span>
          <strong id="realPerAppUsageStatus">-</strong>
        </div>
        <div>
          <span data-i18n="perApp.sourceMethod">Metode Sumber</span>
          <strong id="realPerAppUsageSource">-</strong>
        </div>
        <div>
          <span data-i18n="perApp.accessStatus">Status Akses SRUM</span>
          <strong id="realPerAppAccessStatus">-</strong>
        </div>
        <div>
          <span data-i18n="perApp.parseStatus">Status Parser</span>
          <strong id="realPerAppParseStatus">-</strong>
        </div>
      </div>
      <p class="per-app-unsupported" id="realPerAppUsageReason"></p>
      <div class="per-app-list" id="realPerAppUsageList">
        <p class="history-empty" data-i18n="perApp.notRefreshed">Pemakaian per aplikasi belum dicek.</p>
      </div>
      <p class="settings-note" id="realPerAppUsageNote">-</p>
    </section>

    <section class="history-panel">
      <div class="history-header">
        <div>
          <p class="section-label" data-i18n="history.title">Riwayat Lokal</p>
          <h3 data-i18n="history.recentSessions">Sesi Terbaru</h3>
        </div>
        <button class="danger-button" data-i18n="button.clearHistory" id="clearHistoryButton" type="button">Hapus Riwayat</button>
      </div>
      <div class="history-list" id="historyList">
        <p class="history-empty" data-i18n="history.empty">Belum ada sesi yang selesai.</p>
      </div>
    </section>

    <section class="settings-panel">
      <div class="settings-header">
        <div>
          <p class="section-label" data-i18n="settings.title">Pengaturan</p>
          <h3 data-i18n="settings.limitWarning">Peringatan Batas</h3>
        </div>
        <button class="refresh-button" data-i18n="button.saveSettings" id="saveSettingsButton" type="button">Simpan Pengaturan</button>
      </div>
      <div class="settings-grid">
        <label>
          <span data-i18n="settings.dailyLimit">Batas Harian (GB)</span>
          <input id="dailyLimitInput" min="0.1" step="0.1" type="number" />
        </label>
        <label>
          <span data-i18n="settings.sessionLimit">Batas Sesi (GB)</span>
          <input id="sessionLimitInput" min="0.1" step="0.1" type="number" />
        </label>
        <label>
          <span data-i18n="settings.language">Bahasa</span>
          <select id="languageSelect">
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
          </select>
        </label>
        <label class="toggle-control">
          <input id="notificationsEnabledInput" type="checkbox" />
          <span data-i18n="settings.notificationsEnabled">Notifikasi Aktif</span>
        </label>
        <label class="toggle-control">
          <input id="monitorOnlyListedInput" type="checkbox" />
          <span data-i18n="settings.monitorOnlyListedSsids">Monitor Hanya SSID Terdaftar</span>
        </label>
        <label class="toggle-control">
          <input id="autoResetOnSsidChangeInput" type="checkbox" />
          <span data-i18n="settings.autoResetOnSsidChange">Reset Otomatis Saat SSID Berubah</span>
        </label>
      </div>
      <div class="ssid-settings">
        <div class="ssid-settings-header">
          <span data-i18n="settings.monitoredSsids">SSID yang Dimonitor</span>
          <button class="secondary-button" data-i18n="button.addCurrentSsid" id="addCurrentSsidButton" type="button">Tambah SSID Saat Ini</button>
        </div>
        <div class="ssid-list" id="monitoredSsidList">
          <p class="history-empty" data-i18n="settings.noMonitoredSsids">Belum ada SSID yang dimonitor.</p>
        </div>
      </div>
      <p class="settings-note" data-i18n="settings.savedLocal" id="settingsNote">Pengaturan tersimpan lokal di profil Windows ini.</p>
    </section>

    <section class="settings-panel">
      <div class="settings-header">
        <div>
          <p class="section-label" data-i18n="startup.appBehavior">Perilaku Aplikasi</p>
          <h3 data-i18n="startup.title">Startup</h3>
        </div>
        <button class="refresh-button" data-i18n="button.saveStartupSettings" id="saveStartupButton" type="button">Simpan Pengaturan Startup</button>
      </div>
      <div class="settings-grid startup-grid">
        <label class="toggle-control">
          <input id="launchAtStartupInput" type="checkbox" />
          <span data-i18n="startup.startWithWindows">Mulai Bersama Windows</span>
        </label>
        <label class="toggle-control">
          <input id="startMinimizedInput" type="checkbox" />
          <span data-i18n="startup.startMinimizedToTray">Mulai Minimized ke Tray</span>
        </label>
      </div>
      <p class="settings-note" id="startupNote">
        Start with Windows paling akurat dites setelah aplikasi dipackage dan diinstal.
      </p>
    </section>

    <section class="settings-panel">
      <div class="settings-header">
        <div>
          <p class="section-label" data-i18n="diagnostics.title">Diagnostik</p>
          <h3 data-i18n="diagnostics.healthCheck">Health Check</h3>
        </div>
        <div class="diagnostics-actions">
          <button class="secondary-button" data-i18n="button.refreshDiagnostics" id="refreshDiagnosticsButton" type="button">Segarkan Diagnostik</button>
          <button class="secondary-button" data-i18n="button.openDataFolder" id="openDataFolderButton" type="button">Buka Folder Data</button>
          <button class="refresh-button" data-i18n="button.exportDiagnostics" id="exportDiagnosticsButton" type="button">Ekspor Diagnostik</button>
        </div>
      </div>
      <div class="diagnostics-grid">
        <div>
          <span data-i18n="diagnostics.appVersion">Versi Aplikasi</span>
          <strong id="diagnosticsAppVersion">-</strong>
        </div>
        <div>
          <span data-i18n="diagnostics.mode">Mode</span>
          <strong id="diagnosticsMode">-</strong>
        </div>
        <div>
          <span data-i18n="diagnostics.platform">Platform</span>
          <strong id="diagnosticsPlatform">-</strong>
        </div>
        <div>
          <span data-i18n="diagnostics.historySessions">Jumlah Sesi Riwayat</span>
          <strong id="diagnosticsHistoryCount">-</strong>
        </div>
        <div class="diagnostics-wide">
          <span data-i18n="diagnostics.userDataPath">Path Data User</span>
          <strong id="diagnosticsUserDataPath">-</strong>
        </div>
        <div class="diagnostics-wide">
          <span data-i18n="diagnostics.settingsPath">Path Pengaturan</span>
          <strong id="diagnosticsSettingsPath">-</strong>
        </div>
        <div class="diagnostics-wide">
          <span data-i18n="diagnostics.historyPath">Path Riwayat</span>
          <strong id="diagnosticsHistoryPath">-</strong>
        </div>
        <div class="diagnostics-wide">
          <span data-i18n="diagnostics.networkProbeStatus">Status Network Probe</span>
          <strong id="diagnosticsNetworkProbe">-</strong>
        </div>
        <div class="diagnostics-wide">
          <span data-i18n="diagnostics.wifiProbeStatus">Status Wi-Fi Probe</span>
          <strong id="diagnosticsWifiProbe">-</strong>
        </div>
      </div>
      <p class="settings-note" data-i18n="diagnostics.notRefreshed" id="diagnosticsNote">Diagnostik belum disegarkan.</p>
    </section>
  </section>
`;

const elements = {
  addCurrentSsidButton: document.querySelector('#addCurrentSsidButton'),
  adapterName: document.querySelector('#adapterName'),
  autoResetOnSsidChangeInput: document.querySelector('#autoResetOnSsidChangeInput'),
  chartFilterSelect: document.querySelector('#chartFilterSelect'),
  chartMonitoredSsid: document.querySelector('#chartMonitoredSsid'),
  chartNote: document.querySelector('#chartNote'),
  chartPeakUsage: document.querySelector('#chartPeakUsage'),
  chartTotalSamples: document.querySelector('#chartTotalSamples'),
  clearChartButton: document.querySelector('#clearChartButton'),
  clearHistoryButton: document.querySelector('#clearHistoryButton'),
  downloadSession: document.querySelector('#downloadSession'),
  errorMessage: document.querySelector('#errorMessage'),
  estimateAverageSpeed: document.querySelector('#estimateAverageSpeed'),
  estimateDeltaUsage: document.querySelector('#estimateDeltaUsage'),
  estimateDuration: document.querySelector('#estimateDuration'),
  estimatesList: document.querySelector('#estimatesList'),
  estimatesStatus: document.querySelector('#estimatesStatus'),
  historyList: document.querySelector('#historyList'),
  dailyLimitInput: document.querySelector('#dailyLimitInput'),
  diagnosticsAppVersion: document.querySelector('#diagnosticsAppVersion'),
  diagnosticsHistoryCount: document.querySelector('#diagnosticsHistoryCount'),
  diagnosticsHistoryPath: document.querySelector('#diagnosticsHistoryPath'),
  diagnosticsMode: document.querySelector('#diagnosticsMode'),
  diagnosticsNetworkProbe: document.querySelector('#diagnosticsNetworkProbe'),
  diagnosticsNote: document.querySelector('#diagnosticsNote'),
  diagnosticsPlatform: document.querySelector('#diagnosticsPlatform'),
  diagnosticsSettingsPath: document.querySelector('#diagnosticsSettingsPath'),
  diagnosticsUserDataPath: document.querySelector('#diagnosticsUserDataPath'),
  diagnosticsWifiProbe: document.querySelector('#diagnosticsWifiProbe'),
  exportDiagnosticsButton: document.querySelector('#exportDiagnosticsButton'),
  intervalSelect: document.querySelector('#intervalSelect'),
  languageSelect: document.querySelector('#languageSelect'),
  launchAtStartupInput: document.querySelector('#launchAtStartupInput'),
  lastUpdated: document.querySelector('#lastUpdated'),
  limitStatus: document.querySelector('#limitStatus'),
  limitStatusDetail: document.querySelector('#limitStatusDetail'),
  monitoringButton: document.querySelector('#monitoringButton'),
  monitoredSsidList: document.querySelector('#monitoredSsidList'),
  monitorOnlyListedInput: document.querySelector('#monitorOnlyListedInput'),
  networkTargetStatus: document.querySelector('#networkTargetStatus'),
  notificationsEnabledInput: document.querySelector('#notificationsEnabledInput'),
  primaryWifiSsid: document.querySelector('#primaryWifiSsid'),
  rawReceivedBytes: document.querySelector('#rawReceivedBytes'),
  rawSentBytes: document.querySelector('#rawSentBytes'),
  rawTotalBytes: document.querySelector('#rawTotalBytes'),
  realPerAppAccessStatus: document.querySelector('#realPerAppAccessStatus'),
  realPerAppUsageList: document.querySelector('#realPerAppUsageList'),
  realPerAppUsageNote: document.querySelector('#realPerAppUsageNote'),
  realPerAppParseStatus: document.querySelector('#realPerAppParseStatus'),
  realPerAppUsageReason: document.querySelector('#realPerAppUsageReason'),
  realPerAppUsageSource: document.querySelector('#realPerAppUsageSource'),
  realPerAppUsageStatus: document.querySelector('#realPerAppUsageStatus'),
  openDataFolderButton: document.querySelector('#openDataFolderButton'),
  refreshDiagnosticsButton: document.querySelector('#refreshDiagnosticsButton'),
  refreshEstimatesButton: document.querySelector('#refreshEstimatesButton'),
  refreshRealPerAppUsageButton: document.querySelector('#refreshRealPerAppUsageButton'),
  refreshButton: document.querySelector('#refreshButton'),
  resetButton: document.querySelector('#resetButton'),
  refreshSuspectsButton: document.querySelector('#refreshSuspectsButton'),
  saveSettingsButton: document.querySelector('#saveSettingsButton'),
  saveStartupButton: document.querySelector('#saveStartupButton'),
  sessionLimitInput: document.querySelector('#sessionLimitInput'),
  sessionUsage: document.querySelector('#sessionUsage'),
  settingsNote: document.querySelector('#settingsNote'),
  startMinimizedInput: document.querySelector('#startMinimizedInput'),
  startupNote: document.querySelector('#startupNote'),
  startedAt: document.querySelector('#startedAt'),
  statusPill: document.querySelector('#statusPill'),
  statusText: document.querySelector('#statusText'),
  suspectsList: document.querySelector('#suspectsList'),
  suspectsStatus: document.querySelector('#suspectsStatus'),
  todayUsage: document.querySelector('#todayUsage'),
  totalUsage: document.querySelector('#totalUsage'),
  uploadSession: document.querySelector('#uploadSession'),
  usageChartCanvas: document.querySelector('#usageChartCanvas'),
  wifiInterfaceName: document.querySelector('#wifiInterfaceName'),
  wifiSignal: document.querySelector('#wifiSignal'),
  wifiSsid: document.querySelector('#wifiSsid'),
  wifiState: document.querySelector('#wifiState'),
};

let isRefreshing = false;
let isEstimatesLoading = false;
let isRealPerAppUsageLoading = false;
let isSuspectsLoading = false;
let monitoringEnabled = true;
let refreshIntervalMs = 15000;
let refreshTimerId = null;
let usageRenderToken = 0;
let isResettingSession = false;
let suspectsTimerId = null;
let currentSettings = fallbackSettings;
let currentWifiInfo = null;
let currentAppSuspects = null;
let currentAppUsageEstimates = null;
let currentRealPerAppUsage = null;
let currentUsageSamples = [];
let lastSsid = null;
let isDiagnosticsLoading = false;
let currentStartupSettings = {
  launchAtStartup: false,
  startMinimizedToTray: false,
  isPackaged: false,
};

const applyTranslations = (language = currentLanguage) => {
  currentLanguage = normalizeLanguage(language);
  document.documentElement.lang = currentLanguage;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  if (currentAppSuspects) {
    renderAppSuspects(currentAppSuspects);
  }

  if (currentAppUsageEstimates) {
    renderAppUsageEstimates(currentAppUsageEstimates);
  }

  if (currentRealPerAppUsage) {
    renderRealPerAppUsage(currentRealPerAppUsage);
  }
};

const getStatusTranslationKey = (status) => {
  const key = String(status || '').toLowerCase();

  return {
    safe: 'status.safe',
    warning: 'status.warning',
    exceeded: 'status.exceeded',
    'not monitored': 'status.notMonitored',
  }[key] || 'status.safe';
};

const setStatus = (label, state = 'loading') => {
  elements.statusPill.dataset.state = state;
  elements.statusText.textContent = label;
};

const clearRefreshTimer = () => {
  if (refreshTimerId) {
    window.clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
};

const clearSuspectsTimer = () => {
  if (suspectsTimerId) {
    window.clearInterval(suspectsTimerId);
    suspectsTimerId = null;
  }
};

const getEffectiveRefreshInterval = () => {
  if (document.visibilityState !== 'visible') {
    return Math.max(refreshIntervalMs, 30000);
  }

  return refreshIntervalMs;
};

const updateMonitoringUi = () => {
  elements.monitoringButton.textContent = monitoringEnabled
    ? t('button.pauseMonitoring')
    : t('button.resumeMonitoring');

  if (!monitoringEnabled && !isRefreshing) {
    setStatus(t('status.monitoringPaused'), 'paused');
  }
};

const scheduleAutoRefresh = () => {
  clearRefreshTimer();

  if (!monitoringEnabled) {
    return;
  }

  refreshTimerId = window.setInterval(() => {
    refreshUsage({ automatic: true });
  }, getEffectiveRefreshInterval());
};

const scheduleSuspectsRefresh = () => {
  clearSuspectsTimer();

  if (!monitoringEnabled || document.visibilityState !== 'visible') {
    return;
  }

  suspectsTimerId = window.setInterval(() => {
    refreshAppSuspects({ automatic: true });
  }, suspectsRefreshIntervalMs);
};

const setLoading = (isLoading, action = 'refresh') => {
  elements.refreshButton.disabled = isLoading;
  elements.refreshEstimatesButton.disabled = isLoading || isEstimatesLoading;
  elements.refreshRealPerAppUsageButton.disabled = isLoading || isRealPerAppUsageLoading;
  elements.refreshSuspectsButton.disabled = isLoading || isSuspectsLoading;
  elements.resetButton.disabled = isResettingSession || (isLoading && action !== 'refresh');
  elements.clearChartButton.disabled = isLoading;
  elements.clearHistoryButton.disabled = isLoading;
  elements.intervalSelect.disabled = isLoading;
  elements.saveSettingsButton.disabled = isLoading;
  elements.saveStartupButton.disabled = isLoading;
  elements.addCurrentSsidButton.disabled = isLoading;
  elements.refreshButton.textContent =
    isLoading && action === 'refresh' ? t('button.refreshing') : t('button.refreshStats');
  elements.resetButton.textContent =
    isLoading && action === 'reset' ? t('button.resetting') : t('button.resetSession');
  elements.clearHistoryButton.textContent =
    isLoading && action === 'clear' ? t('button.clearing') : t('button.clearHistory');
  elements.clearChartButton.textContent =
    isLoading && action === 'chart' ? t('button.clearing') : t('button.clearChartData');
  elements.saveSettingsButton.textContent =
    isLoading && action === 'settings' ? t('button.saving') : t('button.saveSettings');
  elements.saveStartupButton.textContent =
    isLoading && action === 'startup' ? t('button.saving') : t('button.saveStartupSettings');
};

const setEstimatesLoading = (isLoading) => {
  isEstimatesLoading = isLoading;
  elements.refreshEstimatesButton.disabled = isLoading || isRefreshing;
  elements.refreshEstimatesButton.textContent = isLoading
    ? t('button.refreshing')
    : t('button.refreshEstimates');
};

const setRealPerAppUsageLoading = (isLoading) => {
  isRealPerAppUsageLoading = isLoading;
  elements.refreshRealPerAppUsageButton.disabled = isLoading || isRefreshing;
  elements.refreshRealPerAppUsageButton.textContent = isLoading
    ? t('button.refreshing')
    : t('button.refreshPerAppUsage');
};

const setSuspectsLoading = (isLoading) => {
  isSuspectsLoading = isLoading;
  elements.refreshSuspectsButton.disabled = isLoading || isRefreshing;
  elements.refreshSuspectsButton.textContent = isLoading
    ? t('button.refreshing')
    : t('button.refreshSuspects');
};

const renderMonitoredSsids = (ssids) => {
  if (!ssids.length) {
    elements.monitoredSsidList.innerHTML = `<p class="history-empty">${escapeHtml(
      t('settings.noMonitoredSsids'),
    )}</p>`;
    return;
  }

  elements.monitoredSsidList.innerHTML = ssids
    .map(
      (ssid) => `
        <div class="ssid-chip">
          <span>${escapeHtml(ssid)}</span>
          <button class="danger-button" data-ssid="${escapeHtml(ssid)}" type="button">${escapeHtml(
            t('button.remove'),
          )}</button>
        </div>
      `,
    )
    .join('');
};

const renderSettings = (settings) => {
  currentSettings = {
    ...settings,
    language: normalizeLanguage(settings.language),
  };
  applyTranslations(currentSettings.language);
  updateMonitoringUi();

  if (document.activeElement !== elements.dailyLimitInput) {
    elements.dailyLimitInput.value = bytesToGbInput(currentSettings.dailyLimitBytes);
  }

  if (document.activeElement !== elements.sessionLimitInput) {
    elements.sessionLimitInput.value = bytesToGbInput(currentSettings.sessionLimitBytes);
  }

  if (document.activeElement !== elements.notificationsEnabledInput) {
    elements.notificationsEnabledInput.checked = currentSettings.notificationsEnabled;
  }

  if (document.activeElement !== elements.monitorOnlyListedInput) {
    elements.monitorOnlyListedInput.checked = currentSettings.monitorOnlyListedSsids;
  }

  if (document.activeElement !== elements.autoResetOnSsidChangeInput) {
    elements.autoResetOnSsidChangeInput.checked = currentSettings.autoResetOnSsidChange;
  }

  if (document.activeElement !== elements.languageSelect) {
    elements.languageSelect.value = currentSettings.language;
  }

  renderMonitoredSsids(currentSettings.monitoredSsids);
};

const renderStartupSettings = (startupSettings) => {
  currentStartupSettings = startupSettings;
  elements.launchAtStartupInput.checked = startupSettings.launchAtStartup;
  elements.startMinimizedInput.checked = startupSettings.startMinimizedToTray;
  elements.startupNote.textContent = startupSettings.isPackaged
    ? t('startup.notePackaged')
    : t('startup.noteDev');
};

const formatProbeStatus = (probe, successLabel) => {
  if (!probe) {
    return '-';
  }

  if (!probe.ok) {
    return `Error: ${probe.error}`;
  }

  return successLabel(probe.data);
};

const setDiagnosticsLoading = (isLoading, action = 'refresh') => {
  isDiagnosticsLoading = isLoading;
  elements.refreshDiagnosticsButton.disabled = isLoading;
  elements.openDataFolderButton.disabled = isLoading;
  elements.exportDiagnosticsButton.disabled = isLoading;
  elements.refreshDiagnosticsButton.textContent =
    isLoading && action === 'refresh' ? t('button.refreshing') : t('button.refreshDiagnostics');
  elements.exportDiagnosticsButton.textContent =
    isLoading && action === 'export' ? t('button.exporting') : t('button.exportDiagnostics');
};

const renderDiagnostics = (diagnostics) => {
  elements.diagnosticsAppVersion.textContent = diagnostics.appVersion;
  elements.diagnosticsMode.textContent = diagnostics.isPackaged
    ? t('diagnostics.packaged')
    : t('diagnostics.dev');
  elements.diagnosticsPlatform.textContent = `${diagnostics.platform} / ${diagnostics.arch}`;
  elements.diagnosticsHistoryCount.textContent = String(diagnostics.historyCount);
  elements.diagnosticsUserDataPath.textContent = diagnostics.userDataPath;
  elements.diagnosticsSettingsPath.textContent = diagnostics.settingsFilePath;
  elements.diagnosticsHistoryPath.textContent = diagnostics.historyFilePath;
  elements.diagnosticsNetworkProbe.textContent = formatProbeStatus(
    diagnostics.networkProbe,
    (stats) => `OK: ${stats.adapter.name}`,
  );
  elements.diagnosticsWifiProbe.textContent = formatProbeStatus(
    diagnostics.wifiProbe,
    (wifiInfo) =>
      `OK: ${wifiInfo.ssid || t('diagnostics.noSsid')} (${
        wifiInfo.state || t('diagnostics.unknown')
      })`,
  );
  elements.diagnosticsNote.textContent = tf('diagnostics.lastRefresh', {
    time: formatDateTime(diagnostics.timestamp),
  });
};

const refreshDiagnostics = async () => {
  if (isDiagnosticsLoading) {
    return;
  }

  if (!ensureApi('getDiagnostics')) {
    return;
  }

  setDiagnosticsLoading(true, 'refresh');

  try {
    const result = await window.quotaLens.getDiagnostics();

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderDiagnostics(result.diagnostics);
  } catch (error) {
    elements.diagnosticsNote.textContent = error.message || t('diagnostics.refreshFailed');
  } finally {
    setDiagnosticsLoading(false);
  }
};

const openDataFolder = async () => {
  if (isDiagnosticsLoading || !ensureApi('openDataFolder')) {
    return;
  }

  try {
    const result = await window.quotaLens.openDataFolder();

    if (!result.ok) {
      throw new Error(result.error);
    }

    elements.diagnosticsNote.textContent = t('diagnostics.dataFolderOpened');
  } catch (error) {
    elements.diagnosticsNote.textContent = error.message || t('diagnostics.openFailed');
  }
};

const exportDiagnostics = async () => {
  if (isDiagnosticsLoading || !ensureApi('exportDiagnostics')) {
    return;
  }

  setDiagnosticsLoading(true, 'export');

  try {
    const result = await window.quotaLens.exportDiagnostics();

    if (!result.ok) {
      throw new Error(result.error);
    }

    elements.diagnosticsNote.textContent = tf('diagnostics.exported', { path: result.exportPath });
    setDiagnosticsLoading(false);
    await refreshDiagnostics();
  } catch (error) {
    elements.diagnosticsNote.textContent = error.message || t('diagnostics.exportFailed');
    setDiagnosticsLoading(false);
  } finally {
    setDiagnosticsLoading(false);
  }
};

const collectSettingsFromInputs = (overrides = {}) => ({
  dailyLimitBytes: gbInputToBytes(elements.dailyLimitInput.value, currentSettings.dailyLimitBytes),
  sessionLimitBytes: gbInputToBytes(elements.sessionLimitInput.value, currentSettings.sessionLimitBytes),
  notificationsEnabled: elements.notificationsEnabledInput.checked,
  monitoredSsids: currentSettings.monitoredSsids,
  monitorOnlyListedSsids: elements.monitorOnlyListedInput.checked,
  autoResetOnSsidChange: elements.autoResetOnSsidChangeInput.checked,
  language: normalizeLanguage(elements.languageSelect.value),
  ...overrides,
});

const renderHistory = (sessions) => {
  const recentSessions = sessions.slice(0, 5);

  if (recentSessions.length === 0) {
    elements.historyList.innerHTML = `<p class="history-empty">${escapeHtml(t('history.empty'))}</p>`;
    return;
  }

  elements.historyList.innerHTML = recentSessions
    .map(
      (session) => `
        <article class="history-row">
          <div>
            <span>${escapeHtml(t('label.started'))}</span>
            <strong>${escapeHtml(formatDateTime(session.startedAt))}</strong>
          </div>
          <div>
            <span>${escapeHtml(t('label.ended'))}</span>
            <strong>${escapeHtml(formatDateTime(session.endedAt))}</strong>
          </div>
          <div>
            <span>${escapeHtml(t('label.total'))}</span>
            <strong>${escapeHtml(formatUsage(session.totalBytes))}</strong>
          </div>
          <div>
            <span>${escapeHtml(t('label.adapter'))}</span>
            <strong>${escapeHtml(session.adapterName)}</strong>
          </div>
        </article>
      `,
    )
    .join('');
};

const getFilteredChartSamples = (samples) => {
  const sortedSamples = samples
    .slice()
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  const filter = elements.chartFilterSelect.value;

  if (filter === 'today') {
    return sortedSamples.filter((sample) => isSameLocalDay(sample.timestamp));
  }

  const limit = Number(filter) || 30;
  return sortedSamples.slice(-limit);
};

const renderUsageChart = (samples = currentUsageSamples, activeSsid = normalizeSsid(currentWifiInfo?.ssid)) => {
  currentUsageSamples = Array.isArray(samples) ? samples : [];
  const filteredSamples = getFilteredChartSamples(currentUsageSamples);
  const peakBytes = filteredSamples.reduce(
    (peak, sample) => Math.max(peak, sample.sessionTotalBytes || 0),
    0,
  );

  elements.chartTotalSamples.textContent = formatInteger(currentUsageSamples.length);
  elements.chartPeakUsage.textContent = formatUsage(peakBytes);
  elements.chartMonitoredSsid.textContent =
    activeSsid || filteredSamples.at(-1)?.ssid || t('chart.noSsid');

  if (!filteredSamples.length) {
    elements.usageChartCanvas.innerHTML = `<div class="chart-empty">${escapeHtml(t('chart.empty'))}</div>`;
    elements.chartNote.textContent = '';
    return;
  }

  const width = 720;
  const height = 220;
  const padding = {
    top: 18,
    right: 18,
    bottom: 42,
    left: 48,
  };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxBytes = Math.max(peakBytes, 1);
  const denominator = Math.max(filteredSamples.length - 1, 1);
  const toX = (index) => padding.left + (index / denominator) * chartWidth;
  const toY = (bytes) => padding.top + (1 - bytes / maxBytes) * chartHeight;
  const points = filteredSamples.map((sample, index) => ({
    x: toX(index),
    y: toY(sample.sessionTotalBytes || 0),
    sample,
  }));
  const polyline = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const areaPath = [
    `M ${points[0].x.toFixed(2)} ${height - padding.bottom}`,
    ...points.map((point, index) => `${index === 0 ? 'L' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L ${points.at(-1).x.toFixed(2)} ${height - padding.bottom}`,
    'Z',
  ].join(' ');
  const labelIndexes = Array.from(
    new Set([0, Math.floor((filteredSamples.length - 1) / 2), filteredSamples.length - 1]),
  );

  elements.usageChartCanvas.innerHTML = `
    <svg aria-label="${escapeHtml(t('chart.title'))}" role="img" viewBox="0 0 ${width} ${height}">
      <line class="chart-axis" x1="${padding.left}" x2="${width - padding.right}" y1="${
        height - padding.bottom
      }" y2="${height - padding.bottom}"></line>
      <line class="chart-axis" x1="${padding.left}" x2="${padding.left}" y1="${padding.top}" y2="${
        height - padding.bottom
      }"></line>
      <text class="chart-y-label" x="${padding.left}" y="${padding.top + 4}">${escapeHtml(
        formatUsage(maxBytes),
      )}</text>
      <path class="chart-area" d="${areaPath}"></path>
      <polyline class="chart-line" points="${polyline}"></polyline>
      ${points
        .map(
          (point) => `
            <circle class="chart-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3">
              <title>${escapeHtml(
                tf('chart.pointLabel', {
                  time: formatShortTime(point.sample.timestamp),
                  usage: formatUsage(point.sample.sessionTotalBytes),
                }),
              )}</title>
            </circle>
          `,
        )
        .join('')}
      ${labelIndexes
        .map((index) => {
          const point = points[index];
          const textAnchor =
            index === 0 ? 'start' : index === filteredSamples.length - 1 ? 'end' : 'middle';

          return `
            <text class="chart-x-label" text-anchor="${textAnchor}" x="${point.x.toFixed(2)}" y="${
              height - 14
            }">${escapeHtml(formatShortTime(point.sample.timestamp))}</text>
          `;
        })
        .join('')}
    </svg>
  `;
  elements.chartNote.textContent = tf('chart.peakLabel', { usage: formatUsage(peakBytes) });
};

const getSuspectCategory = (suspect) => {
  const categoryKeyByKind = {
    chrome: 'suspects.browser',
    msedge: 'suspects.browser',
    firefox: 'suspects.browser',
    brave: 'suspects.browser',
    spotify: 'suspects.spotifyCategory',
    steam: 'suspects.steamCategory',
    epicgameslauncher: 'suspects.epicCategory',
    onedrive: 'suspects.onedriveCategory',
    telegram: 'suspects.telegramCategory',
    whatsapp: 'suspects.whatsappCategory',
    discord: 'suspects.discordCategory',
    code: 'suspects.vscodeCategory',
    codex: 'suspects.codexCategory',
    node: 'suspects.nodeCategory',
    powershell: 'suspects.powershellCategory',
    svchost: 'suspects.windowsService',
    system: 'suspects.windowsSystem',
    unknown: 'suspects.unknown',
  };

  return t(categoryKeyByKind[suspect.appKind] || 'suspects.unknown');
};

const getSuspectFriendlyName = (suspect, processName) => {
  if (suspect.appKind === 'svchost') {
    return t('suspects.windowsServiceName');
  }

  if (suspect.appKind === 'system') {
    return t('suspects.windowsSystemName');
  }

  return String(suspect.friendlyName || processName);
};

const getSuspectDescription = (suspect) => {
  const descriptionKeyByKind = {
    chrome: 'suspects.browserDescription',
    msedge: 'suspects.browserDescription',
    firefox: 'suspects.browserDescription',
    brave: 'suspects.browserDescription',
    spotify: 'suspects.spotifyDescription',
    steam: 'suspects.steamDescription',
    epicgameslauncher: 'suspects.epicDescription',
    onedrive: 'suspects.onedriveDescription',
    telegram: 'suspects.chatDescription',
    whatsapp: 'suspects.chatDescription',
    discord: 'suspects.discordDescription',
    code: 'suspects.vscodeDescription',
    codex: 'suspects.codexDescription',
    node: 'suspects.nodeDescription',
    powershell: 'suspects.powershellDescription',
    svchost: 'suspects.svchostDescription',
    system: 'suspects.systemDescription',
    unknown: 'suspects.unknownDescription',
  };

  return t(descriptionKeyByKind[suspect.appKind] || 'suspects.unknownDescription');
};

const getEstimateImpactLabel = (estimate) => {
  const keyByConfidence = {
    high: 'estimates.high',
    medium: 'estimates.medium',
    low: 'estimates.low',
  };

  return t(keyByConfidence[estimate.confidence] || 'estimates.low');
};

const renderAppUsageEstimates = (estimatesData) => {
  currentAppUsageEstimates = estimatesData;
  const windowSummary = estimatesData?.window || {};
  const estimates = Array.isArray(estimatesData?.estimates) ? estimatesData.estimates : [];

  elements.estimateDeltaUsage.textContent = formatUsage(windowSummary.deltaTotalBytes || 0);
  elements.estimateDuration.textContent = tf('estimates.seconds', {
    seconds: formatInteger(windowSummary.observedWindowSeconds || 0),
  });
  elements.estimateAverageSpeed.textContent = tf('estimates.perSecond', {
    usage: formatUsage(windowSummary.averageBytesPerSecond || 0),
  });

  if (!estimates.length) {
    const message =
      estimatesData?.message?.[currentLanguage] ||
      estimatesData?.message?.en ||
      t('estimates.empty');

    elements.estimatesList.innerHTML = `<p class="history-empty">${escapeHtml(message)}</p>`;
    elements.estimatesStatus.textContent = estimatesData?.generatedAt
      ? tf('estimates.generatedAt', { time: formatDateTime(estimatesData.generatedAt) })
      : t('estimates.notGenerated');
    return;
  }

  elements.estimatesList.innerHTML = `
    <p class="section-label">${escapeHtml(t('estimates.possibleApps'))}</p>
    ${estimates
      .map((estimate) => {
        const category = getSuspectCategory(estimate);
        const processNames = Array.isArray(estimate.processNames)
          ? estimate.processNames.join(', ')
          : '-';
        const reason =
          estimate.reason?.[currentLanguage] ||
          estimate.reason?.en ||
          getSuspectDescription(estimate);

        return `
          <article class="estimate-row" data-confidence="${escapeHtml(estimate.confidence)}">
            <div class="estimate-main">
              <div>
                <span>${escapeHtml(t('suspects.appName'))}</span>
                <strong>${escapeHtml(estimate.friendlyName || processNames)}</strong>
                <small>${escapeHtml(category)}</small>
              </div>
              <div>
                <span>${escapeHtml(t('estimates.confidence'))}</span>
                <strong>${escapeHtml(formatInteger(estimate.confidenceScore))}/100</strong>
              </div>
              <div>
                <span>${escapeHtml(t('estimates.likelihoodLevel'))}</span>
                <strong>${escapeHtml(getEstimateImpactLabel(estimate))}</strong>
              </div>
            </div>
            <p class="estimate-reason">
              <strong>${escapeHtml(t('estimates.reason'))}:</strong> ${escapeHtml(reason)}
            </p>
            <p class="estimate-processes">
              <strong>${escapeHtml(t('estimates.processes'))}:</strong> ${escapeHtml(processNames)}
            </p>
          </article>
        `;
      })
      .join('')}
  `;
  elements.estimatesStatus.textContent = tf('estimates.generatedAt', {
    time: formatDateTime(estimatesData.generatedAt),
  });
};

const renderRealPerAppUsage = (perAppUsage) => {
  currentRealPerAppUsage = perAppUsage;
  const apps = Array.isArray(perAppUsage?.apps) ? perAppUsage.apps : [];
  const supported = Boolean(perAppUsage?.supported);
  const source = perAppUsage?.sourceMethod || 'native-helper-placeholder';
  const reason =
    perAppUsage?.reason ||
    (!supported ? t('perApp.unsupportedMessage') : '');

  elements.realPerAppUsageStatus.textContent = supported
    ? t('perApp.supported')
    : t('perApp.unsupported');
  elements.realPerAppUsageStatus.dataset.supported = supported ? 'true' : 'false';
  elements.realPerAppUsageSource.textContent = source;
  elements.realPerAppAccessStatus.textContent = perAppUsage?.accessStatus || '-';
  elements.realPerAppParseStatus.textContent = perAppUsage?.parseStatus || '-';
  const unsupportedMessage =
    perAppUsage?.accessStatus === 'access_denied' ||
    perAppUsage?.discoveryStatus === 'access_denied'
      ? t('perApp.accessDeniedMessage')
      : `${t('perApp.unsupportedMessage')} ${reason ? `(${reason})` : ''}`;

  elements.realPerAppUsageReason.textContent = supported ? '' : unsupportedMessage;
  const investigationDetails = [
    perAppUsage?.dataType ? `${t('perApp.dataType')}: ${perAppUsage.dataType}` : '',
    perAppUsage?.note ? `${t('perApp.noteLabel')}: ${perAppUsage.note}` : '',
    perAppUsage?.discoveryStatus
      ? `${t('perApp.discoveryStatus')}: ${perAppUsage.discoveryStatus}`
      : '',
    perAppUsage?.srumPath ? `${t('perApp.srumPath')}: ${perAppUsage.srumPath}` : '',
    perAppUsage?.foundPath ? `${t('perApp.foundPath')}: ${perAppUsage.foundPath}` : '',
    perAppUsage?.copiedPath ? `${t('perApp.copiedPath')}: ${perAppUsage.copiedPath}` : '',
    Array.isArray(perAppUsage?.checkedPaths) && perAppUsage.checkedPaths.length
      ? `${t('perApp.checkedPaths')}: ${perAppUsage.checkedPaths.slice(0, 10).join(', ')}`
      : '',
    Array.isArray(perAppUsage?.tableNames) && perAppUsage.tableNames.length
      ? `${t('perApp.tableNames')}: ${perAppUsage.tableNames.slice(0, 12).join(', ')}`
      : '',
    Array.isArray(perAppUsage?.networkTableCandidates) && perAppUsage.networkTableCandidates.length
      ? `${t('perApp.networkTableCandidates')}: ${perAppUsage.networkTableCandidates
          .slice(0, 12)
          .join(', ')}`
      : '',
  ].filter(Boolean);

  if (!supported) {
    elements.realPerAppUsageList.innerHTML = `
      <p class="history-empty">${escapeHtml(t('perApp.empty'))}</p>
      ${
        investigationDetails.length
          ? `<div class="per-app-investigation">${investigationDetails
              .map((detail) => `<p>${escapeHtml(detail)}</p>`)
              .join('')}</div>`
          : ''
      }
    `;
    elements.realPerAppUsageNote.textContent = perAppUsage?.collectedAt
      ? tf('perApp.lastRefresh', { time: formatDateTime(perAppUsage.collectedAt) })
      : t('perApp.notRefreshed');
    return;
  }

  if (!apps.length) {
    elements.realPerAppUsageList.innerHTML = `<p class="history-empty">${escapeHtml(
      t('perApp.empty'),
    )}</p>`;
    elements.realPerAppUsageNote.textContent = perAppUsage?.collectedAt
      ? tf('perApp.lastRefresh', { time: formatDateTime(perAppUsage.collectedAt) })
      : t('perApp.notRefreshed');
    return;
  }

  elements.realPerAppUsageList.innerHTML = `
    ${
      investigationDetails.length
        ? `<div class="per-app-investigation">${investigationDetails
            .map((detail) => `<p>${escapeHtml(detail)}</p>`)
            .join('')}</div>`
        : ''
    }
    ${apps
      .map((appUsage) => {
      const appName = appUsage.appName || appUsage.processName || 'Unknown';
      const processName = appUsage.processName || appName;
      const packageName = appUsage.packageName ? ` / ${appUsage.packageName}` : '';
      const identity = appUsage.rawIdentity ? ` / ${appUsage.rawIdentity}` : '';
      const category = appUsage.category ? ` / ${appUsage.category}` : '';
      const method = appUsage.sourceMethod || source;

      return `
        <article class="per-app-row">
          <div>
            <span>${escapeHtml(t('perApp.appName'))}</span>
            <strong>${escapeHtml(appName)}</strong>
            <small>${escapeHtml(`${processName}${packageName}${identity}${category}`)}</small>
          </div>
          <div>
            <span>${escapeHtml(t('perApp.download'))}</span>
            <strong>${escapeHtml(formatUsage(appUsage.downloadBytes))}</strong>
          </div>
          <div>
            <span>${escapeHtml(t('perApp.upload'))}</span>
            <strong>${escapeHtml(formatUsage(appUsage.uploadBytes))}</strong>
          </div>
          <div>
            <span>${escapeHtml(t('perApp.total'))}</span>
            <strong>${escapeHtml(formatUsage(appUsage.totalBytes))}</strong>
            <small>${escapeHtml(appUsage.lastSeen || method)}</small>
          </div>
        </article>
      `;
      })
      .join('')}
  `;
  elements.realPerAppUsageNote.textContent = tf('perApp.lastRefresh', {
    time: formatDateTime(perAppUsage.collectedAt),
  });
};

const renderAppSuspects = (suspectsData) => {
  currentAppSuspects = suspectsData;
  const suspects = Array.isArray(suspectsData?.suspects) ? suspectsData.suspects : [];

  if (!suspects.length) {
    elements.suspectsList.innerHTML = `<p class="history-empty">${escapeHtml(t('suspects.empty'))}</p>`;
    elements.suspectsStatus.textContent = suspectsData?.collectedAt
      ? tf('suspects.lastRefresh', { time: formatDateTime(suspectsData.collectedAt) })
      : t('suspects.notRefreshed');
    return;
  }

  elements.suspectsList.innerHTML = suspects
    .map((suspect) => {
      const processName = String(suspect.processName || 'Unknown');
      const friendlyName = getSuspectFriendlyName(suspect, processName);
      const category = getSuspectCategory(suspect);
      const description = getSuspectDescription(suspect);
      const details = suspect.technicalDetails || {};
      const processIds = Array.isArray(details.processIds)
        ? details.processIds.join(', ')
        : String(suspect.processId || '-');
      const processNames = Array.isArray(details.processNames)
        ? details.processNames.join(', ')
        : processName;
      const remoteAddresses = Array.isArray(details.remoteAddresses)
        ? details.remoteAddresses.join(', ')
        : Array.isArray(suspect.remoteAddresses)
          ? suspect.remoteAddresses.join(', ')
          : '-';
      const states =
        Array.isArray(details.states) && details.states.length
          ? details.states.join(', ')
          : Array.isArray(suspect.states) && suspect.states.length
            ? suspect.states.join(', ')
            : '-';

      return `
        <article class="suspect-row">
          <div class="suspect-main">
            <div>
              <span>${escapeHtml(t('suspects.appName'))}</span>
              <strong>${escapeHtml(friendlyName)}</strong>
              <small>${escapeHtml(t('suspects.process'))}: ${escapeHtml(processName)}</small>
            </div>
            <div>
              <span>${escapeHtml(t('suspects.category'))}</span>
              <strong>${escapeHtml(category)}</strong>
              <small>${escapeHtml(t('suspects.activeIndication'))}</small>
            </div>
            <div>
              <span>${escapeHtml(t('suspects.connections'))}</span>
              <strong>${escapeHtml(formatInteger(suspect.connectionCount))}</strong>
            </div>
          </div>
          <p class="suspect-description">${escapeHtml(description)}</p>
          <details class="suspect-technical-details">
            <summary>${escapeHtml(t('suspects.technicalDetails'))}</summary>
            <div>
              <span>${escapeHtml(t('suspects.pidList'))}</span>
              <strong>${escapeHtml(processIds)}</strong>
            </div>
            <div>
              <span>${escapeHtml(t('suspects.process'))}</span>
              <strong>${escapeHtml(processNames)}</strong>
            </div>
            <div>
              <span>${escapeHtml(t('suspects.remoteAddresses'))}</span>
              <strong>${escapeHtml(remoteAddresses || '-')}</strong>
            </div>
            <div>
              <span>${escapeHtml(t('suspects.states'))}</span>
              <strong>${escapeHtml(states)}</strong>
            </div>
          </details>
        </article>
      `;
    })
    .join('');
  elements.suspectsStatus.textContent = tf('suspects.lastRefresh', {
    time: formatDateTime(suspectsData.collectedAt),
  });
};

const renderWifiInfo = ({ wifiInfo, wifiError, settings }) => {
  currentWifiInfo = wifiInfo;
  const ssid = normalizeSsid(wifiInfo?.ssid);
  const monitored = isSsidMonitored(ssid, settings);

  elements.wifiSsid.textContent = ssid || t('status.notConnected');
  elements.primaryWifiSsid.textContent = ssid || t('status.notConnected');
  elements.wifiState.textContent =
    translateWifiState(wifiInfo?.state) || (wifiError ? t('status.unavailable') : '-');
  elements.wifiSignal.textContent = wifiInfo?.signal || '-';
  elements.wifiInterfaceName.textContent = wifiInfo?.interfaceName || '-';
  elements.networkTargetStatus.textContent = monitored
    ? t('status.monitoringAllowed')
    : t('status.notMonitoredNetwork');

  if (wifiError) {
    elements.errorMessage.textContent = toFriendlyError(wifiError);
  }

  return monitored;
};

const renderLimitStatus = ({ todayUsageBytes, sessionUsageBytes, settings, isNetworkMonitored }) => {
  if (!isNetworkMonitored) {
    elements.limitStatus.textContent = t('status.notMonitored');
    elements.limitStatus.dataset.status = 'unmonitored';
    elements.limitStatusDetail.textContent = t('status.activeSsidOutsideList');
    return {
      dailyStatus: 'Not Monitored',
      sessionStatus: 'Not Monitored',
      overallStatus: 'Not Monitored',
    };
  }

  const dailyStatus = getLimitStatus(todayUsageBytes, settings.dailyLimitBytes);
  const sessionStatus = getLimitStatus(sessionUsageBytes, settings.sessionLimitBytes);
  const overallStatus = getOverallLimitStatus(dailyStatus, sessionStatus);

  elements.limitStatus.textContent = t(getStatusTranslationKey(overallStatus));
  elements.limitStatus.dataset.status = overallStatus.toLowerCase();
  elements.limitStatusDetail.textContent = `${t('status.daily')} ${t(
    getStatusTranslationKey(dailyStatus),
  )} / ${t('status.session')} ${t(getStatusTranslationKey(sessionStatus))}`;

  return {
    dailyStatus,
    sessionStatus,
    overallStatus,
  };
};

const requestLimitNotificationCheck = ({ todayUsageBytes, sessionUsageBytes }) => {
  if (!window.quotaLens?.checkLimitNotifications) {
    return;
  }

  window.quotaLens
    .checkLimitNotifications({
      todayUsageBytes,
      sessionUsageBytes,
    })
    .catch(() => {});
};

const recordUsageSample = async ({ usage, todayTotalBytes, ssid, isNetworkMonitored }) => {
  if (!monitoringEnabled || !isNetworkMonitored || !ensureApi('addUsageSample', 'getUsageSamples')) {
    return;
  }

  const numericSample = {
    sessionTotalBytes: Number(usage.sessionTotalBytes),
    sessionReceivedBytes: Number(usage.sessionReceivedBytes),
    sessionSentBytes: Number(usage.sessionSentBytes),
    todayTotalBytes: Number(todayTotalBytes),
  };

  if (
    !Number.isFinite(numericSample.sessionTotalBytes) ||
    !Number.isFinite(numericSample.sessionReceivedBytes) ||
    !Number.isFinite(numericSample.sessionSentBytes) ||
    !Number.isFinite(numericSample.todayTotalBytes)
  ) {
    console.debug('QuotaLens skipped usage sample because usage values were invalid.');
    return;
  }

  try {
    const addResult = await window.quotaLens.addUsageSample({
      timestamp: usage.updatedAt,
      ssid,
      adapterName: usage.adapterName,
      sessionTotalBytes: numericSample.sessionTotalBytes,
      sessionReceivedBytes: numericSample.sessionReceivedBytes,
      sessionSentBytes: numericSample.sessionSentBytes,
      todayTotalBytes: numericSample.todayTotalBytes,
    });

    if (!addResult.ok) {
      throw new Error(addResult.error);
    }

    const samplesResult = await window.quotaLens.getUsageSamples();

    if (!samplesResult.ok) {
      throw new Error(samplesResult.error);
    }

    renderUsageChart(samplesResult.samples, ssid);
  } catch (error) {
    console.debug('QuotaLens failed to store usage sample:', error);
    elements.chartNote.textContent = t('error.usageSamples');
  }
};

const renderDashboard = ({
  usage,
  todayUsage,
  history,
  settings,
  startupSettings,
  wifiInfo,
  wifiError,
  usageSamples,
  usageSamplesError,
}) => {
  renderSettings(settings);
  renderStartupSettings(startupSettings);

  const updatedAt = new Date(usage.updatedAt);
  const sessionTotal = formatUsage(usage.sessionTotalBytes);
  const combinedTodayBytes = todayUsage.totalBytes + usage.sessionTotalBytes;
  const combinedToday = formatUsage(combinedTodayBytes);
  const isNetworkMonitored = renderWifiInfo({ wifiInfo, wifiError, settings });
  const currentSsid = normalizeSsid(wifiInfo?.ssid);

  if (currentSsid) {
    lastSsid = currentSsid;
  }

  elements.adapterName.textContent = currentSsid || usage.adapterName;
  elements.todayUsage.textContent = combinedToday;
  elements.sessionUsage.textContent = sessionTotal;
  elements.downloadSession.textContent = formatUsage(usage.sessionReceivedBytes);
  elements.uploadSession.textContent = formatUsage(usage.sessionSentBytes);
  elements.totalUsage.textContent = combinedToday;
  elements.startedAt.textContent = formatDateTime(usage.startedAt);
  elements.rawReceivedBytes.textContent = formatInteger(usage.rawReceivedBytes);
  elements.rawSentBytes.textContent = formatInteger(usage.rawSentBytes);
  elements.rawTotalBytes.textContent = formatInteger(usage.rawTotalBytes);
  elements.lastUpdated.textContent = tf('label.lastUpdated', {
    time: updatedAt.toLocaleTimeString(currentLanguage === 'id' ? 'id-ID' : 'en-US'),
  });
  elements.errorMessage.textContent = wifiError ? toFriendlyError(wifiError) : '';
  renderHistory(history);
  renderUsageChart(usageSamples, currentSsid);

  if (usageSamplesError) {
    elements.chartNote.textContent = toFriendlyError(usageSamplesError);
  }

  renderLimitStatus({
    todayUsageBytes: combinedTodayBytes,
    sessionUsageBytes: usage.sessionTotalBytes,
    settings,
    isNetworkMonitored,
  });

  if (isNetworkMonitored) {
    requestLimitNotificationCheck({
      todayUsageBytes: combinedTodayBytes,
      sessionUsageBytes: usage.sessionTotalBytes,
    });
    recordUsageSample({
      usage,
      todayTotalBytes: combinedTodayBytes,
      ssid: currentSsid,
      isNetworkMonitored,
    });
  }

  if (monitoringEnabled) {
    setStatus(
      isNetworkMonitored ? t('status.connected') : t('status.notMonitoredNetwork'),
      isNetworkMonitored ? 'success' : 'unmonitored',
    );
  } else {
    setStatus(t('status.monitoringPaused'), 'paused');
  }
};

const renderError = (message) => {
  elements.errorMessage.textContent = toFriendlyError(message);
  elements.lastUpdated.textContent = t('status.refreshFailed');
  setStatus(
    monitoringEnabled ? t('status.probeError') : t('status.monitoringPaused'),
    monitoringEnabled ? 'error' : 'paused',
  );
};

const ensureApi = (...methods) => {
  const missingMethod = methods.find((method) => !window.quotaLens?.[method]);

  if (missingMethod) {
    renderError(tf('error.preloadUnavailable', { method: missingMethod }));
    return false;
  }

  return true;
};

const refreshAppSuspects = async ({ automatic = false } = {}) => {
  if (isSuspectsLoading || (automatic && !monitoringEnabled)) {
    return;
  }

  if (!ensureApi('getAppNetworkSuspects')) {
    return;
  }

  setSuspectsLoading(true);

  try {
    const result = await window.quotaLens.getAppNetworkSuspects();

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderAppSuspects(result.suspects);
  } catch (error) {
    elements.suspectsList.innerHTML = `<p class="history-empty">${escapeHtml(
      toFriendlyError(error.message || t('error.appSuspects')),
    )}</p>`;
    elements.suspectsStatus.textContent = t('error.appSuspects');
  } finally {
    setSuspectsLoading(false);
  }
};

const refreshAppUsageEstimates = async () => {
  if (isEstimatesLoading) {
    return;
  }

  if (!ensureApi('getAppUsageEstimates')) {
    return;
  }

  setEstimatesLoading(true);

  try {
    const result = await window.quotaLens.getAppUsageEstimates();

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderAppUsageEstimates(result.estimates);
  } catch (error) {
    elements.estimatesList.innerHTML = `<p class="history-empty">${escapeHtml(
      toFriendlyError(error.message || t('error.appEstimates')),
    )}</p>`;
    elements.estimatesStatus.textContent = t('error.appEstimates');
  } finally {
    setEstimatesLoading(false);
  }
};

const refreshRealPerAppUsage = async () => {
  if (isRealPerAppUsageLoading) {
    return;
  }

  if (!ensureApi('getRealPerAppUsage')) {
    return;
  }

  setRealPerAppUsageLoading(true);

  try {
    const result = await window.quotaLens.getRealPerAppUsage();

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderRealPerAppUsage(result.perAppUsage);
  } catch (error) {
    elements.realPerAppUsageReason.textContent = toFriendlyError(
      error.message || t('error.realPerAppUsage'),
    );
    elements.realPerAppUsageList.innerHTML = `<p class="history-empty">${escapeHtml(
      t('perApp.empty'),
    )}</p>`;
    elements.realPerAppUsageStatus.textContent = t('perApp.unsupported');
    elements.realPerAppUsageSource.textContent = 'native-helper-placeholder';
    elements.realPerAppAccessStatus.textContent = '-';
    elements.realPerAppParseStatus.textContent = '-';
    elements.realPerAppUsageNote.textContent = t('error.realPerAppUsage');
  } finally {
    setRealPerAppUsageLoading(false);
  }
};

const loadDashboardData = async () => {
  if (
    !ensureApi(
      'getSessionUsage',
      'getTodayUsage',
      'getHistory',
      'getSettings',
      'getStartupSettings',
      'getWifiInfo',
      'getUsageSamples',
    )
  ) {
    return null;
  }

  const [sessionResult, todayResult, historyResult, settingsResult, startupResult, wifiResult, usageSamplesResult] =
    await Promise.all([
      window.quotaLens.getSessionUsage(),
      window.quotaLens.getTodayUsage(),
      window.quotaLens.getHistory(),
      window.quotaLens.getSettings(),
      window.quotaLens.getStartupSettings(),
      window.quotaLens.getWifiInfo(),
      window.quotaLens.getUsageSamples(),
    ]);

  if (!sessionResult.ok) {
    throw new Error(sessionResult.error);
  }

  if (!todayResult.ok) {
    throw new Error(todayResult.error);
  }

  if (!historyResult.ok) {
    throw new Error(historyResult.error);
  }

  if (!settingsResult.ok) {
    throw new Error(settingsResult.error);
  }

  if (!startupResult.ok) {
    throw new Error(startupResult.error);
  }

  return {
    usage: sessionResult.usage,
    todayUsage: todayResult.todayUsage,
    history: historyResult.sessions,
    settings: settingsResult.settings,
    startupSettings: startupResult.startupSettings,
    wifiInfo: wifiResult.ok ? wifiResult.wifiInfo : null,
    wifiError: wifiResult.ok ? '' : wifiResult.error,
    usageSamples: usageSamplesResult.ok ? usageSamplesResult.samples : [],
    usageSamplesError: usageSamplesResult.ok ? '' : usageSamplesResult.error,
  };
};

const applySsidAutoReset = async (data) => {
  if (!data) {
    return null;
  }

  const currentSsid = normalizeSsid(data.wifiInfo?.ssid);

  if (!currentSsid || !data.settings.autoResetOnSsidChange) {
    return data;
  }

  if (!lastSsid) {
    lastSsid = currentSsid;
    return data;
  }

  if (currentSsid === lastSsid) {
    return data;
  }

  const resetResult = await window.quotaLens.resetSession();

  if (!resetResult.ok) {
    throw new Error(resetResult.error);
  }

  lastSsid = currentSsid;

  const refreshedData = await loadDashboardData();
  return refreshedData || {
    ...data,
    usage: resetResult.usage,
  };
};

function refreshUsage({ automatic = false } = {}) {
  if (isResettingSession || isRefreshing || (automatic && !monitoringEnabled)) {
    return Promise.resolve();
  }

  const renderToken = ++usageRenderToken;
  isRefreshing = true;
  setLoading(true, 'refresh');
  setStatus(t('status.refreshing'), 'loading');

  return loadDashboardData()
    .then((data) => applySsidAutoReset(data))
    .then((data) => {
      if (data && renderToken === usageRenderToken && !isResettingSession) {
        renderDashboard(data);
      }
    })
    .catch((error) => {
      renderError(error.message || t('error.refreshDashboard'));
    })
    .finally(() => {
      if (renderToken === usageRenderToken) {
        isRefreshing = false;
        setLoading(false);
        updateMonitoringUi();
      }
    });
}

const resetSession = async () => {
  if (isResettingSession) {
    return;
  }

  if (
    !ensureApi(
      'resetSession',
      'getTodayUsage',
      'getHistory',
      'getSettings',
      'getStartupSettings',
      'getWifiInfo',
      'getUsageSamples',
    )
  ) {
    return;
  }

  const renderToken = ++usageRenderToken;
  isResettingSession = true;
  isRefreshing = true;
  setLoading(true, 'reset');
  setStatus(t('status.resetting'), 'loading');

  try {
    console.debug('QuotaLens reset session started.');
    const resetResult = await window.quotaLens.resetSession();

    if (!resetResult.ok) {
      throw new Error(resetResult.error);
    }

    const [todayResult, historyResult, settingsResult, startupResult, wifiResult, usageSamplesResult] =
      await Promise.all([
      window.quotaLens.getTodayUsage(),
      window.quotaLens.getHistory(),
      window.quotaLens.getSettings(),
      window.quotaLens.getStartupSettings(),
      window.quotaLens.getWifiInfo(),
      window.quotaLens.getUsageSamples(),
    ]);

    if (!todayResult.ok) {
      throw new Error(todayResult.error);
    }

    if (!historyResult.ok) {
      throw new Error(historyResult.error);
    }

    if (!settingsResult.ok) {
      throw new Error(settingsResult.error);
    }

    if (!startupResult.ok) {
      throw new Error(startupResult.error);
    }

    if (renderToken !== usageRenderToken) {
      return;
    }

    console.debug('QuotaLens reset session completed:', {
      startedAt: resetResult.usage.startedAt,
      sessionTotalBytes: resetResult.usage.sessionTotalBytes,
    });

    renderDashboard({
      usage: resetResult.usage,
      todayUsage: todayResult.todayUsage,
      history: historyResult.sessions,
      settings: settingsResult.settings,
      startupSettings: startupResult.startupSettings,
      wifiInfo: wifiResult.ok ? wifiResult.wifiInfo : null,
      wifiError: wifiResult.ok ? '' : wifiResult.error,
      usageSamples: usageSamplesResult.ok ? usageSamplesResult.samples : [],
      usageSamplesError: usageSamplesResult.ok ? '' : usageSamplesResult.error,
    });
  } catch (error) {
    renderError(error.message || t('error.resetSession'));
  } finally {
    if (renderToken === usageRenderToken) {
      isResettingSession = false;
      isRefreshing = false;
      setLoading(false);
      updateMonitoringUi();
    }
  }
};

const clearHistory = async () => {
  if (isRefreshing) {
    return;
  }

  if (!window.confirm(t('confirm.clearHistory'))) {
    return;
  }

  if (!ensureApi('clearHistory')) {
    return;
  }

  isRefreshing = true;
  setLoading(true, 'clear');
  setStatus(t('status.clearingHistory'), 'loading');

  try {
    const result = await window.quotaLens.clearHistory();

    if (!result.ok) {
      throw new Error(result.error);
    }

    isRefreshing = false;
    setLoading(false);
    await refreshUsage();
  } catch (error) {
    renderError(error.message || t('error.clearHistory'));
    isRefreshing = false;
    setLoading(false);
    updateMonitoringUi();
  }
};

const clearChartData = async () => {
  if (isRefreshing) {
    return;
  }

  if (!window.confirm(t('confirm.clearChartData'))) {
    return;
  }

  if (!ensureApi('clearUsageSamples')) {
    return;
  }

  isRefreshing = true;
  setLoading(true, 'chart');
  setStatus(t('status.clearingChart'), 'loading');

  try {
    const result = await window.quotaLens.clearUsageSamples();

    if (!result.ok) {
      throw new Error(result.error);
    }

    currentUsageSamples = [];
    renderUsageChart([], normalizeSsid(currentWifiInfo?.ssid));
    elements.chartNote.textContent = t('chart.cleared');
  } catch (error) {
    renderError(error.message || t('error.clearChartData'));
  } finally {
    isRefreshing = false;
    setLoading(false);
    updateMonitoringUi();
  }
};

const saveSettings = async () => {
  if (isRefreshing) {
    return;
  }

  if (!ensureApi('updateSettings')) {
    return;
  }

  isRefreshing = true;
  setLoading(true, 'settings');
  setStatus(t('status.savingSettings'), 'loading');

  try {
    const result = await window.quotaLens.updateSettings(collectSettingsFromInputs());

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderSettings(result.settings);
    elements.settingsNote.textContent = t('settings.saved');
    isRefreshing = false;
    setLoading(false);
    await refreshUsage();
  } catch (error) {
    renderError(error.message || t('settings.saveFailed'));
    elements.settingsNote.textContent = t('settings.saveFailed');
    isRefreshing = false;
    setLoading(false);
    updateMonitoringUi();
  }
};

const saveStartupSettings = async () => {
  if (isRefreshing) {
    return;
  }

  if (!ensureApi('updateStartupSettings')) {
    return;
  }

  isRefreshing = true;
  setLoading(true, 'startup');
  setStatus(t('status.savingStartup'), 'loading');

  try {
    const result = await window.quotaLens.updateStartupSettings({
      launchAtStartup: elements.launchAtStartupInput.checked,
      startMinimizedToTray: elements.startMinimizedInput.checked,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderStartupSettings(result.startupSettings);
    isRefreshing = false;
    setLoading(false);
    await refreshUsage();
  } catch (error) {
    renderError(error.message || t('startup.saveFailed'));
    elements.startupNote.textContent = t('startup.saveFailed');
    isRefreshing = false;
    setLoading(false);
    updateMonitoringUi();
  }
};

const addCurrentSsidToMonitored = async () => {
  if (isRefreshing) {
    return;
  }

  const ssid = normalizeSsid(currentWifiInfo?.ssid);

  if (!ssid) {
    elements.settingsNote.textContent = t('settings.noActiveSsid');
    return;
  }

  if (
    currentSettings.monitoredSsids.some(
      (monitoredSsid) => monitoredSsid.toLowerCase() === ssid.toLowerCase(),
    )
  ) {
    elements.settingsNote.textContent = t('settings.ssidAlreadyMonitored');
    return;
  }

  if (!ensureApi('updateSettings')) {
    return;
  }

  isRefreshing = true;
  setLoading(true, 'settings');
  setStatus(t('status.savingSettings'), 'loading');

  try {
    const result = await window.quotaLens.updateSettings(
      collectSettingsFromInputs({
        monitoredSsids: [...currentSettings.monitoredSsids, ssid],
      }),
    );

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderSettings(result.settings);
    elements.settingsNote.textContent = tf('settings.ssidAdded', { ssid });
    isRefreshing = false;
    setLoading(false);
    await refreshUsage();
  } catch (error) {
    renderError(error.message || t('error.addSsid'));
    isRefreshing = false;
    setLoading(false);
    updateMonitoringUi();
  }
};

const removeMonitoredSsid = async (ssid) => {
  if (isRefreshing || !ssid) {
    return;
  }

  if (!ensureApi('updateSettings')) {
    return;
  }

  isRefreshing = true;
  setLoading(true, 'settings');
  setStatus(t('status.savingSettings'), 'loading');

  try {
    const result = await window.quotaLens.updateSettings(
      collectSettingsFromInputs({
        monitoredSsids: currentSettings.monitoredSsids.filter(
          (monitoredSsid) => monitoredSsid.toLowerCase() !== ssid.toLowerCase(),
        ),
      }),
    );

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderSettings(result.settings);
    elements.settingsNote.textContent = tf('settings.ssidRemoved', { ssid });
    isRefreshing = false;
    setLoading(false);
    await refreshUsage();
  } catch (error) {
    renderError(error.message || t('error.removeSsid'));
    isRefreshing = false;
    setLoading(false);
    updateMonitoringUi();
  }
};

const setMonitoringEnabled = (enabled, { refreshOnResume = true } = {}) => {
  monitoringEnabled = enabled;
  updateMonitoringUi();
  scheduleAutoRefresh();
  scheduleSuspectsRefresh();

  if (monitoringEnabled && refreshOnResume && document.visibilityState === 'visible') {
    refreshUsage();
  }
};

const toggleMonitoring = () => {
  setMonitoringEnabled(!monitoringEnabled);
};

const handleVisibilityChange = () => {
  scheduleAutoRefresh();
  scheduleSuspectsRefresh();

  if (document.visibilityState === 'visible' && monitoringEnabled) {
    refreshUsage();
  }
};

const unsubscribeMonitoringCommand = window.quotaLens?.onMonitoringCommand?.((command) => {
  if (command === 'pause') {
    setMonitoringEnabled(false, { refreshOnResume: false });
  }

  if (command === 'resume') {
    setMonitoringEnabled(true);
  }
});

elements.refreshButton.addEventListener('click', () => refreshUsage());
elements.refreshEstimatesButton.addEventListener('click', () => refreshAppUsageEstimates());
elements.refreshRealPerAppUsageButton.addEventListener('click', () => refreshRealPerAppUsage());
elements.refreshSuspectsButton.addEventListener('click', () => refreshAppSuspects());
elements.resetButton.addEventListener('click', resetSession);
elements.clearChartButton.addEventListener('click', clearChartData);
elements.clearHistoryButton.addEventListener('click', clearHistory);
elements.refreshDiagnosticsButton.addEventListener('click', refreshDiagnostics);
elements.openDataFolderButton.addEventListener('click', openDataFolder);
elements.exportDiagnosticsButton.addEventListener('click', exportDiagnostics);
elements.saveSettingsButton.addEventListener('click', saveSettings);
elements.saveStartupButton.addEventListener('click', saveStartupSettings);
elements.addCurrentSsidButton.addEventListener('click', addCurrentSsidToMonitored);
elements.monitoredSsidList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-ssid]');

  if (button) {
    removeMonitoredSsid(button.dataset.ssid);
  }
});
elements.monitoringButton.addEventListener('click', toggleMonitoring);
elements.intervalSelect.addEventListener('change', (event) => {
  const selectedInterval = Number(event.target.value);

  if (refreshIntervalOptions.includes(selectedInterval)) {
    refreshIntervalMs = selectedInterval;
    scheduleAutoRefresh();
  }
});
elements.chartFilterSelect.addEventListener('change', () => {
  renderUsageChart(currentUsageSamples, normalizeSsid(currentWifiInfo?.ssid));
});

document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', () => {
  clearRefreshTimer();
  clearSuspectsTimer();
  unsubscribeMonitoringCommand?.();
});

applyTranslations(currentLanguage);
updateMonitoringUi();
refreshUsage().finally(() => {
  refreshDiagnostics();
  refreshAppUsageEstimates();
  refreshRealPerAppUsage();
});
scheduleAutoRefresh();
scheduleSuspectsRefresh();
