# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
versionamento segue [SemVer](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`).
A versão atual fica em `version.js` e aparece no rodapé do app.

## [1.11.1] — 2026-09-02

### Adicionado
- 33 testes novos, minerados dos PDFs das cinco primeiras rodadas de
  auditoria (Raio-X, Segunda a Quinta Leitura — mantidos fora do
  repositório):
  - `sanitizeParams` **movida de `app.js` pra `methods.js`** — era
    pura (só dependia de `defaultParams`), mas vivia do lado errado da
    linha entre motor e interface, fora do alcance de qualquer teste.
    `tests/sanitize.test.js` (29 testes): todo campo grampeado no seu
    `[min,max]`, valores não numéricos caindo no default, e os
    mesmos casos de contorno que o Raio-X (§3.3) e a Segunda Leitura
    (N1) rodaram na ferramenta manualmente (água negativa, taxa de
    aquecimento zero) — a defesa contra os dois achados C1/N1
    originais, agora permanente.
  - `physics.test.js`: trava contra a fórmula ADITIVA do bug C1
    original (12,92 L) — se a fração de uma puxada em partes voltar a
    ser somada em vez de substituída, o teste falha antes de precisar
    de uma nova auditoria pra pegar; a Dupla Moderna e a Dupla
    Aprimorada conferidas uma contra a outra (mesma física, mesma
    mostura, mesma viagem térmica 35°C→66°C, têm que dar o mesmo
    volume); a conta publicada do achado N9 (divisão em duas adições,
    4,33 L/6,81 L) reconstruída de forma independente; o Boaventura
    com os patamares reais (achado T6) batendo com a correção
    publicada.
- README: seção "Testes" documenta os fixtures como vindos das
  auditorias externas (não do próprio motor), e registra a maior
  lacuna real da suíte hoje — a lógica do cronômetro/interface
  (`app.js`) não é testada, porque hoje vive presa a uma IIFE com DOM;
  fechar isso é um projeto à parte, não uma adição rápida.

### Removido
- README: todas as referências à planilha original (`Cálculos de
  decocção .xlsx`) — a ferramenta se distanciou dela o bastante pra
  essa moldura de "recriar a planilha" não descrever mais o projeto.
  A "Nota sobre a planilha original" (dois bugs históricos dela, já
  corrigidos há muito) saiu; o arquivo `.xlsx` continua no repositório,
  só não é mais citado no README.

## [1.11.0] — 2026-09-02

Quinta leitura, fechada por completo: os oito achados da quarta
confirmados, dez achados novos na Pseudo-decocção (1 crítico, 1 grave,
3 de modelo, 2 de interface, 2 de acessibilidade, 1 de acabamento) — os
nove primeiros corrigidos de cara, o décimo (Q5, evaporação) implementado
na sequência, junto com uma suíte de testes unitários pedida à parte que
trava contra regressão em todo o motor de cálculo.

### Corrigido
- **[crítico] Q1**: uma brassagem em andamento na Pseudo-decocção ficava
  presa atrás da tela de "alvo fora do alcance" — o painel do
  cronômetro (Pausar/Cheguei/Resetar) estava dentro do mesmo wrapper
  escondido pelo aviso, então o relógio continuava contando escondido,
  sem nenhum controle acessível. Painel do cronômetro movido pra fora
  do `#resultsNormal`; o aviso agora também abre "Configurações
  avançadas" e foca no campo que resolve.
- **[grave] Q2**: ligar a perda térmica em espera (T3) apagava o
  tooltip de "tempo real do patamar" nos sete métodos de decocção — o
  agrupamento comparava temperatura exata, e com a mostura esfriando
  minuto a minuto dentro do patamar nenhum grupo se formava mais.
  Agrupamento passa a usar uma marca própria (`samePlateau`), não mais
  igualdade de valor.
- **[modelo] Q3**: dois textos da Pseudo-decocção diziam o oposto do
  que o motor calcula — o tooltip do campo "% do malte na 1ª parcela"
  ("mais água sobra, mais rala fica") e o próprio alarme de espessura
  baixa ("baixe a fração pra engrossar"), os dois com a direção
  invertida. Corrigidos.
- **[modelo] Q4**: as três sugestões do aviso "alvo fora do alcance"
  assumiam sempre um alvo alto demais — mas na prática, dentro dos
  limites dos campos, só o limite INFERIOR é violável. Mensagem agora
  tem um texto por lado do limite, e a sugestão de mudar a fração de
  malte (que move o limite ±1,7°C, quase nunca o bastante) saiu da
  lista.
- **Q6**: a legenda do gráfico anunciava uma "Tina de fervura" fixa no
  HTML mesmo na Pseudo-decocção, que não tem essa panela — nenhuma
  linha correspondente era desenhada. Legenda agora é montada a partir
  das séries que o gráfico de fato desenha.
- **[acessibilidade] Q7**: o aviso de "alvo fora do alcance" não era
  anunciado por leitor de tela — `role="alert"` adicionado.
- **[acessibilidade] Q8**: botão primário e aba selecionada reprovavam
  contraste AA nos dois temas (4,29:1 claro, 2,94:1 escuro — mínimo é
  4,5:1), pré-existente desde antes desta rodada. Tokens `--btn-bg`/
  `--btn-fg` novos, com o par que passa nos dois temas (6,62:1 /
  5,60:1).
- **Q9**: rótulo do parâmetro de perda térmica ("...em espera") não
  deixava claro que o efeito só vale entre a puxada e o retorno da
  decocção, não a brassagem inteira. Renomeado pra "...enquanto a
  decocção está fora".
- **[modelo] Q10**: a taxa de aquecimento escalada da Pseudo-decocção
  (massa térmica da 1ª parcela) não tinha teto — combinações extremas
  chegavam a 26°C/min. Teto em 3× a taxa configurada, folgado o
  bastante pra não afetar os casos reais (2,03-2,92×, os mesmos usados
  como fixture nos testes).
- **Q11**: o Importar JSON ignorava o registro de horários
  (`timerByMethod`) que o Exportar já inclui desde a v1.9.0 (achado
  N7) — quem trocasse de aparelho levava o arquivo, mas perdia o
  histórico de brassagem mesmo assim.
- **Q12**: a faixa "confortável, mas não ideal" de espessura da
  Pseudo-decocção (2,5-3,0 L/kg) só existia no texto do tooltip — e o
  padrão de fábrica (2,76 L/kg) cai exatamente nela. Tom âmbar
  adicionado ao número na tela.
- **Q13**: o alarme sonoro disparava no instante exato de apertar
  "Iniciar" — a 1ª etapa de todo programa tem duração zero, então a
  condição de disparo já batia na primeira checagem.
- **[modelo] Q5**: a fervura da 1ª parcela da Pseudo-decocção não
  descontava a água que evapora — a mistura final saía 0,5-2°C mais
  fria do que o alvo pedido. Novo parâmetro `evapRatePctPerHour` (%/h,
  padrão **0**, mesma filosofia do `mashCoolingRate`/T3). Como `W1` é
  **resolvido** pelo alvo (não digitado), a correção não é descontar
  `W1` depois de calculado — o fator de evaporação entra dentro da
  própria equação de balanço, que precisou ser re-derivada (fórmula em
  `TODO.md`; reduz exatamente à original quando a taxa é 0). Testado: T2
  continua batendo exatamente no alvo em qualquer taxa de evaporação;
  sem a correção, o cenário publicado da especificação erraria o alvo
  em 0,72°C, dentro da faixa estimada no achado original.

### Alterado
- `TODO.md`: **C2** (convenção de 90°C no balanço de energia da
  decocção clássica, aberto desde a 1ª leitura) marcado como
  resolvido — a 5ª leitura mostrou que a perda térmica em espera (T3,
  já implementada) reproduz essa convenção sozinha, como consequência
  física, sem precisar de um campo dedicado.

### Adicionado
- **Suíte de testes unitários** (`tests/`, `node:test`, zero
  dependências) — 65 testes em 4 arquivos: totais e puxadas golden dos
  8 métodos com parâmetros de fábrica (regressão), o balanço de
  energia da decocção reconstruído e conferido método a método
  (física), o parâmetro de perda térmica (T3, incluindo o Q2 acima
  como teste permanente) e os 11 casos de teste + duas fixtures
  completas da especificação da Pseudo-decocção, mais a evaporação
  (Q5) acima. `npm test` roda tudo; `.github/workflows/test.yml` roda
  a mesma suíte em todo push. Ver "Testes" no `README.md`.
- `methods.js` agora também exporta por `module.exports`, além de
  `window.Decoccao` — o navegador nem percebe a diferença
  (`typeof window` continua guardando o caminho antigo), mas testes e
  scripts em Node deixam de precisar recarregar o arquivo num sandbox
  de `vm` só pra ganhar acesso às funções.

## [1.10.0] — 2026-09-02

### Adicionado
- **Pseudo-decocção**, 8º método. Não é decocção — é o *cereal mash*/
  *double-mash system* documentado desde 1950 (Briggs et al. §4, Kunze
  p. 250, Narziß Band 2 §3.2.5.2, Brücklmeier p. 145-147; popularizado
  em homebrew por Kai Troester). Uma panela só: a 1ª parcela (fração do
  malte + fração da água) liquefaz e ferve sozinha; o calor dela leva a
  2ª parcela — água fria primeiro, malte seco depois — direto à 1ª
  rampa do step mash. Sem puxada, sem retorno, sem fração de decocção.
  - Motor de cálculo próprio (`computeRows`, não reaproveita `runSteps`
    — a física é balanço de mistura direta, não puxada/retorno). Usa
    uma constante térmica nova (0,4173 L-equivalentes de água por kg de
    malte, derivada da equação de infusão do Palmer/Braukaiser) que a
    decocção clássica não precisa, porque lá o calor específico do
    malte cancela na conta e aqui não cancela mais.
    Validado contra os 11 casos de teste e as duas tabelas completas de
    passo a passo da especificação (`scripts/verify_pseudo_decoccao.js`
    — todos os números batem, incluindo os dois diagramas publicados
    reproduzidos exatamente: 52,5°C e 62,0°C).
  - Taxa de aquecimento escalada enquanto só a 1ª parcela está na
    panela (massa térmica menor, mesma potência aquece proporcionalmente
    mais rápido) — sem isso o cronograma superestimava esse trecho em
    ~20min.
  - 4 validações: espessura da 1ª parcela abaixo do piso publicado
    (2,5 L/kg) alarma; alvo da mistura inalcançável mostra a faixa
    alcançável em vez de uma escada sem sentido físico; fração de malte
    acima de 80%/abaixo de 30% avisa sobre pouca enzima/pouco efeito de
    sabor; a temperatura logo após a água (antes do malte) ganha linha
    própria na escada, com aviso se passar de 78°C.
  - Zero regressão: os 7 métodos existentes, testados com os parâmetros
    padrão, produzem saída idêntica à v1.9.1.

## [1.9.1] — 2026-09-02

### Corrigido
- **Scroll horizontal no celular**: os tooltips "?" (`.hint::after`)
  ficam sempre no layout em `opacity:0` quando fechados (só isso
  permite a transição suave ao abrir), com até 260px de largura
  própria. Perto da borda direita de uma tela estreita, esse retângulo
  invisível escapava de containers sem `overflow:hidden` (ex.:
  `.summary-bar`) e alcançava o body — `overflow-x:hidden` só no body
  não bastava pra conter isso. `html` agora leva a mesma regra.
  Confirmado com um teste forçando os breakpoints mobile num wrapper de
  375px: o `scrollWidth` do documento (`document.documentElement`)
  caiu de 1920 (estourando) pra bater exatamente com o `clientWidth`.

## [1.9.0] — 2026-09-01

### Adicionado
- **T3**: parâmetro opcional "Perda térmica da mostura em espera"
  (`mashCoolingRate`, °C/min, grupo "Geral", padrão **0**). Enquanto a
  mostura principal fica parada esperando a decocção (puxada, fervendo,
  voltando), tinas sem aquecimento próprio perdem temperatura de
  verdade — o modelo assumia perda zero sempre. Padrão continua zero
  (tina com aquecimento que mantém a temperatura, o caso mais comum);
  quem liga o parâmetro vê o volume calculado crescer pra compensar a
  perda real, e o gráfico/escada passam a mostrar a queda de
  temperatura. Testado sem regressão: os 7 métodos com o parâmetro no
  padrão produzem saída idêntica à v1.8.0.

## [1.8.0] — 2026-09-01

Quarta leitura: os 10 achados da 3ª leitura fechados 10/10 (rodando a
ferramenta, não só lendo o diff), mais 8 achados novos — dois graves com
a mesma raiz, uma regressão, um de acessibilidade com número medido, e
quatro de acabamento.

### Corrigido
- **[grave] N1**: o alarme da última etapa tocava uma vez e nunca
  repetia — só ela. O `nowMin` que decide a repetição vinha limitado ao
  fim do próprio cronograma (`cap`); na última etapa, o instante em que
  o alarme deveria repetir é o mesmo em que `nowMin` para de crescer, e
  `nowMin - lastAtMin` vira zero pra sempre. Agora o alarme usa o tempo
  real, sem teto — só o desenho (gráfico/marcador) continua limitado ao
  fim do eixo.
- **[grave] N3**: uma brassagem rodando em outro método desaparecia ao
  reabrir o app — `init()` só carregava o cronômetro do último método
  visitado, os outros seis nunca eram olhados. Agora varre as sete
  chaves antes de decidir o que mostrar: havendo uma rodando fora da
  aba atual, abre direto nela.
- **[regressão] N4**: a virada do tooltip pra cima (P10, 1.7.0) passou a
  medir contra o painel que corta o overflow (`.schedule-panel`), que é
  quase sempre mais alto que a tela — o limite generoso demais fazia o
  tooltip virar bem depois da dobra da viewport. Agora usa o menor entre
  o fim do painel e o fim da tela.
- **[acessibilidade] N5**: as pílulas de puxada e de alarme usavam a cor
  pura (`--amber`/`--danger`) sobre um fundo que é a mesma cor a 22% —
  contraste pequeno por construção. Reprovava no claro (2,37:1) e no
  escuro (3,74:1), cada tema numa pílula diferente. Novos tokens
  `--amber-strong`/`--danger-strong` (mesmo padrão do `--steel-strong`
  já existente) resolvem os dois, ≥4,5:1 nas quatro combinações.
- **N2**: o marcador "Agora" do gráfico também congelava na borda
  direita depois do previsto — mesma causa do N1, resolvido junto.
- **N6**: o aviso de "toque pra ativar o alarme sonoro" era um toast que
  some em 2,2s — quem olhasse pro celular alguns segundos depois de um
  reload não via mais nada dizendo que o som estava desligado. Agora é
  uma pílula fixa no painel do cronômetro, visível enquanto o cronômetro
  roda sem áudio pronto, some sozinha no primeiro toque.
- **N8**: a descrição do Hochkurz ("a 2ª decocção vai direto à fervura,
  bem mais curta que a 1ª") ficou contraditória depois do P9 (1.7.0)
  igualar as duas fervuras em 8min. Reescrita pra "sem o repouso de
  sacarificação da 1ª, no total bem mais curta" — verdadeira do jeito
  que sempre foi, sem confundir quem olha a escada. Fonte no rodapé
  agora cita as duas obras do Narziß usadas na correção do P9.

### Adicionado
- **N7**: o horário real de cada etapa (`timer.actualStepEndMin`) é o
  único dado que a ferramenta guarda e nenhuma outra do mercado guarda
  — mas não tinha saída nenhuma. Agora (1) o Exportar JSON inclui o
  registro de quem já confirmou pelo menos uma etapa, por método; (2) ao
  concluir, um resumo mostra a taxa de aquecimento REAL medida contra a
  configurada (°C/min) — o dado que faltava pro T5, medido em vez de
  chutado.

## [1.7.0] — 2026-09-01

Terceira leitura: os 13 achados da 2ª leitura confirmados (rodando a
ferramenta de verdade, não só lendo código), mais 10 achados novos —
quase todos no cronômetro que a v1.5.0 reescreveu.

### Corrigido
- **[crítico] P2**: uma sessão restaurada (reload no meio da brassagem)
  mantinha relógio/etapa/atraso certos, mas perdia o wake lock e o alarme
  sonoro — os dois só eram pedidos no clique de "Iniciar"/"Cheguei", nunca
  no carregamento da página. Agora `init()` pede o wake lock de novo (não
  exige gesto) e mostra um aviso pra reativar o som no primeiro toque.
- **[grave] P1**: o "tempo total" grande no topo lia o plano original, não
  o deslocado pelo atraso — discordava da própria escada logo abaixo.
  Agora mostra o total real, com o previsto ao lado quando diferem.
- **[grave] P3**: o alarme tocava só uma vez por etapa (fácil de perder) e
  ficava mudo se você trocasse de método com uma brassagem rodando em
  outro. Agora repete a cada 2min (teto de 4 vezes), avisa ao trocar de
  método, e o estado do alarme é persistido (sobrevive a reload).
- **P4**: "Resetar" apagava o registro inteiro de uma brassagem sem
  confirmar — mas "excluir predefinição" (bem menos grave) já pedia.
  Agora só confirma quando há algo a perder, reaproveitando o `<dialog>`.
- **P5**: depois de concluído, o botão principal virava "Continuar" (só
  olhava `accumulatedMs`, não se o programa tinha terminado) — clicar
  recomeçava a contar num programa já concluído. Agora vira "Nova
  brassagem" e reaproveita a confirmação do reset.
- **P6**: etapas já confirmadas mostravam só a duração real, perdendo a
  comparação com o previsto — que é a razão de ser do registro novo.
  Agora mostra "24 min (previsto 20)" quando diferem.
- **P7**: passado o horário previsto, o texto travava em "faltam 0 min"
  indefinidamente. Agora mostra "+X,X min além do previsto nesta etapa".
- **P8**: (a) o alarme de puxada ≥60% só deixava o "?" vermelho — a
  pílula e a porcentagem continuavam na cor de sempre. (b) as faixas de
  enzima do gráfico usavam cor fixa da paleta escura, quase invisíveis no
  tema claro mesmo com a legenda já usando cores por tema. Ambos usam a
  mesma variável CSS agora.
- **P9 (modelo)**: a mesma fonte (Narziß) que já tinha corrigido a 2ª
  decocção do Hochkurz também especifica 5-10min pra 1ª — só não tinha
  sido aplicado. `decoction1TimeDefault` 20→8, Hochkurz cai de 2h37 pra
  2h25, dentro da faixa que a própria fonte publica.
- **P10**: a decisão de abrir o tooltip pra cima só rodava no clique, não
  no hover/foco — e comparava contra a viewport, não contra o painel que
  de fato corta. Agora roda em `pointerenter`/`focus` também, e mede
  contra o ancestral que realmente teria cortado o tooltip.

## [1.6.0] — 2026-08-31

Segunda leitura da calculadora: 13 achados (N1-N9 + 4 de UI) verificados
contra o código e corrigidos, mais o modo avançado.

### Adicionado
- **Modo avançado**: só "Insumos" (água, malte) fica sempre visível; o
  resto (Geral, Rampas, Decocções) vai pra trás de "Configurações
  avançadas", fechado por padrão, com o estado lembrado.
- Aviso de puxada grande agora tem 3 faixas, não 2: até 50% nada; 50-60%
  tranquiliza (é o teto real da literatura); acima de 60% ALARMA — nenhum
  programa publicado vai tão longe, com destaque visual em vermelho (N3).
- Nas puxadas devolvidas em mais de uma adição (Dupla Aprimorada), cada
  linha de adição agora mostra "devolver ≈X L" — antes só a puxada total
  aparecia, sem saber quanto voltar de cada vez (N9).
- Faixas de enzima do gráfico: legenda dinâmica, só lista o que o método
  atual realmente atravessa — antes listava as 4 faixas sempre, mesmo em
  métodos onde alguma não aparece desenhada (N8b).

### Corrigido
- **[crítico]** Clamp de min/max só protegia quem digitava no teclado —
  autosave, predefinições e importação de JSON carregavam valores fora de
  faixa sem validar, ressuscitando os bugs antigos de volume negativo e
  aquecimento de 0min. Nova `sanitizeParams`, aplicada nos 3 caminhos (N1).
- **[grave]** O repouso de sacarificação da 2ª decocção (corrigido na
  v1.4.0 pra Dupla Tradicional/Moderna) tinha sido aplicado também ao
  Hochkurz por engano — Narziß diz que a 2ª decocção do Hochkurz vai
  direto à fervura. Isso tinha deixado o Hochkurz mais lento que a Dupla
  Tradicional e a Tripla, o oposto do que o nome do método promete (N2).
- Escada e gráfico discordavam da temperatura da panela durante o repouso
  entre duas adições parciais (Dupla Aprimorada): gráfico dizia 100°,
  escada dizia 52°. Unificados numa função só (N4).
- Descrições de método voltaram a ter frações fixas ("50-60%", "cerca de
  1/3") que contradizem o % calculado real na tela ao lado — e a
  descrição do Hochkurz ficou literalmente falsa depois do N2. Frações
  removidas, descrição do Hochkurz reescrita (N5/N6).
- Tooltip de "tempo real por patamar" contava a etapa de transferência
  (onde a mostura ainda está mudando de temperatura) como se ela já
  estivesse no patamar, inflando o número; e citava "sacarificação" mesmo
  quando aquele patamar não tem nenhuma (ex.: 2ª decocção do Hochkurz,
  depois do N2). Ambos corrigidos (N7).
- Cor das faixas de enzima no gráfico reprovava contraste AA no tema
  claro (2,3-3,1:1 contra o mínimo de 4,5:1) — escolhidas pensando só no
  tema escuro. Novas cores por variável CSS, uma para cada tema (N8a).
- Excluir predefinição usava `confirm()` nativo do navegador (tipografia
  diferente, travava a página); agora usa `<dialog>` estilizado, igual ao
  de salvar.
- Botão de tema mostrava só uma letra (A/C/E); agora tem ícones de
  sol/lua/meia-lua.
- Tooltips de campo/etapa sempre abriam pra baixo e podiam estourar o
  painel perto do fim de listas longas; agora abrem pra cima quando falta
  espaço.
- JSON exportado gravava só `version: 1` (formato do arquivo); agora
  também grava `appVersion` com a versão do app no momento da exportação.

## [1.5.0] — 2026-08-31

Redesenho do cronômetro (Fase 5 do Raio-X): de "cronômetro comparado a um
plano fixo" pra rastreador do que realmente está acontecendo na
brassagem.

### Adicionado
- Avanço por evento: o botão "Cheguei" substitui "Próxima etapa" e
  confirma o horário REAL em que cada etapa terminou, em vez de empurrar
  o relógio pro horário previsto (que ignorava atrasos silenciosamente).
  A etapa ativa agora é só a contagem de confirmações — não depende mais
  de comparar o relógio com o plano.
- O cronograma exibido (escada e gráfico) se desloca pelo atraso ou
  adiantamento acumulado: se uma etapa demora mais que o previsto, todo o
  resto do plano mostrado passa a refletir isso, em vez de manter os
  horários originais como se nada tivesse acontecido.
- Indicador de atraso/adiantamento acumulado ("+8min vs. previsto") ao
  lado da etapa atual.
- Alarme (som + vibração) quando o tempo previsto da etapa atual é
  atingido — sem precisar ficar olhando pro relógio.
- Tela não apaga sozinha enquanto o cronômetro roda (Wake Lock API).
- O relógio para sozinho ao confirmar a última etapa, em vez de continuar
  contando pra sempre.

### Corrigido
- Editar qualquer parâmetro durante a contagem podia pular etapa (a etapa
  ativa dependia de comparar o relógio com o plano, que mudava junto).
  Agora a etapa ativa só muda quando o usuário confirma via "Cheguei".
- Etapas de 0 minutos (Mash In, algumas rampas zeradas) eram inalcançáveis
  pelo avanço automático por tempo. Agora, com avanço manual, são
  confirmadas normalmente como qualquer outra.
- Com o relógio em 00:00 antes de "Iniciar", a escada já destacava a 2ª
  etapa como se o programa tivesse começado. Agora nada é destacado até o
  primeiro "Iniciar".
- O `setInterval` de 500ms recriava a escada e o gráfico inteiros a cada
  tick. Agora só atualiza o relógio, o texto da etapa e a posição do
  marcador no gráfico — a escada e o SVG completo só são refeitos quando
  algo realmente muda (parâmetro, confirmação de etapa, troca de método).

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

[1.11.1]: https://github.com/henriqueboaventura/decoccao/compare/d9c32a4...main
[1.11.0]: https://github.com/henriqueboaventura/decoccao/compare/a364f74...d9c32a4
[1.10.0]: https://github.com/henriqueboaventura/decoccao/compare/f95cf31...a364f74
[1.9.1]: https://github.com/henriqueboaventura/decoccao/compare/75dccf1...f95cf31
[1.9.0]: https://github.com/henriqueboaventura/decoccao/compare/f7ffffd...75dccf1
[1.8.0]: https://github.com/henriqueboaventura/decoccao/compare/c0ceb1a...f7ffffd
[1.7.0]: https://github.com/henriqueboaventura/decoccao/compare/d32d43a...c0ceb1a
[1.6.0]: https://github.com/henriqueboaventura/decoccao/compare/93138c9...d32d43a
[1.5.0]: https://github.com/henriqueboaventura/decoccao/compare/06eb573...93138c9
[1.4.0]: https://github.com/henriqueboaventura/decoccao/compare/5fd27df...06eb573
[1.3.0]: https://github.com/henriqueboaventura/decoccao/compare/3bf6b39...5fd27df
[1.2.0]: https://github.com/henriqueboaventura/decoccao/compare/204aac3...3bf6b39
[1.1.0]: https://github.com/henriqueboaventura/decoccao/compare/a162452...5e60f93
[1.0.0]: https://github.com/henriqueboaventura/decoccao/compare/f9b0ed9...a162452
[0.1.1]: https://github.com/henriqueboaventura/decoccao/compare/12643a4...f9b0ed9
[0.1.0]: https://github.com/henriqueboaventura/decoccao/commits/12643a4
