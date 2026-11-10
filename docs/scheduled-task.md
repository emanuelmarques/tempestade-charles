# Tarefa agendada: dados curados

Os **avisos e a previsão do IPMA não passam por aqui**: o site lê-os ao vivo da API aberta do IPMA, no browser de cada visitante, com cópia local se a rede falhar. A tarefa agendada só mantém os dados que não existem numa API aberta: ocorrências, notícias, serviços, abrigos e boatos desmentidos, em `public/data/`.

## Instrução para a tarefa (de hora a hora)

1. Recolher informação de fontes **governamentais** (ANEPC, IPMA, câmaras municipais, Infraestruturas de Portugal, CP, ANA), **comunicação social** e **redes sociais**.
2. Escrever `incidents.json`, `feed.json`, `services.json`, `shelters.json` e `myths.json` segundo o contrato abaixo. Nunca inventar dados. Se não houver informação, deixar `[]`.
3. Regras:
   - Cada item tem `source` com `category` (`governamental`, `comunicacao_social` ou `redes_sociais`), `name` e `url` da fonte original (http ou https).
   - Relato de rede social sem confirmação oficial: `source.category: "redes_sociais"` e `verified: false`.
   - `image` só com `allowed: true` quando houver licença ou autorização verificada. Nunca copiar imagens para o repositório; usar o URL da fonte. Sem permissão, omitir `image`.
   - Texto pode ser `string` ou `{ "pt": "...", "en": "..." }`.
   - Ocorrências: `district` é o id do distrito (`viana`, `braga`, `porto`, `vilareal`, `braganca`, `viseu`, `guarda`, `aveiro`, `coimbra`, `leiria`, `castelobranco`, `santarem`, `lisboa`, `portalegre`, `evora`, `setubal`, `beja`, `faro`) ou `null`; `lat`/`lon` só se o local for conhecido; `severity` 1 a 3.
4. Escrever `meta.json` com `{ "updatedAt": "<hora atual ISO>" }` **só depois** dos outros ficheiros.
5. Correr `npm run validate-data`. Se falhar, **não** fazer push e deixar os ficheiros anteriores.
6. `git add public/data`, `git commit -m "data: update <hora>"` e `git push`.

## Redes sociais sem chave de API

- **X:** pesquisar na web com `allowed_domains: ["x.com", "twitter.com"]` (por exemplo "depressão Charles", "#FMA_Charles", "Proteção Civil aviso Charles") e recolher os links de tweets (`.../status/<id>`). Depois correr `node scripts/fetch-tweet.mjs <links...>`, que lê cada tweet pelo endpoint de embeds do X (sem chave, não documentado, pode falhar) e devolve itens de `feed.json`. Contas listadas em `OFFICIAL_ACCOUNTS` (`src/ingest/tweet.js`) são governamentais; as restantes ficam `redes_sociais` e `verified: false`. Imagens nunca se copiam.
- **Mastodon:** `curl https://mastodon.social/api/v1/timelines/tag/<hashtag>?limit=20` (hashtags como `depressaocharles`, `tempestadecharles`, `charles`, `mautempo`) devolve posts públicos sem login. Usar só posts originais, sobre a tempestade em Portugal, com o link do post como `source.url` e o nome `@conta@instância (Mastodon)`.
- **ANEPC:** a página `https://prociv.gov.pt/pt/avisos-a-populacao/` publica os avisos oficiais. São fonte `governamental`.
- Não se usam scrapers nem espelhos não oficiais (Nitter e semelhantes), nem contas ou chaves de terceiros. Threads, Facebook e Instagram não têm via sem login.
- No máximo 10 itens de redes sociais novos por execução, só dos últimos 2 dias; `feed.json` fica limitado a 60 itens (saem os mais antigos).

## Contrato

`Source = { category, name, url }` · `Text = string | { pt, en? }`

| Ficheiro | Itens |
|---|---|
| `meta.json` | `{ updatedAt: ISO \| null }` |
| `incidents.json` | `{ id, title, description?, time, place?, district, lat?, lon?, severity: 1-3, verified: boolean, source, image?: { url, credit, allowed } }` |
| `feed.json` | `{ id, time, title, verified?, source }` |
| `services.json` | `{ id, type: estrada\|comboio\|aeroporto\|escola\|eletricidade\|agua\|comunicacoes, name, status: cortada\|condicionada\|suprimida\|atrasos\|encerrada\|sem_servico, source }` |
| `shelters.json` | `{ id, name, address?, place?, district?, source }` |
| `myths.json` | `{ id, claim, fact, source }` |

O site avisa os visitantes quando `meta.updatedAt` tem mais de 150 minutos ou é `null`.
