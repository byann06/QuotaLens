# Checklist Rilis MVP QuotaLens

Gunakan checklist ini sebelum build QuotaLens dibagikan atau dirilis.

## Startup Aplikasi

- [ ] Aplikasi bisa dibuka.
- [ ] Packaged app bisa dibuka langsung dari `out/QuotaLens-win32-x64/QuotaLens.exe` tanpa `npm start`.
- [ ] Hanya satu instance QuotaLens yang bisa berjalan.
- [ ] Membuka QuotaLens lagi hanya memunculkan/focus window yang sudah ada.
- [ ] Icon system tray muncul.
- [ ] Menu tray Open QuotaLens menampilkan/focus window.
- [ ] Menu tray Hide QuotaLens menyembunyikan window.
- [ ] Tombol X window menyembunyikan app ke tray sesuai behavior saat ini.
- [ ] Menu tray Quit benar-benar menutup aplikasi.
- [ ] Setelah Quit, tidak ada proses `QuotaLens.exe` / Electron lama yang menggantung.

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
- [ ] Opacity hanya mengubah background Mini Bar, bukan teks/tombol/badge.
- [ ] Warna custom Mini Bar bekerja untuk background, border, teks, tombol, dan badge status.
- [ ] Toggle data Mini Bar menampilkan/menyembunyikan item sesuai pilihan.
- [ ] Toggle tombol Mini Bar menampilkan/menyembunyikan ikon refresh, buka app, reset, dan hide.
- [ ] Mode Gaming Mini Bar menyembunyikan tombol sampai hover jika setting aktif.
- [ ] Opsi Abaikan klik mouse/click-through Mini Bar tidak mengganggu aplikasi di belakangnya.
- [ ] Konfirmasi hide Mini Bar muncul jika setting konfirmasi aktif.
- [ ] Reset Warna Mini Bar hanya mereset warna.
- [ ] Reset Tampilan Mini Bar mengembalikan setting Mini Bar ke default.
- [ ] Setting Mini Bar tersimpan setelah app ditutup dan dibuka ulang.

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

- [ ] Helper native SRUM ikut masuk packaged app di `resources/publish/`.
- [ ] Packaged app bisa memanggil helper SRUM tanpa `dotnet run` manual.
- [ ] Developer Mode menampilkan path helper SRUM, apakah helper ditemukan, stdout/stderr preview, dan resources path saat debug packaged app.
- [ ] Filter periode Hari ini berjalan.
- [ ] Filter periode 7 hari terakhir berjalan.
- [ ] Filter periode 30 hari terakhir berjalan.
- [ ] Filter periode Semua riwayat berjalan.
- [ ] Jika SRUM bisa dibaca, daftar aplikasi menampilkan nama aplikasi, Download, Upload, Total, dan Last Seen.
- [ ] Data per aplikasi ditandai sebagai riwayat Windows SRUM, bukan sesi live QuotaLens.
- [ ] Jika akses SRUM ditolak, panel menampilkan pesan butuh Administrator yang jelas.
- [ ] QuotaLens tetap bisa dipakai normal tanpa Administrator.
- [ ] Jika dijalankan sebagai Administrator, SRUM per-app usage bisa membaca data jika Windows mengizinkan.
- [ ] Panel tidak memakai estimator atau jumlah koneksi sebagai angka MB/GB per aplikasi.
- [ ] Refresh SRUM beberapa kali tidak membuat `%TEMP%\QuotaLens\srum` membengkak liar.

## Storage Guard

- [ ] Developer Mode menampilkan section Penyimpanan & Cache.
- [ ] Storage Guard menampilkan path cache SRUM.
- [ ] Storage Guard menampilkan ukuran cache SRUM.
- [ ] Storage Guard menampilkan jumlah folder dan file cache.
- [ ] Jika cache SRUM lebih dari 500 MB, warning batas aman tampil.
- [ ] Tombol Segarkan Status Cache memperbarui status cache.
- [ ] Tombol Bersihkan Cache SRUM meminta konfirmasi.
- [ ] Bersihkan Cache SRUM hanya menghapus `%TEMP%\QuotaLens\srum`.
- [ ] Bersihkan Cache SRUM tidak menghapus settings/history QuotaLens.
- [ ] Bersihkan Cache SRUM tidak menghapus `C:\Windows\System32\sru\SRUDB.dat`.

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

- [ ] `dotnet build native/per-app-usage-helper/QuotaLens.PerAppUsageHelper.csproj` berhasil.
- [ ] `dotnet publish native/per-app-usage-helper/QuotaLens.PerAppUsageHelper.csproj -c Release -r win-x64 --self-contained false` berhasil.
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
