import { describe, it, expect } from 'vitest';
import { validateDataset, loadCurated } from '../../src/data/curated.js';
import { normalizeWarnings, normalizeForecast, fetchCached } from '../../src/data/ipma.js';
import { toMap } from '../../src/lib/projection.js';
import { DISTRICTS } from '../../src/data/districts.js';

const src = { category: 'governamental', name: 'ANEPC', url: 'https://prociv.gov.pt' };
const inc = { id: 'a', title: 't', time: '2026-11-11T10:00:00Z', severity: 2, verified: true, lat: 39.7, lon: -8.8, source: src };

describe('contrato', () => {
  it('aceita listas vazias e dados válidos', () => {
    ['incidents', 'feed', 'services', 'shelters', 'myths'].forEach((n) => expect(validateDataset(n, [])).toEqual([]));
    expect(validateDataset('incidents', [inc])).toEqual([]);
    expect(validateDataset('meta', { updatedAt: null })).toEqual([]);
  });
  it('rejeita dados maus', () => {
    expect(validateDataset('incidents', [{ ...inc, source: { ...src, url: 'javascript:x' } }]).join()).toContain('source.url');
    expect(validateDataset('incidents', [{ ...inc, severity: 4 }]).join()).toContain('severity');
    expect(validateDataset('incidents', [{ ...inc, lat: 50 }]).join()).toContain('lat');
    expect(validateDataset('incidents', [inc, inc]).join()).toContain('duplicado');
    expect(validateDataset('meta', { updatedAt: 'ontem' }).length).toBe(1);
    expect(validateDataset('incidents', null).length).toBe(1);
  });
  it('um ficheiro em falta não derruba os outros', async () => {
    const f = async (url) => (url.includes('incidents') ? { ok: false, status: 404 } : { ok: true, json: async () => (url.includes('meta') ? { updatedAt: null } : []) });
    const { data, errors } = await loadCurated(f);
    expect(errors.incidents).toBeTruthy();
    expect(data.incidents).toEqual([]);
    expect(errors.feed).toBeUndefined();
  });
  it('JSON inválido ou dados maus viram lista vazia', async () => {
    const f = async (url) => ({
      ok: true,
      json: async () => {
        if (url.includes('feed')) throw new Error('json');
        if (url.includes('meta')) return { updatedAt: null };
        return url.includes('myths') ? [{ id: 1 }] : [];
      },
    });
    const { data, errors } = await loadCurated(f);
    expect(errors.feed).toBeTruthy();
    expect(errors.myths).toBeTruthy();
    expect(data.myths).toEqual([]);
  });
});

describe('ipma', () => {
  it('normaliza avisos sem os verdes', () => {
    const raw = [
      { text: 'x', awarenessTypeName: 'Vento', idAreaAviso: 'LRA', startTime: '2026-11-11T09:00:00', awarenessLevelID: 'orange', endTime: '2026-11-11T21:00:00' },
      { text: '', awarenessTypeName: 'Nevoeiro', idAreaAviso: 'LRA', startTime: '2026-11-10T12:10:00', awarenessLevelID: 'green', endTime: '2026-11-13T12:00:00' },
    ];
    const r = normalizeWarnings(raw);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ area: 'LRA', level: 'laranja', type: 'Vento' });
    expect(r[0].start.toISOString()).toBe('2026-11-11T09:00:00.000Z');
    expect(() => normalizeWarnings({})).toThrow();
  });
  it('normaliza previsão', () => {
    const d = normalizeForecast({ data: [{ forecastDate: '2026-11-10', tMin: '16.5', tMax: '19.6', precipitaProb: '100.0', classWindSpeed: 2, classPrecInt: 3, idWeatherType: 23, predWindDir: 'SW' }] });
    expect(d[0]).toMatchObject({ tMin: 16.5, precipProb: 100, windClass: 2 });
    expect(() => normalizeForecast(null)).toThrow();
  });
  it('usa a cópia local quando a rede falha', async () => {
    const mem = {};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    const ok = await fetchCached('u', { fetchFn: async () => ({ ok: true, json: async () => [1] }), storage, now: 1000 });
    expect(ok).toMatchObject({ data: [1], fromCache: false });
    const off = await fetchCached('u', { fetchFn: async () => { throw new Error('offline'); }, storage });
    expect(off).toMatchObject({ data: [1], fromCache: true });
    await expect(fetchCached('outro', { fetchFn: async () => { throw new Error('offline'); }, storage })).rejects.toThrow();
  });
});

describe('geografia', () => {
  it('projeta pontos de Portugal para dentro do mapa', () => {
    const [x, y] = toMap(39.74, -8.81); // Leiria
    expect(Math.abs(x - 100)).toBeLessThan(25);
    expect(Math.abs(y - 268)).toBeLessThan(25);
    expect(DISTRICTS).toHaveLength(18);
    expect(DISTRICTS.every((d) => d.d && d.name && d.locationId)).toBe(true);
  });
});
