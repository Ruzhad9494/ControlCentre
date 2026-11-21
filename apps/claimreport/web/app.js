// ClaimReport / DO Generator Sungrow (F-70 hingga F-72; AFD S-70, S-71; IPD 2G.1).
// Ikut sistem lama gcc-voltake/claimreport:
//  - form/index.html "DO Generator - Sungrow Delivery Order": rujukan RW/RC + MA berbilang, APAC ticket berbilang,
//    tarikh, From (preset JingDong / Koennen / custom) & To, item (product code, description, qty, unit), truck,
//    signer, note; pratonton No. DO & total carton; hasil: muat turun PDF & Excel, "+ Jana DO Baru".
//  - index.html "Operations Overview": tapis tarikh, KPI (DO, carton, truck, item), carta ikut tarikh / truck /
//    destinasi / pengirim, Detailed Transactions (carian, halaman, senarai PDF, Zip PDFs, edit, padam).
// Beza: login + role, data dari Sheet peribadi (bukan CSV "Publish to web"), Zip dijana di server (bukan corsproxy.io),
// padam hanya admin dengan sebab, ubah betul-betul berfungsi.
import { bootModule } from '/shared/lib/page.js';
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatDate, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderModuleNav } from '/shared/ui/components.js';

const MODULE = 'claimreport';
const PAGE = 25;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const main = document.getElementById('main');
let ctx;
let view;
let data = null;       // listDOs
let meta = null;       // listParties
const filt = { dari: '', hingga: '', q: '', page: 1 };

const call = (action, payload) => api(MODULE, action, payload || {}, { onSlow: () => toast('Masih memproses... (jana PDF & Excel ambil masa)', 'info', 3000) });
const fmt = (n) => Number(n || 0).toLocaleString('en-MY');

function field(label, input, { hint, required, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') }, el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input, hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (a) => el('input', { class: 'input', autocomplete: 'off', ...a });
const area = (v, a = {}) => { const t = el('textarea', { class: 'input', rows: 2, ...a }); t.value = v || ''; return t; };
function sel(opts, value = '') { const s = el('select', { class: 'input' }, opts.map(([v, t]) => el('option', { value: v }, t))); if (opts.some(([v]) => v === value)) s.value = value; return s; }
const errBox = () => el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
const showErr = (b, e) => { clear(b).append(e.message || String(e)); b.hidden = false; b.scrollIntoView({ block: 'nearest' }); };

async function loadData(force) { if (!data || force) data = await call('listDOs'); return data; }
async function loadMeta() { if (!meta) meta = await call('listParties'); return meta; }

function saveBlob(f) {
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
  const a = el('a', { href: url, download: f.nama });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function download(btn, do_id, jenis) {
  await busy(btn, async () => { try { saveBlob(await call('getFile', { do_id, jenis })); } catch (e) { if (e.status !== 401) toast(e.message, 'danger'); } });
}

// ------------------------------------------------------------------ penapis (sistem lama: filterStartDate / filterEndDate / searchInput)
function filtered() {
  const t = filt.q.trim().toLowerCase();
  return data.dos.filter((d) => (!filt.dari || d.tarikh >= filt.dari) && (!filt.hingga || d.tarikh <= filt.hingga)
    && (!t || `${d.do_no_all} ${d.report_name} ${d.truck} ${d.ref_no} ${d.ma_no} ${d.apac} ${d.from_name} ${d.to_name}`.toLowerCase().includes(t)));
}
function dateFilter(onChange) {
  const dari = inp({ type: 'date', value: filt.dari });
  const hingga = inp({ type: 'date', value: filt.hingga });
  const set = () => { filt.dari = dari.value; filt.hingga = hingga.value; filt.page = 1; onChange(); };
  dari.addEventListener('change', set); hingga.addEventListener('change', set);
  const month = (k) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + k); const y = d.getFullYear(), m = d.getMonth(); dari.value = `${y}-${String(m + 1).padStart(2, '0')}-01`; hingga.value = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10); set(); };
  return el('div', { class: 'cr-filters' }, field('Tarikh mula', dari), field('Tarikh akhir', hingga),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => month(0) }, 'Bulan ini'),
      el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => month(-1) }, 'Bulan lepas'),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { dari.value = ''; hingga.value = ''; set(); } }, icon('x'), 'Semua')));
}
const titleFor = () => (filt.dari ? `GCC ${MONTHS[Number(filt.dari.slice(5, 7)) - 1]} ${filt.dari.slice(0, 4)}` : 'Senarai Transaksi Keseluruhan');

// ------------------------------------------------------------------ router
async function route() {
  const h = location.hash || '#/';
  clear(view);
  window.scrollTo(0, 0);
  try {
    if (h.startsWith('#/baru')) await renderForm(null);
    else if (h.startsWith('#/ubah/')) await renderForm(decodeURIComponent(h.slice(7)));
    else if (h.startsWith('#/do/')) await renderDetail(decodeURIComponent(h.slice(5)));
    else if (h.startsWith('#/senarai')) await renderList();
    else if (h.startsWith('#/alamat')) await renderParties();
    else await renderDashboard();
  } catch (e) {
    if (e.status !== 401) append(clear(view), el('div', { class: 'alert alert-danger' }, e.message));
  }
}

// ------------------------------------------------------------------ S-71 dashboard (Operations Overview)
function bars(title, entries) {
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return el('section', { class: 'card cr-chart' }, el('h3', null, title),
    entries.length ? el('ul', { class: 'cr-bars' }, entries.map(([k, v]) => el('li', { title: `${k}: ${v} DO` },
      el('span', { class: 'lbl' }, k), el('span', { class: 'track' }, el('span', { class: 'bar', style: `display:block;width:${(v / max) * 100}%` })), el('span', { class: 'val' }, String(v)))))
      : el('p', { class: 'muted', style: 'margin:0' }, 'Tiada data.'));
}
const countBy = (rows, f) => { const m = {}; rows.forEach((r) => { const k = f(r) || 'Unspecified'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m); };

async function renderDashboard() {
  await loadData();
  const host = el('div', { class: 'stack' });
  const draw = () => {
    const rows = filtered();
    clear(host);
    const trucks = new Set(rows.map((r) => r.truck.trim()).filter((t) => t && t !== '-'));
    const byDate = countBy(rows, (r) => r.tarikh).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([k, v]) => [formatDate(k), v]);
    host.append(
      el('div', { class: 'cr-stats' },
        el('div', { class: 'cr-stat' }, el('div', { class: 'label' }, 'Jumlah DO'), el('div', { class: 'v' }, fmt(rows.length))),
        el('div', { class: 'cr-stat' }, el('div', { class: 'label' }, 'Jumlah kuantiti (carton / pallet)'), el('div', { class: 'v' }, fmt(rows.reduce((a, r) => a + r.jumlah_qty, 0)))),
        el('div', { class: 'cr-stat' }, el('div', { class: 'label' }, 'Truck berlainan'), el('div', { class: 'v' }, fmt(trucks.size))),
        el('div', { class: 'cr-stat' }, el('div', { class: 'label' }, 'Jumlah baris item'), el('div', { class: 'v' }, fmt(rows.reduce((a, r) => a + r.item_count, 0))))),
      el('div', { class: 'cr-charts' },
        bars('DO ikut tarikh (14 terkini)', byDate),
        bars('DO ikut truck', countBy(rows, (r) => r.truck.trim()).sort((a, b) => b[1] - a[1]).slice(0, 8)),
        bars('Destinasi teratas (To)', countBy(rows, (r) => r.to_name).sort((a, b) => b[1] - a[1]).slice(0, 5)),
        bars('Pengirim teratas (From)', countBy(rows, (r) => r.from_name).sort((a, b) => b[1] - a[1]).slice(0, 5))));
  };
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Operations Overview'), el('a', { class: 'btn', href: '#/baru' }, icon('plus'), 'Jana DO baru')),
    dateFilter(draw), host);
  draw();
}

// ------------------------------------------------------------------ S-71 Detailed Transactions
async function renderList() {
  await loadData();
  const q = inp({ type: 'search', placeholder: 'Cari DO, truck, rujukan, APAC, syarikat', 'aria-label': 'Cari', value: filt.q });
  const host = el('div', { class: 'stack' });
  const draw = () => {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    filt.page = Math.min(filt.page, pages);
    const slice = rows.slice((filt.page - 1) * PAGE, filt.page * PAGE);
    clear(host);
    if (!rows.length) { host.append(emptyState('search', 'Tiada DO sepadan.')); return; }
    host.append(
      el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['Tarikh', 'No DO', 'Rujukan', 'Truck', 'Pengirim (From)', 'Penerima (To)', 'Item', 'Carton', 'Dokumen', ''].map((x) => el('th', { scope: 'col' }, x)))),
        el('tbody', null, slice.map((d) => el('tr', null,
          el('td', { 'data-label': 'Tarikh' }, formatDate(d.tarikh)),
          el('td', { 'data-label': 'No DO' }, el('a', { class: 'cell-do', href: '#/do/' + encodeURIComponent(d.do_id) }, d.report_name), d.sumber === 'lama' ? el('div', null, badge('Sistem lama')) : null),
          el('td', { 'data-label': 'Rujukan' }, [d.ref_no, d.ma_no].filter(Boolean).join(' / ') || '-'),
          el('td', { 'data-label': 'Truck' }, d.truck || '-'),
          el('td', { 'data-label': 'Pengirim' }, d.from_name),
          el('td', { 'data-label': 'Penerima' }, d.to_name),
          el('td', { 'data-label': 'Item', class: 'num' }, String(d.item_count)),
          el('td', { 'data-label': 'Carton' }, d.total_carton || '-'),
          el('td', { 'data-label': 'Dokumen' }, el('div', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' },
            d.ada_pdf ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'PDF ' + d.report_name, onclick: (e) => download(e.currentTarget, d.do_id, 'pdf') }, icon('download'), 'PDF') : null,
            d.ada_xlsx ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Excel ' + d.report_name, onclick: (e) => download(e.currentTarget, d.do_id, 'xlsx') }, icon('download'), 'Excel') : null)),
          el('td', { 'data-label': 'Tindakan' }, el('div', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' },
            d.boleh_ubah ? el('a', { class: 'btn btn-ghost btn-sm', href: '#/ubah/' + encodeURIComponent(d.do_id), 'aria-label': 'Ubah ' + d.report_name }, icon('pencil')) : null,
            data.boleh_admin ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Padam ' + d.report_name, onclick: () => deleteModal(d) }, icon('x')) : null))))))),
      el('div', { class: 'pager' }, el('span', { class: 'caption' }, `${(filt.page - 1) * PAGE + 1}-${Math.min(filt.page * PAGE, rows.length)} daripada ${rows.length}`),
        el('div', { class: 'row' },
          el('button', { class: 'btn btn-secondary btn-sm', type: 'button', disabled: filt.page <= 1, onclick: () => { filt.page--; draw(); } }, 'Sebelum'),
          el('button', { class: 'btn btn-secondary btn-sm', type: 'button', disabled: filt.page >= pages, onclick: () => { filt.page++; draw(); } }, 'Seterusnya'))));
  };
  q.addEventListener('input', () => { filt.q = q.value; filt.page = 1; draw(); });
  const pdfBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('download'), 'Senarai PDF');
  pdfBtn.addEventListener('click', () => busy(pdfBtn, async () => { try { (await import('/claimreport/pdf.js')).listPdf(titleFor(), filtered()); } catch (e) { toast(e.message, 'danger'); } }));
  const zipBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('download'), 'Zip PDF');
  zipBtn.addEventListener('click', () => busy(zipBtn, async () => {
    try {
      const rows = filtered().filter((d) => d.ada_pdf);
      if (!rows.length) { toast('Tiada fail PDF dalam tapisan ini.', 'warning'); return; }
      const z = await call('zipPdfs', { dari: filt.dari, hingga: filt.hingga, do_ids: rows.map((d) => d.do_id) });
      saveBlob(z);
      toast(`${z.bil} PDF dizip.` + (z.gagal.length ? ` ${z.gagal.length} gagal dibuka.` : ''), z.gagal.length ? 'warning' : 'success');
    } catch (e) { if (e.status !== 401) toast(e.message, 'danger'); }
  }));
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Senarai DO'), el('a', { class: 'btn', href: '#/baru' }, icon('plus'), 'Jana DO baru')),
    dateFilter(draw), el('div', { class: 'row' }, el('div', { style: 'flex:1 1 220px' }, q), pdfBtn, zipBtn), host);
  draw();
}

function deleteModal(d) {
  const why = el('textarea', { class: 'input', rows: 3, maxlength: 300 });
  const err = errBox();
  openModal({
    title: 'Padam ' + d.report_name,
    body: el('div', { class: 'stack' }, err, el('p', { style: 'margin:0' }, 'Rekod ditanda dipadam dan hilang dari senarai. Rekod, PDF dan Excel masih disimpan untuk jejak audit.'), field('Sebab (wajib)', why, { required: true })),
    actions: [{ label: 'Batal', class: 'btn-secondary' }, { label: 'Ya, padam', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
      try { await call('deleteDO', { do_id: d.do_id, sebab: why.value }); close(); data = null; toast(`${d.report_name} dipadam.`, 'success'); if ((location.hash || '').startsWith('#/do/')) location.hash = '#/senarai'; else route(); } catch (e) { showErr(err, e); }
    }) }],
  });
}

// ------------------------------------------------------------------ butiran DO
async function renderDetail(id) {
  const d = await call('getDO', { do_id: id });
  const kv = (k, v) => [el('dt', null, k), el('dd', null, v === '' || v === null || v === undefined ? '-' : v)];
  const btn = (jenis, label) => el('button', { class: 'btn btn-sm' + (jenis === 'xlsx' ? ' btn-secondary' : ''), type: 'button', onclick: (e) => download(e.currentTarget, d.do_id, jenis) }, icon('download'), label);
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: '#/senarai' }, icon('arrow-left'), 'Senarai')),
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0;overflow-wrap:anywhere' }, d.report_name), d.sumber === 'lama' ? badge('Sistem lama') : null),
    el('div', { class: 'row' }, d.ada_pdf ? btn('pdf', 'PDF') : null, d.ada_xlsx ? btn('xlsx', 'Excel') : null,
      d.boleh_ubah ? el('a', { class: 'btn btn-secondary btn-sm', href: '#/ubah/' + encodeURIComponent(d.do_id) }, icon('pencil'), 'Ubah') : null,
      data?.boleh_admin || ctx.admin ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => deleteModal(d) }, icon('x'), 'Padam') : null),
    el('section', { class: 'card' }, el('dl', { class: 'kv' },
      ...kv('No DO', d.do_no_all), ...kv('Tarikh', formatDate(d.tarikh)), ...kv('APAC ticket', d.apac),
      ...kv('From', [d.from_name, d.from_address, d.from_attn && 'ATTN: ' + d.from_attn, d.from_tel && 'Tel: ' + d.from_tel].filter(Boolean).join('\n')),
      ...kv('To', [d.to_name, d.to_address, d.to_attn && 'ATTN: ' + d.to_attn, d.to_tel && 'Tel: ' + d.to_tel].filter(Boolean).join('\n')),
      ...kv('Total carton / pallet', d.total_carton), ...kv('Truck', d.truck), ...kv('Signer', d.signer), ...kv('Note', d.note),
      ...kv('Dijana oleh', `${d.dibuat_oleh || '-'}${d.dibuat ? ' · ' + formatDateTime(d.dibuat) : ''}`))),
    el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Senarai barang'),
      el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['#', 'Product code', 'Description', 'Qty', 'Unit'].map((x) => el('th', { scope: 'col' }, x)))),
        el('tbody', null, d.items.map((it, i) => el('tr', null, el('td', { 'data-label': '#' }, String(i + 1)), el('td', { 'data-label': 'Product code' }, it.productCode),
          el('td', { 'data-label': 'Description' }, it.description), el('td', { 'data-label': 'Qty', class: 'num' }, String(it.qty)), el('td', { 'data-label': 'Unit' }, it.unit))))))));
}

// ------------------------------------------------------------------ S-70 borang DO
function normalizePart(val, prefix) {
  let s = String(val || '').trim().toUpperCase().replace(/\s+/g, '');
  if (s && !s.startsWith(prefix)) s = prefix + s;
  return s;
}

async function renderForm(id) {
  const [m, d] = await Promise.all([loadMeta(), id ? call('getDO', { do_id: id }) : null]);
  if (d && !d.boleh_ubah) { location.replace('#/do/' + encodeURIComponent(id)); return; }
  const mine = !d || d.milik_saya;
  const refsHost = el('div', { class: 'stack' });
  const apacHost = el('div', { class: 'stack' });
  const itemsHost = el('div', { class: 'stack' });
  const doPrev = el('div', { class: 'cr-preview', 'aria-live': 'polite' });
  const totPrev = el('div', { class: 'cr-preview', 'aria-live': 'polite' });
  const refs = [], apacs = [], items = [];
  const renum = (arr, word) => arr.forEach((r, i) => { r.tag.textContent = `${word} ${i + 1}`; });

  const update = () => {
    const nos = refs.map((r) => { const main = normalizePart(r.no.value, r.type.value); const ma = normalizePart(r.ma.value, 'MA'); return main ? (ma ? main + '_' + ma : main) + m.suffix : ''; }).filter(Boolean);
    doPrev.textContent = nos.length ? nos.join('\n') : '(isi No RW / RC)';
    const g = {}, order = [];
    items.forEach((it) => { const u = it.unit.value; const q = Number(it.qty.value) || 0; if (!u || !q) return; if (!(u in g)) { g[u] = 0; order.push(u); } g[u] += q; });
    totPrev.textContent = order.length ? order.map((u) => `${g[u]} ${u}`).join(', ') : '-';
  };
  const addRef = (r = {}) => {
    const o = { type: sel([['RW', 'RW'], ['RC', 'RC']], r.type || 'RW'), no: inp({ maxlength: 60, value: r.no || '', placeholder: 'cth: 2606230354', inputmode: 'text' }), ma: inp({ maxlength: 60, value: r.ma || '', placeholder: 'cth: 2606230354 (pilihan)' }), tag: el('span', { class: 'tag' }) };
    o.node = el('div', { class: 'cr-row' }, o.tag, el('div', { class: 'cr-ref' }, field('Jenis', o.type), field('No RW / RC', o.no, { required: true }), field('No MA', o.ma),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Buang rujukan', onclick: () => { if (refs.length === 1) { toast('Sekurang-kurangnya 1 rujukan.', 'warning'); return; } refs.splice(refs.indexOf(o), 1); o.node.remove(); renum(refs, 'Rujukan'); update(); } }, icon('x'))));
    [o.type, o.no, o.ma].forEach((x) => x.addEventListener('input', update));
    refs.push(o); refsHost.append(o.node); renum(refs, 'Rujukan'); update();
  };
  const addApac = (v = '') => {
    const o = { v: inp({ maxlength: 60, value: v, placeholder: 'No APAC ticket' }), tag: el('span', { class: 'tag' }) };
    o.node = el('div', { class: 'cr-row' }, o.tag, el('div', { class: 'cr-apac' }, field('APAC ticket', o.v),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Buang APAC', onclick: () => { apacs.splice(apacs.indexOf(o), 1); o.node.remove(); renum(apacs, 'APAC'); } }, icon('x'))));
    apacs.push(o); apacHost.append(o.node); renum(apacs, 'APAC');
  };
  const addItem = (it = {}) => {
    const o = { code: inp({ maxlength: 80, value: it.productCode || '' }), desc: inp({ maxlength: 300, value: it.description || '' }), qty: inp({ type: 'number', inputmode: 'numeric', min: '1', step: '1', value: it.qty || '' }), unit: sel([['', '-'], ...m.units.map((u) => [u, u])], it.unit || ''), tag: el('span', { class: 'tag' }) };
    o.node = el('div', { class: 'cr-row' }, o.tag, el('div', { class: 'cr-item' }, field('Product code', o.code, { required: true }), field('Description', o.desc, { required: true }), field('Qty', o.qty, { required: true }), field('Unit', o.unit, { required: true }),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Buang item', onclick: () => { if (items.length === 1) { toast('Sekurang-kurangnya 1 item.', 'warning'); return; } items.splice(items.indexOf(o), 1); o.node.remove(); renum(items, 'Item'); update(); } }, icon('x'))));
    [o.qty, o.unit].forEach((x) => x.addEventListener('input', update));
    items.push(o); itemsHost.append(o.node); renum(items, 'Item'); update();
  };
  (d?.refs?.length ? d.refs : [{}]).forEach(addRef);
  (d ? d.apacs : ['']).forEach(addApac);
  (d?.items?.length ? d.items : [{}]).forEach(addItem);

  const party = (jenis) => {
    const f = { name: inp({ maxlength: 200, value: d?.[jenis + '_name'] || '' }), address: area(d?.[jenis + '_address'], { maxlength: 500, rows: 3 }), attn: inp({ maxlength: 200, value: d?.[jenis + '_attn'] || '' }), tel: inp({ maxlength: 60, value: d?.[jenis + '_tel'] || '' }) };
    const list = m.parties.filter((p) => p.jenis === jenis);
    const preset = sel([['', list.length ? '- Pilih dari senarai -' : '- Tiada alamat tersimpan -'], ...list.map((p) => [p.party_id, p.nama]), ['custom', 'Custom / Lain-lain']], '');
    preset.addEventListener('change', () => {
      const p = list.find((x) => x.party_id === preset.value);
      if (p) { f.name.value = p.nama; f.address.value = p.alamat; f.attn.value = p.attn; f.tel.value = p.tel; } else if (preset.value === 'custom') { f.name.value = ''; f.address.value = ''; f.attn.value = ''; f.tel.value = ''; f.name.focus(); }
    });
    // sistem lama: From lalai JingDong Logistics
    if (!d && jenis === 'from' && list[0]) { const jd = list.find((p) => /jingdong/i.test(p.nama)) || list[0]; preset.value = jd.party_id; preset.dispatchEvent(new Event('change')); }
    return { f, node: el('section', { class: 'cr-sec' }, el('h3', null, jenis === 'from' ? 'From (Pengirim)' : 'To (Penerima)'), field('Pilih alamat', preset),
      field('Nama syarikat', f.name, { required: true }), field('Alamat', f.address), el('div', { class: 'cr-grid' }, field('ATTN', f.attn), field('Tel', f.tel))) };
  };
  const from = party('from');
  const to = party('to');
  const tarikh = inp({ type: 'date', value: d?.tarikh || todayIso() });
  const truck = inp({ maxlength: 60, value: d?.truck || '', placeholder: 'cth: - atau no. plat' });
  const signer = inp({ maxlength: 200, value: d?.signer || ctx.me?.staff?.nama || '', placeholder: 'Nama authorized signer' });
  const note = area(d?.note, { maxlength: 1000, rows: 3, placeholder: 'Nota tambahan (jika ada)' });
  const sebab = d && !mine ? el('textarea', { class: 'input', rows: 2, maxlength: 300 }) : null;
  const err = errBox();
  const submit = el('button', { class: 'btn', type: 'submit' }, icon('check'), d ? 'Simpan & jana semula PDF / Excel' : 'Jana DO & simpan rekod');

  const payload = () => ({
    refs: refs.map((r) => ({ type: r.type.value, no: r.no.value.trim(), ma: r.ma.value.trim() })),
    apacs: apacs.map((a) => a.v.value.trim()).filter(Boolean), tarikh: tarikh.value,
    from_name: from.f.name.value, from_address: from.f.address.value, from_attn: from.f.attn.value, from_tel: from.f.tel.value,
    to_name: to.f.name.value, to_address: to.f.address.value, to_attn: to.f.attn.value, to_tel: to.f.tel.value,
    items: items.map((it) => ({ productCode: it.code.value.trim(), description: it.desc.value.trim(), qty: it.qty.value, unit: it.unit.value })),
    truck: truck.value, note: note.value, signer: signer.value,
  });
  const check = (p) => {
    const i = p.refs.findIndex((r) => !r.no);
    if (i >= 0) return `No rujukan (RW/RC) wajib diisi (Rujukan ${i + 1})`;
    if (!p.tarikh) return 'Isi tarikh';
    if (!p.from_name.trim()) return 'Isi nama syarikat From';
    if (!p.to_name.trim()) return 'Isi nama syarikat To';
    const j = p.items.findIndex((it) => !it.productCode || !it.description || !it.qty || !it.unit);
    if (j >= 0) return `Item ${j + 1}: product code, description, qty dan unit wajib diisi`;
    if (p.items.some((it) => !(Number(it.qty) > 0))) return 'QTY mesti nombor positif';
    if (!p.signer.trim()) return 'Isi nama pengesah / signer';
    if (sebab && sebab.value.trim().length < 5) return 'Nyatakan sebab mengubah DO staf lain';
    return '';
  };
  const form = el('form', { class: 'cr-form', novalidate: true },
    el('section', { class: 'cr-sec' }, el('h3', null, 'Maklumat DO'),
      el('h4', { style: 'margin:0' }, 'Rujukan utama (RW / RC & MA)'), refsHost,
      el('div', null, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => addRef() }, icon('plus'), 'Tambah RW / RC & MA')),
      el('h4', { style: 'margin:0' }, 'APAC ticket'), apacHost,
      el('div', null, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => addApac() }, icon('plus'), 'Tambah APAC ticket')),
      el('div', { class: 'cr-grid' }, el('div', { class: 'field' }, el('span', { class: 'label' }, 'No. DO (auto)'), doPrev), field('Tarikh', tarikh, { required: true }))),
    el('div', { class: 'cr-grid' }, from.node, to.node),
    el('section', { class: 'cr-sec' }, el('h3', null, 'Senarai barang'), itemsHost,
      el('div', null, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => addItem() }, icon('plus'), 'Tambah item')),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Total carton / pallet (auto)'), totPrev)),
    el('section', { class: 'cr-sec' }, el('h3', null, 'Maklumat tambahan'),
      el('div', { class: 'cr-grid' }, field('Truck', truck), field('Nama pengesah / signer', signer, { required: true })), field('Note', note),
      sebab ? field('Sebab mengubah DO staf lain', sebab, { required: true, hint: 'Direkod dalam log audit.' }) : null),
    err, el('div', { class: 'row' }, submit, el('a', { class: 'btn btn-ghost', href: d ? '#/do/' + encodeURIComponent(d.do_id) : '#/' }, 'Batal')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const p = payload();
    const bad = check(p);
    if (bad) { showErr(err, new Error(bad)); return; }
    await busy(submit, async () => {
      try {
        const res = d ? await call('updateDO', { ...p, do_id: d.do_id, sebab: sebab ? sebab.value : undefined }) : await call('createDO', p);
        data = null; meta = null;
        done(res, !!d);
      } catch (er) { if (er.status !== 401) showErr(err, er); }
    });
  });
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: d ? '#/do/' + encodeURIComponent(d.do_id) : '#/' }, icon('arrow-left'), 'Kembali')),
    el('h2', null, d ? 'Ubah ' + d.report_name : 'Jana DO baru (Sungrow Delivery Order)'),
    d ? el('div', { class: 'alert alert-info' }, 'PDF dan Excel akan dijana semula. Fail lama dibuang.') : null,
    form);
}

function done(res, edited) {
  clear(view);
  append(view, el('section', { class: 'card cr-done stack' },
    icon('circle-check'), el('h2', { style: 'margin:0' }, edited ? 'DO dikemas kini' : 'DO berjaya dijana'),
    el('p', { style: 'margin:0;overflow-wrap:anywhere' }, 'Nama fail: ', el('strong', null, res.report_name)),
    el('div', { class: 'row', style: 'justify-content:center' },
      el('button', { class: 'btn', type: 'button', onclick: (e) => download(e.currentTarget, res.do_id, 'pdf') }, icon('download'), 'Muat turun PDF'),
      el('button', { class: 'btn btn-secondary', type: 'button', onclick: (e) => download(e.currentTarget, res.do_id, 'xlsx') }, icon('download'), 'Muat turun Excel')),
    el('div', { class: 'row', style: 'justify-content:center' },
      el('a', { class: 'btn btn-ghost', href: '#/baru', onclick: () => { if (location.hash === '#/baru') route(); } }, icon('plus'), 'Jana DO baru'),
      el('a', { class: 'btn btn-ghost', href: '#/senarai' }, 'Senarai DO'))));
}

// ------------------------------------------------------------------ alamat tersimpan (admin buang)
async function renderParties() {
  meta = null;
  const m = await loadMeta();
  const list = (jenis) => m.parties.filter((p) => p.jenis === jenis);
  const card = (p) => el('li', null, el('span', { class: 'grow' }, el('strong', null, p.nama), el('div', { class: 'caption' }, [p.alamat, p.attn && 'ATTN: ' + p.attn, p.tel && 'Tel: ' + p.tel].filter(Boolean).join(' · '))),
    ctx.admin ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Buang ' + p.nama, onclick: async () => {
      if (!(await confirmDialog('Buang dari senarai?', `${p.nama} tidak lagi dipapar dalam pilihan alamat. DO lama tidak terjejas.`, { danger: true, okLabel: 'Buang' }))) return;
      try { await call('deleteParty', { party_id: p.party_id }); toast('Dibuang.', 'success'); route(); } catch (e) { toast(e.message, 'danger'); }
    } }, icon('x')) : null);
  append(view, el('h2', null, 'Alamat tersimpan'),
    el('p', { class: 'caption', style: 'margin:0' }, 'Alamat From / To disimpan sendiri setiap kali DO dijana, dan dikemas kini jika ATTN / alamat / tel berubah.'),
    ...['from', 'to'].map((j) => el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, j === 'from' ? 'From (Pengirim)' : 'To (Penerima)'),
      list(j).length ? el('ul', { class: 'file-list', style: 'list-style:none;margin:0;padding:0;display:grid;gap:6px' }, list(j).map(card)) : el('p', { class: 'muted', style: 'margin:0' }, 'Tiada.'))));
}

// ------------------------------------------------------------------ mula
async function start() {
  const c = await bootModule(MODULE, 'ClaimReport');
  ctx = { ...c, admin: c.superadmin || (c.roles || []).includes('admin') };
  const viewer = !ctx.admin && !(c.roles || []).includes('user');
  view = el('div', { id: 'view', class: 'stack' });
  append(clear(main), view);
  const nav = [
    { href: '#/', label: 'Ringkasan', ikon: 'chart-column', match: (h) => h === '#/' || h === '' },
    { href: '#/senarai', label: 'Senarai DO', ikon: 'scroll-text', match: (h) => h.startsWith('#/senarai') || h.startsWith('#/do/') },
  ];
  if (!viewer) nav.splice(1, 0, { href: '#/baru', label: 'Jana DO', ikon: 'plus', match: (h) => h.startsWith('#/baru') || h.startsWith('#/ubah/') });
  if (!viewer) nav.push({ href: '#/alamat', label: 'Alamat', ikon: 'map-pin', match: (h) => h.startsWith('#/alamat') });
  renderModuleNav(main, nav);
  main.removeAttribute('aria-busy');
  window.addEventListener('hashchange', route);
  await route();
}

start();
