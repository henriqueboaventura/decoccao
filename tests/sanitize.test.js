// sanitizeParams — a defesa contra os achados C1 (Raio-X, 1ª leitura) e N1
// (Segunda Leitura): um valor fora de [min,max] tem que ser sempre
// grampeado antes de chegar em computeSchedule, não só quando digitado no
// formulário. Os casos de contorno abaixo são os mesmos que as duas
// leituras rodaram manualmente na ferramenta (localStorage editado à mão,
// simulando autosave de versão antiga / predefinição / JSON importado).
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../methods.js');

describe('sanitizeParams: clampa pro [min,max] do próprio paramSchema', () => {
  for (const method of D.METHODS) {
    test(`${method.id}: todo campo sanitizado fica dentro do seu min/max`, () => {
      const wild = {};
      for (const p of method.paramSchema) wild[p.key] = p.max * 1000 + 999; // bem acima do máximo
      const clean = D.sanitizeParams(method, wild);
      for (const p of method.paramSchema) {
        assert.ok(clean[p.key] <= p.max && clean[p.key] >= p.min, `${p.key}: ${clean[p.key]} fora de [${p.min},${p.max}]`);
        assert.equal(clean[p.key], p.max, `${p.key}: valor acima do máximo deveria grampear exatamente no máximo`);
      }
    });

    test(`${method.id}: valor abaixo do mínimo grampeia no mínimo`, () => {
      const wild = {};
      for (const p of method.paramSchema) wild[p.key] = p.min - 1000;
      const clean = D.sanitizeParams(method, wild);
      for (const p of method.paramSchema) {
        assert.equal(clean[p.key], p.min, `${p.key}: valor abaixo do mínimo deveria grampear exatamente no mínimo`);
      }
    });
  }
});

describe('sanitizeParams: casos de contorno específicos dos dois primeiros PDFs (C1/N1)', () => {
  const method = D.getMethod('simples');

  test('waterVolume=-50 (Raio-X §3.3): não gera puxada negativa nem NaN', () => {
    const params = D.sanitizeParams(method, { ...D.defaultParams(method), waterVolume: -50 });
    assert.equal(params.waterVolume, method.paramSchema.find((p) => p.key === 'waterVolume').min);
    const rows = D.computeSchedule(method, params);
    for (const r of rows) {
      assert.ok(Number.isFinite(r.mash), `mash inválido em "${r.label}"`);
      if (r.decoctionVolumeL !== undefined) assert.ok(r.decoctionVolumeL >= 0, 'volume de puxada negativo');
    }
  });

  test('heatingRate=0 (Raio-X §3.3): não gera duração infinita nem total absurdo', () => {
    const params = D.sanitizeParams(method, { ...D.defaultParams(method), heatingRate: 0 });
    assert.ok(params.heatingRate > 0, 'heatingRate zerado deveria grampear pro mínimo do campo, nunca ficar em 0');
    const rows = D.computeSchedule(method, params);
    const total = rows[rows.length - 1].totalMin;
    assert.ok(Number.isFinite(total) && total > 0 && total < 1000, `total suspeito: ${total}`);
  });

  test('valor não-numérico (string, undefined, NaN) cai no default do campo', () => {
    const params = D.sanitizeParams(method, { ...D.defaultParams(method), grainWeight: 'abacate', mashOutTemp: undefined, transferTime: NaN });
    const schema = Object.fromEntries(method.paramSchema.map((p) => [p.key, p]));
    assert.equal(params.grainWeight, schema.grainWeight.default);
    assert.equal(params.mashOutTemp, schema.mashOutTemp.default);
    assert.equal(params.transferTime, schema.transferTime.default);
  });

  test('parâmetro ausente do objeto (campo que não existia numa versão anterior do app) cai no default', () => {
    const partial = { waterVolume: 25 }; // só um campo, o resto nunca existiu nesse "localStorage salvo"
    const params = D.sanitizeParams(method, partial);
    assert.equal(params.waterVolume, 25, 'campo presente deveria ser preservado');
    const rows = D.computeSchedule(method, params); // não deveria lançar
    assert.ok(rows.length > 0);
  });

  test('objeto vazio sanitiza pro default inteiro do método', () => {
    const params = D.sanitizeParams(method, {});
    assert.deepEqual(params, D.defaultParams(method));
  });
});

describe('sanitizeParams: idempotente (sanitizar de novo não muda nada)', () => {
  for (const method of D.METHODS) {
    test(method.id, () => {
      const once = D.sanitizeParams(method, D.defaultParams(method));
      const twice = D.sanitizeParams(method, once);
      assert.deepEqual(once, twice);
    });
  }
});
