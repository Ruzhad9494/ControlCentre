# DBD: Voltake Operations Portal
Tarikh: 19/11/2026 | Versi: 2.0 (tema baharu 21/11/2026) | Rujuk: 03-AFD, gambar tema rujukan pemilik (gaya "EduNexus IQMS"), logo V Voltake

## 0. Tema 2.0 (21/11/2026, arahan pemilik): MENGATASI seksyen 2, 3, 4, 6 dan 7 di bawah jika bercanggah

Sumber: 4 gambar rujukan tema (log masuk gelap dengan garis cahaya + kad kaca; dashboard kad putih bucu besar,
kepala terapung dengan navigasi pil di tengah, kad hero navy, tab pil) dan logo V Voltake (oren / hitam). Semua
dalam `shared/ui/voltake.css` (satu fail untuk semua modul, nama kelas lama dikekalkan).

| Perkara | Nilai |
|---|---|
| Logo utama | V Voltake (oren + hitam, garis perak). Ikon PWA 192 / 512 / maskable 512 (latar putih, zon selamat), apple-touch 180 (latar putih), favicon 16 / 32 / `.ico`, `icons/logo-mark.png` 256 untuk kepala & log masuk. Dijana dari fail asal pemilik |
| Logo report | BERASINGAN dari logo utama: `shared/ui/report-logo.png` (lalai = logo "Voltake Energy Services" dari sistem lama). PDF GWR (server) guna Settings `report_logo_file_id`, atau fail portal itu, atau salinan terbenam |
| Font | **Manrope** 400-800 (OFL), dihos sendiri. Tajuk 700 dengan jarak huruf sedikit rapat; badan 500. Gambar ringkasan Cost Calculator kekal Inter supaya sama seperti sebelum |
| Latar halaman | `#E6F0FE` (biru pucat); permukaan kad `#FFFFFF`; latar lembut (kumpulan pil, kepala jadual) `#EFF5FC`; garisan `#DCE6F3` |
| Teks | Tajuk navy `#0B1734`; badan `#0F1B33`; kelabu `#5B6B85` |
| Utama | Biru `#0B4FE6` (hover `#0A3FBE`): butang utama, pautan, avatar. Navy `#0B1734`: pil / tab aktif |
| Brand | Oren logo `#FF9500`: garis aksen pada hero & log masuk |
| Status | Berjaya `#00732A` / `#E8FFF3`; amaran (coklat) `#8C4D00` / `#FFF4E2`; bahaya `#DC0000` / `#FFEFF0`; info `#0B4FE6` / `#E8F0FF`. Badge = pil lembut |
| Hero | Gradien navy `#0A2C82` ke `#001855`, item dalam hero lut sinar dengan garis putih 12% |
| Bentuk | Kad radius 24px, kawalan 12px, pil 999px, bayang lembut biru-kelabu |
| Kepala | Kad putih terapung (radius 22px, tinggi 64px): logo V + "Voltake" + nama modul (kiri), navigasi modul pil di tengah (aktif navy), avatar biru + "Hi, Nama" (kanan) |
| Navigasi modul (telefon <= 899px) | Bar pil terapung di bawah, item aktif navy, sasaran sentuh >= 44px |
| Tab dalam skrin | Kumpulan pil putih berbingkai; tab aktif navy, teks putih |
| Log masuk | Latar hitam `#030306` dengan garis cahaya menegak biru / oren / putih dan lantai perspektif; teks besar di kiri; kad kaca (blur 18px, border putih 20%) dengan logo, butang Google, notis privasi |
| Report (PDF / cetak) | TIDAK ikut tema: kekal format sistem lama setiap modul (lihat `docs/rujukan-sistem-lama.md`) |

## 1. Overview

Bersih, korporat, mesra mobile. Rasa macam alat kerja harian, bukan laman marketing. Rujukan utama: mockup portal (header biru gelap, banner panel solar, grid kad putih dengan ikon berwarna). Pengguna banyak guna telefon di site (GWR, ClaimPro), jadi butang besar, kontras tinggi dan boleh dibaca di bawah matahari.

## 2. Brand Identity

| Perkara | Nilai |
|---|---|
| Nama paparan | Voltake Operations Portal (pendek: "Voltake") |
| Logo | Logo VOLTAKE ENERGY sedia ada (versi putih untuk header gelap, versi navy untuk latar putih). **Perlu dibekalkan** dalam SVG atau PNG 1024px |
| Nada | Formal-mesra, Bahasa Melayu dengan istilah teknikal English (claim, PO, DO, report) |
| Konteks guna | Pejabat (desktop), lapangan & solar farm (telefon, cahaya terang, sarung tangan) |

## 3. Color Palette

Diambil dari mockup dan disemak kontras (cadangan; sahkan dengan warna brand rasmi jika ada).

| Peranan | Nama | Hex | Guna untuk |
|---------|------|-----|-----------|
| Primary | Voltake Navy | `#0B2545` | Header, butang utama, teks tajuk |
| Primary hover | Navy 700 | `#13315C` | Hover/pressed butang utama |
| Secondary | Solar Blue | `#1D6FD8` | Pautan, ikon aktif, fokus input |
| Accent | Solar Yellow | `#F5B700` | Penanda "baru", highlight, butang install. **Jangan** guna untuk teks atas putih |
| Background | Mist | `#F3F6FA` | Latar halaman |
| Surface | White | `#FFFFFF` | Kad, jadual, modal |
| Border | Slate 200 | `#DCE3EC` | Garis kad, jadual, input |
| Text | Ink | `#0F172A` | Teks utama (kontras 17:1 atas putih) |
| Text muted | Slate 600 | `#475569` | Label, caption (7.5:1 atas putih) |
| Success | Green 700 | `#15803D` | Lulus, Dibayar, Sah |
| Warning | Amber 700 | `#B45309` | Hampir luput, Menunggu |
| Danger | Red 700 | `#B91C1C` | Ditolak, Luput, Padam |
| Info | Blue 700 | `#1D4ED8` | Dihantar, Dalam proses |

Warna ikon kad modul (latar ikon sahaja, ikon putih di atasnya, ikut mockup):

| Modul | Warna ikon |
|---|---|
| Draft Mohon Kerja | `#1D6FD8` |
| Cost Calculator | `#15803D` |
| GWR | `#1D4ED8` |
| AMS | `#15803D` |
| ClaimPro | `#1D6FD8` |
| Compliance Track | `#B45309` |
| ClaimReport | `#1D4ED8` |
| Voltrack | `#0F766E` |
| More Info | `#1D6FD8` |

Mod gelap: tidak dalam v1.0. Token CSS disusun supaya boleh ditambah kemudian.

## 4. Typography

| Elemen | Font | Saiz / line-height | Berat |
|---|---|---|---|
| Font utama | `Inter`, fallback `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | - | - |
| H1 (banner) | Inter | 28px / 36px (mobile 22px / 28px) | 700 |
| H2 (tajuk skrin) | Inter | 22px / 28px | 700 |
| H3 (tajuk kad/seksyen) | Inter | 17px / 24px | 600 |
| Body | Inter | 15px / 22px | 400 |
| Label input | Inter | 14px / 20px | 500 |
| Caption | Inter | 13px / 18px | 400 |
| Nombor (RM, kiraan) | Inter dengan `font-variant-numeric: tabular-nums` | ikut konteks | 600 |

Inter dihos sendiri dalam `shared/ui/fonts/` (woff2, subset Latin) supaya patuh CSP `font-src 'self'` dan laju di PWA offline. Format nombor: `RM 1,234.50`. Tarikh: `DD/MM/YYYY`; masa 24 jam `14:30`.

## 5. Spacing & Layout

- Skala jarak: 4, 8, 12, 16, 24, 32, 48 px (token `--sp-1` hingga `--sp-7`).
- Radius: kad 12px, butang/input 8px, badge 999px.
- Bayang kad: `0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.06)`.
- Lebar kandungan maksimum: 1200px, tengah.
- Breakpoint: mobile < 640px, tablet 640-1023px, desktop ≥ 1024px.
- Grid kad dashboard S-02: 1 lajur (< 400px), 2 lajur mobile, 3 lajur tablet & desktop (sama macam mockup 3x3).
- Gutter sisi: 16px mobile, 24px desktop. Tiada skrol mendatar pada mana-mana skrin.
- Sasaran sentuh minimum 44x44px.

## 6. UI Components

Semua dalam `shared/ui/voltake.css` + `shared/ui/components.js`.

| Komponen | Spesifikasi |
|---|---|
| Butang primary | Latar `#0B2545`, teks putih, tinggi 44px, padding 0 20px, radius 8px. Hover `#13315C`. Focus ring 3px `#1D6FD8` 40% |
| Butang secondary | Latar putih, border `#DCE3EC`, teks `#0B2545` |
| Butang danger | Latar `#B91C1C`, teks putih. Sentiasa minta pengesahan dalam modal |
| Butang disabled | Opacity 50%, `cursor: not-allowed`, tiada hover |
| Butang Google | Ikut garis panduan branding Google (butang rasmi GIS). Teks bawah butang: "Guna akaun @voltake.com anda, atau Gmail yang didaftar dengan HR" |
| Input & borang | Label di atas medan, tinggi 44px, border `#DCE3EC`, fokus border `#1D6FD8`. Ralat: border `#B91C1C` + teks ralat 13px di bawah. Medan wajib ditanda `*` |
| Upload fail/gambar | Kawasan tekan besar + preview thumbnail; kamera terus di mobile (`capture="environment"`). Had saiz dipaparkan |
| Pad tandatangan | Kanvas penuh lebar, latar putih, butang "Padam" dan "Sahkan" (GWR S-30, S-34) |
| Jadual | Header `#F3F6FA` teks 13px 600; baris 48px; zebra halus; carian di atas; pagination 25 baris; di mobile jadi senarai kad |
| Kad modul (S-02) | Putih, radius 12px, ikon 44px dalam kotak berwarna (seksyen 3), tajuk H3, subtajuk caption (contoh "HR Only", "All Staff"). Seluruh kad boleh ditekan |
| Kad statistik | Nombor besar 28px tabular, label caption, garis warna status di kiri |
| Badge status | Pill, latar warna status 12% opacity, teks warna status 700. Contoh: Draf (slate), Dihantar (info), Lulus (success), Ditolak (danger), Dibayar (success), Luput (danger), Hampir luput (warning) |
| Modal | Lebar maks 520px, latar overlay `rgba(15,23,42,.5)`, tutup dengan Esc dan butang X, fokus terperangkap dalam modal |
| Toast | Kanan atas desktop, bawah mobile; 4 saat; warna ikut status; `role="status"` |
| Header portal | Tinggi 56px, latar `#0B2545`, logo putih kiri, "Dashboard" + nama modul, avatar + nama kanan (macam mockup "Hi, Ahmad"). Menu profil papar emel yang sedang login supaya staf yang ada beberapa akaun Gmail nampak akaun mana dia guna |
| Banner S-02 | Gambar panel solar (aset sendiri, WebP < 150KB) dengan overlay navy 70%, teks "Welcome to Voltake Operations Portal" + "Your central hub for all systems" |
| Bottom nav (mobile modul) | 56px, maksimum 4 item + "Lagi" |

Kebolehcapaian: kontras ≥ 4.5:1 untuk semua teks, label pada setiap input, `aria-live` untuk toast, navigasi papan kekunci penuh.

## 7. Ikon & Imej

- Set ikon: **Lucide** (lesen ISC), disalin sebagai SVG ke `shared/ui/icons/` (bukan CDN, ikut CSP). Cadangan padanan: Draft Mohon Kerja `briefcase`, Cost Calculator `calculator`, GWR `settings`/`hard-hat`, AMS `shield-check`, ClaimPro `receipt`, Compliance `badge-check`, ClaimReport `bar-chart-3`, Voltrack `trending-up`, More Info `info`.
- Ikon PWA: 192px, 512px, 512px maskable (padding 20%), apple-touch-icon 180px, favicon 32px. Semua dari logo "V" Voltake, latar navy. Dihos dalam repo (bukan postimg.cc macam GWR lama).
- Gambar: banner solar sendiri atau foto projek Voltake sebenar. Tiada stok foto berbayar.

## 8. Rujukan

| Rujukan | Apa yang diambil |
|---|---|
| Mockup "Voltake Operations Portal" (`image.png` 2) | Struktur header, banner, grid 3x3 kad modul dengan subtajuk role, warna navy + kuning, kad role |
| Contoh dashboard responsif (`image.png` 1) | Idea paparan sama di desktop, tablet, telefon; grid ikon besar |
| ClaimPro & Voltrack lama | Corak borang & badge status yang staf dah biasa |

Nota: label "Powered by RuzPrompt" dan alamat `opr.annurpro.com` dalam mockup tidak dimasukkan dalam UI portal kecuali diminta. Mockup tunjuk repo "Public"; dalam sistem sebenar repo **mesti private** (TRD seksyen 6).
