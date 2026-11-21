/**
 * Pdf.gs - jana PDF GWR di SERVER (F-30 draf, F-32 final). IPD 2F.3.
 *
 * Susun atur ikut pratonton A4 sistem lama (index.html #export-container):
 *   Muka 1 "Ground Work Report Form": Project Information (Date, PO, Quotation, MOS, Client, Project Title, Location,
 *          Time In/Out, PIC Client, PIC Phone, PTW), jadual Job Description / Remark (tanda SHUTDOWN LV/MV),
 *          Unresolved Issue & Action, Manpower / Pax
 *   Muka 2 "Verifications / Pengesahan": PIC CLIENT (tandatangan + nama, jawatan, telefon, tarikh) dan PIC STAFF
 *   Muka 3+ gambar, 6 setiap muka, dengan keterangan
 * Sistem lama jana PDF di pelayar (html2pdf) dan PDF final dijana oleh pelayar KLIEN: boleh diubah. Kini HTML dibina
 * dari data dalam Sheet dan ditukar oleh Google (blob.getAs PDF). Gambar & tandatangan dibenam sebagai data URI.
 */

function esc_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function nl2br_(v) { return esc_(v).replace(/\n/g, '<br>'); }

function fmtDmy_(iso) {
  var s = String(iso || '');
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return s;
  return m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] + ':' + m[5] : '');
}

var PDF_CSS = [
  '@page { size: A4; margin: 12mm 14mm; }',
  'body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; margin: 0; }',
  '.pg { page-break-after: always; }',
  '.pg:last-child { page-break-after: auto; }',
  '.hdr { width: 100%; border-bottom: 3px solid #2c3e50; margin-bottom: 8px; }',
  '.hdr td { vertical-align: top; }',
  '.co { font-size: 15pt; font-weight: bold; color: #2c3e50; }',
  '.small { font-size: 8.5pt; color: #444; }',
  'h1 { text-align: center; font-size: 15pt; margin: 8px 0 10px; color: #2c3e50; text-transform: uppercase; }',
  '.sec { background: #2c3e50; color: #fff; font-weight: bold; padding: 4px 8px; margin-top: 10px; }',
  'table.info { width: 100%; border-collapse: collapse; }',
  'table.info td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }',
  'table.info td.l { width: 22%; background: #f1f3f5; font-weight: bold; }',
  'table.jobs { width: 100%; border-collapse: collapse; margin-top: 6px; }',
  'table.jobs th, table.jobs td { border: 1px solid #999; padding: 5px 6px; vertical-align: top; text-align: left; }',
  'table.jobs th { background: #f1f3f5; }',
  '.sd { color: #c0392b; font-weight: bold; }',
  '.box { border: 1px solid #999; padding: 6px 8px; min-height: 30px; }',
  'table.sign { width: 100%; border-collapse: collapse; margin-top: 10px; }',
  'table.sign td { width: 50%; border: 1px solid #999; padding: 8px; vertical-align: top; }',
  '.sigbox { height: 90px; text-align: center; border-bottom: 1px dashed #999; margin-bottom: 6px; }',
  '.sigbox img { max-height: 85px; max-width: 95%; }',
  '.wait { color: #999; padding-top: 34px; font-style: italic; }',
  '.ok { color: #1e8449; font-weight: bold; }',
  'table.img { width: 100%; border-collapse: collapse; }',
  'table.img td { width: 50%; border: 1px solid #ccc; padding: 4px; text-align: center; vertical-align: top; height: 75mm; }',
  'table.img img { max-width: 100%; max-height: 66mm; }',
  '.cap { font-size: 8.5pt; margin-top: 3px; }',
  '.foot { font-size: 8pt; color: #777; text-align: center; margin-top: 8px; }'
].join('\n');

function pdfHeader_(s, dept) {
  return '<table class="hdr"><tr><td><div class="co">' + esc_((s.company_name || 'Voltake Energy') + ' (' + dept + ')') + '</div>' +
    '<div class="small">' + esc_(s.company_reg || '') + '</div></td>' +
    '<td style="text-align:right" class="small">' + esc_(s.company_phone || '') + '<br>' + esc_(s.company_email || '') + '<br>' + esc_(s.company_web || '') + '</td></tr></table>';
}

/**
 * HTML laporan. final = true: blok PIC CLIENT diisi + cop "DISAHKAN". images: [{uri, desc}].
 */
function reportHtml_(r, s, opt) {
  var dept = String(r.dept);
  var jobs = parseArr_(r.job_items_json);
  var man = parseArr_(r.manpower_json);
  var row = function (k, v) { return '<tr><td class="l">' + esc_(k) + '</td><td>' + nl2br_(v || '-') + '</td></tr>'; };
  var jobRows = jobs.length ? jobs.map(function (j) {
    return '<tr><td>' + (j.shutdown ? '<span class="sd">[SHUTDOWN' + (j.voltage ? ' ' + esc_(j.voltage) : '') + ']</span> ' : '') + nl2br_(j.desc) + '</td><td>' + nl2br_(j.remark) + '</td></tr>';
  }).join('') : '<tr><td colspan="2">-</td></tr>';
  var manText = man.length ? man.map(function (m) { return esc_((m.role || '-') + ' | ' + (m.count || '-') + ' pax | ' + (m.names || '-')); }).join('<br>') : nl2br_(r.manpower || '-');
  var images = opt.images || [];
  var imgPages = [];
  for (var i = 0; i < images.length; i += 6) imgPages.push(images.slice(i, i + 6));
  var total = 2 + imgPages.length;
  var foot = function (n) { return '<div class="foot">&copy; ' + esc_(String(r.tarikh || '').slice(0, 4)) + ' Voltake &middot; ' + esc_(r.report_id) + ' &middot; Page ' + n + ' of ' + total + '</div>'; };

  var p1 = '<div class="pg">' + pdfHeader_(s, dept) + '<h1>Ground Work Report Form</h1>' +
    '<div class="sec">Project Information</div><table class="info">' +
    row('Report ID', r.report_id) + row('Date', fmtDmy_(dateStr_(r.tarikh))) + row('PO No.', r.po_number) + row('Quotation No.', r.quotation_number) +
    row('MOS No.', r.mos_number) + row('Client', r.client_company) + row('Project Title', r.project_title) + row('Location', r.location) +
    row('Time In', fmtDmy_(r.time_in)) + row('Time Out', fmtDmy_(r.time_out)) + row('PIC Client', r.pic_name) + row('PIC Phone', r.pic_phone) +
    row('PTW', r.ptw || 'NO') + row('Job Shutdown', r.job_shutdown || 'NO') + '</table>' +
    '<table class="jobs"><tr><th style="width:62%">Job Description / Job Details</th><th>Remark</th></tr>' + jobRows + '</table>' +
    '<div class="sec">Unresolved Issue &amp; Action To Be Taken</div><div class="box">' + nl2br_(r.unresolved_issue || '-') + '</div>' +
    '<div class="sec">Manpower / Pax</div><div class="box">' + manText + '</div>' + foot(1) + '</div>';

  var clientSig = opt.final
    ? (opt.clientSigUri ? '<img src="' + opt.clientSigUri + '">' : '') + '<div class="ok">DISAHKAN / APPROVED</div>'
    : '<div class="wait">(Menunggu Tandatangan Klien)</div>';
  var staffSig = opt.staffSigUri ? '<img src="' + opt.staffSigUri + '">' : '<div class="wait">(Tandatangan Staf)</div>';
  var p2 = '<div class="pg">' + pdfHeader_(s, dept) + '<h1>Verifications / Pengesahan</h1><table class="sign"><tr>' +
    '<td><b>PIC CLIENT</b><div class="sigbox">' + clientSig + '</div>' +
    'Name: ' + esc_(opt.final ? r.client_sign_name : r.sign_client_name) + '<br>Position: ' + esc_(opt.final ? r.client_sign_position : r.sign_client_position) +
    '<br>Phone: ' + esc_(opt.final ? r.client_sign_phone : r.sign_client_phone) + '<br>Date: ' + esc_(opt.final ? fmtDmy_(isoStr_(r.approved_at)) : '') + '</td>' +
    '<td><b>PIC STAFF</b><div class="sigbox">' + staffSig + '</div>' +
    'Name: ' + esc_(r.staff_name) + '<br>Position: ' + esc_(r.staff_position) + '<br>Date: ' + esc_(fmtDmy_(isoStr_(r.submitted_at))) + '</td>' +
    '</tr></table>' + foot(2) + '</div>';

  var p3 = imgPages.map(function (pg, k) {
    var cells = pg.map(function (im) { return '<td>' + (im.uri ? '<img src="' + im.uri + '">' : '(gambar tiada)') + '<div class="cap">' + esc_(im.desc || '') + '</div></td>'; });
    var rowsHtml = '';
    for (var c = 0; c < cells.length; c += 2) rowsHtml += '<tr>' + cells[c] + (cells[c + 1] || '<td></td>') + '</tr>';
    return '<div class="pg">' + pdfHeader_(s, dept) + '<h1>Site Photos / Gambar</h1><table class="img">' + rowsHtml + '</table>' + foot(3 + k) + '</div>';
  }).join('');

  return '<!doctype html><html><head><meta charset="utf-8"><style>' + PDF_CSS + '</style></head><body>' + p1 + p2 + p3 + '</body></html>';
}

function parseArr_(v) {
  try { var x = JSON.parse(String(unsanitize_(v || '[]'))); return Array.isArray(x) ? x : []; } catch (e) { return []; }
}

/** Nama fail ikut sistem lama (getDynamicFileName): <Lokasi>_<Klien>_<DDMMYYYY>_<Draft|Final>.pdf */
function pdfName_(r, type) {
  var loc = String(r.location || 'Location').split(',')[0].trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Location';
  var cli = String(r.client_company || 'Client').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Client';
  var d = dateStr_(r.tarikh);
  return loc + '_' + cli + '_' + (d ? d.slice(8, 10) + d.slice(5, 7) + d.slice(0, 4) : 'Date') + '_' + type + '.pdf';
}

/** Jana & simpan PDF. Pulang fileId. */
function buildPdf_(r, s, final) {
  var images = parseArr_(r.image_ids_json).map(function (im) { return { uri: dataUri_(im.id), desc: im.desc }; });
  var html = reportHtml_(r, s, {
    final: final, images: images,
    staffSigUri: dataUri_(r.staff_signature_file_id),
    clientSigUri: final ? dataUri_(r.client_signature_file_id) : ''
  });
  var blob = Utilities.newBlob(html, 'text/html', r.report_id + '.html').getAs('application/pdf').setName(pdfName_(r, final ? 'Final' : 'Draft'));
  return storePdf_(blob, String(r.dept));
}
