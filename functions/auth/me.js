// GET /auth/me - maklumat staf yang sedang login untuk UI (S-02, header, S-08).
// Role dihantar untuk paparan sahaja; semua semakan sebenar di /api dan Apps Script.

import { requireSession, errorResponse } from '../_lib/guard.js';
import { isSuperadmin } from '../_lib/modules.js';
import { json } from '../_lib/util.js';

export function buildMe(access) {
  const roles = access.roles || {};
  const portal = roles['*'] || [];
  const superadmin = isSuperadmin(roles);
  const seesAll = superadmin || portal.includes('viewer');
  const hrAdmin = (roles.hr || []).includes('hr_admin');
  const modules = (access.modules || [])
    .filter((m) => seesAll || (roles[m.module_id] || []).length)
    .map((m) => ({
      module_id: m.module_id,
      nama: m.nama,
      path: m.path,
      ikon: m.ikon,
      subtajuk: m.subtajuk,
      status: m.status,
      roles: roles[m.module_id] || [],
    }));
  return {
    staff: access.staff,
    portal_roles: portal,
    modules,
    admin: { staff: superadmin || hrAdmin, access: superadmin, audit: superadmin },
    settings: access.settings || {},
  };
}

export async function onRequestGet(context) {
  try {
    const { access } = await requireSession(context);
    return json(buildMe(access));
  } catch (e) {
    return errorResponse(e);
  }
}
