# Rujukan sistem lama

Arahan pemilik (20/11/2026): **sentiasa rujuk bagaimana sistem lama dibuat** sebelum membina setiap modul. Repo lama dibaca sahaja (tiada kod atau data lama disalin ke repo ini, termasuk Spreadsheet ID dan kadar yang ditulis terus dalam kod lama).

| Modul baharu | Repo lama |
|---|---|
| Mohon Kerja (`hr`) | `Ruzhad9494/draftmohonkerja` |
| Cost Calculator (`costcalc`) | `voltake-energy/costcalculator` |
| GWR OMP (`gwr`) | `voltake-energy/gwrompnew` |
| GWR PSS (`gwr`) | `Ruzhad9494/gwrpss` |
| AMS (`ams`) | `voltake-energy/AMS` |
| ClaimPro (`claimpro`) | `voltake-energy/claimpro` |
| Compliance Track (`compliance`) | `voltake-energy/Compliance-Track` |
| ClaimReport (`claimreport`) | `gcc-voltake/claimreport` |
| Voltrack (`voltrack`) | `voltake-energy/Voltrack` |

---

## ClaimPro: lama vs baharu

Sumber: `voltake-energy/claimpro` (`Appscript/Code.gs`, `index.html`), dibaca 20/11/2026.

### Peraturan yang DIBAWA sama

| Peraturan lama | Dalam sistem baharu |
|---|---|
| 6 jenis: Perjalanan, Makan & Minum, Keraian, Penginapan, Perubatan, Lain-lain | Seed `ClaimTypes` sama nama & susunan. Admin boleh ubah di portal |
| Had perubatan **RM350 setahun** setiap staf (ikut tahun tarikh) | `ClaimTypes.had_tahunan_rm` = 350 untuk Perubatan. Baki dipapar kepada staf |
| Makan & Minum: pilih sesi Siang / Malam; had **RM10 / RM15 / RM25** (kedua-dua) x pax | `ClaimTypes.guna_sesi_makan`; kadar dalam tab `Settings` (`kadar_makan_*`) |
| Pax wajib, nombor bulat 1-100 | Sama |
| Jumlah maksimum RM50,000 | Sama |
| Sekurang-kurangnya satu resit semasa hantar | Sama (boleh dimatikan per jenis oleh admin) |
| Sehingga 10 fail setiap tuntutan, 10MB sefail; PDF, PNG, JPG, HEIC, WEBP | Sama. Jenis fail disahkan dari isi fail, bukan nama |
| Admin rekod bayaran dengan **bukti wajib**; satu bukti untuk beberapa tuntutan seorang staf; jumlah boleh kurang (Separa Dibayar), tak boleh lebih | `recordPayment`: sama. Skrin Laporan > Belum dibayar dikumpul ikut staf |
| Simpan rekod 7 tahun (LHDN) | Arkib ke `Archive_YYYY` selepas 24 bulan; simpan 7 tahun (BSD 8) |

### Perbezaan yang DISENGAJAKAN (keputusan pemilik dalam PRD)

| Lama | Baharu | Sebab |
|---|---|---|
| Login kata laluan + sesi dalam Sheet | Google SSO + allowlist | TRD 5 |
| Tiada langkah kelulusan: Menunggu terus ke Dibayar | Dihantar → **Lulus/Ditolak** → Dibayar | PRD Q-03 |
| Admin tanda "Telah Dibayar" | Admin rekod bukti bayaran; **staf sendiri** sahkan terima (Dibayar) | Asingan tugas, PRD v1.2 |
| Status "Separa Dibayar" | Status kekal Lulus dengan tanda "Separa"; bila staf sahkan, beza bayaran ditanda | Staf sahkan jumlah sebenar |
| Satu role admin (designation "Admin") | `admin` (Admin HR) dan `ketua` (Head of HR); admin tak boleh lulus tuntutan sendiri/staf HR | Keputusan pemilik 20/11/2026 |
| ID `CLM-yyMMdd-HHmm-NAMA` | `CLM-YYYY-NNNNN` | BSD 1 (tiada nama dalam ID) |
| Fail dalam folder ikut nama staf, pautan URL dalam Sheet | Folder `Receipts/YYYY-MM`, ID fail sahaja, dibuka melalui portal dengan semakan akses | TRD 6 Drive |

### Diputuskan pemilik 20/11/2026: ikut cara lama

| Lama | Baharu | Kawalan tambahan |
|---|---|---|
| Staf boleh **ubah/padam** tuntutan sendiri selagi belum dibayar | Staf boleh betulkan/padam selagi **belum diluluskan** (Draf, Dihantar, Ditolak). Ditolak boleh dibetulkan dan dihantar semula | Dikunci selepas Lulus (kelulusan dah berlaku). Setiap pembetulan direkod dalam sejarah dengan nilai lama → baharu |
| Admin boleh ubah dan padam **mana-mana** tuntutan | Admin HR / Head of HR boleh ubah dan padam tuntutan staf pada apa-apa status | Sebab wajib; staf diemel; status dan identiti staf kekal; padam lembut dan resit disimpan sebagai bukti; ikut peraturan pelulus (Admin HR tak boleh untuk staf HR); tuntutan **sendiri** ikut peraturan staf biasa |
| Eksport **PDF** (semua & setiap staf), ringkasan ikut staf, penapis tarikh | Laporan > **PDF untuk pengurusan** (halaman ringkasan + satu halaman setiap staf, lajur sama: ID / Tarikh, Tujuan / Kategori, Kasar, Dibayar, Baki, Status) dan butang PDF setiap staf; penapis Dari/Hingga | jsPDF 2.5.1 + autoTable 3.5.28 (versi sama sistem lama) dihos sendiri; tiada emel staf dalam PDF; tanda SULIT |

### Tambahan dalam sistem baharu

| Lama | Baharu |
|---|---|
| Peringatan tiada | Emel peringatan 14 hari, laporan beza bayaran bulanan (BSD) |
