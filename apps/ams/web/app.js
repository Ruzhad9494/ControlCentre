// AMS (F-40 hingga F-43; AFD S-40 hingga S-43; IPD 2C).
// Skrin dan aliran ikut sistem AMS lama (voltake-energy/AMS index.html): papan pemuka KPI + lokasi, senarai aset
// dengan penapis status kalibrasi / lokasi / pinjaman + CSV, audit bulanan (Belum / Selesai, Baik satu tekan),
// kalibrasi semula, mobiliti (troli pinjam, pulang, admin sahkan). Klien untuk paparan sahaja: semua peraturan
// dan semakan role di Apps Script.
import { bootModule } from '/shared/lib/page.js';
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatDate, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderModuleNav } from '/shared/ui/components.js';
import { prepareFile } from '/shared/lib/fileprep.js';

const MODULE = 'ams';
const main = document.getElementById('main');
let ctx;
let view;
let cache = null;          // { at, data } senarai aset (dimuat semula selepas setiap perubahan)
const cart = new Set();    // troli pinjaman (asset_no)

const has = (r) => ctx.roles.includes(r) || (r === 'admin' && ctx.superadmin);
const isAdmin = () => has('admin');
const canAudit = () => isAdmin() || has('auditor');
const myName = () => ctx.me?.staff?.nama || '';

const CAL_KIND = { 'Telah Luput': 'danger', 'Lagi Seminggu': 'warning', 'Lagi Sebulan': 'warning', 'Masih Aktif': 'success', 'Tiada Data': '' };
const PINJAM_KIND = { Tersedia: 'success', Dipinjam: 'info', 'Menunggu pengesahan': 'warning' };
const AUDIT_KIND = { Baik: 'success', Rosak: 'warning', Hilang: 'danger' };
const CAL_FILTERS = [['', 'Semua status kalibrasi'], ['Masih Aktif', 'Masih Aktif'], ['Hampir Luput', 'Semua hampir luput'], ['Lagi Sebulan', '  Lagi sebulan'], ['Lagi Seminggu', '  Lagi seminggu'], ['Telah Luput', 'Telah Luput'], ['Tiada Data', 'Tiada data kalibrasi']];

const call = (action, payload) => api(MODULE, action, payload || {}, { onSlow: () => toast('Masih memproses...', 'info', 2500) });

function field(label, input, { hint, required, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') },
    el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input,
    hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (attrs) => el('input', { class: 'input', autocomplete: 'off', ...attrs });
const sel = (options, value = '') => {
  const s = el('select', { class: 'input' }, options.map(([v, t]) => el('option', { value: v }, t)));
  if (options.some(([v]) => v === value)) s.value = value; // nilai tak sah: kekal pilihan pertama
  return s;
};
const errBox = () => el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
const showErr = (box, e) => { clear(box).append(e.message || String(e)); box.hidden = false; box.scrollIntoView({ block: 'nearest' }); };
const assetName = (a) => `${a.make} ${a.model}`.trim();

async function loadAssets(force = false) {
  if (!force && cache && Date.now() - cache.at < 20000) return cache.data;
  cache = { at: Date.now(), data: await call('listAssets') };
  return cache.data;
}
const invalidate = () => { cache = null; };

// ------------------------------------------------------------------ fail
const FILE_TITLE = { sijil: 'Sijil kalibrasi', gambar: 'Gambar aset', audit: 'Gambar audit', pulang: 'Gambar semasa pulang', sijil_log: 'Sijil kalibrasi' };

async function viewFile(payload) {
  try {
    const f = await call('getFile', payload);
    const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
    const isImg = /^image\/(jpeg|png|webp)$/.test(f.mime);
    const download = () => { const a = el('a', { href: url, download: f.nama }); document.body.append(a); a.click(); a.remove(); };
    openModal({
      title: FILE_TITLE[payload.jenis],
      wide: true,
      body: isImg ? el('img', { src: url, alt: FILE_TITLE[payload.jenis], class: 'share-img' })
        : el('p', null, f.mime === 'application/pdf' ? 'Fail PDF. Tekan Muat turun untuk buka.' : 'Format ini tak boleh dipapar dalam pelayar. Tekan Muat turun.'),
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
      actions: [{ label: 'Tutup', class: 'btn-secondary' }, { label: 'Muat turun', onClick: () => download() }],
    });
  } catch (e) {
    if (e.status !== 401) toast(e.message, 'danger');
  }
}

/** Satu fail pilihan (gambar / sijil). Pulang { node, get(), reset() }. */
function filePicker({ label, hint, accept = 'image/*,application/pdf', pdf = true }) {
  let prepared = null;
  const input = el('input', { type: 'file', accept, class: 'sr-only', 'aria-label': label });
  const status = el('div', { class: 'caption' });
  const preview = el('div');
  const box = el('div', { class: 'file-pick' });
  const pick = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('camera'), 'Ambil gambar / pilih fail');
  const rm = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: true }, icon('x'), 'Buang');
  pick.addEventListener('click', () => input.click());
  const draw = () => {
    clear(status); clear(preview);
    box.classList.toggle('has', Boolean(prepared));
    rm.hidden = !prepared;
    if (prepared) {
      status.append(`${prepared.nama} (${(prepared.size / 1024).toFixed(0)} KB)`);
      if (/^image\/(jpeg|png|webp)$/.test(prepared.mime)) preview.append(el('img', { src: URL.createObjectURL(prepared.blob), alt: 'Preview ' + label }));
    } else status.append(hint || 'Belum ada fail.');
  };
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try { prepared = await prepareFile(f, { pdf }); } catch (e) { toast(e.message, 'danger'); input.value = ''; }
    draw();
  });
  rm.addEventListener('click', () => { prepared = null; input.value = ''; draw(); });
  append(box, el('div', { class: 'stack' }, el('div', { class: 'row', style: 'justify-content:center' }, pick, rm), status, preview), input);
  draw();
  return { node: box, get: () => prepared };
}
const upload = (p) => { const x = p.get(); return x ? { data: x.data } : undefined; };

// ------------------------------------------------------------------ router
async function route() {
  const h = location.hash || '#/';
  clear(view);
  window.scrollTo(0, 0);
  try {
    if (h.startsWith('#/aset/baru')) await renderAssetForm(null);
    else if (h.startsWith('#/ubah/')) await renderAssetForm(decodeURIComponent(h.slice(7)));
    else if (h.startsWith('#/aset/')) await renderAssetDetail(decodeURIComponent(h.slice(7)));
    else if (h.startsWith('#/aset')) await renderAssets(new URLSearchParams(h.split('?')[1] || ''));
    else if (h.startsWith('#/audit')) await renderAudit(h.split('/')[2] || 'belum');
    else if (h.startsWith('#/kalibrasi')) await renderRecalib();
    else if (h.startsWith('#/mobiliti')) await renderMobiliti(h.split('/')[2] || 'pinjam');
    else await renderDashboard();
  } catch (e) {
    if (e.status !== 401) append(clear(view), el('div', { class: 'alert alert-danger' }, e.message));
  }
}

function calBadge(a) { return badge(a.calib_status === 'Tiada Data' ? 'Tiada kalibrasi' : a.calib_status, CAL_KIND[a.calib_status]); }
function pinjamBadge(a) { return badge(a.status_pinjaman, PINJAM_KIND[a.status_pinjaman]); }

// ------------------------------------------------------------------ papan pemuka (sistem lama: updateDashboard)
function stat(label, value, { kind = '', href } = {}) {
  const inner = [el('div', { class: 'label' }, label), el('div', { class: 'v' }, String(value))];
  return href ? el('a', { class: 'am-stat ' + kind, href }, inner) : el('div', { class: 'am-stat ' + kind }, inner);
}

async function renderDashboard() {
  const d = await loadAssets(true);
  const A = d.aset;
  const n = (f) => A.filter(f).length;
  const soon = n((a) => a.calib_status === 'Lagi Sebulan' || a.calib_status === 'Lagi Seminggu');
  const done = A.filter((a) => a.diaudit_bulan_ini);
  const locs = {};
  A.forEach((a) => { const k = a.lokasi || 'TIDAK DINYATAKAN'; locs[k] = (locs[k] || 0) + 1; });
  const weight = { 'Telah Luput': 1, 'Lagi Seminggu': 2, 'Lagi Sebulan': 3 };
  const action = A.filter((a) => weight[a.calib_status]).sort((x, y) => weight[x.calib_status] - weight[y.calib_status] || (x.calib_hari ?? 0) - (y.calib_hari ?? 0));
  const bulan = new Date(d.hari_ini + 'T00:00:00').toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' });
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Papan pemuka aset'),
      isAdmin() ? el('a', { class: 'btn', href: '#/aset/baru' }, icon('plus'), 'Tambah aset') : null),
    el('section', { class: 'am-section' }, el('h3', null, 'Kalibrasi'),
      el('div', { class: 'am-stats' },
        stat('Jumlah aset', A.length, { href: '#/aset' }),
        stat('Masih aktif', n((a) => a.calib_status === 'Masih Aktif'), { kind: 'ok', href: '#/aset?cal=Masih%20Aktif' }),
        stat(`Hampir luput (${d.amaran_hari} hari)`, soon, { kind: soon ? 'warn' : '', href: '#/aset?cal=Hampir%20Luput' }),
        stat('Telah luput', n((a) => a.calib_status === 'Telah Luput'), { kind: n((a) => a.calib_status === 'Telah Luput') ? 'bad' : '', href: '#/aset?cal=Telah%20Luput' }))),
    el('section', { class: 'am-section' }, el('h3', null, `Audit ${bulan}`),
      el('div', { class: 'am-stats' },
        stat('Selesai diaudit', `${done.length} / ${A.length}`, { kind: 'info', href: canAudit() ? '#/audit/selesai' : undefined }),
        stat('Belum diaudit', A.length - done.length, { kind: A.length - done.length ? 'warn' : 'ok', href: canAudit() ? '#/audit/belum' : undefined }),
        stat('Baik', done.filter((a) => a.audit_status === 'Baik').length, { kind: 'ok' }),
        stat('Rosak', done.filter((a) => a.audit_status === 'Rosak').length, { kind: 'warn' }),
        stat('Hilang', done.filter((a) => a.audit_status === 'Hilang').length, { kind: 'bad' }))),
    el('section', { class: 'am-section' }, el('h3', null, 'Pinjaman'),
      el('div', { class: 'am-stats' },
        stat('Tersedia', n((a) => a.status_pinjaman === 'Tersedia'), { kind: 'ok', href: '#/aset?pinjam=Tersedia' }),
        stat('Dipinjam', n((a) => a.status_pinjaman === 'Dipinjam'), { kind: 'info', href: '#/aset?pinjam=Dipinjam' }),
        stat('Menunggu pengesahan', n((a) => a.status_pinjaman === 'Menunggu pengesahan'), { kind: 'warn', href: isAdmin() ? '#/mobiliti/sahkan' : '#/aset?pinjam=Menunggu%20pengesahan' }))),
    el('section', { class: 'card stack' },
      el('div', { class: 'row-between' }, el('h3', { style: 'margin:0' }, `Tindakan kalibrasi (${action.length})`),
        isAdmin() && action.length ? el('a', { class: 'btn btn-secondary btn-sm', href: '#/kalibrasi' }, icon('wrench'), 'Kalibrasi semula') : null),
      action.length ? el('ul', { class: 'file-list' }, action.slice(0, 10).map((a) => el('li', null,
        el('a', { class: 'grow', href: '#/aset/' + encodeURIComponent(a.asset_no) }, el('strong', null, assetName(a)), el('span', { class: 'caption' }, ` · SN ${a.serial_no}`)),
        calBadge(a), el('span', { class: 'caption num' }, formatDate(a.calib_expiry)))))
        : emptyState('circle-check', 'Tiada aset luput atau hampir luput.'),
      action.length > 10 ? el('a', { href: '#/aset?cal=Hampir%20Luput' }, `Lihat semua (${action.length})`) : null),
    el('section', { class: 'am-section' }, el('h3', null, 'Aset ikut lokasi'),
      el('div', { class: 'am-stats' }, Object.entries(locs).sort((a, b) => b[1] - a[1]).map(([loc, c]) =>
        el('a', { class: 'am-stat', href: '#/aset?lokasi=' + encodeURIComponent(loc) },
          el('div', { class: 'label' }, icon('map-pin'), ' ', loc), el('div', { class: 'v' }, `${c} aset`))))));
}

// ------------------------------------------------------------------ S-40 senarai aset (sistem lama: filterAssets + downloadCSV)
function matchCal(a, f) {
  if (!f) return true;
  if (f === 'Hampir Luput') return a.calib_status === 'Lagi Sebulan' || a.calib_status === 'Lagi Seminggu';
  return a.calib_status === f;
}

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;             // elak formula injection dalam Excel
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(rows) {
  const head = ['No.', 'No. aset', 'Kategori', 'Jenama (Make)', 'Model', 'Siri (S/N)', 'Lokasi asal', 'Lokasi semasa', 'Pemegang semasa', 'Status pinjaman',
    'Tarikh luput sijil', 'Status luput', 'Dikalibrasi oleh', 'Audit terakhir', 'Status audit', 'Catatan audit'];
  const lines = [head, ...rows.map((a, i) => [i + 1, a.asset_no, a.kategori, a.make, a.model, a.serial_no, a.lokasi_asal, a.lokasi_semasa || a.lokasi, a.pemegang_nama,
    a.status_pinjaman, a.calib_expiry ? formatDate(a.calib_expiry) : '', a.calib_status, a.calib_by, a.last_audit_date ? formatDate(a.last_audit_date) : '', a.audit_status, a.audit_remark])];
  const blob = new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `Senarai_Aset_${todayIso().replace(/-/g, '')}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function assetCard(a, { actions, top } = {}) {
  return el('article', { class: 'am-card' },
    top || null,
    el('div', { class: 'top' },
      el('div', { style: 'min-width:0' },
        el('a', { href: '#/aset/' + encodeURIComponent(a.asset_no) }, el('strong', null, assetName(a))),
        el('div', { class: 'sn' }, `No. ${a.asset_no} · SN ${a.serial_no} · ${a.kategori}`),
        el('div', { class: 'meta' }, icon('map-pin'), ' ', a.lokasi || '-', a.pemegang_nama ? ` · ${a.pemegang_nama}` : '')),
      el('div', { class: 'chips', style: 'justify-content:flex-end' }, calBadge(a), pinjamBadge(a))),
    el('div', { class: 'meta' }, a.calib_expiry ? `Sijil luput ${formatDate(a.calib_expiry)}` : 'Tiada tarikh kalibrasi', a.last_audit_date ? ` · Audit ${formatDate(a.last_audit_date)} (${a.audit_status || '-'})` : ''),
    actions ? el('div', { class: 'row', style: 'margin-top:8px' }, actions) : null);
}

async function renderAssets(params) {
  const d = await loadAssets();
  const locs = [...new Set(d.aset.map((a) => a.lokasi || 'TIDAK DINYATAKAN'))].sort();
  const q = inp({ type: 'search', placeholder: 'Cari jenama, model, siri, kategori, lokasi', 'aria-label': 'Cari aset' });
  const cal = sel(CAL_FILTERS, params.get('cal') || '');
  const lok = sel([['', 'Semua lokasi'], ...locs.map((l) => [l, l])], params.get('lokasi') || '');
  const pin = sel([['', 'Semua pinjaman'], ['Tersedia', 'Tersedia'], ['Dipinjam', 'Dipinjam'], ['Menunggu pengesahan', 'Menunggu pengesahan']], params.get('pinjam') || '');
  [cal, lok, pin].forEach((s, i) => s.setAttribute('aria-label', ['Status kalibrasi', 'Lokasi', 'Status pinjaman'][i]));
  const count = el('span', { class: 'caption' });
  const host = el('div', { class: 'am-list' });
  let shown = [];
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    shown = d.aset.filter((a) => matchCal(a, cal.value)
      && (!lok.value || (a.lokasi || 'TIDAK DINYATAKAN') === lok.value)
      && (!pin.value || a.status_pinjaman === pin.value)
      && (!term || `${a.asset_no} ${a.make} ${a.model} ${a.serial_no} ${a.kategori} ${a.lokasi} ${a.lokasi_asal}`.toLowerCase().includes(term)));
    clear(count).append(`${shown.length} daripada ${d.aset.length} aset`);
    clear(host);
    if (!shown.length) { host.append(emptyState('package', 'Tiada aset sepadan.')); return; }
    host.append(...shown.slice(0, 300).map((a) => assetCard(a)));
    if (shown.length > 300) host.append(el('p', { class: 'caption' }, 'Hanya 300 pertama dipapar. Guna carian atau penapis.'));
  };
  q.addEventListener('input', draw);
  [cal, lok, pin].forEach((s) => s.addEventListener('change', draw));
  const csv = el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => (shown.length ? downloadCsv(shown) : toast('Tiada data untuk dimuat turun.', 'info')) }, icon('download'), 'CSV');
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Senarai aset'),
      el('div', { class: 'row' }, csv, isAdmin() ? el('a', { class: 'btn', href: '#/aset/baru' }, icon('plus'), 'Tambah aset') : null)),
    el('div', { class: 'am-filters' }, q, cal, lok, pin), count, host);
  draw();
}

// ------------------------------------------------------------------ S-41 butiran aset
async function renderAssetDetail(no) {
  const a = await call('getAsset', { asset_no: no });
  const kv = (k, v) => [el('dt', null, k), el('dd', null, v === null || v === undefined || v === '' ? '-' : v)];
  const btns = [
    a.ada_sijil ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => viewFile({ asset_no: no, jenis: 'sijil' }) }, icon('scroll-text'), 'Sijil kalibrasi') : null,
    a.ada_gambar ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => viewFile({ asset_no: no, jenis: 'gambar' }) }, icon('camera'), 'Gambar aset') : null,
    isAdmin() ? el('a', { class: 'btn btn-secondary', href: '#/ubah/' + encodeURIComponent(no) }, icon('pencil'), 'Ubah') : null,
    isAdmin() ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => recalibModal(a, () => { invalidate(); route(); }) }, icon('wrench'), 'Kalibrasi semula') : null,
    canAudit() ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => auditModal(a, 'Baik', () => { invalidate(); route(); }) }, icon('clipboard-check'), 'Audit') : null,
    isAdmin() && a.status_pinjaman !== 'Tersedia' ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => approveModal({ asset_no: no, asset: a }, () => { invalidate(); route(); }) }, icon('undo-2'), 'Terima pulang') : null,
    isAdmin() && a.status_pinjaman === 'Tersedia' ? el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => disposeModal(a) }, icon('x'), 'Lupus aset') : null,
  ];
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: '#/aset' }, icon('arrow-left'), 'Senarai aset')),
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, assetName(a)), el('div', { class: 'chips' }, calBadge(a), pinjamBadge(a))),
    el('section', { class: 'card stack' },
      el('dl', { class: 'kv' },
        kv('No. aset', a.asset_no), kv('Kategori', a.kategori), kv('No. siri', a.serial_no),
        kv('Lokasi asal', a.lokasi_asal), kv('Lokasi semasa', a.lokasi_semasa), kv('Pemegang', a.pemegang_nama),
        kv('Tarikh kalibrasi', a.calib_date ? formatDate(a.calib_date) : null),
        kv('Tarikh luput', a.calib_expiry ? `${formatDate(a.calib_expiry)}${a.calib_hari !== null ? ` (${a.calib_hari < 0 ? Math.abs(a.calib_hari) + ' hari lalu' : a.calib_hari + ' hari lagi'})` : ''}` : null),
        kv('Dikalibrasi oleh', a.calib_by),
        kv('Audit terakhir', a.last_audit_date ? `${formatDate(a.last_audit_date)} · ${a.audit_status}${a.audit_remark ? ' · ' + a.audit_remark : ''}` : null),
        kv('Catatan', a.catatan)),
      el('div', { class: 'row' }, btns)),
    a.kalibrasi.length ? el('section', { class: 'card stack' }, el('h3', null, 'Sejarah kalibrasi'),
      el('ol', { class: 'timeline' }, a.kalibrasi.map((k) => el('li', null,
        el('div', null, el('strong', null, k.tarikh_kalibrasi ? formatDate(k.tarikh_kalibrasi) : '-'), k.tarikh_luput ? ` → luput ${formatDate(k.tarikh_luput)}` : '', ` · ${k.calib_by || '-'}`),
        k.catatan ? el('div', { class: 't' }, k.catatan) : null,
        k.ada_sijil ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ asset_no: no, jenis: 'sijil_log', log_id: k.log_id }) }, 'Lihat sijil') : null)))) : null,
    a.audit ? el('section', { class: 'card stack' }, el('h3', null, 'Sejarah audit'),
      a.audit.length ? el('ol', { class: 'timeline' }, a.audit.map((x) => el('li', null,
        el('div', null, el('strong', null, formatDate(x.tarikh)), ' ', badge(x.keadaan, AUDIT_KIND[x.keadaan]), ` oleh ${x.auditor_nama || '-'}`),
        x.catatan ? el('div', null, x.catatan) : null,
        x.ada_gambar ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ asset_no: no, jenis: 'audit', audit_id: x.audit_id }) }, 'Lihat gambar') : null)))
        : el('p', { class: 'muted' }, 'Belum ada audit dalam sistem baharu.')) : null,
    el('section', { class: 'card stack' }, el('h3', null, canAudit() ? 'Sejarah pinjaman' : 'Pinjaman saya'),
      a.pinjaman.length ? el('ol', { class: 'timeline' }, a.pinjaman.map((m) => movementItem(m))) : el('p', { class: 'muted' }, 'Tiada rekod pinjaman.')));
}

function movementItem(m) {
  return el('li', null,
    el('div', null, el('strong', null, m.peminjam_nama || '-'), ' ', badge(m.status, m.status === 'Selesai' ? 'success' : m.status === 'Dipinjam' ? 'info' : 'warning'), m.lewat ? badge('Lewat', 'danger') : null),
    el('div', null, `${m.nama_projek} @ ${m.lokasi}`),
    el('div', { class: 't' }, m.tarikh_pinjam ? `Pinjam ${formatDateTime(m.tarikh_pinjam)}` : '', m.tempoh_hari ? ` · ${m.tempoh_hari} hari (jangka pulang ${formatDate(m.tarikh_jangka_pulang)})` : '',
      m.tarikh_pulang ? ` · Pulang ${formatDate(m.tarikh_pulang)} (${m.keadaan_pulang || '-'})` : ''),
    m.catatan_pulang ? el('div', { class: 't' }, m.catatan_pulang) : null,
    m.status === 'Selesai' ? el('div', { class: 't' }, `Disahkan ${m.approved_by_name || '-'} · ${formatDateTime(m.approved_at)} · ${m.keadaan_akhir} · ${m.lokasi_akhir}`) : null,
    m.ada_gambar_pulang ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'pulang', movement_id: m.movement_id }) }, 'Gambar semasa pulang') : null);
}

function disposeModal(a) {
  const why = el('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Contoh: Rosak teruk, tidak ekonomik dibaiki' });
  const err = errBox();
  openModal({
    title: 'Lupus aset ' + a.asset_no,
    body: el('div', { class: 'stack' }, err, el('p', null, `${assetName(a)} · SN ${a.serial_no}`), field('Sebab (wajib)', why, { required: true, hint: 'Aset hilang dari senarai. Rekod dan fail disimpan dalam Sheet/Drive.' })),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Lupus aset', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
        try { await call('disposeAsset', { asset_no: a.asset_no, sebab: why.value }); close(); invalidate(); toast(`Aset ${a.asset_no} dilupus.`, 'success'); location.hash = '#/aset'; } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ tambah / ubah aset (admin)
async function renderAssetForm(no) {
  if (!isAdmin()) { append(view, el('div', { class: 'alert alert-danger' }, 'Hanya admin aset boleh tambah atau ubah aset.')); return; }
  const a = no ? await call('getAsset', { asset_no: no }) : null;
  const d = await loadAssets();
  const kategori = [...new Set(d.aset.map((x) => x.kategori).filter(Boolean))].sort();
  const dl = el('datalist', { id: 'kat-list' }, kategori.map((k) => el('option', { value: k })));
  const f = {
    kategori: inp({ value: a?.kategori || '', maxlength: 100, list: 'kat-list' }),
    make: inp({ value: a?.make || '', maxlength: 100 }),
    model: inp({ value: a?.model || '', maxlength: 100 }),
    serial_no: inp({ value: a?.serial_no || '', maxlength: 100 }),
    lokasi_asal: inp({ value: a?.lokasi_asal || 'HQ', maxlength: 100 }),
    lokasi_semasa: inp({ value: a?.lokasi_semasa || '', maxlength: 100, disabled: Boolean(a && a.status_pinjaman !== 'Tersedia') }),
    calib_expiry: inp({ type: 'date', value: a?.calib_expiry || '' }),
    calib_by: inp({ value: a?.calib_by || '', maxlength: 100, placeholder: 'Contoh: SIRIM Berhad' }),
    catatan: el('textarea', { class: 'input', rows: 2, maxlength: 500 }),
  };
  f.catatan.value = a?.catatan || '';
  const sijil = filePicker({ label: 'Sijil kalibrasi', hint: a?.ada_sijil ? 'Sijil sedia ada disimpan. Pilih fail untuk ganti.' : 'PDF atau gambar sijil (pilihan).' });
  const gambar = filePicker({ label: 'Gambar aset', accept: 'image/*', pdf: false, hint: a?.ada_gambar ? 'Gambar sedia ada disimpan. Pilih untuk ganti.' : 'Pilihan.' });
  const err = errBox();
  const save = el('button', { class: 'btn', type: 'button' }, icon('check'), a ? 'Simpan perubahan' : 'Tambah aset');
  save.addEventListener('click', () => busy(save, async () => {
    err.hidden = true;
    const miss = [['kategori', 'Kategori'], ['make', 'Make'], ['model', 'Model'], ['serial_no', 'No. siri'], ['lokasi_asal', 'Lokasi asal']].find(([k]) => !f[k].value.trim());
    if (miss) { showErr(err, new Error(`Isi ${miss[1]}. Guna "N/A" jika tiada no. siri.`)); return; }
    try {
      const r = await call('saveAsset', {
        asset_no: a?.asset_no, kategori: f.kategori.value, make: f.make.value, model: f.model.value, serial_no: f.serial_no.value, lokasi_asal: f.lokasi_asal.value,
        lokasi_semasa: a ? f.lokasi_semasa.value : undefined, calib_expiry: f.calib_expiry.value, calib_by: f.calib_by.value, catatan: f.catatan.value,
        sijil: upload(sijil), gambar: upload(gambar),
      });
      invalidate();
      toast(a ? `Aset ${r.asset_no} dikemas kini.` : `Aset ${r.asset_no} ditambah.`, 'success');
      location.hash = '#/aset/' + encodeURIComponent(r.asset_no);
    } catch (e) { showErr(err, e); }
  }));
  append(view,
    el('h2', null, a ? `Ubah aset ${a.asset_no}` : 'Tambah aset'),
    el('form', { class: 'am-form', onsubmit: (e) => e.preventDefault(), novalidate: true }, err, dl,
      el('div', { class: 'am-grid' },
        field('Kategori', f.kategori, { required: true, cls: 'full' }),
        field('Make (jenama)', f.make, { required: true }), field('Model', f.model, { required: true }),
        field('No. siri', f.serial_no, { required: true }), field('Lokasi asal', f.lokasi_asal, { required: true }),
        a ? field('Lokasi semasa', f.lokasi_semasa, { cls: 'full', hint: a.status_pinjaman !== 'Tersedia' ? 'Aset sedang dipinjam: lokasi ditukar bila pemulangan disahkan.' : '' }) : null,
        field('Tarikh luput kalibrasi', f.calib_expiry, { hint: 'Kosongkan jika aset tak perlu kalibrasi.' }), field('Dikalibrasi oleh', f.calib_by)),
      field('Catatan', f.catatan),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Sijil kalibrasi'), sijil.node),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Gambar aset'), gambar.node),
      el('p', { class: 'caption' }, a ? 'Untuk sijil kalibrasi baharu, guna "Kalibrasi semula" supaya sejarah kalibrasi direkod.' : ''),
      el('div', { class: 'row' }, save, el('a', { class: 'btn btn-ghost', href: a ? '#/aset/' + encodeURIComponent(a.asset_no) : '#/aset' }, 'Batal'))));
}

// ------------------------------------------------------------------ F-41 kalibrasi semula (admin)
function recalibModal(a, done) {
  const tk = inp({ type: 'date', max: todayIso(), value: todayIso() });
  const tl = inp({ type: 'date' });
  const by = inp({ maxlength: 100, value: a.calib_by || '', placeholder: 'Contoh: SIRIM Berhad' });
  const note = inp({ maxlength: 500 });
  const sijil = filePicker({ label: 'Sijil baharu', hint: 'Wajib: sijil kalibrasi (PDF atau gambar).' });
  const err = errBox();
  openModal({
    title: 'Kalibrasi semula',
    wide: true,
    body: el('div', { class: 'stack' }, err,
      el('p', null, el('strong', null, assetName(a)), ` · SN ${a.serial_no} · luput sekarang ${a.calib_expiry ? formatDate(a.calib_expiry) : '-'}`),
      el('div', { class: 'am-grid' }, field('Tarikh kalibrasi', tk, { required: true }), field('Tarikh luput baharu', tl, { required: true }),
        field('Dikalibrasi oleh', by, { required: true, cls: 'full' }), field('Catatan', note, { cls: 'full' })),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Sijil kalibrasi', el('span', { class: 'req' }, ' *')), sijil.node)),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan kalibrasi', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        if (!tl.value) { showErr(err, new Error('Isi tarikh luput baharu')); return; }
        if (!sijil.get()) { showErr(err, new Error('Muat naik sijil kalibrasi')); return; }
        try {
          await call('recalibrate', { asset_no: a.asset_no, tarikh_kalibrasi: tk.value, tarikh_luput: tl.value, calib_by: by.value, catatan: note.value, sijil: upload(sijil) });
          close(); toast('Sijil kalibrasi baharu direkod.', 'success'); done && done();
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

async function renderRecalib() {
  if (!isAdmin()) { append(view, el('div', { class: 'alert alert-danger' }, 'Hanya admin aset boleh rekod kalibrasi.')); return; }
  const d = await loadAssets(true);
  const order = { 'Telah Luput': 1, 'Lagi Seminggu': 2, 'Lagi Sebulan': 3, 'Masih Aktif': 4, 'Tiada Data': 5 };
  const q = inp({ type: 'search', placeholder: 'Cari jenama, model, siri', 'aria-label': 'Cari aset' });
  const host = el('div', { class: 'am-list' });
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const rows = d.aset.filter((a) => (term ? `${a.make} ${a.model} ${a.serial_no} ${a.kategori}`.toLowerCase().includes(term) : order[a.calib_status] <= 3))
      .sort((x, y) => order[x.calib_status] - order[y.calib_status] || (x.calib_hari ?? 9e9) - (y.calib_hari ?? 9e9));
    clear(host);
    if (!rows.length) { host.append(emptyState('circle-check', term ? 'Tiada aset sepadan.' : 'Tiada aset luput atau hampir luput. Cari aset untuk kalibrasi awal.')); return; }
    host.append(...rows.slice(0, 200).map((a) => assetCard(a, { actions: [el('button', { class: 'btn btn-sm', type: 'button', onclick: () => recalibModal(a, async () => { invalidate(); clear(view); await renderRecalib(); }) }, icon('wrench'), 'Kalibrasi semula')] })));
  };
  q.addEventListener('input', draw);
  append(view, el('h2', null, 'Kalibrasi semula'),
    el('p', { class: 'muted' }, 'Senarai aset yang luput atau hampir luput. Cari untuk aset lain. Setiap kalibrasi direkod dalam sejarah aset bersama sijil.'), q, host);
  draw();
}

// ------------------------------------------------------------------ S-42 audit bulanan (admin, auditor)
function auditModal(a, keadaan, done) {
  const k = sel([['Baik', 'Baik'], ['Rosak', 'Rosak'], ['Hilang', 'Hilang']], keadaan);
  const note = el('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Nyatakan kerosakan / bila kali terakhir dilihat' });
  const lokasi = inp({ maxlength: 100, value: a.lokasi_semasa || a.lokasi || '' });
  const pic = filePicker({ label: 'Gambar audit', accept: 'image/*', pdf: false, hint: 'Pilihan: gambar keadaan aset.' });
  const err = errBox();
  openModal({
    title: 'Audit ' + assetName(a),
    body: el('div', { class: 'stack' }, err, el('p', { class: 'caption' }, `No. ${a.asset_no} · SN ${a.serial_no}`),
      field('Keadaan', k, { required: true }), field('Catatan', note, { hint: 'Wajib jika Rosak atau Hilang.' }), field('Lokasi ditemui', lokasi), pic.node),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan audit', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        if (k.value !== 'Baik' && note.value.trim().length < 3) { showErr(err, new Error('Sila masukkan catatan untuk menyokong status ini.')); return; }
        try {
          await call('recordAudit', { asset_no: a.asset_no, keadaan: k.value, catatan: note.value, lokasi_ditemui: lokasi.value, gambar: upload(pic) });
          close(); toast(`Selesai: aset dikemas kini sebagai ${k.value}`, 'success'); done && done();
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

async function renderAudit(tab) {
  if (!canAudit()) { append(view, el('div', { class: 'alert alert-danger' }, 'Hanya admin atau auditor boleh buka skrin audit.')); return; }
  const d = await loadAssets(true);
  const done = d.aset.filter((a) => a.diaudit_bulan_ini);
  const pct = d.aset.length ? Math.round((done.length / d.aset.length) * 100) : 0;
  const q = inp({ type: 'search', placeholder: 'Cari jenama, model, siri', 'aria-label': 'Cari aset' });
  const st = sel([['', 'Semua status'], ['Baik', 'Baik sahaja'], ['RosakHilang', 'Rosak / Hilang']]);
  st.setAttribute('aria-label', 'Status audit');
  const host = el('div', { class: 'am-list' });
  const reload = async () => { invalidate(); clear(view); await renderAudit(tab); };
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    let rows = tab === 'selesai' ? done : d.aset.filter((a) => !a.diaudit_bulan_ini);
    if (tab === 'selesai' && st.value) rows = rows.filter((a) => (st.value === 'Baik' ? a.audit_status === 'Baik' : a.audit_status === 'Rosak' || a.audit_status === 'Hilang'));
    if (term) rows = rows.filter((a) => `${a.make} ${a.model} ${a.serial_no}`.toLowerCase().includes(term));
    clear(host);
    if (!rows.length) {
      host.append(emptyState(tab === 'belum' && !term ? 'circle-check' : 'package', tab === 'belum' ? (term ? 'Tiada aset dijumpai untuk carian ini.' : 'Bagus. Semua aset telah diaudit bulan ini.') : 'Belum ada rekod audit untuk bulan ini.'));
      return;
    }
    host.append(...rows.slice(0, 300).map((a) => assetCard(a, {
      actions: tab === 'belum' ? [
        el('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => busy(e.currentTarget, async () => {
          try { await call('recordAudit', { asset_no: a.asset_no, keadaan: 'Baik' }); toast(`${assetName(a)}: Baik`, 'success'); await reload(); } catch (er) { toast(er.message, 'danger'); }
        }) }, icon('check'), 'Baik'),
        el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => auditModal(a, 'Rosak', reload) }, 'Rosak'),
        el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => auditModal(a, 'Hilang', reload) }, 'Hilang'),
      ] : [
        badge(a.audit_status || '-', AUDIT_KIND[a.audit_status]),
        a.audit_remark ? el('span', { class: 'caption' }, a.audit_remark) : null,
        a.ada_gambar_audit ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ asset_no: a.asset_no, jenis: 'audit' }) }, 'Gambar') : null,
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => auditModal(a, a.audit_status || 'Baik', reload) }, 'Audit semula'),
      ],
    })));
  };
  q.addEventListener('input', draw);
  st.addEventListener('change', draw);
  append(view, el('h2', null, 'Audit aset bulanan'),
    el('section', { class: 'card stack' },
      el('div', { class: 'row-between' }, el('strong', null, 'Kemajuan bulan ini'), el('span', { class: 'num' }, `${done.length} / ${d.aset.length} (${pct}%)`)),
      el('div', { class: 'am-progress', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Kemajuan audit' }, el('span', { style: `width:${pct}%` }))),
    el('nav', { class: 'tabs', 'aria-label': 'Bahagian audit' },
      el('a', { href: '#/audit/belum', 'aria-selected': String(tab !== 'selesai') }, `Belum diaudit (${d.aset.length - done.length})`),
      el('a', { href: '#/audit/selesai', 'aria-selected': String(tab === 'selesai') }, `Selesai (${done.length})`)),
    el('div', { class: 'am-filters', style: 'margin-top:12px' }, q, tab === 'selesai' ? st : null), host);
  draw();
}

// ------------------------------------------------------------------ S-43 mobiliti
async function renderMobiliti(tab) {
  const tabs = [['pinjam', 'Pinjam aset'], ['saya', 'Pinjaman saya']];
  if (isAdmin()) tabs.push(['sahkan', 'Sahkan pemulangan']);
  append(view, el('h2', null, 'Mobiliti aset'),
    el('nav', { class: 'tabs', 'aria-label': 'Bahagian mobiliti' }, tabs.map(([id, t]) => el('a', { href: '#/mobiliti/' + id, 'aria-selected': String(id === tab) }, t))));
  const host = el('div', { class: 'stack', style: 'margin-top:16px' });
  view.append(host);
  if (tab === 'saya') await renderMyLoans(host);
  else if (tab === 'sahkan' && isAdmin()) await renderApprovals(host);
  else await renderBorrow(host);
}

async function renderBorrow(host) {
  const d = await loadAssets(true);
  const byNo = new Map(d.aset.map((a) => [a.asset_no, a]));
  [...cart].forEach((no) => { if (!byNo.get(no)?.boleh_pinjam) cart.delete(no); });
  const q = inp({ type: 'search', placeholder: 'Cari jenama, model, siri, kategori', 'aria-label': 'Cari aset' });
  const list = el('div', { class: 'am-list' });
  const cartBtn = el('button', { class: 'btn', type: 'button' });
  const syncCart = () => { clear(cartBtn).append(icon('package'), `Troli (${cart.size})`); cartBtn.disabled = !cart.size; };
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const rows = d.aset.filter((a) => !term || `${a.make} ${a.model} ${a.serial_no} ${a.kategori}`.toLowerCase().includes(term));
    clear(list);
    if (!rows.length) { list.append(emptyState('package', 'Tiada aset sepadan.')); return; }
    list.append(...rows.slice(0, 200).map((a) => {
      const picked = cart.has(a.asset_no);
      const why = a.status_pinjaman !== 'Tersedia' ? `${a.status_pinjaman}${a.pemegang_nama ? ' oleh ' + a.pemegang_nama : ''}` : !a.boleh_pinjam ? 'Kalibrasi luput: tak boleh dipinjam' : '';
      const card = assetCard(a, {
        actions: [why ? el('span', { class: 'caption' }, why)
          : el('button', { class: 'btn btn-sm ' + (picked ? 'btn-secondary' : ''), type: 'button', 'aria-pressed': String(picked), onclick: () => { picked ? cart.delete(a.asset_no) : cart.add(a.asset_no); syncCart(); draw(); } },
            icon(picked ? 'x' : 'plus'), picked ? 'Keluarkan dari troli' : 'Tambah ke troli')],
      });
      card.classList.toggle('pick', picked);
      card.classList.toggle('off', Boolean(why));
      return card;
    }));
  };
  cartBtn.addEventListener('click', () => checkoutModal([...cart].map((no) => byNo.get(no)), async () => { cart.clear(); location.hash = '#/mobiliti/saya'; }));
  q.addEventListener('input', draw);
  syncCart();
  append(host, el('p', { class: 'muted', style: 'margin:0' }, 'Pilih satu atau lebih aset ke troli, kemudian isi butiran pinjaman.'), q, list, el('div', { class: 'am-cart' }, cartBtn));
  draw();
}

function checkoutModal(assets, done) {
  const projek = inp({ maxlength: 100, placeholder: 'Contoh: Penyelenggaraan RTU' });
  const lokasi = inp({ maxlength: 100, placeholder: 'Contoh: Site Cyberjaya' });
  const tempoh = inp({ type: 'number', inputmode: 'numeric', min: '1', max: '365', step: '1', value: '3' });
  const keadaan = sel([['Baik', 'Semua baik'], ['Ada kerosakan sedikit', 'Ada kerosakan sedikit']]);
  const note = el('textarea', { class: 'input', rows: 2, maxlength: 500, placeholder: 'Wajib jika ada kerosakan' });
  const err = errBox();
  openModal({
    title: `Pinjam ${assets.length} aset`,
    wide: true,
    body: el('div', { class: 'stack' }, err,
      el('ul', { class: 'file-list' }, assets.map((a) => el('li', null, icon('package'), el('span', { class: 'grow' }, `${assetName(a)} · SN ${a.serial_no}`)))),
      field('Nama peminjam', inp({ value: myName(), disabled: true })),
      el('div', { class: 'am-grid' }, field('Nama projek', projek, { required: true, cls: 'full' }), field('Lokasi', lokasi, { required: true }),
        field('Tempoh (hari)', tempoh, { required: true })),
      field('Keadaan semasa ambil', keadaan, { required: true }), field('Catatan', note)),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Sahkan pinjaman', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        if (!projek.value.trim() || !lokasi.value.trim()) { showErr(err, new Error('Isi nama projek dan lokasi')); return; }
        const t = Number(tempoh.value);
        if (!Number.isInteger(t) || t < 1 || t > 365) { showErr(err, new Error('Tempoh mesti 1 hingga 365 hari')); return; }
        if (keadaan.value !== 'Baik' && note.value.trim().length < 3) { showErr(err, new Error('Nyatakan kerosakan dalam catatan')); return; }
        try {
          await call('checkout', { assets: assets.map((a) => a.asset_no), nama_projek: projek.value, lokasi: lokasi.value, tempoh_hari: t, keadaan_pinjam: keadaan.value, catatan: note.value });
          close(); invalidate(); toast(`${assets.length} aset direkod sebagai dipinjam.`, 'success'); done && done();
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

async function renderMyLoans(host) {
  const rows = await call('listMovements', { skop: 'saya' });
  const active = rows.filter((m) => m.status !== 'Selesai');
  const past = rows.filter((m) => m.status === 'Selesai');
  const reload = async () => { invalidate(); clear(host); await renderMyLoans(host); };
  const card = (m) => el('article', { class: 'am-card' + (m.lewat ? ' warn' : '') },
    el('div', { class: 'top' },
      el('div', { style: 'min-width:0' },
        el('a', { href: '#/aset/' + encodeURIComponent(m.asset_no) }, el('strong', null, m.aset ? `${m.aset.make} ${m.aset.model}` : 'Aset ' + m.asset_no)),
        el('div', { class: 'sn' }, `No. ${m.asset_no}${m.aset ? ' · SN ' + m.aset.serial_no : ''}`),
        el('div', { class: 'meta' }, `${m.nama_projek} @ ${m.lokasi}`)),
      el('div', { class: 'chips' }, badge(m.status, m.status === 'Selesai' ? 'success' : m.status === 'Dipinjam' ? 'info' : 'warning'), m.lewat ? badge('Lewat', 'danger') : null)),
    el('div', { class: 'meta' }, m.tarikh_pinjam ? `Pinjam ${formatDate(m.tarikh_pinjam)}` : '', m.tarikh_jangka_pulang ? ` · jangka pulang ${formatDate(m.tarikh_jangka_pulang)}` : '',
      m.status === 'Selesai' ? ` · Disahkan ${formatDate(m.approved_at)} (${m.keadaan_akhir})` : m.status === 'Menunggu pengesahan' ? ' · Admin akan semak fizikal sebelum sahkan' : ''),
    m.boleh_pulang ? el('div', { class: 'row', style: 'margin-top:8px' }, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => returnModal(m, reload) }, icon('undo-2'), 'Pulangkan')) : null);
  append(host,
    el('section', { class: 'am-section' }, el('h3', null, `Sedang dipinjam (${active.length})`),
      active.length ? el('div', { class: 'am-list' }, active.map(card)) : emptyState('package', 'Tiada aset sedang dipinjam.', el('a', { class: 'btn', href: '#/mobiliti/pinjam' }, 'Pinjam aset'))),
    el('section', { class: 'am-section' }, el('h3', null, 'Sejarah'),
      past.length ? el('div', { class: 'am-list' }, past.slice(0, 50).map(card)) : el('p', { class: 'muted' }, 'Belum ada sejarah pinjaman.')));
}

function returnModal(m, done) {
  const tarikh = inp({ type: 'date', max: todayIso(), min: (m.tarikh_pinjam || '').slice(0, 10), value: todayIso() });
  const keadaan = sel([['Baik', 'Baik (sempurna / tiada kerosakan)'], ['Rosak', 'Rosak / hilang komponen']]);
  const note = el('textarea', { class: 'input', rows: 3, maxlength: 500 });
  const pic = filePicker({ label: 'Gambar bukti', accept: 'image/*', pdf: false, hint: 'Pilihan (wajib jika rosak).' });
  const label = el('span', { class: 'hint' }, 'Pilihan.');
  keadaan.addEventListener('change', () => { clear(label).append(keadaan.value === 'Rosak' ? 'Wajib: catatan dan gambar bukti.' : 'Pilihan.'); });
  const err = errBox();
  openModal({
    title: 'Pulangkan aset ' + m.asset_no,
    body: el('div', { class: 'stack' }, err,
      el('p', null, m.aset ? `${m.aset.make} ${m.aset.model} · SN ${m.aset.serial_no}` : ''),
      field('Tarikh pulang', tarikh, { required: true }), field('Keadaan', keadaan, { required: true }), field('Catatan', note), label, pic.node),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Hantar pemulangan', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        if (keadaan.value === 'Rosak' && (note.value.trim().length < 3 || !pic.get())) { showErr(err, new Error('Aset rosak: isi catatan dan muat naik gambar bukti')); return; }
        try {
          await call('returnAsset', { movement_id: m.movement_id, tarikh_pulang: tarikh.value, keadaan_pulang: keadaan.value, catatan: note.value, gambar: upload(pic) });
          close(); toast('Pemulangan direkod. Status: menunggu pengesahan admin.', 'success'); done && done();
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

/** Admin sahkan pemulangan (sistem lama: approve_return) atau terima terus aset yang masih dipinjam. */
function approveModal(target, done) {
  const asset = target.asset || target.aset || {};
  const keadaan = sel([['Baik', 'Baik (sempurna / tiada kerosakan)'], ['Rosak', 'Rosak'], ['Hilang komponen', 'Hilang komponen']], target.keadaan_pulang === 'Rosak' ? 'Rosak' : 'Baik');
  const lokasi = inp({ maxlength: 100, value: asset.lokasi_asal || 'HQ', placeholder: 'Contoh: Lab A, Almari 2' });
  const note = inp({ maxlength: 500 });
  const err = errBox();
  openModal({
    title: 'Sahkan pemulangan',
    body: el('div', { class: 'stack' }, err,
      el('p', null, el('strong', null, asset.make ? `${asset.make} ${asset.model}` : 'Aset ' + (target.asset_no || '')), asset.serial_no ? ` · SN ${asset.serial_no}` : ''),
      target.peminjam_nama ? el('p', { class: 'caption' }, `Peminjam: ${target.peminjam_nama}${target.keadaan_pulang ? ' · dilapor ' + target.keadaan_pulang : ''}${target.catatan_pulang ? ' · ' + target.catatan_pulang : ''}`) : null,
      target.ada_gambar_pulang ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'pulang', movement_id: target.movement_id }) }, 'Lihat gambar dari peminjam') : null,
      field('Keadaan akhir (semakan fizikal)', keadaan, { required: true }), field('Lokasi simpanan', lokasi, { required: true }), field('Catatan', note)),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Sahkan', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        try {
          await call('approveReturn', { movement_id: target.movement_id, asset_no: target.movement_id ? undefined : target.asset_no, keadaan_akhir: keadaan.value, lokasi_akhir: lokasi.value, catatan: note.value });
          close(); invalidate(); toast(`Aset kini Tersedia di ${lokasi.value}.`, 'success'); done && done();
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

async function renderApprovals(host) {
  const rows = await call('listMovements', { skop: 'aktif' });
  const pending = rows.filter((m) => m.status === 'Menunggu pengesahan');
  const out = rows.filter((m) => m.status === 'Dipinjam');
  const reload = async () => { clear(host); await renderApprovals(host); };
  const card = (m) => el('article', { class: 'am-card' + (m.lewat ? ' warn' : '') },
    el('div', { class: 'top' },
      el('div', { style: 'min-width:0' },
        el('a', { href: '#/aset/' + encodeURIComponent(m.asset_no) }, el('strong', null, m.aset ? `${m.aset.make} ${m.aset.model}` : 'Aset ' + m.asset_no)),
        el('div', { class: 'sn' }, `No. ${m.asset_no}${m.aset ? ' · SN ' + m.aset.serial_no : ''}`),
        el('div', { class: 'meta' }, `${m.peminjam_nama} · ${m.nama_projek} @ ${m.lokasi}`)),
      el('div', { class: 'chips' }, m.keadaan_pulang ? badge(m.keadaan_pulang, m.keadaan_pulang === 'Baik' ? 'success' : 'warning') : null, m.lewat ? badge('Lewat', 'danger') : null)),
    el('div', { class: 'meta' }, m.tarikh_pinjam ? `Pinjam ${formatDate(m.tarikh_pinjam)}` : '', m.tarikh_jangka_pulang ? ` · jangka pulang ${formatDate(m.tarikh_jangka_pulang)}` : '', m.tarikh_pulang ? ` · pulang ${formatDate(m.tarikh_pulang)}` : ''),
    m.catatan_pulang ? el('p', { class: 'desc' }, m.catatan_pulang) : null,
    el('div', { class: 'row', style: 'margin-top:8px' },
      m.ada_gambar_pulang ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'pulang', movement_id: m.movement_id }) }, icon('camera'), 'Gambar') : null,
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => approveModal(m, reload) }, icon('check'), m.status === 'Dipinjam' ? 'Terima terus' : 'Sahkan')));
  append(host,
    el('section', { class: 'am-section' }, el('h3', null, `Menunggu pengesahan (${pending.length})`),
      pending.length ? el('div', { class: 'am-list' }, pending.map(card)) : emptyState('circle-check', 'Tiada pemulangan menunggu pengesahan.')),
    el('section', { class: 'am-section' }, el('h3', null, `Sedang dipinjam (${out.length})`),
      el('p', { class: 'caption', style: 'margin:0' }, 'Guna "Terima terus" bila staf pulangkan aset tangan ke tangan tanpa rekod di portal.'),
      out.length ? el('div', { class: 'am-list' }, out.map(card)) : el('p', { class: 'muted' }, 'Tiada aset sedang dipinjam.')));
}

// ------------------------------------------------------------------ mula
async function start() {
  try {
    ctx = await bootModule(MODULE, 'AMS');
  } catch {
    return;
  }
  view = el('div', { id: 'view', class: 'stack' });
  const items = [
    { href: '#/', label: 'Papan pemuka', ikon: 'house', match: (h) => h === '#/' || h === '' },
    { href: '#/aset', label: 'Aset', ikon: 'package', match: (h) => h.startsWith('#/aset') || h.startsWith('#/ubah') },
    { href: '#/mobiliti', label: 'Mobiliti', ikon: 'undo-2', match: (h) => h.startsWith('#/mobiliti') },
  ];
  if (canAudit()) items.push({ href: '#/audit', label: 'Audit', ikon: 'clipboard-check', match: (h) => h.startsWith('#/audit') });
  if (isAdmin()) items.push({ href: '#/kalibrasi', label: 'Kalibrasi', ikon: 'wrench', match: (h) => h.startsWith('#/kalibrasi') });
  append(clear(main), view);
  renderModuleNav(main, items);
  main.removeAttribute('aria-busy');
  window.addEventListener('hashchange', route);
  await route();
}

start();
