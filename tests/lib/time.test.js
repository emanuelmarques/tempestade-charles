import { describe, it, expect } from 'vitest';
import { parseLisbon, countdown, freshness, STORM_START_LOCAL } from '../../src/lib/time.js';

describe('time', () => {
  it('interpreta hora de Lisboa no inverno e no verão', () => {
    expect(parseLisbon('2026-11-11T09:00:00').toISOString()).toBe('2026-11-11T09:00:00.000Z');
    expect(parseLisbon('2026-07-01T09:00:00').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(parseLisbon('lixo')).toBeNull();
  });
  it('conta até às 0h de 11 de novembro', () => {
    const t = parseLisbon(STORM_START_LOCAL);
    const c = countdown(new Date('2026-11-10T15:00:00Z'), t);
    expect(c).toMatchObject({ done: false, hours: 9, minutes: 0, seconds: 0, days: 0 });
    expect(countdown(new Date('2026-11-11T00:00:00Z'), t).done).toBe(true);
    expect(countdown(new Date('2026-11-12T00:00:00Z'), t).done).toBe(true);
  });
  it('frescura', () => {
    const now = new Date('2026-11-10T15:00:00Z');
    expect(freshness(null, now).state).toBe('unknown');
    expect(freshness('2026-11-10T14:50:00Z', now)).toEqual({ state: 'fresh', minutesAgo: 10 });
    expect(freshness('2026-11-10T13:59:00Z', now).state).toBe('stale');
    expect(freshness('2026-11-10T16:00:00Z', now).state).toBe('unknown');
  });
});
