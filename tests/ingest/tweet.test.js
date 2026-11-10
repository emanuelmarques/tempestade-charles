import { describe, it, expect } from 'vitest';
import { parseTweetId, tweetToken, normalizeTweet, toFeedItem, fetchTweet } from '../../src/ingest/tweet.js';
import { validateDataset } from '../../src/data/curated.js';

const raw = {
  __typename: 'Tweet',
  id_str: '2120086149976780825',
  created_at: '2026-11-10T14:30:00.000Z',
  text: '#FMA_Charles Amanhã, quarta-feira,\n11 de novembro de 2026  Fica em casa e evita deslocações desnecessárias',
  user: { screen_name: 'VOSTPT', name: 'VOST Portugal' },
  photos: [{ url: 'https://pbs.twimg.com/media/x.jpg' }],
};

describe('tweet', () => {
  it('extrai o ID de links e de IDs numéricos', () => {
    expect(parseTweetId('https://x.com/VOSTPT/status/2120086149976780825')).toBe('2120086149976780825');
    expect(parseTweetId('https://twitter.com/a/status/123456?s=20')).toBe('123456');
    expect(parseTweetId('https://mobile.twitter.com/a/status/123456')).toBe('123456');
    expect(parseTweetId('2120086149976780825')).toBe('2120086149976780825');
    expect(parseTweetId('https://exemplo.pt/status/123456')).toBeNull();
    expect(parseTweetId('javascript:alert(1)')).toBeNull();
    expect(parseTweetId(undefined)).toBeNull();
  });
  it('calcula o token do endpoint', () => {
    expect(tweetToken('20')).toBe('6dq1a2xwd93');
  });
  it('normaliza e descarta tweets indisponíveis', () => {
    const t = normalizeTweet(raw);
    expect(t).toMatchObject({ id: '2120086149976780825', url: 'https://x.com/VOSTPT/status/2120086149976780825', time: '2026-11-10T14:30:00.000Z' });
    expect(t.text).not.toContain('\n');
    expect(t).not.toHaveProperty('media');
    expect(normalizeTweet({ __typename: 'TweetTombstone' })).toBeNull();
    expect(normalizeTweet(null)).toBeNull();
    expect(normalizeTweet({ ...raw, created_at: 'ontem' })).toBeNull();
  });
  it('classifica a fonte e gera um item de feed válido', () => {
    const fan = toFeedItem(normalizeTweet(raw));
    expect(fan.source).toMatchObject({ category: 'redes_sociais', name: '@VOSTPT (X)' });
    expect(fan.verified).toBe(false);
    const gov = toFeedItem(normalizeTweet({ ...raw, user: { screen_name: 'proteccaocivil', name: 'ANEPC' } }));
    expect(gov.source.category).toBe('governamental');
    expect(gov.verified).toBe(true);
    expect(validateDataset('feed', [fan, gov].map((x, i) => ({ ...x, id: `${x.id}-${i}` })))).toEqual([]);
  });
  it('trunca textos longos', () => {
    const long = toFeedItem(normalizeTweet({ ...raw, text: 'a'.repeat(500) }), { maxLen: 300 });
    expect(long.title.length).toBe(300);
    expect(long.title.endsWith('…')).toBe(true);
  });
  it('lê com fetch simulado e trata falhas', async () => {
    let called = '';
    const ok = async (url) => { called = url; return { status: 200, ok: true, text: async () => JSON.stringify(raw) }; };
    expect((await fetchTweet('https://x.com/VOSTPT/status/2120086149976780825', ok)).author.screenName).toBe('VOSTPT');
    expect(called).toContain('id=2120086149976780825');
    expect(called).toContain(`token=${tweetToken('2120086149976780825')}`);
    expect(await fetchTweet('123456', async () => ({ status: 404, ok: false }))).toBeNull();
    await expect(fetchTweet('123456', async () => ({ status: 429, ok: false }))).rejects.toThrow('429');
    await expect(fetchTweet('nada', ok)).rejects.toThrow('inválido');
  });
});
