// ETRS89 / PT-TM06 (EPSG:3763) — Transversa de Mercator, elipsoide GRS80 — série de Krüger.
const a = 6378137, f = 1 / 298.257222101, lat0 = 39.66825833333333, lon0 = -8.133108333333334;
const n = f / (2 - f), rad = Math.PI / 180;
const A = (a / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64);
const alpha = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
function tm(lat, lon) {
  const e = Math.sqrt(f * (2 - f)), p = lat * rad, l = (lon - lon0) * rad;
  const t = Math.sinh(Math.atanh(Math.sin(p)) - e * Math.atanh(e * Math.sin(p)));
  const xi = Math.atan2(t, Math.cos(l)), eta = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let X = eta, Y = xi;
  alpha.forEach((al, i) => { const j = i + 1; X += al * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); Y += al * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); });
  return [A * X, A * Y];
}
const [, Y0] = tm(lat0, lon0);
/** lat/lon -> metros em PT-TM06 (origem em lat0/lon0) */
export function toTM06(lat, lon) { const [X, Y] = tm(lat, lon); return [X, Y - Y0]; }
export const MAP_OFFSET = { cx: 136.7, cy: 297.8 };
/** lat/lon -> coordenadas do mapa SVG (1 px = 1 km, mesmo referencial do desenho dos distritos). */
export function toMap(lat, lon, off = MAP_OFFSET) { const [X, Y] = toTM06(lat, lon); return [X / 1000 + off.cx, -Y / 1000 + off.cy]; }
