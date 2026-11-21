# Penilaian Supabase (IPD 3.6, Q-10)

Tarikh: 21/11/2026. Dinilai semula: setiap 3 bulan, atau bila mana-mana kriteria di bawah berlaku.

## Keputusan

**Kekal dengan Google Sheets + Apps Script buat masa ini.** Tiada satu pun kriteria pindah TRD 7 dipenuhi, dan sistem baru sahaja live (belum ada data operasi sebenar untuk diukur). Pindah sekarang menambah kos (Supabase Pro sekitar USD25/bulan dari ingatan, **perlu disahkan**), satu lagi platform untuk diurus, dan kerja migrasi tanpa masalah sebenar untuk diselesaikan.

Nilai semula dengan data sebenar pada **Februari 2027** (3 bulan selepas live).

## Kriteria TRD 7 vs keadaan sekarang

| # | Kriteria pindah | Keadaan 21/11/2026 | Cara ukur |
|---|---|---|---|
| 1 | Mana-mana tab > ~50,000 baris, atau action `list` purata > 5 saat | Belum ada data production. Sistem lama paling besar (ClaimPro, GWR) dijangka beberapa ribu baris setahun | `VP-access` > `laporanSaizData` (AMARAN pada 30,000, PINDAH pada 50,000). Masa: Apps Script > Executions > lajur Duration untuk `doPost` |
| 2 | "Service invoked too many times" / ralat concurrency > sekali seminggu | Belum berlaku. Had 30 serentak per modul; puncak dijangka < 30 (TRD 7) | Apps Script > Executions > tapis Failed. Emel ralat dari Google |
| 3 | Laporan merentas modul (join) yang berat | Tiada. Setiap laporan setakat ini dalam satu modul. Voltrack simpan ID GWR sebagai teks, tak join | Keperluan baru dari pengurusan (contoh dashboard KPI F-08) |
| 4 | Audit PDPA minta kawalan akses peringkat baris & log akses lebih ketat untuk HR | Kawalan sekarang: server tapis baris ikut role/skop sebelum hantar; Sheet tak dikongsi; `getFile` direkod. Belum ada permintaan audit | Keputusan pemilik / DPO |

## Kenapa angka ini munasabah

- 100 staf x tuntutan purata 4 sebulan = ~4,800 baris ClaimPro setahun. Ambang 50,000 dicapai sekitar 10 tahun, dan arkib 24 bulan (BSD 8) potong lebih awal.
- GWR: sekitar 2 hingga 3 laporan sehari per dept = ~1,500 setahun.
- Log (LoginLog, AuditLog) paling cepat membesar. 100 staf x 2 login sehari = ~50,000 setahun. Ini calon pertama melepasi ambang, tapi log jarang dibaca dan boleh dipotong ikut polisi retention (12 / 24 bulan, BSD 8) tanpa Supabase.

Anggaran ini dari logik (bilangan staf x kekerapan), bukan ukuran. Ganti dengan angka sebenar dari `laporanSaizData` pada Februari 2027.

## Jika satu kriteria berlaku

1. Pindah **satu modul sahaja**, bermula dengan yang bermasalah (calon TRD: ClaimPro dan HR).
2. Gateway `/api/<modul>` kekal; hanya backend modul itu bertukar. Frontend tak berubah.
3. Langkah lebih murah dicuba dahulu:
   - Log terlalu besar: potong ikut retention, atau pindah log lama ke Sheet arkib tahunan.
   - `list` lambat: tapis di server ikut tarikh (contoh 12 bulan terakhir) dan paging.
   - Concurrency: trigger "keep warm" waktu kerja; asingkan action berat (PDF) ke projek Apps Script sendiri.
4. Jika masih perlu Supabase: wajib RLS untuk setiap jadual, kunci `service_role` hanya di Cloudflare (tak pernah ke pelayar), backup harian Supabase dihidupkan.
