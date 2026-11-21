/**
 * Files.gs - fail GWR di Drive (BSD 5; TRD 6 "Drive").
 * - Folder VP-Files/GWR/<OMP|PSS>/{Images,Signatures,PDF}/<YYYY-MM> dimiliki akaun sistem sahaja.
 *   Sistem lama: setiap gambar, tandatangan dan PDF dikongsi "ANYONE_WITH_LINK" -> TIDAK lagi.
 *   PDF final dihantar sebagai LAMPIRAN emel (BSD 5), bukan pautan Drive.
 * - Jenis fail disahkan dari ISI fail (magic bytes). ID fail tidak pernah diterima dari browser.
 */

var FILE_MAX_BYTES = 5 * 1024 * 1024;    // BSD 5: 5MB setiap gambar (pelayar kecilkan ke 1400px macam sistem lama)
var FILE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};
var FOLDERS = { gambar: 'Images', tandatangan: 'Signatures', pdf: 'PDF' };

function childFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function byteAt_(bytes, i) { return (bytes[i] + 256) % 256; }

/** Kenal pasti jenis fail dari ISI. Pulang '' jika tak dikenali / tak dibenarkan. */
function sniffMime_(bytes) {
  if (bytes.length < 12) return '';
  var b = function (i) { return byteAt_(bytes, i); };
  if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return 'application/pdf';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp'; // RIFF....WEBP
  if (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) { // 'ftyp'
    var brand = String.fromCharCode(b(8), b(9), b(10), b(11));
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].indexOf(brand) >= 0) return 'image/heic';
  }
  return '';
}

/**
 * Sahkan muat naik dari browser { nama, data(base64) }. Pulang { bytes, mime, ext }.
 * Tiada apa disimpan lagi. Buang httpError_(400) jika tak sah.
 */
function parseUpload_(up, label) {
  if (!up || typeof up.data !== 'string' || !up.data) throw httpError_(400, label + ': fail tiada');
  if (up.data.length > Math.ceil(FILE_MAX_BYTES * 4 / 3) + 16) throw httpError_(400, label + ': fail melebihi 5MB');
  var bytes;
  try { bytes = Utilities.base64Decode(up.data); } catch (e) { throw httpError_(400, label + ': fail rosak'); }
  if (bytes.length > FILE_MAX_BYTES) throw httpError_(400, label + ': fail melebihi 5MB');
  var mime = sniffMime_(bytes);
  if (!mime || !FILE_TYPES[mime]) throw httpError_(400, label + ': hanya JPG, PNG, HEIC, WEBP atau PDF dibenarkan');
  return { bytes: bytes, mime: mime, ext: FILE_TYPES[mime] };
}

/** Simpan ke VP-Files/GWR/<dept>/<folder>/<YYYY-MM>. kind: gambar | tandatangan. Pulang fileId. */
function storeFile_(parsed, ref, kind, dept) {
  var folder = deptFolder_(dept, kind);
  var stamp = Utilities.formatDate(new Date(), VP_TZ, 'yyyyMMdd-HHmmss');
  var name = String(ref).replace(/[^A-Za-z0-9-]/g, '') + '_' + kind + '_' + stamp + '_' + Math.floor(Math.random() * 1000) + '.' + parsed.ext;
  return folder.createFile(Utilities.newBlob(parsed.bytes, parsed.mime, name)).getId();
}

function deptFolder_(dept, kind) {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(childFolder_(childFolder_(root, 'GWR'), dept), FOLDERS[kind]);
  return childFolder_(base, Utilities.formatDate(new Date(), VP_TZ, 'yyyy-MM'));
}

/** Simpan blob PDF yang dijana server. */
function storePdf_(blob, dept) {
  return deptFolder_(dept, 'pdf').createFile(blob).getId();
}

/** Muat naik pilihan: null jika tiada. */
function optUpload_(up, label) {
  return up ? parseUpload_(up, label) : null;
}

/** ID fail Drive dari URL lama (https://drive.google.com/file/d/<ID>/view, open?id=<ID>, uc?id=<ID>). */
function driveIdFromUrl_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return '';
  var m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '';
}

function trashFile_(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(String(fileId)).setTrashed(true); } catch (e) { /* sudah tiada */ }
}

/** Baca fail untuk dihidang kepada pemilik/admin: { mime, nama, data(base64) }. */
/** data: URI untuk dibenam dalam HTML PDF. '' jika fail tiada. */
function dataUri_(fileId) {
  if (!fileId) return '';
  try {
    var f = DriveApp.getFileById(String(fileId));
    return 'data:' + f.getMimeType() + ';base64,' + Utilities.base64Encode(f.getBlob().getBytes());
  } catch (e) { return ''; }
}

function readFile_(fileId) {
  var file = DriveApp.getFileById(String(fileId));
  var blob = file.getBlob();
  return { mime: file.getMimeType(), nama: file.getName(), data: Utilities.base64Encode(blob.getBytes()) };
}
