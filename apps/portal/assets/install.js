// S-07 Panduan install PWA (F-04).
import { el } from '/shared/lib/escape.js';
import { icon, registerSW, toast } from '/shared/ui/components.js';

registerSW();

// Alamat sebenar (portal.voltake.com / pages.dev / staging) supaya panduan tak perlu ubah bila domain bertukar.
const HOST = location.host;

const GUIDES = [
  ['iPhone / iPad (Safari, iOS 16.4 ke atas)', 'smartphone', [
    `Buka ${HOST} dalam Safari (bukan Chrome atau app WhatsApp).`,
    ['Tekan butang Share ', icon('share'), ' di bawah skrin.'],
    ['Skrol dan pilih "Add to Home Screen" ', icon('square-plus'), '.'],
    'Tekan "Add". Ikon Voltake muncul di skrin utama.',
    'Buka dari ikon itu dan log masuk sekali lagi (app di iPhone simpan login berasingan dari Safari).',
  ]],
  ['Android (Chrome)', 'smartphone', [
    `Buka ${HOST} dalam Chrome.`,
    ['Tekan menu ', icon('ellipsis-vertical'), ' di atas kanan.'],
    'Pilih "Install app" atau "Add to Home screen", kemudian "Install".',
    'Buka Voltake dari skrin utama atau senarai app.',
  ]],
  ['Komputer (Chrome atau Edge)', 'monitor', [
    `Buka ${HOST}.`,
    ['Tekan ikon install ', icon('download'), ' di hujung kanan bar alamat, atau menu > "Install Voltake".'],
    'Voltake dibuka dalam tetingkap sendiri dan boleh dipin ke taskbar.',
  ]],
];

const guides = document.getElementById('guides');
for (const [title, ic, steps] of GUIDES) {
  guides.append(el('section', { class: 'card stack' },
    el('h3', { class: 'row' }, icon(ic), title),
    el('ol', { class: 'prose' }, steps.map((s) => el('li', null, s)))));
}

const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
if (standalone) document.getElementById('installed').hidden = false;

let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  document.getElementById('install-now').hidden = false;
});
document.getElementById('btn-install').addEventListener('click', async () => {
  if (!deferred) return;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === 'accepted') toast('Voltake sedang di-install.', 'success');
  deferred = null;
  document.getElementById('install-now').hidden = true;
});
window.addEventListener('appinstalled', () => toast('Voltake berjaya di-install.', 'success'));

// Pautan balik
document.getElementById('main').prepend(el('a', { href: '/', class: 'btn btn-ghost btn-sm' }, icon('arrow-left'), 'Kembali'));
