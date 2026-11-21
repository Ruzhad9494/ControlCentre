// functions/_lib/cache.js - simpanan sementara guna Cache API (TRD 5.2, 5.3, 6 #5).
//
// Nota: Cache API Cloudflare adalah PER DATA CENTER dan TIDAK berfungsi pada
// domain *.pages.dev (tiada kesan). Di domain sendiri (contoh portal.voltake.com) ia berfungsi. Semua kod
// yang guna fail ni mesti tetap betul walaupun cache sentiasa kosong.

const BASE = 'https://vp-cache.internal/';

function store() {
  try {
    return globalThis.caches && globalThis.caches.default ? globalThis.caches.default : null;
  } catch {
    return null;
  }
}

const keyUrl = (key) => new Request(BASE + encodeURIComponent(key));

export async function cacheGet(key) {
  const c = store();
  if (!c) return null;
  try {
    const res = await c.match(keyUrl(key));
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function cachePut(key, value, ttlSec) {
  const c = store();
  if (!c) return;
  try {
    await c.put(keyUrl(key), new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${Math.max(1, Math.floor(ttlSec))}` },
    }));
  } catch {
    /* cache gagal tidak boleh hentikan permintaan */
  }
}

export async function cacheDelete(key) {
  const c = store();
  if (!c) return;
  try { await c.delete(keyUrl(key)); } catch { /* abaikan */ }
}

/**
 * Had kadar anggaran (tetingkap tetap). Pulang { ok, count }.
 * Per data center sahaja; cukup untuk halang cubaan brute-force dari satu IP.
 */
export async function rateLimit(key, limit, windowSec, now = Date.now()) {
  const bucket = Math.floor(now / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  const cur = (await cacheGet(k)) || { n: 0 };
  const n = (cur.n || 0) + 1;
  const remaining = windowSec - (Math.floor(now / 1000) % windowSec);
  await cachePut(k, { n }, remaining);
  return { ok: n <= limit, count: n };
}
