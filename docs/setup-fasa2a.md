# Setup Fasa 2A - Cost Calculator (production terus)

Mulai Fasa 2A, setup terus ke **production**. Tiada Sheet atau Apps Script staging. Ikut langkah 1 hingga 8 mengikut susunan.

Role (disahkan pemilik 19/11/2026): **Commercial, PSS, OMP → `user`**; **ketua Commercial → `admin`**.

---

## Langkah 1 - Merge kod ke `main` (GitHub)

Cloudflare production hanya ambil kod dari branch `main`.

1. Buka repo `Ruzhad9494/ControlCentre` di GitHub.
2. Klik banner **Compare & pull request** untuk branch `claude/compassionate-edison-ouik0h` (atau tab **Pull requests > New pull request**, base `main`, compare branch tu).
3. **Create pull request**, kemudian **Merge pull request**.
4. Cloudflare > Workers & Pages > projek > **Deployments**: tunggu deployment Production baharu jadi **Success** (1-2 minit).

## Langkah 2 - Cipta Sheet

1. Log masuk Drive sebagai `systems@voltake.com`.
2. Buka **sheets.new**. Tukar nama kepada tepat **`VP-CostCalc`**.
3. Biar kosong. Jangan Share, jangan Publish to web.
4. Salin ID dari URL: `docs.google.com/spreadsheets/d/`**ID-INI**`/edit`.

## Langkah 3 - Cipta Apps Script

1. Buka **script.google.com** > **New project**. Namakan `VP-costcalc`.
2. **Project Settings** (ikon gear) > tick **Show "appsscript.json" manifest file in editor**.
3. Kembali ke **Editor**. Fail `Code.gs`: padam isi, kemudian rename jadi `Actions`.
4. Untuk setiap fail dalam GitHub folder **`apps/costcalculator/gas/`**: buka fail > **Raw** > Ctrl+A, Ctrl+C > paste dalam editor.

| Nama dalam editor | Fail GitHub |
|---|---|
| `Actions` | `Actions.gs` |
| `Calc` | `Calc.gs` |
| `Config` | `Config.gs` |
| `Schema` | `Schema.gs` |
| `Setup` | `Setup.gs` |
| `VPAudit` | `VPAudit.gs` |
| `VPAuth` | `VPAuth.gs` |
| `VPCore` | `VPCore.gs` |
| `VPSheet` | `VPSheet.gs` |
| `appsscript.json` | `appsscript.json` (ganti seluruh isi) |

Fail baru: klik **+** di sebelah Files > **Script**, taip nama tanpa `.gs`. Tekan **Ctrl+S** selepas semua siap.

## Langkah 4 - Script Properties

**Project Settings > Script Properties > Add script property**. Tiga sahaja:

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID dari Langkah 2 |
| `MODULE_SECRET` | Rentetan rawak baharu (cara jana di bawah). Simpan untuk Langkah 6 |
| `ENV` | `prod` |

Jana `MODULE_SECRET` dalam PowerShell:

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Jangan guna semula `ACCESS_SECRET`. Setiap modul ada secret sendiri.

## Langkah 5 - Jalankan setup dan deploy

1. Dropdown fungsi di atas editor: pilih **`checkConfig`** > **Run**. Benarkan kebenaran. Log: `checkConfig OK (ENV=prod)`.
2. Pilih **`setupSystem`** > **Run**. Log: `setupSystem selesai: VP-CostCalc | Rates (baru) seed=5 | ...`
3. Buka Sheet `VP-CostCalc`: ada 4 tab (Rates, Estimates, AuditLog, _Counters). Tab Rates ada 5 baris dengan lajur `nilai_rm` **kosong**. Itu betul.
4. **Deploy > New deployment** > gear > **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. **Deploy** > salin **Web app URL** (berakhir `/exec`).

## Langkah 6 - Cloudflare env (Production)

Cloudflare > projek > **Settings > Variables and Secrets** > pastikan dropdown atas pilih **Production** > **Add**:

| Type | Name | Value |
|---|---|---|
| Secret | `GAS_URL_COSTCALC` | Web app URL dari Langkah 5 |
| Secret | `MODULE_SECRET_COSTCALC` | Sama tepat dengan `MODULE_SECRET` Langkah 4 |

Simpan. Kemudian **Deployments** > deployment Production terkini > **...** > **Retry deployment** (env baru hanya dibaca deployment baru).

## Langkah 7 - Beri akses dan isi kadar

**7a. Akses staf.** Portal > **Admin > Akses modul** > setiap staf > **Ubah akses** > bahagian **Cost Calculator**:
- Commercial, PSS, OMP: tick `user`
- Ketua Commercial: tick `admin`

Sebab: `Fasa 2A Cost Calculator`. Guna "Salin akses dari staf lain" untuk jawatan yang sama.

**7b. Isi kadar.** Ketua Commercial login > buka `https://<portal>/costcalculator/` (kad di dashboard masih "Akan datang", jadi taip URL terus) > tab **Kadar** > isi 5 kadar semasa > **Simpan kadar**.

## Langkah 8 - Uji, kemudian buka kepada semua

**Uji dengan data sebenar** (taip URL `/costcalculator/` terus):

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | Commercial masukkan 3 kes sebenar dalam sistem lama **dan** baharu, kadar sama | Jumlah kos, margin, SST, PO akhir sama tepat |
| 2 | Simpan draf | Dapat ID `EST-2026-00001` dan baris baharu dalam tab Estimates |
| 3 | Butang Gambar, Standard dan Landscape, di iPhone dan Android | Gambar jelas, boleh Share / Save to Photos |
| 4 | Simpan muktamad, cuba ubah | Borang dikunci; Duplicate cipta salinan |
| 5 | Staf PSS buka Simpanan | Tak nampak estimate Commercial |
| 6 | Staf tanpa akses buka `/costcalculator/` | Skrin "Tiada akses" |
| 7 | Ketua Commercial ubah satu kadar | Tab AuditLog ada `UPDATE_RATES` dengan nilai lama dan baru |

Estimate ujian boleh dipadam selepas itu: tab **Simpanan** > ikon X (admin sahaja, sebab wajib).

**Buka kepada semua (go-live):**

1. Sheet **`VP-Access`** > tab **Modules** > baris `costcalc` > lajur `status` tukar ke **`aktif`**. Kad di dashboard boleh ditekan dalam masa 10 minit.
2. Umum kepada Commercial, PSS, OMP.
3. Sistem lama: GitHub `voltake-energy/costcalculator` > Settings > tukar ke **Private**, kemudian **Archive**. Repo tu sekarang public dan ada kadar dalaman syarikat.

---

## Kalau ada masalah

| Gejala | Punca biasa |
|---|---|
| `checkConfig` gagal "Script Properties belum diisi" | Nama property salah eja atau ada ruang kosong |
| `setupSystem` gagal "Jangka VP-CostCalc" | Nama Sheet tak tepat, atau `SPREADSHEET_ID` Sheet lain |
| Portal papar "Modul belum dikonfigurasi" | `GAS_URL_COSTCALC` belum diisi, atau belum Retry deployment |
| Portal papar "Konfigurasi modul tidak sepadan (secret)" | `MODULE_SECRET_COSTCALC` tak sama tepat dengan Script Property `MODULE_SECRET` (semak ruang kosong di hujung) |
| "Kadar kos belum lengkap" | Ketua Commercial belum isi kesemua 5 kadar (Langkah 7b) |
