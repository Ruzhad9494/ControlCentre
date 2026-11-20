/**
 * Actions.gs - web app ClaimPro (F-50 hingga F-53; BSD 3.6, 4.1, 4.2, 4.3; IPD 2B).
 *
 * Role (BSD 4.1, dikemas kini pemilik 20/11/2026):
 *   `staff`  semua staf: buat tuntutan sendiri
 *   `admin`  Admin HR: lulus/tolak, laporan, senarai bayaran
 *   `ketua`  Head of HR: semua kuasa `admin` + BOLEH lulus tuntutan sendiri dan tuntutan staf HR
 * Asingan tugas:
 *   - `admin` TIDAK boleh lulus tuntutan sendiri; hanya `ketua` boleh
 *   - tuntutan staf department HR hanya boleh diluluskan `ketua` (Admin HR tak lulus tuntutan rakan sendiri)
 *   - HANYA staf pemilik boleh sahkan terima bayaran (Lulus -> Dibayar). Admin/ketua tak boleh tukar ke Dibayar
 *   - `superadmin` portal TIDAK automatik pelulus: beri role `admin`/`ketua` di S-05 (direkod dalam AccessChangeLog)
 * Skop data: staf nampak tuntutan sendiri sahaja; admin/ketua nampak semua. Emel staf tak didedah (paparan nama + no. pekerja).
 */

var ACTION_ROLES = {
  listClaimTypes:  ['staff', 'admin', 'ketua'],
  saveClaimType:   ['admin', 'ketua'],
  listMyClaims:    ['staff', 'admin', 'ketua'],
  getClaim:        ['staff', 'admin', 'ketua'],
  saveClaim:       ['staff', 'admin', 'ketua'],
  deleteClaim:     ['staff', 'admin', 'ketua'],
  getFile:         ['staff', 'admin', 'ketua'],
  confirmReceived: ['staff', 'admin', 'ketua'],
  listPending:     ['admin', 'ketua'],
  decideClaim:     ['admin', 'ketua'],
  listToPay:       ['admin', 'ketua'],
  claimReport:     ['admin', 'ketua']
};

var LIMITS = { keterangan: 500, sebab: 300, amaun: 1000000, pax: 1000, jenis_min: 2, jenis_max: 40, laporan_baris: 2000 };
var MIN_DATE = '2020-01-01';

function doPost(e) {
  return handleRequest_(e, prop_('MODULE_SECRET'), routeClaimPro_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeClaimPro_(req) {
  var user = req.user || {};
  authorize_(ACTION_ROLES, req.action, user);
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var p = req.payload || {};
  switch (req.action) {
    case 'listClaimTypes':  return listClaimTypes_(ss, user);
    case 'saveClaimType':   return saveClaimType_(ss, user, p);
    case 'listMyClaims':    return listMyClaims_(ss, user, p);
    case 'getClaim':        return getClaim_(ss, user, p);
    case 'saveClaim':       return saveClaim_(ss, user, p);
    case 'deleteClaim':     return deleteClaim_(ss, user, p);
    case 'getFile':         return getFile_(ss, user, p);
    case 'confirmReceived': return confirmReceived_(ss, user, p);
    case 'listPending':     return listPending_(ss, user);
    case 'decideClaim':     return decideClaim_(ss, user, p);
    case 'listToPay':       return listToPay_(ss, user);
    case 'claimReport':     return claimReport_(ss, user, p);
  }
  throw httpError_(400, 'Action tidak dikenali');
}

// ---------------------------------------------------------------- bantuan

function hasRoleCp_(user, role) { return (user.roles || []).indexOf(role) >= 0; }
function isKetua_(user) { return hasRoleCp_(user, 'ketua'); }
/** Pelulus ClaimPro: Admin HR atau Head of HR. */
function hasAdmin_(user) { return hasRoleCp_(user, 'admin') || isKetua_(user); }

/** Pelulus ClaimPro sebenar (`admin` atau `ketua`). `superadmin` sahaja TIDAK cukup (asingan tugas). */
function requireAdmin_(user, action) {
  if (!hasAdmin_(user)) {
    audit_(user.email, 'FORBIDDEN', action, '');
    throw httpError_(403, 'Hanya Admin ClaimPro dibenarkan');
  }
}

function truthy_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function textVal_(v) { return String(unsanitize_(v === null || v === undefined ? '' : v)); }

function validDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function money_(v, label, max) {
  var x = Number(v);
  if (v === '' || v === null || v === undefined || !isFinite(x) || x <= 0 || x > max) {
    throw httpError_(400, label + ' mesti nombor lebih daripada 0 dan tidak melebihi ' + max);
  }
  return round2_(x);
}

function readTypes_(ss) {
  return readTable_(sheet_(ss, 'ClaimTypes')).rows.filter(function (r) { return !isDeleted_(r) && String(r.jenis).trim(); }).map(function (r) {
    var had = r.had_rm === '' || r.had_rm === null || r.had_rm === undefined ? null : Number(r.had_rm);
    return { jenis: String(unsanitize_(r.jenis)).trim(), had_rm: had !== null && isFinite(had) && had > 0 ? had : null, perlu_resit: truthy_(r.perlu_resit), aktif: truthy_(r.aktif), _row: r._row };
  });
}

function findClaim_(t, id) {
  var key = String(id || '').trim();
  if (!key) throw httpError_(400, 'claim_id wajib');
  return t.rows.filter(function (r) { return !isDeleted_(r) && String(r.claim_id) === key; })[0] || null;
}

function addApproval_(ss, claimId, dari, ke, oleh, catatan) {
  var sh = sheet_(ss, 'Approvals');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  appendObj_(sh, header, { id: nextId_(ss, 'APR', 6), claim_id: claimId, dari_status: dari, ke_status: ke, oleh_email: oleh, ts: nowIso_(), catatan: catatan || '' });
}

/** Bentuk awam. TIADA emel staf, TIADA ID fail Drive. */
function claimPublic_(r, user) {
  var mine = String(r.staff_email) === String(user.email);
  var status = String(r.status);
  var approvedAt = isoStr_(r.approved_at);
  var ap = Date.parse(approvedAt);
  return {
    claim_id: String(r.claim_id),
    staff_name: textVal_(r.staff_name),
    staff_id: String(r.staff_id || ''),
    department: String(r.department || ''),
    tarikh: dateStr_(r.tarikh),
    jenis: textVal_(r.jenis),
    pax: r.pax === '' || r.pax === null || r.pax === undefined ? null : Number(r.pax),
    keterangan: textVal_(r.keterangan),
    amaun_rm: Number(r.amaun_rm) || 0,
    status: status,
    submitted_at: isoStr_(r.submitted_at),
    approved_by_name: textVal_(r.approved_by_name),
    approved_at: approvedAt,
    sebab_tolak: textVal_(r.sebab_tolak),
    received_date: dateStr_(r.received_date),
    received_amount_rm: r.received_amount_rm === '' || r.received_amount_rm === null || r.received_amount_rm === undefined ? null : Number(r.received_amount_rm),
    beza_bayaran: truthy_(r.beza_bayaran),
    ada_resit: String(r.receipt_file_id || '') !== '',
    ada_bukti: String(r.received_proof_file_id || '') !== '',
    milik_saya: mine,
    boleh_ubah: mine && status === 'Draf',
    boleh_sahkan: mine && status === 'Lulus',
    hari_lulus: status === 'Lulus' && !isNaN(ap) ? Math.floor((Date.now() - ap) / 864e5) : null,
    dikemas_kini: isoStr_(r.updated_at)
  };
}

/** Terbaru dahulu. Cap masa sama (saat yang sama): ID lebih besar dahulu, supaya susunan stabil. */
function newestFirst_(a, b) {
  return isoStr_(b.updated_at).localeCompare(isoStr_(a.updated_at)) || String(b.claim_id).localeCompare(String(a.claim_id));
}

// ---------------------------------------------------------------- jenis tuntutan

function typePublic_(t) { return { jenis: t.jenis, had_rm: t.had_rm, perlu_resit: t.perlu_resit, aktif: t.aktif }; }

function listClaimTypes_(ss, user) {
  var all = readTypes_(ss);
  return (hasAdmin_(user) ? all : all.filter(function (t) { return t.aktif; })).map(typePublic_);
}

/** payload: { jenis, had_rm?, perlu_resit, aktif }. Cipta jika belum ada, kemas kini jika ada (nama tak boleh ditukar). */
function saveClaimType_(ss, user, p) {
  requireAdmin_(user, 'saveClaimType');
  var jenis = String(p.jenis || '').trim();
  if (jenis.length < LIMITS.jenis_min || jenis.length > LIMITS.jenis_max) throw httpError_(400, 'Nama jenis mesti ' + LIMITS.jenis_min + '-' + LIMITS.jenis_max + ' aksara');
  var had = '';
  if (p.had_rm !== '' && p.had_rm !== null && p.had_rm !== undefined) had = money_(p.had_rm, 'Had RM', LIMITS.amaun);
  var sh = sheet_(ss, 'ClaimTypes');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var row = t.rows.filter(function (r) { return !isDeleted_(r) && String(unsanitize_(r.jenis)).trim().toLowerCase() === jenis.toLowerCase(); })[0];
    var fields = { had_rm: had, perlu_resit: p.perlu_resit === false ? 'FALSE' : 'TRUE', aktif: p.aktif === false ? 'FALSE' : 'TRUE', updated_at: nowIso_(), updated_by: user.email };
    if (row) {
      updateRowObj_(sh, t.header, row._row, fields);
    } else {
      appendObj_(sh, t.header, Object.assign({ jenis: jenis, created_at: nowIso_(), created_by: user.email, deleted: 'FALSE', deleted_reason: '' }, fields));
    }
    audit_(user.email, row ? 'UPDATE_TYPE' : 'CREATE_TYPE', jenis, 'had=' + had + '; resit=' + fields.perlu_resit + '; aktif=' + fields.aktif);
  } finally {
    lock.releaseLock();
  }
  return listClaimTypes_(ss, user);
}

// ---------------------------------------------------------------- tuntutan saya (F-50)

function listMyClaims_(ss, user, p) {
  var status = String(p.status || '');
  var rows = readTable_(sheet_(ss, 'Claims')).rows.filter(function (r) {
    return !isDeleted_(r) && String(r.claim_id) && String(r.staff_email) === String(user.email) && (!status || String(r.status) === status);
  });
  rows.sort(newestFirst_);
  return rows.slice(0, 500).map(function (r) { return claimPublic_(r, user); });
}

function approvalsFor_(ss, claim) {
  return readTable_(sheet_(ss, 'Approvals')).rows.filter(function (a) { return String(a.claim_id) === String(claim.claim_id); })
    .sort(function (a, b) { return isoStr_(a.ts).localeCompare(isoStr_(b.ts)); })
    .map(function (a) {
      var who = String(a.oleh_email) === String(claim.staff_email) ? textVal_(claim.staff_name) : (String(a.oleh_email) === String(claim.approved_by) ? textVal_(claim.approved_by_name) : 'Admin');
      return { dari: String(a.dari_status), ke: String(a.ke_status), oleh: who, ts: isoStr_(a.ts), catatan: textVal_(a.catatan) };
    });
}

function getClaim_(ss, user, p) {
  var r = findClaim_(readTable_(sheet_(ss, 'Claims')), p.claim_id);
  if (!r) throw httpError_(404, 'Tuntutan tidak dijumpai');
  if (String(r.staff_email) !== String(user.email) && !hasAdmin_(user)) {
    audit_(user.email, 'FORBIDDEN', 'getClaim', String(p.claim_id));
    throw httpError_(403, 'Tiada kebenaran');
  }
  var out = claimPublic_(r, user);
  out.sejarah = approvalsFor_(ss, r);
  return out;
}

function cleanClaim_(p, types) {
  var jenis = String(p.jenis || '').trim();
  var type = types.filter(function (t) { return t.jenis === jenis && t.aktif; })[0];
  if (!type) throw httpError_(400, 'Jenis tuntutan tak sah');
  var tarikh = String(p.tarikh || '').trim();
  if (!validDate_(tarikh)) throw httpError_(400, 'Tarikh perbelanjaan mesti tarikh sah (YYYY-MM-DD)');
  if (tarikh > todayIso_()) throw httpError_(400, 'Tarikh perbelanjaan tak boleh pada masa depan');
  if (tarikh < MIN_DATE) throw httpError_(400, 'Tarikh perbelanjaan terlalu lama');
  var keterangan = String(p.keterangan === null || p.keterangan === undefined ? '' : p.keterangan).trim();
  if (!keterangan) throw httpError_(400, 'Keterangan wajib diisi');
  if (keterangan.length > LIMITS.keterangan) throw httpError_(400, 'Keterangan maksimum ' + LIMITS.keterangan + ' aksara');
  var amaun = money_(p.amaun_rm, 'Amaun', LIMITS.amaun);
  if (type.had_rm !== null && amaun > type.had_rm) throw httpError_(400, 'Amaun melebihi had jenis "' + type.jenis + '" (RM ' + type.had_rm.toFixed(2) + ')');
  var pax = '';
  if (p.pax !== '' && p.pax !== null && p.pax !== undefined) {
    var n = Number(p.pax);
    if (!isFinite(n) || n < 1 || n > LIMITS.pax || Math.floor(n) !== n) throw httpError_(400, 'Pax mesti nombor bulat 1 atau lebih');
    pax = n;
  }
  return { type: type, jenis: jenis, tarikh: tarikh, keterangan: keterangan, amaun_rm: amaun, pax: pax };
}

/**
 * payload: { claim_id?, tarikh, jenis, pax?, keterangan, amaun_rm, resit?: {data(base64)}, buang_resit?: bool, hantar?: bool }
 * Identiti (emel, nama, department) dari sesi, bukan input. Draf sahaja boleh diubah.
 * Fail disimpan SEBELUM kunci (muat naik Drive lambat); jika semakan akhir gagal, fail dibuang semula.
 */
function saveClaim_(ss, user, p) {
  var c = cleanClaim_(p, readTypes_(ss));
  var hantar = p.hantar === true;
  var upload = p.resit ? parseUpload_(p.resit, 'Resit') : null;
  var sh = sheet_(ss, 'Claims');
  var id = String(p.claim_id || '').trim();

  if (id) {
    var pre = findClaim_(readTable_(sh), id);
    if (!pre) throw httpError_(404, 'Tuntutan tidak dijumpai');
    if (String(pre.staff_email) !== String(user.email)) {
      audit_(user.email, 'FORBIDDEN', 'saveClaim', id);
      throw httpError_(403, 'Tiada kebenaran');
    }
    if (String(pre.status) !== 'Draf') throw httpError_(409, 'Hanya tuntutan berstatus Draf boleh diubah');
    var keepOld = String(pre.receipt_file_id || '') !== '' && p.buang_resit !== true && !upload;
    if (hantar && c.type.perlu_resit && !upload && !keepOld) throw httpError_(400, 'Resit wajib untuk jenis "' + c.jenis + '"');
  } else {
    if (hantar && c.type.perlu_resit && !upload) throw httpError_(400, 'Resit wajib untuk jenis "' + c.jenis + '"');
    id = nextId_(ss, 'CLM', 5);
  }

  var newFileId = upload ? storeFile_(upload, id, 'resit') : '';
  var oldFileId = '';
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var cur = findClaim_(t, id);
    if (cur && (String(cur.staff_email) !== String(user.email) || String(cur.status) !== 'Draf')) {
      throw httpError_(409, 'Tuntutan telah berubah. Muat semula halaman.');
    }
    var now = nowIso_();
    var fileId = cur ? String(cur.receipt_file_id || '') : '';
    oldFileId = fileId;
    if (newFileId) fileId = newFileId;
    else if (p.buang_resit === true) fileId = '';
    var fields = {
      staff_id: String(user.staff_id || ''), staff_name: String(user.nama || ''), department: String(user.department || ''),
      tarikh: c.tarikh, jenis: c.jenis, pax: c.pax, keterangan: c.keterangan, amaun_rm: c.amaun_rm,
      receipt_file_id: fileId, status: hantar ? 'Dihantar' : 'Draf', updated_at: now, updated_by: user.email
    };
    if (hantar) fields.submitted_at = now;
    if (cur) {
      updateRowObj_(sh, t.header, cur._row, fields);
      saved = Object.assign({}, cur, fields);
    } else {
      saved = Object.assign({ claim_id: id, staff_email: user.email, beza_bayaran: 'FALSE', created_at: now, created_by: user.email, deleted: 'FALSE', deleted_reason: '' }, fields);
      appendObj_(sh, t.header, saved);
    }
    if (hantar) addApproval_(ss, id, 'Draf', 'Dihantar', user.email, '');
  } catch (e) {
    trashFile_(newFileId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  if (oldFileId && oldFileId !== String(saved.receipt_file_id || '')) trashFile_(oldFileId);
  audit_(user.email, hantar ? 'SUBMIT' : 'SAVE_DRAFT', id, 'jenis=' + c.jenis + '; amaun=' + c.amaun_rm);
  if (hantar) notifyAdminsSubmitted_(ss, saved);
  return claimPublic_(saved, user);
}

function deleteClaim_(ss, user, p) {
  var sh = sheet_(ss, 'Claims');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var fileId = '';
  try {
    var t = readTable_(sh);
    var r = findClaim_(t, p.claim_id);
    if (!r) throw httpError_(404, 'Tuntutan tidak dijumpai');
    if (String(r.staff_email) !== String(user.email)) {
      audit_(user.email, 'FORBIDDEN', 'deleteClaim', String(p.claim_id));
      throw httpError_(403, 'Tiada kebenaran');
    }
    if (String(r.status) !== 'Draf') throw httpError_(409, 'Hanya tuntutan berstatus Draf boleh dipadam');
    fileId = String(r.receipt_file_id || '');
    updateRowObj_(sh, t.header, r._row, { deleted: 'TRUE', deleted_reason: 'Draf dipadam oleh staf', receipt_file_id: '', updated_at: nowIso_(), updated_by: user.email });
  } finally {
    lock.releaseLock();
  }
  trashFile_(fileId);
  audit_(user.email, 'DELETE_DRAFT', String(p.claim_id), '');
  return true;
}

// ---------------------------------------------------------------- fail

/** payload: { claim_id, jenis: 'resit'|'bukti' }. Pemilik atau Admin ClaimPro sahaja. Setiap bacaan direkod (PDPA). */
function getFile_(ss, user, p) {
  var r = findClaim_(readTable_(sheet_(ss, 'Claims')), p.claim_id);
  if (!r) throw httpError_(404, 'Tuntutan tidak dijumpai');
  if (String(r.staff_email) !== String(user.email) && !hasAdmin_(user)) {
    audit_(user.email, 'FORBIDDEN', 'getFile', String(p.claim_id));
    throw httpError_(403, 'Tiada kebenaran');
  }
  var kind = p.jenis === 'bukti' ? 'bukti' : 'resit';
  var fileId = String(kind === 'bukti' ? r.received_proof_file_id : r.receipt_file_id) || '';
  if (!fileId) throw httpError_(404, kind === 'bukti' ? 'Tiada bukti bayaran' : 'Tiada resit');
  audit_(user.email, 'VIEW_FILE', String(r.claim_id), kind);
  return readFile_(fileId);
}

// ---------------------------------------------------------------- kelulusan (F-51)

/** Sebab admin ini tak boleh lulus tuntutan tu. '' = boleh. Digunakan oleh senarai DAN keputusan (satu sumber). */
function cannotApproveReason_(claim, user) {
  if (isKetua_(user)) return '';   // Head of HR: semua, termasuk tuntutan sendiri
  if (String(claim.staff_email) === String(user.email)) return 'Tuntutan sendiri hanya boleh diluluskan Head of HR';
  if (String(claim.department) === 'HR') return 'Tuntutan staf HR hanya boleh diluluskan Head of HR';
  return '';
}

function listPending_(ss, user) {
  requireAdmin_(user, 'listPending');
  var rows = readTable_(sheet_(ss, 'Claims')).rows.filter(function (r) { return !isDeleted_(r) && String(r.claim_id) && String(r.status) === 'Dihantar'; });
  rows.sort(function (a, b) { return isoStr_(a.submitted_at).localeCompare(isoStr_(b.submitted_at)); });
  return rows.slice(0, 500).map(function (r) {
    var out = claimPublic_(r, user);
    out.sebab_tak_boleh = cannotApproveReason_(r, user);
    out.boleh_lulus = out.sebab_tak_boleh === '';
    return out;
  });
}

/** payload: { claim_id, keputusan: 'Lulus'|'Ditolak', sebab? (wajib bila Ditolak), catatan? } */
function decideClaim_(ss, user, p) {
  requireAdmin_(user, 'decideClaim');
  var keputusan = String(p.keputusan || '');
  if (keputusan !== 'Lulus' && keputusan !== 'Ditolak') throw httpError_(400, 'Keputusan mesti Lulus atau Ditolak');
  var sebab = String(p.sebab || '').trim();
  if (keputusan === 'Ditolak' && sebab.length < 3) throw httpError_(400, 'Sebab wajib diisi bila menolak (minimum 3 aksara)');
  if (sebab.length > LIMITS.sebab) throw httpError_(400, 'Sebab maksimum ' + LIMITS.sebab + ' aksara');
  var sh = sheet_(ss, 'Claims');
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var r = findClaim_(t, p.claim_id);
    if (!r) throw httpError_(404, 'Tuntutan tidak dijumpai');
    var why = cannotApproveReason_(r, user);
    if (why) {
      audit_(user.email, 'FORBIDDEN', 'decideClaim', String(r.claim_id) + ': ' + why);
      throw httpError_(403, why);
    }
    if (String(r.status) !== 'Dihantar') throw httpError_(409, 'Tuntutan ini sudah diputuskan atau belum dihantar');
    var now = nowIso_();
    var fields = {
      status: keputusan, approved_by: user.email, approved_by_name: String(user.nama || ''), approved_at: now,
      sebab_tolak: keputusan === 'Ditolak' ? sebab : '', updated_at: now, updated_by: user.email
    };
    updateRowObj_(sh, t.header, r._row, fields);
    addApproval_(ss, String(r.claim_id), 'Dihantar', keputusan, user.email, String(p.catatan || sebab).slice(0, LIMITS.sebab));
    saved = Object.assign({}, r, fields);
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'DECIDE', String(saved.claim_id), keputusan);
  notifyStaffDecision_(ss, saved);
  return claimPublic_(saved, user);
}

// ---------------------------------------------------------------- sahkan terima bayaran (F-52, S-53)

/**
 * payload: { claim_id, received_date (YYYY-MM-DD), received_amount_rm, bukti?: {data} }
 * Hanya staf PEMILIK, hanya bila status Lulus. Jumlah berbeza -> beza_bayaran = TRUE dan emel Admin.
 */
function confirmReceived_(ss, user, p) {
  var sh = sheet_(ss, 'Claims');
  var pre = findClaim_(readTable_(sh), p.claim_id);
  if (!pre) throw httpError_(404, 'Tuntutan tidak dijumpai');
  if (String(pre.staff_email) !== String(user.email)) {
    audit_(user.email, 'FORBIDDEN', 'confirmReceived', String(p.claim_id));
    throw httpError_(403, 'Hanya pemilik tuntutan boleh mengesahkan terima bayaran');
  }
  if (String(pre.status) !== 'Lulus') throw httpError_(409, 'Hanya tuntutan berstatus Lulus boleh disahkan');
  var date = String(p.received_date || '').trim();
  if (!validDate_(date)) throw httpError_(400, 'Tarikh terima mesti tarikh sah (YYYY-MM-DD)');
  if (date > todayIso_()) throw httpError_(400, 'Tarikh terima tak boleh pada masa depan');
  if (date < isoStr_(pre.approved_at).slice(0, 10)) throw httpError_(400, 'Tarikh terima tak boleh sebelum tarikh kelulusan');
  var amount = money_(p.received_amount_rm, 'Jumlah diterima', LIMITS.amaun);
  var proof = p.bukti ? parseUpload_(p.bukti, 'Bukti') : null;
  var proofId = proof ? storeFile_(proof, String(pre.claim_id), 'bukti') : '';

  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var r = findClaim_(t, p.claim_id);
    if (!r || String(r.staff_email) !== String(user.email) || String(r.status) !== 'Lulus') throw httpError_(409, 'Tuntutan telah berubah. Muat semula halaman.');
    var beza = round2_(amount) !== round2_(r.amaun_rm);
    var fields = {
      status: 'Dibayar', received_date: date, received_amount_rm: amount, received_proof_file_id: proofId,
      beza_bayaran: beza ? 'TRUE' : 'FALSE', updated_at: nowIso_(), updated_by: user.email
    };
    updateRowObj_(sh, t.header, r._row, fields);
    addApproval_(ss, String(r.claim_id), 'Lulus', 'Dibayar', user.email, 'Staf sahkan terima RM ' + amount.toFixed(2));
    saved = Object.assign({}, r, fields);
  } catch (e) {
    trashFile_(proofId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'CONFIRM_RECEIVED', String(saved.claim_id), 'diterima=' + amount + '; beza=' + saved.beza_bayaran);
  if (truthy_(saved.beza_bayaran)) notifyBeza_(ss, saved);
  return claimPublic_(saved, user);
}

// ---------------------------------------------------------------- senarai bayaran & laporan (F-52, F-53)

/** "Lulus, belum dibayar/disahkan": untuk HR buat pindahan wang di luar sistem, dan semak yang tersangkut. */
function listToPay_(ss, user) {
  requireAdmin_(user, 'listToPay');
  var rows = readTable_(sheet_(ss, 'Claims')).rows.filter(function (r) { return !isDeleted_(r) && String(r.claim_id) && String(r.status) === 'Lulus'; });
  rows.sort(function (a, b) { return isoStr_(a.approved_at).localeCompare(isoStr_(b.approved_at)); });
  var list = rows.slice(0, 1000).map(function (r) { return claimPublic_(r, user); });
  return { jumlah_rm: round2_(list.reduce(function (a, c) { return a + c.amaun_rm; }, 0)), tuntutan: list };
}

/** payload: { bulan?: 'YYYY-MM' (ikut tarikh perbelanjaan), jenis?, status?, department? } */
function claimReport_(ss, user, p) {
  requireAdmin_(user, 'claimReport');
  var bulan = String(p.bulan || '');
  if (bulan && !/^\d{4}-\d{2}$/.test(bulan)) throw httpError_(400, 'Bulan mesti format YYYY-MM');
  var jenis = String(p.jenis || ''), status = String(p.status || ''), dept = String(p.department || '');
  var rows = readTable_(sheet_(ss, 'Claims')).rows.filter(function (r) {
    if (isDeleted_(r) || !String(r.claim_id) || String(r.status) === 'Draf') return false;
    if (bulan && dateStr_(r.tarikh).slice(0, 7) !== bulan) return false;
    if (jenis && textVal_(r.jenis) !== jenis) return false;
    if (status && String(r.status) !== status) return false;
    if (dept && String(r.department) !== dept) return false;
    return true;
  });
  rows.sort(function (a, b) { return dateStr_(b.tarikh).localeCompare(dateStr_(a.tarikh)); });
  var limited = rows.slice(0, LIMITS.laporan_baris);
  var list = limited.map(function (r) { return claimPublic_(r, user); });
  var byStatus = {}, byJenis = {}, total = 0, beza = 0;
  list.forEach(function (c) {
    total += c.amaun_rm;
    if (c.beza_bayaran) beza++;
    byStatus[c.status] = byStatus[c.status] || { bilangan: 0, jumlah_rm: 0 };
    byStatus[c.status].bilangan++; byStatus[c.status].jumlah_rm = round2_(byStatus[c.status].jumlah_rm + c.amaun_rm);
    byJenis[c.jenis] = byJenis[c.jenis] || { bilangan: 0, jumlah_rm: 0 };
    byJenis[c.jenis].bilangan++; byJenis[c.jenis].jumlah_rm = round2_(byJenis[c.jenis].jumlah_rm + c.amaun_rm);
  });
  return {
    bilangan: list.length, terpotong: rows.length > list.length, jumlah_rm: round2_(total), beza_bayaran: beza,
    ikut_status: byStatus, ikut_jenis: byJenis, tuntutan: list
  };
}
