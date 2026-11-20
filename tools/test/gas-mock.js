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
  deleteRow(n) { this.data.splice(n - 1, 1); }
  appendRow(line) { this.data[this.getLastRow()] = Array.from(line); return this; }
  header() { return (this.data[0] || []).slice(0, this.getLastColumn()); }
  rows() {
    const h = this.header();
    return this.data.slice(1, this.getLastRow()).map((line) => Object.fromEntries(h.map((k, i) => [k, line[i] ?? ''])));
  }
}

class MockSpreadsheet {
  constructor(name) { this.name = name; this.sheets = new Map(); }
  getName() { return this.name; }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  insertSheet(n) {
    if (this.sheets.has(n)) throw new Error('Sheet wujud: ' + n);
    const s = new MockSheet(n); this.sheets.set(n, s); return s;
  }
}

const fromJava = (arr) => Buffer.from(Array.from(arr, (b) => (b + 256) % 256));

class MockBlob {
  constructor(bytes, mime, name) { this.bytes = Array.from(bytes); this.mime = mime; this.name = name; }
  getBytes() { return this.bytes; }
  getContentType() { return this.mime; }
  getName() { return this.name; }
}

class MockFile {
  constructor(id, blob) { this.id = id; this.blob = blob; this.trashed = false; }
  getId() { return this.id; }
  getName() { return this.blob.name; }
  getBlob() { return this.blob; }
  getMimeType() { return this.blob.mime; }
  setTrashed(v) { this.trashed = v; return this; }
}

class MockFolder {
  constructor(drive, id, name) { this.drive = drive; this.id = id; this.name = name; this.folders = []; this.files = []; }
  getId() { return this.id; }
  getName() { return this.name; }
  getFoldersByName(n) {
    const hit = this.folders.filter((f) => f.name === n);
    let i = 0;
    return { hasNext: () => i < hit.length, next: () => hit[i++] };
  }
  createFolder(n) { const f = new MockFolder(this.drive, 'fld-' + (++this.drive.seq), n); this.folders.push(f); this.drive.byId.set(f.id, f); return f; }
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
  const drive = { seq: 0, byId: new Map(), files: new Map() };
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
        if (id !== store.SPREADSHEET_ID) throw new Error('Spreadsheet tak dijumpai: ' + id);
        return spreadsheet;
      },
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
      getFolderById: (id) => {
        if (id !== store.ROOT_FOLDER_ID && !drive.byId.has(id)) throw new Error('Folder tak dijumpai');
        if (!drive.byId.has(id)) drive.byId.set(id, new MockFolder(drive, id, 'VP-Files'));
        return drive.byId.get(id);
      },
      getFileById: (id) => {
        if (!drive.files.has(id)) throw new Error('Fail tak dijumpai: ' + id);
        return drive.files.get(id);
      },
    },
    ScriptApp: {
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
  return { ctx, store, spreadsheet, triggers, mails, logs, cacheStore, counters, drive };
}

function loadGas(gas, dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort();
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), gas.ctx, { filename: f });
  }
  return gas;
}

module.exports = { createGas, loadGas };
