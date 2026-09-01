# Ajustes futuros

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
