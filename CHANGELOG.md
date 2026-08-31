# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
versionamento segue [SemVer](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`).
A versão atual fica em `version.js` e aparece no rodapé do app.

## [1.4.0] — 2026-08-31

### Adicionado
- Tema manual (claro/escuro/sistema) — botão de 3 estados no cabeçalho,
  preferência salva no dispositivo.
- Sombreamento das faixas de atuação das principais enzimas da mostura
  (β-glucanase 40-45°, protease 43-57°, β-amilase 60-70°, α-amilase
  65-80°, Laus et al. 2022) no gráfico de temperatura, com legenda —
  ajuda a entender o que a mostura está "fazendo" em cada patamar.
- Predefinições (salvar/carregar/excluir programas nomeados) voltam a
  aparecer na interface — a UI já existia, só estava com `hidden` no HTML.
- Fonte de cada método (Braukaiser Wiki, Narziß, Kunze etc.) exibida
  abaixo da descrição, extraída dos comentários que já existiam no código.
- Tooltip do gráfico agora funciona por toque, não só com mouse.
- `role="tablist"` completo nas abas de método: `aria-controls` apontando
  pro conteúdo, navegação por setas/Home/End entre as abas.
- Semântica de tabela (`role="table/row/rowheader/cell"`) na lista de
  etapas, pra leitores de tela.
- Anúncio de virada de etapa do cronômetro pra leitores de tela
  (`aria-live`, só na transição — não a cada meio segundo do contador).

### Corrigido
- No gráfico, a linha da fervura (panela) descia pra temperatura da
  mostura assim que a primeira de várias adições parciais retornava (ex.:
  Dupla Aprimorada) — mesmo a panela ainda tendo metade da decocção
  fervendo. Agora ela só "esvazia" (a linha some) depois do retorno FINAL
  de cada puxada.
- Texto do eixo do gráfico ficava ilegível (~4px reais) em telas
  estreitas, porque o SVG escala o texto junto com o resto — agora mede a
  largura renderizada e compensa, mantendo um tamanho mínimo real.
- Tipografia pequena (10-11px) e opacidade agressiva (0,55) nas etapas
  concluídas da lista — risco de contraste real com luvas/vapor/sol.
  Aumentada a fonte e suavizada a opacidade (0,72).

## [1.3.0] — 2026-08-31

### Adicionado
- Tooltip "?" na linha de cada "Rampa de X", mostrando o tempo REAL que a
  mostura passa naquele patamar — não só o repouso digitado. Enquanto a
  decocção é puxada, aquecida, sacarifica e ferve, a mostura principal
  fica parada na mesma temperatura, e esse tempo (que em alguns programas
  chega a 4x o valor digitado) não aparecia em lugar nenhum da tela.
- Alerta específico dentro desse tooltip quando o patamar fica entre
  30-45°C por mais de 45min: é a janela de crescimento de bactérias
  láticas (Sauergut) sem controle, então vale confirmar que é intencional.

## [1.2.0] — 2026-08-31

### Corrigido
- Dupla Tradicional, Dupla Moderna e Hochkurz: a 2ª decocção ia direto pra
  fervura sem passar pela sacarificação (a 1ª sempre passou) — sem esse
  repouso, o amido dessa porção não converte antes da fervura matar as
  enzimas. Agora as duas decocções seguem o mesmo regime (+~10min).
- Rótulos que craviam uma fração fixa ("Transferência 1/3...", "...
  (50-60%)...") contradiziam o % real mostrado ao lado assim que o volume
  passou a ser calculado. Removida a fração hardcoded do rótulo — quem
  quiser o número, o número real já está ali do lado.
- Números da interface (volumes, temperaturas, porcentagens) agora em
  pt-BR (vírgula decimal) e com espaço antes da unidade; porcentagem do
  volume puxado ganhou uma casa decimal, consistente com o volume em L.

### Adicionado
- Aviso contextual no tooltip de "puxar" quando a fração ultrapassa 50% do
  volume total da mostura, explicando por que aquela puxada específica é
  segura (tem repouso de conversão próprio, ou volta em mais de uma
  adição) — em vez de deixar o usuário sem explicação diante de um número
  grande.
- Barra de resumo: "Volume da mostura" e "Maior puxada" (com tooltip
  explicando o cálculo e a folga mínima recomendada de panela) substituem
  os dois campos que só ecoavam "Temp. Mash Out" e "Temp. de fervura".
- Abaixo de 860px de largura, a fila de abas de método vira um `<select>`
  nativo — com 7 métodos a fila estourava a linha sem indicação de scroll,
  e a última aba ficava invisível no celular.

## [1.1.0] — 2026-08-31

### Adicionado
- Tooltip "?" em cada parâmetro do formulário, com explicação mais longa e
  específica do que cada campo faz.
- Tooltip no pill "puxar" das etapas de decocção — varia entre recomendar
  puxada grossa ou rala conforme a etapa ainda precisa descansar pra
  sacarificação ou não (fonte: Braukaiser Wiki, Decoction Mashing).
- Descrição resumida de cada método, exibida no topo abaixo das abas.
- Aviso de nova versão disponível (PWA), com botão "Recarregar" que fica
  visível até o usuário agir.
- Link pro Brassagem Forte no rodapé.
- Versionamento do app (`version.js`, este changelog).

### Corrigido
- Volume de decocção devolvida em mais de uma adição estava superestimado
  em 16% (Dupla Aprimorada: 12,92L → 11,14L, agora bate com a Dupla
  Moderna pra mesma física de mistura).
- Inputs de parâmetro agora respeitam min/max de verdade (antes aceitavam
  qualquer valor digitado, incluindo negativos ou fora de faixa).
- No celular, o volume "puxar" ficava escrito em cima das temperaturas na
  lista de etapas — agora tem linha própria.
- Método Boaventura: rampas de maltose e dextrinização estavam com os
  tempos reais (não só os digitados) invertidos em relação à literatura do
  Hochkurz; ajustados os defaults (~35min reais a 62°C e ~44min a 71°C,
  total 1h34 em vez de 1h49).

### Interno
- Cache do service worker agora nomeado a partir da versão do app
  (`decoccao-v{versão}`), então todo bump de versão invalida o cache
  automaticamente — antes dependia de lembrar de trocar `CACHE_VERSION` à
  mão.

## [1.0.0] — 2026-08-29

A ferramenta deixa de ser só um planejador de cronograma e passa a
calcular o **volume de decocção** de cada puxada.

### Adicionado
- Motor de cálculo do volume a puxar em cada decocção (balanço de energia
  clássico), com campos de insumo (volume de água, massa de malte).
- Método **Boaventura** (autoral): rampas de maltose e dextrinização por
  aquecimento direto na tina, decocção única no fim do processo.
- Tooltip do gráfico de temperatura x tempo.

### Corrigido
- Diversos rótulos da interface com português incorreto.

## [0.1.1] — 2026-08-28

### Adicionado
- Créditos no rodapé (Henrique Boaventura e Fábio Koerich, Brassagem
  Forte).

## [0.1.0] — 2026-08-27

Versão inicial: PWA de calculadora de decocção reconstruída a partir da
planilha `Cálculos de decocção .xlsx`. Só cronograma — ainda sem cálculo
de volume.

### Adicionado
- 4 métodos iniciais: Simples, Dupla Tradicional, Dupla Moderna, Tripla
  Tradicional, com parâmetros editáveis e tabela de passo a passo.
- Gráfico de temperatura x tempo das duas tinas (mostura e fervura), com
  ponto e horário marcados em toda mudança de temperatura.
- Cronômetro de brassagem (iniciar/pausar/resetar/próxima etapa), com
  estado salvo por método (relógio de parede, sobrevive a reload).
- Métodos **Hochkurz** e **Dupla Aprimorada** (Enhanced Double Decoction),
  cruzados com o Braukaiser Wiki; ajuste da Simples pro "Single Decoction"
  do mesmo wiki.
- PWA instalável, funciona offline (Service Worker + manifest), ícones
  redesenhados.
- Autosave no `localStorage`, predefinições nomeadas (ocultas da UI por
  ora), exportar/importar configuração em JSON.

[1.4.0]: https://github.com/henriqueboaventura/decoccao/compare/5fd27df...main
[1.3.0]: https://github.com/henriqueboaventura/decoccao/compare/3bf6b39...5fd27df
[1.2.0]: https://github.com/henriqueboaventura/decoccao/compare/204aac3...3bf6b39
[1.1.0]: https://github.com/henriqueboaventura/decoccao/compare/a162452...5e60f93
[1.0.0]: https://github.com/henriqueboaventura/decoccao/compare/f9b0ed9...a162452
[0.1.1]: https://github.com/henriqueboaventura/decoccao/compare/12643a4...f9b0ed9
[0.1.0]: https://github.com/henriqueboaventura/decoccao/commits/12643a4
