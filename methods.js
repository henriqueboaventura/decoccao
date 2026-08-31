// Motor de cálculo dos programas de decocção.
// Reconstrói, célula por célula, a lógica da planilha "Cálculos de decocção",
// trocando referências de célula por parâmetros nomeados e editáveis.

const G = {
  WATER_VOLUME: { key: "waterVolume", label: "Volume de água (mostura)", unit: "L", group: "Insumos", min: 1, max: 200, step: 0.5 },
  GRAIN_WEIGHT: { key: "grainWeight", label: "Massa de malte moído", unit: "kg", group: "Insumos", min: 0.1, max: 100, step: 0.1 },
  MASH_IN_TEMP: { key: "mashInTemp", label: "Temp. Mash In", unit: "°C", group: "Geral", min: 20, max: 80, step: 1 },
  HEATING_RATE: { key: "heatingRate", label: "Taxa de aquecimento", unit: "°C/min", group: "Geral", min: 0.5, max: 5, step: 0.1 },
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
    const temp = rows[i].mash;
    let j = i;
    let sum = 0;
    while (j < rows.length && rows[j].mash === temp) {
      sum += rows[j].duration;
      j++;
    }
    if (j - i > 1) {
      // Prefere marcar na própria linha "Rampa de X" (o campo que o usuário
      // edita e onde a confusão acontece); sem isso, cai na 1ª linha com
      // duração > 0 do patamar (ex.: Mash In sempre tem duração 0).
      let target = i;
      for (let k = i; k < j; k++) {
        if (rows[k].label.startsWith("Rampa ")) { target = k; break; }
        if (target === i && rows[k].duration > 0) target = k;
      }
      rows[target].realPlateauMin = sum;
    }
    i = j;
  }
  return rows;
}

function runSteps(steps, params) {
  const rows = [];
  let prev = { mash: null, boil: null };
  let totalMin = 0;
  let pullIndex = null;
  let pullOriginalMash = null;
  for (const step of steps) {
    const duration = Math.max(0, num(step.duration(params, prev)));
    const mash = step.mash(params, prev);
    const boil = step.boil ? step.boil(params, prev) : null;
    totalMin += duration;
    const row = {
      label: step.label,
      duration,
      totalMin,
      totalHours: totalMin / 60,
      mash,
      boil,
    };
    rows.push(row);

    if (step.pullsDecoction) {
      pullIndex = rows.length - 1;
      pullOriginalMash = prev.mash;
      rows[pullIndex].restsForConversion = !!step.restsForConversion;
    }
    if (step.returnsDecoction && pullIndex !== null) {
      // T1 é sempre a temp. da mostura no momento EXATO da puxada (fixo),
      // nunca a temp. intermediária entre adições — ver comentário acima.
      const t1 = pullOriginalMash;
      const tb = num(params.fervuraTemp);
      const denom = tb - t1;
      const fraction = denom > 0 ? Math.max(0, Math.min(1, (mash - t1) / denom)) : 0;
      const pullRow = rows[pullIndex];
      pullRow.decoctionFraction = fraction;
      pullRow.decoctionVolumeL = fraction * totalMashVolumeL(params);
      pullRow.returnParts = (pullRow.returnParts || 0) + 1;
    }

    prev = { mash, boil: boil !== null ? boil : prev.boil };
  }
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
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil, pullsDecoction: true, restsForConversion: true },
    { label: "Aquecimento da 2ª decocção (até a sacarificação)", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação da decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
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
  decoction1TimeDefault: 20,
  rampaSaccLabel: "Rampa de dextrinização",
  rampaSaccTimeDefault: 40,
  decoction2TimeDefault: 15,
});
const duplaAprimorada = buildDuplaAprimorada();
const tripla = buildTripla();

const METHODS = [
  { id: "simples", name: "Simples", description: "Uma decocção só: puxa uma fração da mostura, ferve e devolve pra elevar da sacarificação ao mash-out. O método mais rápido e mais fácil de calibrar.", ...simples },
  { id: "dupla-tradicional", name: "Dupla Tradicional", description: "Duas decocções: rampa de protease no início, depois duas puxadas que levam a mostura até a sacarificação e até o mash-out.", ...duplaTradicional },
  { id: "dupla-moderna", name: "Dupla Moderna", description: "Duas decocções com rampa de fitase (Säurerast) no início, pensada pra maltes menos modificados — mesma lógica da Dupla Tradicional, temperaturas iniciais mais baixas.", ...duplaModerna },
  { id: "hochkurz", name: "Hochkurz", description: "Duas decocções compactas com rampas de maltose e dextrinização — cerveja com corpo mais leve, tempo total menor que a Dupla clássica.", ...hochkurz },
  { id: "boaventura", name: "Boaventura", description: "Rampas de maltose e dextrinização por aquecimento direto na tina; só ao final é puxada uma decocção única, já sacarificada, direto pra fervura.", ...boaventura },
  { id: "dupla-aprimorada", name: "Dupla Aprimorada", description: "Uma decocção grande (50-60% do lote) devolvida em duas adições parciais, mais uma decocção menor no fim — o \"Enhanced Double Decoction\" do Braukaiser Wiki.", ...duplaAprimorada },
  { id: "tripla-tradicional", name: "Tripla Tradicional", description: "Três decocções, cada uma puxando cerca de 1/3 da mostura — o método clássico completo, mais longo e com perfil de melanoidinas mais pronunciado.", ...tripla },
];

function getMethod(id) {
  return METHODS.find((m) => m.id === id) || METHODS[0];
}

function defaultParams(method) {
  const out = {};
  for (const p of method.paramSchema) out[p.key] = p.default;
  return out;
}

function computeSchedule(method, params) {
  return annotateRealPlateauTimes(runSteps(method.steps, params));
}

window.Decoccao = { METHODS, getMethod, defaultParams, computeSchedule, totalMashVolumeL };
