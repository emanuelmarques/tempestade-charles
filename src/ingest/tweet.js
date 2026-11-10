// Leitura de tweets públicos individuais sem chave de API, pelo endpoint que alimenta os tweets incorporados em sites.
// Endpoint não documentado pelo X: pode deixar de funcionar. Usar só para tweets concretos e a pouco volume.

/** Contas que são organismos públicos oficiais; os seus tweets contam como fonte governamental. */
export const OFFICIAL_ACCOUNTS = ['ProteccaoCivil'];

/** Extrai o ID de um tweet a partir de um link x.com/twitter.com ou de um ID numérico. */
export function parseTweetId(input) {
  const s = String(input ?? '').trim();
  if (/^\d{5,25}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (!/(^|\.)(x|twitter)\.com$/.test(u.hostname)) return null;
    const m = /\/status(?:es)?\/(\d{5,25})/.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Token que o endpoint de embeds espera (derivado do ID). */
export function tweetToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

export function tweetEndpoint(id) {
  return `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=pt&token=${tweetToken(id)}`;
}

/** Normaliza a resposta; devolve null para tweets apagados, protegidos ou indisponíveis. */
export function normalizeTweet(raw) {
  if (!raw || raw.__typename !== 'Tweet' || !raw.id_str || !raw.user?.screen_name || !raw.text) return null;
  const when = Date.parse(raw.created_at);
  if (Number.isNaN(when)) return null;
  return {
    id: raw.id_str,
    url: `https://x.com/${raw.user.screen_name}/status/${raw.id_str}`,
    author: { screenName: raw.user.screen_name, name: raw.user.name ?? raw.user.screen_name },
    time: new Date(when).toISOString(),
    text: String(raw.text).replace(/https?:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim(),
  };
}

/** Converte um tweet em item de `feed.json`. Contas oficiais são governamentais; as restantes ficam não verificadas. */
export function toFeedItem(tweet, { official = OFFICIAL_ACCOUNTS, maxLen = 300 } = {}) {
  const isOfficial = official.some((a) => a.toLowerCase() === tweet.author.screenName.toLowerCase());
  const title = tweet.text.length > maxLen ? `${tweet.text.slice(0, maxLen - 1).trimEnd()}…` : tweet.text;
  return {
    id: `x-${tweet.id}`,
    time: tweet.time,
    title,
    verified: isOfficial,
    source: { category: isOfficial ? 'governamental' : 'redes_sociais', name: `@${tweet.author.screenName} (X)`, url: tweet.url },
  };
}

/** Vai buscar um tweet. Devolve null se estiver indisponível; lança erro em falhas de rede ou limite de pedidos. */
export async function fetchTweet(input, fetchFn = fetch) {
  const id = parseTweetId(input);
  if (!id) throw new Error(`Link ou ID de tweet inválido: ${input}`);
  const res = await fetchFn(tweetEndpoint(id), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TempestadeCharlesBot/0.1)' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ao ler o tweet ${id}`);
  const text = await res.text();
  if (!text) return null;
  return normalizeTweet(JSON.parse(text));
}
