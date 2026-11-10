import { describe, it, expect, vi } from 'vitest';
import { cleanPhone, phoneFromDigits, nearestPlace } from '../../src/data/places.js';

const pt = { lat: 39.7436, lon: -8.8071 }; // Leiria
const rows = [
  [39.76, -8.8, 'Farmácia Longe', '244111222', 'Rua B'],
  [39.744, -8.807, 'Bombeiros <b>Perto</b>', '244839100', 'Rua A 5, 2400-000 Leiria'],
  [39.75, -8.81, '', '', ''],
  ['x', 1, 'inválida', '', ''],
];

describe('places', () => {
  it('valida e formata telefones portugueses', () => {
    expect(cleanPhone({ phone: '+351 244 111 222' })).toEqual({ display: '244 111 222', href: 'tel:+351244111222' });
    expect(cleanPhone({ 'contact:phone': '244839100;244000000' }).display).toBe('244 839 100');
    expect(phoneFromDigits('00351244839100').href).toBe('tel:+351244839100');
    expect(phoneFromDigits('javascript:alert(1)')).toBeNull();
    expect(phoneFromDigits('123')).toBeNull();
    expect(phoneFromDigits('')).toBeNull();
  });
  it('escolhe o mais próximo e ignora linhas inválidas', () => {
    const p = nearestPlace(rows, pt, 25);
    expect(p.name).toBe('Bombeiros <b>Perto</b>'); // o texto é escapado na interface, não aqui
    expect(p.address).toBe('Rua A 5, 2400-000 Leiria');
    expect(p.phone.href).toBe('tel:+351244839100');
    expect(p.km).toBeLessThan(0.2);
    expect(p.mapUrl).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
    expect(nearestPlace([], pt, 25)).toBeNull();
    expect(nearestPlace(null, pt, 25)).toBeNull();
  });
  it('não devolve lugares fora do raio', () => {
    expect(nearestPlace([[41.15, -8.61, 'Porto', '', '']], pt, 25)).toBeNull(); // ~160 km
  });
});

describe('lookupNearby', () => {
  it('lê places.json uma vez e responde às duas perguntas', async () => {
    vi.resetModules();
    const { lookupNearby } = await import('../../src/data/places.js');
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ pharmacy: [rows[0]], fire: [rows[1]] }) }));
    const r = await lookupNearby(pt, fetchFn);
    await lookupNearby(pt, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(r.fire.place.name).toContain('Bombeiros');
    expect(r.pharmacy.place.name).toBe('Farmácia Longe');
  });
  it('devolve erro nas duas partes se o ficheiro falhar', async () => {
    vi.resetModules();
    const { lookupNearby } = await import('../../src/data/places.js');
    const r = await lookupNearby(pt, async () => ({ ok: false, status: 404 }));
    expect(r.pharmacy.error).toContain('404');
    expect(r.fire.error).toContain('404');
  });
});
