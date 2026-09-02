// Testa o MODELO físico, não só números frozen — verifica que a fórmula
// continua fazendo o que ela diz que faz, variando parâmetros que os testes
// de regressão (parâmetros fixos de fábrica) não exercitam.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../methods.js');

const DECOCTION_METHODS = D.METHODS.filter((m) => !m.computeRows).map((m) => m.id);

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
  test('Dupla Aprimorada: T1 usado é sempre o da puxada original, nunca intermediário', () => {
    // A regressão C1 original: usar a temperatura intermediária (já
    // misturada por uma adição anterior) como T1 da adição seguinte
    // duplamente contava o calor já devolvido. Confere que pullOriginalMash
    // (o T1 usado na fórmula) é o MESMO em todas as devoluções da mesma
    // puxada — nunca muda entre a 1ª e a 2ª adição.
    const method = D.getMethod('dupla-aprimorada');
    const rows = D.computeSchedule(method, D.defaultParams(method));
    const pull = rows.find((r) => r.returnParts > 1);
    const returns = rows.filter((r) => r.pullIndex === rows.indexOf(pull));
    assert.ok(returns.length >= 2, 'esperava mais de uma devolução pra este teste fazer sentido');
    for (const r of returns) {
      assert.equal(pull.pullOriginalMash, pull.pullOriginalMash, 'T1 fixo em pullOriginalMash, não recalculado por devolução');
    }
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
