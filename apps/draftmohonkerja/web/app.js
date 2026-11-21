// Draft Mohon Kerja (F-11 hingga F-14; AFD S-12 hingga S-15; IPD 2E.3).
// Ikut sistem lama (draftmohonkerja dashboard/ + interview/): KPI & pipeline status, amaran interview menghampiri
// (7 hari), jadual dengan carian/penapis, butiran pemohon, kemas kini status/department/tarikh interview/catatan
// dengan kiraan tukar tarikh, urus jawatan, borang A4 untuk dicetak.
// Papan interviewer lama (pautan token per department) diganti role `interviewer` + skop department di server.
import { bootModule } from '/shared/lib/page.js';
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatDate, formatDateTime, formatRM, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderModuleNav } from '/shared/ui/components.js';

const MODULE = 'hr';
const main = document.getElementById('main');
let ctx;
let view;
let cache = null;

const STATUSES = ['Baru', 'Disaring', 'Temuduga Dijadualkan', 'Ditawarkan', 'Diterima', 'Ditolak', 'Tarik diri'];
const STATUS_KIND = { Baru: '', Disaring: 'warning', 'Temuduga Dijadualkan': 'info', Ditawarkan: 'info', Diterima: 'success', Ditolak: 'danger', 'Tarik diri': '' };
const CADANGAN_KIND = { Teruskan: 'success', Simpan: 'warning', Tolak: 'danger' };
const isHr = () => ctx.roles.includes('hr_admin') || ctx.superadmin;

const call = (action, payload) => api(MODULE, action, payload || {}, { onSlow: () => toast('Masih memproses...', 'info', 2500) });
const invalidate = () => { cache = null; };
async function load(force) { if (!cache || force) cache = await call('listApplicants'); return cache; }

function field(label, input, { hint, required, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') }, el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input, hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (a) => el('input', { class: 'input', autocomplete: 'off', ...a });
function sel(opts, value = '') { const s = el('select', { class: 'input' }, opts.map(([v, t]) => el('option', { value: v }, t))); if (opts.some(([v]) => v === value)) s.value = value; return s; }
const errBox = () => el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
const showErr = (b, e) => { clear(b).append(e.message || String(e)); b.hidden = false; };
const statusBadge = (s) => badge(s, STATUS_KIND[s]);
const fmtIc = (v) => (/^\d{12}$/.test(String(v || '')) ? `${v.slice(0, 6)}-${v.slice(6, 8)}-${v.slice(8)}` : v);

function daysTo(iso, today) {
  if (!iso) return null;
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
}
/** Sistem lama: interviewBadge (hari ini / esok / N hari lagi / lepas). */
function interviewBadge(iso, today, warn) {
  const n = daysTo(iso, today);
  if (n === null) return null;
  if (n < 0) return badge(`Interview ${formatDate(iso)} (lepas)`, '');
  if (n === 0) return badge('Interview HARI INI', 'danger');
  if (n === 1) return badge('Interview esok', 'warning');
  return badge(`Interview ${formatDate(iso)}${n <= warn ? ` (${n} hari)` : ''}`, n <= warn ? 'warning' : 'info');
}

async function fetchBlobUrl(payload) {
  const f = await call('getFile', payload);
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  return { url: URL.createObjectURL(new Blob([bytes], { type: f.mime })), mime: f.mime, nama: f.nama };
}
async function viewFile(payload, title) {
  try {
    const f = await fetchBlobUrl(payload);
    const isImg = /^image\//.test(f.mime);
    openModal({
      title, wide: true,
      body: isImg ? el('img', { src: f.url, alt: title, class: 'share-img' }) : el('p', null, 'Fail PDF. Tekan Muat turun untuk buka.'),
      onClose: () => setTimeout(() => URL.revokeObjectURL(f.url), 1000),
      actions: [{ label: 'Tutup', class: 'btn-secondary' }, { label: 'Muat turun', onClick: () => { const a = el('a', { href: f.url, download: f.nama }); document.body.append(a); a.click(); a.remove(); } }],
    });
  } catch (e) { if (e.status !== 401) toast(e.message, 'danger'); }
}

// ------------------------------------------------------------------ router
async function route() {
  const h = location.hash || '#/';
  clear(view);
  window.scrollTo(0, 0);
  try {
    if (h.startsWith('#/p/')) await renderDetail(decodeURIComponent(h.slice(4)));
    else if (h.startsWith('#/jawatan')) await renderPositions();
    else await renderList(new URLSearchParams(h.split('?')[1] || ''));
  } catch (e) {
    if (e.status !== 401) append(clear(view), el('div', { class: 'alert alert-danger' }, e.message));
  }
}

// ------------------------------------------------------------------ S-12 / S-15 senarai pemohon
async function renderList(params) {
  const d = await load(true);
  const P = d.pemohon.filter((p) => !p.anonymised);
  const depts = [...new Set(P.map((p) => p.department).filter(Boolean))].sort();
  const jaw = [...new Set(P.map((p) => p.jawatan))].sort();
  const q = inp({ type: 'search', placeholder: 'Cari nama, no. rujukan, jawatan', 'aria-label': 'Cari' });
  const st = sel([['', 'Semua status'], ['aktif', 'Masih aktif'], ...STATUSES.map((s) => [s, s])], params.get('status') || 'aktif');
  const dp = sel([['', 'Semua department'], ['-', '(tiada department)'], ...depts.map((x) => [x, x])], params.get('dept') || '');
  const jw = sel([['', 'Semua jawatan'], ...jaw.map((x) => [x, x])]);
  [[st, 'Status'], [dp, 'Department'], [jw, 'Jawatan']].forEach(([s, l]) => s.setAttribute('aria-label', l));
  const host = el('div');
  const count = el('span', { class: 'caption' });
  let shown = [];
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    shown = P.filter((p) => (!st.value || (st.value === 'aktif' ? !['Diterima', 'Ditolak', 'Tarik diri'].includes(p.status) : p.status === st.value))
      && (!dp.value || (dp.value === '-' ? !p.department : p.department === dp.value)) && (!jw.value || p.jawatan === jw.value)
      && (!term || `${p.nama} ${p.app_no} ${p.jawatan}`.toLowerCase().includes(term)));
    clear(count).append(`${shown.length} pemohon`);
    clear(host);
    if (!shown.length) { host.append(emptyState('briefcase', 'Tiada pemohon sepadan.')); return; }
    host.append(el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
      el('thead', null, el('tr', null, ['No. rujukan', 'Pemohon', 'Jawatan', 'Status', 'Dimohon', ''].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', null, shown.map((p) => el('tr', null,
        el('td', { 'data-label': 'No. rujukan' }, el('a', { href: '#/p/' + encodeURIComponent(p.app_no) }, p.app_no)),
        el('td', { 'data-label': 'Pemohon' }, el('strong', null, p.nama), el('div', { class: 'caption' }, `${p.ic_mask} · ${p.jantina}`)),
        el('td', { 'data-label': 'Jawatan' }, p.jawatan, el('div', { class: 'caption' }, p.department || 'Department belum ditetapkan')),
        el('td', { 'data-label': 'Status' }, el('div', { class: 'chips' }, statusBadge(p.status), interviewBadge(p.tarikh_interview, d.hari_ini, d.amaran_hari),
          p.bil_penilaian ? badge(`${p.bil_penilaian} penilaian`, 'info') : null)),
        el('td', { 'data-label': 'Dimohon' }, formatDate(p.tarikh_mohon)),
        el('td', { class: 'actions' }, el('a', { class: 'btn btn-secondary btn-sm', href: '#/p/' + encodeURIComponent(p.app_no) }, 'Buka'))))))));
  };
  q.addEventListener('input', draw);
  [st, dp, jw].forEach((s) => s.addEventListener('change', draw));
  const n = (s) => P.filter((p) => p.status === s).length;
  const soon = P.filter((p) => { const x = daysTo(p.tarikh_interview, d.hari_ini); return x !== null && x >= 0 && x <= d.amaran_hari && p.status === 'Temuduga Dijadualkan'; })
    .sort((a, b) => a.tarikh_interview.localeCompare(b.tarikh_interview));
  const csv = isHr() ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => downloadCsv(shown) }, icon('download'), 'CSV') : null;
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, isHr() ? 'Pemohon kerja' : 'Papan interviewer'),
      el('div', { class: 'row' }, csv, isHr() ? el('a', { class: 'btn btn-secondary', href: '/public/mohon/', target: '_blank', rel: 'noopener' }, icon('share'), 'Borang awam') : null)),
    !isHr() ? el('p', { class: 'muted', style: 'margin:0' }, `Department: ${d.skop.map((x) => x.toUpperCase()).join(', ') || '-'}. No. KP disembunyikan; maklumat peribadi lain hanya untuk HR.`) : null,
    el('div', { class: 'hr-pipe' }, STATUSES.map((s) => el('a', { class: 'hr-stat ' + (s === 'Ditolak' ? 'bad' : s === 'Diterima' ? 'ok' : s === 'Baru' ? 'warn' : 'info'), href: '#/?status=' + encodeURIComponent(s) },
      el('div', { class: 'label' }, s), el('div', { class: 'v' }, String(n(s)))))),
    soon.length ? el('div', { class: 'alert alert-warning' }, el('strong', null, `Interview dalam ${d.amaran_hari} hari (${soon.length}): `),
      soon.map((p, i) => [i ? ', ' : '', el('a', { href: '#/p/' + encodeURIComponent(p.app_no) }, `${p.nama} (${formatDate(p.tarikh_interview)})`)])) : null,
    el('div', { class: 'hr-filters' }, q, st, dp, jw), count, host);
  draw();
}

function csvCell(v) { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function downloadCsv(rows) {
  const head = ['No. rujukan', 'Nama', 'Jantina', 'Jawatan', 'Department', 'Status', 'Tarikh mohon', 'Tarikh interview', 'Tukar tarikh', 'Gaji dipohon', 'Bil. penilaian'];
  const lines = [head, ...rows.map((p) => [p.app_no, p.nama, p.jantina, p.jawatan, p.department, p.status, formatDate(p.tarikh_mohon), p.tarikh_interview ? formatDate(p.tarikh_interview) : '', p.interview_tukar, p.gaji_dijangka ?? '', p.bil_penilaian])];
  const blob = new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `Pemohon_${todayIso()}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------ S-13 butiran pemohon
async function renderDetail(no) {
  const a = await call('getApplicant', { app_no: no });
  const d = await load();
  const reload = async () => { invalidate(); clear(view); await renderDetail(no); };
  const kv = (k, v) => [el('dt', null, k), el('dd', null, v === null || v === undefined || v === '' ? '-' : v)];
  const photo = el('div', { class: 'hr-photo' });
  if (a.ada_gambar) fetchBlobUrl({ app_no: no, jenis: 'gambar' }).then((f) => photo.replaceWith(el('img', { class: 'hr-photo', src: f.url, alt: 'Gambar ' + a.nama }))).catch(() => {});
  const rowsTable = (list, cols) => (list.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
    el('thead', null, el('tr', null, cols.map(([, l]) => el('th', { scope: 'col' }, l)))),
    el('tbody', null, list.map((r) => el('tr', null, cols.map(([k, l]) => el('td', { 'data-label': l }, r[k] || '-'))))))) : el('p', { class: 'muted', style: 'margin:0' }, 'Tiada.'));

  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, icon('arrow-left'), 'Senarai')),
    a.anonymised ? el('div', { class: 'alert alert-warning' }, 'Rekod ini telah dianonimkan (retention / permintaan pemohon).') : null,
    el('section', { class: 'card stack' },
      el('div', { class: 'hr-head' }, photo,
        el('div', { class: 'stack', style: 'flex:1;min-width:220px' },
          el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, a.nama), el('div', { class: 'chips' }, statusBadge(a.status), interviewBadge(a.tarikh_interview, d.hari_ini, d.amaran_hari))),
          el('div', { class: 'caption' }, `${a.app_no} · dimohon ${formatDateTime(a.tarikh_mohon)}`),
          el('dl', { class: 'kv' },
            ...kv('Jawatan', a.jawatan), ...kv('Department', a.department),
            ...kv('No. KP', isHr() ? fmtIc(a.ic) : a.ic_mask), ...kv('Jantina', a.jantina),
            ...(isHr() ? [...kv('Tarikh lahir', a.dob ? formatDate(a.dob) : ''), ...kv('Taraf perkahwinan', a.status_kahwin), ...kv('Emel', a.email), ...kv('Telefon', [a.tel_bimbit, a.tel_rumah].filter(Boolean).join(' / ')), ...kv('Alamat', a.alamat)] : []),
            ...kv('Gaji dipohon', a.gaji_dijangka !== null ? formatRM(a.gaji_dijangka) : '')))),
      el('div', { class: 'row' },
        a.ada_resume ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => viewFile({ app_no: no, jenis: 'resume' }, 'Resume ' + a.nama) }, icon('scroll-text'), 'Resume') : null,
        a.ada_borang_lama ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => viewFile({ app_no: no, jenis: 'borang_lama' }, 'Borang (sistem lama)') }, icon('scroll-text'), 'Borang PDF lama') : null,
        isHr() && !a.anonymised ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => printForm(a) }, icon('printer'), 'Cetak borang') : null)),
    el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Akademik'), rowsTable(a.akademik, [['dari', 'Dari'], ['hingga', 'Hingga'], ['institusi', 'Sekolah / pusat pengajian'], ['kelulusan', 'Kelulusan']])),
    el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Pengalaman kerja'), rowsTable(a.pengalaman, [['dari', 'Dari'], ['hingga', 'Hingga'], ['majikan', 'Majikan'], ['jawatan', 'Jawatan']])),
    isHr() ? el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Maklumat HR sahaja'),
      el('dl', { class: 'kv' },
        ...kv('Kecemasan', a.kecemasan_nama ? `${a.kecemasan_nama} (${a.kecemasan_hubungan}) · ${a.kecemasan_tel} (${a.kecemasan_jenis_tel})` : ''),
        ...kv('Rekod jenayah', a.pernah_disabit === 'Ya' ? el('span', null, badge('Ya', 'danger'), ' ', a.disabit_penerangan) : a.pernah_disabit),
        ...kv('Semakan latar belakang', a.kebenaran_semak),
        ...kv('Rujukan 1', [a.ref1.nama, a.ref1.jawatan, a.ref1.syarikat, a.ref1.tel].filter(Boolean).join(' · ')),
        ...kv('Rujukan 2', [a.ref2.nama, a.ref2.jawatan, a.ref2.syarikat, a.ref2.tel].filter(Boolean).join(' · ')),
        ...kv('Persetujuan', a.consent_at ? `${formatDateTime(a.consent_at)} (${a.consent_version})` : a.consent_version),
        ...kv('Retention', a.retention_until ? 'Dianonimkan selepas ' + formatDate(a.retention_until) : 'Tidak (status belum akhir)'))) : null,
    isHr() && !a.anonymised ? updateCard(a, reload) : null,
    evaluationCard(a, reload),
    isHr() && !a.anonymised ? el('div', null, el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => anonymiseModal(a) }, icon('x'), 'Anonimkan (PDPA)')) : null);
}

function updateCard(a, done) {
  const d = cache || { pemohon: [] };
  const depts = [...new Set(d.pemohon.map((p) => p.department).filter(Boolean))];
  const st = sel(STATUSES.map((s) => [s, s]), a.status);
  const dept = inp({ value: a.department || '', list: 'hr-depts', maxlength: 60 });
  const ti = inp({ type: 'date', value: a.tarikh_interview || '' });
  const note = el('textarea', { class: 'input', rows: 3, maxlength: 1000 });
  note.value = a.catatan_hr || '';
  const err = errBox();
  const save = el('button', { class: 'btn', type: 'button' }, icon('check'), 'Simpan');
  save.addEventListener('click', () => busy(save, async () => {
    err.hidden = true;
    if (['Ditolak', 'Tarik diri'].includes(st.value) && st.value !== a.status && !(await confirmDialog('Status akhir', `Data peribadi pemohon akan dianonimkan automatik selepas tempoh retention (lalai 12 bulan). Teruskan?`, { okLabel: 'Teruskan' }))) return;
    try {
      const r = await call('updateApplicant', { app_no: a.app_no, status: st.value, department: dept.value, tarikh_interview: ti.value, catatan_hr: note.value });
      toast(r.interview_tukar > a.interview_tukar ? `Disimpan. Tarikh interview telah ditukar ${r.interview_tukar} kali.` : 'Disimpan.', 'success');
      done();
    } catch (e) { showErr(err, e); }
  }));
  return el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Kemas kini HR'), err,
    el('datalist', { id: 'hr-depts' }, depts.map((x) => el('option', { value: x }))),
    el('div', { class: 'hr-grid' }, field('Status', st), field('Department', dept, { hint: 'Guna kod department portal (cth PSS, OMP) supaya interviewer department itu nampak pemohon.' }),
      field('Tarikh interview', ti, { hint: a.interview_tukar ? `Telah ditukar ${a.interview_tukar} kali.` : '' }), field('Catatan HR', note, { cls: 'full', hint: 'Hanya HR nampak.' })),
    el('div', null, save));
}

function evaluationCard(a, done) {
  const mine = a.penilaian.find((p) => p.milik_saya);
  const others = a.penilaian.filter((p) => !p.milik_saya);
  const sc = Object.fromEntries(a.kriteria.map((k) => [k.key, sel([['', '-'], ...[1, 2, 3, 4, 5].map((n) => [String(n), String(n)])], mine ? String(mine.markah[k.key] || '') : '')]));
  const cad = sel([['', '- Cadangan -'], ['Teruskan', 'Teruskan'], ['Simpan', 'Simpan (simpanan)'], ['Tolak', 'Tolak']], mine?.cadangan || '');
  const note = el('textarea', { class: 'input', rows: 3, maxlength: 1000, placeholder: 'Catatan penilaian' });
  note.value = mine?.catatan || '';
  const err = errBox();
  const save = el('button', { class: 'btn', type: 'button' }, icon('check'), mine ? 'Kemas kini penilaian' : 'Simpan penilaian');
  save.addEventListener('click', () => busy(save, async () => {
    err.hidden = true;
    const markah = Object.fromEntries(Object.entries(sc).map(([k, s]) => [k, Number(s.value)]));
    if (Object.values(markah).some((v) => !v)) { showErr(err, new Error('Beri markah 1-5 untuk setiap kriteria')); return; }
    if (!cad.value) { showErr(err, new Error('Pilih cadangan')); return; }
    try { await call('saveInterview', { app_no: a.app_no, markah, cadangan: cad.value, catatan: note.value }); toast('Penilaian disimpan.', 'success'); done(); } catch (e) { showErr(err, e); }
  }));
  const evalRow = (p) => el('li', null, el('div', null, el('strong', null, p.interviewer_nama || '-'), ` · ${formatDate(p.tarikh)} · purata ${p.purata} `, badge(p.cadangan, CADANGAN_KIND[p.cadangan])),
    el('div', { class: 't' }, a.kriteria.map((k) => `${k.label}: ${p.markah[k.key]}`).join(' · ')), p.catatan ? el('div', null, p.catatan) : null);
  return el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Penilaian interview'),
    others.length ? el('ol', { class: 'timeline' }, others.map(evalRow)) : null,
    a.anonymised ? null : [err, el('div', { class: 'hr-score' }, a.kriteria.map((k) => el('div', { class: 'row' }, el('span', null, k.label), sc[k.key]))),
      el('div', { class: 'hr-grid' }, field('Cadangan', cad), field('Catatan', note, { cls: 'full' })), el('div', null, save)]);
}

function anonymiseModal(a) {
  const why = el('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Contoh: Permintaan pemohon melalui emel 21/11/2026' });
  const err = errBox();
  openModal({
    title: 'Anonimkan ' + a.app_no,
    body: el('div', { class: 'stack' }, err, el('p', null, 'Semua data peribadi (IC, telefon, emel, alamat, akademik, rujukan, gambar, tandatangan, resume) dipadam kekal. Hanya jawatan, department, status dan tarikh disimpan untuk statistik.'),
      field('Sebab (wajib)', why, { required: true })),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Anonimkan', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
        try { await call('anonymiseApplicant', { app_no: a.app_no, sebab: why.value }); close(); invalidate(); toast('Rekod dianonimkan.', 'success'); route(); } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ cetak borang (sistem lama: pratonton A4 "Borang Permohonan Jawatan")
async function printForm(a) {
  const area = el('section', { class: 'stack' });
  view.append(area);
  area.append(el('p', { class: 'caption' }, 'Menyediakan borang...'));
  let photo = null, sign = null;
  try { if (a.ada_gambar) photo = (await fetchBlobUrl({ app_no: a.app_no, jenis: 'gambar' })).url; } catch { /* tiada */ }
  try { if (a.ada_tandatangan) sign = (await fetchBlobUrl({ app_no: a.app_no, jenis: 'tandatangan' })).url; } catch { /* tiada */ }
  const row = (k, v) => el('tr', null, el('td', { class: 'lbl' }, k), el('td', null, v || '-'));
  const tbl = (list, cols) => el('table', null, el('tr', null, cols.map(([, l]) => el('th', null, l))), (list.length ? list : [{}]).map((r) => el('tr', null, cols.map(([k]) => el('td', null, r[k] || '-')))));
  const pg = el('div', { id: 'bf-print' },
    el('section', { class: 'bf-pg' },
      el('div', { class: 'top' }, el('div', null, el('strong', null, 'VOLTAKE ENERGY SERVICES'), el('div', null, `No. rujukan: ${a.app_no}`), el('div', null, `Tarikh mohon: ${formatDate(a.tarikh_mohon)}`)),
        photo ? el('img', { class: 'ph', src: photo, alt: '' }) : el('div', { class: 'ph' })),
      el('h1', null, 'BORANG PERMOHONAN JAWATAN'),
      el('h2', null, 'Maklumat asas'),
      el('table', null, row('Jawatan dipohon', a.jawatan), row('Department', a.department), row('Nama penuh', a.nama), row('No. kad pengenalan', fmtIc(a.ic)), row('Tarikh lahir', a.dob ? formatDate(a.dob) : ''),
        row('Jantina', a.jantina), row('Taraf perkahwinan', a.status_kahwin), row('Emel', a.email), row('No. telefon', [a.tel_bimbit, a.tel_rumah].filter(Boolean).join(' / ')), row('Alamat', a.alamat)),
      el('h2', null, 'Maklumat akademik'), tbl(a.akademik, [['dari', 'Dari'], ['hingga', 'Hingga'], ['institusi', 'Sekolah / pusat pengajian'], ['kelulusan', 'Kelulusan']]),
      el('h2', null, 'Pengalaman kerja'), tbl(a.pengalaman, [['dari', 'Dari'], ['hingga', 'Hingga'], ['majikan', 'Majikan'], ['jawatan', 'Jawatan']])),
    el('section', { class: 'bf-pg' },
      el('h2', null, 'Hubungan kecemasan'),
      el('table', null, row('Nama penama', a.kecemasan_nama), row('Hubungan', a.kecemasan_hubungan), row('No. telefon', `${a.kecemasan_tel} (${a.kecemasan_jenis_tel})`)),
      el('h2', null, 'Lain-lain maklumat'),
      el('table', null, row('Rekod jenayah / siasatan / sabitan', a.pernah_disabit + (a.disabit_penerangan ? ': ' + a.disabit_penerangan : '')), row('Gaji dipohon', a.gaji_dijangka !== null ? formatRM(a.gaji_dijangka) : '')),
      el('h2', null, 'Rujukan'),
      tbl([a.ref1, a.ref2].filter((r) => r.nama), [['nama', 'Nama'], ['jawatan', 'Jawatan'], ['syarikat', 'Organisasi'], ['tel', 'Telefon']]),
      el('h2', null, 'Persetujuan & tandatangan'),
      el('table', null, row('Kebenaran semakan latar belakang', a.kebenaran_semak), row('Persetujuan notis privasi', a.consent_at ? `${formatDateTime(a.consent_at)} (${a.consent_version})` : a.consent_version)),
      el('p', { style: 'margin-top:6mm' }, 'Tandatangan pemohon:'), sign ? el('img', { class: 'sig', src: sign, alt: '' }) : el('p', null, '-')));
  clear(area).append(
    el('div', { class: 'row-between' }, el('h3', { style: 'margin:0' }, 'Borang permohonan'),
      el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, icon('printer'), 'Cetak / simpan PDF'),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => area.remove() }, icon('x'), 'Tutup'))),
    el('div', { class: 'bf-preview' }, pg));
  area.scrollIntoView({ block: 'start' });
}

// ------------------------------------------------------------------ S-14 jawatan
async function renderPositions() {
  if (!isHr()) { append(view, el('div', { class: 'alert alert-danger' }, 'Hanya HR boleh urus jawatan.')); return; }
  const list = await call('listPositions');
  const draw = (rows) => {
    clear(view);
    const link = location.origin + '/public/mohon/';
    append(view,
      el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Jawatan'), el('button', { class: 'btn', type: 'button', onclick: () => positionModal(null, draw) }, icon('plus'), 'Jawatan baharu')),
      el('div', { class: 'alert alert-info', style: 'overflow-wrap:anywhere;flex-wrap:wrap' }, 'Pautan borang awam: ', el('strong', null, link), ' ',
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => navigator.clipboard?.writeText(link).then(() => toast('Pautan disalin.', 'success')) }, icon('copy'), 'Salin')),
      rows.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['Jawatan', 'Department', 'Lokasi', 'Tutup', 'Pemohon', 'Status', ''].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', null, rows.map((p) => el('tr', null,
          el('td', { 'data-label': 'Jawatan' }, el('strong', null, p.jawatan)), el('td', { 'data-label': 'Department' }, p.department), el('td', { 'data-label': 'Lokasi' }, p.lokasi || '-'),
          el('td', { 'data-label': 'Tutup' }, p.tarikh_tutup ? formatDate(p.tarikh_tutup) : '-'), el('td', { 'data-label': 'Pemohon', class: 'num' }, String(p.bil_pemohon)),
          el('td', { 'data-label': 'Status' }, badge(p.aktif && (!p.tarikh_tutup || p.tarikh_tutup >= todayIso()) ? 'Dibuka' : 'Ditutup', p.aktif && (!p.tarikh_tutup || p.tarikh_tutup >= todayIso()) ? 'success' : '')),
          el('td', { class: 'actions' }, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => positionModal(p, draw) }, icon('pencil'), 'Ubah')))))))
        : emptyState('briefcase', 'Belum ada jawatan. Tambah jawatan supaya pemohon boleh memilih.'));
  };
  draw(list);
}

function positionModal(p, done) {
  const j = inp({ value: p?.jawatan || '', maxlength: 120 });
  const dp = inp({ value: p?.department || '', maxlength: 60, placeholder: 'Cth: PSS, OMP, HR' });
  const lok = inp({ value: p?.lokasi || '', maxlength: 120 });
  const pen = el('textarea', { class: 'input', rows: 3, maxlength: 1000 });
  pen.value = p?.penerangan || '';
  const tutup = inp({ type: 'date', value: p?.tarikh_tutup || '' });
  const aktif = el('input', { type: 'checkbox', checked: p ? p.aktif : true });
  const err = errBox();
  openModal({
    title: p ? 'Ubah jawatan' : 'Jawatan baharu',
    body: el('div', { class: 'stack' }, err, field('Jawatan', j, { required: true }), field('Department', dp, { required: true, hint: 'Guna kod department portal supaya interviewer department itu nampak pemohon.' }),
      field('Lokasi', lok), field('Penerangan ringkas', pen, { hint: 'Dipapar kepada pemohon.' }), field('Tarikh tutup', tutup, { hint: 'Kosong = dibuka sehingga ditutup manual.' }),
      el('label', { class: 'check' }, aktif, 'Dibuka (dipapar dalam borang awam)')),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
        try { const r = await call('savePosition', { position_id: p?.position_id, jawatan: j.value, department: dp.value, lokasi: lok.value, penerangan: pen.value, tarikh_tutup: tutup.value, aktif: aktif.checked }); close(); toast('Jawatan disimpan.', 'success'); done(r); } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ mula
async function start() {
  try { ctx = await bootModule(MODULE, 'Mohon Kerja'); } catch { return; }
  view = el('div', { id: 'view', class: 'stack' });
  const items = [{ href: '#/', label: isHr() ? 'Pemohon' : 'Papan interviewer', ikon: 'users', match: (h) => !h.startsWith('#/jawatan') }];
  if (isHr()) items.push({ href: '#/jawatan', label: 'Jawatan', ikon: 'briefcase', match: (h) => h.startsWith('#/jawatan') });
  append(clear(main), view);
  renderModuleNav(main, items);
  main.removeAttribute('aria-busy');
  window.addEventListener('hashchange', route);
  await route();
}

start();
