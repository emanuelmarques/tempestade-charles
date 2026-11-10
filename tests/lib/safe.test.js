import { describe, it, expect } from 'vitest';
import { escapeHtml, safeUrl } from '../../src/lib/safe.js';
import { sourceBadge } from '../../src/lib/sources.js';

describe('safe', () => {
  it('escapa HTML', () => expect(escapeHtml('<img src=x onerror=alert(1)>')).not.toContain('<'));
  it('bloqueia esquemas perigosos', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
    expect(safeUrl('https://exemplo.pt/a')).toBe('https://exemplo.pt/a');
  });
});

describe('sourceBadge', () => {
  const gov = { category: 'governamental', name: 'IPMA', url: 'https://www.ipma.pt' };
  it('mostra categoria, nome e link', () => {
    const h = sourceBadge(gov, { lang: 'pt' });
    expect(h).toContain('Governamental');
    expect(h).toContain('IPMA');
    expect(h).toContain('href="https://www.ipma.pt/"');
  });
  it('marca redes sociais não verificadas', () => {
    const soc = { category: 'redes_sociais', name: 'X', url: 'https://x.com/a' };
    expect(sourceBadge(soc, { verified: false })).toContain('Não verificado');
    expect(sourceBadge(soc, { verified: true })).not.toContain('Não verificado');
    expect(sourceBadge(gov, { verified: false })).not.toContain('Não verificado');
  });
  it('não gera href com URL perigoso e escapa o nome', () => {
    const h = sourceBadge({ ...gov, url: 'javascript:x', name: '<b>x</b>' });
    expect(h).not.toContain('href');
    expect(h).not.toContain('<b>');
  });
});
