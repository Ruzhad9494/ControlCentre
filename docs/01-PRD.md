# PRD: Voltake Operations Portal
Tarikh: 19/11/2026 | Versi: 1.3 (draf, dikemas kini 19/11/2026) | Pemilik: Ir Aswad Ahmad, Voltake Energy

Dokumen 1 daripada 6. Baca bersama 02-TRD, 03-AFD, 04-DBD, 05-BSD, 06-IPD.

## 1. Overview

Voltake Operations Portal ialah satu portal dalaman untuk semua staf Voltake Energy: satu URL (`cc.voltake.com`), satu login Google (akaun Gmail peribadi atau akaun syarikat, asalkan emel tu dah didaftar Admin), satu ikon PWA di desktop, Android dan iOS. Selepas login, staf hanya nampak modul yang dibenarkan ikut department dan jawatan. Portal ini menggantikan 9 sistem lama yang sekarang duduk dalam 9 repo GitHub berasingan, dengan login dan password berbeza, dan beberapa yang ada kebocoran data.

Portal ini dibina **semula dari kosong** untuk tahun 2027: repo GitHub baru (private), Google Sheet baru untuk setiap modul, dan satu sheet Access pusat. Logik business dari sistem lama (terutamanya ClaimPro dan Voltrack yang dah selamat) dijadikan rujukan, bukan disalin bulat-bulat.

## 2. Masalah Semasa

| Masalah | Kesan |
|---|---|
| 9 sistem, 9 repo, 3 akaun GitHub (voltake-energy, Ruzhad9494, gcc-voltake) | Susah urus, susah deploy, tiada standard |
| Setiap sistem ada login sendiri (atau tiada langsung) | Staf ingat banyak password; bila staf berhenti, kena buang akses di 6+ tempat |
| Semua repo PUBLIC | Kod, secret dan Spreadsheet ID boleh dibaca umum |
| AMS: tab password diterbitkan sebagai CSV awam, login dalam browser | Password staf terdedah |
| draftmohonkerja: secret key dalam repo | Data pemohon (IC, rekod jenayah, KWSP/SOCSO) boleh dibaca orang luar |
| GWR: password role hardcoded, CSV awam termasuk ApprovalToken | Orang luar boleh tandatangan sebagai klien |
| Compliance: PIN admin dikongsi, staf update sijil dengan Staff ID sahaja | Sesiapa boleh ubah rekod orang lain |
| claimreport: tiada auth, delete terbuka | Rekod DO boleh dipadam sesiapa |
| PWA tak konsisten (manifest Blob URL, SW tak berfungsi) | Install di telefon tak stabil |

Sumber: review kod 9 repo pada 19/11/2026 (doc "Voltake Portal: Review 9 Sistem & Cadangan SSO").

## 3. Product Goal

1. Satu login Google untuk semua modul. Staf login sekali sehari (sesi 12 jam), bukan sekali setiap sistem.
2. Kosongkan risiko kebocoran yang dikenal pasti: tiada CSV awam, tiada password dalam kod, semua semakan role di server. Diukur dengan checklist keselamatan IPD seksyen 6 lulus 100% sebelum go-live setiap modul.
3. Tambah atau buang akses staf di satu tempat (sheet Access), berkuat kuasa dalam masa 10 minit di semua modul.
4. Satu PWA yang boleh di-install di desktop, Android dan iOS, dengan app shell yang dimuat dalam bawah 3 saat di 4G.

## 4. Pengguna & Role

Akses ditetapkan **manual oleh Admin** untuk setiap staf: modul mana dia nampak dan role apa dalam modul tu, berdasarkan designation dia. Tiada peraturan automatik ikut department atau jawatan. Jadual di bawah ialah gambaran biasa; panduan penuh dalam BSD seksyen 4.1.

| ID | Role | Siapa | Apa yang mereka perlu buat |
|----|------|-------|----------------------------|
| R-01 | Super Admin | IT / Ir Aswad | Urus sheet Access, tambah modul, lihat audit log, akses semua modul |
| R-02 | HR | Pasukan HR | Draft Mohon Kerja (penuh), Compliance Track, ClaimPro (Admin: lulus/tolak, dan buat pindahan wang claim di luar sistem), Voltrack (role `claim` dan `lod`) |
| R-03 | Commercial | Pasukan Commercial | Cost Calculator, Voltrack, ClaimPro (hantar tuntutan sendiri) |
| R-04 | PSS | Pasukan PSS | Cost Calculator, Compliance Track, ClaimPro |
| R-05 | Engineer / Technician | Pasukan OMP & PSS di lapangan | GWR (5 tahap: manager, supervisor, engineer, chargeman, technician), ClaimPro |
| R-06 | Admin / Auditor | Admin aset & auditor | AMS, ClaimPro |
| R-07 | Staf (semua) | Setiap staf aktif | ClaimPro (tuntutan sendiri), kemas kini sijil sendiri dalam Compliance |
| R-08 | Admin ClaimPro | Staf yang Admin beri role `admin` ClaimPro (panduan: HR dan Head of Strategic Planner) | **Satu-satunya** role yang boleh buka skrin kelulusan: lulus/tolak dan laporan. Tak rekod bayaran (staf rekod sendiri). Tak boleh lulus claim sendiri. Semua staf lain hanya boleh buat claim |
| R-09 | Interviewer | Manager department yang temu duga | Papan interviewer HR, hanya pemohon department sendiri |
| R-10 | Strategic Planning | Department Strategic Planning | ClaimReport (jana DO untuk Sungrow), ClaimPro (Head of Strategic Planner = Admin ClaimPro) |
| R-11 | Pengurusan | Pengarah / pengurusan | Paparan baca sahaja + dashboard KPI (Tambahan) |
| R-12 | Pemohon kerja (public) | Orang awam | Isi borang mohon kerja tanpa login |
| R-13 | Klien GWR (public) | Wakil klien | Tandatangan GWR melalui pautan sekali guna |
| R-14 | Account | Department Account | Voltrack (role `lod`), ClaimPro |

Nota: Voltrack ada 5 role modul (disahkan 19/11/2026): `commercial` = Commercial; `operation` = manager PSS & OMP; `claim` = HR; `lod` = HR & Account; `admin` = per individu. Staf ini nampak kad Voltrack walaupun bukan department Commercial. R-12 dan R-13 tak login. Mereka guna laluan `/public/...` dengan perlindungan berasingan (Turnstile, rate limit, token sekali guna).

## 5. Features

### 5.1 Portal teras (`apps/portal`)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-01 | Login Google (SSO) | Google Sign-In dengan mana-mana akaun Google (Gmail peribadi atau syarikat). Hanya emel yang ada dalam allowlist sheet VP-Access (didaftar Admin) boleh masuk. Sesi 12 jam dalam cookie HttpOnly | R-01 hingga R-11 | Wajib | Login sekali, semua modul terbuka |
| F-02 | Dashboard modul | Grid kad modul ikut role, macam mockup | R-01 hingga R-11 | Wajib | Staf hanya nampak modul yang dia ada akses |
| F-03 | Urus akses & allowlist | Satu skrin untuk daftar emel staf (onboard), rekod designation, tandakan modul & role setiap staf secara manual, tamatkan akses (offboard). Setiap perubahan direkod (siapa, bila, dari apa ke apa) | R-01 | Wajib | Admin kawal sepenuhnya siapa nampak apa; tiada peraturan tersembunyi |
| F-04 | PWA | Manifest, service worker, ikon, panduan install iOS/Android | Semua | Wajib | Satu ikon "Voltake" boleh di-install |
| F-05 | Audit log | Rekod login, perubahan akses dan tindakan sensitif | R-01 | Wajib | Boleh jejak siapa buat apa |
| F-06 | Revoke serta-merta | Tukar status staf ke "tamat", semua sesi mati dalam 10 minit | R-01, R-02 | Wajib | Staf berhenti hilang akses serentak |
| F-07 | Push notification | OneSignal di peringkat portal, boleh dipakai semua modul | Semua | Tambahan | Peringatan claim lulus, sijil tamat, dsb |
| F-08 | Dashboard KPI merentas modul | Ringkasan angka dari setiap modul | R-01, R-11 | Tambahan | Pengurusan nampak gambaran keseluruhan |
| F-09 | Halaman "More Info / About" | Info syarikat, versi sistem, hubungi IT | Semua | Penting | Sama macam kad "More Info" dalam mockup |

### 5.2 Draft Mohon Kerja (`apps/draftmohonkerja`, kod modul `hr`)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-10 | Borang mohon kerja public | Borang awam dengan notis privasi PDPA + consent, anti-bot | R-12 | Wajib | Permohonan masuk tanpa login, consent direkod |
| F-11 | Dashboard HR | Senarai, tapis, ubah status, catatan HR, jadual interview | R-02 | Wajib | HR urus semua pemohon di satu tempat |
| F-12 | Papan interviewer | Interviewer nampak pemohon department sendiri sahaja, data sensitif dilindung | R-09 | Wajib | Interviewer beri markah tanpa nampak IC penuh / rekod jenayah |
| F-13 | Setup jawatan & department | Buka/tutup jawatan kosong | R-02 | Wajib | Borang public papar jawatan aktif sahaja |
| F-14 | Retention automatik | Pemohon tak berjaya dipadam/dianonimkan selepas tempoh ditetapkan | sistem | Wajib | Patuh prinsip Retention PDPA |

### 5.3 Cost Calculator (`apps/costcalculator`, kod modul `costcalc`)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-20 | Kira kos & margin | Maklumat projek, mobilisasi, nilai PO, subkon, kadar tetap, keputusan margin + jana gambar ringkasan | R-03, R-04 | Wajib | Sama fungsi dengan versi lama |
| F-21 | Simpan & buka semula pengiraan | Simpan estimate ke Sheet, cari, duplicate | R-03, R-04 | Penting | Tak hilang kerja, boleh rujuk balik |
| F-22 | Urus kadar kos | Admin tukar kadar (OT, transport, homestay, dsb) di server, bukan dalam kod | R-01, admin costcalc | Wajib | Kadar dalaman tak terdedah dalam HTML |

### 5.4 GWR (`apps/gwr`, kod modul `gwr`, satu codebase untuk OMP dan PSS)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-30 | Isi Ground Work Report | Borang GWR (PO, MOS, klien, kerja, manpower, gambar, shutdown, PTW), tandatangan staf, PDF draf | R-05 | Wajib | GWR siap di lapangan dari telefon |
| F-31 | Offline queue | Simpan GWR dalam IndexedDB bila tiada line, hantar bila online | R-05 | Wajib | Tiada GWR hilang di site |
| F-32 | Tandatangan klien | Pautan sekali guna (luput 7 hari) dihantar ke klien; klien sign tanpa login | R-13 | Wajib | GWR disahkan klien, PDF final dijana |
| F-33 | Dashboard GWR | Senarai, carian PO, status, ikut department (OMP/PSS) dan tahap role | R-05, R-01 | Wajib | Manager nampak semua; technician nampak report sendiri |
| F-34 | Emel PDF final | PDF final dihantar ke staf & klien selepas sign | sistem | Wajib | Semua pihak dapat salinan |

### 5.5 AMS (`apps/ams`, kod modul `ams`)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-40 | Daftar aset | Masterlist aset: kategori, make, model, serial, lokasi, gambar, sijil | R-06 | Wajib | Satu senarai aset yang tepat |
| F-41 | Kalibrasi | Log kalibrasi, tarikh luput, peringatan 30 hari sebelum luput | R-06 | Wajib | Tiada alat luput kalibrasi digunakan |
| F-42 | Audit aset | Rekod audit dengan gambar dan keadaan | R-06 | Wajib | Jejak audit lengkap |
| F-43 | Mobiliti aset | Pinjam dan pulang aset, kelulusan pemulangan | R-06, staf peminjam | Wajib | Tahu aset di mana dan siapa pegang |

### 5.6 ClaimPro (`apps/claimpro`, kod modul `claimpro`)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-50 | Hantar tuntutan | Hantar/edit/padam tuntutan dengan resit. Staf boleh betulkan/padam selagi belum Lulus (Draf, Dihantar, Ditolak); Admin HR / Head of HR boleh ubah/padam tuntutan staf pada apa-apa status dengan sebab (ikut sistem lama) | R-02 hingga R-07, R-10, R-14 (semua staf) | Wajib | Semua staf boleh claim dari telefon |
| F-51 | Kelulusan | Admin ClaimPro (HR, Head of Strategic Planner) semak dan lulus/tolak. Satu peringkat. Claim staf HR diluluskan Head of Strategic Planner | R-08 | Wajib | Hanya Admin boleh buka skrin kelulusan, disemak di server |
| F-52 | Rekod terima bayaran | Staf pemilik claim rekod sendiri tarikh terima, jumlah diterima dan bukti (contoh slip/notifikasi bank) untuk claim dia yang dah Lulus. Status jadi Dibayar | R-07 (pemilik claim sahaja) | Wajib | Admin nampak claim yang dah disahkan dibayar; beza amaun ditanda |
| F-53 | Laporan & arkib | Senarai "Lulus, belum dibayar" untuk HR buat pindahan wang; eksport bulanan; arkib automatik ikut retention | R-08 | Penting | Data lama tak bebankan Sheet |

### 5.7 Compliance Track (`apps/compliance-track`, kod modul `compliance`)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-60 | Kenderaan | Roadtax kereta & motosikal: plat, lokasi, keadaan, tarikh luput, dokumen | R-02, R-04 | Wajib | Tiada roadtax terlepas |
| F-61 | Chargeman | Kompetensi chargeman ikut solar farm, tarikh luput, dokumen | R-02, R-04 | Wajib | Kompetensi sentiasa sah |
| F-62 | Sijil staf | CIDB, NIOSH, Working at Height, First Aid. Staf kemas kini sijil **sendiri** selepas login SSO | R-02, R-04, R-07 | Wajib | Staf tak boleh ubah sijil orang lain |
| F-63 | Peringatan luput | Emel mingguan senarai yang luput dalam 30/60/90 hari | sistem | Wajib | HR/PSS diberitahu awal |
| F-64 | Job log PSS | Log kerja PSS (dari sistem lama) | R-04 | Penting | Kekal fungsi lama (**perlu disahkan** medan sebenar) |

### 5.8 ClaimReport (`apps/claimreport`, kod modul `claimreport`)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-70 | Jana DO Sungrow | Isi borang DO, jana PDF + Excel dari template "DO SUNGROW NEW" | R-10 | Wajib | DO siap untuk Sungrow |
| F-71 | Database & dashboard DO | Senarai, carian, ringkasan DO | R-10 | Wajib | Jejak semua DO |
| F-72 | Edit & padam DO | Admin sahaja, soft delete dengan sebab | R-10 (admin), R-01 | Wajib | Tiada rekod hilang tanpa jejak |

### 5.9 Voltrack (`apps/voltrack`, kod modul `voltrack`)

| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-80 | Commercial | Quotation, status, tarikh proceed | R-03 | Wajib | Pipeline quotation jelas |
| F-81 | Operation | MOS/JSA/PTW, tarikh kerja, GWR, full report | voltrack `operation` (manager PSS & OMP) | Wajib | Status kerja setiap projek |
| F-82 | Claim | Invois, follow-up 1-3, status bayaran, hari tertunggak | voltrack `claim` (HR) | Wajib | Tiada invois terlepas follow-up |
| F-83 | LOD | Surat tuntutan, CTOS, tindakan undang-undang | voltrack `lod` (HR & Account) | Wajib | Kes hutang dijejak |
| F-84 | Dashboard eksekutif Voltrack | Ringkasan semua fasa projek | R-03, R-11 | Penting | Gambaran pipeline ke tunai |
| F-85 | Pautan silang projek | Projek Voltrack (EL-YYYY-NNN) boleh dirujuk dari GWR dan Cost Calculator | R-03, R-05 | Tambahan | Kurang taip semula, data konsisten |

## 6. Di Luar Skop (versi 1.0)

- Pindah ke Supabase/Postgres. Kekal Google Sheets dulu; kriteria untuk pindah ada dalam TRD seksyen 7.
- Login dengan password atau OTP (bukan Google). Semua staf mesti ada akaun Google (Gmail percuma pun boleh).
- Aplikasi native (Play Store / App Store). PWA sahaja.
- Integrasi sistem perakaunan atau payroll.
- Akses Sungrow ke portal. Sungrow hanya terima output (PDF/Excel).
- Migrasi penuh semua sejarah data lama (lihat Q-04 dan BSD seksyen 7).
- Cloudflare Access (Zero Trust) sebagai pagar luar. Boleh ditambah selepas semua modul live.

## 7. Kriteria Penerimaan

| Feature | Dianggap siap bila... |
|---|---|
| F-01 | Akaun Gmail atau syarikat yang didaftar dan aktif boleh login di desktop, Android dan iOS PWA; akaun Google yang tak didaftar ditolak di server dengan mesej "Emel belum didaftar, hubungi Admin"; panggilan API tanpa cookie sah dapat 401 |
| F-03 | Admin daftar emel baru, staf tu boleh login dalam masa 10 minit; status "tamat" sekat akses dalam 10 minit |
| F-02 | Staf HR nampak tepat 3 kad (Draft Mohon Kerja, Compliance, ClaimPro) + More Info; buka `/costcalculator/` terus melalui URL dapat skrin "Tiada akses" dan API pulangkan 403 |
| F-04 | Lighthouse "Installable" lulus; boleh Add to Home Screen di iOS 16.4+ dan install di Chrome Android/desktop |
| F-05 | Setiap login, perubahan akses dan delete direkod dengan masa, email dan tindakan |
| F-06 | Selepas status staf ditukar "tamat", panggilan API seterusnya selepas 10 minit dapat 401 |
| F-10 | Borang tak boleh dihantar tanpa tanda consent; 20 hantaran dari IP sama dalam 10 minit disekat; consent_version direkod |
| F-11 | HR boleh tukar status pemohon dan catatan; perubahan masuk audit log |
| F-12 | Interviewer department A tak boleh baca pemohon department B, walaupun panggil API terus |
| F-14 | Pemohon status Ditolak lebih 12 bulan (tempoh perlu disahkan) dianonimkan oleh trigger harian |
| F-20 | Hasil kiraan sama dengan versi lama untuk 3 kes ujian yang Commercial sediakan |
| F-22 | Kadar kos tiada dalam mana-mana fail di repo; ditukar melalui skrin admin |
| F-30 | Technician boleh hantar GWR lengkap dengan 5 gambar dari telefon dalam bawah 60 saat di 4G |
| F-31 | GWR yang diisi dalam mod kapal terbang dihantar automatik bila app dibuka semula online, tanpa duplikat |
| F-32 | Pautan klien hanya boleh digunakan sekali dan luput selepas 7 hari; token disimpan sebagai hash |
| F-33 | Technician hanya nampak report sendiri; manager nampak semua report department sendiri |
| F-40 hingga F-43 | Semua tindakan perlu sesi sah dan role betul di server; tiada tab password wujud |
| F-50 | Staf hanya nampak tuntutan sendiri; tak boleh ubah/padam selepas Lulus. Perubahan oleh HR wajib sebab, direkod dan diemel kepada staf |
| F-51, F-52 | Aliran Draf > Dihantar > Lulus/Ditolak > Dibayar berjalan. Hanya `admin` boleh tukar Dihantar ke Lulus/Ditolak, dan bukan untuk claim sendiri. Hanya pemilik claim boleh tukar Lulus ke Dibayar. Panggilan API terus oleh orang lain dapat 403; setiap peralihan diaudit |
| F-60 hingga F-63 | Staf tak boleh ubah sijil orang lain (diuji melalui API terus); emel peringatan dihantar setiap Isnin 8 pagi |
| F-70 | PDF dan Excel DO yang dijana sama format dengan template sedia ada |
| F-72 | Hanya admin boleh padam; rekod dipadam masih wujud dengan flag `deleted` dan sebab |
| F-80 hingga F-83 | Role hanya boleh tulis tab fasa sendiri (macam `ROLE_WRITE_ACCESS` lama); semua role Voltrack boleh baca |

## 8. Andaian

1. Pengurusan atasan dan level engineer ada akaun Workspace @voltake.com; technician tiada dan guna Gmail peribadi (disahkan 19/11/2026). Login guna mana-mana akaun Google, dikawal oleh allowlist emel dalam VP-Access, bukan sekatan domain.
2. Bilangan pengguna kurang 100 orang, dengan puncak kurang 30 pengguna serentak.
3. Matriks role dalam mockup (`image.png`) adalah titik mula. Role terperinci per modul akan disahkan (Q-02).
4. GWR OMP dan GWR PSS boleh digabung jadi satu modul dengan medan `dept`, kerana kod lama sama (v4.2, beza pada DEPT sahaja).
5. Sistem lama terus berjalan sehingga modul baharu masing-masing go-live, dan kebocoran lama ditutup dalam Fasa 0 (IPD) tanpa tunggu sistem baru.
6. Go-live sasaran: portal + modul pertama awal Januari 2027, semua modul akhir Februari 2027. Ini anggaran, bukan komitmen.
7. Semua Sheet, Drive folder dan projek Apps Script dimiliki satu akaun Workspace khas `systems@voltake.com` (syarikat dah ada Workspace berbayar, disahkan 19/11/2026), bukan akaun peribadi mana-mana staf. Staf dengan Gmail peribadi **tak pernah** diberi akses terus ke Sheet atau Drive; mereka hanya capai data melalui portal.
8. Admin ClaimPro = HR dan Head of Strategic Planner (diberi manual oleh Admin). HR juga buat pindahan wang claim di luar sistem. Hanya mereka boleh lulus/tolak. Bayaran direkod oleh staf pemilik claim sendiri selepas terima wang (tafsiran aku atas "rekod bayaran dari staf masing-masing"; betulkan jika maksudnya lain). Pindahan wang sebenar dibuat di luar sistem (Q-15).
9. ClaimReport dipakai department Strategic Planning (disahkan 19/11/2026).

## 9. Soalan Terbuka

Hanya soalan yang masih terbuka. Yang dah dijawab ada di 9.1.

| ID | Soalan | Kenapa penting | Cadangan sementara |
|----|--------|---------------|--------------------|
| Q-02 | Matriks role tepat untuk modul yang belum disahkan: Compliance (PSS boleh ubah apa?), AMS (semua staf lapangan boleh pinjam aset?), tahap GWR setiap orang | BSD seksyen 4 | Guna cadangan BSD 4.1; sahkan pada task 2.x.1 setiap modul |
| Q-04 | Migrasi data lama: mula kosong 01/01/2027, atau bawa sejarah? | Masa dan risiko | Bawa master data + rekod terbuka sahaja. Sejarah kekal dalam Sheet lama, read-only |
| Q-05 | Tempoh retention: pemohon kerja tak berjaya, tuntutan, GWR | PDPA Retention | Pemohon ditolak 12 bulan; tuntutan 7 tahun (**sahkan LHDN**); GWR 7 tahun |
| Q-06 | Siapa dalam Strategic Planning jadi `admin` claimreport (boleh edit/padam DO)? | UserAccess | Head of Strategic Planner. Admin boleh tetapkan sendiri semasa setup |
| Q-09 | draftmohonkerja: perlukah kumpul KWSP/SOCSO dan rekod jenayah semasa memohon? | PDPA: minimakan data sensitif | KWSP/SOCSO selepas tawaran; jenayah Ya/Tidak + penerangan, HR sahaja boleh baca |
| Q-10 | Bila nak pindah ke Supabase? | Had Apps Script/Sheets | Ikut kriteria TRD 7, nilai semula Jun 2027 |
| Q-11 | `cc.voltake.com` muktamad? DNS voltake.com diurus siapa? | Setup Cloudflare | CNAME sahaja, jangan pindah nameserver |
| Q-12 | Wajibkan technician (Gmail peribadi) hidupkan 2-Step Verification? | Sistem tak boleh paksa MFA pada Gmail peribadi | Syarat polisi IT + HR semak semasa onboard. Akaun Workspace: paksa melalui Admin console |
| Q-13 | Bila staf tukar/hilang akaun Gmail, siapa sahkan identiti sebelum emel ditukar? | Elak penyamaran | HR sahkan bersemuka/panggilan video |
### 9.1 Soalan yang dah dijawab

| ID | Jawapan (19/11/2026) | Kesan pada dokumen |
|----|---------------------|--------------------|
| Q-01 | Voltrack memang 5 role. Operation = PSS & OMP (manager), Claim = HR, LOD = HR & Account | Panduan BSD 4.1; department `ACCOUNT` ditambah |
| Q-03 | Hanya Admin ClaimPro lulus/tolak. Admin = designation HR dan Strategic Planner. Rekod bayaran **bukan** oleh Admin; setiap staf rekod sendiri bila terima bayaran | F-51, F-52, S-53, BSD Claims |
| Q-06 (sebahagian) | ClaimReport dipakai Strategic Planning | Department `STRATEGIC` |
| Q-07 | Pengurusan atasan & engineer ada akaun Workspace @voltake.com; technician tiada, guna Gmail peribadi | Allowlist emel campuran (TRD 5.1, 5.4) |
| Q-08 | Syarikat ada Google Workspace berbayar | Cipta satu akaun Workspace khas `systems@voltake.com` untuk pegang semua Sheet/Script/Drive |
| Q-14 | Semua HR dan Strategic Planner ada akaun @voltake.com | Semua pemegang role admin guna akaun Workspace dengan 2SV dipaksa |
| Q-15 | Pindahan wang claim dibuat HR sahaja | HR guna senarai "Lulus, belum dibayar" (S-54); asingan tugas dalam BSD 3.6 |
| Q-16 | Designation rasmi: Head of Strategic Planner, Manager of Power System Solutions, Manager of Operation Maintenance and Performance | Disimpan dalam `Staff.designation` sebagai maklumat. Pemilik pilih akses manual ikut designation, tiada peraturan automatik (BSD 3.1, 4.1) |

## 10. Changelog

| Tarikh | Perubahan |
|--------|-----------|
| 19/11/2026 | Versi 1.0 draf. Keputusan: bina semula dalam satu monorepo private + Sheet baharu, bukan compile repo lama |
| 19/11/2026 | Versi 1.1. Jawapan pemilik: (1) Voltrack kekal 5 role; (2) ClaimPro: hanya Admin buka kelulusan & bayaran, HR dan semua staf lain hanya claim, buang role approver/finance/hr; (3) ClaimReport dipakai Strategic Planning (department baharu `STRATEGIC`); (4) kebanyakan staf guna Gmail peribadi, jadi login ikut allowlist emel dalam VP-Access, bukan sekatan domain. Q-01, Q-03, Q-06, Q-07 dijawab; tambah Q-12, Q-13 |
| 19/11/2026 | Versi 1.2. Jawapan pemilik: Admin ClaimPro ikut designation (HR, Strategic Planner); bayaran direkod staf sendiri, bukan Admin; Voltrack Operation = manager PSS & OMP, Claim = HR, LOD = HR & Account (department `ACCOUNT` baharu, R-14); Workspace berbayar ada, akaun untuk pengurusan & engineer sahaja, technician guna Gmail; akaun sistem `systems@voltake.com`. Role default kini boleh ikut department + jawatan. Q-01, Q-03, Q-07, Q-08 ditutup; tambah Q-14, Q-15, Q-16 |
| 19/11/2026 | Versi 1.3. Reka bentuk akses dipermudah atas permintaan pemilik: buang peraturan role automatik (`DeptDefaults`, `AppRoles` mod tambah/ganti/nafi). Ganti dengan satu tab `UserAccess` yang Admin isi manual ikut designation + `AccessChangeLog`. HR buat pindahan wang claim; claim staf HR diluluskan Head of Strategic Planner. Q-14, Q-15, Q-16 ditutup |
| 19/11/2026 | Fasa 2A (Cost Calculator): role `user` costcalc ditambah untuk OMP (sebelum ni Commercial & PSS sahaja), disahkan pemilik. Ringkasan gambar tambah baris MARGIN % (BSD 3.3 dah ada `margin_peratus`). |
| 20/11/2026 | Fasa 2B (ClaimPro): tambah tab `Settings` dan lajur `staff_id`, `submitted_at`, `approved_by_name`, `peringatan_at` pada Claims; skrin pengurusan jenis tuntutan (admin) di bawah Laporan; peringatan emel berulang setiap 7 hari selepas 14 hari. Senarai jenis tuntutan awal (Perjalanan, Makan, Perubatan, Penginapan, Lain-lain) ialah cadangan BSD, bukan dari sistem lama: admin sahkan di portal. |
| 20/11/2026 | Jawapan pemilik: pelulus ClaimPro ialah Admin HR dan Head of HR (bukan lagi Head of Strategic Planner). Hanya Head of HR boleh lulus tuntutan sendiri. Role baharu `ketua` (Head of HR); tuntutan staf HR hanya diluluskan `ketua`. Sistem tak membaca designation. |
| 20/11/2026 | Arahan pemilik: sentiasa rujuk sistem lama (9 repo, `docs/rujukan-sistem-lama.md`). ClaimPro diselaraskan dengan sistem lama: had perubatan RM350 setahun, had makan ikut sesi x pax, pax wajib 1-100, maksimum RM50,000, sehingga 10 resit 10MB, nama jenis "Makan & Minum" + Keraian. Admin HR / Head of HR rekod **bukti bayaran syarikat** (wajib fail, satu bukti untuk beberapa tuntutan staf yang sama, separa dibenarkan), sama ada semasa Lulus atau kemudian; staf masih sahkan terima. |
| 20/11/2026 | Keputusan pemilik (ikut sistem lama, "kadang staf tersilap"): (1) staf boleh betulkan/padam tuntutan sendiri selagi belum diluluskan, termasuk Dihantar dan Ditolak (hantar semula); (2) Admin HR / Head of HR boleh ubah/padam tuntutan staf pada apa-apa status, tertakluk peraturan pelulus, sebab wajib, direkod dalam sejarah + AuditLog dan staf diemel; tuntutan sendiri tetap ikut peraturan pemilik; (3) Laporan PDF untuk pengurusan atasan (ringkasan + satu halaman setiap staf, format sistem lama) dan ringkasan ikut staf. |
