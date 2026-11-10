import { describe, it, expect, vi } from 'vitest';
import { cleanPhone, phoneFromDigits, nearestPlace, photonRows, photonUrl } from '../../src/data/places.js';

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
  it('sem places.json procura em tempo real e acrescenta o telefone', async () => {
    vi.resetModules();
    const { lookupNearby } = await import('../../src/data/places.js');
    const photon = { features: [
      { geometry: { coordinates: [-8.8166, 39.7675] }, properties: { name: 'Bombeiros Longe', osm_type: 'W', osm_id: 1 } },
      { geometry: { coordinates: [-8.8003, 39.7411] }, properties: { name: 'Bombeiros Sapadores', street: 'Rua de Tomar', city: 'Leiria', osm_type: 'N', osm_id: 2 } },
    ] };
    const fetchFn = vi.fn(async (url) => {
      if (url.includes('places.json')) return { ok: false, status: 404 };
      if (url.includes('photon')) return { ok: true, json: async () => photon };
      if (url.includes('nominatim')) return { ok: true, json: async () => [{ extratags: { phone: '+351 244 839 100' } }] };
      throw new Error('inesperado');
    });
    const r = await lookupNearby(pt, fetchFn);
    expect(r.fire.place.name).toBe('Bombeiros Sapadores');
    expect(r.fire.place.address).toBe('Rua de Tomar, Leiria');
    expect(r.fire.place.phone.href).toBe('tel:+351244839100');
  });
  it('se o Nominatim falhar mantém o lugar sem telefone; se tudo falhar devolve erro', async () => {
    vi.resetModules();
    const { lookupNearby } = await import('../../src/data/places.js');
    const photon = { features: [{ geometry: { coordinates: [-8.8003, 39.7411] }, properties: { name: 'X', osm_type: 'N', osm_id: 2 } }] };
    const half = async (url) => {
      if (url.includes('photon')) return { ok: true, json: async () => photon };
      return { ok: false, status: 429 };
    };
    const r = await lookupNearby(pt, half);
    expect(r.pharmacy.place.name).toBe('X');
    expect(r.pharmacy.place.phone).toBeNull();
    vi.resetModules();
    const again = await import('../../src/data/places.js');
    const bad = await again.lookupNearby(pt, async () => ({ ok: false, status: 503 }));
    expect(bad.fire.error).toContain('503');
    expect(bad.pharmacy.error).toContain('503');
  });
  it('converte a resposta do Photon e monta o pedido', () => {
    expect(photonRows({ features: [{ geometry: { coordinates: [-8.8, 39.7] }, properties: { name: 'A', postcode: '2400-000', city: 'Leiria', osm_type: 'N', osm_id: 5 } }, { geometry: {}, properties: {} }] })).toEqual([[39.7, -8.8, 'A', '', '2400-000 Leiria', 'N5']]);
    expect(photonUrl('fire', pt)).toContain('osm_tag=amenity:fire_station');
    expect(photonRows(null)).toEqual([]);
  });
});
