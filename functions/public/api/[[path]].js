// /public/api/* - gateway borang awam tanpa login (TRD 5.2, 6; AFD S-10, S-34; IPD 2E.2).
//
//   GET  /public/api/config                 -> { turnstile_site_key }
//   POST /public/api/<modul>/<action>        -> hanya action dalam PUBLIC_ACTIONS (hr: borang mohon; gwr: tandatangan klien)
//
// 1. Senarai action tetap (whitelist). Lain = 404.
// 2. CSRF: Origin sama + header X-VP (borang dihidang dari laman yang sama).
// 3. Had kadar per IP (Cache API): tulis 10 / 10 minit, baca 60 / minit.
// 4. Turnstile untuk action tulis.
// 5. Forward bertandatangan HMAC ke Apps Script modul dengan user { email: 'public', roles: ['public'], ip_hash }.
//    Apps Script semak semula role 'public' untuk setiap action.

import { MODULES, missingEnv } from '../../_lib/modules.js';
import { callGas, GasError } from '../../_lib/sign.js';
import { rateLimit } from '../../_lib/cache.js';
import { assertSameOrigin, errorResponse, HttpError } from '../../_lib/guard.js';
import { json, clientIp, ipHash } from '../../_lib/util.js';
import { verifyTurnstile } from '../../_lib/turnstile.js';

export const PUBLIC_ACTIONS = {
  hr: {
    listOpenPositions: { write: false },
    submitApplication: { write: true },
  },
  gwr: {
    getSignRequest: { write: false },   // token 32 bait dalam payload; Turnstile tak perlu untuk baca
    getSignPdf: { write: false },
    clientApprove: { write: true },
  },
};
export const WRITE_LIMIT = 10;      // 10 hantaran / 10 minit / IP (TRD 5 jadual keselamatan)
export const READ_LIMIT = 60;       // 60 / minit / IP
export const MAX_PUBLIC_BODY = 9 * 1024 * 1024;

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const path = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
    if (request.method === 'GET' && path.length === 1 && path[0] === 'config') {
      return json({ turnstile_site_key: env.TURNSTILE_SITE_KEY || '' }, 200, { 'Cache-Control': 'no-store' });
    }
    if (request.method !== 'POST') throw new HttpError(405, 'Kaedah tidak dibenarkan', { Allow: 'GET, POST' });
    if (path.length !== 2) throw new HttpError(404, 'Tidak dijumpai');
    const [moduleId, action] = path;
    const spec = Object.prototype.hasOwnProperty.call(PUBLIC_ACTIONS, moduleId) && Object.prototype.hasOwnProperty.call(PUBLIC_ACTIONS[moduleId], action)
      ? PUBLIC_ACTIONS[moduleId][action] : null;
    if (!spec) throw new HttpError(404, 'Tidak dijumpai');
    assertSameOrigin(request);

    const ip = clientIp(request);
    const ih = await ipHash(env.ACCESS_SECRET || 'x', ip);
    const rl = spec.write ? await rateLimit('pub-w:' + ih, WRITE_LIMIT, 600) : await rateLimit('pub-r:' + ih, READ_LIMIT, 60);
    if (!rl.ok) throw new HttpError(429, spec.write ? 'Terlalu banyak hantaran dari rangkaian ini. Cuba lagi selepas 10 minit.' : 'Terlalu banyak permintaan. Cuba sebentar lagi.', { 'Retry-After': spec.write ? '600' : '60' });

    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_PUBLIC_BODY) throw new HttpError(413, 'Fail terlalu besar. Kecilkan gambar / resume.');
    const text = await request.text();
    if (text.length > MAX_PUBLIC_BODY) throw new HttpError(413, 'Fail terlalu besar. Kecilkan gambar / resume.');
    let body = {};
    if (text) {
      try { body = JSON.parse(text); } catch { throw new HttpError(400, 'Body mesti JSON'); }
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Body mesti objek JSON');

    let payload = body;
    if (spec.write) {
      const { turnstile, ...rest } = body;
      const tv = await verifyTurnstile(env, request, turnstile, ip);
      if (!tv.ok) throw new HttpError(tv.status, tv.error);
      payload = rest;
    }
    const mod = MODULES[moduleId];
    const user = { email: 'public', nama: 'Orang awam', roles: ['public'], ip_hash: ih };
    const missing = missingEnv(env, mod);
    if (missing.length) throw new GasError(503, `Modul belum dikonfigurasi: ${missing.join(', ')} tiada dalam deployment ini (isi di Cloudflare Production, kemudian Retry deployment)`);
    const data = await callGas(env[mod.url].trim(), env[mod.secret].trim(), action, payload, user);
    return json({ data }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return errorResponse(e);
  }
}
