// Voltrack - jejak projek Commercial > Operation > Claim > LOD (F-80 hingga F-85; AFD S-80, S-81, S-82; IPD 2H.1).
// Ikut VoltTrack v2 lama (Ruzhad9494/Voltrack index.html): Eksekutif Dashboard (KPI, status quotation, kesihatan
// pembayaran, notifikasi aktif, ringkasan klien), 4 jadual fasa (Operation = Approved, Claim = Full Report siap,
// LOD = Outstanding), borang setiap fasa dengan pilihan dropdown yang sama, notifikasi tindakan (generateProjectNotifications).
// Beza: login Google + Akses modul (tab Users & password dibuang), medan dikira di server, push OneSignal -> emel harian.
import { bootModule } from '/shared/lib/page.js';
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatRM, formatDate, formatDateTime } from '/shared/lib/format.js';
import { icon, toast, openModal, busy, badge, emptyState, renderModuleNav } from '/shared/ui/components.js';

const MODULE = 'voltrack';
const main = document.getElementById('main');
let ctx;
let view;
let data = null;

const PHASE = {
  Commercial: { label: 'Commercial', title: 'Fasa 1: Commercial / Quotation', ikon: 'briefcase' },
  Operation: { label: 'Operation', title: 'Fasa 2: Operation', ikon: 'wrench' },
  Claim: { label: 'Claim', title: 'Fasa 3: Claim / Kewangan', ikon: 'receipt' },
  LOD: { label: 'LOD', title: 'Fasa 4: LOD Tracker', ikon: 'triangle-alert' },
};
const OPT = {
  status_quotation: ['Pending', 'Cancel', 'Approved'], ready: ['Sedia', 'Belum', 'N/A'], yesno: ['Yes', 'No'],
  payment_status: ['Pending', 'Paid', 'Outstanding'], action: ['Pending', 'Initiated', 'Completed'], case_status: ['Open', 'KIV', 'Closed'],
};
const KIND = { Approved: 'success', Paid: 'success', Completed: 'success', Closed: 'success', Pending: 'warning', Initiated: 'info', KIV: 'warning', Open: 'warning', Cancel: '', Outstanding: 'danger' };

const call = (action, payload) => api(MODULE, action, payload || {}, { onSlow: () => toast('Masih memproses...', 'info', 2500) });
const d = (v) => (v ? formatDate(v) : '-');
const rm = (v) => (v === '' || v === null || v === undefined ? '-' : formatRM(v));
const st = (v, fallback = '-') => (v ? badge(v, KIND[v] || '') : fallback);

function field(label, input, { hint, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') }, el('label', { for: id }, label), input, hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (a) => el('input', { class: 'input', autocomplete: 'off', ...a });
function sel(opts, value = '', blank = '-- Pilih --') { const s = el('select', { class: 'input' }, [el('option', { value: '' }, blank), ...opts.map((o) => el('option', { value: o }, o))]); s.value = opts.includes(value) ? value : ''; return s; }
const errBox = () => el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
const showErr = (b, e) => { clear(b).append(e.message || String(e)); b.hidden = false; };
const canWrite = (tab) => data && data.boleh_tulis.includes(tab);

async function load(force) { if (!data || force) data = await call('listProjects'); return data; }

// ------------------------------------------------------------------ notifikasi tindakan (sistem lama generateProjectNotifications)
function daysBetween(a, b) { if (!a || !b) return 0; return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function todos(projects, today) {
  const out = [];
  const add = (cat, pri, p, msg, detail, fasa) => out.push({ cat, pri, p, msg, detail, fasa });
  for (const p of projects) {
    const label = `[${p.id}] ${p.company}`;
    if (p.status_quotation === 'Approved' && !p.date_start_job) add('operation', 'warning', p, `${label}: quotation diluluskan. Tetapkan tarikh mula kerja.`, `Date proceed: ${d(p.date_proceed)}. Pastikan MOS, JSA & PTW lengkap.`, 'Operation');
    if (p.status_quotation === 'Approved' && p.date_start_job && p.ptw_ready === 'Belum') add('operation', 'urgent', p, `${label}: PTW masih belum sedia.`, `Kerja mula ${d(p.date_start_job)}. PTW wajib sebelum mula di tapak.`, 'Operation');
    if (p.gwr_submitted === 'Yes' && p.full_report_submitted !== 'Yes') add('operation', 'warning', p, `${label}: GWR dihantar. Full Report boleh disediakan.`, `GWR date: ${d(p.gwr_date)}.`, 'Operation');
    if (p.full_report_submitted === 'Yes' && !p.invoice_no) add('claim', 'urgent', p, `${label}: Full Report siap. Jana invoice sekarang.`, `Report date: ${d(p.full_report_date)}. Invoice dalam 7 hari dari tarikh report.`, 'Claim');
    if (p.full_report_submitted === 'Yes' && p.invoice_no && p.payment_status === 'Pending') add('claim', 'info', p, `${label}: invoice ${p.invoice_no} menunggu pembayaran.`, `Due: ${d(p.payment_due_date)}.`, 'Claim');
    if (p.payment_due_date && p.payment_status === 'Pending') {
      const left = daysBetween(today, p.payment_due_date);
      if (left >= 0 && left <= 7) add('claim', 'warning', p, `${label}: pembayaran luput dalam ${left} hari.`, `Due: ${d(p.payment_due_date)}. Invoice ${p.invoice_no}. Hantar peringatan kepada klien.`, 'Claim');
    }
    if (p.payment_status === 'Outstanding' && p.overdue_days > 0) add('lod', 'urgent', p, `${label}: TERTUNGGAK ${p.overdue_days} hari. Tindakan LOD diperlukan.`, `Due: ${d(p.payment_due_date)}. Nilai: ${rm(p.quotation_amount)}.`, 'LOD');
    if (p.payment_status === 'Outstanding' && p.lod_reminder_sent && !p.lod_reminder_date && daysBetween(p.lod_reminder_sent, today) >= 0) add('lod', 'warning', p, `${label}: LOD reminder letter perlu dihantar.`, `Sasaran: ${d(p.lod_reminder_sent)}. Rekod tarikh sebenar dihantar.`, 'LOD');
    if (p.payment_status === 'Outstanding' && p.lod_issue && !p.lod_issue_date && daysBetween(p.lod_issue, today) >= 0) add('lod', 'warning', p, `${label}: masa keluarkan surat LOD rasmi.`, `Sasaran: ${d(p.lod_issue)}.`, 'LOD');
    if (p.payment_status === 'Outstanding' && p.overdue_days > 30 && (!p.ctos_action || p.ctos_action === 'Pending')) add('lod', 'urgent', p, `${label}: KRITIKAL. Pertimbangkan tindakan CTOS & undang-undang.`, `Tertunggak ${p.overdue_days} hari.`, 'LOD');
  }
  const rank = { urgent: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.pri] - rank[b.pri]);
}
/** Kategori notifikasi ikut role: admin / viewer / superadmin nampak semua (sistem lama: tag role OneSignal). */
function myCats() {
  const r = ctx.roles || [];
  if (ctx.superadmin || r.includes('admin') || r.includes('viewer')) return ['operation', 'claim', 'lod'];
  return ['operation', 'claim', 'lod'].filter((c) => r.includes(c));
}
function todoList(items, limit) {
  if (!items.length) return el('p', { class: 'muted', style: 'margin:0' }, 'Tiada tindakan tertunggak.');
  return el('ul', { class: 'vt-todo' }, items.slice(0, limit).map((n) => el('li', { class: n.pri },
    el('span', { class: 'grow' }, el('a', { href: '#/p/' + encodeURIComponent(n.p.id) }, n.msg), el('span', { class: 'caption' }, n.detail)),
    canWrite(n.fasa) ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => phaseForm(n.fasa, n.p) }, 'Kemaskini') : null)));
}

// ------------------------------------------------------------------ router
async function route() {
  const h = location.hash || '#/';
  clear(view);
  window.scrollTo(0, 0);
  try {
    await load();
    if (h.startsWith('#/fasa/')) renderPhase(decodeURIComponent(h.slice(7).split('?')[0]));
    else if (h.startsWith('#/p/')) await renderProject(decodeURIComponent(h.slice(4)));
    else renderDashboard();
  } catch (e) {
    if (e.status !== 401) append(clear(view), el('div', { class: 'alert alert-danger' }, e.message));
  }
}

// ------------------------------------------------------------------ S-82 Eksekutif Dashboard
function bars(title, entries) {
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return el('section', { class: 'card stack' }, el('h3', { style: 'margin:0;font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em' }, title),
    el('ul', { class: 'vt-bars' }, entries.map(([k, v]) => el('li', { title: `${k}: ${v} projek` },
      el('span', null, badge(k, KIND[k] || '')), el('span', { class: 'track' }, el('span', { class: 'bar', style: `width:${(v / max) * 100}%` })), el('span', { class: 'val' }, String(v))))));
}

function renderDashboard() {
  const P = data.projek;
  const approved = P.filter((p) => p.status_quotation === 'Approved');
  const revenue = approved.reduce((s, p) => s + (Number(p.quotation_amount) || 0), 0);
  const active = approved.filter((p) => p.full_report_submitted !== 'Yes');
  const out = P.filter((p) => p.payment_status === 'Outstanding');
  const outRm = out.reduce((s, p) => s + (Number(p.quotation_amount) || 0), 0);
  const cats = myCats();
  const mine = todos(P, data.hari_ini).filter((n) => cats.includes(n.cat));
  const count = (f, keys) => keys.map((k) => [k, P.filter((p) => f(p) === k).length]);
  const clients = {};
  P.forEach((p) => { const c = p.company || 'Tiada nama'; clients[c] = clients[c] || { n: 0, a: 0, o: 0 }; clients[c].n++; if (p.status_quotation === 'Approved') clients[c].a++; if (p.payment_status === 'Outstanding') clients[c].o++; });
  const top = Object.entries(clients).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  append(view,
    el('div', { class: 'row-between' }, el('div', null, el('h2', { style: 'margin:0' }, 'Eksekutif Dashboard'), el('p', { class: 'caption', style: 'margin:0' }, 'Ringkasan status projek dan kesihatan kewangan')),
      data.boleh_cipta ? el('button', { class: 'btn', type: 'button', onclick: () => phaseForm('Commercial', null) }, icon('plus'), 'Projek baru') : null),
    el('div', { class: 'vt-stats' },
      el('a', { class: 'vt-stat', href: '#/fasa/Commercial' }, el('div', { class: 'label' }, 'Jumlah projek'), el('div', { class: 'v' }, String(P.length))),
      el('a', { class: 'vt-stat ok', href: '#/fasa/Commercial?status=Approved' }, el('div', { class: 'label' }, 'Nilai diluluskan'), el('div', { class: 'v' }, formatRM(revenue)), el('div', { class: 'sub' }, `${approved.length} projek`)),
      el('a', { class: 'vt-stat warn', href: '#/fasa/Operation' }, el('div', { class: 'label' }, 'Operasi aktif'), el('div', { class: 'v' }, String(active.length))),
      el('a', { class: 'vt-stat bad', href: '#/fasa/LOD' }, el('div', { class: 'label' }, 'Tertunggak'), el('div', { class: 'v' }, String(out.length)), el('div', { class: 'sub' }, formatRM(outRm)))),
    el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, `Perlu tindakan (${mine.length})`), todoList(mine, 8),
      mine.length > 8 ? el('p', { class: 'caption', style: 'margin:0' }, `...dan ${mine.length - 8} lagi. Buka jadual fasa untuk senarai penuh.`) : null),
    el('div', { class: 'vt-grid2' },
      bars('Status quotation', count((p) => p.status_quotation || 'Pending', OPT.status_quotation)),
      bars('Kesihatan pembayaran (projek ada invoice)', count((p) => p.payment_status, OPT.payment_status))),
    el('section', { class: 'card stack' }, el('h3', { style: 'margin:0' }, 'Ringkasan klien'),
      top.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['Klien', 'Projek', 'Diluluskan', 'Tertunggak'].map((x) => el('th', { scope: 'col' }, x)))),
        el('tbody', null, top.map(([c, v]) => el('tr', null, el('td', { 'data-label': 'Klien' }, c), el('td', { 'data-label': 'Projek', class: 'num' }, String(v.n)), el('td', { 'data-label': 'Diluluskan', class: 'num' }, String(v.a)), el('td', { 'data-label': 'Tertunggak', class: 'num' }, v.o ? el('span', { class: 'vt-red' }, String(v.o)) : '0')))))) : emptyState('briefcase', 'Belum ada projek.')));
}

// ------------------------------------------------------------------ S-80 jadual fasa
function renderPhase(tab) {
  if (!PHASE[tab]) { location.replace('#/'); return; }
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const P = data.projek;
  const base = tab === 'Commercial' ? P : tab === 'Operation' ? P.filter((p) => p.status_quotation === 'Approved')
    : tab === 'Claim' ? P.filter((p) => p.full_report_submitted === 'Yes') : P.filter((p) => p.payment_status === 'Outstanding');
  const q = inp({ type: 'search', placeholder: 'Cari ID, syarikat, quotation, invoice, PO', 'aria-label': 'Cari' });
  const stOpts = tab === 'Commercial' ? OPT.status_quotation : tab === 'Operation' ? ['Pending Start', 'In Progress', 'GWR Submitted', 'Completed Full Report'] : tab === 'Claim' ? OPT.payment_status : OPT.case_status;
  const fs = sel(stOpts, params.get('status') || '', 'Semua status');
  fs.setAttribute('aria-label', 'Status');
  const host = el('div');
  const cats = { Operation: 'operation', Claim: 'claim', LOD: 'lod' };
  const flagged = new Set(todos(P, data.hari_ini).filter((n) => n.cat === cats[tab]).map((n) => n.p.id));
  const cols = {
    Commercial: [['Project ID', (p) => el('span', { class: 'vt-id' }, p.id)], ['Syarikat', (p) => p.company], ['Keterangan kerja', (p) => (p.job_description || '-').slice(0, 80)], ['Tarikh mohon', (p) => d(p.date_request)], ['Quotation no', (p) => p.quotation_no || '-'], ['Nilai', (p) => rm(p.quotation_amount)], ['Status', (p) => st(p.status_quotation, badge('Pending', 'warning'))]],
    Operation: [['Project ID', (p) => el('span', { class: 'vt-id' }, p.id, flagged.has(p.id) ? el('span', { class: 'vt-red', title: 'Perlu tindakan' }, ' •') : null)], ['Syarikat', (p) => p.company], ['Proceed', (p) => d(p.date_proceed)], ['Mula kerja', (p) => (p.date_start_job ? d(p.date_start_job) : el('span', { class: 'vt-red' }, 'Belum set'))], ['GWR', (p) => (p.gwr_submitted === 'Yes' ? d(p.gwr_date) : 'Belum')], ['Full report', (p) => (p.full_report_submitted === 'Yes' ? d(p.full_report_date) : 'Belum')], ['Status', (p) => badge(p.status_job || 'Pending', 'info')]],
    Claim: [['Project ID', (p) => el('span', { class: 'vt-id' }, p.id, flagged.has(p.id) ? el('span', { class: 'vt-red', title: 'Perlu tindakan' }, ' •') : null)], ['Syarikat', (p) => p.company], ['Report date', (p) => d(p.full_report_date)], ['Invoice no', (p) => p.invoice_no || el('span', { class: 'vt-red' }, 'Sila jana')], ['Due date', (p) => (p.payment_status === 'Outstanding' ? el('span', { class: 'vt-red' }, d(p.payment_due_date)) : d(p.payment_due_date))], ['Status bayaran', (p) => st(p.payment_status, badge('Pending', 'warning'))]],
    LOD: [['Project ID', (p) => el('span', { class: 'vt-id vt-red' }, p.id)], ['Syarikat', (p) => p.company], ['Overdue', (p) => el('span', { class: 'vt-red' }, `${p.overdue_days} hari`)], ['Nilai', (p) => rm(p.quotation_amount)], ['Reminder', (p) => (p.lod_reminder_date ? d(p.lod_reminder_date) : `Sasaran ${d(p.lod_reminder_sent)}`)], ['CTOS', (p) => st(p.ctos_action || 'Pending')], ['Status kes', (p) => st(p.case_status || 'Open')]],
  }[tab];
  const statusOf = (p) => (tab === 'Commercial' ? p.status_quotation || 'Pending' : tab === 'Operation' ? p.status_job : tab === 'Claim' ? p.payment_status || 'Pending' : p.case_status || 'Open');
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    const rows = base.filter((p) => (!fs.value || statusOf(p) === fs.value) && (!t || `${p.id} ${p.company} ${p.quotation_no} ${p.invoice_no} ${p.po_no} ${p.job_description}`.toLowerCase().includes(t)));
    clear(host);
    host.append(rows.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
      el('thead', null, el('tr', null, [...cols.map((c) => c[0]), ''].map((x) => el('th', { scope: 'col' }, x)))),
      el('tbody', null, rows.map((p) => el('tr', null, ...cols.map(([h, f]) => el('td', { 'data-label': h }, f(p))),
        el('td', { 'data-label': 'Tindakan' }, el('div', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' },
          el('a', { class: 'btn btn-ghost btn-sm', href: '#/p/' + encodeURIComponent(p.id) }, 'Butiran'),
          canWrite(tab) ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => phaseForm(tab, p) }, icon('pencil'), 'Kemaskini') : null)))))))
      : emptyState('search', tab === 'LOD' ? 'Tiada projek tertunggak.' : 'Tiada projek.'));
  };
  q.addEventListener('input', draw);
  fs.addEventListener('change', draw);
  const phaseTodos = todos(P, data.hari_ini).filter((n) => n.cat === cats[tab]);
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, PHASE[tab].title),
      tab === 'Commercial' && data.boleh_cipta ? el('button', { class: 'btn', type: 'button', onclick: () => phaseForm('Commercial', null) }, icon('plus'), 'Projek baru') : null),
    el('p', { class: 'caption', style: 'margin:0' }, { Commercial: 'Semua projek.', Operation: 'Projek dengan quotation Approved.', Claim: 'Projek yang Full Report sudah dihantar.', LOD: 'Projek yang pembayaran tertunggak (lepas due date).' }[tab],
      canWrite(tab) ? '' : ' Anda boleh lihat sahaja.'),
    phaseTodos.length ? el('section', { class: 'alert alert-warning stack' }, el('strong', null, `${phaseTodos.length} perkara memerlukan perhatian`), todoList(phaseTodos, 3)) : null,
    el('div', { class: 'vt-filters' }, q, fs), host);
  draw();
}

// ------------------------------------------------------------------ S-81 butiran projek
async function renderProject(id) {
  const { projek: p } = await call('getProject', { id });
  const kv = (k, v) => [el('dt', null, k), el('dd', null, v === '' || v === null || v === undefined ? '-' : v)];
  const who = (tab) => { const o = p['_' + tab.toLowerCase() + '_oleh']; const t = p['_' + tab.toLowerCase() + '_pada']; return o ? el('span', { class: 'caption' }, `Dikemas kini ${t ? formatDateTime(t) : ''} oleh ${o}`) : null; };
  const sec = (tab, body) => el('section', { class: 'card vt-phase' },
    el('div', { class: 'head' }, el('h3', null, icon(PHASE[tab].ikon), ' ', PHASE[tab].title), canWrite(tab) ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => phaseForm(tab, p) }, icon('pencil'), 'Kemaskini') : null),
    who(tab), el('dl', { class: 'kv' }, ...body));
  const step = (label, on) => badge(label, on ? 'success' : '');
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: '#/fasa/Commercial' }, icon('arrow-left'), 'Senarai')),
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, `${p.id} · ${p.company}`),
      data.boleh_admin ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => deleteModal(p) }, icon('x'), 'Padam projek') : null),
    el('div', { class: 'vt-steps', 'aria-label': 'Kemajuan projek' },
      step('Quotation Approved', p.status_quotation === 'Approved'), step('Kerja mula', !!p.date_start_job), step('GWR', p.gwr_submitted === 'Yes'),
      step('Full Report', p.full_report_submitted === 'Yes'), step('Invoice', !!p.invoice_no), step('Dibayar', p.payment_status === 'Paid'),
      p.payment_status === 'Outstanding' ? badge(`Tertunggak ${p.overdue_days} hari`, 'danger') : null),
    sec('Commercial', [...kv('Syarikat', p.company), ...kv('Tarikh request', d(p.date_request)), ...kv('Quotation no', p.quotation_no), ...kv('Nilai', rm(p.quotation_amount)),
      ...kv('Status', st(p.status_quotation)), ...kv('Tarikh proceed', d(p.date_proceed)), ...kv('Presentation date', d(p.presentation_date)), ...kv('Keterangan kerja', p.job_description), ...kv('Remark', p.remark)]),
    sec('Operation', [...kv('MOS / JSA / PTW', `${p.mos_ready || '-'} / ${p.jsa_ready || '-'} / ${p.ptw_ready || '-'}`), ...kv('Mula / siap kerja', `${d(p.date_start_job)} → ${d(p.date_completed_job)}`),
      ...kv('GWR', p.gwr_submitted === 'Yes' ? `Yes (${d(p.gwr_date)})` : p.gwr_submitted || '-'), ...kv('ID GWR', p.gwr_report_ids), ...kv('Full report', p.full_report_submitted === 'Yes' ? `Yes (${d(p.full_report_date)})` : p.full_report_submitted || '-'),
      ...kv('Report PIC', p.report_pic), ...kv('Status kerja', p.status_job ? badge(p.status_job, 'info') : '-')]),
    sec('Claim', [...kv('Invoice no', p.invoice_no), ...kv('Invoice date', d(p.invoice_date)), ...kv('PO no', p.po_no),
      ...kv('Follow up 1 / 2 / 3', `${d(p.followup_1)} / ${d(p.followup_2)} / ${d(p.followup_3)}`), ...kv('Payment due', d(p.payment_due_date)),
      ...kv('Status bayaran', st(p.payment_status)), ...kv('Tarikh dibayar', d(p.paid_date)), ...kv('Overdue', p.overdue_days ? `${p.overdue_days} hari` : '-')]),
    sec('LOD', [...kv('Reminder (sasaran / sebenar)', `${d(p.lod_reminder_sent)} / ${d(p.lod_reminder_date)}`), ...kv('LOD rasmi (sasaran / sebenar)', `${d(p.lod_issue)} / ${d(p.lod_issue_date)}`),
      ...kv('CTOS', st(p.ctos_action)), ...kv('Legal', st(p.legal_action)), ...kv('Status kes', st(p.case_status)), ...kv('Nota kes', p.case_remark)]));
}

function deleteModal(p) {
  const why = el('textarea', { class: 'input', rows: 3, maxlength: 300 });
  const err = errBox();
  openModal({
    title: 'Padam ' + p.id,
    body: el('div', { class: 'stack' }, err, el('p', { style: 'margin:0' }, `${p.company}. Projek ditanda dipadam dalam keempat-empat fasa. Rekod disimpan untuk audit.`), field('Sebab (wajib)', why)),
    actions: [{ label: 'Batal', class: 'btn-secondary' }, { label: 'Ya, padam', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
      try { await call('deleteProject', { id: p.id, sebab: why.value }); close(); data = null; toast(`${p.id} dipadam.`, 'success'); location.hash = '#/fasa/Commercial'; } catch (e) { showErr(err, e); }
    }) }],
  });
}

// ------------------------------------------------------------------ borang fasa (sistem lama openForm + attachFormListeners)
function addDays(s, n) { if (!s) return ''; const [y, m, dd] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); }

function phaseForm(tab, p) {
  p = p || {};
  const isNew = !p.id;
  const f = {};
  const date = (k) => (f[k] = inp({ type: 'date', value: p[k] || '' }));
  const text = (k, max = 200, extra = {}) => (f[k] = inp({ maxlength: max, value: p[k] || '', ...extra }));
  const area = (k) => { f[k] = el('textarea', { class: 'input', rows: 3, maxlength: 2000 }); f[k].value = p[k] || ''; return f[k]; };
  const choose = (k, opts) => (f[k] = sel(opts, p[k] || ''));
  const ro = (v) => { const x = inp({ type: 'date', value: v || '', readonly: true }); x.tabIndex = -1; return x; };
  const info = el('p', { class: 'caption', style: 'margin:0' }, isNew ? 'Project ID dijana sendiri (EL-YYYY-NNN).' : `${p.id} · ${p.company}`);
  let body;
  if (tab === 'Commercial') {
    body = el('div', { class: 'vt-fgrid' },
      field('Syarikat / klien', text('company'), { cls: 'full' }), field('Tarikh request', date('date_request')), field('Quotation no', text('quotation_no', 60)),
      field('Quotation amount (RM)', text('quotation_amount', 20, { inputmode: 'decimal' })), field('Status quotation', choose('status_quotation', OPT.status_quotation)),
      field('Tarikh proceed (jika Approved)', date('date_proceed'), { hint: 'Diisi sendiri dengan tarikh hari ini bila Approved.' }), field('Presentation date', date('presentation_date')),
      field('Keterangan kerja / job description', area('job_description'), { cls: 'full' }), field('Remark', area('remark'), { cls: 'full' }));
    if (isNew) { f.date_request.value = data.hari_ini; f.status_quotation.value = 'Pending'; }
    f.status_quotation.addEventListener('change', () => { f.date_proceed.value = f.status_quotation.value === 'Approved' ? (f.date_proceed.value || data.hari_ini) : ''; });
  } else if (tab === 'Operation') {
    body = el('div', { class: 'vt-form' },
      el('h4', { class: 'vt-sub' }, 'Dokumen pra-kerja'),
      el('div', { class: 'vt-fgrid' }, field('MOS', choose('mos_ready', OPT.ready)), field('JSA', choose('jsa_ready', OPT.ready)), field('PTW', choose('ptw_ready', OPT.ready), { hint: 'Wajib Sedia sebelum mula kerja.' })),
      el('h4', { class: 'vt-sub' }, 'Pelaksanaan kerja'),
      el('div', { class: 'vt-fgrid' }, field('Tarikh mula kerja', date('date_start_job')), field('Tarikh siap kerja', date('date_completed_job')),
        field('GWR submitted?', choose('gwr_submitted', OPT.yesno)), field('GWR date', date('gwr_date')),
        field('ID GWR (pilihan)', text('gwr_report_ids', 300, { placeholder: 'cth: GWR-PSS-2026-00012' }), { cls: 'full', hint: 'ID report dalam modul GWR, pisah dengan koma.' }),
        field('Full report submitted?', choose('full_report_submitted', OPT.yesno)), field('Full report date', date('full_report_date')), field('Report PIC', text('report_pic', 100))));
    f.gwr_submitted.addEventListener('change', () => { f.gwr_date.value = f.gwr_submitted.value === 'Yes' ? (f.gwr_date.value || data.hari_ini) : ''; });
    f.full_report_submitted.addEventListener('change', () => { f.full_report_date.value = f.full_report_submitted.value === 'Yes' ? (f.full_report_date.value || data.hari_ini) : ''; });
  } else if (tab === 'Claim') {
    const fu = [ro(p.followup_1), ro(p.followup_2), ro(p.followup_3), ro(p.payment_due_date)];
    body = el('div', { class: 'vt-form' },
      el('div', { class: 'vt-fgrid' }, field('Invoice no', text('invoice_no', 60)), field('Invoice date', date('invoice_date'), { hint: 'Follow up & due date dikira dari tarikh ini.' }),
        field('PO no (purchase order)', text('po_no', 60)), field('Payment status', choose('payment_status', OPT.payment_status), { hint: 'Lepas due date & belum Paid: jadi Outstanding sendiri.' })),
      el('h4', { class: 'vt-sub' }, 'Jadual penjejakan automatik'),
      el('div', { class: 'vt-fgrid' }, field('Follow up 1 (+7 hari)', fu[0]), field('Follow up 2 (+14 hari)', fu[1]), field('Follow up 3 (+21 hari)', fu[2]), field(`Payment due (+${data.tempoh_bayaran_hari} hari)`, fu[3])));
    if (!p.payment_status) f.payment_status.value = 'Pending';
    f.invoice_date.addEventListener('change', () => { const v = f.invoice_date.value; [7, 14, 21, data.tempoh_bayaran_hari].forEach((n, i) => { fu[i].value = addDays(v, n); }); });
  } else {
    body = el('div', { class: 'vt-form' },
      el('div', { class: 'alert alert-danger', style: 'margin:0' }, `Overdue: ${p.overdue_days || 0} hari · due ${d(p.payment_due_date)}`),
      el('div', { class: 'vt-fgrid' }, field('LOD reminder (due + 7) [auto]', ro(p.lod_reminder_sent)), field('Tarikh sebenar reminder dihantar', date('lod_reminder_date')),
        field('LOD issue (due + 14) [auto]', ro(p.lod_issue)), field('Tarikh sebenar LOD dikeluarkan', date('lod_issue_date')),
        field('CTOS action', choose('ctos_action', OPT.action)), field('Legal action', choose('legal_action', OPT.action)), field('Case status', choose('case_status', OPT.case_status)),
        field('Remarks / nota kes', area('case_remark'), { cls: 'full' })));
  }
  const err = errBox();
  openModal({
    title: isNew ? 'Daftar projek baru' : `Kemaskini ${PHASE[tab].label}: ${p.id}`, wide: true,
    body: el('div', { class: 'stack' }, info, err, body),
    actions: [{ label: 'Batal', class: 'btn-secondary' }, { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
      const payload = {};
      Object.keys(f).forEach((k) => { payload[k] = f[k].value; });
      if (tab === 'Commercial' && !payload.company.trim()) { showErr(err, new Error('Isi nama syarikat / klien')); return; }
      try {
        const res = await call('saveProject', { id: p.id, fasa: tab, data: payload });
        close();
        data = null;
        toast(`${res.id} disimpan.`, 'success');
        res.peristiwa.forEach((m) => toast(m, /TERTUNGGAK/.test(m) ? 'danger' : 'info', 6000));
        if (isNew) location.hash = '#/p/' + encodeURIComponent(res.id); else route();
      } catch (e) { if (e.status !== 401) showErr(err, e); }
    }) }],
  });
}

// ------------------------------------------------------------------ mula
async function start() {
  const c = await bootModule(MODULE, 'Voltrack');
  ctx = c;
  view = el('div', { id: 'view', class: 'stack' });
  append(clear(main), view);
  renderModuleNav(main, [
    { href: '#/', label: 'Dashboard', ikon: 'chart-column', match: (h) => h === '#/' || h === '' },
    ...Object.keys(PHASE).map((t) => ({ href: '#/fasa/' + t, label: PHASE[t].label, ikon: PHASE[t].ikon, match: (h) => h.startsWith('#/fasa/' + t) })),
  ]);
  main.removeAttribute('aria-busy');
  window.addEventListener('hashchange', route);
  await route();
}

start();
