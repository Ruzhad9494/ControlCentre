// /public/mohon - borang permohonan jawatan awam (F-10; AFD S-10, S-11; IPD 2E.1).
// Medan & bahagian ikut sistem lama (draftmohonkerja index.html): Maklumat asas (gambar passport, jawatan / jawatan
// sendiri), Akademik, Pengalaman, Kecemasan, Lain-lain (rekod jenayah, gaji, 2 rujukan), Persetujuan & tandatangan.
// Dibuang (PRD Q-09): No. SOCSO & KWSP (dikumpul selepas tawaran). Tambahan: notis privasi PDPA + persetujuan
// berversi, Turnstile, resume PDF pilihan. Pengesahan sebenar di server (Apps Script); di sini untuk bantu pemohon.
import { el, clear, append } from '/shared/lib/escape.js';
import { icon, toast, openModal, busy } from '/shared/ui/components.js';
import { toBase64 } from '/shared/lib/fileprep.js';

export const CONSENT_VERSION = 'PN-HR-2026-11';   // mesti sama dengan apps/draftmohonkerja/gas/Schema.gs
const MAX_RESUME = 5 * 1024 * 1024;
const main = document.getElementById('main');
const HUBUNGAN = ['Ibu', 'Bapa', 'Pasangan', 'Adik-Beradik', 'Anak', 'Penjaga', 'Lain-Lain'];

async function post(path, body) {
  const res = await fetch('/public/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VP': '1' }, body: JSON.stringify(body || {}) });
  let data = {};
  try { data = await res.json(); } catch { /* bukan JSON */ }
  if (!res.ok) { const e = new Error(data.error || 'Ralat ' + res.status); e.status = res.status; throw e; }
  return data.data;
}

function field(label, input, { hint, required, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') },
    el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input,
    hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (a) => el('input', { class: 'input', autocomplete: 'off', ...a });
const sel = (opts, ph) => el('select', { class: 'input' }, [el('option', { value: '' }, ph || '- Sila pilih -'), ...opts.map(([v, t]) => el('option', { value: v }, t))]);
function radios(name, values) {
  const boxes = values.map((v) => el('input', { type: 'radio', name, value: v }));
  return { node: el('div', { class: 'mh-radio', role: 'radiogroup' }, boxes.map((b, i) => el('label', { class: 'check' }, b, values[i]))), get: () => (boxes.find((b) => b.checked) || {}).value || '', boxes };
}

// ------------------------------------------------------------------ format (sistem lama: formatPhoneMy, IC)
function fmtIc(v) {
  const d = v.replace(/\D/g, '').slice(0, 12);
  return d.length > 8 ? `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}` : d.length > 6 ? `${d.slice(0, 6)}-${d.slice(6)}` : d;
}
function fmtPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (/^01/.test(d)) return d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
  return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
}
const phoneInput = (ph) => { const i = inp({ type: 'tel', inputmode: 'tel', placeholder: ph, maxlength: 13 }); i.addEventListener('input', () => { i.value = fmtPhone(i.value); }); return i; };
function dobFromIc(ic) {
  const d = ic.replace(/\D/g, '');
  if (d.length !== 12) return '';
  const yy = Number(d.slice(0, 2));
  const year = (yy > new Date().getFullYear() % 100 ? 1900 : 2000) + yy;
  const s = `${year}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
  const t = new Date(s + 'T00:00:00Z');
  return !isNaN(t) && t.toISOString().slice(0, 10) === s ? s : '';
}

// ------------------------------------------------------------------ gambar passport (sistem lama: cropToPassport, 3:4)
async function passportPhoto(file) {
  const bmp = await createImageBitmap(file);
  const ratio = 3 / 4;
  let w = bmp.width, h = bmp.height, sx = 0, sy = 0;
  if (w / h > ratio) { const nw = h * ratio; sx = (w - nw) / 2; w = nw; } else { const nh = w / ratio; sy = (h - nh) / 3; h = nh; }
  const c = document.createElement('canvas');
  c.width = 450; c.height = 600;
  c.getContext('2d').drawImage(bmp, sx, sy, w, h, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return { blob, data: await toBase64(blob) };
}

// ------------------------------------------------------------------ tandatangan (sistem lama: signature-pad canvas)
function signaturePad() {
  const c = el('canvas', { class: 'mh-sign', 'aria-label': 'Ruang tandatangan' });
  let drawing = false, drawn = false, last = null;
  const g = () => c.getContext('2d');
  const fit = () => {
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const keep = drawn ? c.toDataURL() : null;
    c.width = Math.round(r.width * devicePixelRatio); c.height = Math.round(160 * devicePixelRatio);
    const x = g(); x.scale(devicePixelRatio, devicePixelRatio); x.lineWidth = 2.2; x.lineCap = 'round'; x.strokeStyle = '#0B2545';
    if (keep) { const img = new Image(); img.onload = () => g().drawImage(img, 0, 0, r.width, 160); img.src = keep; }
  };
  const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  c.addEventListener('pointerdown', (e) => { if (!c.width) fit(); drawing = true; last = pos(e); c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); const x = g(); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p; drawn = true; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => c.addEventListener(t, () => { drawing = false; }));
  window.addEventListener('resize', fit);
  requestAnimationFrame(fit);
  const clearBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { g().clearRect(0, 0, c.width, c.height); drawn = false; } }, icon('x'), 'Padam tandatangan');
  return {
    node: el('div', { class: 'stack' }, c, el('div', { class: 'row-between' }, el('span', { class: 'caption' }, 'Tandatangan di dalam petak menggunakan jari atau tetikus.'), clearBtn)),
    has: () => drawn,
    data: () => c.toDataURL('image/png').split(',')[1],
  };
}

// ------------------------------------------------------------------ baris berulang (akademik, pengalaman)
function rowList(label, cols, { min = 0, max = 10 } = {}) {
  const host = el('div', { class: 'stack' });
  const rows = [];
  const add = () => {
    if (rows.length >= max) { toast(`Maksimum ${max} baris.`, 'warning'); return; }
    const inputs = Object.fromEntries(cols.map(([k, , ph]) => [k, inp({ maxlength: 120, placeholder: ph || '' })]));
    const rm = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('x'), 'Buang');
    const node = el('div', { class: 'mh-row' }, el('div', { class: 'mh-grid' }, cols.map(([k, l]) => field(l, inputs[k]))), el('div', null, rm));
    const row = { node, inputs };
    rm.addEventListener('click', () => { if (rows.length <= Math.max(min, 1) && min) { toast(`Sekurang-kurangnya ${min} baris diperlukan.`, 'warning'); return; } rows.splice(rows.indexOf(row), 1); node.remove(); });
    rows.push(row);
    host.append(node);
  };
  for (let i = 0; i < Math.max(min, 1); i++) add();
  return {
    node: el('div', { class: 'stack' }, host, el('div', null, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: add }, icon('plus'), 'Tambah ' + label.toLowerCase()))),
    value: () => rows.map((r) => Object.fromEntries(cols.map(([k]) => [k, r.inputs[k].value.trim()]))).filter((o) => Object.values(o).some(Boolean)),
  };
}

// ------------------------------------------------------------------ notis privasi pemohon (PDPA 2010; versi PN-HR-2026-11)
function privacyNotice() {
  const S = [
    ['Data yang dikumpul', ['Maklumat dalam borang ini: nama, no. kad pengenalan, tarikh lahir, jantina, taraf perkahwinan, emel, telefon, alamat, akademik, pengalaman kerja, penama kecemasan, rujukan, gaji dipohon, jawapan soalan rekod jenayah, gambar, tandatangan dan resume (jika dimuat naik).']],
    ['Tujuan', ['Menilai permohonan anda, menghubungi anda untuk temuduga, dan semakan latar belakang (jika anda benarkan).', 'Data tidak digunakan untuk pemasaran dan tidak dijual atau dikongsi dengan pihak luar.']],
    ['Siapa boleh lihat', ['Pasukan HR Voltake. Pegawai yang menemuduga hanya melihat maklumat yang berkaitan dengan penilaian, dengan no. kad pengenalan disembunyikan dan tanpa jawapan rekod jenayah.']],
    ['Tempoh simpanan', ['Jika permohonan tidak berjaya atau ditarik balik, data peribadi anda dipadam (dianonimkan) secara automatik 12 bulan selepas keputusan.', 'Jika anda diterima bekerja, data dipindah ke rekod pekerja.']],
    ['Penyimpanan', ['Data disimpan dalam Google Workspace milik syarikat dan melalui Cloudflare, yang mungkin memproses data di luar Malaysia. Akses dikawal dan direkod.']],
    ['Hak anda', ['Anda boleh meminta salinan, pembetulan atau pemadaman data anda dengan menghubungi HR Voltake. Nyatakan no. rujukan permohonan anda.']],
    ['Wajib atau pilihan', ['Medan bertanda * wajib untuk permohonan diproses. Medan lain adalah pilihan.']],
  ];
  return el('div', { class: 'mh-privacy', tabindex: '0', 'aria-label': 'Notis privasi pemohon' },
    el('strong', null, 'Notis Privasi Pemohon Kerja (Akta Perlindungan Data Peribadi 2010)'),
    S.map(([t, items]) => [el('p', { style: 'margin:8px 0 0' }, el('strong', null, t)), el('ul', null, items.map((i) => el('li', null, i)))]),
    el('p', { class: 'caption', style: 'margin:0' }, 'Versi ' + CONSENT_VERSION + '.'));
}

// ------------------------------------------------------------------ Turnstile
let tsToken = '';
let tsWidget = null;
async function mountTurnstile(host) {
  let key = '';
  try { key = (await (await fetch('/public/api/config')).json()).turnstile_site_key || ''; } catch { /* tiada */ }
  if (!key) return false;
  await new Promise((resolve, reject) => {
    const s = el('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
    s.onload = resolve; s.onerror = () => reject(new Error('Semakan anti-bot gagal dimuat'));
    document.head.append(s);
  }).catch((e) => toast(e.message, 'danger'));
  for (let i = 0; i < 50 && !window.turnstile; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.turnstile) return false;
  tsWidget = window.turnstile.render(host, { sitekey: key, callback: (t) => { tsToken = t; }, 'expired-callback': () => { tsToken = ''; }, 'error-callback': () => { tsToken = ''; } });
  return true;
}
const resetTurnstile = () => { tsToken = ''; if (window.turnstile && tsWidget !== null) window.turnstile.reset(tsWidget); };

// ------------------------------------------------------------------ borang
async function start() {
  let info;
  try { info = await post('hr/listOpenPositions', {}); } catch (e) {
    append(clear(main), el('div', { class: 'alert alert-danger' }, 'Borang tidak dapat dibuka buat masa ini. ', e.message));
    main.removeAttribute('aria-busy');
    return;
  }
  const jawatan = sel(info.jawatan.map((p) => [p.position_id, p.jawatan + (p.lokasi ? ' (' + p.lokasi + ')' : '')]), info.jawatan.length ? '- Sila pilih jawatan -' : '- Tiada jawatan dibuka -');
  if (info.benarkan_jawatan_lain) jawatan.append(el('option', { value: '__LAIN__' }, 'Lain-lain: taip jawatan anda'));
  const jawatanLain = inp({ maxlength: 120, placeholder: 'Nyatakan jawatan yang dipohon' });
  const lainBox = field('Jawatan dipohon (taip)', jawatanLain, { required: true, cls: 'full' });
  lainBox.hidden = true;
  const posInfo = el('p', { class: 'caption', style: 'margin:0' });
  jawatan.addEventListener('change', () => {
    lainBox.hidden = jawatan.value !== '__LAIN__';
    const p = info.jawatan.find((x) => x.position_id === jawatan.value);
    clear(posInfo).append(p ? [p.department ? 'Department: ' + p.department : '', p.penerangan ? ' · ' + p.penerangan : '', p.tarikh_tutup ? ' · Tutup ' + p.tarikh_tutup.split('-').reverse().join('/') : ''].join('') : '');
  });

  // gambar
  let photo = null;
  const frame = el('div', { class: 'frame' }, 'Gambar passport');
  const photoIn = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', 'aria-label': 'Gambar' });
  photoIn.addEventListener('change', async () => {
    const f = photoIn.files && photoIn.files[0];
    if (!f) return;
    try { photo = await passportPhoto(f); clear(frame).append(el('img', { src: URL.createObjectURL(photo.blob), alt: 'Gambar pemohon' })); }
    catch { toast('Gambar tidak dapat dibaca. Cuba JPG atau PNG.', 'danger'); }
  });

  const f = {
    nama: inp({ maxlength: 100, placeholder: 'Nama mengikut kad pengenalan', autocomplete: 'name' }),
    ic: inp({ inputmode: 'numeric', maxlength: 14, placeholder: '900101-14-5123' }),
    email: inp({ type: 'email', maxlength: 120, placeholder: 'nama@email.com', autocomplete: 'email' }),
    tel_bimbit: phoneInput('012-3456789'),
    tel_rumah: phoneInput('03-12345678'),
    alamat: el('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Alamat lengkap' }),
    kecemasan_nama: inp({ maxlength: 100 }),
    kecemasan_hubungan: sel(HUBUNGAN.map((h) => [h, h])),
    kecemasan_jenis_tel: sel([['Bimbit', 'Bimbit'], ['Rumah', 'Rumah']], '- Jenis -'),
    kecemasan_tel: phoneInput('Nombor telefon'),
    disabit_penerangan: el('textarea', { class: 'input', rows: 2, maxlength: 500 }),
    gaji: inp({ type: 'number', inputmode: 'decimal', min: '0', step: '50', placeholder: 'Cth: 3000' }),
    website: inp({ tabindex: '-1', 'aria-hidden': 'true' }),
  };
  f.kecemasan_jenis_tel.value = 'Bimbit';
  const dobOut = el('span', { class: 'hint' });
  f.ic.addEventListener('input', () => { f.ic.value = fmtIc(f.ic.value); const d = dobFromIc(f.ic.value); clear(dobOut).append(d ? 'Tarikh lahir: ' + d.split('-').reverse().join('/') : ''); });
  const jantina = radios('jantina', ['Lelaki', 'Perempuan']);
  const kahwin = radios('status_kahwin', ['Bujang', 'Berkahwin', 'Janda', 'Duda']);
  const jenayah = radios('jenayah', ['Ya', 'Tidak']);
  const jenayahBox = field('Jika Ya, sila nyatakan', f.disabit_penerangan, { required: true });
  jenayahBox.hidden = true;
  jenayah.boxes.forEach((b) => b.addEventListener('change', () => { jenayahBox.hidden = jenayah.get() !== 'Ya'; }));
  const semak = radios('kebenaran_semak', ['Ya', 'Tidak']);
  const akademik = rowList('Akademik', [['dari', 'Dari (tahun)', '2008'], ['hingga', 'Hingga', '2011'], ['institusi', 'Sekolah / pusat pengajian'], ['kelulusan', 'Kelulusan', 'SPM / Diploma ...']], { min: 1 });
  const pengalaman = rowList('Pengalaman', [['dari', 'Dari (tahun)'], ['hingga', 'Hingga'], ['majikan', 'Majikan'], ['jawatan', 'Jawatan']]);
  const ref = [1, 2].map(() => ({ nama: inp({ maxlength: 100, placeholder: 'Nama' }), jawatan: inp({ maxlength: 120, placeholder: 'Jawatan' }), syarikat: inp({ maxlength: 120, placeholder: 'Organisasi / syarikat' }), tel: phoneInput('No. telefon') }));
  let resume = null;
  const resumeIn = el('input', { type: 'file', accept: 'application/pdf', class: 'input' });
  const resumeInfo = el('span', { class: 'hint' }, 'Pilihan. PDF sahaja, maksimum 5MB.');
  resumeIn.addEventListener('change', async () => {
    const file = resumeIn.files && resumeIn.files[0];
    resume = null;
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast('Resume mesti fail PDF.', 'danger'); resumeIn.value = ''; return; }
    if (file.size > MAX_RESUME) { toast('Resume melebihi 5MB.', 'danger'); resumeIn.value = ''; return; }
    resume = { data: await toBase64(file) };
    clear(resumeInfo).append(`${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
  });
  const sign = signaturePad();
  const consent = el('input', { type: 'checkbox' });
  const tsHost = el('div');
  const err = el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
  const showErr = (m) => { clear(err).append(m); err.hidden = false; err.scrollIntoView({ block: 'center' }); };

  function collect() {
    if (!jawatan.value) return 'Pilih jawatan yang dipohon';
    if (jawatan.value === '__LAIN__' && !jawatanLain.value.trim()) return 'Taip jawatan yang dipohon';
    if (f.nama.value.trim().length < 3) return 'Isi nama penuh';
    if (!dobFromIc(f.ic.value)) return 'No. kad pengenalan mesti 12 digit yang sah';
    if (!jantina.get()) return 'Pilih jantina';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) return 'Isi alamat emel yang sah';
    if (f.tel_bimbit.value.replace(/\D/g, '').length < 10) return 'Isi no. telefon bimbit';
    if (!f.alamat.value.trim()) return 'Isi alamat';
    if (!akademik.value().some((r) => r.institusi && r.kelulusan)) return 'Isi sekurang-kurangnya satu kelayakan akademik (sekolah dan kelulusan)';
    if (!f.kecemasan_nama.value.trim() || !f.kecemasan_hubungan.value || f.kecemasan_tel.value.replace(/\D/g, '').length < 9) return 'Lengkapkan maklumat hubungan kecemasan';
    if (!jenayah.get()) return 'Jawab soalan rekod jenayah';
    if (jenayah.get() === 'Ya' && !f.disabit_penerangan.value.trim()) return 'Nyatakan penerangan rekod';
    if (!semak.get()) return 'Jawab soalan kebenaran semakan latar belakang';
    if (!sign.has()) return 'Sila tandatangan';
    if (!consent.checked) return 'Sila baca notis privasi dan tandakan persetujuan';
    return '';
  }

  function payload() {
    const p = {
      position_id: jawatan.value === '__LAIN__' ? '' : jawatan.value, jawatan_lain: jawatan.value === '__LAIN__' ? jawatanLain.value : '',
      nama: f.nama.value, ic: f.ic.value, jantina: jantina.get(), status_kahwin: kahwin.get(), email: f.email.value, tel_bimbit: f.tel_bimbit.value, tel_rumah: f.tel_rumah.value,
      alamat: f.alamat.value, akademik: akademik.value(), pengalaman: pengalaman.value(),
      kecemasan_nama: f.kecemasan_nama.value, kecemasan_hubungan: f.kecemasan_hubungan.value, kecemasan_jenis_tel: f.kecemasan_jenis_tel.value, kecemasan_tel: f.kecemasan_tel.value,
      pernah_disabit: jenayah.get(), disabit_penerangan: jenayah.get() === 'Ya' ? f.disabit_penerangan.value : '', gaji_dijangka: f.gaji.value, kebenaran_semak: semak.get(),
      tandatangan: { data: sign.data() }, gambar: photo ? { data: photo.data } : undefined, resume: resume || undefined,
      consent: { setuju: consent.checked, versi: CONSENT_VERSION }, website: f.website.value, turnstile: tsToken,
    };
    ref.forEach((r, i) => { ['nama', 'jawatan', 'syarikat', 'tel'].forEach((k) => { p[`ref${i + 1}_${k}`] = r[k].value; }); });
    return p;
  }

  const submit = el('button', { class: 'btn', type: 'submit' }, icon('check'), 'Semak & hantar permohonan');
  const form = el('form', { class: 'mh-form', novalidate: true },
    el('div', null, el('h1', { style: 'margin:0 0 4px' }, 'Borang Permohonan Jawatan'), el('p', { class: 'muted', style: 'margin:0' }, 'Sila pastikan maklumat diisi dengan lengkap dan tepat. Medan bertanda * wajib.')),
    err,
    el('section', { class: 'mh-sec' }, el('h2', null, '1. Maklumat asas'),
      el('div', { class: 'mh-photo' }, frame, el('div', { class: 'stack' }, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => photoIn.click() }, icon('camera'), 'Muat naik gambar'), el('span', { class: 'caption' }, 'Pilihan. Dipotong ke saiz passport.'), photoIn)),
      el('div', { class: 'mh-grid' },
        field('Jawatan dipohon', jawatan, { required: true, cls: 'full' }), lainBox, el('div', { class: 'full' }, posInfo),
        field('Nama penuh', f.nama, { required: true, cls: 'full' }),
        el('div', { class: 'field' }, el('label', { for: (f.ic.id = 'f-ic') }, 'No. kad pengenalan', el('span', { class: 'req' }, ' *')), f.ic, dobOut),
        field('Alamat emel', f.email, { required: true }),
        field('No. telefon bimbit', f.tel_bimbit, { required: true }), field('No. telefon rumah', f.tel_rumah),
        field('Alamat penuh', f.alamat, { required: true, cls: 'full' })),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Jantina', el('span', { class: 'req' }, ' *')), jantina.node),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Taraf perkahwinan'), kahwin.node)),
    el('section', { class: 'mh-sec' }, el('h2', null, '2. Maklumat akademik'), akademik.node),
    el('section', { class: 'mh-sec' }, el('h2', null, '3. Pengalaman kerja'), el('p', { class: 'caption', style: 'margin:0' }, 'Kosongkan jika tiada pengalaman.'), pengalaman.node),
    el('section', { class: 'mh-sec' }, el('h2', null, '4. Hubungan kecemasan'),
      el('div', { class: 'mh-grid' }, field('Nama penama', f.kecemasan_nama, { required: true, cls: 'full' }), field('Hubungan', f.kecemasan_hubungan, { required: true }),
        field('Jenis telefon', f.kecemasan_jenis_tel), field('No. telefon kecemasan', f.kecemasan_tel, { required: true, cls: 'full' }))),
    el('section', { class: 'mh-sec' }, el('h2', null, '5. Lain-lain maklumat'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Adakah anda pernah mempunyai rekod jenayah, sedang dalam siasatan, atau pernah disabitkan atas mana-mana kesalahan di bawah undang-undang?', el('span', { class: 'req' }, ' *')), jenayah.node),
      jenayahBox,
      field('Gaji dipohon (RM)', f.gaji),
      el('h3', { style: 'margin:8px 0 0;font-size:16px' }, '2 rujukan (pilihan)'),
      el('div', { class: 'mh-grid' }, ref.map((r, i) => el('div', { class: 'mh-row' }, el('strong', null, 'Rujukan ' + (i + 1)), r.nama, r.jawatan, r.syarikat, r.tel))),
      field('Resume (PDF)', resumeIn), resumeInfo),
    el('section', { class: 'mh-sec' }, el('h2', null, '6. Persetujuan & tandatangan'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Adakah anda bersetuju untuk pihak syarikat menjalankan semakan latar belakang sekiranya diperlukan?', el('span', { class: 'req' }, ' *')), semak.node),
      privacyNotice(),
      el('label', { class: 'check' }, consent, el('span', null, 'Saya telah membaca Notis Privasi Pemohon di atas dan bersetuju data saya diproses untuk tujuan permohonan ini. Saya mengesahkan semua maklumat yang diberi adalah benar.')),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Tandatangan pemohon', el('span', { class: 'req' }, ' *')), sign.node),
      el('div', { class: 'mh-hp', 'aria-hidden': 'true' }, el('label', null, 'Website', f.website)),
      tsHost),
    el('div', { class: 'row' }, submit));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    const bad = collect();
    if (bad) { showErr(bad); return; }
    const p = payload();
    const jaw = jawatan.value === '__LAIN__' ? jawatanLain.value : jawatan.selectedOptions[0].textContent;
    openModal({
      title: 'Semak sebelum hantar',
      body: el('dl', { class: 'kv' },
        el('dt', null, 'Jawatan'), el('dd', null, jaw), el('dt', null, 'Nama'), el('dd', null, p.nama), el('dt', null, 'No. KP'), el('dd', null, p.ic),
        el('dt', null, 'Emel'), el('dd', null, p.email), el('dt', null, 'Telefon'), el('dd', null, p.tel_bimbit),
        el('dt', null, 'Akademik'), el('dd', null, p.akademik.map((a) => `${a.kelulusan} (${a.institusi})`).join('; ')),
        el('dt', null, 'Lampiran'), el('dd', null, [photo ? 'Gambar' : '', resume ? 'Resume' : '', 'Tandatangan'].filter(Boolean).join(', '))),
      actions: [
        { label: 'Betulkan', class: 'btn-secondary' },
        { label: 'Hantar permohonan', onClick: ({ close, button }) => busy(button, async () => {
          try {
            const r = await post('hr/submitApplication', payload());
            close();
            done(r);
          } catch (ex) {
            close();
            resetTurnstile();
            showErr(ex.message);
          }
        }) },
      ],
    });
  });

  append(clear(main), form);
  main.removeAttribute('aria-busy');
  await mountTurnstile(tsHost);
}

/** S-11: terima kasih + no. rujukan. */
function done(r) {
  append(clear(main), el('section', { class: 'mh-done card stack' },
    icon('circle-check', 'icon'),
    el('h1', { style: 'margin:0' }, 'Permohonan diterima'),
    el('p', null, 'Terima kasih. Permohonan anda untuk jawatan ', el('strong', null, r.jawatan), ' telah diterima.'),
    el('p', { class: 'caption', style: 'margin:0' }, 'No. rujukan anda'),
    el('div', { class: 'mh-ref' }, r.app_no),
    el('p', { class: 'muted' }, 'Simpan no. rujukan ini. HR akan menghubungi anda jika anda disenarai pendek untuk temuduga.'),
    el('div', null, el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => location.reload() }, 'Isi permohonan lain'))));
  window.scrollTo(0, 0);
}

start();
