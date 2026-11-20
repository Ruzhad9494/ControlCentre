# Setup Fasa 2B - ClaimPro (production terus)

Terus ke production, tiada staging. Ikut langkah 1 hingga 9 mengikut susunan. Kad ClaimPro kekal "Akan datang" kepada staf sehingga Langkah 9.

Peraturan (dikemas kini pemilik 20/11/2026):

| Role ClaimPro | Untuk siapa | Boleh |
|---|---|---|
| `staff` | Semua staf | Buat tuntutan sendiri, sahkan terima bayaran sendiri |
| `admin` | Admin HR | Lulus/tolak tuntutan staf **bukan HR**, laporan, senarai bayaran. **Tak boleh** lulus tuntutan sendiri atau rakan HR |
| `ketua` | Head of HR | Semua kuasa `admin` + lulus tuntutan staf HR + lulus tuntutan **sendiri** |

Sistem **tak membaca designation** (Manager / Head / apa-apa). Kuasa ikut role yang ditanda di Admin > Akses modul. Tiada siapa (termasuk ketua) boleh tanda tuntutan orang lain sebagai Dibayar.

---

## Langkah 1 - Merge ke `main` (GitHub)

Pull Request dari branch `claude/compassionate-edison-ouik0h` ke `main` > **Merge**. Tunggu deployment Production Cloudflare jadi **Success**.

## Langkah 2 - Kemas kini Apps Script lama (disyorkan, buat sebelum ClaimPro)

Fasa ni membetulkan tiga pepijat dalam kod kongsi: (a) ID berjujukan boleh melepaskan kunci milik pemanggil, (b) dua tulisan serentak boleh menimpa baris yang sama, (c) cap masa susunan tak stabil. **Cost Calculator dan portal tetap jalan tanpa kemas kini ini**, tapi pepijat (a) dan (b) lebih berbahaya bila ramai staf guna serentak.

Dalam setiap projek di bawah: paste ganti seluruh isi fail dari GitHub (Raw), **Ctrl+S**, kemudian **Deploy > Manage deployments > ikon pensel > Version: New version > Deploy** (URL kekal sama).

| Projek | Fail untuk diganti |
|---|---|
| `VP-access` | `VPCore`, `VPSheet`, `Access` |
| `VP-costcalc` | `VPCore`, `VPSheet`, `Actions` |

Ganti `VPCore` dan `VPSheet` **dahulu** sebelum `Actions` / `Access`, sebab fail itu guna fungsi baharu di dalamnya.

## Langkah 3 - Cipta Sheet

Drive `systems@voltake.com` > **sheets.new** > namakan tepat **`VP-ClaimPro`**. Biar kosong, jangan Share, jangan Publish to web. Salin ID dari URL.

## Langkah 4 - Cipta Apps Script

1. script.google.com > **New project** > `VP-claimpro`.
2. **Project Settings** > tick **Show "appsscript.json" manifest file in editor**.
3. `Code.gs`: ganti nama jadi `Actions`. Paste dari GitHub folder **`apps/claimpro/gas/`**:

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

## Langkah 5 - Script Properties dan setup

**Project Settings > Script Properties**, empat sahaja:

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID Sheet `VP-ClaimPro` |
| `ROOT_FOLDER_ID` | ID folder `VP-Files` (**folder yang sama** dengan projek `access`; ClaimPro cipta `ClaimPro/Receipts` dan `ClaimPro/Payments` di dalamnya) |
| `MODULE_SECRET` | Rentetan rawak baharu, minimum 32 aksara. Jangan guna semula secret modul lain |
| `ENV` | `prod` |

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Kemudian dalam editor:

1. Run **`checkConfig`**. Log: `checkConfig OK (ENV=prod)`.
2. Run **`setupSystem`**. Google akan minta kebenaran **Drive** dan **hantar emel**; benarkan. Log: `setupSystem selesai: VP-ClaimPro | ClaimTypes (baru) seed=6 | Claims (baru) | Approvals (baru) | Settings (baru) seed=4 | ...`
3. Buka Sheet `VP-ClaimPro` > tab **Settings**, isi lajur `value`:
   - `portal_url`: contoh `https://voltake-portal.pages.dev` (tanpa `/` di hujung)
   - `admin_notify_emails`: emel yang terima "tuntutan baru" dan "beza bayaran" (satu peti emel HR, atau beberapa emel dipisah koma)
   - `head_report_email`: emel Head of HR (laporan bulanan beza bayaran)
4. Tab **ClaimTypes**: 6 jenis awal diambil dari sistem lama (Perjalanan, Makan & Minuman, Penginapan, Perubatan, Keraian, Lain-lain). Nama "Makan & Minuman" saya agak dari paparan terpotong: betulkan jika berbeza. **Semua ditetapkan resit wajib**, sedangkan sistem lama membenarkan "Tiada Resit". Semak di portal selepas Langkah 8 (Laporan > Jenis tuntutan): tetapkan jenis mana yang resit tak wajib, dan had RM jika ada.
5. Menu **Triggers** (ikon jam): patut ada 3 trigger (`dailyArchive`, `dailyReminders`, `monthlyBezaReport`).

## Langkah 6 - Deploy web app

**Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone** > Deploy > salin URL `/exec`.

## Langkah 7 - Cloudflare env (Production)

Settings > Variables and Secrets > **Production** > tambah (jenis Secret):

| Name | Value |
|---|---|
| `GAS_URL_CLAIMPRO` | URL Langkah 6 |
| `MODULE_SECRET_CLAIMPRO` | Sama tepat dengan `MODULE_SECRET` Langkah 5 |

Kemudian **Deployments** > deployment terkini > **Retry deployment**.

## Langkah 8 - Akses staf

**8a. Tambah role `ketua` dalam senarai role ClaimPro (sekali sahaja).** Sheet `VP-Access` > tab **Modules** > baris `claimpro` > lajur `roles_sah`: tukar `staff,admin` kepada **`staff,admin,ketua`**. (Atau paste `Schema.gs` terbaru ke projek `VP-access` dan Run `syncModuleMeta`.) Tanpa ini, kotak `ketua` tak muncul di skrin akses.

**8b. Semak department.** Peraturan "tuntutan staf HR hanya Head of HR" bergantung pada **department** dalam Admin > Staf. Pastikan semua staf HR (termasuk Head of HR) ada department **`HR`**.

**8c. Admin > Akses modul > ClaimPro:**
- Semua staf: `staff`
- Admin HR: `staff` + `admin`
- Head of HR: `staff` + `ketua`

**8d. Untuk awak (superadmin) uji semua fungsi:** beri akaun awak sendiri `staff` + `ketua` di ClaimPro. Dengan itu awak boleh hantar tuntutan, lulus (termasuk tuntutan sendiri), dan buka laporan. Selepas ujian, buang role tu jika awak bukan pelulus sebenar. Setiap perubahan direkod dalam log.

## Langkah 9 - Uji, kemudian buka kepada semua

Uji dengan akaun sebenar (taip `/claimpro/` terus):

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | Staf hantar tuntutan Makan & Minuman dengan gambar resit dari telefon (iPhone dan Android) | ID `CLM-2026-00001`. Gambar masuk Drive `VP-Files/ClaimPro/Receipts/2026-11/` |
| 2 | Emel "tuntutan baru" sampai ke `admin_notify_emails` | Ada pautan ke portal; tiada emel peribadi staf dalam kandungan |
| 3 | Admin HR lulus tuntutan staf biasa | Lulus. Staf dapat emel |
| 4 | Admin HR cuba lulus tuntutan **sendiri** | Ditolak: "hanya boleh diluluskan Head of HR" |
| 5 | Admin HR cuba lulus tuntutan staf **HR lain** | Ditolak: "staf HR hanya boleh diluluskan Head of HR" |
| 6 | Head of HR lulus tuntutan Admin HR, dan tuntutan **sendiri** | Kedua-duanya Lulus |
| 7 | Staf A cuba panggil tuntutan staf B (curl dengan cookie A ke `/api/claimpro/getClaim`) | 403 |
| 8 | Admin cuba tukar tuntutan ke Dibayar (`confirmReceived`) | 403 |
| 9 | Staf sahkan terima dengan jumlah **sama** | Dibayar, tiada emel |
| 10 | Staf sahkan terima dengan jumlah **berbeza** | Dibayar, amaran "beza bayaran", emel ke Admin |
| 11 | Hantar fail `.exe` dinamakan `.jpg` (guna curl) | Ditolak 400 |
| 12 | Laporan > pilih bulan > Eksport CSV, buka dalam Excel | Tiada emel staf; sel `=...` dipapar sebagai teks |
| 13 | Folder Drive `VP-Files` | Tiada "anyone with link"; tiada dikongsi ke Gmail staf |
| 14 | `VP-ClaimPro` > File > Share > Publish to web | Tiada yang diterbitkan |

Padam tuntutan ujian dari Sheet (atau tanda `deleted` = TRUE) sebelum go-live.

**Go-live:** Sheet `VP-Access` > tab Modules > baris `claimpro` > `status` = **`aktif`**. Umum kepada semua staf (taklimat 30 minit pun elok, IPD seksyen 9).

---

## Tuntutan dalam sistem lama

Cadangan: **tiada migrasi**. Staf habiskan tuntutan yang masih terbuka dalam sistem ClaimPro lama; semua tuntutan baharu dibuat di sini. Bila semua tuntutan lama dah dibayar, kunci Sheet lama (view-only) dan archive repo `voltake-energy/claimpro`. Jika ada terlalu banyak tuntutan terbuka dan awak mahu pindahkan, beritahu saya.

## Kalau ada masalah

| Gejala | Punca biasa |
|---|---|
| `setupSystem` minta kebenaran lagi / gagal "Drive" | `appsscript.json` lama: paste semula (mesti ada scope Drive dan send_mail) |
| "Folder tak dijumpai" | `ROOT_FOLDER_ID` salah, atau folder bukan milik `systems@voltake.com` |
| Muat naik resit gagal "hanya JPG, PNG, HEIC atau PDF" | Fail rosak atau bukan gambar sebenar |
| Emel tak sampai | `admin_notify_emails` kosong dalam Settings; semak juga folder Spam |
| "Konfigurasi modul tidak sepadan (secret)" | `MODULE_SECRET_CLAIMPRO` tak sama tepat dengan `MODULE_SECRET` |
| Admin HR boleh lulus tuntutan staf HR lain | `department` staf tu bukan `HR`; betulkan di Admin > Staf |
| Kotak `ketua` tiada di skrin Akses modul | Langkah 8a belum dibuat |
| Head of HR tak boleh lulus tuntutan sendiri | Head of HR diberi `admin`, bukan `ketua` |
