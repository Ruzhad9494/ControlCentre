// S-02 Dashboard (F-02, F-09; DBD 6 banner + grid kad; AFD 5).
import { getMe, takeNext } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { icon, renderHeader, registerSW } from '/shared/ui/components.js';

// Warna latar ikon (tema 21/11/2026: biru, navy, oren logo, hijau)
const COLORS = {
  hr: 'linear-gradient(135deg,#0B4FE6,#0A2C82)', costcalc: 'linear-gradient(135deg,#FFA516,#FF7A00)', gwr: 'linear-gradient(135deg,#0B1734,#1A2A55)',
  ams: 'linear-gradient(135deg,#00A35A,#00732A)', claimpro: 'linear-gradient(135deg,#0B4FE6,#0A2C82)', compliance: 'linear-gradient(135deg,#FFA516,#E06A00)',
  claimreport: 'linear-gradient(135deg,#3A7BFF,#0B4FE6)', voltrack: 'linear-gradient(135deg,#0F9C8F,#0F766E)', info: 'linear-gradient(135deg,#5B6B85,#3B4A63)',
  admin: 'linear-gradient(135deg,#0B1734,#1A2A55)',
};
/** Ucapan ikut masa Malaysia. */
function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', hour12: false }).format(new Date())) % 24;
  return h < 12 ? 'Selamat pagi' : h < 14 ? 'Selamat tengah hari' : h < 19 ? 'Selamat petang' : 'Selamat malam';
}
const STATUS_TAG = { belum_live: 'Akan datang', maintenance: 'Penyelenggaraan' };
const DISMISS_KEY = 'vp_install_dismissed';

function card({ id, nama, subtajuk, ikon, href, status }) {
  const live = !status || status === 'aktif';
  const inner = [
    el('span', { class: 'ic', style: `background:${COLORS[id] || COLORS.info}` }, icon(ikon, 'icon icon-lg')),
    el('h3', null, nama),
    subtajuk ? el('span', { class: 'caption' }, subtajuk) : null,
    live ? null : el('span', { class: 'badge tag' }, STATUS_TAG[status] || status),
  ];
  return live
    ? el('a', { class: 'module-card', href }, inner)
    : el('div', { class: 'module-card off', 'aria-disabled': 'true' }, inner);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function installBanner() {
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* abaikan */ }
  if (dismissed || isStandalone()) return null;
  const box = el('div', { class: 'alert alert-warning row-between' },
    el('span', { class: 'row' }, icon('smartphone'), 'Install Voltake di telefon untuk buka terus dari skrin utama.'),
    el('span', { class: 'row' },
      el('a', { class: 'btn btn-sm', href: '/install/' }, 'Cara install'),
      el('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'Tutup', onclick: () => {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* abaikan */ }
        box.remove();
      } }, icon('x'))));
  return box;
}

async function main() {
  const main = document.getElementById('main');
  let me;
  try {
    me = await getMe();
  } catch (e) {
    if (e.status === 401) return;
    clear(main).append(el('div', { class: 'alert alert-danger' }, e.message, ' ', el('a', { href: '/' }, 'Cuba lagi')));
    return;
  }
  const next = takeNext();
  if (next && next !== '/' && next !== location.pathname) {
    location.replace(next);
    return;
  }

  renderHeader(me, 'Dashboard');
  registerSW();

  const cards = me.modules.map((m) => card({ id: m.module_id, nama: m.nama, subtajuk: m.subtajuk, ikon: m.ikon, href: m.path, status: m.status }));
  cards.push(card({ id: 'info', nama: 'More Info', subtajuk: 'Info & hubungi IT', ikon: 'info', href: '/about/' }));
  if (me.admin.access) cards.push(card({ id: 'admin', nama: 'Admin', subtajuk: 'Staf, akses & log', ikon: 'user-cog', href: '/admin/' }));
  else if (me.admin.staff) cards.push(card({ id: 'admin', nama: 'Senarai Staf', subtajuk: 'Status staf (HR)', ikon: 'users', href: '/admin/#staf' }));

  append(clear(main),
    el('section', { class: 'banner', 'aria-labelledby': 'welcome' },
      el('span', { class: 'accent', 'aria-hidden': 'true' }),
      el('h1', { id: 'welcome' }, `${greeting()}, ${String(me.staff.nama || '').split(' ')[0]}`),
      el('p', null, 'Welcome to Voltake Operations Portal. Pilih sistem di bawah untuk mula.')),
    installBanner(),
    me.modules.length === 0
      ? el('div', { class: 'alert alert-info' }, 'Akaun anda belum diberi akses ke mana-mana modul. Hubungi Admin jika ini satu kesilapan.')
      : null,
    el('nav', { 'aria-label': 'Modul' }, el('div', { class: 'module-grid' }, cards)),
  );
  main.classList.add('stack');
  main.removeAttribute('aria-busy');
}

main();
