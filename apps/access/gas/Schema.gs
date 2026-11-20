/**
 * Schema.gs - struktur tab VP-Access (BSD 3.1) + seed awal (BSD 6).
 * Jangan ubah nama/susunan lajur tanpa kemas kini BSD dahulu.
 */

var AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by', 'deleted', 'deleted_reason'];

var SCHEMA = {
  Staff: [
    'staff_id', 'email', 'jenis_emel', 'google_sub', 'mfa_disahkan', 'last_login_at',
    'nama', 'department', 'designation', 'status', 'token_version', 'tarikh_mula', 'tarikh_tamat'
  ].concat(AUDIT_FIELDS),
  Modules: [
    'module_id', 'nama', 'path', 'ikon', 'subtajuk', 'roles_sah', 'susunan', 'status'
  ].concat(AUDIT_FIELDS),
  UserAccess: [
    'email', 'module_id', 'roles', 'skop', 'tamat_pada'
  ].concat(AUDIT_FIELDS),
  AccessChangeLog: ['ts', 'admin_email', 'staff_email', 'module_id', 'roles_lama', 'roles_baru', 'sebab'],
  LoginLog: ['ts', 'email', 'hasil', 'ip_hash', 'user_agent'],
  Settings: ['key', 'value', 'nota'],
  _Counters: ['key', 'value']
};

var ENUMS = {
  department: ['HR', 'COMMERCIAL', 'PSS', 'OMP', 'ADMIN', 'ACCOUNT', 'STRATEGIC', 'MGMT', 'IT'],
  staff_status: ['aktif', 'tamat', 'gantung'],
  jenis_emel: ['syarikat', 'gmail'],
  module_status: ['aktif', 'maintenance', 'belum_live'],
  bool: ['TRUE', 'FALSE']
};

// Data dropdown yang dipasang oleh applyValidation_() : [tab, lajur, senarai]
var VALIDATIONS = [
  ['Staff', 'department', ENUMS.department],
  ['Staff', 'status', ENUMS.staff_status],
  ['Staff', 'jenis_emel', ENUMS.jenis_emel],
  ['Staff', 'mfa_disahkan', ENUMS.bool],
  ['Staff', 'deleted', ENUMS.bool],
  ['Modules', 'status', ENUMS.module_status],
  ['Modules', 'deleted', ENUMS.bool],
  ['UserAccess', 'deleted', ENUMS.bool]
];

// Mesti sepadan dengan config/modules.json + config/roles.json (diuji oleh tools/test).
// Semua bermula `belum_live`; tukar ke `aktif` semasa go-live setiap modul (IPD 2.x.7).
var MODULE_SEED = [
  // module_id,     nama,                path,                  ikon,              subtajuk,             roles_sah,                                          susunan
  ['hr',          'Draft Mohon Kerja', '/draftmohonkerja/',  'briefcase',       'HR Only',            'hr_admin,interviewer',                              1],
  ['costcalc',    'Cost Calculator',   '/costcalculator/',   'calculator',      'Commercial & PSS',   'user,admin',                                        2],
  ['gwr',         'GWR',               '/gwr/',              'hard-hat', 'OMP & PSS',          'manager,supervisor,engineer,chargeman,technician',  3],
  ['ams',         'AMS',               '/ams/',              'shield-check',         'Asset Management',   'admin,auditor,staff',                               4],
  ['claimpro',    'ClaimPro',          '/claimpro/',         'receipt',         'All Staff',          'staff,admin,ketua',                                 5],
  ['compliance',  'Compliance Track',  '/compliance-track/', 'badge-check',    'HR & PSS',           'hr_admin,pss,staff_self',                           6],
  ['claimreport', 'ClaimReport',       '/claimreport/',      'chart-column',       'Strategic Planning', 'user,admin',                                        7],
  ['voltrack',    'Voltrack',          '/voltrack/',         'trending-up',     'Project Tracking',   'admin,commercial,operation,claim,lod',              8]
];

var SETTINGS_SEED = [
  ['company_name', 'Voltake Energy', 'Nama paparan syarikat'],
  ['it_contact', '', 'Emel/telefon untuk skrin "Tiada akses" (S-03)'],
  ['hr_report_email', '', 'Penerima laporan bulanan staf aktif tak login > 60 hari'],
  ['inactive_days', '60', 'Ambang hari untuk laporan staf tak aktif'],
  ['privacy_notice_version', '', 'Versi notis privasi pekerja (Fasa 1, task 1.16)']
];

/** Bina baris ikut susunan header dari objek {lajur: nilai}. */
function rowFor_(tab, obj) {
  return SCHEMA[tab].map(function (h) {
    return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
  });
}

/** Seed bagi setiap tab. Dipanggil hanya bila tab kosong (header sahaja). */
function buildSeed_(tab, ctx) {
  var audit = { created_at: ctx.now, created_by: ctx.by, updated_at: ctx.now, updated_by: ctx.by, deleted: 'FALSE', deleted_reason: '' };
  if (tab === 'Modules') {
    return MODULE_SEED.map(function (m) {
      return rowFor_('Modules', Object.assign({
        module_id: m[0], nama: m[1], path: m[2], ikon: m[3], subtajuk: m[4], roles_sah: m[5], susunan: m[6], status: 'belum_live'
      }, audit));
    });
  }
  if (tab === 'Settings') {
    return SETTINGS_SEED.map(function (s) { return rowFor_('Settings', { key: s[0], value: s[1], nota: s[2] }); });
  }
  if (tab === 'Staff' || tab === 'UserAccess') {
    var sa = superadminSeed_();
    if (!sa) return null;
    if (tab === 'Staff') {
      return [rowFor_('Staff', Object.assign({
        staff_id: sa.staff_id,
        email: sa.email,
        jenis_emel: /@voltake\.com$/.test(sa.email) ? 'syarikat' : 'gmail',
        google_sub: '',
        mfa_disahkan: 'FALSE',
        nama: sa.nama,
        department: sa.department,
        designation: sa.designation,
        status: 'aktif',
        token_version: 1
      }, audit))];
    }
    return [rowFor_('UserAccess', Object.assign({
      email: sa.email, module_id: '*', roles: 'superadmin', skop: '', tamat_pada: ''
    }, audit))];
  }
  return null;
}

/** Maklumat superadmin dari Script Properties (bukan dalam kod - BSD 6). */
function superadminSeed_() {
  var email = optProp_('SEED_SUPERADMIN_EMAIL', '');
  if (!email) return null;
  email = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SEED_SUPERADMIN_EMAIL bukan format emel yang sah');
  }
  var staffId = optProp_('SEED_SUPERADMIN_STAFF_ID', '');
  var nama = optProp_('SEED_SUPERADMIN_NAMA', '');
  if (!staffId || !nama) {
    throw new Error('Isi juga SEED_SUPERADMIN_STAFF_ID dan SEED_SUPERADMIN_NAMA');
  }
  var dept = optProp_('SEED_SUPERADMIN_DEPARTMENT', 'MGMT').toUpperCase();
  if (ENUMS.department.indexOf(dept) < 0) {
    throw new Error('SEED_SUPERADMIN_DEPARTMENT tak sah: ' + dept);
  }
  return {
    email: email,
    staff_id: staffId,
    nama: nama,
    department: dept,
    designation: optProp_('SEED_SUPERADMIN_DESIGNATION', 'Superadmin')
  };
}
