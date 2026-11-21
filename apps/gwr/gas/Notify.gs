/**
 * Notify.gs - emel GWR (F-34) + kerja berjadual.
 * Sistem lama: emel pautan Google Drive (fail awam) kepada klien & staf. Kini PDF final dihantar sebagai LAMPIRAN
 * kepada klien, staf dan emel_cc_<DEPT>; tiada perkongsian Drive.
 */

function mail_(to, subject, body, attachments) {
  var list = String(to || '').split(',').map(function (s) { return normEmail_(s); }).filter(String);
  if (!list.length) return false;
  try {
    var o = { to: list.join(','), subject: subject, body: body, name: 'Voltake GWR' };
    if (attachments && attachments.length) o.attachments = attachments;
    MailApp.sendEmail(o);
    return true;
  } catch (e) {
    Logger.log('Emel gagal: ' + e);
    return false;
  }
}

/** Pulang senarai penerima yang berjaya, cth "klien,staf,cc". */
function notifyApproved_(ss, r, s) {
  var pdf = null;
  if (String(r.final_pdf_file_id || '')) {
    try { pdf = DriveApp.getFileById(String(r.final_pdf_file_id)).getBlob(); } catch (e) { pdf = null; }
  }
  var att = pdf ? [pdf] : [];
  var noPdf = pdf ? '' : '\n\n(PDF final sedang disediakan. Staf Voltake akan menghantarnya secara berasingan.)';
  var sent = [];
  var ringkas = 'Report ID    : ' + r.report_id + '\nTarikh kerja : ' + dateStr_(r.tarikh) + '\nNo. PO       : ' + (textVal_(r.po_number) || '-') +
    '\nKlien        : ' + (textVal_(r.client_company) || '-') + '\nProjek       : ' + (textVal_(r.project_title) || '-') + '\nLokasi       : ' + (textVal_(r.location) || '-') +
    '\nJob shutdown : ' + (r.job_shutdown || 'NO') + '\nPTW          : ' + (r.ptw || 'NO');
  if (mail_(r.client_email, 'Laporan Kerja Disahkan - ' + r.report_id,
    'Salam sejahtera ' + textVal_(r.client_sign_name) + ',\n\nTerima kasih atas pengesahan anda. Ground Work Report berikut telah DISAHKAN.\n\n' + ringkas +
    '\n\nSalinan PDF dilampirkan.' + noPdf + '\n\nTerima kasih,\nVoltake TEAM', att)) sent.push('klien');
  if (mail_(r.staff_email, '[GWR ' + r.dept + '] Disahkan Klien - ' + (textVal_(r.po_number) || r.report_id) + (r.client_company ? ' - ' + textVal_(r.client_company) : ''),
    'Salam ' + textVal_(r.staff_name) + ',\n\nLaporan GWR yang anda isi telah disahkan oleh klien.\n\n' + ringkas +
    '\n\nDisahkan oleh: ' + textVal_(r.client_sign_name) + ' (' + textVal_(r.client_sign_position) + ')\nMasa disahkan: ' + isoStr_(r.approved_at) +
    '\n\nPDF final dilampirkan.' + noPdf + '\n\nEmel automatik Voltake Portal.', att)) sent.push('staf');
  if (mail_(s['emel_cc_' + r.dept], '[GWR ' + r.dept + '] ' + r.report_id + ' disahkan klien',
    ringkas + '\n\nDisahkan oleh: ' + textVal_(r.client_sign_name) + ' (' + textVal_(r.client_sign_position) + ')' + noPdf + '\n\nEmel automatik Voltake Portal.', att)) sent.push('cc');
  return sent.join(',');
}

/** Harian 3:00: pautan klien yang tamat -> Luput (hash dikosongkan, pautan mati). Staf boleh jana pautan baharu. */
function dailyExpire() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var sh = sheet_(ss, 'Reports');
  var n = 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var t = readTable_(sh);
    t.rows.forEach(function (r) {
      if (isDeleted_(r) || String(r.status) !== 'Menunggu klien') return;
      var e = Date.parse(isoStr_(r.approval_token_expires));
      if (!isFinite(e) || e >= Date.now()) return;
      updateRowObj_(sh, t.header, r._row, { status: 'Luput', approval_token_hash: '', updated_at: nowIso_(), updated_by: 'system' });
      n++;
    });
  } finally {
    lock.releaseLock();
  }
  if (n) audit_('system', 'EXPIRE_LINKS', String(n), '');
  return n;
}
