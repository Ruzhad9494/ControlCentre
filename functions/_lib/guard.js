// functions/_lib/guard.js - semakan sesi + CSRF untuk /auth/me, /auth/logout, /api/* (TRD 5.2).

import { readSessionCookie, verifySession, clearSessionCookie } from './session.js';
import { getAccess } from './access.js';
import { json } from './util.js';

export class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

/** CSRF: Origin mesti sama dengan origin laman ni dan header X-VP mesti ada. */
export function assertSameOrigin(request) {
  const origin = request.headers.get('Origin');
  const self = new URL(request.url).origin;
  if (!origin || origin !== self || request.headers.get('X-VP') !== '1') {
    throw new HttpError(403, 'Permintaan ditolak (CSRF)');
  }
}

/**
 * Sahkan cookie, ambil akses (cache 10 minit), banding token_version & status.
 * Pulang { session, access }. Buang HttpError(401) dengan cookie dipadam jika tak sah.
 */
export async function requireSession(context) {
  const { request, env } = context;
  const session = await verifySession(env, readSessionCookie(request));
  if (!session) throw new HttpError(401, 'Sesi tamat. Sila log masuk semula.', { 'Set-Cookie': clearSessionCookie() });
  const access = await getAccess(env, session.sub, { purpose: 'refresh' });
  if (!access || !access.ok || access.status !== 'aktif' || Number(access.token_version) !== Number(session.tv)) {
    throw new HttpError(401, 'Sesi tamat. Sila log masuk semula.', { 'Set-Cookie': clearSessionCookie() });
  }
  return { session, access };
}

export function errorResponse(e) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status, e.headers);
  if (e && Number.isInteger(e.status)) return json({ error: e.message }, e.status);
  console.error('Ralat tidak dijangka:', e && e.stack ? e.stack : e);
  return json({ error: 'Ralat dalaman pelayan' }, 500);
}
