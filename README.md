# Tempestade Charles

Site estático de informação para a população sobre a tempestade Charles em Portugal: avisos do IPMA ao vivo, mapa de impacto por distrito, ocorrências com fonte, contactos de emergência, conselhos de segurança e contagem decrescente até às 0h de 11 de novembro de 2026 (hora de Lisboa).

- Especificação: `docs/superpowers/specs/2026-11-10-tempestade-charles-site-design.md`
- Plano: `docs/superpowers/plans/2026-11-10-tempestade-charles-site.md`
- Dados curados e tarefa agendada: `docs/scheduled-task.md`

## Como funciona

- **Avisos e previsão IPMA:** lidos ao vivo da API aberta do IPMA no browser (CORS aberto), com cópia local se a rede falhar. Não dependem de nenhuma tarefa agendada.
- **Ocorrências, notícias, serviços, abrigos, boatos:** ficheiros em `public/data/`, mantidos por uma tarefa agendada do Claude e validados por `npm run validate-data`.
- **Geografia:** os contornos dos distritos vêm do design (`design/`), extraídos com `scripts/extract-geo.mjs` para `src/data/geo.json`.
- **Localização do visitante (com a sua permissão):** escolhe por omissão o distrito (ponto dentro do contorno do mapa), a localidade IPMA mais próxima e o concelho. Os contactos da câmara municipal (autoridade municipal de proteção civil) vêm da API gratuita geoapi.pt, com cópia local. Sem permissão, o mapa mostra o distrito com maior impacto.
- **Farmácia e bombeiros mais próximos:** `public/data/places.json`, gerado por `node scripts/build-places.mjs` a partir do OpenStreetMap (ODbL); o mais próximo calcula-se no browser, sem serviços externos.
- **Páginas:** início, `recomendacoes.html` (o que fazer), `metodologia.html` (como se calcula o impacto) e `feedback.html` (abre o email para hello@emanuelsmarques.pt).
- **Impacto por distrito:** base do aviso IPMA (0/10/20/30) mais pontos das ocorrências (peso da fonte × gravidade × 5), máximo 100.

## Comandos

```bash
npm install
npm run dev          # servidor de desenvolvimento
npm run dev:sample   # com dados de exemplo (tests/fixtures/sample), sem alterar public/data
npm test             # testes
npm run validate-data
npm run build        # gera dist/ (estático, publica-se em qualquer alojamento)
npm run build   # SITE_URL (por omissão https://charles.emanuelsmarques.pt) acrescenta canonical, og:image, sitemap.xml e robots.txt com sitemap
```

## Por decidir

Alojamento e domínio, origem dos abrigos e contactos por concelho, viabilidade da recolha de redes sociais, e Açores e Madeira no mapa (hoje aparecem como lista de avisos).
