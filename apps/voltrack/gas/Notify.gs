/**
 * Notify.gs - semakan harian tunggakan (BSD 6 "Harian: kira overdue_days").
 * Sistem lama semakNotifikasiHarian(): push OneSignal kepada LOD & Admin "Anda mempunyai N projek tertunggak",
 * dengan senarai kritikal (lewat 1, 7, 14 atau > 30 hari), maksimum 3. Kini: emel ke Settings.emel_peringatan
 * (push OneSignal = F-07 Tambahan Fasa 3). Medan dikira juga disimpan ke Sheet supaya Sheet sentiasa tepat.
 */

function mail_(to, subject, body) {
  if (!to) return false;
  try { MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'Voltake Portal' }); return true; } catch (e) { Logger.log('Emel gagal: ' + e); return false; }
}

function dailyOverdue() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var s = settingsMap_(ss);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var updated = 0, list = [];
  try {
    var all = readAll_(ss);
    Object.keys(all.byId.Commercial).forEach(function (id) {
      var p = joined_(all, id);
      if (!p) return;
      updated += persistDerived_(ss, all, p, s);
      var ch = derive_(p, todayIso_(), payDays_(s));
      if (ch.Claim.payment_status === 'Outstanding') list.push({ id: id, company: p.company, hari: ch.Claim.overdue_days, invoice: p.invoice_no, amaun: p.quotation_amount });
    });
  } finally {
    lock.releaseLock();
  }
  var sent = false;
  if (list.length) {
    list.sort(function (a, b) { return b.hari - a.hari; });
    var kritikal = list.filter(function (x) { return x.hari === 1 || x.hari === 7 || x.hari === 14 || x.hari > 30; });
    var url = String(s.portal_url || '').replace(/\/+$/, '');
    var body = 'Assalamualaikum / Salam sejahtera,\n\nVoltrack: ' + list.length + ' projek tertunggak.\n' +
      (kritikal.length ? '\nPerhatian segera:\n' + kritikal.slice(0, 10).map(function (x) { return '- [' + x.id + '] ' + x.company + ' (lewat ' + x.hari + ' hari' + (x.invoice ? ', invois ' + x.invoice : '') + ')'; }).join('\n') + (kritikal.length > 10 ? '\n...dan lain-lain.' : '') + '\n'
        : '\nSila pantau LOD Tracker hari ini.\n') +
      (url ? '\nBuka LOD Tracker: ' + url + '/voltrack/#/fasa/LOD\n' : '') + '\n-- Emel automatik Voltake Portal';
    sent = mail_(String(s.emel_peringatan || ''), '[Voltrack] ' + list.length + ' projek tertunggak', body);
  }
  Logger.log('dailyOverdue: ' + updated + ' baris dikemas kini, ' + list.length + ' tertunggak' + (sent ? ', emel dihantar' : ''));
  return { dikemas_kini: updated, tertunggak: list.length, emel: sent };
}
