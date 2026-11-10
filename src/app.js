import { escapeHtml as esc, safeUrl } from './lib/safe.js';
import { CATEGORIES, sourceBadge, sourceChip } from './lib/sources.js';
import { computeImpact, LEVELS, BASE, WEIGHTS } from './lib/impact.js';
import { countdown, parseLisbon, freshness, formatTime, formatDayTime, formatDay, pad2, STORM_START_LOCAL } from './lib/time.js';
import { toMap } from './lib/projection.js';
import { districtAt } from './lib/districtAt.js';
import { paginate } from './lib/paginate.js';
import { loadNextHours, weatherInfo, OPEN_METEO_SITE } from './data/openmeteo.js';
import { lookupContacts, GEOAPI_SITE } from './data/geoapi.js';
import { lookupNearby, OSM_COPYRIGHT } from './data/places.js';
import { haversineKm } from './lib/geo.js';
import { DISTRICTS, DISTRICT_BY_ID, DISTRICT_BY_AREA, LAND_PATH } from './data/districts.js';
import { IPMA, IPMA_SOURCE, WIND_CLASS, PREC_CLASS, normalizeWarnings, normalizeForecast, normalizeWeatherTypes, normalizeLocations, fetchCached } from './data/ipma.js';
import { loadCurated } from './data/curated.js';
import { TYPE_EMOJI, REC_EMOJI, SIT_EMOJI, RECS, ANEPC, LEVEL_EN, TIER_NAMES, TYPE_EN, AREA_NAMES, ISLAND_AREAS, STATUS_CLASS, STATUS_NAMES, TYPE_NAMES } from './content.js';

const STORM_START = parseLisbon(STORM_START_LOCAL);
const REFRESH_MS = 5 * 60 * 1000;
const TIER_FILL = ['#F7F5EE', '#F4C20D', '#EE7B1E', '#D1242F'];
const TIER_CLASS = ['lv-none', 'lv-amarelo', 'lv-laranja', 'lv-vermelho'];

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

const state = {
  lang: store.get('lang', 'pt') === 'en' ? 'en' : 'pt',
  page: document.body.dataset.page || 'home',
  win: 'now', here: null, region: 'continente', national: false, district: null, userPicked: false, locNote: '', incidentId: null,
  filt: { governamental: true, comunicacao_social: true, redes_sociais: true },
  sit: 'casa', cat: 'todas', svc: 'todas', pg: { serv: 1, feed: 1 }, zoneLoc: Number(store.get('zoneLoc', '1100900')) || 1100900,
  view: { x: 0, y: 0, w: 640, h: 620 }, now: new Date(),
};
const data = {
  curated: { meta: { updatedAt: null }, incidents: [], feed: [], services: [], shelters: [], myths: [] }, curatedErrors: {}, curatedLoaded: false,
  warnings: [], warnErr: null, warnFetchedAt: null, warnCache: false,
  contact: null, contactErr: null, nearby: null, wx: null, wxErr: null, locations: [], forecast: null, forecastErr: null, forecastLoc: null, weatherTypes: {},
};

const L = (pt, en) => (state.lang === 'en' ? en : pt);
const txt = (t) => (t && typeof t === 'object' ? (t[state.lang] || t.pt || '') : t ?? '');
const lvName = (l) => (state.lang === 'en' ? LEVEL_EN[l] : l);
const typeName = (t) => (state.lang === 'en' ? TYPE_EN[t] || t : t);
const lvPill = (l, extra = '') => `<span class="lv lv-${l}${extra}">${esc(lvName(l)[0].toUpperCase() + lvName(l).slice(1))}</span>`;

/* ---------- derivados ---------- */
/** Avisos que ainda vão começar nas próximas `hours` horas, para as áreas dadas. */
function upcoming(areas, hours = 48) {
  const t0 = state.now; const t1 = new Date(t0.getTime() + hours * 3600e3); const set = new Set(areas);
  return data.warnings.filter((w) => set.has(w.area) && w.start > t0 && w.start <= t1).sort((a, b) => a.start - b.start || rank(b.level) - rank(a.level));
}
function upcomingBlock(areas, max = 5) {
  const u = upcoming(areas);
  if (!u.length) return '';
  return `<div><h4 class="h" style="font-size:16px;margin-bottom:2px">${L('A seguir (próximas 48 h)', 'Coming up (next 48 h)')}</h4>${u.slice(0, max).map(warningLine).join('')}${u.length > max ? `<p class="muted" style="margin:8px 0 0;font-size:13px">+${u.length - max} ${L('avisos', 'more warnings')}</p>` : ''}</div>`;
}

function windowRange() {
  const h = state.win === 'now' ? 0 : state.win === '24h' ? 24 : 48;
  return [state.now, new Date(state.now.getTime() + h * 3600e3)];
}
function impact() {
  const [from, to] = windowRange();
  return computeImpact({ districts: DISTRICTS, warnings: data.warnings, incidents: data.curated.incidents, from, to });
}
const rank = (l) => LEVELS.indexOf(l);
/** Distrito mostrado: o escolhido (ou o da localização); senão o de maior impacto. */
function curDistrict(imp) {
  if (state.district) return state.district;
  let best = null;
  for (const d of DISTRICTS) { const r = imp.get(d.id); if (!best || r.score > best.score) best = r; }
  return best.id;
}
function highestLevel() {
  const [from, to] = windowRange();
  return data.warnings.filter((w) => w.start <= to && w.end >= from).reduce((m, w) => (rank(w.level) > rank(m) ? w.level : m), 'verde');
}
const locById = (id) => data.locations.find((l) => l.id === id);
const winLabel = () => (state.win === 'now' ? L('agora', 'now') : state.win === '24h' ? L('nas próximas 24 h', 'in the next 24 h') : L('nas próximas 48 h', 'in the next 48 h'));

/* ---------- blocos ---------- */
function emergencyBar() {
  return `<div class="bar112"><div class="in">
    <span class="h" style="font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase">${L('Em emergência', 'In an emergency')}</span>
    <span style="display:flex;flex-wrap:wrap;gap:0 28px">
      <a href="tel:112"><span class="big">112</span><span style="font-size:14px">${L('Emergência', 'Emergency')}</span></a>
      <a href="tel:808242424"><span class="big">808 24 24 24</span><span style="font-size:14px">SNS 24</span></a>
    </span></div></div>`;
}

function countdownBox() {
  const c = countdown(state.now, STORM_START);
  const when = formatDayTime(STORM_START, state.lang);
  if (c.done) {
    return `<div class="countdown live" role="timer" id="cd"><span class="t" id="cd-t">${L('Tempestade em curso', 'Storm under way')}</span><span class="l">${L('desde', 'since')} ${esc(when)}</span></div>`;
  }
  const d = c.days ? `${c.days}d ` : '';
  return `<div class="countdown" role="timer" id="cd"><span class="t" id="cd-t">${d}${pad2(c.hours)}:${pad2(c.minutes)}:${pad2(c.seconds)}</span><span class="l">${L('até ao início da tempestade', 'until the storm begins')} · ${esc(when)}</span></div>`;
}

function freshnessInfo() {
  const parts = [];
  let dot = '#0E6B63';
  if (data.warnErr && !data.warnFetchedAt) { dot = '#D1242F'; parts.push(L('Avisos IPMA indisponíveis', 'IPMA warnings unavailable')); }
  else if (data.warnCache) { dot = '#EE7B1E'; parts.push(`${L('Avisos IPMA: cópia de', 'IPMA warnings: copy from')} ${formatTime(data.warnFetchedAt, state.lang)}`); }
  else if (data.warnFetchedAt) parts.push(`${L('Avisos IPMA ao vivo', 'IPMA warnings live')} · ${formatTime(data.warnFetchedAt, state.lang)}`);
  else { dot = '#8A857A'; parts.push(L('A carregar avisos IPMA…', 'Loading IPMA warnings…')); }
  return { dot, text: parts.join(' · ') };
}

const NAV = [
  ['home', './', ['Início', 'Home']],
  ['recs', 'recomendacoes.html', ['O que fazer', 'What to do']],
  ['how', 'metodologia.html', ['Metodologia', 'Methodology']],
  ['sources', 'fontes.html', ['Fontes', 'Sources']],
  ['feedback', 'feedback.html', ['Feedback', 'Feedback']],
];
function navBar() {
  return `<nav class="mainnav" aria-label="${L('Navegação principal', 'Main navigation')}">${NAV.map(([k, href, [pt, en]]) => `<a href="${href}"${state.page === k ? ' aria-current="page"' : ''}>${L(pt, en)}</a>`).join('')}</nav>`;
}

/** Ponto para o tempo: a localização do visitante, ou a localidade escolhida. */
function wxPoint() {
  if (state.here) return { lat: state.here.lat, lon: state.here.lon, name: null };
  const l = locById(state.zoneLoc);
  return l ? { lat: l.lat, lon: l.lon, name: l.name } : null;
}
let wxSeq = 0;
async function loadWx() {
  const pt = wxPoint(); if (!pt) return;
  const seq = ++wxSeq;
  try {
    const hours = await loadNextHours(pt.lat, pt.lon, new Date());
    if (seq !== wxSeq) return;
    data.wx = { hours, name: pt.name, byUser: !!state.here }; data.wxErr = null;
  } catch (e) { if (seq === wxSeq) { data.wxErr = String(e.message || e); } }
  render();
}

function wxWidget() {
  const w = data.wx;
  const where = w ? (w.byUser ? L('na sua localização', 'at your location') : esc(w.name || '')) : '';
  const label = `${L('Tempo nas próximas 4 horas', 'Weather in the next 4 hours')}${where ? ' · ' + where : ''}`;
  let body;
  if (!w) body = `<span class="muted wxm">${data.wxErr ? L('Tempo indisponível', 'Weather unavailable') : L('A carregar…', 'Loading…')}</span>`;
  else if (!w.hours.length) body = `<span class="muted wxm">${L('Sem dados', 'No data')}</span>`;
  else body = `<ol class="wxh">${w.hours.map((h) => { const i = weatherInfo(h.code, state.lang); return `<li title="${esc(i.label)}: ${Math.round(h.temp)}°, ${L('chuva', 'rain')} ${Math.round(h.pop)}%, ${L('rajada', 'gust')} ${Math.round(h.gust)} km/h"><span class="num muted">${esc(formatTime(h.time, state.lang))}</span><span class="wxe" aria-hidden="true">${i.emoji}</span><strong class="num">${Math.round(h.temp)}°</strong><span class="sr">${esc(i.label)}, ${L('chuva', 'rain')} ${Math.round(h.pop)}%, ${L('rajada', 'gust')} ${Math.round(h.gust)} km/h</span></li>`; }).join('')}</ol>`;
  return `<div class="wx" role="group" aria-label="${label}" title="${label}"><div class="wxt">${L('Próximas 4h', 'Next 4h')}${where ? ` · ${where}` : ''} · <a href="${OPEN_METEO_SITE}" target="_blank" rel="noopener noreferrer">Open-Meteo</a></div>${body}</div>`;
}

function topbar() {
  const f = freshnessInfo();
  return `<header class="top">
    <a class="brand" href="./">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true"><rect width="44" height="44" rx="10" fill="#15202B"/><path d="M12 22c0-4 3.4-7 7.5-7 3 0 5.6 1.6 6.8 4 3.5.2 6.2 2.7 6.2 6 0 3.4-3 6-6.600 6H17c-2.800 0-5-2.200-5-5z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M23 27l-3 5h4l-2 5" stroke="#F4C20D" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
      <span><h1 class="h" style="display:block;font-size:24px;font-weight:700;line-height:1.1">${L('Tempestade Charles', 'Storm Charles')}</h1>
      <span class="muted" style="display:block;font-size:14px">${L('Informação para a população · Portugal', 'Public information · Portugal')}</span></span>
    </a>
    <div class="tools">
      ${countdownBox()}
      ${wxWidget()}
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start">
        <p style="margin:0;display:inline-flex;align-items:center;gap:8px;font-size:14px"><span style="width:10px;height:10px;border-radius:50%;background:${f.dot};flex:none"></span>${esc(f.text)}</p>
        <div style="display:flex" role="group" aria-label="${L('Idioma', 'Language')}">
          <button class="seg ${state.lang === 'pt' ? 'on' : ''}" aria-pressed="${state.lang === 'pt'}" data-a="lang" data-v="pt" lang="pt">PT</button>
          <button class="seg ${state.lang === 'en' ? 'on' : ''}" aria-pressed="${state.lang === 'en'}" data-a="lang" data-v="en" lang="en">EN</button>
        </div>
      </div>
    </div></header>${navBar()}`;
}

function banners() {
  const out = [];
  if (data.warnErr && !data.warnFetchedAt) out.push(`<div class="notice bad" role="alert"><strong>${L('Não foi possível obter os avisos do IPMA.', 'Could not load IPMA warnings.')}</strong> ${L('Consulte diretamente', 'Check directly')} <a href="${IPMA.site}" rel="noopener noreferrer">ipma.pt</a>.</div>`);
  else if (data.warnCache) out.push(`<div class="notice warn">${L('Sem ligação ao IPMA: a mostrar a última cópia guardada neste dispositivo.', 'Cannot reach IPMA: showing the last copy saved on this device.')}</div>`);
  const fr = freshness(data.curated.meta.updatedAt, state.now, 150);
  if (data.curatedLoaded) {
    if (fr.state === 'unknown') out.push(`<div class="notice warn">${L('Ocorrências, notícias e serviços: ainda sem dados. Os avisos meteorológicos do IPMA são mostrados em tempo real.', 'Incidents, news and services: no data yet. IPMA weather warnings are shown in real time.')}</div>`);
    else if (fr.state === 'stale') out.push(`<div class="notice warn">${L('Ocorrências e notícias desatualizadas: última atualização há', 'Incidents and news are out of date: last updated')} ${fr.minutesAgo} min${state.lang === 'en' ? ' ago' : ''}.</div>`);
  }
  const bad = Object.keys(data.curatedErrors);
  if (bad.length) out.push(`<div class="notice warn">${L('Alguns dados não puderam ser carregados:', 'Some data could not be loaded:')} ${esc(bad.join(', '))}.</div>`);
  return out.length ? `<div style="display:flex;flex-direction:column;gap:8px">${out.join('')}</div>` : '';
}

function statusSection(imp) {
  const hi = highestLevel();
  const [from, to] = windowRange();
  const active = data.warnings.filter((w) => w.start <= to && w.end >= from);
  const areas = new Set(active.map((w) => w.area)).size;
  const reds = DISTRICTS.filter((d) => imp.get(d.id).top?.level === 'vermelho');
  const inc = data.curated.incidents;
  const unv = inc.filter((i) => i.source.category === 'redes_sociais' && !i.verified).length;
  return `<section aria-labelledby="h-estado"><h2 id="h-estado" class="h2">${L('Estado atual', 'Current status')}</h2>
    <div class="kpis">
      <div class="kpi"><p class="muted" style="margin:0 0 8px">${L('Aviso mais alto', 'Highest warning')}</p>${lvPill(hi, '" style="font-size:20px;padding:4px 14px')}<p class="muted">IPMA · ${esc(winLabel())}</p></div>
      <div class="kpi"><p class="muted" style="margin:0 0 4px">${L('Zonas com aviso', 'Areas with a warning')}</p><div class="v">${areas}</div><p class="muted">${L('Amarelo ou superior · IPMA', 'Yellow or higher · IPMA')}</p></div>
      <div class="kpi"><p class="muted" style="margin:0 0 4px">${L('Ocorrências registadas', 'Recorded incidents')}</p><div class="v">${inc.length}</div><p class="muted">${unv ? `${L('Das quais', 'Of which')} ${unv} ${L('de redes sociais, não verificadas', 'from social media, unverified')}` : L('Nenhuma por verificar', 'None unverified')}</p></div>
      <div class="kpi"><p class="muted" style="margin:0 0 4px">${L('Distritos em aviso vermelho', 'Districts on red warning')}</p><div class="v">${reds.length} <small>${L('de 18', 'of 18')}</small></div><p class="muted">${reds.length ? esc(reds.map((d) => d.name).join(', ')) : L('Nenhum neste período', 'None in this period')}</p></div>
    </div></section>`;
}

/* ---------- mapa ---------- */
function pinShape(cat, s, selected) {
  const r = 8 * s;
  const ring = selected ? `<circle class="ring" r="${15 * s}" fill="none" stroke="#15202B" stroke-width="${2.5 * s}"/>` : '<circle class="ring" r="0" fill="none"/>';
  if (cat === 'governamental') return `${ring}<rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" rx="${2 * s}" fill="#1B4F9C" stroke="#fff" stroke-width="${2 * s}"/>`;
  if (cat === 'comunicacao_social') return `${ring}<circle r="${r}" fill="#0E6B63" stroke="#fff" stroke-width="${2 * s}"/>`;
  return `${ring}<rect x="${-r * .85}" y="${-r * .85}" width="${r * 1.7}" height="${r * 1.7}" transform="rotate(45)" fill="#FBEBCF" stroke="#8A5200" stroke-width="${2 * s}" stroke-dasharray="${3 * s} ${2 * s}"/>`;
}

function mapPins() {
  const inc = data.curated.incidents.filter((i) => i.lat != null && i.lon != null && state.filt[i.source.category]);
  const box = document.querySelector('#mapbox svg');
  const ppu = box ? Math.min(box.clientWidth / state.view.w, box.clientHeight / state.view.h) || 1 : 1;
  const s = 1 / ppu;
  return inc.map((i) => {
    const [x, y] = toMap(i.lat, i.lon);
    const cat = CATEGORIES[i.source.category];
    const label = `${cat.label[state.lang]}${i.verified === false && i.source.category === 'redes_sociais' ? `, ${L('não verificado', 'unverified')}` : ''}: ${txt(i.title)}`;
    return `<g class="mappin" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" tabindex="0" role="button" data-a="pin" data-id="${esc(i.id)}" aria-label="${esc(label)}"><circle r="${22 * s}" fill="transparent"/>${pinShape(i.source.category, s, state.incidentId === i.id)}</g>`;
  }).join('');
}

function mapSvg(imp) {
  const v = state.view; const cur = state.national ? null : curDistrict(imp);
  // Primeiro todos os distritos (o selecionado por último, para o contorno ficar por cima), depois todos os nomes por cima.
  const ordered = [...DISTRICTS].sort((x, y) => (x.id === cur) - (y.id === cur));
  const paths = ordered.map((d) => {
    const r = imp.get(d.id); const sel = d.id === cur;
    const tierName = TIER_NAMES[r.tier][state.lang === 'en' ? 1 : 0];
    return `<g class="dist" tabindex="0" role="button" data-a="district" data-id="${d.id}" aria-label="${esc(d.name)}: ${L('impacto', 'impact')} ${tierName}${r.top ? `, ${L('aviso', 'warning')} ${lvName(r.top.level)}` : ''}" style="cursor:pointer"><path d="${d.d}" fill="${TIER_FILL[r.tier]}" stroke="${sel ? '#15202B' : '#fff'}" stroke-width="${sel ? 3.5 : 1.5}"/></g>`;
  }).join('');
  const labels = DISTRICTS.map((d) => {
    const r = imp.get(d.id); const dark = r.tier === 3;
    return `<text x="${d.lx}" y="${d.ly}" text-anchor="middle" fill="${dark ? '#fff' : '#15202B'}" stroke="${dark ? '#7F1020' : TIER_FILL[r.tier]}" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${esc(d.name)}</text>`;
  }).join('');
  return `<svg viewBox="${v.x} ${v.y} ${v.w} ${v.h}" role="group" aria-label="${L('Mapa de Portugal continental por distrito', 'Map of mainland Portugal by district')}"><g transform="translate(60,0)"><path d="${LAND_PATH}" fill="#F0EEE6" stroke="none"/><text x="262" y="368" font-family="'Inter Variable',sans-serif" font-size="13" letter-spacing="4" fill="#4A5663" font-weight="600">ESPANHA</text>${paths}<g class="labels" pointer-events="none">${labels}</g>${mapPins()}</g></svg>`;
}

function legend() {
  const sw = (c, t) => `<span><span class="sw" style="background:${c}"></span>${t}</span>`;
  const sh = (c, t) => `<span><span class="shape ${c}"></span>${t}</span>`;
  return `<div class="card legend"><h4>${L('Impacto no distrito', 'District impact')}</h4><div>
    ${sw('#D1242F', L('Muito alto', 'Very high'))}${sw('#EE7B1E', L('Alto', 'High'))}${sw('#F4C20D', L('Moderado', 'Moderate'))}${sw('#F7F5EE', L('Sem impacto relevante', 'No relevant impact'))}</div>
    <h4>${L('Ocorrências', 'Incidents')}</h4><div>${sh('sh-g', L('Governamental, oficial', 'Government, official'))}${sh('sh-c', L('Comunicação social', 'News media'))}${sh('sh-r', L('Redes sociais, não verificado', 'Social media, unverified'))}</div></div>`;
}

function regionPanel(region) {
  const areas = ISLAND_AREAS[region];
  const [from, to] = windowRange();
  const rows = areas.map((a) => {
    const ws = data.warnings.filter((w) => w.area === a && w.start <= to && w.end >= from).sort((x, y) => rank(y.level) - rank(x.level));
    return `<div class="card"><h3 style="font-size:18px">${esc(AREA_NAMES[a])}</h3>${ws.length ? ws.map((w) => warningLine(w)).join('') : `<p class="muted" style="margin:8px 0 0">${L('Sem aviso em vigor neste momento.', 'No warning in force right now.')}</p>`}${upcomingBlock([a], 4)}</div>`;
  }).join('');
  return `<div class="grid" style="margin-top:4px">${rows}</div><p class="muted" style="font-size:14px;margin:12px 0 0">${L('Avisos do IPMA para as regiões autónomas: em vigor agora e previstos para as próximas 48 horas. O mapa desenhado cobre só o continente.', 'IPMA warnings for the autonomous regions: in force now and forecast for the next 48 hours. The drawn map covers the mainland only.')} ${sourceBadge(IPMA_SOURCE, { lang: state.lang })}</p>`;
}

function warningLine(w) {
  return `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--frame);font-size:14px"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${lvPill(w.level)} <strong>${esc(typeName(w.type))}</strong></div><div class="muted" style="margin-top:4px">${esc(formatDayTime(w.start, state.lang))} → ${esc(formatDayTime(w.end, state.lang))}</div>${w.text ? `<div style="margin-top:4px">${esc(w.text)}</div>` : ''}</div>`;
}

function districtPanel(imp) {
  const d = DISTRICT_BY_ID[curDistrict(imp)]; const r = imp.get(d.id);
  const list = data.curated.incidents.filter((i) => i.district === d.id).sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 3);
  const shown = r.count === 0 ? L('nenhuma', 'none') : list.length < r.count ? `${L('as', 'the')} ${list.length} ${L('mais recentes de', 'most recent of')} ${r.count}` : `${r.count} ${L('no total', 'in total')}`;
  const tname = TIER_NAMES[r.tier][state.lang === 'en' ? 1 : 0];
  return `<div style="display:flex;flex-direction:column;gap:14px"><div><p class="muted" style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">${L('Distrito', 'District')}</p><h3 style="font-size:28px;line-height:1.15">${esc(d.name)}</h3><button class="tab" data-a="national" style="margin-top:8px;min-height:44px">${L('Ver todo o país', 'See the whole country')}</button></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px"><span class="lv ${TIER_CLASS[r.tier]}">${L('Impacto', 'Impact')} ${tname}</span><span class="lv lv-${r.top ? r.top.level : 'verde'}">${L('Aviso', 'Warning')} ${r.top ? lvName(r.top.level) : L('verde', 'green')}</span></div>
    <div><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="h num" style="font-size:34px;font-weight:700;line-height:1">${r.score}<small style="font-size:16px;font-weight:600">/100</small></span><span class="muted" style="font-size:13px">${esc(winLabel())}</span></div>
      <div class="bar"><div class="${TIER_CLASS[r.tier]}" style="width:${r.score}%"></div></div>
      <p class="muted" style="margin:8px 0 0;font-size:13.5px">${L('Aviso IPMA', 'IPMA warning')} <strong style="color:var(--ink)">+${r.base}</strong> · ${L('Ocorrências', 'Incidents')} <strong style="color:var(--ink)">+${r.points}</strong></p></div>
    <div><h4 class="h" style="font-size:16px;margin-bottom:2px">${L('Avisos do IPMA', 'IPMA warnings')}</h4>${r.warnings.length ? r.warnings.map(warningLine).join('') : `<p class="muted" style="margin:6px 0 0;font-size:14px">${L('Sem aviso em vigor neste momento.', 'No warning in force right now.')}</p>`}<div style="margin-top:8px">${sourceBadge(IPMA_SOURCE, { lang: state.lang })}</div></div>
    ${upcomingBlock([d.area])}
    <div style="display:flex;flex-direction:column;gap:8px"><h4 class="h" style="font-size:16px;margin:0">${L('Ocorrências recentes', 'Recent incidents')} <span class="muted" style="font-weight:500;font-size:14px">· ${shown}</span></h4>
      ${r.count === 0 ? `<p class="muted" style="margin:0;font-size:14px">${L('Sem ocorrências registadas neste distrito.', 'No incidents recorded in this district.')}</p>` : ''}
      ${list.map((i) => { const c = CATEGORIES[i.source.category]; return `<button class="item" data-a="incident" data-id="${esc(i.id)}"><span class="muted" style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span>${esc(i.place || '')}</span><span class="num">${esc(formatTime(new Date(i.time), state.lang))}</span></span><span style="font-weight:600;font-size:15px">${esc(txt(i.title))}</span><span>${sourceChip(i.source, state.lang)}${i.source.category === 'redes_sociais' && !i.verified ? ` <span class="st st-org">${L('Não verificado', 'Unverified')}</span>` : ''}</span></button>`; }).join('')}</div></div>`;
}

function nationalPanel(imp) {
  const rows = DISTRICTS.map((d) => ({ d, r: imp.get(d.id) })).sort((a, b) => b.r.score - a.r.score || a.d.name.localeCompare(b.d.name, 'pt'));
  const counts = [0, 0, 0, 0]; rows.forEach((x) => { counts[x.r.tier] += 1; });
  const [from, to] = windowRange();
  const names = TIER_NAMES.map((t) => t[state.lang === 'en' ? 1 : 0]);
  const islands = [['acores', 'Açores', 'Azores'], ['madeira', 'Madeira', 'Madeira']].map(([k, pt, en]) => {
    const areas = ISLAND_AREAS[k];
    const now = data.warnings.filter((w) => areas.includes(w.area) && w.start <= to && w.end >= from).reduce((m, w) => (rank(w.level) > rank(m) ? w.level : m), 'verde');
    const next = upcoming(areas).reduce((m, w) => (rank(w.level) > rank(m) ? w.level : m), 'verde');
    return `<button class="item" data-a="region" data-v="${k}"><span style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong>${L(pt, en)}</strong><span>${lvPill(now)}</span></span><span class="muted" style="font-size:13px">${next !== 'verde' ? `${L('A seguir, até', 'Coming up, up to')} ${esc(lvName(next))}` : L('Sem avisos previstos nas próximas 48 h', 'No warnings forecast in the next 48 h')}</span></button>`;
  }).join('');
  const recent = data.curated.incidents.slice().sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 3);
  const nUp = upcoming([...DISTRICTS.map((d) => d.area), ...ISLAND_AREAS.acores, ...ISLAND_AREAS.madeira]).length;
  return `<div style="display:flex;flex-direction:column;gap:14px"><div><p class="muted" style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">${L('Nacional', 'National')}</p><h3 style="font-size:28px;line-height:1.15">${L('Todo o país', 'The whole country')}</h3></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px"><span class="lv lv-${highestLevel()}">${L('Aviso mais alto', 'Highest warning')} ${esc(lvName(highestLevel()))}</span></div>
    <p class="muted" style="margin:0;font-size:14px">${[3, 2, 1, 0].map((t) => `<strong style="color:var(--ink)">${counts[t]}</strong> ${esc(names[t])}`).join(' · ')} (${L('distritos', 'districts')})</p>
    <p class="muted" style="margin:0;font-size:14px">${nUp ? `${nUp} ${L('avisos previstos nas próximas 48 h em todo o país.', 'warnings forecast in the next 48 h nationwide.')}` : L('Sem avisos previstos nas próximas 48 h.', 'No warnings forecast in the next 48 h.')}</p>
    <div><h4 class="h" style="font-size:16px;margin:0 0 6px">${L('Distritos por impacto', 'Districts by impact')}</h4><div style="display:flex;flex-direction:column;gap:6px">${rows.map(({ d, r }) => `<button class="item" data-a="district" data-id="${d.id}" style="flex-direction:row;align-items:center;justify-content:space-between;gap:8px"><span style="font-weight:600">${esc(d.name)}</span><span style="display:flex;gap:8px;align-items:center"><span class="num muted" style="font-size:13px">${r.score}/100</span><span class="lv ${TIER_CLASS[r.tier]}">${esc(names[r.tier])}</span></span></button>`).join('')}</div></div>
    <div><h4 class="h" style="font-size:16px;margin:0 0 6px">${L('Regiões autónomas', 'Autonomous regions')}</h4><div style="display:flex;flex-direction:column;gap:6px">${islands}</div></div>
    ${recent.length ? `<div><h4 class="h" style="font-size:16px;margin:0 0 6px">${L('Ocorrências recentes no país', 'Recent incidents nationwide')}</h4><div style="display:flex;flex-direction:column;gap:6px">${recent.map((i) => `<button class="item" data-a="incident" data-id="${esc(i.id)}"><span class="muted" style="font-size:13px">${esc(i.place || '')} · ${esc(formatTime(new Date(i.time), state.lang))}</span><span style="font-weight:600;font-size:15px">${esc(txt(i.title))}</span></button>`).join('')}</div></div>` : ''}
    <div>${sourceBadge(IPMA_SOURCE, { lang: state.lang })}</div></div>`;
}

function incidentPanel() {
  const i = data.curated.incidents.find((x) => x.id === state.incidentId);
  if (!i) return districtPanel(impact());
  const d = DISTRICT_BY_ID[i.district];
  const img = i.image && i.image.allowed === true && safeUrl(i.image.url)
    ? `<figure style="margin:0"><img src="${esc(safeUrl(i.image.url))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hide-on-error style="width:100%;max-height:220px;object-fit:cover;border-radius:8px"><figcaption class="muted" style="font-size:12px;margin-top:4px">${esc(i.image.credit || '')}</figcaption></figure>` : '';
  return `<div style="display:flex;flex-direction:column;gap:14px;height:100%"><button class="tab" data-a="back" style="align-self:flex-start">← ${esc(d ? d.name : L('Voltar', 'Back'))}</button>
    <h3 style="font-size:22px;line-height:1.25">${esc(txt(i.title))}</h3>
    <p class="muted" style="margin:0;font-size:14px">${esc(i.place || '')} · ${esc(formatDayTime(new Date(i.time), state.lang))}</p>${img}
    ${i.description ? `<p style="margin:0;font-size:15px">${esc(txt(i.description))}</p>` : ''}
    <div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:6px">${sourceBadge(i.source, { verified: i.verified, lang: state.lang })}</div></div>`;
}

function mapSection(imp) {
  const chips = [['governamental', 'sh-g'], ['comunicacao_social', 'sh-c'], ['redes_sociais', 'sh-r']].map(([k, s]) => `<button class="chip ${state.filt[k] ? 'on' : ''}" aria-pressed="${state.filt[k]}" data-a="filt" data-v="${k}"><span class="shape ${s}"></span>${esc(CATEGORIES[k].label[state.lang])}</button>`).join('');
  const seg = (a, items, cur) => items.map(([v, l]) => `<button class="seg ${cur === v ? 'on' : ''}" aria-pressed="${cur === v}" data-a="${a}" data-v="${v}">${l}</button>`).join('');
  const reg = state.region !== 'continente';
  return `<section aria-labelledby="h-mapa"><div style="display:flex;flex-wrap:wrap;gap:8px 24px;align-items:baseline;justify-content:space-between;margin-bottom:14px"><h2 id="h-mapa" style="font-size:26px">${L('Mapa de impacto por distrito', 'District impact map')}</h2><p class="muted" style="margin:0;font-size:14px">${state.locNote ? `${esc(state.locNote)} · ` : ''}${L('Clique num distrito para ver o detalhe.', 'Select a district for details.')} <a href="metodologia.html">${L('Como calculamos', 'How we calculate')}</a></p></div>
  <div class="maprow"><div class="mapcol">
    <div class="row" style="justify-content:space-between"><div class="row">
      <div style="display:flex" role="group" aria-label="${L('Região', 'Region')}">${seg('region', [['continente', 'Continente'], ['acores', 'Açores'], ['madeira', 'Madeira']], state.region)}</div>
    </div>
      ${reg ? '' : `<div style="display:flex;flex-wrap:wrap;gap:8px" role="group" aria-label="${L('Filtrar ocorrências por categoria de fonte', 'Filter incidents by source category')}">${chips}</div>`}</div>
    ${reg ? regionPanel(state.region) : `<div class="mapbox" id="mapbox"><div class="mapview">${mapSvg(imp)}<div class="zoom"><button class="ctl" data-a="zoom" data-v="in" aria-label="${L('Aproximar', 'Zoom in')}">+</button><button class="ctl" data-a="zoom" data-v="out" aria-label="${L('Afastar', 'Zoom out')}">−</button></div></div>${legend()}</div>`}
  </div>
  <aside class="card panel" aria-live="polite" aria-label="${L('Detalhe', 'Details')}">${state.incidentId ? incidentPanel() : state.national ? nationalPanel(imp) : districtPanel(imp)}</aside></div></section>`;
}

/* ---------- zona ---------- */
function zoneRow(emoji, title, sub, actions) {
  return `<li class="zrow"><span class="zi" aria-hidden="true">${emoji}</span><div class="zt"><strong>${title}</strong>${sub ? `<span class="muted">${sub}</span>` : ''}</div>${actions ? `<div class="za">${actions}</div>` : ''}</li>`;
}

function zoneSection() {
  const loc = locById(state.zoneLoc);
  const [from, to] = windowRange();
  const ws = loc ? data.warnings.filter((w) => w.area === loc.area && w.start <= to && w.end >= from).sort((x, y) => rank(y.level) - rank(x.level)) : [];
  const dist = loc ? DISTRICT_BY_AREA[loc.area] : null;
  const shelters = dist ? data.curated.shelters.filter((x) => x.district === dist.id) : [];
  const group = (r, name) => `<optgroup label="${name}">${data.locations.filter((l) => l.region === r).map((l) => `<option value="${l.id}" ${l.id === state.zoneLoc ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>`;
  const top = ws[0];
  const next = loc ? upcoming([loc.area])[0] : null;
  const level = top ? top.level : 'verde';
  const kmTxt = (km) => (km < 1 ? `${Math.round(km * 10) * 100} m` : `${km.toFixed(1).replace('.', state.lang === 'en' ? '.' : ',')} km`);
  const phoneBtn = (p) => (p ? `<a class="zbtn" href="${esc(p.href || p.phoneHref)}"><span aria-hidden="true">📞</span> ${esc(p.display || p.phone)}</a>` : '');
  const mapLink = (url) => `<a class="zlink" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${L('Mapa', 'Map')} ↗</a>`;
  const find = (q) => `<a class="zlink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">${L('Procurar no mapa', 'Search on map')} ↗</a>`;

  const warn = `<div class="zwarn" style="--lc:${level === 'verde' ? '#8A857A' : `var(--${level})`}">
    ${top ? `<div style="display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center">${lvPill(top.level)}<strong>${esc(typeName(top.type))} · ${esc(loc.name)}</strong></div><span class="muted" style="font-size:14px">${esc(formatDayTime(top.start, state.lang))} → ${esc(formatDayTime(top.end, state.lang))}</span>` : `<strong>${L('Sem aviso em vigor neste momento', 'No warning in force right now')}</strong>`}
    ${next ? `<span style="font-size:14px">${L('A seguir', 'Next')}: ${lvPill(next.level)} ${esc(typeName(next.type))} · ${esc(formatDayTime(next.start, state.lang))}</span>` : ''}
    <span style="margin-top:2px">${sourceBadge(IPMA_SOURCE, { lang: state.lang })}</span></div>`;

  /* Câmara municipal */
  const c = data.contact; const m = c?.municipio;
  let camara;
  if (!c) {
    camara = zoneRow('🏛️', L('Câmara Municipal', 'Town hall'), data.contactErr ? L('Não foi possível obter os contactos. Consulte a câmara municipal.', 'Could not load the contacts. Contact your town hall.') : L('A procurar o seu concelho…', 'Finding your municipality…'), '');
  } else {
    const extra = m ? [m.address ? esc(m.address) : '', m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '', m.site ? `<a href="${esc(m.site)}" target="_blank" rel="noopener noreferrer">${esc(m.site.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : ''].filter(Boolean).join(' · ') : '';
    const where = c.byUser ? '' : ` (${L('localidade escolhida', 'chosen location')})`;
    camara = zoneRow('🏛️', `${L('Câmara Municipal de', 'Town hall of')} ${esc(c.concelho)}${where}`, `${L('Autoridade municipal de proteção civil', 'Municipal civil protection authority')}${extra ? `<br>${extra}` : ''}`, m ? phoneBtn(m) : '');
  }

  /* Bombeiros e farmácia mais próximos */
  const nb = data.nearby;
  const near = (emoji, title, part, q, kind) => {
    if (!nb) return zoneRow(emoji, title, L('A procurar…', 'Searching…'), '');
    if (!part || part.error) return zoneRow(emoji, title, L('Não foi possível obter este dado.', 'Could not load this.'), find(q));
    if (!part.place) return zoneRow(emoji, title, L(`Nenhum encontrado num raio de ${part.radiusKm} km.`, `None found within ${part.radiusKm} km.`), find(q));
    const p = part.place;
    const noPhoneNote = !p.phone && kind === 'fire' ? `<br>${L('Sem telefone registado: em emergência ligue 112.', 'No phone on record: in an emergency call 112.')}` : '';
    const sub = `${esc(kmTxt(p.km))} ${nb.byUser ? L('de si', 'from you') : L('da localidade escolhida', 'from the chosen location')}${p.address ? ` · ${esc(p.address)}` : ''}${noPhoneNote}`;
    const call = p.phone
      ? phoneBtn(p.phone)
      : kind === 'fire'
        ? `<a class="zbtn zbtn-alt" href="tel:112"><span aria-hidden="true">📞</span> 112</a>`
        : `<a class="zlink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name || 'farmácia'} ${p.address || ''}`.trim())}" target="_blank" rel="noopener noreferrer">${L('Ver telefone no mapa', 'See phone on map')} ↗</a>`;
    return zoneRow(emoji, esc(p.name || title), sub, `${call}${mapLink(p.mapUrl)}`);
  };
  const fire = near('🚒', L('Bombeiros mais próximos', 'Nearest fire station'), nb?.fire, 'quartel de bombeiros', 'fire');
  const pharmacy = near('💊', L('Farmácia mais próxima', 'Nearest pharmacy'), nb?.pharmacy, 'farmácia', 'pharmacy');

  const prociv = zoneRow('🛡️', L('Proteção Civil (ANEPC)', 'Civil Protection (ANEPC)'), L('Avisos e orientações oficiais', 'Official warnings and guidance'), `<a class="zlink" href="${ANEPC.url}" target="_blank" rel="noopener noreferrer">prociv.gov.pt ↗</a>`);
  const abrigos = zoneRow('⛺', L('Abrigos no distrito', 'Shelters in the district'), shelters.length ? shelters.slice(0, 3).map((x) => esc(txt(x.name))).join(' · ') : L('Sem abrigos registados. Siga as indicações da câmara municipal.', 'No shelters recorded. Follow your town hall’s instructions.'), '');

  return `<section aria-labelledby="h-zona"><h2 id="h-zona" class="h2">${L('Na sua zona', 'In your area')}</h2>
  <div class="card zone">
    <div class="zbar">
      <div class="field" style="flex:1 1 240px;max-width:380px"><label for="localidade" style="font-size:14px">${L('Localidade', 'Location')}</label><select id="localidade" data-a="zoneSel" data-key="localidade" style="min-height:48px;font-size:16px;width:100%">${group('continente', 'Continente')}${group('madeira', 'Madeira')}${group('acores', 'Açores')}</select></div>
      <button class="tab" data-a="geo" id="geo" style="display:inline-flex;align-items:center;gap:10px"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M9 1v3M9 14v3M1 9h3M14 9h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${L('Usar a minha localização', 'Use my location')}</button>
      <p id="geomsg" class="muted" style="margin:0;font-size:13.5px;flex:1 1 100%" role="status"></p>
    </div>
    ${warn}
    <ul class="zlist">${camara}${fire}${pharmacy}${prociv}${abrigos}</ul>
  </div></section>`;
}

function forecastSection() {
  const loc = locById(state.zoneLoc);
  const f = data.forecast && data.forecastLoc === state.zoneLoc ? data.forecast.slice(0, 3) : null;
  let body;
  if (f) {
    body = `<div class="grid">${f.map((d) => {
      const start = parseLisbon(`${d.date}T00:00:00`); const end = new Date(start.getTime() + 86400e3 - 1);
      const w = loc ? data.warnings.filter((x) => x.area === loc.area && x.start <= end && x.end >= start).sort((a, b) => rank(b.level) - rank(a.level))[0] : null;
      const wt = data.weatherTypes[d.weatherType]; const wd = wt ? wt[state.lang] || wt.pt : '';
      return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px"><strong class="h" style="font-size:20px;text-transform:capitalize">${esc(formatDay(start, state.lang))}</strong>${w ? lvPill(w.level) : lvPill('verde')}</div>
        <p style="margin:0 0 10px;font-size:15px">${esc(wd)}</p>
        <dl style="margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:15px"><dt class="muted">${L('Temperatura', 'Temperature')}</dt><dd class="num" style="margin:0;text-align:right"><strong>${d.tMin}°</strong> – <strong>${d.tMax}°C</strong></dd>
        <dt class="muted">${L('Probabilidade de chuva', 'Chance of rain')}</dt><dd class="num" style="margin:0;text-align:right"><strong>${Math.round(d.precipProb)}%</strong></dd>
        <dt class="muted">${L('Vento', 'Wind')}</dt><dd style="margin:0;text-align:right"><strong>${esc(WIND_CLASS[state.lang][d.windClass] || '—')}</strong> ${esc(d.windDir || '')}</dd>
        <dt class="muted">${L('Chuva', 'Rain')}</dt><dd style="margin:0;text-align:right"><strong>${esc(PREC_CLASS[state.lang][d.precipClass] || '—')}</strong></dd></dl></div>`;
    }).join('')}</div>`;
  } else body = `<div class="empty">${data.forecastErr ? L('Não foi possível carregar a previsão do IPMA.', 'Could not load the IPMA forecast.') : L('A carregar previsão…', 'Loading forecast…')}</div>`;
  return `<section aria-labelledby="h-prev"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:14px"><h2 id="h-prev" style="font-size:26px">${L('Próximos 3 dias', 'Next 3 days')}${loc ? ` · ${esc(loc.name)}` : ''}</h2>${sourceBadge(IPMA_SOURCE, { lang: state.lang })}</div>${body}</section>`;
}

function emptyList(pt, en) { return `<div class="empty">${L(pt, en)}</div>`; }

const SERV_PAGE = 5; const FEED_PAGE = 6;

function pager(key, p) {
  if (p.pages <= 1) return '';
  return `<nav class="pager" aria-label="${L('Paginação', 'Pagination')}"><button class="tab" data-a="pg" data-v="${key}-prev"${p.page <= 1 ? ' disabled' : ''}>← ${L('Anterior', 'Previous')}</button><span class="num muted" aria-live="polite">${L('Página', 'Page')} ${p.page} ${L('de', 'of')} ${p.pages} · ${p.total}</span><button class="tab" data-a="pg" data-v="${key}-next"${p.page >= p.pages ? ' disabled' : ''}>${L('Seguinte', 'Next')} →</button></nav>`;
}

function servicesSection() {
  const all = data.curated.services;
  const idx = state.lang === 'en' ? 1 : 0;
  const types = Object.keys(TYPE_NAMES).filter((t) => all.some((x) => x.type === t));
  const cur = types.includes(state.svc) ? state.svc : 'todas';
  const filtered = cur === 'todas' ? all : all.filter((x) => x.type === cur);
  const p = paginate(filtered, state.pg.serv, SERV_PAGE);
  state.pg.serv = p.page;
  const chip = (k, label, n) => `<button class="chip ${cur === k ? 'on' : ''}" aria-pressed="${cur === k}" data-a="svcf" data-v="${k}">${label} <span class="num" style="opacity:.75">${n}</span></button>`;
  const filters = types.length > 1
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px" role="group" aria-label="${L('Filtrar por categoria', 'Filter by category')}">${chip('todas', L('Todas', 'All'), all.length)}${types.map((t) => chip(t, `<span aria-hidden="true">${TYPE_EMOJI[t] || '📌'}</span> ${esc(TYPE_NAMES[t][idx])}`, all.filter((x) => x.type === t).length)).join('')}</div>`
    : '';
  const rows = p.items.map((x) => `<div class="li"><span class="k"><span aria-hidden="true">${TYPE_EMOJI[x.type] || '📌'}</span> ${esc(TYPE_NAMES[x.type]?.[idx] || x.type)}</span><span class="n">${esc(txt(x.name))}</span><span class="st ${STATUS_CLASS[x.status] || 'st-gry'}">${esc(STATUS_NAMES[x.status]?.[idx] || x.status)}</span>${sourceBadge(x.source, { lang: state.lang })}</div>`).join('');
  return `<section aria-labelledby="h-serv"><h2 id="h-serv" class="h2">${L('Estradas, transportes e serviços', 'Roads, transport and services')}</h2>${filters}${filtered.length ? `<div class="card list" style="padding:8px 20px 14px">${rows}${pager('serv', p)}</div>` : emptyList('Sem cortes ou condicionamentos registados ainda.', 'No closures or restrictions recorded yet.')}</section>`;
}
function sheltersSection() {
  const s = data.curated.shelters;
  return `<section aria-labelledby="h-abr"><h2 id="h-abr" class="h2">${L('Abrigos e pontos de apoio', 'Shelters and support points')}</h2>${s.length ? `<div class="grid">${s.map((a) => `<div class="card"><p class="muted" style="margin:0;font-size:13px;font-weight:600">${esc(a.place || DISTRICT_BY_ID[a.district]?.name || '')}</p><h3 style="font-size:18px;margin:2px 0 4px">${esc(txt(a.name))}</h3><p style="margin:0 0 10px;font-size:14px">${esc(a.address || '')}</p>${sourceBadge(a.source, { lang: state.lang })}</div>`).join('')}</div>` : emptyList('Ainda não há abrigos registados. Siga as indicações da sua câmara municipal e da Proteção Civil.', 'No shelters recorded yet. Follow your municipality and Civil Protection instructions.')}</section>`;
}
function mythsSection() {
  const m = data.curated.myths;
  return `<section aria-labelledby="h-boatos"><h2 id="h-boatos" class="h2">${L('Boatos desmentidos', 'Debunked rumours')}</h2><p class="muted" style="margin:-6px 0 14px">${L('Informação falsa a circular e o que dizem fontes oficiais ou verificadores de factos.', 'False information in circulation and what official sources or fact-checkers say.')}</p>${m.length ? `<div class="grid">${m.map((x) => `<div class="card" style="display:flex;flex-direction:column;gap:12px"><div><span class="st st-red">${L('FALSO', 'FALSE')}</span><p style="margin:8px 0 0;font-weight:600;text-decoration:line-through;text-decoration-color:#D1242F">${esc(txt(x.claim))}</p></div><div><span class="st st-gry">${L('O QUE DIZEM AS FONTES', 'WHAT SOURCES SAY')}</span><p style="margin:8px 0 0;font-size:15px">${esc(txt(x.fact))}</p></div><div style="margin-top:auto">${sourceBadge(x.source, { lang: state.lang })}</div></div>`).join('')}</div>` : emptyList('Nenhum boato desmentido até ao momento.', 'No debunked rumours so far.')}</section>`;
}
function feedSection() {
  const cats = [['todas', L('Todas', 'All')], ['governamental', CATEGORIES.governamental.label[state.lang]], ['comunicacao_social', CATEGORIES.comunicacao_social.label[state.lang]], ['redes_sociais', CATEGORIES.redes_sociais.label[state.lang]]];
  const filtered = data.curated.feed.filter((f) => state.cat === 'todas' || f.source.category === state.cat).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const p = paginate(filtered, state.pg.feed, FEED_PAGE);
  state.pg.feed = p.page;
  const rows = p.items.map((f) => `<article class="li"><time class="num" datetime="${esc(f.time)}">${esc(formatTime(new Date(f.time), state.lang))}</time><span class="n" style="font-weight:600">${esc(txt(f.title))}</span>${sourceBadge(f.source, { verified: f.verified, lang: state.lang })}</article>`).join('');
  return `<section aria-labelledby="h-feed"><div style="display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between;margin-bottom:14px"><h2 id="h-feed" style="font-size:26px">${L('Últimas informações', 'Latest updates')}</h2><div style="display:flex;flex-wrap:wrap;gap:8px" role="group" aria-label="${L('Filtrar por categoria de fonte', 'Filter by source category')}">${cats.map(([k, l]) => `<button class="chip ${state.cat === k ? 'on' : ''}" aria-pressed="${state.cat === k}" data-a="cat" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>
  ${filtered.length ? `<div class="card list" style="padding:8px 20px 14px">${rows}${pager('feed', p)}</div>` : emptyList('Sem informações nesta categoria ainda.', 'No updates in this category yet.')}</section>`;
}
function howSection() {
  return `<section id="como" aria-labelledby="h-como"><h2 id="h-como" class="h2">${L('Como calculamos o impacto', 'How we calculate impact')}</h2><div class="card tinted" style="display:flex;flex-direction:column;gap:10px;font-size:15px"><p style="margin:0">${L(`Cada distrito recebe uma base pelo seu aviso do IPMA (verde ${BASE.verde}, amarelo ${BASE.amarelo}, laranja ${BASE.laranja}, vermelho ${BASE.vermelho}), considerando os avisos em vigor neste momento. A isso somam-se pontos pelas ocorrências do distrito: peso da fonte × gravidade (1 a 3) × 5. O máximo é 100. Abaixo de 10 não há impacto relevante; 10 a 24 é moderado; 25 a 49 é alto; 50 ou mais é muito alto.`, `Each district gets a base from its IPMA warning (green ${BASE.verde}, yellow ${BASE.amarelo}, orange ${BASE.laranja}, red ${BASE.vermelho}), using the warnings in force right now. Points for the district’s incidents are added: source weight × severity (1 to 3) × 5. The maximum is 100. Below 10 is negligible; 10 to 24 moderate; 25 to 49 high; 50 or more very high.`)}</p><p style="margin:0" class="muted">${L('Pesos das fontes', 'Source weights')}: ${L('governamental', 'government')} ${WEIGHTS.governamental} · ${L('comunicação social', 'news media')} ${WEIGHTS.comunicacao_social} · ${L('redes sociais verificada', 'social media, verified')} ${WEIGHTS.redes_sociais_verificada} · ${L('redes sociais não verificada', 'social media, unverified')} ${WEIGHTS.redes_sociais_nao_verificada}.</p></div></section>`;
}
const FEEDBACK_EMAIL = 'hello@emanuelsmarques.pt';
const backLink = () => `<a href="./" style="display:inline-flex;align-items:center;min-height:44px;font-weight:600">← ${L('Voltar ao início', 'Back to home')}</a>`;

function howPage() {
  return `<div>${backLink()}${howSection()}
    <p style="margin:24px 0 0">${L('Veja de onde vêm os dados na página', 'See where the data comes from on the')} <a href="fontes.html">${L('Fontes', 'Sources')}</a>.</p></div>`;
}

/** Fontes citadas nos dados curados, agrupadas por categoria. */
function citedSources() {
  const map = new Map();
  const all = [...data.curated.feed, ...data.curated.incidents, ...data.curated.services, ...data.curated.shelters, ...data.curated.myths];
  for (const it of all) {
    const src = it.source; if (!src?.name || !safeUrl(src.url)) continue;
    const key = `${src.category}|${src.name}`;
    const cur = map.get(key) ?? { ...src, n: 0 };
    cur.n += 1; map.set(key, cur);
  }
  return ['governamental', 'comunicacao_social', 'redes_sociais'].map((cat) => ({ cat, items: [...map.values()].filter((x) => x.category === cat).sort((x, y) => y.n - x.n) }));
}

function sourcesPage() {
  const ext = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`;
  const block = (emoji, title, body) => `<div class="card"><h3 style="font-size:18px;margin:0 0 8px"><span aria-hidden="true">${emoji}</span> ${title}</h3><div style="display:flex;flex-direction:column;gap:8px;font-size:15px">${body}</div></div>`;
  const upd = data.curated.meta.updatedAt ? formatDayTime(new Date(data.curated.meta.updatedAt), state.lang) : L('ainda sem dados', 'no data yet');
  const cited = citedSources().map(({ cat, items }) => {
    const c = CATEGORIES[cat];
    return `<div><span class="badge ${c.cls}"><span class="shape ${c.shape}"></span>${esc(c.label[state.lang])}</span>${items.length ? `<ul style="margin:8px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:4px">${items.map((x) => `<li>${ext(x.url, x.name)} <span class="muted">(${x.n})</span></li>`).join('')}</ul>` : `<p class="muted" style="margin:8px 0 0">${L('Ainda sem itens.', 'No items yet.')}</p>`}</div>`;
  }).join('');
  return `<div>${backLink()}
  <h2 id="h-src" style="font-size:34px;margin:8px 0 6px">${L('Fontes dos dados', 'Data sources')}</h2>
  <p class="muted" style="margin:0 0 20px;max-width:680px">${L('Cada informação do site indica a categoria da fonte e o link original. Aqui está o que usamos e de onde vem.', 'Every item on the site shows its source category and original link. Here is what we use and where it comes from.')}</p>
  <div class="grid">
    ${block('🌦️', 'IPMA', `<p style="margin:0">${L('Avisos meteorológicos e previsão, lidos em tempo real neste dispositivo, com cópia local se a rede falhar.', 'Weather warnings and forecast, read live on this device, with a local copy if the network fails.')}</p>${sourceBadge(IPMA_SOURCE, { lang: state.lang })}`)}
    ${block('⏱️', 'Open-Meteo', `<p style="margin:0">${L('Tempo nas próximas 4 horas (temperatura, probabilidade de chuva e rajadas), hora a hora. O IPMA só publica previsão diária em dados abertos.', 'Weather for the next 4 hours (temperature, chance of rain and gusts), hour by hour. IPMA only publishes daily forecasts as open data.')}</p>${ext(OPEN_METEO_SITE, 'open-meteo.com')} <span class="muted">CC BY 4.0</span>`)}
    ${block('🗺️', L('Mapa e distritos', 'Map and districts'), `<p style="margin:0">${L('Contornos dos distritos a partir da Carta Administrativa Oficial de Portugal (CAOP), da Direção-Geral do Território, simplificados para o desenho do mapa.', 'District outlines from the Official Administrative Map of Portugal (CAOP), Directorate-General for the Territory, simplified for the map drawing.')}</p>`)}
    ${block('📍', 'geoapi.pt', `<p style="margin:0">${L('Concelho a partir da localização e contactos da câmara municipal (telefone, email, site, morada).', 'Municipality from your location and town-hall contacts (phone, email, website, address).')}</p>${ext(GEOAPI_SITE, 'geoapi.pt')}`)}
    ${block('💊', 'OpenStreetMap', `<p style="margin:0">${L('Farmácias e quartéis de bombeiros mais próximos. Localizações e telefones dos colaboradores do OpenStreetMap: podem estar incompletos e a farmácia pode não estar de serviço. Em alternativa, procuramos em tempo real com o Photon (Komoot) e o Nominatim.', 'Nearest pharmacies and fire stations. Locations and phones from OpenStreetMap contributors: they may be incomplete and the pharmacy may not be on duty. As a fallback we search live with Photon (Komoot) and Nominatim.')}</p><p style="margin:0">${L('Dados', 'Data')} © ${ext(OSM_COPYRIGHT, L('colaboradores do OpenStreetMap', 'OpenStreetMap contributors'))} (ODbL).</p>`)}
  </div>
  <section aria-labelledby="h-cit" style="margin-top:32px"><h2 id="h-cit" class="h2">${L('Fontes citadas nas ocorrências, notícias e serviços', 'Sources cited in incidents, news and services')}</h2>
    <div class="card" style="display:flex;flex-direction:column;gap:16px">
      <p class="muted" style="margin:0;font-size:14px">${L('Atualizado de hora a hora. Última atualização', 'Updated hourly. Last update')}: ${esc(upd)}. ${L('Os números indicam quantos itens citam cada fonte. Relatos de redes sociais (X e hashtags públicas da Mastodon) aparecem sempre como não verificados.', 'Numbers show how many items cite each source. Social media reports (X and public Mastodon hashtags) always appear as unverified.')}</p>
      ${cited}
    </div></section></div>`;
}

function feedbackPage() {
  const opt = (v, pt, en) => `<option value="${v}">${L(pt, en)}</option>`;
  return `<section aria-labelledby="h-fb">${backLink()}
  <h2 id="h-fb" style="font-size:34px;margin:8px 0 6px">${L('Feedback e erros', 'Feedback and errors')}</h2>
  <p class="muted" style="margin:0 0 18px;max-width:640px">${L('Encontrou um erro nos dados, no mapa ou no site, ou tem uma sugestão? Preencha abaixo: abre-se a sua aplicação de email com a mensagem pronta para', 'Found an error in the data, the map or the site, or have a suggestion? Fill in below: your email app opens with the message ready for')} <a href="mailto:${FEEDBACK_EMAIL}">${FEEDBACK_EMAIL}</a>. ${L('Nada é enviado automaticamente.', 'Nothing is sent automatically.')}</p>
  <form id="fb" class="card" style="display:flex;flex-direction:column;gap:16px;max-width:640px">
    <div class="field"><label for="fb-type" style="font-size:14px">${L('Tipo', 'Type')}</label><select id="fb-type" name="type" style="width:100%">${opt('erro-dados', 'Erro nos dados (aviso, ocorrência, contacto)', 'Data error (warning, incident, contact)')}${opt('erro-site', 'Erro no site (não funciona, aspeto)', 'Site error (not working, appearance)')}${opt('sugestao', 'Sugestão', 'Suggestion')}${opt('outro', 'Outro', 'Other')}</select></div>
    <div class="field"><label for="fb-where" style="font-size:14px">${L('Onde (página, distrito ou endereço)', 'Where (page, district or address)')}</label><input id="fb-where" name="where" type="text" autocomplete="off"></div>
    <div class="field"><label for="fb-msg" style="font-size:14px">${L('O que se passa', 'What is wrong')}</label><textarea id="fb-msg" name="msg" rows="6" required></textarea></div>
    <div><button class="tab on" type="submit">${L('Abrir email', 'Open email')}</button></div>
  </form></section>`;
}

function footer() {
  return `<footer class="foot"><div><strong style="color:var(--ink)">${L('Sobre este site', 'About this site')}</strong><p style="margin:6px 0 0">${L('Não é um serviço oficial e não substitui os avisos da Proteção Civil nem do IPMA. Cada informação indica a fonte e o link original. Relatos de redes sociais aparecem sempre como não verificados.', 'This is not an official service and does not replace Civil Protection or IPMA warnings. Every item shows its source and original link. Social media reports always appear as unverified.')}</p></div>
  <div><strong style="color:var(--ink)">${L('Dados', 'Data')}</strong><p style="margin:6px 0 0">${L('Avisos e previsão: IPMA, lidos em tempo real neste dispositivo. Ocorrências, notícias e serviços: atualizados aproximadamente de hora a hora.', 'Warnings and forecast: IPMA, read live on this device. Incidents, news and services: updated roughly every hour.')}</p></div>
  <div><strong style="color:var(--ink)">${L('Mais', 'More')}</strong><p style="margin:6px 0 0"><a href="metodologia.html">${L('Como calculamos o impacto', 'How we calculate impact')}</a><br><a href="fontes.html">${L('Fontes dos dados', 'Data sources')}</a><br><a href="feedback.html">${L('Feedback e reportar um erro', 'Feedback and report an error')}</a></p></div></footer>`;
}

function recsLink() {
  const hi = highestLevel();
  return `<section aria-labelledby="h-rec"><a href="recomendacoes.html" class="card" style="display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between;text-decoration:none;color:var(--ink);background:var(--frame)"><span><span id="h-rec" class="h" style="display:block;font-size:26px;font-weight:700;line-height:1.2">${L('O que fazer', 'What to do')}</span><span class="muted" style="font-size:15px">${L('Conselhos de segurança em casa, na estrada e perto da costa.', 'Safety advice at home, on the road and near the coast.')}</span></span><span style="display:inline-flex;align-items:center;gap:12px">${lvPill(hi)}<span class="h" style="font-weight:600">${L('Ver conselhos', 'See advice')} →</span></span></a></section>`;
}

function recsPage() {
  const loc = locById(state.zoneLoc); const [from, to] = windowRange();
  const ws = loc ? data.warnings.filter((w) => w.area === loc.area && w.start <= to && w.end >= from) : [];
  const lvl = ws.reduce((m, w) => (rank(w.level) > rank(m) ? w.level : m), 'verde');
  const tabs = [['casa', L('Em casa', 'At home')], ['estrada', L('Na estrada', 'On the road')], ['costa', L('Perto da costa', 'Near the coast')]];
  return `<section aria-labelledby="h-r"><a href="./" style="display:inline-flex;align-items:center;min-height:44px;font-weight:600">← ${L('Voltar ao início', 'Back to home')}</a>
  <h2 id="h-r" style="font-size:34px;margin:8px 0 6px">${L('O que fazer', 'What to do')}</h2>
  <p style="margin:0 0 18px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">${L('Nível em vigor na sua zona', 'Current level in your area')} (${esc(loc?.name || '—')}): ${lvPill(lvl)}</p>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px" role="group" aria-label="${L('Situação', 'Situation')}">${tabs.map(([k, l]) => `<button class="tab ${state.sit === k ? 'on' : ''}" aria-pressed="${state.sit === k}" data-a="sit" data-v="${k}"><span aria-hidden="true">${SIT_EMOJI[k]}</span> ${l}</button>`).join('')}</div>
  <div class="grid">${RECS[state.sit].map((r, i) => `<div class="card rec"><span class="n" aria-hidden="true">${REC_EMOJI[state.sit][i] || i + 1}</span><span><strong style="display:block;font-size:17px">${esc(r[0][state.lang === 'en' ? 1 : 0])}</strong><span class="muted">${esc(r[1][state.lang === 'en' ? 1 : 0])}</span></span></div>`).join('')}</div>
  <p style="margin:20px 0 0">${L('Conselhos de', 'Advice from')}: ${sourceBadge(ANEPC, { lang: state.lang })}</p></section>`;
}

/* ---------- página ---------- */
function pageHtml() {
  const imp = impact();
  const main = state.page === 'recs' ? recsPage() : state.page === 'how' ? howPage() : state.page === 'sources' ? sourcesPage() : state.page === 'feedback' ? feedbackPage()
    : [statusSection(imp), mapSection(imp), zoneSection(), recsLink(), servicesSection(), feedSection(), forecastSection(), sheltersSection(), mythsSection()].join('');
  return `<a class="skip" href="#main">${L('Saltar para o conteúdo', 'Skip to content')}</a>${emergencyBar()}${topbar()}<main id="main" class="sheet">${banners()}${main}</main>${footer()}`;
}

export function render() {
  const app = document.getElementById('app');
  const a = document.activeElement;
  const key = a && app.contains(a) ? (a.dataset.key || (a.dataset.a ? `${a.dataset.a}:${a.dataset.v ?? a.dataset.id ?? ''}` : null)) : null;
  const y = window.scrollY;
  const fb = document.getElementById('fb');
  const saved = fb ? Object.fromEntries(new FormData(fb)) : null;
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'pt-PT';
  app.innerHTML = pageHtml();
  window.scrollTo(0, y);
  if (saved) for (const [k, v] of Object.entries(saved)) { const el = app.querySelector(`#fb [name="${k}"]`); if (el) el.value = v; }
  if (key) {
    const el = [...app.querySelectorAll('[data-key],[data-a]')].find((e) => (e.dataset.key || `${e.dataset.a}:${e.dataset.v ?? e.dataset.id ?? ''}`) === key);
    el?.focus({ preventScroll: true });
  }
  app.querySelectorAll('img[data-hide-on-error]').forEach((img) => img.addEventListener('error', () => img.closest('figure')?.remove()));
}

function refreshMap() {
  const box = document.getElementById('mapbox');
  if (!box) return;
  const svg = box.querySelector('svg');
  if (svg) svg.outerHTML = mapSvg(impact());
}

/* ---------- interação ---------- */
function setView(v) {
  const w = Math.min(640, Math.max(160, v.w)); const h = w * (620 / 640);
  state.view = { w, h, x: Math.min(Math.max(v.x, 0), 640 - w), y: Math.min(Math.max(v.y, 0), 620 - h) };
  const svg = document.querySelector('#mapbox svg');
  if (svg) svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
}
function zoomBy(f, cx = 0.5, cy = 0.5) {
  const v = state.view; const w = v.w / f;
  setView({ w, x: v.x + (v.w - w) * cx, y: v.y + (v.h - w * 620 / 640) * cy });
  clearTimeout(zoomBy.t); zoomBy.t = setTimeout(refreshMap, 120);
}

function onClick(e) {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const { a, v, id } = el.dataset;
  if (a === 'lang') { state.lang = v; store.set('lang', v); }
  else if (a === 'region') { state.region = v; }
  else if (a === 'filt') { state.filt[v] = !state.filt[v]; }
  else if (a === 'cat') { state.cat = v; state.pg.feed = 1; }
  else if (a === 'svcf') { state.svc = v; state.pg.serv = 1; }
  else if (a === 'pg') {
    const [k, dir] = v.split('-');
    state.pg[k] = Math.max(1, (state.pg[k] || 1) + (dir === 'next' ? 1 : -1));
    render();
    document.getElementById(k === 'serv' ? 'h-serv' : 'h-feed')?.scrollIntoView({ block: 'start' });
    return;
  }
  else if (a === 'sit') { state.sit = v; }
  else if (a === 'district') { if (mapDrag.moved) return; state.userPicked = true; state.national = false; state.district = id; state.incidentId = null; }
  else if (a === 'pin') { if (mapDrag.moved) return; const i = data.curated.incidents.find((x) => x.id === id); if (i?.district) state.district = i.district; state.userPicked = true; state.national = false; state.incidentId = id; }
  else if (a === 'incident') { state.national = false; state.incidentId = id; }
  else if (a === 'national') { state.national = true; state.incidentId = null; }
  else if (a === 'back') { state.incidentId = null; }
  else if (a === 'zoom') { zoomBy(v === 'in' ? 1.5 : 1 / 1.5); return; }
  else if (a === 'geo') { return locate(); }
  else return;
  render();
}
function onSubmit(e) {
  if (e.target.id !== 'fb') return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const subject = `[Tempestade Charles] ${f.type || 'feedback'}`;
  const body = `${f.msg || ''}\n\n---\nOnde: ${f.where || '-'}\nIdioma: ${state.lang}\nPágina: ${document.referrer || location.origin}`;
  window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function onChange(e) {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  if (el.dataset.a === 'zoneSel') { setZone(Number(el.value)); }
}
function onKey(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('g[data-a]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
}

const mapDrag = { on: false, moved: false, x: 0, y: 0 };
function onPointerDown(e) {
  const svg = e.target.closest?.('#mapbox svg');
  if (!svg || e.button) return;
  mapDrag.on = true; mapDrag.moved = false; mapDrag.x = e.clientX; mapDrag.y = e.clientY;
}
function onPointerMove(e) {
  if (!mapDrag.on) return;
  const dx = e.clientX - mapDrag.x; const dy = e.clientY - mapDrag.y;
  if (!mapDrag.moved && Math.hypot(dx, dy) < 5) return;
  mapDrag.moved = true;
  const box = document.querySelector('#mapbox svg'); if (!box) return;
  const ppu = Math.min(box.clientWidth / state.view.w, box.clientHeight / state.view.h) || 1;
  mapDrag.x = e.clientX; mapDrag.y = e.clientY;
  setView({ ...state.view, x: state.view.x - dx / ppu, y: state.view.y - dy / ppu });
  box.classList.add('drag');
}
function onPointerUp() {
  if (!mapDrag.on) return;
  mapDrag.on = false;
  document.querySelector('#mapbox svg')?.classList.remove('drag');
  setTimeout(() => { mapDrag.moved = false; }, 0);
}
function onWheel(e) {
  const box = e.target.closest?.('#mapbox');
  if (!box) return;
  e.preventDefault();
  const r = box.getBoundingClientRect();
  zoomBy(e.deltaY < 0 ? 1.25 : 0.8, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
}

function setZone(id, { keepDistrict = false, here = null } = {}) {
  state.zoneLoc = id; store.set('zoneLoc', String(id));
  const loc = locById(id); const d = loc && DISTRICT_BY_AREA[loc.area];
  if (d && !keepDistrict) state.district = d.id;
  if (loc) resolveContacts(here ?? loc, !!here);
  if (!here && !state.here) loadWx();
  loadForecast(); render();
}

let contactSeq = 0;
/** Concelho e contactos do município para um ponto {lat, lon}. */
async function resolveContacts(pt, byUser = false) {
  const seq = ++contactSeq;
  data.nearby = null;
  lookupNearby(pt).then((n) => { if (seq === contactSeq) { data.nearby = { ...n, byUser }; render(); } });
  try {
    const c = await lookupContacts(pt.lat, pt.lon);
    if (seq !== contactSeq) return;
    data.contact = { ...c, byUser }; data.contactErr = null;
  } catch (e) {
    if (seq !== contactSeq) return;
    data.contact = null; data.contactErr = String(e.message || e);
  }
  render();
}

const zoneStored = store.get('zoneLoc', null) !== null;
/** Ao abrir: escolhe distrito, localidade e contactos pela localização do utilizador (com a sua permissão). */
function autoLocate() {
  const noAccess = () => { state.locNote = L('Sem acesso à localização: a mostrar o distrito com maior impacto', 'No location access: showing the district with the highest impact'); render(); };
  if (!navigator.geolocation) return;
  const go = () => navigator.geolocation.getCurrentPosition((p) => {
    const here = { lat: p.coords.latitude, lon: p.coords.longitude };
    state.here = here; loadWx();
    const did = districtAt(here.lat, here.lon);
    if (did && !state.userPicked) state.district = did;
    state.locNote = did ? L('Distrito pela sua localização', 'District from your location') : L('Localização fora de Portugal continental', 'Location outside mainland Portugal');
    const best = data.locations.map((l) => ({ l, km: haversineKm(here, l) })).sort((a, b) => a.km - b.km)[0];
    if (best && best.km <= 120) { if (!zoneStored) setZone(best.l.id, { keepDistrict: true, here }); else resolveContacts(here, true); }
    else render();
  }, noAccess, { timeout: 8000, maximumAge: 300000 });
  try {
    navigator.permissions.query({ name: 'geolocation' }).then((r) => (r.state === 'denied' ? noAccess() : go())).catch(go);
  } catch { go(); }
}
function locate() {
  const msg = document.getElementById('geomsg');
  const say = (t) => { if (msg) msg.textContent = t; };
  if (!navigator.geolocation) return say(L('Este dispositivo não permite localização.', 'This device does not support location.'));
  say(L('A obter localização…', 'Getting location…'));
  navigator.geolocation.getCurrentPosition((p) => {
    const here = { lat: p.coords.latitude, lon: p.coords.longitude };
    const best = data.locations.map((l) => ({ l, km: haversineKm(here, l) })).sort((a, b) => a.km - b.km)[0];
    if (!best || best.km > 120) return say(L('Parece estar fora de Portugal ou longe de qualquer estação do IPMA. Escolha a localidade na lista.', 'You seem to be outside Portugal or far from any IPMA station. Pick a location from the list.'));
    state.userPicked = true; state.here = here; setZone(best.l.id, { here });
    const m2 = document.getElementById('geomsg'); if (m2) m2.textContent = `${L('Localidade mais próxima', 'Nearest location')}: ${best.l.name}`;
  }, () => say(L('Não foi possível obter a localização. Escolha a localidade na lista.', 'Could not get your location. Pick a location from the list.')), { timeout: 8000, maximumAge: 300000 });
}

/* ---------- dados ---------- */
async function loadWarnings() {
  try {
    const r = await fetchCached(IPMA.warnings);
    data.warnings = normalizeWarnings(r.data); data.warnFetchedAt = r.fetchedAt; data.warnCache = r.fromCache; data.warnErr = null;
  } catch (e) { data.warnErr = String(e.message || e); }
}
async function loadForecast() {
  const id = state.zoneLoc;
  try {
    const r = await fetchCached(IPMA.forecast(id));
    if (id !== state.zoneLoc) return;
    data.forecast = normalizeForecast(r.data); data.forecastLoc = id; data.forecastErr = null;
  } catch (e) { data.forecastErr = String(e.message || e); data.forecast = null; }
  render();
}
async function loadAll() {
  const [cur] = await Promise.all([loadCurated(fetch, './data/'), loadWarnings()]);
  data.curated = cur.data; data.curatedErrors = cur.errors; data.curatedLoaded = true;
  render();
}

function tick() {
  state.now = new Date();
  const c = countdown(state.now, STORM_START);
  const t = document.getElementById('cd-t');
  if (t && !c.done) t.textContent = `${c.days ? `${c.days}d ` : ''}${pad2(c.hours)}:${pad2(c.minutes)}:${pad2(c.seconds)}`;
  else if (c.done && !document.getElementById('cd')?.classList.contains('live')) render();
}

export async function start() {
  const app = document.getElementById('app');
  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  app.addEventListener('submit', onSubmit);
  app.addEventListener('keydown', onKey);
  app.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  app.addEventListener('wheel', onWheel, { passive: false });
  try {
    const res = await fetch('./data/locations.json');
    data.locations = normalizeLocations(await res.json());
  } catch { data.locations = []; }
  fetchCached(IPMA.weatherTypes).then((r) => { data.weatherTypes = normalizeWeatherTypes(r.data); render(); }).catch(() => {});
  render();
  const sl = locById(state.zoneLoc); if (sl) resolveContacts(sl);
  loadForecast();
  autoLocate();
  loadWx();
  await loadAll();
  setInterval(tick, 1000);
  setInterval(async () => { await loadAll(); loadForecast(); loadWx(); }, REFRESH_MS);
}
