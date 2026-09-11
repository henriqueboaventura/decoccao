// Varredura de bordas: os quatro achados graves da décima primeira leitura
// (Y1 negativo, Y2 volume negativo, Y3 panela esfriando de graça, Y8 alarme
// espúrio) não apareciam nos testes de "padrão de fábrica" — só em min/máx
// de parâmetro, ou em pares de campos de temperatura interagindo. Esta
// suíte varre exatamente esse território: cada parâmetro no mínimo e no
// máximo (isolado), depois cada PAR de campos de temperatura nos quatro
// cantos (min×min, min×máx, máx×min, máx×máx), pros sete métodos reais.
// Não afirma nada sobre QUAL número certo — só que o motor nunca produz um
// resultado fisicamente absurdo (negativo, NaN, volume maior que o total,
// panela esfriando sozinha) nem quando aceita, nem quando recusa.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../methods.js');

const REAL_METHODS = D.METHODS.filter((m) => m.id !== 'pseudo-decoccao');

// Checa que todo número que aparece nas linhas é finito (sem NaN/Infinity)
// e que os invariantes físicos básicos valem — independente de qual
// checagem de viabilidade o motor tem hoje. É deliberadamente uma caixa
// preta: não repete a lógica de methods.js, só confere o que um resultado
// fisicamente possível tem que satisfazer sempre.
function assertPhysicallySane(rows, params, label) {
  if (rows.decoctionUnreachable) {
    const u = rows.decoctionUnreachable;
    assert.equal(typeof u.stepLabel, 'string', `${label}: decoctionUnreachable.stepLabel deveria ser string`);
    assert.ok(u.stepLabel.length > 0, `${label}: decoctionUnreachable.stepLabel não deveria ser vazio`);
    for (const key of ['target', 'minTarget', 'maxTarget']) {
      assert.ok(Number.isFinite(u[key]), `${label}: decoctionUnreachable.${key} deveria ser finito, got ${u[key]}`);
    }
    return;
  }

  assert.ok(rows.length > 0, `${label}: rows vazio`);
  const totalVolumeL = D.totalMashVolumeL(params);
  let prevTotalMin = -Infinity;
  let prevBoilForHeating = null;
  rows.forEach((r, i) => {
    const at = `${label} · linha ${i} (${r.label})`;
    assert.ok(Number.isFinite(r.duration), `${at}: duration não finito (${r.duration})`);
    assert.ok(r.duration >= 0, `${at}: duration negativo (${r.duration})`);
    assert.ok(Number.isFinite(r.totalMin), `${at}: totalMin não finito (${r.totalMin})`);
    assert.ok(r.totalMin >= prevTotalMin - 1e-9, `${at}: totalMin voltou no tempo (${r.totalMin} < ${prevTotalMin})`);
    prevTotalMin = r.totalMin;

    if (r.mash !== null && r.mash !== undefined) {
      assert.ok(Number.isFinite(r.mash), `${at}: mash não finito (${r.mash})`);
      // Y1: a mostura não pode "esfriar" abaixo de zero — fisicamente
      // impossível (viraria gelo com a panela do lado fervendo).
      assert.ok(r.mash >= -1e-9, `${at}: mash negativo (${r.mash}) — achado Y1`);
    }
    if (r.boil !== null && r.boil !== undefined) {
      assert.ok(Number.isFinite(r.boil), `${at}: boil não finito (${r.boil})`);
    }
    if (r.decoctionVolumeL !== undefined) {
      assert.ok(Number.isFinite(r.decoctionVolumeL), `${at}: decoctionVolumeL não finito`);
      assert.ok(r.decoctionVolumeL >= -1e-9, `${at}: decoctionVolumeL negativo (${r.decoctionVolumeL})`);
      assert.ok(r.decoctionVolumeL <= totalVolumeL + 1e-6, `${at}: decoctionVolumeL (${r.decoctionVolumeL}) maior que o volume total da mostura (${totalVolumeL})`);
    }
    if (r.returnVolumeL !== undefined) {
      // Y2: a 2ª+ adição parcial pedindo um volume negativo — "devolver
      // -5,84 L" — era exatamente isto passando batido.
      assert.ok(Number.isFinite(r.returnVolumeL), `${at}: returnVolumeL não finito`);
      assert.ok(r.returnVolumeL >= -1e-9, `${at}: returnVolumeL negativo (${r.returnVolumeL}) — achado Y2`);
    }
    if (r.evaporatedL !== undefined) {
      assert.ok(Number.isFinite(r.evaporatedL), `${at}: evaporatedL não finito`);
      assert.ok(r.evaporatedL >= -1e-9, `${at}: evaporatedL negativo (${r.evaporatedL})`);
      assert.ok(r.evaporatedL <= (r.decoctionVolumeL || 0) + 1e-9, `${at}: evaporatedL maior que o que foi puxado`);
    }
    // Y3: a panela de fervura não pode "esfriar" sozinha entre uma etapa
    // de aquecimento e a seguinte — só puxada/retorno mudam boil pra
    // baixo de propósito (esvaziam a panela, não resfriam ela).
    if (r.boil !== null && r.boil !== undefined && !r.pullsDecoction && !r.returnsDecoction) {
      if (prevBoilForHeating !== null) {
        assert.ok(r.boil >= prevBoilForHeating - 1e-9, `${at}: panela esfriou sozinha, de ${prevBoilForHeating}°C pra ${r.boil}°C — achado Y3`);
      }
      prevBoilForHeating = r.boil;
    } else if (r.pullsDecoction || r.returnsDecoction) {
      prevBoilForHeating = null; // muda de significado; não é mais "a panela aquecendo"
    }
  });
}

describe('varredura de bordas · cada parâmetro isolado no mínimo e no máximo', () => {
  for (const method of REAL_METHODS) {
    test(method.id, () => {
      const base = D.defaultParams(method);
      for (const p of method.paramSchema) {
        for (const edge of ['min', 'max']) {
          const params = D.sanitizeParams(method, { ...base, [p.key]: p[edge] });
          const label = `${method.id} · ${p.key}=${edge}(${p[edge]})`;
          assert.doesNotThrow(() => {
            const rows = D.computeSchedule(method, params);
            assertPhysicallySane(rows, params, label);
          }, (err) => { throw new Error(`${label}: ${err.message}`); });
        }
      }
    });
  }
});

describe('varredura de bordas · pares de campos de temperatura nos quatro cantos', () => {
  for (const method of REAL_METHODS) {
    test(method.id, () => {
      const base = D.defaultParams(method);
      const tempFields = method.paramSchema.filter((p) => p.unit === '°C');
      let checked = 0;
      for (let i = 0; i < tempFields.length; i++) {
        for (let j = i + 1; j < tempFields.length; j++) {
          const a = tempFields[i];
          const b = tempFields[j];
          for (const av of [a.min, a.max]) {
            for (const bv of [b.min, b.max]) {
              const params = D.sanitizeParams(method, { ...base, [a.key]: av, [b.key]: bv });
              const label = `${method.id} · ${a.key}=${av} × ${b.key}=${bv}`;
              const rows = D.computeSchedule(method, params);
              assertPhysicallySane(rows, params, label);
              checked++;
            }
          }
        }
      }
      assert.ok(checked > 0, `${method.id}: nenhum par de campos de temperatura encontrado — schema mudou?`);
    });
  }
});

describe('varredura de bordas · taxas (perda térmica e evaporação) no máximo, cruzadas com temperatura', () => {
  for (const method of REAL_METHODS) {
    test(method.id, () => {
      const base = D.defaultParams(method);
      const tempFields = method.paramSchema.filter((p) => p.unit === '°C');
      for (const rate of [
        { mashCoolingRate: 0.3 },
        { evapRatePctPerHour: 20 },
        { mashCoolingRate: 0.3, evapRatePctPerHour: 20 },
      ]) {
        for (const t of tempFields) {
          for (const edge of ['min', 'max']) {
            const params = D.sanitizeParams(method, { ...base, ...rate, [t.key]: t[edge] });
            const label = `${method.id} · ${JSON.stringify(rate)} × ${t.key}=${edge}`;
            const rows = D.computeSchedule(method, params);
            assertPhysicallySane(rows, params, label);
          }
        }
      }
    });
  }
});
