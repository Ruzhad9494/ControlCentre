/**
 * Setup.gs - setupSystem() untuk VP-GWR (BSD 6) + import draf / pending GWR v4.2 lama (BSD 7).
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
  Logger.log('Seterusnya: isi tab Settings (portal_url, emel_cc_OMP, emel_cc_PSS), kemudian import draf / pending lama (importOldData).');
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

/** ID, PO, telefon dan tarikh sebagai teks. */
function formatTextColumns_(ss) {
  var sh = ss.getSheetByName('Reports');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  ['report_id', 'client_req_id', 'tarikh', 'po_number', 'quotation_number', 'mos_number', 'pic_phone', 'sign_client_phone', 'client_sign_phone', 'time_in', 'time_out',
    'staff_signature_file_id', 'draft_pdf_file_id', 'client_signature_file_id', 'final_pdf_file_id', 'approval_token_hash'].forEach(function (f) {
    var col = header.indexOf(f) + 1;
    if (col) sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
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

/** Folder BSD 5: VP-Files/GWR/<OMP|PSS>/{Images,Signatures,PDF}. */
function ensureFolders_() {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(root, 'GWR');
  DEPTS.forEach(function (d) { var f = childFolder_(base, d); Object.keys(FOLDERS).forEach(function (k) { childFolder_(f, FOLDERS[k]); }); });
  return [root.getName(), 'GWR/{' + DEPTS.join(',') + '}/{Images,Signatures,PDF}'];
}

/** Trigger BSD 6: harian 3:00 tandakan pautan klien luput. Tiada pendua. */
function ensureTriggers_() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('dailyExpire') < 0) ScriptApp.newTrigger('dailyExpire').timeBased().everyDays(1).atHour(3).create();
}

function currentUserEmail_() {
  try { return Session.getEffectiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
}

/** Baca tab import. Header boleh di baris 1-5 (sistem lama: locateHeaderRow). Pulang [{ header lowercase: nilai }]. */
function readImportTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return null;
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var kata = ['reportid', 'ponumber', 'status'];
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
 * importOldData: salin tab "Reports" dari Sheet GWR OMP lama ke tab IMPORT_OMP, dan dari Sheet GWR PSS lama ke
 * IMPORT_PSS (Ctrl+A, Ctrl+C, Paste special > Values only), kemudian Run.
 * BSD 7: hanya report yang BELUM SELESAI dibawa:
 *   Draft   -> Draf (sambung isi di portal)
 *   Pending -> Luput (pautan lama tidak sah lagi kerana token mentahnya terdedah dalam CSV awam;
 *              staf tekan "Jana pautan baharu" untuk hantar semula kepada klien). PDF draf & tandatangan lama dikekalkan.
 * Approved kekal dalam Sheet lama (read-only). ReportID lama disimpan dalam client_req_id -> selamat dijalankan semula.
 */
function importOldData() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var by = currentUserEmail_();
  var sh = sheet_(ss, 'Reports');
  var log = [], warn = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var t = readTable_(sh);
    var seen = {};
    t.rows.forEach(function (r) { if (String(r.client_req_id).indexOf('LAMA-') === 0) seen[String(r.client_req_id)] = true; });
    DEPTS.forEach(function (dept) {
      var rows = readImportTab_(ss, 'IMPORT_' + dept);
      if (!rows) return;
      var n = 0, skip = 0;
      rows.forEach(function (o) {
        var oldId = String(col_(o, ['reportid'])).trim();
        var st = String(col_(o, ['status'])).trim().toLowerCase();
        if (!oldId) return;
        if (st !== 'draft' && st !== 'pending') { skip++; return; }
        var key = 'LAMA-' + dept + '-' + oldId.replace(/[^A-Za-z0-9-]/g, '');
        if (seen[key]) return;
        var imgs = [];
        try { imgs = JSON.parse(String(col_(o, ['draftimagedata']) || '[]')).filter(function (x) { return x && x.id; }).map(function (x) { return { id: String(x.id), desc: String(x.desc || '') }; }); } catch (e) { warn.push(oldId + ': gambar tak dapat dibaca'); }
        var manStr = String(col_(o, ['manpower', 'remarks'])).trim();
        var man = manStr.indexOf(' | ') >= 0 ? manStr.split('\n').filter(function (l) { return l.trim(); }).map(function (l) { var x = l.split(' | '); var c = function (v) { v = String(v || '').trim(); return v === '-' ? '' : v; }; return { role: c(x[0]), count: c(x[1]), names: c(x.slice(2).join(' | ')) }; })
          : (manStr ? [{ role: '', count: '', names: manStr }] : []);
        var jobDesc = String(col_(o, ['jobdesc'])).trim();
        var sd = String(col_(o, ['jobshutdown'])).trim().toUpperCase();
        var dt = oldDate_(col_(o, ['date']));
        appendObj_(sh, t.header, Object.assign(auditRow_(by), {
          report_id: nextId_(ss, 'GWR-' + dept, 5), dept: dept, client_req_id: key, tarikh: dt,
          po_number: String(col_(o, ['ponumber'])).trim(), quotation_number: String(col_(o, ['quotationnumber'])).trim(), mos_number: String(col_(o, ['mosnumber'])).trim(), project_id: '',
          client_company: String(col_(o, ['clientcompany'])).trim(), project_title: String(col_(o, ['projecttitle'])).trim(), location: String(col_(o, ['location'])).trim(),
          time_in: String(col_(o, ['timein'])).trim(), time_out: String(col_(o, ['timeout'])).trim(),
          pic_name: String(col_(o, ['picname'])).trim(), pic_phone: String(col_(o, ['picphone'])).trim().replace(/^'/, ''),
          job_items_json: JSON.stringify(jobDesc ? [{ desc: jobDesc, remark: '', shutdown: sd.indexOf('YES') === 0, voltage: '' }] : []), job_desc: jobDesc,
          job_shutdown: sd || 'NO', ptw: String(col_(o, ['ptw'])).trim().toUpperCase() === 'YES' ? 'YES' : 'NO',
          unresolved_issue: String(col_(o, ['unresolvedissue'])).trim(), manpower_json: JSON.stringify(man), manpower: manStr,
          sign_client_name: String(col_(o, ['clientsignname'])).trim(), sign_client_position: String(col_(o, ['clientsignposition'])).trim(), sign_client_phone: String(col_(o, ['clientsignphone'])).trim().replace(/^'/, ''),
          staff_email: normEmail_(col_(o, ['staffemail'])), staff_name: String(col_(o, ['staffname'])).trim(), staff_position: String(col_(o, ['staffposition'])).trim(),
          staff_signature_file_id: driveIdFromUrl_(col_(o, ['staffsignatureid'])), image_ids_json: JSON.stringify(imgs), upload_keys: '',
          draft_pdf_file_id: driveIdFromUrl_(col_(o, ['draftpdfid'])), approval_token_hash: '', approval_token_expires: '',
          status: st === 'pending' ? 'Luput' : 'Draf', submitted_at: st === 'pending' ? nowIso_() : '',
          client_sign_name: '', client_sign_position: '', client_sign_phone: '', client_email: '', client_signature_file_id: '', final_pdf_file_id: '', approved_at: '', client_ip_hash: '', emel_dihantar: ''
        }));
        seen[key] = true;
        n++;
      });
      log.push(dept + ': ' + n + ' (dilangkau Approved: ' + skip + ')');
    });
  } finally {
    lock.releaseLock();
  }
  if (!log.length) throw new Error('Tiada tab IMPORT_OMP / IMPORT_PSS dijumpai.');
  audit_(by, 'IMPORT_OLD', log.join(', '), warn.length + ' amaran');
  Logger.log('importOldData: ' + log.join(', ') + (warn.length ? ' | Amaran: ' + warn.join(' | ') : ''));
  return { ditambah: log, amaran: warn };
}
