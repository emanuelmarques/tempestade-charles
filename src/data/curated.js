import { safeUrl } from '../lib/safe.js';
import { DISTRICT_BY_ID } from './districts.js';

const CATS = ['governamental', 'comunicacao_social', 'redes_sociais'];
const isIso = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const isText = (t) => typeof t === 'string' ? t.length > 0 : !!t && typeof t === 'object' && typeof t.pt === 'string' && t.pt.length > 0;

function checkSource(s, where, errs) {
  if (!s || typeof s !== 'object') return errs.push(`${where}.source em falta`);
  if (!CATS.includes(s.category)) errs.push(`${where}.source.category inválida`);
  if (!s.name) errs.push(`${where}.source.name em falta`);
  if (!safeUrl(s.url)) errs.push(`${where}.source.url inválido`);
}

const SCHEMAS = {
  incidents: (i, w, e) => {
    if (!isText(i.title)) e.push(`${w}.title em falta`);
    if (!isIso(i.time)) e.push(`${w}.time inválido`);
    if (![1, 2, 3].includes(i.severity)) e.push(`${w}.severity deve ser 1, 2 ou 3`);
    if (typeof i.verified !== 'boolean') e.push(`${w}.verified deve ser booleano`);
    if (i.lat != null && !(i.lat >= 36 && i.lat <= 43)) e.push(`${w}.lat fora de Portugal`);
    if (i.lon != null && !(i.lon >= -32 && i.lon <= -6)) e.push(`${w}.lon fora de Portugal`);
    if (i.district != null && !DISTRICT_BY_ID[i.district]) e.push(`${w}.district desconhecido`);
    if (i.image && typeof i.image.allowed !== 'boolean') e.push(`${w}.image.allowed deve ser booleano`);
    checkSource(i.source, w, e);
  },
  feed: (i, w, e) => { if (!isText(i.title)) e.push(`${w}.title em falta`); if (!isIso(i.time)) e.push(`${w}.time inválido`); checkSource(i.source, w, e); },
  services: (i, w, e) => { if (!isText(i.name)) e.push(`${w}.name em falta`); if (!i.type) e.push(`${w}.type em falta`); if (!i.status) e.push(`${w}.status em falta`); checkSource(i.source, w, e); },
  shelters: (i, w, e) => { if (!isText(i.name)) e.push(`${w}.name em falta`); checkSource(i.source, w, e); },
  myths: (i, w, e) => { if (!isText(i.claim)) e.push(`${w}.claim em falta`); if (!isText(i.fact)) e.push(`${w}.fact em falta`); checkSource(i.source, w, e); },
};

export const DATASETS = ['meta', ...Object.keys(SCHEMAS)];
const EMPTY = { meta: { updatedAt: null }, incidents: [], feed: [], services: [], shelters: [], myths: [] };

/** Devolve a lista de erros de um ficheiro de dados (vazia = válido). */
export function validateDataset(name, data) {
  const errs = [];
  if (name === 'meta') {
    if (!data || typeof data !== 'object') return ['meta deve ser um objeto'];
    if (data.updatedAt !== null && !isIso(data.updatedAt)) errs.push('meta.updatedAt deve ser ISO ou null');
    return errs;
  }
  if (!SCHEMAS[name]) return [`ficheiro desconhecido: ${name}`];
  if (!Array.isArray(data)) return [`${name} deve ser uma lista`];
  const seen = new Set();
  data.forEach((item, idx) => {
    const w = `${name}[${idx}]`;
    if (!item || typeof item !== 'object') return errs.push(`${w} inválido`);
    if (!item.id) errs.push(`${w}.id em falta`);
    else if (seen.has(item.id)) errs.push(`${w}.id duplicado`);
    seen.add(item.id);
    SCHEMAS[name](item, w, errs);
  });
  return errs;
}

/** Carrega os ficheiros de dados curados; um ficheiro mau não derruba os outros. */
export async function loadCurated(fetchFn = fetch, base = './data/') {
  const data = {}; const errors = {};
  await Promise.all(DATASETS.map(async (name) => {
    try {
      const res = await fetchFn(`${base}${name}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const errs = validateDataset(name, json);
      if (errs.length) throw new Error(errs[0]);
      data[name] = json;
    } catch (e) {
      errors[name] = String(e.message ?? e);
      data[name] = EMPTY[name];
    }
  }));
  return { data, errors };
}
