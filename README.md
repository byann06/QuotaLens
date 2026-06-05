# QuotaLens

QuotaLens adalah aplikasi desktop Windows untuk memantau pemakaian kuota internet laptop, terutama saat laptop tersambung ke hotspot HP.

Versi MVP ini fokus pada monitoring lokal di desktop: pemakaian sesi berjalan, pemakaian hari ini, deteksi Wi-Fi/SSID hotspot, peringatan limit, history lokal, Mini Bar, dan build Windows yang siap dicoba. QuotaLens tidak membutuhkan server, VPS, cloud sync, atau database.

## Masalah Yang Diselesaikan

Saat laptop memakai hotspot HP, kuota bisa cepat habis karena aktivitas browser, download, update aplikasi, atau pekerjaan lain. Windows memang punya statistik adapter jaringan, tetapi informasinya tidak praktis untuk memantau satu sesi hotspot, batas harian, peringatan limit, atau riwayat pemakaian.

QuotaLens menyediakan dashboard sederhana untuk memantau hal-hal tersebut dengan lebih mudah.

## Fitur Utama

- Aplikasi desktop Windows berbasis Electron dan Vite.
- System tray untuk show/hide window, pause/resume monitoring, dan quit.
- Membaca statistik adapter jaringan lewat Windows PowerShell.
- Mendeteksi SSID Wi-Fi aktif lewat `netsh`.
- Menghitung pemakaian Current Session dari baseline awal.
- Menyimpan history sesi selesai ke file JSON lokal.
- Menghitung Today Usage dari history hari ini ditambah sesi aktif.
- Pengaturan limit harian dan limit sesi dalam GB.
- Desktop notification saat pemakaian mendekati atau melewati limit.
- Daftar Monitored SSIDs agar tracking bisa difokuskan ke hotspot tertentu.
- Auto reset session saat SSID berubah.
- Performance Mode dengan pause/resume dan pilihan interval refresh.
- Startup settings dan single instance lock.
- Panel Diagnostics dan export diagnostics JSON.
- Panel pemakaian kuota per aplikasi berbasis riwayat Windows SRUM.
- Filter periode pemakaian aplikasi: hari ini, 7 hari terakhir, 30 hari terakhir, dan semua riwayat.
- Pesan Administrator yang jelas untuk fitur SRUM jika Windows menolak akses.
- Navigasi halaman agar dashboard, pemakaian aplikasi, riwayat, pengaturan, dan developer tools tidak bercampur dalam satu layar.
- Developer Mode untuk menampilkan diagnostics, health check, dan detail teknis SRUM hanya saat dibutuhkan.
- Mini Bar always-on-top untuk memantau kuota saat bermain game atau membuka aplikasi lain.
- Mini Bar Customization untuk mengatur ukuran, layout, posisi, opacity, data yang tampil, dan tombol yang tersedia.
- Output package, installer, dan ZIP Windows lewat Electron Forge.

## Menjalankan Mode Development

Install dependency:

```bash
npm install
```

Jalankan aplikasi:

```bash
npm start
```

## Build Aplikasi

Buat packaged app:

```bash
npm run package
```

Buat installer Windows dan ZIP portable:

```bash
npm run make
```

Detail build dan lokasi output ada di [BUILD.md](BUILD.md).

Catatan: `npm start` hanya untuk development. Aplikasi desktop hasil package bisa dibuka dari:

```text
out/QuotaLens-win32-x64/QuotaLens.exe
```

## Cara Menggunakan

1. Buka QuotaLens.
2. Di Beranda, pastikan SSID aktif, pemakaian hari ini, sesi saat ini, dan status batas terbaca.
3. Gunakan tombol Segarkan untuk update manual, atau biarkan auto-refresh berjalan.
4. Klik Reset Sesi saat ingin memulai sesi hotspot baru. Today Usage tidak ikut dihapus karena tetap menghitung riwayat hari ini.
5. Buka halaman Pemakaian Aplikasi untuk melihat aplikasi paling boros berdasarkan riwayat Windows SRUM.
6. Jika panel Pemakaian Aplikasi meminta Administrator, tutup QuotaLens lalu jalankan lagi dengan Run as Administrator.
7. Buka halaman Riwayat untuk melihat sesi yang sudah selesai atau menghapus history.
8. Buka Pengaturan untuk mengatur limit, monitored SSID, bahasa, startup, Developer Mode, dan Mini Bar.
9. Klik Buka Mini Bar di Beranda untuk memantau kuota dalam overlay kecil always-on-top.
10. Aktifkan Developer Mode hanya saat ingin melihat diagnostics, status helper SRUM, atau detail teknis.

## Mode Normal, Developer Mode, Dan Mini Bar

Mode normal QuotaLens dibuat sederhana untuk pengguna awam. Beranda hanya menampilkan SSID aktif, status koneksi, pemakaian hari ini, sesi saat ini, status batas, top aplikasi boros, dan tombol cepat.

Developer Mode bisa diaktifkan dari Pengaturan. Saat aktif, menu Developer muncul dan menampilkan diagnostics, health check, status parser/helper SRUM, koneksi aktif per proses, dan estimator lama untuk debugging.

Mini Bar adalah overlay kecil frameless dan always-on-top. Mini Bar menampilkan SSID, pemakaian hari ini, sesi saat ini, aplikasi teratas, status batas, serta tombol ikon kecil untuk refresh, membuka app utama, reset sesi, atau menyembunyikan Mini Bar. Mini Bar dibuat untuk dipakai saat gaming atau multitasking, jadi tidak menampilkan detail teknis panjang.

Tampilan Mini Bar bisa diatur dari Pengaturan > Tampilan > Mini Bar. User bisa memilih mode `minimal`, `standard`, atau `detailed`, ukuran `compact`, `normal`, atau `wide`, posisi layar, opacity, lock posisi, informasi yang ditampilkan, serta tombol mana saja yang muncul.

## Shortcut Desktop Dan Administrator

Build/package tidak otomatis selalu membuat shortcut di Desktop. Setelah `npm run package`, shortcut bisa dibuat manual dari `out/QuotaLens-win32-x64/QuotaLens.exe`, atau lewat tombol `Buat Shortcut Desktop` di panel Startup saat menjalankan packaged app.

QuotaLens utama bisa dibuka normal tanpa Administrator. Dashboard, session usage, history, tray, dan Mini Bar tetap berjalan normal. Jika Windows menolak akses SRUM, hanya panel pemakaian kuota per aplikasi yang meminta Run as Administrator.

## Catatan Windows SmartScreen

QuotaLens saat ini belum menggunakan code signing. Windows SmartScreen mungkin menampilkan peringatan saat installer atau aplikasi dibuka. Ini normal untuk build MVP yang belum ditandatangani.

Code signing dan auto-update belum ditambahkan pada versi ini.

## Batasan MVP

- Target utama masih Windows.
- Belum memakai SQLite.
- Belum ada cloud sync atau VPS.
- Pemakaian per aplikasi memakai riwayat Windows SRUM, bukan live capture real-time.
- Angka SRUM bersifat historis dan bisa berbeda dari sesi live QuotaLens.
- Akses SRUM bisa membutuhkan Administrator tergantung izin Windows.
- Belum ada app blocker.
- Belum ada dashboard mobile.
- Perhitungan usage bergantung pada counter adapter Windows, sehingga reset adapter atau izin sistem bisa memengaruhi hasil.
- Fitur Start with Windows paling akurat dites setelah aplikasi dipackage dan diinstall.
