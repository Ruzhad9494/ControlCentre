// functions/_lib/util.js - utiliti kongsi Pages Functions (tiada kebergantungan luar).

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('base64url tak sah');
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const utf8 = (s) => enc.encode(s);
export const fromUtf8 = (b) => dec.decode(b);

export function toHex(bytes) {
  const arr = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', utf8(text)));
}

const keyCache = new Map();
async function hmacKey(secret) {
  let k = keyCache.get(secret);
  if (!k) {
    k = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(secret, k);
  }
  return k;
}

export async function hmacSha256(secret, text) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8(text)));
}

export async function hmacHex(secret, text) {
  return toHex(await hmacSha256(secret, text));
}

/** Banding masa-tetap. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomId(bytes = 18) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64urlEncode(b);
}

export function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  });
  return out;
}

export const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function json(data, status = 200, extraHeaders = {}) {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS });
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (Array.isArray(v)) v.forEach((x) => h.append(k, x)); else h.set(k, v);
  }
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function redirect(location, cookies = []) {
  const h = new Headers({ Location: location, ...SECURITY_HEADERS });
  cookies.forEach((c) => h.append('Set-Cookie', c));
  return new Response(null, { status: 303, headers: h });
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || '0.0.0.0';
}

/** Hash IP + secret (BSD 3.1 LoginLog.ip_hash): bukan IP mentah. */
export async function ipHash(secret, ip) {
  return (await hmacHex(secret, 'ip|' + ip)).slice(0, 32);
}
