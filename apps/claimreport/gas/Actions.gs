/**
 * Actions.gs - web app ClaimReport / DO Generator (F-70 hingga F-72; BSD 3.8, 4.2; IPD 2G).
 *
 * Role (BSD 4.1):
 *   user   jana DO, lihat dashboard & semua DO, buka PDF/Excel, ubah DO SENDIRI pada hari yang sama (BSD 4.2)
 *   admin  + ubah apa-apa DO, padam lembut dengan sebab (F-72), urus senarai alamat (Parties)
 * Sistem lama: tiada login, sesiapa boleh padam baris Database.
 */

var ACTION_ROLES = {
  listDOs:     ['user', 'admin', 'viewer'],
  getDO:       ['user', 'admin', 'viewer'],
  listParties: ['user', 'admin'],
  createDO:    ['user', 'admin'],
  updateDO:    ['user', 'admin'],
  getFile:     ['user', 'admin', 'viewer'],
  zipPdfs:     ['user', 'admin', 'viewer'],
  deleteDO:    ['admin'],
  deleteParty: ['admin']
};

var LIMITS = { teks: 200, alamat: 500, note: 1000, refs: 20, apacs: 20, items: 100, qty: 1000000 };

function doPost(e) {
  return handleRequest_(e, prop_('MODULE_SECRET'), routeCr_);
}

function doGet() {
  return jsonOut_({ ok: false, status: 405, error: 'Kaedah tidak dibenarkan' });
}

function routeCr_(req) {
  var user = req.user || {};
  authorize_(ACTION_ROLES, req.action, user);
  var ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var p = req.payload || {};
  switch (req.action) {
    case 'listDOs':     return listDOs_(ss, user);
    case 'getDO':       return getDO_(ss, user, p);
    case 'listParties': return listParties_(ss);
    case 'createDO':    return saveDO_(ss, user, p, null);
    case 'updateDO':    return saveDO_(ss, user, p, p.do_id);
    case 'getFile':     return getFile_(ss, user, p);
    case 'zipPdfs':     return zipPdfs_(ss, user, p);
    case 'deleteDO':    return deleteDO_(ss, user, p);
    case 'deleteParty': return deleteParty_(ss, user, p);
  }
  throw httpError_(400, 'Action tidak dikenali');
}

// ---------------------------------------------------------------- bantuan

function hasRoleC_(user, r) { return (user.roles || []).indexOf(r) >= 0; }
function isAdmin_(user) { return hasRoleC_(user, 'admin') || hasRoleC_(user, 'superadmin'); }
function textVal_(v) { return String(unsanitize_(v === null || v === undefined ? '' : v)); }

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

function settingsMap_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Settings');
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) { if (r.key !== '') out[String(r.key)] = String(unsanitize_(r.value)); });
  return out;
}

function doRows_(ss) {
  return readTable_(sheet_(ss, 'DeliveryOrders')).rows.filter(function (r) { return !isDeleted_(r) && String(r.do_id); });
}

function parseArr_(v) {
  try { var x = JSON.parse(String(unsanitize_(v || '[]'))); return Array.isArray(x) ? x : []; } catch (e) { return []; }
}

// ---------------------------------------------------------------- DO No / total carton / APAC (sama seperti sistem lama)

/** normalizePart lama: huruf besar, tambah prefix jika tiada. */
function normalizePart_(val, prefix) {
  var s = String(val || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  if (s.indexOf(prefix) !== 0) s = prefix + s;
  return s;
}

/** buildAllDoNos lama: <RW|RC><no>[_MA<no>]<suffix>. */
function buildAllDoNos_(refs, suffix) {
  return refs.map(function (r) {
    var main = normalizePart_(r.no, r.type);
    var ma = normalizePart_(r.ma, 'MA');
    return (ma ? main + '_' + ma : main) + suffix;
  });
}

/** computeTotalCarton lama: jumlah qty ikut unit, susunan unit kali pertama muncul. "12 PCS, 3 PALLET". */
function computeTotalCarton_(items) {
  var groups = {}, order = [];
  items.forEach(function (it) {
    if (!Object.prototype.hasOwnProperty.call(groups, it.unit)) { groups[it.unit] = 0; order.push(it.unit); }
    groups[it.unit] += Number(it.qty) || 0;
  });
  return order.map(function (u) { return groups[u] + ' ' + u; }).join(', ');
}

/** validateInput lama + had panjang. Pulang data DO yang bersih. */
function cleanDO_(p, s) {
  if (!Array.isArray(p.refs) || !p.refs.length) throw httpError_(400, 'Sekurang-kurangnya 1 rujukan (RW/RC) diperlukan.');
  if (p.refs.length > LIMITS.refs) throw httpError_(400, 'Maksimum ' + LIMITS.refs + ' rujukan');
  var refs = p.refs.map(function (r, i) {
    r = r || {};
    var type = String(r.type || 'RW').toUpperCase();
    if (REF_TYPES.indexOf(type) < 0) throw httpError_(400, 'Jenis rujukan #' + (i + 1) + ' mesti RW atau RC');
    var no = cleanText_(r.no, 'No rujukan #' + (i + 1), 60);
    if (!no) throw httpError_(400, 'No rujukan (RW/RC) #' + (i + 1) + ' wajib diisi.');
    if (!/^[A-Za-z0-9\-\/ ]+$/.test(no)) throw httpError_(400, 'No rujukan #' + (i + 1) + ' hanya huruf dan nombor');
    var ma = cleanText_(r.ma, 'No MA #' + (i + 1), 60);
    if (ma && !/^[A-Za-z0-9\-\/ ]+$/.test(ma)) throw httpError_(400, 'No MA #' + (i + 1) + ' hanya huruf dan nombor');
    return { type: type, no: no, ma: ma };
  });
  var apacs = (Array.isArray(p.apacs) ? p.apacs : []).map(function (a) { return cleanText_(a, 'APAC ticket', 60); }).filter(Boolean);
  if (apacs.length > LIMITS.apacs) throw httpError_(400, 'Maksimum ' + LIMITS.apacs + ' APAC ticket');
  var tarikh = String(p.tarikh || p.date || '');
  if (!validDate_(tarikh)) throw httpError_(400, 'Format tarikh tak sah.');
  var d = {
    tarikh: tarikh,
    from_name: cleanText_(p.from_name, 'Nama syarikat (From)', LIMITS.teks), from_address: cleanText_(p.from_address, 'Alamat (From)', LIMITS.alamat),
    from_attn: cleanText_(p.from_attn, 'ATTN (From)', LIMITS.teks), from_tel: cleanText_(p.from_tel, 'Tel (From)', 60),
    to_name: cleanText_(p.to_name, 'Nama syarikat (To)', LIMITS.teks), to_address: cleanText_(p.to_address, 'Alamat (To)', LIMITS.alamat),
    to_attn: cleanText_(p.to_attn, 'ATTN (To)', LIMITS.teks), to_tel: cleanText_(p.to_tel, 'Tel (To)', 60),
    truck: cleanText_(p.truck, 'Truck', 60), note: cleanText_(p.note, 'Note', LIMITS.note), signer: cleanText_(p.signer, 'Signer', LIMITS.teks)
  };
  if (!d.from_name) throw httpError_(400, 'Field wajib kosong: Nama syarikat (From)');
  if (!d.to_name) throw httpError_(400, 'Field wajib kosong: Nama syarikat (To)');
  if (!d.signer) throw httpError_(400, 'Field wajib kosong: Nama pengesah / signer');
  if (!Array.isArray(p.items) || !p.items.length) throw httpError_(400, 'Sekurang-kurangnya 1 item diperlukan.');
  if (p.items.length > LIMITS.items) throw httpError_(400, 'Maksimum ' + LIMITS.items + ' item');
  d.items = p.items.map(function (it, j) {
    it = it || {};
    var o = { productCode: cleanText_(it.productCode, 'Product code', 80), description: cleanText_(it.description, 'Description', 300), unit: String(it.unit || '').toUpperCase() };
    var q = it.qty;
    if (!o.productCode || !o.description || !o.unit || q === undefined || q === null || q === '') throw httpError_(400, 'Item #' + (j + 1) + ' ada field kosong.');
    if (UNIT_OPTIONS.indexOf(o.unit) < 0) throw httpError_(400, 'Item #' + (j + 1) + ': unit tak sah');
    if (isNaN(Number(q)) || Number(q) <= 0 || Number(q) > LIMITS.qty) throw httpError_(400, 'Item #' + (j + 1) + ': QTY mesti nombor positif.');
    o.qty = Number(q);
    return o;
  });
  var all = buildAllDoNos_(refs, s.do_suffix === undefined ? '_JD' : String(s.do_suffix).trim());
  d.refs = refs;
  d.apacs = apacs;
  d.apac = apacs.join(', ');
  d.do_no = all[0];
  d.do_no_all = all.join('\n');
  d.ref_no = normalizePart_(refs[0].no, refs[0].type);
  d.ma_no = normalizePart_(refs[0].ma, 'MA');
  d.total_carton = computeTotalCarton_(d.items);
  d.jumlah_qty = d.items.reduce(function (a, it) { return a + it.qty; }, 0);
  d.item_count = d.items.length;
  return d;
}

function nextBil_(rows) {
  var max = 0;
  rows.forEach(function (r) { var n = parseInt(r.bil, 10); if (!isNaN(n) && n > max) max = n; });
  return max + 1;
}

function summary_(r, user) {
  return {
    do_id: String(r.do_id), bil: Number(r.bil) || 0, report_name: textVal_(r.report_name), do_no: textVal_(r.do_no), do_no_all: textVal_(r.do_no_all),
    ref_no: textVal_(r.ref_no), ma_no: textVal_(r.ma_no), tarikh: dateStr_(r.tarikh), apac: textVal_(r.apac),
    from_name: textVal_(r.from_name), to_name: textVal_(r.to_name), truck: textVal_(r.truck), item_count: Number(r.item_count) || 0,
    total_carton: textVal_(r.total_carton), jumlah_qty: Number(r.jumlah_qty) || 0, signer: textVal_(r.signer),
    ada_pdf: String(r.pdf_file_id || '') !== '', ada_xlsx: String(r.xlsx_file_id || '') !== '', sumber: String(r.sumber || 'baru'),
    dibuat_oleh: textVal_(r.created_by_name || ''), dibuat: isoStr_(r.created_at), milik_saya: String(r.created_by) === String(user.email),
    boleh_ubah: canEdit_(r, user)
  };
}

/** BSD 4.2: user U sendiri pada hari yang sama (masa Malaysia); admin semua. DO lama (import) hanya admin. */
function canEdit_(r, user) {
  if (isAdmin_(user)) return true;
  if (!hasRoleC_(user, 'user') || String(r.sumber) === 'lama') return false;
  return String(r.created_by) === String(user.email) && isoStr_(r.created_at).slice(0, 10) === todayIso_();
}

// ---------------------------------------------------------------- S-71 dashboard

function listDOs_(ss, user) {
  var rows = doRows_(ss);
  rows.sort(function (a, b) { return dateStr_(b.tarikh).localeCompare(dateStr_(a.tarikh)) || (Number(b.bil) || 0) - (Number(a.bil) || 0); });
  return { boleh_admin: isAdmin_(user), dos: rows.slice(0, 5000).map(function (r) { return summary_(r, user); }) };
}

function getDO_(ss, user, p) {
  var r = mustDO_(doRows_(ss), p.do_id);
  var out = summary_(r, user);
  ['from_address', 'from_attn', 'from_tel', 'to_address', 'to_attn', 'to_tel', 'note'].forEach(function (k) { out[k] = textVal_(r[k]); });
  out.items = parseArr_(r.items_json);
  var meta = {};
  try { meta = JSON.parse(String(unsanitize_(r.refs_json || '{}'))) || {}; } catch (e) { meta = {}; }
  out.refs = Array.isArray(meta.refs) ? meta.refs : [{ type: String(r.ref_no || '').slice(0, 2) === 'RC' ? 'RC' : 'RW', no: textVal_(r.ref_no), ma: textVal_(r.ma_no) }];
  out.apacs = Array.isArray(meta.apacs) ? meta.apacs : parseArr_(r.apac_json);
  out.dikemas_kini = isoStr_(r.updated_at);
  out.dikemas_kini_oleh = textVal_(r.updated_by);
  return out;
}

function mustDO_(rows, id) {
  var r = rows.filter(function (x) { return String(x.do_id) === String(id || ''); })[0];
  if (!r) throw httpError_(404, 'DO tidak dijumpai');
  return r;
}

function listParties_(ss) {
  var rows = readTable_(sheet_(ss, 'Parties')).rows.filter(function (r) { return !isDeleted_(r) && String(r.party_id); });
  rows.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
  return {
    units: UNIT_OPTIONS, suffix: (function () { var s = settingsMap_(ss); return s.do_suffix === undefined ? '_JD' : String(s.do_suffix).trim(); })(),
    parties: rows.map(function (r) { return { party_id: String(r.party_id), jenis: String(r.jenis), nama: textVal_(r.nama), alamat: textVal_(r.alamat), attn: textVal_(r.attn), tel: textVal_(r.tel) }; })
  };
}

// ---------------------------------------------------------------- S-70 borang: cipta & ubah (F-70, F-72)

/**
 * payload: { do_id? (ubah), refs: [{type, no, ma}], apacs: [..], tarikh, from_*, to_*, items: [{productCode, description, qty, unit}],
 *   truck, note, signer, sebab? (ubah oleh admin bagi DO orang lain) }
 * Nama fail = "<bil>. <DO No utama>" (sistem lama). DO No mesti unik (isDuplicateDoNo lama).
 * Ubah: PDF & Excel dijana semula, fail lama dibuang ke Trash; bil kekal.
 */
function saveDO_(ss, user, p, editId) {
  var s = settingsMap_(ss);
  var d = cleanDO_(p, s);
  var sh = sheet_(ss, 'DeliveryOrders');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var files = null, old = null, saved;
  try {
    var t = readTable_(sh);
    var live = t.rows.filter(function (x) { return !isDeleted_(x) && String(x.do_id); });
    if (editId) {
      old = mustDO_(live, editId);
      if (!canEdit_(old, user)) throw httpError_(403, isAdmin_(user) ? 'Tiada kebenaran' : 'DO hanya boleh diubah oleh pembuatnya pada hari yang sama. Minta admin ClaimReport.');
    }
    var clash = live.filter(function (x) { return String(x.do_no).trim() === d.do_no && (!old || String(x.do_id) !== String(old.do_id)); })[0];
    if (clash) throw httpError_(409, 'DO No. "' + d.do_no + '" dah wujud (' + textVal_(clash.report_name) + '). Semak semula No RW/RC / No MA.');
    var sebab = '';
    if (old && String(old.created_by) !== String(user.email)) {
      sebab = cleanText_(p.sebab, 'Sebab', 300);
      if (sebab.length < 5) throw httpError_(400, 'Nyatakan sebab mengubah DO staf lain (minimum 5 aksara)');
    }
    var bil = old ? (Number(old.bil) || nextBil_(t.rows)) : nextBil_(t.rows);
    d.report_name = bil + '. ' + d.do_no;
    files = generateDocument_(ss, d, s);
    var now = nowIso_();
    var row = {
      bil: bil, report_name: d.report_name, do_no: d.do_no, do_no_all: d.do_no_all, ref_no: d.ref_no, ma_no: d.ma_no, tarikh: d.tarikh,
      apac: d.apac, apac_json: JSON.stringify(d.apacs),
      from_name: d.from_name, from_address: d.from_address, from_attn: d.from_attn, from_tel: d.from_tel,
      to_name: d.to_name, to_address: d.to_address, to_attn: d.to_attn, to_tel: d.to_tel,
      item_count: d.item_count, items_json: JSON.stringify(d.items), total_carton: d.total_carton, jumlah_qty: d.jumlah_qty,
      truck: d.truck, note: d.note, signer: d.signer, pdf_file_id: files.pdf_file_id, xlsx_file_id: files.xlsx_file_id,
      refs_json: JSON.stringify({ refs: d.refs, apacs: d.apacs }), updated_at: now, updated_by: user.email
    };
    if (old) {
      updateRowObj_(sh, t.header, old._row, row);
      saved = Object.assign({}, old, row);
    } else {
      row.do_id = nextId_(ss, 'DO', 5);
      Object.assign(row, { sumber: 'baru', created_by_name: String(user.nama || user.email), created_at: now, created_by: user.email, deleted: 'FALSE', deleted_reason: '' });
      appendObj_(sh, t.header, row);
      saved = row;
    }
    upsertParty_(ss, 'from', d, user);
    upsertParty_(ss, 'to', d, user);
    if (old) audit_(user.email, 'UPDATE_DO', String(old.do_id), String(old.do_no) + ' -> ' + d.do_no + (sebab ? ' | sebab: ' + sebab : ''));
    else audit_(user.email, 'CREATE_DO', String(row.do_id), d.report_name);
  } catch (e) {
    if (files) { trashFile_(files.pdf_file_id); trashFile_(files.xlsx_file_id); }
    throw e;
  } finally {
    lock.releaseLock();
  }
  if (old) { trashFile_(old.pdf_file_id); trashFile_(old.xlsx_file_id); }
  return { do_id: String(saved.do_id), do_no: d.do_no, report_name: d.report_name, total_carton: d.total_carton };
}

/** Simpan alamat From / To supaya tak taip semula (BSD 3.8 Parties). Padan ikut jenis + nama (tanpa beza huruf besar). */
function upsertParty_(ss, jenis, d, user) {
  var nama = d[jenis + '_name'];
  if (!nama) return;
  var sh = sheet_(ss, 'Parties');
  var t = readTable_(sh);
  var hit = t.rows.filter(function (r) { return !isDeleted_(r) && String(r.jenis) === jenis && textVal_(r.nama).toLowerCase() === nama.toLowerCase(); })[0];
  var f = { alamat: d[jenis + '_address'], attn: d[jenis + '_attn'], tel: d[jenis + '_tel'] };
  if (hit) {
    if (textVal_(hit.alamat) !== f.alamat || textVal_(hit.attn) !== f.attn || textVal_(hit.tel) !== f.tel) {
      updateRowObj_(sh, t.header, hit._row, Object.assign(f, { updated_at: nowIso_(), updated_by: user.email }));
    }
    return;
  }
  var now = nowIso_();
  appendObj_(sh, t.header, Object.assign(f, { party_id: nextId_(ss, 'PTY', 4), jenis: jenis, nama: nama, created_at: now, created_by: user.email, updated_at: now, updated_by: user.email, deleted: 'FALSE', deleted_reason: '' }));
}

// ---------------------------------------------------------------- F-72 padam (admin, lembut)

function deleteDO_(ss, user, p) {
  var sebab = cleanText_(p.sebab, 'Sebab', 300);
  if (sebab.length < 5) throw httpError_(400, 'Nyatakan sebab padam (minimum 5 aksara)');
  var sh = sheet_(ss, 'DeliveryOrders');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = readTable_(sh);
    var r = mustDO_(t.rows.filter(function (x) { return !isDeleted_(x) && String(x.do_id); }), p.do_id);
    updateRowObj_(sh, t.header, r._row, { deleted: 'TRUE', deleted_reason: sebab, updated_at: nowIso_(), updated_by: user.email });
    audit_(user.email, 'DELETE_DO', String(r.do_id), String(r.do_no) + ' | sebab: ' + sebab);
    return { do_id: String(r.do_id), do_no: textVal_(r.do_no) };
  } finally {
    lock.releaseLock();
  }
}

function deleteParty_(ss, user, p) {
  var sh = sheet_(ss, 'Parties');
  var t = readTable_(sh);
  var r = t.rows.filter(function (x) { return !isDeleted_(x) && String(x.party_id) === String(p.party_id || ''); })[0];
  if (!r) throw httpError_(404, 'Alamat tidak dijumpai');
  updateRowObj_(sh, t.header, r._row, { deleted: 'TRUE', deleted_reason: 'dibuang dari senarai', updated_at: nowIso_(), updated_by: user.email });
  audit_(user.email, 'DELETE_PARTY', String(r.party_id), textVal_(r.nama));
  return { party_id: String(r.party_id) };
}

// ---------------------------------------------------------------- fail

/** payload: { do_id, jenis: 'pdf' | 'xlsx' }. Fail peribadi, dibaca oleh akaun sistem. */
function getFile_(ss, user, p) {
  var r = mustDO_(doRows_(ss), p.do_id);
  var id = p.jenis === 'xlsx' ? r.xlsx_file_id : r.pdf_file_id;
  if (!id) throw httpError_(404, 'Fail tiada');
  try { return readFile_(String(id)); } catch (e) { throw httpError_(404, 'Fail tidak dapat dibuka (fail lama: pastikan akaun sistem ada akses ke folder lama)'); }
}

var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Sistem lama downloadZip: pelayar muat turun setiap PDF melalui corsproxy.io (pihak ketiga) dan zip.
 * Kini dizip di server. payload: { dari?, hingga?, do_ids? }. Nama: "GCC <Month> <Year>.zip" (ikut `dari`).
 */
function zipPdfs_(ss, user, p) {
  var s = settingsMap_(ss);
  var max = Number(s.zip_max_fail) > 0 ? Number(s.zip_max_fail) : 80;
  var dari = validDate_(p.dari) ? p.dari : '';
  var hingga = validDate_(p.hingga) ? p.hingga : '';
  var ids = Array.isArray(p.do_ids) ? p.do_ids.map(String) : null;
  var rows = doRows_(ss).filter(function (r) {
    var t = dateStr_(r.tarikh);
    return String(r.pdf_file_id || '') && (!dari || t >= dari) && (!hingga || t <= hingga) && (!ids || ids.indexOf(String(r.do_id)) >= 0);
  });
  if (!rows.length) throw httpError_(404, 'Tiada fail PDF dalam tapisan ini.');
  if (rows.length > max) throw httpError_(413, rows.length + ' PDF melebihi had ' + max + '. Kecilkan julat tarikh.');
  rows.sort(function (a, b) { return (Number(a.bil) || 0) - (Number(b.bil) || 0); });
  var blobs = [], gagal = [], total = 0, used = {};
  rows.forEach(function (r) {
    try {
      var b = DriveApp.getFileById(String(r.pdf_file_id)).getBlob();
      var name = ('DO_' + (textVal_(r.do_no) || r.do_id) + '.pdf').replace(/[^a-zA-Z0-9.\-_]/g, '_');
      while (used[name]) name = name.replace(/\.pdf$/, '_' + r.bil + '.pdf');
      used[name] = true;
      total += b.getBytes().length;
      blobs.push(b.setName(name));
    } catch (e) { gagal.push(textVal_(r.do_no)); }
  });
  if (!blobs.length) throw httpError_(404, 'PDF tidak dapat dibuka');
  if (total > 30 * 1024 * 1024) throw httpError_(413, 'Jumlah PDF melebihi 30MB. Kecilkan julat tarikh.');
  var zipName = 'GCC_Semua_Dokumen.zip';
  if (dari) zipName = 'GCC ' + MONTHS_EN[Number(dari.slice(5, 7)) - 1] + ' ' + dari.slice(0, 4) + '.zip';
  var zip = Utilities.zip(blobs, zipName);
  audit_(user.email, 'ZIP_PDF', zipName, blobs.length + ' fail');
  return { nama: zipName, mime: 'application/zip', data: Utilities.base64Encode(zip.getBytes()), bil: blobs.length, gagal: gagal };
}
