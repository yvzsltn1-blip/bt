"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  parseCount,
  calculateArmyPoints,
  simulateBattle,
  BLOOD_BY_ALLY_KEY
} = window.BattleCore;

const OPTIMIZER_RELIABILITY_STORAGE_KEY = "bt-analiz.optimizer-reliability.v1";
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";
const DEFAULT_SAMPLE_MODE = "fixed";
const DEFAULT_SAMPLE_COUNT = 750;
const DEFAULT_SAMPLE_OPTION = `${DEFAULT_SAMPLE_MODE}:${DEFAULT_SAMPLE_COUNT}`;

const inputRefs = {};
const reliabilityEnemyInputs = document.querySelector("#reliabilityEnemyInputs");
const reliabilityAllyInputs = document.querySelector("#reliabilityAllyInputs");
const reliabilityStatus = document.querySelector("#reliabilityStatus");
const reliabilityPointsValue = document.querySelector("#reliabilityPointsValue");
const analysisSampleCount = document.querySelector("#analysisSampleCount");
const reliabilitySummaryPanel = document.querySelector("#reliabilitySummaryPanel");
const reliabilityMetaPanel = document.querySelector("#reliabilityMetaPanel");
const reliabilityNotesPanel = document.querySelector("#reliabilityNotesPanel");
const scenarioList = document.querySelector("#scenarioList");
const scenarioLogOutput = document.querySelector("#scenarioLogOutput");
const analyzeReliabilityBtn = document.querySelector("#analyzeReliabilityBtn");
const loadOptimizerPayloadBtn = document.querySelector("#loadOptimizerPayloadBtn");
const sampleReliabilityBtn = document.querySelector("#sampleReliabilityBtn");
const clearReliabilityBtn = document.querySelector("#clearReliabilityBtn");

let lastOptimizerPayload = null;
let currentAnalysis = null;

buildInputs(reliabilityEnemyInputs, ENEMY_UNITS, "enemy");
buildInputs(reliabilityAllyInputs, ALLY_UNITS, "ally");
wireSequentialInputOrder([
  ...ENEMY_UNITS.map((unit) => inputRefs[unit.key]),
  ...ALLY_UNITS.map((unit) => inputRefs[unit.key])
]);
resetValues();
hydrateFromOptimizer();

analyzeReliabilityBtn.addEventListener("click", () => {
  void runReliabilityAnalysis();
});

loadOptimizerPayloadBtn.addEventListener("click", () => {
  const hydrated = hydrateFromOptimizer();
  if (!hydrated) {
    reliabilityStatus.textContent = "Yuklenecek veri yok";
  }
});

sampleReliabilityBtn.addEventListener("click", () => {
  loadSampleValues();
  reliabilityStatus.textContent = "Ornek ordu yuklendi";
});

clearReliabilityBtn.addEventListener("click", () => {
  resetValues();
  lastOptimizerPayload = null;
  currentAnalysis = null;
  reliabilitySummaryPanel.innerHTML = '<p class="summary-empty">Analiz henuz calismadi.</p>';
  reliabilityMetaPanel.innerHTML = "";
  reliabilityNotesPanel.innerHTML = "";
  scenarioList.innerHTML = '<p class="summary-empty">Analizden sonra ornek seed senaryolari burada listelenecek.</p>';
  scenarioLogOutput.innerHTML = "";
  renderLineBlock(scenarioLogOutput, ["Bir seed senaryosu secildiginde tam savas gunlugu burada gosterilecek."]);
  reliabilityStatus.textContent = "Sifirlandi";
});

function buildInputs(target, units, side) {
  target.innerHTML = "";
  units.forEach((unit) => {
    const row = document.createElement("div");
    row.className = "unit-row";

    const label = document.createElement("label");
    label.htmlFor = `reliability-${side}-${unit.key}`;
    label.textContent = unit.label;

    const input = createNumberInput(`reliability-${side}-${unit.key}`, "0");
    input.addEventListener("input", () => {
      if (side === "ally") {
        renderPointSummary();
      }
    });

    row.append(label, input);
    target.appendChild(row);
    inputRefs[unit.key] = input;
  });
}

function createNumberInput(id, initialValue) {
  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.inputMode = "numeric";
  input.pattern = "[0-9]*";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.enterKeyHint = "done";
  input.value = initialValue;

  input.addEventListener("focus", () => {
    if (input.value === "0") {
      input.value = "";
      return;
    }
    input.select();
  });

  input.addEventListener("blur", () => {
    if (input.value.trim() === "") {
      input.value = "0";
    }
  });

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D+/g, "");
  });

  return input;
}

function wireSequentialInputOrder(inputs) {
  const filteredInputs = inputs.filter(Boolean);
  filteredInputs.forEach((input, index) => {
    const nextInput = filteredInputs[index + 1] || null;
    input.enterKeyHint = nextInput ? "next" : "done";
    input.onkeydown = (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
        return;
      }
      input.blur();
    };
  });
}

function collectCounts(units) {
  const counts = {};
  units.forEach((unit) => {
    counts[unit.key] = parseCount(inputRefs[unit.key].value, unit.label);
  });
  return counts;
}

function renderPointSummary() {
  reliabilityPointsValue.textContent = String(calculateArmyPoints(collectCounts(ALLY_UNITS)));
}

function loadSampleValues() {
  [...ENEMY_UNITS, ...ALLY_UNITS].forEach((unit) => {
    inputRefs[unit.key].value = String(unit.sample);
  });
  renderPointSummary();
}

function resetValues() {
  [...ENEMY_UNITS, ...ALLY_UNITS].forEach((unit) => {
    inputRefs[unit.key].value = "0";
  });
  renderPointSummary();
}

function hydrateFromOptimizer() {
  try {
    const raw = window.sessionStorage.getItem(OPTIMIZER_RELIABILITY_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    window.sessionStorage.removeItem(OPTIMIZER_RELIABILITY_STORAGE_KEY);
    const payload = JSON.parse(raw);
    if (!payload?.enemyCounts || !payload?.allyCounts) {
      return false;
    }

    lastOptimizerPayload = payload;
    ENEMY_UNITS.forEach((unit) => {
      inputRefs[unit.key].value = String(payload.enemyCounts[unit.key] || 0);
    });
    ALLY_UNITS.forEach((unit) => {
      inputRefs[unit.key].value = String(payload.allyCounts[unit.key] || 0);
    });
    if (analysisSampleCount) {
      analysisSampleCount.value = DEFAULT_SAMPLE_OPTION;
    }
    renderPointSummary();
    reliabilityStatus.textContent = "Optimizer dizilimi yuklendi";
    void runReliabilityAnalysis();
    return true;
  } catch (error) {
    console.warn("Optimizer guvenilirlik aktarimi okunamadi.", error);
    reliabilityStatus.textContent = "Yukleme hatasi";
    return false;
  }
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildDeterministicSeeds(enemyCounts, allyCounts, sampleCount) {
  const signature = JSON.stringify({
    enemy: ENEMY_UNITS.map((unit) => enemyCounts[unit.key] || 0),
    ally: ALLY_UNITS.map((unit) => allyCounts[unit.key] || 0)
  });
  const baseHash = hashText(`${signature}|reliability`);
  return Array.from({ length: sampleCount }, (_, index) => 700001 + ((baseHash + index * 977) >>> 0));
}

function buildRandomSeeds(sampleCount) {
  return Array.from({ length: sampleCount }, () => 700001 + Math.floor(Math.random() * 2140000000));
}

function parseSampleSelection(rawValue) {
  const normalized = String(rawValue || DEFAULT_SAMPLE_OPTION).trim();
  const [modePart, countPart] = normalized.includes(":")
    ? normalized.split(":")
    : [DEFAULT_SAMPLE_MODE, normalized];
  const mode = modePart === "random" ? "random" : DEFAULT_SAMPLE_MODE;
  const parsedCount = Number.parseInt(countPart || String(DEFAULT_SAMPLE_COUNT), 10);
  const sampleCount = Math.max(1, Number.isFinite(parsedCount) ? parsedCount : DEFAULT_SAMPLE_COUNT);
  return {
    mode,
    sampleCount,
    optionValue: `${mode}:${sampleCount}`
  };
}

async function runReliabilityAnalysis() {
  try {
    const enemyCounts = collectCounts(ENEMY_UNITS);
    const allyCounts = collectCounts(ALLY_UNITS);
    const sampleSelection = parseSampleSelection(analysisSampleCount?.value);
    const sampleCount = sampleSelection.sampleCount;
    const hasAnyEnemy = ENEMY_UNITS.some((unit) => (enemyCounts[unit.key] || 0) > 0);
    const hasAnyAlly = ALLY_UNITS.some((unit) => (allyCounts[unit.key] || 0) > 0);
    if (!hasAnyEnemy || !hasAnyAlly) {
      throw new Error("Lutfen hem rakip hem de denenen dizilim icin en az bir birlik gir.");
    }

    reliabilityStatus.textContent = "Analiz calisiyor";
    analyzeReliabilityBtn.disabled = true;

    const seeds = sampleSelection.mode === "random"
      ? buildRandomSeeds(sampleCount)
      : buildDeterministicSeeds(enemyCounts, allyCounts, sampleCount);
    const scenarios = [];
    let wins = 0;
    let totalLostBlood = 0;
    let totalWinLostBlood = 0;
    let totalLossLostBlood = 0;

    for (let index = 0; index < seeds.length; index += 1) {
      const seed = seeds[index];
      const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
      const scenario = {
        seed,
        winner: result.winner === "enemy" ? "enemy" : "ally",
        lostBloodTotal: result.lostBloodTotal,
        enemyRemainingHealth: result.enemyRemainingHealth,
        enemyRemainingUnits: result.enemyRemainingUnits,
        usedCapacity: result.usedCapacity,
        allyLosses: { ...(result.allyLosses || {}) }
      };
      scenarios.push(scenario);
      totalLostBlood += result.lostBloodTotal;
      if (scenario.winner === "ally") {
        wins += 1;
        totalWinLostBlood += result.lostBloodTotal;
      } else {
        totalLossLostBlood += result.lostBloodTotal;
      }

      if ((index + 1) % 36 === 0) {
        reliabilityStatus.textContent = `${index + 1}/${seeds.length} seed tarandi`;
        await waitForNextFrame();
      }
    }

    const losses = scenarios.length - wins;
    const sortedByLostBlood = [...scenarios].sort((left, right) => left.lostBloodTotal - right.lostBloodTotal);
    const winningScenarios = sortedByLostBlood.filter((scenario) => scenario.winner === "ally");
    const losingScenarios = [...scenarios]
      .filter((scenario) => scenario.winner === "enemy")
      .sort((left, right) => left.enemyRemainingHealth - right.enemyRemainingHealth || left.enemyRemainingUnits - right.enemyRemainingUnits);

    currentAnalysis = {
      enemyCounts,
      allyCounts,
      sampleMode: sampleSelection.mode,
      sampleCount,
      scenarios,
      wins,
      losses,
      winRate: wins / scenarios.length,
      expectedLostBlood: totalLostBlood / scenarios.length,
      avgWinLostBlood: wins > 0 ? totalWinLostBlood / wins : null,
      avgLossLostBlood: losses > 0 ? totalLossLostBlood / losses : null,
      minLostBlood: sortedByLostBlood[0]?.lostBloodTotal ?? null,
      maxLostBlood: sortedByLostBlood[sortedByLostBlood.length - 1]?.lostBloodTotal ?? null,
      winningScenarios,
      losingScenarios
    };

    renderAnalysis();
    reliabilityStatus.textContent = "Tamamlandi";
  } catch (error) {
    reliabilityStatus.textContent = "Hata";
    window.alert(error.message);
  } finally {
    analyzeReliabilityBtn.disabled = false;
  }
}

function waitForNextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function renderLineBlock(target, lines) {
  target.innerHTML = "";
  (lines || []).forEach((line) => {
    const row = document.createElement("span");
    row.className = "log-line";
    row.textContent = line;
    target.appendChild(row);
  });
}

function renderStyledLines(lines, target) {
  target.innerHTML = "";
  (lines || []).forEach((line) => {
    const cssClass = classifyLine(line);
    const row = document.createElement("span");
    row.className = `log-line${cssClass ? ` ${cssClass}` : ""}`;
    appendLineWithHighlights(row, line, cssClass);
    target.appendChild(row);
  });
}

const HIGHLIGHTABLE_CLASSES = new Set(["damage", "splash", "buff", "disadv", "status", "event", "ally", "enemy", "formula", "section-total", "matchup"]);

const HIGHLIGHT_PATTERNS = [
  { regex: /\b\d+\s+(?:\S+\s+){0,2}(?:hasar(?:i)?|damage)\b/g, kind: "hl-damage" },
  { regex: /\b\d+\s+(?:toplam\s+|total\s+)?(?:can|hp|birim|units|atk)\b/g, kind: "hl-stat" },
  { regex: /^\s*\d+(?=\s+\S)/g, kind: "hl-stat" },
  { regex: /\+%\d+(?:\.\d+)?/g, kind: "hl-mult" },
  { regex: /-%\d+(?:\.\d+)?/g, kind: "hl-mult-neg" },
  { regex: /(?<!\w)x\d+(?:\.\d+)?(?=\s|$|\])/g, kind: "hl-mult" }
];

function appendLineWithHighlights(row, line, cssClass) {
  if (!HIGHLIGHTABLE_CLASSES.has(cssClass)) {
    row.textContent = line;
    return;
  }

  const matches = [];
  HIGHLIGHT_PATTERNS.forEach((pattern) => {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(line)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        kind: pattern.kind
      });
    }
  });

  matches.sort((left, right) => left.start - right.start || right.end - left.end);
  const filtered = [];
  let lastEnd = 0;
  matches.forEach((match) => {
    if (match.start >= lastEnd) {
      filtered.push(match);
      lastEnd = match.end;
    }
  });

  if (!filtered.length) {
    row.textContent = line;
    return;
  }

  let cursor = 0;
  filtered.forEach((match) => {
    if (match.start > cursor) {
      row.appendChild(document.createTextNode(line.slice(cursor, match.start)));
    }
    const span = document.createElement("span");
    span.className = match.kind;
    span.textContent = match.text;
    row.appendChild(span);
    cursor = match.end;
  });

  if (cursor < line.length) {
    row.appendChild(document.createTextNode(line.slice(cursor)));
  }
}

function classifyLine(line) {
  const stripped = String(line || "").trim();
  if (stripped.startsWith("---")) {
    return "sep";
  }
  if (stripped.includes("RAUND") || stripped.includes("ROUND")) {
    return stripped.startsWith("Raund") || stripped.startsWith("Round") ? "round" : "banner";
  }
  if (stripped === "DUSMAN SAFLARI" || stripped === "MUTTEFIK SAFLARI" || stripped === "ENEMY RANKS" || stripped === "ALLY RANKS") {
    return "section-head";
  }
  if (
    stripped.startsWith("- Dusman toplam atak") ||
    stripped.startsWith("- Muttefik toplam atak") ||
    stripped.startsWith("- Enemy total attack") ||
    stripped.startsWith("- Ally total attack")
  ) {
    return "section-total";
  }
  if (stripped.startsWith(">>")) {
    return "win";
  }
  if (/^(?:Hamle|Turn)\s+\d+$/.test(stripped)) {
    return "turn";
  }
  if (stripped.startsWith("Raund") || stripped.startsWith("Round")) {
    return "round";
  }
  if (stripped.startsWith("Hesap:") || stripped.startsWith("Calc:")) {
    return "formula";
  }
  if (stripped.includes(" -> ") || stripped.includes(" → ")) {
    return "matchup";
  }
  if (
    stripped.startsWith("Kayip Birlikler") ||
    stripped.startsWith("Lost Units") ||
    stripped.startsWith("Toplam birlik kapasitesi") ||
    stripped.startsWith("Total army capacity") ||
    stripped.includes("GUVENILIRLIK  OZETI") ||
    stripped.includes("SAVAS  SONUCU") ||
    stripped.includes("TUR  TUR  ANALIZ")
  ) {
    return "header";
  }
  if (stripped.includes("yok edildi") || stripped.includes("completely destroyed")) {
    return "destroy";
  }
  if (
    stripped.startsWith("Baslangic muharebe duzeni") ||
    stripped.startsWith("Initial battle formation") ||
    stripped.startsWith("her raundun") ||
    stripped.startsWith("each round's")
  ) {
    return "subhead";
  }
  if (stripped.includes("hasar vurdu") || stripped.includes("damage dealt")) {
    return "damage";
  }
  if (
    stripped.includes("yayilma hasari") ||
    stripped.includes("intikam hasari") ||
    stripped.includes("splash damage") ||
    stripped.includes("revenge damage") ||
    stripped.includes("overkill damage") ||
    stripped.includes("(overkill)")
  ) {
    return "splash";
  }
  if (
    stripped.includes("birim kaybetti") ||
    stripped.includes("units lost") ||
    stripped.includes("birim / ") ||
    stripped.includes("units / ") ||
    stripped.includes("birim kaldi") ||
    stripped.includes("units remaining")
  ) {
    return "status";
  }
  if (
    stripped.includes("ustunlugune sahip") ||
    stripped.includes("type advantage") ||
    stripped.includes("carpani kazandi") ||
    stripped.includes("damage multiplier") ||
    stripped.includes("guclendirdi") ||
    stripped.includes("empowered") ||
    stripped.includes("biriktirdi") ||
    stripped.includes("stored damage") ||
    stripped.includes("dogurdu") ||
    stripped.includes("spawned") ||
    stripped.includes("geri dirildi") ||
    stripped.includes("revived with") ||
    /\+%\d/.test(stripped)
  ) {
    return "buff";
  }
  if (
    stripped.includes("dezavantajli") ||
    stripped.includes("type-disadvantaged") ||
    stripped.includes("azalmis hasar") ||
    stripped.includes("reduced damage") ||
    stripped.includes("azaltti") ||
    stripped.includes("azaltiyor") ||
    stripped.includes("is reducing") ||
    stripped.includes("hizini") ||
    stripped.includes("speed by") ||
    stripped.includes("hizi artik") ||
    stripped.includes("speed is now") ||
    stripped.includes("sifirlandi") ||
    stripped.includes("was reset") ||
    /-%\d/.test(stripped)
  ) {
    return "disadv";
  }
  if (stripped.startsWith("-") || stripped.startsWith("=")) {
    return "event";
  }
  if (stripped.includes(" can") || stripped.includes(" hp")) {
    return isAllyLine(stripped) ? "ally" : "enemy";
  }
  return "";
}

function isAllyLine(line) {
  const allyNames = [
    "Yarasa Surusu", "Gulyabani", "Vampir Kole", "Banshee",
    "Olu Cagirici", "Gargoyle", "Kan Cadisi", "Curuk Girtlak",
    "Bats", "Ghouls", "Thralls", "Banshees",
    "Necromancers", "Gargoyles", "Blood Witches", "Rotmaws"
  ];
  return allyNames.some((name) => line.includes(name));
}

function renderAnalysis() {
  if (!currentAnalysis) {
    return;
  }
  renderSummary();
  renderMeta();
  renderNotes();
  renderScenarioList();
  renderDefaultScenarioLog();
}

function renderSummary() {
  const analysis = currentAnalysis;
  const lines = [
    "======================  GUVENILIRLIK  OZETI  ======================",
    `>> ${analysis.losses > 0 ? "Bu dizilim test edilen seedlerin bir kisminda kaybediyor." : "Bu dizilim test edilen seedlerde hic kaybetmedi."}`,
    `- test edilen ${analysis.sampleMode === "random" ? "random" : "sabit"} seed: ${analysis.sampleCount}`,
    `- kazanma orani: %${formatPercent(analysis.winRate * 100)}`,
    `- zafer / maglubiyet: ${analysis.wins} / ${analysis.losses}`,
    `- v6 tipi kayip (tum seed ortalamasi): ${Math.round(analysis.expectedLostBlood)}`,
    `- v2 tipi kayip (sadece zafer ortalamasi): ${analysis.avgWinLostBlood === null ? "-" : Math.round(analysis.avgWinLostBlood)}`,
    `- maglubiyet seedlerinde ortalama kayip: ${analysis.avgLossLostBlood === null ? "-" : Math.round(analysis.avgLossLostBlood)}`,
    `- gorulen en dusuk / en yuksek kayip: ${analysis.minLostBlood ?? "-"} / ${analysis.maxLostBlood ?? "-"}`
  ];

  reliabilitySummaryPanel.innerHTML = "";
  const block = document.createElement("div");
  block.className = "terminal-block";
  renderStyledLines(lines, block);
  reliabilitySummaryPanel.appendChild(block);
}

function renderMeta() {
  const analysis = currentAnalysis;
  const stats = [
    ["Kullanilan puan", `${calculateArmyPoints(analysis.allyCounts)}`],
    ["Zafer seed", `${analysis.wins}`],
    ["Maglubiyet seed", `${analysis.losses}`],
    ["v6 tipi kayip", `${Math.round(analysis.expectedLostBlood)}`],
    ["v2 tipi kayip", analysis.avgWinLostBlood === null ? "-" : `${Math.round(analysis.avgWinLostBlood)}`],
    ["Fark", analysis.avgWinLostBlood === null ? "-" : `${Math.round(analysis.expectedLostBlood - analysis.avgWinLostBlood)}`]
  ];

  reliabilityMetaPanel.innerHTML = "";
  stats.forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(span, strong);
    reliabilityMetaPanel.appendChild(card);
  });
}

function renderNotes() {
  const analysis = currentAnalysis;
  reliabilityNotesPanel.innerHTML = "";

  const card = document.createElement("article");
  card.className = "saved-match-card";

  const head = document.createElement("div");
  head.className = "saved-match-head";
  head.innerHTML = "<strong>Neden Fark Gorunuyor?</strong><span>Tek savas yerine toplu seed taramasi</span>";

  const body = document.createElement("div");
  body.className = "terminal-block";

  const lines = [
    analysis.losses > 0
      ? `- Optimizer'da kazanir gibi gorunen duzen burada ${analysis.losses} kez kaybetti; yani sonuc deterministik degil.`
      : "- Bu dizilim test edilen seedlerde kaybetmedi; yine de daha fazla seed farkli dagilim gosterebilir.",
    "- v2 tarzi kayip sadece kazanilan savaslari ortalar; bu yuzden daha dusuk gorunebilir.",
    "- v6 tarzi kayip kaybedilen seedleri de hesaba katar; bu yuzden gercege daha yakin ve genelde daha yuksektir."
  ];

  if (lastOptimizerPayload && Number.isFinite(lastOptimizerPayload.optimizerDisplayedLoss)) {
    lines.push(`- Optimizer ekranindan gelen kayip: ${Math.round(lastOptimizerPayload.optimizerDisplayedLoss)}`);
  }
  if (lastOptimizerPayload && Number.isFinite(lastOptimizerPayload.optimizerWinRate)) {
    lines.push(`- Optimizer ekranindan gelen kazanma orani: %${formatPercent(lastOptimizerPayload.optimizerWinRate * 100)}`);
  }

  renderStyledLines(lines, body);
  card.append(head, body);
  reliabilityNotesPanel.appendChild(card);
}

function renderScenarioList() {
  const analysis = currentAnalysis;
  const scenarioBuckets = [
    ...analysis.winningScenarios.slice(0, 3).map((scenario, index) => ({ ...scenario, title: `En Temiz Zafer ${index + 1}` })),
    ...analysis.winningScenarios.slice(-3).reverse().map((scenario, index) => ({ ...scenario, title: `En Pahali Zafer ${index + 1}` })),
    ...analysis.losingScenarios.slice(0, 4).map((scenario, index) => ({ ...scenario, title: `En Yakin Maglubiyet ${index + 1}` }))
  ];

  scenarioList.innerHTML = "";
  if (!scenarioBuckets.length) {
    scenarioList.innerHTML = '<p class="summary-empty">Gosterilecek seed senaryosu yok.</p>';
    return;
  }

  scenarioBuckets.forEach((scenario) => {
    scenarioList.appendChild(createScenarioCard(scenario));
  });
}

function createScenarioCard(scenario) {
  const titleLower = String(scenario.title || "").toLowerCase();
  const toneClass = titleLower.includes("temiz")
    ? "is-clean"
    : titleLower.includes("pahali")
      ? "is-costly"
      : "is-edge";
  const outcomeLabel = scenario.winner === "ally" ? "Zafer" : "Maglubiyet";
  const categoryLabel = toneClass === "is-clean"
    ? "Temiz"
    : toneClass === "is-costly"
      ? "Pahali"
      : "Kritik";
  const card = document.createElement("article");
  card.className = `saved-match-card reliability-scenario-card ${toneClass} ${scenario.winner === "ally" ? "is-win" : "is-loss"}`;

  const head = document.createElement("div");
  head.className = "saved-match-head reliability-scenario-head";
  head.innerHTML = `
    <div class="reliability-scenario-title-wrap">
      <strong>${scenario.title}</strong>
      <div class="reliability-scenario-badges">
        <span class="reliability-scenario-badge reliability-scenario-badge-outcome">${outcomeLabel}</span>
        <span class="reliability-scenario-badge reliability-scenario-badge-category">${categoryLabel}</span>
      </div>
    </div>
    <span class="reliability-scenario-seed">Seed ${scenario.seed}</span>
  `;

  const body = document.createElement("div");
  body.className = "saved-match-meta reliability-scenario-stats";
  body.innerHTML = `
    <span><small>Sonuc</small><strong>${outcomeLabel}</strong></span>
    <span><small>Kan kaybi</small><strong>${Math.round(scenario.lostBloodTotal)}</strong></span>
    <span><small>Kalan dusman cani</small><strong>${Math.round(scenario.enemyRemainingHealth)}</strong></span>
    <span><small>Kalan dusman birlik</small><strong>${Math.round(scenario.enemyRemainingUnits)}</strong></span>
  `;

  const note = document.createElement("div");
  note.className = "terminal-block reliability-scenario-losses";
  renderStyledLines(formatLossSummary(scenario.allyLosses).split("\n"), note);

  const actions = document.createElement("div");
  actions.className = "actions actions-inline reliability-scenario-actions";

  const logBtn = document.createElement("button");
  logBtn.type = "button";
  logBtn.className = "button button-secondary";
  logBtn.textContent = "Gunlugu Ac";
  logBtn.addEventListener("click", () => {
    openScenarioLog(scenario.seed);
  });

  const simBtn = document.createElement("button");
  simBtn.type = "button";
  simBtn.className = "button button-secondary";
  simBtn.textContent = "Simulasyonda Ac";
  simBtn.addEventListener("click", () => {
    openSimulationForSeed(scenario.seed);
  });

  actions.append(logBtn, simBtn);
  card.append(head, body, note, actions);
  return card;
}

function formatLossSummary(lossesByKey = {}) {
  const parts = ALLY_UNITS
    .map((unit) => {
      const count = Math.max(0, Math.round(lossesByKey[unit.key] || 0));
      if (count <= 0) {
        return null;
      }
      const blood = count * (BLOOD_BY_ALLY_KEY[unit.key] || 0);
      return `${unit.label}: ${count} (${blood} kan)`;
    })
    .filter(Boolean);
  return parts.length ? parts.join("\n") : "Bu seed icin kayip yok.";
}

function renderDefaultScenarioLog() {
  const seed = currentAnalysis?.losingScenarios?.[0]?.seed
    || currentAnalysis?.winningScenarios?.[0]?.seed
    || null;
  if (seed === null) {
    return;
  }
  openScenarioLog(seed);
}

function openScenarioLog(seed) {
  if (!currentAnalysis || !Number.isInteger(seed)) {
    return;
  }
  const result = simulateBattle(currentAnalysis.enemyCounts, currentAnalysis.allyCounts, { seed, collectLog: true });
  renderStyledLines(String(result.logText || "Gunluk uretilemedi.").split("\n"), scenarioLogOutput);
  reliabilityStatus.textContent = `Seed ${seed} gunlugu acildi`;
}

function openSimulationForSeed(seed) {
  if (!currentAnalysis || !Number.isInteger(seed)) {
    return;
  }
  try {
    window.sessionStorage.setItem(OPTIMIZER_SIMULATION_STORAGE_KEY, JSON.stringify({
      enemyCounts: currentAnalysis.enemyCounts,
      allyCounts: currentAnalysis.allyCounts,
      seed
    }));
    const opened = window.open("index.html", "_blank");
    if (!opened) {
      window.alert("Simulasyon yeni sekmede acilamadi. Lutfen popup engelleyiciyi kontrol edin.");
      return;
    }
    opened.focus?.();
  } catch (error) {
    window.alert(`Simulasyon ekranina gecilemedi: ${error.message}`);
  }
}

function formatPercent(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}
