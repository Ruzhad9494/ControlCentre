# Setup Fasa 2H - Voltrack

Terus ke production, tiada staging. Ikut langkah 1 hingga 8 mengikut susunan. Kad modul kekal "Akan datang" sehingga langkah 8 siap.

Dibina ikut VoltTrack v2 lama (`Ruzhad9494/Voltrack`). Perbandingan lama vs baharu: `docs/rujukan-sistem-lama.md`.

| Role | Tulis | Contoh staf (PRD) |
|---|---|---|
| `commercial` | Daftar projek baru + tab Commercial | Pasukan Commercial |
| `operation` | Tab Operation | Manager PSS & Manager OMP |
| `claim` | Tab Claim | HR |
| `lod` | Tab LOD | HR & Account |
| `admin` | Semua tab + padam projek (dengan sebab) | Ditetapkan pemilik |

Semua role (dan `viewer` portal) boleh **baca** semua tab dan dashboard, sama macam sistem lama. Seorang staf boleh pegang beberapa role, contohnya HR = `claim,lod`.

Tab **Users** dan password lama tidak digunakan lagi. Login guna Google, dan akses ditetapkan di Admin > Akses modul.

## Langkah 1 - Merge ke `main`

Sudah dibuat (push ke `main`). Pastikan deployment Production Cloudflare **Success**.

## Langkah 2 - Cipta Sheet

Drive `systems@voltake.com` > **sheets.new** > namakan tepat **`VP-Voltrack`**. Jangan Share, jangan Publish to web. Salin ID dari URL.

## Langkah 3 - Cipta Apps Script

1. script.google.com > **New project** > `VP-voltrack`.
2. **Project Settings** > tick **Show "appsscript.json" manifest file in editor**.
3. `Code.gs`: ganti nama jadi `Actions`. Paste dari GitHub folder **`apps/voltrack/gas/`**: `Actions`, `Config`, `Notify`, `Schema`, `Setup`, `VPAudit`, `VPAuth`, `VPCore`, `VPSheet`, dan `appsscript.json`. Ctrl+S.

## Langkah 4 - Script Properties dan setup

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID Sheet `VP-Voltrack` |
| `ROOT_FOLDER_ID` | ID folder `VP-Files` (sama dengan modul lain; Voltrack tak simpan fail, tapi semakan config perlukan) |
| `MODULE_SECRET` | Rentetan rawak baharu, minimum 32 aksara |
| `ENV` | `prod` |

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

1. Run **`checkConfig`** → `checkConfig OK (ENV=prod)`.
2. Run **`setupSystem`** (benarkan Sheets, emel dan trigger). Log: `setupSystem selesai: VP-Voltrack | Commercial (baru) | Operation (baru) | Claim (baru) | LOD (baru) | ...`
3. Tab **Settings**, isi `value`:
   - `portal_url`: contoh `https://voltake-portal.pages.dev`
   - `emel_peringatan`: emel yang dapat ringkasan tunggakan setiap pagi (sistem lama: push kepada LOD & Admin), pisah koma
   - `tempoh_bayaran_hari`: biar `30` (due date = invoice date + 30 hari, sama macam sistem lama)
4. Menu **Triggers**: 1 trigger `dailyOverdue` (8 pagi).

## Langkah 5 - Import projek lama

Dalam Sheet VoltTrack lama, salin setiap tab (klik A1 > **Ctrl+A**, **Ctrl+C**) ke tab baharu dalam `VP-Voltrack` (klik A1 > **Paste special > Values only**):

| Tab lama | Tab baharu |
|---|---|
| Commercial | `IMPORT_COMMERCIAL` |
| Operation | `IMPORT_OPERATION` |
| Claim | `IMPORT_CLAIM` |
| LOD | `IMPORT_LOD` |

**Jangan salin tab Users** (ada hash password).

Kemudian pilih satu:
- **`importOldData`**: hanya projek **belum tutup** dibawa (ikut BSD 7). Tutup bermaksud quotation `Cancel`, bayaran `Paid`, atau kes LOD `Closed`.
- **`importOldDataSemua`**: semua projek dibawa. Pilih ini kalau mahu nilai diluluskan dan ringkasan klien dalam dashboard termasuk projek lama yang dah selesai.

Log contoh: `importOldData: projek ditambah 18 (tutup dilangkau: 40, sudah ada: 0)`. Ia selamat dijalankan semula, jadi `importOldDataSemua` boleh dijalankan kemudian untuk tambah yang tertinggal. Lepas semak, padam tab `IMPORT_*`.

ID projek lama (`EL-YYYY-NNN`) kekal. Projek baru tahun ini bermula dari nombor terbesar tahun ini + 1.

## Langkah 6 - Deploy web app

**Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone** > Deploy > salin URL `/exec`.

## Langkah 7 - Cloudflare env (Production) dan akses

Settings > Variables and Secrets > tab **Production**:

| Name | Value | Jenis |
|---|---|---|
| `GAS_URL_VOLTRACK` | URL Langkah 6 | Secret |
| `MODULE_SECRET_VOLTRACK` | Sama tepat dengan `MODULE_SECRET` Langkah 4 | Secret |

Lepas Save, buat **deployment baru** (Retry deployment pada deployment Production paling atas, atau push apa-apa commit ke `main`). Kalau mesej "Modul belum dikonfigurasi: ... tiada dalam deployment ini" masih keluar, bermakna deployment yang jalan belum ambil env tersebut.

Admin > Akses modul > **Voltrack**: Commercial `commercial`; manager PSS & OMP `operation`; HR `claim,lod`; Account `lod`; individu terpilih `admin`.

## Langkah 8 - Uji, kemudian buka kepada semua

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | Commercial > Projek baru | ID `EL-<tahun>-NNN`; hanya butang Kemaskini Commercial kelihatan |
| 2 | Tukar status quotation ke Approved | Tarikh proceed diisi sendiri; projek muncul di tab Operation |
| 3 | Manager PSS buka tab Commercial | Lihat sahaja (tiada Kemaskini / Projek baru) |
| 4 | Operation: GWR Yes, Full Report Yes | Status kerja "Completed Full Report"; projek muncul di tab Claim |
| 5 | HR: isi invoice date 40 hari lepas | Follow up +7/+14/+21, due +30; status jadi Outstanding 10 hari; masuk tab LOD |
| 6 | HR / Account: rekod tarikh sebenar reminder | Disimpan; "Dikemas kini ... oleh <nama>" (bukan emel) |
| 7 | Esok pagi selepas 8:00 | `emel_peringatan` dapat "[Voltrack] N projek tertunggak" |
| 8 | Staf tanpa akses Voltrack buka `/voltrack/` | Ke halaman "Tiada akses" |
| 9 | `VP-Voltrack` > File > Share > Publish to web | Tiada yang diterbitkan |

Padam projek ujian (admin > Padam projek) sebelum go-live.

**Go-live:**
1. Sheet `VP-Access` > tab Modules > baris `voltrack` > `status` = **`aktif`**.
2. Sistem lama: kunci Sheet VoltTrack lama (view-only), padam tab Users lama, rotate OneSignal REST API key (pernah terdedah, ikut nota dalam Code.gs lama) atau matikan app OneSignal, archive repo `Voltrack`.

## Kalau ada masalah

| Gejala | Punca biasa |
|---|---|
| "Modul belum dikonfigurasi: GAS_URL_VOLTRACK..." | Env belum diisi di Production, atau deployment belum dibina semula |
| "Role anda tidak boleh mengubah fasa ..." | Role di Akses modul tak termasuk fasa itu |
| Emel tunggakan tak sampai | `emel_peringatan` kosong, atau trigger `dailyOverdue` tiada; semak Spam |
| Projek lama tak muncul | `importOldData` hanya bawa projek belum tutup; jalankan `importOldDataSemua` |
