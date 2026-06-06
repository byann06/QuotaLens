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
  developerMode: false,
  miniBarEnabled: true,
  miniBarAlwaysOnTop: true,
  miniBarOpacity: 0.95,
  miniBarSize: 'normal',
  miniBarLayout: 'standard',
  miniBarPosition: 'top-right',
  miniBarLockPosition: false,
  miniBarShowBorder: true,
  miniBarGamingMode: false,
  miniBarClickThrough: false,
  miniBarHideButtonsUntilHover: true,
  miniBarConfirmHide: true,
  miniBarShowSsid: true,
  miniBarShowTodayUsage: true,
  miniBarShowSessionUsage: true,
  miniBarShowTopApp: true,
  miniBarShowStatus: true,
  miniBarShowRefreshButton: true,
  miniBarShowOpenButton: true,
  miniBarShowResetButton: false,
  miniBarShowHideButton: true,
  miniBarUseShortLabels: true,
  miniBarBgColor: '#081020',
  miniBarBorderColor: '#1f3b5f',
  miniBarTextColor: '#ffffff',
  miniBarMutedTextColor: '#a9c4e8',
  miniBarAccentColor: '#22c7b8',
  miniBarButtonBgColor: '#101a2f',
  miniBarButtonTextColor: '#ffffff',
  miniBarDangerColor: '#ff6b6b',
  miniBarSafeColor: '#4ade80',
  miniBarWarningColor: '#facc15',
  miniBarExceededColor: '#fb7185',
  language: 'id',
};

const miniBarColorFields = [
  ['miniBarBgColor', 'miniBar.colorBackground'],
  ['miniBarBorderColor', 'miniBar.colorBorder'],
  ['miniBarTextColor', 'miniBar.colorText'],
  ['miniBarMutedTextColor', 'miniBar.colorMutedText'],
  ['miniBarAccentColor', 'miniBar.colorAccent'],
  ['miniBarButtonBgColor', 'miniBar.colorButtonBg'],
  ['miniBarButtonTextColor', 'miniBar.colorButtonText'],
  ['miniBarDangerColor', 'miniBar.colorDanger'],
  ['miniBarSafeColor', 'miniBar.colorSafe'],
  ['miniBarWarningColor', 'miniBar.colorWarning'],
  ['miniBarExceededColor', 'miniBar.colorExceeded'],
];

const miniBarColorCssVars = {
  miniBarBgColor: '--mini-bar-bg-color',
  miniBarBorderColor: '--mini-bar-border-color',
  miniBarTextColor: '--mini-bar-text-color',
  miniBarMutedTextColor: '--mini-bar-muted-text-color',
  miniBarAccentColor: '--mini-bar-accent-color',
  miniBarButtonBgColor: '--mini-bar-button-bg-color',
  miniBarButtonTextColor: '--mini-bar-button-text-color',
  miniBarDangerColor: '--mini-bar-danger-color',
  miniBarSafeColor: '--mini-bar-safe-color',
  miniBarWarningColor: '--mini-bar-warning-color',
  miniBarExceededColor: '--mini-bar-exceeded-color',
};

const miniBarDefaultColorSettings = Object.fromEntries(
  miniBarColorFields.map(([key]) => [key, fallbackSettings[key]]),
);

let currentLanguage = fallbackSettings.language;
const isMiniBarWindow = new URLSearchParams(window.location.search).get('mode') === 'mini';

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

const normalizeOpacityInput = (value, fallback = fallbackSettings.miniBarOpacity) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  if (numericValue > 1) {
    return Math.min(1, Math.max(0, Math.round(numericValue) / 100));
  }

  return Math.min(1, Math.max(0, numericValue));
};

const opacityToSliderValue = (value) => Math.round(normalizeOpacityInput(value) * 100);

const normalizeHexColorInput = (value, fallback = null) => {
  const rawValue = String(value || '').trim().toLowerCase();
  const color = rawValue.startsWith('#') ? rawValue : `#${rawValue}`;

  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${color
      .slice(1)
      .split('')
      .map((character) => `${character}${character}`)
      .join('')}`;
  }

  if (/^#[0-9a-f]{6}$/.test(color)) {
    return color;
  }

  return fallback;
};

const hexToRgbParts = (hexColor) => {
  const color = normalizeHexColorInput(hexColor, '#081020').slice(1);
  const channels = color.match(/.{2}/g) || ['08', '10', '20'];

  return channels.map((channel) => Number.parseInt(channel, 16)).join(', ');
};

const getMiniBarColorSettings = (settings = currentSettings) =>
  Object.fromEntries(
    miniBarColorFields.map(([key]) => [
      key,
      normalizeHexColorInput(settings[key], fallbackSettings[key]),
    ]),
  );

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

document.documentElement.classList.toggle('mini-mode', isMiniBarWindow);
document.body.classList.toggle('mini-mode', isMiniBarWindow);

app.innerHTML = `
  <section class="shell">
    <section class="mini-bar-panel" aria-live="polite">
      <div class="mini-drag-strip">
        <strong class="mini-brand" id="miniBrand">QuotaLens</strong>
        <span class="mini-dot" id="miniDot">|</span>
        <span class="mini-ssid" id="miniWifiSsid">Mendeteksi...</span>
        <span class="mini-metric" id="miniTodayGroup"><b data-i18n="mini.todayShort" id="miniTodayLabel">Hari ini</b> <strong id="miniTodayUsage">-</strong></span>
        <span class="mini-metric" id="miniSessionGroup"><b data-i18n="mini.sessionShort" id="miniSessionLabel">Sesi</b> <strong id="miniSessionUsage">-</strong></span>
        <span class="mini-metric mini-top-app" id="miniTopAppGroup"><b data-i18n="mini.topShort" id="miniTopLabel">Top</b> <strong id="miniTopApp">-</strong></span>
        <span class="mini-status" id="miniLimitStatus">-</span>
      </div>
      <div class="mini-actions" id="miniActions">
        <button class="mini-icon-button" data-title-i18n="button.refreshStats" id="miniRefreshButton" type="button">⟳</button>
        <button class="mini-icon-button" data-title-i18n="button.openMainApp" id="miniOpenMainButton" type="button">↗</button>
        <button class="mini-icon-button" data-title-i18n="button.resetSession" id="miniResetButton" type="button">↺</button>
        <button class="mini-icon-button danger" data-title-i18n="button.hideMiniBar" id="miniHideButton" type="button">×</button>
      </div>
    </section>

    <nav class="app-sidebar">
      <div class="sidebar-brand">
        <strong>QuotaLens</strong>
        <span data-i18n="app.tagline">Pemantau Kuota Desktop</span>
      </div>
      <button class="nav-button active" data-page-target="dashboard" data-i18n="nav.dashboard" type="button">Beranda</button>
      <button class="nav-button" data-page-target="apps" data-i18n="nav.apps" type="button">Pemakaian Aplikasi</button>
      <button class="nav-button" data-page-target="history" data-i18n="nav.history" type="button">Riwayat</button>
      <button class="nav-button" data-page-target="miniBar" data-i18n="nav.miniBar" type="button">Mini Bar</button>
      <button class="nav-button" data-page-target="settings" data-i18n="nav.settings" type="button">Pengaturan</button>
      <button class="nav-button developer-nav" data-page-target="developer" data-i18n="nav.developer" type="button">Developer</button>
    </nav>

    <main class="app-content">
    <header class="topbar" data-page="dashboard">
      <div>
        <p class="eyebrow" data-i18n="app.tagline">Pemantau Kuota Desktop</p>
        <h1>QuotaLens</h1>
      </div>
      <div class="connection-pill" id="statusPill">
        <span class="status-dot"></span>
        <span id="statusText">Memuat sesi</span>
      </div>
    </header>

    <section class="hero" data-page="dashboard">
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
          <button class="secondary-button" data-i18n="button.openMiniBar" id="openMiniBarButton" type="button">Buka Mini Bar</button>
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

    <p class="error-message" id="errorMessage" role="alert" data-page="dashboard apps history miniBar settings developer"></p>

    <section class="stats-grid" aria-live="polite" data-page="dashboard">
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

    <section class="home-top-apps" data-page="dashboard">
      <div class="section-heading">
        <div>
          <p class="section-label" data-i18n="dashboard.topApps">Top 3 Aplikasi Boros</p>
          <h3 data-i18n="dashboard.topAppsSubtitle">Ringkasan dari riwayat SRUM</h3>
        </div>
        <button class="secondary-button" data-page-target="apps" data-i18n="button.viewAllApps" type="button">Lihat Semua</button>
      </div>
      <div class="top-apps-list" id="dashboardTopAppsList">
        <p class="history-empty" data-i18n="dashboard.topAppsEmpty">Data aplikasi belum tersedia.</p>
      </div>
    </section>

    <section class="details-panel developer-only" data-page="developer">
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

    <section class="chart-panel" data-page="history">
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

    <section class="suspects-panel developer-only" data-page="developer">
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

    <section class="estimates-panel developer-only" data-page="developer">
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

    <section class="per-app-panel" data-page="apps developer">
      <div class="per-app-header">
        <div>
          <p class="section-label" data-i18n="perApp.title">Pemakaian Kuota per Aplikasi (Eksperimental)</p>
          <h3 data-i18n="perApp.subtitle">Prototype pembacaan byte per proses</h3>
        </div>
        <div class="per-app-actions">
          <label>
            <span data-i18n="perApp.periodFilter">Periode</span>
            <select id="realPerAppPeriodSelect">
              <option data-i18n="perApp.periodToday" selected value="today">Hari ini</option>
              <option data-i18n="perApp.period7d" value="7d">7 hari terakhir</option>
              <option data-i18n="perApp.period30d" value="30d">30 hari terakhir</option>
              <option data-i18n="perApp.periodAll" value="all">Semua riwayat</option>
            </select>
          </label>
          <button class="secondary-button" data-i18n="button.refreshPerAppUsage" id="refreshRealPerAppUsageButton" type="button">Segarkan Per Aplikasi</button>
        </div>
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
        <div class="developer-only">
          <span data-i18n="perApp.accessStatus">Status Akses SRUM</span>
          <strong id="realPerAppAccessStatus">-</strong>
        </div>
        <div class="developer-only">
          <span data-i18n="perApp.parseStatus">Status Parser</span>
          <strong id="realPerAppParseStatus">-</strong>
        </div>
        <div>
          <span data-i18n="perApp.activePeriod">Periode Aktif</span>
          <strong id="realPerAppPeriodActive">Hari ini</strong>
        </div>
      </div>
      <p class="per-app-unsupported" id="realPerAppUsageReason"></p>
      <div class="per-app-list" id="realPerAppUsageList">
        <p class="history-empty" data-i18n="perApp.notRefreshed">Pemakaian per aplikasi belum dicek.</p>
      </div>
      <p class="settings-note" id="realPerAppUsageNote">-</p>
    </section>

    <section class="history-panel" data-page="history">
      <div class="history-header">
        <div>
          <p class="section-label" data-i18n="history.title">Riwayat Lokal</p>
          <h3 data-i18n="history.recentSessions">Sesi Terbaru</h3>
        </div>
        <div class="history-actions">
          <label>
            <span data-i18n="history.filter">Filter</span>
            <select id="historyFilterSelect">
              <option data-i18n="history.filterRecent" value="recent">Sesi terbaru</option>
              <option data-i18n="label.today" value="today">Hari ini</option>
              <option data-i18n="history.filterAll" value="all">Semua</option>
            </select>
          </label>
          <button class="danger-button" data-i18n="button.clearHistory" id="clearHistoryButton" type="button">Hapus Riwayat</button>
        </div>
      </div>
      <div class="history-list" id="historyList">
        <p class="history-empty" data-i18n="history.empty">Belum ada sesi yang selesai.</p>
      </div>
    </section>

    <section class="mini-bar-config-panel" data-page="miniBar">
      <div class="settings-header">
        <div>
          <p class="section-label" data-i18n="miniBar.pageLabel">Mini Bar</p>
          <h3 data-i18n="miniBar.pageTitle">Personalisasi Mini Bar</h3>
        </div>
        <div class="mini-bar-settings-actions">
          <button class="secondary-button" data-i18n="button.openMiniBar" id="openMiniBarSettingsButton" type="button">Buka Mini Bar</button>
          <button class="secondary-button" data-i18n="button.hideMiniBar" id="hideMiniBarSettingsButton" type="button">Sembunyikan</button>
          <button class="secondary-button" data-i18n="button.resetMiniBarColors" id="resetMiniBarColorsButton" type="button">Reset Warna Mini Bar</button>
          <button class="refresh-button" data-i18n="button.resetMiniBarAppearance" id="resetMiniBarSettingsButton" type="button">Reset Tampilan Mini Bar</button>
        </div>
      </div>

      <div class="mini-bar-status-grid">
        <div>
          <span data-i18n="miniBar.status">Status Mini Bar</span>
          <strong id="miniBarStatusText">-</strong>
        </div>
        <div>
          <span data-i18n="miniBar.currentPosition">Posisi saat ini</span>
          <strong id="miniBarPositionStatus">-</strong>
        </div>
        <div>
          <span data-i18n="miniBar.currentLayout">Layout saat ini</span>
          <strong id="miniBarLayoutStatus">-</strong>
        </div>
        <div>
          <span data-i18n="miniBar.currentSize">Ukuran saat ini</span>
          <strong id="miniBarSizeStatus">-</strong>
        </div>
      </div>

      <div class="mini-bar-config-grid">
        <article class="mini-settings-card">
          <p class="settings-group-title" data-i18n="miniBar.sectionStatus">Status Mini Bar</p>
          <label class="toggle-control">
            <input id="miniBarEnabledInput" type="checkbox" />
            <span data-i18n="settings.miniBarEnabled">Aktif</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarAlwaysOnTopInput" type="checkbox" />
            <span data-i18n="settings.miniBarAlwaysOnTop">Selalu di atas</span>
          </label>
        </article>

        <article class="mini-settings-card">
          <p class="settings-group-title" data-i18n="miniBar.sectionAppearance">Tampilan</p>
          <label>
            <span data-i18n="settings.miniBarSize">Ukuran</span>
            <select id="miniBarSizeSelect">
              <option data-i18n="settings.miniBarSizeCompact" value="compact">Compact</option>
              <option data-i18n="settings.miniBarSizeNormal" value="normal">Normal</option>
              <option data-i18n="settings.miniBarSizeWide" value="wide">Wide</option>
            </select>
          </label>
          <label>
            <span data-i18n="settings.miniBarLayout">Layout</span>
            <select id="miniBarLayoutSelect">
              <option data-i18n="settings.miniBarLayoutMinimal" value="minimal">Minimal</option>
              <option data-i18n="settings.miniBarLayoutStandard" value="standard">Standard</option>
              <option data-i18n="settings.miniBarLayoutDetailed" value="detailed">Detailed</option>
            </select>
          </label>
          <label class="range-control">
            <span id="miniBarOpacityLabel">Opacity Background Mini Bar: 95%</span>
            <div class="range-row">
              <input id="miniBarOpacityInput" max="100" min="0" step="1" type="range" value="95" />
              <strong class="range-value" id="miniBarOpacityValue">95%</strong>
            </div>
            <small data-i18n="settings.miniBarOpacityHelp">Transparansi latar Mini Bar</small>
          </label>
          <p class="settings-note compact-note" data-i18n="miniBar.gamingTip">Gunakan mode compact + minimal untuk gaming.</p>
        </article>

        <article class="mini-settings-card">
          <p class="settings-group-title" data-i18n="miniBar.sectionData">Data yang Ditampilkan</p>
          <label class="toggle-control">
            <input id="miniBarShowSsidInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowSsid">Tampilkan SSID</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarShowTodayUsageInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowTodayUsage">Tampilkan Hari Ini</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarShowSessionUsageInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowSessionUsage">Tampilkan Sesi</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarShowTopAppInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowTopApp">Tampilkan Top App</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarShowStatusInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowStatus">Tampilkan Status</span>
          </label>
        </article>

        <article class="mini-settings-card">
          <p class="settings-group-title" data-i18n="miniBar.sectionButtons">Tombol yang Ditampilkan</p>
          <label class="toggle-control">
            <input id="miniBarShowRefreshButtonInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowRefreshButton">Tombol Refresh</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarShowOpenButtonInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowOpenButton">Tombol Buka App</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarShowResetButtonInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowResetButton">Tombol Reset</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarShowHideButtonInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowHideButton">Tombol Hide</span>
          </label>
        </article>

        <article class="mini-settings-card">
          <p class="settings-group-title" data-i18n="miniBar.sectionBehavior">Posisi dan Perilaku</p>
          <label>
            <span data-i18n="settings.miniBarPosition">Posisi</span>
            <select id="miniBarPositionSelect">
              <option data-i18n="settings.positionTopLeft" value="top-left">Kiri atas</option>
              <option data-i18n="settings.positionTopRight" value="top-right">Kanan atas</option>
              <option data-i18n="settings.positionBottomLeft" value="bottom-left">Kiri bawah</option>
              <option data-i18n="settings.positionBottomRight" value="bottom-right">Kanan bawah</option>
              <option data-i18n="settings.positionCustom" value="custom">Custom</option>
            </select>
          </label>
          <label class="toggle-control">
            <input id="miniBarLockPositionInput" type="checkbox" />
            <span data-i18n="settings.miniBarLockPosition">Lock posisi</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarShowBorderInput" type="checkbox" />
            <span data-i18n="settings.miniBarShowBorder">Tampilkan border Mini Bar</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarUseShortLabelsInput" type="checkbox" />
            <span data-i18n="settings.miniBarUseShortLabels">Gunakan label pendek</span>
          </label>
        </article>

        <article class="mini-settings-card">
          <p class="settings-group-title" data-i18n="miniBar.sectionGaming">Mode Gaming</p>
          <label class="toggle-control">
            <input id="miniBarGamingModeInput" type="checkbox" />
            <span data-i18n="settings.miniBarGamingMode">Mode Gaming</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarHideButtonsUntilHoverInput" type="checkbox" />
            <span data-i18n="settings.miniBarHideButtonsUntilHover">Sembunyikan tombol sampai hover</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarConfirmHideInput" type="checkbox" />
            <span data-i18n="settings.miniBarConfirmHide">Konfirmasi sebelum sembunyikan</span>
          </label>
          <label class="toggle-control">
            <input id="miniBarClickThroughInput" type="checkbox" />
            <span data-i18n="settings.miniBarClickThrough">Abaikan klik mouse</span>
          </label>
          <small class="compact-note" data-i18n="miniBar.gamingModeHelp">
            Mode ini mengurangi salah klik saat gaming. Jika abaikan klik aktif, klik akan diteruskan ke aplikasi di belakang Mini Bar.
          </small>
        </article>

        <article class="mini-settings-card mini-colors-card">
          <p class="settings-group-title" data-i18n="miniBar.sectionColors">Warna Mini Bar</p>
          <div class="mini-color-grid">
            ${miniBarColorFields
              .map(
                ([key, labelKey]) => `
                  <label class="mini-color-control">
                    <span data-i18n="${labelKey}">${labelKey}</span>
                    <input data-mini-color-picker="${key}" type="color" value="${fallbackSettings[key]}" />
                    <input data-mini-color-text="${key}" spellcheck="false" type="text" value="${fallbackSettings[key]}" />
                  </label>
                `,
              )
              .join('')}
          </div>
          <small class="color-error" data-i18n="miniBar.invalidColor" id="miniBarColorError" hidden>Format warna tidak valid.</small>
          <small class="compact-note" data-i18n="miniBar.colorAutoSaveNote">Perubahan warna tersimpan otomatis.</small>
        </article>

        <article class="mini-settings-card mini-preview-card">
          <p class="settings-group-title" data-i18n="miniBar.sectionPreview">Preview</p>
          <div class="mini-preview-stage">
            <div class="mini-preview-bar" id="miniBarPreview"></div>
          </div>
        </article>
      </div>

      <p class="settings-note" data-i18n="miniBar.autoSaveNote" id="miniBarAutoSaveNote">Perubahan Mini Bar tersimpan otomatis.</p>
    </section>

    <section class="settings-panel" data-page="settings">
      <div class="settings-header">
        <div>
          <p class="section-label" data-i18n="settings.general">Umum</p>
          <h3 data-i18n="settings.limitWarning">Peringatan Batas</h3>
        </div>
        <button class="refresh-button" data-i18n="button.saveSettings" id="saveSettingsButton" type="button">Simpan Pengaturan</button>
      </div>
      <div class="settings-grid">
        <p class="settings-group-title" data-i18n="settings.monitoring">Monitoring</p>
        <label>
          <span data-i18n="settings.dailyLimit">Batas Harian (GB)</span>
          <input id="dailyLimitInput" min="0.1" step="0.1" type="number" />
        </label>
        <label>
          <span data-i18n="settings.sessionLimit">Batas Sesi (GB)</span>
          <input id="sessionLimitInput" min="0.1" step="0.1" type="number" />
        </label>
        <label class="toggle-control">
          <input id="notificationsEnabledInput" type="checkbox" />
          <span data-i18n="settings.notificationsEnabled">Notifikasi Aktif</span>
        </label>
        <p class="settings-group-title" data-i18n="settings.display">Tampilan</p>
        <label>
          <span data-i18n="settings.language">Bahasa</span>
          <select id="languageSelect">
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
          </select>
        </label>
        <label class="toggle-control">
          <input id="developerModeInput" type="checkbox" />
          <span data-i18n="settings.developerMode">Developer Mode</span>
        </label>
        <p class="settings-group-title" data-i18n="settings.networkTarget">Target Jaringan</p>
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

    <section class="settings-panel" data-page="settings">
      <div class="settings-header">
        <div>
          <p class="section-label" data-i18n="startup.appBehavior">Perilaku Aplikasi</p>
          <h3 data-i18n="startup.title">Startup</h3>
        </div>
        <div class="startup-actions">
          <button class="secondary-button" data-i18n="button.createDesktopShortcut" id="createShortcutButton" type="button">Buat Shortcut Desktop</button>
          <button class="refresh-button" data-i18n="button.saveStartupSettings" id="saveStartupButton" type="button">Simpan Pengaturan Startup</button>
        </div>
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

    <section class="settings-panel developer-only" data-page="developer">
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

    <section class="settings-panel developer-only" data-page="developer">
      <div class="settings-header">
        <div>
          <p class="section-label" data-i18n="storage.title">Penyimpanan & Cache</p>
          <h3 data-i18n="storage.srumCache">Cache SRUM</h3>
        </div>
        <div class="diagnostics-actions">
          <button class="secondary-button" data-i18n="button.refreshCacheStatus" id="refreshStorageStatusButton" type="button">Segarkan Status Cache</button>
          <button class="danger-button" data-i18n="button.clearSrumCache" id="clearSrumCacheButton" type="button">Bersihkan Cache SRUM</button>
        </div>
      </div>
      <div class="diagnostics-grid">
        <div class="diagnostics-wide">
          <span data-i18n="storage.srumCachePath">Path Cache SRUM</span>
          <strong id="storageSrumCachePath">-</strong>
        </div>
        <div>
          <span data-i18n="storage.cacheSize">Ukuran Cache</span>
          <strong id="storageSrumCacheSize">-</strong>
        </div>
        <div>
          <span data-i18n="storage.folderCount">Jumlah Folder</span>
          <strong id="storageSrumFolderCount">-</strong>
        </div>
        <div>
          <span data-i18n="storage.fileCount">Jumlah File</span>
          <strong id="storageSrumFileCount">-</strong>
        </div>
        <div>
          <span data-i18n="storage.lastChecked">Terakhir Dicek</span>
          <strong id="storageLastChecked">-</strong>
        </div>
      </div>
      <p class="settings-note" id="storageNote" data-i18n="storage.notChecked">Status cache belum dicek.</p>
    </section>
    </main>
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
  createShortcutButton: document.querySelector('#createShortcutButton'),
  downloadSession: document.querySelector('#downloadSession'),
  errorMessage: document.querySelector('#errorMessage'),
  estimateAverageSpeed: document.querySelector('#estimateAverageSpeed'),
  estimateDeltaUsage: document.querySelector('#estimateDeltaUsage'),
  estimateDuration: document.querySelector('#estimateDuration'),
  estimatesList: document.querySelector('#estimatesList'),
  estimatesStatus: document.querySelector('#estimatesStatus'),
  historyFilterSelect: document.querySelector('#historyFilterSelect'),
  historyList: document.querySelector('#historyList'),
  hideMiniBarSettingsButton: document.querySelector('#hideMiniBarSettingsButton'),
  dailyLimitInput: document.querySelector('#dailyLimitInput'),
  dashboardTopAppsList: document.querySelector('#dashboardTopAppsList'),
  developerModeInput: document.querySelector('#developerModeInput'),
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
  miniHideButton: document.querySelector('#miniHideButton'),
  miniBarAlwaysOnTopInput: document.querySelector('#miniBarAlwaysOnTopInput'),
  miniActions: document.querySelector('#miniActions'),
  miniBarAutoSaveNote: document.querySelector('#miniBarAutoSaveNote'),
  miniBarColorError: document.querySelector('#miniBarColorError'),
  miniBarColorPickers: document.querySelectorAll('[data-mini-color-picker]'),
  miniBarColorTexts: document.querySelectorAll('[data-mini-color-text]'),
  miniBarEnabledInput: document.querySelector('#miniBarEnabledInput'),
  miniBarGamingModeInput: document.querySelector('#miniBarGamingModeInput'),
  miniBrand: document.querySelector('#miniBrand'),
  miniDot: document.querySelector('#miniDot'),
  miniBarLayoutSelect: document.querySelector('#miniBarLayoutSelect'),
  miniBarLayoutStatus: document.querySelector('#miniBarLayoutStatus'),
  miniBarLockPositionInput: document.querySelector('#miniBarLockPositionInput'),
  miniBarShowBorderInput: document.querySelector('#miniBarShowBorderInput'),
  miniBarClickThroughInput: document.querySelector('#miniBarClickThroughInput'),
  miniBarConfirmHideInput: document.querySelector('#miniBarConfirmHideInput'),
  miniBarHideButtonsUntilHoverInput: document.querySelector('#miniBarHideButtonsUntilHoverInput'),
  miniBarOpacityInput: document.querySelector('#miniBarOpacityInput'),
  miniBarOpacityLabel: document.querySelector('#miniBarOpacityLabel'),
  miniBarOpacityValue: document.querySelector('#miniBarOpacityValue'),
  miniBarPositionSelect: document.querySelector('#miniBarPositionSelect'),
  miniBarPositionStatus: document.querySelector('#miniBarPositionStatus'),
  miniBarPreview: document.querySelector('#miniBarPreview'),
  miniBarShowHideButtonInput: document.querySelector('#miniBarShowHideButtonInput'),
  miniBarShowOpenButtonInput: document.querySelector('#miniBarShowOpenButtonInput'),
  miniBarShowRefreshButtonInput: document.querySelector('#miniBarShowRefreshButtonInput'),
  miniBarShowResetButtonInput: document.querySelector('#miniBarShowResetButtonInput'),
  miniBarShowSessionUsageInput: document.querySelector('#miniBarShowSessionUsageInput'),
  miniBarShowSsidInput: document.querySelector('#miniBarShowSsidInput'),
  miniBarShowStatusInput: document.querySelector('#miniBarShowStatusInput'),
  miniBarShowTodayUsageInput: document.querySelector('#miniBarShowTodayUsageInput'),
  miniBarShowTopAppInput: document.querySelector('#miniBarShowTopAppInput'),
  miniBarSizeSelect: document.querySelector('#miniBarSizeSelect'),
  miniBarSizeStatus: document.querySelector('#miniBarSizeStatus'),
  miniBarStatusText: document.querySelector('#miniBarStatusText'),
  miniBarUseShortLabelsInput: document.querySelector('#miniBarUseShortLabelsInput'),
  miniLimitStatus: document.querySelector('#miniLimitStatus'),
  miniOpenMainButton: document.querySelector('#miniOpenMainButton'),
  miniRefreshButton: document.querySelector('#miniRefreshButton'),
  miniResetButton: document.querySelector('#miniResetButton'),
  miniSessionGroup: document.querySelector('#miniSessionGroup'),
  miniSessionLabel: document.querySelector('#miniSessionLabel'),
  miniSessionUsage: document.querySelector('#miniSessionUsage'),
  miniTodayGroup: document.querySelector('#miniTodayGroup'),
  miniTodayLabel: document.querySelector('#miniTodayLabel'),
  miniTodayUsage: document.querySelector('#miniTodayUsage'),
  miniTopApp: document.querySelector('#miniTopApp'),
  miniTopAppGroup: document.querySelector('#miniTopAppGroup'),
  miniTopLabel: document.querySelector('#miniTopLabel'),
  miniWifiSsid: document.querySelector('#miniWifiSsid'),
  networkTargetStatus: document.querySelector('#networkTargetStatus'),
  navButtons: document.querySelectorAll('[data-page-target]'),
  notificationsEnabledInput: document.querySelector('#notificationsEnabledInput'),
  openMiniBarButton: document.querySelector('#openMiniBarButton'),
  openMiniBarSettingsButton: document.querySelector('#openMiniBarSettingsButton'),
  pageSections: document.querySelectorAll('[data-page]'),
  primaryWifiSsid: document.querySelector('#primaryWifiSsid'),
  rawReceivedBytes: document.querySelector('#rawReceivedBytes'),
  rawSentBytes: document.querySelector('#rawSentBytes'),
  rawTotalBytes: document.querySelector('#rawTotalBytes'),
  realPerAppAccessStatus: document.querySelector('#realPerAppAccessStatus'),
  realPerAppUsageList: document.querySelector('#realPerAppUsageList'),
  realPerAppUsageNote: document.querySelector('#realPerAppUsageNote'),
  realPerAppParseStatus: document.querySelector('#realPerAppParseStatus'),
  realPerAppPeriodActive: document.querySelector('#realPerAppPeriodActive'),
  realPerAppPeriodSelect: document.querySelector('#realPerAppPeriodSelect'),
  realPerAppUsageReason: document.querySelector('#realPerAppUsageReason'),
  realPerAppUsageSource: document.querySelector('#realPerAppUsageSource'),
  realPerAppUsageStatus: document.querySelector('#realPerAppUsageStatus'),
  refreshStorageStatusButton: document.querySelector('#refreshStorageStatusButton'),
  openDataFolderButton: document.querySelector('#openDataFolderButton'),
  refreshDiagnosticsButton: document.querySelector('#refreshDiagnosticsButton'),
  refreshEstimatesButton: document.querySelector('#refreshEstimatesButton'),
  refreshRealPerAppUsageButton: document.querySelector('#refreshRealPerAppUsageButton'),
  refreshButton: document.querySelector('#refreshButton'),
  resetButton: document.querySelector('#resetButton'),
  resetMiniBarColorsButton: document.querySelector('#resetMiniBarColorsButton'),
  resetMiniBarSettingsButton: document.querySelector('#resetMiniBarSettingsButton'),
  refreshSuspectsButton: document.querySelector('#refreshSuspectsButton'),
  saveSettingsButton: document.querySelector('#saveSettingsButton'),
  saveStartupButton: document.querySelector('#saveStartupButton'),
  sessionLimitInput: document.querySelector('#sessionLimitInput'),
  sessionUsage: document.querySelector('#sessionUsage'),
  settingsNote: document.querySelector('#settingsNote'),
  startMinimizedInput: document.querySelector('#startMinimizedInput'),
  startupNote: document.querySelector('#startupNote'),
  storageLastChecked: document.querySelector('#storageLastChecked'),
  storageNote: document.querySelector('#storageNote'),
  storageSrumCachePath: document.querySelector('#storageSrumCachePath'),
  storageSrumCacheSize: document.querySelector('#storageSrumCacheSize'),
  storageSrumFileCount: document.querySelector('#storageSrumFileCount'),
  storageSrumFolderCount: document.querySelector('#storageSrumFolderCount'),
  clearSrumCacheButton: document.querySelector('#clearSrumCacheButton'),
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
let selectedRealPerAppPeriod = 'today';
let selectedHistoryFilter = 'recent';
let currentUsageSamples = [];
let currentHistorySessions = [];
let lastSsid = null;
let isDiagnosticsLoading = false;
let miniBarAutoSaveTimerId = null;
let miniBarVisualApplyTimerId = null;
let activePage = isMiniBarWindow ? 'dashboard' : 'dashboard';
let currentStartupSettings = {
  launchAtStartup: false,
  startMinimizedToTray: false,
  isPackaged: false,
};

const isDeveloperModeEnabled = () => Boolean(currentSettings.developerMode);

const setActivePage = (page) => {
  const requestedPage = page || 'dashboard';
  activePage = requestedPage === 'developer' && !isDeveloperModeEnabled()
    ? 'dashboard'
    : requestedPage;

  document.body.dataset.page = activePage;
  document.body.classList.toggle('developer-mode', isDeveloperModeEnabled());

  elements.pageSections.forEach((section) => {
    const pages = String(section.dataset.page || '').split(/\s+/).filter(Boolean);
    const isDeveloperOnly = section.classList.contains('developer-only');
    const shouldShow = pages.includes(activePage) && (!isDeveloperOnly || isDeveloperModeEnabled());

    section.hidden = !shouldShow;
  });

  elements.navButtons.forEach((button) => {
    const isDeveloperNav = button.classList.contains('developer-nav');

    if (isDeveloperNav) {
      button.hidden = !isDeveloperModeEnabled();
    }

    button.classList.toggle('active', button.dataset.pageTarget === activePage);
  });
};

const refreshDeveloperModeUi = () => {
  document.body.classList.toggle('developer-mode', isDeveloperModeEnabled());
  setActivePage(activePage);
  scheduleSuspectsRefresh();
};

const setElementVisible = (element, visible) => {
  if (element) {
    element.hidden = !visible;
    element.style.display = visible ? '' : 'none';
  }
};

const toOpacityPercent = (value) => `${opacityToSliderValue(value)}%`;

const updateMiniBarOpacityPreview = (value) => {
  const opacity = normalizeOpacityInput(value);
  const percent = toOpacityPercent(opacity);

  document.documentElement.style.setProperty('--mini-bar-bg-opacity', String(opacity));

  if (elements.miniBarOpacityLabel) {
    elements.miniBarOpacityLabel.textContent = `${t('settings.miniBarOpacity')}: ${percent}`;
  }

  if (elements.miniBarOpacityValue) {
    elements.miniBarOpacityValue.textContent = percent;
  }
};

const applyMiniBarColorVariables = (settings = currentSettings, target = document.documentElement) => {
  const colors = getMiniBarColorSettings(settings);

  Object.entries(miniBarColorCssVars).forEach(([key, cssVariable]) => {
    target.style.setProperty(cssVariable, colors[key]);
  });

  target.style.setProperty('--mini-bar-bg-color-rgb', hexToRgbParts(colors.miniBarBgColor));
};

const getMiniBarVisibleParts = (settings = currentSettings) => {
  const layout = settings.miniBarLayout || 'standard';
  const enabled = Boolean(settings.miniBarEnabled);
  const hasVisibleData =
    Boolean(settings.miniBarShowSsid) ||
    Boolean(settings.miniBarShowTodayUsage) ||
    Boolean(settings.miniBarShowSessionUsage) ||
    Boolean(settings.miniBarShowTopApp) ||
    Boolean(settings.miniBarShowStatus);

  return {
    brand: !enabled || layout !== 'minimal' || !hasVisibleData,
    ssid: enabled && layout !== 'minimal' && Boolean(settings.miniBarShowSsid),
    today: enabled && Boolean(settings.miniBarShowTodayUsage),
    session: enabled && Boolean(settings.miniBarShowSessionUsage),
    topApp: enabled && layout === 'detailed' && Boolean(settings.miniBarShowTopApp),
    status: enabled && Boolean(settings.miniBarShowStatus),
    refreshButton: enabled && Boolean(settings.miniBarShowRefreshButton),
    openButton: enabled && Boolean(settings.miniBarShowOpenButton),
    resetButton: enabled && Boolean(settings.miniBarShowResetButton),
    hideButton: enabled && Boolean(settings.miniBarShowHideButton),
  };
};

const getMiniBarLabel = (type, value) => {
  const labels = {
    position: {
      'top-left': 'settings.positionTopLeft',
      'top-right': 'settings.positionTopRight',
      'bottom-left': 'settings.positionBottomLeft',
      'bottom-right': 'settings.positionBottomRight',
      custom: 'settings.positionCustom',
    },
    layout: {
      minimal: 'settings.miniBarLayoutMinimal',
      standard: 'settings.miniBarLayoutStandard',
      detailed: 'settings.miniBarLayoutDetailed',
    },
    size: {
      compact: 'settings.miniBarSizeCompact',
      normal: 'settings.miniBarSizeNormal',
      wide: 'settings.miniBarSizeWide',
    },
  };
  const key = labels[type]?.[value];

  return key ? t(key) : value || '-';
};

const renderMiniBarPreview = () => {
  if (!elements.miniBarPreview) {
    return;
  }

  const settings = currentSettings;
  const visibleParts = getMiniBarVisibleParts(settings);
  const previewSsid = currentWifiInfo?.ssid || 'Yayay';
  const previewToday = elements.miniTodayUsage.textContent !== '-' ? elements.miniTodayUsage.textContent : '1.23 GB';
  const previewSession =
    elements.miniSessionUsage.textContent !== '-' ? elements.miniSessionUsage.textContent : '8.94 MB';
  const previewTop = elements.miniTopApp.textContent !== '-' ? elements.miniTopApp.textContent : 'Steam 20.10 GB';
  const previewStatus =
    elements.miniLimitStatus.textContent !== '-' ? elements.miniLimitStatus.textContent : t('status.safe');
  const items = [];

  if (visibleParts.brand) {
    items.push('<strong class="mini-preview-brand">QuotaLens</strong>');
  }

  if (visibleParts.ssid) {
    items.push(`<span class="mini-preview-ssid">${escapeHtml(previewSsid)}</span>`);
  }

  if (visibleParts.today) {
    items.push(
      `<span><b>${escapeHtml(t('mini.todayShort'))}</b> <strong>${escapeHtml(previewToday)}</strong></span>`,
    );
  }

  if (visibleParts.session) {
    items.push(
      `<span><b>${escapeHtml(t('mini.sessionShort'))}</b> <strong>${escapeHtml(previewSession)}</strong></span>`,
    );
  }

  if (visibleParts.topApp) {
    items.push(
      `<span><b>${escapeHtml(t('mini.topShort'))}</b> <strong>${escapeHtml(previewTop)}</strong></span>`,
    );
  }

  if (visibleParts.status) {
    items.push(`<span class="mini-status">${escapeHtml(previewStatus)}</span>`);
  }

  const actions = [
    visibleParts.refreshButton ? '<button type="button">⟳</button>' : '',
    visibleParts.openButton ? '<button type="button">↗</button>' : '',
    visibleParts.resetButton ? '<button type="button">↺</button>' : '',
    visibleParts.hideButton ? '<button class="danger" type="button">×</button>' : '',
  ].filter(Boolean);

  elements.miniBarPreview.dataset.miniSize = settings.miniBarSize || 'normal';
  elements.miniBarPreview.dataset.miniLayout = settings.miniBarLayout || 'standard';
  elements.miniBarPreview.classList.toggle('mini-gaming-mode', Boolean(settings.miniBarGamingMode));
  elements.miniBarPreview.classList.toggle('mini-no-border', !settings.miniBarShowBorder);
  elements.miniBarPreview.classList.toggle(
    'mini-hide-actions-until-hover',
    Boolean(settings.miniBarGamingMode && settings.miniBarHideButtonsUntilHover),
  );
  elements.miniBarPreview.style.setProperty(
    '--mini-bar-bg-opacity',
    String(normalizeOpacityInput(settings.miniBarOpacity)),
  );
  applyMiniBarColorVariables(settings, elements.miniBarPreview);
  elements.miniBarPreview.innerHTML = `
    <div class="mini-preview-content">${items.join('<i aria-hidden="true"></i>')}</div>
    ${
      actions.length
        ? `<div class="mini-preview-actions">${actions.join('')}</div>`
        : ''
    }
  `;
};

const renderMiniBarSettingsPage = () => {
  if (!elements.miniBarStatusText) {
    return;
  }

  elements.miniBarStatusText.textContent = currentSettings.miniBarEnabled
    ? t('miniBar.enabled')
    : t('miniBar.disabled');
  elements.miniBarPositionStatus.textContent = getMiniBarLabel(
    'position',
    currentSettings.miniBarPosition,
  );
  elements.miniBarLayoutStatus.textContent = getMiniBarLabel('layout', currentSettings.miniBarLayout);
  elements.miniBarSizeStatus.textContent = getMiniBarLabel('size', currentSettings.miniBarSize);
  renderMiniBarPreview();
};

const setMiniBarColorError = (message = '') => {
  if (!elements.miniBarColorError) {
    return;
  }

  elements.miniBarColorError.hidden = !message;
  elements.miniBarColorError.textContent = message;
};

const renderMiniBarColorControls = (settings = currentSettings) => {
  const colors = getMiniBarColorSettings(settings);

  elements.miniBarColorPickers.forEach((picker) => {
    const key = picker.dataset.miniColorPicker;

    if (document.activeElement !== picker) {
      picker.value = colors[key];
    }
  });

  elements.miniBarColorTexts.forEach((input) => {
    const key = input.dataset.miniColorText;

    if (document.activeElement !== input) {
      input.value = colors[key];
    }
  });
};

const applyMiniBarUiSettings = () => {
  const settings = currentSettings;
  const layout = settings.miniBarLayout || 'standard';
  const visibleParts = getMiniBarVisibleParts(settings);
  const actionCount = [
    visibleParts.refreshButton,
    visibleParts.openButton,
    visibleParts.resetButton,
    visibleParts.hideButton,
  ].filter(Boolean).length;
  const dataCount = [
    visibleParts.ssid,
    visibleParts.today,
    visibleParts.session,
    visibleParts.topApp,
    visibleParts.status,
  ].filter(Boolean).length;

  updateMiniBarOpacityPreview(settings.miniBarOpacity);
  applyMiniBarColorVariables(settings);
  document.body.dataset.miniSize = settings.miniBarSize || 'normal';
  document.body.dataset.miniLayout = layout;
  document.body.classList.toggle('mini-empty', dataCount === 0 && actionCount === 0);
  document.body.classList.toggle('mini-position-locked', Boolean(settings.miniBarLockPosition));
  document.body.classList.toggle('mini-no-border', !settings.miniBarShowBorder);
  document.body.classList.toggle('mini-gaming-mode', Boolean(settings.miniBarGamingMode));
  document.body.classList.toggle(
    'mini-hide-actions-until-hover',
    Boolean(settings.miniBarGamingMode && settings.miniBarHideButtonsUntilHover),
  );
  document.body.classList.toggle('mini-click-through', Boolean(settings.miniBarClickThrough));

  setElementVisible(elements.miniBrand, visibleParts.brand);
  setElementVisible(elements.miniDot, visibleParts.brand && dataCount > 0);
  setElementVisible(elements.miniWifiSsid, visibleParts.ssid);
  setElementVisible(elements.miniTodayGroup, visibleParts.today);
  setElementVisible(elements.miniSessionGroup, visibleParts.session);
  setElementVisible(elements.miniTopAppGroup, visibleParts.topApp);
  setElementVisible(elements.miniLimitStatus, visibleParts.status);
  setElementVisible(elements.miniActions, actionCount > 0);
  setElementVisible(elements.miniRefreshButton, visibleParts.refreshButton);
  setElementVisible(elements.miniOpenMainButton, visibleParts.openButton);
  setElementVisible(elements.miniResetButton, visibleParts.resetButton);
  setElementVisible(elements.miniHideButton, visibleParts.hideButton);

  const useShortLabels = settings.miniBarUseShortLabels;

  elements.miniTodayLabel.textContent = useShortLabels
    ? t('mini.todayShort')
    : t('metric.todayUsage');
  elements.miniSessionLabel.textContent = useShortLabels
    ? t('mini.sessionShort')
    : t('metric.currentSession');
  elements.miniTopLabel.textContent = useShortLabels ? t('mini.topShort') : t('mini.topApp');
  renderMiniBarSettingsPage();
};

const applyTranslations = (language = currentLanguage) => {
  currentLanguage = normalizeLanguage(language);
  document.documentElement.lang = currentLanguage;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll('[data-title-i18n]').forEach((element) => {
    const label = t(element.dataset.titleI18n);

    element.title = label;
    element.setAttribute('aria-label', label);
  });

  applyMiniBarUiSettings();

  if (currentAppSuspects) {
    renderAppSuspects(currentAppSuspects);
  }

  if (currentAppUsageEstimates) {
    renderAppUsageEstimates(currentAppUsageEstimates);
  }

  if (currentRealPerAppUsage) {
    renderRealPerAppUsage(currentRealPerAppUsage);
  }

  renderTopAppsSummary(currentRealPerAppUsage);
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

  if (!monitoringEnabled || !isDeveloperModeEnabled() || document.visibilityState !== 'visible') {
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
  elements.realPerAppPeriodSelect.disabled = isLoading || isRealPerAppUsageLoading;
  elements.refreshSuspectsButton.disabled = isLoading || isSuspectsLoading;
  elements.resetButton.disabled = isResettingSession || (isLoading && action !== 'refresh');
  elements.miniRefreshButton.disabled = isLoading;
  elements.miniResetButton.disabled = isResettingSession || (isLoading && action !== 'refresh');
  elements.openMiniBarButton.disabled = isLoading;
  elements.openMiniBarSettingsButton.disabled = isLoading;
  elements.hideMiniBarSettingsButton.disabled = isLoading;
  elements.resetMiniBarColorsButton.disabled = isLoading;
  elements.resetMiniBarSettingsButton.disabled = isLoading;
  elements.clearChartButton.disabled = isLoading;
  elements.clearHistoryButton.disabled = isLoading;
  elements.createShortcutButton.disabled = isLoading;
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
  elements.createShortcutButton.textContent =
    isLoading && action === 'shortcut'
      ? t('button.creatingShortcut')
      : t('button.createDesktopShortcut');
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
  elements.realPerAppPeriodSelect.disabled = isLoading || isRefreshing;
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
    ...fallbackSettings,
    ...settings,
    language: normalizeLanguage(settings.language),
  };
  applyTranslations(currentSettings.language);
  refreshDeveloperModeUi();
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

  if (document.activeElement !== elements.developerModeInput) {
    elements.developerModeInput.checked = currentSettings.developerMode;
  }

  if (document.activeElement !== elements.miniBarEnabledInput) {
    elements.miniBarEnabledInput.checked = currentSettings.miniBarEnabled;
  }

  if (document.activeElement !== elements.miniBarAlwaysOnTopInput) {
    elements.miniBarAlwaysOnTopInput.checked = currentSettings.miniBarAlwaysOnTop;
  }

  if (document.activeElement !== elements.miniBarSizeSelect) {
    elements.miniBarSizeSelect.value = currentSettings.miniBarSize;
  }

  if (document.activeElement !== elements.miniBarLayoutSelect) {
    elements.miniBarLayoutSelect.value = currentSettings.miniBarLayout;
  }

  if (document.activeElement !== elements.miniBarPositionSelect) {
    elements.miniBarPositionSelect.value = currentSettings.miniBarPosition;
  }

  if (document.activeElement !== elements.miniBarOpacityInput) {
    elements.miniBarOpacityInput.value = opacityToSliderValue(currentSettings.miniBarOpacity);
  }

  updateMiniBarOpacityPreview(elements.miniBarOpacityInput.value || currentSettings.miniBarOpacity);

  if (document.activeElement !== elements.miniBarLockPositionInput) {
    elements.miniBarLockPositionInput.checked = currentSettings.miniBarLockPosition;
  }

  if (document.activeElement !== elements.miniBarShowBorderInput) {
    elements.miniBarShowBorderInput.checked = currentSettings.miniBarShowBorder;
  }

  if (document.activeElement !== elements.miniBarGamingModeInput) {
    elements.miniBarGamingModeInput.checked = currentSettings.miniBarGamingMode;
  }

  if (document.activeElement !== elements.miniBarHideButtonsUntilHoverInput) {
    elements.miniBarHideButtonsUntilHoverInput.checked =
      currentSettings.miniBarHideButtonsUntilHover;
  }

  if (document.activeElement !== elements.miniBarConfirmHideInput) {
    elements.miniBarConfirmHideInput.checked = currentSettings.miniBarConfirmHide;
  }

  if (document.activeElement !== elements.miniBarClickThroughInput) {
    elements.miniBarClickThroughInput.checked = currentSettings.miniBarClickThrough;
  }

  if (document.activeElement !== elements.miniBarShowSsidInput) {
    elements.miniBarShowSsidInput.checked = currentSettings.miniBarShowSsid;
  }

  if (document.activeElement !== elements.miniBarShowTodayUsageInput) {
    elements.miniBarShowTodayUsageInput.checked = currentSettings.miniBarShowTodayUsage;
  }

  if (document.activeElement !== elements.miniBarShowSessionUsageInput) {
    elements.miniBarShowSessionUsageInput.checked = currentSettings.miniBarShowSessionUsage;
  }

  if (document.activeElement !== elements.miniBarShowTopAppInput) {
    elements.miniBarShowTopAppInput.checked = currentSettings.miniBarShowTopApp;
  }

  if (document.activeElement !== elements.miniBarShowStatusInput) {
    elements.miniBarShowStatusInput.checked = currentSettings.miniBarShowStatus;
  }

  if (document.activeElement !== elements.miniBarShowRefreshButtonInput) {
    elements.miniBarShowRefreshButtonInput.checked = currentSettings.miniBarShowRefreshButton;
  }

  if (document.activeElement !== elements.miniBarShowOpenButtonInput) {
    elements.miniBarShowOpenButtonInput.checked = currentSettings.miniBarShowOpenButton;
  }

  if (document.activeElement !== elements.miniBarShowResetButtonInput) {
    elements.miniBarShowResetButtonInput.checked = currentSettings.miniBarShowResetButton;
  }

  if (document.activeElement !== elements.miniBarShowHideButtonInput) {
    elements.miniBarShowHideButtonInput.checked = currentSettings.miniBarShowHideButton;
  }

  if (document.activeElement !== elements.miniBarUseShortLabelsInput) {
    elements.miniBarUseShortLabelsInput.checked = currentSettings.miniBarUseShortLabels;
  }

  renderMiniBarColorControls(currentSettings);
  applyMiniBarUiSettings();
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
  elements.refreshStorageStatusButton.disabled = isLoading;
  elements.clearSrumCacheButton.disabled = isLoading;
  elements.refreshDiagnosticsButton.textContent =
    isLoading && action === 'refresh' ? t('button.refreshing') : t('button.refreshDiagnostics');
  elements.exportDiagnosticsButton.textContent =
    isLoading && action === 'export' ? t('button.exporting') : t('button.exportDiagnostics');
  elements.refreshStorageStatusButton.textContent =
    isLoading && action === 'storage'
      ? t('button.refreshing')
      : t('button.refreshCacheStatus');
  elements.clearSrumCacheButton.textContent =
    isLoading && action === 'clear-storage'
      ? t('button.clearing')
      : t('button.clearSrumCache');
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

  if (diagnostics.storageStatus) {
    renderStorageStatus(diagnostics.storageStatus);
  }
};

const renderStorageStatus = (storageStatus) => {
  const safeLimitBytes = 500 * 1024 * 1024;
  const cacheBytes = Number(storageStatus?.srumCacheBytes || 0);

  elements.storageSrumCachePath.textContent = storageStatus?.srumCachePath || '-';
  elements.storageSrumCacheSize.textContent =
    storageStatus?.srumCacheFormatted || formatUsage(cacheBytes);
  elements.storageSrumFolderCount.textContent = formatInteger(
    storageStatus?.srumCacheFolderCount || 0,
  );
  elements.storageSrumFileCount.textContent = formatInteger(storageStatus?.srumCacheFileCount || 0);
  elements.storageLastChecked.textContent = formatDateTime(storageStatus?.lastCheckedAt);
  elements.storageNote.textContent =
    cacheBytes > safeLimitBytes ? t('storage.warningLarge') : t('storage.safe');
  elements.storageNote.classList.toggle('warning-text', cacheBytes > safeLimitBytes);
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

const refreshStorageStatus = async () => {
  if (isDiagnosticsLoading) {
    return;
  }

  if (!ensureApi('getStorageStatus')) {
    return;
  }

  setDiagnosticsLoading(true, 'storage');

  try {
    const result = await window.quotaLens.getStorageStatus();

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderStorageStatus(result.storageStatus);
  } catch (error) {
    elements.storageNote.textContent = error.message || t('storage.refreshFailed');
  } finally {
    setDiagnosticsLoading(false);
  }
};

const clearSrumCache = async () => {
  if (isDiagnosticsLoading) {
    return;
  }

  if (!ensureApi('clearSrumCache')) {
    return;
  }

  if (!window.confirm(t('storage.clearConfirm'))) {
    return;
  }

  setDiagnosticsLoading(true, 'clear-storage');

  try {
    const result = await window.quotaLens.clearSrumCache();

    if (!result.ok) {
      throw new Error(result.error);
    }

    if (!result.result.success) {
      throw new Error(result.result.error || t('storage.clearFailed'));
    }

    elements.storageNote.textContent = t('storage.clearSuccess');
    setDiagnosticsLoading(false);
    await refreshStorageStatus();
    elements.storageNote.textContent = t('storage.clearSuccess');
  } catch (error) {
    elements.storageNote.textContent = error.message || t('storage.clearFailed');
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
  developerMode: elements.developerModeInput.checked,
  miniBarEnabled: elements.miniBarEnabledInput.checked,
  miniBarAlwaysOnTop: elements.miniBarAlwaysOnTopInput.checked,
  miniBarOpacity: normalizeOpacityInput(elements.miniBarOpacityInput.value, currentSettings.miniBarOpacity),
  miniBarSize: elements.miniBarSizeSelect.value,
  miniBarLayout: elements.miniBarLayoutSelect.value,
  miniBarPosition: elements.miniBarPositionSelect.value,
  miniBarLockPosition: elements.miniBarLockPositionInput.checked,
  miniBarShowBorder: elements.miniBarShowBorderInput.checked,
  miniBarGamingMode: elements.miniBarGamingModeInput.checked,
  miniBarClickThrough: elements.miniBarClickThroughInput.checked,
  miniBarHideButtonsUntilHover: elements.miniBarHideButtonsUntilHoverInput.checked,
  miniBarConfirmHide: elements.miniBarConfirmHideInput.checked,
  miniBarShowSsid: elements.miniBarShowSsidInput.checked,
  miniBarShowTodayUsage: elements.miniBarShowTodayUsageInput.checked,
  miniBarShowSessionUsage: elements.miniBarShowSessionUsageInput.checked,
  miniBarShowTopApp: elements.miniBarShowTopAppInput.checked,
  miniBarShowStatus: elements.miniBarShowStatusInput.checked,
  miniBarShowRefreshButton: elements.miniBarShowRefreshButtonInput.checked,
  miniBarShowOpenButton: elements.miniBarShowOpenButtonInput.checked,
  miniBarShowResetButton: elements.miniBarShowResetButtonInput.checked,
  miniBarShowHideButton: elements.miniBarShowHideButtonInput.checked,
  miniBarUseShortLabels: elements.miniBarUseShortLabelsInput.checked,
  ...getMiniBarColorSettingsFromInputs(),
  language: normalizeLanguage(elements.languageSelect.value),
  ...overrides,
});

const getMiniBarColorSettingsFromInputs = () =>
  Object.fromEntries(
    miniBarColorFields.map(([key]) => {
      const input = document.querySelector(`[data-mini-color-text="${key}"]`);
      const color = normalizeHexColorInput(input?.value, currentSettings[key] || fallbackSettings[key]);

      return [key, color];
    }),
  );

const collectMiniBarSettingsFromInputs = (overrides = {}) => ({
  miniBarEnabled: elements.miniBarEnabledInput.checked,
  miniBarAlwaysOnTop: elements.miniBarAlwaysOnTopInput.checked,
  miniBarOpacity: normalizeOpacityInput(elements.miniBarOpacityInput.value, currentSettings.miniBarOpacity),
  miniBarSize: elements.miniBarSizeSelect.value,
  miniBarLayout: elements.miniBarLayoutSelect.value,
  miniBarPosition: elements.miniBarPositionSelect.value,
  miniBarLockPosition: elements.miniBarLockPositionInput.checked,
  miniBarShowBorder: elements.miniBarShowBorderInput.checked,
  miniBarGamingMode: elements.miniBarGamingModeInput.checked,
  miniBarClickThrough: elements.miniBarClickThroughInput.checked,
  miniBarHideButtonsUntilHover: elements.miniBarHideButtonsUntilHoverInput.checked,
  miniBarConfirmHide: elements.miniBarConfirmHideInput.checked,
  miniBarShowSsid: elements.miniBarShowSsidInput.checked,
  miniBarShowTodayUsage: elements.miniBarShowTodayUsageInput.checked,
  miniBarShowSessionUsage: elements.miniBarShowSessionUsageInput.checked,
  miniBarShowTopApp: elements.miniBarShowTopAppInput.checked,
  miniBarShowStatus: elements.miniBarShowStatusInput.checked,
  miniBarShowRefreshButton: elements.miniBarShowRefreshButtonInput.checked,
  miniBarShowOpenButton: elements.miniBarShowOpenButtonInput.checked,
  miniBarShowResetButton: elements.miniBarShowResetButtonInput.checked,
  miniBarShowHideButton: elements.miniBarShowHideButtonInput.checked,
  miniBarUseShortLabels: elements.miniBarUseShortLabelsInput.checked,
  ...getMiniBarColorSettingsFromInputs(),
  ...overrides,
});

const renderHistory = (sessions = currentHistorySessions) => {
  currentHistorySessions = Array.isArray(sessions) ? sessions : [];
  const filteredSessions = currentHistorySessions.filter((session) => {
    if (selectedHistoryFilter === 'today') {
      return isSameLocalDay(session.startedAt || session.endedAt);
    }

    return true;
  });
  const recentSessions =
    selectedHistoryFilter === 'all' ? filteredSessions : filteredSessions.slice(0, 5);

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

const getRealPerAppPeriodLabel = (period) => {
  const keyByPeriod = {
    today: 'perApp.periodToday',
    '7d': 'perApp.period7d',
    '30d': 'perApp.period30d',
    all: 'perApp.periodAll',
  };

  return t(keyByPeriod[period] || 'perApp.period7d');
};

const renderTopAppsSummary = (perAppUsage = currentRealPerAppUsage) => {
  const apps = Array.isArray(perAppUsage?.apps) ? perAppUsage.apps.slice(0, 3) : [];

  if (!apps.length) {
    const emptyMessage = perAppUsage?.requiresAdministrator
      ? t('perApp.requiresAdministrator')
      : t('dashboard.topAppsEmpty');

    elements.dashboardTopAppsList.innerHTML = `<p class="history-empty">${escapeHtml(
      emptyMessage,
    )}</p>`;
    elements.miniTopApp.textContent = '-';
    renderMiniBarPreview();
    return;
  }

  elements.dashboardTopAppsList.innerHTML = apps
    .map(
      (appUsage, index) => `
        <article class="top-app-row">
          <span>${index + 1}</span>
          <div>
            <strong>${escapeHtml(appUsage.appName || appUsage.processName || 'Unknown')}</strong>
            <small>${escapeHtml(appUsage.processName || t('label.notAvailable'))}</small>
          </div>
          <b>${escapeHtml(formatUsage(appUsage.totalBytes))}</b>
        </article>
      `,
    )
    .join('');

  const topApp = apps[0];
  elements.miniTopApp.textContent = `${topApp.appName || topApp.processName || 'Unknown'} ${formatUsage(
    topApp.totalBytes,
  )}`;
  renderMiniBarPreview();
};

const renderRealPerAppUsage = (perAppUsage) => {
  currentRealPerAppUsage = perAppUsage;
  const apps = Array.isArray(perAppUsage?.apps) ? perAppUsage.apps : [];
  const supported = Boolean(perAppUsage?.supported);
  const source = perAppUsage?.sourceMethod || 'native-helper-placeholder';
  const activePeriod = perAppUsage?.period || selectedRealPerAppPeriod;
  const adminModeText = perAppUsage?.isAdministrator
    ? t('perApp.adminMode')
    : t('perApp.nonAdminMode');
  const reason =
    perAppUsage?.reason ||
    (!supported ? t('perApp.unsupportedMessage') : '');
  const showInvestigationDetails = isDeveloperModeEnabled();
  const showFullInvestigationDetails = showInvestigationDetails && activePage === 'developer';

  renderTopAppsSummary(perAppUsage);

  elements.realPerAppUsageStatus.textContent = supported
    ? t('perApp.supported')
    : t('perApp.unsupported');
  elements.realPerAppUsageStatus.dataset.supported = supported ? 'true' : 'false';
  elements.realPerAppUsageSource.textContent = source;
  elements.realPerAppAccessStatus.textContent = perAppUsage?.accessStatus || '-';
  elements.realPerAppParseStatus.textContent = perAppUsage?.parseStatus || '-';
  elements.realPerAppPeriodActive.textContent = getRealPerAppPeriodLabel(activePeriod);
  const unsupportedMessage = perAppUsage?.requiresAdministrator
    ? `${t('perApp.adminRequiredMessage')} ${t('perApp.runAsAdminHint')} ${t(
        'perApp.adminInstruction',
      )}`
    : perAppUsage?.accessStatus === 'access_denied' ||
        perAppUsage?.discoveryStatus === 'access_denied'
      ? t('perApp.accessDeniedMessage')
      : `${t('perApp.unsupportedMessage')} ${reason ? `(${reason})` : ''}`;

  elements.realPerAppUsageReason.textContent = supported ? '' : unsupportedMessage;
  const investigationDetails = [
    `${t('perApp.adminModeLabel')}: ${adminModeText}`,
    perAppUsage?.requiresAdministrator ? t('perApp.requiresAdministrator') : '',
    perAppUsage?.dataType ? `${t('perApp.dataType')}: ${perAppUsage.dataType}` : '',
    perAppUsage?.note ? `${t('perApp.noteLabel')}: ${perAppUsage.note}` : '',
    `${t('perApp.activePeriod')}: ${getRealPerAppPeriodLabel(activePeriod)}`,
    perAppUsage?.periodStart
      ? `${t('perApp.periodStart')}: ${formatDateTime(perAppUsage.periodStart)}`
      : '',
    perAppUsage?.periodEnd
      ? `${t('perApp.periodEnd')}: ${formatDateTime(perAppUsage.periodEnd)}`
      : '',
    perAppUsage?.discoveryStatus
      ? `${t('perApp.discoveryStatus')}: ${perAppUsage.discoveryStatus}`
      : '',
    perAppUsage?.managedEsentStatus
      ? `${t('perApp.managedEsentStatus')}: ${perAppUsage.managedEsentStatus}`
      : '',
    perAppUsage?.eseApiStatus ? `${t('perApp.eseApiStatus')}: ${perAppUsage.eseApiStatus}` : '',
    perAppUsage?.esentutlStatus
      ? `${t('perApp.esentutlStatus')}: ${perAppUsage.esentutlStatus}`
      : '',
    perAppUsage?.catalogStatus
      ? `${t('perApp.catalogStatus')}: ${perAppUsage.catalogStatus}`
      : '',
    perAppUsage?.tableEnumerationStatus
      ? `${t('perApp.tableEnumerationStatus')}: ${perAppUsage.tableEnumerationStatus}`
      : '',
    perAppUsage?.copyStrategyUsed
      ? `${t('perApp.copyStrategyUsed')}: ${perAppUsage.copyStrategyUsed}`
      : '',
    perAppUsage?.fileCopyStatus
      ? `${t('perApp.fileCopyStatus')}: ${perAppUsage.fileCopyStatus}`
      : '',
    perAppUsage?.esentutlCopyStatus
      ? `${t('perApp.esentutlCopyStatus')}: ${perAppUsage.esentutlCopyStatus}`
      : '',
    perAppUsage?.vssCopyStatus
      ? `${t('perApp.vssCopyStatus')}: ${perAppUsage.vssCopyStatus}`
      : '',
    perAppUsage?.copyError ? `${t('perApp.copyError')}: ${perAppUsage.copyError}` : '',
    perAppUsage?.recoveryStatus
      ? `${t('perApp.recoveryStatus')}: ${perAppUsage.recoveryStatus}`
      : '',
    perAppUsage?.recoveryStrategyUsed
      ? `${t('perApp.recoveryStrategyUsed')}: ${perAppUsage.recoveryStrategyUsed}`
      : '',
    Array.isArray(perAppUsage?.copiedSupportFiles) && perAppUsage.copiedSupportFiles.length
      ? `${t('perApp.copiedSupportFiles')}: ${perAppUsage.copiedSupportFiles
          .slice(0, 16)
          .join(', ')}`
      : '',
    perAppUsage?.recoveryError
      ? `${t('perApp.recoveryError')}: ${perAppUsage.recoveryError}`
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
    Array.isArray(perAppUsage?.tableSchemas) && perAppUsage.tableSchemas.length
      ? `${t('perApp.tableSchemas')}: ${perAppUsage.tableSchemas
          .slice(0, 6)
          .map((schema) => {
            const columns = Array.isArray(schema.columns)
              ? schema.columns
                  .slice(0, 8)
                  .map((column) => `${column.name}${column.type ? `:${column.type}` : ''}`)
                  .join(', ')
              : '';

            return `${schema.tableName}${columns ? ` (${columns})` : ''}`;
          })
          .join(' | ')}`
      : '',
    Array.isArray(perAppUsage?.networkTableCandidates) && perAppUsage.networkTableCandidates.length
      ? `${t('perApp.networkTableCandidates')}: ${perAppUsage.networkTableCandidates
          .slice(0, 12)
          .join(', ')}`
      : '',
    perAppUsage?.esentutlOutputPreview
      ? `${t('perApp.esentutlOutputPreview')}: ${perAppUsage.esentutlOutputPreview}`
      : '',
    `${t('perApp.appIsPackaged')}: ${perAppUsage?.appIsPackaged ? 'true' : 'false'}`,
    perAppUsage?.helperPath ? `${t('perApp.helperPath')}: ${perAppUsage.helperPath}` : '',
    `${t('perApp.helperExists')}: ${perAppUsage?.helperExists ? 'true' : 'false'}`,
    perAppUsage?.helperExitCode !== null && perAppUsage?.helperExitCode !== undefined
      ? `${t('perApp.helperExitCode')}: ${perAppUsage.helperExitCode}`
      : '',
    perAppUsage?.helperSpawnError
      ? `${t('perApp.helperSpawnError')}: ${perAppUsage.helperSpawnError}`
      : '',
    perAppUsage?.processResourcesPath
      ? `${t('perApp.processResourcesPath')}: ${perAppUsage.processResourcesPath}`
      : '',
    perAppUsage?.helperCwd ? `${t('perApp.helperCwd')}: ${perAppUsage.helperCwd}` : '',
    perAppUsage?.tempCleanupStatus
      ? `${t('perApp.tempCleanupStatus')}: ${perAppUsage.tempCleanupStatus}`
      : '',
    perAppUsage?.helperStdoutPreview
      ? `${t('perApp.helperStdoutPreview')}: ${perAppUsage.helperStdoutPreview}`
      : '',
    perAppUsage?.helperStderrPreview
      ? `${t('perApp.helperStderrPreview')}: ${perAppUsage.helperStderrPreview}`
      : '',
  ].filter(Boolean);

  const compactInvestigationDetails = [
    `${t('perApp.adminModeLabel')}: ${adminModeText}`,
    perAppUsage?.accessStatus ? `${t('perApp.accessStatus')}: ${perAppUsage.accessStatus}` : '',
    perAppUsage?.parseStatus ? `${t('perApp.parseStatus')}: ${perAppUsage.parseStatus}` : '',
    perAppUsage?.copyStrategyUsed
      ? `${t('perApp.copyStrategyUsed')}: ${perAppUsage.copyStrategyUsed}`
      : '',
    perAppUsage?.recoveryStatus
      ? `${t('perApp.recoveryStatus')}: ${perAppUsage.recoveryStatus}`
      : '',
    perAppUsage?.helperExists !== undefined
      ? `${t('perApp.helperExists')}: ${perAppUsage.helperExists ? 'true' : 'false'}`
      : '',
  ].filter(Boolean);

  const investigationHtml = showInvestigationDetails
    ? `
      <div class="per-app-investigation${showFullInvestigationDetails ? '' : ' compact'}">
        ${
          showFullInvestigationDetails
            ? investigationDetails.map((detail) => `<p>${escapeHtml(detail)}</p>`).join('')
            : `
              ${compactInvestigationDetails.map((detail) => `<p>${escapeHtml(detail)}</p>`).join('')}
              ${
                investigationDetails.length
                  ? `<details>
                <summary>${escapeHtml(t('perApp.showTechnicalDetails'))}</summary>
                <div>${investigationDetails
                  .map((detail) => `<p>${escapeHtml(detail)}</p>`)
                  .join('')}</div>
              </details>`
                  : ''
              }
            `
        }
      </div>
    `
    : '';

  if (!supported) {
    elements.realPerAppUsageList.innerHTML = `
      <p class="history-empty">${escapeHtml(t('perApp.empty'))}</p>
      ${investigationHtml}
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
    ${investigationHtml}
    ${apps
      .map((appUsage) => {
      const appName = appUsage.appName || appUsage.processName || 'Unknown';
      const processName = appUsage.processName || appName;
      const appId = Number.isFinite(appUsage.appId) && appUsage.appId > 0 ? `AppId ${appUsage.appId}` : '';
      const packageName = appUsage.packageName || '';
      const identity = appUsage.normalizedIdentity || appUsage.rawIdentity || '';
      const category = appUsage.category || '';
      const method = appUsage.sourceMethod || source;
      const detailText = [
        processName,
        identity && identity !== processName ? identity : '',
        packageName,
        appId,
        category,
      ]
        .filter(Boolean)
        .join(' / ');

      return `
        <article class="per-app-row">
          <div>
            <span>${escapeHtml(t('perApp.appName'))}</span>
            <strong>${escapeHtml(appName)}</strong>
            <small>${escapeHtml(detailText || processName)}</small>
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
          </div>
          <div>
            <span>${escapeHtml(t('perApp.lastSeenLabel'))}</span>
            <strong>${escapeHtml(appUsage.lastSeen ? formatDateTime(appUsage.lastSeen) : '-')}</strong>
          </div>
          <div>
            <span>${escapeHtml(t('perApp.sourceLabel'))}</span>
            <strong>${escapeHtml(method === 'srum-network-usage' ? t('perApp.srumHistorical') : method)}</strong>
          </div>
        </article>
      `;
      })
      .join('')}
  `;
  elements.realPerAppUsageNote.textContent = `${tf('perApp.lastRefresh', {
    time: formatDateTime(perAppUsage.collectedAt),
  })} · ${t('perApp.srumHistoricalNote')}`;
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
  elements.miniWifiSsid.textContent = currentSsid || t('status.notConnected');
  elements.miniTodayUsage.textContent = combinedToday;
  elements.miniSessionUsage.textContent = sessionTotal;
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

  const limitStatuses = renderLimitStatus({
    todayUsageBytes: combinedTodayBytes,
    sessionUsageBytes: usage.sessionTotalBytes,
    settings,
    isNetworkMonitored,
  });
  elements.miniLimitStatus.textContent = t(getStatusTranslationKey(limitStatuses.overallStatus));
  elements.miniLimitStatus.dataset.status = String(limitStatuses.overallStatus).toLowerCase();

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

  renderMiniBarPreview();
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
    const result = await window.quotaLens.getRealPerAppUsage({
      period: selectedRealPerAppPeriod,
    });

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

const createDesktopShortcut = async () => {
  if (isRefreshing) {
    return;
  }

  if (!ensureApi('createDesktopShortcut')) {
    return;
  }

  isRefreshing = true;
  setLoading(true, 'shortcut');
  setStatus(t('status.creatingShortcut'), 'loading');

  try {
    const result = await window.quotaLens.createDesktopShortcut();

    if (!result.ok) {
      elements.startupNote.textContent =
        result.isPackaged === false
          ? t('startup.shortcutDevOnly')
          : result.error || t('startup.shortcutFailed');
      return;
    }

    elements.startupNote.textContent = result.shortcutPath
      ? tf('startup.shortcutCreatedAt', { path: result.shortcutPath })
      : t('startup.shortcutCreated');
    setStatus(t('status.shortcutCreated'), 'ok');
  } catch (error) {
    renderError(error.message || t('startup.shortcutFailed'));
    elements.startupNote.textContent = t('startup.shortcutFailed');
  } finally {
    isRefreshing = false;
    setLoading(false);
    updateMonitoringUi();
  }
};

const openMiniBar = async () => {
  if (!ensureApi('openMiniBar')) {
    return;
  }

  try {
    const result = await window.quotaLens.openMiniBar();

    if (!result.ok) {
      throw new Error(result.error);
    }
  } catch (error) {
    renderError(error.message || t('mini.openFailed'));
  }
};

const hideMiniBar = async () => {
  if (!ensureApi('hideMiniBar')) {
    return;
  }

  if (
    isMiniBarWindow &&
    currentSettings.miniBarConfirmHide &&
    !window.confirm(t('mini.confirmHide'))
  ) {
    return;
  }

  try {
    await window.quotaLens.hideMiniBar();
  } catch (error) {
    renderError(error.message || t('mini.hideFailed'));
  }
};

const saveMiniBarSettingsNow = async () => {
  if (!ensureApi('updateMiniBarSettings')) {
    return;
  }

  const miniBarSettings = collectMiniBarSettingsFromInputs();
  currentSettings = {
    ...currentSettings,
    ...miniBarSettings,
  };
  applyMiniBarUiSettings();
  elements.miniBarAutoSaveNote.textContent = t('miniBar.autoSaveSaving');

  try {
    const result = await window.quotaLens.updateMiniBarSettings(miniBarSettings);

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderSettings(result.settings);
    elements.miniBarAutoSaveNote.textContent = t('miniBar.autoSaveSaved');
  } catch (error) {
    renderError(error.message || t('miniBar.autoSaveFailed'));
    elements.miniBarAutoSaveNote.textContent = t('miniBar.autoSaveFailed');
  }
};

const applyMiniBarSettingsToWindow = async () => {
  if (!window.quotaLens?.applyMiniBarSettings) {
    return;
  }

  try {
    await window.quotaLens.applyMiniBarSettings(collectMiniBarSettingsFromInputs());
  } catch (error) {
    console.debug('QuotaLens failed to apply Mini Bar settings visually:', error);
  }
};

const scheduleMiniBarVisualApply = () => {
  clearTimeout(miniBarVisualApplyTimerId);
  miniBarVisualApplyTimerId = null;
  applyMiniBarSettingsToWindow();
};

const scheduleMiniBarAutoSave = () => {
  clearTimeout(miniBarAutoSaveTimerId);
  const miniBarSettings = collectMiniBarSettingsFromInputs();

  currentSettings = {
    ...currentSettings,
    ...miniBarSettings,
  };
  applyMiniBarUiSettings();
  elements.miniBarAutoSaveNote.textContent = t('miniBar.autoSaveNote');
  scheduleMiniBarVisualApply();

  miniBarAutoSaveTimerId = window.setTimeout(() => {
    saveMiniBarSettingsNow();
  }, 200);
};

const handleMiniBarColorPickerInput = (event) => {
  const key = event.target.dataset.miniColorPicker;
  const color = normalizeHexColorInput(event.target.value, fallbackSettings[key]);
  const textInput = document.querySelector(`[data-mini-color-text="${key}"]`);

  event.target.value = color;

  if (textInput) {
    textInput.value = color;
  }

  setMiniBarColorError('');
  scheduleMiniBarAutoSave();
};

const handleMiniBarColorTextInput = (event) => {
  const key = event.target.dataset.miniColorText;
  const color = normalizeHexColorInput(event.target.value);
  const picker = document.querySelector(`[data-mini-color-picker="${key}"]`);

  if (!color) {
    setMiniBarColorError(t('miniBar.invalidColor'));
    return;
  }

  event.target.value = color;

  if (picker) {
    picker.value = color;
  }

  setMiniBarColorError('');
  scheduleMiniBarAutoSave();
};

const resetMiniBarColors = async () => {
  if (isRefreshing) {
    return;
  }

  if (!ensureApi('updateMiniBarSettings')) {
    return;
  }

  clearTimeout(miniBarAutoSaveTimerId);
  isRefreshing = true;
  setLoading(true, 'settings');
  setStatus(t('status.savingSettings'), 'loading');

  try {
    const result = await window.quotaLens.updateMiniBarSettings(miniBarDefaultColorSettings);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setMiniBarColorError('');
    renderSettings(result.settings);
    elements.miniBarAutoSaveNote.textContent = t('miniBar.colorAutoSaveSaved');
  } catch (error) {
    renderError(error.message || t('miniBar.autoSaveFailed'));
    elements.miniBarAutoSaveNote.textContent = t('miniBar.autoSaveFailed');
  } finally {
    isRefreshing = false;
    setLoading(false);
  }
};

const resetMiniBarSettings = async () => {
  if (isRefreshing) {
    return;
  }

  if (!ensureApi('resetMiniBarSettings')) {
    return;
  }

  clearTimeout(miniBarAutoSaveTimerId);
  isRefreshing = true;
  setLoading(true, 'settings');
  setStatus(t('status.savingSettings'), 'loading');

  try {
    const result = await window.quotaLens.resetMiniBarSettings();

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderSettings(result.settings);
    elements.miniBarAutoSaveNote.textContent = t('settings.miniBarReset');
  } catch (error) {
    renderError(error.message || t('settings.miniBarResetFailed'));
    elements.miniBarAutoSaveNote.textContent = t('settings.miniBarResetFailed');
  } finally {
    isRefreshing = false;
    setLoading(false);
    updateMonitoringUi();
  }
};

const showMainWindow = async () => {
  if (!ensureApi('showMainWindow')) {
    return;
  }

  try {
    await window.quotaLens.showMainWindow();
  } catch (error) {
    renderError(error.message || t('mini.openMainFailed'));
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

const unsubscribeSettingsUpdated = window.quotaLens?.onSettingsUpdated?.((settings) => {
  renderSettings(settings);
});

elements.navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActivePage(button.dataset.pageTarget);

    if (activePage === 'developer') {
      refreshDiagnostics();
      refreshStorageStatus();
      refreshAppUsageEstimates();
      refreshAppSuspects();
    }

    if (activePage === 'apps') {
      refreshRealPerAppUsage();
    }
  });
});

elements.refreshButton.addEventListener('click', () => refreshUsage());
elements.refreshEstimatesButton.addEventListener('click', () => refreshAppUsageEstimates());
elements.refreshRealPerAppUsageButton.addEventListener('click', () => refreshRealPerAppUsage());
elements.realPerAppPeriodSelect.addEventListener('change', (event) => {
  selectedRealPerAppPeriod = event.target.value;
  refreshRealPerAppUsage();
});
elements.refreshSuspectsButton.addEventListener('click', () => refreshAppSuspects());
elements.resetButton.addEventListener('click', resetSession);
elements.clearChartButton.addEventListener('click', clearChartData);
elements.clearHistoryButton.addEventListener('click', clearHistory);
elements.refreshDiagnosticsButton.addEventListener('click', refreshDiagnostics);
elements.refreshStorageStatusButton.addEventListener('click', refreshStorageStatus);
elements.clearSrumCacheButton.addEventListener('click', clearSrumCache);
elements.openDataFolderButton.addEventListener('click', openDataFolder);
elements.exportDiagnosticsButton.addEventListener('click', exportDiagnostics);
elements.saveSettingsButton.addEventListener('click', saveSettings);
elements.saveStartupButton.addEventListener('click', saveStartupSettings);
elements.createShortcutButton.addEventListener('click', createDesktopShortcut);
elements.openMiniBarButton.addEventListener('click', openMiniBar);
elements.openMiniBarSettingsButton.addEventListener('click', openMiniBar);
elements.hideMiniBarSettingsButton.addEventListener('click', hideMiniBar);
elements.resetMiniBarColorsButton.addEventListener('click', resetMiniBarColors);
elements.resetMiniBarSettingsButton.addEventListener('click', resetMiniBarSettings);
elements.miniBarOpacityInput.addEventListener('input', (event) => {
  updateMiniBarOpacityPreview(event.target.value);
  scheduleMiniBarAutoSave();
});
elements.miniBarColorPickers.forEach((picker) => {
  picker.addEventListener('input', handleMiniBarColorPickerInput);
});
elements.miniBarColorTexts.forEach((input) => {
  input.addEventListener('input', handleMiniBarColorTextInput);
});
[
  elements.miniBarEnabledInput,
  elements.miniBarAlwaysOnTopInput,
  elements.miniBarSizeSelect,
  elements.miniBarLayoutSelect,
  elements.miniBarPositionSelect,
  elements.miniBarLockPositionInput,
  elements.miniBarShowBorderInput,
  elements.miniBarGamingModeInput,
  elements.miniBarHideButtonsUntilHoverInput,
  elements.miniBarConfirmHideInput,
  elements.miniBarClickThroughInput,
  elements.miniBarShowSsidInput,
  elements.miniBarShowTodayUsageInput,
  elements.miniBarShowSessionUsageInput,
  elements.miniBarShowTopAppInput,
  elements.miniBarShowStatusInput,
  elements.miniBarShowRefreshButtonInput,
  elements.miniBarShowOpenButtonInput,
  elements.miniBarShowResetButtonInput,
  elements.miniBarShowHideButtonInput,
  elements.miniBarUseShortLabelsInput,
].forEach((control) => {
  control.addEventListener('change', scheduleMiniBarAutoSave);
});
elements.miniRefreshButton.addEventListener('click', () => refreshUsage());
elements.miniOpenMainButton.addEventListener('click', showMainWindow);
elements.miniResetButton.addEventListener('click', resetSession);
elements.miniHideButton.addEventListener('click', hideMiniBar);
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
elements.historyFilterSelect.addEventListener('change', (event) => {
  selectedHistoryFilter = event.target.value;
  renderHistory();
});
elements.chartFilterSelect.addEventListener('change', () => {
  renderUsageChart(currentUsageSamples, normalizeSsid(currentWifiInfo?.ssid));
});

document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', () => {
  clearRefreshTimer();
  clearSuspectsTimer();
  clearTimeout(miniBarAutoSaveTimerId);
  clearTimeout(miniBarVisualApplyTimerId);
  unsubscribeMonitoringCommand?.();
  unsubscribeSettingsUpdated?.();
});

applyTranslations(currentLanguage);
updateMonitoringUi();
setActivePage('dashboard');
refreshUsage().finally(() => {
  if (isDeveloperModeEnabled()) {
    refreshDiagnostics();
    refreshAppUsageEstimates();
  }

  refreshRealPerAppUsage();
});
scheduleAutoRefresh();
scheduleSuspectsRefresh();
