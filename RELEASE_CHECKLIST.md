# Checklist Rilis MVP QuotaLens

Gunakan checklist ini sebelum build QuotaLens dibagikan atau dirilis.

## Startup Aplikasi

- [ ] Aplikasi bisa dibuka.
- [ ] Hanya satu instance QuotaLens yang bisa berjalan.
- [ ] Membuka QuotaLens lagi hanya memunculkan/focus window yang sudah ada.
- [ ] Icon system tray muncul.
- [ ] Menu tray Open QuotaLens menampilkan/focus window.
- [ ] Menu tray Hide QuotaLens menyembunyikan window.
- [ ] Menu tray Quit benar-benar menutup aplikasi.

## Monitoring

- [ ] Current Wi-Fi / SSID tampil.
- [ ] Wi-Fi State tampil.
- [ ] Signal tampil jika disediakan oleh Windows.
- [ ] Statistik adapter jaringan berhasil dibaca.
- [ ] Current Session naik setelah browsing/download.
- [ ] Today Usage menghitung sesi aktif.
- [ ] Reset Session mengembalikan Current Session ke 0.
- [ ] Reset Session menyimpan sesi sebelumnya ke History.
- [ ] History menampilkan sesi terbaru.

## Limit Dan Notification

- [ ] Daily Limit bisa disimpan.
- [ ] Session Limit bisa disimpan.
- [ ] Limit Status menampilkan Safe saat pemakaian di bawah 80%.
- [ ] Limit Status menampilkan Warning saat pemakaian 80% atau lebih.
- [ ] Limit Status menampilkan Exceeded saat pemakaian 100% atau lebih.
- [ ] Desktop notification muncul saat enabled.
- [ ] Notification tidak muncul berulang-ulang setiap refresh untuk threshold yang sama.
- [ ] Notifications bisa dimatikan.

## Pengaturan Hotspot

- [ ] SSID aktif bisa ditambahkan ke Monitored SSIDs.
- [ ] SSID di Monitored SSIDs bisa dihapus.
- [ ] Monitor Only Listed SSIDs menampilkan Not monitored network saat SSID aktif tidak ada di daftar.
- [ ] Limit notification tidak dipanggil saat status Not monitored network.
- [ ] Auto Reset On SSID Change memulai sesi baru setelah SSID berubah.

## Performance Dan Startup

- [ ] Pause Monitoring menghentikan auto-refresh.
- [ ] Resume Monitoring membuat refresh berjalan lagi.
- [ ] Refresh interval bisa diubah ke 5, 15, dan 30 detik.
- [ ] Saat window hidden/background, polling berjalan lebih lambat.
- [ ] Setting Start with Windows tersimpan.
- [ ] Setting Start Minimized to Tray tersimpan.
- [ ] Start Minimized to Tray berjalan pada app yang sudah dipackage/diinstall.

## Diagnostics

- [ ] Panel Diagnostics bisa direfresh.
- [ ] Diagnostics menampilkan app version dan mode.
- [ ] Diagnostics menampilkan user data path.
- [ ] Diagnostics menampilkan path file settings/history.
- [ ] Diagnostics menampilkan status network probe atau error yang jelas.
- [ ] Diagnostics menampilkan status Wi-Fi probe atau error yang jelas.
- [ ] Open Data Folder membuka folder data lokal.
- [ ] Export Diagnostics membuat file JSON.

## Output Build

- [ ] `npm run package` berhasil.
- [ ] Packaged app bisa dibuka dari `out/QuotaLens-win32-x64/QuotaLens.exe`.
- [ ] `npm run make` berhasil.
- [ ] Installer Squirrel berhasil dibuat.
- [ ] ZIP portable berhasil dibuat.
- [ ] Installer bisa menginstall QuotaLens.
- [ ] App yang sudah diinstall bisa dibuka dan menampilkan tray.
- [ ] App yang sudah diinstall bisa diuninstall dari Windows Settings.

## Baseline Keamanan

- [ ] `nodeIntegration` tetap `false`.
- [ ] `contextIsolation` tetap `true`.
- [ ] Renderer hanya memakai API dari preload.
- [ ] Password Wi-Fi tidak diexport di diagnostics.
- [ ] Token/API key tidak disimpan atau diexport.
