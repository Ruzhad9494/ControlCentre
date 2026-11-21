/**
 * Photo.gs - gambar profil staf (permintaan pemilik 21/11/2026).
 *
 * Dipanggil oleh /auth/photo (Cloudflare) sebagai action system; emel datang dari SESI yang disahkan gateway,
 * jadi staf hanya boleh baca / tukar gambar sendiri. Fail disimpan peribadi dalam VP-Files/Access/Photos
 * (bukan "anyone with link"). Pelayar sudah potong segi empat & kecilkan ke 256px sebelum hantar.
 */

var PHOTO_MAX_BYTES = 300 * 1024;
var PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function photoMime_(bytes) {
  var b = function (i) { return (bytes[i] + 256) % 256; };
  if (bytes.length > 3 && b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'image/jpeg';
  if (bytes.length > 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47) return 'image/png';
  if (bytes.length > 12 && b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  return '';
}

function photoFolder_() {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var child = function (parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); };
  return child(child(root, 'Access'), 'Photos');
}

function activeStaff_(ss, emailRaw) {
  var email = normEmail_(emailRaw);
  if (!email) throw httpError_(400, 'Emel tak sah');
  var sh = sheet_(ss, 'Staff');
  var t = readTable_(sh);
  var st = findStaffByEmail_(t, email);
  if (!st || String(st.status) !== 'aktif') throw httpError_(403, 'Tiada kebenaran');
  return { sh: sh, t: t, st: st };
}

/** payload: { email }. Pulang { mime, data } atau 404. */
function getPhoto_(p) {
  var x = activeStaff_(openAccess_(), p.email);
  var id = String(x.st.photo_file_id || '');
  if (!id) throw httpError_(404, 'Tiada gambar profil');
  try {
    var f = DriveApp.getFileById(id);
    return { mime: f.getMimeType(), data: Utilities.base64Encode(f.getBlob().getBytes()) };
  } catch (e) {
    throw httpError_(404, 'Tiada gambar profil');
  }
}

/** payload: { email, data (base64) } untuk simpan; { email, padam: true } untuk buang. */
function setPhoto_(p) {
  var ss = openAccess_();
  var x = activeStaff_(ss, p.email);
  var oldId = String(x.st.photo_file_id || '');
  var newId = '';
  if (p.padam !== true) {
    if (typeof p.data !== 'string' || !p.data) throw httpError_(400, 'Gambar tiada');
    if (p.data.length > Math.ceil(PHOTO_MAX_BYTES * 4 / 3) + 16) throw httpError_(400, 'Gambar terlalu besar (maksimum 300KB)');
    var bytes;
    try { bytes = Utilities.base64Decode(p.data); } catch (e) { throw httpError_(400, 'Gambar rosak'); }
    var mime = photoMime_(bytes);
    if (!mime) throw httpError_(400, 'Hanya JPG, PNG atau WEBP');
    var stamp = Utilities.formatDate(new Date(), VP_TZ, 'yyyyMMdd-HHmmss');
    var blob = Utilities.newBlob(bytes, mime, String(x.st.staff_id).replace(/[^A-Za-z0-9-]/g, '') + '_' + stamp + '.' + PHOTO_TYPES[mime]);
    newId = photoFolder_().createFile(blob).getId();
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(x.sh);
    var st = findStaffByEmail_(t, normEmail_(p.email));
    updateObj_(x.sh, t.header, st._row, { photo_file_id: newId, updated_at: nowIso_(), updated_by: normEmail_(p.email) });
  } finally {
    lock.releaseLock();
  }
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { /* sudah tiada */ } }
  audit_(normEmail_(p.email), newId ? 'SET_PHOTO' : 'DELETE_PHOTO', String(x.st.staff_id), '');
  return { gambar_v: newId ? newId.slice(-8) : '' };
}
