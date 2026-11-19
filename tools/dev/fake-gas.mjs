// tools/dev/fake-gas.mjs - pelayan Apps Script palsu untuk dev/ujian tempatan SAHAJA.
// Jalankan kod .gs sebenar (apps/access/gas) atas Sheet dalam memori.
//
//   node tools/dev/fake-gas.mjs [port]
//
// Kemudian dalam .dev.vars (jangan commit): ACCESS_GAS_URL=http://127.0.0.1:<port>/access
// Seed: superadmin + beberapa staf ujian (lihat bawah). Data hilang bila pelayan berhenti.
import http from 'node:http';
import { setupAccessGas, addStaff, addAccess, ACCESS_SECRET } from '../test/helpers.mjs';

const port = Number(process.argv[2] || 9100);
const gas = setupAccessGas();
addStaff(gas, { staff_id: 'VE0200', email: 'hr.ujian@voltake.com', nama: 'Siti HR', department: 'HR', designation: 'HR Executive' });
addAccess(gas, 'hr.ujian@voltake.com', 'hr', 'hr_admin');
addAccess(gas, 'hr.ujian@voltake.com', 'compliance', 'hr_admin');
addAccess(gas, 'hr.ujian@voltake.com', 'claimpro', 'staff,admin');
addStaff(gas, { staff_id: 'VE0300', email: 'tech.ujian@gmail.com', nama: 'Ali Technician', department: 'OMP', designation: 'Technician' });
addAccess(gas, 'tech.ujian@gmail.com', 'claimpro', 'staff');
addAccess(gas, 'tech.ujian@gmail.com', 'gwr', 'technician', { skop: 'dept=OMP' });
// Modul ClaimPro "aktif" supaya kad boleh ditekan dalam ujian
const mods = gas.spreadsheet.getSheetByName('Modules');
const h = mods.header();
mods.data.forEach((r, i) => { if (i > 0 && r[h.indexOf('module_id')] === 'claimpro') r[h.indexOf('status')] = 'aktif'; });

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.method !== 'POST' || req.url !== '/access') { res.writeHead(404).end(); return; }
    const out = gas.ctx.doPost({ postData: { contents: body } });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(out.getContent());
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`fake-gas access di http://127.0.0.1:${port}/access (ACCESS_SECRET ujian: ${ACCESS_SECRET.slice(0, 4)}...)`);
});
