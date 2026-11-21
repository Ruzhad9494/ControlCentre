# Setup Fasa 2G - ClaimReport (DO Generator Sungrow) selesai

Terus ke production, tiada staging. Ikut langkah 1 hingga 9 mengikut susunan. Kad modul kekal "Akan datang" sehingga langkah 9 siap.

Walaupun namanya ClaimReport, sistem lama (`gcc-voltake/claimreport`) sebenarnya **DO Generator**: Strategic Planning isi borang, sistem isi tab Template "DO SUNGROW NEW", jana PDF + Excel, dan log ke tab Database. Perbandingan lama vs baharu: `docs/rujukan-sistem-lama.md`.

| Role | Boleh |
|---|---|
| `user` (Strategic Planning) | Jana DO, lihat ringkasan & semua DO, muat turun PDF / Excel / Zip, ubah DO **sendiri pada hari yang sama** |
| `admin` (Head of Strategic Planner) | + ubah apa-apa DO (sebab wajib untuk DO staf lain), padam DO (lembut, sebab wajib), buang alamat dari senarai |

## Langkah 1 - Merge ke `main`

Sudah dibuat (push ke `main`). Pastikan deployment Production Cloudflare **Success**.

## Langkah 2 - Cipta Sheet

Drive `systems@voltake.com` > **sheets.new** > namakan tepat **`VP-ClaimReport`**. Jangan Share, jangan Publish to web. Salin ID dari URL.

## Langkah 3 - Salin tab Template dari Sheet lama (penting)

PDF dan Excel dijana dari tab yang sama seperti sistem lama, jadi formatnya kekal.

1. Buka Sheet lama **DO SUNGROW NEW**.
2. Klik kanan tab **Template** > **Copy to** > **Existing spreadsheet** > pilih `VP-ClaimReport`.
3. Dalam `VP-ClaimReport`, tukar nama tab "Copy of Template" kepada tepat **`Template`**.
4. Semak: token `{{DO_NO}}`, `{{DATE}}`, `{{FROM_NAME}}` dan lain-lain masih ada, dan baris item pertama di **baris 17**. Jika template diubah, kemas kini `item_row` / `print_last_col` di tab Settings.

## Langkah 4 - Cipta Apps Script

1. script.google.com > **New project** > `VP-claimreport`.
2. **Project Settings** > tick **Show "appsscript.json" manifest file in editor**.
3. `Code.gs`: ganti nama jadi `Actions`. Paste dari GitHub folder **`apps/claimreport/gas/`**: `Actions`, `Config`, `Doc`, `Files`, `Schema`, `Setup`, `VPAudit`, `VPAuth`, `VPCore`, `VPSheet`, dan `appsscript.json`. Ctrl+S.

## Langkah 5 - Script Properties dan setup

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID Sheet `VP-ClaimReport` |
| `ROOT_FOLDER_ID` | ID folder `VP-Files` (sama dengan modul lain) |
| `MODULE_SECRET` | Rentetan rawak baharu, minimum 32 aksara |
| `ENV` | `prod` |

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

1. Run **`checkConfig`** → `checkConfig OK (ENV=prod)`.
2. Run **`setupSystem`** (benarkan Sheets, Drive dan "connect to an external service": diperlukan untuk eksport PDF/Excel, sama seperti sistem lama). Log mesti ada **`Template: ada`**. Jika `Template: TIADA`, ulang Langkah 3.
3. Tab **Settings**: biar nilai lalai (`do_suffix` = `_JD`, `item_row` = 17, `print_last_col` = 10) melainkan template berubah.
4. Tab **Parties**: preset From lama (JingDong Logistics, Koennen Technology) sudah ditambah.

## Langkah 6 - Import Database DO lama (disyorkan)

Supaya nombor DO bersambung (contoh DO lama terakhir No 41 → DO baru jadi 42) dan semakan DO No pendua merangkumi DO lama.

1. Dalam Sheet lama, tab **Database**: klik A1 > **Ctrl+A**, **Ctrl+C**.
2. Dalam `VP-ClaimReport`, tambah tab **`IMPORT_DATABASE`** > klik A1 > **Paste special > Values only**.
3. Run **`importOldData`**. Log contoh: `importOldData: DO lama ditambah 41 (dilangkau sudah ada: 0)`.
4. Selamat dijalankan semula. Selepas semak, padam tab `IMPORT_DATABASE`.

DO lama ditanda "Sistem lama". PDF / Excel lama dirujuk ikut ID fail (fail kekal di folder GCC REPORT lama). `systems@voltake.com` mesti ada akses ke folder itu supaya butang PDF / Excel DO lama berfungsi. DO lama hanya boleh diubah oleh admin.

## Langkah 7 - Deploy web app

**Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone** > Deploy > salin URL `/exec`.

## Langkah 8 - Cloudflare env (Production) dan akses

Settings > Variables and Secrets > **Production**:

| Name | Value | Jenis |
|---|---|---|
| `GAS_URL_CLAIMREPORT` | URL Langkah 7 | Secret |
| `MODULE_SECRET_CLAIMREPORT` | Sama tepat dengan `MODULE_SECRET` Langkah 5 | Secret |

Kemudian **Deployments** > deployment terkini > **Retry deployment**. Kalau tak, mesej "Modul belum dikonfigurasi: ... tiada dalam deployment ini" keluar.

Admin > Akses modul > **ClaimReport**: staf Strategic Planning `user`; Head of Strategic Planner `admin`.

## Langkah 9 - Uji, kemudian buka kepada semua

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | Jana DO: 2 rujukan (RW + MA, RC), 1 APAC, 2 item unit berbeza | Pratonton No. DO `RW..._MA..._JD` + `RC..._JD`; total carton contoh `2 PALLET, 10 PCS` |
| 2 | Tekan Jana DO | Nama fail `<No>. <DO No>`; PDF & Excel sama format dengan DO lama (bandingkan sebelah-menyebelah) |
| 3 | Jana DO dengan No RW + MA yang sama | Ditolak "dah wujud" |
| 4 | DO baru: pilih alamat To yang pernah digunakan | Alamat, ATTN, Tel diisi sendiri |
| 5 | Senarai DO > Zip PDF (Bulan ini) | `GCC <Month> <Year>.zip` dimuat turun |
| 6 | Senarai PDF | `GCC_<Month>_<Year>_List.pdf` |
| 7 | User ubah DO sendiri hari ini | Berjaya; PDF dijana semula, nombor kekal |
| 8 | User ubah DO staf lain / semalam | Tiada butang Ubah |
| 9 | Admin padam DO dengan sebab | Hilang dari senarai; tab DeliveryOrders `deleted` = TRUE + sebab |
| 10 | Folder `VP-Files/ClaimReport` | Tiada "anyone with link" |
| 11 | `VP-ClaimReport` > File > Share > Publish to web | Tiada yang diterbitkan |

Padam DO ujian (admin > Padam) sebelum go-live. Nombor DO terus naik selepas DO ujian; jika mahu bermula semula dari nombor lama, padam baris ujian terus dari tab DeliveryOrders sebelum DO sebenar pertama.

**Go-live:**
1. Sheet `VP-Access` > tab Modules > baris `claimreport` > `status` = **`aktif`**.
2. Sistem lama: matikan "Publish to web" (CSV) pada Sheet DO SUNGROW lama, buang "anyone with link" pada folder PDF/EXCEL lama (Fasa 0A), kunci Sheet lama, archive repo `claimreport`.

## Kalau ada masalah

| Gejala | Punca biasa |
|---|---|
| "Tab "Template" tiada dalam VP-ClaimReport" | Langkah 3 belum dibuat / nama tab bukan tepat `Template` |
| PDF kosong atau terpotong | Template diubah: semak `item_row` dan `print_last_col` di Settings |
| "Ralat dalaman pelayan" semasa jana | Kebenaran "external service" belum diberi: run `setupSystem` sekali lagi dari editor dan benarkan |
| PDF DO lama "tidak dapat dibuka" | `systems@voltake.com` tiada akses ke folder GCC REPORT lama |
| "Modul belum dikonfigurasi: ..." | Env Cloudflare yang disebut tiada; isi dan Retry deployment |
