// Pseudo-decocção — os 11 casos de teste e as duas tabelas de passo a
// passo completas da especificação ("Pseudo-decocção · Especificação",
// 2/9/2026), mais os quatro achados de validação (V1-V4) e as correções da
// 5ª leitura (Q3, Q4, Q10). Complementa scripts/verify_pseudo_decoccao.js
// (saída legível, referenciada pela própria especificação) sem duplicar a
// mesma bateria — aqui é a versão que trava a build.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../methods.js');

const method = D.getMethod('pseudo-decoccao');

function baseParams(overrides) {
  return {
    ...D.defaultParams(method),
    waterVolume: 20, grainWeight: 5, ambientTemp: 25,
    mashOutTemp: 76, mashOutTime: 10, heatingRate: 2,
    grainSplitPct: 50, liquefacaoTemp: 70, fervuraTemp: 100,
    decoctionTime: 30, transferTime: 2,
    proteaseTemp: 52, betaTemp: 62, alfaTemp: 70,
    liquefacaoTime: 15, proteaseTime: 0, betaTime: 40, alfaTime: 20,
    ...overrides,
  };
}

function approxEqual(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, want ${expected} (tol ${tol})`);
}

describe('caso 1 (spec §5/§8): sem protease · alvo 62°C · ambiente 25°C', () => {
  const rows = D.computeSchedule(method, baseParams({}));
  const empastar = rows[0];
  const aguaRow = rows.find((r) => r.pseudoWaterAddL !== undefined);
  const malteRow = rows.find((r) => r.pseudoMaltAddKg !== undefined);

  test('W1, T1, T2, total e nº de etapas', () => {
    approxEqual(empastar.pseudoParcelaW1, 9.85, 0.01, 'W1');
    approxEqual(aguaRow.mash, 63.83, 0.01, 'T1');
    approxEqual(malteRow.mash, 62.0, 0.01, 'T2');
    approxEqual(rows[rows.length - 1].totalMin, 145, 1, 'total (min)');
    assert.equal(rows.length, 12);
  });

  test('passo a passo completo bate com a fixture da especificação', () => {
    const expected = [
      ['Empastar a 1ª parcela', 0, 25],
      ['Aquecimento até a liquefação', 11.1, 70],
      ['Repouso de liquefação', 15, 70],
      ['Aquecimento até a fervura', 7.4, 100],
      ['Fervura da 1ª parcela', 30, 100],
      ['Adição da água restante', 2, 63.8],
      ['Adição do malte restante', 2, 62.0],
      ['Rampa de β-amilase', 40, 62],
      ['Aquecimento até a rampa de α-amilase', 4, 70],
      ['Rampa de α-amilase', 20, 70],
      ['Aquecimento Mash Out', 3, 76],
      ['Mash Out', 10, 76],
    ];
    expected.forEach(([label, duration, mash], i) => {
      assert.equal(rows[i].label, label, `linha ${i}`);
      approxEqual(rows[i].duration, duration, 0.15, `linha ${i} (${label}) duração`);
      approxEqual(rows[i].mash, mash, 0.15, `linha ${i} (${label}) mostura`);
    });
  });
});

describe('caso 2 (spec §5/§8): com protease 20min · alvo 52°C · ambiente 27°C', () => {
  const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20 }));
  const empastar = rows[0];
  const aguaRow = rows.find((r) => r.pseudoWaterAddL !== undefined);
  const malteRow = rows.find((r) => r.pseudoMaltAddKg !== undefined);

  test('W1, T1, T2, total e nº de etapas', () => {
    approxEqual(empastar.pseudoParcelaW1, 6.52, 0.01, 'W1');
    approxEqual(aguaRow.mash, 53.24, 0.02, 'T1');
    approxEqual(malteRow.mash, 52.0, 0.01, 'T2');
    approxEqual(rows[rows.length - 1].totalMin, 164, 1, 'total (min)');
    assert.equal(rows.length, 14);
  });

  test('passo a passo completo bate com a fixture da especificação', () => {
    const expected = [
      ['Empastar a 1ª parcela', 0, 27],
      ['Aquecimento até a liquefação', 7.4, 70],
      ['Repouso de liquefação', 15, 70],
      ['Aquecimento até a fervura', 5.1, 100],
      ['Fervura da 1ª parcela', 30, 100],
      ['Adição da água restante', 2, 53.2],
      ['Adição do malte restante', 2, 52.0],
      ['Rampa de protease', 20, 52],
      ['Aquecimento até a rampa de β-amilase', 5, 62],
      ['Rampa de β-amilase', 40, 62],
      ['Aquecimento até a rampa de α-amilase', 4, 70],
      ['Rampa de α-amilase', 20, 70],
      ['Aquecimento Mash Out', 3, 76],
      ['Mash Out', 10, 76],
    ];
    expected.forEach(([label, duration, mash], i) => {
      assert.equal(rows[i].label, label, `linha ${i}`);
      approxEqual(rows[i].duration, duration, 0.15, `linha ${i} (${label}) duração`);
      approxEqual(rows[i].mash, mash, 0.15, `linha ${i} (${label}) mostura`);
    });
  });
});

describe('casos 3/4 (spec §3): fórmula direta reproduz os dois diagramas publicados do Beer School', () => {
  function forwardT2(W, G, W1, splitFrac, Tamb, Tb) {
    const cg = D.THERMAL_EQUIV_L_PER_KG;
    const G1 = G * splitFrac, G2 = G - G1;
    const W2 = W - W1;
    const Cp = W1 + cg * G1;
    return (Cp * Tb + W2 * Tamb + cg * G2 * Tamb) / (Cp + W2 + cg * G2);
  }
  test('diagrama 1 — 1/2 malte, 1/3 água, ambiente 27°C → 52,5°C', () => {
    approxEqual(forwardT2(20, 5, 20 / 3, 0.5, 27, 100), 52.5, 0.05, 'T2');
  });
  test('diagrama 2 — 1/2 malte, 1/2 água, ambiente 24°C → 62,0°C', () => {
    approxEqual(forwardT2(20, 5, 10, 0.5, 24, 100), 62.0, 0.05, 'T2');
  });
});

describe('casos 5/6 (spec §6, V1): espessura e alarme, ambiente 30°C · alvo 52°C', () => {
  test('50% do malte → 2,36 L/kg', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 30, proteaseTime: 20, proteaseTemp: 52, grainSplitPct: 50 }));
    approxEqual(rows[0].pseudoEspessura, 2.36, 0.02, 'espessura');
  });
  test('40% do malte → 3,05 L/kg', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 30, proteaseTime: 20, proteaseTemp: 52, grainSplitPct: 40 }));
    approxEqual(rows[0].pseudoEspessura, 3.05, 0.02, 'espessura');
  });
});

describe('caso 7 (spec §6): alvo 35°C · ambiente 25°C · 50% do malte', () => {
  test('W1 e espessura ficam baixos, mas ainda alcançáveis', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 25, proteaseTime: 20, proteaseTemp: 35, grainSplitPct: 50 }));
    approxEqual(rows[0].pseudoParcelaW1, 1.9, 0.05, 'W1');
    approxEqual(rows[0].pseudoEspessura, 0.76, 0.03, 'espessura');
  });
});

describe('casos 8/9 (spec §6, V3): fração de malte extrema', () => {
  test('85% do malte na 1ª parcela → espessura 2,15, splitPct exposto', () => {
    const rows = D.computeSchedule(method, baseParams({ grainSplitPct: 85 }));
    approxEqual(rows[0].pseudoEspessura, 2.15, 0.05, 'espessura');
    assert.equal(rows[0].pseudoSplitPct, 85);
  });
  test('20% do malte na 1ª parcela → splitPct exposto', () => {
    const rows = D.computeSchedule(method, baseParams({ grainSplitPct: 20 }));
    assert.equal(rows[0].pseudoSplitPct, 20);
  });
});

describe('caso 10 (spec §6): a constante térmica (0,4173, não 0,67) está travada', () => {
  test('resolver com c_g errado dá um W1 visivelmente diferente do correto', () => {
    function solveW1(cg, W, G, splitFrac, Tamb, Tb, target) {
      const G1 = G * splitFrac, G2 = G - G1;
      const Ctotal = W + cg * G;
      return (Ctotal * target - W * Tamb - cg * (G1 * Tb + G2 * Tamb)) / (Tb - Tamb);
    }
    const correct = solveW1(0.4173, 20, 5, 0.5, 25, 100, 35);
    const wrong = solveW1(0.67, 20, 5, 0.5, 25, 100, 35);
    approxEqual(correct, 1.9, 0.02, 'W1 com constante correta');
    assert.ok(Math.abs(wrong - correct) > 0.1, 'W1 com c_g errado deveria divergir claramente do correto');

    const rows = D.computeSchedule(method, baseParams({ proteaseTime: 20, proteaseTemp: 35 }));
    approxEqual(rows[0].pseudoParcelaW1, correct, 0.02, 'motor real usa a constante correta');
  });
});

describe('caso 11 (spec §5): taxa de aquecimento escalada pela massa térmica da parcela', () => {
  test('total escalado bate com o publicado (2h44 pro caso com protease)', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20 }));
    approxEqual(rows[rows.length - 1].totalMin, 164, 1, 'total escalado');
  });
  test('teto da taxa escalada (achado Q10, 5ª leitura): nunca passa de 3× a taxa configurada', () => {
    // Ambiente 35°C, alvo 40°C: a razão de massa térmica dispara (a
    // especificação mediu 26°C/min sem teto). O teto evita isso sem
    // quebrar os casos reais (2,03-2,92×, dentro do teto de 3×).
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 35, proteaseTime: 20, proteaseTemp: 40, heatingRate: 2 }));
    if (rows.pseudoUnreachable) return; // combinação extrema pode nem computar — não é o que este teste mede
    const heatRow = rows.find((r) => r.pseudoScaledHeat);
    const deltaT = Math.abs(heatRow.mash - 35); // aproximação: primeira etapa escalada sai do ambiente
    const impliedRate = deltaT / heatRow.duration;
    assert.ok(impliedRate <= 2 * 3 + 1e-6, `taxa implícita ${impliedRate} passou do teto de 3× a taxa configurada (2)`);
  });
});

describe('V2: alvo inalcançável não quebra o motor, devolve a faixa alcançável', () => {
  test('alvo abaixo da própria água ambiente é fisicamente impossível', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 25, proteaseTime: 20, proteaseTemp: 20 }));
    assert.ok(rows.pseudoUnreachable, 'deveria marcar como inalcançável');
    assert.ok(rows.pseudoUnreachable.minTarget < rows.pseudoUnreachable.maxTarget);
    assert.ok(rows.length >= 1, 'mesmo inalcançável, tem que devolver pelo menos uma linha (não quebrar a UI)');
  });
});

describe('Q5 (5ª leitura): evaporação da 1ª parcela — W1 é resolvido pro alvo, não ajustado depois', () => {
  test('evapRatePctPerHour=0 (padrão) reproduz o caso 2 exatamente — zero regressão', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20, evapRatePctPerHour: 0 }));
    approxEqual(rows[0].pseudoParcelaW1, 6.52, 0.01, 'W1 sem evaporação');
  });

  test('com evaporação ligada, T2 continua batendo EXATAMENTE no alvo (é isso que a correção garante)', () => {
    for (const evap of [0, 5, 10, 20]) {
      const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20, evapRatePctPerHour: evap }));
      const malteRow = rows.find((r) => r.pseudoMaltAddKg !== undefined);
      approxEqual(malteRow.mash, 52.0, 0.01, `T2 com evapRate=${evap}%/h`);
    }
  });

  test('W1 cresce monotonicamente com a taxa de evaporação — precisa de mais água pra sobrar o mesmo tanto', () => {
    const rates = [0, 5, 10, 20];
    let prevW1 = -Infinity;
    for (const evap of rates) {
      const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20, evapRatePctPerHour: evap }));
      const w1 = rows[0].pseudoParcelaW1;
      assert.ok(w1 > prevW1, `W1 não cresceu de ${prevW1} pra ${w1} indo de uma taxa menor pra maior (evap=${evap}%/h)`);
      prevW1 = w1;
    }
  });

  test('caso conferido à mão: ambiente 27°C, alvo 52°C, 10%/h por 30min → W1 ≈ 6,7423L', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20, evapRatePctPerHour: 10, decoctionTime: 30 }));
    approxEqual(rows[0].pseudoParcelaW1, 6.7423, 0.001, 'W1');
  });

  test('sem a correção (W1 do caso sem evaporação, aplicado a um Cparcela evaporado), o alvo erraria — confirma a magnitude do achado Q5', () => {
    // Reconstrói o que a ferramenta fazia ANTES da correção: resolve W1
    // ignorando evaporação, depois calcula T2 como se a parcela tivesse
    // evaporado de verdade. Isso tem que divergir do alvo — é a prova de
    // que a correção (resolver W1 JÁ considerando a evaporação) é
    // necessária, não cosmética.
    const cg = D.THERMAL_EQUIV_L_PER_KG;
    const W = 20, G = 5, Tamb = 27, Tb = 100, G1 = 2.5, G2 = 2.5, target = 52;
    const Ctotal = W + cg * G;
    const W1noEvap = (Ctotal * target - W * Tamb - cg * (G1 * Tb + G2 * Tamb)) / (Tb - Tamb);
    const evapFrac = 0.10 * (30 / 60); // 10%/h por 30min = 5%
    const f = 1 - evapFrac;
    const W2 = W - W1noEvap;
    const CparcelaEvaporated = W1noEvap * f + cg * G1;
    const T2semCorrecao = (CparcelaEvaporated * Tb + W2 * Tamb + cg * G2 * Tamb) / (CparcelaEvaporated + W2 + cg * G2);
    assert.ok(Math.abs(T2semCorrecao - target) > 0.5, `esperava um erro > 0,5°C sem a correção, achou ${Math.abs(T2semCorrecao - target)}`);
    approxEqual(T2semCorrecao, 51.28, 0.05, 'T2 sem a correção (referência do achado Q5/TODO.md)');
  });
});

describe('S3 (7ª leitura): espessura mostrada é a do FIM da fervura (pior caso), não a de antes de ferver', () => {
  test('evapRatePctPerHour=0 → pseudoEspessura === pseudoEspessuraInicial (sem evaporação, nada muda)', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20, evapRatePctPerHour: 0 }));
    approxEqual(rows[0].pseudoEspessura, rows[0].pseudoEspessuraInicial, 1e-9, 'espessura sem evaporação');
  });

  test('com evaporação ligada, pseudoEspessura (fim) é MENOR que pseudoEspessuraInicial (montagem) — menos água, mesmo malte', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20, evapRatePctPerHour: 10 }));
    assert.ok(rows[0].pseudoEspessura < rows[0].pseudoEspessuraInicial,
      `esperava espessura final (${rows[0].pseudoEspessura}) < inicial (${rows[0].pseudoEspessuraInicial})`);
  });

  test('pseudoEspessura bate com (W1*f)/G1 — é o valor pós-evaporação, o mesmo usado no alarme', () => {
    const rows = D.computeSchedule(method, baseParams({ ambientTemp: 27, proteaseTime: 20, evapRatePctPerHour: 10, decoctionTime: 30 }));
    const r = rows[0];
    const evapFrac = Math.min(1, Math.max(0, (10 / 100) * (30 / 60)));
    const f = 1 - evapFrac;
    const espFinalEsperada = (r.pseudoParcelaW1 * f) / r.pseudoParcelaG1;
    approxEqual(r.pseudoEspessura, espFinalEsperada, 1e-6, 'espessura final = (W1*f)/G1');
    approxEqual(r.pseudoEspessuraInicial, r.pseudoParcelaW1 / r.pseudoParcelaG1, 1e-9, 'espessura inicial = W1/G1');
  });
});

describe('sanidade estrutural (vale sempre, qualquer parâmetro razoável)', () => {
  test('W1+W2 = água total, G1+G2 = malte total', () => {
    // achado U5 (7ª leitura): `w1 + (20 - w1)` dá 20 pra QUALQUER w1 —
    // não testava se o motor calcula W2/G2 direito, só uma identidade
    // algébrica. Compara contra o W2/G2 que o motor de fato devolve nas
    // linhas de adição, não contra uma expressão que se cancela sozinha.
    const rows = D.computeSchedule(method, baseParams({}));
    const w1 = rows[0].pseudoParcelaW1, g1 = rows[0].pseudoParcelaG1;
    const aguaRow = rows.find((r) => r.pseudoWaterAddL !== undefined);
    const malteRow = rows.find((r) => r.pseudoMaltAddKg !== undefined);
    approxEqual(w1 + aguaRow.pseudoWaterAddL, 20, 1e-9, 'W1+W2');
    approxEqual(g1 + malteRow.pseudoMaltAddKg, 5, 1e-9, 'G1+G2');
  });

  test('volume final da mostura bate com os outros 7 métodos (mesmos defaults)', () => {
    const params = baseParams({});
    approxEqual(D.totalMashVolumeL(params), 23.35, 1e-9, 'volume da mostura');
  });

  test('extremo do slider (rate=1 em mashCoolingRate não existe aqui; testa grainSplitPct nos limites) não gera NaN/negativo', () => {
    for (const splitPct of [20, 50, 80]) {
      for (const proteaseTime of [0, 20]) {
        const rows = D.computeSchedule(method, baseParams({ grainSplitPct: splitPct, proteaseTime }));
        if (rows.pseudoUnreachable) continue;
        for (const r of rows) {
          assert.ok(Number.isFinite(r.mash), `mash inválido em "${r.label}" (split=${splitPct}, protease=${proteaseTime})`);
          assert.ok(r.duration >= 0, `duração negativa em "${r.label}"`);
        }
      }
    }
  });
});
