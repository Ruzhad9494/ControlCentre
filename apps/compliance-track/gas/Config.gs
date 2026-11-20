/**
 * Config.gs - projek Apps Script `compliance` (VP-Compliance). IPD 2D.
 *
 * Script Properties wajib: SPREADSHEET_ID, ROOT_FOLDER_ID (folder VP-Files),
 * MODULE_SECRET (sama dengan Cloudflare MODULE_SECRET_COMPLIANCE), ENV (prod|staging).
 */

var MODULE_NAME = 'Compliance';
var REQUIRED_PROPS = ['SPREADSHEET_ID', 'ROOT_FOLDER_ID', 'MODULE_SECRET', 'ENV'];
var MIN_SECRET_LENGTH = 32;

function checkConfig() {
  var missing = REQUIRED_PROPS.filter(function (k) {
    var v = props_().getProperty(k);
    return v === null || v === undefined || String(v).trim() === '';
  });
  if (missing.length) throw new Error('Script Properties belum diisi: ' + missing.join(', '));
  var env = prop_('ENV');
  if (env !== 'prod' && env !== 'staging') throw new Error('ENV mesti "prod" atau "staging", bukan "' + env + '"');
  if (prop_('MODULE_SECRET').length < MIN_SECRET_LENGTH) {
    throw new Error('MODULE_SECRET terlalu pendek (minimum ' + MIN_SECRET_LENGTH + ' aksara)');
  }
  Logger.log('checkConfig OK (ENV=' + env + ')');
  return true;
}

/** Nama spreadsheet mesti VP-Compliance (prod) atau VP-STG-Compliance (staging). */
function assertEnvMatchesSpreadsheet_(ss) {
  var env = prop_('ENV');
  var expected = (env === 'staging' ? 'VP-STG-' : 'VP-') + MODULE_NAME;
  if (ss.getName() !== expected) {
    throw new Error('ENV=' + env + ' tapi spreadsheet bernama "' + ss.getName() + '". Jangka "' + expected + '". Semak SPREADSHEET_ID.');
  }
}
