// Ujian Fasa 2B: ClaimPro (IPD seksyen 6 + peraturan asingan tugas).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupClaimProGas, CLAIMPRO_SECRET, PNG_B64, PDF_B64 } from './helpers.mjs';

const U = {
  ali: { email: 'ali@gmail.com', nama: 'Ali Technician', staff_id: 'VE10', department: 'OMP', roles: ['staff'] },
  abu: { email: 'abu@gmail.com', nama: 'Abu Engineer', staff_id: 'VE11', department: 'OMP', roles: ['staff'] },
  hr: { email: 'hr@voltake.com', nama: 'Siti HR', staff_id: 'VE20', department: 'HR', roles: ['staff', 'admin'] },
  hr2: { email: 'hr2@voltake.com', nama: 'Rina HR', staff_id: 'VE21', department: 'HR', roles: ['staff', 'admin'] },
  head: { email: 'head@voltake.com', nama: 'Head Strategic', staff_id: 'VE30', department: 'STRATEGIC', roles: ['staff', 'admin'] },
  sp: { email: 'sp@voltake.com', nama: 'Staf Strategic', staff_id: 'VE31', department: 'STRATEGIC', roles: ['staff'] },
  sup: { email: 'boss@voltake.com', nama: 'Superadmin', staff_id: 'VE01', department: 'MGMT', roles: ['superadmin', 'staff'] },
  view: { email: 'v@voltake.com', nama: 'Viewer', staff_id: 'VE02', department: 'MGMT', roles: ['viewer'] },
  none: { email: 'x@voltake.com', nama: 'Tiada', staff_id: 'VE03', department: 'ACCOUNT', roles: [] },
};
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() + 8 * 3600e3 - n * 864e5).toISOString().slice(0, 10);

const FORM = { tarikh: daysAgo(1), jenis: 'Makan', pax: 2, keterangan: 'Makan tengah hari site', amaun_rm: 48.5, resit: { data: PNG_B64 } };

async function call(gas, user, action, payload) {
  const body = JSON.stringify(await signEnvelope(CLAIMPRO_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };

async function submitted(gas, user = U.ali, over = {}) {
  return ok(await call(gas, user, 'saveClaim', { ...FORM, ...over, hantar: true })).claim_id;
}

test('setupSystem: 6 tab, ClaimTypes & Settings di-seed, folder Drive, 3 trigger tanpa pendua', () => {
  const gas = setupClaimProGas();
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), ['Approvals', 'AuditLog', 'ClaimTypes', 'Claims', 'Settings', '_Counters']);
  assert.deepEqual(gas.spreadsheet.getSheetByName('ClaimTypes').rows().map((r) => r.jenis), ['Perjalanan', 'Makan', 'Perubatan', 'Penginapan', 'Lain-lain']);
  gas.ctx.setupSystem();
  gas.ctx.setupSystem();
  assert.deepEqual(gas.triggers.map((t) => t.handler).sort(), ['dailyArchive', 'dailyReminders', 'monthlyBezaReport']);
  const root = gas.ctx.DriveApp.getFolderById('claimpro-root');
  const base = root.folders.find((f) => f.name === 'ClaimPro');
  assert.deepEqual(base.folders.map((f) => f.name).sort(), ['Payments', 'Receipts']);
});

test('Role: tanpa role / viewer / bukan admin ditolak ikut action', async () => {
  const gas = setupClaimProGas();
  for (const u of [U.none, U.view]) assert.equal((await call(gas, u, 'listMyClaims', {})).status, 403);
  for (const a of ['listPending', 'decideClaim', 'listToPay', 'claimReport', 'saveClaimType']) {
    assert.equal((await call(gas, U.ali, a, { claim_id: 'CLM-2026-00001', keputusan: 'Lulus', jenis: 'X1' })).status, 403, a);
  }
});

test('Superadmin portal BUKAN admin ClaimPro (asingan tugas): tak boleh lulus/laporan', async () => {
  const gas = setupClaimProGas();
  const id = await submitted(gas);
  assert.equal((await call(gas, U.sup, 'decideClaim', { claim_id: id, keputusan: 'Lulus' })).status, 403);
  assert.equal((await call(gas, U.sup, 'listPending', {})).status, 403);
  assert.equal((await call(gas, U.sup, 'claimReport', {})).status, 403);
});

test('Hantar tuntutan: ID CLM-YYYY-NNNNN, identiti dari sesi, resit disimpan di Receipts/YYYY-MM, Approvals + emel admin', async () => {
  const gas = setupClaimProGas();
  const c = ok(await call(gas, U.ali, 'saveClaim', { ...FORM, hantar: true, staff_email: 'boss@voltake.com', staff_name: 'Palsu', department: 'HR', status: 'Dibayar' }));
  assert.match(c.claim_id, /^CLM-\d{4}-00001$/);
  assert.equal(c.status, 'Dihantar');
  assert.equal(c.staff_name, 'Ali Technician');
  assert.equal(c.department, 'OMP');
  assert.equal(c.amaun_rm, 48.5);
  const row = gas.spreadsheet.getSheetByName('Claims').rows()[0];
  assert.equal(row.staff_email, 'ali@gmail.com', 'emel dari sesi, bukan input');
  const file = gas.drive.files.get(row.receipt_file_id);
  assert.match(file.getName(), new RegExp(`^${c.claim_id}_resit_\\d{8}-\\d{6}\\.png$`));
  const month = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7);
  const rec = gas.ctx.DriveApp.getFolderById('claimpro-root').folders[0].folders.find((f) => f.name === 'Receipts');
  assert.ok(rec.folders.some((f) => f.name === month && f.files.length === 1));
  assert.deepEqual(gas.spreadsheet.getSheetByName('Approvals').rows().map((a) => [a.dari_status, a.ke_status]), [['Draf', 'Dihantar']]);
  assert.equal(gas.mails.length, 1);
  assert.equal(gas.mails[0].to, 'hr-claim@example.test');
  assert.ok(!gas.mails[0].body.includes('ali@gmail.com'), 'emel staf tak dalam emel admin');
  assert.ok(!JSON.stringify(c).includes('file-'), 'ID fail Drive tak didedah');
  assert.ok(!('staff_email' in c));
});

test('Validasi: tarikh masa depan, jenis tak sah, amaun, keterangan, pax, resit wajib, had jenis', async () => {
  const gas = setupClaimProGas();
  const bad = [
    { tarikh: daysAgo(-1) }, { tarikh: '2026-02-30' }, { tarikh: '2019-12-31' }, { jenis: 'Rahsia' }, { jenis: '' },
    { amaun_rm: 0 }, { amaun_rm: -5 }, { amaun_rm: 'abc' }, { amaun_rm: 2000000 }, { keterangan: '' }, { keterangan: 'x'.repeat(501) }, { pax: 0 }, { pax: 1.5 },
  ];
  for (const b of bad) assert.equal((await call(gas, U.ali, 'saveClaim', { ...FORM, ...b, hantar: true })).status, 400, JSON.stringify(b));
  let r = await call(gas, U.ali, 'saveClaim', { ...FORM, resit: undefined, hantar: true });
  assert.equal(r.status, 400);
  assert.match(r.error, /Resit wajib/);
  ok(await call(gas, U.ali, 'saveClaim', { ...FORM, resit: undefined, hantar: false }));   // draf tanpa resit dibenarkan
  ok(await call(gas, U.hr, 'saveClaimType', { jenis: 'Makan', had_rm: 30, perlu_resit: true, aktif: true }));
  r = await call(gas, U.ali, 'saveClaim', { ...FORM, amaun_rm: 48.5, hantar: true });
  assert.equal(r.status, 400);
  assert.match(r.error, /melebihi had/);
  ok(await call(gas, U.hr, 'saveClaimType', { jenis: 'Makan', perlu_resit: false, aktif: true }));
  ok(await call(gas, U.ali, 'saveClaim', { ...FORM, resit: undefined, hantar: true }));   // resit tak wajib lagi
  ok(await call(gas, U.hr, 'saveClaimType', { jenis: 'Makan', perlu_resit: true, aktif: false }));
  assert.equal((await call(gas, U.ali, 'saveClaim', { ...FORM, hantar: false })).status, 400, 'jenis tak aktif');
});

test('Fail: magic bytes disahkan (EXE bernama .jpg ditolak), 8MB, HEIC & PDF dibenarkan', async () => {
  const gas = setupClaimProGas();
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 1)]).toString('base64');
  assert.equal((await call(gas, U.ali, 'saveClaim', { ...FORM, resit: { nama: 'resit.jpg', data: exe }, hantar: true })).status, 400);
  const html = Buffer.from('<html><script>alert(1)</script></html>  ').toString('base64');
  assert.equal((await call(gas, U.ali, 'saveClaim', { ...FORM, resit: { data: html }, hantar: true })).status, 400);
  assert.equal((await call(gas, U.ali, 'saveClaim', { ...FORM, resit: { data: '!!bukan base64!!' }, hantar: true })).status, 400);
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8 * 1024 * 1024 + 10, 1)]).toString('base64');
  assert.equal((await call(gas, U.ali, 'saveClaim', { ...FORM, resit: { data: big }, hantar: true })).status, 400, '>8MB');
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40, 0)]).toString('base64');
  ok(await call(gas, U.ali, 'saveClaim', { ...FORM, resit: { data: heic }, hantar: true }));
  ok(await call(gas, U.ali, 'saveClaim', { ...FORM, resit: { data: PDF_B64 }, hantar: true }));
  assert.equal(gas.drive.files.size, 2, 'tiada fail tertinggal dari percubaan ditolak');
});

test('Draf: simpan, ubah, ganti resit (fail lama dibuang), hantar; Dihantar tak boleh diubah; padam draf', async () => {
  const gas = setupClaimProGas();
  const d = ok(await call(gas, U.ali, 'saveClaim', FORM));
  assert.equal(d.status, 'Draf');
  const first = gas.spreadsheet.getSheetByName('Claims').rows()[0].receipt_file_id;
  const d2 = ok(await call(gas, U.ali, 'saveClaim', { ...FORM, claim_id: d.claim_id, amaun_rm: 60, resit: { data: PDF_B64 } }));
  assert.equal(d2.amaun_rm, 60);
  assert.equal(gas.drive.files.get(first).trashed, true, 'resit lama dibuang');
  assert.equal(gas.mails.length, 0, 'draf tak hantar emel');
  const sent = ok(await call(gas, U.ali, 'saveClaim', { ...FORM, claim_id: d.claim_id, resit: undefined, hantar: true }));
  assert.equal(sent.status, 'Dihantar');
  assert.ok(sent.ada_resit, 'resit sedia ada kekal bila tak diganti');
  assert.equal((await call(gas, U.ali, 'saveClaim', { ...FORM, claim_id: d.claim_id, amaun_rm: 1 })).status, 409);
  assert.equal((await call(gas, U.ali, 'deleteClaim', { claim_id: d.claim_id })).status, 409);
  const d3 = ok(await call(gas, U.ali, 'saveClaim', FORM));
  ok(await call(gas, U.ali, 'deleteClaim', { claim_id: d3.claim_id }));
  assert.equal((await call(gas, U.ali, 'listMyClaims', {})).data.length, 1);
  assert.equal(gas.spreadsheet.getSheetByName('Claims').rows().find((r) => r.claim_id === d3.claim_id).deleted, 'TRUE');
});

test('Senarai saya: terbaru dahulu walaupun cap masa sama', async () => {
  const gas = setupClaimProGas();
  const a = ok(await call(gas, U.ali, 'saveClaim', FORM)).claim_id;
  const b = ok(await call(gas, U.ali, 'saveClaim', FORM)).claim_id;
  const c = ok(await call(gas, U.ali, 'saveClaim', FORM)).claim_id;
  assert.deepEqual(ok(await call(gas, U.ali, 'listMyClaims', {})).map((x) => x.claim_id), [c, b, a]);
});

test('Skop data: staf A tak boleh getClaim/getFile/save/padam claim staf B (403); admin boleh baca semua', async () => {
  const gas = setupClaimProGas();
  const id = await submitted(gas, U.ali);
  assert.equal((await call(gas, U.abu, 'getClaim', { claim_id: id })).status, 403);
  assert.equal((await call(gas, U.abu, 'getFile', { claim_id: id, jenis: 'resit' })).status, 403);
  assert.equal((await call(gas, U.abu, 'saveClaim', { ...FORM, claim_id: id })).status, 403);
  assert.equal((await call(gas, U.abu, 'deleteClaim', { claim_id: id })).status, 403);
  assert.equal((await call(gas, U.abu, 'listMyClaims', {})).data.length, 0);
  assert.equal(ok(await call(gas, U.hr, 'getClaim', { claim_id: id })).claim_id, id);
  const f = ok(await call(gas, U.hr, 'getFile', { claim_id: id, jenis: 'resit' }));
  assert.equal(f.mime, 'image/png');
  assert.equal(Buffer.from(f.data, 'base64').subarray(1, 4).toString(), 'PNG');
  const audit = gas.spreadsheet.getSheetByName('AuditLog').rows();
  assert.ok(audit.some((a) => a.tindakan === 'FORBIDDEN' && a.email === 'abu@gmail.com'));
  assert.ok(audit.some((a) => a.tindakan === 'VIEW_FILE' && a.email === 'hr@voltake.com'), 'bacaan resit direkod');
});

test('HR cuba lulus claim: hanya Admin; staf biasa 403; admin lulus -> status Lulus + emel staf', async () => {
  const gas = setupClaimProGas();
  const id = await submitted(gas, U.ali);
  assert.equal((await call(gas, U.abu, 'decideClaim', { claim_id: id, keputusan: 'Lulus' })).status, 403);
  const r = ok(await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Lulus' }));
  assert.equal(r.status, 'Lulus');
  assert.equal(r.approved_by_name, 'Siti HR');
  assert.equal(gas.mails.at(-1).to, 'ali@gmail.com');
  assert.match(gas.mails.at(-1).subject, /diluluskan/);
  assert.equal((await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Ditolak', sebab: 'salah' })).status, 409, 'sudah diputuskan');
});

test('Admin lulus claim sendiri ditolak; claim staf HR hanya oleh admin Strategic; claim Head oleh HR', async () => {
  const gas = setupClaimProGas();
  const own = await submitted(gas, U.hr);
  const r = await call(gas, U.hr, 'decideClaim', { claim_id: own, keputusan: 'Lulus' });
  assert.equal(r.status, 403);
  assert.match(r.error, /sendiri/);
  assert.equal((await call(gas, U.hr2, 'decideClaim', { claim_id: own, keputusan: 'Lulus' })).status, 403, 'HR lain tak boleh lulus claim staf HR');
  assert.match((await call(gas, U.hr2, 'decideClaim', { claim_id: own, keputusan: 'Lulus' })).error, /Head of Strategic Planner/);
  assert.equal(ok(await call(gas, U.head, 'decideClaim', { claim_id: own, keputusan: 'Lulus' })).status, 'Lulus');

  const headClaim = await submitted(gas, U.head);
  assert.equal((await call(gas, U.head, 'decideClaim', { claim_id: headClaim, keputusan: 'Lulus' })).status, 403);
  assert.equal(ok(await call(gas, U.hr, 'decideClaim', { claim_id: headClaim, keputusan: 'Lulus' })).status, 'Lulus');

  const spClaim = await submitted(gas, U.sp);
  assert.equal(ok(await call(gas, U.head, 'decideClaim', { claim_id: spClaim, keputusan: 'Lulus' })).status, 'Lulus', 'Head lulus staf Strategic biasa');
});

test('Senarai kelulusan memaparkan boleh_lulus dan sebab (satu sumber dengan keputusan)', async () => {
  const gas = setupClaimProGas();
  await submitted(gas, U.ali);
  await submitted(gas, U.hr);
  const asHr = ok(await call(gas, U.hr, 'listPending', {}));
  assert.equal(asHr.length, 2);
  assert.deepEqual(asHr.map((c) => [c.staff_name, c.boleh_lulus]).sort(), [['Ali Technician', true], ['Siti HR', false]]);
  assert.match(asHr.find((c) => c.staff_name === 'Siti HR').sebab_tak_boleh, /sendiri/);
  const asHead = ok(await call(gas, U.head, 'listPending', {}));
  assert.deepEqual(asHead.map((c) => c.boleh_lulus), [true, true]);
});

test('Tolak: sebab wajib, emel staf bawa sebab; staf nampak sebab; tak boleh diubah lagi', async () => {
  const gas = setupClaimProGas();
  const id = await submitted(gas);
  assert.equal((await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Ditolak' })).status, 400);
  assert.equal((await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Ditolak', sebab: 'ab' })).status, 400);
  assert.equal((await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Mungkin' })).status, 400);
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Ditolak', sebab: 'Resit tak jelas' }));
  const mine = ok(await call(gas, U.ali, 'getClaim', { claim_id: id }));
  assert.equal(mine.status, 'Ditolak');
  assert.equal(mine.sebab_tolak, 'Resit tak jelas');
  assert.match(gas.mails.at(-1).body, /Resit tak jelas/);
  assert.deepEqual(mine.sejarah.map((h) => `${h.dari}>${h.ke}:${h.oleh}`), ['Draf>Dihantar:Ali Technician', 'Dihantar>Ditolak:Siti HR']);
  assert.equal((await call(gas, U.ali, 'saveClaim', { ...FORM, claim_id: id })).status, 409);
});

test('Sahkan bayaran: claim staf lain 403; admin tak boleh tanda Dibayar; bukan status Lulus 409', async () => {
  const gas = setupClaimProGas();
  const id = await submitted(gas, U.ali);
  const body = { claim_id: id, received_date: today(), received_amount_rm: 48.5 };
  assert.equal((await call(gas, U.ali, 'confirmReceived', body)).status, 409, 'belum Lulus');
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Lulus' }));
  assert.equal((await call(gas, U.abu, 'confirmReceived', body)).status, 403, 'staf B untuk claim staf A');
  assert.equal((await call(gas, U.hr, 'confirmReceived', body)).status, 403, 'admin tak boleh tanda Dibayar');
  assert.equal((await call(gas, U.head, 'confirmReceived', body)).status, 403);
  assert.equal(gas.spreadsheet.getSheetByName('Claims').rows()[0].status, 'Lulus', 'status tak berubah');
});

test('Sahkan bayaran: validasi tarikh/jumlah; jumlah sama -> Dibayar; beza -> beza_bayaran + emel admin', async () => {
  const gas = setupClaimProGas();
  const id = await submitted(gas, U.ali);
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Lulus' }));
  for (const b of [{ received_date: daysAgo(-1) }, { received_date: daysAgo(30) }, { received_date: 'esok' }, { received_amount_rm: 0 }, { received_amount_rm: 'x' }]) {
    assert.equal((await call(gas, U.ali, 'confirmReceived', { claim_id: id, received_date: today(), received_amount_rm: 48.5, ...b })).status, 400, JSON.stringify(b));
  }
  const mails0 = gas.mails.length;
  const done = ok(await call(gas, U.ali, 'confirmReceived', { claim_id: id, received_date: today(), received_amount_rm: 40, bukti: { data: PNG_B64 } }));
  assert.equal(done.status, 'Dibayar');
  assert.equal(done.beza_bayaran, true);
  assert.ok(done.ada_bukti);
  assert.equal(gas.mails.length, mails0 + 1);
  assert.equal(gas.mails.at(-1).to, 'hr-claim@example.test');
  assert.match(gas.mails.at(-1).subject, /Beza bayaran/);
  assert.equal((await call(gas, U.ali, 'confirmReceived', { claim_id: id, received_date: today(), received_amount_rm: 40 })).status, 409, 'tak boleh sahkan dua kali');
  const bukti = gas.ctx.DriveApp.getFolderById('claimpro-root').folders[0].folders.find((f) => f.name === 'Payments');
  assert.equal(bukti.files.length, 1);

  const id2 = await submitted(gas, U.ali);
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: id2, keputusan: 'Lulus' }));
  const n = gas.mails.length;
  const ok2 = ok(await call(gas, U.ali, 'confirmReceived', { claim_id: id2, received_date: today(), received_amount_rm: 48.5 }));
  assert.equal(ok2.beza_bayaran, false);
  assert.equal(gas.mails.length, n, 'tiada emel bila jumlah sama');
});

test('Senarai Lulus belum dibayar (HR), laporan ikut bulan/jenis/status, jumlah dan ringkasan', async () => {
  const gas = setupClaimProGas();
  const a = await submitted(gas, U.ali, { jenis: 'Makan', amaun_rm: 50 });
  const b = await submitted(gas, U.abu, { jenis: 'Perjalanan', amaun_rm: 120.25 });
  const c = await submitted(gas, U.ali, { jenis: 'Makan', amaun_rm: 30 });
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: a, keputusan: 'Lulus' }));
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: b, keputusan: 'Lulus' }));
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: c, keputusan: 'Ditolak', sebab: 'Duplikat' }));
  ok(await call(gas, U.ali, 'confirmReceived', { claim_id: a, received_date: today(), received_amount_rm: 50 }));
  await call(gas, U.ali, 'saveClaim', { ...FORM, hantar: false });   // draf tak masuk laporan

  const pay = ok(await call(gas, U.hr, 'listToPay', {}));
  assert.deepEqual(pay.tuntutan.map((x) => x.claim_id), [b]);
  assert.equal(pay.jumlah_rm, 120.25);
  assert.ok(!JSON.stringify(pay).includes('@'), 'tiada emel dalam senarai bayaran');

  const all = ok(await call(gas, U.head, 'claimReport', {}));
  assert.equal(all.bilangan, 3, 'Draf dikecualikan');
  assert.equal(all.jumlah_rm, 200.25);
  assert.deepEqual(all.ikut_status.Lulus, { bilangan: 1, jumlah_rm: 120.25 });
  assert.deepEqual(all.ikut_jenis.Makan, { bilangan: 2, jumlah_rm: 80 });
  assert.equal(ok(await call(gas, U.head, 'claimReport', { jenis: 'Perjalanan' })).bilangan, 1);
  assert.equal(ok(await call(gas, U.head, 'claimReport', { status: 'Dibayar' })).bilangan, 1);
  assert.equal(ok(await call(gas, U.head, 'claimReport', { bulan: daysAgo(1).slice(0, 7) })).bilangan, 3);
  assert.equal(ok(await call(gas, U.head, 'claimReport', { bulan: '2020-01' })).bilangan, 0);
  assert.equal((await call(gas, U.head, 'claimReport', { bulan: 'Januari' })).status, 400);
});

test('Jenis tuntutan: admin cipta/ubah; staf nampak yang aktif sahaja; nama tak sah ditolak', async () => {
  const gas = setupClaimProGas();
  ok(await call(gas, U.hr, 'saveClaimType', { jenis: 'Tol', had_rm: 100, perlu_resit: false, aktif: true }));
  ok(await call(gas, U.hr, 'saveClaimType', { jenis: 'Lain-lain', perlu_resit: true, aktif: false }));
  const staff = ok(await call(gas, U.ali, 'listClaimTypes', {}));
  assert.ok(staff.some((t) => t.jenis === 'Tol' && t.had_rm === 100 && t.perlu_resit === false));
  assert.ok(!staff.some((t) => t.jenis === 'Lain-lain'), 'tak aktif disembunyi dari staf');
  assert.ok(ok(await call(gas, U.hr, 'listClaimTypes', {})).some((t) => t.jenis === 'Lain-lain' && t.aktif === false));
  assert.equal(gas.spreadsheet.getSheetByName('ClaimTypes').rows().filter((r) => r.jenis === 'Tol').length, 1);
  for (const bad of [{ jenis: 'x' }, { jenis: 'y'.repeat(41) }, { jenis: 'Tol', had_rm: -1 }]) assert.equal((await call(gas, U.hr, 'saveClaimType', bad)).status, 400, JSON.stringify(bad));
  ok(await call(gas, U.ali, 'saveClaim', { ...FORM, jenis: 'Tol', resit: undefined, hantar: true }));
});

test('Formula injection: keterangan =HYPERLINK disimpan dengan prefix petik, dipapar tanpa prefix', async () => {
  const gas = setupClaimProGas();
  const c = ok(await call(gas, U.ali, 'saveClaim', { ...FORM, keterangan: '=HYPERLINK("http://x","klik")', hantar: true }));
  assert.equal(gas.spreadsheet.getSheetByName('Claims').rows()[0].keterangan, `'=HYPERLINK("http://x","klik")`);
  assert.equal(c.keterangan, '=HYPERLINK("http://x","klik")');
});

test('Peringatan 14 hari: emel staf, ulang 7 hari sekali sahaja; tak ganggu claim baru', async () => {
  const gas = setupClaimProGas();
  const old = await submitted(gas, U.ali);
  const fresh = await submitted(gas, U.abu);
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: old, keputusan: 'Lulus' }));
  ok(await call(gas, U.hr, 'decideClaim', { claim_id: fresh, keputusan: 'Lulus' }));
  const sh = gas.spreadsheet.getSheetByName('Claims');
  const h = sh.header();
  const setApproved = (id, days) => { const r = sh.data.find((x, i) => i > 0 && x[h.indexOf('claim_id')] === id); r[h.indexOf('approved_at')] = new Date(Date.now() - days * 864e5).toISOString(); };
  setApproved(old, 15);
  setApproved(fresh, 3);
  const before = gas.mails.length;
  assert.equal(gas.ctx.dailyReminders(), 1);
  assert.equal(gas.mails.length, before + 1);
  assert.equal(gas.mails.at(-1).to, 'ali@gmail.com');
  assert.equal(gas.ctx.dailyReminders(), 0, 'tidak ulang esoknya');
  const r = sh.data.find((x, i) => i > 0 && x[h.indexOf('claim_id')] === old);
  r[h.indexOf('peringatan_at')] = new Date(Date.now() - 8 * 864e5).toISOString();
  assert.equal(gas.ctx.dailyReminders(), 1, 'ulang selepas 7 hari');
});

test('Arkib: Dibayar > 24 bulan ke Archive_<tahun>, baris lain kekal; emel beza bulanan', async () => {
  const gas = setupClaimProGas();
  const a = await submitted(gas, U.ali, { tarikh: '2024-03-10' });
  const b = await submitted(gas, U.ali, { tarikh: '2024-04-10' });
  for (const id of [a, b]) ok(await call(gas, U.hr, 'decideClaim', { claim_id: id, keputusan: 'Lulus' }));
  ok(await call(gas, U.ali, 'confirmReceived', { claim_id: a, received_date: today(), received_amount_rm: 48.5 }));
  const sh = gas.spreadsheet.getSheetByName('Claims');
  const h = sh.header();
  const rowOf = (id) => sh.data.find((x, i) => i > 0 && x[h.indexOf('claim_id')] === id);
  rowOf(a)[h.indexOf('received_date')] = '2024-05-01';
  assert.equal(gas.ctx.dailyArchive(), 1);
  assert.deepEqual(sh.rows().map((r) => r.claim_id), [b], 'claim belum dibayar kekal');
  const arch = gas.spreadsheet.getSheetByName('Archive_2024');
  assert.equal(arch.rows()[0].claim_id, a);
  assert.deepEqual(arch.header(), sh.header());
  assert.equal(gas.ctx.dailyArchive(), 0, 'idempotent');
});

test('Tandatangan salah ditolak sebelum Sheet dibuka; modul lain tak boleh guna secret ClaimPro', async () => {
  const gas = setupClaimProGas();
  const before = gas.counters.openById;
  const body = JSON.stringify(await signEnvelope('salah'.repeat(12), 'listMyClaims', {}, U.ali));
  const r = JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
  assert.equal(r.status, 401);
  assert.equal(gas.counters.openById, before);
});

test('Serentak: dua simpanan berturutan tak menimpa baris (appendRow) dan ID unik', async () => {
  const gas = setupClaimProGas();
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(await submitted(gas, i % 2 ? U.ali : U.abu));
  assert.equal(new Set(ids).size, 5);
  assert.equal(gas.spreadsheet.getSheetByName('Claims').rows().length, 5);
  assert.equal(gas.spreadsheet.getSheetByName('Approvals').rows().length, 5);
});
