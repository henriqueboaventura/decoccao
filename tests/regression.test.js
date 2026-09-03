// Ancoragem: para cada um dos 8 métodos, com os parâmetros padrão de
// fábrica, os números abaixo (tempo total, nº de etapas, cada puxada) são
// os valores golden — validados rodada após rodada de auditoria externa
// (ver CHANGELOG.md) e conferidos à mão contra a literatura citada em cada
// método (Kunze, Narziß, Braukaiser Wiki, Briggs et al.).
//
// Se um teste aqui falhar depois de uma mudança em methods.js, o motor
// mudou de comportamento pro caso PADRÃO — o caso que todo usuário vê ao
// abrir o app pela primeira vez. Isso é sempre intencional (uma correção
// documentada) ou sempre um bug (uma regressão). Nunca "só um número
// mudou" — atualize o valor aqui SÓ depois de confirmar qual dos dois é,
// e diga por quê no commit.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../methods.js');

// Tolerância de ponto flutuante — não de arredondamento de exibição. Os
// cálculos usam divisão de verdade (ex.: aquecer 1/3 de grau por minuto),
// então dois caminhos matematicamente idênticos podem divergir no bit menos
// significativo.
const EPS = 1e-6;

const GOLDEN = {
  'simples': { steps: 11, totalMin: 138, pulls: [{ vol: 6.4585, frac: 0.2766 }] },
  'dupla-tradicional': { steps: 16, totalMin: 146.5, pulls: [{ vol: 6.3240, frac: 0.2708 }, { vol: 6.6714, frac: 0.2857 }] },
  'dupla-moderna': { steps: 16, totalMin: 154.5, pulls: [{ vol: 11.1362, frac: 0.4769 }, { vol: 6.8676, frac: 0.2941 }] },
  'hochkurz': { steps: 14, totalMin: 144.5, pulls: [{ vol: 5.5303, frac: 0.2368 }, { vol: 4.0259, frac: 0.1724 }] },
  'boaventura': { steps: 9, totalMin: 94, pulls: [{ vol: 4.0259, frac: 0.1724 }] },
  'dupla-aprimorada': { steps: 16, totalMin: 202.5, pulls: [{ vol: 11.1362, frac: 0.4769 }, { vol: 6.8676, frac: 0.2941 }] },
  'tripla-tradicional': { steps: 21, totalMin: 152 + 1 / 3, pulls: [{ vol: 6.1069, frac: 0.2615 }, { vol: 6.3240, frac: 0.2708 }, { vol: 6.6714, frac: 0.2857 }] },
  'pseudo-decoccao': { steps: 14, totalMin: 164.5, pulls: [] },
};

describe('regressão · totais e puxadas com parâmetros de fábrica', () => {
  for (const [id, golden] of Object.entries(GOLDEN)) {
    test(id, () => {
      const method = D.getMethod(id);
      assert.equal(method.id, id, `método "${id}" não está registrado em METHODS`);
      const rows = D.computeSchedule(method, D.defaultParams(method));

      assert.equal(rows.length, golden.steps, 'número de etapas');
      assert.ok(
        Math.abs(rows[rows.length - 1].totalMin - golden.totalMin) < EPS,
        `tempo total: got ${rows[rows.length - 1].totalMin}, want ${golden.totalMin}`
      );

      const pulls = rows.filter((r) => r.decoctionVolumeL !== undefined);
      assert.equal(pulls.length, golden.pulls.length, 'número de puxadas');
      pulls.forEach((r, i) => {
        assert.ok(
          Math.abs(r.decoctionVolumeL - golden.pulls[i].vol) < 1e-3,
          `puxada ${i}: volume got ${r.decoctionVolumeL}, want ${golden.pulls[i].vol}`
        );
        assert.ok(
          Math.abs(r.decoctionFraction - golden.pulls[i].frac) < 1e-3,
          `puxada ${i}: fração got ${r.decoctionFraction}, want ${golden.pulls[i].frac}`
        );
      });
    });
  }
});

describe('regressão · Dupla Aprimorada, volume de cada adição parcial (N9)', () => {
  test('duas adições somam exatamente o total da puxada', () => {
    const method = D.getMethod('dupla-aprimorada');
    const rows = D.computeSchedule(method, D.defaultParams(method));
    const returns = rows.filter((r) => r.returnVolumeL !== undefined);
    assert.equal(returns.length, 2);
    assert.ok(Math.abs(returns[0].returnVolumeL - 4.3257) < 1e-3, `1ª adição: ${returns[0].returnVolumeL}`);
    assert.ok(Math.abs(returns[1].returnVolumeL - 6.8104) < 1e-3, `2ª adição: ${returns[1].returnVolumeL}`);
    const pull = rows.find((r) => r.returnParts > 1);
    const sum = returns.reduce((s, r) => s + r.returnVolumeL, 0);
    assert.ok(Math.abs(sum - pull.decoctionVolumeL) < EPS, 'soma das partes deve bater com o total da puxada, exatamente');
  });
});

describe('S5 (7ª leitura): samePlateau também agrupa patamares declarados que calham de bater em valor', () => {
  test('1ª e 2ª adição da Dupla Aprimorada com a MESMA temperatura viram um único patamar real', () => {
    const method = D.getMethod('dupla-aprimorada');
    const params = { ...D.defaultParams(method), proteinRestTemp: 52, saccRestTemp: 52 };
    const rows = D.computeSchedule(method, params);
    const primeiraAdicao = rows.findIndex((r) => r.label.includes('1ª adição'));
    const segundaAdicao = rows.findIndex((r) => r.label.includes('2ª adição'));
    // pré-condição: as duas etapas realmente batem em valor, senão o teste não prova nada
    assert.equal(rows[primeiraAdicao].mash, rows[segundaAdicao].mash, 'pré-condição: mesma temperatura nas duas adições');
    assert.equal(rows[segundaAdicao].samePlateau, true, '2ª adição declara valor explícito, mas é o MESMO da 1ª — fisicamente o mesmo patamar');
    // sem a correção do S5, a 2ª adição começava um grupo NOVO — o tempo real
    // marcado na "Rampa de proteína" pararia em 18min (só ela mesma), sem
    // somar o que vem depois (2ª adição, rampa de sacarificação etc., tudo
    // ainda a 52°C). Com o grupo unido, soma até o fim do patamar de verdade.
    const rampaProteina = rows.findIndex((r) => r.label === 'Rampa de proteína');
    assert.equal(rows[rampaProteina].realPlateauMin, 102, 'tempo real do patamar unido (proteína + 2ª adição + sacarificação)');
    assert.equal(rows[segundaAdicao].realPlateauMin, undefined, '2ª adição não deve mais marcar um patamar próprio — foi engolida no grupo anterior');
  });

  test('com temperaturas diferentes (padrão de fábrica), continuam em grupos separados — zero regressão', () => {
    const method = D.getMethod('dupla-aprimorada');
    const rows = D.computeSchedule(method, D.defaultParams(method));
    const segundaAdicao = rows.findIndex((r) => r.label.includes('2ª adição'));
    assert.equal(rows[segundaAdicao].samePlateau, false, 'temperaturas diferentes por padrão — continua sendo um patamar novo');
  });
});
