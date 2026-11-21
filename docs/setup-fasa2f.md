# Setup Fasa 2F - GWR (Ground Work Report OMP + PSS) selesai

Terus ke production, tiada staging. Ikut langkah 1 hingga 9 mengikut susunan. Kad modul kekal "Akan datang" kepada staf sehingga langkah 9 siap.

Dibina ikut GWR v4.2 lama (`voltake-energy/gwrompnew` untuk OMP dan `Ruzhad9494/gwrpss` untuk PSS). Kod kedua-dua sistem lama hampir sama, jadi kini **satu modul** dengan medan `dept` (OMP / PSS). Perbandingan lama vs baharu: `docs/rujukan-sistem-lama.md`.

| Bahagian | Untuk siapa | Alamat |
|---|---|---|
| Dashboard, borang report, butiran | Staf OMP / PSS | Portal > kad GWR (`/gwr/`) |
| Halaman tandatangan klien (awam, tanpa login) | Klien | `https://<portal>/public/gwr-sign/?t=...` (pautan sekali guna, luput 7 hari) |

| Role | Boleh |
|---|---|
| `manager` | Semua report department dalam skop, cipta / ubah, batalkan report (dengan sebab), tab Prestasi staf |
| `supervisor`, `engineer`, `chargeman` | Cipta report baru dan isi maklumat projek (sistem lama: manager & engineer / supervisor OMP) |
| `technician` | Sambung draf yang disediakan, isi kerja, manpower, gambar, tandatangan dan hantar. Tak boleh ubah maklumat projek (sistem lama sama) |

Skop department: kosong = department staf dalam portal (OMP atau PSS). Untuk manager kedua-dua department isi skop `dept=OMP,PSS`.

## Langkah 1 - Merge ke `main`

Sudah dibuat (push ke `main`). Pastikan deployment Production Cloudflare **Success**.

## Langkah 2 - Cipta Sheet

Drive `systems@voltake.com` > **sheets.new** > namakan tepat **`VP-GWR`**. Jangan Share, jangan Publish to web. Salin ID dari URL.

## Langkah 3 - Cipta Apps Script

1. script.google.com > **New project** > `VP-gwr`.
2. **Project Settings** > tick **Show "appsscript.json" manifest file in editor**.
3. `Code.gs`: ganti nama jadi `Actions`. Paste dari GitHub folder **`apps/gwr/gas/`**: `Actions`, `Config`, `Files`, `Notify`, `Pdf`, `Schema`, `Setup`, `VPAudit`, `VPAuth`, `VPCore`, `VPSheet`, dan `appsscript.json`. Ctrl+S.

## Langkah 4 - Script Properties dan setup

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID Sheet `VP-GWR` |
| `ROOT_FOLDER_ID` | ID folder `VP-Files` (sama dengan modul lain) |
| `MODULE_SECRET` | Rentetan rawak baharu, minimum 32 aksara |
| `ENV` | `prod` |

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

1. Run **`checkConfig`** → `checkConfig OK (ENV=prod)`.
2. Run **`setupSystem`** (benarkan Drive, emel dan trigger). Folder `VP-Files/GWR/OMP` dan `GWR/PSS`, setiap satu dengan `Images`, `Signatures`, `PDF`, dicipta.
3. Tab **Settings**, isi `value`:
   - `portal_url`: contoh `https://voltake-portal.pages.dev` (**wajib**: pautan klien dibina dari sini)
   - `pautan_luput_hari`: biar `7`
   - `emel_cc_OMP`, `emel_cc_PSS`: emel yang dapat salinan PDF final (contoh manager department), pisah koma
   - `company_*`: kepala PDF. Nilai awal diambil dari sistem lama; semak.
4. Menu **Triggers**: 1 trigger `dailyExpire` (3 pagi).

## Langkah 5 - Import report lama (pilihan)

Dalam Sheet lama setiap department, salin tab report (klik A1 > **Ctrl+A**, **Ctrl+C**) ke tab baharu dalam `VP-GWR` (klik A1 > **Paste special > Values only**):

| Sheet lama | Tab baharu |
|---|---|
| GWR OMP (`gwrompnew`) | `IMPORT_OMP` |
| GWR PSS (`gwrpss`) | `IMPORT_PSS` |

Run **`importOldData`**. Log contoh: `importOldData: OMP: 5 (dilangkau Approved: 120), PSS: 3 (dilangkau Approved: 88)`.

- **Approved tidak dibawa**: kekal dalam Sheet lama (kunci view-only). PDF final lama kekal di Drive lama.
- **Draft** jadi **Draf** (boleh disambung). **Pending** jadi **Luput**: token lama tak selamat, jadi staf tekan "Jana pautan baharu" untuk hantar semula kepada klien.
- Gambar dan PDF draf lama dirujuk ikut ID fail (fail kekal di folder lama). `systems@voltake.com` mesti ada akses ke folder lama.
- Selamat dijalankan semula (ReportID lama disimpan). Padam tab `IMPORT_*` selepas semak.

## Langkah 6 - Deploy web app

**Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone** > Deploy > salin URL `/exec`.

## Langkah 7 - Cloudflare env (Production)

Settings > Variables and Secrets > **Production**:

| Name | Value | Jenis |
|---|---|---|
| `GAS_URL_GWR` | URL Langkah 6 | Secret |
| `MODULE_SECRET_GWR` | Sama tepat dengan `MODULE_SECRET` Langkah 4 | Secret |

`TURNSTILE_SECRET` dan `TURNSTILE_SITE_KEY` sudah ada dari Fasa 2E dan dikongsi. Di widget Turnstile, pastikan hostname portal ada (tiada perubahan jika sama).

Kemudian **Deployments** > deployment terkini > **Retry deployment**. Tanpa langkah ini kad GWR akan papar "Modul belum dikonfigurasi".

## Langkah 8 - Akses staf

Admin > Akses modul > **GWR**: setiap staf OMP / PSS diberi satu role (`manager`, `supervisor`, `engineer`, `chargeman` atau `technician`). Manager dua department: skop `dept=OMP,PSS`.

## Langkah 9 - Uji, kemudian buka kepada semua

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | Engineer PSS > Report baru > isi projek, kerja (tanda shutdown MV), manpower, 4 gambar, tandatangan > Hantar | Kotak "Pautan tandatangan klien" muncul; butang WhatsApp buka mesej "Berikut merupakan Ground Work Report Form \| ..." |
| 2 | Buka pautan di telefon lain tanpa login | Butiran report, "Lihat PDF penuh" muat turun `<Lokasi>_<Klien>_<DDMMYYYY>_Draft.pdf` |
| 3 | Klien isi nama, jawatan, telefon, emel, tandatangan, tanda pengesahan > Sahkan | "Report telah disahkan"; klien, staf dan `emel_cc_PSS` dapat emel dengan PDF final |
| 4 | Buka pautan yang sama sekali lagi | "Pautan tidak sah atau sudah digunakan" |
| 5 | Staf buka report itu | Status Disahkan, butang PDF final, tiada butang Ubah |
| 6 | Telefon mod kapal terbang > isi report > Simpan draf | "1 report menunggu dihantar" |
| 7 | Hidupkan internet, buka GWR | Draf dihantar sendiri, barisan kosong |
| 8 | Technician > Isi report | Ditegur: sambung draf sahaja; medan projek dikunci bila sambung draf |
| 9 | Staf OMP buka dashboard | Tidak nampak report PSS |
| 10 | Report Menunggu klien diubah | Status jadi Draf, pautan lama mati |
| 11 | Folder `VP-Files/GWR` | Tiada "anyone with link" |
| 12 | `VP-GWR` > File > Share > Publish to web | Tiada yang diterbitkan |

Batalkan report ujian (manager > Batalkan) sebelum go-live.

**Go-live:**
1. Sheet `VP-Access` > tab Modules > baris `gwr` > `status` = **`aktif`**.
2. Minta staf buka GWR sekali semasa ada internet (supaya app tersimpan untuk kegunaan di site tanpa line).
3. Sistem lama (selepas semua Pending lama selesai): kunci Sheet lama, buang perkongsian "anyone with link" pada folder gambar & PDF lama (Fasa 0A), archive repo `gwrompnew` dan `gwrpss`.

## Kalau ada masalah

| Gejala | Punca biasa |
|---|---|
| "Modul belum dikonfigurasi" | `GAS_URL_GWR` / `MODULE_SECRET_GWR` belum diisi atau deployment belum di-Retry |
| Pautan klien bermula `/public/gwr-sign` tanpa domain | `portal_url` dalam Settings kosong |
| Klien: "Borang belum dikonfigurasi (Turnstile)" | `TURNSTILE_SECRET` tiada di Production |
| "Department anda bukan OMP / PSS" | Department staf dalam portal lain; isi skop `dept=OMP` atau `dept=PSS` |
| PDF final tiada selepas klien sahkan | Lihat Apps Script > Executions (log "PDF final gagal"); gambar terlalu banyak / besar |
| Report tersekat "Gagal" dalam barisan telefon | Mesej ralat dipapar (contoh report sudah disahkan). Buang dari barisan selepas semak |
