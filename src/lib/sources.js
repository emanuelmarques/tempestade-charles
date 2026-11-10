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

/**
 * Etiqueta curta da fonte, sem símbolos: comunicação social mostra só o nome do meio;
 * governamental e redes sociais mostram a categoria e o nome. A categoria fica também em texto para leitores de ecrã.
 */
export function sourceChip(source, lang = 'pt') {
  const cat = CATEGORIES[source?.category];
  if (!cat) return '';
  const catName = cat.label[lang];
  const media = source.category === 'comunicacao_social';
  const sr = media ? `<span class="sr">${escapeHtml(catName)}: </span>` : '';
  return `<span class="badge ${cat.cls}">${sr}${escapeHtml(media ? source.name : `${catName} · ${source.name}`)}</span>`;
}

/** Selo de fonte: etiqueta curta, link para a fonte original e, nas redes sociais por confirmar, "Não verificado". */
export function sourceBadge(source, { verified, lang = 'pt' } = {}) {
  const chip = sourceChip(source, lang);
  if (!chip) return '';
  const href = safeUrl(source.url);
  const link = href
    ? ` <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${lang === 'en' ? 'Source' : 'Fonte'}<span class="sr"> (${lang === 'en' ? 'opens in a new tab' : 'abre num novo separador'})</span> <span aria-hidden="true">↗</span></a>`
    : '';
  const warn = isUnverified(source, verified)
    ? ` <span class="st st-org">${lang === 'en' ? 'Unverified' : 'Não verificado'}</span>`
    : '';
  return `<span class="src">${chip}${link}${warn}</span>`;
}
