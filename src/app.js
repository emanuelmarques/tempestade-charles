import { escapeHtml as esc, safeUrl } from './lib/safe.js';
import { CATEGORIES, sourceBadge } from './lib/sources.js';
import { computeImpact, LEVELS, BASE, WEIGHTS } from './lib/impact.js';
import { countdown, parseLisbon, freshness, formatTime, formatDayTime, formatDay, pad2, STORM_START_LOCAL } from './lib/time.js';
import { toMap } from './lib/projection.js';
import { districtAt } from './lib/districtAt.js';
import { lookupContacts, GEOAPI_SITE } from './data/geoapi.js';
import { haversineKm } from './lib/geo.js';
import { DISTRICTS, DISTRICT_BY_ID, DISTRICT_BY_AREA, LAND_PATH } from './data/districts.js';
import { IPMA, IPMA_SOURCE, WIND_CLASS, PREC_CLASS, normalizeWarnings, normalizeForecast, normalizeWeatherTypes, normalizeLocations, fetchCached } from './data/ipma.js';
import { loadCurated } from './data/curated.js';
import { RECS, ANEPC, LEVEL_EN, TIER_NAMES, TYPE_EN, AREA_NAMES, ISLAND_AREAS, STATUS_CLASS, STATUS_NAMES, TYPE_NAMES } from './content.js';

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
  win: 'now', region: 'continente', district: null, userPicked: false, locNote: '', incidentId: null,
  filt: { governamental: true, comunicacao_social: true, redes_sociais: true },
  sit: 'casa', cat: 'todas', zoneLoc: Number(store.get('zoneLoc', '1100900')) || 1100900,
  view: { x: 0, y: 0, w: 640, h: 620 }, now: new Date(),
};
const data = {
  curated: { meta: { updatedAt: null }, incidents: [], feed: [], services: [], shelters: [], myths: [] }, curatedErrors: {}, curatedLoaded: false,
  warnings: [], warnErr: null, warnFetchedAt: null, warnCache: false,
  contact: null, contactErr: null, locations: [], forecast: null, forecastErr: null, forecastLoc: null, weatherTypes: {},
};

const L = (pt, en) => (state.lang === 'en' ? en : pt);
const txt = (t) => (t && typeof t === 'object' ? (t[state.lang] || t.pt || '') : t ?? '');
const lvName = (l) => (state.lang === 'en' ? LEVEL_EN[l] : l);
const typeName = (t) => (state.lang === 'en' ? TYPE_EN[t] || t : t);
const lvPill = (l, extra = '') => `<span class="lv lv-${l}${extra}">${esc(lvName(l)[0].toUpperCase() + lvName(l).slice(1))}</span>`;

/* ---------- derivados ---------- */
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
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start">
        <p style="margin:0;display:inline-flex;align-items:center;gap:8px;font-size:14px"><span style="width:10px;height:10px;border-radius:50%;background:${f.dot};flex:none"></span>${esc(f.text)}</p>
        <div style="display:flex" role="group" aria-label="${L('Idioma', 'Language')}">
          <button class="seg ${state.lang === 'pt' ? 'on' : ''}" aria-pressed="${state.lang === 'pt'}" data-a="lang" data-v="pt" lang="pt">PT</button>
          <button class="seg ${state.lang === 'en' ? 'on' : ''}" aria-pressed="${state.lang === 'en'}" data-a="lang" data-v="en" lang="en">EN</button>
        </div>
      </div>
    </div></header>`;
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
  const box = document.getElementById('mapbox');
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
  const v = state.view; const cur = curDistrict(imp);
  const dists = DISTRICTS.map((d) => {
    const r = imp.get(d.id); const sel = d.id === cur;
    const tierName = TIER_NAMES[r.tier][state.lang === 'en' ? 1 : 0];
    return `<g class="dist" tabindex="0" role="button" data-a="district" data-id="${d.id}" aria-label="${esc(d.name)}: ${L('impacto', 'impact')} ${tierName}${r.top ? `, ${L('aviso', 'warning')} ${lvName(r.top.level)}` : ''}" style="cursor:pointer"><path d="${d.d}" fill="${TIER_FILL[r.tier]}" stroke="${sel ? '#15202B' : '#fff'}" stroke-width="${sel ? 3.5 : 1.5}"/><text x="${d.lx}" y="${d.ly}" text-anchor="middle" fill="${r.tier === 3 ? '#fff' : '#15202B'}">${esc(d.name)}</text></g>`;
  }).join('');
  return `<svg viewBox="${v.x} ${v.y} ${v.w} ${v.h}" role="group" aria-label="${L('Mapa de Portugal continental por distrito', 'Map of mainland Portugal by district')}"><g transform="translate(60,0)"><path d="${LAND_PATH}" fill="#F0EEE6" stroke="none"/><text x="262" y="368" font-family="'Inter Variable',sans-serif" font-size="13" letter-spacing="4" fill="#4A5663" font-weight="600">ESPANHA</text>${dists}${mapPins()}</g></svg>`;
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
    return `<div class="card"><h3 style="font-size:18px">${esc(AREA_NAMES[a])}</h3>${ws.length ? ws.map((w) => warningLine(w)).join('') : `<p class="muted" style="margin:8px 0 0">${L('Sem aviso em vigor.', 'No warning in force.')}</p>`}</div>`;
  }).join('');
  return `<div class="grid" style="margin-top:4px">${rows}</div><p class="muted" style="font-size:14px;margin:12px 0 0">${L('O desenho do mapa ainda não inclui Açores e Madeira; os avisos do IPMA são mostrados em lista.', 'The map drawing does not include the Azores and Madeira yet; IPMA warnings are listed instead.')} ${sourceBadge(IPMA_SOURCE, { lang: state.lang })}</p>`;
}

function warningLine(w) {
  return `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--frame);font-size:14px"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${lvPill(w.level)} <strong>${esc(typeName(w.type))}</strong></div><div class="muted" style="margin-top:4px">${esc(formatDayTime(w.start, state.lang))} → ${esc(formatDayTime(w.end, state.lang))}</div>${w.text ? `<div style="margin-top:4px">${esc(w.text)}</div>` : ''}</div>`;
}

function districtPanel(imp) {
  const d = DISTRICT_BY_ID[curDistrict(imp)]; const r = imp.get(d.id);
  const list = data.curated.incidents.filter((i) => i.district === d.id).sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 3);
  const shown = r.count === 0 ? L('nenhuma', 'none') : list.length < r.count ? `${L('as', 'the')} ${list.length} ${L('mais recentes de', 'most recent of')} ${r.count}` : `${r.count} ${L('no total', 'in total')}`;
  const tname = TIER_NAMES[r.tier][state.lang === 'en' ? 1 : 0];
  return `<div style="display:flex;flex-direction:column;gap:14px"><div><p class="muted" style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">${L('Distrito', 'District')}</p><h3 style="font-size:28px;line-height:1.15">${esc(d.name)}</h3></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px"><span class="lv ${TIER_CLASS[r.tier]}">${L('Impacto', 'Impact')} ${tname}</span><span class="lv lv-${r.top ? r.top.level : 'verde'}">${L('Aviso', 'Warning')} ${r.top ? lvName(r.top.level) : L('verde', 'green')}</span></div>
    <div><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="h num" style="font-size:34px;font-weight:700;line-height:1">${r.score}<small style="font-size:16px;font-weight:600">/100</small></span><span class="muted" style="font-size:13px">${esc(winLabel())}</span></div>
      <div class="bar"><div class="${TIER_CLASS[r.tier]}" style="width:${r.score}%"></div></div>
      <p class="muted" style="margin:8px 0 0;font-size:13.5px">${L('Aviso IPMA', 'IPMA warning')} <strong style="color:var(--ink)">+${r.base}</strong> · ${L('Ocorrências', 'Incidents')} <strong style="color:var(--ink)">+${r.points}</strong></p></div>
    <div><h4 class="h" style="font-size:16px;margin-bottom:2px">${L('Avisos do IPMA', 'IPMA warnings')}</h4>${r.warnings.length ? r.warnings.map(warningLine).join('') : `<p class="muted" style="margin:6px 0 0;font-size:14px">${L('Sem aviso em vigor neste momento.', 'No warning in force right now.')}</p>`}<div style="margin-top:8px">${sourceBadge(IPMA_SOURCE, { lang: state.lang })}</div></div>
    <div style="display:flex;flex-direction:column;gap:8px"><h4 class="h" style="font-size:16px;margin:0">${L('Ocorrências recentes', 'Recent incidents')} <span class="muted" style="font-weight:500;font-size:14px">· ${shown}</span></h4>
      ${r.count === 0 ? `<p class="muted" style="margin:0;font-size:14px">${L('Sem ocorrências registadas neste distrito.', 'No incidents recorded in this district.')}</p>` : ''}
      ${list.map((i) => { const c = CATEGORIES[i.source.category]; return `<button class="item" data-a="incident" data-id="${esc(i.id)}"><span class="muted" style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span>${esc(i.place || '')}</span><span class="num">${esc(formatTime(new Date(i.time), state.lang))}</span></span><span style="font-weight:600;font-size:15px">${esc(txt(i.title))}</span><span><span class="badge ${c.cls}"><span class="shape ${c.shape}"></span>${esc(c.label[state.lang])}</span>${i.source.category === 'redes_sociais' && !i.verified ? ` <span class="st st-org">${L('Não verificado', 'Unverified')}</span>` : ''}</span></button>`; }).join('')}</div></div>`;
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
  return `<section aria-labelledby="h-mapa"><div style="display:flex;flex-wrap:wrap;gap:8px 24px;align-items:baseline;justify-content:space-between;margin-bottom:14px"><h2 id="h-mapa" style="font-size:26px">${L('Mapa de impacto por distrito', 'District impact map')}</h2><p class="muted" style="margin:0;font-size:14px">${state.locNote ? `${esc(state.locNote)} · ` : ''}${L('Clique num distrito para ver o detalhe.', 'Select a district for details.')} <a href="#como">${L('Como calculamos', 'How we calculate')}</a></p></div>
  <div class="maprow"><div class="mapcol">
    <div class="row" style="justify-content:space-between"><div class="row">
      <div style="display:flex" role="group" aria-label="${L('Região', 'Region')}">${seg('region', [['continente', 'Continente'], ['acores', 'Açores'], ['madeira', 'Madeira']], state.region)}</div>
    </div>
      ${reg ? '' : `<div style="display:flex;flex-wrap:wrap;gap:8px" role="group" aria-label="${L('Filtrar ocorrências por categoria de fonte', 'Filter incidents by source category')}">${chips}</div>`}</div>
    ${reg ? regionPanel(state.region) : `<div class="mapbox" id="mapbox">${mapSvg(imp)}<div class="zoom"><button class="ctl" data-a="zoom" data-v="in" aria-label="${L('Aproximar', 'Zoom in')}">+</button><button class="ctl" data-a="zoom" data-v="out" aria-label="${L('Afastar', 'Zoom out')}">−</button></div>${legend()}</div>`}
  </div>
  <aside class="card panel" aria-live="polite" aria-label="${L('Detalhe', 'Details')}">${state.incidentId ? incidentPanel() : districtPanel(imp)}</aside></div></section>`;
}

/* ---------- zona ---------- */
function zoneSection() {
  const loc = locById(state.zoneLoc);
  const [from, to] = windowRange();
  const ws = loc ? data.warnings.filter((w) => w.area === loc.area && w.start <= to && w.end >= from).sort((a, b) => rank(b.level) - rank(a.level)) : [];
  const dist = loc ? DISTRICT_BY_AREA[loc.area] : null;
  const shelters = dist ? data.curated.shelters.filter((s) => s.district === dist.id) : [];
  const group = (r, name) => `<optgroup label="${name}">${data.locations.filter((l) => l.region === r).map((l) => `<option value="${l.id}" ${l.id === state.zoneLoc ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>`;
  const top = ws[0];
  return `<section aria-labelledby="h-zona"><h2 id="h-zona" class="h2">${L('Na sua zona', 'In your area')}</h2>
  <div class="card" style="display:flex;flex-wrap:wrap;gap:28px"><div style="flex:1 1 320px;display:flex;flex-direction:column;gap:14px;min-width:0">
    <div class="field"><label for="localidade" style="font-size:14px">${L('Localidade (estações IPMA)', 'Location (IPMA stations)')}</label><select id="localidade" data-a="zoneSel" data-key="localidade" style="min-height:48px;font-size:16px">${group('continente', 'Continente')}${group('madeira', 'Madeira')}${group('acores', 'Açores')}</select></div>
    <div><button class="tab" data-a="geo" id="geo" style="display:inline-flex;align-items:center;gap:10px"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M9 1v3M9 14v3M1 9h3M14 9h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${L('Usar a minha localização', 'Use my location')}</button><p id="geomsg" class="muted" style="margin:6px 0 0;font-size:13.5px" role="status"></p></div>
    <div style="background:${top ? '#FDEBD3' : 'var(--frame)'};border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px">
      ${top ? `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">${lvPill(top.level)}<strong>${esc(typeName(top.type))} · ${esc(loc.name)}</strong></div><p style="margin:0;font-size:14px">${esc(formatDayTime(top.start, state.lang))} → ${esc(formatDayTime(top.end, state.lang))}</p>` : `<strong>${L('Sem aviso em vigor neste momento', 'No warning in force right now')}</strong>`}
      ${sourceBadge(IPMA_SOURCE, { lang: state.lang })}</div></div>
  <div style="flex:1 1 360px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:12px;min-width:0">
    <a href="tel:112" style="text-decoration:none;color:#fff;background:#D1242F;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;justify-content:center;min-height:72px"><span class="h" style="font-size:30px;font-weight:700">112</span><span style="font-size:14px">${L('Emergência: bombeiros, INEM, PSP e GNR', 'Emergency: fire, ambulance, police')}</span></a>
    <a href="tel:808242424" class="card tinted" style="text-decoration:none;color:var(--ink);padding:14px 16px"><span class="muted" style="display:block;font-size:13px">SNS 24</span><span class="h num" style="font-size:20px;font-weight:700">808 24 24 24</span></a>
    ${municipalCard()}
    <a href="${ANEPC.url}" target="_blank" rel="noopener noreferrer" class="card tinted" style="text-decoration:none;color:var(--ink);padding:14px 16px"><span class="muted" style="display:block;font-size:13px">${L('Proteção civil', 'Civil protection')}</span><span style="font-weight:600">${L('Contactos e orientações (ANEPC)', 'Contacts and guidance (ANEPC)')} ↗</span></a>
    <div class="card tinted" style="padding:14px 16px"><span class="muted" style="display:block;font-size:13px">${L('Abrigos no distrito', 'Shelters in the district')}</span>${shelters.length ? shelters.slice(0, 3).map((s) => `<span style="display:block;font-weight:600;font-size:14px">${esc(txt(s.name))}</span>`).join('') : `<span style="font-size:14px">${L('Sem abrigos registados. Siga as indicações da câmara municipal.', 'No shelters recorded. Follow your municipality’s instructions.')}</span>`}</div>
  </div></div></section>`;
}

function municipalCard() {
  const label = L('Proteção civil municipal', 'Municipal civil protection');
  const c = data.contact;
  const wrap = (inner) => `<div class="card tinted" style="padding:14px 16px;grid-column:1/-1"><span class="muted" style="display:block;font-size:13px">${label}</span>${inner}</div>`;
  if (!c) {
    const msg = data.contactErr
      ? L('Não foi possível obter os contactos do seu concelho. Em emergência ligue 112; para outros assuntos consulte a câmara municipal.', 'Could not load your municipality’s contacts. In an emergency call 112; for other matters contact your town hall.')
      : L('Use a sua localização para ver os contactos do seu concelho.', 'Use your location to see your municipality’s contacts.');
    return wrap(`<span style="font-size:14px">${msg}</span>`);
  }
  const m = c.municipio;
  const line = (k, v) => (v ? `<span style="display:block;font-size:14px"><span class="muted">${k}</span> ${v}</span>` : '');
  const rows = m
    ? line(L('Telefone', 'Phone'), m.phoneHref ? `<a href="${esc(m.phoneHref)}" style="font-weight:600">${esc(m.phone)}</a>` : '')
      + line('Email', m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '')
      + line(L('Site', 'Website'), m.site ? `<a href="${esc(m.site)}" target="_blank" rel="noopener noreferrer">${esc(m.site.replace(/^https?:\/\//, ''))}</a>` : '')
      + line(L('Morada', 'Address'), m.address ? esc(m.address) : '')
    : `<span style="font-size:14px">${L('Contactos do município indisponíveis.', 'Municipality contacts unavailable.')}</span>`;
  return wrap(`<strong style="font-size:17px">${L('Câmara Municipal de', 'Town hall of')} ${esc(c.concelho)}</strong>
    <span class="muted" style="display:block;font-size:13px;margin-bottom:6px">${L('O presidente da câmara é a autoridade municipal de proteção civil.', 'The mayor is the municipal civil protection authority.')}</span>
    ${rows}
    <span class="muted" style="display:block;font-size:12px;margin-top:6px">${c.byUser ? L('Concelho pela sua localização', 'Municipality from your location') : L('Concelho da localidade escolhida; ative a localização para ver o seu', 'Municipality of the chosen location; enable location to see yours')}. ${L('Fonte dos contactos', 'Contacts source')}: <a href="${GEOAPI_SITE}" target="_blank" rel="noopener noreferrer">geoapi.pt</a></span>`);
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

function servicesSection() {
  const s = data.curated.services;
  return `<section aria-labelledby="h-serv"><h2 id="h-serv" class="h2">${L('Estradas, transportes e serviços', 'Roads, transport and services')}</h2>${s.length ? `<div class="card list" style="padding:8px 20px">${s.map((x) => `<div class="li"><span class="k">${esc(TYPE_NAMES[x.type]?.[state.lang === 'en' ? 1 : 0] || x.type)}</span><span class="n">${esc(txt(x.name))}</span><span class="st ${STATUS_CLASS[x.status] || 'st-gry'}">${esc(STATUS_NAMES[x.status]?.[state.lang === 'en' ? 1 : 0] || x.status)}</span>${sourceBadge(x.source, { lang: state.lang })}</div>`).join('')}</div>` : emptyList('Sem cortes ou condicionamentos registados ainda.', 'No closures or restrictions recorded yet.')}</section>`;
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
  const cats = [['todas', L('Todas', 'All'), ''], ['governamental', CATEGORIES.governamental.label[state.lang], 'sh-g'], ['comunicacao_social', CATEGORIES.comunicacao_social.label[state.lang], 'sh-c'], ['redes_sociais', CATEGORIES.redes_sociais.label[state.lang], 'sh-r']];
  const items = data.curated.feed.filter((f) => state.cat === 'todas' || f.source.category === state.cat).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return `<section aria-labelledby="h-feed"><div style="display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between;margin-bottom:14px"><h2 id="h-feed" style="font-size:26px">${L('Últimas informações', 'Latest updates')}</h2><div style="display:flex;flex-wrap:wrap;gap:8px" role="group" aria-label="${L('Filtrar por categoria de fonte', 'Filter by source category')}">${cats.map(([k, l, s]) => `<button class="chip ${state.cat === k ? 'on' : ''}" aria-pressed="${state.cat === k}" data-a="cat" data-v="${k}">${s ? `<span class="shape ${s}"></span>` : ''}${esc(l)}</button>`).join('')}</div></div>
  ${items.length ? `<div class="card list" style="padding:8px 20px">${items.map((f) => `<article class="li"><time class="num" datetime="${esc(f.time)}">${esc(formatTime(new Date(f.time), state.lang))}</time><span class="n" style="font-weight:600">${esc(txt(f.title))}</span>${sourceBadge(f.source, { verified: f.verified, lang: state.lang })}</article>`).join('')}</div>` : emptyList('Sem informações nesta categoria ainda.', 'No updates in this category yet.')}</section>`;
}
function howSection() {
  return `<section id="como" aria-labelledby="h-como"><h2 id="h-como" class="h2">${L('Como calculamos o impacto', 'How we calculate impact')}</h2><div class="card tinted" style="display:flex;flex-direction:column;gap:10px;font-size:15px"><p style="margin:0">${L(`Cada distrito recebe uma base pelo seu aviso do IPMA (verde ${BASE.verde}, amarelo ${BASE.amarelo}, laranja ${BASE.laranja}, vermelho ${BASE.vermelho}), considerando os avisos em vigor neste momento. A isso somam-se pontos pelas ocorrências do distrito: peso da fonte × gravidade (1 a 3) × 5. O máximo é 100. Abaixo de 10 não há impacto relevante; 10 a 24 é moderado; 25 a 49 é alto; 50 ou mais é muito alto.`, `Each district gets a base from its IPMA warning (green ${BASE.verde}, yellow ${BASE.amarelo}, orange ${BASE.laranja}, red ${BASE.vermelho}), using the warnings in force right now. Points for the district’s incidents are added: source weight × severity (1 to 3) × 5. The maximum is 100. Below 10 is negligible; 10 to 24 moderate; 25 to 49 high; 50 or more very high.`)}</p><p style="margin:0" class="muted">${L('Pesos das fontes', 'Source weights')}: ${L('governamental', 'government')} ${WEIGHTS.governamental} · ${L('comunicação social', 'news media')} ${WEIGHTS.comunicacao_social} · ${L('redes sociais verificada', 'social media, verified')} ${WEIGHTS.redes_sociais_verificada} · ${L('redes sociais não verificada', 'social media, unverified')} ${WEIGHTS.redes_sociais_nao_verificada}.</p></div></section>`;
}
function footer() {
  return `<footer class="foot"><div><strong style="color:var(--ink)">${L('Sobre este site', 'About this site')}</strong><p style="margin:6px 0 0">${L('Não é um serviço oficial e não substitui os avisos da Proteção Civil nem do IPMA. Cada informação indica a fonte e o link original. Relatos de redes sociais aparecem sempre como não verificados.', 'This is not an official service and does not replace Civil Protection or IPMA warnings. Every item shows its source and original link. Social media reports always appear as unverified.')}</p></div>
  <div><strong style="color:var(--ink)">${L('Dados', 'Data')}</strong><p style="margin:6px 0 0">${L('Avisos e previsão: IPMA, lidos em tempo real neste dispositivo. Ocorrências, notícias e serviços: atualizados aproximadamente de hora a hora.', 'Warnings and forecast: IPMA, read live on this device. Incidents, news and services: updated roughly every hour.')}</p></div></footer>`;
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
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px" role="group" aria-label="${L('Situação', 'Situation')}">${tabs.map(([k, l]) => `<button class="tab ${state.sit === k ? 'on' : ''}" aria-pressed="${state.sit === k}" data-a="sit" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="grid">${RECS[state.sit].map((r, i) => `<div class="card rec"><span class="n">${i + 1}</span><span><strong style="display:block;font-size:17px">${esc(r[0][state.lang === 'en' ? 1 : 0])}</strong><span class="muted">${esc(r[1][state.lang === 'en' ? 1 : 0])}</span></span></div>`).join('')}</div>
  <p style="margin:20px 0 0">${L('Conselhos de', 'Advice from')}: ${sourceBadge(ANEPC, { lang: state.lang })}</p></section>`;
}

/* ---------- página ---------- */
function pageHtml() {
  const imp = impact();
  const main = state.page === 'recs' ? recsPage()
    : [statusSection(imp), mapSection(imp), zoneSection(), recsLink(), servicesSection(), feedSection(), forecastSection(), sheltersSection(), mythsSection(), howSection()].join('');
  return `<a class="skip" href="#main">${L('Saltar para o conteúdo', 'Skip to content')}</a>${emergencyBar()}${topbar()}<main id="main" class="sheet">${banners()}${main}</main>${footer()}`;
}

export function render() {
  const app = document.getElementById('app');
  const a = document.activeElement;
  const key = a && app.contains(a) ? (a.dataset.key || (a.dataset.a ? `${a.dataset.a}:${a.dataset.v ?? a.dataset.id ?? ''}` : null)) : null;
  const y = window.scrollY;
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'pt-PT';
  app.innerHTML = pageHtml();
  window.scrollTo(0, y);
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
  else if (a === 'cat') { state.cat = v; }
  else if (a === 'sit') { state.sit = v; }
  else if (a === 'district') { if (mapDrag.moved) return; state.userPicked = true; state.district = id; state.incidentId = null; }
  else if (a === 'pin') { if (mapDrag.moved) return; const i = data.curated.incidents.find((x) => x.id === id); if (i?.district) state.district = i.district; state.userPicked = true; state.incidentId = id; }
  else if (a === 'incident') { state.incidentId = id; }
  else if (a === 'back') { state.incidentId = null; }
  else if (a === 'zoom') { zoomBy(v === 'in' ? 1.5 : 1 / 1.5); return; }
  else if (a === 'geo') { return locate(); }
  else return;
  render();
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
  const box = document.getElementById('mapbox'); if (!box) return;
  const ppu = Math.min(box.clientWidth / state.view.w, box.clientHeight / state.view.h) || 1;
  mapDrag.x = e.clientX; mapDrag.y = e.clientY;
  setView({ ...state.view, x: state.view.x - dx / ppu, y: state.view.y - dy / ppu });
  box.querySelector('svg').classList.add('drag');
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
  loadForecast(); render();
}

let contactSeq = 0;
/** Concelho e contactos do município para um ponto {lat, lon}. */
async function resolveContacts(pt, byUser = false) {
  const seq = ++contactSeq;
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
    state.userPicked = true; setZone(best.l.id, { here });
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
  await loadAll();
  setInterval(tick, 1000);
  setInterval(async () => { await loadAll(); loadForecast(); }, REFRESH_MS);
}
