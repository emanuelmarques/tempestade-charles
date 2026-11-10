import { describe, it, expect } from 'vitest';
import { districtAt } from '../../src/lib/districtAt.js';
import { normalizeGps, normalizeMunicipio, formatPhone, lookupContacts } from '../../src/data/geoapi.js';

describe('districtAt', () => {
  const cities = [
    ['porto', 41.15, -8.61], ['braga', 41.55, -8.42], ['viana', 41.69, -8.83], ['vilareal', 41.3, -7.74], ['braganca', 41.81, -6.76],
    ['viseu', 40.66, -7.91], ['guarda', 40.54, -7.27], ['aveiro', 40.64, -8.65], ['coimbra', 40.21, -8.43], ['leiria', 39.74, -8.81],
    ['castelobranco', 39.82, -7.49], ['santarem', 39.24, -8.69], ['lisboa', 38.72, -9.14], ['portalegre', 39.29, -7.43], ['evora', 38.57, -7.91],
    ['setubal', 38.52, -8.89], ['beja', 38.02, -7.86], ['faro', 37.02, -7.93], ['lisboa', 38.7, -9.42], ['setubal', 38.68, -9.16],
  ];
  it.each(cities)('%s (%f, %f)', (id, lat, lon) => expect(districtAt(lat, lon)).toBe(id));
  it('devolve null fora de Portugal continental', () => {
    expect(districtAt(40.42, -3.7)).toBeNull(); // Madrid
    expect(districtAt(39, -12)).toBeNull(); // mar
    expect(districtAt(32.65, -16.9)).toBeNull(); // Funchal
  });
});

describe('geoapi', () => {
  it('normaliza a localização', () => {
    expect(normalizeGps({ concelho: 'Leiria', distrito: 'Leiria', freguesia: 'X' })).toEqual({ concelho: 'Leiria', distrito: 'Leiria', freguesia: 'X' });
    expect(() => normalizeGps({})).toThrow();
  });
  it('formata telefones', () => {
    expect(formatPhone(244839500)).toBe('244 839 500');
    expect(formatPhone(null)).toBeNull();
  });
  it('normaliza o município e rejeita dados perigosos', () => {
    const m = normalizeMunicipio({ nome: 'Leiria', telefone: 244839500, email: 'cmleiria@cm-leiria.pt', sitio: 'www.cm-leiria.pt', morada: 'Largo da República', codigopostal: '2414-006' });
    expect(m).toMatchObject({ phone: '244 839 500', phoneHref: 'tel:+351244839500', email: 'cmleiria@cm-leiria.pt', site: 'https://www.cm-leiria.pt/', address: 'Largo da República, 2414-006' });
    const bad = normalizeMunicipio({ nome: 'X', telefone: 123, email: '<script>@x.pt', sitio: 'javascript:alert(1)' });
    expect(bad.email).toBeNull();
    expect(bad.site).toBeNull();
    expect(bad.phoneHref).toBeNull();
  });
  it('devolve só o concelho se o município falhar', async () => {
    const mem = {};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    const fetchFn = async (url) => {
      if (url.includes('/gps/')) return { ok: true, json: async () => ({ concelho: 'Leiria', distrito: 'Leiria' }) };
      throw new Error('offline');
    };
    const r = await lookupContacts(39.74, -8.81, { fetchFn, storage });
    expect(r).toMatchObject({ concelho: 'Leiria', municipio: null });
  });
});
