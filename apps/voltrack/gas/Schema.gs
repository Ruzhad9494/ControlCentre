/**
 * Schema.gs - struktur tab VP-Voltrack (BSD 3.9) + seed (BSD 6).
 *
 * Dibina ikut VoltTrack v2 lama (Ruzhad9494/Voltrack: Appscript/Code.gs, index.html), dibaca 21/11/2026.
 * 4 tab fasa dipaut melalui `id` projek (EL-YYYY-NNN), sama seperti sistem lama. Tab Users lama dibuang
 * (diganti login Google + Akses modul). OneSignal (push) tidak dibawa: diganti emel harian (F-07 Tambahan Fasa 3).
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

// Medan ikut SCHEMA lama. gwr_report_ids baru (F-85).
var PHASE_FIELDS = {
  Commercial: ['company', 'date_request', 'quotation_no', 'quotation_amount', 'status_quotation', 'date_proceed', 'presentation_date', 'job_description', 'remark'],
  Operation: ['mos_ready', 'jsa_ready', 'ptw_ready', 'date_start_job', 'date_completed_job', 'gwr_submitted', 'gwr_date', 'gwr_report_ids', 'full_report_submitted', 'full_report_date', 'status_job', 'report_pic'],
  Claim: ['invoice_no', 'invoice_date', 'po_no', 'followup_1', 'followup_2', 'followup_3', 'payment_due_date', 'payment_status', 'overdue_days', 'paid_date'],
  LOD: ['lod_reminder_sent', 'lod_reminder_date', 'lod_issue', 'lod_issue_date', 'ctos_action', 'legal_action', 'case_status', 'case_remark']
};
var PHASES = ['Commercial', 'Operation', 'Claim', 'LOD'];

var SCHEMA = {
  Commercial: ['id'].concat(PHASE_FIELDS.Commercial, ['updated_by_name'], AUDIT_FIELDS),
  Operation: ['id'].concat(PHASE_FIELDS.Operation, ['updated_by_name'], AUDIT_FIELDS),
  Claim: ['id'].concat(PHASE_FIELDS.Claim, ['updated_by_name'], AUDIT_FIELDS),
  LOD: ['id'].concat(PHASE_FIELDS.LOD, ['updated_by_name'], AUDIT_FIELDS),
  Settings: ['key', 'value', 'nota'],
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran']
};

// Pilihan dropdown sistem lama (index.html openForm)
var OPTIONS = {
  status_quotation: ['Pending', 'Cancel', 'Approved'],
  mos_ready: ['Sedia', 'Belum', 'N/A'], jsa_ready: ['Sedia', 'Belum', 'N/A'], ptw_ready: ['Sedia', 'Belum', 'N/A'],
  gwr_submitted: ['Yes', 'No'], full_report_submitted: ['Yes', 'No'],
  payment_status: ['Pending', 'Paid', 'Outstanding'],
  ctos_action: ['Pending', 'Initiated', 'Completed'], legal_action: ['Pending', 'Initiated', 'Completed'],
  case_status: ['Open', 'KIV', 'Closed']
};
var DATE_FIELDS = ['date_request', 'date_proceed', 'presentation_date', 'date_start_job', 'date_completed_job', 'gwr_date', 'full_report_date',
  'invoice_date', 'followup_1', 'followup_2', 'followup_3', 'payment_due_date', 'paid_date', 'lod_reminder_sent', 'lod_reminder_date', 'lod_issue', 'lod_issue_date'];
// Dikira server (sistem lama: autoUpdateLogic / attachFormListeners di pelayar)
var DERIVED = ['status_job', 'followup_1', 'followup_2', 'followup_3', 'payment_due_date', 'overdue_days', 'lod_reminder_sent', 'lod_issue'];

var SETTINGS_SEED = [
  ['portal_url', '', 'Alamat portal, contoh https://portal.voltake.com (pautan dalam emel)'],
  ['emel_peringatan', '', 'Emel ringkasan tunggakan harian (sistem lama: push OneSignal kepada LOD & Admin), pisah koma'],
  ['tempoh_bayaran_hari', '30', 'Payment due = invoice date + N hari (sistem lama: 30)']
];

var VALIDATIONS = [
  ['Commercial', 'status_quotation', OPTIONS.status_quotation],
  ['Claim', 'payment_status', OPTIONS.payment_status],
  ['LOD', 'case_status', OPTIONS.case_status],
  ['Commercial', 'deleted', ['TRUE', 'FALSE']]
];
