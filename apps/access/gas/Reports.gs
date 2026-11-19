/**
 * Reports.gs - laporan berjadual projek access.
 *
 * monthlyInactiveReport: staf `aktif` yang tak login lebih N hari (Settings.inactive_days,
 * lalai 60) dihantar ke HR untuk semakan (BSD 6, IPD Risiko "Staf berhenti masih ada Gmail").
 * Emel peribadi staf TIDAK dimasukkan dalam laporan (minimakan data, TRD 6).
 */

function monthlyInactiveReport() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var settings = readSettings_(ss);
  var days = parseInt(settings.inactive_days, 10) || 60;
  var rows = findInactiveStaff_(ss, days, new Date());

  var to = settings.hr_report_email;
  if (!to) {
    Logger.log('hr_report_email kosong dalam Settings. ' + rows.length + ' staf tak aktif, laporan tidak dihantar.');
    return rows;
  }
  if (!rows.length) return rows;

  var lines = rows.map(function (r) {
    return r.staff_id + ' | ' + r.nama + ' | ' + r.department + ' | login terakhir: ' + (r.last_login_at || 'belum pernah');
  });
  MailApp.sendEmail({
    to: to,
    subject: '[Voltake Portal] ' + rows.length + ' staf aktif tak login > ' + days + ' hari',
    body: 'Sila semak sama ada staf berikut masih bekerja. Jika sudah berhenti, tukar status ke "tamat".\n\n' +
      lines.join('\n') + '\n\nLaporan automatik bulanan (' + prop_('ENV') + ').'
  });
  return rows;
}

function readSettings_(ss) {
  var sh = ss.getSheetByName('Settings');
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (r[0] !== '') out[String(r[0])] = String(r[1]);
  });
  return out;
}

function findInactiveStaff_(ss, days, now) {
  var sh = ss.getSheetByName('Staff');
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var h = data[0].map(String);
  var idx = function (k) { return h.indexOf(k); };
  var cutoff = now.getTime() - days * 24 * 3600 * 1000;

  return data.slice(1).filter(function (r) {
    if (String(r[idx('status')]) !== 'aktif') return false;
    if (String(r[idx('deleted')]).toUpperCase() === 'TRUE') return false;
    var last = r[idx('last_login_at')];
    if (last === '' || last === null) return true;
    var t = (last instanceof Date) ? last.getTime() : Date.parse(String(last));
    return isNaN(t) || t < cutoff;
  }).map(function (r) {
    return {
      staff_id: r[idx('staff_id')],
      nama: r[idx('nama')],
      department: r[idx('department')],
      last_login_at: r[idx('last_login_at')]
    };
  });
}
