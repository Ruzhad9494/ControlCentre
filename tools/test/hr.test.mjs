// Ujian Fasa 2E: Draft Mohon Kerja (IPD seksyen 6: F-10 hingga F-14) + gateway /public/api.
import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupHrGas, HR_SECRET, PNG_B64, PDF_B64, installCaches, ORIGIN, env, ctx } from './helpers.mjs';
import * as pub from '../../functions/public/api/[[path]].js';

const U = {
  pub: { email: 'public', nama: 'Orang awam', roles: ['public'], ip_hash: 'iphash123' },
  hr: { email: 'hr@voltake.com', nama: 'Siti HR', staff_id: 'VE20', department: 'HR', roles: ['hr_admin'] },
  pss: { email: 'mgr.pss@voltake.com', nama: 'Manager PSS', staff_id: 'VE40', department: 'PSS', roles: ['interviewer'], scope: '' },
  omp: { email: 'mgr.omp@voltake.com', nama: 'Manager OMP', staff_id: 'VE41', department: 'OMP', roles: ['interviewer'], scope: 'dept=OMP,Kejuruteraan' },
  staff: { email: 'ali@gmail.com', nama: 'Ali', staff_id: 'VE10', department: 'OMP', roles: ['staff'] },
};

async function call(gas, user, action, payload) {
  const body = JSON.stringify(await signEnvelope(HR_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };

const FORM = {
  nama: 'Ahmad bin Ali', ic: '900101-14-5123', jantina: 'Lelaki', status_kahwin: 'Bujang', email: 'Ahmad@Gmail.com', tel_bimbit: '0123456789',
  alamat: 'No 1, Jalan Satu, 14200 Jawi', akademik: [{ dari: '2008', hingga: '2011', institusi: 'UiTM', kelulusan: 'Diploma Elektrik' }],
  pengalaman: [{ dari: '2012', hingga: '2020', majikan: 'TNB', jawatan: 'Technician' }],
  kecemasan_nama: 'Aminah', kecemasan_hubungan: 'Ibu', kecemasan_jenis_tel: 'Bimbit', kecemasan_tel: '019-8765432',
  pernah_disabit: 'Tidak', gaji_dijangka: 3500, kebenaran_semak: 'Ya', ref1_nama: 'En Rahman', ref1_tel: '0111234567',
  tandatangan: { data: PNG_B64 }, gambar: { data: PNG_B64 }, resume: { data: PDF_B64 },
  consent: { setuju: true, versi: 'PN-HR-2026-11' },
};

async function withPositions(gas) {
  ok(await call(gas, U.hr, 'savePosition', { jawatan: 'Technician PSS', department: 'PSS', lokasi: 'Jawi' }));
  ok(await call(gas, U.hr, 'savePosition', { jawatan: 'Jurutera Elektrik', department: 'OMP' }));
  ok(await call(gas, U.hr, 'savePosition', { jawatan: 'Kerani (tutup)', department: 'HR', aktif: false }));
  const pos = ok(await call(gas, U.pub, 'listOpenPositions', {})).jawatan;
  return Object.fromEntries(pos.map((p) => [p.department, p.position_id]));
}

test('setupSystem: tab, Settings, folder HR, trigger retention harian', () => {
  const gas = setupHrGas();
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), ['Applicants', 'AuditLog', 'Interviews', 'Positions', 'Settings', '_Counters']);
  gas.ctx.setupSystem();
  assert.deepEqual(gas.triggers.map((t) => [t.handler, t.everyDays, t.hour]), [['dailyRetention', 1, 2]]);
  const base = gas.ctx.DriveApp.getFolderById('hr-root').folders.find((f) => f.name === 'HR');
  assert.deepEqual(base.folders.map((f) => f.name).sort(), ['Forms', 'Photos', 'Resumes', 'Signatures']);
  const h = gas.spreadsheet.getSheetByName('Applicants').header();
  assert.ok(!h.includes('socso') && !h.includes('kwsp'), 'KWSP/SOCSO tidak dikumpul (Q-09)');
});

test('Jawatan (F-13): borang awam nampak jawatan aktif sahaja (medan terhad); nama unik; tarikh tutup', async () => {
  const gas = setupHrGas();
  const ids = await withPositions(gas);
  const pub1 = ok(await call(gas, U.pub, 'listOpenPositions', {}));
  assert.deepEqual(pub1.jawatan.map((p) => p.jawatan).sort(), ['Jurutera Elektrik', 'Technician PSS']);
  assert.equal(pub1.consent_version, 'PN-HR-2026-11');
  assert.ok(!('bil_pemohon' in pub1.jawatan[0]) && !('created_by' in pub1.jawatan[0]));
  assert.equal((await call(gas, U.hr, 'savePosition', { jawatan: 'technician pss', department: 'PSS' })).status, 409);
  ok(await call(gas, U.hr, 'savePosition', { position_id: ids.PSS, jawatan: 'Technician PSS', department: 'PSS', tarikh_tutup: '2020-01-01' }));
  assert.equal(ok(await call(gas, U.pub, 'listOpenPositions', {})).jawatan.length, 1, 'tarikh tutup lepas = tutup');
  assert.equal((await call(gas, U.pub, 'listPositions', {})).status, 403);
  assert.equal((await call(gas, U.pss, 'savePosition', { jawatan: 'X', department: 'PSS' })).status, 403);
});

test('Hantar permohonan (F-10): consent wajib + versi, validasi, IC -> tarikh lahir, fail ke Drive peribadi, emel HR tanpa data peribadi', async () => {
  const gas = setupHrGas();
  const ids = await withPositions(gas);
  const F = { ...FORM, position_id: ids.PSS };
  assert.equal((await call(gas, U.pub, 'submitApplication', { ...F, consent: undefined })).status, 400);
  assert.equal((await call(gas, U.pub, 'submitApplication', { ...F, consent: { setuju: true, versi: 'lama' } })).status, 400);
  assert.equal((await call(gas, U.pub, 'submitApplication', { ...F, website: 'http://spam' })).status, 400, 'honeypot');
  for (const [k, v] of [['ic', '900101'], ['ic', '901301145123'], ['email', 'bukan-emel'], ['tel_bimbit', '12345'], ['jantina', 'X'], ['akademik', []], ['tandatangan', undefined], ['kebenaran_semak', '']]) {
    assert.equal((await call(gas, U.pub, 'submitApplication', { ...F, [k]: v })).status, 400, k);
  }
  assert.equal((await call(gas, U.pub, 'submitApplication', { ...F, pernah_disabit: 'Ya' })).status, 400, 'penerangan wajib bila Ya');
  assert.equal((await call(gas, U.pub, 'submitApplication', { ...F, resume: { data: PNG_B64 } })).status, 400, 'resume mesti PDF');
  assert.equal((await call(gas, U.pub, 'submitApplication', { ...F, position_id: 'POS-2099-999' })).status, 400, 'jawatan ditutup');
  const r = ok(await call(gas, U.pub, 'submitApplication', { ...F, status: 'Diterima', department: 'HR', catatan_hr: 'hack' }));
  assert.match(r.app_no, /^APP-\d{4}-00001$/);
  assert.deepEqual(Object.keys(r).sort(), ['app_no', 'jawatan']);
  const row = gas.spreadsheet.getSheetByName('Applicants').rows()[0];
  assert.deepEqual([row.status, row.department, row.catatan_hr, row.ic, row.dob, row.email, row.tel_bimbit, row.created_by],
    ['Baru', 'PSS', '', '900101145123', '1990-01-01', 'ahmad@gmail.com', '012-3456789', 'public'], 'medan HR tak boleh diisi dari borang');
  assert.equal(row.consent_version, 'PN-HR-2026-11');
  assert.ok(row.consent_at && row.ip_hash === 'iphash123');
  const hrFolder = gas.ctx.DriveApp.getFolderById('hr-root').folders.find((f) => f.name === 'HR');
  assert.deepEqual(hrFolder.folders.map((f) => [f.name, f.files.length]).sort(), [['Forms', 0], ['Photos', 1], ['Resumes', 1], ['Signatures', 1]]);
  const mail = gas.mails.at(-1);
  assert.equal(mail.to, 'hr@example.test');
  assert.ok(mail.body.includes(r.app_no) && !mail.body.includes('Ahmad') && !mail.body.includes('900101'));
  // berganda: IC + jawatan sama masih aktif
  const dup = await call(gas, U.pub, 'submitApplication', F);
  assert.equal(dup.status, 409);
  assert.ok(!dup.error.includes('APP-'), 'no. rujukan tidak didedahkan');
  // jawatan sendiri (sistem lama: "Taip Jawatan Anda")
  const lain = ok(await call(gas, U.pub, 'submitApplication', { ...FORM, ic: '950505075555', position_id: '', jawatan_lain: 'Pemandu' }));
  assert.equal(gas.spreadsheet.getSheetByName('Applicants').rows()[1].department, '');
  assert.equal(lain.jawatan, 'Pemandu');
});

test('Interviewer (F-12): department sendiri sahaja (walaupun API terus); IC dimask; tiada jenayah/alamat/rujukan/tandatangan', async () => {
  const gas = setupHrGas();
  const ids = await withPositions(gas);
  const a = ok(await call(gas, U.pub, 'submitApplication', { ...FORM, position_id: ids.PSS, pernah_disabit: 'Ya', disabit_penerangan: 'Saman trafik' }));
  const b = ok(await call(gas, U.pub, 'submitApplication', { ...FORM, ic: '880808088888', position_id: ids.OMP }));
  const lain = ok(await call(gas, U.pub, 'submitApplication', { ...FORM, ic: '970707077777', position_id: '', jawatan_lain: 'Pemandu' }));
  const asPss = ok(await call(gas, U.pss, 'listApplicants', {}));
  assert.deepEqual(asPss.pemohon.map((x) => x.app_no), [a.app_no], 'skop kosong = department staf (PSS)');
  assert.equal(asPss.pemohon[0].ic_mask, '******-**-5123');
  assert.ok(!JSON.stringify(asPss).includes('900101'));
  assert.deepEqual(ok(await call(gas, U.omp, 'listApplicants', {})).pemohon.map((x) => x.app_no), [b.app_no], 'skop dept=OMP');
  for (const [act, p] of [['getApplicant', { app_no: b.app_no }], ['getFile', { app_no: b.app_no, jenis: 'resume' }], ['saveInterview', { app_no: b.app_no }], ['getApplicant', { app_no: lain.app_no }]]) {
    assert.equal((await call(gas, U.pss, act, p)).status, 404, act + ' luar skop');
  }
  assert.ok(gas.spreadsheet.getSheetByName('AuditLog').rows().some((x) => x.tindakan === 'FORBIDDEN' && x.email === 'mgr.pss@voltake.com'));
  const d = ok(await call(gas, U.pss, 'getApplicant', { app_no: a.app_no }));
  for (const k of ['ic', 'pernah_disabit', 'disabit_penerangan', 'alamat', 'email', 'tel_bimbit', 'ref1', 'kecemasan_nama', 'catatan_hr']) assert.ok(!(k in d) || d[k] === undefined, k + ' tak patut ada');
  assert.ok(!JSON.stringify(d).includes('Saman trafik'));
  assert.equal(d.akademik[0].kelulusan, 'Diploma Elektrik');
  assert.equal(ok(await call(gas, U.pss, 'getFile', { app_no: a.app_no, jenis: 'resume' })).mime, 'application/pdf');
  assert.equal((await call(gas, U.pss, 'getFile', { app_no: a.app_no, jenis: 'tandatangan' })).status, 403);
  assert.equal((await call(gas, U.pss, 'updateApplicant', { app_no: a.app_no, status: 'Diterima' })).status, 403);
  assert.equal((await call(gas, U.staff, 'listApplicants', {})).status, 403);
  // HR nampak semua, penuh
  const full = ok(await call(gas, U.hr, 'getApplicant', { app_no: a.app_no }));
  assert.deepEqual([full.ic, full.pernah_disabit, full.disabit_penerangan, full.ref1.nama], ['900101145123', 'Ya', 'Saman trafik', 'En Rahman']);
  assert.equal(ok(await call(gas, U.hr, 'listApplicants', {})).pemohon.length, 3);
});

test('Penilaian interview: markah 1-5 setiap kriteria, satu setiap interviewer (dikemas kini), HR nampak semua', async () => {
  const gas = setupHrGas();
  const ids = await withPositions(gas);
  const a = ok(await call(gas, U.pub, 'submitApplication', { ...FORM, position_id: ids.OMP }));
  const M = { teknikal: 4, pengalaman: 3, komunikasi: 5, sikap: 4, kesesuaian: 4 };
  assert.equal((await call(gas, U.omp, 'saveInterview', { app_no: a.app_no, markah: { ...M, sikap: 6 }, cadangan: 'Teruskan' })).status, 400);
  assert.equal((await call(gas, U.omp, 'saveInterview', { app_no: a.app_no, markah: M, cadangan: 'Mungkin' })).status, 400);
  let r = ok(await call(gas, U.omp, 'saveInterview', { app_no: a.app_no, markah: M, cadangan: 'Teruskan', catatan: 'Baik' }));
  assert.equal(r.penilaian[0].purata, 4);
  r = ok(await call(gas, U.omp, 'saveInterview', { app_no: a.app_no, markah: { ...M, teknikal: 5 }, cadangan: 'Simpan' }));
  assert.equal(r.penilaian.length, 1, 'dikemas kini, bukan baris baharu');
  assert.equal(r.penilaian[0].cadangan, 'Simpan');
  ok(await call(gas, U.hr, 'saveInterview', { app_no: a.app_no, markah: M, cadangan: 'Tolak' }));
  assert.equal(ok(await call(gas, U.hr, 'getApplicant', { app_no: a.app_no })).penilaian.length, 2);
  assert.equal(ok(await call(gas, U.omp, 'getApplicant', { app_no: a.app_no })).penilaian.length, 1, 'interviewer nampak penilaian sendiri');
  assert.equal(ok(await call(gas, U.omp, 'listApplicants', {})).pemohon[0].dinilai_saya, true);
});

test('HR kemas kini (F-11): status, department, catatan, kiraan tukar tarikh interview (sistem lama), audit', async () => {
  const gas = setupHrGas();
  const ids = await withPositions(gas);
  const a = ok(await call(gas, U.pub, 'submitApplication', { ...FORM, position_id: ids.PSS }));
  assert.equal((await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, status: 'Lulus' })).status, 400);
  let r = ok(await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, status: 'Temuduga Dijadualkan', tarikh_interview: '2026-12-01', catatan_hr: 'Calon kuat' }));
  assert.deepEqual([r.status, r.tarikh_interview, r.interview_tukar], ['Temuduga Dijadualkan', '2026-12-01', 0], 'set kali pertama tak dikira');
  r = ok(await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, tarikh_interview: '2026-12-03' }));
  r = ok(await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, tarikh_interview: '2026-12-05' }));
  assert.equal(r.interview_tukar, 2);
  r = ok(await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, department: 'OMP' }));
  assert.deepEqual(ok(await call(gas, U.pss, 'listApplicants', {})).pemohon, [], 'dipindah ke OMP: hilang dari PSS');
  assert.equal(ok(await call(gas, U.omp, 'listApplicants', {})).pemohon.length, 1);
  const log = gas.spreadsheet.getSheetByName('AuditLog').rows().filter((x) => x.tindakan === 'UPDATE_APPLICANT').map((x) => x.butiran);
  assert.ok(log.some((x) => /status Baru -> Temuduga Dijadualkan/.test(x)) && log.some((x) => /tukar #2/.test(x)));
  assert.ok(!log.join(' ').includes('Calon kuat'), 'isi catatan tidak dalam audit');
});

test('Retention (F-14): Ditolak -> retention 12 bulan; trigger harian anonimkan bila tamat; fail dibuang; HR boleh anonimkan atas permintaan', async () => {
  const gas = setupHrGas();
  const ids = await withPositions(gas);
  const a = ok(await call(gas, U.pub, 'submitApplication', { ...FORM, position_id: ids.PSS }));
  const b = ok(await call(gas, U.pub, 'submitApplication', { ...FORM, ic: '880808088888', position_id: ids.PSS }));
  let r = ok(await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, status: 'Ditolak' }));
  const exp = new Date(Date.now() + 8 * 3600e3); exp.setUTCMonth(exp.getUTCMonth() + 12);
  assert.equal(r.retention_until, exp.toISOString().slice(0, 10));
  r = ok(await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, status: 'Disaring' }));
  assert.equal(r.retention_until, '', 'bukan status akhir: retention dikosongkan');
  ok(await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, status: 'Ditolak' }));
  assert.equal(gas.ctx.dailyRetention(), 0, 'belum tamat');
  const sh = gas.spreadsheet.getSheetByName('Applicants');
  const h = sh.header();
  const rowA = sh.data.find((x) => x[h.indexOf('app_no')] === a.app_no);
  rowA[h.indexOf('retention_until')] = '2020-01-01';
  const files = ['photo_file_id', 'signature_file_id', 'resume_file_id'].map((k) => rowA[h.indexOf(k)]);
  assert.equal(gas.ctx.dailyRetention(), 1);
  const anon = sh.rows().find((x) => x.app_no === a.app_no);
  assert.deepEqual([anon.nama, anon.ic, anon.email, anon.alamat, anon.anonymised, anon.jawatan, anon.status], ['Dianonimkan', '', '', '', 'TRUE', 'Technician PSS', 'Ditolak']);
  files.forEach((f) => assert.equal(gas.drive.files.get(f).trashed, true));
  assert.equal((await call(gas, U.hr, 'updateApplicant', { app_no: a.app_no, status: 'Baru' })).status, 409);
  assert.equal((await call(gas, U.hr, 'anonymiseApplicant', { app_no: b.app_no })).status, 400, 'sebab wajib');
  ok(await call(gas, U.hr, 'anonymiseApplicant', { app_no: b.app_no, sebab: 'Permintaan pemohon (PDPA)' }));
  assert.equal(sh.rows().find((x) => x.app_no === b.app_no).anonymised, 'TRUE');
});

test('Import sistem lama: jawatan dari Setup; pemohon AKTIF sahaja; socso/kwsp tak dibawa; ulang = dilangkau', () => {
  const gas = setupHrGas();
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  gas.spreadsheet.insertSheet('IMPORT_SETUP').data = [['Jawatan', 'Department'], ['Technician', 'PSS'], ['Kerani', 'HR']];
  gas.spreadsheet.insertSheet('IMPORT_PERMOHONAN').data = [
    ['Tarikh_Mohon', 'jawatan', 'nama', 'ic', 'dob', 'jantina', 'statusKahwin', 'email', 'telBimbit', 'telRumah', 'alamat', 'akademikStr', 'pengalamanStr', 'socso', 'kwsp', 'namaKecemasan', 'hubunganKecemasan', 'jenisTelKecemasan', 'telKecemasan', 'jenayah', 'alasanJenayah', 'gaji', 'ref1Nama', 'ref1Jawatan', 'ref1Syarikat', 'ref1Tel', 'ref2Nama', 'ref2Jawatan', 'ref2Syarikat', 'ref2Tel', 'semak', 'Link_Gambar', 'Link_PDF', 'ID', 'Department', 'Status', 'Tarikh_Interview', 'Catatan_HR', 'Interview_Tukar'],
    [new Date('2026-10-01T02:00:00Z'), 'Technician', 'Ali Lama', '900101145123', '', 'Lelaki', 'Bujang', 'ali@x.com', '0123456789', '', 'Jawi', 'SPM 2008', 'TNB 2010-2020', 'S123', 'K456', 'Mak', 'Ibu', 'Bimbit', '0198765432', 'Tidak', '', '3000', '', '', '', '', '', '', '', '', 'Ya', `https://drive.google.com/file/d/${id}/view`, `https://drive.google.com/file/d/${id}/view`, 'APP-1', 'PSS', 'Temuduga Dijadualkan', '15/12/2026', 'ok', 1],
    [new Date('2026-09-01T02:00:00Z'), 'Kerani', 'Siti Lama', '920202025555', '', 'Perempuan', '', 's@x.com', '0111111111', '', 'Jawi', '', '', '', '', 'Ayah', 'Bapa', 'Bimbit', '0122222222', 'Tidak', '', '', '', '', '', '', '', '', '', '', 'Ya', '', '', 'APP-2', 'HR', 'Ditolak', '', '', 0],
  ];
  const r = gas.ctx.importOldData();
  assert.deepEqual([...r.ditambah], ['Jawatan: 2', 'Pemohon aktif: 1 (dilangkau status akhir: 1)']);
  const rows = gas.spreadsheet.getSheetByName('Applicants').rows();
  assert.equal(rows.length, 1);
  const a = rows[0];
  assert.deepEqual([a.nama, a.status, a.tarikh_interview, a.dob, a.tel_bimbit, a.photo_file_id, a.borang_lama_file_id, a.consent_version, a.interview_tukar],
    ['Ali Lama', 'Temuduga Dijadualkan', '2026-12-15', '1990-01-01', '012-3456789', id, id, 'sistem-lama', 1]);
  assert.match(a.catatan_hr, /ID lama: APP-1/);
  assert.ok(!JSON.stringify(a).includes('S123') && !JSON.stringify(a).includes('K456'), 'socso/kwsp tidak dibawa');
  assert.equal(a.position_id, gas.spreadsheet.getSheetByName('Positions').rows()[0].position_id);
  assert.deepEqual([...gas.ctx.importOldData().ditambah], ['Jawatan: 0', 'Pemohon aktif: 0 (dilangkau status akhir: 1)']);
});

// ---------------------------------------------------------------- gateway /public/api
function pubReq(path, body, { method = 'POST', origin = ORIGIN, xvp = true, ip = '9.9.9.9' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  if (xvp) headers['X-VP'] = '1';
  return new Request(`${ORIGIN}/public/api/${path}`, { method, headers, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
}
const pctx = (req, e) => ctx(req, e, { path: new URL(req.url).pathname.replace('/public/api/', '').split('/') });

function pubEnv(gas, extra = {}) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === 'https://gas.test/hr') return new Response(gas.ctx.doPost({ postData: { contents: init.body } }).getContent());
    if (u.startsWith('https://challenges.cloudflare.com/')) {
      const token = init.body.get('response');
      return new Response(JSON.stringify({ success: token === 'TS-OK-xyz' }));
    }
    return orig(url, init);
  };
  return { calls, e: env({ GAS_URL_HR: 'https://gas.test/hr', MODULE_SECRET_HR: HR_SECRET, TURNSTILE_SECRET: 'ts-secret', TURNSTILE_SITE_KEY: '0xSITE', ...extra }), restore: () => { globalThis.fetch = orig; } };
}

test('/public/api: whitelist action, CSRF, Turnstile wajib, user "public" dari server, config site key', async () => {
  installCaches();
  const gas = setupHrGas();
  const ids = await withPositions(gas);
  const { e, calls, restore } = pubEnv(gas);
  try {
    let res = await pub.onRequest(pctx(pubReq('config', null, { method: 'GET' }), e));
    assert.deepEqual(await res.json(), { turnstile_site_key: '0xSITE' });
    res = await pub.onRequest(pctx(pubReq('hr/listOpenPositions', {}), e));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.jawatan.length, 2);
    for (const p of ['hr/listApplicants', 'hr/updateApplicant', 'claimpro/listMyClaims', 'access/getAccess', 'hr']) {
      assert.equal((await pub.onRequest(pctx(pubReq(p, {}), e))).status, 404, p);
    }
    assert.equal((await pub.onRequest(pctx(pubReq('hr/listOpenPositions', {}, { origin: 'https://jahat.example' }), e))).status, 403);
    assert.equal((await pub.onRequest(pctx(pubReq('hr/listOpenPositions', {}, { xvp: false }), e))).status, 403);
    const F = { ...FORM, position_id: ids.PSS };
    res = await pub.onRequest(pctx(pubReq('hr/submitApplication', F), e));
    assert.equal(res.status, 400, 'tiada token Turnstile');
    res = await pub.onRequest(pctx(pubReq('hr/submitApplication', { ...F, turnstile: 'gagal' }), e));
    assert.equal(res.status, 400);
    res = await pub.onRequest(pctx(pubReq('hr/submitApplication', { ...F, turnstile: 'TS-OK-xyz' }), e));
    assert.equal(res.status, 200, await res.clone().text());
    assert.match((await res.json()).data.app_no, /^APP-/);
    const env1 = JSON.parse(calls.filter((c) => c.url === 'https://gas.test/hr').at(-1).init.body);
    assert.deepEqual(env1.data ? JSON.parse(env1.data).user.roles : null, ['public']);
    assert.ok(!JSON.stringify(env1).includes('TS-OK-xyz'), 'token Turnstile tidak dihantar ke Apps Script');
    // Turnstile tanpa secret = ditutup
    const noTs = pubEnv(gas, { TURNSTILE_SECRET: '' });
    assert.equal((await pub.onRequest(pctx(pubReq('hr/submitApplication', { ...F, turnstile: 'TS-OK-xyz' }), noTs.e))).status, 503);
    noTs.restore();
    // dev-bypass hanya untuk localhost
    const dev = pubEnv(gas, { TURNSTILE_SECRET: 'dev-bypass' });
    assert.equal((await pub.onRequest(pctx(pubReq('hr/submitApplication', { ...F, ic: '850505055555' }), dev.e))).status, 503, 'dev-bypass ditolak di domain sebenar');
    dev.restore();
  } finally {
    restore();
  }
});

test('/public/api: had 10 hantaran / 10 minit / IP -> 429', async () => {
  installCaches();
  const gas = setupHrGas();
  const { e, restore } = pubEnv(gas);
  try {
    let last;
    for (let i = 0; i < 11; i++) last = await pub.onRequest(pctx(pubReq('hr/submitApplication', { turnstile: 'gagal' }, { ip: '7.7.7.7' }), e));
    assert.equal(last.status, 429);
    assert.equal((await pub.onRequest(pctx(pubReq('hr/submitApplication', { turnstile: 'gagal' }, { ip: '8.8.8.8' }), e))).status, 400, 'IP lain tak terjejas');
  } finally {
    restore();
  }
});
