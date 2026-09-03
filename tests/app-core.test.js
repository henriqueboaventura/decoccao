// app-core.js — a lógica do cronômetro/interface que ficava presa numa
// IIFE com DOM em app.js, sem teste nenhum, apesar de ser exatamente onde
// morava a maioria dos achados graves/críticos das cinco rodadas de
// auditoria: P1 (3ª leitura), P3/N1 (repetição de alarme, 3ª/4ª leitura),
// P5/N3 (fim de programa), P6/P7 (previsto × real), N4 (fervura exibida),
// Q13 (5ª leitura, alarme ao apertar Iniciar).
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app-core.js');
const D = require('../methods.js');

describe('fmtHM / splitHM — formatação de tempo total', () => {
  test('menos de 1h mostra só minutos', () => {
    assert.equal(C.fmtHM(45), '45min');
  });
  test('1h ou mais mostra h e min, min sempre com 2 dígitos', () => {
    assert.equal(C.fmtHM(138), '2h18min');
    assert.equal(C.fmtHM(65), '1h05min');
  });
  test('arredondamento de segundos fracionários não estoura pra "60min"', () => {
    // splitHM já corrige esse carry (achado de borda comum em relógios
    // "feitos à mão"): 119,6min deveria virar 2h00min, nunca 1h60min.
    const { h, m } = C.splitHM(119.6);
    assert.equal(h, 2);
    assert.equal(m, 0);
    assert.equal(C.fmtHM(119.6), '2h00min');
  });
  test('total exatamente em hora cheia', () => {
    assert.equal(C.fmtHM(120), '2h00min');
  });
});

describe('fmtClock — relógio do cronômetro', () => {
  test('sem horas: mm:ss', () => {
    assert.equal(C.fmtClock(125), '02:05');
  });
  test('com horas: h:mm:ss', () => {
    assert.equal(C.fmtClock(3725), '1:02:05');
  });
  test('nunca mostra negativo (clampa em 0)', () => {
    assert.equal(C.fmtClock(-5), '00:00');
  });
});

describe('volumeSeverity — 3 faixas (achado N3, 2ª leitura)', () => {
  test('abaixo de 50%: normal', () => {
    assert.equal(C.volumeSeverity(0.49), 'normal');
  });
  test('50-60%: big (tranquiliza, não alarma)', () => {
    assert.equal(C.volumeSeverity(0.5), 'big');
    assert.equal(C.volumeSeverity(0.599), 'big');
  });
  test('60% ou mais: alarm', () => {
    assert.equal(C.volumeSeverity(0.6), 'alarm');
    assert.equal(C.volumeSeverity(1), 'alarm');
  });
});

describe('pseudoEspessuraSeverity — piso de 2,5 L/kg, confortável 3,0 (V1 da especificação)', () => {
  test('abaixo de 2,5: alarm', () => {
    assert.equal(C.pseudoEspessuraSeverity(2.4), 'alarm');
  });
  test('entre 2,5 e 3,0: warn', () => {
    assert.equal(C.pseudoEspessuraSeverity(2.5), 'warn');
    assert.equal(C.pseudoEspessuraSeverity(2.76), 'warn'); // padrão de fábrica da pseudo-decocção
  });
  test('3,0 ou mais: normal', () => {
    assert.equal(C.pseudoEspessuraSeverity(3.0), 'normal');
  });
});

describe('annotateDisplayBoil — o que a panela de fervura mostra em cada linha (achado N4, 2ª leitura)', () => {
  function row(overrides) {
    return { boil: null, pullsDecoction: false, returnsDecoction: false, isFinalReturn: false, ...overrides };
  }

  test('fora de qualquer puxada, a panela fica vazia (null)', () => {
    const rows = [row({}), row({})];
    C.annotateDisplayBoil(rows, 100);
    assert.equal(rows[0].displayBoil, null);
    assert.equal(rows[1].displayBoil, null);
  });

  test('puxada simples: mostra o boil real enquanto ativa, esvazia depois do retorno final', () => {
    const rows = [
      row({ pullsDecoction: true, boil: 53 }),
      row({ boil: 100 }),
      row({ returnsDecoction: true, isFinalReturn: true, boil: 100 }),
      row({}),
    ];
    C.annotateDisplayBoil(rows, 100);
    assert.equal(rows[0].displayBoil, 53);
    assert.equal(rows[1].displayBoil, 100);
    assert.equal(rows[2].displayBoil, 100);
    assert.equal(rows[3].displayBoil, null, 'depois do retorno final a panela esvaziou');
  });

  test('puxada com duas devoluções: continua mostrando fervura entre a 1ª e a 2ª adição, não "desce" pra mostura (bug original do N4)', () => {
    // Fixture do motor de verdade (Dupla Aprimorada, achado U2, 7ª
    // leitura) — não à mão. A versão anterior usava boil:100 nas linhas
    // entre as duas adições, mas o motor real devolve boil:52 ali
    // (sameBoil rastreia a mostura recém-misturada, não a fervura) — um
    // valor que fazia o ramo certo (usa fervuraTemp) e um errado (usa
    // r.boil direto) darem a MESMA resposta, então a fixture não
    // discriminava nada.
    const method = D.getMethod('dupla-aprimorada');
    const rows = D.computeSchedule(method, D.defaultParams(method));
    C.annotateDisplayBoil(rows, D.defaultParams(method).fervuraTemp);

    const primeiraAdicao = rows.findIndex((r) => r.label.includes('1ª adição'));
    const rampaProteina = primeiraAdicao + 1;
    const segundaAdicao = rows.findIndex((r) => r.label.includes('2ª adição'));

    assert.equal(rows[primeiraAdicao].boil, 52, 'pré-condição: o motor real usa 52 aqui, não 100 (senão este teste não prova nada)');
    assert.equal(rows[primeiraAdicao].displayBoil, 100, '1ª adição: painel ainda mostra a fervura, não a mostura recém-misturada');
    assert.equal(rows[rampaProteina].label, 'Rampa de proteína');
    assert.equal(rows[rampaProteina].boil, 52, 'pré-condição: idem, motor real usa 52');
    assert.equal(rows[rampaProteina].displayBoil, 100, 'entre as duas adições: painel continua mostrando fervura (achado N4)');
    assert.equal(rows[segundaAdicao].isFinalReturn, true);
    assert.equal(rows[segundaAdicao].displayBoil, rows[segundaAdicao].boil, '2ª adição (a final): mostra o boil de verdade');
    assert.equal(rows[segundaAdicao + 1].displayBoil, null, 'só depois da última devolução a panela esvazia');
  });
});

describe('isTimerStarted / computeActiveStepIndex / computeIsTimerFinished', () => {
  test('cronômetro nunca iniciado: não começou', () => {
    const timer = { running: false, accumulatedMs: 0, actualStepEndMin: [] };
    assert.equal(C.isTimerStarted(timer), false);
    assert.equal(C.computeActiveStepIndex(timer, 11), -1);
  });

  test('rodando: começou, mesmo sem nenhuma etapa confirmada ainda', () => {
    const timer = { running: true, accumulatedMs: 0, actualStepEndMin: [] };
    assert.equal(C.isTimerStarted(timer), true);
    assert.equal(C.computeActiveStepIndex(timer, 11), 0);
  });

  test('pausado com tempo acumulado: continua "começado" (achado P5, botão não devia virar "Iniciar" de novo)', () => {
    const timer = { running: false, accumulatedMs: 60000, actualStepEndMin: [] };
    assert.equal(C.isTimerStarted(timer), true);
  });

  test('activeStepIndex nunca passa de rowsLength (aí é isTimerFinished, não uma etapa)', () => {
    const timer = { running: false, accumulatedMs: 1, actualStepEndMin: [0, 20, 25, 32.5, 42.5, 58.5, 73.5, 78.5, 123.5, 128, 138] };
    assert.equal(C.computeActiveStepIndex(timer, 11), 11);
    assert.equal(C.computeIsTimerFinished(11, timer.actualStepEndMin.length), true);
  });

  test('11 confirmadas de 14 etapas: ainda não terminou', () => {
    assert.equal(C.computeIsTimerFinished(14, 11), false);
  });

  test('13 de 14 confirmadas — a última faltando por um: ainda não terminou (achado U4, 7ª leitura)', () => {
    // A fronteira que importa de verdade: um mutante que declarasse o
    // programa concluído uma etapa antes do fim (achado S1) passava pelos
    // outros casos (11/14, 11/11, 0/0) sem ser pego — só o "falta
    // exatamente uma" discrimina ">=" de ">" no ponto onde alguém
    // realmente ia notar, no meio de uma brassagem de verdade.
    assert.equal(C.computeIsTimerFinished(14, 13), false);
  });

  test('0 etapas no total: nunca "terminado" (programa vazio não é um estado válido de conclusão)', () => {
    assert.equal(C.computeIsTimerFinished(0, 0), false);
  });
});

describe('computeEffectiveRows — desloca o plano pelo atraso/adiantamento acumulado (achado P1, 3ª leitura)', () => {
  const plan = [
    { label: 'Mash In', totalMin: 0 },
    { label: 'Rampa', totalMin: 20 },
    { label: 'Transferência', totalMin: 25 },
    { label: 'Sacarificação', totalMin: 45 },
  ];

  test('nada confirmado ainda: devolve o plano original sem tocar', () => {
    const result = C.computeEffectiveRows(plan, []);
    assert.equal(result, plan, 'sem nenhuma confirmação, é o mesmo array — não recria à toa');
  });

  test('em dia (real bate com previsto): etapas futuras continuam com o horário original', () => {
    const result = C.computeEffectiveRows(plan, [0, 20]);
    assert.equal(result[2].totalMin, 25, 'sem atraso, a 3ª etapa mantém o previsto');
    assert.equal(result[3].totalMin, 45);
  });

  test('atraso de 10min na 2ª etapa desloca TODAS as etapas futuras pelo mesmo atraso (o próprio achado P1)', () => {
    // Confirmou a 2ª etapa (previsto 20min) só aos 30min reais — 10min de atraso.
    const result = C.computeEffectiveRows(plan, [0, 30]);
    // Índice 0 é o único onde real (0) e previsto+atraso (0+10=10)
    // DIVERGEM — sem esta linha, uma implementação errada que aplicasse
    // "previsto+atraso" até em etapas JÁ confirmadas passava despercebida,
    // porque no índice 1 as duas fórmulas dão 30 por coincidência (achado
    // U3, 7ª leitura).
    assert.equal(result[0].totalMin, 0, 'etapa já confirmada (Mash In) usa o horário REAL, não previsto+atraso');
    assert.equal(result[1].totalMin, 30, 'etapa já confirmada usa o horário REAL');
    assert.equal(result[2].totalMin, 35, '25 previsto + 10 de atraso');
    assert.equal(result[3].totalMin, 55, '45 previsto + 10 de atraso — cabeçalho e escada têm que concordar nisso');
  });

  test('adiantamento (real menor que previsto) desloca pra trás, não só atraso', () => {
    const result = C.computeEffectiveRows(plan, [0, 15]); // 5min adiantado
    assert.equal(result[2].totalMin, 20);
    assert.equal(result[3].totalMin, 40);
  });

  test('duration de cada linha é recalculada a partir do totalMin deslocado, nunca negativa', () => {
    const result = C.computeEffectiveRows(plan, [0, 30]);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i].duration >= 0, `duração negativa em "${result[i].label}"`);
      assert.ok(Math.abs(result[i].duration - (result[i].totalMin - result[i - 1].totalMin)) < 1e-9);
    }
  });
});

describe('nextAlarmState — repetição e teto do alarme (achado N1, 4ª leitura, e Q13, 5ª leitura)', () => {
  // As constantes de verdade (achado U1, 7ª leitura): usar literais aqui
  // em vez de C.ALARM_MAX_REPEATS/C.ALARM_REPEAT_EVERY_MIN deixava um
  // mutante trocar o teto de 4 pra 1 (o achado N1 inteiro voltando) sem
  // nenhum teste falhar — porque o teste testava o PRÓPRIO número
  // hardcoded, nunca o que o app.js de fato importa e usa.
  test('as constantes exportadas são as que o app.js espera', () => {
    assert.equal(C.ALARM_MAX_REPEATS, 4, 'mudou o teto de repetições do alarme — confirme que é intencional');
    assert.equal(C.ALARM_REPEAT_EVERY_MIN, 2, 'mudou o intervalo entre repetições — confirme que é intencional');
  });
  const baseOpts = {
    running: true, finished: false, activeIndex: 10, rowsLength: 11,
    targetTotalMin: 138, maxRepeats: C.ALARM_MAX_REPEATS, repeatEveryMin: C.ALARM_REPEAT_EVERY_MIN,
  };

  test('etapa 0 (duração zero) nunca dispara — nem no instante de apertar "Iniciar" (Q13)', () => {
    const result = C.nextAlarmState(C.defaultAlarmState(), { ...baseOpts, activeIndex: 0, targetTotalMin: 0, nowMin: 0 });
    assert.equal(result.fire, false);
  });

  test('antes do previsto: não dispara', () => {
    const result = C.nextAlarmState(C.defaultAlarmState(), { ...baseOpts, nowMin: 137 });
    assert.equal(result.fire, false);
  });

  test('no instante exato do previsto: dispara e conta 1', () => {
    const result = C.nextAlarmState(C.defaultAlarmState(), { ...baseOpts, nowMin: 138 });
    assert.equal(result.fire, true);
    assert.equal(result.alarmState.count, 1);
    assert.equal(result.alarmState.lastAtMin, 138);
  });

  test('acumula o bug do N1: nowMin travado no fim do plano (cap) fazia o alarme nunca repetir na última etapa — aqui nowMin não tem teto, então repete', () => {
    // Simula o achado exato: disparos a cada 2min, sem limitar nowMin ao
    // fim do cronograma (era isso que zerava nowMin-lastAtMin pra sempre).
    let alarm = C.defaultAlarmState();
    const disparos = [];
    for (const nowMin of [138, 139, 140, 141.9, 142, 143.9, 144, 200]) {
      const result = C.nextAlarmState(alarm, { ...baseOpts, nowMin });
      alarm = result.alarmState;
      if (result.fire) disparos.push(nowMin);
    }
    // dispara em 138, 140, 142, 144 (a cada 2min) — mas para no teto de 4,
    // mesmo que nowMin continue subindo até 200 (não fica preso, mas
    // também não dispara pra sempre).
    assert.deepEqual(disparos, [138, 140, 142, 144]);
    assert.equal(alarm.count, 4);
  });

  test('teto de repetições: não passa de maxRepeats mesmo com nowMin crescendo indefinidamente', () => {
    let alarm = { index: 10, count: 4, lastAtMin: 144 };
    const result = C.nextAlarmState(alarm, { ...baseOpts, nowMin: 500 });
    assert.equal(result.fire, false, 'já bateu o teto, não dispara de novo');
  });

  test('trocar de etapa ativa reseta a contagem do alarme', () => {
    const alarmNaEtapaAnterior = { index: 5, count: 4, lastAtMin: 80 };
    const result = C.nextAlarmState(alarmNaEtapaAnterior, { ...baseOpts, activeIndex: 6, targetTotalMin: 90, nowMin: 90 });
    assert.equal(result.fire, true, 'etapa nova, contagem zerada, deveria poder disparar de novo');
    assert.equal(result.alarmState.count, 1);
    assert.equal(result.alarmState.index, 6);
  });

  test('cronômetro pausado (running=false) nunca dispara', () => {
    const result = C.nextAlarmState(C.defaultAlarmState(), { ...baseOpts, running: false, nowMin: 200 });
    assert.equal(result.fire, false);
  });

  test('programa concluído (finished=true) nunca dispara', () => {
    const result = C.nextAlarmState(C.defaultAlarmState(), { ...baseOpts, finished: true, nowMin: 200 });
    assert.equal(result.fire, false);
  });

  test('nowMin null (timer não iniciado) nunca dispara', () => {
    const result = C.nextAlarmState(C.defaultAlarmState(), { ...baseOpts, nowMin: null });
    assert.equal(result.fire, false);
  });
});
