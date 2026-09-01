(function () {
  "use strict";

  const { METHODS, getMethod, defaultParams, computeSchedule, totalMashVolumeL } = window.Decoccao;
  const STORAGE_PREFIX = "decoccao:v1";
  const CURRENT_KEY = (id) => `${STORAGE_PREFIX}:current:${id}`;
  const PRESETS_KEY = `${STORAGE_PREFIX}:presets`;
  const LAST_METHOD_KEY = `${STORAGE_PREFIX}:lastMethod`;
  const TIMER_KEY = (id) => `${STORAGE_PREFIX}:timer:${id}`;
  const THEME_KEY = `${STORAGE_PREFIX}:theme`;

  const el = {
    methodTabs: document.getElementById("methodTabs"),
    methodSelect: document.getElementById("methodSelect"),
    methodDescription: document.getElementById("methodDescription"),
    methodSource: document.getElementById("methodSource"),
    themeToggle: document.getElementById("themeToggle"),
    srAnnouncer: document.getElementById("srAnnouncer"),
    form: document.getElementById("paramsForm"),
    ladder: document.getElementById("ladder"),
    chart: document.getElementById("chart"),
    totalTime: document.getElementById("totalTime"),
    stepCount: document.getElementById("stepCount"),
    mashVolumeWrap: document.getElementById("mashVolumeWrap"),
    mashVolume: document.getElementById("mashVolume"),
    maxPullWrap: document.getElementById("maxPullWrap"),
    maxPull: document.getElementById("maxPull"),
    timerPanel: document.querySelector(".timer-panel"),
    timerClock: document.getElementById("timerClock"),
    timerStepLabel: document.getElementById("timerStepLabel"),
    audioWarning: document.getElementById("audioWarning"),
    timerToggleBtn: document.getElementById("timerToggleBtn"),
    timerArriveBtn: document.getElementById("timerArriveBtn"),
    timerResetBtn: document.getElementById("timerResetBtn"),
    presetSelect: document.getElementById("presetSelect"),
    loadPresetBtn: document.getElementById("loadPresetBtn"),
    deletePresetBtn: document.getElementById("deletePresetBtn"),
    savePresetBtn: document.getElementById("savePresetBtn"),
    resetBtn: document.getElementById("resetBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFile: document.getElementById("importFile"),
    autosaveNote: document.getElementById("autosaveNote"),
    chartTooltip: document.getElementById("chartTooltip"),
    chartEnzymeLegend: document.getElementById("chartEnzymeLegend"),
    saveModal: document.getElementById("saveModal"),
    presetNameInput: document.getElementById("presetNameInput"),
    cancelSaveBtn: document.getElementById("cancelSaveBtn"),
    confirmSaveBtn: document.getElementById("confirmSaveBtn"),
    deleteModal: document.getElementById("deleteModal"),
    deleteModalText: document.getElementById("deleteModalText"),
    cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
    confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),
    resetModal: document.getElementById("resetModal"),
    cancelResetBtn: document.getElementById("cancelResetBtn"),
    confirmResetBtn: document.getElementById("confirmResetBtn"),
    toast: document.getElementById("toast"),
    toastText: document.getElementById("toastText"),
    toastAction: document.getElementById("toastAction"),
    footerVersion: document.getElementById("footerVersion"),
  };

  let state = {
    methodId: localStorage.getItem(LAST_METHOD_KEY) || METHODS[0].id,
    params: {},
  };

  // Cronômetro por evento: a etapa ativa é `actualStepEndMin.length` — não
  // mais uma busca por horário no plano estático. Cada elemento é o minuto
  // real (timerElapsedMs()/60000 no momento do clique) em que o usuário
  // confirmou ter chegado ao fim daquela etapa, apertando "Cheguei". Isso
  // resolve de uma vez: etapas de 0min inalcançáveis (não depende mais de
  // tempo pra avançar), destaque de etapa antes de começar (activeIndex só
  // existe depois do 1º "Iniciar"), e o plano mudando sob o relógio (editar
  // parâmetros nunca pula etapa, já que a etapa ativa não depende do plano).
  let timer = { running: false, startEpoch: null, accumulatedMs: 0, actualStepEndMin: [], alarm: defaultAlarmState() };
  let chartGeom = null;
  let hoverT = null;
  let lastClientX = 0;
  let lastClientY = 0;

  function safeParse(json, fallback) {
    try {
      const v = JSON.parse(json);
      return v && typeof v === "object" ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function loadPresets() {
    return safeParse(localStorage.getItem(PRESETS_KEY), {});
  }
  function savePresets(presets) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }

  // Clampa cada campo pro [min,max] do paramSchema, com fallback pro
  // default quando o valor nem é um número. O clamp do input (evento
  // "input" em renderForm) só protege quem digita — um valor salvo em
  // versão antiga do app, uma predefinição, ou um JSON importado de outra
  // pessoa passa batido por ele e chega direto no motor de cálculo. Único
  // ponto de saneamento pra todo mundo que lê parâmetros de fora do
  // teclado: autosave, predefinições e importação de JSON.
  function sanitizeParams(method, params) {
    const out = { ...defaultParams(method), ...params };
    for (const p of method.paramSchema) {
      const v = Number(out[p.key]);
      out[p.key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
    }
    return out;
  }

  function loadCurrentParams(methodId) {
    const method = getMethod(methodId);
    const stored = safeParse(localStorage.getItem(CURRENT_KEY(methodId)), null);
    if (!stored) return defaultParams(method);
    return sanitizeParams(method, stored);
  }

  function persistCurrentParams() {
    localStorage.setItem(CURRENT_KEY(state.methodId), JSON.stringify(state.params));
  }

  let flashTimer = null;
  function flashAutosave() {
    el.autosaveNote.classList.add("flash");
    el.autosaveNote.textContent = "Salvo neste dispositivo.";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      el.autosaveNote.classList.remove("flash");
      el.autosaveNote.textContent = "Alterações salvas automaticamente neste dispositivo.";
    }, 1200);
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.classList.remove("is-update");
    el.toastAction.hidden = true;
    el.toastText.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  // Fica visível até o usuário agir (sem timeout), com botão explícito —
  // diferente do toast() normal, que some sozinho.
  function showUpdateToast() {
    clearTimeout(toastTimer);
    el.toastText.textContent = "Nova versão disponível";
    el.toastAction.hidden = false;
    el.toast.classList.add("show", "is-update");
  }
  el.toastAction.addEventListener("click", () => location.reload());

  function fmtNum(n, digits = 1) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function splitHM(totalMin) {
    let h = Math.floor(totalMin / 60);
    let m = Math.round(totalMin - h * 60);
    if (m === 60) { m = 0; h += 1; }
    return { h, m };
  }

  function fmtHM(totalMin) {
    const { h, m } = splitHM(totalMin);
    if (h <= 0) return `${m}min`;
    return `${h}h${String(m).padStart(2, "0")}min`;
  }

  function fmtClock(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function defaultAlarmState() {
    return { index: -1, count: 0, lastAtMin: -Infinity };
  }

  function loadTimer(methodId) {
    const stored = safeParse(localStorage.getItem(TIMER_KEY(methodId)), null);
    return stored && typeof stored.accumulatedMs === "number"
      ? {
          running: !!stored.running,
          startEpoch: stored.startEpoch || null,
          accumulatedMs: stored.accumulatedMs,
          // Sessões salvas antes desta versão não tinham isso — trata como
          // "nenhuma etapa confirmada ainda", não perde o relógio corrido.
          actualStepEndMin: Array.isArray(stored.actualStepEndMin) ? stored.actualStepEndMin : [],
          // Idem: sem isso, uma etapa já vencida antes de um reload tocava
          // o alarme de novo assim que a página carregasse (achado P3c).
          alarm: stored.alarm && typeof stored.alarm === "object" ? stored.alarm : defaultAlarmState(),
        }
      : { running: false, startEpoch: null, accumulatedMs: 0, actualStepEndMin: [], alarm: defaultAlarmState() };
  }

  function saveTimer() {
    localStorage.setItem(TIMER_KEY(state.methodId), JSON.stringify(timer));
  }

  function timerElapsedMs() {
    return timer.running ? Date.now() - timer.startEpoch : timer.accumulatedMs;
  }

  // undefined = ainda não começou (nenhum "Iniciar" apertado nesta sessão
  // de brassagem); um número = índice da etapa ativa agora. Nunca aponta
  // pra além de rows.length (aí o programa está concluído).
  function timerStarted() {
    return timer.running || timer.accumulatedMs > 0 || timer.actualStepEndMin.length > 0;
  }
  function activeStepIndex(rowsLength) {
    if (!timerStarted()) return -1;
    return Math.min(timer.actualStepEndMin.length, rowsLength);
  }

  function isTimerFinished() {
    const len = state.rows ? state.rows.length : 0;
    return len > 0 && timer.actualStepEndMin.length >= len;
  }

  // Desloca o plano estático (rows) pelo atraso/adiantamento acumulado até
  // agora: etapas já confirmadas ganham o horário REAL em que terminaram;
  // as que faltam mantêm a duração planejada, só que a partir do último
  // checkpoint real (em vez de acumular a partir do zero). Sem isso, se uma
  // etapa demorar mais que o previsto, todo o resto do cronograma mostrado
  // continuaria com os horários originais, como se o atraso não tivesse
  // acontecido.
  function effectiveRows(rows) {
    const activeIndex = timer.actualStepEndMin.length;
    if (!rows.length || activeIndex === 0) return rows;
    const baseReal = timer.actualStepEndMin[Math.min(activeIndex, rows.length) - 1];
    const basePlanned = rows[Math.min(activeIndex, rows.length) - 1].totalMin;
    const drift = baseReal - basePlanned;
    let prevTotal = 0;
    return rows.map((r, i) => {
      const effTotalMin = i < activeIndex ? timer.actualStepEndMin[i] : r.totalMin + drift;
      const effRow = { ...r, totalMin: effTotalMin, duration: Math.max(0, effTotalMin - prevTotal) };
      prevTotal = effTotalMin;
      return effRow;
    });
  }

  function currentStepIndex(rows, elapsedMin) {
    for (let i = 0; i < rows.length; i++) {
      if (elapsedMin < rows[i].totalMin - 1e-6) return i;
    }
    return Math.max(0, rows.length - 1);
  }

  function tempColor(t) {
    const stops = [
      { t: 30, c: [56, 96, 121] },
      { t: 70, c: [201, 138, 31] },
      { t: 100, c: [181, 96, 44] },
    ];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].t && t <= stops[i + 1].t) { a = stops[i]; b = stops[i + 1]; break; }
    }
    if (t <= stops[0].t) return `rgb(${a.c.join(",")})`;
    if (t >= stops[stops.length - 1].t) return `rgb(${b.c.join(",")})`;
    const span = b.t - a.t || 1;
    const f = (t - a.t) / span;
    const c = a.c.map((v, i) => Math.round(v + (b.c[i] - v) * f));
    return `rgb(${c.join(",")})`;
  }

  function renderTabs() {
    el.methodTabs.innerHTML = "";
    for (const m of METHODS) {
      const isSelected = m.id === state.methodId;
      const btn = document.createElement("button");
      btn.className = "method-tab";
      btn.type = "button";
      btn.role = "tab";
      btn.textContent = m.name;
      btn.id = `tab_${m.id}`;
      btn.setAttribute("aria-selected", String(isSelected));
      btn.setAttribute("aria-controls", "methodPanel");
      // Roving tabindex: só a aba selecionada é parada de Tab; as setas
      // (abaixo) movem o foco entre as outras, como o padrão ARIA de
      // tablist espera.
      btn.tabIndex = isSelected ? 0 : -1;
      btn.addEventListener("click", () => switchMethod(m.id));
      btn.addEventListener("keydown", (e) => {
        const tabs = Array.from(el.methodTabs.querySelectorAll(".method-tab"));
        const i = tabs.indexOf(btn);
        let next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          const nextId = METHODS[tabs.indexOf(next)].id;
          switchMethod(nextId);
          // renderTabs() (chamado por switchMethod) recria os botões do
          // zero — `next` já está fora do DOM aqui, precisa buscar de novo.
          document.getElementById(`tab_${nextId}`)?.focus();
        }
      });
      el.methodTabs.appendChild(btn);
    }
    if (el.methodSelect.options.length !== METHODS.length) {
      el.methodSelect.innerHTML = "";
      for (const m of METHODS) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        el.methodSelect.appendChild(opt);
      }
    }
    el.methodSelect.value = state.methodId;
    const method = getMethod(state.methodId);
    const newDescription = method.description || "";
    if (el.methodDescription.textContent !== newDescription) {
      el.methodDescription.textContent = newDescription;
      el.methodDescription.classList.add("is-switching");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => el.methodDescription.classList.remove("is-switching"));
      });
    }
    el.methodSource.textContent = method.source ? `Fonte: ${method.source}` : "";
  }

  function switchMethod(id) {
    // Cada método tem seu próprio cronômetro (localStorage por método) — o
    // relógio de parede do que fica pra trás continua correndo de verdade
    // (não é pausado por trocar de aba), mas o alarme dele para de ser
    // checado, porque tickTimer só olha o método em tela. Sem aviso nenhum
    // isso silencia uma brassagem em andamento sem ninguém perceber
    // (achado P3b) — a alternativa de tocar alarme de um método fora de
    // tela exigiria rodar o motor inteiro em segundo plano pra todos os
    // métodos, o que não vale o custo frente a um aviso simples.
    if (timer.running && state.methodId !== id) {
      toast(`A brassagem em "${getMethod(state.methodId).name}" continua rodando, mas o alarme só toca com o método em tela.`);
    }
    state.methodId = id;
    state.params = loadCurrentParams(id);
    timer = loadTimer(id);
    lastAnnouncedStep = undefined;
    localStorage.setItem(LAST_METHOD_KEY, id);
    renderTabs();
    renderForm();
    renderPresetOptions();
    renderResults();
  }

  // Explicações de apoio (tooltip "?") por parâmetro, resolvidas pela `key`
  // (estável entre métodos) em vez do `label` (que varia por método). Cada
  // entrada é testada em ordem — a primeira regra cujo teste bater vence —
  // então regras mais específicas (ex.: rampas nomeadas) vêm antes das
  // regras genéricas por grupo.
  const HINT_RULES = [
    { test: (p) => p.key === "waterVolume", text: "Volume de água usada na mostura (não inclui a água de lavagem/sparge depois). Junto com a massa de malte, define o volume total estimado da mostura — usado pra calcular quanto puxar em cada decocção." },
    { test: (p) => p.key === "grainWeight", text: "Massa de malte já moído usada na mostura. Entra no cálculo do volume total da mostura (o grão molhado ocupa espaço além da água, ~0,67L por kg), o que também influencia o volume calculado pra puxar em cada decocção." },
    { test: (p) => p.key === "mashInTemp", text: "Temperatura da mostura logo depois de misturar a água com o malte moído (Mash In) — o ponto de partida do programa, antes de qualquer rampa ou decocção." },
    { test: (p) => p.key === "heatingRate", text: "Velocidade de aquecimento considerada pro seu fogo/resistência, em °C por minuto. Usada só pra estimar a duração das etapas de aquecimento — não muda volumes nem temperaturas do programa." },
    { test: (p) => p.key === "transferTime", text: "Tempo estimado pra transferir a mostura entre a tina de mostura e a tina de fervura, tanto na puxada quanto no retorno da decocção. É só uma referência de tempo; ajuste pro seu equipamento." },
    { test: (p) => /SaccTemp$/.test(p.key), text: "Temperatura em que a porção puxada descansa, na tina de fervura, antes de ir à fervura plena — dá tempo pras enzimas de conversão de amido agirem nessa fração antes de morrerem na fervura." },
    { test: (p) => p.key === "saccTime", text: "Duração do descanso de sacarificação da porção puxada, na tina de fervura, antes dela seguir pra fervura plena." },
    { test: (p) => p.key === "fervuraTemp", text: "Temperatura de fervura da porção puxada — normalmente 100°C. É o valor de referência (Tfervura) usado na fórmula que calcula quanto volume precisa ser puxado em cada decocção." },
    { test: (p) => p.key === "mashOutTemp", text: "Temperatura alvo de Mash Out — a temperatura final da mostura, atingida pra travar (desnaturar) as enzimas e parar a conversão de amido antes da clarificação/lavagem." },
    { test: (p) => p.key === "mashOutTime", text: "Duração do descanso na temperatura de Mash Out, ao final da mostura." },
    { test: (p) => /^decoction\d*Time$/.test(p.key), text: "Duração da fervura desta porção puxada (decocção) na tina de fervura, antes dela voltar e se misturar de novo à mostura." },
    { test: (p) => /^mashTemp\d+$/.test(p.key), text: "Temperatura alvo da mostura depois que esta porção decoctada volta e se mistura ao restante. É a partir dela que o app calcula quanto volume precisou ser puxado nesta decocção." },
    { test: (p) => p.key === "acidRestTemp", text: "Temperatura da rampa ácida, logo no Mash In — descanso baixo (Säurerast) que ativa a fitase do malte pra baixar o pH da mostura naturalmente, sem ácido adicionado." },
    { test: (p) => p.key === "acidRestTime", text: "Duração da rampa ácida — o descanso baixo logo no Mash In que ativa a fitase pra baixar o pH da mostura." },
    { test: (p) => p.key === "proteinRestTemp", text: "Temperatura alvo depois desta adição da decocção — a rampa de proteína, faixa em que enzimas proteolíticas quebram proteínas grandes em cadeias menores (ajuda espuma e clareza, sem tirar muito corpo)." },
    { test: (p) => p.key === "proteinRestTime" || /proteina|protease/i.test(p.key), text: "Duração da rampa de proteína — descanso em que enzimas proteolíticas quebram proteínas grandes em cadeias menores, melhorando espuma e clareza da cerveja." },
    { test: (p) => p.key === "saccRestTemp", text: "Temperatura alvo depois desta adição da decocção — a rampa de sacarificação, faixa em que a alfa-amilase converte o amido restante em açúcares fermentáveis." },
    { test: (p) => p.key === "dextrinizacaoTemp", text: "Temperatura da rampa de dextrinização — descanso mais quente que favorece a produção de dextrinas (açúcares menos fermentáveis), deixando a cerveja com mais corpo e final menos seco." },
    { test: (p) => /fitase/i.test(p.key), text: "Duração da rampa de fitase — descanso baixo (~35-45°C) que ativa a enzima fitase do malte, baixando o pH da mostura naturalmente. Comum em programas de decocção tradicionais, pensados pra maltes menos modificados." },
    { test: (p) => /malto/i.test(p.key), text: "Duração da rampa de maltose — descanso na faixa de ação da beta-amilase, que produz mais açúcares fermentáveis (maltose). Deixa a cerveja com corpo mais leve e final mais seco." },
    { test: (p) => p.key === "saccRestTime" || /sacc/i.test(p.key), text: "Duração da rampa de sacarificação — descanso em que a alfa-amilase converte o amido em açúcares, definindo corpo e fermentabilidade da cerveja." },
    { test: (p) => p.group === "Rampas", text: "Duração deste descanso da mostura, na temperatura definida pela etapa anterior, antes do próximo passo do programa." },
  ];

  function hintFor(p) {
    const rule = HINT_RULES.find((r) => r.test(p));
    return rule ? rule.text : null;
  }

  function closeHints() {
    document.querySelectorAll(".hint.is-open").forEach((b) => {
      b.classList.remove("is-open", "hint--flip-up");
    });
  }

  // Sobe a partir do botão até achar um ancestral que corta overflow (ex.:
  // .schedule-panel) — é ELE que limita onde o tooltip pode aparecer, não
  // a viewport inteira. Sem isso, uma linha no meio da tela mas no fim de
  // um painel rolável não teria a virada calculada corretamente (P10).
  function findClippingAncestor(node) {
    let el = node.parentElement;
    while (el && el !== document.body) {
      if (/(hidden|auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function updateHintFlip(btn) {
    // Não dá pra medir a altura real do tooltip (é um ::after, sem caixa
    // própria pro DOM consultar) — usa uma estimativa conservadora de
    // espaço mínimo. O painel que corta overflow (ex.: .schedule-panel,
    // que guarda a escada inteira) quase sempre é MAIOR que a tela — usar
    // só o fim dele, como se ele fosse o limite real, deixava o tooltip
    // virar pra baixo bem depois da dobra da viewport (achado N4). O
    // limite de verdade é o menor dos dois: onde o painel termina E onde a
    // tela termina.
    const rect = btn.getBoundingClientRect();
    const container = findClippingAncestor(btn);
    const bottomLimit = Math.min(
      container ? container.getBoundingClientRect().bottom : Infinity,
      window.innerHeight
    );
    btn.classList.toggle("hint--flip-up", bottomLimit - rect.bottom < 180);
  }

  function makeHintBtn(text) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hint";
    btn.textContent = "?";
    btn.setAttribute("aria-label", "Mais informações");
    btn.setAttribute("data-tip", text);
    // A decisão de virar pra cima só rodava no clique — mas o tooltip
    // também abre no :hover e no :focus-visible (mouse/teclado), casos em
    // que a classe nunca era calculada (achado P10).
    btn.addEventListener("pointerenter", () => updateHintFlip(btn));
    btn.addEventListener("focus", () => updateHintFlip(btn));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = btn.classList.contains("is-open");
      closeHints();
      if (!wasOpen) {
        updateHintFlip(btn);
        btn.classList.add("is-open");
      }
    });
    return btn;
  }

  // Cria o botão de ajuda uma vez dentro de `container` e só atualiza o
  // texto nas renderizações seguintes — evita duplicar botão/listener em
  // conteúdo que é atualizado com frequência (ex.: barra de resumo).
  function ensureHint(container, text) {
    let btn = container.querySelector(".hint");
    if (!btn) {
      btn = makeHintBtn(text);
      container.appendChild(btn);
    } else {
      btn.setAttribute("data-tip", text);
    }
    return btn;
  }

  // Texto do tooltip do "puxar" varia por etapa: segue a distinção entre
  // decocção grossa/rala do Braukaiser Wiki (Decoction Mashing) — puxadas
  // que ainda vão descansar pra sacarificação (r.restsForConversion) devem
  // ficar só um pouco mais grossas que a mostura principal (grão sempre
  // submerso no líquido, senão queima e não mexe direito); a puxada final
  // de um programa, que já não converte mais amido, pode ser mais rala.
  // 3 faixas, não 2: até 50% não precisa de aviso; de 50-60% o texto
  // tranquiliza (é o teto que a literatura de fato usa, Braukaiser
  // enhanced double inclusive); acima de 60% passa a ALARMAR — nenhum
  // programa publicado vai tão longe, e o texto tranquilizador de antes
  // ficava idêntico pra 51% ou 78%, o que é enganoso (achado N3).
  function volumeSeverity(fraction) {
    if (fraction >= 0.6) return "alarm";
    if (fraction >= 0.5) return "big";
    return "normal";
  }

  function volumeHintText(r) {
    const base = "Volume estimado a retirar (\"puxar\") da tina de mostura e levar pra fervura nesta decocção. " +
      "O valor já é o total dessa fração (grão + líquido), calculado pelo balanço de energia entre a temperatura atual e a temperatura alvo após o retorno.";
    const severity = volumeSeverity(r.decoctionFraction);
    const waterNote = " Vale afinar com um pouco de água (5-10% do volume da puxada) antes de ferver, pra facilitar mexer.";
    const alarmNote = " Atenção: essa fração já passa de 60% do volume total da mostura — nenhum programa publicado (nem o \"enhanced double\" do Braukaiser, o mais agressivo que existe) vai tão longe. Acima disso o resto da mostura pode não ter amido/enzima suficiente pra converter sozinho — vale reconferir os parâmetros antes de seguir.";
    if (r.restsForConversion) {
      let text = base + " Essa puxada ainda vai descansar pra sacarificação antes da fervura, então mantenha-a só um pouco mais grossa que a mostura principal — grão sempre submerso no líquido, nunca seco.";
      if (severity === "alarm") {
        text += alarmNote;
      } else if (severity === "big") {
        text += r.returnParts > 1
          ? " Essa fração já passa de 50% do volume total da mostura — só é seguro puxar tanto porque a devolução acontece em mais de uma adição (dá tempo pro resto da mostura converter entre uma e outra) e porque essa porção sacarifica sozinha antes de ferver."
          : " Essa fração já passa de 50% do volume total da mostura — só é seguro puxar tanto porque essa porção sacarifica sozinha (tem seu próprio descanso de conversão) antes de ir à fervura.";
        text += waterNote;
      } else if (r.decoctionFraction >= 0.4) {
        text += waterNote;
      }
      return text;
    }
    let text = base + " Essa é a puxada final: a conversão de amido já aconteceu antes dela, então não precisa mais descansar — pode ser puxada mais rala (mais líquida), já que o objetivo aqui é só levá-la à fervura.";
    if (severity === "alarm") {
      text += alarmNote;
    } else if (severity === "big") {
      text += " Atenção: essa fração passa de 50% do volume total e não tem descanso de conversão próprio nem retorna em parcelas — confirme que o resto da mostura já converteu todo o amido antes de puxar tanto.";
    }
    return text;
  }

  // O campo "Rampa de X" só pede o repouso ADICIONAL desta etapa. Enquanto
  // a decocção seguinte é puxada, aquecida, sacarifica e ferve, a mostura
  // principal fica parada nessa mesma temperatura — e esse tempo não
  // aparece em lugar nenhum a não ser aqui.
  function realPlateauHintText(r) {
    const decoctionSteps = r.plateauHasSaccRest
      ? "a transferência, o aquecimento, a sacarificação e a fervura da decocção"
      : "a transferência, o aquecimento e a fervura da decocção"; // sem sacarificação: vai direto à fervura (ex.: 2ª do Hochkurz)
    let text = `O tempo digitado neste campo (${fmtNum(r.duration)} min) é só o repouso desta etapa. ` +
      `Somando ${decoctionSteps} que vêm logo depois — enquanto a mostura principal fica parada a ${fmtNum(r.mash)}°C, sem nada mudando nela —, o tempo REAL que a mostura passa nesse patamar é ${fmtNum(r.realPlateauMin)} min.`;
    if (r.mash >= 30 && r.mash <= 45 && r.realPlateauMin > 45) {
      text += " Atenção: mais de 45min entre 30-45°C é a janela de crescimento de bactérias láticas (Sauergut) sem controle — se a intenção não é acidificar de propósito, vale reduzir esse tempo (puxar antes, ou ajustar as temperaturas).";
    }
    return text;
  }

  // Só "Insumos" (água, malte) fica sempre visível — os outros grupos vão
  // pra trás de "Configurações avançadas", fechado por padrão. Quem só
  // quer rodar a receita padrão do método nunca precisa ver temperatura
  // de rampa, taxa de aquecimento etc.
  const ADVANCED_OPEN_KEY = `${STORAGE_PREFIX}:advancedOpen`;
  const ALWAYS_VISIBLE_GROUP = "Insumos";

  function buildParamGroup(g) {
    const wrap = document.createElement("div");
    wrap.className = "param-group";
    const title = document.createElement("p");
    title.className = "param-group__title";
    title.textContent = g.name;
    wrap.appendChild(title);
    for (const p of g.fields) {
      const field = document.createElement("div");
      field.className = "field";
      const labelWrap = document.createElement("div");
      labelWrap.className = "field__label";
      const label = document.createElement("label");
      label.textContent = p.label;
      label.htmlFor = `p_${p.key}`;
      labelWrap.appendChild(label);
      const hintText = hintFor(p);
      if (hintText) labelWrap.appendChild(makeHintBtn(hintText));
      const control = document.createElement("div");
      control.className = "field__control";
      const input = document.createElement("input");
      input.type = "number";
      input.id = `p_${p.key}`;
      input.min = p.min;
      input.max = p.max;
      input.step = p.step;
      input.value = state.params[p.key];
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        const clamped = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
        state.params[p.key] = clamped;
        persistCurrentParams();
        flashAutosave();
        renderResults();
      });
      input.addEventListener("blur", () => {
        input.value = state.params[p.key];
      });
      const unit = document.createElement("span");
      unit.className = "field__unit";
      unit.textContent = p.unit;
      control.appendChild(input);
      control.appendChild(unit);
      field.appendChild(labelWrap);
      field.appendChild(control);
      wrap.appendChild(field);
    }
    return wrap;
  }

  function renderForm() {
    const method = getMethod(state.methodId);
    el.form.innerHTML = "";
    const groups = [];
    for (const p of method.paramSchema) {
      let g = groups.find((g) => g.name === p.group);
      if (!g) { g = { name: p.group, fields: [] }; groups.push(g); }
      g.fields.push(p);
    }

    const advancedGroups = groups.filter((g) => g.name !== ALWAYS_VISIBLE_GROUP);
    for (const g of groups) {
      if (g.name === ALWAYS_VISIBLE_GROUP) el.form.appendChild(buildParamGroup(g));
    }
    if (advancedGroups.length) {
      const details = document.createElement("details");
      details.className = "advanced-settings";
      details.open = localStorage.getItem(ADVANCED_OPEN_KEY) === "1";
      details.addEventListener("toggle", () => {
        localStorage.setItem(ADVANCED_OPEN_KEY, details.open ? "1" : "0");
      });
      const summary = document.createElement("summary");
      summary.textContent = "Configurações avançadas";
      details.appendChild(summary);
      for (const g of advancedGroups) details.appendChild(buildParamGroup(g));
      el.form.appendChild(details);
    }
  }

  function renderResults() {
    const method = getMethod(state.methodId);
    const rows = computeSchedule(method, state.params);
    const total = rows.length ? rows[rows.length - 1].totalMin : 0;
    state.rows = rows;
    state.total = total;

    el.stepCount.textContent = String(rows.length);

    const mashVolumeL = totalMashVolumeL(state.params);
    el.mashVolume.textContent = `${fmtNum(mashVolumeL)} L`;
    ensureHint(el.mashVolumeWrap,
      `Volume total estimado da mostura (água + malte molhado): ${fmtNum(state.params.waterVolume)}L de água ` +
      `+ ${fmtNum(state.params.grainWeight)}kg de malte × 0,67L/kg = ${fmtNum(mashVolumeL)}L. ` +
      "É o volume de referência usado pra calcular quanto puxar em cada decocção."
    );

    const pulls = rows.filter((r) => r.decoctionVolumeL !== undefined);
    const maxPullL = pulls.length ? Math.max(...pulls.map((r) => r.decoctionVolumeL)) : 0;
    const minPanelaL = maxPullL * 1.25;
    el.maxPull.textContent = pulls.length ? `${fmtNum(maxPullL)} L` : "–";
    ensureHint(el.maxPullWrap,
      pulls.length
        ? `Volume da maior puxada deste programa — é ela que dimensiona sua panela de fervura da decocção. ` +
          `Recomenda-se folga de pelo menos 25% sobre esse volume, então a panela precisa ter pelo menos ${fmtNum(minPanelaL)}L.`
        : "Este método não puxa decocção."
    );

    const activeIndex = activeStepIndex(rows.length);
    const finished = activeIndex >= rows.length && rows.length > 0;
    const displayRows = activeIndex >= 0 ? effectiveRows(rows) : rows;
    annotateDisplayBoil(displayRows, state.params.fervuraTemp);
    state.displayRows = displayRows;

    // O total no cabeçalho é o número que o brassador olha pra saber a que
    // horas termina — precisa refletir o atraso/adiantamento acumulado
    // (displayRows), não o plano original (rows), senão discorda da
    // própria escada logo abaixo (achado P1).
    const displayTotal = displayRows.length ? displayRows[displayRows.length - 1].totalMin : 0;
    el.totalTime.innerHTML = Math.abs(displayTotal - total) > 0.05
      ? `${fmtHM(displayTotal)} <span>tempo total de processo (previsto ${fmtHM(total)})</span>`
      : `${fmtHM(displayTotal)} <span>tempo total de processo</span>`;

    // O cap (fim do último passo) serve pro desenho — marcador e curva não
    // têm onde ficar depois do eixo. Mas se ele também limitar o `nowMin`
    // do alarme, o instante em que o alarme deveria começar a repetir é
    // exatamente o instante em que ele para de andar: `nowMin - lastAtMin`
    // vira `cap - cap`, zero pra sempre, e a última etapa toca uma única
    // vez e nunca mais (achado N1). O alarme usa o tempo real, sem teto.
    let alarmNowMin = null;
    let nowMin = null;
    if (activeIndex >= 0) {
      const cap = displayRows.length ? displayRows[displayRows.length - 1].totalMin : 0;
      alarmNowMin = Math.max(0, timerElapsedMs() / 60000);
      nowMin = Math.min(alarmNowMin, cap);
    }

    renderLadder(displayRows, activeIndex);
    renderChart(displayRows, state.params, nowMin);
    renderTimerUI(displayRows, activeIndex, finished);
    maybeAlarm(displayRows, activeIndex, alarmNowMin, finished);
  }

  // Chamado a cada 500ms enquanto o cronômetro roda: só atualiza o relógio,
  // o texto "faltam Xmin" e a posição do marcador no gráfico — não recria a
  // escada nem redesenha o SVG inteiro (era o R1-8 do Raio-X: bateria, e
  // nada na tela ficava selecionável porque tudo era substituído 2x/s).
  function tickTimer() {
    if (!timer.running) return;
    const rows = state.displayRows || [];
    const rawLength = state.rows ? state.rows.length : 0;
    const activeIndex = activeStepIndex(rawLength);
    const finished = activeIndex >= rawLength && rawLength > 0;
    const cap = rows.length ? rows[rows.length - 1].totalMin : 0;
    const alarmNowMin = activeIndex >= 0 ? Math.max(0, timerElapsedMs() / 60000) : null;
    renderTimerUI(rows, activeIndex, finished);
    updatePlayhead(alarmNowMin === null ? null : Math.min(alarmNowMin, cap));
    maybeAlarm(rows, activeIndex, alarmNowMin, finished);
  }

  // O horário real de cada etapa (timer.actualStepEndMin) é o único dado
  // que a ferramenta guarda e nenhuma outra do mercado guarda — mas ele
  // morria sem saída nenhuma: nem no Exportar JSON, nem num resumo ao
  // terminar (achado N7). A taxa de aquecimento é um campo que a pessoa
  // chuta (°C/min do próprio fogo/resistência, nunca medido); comparando o
  // Δ°C previsto de cada etapa de aquecimento (reconstruído do próprio
  // plano: duração × taxa configurada, exato por construção) contra o
  // tempo REAL que ela levou, dá pra devolver a taxa medida do equipamento
  // de quem brassou — o dado que faltava pro T5.
  function heatingRateSummary() {
    const rawRows = state.rows || [];
    const rate = state.params && state.params.heatingRate;
    if (!rate || timer.actualStepEndMin.length < rawRows.length) return "";
    let totalDeltaTemp = 0;
    let totalRealMin = 0;
    rawRows.forEach((row, i) => {
      if (!/aquecimento/i.test(row.label)) return;
      const realMin = timer.actualStepEndMin[i] - (i > 0 ? timer.actualStepEndMin[i - 1] : 0);
      totalDeltaTemp += row.duration * rate;
      totalRealMin += realMin;
    });
    if (totalRealMin <= 0) return "";
    const realRate = totalDeltaTemp / totalRealMin;
    const deviationPct = ((realRate - rate) / rate) * 100;
    if (Math.abs(deviationPct) < 1) {
      return ` · <span class="timer-drift">aquecimento real bateu com o configurado (${fmtNum(rate)}°C/min)</span>`;
    }
    const cls = deviationPct < 0 ? "is-late" : "is-early";
    const word = deviationPct < 0 ? "mais lento" : "mais rápido";
    return ` · <span class="timer-drift ${cls}">aquecimento real: ${fmtNum(realRate)}°C/min — ${fmtNum(Math.abs(deviationPct))}% ${word} que o configurado (${fmtNum(rate)}°C/min)</span>`;
  }

  let lastAnnouncedStep = undefined;
  function renderTimerUI(rows, activeIndex, finished) {
    el.timerClock.textContent = fmtClock(timerElapsedMs() / 1000);
    el.timerPanel.classList.toggle("is-running", timer.running);
    updateAudioWarning();
    el.timerToggleBtn.textContent = finished ? "Nova brassagem" : timer.running ? "Pausar" : (timer.accumulatedMs > 0 ? "Continuar" : "Iniciar");
    el.timerArriveBtn.disabled = !(activeIndex >= 0 && !finished);
    // A etapa ativa muda raramente; o "faltam Xmin" muda 2x/s (tickTimer).
    // Anunciar pro leitor de tela só na virada de etapa — um aria-live no
    // texto inteiro spammaria "faltam" a cada meio segundo.
    const announceKey = finished ? "finished" : (rows.length && activeIndex >= 0 ? activeIndex : null);
    if (announceKey !== lastAnnouncedStep) {
      lastAnnouncedStep = announceKey;
      if (finished) el.srAnnouncer.textContent = "Programa concluído.";
      else if (announceKey !== null) el.srAnnouncer.textContent = `Etapa atual: ${rows[activeIndex].label}.`;
    }
    // Atraso/adiantamento acumulado: diferença entre o horário REAL do
    // último "Cheguei" e o horário que o plano original previa pra aquele
    // ponto. É o que faz o "faltam Xmin" (calculado sobre `rows`, que já
    // vem deslocado por effectiveRows) refletir o ritmo real da brassagem
    // em vez do cronograma original, ignorando qualquer atraso — ver R1.
    const completed = timer.actualStepEndMin.length;
    const rawRows = state.rows || [];
    const driftMin = completed > 0 && rawRows[completed - 1]
      ? timer.actualStepEndMin[completed - 1] - rawRows[completed - 1].totalMin
      : 0;
    const driftBadge = Math.abs(driftMin) >= 1
      ? ` · <span class="timer-drift ${driftMin > 0 ? "is-late" : "is-early"}">${driftMin > 0 ? "+" : ""}${fmtNum(driftMin)}min vs. previsto</span>`
      : "";
    if (finished) {
      el.timerStepLabel.innerHTML = `<strong>Programa concluído</strong>${driftBadge}${heatingRateSummary()}`;
    } else if (rows.length && activeIndex >= 0) {
      const row = rows[activeIndex];
      const remainingMin = row.totalMin - timerElapsedMs() / 60000;
      // Passado o previsto, "faltam 0min" travava ali indefinidamente — o
      // "+Xmin vs. previsto" ao lado é o atraso ACUMULADO até a última
      // confirmação, não o estouro desta etapa em curso (achado P7).
      const timeText = remainingMin >= 0
        ? `faltam ${fmtNum(remainingMin)} min`
        : `<span class="timer-drift is-late">+${fmtNum(-remainingMin)} min além do previsto</span> nesta etapa`;
      el.timerStepLabel.innerHTML = `Etapa atual: <strong>${row.label}</strong> · ${timeText}${driftBadge}`;
    } else {
      el.timerStepLabel.textContent = "Pronto para começar";
    }
  }

  function renderLadder(rows, activeIndex) {
    el.ladder.innerHTML = "";
    rows.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "ladder-row";
      row.setAttribute("role", "row");
      if (i === activeIndex) row.classList.add("is-active");
      else if (activeIndex >= 0 && i < activeIndex) row.classList.add("is-done");

      const rail = document.createElement("div");
      rail.className = "ladder-rail";
      rail.setAttribute("aria-hidden", "true");
      const dot = document.createElement("div");
      dot.className = "ladder-dot";
      const dotTemp = r.displayBoil !== null && r.displayBoil !== undefined ? r.displayBoil : r.mash;
      dot.style.background = tempColor(dotTemp);
      rail.appendChild(dot);

      const label = document.createElement("div");
      label.className = "ladder-label";
      label.setAttribute("role", "rowheader");
      const labelLine = document.createElement("span");
      labelLine.className = "ladder-label__line";
      labelLine.appendChild(document.createTextNode(r.label));
      if (r.realPlateauMin !== undefined) {
        const plateauHint = makeHintBtn(realPlateauHintText(r));
        labelLine.appendChild(plateauHint);
      }
      const small = document.createElement("small");
      // Etapas já confirmadas mostram a duração REAL (displayRows já troca
      // isso) — mas sem o previsto do plano original ao lado, o usuário
      // perde exatamente a comparação que o registro de horários deveria
      // oferecer (achado P6). state.rows[i] é a linha correspondente no
      // plano original (mesmo índice, effectiveRows preserva a ordem).
      const rawRow = i < activeIndex && state.rows ? state.rows[i] : null;
      const plannedNote = rawRow && Math.abs(rawRow.duration - r.duration) > 0.05
        ? ` (previsto ${fmtNum(rawRow.duration)})`
        : "";
      small.textContent = `${fmtNum(r.duration)} min${plannedNote} · até ${fmtHM(r.totalMin)}`;
      label.appendChild(labelLine);
      label.appendChild(small);

      const time = document.createElement("div");
      time.className = "ladder-time";
      time.setAttribute("role", "cell");
      time.innerHTML = `<strong>${fmtNum(r.duration)}</strong> min`;

      const temp = document.createElement("div");
      temp.className = "ladder-temp";
      temp.setAttribute("role", "cell");
      const mashPill = r.mash !== null && r.mash !== undefined
        ? `<span class="temp-pill temp-pill--mash">${fmtNum(r.mash)}°</span>`
        : `<span class="temp-pill temp-pill--empty">—</span>`;
      const boilPill = r.displayBoil !== null && r.displayBoil !== undefined
        ? `<span class="temp-pill temp-pill--boil">${fmtNum(r.displayBoil)}°</span>`
        : `<span class="temp-pill temp-pill--empty">—</span>`;
      temp.innerHTML = mashPill + " " + boilPill;

      const volume = document.createElement("div");
      volume.className = "ladder-volume";
      volume.setAttribute("role", "cell");
      if (r.decoctionVolumeL !== undefined) {
        const isAlarm = volumeSeverity(r.decoctionFraction) === "alarm";
        const pill = document.createElement("span");
        pill.className = "temp-pill temp-pill--volume";
        if (isAlarm) pill.classList.add("temp-pill--alarm");
        pill.textContent = `puxar ≈${fmtNum(r.decoctionVolumeL)} L`;
        const hint = makeHintBtn(volumeHintText(r));
        hint.classList.add("hint--volume");
        if (isAlarm) hint.classList.add("hint--alarm");
        const small = document.createElement("small");
        // Um número de 78% precisa se destacar tanto quanto o "?" ao lado
        // dele — antes só o ícone de ajuda ficava vermelho, e a fração
        // absurda continuava na mesma cor apagada de sempre (achado P8a).
        if (isAlarm) small.classList.add("is-alarm");
        small.textContent = `${fmtNum(r.decoctionFraction * 100)}% do volume`;
        volume.appendChild(pill);
        volume.appendChild(hint);
        volume.appendChild(small);
      } else if (r.returnVolumeL !== undefined) {
        // Quando a mesma puxada volta em mais de uma adição (Dupla
        // Aprimorada), a linha da puxada só mostra o total — sem isso o
        // brassador sabia quanto tirou mas não quanto devolver de cada vez
        // (achado N9).
        const pullRow = rows[r.pullIndex];
        const pill = document.createElement("span");
        pill.className = "temp-pill temp-pill--volume temp-pill--return";
        pill.textContent = `devolver ≈${fmtNum(r.returnVolumeL)} L`;
        const hint = makeHintBtn(
          `Volume desta adição específica — a puxada inteira (${fmtNum(pullRow.decoctionVolumeL)} L) volta em mais de uma vez, ` +
          "e o resto continua fervendo na panela até a próxima adição (veja o tooltip da puxada). " +
          `Essa parte é ${fmtNum((r.returnVolumeL / pullRow.decoctionVolumeL) * 100)}% do total puxado.`
        );
        hint.classList.add("hint--volume");
        volume.appendChild(pill);
        volume.appendChild(hint);
      }

      row.appendChild(rail);
      row.appendChild(label);
      row.appendChild(time);
      row.appendChild(temp);
      row.appendChild(volume);
      el.ladder.appendChild(row);
    });
  }

  function fmtAxisTime(t) {
    const { h, m } = splitHM(t);
    return h <= 0 ? `${m}m` : `${h}h${String(m).padStart(2, "0")}`;
  }

  function changePoints(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      if (i === 0 || Math.abs(pts[i].v - pts[i - 1].v) > 0.01) out.push(pts[i]);
    }
    return out;
  }

  function valueAt(pts, t) {
    if (!pts.length) return null;
    if (t <= pts[0].t) return pts[0].v;
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v;
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i].t) {
        const p0 = pts[i - 1], p1 = pts[i];
        const f = p1.t === p0.t ? 0 : (t - p0.t) / (p1.t - p0.t);
        return p0.v + (p1.v - p0.v) * f;
      }
    }
    return pts[pts.length - 1].v;
  }

  // Segmento (não ponto único) que contém `t`, ou null se `t` cai num
  // intervalo em que a panela está vazia (entre puxadas). Usado pro hover
  // e pro playhead não interpolarem por cima do "buraco" entre puxadas.
  function segmentAt(segments, t) {
    return segments.find((seg) => t >= seg[0].t && t <= seg[seg.length - 1].t) || null;
  }

  // `r.boil` sozinho não basta pra saber o que mostrar como temperatura da
  // panela: entre duas adições parciais da mesma puxada (ex.: Dupla
  // Aprimorada) ele já carrega o alvo da PRÓXIMA adição, embora a panela
  // ainda tenha decocção fervendo; e depois do retorno final ele continua
  // carregando esse valor pra sempre (via sameBoil), mesmo com a panela
  // vazia. `displayBoil` resolve isso uma vez só, pra escada e gráfico
  // concordarem (achado N4): null quando a panela está vazia de verdade,
  // fervuraTemp enquanto ainda falta devolver parte da puxada, e r.boil só
  // no ponto de encontro real (retorno final) e durante o próprio ciclo de
  // aquecer/ferver a decocção.
  function annotateDisplayBoil(rows, fervuraTemp) {
    let kettleActive = false;
    let waiting = false;
    for (const r of rows) {
      if (r.pullsDecoction) { kettleActive = true; waiting = false; }
      if (kettleActive) {
        if (r.isFinalReturn) {
          r.displayBoil = r.boil;
        } else if (waiting || (r.returnsDecoction && !r.isFinalReturn)) {
          r.displayBoil = fervuraTemp;
        } else if (r.boil !== null && r.boil !== undefined) {
          r.displayBoil = r.boil;
        } else {
          r.displayBoil = null;
        }
        if (r.returnsDecoction && !r.isFinalReturn) waiting = true;
      } else {
        r.displayBoil = null;
      }
      if (r.isFinalReturn) { kettleActive = false; waiting = false; }
    }
    return rows;
  }

  // Faixas de atuação das principais enzimas da mostura (Laus et al. 2022,
  // medidas em mostura isotérmica), sombreadas no gráfico como referência —
  // não são um alvo prescritivo do programa, só contexto visual pra saber
  // o que a mostura está "fazendo" em cada patamar.
  const ENZYME_ZONES = [
    { label: "β-glucanase", cls: "zone-glucanase", lo: 40, hi: 45 },
    { label: "Protease", cls: "zone-protease", lo: 43, hi: 57 },
    { label: "β-amilase", cls: "zone-beta-amilase", lo: 60, hi: 70 },
    { label: "α-amilase", cls: "zone-alpha-amilase", lo: 65, hi: 80 },
  ];

  function renderChart(rows, params, elapsedMin) {
    const W = 640, H = 218;
    const padL = 34, padR = 12, padT = 14, padB = 40;
    const total = rows.length ? rows[rows.length - 1].totalMin : 1;

    const initialMashTemp = rows.length ? rows[0].mash : params.mashInTemp;
    const mashPts = [{ t: 0, v: initialMashTemp }];
    for (const r of rows) mashPts.push({ t: r.totalMin, v: r.mash });

    // Segmenta a linha da fervura por puxada: `r.displayBoil` (calculado
    // uma vez só em annotateDisplayBoil, compartilhado com a escada — ver
    // N4) já resolve quando a panela tem decocção de verdade. Aqui só
    // agrupa as linhas consecutivas com displayBoil preenchido; fora
    // desses trechos a panela está vazia, então não desenha nada.
    const boilSegments = [];
    let currentSegment = null;
    for (const r of rows) {
      if (r.displayBoil !== null && r.displayBoil !== undefined) {
        if (!currentSegment) currentSegment = [];
        currentSegment.push({ t: r.totalMin, v: r.displayBoil });
      } else if (currentSegment) {
        if (currentSegment.length > 1) boilSegments.push(currentSegment);
        currentSegment = null;
      }
    }
    if (currentSegment && currentSegment.length > 1) boilSegments.push(currentSegment);
    const boilPts = boilSegments.flat();

    const allTemps = mashPts.concat(boilPts).map((p) => p.v);
    const tMin = Math.min(...allTemps) - 5;
    const tMax = Math.max(...allTemps) + 5;

    const x = (t) => padL + (total > 0 ? (t / total) * (W - padL - padR) : 0);
    const y = (v) => H - padB - ((v - tMin) / (tMax - tMin || 1)) * (H - padT - padB);

    const pathFor = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

    // Texto do SVG escala junto com o viewBox — num celular estreito, o
    // navegador encolhe tudo proporcionalmente e as legendas viram
    // ilegíveis (o viewBox continua 640px de largura "lógica" não importa
    // o quanto o SVG é comprimido na tela real). Mede a largura real
    // renderizada e aumenta o font-size declarado na mesma proporção, pra
    // manter um tamanho mínimo real na tela em qualquer largura.
    const renderedWidth = el.chart.getBoundingClientRect().width || W;
    const textScale = Math.max(1, W / renderedWidth);
    const axisFontSize = (8 * textScale).toFixed(1);
    const gridFontSize = (9 * textScale).toFixed(1);

    // A legenda só lista as faixas que o método atual realmente atravessa
    // — antes era HTML fixo com as 4 sempre, e em 4 dos 7 métodos alguma
    // faixa listada nunca aparecia desenhada (achado N8b).
    const visibleZones = [];
    const zoneRects = ENZYME_ZONES.map((z) => {
      const loC = Math.max(z.lo, tMin);
      const hiC = Math.min(z.hi, tMax);
      if (hiC <= loC) return "";
      visibleZones.push(z);
      const yTop = y(hiC), yBot = y(loC);
      // Mesma variável CSS da legenda (--zone-X), não o rgb() fixo de
      // antes — sem isso a faixa desenhada ficava com a paleta escura
      // sempre, discordando visualmente da legenda no tema claro (N8a/P8b).
      // SVG inline no documento enxerga custom properties normalmente.
      return `<rect x="${padL}" y="${yTop.toFixed(1)}" width="${(W - padL - padR).toFixed(1)}" height="${(yBot - yTop).toFixed(1)}" fill="var(--${z.cls})" fill-opacity="0.14" />`;
    }).join("");
    el.chartEnzymeLegend.innerHTML = visibleZones.length
      ? "Faixas de enzima (referência, Laus et al. 2022): " +
        visibleZones.map((z) => `<span class="${z.cls}">${z.label} ${z.lo}-${z.hi}°</span>`).join(" · ")
      : "";

    const gridLines = [];
    const gridTemps = [tMin + 5, tMax - 5];
    for (const gt of gridTemps) {
      gridLines.push(
        `<line x1="${padL}" y1="${y(gt).toFixed(1)}" x2="${W - padR}" y2="${y(gt).toFixed(1)}" style="stroke:var(--line);stroke-width:1" />` +
        `<text x="${padL - 6}" y="${(y(gt) + 3).toFixed(1)}" text-anchor="end" style="font-size:${gridFontSize}px;fill:var(--text-dim);font-family:var(--font-data)">${Math.round(gt)}°</text>`
      );
    }

    const mashChanges = changePoints(mashPts);
    const boilChanges = boilSegments.flatMap(changePoints);

    const axisBaseY = H - padB;
    const rawTickTimes = [...new Set([0, total, ...mashChanges.map((p) => p.t), ...boilChanges.map((p) => p.t)])].sort((a, b) => a - b);

    // Evita rótulos colados: descarta ticks a menos de 16px do último mantido (sempre guarda o primeiro e o último).
    const tickTimes = [];
    let lastPx = -Infinity;
    rawTickTimes.forEach((t, i) => {
      const px = x(t);
      const isEdge = i === 0 || i === rawTickTimes.length - 1;
      if (isEdge || px - lastPx >= 16) {
        tickTimes.push(t);
        lastPx = px;
      }
    });

    const ticks = tickTimes.map((t) => {
      const px = x(t).toFixed(1);
      return (
        `<line x1="${px}" y1="${axisBaseY.toFixed(1)}" x2="${px}" y2="${(axisBaseY + 4).toFixed(1)}" style="stroke:var(--text-dim);stroke-width:1" />` +
        `<text x="${px}" y="${(axisBaseY + 13).toFixed(1)}" text-anchor="end" transform="rotate(-50 ${px} ${(axisBaseY + 13).toFixed(1)})" style="font-size:${axisFontSize}px;fill:var(--text-dim);font-family:var(--font-data)">${fmtAxisTime(t)}</text>`
      );
    });

    const guides = tickTimes.filter((t) => t !== 0 && t !== total).map((t) => {
      const px = x(t).toFixed(1);
      return `<line x1="${px}" y1="${padT}" x2="${px}" y2="${axisBaseY.toFixed(1)}" style="stroke:var(--line);stroke-width:1;stroke-dasharray:2,3" />`;
    });

    const markers = (pts, color) => pts.map((p) => {
      const px = x(p.t).toFixed(1);
      const py = y(p.v).toFixed(1);
      return `<circle cx="${px}" cy="${py}" r="3" style="fill:${color};stroke:var(--surface);stroke-width:1.5"><title>${fmtAxisTime(p.t)} · ${fmtNum(p.v)}°C</title></circle>`;
    }).join("");

    const boilPath = boilSegments.map(pathFor).join(" ");

    el.chart.innerHTML = `
      ${zoneRects}
      ${gridLines.join("")}
      ${guides.join("")}
      <path d="${pathFor(mashPts)}" fill="none" style="stroke:var(--steel);stroke-width:2.5px" stroke-linejoin="round" />
      ${boilPath ? `<path d="${boilPath}" fill="none" style="stroke:var(--copper);stroke-width:2.5px" stroke-linejoin="round" />` : ""}
      ${markers(mashChanges, "var(--steel)")}
      ${markers(boilChanges, "var(--copper)")}
      ${ticks.join("")}
    `;

    // Guardado ANTES do playhead: updatePlayhead() (chamado sozinho a cada
    // tick do cronômetro, sem redesenhar o resto do gráfico) depende disso
    // já estar pronto pra reconstruir só a camada do marcador.
    chartGeom = { rows, mashPts, boilSegments, total, padL, padR, padT, padB, W, H, tMin, tMax };
    updatePlayhead(elapsedMin);
    if (hoverT !== null) paintChartHover();
  }

  // Camada do marcador "Agora" (linha + pontos âmbar), separada do resto do
  // SVG — assim o tick de 500ms do cronômetro (ver setInterval) só troca
  // essa camada, sem recriar grade/curvas/eixo inteiros a cada meio segundo
  // (era o item R1-8 do Raio-X: bateria e nada na tela selecionável).
  function playheadMarkup(elapsedMin) {
    if (!chartGeom || elapsedMin === null || elapsedMin === undefined) return "";
    const { mashPts, boilSegments, padT, H, padB } = chartGeom;
    const axisBaseY = H - padB;
    const px = chartXFromT(elapsedMin).toFixed(1);
    const mashPy = chartYFromV(valueAt(mashPts, elapsedMin)).toFixed(1);
    let markup = `<g id="playheadLayer">` +
      `<line x1="${px}" y1="${padT}" x2="${px}" y2="${axisBaseY.toFixed(1)}" style="stroke:var(--amber);stroke-width:1.5px;stroke-dasharray:4,2" />` +
      `<circle cx="${px}" cy="${mashPy}" r="4.5" style="fill:var(--amber);stroke:var(--surface);stroke-width:1.5" />`;
    const activeSegment = segmentAt(boilSegments, elapsedMin);
    if (activeSegment) {
      const boilPy = chartYFromV(valueAt(activeSegment, elapsedMin)).toFixed(1);
      markup += `<circle cx="${px}" cy="${boilPy}" r="4.5" style="fill:var(--amber);stroke:var(--surface);stroke-width:1.5" />`;
    }
    return markup + "</g>";
  }

  function updatePlayhead(elapsedMin) {
    const old = document.getElementById("playheadLayer");
    if (old) old.remove();
    const markup = playheadMarkup(elapsedMin);
    if (markup) el.chart.insertAdjacentHTML("beforeend", markup);
  }

  function chartXFromT(t) {
    return chartGeom.padL + (chartGeom.total > 0 ? (t / chartGeom.total) * (chartGeom.W - chartGeom.padL - chartGeom.padR) : 0);
  }

  function chartYFromV(v) {
    return chartGeom.H - chartGeom.padB - ((v - chartGeom.tMin) / (chartGeom.tMax - chartGeom.tMin || 1)) * (chartGeom.H - chartGeom.padT - chartGeom.padB);
  }

  function chartTFromX(px) {
    const span = chartGeom.W - chartGeom.padL - chartGeom.padR;
    if (span <= 0) return 0;
    const t = ((px - chartGeom.padL) / span) * chartGeom.total;
    return Math.max(0, Math.min(chartGeom.total, t));
  }

  function positionChartTooltip() {
    const panel = el.chart.parentElement;
    const panelRect = panel.getBoundingClientRect();
    const tw = el.chartTooltip.offsetWidth;
    const th = el.chartTooltip.offsetHeight;
    let left = lastClientX - panelRect.left + 14;
    let top = lastClientY - panelRect.top - th - 14;
    if (left + tw > panelRect.width - 4) left = lastClientX - panelRect.left - tw - 14;
    if (left < 4) left = 4;
    if (top < 4) top = lastClientY - panelRect.top + 14;
    el.chartTooltip.style.left = `${left}px`;
    el.chartTooltip.style.top = `${top}px`;
  }

  function paintChartHover() {
    const oldLayer = document.getElementById("chartHoverLayer");
    if (oldLayer) oldLayer.remove();

    if (!chartGeom || hoverT === null || !chartGeom.rows.length) {
      el.chartTooltip.hidden = true;
      return;
    }

    const { rows, mashPts, boilSegments } = chartGeom;
    const row = rows[currentStepIndex(rows, hoverT)];
    const mashV = valueAt(mashPts, hoverT);
    const hoverSegment = segmentAt(boilSegments, hoverT);
    const boilV = hoverSegment ? valueAt(hoverSegment, hoverT) : null;

    const px = chartXFromT(hoverT).toFixed(1);
    const axisBaseY = chartGeom.H - chartGeom.padB;
    const overlay =
      `<g id="chartHoverLayer">` +
      `<line x1="${px}" y1="${chartGeom.padT}" x2="${px}" y2="${axisBaseY.toFixed(1)}" style="stroke:var(--text-dim);stroke-width:1px;stroke-dasharray:3,3" />` +
      `<circle cx="${px}" cy="${chartYFromV(mashV).toFixed(1)}" r="4" style="fill:var(--steel);stroke:var(--surface);stroke-width:1.5" />` +
      (boilV !== null ? `<circle cx="${px}" cy="${chartYFromV(boilV).toFixed(1)}" r="4" style="fill:var(--copper);stroke:var(--surface);stroke-width:1.5" />` : "") +
      `</g>`;
    el.chart.insertAdjacentHTML("beforeend", overlay);

    el.chartTooltip.innerHTML =
      `<strong>${row.label}</strong>` +
      `<span>${fmtHM(hoverT)}</span>` +
      `<span>Mostura: ${fmtNum(mashV)}°C</span>` +
      (boilV !== null ? `<span>Fervura: ${fmtNum(boilV)}°C</span>` : "");
    el.chartTooltip.hidden = false;
    positionChartTooltip();
  }

  function updateChartHover(clientX, clientY) {
    if (!chartGeom || !chartGeom.rows.length) return;
    lastClientX = clientX;
    lastClientY = clientY;
    const rect = el.chart.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = (clientX - rect.left) * (chartGeom.W / rect.width);
    hoverT = chartTFromX(svgX);
    paintChartHover();
  }

  function clearChartHover() {
    hoverT = null;
    const oldLayer = document.getElementById("chartHoverLayer");
    if (oldLayer) oldLayer.remove();
    el.chartTooltip.hidden = true;
  }

  el.chart.addEventListener("mousemove", (e) => updateChartHover(e.clientX, e.clientY));
  el.chart.addEventListener("mouseleave", clearChartHover);

  // O tooltip do gráfico era só de mouse (mousemove/mouseleave) — no
  // celular, que é o aparelho usado durante a brassagem, ele não existia.
  // touchstart mostra no toque; touchmove arrasta (com preventDefault, pra
  // não rolar a página enquanto o dedo desliza sobre o gráfico); touchend
  // esconde, igual ao mouseleave.
  el.chart.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    if (t) updateChartHover(t.clientX, t.clientY);
  }, { passive: true });
  el.chart.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (t) { updateChartHover(t.clientX, t.clientY); e.preventDefault(); }
  }, { passive: false });
  el.chart.addEventListener("touchend", clearChartHover);
  el.chart.addEventListener("touchcancel", clearChartHover);

  function renderPresetOptions() {
    const presets = loadPresets()[state.methodId] || {};
    el.presetSelect.innerHTML = '<option value="">Predefinições…</option>';
    for (const name of Object.keys(presets).sort()) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      el.presetSelect.appendChild(opt);
    }
  }

  el.loadPresetBtn.addEventListener("click", () => {
    const name = el.presetSelect.value;
    if (!name) return;
    const presets = loadPresets();
    const saved = presets[state.methodId] && presets[state.methodId][name];
    if (!saved) return;
    const method = getMethod(state.methodId);
    state.params = sanitizeParams(method, saved);
    persistCurrentParams();
    renderForm();
    renderResults();
    toast(`Predefinição "${name}" carregada.`);
  });

  // <dialog> estilizado, igual ao de salvar — antes usava confirm() nativo
  // do navegador: tipografia diferente, idioma do botão fora do nosso
  // controle, e travava a página inteira até o usuário responder.
  el.deletePresetBtn.addEventListener("click", () => {
    const name = el.presetSelect.value;
    if (!name) return;
    el.deleteModalText.textContent = `Excluir a predefinição "${name}"? Essa ação não pode ser desfeita.`;
    el.deleteModal.showModal();
  });
  el.cancelDeleteBtn.addEventListener("click", () => el.deleteModal.close());
  el.confirmDeleteBtn.addEventListener("click", () => {
    const name = el.presetSelect.value;
    el.deleteModal.close();
    if (!name) return;
    const presets = loadPresets();
    if (presets[state.methodId]) delete presets[state.methodId][name];
    savePresets(presets);
    renderPresetOptions();
    toast(`Predefinição "${name}" excluída.`);
  });

  el.savePresetBtn.addEventListener("click", () => {
    el.presetNameInput.value = "";
    el.saveModal.showModal();
    el.presetNameInput.focus();
  });
  el.cancelSaveBtn.addEventListener("click", () => el.saveModal.close());
  el.confirmSaveBtn.addEventListener("click", () => {
    const name = el.presetNameInput.value.trim();
    if (!name) return;
    const presets = loadPresets();
    presets[state.methodId] = presets[state.methodId] || {};
    presets[state.methodId][name] = { ...state.params };
    savePresets(presets);
    el.saveModal.close();
    renderPresetOptions();
    el.presetSelect.value = name;
    toast(`Predefinição "${name}" salva.`);
  });

  el.resetBtn.addEventListener("click", () => {
    const method = getMethod(state.methodId);
    state.params = defaultParams(method);
    persistCurrentParams();
    renderForm();
    renderResults();
    toast("Parâmetros restaurados ao padrão.");
  });

  // Mantém a tela acesa enquanto o cronômetro roda (R1-3) — sem isso a
  // tela apaga no meio da brassagem, no aparelho usado como cronômetro.
  // Alguns navegadores recusam sem gesto do usuário ou com a aba em 2º
  // plano; falha silenciosamente nesse caso (só não trava a tela).
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    } catch (e) { /* ignora — degrada bem sem travar a tela */ }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && timer.running && !wakeLock) requestWakeLock();
  });

  // Alarme sonoro + vibração quando o tempo previsto da etapa atual é
  // atingido (R1-2) — sem isso o brassador precisa ficar olhando pro
  // relógio o tempo todo. Um AudioContext só, criado/retomado no primeiro
  // gesto do usuário (clique em Iniciar/Cheguei) e reaproveitado — criar
  // um novo a cada alarme arrisca ser bloqueado pela política de autoplay.
  let audioCtx = null;
  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) audioCtx = new Ctor();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    updateAudioWarning();
  }

  // Um toast some sozinho em 2,2s e divide o mesmo elemento com o aviso de
  // troca de método e o de nova versão — quem olhar pro celular 3s depois
  // de recarregar a página (com a brassagem ainda rodando) não vê mais
  // nada dizendo que o som está desligado, e fica sem alarme pro resto da
  // brassagem sem saber (achado N6). Uma pílula fixa no painel do
  // cronômetro, em vez de um aviso passageiro: aparece enquanto o
  // cronômetro roda sem áudio pronto, some sozinha no primeiro toque.
  function updateAudioWarning() {
    el.audioWarning.hidden = !(timer.running && !audioCtx);
  }
  function fireAlarm() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  }

  // Um aviso só é fácil de perder — celular no bolso, do outro lado da
  // garagem — e como o avanço agora é 100% manual (via "Cheguei"), sem
  // repetição o cronograma fica congelado ali até alguém notar sozinho
  // (achado P3a). Repete a cada REPEAT_EVERY_MIN enquanto a etapa não é
  // confirmada, até um teto de MAX_REPEATS. Estado persistido em
  // `timer.alarm` (não só em memória) pra sobreviver a um reload sem
  // re-disparar do zero nem esquecer quantas vezes já tocou (P3c).
  const ALARM_MAX_REPEATS = 4;
  const ALARM_REPEAT_EVERY_MIN = 2;
  function maybeAlarm(rows, activeIndex, nowMin, finished) {
    if (!timer.running || finished || activeIndex < 0 || activeIndex >= rows.length || nowMin === null) return;
    if (nowMin < rows[activeIndex].totalMin - 1e-9) return;
    if (timer.alarm.index !== activeIndex) timer.alarm = { index: activeIndex, count: 0, lastAtMin: -Infinity };
    if (timer.alarm.count >= ALARM_MAX_REPEATS) return;
    if (nowMin - timer.alarm.lastAtMin < ALARM_REPEAT_EVERY_MIN) return;
    timer.alarm.count++;
    timer.alarm.lastAtMin = nowMin;
    saveTimer();
    fireAlarm();
  }

  el.timerToggleBtn.addEventListener("click", () => {
    // Sem isso, clicar no botão principal depois de concluído (rótulo
    // ficava "Continuar" — decidido só por accumulatedMs>0, sem checar se
    // o programa tinha terminado) recomeçava a contar num programa já
    // concluído, com "Cheguei" ainda desabilitado (achado P5).
    if (isTimerFinished()) {
      el.timerResetBtn.click();
      return;
    }
    ensureAudioCtx(); // gesto do usuário — desbloqueia o alarme sonoro (autoplay)
    if (timer.running) {
      timer.accumulatedMs = timerElapsedMs();
      timer.running = false;
      timer.startEpoch = null;
      releaseWakeLock();
    } else {
      timer.startEpoch = Date.now() - timer.accumulatedMs;
      timer.running = true;
      requestWakeLock();
    }
    saveTimer();
    renderResults();
  });

  function doResetTimer() {
    timer = { running: false, startEpoch: null, accumulatedMs: 0, actualStepEndMin: [], alarm: defaultAlarmState() };
    releaseWakeLock();
    saveTimer();
    renderResults();
  }
  // Excluir uma predefinição (fácil de refazer em 10s) já pede confirmação
  // — "Resetar" apagava o registro de horários reais de uma brassagem
  // inteira sem perguntar nada, do lado do botão mais apertado do dia
  // ("Cheguei"). Só confirma quando já existe algo pra perder.
  el.timerResetBtn.addEventListener("click", () => {
    if (timer.actualStepEndMin.length === 0) { doResetTimer(); return; }
    el.resetModal.showModal();
  });
  el.cancelResetBtn.addEventListener("click", () => el.resetModal.close());
  el.confirmResetBtn.addEventListener("click", () => {
    el.resetModal.close();
    doResetTimer();
  });

  // "Cheguei" substitui a antiga "Próxima etapa": em vez de empurrar o
  // relógio pro horário previsto da próxima etapa (que ignorava atrasos),
  // registra o minuto REAL em que o usuário confirma ter concluído a etapa
  // atual. A etapa ativa é só `actualStepEndMin.length` — ver comentário
  // acima de `activeStepIndex`.
  el.timerArriveBtn.addEventListener("click", () => {
    const rows = state.rows || [];
    const activeIndex = activeStepIndex(rows.length);
    if (activeIndex < 0 || activeIndex >= rows.length) return;
    ensureAudioCtx();
    timer.actualStepEndMin.push(timerElapsedMs() / 60000);
    if (timer.actualStepEndMin.length >= rows.length) {
      // Confirmou a última etapa: encerra sozinho, em vez de deixar o
      // relógio correndo pra sempre (era o R1-1 do Raio-X).
      timer.accumulatedMs = timerElapsedMs();
      timer.running = false;
      timer.startEpoch = null;
      releaseWakeLock();
    }
    saveTimer();
    renderResults();
  });

  setInterval(tickTimer, 500);

  el.exportBtn.addEventListener("click", () => {
    const currentByMethod = {};
    // Só o registro de quem já confirmou pelo menos uma etapa — currentByMethod
    // guarda config pra todo mundo, mas exportar um cronômetro zerado (sem
    // nenhum "Cheguei" apertado) não tem informação nenhuma pra dar.
    const timerByMethod = {};
    for (const m of METHODS) {
      currentByMethod[m.id] = loadCurrentParams(m.id);
      const t = loadTimer(m.id);
      if (t.actualStepEndMin.length > 0) timerByMethod[m.id] = { actualStepEndMin: t.actualStepEndMin };
    }
    const payload = {
      app: "decoccao",
      version: 1, // versão do FORMATO do arquivo (schema), não do app — ver appVersion
      appVersion: window.APP_VERSION || null,
      exportedAt: new Date().toISOString(),
      currentByMethod,
      presets: loadPresets(),
      timerByMethod,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `decoccao-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Configuração exportada.");
  });

  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", async () => {
    const file = el.importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.currentByMethod) {
        for (const [id, params] of Object.entries(data.currentByMethod)) {
          if (getMethod(id).id === id) localStorage.setItem(CURRENT_KEY(id), JSON.stringify(params));
        }
      }
      if (data.presets) {
        const existing = loadPresets();
        for (const [id, byName] of Object.entries(data.presets)) {
          existing[id] = { ...(existing[id] || {}), ...byName };
        }
        savePresets(existing);
      }
      state.params = loadCurrentParams(state.methodId);
      renderForm();
      renderPresetOptions();
      renderResults();
      toast("Configuração importada.");
    } catch (e) {
      toast("Arquivo inválido.");
    } finally {
      el.importFile.value = "";
    }
  });

  document.addEventListener("click", closeHints);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHints();
  });
  el.methodSelect.addEventListener("change", () => switchMethod(el.methodSelect.value));

  // Tema: "claro"/"escuro" fixam data-theme (força o resultado, veja o
  // CSS); "sistema" remove o atributo e volta a seguir prefers-color-scheme.
  // Ícones (sol/lua/meia-lua) em vez de uma letra só — "A"/"C"/"E" não é
  // adivinhável, e num botão redondo de 30px o hover era a única pista.
  const THEME_CYCLE = ["system", "light", "dark"];
  const THEME_ICON = {
    system: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="3.5" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><line x1="8" y1="0.5" x2="8" y2="2.3"/><line x1="8" y1="13.7" x2="8" y2="15.5"/><line x1="0.5" y1="8" x2="2.3" y2="8"/><line x1="13.7" y1="8" x2="15.5" y2="8"/><line x1="2.6" y1="2.6" x2="3.9" y2="3.9"/><line x1="12.1" y1="12.1" x2="13.4" y2="13.4"/><line x1="2.6" y1="13.4" x2="3.9" y2="12.1"/><line x1="12.1" y1="3.9" x2="13.4" y2="2.6"/></g></svg>',
    dark: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13 8.5A5.5 5.5 0 1 1 7.5 3a4.3 4.3 0 1 0 5.5 5.5z" fill="currentColor"/></svg>',
  };
  const THEME_TITLE = { system: "Tema: sistema (clique pra claro)", light: "Tema: claro (clique pra escuro)", dark: "Tema: escuro (clique pra sistema)" };
  function applyTheme(mode) {
    if (mode === "light" || mode === "dark") document.documentElement.setAttribute("data-theme", mode);
    else document.documentElement.removeAttribute("data-theme");
    el.themeToggle.innerHTML = THEME_ICON[mode];
    el.themeToggle.title = THEME_TITLE[mode];
    el.themeToggle.setAttribute("aria-label", THEME_TITLE[mode]);
  }
  el.themeToggle.addEventListener("click", () => {
    const current = localStorage.getItem(THEME_KEY) || "system";
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) || "system");
    el.footerVersion.textContent = `v${window.APP_VERSION || "?"}`;

    // Uma brassagem em andamento é mais importante que a última aba visitada:
    // sem isso, trocar de método pra comparar uma temperatura e reabrir a
    // página (ou aceitar "Nova versão · Recarregar") fazia a brassagem
    // continuar rodando no armazenamento sem nenhum indício na tela —
    // relógio, wake lock e alarme, todos inacessíveis (achado N3).
    const rodando = METHODS.find((m) => {
      const stored = safeParse(localStorage.getItem(TIMER_KEY(m.id)), null);
      return stored && stored.running;
    });
    if (rodando && rodando.id !== state.methodId) {
      state.methodId = rodando.id;
      localStorage.setItem(LAST_METHOD_KEY, rodando.id);
    }

    state.params = loadCurrentParams(state.methodId);
    timer = loadTimer(state.methodId);
    renderTabs();
    renderForm();
    renderPresetOptions();

    // Uma sessão restaurada (reload no meio da brassagem — acidental, o
    // celular descartou a aba, ou o próprio toast "Nova versão ·
    // Recarregar") mantinha relógio/etapa/atraso certinhos, mas perdia o
    // wake lock e o alarme sonoro: os dois só eram pedidos no clique de
    // "Iniciar"/"Cheguei", nunca no carregamento da página (achado P2).
    // Roda antes do primeiro renderResults() — que já pode disparar
    // maybeAlarm() se a etapa atual já estiver vencida desde antes do
    // reload — pra pílula de "som desativado" (N6) já estar visível nesse
    // primeiro instante, não só depois de um segundo render.
    if (timer.running) {
      requestWakeLock(); // não exige gesto do usuário, diferente do áudio
      if (!audioCtx) document.addEventListener("click", ensureAudioCtx, { once: true });
    }

    renderResults();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").then((reg) => {
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateToast();
              }
            });
          });
        }).catch(() => {});
      });
    }
  }

  init();
})();
