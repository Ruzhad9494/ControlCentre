/**
 * Access.gs - web app projek `access` (TRD 5.1, 5.2; BSD 3.1, 4.2; IPD 1.5, 1.10, 1.11).
 *
 * Dipanggil HANYA oleh Cloudflare Pages Functions dengan tandatangan HMAC (ACCESS_SECRET).
 * - Action system (getAccess, logLoginEvent): user.system === true, dari /auth/* sahaja.
 * - Action admin (S-04, S-05, S-06): role dikira semula dari Sheet, bukan dipercayai dari gateway.
 */

var SYSTEM_ACTIONS = { getAccess: true, logLoginEvent: true };

var ACCESS_ACTION_ROLES = {
  listStaff:           ['superadmin', 'hr_admin'],
  addStaff:            ['superadmin'],
  updateStaff:         ['superadmin', 'hr_admin'],   // hr_admin: status, tarikh_tamat, mfa_disahkan sahaja
  resetGoogleLink:     ['superadmin'],
  revokeSessions:      ['superadmin', 'hr_admin'],
  listAccess:          ['superadmin'],
  setAccess:           ['superadmin'],
  listLoginLog:        ['superadmin'],
  listAccessChangeLog: ['superadmin']
};

var LOGIN_RESULTS = ['ok', 'tiada_staf', 'tamat', 'sub_tak_padan', 'email_tak_sah', 'rate_limit'];
var STAFF_FIELDS_SUPERADMIN = ['email', 'jenis_emel', 'nama', 'department', 'designation', 'status', 'tarikh_mula', 'tarikh_tamat', 'mfa_disahkan'];
var STAFF_FIELDS_HR = ['status', 'tarikh_tamat', 'mfa_disahkan'];
var PORTAL_MODULE = { module_id: '*', nama: 'Portal (semua modul)', roles_sah: ['superadmin', 'viewer'] };
var SETTINGS_PUBLIC = ['company_name', 'it_contact', 'privacy_notice_version'];

function doPost(e) {
  return handleRequest_(e, prop_('ACCESS_SECRET'), routeAccess_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeAccess_(req) {
  if (SYSTEM_ACTIONS[req.action]) {
    if (!req.user || req.user.system !== true) throw httpError_(403, 'Tiada kebenaran');
    return req.action === 'getAccess' ? getAccess_(req.payload) : logLoginEvent_(req.payload);
  }
  var ss = openAccess_();
  var actor = actorFromSheet_(ss, req.user && req.user.email);
  authorize_(ACCESS_ACTION_ROLES, req.action, actor);
  var p = req.payload || {};
  switch (req.action) {
    case 'listStaff':           return listStaff_(ss);
    case 'addStaff':            return addStaff_(ss, actor, p);
    case 'updateStaff':         return updateStaff_(ss, actor, p);
    case 'resetGoogleLink':     return resetGoogleLink_(ss, actor, p);
    case 'revokeSessions':      return revokeSessions_(ss, actor, p);
    case 'listAccess':          return listAccess_(ss);
    case 'setAccess':           return setAccess_(ss, actor, p);
    case 'listLoginLog':        return listLog_(ss, 'LoginLog', p, 'email');
    case 'listAccessChangeLog': return listLog_(ss, 'AccessChangeLog', p, 'staff_email');
  }
  throw httpError_(400, 'Action tidak dikenali');
}

function openAccess_() {
  return SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
}

// ---------------------------------------------------------------- getAccess

/**
 * payload: { email, sub, purpose: 'login'|'refresh', ip_hash, user_agent }
 * Pulang { ok:false, reason } atau { ok:true, staff, status, token_version, roles, scope, modules, settings }.
 */
function getAccess_(p) {
  var login = p.purpose === 'login';
  var email = normEmail_(p.email);
  var ss = openAccess_();
  if (!email) {
    if (login) logLogin_(ss, '', 'email_tak_sah', p);
    return { ok: false, reason: 'email_tak_sah' };
  }

  var staffSh = sheet_(ss, 'Staff');
  var staffT = readTable_(staffSh);
  var st = findStaffByEmail_(staffT, email);
  if (!st) {
    if (login) logLogin_(ss, email, 'tiada_staf', p);
    return { ok: false, reason: 'tiada_staf' };
  }
  if (String(st.status) !== 'aktif') {
    if (login) logLogin_(ss, email, 'tamat', p);
    return { ok: false, reason: 'tamat' };
  }

  if (login) {
    var sub = String(p.sub || '');
    if (!sub || sub.length > 255) {
      logLogin_(ss, email, 'email_tak_sah', p);
      return { ok: false, reason: 'email_tak_sah' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      // Baca semula dalam lock supaya dua login serentak tak ikat dua sub berbeza
      staffT = readTable_(staffSh);
      st = findStaffByEmail_(staffT, email);
      var bound = String(st.google_sub === null || st.google_sub === undefined ? '' : st.google_sub).trim();
      if (!bound) {
        writeText_(staffSh, staffT.header, st._row, 'google_sub', sub);
      } else if (bound !== sub) {
        logLogin_(ss, email, 'sub_tak_padan', p);
        return { ok: false, reason: 'sub_tak_padan' };
      }
      updateObj_(staffSh, staffT.header, st._row, { last_login_at: nowIso_() });
    } finally {
      lock.releaseLock();
    }
    logLogin_(ss, email, 'ok', p);
  }

  var acc = effectiveAccess_(ss, email);
  return {
    ok: true,
    staff: {
      staff_id: String(st.staff_id),
      email: email,
      nama: String(unsanitize_(st.nama)),
      department: String(st.department),
      designation: String(unsanitize_(st.designation)),
      jenis_emel: String(st.jenis_emel)
    },
    status: 'aktif',
    token_version: Number(st.token_version) || 1,
    roles: acc.roles,
    scope: acc.scope,
    modules: readModules_(ss),
    settings: readPublicSettings_(ss)
  };
}

function logLoginEvent_(p) {
  var hasil = String(p.hasil || '');
  if (['rate_limit', 'email_tak_sah'].indexOf(hasil) < 0) throw httpError_(400, 'hasil tak sah');
  logLogin_(openAccess_(), normEmail_(p.email), hasil, p);
  return true;
}

function logLogin_(ss, email, hasil, p) {
  if (LOGIN_RESULTS.indexOf(hasil) < 0) hasil = 'email_tak_sah';
  var sh = sheet_(ss, 'LoginLog');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  appendObj_(sh, header, {
    ts: nowIso_(),
    email: email || '',
    hasil: hasil,
    ip_hash: /^[0-9a-f]{16,64}$/.test(String(p.ip_hash || '')) ? p.ip_hash : '',
    user_agent: String(p.user_agent || '').slice(0, 300)
  });
}

function findStaffByEmail_(t, email) {
  return t.rows.filter(function (r) { return !isDeleted_(r) && normEmail_(r.email) === email; })[0] || null;
}

function findStaffById_(t, staffId) {
  var id = String(staffId || '').trim();
  return t.rows.filter(function (r) { return !isDeleted_(r) && String(r.staff_id) === id; })[0] || null;
}

/** Peraturan role efektif (BSD 3.1): baris UserAccess yang belum tamat_pada. Itu sahaja. */
function effectiveAccess_(ss, email) {
  var t = readTable_(sheet_(ss, 'UserAccess'));
  var today = todayIso_();
  var roles = {}, scope = {};
  t.rows.forEach(function (r) {
    if (isDeleted_(r) || normEmail_(r.email) !== email) return;
    var until = dateStr_(r.tamat_pada);
    if (until && until < today) return;
    var list = splitCsv_(r.roles);
    if (!list.length) return;
    var mod = String(r.module_id).trim();
    roles[mod] = uniq_((roles[mod] || []).concat(list));
    if (String(r.skop || '').trim()) scope[mod] = String(r.skop).trim();
  });
  return { roles: roles, scope: scope };
}

function readModules_(ss) {
  var t = readTable_(sheet_(ss, 'Modules'));
  return t.rows.filter(function (r) { return !isDeleted_(r) && String(r.module_id).trim(); })
    .map(function (r) {
      return {
        module_id: String(r.module_id).trim(),
        nama: String(unsanitize_(r.nama)),
        path: String(r.path),
        ikon: String(r.ikon),
        subtajuk: String(unsanitize_(r.subtajuk || '')),
        roles_sah: splitCsv_(r.roles_sah),
        susunan: Number(r.susunan) || 99,
        status: String(r.status)
      };
    })
    .sort(function (a, b) { return a.susunan - b.susunan; });
}

function readSettingsMap_(ss) {
  var sh = ss.getSheetByName('Settings');
  var out = {};
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) { if (r.key !== '') out[String(r.key)] = String(unsanitize_(r.value)); });
  return out;
}

function readPublicSettings_(ss) {
  var all = readSettingsMap_(ss), out = {};
  SETTINGS_PUBLIC.forEach(function (k) { out[k] = all[k] || ''; });
  return out;
}

// ---------------------------------------------------------------- pelakon admin

/** Kira role admin dari Sheet (bukan dari gateway) supaya perubahan berkuat kuasa serta-merta. */
function actorFromSheet_(ss, emailRaw) {
  var email = normEmail_(emailRaw);
  var st = email ? findStaffByEmail_(readTable_(sheet_(ss, 'Staff')), email) : null;
  if (!st || String(st.status) !== 'aktif') throw httpError_(401, 'Sesi tidak sah');
  var acc = effectiveAccess_(ss, email);
  var roles = [];
  if ((acc.roles['*'] || []).indexOf('superadmin') >= 0) roles.push('superadmin');
  if ((acc.roles.hr || []).indexOf('hr_admin') >= 0) roles.push('hr_admin');
  return { email: email, nama: String(st.nama), roles: roles, isSuper: roles.indexOf('superadmin') >= 0 };
}

// ---------------------------------------------------------------- S-04 Staf

function staffPublic_(r) {
  return {
    staff_id: String(r.staff_id),
    email: normEmail_(r.email) || String(r.email),
    jenis_emel: String(r.jenis_emel),
    nama: String(unsanitize_(r.nama)),
    department: String(r.department),
    designation: String(unsanitize_(r.designation)),
    status: String(r.status),
    token_version: Number(r.token_version) || 1,
    tarikh_mula: dateStr_(r.tarikh_mula),
    tarikh_tamat: dateStr_(r.tarikh_tamat),
    mfa_disahkan: String(r.mfa_disahkan).toUpperCase() === 'TRUE',
    last_login_at: isoStr_(r.last_login_at),
    akaun_terikat: String(r.google_sub || '').trim() !== ''
  };
}

function listStaff_(ss) {
  return readTable_(sheet_(ss, 'Staff')).rows.filter(function (r) { return !isDeleted_(r) && String(r.staff_id); })
    .map(staffPublic_)
    .sort(function (a, b) { return a.nama.localeCompare(b.nama); });
}

function requireSebab_(p) {
  var s = String(p.sebab || '').trim();
  if (s.length < 3) throw httpError_(400, 'Sebab wajib diisi (minimum 3 aksara)');
  return s.slice(0, 300);
}

function validateStaffField_(field, value) {
  var v = value;
  switch (field) {
    case 'email':
      v = normEmail_(value);
      if (!v) throw httpError_(400, 'Format emel tak sah');
      return v;
    case 'jenis_emel':
      if (ENUMS.jenis_emel.indexOf(value) < 0) throw httpError_(400, 'jenis_emel tak sah');
      return value;
    case 'nama':
    case 'designation':
      v = String(value || '').trim();
      if (v.length < 2 || v.length > 100) throw httpError_(400, field + ' mesti 2-100 aksara');
      return v;
    case 'department':
      v = String(value || '').toUpperCase();
      if (ENUMS.department.indexOf(v) < 0) throw httpError_(400, 'Department tak sah');
      return v;
    case 'status':
      if (ENUMS.staff_status.indexOf(value) < 0) throw httpError_(400, 'Status tak sah');
      return value;
    case 'tarikh_mula':
    case 'tarikh_tamat':
      v = String(value || '');
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw httpError_(400, field + ' mesti YYYY-MM-DD');
      return v;
    case 'mfa_disahkan':
      return value === true || String(value).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
  }
  throw httpError_(400, 'Medan tidak dikenali: ' + field);
}

function addStaff_(ss, actor, p) {
  var sh = sheet_(ss, 'Staff');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var staffId = String(p.staff_id || '').trim();
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(staffId)) throw httpError_(400, 'Staff ID mesti 2-20 aksara (huruf, nombor, - atau _)');
    var email = validateStaffField_('email', p.email);
    if (t.rows.some(function (r) { return String(r.staff_id) === staffId; })) throw httpError_(409, 'Staff ID sudah wujud');
    if (t.rows.some(function (r) { return normEmail_(r.email) === email; })) throw httpError_(409, 'Emel sudah didaftar');
    var row = {
      staff_id: staffId,
      email: email,
      jenis_emel: p.jenis_emel ? validateStaffField_('jenis_emel', p.jenis_emel) : (/@voltake\.com$/.test(email) ? 'syarikat' : 'gmail'),
      google_sub: '',
      mfa_disahkan: validateStaffField_('mfa_disahkan', p.mfa_disahkan),
      nama: validateStaffField_('nama', p.nama),
      department: validateStaffField_('department', p.department),
      designation: validateStaffField_('designation', p.designation),
      status: 'aktif',
      token_version: 1,
      tarikh_mula: validateStaffField_('tarikh_mula', p.tarikh_mula),
      tarikh_tamat: '',
      created_at: nowIso_(), created_by: actor.email, updated_at: nowIso_(), updated_by: actor.email,
      deleted: 'FALSE', deleted_reason: ''
    };
    appendObj_(sh, t.header, row);
    changeLog_(ss, actor.email, email, '_staff', '', 'daftar: ' + row.department + ', ' + row.designation, String(p.sebab || 'Daftar staf baru').slice(0, 300));
    return staffPublic_(row);
  } finally {
    lock.releaseLock();
  }
}

function updateStaff_(ss, actor, p) {
  var sebab = requireSebab_(p);
  var fields = p.fields || {};
  var keys = Object.keys(fields);
  if (!keys.length) throw httpError_(400, 'Tiada perubahan');
  var allowedFields = actor.isSuper ? STAFF_FIELDS_SUPERADMIN : STAFF_FIELDS_HR;
  keys.forEach(function (k) {
    if (STAFF_FIELDS_SUPERADMIN.indexOf(k) < 0) throw httpError_(400, 'Medan tidak dikenali: ' + k);
    if (allowedFields.indexOf(k) < 0) throw httpError_(403, 'Tiada kebenaran mengubah ' + k);
  });

  var sh = sheet_(ss, 'Staff');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var st = findStaffById_(t, p.staff_id);
    if (!st) throw httpError_(404, 'Staf tidak dijumpai');

    var clean = {};
    keys.forEach(function (k) { clean[k] = validateStaffField_(k, fields[k]); });

    if (clean.email && clean.email !== normEmail_(st.email)) {
      if (t.rows.some(function (r) { return r._row !== st._row && normEmail_(r.email) === clean.email; })) throw httpError_(409, 'Emel sudah didaftar');
    }
    var newStatus = clean.status || String(st.status);
    var newTamat = Object.prototype.hasOwnProperty.call(clean, 'tarikh_tamat') ? clean.tarikh_tamat : dateStr_(st.tarikh_tamat);
    if (newStatus === 'tamat' && !newTamat) throw httpError_(400, 'Tarikh tamat wajib bila status "tamat"');
    if (newStatus !== 'aktif' && String(st.status) === 'aktif') assertNotLastSuperadmin_(ss, normEmail_(st.email));

    var before = [], after = [], updates = {};
    keys.forEach(function (k) {
      var old = k === 'mfa_disahkan' ? (String(st[k]).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE')
        : (k === 'tarikh_mula' || k === 'tarikh_tamat') ? dateStr_(st[k]) : String(unsanitize_(st[k]));
      if (k === 'email') old = normEmail_(st.email);
      if (old !== String(clean[k])) {
        before.push(k + '=' + old);
        after.push(k + '=' + clean[k]);
        updates[k] = clean[k];
      }
    });
    if (!Object.keys(updates).length) return staffPublic_(st);

    var oldEmail = normEmail_(st.email);
    var bumpTv = (updates.status && updates.status !== 'aktif') || updates.email;
    if (updates.email) updates.google_sub = '';   // tukar emel: staf mesti login semula untuk ikat akaun baru
    if (bumpTv) updates.token_version = (Number(st.token_version) || 1) + 1;
    updates.updated_at = nowIso_();
    updates.updated_by = actor.email;
    var gsub = updates.google_sub;
    delete updates.google_sub;
    updateObj_(sh, t.header, st._row, updates);
    if (gsub !== undefined) writeText_(sh, t.header, st._row, 'google_sub', '');

    if (updates.email) moveAccessEmail_(ss, oldEmail, updates.email, actor.email);
    changeLog_(ss, actor.email, updates.email || oldEmail, '_staff', before.join('; '), after.join('; '), sebab);
    return staffPublic_(Object.assign({}, st, updates, { google_sub: gsub === undefined ? st.google_sub : '' }));
  } finally {
    lock.releaseLock();
  }
}

/** Bila emel staf ditukar, pindahkan baris UserAccess ke emel baru (akses kekal sama). */
function moveAccessEmail_(ss, oldEmail, newEmail, by) {
  var sh = sheet_(ss, 'UserAccess');
  var t = readTable_(sh);
  t.rows.forEach(function (r) {
    if (!isDeleted_(r) && normEmail_(r.email) === oldEmail) {
      updateObj_(sh, t.header, r._row, { email: newEmail, updated_at: nowIso_(), updated_by: by });
    }
  });
}

function resetGoogleLink_(ss, actor, p) {
  var sebab = requireSebab_(p);
  return bumpStaff_(ss, actor, p.staff_id, sebab, true);
}

function revokeSessions_(ss, actor, p) {
  var sebab = requireSebab_(p);
  return bumpStaff_(ss, actor, p.staff_id, sebab, false);
}

function bumpStaff_(ss, actor, staffId, sebab, clearSub) {
  var sh = sheet_(ss, 'Staff');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var t = readTable_(sh);
    var st = findStaffById_(t, staffId);
    if (!st) throw httpError_(404, 'Staf tidak dijumpai');
    var oldTv = Number(st.token_version) || 1;
    updateObj_(sh, t.header, st._row, { token_version: oldTv + 1, updated_at: nowIso_(), updated_by: actor.email });
    if (clearSub) writeText_(sh, t.header, st._row, 'google_sub', '');
    changeLog_(ss, actor.email, normEmail_(st.email), '_staff',
      (clearSub ? 'akaun_google=terikat; ' : '') + 'token_version=' + oldTv,
      (clearSub ? 'akaun_google=reset; ' : '') + 'token_version=' + (oldTv + 1), sebab);
    return staffPublic_(Object.assign({}, st, { token_version: oldTv + 1, google_sub: clearSub ? '' : st.google_sub }));
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- S-05 Akses

function listAccess_(ss) {
  var staff = listStaff_(ss).map(function (s) {
    return { staff_id: s.staff_id, email: s.email, nama: s.nama, department: s.department, designation: s.designation, status: s.status };
  });
  var modules = [PORTAL_MODULE].concat(readModules_(ss).map(function (m) {
    return { module_id: m.module_id, nama: m.nama, roles_sah: m.roles_sah, status: m.status };
  }));
  var rows = readTable_(sheet_(ss, 'UserAccess')).rows.filter(function (r) { return !isDeleted_(r); }).map(function (r) {
    return {
      email: normEmail_(r.email),
      module_id: String(r.module_id).trim(),
      roles: splitCsv_(r.roles),
      skop: String(r.skop || ''),
      tamat_pada: dateStr_(r.tamat_pada)
    };
  });
  return { staff: staff, modules: modules, access: rows };
}

/**
 * payload: { email, sebab, changes: [{ module_id, roles: [], skop, tamat_pada }] }
 * roles kosong = buang akses modul tu (soft delete baris).
 */
function setAccess_(ss, actor, p) {
  var sebab = requireSebab_(p);
  var email = normEmail_(p.email);
  if (!email) throw httpError_(400, 'Emel tak sah');
  var changes = Array.isArray(p.changes) ? p.changes : [];
  if (!changes.length) throw httpError_(400, 'Tiada perubahan');
  if (changes.length > 20) throw httpError_(400, 'Terlalu banyak perubahan');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!findStaffByEmail_(readTable_(sheet_(ss, 'Staff')), email)) throw httpError_(404, 'Staf tidak dijumpai');
    var mods = {};
    mods['*'] = PORTAL_MODULE.roles_sah;
    readModules_(ss).forEach(function (m) { mods[m.module_id] = m.roles_sah; });

    var seen = {};
    var clean = changes.map(function (c) {
      var mod = String(c.module_id || '').trim();
      if (!mods[mod]) throw httpError_(400, 'Modul tak sah: ' + mod);
      if (seen[mod]) throw httpError_(400, 'Modul berulang: ' + mod);
      seen[mod] = true;
      var roles = uniq_((Array.isArray(c.roles) ? c.roles : []).map(function (r) { return String(r).trim(); }).filter(String));
      roles.forEach(function (r) {
        if (mods[mod].indexOf(r) < 0) throw httpError_(400, 'Role "' + r + '" tak sah untuk ' + mod);
      });
      var skop = String(c.skop || '').trim();
      if (skop && !/^dept=[A-Z]+(,[A-Z]+)*$/.test(skop)) throw httpError_(400, 'Skop mesti format dept=OMP atau dept=OMP,PSS');
      var until = String(c.tamat_pada || '').trim();
      if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw httpError_(400, 'tamat_pada mesti YYYY-MM-DD');
      return { module_id: mod, roles: roles, skop: skop, tamat_pada: until };
    });

    var removesSuper = clean.some(function (c) { return c.module_id === '*' && c.roles.indexOf('superadmin') < 0; });
    if (removesSuper) assertNotLastSuperadmin_(ss, email);

    var sh = sheet_(ss, 'UserAccess');
    var t = readTable_(sh);
    var now = nowIso_();
    var changed = 0;
    clean.forEach(function (c) {
      var row = t.rows.filter(function (r) { return !isDeleted_(r) && normEmail_(r.email) === email && String(r.module_id).trim() === c.module_id; })[0];
      var oldRoles = row ? splitCsv_(row.roles).join(',') : '';
      var oldSkop = row ? String(row.skop || '') : '';
      var oldUntil = row ? dateStr_(row.tamat_pada) : '';
      var newRoles = c.roles.join(',');
      if (oldRoles === newRoles && (!newRoles || (oldSkop === c.skop && oldUntil === c.tamat_pada))) return;

      if (!newRoles) {
        updateObj_(sh, t.header, row._row, { deleted: 'TRUE', deleted_reason: sebab, updated_at: now, updated_by: actor.email });
      } else if (row) {
        updateObj_(sh, t.header, row._row, { roles: newRoles, skop: c.skop, tamat_pada: c.tamat_pada, updated_at: now, updated_by: actor.email });
      } else {
        appendObj_(sh, t.header, {
          email: email, module_id: c.module_id, roles: newRoles, skop: c.skop, tamat_pada: c.tamat_pada,
          created_at: now, created_by: actor.email, updated_at: now, updated_by: actor.email, deleted: 'FALSE', deleted_reason: ''
        });
      }
      changeLog_(ss, actor.email, email, c.module_id,
        describeAccess_(oldRoles, oldSkop, oldUntil), describeAccess_(newRoles, c.skop, c.tamat_pada), sebab);
      changed++;
    });
    return { changed: changed, access: effectiveAccess_(ss, email) };
  } finally {
    lock.releaseLock();
  }
}

function describeAccess_(roles, skop, until) {
  if (!roles) return '';
  return roles + (skop ? ' [' + skop + ']' : '') + (until ? ' hingga ' + until : '');
}

/** Halang sistem tanpa superadmin aktif (Admin terkunci di luar). */
function assertNotLastSuperadmin_(ss, targetEmail) {
  var staff = readTable_(sheet_(ss, 'Staff')).rows.filter(function (r) { return !isDeleted_(r) && String(r.status) === 'aktif'; });
  var activeEmails = staff.map(function (r) { return normEmail_(r.email); });
  var supers = uniq_(readTable_(sheet_(ss, 'UserAccess')).rows.filter(function (r) {
    return !isDeleted_(r) && String(r.module_id).trim() === '*' && splitCsv_(r.roles).indexOf('superadmin') >= 0 &&
      activeEmails.indexOf(normEmail_(r.email)) >= 0;
  }).map(function (r) { return normEmail_(r.email); }));
  if (supers.indexOf(targetEmail) >= 0 && supers.length <= 1) {
    throw httpError_(400, 'Tidak boleh buang superadmin terakhir. Lantik superadmin lain dahulu.');
  }
}

function changeLog_(ss, adminEmail, staffEmail, moduleId, lama, baru, sebab) {
  var sh = sheet_(ss, 'AccessChangeLog');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  appendObj_(sh, header, {
    ts: nowIso_(), admin_email: adminEmail, staff_email: staffEmail, module_id: moduleId,
    roles_lama: lama, roles_baru: baru, sebab: sebab
  });
}

// ---------------------------------------------------------------- S-06 Log

var LOG_SCAN_ROWS = 5000;

/** payload: { cari, hasil, dari (YYYY-MM-DD), hingga, limit } - terbaru dahulu. */
function listLog_(ss, tab, p, emailField) {
  var sh = sheet_(ss, tab);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var start = Math.max(2, lastRow - LOG_SCAN_ROWS + 1);
  var values = sh.getRange(start, 1, lastRow - start + 1, lastCol).getValues();
  var cari = String(p.cari || '').trim().toLowerCase();
  var hasil = String(p.hasil || '');
  var dari = String(p.dari || ''), hingga = String(p.hingga || '');
  var limit = Math.min(Math.max(parseInt(p.limit, 10) || 200, 1), 500);
  var out = [];
  for (var i = values.length - 1; i >= 0 && out.length < limit; i--) {
    var o = {};
    header.forEach(function (h, j) { o[h] = values[i][j] instanceof Date ? Utilities.formatDate(values[i][j], VP_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") : unsanitize_(values[i][j]); });
    var day = String(o.ts || '').slice(0, 10);
    if (dari && day < dari) continue;
    if (hingga && day > hingga) continue;
    if (hasil && String(o.hasil) !== hasil) continue;
    if (cari && JSON.stringify([o[emailField], o.admin_email || '', o.module_id || '', o.sebab || '']).toLowerCase().indexOf(cari) < 0) continue;
    out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------- helper kecil

function splitCsv_(v) {
  return String(v === null || v === undefined ? '' : v).split(',').map(function (s) { return s.trim(); }).filter(String);
}

function uniq_(arr) {
  var seen = {};
  return arr.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; });
}

/** Tulis sebagai teks biasa (format '@') supaya ID panjang seperti google_sub tak jadi nombor saintifik. */
function writeText_(sh, header, rowNum, field, value) {
  var col = header.indexOf(field);
  if (col < 0) throw new Error('Lajur tiada: ' + field);
  sh.getRange(rowNum, col + 1, 1, 1).setNumberFormat('@').setValues([[String(value)]]);
}
