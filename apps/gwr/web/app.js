// GWR - Ground Work Report OMP + PSS (F-30 hingga F-34; AFD S-30 hingga S-33; IPD 2F.1).
// Ikut GWR v4.2 lama (index.html borang + dashboard/): maklumat projek (manager/supervisor/engineer/chargeman sahaja),
// time in/out, PTW, job description berbilang baris dengan SHUTDOWN LV/MV, unresolved issue, manpower
// (Jawatan | Pax | Nama), gambar (dikecilkan, disusun), PIC klien untuk tandatangan, tandatangan staf, barisan offline,
// pautan klien + WhatsApp, dashboard (KPI, isu, prestasi staf).
// PDF draf/final dijana di SERVER (sistem lama: di pelayar). Identiti staf dari login (sistem lama: ditaip).
import { bootModule } from '/shared/lib/page.js';
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatDate, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderModuleNav, renderHeader, registerSW } from '/shared/ui/components.js';
import { prepareFile } from '/shared/lib/fileprep.js';
import { signaturePad } from '/shared/lib/signature.js';
import * as outbox from '/gwr/outbox.js';

const MODULE = 'gwr';
const CACHE_KEY = 'vp-gwr-ctx';
const main = document.getElementById('main');
let ctx;
let view;
let list = null;
let online = true;
const outboxBar = document.createElement('div');

const STATUS_KIND = { Draf: '', 'Menunggu klien': 'warning', Disahkan: 'success', Luput: 'danger', Dibatalkan: '' };
const MANPOWER_ROLES = ['Technician', 'Engineer', 'Chargeman', 'Supervisor'];
const LEVELS = ['manager', 'supervisor', 'engineer', 'chargeman', 'technician'];
const level = () => (ctx.superadmin ? 'manager' : LEVELS.find((l) => ctx.roles.includes(l)) || '');
const isPreparer = () => ['manager', 'supervisor', 'engineer', 'chargeman'].includes(level());

const call = (action, payload) => api(MODULE, action, payload || {}, { onSlow: () => toast('Masih memproses...', 'info', 2500) });
const callQuiet = (action, payload) => api(MODULE, action, payload || {});

function field(label, input, { hint, required, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') }, el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input, hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (a) => el('input', { class: 'input', autocomplete: 'off', ...a });
function sel(opts, value = '') { const s = el('select', { class: 'input' }, opts.map(([v, t]) => el('option', { value: v }, t))); if (opts.some(([v]) => v === value)) s.value = value; return s; }
const errBox = () => el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
const showErr = (b, e) => { clear(b).append(e.message || String(e)); b.hidden = false; b.scrollIntoView({ block: 'nearest' }); };
const fmtDt = (v) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v || '') ? formatDateTime(v) : v || '-');

async function blobUrl(payload) {
  const f = await call('getFile', payload);
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  return { url: URL.createObjectURL(new Blob([bytes], { type: f.mime })), mime: f.mime, nama: f.nama };
}
async function openPdf(payload) {
  try {
    const f = await blobUrl(payload);
    const a = el('a', { href: f.url, download: f.nama, target: '_blank', rel: 'noopener' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(f.url), 60000);
  } catch (e) { if (e.status !== 401) toast(e.message, 'danger'); }
}

// ------------------------------------------------------------------ pautan klien (sistem lama: showApprovalResult)
function linkModal(res, label, phone) {
  const text = `Berikut merupakan Ground Work Report Form | ${label}\nSila tekan link di bawah untuk approve kerja hari ini\n\n${res.pautan}\n\nVoltake TEAM`;
  let wa = String(phone || '').replace(/\D/g, '');
  if (wa.startsWith('0')) wa = '6' + wa;
  openModal({
    title: 'Pautan tandatangan klien',
    body: el('div', { class: 'stack' },
      el('p', { style: 'margin:0' }, 'Hantar pautan ini kepada klien. Pautan sekali guna, luput ', el('strong', null, formatDateTime(res.luput)), '.'),
      el('div', { class: 'gw-link' }, res.pautan),
      el('p', { class: 'caption', style: 'margin:0' }, 'Pautan tidak boleh dibuka semula dari sistem. Jika hilang, tekan "Jana pautan baharu" di butiran report.')),
    actions: [
      { label: 'Salin teks', class: 'btn-secondary', onClick: () => { navigator.clipboard?.writeText(text).then(() => toast('Teks disalin.', 'success')).catch(() => toast('Salin manual pautan di atas.', 'warning')); return false; } },
      { label: 'WhatsApp', onClick: () => { window.open((wa ? `https://wa.me/${wa}?text=` : 'https://api.whatsapp.com/send?text=') + encodeURIComponent(text), '_blank', 'noopener'); return false; } },
      { label: 'Tutup', class: 'btn-ghost' },
    ],
  });
}

// ------------------------------------------------------------------ outbox (S-31)
async function drawOutbox() {
  let jobs = [];
  try { jobs = await outbox.all(); } catch { /* storan disekat */ }
  clear(outboxBar);
  outboxBar.className = jobs.length ? 'gw-outbox' : '';
  if (!jobs.length) return;
  const fail = jobs.filter((j) => j.status === 'gagal');
  outboxBar.append(
    el('div', { class: 'row-between' }, el('strong', null, icon('wifi-off'), ` ${jobs.length} report menunggu dihantar`),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => busy(e.currentTarget, () => sendOutbox(true)) }, icon('refresh-cw'), 'Hantar sekarang')),
    el('p', { class: 'caption', style: 'margin:4px 0' }, 'Selamat walaupun telefon ditutup. Dihantar sendiri bila internet pulih dan app dibuka.'),
    el('ul', { class: 'file-list' }, jobs.map((j) => el('li', null,
      el('span', { class: 'grow' }, `${j.type === 'submit' ? 'Hantar' : 'Draf'} · ${j.label}`, j.error ? el('div', { class: 'caption', style: 'color:var(--danger)' }, j.error) : null),
      badge(j.status === 'gagal' ? 'Gagal' : j.status === 'sending' ? 'Menghantar' : 'Menunggu', j.status === 'gagal' ? 'danger' : 'warning'),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Buang ' + j.label, onclick: async () => { if (await confirmDialog('Buang dari barisan?', 'Report ini belum dihantar. Data akan hilang dari telefon ini.', { danger: true, okLabel: 'Buang' })) { await outbox.del(j.id); drawOutbox(); } } }, icon('x'))))),
    fail.length ? el('p', { class: 'caption', style: 'margin:4px 0 0' }, 'Gagal: betulkan masalah (contoh report sudah disahkan / tiada akses) atau buang dari barisan.') : null);
}

const progress = el('div', { class: 'gw-progress', hidden: true });
async function sendOutbox(manual) {
  await outbox.flush(callQuiet, {
    manual,
    onProgress: (t) => { progress.hidden = !t; clear(progress).append(t); },
    onChange: drawOutbox,
    onDone: (job, res) => {
      list = null;
      if (job.type === 'submit' && res.pautan) { toast(`${res.report_id} dihantar.`, 'success'); linkModal(res, job.label, job.phone); }
      else toast(`${res.report_id || job.label}: draf disimpan.`, 'success');
    },
  });
  await drawOutbox();
}

// ------------------------------------------------------------------ router
async function route() {
  const h = location.hash || '#/';
  clear(view);
  window.scrollTo(0, 0);
  try {
    if (h.startsWith('#/baru')) await renderForm(null);
    else if (h.startsWith('#/ubah/')) await renderForm(decodeURIComponent(h.slice(7)));
    else if (h.startsWith('#/r/')) await renderDetail(decodeURIComponent(h.slice(4)));
    else await renderList(new URLSearchParams(h.split('?')[1] || ''));
  } catch (e) {
    if (e.status !== 401) append(clear(view), el('div', { class: 'alert alert-danger' }, e.status === 0 ? 'Tiada sambungan. Report baru boleh diisi dan dihantar bila online.' : e.message));
  }
}

async function loadList() {
  list = await call('listReports');
  ctx.depts = list.depts;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ me: ctx.me, roles: ctx.roles, superadmin: ctx.superadmin, depts: list.depts })); } catch { /* abaikan */ }
}

// ------------------------------------------------------------------ S-32 dashboard (sistem lama: dashboard/ Overview, Job Monitoring, Issues, Performance)
const hasIssue = (v) => { const x = String(v || '').trim().toLowerCase(); return x !== '' && !['-', 'none', 'n/a', 'nil', 'tiada'].includes(x); };

async function renderList(params) {
  if (!online) { append(view, el('div', { class: 'alert alert-warning' }, 'Mod luar talian. Senarai report perlukan internet. Anda masih boleh isi report baru.'), el('a', { class: 'btn', href: '#/baru' }, icon('plus'), 'Report baru')); return; }
  if (!list) await loadList();
  const R = list.laporan;
  const tab = params.get('tab') || 'senarai';
  const q = inp({ type: 'search', placeholder: 'Cari No. PO, klien, projek, lokasi', 'aria-label': 'Cari', value: params.get('q') || '' });
  const st = sel([['', 'Semua status'], ['buka', 'Belum selesai (Draf / Menunggu / Luput)'], ...Object.keys(STATUS_KIND).map((s) => [s, s])], params.get('status') || '');
  const dp = list.depts.length > 1 ? sel([['', 'OMP & PSS'], ...list.depts.map((d) => [d, d])]) : null;
  const dari = inp({ type: 'date', 'aria-label': 'Dari tarikh' });
  const hingga = inp({ type: 'date', 'aria-label': 'Hingga tarikh' });
  st.setAttribute('aria-label', 'Status'); dp?.setAttribute('aria-label', 'Department');
  const host = el('div');
  const filtered = () => {
    const t = q.value.trim().toLowerCase();
    return R.filter((r) => (!st.value || (st.value === 'buka' ? ['Draf', 'Menunggu klien', 'Luput'].includes(r.status) : r.status === st.value))
      && (!dp || !dp.value || r.dept === dp.value) && (!dari.value || r.tarikh >= dari.value) && (!hingga.value || r.tarikh <= hingga.value)
      && (!t || `${r.po_number} ${r.client_company} ${r.project_title} ${r.location} ${r.report_id} ${r.staff_name}`.toLowerCase().includes(t)));
  };
  const card = (r) => el('article', { class: 'gw-card' },
    el('div', { class: 'top' },
      el('div', { style: 'min-width:0' }, el('a', { href: '#/r/' + encodeURIComponent(r.report_id) }, el('strong', null, r.po_number || r.report_id)),
        el('div', { class: 'meta' }, `${r.report_id} · ${r.dept} · ${r.tarikh ? formatDate(r.tarikh) : '-'}`),
        el('div', { class: 'desc' }, `${r.client_company || '-'} · ${r.project_title || ''}`), el('div', { class: 'meta' }, icon('map-pin'), ' ', r.location || '-', r.staff_name ? ` · ${r.staff_name}` : '')),
      el('div', { class: 'chips', style: 'justify-content:flex-end' }, badge(r.status, STATUS_KIND[r.status]), r.job_shutdown && r.job_shutdown !== 'NO' ? badge(r.job_shutdown.replace('YES', 'SHUTDOWN'), 'danger') : null, r.ptw === 'YES' ? badge('PTW', 'info') : null)),
    tab === 'isu' ? el('div', { class: 'alert alert-warning', style: 'margin-top:8px' }, r.unresolved_issue) : null);
  const draw = () => {
    const rows = filtered();
    clear(host);
    if (tab === 'prestasi') {
      const by = {};
      rows.forEach((r) => { if (!r.staff_name) return; by[r.staff_name] = by[r.staff_name] || { n: 0, ok: 0, last: '' }; by[r.staff_name].n++; if (r.status === 'Disahkan') by[r.staff_name].ok++; if (r.tarikh > by[r.staff_name].last) by[r.staff_name].last = r.tarikh; });
      const arr = Object.entries(by).sort((a, b) => b[1].n - a[1].n);
      host.append(arr.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['Staf', 'Report', 'Disahkan', 'Terkini'].map((x) => el('th', { scope: 'col' }, x)))),
        el('tbody', null, arr.map(([n, v]) => el('tr', null, el('td', { 'data-label': 'Staf' }, n), el('td', { 'data-label': 'Report', class: 'num' }, String(v.n)), el('td', { 'data-label': 'Disahkan', class: 'num' }, String(v.ok)), el('td', { 'data-label': 'Terkini' }, v.last ? formatDate(v.last) : '-')))))) : emptyState('users', 'Tiada data.'));
      return;
    }
    const show = tab === 'isu' ? rows.filter((r) => hasIssue(r.unresolved_issue)) : rows;
    host.append(show.length ? el('div', { class: 'gw-list' }, show.slice(0, 300).map(card)) : emptyState('search', tab === 'isu' ? 'Tiada isu tertunggak.' : 'Tiada report sepadan.'));
  };
  q.addEventListener('input', draw);
  [st, dp, dari, hingga].filter(Boolean).forEach((x) => x.addEventListener('change', draw));
  const n = (f) => R.filter(f).length;
  const tabs = [['senarai', 'Report'], ['isu', `Isu (${n((r) => hasIssue(r.unresolved_issue))})`]];
  if (level() !== 'technician') tabs.push(['prestasi', 'Prestasi staf']);
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, `Ground Work Report ${list.depts.join(' & ')}`),
      el('a', { class: 'btn', href: '#/baru' }, icon('plus'), isPreparer() ? 'Report baru' : 'Isi report')),
    el('div', { class: 'gw-stats' },
      el('a', { class: 'gw-stat', href: '#/' }, el('div', { class: 'label' }, 'Jumlah'), el('div', { class: 'v' }, String(R.length))),
      el('a', { class: 'gw-stat ok', href: '#/?status=Disahkan' }, el('div', { class: 'label' }, 'Disahkan'), el('div', { class: 'v' }, String(n((r) => r.status === 'Disahkan')))),
      el('a', { class: 'gw-stat warn', href: '#/?status=buka' }, el('div', { class: 'label' }, 'Belum selesai'), el('div', { class: 'v' }, String(n((r) => ['Draf', 'Menunggu klien', 'Luput'].includes(r.status))))),
      el('a', { class: 'gw-stat bad', href: '#/?tab=isu' }, el('div', { class: 'label' }, 'Ada isu'), el('div', { class: 'v' }, String(n((r) => hasIssue(r.unresolved_issue)))))),
    el('nav', { class: 'tabs', 'aria-label': 'Paparan' }, tabs.map(([id, t]) => el('a', { href: '#/?tab=' + id, 'aria-selected': String(id === tab) }, t))),
    el('div', { class: 'gw-filters', style: 'margin-top:12px' }, q, st, dp, dari, hingga), host);
  draw();
}

// ------------------------------------------------------------------ S-33 butiran
async function renderDetail(id) {
  const r = await call('getReport', { report_id: id });
  const kv = (k, v) => [el('dt', null, k), el('dd', null, v === null || v === undefined || v === '' ? '-' : v)];
  const label = `${r.po_number || r.report_id} | ${r.tarikh ? formatDate(r.tarikh) : ''}`;
  const imgs = el('div', { class: 'gw-thumbs' });
  const loadImgs = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('camera'), `Papar ${r.gambar.length} gambar`);
  loadImgs.addEventListener('click', () => busy(loadImgs, async () => {
    clear(imgs);
    for (const g of r.gambar) {
      try { const f = await blobUrl({ report_id: id, jenis: 'gambar', index: g.index }); imgs.append(el('figure', null, el('img', { src: f.url, alt: g.desc || 'Gambar ' + (g.index + 1) }), el('figcaption', null, g.desc))); } catch { /* abaikan */ }
    }
    loadImgs.hidden = true;
  }));
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, icon('arrow-left'), 'Senarai')),
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, r.po_number || r.report_id), el('div', { class: 'chips' }, badge(r.status, STATUS_KIND[r.status]), badge(r.dept, 'info'))),
    r.status === 'Luput' ? el('div', { class: 'alert alert-warning' }, 'Pautan klien telah luput atau dari sistem lama. Tekan "Jana pautan baharu" untuk hantar semula kepada klien.') : null,
    el('section', { class: 'card stack' },
      el('dl', { class: 'kv' },
        ...kv('Report ID', r.report_id), ...kv('Tarikh', r.tarikh ? formatDate(r.tarikh) : ''), ...kv('No. PO', r.po_number), ...kv('Quotation / MOS', [r.quotation_number, r.mos_number].filter(Boolean).join(' / ')),
        ...kv('Klien', r.client_company), ...kv('Projek', r.project_title), ...kv('Lokasi', r.location), ...kv('PIC klien', [r.pic_name, r.pic_phone].filter(Boolean).join(' · ')),
        ...kv('Time in / out', `${fmtDt(r.time_in)} → ${fmtDt(r.time_out)}`), ...kv('PTW', r.ptw || 'NO'), ...kv('Job shutdown', r.job_shutdown || 'NO'),
        ...kv('Staf', r.staff_name ? `${r.staff_name} (${r.staff_position || '-'})` : ''), ...kv('Dihantar', r.submitted_at ? formatDateTime(r.submitted_at) : ''),
        ...kv('Pautan luput', r.status === 'Menunggu klien' && r.pautan_luput ? formatDateTime(r.pautan_luput) : ''),
        ...kv('Disahkan oleh', r.client_sign_name ? `${r.client_sign_name} (${r.client_sign_position}) · ${formatDateTime(r.approved_at)}` : '')),
      el('div', { class: 'row' },
        r.ada_draf ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => openPdf({ report_id: id, jenis: 'draf' }) }, icon('download'), 'PDF draf') : null,
        r.ada_final ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => openPdf({ report_id: id, jenis: 'final' }) }, icon('download'), 'PDF final') : null,
        r.boleh_ubah ? el('a', { class: 'btn btn-secondary btn-sm', href: '#/ubah/' + encodeURIComponent(id) }, icon('pencil'), r.status === 'Draf' ? 'Sambung isi' : 'Ubah (pautan lama mati)') : null,
        r.boleh_pautan ? el('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => busy(e.currentTarget, async () => { try { const res = await call('regenerateLink', { report_id: id }); linkModal(res, label, r.sign_client_phone || r.pic_phone); } catch (er) { toast(er.message, 'danger'); } }) }, icon('share'), 'Jana pautan baharu') : null,
        r.boleh_batal ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => cancelModal(r) }, icon('x'), 'Batalkan') : null)),
    el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Job description'),
      r.job_items.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['Kerja', 'Remark'].map((x) => el('th', { scope: 'col' }, x)))),
        el('tbody', null, r.job_items.map((j) => el('tr', null, el('td', { 'data-label': 'Kerja' }, j.shutdown ? badge('SHUTDOWN' + (j.voltage ? ' ' + j.voltage : ''), 'danger') : null, ' ', j.desc), el('td', { 'data-label': 'Remark' }, j.remark || '-')))))) : el('p', { class: 'muted', style: 'margin:0' }, '-'),
      el('h3', { style: 'margin:8px 0 0' }, 'Unresolved issue & action'), el('p', { style: 'margin:0;white-space:pre-wrap' }, r.unresolved_issue || '-'),
      el('h3', { style: 'margin:8px 0 0' }, 'Manpower'), el('p', { style: 'margin:0;white-space:pre-wrap' }, r.manpower_items.map((m) => `${m.role || '-'} | ${m.count || '-'} pax | ${m.names || '-'}`).join('\n') || '-')),
    r.gambar.length ? el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Gambar'), loadImgs, imgs) : null);
}

function cancelModal(r) {
  const why = el('textarea', { class: 'input', rows: 3, maxlength: 300 });
  const err = errBox();
  openModal({
    title: 'Batalkan ' + r.report_id,
    body: el('div', { class: 'stack' }, err, el('p', null, 'Report ditanda Dibatalkan. Rekod dan fail disimpan. Pautan klien mati.'), field('Sebab (wajib)', why, { required: true })),
    actions: [{ label: 'Kembali', class: 'btn-secondary' }, { label: 'Batalkan report', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
      try { await call('cancelReport', { report_id: r.report_id, sebab: why.value }); close(); list = null; toast('Report dibatalkan.', 'success'); route(); } catch (e) { showErr(err, e); }
    }) }],
  });
}

// ------------------------------------------------------------------ S-30 borang
function rowsEditor(rows, makeRow, addLabel) {
  const host = el('div', { class: 'stack' });
  const items = [];
  const add = (data) => { const it = makeRow(data || {}, () => { items.splice(items.indexOf(it), 1); it.node.remove(); }); items.push(it); host.append(it.node); };
  (rows.length ? rows : [{}]).forEach(add);
  return { node: el('div', { class: 'stack' }, host, el('div', null, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => add() }, icon('plus'), addLabel))), value: () => items.map((i) => i.value()).filter(Boolean) };
}

function jobRow(j, remove) {
  const desc = el('textarea', { class: 'input', rows: 2, maxlength: 2000, placeholder: 'Kerja yang dibuat' }); desc.value = j.desc || '';
  const remark = inp({ maxlength: 500, placeholder: 'Remark', value: j.remark || '' });
  const sd = el('input', { type: 'checkbox', checked: !!j.shutdown });
  const volt = sel([['', 'Voltan'], ['LV', 'LV'], ['MV', 'MV']], j.voltage || '');
  volt.disabled = !sd.checked;
  sd.addEventListener('change', () => { volt.disabled = !sd.checked; });
  return {
    node: el('div', { class: 'gw-row' }, field('Job description', desc), field('Remark', remark),
      el('div', { class: 'row' }, el('label', { class: 'check' }, sd, 'Job shutdown'), volt, el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: remove }, icon('x'), 'Buang'))),
    value: () => (desc.value.trim() || remark.value.trim() ? { desc: desc.value.trim(), remark: remark.value.trim(), shutdown: sd.checked, voltage: sd.checked ? volt.value : '' } : null),
  };
}

function manRow(m, remove) {
  const role = sel([['', 'Jawatan'], ...MANPOWER_ROLES.map((r) => [r, r])], m.role || '');
  const count = inp({ type: 'number', inputmode: 'numeric', min: '0', max: '999', placeholder: 'Pax', value: m.count || '', style: 'max-width:90px' });
  const names = inp({ maxlength: 300, placeholder: 'Nama (cth: Aiman, Bukhari)', value: m.names || '' });
  names.addEventListener('input', () => { if (!count.dataset.manual) count.value = String(names.value.split(',').map((x) => x.trim()).filter(Boolean).length || ''); });
  count.addEventListener('input', () => { count.dataset.manual = '1'; });
  role.setAttribute('aria-label', 'Jawatan'); count.setAttribute('aria-label', 'Pax'); names.setAttribute('aria-label', 'Nama');
  return {
    node: el('div', { class: 'gw-row gw-man' }, role, count, names, el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Buang baris', onclick: remove }, icon('x'))),
    value: () => (role.value || count.value || names.value.trim() ? { role: role.value, count: count.value, names: names.value.trim() } : null),
  };
}

async function renderForm(id) {
  const r = id ? await call('getReport', { report_id: id }) : null;
  if (!r && !isPreparer()) {
    append(view, el('h2', null, 'Isi report'), el('div', { class: 'alert alert-info' }, 'Technician menyambung draf yang disediakan oleh manager / supervisor / engineer / chargeman (sistem lama). Cari No. PO di senarai dan tekan "Sambung isi".'), el('a', { class: 'btn', href: '#/?status=Draf' }, icon('search'), 'Cari draf'));
    return;
  }
  if (r && !r.boleh_ubah) { location.replace('#/r/' + encodeURIComponent(id)); return; }
  const canProject = r ? r.boleh_ubah_projek : isPreparer();
  if (!list && online) { try { await loadList(); } catch { /* guna cache */ } }
  const depts = list?.depts || ctx.depts || [];
  const f = {
    dept: sel(depts.map((d) => [d, d]), r?.dept || depts[0]),
    tarikh: inp({ type: 'date', value: r?.tarikh || todayIso() }),
    po_number: inp({ maxlength: 60, value: r?.po_number || '', placeholder: 'cth: PO-2026-001' }),
    quotation_number: inp({ maxlength: 60, value: r?.quotation_number || '' }),
    mos_number: inp({ maxlength: 60, value: r?.mos_number || '' }),
    client_company: inp({ maxlength: 120, value: r?.client_company || '' }),
    project_title: el('textarea', { class: 'input', rows: 2, maxlength: 300 }),
    location: inp({ maxlength: 200, value: r?.location || '', placeholder: 'cth: LSS4 Bukit Kayu Hitam, Kedah' }),
    pic_name: inp({ maxlength: 100, value: r?.pic_name || '' }),
    pic_phone: inp({ type: 'tel', maxlength: 20, value: r?.pic_phone || '' }),
    time_in: inp({ type: 'datetime-local', value: r?.time_in && /T/.test(r.time_in) ? r.time_in.slice(0, 16) : '' }),
    time_out: inp({ type: 'datetime-local', value: r?.time_out && /T/.test(r.time_out) ? r.time_out.slice(0, 16) : '' }),
    ptw: el('input', { type: 'checkbox', checked: r?.ptw === 'YES' }),
    unresolved_issue: el('textarea', { class: 'input', rows: 3, maxlength: 2000 }),
    sign_client_name: inp({ maxlength: 100, value: r?.sign_client_name || '' }),
    sign_client_position: inp({ maxlength: 120, value: r?.sign_client_position || '' }),
    sign_client_phone: inp({ type: 'tel', maxlength: 20, value: r?.sign_client_phone || '' }),
    staff_position: inp({ maxlength: 120, value: r?.staff_position || (level() ? level()[0].toUpperCase() + level().slice(1) : '') }),
  };
  f.project_title.value = r?.project_title || '';
  f.unresolved_issue.value = r?.unresolved_issue || '';
  ['dept', 'tarikh', 'po_number', 'quotation_number', 'mos_number', 'client_company', 'project_title', 'location', 'pic_name', 'pic_phone'].forEach((k) => { f[k].disabled = !canProject || (k === 'dept' && !!r); });
  const samePic = el('input', { type: 'checkbox' });
  samePic.addEventListener('change', () => { if (samePic.checked) { f.sign_client_name.value = f.pic_name.value; f.sign_client_phone.value = f.pic_phone.value; } });
  const jobs = rowsEditor(r?.job_items || [], jobRow, 'Tambah baris kerja');
  const man = rowsEditor(r?.manpower_items || [], manRow, 'Tambah baris manpower');

  // gambar: sedia ada (index) + baharu (data). Sistem lama: susun dengan seret; di sini butang naik / turun.
  let images = (r?.gambar || []).map((g) => ({ index: g.index, desc: g.desc }));
  const imgHost = el('ul', { class: 'file-list' });
  const imgIn = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', 'aria-label': 'Gambar' });
  const drawImgs = () => {
    clear(imgHost);
    images.forEach((im, i) => {
      const d = inp({ maxlength: 200, value: im.desc || '', placeholder: 'Keterangan gambar', 'aria-label': 'Keterangan gambar ' + (i + 1) });
      d.addEventListener('input', () => { im.desc = d.value; });
      const mv = (k) => { const j = i + k; if (j < 0 || j >= images.length) return; [images[i], images[j]] = [images[j], images[i]]; drawImgs(); };
      imgHost.append(el('li', null, el('span', { class: 'gw-num' }, String(i + 1)), im.url ? el('img', { src: im.url, alt: '', class: 'gw-mini' }) : el('span', { class: 'caption' }, 'tersimpan'),
        el('span', { class: 'grow' }, d),
        el('span', { class: 'gw-btns' },
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Naik', onclick: () => mv(-1) }, '↑'),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Turun', onclick: () => mv(1) }, '↓'),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Buang gambar ' + (i + 1), onclick: () => { images.splice(i, 1); drawImgs(); } }, icon('x')))));
    });
  };
  imgIn.addEventListener('change', async () => {
    const files = [...(imgIn.files || [])];
    imgIn.value = '';
    for (const file of files) {
      if (images.length >= 30) { toast('Maksimum 30 gambar.', 'warning'); break; }
      try { const p = await prepareFile(file, { pdf: false }); images.push({ data: p.data, url: URL.createObjectURL(p.blob), desc: '' }); } catch (e) { toast(`${file.name}: ${e.message}`, 'danger'); }
    }
    drawImgs();
  });
  drawImgs();

  const sig = signaturePad({ label: 'Tandatangan staf' });
  const err = errBox();
  const label = () => `${f.po_number.value || r?.report_id || 'Report baru'} | ${f.tarikh.value ? formatDate(f.tarikh.value) : ''}`;
  const fields = () => {
    const o = {
      time_in: f.time_in.value, time_out: f.time_out.value, ptw: f.ptw.checked, unresolved_issue: f.unresolved_issue.value,
      job_items: jobs.value(), manpower_items: man.value(),
      sign_client_name: f.sign_client_name.value, sign_client_position: f.sign_client_position.value, sign_client_phone: f.sign_client_phone.value, staff_position: f.staff_position.value,
    };
    if (canProject) ['tarikh', 'po_number', 'quotation_number', 'mos_number', 'client_company', 'project_title', 'location', 'pic_name', 'pic_phone'].forEach((k) => { o[k] = f[k].value; });
    if (!r) o.dept = f.dept.value;
    return o;
  };
  const check = (submit) => {
    if (f.time_in.value && f.time_out.value && f.time_out.value < f.time_in.value) return 'Time out mesti selepas time in';
    if (!r && !f.po_number.value.trim()) return 'Isi No. PO';
    if (!submit) return '';
    const miss = [];
    if (!f.tarikh.value) miss.push('Tarikh');
    if (!f.po_number.value.trim()) miss.push('No. PO');
    if (!f.client_company.value.trim()) miss.push('Klien');
    if (!f.project_title.value.trim()) miss.push('Tajuk projek');
    if (!f.location.value.trim()) miss.push('Lokasi');
    if (!f.pic_name.value.trim()) miss.push('PIC klien');
    if (!f.time_in.value || !f.time_out.value) miss.push('Time in / out');
    if (!jobs.value().length) miss.push('Job description');
    if (!man.value().length) miss.push('Manpower');
    if (!sig.has()) miss.push('Tandatangan staf');
    return miss.length ? 'Lengkapkan: ' + miss.join(', ') : '';
  };
  async function queue(submit, btn) {
    err.hidden = true;
    const bad = check(submit);
    if (bad) { showErr(err, new Error(bad)); return; }
    if (submit && !(await confirmDialog('Hantar untuk tandatangan klien?', 'PDF draf dijana dan pautan sekali guna disediakan untuk klien. Report boleh diubah sebelum klien sign (pautan lama mati).', { okLabel: 'Hantar' }))) return;
    await busy(btn, async () => {
      const job = await outbox.enqueue({
        type: submit ? 'submit' : 'save', label: label(), report_id: r?.report_id, client_req_id: outbox.uid(), submit_id: outbox.uid(),
        fields: fields(), susunan: r ? images.filter((im) => im.index !== undefined).map((im) => ({ index: im.index, desc: im.desc || '' })) : undefined,
        images: images.filter((im) => im.data).map((im) => ({ data: im.data, desc: im.desc || '' })),
        signature: submit ? sig.data() : undefined, staff_position: f.staff_position.value, phone: f.sign_client_phone.value || f.pic_phone.value,
      });
      try { localStorage.removeItem('vp-gwr-autosave'); } catch { /* abaikan */ }
      await drawOutbox();
      if (navigator.onLine) {
        await sendOutbox(true);
        const left = (await outbox.all()).find((j) => j.id === job.id);
        if (left && left.status === 'gagal') { showErr(err, new Error(left.error)); return; }
        if (left) { toast('Tiada sambungan stabil. Report disimpan dalam telefon dan akan dihantar sendiri.', 'warning'); }
      } else {
        toast('Tiada internet. Report disimpan dalam telefon dan akan dihantar bila online.', 'warning');
      }
      list = null;
      location.hash = '#/';
    });
  }
  const saveBtn = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('check'), 'Simpan draf');
  const sendBtn = el('button', { class: 'btn', type: 'button' }, icon('share'), 'Hantar untuk tandatangan klien');
  saveBtn.addEventListener('click', () => queue(false, saveBtn));
  sendBtn.addEventListener('click', () => queue(true, sendBtn));

  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: r ? '#/r/' + encodeURIComponent(r.report_id) : '#/' }, icon('arrow-left'), 'Kembali')),
    el('h2', null, r ? `${r.po_number || r.report_id} (${r.status})` : 'Ground Work Report baru'),
    r && r.status !== 'Draf' ? el('div', { class: 'alert alert-warning' }, 'Report ini sudah dihantar kepada klien. Jika diubah, pautan lama mati dan perlu dihantar semula.') : null,
    err,
    el('form', { class: 'gw-form', onsubmit: (e) => e.preventDefault(), novalidate: true },
      el('section', { class: 'gw-sec' }, el('h3', null, 'Maklumat projek'),
        !canProject ? el('p', { class: 'caption', style: 'margin:0' }, 'Diisi oleh manager / supervisor / engineer / chargeman.') : null,
        el('div', { class: 'gw-grid' },
          depts.length > 1 && !r ? field('Department', f.dept) : null,
          field('Tarikh', f.tarikh, { required: true }), field('No. PO', f.po_number, { required: true }), field('No. quotation', f.quotation_number), field('No. MOS', f.mos_number),
          field('Klien (syarikat)', f.client_company, { required: true }), field('Tajuk projek', f.project_title, { required: true, cls: 'full' }), field('Lokasi / site', f.location, { required: true, cls: 'full' }),
          field('PIC klien', f.pic_name, { required: true }), field('Telefon PIC', f.pic_phone))),
      el('section', { class: 'gw-sec' }, el('h3', null, 'Kerja'),
        el('div', { class: 'gw-grid' }, field('Time in', f.time_in, { required: true }), field('Time out', f.time_out, { required: true })),
        el('label', { class: 'check' }, f.ptw, 'Ada PTW (Permit To Work) untuk kerja ini'),
        jobs.node,
        field('Unresolved issue & action', f.unresolved_issue)),
      el('section', { class: 'gw-sec' }, el('h3', null, 'Manpower (Jawatan | Pax | Nama)'), man.node),
      el('section', { class: 'gw-sec' }, el('h3', null, 'Gambar'), el('p', { class: 'caption', style: 'margin:0' }, 'Dikecilkan sendiri supaya cepat naik walaupun signal lemah. 6 gambar setiap muka PDF.'),
        imgHost, el('div', null, el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => imgIn.click() }, icon('camera'), 'Ambil / pilih gambar'), imgIn)),
      el('section', { class: 'gw-sec' }, el('h3', null, 'Pengesahan'),
        el('label', { class: 'check' }, samePic, 'PIC tandatangan sama seperti PIC klien projek'),
        el('div', { class: 'gw-grid' }, field('Nama PIC klien (tandatangan)', f.sign_client_name), field('Jawatan PIC klien', f.sign_client_position), field('Telefon PIC klien (WhatsApp)', f.sign_client_phone), field('Jawatan anda', f.staff_position)),
        el('div', { class: 'field' }, el('span', { class: 'label' }, `Tandatangan ${ctx.me?.staff?.nama || 'staf'}`, el('span', { class: 'req' }, ' *')), sig.canvas,
          el('div', null, el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => sig.clear() }, icon('x'), 'Padam tandatangan')))),
      el('div', { class: 'row' }, sendBtn, saveBtn)));
}

// ------------------------------------------------------------------ mula (dengan mod luar talian)
async function start() {
  try {
    const c = await bootModule(MODULE, 'GWR');
    let old = null;
    try { old = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { /* tiada */ }
    ctx = { ...c, depts: old && old.me?.email === c.me?.email ? old.depts : undefined };
  } catch (e) {
    if (e.status !== 0) return;
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { /* tiada */ }
    if (!cached) { append(clear(main), el('div', { class: 'alert alert-warning' }, 'Tiada sambungan. Buka GWR sekali semasa online supaya boleh digunakan di site tanpa line.')); main.removeAttribute('aria-busy'); return; }
    ctx = cached;
    online = false;
    renderHeader(cached.me, 'GWR (luar talian)');
    registerSW();
  }
  view = el('div', { id: 'view', class: 'stack' });
  append(clear(main), progress, outboxBar, view);
  renderModuleNav(main, [
    { href: '#/', label: 'Report', ikon: 'scroll-text', match: (h) => !h.startsWith('#/baru') },
    { href: '#/baru', label: 'Baru', ikon: 'plus', match: (h) => h.startsWith('#/baru') },
  ]);
  main.removeAttribute('aria-busy');
  if (!(await outbox.available())) outboxBar.append(el('div', { class: 'alert alert-warning' }, 'Peranti ini menyekat simpanan tempatan. Barisan offline tidak aktif: jangan tutup app sebelum mesej berjaya.'));
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { online = true; sendOutbox(false); });
  await drawOutbox();
  await route();
  if (navigator.onLine) sendOutbox(false);
}

start();
