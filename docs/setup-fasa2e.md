# Setup Fasa 2E - Draft Mohon Kerja (production terus)

Terus ke production, tiada staging. Ikut langkah 1 hingga 10 mengikut susunan. Kad modul kekal "Akan datang" kepada staf, dan borang awam belum boleh digunakan, sehingga langkah berkaitan siap.

Dibina ikut sistem lama `Ruzhad9494/draftmohonkerja`. Perbandingan lama vs baharu: `docs/rujukan-sistem-lama.md`.

| Bahagian | Untuk siapa | Alamat |
|---|---|---|
| Borang permohonan (awam, tanpa login) | Pemohon kerja | `https://<portal>/public/mohon/` |
| Pemohon kerja (HR) | `hr_admin` | Portal > kad Mohon Kerja |
| Papan interviewer | `interviewer` | Portal > kad Mohon Kerja |

| Role | Boleh |
|---|---|
| `hr_admin` | Semua pemohon (penuh), ubah status / department / tarikh interview / catatan, urus jawatan, cetak borang, anonimkan, CSV |
| `interviewer` | Pemohon **department sendiri** sahaja (atau skop `dept=PSS,OMP` di Akses modul). No. KP dimask, tiada rekod jenayah / alamat / telefon / emel / rujukan. Beri markah 1-5 (5 kriteria) + cadangan |

`SECRET_KEY` dalam HTML dan pautan token papan interviewer lama **tidak digunakan lagi**.

## Langkah 1 - Merge ke `main`

Merge branch ke `main` (atau minta saya push). Tunggu deployment Production Cloudflare jadi **Success**.

## Langkah 2 - Cipta Sheet

Drive `systems@voltake.com` > **sheets.new** > namakan tepat **`VP-HR`**. Jangan Share, jangan Publish to web. Salin ID dari URL.

## Langkah 3 - Cipta Apps Script

1. script.google.com > **New project** > `VP-hr`.
2. **Project Settings** > tick **Show "appsscript.json" manifest file in editor**.
3. `Code.gs`: ganti nama jadi `Actions`. Paste dari GitHub folder **`apps/draftmohonkerja/gas/`**: `Actions`, `Config`, `Files`, `Notify`, `Schema`, `Setup`, `VPAudit`, `VPAuth`, `VPCore`, `VPSheet`, dan `appsscript.json`. Ctrl+S.

## Langkah 4 - Script Properties dan setup

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID Sheet `VP-HR` |
| `ROOT_FOLDER_ID` | ID folder `VP-Files` (sama dengan modul lain; cipta `HR/Photos`, `Signatures`, `Resumes`, `Forms`) |
| `MODULE_SECRET` | Rentetan rawak baharu, minimum 32 aksara |
| `ENV` | `prod` |

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

1. Run **`checkConfig`** → `checkConfig OK (ENV=prod)`.
2. Run **`setupSystem`** (benarkan Drive + emel). Log: `setupSystem selesai: VP-HR | Positions (baru) | Applicants (baru) | Interviews (baru) | Settings (baru) | ...`
3. Tab **Settings**, isi `value`:
   - `portal_url`: contoh `https://voltake-portal.pages.dev`
   - `hr_notify_emails`: emel HR yang dimaklumkan bila ada permohonan baru (pisah koma)
   - `retention_bulan`: biar `12` (pemohon Ditolak / Tarik diri dianonimkan selepas 12 bulan)
   - `benarkan_jawatan_lain`: `TRUE` = pemohon boleh taip jawatan sendiri (macam sistem lama)
4. Menu **Triggers**: 1 trigger `dailyRetention` (2 pagi).

## Langkah 5 - Import data sistem lama

Dalam Sheet **lama** draftmohonkerja, salin setiap tab (klik A1 > **Ctrl+A**, **Ctrl+C**) ke tab baharu dalam `VP-HR` (klik A1 > **Paste special > Values only**):

| Tab lama | Tab baharu |
|---|---|
| Setup | `IMPORT_SETUP` |
| Permohonan | `IMPORT_PERMOHONAN` |

Run **`importOldData`**. Log contoh: `importOldData: Jawatan: 6, Pemohon aktif: 14 (dilangkau status akhir: 40)`.

- Semua jawatan dari Setup dibawa (aktif). Tutup yang tak lagi dibuka di skrin Jawatan.
- **Hanya pemohon yang masih aktif** (Baru, Disaring, Temuduga Dijadualkan, Ditawarkan) dibawa (BSD 7). Pemohon Diterima / Ditolak kekal dalam Sheet lama; kunci Sheet lama itu (view-only) dan padam ikut retention.
- No. SOCSO / KWSP **tidak** dibawa. Akademik & pengalaman lama (satu teks) dibawa sebagai satu baris.
- Gambar dan PDF borang lama disimpan sebagai ID fail (fail kekal di folder lama). HR boleh buka "Borang PDF lama" di butiran pemohon selagi `systems@voltake.com` ada akses ke folder lama.
- Selamat dijalankan semula. Selepas semak, **padam** tab `IMPORT_SETUP` dan `IMPORT_PERMOHONAN` (ia mengandungi no. IC).

> **Department:** papan interviewer memadankan department pemohon dengan department interviewer dalam portal (contoh `PSS`, `OMP`). Jika tab Setup lama guna nama lain (contoh "Kejuruteraan"), sama ada tukar department jawatan / pemohon kepada kod portal, atau beri interviewer skop `dept=Kejuruteraan` di Akses modul.

## Langkah 6 - Deploy web app

**Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone** > Deploy > salin URL `/exec`.

## Langkah 7 - Cloudflare Turnstile (anti-bot borang awam)

1. Cloudflare dashboard > **Turnstile** > **Add widget**.
2. Widget name: `Voltake Mohon Kerja`. Hostnames: `voltake-portal.pages.dev` (dan `cc.voltake.com` jika domain itu digunakan). Widget mode: **Managed**. Create.
3. Salin **Site Key** dan **Secret Key**.

## Langkah 8 - Cloudflare env (Production)

Settings > Variables and Secrets > **Production**:

| Name | Value | Jenis |
|---|---|---|
| `GAS_URL_HR` | URL Langkah 6 | Secret |
| `MODULE_SECRET_HR` | Sama tepat dengan `MODULE_SECRET` Langkah 4 | Secret |
| `TURNSTILE_SECRET` | Secret Key Langkah 7 | Secret |
| `TURNSTILE_SITE_KEY` | Site Key Langkah 7 (bukan rahsia) | Text |

Kemudian **Deployments** > deployment terkini > **Retry deployment**.

Tanpa `TURNSTILE_SECRET`, borang awam menolak semua hantaran ("Borang belum dikonfigurasi"). Ini disengajakan.

## Langkah 9 - Akses staf

Admin > Akses modul > **Draft Mohon Kerja** (atau nama yang anda tetapkan, contoh "Permohonan Kerja"):
- HR: `hr_admin`
- Manager / ketua yang interview: `interviewer`. Skop kosong = department mereka sendiri. Untuk lebih dari satu department isi skop `dept=PSS,OMP`.

## Langkah 10 - Uji, kemudian buka kepada semua

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | HR > Jawatan > tambah 2 jawatan (department berbeza) | Kedua-dua dipapar "Dibuka" |
| 2 | Buka `/public/mohon/` di telefon tanpa login | Jawatan dibuka dipapar; kotak Turnstile kelihatan |
| 3 | Tekan "Semak & hantar" tanpa isi | Ditegur |
| 4 | Isi lengkap, tandatangan, tanpa tanda notis privasi | Ditegur "notis privasi" |
| 5 | Tanda persetujuan > hantar | Muka "Permohonan diterima" dengan no. `APP-2026-00001`; HR dapat emel (no. rujukan sahaja) |
| 6 | Hantar semula dengan IC + jawatan sama | Ditolak "sudah diterima dan sedang diproses" |
| 7 | HR buka pemohon | No. KP penuh, rekod jenayah, rujukan, masa persetujuan |
| 8 | HR tetapkan Temuduga Dijadualkan + tarikh, kemudian tukar tarikh | Mesej "ditukar 1 kali"; amaran interview muncul di senarai |
| 9 | HR > Cetak borang | Borang A4 2 muka dengan gambar & tandatangan; simpan sebagai PDF |
| 10 | Interviewer department lain buka papan | Tidak nampak pemohon itu |
| 11 | Interviewer department betul buka pemohon | No. KP dimask; tiada rekod jenayah / alamat / emel / catatan HR; boleh beri markah |
| 12 | Interviewer panggil `/api/hr/getApplicant` untuk pemohon department lain | 404 |
| 13 | HR tukar status ke Ditolak | Butiran tunjuk "Dianonimkan selepas <tarikh 12 bulan>" |
| 14 | 11 hantaran borang dari telefon yang sama dalam 10 minit | Hantaran ke-11 disekat |
| 15 | Folder `VP-Files/HR` | Tiada "anyone with link" |
| 16 | `VP-HR` > File > Share > Publish to web | Tiada yang diterbitkan |

Padam pemohon ujian (HR > Anonimkan, atau tanda `deleted` = TRUE) sebelum go-live.

**Go-live:**
1. Sheet `VP-Access` > tab Modules > baris `hr` > `status` = **`aktif`**.
2. Tukar pautan borang lama (laman web / iklan jawatan / WhatsApp) ke `https://<portal>/public/mohon/`.
3. Sistem lama: tukar `SECRET_KEY`, buang perkongsian "anyone with link" pada folder gambar & PDF lama (Fasa 0A), kunci Sheet lama, dan archive repo `Ruzhad9494/draftmohonkerja`.

## Kalau ada masalah

| Gejala | Punca biasa |
|---|---|
| Borang: "Borang belum dikonfigurasi (Turnstile)" | `TURNSTILE_SECRET` belum diisi, atau deployment belum di-Retry |
| Borang: "Semakan anti-bot gagal" | Hostname widget Turnstile tak sama dengan alamat portal |
| Borang tak papar jawatan | Tiada jawatan "Dibuka", atau tarikh tutup dah lepas |
| Interviewer tak nampak pemohon | Department pemohon ≠ department interviewer; betulkan di butiran pemohon atau skop `dept=` |
| "Konfigurasi modul tidak sepadan (secret)" | `MODULE_SECRET_HR` tak sama dengan `MODULE_SECRET` |
| Emel tak sampai | `hr_notify_emails` kosong; semak Spam |
