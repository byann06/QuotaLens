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

## Navigasi Dan Mode Normal

- [ ] Sidebar/menu utama tampil ringkas.
- [ ] Halaman Beranda bisa dibuka.
- [ ] Halaman Pemakaian Aplikasi bisa dibuka.
- [ ] Halaman Riwayat bisa dibuka.
- [ ] Halaman Pengaturan bisa dibuka.
- [ ] Menu Developer tidak muncul saat Developer Mode mati.
- [ ] Menu Developer muncul setelah Developer Mode diaktifkan.
- [ ] Detail teknis tidak mendominasi Beranda saat Developer Mode mati.

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

## Mini Bar

- [ ] Tombol Buka Mini Bar di Beranda membuka overlay kecil.
- [ ] Mini Bar tidak menampilkan title bar Windows atau menu File/Edit/View.
- [ ] Mini Bar menampilkan SSID, Hari Ini, Sesi, Top App, dan Status jika setting aktif.
- [ ] Mini Bar tidak menampilkan detail teknis, path file, raw bytes, atau status parser.
- [ ] Tombol ikon refresh di Mini Bar memperbarui data.
- [ ] Tombol ikon buka app utama menampilkan/focus window utama.
- [ ] Tombol ikon reset sesi bekerja jika ditampilkan.
- [ ] Tombol ikon hide menyembunyikan Mini Bar.
- [ ] Mini Bar bisa digeser saat lock posisi mati.
- [ ] Mini Bar kembali ke posisi setting setelah posisi dipilih ulang.
- [ ] Pengaturan ukuran Mini Bar compact/normal/wide bekerja.
- [ ] Pengaturan layout minimal/standard/detailed bekerja.
- [ ] Pengaturan opacity Mini Bar bekerja.
- [ ] Toggle data Mini Bar menampilkan/menyembunyikan item sesuai pilihan.
- [ ] Reset Tampilan Mini Bar mengembalikan setting Mini Bar ke default.

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
- [ ] Tombol Buat Shortcut Desktop tersedia pada packaged app.
- [ ] Shortcut Desktop mengarah ke `QuotaLens.exe` yang benar.

## Pemakaian Kuota Per Aplikasi

- [ ] Filter periode Hari ini berjalan.
- [ ] Filter periode 7 hari terakhir berjalan.
- [ ] Filter periode 30 hari terakhir berjalan.
- [ ] Filter periode Semua riwayat berjalan.
- [ ] Jika SRUM bisa dibaca, daftar aplikasi menampilkan nama aplikasi, Download, Upload, Total, dan Last Seen.
- [ ] Data per aplikasi ditandai sebagai riwayat Windows SRUM, bukan sesi live QuotaLens.
- [ ] Jika akses SRUM ditolak, panel menampilkan pesan butuh Administrator yang jelas.
- [ ] QuotaLens tetap bisa dipakai normal tanpa Administrator.
- [ ] Panel tidak memakai estimator atau jumlah koneksi sebagai angka MB/GB per aplikasi.

## Developer Dan Diagnostics

- [ ] Developer Mode bisa diaktifkan dari Pengaturan.
- [ ] Developer Mode bisa dimatikan lagi.
- [ ] Panel Diagnostics bisa direfresh.
- [ ] Diagnostics menampilkan app version dan mode.
- [ ] Diagnostics menampilkan user data path.
- [ ] Diagnostics menampilkan path file settings/history.
- [ ] Diagnostics menampilkan status network probe atau error yang jelas.
- [ ] Diagnostics menampilkan status Wi-Fi probe atau error yang jelas.
- [ ] Detail helper SRUM, copy strategy, recovery status, access status, dan parse status hanya muncul di Developer Mode.
- [ ] Koneksi aktif per proses hanya muncul di Developer Mode.
- [ ] Estimator penyebab kuota hanya muncul di Developer Mode.
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
