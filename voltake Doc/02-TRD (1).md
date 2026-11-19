# TRD: Voltake Operations Portal
Tarikh: 19/11/2026 | Versi: 1.3 (draf, dikemas kini 19/11/2026) | Rujuk: 01-PRD

## 1. Overview

Satu repo GitHub **private** (`voltake-energy/voltake-portal`) memegang semua frontend modul, kod backend Apps Script setiap modul, dan Cloudflare Pages Functions. Cloudflare Pages host semuanya di `cc.voltake.com` (satu origin, satu login, satu PWA). Login guna Google Sign-In dengan mana-mana akaun Google (pengurusan & engineer guna akaun Workspace @voltake.com, technician guna Gmail peribadi); Pages Function sahkan token Google, semak emel tu ada dalam **allowlist** sheet **VP-Access** dan aktif, baca role, dan keluarkan cookie sesi HttpOnly. Setiap panggilan data lalu `/api/<modul>/...` (Pages Function), yang semak sesi dan role kasar, kemudian forward ke Apps Script modul tu dengan tandatangan HMAC per modul. Setiap Apps Script semak tandatangan dan role halus sebelum sentuh Google Sheet modul sendiri.

Kenapa satu repo tak "berat": kesemua 9 sistem lama berjumlah lebih kurang 30,000 baris (diukur dari `index.html` setiap repo), iaitu beberapa MB sahaja. Gambar, PDF dan resit tak masuk git; ia duduk dalam Google Drive. Staf pula hanya muat turun fail modul yang dia buka, bukan seluruh repo.

## 2. Technical Goals

| Perkara | Sasaran |
|---|---|
| Peranti | Desktop (Chrome, Edge, Safari), Android (Chrome), iOS 16.4+ (Safari, PWA) |
| Prestasi | App shell dimuat bawah 3 saat di 4G; panggilan API biasa bawah 3 saat (Apps Script ada cold start, lihat seksyen 7) |
| Offline | App shell offline untuk semua modul; offline queue penuh untuk GWR sahaja (F-31) |
| Pengguna | Sehingga 100 staf, puncak sekitar 30 serentak |
| Kos hosting | RM0/bulan (Cloudflare Free + Google Workspace sedia ada). Pelan naik taraf ada dalam seksyen 7 |
| Build | Tiada build step. Cloudflare Pages deploy terus dari folder |

## 3. Technology Stack

| Layer | Teknologi | Fungsi | Sebab dipilih |
|-------|-----------|--------|---------------|
| Frontend | Vanilla HTML/CSS/JS (ES modules), tiada framework | UI portal & modul | Sama dengan kod lama, tiada build tools, mudah untuk AI tool |
| CSS | Satu fail `shared/ui/voltake.css` dengan design token (DBD) | Gaya konsisten | Ganti Tailwind CDN (CDN runtime tak sesuai untuk production & CSP) |
| Auth UI | Google Identity Services (GIS), `ux_mode: "redirect"` | Butang "Log masuk dengan Google" | Redirect mode stabil di iOS PWA (popup kadang terlepas ke Safari) |
| Edge / API gateway | Cloudflare Pages Functions (folder `functions/`) | `/auth/*`, `/api/*`, `/public/api/*` | Boleh terima POST dari Google, set cookie HttpOnly, sorok URL Apps Script, simpan secret di env |
| Backend modul | Google Apps Script (satu projek per modul) | Business logic + baca/tulis Sheet | Zero-cost, dalam Workspace sedia ada |
| Database | Google Sheets (satu spreadsheet per modul + VP-Access) | Simpan data | Data kekal berasingan per modul macam yang diminta |
| Storan fail | Google Drive (folder per modul, private) | Resit, gambar, PDF, sijil | Sedia ada dalam Workspace |
| Deploy Apps Script | `clasp` dari folder `apps/<modul>/gas/` | Kod Apps Script dalam git | Satu sumber kebenaran |
| Anti-bot | Cloudflare Turnstile | Borang public (F-10, F-32) | Free, tiada CAPTCHA menjengkelkan |
| Emel | `MailApp` dalam Apps Script | Peringatan, PDF final | Had Workspace 1,500 penerima/hari |
| Push (Tambahan) | OneSignal (dari Voltrack) | F-07 | Dah pernah guna |
| Hosting | Cloudflare Pages, custom domain `cc.voltake.com` | Serve semua | Repo private tanpa bayar GitHub, preview URL per branch |
| CI | GitHub Actions: gitleaks + semakan lint ringkas | Halang secret masuk repo | Free untuk private repo dalam had minit |

## 4. Seni Bina

```mermaid
flowchart LR
  U[Staf<br/>browser / PWA] -->|HTTPS| CF[cc.voltake.com<br/>Cloudflare Pages<br/>static apps/*]
  U -->|Google Sign-In redirect| G[Google Identity]
  G -->|POST id_token| AUTH[/auth/google<br/>Pages Function/]
  AUTH -->|verify JWKS, aud +<br/>allowlist emel| G
  AUTH -->|getAccess HMAC| ACC[Apps Script: access]
  ACC --> SA[(VP-Access Sheet)]
  AUTH -->|Set-Cookie vp_session HttpOnly| U
  U -->|fetch /api/modul/action + cookie| API[/api/[module]<br/>Pages Function/]
  API -->|HMAC per modul| GAS1[Apps Script: claimpro]
  API --> GAS2[Apps Script: gwr]
  API --> GASn[Apps Script: ... 8 modul]
  GAS1 --> S1[(VP-ClaimPro Sheet)]
  GAS2 --> S2[(VP-GWR Sheet)]
  GASn --> Sn[(Sheet modul lain)]
  P[Orang awam] -->|/public/mohon, /public/gwr-sign| PUB[/public/api/*<br/>Turnstile + rate limit/]
  PUB --> GAS3[Apps Script: hr / gwr<br/>action public sahaja]
```

### Struktur repo

```
voltake-portal/                 (PRIVATE)
  apps/
    portal/                     -> dihidang di /  (login, dashboard, admin akses, about)
    draftmohonkerja/web/        -> /draftmohonkerja/
    draftmohonkerja/gas/        -> Apps Script modul hr (clasp)
    costcalculator/web/  gas/
    gwr/web/  gas/
    ams/web/  gas/
    claimpro/web/  gas/
    compliance-track/web/  gas/
    claimreport/web/  gas/
    voltrack/web/  gas/
    access/gas/                 -> Apps Script VP-Access (tiada UI sendiri)
  shared/
    ui/          voltake.css, ikon SVG, komponen JS (table, modal, toast)
    lib/         api.js, session.js, escape.js, format.js (RM, DD/MM/YYYY)
    gas/         VPAuth.gs, VPSheet.gs, VPAudit.gs (disalin ke setiap projek gas oleh skrip)
  functions/
    auth/google.js  auth/logout.js  auth/me.js
    api/[module]/[[path]].js
    public/api/[[path]].js
    _lib/ session.js  google.js  sign.js  access.js
  config/
    modules.json   (senarai modul, path, ikon, role sah, TIADA URL/secret)
    roles.json     (senarai role sah setiap modul sahaja; tiada peraturan automatik)
  public-pages/  mohon/  gwr-sign/   -> /public/mohon, /public/gwr-sign
  docs/  01-PRD.md ... 06-IPD.md, runbook.md
  manifest.webmanifest  sw.js  _headers  _redirects  .gitignore  .gitleaks.toml
```

Nota: mockup letak semua modul terus bawah `apps/`. Struktur ini kekal sama, cuma setiap modul ada `web/` (frontend) dan `gas/` (backend). Laluan URL dipetakan dalam `_redirects` / build output Cloudflare (lihat IPD Fasa 0).

## 5. Authentication & Authorization

### 5.1 Login (F-01)
1. Staf buka `cc.voltake.com`. Tiada cookie sah, jadi dihantar ke `/login`.
2. Butang GIS dengan `ux_mode: "redirect"`, `login_uri: https://cc.voltake.com/auth/google`. Tiada parameter `hd`, kerana staf guna campuran akaun Workspace @voltake.com (pengurusan & engineer) dan Gmail peribadi (technician).
3. Google POST `credential` (ID token) + `g_csrf_token` ke `/auth/google`.
4. Pages Function sahkan:
   - `g_csrf_token` cookie == body (double-submit, ikut dokumentasi GIS)
   - tandatangan RS256 melawan JWKS Google (cache JWKS ikut `Cache-Control`)
   - `iss` = `accounts.google.com` atau `https://accounts.google.com`, `aud` = `GOOGLE_CLIENT_ID`, `exp` belum lepas, `email_verified` = true
   - **Tiada semakan domain (`hd`)**. Kawalan masuk ialah allowlist di langkah 5
5. Function panggil Apps Script `access` action `getAccess(email, sub)` (bertandatangan HMAC). Emel dinormalkan (huruf kecil, trim). Apps Script:
   - cari `email` dalam tab `Staff`. Tiada: tolak dengan "Emel belum didaftar. Hubungi Admin", LoginLog `tiada_staf`
   - `status` ≠ `aktif`: tolak, LoginLog `tamat`
   - **Ikat `sub`**: Google `sub` ialah ID akaun yang tak berubah. Login pertama: simpan `sub` ke `Staff.google_sub`. Login seterusnya: `sub` mesti sama. Jika berbeza (contoh akaun Gmail dipadam dan emel dicipta semula oleh orang lain), tolak dan LoginLog `sub_tak_padan`; Admin perlu sahkan identiti dan reset `google_sub` (Q-13)
   - pulangkan `{staff_id, nama, department, status, token_version, roles: {claimpro:["staff"], gwr:["engineer"], ...}}`
6. Function cipta sesi: `payload = {sub: email, sid: uuid, tv, iat, exp: iat+12h}`, `cookie = base64url(payload) + "." + HMAC_SHA256(SESSION_SECRET, payload)`. Set `vp_session` dengan `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`.
7. Roles **tak** disimpan dalam cookie. Ia dibaca dari Access (dengan cache 10 minit di edge) supaya perubahan akses cepat berkuat kuasa.

### 5.2 Setiap panggilan API
1. Frontend `fetch('/api/<module>/<action>', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json','X-VP':'1'}})`.
2. Function `/api/[module]`:
   - semak `Origin` == `https://cc.voltake.com` dan header `X-VP` ada (CSRF)
   - sahkan cookie (HMAC, `exp`)
   - ambil akses dari cache edge (Cache API, kunci email, TTL 600s) atau panggil `access.getAccess`; banding `tv`. Jika `tv` berubah atau status tamat, padam cookie, 401
   - semak user ada sekurang-kurangnya satu role untuk `<module>` (semakan kasar), jika tidak 403
   - forward ke `GAS_URL_<MODULE>` dengan body `{action, payload, user:{email, nama, staff_id, department, roles:[...]}, ts, nonce, sig}`, di mana `sig = HMAC_SHA256(MODULE_SECRET_<MODULE>, action|ts|nonce|sha256(body payload+user))`
3. Apps Script modul (`shared/gas/VPAuth.gs`):
   - sahkan `sig` dengan secret dalam Script Properties
   - `|now - ts| <= 120s`; `nonce` belum dilihat (CacheService, TTL 300s) untuk elak replay
   - semakan role **halus** setiap action (jadual `ACTION_ROLES` dalam BSD seksyen 4), dan skop data (contoh: staf hanya rekod sendiri, interviewer hanya dept sendiri)
   - validate input, `sanitizeForSheet()` sebelum tulis
4. Apps Script dideploy sebagai web app "Execute as: systems@voltake.com, Who has access: Anyone". Ini perlu kerana Pages Function bukan pengguna Google. Keselamatan datang dari: URL tak pernah sampai ke browser, dan setiap request tanpa `sig` sah ditolak sebelum sentuh data.

### 5.3 Logout & revoke (F-06)
- `/auth/logout`: padam cookie, tambah `sid` ke senarai revoke (Cache API, TTL 12 jam).
- Staf berhenti: R-01/R-02 tukar `status` ke `tamat` di VP-Access (atau naikkan `token_version`). Berkuat kuasa dalam ≤ 10 minit (TTL cache edge).

### 5.4 Onboard & offboard dengan akaun peribadi
Sebab staf guna Gmail peribadi, syarikat **tak boleh** tutup akaun Google mereka bila berhenti. Akses dikawal sepenuhnya oleh allowlist:

| Proses | Langkah | Siapa |
|---|---|---|
| Onboard | Engineer ke atas: guna akaun Workspace @voltake.com (2SV dipaksa melalui Admin console Workspace). Technician: HR ambil emel Gmail peribadi dan semak 2SV hidup (Q-12). Admin daftar di S-04 (department, designation, `jenis_emel`) dan tandakan modul/role di S-05 > staf login, `sub` diikat | HR, R-01 |
| Tukar jawatan/department | Admin kemas kini `designation`/`department`, kemudian semak dan ubah akses modul secara manual di S-05 (perubahan direkod dalam AccessChangeLog) | R-01 |
| Offboard | HR tukar `status` ke `tamat` pada hari terakhir > semua sesi mati ≤ 10 minit > fail Drive tiada yang dikongsi terus kepada staf. Untuk akaun Workspace, suspend akaun juga di Admin console | HR, R-01 |
| Tukar emel | HR sahkan identiti > Admin tukar `email` dan kosongkan `google_sub` > staf login semula | HR, R-01 |
| Semakan berkala | Setiap 3 bulan, HR banding senarai `aktif` dengan senarai gaji | HR |

Risiko akaun peribadi dan cara kurangkan:
- **Akaun dikongsi** (contoh satu Gmail dipakai suami isteri, atau technician pinjam telefon): polisi IT larang; setiap orang satu emel; LoginLog rekod `user_agent` untuk siasatan.
- **Akaun kena hack**: akaun Workspace boleh dipaksa 2SV dari Admin console. Gmail peribadi (technician) tak boleh dipaksa; wajibkan melalui polisi dan semakan manual. Semua pemegang role `admin`/`superadmin` (termasuk HR & Strategic Planner sebagai Admin ClaimPro) patut guna akaun Workspace (Q-14).
- **Staf hilang akses Gmail**: proses "Tukar emel" di atas; jangan sesekali terima permintaan tukar emel melalui WhatsApp tanpa pengesahan.

### 5.5 Laluan public

- `/public/mohon` (F-10) dan `/public/gwr-sign?t=...` (F-32) tak perlukan login.
- `/public/api/*` sahkan token Turnstile, rate limit (contoh 10 hantaran / 10 minit / IP, guna Cache API), dan hanya boleh panggil senarai action public yang tetap (`hr.submitApplication`, `hr.listOpenPositions`, `gwr.getSignRequest`, `gwr.clientApprove`).
- Token tandatangan klien GWR: 32 byte rawak, disimpan sebagai SHA-256 hash, sekali guna, luput 7 hari.

## 6. Keselamatan

Dipetakan kepada 7 Teknik Sekuriti (checklist cybersecurity-pdpa).

| # | Teknik | Pelaksanaan dalam projek ini |
|---|---|---|
| 1 | Tiada "Publish to Web" | Dilarang sepenuhnya. Semua data lalu `/api`. Dashboard baca melalui action `list` yang dah ditapis di server. Semakan Fasa 0: unpublish semua CSV lama |
| 2 | Password hash | Tiada password langsung (Google SSO + allowlist emel + ikatan `sub`). Tiada tab password dalam mana-mana Sheet |
| 3 | Session token + TTL | Cookie HMAC 12 jam, HttpOnly; revoke melalui `sid` + `token_version` |
| 4 | Role di server | Dua lapis: kasar di Pages Function, halus di Apps Script setiap action. UI sorok butang hanya untuk kemas |
| 5 | Rate limit | Login: 10 percubaan / 5 minit / IP. Public form: Turnstile + 10 / 10 minit / IP. API: 120 request / minit / user |
| 6 | Escape & sanitize | `textContent` sahaja untuk data (helper `shared/lib/escape.js`); `sanitizeForSheet()` untuk nilai bermula `= + - @`; CSP ketat dalam `_headers` |
| 7 | PDPA | Notis privasi + consent pada borang public; minimakan data sensitif; retention automatik; akses data HR terhad (lihat BSD seksyen 4 & 8) |

Tambahan:
- **Repo private** dari hari pertama. Branch protection pada `main` (PR wajib, gitleaks mesti lulus).
- **Tiada secret dalam git**: semua secret dalam Cloudflare environment variables (encrypted) dan Apps Script Script Properties. `config/` hanya data bukan rahsia. `.gitignore` sekat `.clasprc.json`, `.env*`, `*.key`.
- **Spreadsheet ID dan folder ID** disimpan dalam Script Properties, bukan dalam kod.
- **Content-Security-Policy** (dalam `_headers`): `default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client https://challenges.cloudflare.com; frame-src https://accounts.google.com https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data: blob: https://lh3.googleusercontent.com; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. Laras jika OneSignal ditambah (F-07).
- **Drive**: folder per modul, dimiliki akaun sistem sahaja. Fail dihidang melalui action `getFile` (Apps Script semak role, pulangkan base64). Tiada "anyone with link" dan **tiada perkongsian terus ke Gmail peribadi staf**, supaya bila staf berhenti tiada fail tertinggal dalam Drive dia. PDF GWR final dihantar sebagai lampiran emel.
- **Pemilikan Sheet/Script/Drive**: semua dalam satu akaun Workspace khas `systems@voltake.com` (syarikat dah ada Workspace berbayar; satu lesen tambahan), bukan akaun peribadi mana-mana staf, termasuk Ir Aswad. Akaun ni bukan untuk login harian, wajib 2SV, dan dua super admin Workspace boleh reset jika perlu. Kuota Workspace terpakai (seksyen 7).
- **Audit**: setiap modul ada tab `AuditLog`; VP-Access ada `LoginLog`.
- **Backup**: trigger mingguan (Ahad 2 pagi) salin setiap spreadsheet ke folder `VP-Backup/YYYY-MM-DD/` (simpan 8 minggu terakhir). Google Workspace juga simpan version history.
- **PDPA**: data peribadi utama = HR (IC, tarikh lahir, alamat, telefon, rekod jenayah, KWSP/SOCSO), ClaimPro (resit perubatan), GWR (nama/telefon/emel PIC klien), Compliance (sijil, IC image). Siapa boleh baca ditetapkan dalam BSD seksyen 4. Data Google mungkin disimpan di luar Malaysia; nyatakan dalam notis privasi (cross-border transfer).
- **PDPA dan emel peribadi staf**: emel Gmail peribadi kini data peribadi yang syarikat simpan (dalam VP-Access dan AuditLog). Notis privasi pekerja perlu sebut: emel peribadi dikumpul untuk login sahaja, siapa boleh lihat (Admin, HR), dan disimpan sehingga 12 bulan selepas staf tamat, kemudian dianonimkan. Emel peribadi tak dipaparkan kepada staf lain dalam mana-mana modul (paparan guna nama + staff_id). Dari ingatan (sila sahkan dengan JPDP): Pindaan PDPA 2024 wajibkan notifikasi pelanggaran data dan lantikan DPO untuk organisasi yang cukup syarat.

## 7. Had & Kuota Platform

Angka dari dokumentasi rasmi, dibaca 19/11/2026. Lajur "nilai" guna kuota **Workspace**, kerana semua script dijalankan sebagai `systems@voltake.com` (akaun Workspace). Untuk perbandingan, akaun Gmail biasa hanya dapat 100 penerima emel/hari dan 90 minit trigger/hari, sebab itu pemilik sistem mesti akaun Workspace. Angka Apps Script diambil dari jadual kuota; disarankan semak semula di [halaman kuota Apps Script](https://developers.google.com/apps-script/guides/services/quotas) sebelum go-live.

| Platform | Had | Nilai | Kesan pada projek |
|---|---|---|---|
| Apps Script | Masa per execution | 6 minit | Cukup. Jana PDF/Excel DO perlu dijaga bawah 30 saat untuk UX |
| Apps Script | Execution serentak per user | 30 | Semua request jalan sebagai `systems@voltake.com`, jadi **30 serentak per modul untuk semua staf**. Puncak dijangka < 30. Ini had paling kritikal |
| Apps Script | Execution serentak per script | 1,000 | Tak relevan |
| Apps Script | URL Fetch / hari (Workspace) | 100,000 | Hanya `access` jika perlu; kecil |
| Apps Script | Penerima emel / hari (Workspace) | 1,500 | Cukup untuk peringatan & PDF |
| Apps Script | Masa trigger / hari (Workspace) | 6 jam | Backup + peringatan + retention jauh bawah had |
| Apps Script | Properties read/write / hari (Workspace) | 500,000 | Nonce disimpan dalam CacheService, bukan Properties |
| Apps Script | Cold start | Beberapa saat (tiada angka rasmi) | Pertimbang trigger "keep warm" 5 minit pada waktu kerja untuk modul utama |
| Google Sheets | Sel per spreadsheet | 10 juta sel (dari ingatan, **perlu disahkan**) | Prestasi biasanya jatuh lebih awal, sekitar 50,000+ baris per tab |
| Cloudflare Pages/Workers Free | Request Functions / hari | 100,000 (dikongsi dengan Workers), reset 00:00 UTC (8 pagi waktu Malaysia) | 100 staf x 300 panggilan = 30,000. Cukup. Fail statik percuma & tanpa had |
| Cloudflare Workers Free | CPU per invocation | 10 ms | Sahkan token RS256 + HMAC muat dalam had ini; ukur dalam Fasa 1. Jika tidak, Workers Paid (USD5/bulan dari ingatan, **sahkan harga**) |
| Cloudflare KV Free | Tulis / hari | 1,000 | Sebab itu cache sesi/akses guna Cache API, bukan KV |

**Bila pindah ke Supabase (Q-10)** - salah satu berlaku:
1. Mana-mana tab lepas sekitar 50,000 baris, atau action `list` purata > 5 saat.
2. Ralat "Service invoked too many times" / concurrency muncul lebih sekali seminggu.
3. Perlu laporan merentas modul (join) yang berat.
4. Audit PDPA minta kawalan akses peringkat baris dan log akses yang lebih ketat untuk HR.

Calon pertama: ClaimPro dan HR. Reka bentuk `/api` gateway bermakna frontend tak perlu berubah bila backend satu modul dipindah.

## 8. Integrasi

| Integrasi | Modul | Nota |
|---|---|---|
| Google Identity Services | Portal | Satu OAuth Client ID; daftar origin `https://cc.voltake.com` + satu URL preview tetap |
| Google Drive | Semua modul berfail | Folder private per modul |
| MailApp | GWR, Compliance, ClaimPro, HR | Peringatan & PDF |
| Cloudflare Turnstile | Borang public | Site key dalam HTML (bukan rahsia), secret key dalam env |
| OneSignal | Portal (F-07, Tambahan) | App ID dalam config, REST key dalam env |
| WhatsApp | Tiada | Boleh tambah pautan `wa.me` kemudian |

## 9. Deployment & Environment

| Perkara | Nilai |
|---|---|
| Repo | `voltake-energy/voltake-portal` (private), branch `main` = production |
| Hosting | Cloudflare Pages, projek `voltake-portal`, custom domain `cc.voltake.com` (CNAME dari DNS sedia ada) |
| Preview | Setiap branch dapat URL `<branch>.voltake-portal.pages.dev`; branch `staging` tetap untuk ujian dengan Sheet staging |
| Env variables (Cloudflare, Production & Preview berasingan) | `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, `ACCESS_GAS_URL`, `ACCESS_SECRET`, `GAS_URL_<MODULE>` x8, `MODULE_SECRET_<MODULE>` x8, `TURNSTILE_SECRET` |
| Apps Script | 9 projek (8 modul + access), setiap satu dideploy dengan `clasp push` + `clasp deploy` dari `apps/<modul>/gas/` |
| Pemilik akaun | `systems@voltake.com` (akaun Workspace khas) pegang Sheet, Script, Drive; Cloudflare dan GitHub org dengan sekurang-kurangnya 2 admin |
| OAuth consent screen | User type **External** (kerana staf guna Gmail), status "In production", scope `openid email profile` sahaja. Scope asas ni biasanya tak perlukan verifikasi Google (**sahkan** semasa Fasa 0) |
| Environment | Production (Sheet `VP-*`) dan Staging (Sheet `VP-STG-*`), secret berbeza |

## 10. Andaian & Soalan Terbuka

Andaian:
1. Campuran akaun Workspace (pengurusan & engineer) dan Gmail peribadi (technician) (PRD andaian 1); login dikawal allowlist + ikatan `sub`, bukan domain.
2. DNS `voltake.com` boleh ditambah rekod CNAME tanpa pindah nameserver.
3. Puncak penggunaan < 30 request serentak per modul.
4. Workers Free 10 ms CPU cukup untuk sahkan token (perlu diukur Fasa 1).

Soalan terbuka: Q-10, Q-11, Q-12, Q-13 (lihat PRD seksyen 9). Tambahan:
- T-01: Perlukah satu Apps Script per modul (9 projek), atau gabung modul kecil (costcalc, claimreport) dalam satu? Cadangan: kekal satu per modul supaya data dan kuota berasingan.
