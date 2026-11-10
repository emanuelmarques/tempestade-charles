import { safeUrl } from '../lib/safe.js';
import { fetchCached } from './ipma.js';

// geoapi.pt: API gratuita, sem chave, com dados de divisões administrativas (CAOP) e contactos dos municípios.
export const GEOAPI = 'https://json.geoapi.pt/';
export const GEOAPI_SITE = 'https://geoapi.pt';

/** Concelho e distrito de um ponto. */
export function normalizeGps(raw) {
  if (!raw || typeof raw.concelho !== 'string' || !raw.concelho) throw new Error('Resposta de localização inválida');
  return { concelho: raw.concelho, distrito: raw.distrito ?? '', freguesia: raw.freguesia ?? '' };
}

/** 244839500 -> "244 839 500" */
export function formatPhone(n) {
  const d = String(n ?? '').replace(/\D/g, '');
  if (d.length !== 9) return null; // números portugueses têm 9 dígitos
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/** Contactos da câmara municipal (que é a autoridade municipal de proteção civil). */
export function normalizeMunicipio(raw) {
  if (!raw || typeof raw.nome !== 'string') throw new Error('Resposta de município inválida');
  const site = raw.sitio ? safeUrl(/^https?:\/\//i.test(raw.sitio) ? raw.sitio : `https://${raw.sitio}`) : null;
  const phone = formatPhone(raw.telefone);
  return {
    name: raw.nome,
    phone,
    phoneHref: phone ? `tel:+351${phone.replace(/\s/g, '')}` : null,
    email: typeof raw.email === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(raw.email) ? raw.email : null,
    site,
    address: [raw.morada, raw.codigopostal].filter(Boolean).join(', ') || null,
  };
}

export const gpsUrl = (lat, lon) => `${GEOAPI}gps/${lat.toFixed(4)},${lon.toFixed(4)}`;
export const municipioUrl = (nome) => `${GEOAPI}municipio/${encodeURIComponent(nome)}`;

/** Contactos do concelho onde está um ponto. O município pode faltar (devolve só o concelho). */
export async function lookupContacts(lat, lon, opts = {}) {
  const gps = normalizeGps((await fetchCached(gpsUrl(lat, lon), opts)).data);
  let municipio = null;
  try { municipio = normalizeMunicipio((await fetchCached(municipioUrl(gps.concelho), opts)).data); } catch { /* só o concelho */ }
  return { ...gps, municipio };
}
