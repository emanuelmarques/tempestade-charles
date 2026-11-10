import { haversineKm } from '../lib/geo.js';

// Farmácias e quartéis de bombeiros de public/data/places.json, gerado por scripts/build-places.mjs a partir do
// OpenStreetMap (© colaboradores do OpenStreetMap, ODbL). Fica no repositório: o mais próximo calcula-se localmente.
export const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';
const RADIUS_KM = { pharmacy: 25, fire: 40 };

/** Telefone português (9 dígitos, com ou sem +351) -> { display, href } ou null. */
export function cleanPhone(tags = {}) {
  const raw = String(tags.phone || tags['contact:phone'] || '').split(';')[0];
  return phoneFromDigits(raw);
}

export function phoneFromDigits(raw) {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '').replace(/^(\+351|00351)/, '');
  if (!/^\d{9}$/.test(digits)) return null;
  return { display: `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`, href: `tel:+351${digits}` };
}

/** Linha [lat, lon, nome, telefone, morada] -> lugar com distância ao ponto. */
function toPlace(row, pt) {
  const [lat, lon, name, phone, address] = row;
  return {
    name: name || null, phone: phoneFromDigits(phone), address: address || null, lat, lon,
    km: haversineKm(pt, { lat, lon }),
    mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`,
  };
}

/** O lugar mais próximo dentro de `maxKm`, ou null. */
export function nearestPlace(rows, pt, maxKm) {
  let best = null; let bestKm = Infinity;
  for (const row of rows ?? []) {
    if (!Array.isArray(row) || typeof row[0] !== 'number' || typeof row[1] !== 'number') continue;
    const km = haversineKm(pt, { lat: row[0], lon: row[1] });
    if (km < bestKm) { bestKm = km; best = row; }
  }
  return best && bestKm <= maxKm ? toPlace(best, pt) : null;
}

let loading = null;
export function loadPlaces(fetchFn = fetch, base = './data/') {
  loading ||= fetchFn(`${base}places.json`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch((e) => { loading = null; throw e; });
  return loading;
}

/** Farmácia e bombeiros mais próximos de um ponto {lat, lon}: { pharmacy, fire } com { place, radiusKm } ou { error }. */
export async function lookupNearby(pt, fetchFn = fetch) {
  try {
    const places = await loadPlaces(fetchFn);
    return {
      pharmacy: { place: nearestPlace(places.pharmacy, pt, RADIUS_KM.pharmacy), radiusKm: RADIUS_KM.pharmacy },
      fire: { place: nearestPlace(places.fire, pt, RADIUS_KM.fire), radiusKm: RADIUS_KM.fire },
    };
  } catch (e) {
    const error = String(e.message || e);
    return { pharmacy: { error }, fire: { error } };
  }
}
