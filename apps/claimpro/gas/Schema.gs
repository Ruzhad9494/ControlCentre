/**
 * Schema.gs - struktur tab VP-ClaimPro (BSD 3.6) + seed (BSD 6).
 * Tambahan atas BSD 3.6 (dicatat dalam BSD): Claims.staff_id, submitted_at, approved_by_name,
 * peringatan_at; tab Settings (emel pemberitahuan, URL portal).
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

var CLAIM_HEADERS = [
  'claim_id', 'staff_email', 'staff_id', 'staff_name', 'department', 'tarikh', 'jenis', 'pax', 'keterangan', 'amaun_rm',
  'receipt_file_id', 'status', 'submitted_at', 'approved_by', 'approved_by_name', 'approved_at', 'sebab_tolak',
  'received_date', 'received_amount_rm', 'received_proof_file_id', 'beza_bayaran', 'peringatan_at'
];

var SCHEMA = {
  ClaimTypes: ['jenis', 'had_rm', 'perlu_resit', 'aktif'].concat(AUDIT_FIELDS),
  Claims: CLAIM_HEADERS.concat(AUDIT_FIELDS),
  Approvals: ['id', 'claim_id', 'dari_status', 'ke_status', 'oleh_email', 'ts', 'catatan'],
  Settings: ['key', 'value', 'nota'],
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran'],
  _Counters: ['key', 'value']
};

var STATUSES = ['Draf', 'Dihantar', 'Lulus', 'Ditolak', 'Dibayar'];

// Senarai jenis AWAL daripada BSD 3.6 (cadangan, BUKAN dari sistem lama). Admin ClaimPro ubah di portal
// (Laporan > Jenis tuntutan): tambah/buang, tetapkan had RM dan sama ada resit wajib.
var TYPE_SEED = [
  // jenis,        perlu_resit
  ['Perjalanan',   true],
  ['Makan',        true],
  ['Perubatan',    true],
  ['Penginapan',   true],
  ['Lain-lain',    true]
];

var SETTINGS_SEED = [
  ['portal_url', '', 'Alamat portal untuk pautan dalam emel, contoh https://cc.voltake.com'],
  ['admin_notify_emails', '', 'Emel penerima "tuntutan baru" & "beza bayaran" (pisah dengan koma). Contoh peti emel HR'],
  ['head_report_email', '', 'Penerima laporan bulanan beza bayaran (Head of Strategic Planner)'],
  ['reminder_hari', '14', 'Peringatan emel kepada staf bila claim Lulus belum disahkan selepas N hari']
];

var VALIDATIONS = [
  ['Claims', 'status', STATUSES],
  ['Claims', 'deleted', ['TRUE', 'FALSE']],
  ['ClaimTypes', 'perlu_resit', ['TRUE', 'FALSE']],
  ['ClaimTypes', 'aktif', ['TRUE', 'FALSE']]
];

function buildSeed_(tab, ctx) {
  var audit = { created_at: ctx.now, created_by: ctx.by, updated_at: ctx.now, updated_by: ctx.by, deleted: 'FALSE', deleted_reason: '' };
  var align = function (tabName, obj) { return SCHEMA[tabName].map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; }); };
  if (tab === 'ClaimTypes') {
    return TYPE_SEED.map(function (t) { return align('ClaimTypes', Object.assign({ jenis: t[0], had_rm: '', perlu_resit: t[1] ? 'TRUE' : 'FALSE', aktif: 'TRUE' }, audit)); });
  }
  if (tab === 'Settings') {
    return SETTINGS_SEED.map(function (s) { return align('Settings', { key: s[0], value: s[1], nota: s[2] }); });
  }
  return null;
}
