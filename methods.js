// Motor de cálculo dos programas de decocção.
// Reconstrói, célula por célula, a lógica da planilha "Cálculos de decocção",
// trocando referências de célula por parâmetros nomeados e editáveis.

const G = {
  WATER_VOLUME: { key: "waterVolume", label: "Volume de água (mostura)", unit: "L", group: "Insumos", min: 1, max: 200, step: 0.5 },
  GRAIN_WEIGHT: { key: "grainWeight", label: "Massa de malte moído", unit: "kg", group: "Insumos", min: 0.1, max: 100, step: 0.1 },
  MASH_IN_TEMP: { key: "mashInTemp", label: "Temp. Mash In", unit: "°C", group: "Geral", min: 20, max: 80, step: 1 },
  HEATING_RATE: { key: "heatingRate", label: "Taxa de aquecimento", unit: "°C/min", group: "Geral", min: 0.5, max: 5, step: 0.1 },
  // Padrão 0 = a mostura principal não perde temperatura enquanto a
  // decocção é processada à parte (tina com aquecimento que mantém a
  // temperatura, ou processo rápido o bastante pra perda ser desprezível).
  // Quem brassa em tina sem aquecimento pode ligar isso pra puxar um
  // volume de decocção maior, que compense a perda real (T3).
  MASH_COOLING_RATE: { key: "mashCoolingRate", label: "Perda térmica enquanto a decocção está fora", unit: "°C/min", group: "Geral", min: 0, max: 1, step: 0.05, default: 0 },
  TRANSFER_TIME: { key: "transferTime", label: "Tempo de transferência", unit: "min", group: "Geral", min: 0, max: 30, step: 1 },
  SACC_TEMP: { key: "decoccao1SaccTemp", label: "Temp. de sacarificação da decocção", unit: "°C", group: "Decocções", min: 40, max: 90, step: 1 },
  SACC_TIME: { key: "saccTime", label: "Tempo de sacarificação da decocção", unit: "min", group: "Decocções", min: 0, max: 60, step: 1 },
  FERVURA_TEMP: { key: "fervuraTemp", label: "Temp. de fervura da porção decoctada", unit: "°C", group: "Decocções", min: 90, max: 105, step: 1 },
  MASHOUT_TEMP: { key: "mashOutTemp", label: "Temp. Mash Out", unit: "°C", group: "Geral", min: 70, max: 85, step: 1 },
  MASHOUT_TIME: { key: "mashOutTime", label: "Tempo de Mash Out", unit: "min", group: "Geral", min: 0, max: 60, step: 1 },
};

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Volume que 1kg de malte molhado ocupa dentro da mostura, além da água
// (aprox. usual em calculadoras de brassagem). Usado só para estimar o
// volume TOTAL da mostura — a decocção retira uma fatia desse volume total
// (água + grão), não apenas água.
const GRAIN_VOLUME_L_PER_KG = 0.67;

function totalMashVolumeL(params) {
  return num(params.waterVolume) + num(params.grainWeight) * GRAIN_VOLUME_L_PER_KG;
}

// Executa uma lista de passos contra os parâmetros, retornando as linhas
// da tabela (igual às colunas B..G da planilha) já com tempo acumulado.
//
// Também calcula, para cada passo marcado como `pullsDecoction`, o volume a
// puxar da mostura: uma fatia representativa (mesma proporção água/grão do
// todo) é fervida e devolvida, então a fração do volume total a puxar segue
// o balanço de energia clássico da decocção — d = (T2-T1)/(Tfervura-T1) —
// onde T1 é a temp. da mostura no momento exato da puxada (fixo) e T2 a
// temp. alvo após o retorno (marcado como `returnsDecoction`).
//
// Quando uma única puxada volta em mais de uma adição (ex.: Dupla
// Aprimorada), a fração TOTAL não é a soma das frações de cada adição
// calculadas isoladamente — isso superestima o volume, porque na hora da
// 1ª adição a mostura na tina não é mais o volume inteiro (falta
// justamente a parte que ainda está na panela). Por conservação de
// energia, a fração final do sistema completo (depois que TODA a puxada
// já voltou) depende só da temperatura ORIGINAL da puxada e da temperatura
// final após a ÚLTIMA adição — o resultado é o mesmo de uma puxada
// devolvida numa tacada só. Por isso recalculamos a cada retorno usando
// sempre o T1 original da puxada, e SUBSTITUÍMOS (não somamos) a fração —
// o último retorno de cada puxada deixa o valor final correto.
//
// `restsForConversion` (declarado no passo `pullsDecoction`) indica se essa
// puxada especificamente ainda vai passar por um descanso de sacarificação
// (SaccTemp/saccTime) antes de ferver, ou se vai direto pra fervura. Segue a
// distinção grossa/rala do Braukaiser Wiki (Decoction Mashing): puxadas que
// ainda precisam converter amido devem ficar só um pouco mais grossas que a
// mostura principal (grão sempre submerso no líquido); a puxada final de um
// programa, que já não precisa converter mais nada, pode ser mais rala.
// O tempo digitado num campo "Rampa de X" é só o repouso ADICIONAL daquela
// etapa — não o tempo total que a mostura principal passa naquela
// temperatura. Entre a puxada e o retorno, a mostura fica parada (steps com
// `mash: sameMash`) enquanto a decocção é transferida, aquecida, sacarifica
// e ferve, e todo esse tempo se soma ao patamar. Em alguns programas essa
// diferença chega a 4x o valor digitado. `annotateRealPlateauTimes` marca,
// na primeira linha de cada patamar de temperatura, o tempo real total
// (`realPlateauMin`) — só quando o patamar tem mais de uma etapa, senão o
// real já é igual ao digitado e não há nada a esclarecer.
function annotateRealPlateauTimes(rows) {
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    // Agrupa por `samePlateau` (marcado na geração da linha: "esta etapa
    // só continua o patamar anterior, não declara um novo"), não por
    // igualdade exata de `mash` — com a perda térmica em espera (T3)
    // ligada, cada etapa de um mesmo patamar sai com uma temperatura
    // ligeiramente diferente da anterior (a mostura esfria minuto a
    // minuto), e a igualdade exata nunca mais bate: nenhum grupo se
    // formava, e o tooltip de "tempo real do patamar" sumia inteiro nos
    // sete métodos de decocção assim que o parâmetro era ligado (Q2).
    while (j < rows.length && rows[j].samePlateau) j++;
    if (j - i > 1) {
      // A própria linha i é sempre a chegada naquele patamar — é ela que
      // faz `mash` virar `temp` (senão o grupo não teria começado ali).
      // Durante a duração dela a mostura ainda está mudando (aquecendo,
      // sendo transferida), não parada em `temp` ainda — por isso i não
      // entra na soma, só i+1..j-1 já estão de fato lá.
      let sum = 0;
      for (let k = i + 1; k < j; k++) sum += rows[k].duration;

      // Prefere marcar na própria linha "Rampa de X" (o campo que o usuário
      // edita e onde a confusão acontece); sem isso, cai na 1ª linha com
      // duração > 0 do patamar (ex.: Mash In sempre tem duração 0).
      let target = i;
      for (let k = i; k < j; k++) {
        if (rows[k].label.startsWith("Rampa ")) { target = k; break; }
        if (target === i && rows[k].duration > 0) target = k;
      }
      // Só marca quando sobra tempo de verdade além do que a duração da
      // própria linha já mostra — senão a única "diferença" era a etapa de
      // transição (já excluída acima), e o aviso ficaria redundante (ex.:
      // Mash Out, onde não há decocção nenhuma rodando depois).
      if (Math.abs(sum - rows[target].duration) > 0.05) {
        rows[target].realPlateauMin = sum;
        // Pro texto do tooltip não citar uma sacarificação que não existe
        // nesse patamar específico (ex.: 2ª decocção do Hochkurz, que vai
        // direto à fervura — ver N2/restsForConversion).
        const pullRow = rows.slice(i, j).find((r) => r.pullsDecoction);
        rows[target].plateauHasSaccRest = pullRow ? !!pullRow.restsForConversion : false;
      }
    }
    i = j;
  }
  return rows;
}

function runSteps(steps, params) {
  // Pré-varredura estrutural (não depende dos parâmetros): descobre, pra
  // cada puxada, qual é o ÚLTIMO retorno associado a ela — é o momento em
  // que a panela realmente esvazia. Usado só pelo gráfico (ver U5/`app.js`
  // renderChart) pra parar de desenhar a linha da fervura quando não há
  // mais decocção na panela, em vez de deixá-la "descer" pra temperatura
  // da mostura assim que a 1ª de várias adições parciais retorna.
  const isFinalReturn = new Array(steps.length).fill(false);
  let lastReturnIdx = -1;
  steps.forEach((step, idx) => {
    if (step.pullsDecoction) lastReturnIdx = -1;
    if (step.returnsDecoction) {
      if (lastReturnIdx !== -1) isFinalReturn[lastReturnIdx] = false;
      isFinalReturn[idx] = true;
      lastReturnIdx = idx;
    }
  });

  // T3: por padrão a mostura principal não esfria em espera (tina com
  // aquecimento, ou perda desprezível) — `mashCoolingRate` 0 é o default
  // do parâmetro, então tudo abaixo vira no-op e o resultado é idêntico
  // ao motor antes desta mudança. Quando > 0, a tina esfria durante as
  // etapas "paradas" (mash: sameMash) enquanto a decocção é processada à
  // parte — desde a própria puxada (transferência) até o retorno. Um
  // acumulador SEPARADO do valor de `mash` exibido (`idleCoolingLoss`)
  // guarda quanto já esfriou desde a puxada, sem se confundir com trocas
  // de patamar entre adições parciais (isso reintroduziria o bug do C1:
  // usar a temperatura JÁ MISTURADA de uma adição anterior como T1 da
  // próxima superestimaria o volume). Só reseta numa puxada NOVA.
  const coolingRate = num(params.mashCoolingRate, 0);

  const rows = [];
  let prev = { mash: null, boil: null };
  let totalMin = 0;
  let pullIndex = null;
  let pullOriginalMash = null;
  let idleActive = false;
  let idleCoolingLoss = 0;
  steps.forEach((step, idx) => {
    const duration = Math.max(0, num(step.duration(params, prev)));
    let mash = step.mash(params, prev);
    const boil = step.boil ? step.boil(params, prev) : null;

    if (step.pullsDecoction) {
      idleActive = true;
      idleCoolingLoss = 0;
    }
    if (idleActive && coolingRate > 0 && step.mash === sameMash) {
      const loss = coolingRate * duration;
      idleCoolingLoss += loss;
      mash -= loss;
    }

    totalMin += duration;
    const row = {
      label: step.label,
      duration,
      totalMin,
      totalHours: totalMin / 60,
      mash,
      boil,
      // Identidade do patamar pra annotateRealPlateauTimes (ver ali) —
      // marcada aqui, na geração, porque só aqui se sabe se o PASSO
      // (não o valor final de mash, que a perda térmica pode ter mudado)
      // é uma continuação (sameMash) ou a chegada num patamar novo.
      samePlateau: step.mash === sameMash,
    };
    rows.push(row);

    if (step.pullsDecoction) {
      pullIndex = rows.length - 1;
      pullOriginalMash = prev.mash;
      row.pullsDecoction = true;
      row.restsForConversion = !!step.restsForConversion;
      row.pullOriginalMash = pullOriginalMash;
    }
    if (step.returnsDecoction && pullIndex !== null) {
      // T1 é sempre a temp. da mostura no momento EXATO da puxada, menos
      // a perda térmica acumulada desde então (T3) — nunca a temperatura
      // intermediária de uma adição anterior, ver comentário acima (C1).
      const t1 = pullOriginalMash - idleCoolingLoss;
      const tb = num(params.fervuraTemp);
      const denom = tb - t1;
      const fraction = denom > 0 ? Math.max(0, Math.min(1, (mash - t1) / denom)) : 0;
      const pullRow = rows[pullIndex];
      pullRow.decoctionFraction = fraction;
      pullRow.decoctionVolumeL = fraction * totalMashVolumeL(params);
      pullRow.returnParts = (pullRow.returnParts || 0) + 1;
      row.returnsDecoction = true;
      row.isFinalReturn = isFinalReturn[idx];
      row.pullIndex = pullIndex;
      row.idleCoolingLossAtReturn = idleCoolingLoss;
      if (isFinalReturn[idx]) idleActive = false;
    }

    prev = { mash, boil: boil !== null ? boil : prev.boil };
  });

  // Quanto volta em CADA adição, quando uma puxada é devolvida em mais de
  // uma parte (ex.: Dupla Aprimorada) — sem isso o brassador sabe quanto
  // tirou no total mas não quanto devolver de cada vez (achado N9). Só dá
  // pra calcular depois que a puxada inteira foi processada: o volume da
  // 1ª adição depende da fração dela em relação ao que ainda está na tina
  // NAQUELE momento (não o total original — mesma lógica do C1), e o que
  // sobra pra tina nesse instante só se sabe conferindo o volume final.
  rows.forEach((pullRow, pIdx) => {
    if (!pullRow.pullsDecoction || !(pullRow.returnParts > 1)) return;
    const tb = num(params.fervuraTemp);
    let tinaVolumeL = totalMashVolumeL(params) - pullRow.decoctionVolumeL;
    const returns = rows.filter((r) => r.pullIndex === pIdx);
    // Mesma perda térmica acumulada (T3) que corrigiu o T1 da fração
    // total, aplicada segmento a segmento: cada adição parcial começa do
    // valor JÁ MISTURADO da adição anterior (ou do T1 original, na 1ª),
    // menos só a perda ADICIONAL acumulada nesse intervalo específico —
    // não a perda total, que já está embutida no valor anterior.
    let tinaTemp = pullRow.pullOriginalMash - (returns[0].idleCoolingLossAtReturn || 0);
    let prevCoolingLoss = returns[0].idleCoolingLossAtReturn || 0;
    let remainingL = pullRow.decoctionVolumeL;
    returns.forEach((r, i) => {
      if (i === returns.length - 1) {
        r.returnVolumeL = remainingL; // última adição: o que sobrou da puxada
        return;
      }
      const denom = tb - r.mash;
      const fraction = denom > 0 ? Math.max(0, Math.min(1, (r.mash - tinaTemp) / denom)) : 0;
      const addVolumeL = fraction * tinaVolumeL;
      r.returnVolumeL = addVolumeL;
      remainingL -= addVolumeL;
      tinaVolumeL += addVolumeL;
      const nextCoolingLoss = returns[i + 1].idleCoolingLossAtReturn || 0;
      tinaTemp = r.mash - (nextCoolingLoss - prevCoolingLoss);
      prevCoolingLoss = nextCoolingLoss;
    });
  });

  return rows;
}

const sameMash = (p, prev) => prev.mash;
const sameBoil = (p, prev) => (prev.boil !== null && prev.boil !== undefined ? prev.boil : prev.mash);

// Decocção única: rampa inicial -> 1 decocção leva a mostura à rampa de
// sacarificação/dextrinização -> aquecimento direto (sem nova decocção) até
// o mash-out. Generaliza o "Single Decoction" do Braukaiser Wiki (rampa de
// proteína 53-55°C -> sacarificação 65-68°C) para permitir variantes com
// outra rampa/temperatura inicial, como o Hochkurz-com-decocção-simples.
function buildSimples({
  rampaLabel = "Rampa de proteína", rampaKey = "rampaProteinaTime", rampaTimeDefault = 20,
  mashInDefault = 53, mashTemp2Default = 66, mashOutTempDefault = 75,
  saccTempDefault = 68,
  decoction1TimeDefault = 15,
  rampaSaccLabel = "Rampa de sacarificação",
  rampaSaccTimeDefault = 45,
  heatingRateDefault = 2,
} = {}) {
  const paramSchema = [
    { ...G.WATER_VOLUME, default: 20 },
    { ...G.GRAIN_WEIGHT, default: 5 },
    { ...G.MASH_IN_TEMP, default: mashInDefault },
    { key: rampaKey, label: rampaLabel, unit: "min", group: "Rampas", default: rampaTimeDefault, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.SACC_TEMP, default: saccTempDefault },
    { ...G.SACC_TIME, default: 10 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da decocção", unit: "min", group: "Decocções", default: decoction1TimeDefault, min: 0, max: 60, step: 1 },
    { key: "mashTemp2", label: "Temp. da mostura após retorno da decocção", unit: "°C", group: "Decocções", default: mashTemp2Default, min: 40, max: 90, step: 1 },
    { key: "rampaSaccTime", label: rampaSaccLabel, unit: "min", group: "Rampas", default: rampaSaccTimeDefault, min: 0, max: 90, step: 1 },
    { ...G.MASHOUT_TEMP, default: mashOutTempDefault },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: heatingRateDefault },
    { ...G.MASH_COOLING_RATE },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.mashInTemp },
    { label: rampaLabel, duration: (p) => p[rampaKey], mash: sameMash },
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash, pullsDecoction: true, restsForConversion: true },
    { label: "Aquecimento até a sacarificação", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação da decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento até a fervura", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Decocção (fervura)", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp2, boil: (p) => p.mashTemp2, returnsDecoction: true },
    { label: rampaSaccLabel, duration: (p) => p.rampaSaccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento Mash Out", duration: (p, prev) => (p.mashOutTemp - prev.mash) / p.heatingRate, mash: (p) => p.mashOutTemp },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}

// Dupla decocção: as duas puxadas descansam pra sacarificação (a
// mesma Temp./Tempo de sacarificação da decocção, reaproveitados) antes de
// ferver. A 2ª decocção precisa desse repouso tanto quanto a 1ª — sem ele,
// a alfa-amilase não converte o amido daquela porção antes da fervura
// matar as enzimas, e metade do mecanismo da decocção se perde (Brücklmeier,
// Handbuch der Bierbrauerei, p. 132).
function buildDupla({
  rampaLabel, rampaKey, rampaTimeDefault = 10,
  mashInDefault, mashTemp2Default, mashOutTempDefault,
  saccTempDefault = 70,
  decoction1TimeDefault = 30,
  rampaSaccLabel = "Rampa de sacarificação",
  rampaSaccTimeDefault = 0,
  decoction2TimeDefault = 15,
  // Dupla Tradicional e Dupla Moderna: a 2ª decocção sacarifica de novo
  // antes de ferver, igual à 1ª (Narziß, Abriss, p. 152; Brücklmeier,
  // p. 137). O Hochkurz reaproveita este motor mas é uma fonte diferente
  // (Narziß, Die Bierbrauerei Band 2, §3.2.4.5, p. 350): a 2ª decocção do
  // Hochkurz é 1/5-1/4 do lote, direto à fervura, sem repouso — a porção
  // já está sacarificada de sobra (dextrinização já rodou na tina), então
  // ferver não custa conversão nenhuma. Aplicar o mesmo repouso aos dois
  // programas deixava o Hochkurz mais lento que a Dupla Tradicional e a
  // Tripla, o oposto do que a literatura e o nome do método descrevem.
  secondDecoctionRests = true,
}) {
  const paramSchema = [
    { ...G.WATER_VOLUME, default: 20 },
    { ...G.GRAIN_WEIGHT, default: 5 },
    { ...G.MASH_IN_TEMP, default: mashInDefault },
    { key: rampaKey, label: rampaLabel, unit: "min", group: "Rampas", default: rampaTimeDefault, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.SACC_TEMP, default: saccTempDefault },
    { ...G.SACC_TIME, default: 10 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da 1ª decocção", unit: "min", group: "Decocções", default: decoction1TimeDefault, min: 0, max: 90, step: 1 },
    { key: "mashTemp2", label: "Temp. da mostura após 1ª decocção", unit: "°C", group: "Decocções", default: mashTemp2Default, min: 40, max: 90, step: 1 },
    { key: "rampaSaccTime", label: rampaSaccLabel, unit: "min", group: "Rampas", default: rampaSaccTimeDefault, min: 0, max: 90, step: 1 },
    { key: "decoction2Time", label: "Tempo da 2ª decocção", unit: "min", group: "Decocções", default: decoction2TimeDefault, min: 0, max: 90, step: 1 },
    { ...G.MASHOUT_TEMP, default: mashOutTempDefault },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 2 },
    { ...G.MASH_COOLING_RATE },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.mashInTemp },
    { label: rampaLabel, duration: (p) => p[rampaKey], mash: sameMash },
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash, pullsDecoction: true, restsForConversion: true },
    { label: "Aquecimento da 1ª decocção (até a sacarificação)", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação da decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento da 1ª decocção (até a fervura)", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Primeira decocção", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp2, boil: (p) => p.mashTemp2, returnsDecoction: true },
    { label: rampaSaccLabel, duration: (p) => p.rampaSaccTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil, pullsDecoction: true, restsForConversion: secondDecoctionRests },
    ...(secondDecoctionRests ? [
      { label: "Aquecimento da 2ª decocção (até a sacarificação)", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
      { label: "Sacarificação da decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    ] : []),
    { label: "Aquecimento da 2ª decocção (até a fervura)", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Segunda decocção", duration: (p) => p.decoction2Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashOutTemp, boil: (p) => p.mashOutTemp, returnsDecoction: true },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}

// "Enhanced Double Decoction" do Braukaiser Wiki: rampa ácida inicial, 1ª
// decocção maior (50-60% do lote) devolvida em DUAS adições parciais — a
// primeira leva a mostura à rampa de proteína, a segunda à sacarificação —
// e uma 2ª decocção menor leva direto ao mash-out.
function buildDuplaAprimorada() {
  const paramSchema = [
    { ...G.WATER_VOLUME, default: 20 },
    { ...G.GRAIN_WEIGHT, default: 5 },
    { key: "acidRestTemp", label: "Temp. da rampa ácida (Mash In)", unit: "°C", group: "Geral", default: 35, min: 20, max: 50, step: 1 },
    { key: "acidRestTime", label: "Rampa ácida", unit: "min", group: "Rampas", default: 15, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.SACC_TEMP, default: 70 },
    { key: "saccTime", label: "Tempo de sacarificação da decocção", unit: "min", group: "Decocções", default: 15, min: 0, max: 60, step: 1 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da 1ª decocção (fervura)", unit: "min", group: "Decocções", default: 20, min: 0, max: 90, step: 1 },
    { key: "proteinRestTemp", label: "Temp. da rampa de proteína (1ª adição)", unit: "°C", group: "Decocções", default: 52, min: 40, max: 90, step: 1 },
    { key: "proteinRestTime", label: "Rampa de proteína", unit: "min", group: "Rampas", default: 18, min: 0, max: 60, step: 1 },
    { key: "saccRestTemp", label: "Temp. da rampa de sacarificação (2ª adição)", unit: "°C", group: "Decocções", default: 66, min: 40, max: 90, step: 1 },
    { key: "saccRestTime", label: "Rampa de sacarificação", unit: "min", group: "Rampas", default: 35, min: 0, max: 90, step: 1 },
    { key: "decoction2Time", label: "Tempo da 2ª decocção (fervura)", unit: "min", group: "Decocções", default: 15, min: 0, max: 90, step: 1 },
    { ...G.MASHOUT_TEMP, default: 76 },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 2 },
    { ...G.MASH_COOLING_RATE },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.acidRestTemp },
    { label: "Rampa ácida", duration: (p) => p.acidRestTime, mash: sameMash },
    { label: "Transferência da 1ª decocção Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash, pullsDecoction: true, restsForConversion: true },
    { label: "Aquecimento da decocção (até a sacarificação)", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação da decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento da decocção (até a fervura)", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Fervura da 1ª decocção", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "1ª adição (Fervura → Mostura)", duration: (p) => p.transferTime, mash: (p) => p.proteinRestTemp, boil: (p) => p.proteinRestTemp, returnsDecoction: true },
    { label: "Rampa de proteína", duration: (p) => p.proteinRestTime, mash: sameMash, boil: sameBoil },
    { label: "2ª adição (Fervura → Mostura)", duration: (p) => p.transferTime, mash: (p) => p.saccRestTemp, boil: (p) => p.saccRestTemp, returnsDecoction: true },
    { label: "Rampa de sacarificação", duration: (p) => p.saccRestTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência da 2ª decocção Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil, pullsDecoction: true, restsForConversion: false },
    { label: "Aquecimento da 2ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Fervura da 2ª decocção", duration: (p) => p.decoction2Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashOutTemp, boil: (p) => p.mashOutTemp, returnsDecoction: true },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}

function buildTripla() {
  const paramSchema = [
    { ...G.WATER_VOLUME, default: 20 },
    { ...G.GRAIN_WEIGHT, default: 5 },
    { ...G.MASH_IN_TEMP, default: 35 },
    { key: "rampaFitaseTime", label: "Rampa de fitase", unit: "min", group: "Rampas", default: 10, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 3 },
    { ...G.SACC_TEMP, default: 70 },
    { ...G.SACC_TIME, default: 10 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da 1ª decocção", unit: "min", group: "Decocções", default: 10, min: 0, max: 90, step: 1 },
    { key: "mashTemp2", label: "Temp. da mostura após 1ª decocção", unit: "°C", group: "Decocções", default: 52, min: 40, max: 90, step: 1 },
    { key: "rampaProteaseTime", label: "Rampa de protease", unit: "min", group: "Rampas", default: 0, min: 0, max: 60, step: 1 },
    { key: "decoccao2SaccTemp", label: "Temp. de sacarificação da 2ª decocção", unit: "°C", group: "Decocções", default: 70, min: 40, max: 90, step: 1 },
    { key: "decoction2Time", label: "Tempo da 2ª decocção", unit: "min", group: "Decocções", default: 30, min: 0, max: 90, step: 1 },
    { key: "mashTemp3", label: "Temp. da mostura após 2ª decocção", unit: "°C", group: "Decocções", default: 65, min: 40, max: 90, step: 1 },
    { key: "rampaSaccTime", label: "Rampa de sacarificação", unit: "min", group: "Rampas", default: 0, min: 0, max: 60, step: 1 },
    { key: "decoction3Time", label: "Tempo da 3ª decocção", unit: "min", group: "Decocções", default: 5, min: 0, max: 90, step: 1 },
    { ...G.MASHOUT_TEMP, default: 75 },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 3 },
    { ...G.MASH_COOLING_RATE },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.mashInTemp },
    { label: "Rampa de fitase", duration: (p) => p.rampaFitaseTime, mash: sameMash },
    { label: "Transferência da 1ª decocção Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash, pullsDecoction: true, restsForConversion: true },
    { label: "Aquecimento da 1ª decocção (até a sacarificação)", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação da decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento da 1ª decocção (até a fervura)", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Primeira decocção", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp2, boil: (p) => p.mashTemp2, returnsDecoction: true },
    { label: "Rampa de protease", duration: (p) => p.rampaProteaseTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência da 2ª decocção Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil, pullsDecoction: true, restsForConversion: true },
    { label: "Aquecimento da 2ª decocção (até a sacarificação)", duration: (p, prev) => (p.decoccao2SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao2SaccTemp },
    { label: "Sacarificação da decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento da 2ª decocção (até a fervura)", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Segunda decocção", duration: (p) => p.decoction2Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp3, boil: (p) => p.mashTemp3, returnsDecoction: true },
    { label: "Rampa de sacarificação", duration: (p) => p.rampaSaccTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência da 3ª decocção Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil, pullsDecoction: true, restsForConversion: false },
    { label: "Aquecimento da 3ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Terceira decocção", duration: (p) => p.decoction3Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashOutTemp, boil: (p) => p.mashOutTemp, returnsDecoction: true },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}

const simples = buildSimples();
// Boaventura: rampas de maltose e dextrinização do Hochkurz feitas por
// aquecimento direto na própria tina de mostura (sem decocção, como no
// "Hochkurz Mash" do Braukaiser Wiki). Só na virada da rampa de
// dextrinização para o mash-out é puxada uma decocção simples — a porção
// já está no ponto de sacarificação, então vai direto à fervura (~15min)
// e retorna trazendo a mostura para a temperatura de mash-out.
//
// Os defaults de `rampaMaltoseTime`/`rampaDextrinizacaoTime` (35min/5min)
// são o tempo DIGITADO, não o tempo real que a mostura passa em cada
// temperatura — o real inclui também o tempo gasto puxando, aquecendo e
// fervendo a decocção, que acontece com a mostura parada a 71°C. Com esses
// valores o programa entrega ~35min reais a 62°C e ~44min a 71°C (dentro
// da faixa que a literatura recomenda pra maltose/dextrinização); os
// defaults antigos (15min/40min) invertiam isso na prática, entregando só
// ~15min a 62°C e quase 80min a 71°C.
function buildBoaventura() {
  const paramSchema = [
    { ...G.WATER_VOLUME, default: 20 },
    { ...G.GRAIN_WEIGHT, default: 5 },
    { ...G.MASH_IN_TEMP, default: 62 },
    { key: "rampaMaltoseTime", label: "Rampa de maltose", unit: "min", group: "Rampas", default: 35, min: 0, max: 60, step: 1 },
    { key: "dextrinizacaoTemp", label: "Temp. da rampa de dextrinização", unit: "°C", group: "Geral", default: 71, min: 40, max: 90, step: 1 },
    { key: "rampaDextrinizacaoTime", label: "Rampa de dextrinização", unit: "min", group: "Rampas", default: 5, min: 0, max: 90, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoctionTime", label: "Tempo da decocção (fervura)", unit: "min", group: "Decocções", default: 15, min: 0, max: 60, step: 1 },
    { ...G.MASHOUT_TEMP, default: 76 },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 2 },
    { ...G.MASH_COOLING_RATE },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.mashInTemp },
    { label: "Rampa de maltose", duration: (p) => p.rampaMaltoseTime, mash: sameMash },
    { label: "Aquecimento até a rampa de dextrinização", duration: (p, prev) => (p.dextrinizacaoTemp - prev.mash) / p.heatingRate, mash: (p) => p.dextrinizacaoTemp },
    { label: "Rampa de dextrinização", duration: (p) => p.rampaDextrinizacaoTime, mash: sameMash },
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash, pullsDecoction: true, restsForConversion: false },
    { label: "Aquecimento até a fervura", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Decocção (fervura)", duration: (p) => p.decoctionTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura (Mash Out)", duration: (p) => p.transferTime, mash: (p) => p.mashOutTemp, boil: (p) => p.mashOutTemp, returnsDecoction: true },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}
const boaventura = buildBoaventura();
const duplaTradicional = buildDupla({
  rampaLabel: "Rampa de protease",
  rampaKey: "rampaProteaseTime",
  mashInDefault: 52,
  mashTemp2Default: 65,
  mashOutTempDefault: 75,
});
const duplaModerna = buildDupla({
  rampaLabel: "Rampa de fitase",
  rampaKey: "rampaFitaseTime",
  mashInDefault: 35,
  mashTemp2Default: 66,
  mashOutTempDefault: 76,
});
const hochkurz = buildDupla({
  rampaLabel: "Rampa de maltose",
  rampaKey: "rampaMaltoseTime",
  rampaTimeDefault: 15,
  mashInDefault: 62,
  mashTemp2Default: 71,
  mashOutTempDefault: 76,
  saccTempDefault: 71,
  // Narziß (Abriss, §2.3.3.4, p. 154 e Band 2, §3.2.4.5, p. 350) dá 5-10min
  // de fervura pras DUAS decocções do Hochkurz, não só a 2ª — a 1ª ainda
  // ganha seu próprio repouso de sacarificação (por isso o
  // restsForConversion:true continua nela), só a fervura em si é curta.
  decoction1TimeDefault: 8,
  rampaSaccLabel: "Rampa de dextrinização",
  rampaSaccTimeDefault: 40,
  // A 2ª vai direto à fervura, sem repouso — a porção já sai sacarificada
  // da tina (ver secondDecoctionRests abaixo).
  decoction2TimeDefault: 8,
  secondDecoctionRests: false,
});
const duplaAprimorada = buildDuplaAprimorada();
const tripla = buildTripla();

// Equivalente térmico do malte em L-equivalentes de água por kg — NÃO é o
// 0,67 L/kg (equivalente volumétrico, usado pro volume da mostura). Vem de
// 0,2 qt/lb (equação de infusão do Palmer/Braukaiser) convertido pro
// métrico: 0,2 × 0,9464 L/qt ÷ 0,4536 kg/lb = 0,4173. Só é usado aqui —
// na decocção normal o calor específico do grão CANCELA na conta (mesma
// razão água:grão em toda fração puxada), o motor de runSteps() nem
// precisa saber que ele existe. Na pseudo-decocção a água entra sem grão e
// o grão entra sem água, então o calor específico do malte deixa de
// cancelar e a conta precisa dessa constante pra valer.
const THERMAL_EQUIV_L_PER_KG = 0.4173;

// Pseudo-decocção ("cereal mash"/double-mash system, Briggs et al. §4,
// Kunze p. 250, Narziß Band 2 §3.2.5.2, Brücklmeier p. 145-147): uma
// panela só, sem puxada e sem retorno. Ferve a 1ª parcela (parte do malte
// + parte da água), depois entra o RESTO da água (fria) e só então o
// RESTO do malte seco — o calor da parcela fervida leva tudo direto à 1ª
// rampa do step mash. A ordem água-antes-do-malte não é estética: entrar
// com o malte seco seguindo direto na mostura fervente (93,5°C na
// configuração padrão) destruiria as enzimas dele antes de qualquer
// conversão.
function buildPseudoDecoccao() {
  const paramSchema = [
    { ...G.WATER_VOLUME, default: 20 },
    { ...G.GRAIN_WEIGHT, default: 5 },
    { key: "ambientTemp", label: "Temp. da água e do malte (ambiente)", unit: "°C", group: "Geral", default: 25, min: 5, max: 40, step: 1 },
    { ...G.MASHOUT_TEMP, default: 76 },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 2 },
    { key: "grainSplitPct", label: "% do malte na 1ª parcela", unit: "%", group: "Parcela", default: 50, min: 20, max: 80, step: 5 },
    { key: "liquefacaoTemp", label: "Temp. do repouso de liquefação", unit: "°C", group: "Parcela", default: 70, min: 60, max: 80, step: 1 },
    { key: "fervuraTemp", label: "Temp. de fervura da 1ª parcela", unit: "°C", group: "Parcela", default: 100, min: 90, max: 105, step: 1 },
    { key: "decoctionTime", label: "Tempo de fervura da 1ª parcela", unit: "min", group: "Parcela", default: 30, min: 0, max: 90, step: 1 },
    { key: "transferTime", label: "Tempo de cada adição", unit: "min", group: "Parcela", default: 2, min: 0, max: 30, step: 1 },
    { key: "proteaseTemp", label: "Temp. da rampa de protease", unit: "°C", group: "Parcela", default: 52, min: 40, max: 60, step: 1 },
    { key: "betaTemp", label: "Temp. da rampa de β-amilase", unit: "°C", group: "Parcela", default: 62, min: 55, max: 68, step: 1 },
    { key: "alfaTemp", label: "Temp. da rampa de α-amilase", unit: "°C", group: "Parcela", default: 70, min: 65, max: 78, step: 1 },
    // Padrão 0 = evaporação desprezada (panela com tampa, ou fervura curta
    // o bastante pra não importar) — mesma filosofia do mashCoolingRate
    // (T3): só quem liga o campo vê qualquer diferença (Q5, 5ª leitura).
    { key: "evapRatePctPerHour", label: "Taxa de evaporação da 1ª parcela", unit: "%/h", group: "Parcela", default: 0, min: 0, max: 20, step: 1 },
    { key: "liquefacaoTime", label: "Repouso de liquefação", unit: "min", group: "Rampas", default: 15, min: 0, max: 60, step: 1 },
    // 0min pula a rampa de protease inteira — é o mesmo padrão que a Dupla
    // Tradicional já usa pra "rampa de 0 min", não um campo booleano novo.
    // Com 0, o alvo da mistura (T2, abaixo) vira a rampa de β-amilase.
    { key: "proteaseTime", label: "Rampa de protease", unit: "min", group: "Rampas", default: 20, min: 0, max: 60, step: 1 },
    { key: "betaTime", label: "Rampa de β-amilase", unit: "min", group: "Rampas", default: 40, min: 0, max: 90, step: 1 },
    { key: "alfaTime", label: "Rampa de α-amilase", unit: "min", group: "Rampas", default: 20, min: 0, max: 90, step: 1 },
  ];

  function computeRows(params) {
    const W = num(params.waterVolume);
    const G = num(params.grainWeight);
    const Tamb = num(params.ambientTemp);
    const splitFrac = num(params.grainSplitPct) / 100;
    const G1 = G * splitFrac;
    const G2 = G - G1;
    const Tb = num(params.fervuraTemp); // temperatura REAL da fervura, não convenção de balanço
    const cg = THERMAL_EQUIV_L_PER_KG;
    const heatingRate = num(params.heatingRate, 2) || 2;

    // O alvo da mistura não é um campo — é derivado de proteaseTime, igual
    // ao "campo que decide o desenho" já documentado no comentário do
    // Hochkurz. proteaseTime=0 pula a rampa e o alvo vira betaTemp: os
    // dois diagramas da fonte viram o mesmo programa com um campo diferente.
    const proteaseOn = num(params.proteaseTime) > 0;
    const T2target = proteaseOn ? num(params.proteaseTemp) : num(params.betaTemp);

    // Evaporação da 1ª parcela (Q5, 5ª leitura): a fervura de decoctionTime
    // minutos perde água de verdade antes da água/malte restantes entrarem
    // — sem contar isso, a conta assumia que todo W1 medido ainda estava
    // lá na hora da mistura. `f` é a fração que SOBRA depois da fervura;
    // só afeta a parcela (o malte G1 não evapora, e a água W2 nem chegou
    // na panela ainda).
    const evapFrac = Math.min(1, Math.max(0, (num(params.evapRatePctPerHour) / 100) * (num(params.decoctionTime) / 60)));
    const f = 1 - evapFrac;

    const Ctotal = W + cg * G;
    // W1 é resolvido pro ALVO (T2target), não digitado — então a
    // evaporação não pode ser aplicada DEPOIS de resolver (subtrair de um
    // W1 já calculado sem ela dá um alvo errado): tem que entrar dentro da
    // própria equação. Com T2 = [(W1·f+cg·G1)·Tb + (W-W1)·Tamb + cg·G2·Tamb]
    // / [(W1·f+cg·G1) + (W-W1) + cg·G2], isolando W1 (álgebra no PR que
    // introduziu isso — reduz exatamente à fórmula antiga quando f=1, ver
    // tests/pseudo-decoccao.test.js):
    const denom = f * (T2target - Tb) - (T2target - Tamb);
    const W1raw = denom !== 0
      ? (cg * G1 * Tb + W * Tamb + cg * G2 * Tamb - Ctotal * T2target) / denom
      : NaN;

    // Alvo inalcançável: nem sem água na 1ª parcela (W1=0) nem com toda a
    // água nela (W1=W) chega lá — a fórmula devolveria um W1 sem sentido
    // físico (negativo ou maior que o total). Os dois limites saem da
    // MESMA fórmula do T2 final, só fixando W1 nos extremos — não é uma
    // conta nova, é a mesma rodada ao contrário (ver especificação §6/V2).
    function targetAtW1(W1v) {
      const W2v = W - W1v;
      const Cp = W1v * f + cg * G1;
      return (Cp * Tb + W2v * Tamb + cg * G2 * Tamb) / (Cp + W2v + cg * G2);
    }
    const eps = 1e-6;
    if (!Number.isFinite(W1raw) || W1raw < -eps || W1raw > W + eps) {
      const boundA = targetAtW1(0);
      const boundB = targetAtW1(W);
      const rows = [{ label: "Empastar a 1ª parcela", duration: 0, totalMin: 0, totalHours: 0, mash: Tamb, boil: null }];
      rows.pseudoUnreachable = {
        target: T2target,
        minTarget: Math.min(boundA, boundB),
        maxTarget: Math.max(boundA, boundB),
        usingProtease: proteaseOn,
      };
      return rows;
    }
    const W1 = Math.max(0, Math.min(W, W1raw));
    const W2 = W - W1;
    // CparcelaFull: massa térmica da parcela ANTES da fervura evaporar
    // nada — é o que aquece nas duas etapas de "aquecimento" (líquido
    // ainda intacto). Cparcela: DEPOIS da fervura, é o que de fato entra
    // no balanço com a água/malte restantes (T1/T2) — a evaporação já
    // aconteceu a essa altura.
    const CparcelaFull = W1 + cg * G1;
    const Cparcela = W1 * f + cg * G1;

    // Enquanto só a 1ª parcela está na panela (etapas 1 e 3), a massa
    // térmica é menor que a da mostura completa — a MESMA potência aquece
    // proporcionalmente mais rápido. Sem escalar, o cronograma superestima
    // esse trecho em ~20min (ver especificação §5, "decisão a tomar"). A
    // razão Ctotal/CparcelaFull não tem teto físico — com pouca água na 1ª
    // parcela (puxada pequena, alvo baixo) ela dispara (26°C/min num caso
    // extremo, aquecer 35°C em 1,4min), o que nenhuma panela real faz.
    // Teto em 3× a taxa configurada: folga sobre os 2,03-2,92× dos casos
    // reais (padrão de fábrica e os dois diagramas publicados, todos
    // usados como fixture em scripts/verify_pseudo_decoccao.js — um teto
    // mais apertado quebraria essas contas), mas ainda corta o extremo.
    const scaledRate = Math.min(heatingRate * (Ctotal / CparcelaFull), heatingRate * 3);

    const rows = [];
    let totalMin = 0;
    function push(label, duration, mash, extra) {
      duration = Math.max(0, num(duration));
      totalMin += duration;
      // samePlateau: mesma identidade usada por annotateRealPlateauTimes
      // no motor de decocção, mas aqui não há perda térmica nem drift —
      // igualdade de valor já é um proxy correto de "continua o patamar".
      const samePlateau = rows.length > 0 && rows[rows.length - 1].mash === mash;
      const row = { label, duration, totalMin, totalHours: totalMin / 60, mash, boil: null, samePlateau };
      if (extra) Object.assign(row, extra);
      rows.push(row);
      return row;
    }

    const esp = W1 / G1;
    push("Empastar a 1ª parcela", 0, Tamb, {
      pseudoParcelaW1: W1,
      pseudoParcelaG1: G1,
      pseudoEspessura: esp,
      pseudoSplitPct: num(params.grainSplitPct),
    });
    // pseudoScaledHeat: essas duas etapas usam scaledRate (só a 1ª parcela
    // na panela), não heatingRate puro — o resumo de aquecimento real ao
    // concluir (N7, app.js) compara duração×heatingRate contra o tempo
    // real assumindo UMA taxa só; incluir essas duas aqui compararia
    // contra a taxa errada e sempre pareceria "mais lento" mesmo batendo
    // certinho com a taxa escalada. Marcadas pra esse resumo pular.
    push("Aquecimento até a liquefação", (num(params.liquefacaoTemp) - Tamb) / scaledRate, params.liquefacaoTemp, { pseudoScaledHeat: true });
    push("Repouso de liquefação", params.liquefacaoTime, params.liquefacaoTemp);
    push("Aquecimento até a fervura", (Tb - num(params.liquefacaoTemp)) / scaledRate, Tb, { pseudoScaledHeat: true });
    push("Fervura da 1ª parcela", params.decoctionTime, Tb);

    // T1: temperatura logo depois da água (ainda sem o malte) — é o número
    // que separa a execução certa (água antes) da errada (malte
    // direto na fervura): entra na conta porque decide se as enzimas do
    // 2º malte sobrevivem (ver especificação §4/§6 V4).
    const T1 = (Cparcela * Tb + W2 * Tamb) / (Cparcela + W2);
    push("Adição da água restante", params.transferTime, T1, {
      pseudoWaterAddL: W2,
      pseudoWaterAddTemp: Tamb,
    });
    const T2 = (Cparcela * Tb + W2 * Tamb + cg * G2 * Tamb) / (Cparcela + W2 + cg * G2);
    push("Adição do malte restante", params.transferTime, T2, { pseudoMaltAddKg: G2 });

    if (proteaseOn) {
      push("Rampa de protease", params.proteaseTime, params.proteaseTemp);
      push("Aquecimento até a rampa de β-amilase", (num(params.betaTemp) - num(params.proteaseTemp)) / heatingRate, params.betaTemp);
    }
    push("Rampa de β-amilase", params.betaTime, params.betaTemp);
    push("Aquecimento até a rampa de α-amilase", (num(params.alfaTemp) - num(params.betaTemp)) / heatingRate, params.alfaTemp);
    push("Rampa de α-amilase", params.alfaTime, params.alfaTemp);
    push("Aquecimento Mash Out", (num(params.mashOutTemp) - num(params.alfaTemp)) / heatingRate, params.mashOutTemp);
    push("Mash Out", params.mashOutTime, params.mashOutTemp);

    return rows;
  }

  return { paramSchema, computeRows };
}
const pseudoDecoccao = buildPseudoDecoccao();

const METHODS = [
  { id: "simples", name: "Simples", description: "Uma decocção só: puxa uma fração da mostura, ferve e devolve pra elevar da sacarificação ao mash-out. O método mais rápido e mais fácil de calibrar.", source: "Braukaiser Wiki — Single Decoction; Kunze, Technology Brewing and Malting, 3ª ed.", ...simples },
  { id: "dupla-tradicional", name: "Dupla Tradicional", description: "Duas decocções: rampa de protease no início, depois duas puxadas que levam a mostura até a sacarificação e até o mash-out.", source: "Kunze, Technology Brewing and Malting, 3ª ed.; Narziß, Abriss der Bierbrauerei, 7ª ed.", ...duplaTradicional },
  { id: "dupla-moderna", name: "Dupla Moderna", description: "Duas decocções com rampa de fitase (Säurerast) no início, pensada pra maltes menos modificados — mesma lógica da Dupla Tradicional, temperaturas iniciais mais baixas.", source: "Narziß, Abriss der Bierbrauerei, 7ª ed. (Säurerast)", ...duplaModerna },
  { id: "hochkurz", name: "Hochkurz", description: "Duas decocções compactas com rampas de maltose e dextrinização — cerveja com corpo mais leve; a 2ª decocção vai direto à fervura, sem o repouso de sacarificação da 1ª, no total bem mais curta.", source: "Narziß, Abriss der Bierbrauerei, 7ª ed., §2.3.3.4; Narziß, Die Bierbrauerei Band 2, §3.2.4.5, p. 350", ...hochkurz },
  { id: "boaventura", name: "Boaventura", description: "Rampas de maltose e dextrinização por aquecimento direto na tina; só ao final é puxada uma decocção única, já sacarificada, direto pra fervura.", source: "Autoral (Henrique Boaventura) — variante do Hochkurz, Braukaiser Wiki", ...boaventura },
  { id: "dupla-aprimorada", name: "Dupla Aprimorada", description: "Uma decocção grande devolvida em duas adições parciais, mais uma decocção menor no fim — o \"Enhanced Double Decoction\" do Braukaiser Wiki.", source: "Braukaiser Wiki — Enhanced Double Decoction", ...duplaAprimorada },
  { id: "tripla-tradicional", name: "Tripla Tradicional", description: "Três decocções — o método clássico completo, mais longo e com perfil de melanoidinas mais pronunciado.", source: "Narziß, Die Bierbrauerei Band 2, §3.2.4.10 — Dreimaischverfahren", ...tripla },
  {
    id: "pseudo-decoccao",
    name: "Pseudo-decocção",
    description: "Divide malte e água em duas parcelas: a 1ª liquefaz e ferve sozinha, e o calor dela leva a 2ª (água fria, depois malte seco) direto à 1ª rampa do step mash. Uma panela só — sem puxada, sem retorno, sem fração de decocção. Método de sabor com base física sólida (ruptura de parede celular e Maillard na fervura) e base sensorial ainda não testada.",
    source: "Craft Beer & Brewing (2016) e BYO, atribuído a Kai Troester; o procedimento equivale ao Earl'sches Kochmaischverfahren (Brücklmeier, 2022, p. 145-147) e ao cereal mash de Briggs et al., Brewing: Science and Practice (2004), §4, p. 93",
    ...pseudoDecoccao,
  },
];

function getMethod(id) {
  return METHODS.find((m) => m.id === id) || METHODS[0];
}

function defaultParams(method) {
  const out = {};
  for (const p of method.paramSchema) out[p.key] = p.default;
  return out;
}

// Movida de app.js: pura (só depende de defaultParams, acima), sem nada de
// DOM — vivia isolada da suíte de testes por estar no lado errado da linha
// entre motor e interface. É a defesa contra os dois achados C1/N1 das
// duas primeiras leituras: um valor fora de [min,max] (digitado, salvo em
// versão antiga, ou importado de um JSON de fora) tem que ser sempre
// grampeado antes de entrar em computeSchedule — nunca repassado cru.
function sanitizeParams(method, params) {
  const out = { ...defaultParams(method), ...params };
  for (const p of method.paramSchema) {
    const v = Number(out[p.key]);
    out[p.key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
  }
  return out;
}

function computeSchedule(method, params) {
  // Pseudo-decocção não puxa nem devolve nada — é uma panela só, física de
  // mistura direta, não balanço de energia entre duas tinas — então não
  // reaproveita runSteps (a máquina de puxada/retorno não seria tocada,
  // fica só ali sem fazer nada). computeRows, quando existe, substitui
  // runSteps inteiro; annotateRealPlateauTimes continua valendo pros dois,
  // porque só olha label/duration/mash, não pullsDecoction/boil.
  const rows = method.computeRows ? method.computeRows(params) : runSteps(method.steps, params);
  return annotateRealPlateauTimes(rows);
}

// Export duplo: `window.Decoccao` pro navegador, `module.exports` pro Node
// (testes, scripts/) — cada um só existe no ambiente certo, daí a checagem
// antes de cada um. Sem o de Node, cada script de teste precisava recarregar
// o arquivo inteiro num sandbox de vm só pra ganhar acesso às funções (era
// assim que scripts/verify_pseudo_decoccao.js fazia antes deste export
// existir).
const DecoccaoExports = { METHODS, getMethod, defaultParams, sanitizeParams, computeSchedule, totalMashVolumeL, THERMAL_EQUIV_L_PER_KG };
if (typeof window !== "undefined") window.Decoccao = DecoccaoExports;
if (typeof module !== "undefined" && module.exports) module.exports = DecoccaoExports;
