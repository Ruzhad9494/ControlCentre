// shared/lib/signature.js - pad tandatangan (lukis dengan jari / tetikus). Dikongsi GWR (staf & klien).
// Sistem lama (GWR v4.2 index.html & Approval.html): canvas lukis terus. Output PNG base64.
import { el } from './escape.js';

export function signaturePad({ height = 170, label = 'Ruang tandatangan' } = {}) {
  const c = el('canvas', { class: 'sig-pad', 'aria-label': label, style: `width:100%;height:${height}px;touch-action:none;display:block;background:#fff;border:1px solid var(--border);border-radius:8px` });
  let drawing = false, drawn = false, last = null;
  const g = () => c.getContext('2d');
  const fit = () => {
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const keep = drawn ? c.toDataURL() : null;
    c.width = Math.round(r.width * devicePixelRatio);
    c.height = Math.round(height * devicePixelRatio);
    const x = g();
    x.scale(devicePixelRatio, devicePixelRatio);
    x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#0B2545';
    if (keep) { const img = new Image(); img.onload = () => g().drawImage(img, 0, 0, r.width, height); img.src = keep; }
  };
  const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  c.addEventListener('pointerdown', (e) => { if (c.width !== Math.round(c.getBoundingClientRect().width * devicePixelRatio)) fit(); drawing = true; last = pos(e); c.setPointerCapture?.(e.pointerId); e.preventDefault(); });
  c.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    const x = g(); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke();
    last = p; drawn = true;
  });
  ['pointerup', 'pointercancel'].forEach((t) => c.addEventListener(t, () => { drawing = false; }));
  window.addEventListener('resize', fit);
  requestAnimationFrame(fit);
  return {
    canvas: c,
    has: () => drawn,
    clear: () => { g().clearRect(0, 0, c.width, c.height); drawn = false; },
    data: () => c.toDataURL('image/png').split(',')[1],
  };
}
