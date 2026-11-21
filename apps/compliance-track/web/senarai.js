// senarai.js - Senarai Kerja (F-64; sistem lama: Compliance-Track senarai/index.html).
// Dokumen "DETAILS OF WORKING PERSONNEL FOR <KERJA> WORKS AT <TEMPAT>" untuk kebenaran masuk tapak:
//   muka 1: kepala syarikat + jadual (No, Name, Designation, CIDB expired date, IC No, Cert No = no. kompetensi chargeman)
//   setiap staf: salinan IC (depan + belakang, bertanda "FOR OFFICIAL SITE WORK ONLY") + lampiran sijil yang dipilih.
// Cetak / simpan PDF melalui pelayar (A4). Setiap penjanaan direkod dalam JobLog (sistem lama: Job_Log).
// Beza dengan sistem lama: gambar dibaca melalui portal (bukan pautan Drive awam); editor potong/zum tidak dibawa.
import { el, clear, append } from '/shared/lib/escape.js';
import { formatDate, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, confirmDialog, busy, badge, emptyState } from '/shared/ui/components.js';
import { call, field, inp, statusAt, fetchFile } from '/compliance-track/common.js';

const WM_TEXT = 'FOR OFFICIAL SITE WORK ONLY';
const CM = { key: 'CM', label: 'Lesen Chargeman' };
const S = { selected: new Set(), opts: new Set(['CIDB', 'NIOSH']), job: { kerja: '', tempat: '', tarikh: todayIso() } };

const docTitle = (placeholder) => ('DETAILS OF WORKING PERSONNEL FOR ' + (S.job.kerja.trim() || (placeholder ? '(KERJA APA)' : '')) + ' WORKS AT ' + (S.job.tempat.trim() || (placeholder ? '(TEMPAT)' : ''))).toUpperCase();

/** Isu bagi seorang staf ikut dokumen dipilih (sistem lama: collectWarnings). Tamat kalibrasi = 'error'. */
function issues(s, d) {
  const out = [];
  const add = (level, text) => out.push({ level, text: `${s.staff_id} ${s.nama}: ${text}` });
  d.jenis_sijil.forEach((t) => {
    if (!S.opts.has(t.key)) return;
    const c = s.sijil[t.key];
    const st = statusAt(c.hari, d.amaran_hari);
    if (st === 'unknown') add('error', `${t.label} tiada tarikh`);
    else if (st === 'expired') add('error', `${t.label} tamat ${formatDate(c.expiry)}`);
    else if (st === 'expiring') add('warn', `${t.label} tamat ${formatDate(c.expiry)} (${c.hari} hari lagi)`);
    if (st !== 'unknown' && !c.ada_fail) add('warn', `${t.label} tiada lampiran fail`);
  });
  if (S.opts.has('CM')) d.chargeman.filter((c) => c.staff_id === s.staff_id).forEach((c) => {
    const st = statusAt(c.hari, d.amaran_hari);
    if (st === 'expired') add('error', `Chargeman (${c.solar_farm}) tamat ${formatDate(c.expiry)}`);
    else if (st === 'expiring') add('warn', `Chargeman (${c.solar_farm}) tamat ${formatDate(c.expiry)}`);
    if (!c.ada_fail) add('warn', `Chargeman (${c.solar_farm}) tiada lampiran fail`);
  });
  if (!s.ic_depan || !s.ic_belakang) add('error', 'salinan IC depan / belakang belum lengkap (wajib)');
  if (!s.ada_ic_no) add('warn', 'no. IC belum diisi');
  if (!s.designation) add('warn', 'designation belum diisi');
  return out;
}

export async function renderSenarai(view, { load }) {
  const d = await load(true);
  const kerja = inp({ value: S.job.kerja, maxlength: 120, placeholder: 'Contoh: Preventive Maintenance' });
  const tempat = inp({ value: S.job.tempat, maxlength: 120, placeholder: 'Contoh: LSS4 Bukit Kayu Hitam' });
  const tarikh = inp({ type: 'date', value: S.job.tarikh });
  const titlePrev = el('p', { class: 'caption', style: 'margin:0' });
  const syncJob = () => { S.job = { kerja: kerja.value, tempat: tempat.value, tarikh: tarikh.value }; clear(titlePrev).append(docTitle(true)); };
  [kerja, tempat, tarikh].forEach((x) => x.addEventListener('input', syncJob));
  syncJob();

  const optBoxes = [...d.jenis_sijil, CM].map((t) => {
    const b = el('input', { type: 'checkbox', checked: S.opts.has(t.key) });
    b.addEventListener('change', () => { b.checked ? S.opts.add(t.key) : S.opts.delete(t.key); drawList(); drawWarn(); });
    return el('label', { class: 'check' }, b, t.label);
  });

  const q = inp({ type: 'search', placeholder: 'Cari nama atau Staff ID', 'aria-label': 'Cari staf' });
  const list = el('ul', { class: 'file-list ct-pick' });
  const count = el('span', { class: 'caption' });
  const warnBox = el('div');
  const byId = new Map(d.staf.map((s) => [s.staff_id, s]));
  [...S.selected].forEach((id) => { if (!byId.has(id)) S.selected.delete(id); });
  const visible = () => { const t = q.value.trim().toLowerCase(); return d.staf.filter((s) => !t || `${s.staff_id} ${s.nama}`.toLowerCase().includes(t)); };

  function drawList() {
    clear(list);
    visible().forEach((s) => {
      const n = issues(s, d).filter((i) => i.level === 'error').length;
      const b = el('input', { type: 'checkbox', checked: S.selected.has(s.staff_id), 'aria-label': 'Pilih ' + s.nama });
      b.addEventListener('change', () => { b.checked ? S.selected.add(s.staff_id) : S.selected.delete(s.staff_id); drawCount(); drawWarn(); });
      list.append(el('li', null, el('label', { class: 'check grow' }, b, el('span', null, el('strong', null, s.nama), ` · ${s.staff_id}${s.designation ? ' · ' + s.designation : ''}`)),
        n ? badge(`${n} isu`, 'danger') : badge('OK', 'success')));
    });
    drawCount();
  }
  const drawCount = () => { clear(count).append(`${S.selected.size} staf dipilih`); };
  function drawWarn() {
    clear(warnBox);
    const all = [...S.selected].flatMap((id) => issues(byId.get(id), d));
    if (!S.selected.size) return;
    if (!all.length) { warnBox.append(el('div', { class: 'alert alert-info' }, 'Semua dokumen lengkap dan sah.')); return; }
    const errs = all.filter((i) => i.level === 'error').length;
    warnBox.append(el('div', { class: 'alert ' + (errs ? 'alert-danger' : 'alert-warning') },
      el('strong', null, `${errs} isu serius, ${all.length - errs} amaran`), el('ul', { class: 'ct-warn', style: 'margin:6px 0 0' }, all.map((i) => el('li', { class: i.level }, i.text)))));
  }
  q.addEventListener('input', drawList);
  const allBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { visible().forEach((s) => S.selected.add(s.staff_id)); drawList(); drawWarn(); } }, 'Pilih semua dipapar');
  const noneBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { S.selected.clear(); drawList(); drawWarn(); } }, 'Kosongkan');

  const preview = el('section', { class: 'stack', hidden: true });
  const gen = el('button', { class: 'btn', type: 'button' }, icon('printer'), 'Jana Senarai Kerja');
  gen.addEventListener('click', () => busy(gen, async () => {
    if (!S.job.kerja.trim() || !S.job.tempat.trim() || !S.job.tarikh) { toast('Isi kerja, tempat dan tarikh dahulu.', 'warning'); kerja.focus(); return; }
    if (!S.selected.size) { toast('Pilih sekurang-kurangnya seorang staf.', 'warning'); return; }
    const errs = [...S.selected].flatMap((id) => issues(byId.get(id), d)).filter((i) => i.level === 'error').length;
    if (errs && !(await confirmDialog('Ada isu serius', `Ada ${errs} isu serius (sijil tamat, tiada tarikh, atau salinan IC belum lengkap). Teruskan jana juga?`, { okLabel: 'Teruskan' }))) return;
    await generate(preview, d);
  }));

  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Senarai Kerja'), el('a', { class: 'btn btn-ghost btn-sm', href: '#/senarai/log' }, icon('scroll-text'), 'Log senarai')),
    el('p', { class: 'muted', style: 'margin:0' }, 'Senarai personel untuk kebenaran masuk tapak: jadual, salinan IC bertanda dan sijil. Cetak atau simpan sebagai PDF.'),
    el('div', { class: 'ct-steps' },
      el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, '1. Butiran kerja'),
        el('div', { class: 'ct-grid' }, field('Kerja', kerja, { required: true }), field('Tempat', tempat, { required: true }), field('Tarikh', tarikh, { required: true })),
        titlePrev),
      el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, '2. Dokumen disertakan'), el('div', { class: 'row' }, optBoxes)),
      el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, '3. Pilih staf'),
        el('div', { class: 'row' }, q, allBtn, noneBtn, count),
        d.staf.length ? list : emptyState('users', 'Belum ada staf dalam Sijil staf.')),
      warnBox,
      el('div', { class: 'row' }, gen)),
    preview);
  drawList();
  drawWarn();
}

// ------------------------------------------------------------------ jana dokumen
function loadImage(f) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar rosak'));
    img.src = `data:${f.mime};base64,${f.data}`;
  });
}

/** Sistem lama: drawWatermark (kotak putih separa lutsinar, bingkai & teks merah, condong -12 darjah). */
function drawWatermark(g, cx, cy, fs) {
  g.save();
  g.translate(cx, cy);
  g.rotate(-12 * Math.PI / 180);
  g.font = `800 ${fs}px Arial, Helvetica, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const bw = g.measureText(WM_TEXT).width + fs * 1.4;
  const bh = fs * 1.9;
  g.globalAlpha = 0.85;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(-bw / 2, -bh / 2, bw, bh);
  g.lineWidth = Math.max(2, fs * 0.12);
  g.strokeStyle = '#c1121f';
  g.strokeRect(-bw / 2, -bh / 2, bw, bh);
  g.fillStyle = '#c1121f';
  g.fillText(WM_TEXT, 0, fs * 0.04);
  g.restore();
}

/** IC depan + belakang sebelah-menyebelah (sistem lama: composeIc) + tanda air pada setiap bahagian. */
function composeIc(parts) {
  const H = Math.min(900, Math.max(...parts.map((i) => i.naturalHeight)));
  const ws = parts.map((i) => Math.round((i.naturalWidth * H) / i.naturalHeight));
  const gap = Math.round(H * 0.06);
  const c = el('canvas', { 'aria-label': 'Salinan IC' });
  c.width = ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  let x = 0;
  const centers = [];
  parts.forEach((img, i) => { g.drawImage(img, x, 0, ws[i], H); centers.push(x + ws[i] / 2); x += ws[i] + gap; });
  const fs = ((parts.length > 1 ? 2.2 : 3.0) / 100) * c.width;
  centers.forEach((cx) => drawWatermark(g, cx, H / 2, fs));
  return c;
}

const box = (label, content) => el('div', { class: 'sk-box' }, el('div', { class: 'lbl' }, label), content);
const missing = (text) => el('div', { class: 'slot missing' }, el('div', { class: 'miss' }, text));

async function imageSlot(payload, label) {
  try {
    const f = await fetchFile({ ...payload, pratonton: true });
    if (!/^image\//.test(f.mime)) return missing(`${label}: lampiran PDF tidak dapat dipapar. Sertakan fail asal secara berasingan.`);
    return el('div', { class: 'slot' }, await loadImage(f));
  } catch (e) {
    return missing(`${label}: ${e.message}`);
  }
}

// Sistem lama: headerHtml() - logo (26%, rowspan 3) | Company Name | Address | Date
const REPORT_LOGO = '/shared/ui/report-logo.png';
function header(co) {
  return el('table', { class: 'sk-hdr' },
    el('tr', null, el('td', { rowspan: '3', class: 'logo' }, el('img', { src: REPORT_LOGO, alt: 'Voltake Energy Services' })),
      el('td', { class: 'lbl' }, 'Company Name'), el('td', { class: 'co' }, co.nama || '-')),
    el('tr', null, el('td', { class: 'lbl' }, 'Address'), el('td', null, co.alamat || '-')),
    el('tr', null, el('td', { class: 'lbl' }, 'Date'), el('td', { class: 'dt' }, formatDate(S.job.tarikh))));
}
/** Sistem lama fmtMY: tarikh luput CIDB dipapar MM/YYYY. */
const fmtMY = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? `${m[2]}/${m[1]}` : '-'; };

async function generate(preview, d) {
  const ids = [...S.selected];
  const status = el('p', { class: 'caption' }, 'Menyediakan senarai...');
  clear(preview).append(status);
  preview.hidden = false;
  preview.scrollIntoView({ block: 'start' });
  const data = await call('senaraiData', { staff_ids: ids });
  const title = docTitle(false);
  const sections = [];
  sections.push(el('section', { class: 'sk-pg cover' }, header(data.syarikat), el('div', { class: 'sk-title' }, title),
    el('table', { class: 'sk-tbl' },
      el('thead', null, el('tr', null, [['NO.', '5%'], ['NAME'], ['DESIGNATION'], ['CIDB EXPIRED DATE', '13%'], ['IC NO.', '16%'], ['CERT NO', '19%']]
        .map(([h, w]) => el('th', w ? { style: 'width:' + w } : null, h)))),
      el('tbody', null, data.staf.map((s, i) => el('tr', null,
        el('td', null, `${i + 1}.`), el('td', { class: 'l' }, s.nama), el('td', null, s.designation || '-'),
        el('td', null, s.sijil.CIDB.expiry ? fmtMY(s.sijil.CIDB.expiry) : '-'), el('td', null, s.ic_no || '-'),
        el('td', null, [...new Set(s.chargeman.map((c) => c.competency_no).filter(Boolean))].join(' / ') || '-')))))));
  let done = 0;
  for (const [i, s] of data.staf.entries()) {
    clear(status).append(`Memuatkan lampiran ${s.nama} (${i + 1}/${data.staf.length})...`);
    let icNode;
    try {
      const sides = [];
      if (s.ic_depan) sides.push(await loadImage(await fetchFile({ jenis: 'ic_depan', staff_id: s.staff_id })));
      if (s.ic_belakang) sides.push(await loadImage(await fetchFile({ jenis: 'ic_belakang', staff_id: s.staff_id })));
      icNode = sides.length ? el('div', { class: 'slot' }, composeIc(sides)) : missing('Salinan IC belum dimuat naik');
    } catch (e) {
      icNode = missing('Salinan IC: ' + e.message);
    }
    const boxes = [box('Salinan IC', icNode)];
    for (const t of d.jenis_sijil) {
      if (!S.opts.has(t.key)) continue;
      boxes.push(box(t.label, s.sijil[t.key].ada_fail ? await imageSlot({ jenis: 'sijil', sijil: t.key, staff_id: s.staff_id }, t.label) : missing('Tiada lampiran ' + t.label)));
    }
    if (S.opts.has('CM')) {
      for (const c of s.chargeman) {
        const lbl = `Lesen Chargeman — ${c.solar_farm}${c.competency_no ? ' (' + c.competency_no + ')' : ''}`;
        boxes.push(box(lbl, c.ada_fail ? await imageSlot({ jenis: 'chargeman', id: c.chargeman_id }, 'Chargeman') : missing('Tiada lampiran Chargeman')));
      }
    }
    sections.push(el('section', { class: 'sk-pg person' }, header(data.syarikat), el('div', { class: 'sk-ptitle' }, `${i + 1}. ${s.nama}`), boxes));
    done++;
  }
  // Sistem lama frameHtml(): jarak atas + kaki "Copyright by Voltake" berulang pada setiap halaman cetak
  const pages = el('table', { id: 'sk-print', class: 'print-frame' },
    el('thead', null, el('tr', null, el('td', null, el('div', { class: 'fr-top' })))),
    el('tfoot', null, el('tr', null, el('td', null, el('div', { class: 'fr-foot' }, 'Copyright by Voltake')))),
    el('tbody', null, el('tr', null, el('td', null, sections))));
  let logged = '';
  try {
    const j = await call('logJob', { kerja: S.job.kerja, tempat: S.job.tempat, tarikh: S.job.tarikh, staff_ids: ids, sijil: [...S.opts] });
    logged = ` · direkod ${j.job_id}`;
  } catch { /* log tak kritikal (sistem lama sama) */ }
  clear(preview).append(
    el('div', { class: 'row-between' }, el('h3', { style: 'margin:0' }, 'Pratonton'),
      el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, icon('printer'), 'Cetak / simpan PDF'),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { preview.hidden = true; clear(preview); } }, icon('x'), 'Tutup'))),
    el('p', { class: 'caption', style: 'margin:0' }, `${done} personel · ${sections.length} bahagian${logged}. Dalam dialog cetak pilih "Save as PDF", saiz A4, margin "None".`),
    el('div', { class: 'sk-preview' }, pages));
}

// ------------------------------------------------------------------ log (sistem lama: Job_Log)
export async function renderJobLog(view) {
  const jobs = await call('listJobs');
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: '#/senarai' }, icon('arrow-left'), 'Senarai Kerja')),
    el('h2', null, 'Log Senarai Kerja'),
    jobs.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
      el('thead', null, el('tr', null, ['Tarikh kerja', 'Tajuk', 'Bil.', 'Staf', 'Dibuat'].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', null, jobs.map((j) => el('tr', null,
        el('td', { 'data-label': 'Tarikh kerja' }, formatDate(j.tarikh)),
        el('td', { 'data-label': 'Tajuk' }, j.tajuk),
        el('td', { 'data-label': 'Bil.', class: 'num' }, String(j.bil_orang)),
        el('td', { 'data-label': 'Staf' }, j.staff_ids),
        el('td', { 'data-label': 'Dibuat' }, `${j.dibuat_oleh_nama || '-'} · ${formatDateTime(j.created_at)}`))))))
      : emptyState('scroll-text', 'Belum ada Senarai Kerja dijana.'));
}
