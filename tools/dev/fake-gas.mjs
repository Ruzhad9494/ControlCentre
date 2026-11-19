// tools/dev/fake-gas.mjs - pelayan Apps Script palsu untuk dev/ujian tempatan SAHAJA.
// Jalankan kod .gs sebenar (apps/access/gas) atas Sheet dalam memori.
//
//   node tools/dev/fake-gas.mjs [port]
//
// Kemudian dalam .dev.vars (jangan commit): ACCESS_GAS_URL=http://127.0.0.1:<port>/access,
// GAS_URL_COSTCALC=http://127.0.0.1:<port>/costcalc, secret ujian dari tools/test/helpers.mjs
// Seed: superadmin + beberapa staf ujian (lihat bawah). Data hilang bila pelayan berhenti.
import http from 'node:http';
import { setupAccessGas, addStaff, addAccess, ACCESS_SECRET, setupCostCalcGas, setRates } from '../test/helpers.mjs';

const port = Number(process.argv[2] || 9100);
const gas = setupAccessGas();
addStaff(gas, { staff_id: 'VE0200', email: 'hr.ujian@voltake.com', nama: 'Siti HR', department: 'HR', designation: 'HR Executive' });
addAccess(gas, 'hr.ujian@voltake.com', 'hr', 'hr_admin');
addAccess(gas, 'hr.ujian@voltake.com', 'compliance', 'hr_admin');
addAccess(gas, 'hr.ujian@voltake.com', 'claimpro', 'staff,admin');
addStaff(gas, { staff_id: 'VE0300', email: 'tech.ujian@gmail.com', nama: 'Ali Technician', department: 'OMP', designation: 'Technician' });
addAccess(gas, 'tech.ujian@gmail.com', 'claimpro', 'staff');
addAccess(gas, 'tech.ujian@gmail.com', 'gwr', 'technician', { skop: 'dept=OMP' });
// Cost Calculator (Fasa 2A): Commercial, PSS, OMP -> user; ketua Commercial -> admin
addStaff(gas, { staff_id: 'VE0400', email: 'com.ujian@voltake.com', nama: 'Aina Commercial', department: 'COMMERCIAL', designation: 'Executive' });
addAccess(gas, 'com.ujian@voltake.com', 'costcalc', 'user');
addStaff(gas, { staff_id: 'VE0401', email: 'ketua.com@voltake.com', nama: 'Ketua Commercial', department: 'COMMERCIAL', designation: 'Head of Commercial' });
addAccess(gas, 'ketua.com@voltake.com', 'costcalc', 'admin');
addStaff(gas, { staff_id: 'VE0402', email: 'pss.ujian@gmail.com', nama: 'Chong PSS', department: 'PSS', designation: 'Engineer' });
addAccess(gas, 'pss.ujian@gmail.com', 'costcalc', 'user');
// Modul ClaimPro + Cost Calculator "aktif" supaya kad boleh ditekan dalam ujian
const mods = gas.spreadsheet.getSheetByName('Modules');
const h = mods.header();
mods.data.forEach((r, i) => { if (i > 0 && ['claimpro', 'costcalc'].includes(r[h.indexOf('module_id')])) r[h.indexOf('status')] = 'aktif'; });

const cc = setupCostCalcGas();
if (!process.argv.includes('--tanpa-kadar')) {
  // Kadar UJIAN rekaan, bukan kadar syarikat
  setRates(cc, { ot_per_hour: 10, transport_per_km: 1, makan_per_day_pax: 20, homestay_per_night: 100, overnight_per_pax: 30 });
}
const projects = { '/access': gas, '/costcalc': cc };

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const target = projects[req.url];
    if (req.method !== 'POST' || !target) { res.writeHead(404).end(); return; }
    const out = target.ctx.doPost({ postData: { contents: body } });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(out.getContent());
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`fake-gas: http://127.0.0.1:${port}/access dan /costcalc (secret ujian: ${ACCESS_SECRET.slice(0, 4)}...)`);
});
