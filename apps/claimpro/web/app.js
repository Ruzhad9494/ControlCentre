// ClaimPro (F-50 hingga F-53; AFD S-50 hingga S-54; IPD 2B).
// Peraturan perniagaan ikut sistem lama voltake-energy/claimpro (had makan ikut sesi, had perubatan tahunan,
// pax wajib, sehingga 10 resit, rekod bayaran berkelompok dengan bukti). Klien papar had untuk kemudahan
// sahaja: semua peraturan dan asingan tugas disemak di Apps Script.
import { bootModule } from '/shared/lib/page.js';
import { api } from '/shared/lib/api.js';
import { el, clear, append } from '/shared/lib/escape.js';
import { formatRM, formatDate, formatDateTime, todayIso } from '/shared/lib/format.js';
import { icon, toast, openModal, confirmDialog, busy, badge, emptyState, renderModuleNav } from '/shared/ui/components.js';
import { prepareFile, MAX_FILES } from '/claimpro/receipt.js';
import { exportReportPdf, exportStaffPdf, groupByStaff, oldFormatCsv } from '/claimpro/pdf.js';

const MODULE = 'claimpro';
const main = document.getElementById('main');
let ctx;
let view;

const isAdmin = () => ctx.roles.includes('admin') || ctx.roles.includes('ketua');
const STATUS_KIND = { Draf: '', Dihantar: 'info', Lulus: 'success', Ditolak: 'danger', Dibayar: 'success' };
const SESI_LABEL = { siang: 'Siang', malam: 'Malam', 'siang+malam': 'Siang + Malam' };
const REMIND_DAYS = 14;
const MAX_AMOUNT = 50000;
const BATCH_B64 = 10 * 1024 * 1024; // saiz base64 maksimum satu permintaan (had gateway 15MB)

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
const loadTypes = (tahun) => call('listClaimTypes', tahun ? { tahun } : {});

// ------------------------------------------------------------------ fail
const FILE_TITLE = { resit: 'Resit', bukti: 'Bukti terima (staf)', bayaran: 'Bukti bayaran syarikat' };

async function viewFile(claimId, jenis, index = 0) {
  try {
    const f = await call('getFile', { claim_id: claimId, jenis, index });
    const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
    const isImg = /^image\/(jpeg|png|webp)$/.test(f.mime);
    const download = () => { const a = el('a', { href: url, download: f.nama }); document.body.append(a); a.click(); a.remove(); };
    openModal({
      title: FILE_TITLE[jenis] + (jenis === 'resit' ? ' ' + (index + 1) : ''),
      wide: true,
      body: isImg
        ? el('img', { src: url, alt: FILE_TITLE[jenis] + ' ' + claimId, class: 'share-img' })
        : el('p', null, f.mime === 'application/pdf' ? 'Fail PDF. Tekan Muat turun untuk buka.' : 'Format ini tak boleh dipapar dalam pelayar. Tekan Muat turun.'),
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
      actions: [{ label: 'Tutup', class: 'btn-secondary' }, { label: 'Muat turun', onClick: () => download() }],
    });
  } catch (e) {
    if (e.status !== 401) toast(e.message, 'danger');
  }
}

/** Satu fail (bukti bayaran / bukti terima). Pulang { node, get() }. */
function filePicker({ label, hint }) {
  let prepared = null;
  const input = el('input', { type: 'file', accept: 'image/*,application/pdf', class: 'sr-only', 'aria-label': label });
  const status = el('div', { class: 'caption' });
  const preview = el('div');
  const box = el('div', { class: 'file-pick' });
  const pick = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('plus'), 'Pilih fail / ambil gambar');
  const rm = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: true }, icon('x'), 'Buang');
  pick.addEventListener('click', () => input.click());
  const draw = () => {
    clear(status);
    clear(preview);
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
    try { prepared = await prepareFile(f); } catch (e) { toast(e.message, 'danger'); input.value = ''; }
    draw();
  });
  rm.addEventListener('click', () => { prepared = null; input.value = ''; draw(); });
  append(box, el('div', { class: 'stack' }, el('div', { class: 'row', style: 'justify-content:center' }, pick, rm), status, preview), input);
  draw();
  return { node: box, get: () => prepared };
}

/**
 * Sehingga 10 resit (sistem lama: MAX_FILES_PER_CLAIM). Resit sedia ada boleh dilihat/dibuang; fail baharu ditambah.
 * Pulang { node, files(), removedIdx(), count() }.
 */
function receiptPicker({ claimId, existing = 0, onChange }) {
  const added = [];
  const removed = new Set();
  const input = el('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'sr-only', 'aria-label': 'Resit' });
  const list = el('ul', { class: 'file-list' });
  const status = el('div', { class: 'caption' });
  const box = el('div', { class: 'file-pick' });
  const pick = el('button', { class: 'btn btn-secondary', type: 'button' }, icon('plus'), 'Ambil gambar / pilih fail');
  pick.addEventListener('click', () => input.click());
  const count = () => existing - removed.size + added.length;
  const draw = () => {
    clear(list);
    for (let i = 0; i < existing; i++) {
      if (removed.has(i)) continue;
      list.append(el('li', null, icon('receipt'), el('span', { class: 'grow' }, `Resit ${i + 1} (tersimpan)`),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile(claimId, 'resit', i) }, 'Lihat'),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': `Buang resit ${i + 1}`, onclick: () => { removed.add(i); draw(); } }, icon('x'))));
    }
    added.forEach((p, i) => {
      list.append(el('li', null, icon('receipt'), el('span', { class: 'grow' }, `${p.nama} (${(p.size / 1024).toFixed(0)} KB)`),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': `Buang ${p.nama}`, onclick: () => { added.splice(i, 1); draw(); } }, icon('x'))));
    });
    box.classList.toggle('has', count() > 0);
    pick.disabled = count() >= MAX_FILES;
    clear(status).append(count() ? `${count()} daripada maksimum ${MAX_FILES} fail.` : 'Ambil gambar resit atau pilih fail (JPG, PNG, HEIC, WEBP, PDF; maksimum 10MB sefail, 10 fail).');
    onChange && onChange();
  };
  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];
    input.value = '';
    for (const f of files) {
      if (count() >= MAX_FILES) { toast(`Maksimum ${MAX_FILES} fail satu tuntutan.`, 'warning'); break; }
      try { added.push(await prepareFile(f)); } catch (e) { toast(`${f.name}: ${e.message}`, 'danger'); }
    }
    draw();
  });
  append(box, el('div', { class: 'stack' }, list, el('div', { class: 'row', style: 'justify-content:center' }, pick), status), input);
  draw();
  return { node: box, files: () => [...added], removedIdx: () => [...removed], count };
}

/** Label butang ubah ikut status (cara lama: staf betulkan sebelum lulus; HR ubah mana-mana). */
function editLabel(c) {
  if (c.ubah_sebagai_admin) return 'Ubah (HR)';
  if (c.status === 'Dihantar') return 'Betulkan';
  if (c.status === 'Ditolak') return 'Betulkan & hantar semula';
  return 'Ubah draf';
}
const editLink = (c, cls = 'btn btn-secondary btn-sm') => (c.boleh_ubah ? el('a', { class: cls, href: '#/e/' + encodeURIComponent(c.claim_id) }, icon('pencil'), editLabel(c)) : null);

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
function paidBadge(c) {
  if (!c.ada_bukti_bayar) return null;
  return badge(c.separa ? `Separa dibayar ${formatRM(c.bayar_jumlah_rm)}` : 'Bayaran direkod', c.separa ? 'warning' : 'info');
}

function claimCard(c, { actions } = {}) {
  const overdue = c.status === 'Lulus' && c.hari_lulus !== null && c.hari_lulus >= REMIND_DAYS;
  return el('article', { class: 'cp-card' + (overdue ? ' warn' : '') },
    el('div', { class: 'top' },
      el('div', null,
        el('a', { href: '#/c/' + encodeURIComponent(c.claim_id) }, el('strong', null, c.claim_id)),
        el('div', { class: 'meta' }, `${c.jenis}${c.sesi_makan ? ' (' + SESI_LABEL[c.sesi_makan] + ')' : ''} · ${formatDate(c.tarikh)} · ${c.pax} pax · ${c.bil_resit} resit`)),
      el('div', { style: 'text-align:right' }, el('div', { class: 'amt' }, formatRM(c.amaun_rm)),
        el('div', { class: 'chips', style: 'justify-content:flex-end' }, badge(c.status, STATUS_KIND[c.status]), paidBadge(c)))),
    el('p', { class: 'desc' }, c.keterangan),
    c.status === 'Ditolak' ? el('div', { class: 'alert alert-danger' }, 'Ditolak: ', c.sebab_tolak) : null,
    c.boleh_sahkan ? el('div', { class: 'alert ' + (overdue ? 'alert-warning' : 'alert-info') },
      c.ada_bukti_bayar ? `Syarikat merekod bayaran ${formatRM(c.bayar_jumlah_rm)} pada ${formatDate(c.bayar_tarikh)}. Selepas semak akaun bank, sila sahkan.`
        : overdue ? `Diluluskan ${c.hari_lulus} hari lalu. Dah terima bayaran? Sila sahkan.` : 'Diluluskan. Selepas terima bayaran, sila sahkan.') : null,
    actions ? el('div', { class: 'row' }, actions) : null);
}

async function renderMine() {
  const filter = el('select', { class: 'input', 'aria-label': 'Tapis status' },
    [['', 'Semua status'], ['Draf', 'Draf'], ['Dihantar', 'Dihantar'], ['Lulus', 'Lulus (belum disahkan)'], ['Ditolak', 'Ditolak'], ['Dibayar', 'Dibayar']].map(([v, t]) => el('option', { value: v }, t)));
  const host = el('div', null, el('div', { class: 'skeleton', style: 'height:160px' }));
  const stats = el('div', { class: 'cp-stats' });
  const load = async () => {
    const [rows, types] = await Promise.all([call('listMyClaims', { status: filter.value }), loadTypes()]);
    const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + r.amaun_rm, 0);
    clear(stats);
    if (!filter.value) {
      append(stats,
        el('div', { class: 'cp-stat' }, el('div', { class: 'label' }, 'Menunggu kelulusan'), el('div', { class: 'v' }, formatRM(sum('Dihantar')))),
        el('div', { class: 'cp-stat warn' }, el('div', { class: 'label' }, 'Lulus, belum disahkan terima'), el('div', { class: 'v' }, formatRM(sum('Lulus')))),
        el('div', { class: 'cp-stat ok' }, el('div', { class: 'label' }, 'Dibayar'), el('div', { class: 'v' }, formatRM(sum('Dibayar')))),
        types.filter((t) => t.had_tahunan_rm).map((t) => el('div', { class: 'cp-stat' },
          el('div', { class: 'label' }, `Baki ${t.jenis} ${t.tahun}`), el('div', { class: 'v' }, formatRM(t.baki_rm)), el('div', { class: 'caption' }, `daripada ${formatRM(t.had_tahunan_rm)}`))));
    }
    clear(host);
    if (!rows.length) {
      host.append(emptyState('receipt', filter.value ? 'Tiada tuntutan berstatus ini.' : 'Belum ada tuntutan. Buat tuntutan pertama anda.',
        el('a', { class: 'btn', href: '#/baru' }, icon('plus'), 'Tuntutan baru')));
      return;
    }
    host.append(el('div', { class: 'cp-list' }, rows.map((c) => claimCard(c, {
      actions: [
        c.boleh_sahkan ? el('a', { class: 'btn btn-sm', href: '#/c/' + encodeURIComponent(c.claim_id) }, icon('circle-check'), 'Sahkan terima bayaran') : null,
        editLink(c),
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
function mealCap(t, sesi, pax) {
  if (!t?.kadar_makan || !sesi) return null;
  const r = sesi === 'siang+malam' ? t.kadar_makan.kedua : t.kadar_makan[sesi];
  return Math.round(r * pax * 100) / 100;
}

/** Bahagikan fail kepada kelompok supaya setiap permintaan bawah had gateway. */
function batches(files) {
  const out = [[]];
  let size = 0;
  for (const f of files) {
    if (size + f.data.length > BATCH_B64 && out[out.length - 1].length) { out.push([]); size = 0; }
    out[out.length - 1].push(f);
    size += f.data.length;
  }
  return out;
}

async function renderForm(claimId) {
  const existing = claimId ? await call('getClaim', { claim_id: claimId }) : null;
  if (existing && !existing.boleh_ubah) { location.replace('#/c/' + encodeURIComponent(claimId)); return; }
  // mode: 'baru' | 'Draf' | 'Dihantar' | 'Ditolak' (pemilik) | 'admin' (HR ubah tuntutan staf, status kekal)
  const mode = !existing ? 'baru' : existing.ubah_sebagai_admin ? 'admin' : existing.status;
  const startDate = existing ? existing.tarikh : todayIso();
  let tp = await loadTypes(startDate.slice(0, 4));
  const f = {
    jenis: el('select', { class: 'input' }),
    tarikh: inp({ type: 'date', max: todayIso(), value: startDate }),
    pax: inp({ type: 'number', inputmode: 'numeric', min: '1', max: '100', step: '1', value: existing?.pax ?? 1 }),
    amaun: inp({ type: 'number', inputmode: 'decimal', min: '0', max: String(MAX_AMOUNT), step: '0.01', value: existing?.amaun_rm ?? '', placeholder: '0.00' }),
    keterangan: el('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Contoh: Tol dan minyak ke site Tanjung Malim' }),
    siang: el('input', { type: 'checkbox' }),
    malam: el('input', { type: 'checkbox' }),
  };
  const fillTypes = () => {
    const cur = f.jenis.value || existing?.jenis || '';
    const names = tp.map((t) => t.jenis);
    if (existing && !names.includes(existing.jenis)) names.push(existing.jenis); // jenis lama yang dah tak aktif
    append(clear(f.jenis), el('option', { value: '' }, 'Pilih jenis'), names.map((n) => el('option', { value: n }, n)));
    f.jenis.value = cur;
  };
  fillTypes();
  f.keterangan.value = existing?.keterangan || '';
  f.siang.checked = /siang/.test(existing?.sesi_makan || '');
  f.malam.checked = /malam/.test(existing?.sesi_makan || '');
  const sesiBox = el('fieldset', { class: 'field', style: 'border:0;padding:0;margin:0' },
    el('legend', { class: 'label' }, 'Sesi makan', el('span', { class: 'req' }, ' *')),
    el('div', { class: 'row' }, el('label', { class: 'check' }, f.siang, 'Siang'), el('label', { class: 'check' }, f.malam, 'Malam')));
  const typeHint = el('div', { class: 'alert alert-info', hidden: true });
  const picker = receiptPicker({ claimId, existing: existing?.bil_resit || 0 });
  const err = errBox();
  const type = () => tp.find((x) => x.jenis === f.jenis.value) || (existing && f.jenis.value === existing.jenis ? { jenis: existing.jenis, perlu_resit: true } : undefined);
  // Baki tahunan: amaun tuntutan ini sendiri (jika dah dikira) dikembalikan. HR: baki ialah milik staf, disemak di server.
  const counted = existing && ['Dihantar', 'Lulus', 'Dibayar'].includes(existing.status);
  const baki = (t) => {
    if (mode === 'admin' || !t?.had_tahunan_rm) return null;
    const back = counted && existing.jenis === t.jenis && existing.tarikh.slice(0, 4) === t.tahun ? existing.amaun_rm : 0;
    return Math.round((t.baki_rm + back) * 100) / 100;
  };
  const sebabUbah = el('textarea', { class: 'input', rows: 2, maxlength: 300, placeholder: 'Contoh: Staf tersilap taip amaun, disahkan dengan resit' });
  const sesi = () => (f.siang.checked && f.malam.checked ? 'siang+malam' : f.siang.checked ? 'siang' : f.malam.checked ? 'malam' : '');

  const updateHint = () => {
    const t = type();
    sesiBox.hidden = !t?.guna_sesi_makan;
    const parts = [];
    if (t?.guna_sesi_makan) {
      const k = t.kadar_makan;
      parts.push(`Had makan setiap pax: Siang ${formatRM(k.siang)}, Malam ${formatRM(k.malam)}, Siang + Malam ${formatRM(k.kedua)}.`);
      const cap = mealCap(t, sesi(), Number(f.pax.value) || 0);
      if (cap !== null) parts.push(`Had tuntutan ini: ${formatRM(cap)}.`);
    }
    if (baki(t) !== null) parts.push(`Baki ${t.jenis} ${t.tahun}: ${formatRM(baki(t))} daripada ${formatRM(t.had_tahunan_rm)}.`);
    if (t?.had_rm) parts.push(`Had setiap tuntutan: ${formatRM(t.had_rm)}.`);
    if (t && !t.perlu_resit) parts.push('Resit tak wajib untuk jenis ini.');
    clear(typeHint).append(parts.join(' '));
    typeHint.hidden = !parts.length;
  };
  [f.jenis, f.siang, f.malam].forEach((x) => x.addEventListener('change', updateHint));
  f.pax.addEventListener('input', updateHint);
  f.tarikh.addEventListener('change', async () => {
    const y = (f.tarikh.value || '').slice(0, 4);
    if (/^\d{4}$/.test(y) && y !== (tp.find((t) => t.tahun)?.tahun || y)) { tp = await loadTypes(y); fillTypes(); }
    updateHint();
  });
  updateHint();

  const clientCheck = (hantar) => {
    const t = type();
    const pax = Number(f.pax.value);
    const amt = Number(f.amaun.value);
    if (!t) return 'Pilih jenis tuntutan';
    if (!f.tarikh.value) return 'Isi tarikh perbelanjaan';
    if (!Number.isInteger(pax) || pax < 1 || pax > 100) return 'Pax mesti nombor bulat 1 hingga 100';
    if (!amt || amt <= 0) return 'Isi amaun lebih daripada 0';
    if (amt > MAX_AMOUNT) return `Amaun maksimum ${formatRM(MAX_AMOUNT)}`;
    if (t.guna_sesi_makan && !sesi()) return 'Pilih sesi makan (Siang / Malam)';
    const cap = mealCap(t, sesi(), pax);
    if (cap !== null && amt > cap + 0.001) return `Melebihi had makan ${formatRM(cap)}`;
    if (baki(t) !== null && amt > baki(t) + 0.001) return `Melebihi baki ${t.jenis} ${t.tahun} (${formatRM(baki(t))})`;
    if (!f.keterangan.value.trim()) return 'Isi keterangan';
    if (mode === 'admin' && sebabUbah.value.trim().length < 3) return 'Isi sebab perubahan (staf akan dimaklumkan)';
    if (hantar && t.perlu_resit && picker.count() === 0) return 'Sekurang-kurangnya satu resit diperlukan';
    return '';
  };

  async function save(hantar, btn) {
    err.hidden = true;
    // Dihantar & admin: resit wajib kekal (status bukan Draf)
    const bad = clientCheck(hantar || mode === 'Dihantar' || (mode === 'admin' && existing.status !== 'Draf'));
    if (bad) { showErr(err, new Error(bad)); return; }
    if (hantar && !(await confirmDialog(mode === 'Ditolak' ? 'Hantar semula?' : 'Hantar tuntutan?',
      `RM ${Number(f.amaun.value).toFixed(2)} (${f.jenis.value}). Anda masih boleh betulkan selagi belum diluluskan.`, { okLabel: 'Hantar' }))) return;
    await busy(btn, async () => {
      try {
        const base = { jenis: f.jenis.value, tarikh: f.tarikh.value, pax: Number(f.pax.value), sesi_makan: sesi(), keterangan: f.keterangan.value, amaun_rm: f.amaun.value };
        const groups = batches(picker.files());
        let id = claimId || undefined;
        let c;
        for (let i = 0; i < groups.length; i++) {
          const last = i === groups.length - 1;
          c = await call('saveClaim', {
            ...base, claim_id: id, resit: groups[i].map((x) => ({ data: x.data })),
            buang_resit: i === 0 && picker.removedIdx().length ? picker.removedIdx() : undefined, hantar: last && hantar,
            sebab_ubah: mode === 'admin' ? sebabUbah.value : undefined,
          });
          id = c.claim_id;
          if (groups.length > 1 && !last) toast(`Muat naik fail ${i + 1}/${groups.length}...`, 'info', 2000);
        }
        const msg = mode === 'admin' ? `${c.claim_id} dikemas kini. Staf dimaklumkan.`
          : hantar ? `${c.claim_id} dihantar untuk kelulusan.` : mode === 'Dihantar' ? `${c.claim_id} dibetulkan. Masih menunggu kelulusan.` : `Draf ${c.claim_id} disimpan.`;
        toast(msg, 'success');
        location.hash = hantar || mode === 'admin' || mode === 'Dihantar' ? '#/c/' + encodeURIComponent(c.claim_id) : '#/';
      } catch (e) { showErr(err, e); }
    });
  }
  const simpanSahaja = mode === 'Dihantar' || mode === 'admin';
  const draf = el('button', { class: 'btn btn-secondary', type: 'button', hidden: simpanSahaja }, icon('save'), 'Simpan draf');
  const hantar = el('button', { class: 'btn', type: 'button' }, icon('check'), simpanSahaja ? 'Simpan perubahan' : mode === 'Ditolak' ? 'Hantar semula' : 'Hantar');
  draf.addEventListener('click', () => save(false, draf));
  hantar.addEventListener('click', () => save(!simpanSahaja, hantar));
  const del = existing ? el('button', { class: 'btn btn-ghost', type: 'button' }, icon('x'), mode === 'Draf' ? 'Padam draf' : 'Padam tuntutan') : null;
  del?.addEventListener('click', () => (mode === 'admin' ? adminDelete(existing) : ownerDelete(existing, err)));

  const notes = {
    Dihantar: el('div', { class: 'alert alert-info' }, 'Tuntutan ini sedang menunggu kelulusan. Perubahan disimpan terus dan status kekal Dihantar.'),
    Ditolak: el('div', { class: 'alert alert-danger' }, 'Ditolak: ', existing?.sebab_tolak || '-', '. Betulkan dan hantar semula, atau simpan sebagai draf.'),
    admin: el('div', { class: 'alert alert-warning' }, `Anda mengubah tuntutan ${existing?.staff_name} (${existing?.staff_id}) sebagai HR. Status kekal ${existing?.status}. Sebab dan perubahan direkod dalam sejarah, dan staf akan diemel.`),
  };
  const title = { baru: 'Tuntutan baru', Draf: 'Ubah draf ', Dihantar: 'Betulkan ', Ditolak: 'Betulkan ', admin: 'Ubah tuntutan ' }[mode] + (existing ? existing.claim_id : '');

  append(view,
    el('h2', null, title),
    el('form', { class: 'cp-form', onsubmit: (e) => e.preventDefault(), novalidate: true },
      notes[mode] || null,
      err,
      el('div', { class: 'cp-grid' },
        field('Jenis tuntutan', f.jenis, { required: true, cls: 'full' }),
        field('Tarikh perbelanjaan', f.tarikh, { required: true }),
        field('Pax', f.pax, { required: true }),
        el('div', { class: 'full' }, sesiBox),
        field('Amaun (RM)', f.amaun, { required: true, cls: 'full' })),
      typeHint,
      field('Keterangan', f.keterangan, { required: true, hint: 'Maksimum 500 aksara.' }),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Resit'), picker.node),
      mode === 'admin' ? field('Sebab perubahan', sebabUbah, { required: true, hint: 'Staf akan nampak sebab ini dalam emel dan sejarah tuntutan.' }) : null,
      el('div', { class: 'row' }, hantar, draf, del)));
}

async function ownerDelete(c, err) {
  const draf = c.status === 'Draf';
  if (!(await confirmDialog(draf ? 'Padam draf?' : `Padam ${c.claim_id}?`, `${draf ? 'Draf' : 'Tuntutan'} dan resitnya akan dipadam.${c.status === 'Dihantar' ? ' Tuntutan ditarik balik daripada senarai kelulusan.' : ''}`, { danger: true, okLabel: 'Padam' }))) return;
  try { await call('deleteClaim', { claim_id: c.claim_id }); toast(draf ? 'Draf dipadam.' : `${c.claim_id} dipadam.`, 'success'); location.hash = '#/'; } catch (e) { showErr(err, e); }
}

/** HR padam tuntutan staf: sebab wajib, resit disimpan sebagai bukti, staf diemel. */
function adminDelete(c) {
  const why = el('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Contoh: Tuntutan berganda dengan CLM-2026-00012' });
  const err = errBox();
  openModal({
    title: 'Padam ' + c.claim_id,
    body: el('div', { class: 'stack' }, err,
      el('p', null, `${c.staff_name} · ${c.jenis} · ${formatRM(c.amaun_rm)} · ${c.status}`),
      field('Sebab (wajib)', why, { required: true, hint: 'Staf akan diemel. Resit dan bukti disimpan dalam Drive sebagai rekod.' })),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Padam tuntutan', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
        try {
          await call('deleteClaim', { claim_id: c.claim_id, sebab: why.value });
          close();
          toast(`${c.claim_id} dipadam. Staf dimaklumkan.`, 'success');
          location.hash = '#/laporan';
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ butiran + S-53 sahkan terima bayaran
async function renderDetail(id) {
  const c = await call('getClaim', { claim_id: id });
  const kv = (k, v) => [el('dt', null, k), el('dd', null, v === null || v === undefined || v === '' ? '-' : v)];
  const overdue = c.status === 'Lulus' && c.hari_lulus !== null && c.hari_lulus >= REMIND_DAYS;
  const receipts = Array.from({ length: c.bil_resit }, (_, i) => el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => viewFile(c.claim_id, 'resit', i) }, icon('receipt'), `Resit ${i + 1}`));
  append(view,
    el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: c.milik_saya ? '#/' : '#/laporan/bayar' }, icon('arrow-left'), 'Kembali')),
    el('div', { class: 'row-between' }, el('h2', { style: 'margin:0' }, c.claim_id), el('div', { class: 'chips' }, badge(c.status, STATUS_KIND[c.status]), paidBadge(c))),
    el('section', { class: 'card stack' },
      el('dl', { class: 'kv' },
        kv('Staf', `${c.staff_name} (${c.staff_id}) · ${c.department}`),
        kv('Jenis', c.jenis + (c.sesi_makan ? ` (${SESI_LABEL[c.sesi_makan]})` : '')),
        kv('Tarikh perbelanjaan', formatDate(c.tarikh)), kv('Pax', c.pax), kv('Keterangan', c.keterangan),
        kv('Amaun', el('strong', { class: 'num' }, formatRM(c.amaun_rm))),
        kv('Dihantar', c.submitted_at ? formatDateTime(c.submitted_at) : null),
        c.approved_at ? kv(c.status === 'Ditolak' ? 'Ditolak oleh' : 'Diluluskan oleh', `${c.approved_by_name} · ${formatDateTime(c.approved_at)}`) : null,
        c.sebab_tolak ? kv('Sebab tolak', c.sebab_tolak) : null,
        c.ada_bukti_bayar ? kv('Bayaran syarikat', `${formatRM(c.bayar_jumlah_rm)} pada ${formatDate(c.bayar_tarikh)} · direkod oleh ${c.bayar_oleh_nama}${c.separa ? ' (separa)' : ''}`) : null,
        c.status === 'Dibayar' ? [...kv('Tarikh terima', formatDate(c.received_date)), ...kv('Jumlah diterima', formatRM(c.received_amount_rm))] : null),
      c.beza_bayaran ? el('div', { class: 'alert alert-warning' }, icon('triangle-alert'), 'Jumlah diterima berbeza daripada jumlah diluluskan. Admin telah dimaklumkan.') : null,
      el('div', { class: 'row' },
        receipts,
        c.ada_bukti_bayar ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => viewFile(c.claim_id, 'bayaran') }, icon('scroll-text'), 'Bukti bayaran syarikat') : null,
        c.ada_bukti ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => viewFile(c.claim_id, 'bukti') }, icon('scroll-text'), 'Bukti terima') : null,
        c.boleh_rekod_bayar ? el('button', { class: 'btn', type: 'button', onclick: () => paymentModal([c], route) }, icon('plus'), c.ada_bukti_bayar ? 'Ganti bukti bayaran' : 'Rekod bukti bayaran') : null,
        editLink(c, 'btn btn-secondary'))),
    overdue ? el('div', { class: 'alert alert-warning' }, icon('triangle-alert'), `Diluluskan ${c.hari_lulus} hari lalu. Jika dah terima bayaran, sila sahkan di bawah.`) : null,
    c.boleh_sahkan ? confirmForm(c) : null,
    el('section', { class: 'card' }, el('h3', null, 'Sejarah'),
      el('ol', { class: 'timeline' }, (c.sejarah || []).map((h) => el('li', null,
        el('div', null, el('strong', null, h.dari === h.ke ? h.ke : `${h.dari} → ${h.ke}`), ' oleh ', h.oleh),
        el('div', { class: 't' }, formatDateTime(h.ts)), h.catatan ? el('div', null, h.catatan) : null)))));
}

function confirmForm(c) {
  const date = inp({ type: 'date', max: todayIso(), min: (c.approved_at || '').slice(0, 10), value: c.bayar_tarikh || todayIso() });
  const amount = inp({ type: 'number', inputmode: 'decimal', min: '0', step: '0.01', value: (c.bayar_jumlah_rm ?? c.amaun_rm).toFixed(2) });
  const proof = filePicker({ label: 'Bukti terima', hint: 'Pilihan: tangkap skrin penyata bank.' });
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
    el('p', { class: 'muted' }, 'Hanya anda boleh mengesahkan ini selepas wang masuk ke akaun bank anda.'),
    c.ada_bukti_bayar ? el('div', { class: 'alert alert-info' }, `Syarikat merekod bayaran ${formatRM(c.bayar_jumlah_rm)} pada ${formatDate(c.bayar_tarikh)}.`,
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile(c.claim_id, 'bayaran') }, 'Lihat bukti')) : null,
    err,
    el('div', { class: 'cp-grid' }, field('Tarikh terima', date, { required: true }), field('Jumlah diterima (RM)', amount, { required: true })),
    el('div', { class: 'field' }, el('span', { class: 'label' }, 'Bukti terima (pilihan)'), proof.node), el('div', null, btn));
}

// ------------------------------------------------------------------ rekod bukti bayaran syarikat
/**
 * Satu bukti pindahan untuk satu atau beberapa tuntutan Lulus seorang staf (ikut sistem lama: modal bayaran
 * ikut staf, jumlah setiap tuntutan boleh separa). Status kekal Lulus; staf sahkan terima.
 */
function paymentModal(claims, done) {
  const minDate = claims.map((c) => (c.approved_at || '').slice(0, 10)).sort().pop();
  const date = inp({ type: 'date', max: todayIso(), min: minDate, value: todayIso() });
  const amounts = claims.map((c) => inp({ type: 'number', inputmode: 'decimal', min: '0', max: String(c.amaun_rm), step: '0.01', value: c.amaun_rm.toFixed(2), 'aria-label': 'Jumlah dibayar ' + c.claim_id }));
  const total = el('strong', { class: 'num' });
  const recalc = () => { clear(total).append(formatRM(amounts.reduce((a, x) => a + (Number(x.value) || 0), 0))); };
  amounts.forEach((x) => x.addEventListener('input', recalc));
  recalc();
  const proof = filePicker({ label: 'Bukti bayaran', hint: 'Wajib: slip pindahan bank / bukti bayaran syarikat (JPG, PNG, PDF).' });
  const err = errBox();
  openModal({
    title: claims.length > 1 ? `Rekod bayaran (${claims.length} tuntutan)` : 'Rekod bayaran ' + claims[0].claim_id,
    wide: true,
    body: el('div', { class: 'stack' }, err,
      el('p', { class: 'muted' }, `${claims[0].staff_name} (${claims[0].staff_id}). Selepas direkod, staf diminta sahkan terima. Status kekal Lulus sehingga staf sahkan.`),
      el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['ID', 'Jenis', 'Diluluskan', 'Dibayar (RM)'].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', null, claims.map((c, i) => el('tr', null, el('td', null, c.claim_id), el('td', null, c.jenis), el('td', { class: 'num' }, formatRM(c.amaun_rm)), el('td', null, amounts[i])))))),
      el('div', { class: 'row-between' }, el('span', null, 'Jumlah pindahan: ', total), el('span', { class: 'caption' }, 'Kurang daripada jumlah diluluskan = separa')),
      field('Tarikh bayaran', date, { required: true }),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Bukti bayaran', el('span', { class: 'req' }, ' *')), proof.node)),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan bukti bayaran', onClick: ({ close, button }) => busy(button, async () => {
        err.hidden = true;
        const up = proof.get();
        if (!up) { showErr(err, new Error('Muat naik bukti bayaran dahulu')); return; }
        const bad = claims.find((c, i) => !(Number(amounts[i].value) > 0) || Number(amounts[i].value) > c.amaun_rm + 0.001);
        if (bad) { showErr(err, new Error(`Jumlah ${bad.claim_id} mesti lebih 0 dan tidak melebihi ${formatRM(bad.amaun_rm)}`)); return; }
        try {
          const r = await call('recordPayment', {
            claims: claims.map((c, i) => ({ claim_id: c.claim_id, jumlah_dibayar_rm: amounts[i].value })),
            tarikh_bayar: date.value, bukti: { data: up.data },
          });
          close();
          toast(`Bukti bayaran ${formatRM(r.jumlah_rm)} direkod. Staf dimaklumkan.`, 'success');
          done && done();
        } catch (e) { showErr(err, e); }
      }) },
    ],
  });
}

// ------------------------------------------------------------------ S-52 Kelulusan (admin / ketua)
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
          c.bil_resit ? Array.from({ length: c.bil_resit }, (_, i) => el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => viewFile(c.claim_id, 'resit', i) }, icon('receipt'), c.bil_resit > 1 ? `Resit ${i + 1}` : 'Resit'))
            : el('span', { class: 'caption' }, 'Tiada resit'),
          c.boleh_lulus ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => approve(c) }, icon('check'), 'Lulus') : null,
          c.boleh_lulus ? el('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => reject(c) }, icon('x'), 'Tolak') : el('span', { class: 'badge badge-warning' }, c.sebab_tak_boleh),
        ],
      });
      card.prepend(el('div', { class: 'meta', style: 'margin-bottom:6px' }, `${c.staff_name} (${c.staff_id}) · ${c.department}`));
      return card;
    })));
  };
  function approve(c) {
    const withPay = el('input', { type: 'checkbox' });
    const date = inp({ type: 'date', max: todayIso(), value: todayIso() });
    const amount = inp({ type: 'number', inputmode: 'decimal', min: '0', max: String(c.amaun_rm), step: '0.01', value: c.amaun_rm.toFixed(2) });
    const proof = filePicker({ label: 'Bukti bayaran', hint: 'Slip pindahan bank / bukti bayaran syarikat.' });
    const payBox = el('div', { class: 'stack', hidden: true }, el('div', { class: 'cp-grid' }, field('Tarikh bayaran', date), field('Jumlah dibayar (RM)', amount)), proof.node);
    withPay.addEventListener('change', () => { payBox.hidden = !withPay.checked; });
    const err = errBox();
    openModal({
      title: 'Luluskan ' + c.claim_id,
      body: el('div', { class: 'stack' }, err,
        el('p', null, `${c.staff_name} · ${c.jenis} · ${formatRM(c.amaun_rm)}`),
        el('label', { class: 'check' }, withPay, 'Bayaran dah dibuat: muat naik bukti sekarang'),
        el('p', { class: 'caption' }, 'Jika belum bayar, lulus sahaja. Bukti boleh direkod kemudian di Laporan > Belum dibayar.'),
        payBox),
      actions: [
        { label: 'Batal', class: 'btn-secondary' },
        { label: 'Luluskan', onClick: ({ close, button }) => busy(button, async () => {
          err.hidden = true;
          let bayar;
          if (withPay.checked) {
            const up = proof.get();
            if (!up) { showErr(err, new Error('Muat naik bukti bayaran, atau buang tanda "Bayaran dah dibuat"')); return; }
            bayar = { bukti: { data: up.data }, tarikh_bayar: date.value, jumlah_dibayar_rm: amount.value };
          }
          try {
            await call('decideClaim', { claim_id: c.claim_id, keputusan: 'Lulus', bayar });
            close();
            toast(`${c.claim_id} diluluskan${bayar ? ' dan bayaran direkod' : ''}.`, 'success');
            await load();
          } catch (e) { showErr(err, e); }
        }) },
      ],
    });
  }
  function reject(c) {
    const why = el('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Contoh: Resit tak jelas, sila hantar semula' });
    const err = errBox();
    openModal({
      title: 'Tolak ' + c.claim_id,
      body: el('div', { class: 'stack' }, err, field('Sebab (wajib)', why, { required: true, hint: 'Staf akan nampak sebab ini.' })),
      actions: [
        { label: 'Batal', class: 'btn-secondary' },
        { label: 'Tolak tuntutan', class: 'btn-danger', onClick: ({ close, button }) => busy(button, async () => {
          try { await call('decideClaim', { claim_id: c.claim_id, keputusan: 'Ditolak', sebab: why.value }); close(); toast(`${c.claim_id} ditolak.`, 'success'); await load(); } catch (e) { showErr(err, e); }
        }) },
      ],
    });
  }
  await load();
}

// ------------------------------------------------------------------ S-54 Laporan (admin / ketua)
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // elak formula injection bila dibuka dalam Excel
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function saveText(name, text) {
  const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCsv(name, rows) {
  const head = ['ID', 'No. pekerja', 'Nama', 'Department', 'Tarikh', 'Jenis', 'Sesi makan', 'Pax', 'Keterangan', 'Amaun RM', 'Bil. resit', 'Status',
    'Diluluskan oleh', 'Tarikh bayaran syarikat', 'Dibayar syarikat RM', 'Tarikh terima', 'Diterima RM', 'Beza bayaran'];
  const money = (v) => (v === null || v === undefined ? '' : Number(v).toFixed(2));
  const lines = [head, ...rows.map((c) => [c.claim_id, c.staff_id, c.staff_name, c.department, c.tarikh, c.jenis, SESI_LABEL[c.sesi_makan] || '', c.pax, c.keterangan,
    money(c.amaun_rm), c.bil_resit, c.status, c.approved_by_name, c.bayar_tarikh, money(c.bayar_jumlah_rm), c.received_date, money(c.received_amount_rm), c.beza_bayaran ? 'Ya' : ''])];
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
  const dari = inp({ type: 'date', value: todayIso().slice(0, 8) + '01', max: todayIso() });
  const hingga = inp({ type: 'date', value: todayIso(), max: todayIso() });
  const jenis = el('select', { class: 'input' }, [el('option', { value: '' }, 'Semua jenis'), ...tp.map((t) => el('option', { value: t.jenis }, t.jenis))]);
  const status = el('select', { class: 'input' }, [['', 'Semua status'], ['Dihantar', 'Dihantar'], ['Lulus', 'Lulus'], ['Ditolak', 'Ditolak'], ['Dibayar', 'Dibayar']].map(([v, t]) => el('option', { value: v }, t)));
  const go = el('button', { class: 'btn', type: 'button' }, icon('search'), 'Tapis');
  const csv = el('button', { class: 'btn btn-secondary', type: 'button', disabled: true }, icon('download'), 'Eksport CSV');
  const csvFull = el('button', { class: 'btn btn-ghost', type: 'button', disabled: true }, icon('download'), 'CSV semua lajur');
  const pdf = el('button', { class: 'btn btn-secondary', type: 'button', disabled: true }, icon('download'), 'PDF untuk pengurusan');
  const out = el('div', { class: 'stack' });
  let last = [];
  let lastR = null;
  let used = {};
  const tempoh = () => (used.dari || used.hingga ? `${used.dari ? formatDate(used.dari) : 'awal'} hingga ${used.hingga ? formatDate(used.hingga) : 'kini'}` : 'Semua tarikh');
  const penapis = () => [used.jenis && `jenis ${used.jenis}`, used.status && `status ${used.status}`].filter(Boolean);
  const staffPdf = (claims, btn) => busy(btn, async () => {
    try { await exportStaffPdf({ claims }); } catch (e) { toast(e.message, 'danger'); }
  });
  const run = () => busy(go, async () => {
    try {
      used = { dari: dari.value, hingga: hingga.value, jenis: jenis.value, status: status.value };
      const r = await call('claimReport', used);
      last = r.tuntutan;
      lastR = r;
      csv.disabled = !last.length;
      csvFull.disabled = !last.length;
      pdf.disabled = !last.length;
      const groups = groupByStaff(last);
      clear(out);
      append(out,
        el('div', { class: 'cp-stats' },
          el('div', { class: 'cp-stat' }, el('div', { class: 'label' }, 'Bilangan'), el('div', { class: 'v' }, String(r.bilangan))),
          el('div', { class: 'cp-stat' }, el('div', { class: 'label' }, 'Jumlah'), el('div', { class: 'v' }, formatRM(r.jumlah_rm))),
          el('div', { class: 'cp-stat ' + (r.beza_bayaran ? 'warn' : '') }, el('div', { class: 'label' }, 'Beza bayaran'), el('div', { class: 'v' }, String(r.beza_bayaran)))),
        r.terpotong ? el('div', { class: 'alert alert-warning' }, 'Hanya 2,000 baris pertama dipapar. Tapis lebih spesifik.') : null,
        groups.length ? el('section', { class: 'stack' }, el('h3', { style: 'margin:8px 0 0' }, 'Ringkasan ikut staf'),
          el('p', { class: 'caption', style: 'margin:0' }, 'Kasar, dibayar dan baki tidak termasuk tuntutan Ditolak. Dibayar = jumlah diterima staf, atau bayaran yang direkod syarikat.'),
          el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
            el('thead', null, el('tr', null, ['Staf', 'Bil.', 'Kasar', 'Dibayar', 'Baki', ''].map((h) => el('th', { scope: 'col' }, h)))),
            el('tbody', null, groups.map((g) => {
              const b = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('download'), 'PDF');
              b.addEventListener('click', () => staffPdf(g.tuntutan, b));
              // sistem lama: exportSingleAdminCSV
              const bc = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => saveText(`Laporan_${String(g.staff_name).replace(/\s+/g, '_')}_${todayIso()}.csv`, oldFormatCsv(g.tuntutan, { single: true })) }, icon('download'), 'CSV');
              return el('tr', null,
                el('td', { 'data-label': 'Staf' }, `${g.staff_name} (${g.staff_id || '-'}) · ${g.department || '-'}`),
                el('td', { 'data-label': 'Bil.', class: 'num' }, String(g.bilangan)),
                el('td', { 'data-label': 'Kasar', class: 'num' }, formatRM(g.kasar)),
                el('td', { 'data-label': 'Dibayar', class: 'num' }, formatRM(g.dibayar)),
                el('td', { 'data-label': 'Baki', class: 'num' }, formatRM(g.baki)),
                el('td', { class: 'actions' }, el('div', { class: 'row', style: 'gap:4px;flex-wrap:nowrap;justify-content:flex-end' }, b, bc)));
            }))))) : null,
        r.tuntutan.length ? el('h3', { style: 'margin:8px 0 0' }, 'Senarai tuntutan') : null,
        r.tuntutan.length ? el('div', { class: 'table-wrap responsive' }, el('table', { class: 'table' },
          el('thead', null, el('tr', null, ['ID', 'Staf', 'Tarikh', 'Jenis', 'Amaun', 'Status', ''].map((h) => el('th', { scope: 'col' }, h)))),
          el('tbody', null, r.tuntutan.map((c) => el('tr', null,
            el('td', { 'data-label': 'ID' }, el('a', { href: '#/c/' + encodeURIComponent(c.claim_id) }, c.claim_id)),
            el('td', { 'data-label': 'Staf' }, `${c.staff_name} (${c.department})`),
            el('td', { 'data-label': 'Tarikh' }, formatDate(c.tarikh)), el('td', { 'data-label': 'Jenis' }, c.jenis),
            el('td', { 'data-label': 'Amaun', class: 'num' }, formatRM(c.amaun_rm)),
            el('td', { 'data-label': 'Status' }, el('div', { class: 'chips' }, badge(c.status, STATUS_KIND[c.status]), paidBadge(c), c.beza_bayaran ? badge('Beza', 'warning') : null)),
            el('td', { class: 'actions' }, el('a', { class: 'btn btn-secondary btn-sm', href: '#/c/' + encodeURIComponent(c.claim_id) }, 'Buka'), editLink(c))))))) : emptyState('scroll-text', 'Tiada tuntutan sepadan.'));
    } catch (e) { clear(out).append(el('div', { class: 'alert alert-danger' }, e.message)); }
  });
  go.addEventListener('click', run);
  // Sistem lama exportAdminCSV: Laporan_Terperinci_HR_<tarikh>.csv
  csv.addEventListener('click', () => saveText(`Laporan_Terperinci_HR_${todayIso()}.csv`, oldFormatCsv(last)));
  csvFull.addEventListener('click', () => downloadCsv(`ClaimPro_${used.dari || 'awal'}_${used.hingga || 'kini'}.csv`, last));
  pdf.addEventListener('click', () => busy(pdf, async () => {
    try { await exportReportPdf({ claims: last, tempoh: tempoh(), penapis: penapis(), oleh: ctx.me?.staff?.nama || 'Admin HR', terpotong: lastR?.terpotong }); } catch (e) { toast(e.message, 'danger'); }
  }));
  append(host, el('div', { class: 'cp-grid' }, field('Dari (tarikh perbelanjaan)', dari), field('Hingga', hingga), field('Jenis', jenis), field('Status', status)),
    el('div', { class: 'row', style: 'margin:12px 0' }, go, pdf, csv, csvFull), out);
  await run();
}

/** "Belum dibayar": dikumpul ikut staf (macam sistem lama), pilih beberapa tuntutan, rekod satu bukti bayaran. */
async function renderToPay(host) {
  const r = await call('listToPay');
  const groups = new Map();
  r.tuntutan.forEach((c) => { const k = `${c.staff_id}|${c.staff_name}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  append(host,
    el('p', { class: 'muted' }, 'Tuntutan diluluskan yang staf belum sahkan terima. Selepas buat pindahan wang, pilih tuntutan dan muat naik bukti bayaran sebagai evidence. Tuntutan keluar dari senarai bila staf sahkan terima.'),
    el('div', { class: 'cp-stats' },
      el('div', { class: 'cp-stat warn' }, el('div', { class: 'label' }, 'Jumlah belum dibayar / disahkan'), el('div', { class: 'v' }, formatRM(r.jumlah_rm))),
      el('div', { class: 'cp-stat' }, el('div', { class: 'label' }, 'Bilangan'), el('div', { class: 'v' }, String(r.tuntutan.length))),
      el('div', { class: 'cp-stat ' + (r.tanpa_bukti_bayar ? 'warn' : 'ok') }, el('div', { class: 'label' }, 'Belum ada bukti bayaran'), el('div', { class: 'v' }, String(r.tanpa_bukti_bayar)))));
  if (!r.tuntutan.length) { host.append(emptyState('circle-check', 'Tiada tuntutan menunggu pembayaran.')); return; }
  const list = el('div', { class: 'cp-list', style: 'margin-top:16px' });
  for (const [, claims] of groups) {
    const boxes = claims.map((c) => el('input', { type: 'checkbox', disabled: !c.boleh_rekod_bayar, checked: c.boleh_rekod_bayar && !c.ada_bukti_bayar, 'aria-label': 'Pilih ' + c.claim_id }));
    const btn = el('button', { class: 'btn btn-sm', type: 'button' }, icon('plus'), 'Rekod bayaran');
    const sync = () => { const n = boxes.filter((b) => b.checked).length; btn.disabled = !n; clear(btn).append(icon('plus'), n ? `Rekod bayaran (${n})` : 'Rekod bayaran'); };
    boxes.forEach((b) => b.addEventListener('change', sync));
    btn.addEventListener('click', () => paymentModal(claims.filter((_, i) => boxes[i].checked), () => { clear(host); renderToPay(host); }));
    sync();
    const total = claims.reduce((a, c) => a + c.amaun_rm, 0);
    list.append(el('article', { class: 'cp-card' },
      el('div', { class: 'top' }, el('div', null, el('strong', null, claims[0].staff_name), el('div', { class: 'meta' }, `${claims[0].staff_id} · ${claims[0].department} · ${claims.length} tuntutan`)),
        el('div', { class: 'amt' }, formatRM(total))),
      el('ul', { class: 'file-list', style: 'margin-top:8px' }, claims.map((c, i) => el('li', null,
        el('label', { class: 'check grow' }, boxes[i], el('span', null, el('a', { href: '#/c/' + encodeURIComponent(c.claim_id) }, c.claim_id), ` · ${c.jenis} · ${formatRM(c.amaun_rm)} · ${c.hari_lulus} hari`)),
        c.ada_bukti_bayar ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => viewFile(c.claim_id, 'bayaran') }, paidBadge(c)) : badge('Belum ada bukti', 'warning'),
        c.boleh_rekod_bayar ? null : el('span', { class: 'caption' }, 'Head of HR sahaja')))),
      el('div', { class: 'row' }, btn)));
  }
  host.append(list);
}

async function renderTypes(host) {
  const draw = async () => {
    const tp = await loadTypes();
    clear(host);
    append(host,
      el('div', { class: 'row-between' }, el('p', { class: 'muted', style: 'margin:0' }, 'Jenis tuntutan yang staf boleh pilih. Had dan keperluan resit disemak di server. Kadar sesi makan diubah dalam tab Settings Sheet VP-ClaimPro.'),
        el('button', { class: 'btn', type: 'button', onclick: () => typeModal(null, draw) }, icon('plus'), 'Jenis baharu')),
      el('div', { class: 'table-wrap responsive', style: 'margin-top:16px' }, el('table', { class: 'table' },
        el('thead', null, el('tr', null, ['Jenis', 'Had setiap tuntutan', 'Had tahunan', 'Sesi makan', 'Resit', 'Status', ''].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', null, tp.map((t) => el('tr', null,
          el('td', { 'data-label': 'Jenis' }, el('strong', null, t.jenis)),
          el('td', { 'data-label': 'Had setiap tuntutan', class: 'num' }, t.had_rm ? formatRM(t.had_rm) : '-'),
          el('td', { 'data-label': 'Had tahunan', class: 'num' }, t.had_tahunan_rm ? formatRM(t.had_tahunan_rm) : '-'),
          el('td', { 'data-label': 'Sesi makan' }, t.guna_sesi_makan ? `Siang ${formatRM(t.kadar_makan.siang)} · Malam ${formatRM(t.kadar_makan.malam)} · Kedua ${formatRM(t.kadar_makan.kedua)}` : '-'),
          el('td', { 'data-label': 'Resit' }, t.perlu_resit ? 'Wajib' : 'Tak wajib'),
          el('td', { 'data-label': 'Status' }, badge(t.aktif ? 'Aktif' : 'Tak aktif', t.aktif ? 'success' : '')),
          el('td', { class: 'actions' }, el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => typeModal(t, draw) }, icon('pencil'), 'Ubah'))))))));
  };
  await draw();
}

function typeModal(t, done) {
  const nama = inp({ value: t?.jenis || '', maxlength: 40, disabled: Boolean(t) });
  const had = inp({ type: 'number', inputmode: 'decimal', min: '0', step: '0.01', value: t?.had_rm ?? '', placeholder: 'Kosong = tiada had' });
  const hadTahunan = inp({ type: 'number', inputmode: 'decimal', min: '0', step: '0.01', value: t?.had_tahunan_rm ?? '', placeholder: 'Kosong = tiada had' });
  const sesi = el('input', { type: 'checkbox', checked: t ? t.guna_sesi_makan : false });
  const resit = el('input', { type: 'checkbox', checked: t ? t.perlu_resit : true });
  const aktif = el('input', { type: 'checkbox', checked: t ? t.aktif : true });
  const err = errBox();
  openModal({
    title: t ? 'Ubah ' + t.jenis : 'Jenis tuntutan baharu',
    body: el('div', { class: 'stack' }, err,
      field('Nama jenis', nama, { required: true, hint: t ? 'Nama tak boleh ditukar (tuntutan lama merujuknya).' : '' }),
      field('Had setiap tuntutan (RM)', had),
      field('Had tahunan setiap staf (RM)', hadTahunan, { hint: 'Contoh: Perubatan RM350 setahun (sistem lama). Dikira ikut tahun tarikh perbelanjaan.' }),
      el('label', { class: 'check' }, sesi, 'Had ikut sesi makan (Siang / Malam) x pax'),
      el('label', { class: 'check' }, resit, 'Resit wajib semasa hantar'),
      el('label', { class: 'check' }, aktif, 'Aktif (staf boleh pilih)')),
    actions: [
      { label: 'Batal', class: 'btn-secondary' },
      { label: 'Simpan', onClick: ({ close, button }) => busy(button, async () => {
        try {
          await call('saveClaimType', { jenis: nama.value, had_rm: had.value, had_tahunan_rm: hadTahunan.value, guna_sesi_makan: sesi.checked, perlu_resit: resit.checked, aktif: aktif.checked });
          close(); toast('Jenis disimpan.', 'success'); done();
        } catch (e) { showErr(err, e); }
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
