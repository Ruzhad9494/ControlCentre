// Ujian Fasa 2G: ClaimReport / DO Generator (IPD seksyen 6: F-70 hingga F-72), ikut sistem lama gcc-voltake/claimreport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupCrGas, CR_SECRET } from './helpers.mjs';

const U = {
  sp: { email: 'aina.sp@voltake.com', nama: 'Aina Strategic', roles: ['user'] },
  sp2: { email: 'farid.sp@voltake.com', nama: 'Farid Strategic', roles: ['user'] },
  head: { email: 'head.sp@voltake.com', nama: 'Head Strategic', roles: ['admin'] },
  viewer: { email: 'boss@voltake.com', nama: 'Boss', roles: ['viewer'] },
  luar: { email: 'ali@gmail.com', nama: 'Ali', roles: [] },
};
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

async function call(gas, user, action, payload) {
  const body = JSON.stringify(await signEnvelope(CR_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const fileText = (gas, id) => Buffer.from(gas.drive.files.get(id).blob.bytes.map((b) => (b + 256) % 256)).toString('utf8');
const exported = (gas, id) => JSON.parse(fileText(gas, id).split('\n').slice(1).join('\n'));
const rowsOf = (gas) => gas.spreadsheet.getSheetByName('DeliveryOrders').rows();

const DO = (o = {}) => ({
  refs: [{ type: 'RW', no: '2606230354', ma: '2606230111' }, { type: 'RC', no: 'rc77', ma: '' }],
  apacs: ['APAC-1', '', 'APAC-2'],
  tarikh: today(),
  from_name: 'JingDong Logistics', from_address: 'Klang, Selangor', from_attn: 'Prema', from_tel: '6012-396 1012',
  to_name: 'LSS Kerian', to_address: 'Parit Buntar, Perak', to_attn: 'En Hafiz', to_tel: '0124445566',
  items: [{ productCode: 'SG110CX', description: 'Inverter 110kW', qty: 2, unit: 'pallet' }, { productCode: 'FUSE-15A', description: 'Fius 15A', qty: 10, unit: 'PCS' }, { productCode: 'SG110CX', description: 'Inverter spare', qty: 1, unit: 'PALLET' }],
  truck: 'PKN 1234', note: 'Hantar sebelum 5pm', signer: 'Aina Strategic',
  ...o,
});

test('setupSystem: tab, Settings, preset From lama (JingDong, Koennen), folder ClaimReport/{PDF,EXCEL}', () => {
  const gas = setupCrGas({ template: false });
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), ['AuditLog', 'DeliveryOrders', 'Parties', 'Settings', '_Counters']);
  gas.ctx.setupSystem();
  const p = gas.spreadsheet.getSheetByName('Parties').rows();
  assert.deepEqual(p.map((r) => [r.jenis, r.nama]), [['from', 'JingDong Logistics'], ['from', 'Koennen Technology Sdn Bhd']], 'idempotent: tiada pendua');
  const s = Object.fromEntries(gas.spreadsheet.getSheetByName('Settings').rows().map((r) => [r.key, r.value]));
  assert.equal(s.do_suffix, '_JD');
  assert.equal(s.item_row, '17');
  const cr = gas.ctx.DriveApp.getFolderById('cr-root').folders.find((f) => f.name === 'ClaimReport');
  assert.deepEqual(cr.folders.map((f) => f.name).sort(), ['EXCEL', 'PDF']);
  assert.ok(gas.logs.some((l) => l.includes('Template: TIADA')));
});

test('Jana DO (F-70): No. DO ikut sistem lama, bil berjujukan, template diisi, PDF + Excel peribadi, temp dibuang', async () => {
  const gas = setupCrGas();
  const r = ok(await call(gas, U.sp, 'createDO', DO()));
  assert.equal(r.do_no, 'RW2606230354_MA2606230111_JD');
  assert.equal(r.report_name, '1. RW2606230354_MA2606230111_JD');
  assert.equal(r.total_carton, '3 PALLET, 10 PCS', 'computeTotalCarton lama: ikut unit, susunan muncul');
  const row = rowsOf(gas)[0];
  assert.equal(row.do_no_all, 'RW2606230354_MA2606230111_JD\nRC77_JD');
  assert.equal(row.apac, 'APAC-1, APAC-2');
  assert.equal(row.created_by, U.sp.email);
  assert.equal(row.jumlah_qty, 13);
  // template
  const pdf = exported(gas, row.pdf_file_id);
  const cell = (r0, c) => (pdf.data[r0 - 1] || [])[c - 1];
  assert.equal(cell(3, 3), 'RW2606230354_MA2606230111_JD\nRC77_JD');
  assert.equal(cell(4, 3), 'APAC-1, APAC-2');
  assert.equal(cell(6, 6), 'LSS Kerian');
  assert.equal(cell(25, 2), 'Aina Strategic', 'signer bergerak 2 baris (3 item)');
  assert.deepEqual([cell(17, 2), cell(17, 3), cell(17, 8), cell(17, 9)], [1, 'SG110CX', 2, 'PALLET']);
  assert.deepEqual([cell(19, 2), cell(19, 3), cell(19, 9)], [3, 'SG110CX', 'PALLET'], 'baris item ditambah (insertRowsAfter)');
  assert.equal(cell(21, 3), '3 PALLET, 10 PCS', 'TOTAL bergerak ke bawah selepas item');
  assert.equal(cell(19, 10), '=H17', 'formula lain template disalin, bukan dibuang');
  assert.match(String(cell(3, 9)), /^\d{4}-\d{2}-\d{2}T/, '{{DATE}} jadi objek tarikh (bukan teks)');
  assert.equal(gas.drive.files.get(row.pdf_file_id).getName(), '1. RW2606230354_MA2606230111_JD.pdf');
  assert.equal(gas.drive.files.get(row.xlsx_file_id).getName(), '1. RW2606230354_MA2606230111_JD.xlsx');
  assert.ok(fileText(gas, row.xlsx_file_id).startsWith('PK-MOCK'));
  assert.ok(gas.fetches[0].url.includes('size=A4&portrait=true&fitw=true') && gas.fetches[0].url.includes('&c2=10'));
  assert.equal(gas.fetches[0].opt.headers.Authorization, 'Bearer token-ujian');
  assert.ok([...gas.drive.temps.keys()].every((id) => gas.drive.files.get(id).trashed), 'spreadsheet sementara dibuang');
  const yr = today().slice(0, 4);
  const pdfFolder = gas.ctx.DriveApp.getFolderById('cr-root').folders.find((f) => f.name === 'ClaimReport').folders.find((f) => f.name === 'PDF');
  assert.equal(pdfFolder.folders[0].name, yr);
  // Parties dikemas kini sendiri
  ok(await call(gas, U.sp, 'createDO', DO({ refs: [{ type: 'RW', no: '5' }], from_attn: 'Prema Baru' })));
  const parties = ok(await call(gas, U.sp, 'listParties', {}));
  assert.equal(parties.parties.filter((p) => p.nama === 'JingDong Logistics').length, 1);
  assert.equal(parties.parties.find((p) => p.nama === 'JingDong Logistics').attn, 'Prema Baru');
  assert.ok(parties.parties.some((p) => p.jenis === 'to' && p.nama === 'LSS Kerian' && p.alamat === 'Parit Buntar, Perak'));
  assert.deepEqual([...parties.units], ['PCS', 'UNIT', 'SET', 'BOX', 'PALLET', 'KG']);
  assert.equal(rowsOf(gas)[1].report_name, '2. RW5_JD');
});

test('Validasi lama + pendua DO No + formula injection + template tiada', async () => {
  const gas = setupCrGas();
  const bad = async (o, re) => { const r = await call(gas, U.sp, 'createDO', DO(o)); assert.equal(r.ok, false, JSON.stringify(o)); assert.match(r.error, re); return r; };
  await bad({ refs: [] }, /rujukan/);
  await bad({ refs: [{ type: 'RW', no: '' }] }, /wajib diisi/);
  await bad({ refs: [{ type: 'XX', no: '1' }] }, /RW atau RC/);
  await bad({ tarikh: '2026-02-30' }, /tarikh/);
  await bad({ from_name: '' }, /From/);
  await bad({ signer: ' ' }, /signer/);
  await bad({ items: [] }, /1 item/);
  await bad({ items: [{ productCode: 'A', description: 'B', qty: 0, unit: 'PCS' }] }, /positif/);
  await bad({ items: [{ productCode: 'A', description: 'B', qty: 1, unit: 'TAN' }] }, /unit/);
  ok(await call(gas, U.sp, 'createDO', DO({ note: '=HYPERLINK("http://x")', to_name: '+60 Solar' })));
  const r = await call(gas, U.sp2, 'createDO', DO({ refs: [{ type: 'rw', no: ' 2606230354 ', ma: 'MA2606230111' }] }));
  assert.equal(r.status, 409, 'normalizePart: huruf kecil/ruang/prefix MA dianggap sama');
  const row = rowsOf(gas)[0];
  assert.equal(row.note, "'=HYPERLINK(\"http://x\")");
  assert.equal(exported(gas, row.pdf_file_id).data[22][2], "'=HYPERLINK(\"http://x\")", 'template juga disanitize');
  gas.spreadsheet.sheets.delete('Template');
  const t = await call(gas, U.sp, 'createDO', DO({ refs: [{ type: 'RW', no: '9' }] }));
  assert.equal(t.status, 503);
  assert.match(t.error, /Template/);
  assert.equal(rowsOf(gas).length, 1, 'tiada baris separuh');
});

test('Role: viewer baca sahaja, bukan claimreport ditolak, user tak boleh padam', async () => {
  const gas = setupCrGas();
  const { do_id } = ok(await call(gas, U.sp, 'createDO', DO()));
  assert.equal((await call(gas, U.luar, 'listDOs', {})).status, 403);
  assert.equal(ok(await call(gas, U.viewer, 'listDOs', {})).dos.length, 1);
  assert.equal((await call(gas, U.viewer, 'createDO', DO({ refs: [{ type: 'RW', no: '8' }] }))).status, 403);
  assert.equal((await call(gas, U.sp, 'deleteDO', { do_id, sebab: 'Salah taip' })).status, 403);
  assert.equal((await call(gas, U.sp, 'deleteParty', { party_id: 'x' })).status, 403);
  const l = ok(await call(gas, U.sp2, 'listDOs', {}));
  assert.equal(l.dos[0].boleh_ubah, false, 'user lain: tak boleh ubah');
  assert.equal(l.dos[0].dibuat_oleh, 'Aina Strategic');
  assert.equal(ok(await call(gas, U.sp, 'listDOs', {})).dos[0].boleh_ubah, true);
});

test('Ubah (F-72, BSD 4.2): pembuat hari sama; admin semua dengan sebab; fail dijana semula, bil kekal', async () => {
  const gas = setupCrGas();
  const a = ok(await call(gas, U.sp, 'createDO', DO()));
  const b = ok(await call(gas, U.sp, 'createDO', DO({ refs: [{ type: 'RW', no: '777' }] })));
  const oldPdf = rowsOf(gas)[0].pdf_file_id;
  const e = ok(await call(gas, U.sp, 'updateDO', { ...DO({ refs: [{ type: 'RW', no: '111', ma: '' }], truck: 'WXY 9' }), do_id: a.do_id }));
  assert.equal(e.report_name, '1. RW111_JD', 'bil kekal 1');
  assert.equal(gas.drive.files.get(oldPdf).trashed, true, 'PDF lama ke Trash');
  const r0 = rowsOf(gas)[0];
  assert.equal(r0.truck, 'WXY 9');
  assert.equal(exported(gas, r0.pdf_file_id).data[2][2], 'RW111_JD');
  assert.equal((await call(gas, U.sp, 'updateDO', { ...DO({ refs: [{ type: 'RW', no: '777' }] }), do_id: a.do_id })).status, 409, 'DO No sama dengan DO lain');
  assert.equal((await call(gas, U.sp2, 'updateDO', { ...DO(), do_id: a.do_id })).status, 403, 'bukan pembuat');
  // hari lain: pembuat tak boleh lagi
  const sh = gas.spreadsheet.getSheetByName('DeliveryOrders');
  sh.data[1][sh.header().indexOf('created_at')] = '2020-01-01T09:00:00+08:00';
  const r = await call(gas, U.sp, 'updateDO', { ...DO({ refs: [{ type: 'RW', no: '112' }] }), do_id: a.do_id });
  assert.equal(r.status, 403);
  assert.match(r.error, /hari yang sama/);
  assert.equal((await call(gas, U.head, 'updateDO', { ...DO({ refs: [{ type: 'RW', no: '112' }] }), do_id: a.do_id })).status, 400, 'admin: sebab wajib untuk DO orang lain');
  ok(await call(gas, U.head, 'updateDO', { ...DO({ refs: [{ type: 'RW', no: '112' }] }), do_id: a.do_id, sebab: 'Betulkan No RW' }));
  const log = gas.spreadsheet.getSheetByName('AuditLog').rows().find((x) => x.tindakan === 'UPDATE_DO' && x.email === U.head.email);
  assert.match(log.butiran, /RW111_JD -> RW112_JD \| sebab: Betulkan No RW/);
  assert.equal(rowsOf(gas).length, 2);
  assert.ok(b.do_id);
});

test('Padam lembut admin (F-72) + nombor seterusnya + getFile + Zip PDF ikut julat (nama "GCC Month Year")', async () => {
  const gas = setupCrGas();
  const a = ok(await call(gas, U.sp, 'createDO', DO({ tarikh: '2026-10-05' })));
  const b = ok(await call(gas, U.sp, 'createDO', DO({ refs: [{ type: 'RW', no: '2' }], tarikh: '2026-10-20' })));
  ok(await call(gas, U.sp, 'createDO', DO({ refs: [{ type: 'RW', no: '3' }], tarikh: '2026-11-02' })));
  assert.equal((await call(gas, U.head, 'deleteDO', { do_id: b.do_id, sebab: 'x' })).status, 400);
  ok(await call(gas, U.head, 'deleteDO', { do_id: b.do_id, sebab: 'DO dibatalkan Sungrow' }));
  const raw = rowsOf(gas).find((r) => r.do_id === b.do_id);
  assert.equal(raw.deleted, 'TRUE');
  assert.equal(raw.deleted_reason, 'DO dibatalkan Sungrow');
  assert.equal(gas.drive.files.get(raw.pdf_file_id).trashed, false, 'fail disimpan');
  const l = ok(await call(gas, U.sp, 'listDOs', {}));
  assert.deepEqual(l.dos.map((d) => d.report_name), ['3. RW3_JD', '1. RW2606230354_MA2606230111_JD']);
  assert.equal((await call(gas, U.sp, 'getDO', { do_id: b.do_id })).status, 404);
  const n = ok(await call(gas, U.sp, 'createDO', DO({ refs: [{ type: 'RW', no: '2' }] })));
  assert.match(n.report_name, /^4\. RW2_JD$/, 'bil terus naik; DO No yang dipadam boleh diguna semula');
  const f = ok(await call(gas, U.viewer, 'getFile', { do_id: a.do_id, jenis: 'xlsx' }));
  assert.equal(f.nama, '1. RW2606230354_MA2606230111_JD.xlsx');
  const z = ok(await call(gas, U.sp, 'zipPdfs', { dari: '2026-10-01', hingga: '2026-10-31' }));
  assert.equal(z.nama, 'GCC October 2026.zip');
  assert.equal(z.bil, 1, 'DO dipadam tidak dizip');
  assert.deepEqual(JSON.parse(Buffer.from(z.data, 'base64').toString().split('\n')[1]), ['DO_RW2606230354_MA2606230111_JD.pdf']);
  assert.equal((await call(gas, U.sp, 'zipPdfs', { dari: '2025-01-01', hingga: '2025-01-31' })).status, 404);
  gas.spreadsheet.getSheetByName('Settings').data.forEach((r) => { if (r[0] === 'zip_max_fail') r[1] = '1'; });
  assert.equal((await call(gas, U.sp, 'zipPdfs', {})).status, 413);
  const pty = ok(await call(gas, U.sp, 'listParties', {})).parties.find((p) => p.nama === 'Koennen Technology Sdn Bhd');
  ok(await call(gas, U.head, 'deleteParty', { party_id: pty.party_id }));
  assert.ok(!ok(await call(gas, U.sp, 'listParties', {})).parties.some((p) => p.nama === 'Koennen Technology Sdn Bhd'));
});

test('importOldData: Database lama (lajur A-X), bil kekal, pendua dilangkau, DO lama hanya admin boleh ubah', async () => {
  const gas = setupCrGas();
  const sh = gas.spreadsheet.insertSheet('IMPORT_DATABASE');
  sh.data.push(['No', 'Timestamp', 'DO No', 'RW', 'MA', 'Date', 'APAC', 'From Name', 'From Address', 'From Attn', 'From Tel', 'To Name', 'To Address', 'To Attn', 'To Tel', 'Total Items', 'Items', 'Total Carton/Pallet', 'Truck', 'Note', 'Signer', 'PDF Link', 'Excel Link', 'Refs & APAC (JSON)']);
  const items = JSON.stringify([{ productCode: 'SG50', description: 'Inverter', qty: '4', unit: 'PALLET' }]);
  sh.data.push([41, new Date('2026-09-01T02:00:00Z'), 'RW100_MA200_JD', 'RW100', 'MA200', '01/09/2026', 'AP-9', 'JingDong Logistics', 'Klang', 'Prema', '60123', 'LSS Gurun', 'Kedah', 'Hafiz', '6019', 1, items, '4 PALLET', 'PKN 1', '', 'Aina', 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=drivesdk', 'https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765/edit', JSON.stringify({ refs: [{ type: 'RW', no: '100', ma: '200' }], apacs: ['AP-9'] })]);
  sh.data.push([42, new Date('2026-09-03T02:00:00Z'), 'RC5_JD', 'RC5', '', new Date('2026-09-03T00:00:00+08:00'), '', 'Koennen', '', '', '', 'Site B', '', '', '', 1, items, '4 PALLET', '', '', 'Aina', '', '', '']);
  const r1 = gas.ctx.importOldData();
  assert.equal(r1.ditambah, 2);
  assert.equal(gas.ctx.importOldData().ditambah, 0, 'selamat dijalankan semula');
  const rows = rowsOf(gas);
  assert.deepEqual(rows.map((r) => [r.bil, r.report_name, r.tarikh, r.sumber]), [[41, '41. RW100_MA200_JD', '2026-09-01', 'lama'], [42, '42. RC5_JD', '2026-09-03', 'lama']]);
  assert.equal(rows[0].pdf_file_id, '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  assert.equal(rows[0].jumlah_qty, 4);
  const d = ok(await call(gas, U.sp, 'getDO', { do_id: rows[0].do_id }));
  assert.deepEqual(d.refs, [{ type: 'RW', no: '100', ma: '200' }]);
  assert.deepEqual([...d.apacs], ['AP-9']);
  assert.equal(d.boleh_ubah, false, 'DO lama: user tak boleh ubah');
  assert.equal(ok(await call(gas, U.head, 'getDO', { do_id: rows[0].do_id })).boleh_ubah, true);
  assert.equal((await call(gas, U.sp, 'createDO', DO({ refs: [{ type: 'RW', no: '100', ma: '200' }] }))).status, 409, 'pendua dengan DO lama');
  assert.equal(ok(await call(gas, U.sp, 'createDO', DO())).report_name, '43. RW2606230354_MA2606230111_JD', 'bil bersambung dari DO lama');
});
