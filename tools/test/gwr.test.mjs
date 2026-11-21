// Ujian Fasa 2F: GWR OMP + PSS (IPD seksyen 6: F-30 hingga F-34) + gateway /public/api untuk tandatangan klien.
import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupGwrGas, GWR_SECRET, PNG_B64, installCaches, ORIGIN, env, ctx } from './helpers.mjs';
import * as pub from '../../functions/public/api/[[path]].js';

const U = {
  mgr: { email: 'mgr.pss@voltake.com', nama: 'Manager PSS', staff_id: 'VE40', department: 'PSS', roles: ['manager'] },
  eng: { email: 'eng.pss@voltake.com', nama: 'Engineer PSS', staff_id: 'VE41', department: 'PSS', roles: ['engineer'] },
  tech: { email: 'ali@gmail.com', nama: 'Ali Technician', staff_id: 'VE10', department: 'PSS', roles: ['technician'] },
  tech2: { email: 'abu@gmail.com', nama: 'Abu Technician', staff_id: 'VE11', department: 'PSS', roles: ['technician'] },
  omp: { email: 'sup.omp@voltake.com', nama: 'Supervisor OMP', staff_id: 'VE50', department: 'OMP', roles: ['supervisor'] },
  both: { email: 'gm@voltake.com', nama: 'GM Ops', staff_id: 'VE60', department: 'MGMT', roles: ['manager'], scope: 'dept=OMP,PSS' },
  hr: { email: 'hr@voltake.com', nama: 'Siti HR', staff_id: 'VE20', department: 'HR', roles: ['technician'] },
  pub: { email: 'public', nama: 'Orang awam', roles: ['public'], ip_hash: 'ip-klien' },
};
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

async function call(gas, user, action, payload) {
  const body = JSON.stringify(await signEnvelope(GWR_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
let seq = 0;
const rid = () => 'req-' + Date.now() + '-' + (++seq);

const PROJECT = { tarikh: today(), po_number: 'PO-2026-001', quotation_number: 'QT-9', mos_number: 'MOS-3', client_company: 'TNB Solar', project_title: 'PM inverter LSS4', location: 'LSS4 Bukit Kayu Hitam, Kedah', pic_name: 'En Rahman', pic_phone: '0123456789' };
const FIELD = {
  time_in: today() + 'T08:30', time_out: today() + 'T17:00', ptw: true,
  job_items: [{ desc: 'Tukar fius inverter 3', remark: 'Siap', shutdown: true, voltage: 'LV' }, { desc: 'Cuci panel', remark: '', shutdown: false, voltage: 'MV' }],
  manpower_items: [{ role: 'Technician', count: '2', names: 'Ali, Abu' }], unresolved_issue: 'Kabel MV perlu ganti', sign_client_name: 'En Rahman', sign_client_position: 'Site Manager', sign_client_phone: '0123456789',
};

async function prepared(gas, user = U.mgr) {
  return ok(await call(gas, user, 'saveReport', { client_req_id: rid(), ...PROJECT })).report_id;
}
async function submitted(gas, user = U.tech) {
  const id = await prepared(gas);
  ok(await call(gas, user, 'saveReport', { report_id: id, ...FIELD }));
  ok(await call(gas, user, 'addImages', { report_id: id, batch_id: rid(), images: [{ data: PNG_B64, desc: 'Sebelum' }, { data: PNG_B64, desc: 'Selepas' }] }));
  const r = ok(await call(gas, user, 'submitReport', { report_id: id, submit_id: rid(), tandatangan: { data: PNG_B64 }, staff_position: 'Technician' }));
  return { id, token: r.pautan.split('?t=')[1], res: r };
}
const pdfText = (gas, fileId) => Buffer.from(gas.drive.files.get(fileId).blob.bytes.map((b) => (b + 256) % 256)).toString('utf8');

test('setupSystem: tab, folder GWR/OMP & PSS, trigger pautan luput', () => {
  const gas = setupGwrGas();
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), ['AuditLog', 'Reports', 'Settings', '_Counters']);
  gas.ctx.setupSystem();
  assert.deepEqual(gas.triggers.map((t) => t.handler), ['dailyExpire']);
  const g = gas.ctx.DriveApp.getFolderById('gwr-root').folders.find((f) => f.name === 'GWR');
  assert.deepEqual(g.folders.map((f) => [f.name, f.folders.map((x) => x.name).sort().join(',')]).sort(), [['OMP', 'Images,PDF,Signatures'], ['PSS', 'Images,PDF,Signatures']]);
  const h = gas.spreadsheet.getSheetByName('Reports').header();
  assert.ok(!h.includes('StaffToken') && !h.includes('ApprovalToken') && h.includes('approval_token_hash'));
});

test('Role & department: technician tak boleh cipta report / ubah maklumat projek; staf bukan OMP/PSS ditolak', async () => {
  const gas = setupGwrGas();
  assert.equal((await call(gas, U.tech, 'saveReport', { client_req_id: rid(), ...PROJECT })).status, 403);
  assert.equal((await call(gas, U.hr, 'listReports', {})).status, 403, 'department HR');
  const id = await prepared(gas);
  assert.match(id, /^GWR-PSS-\d{4}-00001$/);
  const r = ok(await call(gas, U.tech, 'saveReport', { report_id: id, po_number: 'PO-PALSU', client_company: 'Lain', ...FIELD }));
  const d = ok(await call(gas, U.tech, 'getReport', { report_id: id }));
  assert.deepEqual([d.po_number, d.client_company], ['PO-2026-001', 'TNB Solar'], 'medan projek technician diabaikan');
  assert.equal(d.boleh_ubah_projek, false);
  assert.equal(r.report.job_shutdown, 'YES - LV', 'job shutdown dikira server');
  assert.equal(d.ptw, 'YES');
  assert.equal((await call(gas, U.omp, 'getReport', { report_id: id })).status, 404, 'OMP tak nampak PSS');
  assert.equal((await call(gas, U.both, 'saveReport', { client_req_id: rid(), dept: 'OMP', ...PROJECT })).ok, true, 'skop dept=OMP,PSS');
  assert.equal((await call(gas, U.mgr, 'saveReport', { client_req_id: rid(), dept: 'OMP', ...PROJECT })).status, 403, 'dept di luar skop');
});

test('Offline: client_req_id sama = report sama (tiada pendua); batch gambar diulang tak digandakan', async () => {
  const gas = setupGwrGas();
  const req = rid();
  const a = ok(await call(gas, U.eng, 'saveReport', { client_req_id: req, ...PROJECT }));
  const b = ok(await call(gas, U.eng, 'saveReport', { client_req_id: req, ...PROJECT }));
  assert.equal(a.report_id, b.report_id);
  assert.equal(b.duplicate, true);
  assert.equal(gas.spreadsheet.getSheetByName('Reports').rows().length, 1);
  const batch = rid();
  const imgs = { report_id: a.report_id, batch_id: batch, images: [{ data: PNG_B64, desc: 'A' }, { data: PNG_B64, desc: 'B' }, { data: PNG_B64, desc: 'C' }] };
  assert.equal(ok(await call(gas, U.eng, 'addImages', imgs)).bil_gambar, 3);
  const again = ok(await call(gas, U.eng, 'addImages', imgs));
  assert.equal(again.bil_gambar, 3);
  assert.equal(again.duplicate, true);
  assert.equal((await call(gas, U.eng, 'addImages', { ...imgs, batch_id: rid(), images: [...imgs.images, imgs.images[0]] })).status, 400, 'maksimum 3 sekali');
  assert.equal((await call(gas, U.eng, 'addImages', { ...imgs, batch_id: rid(), images: [{ data: Buffer.from('%PDF-1.4 bukan gambar').toString('base64') }] })).status, 400);
  // susun semula & buang
  const files = JSON.parse(gas.spreadsheet.getSheetByName('Reports').rows()[0].image_ids_json).map((x) => x.id);
  ok(await call(gas, U.eng, 'saveReport', { report_id: a.report_id, gambar_susunan: [{ index: 2, desc: 'C baharu' }, { index: 0, desc: 'A' }] }));
  const d = ok(await call(gas, U.eng, 'getReport', { report_id: a.report_id }));
  assert.deepEqual(d.gambar.map((g) => g.desc), ['C baharu', 'A']);
  assert.equal(gas.drive.files.get(files[1]).trashed, true, 'gambar yang dibuang ke tong sampah');
});

test('Hantar (F-30): wajib lengkap; staf dari sesi; PDF draf dijana server; token 32 bait, hanya hash disimpan, luput 7 hari', async () => {
  const gas = setupGwrGas();
  const id = await prepared(gas);
  const bad = await call(gas, U.tech, 'submitReport', { report_id: id, submit_id: rid(), tandatangan: { data: PNG_B64 } });
  assert.equal(bad.status, 400);
  assert.match(bad.error, /Time in.*Job description.*Manpower/);
  ok(await call(gas, U.tech, 'saveReport', { report_id: id, ...FIELD }));
  assert.equal((await call(gas, U.tech, 'submitReport', { report_id: id, submit_id: rid() })).status, 400, 'tandatangan wajib');
  const r = ok(await call(gas, U.tech, 'submitReport', { report_id: id, submit_id: rid(), tandatangan: { data: PNG_B64 } }));
  assert.match(r.pautan, /^https:\/\/cc\.example\.test\/public\/gwr-sign\/\?t=[a-f0-9]{64}$/);
  const token = r.pautan.split('?t=')[1];
  const row = gas.spreadsheet.getSheetByName('Reports').rows()[0];
  assert.equal(row.status, 'Menunggu klien');
  assert.deepEqual([row.staff_email, row.staff_name], ['ali@gmail.com', 'Ali Technician']);
  assert.ok(!JSON.stringify(row).includes(token), 'token mentah tidak disimpan');
  assert.equal(row.approval_token_hash.length, 64);
  const days = (Date.parse(row.approval_token_expires) - Date.now()) / 864e5;
  assert.ok(days > 6.9 && days <= 7.01, String(days));
  const html = pdfText(gas, row.draft_pdf_file_id);
  assert.ok(html.startsWith('%PDF'));
  // Susun atur sistem lama (#export-container): kepala logo + syarikat (DEPT), grid Project Information, jadual kerja, manpower
  for (const s of ['GROUND WORK REPORT FORM', 'VOLTAKE ENERGY (PSS)', 'PROJECT INFORMATION', 'PO-2026-001', 'TNB Solar', 'SHUTDOWN LV</span>', 'Tukar fius inverter 3',
    'UNRESOLVED ISSUE &amp; ACTION TO BE TAKEN', 'Kabel MV perlu ganti', 'MANPOWER / PAX', '<td class="mr">Technician</td><td class="mx">2</td><td>Ali, Abu</td>', 'Total: 2 pax',
    'Menunggu Tandatangan Klien', 'Ali Technician', 'VERIFICATIONS / PENGESAHAN', 'SITE PHOTOS / LAMPIRAN GAMBAR', 'Page 1 of 3', 'Page 3 of 3', 'All Right Reserved by',
    ' ; 08:30 AM', 'data:image/png;base64,']) assert.ok(html.includes(s), s);
  assert.equal(gas.drive.files.get(row.draft_pdf_file_id).getName(), `LSS4_Bukit_Kayu_Hitam_TNB_Solar_${today().slice(8, 10)}${today().slice(5, 7)}${today().slice(0, 4)}_Draft.pdf`, 'nama fail ikut sistem lama');
  assert.equal(ok(await call(gas, U.mgr, 'listReports', {})).laporan[0].status, 'Menunggu klien');
});

test('Tandatangan klien (F-32): medan terhad, sekali guna, luput = 410, PDF final dijana server & dihantar sebagai lampiran (F-34)', async () => {
  const gas = setupGwrGas();
  const { id, token } = await submitted(gas);
  assert.equal((await call(gas, U.pub, 'getSignRequest', { token: 'x'.repeat(64) })).status, 404);
  assert.equal((await call(gas, U.pub, 'getSignRequest', { token: token.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')) })).status, 404);
  const req = ok(await call(gas, U.pub, 'getSignRequest', { token }));
  assert.equal(req.report_id, id);
  assert.equal(req.bil_gambar, 2);
  assert.ok(!JSON.stringify(req).includes('ali@gmail.com'), 'tiada emel staf');
  assert.ok(!JSON.stringify(req).includes('file-'), 'tiada ID fail');
  assert.equal(ok(await call(gas, U.pub, 'getSignPdf', { token })).mime, 'application/pdf');
  const A = { token, nama: 'En Rahman', jawatan: 'Site Manager', telefon: '0123456789', emel: 'rahman@tnb.example', tandatangan: { data: PNG_B64 }, setuju: true };
  assert.equal((await call(gas, U.pub, 'clientApprove', { ...A, setuju: false })).status, 400);
  assert.equal((await call(gas, U.pub, 'clientApprove', { ...A, emel: 'x' })).status, 400);
  gas.mails.length = 0;
  const done = ok(await call(gas, U.pub, 'clientApprove', A));
  assert.equal(done.emel_klien, true);
  const row = gas.spreadsheet.getSheetByName('Reports').rows()[0];
  assert.deepEqual([row.status, row.approval_token_hash, row.client_sign_name, row.client_ip_hash], ['Disahkan', '', 'En Rahman', 'ip-klien']);
  const fin = pdfText(gas, row.final_pdf_file_id);
  assert.ok(fin.includes('En Rahman') && fin.includes('Site Manager') && !fin.includes('Menunggu Tandatangan Klien'), 'final: tandatangan & butiran klien');
  assert.deepEqual(gas.mails.map((m) => m.to).sort(), ['ali@gmail.com', 'pss-mgr@example.test', 'rahman@tnb.example']);
  assert.ok(gas.mails.every((m) => m.attachments && m.attachments.length === 1 && /_Final\.pdf$/.test(m.attachments[0].getName())), 'PDF final dilampirkan');
  assert.ok(!gas.mails.some((m) => /drive\.google\.com/.test(m.body)), 'tiada pautan Drive');
  assert.equal(row.emel_dihantar, 'klien,staf,cc');
  assert.equal((await call(gas, U.pub, 'clientApprove', A)).status, 404, 'sekali guna');
  assert.equal((await call(gas, U.pub, 'getSignRequest', { token })).status, 404);
  assert.equal((await call(gas, U.tech, 'saveReport', { report_id: id, unresolved_issue: 'ubah' })).status, 409, 'Disahkan dikunci');
  // luput
  const s2 = await submitted(gas);
  const sh = gas.spreadsheet.getSheetByName('Reports');
  const h = sh.header();
  sh.data.find((x) => x[h.indexOf('report_id')] === s2.id)[h.indexOf('approval_token_expires')] = new Date(Date.now() - 1000).toISOString();
  assert.equal((await call(gas, U.pub, 'getSignRequest', { token: s2.token })).status, 410);
  assert.equal(gas.ctx.dailyExpire(), 1);
  assert.equal(sh.rows().find((x) => x.report_id === s2.id).status, 'Luput');
  // jana pautan baharu
  assert.equal((await call(gas, U.tech2, 'regenerateLink', { report_id: s2.id })).status, 403, 'technician lain');
  const nr = ok(await call(gas, U.tech, 'regenerateLink', { report_id: s2.id }));
  const t2 = nr.pautan.split('?t=')[1];
  assert.notEqual(t2, s2.token);
  assert.equal(ok(await call(gas, U.pub, 'getSignRequest', { token: t2 })).report_id, s2.id);
  assert.equal((await call(gas, U.pub, 'getSignRequest', { token: s2.token })).status, 404, 'pautan lama mati');
});

test('Hantar semula submit_id sama (jawapan hilang): report sama, pautan baharu, token lama mati', async () => {
  const gas = setupGwrGas();
  const id = await prepared(gas);
  ok(await call(gas, U.tech, 'saveReport', { report_id: id, ...FIELD }));
  const sid = rid();
  const a = ok(await call(gas, U.tech, 'submitReport', { report_id: id, submit_id: sid, tandatangan: { data: PNG_B64 } }));
  const b = ok(await call(gas, U.tech, 'submitReport', { report_id: id, submit_id: sid, tandatangan: { data: PNG_B64 } }));
  assert.equal(a.report_id, b.report_id);
  assert.notEqual(a.pautan, b.pautan);
  assert.equal((await call(gas, U.pub, 'getSignRequest', { token: a.pautan.split('?t=')[1] })).status, 404);
  assert.equal(gas.spreadsheet.getSheetByName('Reports').rows().length, 1);
  // ubah selepas hantar -> kembali Draf, pautan mati
  ok(await call(gas, U.tech, 'saveReport', { report_id: id, unresolved_issue: 'Tambah nota' }));
  assert.equal(gas.spreadsheet.getSheetByName('Reports').rows()[0].status, 'Draf');
  assert.equal((await call(gas, U.pub, 'getSignRequest', { token: b.pautan.split('?t=')[1] })).status, 404);
});

test('Dashboard (F-33): manager/engineer nampak semua dept; technician report sendiri + draf terbuka; batal = manager sahaja', async () => {
  const gas = setupGwrGas();
  const mine = await submitted(gas, U.tech);
  const other = await submitted(gas, U.tech2);
  const tok = other.token;
  ok(await call(gas, U.pub, 'clientApprove', { token: tok, nama: 'Klien', jawatan: 'PM', telefon: '0123456789', emel: 'k@x.example', tandatangan: { data: PNG_B64 }, setuju: true }));
  const draft = await prepared(gas);
  const asTech = ok(await call(gas, U.tech, 'listReports', {})).laporan.map((r) => r.report_id).sort();
  assert.deepEqual(asTech, [mine.id, draft].sort(), 'tiada report Disahkan technician lain');
  assert.equal((await call(gas, U.tech, 'getReport', { report_id: other.id })).status, 404);
  assert.equal(ok(await call(gas, U.eng, 'listReports', {})).laporan.length, 3);
  assert.equal(ok(await call(gas, U.omp, 'listReports', {})).laporan.length, 0);
  assert.equal(ok(await call(gas, U.tech, 'getFile', { report_id: mine.id, jenis: 'draf' })).mime, 'application/pdf');
  assert.equal(ok(await call(gas, U.tech, 'getFile', { report_id: mine.id, jenis: 'gambar', index: 1 })).mime, 'image/png');
  assert.equal((await call(gas, U.eng, 'cancelReport', { report_id: draft, sebab: 'salah PO' })).status, 403);
  assert.equal((await call(gas, U.mgr, 'cancelReport', { report_id: draft })).status, 400, 'sebab wajib');
  ok(await call(gas, U.mgr, 'cancelReport', { report_id: draft, sebab: 'PO salah, buat semula' }));
  assert.equal((await call(gas, U.mgr, 'cancelReport', { report_id: other.id, sebab: 'cuba' })).status, 409, 'Disahkan tak boleh dibatal');
  const st = ok(await call(gas, U.mgr, 'listReports', {})).laporan.find((r) => r.report_id === draft).status;
  assert.equal(st, 'Dibatalkan');
});

test('Import sistem lama: Draft -> Draf, Pending -> Luput (token lama terdedah), Approved dilangkau; ulang = dilangkau', () => {
  const gas = setupGwrGas();
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  const H = ['ReportID', 'Timestamp', 'Date', 'PONumber', 'QuotationNumber', 'MOSNumber', 'ClientCompany', 'ProjectTitle', 'Location', 'TimeIn', 'TimeOut', 'PICName', 'PICPhone', 'JobDesc', 'UnresolvedIssue', 'Manpower', 'StaffName', 'StaffPosition', 'StaffSignatureId', 'DraftPdfId', 'StaffToken', 'ApprovalToken', 'Status', 'ClientSignName', 'ClientSignPosition', 'ClientSignPhone', 'ClientSignatureId', 'FinalPdfId', 'ClientEmail', 'ClientPhone', 'DraftImageData', 'ClientReqId', 'StaffEmail', 'JobShutdown', 'PTW'];
  const row = (rep, st) => H.map((h) => ({ ReportID: rep, Date: '2026-11-15', PONumber: 'PO-L-' + rep, ClientCompany: 'Klien Lama', Status: st, JobDesc: '[SHUTDOWN MV] Kerja lama', Manpower: 'Technician | 2 | Ali, Abu', DraftPdfId: id, DraftImageData: JSON.stringify([{ id, desc: 'g1' }]), ApprovalToken: 'token-lama-terdedah', StaffToken: 'st', JobShutdown: 'YES - MV', PTW: 'YES' }[h] ?? ''));
  gas.spreadsheet.insertSheet('IMPORT_PSS').data = [H, row('REP-1', 'Draft'), row('REP-2', 'Pending'), row('REP-3', 'Approved')];
  const r = gas.ctx.importOldData();
  assert.deepEqual([...r.ditambah], ['PSS: 2 (dilangkau Approved: 1)']);
  const rows = gas.spreadsheet.getSheetByName('Reports').rows();
  assert.deepEqual(rows.map((x) => [x.status, x.po_number, x.dept, x.draft_pdf_file_id, x.approval_token_hash]), [['Draf', 'PO-L-REP-1', 'PSS', id, ''], ['Luput', 'PO-L-REP-2', 'PSS', id, '']]);
  assert.ok(!JSON.stringify(rows).includes('token-lama-terdedah'), 'token lama tidak dibawa');
  assert.deepEqual(JSON.parse(rows[0].manpower_json), [{ role: 'Technician', count: '2', names: 'Ali, Abu' }]);
  assert.deepEqual([...gas.ctx.importOldData().ditambah], ['PSS: 0 (dilangkau Approved: 1)']);
});

// ---------------------------------------------------------------- gateway /public/api (gwr)
test('/public/api gwr: getSignRequest tanpa Turnstile; clientApprove wajib Turnstile; action staf disekat', async () => {
  installCaches();
  const gas = setupGwrGas();
  const { token } = await submitted(gas);
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === 'https://gas.test/gwr') return new Response(gas.ctx.doPost({ postData: { contents: init.body } }).getContent());
    if (u.startsWith('https://challenges.cloudflare.com/')) return new Response(JSON.stringify({ success: init.body.get('response') === 'TS-OK-xyz' }));
    return orig(url, init);
  };
  const e = env({ GAS_URL_GWR: 'https://gas.test/gwr', MODULE_SECRET_GWR: GWR_SECRET, TURNSTILE_SECRET: 'ts' });
  const req = (p, body) => new Request(`${ORIGIN}/public/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-VP': '1', 'CF-Connecting-IP': '5.5.5.5' }, body: JSON.stringify(body) });
  const run = (p, body) => pub.onRequest(ctx(req(p, body), e, { path: p.split('/') }));
  try {
    let res = await run('gwr/getSignRequest', { token });
    assert.equal(res.status, 200);
    for (const a of ['listReports', 'saveReport', 'submitReport', 'regenerateLink', 'getFile']) assert.equal((await run('gwr/' + a, {})).status, 404, a);
    const A = { token, nama: 'Klien', jawatan: 'PM', telefon: '0123456789', emel: 'k@x.example', tandatangan: { data: PNG_B64 }, setuju: true };
    assert.equal((await run('gwr/clientApprove', A)).status, 400, 'tiada Turnstile');
    res = await run('gwr/clientApprove', { ...A, turnstile: 'TS-OK-xyz' });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(gas.spreadsheet.getSheetByName('Reports').rows()[0].client_ip_hash.length, 32, 'ip_hash dari gateway');
  } finally {
    globalThis.fetch = orig;
  }
});
