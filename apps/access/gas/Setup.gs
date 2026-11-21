/**
 * Setup.gs - setupSystem() untuk VP-Access (BSD 6, IPD task 0.6).
 *
 * Jalankan SEKALI dari editor Apps Script sebagai systems@voltake.com.
 * Idempotent: cipta tab/header yang belum wujud, tambah lajur yang hilang di
 * hujung, seed hanya tab yang masih kosong. TIDAK padam atau ubah data sedia ada.
 */

var HEADER_BG = '#F3F6FA';
var INACTIVE_REPORT_HANDLER = 'monthlyInactiveReport';

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
    // Buang sel kosong di hujung header (lajur kosong) supaya tambah lajur bermula selepas header sebenar
    while (have.length && have[have.length - 1] === '') have.pop();

    var missing = want.filter(function (h) { return have.indexOf(h) < 0; });
    if (missing.length) {
      sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground(HEADER_BG);

    var seeded = 0;
    if (sh.getLastRow() <= 1) {
      var rows = buildSeed_(name, ctx);
      if (rows && rows.length) {
        // Seed ikut susunan header SEBENAR dalam Sheet (mungkin berbeza jika lajur ditambah manual)
        var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
        var aligned = rows.map(function (r) {
          return header.map(function (h) {
            var i = want.indexOf(h);
            return i >= 0 ? r[i] : '';
          });
        });
        sh.getRange(2, 1, aligned.length, header.length).setValues(aligned);
        seeded = aligned.length;
      }
    }
    report.push(name + (created ? ' (baru)' : '') + (missing.length && !created ? ' +' + missing.join(',') : '') + (seeded ? ' seed=' + seeded : ''));
  });

  var addedKeys = ensureSettingsKeys_(ss);
  if (addedKeys.length) report.push('Settings +' + addedKeys.join(','));
  formatTextColumns_(ss);
  ensureCounters_(ss);
  ensureFolders_();
  ensureTriggers_();
  applyValidation_(ss);

  if (!superadminSeed_()) {
    Logger.log('AMARAN: SEED_SUPERADMIN_EMAIL kosong. Staff/UserAccess tidak di-seed. Isi Script Properties dan jalankan semula.');
  } else {
    Logger.log('Seed superadmin selesai. Padam Script Properties SEED_SUPERADMIN_* sekarang.');
  }
  Logger.log('setupSystem selesai: ' + ss.getName() + ' | ' + report.join(' | '));
  return report;
}

/** google_sub ialah nombor panjang; format teks supaya Sheets tak tukar ke 1.2E+20. */
function formatTextColumns_(ss) {
  var sh = ss.getSheetByName('Staff');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  ['google_sub', 'staff_id'].forEach(function (f) {
    var col = header.indexOf(f) + 1;
    if (col) sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
}

/** access belum guna ID berjujukan; tab _Counters disediakan untuk konsistensi corak. */
function ensureCounters_(ss) {
  return ss.getSheetByName('_Counters');
}

/** Pastikan ROOT_FOLDER_ID wujud dan boleh dicapai oleh akaun sistem. */
function ensureFolders_() {
  var folder = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  return folder.getName();
}

/** Trigger bulanan: laporan staf aktif tak login > N hari (BSD 6). Tiada pendua. */
function ensureTriggers_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === INACTIVE_REPORT_HANDLER;
  });
  if (!exists) {
    ScriptApp.newTrigger(INACTIVE_REPORT_HANDLER).timeBased().onMonthDay(1).atHour(8).create();
  }
  ensureBackupTrigger_();   // Backup.gs: Ahad 2:00 pagi (BSD 8)
}

/** Tambah kunci Settings baru (versi kod lebih baru) tanpa sentuh nilai sedia ada. */
function ensureSettingsKeys_(ss) {
  var sh = ss.getSheetByName('Settings');
  if (!sh || sh.getLastRow() < 1) return [];
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

function applyValidation_(ss) {
  VALIDATIONS.forEach(function (v) {
    var sh = ss.getSheetByName(v[0]);
    if (!sh) return;
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var col = header.indexOf(v[1]) + 1;
    if (!col) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(v[2], true)
      .setAllowInvalid(false)
      .build();
    var rows = Math.max(sh.getMaxRows() - 1, 1);
    sh.getRange(2, col, rows, 1).setDataValidation(rule);
  });
}

function currentUserEmail_() {
  try {
    return Session.getEffectiveUser().getEmail() || 'system';
  } catch (e) {
    return 'system';
  }
}
