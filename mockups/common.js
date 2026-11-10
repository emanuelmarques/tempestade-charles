/* Utilitários partilhados pelos mockups (apenas para protótipos estáticos). */
(function () {
  const M = window.MOCK;
  const NOW0 = Date.parse('2026-11-10T20:10:00Z');   // "agora" fixo para o protótipo
  const START = Date.parse('2026-11-11T00:00:00Z');  // início previsto da tempestade
  const t0 = performance.now();
  const now = () => NOW0 + (performance.now() - t0);
  const pad = (n) => String(n).padStart(2, '0');
  const LV = { verde: 'Verde', amarelo: 'Amarelo', laranja: 'Laranja', vermelho: 'Vermelho' };
  const COL = { verde: '#9AA5A0', amarelo: '#F4C20D', laranja: '#EE7B1E', vermelho: '#D1242F' };
  const CAT = { governamental: 'Fonte oficial', comunicacao_social: 'Comunicação social', redes_sociais: 'Redes sociais' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = (iso) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
  const ago = (iso) => {
    const m = Math.max(1, Math.round((NOW0 - Date.parse(iso)) / 60000));
    return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`;
  };
  function parts() {
    let s = Math.max(0, Math.floor((START - now()) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return { d, h, m, s, text: `${pad(h)}:${pad(m)}:${pad(s)}` };
  }
  /** Liga elementos [data-cd] (texto hh:mm:ss) e [data-cd-h|m|s] (partes separadas). */
  function tick() {
    const p = parts();
    document.querySelectorAll('[data-cd]').forEach((e) => (e.textContent = p.text));
    document.querySelectorAll('[data-cd-h]').forEach((e) => (e.textContent = pad(p.h)));
    document.querySelectorAll('[data-cd-m]').forEach((e) => (e.textContent = pad(p.m)));
    document.querySelectorAll('[data-cd-s]').forEach((e) => (e.textContent = pad(p.s)));
  }
  setInterval(tick, 1000);
  document.addEventListener('DOMContentLoaded', tick);

  // bounding box dos distritos (para o viewBox)
  const nums = M.districts.flatMap((d) => (d.d.match(/-?\d+(\.\d+)?/g) || []).map(Number));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  M.districts.forEach((d) => {
    const n = (d.d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    for (let i = 0; i < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  });
  const BOX = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

  /**
   * Devolve um <svg> do mapa. opts: fill(d), stroke, sw, land, sea, pad, labels(d)=>string|null,
   * labelAttrs, cls, extra(d)=>atributos extra no <path>, under (markup antes dos distritos), over (depois).
   */
  function map(o = {}) {
    const p = o.pad == null ? 18 : o.pad;
    const vb = `${BOX.x - p} ${BOX.y - p} ${BOX.w + 2 * p} ${BOX.h + 2 * p}`;
    const paths = M.districts.map((d) =>
      `<path class="dist" data-id="${d.id}" tabindex="0" role="button" aria-label="${esc(d.name)}: aviso ${LV[d.level]}" d="${d.d}" fill="${o.fill ? o.fill(d) : COL[d.level]}" stroke="${o.stroke || '#fff'}" stroke-width="${o.sw || 1.2}" stroke-linejoin="round" ${o.extra ? o.extra(d) : ''}/>`).join('');
    const labels = o.labels ? M.districts.map((d) => { const t = o.labels(d); return t ? `<text x="${d.lx}" y="${d.ly}" text-anchor="middle" pointer-events="none" ${o.labelAttrs || ''}>${esc(t)}</text>` : ''; }).join('') : '';
    return `<svg class="${o.cls || ''}" viewBox="${vb}" role="group" aria-label="Mapa de Portugal continental por distrito" preserveAspectRatio="xMidYMid meet">${o.sea ? `<rect x="${BOX.x - p - 400}" y="${BOX.y - p - 100}" width="${BOX.w + 1000}" height="${BOX.h + 400}" fill="${o.sea}"/>` : ''}<g>${o.land === false ? '' : `<path d="${M.land}" fill="${o.land || '#eee'}" stroke="none" transform="translate(60,0)" ${o.landAttrs || ''}/>`}${o.under || ''}<g transform="translate(60,0)">${paths}${labels}${o.over || ''}</g></g></svg>`;
  }
  /** Delegação de eventos: chama cb(id) ao clicar/Enter num distrito. */
  function bindMap(root, cb) {
    const go = (e) => { const t = e.target.closest('.dist'); if (t) cb(t.dataset.id, t); };
    root.addEventListener('click', go);
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
  }
  const byId = (id) => M.districts.find((d) => d.id === id);
  const counts = () => M.districts.reduce((a, d) => ((a[d.level] = (a[d.level] || 0) + 1), a), {});
  window.C = { M, LV, COL, CAT, esc, hm, ago, tick, map, bindMap, byId, counts, BOX };
})();
