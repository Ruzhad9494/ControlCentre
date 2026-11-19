// Admin portal: S-04 Senarai staf, S-05 Akses staf, S-06 Audit log (F-03, F-05, F-06; IPD 1.10, 1.11).
// UI sorok butang untuk kemas sahaja. Semua semakan role di Apps Script access (role dikira dari Sheet).
import { api, getMe, ApiError } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatDate, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderHeader, registerSW } from '/shared/ui/components.js';

const DEPARTMENTS = ['HR', 'COMMERCIAL', 'PSS', 'OMP', 'ADMIN', 'ACCOUNT', 'STRATEGIC', 'MGMT', 'IT'];
const STATUS_KIND = { aktif: 'success', tamat: 'danger', gantung: 'warning' };
const HASIL_KIND = { ok: 'success', tiada_staf: 'warning', tamat: 'danger', sub_tak_padan: 'danger', email_tak_sah: 'warning', rate_limit: 'danger' };

let me;
let isSuper = false;
const main = document.getElementById('main');

// ------------------------------------------------------------------ helper borang
function field(label, input, { required = false, hint = '', id } = {}) {
  const fid = id || 'f' + Math.random().toString(36).slice(2);
  input.id = fid;
  if (required) input.required = true;
  return el('div', { class: 'field' },
    el('label', { for: fid }, label, required ? el('span', { class: 'req' }, ' *') : null),
    input,
    hint ? el('span', { class: 'hint' }, hint) : null);
}
const input = (attrs = {}) => el('input', { class: 'input', type: 'text', autocomplete: 'off', ...attrs });
function select(options, value) {
  const s = el('select', { class: 'input' }, options.map(([v, t]) => el('option', { value: v }, t)));
  s.value = value ?? '';
  return s;
}
const textarea = (attrs = {}) => el('textarea', { class: 'input', rows: 2, ...attrs });
function errorBox() {
  return el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
}
function showError(box, e) {
  clear(box).append(e instanceof ApiError || e instanceof Error ? e.message : String(e));
  box.hidden = false;
}
function sebabField() {
  const t = textarea({ placeholder: 'Contoh: Onboard staf baru, berhenti kerja 31/12/2026, tukar jawatan' });
  return { node: field('Sebab perubahan', t, { required: true, hint: 'Wajib. Direkod dalam log perubahan akses.' }), get: () => t.value.trim() };
}

// ------------------------------------------------------------------ tab
const TABS = [
  { id: 'staf', label: 'Staf', ic: 'users', show: () => me.admin.staff, render: renderStaff },
  { id: 'akses', label: 'Akses modul', ic: 'key-round', show: () => me.admin.access, render: renderAccess },
  { id: 'log', label: 'Audit log', ic: 'scroll-text', show: () => me.admin.audit, render: renderLog },
];
let panel, tabBar;

function currentTab() {
  const want = location.hash.slice(1);
  const visible = TABS.filter((t) => t.show());
  return visible.find((t) => t.id === want) || visible[0];
}

function renderTabs() {
  const cur = currentTab();
  append(clear(tabBar), TABS.filter((t) => t.show()).map((t) =>
    el('a', { href: '#' + t.id, role: 'tab', 'aria-selected': String(t.id === cur.id) }, icon(t.ic), t.label)));
  clear(panel);
  cur.render(panel);
}

// ------------------------------------------------------------------ S-04 Staf
let staffCache = [];

async function renderStaff(root) {
  const search = input({ type: 'search', placeholder: 'Cari nama, emel, no. pekerja', 'aria-label': 'Cari staf' });
  const statusSel = select([['', 'Semua status'], ['aktif', 'Aktif'], ['tamat', 'Tamat'], ['gantung', 'Gantung']], 'aktif');
  statusSel.setAttribute('aria-label', 'Tapis status');
  const tableHost = el('div', null, el('div', { class: 'skeleton', style: 'height:200px' }));
  append(root,
    el('div', { class: 'row-between' },
      el('div', { class: 'row grow' }, el('div', { class: 'grow', style: 'min-width:200px' }, search), el('div', { style: 'min-width:150px' }, statusSel)),
      isSuper ? el('button', { class: 'btn', type: 'button', onclick: () => addStaffModal(() => load()) }, icon('plus'), 'Tambah staf') : null),
    isSuper ? null : el('p', { class: 'caption' }, 'Sebagai HR, anda boleh ubah status, tarikh tamat dan pengesahan 2-Step Verification sahaja.'),
    tableHost);

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const st = statusSel.value;
    const rows = staffCache.filter((s) => (!st || s.status === st) &&
      (!q || [s.nama, s.email, s.staff_id, s.designation, s.department].join(' ').toLowerCase().includes(q)));
    clear(tableHost);
    if (!rows.length) { tableHost.append(emptyState('users', 'Tiada staf sepadan.')); return; }
    tableHost.append(el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
      el('thead', null, el('tr', null, ['Staf', 'Emel', 'Department', 'Jawatan', 'Status', 'Akaun Google', '2SV', 'Login terakhir', ''].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', null, rows.map((s) => el('tr', null,
        el('td', { 'data-label': 'Staf' }, el('div', null, el('strong', null, s.nama), el('br'), el('span', { class: 'caption' }, s.staff_id))),
        el('td', { 'data-label': 'Emel' }, el('span', { style: 'word-break:break-all' }, s.email)),
        el('td', { 'data-label': 'Department' }, s.department),
        el('td', { 'data-label': 'Jawatan' }, s.designation),
        el('td', { 'data-label': 'Status' }, badge(s.status, STATUS_KIND[s.status])),
        el('td', { 'data-label': 'Akaun Google' }, s.akaun_terikat ? badge('Terikat', 'info') : badge('Belum login')),
        el('td', { 'data-label': '2SV' }, s.mfa_disahkan ? badge('Disahkan', 'success') : badge('Belum')),
        el('td', { 'data-label': 'Login terakhir' }, s.last_login_at ? formatDateTime(s.last_login_at) : '-'),
        el('td', { class: 'actions' }, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => editStaffModal(s, () => load()) }, icon('pencil'), 'Ubah'))))))));
  };
  const load = async () => {
    try {
      staffCache = await api('access', 'listStaff');
      draw();
    } catch (e) {
      clear(tableHost).append(el('div', { class: 'alert alert-danger' }, e.message));
    }
  };
  search.addEventListener('input', draw);
  statusSel.addEventListener('change', draw);
  await load();
}

function addStaffModal(done) {
  const f = {
    staff_id: input({ maxlength: 20, placeholder: 'VE0123' }),
    nama: input({ maxlength: 100 }),
    email: input({ type: 'email', maxlength: 120, placeholder: 'nama@voltake.com atau nama@gmail.com' }),
    jenis_emel: select([['', 'Auto (ikut emel)'], ['syarikat', 'Syarikat (@voltake.com)'], ['gmail', 'Gmail peribadi']], ''),
    department: select([['', 'Pilih department'], ...DEPARTMENTS.map((d) => [d, d])], ''),
    designation: input({ maxlength: 100, placeholder: 'Contoh: Technician, Engineer, Manager of ...' }),
    tarikh_mula: input({ type: 'date' }),
    mfa: el('input', { type: 'checkbox' }),
  };
  const err = errorBox();
  const body = el('div', { class: 'stack' }, err,
    el('div', { class: 'form-grid two' },
      field('No. pekerja', f.staff_id, { required: true }),
      field('Nama penuh', f.nama, { required: true }),
      field('Emel akaun Google', f.email, { required: true, hint: 'Emel yang staf guna untuk log masuk Google.' }),
      field('Jenis emel', f.jenis_emel),
      field('Department', f.department, { required: true }),
      field('Jawatan (designation)', f.designation, { required: true }),
      field('Tarikh mula', f.tarikh_mula)),
    el('label', { class: 'check' }, f.mfa, 'HR dah semak 2-Step Verification hidup pada akaun ini'),
    el('p', { class: 'caption' }, 'Staf belum dapat apa-apa modul selepas didaftar. Tetapkan akses di tab "Akses modul".'));
  openModal({
    title: 'Tambah staf', body, wide: true,
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        try {
          const s = await api('access', 'addStaff', {
            staff_id: f.staff_id.value, nama: f.nama.value, email: f.email.value, jenis_emel: f.jenis_emel.value || undefined,
            department: f.department.value, designation: f.designation.value, tarikh_mula: f.tarikh_mula.value, mfa_disahkan: f.mfa.checked,
          });
          close();
          toast(`${s.nama} didaftar. Tetapkan akses modul sekarang.`, 'success');
          done();
        } catch (e) { showError(err, e); }
      }) },
    ],
  });
}

function editStaffModal(s, done) {
  const ro = !isSuper;
  const f = {
    nama: input({ value: s.nama, maxlength: 100, disabled: ro }),
    email: input({ type: 'email', value: s.email, maxlength: 120, disabled: ro }),
    jenis_emel: select([['syarikat', 'Syarikat (@voltake.com)'], ['gmail', 'Gmail peribadi']], s.jenis_emel),
    department: select(DEPARTMENTS.map((d) => [d, d]), s.department),
    designation: input({ value: s.designation, maxlength: 100, disabled: ro }),
    tarikh_mula: input({ type: 'date', value: s.tarikh_mula, disabled: ro }),
    status: select([['aktif', 'Aktif'], ['tamat', 'Tamat (berhenti)'], ['gantung', 'Gantung']], s.status),
    tarikh_tamat: input({ type: 'date', value: s.tarikh_tamat }),
    mfa: el('input', { type: 'checkbox', checked: s.mfa_disahkan }),
  };
  f.jenis_emel.disabled = ro;
  f.department.disabled = ro;
  f.status.addEventListener('change', () => {
    if (f.status.value === 'tamat' && !f.tarikh_tamat.value) f.tarikh_tamat.value = todayIso();
  });
  const sebab = sebabField();
  const err = errorBox();

  const extra = el('div', { class: 'row' },
    el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => bump('revokeSessions', 'Paksa log keluar',
      `Semua sesi ${s.nama} akan tamat (dalam masa 10 minit). Teruskan?`) }, icon('log-out'), 'Paksa log keluar'),
    isSuper && s.akaun_terikat ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => bump('resetGoogleLink', 'Reset akaun Google',
      `Ikatan akaun Google ${s.nama} akan dikosongkan. Akaun Google seterusnya yang log masuk dengan emel ini akan diikat. Pastikan identiti staf dah disahkan HR (Q-13).`) }, icon('refresh-cw'), 'Reset akaun Google') : null);

  let modal;
  async function bump(action, title, msg) {
    const why = sebab.get();
    if (why.length < 3) { showError(err, 'Isi sebab dahulu (minimum 3 aksara).'); return; }
    if (!(await confirmDialog(title, msg, { danger: true, okLabel: title }))) return;
    try {
      await api('access', action, { staff_id: s.staff_id, sebab: why });
      modal.close();
      toast(title + ': berjaya.', 'success');
      done();
    } catch (e) { showError(err, e); }
  }

  const body = el('div', { class: 'stack' }, err,
    el('p', { class: 'caption' }, `${s.staff_id} · Akaun Google: ${s.akaun_terikat ? 'terikat' : 'belum login'} · token v${s.token_version}`),
    el('div', { class: 'form-grid two' },
      field('Nama penuh', f.nama), field('Emel akaun Google', f.email, { hint: isSuper ? 'Tukar emel akan kosongkan ikatan akaun Google. Sahkan identiti dahulu.' : '' }),
      field('Jenis emel', f.jenis_emel), field('Department', f.department),
      field('Jawatan', f.designation), field('Tarikh mula', f.tarikh_mula),
      field('Status', f.status), field('Tarikh tamat', f.tarikh_tamat, { hint: 'Wajib bila status Tamat.' })),
    el('label', { class: 'check' }, f.mfa, '2-Step Verification disahkan HR'),
    sebab.node, extra);

  modal = openModal({
    title: 'Ubah staf: ' + s.nama, body, wide: true,
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        const now = {
          nama: f.nama.value.trim(), email: f.email.value.trim().toLowerCase(), jenis_emel: f.jenis_emel.value, department: f.department.value,
          designation: f.designation.value.trim(), tarikh_mula: f.tarikh_mula.value, status: f.status.value, tarikh_tamat: f.tarikh_tamat.value, mfa_disahkan: f.mfa.checked,
        };
        const allowed = isSuper ? Object.keys(now) : ['status', 'tarikh_tamat', 'mfa_disahkan'];
        const fields = {};
        for (const k of allowed) if (String(now[k]) !== String(s[k])) fields[k] = now[k];
        if (!Object.keys(fields).length) { close(); return; }
        if (fields.status && fields.status !== 'aktif' &&
          !(await confirmDialog('Tamatkan akses?', `${s.nama} tidak akan boleh log masuk dan semua sesi tamat dalam masa 10 minit.`, { danger: true, okLabel: 'Ya, tamatkan' }))) return;
        try {
          await api('access', 'updateStaff', { staff_id: s.staff_id, fields, sebab: sebab.get() });
          close();
          toast('Maklumat staf disimpan.', 'success');
          done();
        } catch (e) { showError(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ S-05 Akses
async function renderAccess(root) {
  const host = el('div', null, el('div', { class: 'skeleton', style: 'height:200px' }));
  const search = input({ type: 'search', placeholder: 'Cari nama, jawatan, department', 'aria-label': 'Cari staf' });
  append(root,
    el('p', { class: 'muted' }, 'Tandakan modul dan role untuk setiap staf ikut jawatan. Tiada akses automatik. Perubahan berkuat kuasa dalam masa 10 minit.'),
    search, host);
  let data;
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const modName = Object.fromEntries(data.modules.map((m) => [m.module_id, m.nama]));
    const byEmail = {};
    data.access.forEach((a) => { (byEmail[a.email] = byEmail[a.email] || []).push(a); });
    const rows = data.staff.filter((s) => s.status === 'aktif' && (!q || [s.nama, s.designation, s.department, s.staff_id].join(' ').toLowerCase().includes(q)));
    clear(host);
    if (!rows.length) { host.append(emptyState('users', 'Tiada staf aktif sepadan.')); return; }
    host.append(el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
      el('thead', null, el('tr', null, ['Staf', 'Jawatan', 'Akses modul', ''].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', null, rows.map((s) => {
        const acc = (byEmail[s.email] || []).sort((a, b) => (a.module_id === '*' ? -1 : 0) - (b.module_id === '*' ? -1 : 0));
        return el('tr', null,
          el('td', { 'data-label': 'Staf' }, el('div', null, el('strong', null, s.nama), el('br'), el('span', { class: 'caption' }, `${s.staff_id} · ${s.department}`))),
          el('td', { 'data-label': 'Jawatan' }, s.designation),
          el('td', { 'data-label': 'Akses modul' }, acc.length
            ? el('div', { class: 'chips' }, acc.map((a) => badge(`${modName[a.module_id] || a.module_id}: ${a.roles.join(', ')}${a.tamat_pada ? ' (hingga ' + formatDate(a.tamat_pada) + ')' : ''}`, a.module_id === '*' ? 'new' : 'info')))
            : el('span', { class: 'caption' }, 'Tiada akses')),
          el('td', { class: 'actions' }, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => accessModal(s, data, load) }, icon('key-round'), 'Ubah akses')));
      })))));
  };
  const load = async () => {
    try {
      data = await api('access', 'listAccess');
      draw();
    } catch (e) {
      clear(host).append(el('div', { class: 'alert alert-danger' }, e.message));
    }
  };
  search.addEventListener('input', () => data && draw());
  await load();
}

function accessModal(s, data, done) {
  const current = (email) => Object.fromEntries(data.access.filter((a) => a.email === email).map((a) => [a.module_id, a]));
  const mine = current(s.email);
  const controls = {};

  const blocks = data.modules.map((m) => {
    const cur = mine[m.module_id] || { roles: [], skop: '', tamat_pada: '' };
    const boxes = m.roles_sah.map((r) => {
      const cb = el('input', { type: 'checkbox', value: r, checked: cur.roles.includes(r) });
      return { r, cb, node: el('label', { class: 'check' }, cb, r) };
    });
    const skop = input({ value: cur.skop, placeholder: 'dept=OMP', maxlength: 60 });
    const until = input({ type: 'date', value: cur.tamat_pada });
    controls[m.module_id] = { boxes, skop, until };
    return el('fieldset', { class: 'card card-tight', style: 'margin:0' },
      el('legend', { class: 'label', style: 'padding:0 4px' }, m.nama, m.status && m.status !== 'aktif' ? el('span', { class: 'caption' }, ` (${m.status})`) : null),
      el('div', { class: 'row' }, boxes.map((b) => b.node)),
      el('div', { class: 'form-grid two' },
        field('Skop (pilihan)', skop, { hint: 'Kosong = ikut department staf. Contoh dept=PSS' }),
        field('Akses hingga (pilihan)', until, { hint: 'Untuk akses sementara' })));
  });

  const others = data.staff.filter((x) => x.email !== s.email && x.status === 'aktif');
  const copyFrom = select([['', 'Salin akses dari staf lain...'], ...others.map((x) => [x.email, `${x.nama} · ${x.designation}`])], '');
  copyFrom.setAttribute('aria-label', 'Salin akses dari staf lain');
  copyFrom.addEventListener('change', () => {
    if (!copyFrom.value) return;
    const src = current(copyFrom.value);
    for (const [mid, c] of Object.entries(controls)) {
      const a = src[mid] || { roles: [], skop: '', tamat_pada: '' };
      c.boxes.forEach((b) => { b.cb.checked = a.roles.includes(b.r); });
      c.skop.value = a.skop || '';
      c.until.value = a.tamat_pada || '';
    }
    toast('Akses disalin. Semak sebelum simpan.', 'info');
  });

  const sebab = sebabField();
  const err = errorBox();
  const body = el('div', { class: 'stack' }, err,
    el('div', { class: 'alert alert-info' }, el('div', null, el('strong', null, s.nama), ` · ${s.designation} · ${s.department}`)),
    copyFrom, blocks, sebab.node);

  openModal({
    title: 'Akses modul', body, wide: true,
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan akses', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        const changes = [];
        for (const m of data.modules) {
          const c = controls[m.module_id];
          const roles = c.boxes.filter((b) => b.cb.checked).map((b) => b.r);
          const cur = mine[m.module_id] || { roles: [], skop: '', tamat_pada: '' };
          const skop = c.skop.value.trim();
          const until = c.until.value;
          const same = roles.join(',') === cur.roles.join(',') && (!roles.length || (skop === (cur.skop || '') && until === (cur.tamat_pada || '')));
          if (!same) changes.push({ module_id: m.module_id, roles, skop, tamat_pada: until });
        }
        if (!changes.length) { close(); toast('Tiada perubahan.'); return; }
        try {
          const r = await api('access', 'setAccess', { email: s.email, changes, sebab: sebab.get() });
          close();
          toast(`${r.changed} perubahan disimpan. Berkuat kuasa dalam masa 10 minit.`, 'success');
          done();
        } catch (e) { showError(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ S-06 Audit log
async function renderLog(root) {
  const kind = { v: 'login' };
  const sub = el('div', { class: 'tabs', role: 'tablist' });
  const cari = input({ type: 'search', placeholder: 'Cari emel / modul / sebab', 'aria-label': 'Cari' });
  const hasil = select([['', 'Semua hasil'], ...Object.keys(HASIL_KIND).map((h) => [h, h])], '');
  hasil.setAttribute('aria-label', 'Hasil login');
  const dari = input({ type: 'date', 'aria-label': 'Dari tarikh' });
  const hingga = input({ type: 'date', 'aria-label': 'Hingga tarikh' });
  const go = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('search'), 'Tapis');
  const host = el('div');

  const drawSub = () => {
    clear(sub).append(
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(kind.v === 'login'), onclick: () => { kind.v = 'login'; drawSub(); load(); } }, 'Log masuk'),
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(kind.v === 'akses'), onclick: () => { kind.v = 'akses'; drawSub(); load(); } }, 'Perubahan akses'));
    hasil.parentElement && (hasil.parentElement.hidden = kind.v !== 'login');
  };

  const load = () => busy(go, async () => {
    clear(host).append(el('div', { class: 'skeleton', style: 'height:160px' }));
    try {
      const payload = { cari: cari.value, dari: dari.value, hingga: hingga.value, limit: 200 };
      if (kind.v === 'login') {
        const rows = await api('access', 'listLoginLog', { ...payload, hasil: hasil.value });
        clear(host).append(rows.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
          el('thead', null, el('tr', null, ['Masa', 'Emel', 'Hasil', 'Pelayar'].map((h) => el('th', { scope: 'col' }, h)))),
          el('tbody', null, rows.map((r) => el('tr', null,
            el('td', { 'data-label': 'Masa' }, formatDateTime(r.ts)),
            el('td', { 'data-label': 'Emel' }, el('span', { style: 'word-break:break-all' }, r.email || '-')),
            el('td', { 'data-label': 'Hasil' }, badge(r.hasil, HASIL_KIND[r.hasil])),
            el('td', { 'data-label': 'Pelayar' }, el('span', { class: 'caption' }, String(r.user_agent || '').slice(0, 80)))))))) : emptyState('scroll-text', 'Tiada rekod.'));
      } else {
        const rows = await api('access', 'listAccessChangeLog', payload);
        clear(host).append(rows.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
          el('thead', null, el('tr', null, ['Masa', 'Admin', 'Staf', 'Modul', 'Dari', 'Kepada', 'Sebab'].map((h) => el('th', { scope: 'col' }, h)))),
          el('tbody', null, rows.map((r) => el('tr', null,
            el('td', { 'data-label': 'Masa' }, formatDateTime(r.ts)),
            el('td', { 'data-label': 'Admin' }, r.admin_email),
            el('td', { 'data-label': 'Staf' }, r.staff_email),
            el('td', { 'data-label': 'Modul' }, r.module_id === '_staff' ? 'Rekod staf' : r.module_id),
            el('td', { 'data-label': 'Dari' }, r.roles_lama || '-'),
            el('td', { 'data-label': 'Kepada' }, r.roles_baru || '-'),
            el('td', { 'data-label': 'Sebab' }, r.sebab)))))) : emptyState('scroll-text', 'Tiada rekod.'));
      }
    } catch (e) {
      clear(host).append(el('div', { class: 'alert alert-danger' }, e.message));
    }
  });

  go.addEventListener('click', load);
  append(root, sub,
    el('div', { class: 'form-grid two', style: 'margin-top:16px' },
      field('Cari', cari), field('Hasil (log masuk)', hasil), field('Dari', dari), field('Hingga', hingga)),
    el('div', { class: 'row' }, go),
    el('p', { class: 'caption' }, 'Papar 200 rekod terbaru yang sepadan.'),
    host);
  drawSub();
  await load();
}

// ------------------------------------------------------------------ mula
async function start() {
  try {
    me = await getMe();
  } catch (e) {
    if (e.status !== 401) clear(main).append(el('div', { class: 'alert alert-danger' }, e.message));
    return;
  }
  isSuper = me.admin.access;
  if (!me.admin.staff && !me.admin.access && !me.admin.audit) {
    location.replace('/no-access/?r=modul');
    return;
  }
  renderHeader(me, isSuper ? 'Admin' : 'Senarai Staf');
  registerSW();
  tabBar = el('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Bahagian admin' });
  panel = el('section', { class: 'stack', role: 'tabpanel' });
  clear(main).append(el('h2', null, isSuper ? 'Admin' : 'Senarai Staf'), tabBar, panel);
  main.removeAttribute('aria-busy');
  window.addEventListener('hashchange', renderTabs);
  renderTabs();
}

start();
