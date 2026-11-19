# Setup Fasa 2A - Cost Calculator

Kod modul dah ada dalam repo (`apps/costcalculator/`). Langkah di bawah dibuat manual. **Staging dahulu**, kemudian ulang untuk production.

Role (disahkan pemilik 19/11/2026): **Commercial, PSS, OMP → `user`**; **ketua Commercial → `admin`**.

## A. Sheet

Log masuk Drive sebagai `systems@voltake.com`. Cipta Google Sheet kosong bernama tepat **`VP-STG-CostCalc`** (production: `VP-CostCalc`). Jangan kongsi, jangan Publish to web. Salin ID dari URL.

## B. Apps Script `VP-STG-costcalc`

1. script.google.com > **New project**, namakan `VP-STG-costcalc`.
2. Buang `Code.gs`. Dari GitHub folder `apps/costcalculator/gas/`, cipta fail dan paste isi (butang Raw):

   `Actions`, `Calc`, `Config`, `Schema`, `Setup`, `VPAudit`, `VPAuth`, `VPCore`, `VPSheet`, dan `appsscript.json` (Project Settings > tick "Show appsscript.json").

3. **Project Settings > Script Properties**:

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID Sheet dari langkah A |
| `MODULE_SECRET` | Rentetan rawak baharu, minimum 32 aksara (PowerShell: lihat bawah). **Berbeza** dari `ACCESS_SECRET` |
| `ENV` | `staging` (production: `prod`) |

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

4. Run `checkConfig` (benarkan kebenaran), kemudian `setupSystem`. Log: `setupSystem selesai: VP-STG-CostCalc | Rates (baru) seed=5 | Estimates (baru) | AuditLog (baru) | _Counters (baru)`.
5. Semak tab `Rates`: 5 baris, lajur `nilai_rm` **kosong**. Itu betul: kadar diisi di portal (langkah E), bukan dalam kod.
6. **Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone**. Salin Web app URL.

## C. Cloudflare

Pages > Settings > Variables and Secrets. Isi **Preview** (staging) dan **Production** (production) berasingan, jenis Secret:

| Nama | Nilai |
|---|---|
| `GAS_URL_COSTCALC` | Web app URL langkah B6 |
| `MODULE_SECRET_COSTCALC` | Sama tepat dengan Script Property `MODULE_SECRET` |

Deploy semula selepas ubah env.

## D. Akses staf (portal > Admin > Akses modul)

Untuk setiap staf: modul **Cost Calculator** > tick `user` (Commercial, PSS, OMP) atau `admin` (ketua Commercial). Guna "Salin akses dari staf lain" untuk jawatan sama. Sebab contoh: "Fasa 2A Cost Calculator".

Kad Cost Calculator di dashboard masih "Akan datang" sehingga go-live (langkah G). Untuk uji sebelum tu, buka terus `https://<url-portal>/costcalculator/`.

## E. Isi kadar (ketua Commercial)

Ketua Commercial login > buka `/costcalculator/` > tab **Kadar** > isi 5 kadar semasa (OT/jam, Transport/KM, Makan/hari/pax, Homestay/malam, Overnight/pax) > Simpan. Selagi kadar belum lengkap, staf boleh lihat preview tapi tak boleh simpan.

## F. Uji

| # | Ujian | Lulus bila |
|---|---|---|
| 1 | **Regresi (IPD seksyen 6):** Commercial masukkan 3 kes sebenar dalam sistem lama dan sistem baharu, dengan kadar yang sama | Jumlah mobilisasi, jumlah kos, margin, SST dan PO akhir sama tepat |
| 2 | Staf `user` simpan draf | Dapat ID `EST-YYYY-NNNNN`; baris baharu dalam tab `Estimates` |
| 3 | Gambar > Standard dan Landscape, di iPhone dan Android | Gambar jelas; iPhone boleh Share / Save to Photos |
| 4 | Simpan muktamad, kemudian cuba ubah | Borang dikunci; Duplicate cipta salinan Draf |
| 5 | Staf PSS buka Simpanan | Tak nampak estimate Commercial (dept lain) |
| 6 | Staf HR (tiada role) buka `/costcalculator/` | Skrin "Tiada akses" |
| 7 | Ketua Commercial ubah satu kadar | Tab `AuditLog` ada baris `UPDATE_RATES` dengan nilai lama → baru. Estimate lama kekal kadar asal |
| 8 | `View page source` di `/costcalculator/` | Tiada nilai kadar dalam HTML/JS |
| 9 | Sheet `VP-STG-CostCalc`: File > Share > Publish to web | Tiada yang diterbitkan |

## G. Go-live (IPD 2.x.7)

1. Ulang A hingga E untuk production (`VP-CostCalc`, `ENV=prod`, `MODULE_SECRET` production baharu).
2. Sheet **VP-Access** production, tab `Modules`: baris `costcalc`, tukar `status` ke `aktif`. Kad di dashboard boleh ditekan dalam masa 10 minit.
3. Umum kepada Commercial, PSS, OMP.
4. Sistem lama: repo `voltake-energy/costcalculator` tukar ke **private**, kemudian **Archive** (Settings > Danger Zone). Repo tu sekarang public dan mengandungi kadar dalaman syarikat.
