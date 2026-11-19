// shared/lib/privacy.js - notis privasi pekerja (TRD 6 "PDPA dan emel peribadi staf"; IPD 1.16).
// DRAF: perlu disemak HR + penasihat undang-undang sebelum go-live penuh (IPD P-11).
// Bila teks berubah, naikkan PRIVACY_VERSION dan kemas kini Settings.privacy_notice_version.
import { el } from './escape.js';

export const PRIVACY_VERSION = 'v1-draf-2026-11';

const SECTIONS = [
  ['Data yang dikumpul', [
    'Emel akaun Google yang anda guna untuk log masuk (akaun @voltake.com atau Gmail peribadi) dan ID akaun Google.',
    'Nama, no. pekerja, department dan jawatan.',
    'Rekod log masuk: masa, hash alamat IP (bukan IP sebenar) dan jenis pelayar.',
  ]],
  ['Tujuan', [
    'Mengesahkan identiti anda semasa log masuk dan mengawal modul yang anda boleh buka. Itu sahaja.',
    'Emel peribadi tidak digunakan untuk pemasaran dan tidak dikongsi dengan pihak luar.',
  ]],
  ['Siapa boleh lihat', [
    'Admin sistem dan HR. Emel peribadi anda tidak dipaparkan kepada staf lain dalam mana-mana modul (paparan guna nama dan no. pekerja).',
  ]],
  ['Tempoh simpanan', [
    'Selama anda bekerja dengan Voltake, dan sehingga 12 bulan selepas tarikh tamat. Selepas itu emel dianonimkan.',
    'Log masuk disimpan 12 bulan.',
  ]],
  ['Penyimpanan di luar Malaysia', [
    'Data disimpan dalam Google Workspace dan melalui Cloudflare, yang mungkin memproses data di luar Malaysia.',
  ]],
  ['Hak anda', [
    'Anda boleh minta salinan atau pembetulan data anda melalui HR.',
  ]],
];

export function renderPrivacy({ heading = true } = {}) {
  return el('div', { class: 'prose', id: 'privasi' },
    heading ? el('h3', null, 'Notis Privasi Pekerja') : null,
    SECTIONS.map(([t, items]) => [el('p', null, el('strong', null, t)), el('ul', null, items.map((i) => el('li', null, i)))]),
    el('p', { class: 'caption' }, 'Versi ' + PRIVACY_VERSION + '. Teks ini masih draf dan akan dimuktamadkan oleh HR.'));
}
