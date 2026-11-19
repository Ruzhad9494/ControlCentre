# Voltake Operations Portal

Portal operasi dalaman Voltake di `cc.voltake.com`: satu login Google, 8 modul (Draft Mohon Kerja, Cost Calculator, GWR, AMS, ClaimPro, Compliance Track, ClaimReport, Voltrack).

Reka bentuk penuh dalam [`docs/`](docs/): PRD, TRD, AFD, DBD, BSD, IPD. Pelan pelaksanaan ikut [`docs/06-IPD.md`](docs/06-IPD.md).

## Status

| Fasa | Status |
|---|---|
| 0A Tutup kebocoran sistem lama | Manual oleh pemilik (dalam sistem lama) |
| 0 Setup repo, Cloudflare, OAuth, VP-Access | Kod siap. Langkah manual: [`docs/setup-fasa0.md`](docs/setup-fasa0.md) |
| 1 Portal teras | Kod siap (login, sesi, gateway API, dashboard, admin, PWA). Langkah manual: [`docs/setup-fasa1.md`](docs/setup-fasa1.md) |
| 2A Cost Calculator | Kod siap. Langkah manual: [`docs/setup-fasa2a.md`](docs/setup-fasa2a.md) |
| 2B-2H Modul | Belum mula |

## Struktur

```
apps/portal/            -> /            (Fasa 0: halaman Coming soon)
apps/<modul>/web/       -> /<modul>/
apps/<modul>/gas/       -> Apps Script modul (clasp), TIDAK dihidang ke web
apps/access/gas/        -> Apps Script VP-Access (setupSystem)
shared/                 -> UI, lib frontend, lib Apps Script kongsi
functions/              -> Cloudflare Pages Functions (/auth, /api)
config/                 -> modules.json, roles.json (bukan rahsia)
tools/build.sh          -> susun dist/ untuk Cloudflare Pages
tools/test/             -> ujian automatik (node --test)
```

## Arahan biasa

```bash
bash tools/build.sh
```

```bash
node --test tools/test/*.test.js tools/test/*.test.mjs
```

Selepas edit `shared/gas/*.gs`, salin ke setiap projek Apps Script:

```bash
bash tools/sync-shared-gas.sh
```

## Peraturan

- Tiada secret, Spreadsheet ID, URL Apps Script atau data sebenar dalam repo. Secret dalam Cloudflare env + Script Properties sahaja (senarai nama dalam `.env.example`).
- Semua semakan role di server.
- Setiap perubahan melalui Pull Request; gitleaks mesti lulus.
