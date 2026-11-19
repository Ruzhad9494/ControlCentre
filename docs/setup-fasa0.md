# Setup Fasa 0 - langkah manual

Rujuk IPD task 0.1 hingga 0.7. Kod dah ada dalam repo; langkah di bawah perlu dibuat sendiri dalam konsol Google/Cloudflare/GitHub (tak boleh diautomasi dari repo). Tandakan bila siap.

Prasyarat: P-01 (akaun `systems@voltake.com`), P-03, P-04, P-05, P-06, P-12.

## 0.1 / 0.2 GitHub

- [ ] Pastikan repo **private**.
- [ ] Settings > Branches > Add rule untuk `main`:
  - Require a pull request before merging
  - Require status checks to pass: `gitleaks`, `semakan repo`
- [ ] Settings > Actions: benarkan Actions (workflow `.github/workflows/security.yml`).

## 0.3 Cloudflare Pages

1. Workers & Pages > Create > Pages > Connect to Git > pilih repo ni.
2. Project name: `voltake-portal`. Production branch: `main`.
3. Build settings:
   - Framework preset: **None**
   - Build command: `bash tools/build.sh`
   - Build output directory: `dist`
4. Selepas deploy pertama: Custom domains > `cc.voltake.com`. Tambah CNAME `cc` -> `voltake-portal.pages.dev` di DNS sedia ada (P-05).
5. Cipta branch `staging` dan push sekali, supaya URL preview tetap `staging.voltake-portal.pages.dev` wujud.

Ujian: buka `https://cc.voltake.com` (dan URL staging) > nampak halaman **Coming soon**. Cuba `https://cc.voltake.com/docs/06-IPD.md` dan `/apps/access/gas/Setup.gs` > mesti 404 (bukti fail dalaman tak didedah).

> Nota: IPD 0.3 asalnya sebut "tiada build command, output dir `/`". Diubah kepada skrip salin `tools/build.sh` (tiada npm/bundler) kerana output `/` akan dedahkan `docs/`, kod Apps Script dan `config/` kepada umum.

## 0.5 Google Cloud OAuth

1. console.cloud.google.com > projek baru `voltake-portal` (log masuk sebagai akaun admin, bukan peribadi).
2. APIs & Services > OAuth consent screen:
   - User type: **External**
   - App name: Voltake Operations Portal; support email: emel IT
   - Scopes: `openid`, `email`, `profile` sahaja
   - Publishing status: **In production** (sahkan sama ada Google minta verifikasi; scope asas biasanya tidak)
3. Credentials > Create credentials > OAuth client ID > **Web application**:
   - Authorized JavaScript origins: `https://cc.voltake.com`, `https://staging.voltake-portal.pages.dev`
   - Authorized redirect URIs: `https://cc.voltake.com/auth/google`, `https://staging.voltake-portal.pages.dev/auth/google`
4. Salin **Client ID** sahaja (client secret tak digunakan; jangan simpan di mana-mana).

## 0.6 VP-Access + Apps Script `access`

Buat dua kali: sekali untuk staging, sekali untuk production. **Mula dengan staging.**

1. Log masuk Drive sebagai `systems@voltake.com`.
2. Cipta folder `VP-Files` (staging: `VP-STG-Files`). Salin folder ID dari URL.
3. Cipta Google Sheet kosong bernama tepat `VP-STG-Access` (production: `VP-Access`). Salin spreadsheet ID dari URL. **Jangan** Publish to web, **jangan** kongsi.
4. Di komputer developer:

```bash
npm install -g @google/clasp
```

```bash
clasp login
```

```bash
cd apps/access/gas && clasp create --type standalone --title "VP-STG-access" --rootDir .
```

`clasp create` akan cipta `.clasp.json` (dah dalam `.gitignore`, jangan commit). Untuk production, guna folder kerja berasingan atau tukar `scriptId` dalam `.clasp.json`.

```bash
clasp push
```

5. Buka projek di script.google.com > Project Settings > Script Properties, tambah:

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID dari langkah 3 |
| `ROOT_FOLDER_ID` | ID dari langkah 2 |
| `ENV` | `staging` (atau `prod`) |
| `ACCESS_SECRET` | `openssl rand -base64 48` (simpan juga untuk Cloudflare, langkah 0.7) |
| `SEED_SUPERADMIN_EMAIL` | Emel Google Ir Aswad |
| `SEED_SUPERADMIN_STAFF_ID` | No. pekerja |
| `SEED_SUPERADMIN_NAMA` | Nama penuh |
| `SEED_SUPERADMIN_DEPARTMENT` | Pilihan, lalai `MGMT` |

6. Editor > pilih fungsi `checkConfig` > Run (benarkan izin). Mesti log `checkConfig OK`.
7. Pilih `setupSystem` > Run. Log akhir: `setupSystem selesai: VP-STG-Access | Staff (baru) seed=1 | Modules (baru) seed=8 | ...`
8. **Padam** semua Script Properties `SEED_SUPERADMIN_*`.
9. Isi `Settings.hr_report_email` dalam Sheet.

Ujian:
- Sheet ada 7 tab: Staff, Modules, UserAccess, AccessChangeLog, LoginLog, Settings, _Counters. Baris 1 tebal + freeze.
- `Modules` ada 8 baris, semua `belum_live`. `Staff` + `UserAccess` ada 1 baris superadmin (`module_id` = `*`).
- Klik sel `Staff.department` > dropdown 9 department; taip nilai lain > ditolak.
- Jalankan `setupSystem` sekali lagi > tiada baris pendua, tiada trigger pendua (Triggers: satu `monthlyInactiveReport` bulanan).
- Tukar `ENV` ke `prod` sementara, jalankan `setupSystem` > mesti gagal "Jangka VP-Access". Kembalikan ke `staging`.
- File > Share > Publish to web: **tiada** yang diterbitkan.

Deploy web app (`doPost` ditambah dalam Fasa 1; langkah ni boleh tunggu Fasa 1): Deploy > New deployment > Web app > Execute as: Me (`systems@voltake.com`), Who has access: Anyone.

## 0.7 Cloudflare env variables

Pages > voltake-portal > Settings > Variables and Secrets. Isi **Production** dan **Preview** berasingan, semua sebagai jenis **Secret** (encrypted). Senarai nama penuh dalam `.env.example`.

Untuk Fasa 0-1 cukup:

| Nama | Production | Preview (staging) |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Client ID 0.5 | Client ID sama |
| `SESSION_SECRET` | `openssl rand -base64 48` | nilai lain |
| `ACCESS_SECRET` | sama dengan Script Property prod | sama dengan Script Property staging |
| `ACCESS_GAS_URL` | Diisi Fasa 1 selepas deploy web app | Diisi Fasa 1 |

`GAS_URL_<MODULE>`, `MODULE_SECRET_<MODULE>`, `TURNSTILE_SECRET` diisi bila modul berkenaan dibina (Fasa 2).

## Selesai Fasa 0 bila

- [ ] `cc.voltake.com` papar Coming soon; fail dalaman 404
- [ ] VP-STG-Access dan VP-Access wujud dengan seed, tiada Publish to web
- [ ] OAuth Client ID wujud dengan origin & redirect betul
- [ ] Env variables Cloudflare (Production & Preview) diisi
- [ ] Branch protection `main` aktif; CI `security` hijau
