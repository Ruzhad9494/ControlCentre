// Ujian Fasa 2D: Compliance Track (IPD seksyen 6 + peraturan sistem lama "UniTrack").
import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupComplianceGas, COMPLIANCE_SECRET, PNG_B64, PDF_B64 } from './helpers.mjs';

const U = {
  hr: { email: 'hr@voltake.com', nama: 'Siti HR', staff_id: 'VES020', department: 'HR', roles: ['hr_admin'] },
  pss: { email: 'pss@voltake.com', nama: 'Chong PSS', staff_id: 'VES030', department: 'PSS', roles: ['pss', 'staff_self'] },
  ali: { email: 'ali@gmail.com', nama: 'Ali Technician', staff_id: 'VES007', department: 'OMP', roles: ['staff_self'] },
  abu: { email: 'abu@gmail.com', nama: 'Abu Engineer', staff_id: 'VES008', department: 'PSS', roles: ['staff_self'] },
  noid: { email: 'baru@gmail.com', nama: 'Staf Baru', staff_id: '', department: 'OMP', roles: ['staff_self'] },
  view: { email: 'v@voltake.com', nama: 'Viewer', staff_id: 'VE02', department: 'MGMT', roles: ['viewer'] },
};
const myt = (d = 0) => new Date(Date.now() + 8 * 3600e3 + d * 864e5).toISOString().slice(0, 10);

async function call(gas, user, action, payload) {
  const body = JSON.stringify(await signEnvelope(COMPLIANCE_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const IC = { setuju: true, versi: 'v1-2026-11', ic_no: '900101075123', depan: { data: PNG_B64 }, belakang: { data: PNG_B64 } };

test('setupSystem: tab, Settings, folder Compliance (termasuk IC), trigger Isnin', () => {
  const gas = setupComplianceGas();
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), ['AuditLog', 'Chargeman', 'JobLog', 'Settings', 'Staff', 'StaffCerts', 'Vehicles', '_Counters']);
  gas.ctx.setupSystem();
  assert.deepEqual(gas.triggers.map((t) => [t.handler, t.weekDay, t.hour]), [['weeklyReport', 'MONDAY', 8]]);
  const base = gas.ctx.DriveApp.getFolderById('comp-root').folders.find((f) => f.name === 'Compliance');
  assert.deepEqual(base.folders.map((f) => f.name).sort(), ['Chargeman', 'IC', 'StaffCerts', 'Vehicles']);
  assert.equal(gas.spreadsheet.getSheetByName('Settings').rows().find((r) => r.key === 'amaran_hari').value, '60', 'lalai sistem lama 60 hari');
});

test('Role: staff_self tak boleh buka dashboard / ubah rekod / Senarai Kerja; hr_admin & pss boleh', async () => {
  const gas = setupComplianceGas();
  for (const a of ['dashboard', 'saveVehicle', 'saveChargeman', 'saveStaff', 'saveStaffCert', 'deleteRecord', 'senaraiData', 'logJob', 'listJobs', 'getStaff']) {
    assert.equal((await call(gas, U.ali, a, {})).status, 403, a);
  }
  assert.equal((await call(gas, U.view, 'mySummary', {})).status, 403);
  assert.equal(ok(await call(gas, U.hr, 'dashboard', {})).amaran_hari, 60);
  assert.equal(ok(await call(gas, U.pss, 'dashboard', {})).staf.length, 0);
});

test('Kenderaan: kereta & motosikal, plat unik (dinormalkan), tarikh wajib, status tamat / hampir tamat / sah', async () => {
  const gas = setupComplianceGas();
  const V = { jenis: 'Kereta', plate_no: 'vaa 1234', lokasi: 'HQ', keadaan: 'Baik', roadtax_expiry: myt(-1) };
  const v = ok(await call(gas, U.hr, 'saveVehicle', V));
  assert.equal(v.plate_no, 'VAA 1234');
  assert.equal(v.status, 'expired');
  assert.equal((await call(gas, U.pss, 'saveVehicle', { ...V, plate_no: 'VAA  1234' })).status, 409);
  assert.equal((await call(gas, U.hr, 'saveVehicle', { ...V, plate_no: 'X1', roadtax_expiry: '' })).status, 400);
  assert.equal((await call(gas, U.hr, 'saveVehicle', { ...V, plate_no: 'X1', jenis: 'Lori' })).status, 400);
  ok(await call(gas, U.hr, 'saveVehicle', { ...V, jenis: 'Motosikal', plate_no: 'PKA 77', roadtax_expiry: myt(60), dokumen: { data: PDF_B64 } }));
  ok(await call(gas, U.hr, 'saveVehicle', { ...V, plate_no: 'WXY 9', roadtax_expiry: myt(61) }));
  const d = ok(await call(gas, U.hr, 'dashboard', {}));
  assert.deepEqual(d.kenderaan.map((x) => [x.plate_no, x.status]), [['VAA 1234', 'expired'], ['WXY 9', 'active'], ['PKA 77', 'expiring']]);
  const e = ok(await call(gas, U.hr, 'saveVehicle', { ...V, vehicle_id: v.vehicle_id, keadaan: 'Servis', roadtax_expiry: myt(300) }));
  assert.equal(e.keadaan, 'Servis');
  assert.equal(e.status, 'active');
  assert.equal(ok(await call(gas, U.hr, 'getFile', { jenis: 'kenderaan', id: d.kenderaan[2].vehicle_id })).mime, 'application/pdf');
  assert.equal((await call(gas, U.ali, 'getFile', { jenis: 'kenderaan', id: d.kenderaan[2].vehicle_id })).status, 403);
  assert.equal((await call(gas, U.hr, 'deleteRecord', { jenis: 'kenderaan', id: v.vehicle_id })).status, 400, 'sebab wajib');
  ok(await call(gas, U.hr, 'deleteRecord', { jenis: 'kenderaan', id: v.vehicle_id, sebab: 'Kereta dijual' }));
  assert.equal(ok(await call(gas, U.hr, 'dashboard', {})).kenderaan.length, 2);
});

test('Staf kemas kini sijil SENDIRI sahaja: identiti dari sesi, bukan Staff ID dalam input (lubang sistem lama ditutup)', async () => {
  const gas = setupComplianceGas();
  assert.equal((await call(gas, U.ali, 'saveMyCert', { jenis: 'CIDB' })).status, 400, 'tarikh atau fail wajib');
  assert.equal((await call(gas, U.ali, 'saveMyCert', { jenis: 'IC', expiry_date: myt(10) })).status, 400);
  const r = ok(await call(gas, U.ali, 'saveMyCert', { jenis: 'CIDB', expiry_date: myt(400), fail: { data: PDF_B64 }, staff_id: 'VES008' }));
  assert.equal(r.staff_id, 'VES007');
  assert.equal(r.sijil.CIDB.status, 'active');
  assert.ok(r.sijil.CIDB.ada_fail);
  const row = gas.spreadsheet.getSheetByName('StaffCerts').rows()[0];
  assert.equal(row.staff_id, 'VES007', 'staff_id dari sesi walaupun input VES008');
  const staff = gas.spreadsheet.getSheetByName('Staff').rows()[0];
  assert.deepEqual([staff.staff_id, staff.staff_email, staff.nama], ['VES007', 'ali@gmail.com', 'Ali Technician'], 'profil dicipta dari sesi');
  // tarikh kosong tak timpa tarikh sedia ada (sistem lama)
  const r2 = ok(await call(gas, U.ali, 'saveMyCert', { jenis: 'CIDB', expiry_date: '', fail: { data: PNG_B64 } }));
  assert.equal(r2.sijil.CIDB.expiry, myt(400));
  assert.equal(gas.drive.files.get(row.cert_file_id).trashed, true, 'fail sijil lama diganti');
  // staf lain tak boleh baca sijil Ali
  assert.equal(ok(await call(gas, U.ali, 'getFile', { jenis: 'sijil', sijil: 'CIDB' })).mime, 'image/png');
  assert.equal((await call(gas, U.abu, 'getFile', { jenis: 'sijil', sijil: 'CIDB', staff_id: 'VES007' })).status, 403);
  assert.equal(ok(await call(gas, U.hr, 'getFile', { jenis: 'sijil', sijil: 'CIDB', staff_id: 'VES007' })).mime, 'image/png');
  // staf tanpa Staff ID dalam portal
  assert.equal((await call(gas, U.noid, 'saveMyCert', { jenis: 'CIDB', expiry_date: myt(10) })).status, 409);
  assert.equal(ok(await call(gas, U.noid, 'mySummary', {})).boleh_kemas_kini, false);
});

test('IC: staf hantar sekali dengan persetujuan; tak boleh ubah sendiri; tak boleh baca semula; admin baca direkod VIEW_IC', async () => {
  const gas = setupComplianceGas();
  assert.equal((await call(gas, U.ali, 'submitMyIc', { ...IC, setuju: false })).status, 400);
  assert.equal((await call(gas, U.ali, 'submitMyIc', { ...IC, versi: 'lama' })).status, 400);
  assert.equal((await call(gas, U.ali, 'submitMyIc', { ...IC, belakang: undefined })).status, 400);
  assert.equal((await call(gas, U.ali, 'submitMyIc', { ...IC, ic_no: '12ab' })).status, 400);
  const r = ok(await call(gas, U.ali, 'submitMyIc', IC));
  assert.equal(r.ic_lengkap, true);
  assert.equal(r.ic_no_tersembunyi, '******-**-5123');
  assert.ok(!JSON.stringify(r).includes('900101'), 'no. IC penuh tak dihantar balik');
  const s = gas.spreadsheet.getSheetByName('Staff').rows()[0];
  assert.equal(s.ic_no, '900101-07-5123');
  assert.equal(s.ic_consent_version, 'v1-2026-11');
  assert.ok(s.ic_consent_at);
  assert.equal((await call(gas, U.ali, 'submitMyIc', IC)).status, 409, 'sekali sahaja');
  assert.equal((await call(gas, U.ali, 'getFile', { jenis: 'ic_depan', staff_id: 'VES007' })).status, 403, 'staf tak boleh baca IC (termasuk sendiri)');
  assert.equal(ok(await call(gas, U.hr, 'getFile', { jenis: 'ic_belakang', staff_id: 'VES007' })).mime, 'image/png');
  const st = ok(await call(gas, U.hr, 'getStaff', { staff_id: 'ves007' }));
  assert.equal(st.ic_no, '900101-07-5123');
  const dash = ok(await call(gas, U.hr, 'dashboard', {}));
  assert.ok(!JSON.stringify(dash).includes('900101'), 'no. IC tiada dalam dashboard');
  const audit = gas.spreadsheet.getSheetByName('AuditLog').rows().filter((a) => a.tindakan === 'VIEW_IC');
  assert.equal(audit.length, 2);
  const folderIc = gas.ctx.DriveApp.getFolderById('comp-root').folders[0].folders.find((f) => f.name === 'IC');
  assert.equal(folderIc.files.length, 2, 'IC disimpan dalam folder IC');
});

test('Admin urus staf: tambah, ubah designation & IC, sijil (boleh kosongkan tarikh), padam lembut', async () => {
  const gas = setupComplianceGas();
  assert.equal((await call(gas, U.hr, 'saveStaff', { staff_id: 'bad id!', nama: 'X' })).status, 400);
  const s = ok(await call(gas, U.hr, 'saveStaff', { staff_id: 'ves010', nama: 'Rahim', designation: 'Technician', ic_no: '880202-02-1111', baru: true }));
  assert.equal(s.staff_id, 'VES010');
  assert.equal((await call(gas, U.hr, 'saveStaff', { staff_id: 'VES010', nama: 'Rahim', baru: true })).status, 409);
  assert.equal((await call(gas, U.hr, 'saveStaffCert', { staff_id: 'VES999', jenis: 'CIDB', expiry_date: myt(5) })).status, 404);
  let g = ok(await call(gas, U.pss, 'saveStaffCert', { staff_id: 'VES010', jenis: 'NIOSH', expiry_date: myt(5), no_sijil: 'NT-1' }));
  assert.equal(g.sijil.NIOSH.status, 'expiring');
  assert.equal(g.sijil.NIOSH.no_sijil, 'NT-1');
  g = ok(await call(gas, U.pss, 'saveStaffCert', { staff_id: 'VES010', jenis: 'NIOSH', expiry_date: '' }));
  assert.equal(g.sijil.NIOSH.status, 'unknown', 'admin boleh kosongkan tarikh');
  ok(await call(gas, U.hr, 'saveStaff', { staff_id: 'VES010', nama: 'Rahim', ic_depan: { data: PNG_B64 }, ic_belakang: { data: PNG_B64 } }));
  const row = () => gas.spreadsheet.getSheetByName('Staff').rows().find((r) => r.staff_id === 'VES010');
  const oldFront = row().ic_front_file_id;
  ok(await call(gas, U.hr, 'saveStaff', { staff_id: 'VES010', nama: 'Rahim', ic_depan: { data: PNG_B64 } }));
  assert.equal(gas.drive.files.get(oldFront).trashed, true);
  assert.equal(row().designation, 'Technician', 'medan yang tak dihantar tak diubah');
  ok(await call(gas, U.hr, 'deleteRecord', { jenis: 'staf', id: 'VES010', sebab: 'Berhenti kerja' }));
  assert.equal(ok(await call(gas, U.hr, 'dashboard', {})).staf.length, 0);
});

test('Chargeman: ikut solar farm, padanan Staff ID, chargeman sendiri boleh lihat dokumen sendiri', async () => {
  const gas = setupComplianceGas();
  const C = { nama: 'Ali Technician', solar_farm: 'LSS4 Bukit Kayu Hitam', competency_no: 'CM-1', expiry_date: myt(20), staff_id: 'VES007', dokumen: { data: PDF_B64 } };
  const c = ok(await call(gas, U.hr, 'saveChargeman', C));
  assert.equal(c.status, 'expiring');
  assert.equal((await call(gas, U.hr, 'saveChargeman', { ...C, dokumen: undefined })).status, 409, 'no. kompetensi berulang di farm sama');
  ok(await call(gas, U.hr, 'saveChargeman', { ...C, solar_farm: 'LSS Kuala Ketil', dokumen: undefined }));
  const me = ok(await call(gas, U.ali, 'mySummary', {}));
  assert.equal(me.chargeman.length, 2);
  assert.equal(ok(await call(gas, U.ali, 'getFile', { jenis: 'chargeman', id: c.chargeman_id })).mime, 'application/pdf');
  assert.equal((await call(gas, U.abu, 'getFile', { jenis: 'chargeman', id: c.chargeman_id })).status, 403);
});

test('Senarai Kerja: data staf + IC untuk admin sahaja, dilog (Job_Log), tajuk ikut format lama', async () => {
  const gas = setupComplianceGas();
  ok(await call(gas, U.ali, 'saveMyCert', { jenis: 'CIDB', expiry_date: myt(100) }));
  ok(await call(gas, U.ali, 'submitMyIc', IC));
  ok(await call(gas, U.hr, 'saveStaff', { staff_id: 'VES010', nama: 'Rahim', designation: 'Technician', baru: true }));
  assert.equal((await call(gas, U.hr, 'senaraiData', { staff_ids: [] })).status, 400);
  assert.equal((await call(gas, U.hr, 'senaraiData', { staff_ids: ['VES999'] })).status, 404);
  const d = ok(await call(gas, U.hr, 'senaraiData', { staff_ids: ['VES007', 'ves010'] }));
  assert.equal(d.syarikat.nama, 'VOLTAKE ENERGY SERVICES SDN BHD');
  assert.deepEqual(d.staf.map((s) => [s.staff_id, s.ic_no, s.ic_depan, s.sijil.CIDB.status]), [['VES007', '900101-07-5123', true, 'active'], ['VES010', '', false, 'unknown']]);
  assert.equal((await call(gas, U.hr, 'logJob', { kerja: 'PM', tempat: '', tarikh: myt(1), staff_ids: ['VES007'] })).status, 400);
  const j = ok(await call(gas, U.pss, 'logJob', { kerja: 'Preventive Maintenance', tempat: 'LSS4 Bukit Kayu Hitam', tarikh: myt(1), staff_ids: ['VES007', 'VES010'], sijil: ['CIDB', 'NIOSH', 'CM', 'X'] }));
  assert.equal(j.tajuk, 'DETAILS OF WORKING PERSONNEL FOR PREVENTIVE MAINTENANCE WORKS AT LSS4 BUKIT KAYU HITAM');
  const jobs = ok(await call(gas, U.hr, 'listJobs', {}));
  assert.deepEqual([jobs[0].bil_orang, jobs[0].staff_ids, jobs[0].sijil, jobs[0].dibuat_oleh_nama], [2, 'VES007, VES010', 'CIDB,NIOSH,CM', 'Chong PSS']);
});

test('Import sistem lama: Kereta/Motosikal/Chargeman/Cert (lebar -> panjang), header bukan baris 1, ulang = dilangkau', () => {
  const gas = setupComplianceGas();
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  const put = (name, data) => { gas.spreadsheet.insertSheet(name).data = data; };
  put('IMPORT_KERETA', [['ROADTAX KERETA'], ['No', 'Plate No.', 'Location', 'Condition', 'Expired Date', 'Document'], [1, 'vaa 1234', 'HQ', 'Baik', '25/12/2026', `https://drive.google.com/file/d/${id}/view`], [2, 'WXY 9', 'Site', 'Servis', 'tiada', '']]);
  put('IMPORT_MOTOSIKAL', [['No', 'Plate No.', 'Location', 'Condition', 'Expired Date', 'Document'], [1, 'PKA 77', 'HQ', 'Baik', '01/02/2027', '']]);
  put('IMPORT_CHARGEMAN', [['No', 'Solar Farm', 'Chargeman Name', 'Competency No.', 'Expiry Date', 'Document', 'ID'], [1, 'LSS4', 'Ali', 'CM-1', '10/10/2027', '', 'ves007']]);
  put('IMPORT_CERT', [['ID', 'NAME', 'CIDB', 'CIDB Cert', 'NIOSH', 'Niosh Cert', 'Working at Height', 'WaH Cert', 'First Aid', 'First Aid Cert', 'IC', 'IC Attachment', 'Designation'],
    ['VES007', 'Ali', '15/03/2027', `https://drive.google.com/open?id=${id}`, '', '', '01/01/2026', '', '', '', '900101075123', `https://drive.google.com/file/d/${id}/view`, 'Technician'],
    ['VES008', 'Abu', '', '', 'salah', '', '', '', '', '', '12', '', '']]);
  const r = gas.ctx.importOldData();
  assert.deepEqual([...r.ditambah], ['Kereta: 2', 'Motosikal: 1', 'Chargeman: 1', 'Staf: 2, sijil: 3']);
  assert.ok(r.amaran.some((w) => /WXY 9/.test(w)));
  assert.ok(r.amaran.some((w) => /VES008: no. IC/.test(w)));
  const v = gas.spreadsheet.getSheetByName('Vehicles').rows();
  assert.deepEqual([v[0].plate_no, v[0].roadtax_expiry, v[0].doc_file_id, v[2].jenis], ['VAA 1234', '2026-12-25', id, 'Motosikal']);
  assert.equal(gas.spreadsheet.getSheetByName('Chargeman').rows()[0].staff_id, 'VES007');
  const st = gas.spreadsheet.getSheetByName('Staff').rows();
  assert.deepEqual([st[0].ic_no, st[0].ic_front_file_id, st[0].designation, st[1].ic_no], ['900101-07-5123', id, 'Technician', '']);
  const certs = gas.spreadsheet.getSheetByName('StaffCerts').rows();
  assert.deepEqual(certs.map((c) => [c.staff_id, c.jenis, c.expiry_date, c.cert_file_id]), [['VES007', 'CIDB', '2027-03-15', id], ['VES007', 'WAH', '2026-01-01', ''], ['VES008', 'NIOSH', '', '']]);
  assert.deepEqual([...gas.ctx.importOldData().ditambah], ['Kereta: 0', 'Motosikal: 0', 'Chargeman: 0', 'Staf: 0, sijil: 0']);
});

test('Laporan Isnin: dikumpul 30/60/90 hari; staf diemel untuk sijil sendiri; tiada no. IC', async () => {
  const gas = setupComplianceGas();
  ok(await call(gas, U.hr, 'saveVehicle', { jenis: 'Kereta', plate_no: 'A1', lokasi: 'HQ', keadaan: 'Baik', roadtax_expiry: myt(-3) }));
  ok(await call(gas, U.hr, 'saveVehicle', { jenis: 'Kereta', plate_no: 'A2', lokasi: 'HQ', keadaan: 'Baik', roadtax_expiry: myt(45) }));
  ok(await call(gas, U.hr, 'saveVehicle', { jenis: 'Kereta', plate_no: 'A3', lokasi: 'HQ', keadaan: 'Baik', roadtax_expiry: myt(200) }));
  ok(await call(gas, U.ali, 'saveMyCert', { jenis: 'NIOSH', expiry_date: myt(10) }));
  ok(await call(gas, U.ali, 'submitMyIc', IC));
  ok(await call(gas, U.hr, 'saveChargeman', { nama: 'Abu', solar_farm: 'LSS', expiry_date: myt(80) }));
  gas.mails.length = 0;
  assert.equal(gas.ctx.weeklyReport(), 4);
  const rep = gas.mails.find((m) => m.to === 'hr-pss@example.test');
  assert.match(rep.body, /TELAH TAMAT \(1\):\n- Roadtax Kereta A1/);
  assert.match(rep.body, /Tamat dalam 30 hari \(1\):\n- NIOSH \(NTSP\) Ali Technician/);
  assert.match(rep.body, /31-60 hari \(1\)/);
  assert.match(rep.body, /61-90 hari \(1\):\n- Chargeman Abu/);
  assert.ok(!rep.body.includes('A3'));
  assert.ok(!rep.body.includes('900101'));
  const ali = gas.mails.find((m) => m.to === 'ali@gmail.com');
  assert.match(ali.body, /NIOSH/);
});
