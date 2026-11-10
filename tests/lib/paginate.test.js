import { describe, it, expect } from 'vitest';
import { paginate } from '../../src/lib/paginate.js';

const list = Array.from({ length: 13 }, (_, i) => i + 1);

describe('paginate', () => {
  it('devolve a página pedida', () => {
    expect(paginate(list, 1, 5)).toEqual({ items: [1, 2, 3, 4, 5], page: 1, pages: 3, total: 13 });
    expect(paginate(list, 3, 5)).toEqual({ items: [11, 12, 13], page: 3, pages: 3, total: 13 });
  });
  it('limita páginas fora do intervalo ou inválidas', () => {
    expect(paginate(list, 99, 5).page).toBe(3);
    expect(paginate(list, 0, 5).page).toBe(1);
    expect(paginate(list, -2, 5).page).toBe(1);
    expect(paginate(list, 'x', 5).page).toBe(1);
    expect(paginate(list, 2.7, 5).page).toBe(2);
  });
  it('lista vazia ou inválida tem uma página vazia', () => {
    expect(paginate([], 1, 5)).toEqual({ items: [], page: 1, pages: 1, total: 0 });
    expect(paginate(null, 1, 5).total).toBe(0);
  });
  it('uma lista que cabe numa página tem uma só página', () => {
    expect(paginate([1, 2, 3], 1, 5).pages).toBe(1);
    expect(paginate([1, 2, 3, 4, 5], 1, 5).pages).toBe(1);
    expect(paginate([1, 2, 3, 4, 5, 6], 1, 5).pages).toBe(2);
  });
});
