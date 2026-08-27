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

function buildSimples() {
  const paramSchema = [
    { ...G.MASH_IN_TEMP, default: 62 },
    { key: "rampaBAmilaseTime", label: "Rampa β-amilase", unit: "min", group: "Rampas", default: 20, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.SACC_TEMP, default: 72 },
    { ...G.SACC_TIME, default: 10 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da decocção", unit: "min", group: "Decocções", default: 15, min: 0, max: 60, step: 1 },
    { key: "mashTemp2", label: "Temp. mostura após retorno da decocção", unit: "°C", group: "Decocções", default: 72, min: 40, max: 90, step: 1 },
    { key: "rampaAAmilaseTime", label: "Rampa α-amilase", unit: "min", group: "Rampas", default: 15, min: 0, max: 60, step: 1 },
    { ...G.MASHOUT_TEMP, default: 77 },
    { ...G.MASHOUT_TIME, default: 10 },
    { ...G.HEATING_RATE, default: 2 },
  ];

  const steps = [
    { label: "Mash In", duration: () => 0, mash: (p) => p.mashInTemp },
    { label: "Rampa β-amilase", duration: (p) => p.rampaBAmilaseTime, mash: sameMash },
    { label: "Transferência 1/3 Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameMash },
    { label: "Aquecimento 1ª decocção", duration: (p, prev) => (p.decoccao1SaccTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.decoccao1SaccTemp },
    { label: "Sacarificação decocção", duration: (p) => p.saccTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 1ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Primeira decocção", duration: (p) => p.decoction1Time, mash: sameMash, boil: sameBoil },
    { label: "Transferência Fervura → Mostura", duration: (p) => p.transferTime, mash: (p) => p.mashTemp2, boil: (p) => p.mashTemp2 },
    { label: "Rampa α-amilase", duration: (p) => p.rampaAAmilaseTime, mash: sameMash },
    { label: "Transferência 1/3 Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash },
    { label: "Aquecimento Mash Out", duration: (p, prev) => (p.mashOutTemp - prev.mash) / p.heatingRate, mash: (p) => p.mashOutTemp },
    { label: "Mash Out", duration: (p) => p.mashOutTime, mash: sameMash },
  ];

  return { paramSchema, steps };
}

function buildDupla({ rampaLabel, rampaKey, mashInDefault, mashTemp2Default, mashOutTempDefault }) {
  const paramSchema = [
    { ...G.MASH_IN_TEMP, default: mashInDefault },
    { key: rampaKey, label: rampaLabel, unit: "min", group: "Rampas", default: 10, min: 0, max: 60, step: 1 },
    { ...G.TRANSFER_TIME, default: 5 },
    { ...G.SACC_TEMP, default: 70 },
    { ...G.SACC_TIME, default: 10 },
    { ...G.FERVURA_TEMP, default: 100 },
    { key: "decoction1Time", label: "Tempo da 1ª decocção", unit: "min", group: "Decocções", default: 30, min: 0, max: 90, step: 1 },
    { key: "mashTemp2", label: "Temp. mostura após 1ª decocção", unit: "°C", group: "Decocções", default: mashTemp2Default, min: 40, max: 90, step: 1 },
    { key: "rampaSaccTime", label: "Rampa sacarificação", unit: "min", group: "Rampas", default: 0, min: 0, max: 60, step: 1 },
    { key: "decoction2Time", label: "Tempo da 2ª decocção", unit: "min", group: "Decocções", default: 15, min: 0, max: 90, step: 1 },
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
    { label: "Rampa sacarificação", duration: (p) => p.rampaSaccTime, mash: sameMash, boil: sameBoil },
    { label: "Transferência Mostura → Fervura", duration: (p) => p.transferTime, mash: sameMash, boil: sameBoil },
    { label: "Aquecimento 2ª decocção", duration: (p, prev) => (p.fervuraTemp - prev.boil) / p.heatingRate, mash: sameMash, boil: (p) => p.fervuraTemp },
    { label: "Segunda decocção", duration: (p) => p.decoction2Time, mash: sameMash, boil: sameBoil },
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
const tripla = buildTripla();

const METHODS = [
  { id: "simples", name: "Simples", ...simples },
  { id: "dupla-tradicional", name: "Dupla Tradicional", ...duplaTradicional },
  { id: "dupla-moderna", name: "Dupla Moderna", ...duplaModerna },
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
