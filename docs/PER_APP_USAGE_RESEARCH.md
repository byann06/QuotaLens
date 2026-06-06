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

## ESE Metadata Inspection Tahap 16E

Tahap 16E menambahkan mode helper:

```text
--mode srum-inspect
```

Jalur kerja helper:

1. Melakukan SRUM path discovery.
2. Mencoba copy aman `SRUDB.dat` ke folder temp QuotaLens.
3. Jika akses ditolak, helper mengembalikan reason bahwa helper perlu dijalankan sebagai Administrator atau memakai privileged safe copy method.
4. Jika copy berhasil, helper membuka database copy melalui ESENT API bawaan Windows.
5. Helper membaca metadata struktur tabel:
   - nama tabel
   - nama kolom
   - tipe kolom
6. Helper mencari kandidat tabel network hanya dari nama tabel/kolom yang mengandung keyword seperti `network`, `app`, `bytes`, `interface`, `energy`, atau `application`.

Tahap ini **belum membaca angka pemakaian aplikasi**. Metadata tabel bukan bukti bahwa kolom tertentu pasti berarti download/upload per aplikasi. Karena itu output tetap:

```json
{
  "supported": false,
  "sourceMethod": "srum-ese-inspect",
  "accessStatus": "copied",
  "parseStatus": "metadata_inspected",
  "reason": "SRUM metadata was inspected. Network usage table mapping still needs validation.",
  "tableSchemas": [
    {
      "tableName": "...",
      "columns": [
        { "name": "...", "type": "..." }
      ]
    }
  ],
  "networkTableCandidates": []
}
```

Jika ESENT gagal membuka database copy, helper mengembalikan:

```json
{
  "supported": false,
  "sourceMethod": "srum-ese-inspect",
  "parseStatus": "ese_open_failed",
  "reason": "ESE metadata inspection failed: ..."
}
```

Prinsip yang tetap berlaku:

- Jangan tampilkan angka MB/GB per aplikasi sebelum mapping tabel/kolom SRUM tervalidasi.
- Jangan memakai estimator atau jumlah koneksi.
- Jangan membagi total adapter usage.
- Jangan berpindah ke ETW pada tahap ini.

## ESE Metadata Inspection Fix + esentutl Fallback Tahap 16F

Temuan dari laptop user:

- `dotnet build` helper berhasil.
- `dotnet run -- --mode srum-inspect` berhasil menemukan dan menyalin SRUM ke temp.
- ESENT API gagal saat metadata inspect dengan error:

```text
JetGetObjectInfo failed with error -1038
```

Artinya masalah utama bukan lagi permission atau lokasi file. `SRUDB.dat` sudah bisa dicopy, tetapi cara membaca metadata ESE melalui API masih perlu fallback.

Perbaikan 16F:

1. Helper tetap menjalankan mode `--mode srum-inspect`.
2. Helper mencoba ESENT API dengan urutan:
   - `JetCreateInstance`
   - `JetSetSystemParameter` untuk mematikan recovery pada database copy
   - `JetInit`
   - `JetBeginSession`
   - `JetAttachDatabase`
   - `JetOpenDatabase`
   - metadata inspect
   - cleanup database/session/instance
3. Jika ESENT API gagal, helper tidak langsung berhenti.
4. Helper menjalankan fallback:

```text
esentutl /m <copiedPath>
```

5. Output fallback hanya dipakai untuk inspeksi metadata dan debugging, bukan untuk angka pemakaian aplikasi.

Output tambahan:

```json
{
  "eseApiStatus": "failed:JetGetObjectInfo failed with error -1038.",
  "esentutlStatus": "success:metadata_output_available",
  "esentutlOutputPreview": "...",
  "parseStatus": "metadata_inspected"
}
```

Jika ESENT API gagal tetapi `esentutl` berhasil memberi metadata, helper mengembalikan:

```json
{
  "supported": false,
  "sourceMethod": "srum-esentutl-inspect",
  "accessStatus": "copied",
  "parseStatus": "metadata_inspected",
  "reason": "SRUM metadata was inspected through esentutl. Network usage table mapping still needs validation."
}
```

Jika dua-duanya gagal, helper mengembalikan `parseStatus: "metadata_inspect_failed"` dengan ringkasan error ESENT dan `esentutl`.

Catatan penting: `esentutl` tetap hanya fallback metadata. QuotaLens belum boleh menampilkan MB/GB per aplikasi sampai mapping tabel dan kolom SRUM divalidasi.

## ESENT Table Enumeration Tahap 16G

Temuan dari laptop user setelah 16F:

- SRUM berhasil ditemukan.
- SRUM berhasil dicopy.
- `accessStatus: "copied"`.
- `parseStatus: "metadata_inspected"`.
- `esentutlStatus: "success:metadata_output_available"`.
- `esentutlOutputPreview` hanya berisi `DATABASE HEADER`.
- `tableNames`, `networkTableCandidates`, dan `tableSchemas` masih kosong.
- ESENT API masih gagal di `JetGetObjectInfo` dengan error `-1038`.

Kesimpulan: `esentutl /m` pada environment user hanya memberi header database, bukan daftar tabel/kolom. Tahap 16G memperbaiki enumerasi tabel ESENT.

Perbaikan 16G:

1. Helper tetap melakukan discovery dan safe copy SRUM.
2. Helper memakai ESENT API untuk membuka database copy.
3. Struktur `JET_OBJECTLIST` dan `JET_COLUMNLIST` diinisialisasi dengan `cbStruct` sebelum dipakai.
4. Helper mengisi status tambahan:
   - `catalogStatus`
   - `tableEnumerationStatus`
5. Jika enumerasi tabel berhasil, helper mengembalikan:

```json
{
  "supported": false,
  "sourceMethod": "srum-ese-table-enum",
  "accessStatus": "copied",
  "parseStatus": "tables_enumerated",
  "reason": "SRUM tables were enumerated. Network usage table mapping still needs validation.",
  "tableNames": ["..."],
  "tableSchemas": [
    {
      "tableName": "...",
      "columns": [
        { "name": "...", "type": "..." }
      ]
    }
  ],
  "networkTableCandidates": ["..."]
}
```

Jika enumerasi tabel tetap gagal, helper mengembalikan `parseStatus: "table_enumeration_failed"` dengan ringkasan error ESENT dan fallback `esentutl`. Tidak ada angka pemakaian aplikasi yang ditampilkan pada tahap ini.

## Managed ESENT Table Enumeration Tahap 16H

Temuan sebelum 16H:

- SRUM sudah berhasil ditemukan dan dicopy ke folder temp QuotaLens.
- P/Invoke manual ke ESENT masih gagal saat enumerasi tabel dengan error `JetGetObjectInfo failed with error -1038`.
- Fallback `esentutl /m` hanya menampilkan `DATABASE HEADER` pada laptop user, bukan daftar tabel atau kolom.

Karena P/Invoke manual terlalu rawan salah untuk struktur metadata ESENT, Tahap 16H menambahkan package `Microsoft.Database.ManagedEsent`. Package ini mengekspos namespace `Microsoft.Isam.Esent.Interop` dan helper API seperti `Api.GetTableNames` serta `Api.GetTableColumns`.

Alur 16H:

1. Helper tetap memakai copy aman `SRUDB.dat`, bukan membaca file asli yang terkunci.
2. Helper membuat instance Managed ESENT dengan folder system/log/temp sendiri di temp QuotaLens.
3. Helper attach dan open database copy secara read-only.
4. Helper mencoba enumerasi nama tabel dan kolom.
5. Jika berhasil, output tetap `supported:false` karena tahap ini baru validasi struktur, belum mapping angka pemakaian.

Output yang diharapkan jika enumerasi Managed ESENT berhasil:

```json
{
  "supported": false,
  "sourceMethod": "srum-managed-esent-table-enum",
  "accessStatus": "copied",
  "parseStatus": "tables_enumerated",
  "managedEsentStatus": "success:tables:...",
  "tableNames": ["..."],
  "tableSchemas": [
    {
      "tableName": "...",
      "columns": [
        { "name": "...", "type": "..." }
      ]
    }
  ],
  "reason": "SRUM tables were enumerated. Network usage table mapping still needs validation."
}
```

Jika Managed ESENT gagal, helper tetap menyertakan `managedEsentStatus` lalu mencoba fallback P/Invoke lama dan `esentutl`. QuotaLens tetap tidak boleh menampilkan angka MB/GB per aplikasi sebelum mapping tabel dan kolom SRUM tervalidasi.

## SRUM Network Usage Table Tahap 16I

Temuan dari output user setelah Managed ESENT berhasil:

- `parseStatus: "tables_enumerated"`
- `managedEsentStatus: "success:tables:12"`
- Kandidat tabel network usage yang relevan:

```text
{973F5D5C-1D90-4944-BE8E-24B94231A174}
```

Kolom penting pada tabel network usage:

- `AppId`
- `BytesRecvd`
- `BytesSent`
- `TimeStamp`
- `InterfaceLuid`

Tabel mapping identitas aplikasi:

```text
SruDbIdMapTable
```

Kolom penting pada mapping table:

- `IdIndex`
- `IdBlob`
- `IdType`

Mapping yang dipakai:

```text
network.AppId -> SruDbIdMapTable.IdIndex
```

`IdBlob` didecode secara aman:

1. Coba UTF-16LE.
2. Coba UTF-8.
3. Jika hasil decode tidak masuk akal, tampilkan preview hex.

Tahap 16I mulai membaca row historis dari tabel network usage, lalu melakukan agregasi per `AppId/rawIdentity`:

- `receivedBytes` = total `BytesRecvd`
- `sentBytes` = total `BytesSent`
- `totalBytes` = `receivedBytes + sentBytes`
- `lastSeen` = `TimeStamp` terbaru yang bisa didecode

Output jika pembacaan berhasil:

```json
{
  "supported": true,
  "sourceMethod": "srum-network-usage",
  "dataType": "historical",
  "note": "SRUM data is historical and may not match live session usage exactly.",
  "apps": [
    {
      "appId": 123,
      "appName": "chrome",
      "processName": "chrome",
      "rawIdentity": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "receivedBytes": 123456,
      "sentBytes": 7890,
      "totalBytes": 131346,
      "lastSeen": "..."
    }
  ]
}
```

Catatan penting:

- Data ini historis dari Windows SRUM, bukan live session real-time.
- Angka tidak berasal dari estimator.
- Angka tidak berasal dari jumlah koneksi aktif.
- Angka tidak berasal dari pembagian total adapter usage.
- Jika mapping `AppId` gagal, helper tetap boleh menampilkan `AppId` dengan `rawIdentity` kosong agar row byte yang valid tidak hilang.

## Normalisasi Identitas Aplikasi Tahap 16J

Setelah pembacaan SRUM berhasil, masalah berikutnya adalah identitas aplikasi dari `IdBlob` kadang terbaca sebagai string dengan spasi antar karakter, misalnya:

```text
\ d e v i c e \ h a r d d i s k v o l u m e 3 \ s t e a m \ s t e a m . e x e
c h r o m e . e x e
```

Tahap 16J menambahkan normalisasi agar identitas tersebut menjadi lebih mudah dibaca:

```text
\device\harddiskvolume3\steam\steam.exe
chrome.exe
```

Jika `rawIdentity` berisi path `.exe`, helper mengambil nama file sebagai `processName`, lalu memakai friendly mapping untuk `appName`. Contoh:

- `steam.exe` -> `Steam`
- `chrome.exe` -> `Google Chrome`
- `brave.exe` -> `Brave`
- `onedrive.exe` -> `OneDrive`
- `spotify.exe` -> `Spotify`
- `code.exe` -> `VS Code`
- `DoSvc` -> `Delivery Optimization / Windows Update`
- `BITS` -> `Background Intelligent Transfer Service`

Output aplikasi tetap membawa:

```json
{
  "rawIdentity": "...",
  "normalizedIdentity": "...",
  "appName": "Steam",
  "processName": "steam.exe",
  "receivedBytes": 123456,
  "sentBytes": 7890,
  "totalBytes": 131346,
  "lastSeen": "..."
}
```

Tahap ini hanya merapikan nama. Angka byte SRUM tidak diubah.

## Reliable SRUM Copy Tahap 16K

Masalah yang muncul setelah parser SRUM berhasil:

- Parser Managed ESENT dan pembacaan tabel network usage sudah bisa menghasilkan `supported:true`.
- Pada beberapa run, tahap copy `SRUDB.dat` gagal karena file sedang locked atau akses filesystem dibatasi.
- Error yang terlihat:

```json
{
  "supported": false,
  "sourceMethod": "srum-access-check",
  "accessStatus": "copy_failed_locked_or_io",
  "parseStatus": "not_started"
}
```

Kesimpulan: masalahnya bukan lagi mapping tabel atau parser, tetapi cara membuat copy aman dari database ESE yang sedang dipakai Windows.

Tahap 16K menambahkan strategi copy berurutan:

1. `File.Copy(source, destination)` sebagai cara paling ringan.
2. Jika gagal, jalankan:

```text
esentutl.exe /y "<source>" /d "<destination>" /o
```

3. Jika masih gagal dan helper berjalan sebagai Administrator, coba VSS copy:

```text
esentutl.exe /y /vss "<source>" /d "<destination>" /o
```

Output helper sekarang menyertakan status copy:

```json
{
  "copyStrategyUsed": "file_copy | esentutl_copy | esentutl_vss_copy | none",
  "fileCopyStatus": "...",
  "esentutlCopyStatus": "...",
  "vssCopyStatus": "...",
  "copyError": "..."
}
```

Jika salah satu strategi copy berhasil, helper langsung lanjut ke pembacaan SRUM network usage yang sudah ada. Jika semua gagal, helper mengembalikan alasan jelas:

```text
SRUM database exists but could not be copied because it is locked or access is restricted. Try running QuotaLens as Administrator.
```

Strategi ini tidak mengubah angka usage. Fallback `esentutl` hanya dipakai untuk menyalin database ESE dengan aman sebelum parser membaca copy lokal.

## SRUM ESE Recovery Tahap 16L

Masalah nyata setelah 16K:

- Helper berhasil melakukan VSS copy:

```json
{
  "copyStrategyUsed": "esentutl_vss_copy",
  "vssCopyStatus": "success",
  "accessStatus": "copied"
}
```

- Namun Managed ESENT gagal membuka database copy dengan pesan seperti:

```text
Database was not shutdown cleanly. Recovery must first be run...
```

- Header database menunjukkan:

```text
State: Dirty Shutdown
Log Required: 19139-19151
```

Artinya copy `SRUDB.dat` saja belum cukup. Database ESE berada dalam kondisi dirty shutdown dan membutuhkan file log untuk recovery.

Tahap 16L menambahkan recovery flow:

1. Copy SRUM sekarang memakai folder temp per-run:

```text
Temp\QuotaLens\srum\<timestamp>\SRUDB.dat
```

2. Helper mencoba menyalin file pendukung dari folder SRU:

```text
*.log
*.jrs
*.chk
*.pat
```

3. Parser tetap dicoba dulu. Jika database clean, recovery tidak dijalankan.
4. Jika Managed ESENT mengindikasikan dirty shutdown/recovery required, helper mencoba:

```text
esentutl.exe /r <base log name> /l "<folder>" /s "<folder>" /d "<folder>" /o
```

5. Base log name dideteksi dari file `*.log` yang berhasil dicopy. Helper juga mencoba fallback seperti `edb` dan `sru`.
6. Jika recovery berhasil, helper membuka ulang database copy dan lanjut membaca tabel SRUM network usage.
7. Jika recovery gagal, helper mengembalikan:

```json
{
  "supported": false,
  "parseStatus": "recovery_failed",
  "recoveryStatus": "failed",
  "reason": "SRUM database was copied, but ESE recovery failed because required log files were missing or inaccessible."
}
```

Output tambahan 16L:

```json
{
  "recoveryStatus": "not_needed | success | failed",
  "recoveryStrategyUsed": "none | esentutl_recovery:<base>",
  "copiedSupportFiles": ["edb.log", "edb.chk", "edbres00001.jrs"],
  "recoveryError": "..."
}
```

Tahap ini tidak mengubah parser angka usage. Jika database copy sudah clean, hasil tetap sama seperti 16I/16J.

## SRUM Period Filter Tahap 16M

Setelah SRUM per-app usage berhasil dibaca, masalah berikutnya adalah data SRUM bersifat historis dan bisa sangat panjang. Total seperti Steam puluhan GB atau Chrome puluhan GB bisa berasal dari banyak hari, sehingga user perlu filter waktu.

Tahap 16M menambahkan argumen helper:

```text
--period today
--period 7d
--period 30d
--period all
```

Default helper tanpa argumen period tetap aman untuk kompatibilitas lama. UI QuotaLens memakai default `7d` agar tampilan awal lebih relevan untuk mencari penyebab kuota cepat habis.

Filtering dilakukan langsung saat membaca row tabel SRUM network usage:

```text
{973F5D5C-1D90-4944-BE8E-24B94231A174}
```

Kolom yang dipakai untuk filter:

```text
TimeStamp
```

Aturan periode:

- `today`: mulai awal hari lokal user sampai sekarang.
- `7d`: sekarang minus 7 hari sampai sekarang.
- `30d`: sekarang minus 30 hari sampai sekarang.
- `all`: tidak ada filter waktu.

Row yang tidak punya `TimeStamp` hanya ikut dihitung untuk periode `all`. Untuk `today`, `7d`, dan `30d`, row tanpa timestamp dilewati supaya angka periode tidak tercampur data lama yang tidak jelas waktunya.

Output helper sekarang menyertakan:

```json
{
  "period": "7d",
  "periodStart": "...",
  "periodEnd": "..."
}
```

Angka tetap berasal dari SRUM:

- `BytesRecvd`
- `BytesSent`
- `AppId`
- mapping `SruDbIdMapTable`

Tidak ada estimator, connection count, atau pembagian total adapter usage pada tahap ini.

## Admin Access UX Tahap 16N

Masalah setelah SRUM parser berhasil:

- Pada beberapa run, QuotaLens bisa membaca SRUM normal.
- Pada run lain, SRUM gagal karena akses file, database locked, VSS copy, atau file log recovery membutuhkan izin lebih tinggi.
- User bisa melihat panel menjadi unsupported walaupun parser sebenarnya sudah valid.

Penyebab utama:

- `C:\Windows\System32\sru\SRUDB.dat` adalah database Windows yang dipakai sistem.
- File SRUM dan file pendukung ESE seperti log/checkpoint bisa dibatasi izin aksesnya.
- Copy atau recovery database kadang membutuhkan Administrator, terutama saat database sedang locked atau dalam kondisi dirty shutdown.

Tahap 16N menambahkan sinyal eksplisit dari helper:

```json
{
  "isAdministrator": false,
  "requiresAdministrator": true
}
```

Aturan umum:

- `isAdministrator` mendeteksi apakah helper berjalan elevated.
- `requiresAdministrator` aktif jika helper gagal karena akses/copy/permission/locked dan proses tidak berjalan sebagai Administrator.
- UI tidak melakukan auto-elevate dan tidak memaksa UAC.
- UI hanya memberi pesan jelas:

```text
Pemakaian kuota per aplikasi membutuhkan akses Administrator untuk membaca riwayat SRUM Windows.
Tutup QuotaLens, lalu jalankan kembali sebagai Administrator.
```

Detail debug tetap menampilkan:

- `copyStrategyUsed`
- `recoveryStatus`
- `accessStatus`
- `parseStatus`

Tahap ini tidak mengubah angka SRUM, parser, atau sumber data.

Electron sudah disiapkan untuk memanggil helper melalui IPC eksperimental:

```text
quotalens:get-real-per-app-usage
```

Renderer menampilkan panel:

```text
Pemakaian Kuota per Aplikasi (Eksperimental)
```

Jika helper belum tersedia atau belum mendukung pembacaan bytes, UI akan menampilkan pesan bahwa Windows tidak menyediakan data ini melalui command ringan yang sedang dipakai dan fitur membutuhkan metode tracing atau izin tambahan.

## Desktop Shortcut Dan Admin Behavior Tahap 17A

Tahap 17A merapikan perilaku aplikasi utama terhadap akses Administrator.

Prinsipnya:

- QuotaLens utama harus tetap bisa dibuka normal tanpa Administrator.
- Dashboard, session usage, Wi-Fi/SSID, history, tray, settings, dan Mini Bar tidak boleh ikut gagal hanya karena SRUM tidak bisa dibaca.
- Jika SRUM membutuhkan izin lebih tinggi, hanya panel pemakaian kuota per aplikasi yang menampilkan instruksi Run as Administrator.
- Tidak ada auto-elevate, UAC paksa, atau Windows service pada tahap ini.

Dokumentasi build juga menjelaskan bahwa `npm start` hanya untuk development, sementara packaged app berada di:

```text
out/QuotaLens-win32-x64/QuotaLens.exe
```

Shortcut Desktop bisa dibuat manual dari executable tersebut atau melalui tombol `Buat Shortcut Desktop` pada packaged app jika fitur tersebut tersedia.

## Refactor UI Normal/Developer Tahap 18A

Tahap 18A memisahkan UI normal dan informasi teknis agar pengguna awam tidak dibanjiri detail debugging.

Struktur navigasi:

- Beranda / Dashboard
- Pemakaian Aplikasi
- Riwayat
- Pengaturan
- Developer, hanya muncul saat Developer Mode aktif

Beranda hanya menampilkan informasi penting:

- SSID aktif
- status koneksi
- pemakaian hari ini
- sesi saat ini
- status batas
- top aplikasi paling boros secara ringkas
- tombol cepat seperti Reset Sesi, Segarkan, dan Buka Mini Bar

Saat Developer Mode mati, UI menyembunyikan:

- Diagnostics dan health check
- path user data/settings/history
- detail parser/copy/recovery SRUM
- estimator lama
- koneksi aktif per proses

Saat Developer Mode aktif, menu Developer muncul dan detail teknis bisa dipakai untuk debugging.

## Mini Bar Compact Tahap 18B dan 18C

Mini Bar dirapikan menjadi overlay compact, bukan window utama yang dikecilkan.

Karakter Mini Bar:

- frameless
- tanpa menu bar dan title bar Windows
- always-on-top jika setting aktif
- skip taskbar jika aman
- draggable
- tidak menampilkan scrollbar
- tidak menampilkan card besar
- tidak menampilkan debug/path/parser/raw bytes

Data utama Mini Bar:

- SSID aktif
- pemakaian hari ini
- sesi saat ini
- top app jika tersedia
- status batas

Tombol aksi hanya berupa ikon kecil:

- refresh
- buka app utama
- reset sesi jika diaktifkan
- hide Mini Bar

Tujuannya adalah memantau kuota saat gaming atau multitasking tanpa membuka window utama.

## Mini Bar Customization Tahap 18D

Tahap 18D menambahkan pengaturan tampilan Mini Bar tanpa mengubah logic monitoring atau parser SRUM.

Setting yang tersedia:

- aktif/nonaktif Mini Bar
- always-on-top
- opacity
- ukuran `compact`, `normal`, atau `wide`
- layout `minimal`, `standard`, atau `detailed`
- posisi layar
- lock posisi
- toggle data yang ditampilkan
- toggle tombol ikon yang tersedia
- reset tampilan Mini Bar ke default

Jika Mini Bar digeser dan posisi tidak terkunci, QuotaLens menyimpan custom bounds agar posisi bisa dipertahankan. Ini hanya pengaturan UI; angka usage tetap berasal dari sumber yang sama seperti dashboard.

## SRUM Temp Cache Cleanup

Helper SRUM tidak membaca `C:\Windows\System32\sru\SRUDB.dat` langsung sebagai sumber kerja utama. Untuk menghindari masalah file locked dan Dirty Shutdown, helper membuat copy sementara ke:

```text
%TEMP%\QuotaLens\srum
```

Setiap run bisa membuat folder timestamp berisi `SRUDB.dat` dan file pendukung ESE seperti `.log`, `.jrs`, dan `.chk`. Ukurannya bisa puluhan MB per run. Jika folder lama tidak dibersihkan, cache ini dapat menumpuk dan menghabiskan storage.

Cleanup otomatis sekarang dilakukan oleh helper SRUM:

- saat helper mulai, folder run lama di `%TEMP%\QuotaLens\srum` dibersihkan
- folder lebih lama dari 1 hari dihapus
- helper menyisakan maksimal 3 folder run terbaru
- jika total cache melebihi sekitar 500 MB, folder tertua dihapus lebih dulu
- setelah helper selesai membaca copy SRUM, folder run aktif juga dicoba dihapus
- jika ada file locked, helper tidak crash dan melaporkan warning di output JSON

Cleanup hanya menyentuh:

```text
%TEMP%\QuotaLens\srum
```

Cleanup tidak pernah menghapus file asli Windows:

```text
C:\Windows\System32\sru\SRUDB.dat
```

Cleanup juga tidak menyentuh data aplikasi QuotaLens di AppData/Roaming atau folder `userData`.

Jika QuotaLens sedang tertutup, aman untuk menghapus folder berikut secara manual jika ingin mengosongkan cache:

```text
%TEMP%\QuotaLens\srum
```

## Packaged Helper Debug Tahap 20A

Tahap 20A memperkuat audit runtime packaged app. Helper SRUM harus ikut masuk build Electron Forge sebagai resource:

```text
out\QuotaLens-win32-x64\resources\publish\QuotaLens.PerAppUsageHelper.exe
```

Electron memanggil helper dari `process.resourcesPath\publish\QuotaLens.PerAppUsageHelper.exe` saat app sudah dipackage. Di mode development, fallback tetap mencari output build helper di folder `native\per-app-usage-helper\bin\...`.

Jika panel SRUM gagal pada app packaged, QuotaLens menampilkan detail debug hanya saat Developer Mode aktif:

- path helper yang dipakai
- apakah helper ditemukan
- exit code helper
- preview stdout/stderr helper
- `process.resourcesPath`
- working directory helper
- status copy/recovery/cleanup SRUM

Detail ini dipakai untuk membedakan masalah permission Administrator, helper tidak ikut package, runtime .NET tidak tersedia, atau output helper bukan JSON valid. QuotaLens tetap tidak boleh mengarang angka MB/GB per aplikasi jika helper gagal.

## Mini Bar Gaming UX Tahap 20A

Mini Bar tetap menjadi overlay ringan untuk memantau kuota. Tahap 20A menambahkan opsi UX untuk mengurangi salah klik saat gaming:

- Mode Gaming
- sembunyikan tombol sampai hover
- konfirmasi sebelum menyembunyikan Mini Bar
- click-through agar klik mouse diteruskan ke aplikasi di belakang Mini Bar

Perubahan ini hanya mengatur perilaku UI Mini Bar. Parser SRUM, angka pemakaian, dan monitoring inti tidak berubah.

## Rekomendasi Berikutnya

1. Validasi angka SRUM dengan pembanding Windows Settings > Network & Internet > Data usage.
2. Uji SRUM pada beberapa laptop Windows berbeda, termasuk mode non-Administrator dan Administrator.
3. Ukur dampak CPU/RAM saat helper SRUM dijalankan.
4. Pertahankan label bahwa data SRUM adalah historis, bukan live session real-time.
5. Jika nanti butuh live per-app usage, lanjutkan riset ETW secara terpisah dari jalur SRUM.

## Hal yang Tidak Boleh Dilakukan

- Jangan memakai `Get-NetTCPConnection` sebagai sumber byte per aplikasi.
- Jangan membagi total byte adapter berdasarkan jumlah koneksi.
- Jangan membagi total byte adapter berdasarkan confidence score estimator.
- Jangan menampilkan angka MB/GB per aplikasi jika sumber datanya belum benar.
- Jangan terminate, block, atau mengubah perilaku aplikasi lain.
