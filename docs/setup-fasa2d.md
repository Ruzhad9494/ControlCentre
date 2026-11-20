# Setup Fasa 2D - Compliance Track (production terus)

Terus ke production, tiada staging. Ikut langkah 1 hingga 9 mengikut susunan. Kad Compliance Track kekal "Akan datang" kepada staf sehingga Langkah 9.

Dibina ikut sistem lama "UniTrack" (`voltake-energy/Compliance-Track`). Perbandingan lama vs baharu: `docs/rujukan-sistem-lama.md`.

| Role Compliance | Untuk siapa | Boleh |
|---|---|---|
| `staff_self` | Semua staf | "Sijil saya": kemas kini tarikh & muat naik sijil **sendiri**; hantar IC sendiri sekali (dengan persetujuan) |
| `pss` | Pasukan PSS | Semua: kenderaan, chargeman, sijil semua staf, IC, Senarai Kerja |
| `hr_admin` | HR | Sama dengan `pss` (sistem lama: satu PIN admin dikongsi HR & PSS) |

Staf yang juga admin (HR / PSS) perlu `staff_self` juga untuk kemas kini sijil sendiri. Superadmin portal dikira admin Compliance.

**PIN admin lama tidak digunakan lagi.** Staf tak boleh lagi ubah sijil orang lain dengan menaip Staff ID orang itu: identiti dari login.

## Langkah 1 - Merge ke `main` (GitHub)

Pull Request dari branch `claude/compassionate-edison-ouik0h` ke `main` > **Merge**. Tunggu deployment Production Cloudflare jadi **Success**.

## Langkah 2 - Cipta Sheet

Drive `systems@voltake.com` > **sheets.new** > namakan tepat **`VP-Compliance`**. Jangan Share, jangan Publish to web. Salin ID dari URL.

## Langkah 3 - Cipta Apps Script

1. script.google.com > **New project** > `VP-compliance`.
2. **Project Settings** > tick **Show "appsscript.json" manifest file in editor**.
3. `Code.gs`: ganti nama jadi `Actions`. Paste dari GitHub folder **`apps/compliance-track/gas/`**: `Actions`, `Config`, `Files`, `Notify`, `Schema`, `Setup`, `VPAudit`, `VPAuth`, `VPCore`, `VPSheet`, dan `appsscript.json` (ganti seluruh isi). Ctrl+S.

## Langkah 4 - Script Properties dan setup

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID Sheet `VP-Compliance` |
| `ROOT_FOLDER_ID` | ID folder `VP-Files` (sama dengan modul lain; cipta `Compliance/Vehicles`, `Chargeman`, `StaffCerts`, `IC`) |
| `MODULE_SECRET` | Rentetan rawak baharu, minimum 32 aksara (jangan guna semula secret modul lain) |
| `ENV` | `prod` |

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

1. Run **`checkConfig`** → `checkConfig OK (ENV=prod)`.
2. Run **`setupSystem`** (benarkan Drive + emel). Log: `setupSystem selesai: VP-Compliance | Vehicles (baru) | Chargeman (baru) | Staff (baru) | StaffCerts (baru) | JobLog (baru) | Settings (baru) | ...`
3. Tab **Settings**, isi `value`:
   - `portal_url`: contoh `https://voltake-portal.pages.dev`
   - `notify_emails`: emel HR dan PSS untuk laporan Isnin (pisah koma)
   - `company_address`: alamat syarikat untuk kepala Senarai Kerja (sama macam dokumen lama)
   - `amaran_hari`: biar `60` (sistem lama)
   - `peringatan_staf`: `TRUE` = staf diemel bila sijil sendiri tamat / ≤ 30 hari
4. Menu **Triggers**: 1 trigger `weeklyReport` (Isnin 8 pagi).

## Langkah 5 - Import data sistem lama

Dalam Sheet UniTrack **lama**, untuk setiap tab di bawah: klik A1 > **Ctrl+A**, **Ctrl+C**. Dalam `VP-Compliance` cipta tab dengan nama tepat, klik A1 > **Paste special > Values only**:

| Tab lama | Tab baharu dalam VP-Compliance |
|---|---|
| Kereta | `IMPORT_KERETA` |
| Motosikal | `IMPORT_MOTOSIKAL` |
| Chargeman | `IMPORT_CHARGEMAN` |
| Cert | `IMPORT_CERT` |

Kemudian Apps Script > Run **`importOldData`**. Log contoh: `importOldData: Kereta: 12, Motosikal: 5, Chargeman: 18, Staf: 64, sijil: 190 | Amaran: ...`. Tab yang tiada dilangkau. Selamat dijalankan semula (rekod yang dah ada dilangkau).

Yang dibawa: semua kenderaan, chargeman (dengan lajur ID untuk padanan staf), dan dari tab Cert: Staff ID, nama, designation, no. IC, IC Attachment (sebagai IC depan), 4 jenis sijil + pautan fail. Pautan Drive lama disimpan sebagai ID fail; fail kekal di folder lama.

Selepas semak, padam keempat-empat tab `IMPORT_*` (ia mengandungi no. IC).

> **Penting: Staff ID mesti sama dengan portal.** Staf dikenal pasti melalui Staff ID dalam Admin > Staf portal. Jika ID dalam tab Cert lama (contoh `VES007`) berbeza dengan portal (contoh `VE0007`), staf itu akan nampak "Sijil saya" kosong. Betulkan sama ada dalam portal atau dalam tab `Staff` / `StaffCerts` / `Chargeman` sebelum go-live.

> **IC lama:** sistem lama simpan satu fail "IC Attachment". Ia dibawa sebagai IC depan; IC belakang kosong. HR boleh muat naik IC belakang di Sijil staf > staf > Ubah profil / IC, atau minta staf hantar semula melalui HR. Fail lama boleh dibuka hanya jika `systems@voltake.com` ada akses ke folder Drive lama (`UniTrack_IC_Private`, `UniTrack_Uploaded_Documents`).

## Langkah 6 - Deploy web app

**Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone** > Deploy > salin URL `/exec`.

## Langkah 7 - Cloudflare env (Production)

| Name | Value |
|---|---|
| `GAS_URL_COMPLIANCE` | URL Langkah 6 |
| `MODULE_SECRET_COMPLIANCE` | Sama tepat dengan `MODULE_SECRET` Langkah 4 |

Kemudian **Deployments** > deployment terkini > **Retry deployment**.

## Langkah 8 - Akses staf

Admin > Akses modul > **Compliance Track**:
- Semua staf: `staff_self`
- HR: `hr_admin` + `staff_self`
- PSS: `pss` + `staff_self`

## Langkah 9 - Uji, kemudian buka kepada semua

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | HR buka Dashboard | Jumlah sama dengan sistem lama; tukar ambang 30 / 60 / 90 mengubah kiraan "Hampir tamat" |
| 2 | Kenderaan > Tambah dengan no. plat yang sudah ada | Ditolak: "sudah didaftar" |
| 3 | Kenderaan > CSV, dan WhatsApp | CSV dibuka dalam Excel; WhatsApp terbuka dengan teks peringatan |
| 4 | Staf biasa (telefon) buka Compliance Track | Terus ke "Sijil saya"; tiada menu lain |
| 5 | Staf kemas kini tarikh CIDB + muat naik gambar sijil | Status dikemas kini; HR nampak dalam Sijil staf |
| 6 | Staf cuba ubah sijil staf lain (curl ke `/api/compliance/saveMyCert` dengan `staff_id` lain) | Sijil sendiri yang berubah, bukan orang lain |
| 7 | Staf hantar IC: tanpa tanda persetujuan, kemudian dengan | Pertama tak boleh; kedua berjaya, no. IC dipapar bertopeng `******-**-1234` |
| 8 | Staf hantar IC kali kedua | Ditolak: "hubungi HR" |
| 9 | Staf cuba buka `/api/compliance/getFile` jenis `ic_depan` | 403 |
| 10 | PSS: Senarai Kerja > isi kerja, tempat > pilih 2 staf (satu tiada IC) | Amaran merah untuk staf tiada IC |
| 11 | Jana > Cetak / simpan PDF | PDF A4: muka jadual + satu muka setiap staf; IC bertanda "FOR OFFICIAL SITE WORK ONLY" |
| 12 | Senarai Kerja > Log senarai | Rekod baharu dengan bilangan staf |
| 13 | Sheet `VP-Compliance` > AuditLog | Ada `VIEW_IC` untuk setiap kali IC dibaca |
| 14 | Folder `VP-Files/Compliance/IC` | Tiada "anyone with link" |
| 15 | `VP-Compliance` > File > Share > Publish to web | Tiada yang diterbitkan |

**Go-live:** Sheet `VP-Access` > tab Modules > baris `compliance` > `status` = **`aktif`**. Kemudian dalam sistem lama: **unpublish** semua CSV awam, tukar `ADMIN_PIN` (Fasa 0A), dan selepas semua staf guna sistem baharu, archive repo `voltake-energy/Compliance-Track`.

## Kalau ada masalah

| Gejala | Punca biasa |
|---|---|
| Staf nampak "Staff ID anda belum didaftar" | Staff ID kosong dalam Admin > Staf portal |
| Staf nampak sijil kosong walaupun ada dalam sistem lama | Staff ID portal berbeza dengan ID dalam tab Cert lama (lihat Langkah 5) |
| Senarai Kerja: "Fail tidak dapat dibuka" untuk IC / sijil lama | `systems@voltake.com` tiada akses ke folder Drive lama |
| Senarai Kerja: "lampiran PDF tidak dapat dipapar" | Sijil dalam PDF tanpa pratonton; sertakan fail asal secara berasingan, atau muat naik gambar sijil |
| Alamat kosong di kepala Senarai Kerja | `company_address` belum diisi dalam Settings |
| "Konfigurasi modul tidak sepadan (secret)" | `MODULE_SECRET_COMPLIANCE` tak sama dengan `MODULE_SECRET` |
