// POST /auth/google - Google Sign-In redirect mode hantar credential ke sini (TRD 5.1; IPD 1.6).

import { verifyGoogleIdToken, TokenError } from '../_lib/google.js';
import { getAccess, logLoginEvent } from '../_lib/access.js';
import { createSession, sessionCookie } from '../_lib/session.js';
import { rateLimit } from '../_lib/cache.js';
import { clientIp, ipHash, parseCookies, redirect, safeEqual } from '../_lib/util.js';

export const LOGIN_LIMIT = 10;          // TRD 6 #5: 10 percubaan / 5 minit / IP
export const LOGIN_WINDOW_SEC = 300;
const CLEAR_CSRF = 'g_csrf_token=; Path=/; Max-Age=0; Secure; SameSite=Lax';

function background(context, promise) {
  if (typeof context.waitUntil === 'function') context.waitUntil(promise);
  else return promise;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = clientIp(request);
  const ua = (request.headers.get('User-Agent') || '').slice(0, 300);
  const ih = await ipHash(env.ACCESS_SECRET || 'x', ip);

  const rl = await rateLimit('login:' + ih, LOGIN_LIMIT, LOGIN_WINDOW_SEC);
  if (!rl.ok) {
    if (rl.count === LOGIN_LIMIT + 1) await background(context, logLoginEvent(env, 'rate_limit', { ipHash: ih, userAgent: ua }));
    return redirect('/login/?e=rate');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return redirect('/login/?e=token');
  }
  const credential = String(form.get('credential') || '');
  const csrfBody = String(form.get('g_csrf_token') || '');
  const csrfCookie = parseCookies(request.headers.get('Cookie')).g_csrf_token || '';
  if (!csrfBody || !safeEqual(csrfBody, csrfCookie)) return redirect('/login/?e=csrf', [CLEAR_CSRF]);

  let who;
  try {
    who = await verifyGoogleIdToken(credential, { clientId: env.GOOGLE_CLIENT_ID });
  } catch (e) {
    if (e instanceof TokenError) {
      await background(context, logLoginEvent(env, 'email_tak_sah', { ipHash: ih, userAgent: ua }));
      return redirect('/login/?e=token', [CLEAR_CSRF]);
    }
    console.error('verifyGoogleIdToken', e);
    return redirect('/login/?e=server', [CLEAR_CSRF]);
  }

  let access;
  try {
    access = await getAccess(env, who.email, { purpose: 'login', sub: who.sub, ipHash: ih, userAgent: ua });
  } catch (e) {
    console.error('getAccess login', e);
    return redirect('/login/?e=server', [CLEAR_CSRF]);
  }
  if (!access || !access.ok) {
    const reason = access && /^[a-z_]{1,20}$/.test(access.reason) ? access.reason : 'tiada_staf';
    // Emel diletak dalam fragment (#) supaya tak masuk log pelayan; dipapar di S-03 supaya staf nampak akaun mana dicuba
    return redirect(`/no-access/?r=${reason}#e=${encodeURIComponent(who.email)}`, [CLEAR_CSRF]);
  }

  const { value } = await createSession(env, { email: who.email, tv: access.token_version });
  return redirect('/', [sessionCookie(value), CLEAR_CSRF]);
}

export function onRequestGet() {
  return redirect('/login/');
}
