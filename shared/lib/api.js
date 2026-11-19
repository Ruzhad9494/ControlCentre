// shared/lib/api.js - panggil /api/<modul>/<action> dan /auth/* (TRD 5.2; AFD 4, 6).

export const APP_VERSION = '1.0.0-fasa1';
const SLOW_MS = 3000;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const NEXT_KEY = 'vp_next';

function rememberNext() {
  try {
    const here = location.pathname + location.search + location.hash;
    if (!here.startsWith('/login')) sessionStorage.setItem(NEXT_KEY, here);
  } catch { /* storan disekat: abaikan */ }
}

/** Selepas login, kembali ke halaman asal (laluan dalaman sahaja). */
export function takeNext() {
  try {
    const n = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    if (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login')) return n;
  } catch { /* abaikan */ }
  return null;
}

export function goLogin() {
  rememberNext();
  location.assign('/login/');
}

async function readJson(res) {
  try { return await res.json(); } catch { return {}; }
}

/**
 * api('claimpro', 'listMyClaims', { ... }, { onSlow })
 * - 401: simpan laluan semasa, ke S-01 (AFD 6)
 * - lain: buang ApiError(status, mesej)
 */
export async function api(module, action, payload = {}, { onSlow } = {}) {
  let timer;
  if (onSlow) timer = setTimeout(onSlow, SLOW_MS);
  let res;
  try {
    res = await fetch(`/api/${encodeURIComponent(module)}/${encodeURIComponent(action)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-VP': '1' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError(0, 'Tiada sambungan. Cuba lagi.');
  } finally {
    clearTimeout(timer);
  }
  const body = await readJson(res);
  if (res.status === 401) {
    goLogin();
    throw new ApiError(401, body.error || 'Sesi tamat');
  }
  if (!res.ok) {
    const msg = res.status === 403 ? (body.error || 'Anda tiada kebenaran untuk tindakan ini') : (body.error || 'Ralat pelayan (' + res.status + ')');
    throw new ApiError(res.status, msg);
  }
  return body.data;
}

let mePromise = null;

/** Maklumat staf semasa. 401 -> ke login (kecuali { redirect:false }). */
export function getMe({ redirect = true } = {}) {
  if (!mePromise) {
    mePromise = (async () => {
      let res;
      try {
        res = await fetch('/auth/me', { credentials: 'same-origin', headers: { 'X-VP': '1' } });
      } catch {
        throw new ApiError(0, 'Tiada sambungan. Cuba lagi.');
      }
      if (res.status === 401) throw new ApiError(401, 'Belum log masuk');
      if (!res.ok) throw new ApiError(res.status, (await readJson(res)).error || 'Ralat pelayan');
      return res.json();
    })();
    mePromise.catch(() => { mePromise = null; });
  }
  return mePromise.catch((e) => {
    if (e.status === 401 && redirect) goLogin();
    throw e;
  });
}

export async function logout() {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-VP': '1' } });
  } catch { /* tetap ke login */ }
  try { sessionStorage.clear(); } catch { /* abaikan */ }
  location.assign('/login/?keluar=1');
}
