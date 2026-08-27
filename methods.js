// Motor de cálculo dos programas de decocção.
// Reconstrói, célula por célula, a lógica da planilha "Cálculos de decocção",
// trocando referências de célula por parâmetros nomeados e editáveis.

const G = {
  MASH_IN_TEMP: { key: "mashInTemp", label: "Temp. Mash In", unit: "°C", group: "Geral", min: 20, max: 80, step: 1 },
  HEATING_RATE: { key: "heatingRate", label: "Taxa de aquecimento", unit: "°C/min", group: "Geral", min: 0.5, max: 5, step: 0.1 },
  TRANSFER_TIME: { key: "transferTime", label: "Tempo de transferência", unit: "min", group: "Geral", min: 0, max: 30, step: 1 },
  SACC_TEMP: { key: "decoccao1SaccTemp", label: "Temp. sacarificação da decocção", unit: "°C", group: "Decocções", min: 40, max: 90, step: 1 },
  SACC_TIME: { key: "saccTime", label: "Tempo de sacarificação da decocção", unit: "min", group: "Decocções", min: 0, max: 60, step: 1 },
  FERVURA_TEMP: { key: "fervuraTemp", label: "Temp. fervura da porção decoctada", unit: "°C", group: "Decocções", min: 90, max: 105, step: 1 },
  MASHOUT_TEMP: { key: "mashOutTemp", label: "Temp. Mash Out", unit: "°C", group: "Geral", min: 70, max: 85, step: 1 },
  MASHOUT_TIME: { key: "mashOutTime", label: "Tempo de Mash Out", unit: "min", group: "Geral", min: 0, max: 60, step: 1 },
};

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Executa uma lista de passos contra os parâmetros, retornando as linhas
// da tabela (igual às colunas B..G da planilha) já com tempo acumulado.
function runSteps(steps, params) {
  const rows = [];
  let prev = { mash: null, boil: null };
  let totalMin = 0;
  for (const step of steps) {
    const duration = Math.max(0, num(step.duration(params, prev)));
    const mash = step.mash(params, prev);
    const boil = step.boil ? step.boil(params, prev) : null;
    totalMin += duration;
    rows.push({
      label: step.label,
      duration,
      totalMin,
      totalHours: totalMin / 60,
      mash,
      boil,
    });
    prev = { mash, boil: boil !== null ? boil : prev.boil };
  }
  return rows;
}

const sameMash = (p, prev) => prev.mash;
const sameBoil = (p, prev) => (prev.boil !== null && prev.boil !== undefined ? prev.boil : prev.mash);

// Segue o "Single Decoction" descrito no Braukaiser Wiki: rampa de proteína
// (53-55°C) -> 1 decocção leva a mostura à rampa de sacarificação (65-68°C,
// ~45min) -> aquecimento direto (sem nova decocção) até o mash-out.
function buildSimples() {
  const paramSchema = [
    { ...G.MASH_IN_TEMP, default: 53 },
    { key: "rampaProteinaTime", label: "Rampa proteína", unit: "min", group: "Rampas", default: 20, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.SACC_TEMP, default: 68 },
    { ...G.SACC_TIME, default: 10 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da decocção", unit: "min", group: "Decocções", default: 15, min: 0, max: 60, step: 1 },
    { key: "mashTemp2", label: "Temp. mostura após retorno da decocção", unit: "°C", group: "Decocções", default: 66, min: 40, max: 90, step: 1 },
    { key: "rampaSaccTime", label: "Rampa sacarificação", unit: "min", group: "Rampas", default: 45, min: 0, max: 90, step: 1 },
    { ...G.MASHOUT_TEMP, default: 75 },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 2 },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.mashInTemp },
    { label: "Rampa proteína", duration: (p) => p.rampaProteinaTime, mash: sameMash },
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash },
    { label: "Aquecimento decocção", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Decocção (fervura)", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp2, boil: (p) => p.mashTemp2 },
    { label: "Rampa sacarificação", duration: (p) => p.rampaSaccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento Mash Out", duration: (p, prev) => (p.mashOutTemp - prev.mash) / p.heatingRate, mash: (p) => p.mashOutTemp },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}

function buildDupla({
  rampaLabel, rampaKey, rampaTimeDefault = 10,
  mashInDefault, mashTemp2Default, mashOutTempDefault,
  saccTempDefault = 70,
  decoction1TimeDefault = 30,
  rampaSaccLabel = "Rampa sacarificação",
  rampaSaccTimeDefault = 0,
  decoction2TimeDefault = 15,
}) {
  const paramSchema = [
    { ...G.MASH_IN_TEMP, default: mashInDefault },
    { key: rampaKey, label: rampaLabel, unit: "min", group: "Rampas", default: rampaTimeDefault, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.SACC_TEMP, default: saccTempDefault },
    { ...G.SACC_TIME, default: 10 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da 1ª decocção", unit: "min", group: "Decocções", default: decoction1TimeDefault, min: 0, max: 90, step: 1 },
    { key: "mashTemp2", label: "Temp. mostura após 1ª decocção", unit: "°C", group: "Decocções", default: mashTemp2Default, min: 40, max: 90, step: 1 },
    { key: "rampaSaccTime", label: rampaSaccLabel, unit: "min", group: "Rampas", default: rampaSaccTimeDefault, min: 0, max: 90, step: 1 },
    { key: "decoction2Time", label: "Tempo da 2ª decocção", unit: "min", group: "Decocções", default: decoction2TimeDefault, min: 0, max: 90, step: 1 },
    { ...G.MASHOUT_TEMP, default: mashOutTempDefault },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 2 },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.mashInTemp },
    { label: rampaLabel, duration: (p) => p[rampaKey], mash: sameMash },
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash },
    { label: "Aquecimento 1ª decocção", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 1ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Primeira decocção", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp2, boil: (p) => p.mashTemp2 },
    { label: rampaSaccLabel, duration: (p) => p.rampaSaccTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 2ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Segunda decocção", duration: (p) => p.decoction2Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashOutTemp, boil: (p) => p.mashOutTemp },
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
    { key: "acidRestTemp", label: "Temp. rampa ácida (Mash In)", unit: "°C", group: "Geral", default: 35, min: 20, max: 50, step: 1 },
    { key: "acidRestTime", label: "Rampa ácida", unit: "min", group: "Rampas", default: 15, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.SACC_TEMP, default: 70 },
    { key: "saccTime", label: "Tempo de sacarificação da decocção", unit: "min", group: "Decocções", default: 15, min: 0, max: 60, step: 1 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da 1ª decocção (fervura)", unit: "min", group: "Decocções", default: 20, min: 0, max: 90, step: 1 },
    { key: "proteinRestTemp", label: "Temp. rampa proteína (1ª adição)", unit: "°C", group: "Decocções", default: 52, min: 40, max: 90, step: 1 },
    { key: "proteinRestTime", label: "Rampa proteína", unit: "min", group: "Rampas", default: 18, min: 0, max: 60, step: 1 },
    { key: "saccRestTemp", label: "Temp. rampa sacarificação (2ª adição)", unit: "°C", group: "Decocções", default: 66, min: 40, max: 90, step: 1 },
    { key: "saccRestTime", label: "Rampa sacarificação", unit: "min", group: "Rampas", default: 35, min: 0, max: 90, step: 1 },
    { key: "decoction2Time", label: "Tempo da 2ª decocção (fervura)", unit: "min", group: "Decocções", default: 15, min: 0, max: 90, step: 1 },
    { ...G.MASHOUT_TEMP, default: 76 },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 2 },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.acidRestTemp },
    { label: "Rampa ácida", duration: (p) => p.acidRestTime, mash: sameMash },
    { label: "Transferência 1ª decocção (50-60%) Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash },
    { label: "Aquecimento decocção", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Fervura da 1ª decocção", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "1ª adição (Fervura → Mostura)", duration: (p) => p.transferTime, mash: (p) => p.proteinRestTemp, boil: (p) => p.proteinRestTemp },
    { label: "Rampa proteína", duration: (p) => p.proteinRestTime, mash: sameMash, boil: sameBoil },
    { label: "2ª adição (Fervura → Mostura)", duration: (p) => p.transferTime, mash: (p) => p.saccRestTemp, boil: (p) => p.saccRestTemp },
    { label: "Rampa sacarificação", duration: (p) => p.saccRestTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência 2ª decocção Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 2ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Fervura da 2ª decocção", duration: (p) => p.decoction2Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashOutTemp, boil: (p) => p.mashOutTemp },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}

function buildTripla() {
  const paramSchema = [
    { ...G.MASH_IN_TEMP, default: 35 },
    { key: "rampaFitaseTime", label: "Rampa fitase", unit: "min", group: "Rampas", default: 10, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 3 },
    { ...G.SACC_TEMP, default: 70 },
    { ...G.SACC_TIME, default: 10 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da 1ª decocção", unit: "min", group: "Decocções", default: 10, min: 0, max: 90, step: 1 },
    { key: "mashTemp2", label: "Temp. mostura após 1ª decocção", unit: "°C", group: "Decocções", default: 52, min: 40, max: 90, step: 1 },
    { key: "rampaProteaseTime", label: "Rampa protease", unit: "min", group: "Rampas", default: 0, min: 0, max: 60, step: 1 },
    { key: "decoccao2SaccTemp", label: "Temp. sacarificação da 2ª decocção", unit: "°C", group: "Decocções", default: 70, min: 40, max: 90, step: 1 },
    { key: "decoction2Time", label: "Tempo da 2ª decocção", unit: "min", group: "Decocções", default: 30, min: 0, max: 90, step: 1 },
    { key: "mashTemp3", label: "Temp. mostura após 2ª decocção", unit: "°C", group: "Decocções", default: 65, min: 40, max: 90, step: 1 },
    { key: "rampaSaccTime", label: "Rampa sacarificação", unit: "min", group: "Rampas", default: 0, min: 0, max: 60, step: 1 },
    { key: "decoction3Time", label: "Tempo da 3ª decocção", unit: "min", group: "Decocções", default: 5, min: 0, max: 90, step: 1 },
    { ...G.MASHOUT_TEMP, default: 75 },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 3 },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.mashInTemp },
    { label: "Rampa fitase", duration: (p) => p.rampaFitaseTime, mash: sameMash },
    { label: "Transferência 1/3 Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash },
    { label: "Aquecimento 1ª decocção", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 1ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Primeira decocção", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp2, boil: (p) => p.mashTemp2 },
    { label: "Rampa protease", duration: (p) => p.rampaProteaseTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência 1/3 Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 2ª decocção", duration: (p, prev) => (p.decoccao2SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao2SaccTemp },
    { label: "Sacarificação decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 2ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Segunda decocção", duration: (p) => p.decoction2Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp3, boil: (p) => p.mashTemp3 },
    { label: "Rampa sacarificação", duration: (p) => p.rampaSaccTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência 1/3 Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 3ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Terceira decocção", duration: (p) => p.decoction3Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashOutTemp, boil: (p) => p.mashOutTemp },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}

const simples = buildSimples();
const duplaTradicional = buildDupla({
  rampaLabel: "Rampa protease",
  rampaKey: "rampaProteaseTime",
  mashInDefault: 52,
  mashTemp2Default: 65,
  mashOutTempDefault: 75,
});
const duplaModerna = buildDupla({
  rampaLabel: "Rampa fitase",
  rampaKey: "rampaFitaseTime",
  mashInDefault: 35,
  mashTemp2Default: 66,
  mashOutTempDefault: 76,
});
const hochkurz = buildDupla({
  rampaLabel: "Rampa maltose",
  rampaKey: "rampaMaltoseTime",
  rampaTimeDefault: 15,
  mashInDefault: 62,
  mashTemp2Default: 71,
  mashOutTempDefault: 76,
  saccTempDefault: 71,
  decoction1TimeDefault: 20,
  rampaSaccLabel: "Rampa dextrinização",
  rampaSaccTimeDefault: 40,
  decoction2TimeDefault: 15,
});
const duplaAprimorada = buildDuplaAprimorada();
const tripla = buildTripla();

const METHODS = [
  { id: "simples", name: "Simples", ...simples },
  { id: "dupla-tradicional", name: "Dupla Tradicional", ...duplaTradicional },
  { id: "dupla-moderna", name: "Dupla Moderna", ...duplaModerna },
  { id: "hochkurz", name: "Hochkurz", ...hochkurz },
  { id: "dupla-aprimorada", name: "Dupla Aprimorada", ...duplaAprimorada },
  { id: "tripla-tradicional", name: "Tripla Tradicional", ...tripla },
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
  return runSteps(method.steps, params);
}

window.Decoccao = { METHODS, getMethod, defaultParams, computeSchedule };
