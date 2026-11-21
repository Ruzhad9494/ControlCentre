/**
 * Actions.gs - web app Draft Mohon Kerja (F-10 hingga F-14; BSD 3.2, 4.1, 4.2, 4.3; IPD 2E).
 *
 * Role:
 *   `public`       borang awam melalui /public/api (Turnstile + had kadar di Cloudflare): senarai jawatan, hantar permohonan
 *   `hr_admin`     HR: semua pemohon (penuh), ubah status / department / tarikh interview / catatan, jawatan, anonimkan
 *   `interviewer`  pemohon department SENDIRI sahaja (skop `dept=...` di Akses modul, kosong = department staf),
 *                  medan terhad (IC dimask, tiada rekod jenayah / alamat / rujukan / kecemasan / tel / emel),
 *                  beri markah & cadangan (Interviews)
 * Sistem lama: SECRET_KEY dalam HTML dashboard + token department dalam URL papan interviewer. Kini login Google + role.
 * Penapisan department dibuat di SERVER (sama prinsip dengan sistem lama, tapi tanpa token boleh dikongsi).
 */

var ACTION_ROLES = {
  listOpenPositions: ['public', 'hr_admin', 'interviewer'],
  submitApplication: ['public'],
  listApplicants:    ['hr_admin', 'interviewer'],
  getApplicant:      ['hr_admin', 'interviewer'],
  getFile:           ['hr_admin', 'interviewer'],
  updateApplicant:   ['hr_admin'],
  anonymiseApplicant:['hr_admin'],
  listPositions:     ['hr_admin'],
  savePosition:      ['hr_admin'],
  saveInterview:     ['hr_admin', 'interviewer']
};

var LIMITS = { nama_min: 3, nama: 100, teks: 120, alamat: 300, catatan: 1000, akademik: 10, pengalaman: 10, gaji: 100000 };

function doPost(e) {
  return handleRequest_(e, prop_('MODULE_SECRET'), routeHr_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeHr_(req) {
  var user = req.user || {};
  authorize_(ACTION_ROLES, req.action, user);
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var p = req.payload || {};
  switch (req.action) {
    case 'listOpenPositions':  return listOpenPositions_(ss);
    case 'submitApplication':  return submitApplication_(ss, user, p);
    case 'listApplicants':     return listApplicants_(ss, user);
    case 'getApplicant':       return getApplicant_(ss, user, p);
    case 'getFile':            return getFile_(ss, user, p);
    case 'updateApplicant':    return updateApplicant_(ss, user, p);
    case 'anonymiseApplicant': return anonymiseApplicant_(ss, user, p);
    case 'listPositions':      return listPositions_(ss);
    case 'savePosition':       return savePosition_(ss, user, p);
    case 'saveInterview':      return saveInterview_(ss, user, p);
  }
  throw httpError_(400, 'Action tidak dikenali');
}

// ---------------------------------------------------------------- bantuan

function hasRoleH_(user, r) { return (user.roles || []).indexOf(r) >= 0; }
/** HR penuh. `superadmin` portal dikira HR (authorize_ kongsi benarkan superadmin). */
function isHr_(user) { return hasRoleH_(user, 'hr_admin') || hasRoleH_(user, 'superadmin'); }
function textVal_(v) { return String(unsanitize_(v === null || v === undefined ? '' : v)); }
function truthy_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function validDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function cleanText_(v, label, max, required) {
  var s = String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' ');
  if (required && !s) throw httpError_(400, label + ' wajib diisi');
  if (s.length > max) throw httpError_(400, label + ' maksimum ' + max + ' aksara');
  return s;
}

function cleanNote_(v, label, max, required) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (required && !s) throw httpError_(400, label + ' wajib diisi');
  if (s.length > max) throw httpError_(400, label + ' maksimum ' + max + ' aksara');
  return s;
}

function pick_(v, list, label, required) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s && !required) return '';
  if (list.indexOf(s) < 0) throw httpError_(400, label + ' tak sah');
  return s;
}

/** Telefon Malaysia: simpan dengan sengkang (sistem lama formatPhoneMy), cth 012-3456789, 03-12345678. */
function cleanPhone_(v, label, required) {
  var d = String(v === null || v === undefined ? '' : v).replace(/[\s-]/g, '').replace(/^\+?60/, '0');
  if (!d) { if (required) throw httpError_(400, label + ' wajib diisi'); return ''; }
  if (!/^0\d{8,10}$/.test(d)) throw httpError_(400, label + ' tak sah');
  return /^01/.test(d) ? d.slice(0, 3) + '-' + d.slice(3) : d.slice(0, 2) + '-' + d.slice(2);
}

/** IC 12 digit (BSD 3.2). Pulang { ic: '900101145123', dob: '1990-01-01' }. Tarikh lahir dikira dari IC. */
function cleanIcDob_(v) {
  var d = String(v === null || v === undefined ? '' : v).replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(d)) throw httpError_(400, 'No. kad pengenalan mesti 12 digit');
  var yy = Number(d.slice(0, 2));
  var thisYY = Number(todayIso_().slice(2, 4));
  var year = (yy > thisYY ? 1900 : 2000) + yy;
  var dob = year + '-' + d.slice(2, 4) + '-' + d.slice(4, 6);
  if (!validDate_(dob)) throw httpError_(400, 'No. kad pengenalan tak sah (tarikh lahir)');
  return { ic: d, dob: dob };
}

function maskIc_(ic) {
  var d = String(ic || '').replace(/\D/g, '');
  return d.length === 12 ? '******-**-' + d.slice(8) : (d ? '******' : '');
}

function settingsMap_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Settings');
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) { if (r.key !== '') out[String(r.key)] = String(unsanitize_(r.value)); });
  return out;
}

function auditRow_(by) {
  var now = nowIso_();
  return { created_at: now, created_by: by, updated_at: now, updated_by: by, deleted: 'FALSE', deleted_reason: '' };
}

function parseJson_(v) {
  try { var x = JSON.parse(String(unsanitize_(v || '[]'))); return Array.isArray(x) ? x : []; } catch (e) { return []; }
}

/** Department dalam skop interviewer: `dept=PSS,OMP` (Akses modul) atau department staf sendiri. Huruf kecil. */
function scopeDepts_(user) {
  var m = /dept=([^;]+)/i.exec(String(user.scope || ''));
  var list = m ? m[1].split(',') : [String(user.department || '')];
  return list.map(function (s) { return s.trim().toLowerCase(); }).filter(String);
}

function inScope_(user, a) {
  if (isHr_(user)) return true;
  var dept = String(a.department || '').trim().toLowerCase();
  return dept !== '' && scopeDepts_(user).indexOf(dept) >= 0;
}

function applicantsRows_(ss) {
  return readTable_(sheet_(ss, 'Applicants')).rows.filter(function (r) { return !isDeleted_(r) && String(r.app_no); });
}

function findApplicant_(rows, no) {
  var key = String(no || '').trim();
  if (!key) throw httpError_(400, 'app_no wajib');
  return rows.filter(function (r) { return String(r.app_no) === key; })[0] || null;
}

/** Ambil pemohon + semak skop. Interviewer di luar skop = 404 (tidak dedah kewujudan) + audit FORBIDDEN. */
function mustApplicant_(rows, user, no, action) {
  var a = findApplicant_(rows, no);
  if (!a) throw httpError_(404, 'Pemohon tidak dijumpai');
  if (!inScope_(user, a)) {
    audit_(user.email, 'FORBIDDEN', action, String(no));
    throw httpError_(404, 'Pemohon tidak dijumpai');
  }
  return a;
}

/** Ringkasan untuk senarai (S-12, S-15). IC sentiasa dimask dalam senarai (AFD S-12). */
function applicantSummary_(a, user) {
  return {
    app_no: String(a.app_no), jawatan: textVal_(a.jawatan), department: textVal_(a.department), nama: textVal_(a.nama),
    ic_mask: maskIc_(a.ic), jantina: String(a.jantina || ''), status: String(a.status || 'Baru'),
    tarikh_mohon: isoStr_(a.created_at), tarikh_interview: dateStr_(a.tarikh_interview), interview_tukar: Number(a.interview_tukar) || 0,
    gaji_dijangka: a.gaji_dijangka === '' || a.gaji_dijangka === null || a.gaji_dijangka === undefined ? null : Number(a.gaji_dijangka),
    ada_gambar: String(a.photo_file_id || '') !== '', anonymised: truthy_(a.anonymised),
    catatan_hr: isHr_(user) ? textVal_(a.catatan_hr) : undefined
  };
}

// ---------------------------------------------------------------- awam: S-10, S-11 (F-10, F-13)

function openPositions_(ss) {
  var today = todayIso_();
  return readTable_(sheet_(ss, 'Positions')).rows.filter(function (r) {
    return !isDeleted_(r) && String(r.position_id) && truthy_(r.aktif) && (!dateStr_(r.tarikh_tutup) || dateStr_(r.tarikh_tutup) >= today);
  });
}

/** Medan terhad sahaja (BSD 4.2: public R aktif sahaja). */
function listOpenPositions_(ss) {
  var s = settingsMap_(ss);
  return {
    jawatan: openPositions_(ss).map(function (r) {
      return { position_id: String(r.position_id), jawatan: textVal_(r.jawatan), department: textVal_(r.department), lokasi: textVal_(r.lokasi), penerangan: textVal_(r.penerangan), tarikh_tutup: dateStr_(r.tarikh_tutup) };
    }),
    benarkan_jawatan_lain: String(s.benarkan_jawatan_lain || 'TRUE').toUpperCase() !== 'FALSE',
    consent_version: CONSENT_VERSION
  };
}

function cleanRows_(raw, max, label, cols, minRows) {
  var list = Array.isArray(raw) ? raw : [];
  if (list.length > max) throw httpError_(400, label + ': maksimum ' + max + ' baris');
  var out = list.map(function (row, i) {
    var o = {};
    cols.forEach(function (c) { o[c[0]] = cleanText_(row && row[c[0]], label + ' baris ' + (i + 1) + ' (' + c[1] + ')', LIMITS.teks, c[2]); });
    return o;
  }).filter(function (o) { return Object.keys(o).some(function (k) { return o[k]; }); });
  if (out.length < (minRows || 0)) throw httpError_(400, label + ': isi sekurang-kurangnya ' + minRows + ' baris');
  return out;
}

/**
 * payload: medan borang (sistem lama index.html) + consent: { setuju: true, versi } + gambar?, tandatangan, resume?
 *   + website (honeypot, mesti kosong). Identiti: 'public'. Pulang { app_no } sahaja (S-11).
 */
function submitApplication_(ss, user, p) {
  if (String(p.website || '') !== '') throw httpError_(400, 'Permohonan tidak dapat diproses');   // honeypot bot
  if (!p.consent || p.consent.setuju !== true || String(p.consent.versi || '') !== CONSENT_VERSION) {
    throw httpError_(400, 'Sila baca notis privasi dan tandakan persetujuan');
  }
  var s = settingsMap_(ss);
  var pos = null, jawatan = '', department = '';
  if (String(p.position_id || '').trim()) {
    pos = openPositions_(ss).filter(function (r) { return String(r.position_id) === String(p.position_id).trim(); })[0];
    if (!pos) throw httpError_(400, 'Jawatan ini sudah ditutup. Muat semula halaman.');
    jawatan = textVal_(pos.jawatan); department = textVal_(pos.department);
  } else {
    if (String(s.benarkan_jawatan_lain || 'TRUE').toUpperCase() === 'FALSE') throw httpError_(400, 'Sila pilih jawatan');
    jawatan = cleanText_(p.jawatan_lain, 'Jawatan dipohon', LIMITS.teks, true);
  }
  var nama = cleanText_(p.nama, 'Nama penuh', LIMITS.nama, true);
  if (nama.length < LIMITS.nama_min) throw httpError_(400, 'Nama penuh terlalu pendek');
  var icd = cleanIcDob_(p.ic);
  var email = normEmail_(p.email);
  if (!email) throw httpError_(400, 'Alamat emel tak sah');
  var pernah = pick_(p.pernah_disabit, ['Ya', 'Tidak'], 'Soalan rekod jenayah', true);
  var gaji = String(p.gaji_dijangka === null || p.gaji_dijangka === undefined ? '' : p.gaji_dijangka).trim();
  if (gaji !== '' && (!isFinite(Number(gaji)) || Number(gaji) < 0 || Number(gaji) > LIMITS.gaji)) throw httpError_(400, 'Gaji dipohon tak sah');
  var rec = {
    position_id: pos ? String(pos.position_id) : '', jawatan: jawatan, department: department,
    nama: nama, ic: icd.ic, dob: icd.dob,
    jantina: pick_(p.jantina, JANTINA, 'Jantina', true),
    status_kahwin: pick_(p.status_kahwin, STATUS_KAHWIN, 'Taraf perkahwinan', false),
    email: email,
    tel_bimbit: cleanPhone_(p.tel_bimbit, 'No. telefon bimbit', true),
    tel_rumah: cleanPhone_(p.tel_rumah, 'No. telefon rumah', false),
    alamat: cleanNote_(p.alamat, 'Alamat', LIMITS.alamat, true),
    akademik_json: JSON.stringify(cleanRows_(p.akademik, LIMITS.akademik, 'Akademik', [['dari', 'Dari', false], ['hingga', 'Hingga', false], ['institusi', 'Sekolah / pusat pengajian', true], ['kelulusan', 'Kelulusan', true]], 1)),
    pengalaman_json: JSON.stringify(cleanRows_(p.pengalaman, LIMITS.pengalaman, 'Pengalaman', [['dari', 'Dari', false], ['hingga', 'Hingga', false], ['majikan', 'Majikan', true], ['jawatan', 'Jawatan', true]], 0)),
    kecemasan_nama: cleanText_(p.kecemasan_nama, 'Nama penama kecemasan', LIMITS.nama, true),
    kecemasan_hubungan: pick_(p.kecemasan_hubungan, HUBUNGAN, 'Hubungan kecemasan', true),
    kecemasan_jenis_tel: pick_(p.kecemasan_jenis_tel || 'Bimbit', ['Bimbit', 'Rumah'], 'Jenis telefon kecemasan', true),
    kecemasan_tel: cleanPhone_(p.kecemasan_tel, 'No. telefon kecemasan', true),
    pernah_disabit: pernah,
    disabit_penerangan: cleanNote_(p.disabit_penerangan, 'Penerangan rekod', 500, pernah === 'Ya'),
    gaji_dijangka: gaji === '' ? '' : Math.round(Number(gaji) * 100) / 100,
    kebenaran_semak: pick_(p.kebenaran_semak, ['Ya', 'Tidak'], 'Kebenaran semakan latar belakang', true)
  };
  if (pernah === 'Tidak') rec.disabit_penerangan = '';
  [1, 2].forEach(function (n) {
    rec['ref' + n + '_nama'] = cleanText_(p['ref' + n + '_nama'], 'Rujukan ' + n + ' nama', LIMITS.nama, false);
    rec['ref' + n + '_jawatan'] = cleanText_(p['ref' + n + '_jawatan'], 'Rujukan ' + n + ' jawatan', LIMITS.teks, false);
    rec['ref' + n + '_syarikat'] = cleanText_(p['ref' + n + '_syarikat'], 'Rujukan ' + n + ' syarikat', LIMITS.teks, false);
    rec['ref' + n + '_tel'] = cleanPhone_(p['ref' + n + '_tel'], 'Rujukan ' + n + ' telefon', false);
  });
  if (!p.tandatangan) throw httpError_(400, 'Tandatangan pemohon wajib');
  var sig = parseUpload_(p.tandatangan, 'Tandatangan');
  if (sig.mime !== 'image/png' && sig.mime !== 'image/jpeg') throw httpError_(400, 'Tandatangan tak sah');
  var photo = p.gambar ? parseUpload_(p.gambar, 'Gambar') : null;
  if (photo && !/^image\//.test(photo.mime)) throw httpError_(400, 'Gambar mesti JPG / PNG');
  var resume = p.resume ? parseUpload_(p.resume, 'Resume') : null;
  if (resume && resume.mime !== 'application/pdf') throw httpError_(400, 'Resume mesti fail PDF');

  var sh = sheet_(ss, 'Applicants');
  var files = [];
  var appNo;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = readTable_(sh);
    // Elak hantar berganda: IC sama + jawatan sama yang masih aktif. Tiada no. rujukan didedahkan.
    var dup = t.rows.filter(function (r) {
      return !isDeleted_(r) && String(r.ic) === rec.ic && textVal_(r.jawatan).toLowerCase() === jawatan.toLowerCase() && FINAL_STATUSES.indexOf(String(r.status)) < 0 && String(r.status) !== 'Diterima';
    })[0];
    if (dup) throw httpError_(409, 'Permohonan anda untuk jawatan ini sudah diterima dan sedang diproses.');
    appNo = nextId_(ss, 'APP', 5);
    files.push(rec.signature_file_id = storeFile_(sig, appNo, 'tandatangan'));
    rec.photo_file_id = photo ? storeFile_(photo, appNo, 'gambar') : '';
    if (photo) files.push(rec.photo_file_id);
    rec.resume_file_id = resume ? storeFile_(resume, appNo, 'resume') : '';
    if (resume) files.push(rec.resume_file_id);
    var now = nowIso_();
    appendObj_(sh, t.header, Object.assign(auditRow_('public'), rec, {
      app_no: appNo, borang_lama_file_id: '', status: 'Baru', status_at: now, tarikh_interview: '', interview_tukar: 0, catatan_hr: '',
      consent_at: now, consent_version: CONSENT_VERSION, ip_hash: String(user.ip_hash || ''), retention_until: '', anonymised: 'FALSE'
    }));
  } catch (e) {
    files.forEach(trashFile_);
    throw e;
  } finally {
    lock.releaseLock();
  }
  audit_('public', 'SUBMIT_APPLICATION', appNo, jawatan + (department ? ' / ' + department : ''));
  notifyHrNew_(ss, { app_no: appNo, jawatan: jawatan, department: department });
  return { app_no: appNo, jawatan: jawatan };
}

// ---------------------------------------------------------------- HR & interviewer: S-12, S-13, S-15

function listApplicants_(ss, user) {
  var s = settingsMap_(ss);
  var rows = applicantsRows_(ss).filter(function (a) { return inScope_(user, a); });
  rows.sort(function (a, b) { return isoStr_(b.created_at).localeCompare(isoStr_(a.created_at)) || String(b.app_no).localeCompare(String(a.app_no)); });
  var interviews = readTable_(sheet_(ss, 'Interviews')).rows.filter(function (r) { return !isDeleted_(r); });
  return {
    hari_ini: todayIso_(),
    amaran_hari: Number(s.amaran_interview_hari) || 7,
    hr: isHr_(user),
    skop: isHr_(user) ? [] : scopeDepts_(user),
    pemohon: rows.slice(0, 2000).map(function (a) {
      var o = applicantSummary_(a, user);
      var mine = interviews.filter(function (iv) { return String(iv.app_no) === o.app_no; });
      o.bil_penilaian = mine.length;
      o.dinilai_saya = mine.some(function (iv) { return String(iv.interviewer_email) === String(user.email); });
      return o;
    })
  };
}

/** Butiran. HR: semua medan. Interviewer: medan "interviewer" BSD 3.2 sahaja. */
function getApplicant_(ss, user, p) {
  var a = mustApplicant_(applicantsRows_(ss), user, p.app_no, 'getApplicant');
  var hr = isHr_(user);
  var out = applicantSummary_(a, user);
  Object.assign(out, {
    akademik: parseJson_(a.akademik_json), pengalaman: parseJson_(a.pengalaman_json),
    ada_resume: String(a.resume_file_id || '') !== '', ada_borang_lama: String(a.borang_lama_file_id || '') !== '',
    status_at: isoStr_(a.status_at)
  });
  if (hr) {
    Object.assign(out, {
      ic: String(a.ic || ''), dob: dateStr_(a.dob), status_kahwin: String(a.status_kahwin || ''), email: textVal_(a.email),
      tel_bimbit: textVal_(a.tel_bimbit), tel_rumah: textVal_(a.tel_rumah), alamat: textVal_(a.alamat),
      kecemasan_nama: textVal_(a.kecemasan_nama), kecemasan_hubungan: String(a.kecemasan_hubungan || ''), kecemasan_jenis_tel: String(a.kecemasan_jenis_tel || ''), kecemasan_tel: textVal_(a.kecemasan_tel),
      pernah_disabit: String(a.pernah_disabit || ''), disabit_penerangan: textVal_(a.disabit_penerangan), kebenaran_semak: String(a.kebenaran_semak || ''),
      ref1: { nama: textVal_(a.ref1_nama), jawatan: textVal_(a.ref1_jawatan), syarikat: textVal_(a.ref1_syarikat), tel: textVal_(a.ref1_tel) },
      ref2: { nama: textVal_(a.ref2_nama), jawatan: textVal_(a.ref2_jawatan), syarikat: textVal_(a.ref2_syarikat), tel: textVal_(a.ref2_tel) },
      ada_tandatangan: String(a.signature_file_id || '') !== '',
      consent_at: isoStr_(a.consent_at), consent_version: String(a.consent_version || ''), retention_until: dateStr_(a.retention_until)
    });
  }
  out.penilaian = readTable_(sheet_(ss, 'Interviews')).rows
    .filter(function (r) { return !isDeleted_(r) && String(r.app_no) === out.app_no && (hr || String(r.interviewer_email) === String(user.email)); })
    .map(function (r) {
      return { interview_id: String(r.interview_id), interviewer_nama: textVal_(r.interviewer_nama), milik_saya: String(r.interviewer_email) === String(user.email), tarikh: dateStr_(r.tarikh), markah: (function () { try { return JSON.parse(String(r.markah_json || '{}')); } catch (e) { return {}; } })(), purata: Number(r.purata) || null, cadangan: String(r.cadangan || ''), catatan: textVal_(r.catatan) };
    });
  out.kriteria = KRITERIA.map(function (k) { return { key: k[0], label: k[1] }; });
  if (hr) audit_(user.email, 'VIEW_APPLICANT', out.app_no, '');
  return out;
}

/** payload: { app_no, jenis: 'gambar'|'resume'|'tandatangan'|'borang_lama' }. Tandatangan: HR sahaja. */
function getFile_(ss, user, p) {
  var a = mustApplicant_(applicantsRows_(ss), user, p.app_no, 'getFile');
  var map = { gambar: 'photo_file_id', resume: 'resume_file_id', tandatangan: 'signature_file_id', borang_lama: 'borang_lama_file_id' };
  var col = map[String(p.jenis || '')];
  if (!col) throw httpError_(400, 'Jenis fail tak sah');
  if (p.jenis === 'tandatangan' && !isHr_(user)) { audit_(user.email, 'FORBIDDEN', 'getFile', a.app_no + ' tandatangan'); throw httpError_(403, 'Tiada kebenaran'); }
  var id = String(a[col] || '');
  if (!id) throw httpError_(404, 'Tiada fail');
  var f;
  try { f = readFile_(id); } catch (e) { throw httpError_(404, 'Fail tidak dapat dibuka'); }
  audit_(user.email, 'VIEW_FILE', String(a.app_no), String(p.jenis));
  return f;
}

/**
 * payload: { app_no, department?, status?, tarikh_interview? ('' = kosongkan), catatan_hr? }. HR sahaja.
 * Sistem lama (handleUpdateApplicant): kira berapa kali tarikh interview ditukar (set kali pertama tak dikira).
 * Status akhir (Ditolak / Tarik diri) -> retention_until = hari ini + retention_bulan (F-14).
 */
function updateApplicant_(ss, user, p) {
  var sh = sheet_(ss, 'Applicants');
  var s = settingsMap_(ss);
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var a = findApplicant_(t.rows.filter(function (r) { return !isDeleted_(r); }), p.app_no);
    if (!a) throw httpError_(404, 'Pemohon tidak dijumpai');
    if (truthy_(a.anonymised)) throw httpError_(409, 'Rekod ini telah dianonimkan');
    var f = { updated_at: nowIso_(), updated_by: user.email };
    var log = [];
    if (p.department !== undefined) { f.department = cleanText_(p.department, 'Department', LIMITS.teks, false); if (f.department !== textVal_(a.department)) log.push('department ' + textVal_(a.department) + ' -> ' + f.department); }
    if (p.status !== undefined) {
      f.status = pick_(p.status, STATUSES, 'Status', true);
      if (f.status !== String(a.status)) {
        f.status_at = nowIso_();
        log.push('status ' + a.status + ' -> ' + f.status);
        if (FINAL_STATUSES.indexOf(f.status) >= 0) {
          var months = Number(s.retention_bulan) > 0 ? Number(s.retention_bulan) : 12;
          var d = new Date(Date.parse(todayIso_() + 'T00:00:00+08:00'));
          d.setMonth(d.getMonth() + months);
          f.retention_until = Utilities.formatDate(d, VP_TZ, 'yyyy-MM-dd');
        } else {
          f.retention_until = '';
        }
      }
    }
    if (p.tarikh_interview !== undefined) {
      var ti = String(p.tarikh_interview || '').trim();
      if (ti && !validDate_(ti)) throw httpError_(400, 'Tarikh interview tak sah');
      var old = dateStr_(a.tarikh_interview);
      f.tarikh_interview = ti;
      if (old && ti && old !== ti) { f.interview_tukar = (Number(a.interview_tukar) || 0) + 1; log.push('interview ' + old + ' -> ' + ti + ' (tukar #' + f.interview_tukar + ')'); }
      else if (ti !== old) log.push('interview ' + (old || '-') + ' -> ' + (ti || '-'));
    }
    if (p.catatan_hr !== undefined) { f.catatan_hr = cleanNote_(p.catatan_hr, 'Catatan HR', LIMITS.catatan, false); if (f.catatan_hr !== textVal_(a.catatan_hr)) log.push('catatan dikemas kini'); }
    updateRowObj_(sh, t.header, a._row, f);
    saved = Object.assign({}, a, f);
    audit_(user.email, 'UPDATE_APPLICANT', String(a.app_no), log.join('; ') || 'tiada perubahan');
  } finally {
    lock.releaseLock();
  }
  return getApplicant_(ss, user, { app_no: saved.app_no });
}

/** Buang data peribadi (F-14 / permintaan pemohon). Rekod kekal untuk statistik (jawatan, department, status, tarikh). */
function anonymiseRow_(sh, header, a, by, sebab) {
  var blank = {};
  ['ic', 'dob', 'status_kahwin', 'email', 'tel_bimbit', 'tel_rumah', 'alamat', 'akademik_json', 'pengalaman_json', 'kecemasan_nama', 'kecemasan_hubungan',
    'kecemasan_jenis_tel', 'kecemasan_tel', 'pernah_disabit', 'disabit_penerangan', 'ref1_nama', 'ref1_jawatan', 'ref1_syarikat', 'ref1_tel',
    'ref2_nama', 'ref2_jawatan', 'ref2_syarikat', 'ref2_tel', 'kebenaran_semak', 'photo_file_id', 'signature_file_id', 'resume_file_id', 'borang_lama_file_id', 'catatan_hr', 'ip_hash'
  ].forEach(function (k) { blank[k] = ''; });
  ['photo_file_id', 'signature_file_id', 'resume_file_id', 'borang_lama_file_id'].forEach(function (k) { trashFile_(String(a[k] || '')); });
  updateRowObj_(sh, header, a._row, Object.assign(blank, { nama: 'Dianonimkan', anonymised: 'TRUE', deleted_reason: sebab, updated_at: nowIso_(), updated_by: by }));
}

function anonymiseApplicant_(ss, user, p) {
  var sebab = cleanText_(p.sebab, 'Sebab', 300, true);
  if (sebab.length < 3) throw httpError_(400, 'Sebab wajib diisi');
  var sh = sheet_(ss, 'Applicants');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var a = findApplicant_(t.rows.filter(function (r) { return !isDeleted_(r); }), p.app_no);
    if (!a) throw httpError_(404, 'Pemohon tidak dijumpai');
    if (truthy_(a.anonymised)) throw httpError_(409, 'Rekod ini telah dianonimkan');
    anonymiseRow_(sh, t.header, a, user.email, 'HR: ' + sebab);
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'ANONYMISE', String(p.app_no), sebab);
  return true;
}

// ---------------------------------------------------------------- S-14 jawatan (F-13)

function listPositions_(ss) {
  var count = {};
  applicantsRows_(ss).forEach(function (a) { var k = String(a.position_id); count[k] = (count[k] || 0) + 1; });
  return readTable_(sheet_(ss, 'Positions')).rows.filter(function (r) { return !isDeleted_(r) && String(r.position_id); }).map(function (r) {
    return { position_id: String(r.position_id), jawatan: textVal_(r.jawatan), department: textVal_(r.department), lokasi: textVal_(r.lokasi), penerangan: textVal_(r.penerangan), aktif: truthy_(r.aktif), tarikh_tutup: dateStr_(r.tarikh_tutup), bil_pemohon: count[String(r.position_id)] || 0 };
  }).sort(function (a, b) { return (b.aktif - a.aktif) || a.jawatan.localeCompare(b.jawatan); });
}

/** payload: { position_id?, jawatan, department, lokasi?, penerangan?, aktif, tarikh_tutup? }. Nama jawatan unik (sistem lama). */
function savePosition_(ss, user, p) {
  var f = {
    jawatan: cleanText_(p.jawatan, 'Jawatan', LIMITS.teks, true),
    department: cleanText_(p.department, 'Department', 60, true),
    lokasi: cleanText_(p.lokasi, 'Lokasi', LIMITS.teks, false),
    penerangan: cleanNote_(p.penerangan, 'Penerangan', 1000, false),
    aktif: p.aktif === false ? 'FALSE' : 'TRUE',
    tarikh_tutup: String(p.tarikh_tutup || '').trim()
  };
  if (f.tarikh_tutup && !validDate_(f.tarikh_tutup)) throw httpError_(400, 'Tarikh tutup tak sah');
  var sh = sheet_(ss, 'Positions');
  var saved;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var live = t.rows.filter(function (r) { return !isDeleted_(r); });
    var cur = p.position_id ? live.filter(function (r) { return String(r.position_id) === String(p.position_id); })[0] : null;
    if (p.position_id && !cur) throw httpError_(404, 'Jawatan tidak dijumpai');
    var clash = live.filter(function (r) { return (!cur || r._row !== cur._row) && textVal_(r.jawatan).toLowerCase() === f.jawatan.toLowerCase(); })[0];
    if (clash) throw httpError_(409, "Jawatan '" + f.jawatan + "' sudah wujud dalam senarai.");
    var fields = Object.assign(f, { updated_at: nowIso_(), updated_by: user.email });
    if (cur) {
      updateRowObj_(sh, t.header, cur._row, fields);
      saved = Object.assign({}, cur, fields);
    } else {
      saved = Object.assign(auditRow_(user.email), { position_id: nextId_(ss, 'POS', 3) }, fields);
      appendObj_(sh, t.header, saved);
    }
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, p.position_id ? 'UPDATE_POSITION' : 'CREATE_POSITION', String(saved.position_id), f.jawatan + ' / ' + f.department + ' aktif=' + f.aktif);
  return listPositions_(ss);
}

// ---------------------------------------------------------------- penilaian interview (F-12)

/** payload: { app_no, markah: { teknikal: 1-5, ... }, cadangan, catatan? }. Satu penilaian setiap interviewer (dikemas kini). */
function saveInterview_(ss, user, p) {
  var a = mustApplicant_(applicantsRows_(ss), user, p.app_no, 'saveInterview');
  if (truthy_(a.anonymised)) throw httpError_(409, 'Rekod ini telah dianonimkan');
  var markah = {};
  var total = 0;
  KRITERIA.forEach(function (k) {
    var v = Number(p.markah && p.markah[k[0]]);
    if (!isFinite(v) || Math.floor(v) !== v || v < 1 || v > 5) throw httpError_(400, 'Markah "' + k[1] + '" mesti 1 hingga 5');
    markah[k[0]] = v;
    total += v;
  });
  var cadangan = pick_(p.cadangan, CADANGAN, 'Cadangan', true);
  var catatan = cleanNote_(p.catatan, 'Catatan', LIMITS.catatan, false);
  var purata = Math.round((total / KRITERIA.length) * 10) / 10;
  var sh = sheet_(ss, 'Interviews');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var cur = t.rows.filter(function (r) { return !isDeleted_(r) && String(r.app_no) === String(a.app_no) && String(r.interviewer_email) === String(user.email); })[0];
    var fields = { tarikh: todayIso_(), markah_json: JSON.stringify(markah), purata: purata, cadangan: cadangan, catatan: catatan, interviewer_nama: String(user.nama || ''), updated_at: nowIso_(), updated_by: user.email };
    if (cur) updateRowObj_(sh, t.header, cur._row, fields);
    else appendObj_(sh, t.header, Object.assign(auditRow_(user.email), { interview_id: nextId_(ss, 'INT', 5), app_no: String(a.app_no), interviewer_email: user.email }, fields));
  } finally {
    lock.releaseLock();
  }
  audit_(user.email, 'SAVE_INTERVIEW', String(a.app_no), 'purata=' + purata + '; ' + cadangan);
  return getApplicant_(ss, user, { app_no: a.app_no });
}
