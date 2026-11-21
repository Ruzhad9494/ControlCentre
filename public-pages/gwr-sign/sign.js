// /public/gwr-sign - klien semak & tandatangan Ground Work Report (F-32; AFD S-34; IPD 2F.3).
// Sistem lama (GWR v4.2 Approval.html): klien buka ?token=..., lihat PDF draf, isi nama / jawatan / telefon / emel,
// tandatangan dan tekan Approve; PDF final dijana di pelayar klien. Kini: token sekali guna + luput, Turnstile,
// PDF final dijana di SERVER dan dihantar ke emel klien, staf dan pengurus.
import { el, clear, append } from '/shared/lib/escape.js';
import { icon, toast, busy, badge } from '/shared/ui/components.js';
import { signaturePad } from '/shared/lib/signature.js';

const main = document.getElementById('main');
const token = new URLSearchParams(location.search).get('t') || '';

async function post(action, body) {
  const res = await fetch('/public/api/gwr/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VP': '1' }, body: JSON.stringify({ token, ...(body || {}) }) });
  let data = {};
  try { data = await res.json(); } catch { /* bukan JSON */ }
  if (!res.ok) { const e = new Error(data.error || 'Ralat ' + res.status); e.status = res.status; throw e; }
  return data.data;
}
const dmy = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : v || '-'; };
function field(label, input, { required, hint } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' }, el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input, hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (a) => el('input', { class: 'input', ...a });

// ------------------------------------------------------------------ Turnstile (sama seperti /public/mohon)
let tsToken = '';
let tsWidget = null;
async function mountTurnstile(host) {
  let key = '';
  try { key = (await (await fetch('/public/api/config')).json()).turnstile_site_key || ''; } catch { /* tiada */ }
  if (!key) return false;
  await new Promise((resolve, reject) => {
    const s = el('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
    s.onload = resolve; s.onerror = () => reject(new Error('Semakan anti-bot gagal dimuat'));
    document.head.append(s);
  }).catch((e) => toast(e.message, 'danger'));
  for (let i = 0; i < 50 && !window.turnstile; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.turnstile) return false;
  tsWidget = window.turnstile.render(host, { sitekey: key, callback: (t) => { tsToken = t; }, 'expired-callback': () => { tsToken = ''; }, 'error-callback': () => { tsToken = ''; } });
  return true;
}
const resetTurnstile = () => { tsToken = ''; if (window.turnstile && tsWidget !== null) window.turnstile.reset(tsWidget); };

function fail(msg) {
  main.removeAttribute('aria-busy');
  append(clear(main), el('div', { class: 'gs-wrap' }, el('div', { class: 'gs-sec gs-done' }, icon('circle-x'), el('h2', null, 'Pautan tidak dapat dibuka'), el('p', { style: 'margin:0' }, msg))));
}

async function openPdf(btn) {
  await busy(btn, async () => {
    try {
      const f = await post('getSignPdf');
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mime || 'application/pdf' }));
      const a = el('a', { href: url, download: f.nama || 'GWR_Draft.pdf', target: '_blank', rel: 'noopener' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast(e.message, 'danger'); }
  });
}

async function start() {
  if (!/^[0-9a-f]{64}$/i.test(token)) { fail('Pautan tidak lengkap. Buka semula pautan penuh yang dihantar oleh staf Voltake.'); return; }
  let r;
  try { r = await post('getSignRequest'); } catch (e) { fail(e.status === 0 || !e.status ? 'Tiada sambungan internet. Cuba lagi.' : e.message); return; }
  const kv = (k, v) => [el('dt', null, k), el('dd', null, v || '-')];
  const f = {
    nama: inp({ maxlength: 100, autocomplete: 'name', value: r.cadangan?.nama || '' }),
    jawatan: inp({ maxlength: 120, autocomplete: 'organization-title', value: r.cadangan?.jawatan || '' }),
    telefon: inp({ type: 'tel', maxlength: 20, autocomplete: 'tel', value: r.cadangan?.telefon || '' }),
    emel: inp({ type: 'email', maxlength: 120, autocomplete: 'email' }),
  };
  const setuju = el('input', { type: 'checkbox' });
  const sig = signaturePad({ label: 'Tandatangan klien' });
  const err = el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
  const ts = el('div');
  const send = el('button', { class: 'btn', type: 'submit' }, icon('check'), 'Sahkan & tandatangan');
  const form = el('form', { class: 'gs-sec', novalidate: true },
    el('h2', null, 'Pengesahan klien'),
    el('div', { class: 'gs-grid' }, field('Nama penuh', f.nama, { required: true }), field('Jawatan', f.jawatan, { required: true }), field('No. telefon', f.telefon, { required: true }), field('Emel', f.emel, { required: true, hint: 'Salinan PDF final dihantar ke emel ini.' })),
    el('div', { class: 'field' }, el('span', { class: 'label' }, 'Tandatangan', el('span', { class: 'req' }, ' *')), sig.canvas,
      el('div', null, el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => sig.clear() }, icon('x'), 'Padam tandatangan'))),
    el('label', { class: 'check' }, setuju, 'Saya mengesahkan kerja seperti dalam report ini telah dijalankan.'),
    ts, err, el('div', null, send));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const miss = [];
    if (f.nama.value.trim().length < 3) miss.push('nama');
    if (!f.jawatan.value.trim()) miss.push('jawatan');
    if (!f.telefon.value.trim()) miss.push('telefon');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.emel.value.trim())) miss.push('emel sah');
    if (!sig.has()) miss.push('tandatangan');
    if (!setuju.checked) miss.push('tanda pengesahan');
    if (miss.length) { clear(err).append('Lengkapkan: ' + miss.join(', ')); err.hidden = false; return; }
    await busy(send, async () => {
      try {
        const res = await post('clientApprove', { nama: f.nama.value, jawatan: f.jawatan.value, telefon: f.telefon.value, emel: f.emel.value, tandatangan: { data: sig.data() }, setuju: true, turnstile: tsToken });
        append(clear(main), el('div', { class: 'gs-wrap' }, el('div', { class: 'gs-sec gs-done' }, icon('circle-check'),
          el('h2', null, 'Terima kasih. Report telah disahkan.'),
          el('p', { style: 'margin:0' }, `${res.report_id} · ${r.po_number || ''}`),
          el('p', { class: 'caption', style: 'margin:0' }, res.emel_klien ? 'Salinan PDF final telah dihantar ke emel anda.' : 'PDF final akan dihantar oleh staf Voltake.'),
          el('p', { class: 'caption', style: 'margin:0' }, 'Pautan ini kini tidak boleh digunakan lagi. Anda boleh tutup halaman ini.'))));
      } catch (er) {
        resetTurnstile();
        clear(err).append(er.message); err.hidden = false;
      }
    });
  });

  main.removeAttribute('aria-busy');
  append(clear(main), el('div', { class: 'gs-wrap' },
    el('div', { class: 'row-between' }, el('h1', { style: 'margin:0;font-size:22px' }, 'Ground Work Report'), el('div', { class: 'chips' }, badge(r.dept, 'info'), badge('Menunggu pengesahan', 'warning'))),
    el('p', { class: 'caption', style: 'margin:0' }, `Sila semak dan sahkan kerja ini. Pautan sah sehingga ${dmy(r.luput)}.`),
    el('section', { class: 'gs-sec' },
      el('dl', { class: 'kv' }, ...kv('Tarikh', dmy(r.tarikh)), ...kv('No. PO', r.po_number), ...kv('Quotation / MOS', [r.quotation_number, r.mos_number].filter(Boolean).join(' / ')),
        ...kv('Klien', r.client_company), ...kv('Projek', r.project_title), ...kv('Lokasi', r.location), ...kv('Time in / out', `${dmy(r.time_in)} → ${dmy(r.time_out)}`),
        ...kv('PTW', r.ptw || 'NO'), ...kv('Disediakan oleh', r.staff_name ? `${r.staff_name} (${r.staff_position || '-'})` : '')),
      el('h2', null, 'Job description'),
      r.job_items.length ? el('ol', { class: 'gs-jobs' }, r.job_items.map((j) => el('li', null, j.shutdown ? el('span', { class: 'gs-sd' }, `[SHUTDOWN${j.voltage ? ' ' + j.voltage : ''}] `) : null, j.desc, j.remark ? el('div', { class: 'caption' }, 'Remark: ' + j.remark) : null))) : el('p', { style: 'margin:0' }, '-'),
      el('h2', null, 'Unresolved issue & action'), el('p', { style: 'margin:0;white-space:pre-wrap' }, r.unresolved_issue || '-'),
      el('h2', null, 'Manpower'), el('p', { style: 'margin:0;white-space:pre-wrap' }, r.manpower || '-'),
      el('div', null, el('button', { class: 'btn btn-secondary', type: 'button', onclick: (e) => openPdf(e.currentTarget) }, icon('download'), `Lihat PDF penuh${r.bil_gambar ? ` (${r.bil_gambar} gambar)` : ''}`))),
    form));
  mountTurnstile(ts);
}

start();
