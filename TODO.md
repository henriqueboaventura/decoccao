# Ajustes futuros

## Convenção de 90°C no balanço de energia da decocção (C2)

**Status:** resolvido — explicado pelo parâmetro de perda térmica em
espera (T3, ver seção abaixo), não precisa de um campo próprio.

O achado original (1ª leitura): a ferramenta calcula a fração de
decocção com a fervura a 100°C, e sai 21-27% abaixo do que Narziß e
Kunze publicam — porque as fontes alemãs convencionam 90°C no
denominador do balanço, não os 100°C reais. Era uma discrepância sem
explicação: uma constante (90°C) sem mecanismo físico por trás.

A 5ª leitura (achado bônus, fora da lista numerada) mostrou que **a
perda térmica em espera (T3), já implementada, reproduz essa
convenção sozinha, como consequência física, sem precisar de um
segundo campo dedicado**: com `mashCoolingRate` em ~0,1°C/min, o
volume calculado pelo app já cai dentro de 20 mililitros do valor que
a convenção de 90°C dá pro Simples (medido nas duas pontas — motor em
Node e a tela, alternando o campo entre 0 e 0,1). A convenção de 90°C
das fontes alemãs é, ela mesma, a perda térmica da tina em espera com
outro nome — um número agregado de uma época em que ninguém ia
parametrizar isso separadamente. Fica resolvido pedindo o pedido do
segundo campo de temperatura (retirado nessa mesma leitura): a
ferramenta agora tem a grandeza física separada, e ela generaliza
melhor que uma constante fixa (varia por método, por puxada
específica, por quanto tempo aquela puxada fica esperando — a
convenção de 90°C aplica a mesma penalidade fixa a todas).

## Margem de perda térmica no cálculo de volume de decocção

**Status:** implementado (branch `feature/t3-perda-termica-espera`) — ver
`mashCoolingRate` em `methods.js`/`app.js`. Parâmetro opcional, **padrão
0** (sem perda): assume tina com aquecimento que mantém a temperatura,
que é o caso mais comum — só quem tem tina sem aquecimento e vê a
mostura esfriar de verdade em espera precisa ligar isso. O texto abaixo
documenta o raciocínio original; a implementação segue a proposta da
última seção quase à risca.

### O que existe hoje

Em `methods.js` (`runSteps`), o volume a puxar em cada decocção é calculado
pela fórmula clássica de balanço de energia (1ª Lei da Termodinâmica,
mistura adiabática):

```
d = (T2 - T1) / (Tfervura - T1)
Vpuxar = d × Vtotal
```

onde `T1` é a temperatura da mostura antes da puxada, `T2` a temperatura
alvo após o retorno, `Tfervura` o parâmetro `fervuraTemp` (100°C por
padrão) e `Vtotal` o volume total estimado (água + malte × 0,67 L/kg).

### Validação feita

Essa fórmula foi conferida contra a literatura de brassagem:

- **Braukaiser / Kai Troester** usa exatamente essa fórmula
  (`Vd = Vm × (T2-T1)/(Tb-T1)`), incluindo a mesma simplificação de tratar
  a porção puxada como representativa do todo (o calor específico do malte
  se cancela na conta, não precisa ser modelado separadamente).
- **Kunze** (*Technology Brewing and Malting*) tem uma versão equivalente,
  mas usa **90°C no denominador em vez dos 100°C reais da fervura**.
- Relatos de brassagem (ex.: Boston Wort Processors) confirmam
  empiricamente que calculadoras puramente teóricas **pedem pra puxar
  menos do que o necessário na prática**, e que a correção usual é uma
  **perda térmica de ~10°C** (equivalente a inflar o volume calculado em
  ~15-30%).

Isso é consistente com a **2ª Lei da Termodinâmica**: a fórmula atual
assume um processo adiabático (sem perdas), mas todo processo real
dissipa energia — a porção decoctada nunca retorna e se mistura a 100%
da temperatura de fervura de fato, porque perde calor na transferência,
na mistura e na evaporação.

### Conclusão

A base matemática está correta (bate com Braukaiser/Kai Troester). O
único gap real é a ausência dessa margem de perda térmica — hoje o app
calcula o volume **mínimo teórico**, que tende a ficar um pouco abaixo
do necessário na prática.

### Proposta de ajuste (quando for decidido implementar)

Adicionar um parâmetro **"Perda térmica na decocção"** (°C, default ~10,
ajustável), que reduz a temperatura efetiva de retorno usada na fórmula:

```
Tefetiva = Tfervura - perdaTermica
d = (T2 - T1) / (Tefetiva - T1)
```

Isso aumenta o volume calculado pra compensar a perda real de calor,
igual à prática de Kunze (que usa 90°C fixo em vez de 100°C). Pode ser
um campo por método (grupo "Insumos", junto de volume de água/malte) ou
uma constante global fixa — a decidir.

### Fontes consultadas

- [Decoction volume for different water to grist ratio's — HomeBrewTalk](https://homebrewtalk.com/threads/decoction-volume-for-different-water-to-grist-ratios.728390/)
- [Decoction Mashing — Boston Wort Processors](https://wort.org/decoction-mashing/)
- [Top-Down Brew: Decoction Percent](https://topdownbrew.com/DecoctionPercent.html)
- Wolfgang Kunze, *Technology Brewing and Malting*, 5ª ed., VLB Berlin — fórmula de decocção com denominador em 90°C
- Ludwig Narziss, *Abriss der Bierbrauerei*, 7ª ed. — referência de técnicas de decocção (citada na literatura, não localizada em texto aberto durante essa pesquisa)

## Evaporação na fervura da 1ª parcela (pseudo-decocção)

**Status:** implementado — ver `evapRatePctPerHour` em `methods.js`
(`buildPseudoDecoccao`/`computeRows`) e os testes em
`tests/pseudo-decoccao.test.js`. Parâmetro opcional, **padrão 0%/h**
(evaporação desprezada): mesma filosofia do `mashCoolingRate` (T3) —
só quem liga o campo vê qualquer diferença.

A 1ª parcela ferve por `decoctionTime` minutos antes de a água e o
malte restantes entrarem, e perde água de verdade nesse tempo. A
correção não é só descontar `W1` depois de calculado — como `W1` é
**resolvido** pelo alvo da mistura (T2target), não digitado, o fator de
evaporação (`f = 1 - evapRate·decoctionTime/60`) entra DENTRO da
própria equação de balanço, que precisou ser re-derivada:

```
T2 = [(W1·f + cg·G1)·Tb + (W-W1)·Tamb + cg·G2·Tamb] / [(W1·f+cg·G1) + (W-W1) + cg·G2]
```

isolando W1 (com denom = f·(T2-Tb) - (T2-Tamb)):

```
W1 = [cg·G1·Tb + W·Tamb + cg·G2·Tamb - Ctotal·T2] / denom
```

Reduz exatamente à fórmula original quando `f = 1` (sem evaporação) —
conferido algebricamente e pelos testes de regressão (evapRate=0
continua batendo com as fixtures da especificação, byte a byte).

`CparcelaFull` (massa térmica ANTES da fervura evaporar — usada na
taxa de aquecimento escalada, T5) e `Cparcela` (DEPOIS — usada em
T1/T2) viraram duas variáveis separadas: a evaporação só acontece
durante a fervura em si, não durante o aquecimento até ela.

Conferido: sem a correção, o cenário publicado da especificação
(ambiente 27°C, alvo 52°C) com 10%/h de evaporação chegaria a
51,28°C — 0,72°C abaixo do alvo, dentro da faixa de 0,5-2°C estimada
aqui. Com a correção, sai exatamente 52,00°C em qualquer taxa de
evaporação, porque `W1` cresce pra compensar a água que vai evaporar.

## Teto do `scaledRate` na pseudo-decocção usa uma razão, não o valor do campo (S11)

**Status:** decisão tomada — mantido como está, documentado aqui em
vez de mexido no código.

Achado da sétima leitura: `scaledRate` (a taxa de aquecimento escalada
pra 1ª parcela, menor massa térmica que a mostura inteira) tem teto em
`heatingRate * 3` (`methods.js`, `buildPseudoDecoccao`), não num valor
absoluto — com os parâmetros de fábrica ela já sai em 5,56°C/min,
acima do máximo de 5°C/min que o próprio campo "Taxa de aquecimento"
declara (`HEATING_RATE.max`).

Cogitei capar em `Math.min(heatingRate * 3, HEATING_RATE.max)`, mas o
comentário já existente em `methods.js` (linhas acima do cálculo)
documenta que o teto de 3× foi calibrado deliberadamente contra os
casos reais publicados (padrão de fábrica e os dois diagramas do Beer
School, 2,03-2,92×) e que "um teto mais apertado quebraria essas
contas" — são as mesmas fixtures que `scripts/verify_pseudo_decoccao.js`
confere. Um teto absoluto de 5°C/min teria capado exatamente o caso de
fábrica, quebrando essa referência.

A raiz do "achado" é uma comparação entre duas grandezas diferentes:
`heatingRate` é a taxa configurada pra mostura INTEIRA; `scaledRate` é
uma taxa DERIVADA, específica da massa térmica menor da 1ª parcela —
fisicamente é esperado que ela seja mais rápida que o campo. O campo
"Taxa de aquecimento" nunca teve a intenção de ser um teto físico
universal pra qualquer sub-massa da mostura, só um input pro cálculo
do tempo de rampa da mostura completa. Ainda assim, o número mostrado
pode confundir quem olha (parece que a ferramenta "furou" o próprio
limite que ela mesma declara) — se algum dia isso virar um problema de
verdade, a correção certa é de rótulo/tooltip (deixar claro que é uma
taxa por parcela, escalada), não abaixar o teto de 3× e quebrar as
fixtures.
