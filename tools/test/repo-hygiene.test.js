// Ujian Fasa 0: kebersihan repo (TRD 6, IPD seksyen 6 "Secret dalam repo").
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

test('.gitignore sekat fail kredential', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  for (const p of ['.clasprc.json', '.clasp.json', '.env*', '*.key', '.dev.vars']) {
    assert.ok(gi.split('\n').includes(p), '.gitignore perlu ' + p);
  }
});

test('tiada fail kredential dalam git', () => {
  const bad = tracked.filter((f) => /(^|\/)(\.clasprc\.json|\.clasp\.json|\.dev\.vars)$|\.key$|(^|\/)\.env(?!\.example$)/.test(f));
  assert.deepEqual(bad, []);
});

test('tiada URL Apps Script / Spreadsheet ID / secret dalam kod', () => {
  const codeDirs = ['apps/', 'shared/', 'functions/', 'config/', 'public-pages/'];
  const patterns = [
    /script\.google\.com\/macros\/s\//,
    /docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{25,}/,
    /GOCSPX-/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  const hits = [];
  for (const f of tracked.filter((t) => codeDirs.some((d) => t.startsWith(d)))) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const p of patterns) if (p.test(s)) hits.push(`${f}: ${p}`);
  }
  assert.deepEqual(hits, []);
});

test('.env.example hanya nama pemboleh ubah, tiada nilai', () => {
  const lines = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'));
  for (const l of lines) assert.match(l, /^[A-Z0-9_]+=$/, 'Ada nilai dalam .env.example: ' + l);
  // TRD 9: 8 modul x (GAS_URL + MODULE_SECRET) + 5 asas
  assert.equal(lines.length, 21);
});

test('struktur repo ikut TRD 4', () => {
  const mods = ['draftmohonkerja', 'costcalculator', 'gwr', 'ams', 'claimpro', 'compliance-track', 'claimreport', 'voltrack'];
  for (const m of mods) {
    assert.ok(fs.existsSync(path.join(ROOT, 'apps', m, 'web')), m + '/web');
    assert.ok(fs.existsSync(path.join(ROOT, 'apps', m, 'gas')), m + '/gas');
  }
  for (const d of ['apps/portal', 'apps/access/gas', 'shared/ui', 'shared/lib', 'shared/gas', 'functions', 'config', 'docs', 'public-pages/mohon', 'public-pages/gwr-sign']) {
    assert.ok(fs.existsSync(path.join(ROOT, d)), d);
  }
  for (const n of ['01-PRD', '02-TRD', '03-AFD', '04-DBD', '05-BSD', '06-IPD']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', n + '.md')), 'docs/' + n + '.md');
  }
});

test('config/modules.json: dir wujud di apps/ dan path = /<dir>/', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'modules.json'), 'utf8')).modules;
  assert.equal(cfg.length, 8);
  for (const m of cfg) {
    assert.equal(m.path, '/' + m.dir + '/');
    assert.ok(fs.existsSync(path.join(ROOT, 'apps', m.dir)), m.dir);
    assert.match(m.warna, /^#[0-9A-F]{6}$/);
  }
});
