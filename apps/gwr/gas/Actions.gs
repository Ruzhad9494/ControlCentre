/**
 * Actions.gs - web app GWR (F-30 hingga F-34; BSD 3.4, 4.1, 4.2, 4.3; IPD 2F).
 *
 * Role (BSD 4.1; sistem lama v4.2: login kata laluan "manager" / "engineer" (OMP: "supervisor") / "technician"):
 *   manager, supervisor, engineer, chargeman  isi maklumat projek (PO, quotation, MOS, klien, tajuk, lokasi, PIC),
 *                                            nampak semua report department sendiri
 *   technician                               sambung draf yang disediakan (maklumat projek dikunci, sistem lama
 *                                            applyRoleUI), nampak report sendiri + draf terbuka department
 *   manager sahaja                           batalkan report (sistem lama: padam dengan PIN admin)
 *   public (melalui /public/api + Turnstile) semak & tandatangan dengan token sekali guna
 * Department: skop `dept=OMP,PSS` di Akses modul, kosong = department staf. Mesti OMP atau PSS.
 * Identiti staf (emel, nama) dari sesi: sistem lama ditaip sendiri dalam borang.
 */

// Literal (bukan LEVELS dari Schema.gs): Apps Script muat fail ikut susunan, Actions dimuat dahulu.
var STAFF_ROLES = ['manager', 'supervisor', 'engineer', 'chargeman', 'technician'];
var ACTION_ROLES = {
  listReports:     STAFF_ROLES,
  getReport:       STAFF_ROLES,
  saveReport:      STAFF_ROLES,
  addImages:       STAFF_ROLES,
  submitReport:    STAFF_ROLES,
  regenerateLink:  STAFF_ROLES,
  getFile:         STAFF_ROLES,
  cancelReport:    ['manager'],
  getSignRequest:  ['public'],
  getSignPdf:      ['public'],
  clientApprove:   ['public']
};

var LIMITS = { teks: 120, panjang: 2000, jobs: 40, manpower: 20, batch: 3, nama: 100 };
var TOKEN_RE = /^[a-f0-9]{64}$/;
var DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
var PROJECT_FIELDS = ['tarikh', 'po_number', 'quotation_number', 'mos_number', 'project_id', 'client_company', 'project_title', 'location', 'pic_name', 'pic_phone'];
var OPEN_STATUSES = ['Draf', 'Menunggu klien', 'Luput'];

function doPost(e) {
  return handleRequest_(e, prop_('MODULE_SECRET'), routeGwr_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeGwr_(req) {
  var user = req.user || {};
  authorize_(ACTION_ROLES, req.action, user);
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var p = req.payload || {};
  switch (req.action) {
    case 'listReports':    return listReports_(ss, user);
    case 'getReport':      return getReport_(ss, user, p);
    case 'saveReport':     return saveReport_(ss, user, p);
    case 'addImages':      return addImages_(ss, user, p);
    case 'submitReport':   return submitReport_(ss, user, p);
    case 'regenerateLink': return regenerateLink_(ss, user, p);
    case 'getFile':        return getFile_(ss, user, p);
    case 'cancelReport':   return cancelReport_(ss, user, p);
    case 'getSignRequest': return getSignRequest_(ss, p);
    case 'getSignPdf':     return getSignPdf_(ss, p);
    case 'clientApprove':  return clientApprove_(ss, user, p);
  }
  throw httpError_(400, 'Action tidak dikenali');
}

// ---------------------------------------------------------------- bantuan

function hasRoleG_(user, r) { return (user.roles || []).indexOf(r) >= 0; }
function isSuper_(user) { return hasRoleG_(user, 'superadmin'); }
/** Tahap tertinggi pengguna. superadmin = manager. */
function level_(user) {
  if (isSuper_(user)) return 'manager';
  for (var i = 0; i < LEVELS.length; i++) if (hasRoleG_(user, LEVELS[i])) return LEVELS[i];
  return '';
}
function isPreparer_(user) { return PREPARERS.indexOf(level_(user)) >= 0; }
function textVal_(v) { return String(unsanitize_(v === null || v === undefined ? '' : v)); }

/** Department dalam skop: `dept=OMP,PSS` atau department staf. superadmin: semua. */
function userDepts_(user) {
  if (isSuper_(user)) return DEPTS.slice();
  var m = /dept=([^;]+)/i.exec(String(user.scope || ''));
  var list = (m ? m[1].split(',') : [String(user.department || '')]).map(function (s) { return s.trim().toUpperCase(); });
  return DEPTS.filter(function (d) { return list.indexOf(d) >= 0; });
}

function requireDepts_(user) {
  var d = userDepts_(user);
  if (!d.length) throw httpError_(403, 'Department anda bukan OMP / PSS. Minta admin tetapkan skop dept= di Akses modul.');
  return d;
}

function validDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function cleanText_(v, label, max) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (s.length > max) throw httpError_(400, label + ' maksimum ' + max + ' aksara');
  return s;
}

function cleanPhone_(v, label) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return '';
  var d = s.replace(/[\s()+-]/g, '');
  if (!/^\d{7,15}$/.test(d)) throw httpError_(400, label + ' tak sah');
  return s;
}

function cleanDt_(v, label) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return '';
  if (!DT_RE.test(s) || !validDate_(s.slice(0, 10))) throw httpError_(400, label + ' mesti tarikh & masa sah');
  return s;
}

/** Sistem lama cleanJobItems + shutdownSummary: JobShutdown dikira di server, bukan dipercayai dari pelayar. */
function cleanJobs_(arr) {
  if (!Array.isArray(arr)) return null;
  if (arr.length > LIMITS.jobs) throw httpError_(400, 'Maksimum ' + LIMITS.jobs + ' baris kerja');
  return arr.map(function (j) {
    j = j || {};
    var sd = j.shutdown === true;
    return { desc: cleanText_(j.desc, 'Keterangan kerja', LIMITS.panjang), remark: cleanText_(j.remark, 'Remark', 500), shutdown: sd, voltage: sd && VOLTAGES.indexOf(j.voltage) >= 0 ? j.voltage : '' };
  }).filter(function (j) { return j.desc || j.remark; });
}

function shutdownSummary_(jobs) {
  var sd = jobs.filter(function (j) { return j.shutdown; });
  if (!sd.length) return 'NO';
  var v = VOLTAGES.filter(function (x) { return sd.some(function (j) { return j.voltage === x; }); });
  return v.length ? 'YES - ' + v.join('/') : 'YES';
}

function jobDescText_(jobs) {
  return jobs.map(function (j) { return (j.shutdown ? '[SHUTDOWN' + (j.voltage ? ' ' + j.voltage : '') + '] ' : '') + j.desc + (j.remark ? '        ' + j.remark : ''); }).join('\n\n');
}

/** Sistem lama: Manpower "Jawatan | Pax | Nama", satu baris setiap jawatan. */
function cleanManpower_(arr) {
  if (!Array.isArray(arr)) return null;
  if (arr.length > LIMITS.manpower) throw httpError_(400, 'Maksimum ' + LIMITS.manpower + ' baris manpower');
  return arr.map(function (m) {
    m = m || {};
    var c = String(m.count === null || m.count === undefined ? '' : m.count).trim();
    if (c && (!/^\d{1,3}$/.test(c))) throw httpError_(400, 'Bilangan pax mesti nombor');
    return { role: cleanText_(m.role, 'Jawatan manpower', 40), count: c, names: cleanText_(m.names, 'Nama manpower', 300) };
  }).filter(function (m) { return m.role || m.count || m.names; });
}

function manpowerText_(rows) {
  return rows.map(function (m) { return (m.role || '-') + ' | ' + (m.count || '-') + ' | ' + (m.names || '-'); }).join('\n');
}

function settingsMap_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Settings');
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) { if (r.key !== '') out[String(r.key)] = String(unsanitize_(r.value)); });
  return out;
}

function reportsRows_(ss) {
  return readTable_(sheet_(ss, 'Reports')).rows.filter(function (r) { return !isDeleted_(r) && String(r.report_id); });
}

function isMine_(r, user) { return String(r.staff_email) === String(user.email) || String(r.created_by) === String(user.email); }

/** Boleh lihat: dept dalam skop; technician hanya report sendiri + yang masih terbuka (untuk sambung draf). */
function canView_(r, user) {
  if (userDepts_(user).indexOf(String(r.dept)) < 0) return false;
  if (level_(user) !== 'technician') return true;
  return isMine_(r, user) || OPEN_STATUSES.indexOf(String(r.status)) >= 0;
}

function mustReport_(rows, user, id, action) {
  var key = String(id || '').trim();
  if (!key) throw httpError_(400, 'report_id wajib');
  var r = rows.filter(function (x) { return String(x.report_id) === key; })[0];
  if (!r) throw httpError_(404, 'Report tidak dijumpai');
  if (!canView_(r, user)) { audit_(user.email, 'FORBIDDEN', action, key); throw httpError_(404, 'Report tidak dijumpai'); }
  return r;
}

function expired_(r) {
  var e = Date.parse(isoStr_(r.approval_token_expires));
  return String(r.status) === 'Luput' || (String(r.status) === 'Menunggu klien' && isFinite(e) && e < Date.now());
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase().slice(0, 64);
}

function signLink_(s, token) {
  var base = String(s.portal_url || '').replace(/\/+$/, '');
  return (base || '') + '/public/gwr-sign/?t=' + token;
}

function auditRow_(by) {
  var now = nowIso_();
  return { created_at: now, created_by: by, updated_at: now, updated_by: by, deleted: 'FALSE', deleted_reason: '' };
}

function summary_(r, user) {
  var st = String(r.status);
  if (st === 'Menunggu klien' && expired_(r)) st = 'Luput';
  return {
    report_id: String(r.report_id), dept: String(r.dept), tarikh: dateStr_(r.tarikh), po_number: textVal_(r.po_number),
    client_company: textVal_(r.client_company), project_title: textVal_(r.project_title), location: textVal_(r.location),
    staff_name: textVal_(r.staff_name), status: st, job_shutdown: String(r.job_shutdown || ''), ptw: String(r.ptw || ''),
    unresolved_issue: textVal_(r.unresolved_issue), submitted_at: isoStr_(r.submitted_at), approved_at: isoStr_(r.approved_at),
    pautan_luput: isoStr_(r.approval_token_expires), ada_draf: String(r.draft_pdf_file_id || '') !== '', ada_final: String(r.final_pdf_file_id || '') !== '',
    milik_saya: isMine_(r, user), dikemas_kini: isoStr_(r.updated_at)
  };
}

// ---------------------------------------------------------------- S-32 dashboard, S-33 butiran

function listReports_(ss, user) {
  var depts = requireDepts_(user);
  var rows = reportsRows_(ss).filter(function (r) { return canView_(r, user); });
  rows.sort(function (a, b) { return dateStr_(b.tarikh).localeCompare(dateStr_(a.tarikh)) || isoStr_(b.updated_at).localeCompare(isoStr_(a.updated_at)); });
  return { depts: depts, tahap: level_(user), boleh_sedia: isPreparer_(user), laporan: rows.slice(0, 1500).map(function (r) { return summary_(r, user); }) };
}

function getReport_(ss, user, p) {
  var r = mustReport_(reportsRows_(ss), user, p.report_id, 'getReport');
  var out = summary_(r, user);
  PROJECT_FIELDS.concat(['quotation_number', 'mos_number', 'time_in', 'time_out', 'sign_client_name', 'sign_client_position', 'sign_client_phone', 'staff_position', 'client_sign_name', 'client_sign_position', 'client_sign_phone', 'client_email'])
    .forEach(function (k) { if (!(k in out)) out[k] = k === 'tarikh' ? dateStr_(r[k]) : textVal_(r[k]); });
  out.project_id = textVal_(r.project_id);
  out.job_items = parseArr_(r.job_items_json);
  out.manpower_items = parseArr_(r.manpower_json);
  out.gambar = parseArr_(r.image_ids_json).map(function (im, i) { return { index: i, desc: im.desc || '' }; });
  out.ada_tandatangan_staf = String(r.staff_signature_file_id || '') !== '';
  out.ada_tandatangan_klien = String(r.client_signature_file_id || '') !== '';
  var lvl = level_(user);
  out.boleh_ubah = ['Draf', 'Menunggu klien', 'Luput'].indexOf(out.status) >= 0;
  out.boleh_ubah_projek = out.boleh_ubah && isPreparer_(user);
  out.boleh_pautan = (out.status === 'Menunggu klien' || out.status === 'Luput') && out.ada_draf && (isPreparer_(user) || isMine_(r, user));
  out.boleh_batal = lvl === 'manager' && ['Disahkan', 'Dibatalkan'].indexOf(out.status) < 0;
  return out;
}

// ---------------------------------------------------------------- S-30 borang: simpan draf

/**
 * payload: { report_id? (sambung draf), client_req_id (kunci anti-ulangan offline, wajib bila cipta), dept?,
 *   tarikh, po_number, quotation_number, mos_number, project_id, client_company, project_title, location, pic_name, pic_phone,
 *   time_in, time_out, job_items, ptw, unresolved_issue, manpower_items, sign_client_name/position/phone, staff_position,
 *   gambar_susunan?: [{ index, desc }] (susun / buang / ubah keterangan gambar sedia ada) }
 * Report yang Menunggu klien / Luput diubah -> kembali Draf, pautan klien lama mati. Disahkan / Dibatalkan dikunci
 * (sistem lama assertNotApproved). Technician tak boleh cipta report baharu atau ubah maklumat projek.
 */
function saveReport_(ss, user, p) {
  var depts = requireDepts_(user);
  var prep = isPreparer_(user);
  var f = {};
  if (prep) {
    if (p.tarikh !== undefined) {
      var t = String(p.tarikh || '').trim();
      if (t && !validDate_(t)) throw httpError_(400, 'Tarikh tak sah');
      f.tarikh = t;
    }
    [['po_number', 'No. PO', 60], ['quotation_number', 'No. quotation', 60], ['mos_number', 'No. MOS', 60], ['project_id', 'ID projek', 30],
      ['client_company', 'Klien', LIMITS.teks], ['project_title', 'Tajuk projek', 300], ['location', 'Lokasi', 200], ['pic_name', 'PIC klien', LIMITS.nama]]
      .forEach(function (x) { if (p[x[0]] !== undefined) f[x[0]] = cleanText_(p[x[0]], x[1], x[2]); });
    if (p.pic_phone !== undefined) f.pic_phone = cleanPhone_(p.pic_phone, 'Telefon PIC');
  }
  if (p.time_in !== undefined) f.time_in = cleanDt_(p.time_in, 'Time in');
  if (p.time_out !== undefined) f.time_out = cleanDt_(p.time_out, 'Time out');
  if (f.time_in && f.time_out && f.time_out < f.time_in) throw httpError_(400, 'Time out mesti selepas time in');
  var jobs = cleanJobs_(p.job_items);
  if (jobs) { f.job_items_json = JSON.stringify(jobs); f.job_desc = jobDescText_(jobs); f.job_shutdown = shutdownSummary_(jobs); }
  if (p.ptw !== undefined) f.ptw = p.ptw === true || p.ptw === 'YES' ? 'YES' : 'NO';
  if (p.unresolved_issue !== undefined) f.unresolved_issue = cleanText_(p.unresolved_issue, 'Unresolved issue', LIMITS.panjang);
  var man = cleanManpower_(p.manpower_items);
  if (man) { f.manpower_json = JSON.stringify(man); f.manpower = manpowerText_(man); }
  [['sign_client_name', 'Nama PIC klien', LIMITS.nama], ['sign_client_position', 'Jawatan PIC klien', LIMITS.teks], ['staff_position', 'Jawatan staf', LIMITS.teks]]
    .forEach(function (x) { if (p[x[0]] !== undefined) f[x[0]] = cleanText_(p[x[0]], x[1], x[2]); });
  if (p.sign_client_phone !== undefined) f.sign_client_phone = cleanPhone_(p.sign_client_phone, 'Telefon PIC klien');

  var reqId = String(p.client_req_id || '').trim();
  if (reqId && !/^[A-Za-z0-9-]{8,64}$/.test(reqId)) throw httpError_(400, 'client_req_id tak sah');
  var sh = sheet_(ss, 'Reports');
  var saved, removed = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t2 = readTable_(sh);
    var live = t2.rows.filter(function (r) { return !isDeleted_(r) && String(r.report_id); });
    var cur;
    if (p.report_id) {
      cur = mustReport_(live, user, p.report_id, 'saveReport');
    } else {
      // Anti-ulangan (sistem lama findDuplicateResponse): client_req_id sama -> pulang report sedia ada
      cur = reqId ? live.filter(function (r) { return String(r.client_req_id) === reqId; })[0] : null;
      if (cur) {
        if (!canView_(cur, user)) throw httpError_(404, 'Report tidak dijumpai');
        return { report_id: String(cur.report_id), duplicate: true, report: summary_(cur, user) };
      }
      if (!prep) throw httpError_(403, 'Technician hanya boleh sambung draf yang disediakan oleh manager / supervisor / engineer / chargeman. Cari draf ikut No. PO.');
      if (!reqId) throw httpError_(400, 'client_req_id wajib');
    }
    if (cur && ['Disahkan', 'Dibatalkan'].indexOf(String(cur.status)) >= 0) {
      throw httpError_(409, 'Report ' + cur.report_id + ' sudah ' + cur.status + ' dan tidak boleh diubah. Tekan "Borang baru" untuk report seterusnya.');
    }
    if (cur && Array.isArray(p.gambar_susunan)) {
      var imgs = parseArr_(cur.image_ids_json);
      var seen = {};
      var next = p.gambar_susunan.map(function (g) {
        var i = Number(g && g.index);
        if (!isFinite(i) || !imgs[i] || seen[i]) throw httpError_(400, 'Susunan gambar tak sah');
        seen[i] = true;
        return { id: imgs[i].id, desc: cleanText_(g.desc, 'Keterangan gambar', 200) };
      });
      removed = imgs.filter(function (_, i) { return !seen[i]; }).map(function (im) { return im.id; });
      f.image_ids_json = JSON.stringify(next);
    }
    var now = nowIso_();
    f.updated_at = now; f.updated_by = user.email;
    if (cur) {
      if (String(cur.status) !== 'Draf') { f.status = 'Draf'; f.approval_token_hash = ''; f.approval_token_expires = ''; }
      updateRowObj_(sh, t2.header, cur._row, f);
      saved = Object.assign({}, cur, f);
    } else {
      var dept = String(p.dept || depts[0]).toUpperCase();
      if (depts.indexOf(dept) < 0) throw httpError_(403, 'Department ' + dept + ' di luar skop anda');
      saved = Object.assign(auditRow_(user.email), {
        report_id: nextId_(ss, 'GWR-' + dept, 5), dept: dept, client_req_id: reqId, status: 'Draf', image_ids_json: '[]', upload_keys: '',
        staff_email: '', staff_name: '', staff_signature_file_id: '', draft_pdf_file_id: '', final_pdf_file_id: '', emel_dihantar: ''
      }, f);
      appendObj_(sh, t2.header, saved);
    }
  } finally {
    lock.releaseLock();
  }
  removed.forEach(trashFile_);
  audit_(user.email, cur ? 'SAVE_DRAFT' : 'CREATE_REPORT', String(saved.report_id), 'PO ' + textVal_(saved.po_number) + (removed.length ? '; ' + removed.length + ' gambar dibuang' : ''));
  return { report_id: String(saved.report_id), report: summary_(saved, user) };
}

/**
 * payload: { report_id, batch_id, images: [{ data, desc }] (maksimum 3, sistem lama UPLOAD_BATCH) }.
 * Gambar ditambah di hujung. batch_id sama dihantar semula (sambungan putus) -> tidak digandakan.
 */
function addImages_(ss, user, p) {
  var batch = String(p.batch_id || '').trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(batch)) throw httpError_(400, 'batch_id tak sah');
  var list = Array.isArray(p.images) ? p.images : [];
  if (!list.length || list.length > LIMITS.batch) throw httpError_(400, '1 hingga ' + LIMITS.batch + ' gambar setiap kali');
  var parsed = list.map(function (im, i) {
    var x = parseUpload_(im, 'Gambar ' + (i + 1));
    if (!/^image\//.test(x.mime)) throw httpError_(400, 'Gambar ' + (i + 1) + ' mesti JPG / PNG');
    return { file: x, desc: cleanText_(im.desc, 'Keterangan gambar', 200) };
  });
  var sh = sheet_(ss, 'Reports');
  var pre = mustReport_(reportsRows_(ss), user, p.report_id, 'addImages');
  var keys = String(pre.upload_keys || '').split(',');
  if (keys.indexOf(batch) >= 0) return { report_id: String(pre.report_id), bil_gambar: parseArr_(pre.image_ids_json).length, duplicate: true };
  if (['Disahkan', 'Dibatalkan'].indexOf(String(pre.status)) >= 0) throw httpError_(409, 'Report sudah ' + pre.status);
  var ids = parsed.map(function (x) { return { id: storeFile_(x.file, pre.report_id, 'gambar', String(pre.dept)), desc: x.desc }; });
  var count;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = readTable_(sh);
    var r = mustReport_(t.rows.filter(function (x) { return !isDeleted_(x); }), user, p.report_id, 'addImages');
    var k2 = String(r.upload_keys || '').split(',').filter(String);
    if (k2.indexOf(batch) >= 0) { ids.forEach(function (x) { trashFile_(x.id); }); return { report_id: String(r.report_id), bil_gambar: parseArr_(r.image_ids_json).length, duplicate: true }; }
    var imgs = parseArr_(r.image_ids_json).concat(ids);
    if (imgs.length > MAX_IMAGES) throw httpError_(400, 'Maksimum ' + MAX_IMAGES + ' gambar satu report');
    k2.push(batch);
    var f = { image_ids_json: JSON.stringify(imgs), upload_keys: k2.slice(-60).join(','), updated_at: nowIso_(), updated_by: user.email };
    if (String(r.status) !== 'Draf') { f.status = 'Draf'; f.approval_token_hash = ''; f.approval_token_expires = ''; }
    updateRowObj_(sh, t.header, r._row, f);
    count = imgs.length;
  } catch (e) {
    ids.forEach(function (x) { trashFile_(x.id); });
    throw e;
  } finally {
    lock.releaseLock();
  }
  return { report_id: String(pre.report_id), bil_gambar: count };
}

// ---------------------------------------------------------------- hantar: PDF draf + pautan klien

function missingForSubmit_(r) {
  var need = [['tarikh', 'Tarikh'], ['po_number', 'No. PO'], ['client_company', 'Klien'], ['project_title', 'Tajuk projek'], ['location', 'Lokasi'],
    ['pic_name', 'PIC klien'], ['time_in', 'Time in'], ['time_out', 'Time out']];
  var miss = need.filter(function (x) { return !String(r[x[0]] || '').trim(); }).map(function (x) { return x[1]; });
  if (!parseArr_(r.job_items_json).length) miss.push('Job description');
  if (!parseArr_(r.manpower_json).length) miss.push('Manpower');
  return miss;
}

/**
 * payload: { report_id, submit_id, tandatangan: { data } (wajib), staff_position? }.
 * Staf = pengguna sesi. Server jana PDF draf, token 32 bait (hanya hash disimpan), luput N hari.
 * Pulang pautan SEKALI (token mentah tidak boleh dibaca semula: guna regenerateLink).
 * submit_id sama dihantar semula: pulang pautan BAHARU untuk report yang sama (token lama tak pernah sampai).
 */
function submitReport_(ss, user, p) {
  var sid = String(p.submit_id || '').trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(sid)) throw httpError_(400, 'submit_id tak sah');
  var s = settingsMap_(ss);
  var pre = mustReport_(reportsRows_(ss), user, p.report_id, 'submitReport');
  var keys = String(pre.upload_keys || '').split(',');
  if (keys.indexOf('S' + sid) >= 0 && String(pre.status) === 'Menunggu klien') return rotateToken_(ss, user, pre, s, 'SUBMIT_RETRY');
  if (['Draf', 'Menunggu klien', 'Luput'].indexOf(String(pre.status)) < 0) throw httpError_(409, 'Report sudah ' + pre.status);
  var miss = missingForSubmit_(pre);
  if (miss.length) throw httpError_(400, 'Lengkapkan dahulu: ' + miss.join(', '));
  if (!p.tandatangan) throw httpError_(400, 'Tandatangan staf wajib');
  var sig = parseUpload_(p.tandatangan, 'Tandatangan');
  if (!/^image\//.test(sig.mime)) throw httpError_(400, 'Tandatangan tak sah');
  var position = cleanText_(p.staff_position !== undefined ? p.staff_position : pre.staff_position, 'Jawatan staf', LIMITS.teks) || level_(user).replace(/^./, function (c) { return c.toUpperCase(); });
  var sigId = storeFile_(sig, pre.report_id, 'tandatangan', String(pre.dept));
  var sh = sheet_(ss, 'Reports');
  var token = newToken_();
  var days = Number(s.pautan_luput_hari) > 0 ? Number(s.pautan_luput_hari) : 7;
  var saved, oldSig = '', oldPdf = '';
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = readTable_(sh);
    var r = mustReport_(t.rows.filter(function (x) { return !isDeleted_(x); }), user, p.report_id, 'submitReport');
    if (['Draf', 'Menunggu klien', 'Luput'].indexOf(String(r.status)) < 0) throw httpError_(409, 'Report sudah ' + r.status);
    var now = nowIso_();
    var f = {
      staff_email: user.email, staff_name: String(user.nama || ''), staff_position: position, staff_signature_file_id: sigId,
      status: 'Menunggu klien', submitted_at: now, approval_token_hash: sha256Hex_(token),
      approval_token_expires: new Date(Date.now() + days * 864e5).toISOString(),
      upload_keys: String(r.upload_keys || '').split(',').filter(String).concat(['S' + sid]).slice(-60).join(','),
      updated_at: now, updated_by: user.email
    };
    oldSig = String(r.staff_signature_file_id || '');
    oldPdf = String(r.draft_pdf_file_id || '');
    var merged = Object.assign({}, r, f);
    f.draft_pdf_file_id = buildPdf_(merged, s, false);
    updateRowObj_(sh, t.header, r._row, f);
    saved = Object.assign(merged, f);
  } catch (e) {
    trashFile_(sigId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  trashFile_(oldSig); trashFile_(oldPdf);
  audit_(user.email, 'SUBMIT_REPORT', String(saved.report_id), 'PO ' + textVal_(saved.po_number) + '; pautan luput ' + days + ' hari');
  return { report_id: String(saved.report_id), pautan: signLink_(s, token), luput: saved.approval_token_expires, report: summary_(saved, user) };
}

function rotateToken_(ss, user, r0, s, why) {
  var sh = sheet_(ss, 'Reports');
  var token = newToken_();
  var days = Number(s.pautan_luput_hari) > 0 ? Number(s.pautan_luput_hari) : 7;
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = readTable_(sh);
    var r = t.rows.filter(function (x) { return !isDeleted_(x) && String(x.report_id) === String(r0.report_id); })[0];
    if (!r || ['Menunggu klien', 'Luput'].indexOf(String(r.status)) < 0) throw httpError_(409, 'Report telah berubah. Muat semula.');
    var f = { status: 'Menunggu klien', approval_token_hash: sha256Hex_(token), approval_token_expires: new Date(Date.now() + days * 864e5).toISOString(), updated_at: nowIso_(), updated_by: user.email };
    updateRowObj_(sh, t.header, r._row, f);
    saved = Object.assign({}, r, f);
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, why, String(saved.report_id), 'pautan baharu, yang lama mati');
  return { report_id: String(saved.report_id), pautan: signLink_(s, token), luput: saved.approval_token_expires, report: summary_(saved, user) };
}

/** payload: { report_id }. Pautan klien baharu (yang lama mati). Pemilik atau manager/supervisor/engineer/chargeman. */
function regenerateLink_(ss, user, p) {
  var r = mustReport_(reportsRows_(ss), user, p.report_id, 'regenerateLink');
  if (!isPreparer_(user) && !isMine_(r, user)) { audit_(user.email, 'FORBIDDEN', 'regenerateLink', String(r.report_id)); throw httpError_(403, 'Tiada kebenaran'); }
  if (['Menunggu klien', 'Luput'].indexOf(String(r.status)) < 0 || !String(r.draft_pdf_file_id || '')) throw httpError_(409, 'Pautan hanya untuk report yang menunggu klien');
  return rotateToken_(ss, user, r, settingsMap_(ss), 'REGENERATE_LINK');
}

/** payload: { report_id, sebab }. Manager sahaja (sistem lama: padam dengan PIN admin). Rekod & fail disimpan. */
function cancelReport_(ss, user, p) {
  var sebab = cleanText_(p.sebab, 'Sebab', 300);
  if (sebab.length < 3) throw httpError_(400, 'Sebab wajib diisi');
  var sh = sheet_(ss, 'Reports');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var r;
  try {
    var t = readTable_(sh);
    r = mustReport_(t.rows.filter(function (x) { return !isDeleted_(x); }), user, p.report_id, 'cancelReport');
    if (['Disahkan', 'Dibatalkan'].indexOf(String(r.status)) >= 0) throw httpError_(409, 'Report sudah ' + r.status);
    updateRowObj_(sh, t.header, r._row, { status: 'Dibatalkan', approval_token_hash: '', approval_token_expires: '', deleted_reason: 'Dibatalkan: ' + sebab, updated_at: nowIso_(), updated_by: user.email });
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'CANCEL_REPORT', String(r.report_id), sebab);
  return true;
}

/** payload: { report_id, jenis: 'draf'|'final'|'gambar'|'tandatangan_staf'|'tandatangan_klien', index? } */
function getFile_(ss, user, p) {
  var r = mustReport_(reportsRows_(ss), user, p.report_id, 'getFile');
  var id = '';
  var j = String(p.jenis || '');
  if (j === 'draf') id = r.draft_pdf_file_id;
  else if (j === 'final') id = r.final_pdf_file_id;
  else if (j === 'tandatangan_staf') id = r.staff_signature_file_id;
  else if (j === 'tandatangan_klien') id = r.client_signature_file_id;
  else if (j === 'gambar') { var im = parseArr_(r.image_ids_json)[Number(p.index)]; id = im ? im.id : ''; }
  else throw httpError_(400, 'Jenis fail tak sah');
  if (!String(id || '')) throw httpError_(404, 'Tiada fail');
  var f;
  try { f = readFile_(String(id)); } catch (e) { throw httpError_(404, 'Fail tidak dapat dibuka'); }
  if (j !== 'gambar') audit_(user.email, 'VIEW_FILE', String(r.report_id), j);
  return f;
}

// ---------------------------------------------------------------- S-34 awam: tandatangan klien (F-32)

/** Cari report ikut token (hash). Pautan tak sah / dah guna = 404; luput = 410. */
function findByToken_(rows, token) {
  var t = String(token || '').trim().toLowerCase();
  if (!TOKEN_RE.test(t)) throw httpError_(404, 'Pautan tidak sah atau sudah digunakan');
  var h = sha256Hex_(t);
  var r = rows.filter(function (x) { return String(x.approval_token_hash) === h; })[0];
  if (!r || String(r.status) === 'Dibatalkan') throw httpError_(404, 'Pautan tidak sah atau sudah digunakan');
  if (expired_(r)) throw httpError_(410, 'Pautan ini telah luput. Minta staf Voltake hantar pautan baharu.');
  if (String(r.status) !== 'Menunggu klien') throw httpError_(404, 'Pautan tidak sah atau sudah digunakan');
  return r;
}

/** Medan terhad untuk klien (BSD 4.2: Reports medan terhad). Tiada emel staf, tiada ID fail. */
function getSignRequest_(ss, p) {
  var r = findByToken_(reportsRows_(ss), p.token);
  return {
    report_id: String(r.report_id), dept: String(r.dept), tarikh: dateStr_(r.tarikh), po_number: textVal_(r.po_number),
    quotation_number: textVal_(r.quotation_number), mos_number: textVal_(r.mos_number), client_company: textVal_(r.client_company),
    project_title: textVal_(r.project_title), location: textVal_(r.location), time_in: textVal_(r.time_in), time_out: textVal_(r.time_out),
    pic_name: textVal_(r.pic_name), job_items: parseArr_(r.job_items_json), unresolved_issue: textVal_(r.unresolved_issue),
    manpower: textVal_(r.manpower), ptw: String(r.ptw || ''), job_shutdown: String(r.job_shutdown || ''),
    staff_name: textVal_(r.staff_name), staff_position: textVal_(r.staff_position), bil_gambar: parseArr_(r.image_ids_json).length,
    cadangan: { nama: textVal_(r.sign_client_name || r.pic_name), jawatan: textVal_(r.sign_client_position), telefon: textVal_(r.sign_client_phone || r.pic_phone) },
    luput: isoStr_(r.approval_token_expires)
  };
}

function getSignPdf_(ss, p) {
  var r = findByToken_(reportsRows_(ss), p.token);
  return readFile_(String(r.draft_pdf_file_id));
}

/**
 * payload: { token, nama, jawatan, telefon, emel, tandatangan: { data }, setuju: true }.
 * Sekali guna: hash dikosongkan. PDF final dijana di server dan dihantar sebagai lampiran kepada klien, staf
 * dan emel_cc_<DEPT> (F-34). Sistem lama: PDF final dijana oleh pelayar klien.
 */
function clientApprove_(ss, user, p) {
  if (p.setuju !== true) throw httpError_(400, 'Sila tandakan pengesahan');
  var nama = cleanText_(p.nama, 'Nama', LIMITS.nama);
  if (nama.length < 3) throw httpError_(400, 'Nama wajib diisi');
  var jawatan = cleanText_(p.jawatan, 'Jawatan', LIMITS.teks);
  if (!jawatan) throw httpError_(400, 'Jawatan wajib diisi');
  var telefon = cleanPhone_(p.telefon, 'No. telefon');
  if (!telefon) throw httpError_(400, 'No. telefon wajib diisi');
  var emel = normEmail_(p.emel);
  if (!emel) throw httpError_(400, 'Emel tak sah (salinan PDF dihantar ke emel ini)');
  if (!p.tandatangan) throw httpError_(400, 'Tandatangan wajib');
  var sig = parseUpload_(p.tandatangan, 'Tandatangan');
  if (!/^image\//.test(sig.mime)) throw httpError_(400, 'Tandatangan tak sah');
  var pre = findByToken_(reportsRows_(ss), p.token);
  var s = settingsMap_(ss);
  var sigId = storeFile_(sig, pre.report_id, 'tandatangan', String(pre.dept));
  var sh = sheet_(ss, 'Reports');
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = readTable_(sh);
    var r = findByToken_(t.rows.filter(function (x) { return !isDeleted_(x) && String(x.report_id); }), p.token);
    var now = nowIso_();
    var f = {
      status: 'Disahkan', client_sign_name: nama, client_sign_position: jawatan, client_sign_phone: telefon, client_email: emel,
      client_signature_file_id: sigId, approved_at: now, approval_token_hash: '', approval_token_expires: '',
      client_ip_hash: String(user.ip_hash || ''), updated_at: now, updated_by: 'klien'
    };
    var merged = Object.assign({}, r, f);
    try { f.final_pdf_file_id = buildPdf_(merged, s, true); } catch (e) { f.final_pdf_file_id = ''; Logger.log('PDF final gagal: ' + e); }
    updateRowObj_(sh, t.header, r._row, f);
    saved = Object.assign(merged, f);
  } catch (e) {
    trashFile_(sigId);
    throw e;
  } finally {
    lock.releaseLock();
  }
  audit_('klien', 'CLIENT_APPROVE', String(saved.report_id), 'oleh ' + nama + ' (' + jawatan + ')');
  var sent = notifyApproved_(ss, saved, s);
  if (sent) { try { var t3 = readTable_(sh); var r3 = t3.rows.filter(function (x) { return String(x.report_id) === String(saved.report_id); })[0]; if (r3) updateRowObj_(sh, t3.header, r3._row, { emel_dihantar: sent }); } catch (e) { /* tidak kritikal */ } }
  return { report_id: String(saved.report_id), emel_klien: sent.indexOf('klien') >= 0 };
}
