// functions/_lib/session.js - cookie sesi HMAC (TRD 5.1 langkah 6, 5.3; IPD 1.4).
//
// cookie vp_session = base64url(JSON payload) + "." + base64url(HMAC_SHA256(SESSION_SECRET, base64url(payload)))
// payload = { sub: email, sid, tv, iat, exp }   (saat Unix; exp = iat + 12 jam)
// Role TIDAK disimpan dalam cookie.

import { b64urlEncode, b64urlDecode, hmacSha256, safeEqual, utf8, fromUtf8, randomId, parseCookies } from './util.js';
import { cacheGet, cachePut } from './cache.js';

export const SESSION_COOKIE = 'vp_session';
export const SESSION_TTL_SEC = 12 * 3600;
const MIN_SECRET = 32;

function secretOf(env) {
  const s = env && env.SESSION_SECRET;
  if (!s || s.length < MIN_SECRET) throw new Error('SESSION_SECRET belum diset atau terlalu pendek');
  return s;
}

export async function createSession(env, { email, tv }, now = Math.floor(Date.now() / 1000)) {
  const payload = { sub: email, sid: randomId(16), tv: Number(tv) || 1, iat: now, exp: now + SESSION_TTL_SEC };
  const body = b64urlEncode(utf8(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmacSha256(secretOf(env), body));
  return { value: `${body}.${sig}`, payload };
}

/** Pulang payload jika sah dan belum tamat/revoke; null jika tidak. */
export async function verifySession(env, value, now = Math.floor(Date.now() / 1000)) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  const dot = value.indexOf('.');
  if (dot < 1 || value.indexOf('.', dot + 1) !== -1) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  let expected;
  try {
    expected = b64urlEncode(await hmacSha256(secretOf(env), body));
  } catch (e) {
    if (String(e.message).includes('SESSION_SECRET')) throw e;
    return null;
  }
  if (!safeEqual(expected, sig)) return null;
  let p;
  try {
    p = JSON.parse(fromUtf8(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (!p || typeof p.sub !== 'string' || typeof p.sid !== 'string' || typeof p.exp !== 'number') return null;
  if (p.exp <= now || p.iat > now + 60) return null;
  if (await isRevoked(p.sid)) return null;
  return p;
}

export function readSessionCookie(request) {
  return parseCookies(request.headers.get('Cookie'))[SESSION_COOKIE] || '';
}

export function sessionCookie(value, maxAge = SESSION_TTL_SEC) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function revokeSid(sid, exp, now = Math.floor(Date.now() / 1000)) {
  if (!sid) return;
  await cachePut(`revoke:${sid}`, { r: 1 }, Math.max(60, (exp || now + SESSION_TTL_SEC) - now));
}

export async function isRevoked(sid) {
  return Boolean(await cacheGet(`revoke:${sid}`));
}
