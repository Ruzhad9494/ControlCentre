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

---

## Compliance Track: lama vs baharu

Sumber: `voltake-energy/Compliance-Track` ("UniTrack": `apps-script/Code.gs`, `Setup.gs`, `index.html`, `dashboard/`, `senarai/`), dibaca 20/11/2026.

### Peraturan yang DIBAWA sama

| Sistem lama | Dalam sistem baharu |
|---|---|
| 4 tab: Kereta, Motosikal, Chargeman, Cert | `Vehicles` (jenis Kereta / Motosikal), `Chargeman`, `Staff` + `StaffCerts` |
| Status: Tamat (n hari lepas) / Hampir Tamat (≤ ambang) / Sah / Tiada Tarikh; ambang 30 / 60 / 90 (lalai 60) | Sama (pilihan ambang diingat dalam pelayar; lalai server dalam Settings) |
| Dashboard: Jumlah, Tamat, Hampir Tamat, Sah, kadar pematuhan, kad ikut kategori, senarai segera 10 teratas | Sama |
| Jadual setiap kategori: carian, penapis status, CSV, kongsi WhatsApp (teks "PERINGATAN PEMATUHAN & PEMBAHARUAN") | Sama |
| Sijil staf: CIDB, NIOSH (NTSP), Working at Height, First Aid; tarikh + fail setiap satu | Sama, format panjang |
| Staf kemas kini tarikh & fail sijil sendiri; tarikh kosong tidak menimpa tarikh sedia ada | Sama |
| Staf hantar IC (no. + gambar depan & belakang) dengan persetujuan v1-2026-11; tak boleh ubah sendiri selepas hantar | Sama (teks persetujuan sama) |
| Senarai Kerja: tajuk "DETAILS OF WORKING PERSONNEL FOR … WORKS AT …", kepala syarikat, jadual (No, Name, Designation, CIDB Expired Date, IC No, Cert No), satu muka setiap staf dengan IC bertanda "FOR OFFICIAL SITE WORK ONLY" + lampiran sijil; amaran sijil tamat / IC tiada; log ke Job_Log | Sama; cetak / simpan PDF melalui pelayar (A4) |
| Padam diarkib dahulu (Deleted_Rows) | Padam lembut dengan sebab |
| IC / NRIC ditapis daripada respons awam | IC hanya ke hr_admin / pss; staf lihat versi bertopeng |

### Perbezaan yang DISENGAJAKAN

| Lama | Baharu | Sebab |
|---|---|---|
| Satu PIN admin dikongsi (lalai `admin123`) | Role `hr_admin` / `pss` ikut login Google | PRD R-Compliance, TRD 5 |
| Staf kemas kini sijil dengan **menaip Staff ID** (sesiapa boleh ubah sijil orang lain) | Staff ID dari sesi | PRD F-62 "staf tak boleh ubah sijil orang lain" |
| Data dibaca melalui `getAllData` tanpa login | Melalui Apps Script dengan semakan role | TRD 6 |
| Fail Drive dikongsi "ANYONE_WITH_LINK"; gambar dimuat dari pautan Drive awam | Fail peribadi, dihidang melalui portal; IC dalam folder `IC` berasingan | TRD 6, PDPA |
| Senarai Kerja: editor gambar (gerak, zum, potong, palang boleh laras) | Gambar dimuat automatik muat kotak; tanda air tetap di tengah setiap sisi IC | Ringkas; editor boleh ditambah jika HR/PSS perlukan |
| Logo dibenam dalam dokumen | Teks "VOLTAKE" + nama & alamat syarikat dari Settings | Tiada fail logo rasmi dalam repo |
| Tiada emel | Laporan Isnin (30 / 60 / 90 hari) kepada HR/PSS + peringatan kepada staf yang sijilnya tamat / ≤ 30 hari | PRD F-63 |
| Backup harian ke folder Drive | Bergantung pada sejarah versi Google Sheets + padam lembut | Kurang bahagian bergerak |

---

## Draft Mohon Kerja: lama vs baharu

Sumber: `Ruzhad9494/draftmohonkerja` (`appscript/Code.gs`, `index.html`, `dashboard/`, `interview/`), dibaca 21/11/2026.

### Peraturan yang DIBAWA sama

| Sistem lama | Dalam sistem baharu |
|---|---|
| Tab Setup (Jawatan, Department), jawatan unik, urus dari dashboard | `Positions` + skrin Jawatan (tambah buka/tutup, lokasi, penerangan, tarikh tutup) |
| Borang: gambar dipotong saiz passport, jawatan dari senarai atau taip sendiri, nama, IC, telefon bimbit & rumah, emel, alamat, jantina, taraf perkahwinan | Sama (tarikh lahir dikira terus dari IC) |
| Akademik & pengalaman kerja berbilang baris (Dari, Hingga, Sekolah/Majikan, Kelulusan/Jawatan) | Sama |
| Kecemasan: nama, hubungan (Ibu, Bapa, Pasangan, Adik-Beradik, Anak, Penjaga, Lain-Lain), jenis telefon, no. | Sama |
| Soalan rekod jenayah + alasan, gaji dipohon, 2 rujukan, kebenaran semakan latar belakang, tandatangan digital | Sama |
| Status: Baru, Disaring, Temuduga Dijadualkan, Ditawarkan, Diterima, Ditolak | Sama + Tarik diri |
| HR kemas kini Department, Status, Tarikh interview, Catatan HR; kiraan tukar tarikh interview (set kali pertama tak dikira) | Sama |
| Dashboard: KPI ikut status, amaran interview dalam 7 hari, carian & penapis | Sama |
| Papan interviewer: hanya pemohon department sendiri, ditapis di server | Sama prinsip, tetapi melalui role `interviewer` + skop department |
| Pratonton borang A4 (cetak / PDF) | Borang A4 dijana dari data untuk HR (cetak / simpan PDF) |

### Perbezaan yang DISENGAJAKAN

| Lama | Baharu | Sebab |
|---|---|---|
| `SECRET_KEY` ditulis dalam HTML dashboard | Login Google + role `hr_admin` | TRD 5 |
| Pautan papan interviewer berasaskan token department (boleh dikongsi, tiada log) | Role `interviewer` dengan skop department; setiap capaian direkod | PRD F-12 |
| Interviewer nampak semua medan | IC dimask; tiada rekod jenayah, alamat, telefon, emel, rujukan, catatan HR | PDPA (BSD 3.2) |
| Gambar & PDF dikongsi "anyone with link" | Fail peribadi dalam `VP-Files/HR`, dibuka melalui portal | TRD 6 |
| PDF borang dijana di pelayar pemohon dan dimuat naik | Data berstruktur disimpan; borang A4 dijana bila HR perlukan | Data boleh ditapis; tiada PDF palsu |
| Tiada notis privasi / persetujuan | Notis Privasi Pemohon PN-HR-2026-11 + tanda persetujuan (masa & versi direkod) | PDPA, PRD F-10 |
| Tiada anti-bot | Turnstile + 10 hantaran / 10 minit / IP + medan honeypot | TRD 5 |
| No. SOCSO, No. KWSP | Tidak dikumpul (selepas tawaran) | PRD Q-09 |
| Data disimpan selamanya | Ditolak / Tarik diri dianonimkan selepas 12 bulan; HR boleh anonimkan atas permintaan | PRD F-14, Q-05 |
| Tiada markah interview | Interviewer beri markah 1-5 (5 kriteria) + cadangan | PRD F-12 |
| Tiada emel | HR dimaklumkan bila permohonan baru (no. rujukan sahaja) | Ringkas, tiada data peribadi dalam emel |

