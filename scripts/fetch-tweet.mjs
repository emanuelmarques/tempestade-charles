// Uso: node scripts/fetch-tweet.mjs <link-ou-id> [...]
// Imprime, em JSON, um item de feed.json por cada tweet legível (um por linha de lista).
// Tweets indisponíveis (apagados, protegidos) são omitidos e referidos no stderr.
import { fetchTweet, toFeedItem } from '../src/ingest/tweet.js';

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('Uso: node scripts/fetch-tweet.mjs <link-ou-id> [...]');
  process.exit(2);
}
const items = [];
for (const input of inputs) {
  try {
    const tweet = await fetchTweet(input);
    if (tweet) items.push(toFeedItem(tweet));
    else console.error(`indisponível: ${input}`);
  } catch (e) {
    console.error(`erro: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(JSON.stringify(items, null, 2));
