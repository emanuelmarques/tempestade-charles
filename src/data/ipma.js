import { parseLisbon } from '../lib/time.js';

const BASE = 'https://api.ipma.pt/open-data/';
export const IPMA = {
  warnings: `${BASE}forecast/warnings/warnings_www.json`,
  forecast: (locationId) => `${BASE}forecast/meteorology/cities/daily/${locationId}.json`,
  weatherTypes: `${BASE}weather-type-classe.json`,
  site: 'https://www.ipma.pt/pt/otempo/prev.aviso/',
};
export const IPMA_SOURCE = { category: 'governamental', name: 'IPMA', url: IPMA.site };

const LEVEL_MAP = { green: 'verde', yellow: 'amarelo', orange: 'laranja', red: 'vermelho' };
export const WIND_CLASS = { pt: ['', 'fraco', 'moderado', 'forte', 'muito forte'], en: ['', 'light', 'moderate', 'strong', 'very strong'] };
export const PREC_CLASS = { pt: ['', 'fraca', 'moderada', 'forte'], en: ['', 'light', 'moderate', 'heavy'] };

/** Avisos IPMA em vigor ou futuros, sem os verdes. */
export function normalizeWarnings(raw) {
  if (!Array.isArray(raw)) throw new Error('Resposta de avisos do IPMA inválida');
  return raw
    .filter((w) => LEVEL_MAP[w.awarenessLevelID] && w.awarenessLevelID !== 'green')
    .map((w) => ({
      area: w.idAreaAviso,
      type: w.awarenessTypeName,
      text: w.text || '',
      level: LEVEL_MAP[w.awarenessLevelID],
      start: parseLisbon(w.startTime),
      end: parseLisbon(w.endTime),
    }))
    .filter((w) => w.start && w.end);
}

/** Previsão diária do IPMA para um local. */
export function normalizeForecast(raw) {
  if (!raw || !Array.isArray(raw.data)) throw new Error('Resposta de previsão do IPMA inválida');
  return raw.data.map((d) => ({
    date: d.forecastDate,
    tMin: Number(d.tMin),
    tMax: Number(d.tMax),
    precipProb: Number(d.precipitaProb),
    windClass: Number(d.classWindSpeed),
    precipClass: Number(d.classPrecInt),
    weatherType: Number(d.idWeatherType),
    windDir: d.predWindDir,
  }));
}

export function normalizeWeatherTypes(raw) {
  return Object.fromEntries((raw?.data ?? []).map((t) => [t.idWeatherType, { pt: t.descWeatherTypePT, en: t.descWeatherTypeEN }]));
}

export function normalizeLocations(raw) {
  return (raw?.data ?? []).map((l) => ({
    id: l.globalIdLocal, name: l.local, area: l.idAreaAviso, lat: Number(l.latitude), lon: Number(l.longitude),
    region: l.idRegiao === 1 ? 'continente' : l.idRegiao === 2 ? 'madeira' : 'acores',
  }));
}

/**
 * GET JSON com cópia local: se a rede falhar, devolve a última resposta guardada (fromCache = true).
 * Sem rede e sem cópia, lança erro.
 */
export async function fetchCached(url, { fetchFn = fetch, storage = globalThis.localStorage, now = Date.now(), timeoutMs = 8000 } = {}) {
  const key = `ipma:${url}`;
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    const res = await fetchFn(url, ctl ? { signal: ctl.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    try { storage?.setItem(key, JSON.stringify({ at: now, data })); } catch { /* sem armazenamento */ }
    return { data, fetchedAt: new Date(now), fromCache: false };
  } catch (err) {
    try {
      const c = JSON.parse(storage?.getItem(key) ?? 'null');
      if (c && c.data) return { data: c.data, fetchedAt: new Date(c.at), fromCache: true };
    } catch { /* cópia inválida */ }
    throw err;
  }
}
