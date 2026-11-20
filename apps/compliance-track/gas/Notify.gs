/**
 * Notify.gs - emel (MailApp) + kerja berjadual Compliance (F-63; BSD 6: Isnin 8:00 peringatan luput).
 * Sistem lama tiada emel. Laporan dikumpul ikut 30 / 60 / 90 hari (PRD F-63). Tiada no. IC dalam emel.
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
  return base ? base + '/compliance-track/' + hash : 'Buka Voltake Portal > Compliance Track';
}

var MAIL_FOOT = '\n\nEmel automatik Voltake Compliance Track. Jangan balas emel ini.';

function bucket_(hari) {
  if (hari < 0) return 'TAMAT';
  if (hari <= 30) return '30';
  if (hari <= 60) return '60';
  if (hari <= 90) return '90';
  return '';
}

function weeklyReport() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var c = ctx_(ss);
  var items = [];   // { b, line }
  var add = function (date, line) {
    var st = statusOf_(date, c);
    if (st.hari === null) return;
    var b = bucket_(st.hari);
    if (b) items.push({ b: b, hari: st.hari, line: line + ': ' + dateStr_(date) + (st.hari < 0 ? ' (tamat ' + Math.abs(st.hari) + ' hari lalu)' : ' (' + st.hari + ' hari lagi)') });
  };
  rows_(ss, 'Vehicles').forEach(function (r) { add(r.roadtax_expiry, '- Roadtax ' + r.jenis + ' ' + textVal_(r.plate_no) + ' (' + textVal_(r.lokasi) + ')'); });
  rows_(ss, 'Chargeman').forEach(function (r) { add(r.expiry_date, '- Chargeman ' + textVal_(r.nama) + ' @ ' + textVal_(r.solar_farm)); });
  var staff = rows_(ss, 'Staff');
  var label = {};
  CERT_TYPES.forEach(function (t) { label[t.key] = t.label; });
  var perStaff = {};
  rows_(ss, 'StaffCerts').forEach(function (r) {
    var s = staffById_(staff, r.staff_id);
    if (!s) return;
    add(r.expiry_date, '- ' + label[r.jenis] + ' ' + textVal_(s.nama) + ' (' + s.staff_id + ')');
    var st = statusOf_(r.expiry_date, c);
    if (st.hari !== null && st.hari <= 30 && String(s.staff_email || '')) {
      (perStaff[s.staff_email] = perStaff[s.staff_email] || []).push('- ' + label[r.jenis] + ': ' + dateStr_(r.expiry_date) + (st.hari < 0 ? ' (TAMAT)' : ' (' + st.hari + ' hari lagi)'));
    }
  });
  if (String(c.settings.peringatan_staf || 'TRUE').toUpperCase() !== 'FALSE') {
    Object.keys(perStaff).forEach(function (email) {
      mail_(email, '[Voltake Compliance] Sijil anda perlu diperbaharui',
        'Sijil berikut tamat atau akan tamat dalam 30 hari:\n' + perStaff[email].join('\n') +
        '\n\nSelepas diperbaharui, kemas kini tarikh dan muat naik sijil baharu di: ' + portalLink_(c.settings, '#/saya') + MAIL_FOOT);
    });
  }
  if (!items.length) return 0;
  var groups = [['TAMAT', 'TELAH TAMAT'], ['30', 'Tamat dalam 30 hari'], ['60', 'Tamat dalam 31-60 hari'], ['90', 'Tamat dalam 61-90 hari']];
  var body = groups.map(function (g) {
    var list = items.filter(function (i) { return i.b === g[0]; }).sort(function (a, b) { return a.hari - b.hari; });
    return list.length ? g[1] + ' (' + list.length + '):\n' + list.map(function (i) { return i.line; }).join('\n') : '';
  }).filter(String).join('\n\n');
  mail_(c.settings.notify_emails, '[Voltake Compliance] Laporan mingguan ' + c.today, body + '\n\nPortal: ' + portalLink_(c.settings, '#/') + MAIL_FOOT);
  return items.length;
}
