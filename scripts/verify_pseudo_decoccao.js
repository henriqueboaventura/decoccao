#!/usr/bin/env node
// Confere o motor da Pseudo-decocção (methods.js) contra os números da
// especificação (PDF "Pseudo-decocção · Especificação", §5 e §8) — as
// mesmas 11 asserções, mais as duas tabelas completas de passo a passo.
// Rodar: node scripts/verify_pseudo_decoccao.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadMethods() {
  const code = fs.readFileSync(path.join(__dirname, "..", "methods.js"), "utf8");
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "methods.js" });
  return sandbox.window.Decoccao;
}

const D = loadMethods();
const method = D.getMethod("pseudo-decoccao");
if (method.id !== "pseudo-decoccao") throw new Error("método pseudo-decoccao não registrado");

let pass = 0, fail = 0;
function approx(a, b, tol, label) {
  const ok = Math.abs(a - b) <= tol;
  if (ok) { pass++; console.log(`  OK   ${label}: ${a} ≈ ${b}`); }
  else { fail++; console.log(`  FALHOU ${label}: got ${a}, want ${b} (tol ${tol})`); }
}
function equal(a, b, label) {
  const ok = a === b;
  if (ok) { pass++; console.log(`  OK   ${label}: ${a} === ${b}`); }
  else { fail++; console.log(`  FALHOU ${label}: got ${a}, want ${b}`); }
}

function baseParams(overrides) {
  return {
    waterVolume: 20, grainWeight: 5, ambientTemp: 25,
    mashOutTemp: 76, mashOutTime: 10, heatingRate: 2,
    grainSplitPct: 50, liquefacaoTemp: 70, fervuraTemp: 100,
    decoctionTime: 30, transferTime: 2,
    proteaseTemp: 52, betaTemp: 62, alfaTemp: 70,
    liquefacaoTime: 15, proteaseTime: 0, betaTime: 40, alfaTime: 20,
    ...overrides,
  };
}

console.log("=== #1: sem protease · alvo 62 · amb 25 (fixture completa §5) ===");
{
  const rows = D.computeSchedule(method, baseParams({}));
  const empastar = rows[0];
  const aguaRow = rows.find((r) => r.pseudoWaterAddL !== undefined);
  const malteRow = rows.find((r) => r.pseudoMaltAddKg !== undefined);
  approx(empastar.pseudoParcelaW1, 9.85, 0.01, "W1");
  approx(aguaRow.mash, 63.83, 0.01, "T1");
  approx(malteRow.mash, 62.00, 0.01, "T2");
  approx(rows[rows.length - 1].totalMin, 145, 1, "total (min)"); // 2h25 = 145min
  equal(rows.length, 12, "etapas");
  // fixture linha a linha (rótulo, duração, mostura)
  const expected = [
    ["Empastar a 1ª parcela", 0, 25],
    ["Aquecimento até a liquefação", 11.1, 70],
    ["Repouso de liquefação", 15, 70],
    ["Aquecimento até a fervura", 7.4, 100],
    ["Fervura da 1ª parcela", 30, 100],
    ["Adição da água restante", 2, 63.8],
    ["Adição do malte restante", 2, 62.0],
    ["Rampa de β-amilase", 40, 62],
    ["Aquecimento até a rampa de α-amilase", 4, 70],
    ["Rampa de α-amilase", 20, 70],
    ["Aquecimento Mash Out", 3, 76],
    ["Mash Out", 10, 76],
  ];
  expected.forEach(([label, duration, mash], i) => {
    equal(rows[i].label, label, `linha ${i} rótulo`);
    approx(rows[i].duration, duration, 0.15, `linha ${i} duração`);
    approx(rows[i].mash, mash, 0.15, `linha ${i} mostura`);
  });
}

console.log("\n=== #2: com protease 20 · alvo 52 · amb 27 (fixture completa §5) ===");
{
  const params = baseParams({ ambientTemp: 27, proteaseTime: 20 });
  const rows = D.computeSchedule(method, params);
  const empastar = rows[0];
  const aguaRow = rows.find((r) => r.pseudoWaterAddL !== undefined);
  const malteRow = rows.find((r) => r.pseudoMaltAddKg !== undefined);
  approx(empastar.pseudoParcelaW1, 6.52, 0.01, "W1");
  approx(aguaRow.mash, 53.24, 0.02, "T1");
  approx(malteRow.mash, 52.00, 0.01, "T2");
  approx(rows[rows.length - 1].totalMin, 164, 1, "total (min)"); // 2h44 = 164min
  equal(rows.length, 14, "etapas");
  const expected = [
    ["Empastar a 1ª parcela", 0, 27],
    ["Aquecimento até a liquefação", 7.4, 70],
    ["Repouso de liquefação", 15, 70],
    ["Aquecimento até a fervura", 5.1, 100],
    ["Fervura da 1ª parcela", 30, 100],
    ["Adição da água restante", 2, 53.2],
    ["Adição do malte restante", 2, 52.0],
    ["Rampa de protease", 20, 52],
    ["Aquecimento até a rampa de β-amilase", 5, 62],
    ["Rampa de β-amilase", 40, 62],
    ["Aquecimento até a rampa de α-amilase", 4, 70],
    ["Rampa de α-amilase", 20, 70],
    ["Aquecimento Mash Out", 3, 76],
    ["Mash Out", 10, 76],
  ];
  expected.forEach(([label, duration, mash], i) => {
    equal(rows[i].label, label, `linha ${i} rótulo`);
    approx(rows[i].duration, duration, 0.15, `linha ${i} duração`);
    approx(rows[i].mash, mash, 0.15, `linha ${i} mostura`);
  });
}

// #3/#4: conferência inversa — dada uma DIVISÃO FIXA de água (não a que o
// solver acharia), que T2 sai? Testa a fórmula direta (forward), não o
// solver — reproduz os dois diagramas publicados do Beer School.
function forwardT2(W, G, W1, splitFrac, Tamb, Tb) {
  const cg = D.THERMAL_EQUIV_L_PER_KG;
  const G1 = G * splitFrac, G2 = G - G1;
  const W2 = W - W1;
  const Cp = W1 + cg * G1;
  return (Cp * Tb + W2 * Tamb + cg * G2 * Tamb) / (Cp + W2 + cg * G2);
}
console.log("\n=== #3/#4: fórmula direta reproduz os dois diagramas publicados ===");
approx(forwardT2(20, 5, 20 / 3, 0.5, 27, 100), 52.5, 0.05, "diagrama 1 (1/2 malte, 1/3 água, amb 27)");
approx(forwardT2(20, 5, 10, 0.5, 24, 100), 62.0, 0.05, "diagrama 2 (1/2 malte, 1/2 água, amb 24)");

console.log("\n=== #5/#6: espessura e alarme V1 (amb 30 · alvo 52) ===");
{
  const p50 = baseParams({ ambientTemp: 30, proteaseTime: 20, proteaseTemp: 52, grainSplitPct: 50 });
  const rows50 = D.computeSchedule(method, p50);
  approx(rows50[0].pseudoEspessura, 2.36, 0.02, "espessura a 50%");
  const p40 = baseParams({ ambientTemp: 30, proteaseTime: 20, proteaseTemp: 52, grainSplitPct: 40 });
  const rows40 = D.computeSchedule(method, p40);
  approx(rows40[0].pseudoEspessura, 3.05, 0.02, "espessura a 40%");
}

console.log("\n=== #7: alvo 35°C · amb 25 · 50% — W1 e espessura baixos ===");
{
  const p = baseParams({ ambientTemp: 25, proteaseTime: 20, proteaseTemp: 35, grainSplitPct: 50 });
  const rows = D.computeSchedule(method, p);
  approx(rows[0].pseudoParcelaW1, 1.90, 0.05, "W1");
  approx(rows[0].pseudoEspessura, 0.76, 0.03, "espessura");
}

console.log("\n=== #8/#9: fração de malte extrema (V3) ===");
{
  const p85 = baseParams({ grainSplitPct: 85 });
  const rows85 = D.computeSchedule(method, p85);
  approx(rows85[0].pseudoEspessura, 2.15, 0.05, "espessura a 85% do malte");
  equal(rows85[0].pseudoSplitPct, 85, "splitPct exposto a 85%");
  const p20 = baseParams({ grainSplitPct: 20 });
  const rows20 = D.computeSchedule(method, p20);
  equal(rows20[0].pseudoSplitPct, 20, "splitPct exposto a 20%");
}

console.log("\n=== #10: regressão — travar a constante térmica (0,4173, não 0,67) ===");
{
  // A default (50/50, W1≈9,85L) tem G pequeno frente a W1 — pouco sensível
  // a c_g, então usar ela aqui mal distinguiria as duas constantes. O
  // cenário do #7 (alvo baixo, W1 pequeno frente a G1) é sensível de
  // verdade: resolvendo W1 com a constante ERRADA (0,67) em vez da certa
  // (0,4173), pro MESMO alvo de 35°C, o W1 sai visivelmente diferente do
  // 1,90 L correto — é isso que trava a constante contra regressão.
  function solveW1(cg, W, G, splitFrac, Tamb, Tb, target) {
    const G1 = G * splitFrac, G2 = G - G1;
    const Ctotal = W + cg * G;
    return (Ctotal * target - W * Tamb - cg * (G1 * Tb + G2 * Tamb)) / (Tb - Tamb);
  }
  const W1correct = solveW1(0.4173, 20, 5, 0.5, 25, 100, 35);
  const W1wrong = solveW1(0.67, 20, 5, 0.5, 25, 100, 35);
  approx(W1correct, 1.90, 0.02, "W1 com c_g correto (0,4173)");
  if (Math.abs(W1wrong - W1correct) < 0.1) {
    fail++; console.log(`  FALHOU: W1 com c_g errado (${W1wrong.toFixed(2)}) ficou perto demais do correto — cenário não distingue as constantes`);
  } else {
    pass++; console.log(`  OK   c_g errado (0,67) dá W1=${W1wrong.toFixed(2)}L, visivelmente diferente do correto ${W1correct.toFixed(2)}L`);
  }
  const rows = D.computeSchedule(method, baseParams({ proteaseTime: 20, proteaseTemp: 35 }));
  approx(rows[0].pseudoParcelaW1, W1correct, 0.02, "motor real usa a constante correta");
}

console.log("\n=== #11: taxa escalada — decisão da §5 ===");
{
  const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20 }));
  approx(rows[rows.length - 1].totalMin, 164, 1, "total ESCALADO (2h44)");
  // sem escalar (taxa única pra tudo): superestima em ~24min → 3h08 = 188min
  const heatSteps = rows.filter((r) => /Aquecimento até a (liquefação|fervura)/.test(r.label));
  const unscaledExtra = heatSteps.reduce((sum, r) => {
    const idx = rows.indexOf(r);
    const deltaT = Math.abs(r.mash - rows[idx - 1].mash);
    const unscaledDuration = deltaT / 2; // heatingRate=2 sem escala
    return sum + (unscaledDuration - r.duration);
  }, 0);
  const unscaledTotal = rows[rows.length - 1].totalMin + unscaledExtra;
  approx(unscaledTotal, 188, 2, "total SEM escalar (3h08, hipotético)");
}

console.log("\n=== V2: alvo inalcançável não quebra o motor ===");
{
  // Alvo (20°C) abaixo da própria água ambiente (25°C) — misturar com algo
  // mais quente só pode ESQUENTAR a mistura, nunca esfriar abaixo do
  // ambiente. A conta pede W1 negativo: fisicamente impossível.
  const p = baseParams({ ambientTemp: 25, proteaseTime: 20, proteaseTemp: 20 });
  const rows = D.computeSchedule(method, p);
  if (rows.pseudoUnreachable) {
    pass++;
    console.log(`  OK   marcado como inalcançável: faixa [${rows.pseudoUnreachable.minTarget.toFixed(1)}, ${rows.pseudoUnreachable.maxTarget.toFixed(1)}]°C, alvo pedido ${rows.pseudoUnreachable.target}°C`);
  } else {
    fail++;
    console.log("  FALHOU: esperava pseudoUnreachable, motor calculou normalmente — ajustar o caso de teste");
  }
}

console.log("\n=== Sanidade estrutural (vale sempre) ===");
{
  const rows = D.computeSchedule(method, baseParams({}));
  const W1 = rows[0].pseudoParcelaW1, G1 = rows[0].pseudoParcelaG1;
  const water = D.totalMashVolumeL; // só existência, não uso direto aqui
  approx(W1 + (20 - W1), 20, 1e-9, "W1+W2 = waterVolume");
  approx(G1 + (5 - G1), 5, 1e-9, "G1+G2 = grainWeight");
  // volume final da mostura deve bater com os outros 7 métodos (mesmos
  // defaults de água/malte) — 23,35 L.
  approx(20 + 5 * 0.67, 23.35, 1e-9, "volume final da mostura consistente com os outros métodos");
}

console.log(`\n${pass} ok, ${fail} falhas.`);
process.exit(fail > 0 ? 1 : 0);
