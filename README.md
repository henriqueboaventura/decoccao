# Decocção — Calculadora de Programas de Mostura

App estático (PWA) que calcula programas de mostura por decocção — e por
pseudo-decocção — direto no navegador: divisão de puxadas por balanço de
energia, cronograma completo, gráfico de temperatura x tempo e cronômetro
de brassagem por evento.

## O que faz

- 8 métodos de mostura: **Simples**, **Dupla Tradicional**, **Dupla Moderna**,
  **Hochkurz**, **Boaventura**, **Dupla Aprimorada**, **Tripla Tradicional**
  — os três do meio cruzados com o [Braukaiser Wiki de decocção](https://www.hboaventura.com/braukaiser-wiki/pages/Decoction_Mashing.html)
  para preencher métodos que faltavam — e **Pseudo-decocção**, que não é
  decocção: é o *cereal mash*/*double-mash system* (Briggs et al., Kunze,
  Narziß, Brücklmeier), uma panela só sem puxada nem retorno.
- Todos os parâmetros de cada método (temperaturas, tempos de rampa, taxa de
  aquecimento, tempos de transferência etc.) ficam editáveis em formulário.
- A tabela de passo a passo, o tempo total e o gráfico de temperatura x tempo
  são recalculados na hora, a partir do balanço de energia de cada método
  (ver `methods.js`). O gráfico marca cada mudança de temperatura com um
  ponto e o respectivo horário no eixo X.
- Cronômetro de brassagem por evento: iniciar/pausar/resetar e confirmar
  "Cheguei" ao fim real de cada etapa (não um horário previsto) — o resto
  do cronograma se desloca pelo atraso ou adiantamento acumulado. Etapa
  atual destacada na lista, marcador no gráfico, alarme (som + vibração)
  quando o tempo previsto é atingido, tela não apaga sozinha enquanto roda
  (Wake Lock). Estado salvo por método, sobrevive a um recarregamento de
  página (baseado em relógio de parede, não em contador).
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

## Testes

`methods.js` (o motor de cálculo) tem uma suíte de testes unitários em
`tests/`, usando só o test runner nativo do Node (`node:test` — nenhuma
dependência de dev):

```bash
npm test
# ou, sem npm:
node --test tests/
```

O que a suíte cobre:

- **`regression.test.js`** — os números golden dos 8 métodos com
  parâmetros de fábrica (tempo total, nº de etapas, volume e fração de
  cada puxada), validados rodada após rodada de auditoria externa (ver
  `CHANGELOG.md`). É a rede de segurança contra regressão silenciosa:
  se um valor aqui mudar sem uma linha no changelog explicando por quê,
  é bug.
- **`physics.test.js`** — o balanço de energia da decocção
  (`d = (T2-T1)/(Tb-T1)`) reconstruído e conferido contra o que o motor
  calcula, pra qualquer método e não só os defaults; a conservação de
  energia em puxadas devolvidas em mais de uma parte (T1 sempre fixo na
  puxada original, travado contra a fórmula aditiva do bug original —
  achado C1 do Raio-X — e conferido pela conta publicada do achado N9);
  a Dupla Moderna e a Dupla Aprimorada concordando no mesmo volume pra
  mesma viagem térmica; o Boaventura com os patamares reais batendo com
  a correção do achado T6; o Hochkurz com fervura curta nas duas
  decocções (Narziß); invariantes estruturais nos 8 métodos (schema
  autoconsistente, cronograma monotônico, sem NaN).
- **`sanitize.test.js`** — `sanitizeParams` (movida de `app.js` pra
  `methods.js` justamente pra ficar testável): todo campo grampeado no
  seu próprio `[min,max]`, valores não numéricos caindo no default, e
  os casos de contorno exatos que o Raio-X e a Segunda Leitura rodaram
  na ferramenta à mão (água negativa, taxa de aquecimento zero, campo
  ausente de uma versão antiga do app).
- **`mash-cooling.test.js`** — o parâmetro de perda térmica em espera
  (T3): padrão 0 é sempre um no-op; ligado, o volume de puxada cresce
  monotonicamente; o tooltip de "patamar real" sobrevive (achado Q2).
- **`pseudo-decoccao.test.js`** — os 11 casos de teste e as duas
  tabelas de passo a passo completas da especificação da
  Pseudo-decocção, os dois diagramas publicados reproduzidos pela
  fórmula direta, a constante térmica travada contra regressão, o teto
  da taxa escalada (achado Q10), a evaporação da 1ª parcela (achado
  Q5) e o guarda de alvo inalcançável (V2).

Os fixtures numéricos de `regression.test.js`/`physics.test.js` vêm
das cinco rodadas de auditoria externa deste projeto (os PDFs "Raio-X",
"Segunda" a "Quinta Leitura da Calculadora", mantidos fora do
repositório) — cada valor golden é um número que uma leitura
independente conferiu à mão contra a literatura, não um número que o
próprio motor gerou pra si mesmo.

**Fora do escopo desta suíte, por enquanto:** a lógica do cronômetro
de brassagem e boa parte da interface (`app.js`) — o alarme repetindo,
o cálculo de atraso/adiantamento (`effectiveRows`), a decisão de
mostrar a panela de fervura no gráfico (`annotateDisplayBoil`), as
faixas de severidade de aviso — são funções puras, mas hoje vivem
dentro da mesma IIFE que manipula o DOM, sem exportação própria.
Boa parte dos achados críticos das rodadas 3-5 (P1-P10, N1-N8, Q1-Q13)
foi justamente nessa camada, não em `methods.js` — é a maior lacuna
real da suíte hoje. Fechar isso pede extrair essas funções pra um
módulo sem DOM (como `sanitizeParams` acima) antes de testar; é um
projeto à parte, não uma adição de meia hora.

**Antes de publicar uma nova versão** (bump em `version.js` +
`CHANGELOG.md`), rode `npm test` — o CI (`.github/workflows/test.yml`)
já roda em todo push, mas não trava o deploy do GitHub Pages sozinho
(ver "Deploy" abaixo), então a checagem manual antes do bump continua
sendo o que garante isso.

Escrevendo um teste novo: prefira valores conferidos à mão ou contra
uma fonte externa (a própria especificação em PDF, um livro-texto, uma
tabela publicada) a copiar o que o motor já devolve — testar "o código
bate com o código" não pega regressão nenhuma.

## Estrutura

- `index.html`, `styles.css`, `app.js` — interface.
- `methods.js` — motor de cálculo: schema de parâmetros + fórmulas de cada
  método, verificadas contra a literatura de brassagem (Kunze, Narziß,
  Briggs et al., Brücklmeier, Braukaiser Wiki) e conferidas em `tests/`.
  Exporta tanto pra `window.Decoccao` (navegador) quanto por
  `module.exports` (Node — testes e scripts).
- `tests/` — suíte de testes unitários (`node:test`, zero dependências).
  Ver "Testes" acima.
- `scripts/verify_pseudo_decoccao.js` — script de conferência da
  Pseudo-decocção com saída legível, referenciado pela própria
  especificação em PDF do método.
- `manifest.webmanifest`, `service-worker.js`, `icons/` — PWA.
- `version.js` — versão atual do app (única fonte, lida pelo rodapé e pelo
  service worker). Ver `CHANGELOG.md`.

## Versionamento

Segue [SemVer](https://semver.org/lang/pt-BR/). A versão atual está em
`version.js` e aparece no rodapé do app. Toda mudança relevante vai pro
`CHANGELOG.md`. Bump de versão troca o nome do cache do service worker
automaticamente, então nunca precisa lembrar de fazer isso à mão.

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
Actions, sem build; o deploy em si não depende dos testes passando.
Qualquer alteração enviada para `main` já reflete no site em
https://henriqueboaventura.github.io/decoccao/ em alguns minutos.

Há uma Action (`.github/workflows/test.yml`) que roda a suíte de testes
em todo push — ela sinaliza regressão (✕ vermelho no commit/PR), mas não
bloqueia o Pages, que publica de qualquer jeito. Rodar `npm test`
localmente antes de enviar pra `main`, especialmente antes de um bump de
versão, continua sendo o que evita publicar uma regressão.
