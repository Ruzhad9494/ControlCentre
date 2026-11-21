/**
 * Schema.gs - struktur tab VP-GWR (BSD 3.4) + seed (BSD 6).
 *
 * Dibina ikut GWR v4.2 lama (voltake-energy/gwrompnew & Ruzhad9494/gwrpss: Appscript/Code.gs, index.html,
 * Approval.html, dashboard/), dibaca 21/11/2026. Kod OMP & PSS lama sama (beza DEPT, Sheet & folder sahaja),
 * jadi satu modul dengan medan `dept` (PRD andaian 4).
 *
 * Lama -> baharu:
 *   ReportID REP-<masa>              -> report_id GWR-<DEPT>-YYYY-NNNNN
 *   StaffToken (UUID dalam pelayar)  -> dibuang: identiti dari sesi SSO
 *   ApprovalToken (mentah, CSV awam) -> approval_token_hash (SHA-256) + approval_token_expires (+7 hari), sekali guna
 *   DraftImageData (pautan awam)     -> image_ids_json [{id, desc}] (fail peribadi)
 *   JobDesc + JobShutdown            -> job_items_json [{desc, remark, shutdown, voltage}] + job_desc + job_shutdown (dikira server)
 *   Manpower ("Jawatan | Pax | Nama")-> manpower_json [{role, count, names}] + manpower
 *   Status Draft / Pending / Approved -> Draf / Menunggu klien / Disahkan (+ Luput, Dibatalkan)
 *   PDF draf & final dijana di pelayar (boleh diubah) -> dijana di SERVER dari data
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

var REPORT_HEADERS = [
  'report_id', 'dept', 'client_req_id', 'tarikh', 'po_number', 'quotation_number', 'mos_number', 'project_id',
  'client_company', 'project_title', 'location', 'time_in', 'time_out', 'pic_name', 'pic_phone',
  'job_items_json', 'job_desc', 'job_shutdown', 'ptw', 'unresolved_issue', 'manpower_json', 'manpower',
  'sign_client_name', 'sign_client_position', 'sign_client_phone',
  'staff_email', 'staff_name', 'staff_position', 'staff_signature_file_id', 'image_ids_json', 'upload_keys',
  'draft_pdf_file_id', 'approval_token_hash', 'approval_token_expires', 'status', 'submitted_at',
  'client_sign_name', 'client_sign_position', 'client_sign_phone', 'client_email', 'client_signature_file_id',
  'final_pdf_file_id', 'approved_at', 'client_ip_hash', 'emel_dihantar'
];

var SCHEMA = {
  Reports: REPORT_HEADERS.concat(AUDIT_FIELDS),
  Settings: ['key', 'value', 'nota'],
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran'],
  _Counters: ['key', 'value']
};

var DEPTS = ['OMP', 'PSS'];
var STATUSES = ['Draf', 'Menunggu klien', 'Disahkan', 'Luput', 'Dibatalkan'];
// Tahap role (BSD 4.1). Sistem lama: manager & engineer isi maklumat projek; technician tidak (applyRoleUI)
var LEVELS = ['manager', 'supervisor', 'engineer', 'chargeman', 'technician'];
var PREPARERS = ['manager', 'supervisor', 'engineer', 'chargeman'];
var MANPOWER_ROLES = ['Technician', 'Engineer', 'Chargeman', 'Supervisor'];   // sistem lama: Technician, Engineer, Chargeman
var VOLTAGES = ['LV', 'MV'];
var MAX_IMAGES = 30;

var SETTINGS_SEED = [
  ['portal_url', '', 'Alamat portal, contoh https://portal.voltake.com (pautan klien = <portal_url>/public/gwr-sign/?t=...)'],
  ['pautan_luput_hari', '7', 'Pautan tandatangan klien luput selepas N hari (PRD F-32)'],
  ['emel_cc_OMP', '', 'Emel salinan PDF final GWR OMP (pisah dengan koma), contoh pengurus OMP'],
  ['emel_cc_PSS', '', 'Emel salinan PDF final GWR PSS (pisah dengan koma)'],
  ['company_name', 'Voltake Energy', 'Kepala PDF (sistem lama: "Voltake Energy (OMP)" / "(PSS)")'],
  ['company_reg', '201801008831 (1270845-X)', 'No. pendaftaran syarikat pada kepala PDF'],
  ['company_phone', '+604-5823617', 'Telefon pada kepala PDF'],
  ['company_email', 'admin@voltake.com', 'Emel pada kepala PDF'],
  ['company_web', 'www.voltake.com', 'Laman web pada kepala PDF'],
  ['report_logo_file_id', '', 'Pilihan: ID fail logo report dalam Drive. Kosong = logo dari portal (shared/ui/report-logo.png), atau logo lalai']
];

var VALIDATIONS = [
  ['Reports', 'dept', DEPTS],
  ['Reports', 'status', STATUSES],
  ['Reports', 'ptw', ['', 'YES', 'NO']],
  ['Reports', 'deleted', ['TRUE', 'FALSE']]
];
