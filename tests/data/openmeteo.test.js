import { describe, it, expect } from 'vitest';
import { nextHours, weatherInfo, openMeteoUrl, loadNextHours } from '../../src/data/openmeteo.js';

const raw = {
  hourly: {
    time: ['2026-11-10T14:00', '2026-11-10T15:00', '2026-11-10T16:00', '2026-11-10T17:00', '2026-11-10T18:00', '2026-11-10T19:00', '2026-11-10T20:00'],
    temperature_2m: [19.7, 19.1, 18.9, 18.5, 18.2, 17.9, 17.5],
    precipitation_probability: [93, 83, 60, 43, 13, 10, 5],
    precipitation: [1.1, 1, 0, 0, 0, 0, 0],
    weather_code: [95, 80, 3, 3, 3, 2, 0],
    wind_speed_10m: [22.3, 22.7, 18.5, 16.3, 13.2, 12, 10],
    wind_gusts_10m: [54.4, 52.6, 47.9, 38.9, 34.2, 30, 25],
  },
};

describe('open-meteo', () => {
  it('escolhe as 4 horas seguintes à hora atual', () => {
    const hours = nextHours(raw, new Date('2026-11-10T15:20:00Z'), 4);
    expect(hours.map((h) => h.time.toISOString().slice(11, 16))).toEqual(['16:00', '17:00', '18:00', '19:00']);
    expect(hours[0]).toMatchObject({ temp: 18.9, pop: 60, gust: 47.9, code: 3 });
  });
  it('não devolve horas já passadas e aceita menos de 4 no fim da série', () => {
    expect(nextHours(raw, new Date('2026-11-10T19:30:00Z'), 4).map((h) => h.time.toISOString().slice(11, 16))).toEqual(['20:00']);
    expect(nextHours(raw, new Date('2026-11-11T09:00:00Z'), 4)).toEqual([]);
  });
  it('rejeita respostas inválidas', () => {
    expect(() => nextHours({}, new Date(), 4)).toThrow();
    expect(() => nextHours(null, new Date(), 4)).toThrow();
  });
  it('emoji e descrição por código, com valor por omissão', () => {
    expect(weatherInfo(95, 'pt')).toEqual({ emoji: '⛈️', label: 'Trovoada' });
    expect(weatherInfo(61, 'en').label).toBe('Rain');
    expect(weatherInfo(999).emoji).toBe('🌡️');
  });
  it('monta o pedido e usa a cópia local se a rede falhar', async () => {
    expect(openMeteoUrl(39.7436, -8.8071)).toContain('latitude=39.74&longitude=-8.81');
    const mem = {};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    const ok = await loadNextHours(39.74, -8.81, new Date('2026-11-10T15:20:00Z'), { fetchFn: async () => ({ ok: true, json: async () => raw }), storage });
    expect(ok).toHaveLength(4);
    const off = await loadNextHours(39.74, -8.81, new Date('2026-11-10T15:20:00Z'), { fetchFn: async () => { throw new Error('offline'); }, storage });
    expect(off).toHaveLength(4);
  });
});
