/**
 * Notify.gs - emel (MailApp) + kerja berjadual AMS (AFD 7: "Kalibrasi luput dalam 30 hari -> AMS admin, emel mingguan").
 * Sistem lama tiada emel; ini tambahan BSD. Emel ringkas: tiada emel staf dalam kandungan, hanya aset + pautan.
 * Kegagalan emel TIDAK membatalkan tindakan utama.
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
  return base ? base + '/ams/' + hash : 'Buka Voltake Portal > AMS';
}

var MAIL_FOOT = '\n\nEmel automatik Voltake AMS. Jangan balas emel ini.';

function assetLabel_(a) {
  return a ? textVal_(a.make) + ' ' + textVal_(a.model) + ' (SN ' + textVal_(a.serial_no) + ')' : '';
}

function notifyAdminsReturn_(ss, m) {
  var s = settingsMap_(ss);
  var a = findAsset_(readTable_(sheet_(ss, 'Assets')), m.asset_no);
  mail_(s.admin_notify_emails,
    '[Voltake AMS] Pemulangan aset ' + m.asset_no + ' menunggu pengesahan',
    textVal_(m.peminjam_nama) + ' memulangkan aset ' + m.asset_no + ' ' + assetLabel_(a) + '. Keadaan: ' + m.keadaan_pulang + '.\n\nSemak fizikal dan sahkan di: ' +
    portalLink_(s, '#/mobiliti/sahkan') + MAIL_FOOT);
}

/**
 * Isnin 8:00 (BSD 6): kepada admin aset: kalibrasi luput / hampir luput, pemulangan menunggu, pinjaman lewat.
 * Kepada peminjam: peringatan pinjaman lewat (sekali seminggu).
 */
function weeklyReport() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var c = ctx_(ss);
  var assets = readTable_(sheet_(ss, 'Assets')).rows.filter(function (r) { return !isDeleted_(r) && String(r.asset_no) !== ''; });
  var byNo = {};
  assets.forEach(function (r) { byNo[String(r.asset_no)] = r; });
  var expired = [], soon = [];
  assets.forEach(function (r) {
    var st = calibStatus_(r.calib_expiry, c.today, c.warn);
    var line = '- ' + r.asset_no + ' ' + assetLabel_(r) + ': ' + dateStr_(r.calib_expiry);
    if (st.status === 'Telah Luput') expired.push(line);
    else if (st.status === 'Lagi Seminggu' || st.status === 'Lagi Sebulan') soon.push(line + ' (' + st.hari + ' hari)');
  });
  var msh = sheet_(ss, 'Movements');
  var mt = readTable_(msh);
  var pending = [], late = [];
  var user = { email: '', roles: [] };
  mt.rows.forEach(function (m) {
    if (isDeleted_(m)) return;
    var pub = movementPublic_(m, user);
    if (pub.status === 'Menunggu pengesahan') pending.push('- ' + m.asset_no + ' ' + assetLabel_(byNo[pub.asset_no]) + ' dari ' + pub.peminjam_nama);
    if (pub.lewat) {
      late.push('- ' + m.asset_no + ' ' + assetLabel_(byNo[pub.asset_no]) + ': ' + pub.peminjam_nama + ', jangka pulang ' + pub.tarikh_jangka_pulang);
      var last = isoStr_(m.peringatan_at).slice(0, 10);
      if (String(m.peminjam_email) && (!last || daysBetween_(last, c.today) >= 7)) {
        var sent = mail_(m.peminjam_email, '[Voltake AMS] Peringatan: pulangkan aset ' + m.asset_no,
          'Aset ' + m.asset_no + ' ' + assetLabel_(byNo[pub.asset_no]) + ' yang anda pinjam untuk ' + pub.nama_projek + ' sepatutnya dipulangkan pada ' + pub.tarikh_jangka_pulang +
          '.\nJika dah pulang, rekod di: ' + portalLink_(c.settings, '#/mobiliti') + MAIL_FOOT);
        if (sent) updateRowObj_(msh, mt.header, m._row, { peringatan_at: nowIso_() });
      }
    }
  });
  if (!expired.length && !soon.length && !pending.length && !late.length) return 0;
  var parts = [];
  if (expired.length) parts.push('Kalibrasi TELAH LUPUT (' + expired.length + '):\n' + expired.join('\n'));
  if (soon.length) parts.push('Kalibrasi luput dalam ' + c.warn + ' hari (' + soon.length + '):\n' + soon.join('\n'));
  if (pending.length) parts.push('Pemulangan menunggu pengesahan (' + pending.length + '):\n' + pending.join('\n'));
  if (late.length) parts.push('Pinjaman melebihi tempoh (' + late.length + '):\n' + late.join('\n'));
  mail_(c.settings.admin_notify_emails, '[Voltake AMS] Laporan mingguan aset ' + c.today, parts.join('\n\n') + '\n\nPortal: ' + portalLink_(c.settings, '#/') + MAIL_FOOT);
  return expired.length + soon.length + pending.length + late.length;
}
