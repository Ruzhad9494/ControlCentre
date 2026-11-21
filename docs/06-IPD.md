# IPD: Voltake Operations Portal
Tarikh: 19/11/2026 | Versi: 1.3 (draf, dikemas kini 19/11/2026) | Rujuk: 01-PRD hingga 05-BSD

## 1. Overview

Bina portal teras dan auth dulu (Fasa 0-1), kemudian bina semula modul satu per satu (Fasa 2), dengan setiap modul go-live dan sistem lamanya dikunci sebelum mula modul seterusnya. Sistem lama terus berjalan sehingga modul baharu masing-masing live, jadi kebocoran lama mesti ditutup **minggu depan** (Fasa 0A), bukan tunggu sistem baru siap. Susunan modul: mula dengan yang paling mudah untuk buktikan corak (Cost Calculator), kemudian yang semua staf guna (ClaimPro), kemudian ikut risiko dan saiz.

Anggaran masa di bawah adalah tekaan untuk seorang developer dibantu AI coding tool, kerja separuh masa. Bukan angka yang diukur.

## 2. Goals

"Siap" bermakna: semua 8 modul live di `cc.voltake.com`, semua staf login dengan Google, semua ujian seksyen 6 lulus, 9 repo lama di-archive (private), Sheet lama dikunci read-only, dan `docs/runbook.md` siap untuk penyelenggaraan.

## 3. Prasyarat

| # | Perkara | Siapa | Bila |
|---|---|---|---|
| P-01 | Cipta akaun Workspace khas `systems@voltake.com` (syarikat dah ada Workspace berbayar) untuk pegang Sheet/Script/Drive; 2SV wajib | Ir Aswad / admin Workspace | Sebelum Fasa 0 |
| P-02 | Senarai emel Google setiap staf: akaun @voltake.com untuk pengurusan & engineer, Gmail peribadi untuk technician (disahkan milik staf sendiri, 2SV hidup, Q-12). Hidupkan paksa 2SV untuk semua akaun Workspace di Admin console | HR + admin Workspace | Sebelum Fasa 1 pilot |
| P-03 | Google Cloud project + OAuth Client ID (jenis Web) | Ir Aswad | Fasa 0 |
| P-04 | Akaun Cloudflare (2 admin) | Ir Aswad | Fasa 0 |
| P-05 | Akses DNS `voltake.com` untuk tambah CNAME `cc` (Q-11) | Pengurus domain | Fasa 0 |
| P-06 | GitHub org `voltake-energy`: cipta repo private `voltake-portal` | Ir Aswad | Fasa 0 |
| P-07 | Logo Voltake SVG/PNG 1024px, gambar banner solar | Ir Aswad | Fasa 1 |
| P-08 | Senarai staf (staff_id, email, nama, department, designation) | HR | Fasa 1 |
| P-09 | Jawapan Q-02, Q-04, Q-05, Q-06, Q-09 | Ir Aswad + ketua department | Sebelum Fasa 2 modul berkenaan |
| P-10 | Nilai kadar kos semasa | Commercial | Fasa 2A |
| P-11 | Notis privasi PDPA (teks) untuk borang mohon kerja dan portal | HR + Ir Aswad (semakan undang-undang disyorkan) | Sebelum Fasa 2E |
| P-12 | Node.js + `clasp` dipasang di komputer developer | Developer | Fasa 0 |

## 4. Fasa Pelaksanaan

| Fasa | Kerja | Feature | Hasil yang boleh diuji | Anggaran |
|------|-------|---------|------------------------|----------|
| 0A | **Tutup kebocoran sistem lama** (tidak bina apa-apa baru) | - | Semua CSV awam unpublish, semua secret ditukar, 9 repo private | 3-5 hari |
| 0 | Setup: repo, Cloudflare, OAuth, Sheet VP-Access & staging, `setupSystem()` | - | `cc.voltake.com` papar halaman "Coming soon"; tab VP-Access wujud dengan seed | 3-4 hari |
| 1 | Portal teras: login, sesi, gateway API, dashboard, skrin akses manual, PWA, audit | F-01 hingga F-06, F-09 | Staf ujian login di 3 platform, nampak kad yang Admin tandakan, install PWA | 7-9 hari |
| 2A | Cost Calculator | F-20 hingga F-22 | Kiraan sama dengan versi lama; kadar tiada dalam repo | 3-4 hari |
| 2B | ClaimPro | F-50 hingga F-53 | Aliran Draf > Dihantar > Lulus > Dibayar berjalan ikut role | 8-10 hari |
| 2C | AMS | F-40 hingga F-43 | Aset lama diimport; tiada tab password | 6-8 hari |
| 2D | Compliance Track | F-60 hingga F-64 | Staf hanya boleh ubah sijil sendiri; emel Isnin berjalan | 5-7 hari |
| 2E | Draft Mohon Kerja | F-10 hingga F-14 | Borang public dengan consent; interviewer terhad dept | 7-9 hari |
| 2F | GWR (gabung OMP + PSS) | F-30 hingga F-34 | GWR offline dihantar; klien sign melalui token sekali guna | 10-12 hari |
| 2G | ClaimReport | F-70 hingga F-72 | DO sama format dengan template | 4-5 hari |
| 2H | Voltrack | F-80 hingga F-85 | Role tulis ikut fasa; projek terbuka dimigrasi | 6-8 hari |
| 3 | Pengerasan & tutup sistem lama; Tambahan (F-07, F-08) jika diluluskan | F-07, F-08 | Semua ujian seksyen 6 lulus; repo lama di-archive | 5 hari + Tambahan |

## 5. Senarai Task Terperinci

### Fasa 0A - Tutup kebocoran sistem lama (dibuat di sistem lama, tiada kod baru)
- [ ] 0A.1 AMS: unpublish tab "ID PASSWORD" dan MASTERLIST dari "Publish to web"; reset semua password AMS
- [ ] 0A.2 draftmohonkerja: jana `SECRET_KEY` & `TOKEN_SALT` baru, simpan dalam Script Properties, redeploy; tukar fail resume/gambar dari "anyone with link" ke terhad
- [ ] 0A.3 GWR OMP & PSS: unpublish CSV Reports; tukar password role; tukar `DELETE_PIN`
- [ ] 0A.4 Compliance: set `ADMIN_PIN` baru dalam Script Properties
- [ ] 0A.5 claimreport: unpublish CSV dashboard; letak PIN server-side pada action delete
- [ ] 0A.6 Voltrack: tukar password lalai; buang data seed ledger penghutang dari repo (atau terus private)
- [ ] 0A.7 Tukar **kesemua 9 repo ke private** (termasuk `gcc-voltake/claimreport`, `Ruzhad9494/*`)
- [ ] 0A.8 Semak log execution Apps Script draftmohonkerja & AMS untuk akses luar biasa; rekod keputusan sama ada perlu notifikasi PDPA (dari ingatan: Pindaan 2024 wajibkan notifikasi pelanggaran kepada Pesuruhjaya; sahkan dengan JPDP)

### Fasa 0 - Setup
- [ ] 0.1 Cipta repo private `voltake-energy/voltake-portal` dengan struktur TRD seksyen 4; `.gitignore` (`.clasprc.json`, `.env*`, `*.key`), `.gitleaks.toml`, README pendek
- [ ] 0.2 GitHub Action `security.yml`: gitleaks pada setiap push/PR; branch protection `main` (PR wajib, check mesti lulus)
- [ ] 0.3 Cloudflare Pages: sambung repo, tiada build command, output dir `/`; custom domain `cc.voltake.com` (CNAME); branch `staging` sebagai preview tetap
- [ ] 0.4 `_redirects` / struktur output supaya `apps/<modul>/web/` dihidang di `/<modul>/` dan `apps/portal/` di `/`
- [ ] 0.5 Google Cloud: OAuth consent screen jenis **External** (staf guna Gmail), scope `openid email profile` sahaja, publish ke "In production"; OAuth Client ID; Authorized JavaScript origins `https://cc.voltake.com`, `https://staging.voltake-portal.pages.dev`; Authorized redirect/login URI `/auth/google` untuk kedua-dua
- [ ] 0.6 Cipta VP-Access + VP-STG-Access di Drive `systems@voltake.com`; projek gas `access` dengan `clasp create`; set Script Properties; jalankan `setupSystem()` (BSD seksyen 6)
- [ ] 0.7 Isi env variables Cloudflare (Production & Preview berasingan) ikut TRD seksyen 9. Jana secret dengan `openssl rand -base64 48`

### Fasa 1 - Portal teras
- [ ] 1.1 `shared/ui/voltake.css`, font Inter, ikon Lucide, komponen (butang, input, jadual, modal, toast, badge) ikut DBD seksyen 3-6
- [ ] 1.2 `shared/lib/`: `api.js` (fetch `/api` + `X-VP`, kendali 401/403), `escape.js`, `format.js` (RM, DD/MM/YYYY)
- [ ] 1.3 `functions/_lib/google.js`: sahkan ID token (JWKS, iss, aud, exp, email_verified). **Tiada semakan hd**; kawalan masuk ialah allowlist + ikatan `sub` di 1.5 (F-01, TRD 5.1)
- [ ] 1.4 `functions/_lib/session.js`: cipta/sahkan cookie HMAC, revoke `sid` (F-01, F-06)
- [ ] 1.5 `apps/access/gas`: action `getAccess(email, sub)`: semakan allowlist, status, ikatan `google_sub` (isi pada login pertama, tolak jika berbeza), peraturan role efektif (BSD 3.1); `verifySignature_()`; LoginLog
- [ ] 1.6 `functions/auth/google.js`, `auth/logout.js`, `auth/me.js`; rate limit login (TRD 6 #5)
- [ ] 1.7 `functions/api/[module]/[[path]].js`: semakan Origin + `X-VP`, sesi, cache akses 10 minit, role kasar, tandatangan HMAC per modul, forward ke `GAS_URL_<MODULE>` (TRD 5.2)
- [ ] 1.8 `shared/gas/VPAuth.gs`, `VPSheet.gs` (sanitizeForSheet, counter, soft delete), `VPAudit.gs`; skrip `tools/sync-shared-gas.sh` salin ke setiap `apps/*/gas/`
- [ ] 1.9 S-01 Login, S-02 Dashboard (kad dari `Modules` + roles), S-03 Tiada akses, S-08 About (F-02, F-09)
- [ ] 1.10 S-04, S-05 Admin akses (satu skrin matriks staf x modul, tiada enjin peraturan) + action `access.listStaff/addStaff/updateStaff/resetGoogleLink/setAccess` (tulis AccessChangeLog) (superadmin; HR terhad status & `mfa_disahkan`) (F-03, F-06). Termasuk aliran onboard/offboard TRD 5.4
- [ ] 1.11 S-06 Audit log (F-05)
- [ ] 1.12 PWA: `manifest.webmanifest`, `sw.js` (cache app shell, network-only untuk `/api` dan `/auth`), ikon, S-07 panduan install (F-04)
- [ ] 1.13 `_headers`: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (TRD 6)
- [ ] 1.14 Ukur CPU time `/auth/google` dan `/api` (had Free 10 ms). Jika lebih, rekod dan putuskan Workers Paid
- [ ] 1.15 Import senarai staf sebenar (P-08 + emel dari P-02) ke VP-Access, kemudian Ir Aswad tandakan akses setiap staf di S-05 ikut panduan BSD 4.1
- [ ] 1.16 Notis privasi pekerja ringkas di S-01/S-08: emel peribadi dikumpul untuk login sahaja, siapa boleh lihat, tempoh simpan (TRD 6)

### Fasa 2 - Setiap modul (ulang corak 2.x.1 hingga 2.x.7)
Untuk setiap modul `<m>`:
- 2.x.1 Sahkan matriks role modul dengan pemilik department (Q-02) dan kemas kini BSD 4 jika berubah
- 2.x.2 Cipta VP-`<M>` + staging, projek gas, Script Properties, `setupSystem()`
- 2.x.3 Tulis `Actions.gs` dengan `ACTION_ROLES` + skop data ikut BSD 4.2
- 2.x.4 Bina skrin AFD untuk modul tu ikut DBD
- 2.x.5 Ujian keselamatan seksyen 6 (khususnya panggilan API terus sebagai role salah)
- 2.x.6 Migrasi data ikut BSD 7 (staging dulu, kemudian production)
- 2.x.7 Go-live: tukar `Modules.status` ke `aktif`, umum kepada staf, kunci Sheet lama, archive repo lama

Task khusus:
- [ ] 2A.1 Cost Calculator S-20, S-21, S-22; kiraan di server; jana gambar ringkasan di browser (canvas) (F-20 hingga F-22)
- [ ] 2B.1 ClaimPro S-50 hingga S-54; upload resit ke Drive; aliran status + `Approvals`; hanya role `admin` (HR, Head of Strategic Planner) boleh lulus/tolak/laporan, Admin tak boleh lulus claim sendiri; staf sahkan terima bayaran sendiri (S-53) dengan semakan beza amaun dan peringatan 14 hari; emel; arkib (F-50 hingga F-53). Rujuk logik lama `claimpro/Appscript/Code.gs` (validasi, retention) tetapi auth diganti SSO
- [ ] 2C.1 AMS S-40 hingga S-43; mobiliti dengan lulus pulang; peringatan kalibrasi (F-40 hingga F-43)
- [ ] 2D.1 Compliance S-60 hingga S-65; StaffCerts format panjang; `staff_self` hanya rekod sendiri; emel Isnin (F-60 hingga F-64)
- [ ] 2E.1 Halaman public `/public/mohon` (S-10, S-11) dengan Turnstile, notis privasi P-11, consent (F-10)
- [ ] 2E.2 `functions/public/api/[[path]].js`: whitelist action public, Turnstile, rate limit
- [ ] 2E.3 HR S-12 hingga S-15; masking IC untuk interviewer; trigger retention (F-11 hingga F-14)
- [ ] 2F.1 GWR S-30 hingga S-33 satu codebase, `dept` dari sesi; offline queue IndexedDB + `client_req_id` (F-30, F-31, F-33)
- [ ] 2F.2 S-34 tandatangan klien: token 32 byte, simpan hash, sekali guna, luput 7 hari (F-32)
- [ ] 2F.3 Jana PDF draf/final dari template Docs ikut dept; emel (F-34). Dibina: HTML ikut susun atur PDF sistem lama ditukar ke PDF oleh Google (tiada template Docs untuk dijaga), kepala ikut dept dari Settings
- [ ] 2G.1 ClaimReport untuk Strategic Planning: S-70, S-71; jana PDF + XLSX dari tab Template; soft delete admin (F-70 hingga F-72). Dibina: ubah oleh pembuat hari sama / admin, DO lama diimport, Zip PDF di server
- [ ] 2H.1 Voltrack S-80 hingga S-82, 5 role (commercial = Commercial; operation = manager PSS & OMP; claim = HR; lod = HR & Account; admin per individu); `ROLE_WRITE_ACCESS` ikut fasa; `gwr_report_ids` (F-80 hingga F-85)

### Fasa 3 - Pengerasan & tutup
- [ ] 3.1 Jalankan semula semua ujian seksyen 6 merentas modul
- [ ] 3.2 Semak semua folder Drive: tiada "anyone with link" untuk data peribadi
- [ ] 3.3 Archive 9 repo lama di GitHub (kekal private, read-only)
- [ ] 3.4 Tulis `docs/runbook.md`: onboard staf (daftar emel Gmail), offboard, tukar emel/akaun hilang (dengan pengesahan identiti), tambah modul, rotate secret, pulih dari backup
- [ ] 3.5 (Tambahan, jika diluluskan) F-07 OneSignal di portal; F-08 dashboard KPI + action `summary` setiap modul
- [ ] 3.6 Nilai semula keperluan Supabase ikut kriteria TRD 7 (Q-10)

## 6. Pelan Testing

| Ujian | Cara | Lulus bila |
|-------|------|-----------|
| Login setiap role | Akaun ujian (Gmail) untuk setiap department di staging | Masuk S-02 dengan kad yang betul sahaja |
| Gmail berdaftar | Login dengan Gmail yang ada dalam allowlist | Berjaya; `google_sub` diisi |
| Gmail tak berdaftar | Login dengan Gmail yang tiada dalam VP-Access | Ditolak di server, S-03 "Emel belum didaftar", LoginLog `tiada_staf` |
| `sub` tak padan | Ubah `google_sub` di staging kepada nilai lain, login | Ditolak, LoginLog `sub_tak_padan` |
| HR cuba lulus claim | Panggil `/api/claimpro/decideClaim` dengan sesi staf HR | 403 |
| Admin lulus claim sendiri | Admin ClaimPro cuba lulus tuntutan dia sendiri | Ditolak |
| Sahkan bayaran claim orang lain | Staf A panggil `confirmReceived` untuk claim staf B | 403 |
| Admin tanda Dibayar | Admin cuba tukar claim ke `Dibayar` | 403 |
| Akses manual | Admin tanda/buang modul untuk staf ujian di S-05 | Berkuat kuasa ≤ 10 minit; baris baru dalam AccessChangeLog dengan sebab |
| Claim staf HR | Staf HR Admin cuba lulus claim staf HR lain | Ditolak; hanya Head of Strategic Planner boleh |
| Staf tamat | Tukar status ke `tamat`, tunggu 10 minit, panggil API | 401 |
| Akses modul tanpa role | Buka `/ams/` sebagai HR; panggil `/api/ams/listAssets` dengan curl + cookie HR | Skrin S-03; API 403 |
| Tandatangan palsu | Panggil URL Apps Script terus (tanpa/salah `sig`, `ts` lama, `nonce` diulang) | Ditolak sebelum baca Sheet |
| Skop data | Staf A panggil `getClaim` untuk claim staf B; interviewer dept A minta pemohon dept B | 403 |
| CSRF | POST ke `/api` dari origin lain atau tanpa `X-VP` | 403 |
| XSS | Masukkan `<img src=x onerror=alert(1)>` dalam medan teks, buka di semua skrin | Dipapar sebagai teks |
| Formula injection | Masukkan `=HYPERLINK("http://x")` | Disimpan sebagai `'=HYPERLINK...` dalam Sheet |
| Rate limit | 15 login gagal / 25 hantaran borang public dari satu IP | Disekat dengan mesej jelas |
| Secret dalam repo | gitleaks + `grep -ri "script.google.com\|spreadsheets/d/" apps shared` | Tiada hasil |
| Publish to Web | Semak setiap VP-* Sheet: File > Share > Publish to web | Tiada yang diterbitkan |
| Data besar | Seed 5,000 claim + 2,000 GWR di staging | `list` < 5 saat |
| Concurrency | 30 request serentak ke satu modul (skrip k6/autocannon ke staging) | Tiada ralat 5xx; rekod masa |
| Offline GWR | Mod kapal terbang, isi 2 GWR, online semula | Kedua-dua dihantar sekali sahaja |
| Mobile | iPhone (iOS 16.4+), Android Chrome, lebar 360px | Tiada skrol mendatar; butang ≥ 44px |
| PWA | Lighthouse + install sebenar 3 platform | Installable; ikon & splash betul; login berfungsi dalam PWA iOS |
| Regresi kiraan | 3 kes Cost Calculator dari Commercial | Sama dengan sistem lama |

## 7. Deployment

Untuk Ir Aswad (bukan IT), langkah asas setiap kali ada perubahan:

1. AI coding tool buat perubahan dalam branch baru (contoh `modul-claimpro`) dan buka Pull Request di GitHub.
2. Cloudflare jana URL preview automatik (dipaparkan dalam PR). Buka URL tu, cuba.
3. Jika perubahan sentuh Apps Script: dalam terminal, `cd apps/<modul>/gas`, `clasp push`, kemudian `clasp deploy -i <DEPLOYMENT_ID_STAGING>`. Uji di staging.
4. Bila puas hati, tekan **Merge** dalam PR. Cloudflare deploy ke `cc.voltake.com` dalam 1-2 minit.
5. Untuk Apps Script production: `clasp deploy -i <DEPLOYMENT_ID_PROD>` (guna deployment ID yang sama supaya URL tak berubah).
6. Buka `cc.voltake.com`, login, semak modul berkenaan.
7. Jika rosak: dalam Cloudflare Pages > Deployments, pilih deployment sebelum ini > **Rollback**. Untuk Apps Script: Deploy > Manage deployments > pilih versi lama.

Setup kali pertama (Fasa 0) diterangkan langkah demi langkah dalam `docs/runbook.md` (task 3.4) dan task 0.1 hingga 0.7.

## 8. Milestone

Anggaran jika Fasa 0A mula Isnin 24/11/2026. Cuti hujung tahun mungkin anjakkan tarikh.

| Milestone | Tarikh sasaran (DD/MM/YYYY) | Pemilik | Status |
|-----------|-----------------------------|---------|--------|
| M0A Kebocoran lama ditutup, 9 repo private | 28/11/2026 | Ir Aswad | Belum mula |
| M0 Repo, Cloudflare, OAuth, VP-Access siap | 05/12/2026 | Developer | Belum mula |
| M1 Portal teras live (login + dashboard + PWA) untuk kumpulan pilot | 19/12/2026 | Developer | Belum mula |
| M2A Cost Calculator live | 24/12/2026 | Developer + Commercial | Belum mula |
| M2B ClaimPro live (semua staf) | 12/01/2027 | Developer + HR/Finance | Belum mula |
| M2C AMS live | 23/01/2027 | Developer + Admin | Belum mula |
| M2D Compliance live | 03/02/2027 | Developer + HR/PSS | Belum mula |
| M2E Draft Mohon Kerja live | 17/02/2027 | Developer + HR | Belum mula |
| M2F GWR live (OMP + PSS) | 10/03/2027 | Developer + OMP/PSS | Belum mula |
| M2G ClaimReport live | 17/03/2027 | Developer + Strategic Planning | Belum mula |
| M2H Voltrack live | 31/03/2027 | Developer + Commercial | Belum mula |
| M3 Semua sistem lama ditutup | 10/04/2027 | Ir Aswad | Belum mula |

## 9. Serahan & Revisi

Projek dalaman, jadi "serahan" bermaksud:
- Pautan `cc.voltake.com` + panduan install (S-07) diedar kepada semua staf
- `docs/runbook.md` + 6 dokumen ini dalam `docs/` repo
- Akaun pemilik: `systems@voltake.com` (Workspace), Cloudflare (2 admin), GitHub org (2 owner)
- Sesi taklimat 30 minit per department semasa modul mereka go-live
- Perubahan skop (feature baru, role baru) dicatat dalam PRD Changelog sebelum dibina. Feature "Tambahan" (F-07, F-08, F-85) hanya dibina selepas M2H atau jika diluluskan awal

## 10. Risiko

| Risiko | Kesan | Cara kurangkan |
|---|---|---|
| Sistem lama terus bocor sementara sistem baru dibina | Pelanggaran PDPA | Fasa 0A wajib siap dulu, minggu ini/depan |
| Matriks role modul lain tak dijawab (Q-02) | Fasa 2 tergendala | Ir Aswad tetapkan terus di S-05 ikut panduan BSD 4.1; boleh ubah bila-bila |
| Had 30 execution serentak Apps Script (semua jalan sebagai satu akaun) | Ralat waktu puncak (contoh hujung bulan claim) | Ujian concurrency; cache `list` 60 saat di edge; kriteria Supabase (TRD 7) |
| Workers Free 10 ms CPU tak cukup | Login gagal | Ukur di 1.14; Workers Paid sebagai pelan B |
| Google Sign-In dalam PWA iOS | Staf iOS tak boleh login | `ux_mode: redirect`; uji iPhone sebenar di Fasa 1 sebelum modul lain |
| Gmail peribadi staf kena hack | Penyerang masuk portal sebagai staf | Polisi wajib 2-Step Verification (Q-12); `admin`/`superadmin` guna akaun syarikat + MFA; LoginLog untuk siasatan; status `gantung` serta-merta |
| Akaun Gmail dikongsi | Tak tahu siapa buat apa; data terdedah kepada bukan staf | Satu orang satu emel, disahkan HR semasa onboard; semakan berkala |
| Staf berhenti masih ada Gmail | Akses kekal jika HR lupa offboard | Tukar status pada hari terakhir; laporan bulanan "aktif tapi tak login 60 hari"; semakan 3 bulan dengan senarai gaji |
| Staf hilang akses Gmail / tukar emel | Tak boleh login; risiko penyamaran bila minta tukar | Proses "Tukar emel" dengan pengesahan identiti HR (Q-13) |
| Staf lupa sahkan terima bayaran | Claim tersangkut status Lulus, laporan tak tepat | Peringatan emel 14 hari; laporan Admin "Lulus belum disahkan" |
| Admin lupa ubah akses bila staf tukar jawatan | Akses berlebihan | S-04 papar designation + modul bersebelahan; laporan bulanan senarai akses setiap staf untuk Admin semak |
| HR boleh lulus dan bayar claim | Risiko salah guna | Admin tak boleh lulus claim sendiri; claim staf HR hanya Head of Strategic Planner; staf sahkan terima; laporan beza bayaran bulanan ke Head of Strategic Planner |
| Staf tiada akaun Google langsung | Tak boleh login | Bantu cipta Gmail percuma semasa onboard |
| Seorang developer sahaja faham sistem | Bus factor | Dokumen ini + runbook; corak sama untuk semua modul; kod dalam satu repo |
| Secret bocor ke satu modul | Modul tu terdedah | Secret per modul (bukan satu kongsi); rotate ikut runbook |
| Migrasi data silap | Data hilang/salah | Staging dulu, banding kiraan & sampel, Sheet lama dikunci bukan dipadam |
| Skop bertambah semasa bina | Lewat | Changelog PRD; Tambahan hanya selepas M2H |

## Arahan untuk AI coding tool

> Baca 01-PRD.md hingga 06-IPD.md dalam folder `docs/`. Bina sistem mengikut IPD, mulakan dengan Fasa 0 (Fasa 0A dibuat manual oleh pemilik dalam sistem lama). Selepas setiap fasa atau sub-fasa (contoh 2B), berhenti, ringkaskan apa yang siap dan cara untuk test, dan tunggu saya sahkan sebelum sambung. Jangan ubah skop, role atau skema tanpa tanya. Jangan sesekali letak secret, Spreadsheet ID, URL Apps Script atau data sebenar dalam repo. Semua semakan role mesti di server.
