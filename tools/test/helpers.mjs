// Pembantu ujian ESM: Google token palsu (kunci RSA sendiri), Cache API mock,
// dan jambatan fetch -> doPost Apps Script (kod .gs sebenar dalam vm).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createGas, loadGas } = require('./gas-mock.js');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GAS_DIR = path.join(ROOT, 'apps', 'access', 'gas');
export const ACCESS_SECRET = 'a'.repeat(48);
export const SESSION_SECRET = 's'.repeat(48);
export const CLIENT_ID = 'test-client.apps.googleusercontent.com';
export const ACCESS_URL = 'https://gas.test/access';
export const ORIGIN = 'https://cc.voltake.com';
export const SUPER_EMAIL = 'admin.ujian@voltake.com';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// ---------------------------------------------------------------- Google token palsu
let keyPair, jwk;
export async function googleKeys() {
  if (!keyPair) {
    keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    );
    jwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'kid-1', alg: 'RS256', use: 'sig' };
  }
  return { keyPair, jwk };
}

export async function mintIdToken(claims = {}, { kid = 'kid-1', alg = 'RS256', tamper = false } = {}) {
  const { keyPair: kp } = await googleKeys();
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '109876543210987654321',
    email: 'staf@gmail.com', email_verified: true, iat: now, exp: now + 3600, ...claims,
  };
  const h = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const p = b64url(JSON.stringify(body));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${h}.${p}`)));
  if (tamper) sig[10] ^= 0xff;
  return `${h}.${p}.${b64url(sig)}`;
}

// ---------------------------------------------------------------- Cache API mock
export function installCaches() {
  const map = new Map();
  globalThis.caches = {
    default: {
      async match(req) {
        const e = map.get(req.url);
        if (!e || e.exp < Date.now()) return undefined;
        return new Response(e.body, { headers: e.headers });
      },
      async put(req, res) {
        const m = /max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '');
        map.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers), exp: Date.now() + (m ? Number(m[1]) * 1000 : 0) });
      },
      async delete(req) { return map.delete(req.url); },
    },
  };
  return map;
}

export function removeCaches() {
  delete globalThis.caches;
}

// ---------------------------------------------------------------- Apps Script access sebenar
export function setupAccessGas() {
  const gas = loadGas(createGas({
    props: {
      SPREADSHEET_ID: 'stg-sheet', ROOT_FOLDER_ID: 'stg-folder', ENV: 'staging', ACCESS_SECRET,
      SEED_SUPERADMIN_EMAIL: SUPER_EMAIL, SEED_SUPERADMIN_STAFF_ID: 'VE0001', SEED_SUPERADMIN_NAMA: 'Pentadbir Ujian',
    },
  }), GAS_DIR);
  gas.ctx.setupSystem();
  return gas;
}

/** Tambah staf + akses terus ke Sheet mock. */
export function addStaff(gas, { staff_id, email, nama = 'Staf Ujian', department = 'OMP', status = 'aktif', designation = 'Technician', google_sub = '', token_version = 1 }) {
  const sh = gas.spreadsheet.getSheetByName('Staff');
  const h = sh.header();
  const o = { staff_id, email, nama, department, status, designation, google_sub, token_version, jenis_emel: 'gmail', mfa_disahkan: 'FALSE', deleted: 'FALSE' };
  sh.data.push(h.map((k) => (k in o ? o[k] : '')));
}

export function addAccess(gas, email, module_id, roles, extra = {}) {
  const sh = gas.spreadsheet.getSheetByName('UserAccess');
  const h = sh.header();
  const o = { email, module_id, roles, deleted: 'FALSE', ...extra };
  sh.data.push(h.map((k) => (k in o ? o[k] : '')));
}

export function setStaffField(gas, email, field, value) {
  const sh = gas.spreadsheet.getSheetByName('Staff');
  const h = sh.header();
  const row = sh.data.findIndex((r, i) => i > 0 && r[h.indexOf('email')] === email);
  sh.data[row][h.indexOf(field)] = value;
}

/** fetch palsu: JWKS Google + Apps Script (doPost sebenar) + URL modul lain (rekod sahaja). */
export function installFetch(gas, { moduleHandler } = {}) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === 'https://www.googleapis.com/oauth2/v3/certs') {
      const { jwk: k } = await googleKeys();
      return new Response(JSON.stringify({ keys: [k] }), { headers: { 'Cache-Control': 'public, max-age=3600' } });
    }
    if (u === ACCESS_URL) {
      const out = gas.ctx.doPost({ postData: { contents: init.body } });
      return new Response(out.getContent(), { headers: { 'Content-Type': 'application/json' } });
    }
    if (moduleHandler) return moduleHandler(u, init);
    throw new Error('fetch tidak dijangka: ' + u);
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

export function env(extra = {}) {
  return {
    GOOGLE_CLIENT_ID: CLIENT_ID, SESSION_SECRET, ACCESS_SECRET, ACCESS_GAS_URL: ACCESS_URL,
    GAS_URL_CLAIMPRO: 'https://gas.test/claimpro', MODULE_SECRET_CLAIMPRO: 'c'.repeat(48),
    ...extra,
  };
}

export function ctx(request, e = env(), params = {}) {
  return { request, env: e, params, waitUntil: undefined };
}
