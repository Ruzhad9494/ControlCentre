// S-01 Login (F-01; TRD 5.1). Butang rasmi Google Identity Services, ux_mode redirect.
import { getMe, takeNext } from '/shared/lib/api.js';
import { el, clear } from '/shared/lib/escape.js';
import { renderPrivacy } from '/shared/lib/privacy.js';
import { registerSW } from '/shared/ui/components.js';

const MESSAGES = {
  rate: ['danger', 'Terlalu banyak percubaan log masuk. Tunggu 5 minit dan cuba lagi.'],
  csrf: ['warning', 'Sesi log masuk tamat. Sila tekan butang Google sekali lagi.'],
  token: ['danger', 'Log masuk Google tidak berjaya disahkan. Cuba lagi.'],
  server: ['danger', 'Pelayan tidak dapat dihubungi. Cuba lagi sebentar. Jika berterusan, hubungi IT.'],
};

const params = new URLSearchParams(location.search);
const msgBox = document.getElementById('msg');

function showMsg(kind, text) {
  msgBox.className = 'alert alert-' + kind;
  clear(msgBox).append(text);
  msgBox.hidden = false;
}

document.getElementById('privacy').append(renderPrivacy({ heading: false }));
registerSW();

const code = params.get('e');
if (code && MESSAGES[code]) showMsg(...MESSAGES[code]);
if (params.get('keluar')) showMsg('info', 'Anda telah log keluar.');

// Sudah log masuk? Terus ke dashboard / halaman asal.
getMe({ redirect: false }).then(() => location.replace(takeNext() || '/')).catch(() => {});

function waitForGis(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (window.google && window.google.accounts && window.google.accounts.id) return resolve(window.google.accounts.id);
      if (Date.now() - t0 > timeoutMs) return reject(new Error('GIS tidak dimuatkan'));
      setTimeout(poll, 100);
    })();
  });
}

async function start() {
  const slot = document.getElementById('gsi');
  let cfg;
  try {
    const res = await fetch('/auth/config', { credentials: 'same-origin' });
    cfg = await res.json();
    if (!res.ok || !cfg.client_id) throw new Error(cfg.error || 'config');
  } catch {
    clear(slot);
    showMsg('danger', 'Log masuk belum dikonfigurasi (GOOGLE_CLIENT_ID). Hubungi IT.');
    return;
  }
  let gis;
  try {
    gis = await waitForGis();
  } catch {
    clear(slot);
    showMsg('danger', 'Butang Google tidak dapat dimuatkan. Semak sambungan internet atau penyekat iklan, kemudian muat semula.');
    return;
  }
  gis.initialize({
    client_id: cfg.client_id,
    ux_mode: 'redirect',
    login_uri: location.origin + '/auth/google',
    auto_select: false,
    itp_support: true,
  });
  if (params.get('keluar')) gis.disableAutoSelect();
  clear(slot);
  gis.renderButton(slot, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', logo_alignment: 'left', width: 280, locale: 'ms' });
}

start();
