// outbox.js - barisan GWR offline (F-31; AFD S-31). Ikut sistem lama v4.2 (IndexedDB "voltakeGWR", gambar naik
// 3 sekali, kemajuan disimpan selepas setiap kumpulan, clientReqId anti-ulangan).
// Setiap kerja: { id, type: 'save'|'submit', label, report_id?, client_req_id, fields, susunan?, images: [{data, desc, batch?, done}],
//   signature?, staff_position?, submit_id, step, status: 'pending'|'sending'|'gagal', error?, attempts, createdAt }
// Ralat rangkaian / 5xx / 429: cuba lagi kemudian. Ralat 4xx lain: ditanda 'gagal' (perlu tindakan pengguna).

const DB = 'voltake-gwr';
const STORE = 'jobs';
const BATCH = 3;
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}
export const put = (job) => tx('readwrite', (s) => s.put(job));
export const del = (id) => tx('readwrite', (s) => s.delete(id));
export const all = () => tx('readonly', (s) => s.getAll()).then((r) => (r || []).sort((a, b) => a.createdAt - b.createdAt));
export async function available() { try { await open(); return true; } catch { return false; } }

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9-]/g, '');

export async function enqueue(job) {
  const j = { attempts: 0, status: 'pending', createdAt: Date.now(), step: 'save', ...job, id: job.id || uid() };
  j.images = (j.images || []).map((im) => ({ ...im, done: !!im.done }));
  await put(j);
  return j;
}

const retryable = (e) => !e.status || e.status >= 500 || e.status === 429 || e.status === 0;

/** Hantar satu kerja. call(action, payload) = api GWR. onProgress(teks). Pulang hasil submit (jika ada). */
async function run(job, call, onProgress) {
  if (job.step === 'save') {
    onProgress('Menyimpan maklumat...');
    const body = { ...job.fields };
    if (job.report_id) body.report_id = job.report_id; else body.client_req_id = job.client_req_id;
    if (job.susunan) body.gambar_susunan = job.susunan;
    const r = await call('saveReport', body);
    job.report_id = r.report_id;
    job.step = 'images';
    await put(job);
  }
  if (job.step === 'images') {
    const pending = job.images.filter((im) => !im.done);
    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH);
      const batch = chunk[0].batch || uid();
      chunk.forEach((im) => { im.batch = batch; });
      await put(job);
      onProgress(`Naik gambar ${Math.min(i + chunk.length, pending.length)} / ${pending.length}`);
      await call('addImages', { report_id: job.report_id, batch_id: batch, images: chunk.map((im) => ({ data: im.data, desc: im.desc })) });
      chunk.forEach((im) => { im.done = true; im.data = ''; });
      await put(job);
    }
    job.step = job.type === 'submit' ? 'submit' : 'done';
    await put(job);
  }
  if (job.step === 'submit') {
    onProgress('Menjana PDF & pautan klien...');
    const r = await call('submitReport', { report_id: job.report_id, submit_id: job.submit_id, tandatangan: { data: job.signature }, staff_position: job.staff_position });
    job.step = 'done';
    return r;
  }
  return { report_id: job.report_id };
}

let running = false;
/** Hantar semua kerja tertunggak ikut turutan. onDone(job, hasil) dipanggil setiap kerja berjaya. */
export async function flush(call, { onProgress = () => {}, onDone = () => {}, onChange = () => {}, manual = false } = {}) {
  if (running) return;
  if (!navigator.onLine && !manual) return;
  running = true;
  try {
    for (const job of await all()) {
      if (job.status === 'gagal' && !manual) continue;
      job.status = 'sending';
      await put(job); onChange();
      try {
        const res = await run(job, call, onProgress);
        await del(job.id);
        onDone(job, res);
      } catch (e) {
        job.attempts = (job.attempts || 0) + 1;
        job.error = e.message || String(e);
        job.status = retryable(e) ? 'pending' : 'gagal';
        await put(job);
        if (retryable(e)) break;   // rangkaian bermasalah: berhenti, cuba lagi kemudian
      } finally {
        onChange();
      }
    }
  } finally {
    running = false;
    onProgress('');
  }
}
