// shared/ui/components.js - komponen UI kongsi (DBD 6): ikon, toast, modal, header portal, badge.
import { el, clear } from '../lib/escape.js';
import { initials } from '../lib/format.js';
import { logout } from '../lib/api.js';

const SPRITE = '/shared/ui/icons.svg';
const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, cls = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${SPRITE}#i-${String(name).replace(/[^a-z0-9-]/g, '')}`);
  svg.appendChild(use);
  return svg;
}

// ------------------------------------------------------------ toast
let host;
export function toast(message, type = 'info', ms = 4000) {
  if (!host) {
    host = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  const ic = { success: 'circle-check', danger: 'circle-x', warning: 'triangle-alert' }[type] || 'info';
  const t = el('div', { class: `toast toast-${type}` }, icon(ic), el('span', null, message));
  host.appendChild(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

// ------------------------------------------------------------ modal (fokus terperangkap, Esc tutup)
export function openModal({ title, body, actions = [], wide = false, onClose }) {
  const prevFocus = document.activeElement;
  const titleId = 'm' + Math.random().toString(36).slice(2);
  const closeBtn = el('button', { class: 'btn btn-ghost icon-btn', type: 'button', 'aria-label': 'Tutup' }, icon('x'));
  const foot = el('div', { class: 'modal-foot' });
  const dialog = el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    el('div', { class: 'modal-head' }, el('h2', { id: titleId }, title), closeBtn),
    el('div', { class: 'modal-body' }, body),
    foot);
  const backdrop = el('div', { class: 'modal-backdrop' }, dialog);

  function close(result) {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('modal-open');
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose(result);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(null); }
    if (e.key === 'Tab') {
      const f = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  closeBtn.addEventListener('click', () => close(null));
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(null); });
  for (const a of actions) {
    const b = el('button', { class: 'btn ' + (a.class || ''), type: 'button' }, a.label);
    b.addEventListener('click', () => a.onClick ? a.onClick({ close, button: b }) : close(a.value ?? null));
    foot.appendChild(b);
  }
  document.addEventListener('keydown', onKey, true);
  document.body.classList.add('modal-open');
  document.body.appendChild(backdrop);
  const firstInput = dialog.querySelector('input, select, textarea');
  (firstInput || closeBtn).focus();
  return { close, dialog };
}

/** Pengesahan ringkas. Pulang Promise<boolean>. */
export function confirmDialog(title, message, { okLabel = 'Teruskan', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: el('p', null, message),
      onClose: (v) => resolve(v === true),
      actions: [
        { label: 'Batal', class: 'btn-secondary', value: false },
        { label: okLabel, class: danger ? 'btn-danger' : '', value: true },
      ],
    });
  });
}

/** Butang sibuk: disabled + spinner (elak hantar dua kali, AFD 6). */
export async function busy(button, fn) {
  const label = [...button.childNodes];
  button.disabled = true;
  clear(button).append(el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Sedang proses...');
  try {
    return await fn();
  } finally {
    button.disabled = false;
    clear(button).append(...label);
  }
}

export function badge(text, kind = '') {
  return el('span', { class: 'badge' + (kind ? ' badge-' + kind : '') }, text);
}

export function emptyState(iconName, message, action) {
  return el('div', { class: 'empty' }, icon(iconName, 'icon'), el('p', null, message), action || null);
}

// ------------------------------------------------------------ header portal (DBD 6, AFD 5)
export function renderHeader(me, crumb = 'Dashboard') {
  const menu = el('div', { class: 'menu', hidden: true, id: 'vp-menu' },
    el('div', { class: 'who' },
      el('strong', null, me.staff.nama),
      el('span', { class: 'caption' }, me.staff.department + ' · ' + me.staff.staff_id),
      el('br'),
      el('span', { class: 'caption' }, 'Log masuk sebagai ' + me.staff.email)),
    el('a', { href: '/' }, icon('layout-grid'), 'Dashboard'),
    el('button', { type: 'button', onclick: () => { setOpen(false); photoModal(me, (v) => { me.staff.gambar_v = v; avatarSlot.replaceChildren(avatarNode(me)); }); } }, icon('camera'), 'Gambar profil'),
    el('a', { href: '/install/' }, icon('smartphone'), 'Install app'),
    el('a', { href: '/about/' }, icon('info'), 'More Info'),
    el('button', { type: 'button', onclick: () => logout() }, icon('log-out'), 'Log keluar'));
  const avatarSlot = el('span', { class: 'avatar-slot' }, avatarNode(me));
  const toggle = el('button', { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'vp-menu' },
    avatarSlot,
    el('span', { class: 'hi' }, 'Hi, ' + String(me.staff.nama).split(' ')[0]),
    icon('chevron-down'));
  const setOpen = (open) => { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  const header = el('header', { class: 'vp-header' },
    el('div', { class: 'bar' },
      el('a', { class: 'vp-brand', href: '/', 'aria-label': 'Voltake - Dashboard' },
        el('img', { src: '/icons/logo-mark.png', alt: '', width: '38', height: '38' }), 'Voltake'),
      el('span', { class: 'vp-crumb' }, '/ ' + crumb),
      el('div', { class: 'vp-nav-slot' }),
      el('div', { class: 'vp-profile' }, toggle, menu)));
  document.body.prepend(header);
  renderFooter();
  return header;
}

/** Kaki halaman seluruh PWA (permintaan pemilik 21/11/2026). */
export function renderFooter() {
  if (document.querySelector('.vp-footer')) return;
  document.body.append(el('footer', { class: 'vp-footer' }, '\u00A9 Copyright by Voltake Core'));
}

/** Avatar: gambar profil jika ada (cache ikut versi), jika tidak huruf awal nama. */
export function avatarNode(me) {
  const fallback = () => el('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(me.staff.nama));
  if (!me.staff.gambar_v) return fallback();
  const img = el('img', { class: 'avatar', src: '/auth/photo?v=' + encodeURIComponent(me.staff.gambar_v), alt: '' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

/** Potong segi empat di tengah & kecilkan ke 256px JPEG. Pulang base64 (tanpa awalan). */
async function squarePhoto(file) {
  if (!/^image\//.test(file.type)) throw new Error('Pilih fail gambar (JPG, PNG, HEIC atau WEBP)');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Gambar tidak dapat dibaca')); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return { data: c.toDataURL('image/jpeg', 0.86).split(',')[1], preview: c.toDataURL('image/jpeg', 0.86) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function postPhoto(body) {
  const res = await fetch('/auth/photo', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-VP': '1' }, body: JSON.stringify(body) });
  let d = {};
  try { d = await res.json(); } catch { /* bukan JSON */ }
  if (!res.ok) throw new Error(d.error || 'Gagal menyimpan gambar (' + res.status + ')');
  return d;
}

/** Modal gambar profil: pilih, pratonton bulat, simpan / buang. done(gambar_v) dipanggil selepas berjaya. */
export function photoModal(me, done) {
  let picked = null;
  const preview = el('div', { class: 'photo-preview' }, avatarNode(me));
  const input = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', 'aria-label': 'Pilih gambar profil' });
  const err = el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    try {
      picked = await squarePhoto(f);
      preview.replaceChildren(el('img', { class: 'avatar', src: picked.preview, alt: 'Pratonton' }));
      err.hidden = true;
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  });
  const actions = [
    { label: 'Batal', class: 'btn-secondary' },
    { label: 'Simpan gambar', onClick: ({ close, button }) => busy(button, async () => {
      if (!picked) { err.textContent = 'Pilih gambar dahulu.'; err.hidden = false; return; }
      try { const r = await postPhoto({ data: picked.data }); close(); done(r.gambar_v); toast('Gambar profil dikemas kini.', 'success'); } catch (e) { err.textContent = e.message; err.hidden = false; }
    }) },
  ];
  if (me.staff.gambar_v) actions.splice(1, 0, { label: 'Buang gambar', class: 'btn-ghost', onClick: ({ close, button }) => busy(button, async () => {
    try { await postPhoto({ padam: true }); close(); done(''); toast('Gambar profil dibuang.', 'success'); } catch (e) { err.textContent = e.message; err.hidden = false; }
  }) });
  openModal({
    title: 'Gambar profil',
    body: el('div', { class: 'stack' }, err,
      el('div', { class: 'row', style: 'gap:16px' }, preview,
        el('div', { class: 'stack', style: 'flex:1;min-width:180px' },
          el('p', { class: 'caption', style: 'margin:0' }, 'Gambar dipotong segi empat dan dikecilkan secara automatik. Hanya anda dan Admin sistem yang mengurus gambar ini.'),
          el('div', null, el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => input.click() }, icon('camera'), 'Pilih gambar'), input)))),
    actions,
  });
}

/**
 * Navigasi dalam modul: pil di tengah kepala (desktop), bar terapung di bawah (telefon). Maks 5 item.
 * items: [{ href: '#/senarai', label: 'Simpanan', ikon: 'scroll-text', match: (hash) => bool }]
 */
export function renderModuleNav(host, items) {
  document.body.classList.add('has-bottom-nav');
  const nav = el('nav', { class: 'module-nav', 'aria-label': 'Menu modul' });
  const draw = () => {
    const h = location.hash || '#/';
    clear(nav);
    for (const it of items) {
      const active = it.match ? it.match(h) : h === it.href;
      nav.appendChild(el('a', { href: it.href, 'aria-current': active ? 'page' : null }, icon(it.ikon), el('span', null, it.label)));
    }
  };
  window.addEventListener('hashchange', draw);
  draw();
  const slot = document.querySelector('.vp-header .vp-nav-slot');
  if (slot) { slot.append(nav); slot.closest('.vp-header').classList.add('has-nav'); } else host.prepend(nav);
  return nav;
}

/** Daftar service worker (F-04). Gagal secara senyap jika tak disokong. */
export function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
