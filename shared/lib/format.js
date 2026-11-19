// shared/lib/format.js - format Malaysia: RM, DD/MM/YYYY, masa 24 jam (DBD 4).

const TZ = 'Asia/Kuala_Lumpur';

export function formatRM(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  const s = Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' : '') + 'RM ' + s;
}

function parts(d) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const o = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o;
}

function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v);
  // YYYY-MM-DD sahaja: tarikh kalendar, bukan masa (elak anjakan zon)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00+08:00');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 2026-11-19 / Date -> 19/11/2026 */
export function formatDate(v) {
  const d = toDate(v);
  if (!d) return '-';
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year}`;
}

/** ISO datetime -> 19/11/2026 14:30 (waktu Malaysia) */
export function formatDateTime(v) {
  const d = toDate(v);
  if (!d) return '-';
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Tarikh hari ini YYYY-MM-DD (waktu Malaysia) untuk input type=date. */
export function todayIso() {
  const p = parts(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}
