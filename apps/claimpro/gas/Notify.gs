/**
 * Notify.gs - emel (MailApp) + kerja berjadual ClaimPro (AFD 7).
 * Emel sengaja ringkas: tiada resit, tiada butiran perubatan, hanya ID, jenis, amaun dan pautan.
 * Kegagalan emel TIDAK boleh membatalkan tindakan utama.
 */

function settingsMap_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Settings');
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) { if (r.key !== '') out[String(r.key)] = String(unsanitize_(r.value)); });
  return out;
}

function mail_(to, subject, body) {
  var list = String(to || '').split(',').map(function (s) { return normEmail_(s); }).filter(String);
  if (!list.length) return false;
  try {
    MailApp.sendEmail({ to: list.join(','), subject: subject, body: body, name: 'Voltake Portal' });
    return true;
  } catch (e) {
    Logger.log('Emel gagal: ' + e);
    return false;
  }
}

function portalLink_(settings, hash) {
  var base = String(settings.portal_url || '').replace(/\/+$/, '');
  return base ? base + '/claimpro/' + hash : 'Buka Voltake Portal > ClaimPro';
}

var MAIL_FOOT = '\n\nEmel automatik Voltake ClaimPro. Jangan balas emel ini.';

function notifyAdminsSubmitted_(ss, claim) {
  var s = settingsMap_(ss);
  mail_(s.admin_notify_emails,
    '[Voltake ClaimPro] Tuntutan ' + claim.claim_id + ' menunggu kelulusan',
    claim.staff_name + ' (' + claim.department + ') menghantar tuntutan ' + claim.jenis + ' RM ' + Number(claim.amaun_rm).toFixed(2) + '.\n\nSemak di: ' + portalLink_(s, '#/lulus') + MAIL_FOOT);
}

function notifyStaffDecision_(ss, claim) {
  var s = settingsMap_(ss);
  var ok = claim.status === 'Lulus';
  mail_(claim.staff_email,
    '[Voltake ClaimPro] Tuntutan ' + claim.claim_id + (ok ? ' diluluskan' : ' ditolak'),
    'Tuntutan ' + claim.jenis + ' RM ' + Number(claim.amaun_rm).toFixed(2) + ' anda ' + (ok ? 'telah diluluskan.\n\nSelepas anda terima bayaran, sila sahkan di: ' : 'ditolak.\nSebab: ' + claim.sebab_tolak + '\n\nLihat di: ') +
    portalLink_(s, '#/c/' + encodeURIComponent(claim.claim_id)) + MAIL_FOOT);
}

function notifyBeza_(ss, claim) {
  var s = settingsMap_(ss);
  mail_(s.admin_notify_emails,
    '[Voltake ClaimPro] Beza bayaran ' + claim.claim_id,
    claim.staff_name + ' mengesahkan terima RM ' + Number(claim.received_amount_rm).toFixed(2) + ' bagi tuntutan lulus RM ' + Number(claim.amaun_rm).toFixed(2) + '. Jumlah berbeza, sila semak.\n\n' + portalLink_(s, '#/laporan') + MAIL_FOOT);
}

// ---------------------------------------------------------------- kerja berjadual

/** Harian 9:00: peringatan kepada staf bila claim Lulus belum disahkan selepas N hari (F-52). Ulang setiap 7 hari. */
function dailyReminders() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var s = settingsMap_(ss);
  var days = parseInt(s.reminder_hari, 10) || 14;
  var sh = sheet_(ss, 'Claims');
  var t = readTable_(sh);
  var now = Date.now();
  var sent = 0;
  t.rows.forEach(function (r) {
    if (isDeleted_(r) || String(r.status) !== 'Lulus') return;
    var approved = Date.parse(isoStr_(r.approved_at));
    if (isNaN(approved) || now - approved < days * 864e5) return;
    var last = Date.parse(isoStr_(r.peringatan_at));
    if (!isNaN(last) && now - last < 7 * 864e5) return;
    if (mail_(r.staff_email, '[Voltake ClaimPro] Peringatan: sahkan terima bayaran ' + r.claim_id,
      'Tuntutan ' + r.jenis + ' RM ' + Number(r.amaun_rm).toFixed(2) + ' anda telah diluluskan lebih ' + days + ' hari lalu. Jika dah terima bayaran, sila sahkan di: ' +
      portalLink_(s, '#/c/' + encodeURIComponent(String(r.claim_id))) + MAIL_FOOT)) {
      updateRowObj_(sh, t.header, r._row, { peringatan_at: nowIso_() });
      sent++;
    }
  });
  Logger.log('dailyReminders: ' + sent + ' peringatan dihantar');
  return sent;
}

/** Bulanan (1hb 8:00): laporan beza bayaran bulan lepas kepada Head of Strategic Planner (BSD 3.6). */
function monthlyBezaReport() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var s = settingsMap_(ss);
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  var prev = Utilities.formatDate(d, VP_TZ, 'yyyy-MM');
  var rows = readTable_(sheet_(ss, 'Claims')).rows.filter(function (r) {
    return !isDeleted_(r) && String(r.status) === 'Dibayar' && String(r.beza_bayaran).toUpperCase() === 'TRUE' && dateStr_(r.received_date).slice(0, 7) === prev;
  });
  if (!rows.length || !s.head_report_email) { Logger.log('monthlyBezaReport: ' + rows.length + ' kes, tiada emel dihantar'); return rows.length; }
  var lines = rows.map(function (r) {
    return r.claim_id + ' | ' + r.staff_name + ' | lulus RM ' + Number(r.amaun_rm).toFixed(2) + ' | diterima RM ' + Number(r.received_amount_rm).toFixed(2);
  });
  mail_(s.head_report_email, '[Voltake ClaimPro] Laporan beza bayaran ' + prev, rows.length + ' tuntutan dengan jumlah diterima berbeza:\n\n' + lines.join('\n') + MAIL_FOOT);
  return rows.length;
}

/**
 * Harian 2:00: pindahkan tuntutan Dibayar > 24 bulan ke tab Archive_<tahun tarikh> (BSD 8). Simpan 7 tahun
 * (sahkan keperluan LHDN). Padam dari tab Claims hanya selepas salinan berjaya.
 */
function dailyArchive() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var sh = sheet_(ss, 'Claims');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var t = readTable_(sh);
    var cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 24);
    var cut = Utilities.formatDate(cutoff, VP_TZ, 'yyyy-MM-dd');
    var old = t.rows.filter(function (r) {
      return !isDeleted_(r) && String(r.status) === 'Dibayar' && dateStr_(r.received_date) && dateStr_(r.received_date) < cut;
    });
    var moved = 0;
    old.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) {   // dari bawah supaya nombor baris kekal sah
      var year = dateStr_(r.tarikh).slice(0, 4) || 'tanpa-tarikh';
      var arch = ss.getSheetByName('Archive_' + year) || ss.insertSheet('Archive_' + year);
      if (!arch.getLastColumn()) { arch.getRange(1, 1, 1, t.header.length).setValues([t.header]); arch.setFrozenRows(1); }
      var line = t.header.map(function (h) { return r[h] === undefined ? '' : r[h]; });
      arch.getRange(arch.getLastRow() + 1, 1, 1, t.header.length).setValues([line]);
      sh.deleteRow(r._row);
      moved++;
    });
    Logger.log('dailyArchive: ' + moved + ' tuntutan diarkib');
    return moved;
  } finally {
    lock.releaseLock();
  }
}
