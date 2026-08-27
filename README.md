# Decocção — Calculadora de Programas de Mostura

App estático (PWA) que reconstrói a planilha `Cálculos de decocção .xlsx` em uma
ferramenta usável no celular ou no computador, sem depender de Excel.

## O que faz

- 6 métodos de mostura: **Simples**, **Dupla Tradicional**, **Dupla Moderna**,
  **Hochkurz**, **Dupla Aprimorada** e **Tripla Tradicional** — os dois
  últimos cruzados com o [Braukaiser Wiki de decocção](https://www.hboaventura.com/braukaiser-wiki/pages/Decoction_Mashing.html)
  para preencher métodos que faltavam.
- Todos os parâmetros da planilha (temperaturas, tempos de rampa, taxa de
  aquecimento, tempos de transferência etc.) ficam editáveis em formulário.
- A tabela de passo a passo, o tempo total e o gráfico de temperatura x tempo
  são recalculados na hora, reproduzindo as fórmulas originais da planilha
  (ver `methods.js`). O gráfico marca cada mudança de temperatura com um
  ponto e o respectivo horário no eixo X.
- Cronômetro de brassagem: iniciar/pausar/resetar/pular para a próxima etapa,
  com a etapa atual destacada na lista e uma linha marcando o momento atual
  no gráfico. O estado do cronômetro é salvo por método e sobrevive a um
  recarregamento de página (baseado em relógio de parede, não em contador).
- Funciona offline como PWA (Service Worker + manifest) e pode ser instalado
  no celular ou desktop.
- Salva a configuração atual automaticamente no `localStorage` do navegador.
  Também é possível salvar predefinições nomeadas, exportar tudo para um
  arquivo `.json` (backup) e importar de volta.

## Rodando localmente

Não tem build step — é HTML/CSS/JS puro. Basta servir a pasta estaticamente:

```bash
python3 -m http.server 8080
# abrir http://localhost:8080
```

## Estrutura

- `index.html`, `styles.css`, `app.js` — interface.
- `methods.js` — motor de cálculo: schema de parâmetros + fórmulas de cada
  método, extraídos célula a célula da planilha original.
- `manifest.webmanifest`, `service-worker.js`, `icons/` — PWA.
- `Cálculos de decocção .xlsx` — planilha original, mantida como referência.

## Nota sobre a planilha original

Na aba "Tripla Tradicional" da planilha, a célula da "Terceira decocção"
(`C22`) referenciava por engano o tempo da 1ª decocção (10 min) em vez do
tempo próprio da 3ª decocção que já existia na planilha, não utilizado
(célula `C30`, 5 min). Esse app usa o valor correto (5 min, editável no
campo "Tempo da 3ª decocção"), o que reduz o tempo total desse método em
5 minutos frente à planilha original.

A "Simples" foi ajustada para seguir o "Single Decoction" do Braukaiser
Wiki (rampa de proteína 53-55°C → decocção leva a mostura à rampa de
sacarificação 65-68°C, ~45min → aquecimento direto até o mash-out),
diferente da versão original da planilha (que usava rampas de β/α-amilase
a 62/72°C).

## Métodos cruzados com o Braukaiser Wiki

- **Hochkurz**: mostura já "alta" (dough-in a ~62°C, sem rampa de
  proteína), 1ª decocção leva ao patamar de dextrinização (70-72°C,
  descanso de até 60min), 2ª decocção vai direto ao mash-out. Reaproveita
  o mesmo motor das Duplas, só com defaults diferentes.
- **Dupla Aprimorada** (Enhanced Double Decoction): rampa ácida inicial,
  1ª decocção maior (50-60% do lote) devolvida em **duas adições
  parciais** — a primeira leva a mostura à rampa de proteína, a segunda à
  sacarificação — e uma 2ª decocção menor leva direto ao mash-out.

## Deploy (GitHub Pages)

Publicado via GitHub Pages a partir da branch `main`, pasta raiz — sem
Actions, sem build. Qualquer alteração enviada para `main` já reflete no
site em https://henriqueboaventura.github.io/decoccao/ em alguns minutos.
