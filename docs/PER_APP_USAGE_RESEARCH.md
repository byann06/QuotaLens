# Riset Pemakaian Kuota per Aplikasi di Windows

Dokumen ini menjelaskan arah teknis untuk fitur **Pemakaian Kuota per Aplikasi** di QuotaLens. Tujuannya adalah menghindari angka palsu dan memastikan aplikasi hanya menampilkan data MB/GB per aplikasi jika sumber datanya memang mendukung.

## Kesimpulan Singkat

QuotaLens saat ini sudah bisa membaca total pemakaian adapter jaringan dan mendeteksi aplikasi yang sedang punya koneksi aktif. Namun dua hal itu belum sama dengan pemakaian kuota per aplikasi.

- `Get-NetTCPConnection` hanya memberi daftar koneksi TCP, proses pemilik koneksi, alamat remote, port, dan state. Command ini tidak memberikan jumlah byte download/upload per proses.
- `Get-NetAdapterStatistics` hanya memberi total byte pada adapter jaringan. Data ini tidak dipisah per aplikasi.
- App Suspect Detector dan App Usage Estimator sebelumnya hanya membantu menebak aplikasi yang mungkin aktif saat kuota naik. Itu bukan hitungan MB/GB per aplikasi yang akurat.

Karena itu, QuotaLens tidak boleh menampilkan contoh seperti "Steam memakai 3.2 GB" kecuali data tersebut berasal dari sumber Windows yang memang menyediakan byte per proses/aplikasi.

## Kandidat Solusi

### 1. ETW / Windows Network Event Tracing

ETW adalah mekanisme tracing Windows yang dapat menangkap event jaringan dari sistem. Dengan provider yang tepat, aplikasi native bisa mengamati event jaringan dan mengaitkan aktivitas ke proses.

Kelebihan:
- Lebih dekat ke data nyata.
- Bisa digunakan untuk monitoring live.
- Cocok untuk helper native Windows.

Tantangan:
- Implementasi lebih kompleks dibanding PowerShell ringan.
- Bisa membutuhkan hak akses tambahan.
- Perlu pengujian akurasi untuk mapping bytes ke proses.
- Perlu strategi agar tidak membebani laptop.

### 2. Windows Filtering Platform (WFP) / Packet Monitor

Windows Filtering Platform (WFP) dapat dipakai untuk memfilter dan mengamati traffic jaringan pada level sistem.

Kelebihan:
- Sumber data kuat untuk traffic jaringan.
- Bisa sangat akurat jika diimplementasikan benar.

Tantangan:
- Jauh lebih berat dan kompleks.
- Biasanya membutuhkan komponen native, izin tinggi, atau driver/filter.
- Tidak cocok langsung dimasukkan ke MVP tanpa riset keamanan dan performa.

### 3. SRUM / Windows Data Usage Database

Windows menyimpan sebagian data penggunaan jaringan di System Resource Usage Monitor, sering disebut SRUM. Data ini bisa memuat pemakaian jaringan per aplikasi dalam periode tertentu.

Kelebihan:
- Bisa memberi data kumulatif/historis.
- Lebih cocok untuk laporan pemakaian daripada packet capture live.

Tantangan:
- Akses database dan format data perlu dipelajari hati-hati.
- Bisa membutuhkan hak akses Administrator.
- Data tidak selalu real-time.
- Perlu mapping aplikasi/proses yang konsisten.

### 4. Native Helper C#

Pendekatan yang paling masuk akal untuk tahap eksperimen adalah membuat helper native C# terpisah. Electron memanggil helper melalui `child_process`, lalu helper menulis JSON ke stdout.

Rencana bentuk output:

```json
{
  "supported": true,
  "sourceMethod": "etw",
  "apps": [
    {
      "processId": 1234,
      "processName": "steam",
      "appName": "Steam",
      "downloadBytes": 3435973836,
      "uploadBytes": 10485760,
      "totalBytes": 3446459596,
      "sourceMethod": "etw"
    }
  ],
  "collectedAt": "2026-06-02T00:00:00.000Z"
}
```

Jika helper belum punya metode yang valid, output harus jujur:

```json
{
  "supported": false,
  "sourceMethod": "native-helper-placeholder",
  "reason": "Prototype helper is present, but no ETW/WFP/SRUM provider is implemented yet. Refusing to report fabricated per-app bytes.",
  "apps": [],
  "collectedAt": "2026-06-02T00:00:00.000Z"
}
```

## Prototype di Project

Prototype helper ditempatkan di:

```text
native/per-app-usage-helper
```

Untuk tahap 16A, helper C# hanya membuat kontrak JSON dan mengembalikan `supported: false` dengan `sourceMethod: "native-helper-placeholder"` sampai provider nyata seperti ETW, WFP, atau SRUM diimplementasikan. Ini disengaja agar QuotaLens tidak menampilkan data per aplikasi yang menyesatkan.

## Prototype SRUM Tahap 16B

Tahap 16B menambahkan percobaan awal membaca SRUM melalui helper native. Lokasi database yang dicek:

```text
C:\Windows\System32\sru\SRUDB.dat
```

Helper mencoba mendeteksi file tersebut dan membukanya secara read-only dengan file sharing agar tidak mengganggu Windows. Jika file tidak bisa diakses karena permission, lock, atau kebutuhan metode copy aman, helper mengembalikan:

```json
{
  "supported": false,
  "sourceMethod": "srum",
  "reason": "SRUM database could not be accessed. Admin permission or safe copy method may be required.",
  "apps": []
}
```

Jika file bisa diakses tetapi parsing tabel SRUM/ESE belum diimplementasikan, helper tetap mengembalikan `supported: false` dengan reason jujur. Ini penting karena SRUM bukan JSON/CSV sederhana; SRUM adalah database Windows yang membutuhkan parser ESE atau pendekatan native lain yang tervalidasi.

Target output saat parser SRUM sudah valid:

```json
{
  "supported": true,
  "sourceMethod": "srum",
  "apps": [
    {
      "appName": "Steam",
      "processName": "steam",
      "packageName": "",
      "receivedBytes": 3435973836,
      "sentBytes": 10485760,
      "totalBytes": 3446459596,
      "lastSeen": "2026-06-02T00:00:00.000Z"
    }
  ]
}
```

Prototype ini tidak meminta Administrator secara paksa, tidak melakukan packet capture, tidak memasang driver, dan tidak menghentikan proses apa pun.

## Safe SRUM Copy Tahap 16C

Tahap 16C menambahkan mekanisme copy aman sebelum parsing. QuotaLens tidak mencoba memproses `SRUDB.dat` langsung dari folder sistem karena file tersebut bisa sedang dipakai Windows, terkunci, atau hanya bisa diakses dengan izin tertentu.

Alur prototype:

1. Helper mengecek apakah `C:\Windows\System32\sru\SRUDB.dat` ada.
2. Helper mencoba menyalin file tersebut ke folder temp lokal QuotaLens.
3. Jika copy gagal karena permission, lock, atau I/O error, helper mengembalikan `supported: false` dengan reason jelas.
4. Jika copy berhasil tetapi parser ESE/SRUM belum ada, helper tetap mengembalikan `supported: false`.

Output investigasi tambahan:

```json
{
  "supported": false,
  "sourceMethod": "srum-copy",
  "reason": "SRUM database copied, but ESE/SRUM parser is not implemented yet.",
  "srumPath": "C:\\Windows\\System32\\sru\\SRUDB.dat",
  "copiedPath": "C:\\Users\\User\\AppData\\Local\\Temp\\QuotaLens\\srum\\SRUDB-20260602120000000.dat",
  "accessStatus": "found_and_copied",
  "parseStatus": "parser_not_implemented",
  "apps": []
}
```

Risiko permission:

- Beberapa instalasi Windows bisa menolak akses copy tanpa Administrator.
- QuotaLens tidak meminta Administrator secara paksa.
- Jika perlu akses lebih tinggi, itu harus menjadi keputusan user dan dijelaskan jelas di UI/dokumentasi.

SRUM juga perlu dipahami sebagai data historis/kumulatif, bukan live usage real-time. SRUM cocok untuk melihat pemakaian yang sudah tercatat Windows, tetapi tidak sama dengan tracing live seperti ETW. Untuk dashboard real-time per aplikasi, ETW atau metode tracing lain tetap perlu diteliti terpisah.

## SRUM ESE Parser Investigation Tahap 16D

Tahap 16D menambahkan prototype investigasi parser ESE/SRUM pada file copy, bukan pada `SRUDB.dat` asli. Helper mencoba:

1. Copy `SRUDB.dat` ke folder temp QuotaLens.
2. Menjalankan investigasi metadata ESE pada file copy.
3. Mengumpulkan nama tabel jika tooling Windows bisa menampilkannya.
4. Mencari kandidat tabel yang mungkin terkait network usage berdasarkan nama tabel.

Output investigasi tambahan:

```json
{
  "supported": false,
  "sourceMethod": "srum-parser-prototype",
  "dataType": "historical",
  "note": "SRUM data is historical and may not match live session usage exactly.",
  "reason": "SRUM database was copied, but network usage tables could not be parsed yet.",
  "accessStatus": "found_and_copied",
  "parseStatus": "tables_listed_parser_not_implemented",
  "tableNames": ["..."],
  "networkTableCandidates": ["..."],
  "apps": []
}
```

Status ini tetap `supported: false` karena tahap ini belum memvalidasi mapping tabel dan kolom byte. SRUM adalah database ESE, sehingga nama tabel/kolom bisa berupa GUID atau struktur internal Windows. QuotaLens tidak boleh menampilkan angka MB/GB per aplikasi hanya karena tabel ditemukan.

Target output jika parser sudah tervalidasi:

```json
{
  "supported": true,
  "sourceMethod": "srum-parser-prototype",
  "dataType": "historical",
  "note": "SRUM data is historical and may not match live session usage exactly.",
  "apps": [
    {
      "appName": "Steam",
      "processName": "steam",
      "packageName": "",
      "receivedBytes": 3435973836,
      "sentBytes": 10485760,
      "totalBytes": 3446459596,
      "lastSeen": "2026-06-02T00:00:00.000Z",
      "rawIdentity": "steam.exe"
    }
  ]
}
```

Jika nama aplikasi belum bisa dipetakan, helper harus tetap menampilkan `rawIdentity` dan kategori `Unknown`, bukan mengarang nama aplikasi.

## SRUM Path Discovery Tahap 16D.1

Tahap 16D.1 memperkuat pencarian lokasi `SRUDB.dat`. Sebelumnya helper hanya mengecek satu path tetap:

```text
C:\Windows\System32\sru\SRUDB.dat
```

Di beberapa environment, path ini bisa berbeda karena `%WINDIR%`, redirection 32-bit/64-bit, atau akses `Sysnative`. Helper sekarang mengecek beberapa kandidat:

```text
%WINDIR%\System32\sru\SRUDB.dat
C:\Windows\System32\sru\SRUDB.dat
C:\Windows\Sysnative\sru\SRUDB.dat
```

Jika kandidat tersebut belum menemukan file, helper menjalankan pencarian terbatas di `%WINDIR%` dengan guard:

- maksimal sekitar 300 folder
- timeout sekitar 1,5 detik
- folder inaccessible dilewati
- tidak meminta Administrator secara paksa

Output tambahan:

```json
{
  "sourceMethod": "srum-path-discovery",
  "checkedPaths": [
    "C:\\Windows\\System32\\sru\\SRUDB.dat",
    "C:\\Windows\\Sysnative\\sru\\SRUDB.dat",
    "C:\\Windows\\**\\SRUDB.dat"
  ],
  "foundPath": "",
  "discoveryStatus": "not_found",
  "accessStatus": "not_found",
  "parseStatus": "not_started",
  "reason": "SRUM database was not found in known Windows locations."
}
```

Jika file ditemukan, helper lanjut ke safe copy dan investigasi parser seperti tahap sebelumnya. Jika tetap tidak ditemukan, UI dapat menampilkan daftar path yang sudah dicek supaya debugging lebih jelas.

## SRUM Access Detection Tahap 16D.2

Temuan dari laptop user:

```powershell
Test-Path "C:\Windows\System32\sru\SRUDB.dat"
```

dapat menghasilkan `Access is denied`, sementara:

```powershell
Get-ChildItem -Path "C:\Windows" -Filter "SRUDB.dat" -Recurse -ErrorAction SilentlyContinue
```

dapat menemukan:

```text
C:\Windows\System32\sru\SRUDB.dat
```

Artinya `SRUDB.dat` memang ada, tetapi akses standar bisa ditolak. Helper tidak boleh menyimpulkan `not_found` hanya karena API ringan seperti `File.Exists` tidak bisa melihat file akibat pembatasan akses.

Perbaikan 16D.2:

- Helper mencoba open path kandidat secara eksplisit dan menangkap `UnauthorizedAccessException`.
- Jika parent directory `C:\Windows\System32\sru` ada tetapi file read/copy ditolak, helper mengembalikan `access_denied`, bukan `not_found`.
- Jika pencarian recursive terbatas menemukan `SRUDB.dat`, helper menyimpan `foundPath` walaupun langkah copy berikutnya ditolak.
- Jika akses ditolak, output memakai `sourceMethod: "srum-access-check"` dan `parseStatus: "not_started"`.

Output access denied:

```json
{
  "supported": false,
  "sourceMethod": "srum-access-check",
  "foundPath": "C:\\Windows\\System32\\sru\\SRUDB.dat",
  "discoveryStatus": "access_denied",
  "accessStatus": "access_denied",
  "parseStatus": "not_started",
  "reason": "SRUM database exists, but access was denied. Run QuotaLens or the helper as Administrator, or implement a privileged safe copy method."
}
```

UI harus menampilkan bahwa SRUM ditemukan, tetapi butuh Administrator atau metode copy dengan izin lebih tinggi. QuotaLens tetap tidak menampilkan angka MB/GB per aplikasi sampai parser SRUM valid.

Electron sudah disiapkan untuk memanggil helper melalui IPC eksperimental:

```text
quotalens:get-real-per-app-usage
```

Renderer menampilkan panel:

```text
Pemakaian Kuota per Aplikasi (Eksperimental)
```

Jika helper belum tersedia atau belum mendukung pembacaan bytes, UI akan menampilkan pesan bahwa Windows tidak menyediakan data ini melalui command ringan yang sedang dipakai dan fitur membutuhkan metode tracing atau izin tambahan.

## Rekomendasi Berikutnya

1. Pilih sumber data utama: ETW untuk live monitoring atau SRUM untuk laporan kumulatif.
2. Buat helper C# yang benar-benar membaca provider tersebut.
3. Validasi hasil dengan pembanding Windows Settings > Network & Internet > Data usage.
4. Ukur dampak CPU/RAM saat helper berjalan.
5. Pastikan UI tetap menyebut fitur ini eksperimental sampai akurasi terbukti.

## Hal yang Tidak Boleh Dilakukan

- Jangan memakai `Get-NetTCPConnection` sebagai sumber byte per aplikasi.
- Jangan membagi total byte adapter berdasarkan jumlah koneksi.
- Jangan membagi total byte adapter berdasarkan confidence score estimator.
- Jangan menampilkan angka MB/GB per aplikasi jika sumber datanya belum benar.
- Jangan terminate, block, atau mengubah perilaku aplikasi lain.
