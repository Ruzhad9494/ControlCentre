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
  recordPayment:   ['admin', 'ketua'],
  listToPay:       ['admin', 'ketua'],
  claimReport:     ['admin', 'ketua']
};

// Had input ikut sistem ClaimPro lama: MAX_CLAIM_AMOUNT 50000, pax 1-100 (validateClaimRules)
var LIMITS = { keterangan: 500, sebab: 300, amaun: 50000, pax: 100, jenis_min: 2, jenis_max: 40, laporan_baris: 2000, bayar_kelompok: 50 };
var SESI_MAKAN = ['siang', 'malam', 'siang+malam'];
var SESI_LABEL = { siang: 'Siang', malam: 'Malam', 'siang+malam': 'Siang + Malam' };
// Status yang dikira dalam had tahunan (Draf dan Ditolak tidak dikira)
var COUNTED_STATUS = ['Dihantar', 'Lulus', 'Dibayar'];
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
    case 'listClaimTypes':  return listClaimTypes_(ss, user, p);
    case 'saveClaimType':   return saveClaimType_(ss, user, p);
    case 'listMyClaims':    return listMyClaims_(ss, user, p);
    case 'getClaim':        return getClaim_(ss, user, p);
    case 'saveClaim':       return saveClaim_(ss, user, p);
    case 'deleteClaim':     return deleteClaim_(ss, user, p);
    case 'getFile':         return getFile_(ss, user, p);
    case 'confirmReceived': return confirmReceived_(ss, user, p);
    case 'listPending':     return listPending_(ss, user);
    case 'decideClaim':     return decideClaim_(ss, user, p);
    case 'recordPayment':   return recordPayment_(ss, user, p);
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

function numOrNull_(v) {
  var x = v === '' || v === null || v === undefined ? NaN : Number(v);
  return isFinite(x) && x > 0 ? x : null;
}

function readTypes_(ss) {
  return readTable_(sheet_(ss, 'ClaimTypes')).rows.filter(function (r) { return !isDeleted_(r) && String(r.jenis).trim(); }).map(function (r) {
    return {
      jenis: String(unsanitize_(r.jenis)).trim(), had_rm: numOrNull_(r.had_rm), had_tahunan_rm: numOrNull_(r.had_tahunan_rm),
      guna_sesi_makan: truthy_(r.guna_sesi_makan), perlu_resit: truthy_(r.perlu_resit), aktif: truthy_(r.aktif), _row: r._row
    };
  });
}

/** Kadar makan setiap pax (tab Settings). Nilai lalai = sistem lama (MEAL_RATE_SIANG/MALAM/BOTH). */
function mealRates_(ss) {
  var s = settingsMap_(ss);
  var pick = function (k, d) { var x = Number(s[k]); return s[k] !== undefined && s[k] !== '' && isFinite(x) && x > 0 ? x : d; };
  return { siang: pick('kadar_makan_siang', 10), malam: pick('kadar_makan_malam', 15), kedua: pick('kadar_makan_kedua', 25) };
}

function mealCap_(rates, sesi, pax) {
  var r = sesi === 'siang+malam' ? rates.kedua : sesi === 'malam' ? rates.malam : sesi === 'siang' ? rates.siang : 0;
  return round2_(r * pax);
}

/** Jumlah tuntutan staf bagi jenis & tahun (tarikh perbelanjaan) yang dah dihantar/lulus/dibayar. */
function annualUsed_(rows, email, jenis, year, excludeId) {
  return round2_(rows.reduce(function (sum, r) {
    if (isDeleted_(r) || String(r.staff_email) !== String(email) || textVal_(r.jenis) !== jenis) return sum;
    if (COUNTED_STATUS.indexOf(String(r.status)) < 0) return sum;
    if (excludeId && String(r.claim_id) === String(excludeId)) return sum;
    if (dateStr_(r.tarikh).slice(0, 4) !== String(year)) return sum;
    return sum + (Number(r.amaun_rm) || 0);
  }, 0));
}

/** Had tahunan (sistem lama: ANNUAL_MEDICAL_LIMIT RM350 untuk Perubatan). */
function checkAnnual_(rows, email, c, excludeId) {
  var cap = c.type.had_tahunan_rm;
  if (cap === null) return;
  var year = c.tarikh.slice(0, 4);
  var baki = round2_(cap - annualUsed_(rows, email, c.jenis, year, excludeId));
  if (c.amaun_rm > baki + 0.001) {
    throw httpError_(400, 'Melebihi had tahunan ' + c.jenis + ': baki ' + year + ' tinggal RM ' + Math.max(0, baki).toFixed(2));
  }
}

/** Sheet lama (disetup sebelum lajur baharu ditambah) -> mesej jelas, bukan ralat dalaman. */
function columnsReady_(t, cols) {
  var missing = cols.filter(function (c) { return t.header.indexOf(c) < 0; });
  if (missing.length) throw httpError_(503, 'Sheet ClaimPro belum dikemas kini (' + missing.join(', ') + '). Minta IT jalankan setupSystem().');
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
    bil_resit: fileIds_(r.receipt_file_id).length,
    ada_resit: fileIds_(r.receipt_file_id).length > 0,
    sesi_makan: String(r.sesi_makan || ''),
    separa: r.paid_amount_rm !== '' && r.paid_amount_rm !== null && r.paid_amount_rm !== undefined && Number(r.paid_amount_rm) < round2_(r.amaun_rm) - 0.001,
    ada_bukti: String(r.received_proof_file_id || '') !== '',
    ada_bukti_bayar: String(r.paid_proof_file_id || '') !== '',
    bayar_tarikh: dateStr_(r.paid_date),
    bayar_jumlah_rm: r.paid_amount_rm === '' || r.paid_amount_rm === null || r.paid_amount_rm === undefined ? null : Number(r.paid_amount_rm),
    bayar_oleh_nama: textVal_(r.paid_by_name),
    boleh_rekod_bayar: status === 'Lulus' && hasAdmin_(user) && cannotApproveReason_(r, user) === '',
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

function typePublic_(t) {
  return { jenis: t.jenis, had_rm: t.had_rm, had_tahunan_rm: t.had_tahunan_rm, guna_sesi_makan: t.guna_sesi_makan, perlu_resit: t.perlu_resit, aktif: t.aktif };
}

/**
 * payload: { tahun? } (lalai tahun semasa). Untuk jenis dengan had tahunan: digunakan_rm & baki_rm pemanggil
 * (sistem lama papar baki perubatan). Untuk jenis sesi makan: kadar_makan.
 */
function listClaimTypes_(ss, user, p) {
  var all = readTypes_(ss);
  var list = hasAdmin_(user) ? all : all.filter(function (t) { return t.aktif; });
  var year = /^\d{4}$/.test(String((p && p.tahun) || '')) ? String(p.tahun) : todayIso_().slice(0, 4);
  var rows = list.some(function (t) { return t.had_tahunan_rm !== null; }) ? readTable_(sheet_(ss, 'Claims')).rows : [];
  var rates = list.some(function (t) { return t.guna_sesi_makan; }) ? mealRates_(ss) : null;
  return list.map(function (t) {
    var o = typePublic_(t);
    if (t.had_tahunan_rm !== null) {
      var used = annualUsed_(rows, user.email, t.jenis, year, null);
      o.tahun = year;
      o.digunakan_rm = used;
      o.baki_rm = round2_(Math.max(0, t.had_tahunan_rm - used));
    }
    if (t.guna_sesi_makan) o.kadar_makan = rates;
    return o;
  });
}

/** payload: { jenis, had_rm?, had_tahunan_rm?, guna_sesi_makan, perlu_resit, aktif }. Cipta/kemas kini (nama tak boleh ditukar). */
function saveClaimType_(ss, user, p) {
  requireAdmin_(user, 'saveClaimType');
  var jenis = String(p.jenis || '').trim();
  if (jenis.length < LIMITS.jenis_min || jenis.length > LIMITS.jenis_max) throw httpError_(400, 'Nama jenis mesti ' + LIMITS.jenis_min + '-' + LIMITS.jenis_max + ' aksara');
  var opt = function (v, label) { return v !== '' && v !== null && v !== undefined ? money_(v, label, LIMITS.amaun) : ''; };
  var had = opt(p.had_rm, 'Had setiap tuntutan');
  var hadTahunan = opt(p.had_tahunan_rm, 'Had tahunan');
  var sh = sheet_(ss, 'ClaimTypes');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    columnsReady_(t, ['had_tahunan_rm', 'guna_sesi_makan']);
    var row = t.rows.filter(function (r) { return !isDeleted_(r) && String(unsanitize_(r.jenis)).trim().toLowerCase() === jenis.toLowerCase(); })[0];
    var fields = {
      had_rm: had, had_tahunan_rm: hadTahunan, guna_sesi_makan: p.guna_sesi_makan === true ? 'TRUE' : 'FALSE',
      perlu_resit: p.perlu_resit === false ? 'FALSE' : 'TRUE', aktif: p.aktif === false ? 'FALSE' : 'TRUE', updated_at: nowIso_(), updated_by: user.email
    };
    if (row) {
      updateRowObj_(sh, t.header, row._row, fields);
    } else {
      appendObj_(sh, t.header, Object.assign({ jenis: jenis, created_at: nowIso_(), created_by: user.email, deleted: 'FALSE', deleted_reason: '' }, fields));
    }
    audit_(user.email, row ? 'UPDATE_TYPE' : 'CREATE_TYPE', jenis,
      'had=' + had + '; had_tahunan=' + hadTahunan + '; sesi_makan=' + fields.guna_sesi_makan + '; resit=' + fields.perlu_resit + '; aktif=' + fields.aktif);
  } finally {
    lock.releaseLock();
  }
  return listClaimTypes_(ss, user, {});
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

/** Validasi ikut sistem lama (validateClaimRules) + had jenis. Had tahunan disemak dalam kunci (checkAnnual_). */
function cleanClaim_(p, types, rates) {
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
  var pax = Number(p.pax);
  if (p.pax === '' || p.pax === null || p.pax === undefined || !isFinite(pax) || Math.floor(pax) !== pax || pax < 1 || pax > LIMITS.pax) {
    throw httpError_(400, 'Pax mesti nombor bulat 1 hingga ' + LIMITS.pax);
  }
  if (type.had_rm !== null && amaun > type.had_rm) throw httpError_(400, 'Amaun melebihi had jenis "' + type.jenis + '" (RM ' + type.had_rm.toFixed(2) + ')');
  var sesi = '';
  if (type.guna_sesi_makan) {
    sesi = String(p.sesi_makan || '');
    if (SESI_MAKAN.indexOf(sesi) < 0) throw httpError_(400, 'Sila pilih sesi makan (Siang / Malam)');
    var cap = mealCap_(rates, sesi, pax);
    if (amaun > cap + 0.001) throw httpError_(400, 'Melebihi had makan RM ' + cap.toFixed(2) + ' (' + SESI_LABEL[sesi] + ', ' + pax + ' pax)');
  }
  return { type: type, jenis: jenis, tarikh: tarikh, keterangan: keterangan, amaun_rm: amaun, pax: pax, sesi_makan: sesi };
}

/**
 * payload: { claim_id?, tarikh, jenis, pax, sesi_makan?, keterangan, amaun_rm,
 *            resit?: {data} | [{data}, ...] (ditambah ke resit sedia ada, maksimum 10 semua),
 *            buang_resit?: true (semua) | [indeks, ...], hantar?: bool }
 * Identiti dari sesi, bukan input. Draf sahaja boleh diubah. Hantar perlukan sekurang-kurangnya satu resit
 * (sistem lama: handleSubmitClaim). Fail disimpan SEBELUM kunci; jika semakan akhir gagal, fail dibuang semula.
 */
function saveClaim_(ss, user, p) {
  var c = cleanClaim_(p, readTypes_(ss), mealRates_(ss));
  var hantar = p.hantar === true;
  var uploads = parseUploads_(p.resit, 'Resit');
  var sh = sheet_(ss, 'Claims');
  var id = String(p.claim_id || '').trim();
  var removeAll = p.buang_resit === true;
  var removeIdx = Array.isArray(p.buang_resit) ? p.buang_resit.map(Number) : [];
  var keep = function (ids) { return removeAll ? [] : ids.filter(function (_, i) { return removeIdx.indexOf(i) < 0; }); };

  var keptBefore = [];
  if (id) {
    var pre = findClaim_(readTable_(sh), id);
    if (!pre) throw httpError_(404, 'Tuntutan tidak dijumpai');
    if (String(pre.staff_email) !== String(user.email)) {
      audit_(user.email, 'FORBIDDEN', 'saveClaim', id);
      throw httpError_(403, 'Tiada kebenaran');
    }
    if (String(pre.status) !== 'Draf') throw httpError_(409, 'Hanya tuntutan berstatus Draf boleh diubah');
    keptBefore = keep(fileIds_(pre.receipt_file_id));
  }
  if (keptBefore.length + uploads.length > MAX_FILES_PER_CLAIM) throw httpError_(400, 'Maksimum ' + MAX_FILES_PER_CLAIM + ' fail satu tuntutan');
  if (hantar && c.type.perlu_resit && keptBefore.length + uploads.length === 0) throw httpError_(400, 'Sekurang-kurangnya satu resit diperlukan untuk jenis "' + c.jenis + '"');
  if (!id) id = nextId_(ss, 'CLM', 5);

  var newIds = uploads.map(function (u) { return storeFile_(u, id, 'resit'); });
  var removed = [];
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    columnsReady_(t, ['sesi_makan']);
    var cur = findClaim_(t, id);
    if (cur && (String(cur.staff_email) !== String(user.email) || String(cur.status) !== 'Draf')) {
      throw httpError_(409, 'Tuntutan telah berubah. Muat semula halaman.');
    }
    var curIds = cur ? fileIds_(cur.receipt_file_id) : [];
    var kept = keep(curIds);
    if (kept.length + newIds.length > MAX_FILES_PER_CLAIM) throw httpError_(400, 'Maksimum ' + MAX_FILES_PER_CLAIM + ' fail satu tuntutan');
    checkAnnual_(t.rows, user.email, c, id);
    removed = curIds.filter(function (f) { return kept.indexOf(f) < 0; });
    var now = nowIso_();
    var fields = {
      staff_id: String(user.staff_id || ''), staff_name: String(user.nama || ''), department: String(user.department || ''),
      tarikh: c.tarikh, jenis: c.jenis, pax: c.pax, sesi_makan: c.sesi_makan, keterangan: c.keterangan, amaun_rm: c.amaun_rm,
      receipt_file_id: kept.concat(newIds).join(','), status: hantar ? 'Dihantar' : 'Draf', updated_at: now, updated_by: user.email
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
    newIds.forEach(trashFile_);
    throw e;
  } finally {
    lock.releaseLock();
  }
  removed.forEach(trashFile_);
  audit_(user.email, hantar ? 'SUBMIT' : 'SAVE_DRAFT', id, 'jenis=' + c.jenis + '; amaun=' + c.amaun_rm + '; resit=' + fileIds_(saved.receipt_file_id).length);
  if (hantar) notifyAdminsSubmitted_(ss, saved);
  return claimPublic_(saved, user);
}

function deleteClaim_(ss, user, p) {
  var sh = sheet_(ss, 'Claims');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var files = [];
  try {
    var t = readTable_(sh);
    var r = findClaim_(t, p.claim_id);
    if (!r) throw httpError_(404, 'Tuntutan tidak dijumpai');
    if (String(r.staff_email) !== String(user.email)) {
      audit_(user.email, 'FORBIDDEN', 'deleteClaim', String(p.claim_id));
      throw httpError_(403, 'Tiada kebenaran');
    }
    if (String(r.status) !== 'Draf') throw httpError_(409, 'Hanya tuntutan berstatus Draf boleh dipadam');
    files = fileIds_(r.receipt_file_id);
    updateRowObj_(sh, t.header, r._row, { deleted: 'TRUE', deleted_reason: 'Draf dipadam oleh staf', receipt_file_id: '', updated_at: nowIso_(), updated_by: user.email });
  } finally {
    lock.releaseLock();
  }
  files.forEach(trashFile_);
  audit_(user.email, 'DELETE_DRAFT', String(p.claim_id), '');
  return true;
}

// ---------------------------------------------------------------- fail

/** payload: { claim_id, jenis: 'resit'|'bukti'|'bayaran', index? }. Pemilik atau pelulus sahaja. Setiap bacaan direkod (PDPA). */
function getFile_(ss, user, p) {
  var r = findClaim_(readTable_(sheet_(ss, 'Claims')), p.claim_id);
  if (!r) throw httpError_(404, 'Tuntutan tidak dijumpai');
  if (String(r.staff_email) !== String(user.email) && !hasAdmin_(user)) {
    audit_(user.email, 'FORBIDDEN', 'getFile', String(p.claim_id));
    throw httpError_(403, 'Tiada kebenaran');
  }
  var kind = p.jenis === 'bukti' || p.jenis === 'bayaran' ? p.jenis : 'resit';
  var ids = kind === 'resit' ? fileIds_(r.receipt_file_id) : fileIds_(kind === 'bukti' ? r.received_proof_file_id : r.paid_proof_file_id);
  if (!ids.length) throw httpError_(404, kind === 'bukti' ? 'Tiada bukti terima staf' : kind === 'bayaran' ? 'Tiada bukti bayaran syarikat' : 'Tiada resit');
  var idx = parseInt(p.index, 10) || 0;
  if (idx < 0 || idx >= ids.length) throw httpError_(404, 'Fail tidak dijumpai');
  audit_(user.email, 'VIEW_FILE', String(r.claim_id), kind + (kind === 'resit' ? ' #' + (idx + 1) : ''));
  return readFile_(ids[idx]);
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

function paidColumnsReady_(t) {
  columnsReady_(t, ['paid_proof_file_id', 'paid_by', 'paid_by_name', 'paid_date', 'paid_amount_rm', 'paid_recorded_at']);
}

/** Tarikh & jumlah bayaran syarikat. Lalai: hari ini, jumlah diluluskan. minDate (YYYY-MM-DD) pilihan. */
function cleanPaid_(p, claim, minDate) {
  var d = String(p.tarikh_bayar || todayIso_()).trim();
  if (!validDate_(d)) throw httpError_(400, 'Tarikh bayaran mesti tarikh sah (YYYY-MM-DD)');
  if (d > todayIso_()) throw httpError_(400, 'Tarikh bayaran tak boleh pada masa depan');
  if (minDate && d < minDate) throw httpError_(400, 'Tarikh bayaran tak boleh sebelum ' + minDate.split('-').reverse().join('/'));
  var raw = p.jumlah_dibayar_rm;
  var jumlah = (raw === '' || raw === null || raw === undefined) ? round2_(claim.amaun_rm) : money_(raw, 'Jumlah dibayar', LIMITS.amaun);
  // Sistem lama (handleUpdatePayment): bayaran tak boleh melebihi jumlah tuntutan; kurang = separa
  if (jumlah > round2_(claim.amaun_rm) + 0.001) throw httpError_(400, 'Jumlah dibayar ' + String(claim.claim_id) + ' melebihi jumlah tuntutan RM ' + round2_(claim.amaun_rm).toFixed(2));
  return { tarikh: d, jumlah: jumlah };
}

function paidFields_(fileId, user, c) {
  return { paid_proof_file_id: fileId, paid_by: user.email, paid_by_name: String(user.nama || ''), paid_date: c.tarikh, paid_amount_rm: c.jumlah, paid_recorded_at: nowIso_() };
}

/**
 * payload: { claim_id, keputusan: 'Lulus'|'Ditolak', sebab? (wajib bila Ditolak), catatan?,
 *            bayar?: { bukti: {data}, tarikh_bayar?, jumlah_dibayar_rm? } }
 * `bayar` (pilihan, hanya bila Lulus): rekod bukti bayaran syarikat serentak dengan kelulusan.
 */
function decideClaim_(ss, user, p) {
  requireAdmin_(user, 'decideClaim');
  var keputusan = String(p.keputusan || '');
  if (keputusan !== 'Lulus' && keputusan !== 'Ditolak') throw httpError_(400, 'Keputusan mesti Lulus atau Ditolak');
  var sebab = String(p.sebab || '').trim();
  if (keputusan === 'Ditolak' && sebab.length < 3) throw httpError_(400, 'Sebab wajib diisi bila menolak (minimum 3 aksara)');
  if (sebab.length > LIMITS.sebab) throw httpError_(400, 'Sebab maksimum ' + LIMITS.sebab + ' aksara');
  var bayar = p.bayar && typeof p.bayar === 'object' ? p.bayar : null;
  if (bayar && keputusan !== 'Lulus') throw httpError_(400, 'Bukti bayaran hanya untuk tuntutan yang diluluskan');
  var sh = sheet_(ss, 'Claims');

  var paid = null, paidFileId = '';
  if (bayar) {
    var pt = readTable_(sh);
    paidColumnsReady_(pt);
    var pre = findClaim_(pt, p.claim_id);
    if (!pre) throw httpError_(404, 'Tuntutan tidak dijumpai');
    var preWhy = cannotApproveReason_(pre, user);
    if (preWhy) { audit_(user.email, 'FORBIDDEN', 'decideClaim', String(pre.claim_id) + ': ' + preWhy); throw httpError_(403, preWhy); }
    paid = cleanPaid_(bayar, pre, isoStr_(pre.submitted_at).slice(0, 10));
    paidFileId = storeFile_(parseUpload_(bayar.bukti, 'Bukti bayaran'), String(pre.claim_id), 'bayaran');
  }

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
    if (paid) Object.assign(fields, paidFields_(paidFileId, user, paid));
    updateRowObj_(sh, t.header, r._row, fields);
    addApproval_(ss, String(r.claim_id), 'Dihantar', keputusan, user.email,
      String(p.catatan || sebab || (paid ? 'Lulus dengan bukti bayaran syarikat RM ' + paid.jumlah.toFixed(2) : '')).slice(0, LIMITS.sebab));
    saved = Object.assign({}, r, fields);
  } catch (e) {
    trashFile_(paidFileId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'DECIDE', String(saved.claim_id), keputusan + (paid ? '; bukti bayaran RM ' + paid.jumlah : ''));
  notifyStaffDecision_(ss, saved);
  return claimPublic_(saved, user);
}

/**
 * payload: { claims: [{ claim_id, jumlah_dibayar_rm? }, ...], bukti: {data}, tarikh_bayar? }
 *      atau { claim_id, jumlah_dibayar_rm?, bukti, tarikh_bayar? } untuk satu tuntutan.
 * Ikut sistem lama (handleUpdatePayment): SATU bukti pindahan untuk beberapa tuntutan seorang staf; setiap tuntutan
 * boleh dibayar kurang (separa) tapi tak boleh melebihi jumlahnya. Bukti WAJIB.
 * Bezanya dengan sistem lama: status TIDAK ditukar ke Dibayar; staf masih sahkan terima (asingan tugas).
 * Peraturan pelulus terpakai (admin tak boleh untuk tuntutan sendiri / staf HR; ketua boleh).
 */
function recordPayment_(ss, user, p) {
  requireAdmin_(user, 'recordPayment');
  var items = Array.isArray(p.claims) ? p.claims : (p.claim_id ? [{ claim_id: p.claim_id, jumlah_dibayar_rm: p.jumlah_dibayar_rm }] : []);
  if (!items.length) throw httpError_(400, 'Pilih sekurang-kurangnya satu tuntutan');
  if (items.length > LIMITS.bayar_kelompok) throw httpError_(400, 'Maksimum ' + LIMITS.bayar_kelompok + ' tuntutan satu bukti bayaran');
  if (!p.bukti) throw httpError_(400, 'Bukti bayaran wajib dimuat naik');
  var sh = sheet_(ss, 'Claims');
  var t0 = readTable_(sh);
  paidColumnsReady_(t0);

  var seen = {}, staffEmail = null, minDate = '';
  var plan = items.map(function (it) {
    var id = String((it && it.claim_id) || '').trim();
    if (!id) throw httpError_(400, 'claim_id wajib');
    if (seen[id]) throw httpError_(400, 'Tuntutan berulang: ' + id);
    seen[id] = true;
    var r = findClaim_(t0, id);
    if (!r) throw httpError_(404, 'Tuntutan tidak dijumpai: ' + id);
    var why = cannotApproveReason_(r, user);
    if (why) {
      audit_(user.email, 'FORBIDDEN', 'recordPayment', id + ': ' + why);
      throw httpError_(403, id + ': ' + why);
    }
    if (String(r.status) !== 'Lulus') throw httpError_(409, id + ': bukti bayaran hanya untuk tuntutan berstatus Lulus');
    if (staffEmail === null) staffEmail = String(r.staff_email);
    else if (String(r.staff_email) !== staffEmail) throw httpError_(400, 'Satu bukti bayaran hanya untuk tuntutan staf yang sama');
    var ad = isoStr_(r.approved_at).slice(0, 10);
    if (ad > minDate) minDate = ad;
    return { id: id, raw: it.jumlah_dibayar_rm, row: r };
  });
  var tarikh = cleanPaid_({ tarikh_bayar: p.tarikh_bayar }, plan[0].row, minDate).tarikh;
  plan.forEach(function (x) { x.jumlah = cleanPaid_({ tarikh_bayar: tarikh, jumlah_dibayar_rm: x.raw }, x.row, '').jumlah; });
  var fileId = storeFile_(parseUpload_(p.bukti, 'Bukti bayaran'), plan[0].id, 'bayaran');

  var saved = [], oldIds = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var rows = plan.map(function (x) {
      var r = findClaim_(t, x.id);
      if (!r || String(r.status) !== 'Lulus' || cannotApproveReason_(r, user)) throw httpError_(409, 'Tuntutan ' + x.id + ' telah berubah. Muat semula halaman.');
      return r;
    });
    plan.forEach(function (x, i) {
      var r = rows[i];
      var old = String(r.paid_proof_file_id || '');
      if (old) oldIds.push(old);
      var fields = Object.assign(paidFields_(fileId, user, { tarikh: tarikh, jumlah: x.jumlah }), { updated_at: nowIso_(), updated_by: user.email });
      updateRowObj_(sh, t.header, r._row, fields);
      var separa = x.jumlah < round2_(r.amaun_rm) - 0.001;
      addApproval_(ss, x.id, 'Lulus', 'Lulus', user.email,
        (old ? 'Bukti bayaran syarikat diganti' : 'Bukti bayaran syarikat dimuat naik') + ': RM ' + x.jumlah.toFixed(2) + ' pada ' + tarikh + (separa ? ' (separa)' : ''));
      saved.push(Object.assign({}, r, fields));
    });
    // Buang bukti lama hanya jika tiada tuntutan lain masih merujuknya (bukti boleh dikongsi beberapa tuntutan)
    var used = {};
    readTable_(sh).rows.forEach(function (r) { fileIds_(r.paid_proof_file_id).forEach(function (f) { used[f] = true; }); });
    oldIds = oldIds.filter(function (f, i) { return !used[f] && oldIds.indexOf(f) === i; });
  } catch (e) {
    trashFile_(fileId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  oldIds.forEach(trashFile_);
  var total = round2_(plan.reduce(function (a, x) { return a + x.jumlah; }, 0));
  audit_(user.email, 'RECORD_PAYMENT', plan.map(function (x) { return x.id; }).join(','), 'RM ' + total + ' pada ' + tarikh);
  notifyStaffPaid_(ss, saved);
  return { jumlah_rm: total, tuntutan: saved.map(function (r) { return claimPublic_(r, user); }) };
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
  return {
    jumlah_rm: round2_(list.reduce(function (a, c) { return a + c.amaun_rm; }, 0)),
    tanpa_bukti_bayar: list.filter(function (c) { return !c.ada_bukti_bayar; }).length,
    tuntutan: list
  };
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
