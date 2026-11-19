// functions/_lib/modules.js - daftar modul gateway (TRD 5.2, 9).
// Mesti sepadan dengan config/modules.json (diuji oleh tools/test).
// Hanya NAMA env variable di sini; nilai dalam Cloudflare env.

export const MODULES = {
  hr:          { url: 'GAS_URL_HR',          secret: 'MODULE_SECRET_HR' },
  costcalc:    { url: 'GAS_URL_COSTCALC',    secret: 'MODULE_SECRET_COSTCALC' },
  gwr:         { url: 'GAS_URL_GWR',         secret: 'MODULE_SECRET_GWR' },
  ams:         { url: 'GAS_URL_AMS',         secret: 'MODULE_SECRET_AMS' },
  claimpro:    { url: 'GAS_URL_CLAIMPRO',    secret: 'MODULE_SECRET_CLAIMPRO' },
  compliance:  { url: 'GAS_URL_COMPLIANCE',  secret: 'MODULE_SECRET_COMPLIANCE' },
  claimreport: { url: 'GAS_URL_CLAIMREPORT', secret: 'MODULE_SECRET_CLAIMREPORT' },
  voltrack:    { url: 'GAS_URL_VOLTRACK',    secret: 'MODULE_SECRET_VOLTRACK' },
  // Portal admin (S-04 hingga S-06): Apps Script `access`
  access:      { url: 'ACCESS_GAS_URL',      secret: 'ACCESS_SECRET' },
};

/**
 * Role yang dihantar ke Apps Script untuk modul ni (semakan kasar + halus).
 * '*' superadmin/viewer sentiasa dibawa. Modul `access` terima superadmin + hr_admin (dari modul hr).
 */
export function rolesForModule(moduleId, roles) {
  const portal = (roles && roles['*']) || [];
  if (moduleId === 'access') {
    const out = portal.filter((r) => r === 'superadmin');
    if (((roles && roles.hr) || []).includes('hr_admin')) out.push('hr_admin');
    return out;
  }
  const own = (roles && roles[moduleId]) || [];
  return [...new Set([...own, ...portal.filter((r) => r === 'superadmin' || r === 'viewer')])];
}

export function isSuperadmin(roles) {
  return ((roles && roles['*']) || []).includes('superadmin');
}
