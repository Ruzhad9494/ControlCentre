# Runbook - Voltake Operations Portal

Panduan penyelenggaraan harian untuk superadmin / IT. Setiap seksyen boleh dibaca berasingan. Kemas kini terakhir 21/11/2026.

## 0. Peta sistem

| Bahagian | Di mana | Siapa urus |
|---|---|---|
| Kod | GitHub `Ruzhad9494/ControlCentre`, branch `main` = production | Dev |
| Frontend + gateway | Cloudflare Pages `voltake-portal` (auto deploy dari `main`) | Dev / IT |
| Login | Google Identity (OAuth client dalam Google Cloud) + Turnstile | IT |
| Data | 9 Google Sheet `VP-*` dalam Drive `systems@voltake.com` | Admin modul |
| Fail (gambar, PDF, resit) | Drive `VP-Files/<modul>/...`, semua Private | Sistem |
| Backup | Drive `VP-Backup/YYYY-MM-DD/`, Ahad 2 pagi, simpan 8 minggu | Sistem |
| Logik server | 9 projek Apps Script (`VP-access`, `VP-gwr`, ...) | Dev |
| Akses staf | Portal > **Admin** (superadmin; HR admin untuk status staf) | Superadmin / HR |

Rahsia (secret) **hanya** dalam Cloudflare (Settings > Variables and Secrets) dan Script Properties Apps Script. Tiada dalam GitHub.

## 1. Onboard staf baru

1. Dapatkan dari HR: no. pekerja, nama penuh, department, jawatan, tarikh mula, dan **emel Google** yang staf akan guna (akaun @voltake.com, atau Gmail peribadi jika tiada akaun syarikat).
2. Portal > Admin > **Senarai Staf** > **Tambah staf**. Jenis emel: Auto (ikut emel).
3. Tab **Akses modul**: pilih staf > beri role ikut jawatan. Cara cepat: **Salin akses dari staf lain** (staf jawatan sama) > semak > isi **Sebab perubahan** > **Simpan akses**.
4. Hantar kepada staf: alamat portal + panduan install (`/install/`). Kali pertama login, akaun Google diikat kepada rekod staf (status "Terikat").
5. Jika staf kata "Tiada akses": semak emel yang dia guna untuk login sama tepat dengan rekod (huruf besar/kecil tak penting, titik dalam Gmail penting).

## 2. Offboard staf (berhenti)

Buat pada hari terakhir staf, bukan sebelum.

1. Admin > Senarai Staf > staf > Status **Tamat (berhenti)** > isi **Tarikh tamat** > Simpan. HR admin pun boleh buat langkah ini.
2. Sesi staf tamat sendiri (token_version naik). Dia terkeluar pada request seterusnya, paling lama 10 minit.
3. Semak modul yang staf ni pegang tugas: tuntutan ClaimPro belum lulus, GWR draf, aset AMS di bawah nama dia. Pindah atau tutup.
4. Akaun @voltake.com: suspend di Google Admin console (asing dari portal). Gmail peribadi: tiada tindakan, sebab tiada fail dikongsi terus kepada Gmail staf.
5. Rekod staf **jangan dipadam**. Nama & no. pekerja perlu untuk sejarah tuntutan / GWR. Emel dianonimkan selepas 12 bulan (BSD 8).

**Gantung sementara** (siasatan, cuti panjang): Status **Gantung**. Kembalikan ke **Aktif** bila selesai; akses modul kekal.

## 3. Tukar emel / akaun Google hilang

Risiko utama: orang lain menyamar untuk ambil alih akaun staf. **Sahkan identiti dahulu**:

1. Permintaan mesti datang dari staf sendiri, disahkan oleh **manager** atau HR (bukan sekadar mesej WhatsApp dari nombor tak dikenali).
2. Sahkan sekurang-kurangnya dua: no. pekerja, 4 digit akhir IC (semak dengan HR), panggilan video / bersemuka, emel dari akaun lama (jika masih ada).
3. Catat dalam **Sebab**: siapa minta, siapa sahkan, cara sahkan. Contoh: `Gmail lama digodam. Diminta Ali 21/11, disahkan Manager OMP (video call) + IC 4 digit.`

Kemudian:

| Situasi | Tindakan (superadmin) |
|---|---|
| Emel sama, akaun Google baru (contoh buat semula Gmail sama nama tak mungkin, tapi akaun @voltake.com dicipta semula) | Senarai Staf > staf > **Reset akaun Google**. Login seterusnya ikat akaun baru |
| Emel berubah (Gmail baru) | Kemaskini medan **Emel akaun Google** > Simpan. Akses modul dipindah sendiri; sesi lama tamat; staf login dengan emel baru |
| Telefon hilang / dicuri | **Paksa log keluar** (semua peranti). Minta staf tukar password Google |

**Had diketahui:** rekod lama dalam modul (tuntutan ClaimPro, GWR) disimpan ikut emel. Selepas tukar emel, staf tak nampak rekod lama dalam "Tuntutan saya"; admin modul masih nampak semua. Jika perlu dipindah, minta dev jalankan skrip tukar emel modul berkenaan.

## 4. Tambah / tukar akses modul

Admin > **Akses modul**. Setiap baris = satu staf + satu modul + role.

- **Skop (pilihan)**: hadkan ikut department, contoh `dept=PSS`. Kosong = ikut department staf.
- **Akses hingga (pilihan)**: akses sementara (contoh staf ganti cuti). Tamat sendiri pada tarikh itu.
- Setiap perubahan direkod dalam **Perubahan akses** (siapa, bila, lama > baru, sebab).
- Role `superadmin` (portal): sekurang-kurangnya 2 orang supaya tak terkunci; sistem tak benarkan superadmin terakhir dibuang.

Buka / tutup modul untuk semua orang: tab **Modules** dalam Sheet `VP-Access`, lajur `status` = `aktif` / `maintenance` / `belum_live`. Kesan dalam 10 minit.

## 5. Kemas kini kod Apps Script

Bila dev beritahu ada perubahan dalam folder `apps/<modul>/gas/`:

1. Buka projek Apps Script modul itu.
2. Untuk setiap fail yang disebut: GitHub > fail > **Raw** > Ctrl+A, Ctrl+C > paste ganti seluruh isi. Fail baru: + > Script > nama tanpa `.gs`.
3. Ctrl+S. Jalankan **`setupSystem`** jika diminta (selamat dijalankan berulang kali).
4. **Deploy > Manage deployments > Edit (pensel) > Version: New version > Deploy.** Tanpa langkah ini web app masih guna kod lama.
5. URL web app **tidak berubah** bila edit deployment sedia ada. Jangan buat "New deployment" (URL baru, perlu tukar env Cloudflare).

## 6. Kemas kini env Cloudflare

Cloudflare Pages > `voltake-portal` > Settings > **Variables and Secrets** > Production.

Env **hanya dibaca oleh deployment baru**. Selepas ubah: Deployments > deployment Production terakhir > ... > **Retry deployment** (atau push apa-apa ke `main`). Ralat "Modul belum dikonfigurasi: X tiada dalam deployment ini" = env belum masuk deployment.

## 7. Rotate secret

Bila: staf IT berhenti, secret terdedah (screenshot, chat), atau setiap 12 bulan.

Jana nilai baru (minimum 32 aksara): `openssl rand -base64 48`, atau password manager (64 aksara rawak).

| Secret | Tukar di | Kesan |
|---|---|---|
| `SESSION_SECRET` | Cloudflare sahaja | **Semua staf log keluar**, login semula. Buat luar waktu kerja |
| `ACCESS_SECRET` | Cloudflare **dan** Script Properties `VP-access` | Portal gagal antara dua langkah. Buat serentak |
| `MODULE_SECRET_<MODUL>` | Cloudflare **dan** Script Properties `MODULE_SECRET` modul itu | Modul itu sahaja gagal sementara |
| `TURNSTILE_SECRET` | Turnstile > widget > Rotate secret, kemudian Cloudflare env | Login gagal sementara |

Langkah untuk secret berpasangan (contoh GWR):

1. Script Properties `VP-gwr` > `MODULE_SECRET` = nilai baru > Save. (Tiada deployment baru diperlukan untuk Script Properties.)
2. Cloudflare env `MODULE_SECRET_GWR` = nilai sama > Save > Retry deployment.
3. Tunggu deployment Success (1 hingga 2 minit). Buka GWR dan uji.

Jangan hantar secret melalui WhatsApp/emel. Taip terus ke dua tempat.

## 8. Backup & pulih

Backup automatik: Ahad 2:00 pagi, projek `VP-access` fungsi `weeklyBackup`. Salinan dalam `VP-Backup/YYYY-MM-DD/`, 8 minggu. Emel ke `backup_report_email` jika ada masalah. Fail Drive (gambar, PDF) **tidak** dibackup oleh fungsi ini; ia tinggal dalam `VP-Files` dan Trash Drive simpan 30 hari.

Backup manual (sebelum import besar / perubahan berisiko): `VP-access` > `weeklyBackup` > Run.

### Pulih satu baris / tab (paling biasa)

1. Buka salinan dalam `VP-Backup/<tarikh>/`.
2. Cari baris yang betul > salin > paste ke Sheet sebenar (baris sama). Jangan ubah header.
3. Catat dalam `AuditLog` modul: `Pulih dari backup <tarikh>: <apa>`.

Sebelum pulih, cuba **Version history** Sheet sebenar dahulu (File > Version history): lebih tepat kepada minit, dan tak perlu salin.

### Pulih seluruh Sheet (Sheet rosak / terpadam)

1. Trash Drive dahulu: jika Sheet sebenar terpadam < 30 hari, **Restore** dari Trash. Selesai.
2. Jika tidak: `VP-Backup/<tarikh>/` > salinan > File > **Make a copy** > namakan tepat nama asal (contoh `VP-GWR`) > simpan dalam folder asal.
3. Namakan Sheet rosak `VP-GWR-ROSAK-<tarikh>` (jangan padam lagi).
4. Projek Apps Script modul > Script Properties > `SPREADSHEET_ID` = ID Sheet baru.
5. Jalankan `setupSystem` (semak struktur; tak sentuh data sedia ada).
6. Uji modul. Data selepas tarikh backup hilang: minta staf masukkan semula, atau salin dari Sheet rosak jika boleh dibaca.

## 9. Audit perkongsian Drive

Setiap 3 bulan, atau selepas sesiapa sentuh Drive secara manual: `VP-access` > `semakPerkongsian` > Run. Butiran tafsiran log: `docs/setup-fasa3.md` langkah 2.

## 10. Domain sendiri (`portal.voltake.com`)

DNS `voltake.com` diurus oleh Wix (laman web syarikat). Portal guna **subdomain** sahaja, jadi laman Wix tak terjejas. **Jangan tukar nameserver ke Cloudflare**; itu akan pindah seluruh DNS dan boleh matikan laman Wix dan emel.

1. **Cloudflare**: Pages > `voltake-portal` > Custom domains > **Set up a custom domain** > `portal.voltake.com` > Continue. Cloudflare papar rekod CNAME yang perlu ditambah.
2. **Wix**: Dashboard > Domains > `voltake.com` > ... > **Manage DNS Records** (atau DNS Records / Advanced). Bahagian **CNAME** > Add record:
   - Host: `portal`
   - Value / Points to: `voltake-portal.pages.dev`
   - TTL: lalai
   Jangan sentuh rekod A, MX atau TXT sedia ada.
3. Cloudflare semak sendiri. Status **Active** + SSL dalam 5 hingga 30 minit (DNS boleh ambil sampai 24 jam). Jika tersekat "Verifying", semak tiada rekod **CAA** dalam Wix yang hadkan pengeluar SSL; jika ada, tambah CAA `0 issue "letsencrypt.org"` dan `0 issue "pki.goog"`.
4. **Google Cloud** > APIs & Services > Credentials > OAuth client portal:
   - Authorized JavaScript origins: tambah `https://portal.voltake.com`
   - Authorized redirect URIs: tambah `https://portal.voltake.com/auth/google`
   Kekalkan URL `pages.dev` semasa peralihan.
5. **Cloudflare Turnstile** > widget login > Hostname management > tambah `portal.voltake.com`.
6. Sheet setiap modul, tab **Settings**: `portal_url` = `https://portal.voltake.com` (AMS, ClaimPro, Compliance, HR, GWR, Voltrack). GWR guna nilai ini untuk pautan tandatangan klien.
7. Uji: login, buka setiap modul, hantar satu GWR ujian ke emel sendiri dan buka pautan tandatangan.
8. Beritahu staf: buka alamat baru, **install semula** app (app lama dari `pages.dev` dikira laman berbeza; padam yang lama), login sekali lagi.

Selepas semua staf pindah (2 hingga 4 minggu), boleh buang origin `pages.dev` dari OAuth jika mahu. Alamat `pages.dev` tetap wujud; ia hanya tak dihebahkan.

Bonus domain sendiri: cache Cloudflare (akses staf, sesi) **hanya berfungsi di domain sendiri**, bukan `*.pages.dev`. Portal jadi lebih laju dan beban Apps Script `access` turun.

## 11. Tambah modul baru (dev)

1. `config/modules.json` + `functions/_lib/modules.js`: daftar `module_id`, nama env (`GAS_URL_X`, `MODULE_SECRET_X`). Ujian `tools/test` pastikan dua fail ini sepadan.
2. `apps/access/gas/Schema.gs` `MODULE_SEED`: nama, path, ikon, subtajuk, `roles_sah`.
3. `apps/<dir>/gas/`: ikut corak modul sedia ada (Config, Schema, Setup, Actions + `ACTION_ROLES`, fail VP* dari `tools/sync-shared-gas.sh`).
4. `apps/<dir>/web/`: guna `shared/ui` (header, nav, footer, tema).
5. Uji (`node --test tools/test/*.test.js tools/test/*.test.mjs`) > push `main`.
6. Pemilik: cipta Sheet `VP-<Nama>` + projek Apps Script, Script Properties, `setupSystem`, Deploy web app (Execute as: Me, Who has access: Anyone), isi env Cloudflare, Retry deployment.
7. `VP-access` > `syncModuleMeta` > Run. Tukar status modul ke `aktif` dalam tab Modules. Beri akses staf.

## 12. Jadual berkala

| Bila | Tugas |
|---|---|
| Setiap Isnin | Semak emel backup (tiada emel = backup OK). Sekali-sekala buka `VP-Backup` dan pastikan folder Ahad wujud |
| Setiap 1hb (automatik) | Laporan staf aktif tak login > 60 hari ke HR. HR sahkan masih bekerja atau tukar ke Tamat |
| Setiap 3 bulan | `semakPerkongsian`, `laporanSaizData`, semak senarai superadmin & role `admin` modul |
| Setiap 12 bulan | Rotate secret (seksyen 7). Semak notis privasi masih tepat |
| Harian 2 pagi (automatik) | ClaimPro pindah tuntutan Dibayar > 24 bulan ke tab `Archive_<tahun>` (BSD 8). Tiada tindakan, cuma tahu di mana rekod lama berada |

## 13. Masalah biasa

| Simptom | Punca biasa | Tindakan |
|---|---|---|
| "Modul belum dikonfigurasi: X tiada dalam deployment ini" | Env Cloudflare baru diisi tapi belum ada deployment baru | Seksyen 6: Retry deployment |
| Modul ralat 502 / "Apps Script tidak bertindak balas" | Deployment Apps Script belum New version, atau kod belum di-paste lengkap | Seksyen 5 langkah 4. Buka Executions dalam Apps Script untuk lihat ralat sebenar |
| Ralat tandatangan / 401 dari modul | Secret Cloudflare dan Script Properties tak sama | Seksyen 7: taip semula kedua-duanya |
| "Service invoked too many times" | Had 30 execution serentak Apps Script | Jika berulang > sekali seminggu: rujuk `docs/penilaian-supabase.md` |
| Staf "Tiada akses" walaupun baru ditambah | Emel tak sama / cache 10 minit | Semak ejaan emel; tunggu 10 minit atau minta staf log keluar & masuk |
| Favicon / logo lama dalam app terpasang | Cache PWA | Padam app, install semula |
| GWR PDF kosong / susun atur lari | Penukar PDF Google | `VP-gwr` > `ujiPdf` > Run, buka PDF dalam Drive; hantar screenshot kepada dev |
| Backup emel "tidak dijumpai" | Nama Sheet berubah | Namakan semula tepat `VP-<Modul>` |
