// Ujian Fasa 0: setupSystem() projek access (BSD 3.1 + 6).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createGas, loadGas } = require('./gas-mock');

const ROOT = path.resolve(__dirname, '..', '..');
const GAS_DIR = path.join(ROOT, 'apps', 'access', 'gas');
const SECRET = 'x'.repeat(64);

const BASE_PROPS = {
  SPREADSHEET_ID: 'stg-sheet',
  ROOT_FOLDER_ID: 'stg-folder',
  ENV: 'staging',
  ACCESS_SECRET: SECRET,
};
const SEED_PROPS = {
  SEED_SUPERADMIN_EMAIL: '  Admin.Ujian@Voltake.com ',
  SEED_SUPERADMIN_STAFF_ID: 'VE0001',
  SEED_SUPERADMIN_NAMA: 'Pentadbir Ujian',
};

function setup(props = {}, opts = {}) {
  const gas = loadGas(createGas({ props: { ...BASE_PROPS, ...props }, ...opts }), GAS_DIR);
  return gas;
}

test('cipta semua tab VP-Access dengan header ikut BSD 3.1', () => {
  const gas = setup(SEED_PROPS);
  gas.ctx.setupSystem();
  const expectTabs = ['Staff', 'Modules', 'UserAccess', 'AccessChangeLog', 'LoginLog', 'Settings', '_Counters'];
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), expectTabs.sort());

  const staff = gas.spreadsheet.getSheetByName('Staff');
  assert.deepEqual(staff.header().slice(0, 4), ['staff_id', 'email', 'jenis_emel', 'google_sub']);
  for (const f of ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason']) {
    assert.ok(staff.header().includes(f), 'Staff perlu medan audit ' + f);
  }
  assert.deepEqual(gas.spreadsheet.getSheetByName('LoginLog').header(), ['ts', 'email', 'hasil', 'ip_hash', 'user_agent']);
  for (const s of gas.spreadsheet.sheets.values()) assert.equal(s.frozen, 1, s.name + ' baris 1 mesti freeze');
});

test('seed 8 Modules sepadan dengan config/modules.json dan config/roles.json', () => {
  const gas = setup(SEED_PROPS);
  gas.ctx.setupSystem();
  const mods = gas.spreadsheet.getSheetByName('Modules').rows();
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'modules.json'), 'utf8')).modules;
  const roles = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'roles.json'), 'utf8')).modules;

  assert.equal(mods.length, 8);
  for (const c of cfg) {
    const m = mods.find((x) => x.module_id === c.module_id);
    assert.ok(m, 'Modul hilang dalam seed: ' + c.module_id);
    for (const k of ['nama', 'path', 'ikon', 'subtajuk', 'susunan']) assert.equal(String(m[k]), String(c[k]), `${c.module_id}.${k}`);
    assert.equal(m.roles_sah, roles[c.module_id].join(','), c.module_id + '.roles_sah');
    assert.equal(m.status, 'belum_live');
  }
});

test('superadmin di-seed dari Script Properties: emel dinormalkan, jenis_emel syarikat, akses *', () => {
  const gas = setup(SEED_PROPS);
  gas.ctx.setupSystem();
  const [staff] = gas.spreadsheet.getSheetByName('Staff').rows();
  assert.equal(staff.email, 'admin.ujian@voltake.com');
  assert.equal(staff.jenis_emel, 'syarikat');
  assert.equal(staff.status, 'aktif');
  assert.equal(staff.token_version, 1);
  assert.equal(staff.google_sub, '');
  assert.equal(staff.department, 'MGMT');
  assert.equal(staff.created_by, 'systems@voltake.com');

  const access = gas.spreadsheet.getSheetByName('UserAccess').rows();
  assert.equal(access.length, 1);
  assert.equal(access[0].module_id, '*');
  assert.equal(access[0].roles, 'superadmin');
});

test('emel Gmail diklasifikasi jenis_emel gmail', () => {
  const gas = setup({ ...SEED_PROPS, SEED_SUPERADMIN_EMAIL: 'someone@gmail.com' });
  gas.ctx.setupSystem();
  assert.equal(gas.spreadsheet.getSheetByName('Staff').rows()[0].jenis_emel, 'gmail');
});

test('tanpa SEED_SUPERADMIN_EMAIL: Staff kosong, ada amaran, boleh seed bila dijalankan semula', () => {
  const gas = setup();
  gas.ctx.setupSystem();
  assert.equal(gas.spreadsheet.getSheetByName('Staff').rows().length, 0);
  assert.ok(gas.logs.some((l) => l.includes('AMARAN')));

  Object.assign(gas.store, SEED_PROPS);
  gas.ctx.setupSystem();
  assert.equal(gas.spreadsheet.getSheetByName('Staff').rows().length, 1);
});

test('idempotent: jalan 3 kali tiada seed/trigger pendua, data sedia ada tak disentuh', () => {
  const gas = setup(SEED_PROPS);
  gas.ctx.setupSystem();
  const staff = gas.spreadsheet.getSheetByName('Staff');
  staff.data[1][staff.header().indexOf('nama')] = 'Nama Diubah Manual';

  gas.ctx.setupSystem();
  gas.ctx.setupSystem();
  assert.equal(staff.rows().length, 1);
  assert.equal(staff.rows()[0].nama, 'Nama Diubah Manual');
  assert.equal(gas.spreadsheet.getSheetByName('Modules').rows().length, 8);
  assert.equal(gas.spreadsheet.getSheetByName('Settings').rows().length, 5);
  assert.equal(gas.triggers.filter((t) => t.handler === 'monthlyInactiveReport').length, 1);
});

test('lajur yang hilang ditambah di hujung tanpa ubah lajur sedia ada', () => {
  const gas = setup(SEED_PROPS);
  const sh = gas.spreadsheet.insertSheet('LoginLog');
  sh.data[0] = ['ts', 'email', 'lajur_lama_custom'];
  sh.data[1] = ['2026-11-01', 'a@b.com', 'kekal'];
  gas.ctx.setupSystem();
  assert.deepEqual(sh.header(), ['ts', 'email', 'lajur_lama_custom', 'hasil', 'ip_hash', 'user_agent']);
  assert.equal(sh.rows()[0].lajur_lama_custom, 'kekal');
});

test('validasi dropdown dipasang pada department/status/jenis_emel/Modules.status', () => {
  const gas = setup(SEED_PROPS);
  gas.ctx.setupSystem();
  const staff = gas.spreadsheet.getSheetByName('Staff');
  const lists = staff.validations.map((v) => ({ col: staff.header()[v.col - 1], list: [...v.rule.list], allow: v.rule.allowInvalid }));
  const dept = lists.find((x) => x.col === 'department');
  assert.deepEqual(dept.list, ['HR', 'COMMERCIAL', 'PSS', 'OMP', 'ADMIN', 'ACCOUNT', 'STRATEGIC', 'MGMT', 'IT']);
  assert.equal(dept.allow, false);
  assert.deepEqual(lists.find((x) => x.col === 'status').list, ['aktif', 'tamat', 'gantung']);
  assert.deepEqual(lists.find((x) => x.col === 'jenis_emel').list, ['syarikat', 'gmail']);
  const mods = gas.spreadsheet.getSheetByName('Modules');
  assert.deepEqual([...mods.validations.find((v) => mods.header()[v.col - 1] === "status").rule.list], ['aktif', 'maintenance', 'belum_live']);
});

test('checkConfig gagal awal bila Script Properties kosong / lemah', () => {
  assert.throws(() => setup({ ACCESS_SECRET: '' }).ctx.setupSystem(), /ACCESS_SECRET/);
  assert.throws(() => setup({ ACCESS_SECRET: 'pendek' }).ctx.setupSystem(), /terlalu pendek/);
  assert.throws(() => setup({ ENV: 'dev' }).ctx.setupSystem(), /ENV mesti/);
  assert.throws(() => setup({ SPREADSHEET_ID: '' }).ctx.setupSystem(), /SPREADSHEET_ID/);
});

test('halang tulis ke spreadsheet salah: ENV=prod tapi Sheet VP-STG-Access', () => {
  const gas = setup({ ...SEED_PROPS, ENV: 'prod' }, { spreadsheetName: 'VP-STG-Access' });
  assert.throws(() => gas.ctx.setupSystem(), /Jangka "VP-Access"/);
  assert.equal(gas.spreadsheet.sheets.size, 0, 'tiada tab patut dicipta');
});

test('SEED_SUPERADMIN tak lengkap / tak sah ditolak', () => {
  assert.throws(() => setup({ SEED_SUPERADMIN_EMAIL: 'a@b.com' }).ctx.setupSystem(), /STAFF_ID/);
  assert.throws(() => setup({ ...SEED_PROPS, SEED_SUPERADMIN_EMAIL: 'bukan-emel' }).ctx.setupSystem(), /format emel/);
  assert.throws(() => setup({ ...SEED_PROPS, SEED_SUPERADMIN_DEPARTMENT: 'XYZ' }).ctx.setupSystem(), /DEPARTMENT/);
});

test('laporan bulanan: hanya staf aktif tak login > 60 hari, tanpa emel peribadi', () => {
  const gas = setup(SEED_PROPS);
  gas.ctx.setupSystem();
  const staff = gas.spreadsheet.getSheetByName('Staff');
  const h = staff.header();
  const row = (o) => h.map((k) => (k in o ? o[k] : ''));
  const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
  staff.data.push(row({ staff_id: 'VE0002', email: 'lama@gmail.com', nama: 'Lama', department: 'OMP', status: 'aktif', last_login_at: daysAgo(90), deleted: 'FALSE' }));
  staff.data.push(row({ staff_id: 'VE0003', email: 'baru@gmail.com', nama: 'Baru', department: 'OMP', status: 'aktif', last_login_at: daysAgo(5), deleted: 'FALSE' }));
  staff.data.push(row({ staff_id: 'VE0004', email: 'tamat@gmail.com', nama: 'Tamat', department: 'PSS', status: 'tamat', last_login_at: daysAgo(200), deleted: 'FALSE' }));

  const settings = gas.spreadsheet.getSheetByName('Settings');
  const hrRow = settings.data.findIndex((r) => r[0] === 'hr_report_email');
  settings.data[hrRow][1] = 'hr@voltake.com';

  const out = gas.ctx.monthlyInactiveReport();
  const ids = out.map((r) => r.staff_id).sort();
  assert.deepEqual(ids, ['VE0001', 'VE0002']); // VE0001 belum pernah login
  assert.equal(gas.mails.length, 1);
  assert.equal(gas.mails[0].to, 'hr@voltake.com');
  assert.ok(!gas.mails[0].body.includes('lama@gmail.com'), 'emel peribadi tak patut ada dalam laporan');
});
