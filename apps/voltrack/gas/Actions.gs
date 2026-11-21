/**
 * Actions.gs - web app Voltrack (F-80 hingga F-85; BSD 3.9, 4.2; IPD 2H).
 *
 * Role (PRD nota R; BSD 4.1), ikut ROLE_WRITE_ACCESS lama:
 *   commercial  cipta projek + tulis tab Commercial
 *   operation   tulis tab Operation (manager PSS & OMP)
 *   claim       tulis tab Claim (HR)
 *   lod         tulis tab LOD (HR & Account)
 *   admin       tulis semua tab + padam projek (lembut, dengan sebab)
 * Semua role (dan viewer portal) BACA semua tab, sama seperti sistem lama (perlu untuk dashboard eksekutif).
 * Seorang staf boleh pegang beberapa role: akses tulis = gabungan (sistem lama getWritableTabs).
 * Beza dari sistem lama: semakan di server menolak (403) fasa yang tiada akses, bukan diam-diam abaikan;
 * medan dikira (status_job, follow-up, due date, overdue, sasaran LOD) dikira di server, bukan dipercayai dari pelayar.
 */

var ALL_ROLES = ['admin', 'commercial', 'operation', 'claim', 'lod', 'viewer'];
var ACTION_ROLES = {
  listProjects:  ALL_ROLES,
  getProject:    ALL_ROLES,
  saveProject:   ['admin', 'commercial', 'operation', 'claim', 'lod'],
  deleteProject: ['admin']
};
var ROLE_WRITE_ACCESS = {
  admin: ['Commercial', 'Operation', 'Claim', 'LOD'],
  commercial: ['Commercial'],
  operation: ['Operation'],
  claim: ['Claim'],
  lod: ['LOD']
};
var LIMITS = { teks: 200, panjang: 2000, amaun: 100000000 };
var ID_RE = /^EL-\d{4}-\d{3,5}$/;

function doPost(e) {
  return handleRequest_(e, prop_('MODULE_SECRET'), routeVt_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeVt_(req) {
  var user = req.user || {};
  authorize_(ACTION_ROLES, req.action, user);
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var p = req.payload || {};
  switch (req.action) {
    case 'listProjects':  return listProjects_(ss, user);
    case 'getProject':    return getProject_(ss, user, p);
    case 'saveProject':   return saveProject_(ss, user, p);
    case 'deleteProject': return deleteProject_(ss, user, p);
  }
  throw httpError_(400, 'Action tidak dikenali');
}

// ---------------------------------------------------------------- bantuan

function hasRoleV_(user, r) { return (user.roles || []).indexOf(r) >= 0; }
function textVal_(v) { return String(unsanitize_(v === null || v === undefined ? '' : v)); }

/** Gabungan tab yang boleh ditulis (sistem lama getWritableTabs). superadmin = admin. */
function writableTabs_(user) {
  if (hasRoleV_(user, 'superadmin')) return PHASES.slice();
  var out = [];
  (user.roles || []).forEach(function (r) { (ROLE_WRITE_ACCESS[r] || []).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); }); });
  return PHASES.filter(function (t) { return out.indexOf(t) >= 0; });
}
function isAdmin_(user) { return hasRoleV_(user, 'admin') || hasRoleV_(user, 'superadmin'); }

function validDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** YYYY-MM-DD + n hari (sistem lama addDays). */
function addDays_(s, n) {
  if (!validDate_(s)) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)).toISOString().slice(0, 10);
}
/** Beza hari (sistem lama calculateDaysBetween). */
function daysBetween_(a, b) {
  if (!validDate_(a) || !validDate_(b)) return 0;
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function settingsMap_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Settings');
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) { if (r.key !== '') out[String(r.key)] = String(unsanitize_(r.value)); });
  return out;
}
function payDays_(s) { var n = Number(s.tempoh_bayaran_hari); return n > 0 && n < 366 ? n : 30; }

/** Baca 4 tab -> { tables: {tab: {header, rows}}, byId: {tab: {id: row}} }. */
function readAll_(ss) {
  var out = { tables: {}, byId: {} };
  PHASES.forEach(function (tab) {
    var t = readTable_(sheet_(ss, tab));
    out.tables[tab] = t;
    out.byId[tab] = {};
    t.rows.forEach(function (r) { if (String(r.id)) out.byId[tab][String(r.id)] = r; });
  });
  return out;
}

function cell_(k, v) {
  if (DATE_FIELDS.indexOf(k) >= 0) return dateStr_(v);
  if (k === 'quotation_amount') return v === '' || v === null || v === undefined ? '' : Number(v) || 0;
  if (k === 'overdue_days') return Number(v) || 0;
  return textVal_(v);
}

/** Gabung 4 tab menjadi satu objek projek (sistem lama getAllProjectsJoined). */
function joined_(all, id) {
  var c = all.byId.Commercial[id];
  if (!c || isDeleted_(c)) return null;
  var o = { id: id, dibuat: isoStr_(c.created_at) };
  PHASES.forEach(function (tab) {
    var r = all.byId[tab][id] || {};
    PHASE_FIELDS[tab].forEach(function (k) { o[k] = cell_(k, r[k]); });
    // Nama sahaja, bukan emel (notis privasi pekerja: emel tidak dipapar kepada staf lain)
    o['_' + tab.toLowerCase() + '_oleh'] = textVal_(r.updated_by_name || '');
    o['_' + tab.toLowerCase() + '_pada'] = isoStr_(r.updated_at || '');
  });
  return o;
}

/**
 * Medan dikira (sistem lama autoUpdateLogic + attachFormListeners), ikut tarikh `today`. Pulang perubahan ikut tab.
 *  status_job: Approved -> Pending Start / In Progress / GWR Submitted / Completed Full Report
 *  Claim: follow-up +7/+14/+21, due +30 dari invoice_date; lewat due & belum Paid -> Outstanding + overdue_days
 *  LOD: sasaran reminder = due + 7, LOD rasmi = due + 14
 * Beza: sistem lama mengisi sendiri "tarikh SEBENAR" reminder / LOD bila tarikh sasaran lepas; kini tidak (tarikh
 * sebenar hanya diisi bila surat betul-betul dihantar).
 */
function derive_(p, today, payDays) {
  var ch = { Operation: {}, Claim: {}, LOD: {} };
  var job = '';
  if (p.status_quotation === 'Approved') {
    job = !p.date_start_job ? 'Pending Start' : 'In Progress';
    if (p.gwr_submitted === 'Yes' && p.full_report_submitted !== 'Yes') job = 'GWR Submitted';
    if (p.full_report_submitted === 'Yes') job = 'Completed Full Report';
  } else if (p.status_quotation === 'Cancel') job = 'Cancelled';
  ch.Operation.status_job = job;
  var inv = validDate_(p.invoice_date) ? p.invoice_date : '';
  ch.Claim.followup_1 = inv ? addDays_(inv, 7) : '';
  ch.Claim.followup_2 = inv ? addDays_(inv, 14) : '';
  ch.Claim.followup_3 = inv ? addDays_(inv, 21) : '';
  ch.Claim.payment_due_date = inv ? addDays_(inv, payDays) : '';
  var due = ch.Claim.payment_due_date;
  var st = p.payment_status || (inv ? 'Pending' : '');
  var overdue = 0;
  if (due && st !== 'Paid') {
    var d = daysBetween_(due, today);
    if (d > 0) { st = 'Outstanding'; overdue = d; }     // Outstanding manual (sistem lama dibenarkan) kekal
  }
  ch.Claim.payment_status = st;
  ch.Claim.overdue_days = overdue;
  ch.LOD.lod_reminder_sent = due ? addDays_(due, 7) : '';
  ch.LOD.lod_issue = due ? addDays_(due, 14) : '';
  return ch;
}

function auditRow_(by, nama) {
  var now = nowIso_();
  return { created_at: now, created_by: by, updated_at: now, updated_by: by, updated_by_name: nama || '', deleted: 'FALSE', deleted_reason: '' };
}

function summaryFor_(user) {
  return { boleh_tulis: writableTabs_(user), boleh_admin: isAdmin_(user), boleh_cipta: writableTabs_(user).indexOf('Commercial') >= 0 };
}

// ---------------------------------------------------------------- S-80 / S-82

function listProjects_(ss, user) {
  var all = readAll_(ss);
  var today = todayIso_();
  var payDays = payDays_(settingsMap_(ss));
  var out = [];
  Object.keys(all.byId.Commercial).forEach(function (id) {
    var p = joined_(all, id);
    if (!p) return;
    var ch = derive_(p, today, payDays);   // papar nilai semasa walaupun trigger harian belum jalan
    Object.keys(ch).forEach(function (tab) { Object.assign(p, ch[tab]); });
    out.push(p);
  });
  out.sort(function (a, b) { return b.id.localeCompare(a.id, 'en', { numeric: true }); });
  return Object.assign({ projek: out, hari_ini: today, tempoh_bayaran_hari: payDays }, summaryFor_(user));
}

function getProject_(ss, user, p) {
  var all = readAll_(ss);
  var pr = joined_(all, String(p.id || ''));
  if (!pr) throw httpError_(404, 'Projek tidak dijumpai');
  var ch = derive_(pr, todayIso_(), payDays_(settingsMap_(ss)));
  Object.keys(ch).forEach(function (tab) { Object.assign(pr, ch[tab]); });
  return Object.assign({ projek: pr }, summaryFor_(user));
}

// ---------------------------------------------------------------- simpan satu fasa (F-80 hingga F-83)

/** Bersihkan medan fasa yang boleh ditaip (tolak medan dikira). */
function cleanPhase_(tab, data) {
  var o = {};
  PHASE_FIELDS[tab].forEach(function (k) {
    if (DERIVED.indexOf(k) >= 0) return;
    var v = data[k];
    v = v === null || v === undefined ? '' : String(v).trim();
    if (OPTIONS[k]) {
      if (v && OPTIONS[k].indexOf(v) < 0) throw httpError_(400, k + ': pilihan tak sah');
    } else if (DATE_FIELDS.indexOf(k) >= 0) {
      if (v && !validDate_(v)) throw httpError_(400, k + ': tarikh tak sah');
    } else if (k === 'quotation_amount') {
      if (v !== '') {
        var n = Number(v.replace(/,/g, ''));
        if (isNaN(n) || n < 0 || n > LIMITS.amaun) throw httpError_(400, 'Quotation amount mesti nombor sah');
        v = Math.round(n * 100) / 100;
      }
    } else if (k === 'gwr_report_ids') {
      var ids = v.split(/[\s,;]+/).filter(Boolean).map(function (x) { return x.toUpperCase(); });
      ids.forEach(function (x) { if (!/^GWR-(OMP|PSS)-\d{4}-\d{3,6}$/.test(x)) throw httpError_(400, 'ID GWR tak sah: ' + x + ' (contoh GWR-PSS-2026-00012)'); });
      v = ids.join(', ');
    } else {
      var max = k === 'job_description' || k === 'remark' || k === 'case_remark' ? LIMITS.panjang : LIMITS.teks;
      if (v.length > max) throw httpError_(400, k + ' maksimum ' + max + ' aksara');
    }
    o[k] = v;
  });
  return o;
}

/** ID baru EL-YYYY-NNN = nombor terbesar tahun ini + 1 (termasuk projek dipadam & import). Sistem lama: bilangan projek + 1 (boleh bertindih). */
function nextProjectId_(rows) {
  var year = todayIso_().slice(0, 4);
  var re = new RegExp('^EL-' + year + '-(\\d+)$');
  var max = 0;
  rows.forEach(function (r) { var m = re.exec(String(r.id)); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  var n = String(max + 1);
  while (n.length < 3) n = '0' + n;
  return 'EL-' + year + '-' + n;
}

/**
 * payload: { id? (kosong = projek baru, fasa mesti Commercial), fasa: 'Commercial'|'Operation'|'Claim'|'LOD', data: {...} }
 * Hanya tab fasa itu ditulis (+ medan dikira tab lain). Tiada akses tulis fasa = 403.
 */
function saveProject_(ss, user, p) {
  var tab = String(p.fasa || '');
  if (PHASES.indexOf(tab) < 0) throw httpError_(400, 'Fasa tak sah');
  if (writableTabs_(user).indexOf(tab) < 0) throw httpError_(403, 'Role anda tidak boleh mengubah fasa ' + tab);
  var data = cleanPhase_(tab, p.data || {});
  var isNew = !p.id;
  if (isNew && tab !== 'Commercial') throw httpError_(400, 'Projek baru didaftar di fasa Commercial');
  if (tab === 'Commercial') {
    if (!data.company) throw httpError_(400, 'Syarikat / klien wajib diisi');
    if (!data.status_quotation) data.status_quotation = 'Pending';
    if (data.status_quotation === 'Approved' && !data.date_proceed) data.date_proceed = todayIso_();   // sistem lama: auto tarikh proceed
  }
  if (tab === 'Operation') {
    if (data.gwr_submitted === 'Yes' && !data.gwr_date) data.gwr_date = todayIso_();
    if (data.full_report_submitted === 'Yes' && !data.full_report_date) data.full_report_date = todayIso_();
    if (data.date_start_job && data.date_completed_job && data.date_completed_job < data.date_start_job) throw httpError_(400, 'Tarikh siap kerja mesti selepas tarikh mula');
  }
  if (tab === 'Claim' && data.payment_status === 'Paid' && !data.paid_date) data.paid_date = todayIso_();
  if (tab === 'Claim' && data.payment_status !== 'Paid') data.paid_date = '';

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var id, before = {}, after;
  try {
    var all = readAll_(ss);
    var now = nowIso_();
    if (isNew) {
      id = nextProjectId_(all.tables.Commercial.rows);
      PHASES.forEach(function (t) {
        var row = Object.assign({ id: id }, auditRow_(user.email, t === tab ? String(user.nama || '') : ''), t === tab ? data : {});
        appendObj_(sheet_(ss, t), all.tables[t].header, row);
      });
      all = readAll_(ss);
    } else {
      id = String(p.id);
      if (!ID_RE.test(id)) throw httpError_(400, 'ID projek tak sah');
      before = joined_(all, id);
      if (!before) throw httpError_(404, 'Projek tidak dijumpai');
      var r = all.byId[tab][id];
      if (r) updateRowObj_(sheet_(ss, tab), all.tables[tab].header, r._row, Object.assign({}, data, { updated_at: now, updated_by: user.email, updated_by_name: String(user.nama || '') }));
      else appendObj_(sheet_(ss, tab), all.tables[tab].header, Object.assign({ id: id }, auditRow_(user.email, String(user.nama || '')), data));
      all = readAll_(ss);
    }
    after = joined_(all, id);
    persistDerived_(ss, all, after, settingsMap_(ss));
    after = joined_(readAll_(ss), id);
  } finally {
    lock.releaseLock();
  }
  var changes = Object.keys(data).filter(function (k) { return String(before[k] === undefined ? '' : before[k]) !== String(after[k]); });
  audit_(user.email, isNew ? 'CREATE_PROJECT' : 'UPDATE_' + tab.toUpperCase(), id, isNew ? after.company : changes.slice(0, 12).join(', '));
  return { id: id, projek: after, peristiwa: events_(before, after, isNew) };
}

/** Tulis medan dikira yang berubah ke tab masing-masing. */
function persistDerived_(ss, all, pr, s) {
  var ch = derive_(pr, todayIso_(), payDays_(s));
  var n = 0;
  Object.keys(ch).forEach(function (tab) {
    var row = all.byId[tab][pr.id];
    if (!row) return;
    var diff = {};
    Object.keys(ch[tab]).forEach(function (k) { if (String(cell_(k, row[k])) !== String(ch[tab][k])) diff[k] = ch[tab][k]; });
    if (Object.keys(diff).length) { updateRowObj_(sheet_(ss, tab), all.tables[tab].header, row._row, diff); n++; }
  });
  return n;
}

/** Mesej perubahan status (sistem lama checkAndNotify -> push OneSignal; kini dipapar kepada pengguna sahaja). */
function events_(a, b, isNew) {
  var ev = [];
  if (isNew) ev.push('Projek baru didaftarkan. Sila semak status quotation.');
  if (a.status_quotation !== 'Approved' && b.status_quotation === 'Approved') ev.push('Quotation diluluskan. Operation boleh tetapkan tarikh kerja.');
  if (a.gwr_submitted !== 'Yes' && b.gwr_submitted === 'Yes') ev.push('GWR dihantar. Full Report boleh disediakan.');
  if (a.full_report_submitted !== 'Yes' && b.full_report_submitted === 'Yes') ev.push('Full Report selesai. Claim boleh jana invoice.');
  if (a.payment_status !== 'Outstanding' && b.payment_status === 'Outstanding') ev.push('Pembayaran kini TERTUNGGAK. Kes masuk LOD Tracker.');
  if (a.payment_status !== 'Paid' && b.payment_status === 'Paid') ev.push('Pembayaran diterima. Projek selesai.');
  return ev;
}

// ---------------------------------------------------------------- padam (admin, lembut)

function deleteProject_(ss, user, p) {
  var sebab = String(p.sebab || '').trim();
  if (sebab.length < 5) throw httpError_(400, 'Nyatakan sebab padam (minimum 5 aksara)');
  if (sebab.length > 300) throw httpError_(400, 'Sebab maksimum 300 aksara');
  var id = String(p.id || '');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var all = readAll_(ss);
    var pr = joined_(all, id);
    if (!pr) throw httpError_(404, 'Projek tidak dijumpai');
    var now = nowIso_();
    PHASES.forEach(function (tab) {
      var r = all.byId[tab][id];
      if (r) updateRowObj_(sheet_(ss, tab), all.tables[tab].header, r._row, { deleted: 'TRUE', deleted_reason: sebab, updated_at: now, updated_by: user.email });
    });
    audit_(user.email, 'DELETE_PROJECT', id, pr.company + ' | sebab: ' + sebab);
    return { id: id };
  } finally {
    lock.releaseLock();
  }
}
