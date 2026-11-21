# Setup Fasa 3 - Pengerasan & tutup

Fasa ini tiada modul baru. Isinya: backup automatik, audit perkongsian Drive, domain sendiri, archive repo lama dan dokumen penyelenggaraan (`docs/runbook.md`). Ikut langkah 1 hingga 6.

## Langkah 1 - Kemas kini Apps Script `access` (backup + audit)

Projek `VP-access` (production). Paste dari GitHub folder **`apps/access/gas/`**:

| Fail | Tindakan |
|---|---|
| `Setup` | Ganti seluruh isi (pasang trigger backup + kunci Settings baru) |
| `Schema` | Ganti seluruh isi (Settings `backup_report_email`) |
| `Backup` | **Fail baru**: + > Script > namakan `Backup` |

Ctrl+S, kemudian:

1. Pilih fungsi **`setupSystem`** > Run. Log mesti ada `Settings +backup_report_email`. Google mungkin minta kebenaran semula (Drive): benarkan.
2. Tab **Settings** dalam `VP-Access`: isi `backup_report_email` (contoh emel IT anda). Kosong = guna `hr_report_email`.
3. Pilih **`weeklyBackup`** > Run (uji sekali, tak perlu tunggu Ahad). Log mesti senarai 9 Sheet `(backup YYYY-MM-DD)`. Jika ada "tidak dijumpai", nama Sheet itu tak tepat (mesti `VP-CostCalc`, `VP-ClaimPro`, `VP-AMS`, `VP-Compliance`, `VP-HR`, `VP-GWR`, `VP-ClaimReport`, `VP-Voltrack`).
4. Drive: folder **`VP-Backup`** muncul sebelah `VP-Files`, dengan subfolder tarikh hari ini. Jangan Share folder ini.
5. Triggers (ikon jam): mesti ada `weeklyBackup` (Week timer, Sunday, 2am to 3am) dan `monthlyInactiveReport`.
6. Deploy > Manage deployments > Edit > Version: **New version** > Deploy. (Backup jalan dari trigger, tapi deployment baru pastikan web app dan kod sama versi.)

Backup simpan 8 minggu terakhir; yang lebih lama masuk Trash sendiri.

## Langkah 2 - Audit perkongsian Drive (IPD 3.2)

Masih dalam `VP-access`:

1. Pilih **`semakPerkongsian`** > Run > buka **Execution log**.
2. Mesti tamat dengan `OK: tiada perkongsian pautan atau individu dijumpai.`
3. Jika ada baris `[PAUTAN]` (fail "anyone with link" / seluruh domain): jalankan **`semakPerkongsianBetulkan`**. Semua perkongsian pautan ditukar ke Private. Jalankan `semakPerkongsian` semula untuk sahkan.
4. Baris `[INDIVIDU]` (Sheet/folder dikongsi terus kepada seseorang) **tidak** dibuang automatik, sebab mungkin sengaja. Buka fail itu > Share > buang orang yang tak patut. Polisi BSD: tiada fail dikongsi ke Gmail peribadi staf.
5. Jika log kata `BERHENTI: had masa 5 minit`, betulkan dahulu, kemudian jalankan semula.

Ulang setiap 3 bulan (masuk dalam jadual `docs/runbook.md` seksyen 12).

## Langkah 3 - Domain sendiri `portal.voltake.com`

Ikut `docs/runbook.md` seksyen 10. Ringkas:

1. Cloudflare Pages > `voltake-portal` > **Custom domains** > Set up a custom domain > `portal.voltake.com`.
2. Wix > Domains > `voltake.com` > DNS records > tambah **CNAME** `portal` -> `voltake-portal.pages.dev`. Jangan tukar nameserver.
3. Tunggu status **Active** (biasanya 5 hingga 30 minit, boleh sampai 24 jam).
4. Google Cloud OAuth client: tambah origin dan redirect URI baru.
5. Cloudflare Turnstile widget: tambah hostname baru.
6. Tab Settings setiap modul: `portal_url` = `https://portal.voltake.com`.
7. Uji login, emel GWR (pautan tandatangan klien) dan install PWA dari domain baru.

## Langkah 4 - Archive repo lama (IPD 3.3)

Buat **selepas** semua modul baru live dan staf dah guna sekurang-kurangnya 2 minggu tanpa masalah besar.

Untuk setiap repo: `AMS`, `Compliance-Track`, `Voltrack`, `claimpro`, `claimreport`, `costcalculator`, `draftmohonkerja`, `gwrompnew`, `gwrpss`:

1. GitHub > repo > **Settings** > General.
2. Pastikan **Visibility = Private** (Danger Zone > Change visibility jika masih Public).
3. Danger Zone > **Archive this repository** > taip nama repo > sahkan.
4. Jika repo ada GitHub Pages: Settings > Pages > **Unpublish** dahulu (archive tak matikan Pages yang sedang jalan).

Archive = read-only, boleh unarchive bila-bila. Kod lama kekal untuk rujukan (`docs/rujukan-sistem-lama.md`).

Sheet sistem lama: tukar kepada view-only (Share > semua orang Viewer) atau Protect sheet, ikut BSD 7.

## Langkah 5 - Saiz data (IPD 3.6)

`VP-access` > pilih **`laporanSaizData`** > Run. Log senarai baris setiap tab, terbesar dahulu. Ulang setiap 3 bulan. Penilaian penuh dan bila perlu pindah: `docs/penilaian-supabase.md`.

## Langkah 6 - Ujian akhir (IPD 3.1)

Senarai semak go-live:

- [ ] Login Google di domain baru (komputer, Android, iPhone)
- [ ] Setiap staf hanya nampak kad modul yang dibenarkan
- [ ] Setiap modul: buka, simpan satu rekod ujian, padam (dengan sebab)
- [ ] GWR: jana PDF final, emel sampai ke staf & klien, pautan tandatangan buka di domain baru
- [ ] ClaimPro: PDF laporan + CSV; Compliance: cetak; HR: borang 3 muka surat; ClaimReport: PDF + XLSX
- [ ] `weeklyBackup` berjaya, `semakPerkongsian` bersih
- [ ] Offboard ujian: tukar status staf ujian ke Tamat > staf itu terkeluar dalam masa 10 minit

Ujian automatik (dev): 159 unit test + e2e setiap modul lulus pada 21/11/2026.
