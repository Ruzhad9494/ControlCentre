// functions/_lib/turnstile.js - sahkan token Cloudflare Turnstile (TRD 5: anti-bot borang public).
// Secret dalam env TURNSTILE_SECRET. Tiada secret = tolak (fail closed).
// Mod dev: TURNSTILE_SECRET = "dev-bypass" HANYA diterima bila hos ialah localhost / 127.0.0.1.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(env, request, token, ip, { fetchImpl = fetch } = {}) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return { ok: false, status: 503, error: 'Borang belum dikonfigurasi (Turnstile)' };
  if (secret === 'dev-bypass') {
    const host = new URL(request.url).hostname;
    return host === '127.0.0.1' || host === 'localhost' ? { ok: true } : { ok: false, status: 503, error: 'Konfigurasi Turnstile tidak sah' };
  }
  if (!token || typeof token !== 'string' || token.length > 2048) return { ok: false, status: 400, error: 'Sila lengkapkan semakan anti-bot' };
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body: form });
    const data = await res.json();
    return data && data.success ? { ok: true } : { ok: false, status: 400, error: 'Semakan anti-bot gagal. Muat semula halaman dan cuba lagi.' };
  } catch {
    return { ok: false, status: 503, error: 'Semakan anti-bot tidak dapat dihubungi. Cuba sebentar lagi.' };
  }
}
