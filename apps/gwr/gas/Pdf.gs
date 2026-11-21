/**
 * Pdf.gs - jana PDF GWR di SERVER (F-30 draf, F-32 final). IPD 2F.3.
 *
 * Susun atur DITIRU dari pratonton A4 sistem lama (gwrpss / gwrompnew index.html #export-container, html2pdf):
 *   Kepala      logo report (kiri, 85px) + "VOLTAKE ENERGY (PSS)" / no. pendaftaran / telefon / emel / laman web
 *               (kanan), garis hitam 2px di bawah. Muka 1 nama dengan (DEPT); muka lain "VOLTAKE ENERGY" (sama macam lama).
 *   Muka 1      "GROUND WORK REPORT FORM" (tengah, bergaris bawah)
 *               Kotak "PROJECT INFORMATION": grid 2 lajur Date | PO No., Quotation No. | MOS No., Client, Project Title,
 *               Location (penuh), Time In | Time Out, PIC Client | PIC Phone, PTW (penuh)
 *               Jadual "JOB DESCRIPTION / JOB DETAILS" (85%) | "REMARK" (15%), lencana merah SHUTDOWN LV/MV
 *               Kotak "UNRESOLVED ISSUE & ACTION TO BE TAKEN", kotak "MANPOWER / PAX" (Position | Pax | Name + Total)
 *   Muka 2      "VERIFICATIONS / PENGESAHAN": PIC CLIENT (kotak kuning "(Menunggu Tandatangan Klien)" pada draf,
 *               tandatangan klien pada final) dan PIC STAFF, Name / Position / Phone / Date
 *   Muka 3+     "SITE PHOTOS / LAMPIRAN GAMBAR", 6 gambar (2 x 3) dengan nombor & nota; "- Tiada lampiran gambar -"
 *   Kaki        "© <tahun> All Right Reserved by [Voltake]" dan "Page X of N"
 * Beza dari sistem lama: PDF dibina di server dari data Sheet (sistem lama: pelayar staf, dan PDF final = draf yang
 * dicop tandatangan oleh pelayar klien); tarikh dipapar DD/MM/YYYY (lama: YYYY-MM-DD mentah).
 * Penukar HTML->PDF Google tidak menyokong flex / grid, jadi susun atur guna jadual.
 */

function esc_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function nl2br_(v) { return esc_(v).replace(/\r?\n/g, '<br>'); }

/** YYYY-MM-DD[THH:MM] -> DD/MM/YYYY[ HH:MM]. */
function fmtDmy_(iso) {
  var s = String(iso || '');
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return s;
  return m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] + ':' + m[5] : '');
}

/** Masa masuk / keluar ikut sistem lama formatDateTimeCustom: "21/11/2026 ; 08:30 AM". */
function fmtTimeOld_(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(v || ''));
  if (!m) return String(v || '');
  var h = Number(m[4]);
  var ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return Number(m[3]) + '/' + Number(m[2]) + '/' + m[1] + ' ; ' + ('0' + h).slice(-2) + ':' + m[5] + ' ' + ap;
}

// Saiz dalam pt (sistem lama dalam px pada halaman 794px = 210mm: 1px = 0.75pt)
var PDF_CSS = [
  '@page { size: A4; margin: 10mm 14mm; }',
  'body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; font-size: 8.25pt; }',
  '.pg { page-break-after: always; }',
  '.pg.akhir { page-break-after: auto; }',
  'table { border-collapse: collapse; }',
  'table.hdr { width: 100%; border-bottom: 1.5pt solid #000; margin-bottom: 6pt; }',
  'table.hdr td { vertical-align: middle; padding: 0 0 4pt 0; }',
  'td.logo { width: 66pt; }',
  'td.logo img { width: 64pt; }',
  'td.co { text-align: right; padding-left: 11pt; }',
  '.cn { font-size: 9.75pt; font-weight: bold; margin-bottom: 1pt; }',
  '.reg { font-size: 6.75pt; font-weight: bold; margin-bottom: 2pt; }',
  '.ct { font-size: 6.75pt; color: #444; margin-bottom: 1pt; }',
  '.ct img { width: 7.5pt; height: 7.5pt; vertical-align: middle; }',
  'h1 { font-size: 11.25pt; font-weight: bold; text-align: center; text-decoration: underline; margin: 4pt 0 8pt; }',
  'table.box { width: 100%; border: 0.75pt solid #000; margin-bottom: 7.5pt; }',
  'td.st { background: #eeeeee; border-bottom: 0.75pt solid #000; padding: 3pt 6pt; font-weight: bold; font-size: 8.25pt; }',
  'table.grid { width: 100%; font-size: 10.5pt; }',
  'table.grid td { border-bottom: 0.75pt solid #cccccc; vertical-align: top; }',
  'td.l { width: 90pt; background: #f9f9f9; font-weight: bold; padding: 3.75pt 6pt; border-right: 0.75pt solid #eeeeee; }',
  'td.v { padding: 3.75pt 6pt; }',
  'td.v.mid { border-right: 0.75pt solid #cccccc; }',
  'table.jobs { width: 100%; font-size: 8.25pt; }',
  'table.jobs th { background: #eeeeee; border-bottom: 0.75pt solid #000; font-weight: bold; padding: 3pt 6pt; }',
  'table.jobs td { padding: 3pt 6pt; vertical-align: top; border-bottom: 0.75pt solid #cccccc; }',
  '.dc { width: 85%; border-right: 0.75pt solid #000; text-align: left; }',
  '.rc { width: 15%; text-align: center; font-weight: bold; }',
  '.sd { background: #c0392b; color: #ffffff; font-size: 6.75pt; font-weight: bold; padding: 1pt 4.5pt; }',
  'td.cb { padding: 6pt; font-size: 8.25pt; vertical-align: top; }',
  'table.mp { width: 100%; font-size: 8.25pt; }',
  'table.mp th { text-align: left; font-weight: bold; border-bottom: 0.75pt solid #000; padding: 1.5pt 4.5pt; font-size: 7.5pt; }',
  'table.mp td { padding: 2.25pt 4.5pt; border-bottom: 0.75pt solid #dddddd; vertical-align: top; }',
  '.mr { width: 22%; font-weight: bold; }',
  '.mx { width: 10%; text-align: center; }',
  '.mt { margin-top: 3pt; font-size: 7.5pt; font-weight: bold; text-align: right; }',
  'table.foot { width: 100%; border-top: 0.75pt solid #ecf0f1; margin-top: 12pt; font-size: 7.5pt; color: #7f8c8d; }',
  'table.foot td { padding-top: 7.5pt; }',
  '.vb { background: #000000; color: #ffffff; padding: 1.5pt 6pt; font-weight: bold; font-size: 6.75pt; }',
  'table.sign { width: 100%; margin-top: 22pt; }',
  'td.sc { width: 48%; border: 0.75pt solid #000; padding: 7.5pt; vertical-align: top; }',
  'td.gap { width: 4%; }',
  '.stt { text-align: center; font-weight: bold; text-decoration: underline; font-size: 9pt; margin-bottom: 7.5pt; }',
  'table.sb { width: 100%; height: 60pt; border: 0.75pt dashed #cccccc; background: #fafafa; margin-bottom: 6pt; }',
  'table.sb.tunggu { background: #fff9e6; border-color: #f1c40f; }',
  'table.sb td { text-align: center; vertical-align: middle; color: #dddddd; font-size: 7.5pt; height: 60pt; }',
  'table.sb img { max-height: 56pt; max-width: 95%; }',
  'table.sr { width: 100%; font-size: 8.25pt; margin-bottom: 4.5pt; }',
  'td.sl { width: 52pt; font-weight: bold; }',
  'td.sv { border-bottom: 0.75pt solid #cccccc; }',
  'table.ph { width: 100%; }',
  'td.slot { width: 50%; padding: 3pt; vertical-align: top; }',
  'table.pc { width: 100%; border: 0.75pt solid #555555; }',
  'td.pi { background: #f4f4f4; text-align: center; vertical-align: middle; height: 160pt; padding: 3pt; }',
  'td.pi img { max-width: 100%; max-height: 156pt; }',
  '.no { background: #2c3e50; color: #ffffff; font-size: 6.75pt; font-weight: bold; padding: 1.5pt 4.5pt; }',
  'td.pd { border-top: 0.75pt dashed #cccccc; font-size: 7.5pt; text-align: center; color: #2c3e50; font-weight: bold; padding: 3pt; }',
  '.kosong { text-align: center; color: #7f8c8d; padding-top: 38pt; font-style: italic; }'
].join('\n');

/** Logo report: Settings.report_logo_file_id (Drive) > <portal_url>/shared/ui/report-logo.png > logo lalai terbenam. */
function logoUri_(s) {
  if (s.report_logo_file_id) {
    var d = dataUri_(String(s.report_logo_file_id).trim());
    if (d) return d;
  }
  var base = String(s.portal_url || '').replace(/\/+$/, '');
  if (base) {
    var cache = null;
    try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
    var hit = cache && cache.get('gwr_logo');
    if (hit) return hit;
    try {
      var res = UrlFetchApp.fetch(base + '/shared/ui/report-logo.png', { muteHttpExceptions: true, followRedirects: true });
      var blob = res.getResponseCode() === 200 ? res.getBlob() : null;
      var bytes = blob ? blob.getBytes() : [];
      if (bytes.length > 100 && bytes.length < 70000 && /^image\//.test(String(blob.getContentType()))) {
        var uri = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(bytes);
        if (cache) { try { cache.put('gwr_logo', uri, 21600); } catch (e) { /* terlalu besar untuk cache */ } }
        return uri;
      }
    } catch (e) { /* guna logo lalai */ }
  }
  return REPORT_LOGO_DEFAULT;
}

function pdfHeader_(s, nama, logo) {
  return '<table class="hdr"><tr><td class="logo"><img src="' + logo + '"></td><td class="co">' +
    '<div class="cn">' + esc_(String(nama).toUpperCase()) + '</div>' +
    '<div class="reg">' + esc_(s.company_reg || '') + '</div>' +
    '<div class="ct"><img src="' + ICON_PHONE + '"> ' + esc_(s.company_phone || '') + '</div>' +
    '<div class="ct"><img src="' + ICON_MAIL + '"> ' + esc_(s.company_email || '') + '</div>' +
    '<div class="ct"><img src="' + ICON_WEB + '"> ' + esc_(s.company_web || '') + '</div>' +
    '</td></tr></table>';
}

function pdfFooter_(year, n, total) {
  return '<table class="foot"><tr><td>&copy; ' + esc_(year) + ' All Right Reserved by <span class="vb">Voltake</span></td>' +
    '<td style="text-align:right">Page ' + n + ' of ' + total + '</td></tr></table>';
}

/**
 * HTML laporan. opt: { final, images: [{uri, desc}], staffSigUri, clientSigUri, logo }.
 * final = true: kotak PIC CLIENT diisi tandatangan + nama / jawatan / telefon yang diisi klien semasa sahkan.
 */
function reportHtml_(r, s, opt) {
  var dept = String(r.dept);
  var co = s.company_name || 'Voltake Energy';
  var logo = opt.logo || REPORT_LOGO_DEFAULT;
  var jobs = parseArr_(r.job_items_json);
  var man = parseArr_(r.manpower_json);
  var date = fmtDmy_(dateStr_(r.tarikh));
  var year = String(dateStr_(r.tarikh) || isoStr_(r.created_at) || '').slice(0, 4) || Utilities.formatDate(new Date(), VP_TZ, 'yyyy');
  var images = opt.images || [];
  var imgPages = [];
  for (var i = 0; i < images.length; i += 6) imgPages.push(images.slice(i, i + 6));
  if (!imgPages.length) imgPages.push([]);
  var total = 2 + imgPages.length;

  var cell2 = function (k1, v1, k2, v2) {
    return '<tr><td class="l">' + esc_(k1) + '</td><td class="v mid">' + nl2br_(v1) + '</td><td class="l">' + esc_(k2) + '</td><td class="v">' + nl2br_(v2) + '</td></tr>';
  };
  var cell1 = function (k, v) { return '<tr><td class="l">' + esc_(k) + '</td><td class="v" colspan="3">' + nl2br_(v) + '</td></tr>'; };
  var jobRows = jobs.filter(function (j) { return j && (j.desc || j.remark); }).map(function (j) {
    var badge = j.shutdown ? '<span class="sd">SHUTDOWN' + (j.voltage ? ' ' + esc_(j.voltage) : '') + '</span>&nbsp; ' : '';
    return '<tr><td class="dc">' + badge + nl2br_(j.desc) + '</td><td class="rc">' + nl2br_(j.remark) + '</td></tr>';
  }).join('');
  if (!jobRows) jobRows = '<tr><td class="dc">&nbsp;</td><td class="rc">&nbsp;</td></tr>';

  var manHtml;
  if (man.length) {
    var pax = 0;
    var rows = man.map(function (m) {
      pax += parseInt(m.count, 10) || 0;
      return '<tr><td class="mr">' + esc_(m.role || '-') + '</td><td class="mx">' + esc_(m.count || '-') + '</td><td>' + esc_(m.names || '-') + '</td></tr>';
    }).join('');
    manHtml = '<table class="mp"><tr><th>POSITION</th><th class="mx">PAX</th><th>NAME</th></tr>' + rows + '</table>' +
      (pax ? '<div class="mt">Total: ' + pax + ' pax</div>' : '');
  } else {
    manHtml = nl2br_(textVal_(r.manpower));   // rekod lama: teks sahaja
  }

  var p1 = '<div class="pg">' + pdfHeader_(s, co + ' (' + dept + ')', logo) + '<h1>GROUND WORK REPORT FORM</h1>' +
    '<table class="box"><tr><td class="st">PROJECT INFORMATION</td></tr><tr><td style="padding:0"><table class="grid">' +
    cell2('Date', date, 'PO No.', r.po_number) + cell2('Quotation No.', r.quotation_number, 'MOS No.', r.mos_number) +
    cell1('Client', r.client_company) + cell1('Project Title', r.project_title) + cell1('Location', r.location) +
    cell2('Time In', fmtTimeOld_(r.time_in), 'Time Out', fmtTimeOld_(r.time_out)) + cell2('PIC Client', r.pic_name, 'PIC Phone', r.pic_phone) +
    cell1('PTW', r.ptw === 'YES' ? 'YES' : 'NO') + '</table></td></tr></table>' +
    '<table class="box"><tr><td style="padding:0"><table class="jobs"><tr><th class="dc">JOB DESCRIPTION / JOB DETAILS</th><th class="rc">REMARK</th></tr>' +
    jobRows + '</table></td></tr></table>' +
    '<table class="box"><tr><td class="st">UNRESOLVED ISSUE &amp; ACTION TO BE TAKEN</td></tr><tr><td class="cb" style="height:75pt">' + nl2br_(r.unresolved_issue) + '</td></tr></table>' +
    '<table class="box"><tr><td class="st">MANPOWER / PAX</td></tr><tr><td class="cb" style="height:37pt">' + manHtml + '</td></tr></table>' +
    pdfFooter_(year, 1, total) + '</div>';

  var sigBox = function (uri, waitText, wait) {
    return '<table class="sb' + (wait ? ' tunggu' : '') + '"><tr><td>' + (uri ? '<img src="' + uri + '">' : esc_(waitText)) + '</td></tr></table>';
  };
  var sigRow = function (k, v) { return '<table class="sr"><tr><td class="sl">' + esc_(k) + '</td><td class="sv">' + esc_(v || '') + '&nbsp;</td></tr></table>'; };
  var clientBox = opt.final
    ? sigBox(opt.clientSigUri, '(Ditandatangani)', false)
    : sigBox('', '(Menunggu Tandatangan Klien)', true);
  var p2 = '<div class="pg">' + pdfHeader_(s, co, logo) + '<h1>VERIFICATIONS / PENGESAHAN</h1>' +
    '<table class="sign"><tr><td class="sc"><div class="stt">PIC CLIENT</div>' + clientBox +
    sigRow('Name:', opt.final ? r.client_sign_name : r.sign_client_name) +
    sigRow('Position:', opt.final ? r.client_sign_position : r.sign_client_position) +
    sigRow('Phone:', opt.final ? r.client_sign_phone : r.sign_client_phone) +
    sigRow('Date:', date) + '</td><td class="gap"></td>' +
    '<td class="sc"><div class="stt">PIC STAFF</div>' + sigBox(opt.staffSigUri, '(Tandatangan Technician)', false) +
    sigRow('Name:', r.staff_name) + sigRow('Position:', r.staff_position) + sigRow('Date:', date) +
    '</td></tr></table>' + pdfFooter_(year, 2, total) + '</div>';

  var p3 = imgPages.map(function (pg, k) {
    var body;
    if (!pg.length) {
      body = '<div class="kosong">- Tiada lampiran gambar disertakan -</div>';
    } else {
      var cells = pg.map(function (im, j) {
        var no = k * 6 + j + 1;
        return '<td class="slot"><table class="pc"><tr><td class="pi"><div style="text-align:left"><span class="no">' + no + '</span></div>' +
          (im.uri ? '<img src="' + im.uri + '">' : '(gambar tiada)') + '</td></tr>' +
          '<tr><td class="pd">' + (esc_(im.desc || '') || '- Tiada Nota -') + '</td></tr></table></td>';
      });
      var rowsHtml = '';
      for (var c = 0; c < cells.length; c += 2) rowsHtml += '<tr>' + cells[c] + (cells[c + 1] || '<td class="slot"></td>') + '</tr>';
      body = '<table class="ph">' + rowsHtml + '</table>';
    }
    var last = k === imgPages.length - 1;
    return '<div class="pg' + (last ? ' akhir' : '') + '">' + pdfHeader_(s, co, logo) + '<h1>SITE PHOTOS / LAMPIRAN GAMBAR</h1>' + body +
      pdfFooter_(year, 3 + k, total) + '</div>';
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
    final: final, images: images, logo: logoUri_(s),
    staffSigUri: dataUri_(r.staff_signature_file_id),
    clientSigUri: final ? dataUri_(r.client_signature_file_id) : ''
  });
  var blob = Utilities.newBlob(html, 'text/html', r.report_id + '.html').getAs('application/pdf').setName(pdfName_(r, final ? 'Final' : 'Draft'));
  return storePdf_(blob, String(r.dept));
}

/**
 * ujiPdf(): jalankan dari editor untuk semak rupa PDF tanpa data sebenar. PDF contoh disimpan ke
 * VP-Files/GWR/PSS/PDF/<bulan> dan pautan dipapar dalam log. Padam fail itu selepas semak.
 */
function ujiPdf() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var s = settingsMap_(ss);
  var r = {
    report_id: 'GWR-PSS-UJI', dept: 'PSS', tarikh: todayIso_(), po_number: 'PO-UJI-001', quotation_number: 'QT-UJI', mos_number: 'MOS-UJI',
    client_company: 'Klien Ujian Sdn Bhd', project_title: 'Ujian susun atur PDF', location: 'Jawi, Pulau Pinang',
    time_in: todayIso_() + 'T08:30', time_out: todayIso_() + 'T17:00', pic_name: 'En. Ujian', pic_phone: '0123456789', ptw: 'YES',
    job_items_json: JSON.stringify([{ desc: 'Servis RMU 11kV', remark: 'Siap', shutdown: true, voltage: 'MV' }, { desc: 'Bersih panel', remark: '', shutdown: false }]),
    unresolved_issue: 'Tiada', manpower_json: JSON.stringify([{ role: 'Engineer', count: '1', names: 'Staf Ujian' }, { role: 'Technician', count: '2', names: 'A, B' }]),
    sign_client_name: 'En. Ujian', sign_client_position: 'Site Manager', sign_client_phone: '0123456789',
    staff_name: 'Staf Ujian', staff_position: 'Engineer', image_ids_json: '[]', created_at: nowIso_()
  };
  var html = reportHtml_(r, s, { final: false, images: [], logo: logoUri_(s) });
  var blob = Utilities.newBlob(html, 'text/html', 'uji.html').getAs('application/pdf').setName('UJI_GWR_Draft.pdf');
  var id = storePdf_(blob, 'PSS');
  Logger.log('PDF ujian: https://drive.google.com/file/d/' + id + '/view');
  return id;
}
