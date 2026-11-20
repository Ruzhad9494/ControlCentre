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

---

## AMS: lama vs baharu

Sumber: `voltake-energy/AMS` (`Appscript/Code.gs`, `index.html`), dibaca 20/11/2026.

### Peraturan yang DIBAWA sama

| Sistem lama | Dalam sistem baharu |
|---|---|
| Role ikut designation: Admin (semua + sahkan pulang), Auditor (audit, tiada tambah aset / kalibrasi), lain-lain (lihat + mobiliti) | Role `admin`, `auditor`, `staff` di Admin > Akses modul |
| Papan pemuka: Jumlah, Masih Aktif, Hampir Luput, Telah Luput; audit bulan ini (Baik / Rosak / Hilang / belum); Tersedia / Dipinjam; kad lokasi; senarai tindakan kalibrasi | Sama. Klik KPI / lokasi menapis senarai aset |
| Status kalibrasi: Telah Luput (< 0), Lagi Seminggu (≤ 7 hari), Lagi Sebulan (≤ 30), Masih Aktif, Tiada Data | Sama (30 hari boleh diubah dalam Settings) |
| Lokasi dinormalkan (huruf besar, buang "(...)" dan tarikh di hujung) | Sama (`normLoc_`) untuk kumpulan lokasi |
| Senarai aset: carian + penapis status kalibrasi / lokasi / pinjaman; CSV `Senarai_Aset_YYYYMMDD.csv` dengan lajur sama | Sama |
| Tambah/ubah aset (Category, Location, Make, Model, Serial No wajib; sijil PDF; gambar) | Sama; tarikh luput boleh kosong (aset tanpa kalibrasi). No. siri mesti unik (kecuali N/A) |
| Kalibrasi semula: tarikh kalibrasi, tarikh luput, oleh siapa, sijil wajib; tambah ke CALIBRATION LOG | Sama, ke tab `CalibrationLog` |
| Audit bulanan: tab Belum / Selesai, kemajuan X / Y (%), Baik satu tekan, Rosak/Hilang wajib catatan + gambar pilihan, tapis Baik / Rosak@Hilang | Sama |
| Mobiliti: troli beberapa aset, nama peminjam dari login, projek, lokasi, tempoh, keadaan (Baik / Ada kerosakan sedikit) | Sama; tempoh dalam **hari** (lama: teks bebas) supaya pinjaman lewat boleh dikesan |
| Pulang: tarikh, keadaan Baik / Rosak, Rosak = catatan + gambar wajib → "Menunggu Pengesahan" | Sama |
| Admin sahkan: kondisi akhir (Baik / Rosak / Hilang Komponen), lokasi akhir → Tersedia, pemegang dikosongkan | Sama |

### Perbezaan yang DISENGAJAKAN

| Lama | Baharu | Sebab |
|---|---|---|
| Login ID + kata laluan dari tab `ID PASSWORD` (CSV awam) | Google SSO; tab password **tiada** | TRD 5, PRD R-AMS |
| Data dibaca dari CSV "Publish to web" | Data melalui Apps Script dengan semakan role | TRD 6 |
| Pautan Drive fail disimpan dalam Sheet | ID fail sahaja, dibuka melalui portal | TRD 6 |
| Peminjam dikenal pasti ikut **nama** | Ikut emel sesi; hanya peminjam boleh pulangkan | Elak salah orang / nama sama |
| Audit timpa lajur MASTERLIST | Setiap audit disimpan (`Audits`) + MASTERLIST simpan terkini | Jejak audit (PRD F-42) |
| Tiada sekatan pinjam aset luput kalibrasi | Disekat (boleh dimatikan: `sekat_pinjam_luput`) | PRD F-41 "tiada alat luput digunakan" |
| Tiada emel | Emel admin bila ada pemulangan; laporan Isnin (kalibrasi, pemulangan menunggu, pinjaman lewat); peringatan peminjam lewat | AFD 7 |
| Admin hanya boleh sahkan bila staf dah tekan pulang | Admin juga boleh "Terima terus" aset yang masih Dipinjam | Pulang tangan ke tangan dan pinjaman dari sistem lama |
| Profil (tukar kata laluan, gambar profil) | Tiada (akaun Google) | SSO |

