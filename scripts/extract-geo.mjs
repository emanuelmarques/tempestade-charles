// Extrai a geometria do mapa (distritos, terra, etiquetas) do ficheiro de design e
// calcula a transformação lat/lon -> coordenadas do mapa por mínimos quadrados.
import fs from 'node:fs';
const src = fs.readFileSync('design/project/Main.dc.html', 'utf8');
const land = src.match(/<g transform="translate\(60,0\)">\s*<path d="([^"]+)"/)[1];
const districts = {};
for (const m of src.matchAll(/<g onClick="\{\{pick\.(\w+)\}\}"[^>]*><path d="([^"]+)"[^>]*><\/path><text x="(\d+)" y="(\d+)"[^>]*>([^<]+)<\/text>/g)) {
  districts[m[1]] = { name: m[5], d: m[2], lx: +m[3], ly: +m[4] };
}
// Âncoras: lugares com lat/lon conhecidos e posição no mapa (pinos do design).
const anchors = [
  [40.64, -8.65, 98, 188], [40.86, -8.63, 106, 152], [40.15, -8.86, 84, 238], [40.21, -8.43, 130, 238],
  [39.74, -8.81, 100, 268], [39.75, -8.93, 82, 276], [39.36, -9.38, 52, 326], [41.15, -8.61, 98, 128],
  [41.12, -8.61, 104, 137], [38.72, -9.14, 42, 366], [38.52, -8.89, 108, 468], [37.02, -7.93, 160, 586],
  [40.54, -7.27, 216, 190],
];
function fit(idx) { // x = a + b*lon + c*lat
  const A = anchors.map(r => [1, r[1], r[0]]), y = anchors.map(r => r[idx]);
  const AtA = [0, 1, 2].map(i => [0, 1, 2].map(j => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const Aty = [0, 1, 2].map(i => A.reduce((s, r, k) => s + r[i] * y[k], 0));
  // resolver 3x3 por eliminação de Gauss
  const M = AtA.map((r, i) => [...r, Aty[i]]);
  for (let i = 0; i < 3; i++) { let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]];
    for (let k = i + 1; k < 3; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; } }
  const x = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let t = M[i][3]; for (let j = i + 1; j < 3; j++) t -= M[i][j] * x[j]; x[i] = t / M[i][i]; }
  return x;
}
const fx = fit(2), fy = fit(3);
const err = anchors.map(r => Math.hypot(fx[0] + fx[1] * r[1] + fx[2] * r[0] - r[2], fy[0] + fy[1] * r[1] + fy[2] * r[0] - r[3]));
console.error('distritos', Object.keys(districts).length, 'erro máx px', Math.max(...err).toFixed(1));
fs.writeFileSync('src/data/geo.json', JSON.stringify({ land, districts, projection: { x: fx, y: fy } }));
