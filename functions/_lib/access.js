// functions/_lib/access.js - baca akses staf dari Apps Script `access` dengan cache edge 10 minit (TRD 5.1, 5.2).

import { callGas } from './sign.js';
import { cacheGet, cachePut, cacheDelete } from './cache.js';
import { sha256Hex } from './util.js';

export const ACCESS_TTL_SEC = 600;
const SYSTEM_USER = { system: true, email: 'gateway' };

const cacheKey = async (email) => 'access:' + (await sha256Hex(email));

/**
 * purpose 'login': sentiasa panggil Apps Script (ikat sub, LoginLog), kemudian simpan cache.
 * purpose 'refresh': guna cache jika ada.
 * Pulang { ok:false, reason } atau objek akses penuh.
 */
export async function getAccess(env, email, { purpose = 'refresh', sub = '', ipHash = '', userAgent = '', fetchImpl } = {}) {
  const key = await cacheKey(email);
  if (purpose !== 'login') {
    const hit = await cacheGet(key);
    if (hit) return hit;
  }
  const data = await callGas(
    env.ACCESS_GAS_URL,
    env.ACCESS_SECRET,
    'getAccess',
    { email, sub, purpose, ip_hash: ipHash, user_agent: userAgent },
    SYSTEM_USER,
    fetchImpl ? { fetchImpl } : undefined,
  );
  if (data && data.ok) await cachePut(key, data, ACCESS_TTL_SEC);
  else await cacheDelete(key);
  return data;
}

export async function forgetAccess(email) {
  await cacheDelete(await cacheKey(email));
}

export async function logLoginEvent(env, hasil, { email = '', ipHash = '', userAgent = '', fetchImpl } = {}) {
  try {
    await callGas(env.ACCESS_GAS_URL, env.ACCESS_SECRET, 'logLoginEvent',
      { hasil, email, ip_hash: ipHash, user_agent: userAgent }, SYSTEM_USER, fetchImpl ? { fetchImpl } : undefined);
  } catch {
    /* log gagal tidak boleh hentikan respons */
  }
}
