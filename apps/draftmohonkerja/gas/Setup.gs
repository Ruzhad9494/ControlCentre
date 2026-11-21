/**
 * Setup.gs - setupSystem() untuk VP-HR (BSD 6) + import data sistem lama draftmohonkerja (BSD 7).
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
  Logger.log('Seterusnya: isi tab Settings (portal_url, hr_notify_emails), kemudian import jawatan & pemohon lama (importOldData).');
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

/** No. rujukan, IC, telefon dan tarikh sebagai teks (sistem lama: prefix ' supaya sifar depan tak hilang). */
function formatTextColumns_(ss) {
  var cols = {
    Positions: ['position_id', 'tarikh_tutup'],
    Applicants: ['app_no', 'position_id', 'ic', 'dob', 'tel_bimbit', 'tel_rumah', 'kecemasan_tel', 'ref1_tel', 'ref2_tel', 'tarikh_interview', 'retention_until', 'photo_file_id', 'signature_file_id', 'resume_file_id', 'borang_lama_file_id'],
    Interviews: ['interview_id', 'app_no', 'tarikh']
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

/** Folder BSD 5: VP-Files/HR/Photos, Signatures, Resumes, Forms (borang PDF sistem lama). */
function ensureFolders_() {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(root, 'HR');
  Object.keys(FOLDERS).forEach(function (k) { childFolder_(base, FOLDERS[k]); });
  return [root.getName(), 'HR/' + Object.keys(FOLDERS).map(function (k) { return FOLDERS[k]; }).join(',')];
}

/** Trigger BSD 6: harian 2:00 retention (F-14). Tiada pendua. */
function ensureTriggers_() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('dailyRetention') < 0) ScriptApp.newTrigger('dailyRetention').timeBased().everyDays(1).atHour(2).create();
}

function currentUserEmail_() {
  try { return Session.getEffectiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
}

/** Baca tab import. Header boleh di baris 1-5 (sistem lama: locateHeaderRow). Pulang [{ header lowercase: nilai }]. */
function readImportTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return null;
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var kata = ['jawatan', 'nama', 'department'];
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
 * importOldData: salin dari Sheet sistem lama (Ctrl+A, Ctrl+C, Paste special > Values only) ke tab dalam VP-HR:
 *   IMPORT_SETUP       <- tab "Setup" (Jawatan, Department)  -> Positions (aktif)
 *   IMPORT_PERMOHONAN  <- tab "Permohonan"                   -> Applicants
 * BSD 7: hanya pemohon yang MASIH AKTIF dibawa (Baru, Disaring, Temuduga Dijadualkan, Ditawarkan). Pemohon lain
 * kekal dalam Sheet lama yang dikunci. socso / kwsp TIDAK dibawa (PRD Q-09). Pautan Drive lama disimpan sebagai ID
 * fail (gambar, PDF borang); fail kekal di folder lama. Selamat dijalankan semula (No. ID lama dilangkau).
 */
function importOldData() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  assertEnvMatchesSpreadsheet_(ss);
  var by = currentUserEmail_();
  var log = [], warn = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var setup = readImportTab_(ss, 'IMPORT_SETUP');
    var psh = sheet_(ss, 'Positions');
    var pt = readTable_(psh);
    var havePos = {};
    pt.rows.forEach(function (r) { if (!isDeleted_(r)) havePos[textVal_(r.jawatan).toLowerCase()] = String(r.position_id); });
    if (setup) {
      var np = 0;
      setup.forEach(function (o) {
        var j = String(col_(o, ['jawatan'])).trim(), d = String(col_(o, ['department'])).trim();
        if (!j || havePos[j.toLowerCase()]) return;
        var id = nextId_(ss, 'POS', 3);
        appendObj_(psh, pt.header, Object.assign(auditRow_(by), { position_id: id, jawatan: j, department: d, lokasi: '', penerangan: '', aktif: 'TRUE', tarikh_tutup: '' }));
        havePos[j.toLowerCase()] = id;
        np++;
      });
      log.push('Jawatan: ' + np);
    }
    var rows = readImportTab_(ss, 'IMPORT_PERMOHONAN');
    if (rows) {
      var ash = sheet_(ss, 'Applicants');
      var at = readTable_(ash);
      var seen = {};
      at.rows.forEach(function (r) { var m = /ID lama: ([^\]\s;]+)/.exec(String(r.catatan_hr)); if (m) seen[m[1]] = true; });
      var aktif = { 'baru': 'Baru', 'disaring': 'Disaring', 'temuduga dijadualkan': 'Temuduga Dijadualkan', 'ditawarkan': 'Ditawarkan' };
      var na = 0, skipped = 0;
      rows.forEach(function (o, i) {
        var nama = String(col_(o, ['nama'])).trim();
        if (!nama) return;
        var oldId = String(col_(o, ['id'])).trim() || 'baris' + (i + 2);
        var st = aktif[String(col_(o, ['status']) || 'Baru').trim().toLowerCase()];
        if (!st) { skipped++; return; }
        if (seen[oldId]) return;
        var icRaw = String(col_(o, ['ic'])).replace(/[^0-9]/g, '');
        var ic = '', dob = '';
        try { var icd = cleanIcDob_(icRaw); ic = icd.ic; dob = icd.dob; } catch (e) { ic = icRaw; warn.push(nama + ': IC "' + icRaw + '" tak sah'); }
        var jawatan = String(col_(o, ['jawatan'])).trim();
        var jl = String(col_(o, ['jantina'])).trim();
        var phone = function (v) { try { return cleanPhone_(v, 'tel', false); } catch (e) { return String(v || '').replace(/^'/, ''); } };
        var ti = col_(o, ['tarikh_interview']);
        var created = col_(o, ['tarikh_mohon']);
        var createdIso = Object.prototype.toString.call(created) === '[object Date]' ? Utilities.formatDate(created, VP_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") : nowIso_();
        appendObj_(ash, at.header, Object.assign(auditRow_(by), {
          app_no: nextId_(ss, 'APP', 5), position_id: havePos[jawatan.toLowerCase()] || '', jawatan: jawatan,
          department: String(col_(o, ['department'])).trim(), nama: nama, ic: ic, dob: dob,
          jantina: jl.charAt(0).toUpperCase() === 'P' ? 'Perempuan' : jl ? 'Lelaki' : '', status_kahwin: String(col_(o, ['statuskahwin', 'status_kahwin'])).trim(),
          email: normEmail_(col_(o, ['email'])), tel_bimbit: phone(col_(o, ['telbimbit'])), tel_rumah: phone(col_(o, ['telrumah'])),
          alamat: String(col_(o, ['alamat'])).trim(),
          akademik_json: JSON.stringify([{ dari: '', hingga: '', institusi: String(col_(o, ['akademikstr'])).trim(), kelulusan: '' }].filter(function (x) { return x.institusi; })),
          pengalaman_json: JSON.stringify([{ dari: '', hingga: '', majikan: String(col_(o, ['pengalamanstr'])).trim(), jawatan: '' }].filter(function (x) { return x.majikan; })),
          kecemasan_nama: String(col_(o, ['namakecemasan'])).trim(), kecemasan_hubungan: String(col_(o, ['hubungankecemasan'])).trim(),
          kecemasan_jenis_tel: String(col_(o, ['jenistelkecemasan']) || 'Bimbit').trim(), kecemasan_tel: phone(col_(o, ['telkecemasan'])),
          pernah_disabit: String(col_(o, ['jenayah'])).trim(), disabit_penerangan: String(col_(o, ['alasanjenayah'])).trim(),
          gaji_dijangka: isFinite(Number(col_(o, ['gaji']))) && String(col_(o, ['gaji'])) !== '' ? Number(col_(o, ['gaji'])) : '',
          ref1_nama: String(col_(o, ['ref1nama'])).trim(), ref1_jawatan: String(col_(o, ['ref1jawatan'])).trim(), ref1_syarikat: String(col_(o, ['ref1syarikat'])).trim(), ref1_tel: phone(col_(o, ['ref1tel'])),
          ref2_nama: String(col_(o, ['ref2nama'])).trim(), ref2_jawatan: String(col_(o, ['ref2jawatan'])).trim(), ref2_syarikat: String(col_(o, ['ref2syarikat'])).trim(), ref2_tel: phone(col_(o, ['ref2tel'])),
          kebenaran_semak: String(col_(o, ['semak'])).trim(),
          photo_file_id: driveIdFromUrl_(col_(o, ['link_gambar'])), signature_file_id: '', resume_file_id: '', borang_lama_file_id: driveIdFromUrl_(col_(o, ['link_pdf'])),
          status: st, status_at: nowIso_(), tarikh_interview: oldDate_(ti), interview_tukar: Number(col_(o, ['interview_tukar'])) || 0,
          catatan_hr: (String(col_(o, ['catatan_hr'])).trim() + ' [ID lama: ' + oldId + ']').trim(),
          consent_at: '', consent_version: 'sistem-lama', ip_hash: '', retention_until: '', anonymised: 'FALSE', created_at: createdIso
        }));
        seen[oldId] = true;
        na++;
      });
      log.push('Pemohon aktif: ' + na + ' (dilangkau status akhir: ' + skipped + ')');
    }
  } finally {
    lock.releaseLock();
  }
  if (!log.length) throw new Error('Tiada tab IMPORT_SETUP / IMPORT_PERMOHONAN dijumpai.');
  audit_(by, 'IMPORT_OLD', log.join(', '), warn.length + ' amaran');
  Logger.log('importOldData: ' + log.join(', ') + (warn.length ? ' | Amaran: ' + warn.join(' | ') : ''));
  return { ditambah: log, amaran: warn };
}
