// Ujian Fasa 2H: Voltrack (IPD seksyen 6: F-80 hingga F-85), ikut VoltTrack v2 lama (Ruzhad9494/Voltrack).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupVtGas, VT_SECRET } from './helpers.mjs';

const U = {
  com: { email: 'aina.com@voltake.com', nama: 'Aina Commercial', roles: ['commercial'] },
  ops: { email: 'mgr.pss@voltake.com', nama: 'Manager PSS', roles: ['operation'] },
  hr: { email: 'siti.hr@voltake.com', nama: 'Siti HR', roles: ['claim', 'lod'] },
  acc: { email: 'acc@voltake.com', nama: 'Account', roles: ['lod'] },
  adm: { email: 'boss@voltake.com', nama: 'Boss', roles: ['admin'] },
  view: { email: 'gm@voltake.com', nama: 'GM', roles: ['viewer'] },
  luar: { email: 'ali@gmail.com', nama: 'Ali', roles: [] },
};
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const YEAR = today().slice(0, 4);

async function call(gas, user, action, payload) {
  const body = JSON.stringify(await signEnvelope(VT_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const rows = (gas, tab) => gas.spreadsheet.getSheetByName(tab).rows();
const save = (gas, u, fasa, data, id) => call(gas, u, 'saveProject', { id, fasa, data });

test('setupSystem: 4 tab fasa + Settings + AuditLog, tiada tab Users, trigger dailyOverdue 8 pagi', () => {
  const gas = setupVtGas();
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), ['AuditLog', 'Claim', 'Commercial', 'LOD', 'Operation', 'Settings']);
  gas.ctx.setupSystem();
  assert.deepEqual(gas.triggers.map((t) => [t.handler, t.hour]), [['dailyOverdue', 8]]);
  const h = gas.spreadsheet.getSheetByName('Operation').header();
  assert.ok(h.includes('gwr_report_ids') && h.includes('report_pic'));
  assert.ok(!gas.spreadsheet.getSheetByName('Commercial').header().includes('password_hash'));
});

test('Aliran penuh Commercial > Operation > Claim > LOD ikut role (ROLE_WRITE_ACCESS lama)', async () => {
  const gas = setupVtGas();
  // commercial cipta
  const a = ok(await save(gas, U.com, 'Commercial', { company: 'TNB Solar', date_request: today(), quotation_no: 'QT-1', quotation_amount: '12,500.50', status_quotation: 'Pending', job_description: 'PM inverter' }));
  assert.equal(a.id, `EL-${YEAR}-001`);
  assert.deepEqual([...a.peristiwa], ['Projek baru didaftarkan. Sila semak status quotation.']);
  assert.equal(a.projek.quotation_amount, 12500.5);
  for (const t of ['Commercial', 'Operation', 'Claim', 'LOD']) assert.equal(rows(gas, t).length, 1, 'baris dicipta dalam 4 tab: ' + t);
  // role lain tak boleh cipta / tulis fasa orang lain
  assert.equal((await save(gas, U.ops, 'Commercial', { company: 'X' })).status, 403);
  assert.equal((await save(gas, U.com, 'Operation', { mos_ready: 'Sedia' }, a.id)).status, 403);
  assert.equal((await save(gas, U.acc, 'Claim', { invoice_no: 'INV' }, a.id)).status, 403);
  assert.equal((await save(gas, U.view, 'Commercial', { company: 'X' })).status, 403);
  assert.equal((await save(gas, U.ops, 'Operation', {})).status, 400, 'projek baru hanya di Commercial');
  // Approved -> tarikh proceed auto + status_job
  const b = ok(await save(gas, U.com, 'Commercial', { company: 'TNB Solar', status_quotation: 'Approved', quotation_amount: '12500.50' }, a.id));
  assert.equal(b.projek.date_proceed, today());
  assert.equal(b.projek.status_job, 'Pending Start');
  assert.match(b.peristiwa.join(), /Quotation diluluskan/);
  assert.equal(b.projek.job_description, '', 'simpan fasa = gantian penuh medan fasa (macam borang lama)');
  // operation
  const c = ok(await save(gas, U.ops, 'Operation', { mos_ready: 'Sedia', jsa_ready: 'Sedia', ptw_ready: 'Belum', date_start_job: today(), gwr_submitted: 'Yes', gwr_report_ids: 'gwr-pss-2026-00012, GWR-OMP-2026-00003', report_pic: 'Chong' }, a.id));
  assert.equal(c.projek.status_job, 'GWR Submitted');
  assert.equal(c.projek.gwr_date, today(), 'GWR Yes -> tarikh auto');
  assert.equal(c.projek.gwr_report_ids, 'GWR-PSS-2026-00012, GWR-OMP-2026-00003');
  assert.equal((await save(gas, U.ops, 'Operation', { gwr_report_ids: 'REP-123' }, a.id)).status, 400);
  assert.equal((await save(gas, U.ops, 'Operation', { ptw_ready: 'Ada' }, a.id)).status, 400, 'pilihan tak sah');
  assert.equal((await save(gas, U.ops, 'Operation', { date_start_job: today(), date_completed_job: addDays(today(), -1) }, a.id)).status, 400);
  const d = ok(await save(gas, U.ops, 'Operation', { date_start_job: today(), gwr_submitted: 'Yes', full_report_submitted: 'Yes', status_job: 'Hack' }, a.id));
  assert.equal(d.projek.status_job, 'Completed Full Report', 'status_job dikira server, bukan dari pelayar');
  // claim: invoice 40 hari lepas -> outstanding 10 hari; follow-up & LOD sasaran
  const inv = addDays(today(), -40);
  const e = ok(await save(gas, U.hr, 'Claim', { invoice_no: 'INV-77', invoice_date: inv, po_no: 'PO-9', payment_status: 'Pending', followup_1: '2000-01-01', overdue_days: 999 }, a.id));
  assert.deepEqual([e.projek.followup_1, e.projek.followup_2, e.projek.followup_3, e.projek.payment_due_date], [addDays(inv, 7), addDays(inv, 14), addDays(inv, 21), addDays(inv, 30)]);
  assert.equal(e.projek.payment_status, 'Outstanding');
  assert.equal(e.projek.overdue_days, 10);
  assert.equal(e.projek.lod_reminder_sent, addDays(inv, 37));
  assert.equal(e.projek.lod_issue, addDays(inv, 44));
  assert.equal(e.projek.lod_reminder_date, '', 'tarikh SEBENAR reminder tidak diisi sendiri (beza dari sistem lama)');
  assert.match(e.peristiwa.join(), /TERTUNGGAK/);
  // lod (Account)
  const f = ok(await save(gas, U.acc, 'LOD', { lod_reminder_date: today(), ctos_action: 'Initiated', legal_action: 'Pending', case_status: 'Open', case_remark: 'Klien janji bayar minggu depan', lod_reminder_sent: '1999-01-01' }, a.id));
  assert.equal(f.projek.lod_reminder_sent, addDays(inv, 37), 'sasaran dikira, bukan dari pelayar');
  // paid
  const g = ok(await save(gas, U.hr, 'Claim', { invoice_no: 'INV-77', invoice_date: inv, po_no: 'PO-9', payment_status: 'Paid' }, a.id));
  assert.equal(g.projek.payment_status, 'Paid');
  assert.equal(g.projek.overdue_days, 0);
  assert.equal(g.projek.paid_date, today());
  assert.match(g.peristiwa.join(), /Pembayaran diterima/);
  // jejak siapa ubah fasa
  assert.equal(g.projek._claim_oleh, 'Siti HR', 'nama, bukan emel');
  assert.equal(g.projek._lod_oleh, 'Account');
  assert.ok(!JSON.stringify(g.projek).includes('@'), 'tiada emel staf dalam data projek');
  const log = rows(gas, 'AuditLog').map((r) => r.tindakan);
  assert.ok(['CREATE_PROJECT', 'UPDATE_COMMERCIAL', 'UPDATE_OPERATION', 'UPDATE_CLAIM', 'UPDATE_LOD'].every((x) => log.includes(x)));
});

test('Baca: semua role + viewer; bukan voltrack ditolak; ID berjujukan tidak bertindih selepas padam; padam admin sahaja', async () => {
  const gas = setupVtGas();
  const a = ok(await save(gas, U.com, 'Commercial', { company: 'A Sdn Bhd' }));
  const b = ok(await save(gas, U.adm, 'Commercial', { company: 'B Sdn Bhd' }));
  assert.equal(b.id, `EL-${YEAR}-002`);
  assert.equal((await call(gas, U.luar, 'listProjects', {})).status, 403);
  for (const u of [U.com, U.ops, U.hr, U.acc, U.view]) assert.equal(ok(await call(gas, u, 'listProjects', {})).projek.length, 2);
  const l = ok(await call(gas, U.hr, 'listProjects', {}));
  assert.deepEqual([...l.boleh_tulis], ['Claim', 'LOD'], 'multi-role: gabungan');
  assert.equal(l.boleh_cipta, false);
  assert.deepEqual([...ok(await call(gas, U.adm, 'listProjects', {})).boleh_tulis], ['Commercial', 'Operation', 'Claim', 'LOD']);
  assert.equal((await call(gas, U.com, 'deleteProject', { id: a.id, sebab: 'Salah daftar' })).status, 403);
  assert.equal((await call(gas, U.adm, 'deleteProject', { id: a.id, sebab: 'x' })).status, 400);
  ok(await call(gas, U.adm, 'deleteProject', { id: b.id, sebab: 'Projek berganda' }));
  for (const t of ['Commercial', 'Operation', 'Claim', 'LOD']) assert.equal(rows(gas, t).find((r) => r.id === b.id).deleted, 'TRUE');
  assert.equal((await call(gas, U.com, 'getProject', { id: b.id })).status, 404);
  assert.deepEqual(ok(await call(gas, U.com, 'listProjects', {})).projek.map((p) => p.id), [a.id]);
  assert.equal(ok(await save(gas, U.com, 'Commercial', { company: 'C' })).id, `EL-${YEAR}-003`, 'sistem lama: bilangan+1 akan bertindih dengan 002');
  assert.equal((await save(gas, U.com, 'Commercial', { company: '' })).status, 400);
  assert.equal((await save(gas, U.com, 'Commercial', { company: 'D', quotation_amount: '-5' })).status, 400);
  assert.equal((await save(gas, U.com, 'Commercial', { company: 'D' }, b.id)).status, 404);
});

test('dailyOverdue: kira & simpan tunggakan, emel senarai kritikal (1, 7, 14, >30 hari) ke emel_peringatan', async () => {
  const gas = setupVtGas();
  const mk = async (company, invAgo) => {
    const { id } = ok(await save(gas, U.com, 'Commercial', { company, status_quotation: 'Approved', quotation_amount: '1000' }));
    ok(await save(gas, U.hr, 'Claim', { invoice_no: 'INV-' + company, invoice_date: addDays(today(), -invAgo), payment_status: 'Pending' }, id));
    return id;
  };
  await mk('Lewat7', 37); await mk('Lewat45', 75); await mk('Lewat3', 33); await mk('BelumDue', 10);
  // ubah Sheet terus: due date lama tapi status masih Pending (simulasi hari berlalu)
  const sh = gas.spreadsheet.getSheetByName('Claim');
  const h = sh.header();
  sh.data.forEach((r, i) => { if (i > 0) { r[h.indexOf('payment_status')] = 'Pending'; r[h.indexOf('overdue_days')] = 0; } });
  const r = gas.ctx.dailyOverdue();
  assert.equal(r.tertunggak, 3);
  assert.equal(r.emel, true);
  const st = Object.fromEntries(rows(gas, 'Claim').map((x) => [x.id, [x.payment_status, x.overdue_days]]));
  assert.deepEqual(Object.values(st).map((x) => x[0]).sort(), ['Outstanding', 'Outstanding', 'Outstanding', 'Pending']);
  const m = gas.mails[0];
  assert.equal(m.to, 'lod@example.test');
  assert.match(m.subject, /3 projek tertunggak/);
  assert.match(m.body, /Lewat45 \(lewat 45 hari/);
  assert.match(m.body, /Lewat7 \(lewat 7 hari/);
  assert.doesNotMatch(m.body, /Lewat3 \(/, 'lewat 3 hari bukan kritikal');
  assert.match(m.body, /cc\.example\.test\/voltrack\/#\/fasa\/LOD/);
  assert.equal(gas.ctx.dailyOverdue().dikemas_kini, 0, 'idempotent');
});

test('importOldData: 4 tab VoltTrack lama, hanya projek terbuka (BSD 7), importOldDataSemua bawa semua', async () => {
  const mkTabs = (gas) => {
    const put = (name, header, data) => { const sh = gas.spreadsheet.insertSheet(name); sh.data.push(header, ...data); };
    put('IMPORT_COMMERCIAL', ['id', 'company', 'date_request', 'quotation_no', 'quotation_amount', 'status_quotation', 'date_proceed', 'presentation_date', 'job_description', 'remark'], [
      ['EL-2025-001', 'Open Sdn Bhd', new Date('2025-03-01T00:00:00+08:00'), 'QT-1', 'RM 5,000.00', 'Approved', '2025-03-05', '', 'Servis', ''],
      ['EL-2025-002', 'Paid Bhd', '2025-04-01', 'QT-2', 2000, 'Approved', '', '', '', ''],
      ['EL-2025-003', 'Cancel Bhd', '2025-04-02', 'QT-3', 100, 'Cancel', '', '', '', ''],
      ['XX-1', 'Pelik', '', '', '', '', '', '', '', ''],
    ]);
    put('IMPORT_OPERATION', ['id', 'mos_ready', 'jsa_ready', 'ptw_ready', 'date_start_job', 'date_completed_job', 'gwr_submitted', 'gwr_date', 'full_report_submitted', 'full_report_date', 'status_job', 'report_pic'], [
      ['EL-2025-001', 'Sedia', 'Sedia', 'Sedia', '2025-03-10', '2025-03-12', 'Yes', '2025-03-12', 'Yes', '2025-03-20', 'Completed Full Report', 'Aiman']]);
    put('IMPORT_CLAIM', ['id', 'invoice_no', 'invoice_date', 'followup_1', 'followup_2', 'followup_3', 'payment_due_date', 'payment_status', 'overdue_days', 'po_no'], [
      ['EL-2025-001', 'INV-1', '2025-03-25', '', '', '', '', 'Pending', '', 'PO-1'],
      ['EL-2025-002', 'INV-2', '2025-04-10', '', '', '', '', 'Paid', '', '']]);
    put('IMPORT_LOD', ['id', 'lod_reminder_sent', 'lod_reminder_date', 'lod_issue', 'lod_issue_date', 'ctos_action', 'legal_action', 'case_status', 'case_remark'], [
      ['EL-2025-001', '', '2025-05-01', '', '', 'Pending', 'Pending', 'Open', 'Nota']]);
  };
  const gas = setupVtGas();
  mkTabs(gas);
  const r = gas.ctx.importOldData();
  assert.equal(r.ditambah, 1);
  assert.equal(r.tutup_dilangkau, 2);
  assert.ok(r.amaran.some((x) => x.includes('XX-1')));
  const p = ok(await call(gas, U.view, 'getProject', { id: 'EL-2025-001' })).projek;
  assert.equal(p.quotation_amount, 5000);
  assert.equal(p.date_request, '2025-03-01');
  assert.equal(p.payment_due_date, '2025-04-24');
  assert.equal(p.payment_status, 'Outstanding');
  assert.equal(p.lod_reminder_date, '2025-05-01');
  assert.equal(rows(gas, 'Claim')[0].payment_status, 'Outstanding', 'medan dikira disimpan selepas import');
  assert.equal(gas.ctx.importOldData().sudah_ada, 1, 'selamat dijalankan semula');
  assert.equal(gas.ctx.importOldDataSemua().ditambah, 2);
  assert.equal(ok(await save(gas, U.com, 'Commercial', { company: 'Baru' })).id, `EL-${YEAR}-001`);
});
