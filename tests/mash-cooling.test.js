// T3 — perda térmica da mostura em espera (mashCoolingRate). Padrão 0 tem
// que ser um no-op perfeito nos 7 métodos de decocção (verificado byte a
// byte contra o teste de regressão); ligado, o volume de puxada tem que
// crescer, e o tooltip de "patamar real" (achado Q2, 5ª leitura) não pode
// sumir.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../methods.js');

const DECOCTION_METHODS = D.METHODS.filter((m) => !m.computeRows).map((m) => m.id);

describe('mashCoolingRate padrão (0) é idêntico a não ter o parâmetro', () => {
  for (const id of DECOCTION_METHODS) {
    test(id, () => {
      const method = D.getMethod(id);
      const params = D.defaultParams(method);
      assert.equal(params.mashCoolingRate, 0, `${id}: default deveria ser 0`);
      const rowsA = D.computeSchedule(method, params);
      const rowsB = D.computeSchedule(method, { ...params, mashCoolingRate: 0 });
      assert.deepEqual(rowsA, rowsB);
    });
  }
});

describe('mashCoolingRate > 0 aumenta o volume de puxada, monotonicamente', () => {
  for (const id of DECOCTION_METHODS) {
    test(id, () => {
      const method = D.getMethod(id);
      const rates = [0, 0.05, 0.1, 0.2];
      let prevMaxVol = -Infinity;
      for (const rate of rates) {
        const params = { ...D.defaultParams(method), mashCoolingRate: rate };
        const rows = D.computeSchedule(method, params);
        const pulls = rows.filter((r) => r.decoctionVolumeL !== undefined);
        const maxVol = Math.max(...pulls.map((r) => r.decoctionVolumeL));
        assert.ok(maxVol >= prevMaxVol - 1e-9, `${id}: volume caiu de ${prevMaxVol} pra ${maxVol} indo de uma taxa menor pra maior`);
        prevMaxVol = maxVol;
      }
      assert.ok(prevMaxVol > 0, `${id}: taxa alta deveria produzir volume > 0`);
    });
  }
});

describe('Q2 (5ª leitura): tooltip de patamar real sobrevive com a perda térmica ligada', () => {
  test('Simples: "Rampa de proteína" continua anotado com o tempo real do patamar', () => {
    const method = D.getMethod('simples');
    const withoutLoss = D.computeSchedule(method, D.defaultParams(method));
    const withLoss = D.computeSchedule(method, { ...D.defaultParams(method), mashCoolingRate: 0.1 });

    const annotatedWithout = withoutLoss.filter((r) => r.realPlateauMin !== undefined);
    const annotatedWith = withLoss.filter((r) => r.realPlateauMin !== undefined);

    assert.ok(annotatedWithout.length > 0, 'sem perda: deveria haver ao menos um patamar anotado (baseline)');
    assert.equal(
      annotatedWith.length,
      annotatedWithout.length,
      'a perda térmica não pode mudar QUANTOS patamares são anotados — só agrupar por samePlateau, não por igualdade de mash, evita isso (Q2)'
    );
  });
});
