/**
 * Setup.gs - setupSystem() untuk VP-AMS (BSD 6) + import data sistem lama (BSD 7).
 * Jalankan dari editor Apps Script. Semua fungsi idempotent.
 */

function setupSystem() {
  checkConfig();
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var report = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var created = false;
    if (!sh) { sh = ss.insertSheet(name); created = true; }
    var want = SCHEMA[name];
    var lastCol = sh.getLastColumn();
    var have = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    while (have.length && have[have.length - 1] === '') have.pop();
    var missing = want.filter(function (h) { return have.indexOf(h) < 0; });
    if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#F3F6FA');
    report.push(name + (created ? ' (baru)' : '') + (missing.length && !created ? ' +' + missing.join(',') : ''));
  });
  var added = ensureSettings_(ss);
  if (added.length) report.push('Settings +' + added.join(','));
  formatTextColumns_(ss);
  applyValidation_(ss);
  var folders = ensureFolders_();
  ensureTriggers_();
  Logger.log('setupSystem selesai: ' + ss.getName() + ' | ' + report.join(' | ') + ' | folder: ' + folders.join(', '));
  Logger.log('Seterusnya: isi tab Settings (portal_url, admin_notify_emails), kemudian import data lama (importMasterlist).');
  return report;
}

function ensureSettings_(ss) {
  var sh = ss.getSheetByName('Settings');
  var t = readTable_(sh);
  var have = t.rows.map(function (r) { return String(r.key); });
  var added = [];
  SETTINGS_SEED.forEach(function (row) {
    if (have.indexOf(row[0]) >= 0) return;
    appendObj_(sh, t.header, { key: row[0], value: row[1], nota: row[2] });
    added.push(row[0]);
  });
  return added;
}

/** No. aset, no. siri, ID fail dan tarikh disimpan sebagai teks (elak "1E+05" dan tukar tarikh automatik). */
function formatTextColumns_(ss) {
  var cols = {
    Assets: ['asset_no', 'serial_no', 'calib_date', 'calib_expiry', 'last_audit_date', 'cert_file_id', 'photo_file_id', 'audit_photo_file_id'],
    CalibrationLog: ['log_id', 'asset_no', 'tarikh_kalibrasi', 'tarikh_luput', 'cert_file_id'],
    Audits: ['audit_id', 'asset_no', 'tarikh', 'photo_file_id'],
    Movements: ['movement_id', 'kumpulan', 'asset_no', 'tarikh_pulang', 'return_photo_file_id']
  };
  Object.keys(cols).forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    cols[tab].forEach(function (f) {
      var col = header.indexOf(f) + 1;
      if (col) sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  });
}

function applyValidation_(ss) {
  VALIDATIONS.forEach(function (v) {
    var sh = ss.getSheetByName(v[0]);
    if (!sh) return;
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var col = header.indexOf(v[1]) + 1;
    if (!col) return;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(v[2], true).setAllowInvalid(false).build();
    sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  });
}

/** Folder BSD 5: VP-Files/AMS/Photos, Certs, Audits, Returns. */
function ensureFolders_() {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(root, 'AMS');
  Object.keys(FOLDERS).forEach(function (k) { childFolder_(base, FOLDERS[k]); });
  return [root.getName(), 'AMS/' + Object.keys(FOLDERS).map(function (k) { return FOLDERS[k]; }).join(',')];
}

/** Trigger BSD 6: Isnin 8:00 laporan kalibrasi & pinjaman. Tiada pendua. */
function ensureTriggers_() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('weeklyReport') < 0) ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
}

function currentUserEmail_() {
  try { return Session.getEffectiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
}

// ---------------------------------------------------------------- import sistem lama (BSD 7)

/** Tarikh lama: objek Date, "dd/mm/yyyy", "d/m/yy", "yyyy-mm-dd". Pulang YYYY-MM-DD atau ''. */
function oldDate_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, VP_TZ, 'yyyy-MM-dd');
  var s = String(v).trim();
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return pad_(m[1], m[2], m[3]);
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);
  if (m) return pad_(m[3].length === 2 ? '20' + m[3] : m[3], m[2], m[1]);
  return '';
}

function pad_(y, mo, d) {
  var out = y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  return validDate_(out) ? out : '';
}

/** Baca tab import (header baris 1). Pulang { rows: [{ <header lowercase>: nilai }] }. */
function readImportTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) throw new Error('Tab "' + name + '" tiada atau kosong. Salin data lama (termasuk baris header) ke tab ini dahulu.');
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var header = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  return values.slice(1).map(function (row) {
    var o = {};
    header.forEach(function (h, i) { if (h && !(h in o)) o[h] = row[i]; });
    return o;
  });
}

function col_(row, names) {
  for (var i = 0; i < names.length; i++) {
    var v = row[names[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

/**
 * importMasterlist: salin tab MASTERLIST sistem AMS lama (Ctrl+A, Ctrl+C, kemudian Paste special > Values only)
 * ke tab baharu bernama IMPORT_MASTERLIST dalam VP-AMS, kemudian Run fungsi ni.
 * - asset_no = lajur "No" lama (dikekalkan); baris tanpa No diberi nombor seterusnya
 * - Aset yang No-nya sudah wujud dalam Assets DILANGKAU (selamat dijalankan semula)
 * - Pautan Drive lama (Cert, Test Set Picture, Audit Picture) disimpan sebagai ID fail; fail kekal di folder lama
 * - Status Pinjaman "Dipinjam" dibawa (pemegang nama sahaja); admin tutup pinjaman itu melalui "Terima pulang"
 * Tab IMPORT_MASTERLIST boleh dipadam selepas semakan.
 */
function importMasterlist() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var rows = readImportTab_(ss, 'IMPORT_MASTERLIST');
  var sh = sheet_(ss, 'Assets');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var added = 0, skipped = 0, warn = [];
  try {
    var t = readTable_(sh);
    var haveNo = {}, haveSn = {};
    t.rows.forEach(function (r) { if (!isDeleted_(r)) { haveNo[String(r.asset_no)] = true; haveSn[textVal_(r.serial_no).trim().toUpperCase()] = r.asset_no; } });
    var now = nowIso_(), by = currentUserEmail_();
    var out = [];
    rows.forEach(function (o, i) {
      var make = String(col_(o, ['make'])).trim(), model = String(col_(o, ['model'])).trim(), sn = String(col_(o, ['serial no', 'serial no.', 'serial'])).trim();
      if (!make && !model && !sn) return; // baris kosong
      var no = String(col_(o, ['no', 'no.'])).trim();
      if (no && haveNo[no]) { skipped++; return; }
      if (!no) {
        no = nextAssetNo_({ rows: t.rows.concat(out.map(function (x) { return { asset_no: x.asset_no }; })) });
        warn.push('Baris ' + (i + 2) + ': tiada No, diberi ' + no);
      }
      if (sn && !isNA_(sn) && haveSn[sn.toUpperCase()]) warn.push('Baris ' + (i + 2) + ': No. siri ' + sn + ' berulang (aset ' + haveSn[sn.toUpperCase()] + ')');
      var expRaw = col_(o, ['expired date', 'expiry date', 'tarikh luput']);
      var exp = oldDate_(expRaw);
      if (expRaw !== '' && !exp && !isNA_(expRaw)) warn.push('Baris ' + (i + 2) + ': tarikh luput "' + expRaw + '" tak difahami, dibiarkan kosong');
      var sp = String(col_(o, ['status pinjaman'])).trim().toLowerCase();
      var status = sp === 'dipinjam' ? 'Dipinjam' : sp.indexOf('menunggu') === 0 ? 'Menunggu pengesahan' : 'Tersedia';
      var asal = String(col_(o, ['location origin', 'location', 'lokasi'])).trim();
      var semasa = String(col_(o, ['current location'])).trim() || asal;
      var holder = String(col_(o, ['current holder'])).trim();
      var auditStat = String(col_(o, ['audit status'])).trim();
      var rec = {
        asset_no: no, kategori: String(col_(o, ['category', 'kategori'])).trim(), make: make, model: model, serial_no: sn,
        lokasi_asal: asal, lokasi_semasa: semasa, pemegang_email: '', pemegang_nama: status === 'Tersedia' || holder === '-' ? '' : holder, status_pinjaman: status,
        calib_date: '', calib_expiry: exp, calib_by: String(col_(o, ['calibration by', 'calib by'])).trim(),
        cert_file_id: driveIdFromUrl_(col_(o, ['cert', 'certificate', 'sijil'])), photo_file_id: driveIdFromUrl_(col_(o, ['test set picture', 'picture', 'gambar'])),
        last_audit_date: oldDate_(col_(o, ['last audit date', 'last audit'])), audit_status: AUDIT_KEADAAN.indexOf(auditStat) >= 0 ? auditStat : '',
        audit_remark: String(col_(o, ['remark'])).trim(), audit_photo_file_id: driveIdFromUrl_(col_(o, ['audit picture', 'audit image', 'audit img'])),
        catatan: 'Diimport dari sistem AMS lama ' + todayIso_(),
        created_at: now, created_by: by, updated_at: now, updated_by: by, deleted: 'FALSE', deleted_reason: ''
      };
      out.push(rec);
      haveNo[no] = true;
      if (sn && !isNA_(sn)) haveSn[sn.toUpperCase()] = no;
    });
    if (out.length) {
      var vals = out.map(function (rec) { return t.header.map(function (h) { return sanitizeForSheet(rec[h] === undefined ? '' : rec[h]); }); });
      sh.getRange(sh.getLastRow() + 1, 1, vals.length, t.header.length).setValues(vals);
      added = out.length;
    }
  } finally {
    lock.releaseLock();
  }
  var msg = 'importMasterlist: ' + added + ' aset ditambah, ' + skipped + ' dilangkau (No sudah wujud).' + (warn.length ? ' Amaran: ' + warn.join(' | ') : '');
  audit_(currentUserEmail_(), 'IMPORT_MASTERLIST', String(added), skipped + ' dilangkau; ' + warn.length + ' amaran');
  Logger.log(msg);
  return { ditambah: added, dilangkau: skipped, amaran: warn };
}

/**
 * importCalibrationLog: salin tab CALIBRATION LOG lama (Category, Make, Model, Serial No, Date Calibrate, Calibration By)
 * ke tab IMPORT_CALIBRATION, kemudian Run. Dipadankan ke aset ikut No. siri. Rekod yang sudah diimport dilangkau.
 */
function importCalibrationLog() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var rows = readImportTab_(ss, 'IMPORT_CALIBRATION');
  var assets = readTable_(sheet_(ss, 'Assets')).rows.filter(function (r) { return !isDeleted_(r); });
  var bySn = {};
  assets.forEach(function (r) { var k = textVal_(r.serial_no).trim().toUpperCase(); if (k && !isNA_(k)) bySn[k] = String(r.asset_no); });
  var lsh = sheet_(ss, 'CalibrationLog');
  var lt = readTable_(lsh);
  var seen = {};
  lt.rows.forEach(function (l) { seen[String(l.asset_no) + '|' + dateStr_(l.tarikh_kalibrasi) + '|' + textVal_(l.calib_by)] = true; });
  var now = nowIso_(), by = currentUserEmail_();
  var added = 0, nomatch = [];
  rows.forEach(function (o, i) {
    var sn = String(col_(o, ['serial no', 'serial no.', 'serial'])).trim();
    if (!sn) return;
    var no = bySn[sn.toUpperCase()];
    if (!no) { nomatch.push('baris ' + (i + 2) + ' SN ' + sn); return; }
    var tk = oldDate_(col_(o, ['date calibrate', 'tarikh kalibrasi', 'date']));
    var calBy = String(col_(o, ['calibration by', 'calib by'])).trim();
    var key = no + '|' + tk + '|' + calBy;
    if (seen[key]) return;
    seen[key] = true;
    appendObj_(lsh, lt.header, { log_id: nextId_(ss, 'CAL', 5), asset_no: no, tarikh_kalibrasi: tk, tarikh_luput: '', calib_by: calBy, cert_file_id: '', catatan: 'Diimport dari CALIBRATION LOG lama', created_at: now, created_by: by, updated_at: now, updated_by: by, deleted: 'FALSE', deleted_reason: '' });
    added++;
  });
  var msg = 'importCalibrationLog: ' + added + ' rekod ditambah.' + (nomatch.length ? ' Tiada aset sepadan: ' + nomatch.join(', ') : '');
  Logger.log(msg);
  return { ditambah: added, tiada_padanan: nomatch };
}
