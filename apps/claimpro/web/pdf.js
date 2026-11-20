// Laporan PDF ClaimPro untuk dihantar kepada pengurusan atasan.
// Ikut sistem lama (voltake-energy/claimpro index.html: exportAdminPDF / exportSingleAdminPDF):
// jsPDF + autoTable, satu halaman setiap staf, lajur ID / Tarikh, Tujuan / Kategori, Kasar, Dibayar, Baki, Status.
// Tambahan: halaman ringkasan (ikut status, jenis, staf), penapis yang digunakan, "SULIT", nombor halaman.
// Pustaka dihos sendiri (/shared/vendor) dan hanya dimuat bila pengguna tekan PDF (CSP script-src 'self').
// TIADA emel staf dalam PDF.
import { formatRM, formatDate, formatDateTime } from '/shared/lib/format.js';

const VENDOR = ['/shared/vendor/jspdf.umd.min.js', '/shared/vendor/jspdf.plugin.autotable.min.js'];
const NAVY = [11, 37, 69];
const MUTED = [100, 116, 139];
const SESI = { siang: 'Siang', malam: 'Malam', 'siang+malam': 'Siang + Malam' };
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
      for (const src of VENDOR) await loadScript(src);
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

function header(doc, title, lines) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Voltake ClaimPro', 14, 14);
  doc.setFontSize(9);
  doc.text('SULIT', w - 14, 14, { align: 'right' });
  doc.setTextColor(...NAVY);
  doc.setFontSize(15);
  doc.text(title, 14, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(40, 40, 40);
  let y = 41;
  for (const l of lines) { doc.text(l, 14, y); y += 5.5; }
  return y + 2;
}

function statLine(doc, y, t) {
  const w = doc.internal.pageSize.getWidth() - 28;
  const cells = [['Bilangan', String(t.bilangan)], ['Jumlah kasar', formatRM(t.kasar)], ['Dibayar', formatRM(t.dibayar)], ['Baki', formatRM(t.baki)]];
  const cw = w / cells.length;
  cells.forEach(([k, v], i) => {
    const x = 14 + i * cw;
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, y, cw - 3, 16, 2, 2, 'S');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(k, x + 3, y + 5.5);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(v, x + 3, y + 12.5);
    doc.setFont('helvetica', 'normal');
  });
  return y + 22;
}

const TABLE = {
  theme: 'striped',
  headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
  styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' },
  margin: { left: 14, right: 14, top: 28 },
};
const R = { halign: 'right' };
/** Lajur nombor: isi DAN tajuk/jumlah sejajar kanan. */
function rightCols(...idx) {
  const columnStyles = Object.fromEntries(idx.map((i) => [i, R]));
  return { columnStyles, didParseCell: (d) => { if (idx.includes(d.column.index)) d.cell.styles.halign = 'right'; } };
}

function sectionTitle(doc, y, text) {
  if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 30; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(text, 14, y);
  doc.setFont('helvetica', 'normal');
  return y + 3;
}

function staffPage(doc, g, meta) {
  let y = header(doc, 'Laporan Terperinci Tuntutan Pekerja', [
    `Nama Pekerja: ${g.staff_name}   No. Pekerja: ${g.staff_id || '-'}   Department: ${g.department || '-'}`,
    `Tempoh: ${meta.tempoh}`,
    `Tarikh Janaan: ${meta.dijana}`,
  ]);
  y = statLine(doc, y, g);
  doc.autoTable({
    ...TABLE,
    startY: y,
    head: [['ID / Tarikh', 'Tujuan / Kategori', 'Kasar', 'Dibayar', 'Baki', 'Status']],
    body: g.tuntutan.map((c) => {
      const a = amounts(c);
      const kat = c.jenis + (c.sesi_makan ? ` (${SESI[c.sesi_makan] || c.sesi_makan})` : '') + (c.pax ? `, ${c.pax} pax` : '');
      const st = c.status + (c.separa && c.status === 'Lulus' ? ' (separa)' : '') + (c.beza_bayaran ? ' (beza)' : '');
      return [`${c.claim_id}\n${formatDate(c.tarikh)}`, `${c.keterangan}\n${kat}`, formatRM(a.kasar), a.kira ? formatRM(a.dibayar) : '-', a.kira ? formatRM(a.baki) : '-', st];
    }),
    foot: [['Jumlah', `${g.bilangan} tuntutan (tidak termasuk Ditolak)`, formatRM(g.kasar), formatRM(g.dibayar), formatRM(g.baki), '']],
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
    ...rightCols(2, 3, 4),
    columnStyles: { 0: { cellWidth: 30 }, 2: R, 3: R, 4: R, 5: { cellWidth: 24 } },
  });
}

function footer(doc, meta) {
  const n = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`SULIT - Voltake ClaimPro - dijana ${meta.dijana} oleh ${meta.oleh}`, 14, h - 8);
    doc.text(`Halaman ${i} / ${n}`, w - 14, h - 8, { align: 'right' });
  }
}

function stamp() {
  const d = new Date(Date.now() + 8 * 3600e3).toISOString();
  return d.slice(0, 10);
}

/**
 * Laporan penuh: halaman ringkasan + satu halaman setiap staf.
 * opts: { claims, tempoh, penapis: [teks], oleh, terpotong }
 */
export async function exportReportPdf({ claims, tempoh, penapis = [], oleh, terpotong }) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const meta = { tempoh, dijana: formatDateTime(new Date()), oleh };
  const groups = groupByStaff(claims);
  let y = header(doc, 'Laporan Tuntutan Pekerja', [
    `Tempoh (tarikh perbelanjaan): ${tempoh}`,
    penapis.length ? `Penapis: ${penapis.join(', ')}` : 'Penapis: semua jenis, semua status (kecuali Draf)',
    `Tarikh Janaan: ${meta.dijana}   Disediakan oleh: ${oleh}`,
  ]);
  y = statLine(doc, y, totals(claims));
  if (terpotong) {
    doc.setTextColor(180, 83, 9);
    doc.setFontSize(8.5);
    doc.text('Nota: data melebihi 2,000 tuntutan; hanya 2,000 pertama dimasukkan. Tapis tempoh lebih pendek.', 14, y);
    y += 6;
  }

  const byStatus = {};
  const byJenis = {};
  claims.forEach((c) => {
    (byStatus[c.status] ||= { n: 0, rm: 0 }).n++;
    byStatus[c.status].rm = round2(byStatus[c.status].rm + c.amaun_rm);
    if (c.status === 'Ditolak') return;
    (byJenis[c.jenis] ||= { n: 0, rm: 0 }).n++;
    byJenis[c.jenis].rm = round2(byJenis[c.jenis].rm + c.amaun_rm);
  });

  y = sectionTitle(doc, y + 2, 'Ikut status');
  doc.autoTable({ ...TABLE, startY: y, head: [['Status', 'Bilangan', 'Jumlah']], tableWidth: 110,
    body: ['Dihantar', 'Lulus', 'Dibayar', 'Ditolak'].filter((s) => byStatus[s]).map((s) => [s + (s === 'Ditolak' ? ' (tidak dikira)' : ''), byStatus[s].n, formatRM(byStatus[s].rm)]),
    ...rightCols(1, 2) });
  y = sectionTitle(doc, doc.lastAutoTable.finalY + 10, 'Ikut jenis tuntutan');
  doc.autoTable({ ...TABLE, startY: y, head: [['Jenis', 'Bilangan', 'Jumlah']], tableWidth: 110,
    body: Object.entries(byJenis).sort((a, b) => b[1].rm - a[1].rm).map(([j, v]) => [j, v.n, formatRM(v.rm)]),
    ...rightCols(1, 2) });
  y = sectionTitle(doc, doc.lastAutoTable.finalY + 10, 'Ringkasan ikut staf');
  doc.autoTable({ ...TABLE, startY: y,
    head: [['Nama', 'No. Pekerja', 'Department', 'Bil.', 'Kasar', 'Dibayar', 'Baki']],
    body: groups.map((g) => [g.staff_name, g.staff_id || '-', g.department || '-', g.bilangan, formatRM(g.kasar), formatRM(g.dibayar), formatRM(g.baki)]),
    ...rightCols(3, 4, 5, 6) });

  for (const g of groups) { doc.addPage(); staffPage(doc, g, meta); }
  footer(doc, meta);
  doc.save(`Laporan_ClaimPro_${stamp()}.pdf`);
}

/** Satu staf sahaja (sistem lama: exportSingleAdminPDF). */
export async function exportStaffPdf({ claims, tempoh, oleh }) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const meta = { tempoh, dijana: formatDateTime(new Date()), oleh };
  const g = groupByStaff(claims)[0];
  if (!g) throw new Error('Tiada tuntutan untuk staf ini.');
  staffPage(doc, g, meta);
  footer(doc, meta);
  const safe = String(g.staff_name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Staf';
  doc.save(`Laporan_${safe}_${stamp()}.pdf`);
}
