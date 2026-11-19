// GET /auth/config - nilai awam untuk butang Google Sign-In (Client ID bukan rahsia).
import { json } from '../_lib/util.js';

export function onRequestGet({ env }) {
  if (!env.GOOGLE_CLIENT_ID) return json({ error: 'GOOGLE_CLIENT_ID belum diset' }, 503);
  return json({ client_id: env.GOOGLE_CLIENT_ID });
}
