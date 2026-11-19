// image.js - lukis ringkasan kos (gaya jadual sistem lama) terus ke <canvas> (IPD 2A.1, F-20).
// Tiada html2canvas / CDN (CSP). Mod 'standard' 700px dan 'landscape' 1040px, sama macam versi lama.

const C = {
  orange: '#f6ad55', yellow: '#fef08a', blue: '#93c5fd', black: '#000000', ink: '#111827',
  dark: '#111827', grey: '#6b7280', light: '#d1d5db', faint: '#9ca3af', panel: '#f9fafb',
  greenBg: '#dcfce7', green: '#15803d', redBg: '#fee2e2', red: '#b91c1c', white: '#ffffff',
};
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const ROW_H = 34;
const PAD = 32;
const BORDER = 2;

const rm = (n) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-MY');

function dmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '-';
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(m[2]) - 1];
  return `${m[3]}-${mon}-${m[1]}`;
}

function dateRange(input) {
  if (input.tarikh_mula && input.tarikh_tamat) return `${dmy(input.tarikh_mula)} TO ${dmy(input.tarikh_tamat)}`;
  if (input.tarikh_mula) return dmy(input.tarikh_mula);
  return '-';
}

const textOr = (s) => (String(s || '').trim() ? String(s).trim() : '-');

function fit(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/**
 * Jadual: cols = [lebar...], rows = [[{t, fill, color, align, span, bold, size}...]]
 * Pulang tinggi yang dilukis.
 */
function table(ctx, x, y, cols, rows) {
  let cy = y;
  for (const row of rows) {
    let cx = x;
    let ci = 0;
    for (const cell of row) {
      const span = cell.span || 1;
      const w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0);
      ctx.fillStyle = cell.fill || C.white;
      ctx.fillRect(cx, cy, w, ROW_H);
      ctx.lineWidth = BORDER;
      ctx.strokeStyle = C.black;
      ctx.strokeRect(cx, cy, w, ROW_H);
      ctx.fillStyle = cell.color || C.ink;
      ctx.font = `${cell.weight || 700} ${cell.size || 13.6}px ${FONT}`;
      ctx.textBaseline = 'middle';
      const label = fit(ctx, String(cell.t ?? '').toUpperCase(), w - 24);
      const align = cell.align || 'left';
      ctx.textAlign = align;
      const tx = align === 'right' ? cx + w - 12 : align === 'center' ? cx + w / 2 : cx + 12;
      ctx.fillText(label, tx, cy + ROW_H / 2 + 1);
      cx += w;
      ci += span;
    }
    cy += ROW_H;
  }
  return cy - y;
}

function mobRows(d) {
  const i = d.input;
  const h = d.hasil;
  const Y = C.yellow;
  return [
    [{ t: 'MOBILISATION COSTING', span: 3, fill: C.orange, align: 'center', size: 14 }],
    [{ t: 'CLIENT' }, { t: ': ' + textOr(i.klien), span: 2, fill: Y }],
    [{ t: 'JOB' }, { t: ': ' + textOr(i.nama_projek), span: 2, fill: Y }],
    [{ t: 'DATE' }, { t: ': ' + dateRange(i), span: 2, fill: Y }],
    [{ t: 'PERIOD' }, { t: `${h.hari} D ${h.malam} N`, span: 2, fill: Y }],
    [{ t: 'STAFF' }, { t: num(i.staff), fill: Y, align: 'right' }, { t: 'PAX' }],
    [{ t: 'TRANSPORTATION' }, { t: num(i.transport_unit), fill: Y, align: 'right' }, { t: 'UNIT' }],
    [{ t: 'OVERTIME' }, { t: num(i.ot_jam), fill: Y, align: 'right' }, { t: 'HOURS /PAX' }],
    [{ t: 'HOMESTAY' }, { t: num(i.homestay_unit), fill: Y, align: 'right' }, { t: 'UNIT' }],
    [{ t: 'MAKAN' }, { t: num(h.hari), fill: Y, align: 'right' }, { t: 'DAYS' }],
    [{ t: 'OVERNIGHT' }, { t: num(h.malam), fill: Y, align: 'right' }, { t: 'NIGHT' }],
    [{ t: 'MILEAGE' }, { t: num(i.mileage_km), fill: Y, align: 'right' }, { t: 'KM' }],
    [{ t: 'LOCATION' }, { t: ': ' + textOr(i.lokasi), span: 2, fill: Y }],
    [{ t: 'TOTAL AMOUNT', fill: C.orange, weight: 800 }, { t: num(h.jumlah_mobilisasi), fill: C.orange, align: 'right', weight: 800 }, { t: 'RM', fill: C.orange, weight: 800 }],
  ];
}

function detailRows(d) {
  const r = d.rates || {};
  return [
    [{ t: 'COSTING DETAIL', span: 2, fill: C.yellow, align: 'center' }],
    [{ t: 'DESCRIPTION', fill: C.blue, align: 'center' }, { t: 'COST RM', fill: C.blue, align: 'center' }],
    [{ t: 'OVERTIME' }, { t: rm(r.ot_per_hour), align: 'right' }],
    [{ t: 'TRANSPORT' }, { t: rm(r.transport_per_km), align: 'right' }],
    [{ t: 'MAKAN' }, { t: rm(r.makan_per_day_pax), align: 'right' }],
    [{ t: 'HOMESTAY' }, { t: rm(r.homestay_per_night), align: 'right' }],
    [{ t: 'OVERNIGHT' }, { t: rm(r.overnight_per_pax), align: 'right' }],
  ];
}

function summaryRows(d) {
  const h = d.hasil;
  const tone = (v) => (v > 0 ? { fill: C.greenBg, color: C.green } : v < 0 ? { fill: C.redBg, color: C.red } : {});
  const small = { color: C.grey, size: 12 };
  const subs = (d.input.subkon && d.input.subkon.length ? d.input.subkon : [0]).map((v, idx) => [
    { t: `SUBCONT ${idx + 1}`, ...small }, { t: 'RM ' + rm(v), align: 'right' },
  ]);
  return [
    [{ t: 'PROJECT SUMMARY', span: 2, fill: C.dark, color: C.white, align: 'center' }],
    [{ t: 'PO AMOUNT', ...small }, { t: 'RM ' + rm(d.input.nilai_po_rm), align: 'right' }],
    ...subs,
    [{ t: 'MOBILISATION', ...small }, { t: 'RM ' + rm(h.jumlah_mobilisasi), align: 'right' }],
    [{ t: 'TOTAL COST', weight: 800 }, { t: 'RM ' + rm(h.jumlah_kos), align: 'right', weight: 800, ...tone(h.jumlah_kos) }],
    [{ t: 'AMOUNT MARGIN', weight: 800 }, { t: 'RM ' + rm(h.margin), align: 'right', weight: 800, ...tone(h.margin) }],
    [{ t: 'MARGIN %', weight: 800 }, { t: `${h.margin_peratus.toFixed(2)} %`, align: 'right', weight: 800, ...tone(h.margin) }],
  ];
}

const SST_BOX_H = 66;
function sstBox(ctx, x, y, w, d) {
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, SST_BOX_H);
  ctx.lineWidth = BORDER;
  ctx.strokeStyle = C.black;
  ctx.strokeRect(x, y, w, SST_BOX_H);
  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'left';
  ctx.fillText(`SST (${num(d.input.sst_peratus)}%):`, x + 12, y + 18);
  ctx.textAlign = 'right';
  ctx.fillText('RM ' + rm(d.hasil.sst), x + w - 12, y + 18);
  ctx.strokeStyle = C.faint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 33);
  ctx.lineTo(x + w - 12, y + 33);
  ctx.stroke();
  ctx.font = `800 13px ${FONT}`;
  ctx.fillStyle = C.black;
  ctx.textAlign = 'left';
  ctx.fillText('FINAL PO (INCL. SST):', x + 12, y + 49);
  ctx.textAlign = 'right';
  ctx.fillText('RM ' + rm(d.hasil.po_akhir), x + w - 12, y + 49);
  return SST_BOX_H;
}

/**
 * Lukis ringkasan ke canvas. data = { input, hasil, rates, estimate_id? }.
 * scale = ketumpatan piksel (2.5 untuk gambar HD macam versi lama).
 */
export function drawSummary(canvas, data, { mode = 'standard', scale = 2 } = {}) {
  const W = mode === 'landscape' ? 1040 : 700;
  const inner = W - PAD * 2;
  const nSub = Math.max(1, (data.input.subkon || []).length);
  const mobH = 14 * ROW_H;
  const detH = 7 * ROW_H;
  const sumH = (6 + nSub) * ROW_H + 16 + SST_BOX_H;
  const headH = 52;
  const footH = 56;
  const gap = mode === 'landscape' ? 24 : 28;
  const bodyH = mode === 'landscape' ? Math.max(mobH, detH, sumH) : mobH + gap + Math.max(detH, sumH);
  const H = PAD + headH + bodyH + footH + PAD;

  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, H);

  // Kepala: lencana "ESTIMATION COST" + VOLTAKE
  ctx.font = `800 12px ${FONT}`;
  const badge = 'ESTIMATION COST';
  const bw = ctx.measureText(badge).width + 28;
  ctx.fillStyle = C.dark;
  ctx.fillRect(PAD, PAD + 8, bw, 28);
  ctx.fillStyle = C.white;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(badge, PAD + 14, PAD + 23);
  ctx.font = `900 24px ${FONT}`;
  ctx.fillStyle = C.light;
  ctx.textAlign = 'right';
  ctx.fillText('VOLTAKE', W - PAD, PAD + 22);
  if (data.estimate_id) {
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = C.grey;
    ctx.fillText(data.estimate_id, W - PAD, PAD + 42);
  }
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(PAD, PAD + headH - 4, inner, 2);

  const top = PAD + headH + 20;
  if (mode === 'landscape') {
    const half = (inner - gap) / 2;
    table(ctx, PAD, top, [half * 0.34, half * 0.24, half * 0.42], mobRows(data));
    const rx = PAD + half + gap;
    const colW = (half - 16) / 2;
    table(ctx, rx, top, [colW * 0.55, colW * 0.45], detailRows(data));
    const h3 = table(ctx, rx + colW + 16, top, [colW * 0.5, colW * 0.5], summaryRows(data));
    sstBox(ctx, rx + colW + 16, top + h3 + 16, colW, data);
  } else {
    table(ctx, PAD, top, [inner * 0.34, inner * 0.24, inner * 0.42], mobRows(data));
    const y2 = top + mobH + gap;
    const colW = (inner - 24) / 2;
    table(ctx, PAD, y2, [colW * 0.55, colW * 0.45], detailRows(data));
    const h3 = table(ctx, PAD + colW + 24, y2, [colW * 0.5, colW * 0.5], summaryRows(data));
    sstBox(ctx, PAD + colW + 24, y2 + h3 + 16, colW, data);
  }

  // Kaki
  const fy = H - PAD - 16;
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(PAD, fy - 24, inner, 1);
  ctx.font = `700 10px ${FONT}`;
  ctx.fillStyle = C.faint;
  ctx.textAlign = 'center';
  ctx.fillText('© COPYRIGHT BY VOLTAKE', W / 2, fy);
  return { width: W, height: H };
}

export function fileName(input) {
  const job = String(input.nama_projek || '').trim() || 'Preview_Projek';
  return `Project_Margin_${job.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
}
