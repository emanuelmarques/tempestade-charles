import { DISTRICTS } from '../data/districts.js';
import { toMap } from './projection.js';

const polysOf = (d) =>
  d.split('M').filter(Boolean).map((seg) =>
    seg.replace('Z', '').split('L').map((p) => p.trim().split(',').map(Number)).filter((p) => p.length === 2 && !p.some(Number.isNaN)),
  );
const CACHE = DISTRICTS.map((d) => ({ id: d.id, polys: polysOf(d.d) }));

function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function edgeDistance(pt, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j]; const [x2, y2] = poly[i];
    const dx = x2 - x1; const dy = y2 - y1; const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / len2));
    best = Math.min(best, Math.hypot(pt[0] - (x1 + t * dx), pt[1] - (y1 + t * dy)));
  }
  return best;
}

/**
 * Distrito de Portugal continental que contém o ponto (lat, lon), ou null se estiver fora.
 * Pontos até `maxEdgeKm` fora dos contornos simplificados (costa, fronteira) contam para o distrito mais próximo.
 */
export function districtAt(lat, lon, maxEdgeKm = 12, off) {
  const pt = toMap(lat, lon, off);
  let near = null; let nearD = Infinity;
  for (const d of CACHE) {
    for (const poly of d.polys) {
      if (inside(pt, poly)) return d.id;
      const e = edgeDistance(pt, poly);
      if (e < nearD) { nearD = e; near = d.id; }
    }
  }
  return nearD <= maxEdgeKm ? near : null;
}
