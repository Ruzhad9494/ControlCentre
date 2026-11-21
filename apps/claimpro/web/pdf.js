// Laporan PDF ClaimPro untuk dihantar kepada pengurusan atasan.
// Format DITIRU dari sistem lama (voltake-energy/claimpro index.html: exportAdminPDF / exportSingleAdminPDF):
//   tajuk biru "Laporan Terperinci Tuntutan Pekerja" (16pt, RGB 17,141,255), "Nama Pekerja", "Tarikh Janaan",
//   "Jumlah Kasar: RM x  |  Dibayar: RM y  |  Baki: RM z", jadual striped kepala biru
//   [ID / Tarikh, Tujuan / Kategori, Kasar, Dibayar, Baki, Status], satu muka surat setiap staf,
//   nama fail Laporan_Terperinci_HR_<YYYY-MM-DD>.pdf / Laporan_<Nama>_<YYYY-MM-DD>.pdf.
// Tambahan (diminta pemilik 20/11/2026): muka surat ringkasan di depan (ikut status, jenis, staf), gaya yang sama.
// Tarikh dipapar DD/MM/YYYY. Pustaka dihos sendiri (/shared/vendor), dimuat bila pengguna tekan PDF. TIADA emel staf.
import { formatDate } from '/shared/lib/format.js';

const VENDOR = ['/shared/vendor/jspdf.umd.min.js', '/shared/vendor/jspdf.plugin.autotable.min.js'];
const BLUE = [17, 141, 255];
const TEXT = [50, 50, 50];
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Gagal memuat pustaka PDF. Semak sambungan dan cuba lagi.'));
    document.head.append(s);
  });
}

export function loadJsPdf() {
  if (!loading) {
    loading = (async () => {
      if (!(window.jspdf && window.jspdf.jsPDF)) for (const src of VENDOR) await loadScript(src);
      const J = window.jspdf && window.jspdf.jsPDF;
      if (!J || typeof new J().autoTable !== 'function') throw new Error('Pustaka PDF tidak lengkap.');
      return J;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Jumlah dibayar setiap tuntutan: diterima staf (Dibayar) atau bayaran direkod syarikat. Ditolak tak dikira. */
export function amounts(c) {
  if (c.status === 'Ditolak') return { kasar: c.amaun_rm, dibayar: 0, baki: 0, kira: false };
  const dibayar = c.status === 'Dibayar' ? Number(c.received_amount_rm ?? c.amaun_rm) : Number(c.bayar_jumlah_rm || 0);
  return { kasar: c.amaun_rm, dibayar: round2(dibayar), baki: round2(Math.max(0, c.amaun_rm - dibayar)), kira: true };
}

/** Ringkasan ikut staf (sistem lama: getGroupedData). */
export function groupByStaff(claims) {
  const map = new Map();
  for (const c of claims) {
    const key = `${c.staff_id}|${c.staff_name}`;
    if (!map.has(key)) map.set(key, { staff_id: c.staff_id, staff_name: c.staff_name, department: c.department, tuntutan: [], bilangan: 0, kasar: 0, dibayar: 0, baki: 0 });
    const g = map.get(key);
    const a = amounts(c);
    g.tuntutan.push(c);
    if (a.kira) { g.bilangan++; g.kasar = round2(g.kasar + a.kasar); g.dibayar = round2(g.dibayar + a.dibayar); g.baki = round2(g.baki + a.baki); }
  }
  return [...map.values()].sort((a, b) => b.kasar - a.kasar || a.staff_name.localeCompare(b.staff_name));
}

function totals(claims) {
  return claims.reduce((t, c) => {
    const a = amounts(c);
    if (a.kira) { t.bilangan++; t.kasar = round2(t.kasar + a.kasar); t.dibayar = round2(t.dibayar + a.dibayar); t.baki = round2(t.baki + a.baki); }
    return t;
  }, { bilangan: 0, kasar: 0, dibayar: 0, baki: 0 });
}

const RM = (n) => 'RM ' + Number(n || 0).toFixed(2);   // sistem lama: "RM " + toFixed(2)
const TABLE = {
  theme: 'striped',
  headStyles: { fillColor: BLUE },
  styles: { fontSize: 9, cellPadding: 3 },
};
const stamp = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

/** Satu muka surat staf, sama seperti exportAdminPDF lama. */
function staffPage(doc, g) {
  doc.setFontSize(16);
  doc.setTextColor(...BLUE);
  doc.text('Laporan Terperinci Tuntutan Pekerja', 14, 15);
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(`Nama Pekerja: ${g.staff_name}`, 14, 23);
  doc.text(`Tarikh Janaan: ${formatDate(new Date())}`, 14, 29);
  doc.setFontSize(10);
  doc.text(`Jumlah Kasar: ${RM(g.kasar)}  |  Dibayar: ${RM(g.dibayar)}  |  Baki: ${RM(g.baki)}`, 14, 35);
  const rows = [...g.tuntutan].sort((a, b) => String(b.tarikh).localeCompare(String(a.tarikh)) || String(b.claim_id).localeCompare(String(a.claim_id)));
  doc.autoTable({
    ...TABLE,
    head: [['ID / Tarikh', 'Tujuan / Kategori', 'Kasar', 'Dibayar', 'Baki', 'Status']],
    body: rows.map((c) => {
      const a = amounts(c);
      return [`${c.claim_id}\n${formatDate(c.tarikh)}`, c.keterangan || c.jenis, RM(a.kasar), RM(a.dibayar), RM(a.baki), c.status];
    }),
    startY: 40,
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' } },
  });
}

/**
 * Laporan penuh: muka surat ringkasan + satu muka surat setiap staf (sistem lama: exportAdminPDF).
 * opts: { claims, tempoh, penapis: [teks], oleh, terpotong }
 */
export async function exportReportPdf({ claims, tempoh, penapis = [], oleh, terpotong }) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF();
  const groups = groupByStaff(claims);
  const t = totals(claims);
  doc.setFontSize(16);
  doc.setTextColor(...BLUE);
  doc.text('Laporan Tuntutan Pekerja', 14, 15);
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(`Tempoh (tarikh perbelanjaan): ${tempoh}`, 14, 23);
  doc.text(`Tarikh Janaan: ${formatDate(new Date())}   Disediakan oleh: ${oleh}`, 14, 29);
  doc.setFontSize(10);
  doc.text(`Bilangan: ${t.bilangan}  |  Jumlah Kasar: ${RM(t.kasar)}  |  Dibayar: ${RM(t.dibayar)}  |  Baki: ${RM(t.baki)}`, 14, 35);
  let y = 40;
  if (penapis.length) { doc.setFontSize(9); doc.text(`Penapis: ${penapis.join(', ')}`, 14, 40); y = 45; }
  if (terpotong) { doc.setFontSize(9); doc.setTextColor(180, 83, 9); doc.text('Nota: lebih 2,000 tuntutan; hanya 2,000 pertama dimasukkan.', 14, y); doc.setTextColor(...TEXT); y += 5; }
  const byStatus = {};
  const byJenis = {};
  claims.forEach((c) => {
    (byStatus[c.status] ||= { n: 0, rm: 0 }).n++;
    byStatus[c.status].rm = round2(byStatus[c.status].rm + c.amaun_rm);
    if (c.status === 'Ditolak') return;
    (byJenis[c.jenis] ||= { n: 0, rm: 0 }).n++;
    byJenis[c.jenis].rm = round2(byJenis[c.jenis].rm + c.amaun_rm);
  });
  const right = { 1: { halign: 'right' }, 2: { halign: 'right' } };
  doc.autoTable({ ...TABLE, startY: y, head: [['Status', 'Bilangan', 'Jumlah']], tableWidth: 110, columnStyles: right,
    body: ['Dihantar', 'Lulus', 'Dibayar', 'Ditolak'].filter((s) => byStatus[s]).map((s) => [s + (s === 'Ditolak' ? ' (tidak dikira)' : ''), byStatus[s].n, RM(byStatus[s].rm)]) });
  doc.autoTable({ ...TABLE, startY: doc.lastAutoTable.finalY + 6, head: [['Jenis tuntutan', 'Bilangan', 'Jumlah']], tableWidth: 110, columnStyles: right,
    body: Object.entries(byJenis).sort((a, b) => b[1].rm - a[1].rm).map(([j, v]) => [j, v.n, RM(v.rm)]) });
  doc.autoTable({ ...TABLE, startY: doc.lastAutoTable.finalY + 6,
    head: [['Nama Pekerja', 'No. Pekerja', 'Department', 'Bil.', 'Kasar', 'Dibayar', 'Baki']],
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    body: groups.map((g) => [g.staff_name, g.staff_id || '-', g.department || '-', g.bilangan, RM(g.kasar), RM(g.dibayar), RM(g.baki)]) });
  for (const g of groups) { doc.addPage(); staffPage(doc, g); }
  doc.save(`Laporan_Terperinci_HR_${stamp()}.pdf`);
}

/** Satu staf sahaja (sistem lama: exportSingleAdminPDF). */
export async function exportStaffPdf({ claims }) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF();
  const g = groupByStaff(claims)[0];
  if (!g) throw new Error('Tiada tuntutan untuk staf ini.');
  staffPage(doc, g);
  doc.save(`Laporan_${String(g.staff_name).replace(/\s+/g, '_')}_${stamp()}.pdf`);
}

/** CSV format sistem lama (exportAdminCSV / exportSingleAdminCSV): satu baris setiap tuntutan + baris JUMLAH KESELURUHAN setiap staf. */
export function oldFormatCsv(claims, { single = false } = {}) {
  const q = (v) => {
    let x = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(x)) x = "'" + x;        // elak formula injection dalam Excel
    return '"' + x.replace(/"/g, '""') + '"';
  };
  let out = 'Nama Pekerja,ID Tuntutan,Tarikh,Kategori/Tujuan,Kasar (RM),Dibayar (RM),Baki (RM),Status\n';
  for (const g of groupByStaff(claims)) {
    const rows = [...g.tuntutan].sort((a, b) => String(b.tarikh).localeCompare(String(a.tarikh)) || String(b.claim_id).localeCompare(String(a.claim_id)));
    for (const c of rows) {
      const a = amounts(c);
      out += [q(g.staff_name), q(c.claim_id), q(formatDate(c.tarikh)), q(c.keterangan || c.jenis), a.kasar.toFixed(2), a.dibayar.toFixed(2), a.baki.toFixed(2), q(c.status)].join(',') + '\n';
    }
    out += [q(g.staff_name), q('JUMLAH KESELURUHAN'), q(''), q(''), q(g.kasar.toFixed(2)), q(g.dibayar.toFixed(2)), q(g.baki.toFixed(2)), q('')].join(',') + '\n' + (single ? '' : '\n');
  }
  return out;
}
