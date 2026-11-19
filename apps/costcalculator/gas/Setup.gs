/**
 * Setup.gs - setupSystem() untuk VP-CostCalc (BSD 6). Jalankan SEKALI dari editor.
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

  applyValidation_(ss);
  Logger.log('setupSystem selesai: ' + ss.getName() + ' | ' + report.join(' | '));
  Logger.log('Seterusnya: admin costcalc isi nilai kadar di portal (Cost Calculator > Kadar).');
  return report;
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

function currentUserEmail_() {
  try { return Session.getEffectiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
}
