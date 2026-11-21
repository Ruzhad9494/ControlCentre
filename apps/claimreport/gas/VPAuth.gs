/**
 * VPAuth.gs - sahkan permintaan dari Cloudflare gateway + semakan role (TRD 5.2, BSD 4.3).
 * SUMBER: shared/gas/. Disalin ke apps/<modul>/gas/ oleh tools/sync-shared-gas.sh.
 *
 * Format body (dihantar oleh functions/_lib/sign.js):
 *   { action, ts, nonce, data, sig }
 *   data = JSON.stringify({ payload, user })     (teks, ditandatangan seadanya)
 *   sig  = hex(HMAC_SHA256(secret, action + '|' + ts + '|' + nonce + '|' + hex(SHA256(data))))
 *   ts   = saat Unix
 * Semua semakan dibuat SEBELUM sebarang Sheet dibaca.
 */

var VP_MAX_SKEW_SEC = 120;
var VP_NONCE_TTL_SEC = 300;

function httpError_(status, message) {
  var e = new Error(message);
  e.httpStatus = status;
  return e;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function bytesToHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function sha256Hex_(text) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function hmacHex_(text, secret) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(text, secret, Utilities.Charset.UTF_8));
}

/** Banding masa-tetap untuk elak timing attack. */
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Sahkan body mentah dari doPost. Pulangkan { action, payload, user }.
 * Buang httpError_(401) jika tandatangan/masa/nonce tak sah.
 */
function verifySignature_(rawBody, secret) {
  var body;
  try { body = JSON.parse(rawBody || ''); } catch (err) { throw httpError_(400, 'Body bukan JSON'); }
  if (!body || typeof body !== 'object') throw httpError_(400, 'Body tak sah');

  var action = body.action, ts = body.ts, nonce = body.nonce, data = body.data, sig = body.sig;
  if (typeof action !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(action)) throw httpError_(401, 'Permintaan tak sah');
  if (typeof ts !== 'number' || !isFinite(ts)) throw httpError_(401, 'Permintaan tak sah');
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) throw httpError_(401, 'Permintaan tak sah');
  if (typeof data !== 'string' || typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) throw httpError_(401, 'Permintaan tak sah');

  var expected = hmacHex_(action + '|' + ts + '|' + nonce + '|' + sha256Hex_(data), secret);
  if (!safeEqual_(expected, sig)) throw httpError_(401, 'Tandatangan tak sah');

  var now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > VP_MAX_SKEW_SEC) throw httpError_(401, 'Permintaan luput');

  var cache = CacheService.getScriptCache();
  var key = 'vpn:' + nonce;
  if (cache.get(key)) throw httpError_(401, 'Permintaan diulang');
  cache.put(key, '1', VP_NONCE_TTL_SEC);

  var inner;
  try { inner = JSON.parse(data); } catch (err2) { throw httpError_(400, 'Data tak sah'); }
  return { action: action, payload: inner.payload || {}, user: inner.user || {} };
}

/**
 * Semakan role halus (BSD 4.3). actionRoles = { action: ['role', ...] }.
 * 'superadmin' sentiasa dibenarkan kecuali action system.
 */
function authorize_(actionRoles, action, user) {
  var allowed = actionRoles[action];
  if (!allowed) throw httpError_(400, 'Action tidak dikenali');
  var roles = (user && user.roles) || [];
  var ok = roles.some(function (r) { return allowed.indexOf(r) >= 0; }) || roles.indexOf('superadmin') >= 0;
  if (!ok) {
    if (typeof audit_ === 'function') {
      try { audit_(user && user.email, 'FORBIDDEN', action, ''); } catch (e) { /* abaikan */ }
    }
    throw httpError_(403, 'Tiada kebenaran');
  }
}

/**
 * Pembalut doPost standard. handler(req) pulangkan data; ralat ditukar ke {ok:false,status,error}.
 */
function handleRequest_(e, secret, handler) {
  try {
    var req = verifySignature_(e && e.postData ? e.postData.contents : '', secret);
    var data = handler(req);
    return jsonOut_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    var status = err.httpStatus || 500;
    if (status === 500) Logger.log('Ralat dalaman: ' + (err && err.stack ? err.stack : err));
    return jsonOut_({ ok: false, status: status, error: status === 500 ? 'Ralat dalaman pelayan' : String(err.message) });
  }
}
