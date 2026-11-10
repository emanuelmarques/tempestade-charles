/** Divide uma lista em páginas. A página pedida é limitada ao intervalo válido. */
export function paginate(items, page, size) {
  const list = Array.isArray(items) ? items : [];
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
  return { items: list.slice((current - 1) * size, current * size), page: current, pages, total: list.length };
}
