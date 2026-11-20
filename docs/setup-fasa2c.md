# Setup Fasa 2C - AMS (production terus)

Terus ke production, tiada staging. Ikut langkah 1 hingga 9 mengikut susunan. Kad AMS kekal "Akan datang" kepada staf sehingga Langkah 9.

AMS dibina ikut sistem lama `voltake-energy/AMS` (papan pemuka, status kalibrasi, audit bulanan, troli mobiliti, pulang + admin sahkan). Perbandingan lama vs baharu: `docs/rujukan-sistem-lama.md`.

| Role AMS | Untuk siapa (sistem lama: designation) | Boleh |
|---|---|---|
| `staff` | Semua staf yang pinjam aset | Lihat senarai aset & sijil, pinjam (troli), pulangkan pinjaman sendiri |
| `auditor` | Auditor (designation "Auditor") | Semua kuasa `staff` + audit bulanan (Baik / Rosak / Hilang) |
| `admin` | Admin aset (designation "Admin") | Semua: tambah/ubah/lupus aset, kalibrasi semula, audit, sahkan pemulangan |

Superadmin portal dikira `admin` aset (tiada isu asingan tugas dalam AMS).

## Langkah 1 - Merge ke `main` (GitHub)

Pull Request dari branch `claude/compassionate-edison-ouik0h` ke `main` > **Merge**. Tunggu deployment Production Cloudflare jadi **Success**.

## Langkah 2 - Cipta Sheet

Drive `systems@voltake.com` > **sheets.new** > namakan tepat **`VP-AMS`**. Biar kosong, jangan Share, jangan Publish to web. Salin ID dari URL.

## Langkah 3 - Cipta Apps Script

1. script.google.com > **New project** > `VP-ams`.
2. **Project Settings** > tick **Show "appsscript.json" manifest file in editor**.
3. `Code.gs`: ganti nama jadi `Actions`. Paste dari GitHub folder **`apps/ams/gas/`**:

| Nama dalam editor | Fail GitHub |
|---|---|
| `Actions` | `Actions.gs` |
| `Config` | `Config.gs` |
| `Files` | `Files.gs` |
| `Notify` | `Notify.gs` |
| `Schema` | `Schema.gs` |
| `Setup` | `Setup.gs` |
| `VPAudit` | `VPAudit.gs` |
| `VPAuth` | `VPAuth.gs` |
| `VPCore` | `VPCore.gs` |
| `VPSheet` | `VPSheet.gs` |
| `appsscript.json` | ganti seluruh isi |

Ctrl+S.

## Langkah 4 - Script Properties dan setup

**Project Settings > Script Properties**, empat sahaja:

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID Sheet `VP-AMS` |
| `ROOT_FOLDER_ID` | ID folder `VP-Files` (**folder yang sama** dengan ClaimPro; AMS cipta `AMS/Photos`, `AMS/Certs`, `AMS/Audits`, `AMS/Returns` di dalamnya) |
| `MODULE_SECRET` | Rentetan rawak baharu, minimum 32 aksara. Jangan guna semula secret modul lain |
| `ENV` | `prod` |

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Kemudian dalam editor:

1. Run **`checkConfig`**. Log: `checkConfig OK (ENV=prod)`.
2. Run **`setupSystem`**. Benarkan kebenaran **Drive** dan **hantar emel**. Log: `setupSystem selesai: VP-AMS | Assets (baru) | CalibrationLog (baru) | Audits (baru) | Movements (baru) | Settings (baru) | ...`
3. Sheet `VP-AMS` > tab **Settings**, isi lajur `value`:
   - `portal_url`: contoh `https://voltake-portal.pages.dev` (tanpa `/` di hujung)
   - `admin_notify_emails`: emel admin aset (pemulangan menunggu pengesahan + laporan Isnin)
   - `amaran_kalibrasi_hari`: biar `30` (sistem lama: "Lagi Sebulan")
   - `sekat_pinjam_luput`: `TRUE` = aset yang kalibrasinya dah luput tak boleh dipinjam. Tukar ke `FALSE` jika mahu ikut sistem lama (tiada sekatan)
4. Menu **Triggers**: patut ada 1 trigger `weeklyReport` (Isnin 8 pagi).

## Langkah 5 - Import data sistem lama

Tiada tab password dibawa. Hanya senarai aset (dan log kalibrasi jika mahu).

**5a. Senarai aset (wajib).**
1. Buka Sheet AMS **lama** > tab **MASTERLIST** > klik sel A1 > **Ctrl+A**, **Ctrl+C**.
2. Sheet `VP-AMS` > tambah tab baharu bernama tepat **`IMPORT_MASTERLIST`** > klik A1 > **Edit > Paste special > Values only** (Ctrl+Shift+V).
3. Apps Script > pilih fungsi **`importMasterlist`** > Run. Log contoh: `importMasterlist: 152 aset ditambah, 0 dilangkau (No sudah wujud). Amaran: ...`
4. Baca amaran (contoh no. siri berulang, tarikh tak difahami) dan betulkan terus dalam tab `Assets` jika perlu.

Yang dibawa: No (dikekalkan sebagai no. aset), Category, Make, Model, Serial No, Location Origin, Current Location, Expired Date, Calibration By, pautan sijil / gambar / gambar audit (disimpan sebagai ID fail; fail kekal dalam folder Drive lama), Last Audit Date, Audit Status, Remark, Status Pinjaman. Aset yang sedang "Dipinjam" dalam sistem lama dibawa dengan nama pemegang; bila aset dipulangkan, admin tekan **Terima pulang** di butiran aset.

Selamat dijalankan semula: aset yang No-nya sudah ada dilangkau.

**5b. Log kalibrasi (pilihan).** Tab **CALIBRATION LOG** lama > salin ke tab **`IMPORT_CALIBRATION`** > Run **`importCalibrationLog`**. Dipadankan ke aset ikut no. siri.

Selepas semak, tab `IMPORT_MASTERLIST` dan `IMPORT_CALIBRATION` boleh dipadam.

> Sijil dan gambar lama masih dalam folder Drive sistem lama. Ia boleh dibuka dari portal selagi akaun yang deploy Apps Script ini ada akses ke fail itu. Jika keluar "Fail tidak dapat dibuka", share folder lama itu kepada `systems@voltake.com` (bukan "anyone with link").

## Langkah 6 - Deploy web app

**Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone** > Deploy > salin URL `/exec`.

## Langkah 7 - Cloudflare env (Production)

Settings > Variables and Secrets > **Production** > tambah (jenis Secret):

| Name | Value |
|---|---|
| `GAS_URL_AMS` | URL Langkah 6 |
| `MODULE_SECRET_AMS` | Sama tepat dengan `MODULE_SECRET` Langkah 4 |

Kemudian **Deployments** > deployment terkini > **Retry deployment**.

## Langkah 8 - Akses staf

Admin > Akses modul > **AMS**:
- Staf yang pinjam aset (teknikal, engineer): `staff`
- Auditor: `auditor`
- Admin aset: `admin`

Bagi diri sendiri `admin` dahulu untuk uji (atau guna superadmin).

## Langkah 9 - Uji, kemudian buka kepada semua

Uji dengan akaun sebenar (taip `/ams/` terus):

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | Admin buka Papan pemuka | Jumlah aset sama dengan MASTERLIST lama; kad lokasi; senarai tindakan kalibrasi |
| 2 | Klik KPI "Telah luput" | Senarai aset ditapis kepada yang luput sahaja |
| 3 | Aset > CSV | Lajur sama macam sistem lama; tiada emel |
| 4 | Buka butiran aset lama > Sijil kalibrasi | Sijil lama terbuka (lihat nota Langkah 5 jika gagal) |
| 5 | Tambah aset baharu dengan no. siri yang sudah ada | Ditolak: "sudah didaftar" |
| 6 | Kalibrasi > pilih aset luput > Kalibrasi semula dengan sijil PDF | Status jadi "Masih Aktif"; sejarah kalibrasi bertambah |
| 7 | Staf (telefon): Mobiliti > tambah 2 aset ke troli > Sahkan pinjaman | Kedua-dua "Dipinjam" dengan nama staf; nama tak boleh ditaip sendiri |
| 8 | Staf cuba pinjam aset yang kalibrasinya luput | Ditolak (jika `sekat_pinjam_luput` = TRUE) |
| 9 | Staf pulangkan satu aset sebagai Rosak tanpa gambar, kemudian dengan gambar | Pertama ditolak; kedua jadi "Menunggu pengesahan" dan admin dapat emel |
| 10 | Staf lain cuba pulangkan pinjaman staf pertama (curl ke `/api/ams/returnAsset`) | 403 |
| 11 | Admin: Mobiliti > Sahkan pemulangan > lokasi "Lab A" | Aset "Tersedia" di Lab A; sejarah pinjaman lengkap di butiran aset |
| 12 | Auditor: Audit > tekan Baik pada satu aset, Rosak pada satu lagi (tanpa catatan, kemudian dengan catatan) | Kemajuan naik; Rosak tanpa catatan ditolak |
| 13 | Staf cuba buka `/api/ams/saveAsset` atau `recordAudit` | 403 |
| 14 | Folder Drive `VP-Files/AMS` | Tiada "anyone with link" |
| 15 | `VP-AMS` > File > Share > Publish to web | Tiada yang diterbitkan |

Padam aset/pinjaman ujian dari Sheet (atau tanda `deleted` = TRUE) sebelum go-live.

**Go-live:** Sheet `VP-Access` > tab Modules > baris `ams` > `status` = **`aktif`**. Selepas semua staf guna sistem baharu: kunci Sheet AMS lama (view-only), **unpublish** CSV awam MASTERLIST dan ID PASSWORD (Fasa 0A), dan archive repo `voltake-energy/AMS`.

## Kalau ada masalah

| Gejala | Punca biasa |
|---|---|
| `setupSystem` gagal "Drive" | `appsscript.json` lama: paste semula |
| "Folder tak dijumpai" | `ROOT_FOLDER_ID` salah, atau folder bukan milik `systems@voltake.com` |
| `importMasterlist`: "Tab IMPORT_MASTERLIST tiada atau kosong" | Nama tab mesti tepat; header mesti di baris 1 |
| Tarikh luput kosong selepas import | Format tarikh lama tak dikenali (lihat amaran dalam log); isi terus dalam tab `Assets` lajur `calib_expiry` format `YYYY-MM-DD` |
| "Fail tidak dapat dibuka" untuk sijil lama | Akaun Apps Script tiada akses ke fail Drive lama |
| "Konfigurasi modul tidak sepadan (secret)" | `MODULE_SECRET_AMS` tak sama tepat dengan `MODULE_SECRET` |
| Emel tak sampai | `admin_notify_emails` kosong dalam Settings; semak folder Spam |
