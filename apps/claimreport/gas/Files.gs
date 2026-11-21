/**
 * Files.gs - fail DO di Drive (BSD 5; TRD 6 "Drive").
 * Folder VP-Files/ClaimReport/{PDF,EXCEL}/<YYYY> dimiliki akaun sistem sahaja.
 * Sistem lama: PDF & Excel dikongsi "ANYONE_WITH_LINK" -> TIDAK lagi; dibuka melalui portal (getFile).
 */

function childFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** kind: PDF | EXCEL. Folder ikut tahun DO. */
function doFolder_(kind, tarikh) {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(childFolder_(root, 'ClaimReport'), kind);
  return childFolder_(base, String(tarikh || todayIso_()).slice(0, 4));
}

function trashFile_(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(String(fileId)).setTrashed(true); } catch (e) { /* sudah tiada */ }
}

function driveIdFromUrl_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return '';
  var m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '';
}

function readFile_(fileId) {
  var file = DriveApp.getFileById(String(fileId));
  return { mime: file.getMimeType(), nama: file.getName(), data: Utilities.base64Encode(file.getBlob().getBytes()) };
}
