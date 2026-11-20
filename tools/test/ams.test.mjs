// Ujian Fasa 2C: AMS (IPD seksyen 6 + peraturan sistem AMS lama).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupAmsGas, AMS_SECRET, PNG_B64, PDF_B64 } from './helpers.mjs';

const U = {
  admin: { email: 'aset@voltake.com', nama: 'Admin Aset', staff_id: 'VE40', department: 'OMP', roles: ['admin'] },
  aud: { email: 'audit@voltake.com', nama: 'Auditor', staff_id: 'VE41', department: 'OMP', roles: ['auditor'] },
  ali: { email: 'ali@gmail.com', nama: 'Ali Technician', staff_id: 'VE10', department: 'OMP', roles: ['staff'] },
  abu: { email: 'abu@gmail.com', nama: 'Abu Engineer', staff_id: 'VE11', department: 'PSS', roles: ['staff'] },
  view: { email: 'v@voltake.com', nama: 'Viewer', staff_id: 'VE02', department: 'MGMT', roles: ['viewer'] },
  sup: { email: 'boss@voltake.com', nama: 'Superadmin', staff_id: 'VE01', department: 'MGMT', roles: ['superadmin'] },
};
const myt = (offsetDays = 0) => new Date(Date.now() + 8 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);

async function call(gas, user, action, payload) {
  const body = JSON.stringify(await signEnvelope(AMS_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };

const ASSET = { kategori: 'Test Set', make: 'Megger', model: 'MIT525', serial_no: 'SN-001', lokasi_asal: 'HQ', calib_expiry: myt(200), calib_by: 'SIRIM' };
async function addAsset(gas, over = {}) { return ok(await call(gas, U.admin, 'saveAsset', { ...ASSET, ...over })); }

function setCell(gas, tab, keyCol, key, col, value) {
  const sh = gas.spreadsheet.getSheetByName(tab);
  const h = sh.header();
  const row = sh.data.find((r, i) => i > 0 && String(r[h.indexOf(keyCol)]) === String(key));
  row[h.indexOf(col)] = value;
}

test('setupSystem: tab, Settings, folder AMS, trigger Isnin tanpa pendua; tiada tab password', () => {
  const gas = setupAmsGas();
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), ['Assets', 'AuditLog', 'Audits', 'CalibrationLog', 'Movements', 'Settings', '_Counters']);
  gas.ctx.setupSystem();
  assert.deepEqual(gas.triggers.map((t) => [t.handler, t.weekDay, t.hour]), [['weeklyReport', 'MONDAY', 8]]);
  const base = gas.ctx.DriveApp.getFolderById('ams-root').folders.find((f) => f.name === 'AMS');
  assert.deepEqual(base.folders.map((f) => f.name).sort(), ['Audits', 'Certs', 'Photos', 'Returns']);
  assert.ok(!gas.spreadsheet.getSheetByName('ID PASSWORD'));
  assert.deepEqual(gas.spreadsheet.getSheetByName('Settings').rows().map((r) => r.key), ['portal_url', 'admin_notify_emails', 'amaran_kalibrasi_hari', 'sekat_pinjam_luput']);
});

test('Role ikut sistem lama: staf tak boleh tambah/kalibrasi/audit/sahkan; auditor audit sahaja; viewer 403; superadmin = admin', async () => {
  const gas = setupAmsGas();
  const a = await addAsset(gas);
  assert.equal((await call(gas, U.view, 'listAssets', {})).status, 403);
  assert.equal(ok(await call(gas, U.sup, 'listMovements', { skop: 'semua' })).length, 0, 'superadmin = admin aset');
  for (const [act, p] of [['saveAsset', ASSET], ['recalibrate', { asset_no: a.asset_no }], ['disposeAsset', { asset_no: a.asset_no, sebab: 'xxx' }], ['approveReturn', { asset_no: a.asset_no }]]) {
    assert.equal((await call(gas, U.ali, act, p)).status, 403, 'staff ' + act);
    assert.equal((await call(gas, U.aud, act, p)).status, 403, 'auditor ' + act);
  }
  assert.equal((await call(gas, U.ali, 'recordAudit', { asset_no: a.asset_no, keadaan: 'Baik' })).status, 403);
  assert.equal(ok(await call(gas, U.aud, 'recordAudit', { asset_no: a.asset_no, keadaan: 'Baik' })).audit_status, 'Baik');
  assert.equal((await call(gas, U.ali, 'listMovements', { skop: 'semua' })).status, 403);
  assert.equal(ok(await call(gas, U.ali, 'listAssets', {})).aset.length, 1, 'staf nampak senarai aset (sistem lama)');
});

test('Tambah/ubah aset: No berjujukan (No terakhir + 1), siri unik, medan wajib, formula injection, gambar diganti', async () => {
  const gas = setupAmsGas();
  const a1 = await addAsset(gas);
  assert.equal(a1.asset_no, '1');
  assert.equal(a1.status_pinjaman, 'Tersedia');
  assert.equal(a1.lokasi_semasa, 'HQ');
  setCell(gas, 'Assets', 'asset_no', '1', 'asset_no', '105'); // macam data lama
  assert.equal((await addAsset(gas, { serial_no: 'SN-002' })).asset_no, '106');
  const dup = await call(gas, U.admin, 'saveAsset', { ...ASSET, serial_no: 'sn-001' });
  assert.equal(dup.status, 409);
  assert.match(dup.error, /aset 105/);
  await addAsset(gas, { serial_no: 'N/A' });
  await addAsset(gas, { serial_no: 'N/A' });
  for (const k of ['kategori', 'make', 'model', 'serial_no', 'lokasi_asal']) assert.equal((await call(gas, U.admin, 'saveAsset', { ...ASSET, serial_no: 'X' + k, [k]: '' })).status, 400, k);
  assert.equal((await call(gas, U.admin, 'saveAsset', { ...ASSET, serial_no: 'SN-9', calib_expiry: '31/12/2026' })).status, 400);
  const noCal = await addAsset(gas, { serial_no: 'SN-10', calib_expiry: '', model: '=HYPERLINK("http://x")' });
  assert.equal(noCal.calib_status, 'Tiada Data');
  assert.equal(noCal.model, '=HYPERLINK("http://x")');
  assert.equal(gas.spreadsheet.getSheetByName('Assets').rows().find((r) => r.asset_no === noCal.asset_no).model, '\'=HYPERLINK("http://x")');

  const g1 = ok(await call(gas, U.admin, 'saveAsset', { ...ASSET, asset_no: '105', gambar: { data: PNG_B64 }, sijil: { data: PDF_B64 } }));
  assert.ok(g1.ada_gambar && g1.ada_sijil);
  const row = () => gas.spreadsheet.getSheetByName('Assets').rows().find((r) => r.asset_no === '105');
  const [oldPhoto, oldCert] = [row().photo_file_id, row().cert_file_id];
  ok(await call(gas, U.admin, 'saveAsset', { ...ASSET, asset_no: '105', lokasi_asal: 'Stor B', gambar: { data: PNG_B64 }, sijil: { data: PDF_B64 } }));
  assert.equal(row().lokasi_asal, 'Stor B');
  assert.equal(gas.drive.files.get(oldPhoto).trashed, true, 'gambar lama dibuang');
  assert.equal(gas.drive.files.get(oldCert).trashed, false, 'sijil lama disimpan');
  assert.equal((await call(gas, U.admin, 'saveAsset', { ...ASSET, asset_no: '105', gambar: { data: Buffer.from('MZ fake exe file 1234').toString('base64') } })).status, 400, 'fail bukan gambar ditolak');
  const list = ok(await call(gas, U.ali, 'listAssets', {}));
  assert.ok(!JSON.stringify(list).includes('@'), 'tiada emel dalam senarai');
  assert.ok(!JSON.stringify(list).includes('file-'), 'tiada ID fail Drive');
});

test('Status kalibrasi ikut sistem lama: Telah Luput / Lagi Seminggu / Lagi Sebulan / Masih Aktif / Tiada Data', async () => {
  const gas = setupAmsGas();
  const cases = [[-1, 'Telah Luput'], [0, 'Lagi Seminggu'], [7, 'Lagi Seminggu'], [8, 'Lagi Sebulan'], [30, 'Lagi Sebulan'], [31, 'Masih Aktif']];
  for (const [i, [d]] of cases.entries()) await addAsset(gas, { serial_no: 'C' + i, calib_expiry: myt(d) });
  const got = ok(await call(gas, U.ali, 'listAssets', {})).aset.map((a) => a.calib_status);
  assert.deepEqual(got, cases.map((c) => c[1]));
});

test('Kalibrasi semula: sijil wajib, tarikh disemak, Assets + CalibrationLog dikemas kini, sijil lama boleh dibuka semua role', async () => {
  const gas = setupAmsGas();
  const a = await addAsset(gas, { calib_expiry: myt(-3) });
  const base = { asset_no: a.asset_no, tarikh_kalibrasi: myt(0), tarikh_luput: myt(365), calib_by: 'SIRIM Berhad' };
  assert.equal((await call(gas, U.admin, 'recalibrate', base)).status, 400, 'sijil wajib');
  assert.equal((await call(gas, U.admin, 'recalibrate', { ...base, sijil: { data: PDF_B64 }, tarikh_luput: myt(0) })).status, 400);
  assert.equal((await call(gas, U.admin, 'recalibrate', { ...base, sijil: { data: PDF_B64 }, tarikh_kalibrasi: myt(2) })).status, 400);
  const r = ok(await call(gas, U.admin, 'recalibrate', { ...base, sijil: { data: PDF_B64 } }));
  assert.equal(r.calib_status, 'Masih Aktif');
  assert.equal(r.calib_by, 'SIRIM Berhad');
  const d = ok(await call(gas, U.ali, 'getAsset', { asset_no: a.asset_no }));
  assert.equal(d.kalibrasi.length, 1);
  assert.equal(d.kalibrasi[0].tarikh_luput, myt(365));
  const f = ok(await call(gas, U.ali, 'getFile', { asset_no: a.asset_no, jenis: 'sijil_log', log_id: d.kalibrasi[0].log_id }));
  assert.equal(f.mime, 'application/pdf');
  assert.equal(ok(await call(gas, U.ali, 'getFile', { asset_no: a.asset_no, jenis: 'sijil' })).mime, 'application/pdf');
});

test('Audit bulanan: Baik satu tekan; Rosak/Hilang perlukan catatan; sejarah audit hanya admin/auditor', async () => {
  const gas = setupAmsGas();
  const a = await addAsset(gas);
  assert.equal(ok(await call(gas, U.ali, 'listAssets', {})).aset[0].diaudit_bulan_ini, false);
  assert.equal((await call(gas, U.aud, 'recordAudit', { asset_no: a.asset_no, keadaan: 'Rosak' })).status, 400, 'catatan wajib');
  assert.equal((await call(gas, U.aud, 'recordAudit', { asset_no: a.asset_no, keadaan: 'Entah' })).status, 400);
  const r = ok(await call(gas, U.aud, 'recordAudit', { asset_no: a.asset_no, keadaan: 'Rosak', catatan: 'Probe patah', gambar: { data: PNG_B64 } }));
  assert.equal(r.diaudit_bulan_ini, true);
  assert.equal(r.audit_status, 'Rosak');
  ok(await call(gas, U.admin, 'recordAudit', { asset_no: a.asset_no, keadaan: 'Baik' }));
  const rows = gas.spreadsheet.getSheetByName('Audits').rows();
  assert.deepEqual(rows.map((x) => [x.keadaan, x.auditor_nama]), [['Rosak', 'Auditor'], ['Baik', 'Admin Aset']], 'setiap audit disimpan');
  const asAud = ok(await call(gas, U.aud, 'getAsset', { asset_no: a.asset_no }));
  assert.equal(asAud.audit.length, 2);
  assert.equal(ok(await call(gas, U.ali, 'getAsset', { asset_no: a.asset_no })).audit, null);
  assert.equal((await call(gas, U.ali, 'getFile', { asset_no: a.asset_no, jenis: 'audit', audit_id: asAud.audit[1].audit_id })).status, 403);
  assert.equal(ok(await call(gas, U.aud, 'getFile', { asset_no: a.asset_no, jenis: 'audit', audit_id: asAud.audit.find((x) => x.keadaan === 'Rosak').audit_id })).mime, 'image/png');
});

test('Mobiliti: troli beberapa aset, identiti dari sesi, aset dipinjam/luput kalibrasi tak boleh dipinjam', async () => {
  const gas = setupAmsGas();
  const a = await addAsset(gas);
  const b = await addAsset(gas, { serial_no: 'SN-B' });
  const exp = await addAsset(gas, { serial_no: 'SN-X', calib_expiry: myt(-1) });
  const noCal = await addAsset(gas, { serial_no: 'SN-N', calib_expiry: '' });
  const P = { nama_projek: 'Penyelenggaraan RTU', lokasi: 'Site Cyberjaya', tempoh_hari: 3, keadaan_pinjam: 'Baik' };
  assert.equal((await call(gas, U.ali, 'checkout', { ...P, assets: [] })).status, 400);
  assert.equal((await call(gas, U.ali, 'checkout', { ...P, assets: [a.asset_no], tempoh_hari: 0 })).status, 400);
  assert.equal((await call(gas, U.ali, 'checkout', { ...P, assets: [a.asset_no], keadaan_pinjam: 'Ada kerosakan sedikit' })).status, 400, 'catatan wajib bila ada kerosakan');
  assert.equal((await call(gas, U.ali, 'checkout', { ...P, assets: [a.asset_no, a.asset_no] })).status, 400);
  const out = ok(await call(gas, U.ali, 'checkout', { ...P, assets: [a.asset_no, b.asset_no, noCal.asset_no], peminjam_email: 'boss@voltake.com' }));
  assert.equal(out.length, 3);
  assert.equal(new Set(out.map((m) => m.kumpulan)).size, 1, 'satu kumpulan');
  const m0 = gas.spreadsheet.getSheetByName('Movements').rows()[0];
  assert.equal(m0.peminjam_email, 'ali@gmail.com', 'emel dari sesi');
  assert.equal(m0.peminjam_nama, 'Ali Technician');
  const list = ok(await call(gas, U.ali, 'listAssets', {})).aset;
  const A = list.find((x) => x.asset_no === a.asset_no);
  assert.deepEqual([A.status_pinjaman, A.pemegang_nama, A.pemegang_saya, A.lokasi], ['Dipinjam', 'Ali Technician', true, 'SITE CYBERJAYA']);
  assert.equal(ok(await call(gas, U.abu, 'listAssets', {})).aset.find((x) => x.asset_no === a.asset_no).pemegang_saya, false);
  const again = await call(gas, U.abu, 'checkout', { ...P, assets: [a.asset_no] });
  assert.equal(again.status, 409);
  assert.match(again.error, /sedang dipinjam/);
  const ex = await call(gas, U.abu, 'checkout', { ...P, assets: [exp.asset_no] });
  assert.equal(ex.status, 409);
  assert.match(ex.error, /kalibrasi dah luput/);
  assert.equal(list.find((x) => x.asset_no === exp.asset_no).boleh_pinjam, false);
  setCell(gas, 'Settings', 'key', 'sekat_pinjam_luput', 'value', 'FALSE');
  ok(await call(gas, U.abu, 'checkout', { ...P, assets: [exp.asset_no] }));
});

test('Pulang: hanya peminjam; Rosak wajib catatan + gambar; Menunggu pengesahan + emel admin; admin sahkan -> Tersedia di lokasi baharu', async () => {
  const gas = setupAmsGas();
  const a = await addAsset(gas);
  const [m] = ok(await call(gas, U.ali, 'checkout', { assets: [a.asset_no], nama_projek: 'Projek A', lokasi: 'Site A', tempoh_hari: 2, keadaan_pinjam: 'Baik' }));
  const R = { movement_id: m.movement_id, tarikh_pulang: myt(0), keadaan_pulang: 'Baik' };
  assert.equal((await call(gas, U.abu, 'returnAsset', R)).status, 403, 'bukan peminjam');
  assert.equal((await call(gas, U.ali, 'returnAsset', { ...R, keadaan_pulang: 'Rosak', catatan: 'Kabel putus' })).status, 400, 'gambar wajib');
  assert.equal((await call(gas, U.ali, 'returnAsset', { ...R, keadaan_pulang: 'Rosak', gambar: { data: PNG_B64 } })).status, 400, 'catatan wajib');
  assert.equal((await call(gas, U.ali, 'returnAsset', { ...R, tarikh_pulang: myt(1) })).status, 400, 'masa depan');
  const r = ok(await call(gas, U.ali, 'returnAsset', { ...R, keadaan_pulang: 'Rosak', catatan: 'Kabel putus', gambar: { data: PNG_B64 } }));
  assert.equal(r.status, 'Menunggu pengesahan');
  assert.equal(gas.mails.at(-1).to, 'aset@example.test');
  assert.match(gas.mails.at(-1).subject, /menunggu pengesahan/);
  assert.ok(!gas.mails.at(-1).body.includes('ali@gmail.com'));
  assert.equal((await call(gas, U.ali, 'returnAsset', R)).status, 409, 'tak boleh pulang dua kali');
  assert.equal(ok(await call(gas, U.ali, 'listAssets', {})).aset[0].status_pinjaman, 'Menunggu pengesahan');
  assert.equal(ok(await call(gas, U.ali, 'getFile', { jenis: 'pulang', movement_id: m.movement_id })).mime, 'image/png');
  assert.equal((await call(gas, U.abu, 'getFile', { jenis: 'pulang', movement_id: m.movement_id })).status, 403);

  const pending = ok(await call(gas, U.admin, 'listMovements', { skop: 'menunggu' }));
  assert.equal(pending.length, 1);
  assert.equal(pending[0].aset.make, 'Megger');
  assert.equal((await call(gas, U.admin, 'approveReturn', { movement_id: m.movement_id, keadaan_akhir: 'Rosak' })).status, 400, 'lokasi wajib');
  const done = ok(await call(gas, U.admin, 'approveReturn', { movement_id: m.movement_id, keadaan_akhir: 'Rosak', lokasi_akhir: 'Lab A, Almari 2' }));
  assert.equal(done.status, 'Selesai');
  assert.equal(done.approved_by_name, 'Admin Aset');
  const A = ok(await call(gas, U.ali, 'listAssets', {})).aset[0];
  assert.deepEqual([A.status_pinjaman, A.lokasi_semasa, A.pemegang_nama], ['Tersedia', 'Lab A, Almari 2', '']);
  assert.equal((await call(gas, U.admin, 'approveReturn', { movement_id: m.movement_id, keadaan_akhir: 'Baik', lokasi_akhir: 'HQ' })).status, 409);
  const mine = ok(await call(gas, U.ali, 'listMovements', { skop: 'saya' }));
  assert.equal(mine[0].keadaan_akhir, 'Rosak');
  assert.equal(ok(await call(gas, U.abu, 'listMovements', { skop: 'saya' })).length, 0);
});

test('Admin terima terus: aset masih Dipinjam, dan pinjaman dari sistem lama (tiada rekod Movements)', async () => {
  const gas = setupAmsGas();
  const a = await addAsset(gas);
  ok(await call(gas, U.ali, 'checkout', { assets: [a.asset_no], nama_projek: 'P', lokasi: 'Site', tempoh_hari: 1, keadaan_pinjam: 'Baik' }));
  const r = ok(await call(gas, U.admin, 'approveReturn', { asset_no: a.asset_no, keadaan_akhir: 'Baik', lokasi_akhir: 'HQ' }));
  assert.equal(r.status, 'Selesai');
  assert.match(r.catatan_pulang, /Diterima terus/);
  assert.equal((await call(gas, U.admin, 'approveReturn', { asset_no: a.asset_no, keadaan_akhir: 'Baik', lokasi_akhir: 'HQ' })).status, 409, 'dah Tersedia');
  // pinjaman lama: Assets Dipinjam tanpa Movements
  const b = await addAsset(gas, { serial_no: 'OLD' });
  setCell(gas, 'Assets', 'asset_no', b.asset_no, 'status_pinjaman', 'Dipinjam');
  setCell(gas, 'Assets', 'asset_no', b.asset_no, 'pemegang_nama', 'Ahmad (lama)');
  const old = ok(await call(gas, U.admin, 'approveReturn', { asset_no: b.asset_no, keadaan_akhir: 'Baik', lokasi_akhir: 'HQ' }));
  assert.equal(old.peminjam_nama, 'Ahmad (lama)');
  assert.equal(old.nama_projek, '(rekod sistem lama)');
  assert.equal(ok(await call(gas, U.ali, 'getAsset', { asset_no: b.asset_no })).status_pinjaman, 'Tersedia');
});

test('Lupus aset: sebab wajib, tak boleh bila dipinjam, hilang dari senarai', async () => {
  const gas = setupAmsGas();
  const a = await addAsset(gas);
  ok(await call(gas, U.ali, 'checkout', { assets: [a.asset_no], nama_projek: 'P', lokasi: 'Site', tempoh_hari: 1, keadaan_pinjam: 'Baik' }));
  assert.equal((await call(gas, U.admin, 'disposeAsset', { asset_no: a.asset_no, sebab: 'Rosak teruk' })).status, 409);
  ok(await call(gas, U.admin, 'approveReturn', { asset_no: a.asset_no, keadaan_akhir: 'Rosak', lokasi_akhir: 'HQ' }));
  assert.equal((await call(gas, U.admin, 'disposeAsset', { asset_no: a.asset_no })).status, 400);
  ok(await call(gas, U.admin, 'disposeAsset', { asset_no: a.asset_no, sebab: 'Rosak teruk, dilupus' }));
  assert.equal(ok(await call(gas, U.ali, 'listAssets', {})).aset.length, 0);
  assert.equal((await call(gas, U.ali, 'getAsset', { asset_no: a.asset_no })).status, 404);
  assert.match(gas.spreadsheet.getSheetByName('Assets').rows()[0].deleted_reason, /Dilupus: Rosak teruk/);
});

test('Import MASTERLIST lama: lajur dipetakan, tarikh dd/mm/yyyy, pautan Drive jadi ID, Dipinjam dibawa, ulang = dilangkau', () => {
  const gas = setupAmsGas();
  const imp = gas.spreadsheet.insertSheet('IMPORT_MASTERLIST');
  const id1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  imp.data = [
    ['No', 'Category', 'Make', 'Model', 'Serial No', 'Location Origin', 'Expired Date', 'Cert', 'Calibration By', 'Test Set Picture', 'Current Location', 'Current Holder', 'Last Audit Date', 'Audit Status', 'Remark', 'Audit Picture', 'Status Pinjaman'],
    [1, 'Test Set', 'Fluke', '1587', 'FL-1', 'HQ', '15/03/2027', `https://drive.google.com/file/d/${id1}/view?usp=drivesdk`, 'SIRIM', '', 'HQ', '', '05/11/2026', 'Baik', '', '', 'Tersedia'],
    [2, 'Test Set', 'Megger', 'MIT', 'MG-2', 'HQ', 'N/A', '', '', `https://drive.google.com/open?id=${id1}`, 'Site Cyberjaya (Projek X)', 'Ahmad', '', '', '', '', 'Dipinjam'],
    [3, 'Tool', 'Hioki', 'IR', 'N/A', 'Stor', 'esok', '', '', '', '', '', '', 'Entah', '=cmd', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];
  const r1 = gas.ctx.importMasterlist();
  assert.equal(r1.ditambah, 3);
  assert.ok(r1.amaran.some((w) => /esok/.test(w)));
  const rows = gas.spreadsheet.getSheetByName('Assets').rows();
  assert.deepEqual(rows.map((r) => String(r.asset_no)), ['1', '2', '3']);
  assert.equal(rows[0].calib_expiry, '2027-03-15');
  assert.equal(rows[0].cert_file_id, id1);
  assert.equal(rows[0].last_audit_date, '2026-11-05');
  assert.equal(rows[1].photo_file_id, id1);
  assert.equal(rows[1].status_pinjaman, 'Dipinjam');
  assert.equal(rows[1].pemegang_nama, 'Ahmad');
  assert.equal(rows[1].calib_expiry, '');
  assert.equal(rows[2].audit_status, '', 'status audit tak sah dibuang');
  assert.equal(rows[2].audit_remark, "'=cmd", 'formula disanitasi');
  assert.equal(gas.ctx.importMasterlist().ditambah, 0, 'dijalankan semula: dilangkau');

  const cal = gas.spreadsheet.insertSheet('IMPORT_CALIBRATION');
  cal.data = [['Category', 'Make', 'Model', 'Serial No', 'Date Calibrate', 'Calibration By'], ['Test Set', 'Fluke', '1587', 'FL-1', '15/03/2026', 'SIRIM'], ['X', 'Y', 'Z', 'TIADA-SN', '01/01/2026', 'A']];
  const c1 = gas.ctx.importCalibrationLog();
  assert.equal(c1.ditambah, 1);
  assert.equal(c1.tiada_padanan.length, 1);
  assert.equal(gas.ctx.importCalibrationLog().ditambah, 0);
  assert.equal(gas.spreadsheet.getSheetByName('CalibrationLog').rows()[0].tarikh_kalibrasi, '2026-03-15');
});

test('Laporan Isnin: kalibrasi luput/hampir, pemulangan menunggu, pinjaman lewat; peringatan peminjam sekali seminggu', async () => {
  const gas = setupAmsGas();
  await addAsset(gas, { serial_no: 'E1', calib_expiry: myt(-2) });
  await addAsset(gas, { serial_no: 'E2', calib_expiry: myt(10) });
  const c = await addAsset(gas, { serial_no: 'E3' });
  const [m] = ok(await call(gas, U.ali, 'checkout', { assets: [c.asset_no], nama_projek: 'Projek Z', lokasi: 'Site', tempoh_hari: 2, keadaan_pinjam: 'Baik' }));
  setCell(gas, 'Movements', 'movement_id', m.movement_id, 'tarikh_pinjam', new Date(Date.now() - 5 * 864e5).toISOString());
  gas.mails.length = 0;
  assert.ok(gas.ctx.weeklyReport() >= 3);
  const toAli = gas.mails.filter((x) => x.to === 'ali@gmail.com');
  assert.equal(toAli.length, 1);
  assert.match(toAli[0].subject, /pulangkan aset/);
  const rep = gas.mails.find((x) => x.to === 'aset@example.test');
  assert.match(rep.body, /TELAH LUPUT \(1\)/);
  assert.match(rep.body, /luput dalam 30 hari \(1\)/);
  assert.match(rep.body, /melebihi tempoh \(1\)/);
  assert.ok(!rep.body.includes('ali@gmail.com'));
  gas.mails.length = 0;
  gas.ctx.weeklyReport();
  assert.equal(gas.mails.filter((x) => x.to === 'ali@gmail.com').length, 0, 'peringatan tak berulang dalam 7 hari');
  assert.equal(ok(await call(gas, U.admin, 'listMovements', { skop: 'aktif' }))[0].lewat, true);
});

test('Tandatangan salah ditolak sebelum baca Sheet', async () => {
  const gas = setupAmsGas();
  const env = await signEnvelope('x'.repeat(48), 'listAssets', {}, U.admin);
  const r = JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify(env) } }).getContent());
  assert.equal(r.status, 401);
});
