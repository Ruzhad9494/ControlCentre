// Senarai DO sebagai PDF (sistem lama index.html exportTableToPDF): jsPDF + autoTable, tajuk "GCC <Month> <Year>"
// ikut tarikh mula, lajur Tarikh / No DO / Truck / Penghantar / Penerima / Items / Cartons.
// Pustaka dihos sendiri (/shared/vendor), dimuat bila butang ditekan sahaja.
import { formatDate } from '/shared/lib/format.js';

const VENDOR = ['/shared/vendor/jspdf.umd.min.js', '/shared/vendor/jspdf.plugin.autotable.min.js'];
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
function loadJsPdf() {
  if (!loading) {
    loading = (async () => {
      if (!(window.jspdf && window.jspdf.jsPDF)) for (const src of VENDOR) await loadScript(src);
      return window.jspdf.jsPDF;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}
const cut = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || '-'));

export async function listPdf(title, rows) {
  if (!rows.length) throw new Error('Tiada DO dalam tapisan ini.');
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.autoTable({
    head: [['Tarikh', 'No DO', 'Truck', 'Penghantar', 'Penerima', 'Items', 'Cartons']],
    body: rows.map((r) => [formatDate(r.tarikh), r.do_no, r.truck || '-', cut(r.from_name, 25), cut(r.to_name, 25), String(r.item_count), r.total_carton || '0']),
    startY: 20,
    styles: { fontSize: 8, font: 'helvetica' },
    headStyles: { fillColor: [11, 37, 69] },
    margin: { top: 20 },
  });
  doc.save(`${title.replace(/ /g, '_')}_List.pdf`);
}
