// Mock minimum Google Apps Script untuk uji fail .gs dalam Node (tanpa akaun Google).
// Hanya API yang digunakan oleh apps/*/gas disokong.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');

const toJavaBytes = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));

function formatDate(d, _tz, pattern) {
  // Tiru Asia/Kuala_Lumpur (+08:00); sokong token yang digunakan kod: yyyy MM dd HH mm ss XXX
  const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
  const tok = { yyyy: iso.slice(0, 4), MM: iso.slice(5, 7), dd: iso.slice(8, 10), HH: iso.slice(11, 13), mm: iso.slice(14, 16), ss: iso.slice(17, 19), XXX: '+08:00' };
  return String(pattern).replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss|XXX/g, (m, lit) => (lit !== undefined ? lit : tok[m]));
}

class MockRange {
  constructor(sheet, row, col, nr, nc) {
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.nr || values.some((l) => l.length !== this.nc)) {
      throw new Error(`setValues dimensi tak padan: jangka ${this.nr}x${this.nc}`);
    }
    values.forEach((line, r) => {
      const ri = this.row - 1 + r;
      this.sheet.data[ri] = this.sheet.data[ri] || [];
      line.forEach((v, c) => { this.sheet.data[ri][this.col - 1 + c] = v; });
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  getValue() { return this.getValues()[0][0]; }
  /** Salin nilai ke julat lain (template baris item). */
  copyTo(dest) { dest.setValues(this.getValues().slice(0, dest.nr).map((l) => l.slice(0, dest.nc))); return this; }
  setFontWeight() { return this; }
  setNumberFormat(f) { this.sheet.formats.push({ col: this.col, row: this.row, f }); return this; }
  setBackground() { return this; }
  setDataValidation(rule) {
    this.sheet.validations.push({ col: this.col, row: this.row, nr: this.nr, rule });
    return this;
  }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.frozen = 0;
    this.validations = [];
    this.formats = [];
  }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) {
      if ((this.data[r] || []).some((v) => v !== '' && v !== undefined)) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.data.forEach((line) => {
      (line || []).forEach((v, i) => { if (v !== '' && v !== undefined) max = Math.max(max, i + 1); });
    });
    return max;
  }
  getMaxRows() { return 1000; }
  getRange(row, col, nr = 1, nc = 1) {
    if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error(`getRange tak sah ${row},${col},${nr},${nc}`);
    return new MockRange(this, row, col, nr, nc);
  }
  setFrozenRows(n) { this.frozen = n; }
  setName(n) { this.name = n; return this; }
  getSheetId() { return this.sheetId || (this.sheetId = 1000 + Math.floor(Math.random() * 1e6)); }
  getMaxColumns() { return Math.max(this.getLastColumn(), 10); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  insertRowsAfter(row, n) { this.data.splice(row, 0, ...Array.from({ length: n }, () => [])); }
  copyTo(ss) { const c = new MockSheet('Copy of ' + this.name); c.data = this.data.map((l) => (l ? l.slice() : [])); ss.sheets.set(c.name, c); return c; }
  deleteRow(n) { this.data.splice(n - 1, 1); }
  appendRow(line) { this.data[this.getLastRow()] = Array.from(line); return this; }
  header() { return (this.data[0] || []).slice(0, this.getLastColumn()); }
  rows() {
    const h = this.header();
    return this.data.slice(1, this.getLastRow()).map((line) => Object.fromEntries(h.map((k, i) => [k, line[i] ?? ''])));
  }
}

class MockSpreadsheet {
  constructor(name, id) { this.name = name; this.id = id || 'ss-' + name; this.sheets = new Map(); }
  getName() { return this.name; }
  getId() { return this.id; }
  deleteSheet(sh) { this.sheets.delete(sh.name); }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  getSheets() { return [...this.sheets.values()]; }
  insertSheet(n) {
    if (this.sheets.has(n)) throw new Error('Sheet wujud: ' + n);
    const s = new MockSheet(n); this.sheets.set(n, s); return s;
  }
}

const fromJava = (arr) => Buffer.from(Array.from(arr, (b) => (b + 256) % 256));

class MockBlob {
  constructor(bytes, mime, name) { this.bytes = typeof bytes === 'string' ? toJavaBytes(Buffer.from(bytes, 'utf8')) : Array.from(bytes); this.mime = mime; this.name = name; }
  /** Tukar HTML ke "PDF" ujian: %PDF- + HTML asal, supaya ujian boleh semak kandungan. */
  getAs(mime) { return new MockBlob(toJavaBytes(Buffer.concat([Buffer.from('%PDF-1.4 MOCK\n'), fromJava(this.bytes)])), mime, this.name); }
  setName(n) { this.name = n; return this; }
  getDataAsString() { return fromJava(this.bytes).toString('utf8'); }
  getBytes() { return this.bytes; }
  getContentType() { return this.mime; }
  getName() { return this.name; }
}

const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };

/** Perkongsian Drive (audit IPD 3.2): lalai PRIVATE, pemilik = akaun sistem. */
class Sharing {
  initSharing() { this.access = 'PRIVATE'; this.permission = 'NONE'; this.editors = []; this.viewers = []; this.owner = 'systems@voltake.com'; }
  getSharingAccess() { return this.access; }
  getSharingPermission() { return this.permission; }
  setSharing(a, p) { this.access = a; this.permission = p; return this; }
  getOwner() { return { getEmail: () => this.owner }; }
  getEditors() { return this.editors.map((e) => ({ getEmail: () => e })); }
  getViewers() { return this.viewers.map((e) => ({ getEmail: () => e })); }
}

class MockFile extends Sharing {
  constructor(id, blob) { super(); this.initSharing(); this.id = id; this.blob = blob; this.trashed = false; }
  getId() { return this.id; }
  getName() { return this.blob.name; }
  getBlob() { return this.blob; }
  getMimeType() { return this.blob.mime; }
  setTrashed(v) { this.trashed = v; return this; }
  isTrashed() { return this.trashed; }
  makeCopy(name, folder) {
    const f = folder.createFile(new MockBlob(this.blob.bytes, this.blob.mime, name));
    f.copyOf = this.id;
    return f;
  }
}

class MockFolder extends Sharing {
  constructor(drive, id, name, parent = null) { super(); this.initSharing(); this.drive = drive; this.id = id; this.name = name; this.folders = []; this.files = []; this.parent = parent; this.trashed = false; }
  getId() { return this.id; }
  getName() { return this.name; }
  getParents() { return iter(this.parent ? [this.parent] : []); }
  getFolders() { return iter(this.folders.filter((f) => !f.trashed)); }
  getFiles() { return iter(this.files.filter((f) => !f.trashed)); }
  getFilesByName(n) { return iter(this.files.filter((f) => !f.trashed && f.getName() === n)); }
  setTrashed(v) { this.trashed = v; return this; }
  getFoldersByName(n) { return iter(this.folders.filter((f) => !f.trashed && f.name === n)); }
  createFolder(n) { const f = new MockFolder(this.drive, 'fld-' + (++this.drive.seq), n, this); this.folders.push(f); this.drive.byId.set(f.id, f); return f; }
  createFile(blob) { const f = new MockFile('file-' + (++this.drive.seq), blob); this.files.push(f); this.drive.files.set(f.id, f); return f; }
}

function createGas({ props = {}, spreadsheetName = 'VP-STG-Access', userEmail = 'systems@voltake.com' } = {}) {
  const store = { ...props };
  const spreadsheet = new MockSpreadsheet(spreadsheetName);
  const triggers = [];
  const mails = [];
  const logs = [];
  const cacheStore = new Map();
  const counters = { openById: 0 };
  const drive = { seq: 0, byId: new Map(), files: new Map(), temps: new Map() };
  drive.root = new MockFolder(drive, 'my-drive', 'My Drive');
  const fetches = [];
  let lockHeld = false;

  const ctx = {
    console,
    Logger: { log: (m) => logs.push(String(m)) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
      }),
    },
    SpreadsheetApp: {
      openById: (id) => {
        counters.openById++;
        if (drive.temps.has(id)) return drive.temps.get(id);
        if (id !== store.SPREADSHEET_ID) throw new Error('Spreadsheet tak dijumpai: ' + id);
        return spreadsheet;
      },
      // Spreadsheet sementara (DO ClaimReport): didaftar sebagai fail Drive supaya boleh dibuang ke Trash
      create: (name) => {
        const ss = new MockSpreadsheet(name, 'tmp-' + (++drive.seq));
        ss.insertSheet('Sheet1');
        drive.temps.set(ss.id, ss);
        drive.files.set(ss.id, new MockFile(ss.id, new MockBlob('', 'application/vnd.google-apps.spreadsheet', name)));
        return ss;
      },
      flush: () => {},
      newDataValidation: () => {
        const rule = {};
        const b = {
          requireValueInList: (list, dropdown) => { rule.list = list; rule.dropdown = dropdown; return b; },
          setAllowInvalid: (x) => { rule.allowInvalid = x; return b; },
          build: () => rule,
        };
        return b;
      },
    },
    DriveApp: {
      Access: { PRIVATE: 'PRIVATE', ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', DOMAIN: 'DOMAIN', DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK' },
      Permission: { NONE: 'NONE', VIEW: 'VIEW', EDIT: 'EDIT', COMMENT: 'COMMENT' },
      getRootFolder: () => drive.root,
      getFolderById: (id) => {
        if (id !== store.ROOT_FOLDER_ID && !drive.byId.has(id)) throw new Error('Folder tak dijumpai');
        if (!drive.byId.has(id)) { const f = new MockFolder(drive, id, 'VP-Files', drive.root); drive.root.folders.push(f); drive.byId.set(id, f); }
        const f = drive.byId.get(id);
        if (f.trashed) throw new Error('Folder dalam Trash');
        return f;
      },
      getFileById: (id) => {
        if (id === store.SPREADSHEET_ID && !drive.files.has(id)) drive.files.set(id, new MockFile(id, new MockBlob('', 'application/vnd.google-apps.spreadsheet', spreadsheetName)));
        if (!drive.files.has(id)) throw new Error('Fail tak dijumpai: ' + id);
        return drive.files.get(id);
      },
      getFilesByName: (n) => iter([...drive.files.values()].filter((f) => f.getName() === n)),
    },
    // Eksport Sheets (ClaimReport): "PDF"/"XLSX" ujian = JSON isi tab yang dieksport, supaya ujian boleh semak
    UrlFetchApp: {
      fetch: (url, opt) => {
        fetches.push({ url, opt });
        const m = /spreadsheets\/d\/([^/]+)\/export\?format=(pdf|xlsx)(?:&gid=(\d+))?/.exec(url);
        if (!m || !drive.temps.has(m[1])) throw new Error('UrlFetch tak dijangka: ' + url);
        const ss = drive.temps.get(m[1]);
        const sh = [...ss.sheets.values()].find((x) => !m[3] || String(x.sheetId) === m[3]);
        const mime = m[2] === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const text = (m[2] === 'pdf' ? '%PDF-1.4 MOCK\n' : 'PK-MOCK\n') + JSON.stringify({ sheet: sh.name, data: sh.data });
        return { getBlob: () => new MockBlob(text, mime, 'export'), getResponseCode: () => 200 };
      },
    },
    ScriptApp: {
      getOAuthToken: () => 'token-ujian',
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.handler })),
      WeekDay: { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY' },
      newTrigger: (handler) => {
        const t = { handler };
        const b = {
          timeBased: () => b,
          onMonthDay: (d) => { t.monthDay = d; return b; },
          onWeekDay: (d) => { t.weekDay = d; return b; },
          everyDays: (d) => { t.everyDays = d; return b; },
          atHour: (h) => { t.hour = h; return b; },
          create: () => { triggers.push(t); return t; },
        };
        return b;
      },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => userEmail }) },
    Utilities: {
      formatDate,
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => toJavaBytes(nodeCrypto.createHash(alg).update(String(text), 'utf8').digest()),
      newBlob: (bytes, mime, name) => new MockBlob(bytes, mime, name),
      getUuid: () => nodeCrypto.randomUUID(),
      zip: (blobs, name) => new MockBlob('PK-ZIP\n' + JSON.stringify(blobs.map((b) => b.name)), 'application/zip', name),
      base64Decode: (str) => toJavaBytes(Buffer.from(String(str), 'base64')),
      base64Encode: (bytes) => fromJava(bytes).toString('base64'),
      computeHmacSha256Signature: (value, key) =>
        toJavaBytes(nodeCrypto.createHmac('sha256', Buffer.from(String(key), 'utf8')).update(String(value), 'utf8').digest()),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => { cacheStore.set(k, String(v)); },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { lockHeld = true; },
        releaseLock: () => { lockHeld = false; },
        hasLock: () => lockHeld,
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; }, getContent() { return this.text; } }),
    },
    MailApp: { sendEmail: (m) => mails.push(m) },
  };
  vm.createContext(ctx);
  return { ctx, store, spreadsheet, triggers, mails, logs, cacheStore, counters, drive, fetches, MockFile, MockBlob };
}

function loadGas(gas, dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort();
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), gas.ctx, { filename: f });
  }
  return gas;
}

module.exports = { createGas, loadGas };
