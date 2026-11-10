import { haversineKm } from '../lib/geo.js';

// Farmácias e quartéis de bombeiros de public/data/places.json, gerado por scripts/build-places.mjs a partir do
// OpenStreetMap (© colaboradores do OpenStreetMap, ODbL). Fica no repositório: o mais próximo calcula-se localmente.
export const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';
const RADIUS_KM = { pharmacy: 25, fire: 40 };

/** Telefone português (9 dígitos, com ou sem +351) -> { display, href } ou null. */
export function cleanPhone(tags = {}) {
  for (const key of ['phone', 'contact:phone', 'mobile', 'contact:mobile']) {
    for (const part of String(tags[key] || '').split(/[;,]/)) {
      const ph = phoneFromDigits(part);
      if (ph) return ph;
    }
  }
  return null;
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

/* ---- alternativa em tempo real (sem Overpass): Photon para encontrar, Nominatim para o telefone ---- */
const PHOTON = 'https://photon.komoot.io/api/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/lookup';
const LIVE = { pharmacy: { q: 'farmácia', tag: 'amenity:pharmacy' }, fire: { q: 'bombeiros', tag: 'amenity:fire_station' } };

export const photonUrl = (kind, pt) =>
  `${PHOTON}?q=${encodeURIComponent(LIVE[kind].q)}&lat=${pt.lat.toFixed(3)}&lon=${pt.lon.toFixed(3)}&osm_tag=${LIVE[kind].tag}&limit=10`;

/** Resposta do Photon -> linhas [lat, lon, nome, telefone, morada, refOSM]. */
export function photonRows(json) {
  return (json?.features ?? []).flatMap((f) => {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    const p = f.properties ?? {};
    if (typeof lat !== 'number' || typeof lon !== 'number') return [];
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const town = [p.postcode, p.city || p.district].filter(Boolean).join(' ');
    const ref = p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : '';
    return [[lat, lon, p.name || '', '', [street, town].filter(Boolean).join(', '), ref]];
  });
}

async function getJson(url, fetchFn, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchFn(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

/** Telefone pelo Nominatim (melhor esforço): devolve o lugar com `phone` se existir. */
async function withPhone(place, ref, fetchFn) {
  if (!place || !ref) return place;
  try {
    const rows = await getJson(`${NOMINATIM}?osm_ids=${encodeURIComponent(ref)}&format=jsonv2&extratags=1`, fetchFn, 6000);
    const t = rows?.[0]?.extratags;
    return { ...place, phone: (t && cleanPhone(t)) || place.phone };
  } catch {
    return place;
  }
}

async function liveNearest(kind, pt, fetchFn) {
  const rows = photonRows(await getJson(photonUrl(kind, pt), fetchFn, 9000));
  const place = nearestPlace(rows, pt, RADIUS_KM[kind]);
  const row = place && rows.find((r) => r[0] === place.lat && r[1] === place.lon);
  return { place: await withPhone(place, row?.[5], fetchFn), radiusKm: RADIUS_KM[kind] };
}

/**
 * Farmácia e quartel de bombeiros mais próximos de um ponto {lat, lon}: { pharmacy, fire } com { place, radiusKm } ou { error }.
 * Usa primeiro public/data/places.json; se não existir, procura em tempo real (Photon + Nominatim).
 */
export async function lookupNearby(pt, fetchFn = fetch) {
  try {
    const places = await loadPlaces(fetchFn);
    return {
      pharmacy: { place: nearestPlace(places.pharmacy, pt, RADIUS_KM.pharmacy), radiusKm: RADIUS_KM.pharmacy },
      fire: { place: nearestPlace(places.fire, pt, RADIUS_KM.fire), radiusKm: RADIUS_KM.fire },
    };
  } catch {
    const one = (kind) => liveNearest(kind, pt, fetchFn).catch((e) => ({ error: String(e.message || e) }));
    const [pharmacy, fire] = await Promise.all([one('pharmacy'), one('fire')]);
    return { pharmacy, fire };
  }
}
