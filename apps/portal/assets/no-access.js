// S-03 Tiada akses / ralat (AFD 3 Journey login, AFD 4).
import { el, clear } from '/shared/lib/escape.js';

const REASONS = {
  tiada_staf: ['Emel belum didaftar', 'Emel ini belum didaftar dalam sistem. Hubungi Admin atau HR untuk daftar.', true],
  tamat: ['Akses ditamatkan', 'Akses anda telah ditamatkan. Hubungi HR jika ini satu kesilapan.', true],
  sub_tak_padan: ['Akaun tak sepadan', 'Akaun Google ini tidak sepadan dengan akaun yang didaftarkan untuk emel ini. Hubungi Admin untuk pengesahan identiti.', true],
  email_tak_sah: ['Log masuk gagal', 'Akaun Google tidak dapat disahkan. Cuba lagi.', true],
  modul: ['Tiada akses modul', 'Anda tiada akses ke modul ini. Jika perlu, minta Admin tambah akses.', false],
  maintenance: ['Dalam penyelenggaraan', 'Modul ini sedang diselenggara. Cuba sebentar lagi.', false],
};

const r = new URLSearchParams(location.search).get('r');
const [title, text, loginIssue] = REASONS[r] || ['Tiada akses', 'Anda tiada akses ke halaman ini.', false];
document.title = title + ' - Voltake';
document.getElementById('tajuk').textContent = title;
document.getElementById('reason').textContent = text;

const hash = new URLSearchParams(location.hash.slice(1));
const tried = hash.get('e');
if (tried) {
  const p = document.getElementById('tried');
  clear(p).append('Akaun yang dicuba: ', el('strong', null, tried));
  p.hidden = false;
  history.replaceState(null, '', location.pathname + location.search); // buang emel dari bar alamat
}

const actions = document.getElementById('actions');
if (loginIssue) {
  actions.append(el('a', { class: 'btn', href: '/login/?keluar=1' }, 'Guna akaun lain'));
} else {
  actions.append(el('a', { class: 'btn', href: '/' }, 'Kembali ke Dashboard'));
}
