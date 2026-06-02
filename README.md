# QuotaLens

QuotaLens adalah aplikasi desktop Windows untuk memantau pemakaian kuota internet laptop, terutama saat laptop tersambung ke hotspot HP.

Versi MVP ini fokus pada monitoring lokal di desktop: pemakaian sesi berjalan, pemakaian hari ini, deteksi Wi-Fi/SSID hotspot, peringatan limit, history lokal, dan build Windows yang siap dicoba. QuotaLens tidak membutuhkan server, VPS, cloud sync, atau database.

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

## Cara Menggunakan

1. Buka QuotaLens.
2. Pastikan Current Wi-Fi / SSID terbaca.
3. Gunakan tombol Refresh untuk update manual, atau biarkan auto-refresh berjalan.
4. Klik Reset Session saat ingin memulai sesi hotspot baru.
5. Tambahkan SSID aktif ke Monitored SSIDs jika hanya ingin memantau hotspot tertentu.
6. Atur Daily Limit dan Session Limit dalam GB.
7. Biarkan QuotaLens berjalan di system tray saat bekerja.
8. Buka panel Diagnostics jika statistik jaringan atau Wi-Fi tidak terbaca.

## Catatan Windows SmartScreen

QuotaLens saat ini belum menggunakan code signing. Windows SmartScreen mungkin menampilkan peringatan saat installer atau aplikasi dibuka. Ini normal untuk build MVP yang belum ditandatangani.

Code signing dan auto-update belum ditambahkan pada versi ini.

## Batasan MVP

- Target utama masih Windows.
- Belum memakai SQLite.
- Belum ada cloud sync atau VPS.
- Belum ada rincian pemakaian per aplikasi.
- Belum ada app blocker.
- Belum ada dashboard mobile.
- Perhitungan usage bergantung pada counter adapter Windows, sehingga reset adapter atau izin sistem bisa memengaruhi hasil.
- Fitur Start with Windows paling akurat dites setelah aplikasi dipackage dan diinstall.
