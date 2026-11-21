// sw.js - service worker Voltake Portal (F-04; TRD 2 "App shell offline").
// - /api, /auth, /public/api: network sahaja (data & sesi TIDAK pernah di-cache)
// - navigasi halaman: network dahulu, fallback cache, kemudian /offline.html
// - fail statik: cache dahulu, kemas kini di belakang (stale-while-revalidate)
// Naikkan VERSION setiap kali senarai SHELL berubah.
const VERSION = 'vp-shell-2026-11-21-2';
// GWR (/gwr/...) dalam SHELL: digunakan di site tanpa line (F-31), app + barisan offline mesti ada dalam cache.
const SHELL = [
  '/', '/login/', '/no-access/', '/about/', '/install/', '/admin/', '/offline.html',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/favicon-32.png', '/icons/logo-mark.png',
  '/shared/ui/voltake.css', '/shared/ui/components.js', '/shared/ui/icons.svg',
  '/shared/ui/fonts/manrope-latin-400-normal.woff2', '/shared/ui/fonts/manrope-latin-500-normal.woff2',
  '/shared/ui/fonts/manrope-latin-600-normal.woff2', '/shared/ui/fonts/manrope-latin-700-normal.woff2',
  '/shared/ui/fonts/manrope-latin-800-normal.woff2',
  '/shared/lib/api.js', '/shared/lib/escape.js', '/shared/lib/format.js', '/shared/lib/privacy.js', '/shared/lib/page.js',
  '/assets/dashboard.js', '/assets/login.js', '/assets/no-access.js', '/assets/about.js', '/assets/install.js',
  '/assets/admin.js', '/assets/offline.js',
  '/gwr/', '/gwr/app.js', '/gwr/outbox.js', '/gwr/gwr.css', '/shared/lib/fileprep.js', '/shared/lib/signature.js',
];
const NETWORK_ONLY = /^\/(api|auth|public\/api)\//;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Satu fail gagal tidak boleh gagalkan seluruh install
    await Promise.all(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NETWORK_ONLY.test(url.pathname)) return; // biar browser terus ke rangkaian

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') (await caches.open(VERSION)).put(req, res.clone());
        return res;
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    const fresh = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) {
      event.waitUntil(fresh);
      return hit;
    }
    return (await fresh) || Response.error();
  })());
});
