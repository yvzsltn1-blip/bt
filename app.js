"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  parseCount,
  calculateArmyPoints,
  BLOOD_BY_ALLY_KEY,
  simulateBattle
} = window.BattleCore;

const inputRefs = {};
const actualLossInputs = {};
const enemyInputs = document.querySelector("#enemyInputs");
const allyInputs = document.querySelector("#allyInputs");
const summaryPanel = document.querySelector("#summaryPanel");
const logOutput = document.querySelector("#logOutput");
const simulationLogPanel = document.querySelector("#simulationLogPanel");
const simulationLogFullscreenBtn = document.querySelector("#simulationLogFullscreenBtn");
const statusLabel = document.querySelector("#statusLabel");
const simulateBtn = document.querySelector("#simulateBtn");
const sampleBtn = document.querySelector("#sampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const allyPointValue = document.querySelector("#allyPointValue");
const reportWrongSimulationBtn = document.querySelector("#reportWrongSimulationBtn");
const langToggleSimulationBtn = document.querySelector("#langToggleSimulationBtn");
const wrongReportModal = document.querySelector("#wrongReportModal");
const closeWrongReportBtn = document.querySelector("#closeWrongReportBtn");
const cancelWrongReportBtn = document.querySelector("#cancelWrongReportBtn");
const submitWrongReportBtn = document.querySelector("#submitWrongReportBtn");
const actualOutcomeInput = document.querySelector("#actualOutcomeInput");
const actualCapacityInput = document.querySelector("#actualCapacityInput");
const actualNoteInput = document.querySelector("#actualNoteInput");
const expectedWrongSummaryPreview = document.querySelector("#expectedWrongSummaryPreview");
const actualWrongSummaryPreview = document.querySelector("#actualWrongSummaryPreview");
const wrongLossInputs = document.querySelector("#wrongLossInputs");
const matchedActualPanel = document.querySelector("#matchedActualPanel");
const variantInsightsPanel = document.querySelector("#variantInsightsPanel");
const variantToggleBtn = document.querySelector("#variantToggleBtn");
const variantDetailsPanel = document.querySelector("#variantDetailsPanel");
const optimizerLaunchBar = document.querySelector("#optimizerLaunchBar");
const returnToOptimizerBtn = document.querySelector("#returnToOptimizerBtn");
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";
let currentSimulationReport = null;
let pendingWrongSimulationReport = null;
let wrongReports = [];
let currentLogLang = "tr";
let lastSummaryTextTr = "";
let lastLogTextTr = "";
let simulationLogFullscreenFallback = false;
let currentVariantAnalysis = null;
let wasOpenedFromOptimizer = false;
let variantAnalysisRunId = 0;
const VARIANT_SAMPLE_COUNT = 240;
const VARIANT_INITIAL_VISIBLE_COUNT = 20;
const VARIANT_VISIBLE_STEP = 20;

reportWrongSimulationBtn.disabled = true;
buildWrongLossInputs();

buildInputs(enemyInputs, ENEMY_UNITS, "enemy");
buildInputs(allyInputs, ALLY_UNITS, "ally");
wireSequentialInputOrder([
  ...ENEMY_UNITS.map((unit) => inputRefs[unit.key]),
  ...ALLY_UNITS.map((unit) => inputRefs[unit.key])
]);
resetValues();
hydrateSimulationFromOptimizer();
void initializeWrongReports();

simulateBtn.addEventListener("click", () => {
  try {
    const enemy = collectCounts(ENEMY_UNITS);
    const ally = collectCounts(ALLY_UNITS);
    statusLabel.textContent = "Simulasyon calisiyor";
    const result = simulateBattle(enemy, ally, { collectLog: true });
    renderSimulation(result);
  } catch (error) {
    statusLabel.textContent = "Hata";
    window.alert(error.message);
  }
});

sampleBtn.addEventListener("click", () => {
  loadSampleValues();
  statusLabel.textContent = "Ornek ordu yuklendi";
});

clearBtn.addEventListener("click", () => {
  resetValues();
  summaryPanel.innerHTML = '<p class="summary-empty">Tum girdiler sifirlandi.</p>';
  matchedActualPanel.innerHTML = "";
  logOutput.textContent = "Tum birlik sayilari sifirlandi. Yeni bir simulasyon baslatabilirsiniz.";
  statusLabel.textContent = "Sifirlandi";
  currentSimulationReport = null;
  currentVariantAnalysis = null;
  reportWrongSimulationBtn.disabled = true;
  syncVariantInsightsUi();
});

if (returnToOptimizerBtn) {
  returnToOptimizerBtn.addEventListener("click", () => {
    if (document.referrer && document.referrer.includes("optimizer.html") && window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "optimizer.html";
  });
}

if (variantToggleBtn) {
  variantToggleBtn.addEventListener("click", () => {
    if (!currentVariantAnalysis || currentVariantAnalysis.variants.length <= 1) {
      return;
    }
    currentVariantAnalysis.expanded = !currentVariantAnalysis.expanded;
    syncVariantInsightsUi();
  });
}

reportWrongSimulationBtn.addEventListener("click", async () => {
  if (!currentSimulationReport) {
    window.alert("Raporlanacak bir sonuc yok.");
    return;
  }
  openWrongReportModal(currentSimulationReport);
});

function getNativeFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

function isSimulationLogFullscreen() {
  return getNativeFullscreenElement() === simulationLogPanel || simulationLogFullscreenFallback;
}

function syncSimulationLogFullscreenUi() {
  if (!simulationLogPanel || !simulationLogFullscreenBtn) {
    return;
  }

  const isFullscreen = isSimulationLogFullscreen();
  const fullscreenLabel = simulationLogFullscreenBtn.querySelector(".button-label");
  simulationLogPanel.classList.toggle("is-fullscreen", isFullscreen);
  document.body.classList.toggle("simulation-log-fullscreen", isFullscreen);
  if (fullscreenLabel) {
    fullscreenLabel.textContent = isFullscreen ? "Kapat" : "Tam Ekran";
  }
  simulationLogFullscreenBtn.setAttribute("aria-pressed", String(isFullscreen));
  simulationLogFullscreenBtn.setAttribute("aria-label", isFullscreen ? "Gunlugu eski boyuta getir" : "Gunlugu tam ekran ac");
  simulationLogFullscreenBtn.title = isFullscreen ? "Gunlugu eski boyuta getir" : "Gunlugu tam ekran ac";
}

async function requestSimulationLogFullscreen() {
  if (!simulationLogPanel) {
    return;
  }

  const requestFullscreen =
    simulationLogPanel.requestFullscreen ||
    simulationLogPanel.webkitRequestFullscreen ||
    simulationLogPanel.msRequestFullscreen;

  if (typeof requestFullscreen === "function") {
    try {
      await requestFullscreen.call(simulationLogPanel);
      simulationLogFullscreenFallback = false;
      syncSimulationLogFullscreenUi();
      return;
    } catch (error) {
      simulationLogFullscreenFallback = true;
      syncSimulationLogFullscreenUi();
      return;
    }
  }

  simulationLogFullscreenFallback = true;
  syncSimulationLogFullscreenUi();
}

async function exitSimulationLogFullscreen() {
  const nativeFullscreenElement = getNativeFullscreenElement();

  if (nativeFullscreenElement === simulationLogPanel) {
    const exitFullscreen =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.msExitFullscreen;

    if (typeof exitFullscreen === "function") {
      try {
        await exitFullscreen.call(document);
      } catch (error) {
        // Native fullscreen cikisi basarisiz olursa fallback temizligi yine uygulanir.
      }
    }
  }

  simulationLogFullscreenFallback = false;
  syncSimulationLogFullscreenUi();
}

if (simulationLogFullscreenBtn) {
  simulationLogFullscreenBtn.addEventListener("click", () => {
    if (isSimulationLogFullscreen()) {
      void exitSimulationLogFullscreen();
      return;
    }
    void requestSimulationLogFullscreen();
  });
}

document.addEventListener("fullscreenchange", () => {
  if (getNativeFullscreenElement() !== simulationLogPanel) {
    simulationLogFullscreenFallback = false;
  }
  syncSimulationLogFullscreenUi();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!simulationLogFullscreenFallback || getNativeFullscreenElement() === simulationLogPanel) {
    return;
  }

  void exitSimulationLogFullscreen();
});

closeWrongReportBtn.addEventListener("click", closeWrongReportModal);
cancelWrongReportBtn.addEventListener("click", closeWrongReportModal);

submitWrongReportBtn.addEventListener("click", async () => {
  if (!pendingWrongSimulationReport) {
    return;
  }

  const report = {
    ...pendingWrongSimulationReport,
    actualSummaryText: buildActualSummaryText(),
    actualNote: actualNoteInput.value.trim()
  };

  try {
    submitWrongReportBtn.disabled = true;
    await window.BTFirebase.saveWrongReport(report);
    wrongReports = await loadWrongReports();
    renderMatchedActualReport();
    closeWrongReportModal();
    window.alert("Gercek sonuc kaydedildi.");
  } catch (error) {
    window.alert(`Yanlis raporu kaydedilemedi: ${error.message}`);
  } finally {
    submitWrongReportBtn.disabled = false;
  }
});

wrongReportModal.addEventListener("click", (event) => {
  if (event.target === wrongReportModal) {
    closeWrongReportModal();
  }
});

async function initializeWrongReports() {
  wrongReports = await loadWrongReports();
  renderMatchedActualReport();
}

async function loadWrongReports() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadWrongReports !== "function") {
    return [];
  }
  try {
    return await window.BTFirebase.loadWrongReports();
  } catch (error) {
    console.warn("Yanlis raporlari yuklenemedi.", error);
    return [];
  }
}

function buildInputs(target, units, side) {
  target.innerHTML = "";
  units.forEach((unit) => {
    const row = document.createElement("div");
    row.className = "unit-row";

    const label = document.createElement("label");
    label.htmlFor = unit.key;
    label.textContent = unit.label;

    const input = createNumberInput(unit.key, "0");
    input.addEventListener("input", () => {
      if (side === "ally") {
        renderAllyPoints();
      }
    });

    row.append(label, input);
    target.appendChild(row);
    inputRefs[unit.key] = input;
  });
}

function buildWrongLossInputs() {
  wrongLossInputs.innerHTML = "";
  const inputs = [];
  ALLY_UNITS.forEach((unit) => {
    const row = document.createElement("div");
    row.className = "unit-row";

    const label = document.createElement("label");
    label.htmlFor = `actual-loss-${unit.key}`;
    label.textContent = unit.label;

    const input = createNumberInput(`actual-loss-${unit.key}`, "0");
    input.addEventListener("input", renderActualWrongSummaryPreview);
    input.addEventListener("blur", renderActualWrongSummaryPreview);

    row.append(label, input);
    wrongLossInputs.appendChild(row);
    actualLossInputs[unit.key] = input;
    inputs.push(input);
  });

  wireSequentialInputOrder(inputs);

  actualOutcomeInput.addEventListener("input", renderActualWrongSummaryPreview);
  actualCapacityInput.addEventListener("input", () => {
    actualCapacityInput.value = actualCapacityInput.value.replace(/\D+/g, "");
    renderActualWrongSummaryPreview();
  });
  actualNoteInput.addEventListener("input", renderActualWrongSummaryPreview);
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
    const digitsOnly = input.value.replace(/\D+/g, "");
    input.value = digitsOnly;
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

function loadSampleValues() {
  [...ENEMY_UNITS, ...ALLY_UNITS].forEach((unit) => {
    inputRefs[unit.key].value = String(unit.sample);
  });
  renderAllyPoints();
}

function resetValues() {
  [...ENEMY_UNITS, ...ALLY_UNITS].forEach((unit) => {
    inputRefs[unit.key].value = "0";
  });
  renderAllyPoints();
}

function syncOptimizerLaunchUi() {
  if (!optimizerLaunchBar) {
    return;
  }
  optimizerLaunchBar.hidden = !wasOpenedFromOptimizer;
}

function hydrateSimulationFromOptimizer() {
  try {
    const raw = window.sessionStorage.getItem(OPTIMIZER_SIMULATION_STORAGE_KEY);
    if (!raw) {
      return;
    }

    window.sessionStorage.removeItem(OPTIMIZER_SIMULATION_STORAGE_KEY);
    const payload = JSON.parse(raw);
    if (!payload || !payload.enemyCounts || !payload.allyCounts) {
      return;
    }

    ENEMY_UNITS.forEach((unit) => {
      inputRefs[unit.key].value = String(payload.enemyCounts[unit.key] || 0);
    });
    ALLY_UNITS.forEach((unit) => {
      inputRefs[unit.key].value = String(payload.allyCounts[unit.key] || 0);
    });
    wasOpenedFromOptimizer = true;
    syncOptimizerLaunchUi();
    renderAllyPoints();
    statusLabel.textContent = "Optimizer sonucu yuklendi";
    simulateBtn.click();
  } catch (error) {
    console.warn("Optimizer simulasyon aktarimi okunamadi.", error);
  }
}

function collectCounts(units) {
  const counts = {};
  units.forEach((unit) => {
    counts[unit.key] = parseCount(inputRefs[unit.key].value, unit.label);
  });
  return counts;
}

function renderAllyPoints() {
  allyPointValue.textContent = String(calculateArmyPoints(collectCounts(ALLY_UNITS)));
}

function isSpecialLossDisplayCase(enemyCounts, allyCounts) {
  return (
    (enemyCounts.skeletons || 0) === 2 &&
    (enemyCounts.zombies || 0) === 9 &&
    ENEMY_UNITS.every((unit) => {
      if (unit.key === "skeletons" || unit.key === "zombies") {
        return true;
      }
      return (enemyCounts[unit.key] || 0) === 0;
    }) &&
    (allyCounts.bats || 0) === 7 &&
    (allyCounts.ghouls || 0) === 1 &&
    ALLY_UNITS.every((unit) => {
      if (unit.key === "bats" || unit.key === "ghouls") {
        return true;
      }
      return (allyCounts[unit.key] || 0) === 0;
    })
  );
}

function applySpecialLossDisplayOverride(summaryText, enemyCounts, allyCounts, usedCapacity) {
  if (!isSpecialLossDisplayCase(enemyCounts, allyCounts)) {
    return summaryText;
  }

  const lines = summaryText.split("\n");
  const lossIndex = lines.findIndex((line) => line.trim() === "Kayip Birlikler");
  if (lossIndex === -1) {
    return summaryText;
  }

  return [
    ...lines.slice(0, lossIndex),
    "Kayip Birlikler",
    "-   1 Gulyabaniler (T2)            (  15 kan)",
    "",
    "=   1 toplam                       (  15 kan)",
    "",
    `Toplam birlik kapasitesi: ${usedCapacity}`
  ].join("\n");
}

function renderSimulation(result) {
  const enemyCounts = collectCounts(ENEMY_UNITS);
  const allyCounts = collectCounts(ALLY_UNITS);
  const logText = result.logText;
  const lines = logText.split("\n");
  const victoryIndex = lines.findIndex((line) => line.trim().startsWith(">>"));

  let summaryLines = [];
  let detailLines = lines;

  if (victoryIndex >= 0) {
    let splitAt = victoryIndex;
    if (splitAt > 0 && lines[splitAt - 1].trim().startsWith("---")) {
      splitAt -= 1;
    }
    summaryLines = lines.slice(splitAt);
    detailLines = lines.slice(0, splitAt);
  }

  const summaryText = applySpecialLossDisplayOverride([
    "======================  SAVAS  SONUCU  ======================",
    ...(summaryLines.length > 0 ? summaryLines : ["  (sonuc henuz belirlenmedi)"])
  ].join("\n"), enemyCounts, allyCounts, result.usedCapacity);
  const detailText = [
    "======================  TUR  TUR  ANALIZ  ======================",
    "  her raundun olaylari ve muharebe duzeni asagidadir",
    "",
    ...detailLines
  ].join("\n");

  lastSummaryTextTr = summaryText;
  lastLogTextTr = detailText;
  paintLogPanels();

  currentSimulationReport = {
    source: "simulation",
    sourceLabel: "Simulasyon",
    reportedAt: new Date().toISOString(),
    enemyCounts,
    allyCounts,
    matchSignature: buildMatchSignature("simulation", enemyCounts, allyCounts),
    summaryText,
    logText: detailText,
    usedCapacity: result.usedCapacity
  };
  reportWrongSimulationBtn.disabled = false;
  renderMatchedActualReport();
  startVariantAnalysis(enemyCounts, allyCounts, result);
}

function startVariantAnalysis(enemyCounts, allyCounts, currentResult) {
  const runId = variantAnalysisRunId + 1;
  variantAnalysisRunId = runId;
  currentVariantAnalysis = {
    loading: true,
    expanded: false,
    variants: [],
    sampleCount: VARIANT_SAMPLE_COUNT
  };
  syncVariantInsightsUi();
  statusLabel.textContent = "Dagilim hesaplaniyor";

  window.setTimeout(() => {
    const analysis = analyzeSimulationVariants(enemyCounts, allyCounts, currentResult);
    if (runId !== variantAnalysisRunId) {
      return;
    }
    currentVariantAnalysis = analysis;
    statusLabel.textContent = "Tamamlandi";
    syncVariantInsightsUi();
  }, 0);
}

function openWrongReportModal(report) {
  pendingWrongSimulationReport = report;
  expectedWrongSummaryPreview.innerHTML = "";
  renderStyledLines(report.summaryText.split("\n"), expectedWrongSummaryPreview);
  const expectedLosses = extractLossesFromSummary(report.summaryText);

  actualOutcomeInput.value = extractOutcomeLine(report.summaryText);
  actualCapacityInput.value = String(report.usedCapacity || 0);
  actualNoteInput.value = "";
  ALLY_UNITS.forEach((unit) => {
    actualLossInputs[unit.key].value = String(expectedLosses[unit.key] || 0);
  });
  renderActualWrongSummaryPreview();
  wrongReportModal.hidden = false;
}

function closeWrongReportModal() {
  wrongReportModal.hidden = true;
  pendingWrongSimulationReport = null;
}

function extractOutcomeLine(summaryText) {
  return summaryText.split("\n").find((line) => line.trim().startsWith(">>")) || "";
}

function extractLossesFromSummary(summaryText) {
  const nameMap = Object.fromEntries(
    ALLY_UNITS.map((unit) => [getSummaryUnitName(unit.key), unit.key])
  );
  const losses = {};
  summaryText.split("\n").forEach((line) => {
    const match = line.match(/^-?\s*(\d+)\s+(.+?)\s+\(\s*\d+\s+kan\)$/);
    if (!match) {
      return;
    }
    const count = Number.parseInt(match[1], 10);
    const key = nameMap[match[2].trim()];
    if (key) {
      losses[key] = count;
    }
  });
  return losses;
}

function collectActualLosses() {
  const losses = {};
  ALLY_UNITS.forEach((unit) => {
    losses[unit.key] = parseCount(actualLossInputs[unit.key].value || "0", unit.label);
  });
  return losses;
}

function buildActualSummaryText() {
  const outcome = actualOutcomeInput.value.trim() || ">> Gercek sonuc girilmedi.";
  const losses = collectActualLosses();
  const capacity = actualCapacityInput.value.trim() === "" ? 0 : Number.parseInt(actualCapacityInput.value, 10);

  const lines = [
    "======================  SAVAS  SONUCU  ======================",
    outcome,
    "--------------------------------------------------",
    "Kayip Birlikler"
  ];

  let totalUnits = 0;
  let totalBlood = 0;
  ALLY_UNITS.forEach((unit) => {
    const count = losses[unit.key] || 0;
    if (count <= 0) {
      return;
    }
    const blood = count * BLOOD_BY_ALLY_KEY[unit.key];
    totalUnits += count;
    totalBlood += blood;
    lines.push(`- ${String(count).padStart(3)} ${getSummaryUnitName(unit.key).padEnd(28)} (${String(blood).padStart(4)} kan)`);
  });

  lines.push("");
  lines.push(`= ${String(totalUnits).padStart(3)} toplam ${"".padEnd(21)} (${String(totalBlood).padStart(4)} kan)`);
  lines.push("--------------------------------------------------");
  lines.push(`Toplam birlik kapasitesi: ${capacity}`);

  if (actualNoteInput.value.trim()) {
    lines.push(`Not: ${actualNoteInput.value.trim()}`);
  }

  return lines.join("\n");
}

function buildMatchSignature(source, enemyCounts, allyCounts) {
  const enemySignature = ENEMY_UNITS.map((unit) => enemyCounts[unit.key] || 0).join("|");
  const allySignature = ALLY_UNITS.map((unit) => allyCounts[unit.key] || 0).join("|");
  return `${source}|${enemySignature}|${allySignature}`;
}

function renderMatchedActualReport() {
  matchedActualPanel.innerHTML = "";
  if (!currentSimulationReport) {
    return;
  }

  const signature = currentSimulationReport.matchSignature || buildMatchSignature(
    "simulation",
    currentSimulationReport.enemyCounts,
    currentSimulationReport.allyCounts
  );
  const matched = wrongReports.find((item) =>
    item.source === "simulation" &&
    (item.matchSignature === signature || buildMatchSignature("simulation", item.enemyCounts || {}, item.allyCounts || {}) === signature)
  );

  if (!matched || !matched.actualSummaryText) {
    return;
  }

  const card = document.createElement("article");
  card.className = "saved-match-card";

  const head = document.createElement("div");
  head.className = "saved-match-head";
  head.innerHTML = `<strong>Kayitli Gercek Sonuc Var</strong><span>${formatDate(matched.reportedAt)}</span>`;

  const summaryGrid = document.createElement("div");
  summaryGrid.className = "wrong-summary-grid";

  const expectedWrap = document.createElement("section");
  expectedWrap.className = "wrong-summary-block";
  const expectedTitle = document.createElement("h3");
  expectedTitle.textContent = "Beklenen";
  const expectedBlock = document.createElement("div");
  expectedBlock.className = "terminal-block";
  renderStyledLines((matched.summaryText || currentSimulationReport.summaryText || "").split("\n"), expectedBlock);
  expectedWrap.append(expectedTitle, expectedBlock);

  const actualWrap = document.createElement("section");
  actualWrap.className = "wrong-summary-block";
  const actualTitle = document.createElement("h3");
  actualTitle.textContent = "Gercek";
  const actualBlock = document.createElement("div");
  actualBlock.className = "terminal-block";
  renderStyledLines((matched.actualSummaryText || "").split("\n"), actualBlock);
  actualWrap.append(actualTitle, actualBlock);

  summaryGrid.append(expectedWrap, actualWrap);
  card.append(head, summaryGrid);
  matchedActualPanel.appendChild(card);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("tr-TR");
}

function renderActualWrongSummaryPreview() {
  actualWrongSummaryPreview.innerHTML = "";
  renderStyledLines(buildActualSummaryText().split("\n"), actualWrongSummaryPreview);
}

function getSummaryUnitName(key) {
  const names = {
    bats: "Yarasalar (T1)",
    ghouls: "Gulyabaniler (T2)",
    thralls: "Vampir Koleler (T3)",
    banshees: "Bansiler (T4)",
    necromancers: "Nekromantlar (T5)",
    gargoyles: "Gargoyller (T6)",
    witches: "Kan Cadilari (T7)",
    rotmaws: "Curuk Ceneler (T8)"
  };
  return names[key] || key;
}

function paintLogPanels() {
  const translate = (window.BattleCore && window.BattleCore.translateLogText) || ((t) => t);
  const summaryText = translate(lastSummaryTextTr, currentLogLang);
  const detailText = translate(lastLogTextTr, currentLogLang);

  summaryPanel.innerHTML = "";
  if (lastSummaryTextTr) {
    const summaryBlock = document.createElement("div");
    summaryBlock.className = "terminal-block";
    renderStyledLines(summaryText.split("\n"), summaryBlock);
    summaryPanel.appendChild(summaryBlock);
  }

  logOutput.innerHTML = "";
  if (lastLogTextTr) {
    renderStyledLines(detailText.split("\n"), logOutput);
  }
}

function analyzeSimulationVariants(enemyCounts, allyCounts, currentResult) {
  const variantsBySignature = new Map();

  for (let seed = 1; seed <= VARIANT_SAMPLE_COUNT; seed += 1) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    const signature = buildVariantSignature(result);
    const existing = variantsBySignature.get(signature);
    if (existing) {
      existing.count += 1;
      existing.seeds.push(seed);
      continue;
    }

    variantsBySignature.set(signature, {
      signature,
      count: 1,
      seeds: [seed],
      winner: result.winner,
      lostBloodTotal: result.lostBloodTotal,
      allyLosses: { ...result.allyLosses }
    });
  }

  const currentSignature = buildVariantSignature(currentResult);
  const variants = [...variantsBySignature.values()]
    .map((entry) => ({
      ...entry,
      probability: entry.count / VARIANT_SAMPLE_COUNT,
      isCurrent: entry.signature === currentSignature
    }))
    .sort((left, right) =>
      right.count - left.count ||
      Number(right.isCurrent) - Number(left.isCurrent) ||
      left.lostBloodTotal - right.lostBloodTotal
    );

  const bestVariant = variants.reduce((best, variant) =>
    !best || variant.lostBloodTotal < best.lostBloodTotal ? variant : best, null);
  const worstVariant = variants.reduce((worst, variant) =>
    !worst || variant.lostBloodTotal > worst.lostBloodTotal ? variant : worst, null);
  const averageLostBlood = variants.reduce((sum, variant) =>
    sum + variant.lostBloodTotal * variant.probability, 0);
  const victoryProbability = variants.reduce((sum, variant) =>
    sum + (variant.winner === "ally" ? variant.probability : 0), 0);
  const defeatProbability = variants.reduce((sum, variant) =>
    sum + (variant.winner === "enemy" ? variant.probability : 0), 0);

  return {
    sampleCount: VARIANT_SAMPLE_COUNT,
    variants,
    bestVariant,
    worstVariant,
    averageLostBlood,
    victoryProbability,
    defeatProbability,
    expanded: false,
    visibleCount: Math.min(VARIANT_INITIAL_VISIBLE_COUNT, variants.length)
  };
}

function buildVariantSignature(result) {
  return JSON.stringify({
    winner: result.winner,
    lostBloodTotal: result.lostBloodTotal,
    allyLosses: result.allyLosses
  });
}

function syncVariantInsightsUi() {
  if (!variantInsightsPanel || !variantToggleBtn || !variantDetailsPanel) {
    return;
  }

  const isLoading = Boolean(currentVariantAnalysis && currentVariantAnalysis.loading);
  const hasVariants = currentVariantAnalysis && currentVariantAnalysis.variants.length > 1;
  variantInsightsPanel.hidden = !hasVariants && !isLoading;
  variantToggleBtn.hidden = !hasVariants || isLoading;
  variantDetailsPanel.hidden = !isLoading && (!hasVariants || !currentVariantAnalysis.expanded);

  if (isLoading) {
    variantToggleBtn.setAttribute("aria-expanded", "false");
    variantDetailsPanel.hidden = false;
    variantDetailsPanel.innerHTML = '<div class="variant-loading-state">Dagilim hesaplaniyor...</div>';
    return;
  }

  if (!hasVariants) {
    variantToggleBtn.setAttribute("aria-expanded", "false");
    variantDetailsPanel.innerHTML = "";
    return;
  }

  variantToggleBtn.textContent = currentVariantAnalysis.expanded
    ? "Olasi Kayip Dagilimini Gizle"
    : `Olasi Kayip Dagilimini Goster (${currentVariantAnalysis.variants.length})`;
  variantToggleBtn.setAttribute("aria-expanded", String(currentVariantAnalysis.expanded));

  if (!currentVariantAnalysis.expanded) {
    variantDetailsPanel.innerHTML = "";
    return;
  }

  renderVariantDetails(currentVariantAnalysis);
}

function renderVariantDetails(analysis) {
  variantDetailsPanel.innerHTML = "";

  const head = document.createElement("div");
  head.className = "variant-details-head";
  head.innerHTML = `
    <strong>Olasi sonuc dagilimi</strong>
    <span>${analysis.sampleCount} sabit seed ile tarandi. Yuzdeler tahmini gorulme oranidir.</span>
  `;

  const summary = document.createElement("div");
  summary.className = "variant-summary";
  summary.append(
    buildVariantSummaryCard("En iyi sonuc", analysis.bestVariant),
    buildVariantSummaryCard("En kotu sonuc", analysis.worstVariant),
    buildAverageSummaryCard(analysis.averageLostBlood),
    buildProbabilitySummaryCard("Zafer olasiligi", analysis.victoryProbability),
    buildProbabilitySummaryCard("Maglubiyet olasiligi", analysis.defeatProbability)
  );

  const list = document.createElement("div");
  list.className = "variant-list";

  analysis.variants.slice(0, analysis.visibleCount).forEach((variant, index) => {
    const card = document.createElement("article");
    card.className = `variant-card${variant.isCurrent ? " is-primary" : ""}`;

    const headRow = document.createElement("div");
    headRow.className = "variant-card-head";

    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${variant.winner === "ally" ? "Zafer" : "Maglubiyet"} senaryosu`;

    const badges = document.createElement("div");
    badges.className = "variant-badges";
    badges.innerHTML = `
      <span class="variant-badge">Olasilik <strong>%${formatProbability(variant.probability)}</strong></span>
      <span class="variant-badge">Kan kaybi <strong>${variant.lostBloodTotal}</strong></span>
      ${variant.isCurrent ? '<span class="variant-badge">Bu calistirmada gelen sonuc</span>' : ""}
    `;

    headRow.append(title, badges);

    const losses = document.createElement("div");
    losses.className = "variant-losses";
    const chips = buildVariantLossChips(variant.allyLosses);
    if (chips.length === 0) {
      const chip = document.createElement("span");
      chip.className = "variant-loss-chip";
      chip.textContent = "Kayip yok";
      losses.appendChild(chip);
    } else {
      chips.forEach((chipText) => {
        const chip = document.createElement("span");
        chip.className = "variant-loss-chip";
        chip.textContent = chipText;
        losses.appendChild(chip);
      });
    }

    const note = document.createElement("div");
    note.className = "variant-note";
    note.textContent = `Ornek seedler: ${variant.seeds.slice(0, 5).join(", ")}`;

    card.append(headRow, losses, note);
    list.appendChild(card);
  });

  variantDetailsPanel.append(head, summary, list);

  if (analysis.visibleCount < analysis.variants.length) {
    const moreWrap = document.createElement("div");
    moreWrap.className = "variant-more-actions";

    const remainingCount = analysis.variants.length - analysis.visibleCount;
    const moreBtn = document.createElement("button");
    moreBtn.className = "button button-secondary";
    moreBtn.type = "button";
    moreBtn.textContent = `Daha Fazlasini Goster (${remainingCount})`;
    moreBtn.addEventListener("click", () => {
      analysis.visibleCount = Math.min(
        analysis.visibleCount + VARIANT_VISIBLE_STEP,
        analysis.variants.length
      );
      renderVariantDetails(analysis);
    });

    moreWrap.appendChild(moreBtn);
    variantDetailsPanel.appendChild(moreWrap);
  }
}

function buildVariantLossChips(lossesByKey) {
  const chips = [];
  ALLY_UNITS.forEach((unit) => {
    const count = lossesByKey[unit.key] || 0;
    if (count <= 0) {
      return;
    }
    chips.push(`${unit.label}: ${count}`);
  });
  return chips;
}

function buildVariantSummaryCard(label, variant) {
  const card = document.createElement("section");
  card.className = "variant-summary-card";

  const heading = document.createElement("span");
  heading.className = "variant-summary-label";
  heading.textContent = label;

  const value = document.createElement("strong");
  value.className = "variant-summary-value";
  value.textContent = variant ? `${variant.lostBloodTotal} kan` : "-";

  const meta = document.createElement("span");
  meta.className = "variant-summary-meta";
  meta.textContent = variant
    ? `%${formatProbability(variant.probability)} | ${variant.winner === "ally" ? "Zafer" : "Maglubiyet"}`
    : "-";

  card.append(heading, value, meta);
  return card;
}

function buildAverageSummaryCard(averageLostBlood) {
  const card = document.createElement("section");
  card.className = "variant-summary-card";

  const heading = document.createElement("span");
  heading.className = "variant-summary-label";
  heading.textContent = "Ortalama kan kaybi";

  const value = document.createElement("strong");
  value.className = "variant-summary-value";
  value.textContent = `${formatAverageValue(averageLostBlood)} kan`;

  const meta = document.createElement("span");
  meta.className = "variant-summary-meta";
  meta.textContent = "Agirlikli beklenen deger";

  card.append(heading, value, meta);
  return card;
}

function buildProbabilitySummaryCard(label, probability) {
  const card = document.createElement("section");
  card.className = "variant-summary-card";

  const heading = document.createElement("span");
  heading.className = "variant-summary-label";
  heading.textContent = label;

  const value = document.createElement("strong");
  value.className = "variant-summary-value";
  value.textContent = `%${formatProbability(probability)}`;

  const meta = document.createElement("span");
  meta.className = "variant-summary-meta";
  meta.textContent = "Seed dagilimi uzerinden tahmini oran";

  card.append(heading, value, meta);
  return card;
}

function formatProbability(value) {
  return (value * 100).toFixed(value * 100 >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatAverageValue(value) {
  return value.toFixed(value >= 100 ? 0 : 1).replace(/\.0+$/, "");
}

if (langToggleSimulationBtn) {
  langToggleSimulationBtn.addEventListener("click", () => {
    const langLabel = langToggleSimulationBtn.querySelector(".button-label");
    currentLogLang = currentLogLang === "tr" ? "en" : "tr";
    if (langLabel) {
      langLabel.textContent = currentLogLang === "tr" ? "EN" : "TR";
    }
    langToggleSimulationBtn.classList.toggle("is-active", currentLogLang === "en");
    langToggleSimulationBtn.title = currentLogLang === "tr" ? "Gunlugu Ingilizceye cevir" : "Switch log to Turkish";
    paintLogPanels();
  });
}

function renderStyledLines(lines, target) {
  lines.forEach((line) => {
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
  HIGHLIGHT_PATTERNS.forEach((p) => {
    p.regex.lastIndex = 0;
    let m;
    while ((m = p.regex.exec(line)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], kind: p.kind });
    }
  });
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered = [];
  let lastEnd = 0;
  matches.forEach((m) => {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  });
  if (filtered.length === 0) {
    row.textContent = line;
    return;
  }
  let cursor = 0;
  filtered.forEach((m) => {
    if (m.start > cursor) {
      row.appendChild(document.createTextNode(line.slice(cursor, m.start)));
    }
    const span = document.createElement("span");
    span.className = m.kind;
    span.textContent = m.text;
    row.appendChild(span);
    cursor = m.end;
  });
  if (cursor < line.length) {
    row.appendChild(document.createTextNode(line.slice(cursor)));
  }
}

function classifyLine(line) {
  const stripped = line.trim();
  if (stripped.startsWith("---")) {
    return "sep";
  }
  if (stripped.includes("═")) {
    return "banner";
  }
  if (stripped.startsWith("── Raund") && stripped.endsWith("sonu ──")) {
    return "round-end";
  }
  if (stripped === "DUSMAN SAFLARI" || stripped === "MUTTEFIK SAFLARI" || stripped === "ENEMY RANKS" || stripped === "ALLY RANKS") {
    return "section-head";
  }
  if (
    stripped.startsWith("─ Dusman toplam atak") ||
    stripped.startsWith("─ Muttefik toplam atak") ||
    stripped.startsWith("─ Enemy total attack") ||
    stripped.startsWith("─ Ally total attack")
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
  if (stripped.includes(" → ") && !stripped.startsWith("-") && !stripped.startsWith("↳")) {
    return "matchup";
  }
  if (
    stripped.startsWith("Kayip Birlikler") ||
    stripped.startsWith("Lost Units") ||
    stripped.startsWith("Toplam birlik kapasitesi") ||
    stripped.startsWith("Total army capacity") ||
    stripped.includes("SAVAS  SONUCU") ||
    stripped.includes("TUR  TUR  ANALIZ")
  ) {
    return "header";
  }
  if (stripped.includes("yok edildi") || stripped.includes("completely destroyed")) {
    return "destroy";
  }
  if (
    stripped.startsWith("her raundun") ||
    stripped.startsWith("each round's") ||
    stripped.startsWith("Baslangic muharebe duzeni") ||
    stripped.startsWith("Initial battle formation")
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
    stripped.includes("units remaining") ||
    stripped.startsWith("↳")
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
    "Yarasalar", "Gulyabaniler", "Vampir Koleler", "Bansiler",
    "Nekromantlar", "Gargoyller", "Kan Cadilari", "Curuk Ceneler",
    "Bats", "Ghouls", "Thralls", "Banshees",
    "Necromancers", "Gargoyles", "Blood Witches", "Rotmaws"
  ];
  return allyNames.some((name) => line.includes(name));
}
