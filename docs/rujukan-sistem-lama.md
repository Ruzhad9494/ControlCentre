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


## GWR (OMP + PSS): lama vs baharu

Sumber: `voltake-energy/gwrompnew` dan `Ruzhad9494/gwrpss` (GWR v4.2: `Appscript/Code.gs`, `index.html`, `Approval.html`, `dashboard/`), dibaca 21/11/2026. Kod kedua-dua repo sama kecuali nama department, Sheet dan folder, jadi digabung menjadi satu modul dengan medan `dept`.

### Peraturan yang DIBAWA sama

| Sistem lama | Dalam sistem baharu |
|---|---|
| Maklumat projek: tarikh, PO, quotation, MOS, klien, tajuk projek, lokasi, PIC klien + telefon | Sama |
| Hanya manager & engineer (OMP: supervisor) isi maklumat projek; technician tak boleh | Sama (`supervisor`, `engineer`, `chargeman`, `manager`) |
| Time in / out, PTW, job description berbilang baris dengan remark + tanda SHUTDOWN LV/MV, unresolved issue | Sama |
| Manpower "Jawatan \| Pax \| Nama" (Technician, Engineer, Chargeman) | Sama (+ Supervisor), pax dikira dari nama |
| Gambar dikecilkan sebelum naik, disusun, 6 setiap muka PDF | Sama (susun dengan butang naik / turun) |
| Barisan offline IndexedDB, gambar naik 3 sekali, `clientReqId` anti-ulangan | Sama |
| Pautan klien + templat WhatsApp "Berikut merupakan Ground Work Report Form \| ..." ke wa.me/6<no> | Sama |
| Klien isi nama, jawatan, telefon, emel + tandatangan | Sama |
| Nama PDF `<Lokasi>_<Klien>_<DDMMYYYY>_<Draft\|Final>.pdf`, PDF A4: projek, pengesahan, gambar | Sama |
| Dashboard: KPI jumlah / selesai / belum / isu, senarai isu, prestasi staf | Sama |
| Report Approved dikunci | Sama (Disahkan / Dibatalkan) |

### Yang DIUBAH (dan kenapa)

| Sistem lama | Kini | Sebab |
|---|---|---|
| Identiti staf ditaip + StaffToken dalam pelayar | Dari login portal | Elak menyamar |
| Token kelulusan mentah dalam Sheet, tiada luput, boleh guna berulang | Hash SHA-256, sekali guna, luput 7 hari, Turnstile + had kadar | PRD F-32 |
| PDF draf & final dijana di pelayar (final oleh pelayar klien) | Dijana di server dari data Sheet | PDF tak boleh dipalsukan |
| Gambar & PDF "anyone with link" | Fail peribadi, dibuka melalui portal / pautan token | PDPA |
| Dua sistem berasingan (OMP, PSS) | Satu modul, skop department di server | Satu kod untuk dijaga |
| Report Pending diubah tanpa kesan | Ubah = kembali Draf, pautan lama mati | Klien tak sign versi lama |
| Tiada emel selepas lulus | PDF final dihantar ke klien, staf dan `emel_cc_<dept>` | PRD F-34 |
| Tiada pembatalan | Manager batalkan dengan sebab (rekod disimpan) | Jejak audit |

## ClaimReport (DO Generator): lama vs baharu

Sumber: `gcc-voltake/claimreport` (`Appscript/Code.gs`, `form/index.html`, `index.html`), dibaca 21/11/2026. Walaupun bernama ClaimReport, sistem ini menjana **Delivery Order Sungrow**.

### Peraturan yang DIBAWA sama

| Sistem lama | Dalam sistem baharu |
|---|---|
| Rujukan berbilang: jenis RW / RC + No + No MA (pilihan); APAC ticket berbilang (pilihan) | Sama |
| No. DO = `<RW\|RC><no>[_MA<no>]_JD` (normalizePart: huruf besar, prefix ditambah sendiri), semua No. DO dalam sel `{{DO_NO}}` satu baris setiap rujukan | Sama (akhiran `_JD` dalam Settings) |
| Nama fail `<No>. <DO No utama>`, No = max + 1 | Sama (DO lama diimport supaya nombor bersambung) |
| DO No utama mesti unik | Sama |
| Total carton = jumlah qty ikut unit, susunan unit muncul ("2 PALLET, 10 PCS"); unit PCS, UNIT, SET, BOX, PALLET, KG | Sama |
| Medan wajib: rujukan, tarikh, From, To, signer, item (code, description, qty > 0, unit) | Sama |
| Tab Template, item mulai baris 17 (B, C, D, H, I), token `{{...}}`, `{{DATE}}` dd/mm/yyyy, eksport PDF A4 portrait fit width lajur A-J + XLSX | Sama |
| Preset From JingDong Logistics (lalai) & Koennen Technology + Custom | Sama, kini dalam tab Parties dan To juga disimpan |
| Dashboard: tapis tarikh, KPI DO / carton / truck / item, ikut tarikh, truck, destinasi, pengirim; senarai dengan carian & halaman | Sama |
| Senarai PDF "GCC <Month> <Year>", Zip PDFs `GCC <Month> <Year>.zip` | Sama |

### Yang DIUBAH (dan kenapa)

| Sistem lama | Kini | Sebab |
|---|---|---|
| Tiada login; URL Apps Script dalam HTML | Login + role `user` / `admin` | PRD F-72 |
| Dashboard baca CSV "Publish to web" | Data dibaca melalui portal | Data tidak awam |
| PDF / Excel "anyone with link" | Fail peribadi, dibuka melalui portal | TRD 6 |
| Delete: sesiapa, baris dipadam terus | Admin sahaja, padam lembut dengan sebab | Tiada rekod hilang tanpa jejak |
| Edit: belum siap (halaman sementara) | Pembuat (hari sama) atau admin; PDF/Excel dijana semula | BSD 4.2 |
| Zip melalui corsproxy.io (pihak ketiga) | Dizip di server | Fail tak melalui pihak ketiga |
| Token template diganti dengan setValues seluruh julat (formula lain jadi nilai) | Hanya sel token diganti; nilai disanitize | Template kekal, elak formula injection |
| KPI carton = parseInt "12 PCS, 3 BOX" (hanya nombor pertama) | Jumlah semua qty | Betulkan kiraan |
| Signer ditaip | Lalai nama staf login (boleh diubah) | Kurang menaip |

## Voltrack: lama vs baharu

Sumber: `Ruzhad9494/Voltrack` (VoltTrack v2: `Appscript/Code.gs`, `index.html`), dibaca 21/11/2026.

### Peraturan yang DIBAWA sama

| Sistem lama | Dalam sistem baharu |
|---|---|
| 4 tab Commercial, Operation, Claim, LOD dipaut melalui `id` `EL-YYYY-NNN` | Sama |
| `ROLE_WRITE_ACCESS`: setiap role tulis fasa sendiri, Admin semua, semua role baca semua; multi-role = gabungan | Sama (role `commercial`, `operation`, `claim`, `lod`, `admin`) |
| Pilihan: quotation Pending/Cancel/Approved; MOS/JSA/PTW Sedia/Belum/N/A; GWR & Full Report Yes/No; bayaran Pending/Paid/Outstanding; CTOS & Legal Pending/Initiated/Completed; kes Open/KIV/Closed | Sama |
| Approved → tarikh proceed hari ini; GWR / Full Report Yes → tarikh hari ini | Sama |
| status_job: Pending Start → In Progress → GWR Submitted → Completed Full Report | Sama (+ Cancelled) |
| Follow up +7/+14/+21, due +30 dari invoice date; lepas due & belum Paid → Outstanding + overdue_days; sasaran LOD reminder due+7, LOD rasmi due+14 | Sama (tempoh bayaran dalam Settings) |
| Jadual fasa: Operation = Approved, Claim = Full Report Yes, LOD = Outstanding | Sama |
| Eksekutif Dashboard: jumlah projek, nilai diluluskan, operasi aktif, tertunggak, status quotation, kesihatan pembayaran, notifikasi aktif, ringkasan klien | Sama |
| Notifikasi tindakan (tetapkan tarikh mula, PTW belum sedia, GWR dihantar, jana invoice, due dalam 7 hari, tertunggak, reminder / LOD rasmi, CTOS > 30 hari) | Sama, ditapis ikut role |
| Semakan harian tunggakan, senarai kritikal lewat 1 / 7 / 14 / > 30 hari | Sama, dihantar melalui emel |

### Yang DIUBAH (dan kenapa)

| Sistem lama | Kini | Sebab |
|---|---|---|
| Tab Users, password hash, OTP lupa password, sesi 12 jam | Login Google + Akses modul | Satu login portal |
| Role tanpa akses fasa: perubahan diabaikan senyap | Ditolak (403) | Jelas kepada pengguna |
| Medan dikira di pelayar (boleh diubah) | Dikira dan disimpan di server; trigger harian kemas kini Sheet | Data Sheet sentiasa tepat |
| "Tarikh sebenar" reminder / LOD diisi sendiri bila sasaran lepas | Tidak diisi sendiri | Surat yang belum dihantar tak tercatat sebagai dihantar |
| ID baru = bilangan projek + 1 | Nombor terbesar tahun ini + 1 | Elak ID bertindih |
| Push OneSignal ikut role (kunci REST pernah terdedah) | Emel harian ke `emel_peringatan`; push = F-07 (Tambahan Fasa 3) | Kunci tidak lagi diperlukan |
| Data ledger penghutang dalam kod (`DEBTOR_LEDGER_IMPORT`) | Tidak dibawa ke repo; import dari tab Sheet | Data penghutang bukan dalam kod |
| Padam projek: tiada | Admin sahaja, padam lembut dengan sebab | Jejak audit |
| Tiada rekod siapa ubah fasa | Nama & masa kemas kini setiap fasa + AuditLog | Akauntabiliti |
| - | `paid_date` (tarikh Paid), `gwr_report_ids` (ID report GWR, F-85) | Laporan & pautan silang |
