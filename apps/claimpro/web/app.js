// ClaimPro (F-50 hingga F-53; AFD S-50 hingga S-54; IPD 2B).
// UI sorok butang untuk kemas sahaja. Semua peraturan (asingan tugas, skop, jenis fail) disemak di Apps Script.
import { bootModule } from '/shared/lib/page.js';
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatRM, formatDate, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderModuleNav } from '/shared/ui/components.js';
import { prepareFile } from '/claimpro/receipt.js';

const MODULE = 'claimpro';
const main = document.getElementById('main');
let ctx;
let view;
let types = null;

const isAdmin = () => ctx.roles.includes('admin') || ctx.roles.includes('ketua');
const STATUS_KIND = { Draf: '', Dihantar: 'info', Lulus: 'success', Ditolak: 'danger', Dibayar: 'success' };
const REMIND_DAYS = 14;

const call = (action, payload) => api(MODULE, action, payload || {}, { onSlow: () => toast('Masih memproses...', 'info', 2500) });

function field(label, input, { hint, required, cls } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  return el('div', { class: 'field' + (cls ? ' ' + cls : '') },
    el('label', { for: id }, label, required ? el('span', { class: 'req' }, ' *') : null), input,
    hint ? el('span', { class: 'hint' }, hint) : null);
}
const inp = (attrs) => el('input', { class: 'input', autocomplete: 'off', ...attrs });
const errBox = () => el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
const showErr = (box, e) => { clear(box).append(e.message || String(e)); box.hidden = false; box.scrollIntoView({ block: 'nearest' }); };

async function loadTypes(force) {
  if (!types || force) types = await call('listClaimTypes');
  return types;
}

// ------------------------------------------------------------------ fail (resit/bukti)
async function viewFile(claimId, jenis) {
  try {
    const f = await call('getFile', { claim_id: claimId, jenis });
    const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
    const isImg = /^image\/(jpeg|png)$/.test(f.mime);
    const download = () => { const a = el('a', { href: url, download: f.nama }); document.body.append(a); a.click(); a.remove(); };
    openModal({
      title: jenis === 'bukti' ? 'Bukti bayaran' : 'Resit',
      wide: true,
      body: isImg
        ? el('img', { src: url, alt: 'Resit ' + claimId, class: 'share-img' })
        : el('p', null, f.mime === 'application/pdf' ? 'Fail PDF. Tekan Muat turun untuk buka.' : 'Format HEIC tak boleh dipapar dalam pelayar ini. Tekan Muat turun.'),
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
      actions: [{ label: 'Tutup', class: 'btn-secondary' }, { label: 'Muat turun', onClick: () => download() }],
    });
  } catch (e) {
    if (e.status !== 401) toast(e.message, 'danger');
  }
}

/** Kawalan pilih fail dengan preview. Pulang { node, get() -> prepared|null, remove(), hadFile } */
function filePicker({ label, existing, hint }) {
  let prepared = null;
  let removed = false;
  const input = el('input', { type: 'file', accept: 'image/*,application/pdf', class: 'sr-only', 'aria-label': label });
  const status = el('div', { class: 'caption' });
  const preview = el('div');
  const box = el('div', { class: 'file-pick' });
  const pick = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('plus'), existing ? 'Tukar resit' : 'Ambil gambar / pilih fail');
  pick.addEventListener('click', () => input.click());
  const draw = () => {
    clear(status);
    clear(preview);
    box.classList.toggle('has', Boolean(prepared) || Boolean(existing && !removed));
    if (prepared) {
      status.append(`${prepared.nama} (${(prepared.size / 1024).toFixed(0)} KB)`);
      if (/^image\//.test(prepared.mime) && prepared.mime !== 'image/heic') preview.append(el('img', { src: URL.createObjectURL(prepared.blob), alt: 'Preview resit' }));
    } else if (existing && !removed) status.append('Resit sedia ada akan dikekalkan.');
    else status.append(hint || 'Belum ada fail.');
  };
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try {
      prepared = await prepareFile(f);
      removed = false;
    } catch (e) {
      toast(e.message, 'danger');
      input.value = '';
    }
    draw();
  });
  const rm = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('x'), 'Buang');
  rm.addEventListener('click', () => { prepared = null; removed = true; input.value = ''; draw(); });
  append(box, el('div', { class: 'stack' }, el('div', { class: 'row', style: 'justify-content:center' }, pick, existing || prepared ? rm : null), status, preview), input);
  draw();
  return {
    node: box,
    get: () => prepared,
    removed: () => removed,
    has: () => Boolean(prepared) || Boolean(existing && !removed),
  };
}

// ------------------------------------------------------------------ router
async function route() {
  const h = location.hash || '#/';
  clear(view);
  window.scrollTo(0, 0);
  try {
    if (h.startsWith('#/baru')) await renderForm(null);
    else if (h.startsWith('#/e/')) await renderForm(decodeURIComponent(h.slice(4)));
    else if (h.startsWith('#/c/')) await renderDetail(decodeURIComponent(h.slice(4)));
    else if (h.startsWith('#/lulus')) await renderApprovals();
    else if (h.startsWith('#/laporan')) await renderReports(h.split('/')[2] || 'laporan');
    else await renderMine();
  } catch (e) {
    if (e.status !== 401) append(clear(view), el('div', { class: 'alert alert-danger' }, e.message));
  }
}

// ------------------------------------------------------------------ S-50 Tuntutan saya
function claimCard(c, { actions } = {}) {
  const overdue = c.status === 'Lulus' && c.hari_lulus !== null && c.hari_lulus >= REMIND_DAYS;
  return el('article', { class: 'cp-card' + (overdue ? ' warn' : '') },
    el('div', { class: 'top' },
      el('div', null,
        el('a', { href: '#/c/' + encodeURIComponent(c.claim_id) }, el('strong', null, c.claim_id)),
        el('div', { class: 'meta' }, `${c.jenis} · ${formatDate(c.tarikh)}${c.pax ? ' · ' + c.pax + ' pax' : ''}`)),
      el('div', { style: 'text-align:right' }, el('div', { class: 'amt' }, formatRM(c.amaun_rm)), badge(c.status, STATUS_KIND[c.status]))),
    el('p', { class: 'desc' }, c.keterangan),
    c.status === 'Ditolak' ? el('div', { class: 'alert alert-danger' }, 'Ditolak: ', c.sebab_tolak) : null,
    c.boleh_sahkan ? el('div', { class: 'alert ' + (overdue ? 'alert-warning' : 'alert-info') },
      overdue ? `Diluluskan ${c.hari_lulus} hari lalu. Dah terima bayaran? Sila sahkan.` : 'Diluluskan. Selepas terima bayaran, sila sahkan.') : null,
    actions ? el('div', { class: 'row' }, actions) : null);
}

async function renderMine() {
  const filter = el('select', { class: 'input', 'aria-label': 'Tapis status' },
    [['', 'Semua status'], ['Draf', 'Draf'], ['Dihantar', 'Dihantar'], ['Lulus', 'Lulus (belum disahkan)'], ['Ditolak', 'Ditolak'], ['Dibayar', 'Dibayar']].map(([v, t]) => el('option', { value: v }, t)));
  const host = el('div', null, el('div', { class: 'skeleton', style: 'height:160px' }));
  const stats = el('div', { class: 'cp-stats' });
  const load = async () => {
    const rows = await call('listMyClaims', { status: filter.value });
    const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + r.amaun_rm, 0);
    if (!filter.value) {
      append(clear(stats),
        el('div', { class: 'cp-stat' }, el('div', { class: 'label' }, 'Menunggu kelulusan'), el('div', { class: 'v' }, formatRM(sum('Dihantar')))),
        el('div', { class: 'cp-stat warn' }, el('div', { class: 'label' }, 'Lulus, belum disahkan terima'), el('div', { class: 'v' }, formatRM(sum('Lulus')))),
        el('div', { class: 'cp-stat ok' }, el('div', { class: 'label' }, 'Dibayar'), el('div', { class: 'v' }, formatRM(sum('Dibayar')))));
    } else clear(stats);
    clear(host);
    if (!rows.length) {
      host.append(emptyState('receipt', filter.value ? 'Tiada tuntutan berstatus ini.' : 'Belum ada tuntutan. Buat tuntutan pertama anda.',
        el('a', { class: 'btn', href: '#/baru' }, icon('plus'), 'Tuntutan baru')));
      return;
    }
    host.append(el('div', { class: 'cp-list' }, rows.map((c) => claimCard(c, {
      actions: [
        c.boleh_sahkan ? el('a', { class: 'btn btn-sm', href: '#/c/' + encodeURIComponent(c.claim_id) }, icon('circle-check'), 'Sahkan terima bayaran') : null,
        c.boleh_ubah ? el('a', { class: 'btn btn-secondary btn-sm', href: '#/e/' + encodeURIComponent(c.claim_id) }, icon('pencil'), 'Ubah draf') : null,
      ],
    }))));
  };
  filter.addEventListener('change', () => load().catch((e) => toast(e.message, 'danger')));
  append(view,
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, 'Tuntutan saya'), el('a', { class: 'btn', href: '#/baru' }, icon('plus'), 'Tuntutan baru')),
    stats, el('div', { style: 'max-width:260px;margin:16px 0' }, filter), host);
  await load();
}

// ------------------------------------------------------------------ S-51 Borang tuntutan
async function renderForm(claimId) {
  const [tp, existing] = await Promise.all([loadTypes(true), claimId ? call('getClaim', { claim_id: claimId }) : null]);
  if (existing && !existing.boleh_ubah) { location.replace('#/c/' + encodeURIComponent(claimId)); return; }
  const f = {
    jenis: el('select', { class: 'input' }, [el('option', { value: '' }, 'Pilih jenis'), ...tp.map((t) => el('option', { value: t.jenis }, t.jenis))]),
    tarikh: inp({ type: 'date', max: todayIso(), value: existing ? existing.tarikh : todayIso() }),
    pax: inp({ type: 'number', inputmode: 'numeric', min: '1', step: '1', value: existing?.pax ?? '', placeholder: 'Pilihan' }),
    amaun: inp({ type: 'number', inputmode: 'decimal', min: '0', step: '0.01', value: existing?.amaun_rm ?? '', placeholder: '0.00' }),
    keterangan: el('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Contoh: Makan tengah hari bersama pasukan di site' }),
  };
  f.keterangan.value = existing?.keterangan || '';
  f.jenis.value = existing?.jenis || '';
  const typeHint = el('span', { class: 'hint' });
  const picker = filePicker({ label: 'Resit', existing: existing?.ada_resit, hint: 'Ambil gambar resit atau pilih fail (JPG, PNG, HEIC, PDF, maksimum 8MB).' });
  const err = errBox();
  const updateHint = () => {
    const t = tp.find((x) => x.jenis === f.jenis.value);
    clear(typeHint).append(t ? [t.perlu_resit ? 'Resit wajib untuk jenis ini. ' : 'Resit tak wajib. ', t.had_rm ? `Had RM ${t.had_rm.toFixed(2)}.` : ''] : '');
  };
  f.jenis.addEventListener('change', updateHint);
  updateHint();

  const payload = (hantar) => {
    const up = picker.get();
    return {
      claim_id: claimId || undefined, jenis: f.jenis.value, tarikh: f.tarikh.value, pax: f.pax.value, keterangan: f.keterangan.value,
      amaun_rm: f.amaun.value, resit: up ? { data: up.data } : undefined, buang_resit: picker.removed() && !up ? true : undefined, hantar,
    };
  };
  const clientCheck = (hantar) => {
    if (!f.jenis.value) return 'Pilih jenis tuntutan';
    if (!f.tarikh.value) return 'Isi tarikh perbelanjaan';
    if (!f.amaun.value || Number(f.amaun.value) <= 0) return 'Isi amaun lebih daripada 0';
    if (!f.keterangan.value.trim()) return 'Isi keterangan';
    const t = tp.find((x) => x.jenis === f.jenis.value);
    if (hantar && t?.perlu_resit && !picker.has()) return 'Resit wajib untuk jenis ini';
    return '';
  };
  async function save(hantar, btn) {
    err.hidden = true;
    const bad = clientCheck(hantar);
    if (bad) { showErr(err, new Error(bad)); return; }
    if (hantar && !(await confirmDialog('Hantar tuntutan?', `RM ${Number(f.amaun.value).toFixed(2)} (${f.jenis.value}). Selepas dihantar, tuntutan tak boleh diubah.`, { okLabel: 'Hantar' }))) return;
    await busy(btn, async () => {
      try {
        const c = await call('saveClaim', payload(hantar));
        toast(hantar ? `${c.claim_id} dihantar untuk kelulusan.` : `Draf ${c.claim_id} disimpan.`, 'success');
        location.hash = hantar ? '#/c/' + encodeURIComponent(c.claim_id) : '#/';
      } catch (e) { showErr(err, e); }
    });
  }
  const draf = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('save'), 'Simpan draf');
  const hantar = el('button', { class: 'btn', type: 'button' }, icon('check'), 'Hantar');
  draf.addEventListener('click', () => save(false, draf));
  hantar.addEventListener('click', () => save(true, hantar));
  const del = existing ? el('button', { class: 'btn btn-ghost', type: 'button' }, icon('x'), 'Padam draf') : null;
  del?.addEventListener('click', async () => {
    if (!(await confirmDialog('Padam draf?', 'Draf dan resitnya akan dipadam.', { danger: true, okLabel: 'Padam' }))) return;
    try { await call('deleteClaim', { claim_id: claimId }); toast('Draf dipadam.', 'success'); location.hash = '#/'; } catch (e) { showErr(err, e); }
  });

  append(view,
    el('h2', null, existing ? 'Ubah draf ' + existing.claim_id : 'Tuntutan baru'),
    el('form', { class: 'cp-form', onsubmit: (e) => e.preventDefault(), novalidate: true },
      err,
      el('div', { class: 'cp-grid' },
        field('Jenis tuntutan', f.jenis, { required: true, cls: 'full', hint: null }),
        field('Tarikh perbelanjaan', f.tarikh, { required: true }),
        field('Pax', f.pax),
        field('Amaun (RM)', f.amaun, { required: true, cls: 'full' })),
      typeHint,
      field('Keterangan', f.keterangan, { required: true, hint: 'Maksimum 500 aksara.' }),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Resit'), picker.node),
      el('div', { class: 'row' }, hantar, draf, del)));
}

// ------------------------------------------------------------------ butiran + S-53 sahkan terima bayaran
async function renderDetail(id) {
  const c = await call('getClaim', { claim_id: id });
  const kv = (k, v) => [el('dt', null, k), el('dd', null, v === null || v === undefined || v === '' ? '-' : v)];
  const overdue = c.status === 'Lulus' && c.hari_lulus !== null && c.hari_lulus >= REMIND_DAYS;
  const confirmBox = c.boleh_sahkan ? confirmForm(c) : null;
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: c.milik_saya ? '#/' : '#/laporan' }, icon('arrow-left'), 'Kembali')),
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, c.claim_id), badge(c.status, STATUS_KIND[c.status])),
    el('section', { class: 'card stack' },
      el('dl', { class: 'kv' },
        kv('Staf', `${c.staff_name} (${c.staff_id}) · ${c.department}`), kv('Jenis', c.jenis), kv('Tarikh perbelanjaan', formatDate(c.tarikh)),
        kv('Pax', c.pax), kv('Keterangan', c.keterangan), kv('Amaun', el('strong', { class: 'num' }, formatRM(c.amaun_rm))),
        kv('Dihantar', c.submitted_at ? formatDateTime(c.submitted_at) : null),
        c.approved_at ? kv(c.status === 'Ditolak' ? 'Ditolak oleh' : 'Diluluskan oleh', `${c.approved_by_name} · ${formatDateTime(c.approved_at)}`) : null,
        c.sebab_tolak ? kv('Sebab tolak', c.sebab_tolak) : null,
        c.status === 'Dibayar' ? [...kv('Tarikh terima', formatDate(c.received_date)), ...kv('Jumlah diterima', formatRM(c.received_amount_rm))] : null),
      c.beza_bayaran ? el('div', { class: 'alert alert-warning' }, icon('triangle-alert'), 'Jumlah diterima berbeza daripada jumlah diluluskan. Admin telah dimaklumkan.') : null,
      el('div', { class: 'row' },
        c.ada_resit ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => viewFile(c.claim_id, 'resit') }, icon('receipt'), 'Lihat resit') : null,
        c.ada_bukti ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => viewFile(c.claim_id, 'bukti') }, icon('scroll-text'), 'Bukti bayaran') : null,
        c.boleh_ubah ? el('a', { class: 'btn btn-secondary', href: '#/e/' + encodeURIComponent(c.claim_id) }, icon('pencil'), 'Ubah draf') : null)),
    overdue ? el('div', { class: 'alert alert-warning' }, icon('triangle-alert'), `Diluluskan ${c.hari_lulus} hari lalu. Jika dah terima bayaran, sila sahkan di bawah.`) : null,
    confirmBox,
    el('section', { class: 'card' }, el('h3', null, 'Sejarah'),
      el('ol', { class: 'timeline' }, (c.sejarah || []).map((h) => el('li', null,
        el('div', null, el('strong', null, `${h.dari} → ${h.ke}`), ' oleh ', h.oleh), el('div', { class: 't' }, formatDateTime(h.ts)), h.catatan ? el('div', null, h.catatan) : null)))));
}

function confirmForm(c) {
  const date = inp({ type: 'date', max: todayIso(), min: (c.approved_at || '').slice(0, 10), value: todayIso() });
  const amount = inp({ type: 'number', inputmode: 'decimal', min: '0', step: '0.01', value: c.amaun_rm.toFixed(2) });
  const proof = filePicker({ label: 'Bukti bayaran', hint: 'Pilihan: tangkap skrin penyata bank.' });
  const err = errBox();
  const btn = el('button', { class: 'btn', type: 'button' }, icon('circle-check'), 'Saya dah terima bayaran');
  btn.addEventListener('click', () => {
    err.hidden = true;
    const diff = Math.round(Number(amount.value) * 100) !== Math.round(c.amaun_rm * 100);
    const go = async () => {
      await busy(btn, async () => {
        try {
          const up = proof.get();
          await call('confirmReceived', { claim_id: c.claim_id, received_date: date.value, received_amount_rm: amount.value, bukti: up ? { data: up.data } : undefined });
          toast('Terima kasih. Tuntutan ditanda Dibayar.', 'success');
          await route();
        } catch (e) { showErr(err, e); }
      });
    };
    if (diff) confirmDialog('Jumlah berbeza', `Jumlah diterima (${formatRM(amount.value)}) berbeza daripada jumlah diluluskan (${formatRM(c.amaun_rm)}). Admin akan dimaklumkan. Teruskan?`, { okLabel: 'Teruskan' }).then((ok) => ok && go());
    else go();
  });
  return el('section', { class: 'card stack' }, el('h3', null, 'Sahkan terima bayaran'),
    el('p', { class: 'muted' }, 'Hanya anda boleh mengesahkan ini selepas wang masuk ke akaun bank anda.'), err,
    el('div', { class: 'cp-grid' }, field('Tarikh terima', date, { required: true }), field('Jumlah diterima (RM)', amount, { required: true })),
    el('div', { class: 'field' }, el('span', { class: 'label' }, 'Bukti (pilihan)'), proof.node), el('div', null, btn));
}

// ------------------------------------------------------------------ S-52 Kelulusan (admin sahaja)
async function renderApprovals() {
  if (!isAdmin()) { append(view, el('div', { class: 'alert alert-danger' }, 'Hanya Admin ClaimPro boleh buka skrin ini.')); return; }
  const host = el('div', null, el('div', { class: 'skeleton', style: 'height:160px' }));
  append(view, el('h2', null, 'Kelulusan'), host);
  const load = async () => {
    const rows = await call('listPending');
    clear(host);
    if (!rows.length) { host.append(emptyState('circle-check', 'Tiada tuntutan menunggu kelulusan.')); return; }
    host.append(el('div', { class: 'cp-list' }, rows.map((c) => {
      const card = claimCard(c, {
        actions: [
          c.ada_resit ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => viewFile(c.claim_id, 'resit') }, icon('receipt'), 'Resit') : el('span', { class: 'caption' }, 'Tiada resit'),
          c.boleh_lulus ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => decide(c, 'Lulus') }, icon('check'), 'Lulus') : null,
          c.boleh_lulus ? el('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => decide(c, 'Ditolak') }, icon('x'), 'Tolak') : el('span', { class: 'badge badge-warning' }, c.sebab_tak_boleh),
        ],
      });
      card.prepend(el('div', { class: 'meta', style: 'margin-bottom:6px' }, `${c.staff_name} (${c.staff_id}) · ${c.department}`));
      return card;
    })));
  };
  async function decide(c, keputusan) {
    if (keputusan === 'Lulus') {
      if (!(await confirmDialog('Luluskan tuntutan?', `${c.claim_id}: ${formatRM(c.amaun_rm)} (${c.staff_name}).`, { okLabel: 'Luluskan' }))) return;
      try { await call('decideClaim', { claim_id: c.claim_id, keputusan }); toast(`${c.claim_id} diluluskan.`, 'success'); await load(); } catch (e) { toast(e.message, 'danger'); await load(); }
      return;
    }
    const why = el('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Contoh: Resit tak jelas, sila hantar semula' });
    const err = errBox();
    openModal({
      title: 'Tolak ' + c.claim_id,
      body: el('div', { class: 'stack' }, err, field('Sebab (wajib)', why, { required: true, hint: 'Staf akan nampak sebab ini.' })),
      actions: [
        { label: 'Batal', class: 'btn-secondary' },
        { label: 'Tolak tuntutan', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
          try { await call('decideClaim', { claim_id: c.claim_id, keputusan, sebab: why.value }); close(); toast(`${c.claim_id} ditolak.`, 'success'); await load(); } catch (e) { showErr(err, e); }
        }) },
      ],
    });
  }
  await load();
}

// ------------------------------------------------------------------ S-54 Laporan (admin sahaja)
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // elak formula injection bila dibuka dalam Excel
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(name, rows) {
  const head = ['ID', 'No. pekerja', 'Nama', 'Department', 'Tarikh', 'Jenis', 'Pax', 'Keterangan', 'Amaun RM', 'Status', 'Diluluskan oleh', 'Tarikh terima', 'Diterima RM', 'Beza bayaran'];
  const lines = [head, ...rows.map((c) => [c.claim_id, c.staff_id, c.staff_name, c.department, c.tarikh, c.jenis, c.pax, c.keterangan, c.amaun_rm.toFixed(2), c.status, c.approved_by_name, c.received_date, c.received_amount_rm === null ? '' : c.received_amount_rm.toFixed(2), c.beza_bayaran ? 'Ya' : ''])];
  const blob = new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderReports(tab) {
  if (!isAdmin()) { append(view, el('div', { class: 'alert alert-danger' }, 'Hanya Admin ClaimPro boleh buka skrin ini.')); return; }
  const tabs = [['laporan', 'Laporan'], ['bayar', 'Belum dibayar'], ['jenis', 'Jenis tuntutan']];
  append(view, el('h2', null, 'Laporan'),
    el('nav', { class: 'tabs', 'aria-label': 'Bahagian laporan' }, tabs.map(([id, t]) => el('a', { href: '#/laporan/' + id, 'aria-selected': String(id === tab) }, t))));
  const host = el('div', { style: 'margin-top:16px' });
  view.append(host);
  if (tab === 'bayar') await renderToPay(host);
  else if (tab === 'jenis') await renderTypes(host);
  else await renderReportMain(host);
}

async function renderReportMain(host) {
  const tp = await loadTypes();
  const bulan = inp({ type: 'month', value: todayIso().slice(0, 7) });
  const jenis = el('select', { class: 'input' }, [el('option', { value: '' }, 'Semua jenis'), ...tp.map((t) => el('option', { value: t.jenis }, t.jenis))]);
  const status = el('select', { class: 'input' }, [['', 'Semua status'], ['Dihantar', 'Dihantar'], ['Lulus', 'Lulus'], ['Ditolak', 'Ditolak'], ['Dibayar', 'Dibayar']].map(([v, t]) => el('option', { value: v }, t)));
  const go = el('button', { class: 'btn', type: 'button' }, icon('search'), 'Tapis');
  const csv = el('button', { class: 'btn btn-secondary', type: 'button', disabled: true }, icon('download'), 'Eksport CSV');
  const out = el('div', { class: 'stack' });
  let last = [];
  const run = () => busy(go, async () => {
    try {
      const r = await call('claimReport', { bulan: bulan.value, jenis: jenis.value, status: status.value });
      last = r.tuntutan;
      csv.disabled = !last.length;
      clear(out);
      append(out,
        el('div', { class: 'cp-stats' },
          el('div', { class: 'cp-stat' }, el('div', { class: 'label' }, 'Bilangan'), el('div', { class: 'v' }, String(r.bilangan))),
          el('div', { class: 'cp-stat' }, el('div', { class: 'label' }, 'Jumlah'), el('div', { class: 'v' }, formatRM(r.jumlah_rm))),
          el('div', { class: 'cp-stat ' + (r.beza_bayaran ? 'warn' : '') }, el('div', { class: 'label' }, 'Beza bayaran'), el('div', { class: 'v' }, String(r.beza_bayaran)))),
        r.terpotong ? el('div', { class: 'alert alert-warning' }, 'Hanya 2,000 baris pertama dipapar. Tapis lebih spesifik.') : null,
        r.tuntutan.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
          el('thead', null, el('tr', null, ['ID', 'Staf', 'Tarikh', 'Jenis', 'Amaun', 'Status', ''].map((h) => el('th', { scope: 'col' }, h)))),
          el('tbody', null, r.tuntutan.map((c) => el('tr', null,
            el('td', { 'data-label': 'ID' }, el('a', { href: '#/c/' + encodeURIComponent(c.claim_id) }, c.claim_id)),
            el('td', { 'data-label': 'Staf' }, `${c.staff_name} (${c.department})`),
            el('td', { 'data-label': 'Tarikh' }, formatDate(c.tarikh)), el('td', { 'data-label': 'Jenis' }, c.jenis),
            el('td', { 'data-label': 'Amaun', class: 'num' }, formatRM(c.amaun_rm)),
            el('td', { 'data-label': 'Status' }, badge(c.status, STATUS_KIND[c.status]), c.beza_bayaran ? badge('Beza', 'warning') : null),
            el('td', { class: 'actions' }, el('a', { class: 'btn btn-secondary btn-sm', href: '#/c/' + encodeURIComponent(c.claim_id) }, 'Buka'))))))) : emptyState('scroll-text', 'Tiada tuntutan sepadan.'));
    } catch (e) { clear(out).append(el('div', { class: 'alert alert-danger' }, e.message)); }
  });
  go.addEventListener('click', run);
  csv.addEventListener('click', () => downloadCsv(`ClaimPro_${bulan.value || 'semua'}.csv`, last));
  append(host, el('div', { class: 'cp-grid' }, field('Bulan (tarikh perbelanjaan)', bulan), field('Jenis', jenis), field('Status', status)),
    el('div', { class: 'row', style: 'margin:12px 0' }, go, csv), out);
  await run();
}

async function renderToPay(host) {
  const r = await call('listToPay');
  append(host,
    el('p', { class: 'muted' }, 'Tuntutan diluluskan yang staf belum sahkan terima. Gunakan senarai ini untuk pindahan wang di luar sistem. Selepas staf sahkan, ia keluar dari senarai.'),
    el('div', { class: 'cp-stats' }, el('div', { class: 'cp-stat warn' }, el('div', { class: 'label' }, 'Jumlah belum dibayar/disahkan'), el('div', { class: 'v' }, formatRM(r.jumlah_rm))),
      el('div', { class: 'cp-stat' }, el('div', { class: 'label' }, 'Bilangan'), el('div', { class: 'v' }, String(r.tuntutan.length)))),
    r.tuntutan.length ? el('div', { class: 'table-wrap responsive', style: 'margin-top:16px' }, el('table', { class: 'table' },
      el('thead', null, el('tr', null, ['ID', 'Staf', 'Jenis', 'Amaun', 'Diluluskan', 'Menunggu', ''].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', null, r.tuntutan.map((c) => el('tr', null,
        el('td', { 'data-label': 'ID' }, el('a', { href: '#/c/' + encodeURIComponent(c.claim_id) }, c.claim_id)),
        el('td', { 'data-label': 'Staf' }, `${c.staff_name} (${c.staff_id})`), el('td', { 'data-label': 'Jenis' }, c.jenis),
        el('td', { 'data-label': 'Amaun', class: 'num' }, formatRM(c.amaun_rm)), el('td', { 'data-label': 'Diluluskan' }, formatDate(c.approved_at)),
        el('td', { 'data-label': 'Menunggu' }, badge(`${c.hari_lulus} hari`, c.hari_lulus >= REMIND_DAYS ? 'warning' : '')),
        el('td', { class: 'actions' }, el('a', { class: 'btn btn-secondary btn-sm', href: '#/c/' + encodeURIComponent(c.claim_id) }, 'Buka'))))))) : emptyState('circle-check', 'Tiada tuntutan menunggu pembayaran.'));
}

async function renderTypes(host) {
  const draw = async () => {
    const tp = await loadTypes(true);
    clear(host);
    append(host,
      el('div', { class: 'row-between' }, el('p', { class: 'muted', style: 'margin:0' }, 'Jenis tuntutan yang staf boleh pilih. Had RM dan keperluan resit disemak di server.'),
        el('button', { class: 'btn', type: 'button', onclick: () => typeModal(null, draw) }, icon('plus'), 'Jenis baharu')),
      el('div', { class: 'table-wrap responsive', style: 'margin-top:16px' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['Jenis', 'Had (RM)', 'Resit', 'Status', ''].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', null, tp.map((t) => el('tr', null,
          el('td', { 'data-label': 'Jenis' }, el('strong', null, t.jenis)), el('td', { 'data-label': 'Had (RM)', class: 'num' }, t.had_rm ? formatRM(t.had_rm) : 'Tiada had'),
          el('td', { 'data-label': 'Resit' }, t.perlu_resit ? 'Wajib' : 'Tak wajib'), el('td', { 'data-label': 'Status' }, badge(t.aktif ? 'Aktif' : 'Tak aktif', t.aktif ? 'success' : '')),
          el('td', { class: 'actions' }, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => typeModal(t, draw) }, icon('pencil'), 'Ubah'))))))));
  };
  await draw();
}

function typeModal(t, done) {
  const nama = inp({ value: t?.jenis || '', maxlength: 40, disabled: Boolean(t) });
  const had = inp({ type: 'number', inputmode: 'decimal', min: '0', step: '0.01', value: t?.had_rm ?? '', placeholder: 'Kosong = tiada had' });
  const resit = el('input', { type: 'checkbox', checked: t ? t.perlu_resit : true });
  const aktif = el('input', { type: 'checkbox', checked: t ? t.aktif : true });
  const err = errBox();
  openModal({
    title: t ? 'Ubah ' + t.jenis : 'Jenis tuntutan baharu',
    body: el('div', { class: 'stack' }, err, field('Nama jenis', nama, { required: true, hint: t ? 'Nama tak boleh ditukar (tuntutan lama merujuknya).' : '' }), field('Had amaun (RM)', had),
      el('label', { class: 'check' }, resit, 'Resit wajib semasa hantar'), el('label', { class: 'check' }, aktif, 'Aktif (staf boleh pilih)')),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
        try { await call('saveClaimType', { jenis: nama.value, had_rm: had.value, perlu_resit: resit.checked, aktif: aktif.checked }); close(); toast('Jenis disimpan.', 'success'); done(); } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ mula
async function start() {
  try {
    ctx = await bootModule(MODULE, 'ClaimPro');
  } catch {
    return;
  }
  view = el('div', { id: 'view', class: 'stack' });
  const items = [
    { href: '#/', label: 'Tuntutan saya', ikon: 'receipt', match: (h) => h === '#/' || h === '' || h.startsWith('#/c/') || h.startsWith('#/e/') },
    { href: '#/baru', label: 'Baru', ikon: 'plus', match: (h) => h.startsWith('#/baru') },
  ];
  if (isAdmin()) {
    items.push({ href: '#/lulus', label: 'Kelulusan', ikon: 'circle-check', match: (h) => h.startsWith('#/lulus') });
    items.push({ href: '#/laporan', label: 'Laporan', ikon: 'scroll-text', match: (h) => h.startsWith('#/laporan') });
  }
  append(clear(main), view);
  renderModuleNav(main, items);
  main.removeAttribute('aria-busy');
  window.addEventListener('hashchange', route);
  await route();
}

start();
