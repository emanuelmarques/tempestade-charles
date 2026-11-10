# Site Tempestade Charles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um site estático em português (com inglês) que mostra, num mapa interativo e em secções, a informação atualizada sobre a tempestade Charles, lida de ficheiros JSON que uma tarefa agendada do Claude mantém no repositório.

**Architecture:** JavaScript puro (módulos ES), sem framework, compilado com Vite para ficheiros estáticos que funcionam em qualquer alojamento. Toda a lógica (validação de dados, cálculo de impacto, geografia, tradução, segurança de texto) fica em módulos puros testados com Vitest; a interface (`src/ui/*`) só liga esses módulos ao DOM e ao Leaflet. Os dados vivem em `public/data/*.json` e são validados por um contrato antes de cada push.

**Tech Stack:** Node 24, Vite, Vitest (+ jsdom), Leaflet, leaflet.heat, JavaScript ES modules.

**Spec:** `docs/superpowers/specs/2026-11-10-tempestade-charles-site-design.md`. Design visual: https://claude.ai/artifact/XF6HJLu49LzTdSoX2nLZWL (o artboard desktop pode não estar publicado; seguir a secção 3 e 8 da spec e os valores abaixo).

## Global Constraints

- Idioma por omissão `pt`, com `en` e seletor visível; o texto de dados pode ser `string` ou `{pt, en}`; se faltar `en`, mostra-se `pt` (escolha deste plano para a questão em aberto 4 da spec).
- Categorias de fonte, valores exatos: `governamental`, `comunicacao_social`, `redes_sociais`. Etiquetas PT: "Governamental", "Comunicação social", "Redes sociais". Formas: quadrado `#1B4F9C`, círculo `#0E6B63`, losango tracejado `#8A5200` (fundo `#FBEBCF`).
- Toda a informação mostrada tem de exibir a categoria da fonte e o link da fonte original. Relatos de `redes_sociais` com `verified: false` mostram sempre "Não verificado".
- A categoria nunca é indicada só pela cor: forma e texto sempre presentes.
- Emergência: `112`; SNS 24: `808 24 24 24`.
- Níveis de aviso IPMA: `verde`, `amarelo`, `laranja`, `vermelho`. Cores: amarelo `#F4C20D`, laranja `#EE7B1E`, vermelho `#D1242F`.
- Fotografias só se mostram quando `image.allowed === true`; caso contrário a ficha aparece sem imagem.
- Alvos táteis de pelo menos 44 px; contraste de texto 4.5:1; funciona no telemóvel.
- Site estático, sem servidor. Os dados reais são escritos só pela tarefa agendada; o repositório entrega `public/data/*.json` vazios e válidos (nunca dados inventados). Dados de exemplo ficam só em `tests/fixtures/`.
- Atualização aproximadamente a cada 15 minutos; dados com `updatedAt` mais antigo que 60 minutos são "desatualizados" e o site avisa.

## Review Focus

1. Ficheiro de dados em falta, vazio ou com JSON inválido: a página continua a carregar, mostra um aviso claro e os restantes blocos funcionam (Task 3).
2. Dados desatualizados (`updatedAt` há mais de 60 min) ou `updatedAt: null`: aviso visível em vez de parecer atual (Task 3).
3. Texto ou URL recolhidos com HTML, `<script>` ou `javascript:`: aparecem inertes, nunca executam (Task 1).
4. Ocorrência sem coordenadas ou fora de Portugal: aparece na lista, não gera pin e não parte o mapa (Task 7).
5. Imagem não permitida, em falta ou que falha a carregar: ficha sem imagem e sem ícone partido (Task 7).

---

## File Structure

| Ficheiro | Responsabilidade |
|---|---|
| `package.json`, `vite.config.js`, `index.html` | Projeto, build, página única |
| `src/lib/safe.js` | `escapeHtml`, `safeUrl` |
| `src/lib/sources.js` | Metadados das categorias e HTML do selo de fonte |
| `src/lib/impact.js` | Cálculo de impacto por concelho |
| `src/lib/geo.js` | Distância e concelho mais próximo |
| `src/i18n/index.js`, `pt.js`, `en.js` | Tradução e `localized()` |
| `src/data/contract.js` | Validadores do contrato de dados |
| `src/data/load.js` | Carregamento tolerante a falhas e frescura |
| `src/ui/*.js` | Blocos de interface (cabeçalho, estado, mapa, zona, secções) |
| `src/main.js`, `src/styles/main.css` | Arranque e estilos |
| `public/data/*.json` | Dados (escritos pela tarefa agendada) |
| `scripts/validate-data.mjs`, `scripts/fetch-ipma.mjs` | Validação e recolha IPMA |
| `docs/scheduled-task.md` | Instruções da tarefa agendada |
| `tests/**` | Testes e `tests/fixtures/` |

## Data contract (referência para todas as tasks)

Todos os ficheiros em `public/data/`. `Source = { category: 'governamental'|'comunicacao_social'|'redes_sociais', name: string, url: string }`. `Text = string | { pt: string, en?: string }`.

| Ficheiro | Forma |
|---|---|
| `meta.json` | `{ updatedAt: string(ISO) \| null }` |
| `warnings.json` | `Warning[]`: `{ area: string(código de distrito), level, type: string, start: ISO, end: ISO, source: Source }` |
| `incidents.json` | `Incident[]`: `{ id, title: Text, description: Text, time: ISO, location: { label: string, concelho: string\|null, lat: number\|null, lon: number\|null }, severity: 1\|2\|3, verified: boolean, source: Source, image?: { url, credit, allowed: boolean } }` |
| `feed.json` | `FeedItem[]`: `{ id, time: ISO, title: Text, source: Source }` |
| `services.json` | `Service[]`: `{ id, type: 'estrada'\|'comboio'\|'aeroporto'\|'escola'\|'eletricidade'\|'agua'\|'comunicacoes', name: Text, status: 'cortada'\|'condicionada'\|'suprimida'\|'atrasos'\|'encerrada'\|'sem_servico', source: Source }` |
| `shelters.json` | `Shelter[]`: `{ id, name: Text, address: string, concelho: string, lat: number, lon: number, source: Source }` |
| `myths.json` | `Myth[]`: `{ id, claim: Text, fact: Text, source: Source }` |
| `forecast.json` | `ForecastDay[]` (até 3): `{ date: 'YYYY-MM-DD', level, windGustKmh: number, precipMm: number, waveM: number, source: Source }` |
| `contacts.json` | `Contact[]`: `{ concelho: string, bombeiros: string, protecaoCivil: string, source: Source }` |
| `concelhos.json` (referência, estático) | `{ code: string, name: string, distrito: string, distritoCode: string, lat: number, lon: number, region: 'continente'\|'acores'\|'madeira' }[]` |

---

### Task 1: Projeto, segurança de texto e selos de fonte

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `.gitignore` (inclui `node_modules`, `dist`), `src/lib/safe.js`, `src/lib/sources.js`
- Test: `tests/lib/safe.test.js`, `tests/lib/sources.test.js`

**Interfaces:**
- Produces: `escapeHtml(s: string): string`; `safeUrl(u: unknown): string | null` (só `http:` e `https:`; qualquer outra coisa devolve `null`); `CATEGORIES: Record<Category, { label: {pt,en}, color: string, bg: string, shape: 'square'|'circle'|'diamond' }>`; `sourceBadge(source: Source, opts: { verified?: boolean, lang: 'pt'|'en' }): string` (HTML escapado com categoria, forma, "Não verificado" quando `source.category==='redes_sociais' && opts.verified===false`, e link `rel="noopener noreferrer" target="_blank"` apenas se `safeUrl` não for `null`).

- [ ] **Step 1: Escrever testes**
  - `safe.test.js`: `escapeHtml('<img src=x onerror=alert(1)>')` não contém `<`; `safeUrl('javascript:alert(1)') === null`; `safeUrl('data:text/html,x') === null`; `safeUrl('https://exemplo.pt/a') === 'https://exemplo.pt/a'`; `safeUrl(undefined) === null`.
  - `sources.test.js`: badge de `redes_sociais` com `verified:false` contém "Não verificado"; badge `governamental` não contém; badge com `url:'javascript:x'` não contém `href`; nome da fonte `<b>x</b>` aparece escapado.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/lib` → FAIL (módulos em falta).
- [ ] **Step 3: Configurar o projeto** (`npm init`, instalar `vite`, `vitest`, `jsdom`, `leaflet`, `leaflet.heat`; scripts `dev`, `build`, `test`, `validate-data`; `vitest` com `environment: 'jsdom'`) e implementar `safe.js` e `sources.js` com as assinaturas acima. `index.html` mínimo com `<html lang="pt-PT">` e `<div id="app">`.
- [ ] **Step 4: Correr:** `npx vitest run tests/lib` → PASS.
- [ ] **Step 5: Commit** `feat: project scaffold, safe text helpers and source badges`.

### Task 2: Contrato de dados e validação

**Files:**
- Create: `src/data/contract.js`, `scripts/validate-data.mjs`, `public/data/{meta,warnings,incidents,feed,services,shelters,myths,forecast,contacts}.json` (valores vazios válidos: `meta` = `{"updatedAt":null}`, restantes `[]`), `tests/fixtures/*.json` (um conjunto de exemplo completo, marcado em `meta.json` com `"_sample": true`)
- Test: `tests/data/contract.test.js`

**Interfaces:**
- Produces: `validateDataset(name: DatasetName, data: unknown): string[]` (lista de erros; vazia = válido). `DatasetName` = `'meta'|'warnings'|'incidents'|'feed'|'services'|'shelters'|'myths'|'forecast'|'contacts'`. Regras: todos os `source` têm `category` válida, `name` não vazio e `url` com `safeUrl` não nulo; `incidents.severity` ∈ {1,2,3}; `lat` entre 36.5 e 42.5 e `lon` entre -32 e -6 quando não nulos (cobre continente, Açores e Madeira); `time`/`start`/`end` ISO válidos; `ids` únicos por ficheiro.
- Produces: `scripts/validate-data.mjs` valida todos os ficheiros de `public/data` (ou de uma pasta passada como argumento) e termina com código 1 se houver erros, imprimindo cada erro com ficheiro e índice.

- [ ] **Step 1: Escrever testes** em `contract.test.js`: os fixtures completos validam sem erros; incidente com `source.url:'javascript:x'` → erro que menciona `source.url`; `severity:4` → erro; `lat:50` → erro; `id` duplicado → erro; `meta` com `updatedAt:'ontem'` → erro; `[]` é válido para os 8 ficheiros de listas; `null` no lugar de uma lista → erro.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/data/contract.test.js` → FAIL.
- [ ] **Step 3: Implementar** `validateDataset` e `validate-data.mjs`; `npm run validate-data` aponta a `public/data`.
- [ ] **Step 4: Correr** testes (PASS) e `npm run validate-data` → saída "OK" e código 0; copiar um fixture inválido para uma pasta temporária e confirmar código 1.
- [ ] **Step 5: Commit** `feat: data contract, validator and empty data files`.

### Task 3: Carregamento tolerante a falhas e frescura

**Files:**
- Create: `src/data/load.js`
- Test: `tests/data/load.test.js`

**Interfaces:**
- Consumes: `validateDataset` (Task 2).
- Produces: `loadAll(fetchFn = fetch, base = '/data/'): Promise<{ data: Record<DatasetName, any>, errors: Partial<Record<DatasetName, string>> }>`. Para cada ficheiro: falha de rede, JSON inválido ou erros de validação → `errors[name]` preenchido e `data[name]` assume o valor vazio (`[]`, ou `{updatedAt:null}` para `meta`); os restantes ficheiros carregam normalmente. `freshness(updatedAt: string|null, now: Date, staleAfterMin = 60): { state: 'unknown'|'fresh'|'stale', minutesAgo: number|null }`.

- [ ] **Step 1: Escrever testes** com um `fetchFn` falso: ficheiro com resposta 404 → `errors.incidents` definido e `data.incidents` igual a `[]`, `data.warnings` carregado; JSON inválido → erro; ficheiro com `severity:9` → erro e lista vazia (não parcial); `freshness(null, now)` → `unknown`; há 10 min → `fresh`, `minutesAgo: 10`; há 61 min → `stale`; `updatedAt` no futuro por mais de 5 min → `unknown`.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/data/load.test.js` → FAIL.
- [ ] **Step 3: Implementar** `loadAll` (em paralelo com `Promise.all`) e `freshness`.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: resilient data loading and freshness`.

### Task 4: Tradução PT/EN

**Files:**
- Create: `src/i18n/index.js`, `src/i18n/pt.js`, `src/i18n/en.js`
- Test: `tests/i18n/i18n.test.js`

**Interfaces:**
- Produces: `t(key: string, lang: 'pt'|'en', vars?: Record<string, string|number>): string` (chave em falta devolve a própria chave; `{nome}` substituído por `vars`); `localized(text: Text, lang): string` (usa `lang`, depois `pt`, depois `''`); `getLang(): 'pt'|'en'` (guardado em `localStorage` com `try/catch`, por omissão `pt`, `en` só se guardado); `setLang(lang): void` (guarda e dispara o evento `langchange` em `document`).
- Os dicionários cobrem todo o texto fixo do design: cabeçalho, barra de emergência, títulos das secções, filtros, legenda, estados vazios e avisos de erro/desatualizado.

- [ ] **Step 1: Escrever testes**: `localized({pt:'Olá',en:'Hello'},'en')==='Hello'`; `localized({pt:'Olá'},'en')==='Olá'`; `localized('x','en')==='x'`; `t('nao.existe','pt')==='nao.existe'`; `t('zone.alert','pt',{concelho:'Leiria'})` contém `Leiria`; `pt` e `en` têm exatamente o mesmo conjunto de chaves; `getLang()` devolve `pt` se `localStorage` lançar erro; `setLang('en')` dispara `langchange`.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/i18n` → FAIL.
- [ ] **Step 3: Implementar** os três ficheiros.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: pt/en translations`.

### Task 5: Cálculo de impacto

**Files:**
- Create: `src/lib/impact.js`
- Test: `tests/lib/impact.test.js`

**Interfaces:**
- Produces: `WEIGHTS = { governamental: 1, comunicacao_social: 0.7, redes_sociais_verificada: 0.7, redes_sociais_nao_verificada: 0.3 }`; `computeImpact(input: { warnings: Warning[], incidents: Incident[], concelhos: Concelho[], now: Date }): Map<string, { score: number, level: 0|1|2|3, base: number, incidentPoints: number }>` indexado por `concelho.code`.
- Fórmula (documentada também na página, secção "Como calculamos"): `base` = 0/10/20/30 para `verde/amarelo/laranja/vermelho` do aviso mais grave em vigor (`start ≤ now ≤ end`) na `distritoCode` do concelho; `incidentPoints` = soma, sobre incidentes do concelho (por `location.concelho === concelho.code`), de `peso × severity × 5`; `score = min(100, base + incidentPoints)`; `level`: `<10`→0, `<25`→1, `<50`→2, `≥50`→3. Avisos fora do intervalo são ignorados; incidentes sem concelho são ignorados.

- [ ] **Step 1: Escrever testes**: vermelho sem incidentes → `score 30`, `level 2`; verde + 1 incidente governamental `severity 3` → `15`, `level 1`; vermelho + 4 incidentes governamentais `severity 3` → `90`, `level 3`; mesmo incidente `redes_sociais` não verificado `severity 3` → `4.5` (pontos); aviso expirado → `base 0`; dois avisos no mesmo distrito (amarelo e laranja) → `base 20`; score nunca excede 100; incidente com `concelho: null` não altera nenhum concelho.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/lib/impact.test.js` → FAIL.
- [ ] **Step 3: Implementar** `computeImpact` com a fórmula acima.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: combined impact scoring`.

### Task 6: Geografia e dados de referência dos concelhos

**Files:**
- Create: `src/lib/geo.js`, `public/data/concelhos.json`, `scripts/build-concelhos.mjs`, `docs/data-sources.md`
- Test: `tests/lib/geo.test.js`, `tests/data/concelhos.test.js`

**Interfaces:**
- Produces: `haversineKm(a: {lat,lon}, b: {lat,lon}): number`; `nearestConcelho(point: {lat,lon}, concelhos: Concelho[], maxKm = 60): Concelho | null` (devolve `null` se o mais próximo estiver além de `maxKm`, para quem está fora de Portugal).
- `concelhos.json` obedece à forma do contrato; contagens: 278 `continente`, 19 `acores`, 11 `madeira` (308 no total).

- [ ] **Step 1: Escrever testes**: `haversineKm` Lisboa–Porto ≈ 274 km (±5); `nearestConcelho` de um ponto no centro de Leiria devolve Leiria; ponto em Madrid devolve `null`; `concelhos.test.js`: contagens por região 278/19/11, `code` únicos, todos com `distritoCode` não vazio, coordenadas dentro dos limites do contrato.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/lib/geo.test.js tests/data/concelhos.test.js` → FAIL.
- [ ] **Step 3: Implementar `geo.js`** e produzir `concelhos.json` com `scripts/build-concelhos.mjs` a partir de um conjunto de dados abertos de concelhos de Portugal (por exemplo CAOP da DGT ou dados.gov.pt, com centroides). Registar em `docs/data-sources.md` a fonte, a licença e a data da transferência.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: geo helpers and concelhos reference data`.

### Task 7: Mapa interativo (heatmap, pins, ficha)

**Files:**
- Create: `src/ui/map.js`, `src/ui/incidentCard.js`
- Test: `tests/ui/map-model.test.js`, `tests/ui/incidentCard.test.js`

**Interfaces:**
- Consumes: `computeImpact` (Task 5), `sourceBadge`, `localized`, `safeUrl`, `Concelho`.
- Produces (puros, testáveis): `buildHeatPoints(impact: Map, concelhos: Concelho[]): [lat, lon, intensity][]` (só scores > 0; `intensity = score/100`); `buildPins(incidents: Incident[], filters: Set<Category>): Pin[]` com `Pin = { id, lat, lon, category, verified, incident }`, excluindo incidentes sem `lat/lon` ou com categoria filtrada fora; `renderIncidentCard(incident: Incident, lang): string` (HTML com título, local, hora, descrição, selo de fonte, link "Ver fonte original" e, só se `image?.allowed === true` e `safeUrl(image.url)`, a imagem com crédito).
- Produces (DOM): `mountMap(el: HTMLElement, state: { data, impact, lang }): { update(state): void, destroy(): void }`. Leaflet com mosaicos OpenStreetMap e atribuição visível; camada `leaflet.heat` com gradiente amarelo `#F4C20D` → laranja `#EE7B1E` → vermelho `#D1242F` → `#7F1020`; pins por categoria (quadrado, círculo, losango tracejado; letra G/C/R); botões Continente/Açores/Madeira que centram o mapa (continente `[39.6,-8.0]` zoom 7; Açores `[38.65,-27.2]` zoom 6; Madeira `[32.75,-16.95]` zoom 8); filtros por categoria; legenda; clique num pin abre a ficha (`renderIncidentCard`) num painel ao lado (abaixo em ecrãs estreitos). Pins focáveis por teclado.

- [ ] **Step 1: Escrever testes**: `buildHeatPoints` omite concelhos com score 0 e devolve `[lat,lon,0.3]` para score 30; `buildPins` omite incidente com `lat:null`, omite categoria desmarcada, mantém `verified`; `renderIncidentCard` com `image.allowed:false` não contém `<img`; com `allowed:true` contém `<img` e o crédito; com `image.url:'javascript:x'` e `allowed:true` não contém `<img`; título `<script>` aparece escapado; contém sempre o link da fonte quando o url é seguro.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/ui` → FAIL.
- [ ] **Step 3: Implementar** os módulos puros e `mountMap`. Imagem: `onerror` remove o elemento `<img>` (sem ícone partido) — usar `addEventListener`, não atributo inline.
- [ ] **Step 4: Correr** `npx vitest run tests/ui` → PASS.
- [ ] **Step 5: Verificar no browser** com `npm run dev:sample` (copia `tests/fixtures` para `public/data` num diretório temporário servido pelo dev server, sem tocar nos ficheiros versionados): o heatmap aparece, os pins abrem a ficha, a ficha sem imagem não mostra imagem, o zoom e o arrasto funcionam, os botões Açores/Madeira centram o mapa, o filtro esconde pins.
- [ ] **Step 6: Commit** `feat: interactive map with heatmap, pins and incident card`.

### Task 8: Painel "Na sua zona"

**Files:**
- Create: `src/ui/zonePanel.js`
- Test: `tests/ui/zonePanel.test.js`

**Interfaces:**
- Consumes: `nearestConcelho` (Task 6), `computeImpact` resultado, `Contact`, `Shelter`, `Warning`, `haversineKm`.
- Produces: `zoneModel(input: { concelhoCode: string, concelhos, warnings, contacts, shelters, now }): { concelho: Concelho, warning: Warning | null, contact: Contact | null, shelters: (Shelter & { km: number })[] }` (abrigos do concelho, ordenados por distância ao centro do concelho; `warning` é o mais grave em vigor); `renderZonePanel(el, state)` com `<select>` etiquetado por todos os concelhos (ordenados por nome), botão "Usar a minha localização" (pede `navigator.geolocation`; negação, erro ou localização fora de Portugal mostra mensagem e mantém o concelho escolhido), contactos (112 fixo, bombeiros, proteção civil, abrigos) e estado sem contactos ("sem dados" em vez de campo vazio). A escolha é guardada em `localStorage` com `try/catch`.

- [ ] **Step 1: Escrever testes**: `zoneModel` escolhe o aviso mais grave em vigor; sem contacto devolve `contact: null`; abrigos ordenados por distância; `renderZonePanel` com geolocalização negada mostra a mensagem de erro e mantém o select; localização em Madrid mostra "fora de Portugal" e não altera a seleção; o select tem `<label for>`.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/ui/zonePanel.test.js` → FAIL.
- [ ] **Step 3: Implementar** `zoneModel` e `renderZonePanel`.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: zone panel with contacts and shelters`.

### Task 9: Secções de conteúdo

**Files:**
- Create: `src/ui/statusBand.js`, `src/ui/recommendations.js`, `src/ui/forecast.js`, `src/ui/services.js`, `src/ui/myths.js`, `src/ui/feed.js`
- Test: `tests/ui/sections.test.js`

**Interfaces:**
- Consumes: dados carregados, `sourceBadge`, `localized`, `t`.
- Produces: `statusModel(data, now): { highestLevel, maxGustKmh: number|null, incidentCount, redDistricts, totalDistricts: 18 }` (a partir de avisos em vigor, previsão e incidentes); `recommendationsFor(situation: 'casa'|'estrada'|'costa', level: 'verde'|'amarelo'|'laranja'|'vermelho', lang): { title: string, text: string }[]` (6 itens por situação em vermelho, chaves em `i18n`; níveis mais baixos devolvem os mesmos itens com um aviso introdutório); `filterFeed(items: FeedItem[], category: Category | 'todas'): FeedItem[]` (ordenado por `time` decrescente); `renderForecast`, `renderServices`, `renderMyths`, `renderFeed`, `renderStatusBand`, `renderRecommendations` — cada um recebe `(el, state)` e mostra para cada item o selo de fonte com link; lista vazia mostra a mensagem de estado vazio traduzida. Cada bloco de estradas/serviços mostra a etiqueta de estado em texto além da cor.

- [ ] **Step 1: Escrever testes**: `statusModel` sem dados → `highestLevel 'verde'`, `maxGustKmh null`, `incidentCount 0`; com fixtures devolve o valor máximo da previsão; `filterFeed(...,'redes_sociais')` só devolve essa categoria e vem ordenado; `recommendationsFor('casa','vermelho','pt')` devolve 6 itens e `'en'` devolve texto diferente; cada `render*` com lista vazia contém a mensagem de estado vazio; cada item renderizado contém categoria da fonte e `href` da fonte; item de `redes_sociais` não verificado contém "Não verificado"; título com `<img onerror>` aparece escapado.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/ui/sections.test.js` → FAIL.
- [ ] **Step 3: Implementar** os seis módulos. O texto das recomendações vem de `pt.js`/`en.js` (conteúdo das 6 recomendações do design: ficar em casa, afastar-se de janelas, recolher objetos, preparar luz e comunicações, não se abrigar sob árvores, seguir a Proteção Civil; versões para estrada e costa escritas a partir de fontes oficiais, ver nota de conteúdo em `docs/data-sources.md`).
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat: status, recommendations, forecast, services, myths and feed sections`.

### Task 10: Página, estilos e acessibilidade

**Files:**
- Create: `src/main.js`, `src/ui/header.js`, `src/ui/footer.js`, `src/styles/main.css`
- Modify: `index.html`
- Test: `tests/ui/page.test.js`

**Interfaces:**
- Consumes: todos os módulos anteriores.
- Produces: `src/main.js` carrega os dados, calcula o impacto, monta barra de emergência, cabeçalho (nome, hora da última atualização, seletor PT/EN), estado, mapa, zona, recomendações, previsão, serviços, boatos, últimas informações e rodapé; recarrega os dados a cada 5 minutos sem recarregar a página nem perder filtros; ao mudar de idioma volta a renderizar tudo. Mostra um banner no topo quando `freshness` é `stale` ou `unknown` (com a hora, ou "Sem dados ainda") e uma nota por cada ficheiro em `errors`. `src/ui/footer.js` inclui a secção "Como calculamos o impacto" com a fórmula da Task 5. CSS segue o design: fundo `#F5F3EE`, tinta `#15202B`, fontes Space Grotesk (títulos) e Inter (texto) com `font-display: swap`, alvos de 44 px, foco visível, layout fluido a 390 px sem scroll horizontal.

- [ ] **Step 1: Escrever testes** (jsdom, `loadAll` simulado): com todos os ficheiros vazios a página mostra "Sem dados ainda" e todos os blocos com estado vazio; com um fixture cujo `updatedAt` tem 90 min mostra o banner de dados desatualizados; com `incidents.json` em falta mostra a nota de erro e o resto da página renderiza; `document.documentElement.lang` acompanha o idioma; existe exatamente um `<h1>`; todos os botões têm nome acessível.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/ui/page.test.js` → FAIL.
- [ ] **Step 3: Implementar** `main.js`, `header.js`, `footer.js` e `main.css`.
- [ ] **Step 4: Correr** `npm test` → tudo PASS; `npm run build` → sucesso.
- [ ] **Step 5: Verificar no browser** com `npm run dev:sample` a 1440 px e a 390 px: sem scroll horizontal, mapa e ficha utilizáveis, alternância PT/EN, teclado alcança select, filtros e pins.
- [ ] **Step 6: Commit** `feat: assembled page, styles and accessibility`.

### Task 11: Recolha IPMA

**Files:**
- Create: `scripts/fetch-ipma.mjs`, `src/ingest/ipma.js`
- Test: `tests/ingest/ipma.test.js`, `tests/fixtures/ipma/*.json` (respostas reais guardadas)

**Interfaces:**
- Produces: `normalizeWarnings(raw: unknown): Warning[]` (avisos IPMA → contrato; ignora `awarenessLevelID: 'green'`; mapeia `yellow/orange/red` para `amarelo/laranja/vermelho`); `normalizeForecast(raw: unknown, now: Date): ForecastDay[]`. `source` é sempre `{ category: 'governamental', name: 'IPMA', url: 'https://www.ipma.pt' }`. `scripts/fetch-ipma.mjs` descarrega os dados e escreve `public/data/warnings.json` e `forecast.json`, validando antes de escrever e sem alterar nenhum ficheiro se a validação falhar.

- [ ] **Step 1: Investigar os endpoints** da API aberta do IPMA (`https://api.ipma.pt/open-data/`): lista de avisos meteorológicos, previsão diária por local, distritos, e observação/ondulação. Guardar respostas reais em `tests/fixtures/ipma/` e registar endpoints, limites e licença em `docs/data-sources.md`. Se algum dado (por exemplo ondulação) não existir na API aberta, registar a alternativa e deixar `waveM` a partir da fonte alternativa.
- [ ] **Step 2: Escrever testes** com as respostas guardadas: aviso `red` num distrito → `level 'vermelho'` com `area` igual ao código do distrito; `green` é omitido; resposta sem avisos → `[]`; resposta malformada → lança erro com mensagem clara (o script não escreve ficheiros); `normalizeForecast` devolve no máximo 3 dias com `windGustKmh` numérico.
- [ ] **Step 3: Correr e ver falhar:** `npx vitest run tests/ingest` → FAIL.
- [ ] **Step 4: Implementar** `ipma.js` e `fetch-ipma.mjs`.
- [ ] **Step 5: Correr** testes → PASS; `node scripts/fetch-ipma.mjs` com rede ativa produz ficheiros válidos (`npm run validate-data` → OK).
- [ ] **Step 6: Commit** `feat: IPMA ingestion`.

### Task 12: Tarefa agendada e documentação

**Files:**
- Create: `docs/scheduled-task.md`
- Modify: `README.md`
- Test: `tests/docs/scheduled-task.test.js`

**Interfaces:**
- Produces: `docs/scheduled-task.md` com a instrução completa da tarefa agendada do Claude, incluindo:
  1. correr `node scripts/fetch-ipma.mjs`;
  2. recolher de fontes governamentais, comunicação social e redes sociais (a lista de fontes e as regras de verificação ficam no documento), preenchendo `incidents.json`, `feed.json`, `services.json`, `shelters.json`, `myths.json`, `contacts.json` segundo o contrato;
  3. regras: indicar sempre a categoria e o URL da fonte original; marcar `verified:false` e `redes_sociais` em relatos não confirmados; definir `image.allowed:true` apenas com licença ou autorização verificada, nunca copiar imagens para o repositório; texto opcional `{pt,en}`; nunca inventar dados;
  4. escrever `meta.json.updatedAt` com a hora atual em ISO só depois de os outros ficheiros terem sido escritos;
  5. correr `npm run validate-data`; se falhar, **não** fazer push e deixar os ficheiros anteriores;
  6. `git add public/data`, commit `data: update <hora>` e `git push`.
- `README.md` explica: o que é, como correr (`npm run dev`, `npm run dev:sample`, `npm test`, `npm run build`), estrutura de dados, e que o `dist/` é estático e publica-se em qualquer alojamento (a escolha do alojamento continua em aberto).

- [ ] **Step 1: Escrever teste** que lê `docs/scheduled-task.md` e confirma que menciona `validate-data`, `meta.json`, `verified`, `image.allowed` e `git push`, e que `README.md` menciona `dev:sample`.
- [ ] **Step 2: Correr e ver falhar:** `npx vitest run tests/docs` → FAIL.
- [ ] **Step 3: Escrever** `docs/scheduled-task.md` e atualizar `README.md`.
- [ ] **Step 4: Correr** `npm test`, `npm run validate-data` e `npm run build` → tudo OK.
- [ ] **Step 5: Commit** `docs: scheduled task instructions and README`.

---

## Self-review

- **Cobertura da spec:** secção 3 (11 blocos): hora de atualização (T3/T10), barra de emergência e cabeçalho (T10), estado atual (T9), mapa (T7), zona/abrigos/contactos (T8; lista de abrigos também ligada ao mapa por `shelters.json`), recomendações, previsão, serviços, boatos, últimas informações (T9). Secção 5 (fontes): T1, T9, T7. Secção 6 (dados): T2, T3, T11, T12. Secção 7 (idioma, acessibilidade): T4, T10. Falha de atualização: T3 e banner em T10. Anti-objetivo de leveza em rede móvel: sem framework, mosaicos e dados pequenos; medir tamanho do `dist/` no Step 4 da Task 10 (alvo: JS inicial abaixo de 300 KB comprimido).
- **Decisões tomadas por este plano** (a rever pelo autor): Vite + JavaScript puro; pesos do heatmap `1/0.7/0.7/0.3` e limiares 10/25/50; mosaicos OpenStreetMap (para tráfego alto convém avaliar um fornecedor de mosaicos próprio ou com contrato); traduções de texto recolhido opcionais `{pt,en}`; dados iniciais vazios em vez de exemplo.
- **Em aberto da spec que este plano não resolve:** alojamento (questão 1), origem de abrigos e contactos por concelho (5), viabilidade da recolha de redes sociais (6). O plano deixa o formato pronto e a tarefa agendada com regras; as fontes concretas definem-se ao escrever `docs/scheduled-task.md`.
