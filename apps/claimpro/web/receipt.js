// receipt.js - sediakan fail resit/bukti di browser (BSD 5: JPG/PNG/HEIC/PDF, maksimum 8MB).
// Foto telefon dikecilkan (maks 1600px, JPEG 0.82) supaya muat naik laju di data mudah alih;
// PDF dan imej yang tak boleh dinyahkod dihantar asal. Pelayan tetap sahkan jenis dari ISI fail.

export const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 1600;

export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error('Fail tak dapat dibaca'));
    fr.readAsDataURL(blob);
  });
}

async function shrinkImage(file) {
  if (typeof createImageBitmap !== 'function') return file;
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file; // contoh HEIC pada pelayar yang tak boleh nyahkod
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type === 'image/jpeg') { bmp.close?.(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  return out && out.size < file.size ? out : file;
}

/** Pulang { data(base64), blob, mime, size, nama } atau buang Error dengan mesej untuk staf. */
export async function prepareFile(file) {
  if (!file) throw new Error('Tiada fail dipilih');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(jpe?g|png|heic|heif)$/i.test(file.name);
  if (!isPdf && !isImg) throw new Error('Hanya gambar (JPG, PNG, HEIC) atau PDF dibenarkan');
  const blob = isPdf ? file : await shrinkImage(file);
  if (blob.size > MAX_BYTES) throw new Error('Fail melebihi 8MB. Ambil gambar semula dengan resolusi lebih rendah.');
  return { data: await toBase64(blob), blob, mime: blob.type || file.type, size: blob.size, nama: file.name };
}
