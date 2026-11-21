/**
 * Notify.gs - emel (MailApp) + kerja berjadual Draft Mohon Kerja.
 * Sistem lama tiada emel. Emel kepada HR sahaja (tiada emel kepada pemohon: elak borang awam disalah guna
 * untuk menghantar emel ke alamat sembarangan). Tiada data peribadi dalam emel: no. rujukan + jawatan sahaja.
 */

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
  return base ? base + '/draftmohonkerja/' + hash : 'Buka Voltake Portal > Mohon Kerja';
}

function notifyHrNew_(ss, a) {
  var s = settingsMap_(ss);
  mail_(s.hr_notify_emails, '[Voltake HR] Permohonan baru ' + a.app_no,
    'Permohonan baru diterima: ' + a.app_no + '\nJawatan: ' + a.jawatan + (a.department ? ' (' + a.department + ')' : ' (department belum ditetapkan)') +
    '\n\nSemak di: ' + portalLink_(s, '#/p/' + encodeURIComponent(a.app_no)) + '\n\nEmel automatik Voltake Portal. Jangan balas emel ini.');
}

/** Harian 2:00 (F-14): pemohon Ditolak / Tarik diri yang melepasi retention_until dianonimkan. */
function dailyRetention() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var sh = sheet_(ss, 'Applicants');
  var today = todayIso_();
  var n = 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var t = readTable_(sh);
    t.rows.forEach(function (a) {
      if (isDeleted_(a) || truthy_(a.anonymised) || FINAL_STATUSES.indexOf(String(a.status)) < 0) return;
      var until = dateStr_(a.retention_until);
      if (!until || until >= today) return;
      anonymiseRow_(sh, t.header, a, 'system', 'Retention ' + until);
      n++;
    });
  } finally {
    lock.releaseLock();
  }
  if (n) audit_('system', 'RETENTION', String(n), 'dianonimkan');
  return n;
}
