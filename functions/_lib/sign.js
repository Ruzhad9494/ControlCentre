// functions/_lib/sign.js - panggil Apps Script dengan tandatangan HMAC (TRD 5.2 langkah 2).
//
// body = { action, ts, nonce, data, sig }
// data = JSON.stringify({ payload, user })
// sig  = hex(HMAC_SHA256(secret, `${action}|${ts}|${nonce}|${hex(SHA256(data))}`))
// Mesti sepadan dengan shared/gas/VPAuth.gs verifySignature_().

import { hmacHex, sha256Hex, randomId } from './util.js';

export async function signEnvelope(secret, action, payload, user, now = Math.floor(Date.now() / 1000)) {
  const ts = now;
  const nonce = randomId(18);
  const data = JSON.stringify({ payload: payload ?? {}, user: user ?? {} });
  const sig = await hmacHex(secret, `${action}|${ts}|${nonce}|${await sha256Hex(data)}`);
  return { action, ts, nonce, data, sig };
}

export class GasError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Hantar ke Apps Script. Pulang data (bila ok) atau buang GasError(status, mesej).
 * Apps Script tak boleh set status HTTP, jadi status dibawa dalam body { ok, status, error }.
 */
export async function callGas(url, secret, action, payload, user, { fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  if (!url || !secret) throw new GasError(503, 'Modul belum dikonfigurasi');
  const body = JSON.stringify(await signEnvelope(secret, action, payload, user));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new GasError(e && e.name === 'AbortError' ? 504 : 502, 'Pelayan modul tidak dapat dihubungi');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    throw new GasError(502, 'Respons modul tidak sah');
  }
  if (!out || out.ok !== true) {
    // 401 dari Apps Script = tandatangan/secret tak sepadan (konfigurasi), BUKAN sesi staf tamat.
    // Jangan pulangkan 401 ke browser, nanti staf dihantar ke login berulang kali.
    if (out && out.status === 401) throw new GasError(502, 'Konfigurasi modul tidak sepadan (secret). Hubungi IT.');
    const status = out && Number.isInteger(out.status) && out.status >= 400 && out.status < 600 ? out.status : 502;
    throw new GasError(status, (out && out.error) || 'Ralat modul');
  }
  return out.data;
}
