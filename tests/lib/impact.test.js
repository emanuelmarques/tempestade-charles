import { describe, it, expect } from 'vitest';
import { computeImpact, tierOf } from '../../src/lib/impact.js';

const districts = [{ id: 'leiria', area: 'LRA' }, { id: 'faro', area: 'FAR' }];
const from = new Date('2026-11-10T15:00:00Z');
const to = new Date('2026-11-11T15:00:00Z');
const w = (area, level, s = '2026-11-11T09:00:00Z', e = '2026-11-11T21:00:00Z') => ({ area, level, start: new Date(s), end: new Date(e) });
const inc = (district, category, severity, verified = true) => ({ district, severity, verified, source: { category } });

describe('impact', () => {
  it('base pelo aviso mais grave', () => {
    const r = computeImpact({ districts, warnings: [w('LRA', 'amarelo'), w('LRA', 'vermelho')], incidents: [], from, to });
    expect(r.get('leiria')).toMatchObject({ base: 30, score: 30, tier: 2 });
    expect(r.get('faro')).toMatchObject({ base: 0, score: 0, tier: 0, top: null });
  });
  it('ignora avisos fora da janela e avisos verdes', () => {
    const r = computeImpact({ districts, warnings: [w('LRA', 'vermelho', '2026-11-13T00:00:00Z', '2026-11-13T12:00:00Z'), w('FAR', 'verde')], incidents: [], from, to });
    expect(r.get('leiria').base).toBe(0);
    expect(r.get('faro').base).toBe(0);
  });
  it('soma ocorrências com o peso da fonte', () => {
    const incidents = [1, 2, 3, 4].map(() => inc('leiria', 'governamental', 3));
    expect(computeImpact({ districts, warnings: [w('LRA', 'vermelho')], incidents, from, to }).get('leiria')).toMatchObject({ score: 90, tier: 3 });
    expect(computeImpact({ districts, warnings: [], incidents: [inc('faro', 'redes_sociais', 3, false)], from, to }).get('faro').points).toBe(4.5);
  });
  it('limita a 100 e ignora ocorrências sem distrito', () => {
    const many = Array.from({ length: 20 }, () => inc('leiria', 'governamental', 3));
    const r = computeImpact({ districts, warnings: [w('LRA', 'vermelho')], incidents: [...many, inc(null, 'governamental', 3)], from, to });
    expect(r.get('leiria').score).toBe(100);
  });
  it('limiares', () => {
    expect([9.9, 10, 24.9, 25, 49.9, 50].map(tierOf)).toEqual([0, 1, 1, 2, 2, 3]);
  });
});
