/**
 * Files.gs - muat naik / baca resit di Drive (BSD 5; TRD 6 "Drive").
 * - Folder dimiliki akaun sistem sahaja. TIADA "anyone with link", TIADA perkongsian ke staf.
 * - Fail dihidang melalui action getFile (semakan pemilik/admin). ID fail tak pernah diterima dari browser.
 * - Jenis fail disahkan dari ISI fail (magic bytes), bukan nama atau jenis yang diisytiharkan browser.
 */

var FILE_MAX_BYTES = 8 * 1024 * 1024;
var FILE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf'
};

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
  if (up.data.length > Math.ceil(FILE_MAX_BYTES * 4 / 3) + 16) throw httpError_(400, label + ': fail melebihi 8MB');
  var bytes;
  try { bytes = Utilities.base64Decode(up.data); } catch (e) { throw httpError_(400, label + ': fail rosak'); }
  if (bytes.length > FILE_MAX_BYTES) throw httpError_(400, label + ': fail melebihi 8MB');
  var mime = sniffMime_(bytes);
  if (!mime || !FILE_TYPES[mime]) throw httpError_(400, label + ': hanya JPG, PNG, HEIC atau PDF dibenarkan');
  return { bytes: bytes, mime: mime, ext: FILE_TYPES[mime] };
}

/** Simpan ke folder ikut jenis. kind: 'resit' (Receipts/YYYY-MM) | 'bukti' (Payments). Pulang fileId. */
function storeFile_(parsed, claimId, kind) {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var base = childFolder_(root, 'ClaimPro');
  var folder = kind === 'bukti'
    ? childFolder_(base, 'Payments')
    : childFolder_(childFolder_(base, 'Receipts'), Utilities.formatDate(new Date(), VP_TZ, 'yyyy-MM'));
  var stamp = Utilities.formatDate(new Date(), VP_TZ, 'yyyyMMdd-HHmmss');
  var name = claimId + '_' + kind + '_' + stamp + '.' + parsed.ext;   // BSD 5 konvensyen nama
  var file = folder.createFile(Utilities.newBlob(parsed.bytes, parsed.mime, name));
  return file.getId();
}

function trashFile_(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(String(fileId)).setTrashed(true); } catch (e) { /* sudah tiada */ }
}

/** Baca fail untuk dihidang kepada pemilik/admin: { mime, nama, data(base64) }. */
function readFile_(fileId) {
  var file = DriveApp.getFileById(String(fileId));
  var blob = file.getBlob();
  return { mime: file.getMimeType(), nama: file.getName(), data: Utilities.base64Encode(blob.getBytes()) };
}
