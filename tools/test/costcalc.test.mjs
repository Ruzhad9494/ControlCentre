// Ujian Fasa 2A: Cost Calculator.
// 1. Regresi: Calc.gs + web/calc.js == formula sistem lama (dipindah dari calculate() lama, tanpa kadar sebenar)
// 2. Apps Script costcalc: role, skop dept, kadar di server, kira semula di server, audit
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { calcEstimate as webCalc } from '../../apps/costcalculator/web/calc.js';
import { signEnvelope } from '../../functions/_lib/sign.js';
import { setupCostCalcGas, setRates, COSTCALC_SECRET, COSTCALC_DIR } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { createGas, loadGas } = require('./gas-mock.js');

// ------------------------------------------------------------------ formula lama (rujukan)
// Disalin dari voltake-energy/costcalculator index.html calculate(), bahagian 2, 6 dan 7.
// Input DOM diganti dengan objek. TIADA kadar sebenar di sini.
function oldCalculate(i, r) {
  let days = 0;
  let nights = 0;
  if (i.start && i.end) {
    const start = new Date(i.start);
    const end = new Date(i.end);
    if (end >= start) {
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      days = diffDays + 1;
      nights = diffDays;
    }
  } else if (i.start) {
    days = 1;
    nights = 0;
  }
  const totalSubcont = i.subkon.reduce((a, b) => a + b, 0);
  const costOT = i.staff * i.ot * r.ot;
  const costTransport = i.mileage * i.transport * r.transport;
  const costMakan = days * i.staff * r.makan;
  const costHomestay = nights > 0 ? (i.homestay * nights * r.homestay) : 0;
  const costOvernight = nights * i.staff * r.overnight;
  const totalMobCost = costOT + costTransport + costMakan + costHomestay + costOvernight;
  const totalProjectCost = totalSubcont + totalMobCost;
  const marginAmount = i.po - totalProjectCost;
  const sst = i.po * (i.sst / 100);
  return { days, nights, totalMobCost, totalSubcont, totalProjectCost, marginAmount, sst, finalPo: i.po + sst };
}

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// PRNG berbiji supaya ujian boleh diulang
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function randomCase(rand) {
  const pick = (max, dp = 0) => Number((rand() * max).toFixed(dp));
  const base = Date.UTC(2026, 0, 1) + Math.floor(rand() * 700) * 864e5;
  const len = Math.floor(rand() * 12) - 1; // -1 = tamat sebelum mula
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const mode = rand();
  const start = mode < 0.1 ? '' : iso(base);
  const end = mode < 0.2 ? '' : iso(base + len * 864e5);
  return {
    start, end,
    staff: pick(20), transport: pick(5), ot: pick(40, 1), homestay: pick(5), mileage: pick(2000, 1),
    po: pick(200000, 2), sst: [0, 6, 8, 10][Math.floor(rand() * 4)],
    subkon: Array.from({ length: Math.floor(rand() * 4) }, () => pick(50000, 2)),
  };
}

function randomRates(rand) {
  return { ot: Number((rand() * 50).toFixed(2)), transport: Number((rand() * 2).toFixed(2)), makan: Number((rand() * 60).toFixed(2)), homestay: Number((rand() * 400).toFixed(2)), overnight: Number((rand() * 100).toFixed(2)) };
}

const toNew = (c) => ({ tarikh_mula: c.start, tarikh_tamat: c.end, staff: c.staff, transport_unit: c.transport, ot_jam: c.ot, homestay_unit: c.homestay, mileage_km: c.mileage, nilai_po_rm: c.po, sst_peratus: c.sst, subkon: c.subkon });
const ratesNew = (r) => ({ ot_per_hour: r.ot, transport_per_km: r.transport, makan_per_day_pax: r.makan, homestay_per_night: r.homestay, overnight_per_pax: r.overnight });

test('Regresi: 2,000 kes rawak - web/calc.js dan Calc.gs sama dengan formula lama', () => {
  const gas = loadGas(createGas({ props: {} }), COSTCALC_DIR);
  const rand = rng(20261119);
  for (let k = 0; k < 2000; k++) {
    const c = randomCase(rand);
    const r = randomRates(rand);
    const old = oldCalculate(c, r);
    for (const [name, out] of [['web', webCalc(toNew(c), ratesNew(r))], ['gas', gas.ctx.calcEstimate_(toNew(c), ratesNew(r))]]) {
      const ctx = `${name} kes ${k}: ${JSON.stringify(c)}`;
      assert.equal(out.hari, old.days, ctx);
      assert.equal(out.malam, old.nights, ctx);
      assert.equal(out.jumlah_mobilisasi, r2(old.totalMobCost), ctx);
      assert.equal(out.jumlah_subkon, r2(old.totalSubcont), ctx);
      assert.equal(out.jumlah_kos, r2(old.totalProjectCost), ctx);
      assert.equal(out.margin, r2(old.marginAmount), ctx);
      assert.equal(out.sst, r2(old.sst), ctx);
      assert.equal(out.po_akhir, r2(old.finalPo), ctx);
    }
  }
});

test('Contoh nilai lalai borang lama (4 staf, 2 transport, 15 jam OT, 1 homestay, 616 km, 3H2M)', () => {
  // Kadar ujian rekaan (bukan kadar syarikat). Kira tangan:
  // OT 4*15*10=600; transport 616*2*1=1232; makan 3*4*20=240; homestay 1*2*100=200; overnight 2*4*30=240 => 2512
  const out = webCalc(
    { tarikh_mula: '2026-11-19', tarikh_tamat: '2026-11-21', staff: 4, transport_unit: 2, ot_jam: 15, homestay_unit: 1, mileage_km: 616, nilai_po_rm: 10000, sst_peratus: 8, subkon: [3000, 1500] },
    { ot_per_hour: 10, transport_per_km: 1, makan_per_day_pax: 20, homestay_per_night: 100, overnight_per_pax: 30 });
  assert.deepEqual([out.hari, out.malam], [3, 2]);
  assert.equal(out.jumlah_mobilisasi, 2512);
  assert.equal(out.jumlah_kos, 7012);
  assert.equal(out.margin, 2988);
  assert.equal(out.margin_peratus, 29.88);
  assert.equal(out.sst, 800);
  assert.equal(out.po_akhir, 10800);
});

// ------------------------------------------------------------------ Apps Script costcalc
const TEST_RATES = { ot_per_hour: 10, transport_per_km: 1, makan_per_day_pax: 20, homestay_per_night: 100, overnight_per_pax: 30 };
const U = {
  com: { email: 'com@voltake.com', nama: 'Aina Commercial', staff_id: 'VE1', department: 'COMMERCIAL', roles: ['user'] },
  com2: { email: 'com2@voltake.com', nama: 'Badrul Commercial', staff_id: 'VE2', department: 'COMMERCIAL', roles: ['user'] },
  pss: { email: 'pss@gmail.com', nama: 'Chong PSS', staff_id: 'VE3', department: 'PSS', roles: ['user'] },
  head: { email: 'ketua@voltake.com', nama: 'Ketua Commercial', staff_id: 'VE4', department: 'COMMERCIAL', roles: ['admin'] },
  hr: { email: 'hr@voltake.com', nama: 'HR', staff_id: 'VE5', department: 'HR', roles: [] },
  viewer: { email: 'boss@voltake.com', nama: 'Boss', staff_id: 'VE6', department: 'MGMT', roles: ['viewer'] },
};
const FORM = { nama_projek: 'Danau Tok Uban', klien: 'SUNGROW', lokasi: 'Tanjung Malim', tarikh_mula: '2026-11-19', tarikh_tamat: '2026-11-21', staff: 4, transport_unit: 2, ot_jam: 15, homestay_unit: 1, mileage_km: 616, nilai_po_rm: 10000, sst_peratus: 8, subkon: [3000, 1500] };

async function call(gas, user, action, payload) {
  const body = JSON.stringify(await signEnvelope(COSTCALC_SECRET, action, payload, user));
  return JSON.parse(gas.ctx.doPost({ postData: { contents: body } }).getContent());
}

test('setupSystem: tab BSD 3.3, Rates di-seed dengan nilai KOSONG (tiada kadar dalam repo)', () => {
  const gas = setupCostCalcGas();
  assert.deepEqual([...gas.spreadsheet.sheets.keys()].sort(), ['AuditLog', 'Estimates', 'Rates', '_Counters']);
  const rates = gas.spreadsheet.getSheetByName('Rates').rows();
  assert.deepEqual(rates.map((r) => r.rate_key), ['ot_per_hour', 'transport_per_km', 'makan_per_day_pax', 'homestay_per_night', 'overnight_per_pax']);
  assert.ok(rates.every((r) => r.nilai_rm === ''), 'nilai kadar mesti kosong');
  assert.throws(() => loadGas(createGas({ props: { SPREADSHEET_ID: 'x', ENV: 'prod', MODULE_SECRET: COSTCALC_SECRET }, spreadsheetName: 'VP-STG-CostCalc' }), COSTCALC_DIR).ctx.setupSystem(), /Jangka "VP-CostCalc"/);
});

test('Kadar belum lengkap: simpan ditolak 409 dengan mesej jelas', async () => {
  const gas = setupCostCalcGas();
  const r = await call(gas, U.com, 'saveEstimate', FORM);
  assert.equal(r.status, 409);
  assert.match(r.error, /Kadar kos belum lengkap/);
  const g = await call(gas, U.com, 'getRates', {});
  assert.equal(g.data.lengkap, false);
});

test('Kadar: user tak boleh ubah (403); admin ubah, nilai lama direkod dalam AuditLog', async () => {
  const gas = setupCostCalcGas();
  let r = await call(gas, U.com, 'updateRates', { rates: [{ rate_key: 'ot_per_hour', nilai_rm: 99 }] });
  assert.equal(r.status, 403);
  r = await call(gas, U.head, 'updateRates', { rates: Object.entries(TEST_RATES).map(([k, v]) => ({ rate_key: k, nilai_rm: v })) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.lengkap, true);
  r = await call(gas, U.head, 'updateRates', { rates: [{ rate_key: 'ot_per_hour', nilai_rm: 12.5 }], sebab: 'Kadar baru 2027' });
  const log = gas.spreadsheet.getSheetByName('AuditLog').rows().filter((x) => x.tindakan === 'UPDATE_RATES');
  assert.match(log.at(-1).butiran, /ot_per_hour: 10 -> 12\.5/);
  assert.match(log.at(-1).butiran, /Kadar baru 2027/);
  r = await call(gas, U.head, 'updateRates', { rates: [{ rate_key: 'ot_per_hour', nilai_rm: -1 }] });
  assert.equal(r.status, 400);
  r = await call(gas, U.head, 'updateRates', { rates: [{ rate_key: 'rahsia', nilai_rm: 1 }] });
  assert.equal(r.status, 400);
});

test('Simpan: server kira semula (abaikan jumlah palsu dari browser), ID EST-YYYY-00001, snapshot kadar', async () => {
  const gas = setupCostCalcGas();
  setRates(gas, TEST_RATES);
  const r = await call(gas, U.com, 'saveEstimate', { ...FORM, jumlah_kos_rm: 1, margin_rm: 999999 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.data.estimate_id, /^EST-\d{4}-00001$/);
  assert.equal(r.data.jumlah_kos_rm, 7012);
  assert.equal(r.data.margin_rm, 2988);
  assert.equal(r.data.dibuat_oleh, 'Aina Commercial');
  const row = gas.spreadsheet.getSheetByName('Estimates').rows()[0];
  assert.equal(row.department, 'COMMERCIAL');
  assert.deepEqual(JSON.parse(row.rates_snapshot_json), TEST_RATES);
  const r2nd = await call(gas, U.com, 'saveEstimate', FORM);
  assert.match(r2nd.data.estimate_id, /-00002$/);
});

test('Skop dept (BSD 4.2): Commercial lain boleh baca, PSS tidak; hanya pemilik/admin boleh ubah', async () => {
  const gas = setupCostCalcGas();
  setRates(gas, TEST_RATES);
  const id = (await call(gas, U.com, 'saveEstimate', FORM)).data.estimate_id;
  await call(gas, U.pss, 'saveEstimate', { ...FORM, nama_projek: 'Projek PSS' });

  let r = await call(gas, U.com2, 'getEstimate', { estimate_id: id });
  assert.equal(r.ok, true, 'rakan dept boleh baca');
  assert.equal(r.data.boleh_ubah, false);
  assert.ok(!JSON.stringify(r.data).includes('com@voltake.com'), 'emel pencipta tidak didedah');

  r = await call(gas, U.pss, 'getEstimate', { estimate_id: id });
  assert.equal(r.status, 403, 'dept lain ditolak');
  r = await call(gas, U.pss, 'listEstimates', {});
  assert.deepEqual(r.data.map((x) => x.nama_projek), ['Projek PSS']);

  r = await call(gas, U.com2, 'saveEstimate', { ...FORM, estimate_id: id, nilai_po_rm: 1 });
  assert.equal(r.status, 403, 'rakan dept tak boleh ubah');

  r = await call(gas, U.head, 'listEstimates', {});
  assert.equal(r.data.length, 2, 'admin nampak semua');
  r = await call(gas, U.viewer, 'listEstimates', {});
  assert.equal(r.data.length, 2, 'viewer nampak semua');
  r = await call(gas, U.viewer, 'saveEstimate', FORM);
  assert.equal(r.status, 403, 'viewer baca sahaja');
  r = await call(gas, U.hr, 'listEstimates', {});
  assert.equal(r.status, 403, 'tiada role costcalc');
});

test('Muktamad dikunci untuk user; Duplicate buat Draf baru milik pemanggil dengan kadar semasa', async () => {
  const gas = setupCostCalcGas();
  setRates(gas, TEST_RATES);
  const id = (await call(gas, U.com, 'saveEstimate', { ...FORM, status: 'Muktamad' })).data.estimate_id;
  let r = await call(gas, U.com, 'saveEstimate', { ...FORM, estimate_id: id, staff: 10 });
  assert.equal(r.status, 409);

  setRates(gas, { ...TEST_RATES, ot_per_hour: 20 });
  r = await call(gas, U.com2, 'duplicateEstimate', { estimate_id: id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.status, 'Draf');
  assert.equal(r.data.milik_saya, true);
  assert.match(r.data.nama_projek, /\(salinan\)$/);
  assert.equal(r.data.jumlah_kos_rm, 7012 + 600, 'OT dikira dengan kadar baru');
  const orig = await call(gas, U.com, 'getEstimate', { estimate_id: id });
  assert.equal(orig.data.jumlah_kos_rm, 7012, 'estimate lama kekal');
  assert.equal(orig.data.rates.ot_per_hour, 10, 'snapshot kadar asal kekal');

  r = await call(gas, U.head, 'saveEstimate', { ...FORM, estimate_id: id, staff: 5, status: 'Muktamad' });
  assert.equal(r.ok, true, 'admin boleh ubah muktamad');
});

test('Padam: admin sahaja, sebab wajib, soft delete + AuditLog', async () => {
  const gas = setupCostCalcGas();
  setRates(gas, TEST_RATES);
  const id = (await call(gas, U.com, 'saveEstimate', FORM)).data.estimate_id;
  let r = await call(gas, U.com, 'deleteEstimate', { estimate_id: id, sebab: 'salah' });
  assert.equal(r.status, 403);
  r = await call(gas, U.head, 'deleteEstimate', { estimate_id: id });
  assert.equal(r.status, 400);
  r = await call(gas, U.head, 'deleteEstimate', { estimate_id: id, sebab: 'Duplikat' });
  assert.equal(r.ok, true);
  const row = gas.spreadsheet.getSheetByName('Estimates').rows()[0];
  assert.equal(row.deleted, 'TRUE');
  assert.equal((await call(gas, U.com, 'listEstimates', {})).data.length, 0);
});

test('Validasi input: nombor negatif, tarikh terbalik, teks panjang, formula injection', async () => {
  const gas = setupCostCalcGas();
  setRates(gas, TEST_RATES);
  for (const bad of [{ staff: -1 }, { mileage_km: 'abc' }, { tarikh_mula: '2026-11-21', tarikh_tamat: '2026-11-19' }, { nama_projek: 'x'.repeat(121) }, { nama_projek: '' }, { subkon: Array(21).fill(1) }, { tarikh_mula: '19/11/2026' }]) {
    const r = await call(gas, U.com, 'saveEstimate', { ...FORM, ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  const r = await call(gas, U.com, 'saveEstimate', { ...FORM, klien: '=IMPORTXML("http://x")' });
  assert.equal(r.ok, true);
  assert.equal(gas.spreadsheet.getSheetByName('Estimates').rows()[0].klien, `'=IMPORTXML("http://x")`);
  assert.equal(r.data.klien, '=IMPORTXML("http://x")');
});
