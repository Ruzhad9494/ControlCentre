/**
 * VPCore.gs - utiliti asas semua projek Apps Script Voltake Portal.
 * SUMBER: shared/gas/. Disalin ke apps/<modul>/gas/ oleh tools/sync-shared-gas.sh.
 * Jangan edit salinan dalam apps/<modul>/gas/; edit di shared/gas/ dan sync semula.
 */

var VP_TZ = 'Asia/Kuala_Lumpur';

function props_() {
  return PropertiesService.getScriptProperties();
}

/** Script Property wajib. Gagal dengan mesej jelas jika kosong. */
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

/** Masa semasa ISO 8601 dengan offset +08:00. */
function nowIso_() {
  return Utilities.formatDate(new Date(), VP_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Tarikh hari ini YYYY-MM-DD (waktu Malaysia). */
function todayIso_() {
  return Utilities.formatDate(new Date(), VP_TZ, 'yyyy-MM-dd');
}

/** Normalkan emel: trim + huruf kecil. Pulang '' jika format tak sah. */
function normEmail_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

/** Tukar nilai sel tarikh (Date atau teks) ke YYYY-MM-DD; '' jika kosong. */
function dateStr_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, VP_TZ, 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}

/** Nilai sel masa -> teks ISO (Sheets kadang tukar teks ISO jadi Date). */
function isoStr_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, VP_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(v);
}
