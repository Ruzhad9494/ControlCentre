// POST /auth/logout - padam cookie + revoke sid (TRD 5.3; F-06).

import { readSessionCookie, verifySession, revokeSid, clearSessionCookie } from '../_lib/session.js';
import { forgetAccess } from '../_lib/access.js';
import { assertSameOrigin, errorResponse } from '../_lib/guard.js';
import { json } from '../_lib/util.js';

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    const s = await verifySession(context.env, readSessionCookie(context.request));
    if (s) {
      await revokeSid(s.sid, s.exp);
      await forgetAccess(s.sub);
    }
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  } catch (e) {
    return errorResponse(e);
  }
}
