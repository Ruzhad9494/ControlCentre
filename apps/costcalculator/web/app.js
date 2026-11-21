// Cost Calculator (F-20 hingga F-22; AFD S-20, S-21, S-22; IPD 2A).
// Kiraan preview di browser (calc.js); server kira semula bila simpan. Kadar dibaca dari server sahaja.
import { bootModule } from '/shared/lib/page.js';
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatRM, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderModuleNav } from '/shared/ui/components.js';
import { calcEstimate } from '/costcalculator/calc.js';
import { drawSummary, fileName } from '/costcalculator/image.js';

const MODULE = 'costcalc';
const main = document.getElementById('main');
let ctx; // { me, roles, superadmin }
let rates = null; // { lengkap, rates: [...] }
let view;

const isAdmin = () => ctx.superadmin || ctx.roles.includes('admin');
const canWrite = () => isAdmin() || ctx.roles.includes('user');
const ratesMap = () => Object.fromEntries((rates?.rates || []).map((r) => [r.rate_key, r.nilai_rm ?? 0]));

function field(label, input, { hint, required, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') },
    el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input,
    hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (attrs) => el('input', { class: 'input', autocomplete: 'off', ...attrs });
const numInp = (value, attrs = {}) => inp({ type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: value ?? '', ...attrs });
const moneyClass = (v) => (v > 0 ? 'money-pos' : v < 0 ? 'money-neg' : '');

async function loadRates(force = false) {
  if (!rates || force) rates = await api(MODULE, 'getRates');
  return rates;
}

// ------------------------------------------------------------------ router
async function route() {
  const h = location.hash || '#/';
  clear(view);
  window.scrollTo(0, 0);
  try {
    if (h.startsWith('#/senarai')) await renderList();
    else if (h.startsWith('#/kadar')) await renderRates();
    else if (h.startsWith('#/e/')) await renderCalculator(decodeURIComponent(h.slice(4)));
    else await renderCalculator(null);
  } catch (e) {
    if (e.status !== 401) append(clear(view), el('div', { class: 'alert alert-danger' }, e.message));
  }
}

// ------------------------------------------------------------------ S-20 Kalkulator
const BLANK = {
  nama_projek: '', klien: '', lokasi: '', project_id: '', tarikh_mula: '', tarikh_tamat: '',
  staff: 4, transport_unit: 2, ot_jam: 15, homestay_unit: 1, mileage_km: '', nilai_po_rm: '', sst_peratus: 8, subkon: [''],
};

async function renderCalculator(estimateId) {
  append(view, el('div', { class: 'skeleton', style: 'height:300px' }));
  const [rt, est] = await Promise.all([loadRates(true), estimateId ? api(MODULE, 'getEstimate', { estimate_id: estimateId }) : null]);
  clear(view);

  const start = est ? { ...est.input } : { ...BLANK, tarikh_mula: todayIso() };
  if (!est) {
    const d = new Date(start.tarikh_mula + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 2);
    start.tarikh_tamat = d.toISOString().slice(0, 10);
  }
  if (!start.subkon || !start.subkon.length) start.subkon = [''];
  const editable = canWrite() && (!est || est.boleh_ubah);
  // Estimate lama papar kadar snapshot asal (AFD: estimate lama kekal dengan rates_snapshot asal)
  const useRates = est && !editable ? est.rates : ratesMap();

  // ---- input
  const f = {
    nama_projek: inp({ value: start.nama_projek, maxlength: 120, placeholder: 'Contoh: DANAU TOK UBAN' }),
    klien: inp({ value: start.klien, maxlength: 120, placeholder: 'Contoh: SUNGROW' }),
    tarikh_mula: inp({ type: 'date', value: start.tarikh_mula }),
    tarikh_tamat: inp({ type: 'date', value: start.tarikh_tamat }),
    staff: numInp(start.staff),
    transport_unit: numInp(start.transport_unit),
    ot_jam: numInp(start.ot_jam),
    homestay_unit: numInp(start.homestay_unit),
    mileage_km: numInp(start.mileage_km, { placeholder: '0' }),
    lokasi: inp({ value: start.lokasi, maxlength: 120, placeholder: 'Contoh: Tanjung Malim' }),
    nilai_po_rm: numInp(start.nilai_po_rm, { placeholder: '0.00' }),
    sst_peratus: numInp(start.sst_peratus, { max: '100' }),
  };
  const subHost = el('div', { class: 'stack' });
  const subInputs = [];
  function addSub(v = '') {
    const input = numInp(v, { placeholder: '0.00' });
    const row = el('div', { class: 'subkon-row' });
    const fieldNode = field('', input);
    const del = el('button', { class: 'btn btn-secondary icon-btn', type: 'button', 'aria-label': 'Buang subcont', disabled: !editable }, icon('x'));
    del.addEventListener('click', () => {
      if (subInputs.length <= 1) { input.value = ''; update(); return; }
      subInputs.splice(subInputs.indexOf(input), 1);
      row.remove();
      relabel();
      update();
    });
    append(row, fieldNode, del);
    subInputs.push(input);
    subHost.append(row);
    input.addEventListener('input', update);
    relabel();
  }
  function relabel() {
    subInputs.forEach((i, idx) => { const l = i.parentElement.querySelector('label'); if (l) l.textContent = `Payment Subcont ${idx + 1} (RM)`; });
  }
  start.subkon.forEach((v) => addSub(v));
  const addSubBtn = el('button', { class: 'btn btn-secondary btn-block', type: 'button', disabled: !editable }, icon('plus'), 'Tambah subcont');
  addSubBtn.addEventListener('click', () => { if (subInputs.length < 20) { addSub(); subInputs.at(-1).focus(); update(); } else toast('Maksimum 20 subcont.', 'warning'); });

  Object.values(f).forEach((i) => { i.addEventListener('input', update); i.disabled = !editable; });
  subInputs.forEach((i) => { i.disabled = !editable; });

  const readInput = () => ({
    nama_projek: f.nama_projek.value.trim(), klien: f.klien.value.trim(), lokasi: f.lokasi.value.trim(), project_id: start.project_id || '',
    tarikh_mula: f.tarikh_mula.value, tarikh_tamat: f.tarikh_tamat.value,
    staff: f.staff.value, transport_unit: f.transport_unit.value, ot_jam: f.ot_jam.value, homestay_unit: f.homestay_unit.value,
    mileage_km: f.mileage_km.value, nilai_po_rm: f.nilai_po_rm.value, sst_peratus: f.sst_peratus.value,
    subkon: subInputs.map((i) => i.value).filter((v) => v !== ''),
  });

  // ---- kadar (baca sahaja, F-22)
  const rateCards = el('div', { class: 'cc-rates' }, (rt.rates || []).map((r) => {
    const v = est && !editable ? est.rates[r.rate_key] : r.nilai_rm;
    return el('div', { class: 'cc-rate' }, el('div', { class: 'caption' }, `${r.label} (${r.unit})`),
      el('div', { class: 'v' }, v === null || v === undefined ? 'Belum diisi' : formatRM(v)));
  }));
  const rateNote = !rt.lengkap && editable
    ? el('div', { class: 'alert alert-warning' }, icon('triangle-alert'), el('span', null, 'Kadar kos belum lengkap. Pengiraan tak boleh disimpan sehingga admin Cost Calculator isi semua kadar.', isAdmin() ? [' ', el('a', { href: '#/kadar' }, 'Isi kadar sekarang')] : null))
    : null;

  // ---- preview + KPI
  const canvas = el('canvas', { role: 'img', 'aria-label': 'Preview ringkasan kos dan margin' });
  const kpis = el('div', { class: 'cc-kpis' });
  let mode = 'standard';
  const segStd = el('button', { type: 'button', 'aria-pressed': 'true' }, 'Standard');
  const segLand = el('button', { type: 'button', 'aria-pressed': 'false' }, 'Landscape');
  const setMode = (m) => { mode = m; segStd.setAttribute('aria-pressed', String(m === 'standard')); segLand.setAttribute('aria-pressed', String(m === 'landscape')); update(); };
  segStd.addEventListener('click', () => setMode('standard'));
  segLand.addEventListener('click', () => setMode('landscape'));

  let current = null;
  // Gambar ringkasan guna font Inter (bukan font tema): muat dahulu supaya kanvas tidak lukis dengan font ganti
  if (document.fonts && document.fonts.load) {
    Promise.all(['400', '600', '700'].map((w) => document.fonts.load(`${w} 13px Inter`))).then(() => { if (current) update(); }).catch(() => {});
  }
  function update() {
    const input = readInput();
    const hasil = calcEstimate(input, useRates);
    current = { input, hasil, rates: useRates, estimate_id: est?.estimate_id };
    drawSummary(canvas, current, { mode, scale: Math.min(2, window.devicePixelRatio || 1) });
    const k = (label, v, cls = '') => el('div', { class: 'kpi ' + cls }, el('div', { class: 'label' }, label), el('div', { class: 'v' }, formatRM(v)));
    append(clear(kpis),
      k('Jumlah kos', hasil.jumlah_kos),
      k('Margin', hasil.margin, hasil.margin > 0 ? 'pos' : hasil.margin < 0 ? 'neg' : ''),
      el('div', { class: 'kpi ' + (hasil.margin > 0 ? 'pos' : hasil.margin < 0 ? 'neg' : '') },
        el('div', { class: 'label' }, 'Margin %'), el('div', { class: 'v' }, hasil.margin_peratus.toFixed(2) + '%')));
  }

  // ---- tindakan
  const err = el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
  async function save(status, btn) {
    err.hidden = true;
    const input = readInput();
    if (!input.nama_projek) { f.nama_projek.setAttribute('aria-invalid', 'true'); f.nama_projek.focus(); toast('Isi Job / nama projek dahulu.', 'warning'); return; }
    f.nama_projek.removeAttribute('aria-invalid');
    if (status === 'Muktamad' && !(await confirmDialog('Simpan sebagai Muktamad?', 'Selepas muktamad, estimate ini dikunci. Untuk ubah, guna Duplicate.', { okLabel: 'Muktamadkan' }))) return;
    await busy(btn, async () => {
      try {
        const saved = await api(MODULE, 'saveEstimate', { ...input, estimate_id: est?.estimate_id, status });
        toast(`${saved.estimate_id} disimpan (${saved.status}).`, 'success');
        location.hash = '#/e/' + encodeURIComponent(saved.estimate_id);
        if (est) route();
      } catch (e) {
        clear(err).append(e.message);
        err.hidden = false;
      }
    });
  }
  async function exportImage(btn) {
    await busy(btn, async () => {
      const out = document.createElement('canvas');
      drawSummary(out, current, { mode, scale: 2.5 });
      const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
      const name = fileName(current.input);
      const file = new File([blob], name, { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const share = async () => {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'Kos & Margin Projek' }); return; } catch { /* dibatalkan */ }
        }
        download();
      };
      const download = () => { const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); };
      openModal({
        title: 'Gambar ringkasan',
        body: el('div', { class: 'stack' },
          el('p', { class: 'caption' }, 'iPhone: tekan Share, atau tekan lama pada gambar dan pilih "Save to Photos".'),
          el('img', { src: url, alt: 'Ringkasan kos ' + (current.input.nama_projek || ''), class: 'share-img' })),
        onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
        actions: [
          { label: 'Muat turun', class: 'btn-secondary', onClick: () => download() },
          { label: 'Share', onClick: () => share() },
        ],
      });
    });
  }

  const saveDraf = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('check'), 'Simpan draf');
  const saveFinal = el('button', { class: 'btn', type: 'button' }, icon('circle-check'), 'Simpan muktamad');
  const imgBtn = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('download'), 'Gambar');
  saveDraf.addEventListener('click', () => save('Draf', saveDraf));
  saveFinal.addEventListener('click', () => save('Muktamad', saveFinal));
  imgBtn.addEventListener('click', () => exportImage(imgBtn));
  if (!rt.lengkap) { saveDraf.disabled = true; saveFinal.disabled = true; }

  const dupBtn = est && canWrite() ? el('button', { class: 'btn btn-secondary', type: 'button' }, icon('copy'), 'Duplicate') : null;
  dupBtn?.addEventListener('click', () => duplicate(est.estimate_id, dupBtn));

  // ---- susun
  const statusLine = est
    ? el('div', { class: 'row' }, el('strong', null, est.estimate_id), badge(est.status, est.status === 'Muktamad' ? 'success' : ''),
      el('span', { class: 'caption' }, `${est.dibuat_oleh || '-'} · ${est.department} · dikemas kini ${formatDateTime(est.dikemas_kini)}`))
    : el('div', { class: 'row' }, el('strong', null, 'Estimate baharu'));
  const changedRates = est && editable && Object.keys(est.rates || {}).some((k) => Number(est.rates[k]) !== Number(useRates[k]));
  const ratesChangedNote = changedRates
    ? el('div', { class: 'alert alert-warning' }, icon('triangle-alert'), el('span', null, 'Kadar kos telah berubah sejak estimate ini disimpan. Preview di bawah guna kadar semasa, dan simpan semula akan kira dengan kadar semasa. Jika mahu kekalkan angka asal, jangan simpan.'))
    : null;
  const lockNote = est && !editable
    ? el('div', { class: 'alert alert-info' }, icon('lock'), el('span', null, est.status === 'Muktamad'
      ? 'Estimate ini muktamad dan dikunci. Guna Duplicate untuk buat salinan yang boleh diubah.'
      : 'Anda boleh lihat estimate ini sahaja. Hanya pemilik atau admin boleh ubah.'))
    : null;

  append(view,
    el('div', { class: 'row-between' }, statusLine, est ? el('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, icon('plus'), 'Estimate baharu') : null),
    lockNote, rateNote, ratesChangedNote,
    el('div', { class: 'cc-layout', style: 'margin-top:16px' },
      el('div', { class: 'stack' },
        el('section', { class: 'card cc-section' }, el('h3', null, el('span', { class: 'step' }, '1'), 'Maklumat projek'),
          el('div', { class: 'cc-grid' },
            field('Client', f.klien, { cls: 'full' }),
            field('Job / nama projek', f.nama_projek, { cls: 'full', required: true }),
            field('Tarikh mula', f.tarikh_mula), field('Tarikh tamat', f.tarikh_tamat))),
        el('section', { class: 'card cc-section' }, el('h3', null, el('span', { class: 'step' }, '2'), 'Data mobilisasi'),
          el('div', { class: 'cc-grid' },
            field('Staff (pax)', f.staff), field('Transport (unit)', f.transport_unit),
            field('Overtime (jam/pax)', f.ot_jam), field('Homestay (unit)', f.homestay_unit),
            field('Mileage (KM)', f.mileage_km), field('Location', f.lokasi))),
        el('section', { class: 'card cc-section' }, el('h3', null, el('span', { class: 'step' }, '3'), 'Nilai PO & kos subkontraktor'),
          el('div', { class: 'stack' },
            el('div', { class: 'cc-grid' }, field('Nilai PO sebelum SST (RM)', f.nilai_po_rm), field('Kadar SST (%)', f.sst_peratus)),
            subHost, editable ? addSubBtn : null)),
        el('section', { class: 'card cc-section' }, el('h3', null, el('span', { class: 'step' }, '4'), 'Kadar kos tetap'),
          el('p', { class: 'caption' }, est && !editable ? 'Kadar semasa estimate ini dibuat.' : 'Ditetapkan oleh admin Cost Calculator. Tak boleh diubah di sini.'),
          rateCards)),
      el('div', { class: 'cc-preview stack' },
        kpis,
        el('div', { class: 'row-between' }, el('div', { class: 'seg', role: 'group', 'aria-label': 'Susun atur gambar' }, segStd, segLand),
          el('div', { class: 'cc-actions' }, imgBtn, dupBtn, editable ? saveDraf : null, editable ? saveFinal : null)),
        err,
        el('div', { class: 'cc-canvas-wrap' }, canvas))));
  update();
}

async function duplicate(id, btn) {
  await busy(btn, async () => {
    try {
      const copy = await api(MODULE, 'duplicateEstimate', { estimate_id: id });
      toast(`Salinan ${copy.estimate_id} dicipta.`, 'success');
      location.hash = '#/e/' + encodeURIComponent(copy.estimate_id);
    } catch (e) {
      toast(e.message, 'danger');
    }
  });
}

// ------------------------------------------------------------------ S-21 Simpanan
async function renderList() {
  const cari = inp({ type: 'search', placeholder: 'Cari ID, projek, client, lokasi', 'aria-label': 'Cari estimate' });
  const status = el('select', { class: 'input', 'aria-label': 'Status' }, el('option', { value: '' }, 'Semua status'), el('option', { value: 'Draf' }, 'Draf'), el('option', { value: 'Muktamad' }, 'Muktamad'));
  const saya = el('input', { type: 'checkbox' });
  const host = el('div', null, el('div', { class: 'skeleton', style: 'height:200px' }));
  let timer;
  const load = async () => {
    try {
      const rows = await api(MODULE, 'listEstimates', { cari: cari.value, status: status.value, saya: saya.checked });
      clear(host);
      if (!rows.length) {
        host.append(emptyState('calculator', 'Belum ada estimate.', canWrite() ? el('a', { class: 'btn', href: '#/' }, icon('plus'), 'Buat estimate pertama') : null));
        return;
      }
      host.append(el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['ID', 'Projek', 'Status', 'Nilai PO', 'Jumlah kos', 'Margin', 'Oleh', 'Dikemas kini', ''].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', null, rows.map((r) => el('tr', null,
          el('td', { 'data-label': 'ID' }, el('a', { href: '#/e/' + encodeURIComponent(r.estimate_id) }, r.estimate_id)),
          el('td', { 'data-label': 'Projek' }, el('div', null, el('strong', null, r.nama_projek), el('br'), el('span', { class: 'caption' }, [r.klien, r.lokasi].filter(Boolean).join(' · ') || '-'))),
          el('td', { 'data-label': 'Status' }, badge(r.status, r.status === 'Muktamad' ? 'success' : '')),
          el('td', { 'data-label': 'Nilai PO', class: 'num' }, formatRM(r.nilai_po_rm)),
          el('td', { 'data-label': 'Jumlah kos', class: 'num' }, formatRM(r.jumlah_kos_rm)),
          el('td', { 'data-label': 'Margin' }, el('span', { class: moneyClass(r.margin_rm) }, `${formatRM(r.margin_rm)} (${Number(r.margin_peratus).toFixed(1)}%)`)),
          el('td', { 'data-label': 'Oleh' }, r.milik_saya ? 'Saya' : (r.dibuat_oleh || '-')),
          el('td', { 'data-label': 'Dikemas kini' }, formatDateTime(r.dikemas_kini)),
          el('td', { class: 'actions' }, el('div', { class: 'row', style: 'justify-content:flex-end' },
            el('a', { class: 'btn btn-secondary btn-sm', href: '#/e/' + encodeURIComponent(r.estimate_id) }, 'Buka'),
            canWrite() ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: (e) => duplicate(r.estimate_id, e.currentTarget) }, icon('copy'), 'Duplicate') : null,
            isAdmin() ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Padam ' + r.estimate_id, onclick: () => remove(r) }, icon('x')) : null))))))));
    } catch (e) {
      if (e.status !== 401) append(clear(host), el('div', { class: 'alert alert-danger' }, e.message));
    }
  };
  async function remove(r) {
    const why = el('textarea', { class: 'input', rows: 2, placeholder: 'Sebab padam (wajib)' });
    openModal({
      title: 'Padam ' + r.estimate_id,
      body: el('div', { class: 'stack' }, el('p', null, `Estimate "${r.nama_projek}" akan dipadam (disimpan dalam rekod audit).`), field('Sebab', why, { required: true })),
      actions: [
        { label: 'Batal', class: 'btn-secondary' },
        { label: 'Padam', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
          try { await api(MODULE, 'deleteEstimate', { estimate_id: r.estimate_id, sebab: why.value }); close(); toast('Dipadam.', 'success'); load(); } catch (e) { toast(e.message, 'danger'); }
        }) },
      ],
    });
  }
  cari.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  status.addEventListener('change', load);
  saya.addEventListener('change', load);
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Simpanan estimate'), canWrite() ? el('a', { class: 'btn', href: '#/' }, icon('plus'), 'Estimate baharu') : null),
    el('div', { class: 'row', style: 'margin:16px 0' }, el('div', { class: 'grow', style: 'min-width:200px' }, cari), el('div', { style: 'min-width:150px' }, status),
      el('label', { class: 'check' }, saya, 'Saya sahaja')),
    el('p', { class: 'caption' }, isAdmin() || ctx.me.portal_roles.includes('viewer') ? 'Papar semua estimate.' : `Papar estimate department ${ctx.me.staff.department}.`),
    host);
  await load();
}

// ------------------------------------------------------------------ S-22 Kadar (admin)
async function renderRates() {
  if (!isAdmin()) { append(view, el('div', { class: 'alert alert-danger' }, 'Hanya admin Cost Calculator boleh ubah kadar.')); return; }
  const rt = await loadRates(true);
  const rows = rt.rates.map((r) => ({ r, v: numInp(r.nilai_rm ?? '', { placeholder: 'Belum diisi', 'aria-label': r.label }), d: inp({ type: 'date', value: r.berkuat_kuasa || todayIso(), 'aria-label': 'Berkuat kuasa ' + r.label }) }));
  const sebab = el('textarea', { class: 'input', rows: 2, placeholder: 'Contoh: Kadar baharu 2027 diluluskan pengurusan' });
  const err = el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
  const save = el('button', { class: 'btn', type: 'button' }, icon('check'), 'Simpan kadar');
  save.addEventListener('click', () => busy(save, async () => {
    err.hidden = true;
    const changes = rows.filter(({ r, v, d }) => v.value !== '' && (Number(v.value) !== r.nilai_rm || d.value !== r.berkuat_kuasa))
      .map(({ r, v, d }) => ({ rate_key: r.rate_key, nilai_rm: Number(v.value), berkuat_kuasa: d.value }));
    if (!changes.length) { toast('Tiada perubahan.'); return; }
    try {
      rates = await api(MODULE, 'updateRates', { rates: changes, sebab: sebab.value });
      toast('Kadar disimpan. Estimate lama kekal dengan kadar asal.', 'success');
      clear(view);
      await renderRates();
    } catch (e) { clear(err).append(e.message); err.hidden = false; }
  }));
  append(view,
    el('h2', null, 'Kadar kos'),
    el('p', { class: 'muted' }, 'Kadar dalaman syarikat. Disimpan di server sahaja dan tidak dipaparkan kepada orang luar. Setiap perubahan direkod dalam audit log berserta nilai lama.'),
    rt.lengkap ? null : el('div', { class: 'alert alert-warning' }, icon('triangle-alert'), 'Isi semua kadar sebelum staf boleh simpan estimate.'),
    err,
    el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
      el('thead', null, el('tr', null, ['Kadar', 'Unit', 'Nilai (RM)', 'Berkuat kuasa'].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', null, rows.map(({ r, v, d }) => el('tr', null,
        el('td', { 'data-label': 'Kadar' }, el('strong', null, r.label)),
        el('td', { 'data-label': 'Unit' }, r.unit),
        el('td', { 'data-label': 'Nilai (RM)' }, v),
        el('td', { 'data-label': 'Berkuat kuasa' }, d)))))),
    el('div', { class: 'stack', style: 'margin-top:16px' }, field('Sebab perubahan (pilihan)', sebab), el('div', null, save)));
}

// ------------------------------------------------------------------ mula
async function start() {
  try {
    ctx = await bootModule(MODULE, 'Cost Calculator');
  } catch {
    return;
  }
  view = el('div', { id: 'view' });
  const items = [
    { href: '#/', label: 'Kalkulator', ikon: 'calculator', match: (h) => h === '#/' || h === '' || h.startsWith('#/e/') },
    { href: '#/senarai', label: 'Simpanan', ikon: 'scroll-text', match: (h) => h.startsWith('#/senarai') },
  ];
  if (isAdmin()) items.push({ href: '#/kadar', label: 'Kadar', ikon: 'key-round', match: (h) => h.startsWith('#/kadar') });
  append(clear(main), view);
  renderModuleNav(main, items);
  main.removeAttribute('aria-busy');
  window.addEventListener('hashchange', route);
  await route();
}

start();
