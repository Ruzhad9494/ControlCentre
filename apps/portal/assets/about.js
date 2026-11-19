// S-08 About / More Info (F-09).
import { getMe, APP_VERSION } from '/shared/lib/api.js';
import { el } from '/shared/lib/escape.js';
import { renderPrivacy } from '/shared/lib/privacy.js';
import { renderHeader, registerSW } from '/shared/ui/components.js';

registerSW();
const info = document.getElementById('info');
const row = (k, v) => el('div', null, el('dt', { class: 'caption' }, k), el('dd', { style: 'margin:0' }, v || '-'));

getMe({ redirect: false }).then((me) => {
  renderHeader(me, 'More Info');
  const s = me.settings || {};
  info.append(
    row('Syarikat', s.company_name || 'Voltake Energy'),
    row('Versi sistem', APP_VERSION),
    row('Hubungi IT', s.it_contact || 'Belum ditetapkan oleh Admin'),
    row('Akaun anda', `${me.staff.nama} (${me.staff.staff_id}) · ${me.staff.email}`));
}).catch(() => {
  info.append(row('Syarikat', 'Voltake Energy'), row('Versi sistem', APP_VERSION),
    el('p', null, el('a', { href: '/login/' }, 'Log masuk'), ' untuk lihat maklumat akaun dan hubungi IT.'));
});
document.getElementById('privacy-card').append(renderPrivacy());
