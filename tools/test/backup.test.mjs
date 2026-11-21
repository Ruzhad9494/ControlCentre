// Fasa 3: backup mingguan (BSD 8) dan audit perkongsian Drive (IPD 3.2) dalam projek Apps Script access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAccessGas } from './helpers.mjs';

const SHEET = 'application/vnd.google-apps.spreadsheet';

function addModuleSheets(gas, names) {
  return names.map((n) => gas.drive.root.createFile(new gas.MockBlob('', SHEET, 'VP-STG-' + n)));
}
const backupRoot = (gas) => gas.drive.root.folders.find((f) => f.name === 'VP-STG-Backup');
const setSetting = (gas, key, value) => {
  const st = gas.spreadsheet.getSheetByName('Settings');
  st.data.find((r) => r[0] === key)[1] = value;
};

test('setupSystem pasang trigger backup Ahad 2 pagi sekali sahaja + kunci Settings baru', () => {
  const gas = setupAccessGas();
  gas.ctx.setupSystem();
  const t = gas.triggers.filter((x) => x.handler === 'weeklyBackup');
  assert.equal(t.length, 1);
  assert.equal(t[0].weekDay, 'SUNDAY');
  assert.equal(t[0].hour, 2);
  const keys = gas.spreadsheet.getSheetByName('Settings').rows().map((r) => r.key);
  assert.ok(keys.includes('backup_report_email'));
});

test('weeklyBackup: salin semua Sheet VP-STG-* ke VP-STG-Backup/<tarikh>/, tiada pendua, emel jika ada masalah', () => {
  const gas = setupAccessGas();
  const mods = addModuleSheets(gas, ['CostCalc', 'ClaimPro', 'AMS', 'Compliance', 'HR', 'GWR', 'ClaimReport']);   // Voltrack belum ada
  gas.drive.root.createFile(new gas.MockBlob('', SHEET, 'VP-GWR'));          // production: TIDAK disalin semasa staging
  gas.drive.root.createFile(new gas.MockBlob('', 'text/plain', 'VP-STG-HR')); // bukan Sheet
  setSetting(gas, 'hr_report_email', 'hr@voltake.com');

  const r = gas.ctx.weeklyBackup();
  const root = backupRoot(gas);
  assert.ok(root, 'folder VP-STG-Backup dicipta sebelah VP-Files');
  assert.equal(gas.store.BACKUP_FOLDER_ID, root.id);
  const day = root.folders.find((f) => f.name === r.tarikh);
  assert.match(r.tarikh, /^\d{4}-\d{2}-\d{2}$/);
  const names = day.files.map((f) => f.getName()).sort();
  assert.equal(names.length, 8, names.join(', '));
  assert.ok(names.includes('VP-STG-Access (backup ' + r.tarikh + ')'));
  assert.ok(!names.some((n) => n.startsWith('VP-GWR')), 'Sheet production tak disentuh');
  assert.ok(day.files.every((f) => f.getSharingAccess() === 'PRIVATE'));
  assert.ok(day.files.some((f) => f.copyOf === mods[0].id));
  assert.equal(r.masalah.length, 1);
  assert.match(r.masalah[0], /VP-STG-Voltrack: tidak dijumpai/);
  assert.equal(gas.mails.length, 1);
  assert.equal(gas.mails[0].to, 'hr@voltake.com', 'kosong backup_report_email -> hr_report_email');

  // jalan semula hari sama: tiada salinan berganda
  gas.ctx.weeklyBackup();
  assert.equal(day.files.length, 8);
  assert.equal(root.folders.length, 1);
});

test('weeklyBackup: simpan 8 folder tarikh terakhir sahaja, folder lain tak disentuh', () => {
  const gas = setupAccessGas();
  addModuleSheets(gas, ['CostCalc', 'ClaimPro', 'AMS', 'Compliance', 'HR', 'GWR', 'ClaimReport', 'Voltrack']);
  gas.ctx.weeklyBackup();
  const root = backupRoot(gas);
  const old = ['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25', '2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22', '2026-03-01'];
  old.forEach((d) => root.createFolder(d));
  root.createFolder('Pulih manual');
  const r = gas.ctx.weeklyBackup();
  assert.deepEqual([...r.dibuang].sort(), ['2026-01-04', '2026-01-11']);
  assert.equal(r.masalah.length, 0);
  assert.equal(gas.mails.length, 0, 'tiada masalah: tiada emel');
  const alive = root.folders.filter((f) => !f.trashed).map((f) => f.name);
  assert.equal(alive.filter((n) => /^\d{4}-/.test(n)).length, 8);
  assert.ok(alive.includes('Pulih manual'));
});

test('semakPerkongsian: lapor pautan awam & individu; Betulkan tukar pautan ke PRIVATE sahaja', () => {
  const gas = setupAccessGas();
  const [hr] = addModuleSheets(gas, ['HR']);
  const files = gas.ctx.DriveApp.getFolderById('stg-folder');
  const gwr = files.createFolder('GWR');
  const img = gwr.createFile(new gas.MockBlob('x', 'image/jpeg', 'GWR-1_img.jpg'));
  img.setSharing('ANYONE_WITH_LINK', 'VIEW');
  hr.editors.push('pembantu@gmail.com');
  gwr.setSharing('DOMAIN_WITH_LINK', 'VIEW');
  files.createFile(new gas.MockBlob('x', 'image/png', 'selamat.png'));

  const r = gas.ctx.semakPerkongsian();
  const pautan = r.dapatan.filter((d) => d.jenis === 'pautan');
  assert.equal(pautan.length, 2);
  assert.ok(pautan.some((d) => d.laluan === 'VP-Files/GWR/GWR-1_img.jpg' && /ANYONE_WITH_LINK/.test(d.butiran)));
  assert.ok(pautan.every((d) => !d.dibetulkan));
  const ind = r.dapatan.filter((d) => d.jenis === 'individu');
  assert.equal(ind.length, 1);
  assert.match(ind[0].butiran, /pembantu@gmail\.com/);
  assert.equal(img.getSharingAccess(), 'ANYONE_WITH_LINK', 'mod lapor tak ubah apa-apa');

  const f = gas.ctx.semakPerkongsianBetulkan();
  assert.equal(f.dapatan.filter((d) => d.dibetulkan).length, 2);
  assert.equal(img.getSharingAccess(), 'PRIVATE');
  assert.equal(gwr.getSharingAccess(), 'PRIVATE');
  assert.deepEqual(hr.editors, ['pembantu@gmail.com'], 'individu hanya dilapor');
  const again = gas.ctx.semakPerkongsian();
  assert.equal(again.dapatan.filter((d) => d.jenis === 'pautan').length, 0);
  assert.ok(gas.logs.some((l) => l.includes('[INDIVIDU] VP-STG-HR (Sheet)')));
});

test('laporanSaizData: kira baris setiap tab, tanda AMARAN / PINDAH ikut TRD 7', () => {
  const gas = setupAccessGas();
  const hr = gas.ctx.SpreadsheetApp.create('VP-STG-HR');
  const app = hr.insertSheet('Applications');
  app.data = [['app_no'], ...Array.from({ length: 31000 }, (_, i) => ['A' + i])];
  const r = gas.ctx.laporanSaizData();
  const row = r.find((x) => x.sheet === 'VP-STG-HR' && x.tab === 'Applications');
  assert.equal(row.baris, 31000);
  assert.equal(row.tahap, 'AMARAN');
  assert.equal(r[0], row, 'tab terbesar dahulu');
  assert.ok(r.some((x) => x.sheet === 'VP-STG-Access' && x.tab === 'Staff' && x.tahap === 'OK'));
});
