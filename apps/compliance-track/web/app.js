// Compliance Track (F-60 hingga F-64; AFD S-60 hingga S-65; IPD 2D).
// Ikut sistem lama "UniTrack" (voltake-energy/Compliance-Track): dashboard KPI + kad kategori + senarai segera,
// ambang amaran 30/60/90 hari (lalai 60), jadual setiap kategori dengan carian/penapis/CSV, kongsi WhatsApp,
// portal staf kemas kini sijil sendiri + hantar IC dengan persetujuan, Senarai Kerja (senarai.js).
// Tiada PIN: kuasa ikut role di server. Klien untuk paparan sahaja.
import { bootModule } from '/shared/lib/page.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatDate, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderModuleNav } from '/shared/ui/components.js';
import {
  call, field, inp, sel, errBox, showErr, statusAt, statusLabel, statusBadge, dateBadge, STATUS_KIND,
  viewFile, filePicker, upload, downloadCsv,
} from '/compliance-track/common.js';
import { renderSenarai, renderJobLog } from '/compliance-track/senarai.js';

const main = document.getElementById('main');
let ctx;
let view;
let data = null;         // cache dashboard (admin)
const AMBANG_KEY = 'ct-ambang';
let ambang = 60;
try { ambang = Number(localStorage.getItem(AMBANG_KEY)) || 60; } catch { /* storan tak tersedia */ }

const has = (r) => ctx.roles.includes(r);
const isAdmin = () => has('hr_admin') || has('pss') || ctx.superadmin;
const invalidate = () => { data = null; };
async function load(force) {
  if (!data || force) data = await call('dashboard');
  return data;
}

// ------------------------------------------------------------------ router
async function route() {
  const h = location.hash || (isAdmin() ? '#/' : '#/saya');
  clear(view);
  window.scrollTo(0, 0);
  try {
    if (h.startsWith('#/saya') || !isAdmin()) await renderMine();
    else if (h.startsWith('#/kenderaan')) await renderVehicles(new URLSearchParams(h.split('?')[1] || ''));
    else if (h.startsWith('#/chargeman')) await renderChargeman(new URLSearchParams(h.split('?')[1] || ''));
    else if (h.startsWith('#/staf/')) await renderStaffDetail(decodeURIComponent(h.slice(7)));
    else if (h.startsWith('#/staf')) await renderStaff(new URLSearchParams(h.split('?')[1] || ''));
    else if (h.startsWith('#/senarai/log')) await renderJobLog(view);
    else if (h.startsWith('#/senarai')) await renderSenarai(view, { load });
    else await renderDashboard();
  } catch (e) {
    if (e.status !== 401) append(clear(view), el('div', { class: 'alert alert-danger' }, e.message));
  }
}

function ambangSelect() {
  const s = sel([['30', '30 hari'], ['60', '60 hari'], ['90', '90 hari']], String(ambang));
  s.setAttribute('aria-label', 'Ambang amaran awal');
  s.addEventListener('change', () => { ambang = Number(s.value); try { localStorage.setItem(AMBANG_KEY, String(ambang)); } catch { /* abaikan */ } route(); });
  return el('label', { class: 'row', style: 'gap:8px;align-items:center' }, el('span', { class: 'caption' }, 'Amaran awal'), s);
}

/** Semua rekod sebagai baris seragam (sistem lama: normalizeAllTabsData). Sijil staf: satu baris setiap staf. */
function allRows(d) {
  const worst = (s) => {
    const hs = Object.values(s.sijil).map((c) => c.hari).filter((x) => x !== null);
    return hs.length ? Math.min(...hs) : null;
  };
  return [
    ...d.kenderaan.map((v) => ({ kat: v.jenis === 'Kereta' ? 'kereta' : 'motosikal', label: v.plate_no, info: `${v.lokasi} · ${v.keadaan}`, expiry: v.expiry, hari: v.hari, href: '#/kenderaan?id=' + v.vehicle_id })),
    ...d.chargeman.map((c) => ({ kat: 'chargeman', label: c.nama, info: `${c.solar_farm}${c.competency_no ? ' · ' + c.competency_no : ''}`, expiry: c.expiry, hari: c.hari, href: '#/chargeman?id=' + c.chargeman_id })),
    ...d.staf.map((s) => ({ kat: 'sijil', label: s.nama, info: s.staff_id, expiry: '', hari: worst(s), href: '#/staf/' + encodeURIComponent(s.staff_id) })),
  ];
}
const KAT = { kereta: 'Roadtax kereta', motosikal: 'Roadtax motosikal', chargeman: 'Chargeman', sijil: 'Sijil staf' };
const KAT_HREF = { kereta: '#/kenderaan?jenis=Kereta', motosikal: '#/kenderaan?jenis=Motosikal', chargeman: '#/chargeman', sijil: '#/staf' };

function stat(label, value, kind = '', href) {
  const inner = [el('div', { class: 'label' }, label), el('div', { class: 'v' }, String(value))];
  return href ? el('a', { class: 'ct-stat ' + kind, href }, inner) : el('div', { class: 'ct-stat ' + kind }, inner);
}

// ------------------------------------------------------------------ S-60 dashboard
async function renderDashboard() {
  const d = await load(true);
  const rows = allRows(d);
  const n = (s, list = rows) => list.filter((r) => statusAt(r.hari, ambang) === s).length;
  const rate = rows.length ? Math.round(((n('active') + n('expiring')) / rows.length) * 100) : 0;
  const urgent = rows.filter((r) => ['expired', 'expiring'].includes(statusAt(r.hari, ambang))).sort((a, b) => a.hari - b.hari).slice(0, 10);
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Dashboard compliance'), ambangSelect()),
    el('div', { class: 'ct-stats' },
      stat('Jumlah rekod', rows.length, 'info'),
      stat('Telah tamat', n('expired'), n('expired') ? 'bad' : ''),
      stat(`Hampir tamat (≤ ${ambang} hari)`, n('expiring'), n('expiring') ? 'warn' : ''),
      stat('Masih sah', n('active'), 'ok'),
      stat('Kadar pematuhan', rate + '%', rate >= 90 ? 'ok' : 'warn')),
    el('section', { class: 'ct-section' }, el('h3', null, 'Ikut kategori'),
      el('div', { class: 'ct-stats' }, Object.keys(KAT).map((k) => {
        const list = rows.filter((r) => r.kat === k);
        return el('a', { class: 'ct-stat', href: KAT_HREF[k] },
          el('div', { class: 'label' }, KAT[k]), el('div', { class: 'v' }, String(list.length)),
          el('div', { class: 'chips' }, badge(`${n('expired', list)} tamat`, 'danger'), badge(`${n('expiring', list)} hampir`, 'warning'), badge(`${n('active', list)} sah`, 'success')));
      }))),
    el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, `Perlu tindakan segera (${urgent.length})`),
      urgent.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['Kategori', 'Item / nama', 'Butiran', 'Status', ''].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', null, urgent.map((r) => el('tr', null,
          el('td', { 'data-label': 'Kategori' }, KAT[r.kat]),
          el('td', { 'data-label': 'Item' }, r.kat === 'kereta' || r.kat === 'motosikal' ? el('span', { class: 'ct-plate' }, r.label) : el('strong', null, r.label)),
          el('td', { 'data-label': 'Butiran' }, r.info),
          el('td', { 'data-label': 'Status' }, statusBadge(r.hari, ambang)),
          el('td', { class: 'actions' }, el('a', { class: 'btn btn-secondary btn-sm', href: r.href }, 'Butiran')))))))
        : emptyState('circle-check', 'Tiada rekod tamat atau hampir tamat.')));
}

// ------------------------------------------------------------------ penapis kongsi
function filters({ search, extra = [] }) {
  const q = inp({ type: 'search', placeholder: search, 'aria-label': 'Cari' });
  const st = sel([['', 'Semua status'], ['expired', 'Telah tamat'], ['expiring', 'Hampir tamat'], ['active', 'Masih sah'], ['unknown', 'Tiada tarikh']]);
  st.setAttribute('aria-label', 'Status');
  return { q, st, node: el('div', { class: 'ct-filters' }, q, st, ...extra) };
}

function whatsapp(kat, item, butiran, expiry, hari) {
  const text = `*PERINGATAN PEMATUHAN & PEMBAHARUAN*\n\n*Kategori:* ${kat}\n*Item / Nama:* ${item}\n*Butiran:* ${butiran}\n*Tarikh Tamat:* ${expiry ? formatDate(expiry) : '-'}\n*Status Semasa:* ${statusLabel(hari, ambang)}\n\nMohon tindakan semakan atau pembaharuan segera. Terima kasih.`;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
}

function deleteModal(jenis, id, label, done) {
  const why = el('textarea', { class: 'input', rows: 3, maxlength: 300 });
  const err = errBox();
  openModal({
    title: 'Padam ' + label,
    body: el('div', { class: 'stack' }, err, field('Sebab (wajib)', why, { required: true, hint: 'Rekod disimpan dalam Sheet (padam lembut) dan direkod dalam AuditLog.' })),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Padam', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
        try { await call('deleteRecord', { jenis, id, sebab: why.value }); close(); invalidate(); toast(label + ' dipadam.', 'success'); done(); } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ S-61 kenderaan
async function renderVehicles(params) {
  const d = await load();
  const jenis = sel([['', 'Kereta & motosikal'], ['Kereta', 'Kereta'], ['Motosikal', 'Motosikal']], params.get('jenis') || '');
  jenis.setAttribute('aria-label', 'Jenis');
  const f = filters({ search: 'Cari no. plat, lokasi, keadaan', extra: [jenis] });
  const host = el('div', { class: 'ct-list' });
  let shown = [];
  const draw = () => {
    const term = f.q.value.trim().toLowerCase();
    shown = d.kenderaan.filter((v) => (!jenis.value || v.jenis === jenis.value) && (!f.st.value || statusAt(v.hari, ambang) === f.st.value)
      && (!term || `${v.plate_no} ${v.lokasi} ${v.keadaan}`.toLowerCase().includes(term)));
    clear(host);
    if (!shown.length) { host.append(emptyState('search', 'Tiada kenderaan sepadan.')); return; }
    host.append(...shown.map((v) => el('article', { class: 'ct-card' },
      el('div', { class: 'top' },
        el('div', null, el('span', { class: 'ct-plate' }, v.plate_no), ' ', el('span', { class: 'caption' }, v.jenis),
          el('div', { class: 'meta' }, icon('map-pin'), ' ', v.lokasi, ' · ', v.keadaan)),
        el('div', { style: 'text-align:right' }, statusBadge(v.hari, ambang), el('div', { class: 'caption num' }, v.expiry ? 'Roadtax ' + formatDate(v.expiry) : ''))),
      el('div', { class: 'row', style: 'margin-top:8px' },
        el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => vehicleModal(v) }, icon('pencil'), 'Ubah'),
        v.ada_fail ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'kenderaan', id: v.vehicle_id }, 'Roadtax ' + v.plate_no) }, icon('scroll-text'), 'Dokumen') : null,
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => whatsapp('Roadtax ' + v.jenis, v.plate_no, `${v.lokasi} · ${v.keadaan}`, v.expiry, v.hari) }, icon('share'), 'WhatsApp')))));
  };
  [f.q].forEach((x) => x.addEventListener('input', draw));
  [f.st, jenis].forEach((x) => x.addEventListener('change', draw));
  const csv = el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => downloadCsv(`Kenderaan_${todayIso()}.csv`,
    ['Jenis', 'No. plat', 'Lokasi', 'Keadaan', 'Tarikh tamat roadtax', 'Status', 'Catatan'],
    shown.map((v) => [v.jenis, v.plate_no, v.lokasi, v.keadaan, v.expiry ? formatDate(v.expiry) : '', statusLabel(v.hari, ambang), v.catatan])) }, icon('download'), 'CSV');
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Kenderaan (roadtax)'),
      el('div', { class: 'row' }, csv, el('button', { class: 'btn', type: 'button', onclick: () => vehicleModal(null, jenis.value || 'Kereta') }, icon('plus'), 'Tambah'))),
    f.node, host);
  draw();
  const open = params.get('id') && d.kenderaan.find((v) => v.vehicle_id === params.get('id'));
  if (open) vehicleModal(open);
}

function vehicleModal(v, jenisLalai = 'Kereta') {
  const jenis = sel([['Kereta', 'Kereta'], ['Motosikal', 'Motosikal']], v ? v.jenis : jenisLalai);
  const plate = inp({ value: v?.plate_no || '', maxlength: 15, placeholder: 'Contoh: VAA 1234', style: 'text-transform:uppercase' });
  const lokasi = inp({ value: v?.lokasi || '', maxlength: 100, placeholder: 'HQ / LSS4 Bukit Kayu Hitam' });
  const keadaan = inp({ value: v?.keadaan || 'Baik', maxlength: 60, list: 'ct-keadaan' });
  const expiry = inp({ type: 'date', value: v?.expiry || '' });
  const note = inp({ value: v?.catatan || '', maxlength: 500 });
  const doc = filePicker({ label: 'Salinan roadtax', hint: v?.ada_fail ? 'Dokumen sedia ada disimpan. Pilih untuk ganti.' : 'Pilihan: salinan roadtax (PDF / gambar).' });
  const err = errBox();
  openModal({
    title: v ? 'Ubah ' + v.plate_no : 'Tambah kenderaan',
    wide: true,
    body: el('div', { class: 'stack' }, err, el('datalist', { id: 'ct-keadaan' }, ['Baik', 'Servis', 'Rosak', 'Tidak aktif'].map((x) => el('option', { value: x }))),
      el('div', { class: 'ct-grid' }, field('Jenis', jenis, { required: true }), field('No. plat', plate, { required: true }),
        field('Lokasi', lokasi, { required: true }), field('Keadaan', keadaan, { required: true }),
        field('Tarikh tamat roadtax', expiry, { required: true }), field('Catatan', note)),
      doc.node),
    actions: [
      v ? { label: 'Padam', class: 'btn-ghost', onClick: ({ close }) => { close(); deleteModal('kenderaan', v.vehicle_id, v.plate_no, route); } } : null,
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        try {
          await call('saveVehicle', { vehicle_id: v?.vehicle_id, jenis: jenis.value, plate_no: plate.value, lokasi: lokasi.value, keadaan: keadaan.value, roadtax_expiry: expiry.value, catatan: note.value, dokumen: upload(doc) });
          close(); invalidate(); toast('Kenderaan disimpan.', 'success'); location.hash = '#/kenderaan'; route();
        } catch (e) { showErr(err, e); }
      }) },
    ].filter(Boolean),
  });
}

// ------------------------------------------------------------------ S-62 chargeman
async function renderChargeman(params) {
  const d = await load();
  const farms = [...new Set(d.chargeman.map((c) => c.solar_farm))].sort();
  const farm = sel([['', 'Semua solar farm'], ...farms.map((x) => [x, x])], params.get('farm') || '');
  farm.setAttribute('aria-label', 'Solar farm');
  const f = filters({ search: 'Cari nama, solar farm, no. kompetensi', extra: [farm] });
  const host = el('div', { class: 'ct-list' });
  let shown = [];
  const draw = () => {
    const term = f.q.value.trim().toLowerCase();
    shown = d.chargeman.filter((c) => (!farm.value || c.solar_farm === farm.value) && (!f.st.value || statusAt(c.hari, ambang) === f.st.value)
      && (!term || `${c.nama} ${c.solar_farm} ${c.competency_no} ${c.staff_id}`.toLowerCase().includes(term)));
    clear(host);
    if (!shown.length) { host.append(emptyState('search', 'Tiada rekod chargeman sepadan.')); return; }
    host.append(...shown.map((c) => el('article', { class: 'ct-card' },
      el('div', { class: 'top' },
        el('div', null, el('strong', null, c.nama), c.staff_id ? el('span', { class: 'caption' }, ' · ' + c.staff_id) : null,
          el('div', { class: 'meta' }, icon('map-pin'), ' ', c.solar_farm, c.competency_no ? ' · No. ' + c.competency_no : '')),
        el('div', { style: 'text-align:right' }, statusBadge(c.hari, ambang), el('div', { class: 'caption num' }, c.expiry ? 'Tamat ' + formatDate(c.expiry) : ''))),
      el('div', { class: 'row', style: 'margin-top:8px' },
        el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => chargemanModal(c, d) }, icon('pencil'), 'Ubah'),
        c.ada_fail ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'chargeman', id: c.chargeman_id }, 'Lesen chargeman ' + c.nama) }, icon('scroll-text'), 'Dokumen') : null,
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => whatsapp('Chargeman', c.nama, c.solar_farm, c.expiry, c.hari) }, icon('share'), 'WhatsApp')))));
  };
  f.q.addEventListener('input', draw);
  [f.st, farm].forEach((x) => x.addEventListener('change', draw));
  const csv = el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => downloadCsv(`Chargeman_${todayIso()}.csv`,
    ['Solar farm', 'Nama', 'Staff ID', 'No. kompetensi', 'Tarikh tamat', 'Status'],
    shown.map((c) => [c.solar_farm, c.nama, c.staff_id, c.competency_no, c.expiry ? formatDate(c.expiry) : '', statusLabel(c.hari, ambang)])) }, icon('download'), 'CSV');
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Chargeman'),
      el('div', { class: 'row' }, csv, el('button', { class: 'btn', type: 'button', onclick: () => chargemanModal(null, d) }, icon('plus'), 'Tambah'))),
    f.node, host);
  draw();
  const open = params.get('id') && d.chargeman.find((c) => c.chargeman_id === params.get('id'));
  if (open) chargemanModal(open, d);
}

function chargemanModal(c, d) {
  const staffOpts = [['', '- Bukan staf dalaman / tiada -'], ...d.staf.map((s) => [s.staff_id, `${s.staff_id} · ${s.nama}`])];
  const staff = sel(staffOpts, c?.staff_id || '');
  const nama = inp({ value: c?.nama || '', maxlength: 100 });
  staff.addEventListener('change', () => { const s = d.staf.find((x) => x.staff_id === staff.value); if (s && !nama.value) nama.value = s.nama; });
  const farm = inp({ value: c?.solar_farm || '', maxlength: 100, list: 'ct-farms' });
  const no = inp({ value: c?.competency_no || '', maxlength: 100 });
  const expiry = inp({ type: 'date', value: c?.expiry || '' });
  const doc = filePicker({ label: 'Lesen chargeman', hint: c?.ada_fail ? 'Dokumen sedia ada disimpan. Pilih untuk ganti.' : 'Pilihan: salinan lesen (PDF / gambar).' });
  const err = errBox();
  openModal({
    title: c ? 'Ubah chargeman' : 'Tambah chargeman',
    wide: true,
    body: el('div', { class: 'stack' }, err, el('datalist', { id: 'ct-farms' }, [...new Set(d.chargeman.map((x) => x.solar_farm))].map((x) => el('option', { value: x }))),
      el('div', { class: 'ct-grid' }, field('Staf (pilihan)', staff, { cls: 'full', hint: 'Dipadankan untuk Senarai Kerja dan "Sijil saya".' }), field('Nama chargeman', nama, { required: true }),
        field('Solar farm', farm, { required: true }), field('No. kompetensi', no), field('Tarikh tamat', expiry, { required: true })),
      doc.node),
    actions: [
      c ? { label: 'Padam', class: 'btn-ghost', onClick: ({ close }) => { close(); deleteModal('chargeman', c.chargeman_id, 'chargeman ' + c.nama, route); } } : null,
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        try {
          await call('saveChargeman', { chargeman_id: c?.chargeman_id, staff_id: staff.value, nama: nama.value, solar_farm: farm.value, competency_no: no.value, expiry_date: expiry.value, dokumen: upload(doc) });
          close(); invalidate(); toast('Chargeman disimpan.', 'success'); location.hash = '#/chargeman'; route();
        } catch (e) { showErr(err, e); }
      }) },
    ].filter(Boolean),
  });
}

// ------------------------------------------------------------------ S-63 sijil semua staf (matriks)
async function renderStaff(params) {
  const d = await load();
  const types = d.jenis_sijil;
  const jenis = sel([['', 'Semua sijil'], ...types.map((t) => [t.key, t.label])], params.get('sijil') || '');
  jenis.setAttribute('aria-label', 'Jenis sijil');
  const f = filters({ search: 'Cari nama atau Staff ID', extra: [jenis] });
  const host = el('div');
  let shown = [];
  const statusOfStaff = (s) => {
    const list = jenis.value ? [s.sijil[jenis.value]] : Object.values(s.sijil);
    const st = list.map((c) => statusAt(c.hari, ambang));
    return st.includes('expired') ? 'expired' : st.includes('expiring') ? 'expiring' : st.includes('active') ? 'active' : 'unknown';
  };
  const draw = () => {
    const term = f.q.value.trim().toLowerCase();
    shown = d.staf.filter((s) => (!f.st.value || statusOfStaff(s) === f.st.value) && (!term || `${s.staff_id} ${s.nama}`.toLowerCase().includes(term)));
    clear(host);
    if (!shown.length) { host.append(emptyState('users', d.staf.length ? 'Tiada staf sepadan.' : 'Belum ada staf. Staf akan muncul bila mereka kemas kini "Sijil saya", atau tambah di sini.')); return; }
    host.append(el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table ct-matrix' },
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Staf'), ...types.map((t) => el('th', { scope: 'col' }, t.label)), el('th', { scope: 'col' }, 'IC'), el('th', { scope: 'col' }, ''))),
      el('tbody', null, shown.map((s) => el('tr', null,
        el('td', { 'data-label': 'Staf' }, el('strong', null, s.nama), el('div', { class: 'caption' }, `${s.staff_id}${s.designation ? ' · ' + s.designation : ''}`)),
        ...types.map((t) => el('td', { 'data-label': t.label }, dateBadge(s.sijil[t.key].expiry, s.sijil[t.key].hari, ambang), s.sijil[t.key].expiry && !s.sijil[t.key].ada_fail ? el('div', { class: 'caption' }, 'tiada fail') : null)),
        el('td', { 'data-label': 'IC' }, s.ic_depan && s.ic_belakang && s.ada_ic_no ? badge('Lengkap', 'success') : badge('Belum', 'warning')),
        el('td', { class: 'actions' }, el('a', { class: 'btn btn-secondary btn-sm', href: '#/staf/' + encodeURIComponent(s.staff_id) }, 'Buka'))))))));
  };
  f.q.addEventListener('input', draw);
  [f.st, jenis].forEach((x) => x.addEventListener('change', draw));
  const csv = el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => downloadCsv(`Sijil_Staf_${todayIso()}.csv`,
    ['Staff ID', 'Nama', 'Designation', ...types.map((t) => t.label + ' (tamat)'), 'IC lengkap'],
    shown.map((s) => [s.staff_id, s.nama, s.designation, ...types.map((t) => (s.sijil[t.key].expiry ? formatDate(s.sijil[t.key].expiry) : '')), s.ic_depan && s.ic_belakang && s.ada_ic_no ? 'Ya' : 'Tidak'])) }, icon('download'), 'CSV');
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Sijil staf'),
      el('div', { class: 'row' }, ambangSelect(), csv, el('button', { class: 'btn', type: 'button', onclick: () => staffModal(null) }, icon('plus'), 'Tambah staf'))),
    f.node, host);
  draw();
}

function staffModal(s) {
  const id = inp({ value: s?.staff_id || '', maxlength: 20, disabled: Boolean(s), placeholder: 'Contoh: VES007', style: 'text-transform:uppercase' });
  const nama = inp({ value: s?.nama || '', maxlength: 100 });
  const des = inp({ value: s?.designation || '', maxlength: 80, placeholder: 'Contoh: Technician' });
  const ic = inp({ value: s?.ic_no || '', maxlength: 20, inputmode: 'numeric', placeholder: '000000-00-0000' });
  const front = filePicker({ label: 'IC depan', accept: 'image/*', pdf: false, hint: s?.ic_depan ? 'Sedia ada disimpan. Pilih untuk ganti.' : 'Pilihan.' });
  const back = filePicker({ label: 'IC belakang', accept: 'image/*', pdf: false, hint: s?.ic_belakang ? 'Sedia ada disimpan. Pilih untuk ganti.' : 'Pilihan.' });
  const err = errBox();
  openModal({
    title: s ? 'Ubah profil ' + s.nama : 'Tambah staf',
    wide: true,
    body: el('div', { class: 'stack' }, err,
      el('div', { class: 'ct-grid' }, field('Staff ID', id, { required: true, hint: s ? '' : 'Mesti sama dengan Staff ID dalam portal (Admin > Staf).' }), field('Nama', nama, { required: true }),
        field('Designation', des, { hint: 'Dipapar dalam Senarai Kerja.' }), field('No. IC / pasport', ic, { hint: 'Sulit: hanya HR & PSS.' })),
      el('div', { class: 'ct-grid' }, el('div', null, el('span', { class: 'label' }, 'Salinan IC depan'), front.node), el('div', null, el('span', { class: 'label' }, 'Salinan IC belakang'), back.node))),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        try {
          const r = await call('saveStaff', { staff_id: id.value, nama: nama.value, designation: des.value, ic_no: ic.value, ic_depan: upload(front), ic_belakang: upload(back), baru: !s });
          close(); invalidate(); toast('Profil staf disimpan.', 'success');
          if (location.hash === '#/staf/' + encodeURIComponent(r.staff_id)) route(); else location.hash = '#/staf/' + encodeURIComponent(r.staff_id);
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

async function renderStaffDetail(id) {
  const s = await call('getStaff', { staff_id: id });
  const d = await load();
  const reload = async () => { invalidate(); clear(view); await renderStaffDetail(id); };
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: '#/staf' }, icon('arrow-left'), 'Sijil staf')),
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, s.nama), el('div', { class: 'row' },
      el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => staffModal(s) }, icon('pencil'), 'Ubah profil / IC'),
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => deleteModal('staf', s.staff_id, s.nama, () => { location.hash = '#/staf'; }) }, icon('x'), 'Padam'))),
    el('section', { class: 'card stack' },
      el('dl', { class: 'kv' },
        el('dt', null, 'Staff ID'), el('dd', null, s.staff_id),
        el('dt', null, 'Designation'), el('dd', null, s.designation || '-'),
        el('dt', null, 'No. IC'), el('dd', null, s.ic_no || '-'),
        el('dt', null, 'Persetujuan IC'), el('dd', null, s.ic_consent_at ? formatDateTime(s.ic_consent_at) + ' (dihantar staf)' : '-')),
      el('div', { class: 'row' },
        s.ic_depan ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'ic_depan', staff_id: s.staff_id }, 'IC depan ' + s.nama) }, 'IC depan') : badge('Tiada IC depan', 'warning'),
        s.ic_belakang ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'ic_belakang', staff_id: s.staff_id }, 'IC belakang ' + s.nama) }, 'IC belakang') : badge('Tiada IC belakang', 'warning'))),
    el('section', { class: 'ct-section' }, el('h3', null, 'Sijil'),
      el('div', { class: 'ct-list' }, d.jenis_sijil.map((t) => certCard(t, s.sijil[t.key], { staff_id: s.staff_id, admin: true, done: reload })))),
    s.chargeman.length ? el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Chargeman'),
      el('ul', { class: 'file-list' }, s.chargeman.map((c) => el('li', null, el('span', { class: 'grow' }, `${c.solar_farm}${c.competency_no ? ' · ' + c.competency_no : ''}`), statusBadge(c.hari, ambang))))) : null);
}

/** Kad satu sijil: tarikh tamat + no. sijil + fail. Staf sendiri (saveMyCert) atau admin (saveStaffCert). */
function certCard(t, c, { staff_id, admin, done }) {
  const date = inp({ type: 'date', value: c.expiry || '', 'aria-label': 'Tarikh tamat ' + t.label });
  const no = inp({ value: c.no_sijil || '', maxlength: 60, placeholder: 'Pilihan', 'aria-label': 'No. sijil ' + t.label });
  const pick = filePicker({ label: 'Sijil ' + t.label, hint: c.ada_fail ? 'Fail sedia ada disimpan. Pilih untuk ganti.' : 'Muat naik salinan sijil (PDF / gambar).' });
  const err = errBox();
  const save = el('button', { class: 'btn btn-sm', type: 'button' }, icon('check'), 'Simpan');
  save.addEventListener('click', () => busy(save, async () => {
    err.hidden = true;
    if (!admin && !date.value && !pick.get()) { showErr(err, new Error('Isi tarikh tamat atau muat naik sijil')); return; }
    try {
      const payload = { jenis: t.key, expiry_date: date.value, no_sijil: no.value, fail: upload(pick) };
      if (admin) await call('saveStaffCert', { staff_id, ...payload }); else await call('saveMyCert', payload);
      toast(`${t.label} dikemas kini.`, 'success');
      done && done();
    } catch (e) { showErr(err, e); }
  }));
  const kind = STATUS_KIND[statusAt(c.hari, ambang)];
  return el('article', { class: 'ct-card ct-cert' + (kind === 'danger' || kind === 'warning' ? ' warn' : '') },
    el('div', { class: 'top' }, el('strong', null, t.label), statusBadge(c.hari, ambang)),
    err,
    el('div', { class: 'ct-grid' }, field('Tarikh tamat', date), field('No. sijil', no)),
    pick.node,
    el('div', { class: 'row' }, save,
      c.ada_fail ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'sijil', sijil: t.key, staff_id }, t.label) }, icon('scroll-text'), 'Lihat sijil') : null));
}

// ------------------------------------------------------------------ S-64 sijil saya (semua staf)
async function renderMine() {
  const me = await call('mySummary');
  const reload = async () => { clear(view); await renderMine(); };
  if (!me.boleh_kemas_kini) {
    append(view, el('h2', null, 'Sijil saya'), el('div', { class: 'alert alert-warning' }, 'Staff ID anda belum didaftar dalam portal. Hubungi HR.'));
    return;
  }
  const ic = me.ic_lengkap
    ? el('div', { class: 'alert alert-info' }, `Maklumat IC lengkap (${me.ic_no_tersembunyi}). Untuk sebarang perubahan, hubungi HR.`)
    : el('div', { class: 'alert alert-warning' }, el('div', null, 'Maklumat kad pengenalan belum lengkap. Ia diperlukan untuk pendaftaran masuk tapak kerja (Senarai Kerja).'),
      el('button', { class: 'btn btn-sm', type: 'button', style: 'margin-top:8px', onclick: () => consentModal(me, reload) }, 'Hantar maklumat IC'));
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Sijil saya'), el('span', { class: 'caption' }, `${me.nama} · ${me.staff_id}`)),
    el('p', { class: 'muted', style: 'margin:0' }, 'Kemas kini tarikh tamat dan muat naik sijil terkini. Anda hanya boleh mengubah sijil anda sendiri.'),
    ic,
    el('div', { class: 'ct-list' }, me.jenis_sijil.map((t) => certCard(t, me.sijil[t.key], { admin: false, done: reload }))),
    me.chargeman.length ? el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Lesen chargeman saya'),
      el('ul', { class: 'file-list' }, me.chargeman.map((c) => el('li', null, el('span', { class: 'grow' }, `${c.solar_farm}${c.competency_no ? ' · ' + c.competency_no : ''}${c.expiry ? ' · tamat ' + formatDate(c.expiry) : ''}`),
        statusBadge(c.hari, ambang),
        c.ada_fail ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile({ jenis: 'chargeman', id: c.chargeman_id }, 'Lesen chargeman') }, 'Lihat') : null))),
      el('p', { class: 'caption', style: 'margin:0' }, 'Lesen chargeman dikemas kini oleh HR / PSS.')) : null);
}

/** Persetujuan IC (teks sama dengan sistem lama, versi v1-2026-11), kemudian borang IC. */
function consentModal(me, done) {
  const tick = el('input', { type: 'checkbox' });
  openModal({
    title: 'Persetujuan penggunaan maklumat peribadi',
    body: el('div', { class: 'stack' },
      el('p', null, 'Anda akan memberikan ', el('strong', null, 'no. kad pengenalan'), ' dan ', el('strong', null, 'gambar kad pengenalan (depan dan belakang)'), '.'),
      el('p', null, 'Saya bersetuju bahawa no. kad pengenalan dan gambar kad pengenalan saya ', el('strong', null, 'hanya digunakan untuk tujuan kerja (works purpose only)'),
        ', iaitu pendaftaran dan kebenaran masuk ke tapak kerja serta dokumen personel bagi projek Voltake.'),
      el('p', { class: 'caption' }, 'I agree that my identity card details and images are used for official site work purposes only.'),
      el('ul', null,
        el('li', null, 'Gambar IC akan ditandakan "FOR OFFICIAL SITE WORK ONLY" dalam dokumen yang dijana.'),
        el('li', null, 'Hanya HR dan PSS boleh melihat maklumat ini; setiap capaian direkod.'),
        el('li', null, 'Selepas dihantar, anda tidak boleh mengubahnya sendiri. Hubungi HR untuk sebarang perubahan.'),
        el('li', null, 'Persetujuan ini direkod bersama tarikh dan masa.')),
      el('label', { class: 'check' }, tick, 'Saya telah membaca dan bersetuju dengan perkara di atas.')),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Setuju & teruskan', onClick: ({ close }) => { if (!tick.checked) { toast('Sila tandakan persetujuan dahulu.', 'warning'); return; } close(); icForm(me, done); } },
    ],
  });
}

function icForm(me, done) {
  const no = inp({ inputmode: 'numeric', maxlength: 14, placeholder: '000000-00-0000' });
  const front = filePicker({ label: 'IC depan', accept: 'image/*', pdf: false, capture: 'environment', hint: 'Gambar jelas bahagian depan.' });
  const back = filePicker({ label: 'IC belakang', accept: 'image/*', pdf: false, capture: 'environment', hint: 'Gambar jelas bahagian belakang.' });
  const err = errBox();
  openModal({
    title: 'Maklumat kad pengenalan',
    wide: true,
    body: el('div', { class: 'stack' }, err, el('p', { class: 'caption' }, `${me.nama} · ${me.staff_id}`),
      field('No. IC', no, { required: true }),
      el('div', { class: 'ct-grid' }, el('div', null, el('span', { class: 'label' }, 'IC depan *'), front.node), el('div', null, el('span', { class: 'label' }, 'IC belakang *'), back.node))),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Hantar', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        if (!no.value.trim() || !front.get() || !back.get()) { showErr(err, new Error('Isi no. IC dan muat naik gambar depan dan belakang')); return; }
        if (!(await confirmDialog('Hantar maklumat IC?', 'Selepas dihantar, anda tidak boleh mengubahnya sendiri.', { okLabel: 'Hantar' }))) return;
        try {
          await call('submitMyIc', { setuju: true, versi: me.versi_persetujuan, ic_no: no.value, depan: upload(front), belakang: upload(back) });
          close(); toast('Maklumat IC dihantar. Terima kasih.', 'success'); done && done();
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ mula
async function start() {
  try {
    ctx = await bootModule('compliance', 'Compliance Track');
  } catch {
    return;
  }
  view = el('div', { id: 'view', class: 'stack' });
  const items = isAdmin() ? [
    { href: '#/', label: 'Dashboard', ikon: 'house', match: (h) => h === '#/' || h === '' },
    { href: '#/kenderaan', label: 'Kenderaan', ikon: 'car', match: (h) => h.startsWith('#/kenderaan') },
    { href: '#/chargeman', label: 'Chargeman', ikon: 'zap', match: (h) => h.startsWith('#/chargeman') },
    { href: '#/staf', label: 'Sijil staf', ikon: 'users', match: (h) => h.startsWith('#/staf') },
    { href: '#/senarai', label: 'Senarai Kerja', ikon: 'clipboard-check', match: (h) => h.startsWith('#/senarai') },
    { href: '#/saya', label: 'Sijil saya', ikon: 'user', match: (h) => h.startsWith('#/saya') },
  ] : [{ href: '#/saya', label: 'Sijil saya', ikon: 'user', match: () => true }];
  append(clear(main), view);
  renderModuleNav(main, items);
  main.removeAttribute('aria-busy');
  window.addEventListener('hashchange', route);
  await route();
}

start();
