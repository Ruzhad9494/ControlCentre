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

  var addedSettings = ensureSettings_(ss);
  if (addedSettings.length) report.push('Settings +' + addedSettings.join(','));
  formatTextColumns_(ss);
  applyValidation_(ss);
  var folders = ensureFolders_();
  ensureTriggers_();
  Logger.log('setupSystem selesai: ' + ss.getName() + ' | ' + report.join(' | ') + ' | folder: ' + folders.join(', '));
  Logger.log('Seterusnya: isi tab Settings (portal_url, admin_notify_emails, head_report_email) dan semak tab ClaimTypes.');
  return report;
}

/** Tambah kunci Settings baharu yang belum ada (Sheet yang disetup dengan versi lebih awal). Nilai sedia ada tak disentuh. */
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

/**
 * syncOldClaimRules: Run SEKALI dari editor jika tab ClaimTypes disetup sebelum peraturan sistem lama ditambah.
 * - betulkan nama lama ("Makan & Minuman" -> "Makan & Minum")
 * - Perubatan: had tahunan RM350 (hanya jika kosong); Makan & Minum: had ikut sesi makan
 * - tambah jenis sistem lama yang tiada (contoh Keraian)
 * Tidak padam jenis lain dan tidak ubah had yang admin dah tetapkan.
 */
function syncOldClaimRules() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var sh = sheet_(ss, 'ClaimTypes');
  var t = readTable_(sh);
  if (t.header.indexOf('had_tahunan_rm') < 0 || t.header.indexOf('guna_sesi_makan') < 0) throw new Error('Jalankan setupSystem() dahulu untuk tambah lajur baharu.');
  var now = nowIso_(), by = currentUserEmail_(), log = [];
  var byName = function (n) { return t.rows.filter(function (r) { return !isDeleted_(r) && String(unsanitize_(r.jenis)).trim().toLowerCase() === n.toLowerCase(); })[0]; };
  TYPE_SEED.forEach(function (seed) {
    var row = byName(seed[0]);
    if (!row) (TYPE_ALIASES[seed[0]] || []).some(function (alias) { row = byName(alias); return Boolean(row); });
    if (row) {
      var upd = {};
      if (String(unsanitize_(row.jenis)).trim() !== seed[0]) upd.jenis = seed[0];
      if (seed[2] !== '' && (row.had_tahunan_rm === '' || row.had_tahunan_rm === null)) upd.had_tahunan_rm = seed[2];
      if (seed[3] && String(row.guna_sesi_makan).toUpperCase() !== 'TRUE') upd.guna_sesi_makan = 'TRUE';
      if (Object.keys(upd).length) {
        upd.updated_at = now; upd.updated_by = by;
        updateRowObj_(sh, t.header, row._row, upd);
        log.push(seed[0] + ': ' + Object.keys(upd).filter(function (k) { return k.indexOf('updated') < 0; }).join(','));
      }
    } else {
      appendObj_(sh, t.header, { jenis: seed[0], had_rm: '', had_tahunan_rm: seed[2], guna_sesi_makan: seed[3] ? 'TRUE' : 'FALSE', perlu_resit: seed[1] ? 'TRUE' : 'FALSE', aktif: 'TRUE', created_at: now, created_by: by, updated_at: now, updated_by: by, deleted: 'FALSE', deleted_reason: '' });
      log.push(seed[0] + ': ditambah');
    }
  });
  Logger.log('syncOldClaimRules: ' + (log.length ? log.join(' | ') : 'tiada perubahan'));
  return log;
}

/** Elak Sheets tukar ID/nombor panjang jadi nombor saintifik atau tarikh. */
function formatTextColumns_(ss) {
  var sh = ss.getSheetByName('Claims');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  ['claim_id', 'staff_id', 'receipt_file_id', 'received_proof_file_id', 'paid_proof_file_id'].forEach(function (f) {
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
