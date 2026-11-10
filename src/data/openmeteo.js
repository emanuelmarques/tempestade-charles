import { parseLisbon } from '../lib/time.js';
import { fetchCached } from './ipma.js';

// Open-Meteo: previsão hora a hora gratuita, sem chave (CC BY 4.0). O IPMA só publica previsão diária em dados abertos.
export const OPEN_METEO_SITE = 'https://open-meteo.com';

export const openMeteoUrl = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`
  + '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m'
  + '&timezone=Europe%2FLisbon&forecast_days=2&wind_speed_unit=kmh';

const rows = [
  [[0], '☀️', ['Céu limpo', 'Clear']],
  [[1, 2], '🌤️', ['Pouco nublado', 'Partly cloudy']],
  [[3], '☁️', ['Nublado', 'Overcast']],
  [[45, 48], '🌫️', ['Nevoeiro', 'Fog']],
  [[51, 53, 55, 56, 57], '🌦️', ['Chuviscos', 'Drizzle']],
  [[61, 63, 65, 66, 67], '🌧️', ['Chuva', 'Rain']],
  [[80, 81, 82], '🌧️', ['Aguaceiros', 'Showers']],
  [[71, 73, 75, 77, 85, 86], '❄️', ['Neve', 'Snow']],
  [[95, 96, 99], '⛈️', ['Trovoada', 'Thunderstorm']],
];
const BY_CODE = new Map(rows.flatMap(([codes, emoji, label]) => codes.map((c) => [c, { emoji, label }])));

/** Emoji e descrição (pt/en) para um código de tempo WMO. */
export function weatherInfo(code, lang = 'pt') {
  const w = BY_CODE.get(code);
  return { emoji: w?.emoji ?? '🌡️', label: w ? w.label[lang === 'en' ? 1 : 0] : '' };
}

/** As próximas `n` horas (a partir da hora cheia seguinte a `now`) da resposta do Open-Meteo. */
export function nextHours(raw, now, n = 4) {
  const h = raw?.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('Resposta do Open-Meteo inválida');
  const out = [];
  for (let i = 0; i < h.time.length && out.length < n; i++) {
    const time = parseLisbon(`${h.time[i]}:00`);
    if (!time || time <= now) continue;
    out.push({
      time,
      temp: h.temperature_2m?.[i], pop: h.precipitation_probability?.[i], precip: h.precipitation?.[i],
      wind: h.wind_speed_10m?.[i], gust: h.wind_gusts_10m?.[i], code: h.weather_code?.[i],
    });
  }
  return out;
}

export async function loadNextHours(lat, lon, now = new Date(), opts = {}) {
  const r = await fetchCached(openMeteoUrl(lat, lon), opts);
  return nextHours(r.data, now, 4);
}
