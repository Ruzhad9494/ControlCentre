/**
 * Setup.gs - setupSystem() untuk VP-Compliance (BSD 6) + import data sistem lama "UniTrack" (BSD 7).
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
  Logger.log('Seterusnya: isi tab Settings (portal_url, notify_emails, company_address), kemudian import data lama (importOldData).');
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

/** ID, no. plat, tarikh dan ID fail sebagai teks. No. IC sebagai teks (kekalkan sifar di depan; sistem lama sama). */
function formatTextColumns_(ss) {
  var cols = {
    Vehicles: ['vehicle_id', 'plate_no', 'roadtax_expiry', 'doc_file_id'],
    Chargeman: ['chargeman_id', 'staff_id', 'competency_no', 'expiry_date', 'doc_file_id'],
    Staff: ['staff_id', 'ic_no', 'ic_front_file_id', 'ic_back_file_id'],
    StaffCerts: ['cert_id', 'staff_id', 'no_sijil', 'expiry_date', 'cert_file_id'],
    JobLog: ['job_id', 'tarikh', 'staff_ids']
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

/** Folder BSD 5: VP-Files/Compliance/Vehicles, Chargeman, StaffCerts, IC. */
function ensureFolders_() {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(root, 'Compliance');
  Object.keys(FOLDERS).forEach(function (k) { childFolder_(base, FOLDERS[k]); });
  return [root.getName(), 'Compliance/' + Object.keys(FOLDERS).map(function (k) { return FOLDERS[k]; }).join(',')];
}

/** Trigger BSD 6: Isnin 8:00 peringatan luput. Tiada pendua. */
function ensureTriggers_() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('weeklyReport') < 0) ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
}

function currentUserEmail_() {
  try { return Session.getEffectiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
}

/** Baca tab import. Header boleh di baris 1-5 (sistem lama: locateHeaderRow). Pulang [{ header lowercase: nilai }]. */
function readImportTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return null;
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var kata = ['plate', 'expired', 'expiry', 'chargeman', 'cidb', 'name'];
  var hr = 0;
  for (var r = 0; r < Math.min(5, values.length); r++) {
    var joined = values[r].join(' ').toLowerCase();
    if (kata.some(function (k) { return joined.indexOf(k) >= 0; })) { hr = r; break; }
  }
  var header = values[hr].map(function (h) { return String(h).trim().toLowerCase(); });
  return values.slice(hr + 1).map(function (row) {
    var o = {};
    header.forEach(function (h, i) { if (h && !(h in o)) o[h] = row[i]; });
    return o;
  }).filter(function (o) { return Object.keys(o).some(function (k) { return String(o[k]).trim() !== ''; }); });
}

function col_(row, names) {
  for (var i = 0; i < names.length; i++) {
    var v = row[names[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

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

/**
 * importOldData: salin tab sistem lama (Ctrl+A, Ctrl+C, Paste special > Values only) ke tab dalam VP-Compliance:
 *   IMPORT_KERETA, IMPORT_MOTOSIKAL, IMPORT_CHARGEMAN, IMPORT_CERT (tab yang tiada dilangkau), kemudian Run.
 * - Kenderaan dilangkau jika no. plat sudah wujud; chargeman jika (nama + solar farm + no. kompetensi) sudah wujud;
 *   staf jika Staff ID sudah wujud. Selamat dijalankan semula.
 * - Pautan Drive lama (Document, *Cert, IC Attachment) disimpan sebagai ID fail; fail kekal di folder lama.
 * - IC Attachment lama (satu fail) dibawa sebagai IC depan; IC Front / IC Back dibawa jika lajur itu ada.
 */
function importOldData() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var by = currentUserEmail_();
  var log = [], warn = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Kenderaan
    var vsh = sheet_(ss, 'Vehicles');
    var vt = readTable_(vsh);
    var plates = {};
    vt.rows.forEach(function (r) { if (!isDeleted_(r)) plates[normPlate_(r.plate_no)] = true; });
    [['IMPORT_KERETA', 'Kereta'], ['IMPORT_MOTOSIKAL', 'Motosikal']].forEach(function (x) {
      var rows = readImportTab_(ss, x[0]);
      if (!rows) return;
      var n = 0;
      rows.forEach(function (o, i) {
        var plate = normPlate_(col_(o, ['plate no.', 'plate no', 'no. plat', 'plate']));
        if (!plate) return;
        if (plates[plate]) return;
        var exp = oldDate_(col_(o, ['expired date', 'expiry date', 'tarikh tamat']));
        if (!exp) warn.push(x[0] + ' baris ' + (i + 2) + ' (' + plate + '): tarikh tamat tak difahami');
        appendObj_(vsh, vt.header, Object.assign(auditRow_(by), {
          vehicle_id: nextId_(ss, 'VEH', 5), jenis: x[1], plate_no: plate, lokasi: String(col_(o, ['location', 'lokasi'])).trim(),
          keadaan: String(col_(o, ['condition', 'keadaan'])).trim(), roadtax_expiry: exp,
          doc_file_id: driveIdFromUrl_(col_(o, ['document', 'doc url', 'lampiran'])), catatan: 'Diimport dari sistem lama'
        }));
        plates[plate] = true;
        n++;
      });
      log.push(x[1] + ': ' + n);
    });
    // Chargeman
    var crows = readImportTab_(ss, 'IMPORT_CHARGEMAN');
    if (crows) {
      var csh = sheet_(ss, 'Chargeman');
      var ct = readTable_(csh);
      var keyOf = function (nama, farm, no) { return [nama, farm, no].map(function (v) { return String(v).trim().toUpperCase(); }).join('|'); };
      var have = {};
      ct.rows.forEach(function (r) { if (!isDeleted_(r)) have[keyOf(textVal_(r.nama), textVal_(r.solar_farm), textVal_(r.competency_no))] = true; });
      var n2 = 0;
      crows.forEach(function (o, i) {
        var nama = String(col_(o, ['chargeman name', 'nama', 'name'])).trim();
        var farm = String(col_(o, ['solar farm', 'site'])).trim();
        var no = String(col_(o, ['competency no.', 'competency no'])).trim();
        if (!nama) return;
        var k = keyOf(nama, farm, no);
        if (have[k]) return;
        var exp = oldDate_(col_(o, ['expiry date', 'expired date']));
        if (!exp) warn.push('IMPORT_CHARGEMAN baris ' + (i + 2) + ' (' + nama + '): tarikh tamat tak difahami');
        var sid = String(col_(o, ['id', 'staff id'])).trim().toUpperCase();
        appendObj_(csh, ct.header, Object.assign(auditRow_(by), {
          chargeman_id: nextId_(ss, 'CHG', 5), staff_id: /^[A-Z0-9_-]{2,20}$/.test(sid) ? sid : '', nama: nama, solar_farm: farm, competency_no: no,
          expiry_date: exp, doc_file_id: driveIdFromUrl_(col_(o, ['document', 'lampiran'])), catatan: 'Diimport dari sistem lama'
        }));
        have[k] = true;
        n2++;
      });
      log.push('Chargeman: ' + n2);
    }
    // Sijil staf (format lebar -> panjang) + profil + IC
    var srows = readImportTab_(ss, 'IMPORT_CERT');
    if (srows) {
      var ssh = sheet_(ss, 'Staff');
      var st = readTable_(ssh);
      var qsh = sheet_(ss, 'StaffCerts');
      var qt = readTable_(qsh);
      var haveStaff = {};
      st.rows.forEach(function (r) { if (!isDeleted_(r)) haveStaff[String(r.staff_id).toUpperCase()] = true; });
      var n3 = 0, n4 = 0;
      srows.forEach(function (o, i) {
        var sid = String(col_(o, ['id', 'staff id'])).trim().toUpperCase();
        if (!sid) return;
        if (!/^[A-Z0-9_-]{2,20}$/.test(sid)) { warn.push('IMPORT_CERT baris ' + (i + 2) + ': ID "' + sid + '" tak sah'); return; }
        if (haveStaff[sid]) return;
        var icRaw = String(col_(o, ['ic', 'no. ic', 'nric'])).trim();
        var ic = '';
        try { ic = cleanIc_(icRaw); } catch (e) { warn.push(sid + ': no. IC "' + icRaw + '" tak sah, dibiarkan kosong'); }
        appendObj_(ssh, st.header, Object.assign(auditRow_(by), {
          staff_id: sid, staff_email: '', nama: String(col_(o, ['name', 'nama'])).trim(), designation: String(col_(o, ['designation'])).trim(),
          ic_no: ic, ic_front_file_id: driveIdFromUrl_(col_(o, ['ic front', 'ic depan', 'ic attachment'])), ic_back_file_id: driveIdFromUrl_(col_(o, ['ic back', 'ic belakang'])),
          ic_consent_version: '', ic_consent_at: '', ic_oleh: 'import sistem lama'
        }));
        haveStaff[sid] = true;
        n3++;
        CERT_TYPES.forEach(function (t) {
          var raw = col_(o, [t.dateCol]);
          var file = driveIdFromUrl_(col_(o, [t.fileCol]));
          if (raw === '' && !file) return;
          var exp = oldDate_(raw);
          if (raw !== '' && !exp) warn.push(sid + ' ' + t.label + ': tarikh "' + raw + '" tak difahami');
          appendObj_(qsh, qt.header, Object.assign(auditRow_(by), { cert_id: nextId_(ss, 'CRT', 5), staff_id: sid, jenis: t.key, no_sijil: '', expiry_date: exp, cert_file_id: file }));
          n4++;
        });
      });
      log.push('Staf: ' + n3 + ', sijil: ' + n4);
    }
  } finally {
    lock.releaseLock();
  }
  if (!log.length) throw new Error('Tiada tab IMPORT_KERETA / IMPORT_MOTOSIKAL / IMPORT_CHARGEMAN / IMPORT_CERT dijumpai.');
  var msg = 'importOldData: ' + log.join(', ') + (warn.length ? ' | Amaran: ' + warn.join(' | ') : '');
  audit_(by, 'IMPORT_OLD', log.join(', '), warn.length + ' amaran');
  Logger.log(msg);
  return { ditambah: log, amaran: warn };
}
