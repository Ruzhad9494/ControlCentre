/**
 * Config.gs - projek Apps Script `access` (VP-Access)
 *
 * Semua ID dan secret dibaca dari Script Properties, BUKAN dari kod (TRD 6).
 * Wajib (BSD 6): SPREADSHEET_ID, ROOT_FOLDER_ID, ENV (prod|staging), ACCESS_SECRET.
 * Pilihan, untuk seed superadmin sekali sahaja (padam selepas setupSystem):
 *   SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_STAFF_ID, SEED_SUPERADMIN_NAMA,
 *   SEED_SUPERADMIN_DEPARTMENT (lalai MGMT), SEED_SUPERADMIN_DESIGNATION (lalai "Superadmin")
 */

var REQUIRED_PROPS = ['SPREADSHEET_ID', 'ROOT_FOLDER_ID', 'ENV', 'ACCESS_SECRET'];
var MIN_SECRET_LENGTH = 32;

function props_() {
  return PropertiesService.getScriptProperties();
}

function prop_(key) {
  var v = props_().getProperty(key);
  if (v === null || v === undefined || String(v).trim() === '') {
    throw new Error('Script Property "' + key + '" belum diisi. Jalankan checkConfig() untuk senarai penuh.');
  }
  return String(v).trim();
}

function optProp_(key, fallback) {
  var v = props_().getProperty(key);
  return (v === null || v === undefined || String(v).trim() === '') ? fallback : String(v).trim();
}

/**
 * Gagal awal jika konfigurasi tak lengkap atau tak selamat.
 * Boleh dijalankan sendiri dari editor untuk semak.
 */
function checkConfig() {
  var missing = REQUIRED_PROPS.filter(function (k) {
    var v = props_().getProperty(k);
    return v === null || v === undefined || String(v).trim() === '';
  });
  if (missing.length) {
    throw new Error('Script Properties belum diisi: ' + missing.join(', '));
  }
  var env = prop_('ENV');
  if (env !== 'prod' && env !== 'staging') {
    throw new Error('ENV mesti "prod" atau "staging", bukan "' + env + '"');
  }
  if (prop_('ACCESS_SECRET').length < MIN_SECRET_LENGTH) {
    throw new Error('ACCESS_SECRET terlalu pendek (minimum ' + MIN_SECRET_LENGTH + ' aksara). Jana dengan: openssl rand -base64 48');
  }
  Logger.log('checkConfig OK (ENV=' + env + ')');
  return true;
}

/**
 * Halang setupSystem() tersalah tulis ke Sheet production semasa staging (atau sebaliknya).
 * Nama spreadsheet mesti VP-Access (prod) atau VP-STG-Access (staging) - BSD 1.
 */
function assertEnvMatchesSpreadsheet_(ss) {
  var env = prop_('ENV');
  var name = ss.getName();
  var expected = env === 'staging' ? 'VP-STG-Access' : 'VP-Access';
  if (name !== expected) {
    throw new Error('ENV=' + env + ' tapi spreadsheet bernama "' + name + '". Jangka "' + expected + '". Semak SPREADSHEET_ID.');
  }
}

function nowIso_() {
  return Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', "yyyy-MM-dd'T'HH:mm:ssXXX");
}
