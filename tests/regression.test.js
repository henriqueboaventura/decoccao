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
  // totalMin 109, não mais 94: fervura da decocção subiu de 15 pra 30min
  // ("Uma Decocção Só", nota externa, décima primeira leitura) — volume e
  // fração da puxada não mudam (não dependem do tempo de fervura).
  'boaventura': { steps: 9, totalMin: 109, pulls: [{ vol: 4.0259, frac: 0.1724 }] },
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

// Décima leitura (§5): a cobertura por mutação achou 5 mutantes que a
// suíte não percebia — as correções da nona/décima leitura entraram sem
// teste próprio. Os três abaixo fecham 4 dos 5 (o quinto exige uma
// fixture de escada rodando o app inteiro, fora do escopo de um teste de
// motor puro).
describe('décima leitura: W6 — programa fisicamente impossível é recusado', () => {
  test('Simples, empastar 50°C com retorno pedindo 40°C: retorno esfriaria a mostura, recusado com a faixa possível', () => {
    const method = D.getMethod('simples');
    const params = D.sanitizeParams(method, { ...D.defaultParams(method), mashInTemp: 50, mashTemp2: 40 });
    const rows = D.computeSchedule(method, params);
    // Mata M27 (desliga a recusa inteira) e M28 (só recusa alvo ALTO,
    // aceita o que esfria a mostura — exatamente este caso).
    assert.ok(rows.decoctionUnreachable, 'deveria recusar: retorno de 40°C é MENOR que a mostura no instante da puxada (50°C)');
    assert.deepEqual(rows.decoctionUnreachable, {
      stepLabel: 'Transferência Fervura → Mostura',
      target: 40,
      minTarget: 50,
      maxTarget: 100,
      targetKey: 'mashTemp2',
    });
  });
});

describe('décima leitura: V2 — identidade de patamar com a perda térmica ligada, linha a linha', () => {
  test('Simples, mashCoolingRate 0,1: temperatura e agrupamento de cada uma das 11 linhas', () => {
    const method = D.getMethod('simples');
    const params = { ...D.defaultParams(method), mashCoolingRate: 0.1 };
    const rows = D.computeSchedule(method, params);
    // Golden linha a linha — não só o total. `step.mash === sameMash` já
    // decide sozinho a maioria destas linhas (curto-circuito do OR), então
    // isto NÃO mata o M25 (ver o teste da Dupla Aprimorada logo abaixo pra
    // isso) — mas fecha qualquer mutação que desloque uma duração ou
    // temperatura em UMA linha do grupo antes do retorno. Valores abaixo
    // já refletem o Y4 (décima primeira leitura): a perda térmica agora
    // conta em TODA etapa parada, não só na janela da decocção — por isso
    // "Rampa de proteína" (antes da puxada) e "Rampa de sacarificação"/
    // "Mash Out" (depois do retorno final) também esfriam aqui, o que não
    // acontecia antes desta versão.
    const GOLDEN = [
      { label: 'Mash In', mash: 53, samePlateau: false },
      { label: 'Rampa de proteína', mash: 51, samePlateau: true },
      { label: 'Transferência Mostura → Fervura', mash: 50.5, samePlateau: true },
      { label: 'Aquecimento até a sacarificação', mash: 49.65, samePlateau: true },
      { label: 'Sacarificação da decocção', mash: 48.65, samePlateau: true },
      { label: 'Aquecimento até a fervura', mash: 47.05, samePlateau: true },
      { label: 'Decocção (fervura)', mash: 45.55, samePlateau: true },
      { label: 'Transferência Fervura → Mostura', mash: 66, samePlateau: false },
      { label: 'Rampa de sacarificação', mash: 61.5, samePlateau: true },
      { label: 'Aquecimento Mash Out', mash: 75, samePlateau: false },
      { label: 'Mash Out', mash: 74, samePlateau: true },
    ];
    assert.equal(rows.length, GOLDEN.length, 'número de etapas');
    rows.forEach((r, i) => {
      assert.equal(r.label, GOLDEN[i].label, `linha ${i}: rótulo`);
      assert.ok(Math.abs(r.mash - GOLDEN[i].mash) < EPS, `linha ${i} (${r.label}): mash got ${r.mash}, want ${GOLDEN[i].mash}`);
      assert.equal(r.samePlateau, GOLDEN[i].samePlateau, `linha ${i} (${r.label}): samePlateau`);
    });
    assert.equal(rows[1].realPlateauMin, 74.5, 'tempo real do patamar (Rampa de proteína)');
  });

  test('Dupla Aprimorada, Mash Out = Temp. de sacarificação (66°C) com mashCoolingRate 0,1: patamar continua unido depois de 4 etapas sameMash', () => {
    // O curto-circuito de `step.mash === sameMash` não protege a linha do
    // "Transferência Fervura → Mostura" final (mashOutTemp): ela é um
    // passo de valor EXPLÍCITO, como "2ª adição" (saccRestTemp) — a
    // comparação passa mesmo pela declaredMash. Entre as duas, quatro
    // etapas sameMash consecutivas ("Rampa de sacarificação",
    // "Transferência da 2ª decocção...", "Aquecimento da 2ª decocção",
    // "Fervura da 2ª decocção") — o número de hops que M25 (identidade
    // volta a comparar contra o valor já resfriado da linha anterior, um
    // passo por vez) precisa pra descolar. Forçando mashOutTemp = o mesmo
    // valor de saccRestTemp (o truque do S5, agora com a perda ligada):
    // com a identidade certa, as duas continuam o MESMO patamar; com o
    // M25, a comparação desliza pra um valor drenado por 3 perdas
    // acumuladas e as separa — "separação falsa" de um patamar constante.
    const method = D.getMethod('dupla-aprimorada');
    const base = D.defaultParams(method);
    const params = { ...base, mashOutTemp: base.saccRestTemp, mashCoolingRate: 0.1 };
    const rows = D.computeSchedule(method, params);
    const segundaAdicao = rows.findIndex((r) => r.label.includes('2ª adição'));
    const mashOutReturn = rows.findIndex((r) => r.label === 'Transferência Fervura → Mostura');
    // pré-condição: os dois de fato declaram o mesmo valor, senão o teste não prova nada
    assert.equal(rows[mashOutReturn].mash, base.saccRestTemp, 'pré-condição: mashOutTemp foi setado igual a saccRestTemp');
    assert.equal(rows[segundaAdicao].samePlateau, false, '"2ª adição" começa um patamar novo (valor explícito, ainda sem coincidência anterior)');
    assert.equal(rows[mashOutReturn].samePlateau, true, 'mashOutTemp === saccRestTemp: fisicamente o MESMO patamar, mesmo depois de 4 etapas sameMash com perda acumulada');
    const rampaSacc = rows.findIndex((r) => r.label === 'Rampa de sacarificação');
    assert.equal(rows[rampaSacc].realPlateauMin, 87, 'tempo real do patamar unido (sacarificação + 2ª decocção inteira + retorno final + Mash Out)');
  });
});

describe('décima leitura: W1 — guarda unilateral não marca quando o real é MENOR que o declarado', () => {
  test('Boaventura, Tempo de Mash Out = 0: a linha de retorno não ganha realPlateauMin', () => {
    const method = D.getMethod('boaventura');
    const params = { ...D.defaultParams(method), mashOutTime: 0 };
    const rows = D.computeSchedule(method, params);
    const retorno = rows.findIndex((r) => r.label === 'Transferência Fervura → Mostura (Mash Out)');
    // Grupo [retorno, "Mash Out" (duração 0)]: sem etapa "Rampa " no meio,
    // o alvo da anotação fica no próprio retorno — cuja duração
    // (transferTime, > 0) fica DE FORA da soma (só i+1..j-1 entram). Real
    // (0) < declarado (transferTime): com a guarda `Math.abs` (M26), a
    // diferença ainda passa do limiar e marca a linha por engano; com a
    // guarda unilateral, real menor que declarado nunca marca.
    assert.equal(rows[retorno].realPlateauMin, undefined, 'real (0min de "Mash Out") é MENOR que o declarado (transferTime) — não deveria marcar');
  });
});

describe('décima primeira leitura: Y1 (grave) — perda térmica não desce abaixo de zero', () => {
  test('Dupla Moderna, taxa bruta 1°C/min (bypassando o teto do schema): nenhuma linha fica negativa', () => {
    const method = D.getMethod('dupla-moderna');
    // Bypassa sanitizeParams de propósito — é exatamente o piso do motor
    // que este teste cobre, não o teto do campo (esse é o Y1_max abaixo).
    const rows = D.computeSchedule(method, { ...D.defaultParams(method), mashCoolingRate: 1 });
    const mashValues = rows.filter((r) => r.mash !== null && r.mash !== undefined).map((r) => r.mash);
    assert.ok(mashValues.every((m) => m >= 0), `nenhuma linha deveria ficar negativa: ${JSON.stringify(mashValues)}`);
    assert.ok(mashValues.some((m) => m === 0), 'com taxa 1°C/min o piso deveria ser atingido (senão o teste não prova nada)');
  });

  test('sanitizeParams clampa mashCoolingRate pro novo teto (0,3°C/min) nos sete métodos reais', () => {
    for (const method of D.METHODS) {
      if (method.id === 'pseudo-decoccao') continue;
      const sanitized = D.sanitizeParams(method, { mashCoolingRate: 1 });
      assert.equal(sanitized.mashCoolingRate, 0.3, `${method.id}: taxa bruta 1 deveria clampar pra 0.3`);
    }
  });
});

describe('décima primeira leitura: Y2 (grave) — 2ª adição parcial não pede um alvo abaixo do que a 1ª já alcançou', () => {
  test('Dupla Aprimorada, 1ª adição a 52°C e 2ª adição pedindo 40°C: recusado, com o piso sendo a 1ª adição (não a puxada original)', () => {
    const method = D.getMethod('dupla-aprimorada');
    const params = { ...D.defaultParams(method), proteinRestTemp: 52, saccRestTemp: 40 };
    const rows = D.computeSchedule(method, params);
    assert.ok(rows.decoctionUnreachable, '40°C é menor que os 52°C que a 1ª adição já deixou na tina — deveria recusar');
    assert.deepEqual(rows.decoctionUnreachable, {
      stepLabel: '2ª adição (Fervura → Mostura)',
      target: 40,
      minTarget: 52,
      maxTarget: 100,
      targetKey: 'saccRestTemp',
    });
  });
});

describe('décima primeira leitura: Y3 (grave) — a panela de fervura não esfria sozinha de graça', () => {
  test('Simples, sacarificação da decocção a 40°C (abaixo da mostura, 53°C): recusado, não duração 0', () => {
    const method = D.getMethod('simples');
    const params = { ...D.defaultParams(method), decoccao1SaccTemp: 40 };
    const rows = D.computeSchedule(method, params);
    assert.ok(rows.decoctionUnreachable, 'alvo de aquecimento da panela abaixo da temperatura atual dela é impossível sem resfriamento ativo');
    assert.deepEqual(rows.decoctionUnreachable, {
      stepLabel: 'Aquecimento até a sacarificação',
      target: 40,
      minTarget: 53,
      maxTarget: 100,
      targetKey: 'decoccao1SaccTemp',
    });
  });
});

describe('décima primeira leitura: Y5 — evaporação da fervura da decocção', () => {
  test('Simples, padrão (0%/h): evaporatedL é sempre 0 e decoctionVolumeL não muda', () => {
    const method = D.getMethod('simples');
    const rows = D.computeSchedule(method, D.defaultParams(method));
    const pull = rows.find((r) => r.pullsDecoction);
    assert.equal(pull.evapFraction, 0);
    assert.equal(pull.evaporatedL, 0);
    assert.ok(Math.abs(pull.decoctionVolumeL - 6.4585) < 1e-3, 'volume puxado idêntico ao golden de fábrica (regression.test.js)');
  });

  test('Simples, 10%/h: reduz o volume que RETORNA, sem mudar o volume PUXADO', () => {
    const method = D.getMethod('simples');
    const base = D.computeSchedule(method, D.defaultParams(method));
    const withEvap = D.computeSchedule(method, { ...D.defaultParams(method), evapRatePctPerHour: 10 });
    const pullBase = base.find((r) => r.pullsDecoction);
    const pullEvap = withEvap.find((r) => r.pullsDecoction);
    assert.ok(Math.abs(pullBase.decoctionVolumeL - pullEvap.decoctionVolumeL) < 1e-9, 'o que é PUXADO não muda com evaporação — só o que volta');
    assert.ok(pullEvap.evaporatedL > 0, 'com taxa > 0 e fervura > 0min, algo tem que evaporar');
    // boilMin conta só o tempo em fervura PLENA (15min, "Decocção
    // (fervura)") — não a rampa de aquecimento até lá. 10%/h × 15min/60 =
    // 2,5% de 6,4585L.
    assert.equal(pullEvap.boilMin, 15, 'só a etapa que já estava em fervura antes de começar, não a que rampeia até lá');
    assert.ok(Math.abs(pullEvap.evaporatedL - 0.1615) < 1e-3, `evaporatedL: got ${pullEvap.evaporatedL}`);
  });

  test('Dupla Aprimorada, 10%/h: a soma das adições parciais bate com o volume puxado menos o evaporado', () => {
    const method = D.getMethod('dupla-aprimorada');
    const rows = D.computeSchedule(method, { ...D.defaultParams(method), evapRatePctPerHour: 10 });
    const pull = rows.find((r) => r.pullsDecoction);
    const returns = rows.filter((r) => r.returnVolumeL !== undefined);
    const sum = returns.reduce((s, r) => s + r.returnVolumeL, 0);
    assert.ok(Math.abs(sum - (pull.decoctionVolumeL - pull.evaporatedL)) < 1e-9,
      `soma das adições (${sum}) deveria bater com puxado (${pull.decoctionVolumeL}) menos evaporado (${pull.evaporatedL})`);
  });
});

describe('"Uma Decocção Só" (nota externa): carga térmica — golden dos sete métodos, padrões de fábrica', () => {
  // carga = Σ (fração puxada em % × minutos em fervura PLENA), por puxada.
  // `boilMin` só conta a etapa que JÁ ESTAVA em fervura antes de começar
  // (a de fervura de verdade) — não a rampa que aquece até lá; um bug
  // nessa distinção (contando a rampa também) inflava a carga de todo
  // método em 2-3x antes deste teste existir. Números batem com a tabela
  // "Carga térmica dos sete métodos" do documento.
  const GOLDEN_CARGA = {
    'boaventura': 517,
    'hochkurz': 327,
    'simples': 415,
    'tripla-tradicional': 1217,
    'dupla-tradicional': 1241,
    'dupla-aprimorada': 1395,
    'dupla-moderna': 1872,
  };
  for (const [id, want] of Object.entries(GOLDEN_CARGA)) {
    test(id, () => {
      const method = D.getMethod(id);
      const rows = D.computeSchedule(method, D.defaultParams(method));
      const pulls = rows.filter((r) => r.decoctionVolumeL !== undefined);
      const carga = pulls.reduce((sum, r) => sum + r.decoctionFraction * 100 * (r.boilMin || 0), 0);
      assert.ok(Math.abs(carga - want) < 1, `carga térmica: got ${carga}, want ${want}`);
    });
  }

  test('Hochkurz é o de menor carga térmica dos sete depois do Boaventura subir pra 30min; Dupla Moderna, o maior', () => {
    // Antes da recomendação do documento (fervura do Boaventura 15→30min),
    // o Boaventura era o menor (259). Depois de segui-la, ele sobe pra
    // 517 — ainda o programa mais RÁPIDO do app, mas não mais o de menor
    // carga: o Hochkurz (327, duas fervuras curtas de 8min) assume esse
    // posto. Esperado — é exatamente a troca que a recomendação fazia.
    const cargas = Object.entries(GOLDEN_CARGA).map(([id, carga]) => ({ id, carga }));
    const min = cargas.reduce((a, b) => (a.carga < b.carga ? a : b));
    const max = cargas.reduce((a, b) => (a.carga > b.carga ? a : b));
    assert.equal(min.id, 'hochkurz');
    assert.equal(max.id, 'dupla-moderna');
  });
});
