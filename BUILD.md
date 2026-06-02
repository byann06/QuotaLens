# Panduan Build QuotaLens

QuotaLens menggunakan Electron Forge dan Vite untuk mode development, packaged app Windows, dan installer.

## Mode Development

Jalankan aplikasi dalam mode development:

```bash
npm start
```

Perintah ini menjalankan Electron Forge dengan pipeline Vite untuk renderer/dev.

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
