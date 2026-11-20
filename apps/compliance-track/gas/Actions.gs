/**
 * Actions.gs - web app Compliance Track (F-60 hingga F-64; BSD 3.7, 4.1, 4.2, 4.3; IPD 2D).
 *
 * Role (BSD 4.1; sistem lama: satu PIN admin dikongsi HR & PSS, staf kemas kini sijil dengan Staff ID sahaja):
 *   `hr_admin`    HR: semua rekod (kenderaan, chargeman, sijil & profil staf, IC), Senarai Kerja
 *   `pss`         PSS: sama dengan hr_admin (sistem lama guna PIN yang sama)
 *   `staff_self`  semua staf: lihat & kemas kini sijil SENDIRI, hantar IC sendiri sekali sahaja (dengan persetujuan)
 * Identiti staf = staff_id dari sesi (VP-Access), BUKAN dari input. Ini menutup lubang sistem lama di mana sesiapa
 * boleh ubah sijil orang lain dengan menaip Staff ID orang itu.
 * IC (no. dan gambar) hanya untuk hr_admin/pss; setiap bacaan direkod (VIEW_IC). Staf tak boleh baca semula IC sendiri
 * (sama dengan sistem lama: "selepas dihantar, hubungi admin").
 */

var ADMIN_ROLES = ['hr_admin', 'pss'];
var ALL_ROLES = ['hr_admin', 'pss', 'staff_self'];
var ACTION_ROLES = {
  dashboard:     ADMIN_ROLES,
  getStaff:      ADMIN_ROLES,
  saveVehicle:   ADMIN_ROLES,
  saveChargeman: ADMIN_ROLES,
  saveStaff:     ADMIN_ROLES,
  saveStaffCert: ADMIN_ROLES,
  deleteRecord:  ADMIN_ROLES,
  senaraiData:   ADMIN_ROLES,
  logJob:        ADMIN_ROLES,
  listJobs:      ADMIN_ROLES,
  mySummary:     ALL_ROLES,
  saveMyCert:    ALL_ROLES,
  submitMyIc:    ALL_ROLES,
  getFile:       ALL_ROLES
};

var LIMITS = { teks: 100, keadaan: 60, catatan: 500, sebab: 300, senarai: 60 };
var IC_CONSENT_VERSION = 'v1-2026-11';   // sama dengan sistem lama
var MIN_DATE = '1990-01-01';

function doPost(e) {
  return handleRequest_(e, prop_('MODULE_SECRET'), routeCompliance_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeCompliance_(req) {
  var user = req.user || {};
  authorize_(ACTION_ROLES, req.action, user);
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var p = req.payload || {};
  switch (req.action) {
    case 'dashboard':     return dashboard_(ss, user);
    case 'getStaff':      return getStaff_(ss, user, p);
    case 'saveVehicle':   return saveVehicle_(ss, user, p);
    case 'saveChargeman': return saveChargeman_(ss, user, p);
    case 'saveStaff':     return saveStaff_(ss, user, p);
    case 'saveStaffCert': return saveStaffCert_(ss, user, p);
    case 'deleteRecord':  return deleteRecord_(ss, user, p);
    case 'senaraiData':   return senaraiData_(ss, user, p);
    case 'logJob':        return logJob_(ss, user, p);
    case 'listJobs':      return listJobs_(ss);
    case 'mySummary':     return mySummary_(ss, user);
    case 'saveMyCert':    return saveMyCert_(ss, user, p);
    case 'submitMyIc':    return submitMyIc_(ss, user, p);
    case 'getFile':       return getFile_(ss, user, p);
  }
  throw httpError_(400, 'Action tidak dikenali');
}

// ---------------------------------------------------------------- bantuan

function hasRoleC_(user, r) { return (user.roles || []).indexOf(r) >= 0; }
/** `superadmin` portal dikira admin Compliance (authorize_ kongsi dah benarkan superadmin). */
function isAdmin_(user) { return hasRoleC_(user, 'hr_admin') || hasRoleC_(user, 'pss') || hasRoleC_(user, 'superadmin'); }
function textVal_(v) { return String(unsanitize_(v === null || v === undefined ? '' : v)); }

function validDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function cleanText_(v, label, max, required) {
  var s = String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' ');
  if (required && !s) throw httpError_(400, label + ' wajib diisi');
  if (s.length > max) throw httpError_(400, label + ' maksimum ' + max + ' aksara');
  return s;
}

function cleanDate_(v, label, required) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s && !required) return '';
  if (!validDate_(s)) throw httpError_(400, label + ' mesti tarikh sah (YYYY-MM-DD)');
  if (s < MIN_DATE || s > '2100-12-31') throw httpError_(400, label + ' di luar julat');
  return s;
}

function cleanStaffId_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(s)) throw httpError_(400, 'Staff ID tak sah (huruf, nombor, - atau _; 2-20 aksara)');
  return s;
}

/** No. IC (MyKad 12 digit) atau no. pasport. Sistem lama: nombor dan sengkang 6-20 aksara. */
function cleanIc_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  if (/^\d{12}$/.test(s)) s = s.slice(0, 6) + '-' + s.slice(6, 8) + '-' + s.slice(8);
  if (!/^[A-Z0-9-]{6,20}$/.test(s)) throw httpError_(400, 'Format no. IC / pasport tidak sah');
  return s;
}

function maskIc_(ic) {
  var s = textVal_(ic);
  return s ? s.replace(/[0-9A-Z]/gi, '*').slice(0, Math.max(0, s.length - 4)) + s.slice(-4) : '';
}

function normPlate_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toUpperCase().replace(/\s+/g, ' ');
}

function settingsMap_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Settings');
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) { if (r.key !== '') out[String(r.key)] = String(unsanitize_(r.value)); });
  return out;
}

function ctx_(ss) {
  var s = settingsMap_(ss);
  var w = Number(s.amaran_hari);
  return { today: todayIso_(), warn: isFinite(w) && w >= 7 && w <= 365 ? Math.floor(w) : 60, settings: s };
}

function daysBetween_(fromIso, toIso) {
  var a = Date.UTC(Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7)) - 1, Number(fromIso.slice(8, 10)));
  var b = Date.UTC(Number(toIso.slice(0, 4)), Number(toIso.slice(5, 7)) - 1, Number(toIso.slice(8, 10)));
  return Math.round((b - a) / 864e5);
}

/** Status ikut sistem lama (evaluateExpiryStatus): expired / expiring (<= amaran) / active / unknown. */
function statusOf_(date, c) {
  var d = dateStr_(date);
  if (!validDate_(d)) return { status: 'unknown', hari: null };
  var n = daysBetween_(c.today, d);
  return { status: n < 0 ? 'expired' : n <= c.warn ? 'expiring' : 'active', hari: n };
}

function rows_(ss, tab) {
  return readTable_(sheet_(ss, tab)).rows.filter(function (r) { return !isDeleted_(r); });
}

function staffById_(rows, id) {
  var key = String(id || '').trim().toUpperCase();
  return rows.filter(function (r) { return String(r.staff_id).trim().toUpperCase() === key; })[0] || null;
}

function auditRow_(by) {
  var now = nowIso_();
  return { created_at: now, created_by: by, updated_at: now, updated_by: by, deleted: 'FALSE', deleted_reason: '' };
}

function vehiclePublic_(r, c) {
  var st = statusOf_(r.roadtax_expiry, c);
  return {
    vehicle_id: String(r.vehicle_id), jenis: String(r.jenis), plate_no: textVal_(r.plate_no), lokasi: textVal_(r.lokasi), keadaan: textVal_(r.keadaan),
    expiry: dateStr_(r.roadtax_expiry), status: st.status, hari: st.hari, ada_fail: String(r.doc_file_id || '') !== '', catatan: textVal_(r.catatan)
  };
}

function chargemanPublic_(r, c) {
  var st = statusOf_(r.expiry_date, c);
  return {
    chargeman_id: String(r.chargeman_id), staff_id: String(r.staff_id || ''), nama: textVal_(r.nama), solar_farm: textVal_(r.solar_farm),
    competency_no: textVal_(r.competency_no), expiry: dateStr_(r.expiry_date), status: st.status, hari: st.hari,
    ada_fail: String(r.doc_file_id || '') !== '', catatan: textVal_(r.catatan)
  };
}

/** Sijil staf ikut jenis: { CIDB: {expiry, status, hari, ada_fail, no_sijil}, ... } (semua jenis, kosong = unknown). */
function certMap_(certRows, staffId, c) {
  var out = {};
  CERT_TYPES.forEach(function (t) { out[t.key] = { expiry: '', status: 'unknown', hari: null, ada_fail: false, no_sijil: '' }; });
  certRows.forEach(function (r) {
    if (String(r.staff_id).toUpperCase() !== String(staffId).toUpperCase() || !out[String(r.jenis)]) return;
    var st = statusOf_(r.expiry_date, c);
    out[String(r.jenis)] = { expiry: dateStr_(r.expiry_date), status: st.status, hari: st.hari, ada_fail: String(r.cert_file_id || '') !== '', no_sijil: textVal_(r.no_sijil) };
  });
  return out;
}

function staffPublic_(s, certRows, c) {
  var certs = certMap_(certRows, s.staff_id, c);
  var keys = Object.keys(certs);
  var exp = keys.filter(function (k) { return certs[k].status === 'expired'; }).length;
  var soon = keys.filter(function (k) { return certs[k].status === 'expiring'; }).length;
  var any = keys.some(function (k) { return certs[k].status !== 'unknown'; });
  return {
    staff_id: String(s.staff_id), nama: textVal_(s.nama), designation: textVal_(s.designation),
    ada_emel: String(s.staff_email || '') !== '', ada_ic_no: String(s.ic_no || '') !== '',
    ic_depan: String(s.ic_front_file_id || '') !== '', ic_belakang: String(s.ic_back_file_id || '') !== '',
    sijil: certs,
    status: exp ? 'expired' : soon ? 'expiring' : any ? 'active' : 'unknown',
    ringkasan: exp ? exp + ' sijil tamat' : soon ? soon + ' hampir tamat' : any ? 'Semua sijil sah' : 'Tiada rekod'
  };
}

// ---------------------------------------------------------------- S-60 hingga S-63 (admin)

function dashboard_(ss, user) {
  var c = ctx_(ss);
  var certRows = rows_(ss, 'StaffCerts');
  var staff = rows_(ss, 'Staff').filter(function (s) { return String(s.staff_id); })
    .map(function (s) { return staffPublic_(s, certRows, c); })
    .sort(function (a, b) { return a.staff_id.localeCompare(b.staff_id, undefined, { numeric: true }); });
  return {
    hari_ini: c.today, amaran_hari: c.warn,
    kenderaan: rows_(ss, 'Vehicles').filter(function (r) { return String(r.vehicle_id); }).map(function (r) { return vehiclePublic_(r, c); })
      .sort(function (a, b) { return a.jenis.localeCompare(b.jenis) || a.plate_no.localeCompare(b.plate_no); }),
    chargeman: rows_(ss, 'Chargeman').filter(function (r) { return String(r.chargeman_id); }).map(function (r) { return chargemanPublic_(r, c); })
      .sort(function (a, b) { return a.solar_farm.localeCompare(b.solar_farm) || a.nama.localeCompare(b.nama); }),
    staf: staff,
    jenis_sijil: CERT_TYPES.map(function (t) { return { key: t.key, label: t.label, lalai: t.def }; })
  };
}

/** Butiran staf untuk borang admin (termasuk no. IC penuh). Direkod VIEW_IC. */
function getStaff_(ss, user, p) {
  var c = ctx_(ss);
  var s = staffById_(rows_(ss, 'Staff'), cleanStaffId_(p.staff_id));
  if (!s) throw httpError_(404, 'Staf tidak dijumpai');
  var out = staffPublic_(s, rows_(ss, 'StaffCerts'), c);
  out.ic_no = textVal_(s.ic_no);
  out.ic_consent_at = isoStr_(s.ic_consent_at);
  out.chargeman = rows_(ss, 'Chargeman').filter(function (r) { return String(r.staff_id).toUpperCase() === out.staff_id; }).map(function (r) { return chargemanPublic_(r, c); });
  if (out.ic_no) audit_(user.email, 'VIEW_IC', out.staff_id, 'no. IC (borang staf)');
  return out;
}

/** payload: { vehicle_id?, jenis, plate_no, lokasi, keadaan, roadtax_expiry, catatan?, dokumen?: {data} }. Plat unik. */
function saveVehicle_(ss, user, p) {
  var jenis = String(p.jenis || '');
  if (VEHICLE_TYPES.indexOf(jenis) < 0) throw httpError_(400, 'Jenis mesti Kereta atau Motosikal');
  var plate = normPlate_(p.plate_no);
  if (!/^[A-Z0-9 -]{2,15}$/.test(plate)) throw httpError_(400, 'No. plat tak sah');
  var f = {
    jenis: jenis, plate_no: plate,
    lokasi: cleanText_(p.lokasi, 'Lokasi', LIMITS.teks, true),
    keadaan: cleanText_(p.keadaan, 'Keadaan', LIMITS.keadaan, true),
    roadtax_expiry: cleanDate_(p.roadtax_expiry, 'Tarikh tamat roadtax', true),
    catatan: cleanText_(p.catatan, 'Catatan', LIMITS.catatan, false)
  };
  return saveRecord_(ss, user, {
    tab: 'Vehicles', idField: 'vehicle_id', prefix: 'VEH', id: p.vehicle_id, fields: f, upload: p.dokumen, label: 'Dokumen', kind: 'kenderaan',
    unique: function (r) { return normPlate_(r.plate_no) === plate ? 'No. plat ' + plate + ' sudah didaftar' : ''; },
    audit: 'VEHICLE', pub: function (r) { return vehiclePublic_(r, ctx_(ss)); }
  });
}

/** payload: { chargeman_id?, staff_id?, nama, solar_farm, competency_no?, expiry_date, catatan?, dokumen? } */
function saveChargeman_(ss, user, p) {
  var sid = String(p.staff_id || '').trim() ? cleanStaffId_(p.staff_id) : '';
  var f = {
    staff_id: sid,
    nama: cleanText_(p.nama, 'Nama chargeman', LIMITS.teks, true),
    solar_farm: cleanText_(p.solar_farm, 'Solar farm', LIMITS.teks, true),
    competency_no: cleanText_(p.competency_no, 'No. kompetensi', LIMITS.teks, false),
    expiry_date: cleanDate_(p.expiry_date, 'Tarikh tamat', true),
    catatan: cleanText_(p.catatan, 'Catatan', LIMITS.catatan, false)
  };
  return saveRecord_(ss, user, {
    tab: 'Chargeman', idField: 'chargeman_id', prefix: 'CHG', id: p.chargeman_id, fields: f, upload: p.dokumen, label: 'Dokumen', kind: 'chargeman',
    unique: function (r) {
      return f.competency_no && textVal_(r.competency_no).toUpperCase() === f.competency_no.toUpperCase() && textVal_(r.solar_farm).toUpperCase() === f.solar_farm.toUpperCase()
        ? 'No. kompetensi ' + f.competency_no + ' untuk ' + f.solar_farm + ' sudah wujud' : '';
    },
    audit: 'CHARGEMAN', pub: function (r) { return chargemanPublic_(r, ctx_(ss)); }
  });
}

/** Cipta / kemas kini satu rekod dengan satu dokumen pilihan (fail lama dibuang ke Trash bila diganti). */
function saveRecord_(ss, user, o) {
  var parsed = o.upload ? parseUpload_(o.upload, o.label) : null;
  var sh = sheet_(ss, o.tab);
  var editId = String(o.id || '').trim();
  var newFile = '', oldFile = '';
  var saved, created = false;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var live = t.rows.filter(function (r) { return !isDeleted_(r); });
    var cur = editId ? live.filter(function (r) { return String(r[o.idField]) === editId; })[0] : null;
    if (editId && !cur) throw httpError_(404, 'Rekod tidak dijumpai');
    var clash = live.filter(function (r) { return (!cur || r._row !== cur._row) && o.unique(r); })[0];
    if (clash) throw httpError_(409, o.unique(clash));
    var id = cur ? editId : nextId_(ss, o.prefix, 5);
    if (parsed) newFile = storeFile_(parsed, id, o.kind);
    var fields = Object.assign({}, o.fields, { updated_at: nowIso_(), updated_by: user.email });
    if (newFile) { fields.doc_file_id = newFile; oldFile = cur ? String(cur.doc_file_id || '') : ''; }
    if (cur) {
      updateRowObj_(sh, t.header, cur._row, fields);
      saved = Object.assign({}, cur, fields);
    } else {
      var base = auditRow_(user.email);
      base[o.idField] = id;
      if (!newFile) base.doc_file_id = '';
      saved = Object.assign(base, fields);
      appendObj_(sh, t.header, saved);
      created = true;
    }
  } catch (e) {
    trashFile_(newFile);
    throw e;
  } finally {
    lock.releaseLock();
  }
  trashFile_(oldFile);
  audit_(user.email, (created ? 'CREATE_' : 'UPDATE_') + o.audit, String(saved[o.idField]), JSON.stringify(o.fields).slice(0, 300) + (newFile ? '; dokumen baharu' : ''));
  return o.pub(saved);
}

/**
 * payload: { staff_id, nama, designation?, ic_no?, ic_depan?, ic_belakang?, buang_ic?: bool, baru?: bool }
 * Admin cipta / kemas kini profil staf (sistem lama: updateStaffProfile_ dengan PIN).
 */
function saveStaff_(ss, user, p) {
  var sid = cleanStaffId_(p.staff_id);
  var f = { nama: cleanText_(p.nama, 'Nama', LIMITS.teks, true) };
  // Medan yang tak dihantar tak diubah (sistem lama: "hanya medan yang dihantar diubah")
  if (p.designation !== undefined) f.designation = cleanText_(p.designation, 'Designation', 80, false);
  if (p.ic_no !== undefined) f.ic_no = cleanIc_(p.ic_no);
  var front = p.ic_depan ? parseUpload_(p.ic_depan, 'IC depan') : null;
  var back = p.ic_belakang ? parseUpload_(p.ic_belakang, 'IC belakang') : null;
  var sh = sheet_(ss, 'Staff');
  var created = [], old = [];
  var saved, isNew = false;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var cur = staffById_(t.rows.filter(function (r) { return !isDeleted_(r); }), sid);
    if (p.baru === true && cur) throw httpError_(409, 'Staff ID ' + sid + ' sudah wujud');
    if (front) created.push(f.ic_front_file_id = storeFile_(front, sid + '-depan', 'ic'));
    if (back) created.push(f.ic_back_file_id = storeFile_(back, sid + '-belakang', 'ic'));
    if (p.buang_ic === true && !front && !back) { f.ic_front_file_id = ''; f.ic_back_file_id = ''; }
    if (cur) {
      ['ic_front_file_id', 'ic_back_file_id'].forEach(function (k) { if (k in f && String(cur[k] || '')) old.push(String(cur[k])); });
      if (front || back || p.buang_ic === true) { f.ic_oleh = user.email; }
      updateRowObj_(sh, t.header, cur._row, Object.assign(f, { updated_at: nowIso_(), updated_by: user.email }));
      saved = Object.assign({}, cur, f);
    } else {
      saved = Object.assign(auditRow_(user.email), { staff_id: sid, staff_email: '', designation: '', ic_no: '', ic_front_file_id: '', ic_back_file_id: '', ic_consent_version: '', ic_consent_at: '', ic_oleh: front || back ? user.email : '' }, f);
      appendObj_(sh, t.header, saved);
      isNew = true;
    }
  } catch (e) {
    created.forEach(trashFile_);
    throw e;
  } finally {
    lock.releaseLock();
  }
  old.forEach(trashFile_);
  audit_(user.email, isNew ? 'CREATE_STAFF' : 'UPDATE_STAFF', sid, 'designation=' + (f.designation === undefined ? '(tak diubah)' : f.designation) + ('ic_no' in f ? '; no. IC dikemas kini' : '') + (front || back ? '; salinan IC baharu' : '') + (p.buang_ic === true ? '; IC dibuang' : ''));
  return staffPublic_(saved, rows_(ss, 'StaffCerts'), ctx_(ss));
}

/** Satu sijil (staff_id, jenis): cipta / kemas kini. Kongsi untuk admin dan staf sendiri. */
function upsertCert_(ss, user, sid, p, allowClear) {
  var jenis = String(p.jenis || '');
  if (CERT_KEYS.indexOf(jenis) < 0) throw httpError_(400, 'Jenis sijil tak sah');
  var expiry = cleanDate_(p.expiry_date, 'Tarikh tamat', false);
  var noSijil = p.no_sijil === undefined ? null : cleanText_(p.no_sijil, 'No. sijil', 60, false);
  var parsed = p.fail ? parseUpload_(p.fail, 'Sijil') : null;
  if (!expiry && !parsed && noSijil === null && !allowClear) throw httpError_(400, 'Isi tarikh tamat atau muat naik sijil');
  var sh = sheet_(ss, 'StaffCerts');
  var newFile = '', oldFile = '';
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var cur = t.rows.filter(function (r) { return !isDeleted_(r) && String(r.staff_id).toUpperCase() === sid && String(r.jenis) === jenis; })[0];
    if (parsed) newFile = storeFile_(parsed, sid + '-' + jenis, 'sijil');
    var fields = { updated_at: nowIso_(), updated_by: user.email };
    // Sistem lama: tarikh kosong TIDAK menimpa tarikh sedia ada (kecuali admin minta kosongkan)
    if (expiry || allowClear) fields.expiry_date = expiry;
    if (noSijil !== null) fields.no_sijil = noSijil;
    if (newFile) { fields.cert_file_id = newFile; oldFile = cur ? String(cur.cert_file_id || '') : ''; }
    if (cur) {
      updateRowObj_(sh, t.header, cur._row, fields);
      saved = Object.assign({}, cur, fields);
    } else {
      saved = Object.assign(auditRow_(user.email), { cert_id: nextId_(ss, 'CRT', 5), staff_id: sid, jenis: jenis, no_sijil: noSijil || '', expiry_date: expiry, cert_file_id: newFile }, fields);
      appendObj_(sh, t.header, saved);
    }
  } catch (e) {
    trashFile_(newFile);
    throw e;
  } finally {
    lock.releaseLock();
  }
  trashFile_(oldFile);
  audit_(user.email, 'SAVE_CERT', sid + ' ' + jenis, 'tamat=' + dateStr_(saved.expiry_date) + (newFile ? '; fail baharu' : ''));
  return true;
}

/** payload: { staff_id, jenis, expiry_date ('' = kosongkan), no_sijil?, fail? }. Admin. */
function saveStaffCert_(ss, user, p) {
  var sid = cleanStaffId_(p.staff_id);
  if (!staffById_(rows_(ss, 'Staff'), sid)) throw httpError_(404, 'Staf tidak dijumpai. Tambah staf dahulu.');
  upsertCert_(ss, user, sid, p, true);
  return getStaff_(ss, user, { staff_id: sid });
}

/** payload: { jenis: 'kenderaan'|'chargeman'|'staf', id, sebab }. Padam lembut (sistem lama: arkib Deleted_Rows). */
function deleteRecord_(ss, user, p) {
  var map = { kenderaan: ['Vehicles', 'vehicle_id'], chargeman: ['Chargeman', 'chargeman_id'], staf: ['Staff', 'staff_id'] };
  var m = map[String(p.jenis || '')];
  if (!m) throw httpError_(400, 'Jenis rekod tak sah');
  var sebab = cleanText_(p.sebab, 'Sebab', LIMITS.sebab, true);
  if (sebab.length < 3) throw httpError_(400, 'Sebab wajib diisi (sekurang-kurangnya 3 aksara)');
  var sh = sheet_(ss, m[0]);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var id = String(p.id || '').trim().toUpperCase();
    var r = t.rows.filter(function (x) { return !isDeleted_(x) && String(x[m[1]]).toUpperCase() === id; })[0];
    if (!r) throw httpError_(404, 'Rekod tidak dijumpai');
    updateRowObj_(sh, t.header, r._row, { deleted: 'TRUE', deleted_reason: sebab, updated_at: nowIso_(), updated_by: user.email });
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'DELETE_' + m[0].toUpperCase(), String(p.id), sebab);
  return true;
}

// ---------------------------------------------------------------- S-65 Senarai Kerja (F-64)

/**
 * payload: { staff_ids: [...] }. Data untuk dokumen "DETAILS OF WORKING PERSONNEL" (sistem lama: senarai/index.html):
 * nama, designation, no. IC, semua sijil + chargeman. Gambar (IC, sijil) diambil berasingan melalui getFile.
 */
function senaraiData_(ss, user, p) {
  var ids = Array.isArray(p.staff_ids) ? p.staff_ids.map(function (x) { return String(x).trim().toUpperCase(); }).filter(String) : [];
  if (!ids.length) throw httpError_(400, 'Pilih sekurang-kurangnya seorang staf');
  if (ids.length > LIMITS.senarai) throw httpError_(400, 'Maksimum ' + LIMITS.senarai + ' staf satu senarai');
  var c = ctx_(ss);
  var staffRows = rows_(ss, 'Staff');
  var certRows = rows_(ss, 'StaffCerts');
  var cm = rows_(ss, 'Chargeman');
  var out = ids.map(function (id) {
    var s = staffById_(staffRows, id);
    if (!s) throw httpError_(404, 'Staf ' + id + ' tidak dijumpai');
    var o = staffPublic_(s, certRows, c);
    o.ic_no = textVal_(s.ic_no);
    o.chargeman = cm.filter(function (r) { return String(r.staff_id).toUpperCase() === id; }).map(function (r) { return chargemanPublic_(r, c); });
    return o;
  });
  audit_(user.email, 'VIEW_IC', ids.join(','), 'Senarai Kerja (' + ids.length + ' staf)');
  return { syarikat: { nama: c.settings.company_name || '', alamat: c.settings.company_address || '' }, staf: out };
}

/** payload: { kerja, tempat, tarikh, staff_ids, sijil: [jenis...] }. Rekod setiap Senarai Kerja dijana (sistem lama: logJob_). */
function logJob_(ss, user, p) {
  var kerja = cleanText_(p.kerja, 'Kerja', 120, true);
  var tempat = cleanText_(p.tempat, 'Tempat', 120, true);
  var tarikh = cleanDate_(p.tarikh, 'Tarikh', true);
  var ids = Array.isArray(p.staff_ids) ? p.staff_ids.map(function (x) { return String(x).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ''); }).filter(String) : [];
  if (!ids.length || ids.length > LIMITS.senarai) throw httpError_(400, 'Senarai staf tak sah');
  var sijil = (Array.isArray(p.sijil) ? p.sijil : []).filter(function (k) { return CERT_KEYS.indexOf(k) >= 0 || k === 'CM'; });
  var tajuk = ('DETAILS OF WORKING PERSONNEL FOR ' + kerja + ' WORKS AT ' + tempat).toUpperCase();
  var sh = sheet_(ss, 'JobLog');
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var row = { job_id: nextId_(ss, 'JOB', 5), tarikh: tarikh, kerja: kerja, tempat: tempat, tajuk: tajuk, staff_ids: ids.join(', '), bil_orang: ids.length, sijil: sijil.join(','), dibuat_oleh: user.email, dibuat_oleh_nama: String(user.nama || ''), created_at: nowIso_() };
  appendObj_(sh, h, row);
  audit_(user.email, 'SENARAI_KERJA', row.job_id, tajuk + ' (' + ids.length + ' orang)');
  return { job_id: row.job_id, tajuk: tajuk };
}

function listJobs_(ss) {
  return readTable_(sheet_(ss, 'JobLog')).rows.filter(function (r) { return String(r.job_id); })
    .sort(function (a, b) { return isoStr_(b.created_at).localeCompare(isoStr_(a.created_at)) || String(b.job_id).localeCompare(String(a.job_id)); })
    .slice(0, 200)
    .map(function (r) {
      return { job_id: String(r.job_id), tarikh: dateStr_(r.tarikh), kerja: textVal_(r.kerja), tempat: textVal_(r.tempat), tajuk: textVal_(r.tajuk), staff_ids: String(r.staff_ids), bil_orang: Number(r.bil_orang) || 0, sijil: String(r.sijil || ''), dibuat_oleh_nama: textVal_(r.dibuat_oleh_nama), created_at: isoStr_(r.created_at) };
    });
}

// ---------------------------------------------------------------- S-64 sijil saya (semua staf)

function myId_(user) {
  var sid = String(user.staff_id || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(sid)) throw httpError_(409, 'Staff ID anda belum didaftar dalam portal. Hubungi HR.');
  return sid;
}

/** Profil staf sendiri: cipta jika belum ada (nama dari sesi), dan isi emel jika kosong (untuk peringatan). */
function ensureMe_(ss, user) {
  var sid = myId_(user);
  var sh = sheet_(ss, 'Staff');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var cur = staffById_(t.rows.filter(function (r) { return !isDeleted_(r); }), sid);
    if (!cur) {
      cur = Object.assign(auditRow_(user.email), { staff_id: sid, staff_email: user.email, nama: String(user.nama || ''), designation: '', ic_no: '', ic_front_file_id: '', ic_back_file_id: '', ic_consent_version: '', ic_consent_at: '', ic_oleh: '' });
      appendObj_(sh, t.header, cur);
    } else if (String(cur.staff_email || '') !== String(user.email)) {
      updateRowObj_(sh, t.header, cur._row, { staff_email: user.email });
      cur.staff_email = user.email;
    }
    return cur;
  } finally {
    lock.releaseLock();
  }
}

function mySummary_(ss, user) {
  var c = ctx_(ss);
  var sid = String(user.staff_id || '').trim().toUpperCase();
  var s = sid ? staffById_(rows_(ss, 'Staff'), sid) : null;
  var base = s || { staff_id: sid, nama: user.nama || '', designation: '' };
  var out = staffPublic_(base, rows_(ss, 'StaffCerts'), c);
  out.ic_no_tersembunyi = s ? maskIc_(s.ic_no) : '';
  out.ic_lengkap = Boolean(s && String(s.ic_front_file_id || '') && String(s.ic_back_file_id || '') && String(s.ic_no || ''));
  out.chargeman = sid ? rows_(ss, 'Chargeman').filter(function (r) { return String(r.staff_id).toUpperCase() === sid; }).map(function (r) { return chargemanPublic_(r, c); }) : [];
  out.amaran_hari = c.warn;
  out.jenis_sijil = CERT_TYPES.map(function (t) { return { key: t.key, label: t.label }; });
  out.versi_persetujuan = IC_CONSENT_VERSION;
  out.boleh_kemas_kini = Boolean(sid);
  return out;
}

/** payload: { jenis, expiry_date?, no_sijil?, fail? }. Staf SENDIRI sahaja (staff_id dari sesi). */
function saveMyCert_(ss, user, p) {
  var me = ensureMe_(ss, user);
  upsertCert_(ss, user, String(me.staff_id).toUpperCase(), { jenis: p.jenis, expiry_date: p.expiry_date, no_sijil: p.no_sijil, fail: p.fail }, false);
  return mySummary_(ss, user);
}

/**
 * payload: { setuju: true, versi, ic_no, depan: {data}, belakang: {data} }. Sekali sahaja (sistem lama: staffUpdateIc,
 * "selepas dihantar, anda tidak boleh mengubahnya sendiri"). Persetujuan direkod dengan versi & masa.
 */
function submitMyIc_(ss, user, p) {
  if (p.setuju !== true || String(p.versi || '') !== IC_CONSENT_VERSION) throw httpError_(400, 'Persetujuan penggunaan maklumat IC diperlukan');
  var ic = cleanIc_(p.ic_no);
  if (!ic) throw httpError_(400, 'No. IC wajib diisi');
  if (!p.depan || !p.belakang) throw httpError_(400, 'Gambar IC depan dan belakang wajib');
  var front = parseUpload_(p.depan, 'IC depan');
  var back = parseUpload_(p.belakang, 'IC belakang');
  var me = ensureMe_(ss, user);
  var sid = String(me.staff_id).toUpperCase();
  var sh = sheet_(ss, 'Staff');
  var ids = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var cur = staffById_(t.rows.filter(function (r) { return !isDeleted_(r); }), sid);
    if (String(cur.ic_front_file_id || '') && String(cur.ic_back_file_id || '') && String(cur.ic_no || '')) {
      throw httpError_(409, 'Maklumat IC anda sudah lengkap. Hubungi HR untuk sebarang perubahan.');
    }
    ids.push(storeFile_(front, sid + '-depan', 'ic'));
    ids.push(storeFile_(back, sid + '-belakang', 'ic'));
    var now = nowIso_();
    updateRowObj_(sh, t.header, cur._row, { ic_no: ic, ic_front_file_id: ids[0], ic_back_file_id: ids[1], ic_consent_version: IC_CONSENT_VERSION, ic_consent_at: now, ic_oleh: user.email, updated_at: now, updated_by: user.email });
  } catch (e) {
    ids.forEach(trashFile_);
    throw e;
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'SUBMIT_IC', sid, 'persetujuan ' + IC_CONSENT_VERSION);
  return mySummary_(ss, user);
}

// ---------------------------------------------------------------- fail

/**
 * payload: { jenis: 'kenderaan'|'chargeman'|'sijil'|'ic_depan'|'ic_belakang', id?, staff_id?, sijil?, pratonton? }
 * kenderaan: admin. chargeman: admin atau chargeman itu sendiri. sijil: admin atau pemilik. IC: admin sahaja (VIEW_IC).
 */
function getFile_(ss, user, p) {
  var jenis = String(p.jenis || '');
  var admin = isAdmin_(user);
  var mine = String(user.staff_id || '').trim().toUpperCase();
  var deny = function (what) { audit_(user.email, 'FORBIDDEN', 'getFile', what); return httpError_(403, 'Tiada kebenaran'); };
  var fileId = '';
  var ref = '';
  if (jenis === 'kenderaan' || jenis === 'chargeman') {
    var m = jenis === 'kenderaan' ? ['Vehicles', 'vehicle_id'] : ['Chargeman', 'chargeman_id'];
    var r = rows_(ss, m[0]).filter(function (x) { return String(x[m[1]]) === String(p.id || ''); })[0];
    if (!r) throw httpError_(404, 'Rekod tidak dijumpai');
    if (!admin && !(jenis === 'chargeman' && mine && String(r.staff_id).toUpperCase() === mine)) throw deny(jenis + ' ' + p.id);
    fileId = String(r.doc_file_id || '');
    ref = String(p.id);
  } else if (jenis === 'sijil') {
    var sid = String(p.staff_id || mine).trim().toUpperCase();
    if (!admin && sid !== mine) throw deny('sijil ' + sid);
    var cr = rows_(ss, 'StaffCerts').filter(function (x) { return String(x.staff_id).toUpperCase() === sid && String(x.jenis) === String(p.sijil || ''); })[0];
    fileId = cr ? String(cr.cert_file_id || '') : '';
    ref = sid + ' ' + p.sijil;
  } else if (jenis === 'ic_depan' || jenis === 'ic_belakang') {
    if (!admin) throw deny(jenis);
    var s = staffById_(rows_(ss, 'Staff'), p.staff_id);
    if (!s) throw httpError_(404, 'Staf tidak dijumpai');
    fileId = String((jenis === 'ic_depan' ? s.ic_front_file_id : s.ic_back_file_id) || '');
    ref = String(s.staff_id);
  } else {
    throw httpError_(400, 'Jenis fail tak sah');
  }
  if (!fileId) throw httpError_(404, 'Tiada fail');
  var f;
  try { f = p.pratonton === true ? readPreview_(fileId) : readFile_(fileId); } catch (e) { throw httpError_(404, 'Fail tidak dapat dibuka (mungkin dipadam, atau fail sistem lama tanpa akses)'); }
  audit_(user.email, jenis.indexOf('ic_') === 0 ? 'VIEW_IC' : 'VIEW_FILE', ref, jenis);
  return f;
}
