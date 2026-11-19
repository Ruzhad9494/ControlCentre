// Ujian Fasa 1: Pages Functions (/auth, /api) + rantaian ke Apps Script access sebenar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ROOT, ACCESS_SECRET, CLIENT_ID, ORIGIN, SUPER_EMAIL,
  mintIdToken, installCaches, removeCaches, setupAccessGas, addStaff, addAccess, setStaffField, installFetch, env, ctx,
} from './helpers.mjs';

import { verifyGoogleIdToken, TokenError, _resetJwksCache } from '../../functions/_lib/google.js';
import { createSession, verifySession, revokeSid, SESSION_COOKIE } from '../../functions/_lib/session.js';
import { signEnvelope, callGas } from '../../functions/_lib/sign.js';
import { MODULES, rolesForModule } from '../../functions/_lib/modules.js';
import { buildMe } from '../../functions/auth/me.js';
import * as authGoogle from '../../functions/auth/google.js';
import * as authMe from '../../functions/auth/me.js';
import * as authLogout from '../../functions/auth/logout.js';
import * as api from '../../functions/api/[module]/[[path]].js';

// ------------------------------------------------------------------ helper permintaan
function loginRequest(credential, { csrf = 'csrf-123', cookieCsrf = csrf, ip = '1.2.3.4' } = {}) {
  const body = new URLSearchParams({ credential, g_csrf_token: csrf });
  return new Request(ORIGIN + '/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: `g_csrf_token=${cookieCsrf}`, 'CF-Connecting-IP': ip, Origin: 'https://accounts.google.com' },
    body,
  });
}

function apiRequest(mod, action, payload, cookie, { origin = ORIGIN, xvp = true, method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (xvp) headers['X-VP'] = '1';
  if (cookie) headers.Cookie = `${SESSION_COOKIE}=${cookie}`;
  return new Request(`${ORIGIN}/api/${mod}/${action}`, { method, headers, body: method === 'POST' ? JSON.stringify(payload || {}) : undefined });
}

const apiCtx = (req, mod, action, e = env()) => ctx(req, e, { module: mod, path: [action] });

function cookieFrom(res) {
  const sc = res.headers.get('Set-Cookie') || '';
  const m = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(sc);
  return m ? m[1] : null;
}

async function login(gas, email, sub = '109876543210987654321') {
  const res = await authGoogle.onRequestPost(ctx(loginRequest(await mintIdToken({ email, sub }))));
  return { res, cookie: cookieFrom(res) };
}

function fresh() {
  _resetJwksCache();
  installCaches();
  const gas = setupAccessGas();
  const f = installFetch(gas, {
    moduleHandler: async (url, init) => new Response(JSON.stringify({ ok: true, data: { echo: JSON.parse(init.body) } })),
  });
  return { gas, f };
}

// ------------------------------------------------------------------ google.js
test('Google token: sah diterima, emel dinormalkan; tiada semakan hd', async () => {
  const { f } = fresh();
  try {
    const who = await verifyGoogleIdToken(await mintIdToken({ email: 'Staf.Satu@Gmail.com' }), { clientId: CLIENT_ID });
    assert.equal(who.email, 'staf.satu@gmail.com');
    assert.equal(who.sub, '109876543210987654321');
  } finally { f.restore(); }
});

test('Google token: ditolak bila aud/iss/exp/email_verified/tandatangan/alg salah', async () => {
  const { f } = fresh();
  try {
    const now = Math.floor(Date.now() / 1000);
    const bad = [
      await mintIdToken({ aud: 'lain.apps.googleusercontent.com' }),
      await mintIdToken({ iss: 'https://evil.example.com' }),
      await mintIdToken({ exp: now - 3600 }),
      await mintIdToken({ email_verified: false }),
      await mintIdToken({}, { tamper: true }),
      await mintIdToken({}, { kid: 'tiada' }),
      'abc.def',
    ];
    for (const t of bad) await assert.rejects(verifyGoogleIdToken(t, { clientId: CLIENT_ID }), TokenError);
    const none = Buffer.from(JSON.stringify({ alg: 'none', kid: 'kid-1' })).toString('base64url') + '.' +
      Buffer.from(JSON.stringify({ email: 'x@y.com' })).toString('base64url') + '.';
    await assert.rejects(verifyGoogleIdToken(none, { clientId: CLIENT_ID }), TokenError);
  } finally { f.restore(); }
});

// ------------------------------------------------------------------ session.js
test('Sesi: cipta/sahkan; tamper, tamat dan revoke ditolak', async () => {
  installCaches();
  const e = env();
  const { value, payload } = await createSession(e, { email: 'a@b.com', tv: 3 });
  assert.equal(payload.exp - payload.iat, 12 * 3600);
  assert.equal((await verifySession(e, value)).sub, 'a@b.com');

  const [body, sig] = value.split('.');
  const forged = Buffer.from(JSON.stringify({ ...payload, sub: 'boss@voltake.com' })).toString('base64url');
  assert.equal(await verifySession(e, `${forged}.${sig}`), null, 'payload diubah');
  assert.equal(await verifySession({ SESSION_SECRET: 'z'.repeat(48) }, value), null, 'secret lain');
  assert.equal(await verifySession(e, value, payload.exp + 1), null, 'tamat');
  assert.equal(await verifySession(e, body), null);

  await revokeSid(payload.sid, payload.exp);
  assert.equal(await verifySession(e, value), null, 'revoke');
  await assert.rejects(createSession({ SESSION_SECRET: 'pendek' }, { email: 'a@b.com', tv: 1 }), /SESSION_SECRET/);
});

// ------------------------------------------------------------------ sign.js <-> VPAuth.gs
test('Tandatangan JS diterima Apps Script; diubah/luput/diulang ditolak SEBELUM Sheet dibaca', async () => {
  const gas = setupAccessGas();
  const before = gas.counters.openById;
  const doPost = (body) => JSON.parse(gas.ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());

  const good = await signEnvelope(ACCESS_SECRET, 'getAccess', { email: SUPER_EMAIL, purpose: 'refresh' }, { system: true });
  const okRes = doPost(good);
  assert.equal(okRes.ok, true);
  assert.equal(okRes.data.ok, true);

  const opened = gas.counters.openById;
  assert.equal(doPost(good).status, 401, 'nonce diulang');
  assert.equal(doPost({ ...(await signEnvelope(ACCESS_SECRET, 'getAccess', {}, { system: true })), sig: '0'.repeat(64) }).status, 401, 'sig salah');
  assert.equal(doPost(await signEnvelope('salah'.repeat(10), 'getAccess', {}, { system: true })).status, 401, 'secret salah');
  const old = await signEnvelope(ACCESS_SECRET, 'getAccess', {}, { system: true }, Math.floor(Date.now() / 1000) - 600);
  assert.equal(doPost(old).status, 401, 'ts lama');
  const tampered = await signEnvelope(ACCESS_SECRET, 'getAccess', { email: 'a@b.com' }, { system: true });
  tampered.data = tampered.data.replace('a@b.com', SUPER_EMAIL);
  assert.equal(doPost(tampered).status, 401, 'data diubah');
  const { sig, ...noSig } = await signEnvelope(ACCESS_SECRET, 'getAccess', {}, { system: true });
  assert.equal(doPost(noSig).status, 401, 'tiada sig');
  assert.equal(doPost('bukan json').status, 400);
  assert.equal(gas.counters.openById, opened, 'Sheet tidak dibuka untuk permintaan ditolak');
  assert.ok(opened > before);
});

test('Action system (getAccess) ditolak tanpa user.system walaupun tandatangan sah', async () => {
  const gas = setupAccessGas();
  const res = JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify(await signEnvelope(ACCESS_SECRET, 'getAccess', { email: SUPER_EMAIL }, { email: SUPER_EMAIL, roles: ['superadmin'] })) } }).getContent());
  assert.equal(res.status, 403);
});

// ------------------------------------------------------------------ /auth/google
test('Login: superadmin berjaya, cookie HttpOnly, sub diikat, LoginLog ok', async () => {
  const { gas, f } = fresh();
  try {
    const { res, cookie } = await login(gas, SUPER_EMAIL, '111');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('Location'), '/');
    assert.ok(cookie);
    const sc = res.headers.get('Set-Cookie');
    assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Max-Age=43200/);
    const staff = gas.spreadsheet.getSheetByName('Staff').rows()[0];
    assert.equal(staff.google_sub, '111');
    assert.ok(staff.last_login_at);
    const log = gas.spreadsheet.getSheetByName('LoginLog').rows();
    assert.equal(log.at(-1).hasil, 'ok');
    assert.match(log.at(-1).ip_hash, /^[0-9a-f]{32}$/);
    assert.ok(!JSON.stringify(log).includes('1.2.3.4'), 'IP mentah tidak disimpan');
  } finally { f.restore(); }
});

test('Login: Gmail tak berdaftar -> S-03 tiada_staf, tiada cookie, LoginLog tiada_staf', async () => {
  const { gas, f } = fresh();
  try {
    const { res, cookie } = await login(gas, 'orang.luar@gmail.com');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('Location'), '/no-access/?r=tiada_staf#e=orang.luar%40gmail.com');
    assert.equal(cookie, null);
    assert.equal(gas.spreadsheet.getSheetByName('LoginLog').rows().at(-1).hasil, 'tiada_staf');
  } finally { f.restore(); }
});

test('Login: sub tak padan ditolak; status tamat ditolak', async () => {
  const { gas, f } = fresh();
  try {
    addStaff(gas, { staff_id: 'VE0100', email: 'tech@gmail.com', google_sub: '999' });
    let r = await login(gas, 'tech@gmail.com', '888');
    assert.equal(r.res.headers.get('Location'), '/no-access/?r=sub_tak_padan#e=tech%40gmail.com');
    assert.equal(gas.spreadsheet.getSheetByName('LoginLog').rows().at(-1).hasil, 'sub_tak_padan');

    addStaff(gas, { staff_id: 'VE0101', email: 'berhenti@gmail.com', status: 'tamat' });
    r = await login(gas, 'berhenti@gmail.com');
    assert.match(r.res.headers.get('Location'), /r=tamat/);
    assert.equal(r.cookie, null);
  } finally { f.restore(); }
});

test('Login: CSRF g_csrf_token tak padan atau token palsu ditolak', async () => {
  const { gas, f } = fresh();
  try {
    let res = await authGoogle.onRequestPost(ctx(loginRequest(await mintIdToken({ email: SUPER_EMAIL }), { cookieCsrf: 'lain' })));
    assert.equal(res.headers.get('Location'), '/login/?e=csrf');
    res = await authGoogle.onRequestPost(ctx(loginRequest(await mintIdToken({ email: SUPER_EMAIL }, { tamper: true }))));
    assert.equal(res.headers.get('Location'), '/login/?e=token');
    assert.equal(cookieFrom(res), null);
    assert.equal(gas.spreadsheet.getSheetByName('LoginLog').rows().at(-1).hasil, 'email_tak_sah');
  } finally { f.restore(); }
});

test('Login: rate limit 10 percubaan / 5 minit / IP, direkod sekali dalam LoginLog', async () => {
  const { gas, f } = fresh();
  try {
    let last;
    for (let i = 0; i < 13; i++) {
      last = await authGoogle.onRequestPost(ctx(loginRequest('token-rosak', { ip: '9.9.9.9' })));
    }
    assert.equal(last.headers.get('Location'), '/login/?e=rate');
    const rl = gas.spreadsheet.getSheetByName('LoginLog').rows().filter((r) => r.hasil === 'rate_limit');
    assert.equal(rl.length, 1);
    const other = await authGoogle.onRequestPost(ctx(loginRequest('token-rosak', { ip: '8.8.8.8' })));
    assert.equal(other.headers.get('Location'), '/login/?e=token', 'IP lain tidak disekat');
  } finally { f.restore(); }
});

// ------------------------------------------------------------------ /auth/me
test('/auth/me: tanpa cookie 401; superadmin nampak semua modul + admin', async () => {
  const { gas, f } = fresh();
  try {
    let res = await authMe.onRequestGet(ctx(new Request(ORIGIN + '/auth/me')));
    assert.equal(res.status, 401);
    const { cookie } = await login(gas, SUPER_EMAIL);
    res = await authMe.onRequestGet(ctx(new Request(ORIGIN + '/auth/me', { headers: { Cookie: `${SESSION_COOKIE}=${cookie}` } })));
    assert.equal(res.status, 200);
    const me = await res.json();
    assert.equal(me.staff.email, SUPER_EMAIL);
    assert.equal(me.modules.length, 8);
    assert.deepEqual(me.admin, { staff: true, access: true, audit: true });
  } finally { f.restore(); }
});

test('buildMe: HR nampak tepat modul HR (F-02), bukan admin akses; tamat_pada lepas diabaikan', async () => {
  const { gas, f } = fresh();
  try {
    addStaff(gas, { staff_id: 'VE0200', email: 'hr@voltake.com', department: 'HR' });
    addAccess(gas, 'hr@voltake.com', 'hr', 'hr_admin');
    addAccess(gas, 'hr@voltake.com', 'compliance', 'hr_admin');
    addAccess(gas, 'hr@voltake.com', 'claimpro', 'staff,admin');
    addAccess(gas, 'hr@voltake.com', 'ams', 'staff', { tamat_pada: '2020-01-01' });
    const { cookie } = await login(gas, 'hr@voltake.com');
    const me = await (await authMe.onRequestGet(ctx(new Request(ORIGIN + '/auth/me', { headers: { Cookie: `${SESSION_COOKIE}=${cookie}` } })))).json();
    assert.deepEqual(me.modules.map((m) => m.module_id).sort(), ['claimpro', 'compliance', 'hr']);
    assert.deepEqual(me.admin, { staff: true, access: false, audit: false });
  } finally { f.restore(); }
});

// ------------------------------------------------------------------ /api gateway
test('API: CSRF (Origin lain / tiada X-VP) 403; tanpa cookie 401; GET 405', async () => {
  const { gas, f } = fresh();
  try {
    const { cookie } = await login(gas, SUPER_EMAIL);
    let res = await api.onRequest(apiCtx(apiRequest('claimpro', 'listMyClaims', {}, cookie, { origin: 'https://evil.com' }), 'claimpro', 'listMyClaims'));
    assert.equal(res.status, 403);
    res = await api.onRequest(apiCtx(apiRequest('claimpro', 'listMyClaims', {}, cookie, { xvp: false }), 'claimpro', 'listMyClaims'));
    assert.equal(res.status, 403);
    res = await api.onRequest(apiCtx(apiRequest('claimpro', 'listMyClaims', {}, null), 'claimpro', 'listMyClaims'));
    assert.equal(res.status, 401);
    res = await api.onRequest(apiCtx(apiRequest('claimpro', 'x', null, cookie, { method: 'GET' }), 'claimpro', 'x'));
    assert.equal(res.status, 405);
  } finally { f.restore(); }
});

test('API: modul tanpa role 403 (HR ke /api/ams); modul/action tak sah 404; getAccess disekat', async () => {
  const { gas, f } = fresh();
  try {
    addStaff(gas, { staff_id: 'VE0200', email: 'hr@voltake.com', department: 'HR' });
    addAccess(gas, 'hr@voltake.com', 'claimpro', 'staff');
    const { cookie } = await login(gas, 'hr@voltake.com');
    let res = await api.onRequest(apiCtx(apiRequest('ams', 'listAssets', {}, cookie), 'ams', 'listAssets'));
    assert.equal(res.status, 403);
    res = await api.onRequest(apiCtx(apiRequest('access', 'listStaff', {}, cookie), 'access', 'listStaff'));
    assert.equal(res.status, 403, 'staf biasa tak boleh ke admin');
    res = await api.onRequest(apiCtx(apiRequest('tiada', 'x', {}, cookie), 'tiada', 'x'));
    assert.equal(res.status, 404);
    res = await api.onRequest(apiCtx(apiRequest('access', 'getAccess', {}, cookie), 'access', 'getAccess'));
    assert.equal(res.status, 404);
    res = await api.onRequest(apiCtx(apiRequest('__proto__', 'x', {}, cookie), '__proto__', 'x'));
    assert.equal(res.status, 404);
  } finally { f.restore(); }
});

test('API: forward ke modul dengan tandatangan sah + user dari sesi (bukan dari body)', async () => {
  const { gas, f } = fresh();
  try {
    addStaff(gas, { staff_id: 'VE0300', email: 'tech@gmail.com', nama: 'Ali' });
    addAccess(gas, 'tech@gmail.com', 'claimpro', 'staff');
    const { cookie } = await login(gas, 'tech@gmail.com');
    const res = await api.onRequest(apiCtx(apiRequest('claimpro', 'listMyClaims', { user: { email: 'boss@voltake.com', roles: ['admin'] } }, cookie), 'claimpro', 'listMyClaims'));
    assert.equal(res.status, 200);
    const sent = (await res.json()).data.echo;
    assert.equal(sent.action, 'listMyClaims');
    const inner = JSON.parse(sent.data);
    assert.equal(inner.user.email, 'tech@gmail.com');
    assert.deepEqual(inner.user.roles, ['staff']);
    assert.equal(inner.user.nama, 'Ali');
    // sig boleh disahkan dengan MODULE_SECRET_CLAIMPRO
    const { hmacHex, sha256Hex } = await import('../../functions/_lib/util.js');
    assert.equal(sent.sig, await hmacHex('c'.repeat(48), `${sent.action}|${sent.ts}|${sent.nonce}|${await sha256Hex(sent.data)}`));
    assert.ok(!f.calls.some((c) => String(c.url).includes('gas.test/claimpro') && String(c.init.body).includes('MODULE_SECRET')));
  } finally { f.restore(); }
});

test('API: staf ditukar tamat / token_version naik -> 401 (selepas cache tamat)', async () => {
  const { gas, f } = fresh();
  try {
    addStaff(gas, { staff_id: 'VE0400', email: 'tech@gmail.com' });
    addAccess(gas, 'tech@gmail.com', 'claimpro', 'staff');
    const { cookie } = await login(gas, 'tech@gmail.com');
    let res = await api.onRequest(apiCtx(apiRequest('claimpro', 'a', {}, cookie), 'claimpro', 'a'));
    assert.equal(res.status, 200);

    setStaffField(gas, 'tech@gmail.com', 'status', 'tamat');
    res = await api.onRequest(apiCtx(apiRequest('claimpro', 'a', {}, cookie), 'claimpro', 'a'));
    assert.equal(res.status, 200, 'masih dalam cache 10 minit (TRD 5.3)');

    removeCaches(); // simulasi cache tamat
    res = await api.onRequest(apiCtx(apiRequest('claimpro', 'a', {}, cookie), 'claimpro', 'a'));
    assert.equal(res.status, 401);
    assert.match(res.headers.get('Set-Cookie'), /Max-Age=0/);

    installCaches();
    setStaffField(gas, 'tech@gmail.com', 'status', 'aktif');
    setStaffField(gas, 'tech@gmail.com', 'token_version', 2);
    res = await api.onRequest(apiCtx(apiRequest('claimpro', 'a', {}, cookie), 'claimpro', 'a'));
    assert.equal(res.status, 401, 'token_version berubah');
  } finally { f.restore(); }
});

test('API: had 120 permintaan / minit / staf -> 429', async () => {
  const { gas, f } = fresh();
  try {
    addStaff(gas, { staff_id: 'VE0500', email: 'laju@gmail.com' });
    addAccess(gas, 'laju@gmail.com', 'claimpro', 'staff');
    const { cookie } = await login(gas, 'laju@gmail.com');
    let res;
    for (let i = 0; i < 121; i++) res = await api.onRequest(apiCtx(apiRequest('claimpro', 'a', {}, cookie), 'claimpro', 'a'));
    assert.equal(res.status, 429);
  } finally { f.restore(); }
});

test('Logout: cookie dipadam dan sid di-revoke; perlu CSRF', async () => {
  const { gas, f } = fresh();
  try {
    const { cookie } = await login(gas, SUPER_EMAIL);
    let res = await authLogout.onRequestPost(ctx(new Request(ORIGIN + '/auth/logout', { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${cookie}` } })));
    assert.equal(res.status, 403);
    res = await authLogout.onRequestPost(ctx(new Request(ORIGIN + '/auth/logout', { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${cookie}`, Origin: ORIGIN, 'X-VP': '1' } })));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Set-Cookie'), /Max-Age=0/);
    res = await authMe.onRequestGet(ctx(new Request(ORIGIN + '/auth/me', { headers: { Cookie: `${SESSION_COOKIE}=${cookie}` } })));
    assert.equal(res.status, 401, 'cookie lama tidak lagi sah');
  } finally { f.restore(); }
});

// ------------------------------------------------------------------ admin melalui gateway -> access
async function adminCall(cookie, action, payload) {
  const res = await api.onRequest(apiCtx(apiRequest('access', action, payload, cookie), 'access', action));
  return { status: res.status, body: await res.json() };
}

test('Admin: superadmin tambah staf, tetapkan akses (AccessChangeLog), staf baru boleh login', async () => {
  const { gas, f } = fresh();
  try {
    const { cookie } = await login(gas, SUPER_EMAIL);
    let r = await adminCall(cookie, 'addStaff', { staff_id: 'VE0600', email: ' Baru@Gmail.com ', nama: 'Staf Baru', department: 'pss', designation: 'Engineer' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.email, 'baru@gmail.com');
    assert.equal(r.body.data.department, 'PSS');

    r = await adminCall(cookie, 'addStaff', { staff_id: 'VE0601', email: 'baru@gmail.com', nama: 'Dup', department: 'PSS', designation: 'X1' });
    assert.equal(r.status, 409);

    r = await adminCall(cookie, 'setAccess', { email: 'baru@gmail.com', changes: [{ module_id: 'claimpro', roles: ['staff'] }] });
    assert.equal(r.status, 400, 'sebab wajib');
    r = await adminCall(cookie, 'setAccess', { email: 'baru@gmail.com', sebab: 'Onboard', changes: [{ module_id: 'claimpro', roles: ['approver'] }] });
    assert.equal(r.status, 400, 'role bukan dalam roles_sah');
    r = await adminCall(cookie, 'setAccess', { email: 'baru@gmail.com', sebab: 'Onboard', changes: [{ module_id: 'claimpro', roles: ['staff'] }, { module_id: 'gwr', roles: ['engineer'], skop: 'dept=PSS' }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.changed, 2);

    const log = gas.spreadsheet.getSheetByName('AccessChangeLog').rows();
    const gwrLog = log.find((l) => l.module_id === 'gwr');
    assert.equal(gwrLog.admin_email, SUPER_EMAIL);
    assert.equal(gwrLog.roles_baru, 'engineer [dept=PSS]');
    assert.equal(gwrLog.sebab, 'Onboard');

    const nb = await login(gas, 'baru@gmail.com', '555');
    assert.ok(nb.cookie);
    const me = await (await authMe.onRequestGet(ctx(new Request(ORIGIN + '/auth/me', { headers: { Cookie: `${SESSION_COOKIE}=${nb.cookie}` } })))).json();
    assert.deepEqual(me.modules.map((m) => m.module_id).sort(), ['claimpro', 'gwr']);

    r = await adminCall(cookie, 'setAccess', { email: 'baru@gmail.com', sebab: 'Tukar jawatan', changes: [{ module_id: 'gwr', roles: [] }] });
    assert.equal(r.body.data.changed, 1);
    assert.deepEqual(Object.keys(r.body.data.access.roles), ['claimpro']);
  } finally { f.restore(); }
});

test('Admin: HR hanya boleh ubah status/tarikh_tamat/mfa; tak boleh setAccess atau lihat log', async () => {
  const { gas, f } = fresh();
  try {
    addStaff(gas, { staff_id: 'VE0700', email: 'hr@voltake.com', department: 'HR', designation: 'HR Exec' });
    addAccess(gas, 'hr@voltake.com', 'hr', 'hr_admin');
    addStaff(gas, { staff_id: 'VE0701', email: 'pergi@gmail.com' });
    const { cookie } = await login(gas, 'hr@voltake.com');

    let r = await adminCall(cookie, 'listStaff', {});
    assert.equal(r.status, 200);
    assert.ok(r.body.data.every((s) => !('google_sub' in s)), 'google_sub tidak didedah');

    r = await adminCall(cookie, 'updateStaff', { staff_id: 'VE0701', sebab: 'Naik pangkat', fields: { department: 'MGMT' } });
    assert.equal(r.status, 403);
    r = await adminCall(cookie, 'updateStaff', { staff_id: 'VE0701', sebab: 'Berhenti', fields: { status: 'tamat' } });
    assert.equal(r.status, 400, 'tarikh_tamat wajib');
    r = await adminCall(cookie, 'updateStaff', { staff_id: 'VE0701', sebab: 'Berhenti kerja', fields: { status: 'tamat', tarikh_tamat: '2026-12-31' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.status, 'tamat');
    assert.equal(r.body.data.token_version, 2, 'token_version naik bila tamat');

    for (const a of ['setAccess', 'listLoginLog', 'listAccessChangeLog', 'addStaff', 'resetGoogleLink', 'listAccess']) {
      r = await adminCall(cookie, a, { sebab: 'cuba', email: 'pergi@gmail.com', staff_id: 'VE0701', changes: [{ module_id: 'hr', roles: ['hr_admin'] }] });
      assert.equal(r.status, 403, a);
    }
  } finally { f.restore(); }
});

test('Admin: tak boleh buang superadmin terakhir; reset akaun Google kosongkan sub + naik tv', async () => {
  const { gas, f } = fresh();
  try {
    const { cookie } = await login(gas, SUPER_EMAIL);
    let r = await adminCall(cookie, 'setAccess', { email: SUPER_EMAIL, sebab: 'Uji', changes: [{ module_id: '*', roles: [] }] });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /superadmin terakhir/);
    r = await adminCall(cookie, 'updateStaff', { staff_id: 'VE0001', sebab: 'Uji', fields: { status: 'gantung' } });
    assert.equal(r.status, 400);

    addStaff(gas, { staff_id: 'VE0800', email: 'tukar@gmail.com', google_sub: '123' });
    r = await adminCall(cookie, 'resetGoogleLink', { staff_id: 'VE0800', sebab: 'Hilang akaun, disahkan HR' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.akaun_terikat, false);
    const st = gas.spreadsheet.getSheetByName('Staff').rows().find((x) => x.staff_id === 'VE0800');
    assert.equal(st.google_sub, '');
    assert.equal(st.token_version, 2);
  } finally { f.restore(); }
});

test('Formula injection: nilai bermula = disimpan dengan prefix petik', async () => {
  const { gas, f } = fresh();
  try {
    const { cookie } = await login(gas, SUPER_EMAIL);
    const r = await adminCall(cookie, 'addStaff', { staff_id: 'VE0900', email: 'x@gmail.com', nama: '=HYPERLINK("http://x")', department: 'OMP', designation: '+SUM(A1)' });
    assert.equal(r.status, 200);
    const st = gas.spreadsheet.getSheetByName('Staff').rows().find((x) => x.staff_id === 'VE0900');
    assert.equal(st.nama, `'=HYPERLINK("http://x")`);
    assert.equal(st.designation, `'+SUM(A1)`);
    assert.equal(r.body.data.nama, '=HYPERLINK("http://x")', 'dipapar tanpa prefix');
  } finally { f.restore(); }
});

test('Log: superadmin boleh tapis LoginLog ikut hasil', async () => {
  const { gas, f } = fresh();
  try {
    await login(gas, 'luar@gmail.com');
    const { cookie } = await login(gas, SUPER_EMAIL);
    const r = await adminCall(cookie, 'listLoginLog', { hasil: 'tiada_staf' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.length, 1);
    assert.equal(r.body.data[0].email, 'luar@gmail.com');
  } finally { f.restore(); }
});

// ------------------------------------------------------------------ konsistensi
test('functions/_lib/modules.js sepadan dengan config/modules.json + .env.example', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'modules.json'), 'utf8')).modules;
  const envNames = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  for (const m of cfg) {
    assert.ok(MODULES[m.module_id], m.module_id);
    assert.ok(envNames.includes(MODULES[m.module_id].url + '='), MODULES[m.module_id].url);
    assert.ok(envNames.includes(MODULES[m.module_id].secret + '='), MODULES[m.module_id].secret);
  }
  assert.deepEqual(rolesForModule('access', { '*': ['superadmin'], hr: ['hr_admin'] }), ['superadmin', 'hr_admin']);
  assert.deepEqual(rolesForModule('ams', { claimpro: ['staff'] }), []);
});

test('callGas: ralat rangkaian / respons bukan JSON jadi 502, status Apps Script dibawa', async () => {
  await assert.rejects(callGas('', 's', 'a', {}, {}), (e) => e.status === 503);
  await assert.rejects(callGas('https://x', 's', 'a', {}, {}, { fetchImpl: async () => { throw new TypeError('net'); } }), (e) => e.status === 502);
  await assert.rejects(callGas('https://x', 's', 'a', {}, {}, { fetchImpl: async () => new Response('<html>') }), (e) => e.status === 502);
  await assert.rejects(callGas('https://x', 's', 'a', {}, {}, { fetchImpl: async () => new Response(JSON.stringify({ ok: false, status: 403, error: 'Tiada kebenaran' })) }), (e) => e.status === 403 && e.message === 'Tiada kebenaran');
});
