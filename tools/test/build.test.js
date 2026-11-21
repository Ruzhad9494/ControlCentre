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
  for (const f of ['login/index.html', 'no-access/index.html', 'admin/index.html', 'about/index.html', 'install/index.html',
    '_routes.json', '_headers', 'manifest.webmanifest', 'sw.js', 'shared/ui/voltake.css', 'shared/ui/icons.svg', 'icons/icon-512.png']) {
    assert.ok(files.includes(f), 'Hilang dari output: ' + f);
  }
  const routes = JSON.parse(fs.readFileSync(path.join(out, '_routes.json'), 'utf8'));
  assert.deepEqual(routes.include.sort(), ['/api/*', '/auth/*', '/public/api/*'], 'Functions hanya untuk /auth, /api, /public/api');
  const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8');
  for (const h of ['Content-Security-Policy', "frame-ancestors 'none'", "object-src 'none'", 'X-Content-Type-Options: nosniff', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.ok(headers.includes(h), '_headers perlu ' + h);
  }
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

test('HTML portal: tiada skrip inline (CSP script-src self) dan setiap skrip/CSS wujud dalam output', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-dist-'));
  const files = build(out);
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(out, f), 'utf8');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'Skrip inline dalam ' + f);
    assert.ok(!/\son[a-z]+=/i.test(html), 'Atribut on* inline dalam ' + f);
    for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
      const ref = m[1].endsWith('/') ? m[1] + 'index.html' : m[1];
      assert.ok(files.includes(ref.slice(1)), `${f} rujuk ${m[1]} yang tiada dalam output`);
    }
  }
});

test('sw.js: setiap fail SHELL wujud dalam output; /api dan /auth tidak di-cache', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-dist-'));
  const files = build(out);
  const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const u0 of shell) {
    const u = u0.split('?')[0];   // ?v=2 = cache-bust sahaja
    const f = u === '/' ? 'index.html' : u.endsWith('/') ? u.slice(1) + 'index.html' : u.slice(1);
    assert.ok(files.includes(f), 'SHELL rujuk fail tiada: ' + u);
  }
  assert.match(sw, /NETWORK_ONLY = \/\^\\\/\(api\|auth\|public\\\/api\)\\\//);
});

test('import JS dalam output semuanya boleh diselesaikan', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-dist-'));
  const files = build(out);
  for (const f of files.filter((x) => x.endsWith('.js') && x !== 'sw.js')) {
    const src = fs.readFileSync(path.join(out, f), 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      const resolved = spec.startsWith('/') ? spec.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
      assert.ok(files.includes(resolved), `${f} import ${spec} tiada dalam output`);
    }
  }
});
