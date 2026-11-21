/**
 * Backup.gs - backup mingguan semua Sheet VP-* (BSD 8) + audit perkongsian Drive (IPD 3.2).
 *
 * weeklyBackup (trigger Ahad 2:00 pagi, dipasang oleh setupSystem):
 *   - cari 9 Sheet sistem ikut nama tepat (VP-Access, VP-CostCalc, ... atau VP-STG-* untuk staging)
 *   - makeCopy() ke VP-Backup/YYYY-MM-DD/ (folder sebelah VP-Files). Salinan TIDAK bawa perkongsian.
 *   - simpan 8 folder tarikh terakhir; yang lebih lama ke Trash (Drive padam sendiri selepas 30 hari)
 *   - emel ke backup_report_email (Settings, kosong = hr_report_email) jika ada Sheet tak dijumpai / gagal
 *
 * semakPerkongsian(betulkan) - jalankan MANUAL dari editor:
 *   - jelajah VP-Files, VP-Backup dan 9 Sheet sistem
 *   - lapor fail / folder yang dikongsi "anyone with link" / seluruh domain / terus kepada individu
 *   - semakPerkongsianBetulkan() tukar perkongsian pautan kepada PRIVATE. Perkongsian kepada individu
 *     hanya DILAPOR (mungkin sengaja, contoh superadmin kedua), Admin buang sendiri.
 */

var BACKUP_HANDLER = 'weeklyBackup';
var BACKUP_KEEP = 8;
var BACKUP_SHEETS = ['Access', 'CostCalc', 'ClaimPro', 'AMS', 'Compliance', 'HR', 'GWR', 'ClaimReport', 'Voltrack'];
var SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
var AUDIT_TIME_LIMIT_MS = 5 * 60 * 1000;   // had Apps Script 6 minit

function vpPrefix_() { return prop_('ENV') === 'staging' ? 'VP-STG-' : 'VP-'; }

function childFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** Folder VP-Backup (staging: VP-STG-Backup), sebelah VP-Files. ID disimpan dalam BACKUP_FOLDER_ID. */
function backupRoot_() {
  var id = optProp_('BACKUP_FOLDER_ID', '');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder dipadam: cipta semula */ }
  }
  var files = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var parents = files.getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var f = childFolder_(parent, vpPrefix_() + 'Backup');
  props_().setProperty('BACKUP_FOLDER_ID', f.getId());
  return f;
}

/** Senarai { nama, file } untuk Sheet sistem. Access diambil terus ikut SPREADSHEET_ID. */
function systemSheets_() {
  var pre = vpPrefix_();
  return BACKUP_SHEETS.map(function (m) {
    var nama = pre + m;
    if (m === 'Access') return { nama: nama, files: [DriveApp.getFileById(prop_('SPREADSHEET_ID'))] };
    var hit = [], it = DriveApp.getFilesByName(nama);
    while (it.hasNext()) {
      var f = it.next();
      if (f.getMimeType() === SHEET_MIME && !f.isTrashed()) hit.push(f);
    }
    return { nama: nama, files: hit };
  });
}

/** Trigger mingguan. Boleh juga dijalankan manual untuk uji. Pulang ringkasan. */
function weeklyBackup() {
  var now = new Date();
  var tarikh = Utilities.formatDate(now, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  var root = backupRoot_();
  var dest = childFolder_(root, tarikh);
  var ok = [], masalah = [];

  systemSheets_().forEach(function (s) {
    if (!s.files.length) { masalah.push(s.nama + ': tidak dijumpai (modul belum dipasang atau nama berubah)'); return; }
    if (s.files.length > 1) masalah.push(s.nama + ': ' + s.files.length + ' fail sama nama, semua disalin. Semak dan buang pendua.');
    s.files.forEach(function (f, i) {
      var nama = s.nama + (s.files.length > 1 ? ' #' + (i + 1) : '') + ' (backup ' + tarikh + ')';
      var lama = dest.getFilesByName(nama);
      if (lama.hasNext()) { ok.push(nama + ' (dah ada)'); return; }   // jalan semula hari sama: tiada pendua
      try {
        f.makeCopy(nama, dest);
        ok.push(nama);
      } catch (e) {
        masalah.push(s.nama + ': gagal salin (' + e.message + ')');
      }
    });
  });

  var dibuang = pruneBackups_(root, BACKUP_KEEP);
  var ringkasan = { tarikh: tarikh, folder: dest.getId(), disalin: ok, masalah: masalah, dibuang: dibuang };
  Logger.log('weeklyBackup: ' + JSON.stringify(ringkasan));
  if (masalah.length) notifyAdmin_('[Voltake Portal] Backup ' + tarikh + ': ' + masalah.length + ' masalah',
    'Backup mingguan selesai dengan masalah:\n\n- ' + masalah.join('\n- ') + '\n\nBerjaya: ' + ok.length + ' Sheet.');
  return ringkasan;
}

/** Simpan `keep` folder tarikh (YYYY-MM-DD) terbaru, yang lain ke Trash. Folder lain dibiar. */
function pruneBackups_(root, keep) {
  var dated = [], it = root.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.getName())) dated.push(f);
  }
  dated.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  return dated.slice(keep).map(function (f) { f.setTrashed(true); return f.getName(); });
}

function notifyAdmin_(subject, body) {
  try {
    var st = readSettings_(openAccess_());
    var to = String(st.backup_report_email || st.hr_report_email || '').trim();
    if (to) MailApp.sendEmail({ to: to, subject: subject, body: body });
  } catch (e) {
    Logger.log('notifyAdmin_ gagal: ' + e.message);
  }
}

function ensureBackupTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === BACKUP_HANDLER; });
  if (!exists) ScriptApp.newTrigger(BACKUP_HANDLER).timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
}

// ---------------------------------------------------------------------------------------------
// Audit perkongsian Drive (IPD 3.2)

function sharingIssue_(item) {
  var out = [];
  try {
    var a = String(item.getSharingAccess());
    if (a !== 'PRIVATE') out.push({ jenis: 'pautan', butiran: a + ' / ' + String(item.getSharingPermission()) });
  } catch (e) { out.push({ jenis: 'ralat', butiran: e.message }); }
  try {
    var owner = item.getOwner() ? String(item.getOwner().getEmail()).toLowerCase() : '';
    var people = item.getEditors().map(function (u) { return 'editor ' + u.getEmail(); })
      .concat(item.getViewers().map(function (u) { return 'viewer ' + u.getEmail(); }))
      .filter(function (s) { return s.toLowerCase().indexOf(' ' + owner) < 0 || !owner; });
    if (people.length) out.push({ jenis: 'individu', butiran: people.join(', ') });
  } catch (e) { /* item dalam shared drive: tiada getEditors untuk sesetengah jenis */ }
  return out;
}

function auditItem_(item, laluan, ctx) {
  sharingIssue_(item).forEach(function (x) {
    var rec = { laluan: laluan, id: item.getId(), jenis: x.jenis, butiran: x.butiran, dibetulkan: false };
    if (ctx.betulkan && x.jenis === 'pautan') {
      try { item.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); rec.dibetulkan = true; }
      catch (e) { rec.butiran += ' (gagal betulkan: ' + e.message + ')'; }
    }
    ctx.dapatan.push(rec);
  });
}

function walkFolder_(folder, laluan, ctx) {
  if (Date.now() - ctx.mula > AUDIT_TIME_LIMIT_MS) { ctx.tamat_masa = true; return; }
  ctx.folder++;
  auditItem_(folder, laluan + '/', ctx);
  var fi = folder.getFiles();
  while (fi.hasNext()) {
    var f = fi.next();
    ctx.fail++;
    auditItem_(f, laluan + '/' + f.getName(), ctx);
  }
  var di = folder.getFolders();
  while (di.hasNext() && !ctx.tamat_masa) {
    var d = di.next();
    walkFolder_(d, laluan + '/' + d.getName(), ctx);
  }
}

/** Lapor sahaja. Jalankan dari editor: pilih semakPerkongsian > Run > lihat Execution log. */
function semakPerkongsian(betulkan) {
  var ctx = { betulkan: betulkan === true, dapatan: [], fail: 0, folder: 0, mula: Date.now(), tamat_masa: false };
  systemSheets_().forEach(function (s) {
    s.files.forEach(function (f) { ctx.fail++; auditItem_(f, s.nama + ' (Sheet)', ctx); });
  });
  var files = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  walkFolder_(files, files.getName(), ctx);
  if (!ctx.tamat_masa) {
    var b = backupRoot_();
    walkFolder_(b, b.getName(), ctx);
  }
  Logger.log('semakPerkongsian: ' + ctx.fail + ' fail, ' + ctx.folder + ' folder diperiksa' +
    (ctx.tamat_masa ? ' (BERHENTI: had masa 5 minit, jalankan semula selepas betulkan dapatan)' : ''));
  if (!ctx.dapatan.length) Logger.log('OK: tiada perkongsian pautan atau individu dijumpai.');
  ctx.dapatan.forEach(function (d) {
    Logger.log((d.dibetulkan ? '[DIBETULKAN] ' : '[' + d.jenis.toUpperCase() + '] ') + d.laluan + ' -> ' + d.butiran + ' (id ' + d.id + ')');
  });
  return { fail: ctx.fail, folder: ctx.folder, tamat_masa: ctx.tamat_masa, dapatan: ctx.dapatan };
}

/** Tukar semua perkongsian pautan (anyone / domain) kepada PRIVATE. Individu hanya dilapor. */
function semakPerkongsianBetulkan() {
  return semakPerkongsian(true);
}

// ---------------------------------------------------------------------------------------------
// Saiz data (IPD 3.6, kriteria Supabase TRD 7 #1): jalankan MANUAL setiap suku tahun.

var SIZE_WARN_ROWS = 30000;    // amaran awal
var SIZE_MOVE_ROWS = 50000;    // kriteria TRD 7: pertimbang pindah ke Supabase

/** Kira baris setiap tab dalam 9 Sheet sistem. Lapor tab yang hampir / lepas ambang. */
function laporanSaizData() {
  var out = [];
  systemSheets_().forEach(function (s) {
    s.files.forEach(function (f) {
      var ss = SpreadsheetApp.openById(f.getId());
      ss.getSheets().forEach(function (sh) {
        var rows = Math.max(sh.getLastRow() - 1, 0);
        var tahap = rows >= SIZE_MOVE_ROWS ? 'PINDAH' : rows >= SIZE_WARN_ROWS ? 'AMARAN' : 'OK';
        out.push({ sheet: s.nama, tab: sh.getName(), baris: rows, tahap: tahap });
      });
    });
  });
  out.sort(function (a, b) { return b.baris - a.baris; });
  out.forEach(function (r) { Logger.log('[' + r.tahap + '] ' + r.sheet + ' / ' + r.tab + ': ' + r.baris + ' baris'); });
  var besar = out.filter(function (r) { return r.tahap !== 'OK'; });
  Logger.log(besar.length ? besar.length + ' tab melepasi ' + SIZE_WARN_ROWS + ' baris. Rujuk docs/penilaian-supabase.md.' : 'Semua tab bawah ' + SIZE_WARN_ROWS + ' baris. Sheets masih sesuai.');
  return out;
}
