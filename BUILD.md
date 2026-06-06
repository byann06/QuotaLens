# Panduan Build QuotaLens

QuotaLens menggunakan Electron Forge dan Vite untuk mode development, packaged app Windows, dan installer.

## Mode Development

Jalankan aplikasi dalam mode development:

```bash
npm start
```

Perintah ini hanya untuk development. `npm start` menjalankan Electron Forge dengan pipeline Vite untuk renderer/dev, bukan membuat aplikasi yang muncul di Desktop Windows.

Untuk verifikasi build harian, tidak perlu menjalankan `npm start` terus-menerus. Gunakan `node --check`, `dotnet build`, `npm run package`, dan `npm run make` sesuai kebutuhan.

## Membuat Packaged App

Buat folder aplikasi Windows yang sudah dipackage:

```bash
npm run package
```

Lokasi output:

```text
out/QuotaLens-win32-x64/
```

Jalankan packaged app dari:

```text
out/QuotaLens-win32-x64/QuotaLens.exe
```

Packaged app ini adalah aplikasi desktop yang bisa dibuka langsung tanpa `npm start`.

Helper native SRUM untuk fitur `Pemakaian Kuota per Aplikasi` ikut disalin ke packaged app sebagai resource:

```text
out/QuotaLens-win32-x64/resources/publish/
```

App final tidak memakai `dotnet run` manual. Saat membuat build, pastikan helper sudah berhasil dipublish sebelum menjalankan package/make:

```bash
dotnet publish native/per-app-usage-helper/QuotaLens.PerAppUsageHelper.csproj -c Release -r win-x64 --self-contained false
```

Jika proses package gagal karena file di folder `out` atau `.vite` sedang dipakai, tutup QuotaLens yang sedang berjalan terlebih dahulu, termasuk dari menu tray `Quit`, lalu jalankan ulang `npm run package`.

## Membuat Shortcut Desktop

Setelah `npm run package` berhasil, shortcut Desktop bisa dibuat dengan salah satu cara berikut:

1. Buka folder `out/QuotaLens-win32-x64/`.
2. Klik kanan `QuotaLens.exe`.
3. Pilih `Show more options`, lalu `Send to > Desktop (create shortcut)`.

Atau dari aplikasi packaged:

1. Jalankan `out/QuotaLens-win32-x64/QuotaLens.exe`.
2. Buka panel `Perilaku Aplikasi / Startup`.
3. Klik tombol `Buat Shortcut Desktop`.

Tombol shortcut hanya tersedia untuk packaged app. Saat mode development, QuotaLens akan menampilkan pesan bahwa shortcut Desktop dibuat dari hasil package.

## Run As Administrator

QuotaLens utama bisa dibuka normal tanpa Administrator. Dashboard, monitoring sesi, Wi-Fi/SSID, history, tray, dan pengaturan tetap berjalan seperti biasa.

Fitur `Pemakaian Kuota per Aplikasi (Eksperimental)` membaca riwayat Windows SRUM. Di beberapa laptop, Windows membatasi akses SRUM sehingga panel ini perlu Administrator. Jika akses ditolak, hanya panel tersebut yang menampilkan pesan butuh Administrator; aplikasi utama tidak boleh ikut crash.

Cara menjalankan sebagai Administrator:

1. Klik kanan `QuotaLens.exe` atau shortcut Desktop QuotaLens.
2. Pilih `Run as administrator`.
3. Terima prompt UAC Windows jika muncul.

Jika tidak dijalankan sebagai Administrator dan SRUM ditolak, QuotaLens tidak seharusnya crash. Hanya panel per-app usage yang akan menampilkan pesan bahwa akses Administrator dibutuhkan.

## Mini Bar Dan Developer Mode

Mini Bar dibuat sebagai overlay kecil untuk memantau kuota tanpa membuka window utama. Mini Bar bersifat frameless, always-on-top jika setting aktif, dan bisa disembunyikan tanpa menutup QuotaLens.

Pengaturan Mini Bar ada di halaman `Mini Bar`, termasuk ukuran, layout, posisi, opacity, mode gaming, click-through, lock posisi, data yang ditampilkan, dan tombol ikon yang tersedia.

Developer Mode bisa diaktifkan dari halaman Pengaturan. Saat Developer Mode mati, detail teknis seperti diagnostics, path file, status parser SRUM, status copy/recovery, koneksi aktif per proses, dan estimator tidak ditampilkan di mode normal.

## Membuat Installer Dan ZIP Portable

Buat output distribusi Windows:

```bash
npm run make
```

Maker Windows yang dikonfigurasi:

- Squirrel.Windows installer: membuat `QuotaLensSetup.exe` dan file release terkait.
- ZIP maker: membuat ZIP portable sebagai fallback.

Lokasi output umumnya:

```text
out/make/squirrel.windows/x64/
out/make/zip/win32/x64/
```

Output Squirrel biasanya berisi installer seperti:

```text
out/make/squirrel.windows/x64/QuotaLensSetup.exe
```

## Icon Aplikasi

Jika file ini tersedia, Electron Forge akan memakainya untuk packaged app dan installer Squirrel:

```text
assets/app-icon.ico
```

Jika file icon belum ada, proses package dan make tetap bisa berjalan tanpa crash.

## Catatan Windows SmartScreen

QuotaLens saat ini belum ditandatangani dengan code signing. Di Windows, SmartScreen mungkin memberi peringatan saat app atau installer dibuka. Ini normal untuk aplikasi yang belum signed dan tidak berkaitan dengan runtime QuotaLens.

Code signing bisa ditambahkan nanti, tetapi sengaja belum dikonfigurasi pada MVP ini.

## Uninstall

Jika QuotaLens diinstall menggunakan installer Squirrel.Windows, uninstall dari:

```text
Windows Settings > Apps > Installed apps
```

Cari `QuotaLens`, pilih uninstall, lalu ikuti prompt Windows.

Output ZIP portable tidak menginstall aplikasi ke sistem. Untuk menghapus versi ZIP, tutup QuotaLens dari menu tray lalu hapus folder hasil extract.
