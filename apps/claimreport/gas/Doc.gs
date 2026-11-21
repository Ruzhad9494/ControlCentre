/**
 * Doc.gs - jana PDF + Excel DO dari tab Template (F-70; PRD: "sama format dengan template sedia ada").
 *
 * Sama seperti generateDocument() lama: salin tab Template ke spreadsheet sementara, tambah baris item mulai
 * baris 17 (B no, C product code, D description, H qty, I unit), ganti token {{DO_NO}}, {{APAC_TICKET}},
 * {{FROM_*}}, {{TO_*}}, {{TOTAL_CARTON}}, {{TRUCK}}, {{NOTE}}, {{SIGNER}}, {{DATE}} (format dd/mm/yyyy),
 * eksport PDF (A4 portrait, fit width, lajur A-J) dan XLSX, kemudian buang spreadsheet sementara.
 * Beza: nilai disanitize sebelum ditulis (elak formula injection) dan hanya sel token diganti (formula lain
 * dalam template kekal); fail TIDAK dikongsi awam.
 */

function generateDocument_(ss, d, s) {
  var tab = s.template_tab || 'Template';
  var templateSheet = ss.getSheetByName(tab);
  if (!templateSheet) throw httpError_(503, 'Tab "' + tab + '" tiada dalam VP-ClaimReport. Salin tab Template dari Sheet DO lama (lihat docs/setup-fasa2g.md).');
  var itemRow = Number(s.item_row) > 0 ? Number(s.item_row) : 17;
  var lastCol = Number(s.print_last_col) > 0 ? Number(s.print_last_col) : 10;

  var temp = SpreadsheetApp.create('TEMP_DO_' + d.report_name);
  try {
    var sh = templateSheet.copyTo(temp);
    var def = temp.getSheetByName('Sheet1');
    if (def) temp.deleteSheet(def);
    sh.setName(String(d.report_name).replace(/[\[\]\*\/\\\?:]/g, '-').substring(0, 90));

    var items = d.items;
    var n = items.length;
    if (n > 1) {
      sh.insertRowsAfter(itemRow, n - 1);
      var src = sh.getRange(itemRow, 1, 1, sh.getMaxColumns());
      for (var i = 1; i < n; i++) src.copyTo(sh.getRange(itemRow + i, 1, 1, sh.getMaxColumns()));
    }
    for (var k = 0; k < n; k++) {
      var r = itemRow + k;
      sh.getRange(r, 2).setValue(k + 1);
      sh.getRange(r, 3).setValue(sanitizeForSheet(items[k].productCode));
      sh.getRange(r, 4).setValue(sanitizeForSheet(items[k].description));
      sh.getRange(r, 8).setValue(Number(items[k].qty));
      sh.getRange(r, 9).setValue(sanitizeForSheet(items[k].unit));
    }

    var tokens = {
      '{{DO_NO}}': d.do_no_all, '{{APAC_TICKET}}': d.apac,
      '{{FROM_NAME}}': d.from_name, '{{FROM_ADDRESS}}': d.from_address, '{{FROM_ATTN}}': d.from_attn, '{{FROM_TEL}}': d.from_tel,
      '{{TO_NAME}}': d.to_name, '{{TO_ADDRESS}}': d.to_address, '{{TO_ATTN}}': d.to_attn, '{{TO_TEL}}': d.to_tel,
      '{{TOTAL_CARTON}}': d.total_carton, '{{TRUCK}}': d.truck, '{{NOTE}}': d.note, '{{SIGNER}}': d.signer
    };
    var range = sh.getDataRange();
    var values = range.getValues();
    for (var y = 0; y < values.length; y++) {
      for (var x = 0; x < values[y].length; x++) {
        var v = values[y][x];
        if (typeof v !== 'string') continue;
        if (v === '{{DATE}}') {
          var cell = sh.getRange(y + 1, x + 1);
          cell.setValue(new Date(d.tarikh + 'T00:00:00'));
          cell.setNumberFormat('dd/mm/yyyy');
        } else if (Object.prototype.hasOwnProperty.call(tokens, v)) {
          sh.getRange(y + 1, x + 1).setValue(sanitizeForSheet(tokens[v]));
        }
      }
    }
    SpreadsheetApp.flush();

    var lastRow = Math.max(25, itemRow + n - 1 + 8);
    var id = temp.getId();
    var auth = { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
    var pdfUrl = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=pdf&gid=' + sh.getSheetId() +
      '&size=A4&portrait=true&fitw=true&top_margin=0.3&bottom_margin=0.3&left_margin=0.3&right_margin=0.3' +
      '&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=false&horizontal_alignment=CENTER&vertical_alignment=TOP' +
      '&r1=0&c1=0&r2=' + lastRow + '&c2=' + lastCol;
    var pdf = UrlFetchApp.fetch(pdfUrl, auth).getBlob().setName(d.report_name + '.pdf');
    var xlsx = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', auth).getBlob().setName(d.report_name + '.xlsx');
    var pdfId = doFolder_('PDF', d.tarikh).createFile(pdf).getId();
    var xlsxId;
    try { xlsxId = doFolder_('EXCEL', d.tarikh).createFile(xlsx).getId(); } catch (e) { trashFile_(pdfId); throw e; }
    return { pdf_file_id: pdfId, xlsx_file_id: xlsxId };
  } finally {
    try { DriveApp.getFileById(temp.getId()).setTrashed(true); } catch (e) { /* abaikan */ }
  }
}
