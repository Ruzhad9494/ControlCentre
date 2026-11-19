/**
 * Maintenance.gs - fungsi yang dijalankan MANUAL dari editor Apps Script.
 */

/**
 * syncModuleMeta: kemas kini nama, path, ikon, subtajuk, roles_sah dalam tab Modules
 * ikut MODULE_SEED (Schema.gs). TIDAK ubah status atau susunan (itu keputusan Admin).
 * Guna selepas kod naik versi yang ubah metadata modul.
 */
function syncModuleMeta() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var sh = sheet_(ss, 'Modules');
  var t = readTable_(sh);
  var changed = [];
  MODULE_SEED.forEach(function (m) {
    var row = t.rows.filter(function (r) { return String(r.module_id).trim() === m[0]; })[0];
    if (!row) return;
    var want = { nama: m[1], path: m[2], ikon: m[3], subtajuk: m[4], roles_sah: m[5] };
    var diff = {};
    Object.keys(want).forEach(function (k) { if (String(row[k]) !== String(want[k])) diff[k] = want[k]; });
    if (Object.keys(diff).length) {
      diff.updated_at = nowIso_();
      diff.updated_by = currentUserEmail_();
      updateObj_(sh, t.header, row._row, diff);
      changed.push(m[0]);
    }
  });
  Logger.log('syncModuleMeta: ' + (changed.length ? 'dikemas kini ' + changed.join(', ') : 'tiada perubahan'));
  return changed;
}

/**
 * normalizeStaff: guna selepas tampal senarai staf dari HR terus ke tab Staff (IPD 1.15).
 * - emel: trim + huruf kecil; baris dengan emel tak sah dilaporkan
 * - isi lalai: status=aktif, token_version=1, mfa_disahkan=FALSE, deleted=FALSE,
 *   jenis_emel (syarikat jika @voltake.com, lain gmail), medan audit
 * - lapor staff_id / emel berulang (TIDAK dipadam; Admin betulkan sendiri)
 * Tidak sentuh google_sub, roles atau baris yang dah lengkap.
 */
function normalizeStaff() {
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var sh = sheet_(ss, 'Staff');
  var t = readTable_(sh);
  var by = currentUserEmail_(), now = nowIso_();
  var fixed = 0, problems = [], seenEmail = {}, seenId = {};

  t.rows.forEach(function (r) {
    if (isDeleted_(r)) return;
    var upd = {};
    var email = normEmail_(r.email);
    if (!email) { problems.push('Baris ' + r._row + ': emel tak sah "' + r.email + '"'); }
    else if (email !== String(r.email)) upd.email = email;

    var dept = String(r.department || '').trim().toUpperCase();
    if (ENUMS.department.indexOf(dept) < 0) problems.push('Baris ' + r._row + ': department tak sah "' + r.department + '"');
    else if (dept !== String(r.department)) upd.department = dept;

    if (!String(r.staff_id || '').trim()) problems.push('Baris ' + r._row + ': staff_id kosong');
    if (!String(r.nama || '').trim()) problems.push('Baris ' + r._row + ': nama kosong');
    if (!r.status) upd.status = 'aktif';
    if (!r.token_version) upd.token_version = 1;
    if (r.mfa_disahkan === '' || r.mfa_disahkan === null) upd.mfa_disahkan = 'FALSE';
    if (r.deleted === '' || r.deleted === null) upd.deleted = 'FALSE';
    if (!r.jenis_emel && email) upd.jenis_emel = /@voltake\.com$/.test(email) ? 'syarikat' : 'gmail';
    if (!r.created_at) { upd.created_at = now; upd.created_by = by; }

    if (email) {
      if (seenEmail[email]) problems.push('Emel berulang: ' + email + ' (baris ' + seenEmail[email] + ' & ' + r._row + ')');
      seenEmail[email] = r._row;
    }
    var id = String(r.staff_id || '').trim();
    if (id) {
      if (seenId[id]) problems.push('Staff ID berulang: ' + id + ' (baris ' + seenId[id] + ' & ' + r._row + ')');
      seenId[id] = r._row;
    }
    if (Object.keys(upd).length) {
      upd.updated_at = now;
      upd.updated_by = by;
      updateObj_(sh, t.header, r._row, upd);
      fixed++;
    }
  });
  Logger.log('normalizeStaff: ' + fixed + ' baris dikemas kini. ' + (problems.length ? 'PERLU SEMAK:\n' + problems.join('\n') : 'Tiada masalah.'));
  return { fixed: fixed, problems: problems };
}
