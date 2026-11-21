/**
 * Schema.gs - struktur tab VP-ClaimReport (BSD 3.8) + seed (BSD 6).
 *
 * Dibina ikut "DO Generator" lama (gcc-voltake/claimreport: Appscript/Code.gs, form/index.html, index.html),
 * dibaca 21/11/2026. Sistem lama: borang -> isi tab "Template" (DO SUNGROW NEW) -> eksport PDF + Excel -> log ke
 * tab "Database"; dashboard "Operations Overview" baca CSV awam (Publish to web).
 *
 * Lama -> baharu:
 *   Database (No, Timestamp, DO No, RW, MA, ...)  -> DeliveryOrders (+ do_id tetap, created_by, padam lembut)
 *   No (max + 1)                                  -> bil (sama: max + 1, termasuk DO lama yang diimport)
 *   DO No = <RW|RC><no>[_MA<no>]_JD, banyak rujukan -> sama (akhiran dari Settings.do_suffix, lalai _JD)
 *   PDF/Excel "anyone with link"                  -> fail peribadi, dibuka melalui portal
 *   Delete (sesiapa, padam baris)                 -> admin sahaja, padam lembut dengan sebab (F-72)
 *   Edit (belum siap dalam sistem lama)           -> admin: semua; user: DO sendiri pada hari yang sama (BSD 4.2)
 *   FROM_PRESETS (JingDong, Koennen) dalam HTML   -> tab Parties (from/to), dikemas kini sendiri setiap DO
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

var DO_HEADERS = [
  'do_id', 'bil', 'report_name', 'do_no', 'do_no_all', 'ref_no', 'ma_no', 'tarikh', 'apac', 'apac_json',
  'from_name', 'from_address', 'from_attn', 'from_tel', 'to_name', 'to_address', 'to_attn', 'to_tel',
  'item_count', 'items_json', 'total_carton', 'jumlah_qty', 'truck', 'note', 'signer',
  'pdf_file_id', 'xlsx_file_id', 'refs_json', 'sumber', 'created_by_name'
];

var SCHEMA = {
  DeliveryOrders: DO_HEADERS.concat(AUDIT_FIELDS),
  Parties: ['party_id', 'jenis', 'nama', 'alamat', 'attn', 'tel'].concat(AUDIT_FIELDS),
  Settings: ['key', 'value', 'nota'],
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran'],
  _Counters: ['key', 'value']
};

var UNIT_OPTIONS = ['PCS', 'UNIT', 'SET', 'BOX', 'PALLET', 'KG'];   // sistem lama
var REF_TYPES = ['RW', 'RC'];

var SETTINGS_SEED = [
  ['do_suffix', '_JD', 'Akhiran No. DO (sistem lama: _JD ikut konvensyen Sungrow)'],
  ['template_tab', 'Template', 'Nama tab template DO (salin tab "Template" dari Sheet DO SUNGROW lama)'],
  ['item_row', '17', 'Baris item pertama dalam template (sistem lama: 17)'],
  ['print_last_col', '10', 'Lajur terakhir dicetak ke PDF (sistem lama: 10 = J)'],
  ['zip_max_fail', '80', 'Had bilangan PDF dalam satu Zip']
];

// Sistem lama: FROM_PRESETS dalam form/index.html
var PARTIES_SEED = [
  ['from', 'JingDong Logistics', '2, Metrohub 2 - Warehouse 2, 1st Floor, Lot 109363, Persiaran Bukit Raja Kayangan/KU5, Bandar Bukit Raja, 41050 Klang, Selangor', 'Prema Mahalingam', '6012-396 1012'],
  ['from', 'Koennen Technology Sdn Bhd', '29 Jalan 6/89B, Off, Jln Sungai Besi, 57100 Kuala Lumpur', 'Azila / Naim', '6013-2810042 / 6014-8141800']
];

var VALIDATIONS = [
  ['Parties', 'jenis', ['from', 'to']],
  ['DeliveryOrders', 'deleted', ['TRUE', 'FALSE']],
  ['Parties', 'deleted', ['TRUE', 'FALSE']]
];
