// functions/_lib/google.js - sahkan Google ID token (TRD 5.1 langkah 4; IPD 1.3).
//
// Semak: tandatangan RS256 lawan JWKS Google, iss, aud, exp, email_verified.
// TIADA semakan hd (domain): kawalan masuk ialah allowlist + ikatan sub di access.getAccess.

import { b64urlDecode, fromUtf8, utf8 } from './util.js';
import { cacheGet, cachePut } from './cache.js';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const SKEW = 60;

let memJwks = null; // { keys, exp }

async function getJwks(fetchImpl, now, forceRefresh = false) {
  if (!forceRefresh && memJwks && memJwks.exp > now) return memJwks.keys;
  if (!forceRefresh) {
    const cached = await cacheGet('google-jwks');
    if (cached && cached.exp > now) {
      memJwks = cached;
      return cached.keys;
    }
  }
  const res = await fetchImpl(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error('Gagal muat JWKS Google: ' + res.status);
  const data = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '');
  const ttl = Math.min(Math.max(m ? Number(m[1]) : 3600, 300), 86400);
  memJwks = { keys: data.keys || [], exp: now + ttl };
  await cachePut('google-jwks', memJwks, ttl);
  return memJwks.keys;
}

export function _resetJwksCache() {
  memJwks = null;
}

export class TokenError extends Error {}

function decodePart(part) {
  return JSON.parse(fromUtf8(b64urlDecode(part)));
}

/**
 * Pulang { email, sub, name, picture } jika sah. Buang TokenError jika tidak.
 */
export async function verifyGoogleIdToken(token, { clientId, fetchImpl = fetch, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID belum diset');
  if (typeof token !== 'string' || token.length > 4096) throw new TokenError('Token tak sah');
  const parts = token.split('.');
  if (parts.length !== 3) throw new TokenError('Token tak sah');

  let header, claims;
  try {
    header = decodePart(parts[0]);
    claims = decodePart(parts[1]);
  } catch {
    throw new TokenError('Token tak sah');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new TokenError('Algoritma token tak sah');

  let keys = await getJwks(fetchImpl, now);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await getJwks(fetchImpl, now, true); // Google tukar kunci
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new TokenError('Kunci token tidak dikenali');

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  let sig;
  try {
    sig = b64urlDecode(parts[2]);
  } catch {
    throw new TokenError('Tandatangan token tak sah');
  }
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, utf8(parts[0] + '.' + parts[1]));
  if (!ok) throw new TokenError('Tandatangan token tak sah');

  if (!ISSUERS.includes(claims.iss)) throw new TokenError('Issuer token tak sah');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw new TokenError('Token bukan untuk aplikasi ini');
  if (typeof claims.exp !== 'number' || claims.exp + SKEW < now) throw new TokenError('Token tamat tempoh');
  if (typeof claims.iat === 'number' && claims.iat - SKEW > now) throw new TokenError('Token belum sah');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new TokenError('Emel Google belum disahkan');
  if (typeof claims.email !== 'string' || typeof claims.sub !== 'string' || !claims.sub) throw new TokenError('Token tiada emel');

  return {
    email: claims.email.trim().toLowerCase(),
    sub: claims.sub,
    name: typeof claims.name === 'string' ? claims.name : '',
    picture: typeof claims.picture === 'string' ? claims.picture : '',
  };
}
