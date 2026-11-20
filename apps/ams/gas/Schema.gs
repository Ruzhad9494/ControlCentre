/**
 * Schema.gs - struktur tab VP-AMS (BSD 3.5) + seed (BSD 6).
 *
 * Dibina ikut sistem AMS lama (voltake-energy/AMS: Appscript/Code.gs + index.html), dibaca 20/11/2026:
 *   MASTERLIST       -> Assets (lajur lama: No, Category, Make, Model, Serial No, Location Origin, Expired Date, Cert,
 *                       Calibration By, Test Set Picture, Current Location, Current Holder, Last Audit Date,
 *                       Audit Status, Remark, Audit Picture, Status Pinjaman)
 *   CALIBRATION LOG  -> CalibrationLog
 *   Log Mobiliti Aset-> Movements (satu baris setiap aset dipinjam; Dipinjam -> Menunggu pengesahan -> Selesai)
 *   audit bulanan    -> Audits (setiap rekod disimpan; Assets simpan audit terkini untuk papan pemuka)
 *   ID PASSWORD      -> TIDAK WUJUD (login Google SSO)
 * Tambahan atas BSD 3.5 (dicatat dalam BSD): lokasi_asal/lokasi_semasa, pemegang_*, status_pinjaman, audit terkini
 * dalam Assets; Movements.kumpulan, keadaan_akhir, lokasi_akhir; tab Settings.
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

var ASSET_HEADERS = [
  'asset_no', 'kategori', 'make', 'model', 'serial_no', 'lokasi_asal', 'lokasi_semasa',
  'pemegang_email', 'pemegang_nama', 'status_pinjaman',
  'calib_date', 'calib_expiry', 'calib_by', 'cert_file_id', 'photo_file_id',
  'last_audit_date', 'audit_status', 'audit_remark', 'audit_photo_file_id', 'catatan'
];

var MOVEMENT_HEADERS = [
  'movement_id', 'kumpulan', 'asset_no', 'peminjam_email', 'peminjam_nama', 'nama_projek', 'lokasi', 'tarikh_pinjam',
  'tempoh_hari', 'keadaan_pinjam', 'catatan_pinjam', 'tarikh_pulang', 'keadaan_pulang', 'catatan_pulang',
  'return_photo_file_id', 'status', 'approved_by', 'approved_by_name', 'approved_at', 'keadaan_akhir', 'lokasi_akhir', 'peringatan_at'
];

var SCHEMA = {
  Assets: ASSET_HEADERS.concat(AUDIT_FIELDS),
  CalibrationLog: ['log_id', 'asset_no', 'tarikh_kalibrasi', 'tarikh_luput', 'calib_by', 'cert_file_id', 'catatan'].concat(AUDIT_FIELDS),
  Audits: ['audit_id', 'asset_no', 'tarikh', 'keadaan', 'lokasi_ditemui', 'photo_file_id', 'catatan', 'auditor_email', 'auditor_nama'].concat(AUDIT_FIELDS),
  Movements: MOVEMENT_HEADERS.concat(AUDIT_FIELDS),
  Settings: ['key', 'value', 'nota'],
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran'],
  _Counters: ['key', 'value']
};

// Nilai pilihan ikut sistem lama
var STATUS_PINJAMAN = ['Tersedia', 'Dipinjam', 'Menunggu pengesahan'];
var AUDIT_KEADAAN = ['Baik', 'Rosak', 'Hilang'];                          // confirmAuditAction
var KEADAAN_PINJAM = ['Baik', 'Ada kerosakan sedikit'];                   // mob-kondisi
var KEADAAN_PULANG = ['Baik', 'Rosak'];                                    // return-condition (Rosak = rosak / hilang komponen)
var KEADAAN_AKHIR = ['Baik', 'Rosak', 'Hilang komponen'];                 // approval-condition
var MOVEMENT_STATUS = ['Dipinjam', 'Menunggu pengesahan', 'Selesai'];

var SETTINGS_SEED = [
  ['portal_url', '', 'Alamat portal untuk pautan dalam emel, contoh https://cc.voltake.com'],
  ['admin_notify_emails', '', 'Emel admin aset (pisah dengan koma): pemulangan menunggu pengesahan + laporan Isnin'],
  ['amaran_kalibrasi_hari', '30', 'Kalibrasi tamat dalam N hari dikira "hampir luput" (sistem lama: Lagi Sebulan = 30)'],
  ['sekat_pinjam_luput', 'TRUE', 'TRUE = aset yang kalibrasinya dah luput tak boleh dipinjam (PRD F-41)']
];

var VALIDATIONS = [
  ['Assets', 'status_pinjaman', STATUS_PINJAMAN],
  ['Assets', 'audit_status', [''].concat(AUDIT_KEADAAN)],
  ['Assets', 'deleted', ['TRUE', 'FALSE']],
  ['Audits', 'keadaan', AUDIT_KEADAAN],
  ['Movements', 'status', MOVEMENT_STATUS]
];

function buildSeed_(tab) {
  if (tab === 'Settings') {
    return SETTINGS_SEED.map(function (s) { return [s[0], s[1], s[2]]; });
  }
  return null;
}
