/**
 * Setup.gs - setupSystem() untuk VP-ClaimPro (BSD 6). Jalankan SEKALI dari editor Apps Script.
 * Idempotent: cipta tab/header yang tiada, tambah lajur yang hilang, seed tab kosong sahaja.
 */

function setupSystem() {
  checkConfig();
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var ctx = { now: nowIso_(), by: currentUserEmail_() };
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

    var seeded = 0;
    if (sh.getLastRow() <= 1) {
      var rows = buildSeed_(name, ctx);
      if (rows && rows.length) {
        var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
        var aligned = rows.map(function (r) { return header.map(function (h) { var i = want.indexOf(h); return i >= 0 ? r[i] : ''; }); });
        sh.getRange(2, 1, aligned.length, header.length).setValues(aligned);
        seeded = aligned.length;
      }
    }
    report.push(name + (created ? ' (baru)' : '') + (missing.length && !created ? ' +' + missing.join(',') : '') + (seeded ? ' seed=' + seeded : ''));
  });

  formatTextColumns_(ss);
  applyValidation_(ss);
  var folders = ensureFolders_();
  ensureTriggers_();
  Logger.log('setupSystem selesai: ' + ss.getName() + ' | ' + report.join(' | ') + ' | folder: ' + folders.join(', '));
  Logger.log('Seterusnya: isi tab Settings (portal_url, admin_notify_emails, head_report_email) dan semak tab ClaimTypes.');
  return report;
}

/** Elak Sheets tukar ID/nombor panjang jadi nombor saintifik atau tarikh. */
function formatTextColumns_(ss) {
  var sh = ss.getSheetByName('Claims');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  ['claim_id', 'staff_id', 'receipt_file_id', 'received_proof_file_id'].forEach(function (f) {
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

/** Folder BSD 5: VP-Files/ClaimPro/Receipts dan /Payments (subfolder bulan dicipta bila perlu). */
function ensureFolders_() {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(root, 'ClaimPro');
  childFolder_(base, 'Receipts');
  childFolder_(base, 'Payments');
  return [root.getName(), 'ClaimPro/Receipts', 'ClaimPro/Payments'];
}

/** Trigger BSD 6: harian 2:00 arkib, harian 9:00 peringatan, bulanan laporan beza bayaran. Tiada pendua. */
function ensureTriggers_() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('dailyArchive') < 0) ScriptApp.newTrigger('dailyArchive').timeBased().everyDays(1).atHour(2).create();
  if (have.indexOf('dailyReminders') < 0) ScriptApp.newTrigger('dailyReminders').timeBased().everyDays(1).atHour(9).create();
  if (have.indexOf('monthlyBezaReport') < 0) ScriptApp.newTrigger('monthlyBezaReport').timeBased().onMonthDay(1).atHour(8).create();
}

function currentUserEmail_() {
  try { return Session.getEffectiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
}
