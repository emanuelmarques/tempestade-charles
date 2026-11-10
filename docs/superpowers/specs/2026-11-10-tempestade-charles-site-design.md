# Site de informação sobre a Tempestade Charles em Portugal — Especificação

Data: 2026-11-10 · Estado: rascunho para aprovação

Convenção: **[Decidido]** foi dito pelo autor do pedido. **[Minha escolha]** é uma escolha de quem escreveu a especificação, ainda não validada. **[Em aberto]** precisa de resposta antes ou durante o plano.

## 1. Intenção

Dar ao cidadão comum informação atualizada sobre a tempestade Charles em Portugal, num único sítio. A pessoa chega (provavelmente no telemóvel e com pressa) e precisa de perceber:

1. o que está a acontecer na sua zona;
2. qual é o risco;
3. a quem recorrer (serviços de emergência da sua área) e o que fazer.

O site agrega fontes governamentais, comunicação social e redes sociais, e mostra sempre de onde vem cada informação, para que o leitor avalie a fiabilidade por si.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
- Mapa interativo com heatmap de impacto e pins de ocorrências.
- Dados meteorológicos do IPMA.
- Recomendações práticas.
- Contactos de emergência por zona.
- Transparência total sobre a origem da informação.

**Não-objetivos**
- Não é um serviço oficial nem substitui avisos da Proteção Civil ou do IPMA.
- Não recolhe contributos dos utilizadores (sem submissão de relatos, sem contas, sem comentários). [Minha escolha]
- Sem histórico, estatísticas nem opinião; o foco é a emergência em curso.

**Anti-objetivos (seria um fracasso mesmo que funcione tecnicamente)**
- Mostrar um relato de rede social como se fosse facto confirmado.
- Mostrar dados desatualizados sem o utilizador o saber.
- Copiar fotografias com direitos de autor para o nosso site.
- Ser lento ou pesado numa rede móvel fraca durante a emergência. [Minha escolha]

## 3. Conteúdo do site

Todas as secções abaixo estão no design (secção 8). **[Decidido]** salvo indicação.

1. **Hora da última atualização**, sempre visível no cabeçalho.
2. **Barra de emergência**: 112 e SNS 24 (808 24 24 24).
3. **Estado atual**: nível de aviso mais alto, rajada máxima prevista, número de ocorrências, distritos em aviso vermelho. [Minha escolha: estes quatro indicadores]
4. **Mapa interativo** (secção 4).
5. **Painel "Na sua zona"**: o utilizador escolhe o concelho (ou usa a localização) e vê o aviso em vigor e os contactos: 112, bombeiros, proteção civil municipal, abrigo mais próximo. [Escolha de concelho ou localização: minha escolha]
6. **Recomendações**: conselhos práticos de segurança, adaptados à situação (em casa, na estrada, perto da costa) e ao nível de risco. [Adaptação por situação: minha escolha]
7. **Evolução prevista para 72 horas**: vento, precipitação e ondulação por dia, a partir do IPMA.
8. **Estradas, transportes e serviços**: estradas cortadas, comboios, voos, escolas, cortes de eletricidade, água e comunicações.
9. **Abrigos e pontos de apoio** por concelho.
10. **Boatos desmentidos**: afirmações falsas a circular e o que dizem fontes oficiais ou verificadores de factos.
11. **Últimas informações**: lista cronológica com filtro por categoria de fonte.

## 4. Mapa interativo

- Mapa de Portugal com zoom e deslocação. [Decidido: interativo]
- **Heatmap de impacto** que combina (a) o risco previsto pelo IPMA e (b) os incidentes reportados. [Decidido: combinação dos dois]
  - [Minha escolha] Cálculo por concelho: o nível de aviso do IPMA dá a base e os incidentes aumentam a intensidade, com mais peso para fontes governamentais do que para redes sociais não verificadas.
  - [Em aberto] A fórmula exata e os pesos. O plano deve propor uma fórmula simples e documentada, visível ao utilizador.
- **Pins de ocorrências**. Ao carregar num pin abre-se uma ficha com: título, local, hora, descrição, categoria da fonte, link para a fonte original e fotografias. [Decidido]
- **Fotografias**: só se mostram quando a fonte o permitir (por exemplo, licença aberta ou incorporação autorizada). Caso contrário a ficha aparece sem imagem. [Decidido] O plano deve definir como se decide, por item, se uma imagem pode ser mostrada.
- Filtros por categoria de fonte e legenda do impacto e dos pins.
- Seletor Continente, Açores e Madeira. [Minha escolha] As regiões autónomas ficam fora do desenho do mapa atual e precisam de ser desenhadas.

## 5. Fontes e transparência

Cada informação (ocorrência, notícia, desmentido, linha de serviços) mostra **de forma visível** a categoria da fonte e o link para a fonte original. [Decidido]

Categorias:

| Categoria | Marca no design | Tratamento |
|---|---|---|
| Governamental | quadrado azul | Tratada como oficial |
| Comunicação social | círculo verde | Atribuída ao meio |
| Redes sociais | losango tracejado âmbar | Sempre marcada "Não verificado" [Minha escolha] |

A categoria nunca é indicada só pela cor: há sempre forma e texto. Como tratar um relato de rede social por confirmar é, em parte, escolha minha: mostrar, mas distinto e rotulado, em vez de esconder. [Em aberto: confirmar com o autor]

## 6. Dados e atualização

- **Meteorologia**: dados abertos do IPMA (avisos, previsão, observações). [Decidido] O plano começa por investigar quais endpoints existem, os seus limites e licença.
- **Atualização**: uma tarefa agendada do Claude recolhe, resume e classifica a informação, e faz push dos dados para o repositório. [Decidido]
- **Site estático**: HTML e JavaScript, sem servidor. Os dados ficam em ficheiros (por exemplo JSON) no repositório. [Minha escolha]
- **Mapa**: biblioteca Leaflet. [Minha escolha]
- **Hospedagem**: [Em aberto] não foi escolhida (Vercel, Cloudflare Pages, GitHub Pages ou outra).
- **Frequência**: o design indica atualização aproximadamente a cada 15 minutos. [Minha escolha, depende dos limites da tarefa agendada]
- **Contrato de dados**: o plano deve definir o formato dos ficheiros (ocorrências, avisos, notícias, serviços, abrigos, desmentidos), incluindo campos obrigatórios de categoria da fonte, link, hora e, nas ocorrências, coordenadas e estado de verificação. A tarefa agendada deve validar os dados antes do push.
- **Falha de atualização**: se a recolha falhar, o site mantém os últimos dados e a hora de atualização deixa de avançar, de modo que o desatualizado é visível. Considera-se um aviso explícito quando passar um limite. [Minha escolha]

## 7. Idioma e acessibilidade

- **Idioma**: português (por omissão), com tradução para inglês e seletor visível. [Decidido] [Em aberto] O texto recolhido (notícias, descrições) pode ficar na língua original ou ser traduzido pela tarefa agendada; falta decidir.
- Alvos táteis de pelo menos 44 px, contraste de texto adequado, categorias nunca só por cor, funcionamento no telemóvel. [Minha escolha]

## 8. Design

O design visual está no canvas: https://claude.ai/artifact/XF6HJLu49LzTdSoX2nLZWL

Estado: o artboard desktop está escrito localmente, mas a publicação foi bloqueada por uma regra de permissões. O artboard de telemóvel ainda não foi escrito.

Opções visuais que foram minhas: visual novo, claro e legível, cores de aviso amarelo, laranja e vermelho, tipografia Space Grotesk e Inter. Todo o conteúdo do design é ilustrativo. O contorno de Portugal no mapa do design é uma aproximação; a implementação usa dados geográficos reais.

## 9. Questões em aberto

1. Onde se publica o site.
2. Fórmula do heatmap e pesos por categoria de fonte.
3. Como se determina, por item, se uma fotografia pode ser mostrada.
4. Tradução do conteúdo recolhido: língua original ou traduzido.
5. Origem dos dados de abrigos e dos contactos por concelho.
6. Se a recolha de redes sociais é viável (acesso, limites e termos de cada plataforma) e quais redes entram.
7. Âmbito geográfico: só o continente na primeira versão, ou também Açores e Madeira.
8. Dados de referência sobre a tempestade (nome oficial, período, zonas afetadas) a confirmar na fonte oficial antes de escrever recomendações específicas.

## 10. O que fica para quem constrói

Escolha de estrutura de pastas, estilo de código, formato exato dos ficheiros de dados, estratégia de testes, e a forma de validar os dados antes do push. O plano de implementação (writing-plans) parte deste documento depois de aprovado.
