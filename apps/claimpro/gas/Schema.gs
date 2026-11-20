/**
 * Schema.gs - struktur tab VP-ClaimPro (BSD 3.6) + seed (BSD 6).
 * Tambahan atas BSD 3.6 (dicatat dalam BSD): Claims.staff_id, submitted_at, approved_by_name,
 * peringatan_at; tab Settings (emel pemberitahuan, URL portal).
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

var CLAIM_HEADERS = [
  'claim_id', 'staff_email', 'staff_id', 'staff_name', 'department', 'tarikh', 'jenis', 'pax', 'sesi_makan', 'keterangan', 'amaun_rm',
  'receipt_file_id', 'status', 'submitted_at', 'approved_by', 'approved_by_name', 'approved_at', 'sebab_tolak',
  'received_date', 'received_amount_rm', 'received_proof_file_id', 'beza_bayaran', 'peringatan_at',
  // Bukti bayaran SYARIKAT (direkod Admin HR / Head of HR sebagai evidence; tambahan 20/11/2026).
  // Tidak menukar status: staf tetap sahkan terima (Lulus -> Dibayar).
  'paid_proof_file_id', 'paid_by', 'paid_by_name', 'paid_date', 'paid_amount_rm', 'paid_recorded_at'
];

var SCHEMA = {
  ClaimTypes: ['jenis', 'had_rm', 'had_tahunan_rm', 'guna_sesi_makan', 'perlu_resit', 'aktif'].concat(AUDIT_FIELDS),
  Claims: CLAIM_HEADERS.concat(AUDIT_FIELDS),
  Approvals: ['id', 'claim_id', 'dari_status', 'ke_status', 'oleh_email', 'ts', 'catatan'],
  Settings: ['key', 'value', 'nota'],
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran'],
  _Counters: ['key', 'value']
};

var STATUSES = ['Draf', 'Dihantar', 'Lulus', 'Ditolak', 'Dibayar'];

// Jenis tuntutan ikut sistem ClaimPro lama (voltake-energy/claimpro Code.gs: ALLOWED_TYPES), susunan sama.
// Peraturan lama dibawa sebagai data (admin boleh ubah di portal, Laporan > Jenis tuntutan):
//   - Perubatan: had tahunan RM350 setiap staf (ANNUAL_MEDICAL_LIMIT), ikut tahun tarikh perbelanjaan
//   - Makan & Minum: had ikut sesi x pax (MEAL_RATE_SIANG/MALAM/BOTH), kadar dalam tab Settings
//   - semua jenis: sekurang-kurangnya satu resit semasa hantar (handleSubmitClaim)
var TYPE_SEED = [
  // jenis,           perlu_resit, had_tahunan_rm, guna_sesi_makan
  ['Perjalanan',      true,        '',             false],
  ['Makan & Minum',   true,        '',             true],
  ['Keraian',         true,        '',             false],
  ['Penginapan',      true,        '',             false],
  ['Perubatan',       true,        350,            false],
  ['Lain-lain',       true,        '',             false]
];
// Nama lama yang mungkin wujud dari seed versi awal portal (dibetulkan oleh syncOldClaimRules)
var TYPE_ALIASES = { 'Makan & Minum': ['Makan & Minuman', 'Makan'] };

var SETTINGS_SEED = [
  ['portal_url', '', 'Alamat portal untuk pautan dalam emel, contoh https://cc.voltake.com'],
  ['admin_notify_emails', '', 'Emel penerima "tuntutan baru" & "beza bayaran" (pisah dengan koma). Contoh peti emel HR'],
  ['head_report_email', '', 'Penerima laporan bulanan beza bayaran (Head of HR)'],
  ['reminder_hari', '14', 'Peringatan emel kepada staf bila claim Lulus belum disahkan selepas N hari'],
  ['kadar_makan_siang', '10', 'Had makan sesi siang, RM setiap pax (sistem lama: MEAL_RATE_SIANG)'],
  ['kadar_makan_malam', '15', 'Had makan sesi malam, RM setiap pax (sistem lama: MEAL_RATE_MALAM)'],
  ['kadar_makan_kedua', '25', 'Had makan siang + malam, RM setiap pax (sistem lama: MEAL_RATE_BOTH)']
];

var VALIDATIONS = [
  ['Claims', 'status', STATUSES],
  ['Claims', 'deleted', ['TRUE', 'FALSE']],
  ['ClaimTypes', 'perlu_resit', ['TRUE', 'FALSE']],
  ['ClaimTypes', 'aktif', ['TRUE', 'FALSE']],
  ['ClaimTypes', 'guna_sesi_makan', ['TRUE', 'FALSE']],
  ['Claims', 'sesi_makan', ['', 'siang', 'malam', 'siang+malam']]
];

function buildSeed_(tab, ctx) {
  var audit = { created_at: ctx.now, created_by: ctx.by, updated_at: ctx.now, updated_by: ctx.by, deleted: 'FALSE', deleted_reason: '' };
  var align = function (tabName, obj) { return SCHEMA[tabName].map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; }); };
  if (tab === 'ClaimTypes') {
    return TYPE_SEED.map(function (t) {
      return align('ClaimTypes', Object.assign({ jenis: t[0], had_rm: '', had_tahunan_rm: t[2], guna_sesi_makan: t[3] ? 'TRUE' : 'FALSE', perlu_resit: t[1] ? 'TRUE' : 'FALSE', aktif: 'TRUE' }, audit));
    });
  }
  if (tab === 'Settings') {
    return SETTINGS_SEED.map(function (s) { return align('Settings', { key: s[0], value: s[1], nota: s[2] }); });
  }
  return null;
}
