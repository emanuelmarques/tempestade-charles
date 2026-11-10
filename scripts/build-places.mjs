// Descarrega farmácias e quartéis de bombeiros de Portugal (OpenStreetMap, via Overpass) para public/data/places.json.
// Dados © colaboradores do OpenStreetMap (ODbL). Correr de vez em quando: node scripts/build-places.mjs
import fs from 'node:fs';
import { cleanPhone } from '../src/data/places.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
// Pedidos pequenos (caixas de ~1 grau) em vez de um só para o país: os servidores públicos recusam consultas pesadas.
function boxes() {
  const out = [];
  const grid = (s0, n0, w0, e0, step) => { for (let la = s0; la < n0; la += step) for (let lo = w0; lo < e0; lo += step) out.push([la, lo, Math.min(la + step, n0), Math.min(lo + step, e0)]); };
  grid(36.9, 42.2, -9.6, -6.1, 0.9);   // continente
  grid(36.9, 39.8, -31.4, -24.9, 1.5); // Açores
  grid(32.3, 33.2, -17.3, -16.2, 1.2); // Madeira
  return out;
}
const query = ([s0, w, n0, e]) => `[out:json][timeout:30];(node[amenity=pharmacy](${s0},${w},${n0},${e});nwr[amenity=fire_station](${s0},${w},${n0},${e}););out tags center;`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBox(box, depth = 0) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ep = ENDPOINTS[(attempt + depth) % ENDPOINTS.length];
    try {
      const res = await fetch(`${ep}?data=${encodeURIComponent(query(box))}`, { headers: { 'User-Agent': 'tempestade-charles-build/0.1' }, signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(await res.text());
      if (!Array.isArray(json.elements)) throw new Error('resposta inválida');
      return json.elements;
    } catch (e) {
      console.error(`  caixa ${box.map((n) => +n.toFixed(2)).join(',')} em ${ep}: ${e.message}`);
      await sleep(2000 * (attempt + 1));
    }
  }
  if (depth >= 3) throw new Error(`caixa ${box.join(',')} falhou`);
  // divide a caixa em quatro e tenta cada quarto
  const [s0, w, n0, e] = box; const ms = (s0 + n0) / 2; const mw = (w + e) / 2;
  const parts = [[s0, w, ms, mw], [s0, mw, ms, e], [ms, w, n0, mw], [ms, mw, n0, e]];
  const out = [];
  for (const p of parts) out.push(...(await fetchBox(p, depth + 1)));
  return out;
}

async function download() {
  const seen = new Map();
  const all = boxes();
  for (let i = 0; i < all.length; i++) {
    for (const e of await fetchBox(all[i])) seen.set(`${e.type}${e.id}`, e);
    console.error(`caixa ${i + 1}/${all.length}: ${seen.size} elementos`);
    await sleep(1500);
  }
  if (seen.size < 100) throw new Error('poucos elementos: servidores indisponíveis');
  return { elements: [...seen.values()] };
}

const addr = (t) => {
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ') || t['addr:place'] || '';
  return [street, [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '';
};

const raw = await download();
const out = { source: 'OpenStreetMap contributors (ODbL), via Overpass', generatedAt: new Date().toISOString(), fire: [], pharmacy: [] };
for (const e of raw.elements) {
  const lat = e.lat ?? e.center?.lat; const lon = e.lon ?? e.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') continue;
  const t = e.tags ?? {};
  const row = [+lat.toFixed(5), +lon.toFixed(5), t.name || t.operator || '', cleanPhone(t)?.display.replace(/ /g, '') ?? '', addr(t)];
  (t.amenity === 'fire_station' ? out.fire : out.pharmacy).push(row);
}
fs.writeFileSync('public/data/places.json', JSON.stringify(out));
console.log(`fire=${out.fire.length} pharmacy=${out.pharmacy.length} -> public/data/places.json (${(fs.statSync('public/data/places.json').size / 1024).toFixed(0)} KB)`);
