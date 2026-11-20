/**
 * Actions.gs - web app AMS (F-40 hingga F-43; BSD 3.5, 4.1, 4.2, 4.3; IPD 2C).
 *
 * Role ikut sistem AMS lama (applyAccessControl, designation Admin / Auditor / lain-lain):
 *   `admin`    tambah/ubah/lupus aset, kalibrasi semula, audit, sahkan pemulangan, lihat semua pinjaman
 *   `auditor`  audit bulanan (tak boleh tambah aset / kalibrasi)
 *   `staff`    lihat senarai aset & sijil, pinjam aset (troli), pulangkan aset sendiri
 * Semua role boleh pinjam (sistem lama: tab Mobiliti untuk semua). Hanya peminjam boleh pulangkan pinjaman sendiri;
 * hanya `admin` sahkan pemulangan (aset kembali "Tersedia").
 * Beza dengan sistem lama (disengajakan): identiti dari sesi Google (bukan nama yang ditaip / ID PASSWORD); fail Drive
 * tidak lagi awam; aset yang kalibrasinya dah luput tak boleh dipinjam (PRD F-41, boleh dimatikan di Settings).
 * Emel staf tak didedah ke browser: paparan nama sahaja.
 */

var ACTION_ROLES = {
  listAssets:    ['admin', 'auditor', 'staff'],
  getAsset:      ['admin', 'auditor', 'staff'],
  getFile:       ['admin', 'auditor', 'staff'],
  saveAsset:     ['admin'],
  disposeAsset:  ['admin'],
  recalibrate:   ['admin'],
  recordAudit:   ['admin', 'auditor'],
  checkout:      ['admin', 'auditor', 'staff'],
  returnAsset:   ['admin', 'auditor', 'staff'],
  listMovements: ['admin', 'auditor', 'staff'],
  approveReturn: ['admin']
};

var LIMITS = { teks: 100, catatan: 500, sebab: 300, troli: 30, tempoh_max: 365 };
var NA_VALUES = ['', '-', 'N/A', 'NA', 'TIADA'];
var MIN_DATE = '2000-01-01';

function doPost(e) {
  return handleRequest_(e, prop_('MODULE_SECRET'), routeAms_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeAms_(req) {
  var user = req.user || {};
  authorize_(ACTION_ROLES, req.action, user);
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var p = req.payload || {};
  switch (req.action) {
    case 'listAssets':    return listAssets_(ss, user);
    case 'getAsset':      return getAsset_(ss, user, p);
    case 'getFile':       return getFile_(ss, user, p);
    case 'saveAsset':     return saveAsset_(ss, user, p);
    case 'disposeAsset':  return disposeAsset_(ss, user, p);
    case 'recalibrate':   return recalibrate_(ss, user, p);
    case 'recordAudit':   return recordAudit_(ss, user, p);
    case 'checkout':      return checkout_(ss, user, p);
    case 'returnAsset':   return returnAsset_(ss, user, p);
    case 'listMovements': return listMovements_(ss, user, p);
    case 'approveReturn': return approveReturn_(ss, user, p);
  }
  throw httpError_(400, 'Action tidak dikenali');
}

// ---------------------------------------------------------------- bantuan

function hasRoleAms_(user, role) { return (user.roles || []).indexOf(role) >= 0; }
// `superadmin` portal = admin aset (tiada isu asingan tugas dalam AMS; authorize_ kongsi dah benarkan superadmin)
function isAdmin_(user) { return hasRoleAms_(user, 'admin') || hasRoleAms_(user, 'superadmin'); }
function canAudit_(user) { return isAdmin_(user) || hasRoleAms_(user, 'auditor'); }
function textVal_(v) { return String(unsanitize_(v === null || v === undefined ? '' : v)); }
function truthy_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

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

function cleanNote_(v, label, required) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (required && s.length < 3) throw httpError_(400, label + ' wajib diisi (sekurang-kurangnya 3 aksara)');
  if (s.length > LIMITS.catatan) throw httpError_(400, label + ' maksimum ' + LIMITS.catatan + ' aksara');
  return s;
}

function cleanDate_(v, label, required) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s && !required) return '';
  if (!validDate_(s)) throw httpError_(400, label + ' mesti tarikh sah (YYYY-MM-DD)');
  if (s < MIN_DATE) throw httpError_(400, label + ' terlalu lama');
  return s;
}

function pick_(v, list, label) {
  var s = String(v === null || v === undefined ? '' : v);
  if (list.indexOf(s) < 0) throw httpError_(400, label + ' tak sah');
  return s;
}

function isNA_(v) { return NA_VALUES.indexOf(String(v === null || v === undefined ? '' : v).trim().toUpperCase()) >= 0; }

/** Sistem lama: normalizeLocation (huruf besar, buang (...) dan tarikh di hujung). Untuk kumpulan lokasi sahaja. */
function normLoc_(raw) {
  return String(raw === null || raw === undefined ? '' : raw)
    .replace(/\([^)]*\)/g, '')
    .replace(/\s*-\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\s*$/, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

function daysBetween_(fromIso, toIso) {
  var a = Date.UTC(Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7)) - 1, Number(fromIso.slice(8, 10)));
  var b = Date.UTC(Number(toIso.slice(0, 4)), Number(toIso.slice(5, 7)) - 1, Number(toIso.slice(8, 10)));
  return Math.round((b - a) / 864e5);
}

/** Status kalibrasi ikut sistem lama (processData): Telah Luput / Lagi Seminggu / Lagi Sebulan / Masih Aktif / Tiada Data. */
function calibStatus_(expiry, today, warnDays) {
  var d = dateStr_(expiry);
  if (!validDate_(d)) return { status: 'Tiada Data', hari: null };
  var n = daysBetween_(today, d);
  if (n < 0) return { status: 'Telah Luput', hari: n };
  if (n <= 7) return { status: 'Lagi Seminggu', hari: n };
  if (n <= warnDays) return { status: 'Lagi Sebulan', hari: n };
  return { status: 'Masih Aktif', hari: n };
}

function settingsMap_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Settings');
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) { if (r.key !== '') out[String(r.key)] = String(unsanitize_(r.value)); });
  return out;
}

function warnDays_(s) {
  var n = Number(s.amaran_kalibrasi_hari);
  return isFinite(n) && n >= 7 && n <= 365 ? Math.floor(n) : 30;
}

function findAsset_(t, no) {
  var key = String(no === null || no === undefined ? '' : no).trim();
  if (!key) throw httpError_(400, 'asset_no wajib');
  return t.rows.filter(function (r) { return !isDeleted_(r) && String(r.asset_no) === key; })[0] || null;
}

function mustAsset_(t, no) {
  var r = findAsset_(t, no);
  if (!r) throw httpError_(404, 'Aset tidak dijumpai');
  return r;
}

function statusPinjaman_(r) {
  var s = String(r.status_pinjaman || '').trim();
  return STATUS_PINJAMAN.indexOf(s) >= 0 ? s : 'Tersedia';
}

function auditedThisMonth_(r, today) {
  return dateStr_(r.last_audit_date).slice(0, 7) === today.slice(0, 7);
}

/** Bentuk awam aset. TIADA emel pemegang, TIADA ID fail Drive. */
function assetPublic_(r, user, ctx) {
  var cal = calibStatus_(r.calib_expiry, ctx.today, ctx.warn);
  var status = statusPinjaman_(r);
  return {
    asset_no: String(r.asset_no),
    kategori: textVal_(r.kategori),
    make: textVal_(r.make),
    model: textVal_(r.model),
    serial_no: textVal_(r.serial_no),
    lokasi_asal: textVal_(r.lokasi_asal),
    lokasi_semasa: textVal_(r.lokasi_semasa),
    lokasi: normLoc_(r.lokasi_semasa) || normLoc_(r.lokasi_asal),
    pemegang_nama: status === 'Tersedia' ? '' : textVal_(r.pemegang_nama),
    pemegang_saya: status !== 'Tersedia' && String(r.pemegang_email) !== '' && String(r.pemegang_email) === String(user.email),
    status_pinjaman: status,
    calib_date: dateStr_(r.calib_date),
    calib_expiry: dateStr_(r.calib_expiry),
    calib_by: textVal_(r.calib_by),
    calib_status: cal.status,
    calib_hari: cal.hari,
    ada_sijil: String(r.cert_file_id || '') !== '',
    ada_gambar: String(r.photo_file_id || '') !== '',
    last_audit_date: dateStr_(r.last_audit_date),
    audit_status: String(r.audit_status || ''),
    audit_remark: textVal_(r.audit_remark),
    ada_gambar_audit: String(r.audit_photo_file_id || '') !== '',
    diaudit_bulan_ini: auditedThisMonth_(r, ctx.today),
    catatan: textVal_(r.catatan),
    boleh_pinjam: status === 'Tersedia' && !(ctx.sekat && cal.status === 'Telah Luput'),
    dikemas_kini: isoStr_(r.updated_at)
  };
}

function ctx_(ss) {
  var s = settingsMap_(ss);
  return { today: todayIso_(), warn: warnDays_(s), sekat: String(s.sekat_pinjam_luput || 'TRUE').toUpperCase() !== 'FALSE', settings: s };
}

function movementPublic_(m, user) {
  var st = String(m.status);
  var mine = String(m.peminjam_email) === String(user.email);
  var pinjam = isoStr_(m.tarikh_pinjam).slice(0, 10);
  var tempoh = Number(m.tempoh_hari) || 0;
  var due = pinjam && tempoh ? Utilities.formatDate(new Date(Date.parse(pinjam + 'T00:00:00+08:00') + tempoh * 864e5), VP_TZ, 'yyyy-MM-dd') : '';
  return {
    movement_id: String(m.movement_id),
    kumpulan: String(m.kumpulan || ''),
    asset_no: String(m.asset_no),
    peminjam_nama: textVal_(m.peminjam_nama),
    nama_projek: textVal_(m.nama_projek),
    lokasi: textVal_(m.lokasi),
    tarikh_pinjam: isoStr_(m.tarikh_pinjam),
    tempoh_hari: tempoh || null,
    tarikh_jangka_pulang: due,
    lewat: st === 'Dipinjam' && due !== '' && due < todayIso_(),
    keadaan_pinjam: String(m.keadaan_pinjam || ''),
    catatan_pinjam: textVal_(m.catatan_pinjam),
    tarikh_pulang: dateStr_(m.tarikh_pulang),
    keadaan_pulang: String(m.keadaan_pulang || ''),
    catatan_pulang: textVal_(m.catatan_pulang),
    ada_gambar_pulang: String(m.return_photo_file_id || '') !== '',
    status: st,
    approved_by_name: textVal_(m.approved_by_name),
    approved_at: isoStr_(m.approved_at),
    keadaan_akhir: String(m.keadaan_akhir || ''),
    lokasi_akhir: textVal_(m.lokasi_akhir),
    milik_saya: mine,
    boleh_pulang: mine && st === 'Dipinjam',
    boleh_sahkan: isAdmin_(user) && (st === 'Menunggu pengesahan' || st === 'Dipinjam')
  };
}

function movementsRows_(ss) {
  return readTable_(sheet_(ss, 'Movements')).rows.filter(function (m) { return !isDeleted_(m) && String(m.movement_id); });
}

function newestFirst_(a, b) {
  return isoStr_(b.created_at).localeCompare(isoStr_(a.created_at)) || String(b.movement_id).localeCompare(String(a.movement_id));
}

/** Nombor aset seterusnya: ikut sistem lama (No terakhir + 1), bukan bilangan baris. */
function nextAssetNo_(t) {
  var max = 0;
  t.rows.forEach(function (r) { var n = parseInt(String(r.asset_no), 10); if (isFinite(n) && String(n) === String(r.asset_no).trim() && n > max) max = n; });
  return String(max + 1);
}

// ---------------------------------------------------------------- S-40 senarai aset & papan pemuka

function listAssets_(ss, user) {
  var c = ctx_(ss);
  var rows = readTable_(sheet_(ss, 'Assets')).rows.filter(function (r) { return !isDeleted_(r) && String(r.asset_no) !== ''; });
  var list = rows.map(function (r) { return assetPublic_(r, user, c); });
  list.sort(function (a, b) { return (parseInt(a.asset_no, 10) || 0) - (parseInt(b.asset_no, 10) || 0) || a.asset_no.localeCompare(b.asset_no); });
  return { hari_ini: c.today, amaran_hari: c.warn, sekat_pinjam_luput: c.sekat, aset: list };
}

/** Butiran: aset + sejarah kalibrasi (semua) + audit (admin/auditor) + pinjaman (admin/auditor semua; staf milik sendiri). */
function getAsset_(ss, user, p) {
  var c = ctx_(ss);
  var r = mustAsset_(readTable_(sheet_(ss, 'Assets')), p.asset_no);
  var no = String(r.asset_no);
  var out = assetPublic_(r, user, c);
  out.kalibrasi = readTable_(sheet_(ss, 'CalibrationLog')).rows
    .filter(function (l) { return !isDeleted_(l) && String(l.asset_no) === no; })
    .map(function (l) {
      return { log_id: String(l.log_id), tarikh_kalibrasi: dateStr_(l.tarikh_kalibrasi), tarikh_luput: dateStr_(l.tarikh_luput), calib_by: textVal_(l.calib_by), catatan: textVal_(l.catatan), ada_sijil: String(l.cert_file_id || '') !== '' };
    })
    .sort(function (a, b) { return b.tarikh_kalibrasi.localeCompare(a.tarikh_kalibrasi); });
  out.audit = canAudit_(user) ? readTable_(sheet_(ss, 'Audits')).rows
    .filter(function (a) { return !isDeleted_(a) && String(a.asset_no) === no; })
    .map(function (a) {
      return { audit_id: String(a.audit_id), tarikh: dateStr_(a.tarikh), keadaan: String(a.keadaan), lokasi_ditemui: textVal_(a.lokasi_ditemui), catatan: textVal_(a.catatan), auditor_nama: textVal_(a.auditor_nama), ada_gambar: String(a.photo_file_id || '') !== '' };
    })
    .sort(function (a, b) { return b.tarikh.localeCompare(a.tarikh) || b.audit_id.localeCompare(a.audit_id); }) : null;
  var seeAll = canAudit_(user);
  out.pinjaman = movementsRows_(ss)
    .filter(function (m) { return String(m.asset_no) === no && (seeAll || String(m.peminjam_email) === String(user.email)); })
    .sort(newestFirst_)
    .map(function (m) { return movementPublic_(m, user); });
  return out;
}

// ---------------------------------------------------------------- fail

/**
 * payload: { asset_no, jenis: 'sijil'|'gambar'|'audit'|'pulang'|'sijil_log', log_id?, audit_id?, movement_id? }
 * sijil/gambar/sijil_log: semua role (sistem lama: sijil dibuka semua). audit: admin/auditor. pulang: admin atau peminjam.
 */
function getFile_(ss, user, p) {
  var jenis = String(p.jenis || '');
  var fileId = '';
  if (jenis === 'sijil' || jenis === 'gambar' || jenis === 'audit') {
    var r = mustAsset_(readTable_(sheet_(ss, 'Assets')), p.asset_no);
    if (jenis === 'audit' && !canAudit_(user)) { audit_(user.email, 'FORBIDDEN', 'getFile', 'audit ' + r.asset_no); throw httpError_(403, 'Tiada kebenaran'); }
    if (jenis === 'audit' && p.audit_id) {
      var a = readTable_(sheet_(ss, 'Audits')).rows.filter(function (x) { return !isDeleted_(x) && String(x.audit_id) === String(p.audit_id) && String(x.asset_no) === String(r.asset_no); })[0];
      fileId = a ? String(a.photo_file_id || '') : '';
    } else {
      fileId = String((jenis === 'sijil' ? r.cert_file_id : jenis === 'gambar' ? r.photo_file_id : r.audit_photo_file_id) || '');
    }
  } else if (jenis === 'sijil_log') {
    var l = readTable_(sheet_(ss, 'CalibrationLog')).rows.filter(function (x) { return !isDeleted_(x) && String(x.log_id) === String(p.log_id || ''); })[0];
    fileId = l ? String(l.cert_file_id || '') : '';
  } else if (jenis === 'pulang') {
    var m = movementsRows_(ss).filter(function (x) { return String(x.movement_id) === String(p.movement_id || ''); })[0];
    if (!m) throw httpError_(404, 'Rekod pinjaman tidak dijumpai');
    if (!isAdmin_(user) && String(m.peminjam_email) !== String(user.email)) { audit_(user.email, 'FORBIDDEN', 'getFile', 'pulang ' + m.movement_id); throw httpError_(403, 'Tiada kebenaran'); }
    fileId = String(m.return_photo_file_id || '');
  } else {
    throw httpError_(400, 'Jenis fail tak sah');
  }
  if (!fileId) throw httpError_(404, 'Tiada fail');
  var f;
  try { f = readFile_(fileId); } catch (e) { throw httpError_(404, 'Fail tidak dapat dibuka (mungkin dipadam atau tiada akses dari sistem lama)'); }
  audit_(user.email, 'VIEW_FILE', String(p.asset_no || p.movement_id || p.log_id || ''), jenis);
  return f;
}

// ---------------------------------------------------------------- S-41 tambah / ubah / lupus aset (admin)

/**
 * payload: { asset_no? (ubah), kategori, make, model, serial_no, lokasi_asal, lokasi_semasa?, calib_expiry?, calib_by?,
 *            catatan?, sijil?: {data}, gambar?: {data} }
 * Sistem lama (add/edit): Category, Location, Make, Model, Serial No wajib; Expired Date, sijil PDF, gambar.
 * Tarikh luput boleh kosong untuk aset tanpa kalibrasi (data lama ada "N/A").
 */
function saveAsset_(ss, user, p) {
  var f = {
    kategori: cleanText_(p.kategori, 'Kategori', LIMITS.teks, true),
    make: cleanText_(p.make, 'Make', LIMITS.teks, true),
    model: cleanText_(p.model, 'Model', LIMITS.teks, true),
    serial_no: cleanText_(p.serial_no, 'No. siri', LIMITS.teks, true),
    lokasi_asal: cleanText_(p.lokasi_asal, 'Lokasi asal', LIMITS.teks, true),
    calib_expiry: cleanDate_(p.calib_expiry, 'Tarikh luput kalibrasi', false),
    calib_by: cleanText_(p.calib_by, 'Dikalibrasi oleh', LIMITS.teks, false),
    catatan: cleanNote_(p.catatan, 'Catatan', false)
  };
  var lokasiSemasa = p.lokasi_semasa === undefined ? null : cleanText_(p.lokasi_semasa, 'Lokasi semasa', LIMITS.teks, false);
  var sijil = optUpload_(p.sijil, 'Sijil');
  var gambar = optUpload_(p.gambar, 'Gambar');
  var sh = sheet_(ss, 'Assets');
  var editNo = String(p.asset_no || '').trim();
  var newCert = '', newPhoto = '', oldPhoto = '';
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var cur = editNo ? mustAsset_(t, editNo) : null;
    if (!isNA_(f.serial_no)) {
      var dup = t.rows.filter(function (r) {
        return !isDeleted_(r) && textVal_(r.serial_no).trim().toUpperCase() === f.serial_no.toUpperCase() && (!cur || r._row !== cur._row);
      })[0];
      if (dup) throw httpError_(409, 'No. siri ' + f.serial_no + ' sudah didaftar (aset ' + dup.asset_no + ')');
    }
    var no = cur ? String(cur.asset_no) : nextAssetNo_(t);
    if (sijil) newCert = storeFile_(sijil, 'AST-' + no, 'sijil');
    if (gambar) newPhoto = storeFile_(gambar, 'AST-' + no, 'gambar');
    var now = nowIso_();
    var fields = Object.assign({}, f, { updated_at: now, updated_by: user.email });
    if (newCert) fields.cert_file_id = newCert;
    if (newPhoto) { fields.photo_file_id = newPhoto; oldPhoto = cur ? String(cur.photo_file_id || '') : ''; }
    if (cur) {
      if (lokasiSemasa !== null) {
        if (statusPinjaman_(cur) !== 'Tersedia' && lokasiSemasa !== textVal_(cur.lokasi_semasa)) throw httpError_(409, 'Lokasi semasa aset yang sedang dipinjam ditukar melalui pemulangan');
        fields.lokasi_semasa = lokasiSemasa;
      }
      updateRowObj_(sh, t.header, cur._row, fields);
      saved = Object.assign({}, cur, fields);
    } else {
      saved = Object.assign({
        asset_no: no, lokasi_semasa: lokasiSemasa || f.lokasi_asal, pemegang_email: '', pemegang_nama: '', status_pinjaman: 'Tersedia',
        calib_date: '', cert_file_id: '', photo_file_id: '', last_audit_date: '', audit_status: '', audit_remark: '', audit_photo_file_id: '',
        created_at: now, created_by: user.email, deleted: 'FALSE', deleted_reason: ''
      }, fields);
      appendObj_(sh, t.header, saved);
    }
  } catch (e) {
    trashFile_(newCert); trashFile_(newPhoto);
    throw e;
  } finally {
    lock.releaseLock();
  }
  trashFile_(oldPhoto); // gambar lama diganti. Sijil lama TIDAK dibuang (rekod kalibrasi)
  audit_(user.email, cur ? 'UPDATE_ASSET' : 'CREATE_ASSET', String(saved.asset_no), f.make + ' ' + f.model + ' SN ' + f.serial_no + (newCert ? '; sijil baharu' : '') + (newPhoto ? '; gambar baharu' : ''));
  return assetPublic_(saved, user, ctx_(ss));
}

/** payload: { asset_no, sebab }. Lupus/padam (lembut). Hanya aset yang tidak dipinjam. Fail disimpan sebagai rekod. */
function disposeAsset_(ss, user, p) {
  var sebab = cleanNote_(p.sebab, 'Sebab', true);
  if (sebab.length > LIMITS.sebab) throw httpError_(400, 'Sebab maksimum ' + LIMITS.sebab + ' aksara');
  var sh = sheet_(ss, 'Assets');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var r;
  try {
    var t = readTable_(sh);
    r = mustAsset_(t, p.asset_no);
    if (statusPinjaman_(r) !== 'Tersedia') throw httpError_(409, 'Aset sedang dipinjam. Sahkan pemulangan dahulu.');
    updateRowObj_(sh, t.header, r._row, { deleted: 'TRUE', deleted_reason: 'Dilupus: ' + sebab, updated_at: nowIso_(), updated_by: user.email });
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'DISPOSE_ASSET', String(r.asset_no), sebab);
  return true;
}

// ---------------------------------------------------------------- F-41 kalibrasi semula (admin)

/**
 * payload: { asset_no, tarikh_kalibrasi, tarikh_luput, calib_by, sijil: {data} (wajib, sistem lama: rec-input-cert required), catatan? }
 * Kemas kini Assets (tarikh luput, oleh, sijil terkini) + tambah baris CalibrationLog (sistem lama: action recalibrate).
 */
function recalibrate_(ss, user, p) {
  var tk = cleanDate_(p.tarikh_kalibrasi, 'Tarikh kalibrasi', true);
  if (tk > todayIso_()) throw httpError_(400, 'Tarikh kalibrasi tak boleh pada masa depan');
  var tl = cleanDate_(p.tarikh_luput, 'Tarikh luput', true);
  if (tl <= tk) throw httpError_(400, 'Tarikh luput mesti selepas tarikh kalibrasi');
  var by = cleanText_(p.calib_by, 'Dikalibrasi oleh', LIMITS.teks, true);
  var catatan = cleanNote_(p.catatan, 'Catatan', false);
  if (!p.sijil) throw httpError_(400, 'Sijil kalibrasi wajib dimuat naik');
  var parsed = parseUpload_(p.sijil, 'Sijil');
  var sh = sheet_(ss, 'Assets');
  mustAsset_(readTable_(sh), p.asset_no);
  var fileId = storeFile_(parsed, 'AST-' + String(p.asset_no).trim(), 'sijil');
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var r = mustAsset_(t, p.asset_no);
    var now = nowIso_();
    var fields = { calib_date: tk, calib_expiry: tl, calib_by: by, cert_file_id: fileId, updated_at: now, updated_by: user.email };
    updateRowObj_(sh, t.header, r._row, fields);
    var lsh = sheet_(ss, 'CalibrationLog');
    var lh = lsh.getRange(1, 1, 1, lsh.getLastColumn()).getValues()[0].map(String);
    appendObj_(lsh, lh, { log_id: nextId_(ss, 'CAL', 5), asset_no: String(r.asset_no), tarikh_kalibrasi: tk, tarikh_luput: tl, calib_by: by, cert_file_id: fileId, catatan: catatan, created_at: now, created_by: user.email, updated_at: now, updated_by: user.email, deleted: 'FALSE', deleted_reason: '' });
    saved = Object.assign({}, r, fields);
  } catch (e) {
    trashFile_(fileId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'RECALIBRATE', String(saved.asset_no), tk + ' -> ' + tl + ' oleh ' + by);
  return assetPublic_(saved, user, ctx_(ss));
}

// ---------------------------------------------------------------- S-42 audit bulanan (admin, auditor)

/**
 * payload: { asset_no, keadaan: Baik|Rosak|Hilang, catatan? (WAJIB bila Rosak/Hilang), gambar?, lokasi_ditemui? }
 * Sistem lama: satu tekan "Baik"; Rosak/Hilang perlukan remark, gambar pilihan. Setiap audit disimpan dalam Audits
 * (sistem lama hanya timpa lajur MASTERLIST), dan Assets simpan audit terkini.
 */
function recordAudit_(ss, user, p) {
  var keadaan = pick_(p.keadaan, AUDIT_KEADAAN, 'Keadaan');
  var catatan = cleanNote_(p.catatan, 'Catatan', keadaan !== 'Baik');
  var lokasi = cleanText_(p.lokasi_ditemui, 'Lokasi ditemui', LIMITS.teks, false);
  var gambar = optUpload_(p.gambar, 'Gambar audit');
  var sh = sheet_(ss, 'Assets');
  mustAsset_(readTable_(sh), p.asset_no);
  var fileId = gambar ? storeFile_(gambar, 'AST-' + String(p.asset_no).trim(), 'audit') : '';
  var saved;
  var today = todayIso_();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var r = mustAsset_(t, p.asset_no);
    var now = nowIso_();
    var fields = { last_audit_date: today, audit_status: keadaan, audit_remark: catatan, audit_photo_file_id: fileId, updated_at: now, updated_by: user.email };
    updateRowObj_(sh, t.header, r._row, fields);
    var ash = sheet_(ss, 'Audits');
    var ah = ash.getRange(1, 1, 1, ash.getLastColumn()).getValues()[0].map(String);
    appendObj_(ash, ah, { audit_id: nextId_(ss, 'AUD', 5), asset_no: String(r.asset_no), tarikh: today, keadaan: keadaan, lokasi_ditemui: lokasi, photo_file_id: fileId, catatan: catatan, auditor_email: user.email, auditor_nama: String(user.nama || ''), created_at: now, created_by: user.email, updated_at: now, updated_by: user.email, deleted: 'FALSE', deleted_reason: '' });
    saved = Object.assign({}, r, fields);
  } catch (e) {
    trashFile_(fileId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'AUDIT_ASSET', String(saved.asset_no), keadaan + (catatan ? ': ' + catatan : ''));
  return assetPublic_(saved, user, ctx_(ss));
}

// ---------------------------------------------------------------- S-43 mobiliti (pinjam, pulang, sahkan)

/**
 * payload: { assets: [asset_no, ...], nama_projek, lokasi, tempoh_hari, keadaan_pinjam: Baik|Ada kerosakan sedikit, catatan? }
 * Sistem lama (troli mobiliti): beberapa aset sekali pinjam, nama peminjam dari login. Satu baris Movements setiap aset,
 * dikumpul dengan `kumpulan`. Semua aset mesti Tersedia (dan kalibrasi belum luput jika sekat_pinjam_luput).
 */
function checkout_(ss, user, p) {
  var list = Array.isArray(p.assets) ? p.assets.map(function (x) { return String(x).trim(); }).filter(String) : [];
  if (!list.length) throw httpError_(400, 'Pilih sekurang-kurangnya satu aset');
  if (list.length > LIMITS.troli) throw httpError_(400, 'Maksimum ' + LIMITS.troli + ' aset satu pinjaman');
  if (list.some(function (x, i) { return list.indexOf(x) !== i; })) throw httpError_(400, 'Aset berulang dalam troli');
  var projek = cleanText_(p.nama_projek, 'Nama projek', LIMITS.teks, true);
  var lokasi = cleanText_(p.lokasi, 'Lokasi', LIMITS.teks, true);
  var tempoh = Number(p.tempoh_hari);
  if (!isFinite(tempoh) || Math.floor(tempoh) !== tempoh || tempoh < 1 || tempoh > LIMITS.tempoh_max) throw httpError_(400, 'Tempoh mesti 1 hingga ' + LIMITS.tempoh_max + ' hari');
  var keadaan = pick_(p.keadaan_pinjam, KEADAAN_PINJAM, 'Keadaan semasa pinjam');
  var catatan = cleanNote_(p.catatan, 'Catatan', keadaan !== 'Baik');
  var c = ctx_(ss);
  var sh = sheet_(ss, 'Assets');
  var msh = sheet_(ss, 'Movements');
  var out = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var rows = list.map(function (no) {
      var r = mustAsset_(t, no);
      var label = r.asset_no + ' (' + textVal_(r.make) + ' ' + textVal_(r.model) + ')';
      if (statusPinjaman_(r) !== 'Tersedia') throw httpError_(409, label + ' sedang dipinjam');
      if (c.sekat && calibStatus_(r.calib_expiry, c.today, c.warn).status === 'Telah Luput') throw httpError_(409, label + ': kalibrasi dah luput, tak boleh dipinjam. Hubungi admin aset.');
      return r;
    });
    var mh = msh.getRange(1, 1, 1, msh.getLastColumn()).getValues()[0].map(String);
    var now = nowIso_();
    var kumpulan = '';
    rows.forEach(function (r) {
      var id = nextId_(ss, 'MOV', 5);
      if (!kumpulan) kumpulan = id;
      var m = {
        movement_id: id, kumpulan: kumpulan, asset_no: String(r.asset_no), peminjam_email: user.email, peminjam_nama: String(user.nama || ''),
        nama_projek: projek, lokasi: lokasi, tarikh_pinjam: now, tempoh_hari: tempoh, keadaan_pinjam: keadaan, catatan_pinjam: catatan,
        status: 'Dipinjam', created_at: now, created_by: user.email, updated_at: now, updated_by: user.email, deleted: 'FALSE', deleted_reason: ''
      };
      appendObj_(msh, mh, m);
      updateRowObj_(sh, t.header, r._row, { lokasi_semasa: lokasi, pemegang_email: user.email, pemegang_nama: String(user.nama || ''), status_pinjaman: 'Dipinjam', updated_at: now, updated_by: user.email });
      out.push(m);
    });
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'CHECKOUT', out.map(function (m) { return m.asset_no; }).join(','), projek + ' @ ' + lokasi + ', ' + tempoh + ' hari');
  return out.map(function (m) { return movementPublic_(m, user); });
}

function findMovement_(rows, p) {
  var id = String(p.movement_id || '').trim();
  if (!id) throw httpError_(400, 'movement_id wajib');
  var m = rows.filter(function (x) { return !isDeleted_(x) && String(x.movement_id) === id; })[0];
  if (!m) throw httpError_(404, 'Rekod pinjaman tidak dijumpai');
  return m;
}

/**
 * payload: { movement_id, tarikh_pulang, keadaan_pulang: Baik|Rosak, catatan? , gambar? }
 * Sistem lama (return): Rosak -> catatan DAN gambar wajib. Hanya PEMINJAM sendiri. Status -> Menunggu pengesahan.
 */
function returnAsset_(ss, user, p) {
  var keadaan = pick_(p.keadaan_pulang, KEADAAN_PULANG, 'Keadaan semasa pulang');
  var catatan = cleanNote_(p.catatan, 'Catatan', keadaan === 'Rosak');
  var tarikh = cleanDate_(p.tarikh_pulang, 'Tarikh pulang', true);
  if (tarikh > todayIso_()) throw httpError_(400, 'Tarikh pulang tak boleh pada masa depan');
  if (keadaan === 'Rosak' && !p.gambar) throw httpError_(400, 'Gambar bukti wajib bila aset rosak / hilang komponen');
  var gambar = optUpload_(p.gambar, 'Gambar bukti');
  var msh = sheet_(ss, 'Movements');
  var pre = findMovement_(readTable_(msh).rows, p);
  if (String(pre.peminjam_email) !== String(user.email)) {
    audit_(user.email, 'FORBIDDEN', 'returnAsset', String(pre.movement_id));
    throw httpError_(403, 'Hanya peminjam boleh memulangkan aset ini');
  }
  if (String(pre.status) !== 'Dipinjam') throw httpError_(409, 'Pinjaman ini bukan berstatus Dipinjam');
  if (tarikh < isoStr_(pre.tarikh_pinjam).slice(0, 10)) throw httpError_(400, 'Tarikh pulang tak boleh sebelum tarikh pinjam');
  var fileId = gambar ? storeFile_(gambar, String(pre.movement_id), 'pulang') : '';
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var mt = readTable_(msh);
    var m = findMovement_(mt.rows, p);
    if (String(m.peminjam_email) !== String(user.email) || String(m.status) !== 'Dipinjam') throw httpError_(409, 'Rekod telah berubah. Muat semula halaman.');
    var now = nowIso_();
    var fields = { tarikh_pulang: tarikh, keadaan_pulang: keadaan, catatan_pulang: catatan, return_photo_file_id: fileId, status: 'Menunggu pengesahan', updated_at: now, updated_by: user.email };
    updateRowObj_(msh, mt.header, m._row, fields);
    var ash = sheet_(ss, 'Assets');
    var at = readTable_(ash);
    var a = findAsset_(at, m.asset_no);
    if (a) updateRowObj_(ash, at.header, a._row, { status_pinjaman: 'Menunggu pengesahan', updated_at: now, updated_by: user.email });
    saved = Object.assign({}, m, fields);
  } catch (e) {
    trashFile_(fileId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'RETURN_ASSET', String(saved.asset_no), saved.movement_id + '; ' + keadaan);
  notifyAdminsReturn_(ss, saved);
  return movementPublic_(saved, user);
}

/**
 * payload: { movement_id } atau { asset_no } (pinjaman dari sistem lama tanpa rekod Movements),
 *          keadaan_akhir: Baik|Rosak|Hilang komponen, lokasi_akhir }
 * Sistem lama (approve_return): admin semak fizikal, tetapkan kondisi akhir + lokasi; aset kembali Tersedia.
 * Admin juga boleh terima terus aset yang masih "Dipinjam" (staf pulang tangan ke tangan / rekod lama).
 */
function approveReturn_(ss, user, p) {
  var keadaan = pick_(p.keadaan_akhir, KEADAAN_AKHIR, 'Keadaan akhir');
  var lokasi = cleanText_(p.lokasi_akhir, 'Lokasi', LIMITS.teks, true);
  var catatan = cleanNote_(p.catatan, 'Catatan', false);
  var msh = sheet_(ss, 'Movements');
  var ash = sheet_(ss, 'Assets');
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var mt = readTable_(msh);
    var at = readTable_(ash);
    var m;
    if (p.movement_id) {
      m = findMovement_(mt.rows, p);
      if (['Dipinjam', 'Menunggu pengesahan'].indexOf(String(m.status)) < 0) throw httpError_(409, 'Pinjaman ini sudah selesai');
    } else {
      var a0 = mustAsset_(at, p.asset_no);
      m = mt.rows.filter(function (x) { return !isDeleted_(x) && String(x.asset_no) === String(a0.asset_no) && ['Dipinjam', 'Menunggu pengesahan'].indexOf(String(x.status)) >= 0; })[0] || null;
      if (!m) {
        if (statusPinjaman_(a0) === 'Tersedia') throw httpError_(409, 'Aset ini tidak dipinjam');
        // Pinjaman dari sistem lama: cipta rekod penutup supaya sejarah lengkap
        var mh = msh.getRange(1, 1, 1, msh.getLastColumn()).getValues()[0].map(String);
        var n0 = nowIso_();
        m = {
          movement_id: nextId_(ss, 'MOV', 5), kumpulan: '', asset_no: String(a0.asset_no), peminjam_email: String(a0.pemegang_email || ''), peminjam_nama: textVal_(a0.pemegang_nama),
          nama_projek: '(rekod sistem lama)', lokasi: textVal_(a0.lokasi_semasa), tarikh_pinjam: '', tempoh_hari: '', keadaan_pinjam: '', catatan_pinjam: '',
          status: 'Dipinjam', created_at: n0, created_by: user.email, updated_at: n0, updated_by: user.email, deleted: 'FALSE', deleted_reason: ''
        };
        appendObj_(msh, mh, m);
        mt = readTable_(msh);
        m = findMovement_(mt.rows, m);
      }
    }
    var now = nowIso_();
    var dari = String(m.status);
    var fields = {
      status: 'Selesai', approved_by: user.email, approved_by_name: String(user.nama || ''), approved_at: now, keadaan_akhir: keadaan, lokasi_akhir: lokasi,
      updated_at: now, updated_by: user.email
    };
    if (dari === 'Dipinjam') { fields.tarikh_pulang = todayIso_(); fields.catatan_pulang = catatan || 'Diterima terus oleh admin'; }
    else if (catatan) fields.catatan_pulang = (textVal_(m.catatan_pulang) ? textVal_(m.catatan_pulang) + ' | ' : '') + 'Admin: ' + catatan;
    updateRowObj_(msh, mt.header, m._row, fields);
    var a = findAsset_(at, m.asset_no);
    // Sistem lama: lokasi HQ -> pemegang dikosongkan
    if (a) updateRowObj_(ash, at.header, a._row, { lokasi_semasa: lokasi, pemegang_email: '', pemegang_nama: '', status_pinjaman: 'Tersedia', updated_at: now, updated_by: user.email });
    saved = Object.assign({}, m, fields);
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'APPROVE_RETURN', String(saved.asset_no), saved.movement_id + '; ' + keadaan + ' @ ' + lokasi);
  return movementPublic_(saved, user);
}

/** payload: { skop: 'saya' | 'semua' | 'menunggu' | 'aktif' }. Selain 'saya': admin sahaja. */
function listMovements_(ss, user, p) {
  var skop = String(p.skop || 'saya');
  if (['saya', 'semua', 'menunggu', 'aktif'].indexOf(skop) < 0) throw httpError_(400, 'Skop tak sah');
  if (skop !== 'saya' && !isAdmin_(user)) { audit_(user.email, 'FORBIDDEN', 'listMovements', skop); throw httpError_(403, 'Hanya admin aset'); }
  var rows = movementsRows_(ss).filter(function (m) {
    if (skop === 'saya') return String(m.peminjam_email) === String(user.email);
    if (skop === 'menunggu') return String(m.status) === 'Menunggu pengesahan';
    if (skop === 'aktif') return String(m.status) !== 'Selesai';
    return true;
  });
  rows.sort(newestFirst_);
  var assets = {};
  readTable_(sheet_(ss, 'Assets')).rows.forEach(function (r) { assets[String(r.asset_no)] = r; });
  return rows.slice(0, 1000).map(function (m) {
    var o = movementPublic_(m, user);
    var a = assets[o.asset_no];
    o.aset = a ? { make: textVal_(a.make), model: textVal_(a.model), serial_no: textVal_(a.serial_no), kategori: textVal_(a.kategori), lokasi_asal: textVal_(a.lokasi_asal) } : null;
    return o;
  });
}
