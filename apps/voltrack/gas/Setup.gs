/**
 * Setup.gs - setupSystem() untuk VP-Voltrack (BSD 6) + import projek VoltTrack v2 lama (BSD 7).
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
  ensureTriggers_();
  Logger.log('setupSystem selesai: ' + ss.getName() + ' | ' + report.join(' | '));
  Logger.log('Seterusnya: isi Settings (portal_url, emel_peringatan), kemudian import projek lama (importOldData).');
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

/** ID, tarikh, no. invois / PO / quotation sebagai teks. */
function formatTextColumns_(ss) {
  PHASES.forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    header.forEach(function (f, i) {
      if (f === 'id' || DATE_FIELDS.indexOf(f) >= 0 || ['quotation_no', 'invoice_no', 'po_no', 'gwr_report_ids'].indexOf(f) >= 0) {
        sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
      }
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

/** Trigger BSD 6: harian 8:00 kira tunggakan + emel (sistem lama: semakNotifikasiHarian). Tiada pendua. */
function ensureTriggers_() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('dailyOverdue') < 0) ScriptApp.newTrigger('dailyOverdue').timeBased().everyDays(1).atHour(8).create();
}

function currentUserEmail_() {
  try { return Session.getEffectiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
}

/** Tarikh lama: objek Date, "yyyy-mm-dd", "dd/mm/yyyy". */
function oldDate_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, VP_TZ, 'yyyy-MM-dd');
  var s = String(v).trim();
  var out = '';
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) out = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s))) out = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return validDate_(out) ? out : '';
}

/** Baca tab import (header baris 1 = nama lajur SCHEMA lama). Pulang { id: {lajur: nilai} }. */
function readOldTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return {};
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var header = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var out = {};
  values.slice(1).forEach(function (row) {
    var o = {};
    header.forEach(function (h, i) { if (h) o[h] = row[i]; });
    var id = String(o.id || '').trim();
    if (id) out[id] = o;
  });
  return out;
}

/**
 * importOldData: salin 4 tab dari Sheet VoltTrack lama (Commercial, Operation, Claim, LOD) ke tab
 * IMPORT_COMMERCIAL, IMPORT_OPERATION, IMPORT_CLAIM, IMPORT_LOD (Paste special > Values only). Tab Users TIDAK dibawa.
 * Ikut BSD 7: hanya projek BELUM TUTUP dibawa (tutup = quotation Cancel, atau Paid, atau kes LOD Closed).
 * importOldDataSemua(): bawa semua projek (untuk sejarah dashboard). Selamat dijalankan semula (padan ikut id).
 */
function importOldData() { return importOld_(false); }
function importOldDataSemua() { return importOld_(true); }

function importOld_(semua) {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var src = {};
  PHASES.forEach(function (t) { src[t] = readOldTab_(ss, 'IMPORT_' + t.toUpperCase()); });
  if (!Object.keys(src.Commercial).length) throw new Error('Tab IMPORT_COMMERCIAL tiada atau kosong.');
  var by = currentUserEmail_();
  var n = 0, ditutup = 0, ada = 0, warn = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var all = readAll_(ss);
    Object.keys(src.Commercial).forEach(function (id) {
      if (!ID_RE.test(id)) { warn.push(id + ': ID tak dikenali, dilangkau'); return; }
      if (all.byId.Commercial[id]) { ada++; return; }
      var c = src.Commercial[id], cl = src.Claim[id] || {}, l = src.LOD[id] || {};
      var closed = String(c.status_quotation).trim() === 'Cancel' || String(cl.payment_status).trim() === 'Paid' || String(l.case_status).trim() === 'Closed';
      if (closed && !semua) { ditutup++; return; }
      PHASES.forEach(function (tab) {
        var o = src[tab][id] || {};
        var row = Object.assign({ id: id }, auditRow_(by, 'Sistem lama'));
        PHASE_FIELDS[tab].forEach(function (k) {
          var v = o[k];
          if (v === undefined || v === null) v = '';
          if (DATE_FIELDS.indexOf(k) >= 0) {
            var d = oldDate_(v);
            if (String(v).trim() && !d) warn.push(id + ': ' + k + ' tak sah (' + v + ')');
            v = d;
          } else if (k === 'quotation_amount') v = v === '' ? '' : Number(String(v).replace(/[^\d.\-]/g, '')) || 0;
          else v = String(v).trim();
          if (OPTIONS[k] && v && OPTIONS[k].indexOf(v) < 0) { warn.push(id + ': ' + k + ' "' + v + '" bukan pilihan sah'); v = ''; }
          row[k] = v;
        });
        appendObj_(sheet_(ss, tab), all.tables[tab].header, row);
      });
      n++;
    });
    var all2 = readAll_(ss), s = settingsMap_(ss);
    Object.keys(all2.byId.Commercial).forEach(function (id) { var p = joined_(all2, id); if (p) persistDerived_(ss, all2, p, s); });
  } finally {
    lock.releaseLock();
  }
  audit_(by, 'IMPORT_OLD', 'projek: ' + n, ditutup + ' tutup dilangkau, ' + ada + ' sudah ada, ' + warn.length + ' amaran');
  Logger.log('importOldData: projek ditambah ' + n + ' (tutup dilangkau: ' + ditutup + ', sudah ada: ' + ada + ')' + (warn.length ? ' | Amaran: ' + warn.join(' | ') : ''));
  return { ditambah: n, tutup_dilangkau: ditutup, sudah_ada: ada, amaran: warn };
}
