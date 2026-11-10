import { escapeHtml, safeUrl } from './safe.js';

export const CATEGORIES = {
  governamental: { cls: 'cat-g', shape: 'sh-g', label: { pt: 'Governamental', en: 'Government' }, letter: 'G' },
  comunicacao_social: { cls: 'cat-c', shape: 'sh-c', label: { pt: 'Comunicação social', en: 'News media' }, letter: 'C' },
  redes_sociais: { cls: 'cat-r', shape: 'sh-r', label: { pt: 'Redes sociais', en: 'Social media' }, letter: 'R' },
};

/** Relato de rede social ainda não confirmado. */
export function isUnverified(source, verified) {
  return source?.category === 'redes_sociais' && verified === false;
}

/** Selo de fonte: categoria (forma + texto), nome e link para a fonte original. */
export function sourceBadge(source, { verified, lang = 'pt' } = {}) {
  const cat = CATEGORIES[source?.category];
  if (!cat) return '';
  const href = safeUrl(source.url);
  const link = href
    ? ` <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${lang === 'en' ? 'Source' : 'Fonte'}<span class="sr"> (${lang === 'en' ? 'opens in a new tab' : 'abre num novo separador'})</span> <span aria-hidden="true">↗</span></a>`
    : '';
  const warn = isUnverified(source, verified)
    ? ` <span class="st st-org">${lang === 'en' ? 'Unverified' : 'Não verificado'}</span>`
    : '';
  return `<span class="src"><span class="badge ${cat.cls}"><span class="shape ${cat.shape}"></span>${escapeHtml(cat.label[lang])} · ${escapeHtml(source.name)}</span>${link}${warn}</span>`;
}
