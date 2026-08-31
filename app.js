(function () {
  "use strict";

  const { METHODS, getMethod, defaultParams, computeSchedule, totalMashVolumeL } = window.Decoccao;
  const STORAGE_PREFIX = "decoccao:v1";
  const CURRENT_KEY = (id) => `${STORAGE_PREFIX}:current:${id}`;
  const PRESETS_KEY = `${STORAGE_PREFIX}:presets`;
  const LAST_METHOD_KEY = `${STORAGE_PREFIX}:lastMethod`;
  const TIMER_KEY = (id) => `${STORAGE_PREFIX}:timer:${id}`;

  const el = {
    methodTabs: document.getElementById("methodTabs"),
    methodSelect: document.getElementById("methodSelect"),
    methodDescription: document.getElementById("methodDescription"),
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
    timerToggleBtn: document.getElementById("timerToggleBtn"),
    timerNextBtn: document.getElementById("timerNextBtn"),
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
    saveModal: document.getElementById("saveModal"),
    presetNameInput: document.getElementById("presetNameInput"),
    cancelSaveBtn: document.getElementById("cancelSaveBtn"),
    confirmSaveBtn: document.getElementById("confirmSaveBtn"),
    toast: document.getElementById("toast"),
    toastText: document.getElementById("toastText"),
    toastAction: document.getElementById("toastAction"),
    footerVersion: document.getElementById("footerVersion"),
  };

  let state = {
    methodId: localStorage.getItem(LAST_METHOD_KEY) || METHODS[0].id,
    params: {},
  };

  let timer = { running: false, startEpoch: null, accumulatedMs: 0 };
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

  function loadCurrentParams(methodId) {
    const method = getMethod(methodId);
    const stored = safeParse(localStorage.getItem(CURRENT_KEY(methodId)), null);
    const defaults = defaultParams(method);
    if (!stored) return defaults;
    return { ...defaults, ...stored };
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

  function loadTimer(methodId) {
    const stored = safeParse(localStorage.getItem(TIMER_KEY(methodId)), null);
    return stored && typeof stored.accumulatedMs === "number"
      ? { running: !!stored.running, startEpoch: stored.startEpoch || null, accumulatedMs: stored.accumulatedMs }
      : { running: false, startEpoch: null, accumulatedMs: 0 };
  }

  function saveTimer() {
    localStorage.setItem(TIMER_KEY(state.methodId), JSON.stringify(timer));
  }

  function timerElapsedMs() {
    return timer.running ? Date.now() - timer.startEpoch : timer.accumulatedMs;
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
      const btn = document.createElement("button");
      btn.className = "method-tab";
      btn.type = "button";
      btn.role = "tab";
      btn.textContent = m.name;
      btn.setAttribute("aria-selected", String(m.id === state.methodId));
      btn.addEventListener("click", () => switchMethod(m.id));
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
    const newDescription = getMethod(state.methodId).description || "";
    if (el.methodDescription.textContent !== newDescription) {
      el.methodDescription.textContent = newDescription;
      el.methodDescription.classList.add("is-switching");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => el.methodDescription.classList.remove("is-switching"));
      });
    }
  }

  function switchMethod(id) {
    state.methodId = id;
    state.params = loadCurrentParams(id);
    timer = loadTimer(id);
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
    document.querySelectorAll(".hint.is-open").forEach((b) => b.classList.remove("is-open"));
  }

  function makeHintBtn(text) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hint";
    btn.textContent = "?";
    btn.setAttribute("aria-label", "Mais informações");
    btn.setAttribute("data-tip", text);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = btn.classList.contains("is-open");
      closeHints();
      if (!wasOpen) btn.classList.add("is-open");
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
  function volumeHintText(r) {
    const base = "Volume estimado a retirar (\"puxar\") da tina de mostura e levar pra fervura nesta decocção. " +
      "O valor já é o total dessa fração (grão + líquido), calculado pelo balanço de energia entre a temperatura atual e a temperatura alvo após o retorno.";
    const big = r.decoctionFraction >= 0.5;
    const waterNote = " Vale afinar com um pouco de água (5-10% do volume da puxada) antes de ferver, pra facilitar mexer.";
    if (r.restsForConversion) {
      let text = base + " Essa puxada ainda vai descansar pra sacarificação antes da fervura, então mantenha-a só um pouco mais grossa que a mostura principal — grão sempre submerso no líquido, nunca seco.";
      if (big) {
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
    if (big) {
      text += " Atenção: essa fração passa de 50% do volume total e não tem descanso de conversão próprio nem retorna em parcelas — confirme que o resto da mostura já converteu todo o amido antes de puxar tanto.";
    }
    return text;
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
    for (const g of groups) {
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
      el.form.appendChild(wrap);
    }
  }

  function renderResults() {
    const method = getMethod(state.methodId);
    const rows = computeSchedule(method, state.params);
    const total = rows.length ? rows[rows.length - 1].totalMin : 0;
    state.rows = rows;
    state.total = total;

    el.totalTime.innerHTML = `${fmtHM(total)} <span>tempo total de processo</span>`;
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

    const elapsedMin = timerElapsedMs() / 60000;
    const clampedElapsed = Math.max(0, Math.min(elapsedMin, total));
    const activeIndex = rows.length ? currentStepIndex(rows, clampedElapsed) : -1;
    const finished = total > 0 && elapsedMin >= total - 1e-6;

    renderLadder(rows, activeIndex);
    renderChart(rows, state.params, total > 0 ? clampedElapsed : null);
    renderTimerUI(rows, activeIndex, finished);
  }

  function renderTimerUI(rows, activeIndex, finished) {
    el.timerClock.textContent = fmtClock(timerElapsedMs() / 1000);
    el.timerPanel.classList.toggle("is-running", timer.running);
    el.timerToggleBtn.textContent = timer.running ? "Pausar" : (timer.accumulatedMs > 0 ? "Continuar" : "Iniciar");
    if (finished) {
      el.timerStepLabel.innerHTML = `<strong>Programa concluído</strong>`;
    } else if (rows.length && activeIndex >= 0) {
      const row = rows[activeIndex];
      const remainingMin = Math.max(0, row.totalMin - timerElapsedMs() / 60000);
      el.timerStepLabel.innerHTML = `Etapa atual: <strong>${row.label}</strong> · faltam ${fmtNum(remainingMin)} min`;
    } else {
      el.timerStepLabel.textContent = "Pronto para começar";
    }
  }

  function renderLadder(rows, activeIndex) {
    el.ladder.innerHTML = "";
    rows.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "ladder-row";
      if (i === activeIndex) row.classList.add("is-active");
      else if (activeIndex >= 0 && i < activeIndex) row.classList.add("is-done");

      const rail = document.createElement("div");
      rail.className = "ladder-rail";
      const dot = document.createElement("div");
      dot.className = "ladder-dot";
      const dotTemp = r.boil !== null && r.boil !== undefined ? r.boil : r.mash;
      dot.style.background = tempColor(dotTemp);
      rail.appendChild(dot);

      const label = document.createElement("div");
      label.className = "ladder-label";
      label.innerHTML = `${r.label}<small>${fmtNum(r.duration)} min · até ${fmtHM(r.totalMin)}</small>`;

      const time = document.createElement("div");
      time.className = "ladder-time";
      time.innerHTML = `<strong>${fmtNum(r.duration)}</strong> min`;

      const temp = document.createElement("div");
      temp.className = "ladder-temp";
      const mashPill = r.mash !== null && r.mash !== undefined
        ? `<span class="temp-pill temp-pill--mash">${fmtNum(r.mash)}°</span>`
        : `<span class="temp-pill temp-pill--empty">—</span>`;
      const boilPill = r.boil !== null && r.boil !== undefined
        ? `<span class="temp-pill temp-pill--boil">${fmtNum(r.boil)}°</span>`
        : `<span class="temp-pill temp-pill--empty">—</span>`;
      temp.innerHTML = mashPill + " " + boilPill;

      const volume = document.createElement("div");
      volume.className = "ladder-volume";
      if (r.decoctionVolumeL !== undefined) {
        const pill = document.createElement("span");
        pill.className = "temp-pill temp-pill--volume";
        pill.textContent = `puxar ≈${fmtNum(r.decoctionVolumeL)} L`;
        const hint = makeHintBtn(volumeHintText(r));
        hint.classList.add("hint--volume");
        const small = document.createElement("small");
        small.textContent = `${fmtNum(r.decoctionFraction * 100)}% do volume`;
        volume.appendChild(pill);
        volume.appendChild(hint);
        volume.appendChild(small);
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

  function renderChart(rows, params, elapsedMin) {
    const W = 640, H = 218;
    const padL = 34, padR = 12, padT = 14, padB = 40;
    const total = rows.length ? rows[rows.length - 1].totalMin : 1;

    const initialMashTemp = rows.length ? rows[0].mash : params.mashInTemp;
    const mashPts = [{ t: 0, v: initialMashTemp }];
    for (const r of rows) mashPts.push({ t: r.totalMin, v: r.mash });

    const boilPts = [];
    for (const r of rows) if (r.boil !== null && r.boil !== undefined) boilPts.push({ t: r.totalMin, v: r.boil });

    const allTemps = mashPts.concat(boilPts).map((p) => p.v);
    const tMin = Math.min(...allTemps) - 5;
    const tMax = Math.max(...allTemps) + 5;

    const x = (t) => padL + (total > 0 ? (t / total) * (W - padL - padR) : 0);
    const y = (v) => H - padB - ((v - tMin) / (tMax - tMin || 1)) * (H - padT - padB);

    const pathFor = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

    const gridLines = [];
    const gridTemps = [tMin + 5, (tMin + tMax) / 2, tMax - 5];
    for (const gt of gridTemps) {
      gridLines.push(
        `<line x1="${padL}" y1="${y(gt).toFixed(1)}" x2="${W - padR}" y2="${y(gt).toFixed(1)}" style="stroke:var(--line);stroke-width:1" />` +
        `<text x="${padL - 6}" y="${(y(gt) + 3).toFixed(1)}" text-anchor="end" style="font-size:9px;fill:var(--text-dim);font-family:var(--font-data)">${Math.round(gt)}°</text>`
      );
    }

    const mashChanges = changePoints(mashPts);
    const boilChanges = changePoints(boilPts);

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
        `<text x="${px}" y="${(axisBaseY + 13).toFixed(1)}" text-anchor="end" transform="rotate(-50 ${px} ${(axisBaseY + 13).toFixed(1)})" style="font-size:8px;fill:var(--text-dim);font-family:var(--font-data)">${fmtAxisTime(t)}</text>`
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

    let playhead = "";
    if (elapsedMin !== null && elapsedMin !== undefined) {
      const px = x(elapsedMin).toFixed(1);
      const mashPy = y(valueAt(mashPts, elapsedMin)).toFixed(1);
      playhead = `<line x1="${px}" y1="${padT}" x2="${px}" y2="${axisBaseY.toFixed(1)}" style="stroke:var(--amber);stroke-width:1.5px;stroke-dasharray:4,2" />` +
        `<circle cx="${px}" cy="${mashPy}" r="4.5" style="fill:var(--amber);stroke:var(--surface);stroke-width:1.5" />`;
      if (boilPts.length && elapsedMin >= boilPts[0].t && elapsedMin <= boilPts[boilPts.length - 1].t) {
        const boilPy = y(valueAt(boilPts, elapsedMin)).toFixed(1);
        playhead += `<circle cx="${px}" cy="${boilPy}" r="4.5" style="fill:var(--amber);stroke:var(--surface);stroke-width:1.5" />`;
      }
    }

    el.chart.innerHTML = `
      ${gridLines.join("")}
      ${guides.join("")}
      <path d="${pathFor(mashPts)}" fill="none" style="stroke:var(--steel);stroke-width:2.5px" stroke-linejoin="round" />
      ${boilPts.length ? `<path d="${pathFor(boilPts)}" fill="none" style="stroke:var(--copper);stroke-width:2.5px" stroke-linejoin="round" />` : ""}
      ${markers(mashChanges, "var(--steel)")}
      ${markers(boilChanges, "var(--copper)")}
      ${ticks.join("")}
      ${playhead}
    `;

    chartGeom = { rows, mashPts, boilPts, total, padL, padR, padT, padB, W, H, tMin, tMax };
    if (hoverT !== null) paintChartHover();
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

    const { rows, mashPts, boilPts } = chartGeom;
    const row = rows[currentStepIndex(rows, hoverT)];
    const mashV = valueAt(mashPts, hoverT);
    const inBoilRange = boilPts.length && hoverT >= boilPts[0].t && hoverT <= boilPts[boilPts.length - 1].t;
    const boilV = inBoilRange ? valueAt(boilPts, hoverT) : null;

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
    state.params = { ...defaultParams(method), ...saved };
    persistCurrentParams();
    renderForm();
    renderResults();
    toast(`Predefinição "${name}" carregada.`);
  });

  el.deletePresetBtn.addEventListener("click", () => {
    const name = el.presetSelect.value;
    if (!name) return;
    if (!confirm(`Excluir a predefinição "${name}"?`)) return;
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

  el.timerToggleBtn.addEventListener("click", () => {
    if (timer.running) {
      timer.accumulatedMs = timerElapsedMs();
      timer.running = false;
      timer.startEpoch = null;
    } else {
      timer.startEpoch = Date.now() - timer.accumulatedMs;
      timer.running = true;
    }
    saveTimer();
    renderResults();
  });

  el.timerResetBtn.addEventListener("click", () => {
    timer = { running: false, startEpoch: null, accumulatedMs: 0 };
    saveTimer();
    renderResults();
  });

  el.timerNextBtn.addEventListener("click", () => {
    const rows = state.rows || [];
    if (!rows.length) return;
    const elapsedMin = timerElapsedMs() / 60000;
    const idx = currentStepIndex(rows, Math.max(0, Math.min(elapsedMin, state.total)));
    const targetMs = rows[idx].totalMin * 60000;
    timer.accumulatedMs = targetMs;
    if (timer.running) timer.startEpoch = Date.now() - targetMs;
    saveTimer();
    renderResults();
  });

  setInterval(() => {
    if (timer.running) renderResults();
  }, 500);

  el.exportBtn.addEventListener("click", () => {
    const currentByMethod = {};
    for (const m of METHODS) currentByMethod[m.id] = loadCurrentParams(m.id);
    const payload = {
      app: "decoccao",
      version: 1,
      exportedAt: new Date().toISOString(),
      currentByMethod,
      presets: loadPresets(),
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

  function init() {
    el.footerVersion.textContent = `v${window.APP_VERSION || "?"}`;
    state.params = loadCurrentParams(state.methodId);
    timer = loadTimer(state.methodId);
    renderTabs();
    renderForm();
    renderPresetOptions();
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
