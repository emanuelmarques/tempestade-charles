# Tarefa agendada: dados curados

Os **avisos e a previsão do IPMA não passam por aqui**: o site lê-os ao vivo da API aberta do IPMA, no browser de cada visitante, com cópia local se a rede falhar. A tarefa agendada só mantém os dados que não existem numa API aberta: ocorrências, notícias, serviços, abrigos e boatos desmentidos, em `public/data/`.

## Instrução para a tarefa (de 15 em 15 minutos)

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

O site avisa os visitantes quando `meta.updatedAt` tem mais de 60 minutos ou é `null`.
