// Ujian Fasa 0: tools/build.sh petakan laluan betul dan tak dedahkan fail backend/docs.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function listFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  })(dir);
  return out.sort();
}

function build(outDir) {
  execFileSync('bash', [path.join(ROOT, 'tools', 'build.sh'), outDir], { stdio: 'pipe' });
  return listFiles(outDir);
}

test('repo sebenar: portal di /, tiada .gs/docs/config/.github dalam output', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-dist-'));
  const files = build(out);
  assert.ok(files.includes('index.html'), 'index.html portal mesti di root');
  assert.ok(files.includes('_redirects'));
  for (const f of files) {
    assert.ok(!/\.gs$|\.md$|appsscript\.json$|\.clasp|^docs\/|^config\/|^\.github\/|^tools\/|^functions\//.test(f), 'Fail tak patut didedah: ' + f);
    assert.ok(!f.includes('.gitkeep'), 'gitkeep tak patut disalin: ' + f);
  }
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html, /Coming soon/);
});

test('fixture: apps/<m>/web -> /<m>/, public-pages/x -> /public/x/, gas tak disalin', () => {
  const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-fx-'));
  fs.mkdirSync(path.join(fx, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tools', 'build.sh'), path.join(fx, 'tools', 'build.sh'));
  const w = (p, s = 'x') => { fs.mkdirSync(path.dirname(path.join(fx, p)), { recursive: true }); fs.writeFileSync(path.join(fx, p), s); };
  w('apps/portal/index.html');
  w('apps/claimpro/web/index.html');
  w('apps/claimpro/gas/Code.gs');
  w('apps/compliance-track/web/app.js');
  w('apps/gwr/web/.gitkeep', '');
  w('apps/access/gas/Setup.gs');
  w('shared/ui/voltake.css');
  w('shared/gas/VPAuth.gs');
  w('public-pages/mohon/index.html');
  w('_headers');

  const out = path.join(fx, 'dist');
  execFileSync('bash', [path.join(fx, 'tools', 'build.sh'), out], { stdio: 'pipe' });
  assert.deepEqual(listFiles(out), [
    '_headers',
    'claimpro/index.html',
    'compliance-track/app.js',
    'index.html',
    'public/mohon/index.html',
    'shared/ui/voltake.css',
  ]);
});

test('jaring keselamatan: build gagal jika fail .gs terselit dalam web/', () => {
  const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-fx-'));
  fs.mkdirSync(path.join(fx, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tools', 'build.sh'), path.join(fx, 'tools', 'build.sh'));
  fs.mkdirSync(path.join(fx, 'apps', 'ams', 'web'), { recursive: true });
  fs.writeFileSync(path.join(fx, 'apps', 'ams', 'web', 'Silap.gs'), 'x');
  assert.throws(() => execFileSync('bash', [path.join(fx, 'tools', 'build.sh'), path.join(fx, 'dist')], { stdio: 'pipe' }));
});
