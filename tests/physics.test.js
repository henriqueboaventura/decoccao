// Testa o MODELO físico, não só números frozen — verifica que a fórmula
// continua fazendo o que ela diz que faz, variando parâmetros que os testes
// de regressão (parâmetros fixos de fábrica) não exercitam.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../methods.js');

const DECOCTION_METHODS = D.METHODS.filter((m) => !m.computeRows).map((m) => m.id);

function approxEqual(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, want ${expected} (tol ${tol})`);
}

describe('balanço de energia da decocção (C1): d = (T2-T1)/(Tb-T1)', () => {
  for (const id of DECOCTION_METHODS) {
    test(id, () => {
      const method = D.getMethod(id);
      const params = D.defaultParams(method);
      const rows = D.computeSchedule(method, params);
      const pulls = rows.filter((r) => r.decoctionVolumeL !== undefined);
      assert.ok(pulls.length > 0, `${id} deveria ter pelo menos uma puxada`);
      const totalVolumeL = D.totalMashVolumeL(params);
      for (const pull of pulls) {
        const t1 = pull.pullOriginalMash;
        const tb = params.fervuraTemp;
        // A ÚLTIMA linha de retorno associada a esta puxada é o T2 —
        // reconstrói a fração pela fórmula pura e confere contra o que o
        // motor guardou, pra pegar qualquer desvio silencioso na conta.
        const returns = rows.filter((r) => r.pullIndex === rows.indexOf(pull));
        const lastReturn = returns[returns.length - 1];
        const expectedFraction = (lastReturn.mash - t1) / (tb - t1);
        assert.ok(
          Math.abs(pull.decoctionFraction - expectedFraction) < 1e-9,
          `${id}: fração ${pull.decoctionFraction} não bate com (T2-T1)/(Tb-T1) = ${expectedFraction}`
        );
        assert.ok(
          Math.abs(pull.decoctionVolumeL - expectedFraction * totalVolumeL) < 1e-6,
          `${id}: volume não bate com fração × volume total da mostura`
        );
        // Nenhum programa publicado passa de 100% da mostura numa puxada só
        assert.ok(pull.decoctionFraction >= 0 && pull.decoctionFraction <= 1, `${id}: fração fora de [0,1]`);
      }
    });
  }
});

describe('conservação de energia com puxada devolvida em partes (evita superestimar o volume)', () => {
  // Havia aqui um teste comparando pull.pullOriginalMash contra ele mesmo
  // (assert.equal(x, x)) — sempre verdadeiro, não testava nada (achado
  // U5, 7ª leitura). A proteção de verdade contra a regressão do C1 é o
  // teste logo abaixo, que trava contra a fórmula aditiva errada.

  test('C1 (Raio-X, achado crítico): não regride pra fórmula que SOMA as frações de cada adição', () => {
    // O bug original (v1.0): tela mandava puxar 12,92 L (55,3%) somando
    // (52-35)/(100-35) + (66-52)/(100-52) — cada adição calculada como se
    // a mostura inteira estivesse na tina. A correção usa sempre o T1 da
    // puxada original e SUBSTITUI (não soma) a fração a cada retorno.
    // Trava aqui pra sempre: se a fração voltar a ser a soma, este teste
    // pega antes de qualquer PDF de auditoria precisar pegar de novo.
    const method = D.getMethod('dupla-aprimorada');
    const params = D.defaultParams(method);
    const rows = D.computeSchedule(method, params);
    const pull = rows.find((r) => r.returnParts > 1);
    const totalVolumeL = D.totalMashVolumeL(params);

    const buggyFraction = (52 - 35) / (100 - 35) + (66 - 52) / (100 - 52); // = 55,3 % — a fórmula errada de 2026-08-28
    const buggyVolumeL = buggyFraction * totalVolumeL; // = 12,92 L

    approxEqual(pull.decoctionFraction, 0.477, 0.001, 'fração correta (energy-conservation, Raio-X §3.1)');
    assert.ok(
      Math.abs(pull.decoctionFraction - buggyFraction) > 0.05,
      `fração ${pull.decoctionFraction} está perto demais da fórmula aditiva errada (${buggyFraction.toFixed(4)}) — possível regressão do C1`
    );
    assert.ok(
      Math.abs(pull.decoctionVolumeL - buggyVolumeL) > 1,
      `volume ${pull.decoctionVolumeL}L está perto demais do valor errado original (${buggyVolumeL.toFixed(2)}L)`
    );
  });

  test('Dupla Moderna e Dupla Aprimorada concordam pra mesma física (mesma mostura, mesma viagem 35°C→66°C)', () => {
    // O argumento do Raio-X §3.1 ("a demonstração que qualquer um pode
    // repetir na própria tela"): as duas fazem exatamente a mesma viagem
    // térmica com os mesmos padrões de fábrica (20L água + 5kg malte,
    // 35→66°C, fervura a 100°C) — uma numa adição só, a outra em duas.
    // Mesma física, mesma mostura, mesmo destino: só pode haver UM volume
    // certo, e as duas ferramentas internas (os dois métodos) têm que
    // concordar nele.
    const moderna = D.getMethod('dupla-moderna');
    const aprimorada = D.getMethod('dupla-aprimorada');
    assert.equal(D.defaultParams(moderna).waterVolume, D.defaultParams(aprimorada).waterVolume, 'pré-condição: mesma água');
    assert.equal(D.defaultParams(moderna).grainWeight, D.defaultParams(aprimorada).grainWeight, 'pré-condição: mesmo malte');

    const rowsModerna = D.computeSchedule(moderna, D.defaultParams(moderna));
    const rowsAprimorada = D.computeSchedule(aprimorada, D.defaultParams(aprimorada));
    const pullModerna = rowsModerna.find((r) => r.decoctionVolumeL !== undefined);
    const pullAprimorada = rowsAprimorada.find((r) => r.returnParts > 1);

    approxEqual(pullModerna.decoctionVolumeL, pullAprimorada.decoctionVolumeL, 1e-3, 'volume da puxada — mesma viagem térmica, tem que ser o mesmo número');
    approxEqual(pullModerna.decoctionFraction, pullAprimorada.decoctionFraction, 1e-4, 'fração da puxada');
  });

  test('N9 (Segunda Leitura): volume de cada adição parcial reproduz a conta publicada', () => {
    // Conferência independente do worked example do achado N9: depois da
    // puxada, a tina fica com 23,35-11,14=12,21L a 35°C; a 1ª adição (a
    // 52°C) tira 12,21·(52-35)/(100-52)=4,33L da panela (38,8% do total
    // puxado); a 2ª (a 66°C) leva o resto, 6,81L (61,2%). Confirmação por
    // fora: (12,21·35 + 4,33·100)/16,54 = 52,0°C.
    const method = D.getMethod('dupla-aprimorada');
    const params = D.defaultParams(method);
    const rows = D.computeSchedule(method, params);
    const pull = rows.find((r) => r.returnParts > 1);
    const returns = rows.filter((r) => r.pullIndex === rows.indexOf(pull));
    const [primeira, segunda] = returns;

    const totalVolumeL = D.totalMashVolumeL(params);
    const tinaAposPuxadaL = totalVolumeL - pull.decoctionVolumeL;
    approxEqual(tinaAposPuxadaL, 12.21, 0.01, 'tina após a puxada');

    const esperado1aL = tinaAposPuxadaL * (primeira.mash - 35) / (100 - primeira.mash);
    approxEqual(primeira.returnVolumeL, esperado1aL, 1e-6, '1ª adição — reconstrução independente');
    approxEqual(primeira.returnVolumeL, 4.33, 0.01, '1ª adição — valor publicado no achado N9');

    const esperado2aL = pull.decoctionVolumeL - primeira.returnVolumeL;
    approxEqual(segunda.returnVolumeL, esperado2aL, 1e-6, '2ª adição — o resto da puxada');
    approxEqual(segunda.returnVolumeL, 6.81, 0.01, '2ª adição — valor publicado no achado N9');

    // confere: mistura de volta pra 52°C
    const tConfere = (tinaAposPuxadaL * 35 + primeira.returnVolumeL * 100) / (tinaAposPuxadaL + primeira.returnVolumeL);
    approxEqual(tConfere, primeira.mash, 0.05, 'conferência por fora da mistura');
  });
});

describe('Boaventura (T6, Raio-X/Segunda Leitura): patamares reais batem com a correção publicada', () => {
  test('35min reais a 62°C (declarado, sem etapa escondida) e ~39,5min reais a 71°C (achado, além do declarado)', () => {
    // Antes da correção (padrões trocados, 15min/40min), o real dava 15min
    // a 62°C e 74,5min a 71°C — o inverso do que a literatura pede. Com os
    // padrões corrigidos (35min/5min), a rampa de maltose já É 35 reais
    // (patamar de uma etapa só, sem nada escondido depois — por isso não
    // ganha anotação de realPlateauMin, só o próprio "duration"); a de
    // dextrinização declara 5min mas tem ~39,5min reais escondidos nela
    // (transferência + aquecimento + fervura da decocção, todos com a
    // mostura parada a 71°C antes do retorno).
    const method = D.getMethod('boaventura');
    const rows = D.computeSchedule(method, D.defaultParams(method));
    const rampaMaltose = rows.find((r) => r.label === 'Rampa de maltose');
    const rampaDextrinizacao = rows.find((r) => r.label === 'Rampa de dextrinização');

    assert.equal(rampaMaltose.realPlateauMin, undefined, 'sem etapa escondida depois — nada a anotar');
    approxEqual(rampaMaltose.duration, 35, 0.5, 'tempo (declarado = real) a 62°C');

    assert.ok(rampaDextrinizacao.realPlateauMin !== undefined, 'rampa de dextrinização deveria ter tempo real anotado (tem etapas escondidas depois)');
    approxEqual(rampaDextrinizacao.realPlateauMin, 39.5, 0.5, 'tempo real ALÉM do declarado, a 71°C');

    // a inversão do bug original: maltose real 15min / dextrinização real 74,5min
    assert.ok(Math.abs(rampaMaltose.duration - 15) > 5, 'tempo a 62°C perto demais do valor invertido do bug original (15min)');
    assert.ok(Math.abs(rampaDextrinizacao.realPlateauMin - 74.5) > 5, 'tempo real a 71°C perto demais do valor invertido do bug original (74,5min)');
  });
});

describe('Hochkurz: as duas decocções usam fervura curta (Narziß, 5-10min)', () => {
  test('decoction1Time e decoction2Time são ambos 8min por padrão', () => {
    const method = D.getMethod('hochkurz');
    const params = D.defaultParams(method);
    assert.equal(params.decoction1Time, 8);
    assert.equal(params.decoction2Time, 8);
  });
  test('só a 1ª decocção descansa pra sacarificação; a 2ª vai direto à fervura', () => {
    const method = D.getMethod('hochkurz');
    const rows = D.computeSchedule(method, D.defaultParams(method));
    const pulls = rows.filter((r) => r.pullsDecoction);
    assert.equal(pulls.length, 2);
    assert.equal(pulls[0].restsForConversion, true, '1ª decocção do Hochkurz deveria sacarificar');
    assert.equal(pulls[1].restsForConversion, false, '2ª decocção do Hochkurz deveria ir direto à fervura');
  });
});

describe('invariantes estruturais (valem pros 8 métodos, com parâmetros de fábrica)', () => {
  for (const method of D.METHODS) {
    test(method.id, () => {
      const params = D.defaultParams(method);
      const rows = D.computeSchedule(method, params);
      assert.ok(rows.length > 0, 'programa sem nenhuma etapa');

      let prevTotal = -Infinity;
      for (const r of rows) {
        assert.ok(Number.isFinite(r.duration) && r.duration >= 0, `${method.id}: duração inválida em "${r.label}"`);
        assert.ok(Number.isFinite(r.totalMin), `${method.id}: totalMin inválido em "${r.label}"`);
        assert.ok(r.totalMin >= prevTotal - 1e-9, `${method.id}: totalMin não é monotônico em "${r.label}"`);
        prevTotal = r.totalMin;
        assert.ok(Number.isFinite(r.mash), `${method.id}: mash inválido (NaN?) em "${r.label}"`);
      }

      const mashVolumeL = D.totalMashVolumeL(params);
      assert.ok(Math.abs(mashVolumeL - (params.waterVolume + params.grainWeight * 0.67)) < 1e-9);

      // Todo método com paramSchema tem que respeitar seus próprios limites
      // declarados — um default fora do próprio min/max é um bug de
      // definição do parâmetro, pego aqui sem precisar rodar o app.
      for (const p of method.paramSchema) {
        assert.ok(p.default >= p.min && p.default <= p.max, `${method.id}: "${p.key}" default ${p.default} fora de [${p.min}, ${p.max}]`);
        assert.ok(p.min <= p.max, `${method.id}: "${p.key}" min > max`);
      }
      const keys = method.paramSchema.map((p) => p.key);
      assert.equal(new Set(keys).size, keys.length, `${method.id}: chaves de parâmetro duplicadas`);
    });
  }
});
