/**
 * Schema.gs - struktur tab VP-CostCalc (BSD 3.3) + seed (BSD 6).
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

var SCHEMA = {
  Rates: ['rate_key', 'label', 'nilai_rm', 'unit', 'berkuat_kuasa'].concat(AUDIT_FIELDS),
  Estimates: [
    'estimate_id', 'project_id', 'nama_projek', 'klien', 'lokasi', 'hari', 'manpower', 'mobilisasi_json',
    'nilai_po_rm', 'kos_subkon_rm', 'rates_snapshot_json', 'jumlah_kos_rm', 'margin_rm', 'margin_peratus', 'status',
    // `department` pencipta: untuk skop "R semua dalam dept" (BSD 4.2). Tambahan pada BSD 3.3.
    'department'
  ].concat(AUDIT_FIELDS),
  AuditLog: ['ts', 'email', 'tindakan', 'sasaran', 'butiran'],
  _Counters: ['key', 'value']
};

// Kadar kos (F-22). NILAI SENGAJA KOSONG: diisi Commercial di skrin S-22, bukan dalam repo.
// Susunan & label ikut sistem lama (Seksyen 4 "Kadar Kos Tetap").
var RATE_SEED = [
  // rate_key,              label,                 unit
  ['ot_per_hour',           'Overtime',            'RM / jam / pax'],
  ['transport_per_km',      'Transport',           'RM / km / unit'],
  ['makan_per_day_pax',     'Makan',               'RM / hari / pax'],
  ['homestay_per_night',    'Homestay',            'RM / malam / unit'],
  ['overnight_per_pax',     'Overnight',           'RM / malam / pax']
];
var RATE_KEYS = RATE_SEED.map(function (r) { return r[0]; });

var ESTIMATE_STATUS = ['Draf', 'Muktamad'];

var VALIDATIONS = [
  ['Estimates', 'status', ESTIMATE_STATUS],
  ['Estimates', 'deleted', ['TRUE', 'FALSE']],
  ['Rates', 'deleted', ['TRUE', 'FALSE']]
];

function buildSeed_(tab, ctx) {
  if (tab !== 'Rates') return null;
  return RATE_SEED.map(function (r) {
    return SCHEMA.Rates.map(function (h) {
      var o = {
        rate_key: r[0], label: r[1], nilai_rm: '', unit: r[2], berkuat_kuasa: '',
        created_at: ctx.now, created_by: ctx.by, updated_at: ctx.now, updated_by: ctx.by, deleted: 'FALSE', deleted_reason: ''
      };
      return o[h];
    });
  });
}
