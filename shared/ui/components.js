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
    el('a', { href: '/install/' }, icon('smartphone'), 'Install app'),
    el('a', { href: '/about/' }, icon('info'), 'More Info'),
    el('button', { type: 'button', onclick: () => logout() }, icon('log-out'), 'Log keluar'));
  const toggle = el('button', { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'vp-menu' },
    el('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(me.staff.nama)),
    el('span', { class: 'hi' }, 'Hi, ' + String(me.staff.nama).split(' ')[0]),
    icon('chevron-down'));
  const setOpen = (open) => { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  const header = el('header', { class: 'vp-header' },
    el('div', { class: 'container bar' },
      el('a', { class: 'vp-brand', href: '/', 'aria-label': 'Voltake - Dashboard' }, 'VOLTAKE', el('span', { class: 'sub' }, 'ENERGY')),
      el('span', { class: 'vp-crumb' }, '/ ' + crumb),
      el('div', { class: 'vp-profile' }, toggle, menu)));
  document.body.prepend(header);
  return header;
}

/** Daftar service worker (F-04). Gagal secara senyap jika tak disokong. */
export function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
