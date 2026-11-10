/** Início da tempestade: 0h de 11 de novembro de 2026, hora de Lisboa. */
export const STORM_START_LOCAL = '2026-11-11T00:00:00';

function offsetMinutes(utcMs, tz = 'Europe/Lisbon') {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** Interpreta 'YYYY-MM-DDTHH:mm:ss' (sem fuso, como o IPMA envia) como hora de Lisboa. */
export function parseLisbon(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str ?? '');
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let t = guess - offsetMinutes(guess) * 60000;
  t = guess - offsetMinutes(t) * 60000;
  return new Date(t);
}

/** Contagem decrescente até `target`. */
export function countdown(now, target) {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  const s = Math.floor(ms / 1000);
  return { done: false, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, totalMs: ms };
}

export const pad2 = (n) => String(n).padStart(2, '0');

/** Frescura dos dados: unknown | fresh | stale. */
export function freshness(updatedAt, now, staleAfterMin = 60) {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  if (Number.isNaN(t)) return { state: 'unknown', minutesAgo: null };
  const minutesAgo = Math.floor((now.getTime() - t) / 60000);
  if (minutesAgo < -5) return { state: 'unknown', minutesAgo: null };
  return { state: minutesAgo > staleAfterMin ? 'stale' : 'fresh', minutesAgo: Math.max(0, minutesAgo) };
}

const loc = (lang) => (lang === 'en' ? 'en-GB' : 'pt-PT');
export const formatTime = (date, lang = 'pt') =>
  new Intl.DateTimeFormat(loc(lang), { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }).format(date);
export const formatDayTime = (date, lang = 'pt') =>
  new Intl.DateTimeFormat(loc(lang), { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
export const formatDay = (date, lang = 'pt') =>
  new Intl.DateTimeFormat(loc(lang), { timeZone: 'Europe/Lisbon', weekday: 'long', day: 'numeric', month: 'short' }).format(date);
