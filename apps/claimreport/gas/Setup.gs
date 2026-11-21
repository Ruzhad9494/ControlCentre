/**
 * Setup.gs - setupSystem() untuk VP-ClaimReport (BSD 6) + import Database DO lama (BSD 7).
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
  var parties = ensureParties_(ss);
  if (parties) report.push('Parties +' + parties);
  formatTextColumns_(ss);
  applyValidation_(ss);
  ensureFolders_();
  var s = settingsMap_(ss);
  var tpl = ss.getSheetByName(s.template_tab || 'Template');
  report.push(tpl ? 'Template: ada' : 'Template: TIADA (salin dari Sheet lama)');
  Logger.log('setupSystem selesai: ' + ss.getName() + ' | ' + report.join(' | ') + ' | folder: VP-Files/ClaimReport/{PDF,EXCEL}');
  if (!tpl) Logger.log('Seterusnya: salin tab "Template" dari Sheet DO SUNGROW lama (klik kanan tab > Copy to > VP-ClaimReport, kemudian namakan "Template").');
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

/** Seed preset From sistem lama (JingDong, Koennen) jika belum ada. */
function ensureParties_(ss) {
  var sh = ss.getSheetByName('Parties');
  var t = readTable_(sh);
  var have = t.rows.map(function (r) { return String(r.jenis) + '|' + String(r.nama).toLowerCase(); });
  var n = 0, now = nowIso_(), by = currentUserEmail_();
  PARTIES_SEED.forEach(function (p) {
    if (have.indexOf(p[0] + '|' + p[1].toLowerCase()) >= 0) return;
    appendObj_(sh, t.header, { party_id: nextId_(ss, 'PTY', 4), jenis: p[0], nama: p[1], alamat: p[2], attn: p[3], tel: p[4], created_at: now, created_by: by, updated_at: now, updated_by: by, deleted: 'FALSE', deleted_reason: '' });
    n++;
  });
  return n;
}

/** No. DO, rujukan, telefon dan tarikh sebagai teks (Sheets tukar "2606230354" jadi nombor). */
function formatTextColumns_(ss) {
  [['DeliveryOrders', ['do_id', 'report_name', 'do_no', 'do_no_all', 'ref_no', 'ma_no', 'tarikh', 'apac', 'from_tel', 'to_tel', 'truck', 'pdf_file_id', 'xlsx_file_id']],
    ['Parties', ['party_id', 'tel']]].forEach(function (x) {
    var sh = ss.getSheetByName(x[0]);
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    x[1].forEach(function (f) {
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

function ensureFolders_() {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(root, 'ClaimReport');
  childFolder_(base, 'PDF');
  childFolder_(base, 'EXCEL');
}

function currentUserEmail_() {
  try { return Session.getEffectiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
}

/** Tarikh lama: objek Date, "dd/mm/yyyy", "yyyy-mm-dd". Pulang YYYY-MM-DD atau ''. */
function oldDate_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, VP_TZ, 'yyyy-MM-dd');
  var s = String(v).trim();
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  var out = '';
  if (m) out = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = m ? null : /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);
  if (m) out = (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return validDate_(out) ? out : '';
}

/**
 * importOldData: salin tab "Database" dari Sheet DO SUNGROW lama ke tab IMPORT_DATABASE (Paste special > Values only).
 * Lajur ikut logToDatabase() lama (susunan tetap, A hingga X):
 *   No, Timestamp, DO No, RW, MA, Date, APAC, From Name, From Address, From Attn, From Tel, To Name, To Address,
 *   To Attn, To Tel, Total Items, Items JSON, Total Carton, Truck, Note, Signer, PDF Link, Excel Link, Refs & APAC (JSON)
 * Semua DO lama dibawa (bil kekal supaya nombor seterusnya bersambung dan semakan DO No pendua merangkumi DO lama).
 * PDF / Excel lama dirujuk ikut ID fail (fail kekal di folder lama). Selamat dijalankan semula (padan ikut DO No).
 */
function importOldData() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var src = ss.getSheetByName('IMPORT_DATABASE');
  if (!src || src.getLastRow() < 2) throw new Error('Tab IMPORT_DATABASE tiada atau kosong.');
  var values = src.getRange(1, 1, src.getLastRow(), Math.max(src.getLastColumn(), 24)).getValues();
  var by = currentUserEmail_();
  var sh = sheet_(ss, 'DeliveryOrders');
  var n = 0, skip = 0, warn = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var t = readTable_(sh);
    var seen = {};
    t.rows.forEach(function (r) { if (!isDeleted_(r)) seen[String(unsanitize_(r.do_no)).trim()] = true; });
    values.forEach(function (v, i) {
      var bil = parseInt(v[0], 10);
      var doNo = String(v[2]).trim();
      if (isNaN(bil) || !doNo) return;                  // baris header / kosong
      if (seen[doNo]) { skip++; return; }
      var items = [];
      try { items = JSON.parse(String(v[16] || '[]')); } catch (e) { warn.push(doNo + ': item tak dapat dibaca'); }
      if (!Array.isArray(items)) items = [];
      var meta = {};
      try { meta = JSON.parse(String(v[23] || '{}')) || {}; } catch (e) { meta = {}; }
      var tarikh = oldDate_(v[5]);
      if (!tarikh) warn.push(doNo + ': tarikh tak sah (' + v[5] + ')');
      var created = Object.prototype.toString.call(v[1]) === '[object Date]' ? Utilities.formatDate(v[1], VP_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") : nowIso_();
      var apac = String(v[6]).trim();
      appendObj_(sh, t.header, {
        do_id: nextId_(ss, 'DO', 5), bil: bil, report_name: bil + '. ' + doNo, do_no: doNo, do_no_all: doNo,
        ref_no: String(v[3]).trim(), ma_no: String(v[4]).trim(), tarikh: tarikh, apac: apac,
        apac_json: JSON.stringify(Array.isArray(meta.apacs) ? meta.apacs : (apac ? apac.split(/\s*,\s*/) : [])),
        from_name: String(v[7]).trim(), from_address: String(v[8]).trim(), from_attn: String(v[9]).trim(), from_tel: String(v[10]).trim(),
        to_name: String(v[11]).trim(), to_address: String(v[12]).trim(), to_attn: String(v[13]).trim(), to_tel: String(v[14]).trim(),
        item_count: parseInt(v[15], 10) || items.length, items_json: JSON.stringify(items), total_carton: String(v[17]).trim(),
        jumlah_qty: items.reduce(function (a, it) { return a + (Number(it && it.qty) || 0); }, 0),
        truck: String(v[18]).trim(), note: String(v[19]).trim(), signer: String(v[20]).trim(),
        pdf_file_id: driveIdFromUrl_(v[21]), xlsx_file_id: driveIdFromUrl_(v[22]),
        refs_json: JSON.stringify(meta && Array.isArray(meta.refs) ? meta : {}), sumber: 'lama', created_by_name: 'Sistem lama',
        created_at: created, created_by: by, updated_at: nowIso_(), updated_by: by, deleted: 'FALSE', deleted_reason: ''
      });
      seen[doNo] = true;
      n++;
    });
  } finally {
    lock.releaseLock();
  }
  audit_(by, 'IMPORT_OLD', 'DO lama: ' + n, skip + ' dilangkau, ' + warn.length + ' amaran');
  Logger.log('importOldData: DO lama ditambah ' + n + ' (dilangkau sudah ada: ' + skip + ')' + (warn.length ? ' | Amaran: ' + warn.join(' | ') : ''));
  return { ditambah: n, dilangkau: skip, amaran: warn };
}
