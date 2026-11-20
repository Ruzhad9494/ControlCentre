/**
 * Actions.gs - web app Cost Calculator (F-20 hingga F-22; BSD 4.2; IPD 2A).
 *
 * Role (BSD 4.1, disahkan pemilik 19/11/2026): Commercial, PSS, OMP -> `user`; ketua Commercial -> `admin`.
 * Skop (BSD 4.2):
 *   Rates      admin CRU · user R
 *   Estimates  user CRU (sendiri), R (semua dalam dept) · admin CRUD
 * `viewer` portal: baca sahaja, semua.
 */

var ACTION_ROLES = {
  getRates:          ['user', 'admin', 'viewer'],
  updateRates:       ['admin'],
  listEstimates:     ['user', 'admin', 'viewer'],
  getEstimate:       ['user', 'admin', 'viewer'],
  saveEstimate:      ['user', 'admin'],
  duplicateEstimate: ['user', 'admin'],
  deleteEstimate:    ['admin']
};

var LIMITS = {
  text: 120,
  staff: 500, transport_unit: 100, ot_jam: 1000, homestay_unit: 100, mileage_km: 100000,
  nilai_po_rm: 1e9, sst_peratus: 100, subkon_count: 20, subkon_rm: 1e9, rate_rm: 100000
};

function doPost(e) {
  return handleRequest_(e, prop_('MODULE_SECRET'), routeCostCalc_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeCostCalc_(req) {
  var user = req.user || {};
  authorize_(ACTION_ROLES, req.action, user);
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var p = req.payload || {};
  switch (req.action) {
    case 'getRates':          return getRates_(ss);
    case 'updateRates':       return updateRates_(ss, user, p);
    case 'listEstimates':     return listEstimates_(ss, user, p);
    case 'getEstimate':       return getEstimate_(ss, user, p);
    case 'saveEstimate':      return saveEstimate_(ss, user, p);
    case 'duplicateEstimate': return duplicateEstimate_(ss, user, p);
    case 'deleteEstimate':    return deleteEstimate_(ss, user, p);
  }
  throw httpError_(400, 'Action tidak dikenali');
}

function hasRole_(user, roles) {
  var mine = user.roles || [];
  return roles.some(function (r) { return mine.indexOf(r) >= 0; });
}
function isAdmin_(user) { return hasRole_(user, ['admin', 'superadmin']); }
function seesAll_(user) { return hasRole_(user, ['admin', 'superadmin', 'viewer']); }

// ---------------------------------------------------------------- Rates (F-22)

function readRates_(ss) {
  var t = readTable_(sheet_(ss, 'Rates'));
  var byKey = {};
  t.rows.forEach(function (r) { if (!isDeleted_(r)) byKey[String(r.rate_key).trim()] = r; });
  var list = RATE_SEED.map(function (seed) {
    var r = byKey[seed[0]] || {};
    var raw = r.nilai_rm;
    var val = raw === '' || raw === null || raw === undefined ? null : Number(raw);
    return {
      rate_key: seed[0],
      label: String(unsanitize_(r.label || seed[1])),
      unit: String(unsanitize_(r.unit || seed[2])),
      nilai_rm: val !== null && isFinite(val) && val >= 0 ? val : null,
      berkuat_kuasa: dateStr_(r.berkuat_kuasa),
      _row: r._row || null
    };
  });
  var map = {};
  list.forEach(function (x) { map[x.rate_key] = x.nilai_rm; });
  return { header: t.header, list: list, map: map, lengkap: list.every(function (x) { return x.nilai_rm !== null; }) };
}

function getRates_(ss) {
  var r = readRates_(ss);
  return {
    lengkap: r.lengkap,
    rates: r.list.map(function (x) { return { rate_key: x.rate_key, label: x.label, unit: x.unit, nilai_rm: x.nilai_rm, berkuat_kuasa: x.berkuat_kuasa }; })
  };
}

/** payload: { rates: [{ rate_key, nilai_rm, berkuat_kuasa? }], sebab? } - nilai lama direkod dalam AuditLog (AFD). */
function updateRates_(ss, user, p) {
  var changes = Array.isArray(p.rates) ? p.rates : [];
  if (!changes.length) throw httpError_(400, 'Tiada perubahan');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_(ss, 'Rates');
    var cur = readRates_(ss);
    var byKey = {};
    cur.list.forEach(function (x) { byKey[x.rate_key] = x; });
    var today = todayIso_();
    var log = [];
    changes.forEach(function (c) {
      var key = String(c.rate_key || '');
      var row = byKey[key];
      if (!row) throw httpError_(400, 'Kadar tidak dikenali: ' + key);
      var v = Number(c.nilai_rm);
      if (c.nilai_rm === '' || c.nilai_rm === null || !isFinite(v) || v < 0 || v > LIMITS.rate_rm) {
        throw httpError_(400, row.label + ': nilai mesti nombor 0 hingga ' + LIMITS.rate_rm);
      }
      v = calcRound2_(v);
      var eff = String(c.berkuat_kuasa || today);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eff)) throw httpError_(400, 'Tarikh berkuat kuasa mesti YYYY-MM-DD');
      if (row.nilai_rm === v && row.berkuat_kuasa === eff) return;
      var fields = { nilai_rm: v, berkuat_kuasa: eff, updated_at: nowIso_(), updated_by: user.email };
      if (row._row) {
        updateObj_(sh, cur.header, row._row, fields);
      } else {
        appendObj_(sh, cur.header, Object.assign({ rate_key: key, label: row.label, unit: row.unit, created_at: nowIso_(), created_by: user.email, deleted: 'FALSE', deleted_reason: '' }, fields));
      }
      log.push(key + ': ' + (row.nilai_rm === null ? '(kosong)' : row.nilai_rm) + ' -> ' + v + ' (berkuat kuasa ' + eff + ')');
    });
    if (log.length) audit_(user.email, 'UPDATE_RATES', 'Rates', log.join('; ') + (p.sebab ? ' | sebab: ' + String(p.sebab).slice(0, 200) : ''));
    return getRates_(ss);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- Estimates (F-20, F-21)

function num_(v, max, label) {
  if (v === '' || v === null || v === undefined) return 0;
  var x = Number(v);
  if (!isFinite(x) || x < 0 || x > max) throw httpError_(400, label + ' mesti nombor 0 hingga ' + max);
  return x;
}

function text_(v, label, required) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (required && !s) throw httpError_(400, label + ' wajib diisi');
  if (s.length > LIMITS.text) throw httpError_(400, label + ' terlalu panjang (maksimum ' + LIMITS.text + ' aksara)');
  return s;
}

function date_(v, label) {
  var s = String(v || '').trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || calcParseDate_(s) === null) throw httpError_(400, label + ' mesti tarikh YYYY-MM-DD');
  return s;
}

/** Bersihkan & sahkan input dari browser. Jumlah dari browser DIABAIKAN; server kira semula. */
function cleanInput_(p) {
  var subkon = Array.isArray(p.subkon) ? p.subkon : [];
  if (subkon.length > LIMITS.subkon_count) throw httpError_(400, 'Maksimum ' + LIMITS.subkon_count + ' subkon');
  var input = {
    nama_projek: text_(p.nama_projek, 'Job / nama projek', true),
    klien: text_(p.klien, 'Client', false),
    lokasi: text_(p.lokasi, 'Location', false),
    project_id: String(p.project_id || '').trim(),
    tarikh_mula: date_(p.tarikh_mula, 'Tarikh mula'),
    tarikh_tamat: date_(p.tarikh_tamat, 'Tarikh tamat'),
    staff: num_(p.staff, LIMITS.staff, 'Staff'),
    transport_unit: num_(p.transport_unit, LIMITS.transport_unit, 'Transport'),
    ot_jam: num_(p.ot_jam, LIMITS.ot_jam, 'Overtime'),
    homestay_unit: num_(p.homestay_unit, LIMITS.homestay_unit, 'Homestay'),
    mileage_km: num_(p.mileage_km, LIMITS.mileage_km, 'Mileage'),
    nilai_po_rm: num_(p.nilai_po_rm, LIMITS.nilai_po_rm, 'Nilai PO'),
    sst_peratus: num_(p.sst_peratus, LIMITS.sst_peratus, 'Kadar SST'),
    subkon: subkon.map(function (v, i) { return num_(v, LIMITS.subkon_rm, 'Subcont ' + (i + 1)); })
  };
  if (input.project_id && !/^[A-Za-z0-9-]{1,30}$/.test(input.project_id)) throw httpError_(400, 'ID projek tak sah');
  if (input.tarikh_mula && input.tarikh_tamat && input.tarikh_tamat < input.tarikh_mula) {
    throw httpError_(400, 'Tarikh tamat tidak boleh sebelum tarikh mula');
  }
  return input;
}

function requireRates_(ss) {
  var r = readRates_(ss);
  if (!r.lengkap) throw httpError_(409, 'Kadar kos belum lengkap. Minta admin Cost Calculator isi di tab Kadar.');
  return r.map;
}

function buildRow_(input, rates, hasil, user, status) {
  var mob = {
    tarikh_mula: input.tarikh_mula, tarikh_tamat: input.tarikh_tamat, malam: hasil.malam,
    transport_unit: input.transport_unit, ot_jam: input.ot_jam, homestay_unit: input.homestay_unit,
    mileage_km: input.mileage_km, sst_peratus: input.sst_peratus, subkon: input.subkon,
    kos: hasil.kos, jumlah_mobilisasi: hasil.jumlah_mobilisasi, sst: hasil.sst, po_akhir: hasil.po_akhir
  };
  return {
    project_id: input.project_id,
    nama_projek: input.nama_projek,
    klien: input.klien,
    lokasi: input.lokasi,
    hari: hasil.hari,
    manpower: input.staff,
    mobilisasi_json: JSON.stringify(mob),
    nilai_po_rm: input.nilai_po_rm,
    kos_subkon_rm: hasil.jumlah_subkon,
    rates_snapshot_json: JSON.stringify(rates),
    jumlah_kos_rm: hasil.jumlah_kos,
    margin_rm: hasil.margin,
    margin_peratus: hasil.margin_peratus,
    status: status
  };
}

function parseJson_(s, fallback) {
  try { return JSON.parse(String(unsanitize_(s) || '')); } catch (e) { return fallback; }
}

/** Bentuk awam: emel pencipta TIDAK didedah kepada staf lain (TRD 6 PDPA); guna nama sahaja. */
function estimatePublic_(r, user, full) {
  var mob = parseJson_(r.mobilisasi_json, {});
  var mine = String(r.created_by) === String(user.email);
  var status = String(r.status) || 'Draf';
  var out = {
    estimate_id: String(r.estimate_id),
    project_id: String(r.project_id || ''),
    nama_projek: String(unsanitize_(r.nama_projek)),
    klien: String(unsanitize_(r.klien || '')),
    lokasi: String(unsanitize_(r.lokasi || '')),
    status: status,
    department: String(r.department || ''),
    dibuat_oleh: (mob.dibuat_oleh && mob.dibuat_oleh.nama) || '',
    milik_saya: mine,
    boleh_ubah: isAdmin_(user) || (mine && status === 'Draf'),
    nilai_po_rm: Number(r.nilai_po_rm) || 0,
    jumlah_kos_rm: Number(r.jumlah_kos_rm) || 0,
    margin_rm: Number(r.margin_rm) || 0,
    margin_peratus: Number(r.margin_peratus) || 0,
    dikemas_kini: r.updated_at ? String(r.updated_at) : ''
  };
  if (full) {
    out.input = {
      nama_projek: out.nama_projek, klien: out.klien, lokasi: out.lokasi, project_id: out.project_id,
      tarikh_mula: mob.tarikh_mula || '', tarikh_tamat: mob.tarikh_tamat || '',
      staff: Number(r.manpower) || 0, transport_unit: mob.transport_unit || 0, ot_jam: mob.ot_jam || 0,
      homestay_unit: mob.homestay_unit || 0, mileage_km: mob.mileage_km || 0,
      nilai_po_rm: out.nilai_po_rm, sst_peratus: mob.sst_peratus === undefined ? 0 : mob.sst_peratus, subkon: mob.subkon || []
    };
    out.rates = parseJson_(r.rates_snapshot_json, {});
  }
  return out;
}

function canSee_(r, user) {
  if (seesAll_(user)) return true;
  if (String(r.created_by) === String(user.email)) return true;
  return Boolean(user.department) && String(r.department) === String(user.department);
}

function findEstimate_(t, id) {
  var key = String(id || '').trim();
  if (!key) throw httpError_(400, 'estimate_id wajib');
  return t.rows.filter(function (r) { return !isDeleted_(r) && String(r.estimate_id) === key; })[0] || null;
}

function listEstimates_(ss, user, p) {
  var t = readTable_(sheet_(ss, 'Estimates'));
  var cari = String(p.cari || '').trim().toLowerCase();
  var status = String(p.status || '');
  var rows = t.rows.filter(function (r) {
    if (isDeleted_(r) || !String(r.estimate_id) || !canSee_(r, user)) return false;
    if (status && String(r.status) !== status) return false;
    if (p.saya && String(r.created_by) !== String(user.email)) return false;
    if (cari && [r.estimate_id, r.nama_projek, r.klien, r.lokasi].join(' ').toLowerCase().indexOf(cari) < 0) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
  return rows.slice(0, 200).map(function (r) { return estimatePublic_(r, user, false); });
}

function getEstimate_(ss, user, p) {
  var r = findEstimate_(readTable_(sheet_(ss, 'Estimates')), p.estimate_id);
  if (!r) throw httpError_(404, 'Estimate tidak dijumpai');
  if (!canSee_(r, user)) {
    audit_(user.email, 'FORBIDDEN', 'getEstimate', String(p.estimate_id));
    throw httpError_(403, 'Tiada kebenaran');
  }
  return estimatePublic_(r, user, true);
}

/**
 * payload: input borang + { estimate_id? , status: 'Draf'|'Muktamad' }
 * - baharu: pemilik = pemanggil, department pemanggil
 * - kemas kini: pemilik (status Draf sahaja) atau admin; kira semula dengan kadar SEMASA
 * - Muktamad: dikunci untuk user (guna Duplicate)
 */
function saveEstimate_(ss, user, p) {
  var input = cleanInput_(p);
  var status = p.status === 'Muktamad' ? 'Muktamad' : 'Draf';
  var rates = requireRates_(ss);
  var hasil = calcEstimate_(input, rates);
  var row = buildRow_(input, rates, hasil, user, status);
  var sh = sheet_(ss, 'Estimates');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var now = nowIso_();
    if (p.estimate_id) {
      var cur = findEstimate_(t, p.estimate_id);
      if (!cur) throw httpError_(404, 'Estimate tidak dijumpai');
      var mine = String(cur.created_by) === String(user.email);
      if (!isAdmin_(user)) {
        if (!mine) { audit_(user.email, 'FORBIDDEN', 'saveEstimate', String(p.estimate_id)); throw httpError_(403, 'Hanya pemilik atau admin boleh ubah estimate ini'); }
        if (String(cur.status) === 'Muktamad') throw httpError_(409, 'Estimate muktamad tidak boleh diubah. Guna Duplicate untuk buat salinan.');
      }
      var oldMob = parseJson_(cur.mobilisasi_json, {});
      var mob = JSON.parse(row.mobilisasi_json);
      mob.dibuat_oleh = oldMob.dibuat_oleh || { nama: '', staff_id: '' };
      row.mobilisasi_json = JSON.stringify(mob);
      updateObj_(sh, t.header, cur._row, Object.assign({}, row, { updated_at: now, updated_by: user.email }));
      audit_(user.email, 'UPDATE', String(cur.estimate_id), 'status=' + status + '; kos=' + hasil.jumlah_kos + '; margin=' + hasil.margin);
      return estimatePublic_(Object.assign({}, cur, row, { updated_at: now }), user, true);
    }
    var id = nextId_(ss, 'EST', 5);
    var mob2 = JSON.parse(row.mobilisasi_json);
    mob2.dibuat_oleh = { nama: String(user.nama || ''), staff_id: String(user.staff_id || '') };
    row.mobilisasi_json = JSON.stringify(mob2);
    var full = Object.assign({ estimate_id: id, department: String(user.department || '') }, row, {
      created_at: now, created_by: user.email, updated_at: now, updated_by: user.email, deleted: 'FALSE', deleted_reason: ''
    });
    appendObj_(sh, t.header, full);
    audit_(user.email, 'CREATE', id, 'status=' + status + '; kos=' + hasil.jumlah_kos + '; margin=' + hasil.margin);
    return estimatePublic_(full, user, true);
  } finally {
    lock.releaseLock();
  }
}

/** Salinan sebagai Draf baharu milik pemanggil, dikira dengan kadar SEMASA (F-21). */
function duplicateEstimate_(ss, user, p) {
  var src = getEstimate_(ss, user, p);
  var copy = Object.assign({}, src.input, { nama_projek: (src.input.nama_projek + ' (salinan)').slice(0, LIMITS.text), status: 'Draf' });
  delete copy.estimate_id;
  return saveEstimate_(ss, user, copy);
}

function deleteEstimate_(ss, user, p) {
  var sebab = String(p.sebab || '').trim();
  if (sebab.length < 3) throw httpError_(400, 'Sebab wajib diisi (minimum 3 aksara)');
  var sh = sheet_(ss, 'Estimates');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var r = findEstimate_(t, p.estimate_id);
    if (!r) throw httpError_(404, 'Estimate tidak dijumpai');
    updateObj_(sh, t.header, r._row, { deleted: 'TRUE', deleted_reason: sebab.slice(0, 300), updated_at: nowIso_(), updated_by: user.email });
    audit_(user.email, 'DELETE', String(r.estimate_id), sebab.slice(0, 300));
    return true;
  } finally {
    lock.releaseLock();
  }
}
