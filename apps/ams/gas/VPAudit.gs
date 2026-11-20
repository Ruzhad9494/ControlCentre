/**
 * VPAudit.gs - tulis AuditLog modul (BSD 3, TRD 6 "Audit").
 * SUMBER: shared/gas/. Disalin ke apps/<modul>/gas/ oleh tools/sync-shared-gas.sh.
 * Jika tab AuditLog tiada (contoh projek access), panggilan diabaikan.
 */

var AUDIT_HEADER = ['ts', 'email', 'tindakan', 'sasaran', 'butiran'];

function audit_(email, tindakan, sasaran, butiran) {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var sh = ss.getSheetByName('AuditLog');
  if (!sh) return;
  var header = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : AUDIT_HEADER;
  appendObj_(sh, header, {
    ts: nowIso_(),
    email: email || '',
    tindakan: tindakan || '',
    sasaran: sasaran || '',
    butiran: typeof butiran === 'string' ? butiran : JSON.stringify(butiran || '')
  });
}
