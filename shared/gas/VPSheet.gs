/**
 * VPSheet.gs - baca/tulis Sheet dengan selamat (BSD 1 konvensyen).
 * SUMBER: shared/gas/. Disalin ke apps/<modul>/gas/ oleh tools/sync-shared-gas.sh.
 */

/** Elak formula injection: nilai teks bermula = + - @ (atau tab/CR) diberi prefix '. */
function sanitizeForSheet(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  var s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

/** Buang prefix ' yang ditambah sanitizeForSheet semasa paparan. */
function unsanitize_(v) {
  return (typeof v === 'string' && /^'[=+\-@\t\r]/.test(v)) ? v.slice(1) : v;
}

function sheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" tiada. Jalankan setupSystem().');
  return sh;
}

/**
 * Baca seluruh tab sebagai { header, rows } di mana rows = [{_row, kolum: nilai}].
 * _row = nombor baris sebenar dalam Sheet (untuk kemas kini).
 */
function readTable_(sh) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { header: [], rows: [] };
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var header = values[0].map(String);
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var line = values[i];
    if (line.every(function (c) { return c === '' || c === null; })) continue;
    var obj = { _row: i + 1 };
    for (var j = 0; j < header.length; j++) if (header[j]) obj[header[j]] = line[j];
    rows.push(obj);
  }
  return { header: header, rows: rows };
}

function isDeleted_(row) {
  return String(row.deleted).toUpperCase() === 'TRUE';
}

/**
 * Tambah satu baris ikut header. Nilai dari obj disanitize.
 * Guna appendRow (atom): getLastRow()+1 lalu setValues boleh menimpa baris yang sama bila dua
 * pelaksanaan serentak (contoh dua tulisan AuditLog tanpa kunci).
 */
function appendObj_(sh, header, obj) {
  var line = header.map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? sanitizeForSheet(obj[h]) : ''; });
  sh.appendRow(line);
}

/** Kemas kini medan tertentu pada baris rowNum. Nilai disanitize. */
function updateObj_(sh, header, rowNum, fields) {
  Object.keys(fields).forEach(function (k) {
    var col = header.indexOf(k);
    if (col < 0) throw new Error('Lajur tiada: ' + k);
    sh.getRange(rowNum, col + 1, 1, 1).setValues([[sanitizeForSheet(fields[k])]]);
  });
}

/**
 * Kemas kini banyak medan pada satu baris dengan SATU panggilan baca + SATU tulis
 * (updateObj_ buat satu panggilan setiap medan: perlahan untuk baris lebar).
 */
function updateRowObj_(sh, header, rowNum, fields) {
  var range = sh.getRange(rowNum, 1, 1, header.length);
  var vals = range.getValues()[0];
  Object.keys(fields).forEach(function (k) {
    var col = header.indexOf(k);
    if (col < 0) throw new Error('Lajur tiada: ' + k);
    vals[col] = sanitizeForSheet(fields[k]);
  });
  range.setValues([vals]);
}

/** ID berjujukan <PREFIX>-<YYYY>-<NNNNN> guna tab _Counters + LockService (BSD 1). */
function nextId_(ss, prefix, width) {
  // Jangan lepaskan kunci milik pemanggil: simpan hasLock() dahulu (pepijat Fasa 2A dibetulkan)
  var lock = LockService.getScriptLock();
  var held = lock.hasLock();
  if (!held) lock.waitLock(10000);
  try {
    var sh = sheet_(ss, '_Counters');
    var year = Utilities.formatDate(new Date(), VP_TZ, 'yyyy');
    var key = prefix + '-' + year;
    var t = readTable_(sh);
    var hit = t.rows.filter(function (r) { return r.key === key; })[0];
    var n = hit ? (parseInt(hit.value, 10) || 0) + 1 : 1;
    if (hit) updateObj_(sh, t.header, hit._row, { value: n });
    else appendObj_(sh, t.header, { key: key, value: n });
    var num = String(n);
    while (num.length < (width || 5)) num = '0' + num;
    return key + '-' + num;
  } finally {
    if (!held) lock.releaseLock();
  }
}
