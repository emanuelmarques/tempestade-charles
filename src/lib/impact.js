export const LEVELS = ['verde', 'amarelo', 'laranja', 'vermelho'];
export const BASE = { verde: 0, amarelo: 10, laranja: 20, vermelho: 30 };
export const WEIGHTS = { governamental: 1, comunicacao_social: 0.7, redes_sociais_verificada: 0.7, redes_sociais_nao_verificada: 0.3 };

export function weightOf(incident) {
  const c = incident.source?.category;
  if (c === 'redes_sociais') return incident.verified ? WEIGHTS.redes_sociais_verificada : WEIGHTS.redes_sociais_nao_verificada;
  return WEIGHTS[c] ?? 0;
}

/** 0 sem relevância · 1 moderado · 2 alto · 3 muito alto */
export function tierOf(score) {
  return score < 10 ? 0 : score < 25 ? 1 : score < 50 ? 2 : 3;
}

const rank = (level) => LEVELS.indexOf(level);

/** Avisos (não verdes) de uma área que se sobrepõem à janela [from, to]. */
export function warningsIn(warnings, area, from, to) {
  return warnings.filter((w) => w.area === area && w.level !== 'verde' && w.start <= to && w.end >= from);
}

/** Impacto por distrito: base do aviso IPMA mais pontos das ocorrências. */
export function computeImpact({ districts, warnings, incidents, from, to }) {
  const out = new Map();
  for (const d of districts) {
    const ws = warningsIn(warnings, d.area, from, to).sort((a, b) => rank(b.level) - rank(a.level) || a.start - b.start);
    const top = ws[0] ?? null;
    const base = top ? BASE[top.level] : 0;
    const mine = incidents.filter((i) => i.district === d.id);
    const points = mine.reduce((s, i) => s + weightOf(i) * i.severity * 5, 0);
    const score = Math.min(100, Math.round((base + points) * 10) / 10);
    out.set(d.id, { id: d.id, warnings: ws, top, base, points: Math.round(points * 10) / 10, score, tier: tierOf(score), count: mine.length });
  }
  return out;
}
