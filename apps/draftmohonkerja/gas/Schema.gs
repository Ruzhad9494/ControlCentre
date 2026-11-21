/**
 * Schema.gs - struktur tab VP-HR (BSD 3.2) + seed (BSD 6).
 *
 * Dibina ikut sistem lama Ruzhad9494/draftmohonkerja (appscript/Code.gs, index.html, dashboard/, interview/), dibaca 21/11/2026:
 *   Setup (Jawatan, Department)  -> Positions (+ aktif, lokasi, penerangan, tarikh tutup)
 *   Permohonan                    -> Applicants (medan borang sama; ID, Department, Status, Tarikh_Interview,
 *                                    Catatan_HR, Interview_Tukar sama)
 *   Papan interviewer (token per department) -> role `interviewer` dengan skop department + Interviews (markah)
 * Dibuang (PRD Q-09, minimakan data): socso, kwsp (dikumpul selepas tawaran).
 * Tambahan: consent_at / consent_version / ip_hash (PDPA), retention_until / anonymised (F-14), Settings.
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

// Status ikut dashboard lama (STATUS_STAGES) + "Tarik diri" (BSD 3.2)
var STATUSES = ['Baru', 'Disaring', 'Temuduga Dijadualkan', 'Ditawarkan', 'Diterima', 'Ditolak', 'Tarik diri'];
var FINAL_STATUSES = ['Ditolak', 'Tarik diri'];           // dianonimkan selepas retention (F-14)
var JANTINA = ['Lelaki', 'Perempuan'];
var STATUS_KAHWIN = ['', 'Bujang', 'Berkahwin', 'Janda', 'Duda'];
var HUBUNGAN = ['Ibu', 'Bapa', 'Pasangan', 'Adik-Beradik', 'Anak', 'Penjaga', 'Lain-Lain'];
var CADANGAN = ['Teruskan', 'Simpan', 'Tolak'];
// Kriteria markah interview (1-5). BSD 3.2 Interviews.markah (sistem lama tiada markah).
var KRITERIA = [
  ['teknikal', 'Pengetahuan teknikal'],
  ['pengalaman', 'Pengalaman berkaitan'],
  ['komunikasi', 'Komunikasi'],
  ['sikap', 'Sikap & keyakinan'],
  ['kesesuaian', 'Kesesuaian dengan jawatan']
];

var APPLICANT_HEADERS = [
  'app_no', 'position_id', 'jawatan', 'department', 'nama', 'ic', 'dob', 'jantina', 'status_kahwin',
  'email', 'tel_bimbit', 'tel_rumah', 'alamat', 'akademik_json', 'pengalaman_json',
  'kecemasan_nama', 'kecemasan_hubungan', 'kecemasan_jenis_tel', 'kecemasan_tel',
  'pernah_disabit', 'disabit_penerangan', 'gaji_dijangka',
  'ref1_nama', 'ref1_jawatan', 'ref1_syarikat', 'ref1_tel', 'ref2_nama', 'ref2_jawatan', 'ref2_syarikat', 'ref2_tel',
  'kebenaran_semak', 'photo_file_id', 'signature_file_id', 'resume_file_id', 'borang_lama_file_id',
  'status', 'status_at', 'tarikh_interview', 'interview_tukar', 'catatan_hr',
  'consent_at', 'consent_version', 'ip_hash', 'retention_until', 'anonymised'
];

var SCHEMA = {
  Positions: ['position_id', 'jawatan', 'department', 'lokasi', 'penerangan', 'aktif', 'tarikh_tutup'].concat(AUDIT_FIELDS),
  Applicants: APPLICANT_HEADERS.concat(AUDIT_FIELDS),
  Interviews: ['interview_id', 'app_no', 'interviewer_email', 'interviewer_nama', 'tarikh', 'markah_json', 'purata', 'cadangan', 'catatan'].concat(AUDIT_FIELDS),
  Settings: ['key', 'value', 'nota'],
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran'],
  _Counters: ['key', 'value']
};

// Versi notis privasi & persetujuan pemohon. Mesti SAMA dengan public-pages/mohon/mohon.js (CONSENT_VERSION).
var CONSENT_VERSION = 'PN-HR-2026-11';

var SETTINGS_SEED = [
  ['portal_url', '', 'Alamat portal untuk pautan dalam emel, contoh https://portal.voltake.com'],
  ['hr_notify_emails', '', 'Emel HR yang dimaklumkan bila ada permohonan baru (pisah dengan koma)'],
  ['retention_bulan', '12', 'Pemohon Ditolak / Tarik diri dianonimkan selepas N bulan (PRD Q-05: 12 bulan)'],
  ['benarkan_jawatan_lain', 'TRUE', 'TRUE = pemohon boleh taip jawatan sendiri jika tiada dalam senarai (sistem lama: "Taip Jawatan Anda")'],
  ['amaran_interview_hari', '7', 'Interview dalam N hari dipapar sebagai "menghampiri" (sistem lama: ALERT_DAYS 7)']
];

var VALIDATIONS = [
  ['Applicants', 'status', STATUSES],
  ['Applicants', 'anonymised', ['TRUE', 'FALSE']],
  ['Applicants', 'deleted', ['TRUE', 'FALSE']],
  ['Positions', 'aktif', ['TRUE', 'FALSE']],
  ['Interviews', 'cadangan', CADANGAN]
];
