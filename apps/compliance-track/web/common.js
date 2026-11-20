// common.js - bantuan kongsi Compliance Track (app.js, senarai.js).
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatDate } from '/shared/lib/format.js';
import { icon, toast, openModal, badge } from '/shared/ui/components.js';
import { prepareFile } from '/shared/lib/fileprep.js';

export const MODULE = 'compliance';
export const call = (action, payload) => api(MODULE, action, payload || {}, { onSlow: () => toast('Masih memproses...', 'info', 2500) });

export function field(label, input, { hint, required, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') },
    el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input,
    hint ? el('span', { class: 'hint' }, hint) : null);
}
export const inp = (attrs) => el('input', { class: 'input', autocomplete: 'off', ...attrs });
export function sel(options, value = '') {
  const s = el('select', { class: 'input' }, options.map(([v, t]) => el('option', { value: v }, t)));
  if (options.some(([v]) => v === value)) s.value = value;
  return s;
}
export const errBox = () => el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
export const showErr = (box, e) => { clear(box).append(e.message || String(e)); box.hidden = false; box.scrollIntoView({ block: 'nearest' }); };

// Status ikut sistem lama (evaluateExpiryStatus). Ambang amaran boleh ditukar 30/60/90 di skrin (macam dashboard lama).
export const STATUS_KIND = { expired: 'danger', expiring: 'warning', active: 'success', unknown: '' };
export function statusAt(hari, ambang) {
  if (hari === null || hari === undefined) return 'unknown';
  return hari < 0 ? 'expired' : hari <= ambang ? 'expiring' : 'active';
}
export function statusLabel(hari, ambang) {
  const s = statusAt(hari, ambang);
  if (s === 'unknown') return 'Tiada tarikh';
  if (s === 'expired') return `Tamat (${Math.abs(hari)} hari lepas)`;
  if (s === 'expiring') return hari === 0 ? 'Tamat hari ini' : `Hampir tamat (${hari} hari lagi)`;
  return `Sah (${hari} hari lagi)`;
}
export const statusBadge = (hari, ambang) => badge(statusLabel(hari, ambang), STATUS_KIND[statusAt(hari, ambang)]);
export const dateBadge = (expiry, hari, ambang) => badge(expiry ? formatDate(expiry) : 'Tiada', STATUS_KIND[statusAt(hari, ambang)]);

/** Pulang { mime, nama, data } dari getFile. */
export const fetchFile = (payload) => call('getFile', payload);

export function toBlobUrl(f) {
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: f.mime }));
}

export async function viewFile(payload, title) {
  try {
    const f = await fetchFile(payload);
    const url = toBlobUrl(f);
    const isImg = /^image\/(jpeg|png|webp)$/.test(f.mime);
    const download = () => { const a = el('a', { href: url, download: f.nama }); document.body.append(a); a.click(); a.remove(); };
    openModal({
      title,
      wide: true,
      body: isImg ? el('img', { src: url, alt: title, class: 'share-img' })
        : el('p', null, f.mime === 'application/pdf' ? 'Fail PDF. Tekan Muat turun untuk buka.' : 'Format ini tak boleh dipapar dalam pelayar. Tekan Muat turun.'),
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
      actions: [{ label: 'Tutup', class: 'btn-secondary' }, { label: 'Muat turun', onClick: () => download() }],
    });
  } catch (e) {
    if (e.status !== 401) toast(e.message, 'danger');
  }
}

/** Satu fail pilihan. Pulang { node, get() }. */
export function filePicker({ label, hint, accept = 'image/*,application/pdf', pdf = true, capture }) {
  let prepared = null;
  const input = el('input', { type: 'file', accept, class: 'sr-only', 'aria-label': label, ...(capture ? { capture } : {}) });
  const status = el('div', { class: 'caption' });
  const preview = el('div');
  const box = el('div', { class: 'file-pick' });
  const pick = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('camera'), 'Ambil gambar / pilih fail');
  const rm = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: true }, icon('x'), 'Buang');
  pick.addEventListener('click', () => input.click());
  const draw = () => {
    clear(status); clear(preview);
    box.classList.toggle('has', Boolean(prepared));
    rm.hidden = !prepared;
    if (prepared) {
      status.append(`${prepared.nama} (${(prepared.size / 1024).toFixed(0)} KB)`);
      if (/^image\/(jpeg|png|webp)$/.test(prepared.mime)) preview.append(el('img', { src: URL.createObjectURL(prepared.blob), alt: 'Preview ' + label }));
    } else status.append(hint || 'Belum ada fail.');
  };
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try { prepared = await prepareFile(f, { pdf }); } catch (e) { toast(e.message, 'danger'); input.value = ''; }
    draw();
  });
  rm.addEventListener('click', () => { prepared = null; input.value = ''; draw(); });
  append(box, el('div', { class: 'stack' }, el('div', { class: 'row', style: 'justify-content:center' }, pick, rm), status, preview), input);
  draw();
  return { node: box, get: () => prepared };
}
export const upload = (p) => { const x = p.get(); return x ? { data: x.data } : undefined; };

export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function downloadCsv(name, head, rows) {
  const blob = new Blob(['﻿' + [head, ...rows].map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
