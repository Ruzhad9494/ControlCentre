// /auth/photo - gambar profil staf yang sedang login (permintaan pemilik 21/11/2026).
//   GET  : gambar sendiri (bait imej). 404 jika tiada.
//   POST : { data: base64 } simpan / ganti; { padam: true } buang.
// Emel SENTIASA dari sesi (bukan dari pelayar), jadi staf hanya boleh sentuh gambar sendiri.

import { requireSession, assertSameOrigin, errorResponse, HttpError } from '../_lib/guard.js';
import { forgetAccess } from '../_lib/access.js';
import { callGas } from '../_lib/sign.js';
import { json, SECURITY_HEADERS } from '../_lib/util.js';

const SYSTEM_USER = { system: true, email: 'gateway' };
const MAX_BODY = 450 * 1024;   // base64 300KB + JSON

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function onRequestGet(context) {
  try {
    const { access } = await requireSession(context);
    const f = await callGas(context.env.ACCESS_GAS_URL, context.env.ACCESS_SECRET, 'getPhoto', { email: access.staff.email }, SYSTEM_USER);
    if (!/^image\/(jpeg|png|webp)$/.test(String(f.mime))) throw new HttpError(404, 'Tiada gambar profil');
    return new Response(b64ToBytes(f.data), {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    const { access } = await requireSession(context);
    const len = Number(context.request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) throw new HttpError(413, 'Gambar terlalu besar');
    const text = await context.request.text();
    if (text.length > MAX_BODY) throw new HttpError(413, 'Gambar terlalu besar');
    let body;
    try { body = JSON.parse(text); } catch { throw new HttpError(400, 'Data tak sah'); }
    const payload = body && body.padam === true ? { email: access.staff.email, padam: true } : { email: access.staff.email, data: String((body && body.data) || '') };
    const r = await callGas(context.env.ACCESS_GAS_URL, context.env.ACCESS_SECRET, 'setPhoto', payload, SYSTEM_USER);
    await forgetAccess(access.staff.email);   // /auth/me seterusnya bawa gambar_v baru
    return json({ gambar_v: r.gambar_v || '' });
  } catch (e) {
    return errorResponse(e);
  }
}
