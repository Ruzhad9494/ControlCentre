// shared/lib/page.js - permulaan halaman modul (corak untuk Fasa 2; AFD 4 "Ada role modul?").
//
//   import { bootModule } from '/shared/lib/page.js';
//   const { me, roles } = await bootModule('claimpro', 'ClaimPro');
//
// Semakan ni untuk UX sahaja (papar S-03 awal). Semakan sebenar di /api + Apps Script.
import { getMe } from './api.js';
import { renderHeader, registerSW } from '../ui/components.js';

export async function bootModule(moduleId, crumb) {
  const me = await getMe();
  const mod = (me.modules || []).find((m) => m.module_id === moduleId);
  if (!mod) {
    location.replace('/no-access/?r=modul');
    throw new Error('Tiada akses modul');
  }
  if (mod.status === 'maintenance') {
    location.replace('/no-access/?r=maintenance');
    throw new Error('Modul dalam penyelenggaraan');
  }
  renderHeader(me, crumb || mod.nama);
  registerSW();
  const superadmin = (me.portal_roles || []).includes('superadmin');
  return { me, module: mod, roles: mod.roles, superadmin };
}
