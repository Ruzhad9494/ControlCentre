/**
 * Schema.gs - struktur tab VP-Compliance (BSD 3.7) + seed (BSD 6).
 *
 * Dibina ikut sistem lama voltake-energy/Compliance-Track ("UniTrack"), dibaca 20/11/2026:
 *   Kereta + Motosikal (No, Plate No., Location, Condition, Expired Date, Document) -> Vehicles (jenis Kereta/Motosikal)
 *   Chargeman (No, Solar Farm, Chargeman Name, Competency No., Expiry Date, Document, ID) -> Chargeman
 *   Cert (format lebar: ID, NAME, CIDB, CIDB Cert, NIOSH, Niosh Cert, Working at Height, WaH Cert, First Aid,
 *         First Aid Cert, IC, IC Attachment, Designation) -> Staff (profil + IC) + StaffCerts (format panjang)
 *   Job_Log (spreadsheet private: Tarikh, Projek, Dibuat Oleh, Senarai ID, Bil Orang) -> JobLog (Senarai Kerja)
 *   Deleted_Rows -> padam lembut (deleted = TRUE + sebab) dalam tab yang sama
 * Tambahan atas BSD 3.7 (dicatat dalam BSD): tab Staff (designation, IC, persetujuan), JobLog ikut Senarai Kerja lama,
 * tab Settings.
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

// Jenis sijil staf ikut tab Cert lama (susunan & label sama dengan Senarai Kerja lama)
var CERT_TYPES = [
  { key: 'CIDB',  label: 'CIDB',              dateCol: 'cidb',              fileCol: 'cidb cert',      def: true },
  { key: 'NIOSH', label: 'NIOSH (NTSP)',      dateCol: 'niosh',             fileCol: 'niosh cert',     def: true },
  { key: 'WAH',   label: 'Working at Height', dateCol: 'working at height', fileCol: 'wah cert',       def: false },
  { key: 'FA',    label: 'First Aid',         dateCol: 'first aid',         fileCol: 'first aid cert', def: false }
];
var CERT_KEYS = CERT_TYPES.map(function (c) { return c.key; });
var VEHICLE_TYPES = ['Kereta', 'Motosikal'];

var SCHEMA = {
  Vehicles: ['vehicle_id', 'jenis', 'plate_no', 'lokasi', 'keadaan', 'roadtax_expiry', 'doc_file_id', 'catatan'].concat(AUDIT_FIELDS),
  Chargeman: ['chargeman_id', 'staff_id', 'nama', 'solar_farm', 'competency_no', 'expiry_date', 'doc_file_id', 'catatan'].concat(AUDIT_FIELDS),
  Staff: ['staff_id', 'staff_email', 'nama', 'designation', 'ic_no', 'ic_front_file_id', 'ic_back_file_id', 'ic_consent_version', 'ic_consent_at', 'ic_oleh'].concat(AUDIT_FIELDS),
  StaffCerts: ['cert_id', 'staff_id', 'jenis', 'no_sijil', 'expiry_date', 'cert_file_id'].concat(AUDIT_FIELDS),
  JobLog: ['job_id', 'tarikh', 'kerja', 'tempat', 'tajuk', 'staff_ids', 'bil_orang', 'sijil', 'dibuat_oleh', 'dibuat_oleh_nama', 'created_at'],
  Settings: ['key', 'value', 'nota'],
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran'],
  _Counters: ['key', 'value']
};

var SETTINGS_SEED = [
  ['portal_url', '', 'Alamat portal untuk pautan dalam emel, contoh https://cc.voltake.com'],
  ['notify_emails', '', 'Emel HR / PSS untuk laporan Isnin (pisah dengan koma)'],
  ['amaran_hari', '60', 'Tamat dalam N hari dikira "hampir tamat" (sistem lama: lalai 60; pilihan 30/60/90)'],
  ['peringatan_staf', 'TRUE', 'TRUE = staf yang sijilnya tamat / tamat dalam 30 hari diemel setiap Isnin'],
  ['company_name', 'VOLTAKE ENERGY SERVICES SDN BHD', 'Nama syarikat pada kepala Senarai Kerja'],
  ['company_address', '', 'Alamat syarikat pada kepala Senarai Kerja']
];

var VALIDATIONS = [
  ['Vehicles', 'jenis', VEHICLE_TYPES],
  ['StaffCerts', 'jenis', CERT_KEYS],
  ['Vehicles', 'deleted', ['TRUE', 'FALSE']],
  ['Chargeman', 'deleted', ['TRUE', 'FALSE']],
  ['Staff', 'deleted', ['TRUE', 'FALSE']],
  ['StaffCerts', 'deleted', ['TRUE', 'FALSE']]
];
