// Gambar profil staf (permintaan pemilik 21/11/2026): action system getPhoto / setPhoto dalam Apps Script access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupAccessGas, addStaff, ACCESS_SECRET, SUPER_EMAIL, PNG_B64 } from './helpers.mjs';

const SYS = { system: true, email: 'gateway' };
async function call(gas, action, payload, user = SYS) {
  const body = JSON.stringify(await signEnvelope(ACCESS_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}

test('Gambar profil: simpan, baca, ganti (lama ke Trash), buang; staf tamat ditolak; bukan system ditolak', async () => {
  const gas = setupAccessGas();
  addStaff(gas, { staff_id: 'VE0300', email: 'ali@gmail.com', nama: 'Ali' });
  assert.equal((await call(gas, 'getPhoto', { email: 'ali@gmail.com' })).status, 404);
  assert.equal((await call(gas, 'setPhoto', { email: 'ali@gmail.com', data: PNG_B64 }, { email: SUPER_EMAIL, roles: ['superadmin'] })).status, 403, 'hanya gateway (system)');
  assert.equal((await call(gas, 'setPhoto', { email: 'ali@gmail.com', data: Buffer.from('bukan gambar').toString('base64') })).status, 400);
  const r1 = await call(gas, 'setPhoto', { email: 'ali@gmail.com', data: PNG_B64 });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.ok(r1.data.gambar_v, 'versi gambar (8 aksara terakhir ID fail Drive)');
  const g = await call(gas, 'getPhoto', { email: 'ALI@gmail.com' });
  assert.equal(g.data.mime, 'image/png');
  assert.equal(g.data.data, PNG_B64);
  const acc = await call(gas, 'getAccess', { email: 'ali@gmail.com', purpose: 'refresh' });
  assert.equal(acc.data.staff.gambar_v, r1.data.gambar_v, '/auth/me bawa versi gambar');
  const firstId = [...gas.drive.files.keys()].find((k) => gas.drive.files.get(k).getName().startsWith('VE0300_'));
  const r2 = await call(gas, 'setPhoto', { email: 'ali@gmail.com', data: PNG_B64 });
  assert.notEqual(r2.data.gambar_v, r1.data.gambar_v);
  assert.equal(gas.drive.files.get(firstId).trashed, true, 'gambar lama dibuang');
  const r3 = await call(gas, 'setPhoto', { email: 'ali@gmail.com', padam: true });
  assert.equal(r3.data.gambar_v, '');
  assert.equal((await call(gas, 'getPhoto', { email: 'ali@gmail.com' })).status, 404);
  addStaff(gas, { staff_id: 'VE0301', email: 'bekas@gmail.com', status: 'tamat' });
  assert.equal((await call(gas, 'setPhoto', { email: 'bekas@gmail.com', data: PNG_B64 })).status, 403);
  assert.equal((await call(gas, 'getPhoto', { email: 'tiada@gmail.com' })).status, 403);
});
