# Setup Fasa 1 - langkah manual

Kod Fasa 1 (portal teras) dah ada dalam repo. Langkah di bawah dibuat dalam konsol Google dan Cloudflare. Tak perlu npm atau clasp. **Buat untuk staging dahulu**, uji, baru production.

## A. Kemas kini Apps Script `VP-STG-access`

Ambil kod dari GitHub, folder `apps/access/gas/` (butang **Raw**, Ctrl+A, Ctrl+C, paste dalam editor). Fail yang sama nama: ganti seluruh isi. Fail baru: klik **+ > Script**, namakan tanpa `.gs`.

| Fail | Tindakan |
|---|---|
| `Access` | **Baru**. doPost, login, admin staf/akses/log |
| `Maintenance` | **Baru**. `syncModuleMeta`, `normalizeStaff` |
| `VPCore`, `VPAuth`, `VPSheet`, `VPAudit` | **Baru** (4 fail). Kod kongsi semua modul |
| `Config` | **Ganti**. Helper dah pindah ke `VPCore` |
| `Schema` | **Ganti**. Ikon modul ikut DBD seksyen 7 |
| `Setup` | **Ganti**. Format teks untuk `google_sub` |
| `Reports`, `appsscript.json` | Tiada perubahan |

Lepas paste semua, tekan **Save** (Ctrl+S), kemudian:

1. Run `setupSystem`. Selamat dijalankan semula: tak sentuh data sedia ada.
2. Run `syncModuleMeta`. Log patut sebut `dikemas kini hr, gwr, ams, compliance, claimreport` (ikon baru).

## B. Deploy Apps Script sebagai web app

1. Klik **Deploy > New deployment**. Ikon gear di sebelah "Select type" > **Web app**.
2. Description: `access staging v1`.
3. **Execute as: Me** (`systems@voltake.com`). **Who has access: Anyone**.
4. Klik **Deploy**, benarkan kebenaran. Salin **Web app URL** (berakhir `/exec`).

Kalau dah pernah deploy: **Deploy > Manage deployments > ikon pensel > Version: New version > Deploy**. URL kekal sama.

Kenapa "Anyone": Cloudflare bukan pengguna Google. Keselamatan datang dari tandatangan HMAC (`ACCESS_SECRET`). Permintaan tanpa tandatangan sah ditolak sebelum Sheet dibuka. URL ni jangan letak dalam chat, emel atau repo.

## C. Cloudflare env variables

Pages > projek > **Settings > Variables and Secrets**. Isi untuk **Preview** (staging). **Production** sama, cuma guna nilai production bila VP-Access production siap.

| Nama | Nilai |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID dari Google Cloud (0.5) |
| `SESSION_SECRET` | Rentetan rawak, minimum 32 aksara. Berbeza untuk Preview dan Production |
| `ACCESS_SECRET` | **Sama tepat** dengan Script Property `ACCESS_SECRET` projek Apps Script tu |
| `ACCESS_GAS_URL` | Web app URL dari langkah B |

Semua jenis **Secret**. Selepas ubah env, buat deploy semula (Deployments > ... > Retry deployment), sebab env baru hanya dibaca oleh deployment baru.

## D. Google OAuth: daftar URL yang betul

Google Cloud > APIs & Services > Credentials > OAuth client (Web).

- **Authorized JavaScript origins**: tambah URL tepat yang awak buka untuk uji, contoh `https://claude-compassionate-edison-ouik0h.<projek>.pages.dev` (URL preview dalam Cloudflare Deployments), dan `https://cc.voltake.com`.
- **Authorized redirect URIs**: origin yang sama + `/auth/google`, contoh `https://cc.voltake.com/auth/google`.

Perubahan Google boleh ambil masa 5 minit hingga beberapa jam.

## E. Uji (IPD seksyen 6, bahagian Fasa 1)

Guna URL preview. Untuk akaun ujian, tambah staf di Admin > Staf, kemudian beri akses di Admin > Akses modul.

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | Buka `/` tanpa login | Terus ke skrin Log masuk |
| 2 | Login dengan emel superadmin | Dashboard: 8 kad modul (semua "Akan datang"), More Info, Admin |
| 3 | Login dengan Gmail yang **tiada** dalam Staff | Skrin "Emel belum didaftar" dengan emel dicuba. LoginLog `tiada_staf` |
| 4 | Admin > Staf > Tambah staf (Gmail ujian), Akses modul > ClaimPro `staff` dengan sebab | Simpan berjaya. AccessChangeLog ada baris dengan sebab |
| 5 | Login dengan Gmail ujian tu | Hanya kad ClaimPro + More Info. `google_sub` terisi dalam Sheet |
| 6 | Dalam Sheet, tukar `google_sub` staf ujian kepada `123`, login semula | Skrin "Akaun tak sepadan". LoginLog `sub_tak_padan`. Kemudian Admin > Ubah > Reset akaun Google |
| 7 | Admin > Staf > ubah staf ujian ke status Tamat | Dalam ≤ 10 minit (preview: serta-merta) staf tu dibawa ke Log masuk dan tak boleh masuk |
| 8 | Tambah staf HR dengan `hr_admin` modul Draft Mohon Kerja, login sebagai HR, buka Senarai Staf | Hanya tab Staf. Hanya status, tarikh tamat, 2SV boleh diubah |
| 9 | Tambah staf dengan nama `<img src=x onerror=alert(1)>` | Nama dipapar sebagai teks, tiada popup |
| 10 | Tambah staf dengan jawatan `=HYPERLINK("http://x")`, buka Sheet | Sel bermula dengan `'` (tak jadi formula) |
| 11 | iPhone (Safari) dan Android (Chrome): login, kemudian install ikut menu > Install app | Ikon "V" Voltake di skrin utama. Buka dari ikon dan login berfungsi (iPhone perlu login sekali lagi dalam app) |
| 12 | Sheet VP-STG-Access: File > Share > Publish to web | Tiada yang diterbitkan |

Nota preview `*.pages.dev`: Cache API Cloudflare tak aktif di domain `pages.dev`. Jadi di preview, had kadar login, cache akses 10 minit dan revoke selepas log keluar **tidak berkesan** (setiap panggilan terus ke Apps Script, lebih perlahan sedikit). Semuanya aktif di `cc.voltake.com`. Ujian 7 akan nampak serta-merta di preview.

## F. Task 1.14 - CPU time

Selepas beberapa login di preview/production: Cloudflare > projek > **Metrics** (atau Workers & Pages > Observability) > lihat **CPU time** Functions. Had Workers Free 10 ms. Ukuran tempatan: login ~0.2 ms, API ~0.2 ms CPU (anggaran, bukan angka Cloudflare). Kalau median Cloudflare lebih 5 ms, rekod dan bincang Workers Paid.

## G. Task 1.15 - import senarai staf

1. Dalam tab `Staff`, tampal data dari HR mulai baris 2 di lajur: `staff_id`, `email`, `nama`, `department`, `designation` (ikut nama header). Lajur lain boleh dibiar kosong.
2. Department mesti salah satu: HR, COMMERCIAL, PSS, OMP, ADMIN, ACCOUNT, STRATEGIC, MGMT, IT.
3. Apps Script: Run `normalizeStaff`. Ia isi nilai lalai (status aktif, token_version 1, jenis_emel) dan tukar emel ke huruf kecil. Baca log: senarai "PERLU SEMAK" (emel tak sah, ID berulang) mesti dibetulkan dalam Sheet.
4. Portal > Admin > Akses modul: tetapkan akses setiap staf ikut panduan BSD 4.1. Guna "Salin akses dari staf lain" untuk jawatan yang sama.

## H. Production

Bila staging lulus semua ujian: ulang A hingga D untuk `VP-access` (Sheet `VP-Access`, `ENV=prod`, secret production yang berbeza), isi env **Production**, dan merge branch ke `main` (production branch Cloudflare).

## Kemas kini 21/11/2026: gambar profil staf

Staf boleh letak gambar profil sendiri: menu profil (bucu kanan atas) > **Gambar profil**. Gambar dipotong segi empat dan
dikecilkan ke 256px dalam pelayar, kemudian disimpan PERIBADI dalam `VP-Files/Access/Photos` (bukan "anyone with link").
Staf hanya boleh tukar / buang gambar sendiri (emel diambil dari sesi).

Dalam Apps Script `VP-access` (projek access), buat sekali:

1. Paste semula dari GitHub folder `apps/access/gas/`: **`Access`** dan **`Schema`** (berubah), dan tambah fail BARU **`Photo`** (+ > Script > namakan `Photo`). Ctrl+S.
2. Run **`setupSystem`**. Tab Staff dapat lajur baru `photo_file_id` di hujung.
3. **Deploy > Manage deployments >** pensel (Edit) **> Version: New version > Deploy**. URL `/exec` kekal sama.

Sehingga langkah ini dibuat, menu "Gambar profil" akan papar ralat dan avatar kekal huruf awal nama.
