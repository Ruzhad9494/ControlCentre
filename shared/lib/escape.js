// shared/lib/escape.js - bina DOM dengan selamat (TRD 6 #6: textContent sahaja untuk data).
// JANGAN guna innerHTML dengan data. Guna el() di bawah.

/**
 * el('a', { href: '/x', class: 'btn', onclick: fn, dataset: { id: 1 } }, 'teks', childNode, [lebih])
 * - String/number anak -> nod teks (tak pernah ditafsir sebagai HTML)
 * - Atribut on* hanya terima fungsi
 */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'text') node.textContent = String(v);
      else if (k.startsWith('on')) {
        if (typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'href' || k === 'src') {
        node.setAttribute(k, safeUrl(v));
      } else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, String(v));
    }
  }
  append(node, children);
  return node;
}

export function append(parent, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function setText(node, value) {
  node.textContent = value === null || value === undefined ? '' : String(value);
  return node;
}

/**
 * Halang javascript:/data: dalam href/src. Laluan relatif, http(s), mailto, tel dan
 * blob: (URL tempatan yang dijana browser sendiri, contoh gambar canvas) dibenarkan.
 */
export function safeUrl(v) {
  const s = String(v).trim();
  if (/^(https?:|mailto:|tel:|blob:|\/|#|\.|\?)/i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return '#';
}

/** Untuk kes jarang perlu rentetan HTML (contoh atribut title). */
export function escapeHtml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
