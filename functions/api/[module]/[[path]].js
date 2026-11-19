// POST /api/<module>/<action> - gateway ke Apps Script modul (TRD 5.2; IPD 1.7).
//
// 1. CSRF: Origin sama + header X-VP
// 2. Sesi: cookie HMAC, akses (cache 10 minit), token_version & status
// 3. Had kadar: 120 / minit / staf
// 4. Role kasar: sekurang-kurangnya satu role untuk modul
// 5. Forward bertandatangan HMAC per modul. Role halus + skop data di Apps Script.

import { MODULES, rolesForModule } from '../../_lib/modules.js';
import { callGas } from '../../_lib/sign.js';
import { rateLimit } from '../../_lib/cache.js';
import { assertSameOrigin, requireSession, errorResponse, HttpError } from '../../_lib/guard.js';
import { json, sha256Hex } from '../../_lib/util.js';

export const API_LIMIT = 120;
export const MAX_BODY_BYTES = 15 * 1024 * 1024;
const ACTION_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const BLOCKED_ACTIONS = new Set(['getAccess', 'logLoginEvent']); // action system access: /auth sahaja

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Kaedah tidak dibenarkan', { Allow: 'POST' });
    assertSameOrigin(request);

    const moduleId = String(params.module || '');
    const path = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
    const mod = Object.prototype.hasOwnProperty.call(MODULES, moduleId) ? MODULES[moduleId] : null;
    if (!mod) throw new HttpError(404, 'Modul tidak dijumpai');
    if (path.length !== 1 || !ACTION_RE.test(path[0]) || BLOCKED_ACTIONS.has(path[0])) throw new HttpError(404, 'Action tidak dijumpai');
    const action = path[0];

    const { session, access } = await requireSession(context);

    const rl = await rateLimit('api:' + (await sha256Hex(session.sub)), API_LIMIT, 60);
    if (!rl.ok) throw new HttpError(429, 'Terlalu banyak permintaan. Cuba sebentar lagi.', { 'Retry-After': '60' });

    const roles = rolesForModule(moduleId, access.roles);
    if (!roles.length) throw new HttpError(403, 'Anda tiada akses ke modul ini');

    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY_BYTES) throw new HttpError(413, 'Data terlalu besar');
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Data terlalu besar');
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new HttpError(400, 'Body mesti JSON');
      }
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new HttpError(400, 'Body mesti objek JSON');

    const user = {
      email: session.sub,
      nama: access.staff && access.staff.nama,
      staff_id: access.staff && access.staff.staff_id,
      department: access.staff && access.staff.department,
      roles,
      scope: (access.scope && access.scope[moduleId]) || '',
    };
    const data = await callGas(env[mod.url], env[mod.secret], action, payload, user);
    return json({ data });
  } catch (e) {
    return errorResponse(e);
  }
}
