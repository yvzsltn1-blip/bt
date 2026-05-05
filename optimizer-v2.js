"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  parseCount,
  calculateArmyPoints,
  BLOOD_BY_ALLY_KEY,
  getStagePointLimit,
  optimizeArmyUsage,
  simulateBattle
} = window.BattleCore;

const optimizerInputs = {};
const actualLossInputs = {};
const optimizerEnemyInputs = document.querySelector("#optimizerEnemyInputs");
const optimizerAllyInputs = document.querySelector("#optimizerAllyInputs");
const optimizerSummary = document.querySelector("#optimizerSummary");
const recommendationPanel = document.querySelector("#recommendationPanel");
const optimizerLogOutput = document.querySelector("#optimizerLogOutput");
const optimizerStatus = document.querySelector("#optimizerStatus");
const optimizeBtn = document.querySelector("#optimizeBtn");
const diversityModeBtn = document.querySelector("#diversityModeBtn");
const batchRunButtons = [...document.querySelectorAll("[data-batch-runs]")];
const stopOptimizerBtn = document.querySelector("#stopOptimizerBtn");
const optimizerSampleBtn = document.querySelector("#optimizerSampleBtn");
const optimizerClearBtn = document.querySelector("#optimizerClearBtn");
const saveApprovedBtn = document.querySelector("#saveApprovedBtn");
const topResultsBtn = document.querySelector("#topResultsBtn");
const openSimulationFromOptimizerV2Btn = document.querySelector("#openSimulationFromOptimizerV2Btn");
const reportWrongOptimizerBtn = document.querySelector("#reportWrongOptimizerBtn");
const stageInput = document.querySelector("#stageInput");
const optimizerPointsValue = document.querySelector("#optimizerPointsValue");
const optimizerPointsLimit = document.querySelector("#optimizerPointsLimit");
const modeButtons = [...document.querySelectorAll(".mode-button")];
const matchedSavedPanel = document.querySelector("#matchedSavedPanel");
const modeComparePanel = document.querySelector("#modeComparePanel");
const compareToggleBtn = document.querySelector("#compareToggleBtn");
const comparePanelContent = document.querySelector("#comparePanelContent");
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
const topResultsModal = document.querySelector("#topResultsModal");
const closeTopResultsBtn = document.querySelector("#closeTopResultsBtn");
const topResultsMeta = document.querySelector("#topResultsMeta");
const topResultsList = document.querySelector("#topResultsList");
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";

let optimizerSearchSession = createEmptySearchSession();
let optimizerMode = "balanced";
let optimizerDiversityMode = false;
let optimizerComparisonCache = new Map();
let comparePanelOpen = false;
let currentApprovedCandidate = null;
let currentWrongCandidate = null;
let currentTopResultsContext = null;
let pendingWrongReport = null;
let approvedStrategies = [];
let wrongReports = [];
let optimizerStopRequested = false;

function openSimulationForCounts(enemyCounts, allyCounts) {
  try {
    window.sessionStorage.setItem(OPTIMIZER_SIMULATION_STORAGE_KEY, JSON.stringify({
      enemyCounts,
      allyCounts
    }));
    const opened = window.open("index.html", "_blank");
    if (!opened) {
      window.alert("Simulasyon yeni sekmede acilamadi. Lutfen popup engelleyiciyi kontrol et.");
      return;
    }
    opened.focus?.();
  } catch (error) {
    window.alert(`Simulasyon ekranina gecilemedi: ${error.message}`);
  }
}

function setOptimizeButtonLabel(text) {
  optimizeBtn.textContent = text;
}

saveApprovedBtn.disabled = true;
topResultsBtn.disabled = true;
if (openSimulationFromOptimizerV2Btn) {
  openSimulationFromOptimizerV2Btn.disabled = true;
}
reportWrongOptimizerBtn.disabled = true;
buildWrongLossInputs();

buildInputs(optimizerEnemyInputs, ENEMY_UNITS, "enemy");
buildInputs(optimizerAllyInputs, ALLY_UNITS, "ally");
wireSequentialInputOrder([
  ...ENEMY_UNITS.map((unit) => optimizerInputs[unit.key]),
  ...ALLY_UNITS.map((unit) => optimizerInputs[unit.key])
]);
resetValues();
renderPointSummary();
applyStageFromQuery();
void initializeApprovedStrategies();
void initializeWrongReports();
syncDiversityModeButton();
syncComparePanelToggle();
renderComparisonPanel();

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    optimizerMode = button.dataset.mode || "balanced";
    modeButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    invalidateSearchSession();
  });
});

diversityModeBtn.addEventListener("click", () => {
  optimizerDiversityMode = !optimizerDiversityMode;
  syncDiversityModeButton();
  invalidateSearchSession();
  optimizerStatus.textContent = optimizerDiversityMode ? "Cesitlilik modu acildi" : "Cesitlilik modu kapatildi";
});

compareToggleBtn.addEventListener("click", () => {
  comparePanelOpen = !comparePanelOpen;
  syncComparePanelToggle();
  renderComparisonPanel();
});

stageInput.addEventListener("input", () => {
  stageInput.value = stageInput.value.replace(/\D+/g, "");
  invalidateSearchSession();
});

stageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitStageInput();
  }
});

stageInput.addEventListener("blur", () => {
  commitStageInput();
});

optimizeBtn.addEventListener("click", () => {
  void runOptimizerSearch(1);
});

batchRunButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const batchRuns = Number.parseInt(button.dataset.batchRuns || "1", 10);
    void runOptimizerSearch(Number.isFinite(batchRuns) && batchRuns > 1 ? batchRuns : 1);
  });
});

stopOptimizerBtn.addEventListener("click", () => {
  optimizerStopRequested = true;
  stopOptimizerBtn.disabled = true;
  optimizerStatus.textContent = "Durduruluyor";
});

optimizerSampleBtn.addEventListener("click", () => {
  invalidateSearchSession();
  loadSampleValues();
  optimizerStatus.textContent = "Ornek ordu yuklendi";
});

optimizerClearBtn.addEventListener("click", () => {
  invalidateSearchSession();
  resetValues();
  optimizerSummary.innerHTML = '<p class="summary-empty">Tum girdiler sifirlandi.</p>';
  matchedActualPanel.innerHTML = "";
  recommendationPanel.innerHTML = "";
  optimizerLogOutput.textContent = "Analizden sonra onerilen dizilime ait bir savas gunlugu burada gosterilecek.";
  optimizerStatus.textContent = "Sifirlandi";
  currentApprovedCandidate = null;
  if (openSimulationFromOptimizerV2Btn) {
    openSimulationFromOptimizerV2Btn.disabled = true;
  }
  currentWrongCandidate = null;
  reportWrongOptimizerBtn.disabled = true;
});

saveApprovedBtn.addEventListener("click", async () => {
  if (!currentApprovedCandidate || !currentApprovedCandidate.result.possible) {
    window.alert("Kaydedilecek onayli bir cozum yok.");
    return;
  }

  const item = createSavedEntry(currentApprovedCandidate);
  try {
    saveApprovedBtn.disabled = true;
    await window.BTFirebase.saveApprovedStrategy(item);
    approvedStrategies = await loadApprovedStrategies();
    renderMatchedSavedStrategy();
    window.alert("Cozum onaylanip ortak kayitlara eklendi.");
  } catch (error) {
    window.alert(`Kayit sirasinda hata olustu: ${error.message}`);
  } finally {
    saveApprovedBtn.disabled = !currentApprovedCandidate || !currentApprovedCandidate.result.possible;
  }
});

topResultsBtn.addEventListener("click", () => {
  if (!currentTopResultsContext || !currentTopResultsContext.candidates.length) {
    window.alert("Gosterilecek alternatif sonuc yok.");
    return;
  }
  openTopResultsModal();
});

if (openSimulationFromOptimizerV2Btn) {
  openSimulationFromOptimizerV2Btn.addEventListener("click", () => {
    if (!currentApprovedCandidate) {
      return;
    }
    const source = getPrimaryOptimizerSource(currentApprovedCandidate.result);
    if (!source?.counts) {
      return;
    }
    openSimulationForCounts(currentApprovedCandidate.enemyCounts, source.counts);
  });
}

reportWrongOptimizerBtn.addEventListener("click", () => {
  if (!currentWrongCandidate) {
    window.alert("Raporlanacak bir sonuc yok.");
    return;
  }
  openWrongReportModal(currentWrongCandidate);
});

closeWrongReportBtn.addEventListener("click", closeWrongReportModal);
cancelWrongReportBtn.addEventListener("click", closeWrongReportModal);

submitWrongReportBtn.addEventListener("click", async () => {
  if (!pendingWrongReport) {
    return;
  }

  const report = {
    ...pendingWrongReport,
    actualSummaryText: buildActualSummaryText(),
    actualNote: actualNoteInput.value.trim()
  };

  try {
    submitWrongReportBtn.disabled = true;
    await window.BTFirebase.saveWrongReport(report);
    wrongReports = await loadWrongReports();
    renderMatchedActualReport();
    closeWrongReportModal();
    window.alert("Optimizer icin gercek sonuc kaydedildi.");
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

closeTopResultsBtn.addEventListener("click", closeTopResultsModal);

topResultsModal.addEventListener("click", (event) => {
  if (event.target === topResultsModal) {
    closeTopResultsModal();
  }
});

async function initializeApprovedStrategies() {
  approvedStrategies = await loadApprovedStrategies();
  restoreFromQuery();
  renderPointSummary();
  renderMatchedSavedStrategy();
}

async function initializeWrongReports() {
  wrongReports = await loadWrongReports();
  renderMatchedActualReport();
}

async function runOptimizerSearch(batchRuns) {
  try {
    const enemy = collectCounts(ENEMY_UNITS);
    const allyPool = collectCounts(ALLY_UNITS);
    const stage = getCommittedStage();
    if (!stage) {
      throw new Error("Lutfen gecerli bir kademe gir ve Enter ile onayla.");
    }

    const maxPoints = getStagePointLimit(stage);
    const searchKey = createSearchKey(stage, enemy, allyPool, optimizerMode, optimizerDiversityMode);
    const continuing = optimizerSearchSession.key === searchKey;
    let runIndex = continuing ? optimizerSearchSession.runCount : 0;
    let bestResult = continuing ? optimizerSearchSession.bestResult : null;
    let topCandidates = continuing ? [...optimizerSearchSession.topCandidates] : [];
    let totalCandidates = continuing ? optimizerSearchSession.totalCandidates : 0;
    let uniqueSignatures = continuing ? new Set(optimizerSearchSession.uniqueSignatures) : new Set();
    let lastResult = null;
    let lastRunConfig = null;
    let batchSimulationRuns = 0;
    let completedRuns = 0;

    optimizerStopRequested = false;
    setOptimizerBusy(true);

    for (let step = 1; step <= batchRuns; step += 1) {
      if (optimizerStopRequested) {
        break;
      }
      runIndex += 1;
      lastRunConfig = getRunConfig(stage, runIndex, optimizerMode, optimizerDiversityMode);
      optimizerStatus.textContent = batchRuns === 1 ? "Hesapliyor" : `${batchRuns} tur araniyor (${step}/${batchRuns})`;
      setOptimizeButtonLabel(batchRuns === 1 ? "Simule Ediliyor" : `${batchRuns} Tur (${step}/${batchRuns})`);
      await waitForNextFrame();

      lastResult = optimizeArmyUsage(allyPool, enemy, {
        maxPoints,
        minWinRate: 0.75,
        trialCount: lastRunConfig.trialCount,
        fullArmyTrials: lastRunConfig.fullArmyTrials,
        beamWidth: lastRunConfig.beamWidth,
        maxIterations: lastRunConfig.maxIterations,
        eliteCount: lastRunConfig.eliteCount,
        stabilityTrials: lastRunConfig.stabilityTrials,
        baseSeed: lastRunConfig.baseSeed,
        diversityMode: optimizerDiversityMode,
        diversityCandidateCount: lastRunConfig.diversityCandidateCount,
        knownSignatures: [...uniqueSignatures]
      });

      batchSimulationRuns += lastResult.simulationRuns || 0;
      bestResult = bestResult ? pickBetterOptimizerResult(bestResult, lastResult) : lastResult;
      topCandidates = mergeOptimizerCandidates(topCandidates, lastResult.topCandidates || [], { limit: 120 });
      totalCandidates += lastResult.searchedCandidates;
      (lastResult.uniqueCandidateSignatures || []).forEach((signature) => uniqueSignatures.add(signature));
      completedRuns += 1;
    }

    if (completedRuns === 0) {
      setOptimizeButtonLabel("Tekrar Simule Et");
      optimizerStatus.textContent = "Durduruldu";
      return;
    }

    optimizerSearchSession = {
      key: searchKey,
      runCount: runIndex,
      totalCandidates,
      uniqueSignatures,
      bestResult,
      topCandidates
    };

    renderOptimizerResult({
      ...bestResult,
      topCandidates: mergeOptimizerCandidates([getPrimaryOptimizerSource(bestResult)], topCandidates, { limit: 120 })
    }, stage, maxPoints, {
      runIndex,
      lastCandidates: lastResult.searchedCandidates,
      totalCandidates,
      lastUniqueCandidates: lastResult.uniqueCandidateCount || 0,
      totalUniqueCandidates: uniqueSignatures.size,
      runConfig: lastRunConfig,
      mode: optimizerMode,
      diversityMode: optimizerDiversityMode,
      batchRuns: completedRuns,
      batchSimulationRuns
    });

    setOptimizeButtonLabel("Tekrar Simule Et");
    optimizerStatus.textContent = optimizerStopRequested ? "Durduruldu" : "Tamamlandi";
  } catch (error) {
    setOptimizeButtonLabel("Tekrar Simule Et");
    optimizerStatus.textContent = "Hata";
    window.alert(error.message);
  } finally {
    setOptimizerBusy(false);
    optimizerStopRequested = false;
  }
}

function createEmptySearchSession() {
  return {
    key: "",
    runCount: 0,
    totalCandidates: 0,
    uniqueSignatures: new Set(),
    bestResult: null,
    topCandidates: []
  };
}

function setOptimizerBusy(isBusy) {
  optimizeBtn.disabled = isBusy;
  stopOptimizerBtn.disabled = !isBusy;
  optimizerSampleBtn.disabled = isBusy;
  optimizerClearBtn.disabled = isBusy;
  diversityModeBtn.disabled = isBusy;
  stageInput.disabled = isBusy;
  saveApprovedBtn.disabled = isBusy || !currentApprovedCandidate || !currentApprovedCandidate.result.possible;
  topResultsBtn.disabled = isBusy || !currentTopResultsContext || !currentTopResultsContext.candidates.length;
  if (openSimulationFromOptimizerV2Btn) {
    openSimulationFromOptimizerV2Btn.disabled = isBusy || !currentApprovedCandidate || !getPrimaryOptimizerSource(currentApprovedCandidate.result)?.counts;
  }
  reportWrongOptimizerBtn.disabled = isBusy || !currentWrongCandidate;
  modeButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  Object.values(optimizerInputs).forEach((input) => {
    input.disabled = isBusy;
  });
  batchRunButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function syncDiversityModeButton() {
  diversityModeBtn.classList.toggle("is-active", optimizerDiversityMode);
  diversityModeBtn.setAttribute("aria-pressed", optimizerDiversityMode ? "true" : "false");
  diversityModeBtn.textContent = optimizerDiversityMode ? "Cesitlilik Acik" : "Cesitlilik Modu";
}

function syncComparePanelToggle() {
  compareToggleBtn.textContent = comparePanelOpen ? "-" : "+";
  compareToggleBtn.setAttribute("aria-expanded", comparePanelOpen ? "true" : "false");
  compareToggleBtn.title = comparePanelOpen ? "Mod kiyaslamayi kapat" : "Mod kiyaslamayi ac";
  comparePanelContent.hidden = !comparePanelOpen;
}

function invalidateSearchSession() {
  optimizerSearchSession = createEmptySearchSession();
  setOptimizeButtonLabel("Simule Et");
  currentApprovedCandidate = null;
  currentWrongCandidate = null;
  currentTopResultsContext = null;
  saveApprovedBtn.disabled = true;
  topResultsBtn.disabled = true;
  reportWrongOptimizerBtn.disabled = true;
  closeTopResultsModal();
  renderMatchedActualReport();
  renderComparisonPanel();
}

function createSearchKey(stage, enemy, allyPool, mode, diversityMode) {
  return JSON.stringify({ stage, enemy, allyPool, mode, diversityMode: Boolean(diversityMode) });
}

function createComparisonKey(stage, enemy, allyPool, mode) {
  return JSON.stringify({ stage, enemy, allyPool, mode });
}

async function loadApprovedStrategies() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadApprovedStrategies !== "function") {
    return [];
  }
  try {
    return await window.BTFirebase.loadApprovedStrategies();
  } catch (error) {
    console.warn("Onayli cozumler yuklenemedi.", error);
    return [];
  }
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

function getRunConfig(stage, runIndex, mode, diversityMode = false) {
  const presets = {
    fast: {
      trialStart: 4,
      trialStep: 1,
      trialMax: 12,
      fullStart: 6,
      fullStep: 2,
      fullMax: 20,
      beamStart: 7,
      beamStep: 2,
      beamMax: 18,
      iterStart: 3,
      iterStep: 1,
      iterMax: 6,
      eliteCount: 4,
      stabilityMultiplier: 2,
      seedOffset: 1301
    },
    balanced: {
      trialStart: 6,
      trialStep: 2,
      trialMax: 20,
      fullStart: 10,
      fullStep: 4,
      fullMax: 36,
      beamStart: 10,
      beamStep: 3,
      beamMax: 28,
      iterStart: 4,
      iterStep: 1,
      iterMax: 8,
      eliteCount: 6,
      stabilityMultiplier: 3,
      seedOffset: 2603
    },
    deep: {
      trialStart: 10,
      trialStep: 3,
      trialMax: 30,
      fullStart: 16,
      fullStep: 6,
      fullMax: 48,
      beamStart: 14,
      beamStep: 4,
      beamMax: 36,
      iterStart: 5,
      iterStep: 1,
      iterMax: 10,
      eliteCount: 8,
      stabilityMultiplier: 4,
      seedOffset: 5209
    }
  };

  const preset = presets[mode] || presets.balanced;
  const trialCount = Math.min(preset.trialStart + (runIndex - 1) * preset.trialStep, preset.trialMax);
  const fullArmyTrials = Math.min(preset.fullStart + (runIndex - 1) * preset.fullStep, preset.fullMax);
  return {
    trialCount,
    fullArmyTrials,
    beamWidth: Math.min(preset.beamStart + (runIndex - 1) * preset.beamStep, preset.beamMax),
    maxIterations: Math.min(preset.iterStart + (runIndex - 1) * preset.iterStep, preset.iterMax),
    eliteCount: preset.eliteCount,
    stabilityTrials: Math.max(fullArmyTrials, trialCount * preset.stabilityMultiplier),
    diversityCandidateCount: diversityMode
      ? Math.min(
        Math.max(24, Math.floor((Math.min(preset.beamStart + (runIndex - 1) * preset.beamStep, preset.beamMax) || 0) * 3)),
        144
      )
      : 0,
    baseSeed: 41017 + stage * 31 + runIndex * 7919 + preset.seedOffset + (diversityMode ? 170003 : 0)
  };
}

function pickBetterOptimizerResult(left, right) {
  const leftSource = left.possible ? left.recommendation : left.fallback || left.fullArmyEvaluation;
  const rightSource = right.possible ? right.recommendation : right.fallback || right.fullArmyEvaluation;

  if (left.possible !== right.possible) {
    return left.possible ? left : right;
  }

  if (left.possible) {
    if (leftSource.avgLostBlood !== rightSource.avgLostBlood) {
      return leftSource.avgLostBlood < rightSource.avgLostBlood ? left : right;
    }
    if (leftSource.avgUsedPoints !== rightSource.avgUsedPoints) {
      return leftSource.avgUsedPoints < rightSource.avgUsedPoints ? left : right;
    }
    if (leftSource.winRate !== rightSource.winRate) {
      return leftSource.winRate > rightSource.winRate ? left : right;
    }
    return leftSource.avgUsedCapacity <= rightSource.avgUsedCapacity ? left : right;
  }

  if (leftSource.winRate !== rightSource.winRate) {
    return leftSource.winRate > rightSource.winRate ? left : right;
  }
  if (leftSource.avgEnemyRemainingHealth !== rightSource.avgEnemyRemainingHealth) {
    return leftSource.avgEnemyRemainingHealth < rightSource.avgEnemyRemainingHealth ? left : right;
  }
  return leftSource.avgEnemyRemainingUnits <= rightSource.avgEnemyRemainingUnits ? left : right;
}

function buildInputs(target, units, side) {
  target.innerHTML = "";
  units.forEach((unit) => {
    const row = document.createElement("div");
    row.className = "unit-row";

    const label = document.createElement("label");
    label.htmlFor = `optimizer-${unit.key}`;
    label.textContent = unit.label;

    const input = createNumberInput(`optimizer-${unit.key}`, "0");
    input.addEventListener("input", () => {
      invalidateSearchSession();
      if (side === "ally") {
        renderPointSummary();
      }
      renderMatchedSavedStrategy();
    });

    row.append(label, input);
    target.appendChild(row);
    optimizerInputs[unit.key] = input;
  });
}

function buildWrongLossInputs() {
  wrongLossInputs.innerHTML = "";
  const inputs = [];
  ALLY_UNITS.forEach((unit) => {
    const row = document.createElement("div");
    row.className = "unit-row";

    const label = document.createElement("label");
    label.htmlFor = `optimizer-actual-loss-${unit.key}`;
    label.textContent = unit.label;

    const input = createNumberInput(`optimizer-actual-loss-${unit.key}`, "0");
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
    renderPointSummary();
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
    counts[unit.key] = parseCount(optimizerInputs[unit.key].value, unit.label);
  });
  return counts;
}

function resetValues() {
  [...ENEMY_UNITS, ...ALLY_UNITS].forEach((unit) => {
    optimizerInputs[unit.key].value = "0";
  });
  renderPointSummary();
  renderMatchedSavedStrategy();
}

function loadSampleValues() {
  ENEMY_UNITS.forEach((unit) => {
    optimizerInputs[unit.key].value = String(unit.sample);
  });
  ALLY_UNITS.forEach((unit) => {
    optimizerInputs[unit.key].value = String(unit.sample);
  });
  renderPointSummary();
  renderMatchedSavedStrategy();
}

function renderPointSummary() {
  const points = calculateArmyPoints(collectCounts(ALLY_UNITS));
  const stage = getCommittedStage();
  const limit = stage ? getStagePointLimit(stage) : null;
  optimizerPointsValue.textContent = String(points);
  optimizerPointsLimit.textContent = limit === null ? "-" : String(limit);
}

function commitStageInput() {
  const stage = getCommittedStage();
  if (!stage) {
    stageInput.value = "";
  } else {
    stageInput.value = String(stage);
  }
  renderPointSummary();
  renderMatchedSavedStrategy();
}

function getCommittedStage() {
  const raw = stageInput.value.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function renderOptimizerResult(result, stage, maxPoints, meta) {
  const summaryBlock = document.createElement("div");
  summaryBlock.className = "terminal-block";
  const progressLines = [
    `- mod: ${getModeLabel(meta.mode, meta.diversityMode)}`,
    `- deneme: ${meta.runIndex}`,
    `- bu basista tur: ${meta.batchRuns || 1}`,
    `- bu tur taranan: ${meta.lastCandidates}`,
    `- toplam taranan: ${meta.totalCandidates}`,
    `- benzersiz kombinasyon: ${meta.lastUniqueCandidates} (bu tur) / ${meta.totalUniqueCandidates} (toplam)`,
    `- trial / aday: ${meta.runConfig.trialCount}`,
    `- beam genisligi: ${meta.runConfig.beamWidth}`,
    `- elit aday: ${meta.runConfig.eliteCount}`,
    `- stabilite testi: ${meta.runConfig.stabilityTrials}`,
    `- bu basista savas kosusu: ${meta.batchSimulationRuns || result.simulationRuns}`
  ];

  let summaryLines;
  if (result.possible) {
    const recommendation = result.recommendation;
    summaryLines = [
      "======================  OPTIMIZER  SONUCU  ======================",
      `>> ${stage}. kademede bu savas kazanilabilir.`,
      `- puan limiti: ${maxPoints}`,
      `- beklenen kazanma orani: %${Math.round(recommendation.winRate * 100)}`,
      `- ortalama kan kaybi: ${Math.round(recommendation.avgLostBlood)}`,
      `- kullanilan puan: ${Math.round(recommendation.avgUsedPoints)}`,
      ...progressLines
    ];
  } else {
    const fallback = result.fallback || result.fullArmyEvaluation;
    summaryLines = [
      "======================  OPTIMIZER  SONUCU  ======================",
      `>> ${stage}. kademe limitiyle bu savas kazanilmaz.`,
      `- puan limiti: ${maxPoints}`,
      `- en iyi denenen duzen kazanamadi`,
      `- yaklasik kazanma orani: %${Math.round(fallback.winRate * 100)}`,
      `- rakibin ortalama kalan cani: ${Math.round(fallback.avgEnemyRemainingHealth)}`,
      ...progressLines
    ];
  }
  renderStyledLines(summaryLines, summaryBlock);

  optimizerSummary.innerHTML = "";
  optimizerSummary.appendChild(summaryBlock);

  const enemyCounts = collectCounts(ENEMY_UNITS);
  const allyPool = collectCounts(ALLY_UNITS);
  cacheComparisonResult(stage, enemyCounts, allyPool, maxPoints, result, meta);
  renderRecommendationCards(result, maxPoints, meta);
  const battleView = renderBattleLog(result.sampleBattle.logText);

  currentApprovedCandidate = {
    stage,
    mode: meta.mode,
    diversityMode: meta.diversityMode,
    enemyCounts,
    allyPool,
    result
  };
  saveApprovedBtn.disabled = !result.possible;
  currentTopResultsContext = {
    stage,
    maxPoints,
    mode: meta.mode,
    diversityMode: meta.diversityMode,
    candidates: buildDisplayedTopCandidates(result)
  };
  topResultsBtn.disabled = !currentTopResultsContext.candidates.length;
  currentWrongCandidate = createWrongReportEntry(result, stage, maxPoints, meta, battleView.summaryText, battleView.logText);
  reportWrongOptimizerBtn.disabled = false;
  renderMatchedActualReport();
  renderComparisonPanel();
}

function cacheComparisonResult(stage, enemyCounts, allyPool, maxPoints, result, meta) {
  const source = getPrimaryOptimizerSource(result);
  if (!source) {
    return;
  }

  const key = createComparisonKey(stage, enemyCounts, allyPool, meta.mode);
  const entry = optimizerComparisonCache.get(key) || {
    key,
    stage,
    mode: meta.mode,
    maxPoints,
    enemyCounts: { ...enemyCounts },
    allyPool: { ...allyPool },
    benchmark: null,
    normal: null,
    diverse: null
  };

  const lane = meta.diversityMode ? "diverse" : "normal";
  const nextSnapshot = createComparisonSnapshot(source, meta);
  entry.stage = stage;
  entry.mode = meta.mode;
  entry.maxPoints = maxPoints;
  entry.enemyCounts = { ...enemyCounts };
  entry.allyPool = { ...allyPool };
  if (!areComparisonSnapshotsEqual(entry[lane], nextSnapshot)) {
    entry.benchmark = null;
  }
  entry[lane] = nextSnapshot;
  optimizerComparisonCache.set(key, entry);
}

function createComparisonSnapshot(source, meta) {
  return {
    label: meta.diversityMode ? "Cesitlilik" : "Standart",
    modeLabel: getModeLabel(meta.mode, meta.diversityMode),
    feasible: Boolean(source.feasible),
    winRate: source.winRate || 0,
    avgLostBlood: Number.isFinite(source.avgLostBlood) ? source.avgLostBlood : null,
    avgUsedPoints: source.avgUsedPoints || 0,
    avgUsedCapacity: source.avgUsedCapacity || 0,
    avgEnemyRemainingHealth: source.avgEnemyRemainingHealth || 0,
    avgEnemyRemainingUnits: source.avgEnemyRemainingUnits || 0,
    avgAllyLosses: { ...(source.avgAllyLosses || {}) },
    counts: { ...(source.counts || {}) }
  };
}

function areComparisonSnapshotsEqual(left, right) {
  if (!left || !right) {
    return false;
  }
  return getOptimizerCandidateSignature(left) === getOptimizerCandidateSignature(right);
}

function getCurrentComparisonEntry() {
  const stage = getCommittedStage();
  if (!stage) {
    return null;
  }

  const enemyCounts = collectCounts(ENEMY_UNITS);
  const allyPool = collectCounts(ALLY_UNITS);
  const key = createComparisonKey(stage, enemyCounts, allyPool, optimizerMode);
  return optimizerComparisonCache.get(key) || null;
}

function compareResultSnapshots(left, right) {
  if (!left || !right) {
    return 0;
  }
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }
  if (left.feasible) {
    if ((left.avgLostBlood ?? Number.POSITIVE_INFINITY) !== (right.avgLostBlood ?? Number.POSITIVE_INFINITY)) {
      return (left.avgLostBlood ?? Number.POSITIVE_INFINITY) - (right.avgLostBlood ?? Number.POSITIVE_INFINITY);
    }
    if (left.avgUsedPoints !== right.avgUsedPoints) {
      return left.avgUsedPoints - right.avgUsedPoints;
    }
    if (left.winRate !== right.winRate) {
      return right.winRate - left.winRate;
    }
    return left.avgUsedCapacity - right.avgUsedCapacity;
  }
  if (left.winRate !== right.winRate) {
    return right.winRate - left.winRate;
  }
  if (left.avgEnemyRemainingHealth !== right.avgEnemyRemainingHealth) {
    return left.avgEnemyRemainingHealth - right.avgEnemyRemainingHealth;
  }
  return left.avgEnemyRemainingUnits - right.avgEnemyRemainingUnits;
}

function renderComparisonPanel() {
  comparePanelContent.innerHTML = "";
  comparePanelContent.className = "compare-panel-content";

  if (!comparePanelOpen) {
    return;
  }

  const entry = getCurrentComparisonEntry();
  if (!entry) {
    comparePanelContent.innerHTML = '<p class="summary-empty">Kiyaslama icin once ayni senaryoda bir sonuc uret.</p>';
    return;
  }

  if (!entry.normal || !entry.diverse) {
    const missingLabel = entry.normal ? "Cesitlilik modu" : "Standart mod";
    comparePanelContent.innerHTML = `<p class="summary-empty">${missingLabel} ile de ayni senaryoyu calistir; kutu burada yan yana kiyaslayacak.</p>`;
    return;
  }

  const benchmark = getComparisonBenchmark(entry);

  const summary = document.createElement("div");
  summary.className = "compare-summary";
  const winner = compareResultSnapshots(benchmark.normal, benchmark.diverse) <= 0 ? benchmark.normal : benchmark.diverse;
  const bloodDiff = Number.isFinite(benchmark.normal.avgLostBlood) && Number.isFinite(benchmark.diverse.avgLostBlood)
    ? Math.round(Math.abs(benchmark.normal.avgLostBlood - benchmark.diverse.avgLostBlood))
    : null;
  const pointsDiff = Math.abs(Math.round(benchmark.normal.avgUsedPoints) - Math.round(benchmark.diverse.avgUsedPoints));

  [
    ["Daha iyi sonuc", winner.label],
    ["Kan kaybi farki", bloodDiff === null ? "Kiyas yok" : `${bloodDiff}`],
    ["Puan farki", `${pointsDiff}`],
    ["Benchmark", `${benchmark.trialCount} ortak savas`]
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "compare-summary-item";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    item.append(span, strong);
    summary.appendChild(item);
  });

  const grid = document.createElement("div");
  grid.className = "compare-grid";
  const betterLabel = winner.label;
  grid.append(
    createComparisonCard(benchmark.normal, entry.maxPoints, betterLabel === benchmark.normal.label),
    createComparisonCard(benchmark.diverse, entry.maxPoints, betterLabel === benchmark.diverse.label)
  );

  comparePanelContent.append(summary, grid);
}

function createComparisonCard(snapshot, maxPoints, isBetter) {
  const card = document.createElement("article");
  card.className = `compare-card${isBetter ? " is-better" : ""}`;

  const head = document.createElement("div");
  head.className = "compare-card-head";

  const titleWrap = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = snapshot.label;
  const subtitle = document.createElement("span");
  subtitle.textContent = snapshot.modeLabel;
  titleWrap.append(title, subtitle);

  const badge = document.createElement("span");
  badge.className = "compare-badge";
  badge.textContent = snapshot.feasible ? "Kazanabilir" : "Yetersiz";
  head.append(titleWrap, badge);

  const meta = document.createElement("div");
  meta.className = "saved-match-meta";
  [
    ["Kazanma orani", `%${Math.round(snapshot.winRate * 100)}`],
    ["Kan kaybi", snapshot.feasible && snapshot.avgLostBlood !== null ? `${Math.round(snapshot.avgLostBlood)}` : "Kazanis yok"],
    ["Puan", `${Math.round(snapshot.avgUsedPoints)} / ${maxPoints}`],
    ["Kapasite", `${Math.round(snapshot.avgUsedCapacity)}`]
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    item.innerHTML = `${label}: <strong>${value}</strong>`;
    meta.appendChild(item);
  });

  const list = buildTopResultUnitList(snapshot.counts, { expectedLosses: snapshot.avgAllyLosses });
  card.append(head, meta, list);
  return card;
}

function getComparisonBenchmark(entry) {
  if (entry.benchmark) {
    return entry.benchmark;
  }

  const trialCount = 180;
  const baseHash = hashText(`${entry.key}|benchmark`);
  const seeds = Array.from({ length: trialCount }, (_, index) => 700001 + ((baseHash + index * 977) >>> 0));

  entry.benchmark = {
    trialCount,
    normal: evaluateComparisonSnapshot(entry.enemyCounts, entry.normal, seeds),
    diverse: evaluateComparisonSnapshot(entry.enemyCounts, entry.diverse, seeds)
  };
  return entry.benchmark;
}

function evaluateComparisonSnapshot(enemyCounts, snapshot, seeds) {
  let wins = 0;
  let lostBloodSum = 0;
  let lostUnitsSum = 0;
  let usedCapacitySum = 0;
  let usedPointsSum = 0;
  let enemyRemainingHealthSum = 0;
  let enemyRemainingUnitsSum = 0;
  const allyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));

  seeds.forEach((seed) => {
    const result = simulateBattle(enemyCounts, snapshot.counts, { seed, collectLog: false });
    usedCapacitySum += result.usedCapacity;
    usedPointsSum += result.usedPoints;
    enemyRemainingHealthSum += result.enemyRemainingHealth;
    enemyRemainingUnitsSum += result.enemyRemainingUnits;
    if (result.winner === "ally") {
      wins += 1;
      lostBloodSum += result.lostBloodTotal;
      lostUnitsSum += result.lostUnitsTotal;
      ALLY_UNITS.forEach((unit) => {
        allyLossesSum[unit.key] += result.allyLosses?.[unit.key] || 0;
      });
    }
  });

  const winRate = wins / seeds.length;
  return {
    ...snapshot,
    trials: seeds.length,
    wins,
    winRate,
    feasible: winRate >= 0.75,
    avgLostBlood: wins > 0 ? lostBloodSum / wins : null,
    avgLostUnits: wins > 0 ? lostUnitsSum / wins : null,
    avgUsedCapacity: usedCapacitySum / seeds.length,
    avgUsedPoints: usedPointsSum / seeds.length,
    avgEnemyRemainingHealth: enemyRemainingHealthSum / seeds.length,
    avgEnemyRemainingUnits: enemyRemainingUnitsSum / seeds.length,
    avgAllyLosses: Object.fromEntries(
      ALLY_UNITS.map((unit) => [unit.key, wins > 0 ? allyLossesSum[unit.key] / wins : 0])
    )
  };
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getPrimaryOptimizerSource(result) {
  return result.possible ? result.recommendation : result.fallback || result.fullArmyEvaluation || null;
}

function getOptimizerCandidateSignature(entry) {
  if (!entry) {
    return "";
  }
  if (entry.signature) {
    return entry.signature;
  }
  return ALLY_UNITS.map((unit) => entry.counts?.[unit.key] || 0).join("|");
}

function compareOptimizerCandidates(left, right) {
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }

  if (left.feasible) {
    if (left.avgLostBlood !== right.avgLostBlood) {
      return left.avgLostBlood - right.avgLostBlood;
    }
    if (left.avgUsedPoints !== right.avgUsedPoints) {
      return left.avgUsedPoints - right.avgUsedPoints;
    }
    if (left.winRate !== right.winRate) {
      return right.winRate - left.winRate;
    }
    if (left.avgUsedCapacity !== right.avgUsedCapacity) {
      return left.avgUsedCapacity - right.avgUsedCapacity;
    }
    if (left.avgLostUnits !== right.avgLostUnits) {
      return left.avgLostUnits - right.avgLostUnits;
    }
    return getOptimizerCandidateSignature(left).localeCompare(getOptimizerCandidateSignature(right));
  }

  if (left.winRate !== right.winRate) {
    return right.winRate - left.winRate;
  }
  if (left.avgEnemyRemainingHealth !== right.avgEnemyRemainingHealth) {
    return left.avgEnemyRemainingHealth - right.avgEnemyRemainingHealth;
  }
  if (left.avgEnemyRemainingUnits !== right.avgEnemyRemainingUnits) {
    return left.avgEnemyRemainingUnits - right.avgEnemyRemainingUnits;
  }
  if (left.avgUsedPoints !== right.avgUsedPoints) {
    return left.avgUsedPoints - right.avgUsedPoints;
  }
  return getOptimizerCandidateSignature(left).localeCompare(getOptimizerCandidateSignature(right));
}

function mergeOptimizerCandidates(...groups) {
  let limit = 12;
  if (groups.length > 0) {
    const last = groups[groups.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last) && Number.isFinite(last.limit)) {
      limit = Math.max(1, Math.floor(last.limit));
      groups = groups.slice(0, -1);
    }
  }

  const unique = new Map();
  groups
    .flat()
    .filter(Boolean)
    .forEach((entry) => {
      const signature = getOptimizerCandidateSignature(entry);
      const normalized = {
        ...entry,
        signature
      };
      const existing = unique.get(signature);
      if (!existing || compareOptimizerCandidates(normalized, existing) < 0) {
        unique.set(signature, normalized);
      }
    });

  return [...unique.values()]
    .sort(compareOptimizerCandidates)
    .slice(0, limit);
}

function getRoundedLossMetrics(entry) {
  const avgLosses = entry?.avgAllyLosses || {};
  let singletonTypes = 0;
  let repeatedTypes = 0;
  let repeatedOverflow = 0;
  let maxRepeatedStack = 0;
  let totalRoundedLosses = 0;
  let roundedBloodLoss = 0;

  ALLY_UNITS.forEach((unit) => {
    const rounded = Math.max(0, Math.round(avgLosses[unit.key] || 0));
    if (rounded <= 0) {
      return;
    }

    totalRoundedLosses += rounded;
    roundedBloodLoss += rounded * (BLOOD_BY_ALLY_KEY[unit.key] || 0);

    if (rounded === 1) {
      singletonTypes += 1;
      return;
    }

    repeatedTypes += 1;
    repeatedOverflow += rounded - 1;
    if (rounded > maxRepeatedStack) {
      maxRepeatedStack = rounded;
    }
  });

  return {
    singletonTypes,
    repeatedTypes,
    repeatedOverflow,
    maxRepeatedStack,
    totalRoundedLosses,
    roundedBloodLoss
  };
}

function compareAlternativeTopCandidates(left, right) {
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }

  if (left.feasible) {
    const leftMetrics = getRoundedLossMetrics(left);
    const rightMetrics = getRoundedLossMetrics(right);

    if (leftMetrics.repeatedOverflow !== rightMetrics.repeatedOverflow) {
      return leftMetrics.repeatedOverflow - rightMetrics.repeatedOverflow;
    }
    if (leftMetrics.repeatedTypes !== rightMetrics.repeatedTypes) {
      return leftMetrics.repeatedTypes - rightMetrics.repeatedTypes;
    }
    if (leftMetrics.maxRepeatedStack !== rightMetrics.maxRepeatedStack) {
      return leftMetrics.maxRepeatedStack - rightMetrics.maxRepeatedStack;
    }
    if (leftMetrics.roundedBloodLoss !== rightMetrics.roundedBloodLoss) {
      return leftMetrics.roundedBloodLoss - rightMetrics.roundedBloodLoss;
    }
    if (leftMetrics.singletonTypes !== rightMetrics.singletonTypes) {
      return rightMetrics.singletonTypes - leftMetrics.singletonTypes;
    }
  }

  return compareOptimizerCandidates(left, right);
}

function buildDisplayedTopCandidates(result) {
  const primary = getPrimaryOptimizerSource(result);
  const ranked = mergeOptimizerCandidates(primary ? [primary] : [], result.topCandidates || [], { limit: 120 });
  if (!primary) {
    return ranked.slice(0, 5);
  }
  const primarySignature = getOptimizerCandidateSignature(primary);
  const alternatives = ranked
    .filter((entry) => getOptimizerCandidateSignature(entry) !== primarySignature)
    .sort(compareAlternativeTopCandidates);

  return [
    {
      ...primary,
      signature: primarySignature
    },
    ...alternatives
  ].slice(0, 5);
}

function openTopResultsModal() {
  renderTopResultsModal();
  topResultsModal.hidden = false;
}

function closeTopResultsModal() {
  topResultsModal.hidden = true;
}

function renderTopResultsModal() {
  topResultsMeta.innerHTML = "";
  topResultsList.innerHTML = "";

  if (!currentTopResultsContext || !currentTopResultsContext.candidates.length) {
    topResultsList.innerHTML = '<p class="summary-empty">Henuz gosterilecek sonuc yok.</p>';
    return;
  }

  [
    `${currentTopResultsContext.stage}. Kademe`,
    `${getModeLabel(currentTopResultsContext.mode, currentTopResultsContext.diversityMode)} mod`,
    `Puan limiti ${currentTopResultsContext.maxPoints}`,
    `${currentTopResultsContext.candidates.length} sonuc`
  ].forEach((text) => {
    const chip = document.createElement("span");
    chip.textContent = text;
    topResultsMeta.appendChild(chip);
  });

  currentTopResultsContext.candidates.forEach((entry, index) => {
    topResultsList.appendChild(createTopResultCard(entry, index, currentTopResultsContext.maxPoints));
  });
}

function createTopResultCard(entry, index, maxPoints) {
  const card = document.createElement("article");
  card.className = `top-result-card${index === 0 ? " is-primary" : ""}`;

  const head = document.createElement("div");
  head.className = "top-result-head";

  const titleWrap = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = index === 0 ? "Ana sonuc" : `${index + 1}. sonuc`;
  const subtitle = document.createElement("span");
  subtitle.textContent = entry.feasible ? "Kazanabilir dizilim" : "Kazanamayan ama en yakin alternatif";
  titleWrap.append(title, subtitle);

  const badge = document.createElement("span");
  badge.textContent = entry.feasible ? "Kazanilir" : "Alternatif";
  head.append(titleWrap, badge);

  const summary = document.createElement("div");
  summary.className = "top-result-summary";

  const summaryStats = entry.feasible
    ? [
        ["Kazanma orani", `%${Math.round(entry.winRate * 100)}`],
        ["Ortalama kan kaybi", `${Math.round(entry.avgLostBlood)}`],
        ["Kullanilan puan", `${Math.round(entry.avgUsedPoints)} / ${maxPoints}`],
        ["Kapasite", `${Math.round(entry.avgUsedCapacity)}`]
      ]
    : [
        ["Kazanma orani", `%${Math.round(entry.winRate * 100)}`],
        ["Rakip kalan can", `${Math.round(entry.avgEnemyRemainingHealth)}`],
        ["Rakip kalan birlik", `${Math.round(entry.avgEnemyRemainingUnits)}`],
        ["Kullanilan puan", `${Math.round(entry.avgUsedPoints)} / ${maxPoints}`]
      ];

  summaryStats.forEach(([label, value]) => {
    const stat = document.createElement("div");
    stat.className = "top-result-stat";
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = value;
    stat.append(labelNode, valueNode);

    if (label === "Ortalama kan kaybi") {
      const lossNote = document.createElement("small");
      lossNote.className = "top-result-loss-note";
      lossNote.textContent = formatCandidateLossBreakdown(entry);
      stat.appendChild(lossNote);
    }

    summary.appendChild(stat);
  });

  const actions = document.createElement("div");
  actions.className = "top-result-actions";
  const detailBtn = document.createElement("button");
  detailBtn.className = "button button-ghost";
  detailBtn.type = "button";
  detailBtn.textContent = "Detay Goster";
  actions.appendChild(detailBtn);

  const details = document.createElement("div");
  details.className = "top-result-details";
  details.hidden = true;

  const detailGrid = document.createElement("div");
  detailGrid.className = "top-result-detail-grid";

  const armyBlock = document.createElement("section");
  armyBlock.className = "top-result-detail-block";
  const armyTitle = document.createElement("h3");
  armyTitle.textContent = "Birlik Dizilisi";
  armyBlock.append(armyTitle, buildTopResultUnitList(entry.counts));

  const metaBlock = document.createElement("section");
  metaBlock.className = "top-result-detail-block";
  const metaTitle = document.createElement("h3");
  metaTitle.textContent = "Detay Metrikleri";
  const metaList = document.createElement("ul");
  metaList.className = "recommend-list";
  [
    ["Ornek galibiyet", entry.wins ?? 0],
    ["Toplam trial", entry.trials ?? 0],
    ["Ortalama kayip birlik", Number.isFinite(entry.avgLostUnits) ? Math.round(entry.avgLostUnits) : "-"],
    ["Durum", entry.feasible ? "Kazanabilir" : "Alternatif deneme"],
    ["Yaklasik kayip", formatCandidateLossBreakdown(entry)]
  ].forEach(([label, value]) => {
    const row = document.createElement("li");
    row.className = "recommend-row";
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = String(value);
    row.append(labelNode, valueNode);
    metaList.appendChild(row);
  });
  metaBlock.append(metaTitle, metaList);

  const note = document.createElement("p");
  note.className = "top-result-detail-note";
  note.textContent = "Detay alani sadece dizilim ve ortalama metrikleri gosterir.";

  detailGrid.append(armyBlock, metaBlock);
  details.append(detailGrid, note);

  detailBtn.addEventListener("click", () => {
    const nextHidden = !details.hidden;
    details.hidden = nextHidden;
    detailBtn.textContent = nextHidden ? "Detay Goster" : "Detayi Gizle";
  });

  card.append(head, summary, actions, details);
  return card;
}

function buildTopResultUnitList(counts, options = {}) {
  const list = document.createElement("ul");
  list.className = "recommend-list";
  const expectedLosses = options.expectedLosses || {};

  let shown = 0;
  ALLY_UNITS.forEach((unit) => {
    const count = counts?.[unit.key] || 0;
    if (count <= 0) {
      return;
    }
    shown += 1;
    const row = document.createElement("li");
    row.className = "recommend-row";
    const label = document.createElement("span");
    label.textContent = unit.label;
    const value = document.createElement("strong");
    value.textContent = String(count);
    const expectedLoss = Math.round(expectedLosses[unit.key] || 0);
    if (expectedLoss > 0) {
      value.append(" / ");
      const lossNote = document.createElement("span");
      lossNote.className = "compare-loss-note";
      lossNote.textContent = String(expectedLoss);
      value.appendChild(lossNote);
    }
    row.append(label, value);
    list.appendChild(row);
  });

  if (shown === 0) {
    const row = document.createElement("li");
    row.className = "recommend-row";
    const label = document.createElement("span");
    label.textContent = "Birlik secilmedi";
    const value = document.createElement("strong");
    value.textContent = "0 adet";
    row.append(label, value);
    list.appendChild(row);
  }

  return list;
}

function formatCandidateLossBreakdown(entry) {
  const avgLosses = entry?.avgAllyLosses || {};
  const parts = ALLY_UNITS.map((unit) => {
    const value = avgLosses[unit.key] || 0;
    const rounded = Math.round(value);
    if (rounded <= 0) {
      return null;
    }
    return `~${rounded} ${getSummaryUnitName(unit.key)}`;
  }).filter(Boolean);

  if (!parts.length) {
    return entry?.feasible ? "Belirgin kayip beklenmiyor." : "Net kayip dagilimi yok.";
  }

  return parts.join(", ");
}

function renderRecommendationCards(result, maxPoints, meta) {
  recommendationPanel.innerHTML = "";

  const source = result.possible ? result.recommendation : result.fallback || result.fullArmyEvaluation;
  if (!source) {
    return;
  }

  const stats = [
    ["Kullanilan puan", `${Math.round(source.avgUsedPoints)} / ${maxPoints}`],
    ["Ortalama kan kaybi", result.possible ? `${Math.round(source.avgLostBlood)}` : "Kazanis yok"],
    ["Kazanma orani", `%${Math.round(source.winRate * 100)}`],
    ["Toplam tarama", `${meta.totalCandidates} aday`]
  ];

  stats.forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(span, strong);
    recommendationPanel.appendChild(card);
  });

  const listCard = document.createElement("article");
  listCard.className = "stat-card";
  listCard.style.gridColumn = "1 / -1";

  const listTitle = document.createElement("span");
  listTitle.textContent = result.possible ? "Onerilen birlik dagilimi" : "En yakin duzen";

  const list = document.createElement("ul");
  list.className = "recommend-list";

  let shown = 0;
  ALLY_UNITS.forEach((unit) => {
    const count = source.counts[unit.key] || 0;
    if (count <= 0) {
      return;
    }
    shown += 1;
    const row = document.createElement("li");
    row.className = "recommend-row";

    const label = document.createElement("span");
    label.textContent = unit.label;
    const value = document.createElement("strong");
    value.textContent = `${count} adet`;

    row.append(label, value);
    list.appendChild(row);
  });

  if (shown === 0) {
    const row = document.createElement("li");
    row.className = "recommend-row";
    const label = document.createElement("span");
    label.textContent = "Birlik secilmedi";
    const value = document.createElement("strong");
    value.textContent = "0 adet";
    row.append(label, value);
    list.appendChild(row);
  }

  listCard.append(listTitle, list);
  recommendationPanel.appendChild(listCard);
}

function renderBattleLog(logText) {
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

  const summaryBlockLines = [
    "======================  SAVAS  SONUCU  ======================",
    ...(summaryLines.length > 0 ? summaryLines : ["  (sonuc henuz belirlenmedi)"])
  ];
  const outputLines = [
    "======================  ORNEK  SAVAS  ======================",
    ...(summaryLines.length > 0 ? summaryLines : []),
    "",
    "======================  TUR  TUR  ANALIZ  ======================",
    "  onerilen duzenin ornek savas gunlugu",
    "",
    ...detailLines
  ];
  optimizerLogOutput.innerHTML = "";
  renderStyledLines(outputLines, optimizerLogOutput);
  return {
    logText: outputLines.join("\n"),
    summaryText: summaryBlockLines.join("\n")
  };
}

function renderStyledLines(lines, target) {
  lines.forEach((line) => {
    const cssClass = classifyLine(line);
    const row = document.createElement("span");
    row.className = `log-line${cssClass ? ` ${cssClass}` : ""}`;
    row.textContent = line;
    target.appendChild(row);
  });
}

function classifyLine(line) {
  const stripped = line.trim();
  if (stripped.startsWith("---")) {
    return "sep";
  }
  if (stripped.startsWith(">>")) {
    return "win";
  }
  if (stripped.startsWith("Raund")) {
    return "round";
  }
  if (
    stripped.startsWith("Kayip Birlikler") ||
    stripped.startsWith("Toplam birlik kapasitesi") ||
    stripped.includes("OPTIMIZER  SONUCU") ||
    stripped.includes("ORNEK  SAVAS") ||
    stripped.includes("TUR  TUR  ANALIZ")
  ) {
    return "header";
  }
  if (stripped.includes("yok edildi")) {
    return "destroy";
  }
  if (stripped.startsWith("onerilen duzenin")) {
    return "subhead";
  }
  if (stripped.startsWith("-") || stripped.startsWith("=")) {
    return "event";
  }
  if (stripped.includes(" can")) {
    return isAllyLine(stripped) ? "ally" : "enemy";
  }
  return "";
}

function isAllyLine(line) {
  const allyNames = [
    "Yarasa Surusu",
    "Gulyabani",
    "Vampir Kole",
    "Banshee",
    "Olu Cagirici",
    "Gargoyle",
    "Kan Cadisi",
    "Curuk Girtlak"
  ];
  return allyNames.some((name) => line.includes(name));
}

function getModeLabel(mode, diversityMode = false) {
  const suffix = diversityMode ? " + Cesitlilik" : "";
  if (mode === "fast") {
    return `Hizli${suffix}`;
  }
  if (mode === "deep") {
    return `Derin${suffix}`;
  }
  return `Dengeli${suffix}`;
}

function getEnemySignature(stage, enemyCounts) {
  return `${stage}|${ENEMY_UNITS.map((unit) => enemyCounts[unit.key] || 0).join("|")}`;
}

function createSavedEntry(candidate) {
  const recommendation = candidate.result.recommendation;
  const enemySignature = getEnemySignature(candidate.stage, candidate.enemyCounts);
  const enemyTitle = ENEMY_UNITS.filter((unit) => (candidate.enemyCounts[unit.key] || 0) > 0)
    .map((unit) => `${candidate.enemyCounts[unit.key]} ${unit.label}`)
    .slice(0, 2)
    .join(" / ");

  return {
    savedAt: new Date().toISOString(),
    stage: candidate.stage,
    mode: candidate.mode,
    diversityMode: Boolean(candidate.diversityMode),
    modeLabel: getModeLabel(candidate.mode, candidate.diversityMode),
    enemySignature,
    enemyTitle: enemyTitle || "Versus",
    enemyCounts: candidate.enemyCounts,
    allyPool: candidate.allyPool,
    recommendationCounts: recommendation.counts,
    usedPoints: Math.round(recommendation.avgUsedPoints),
    lostBlood: Math.round(recommendation.avgLostBlood),
    winRate: Math.round(recommendation.winRate * 100)
  };
}

function createWrongReportEntry(result, stage, maxPoints, meta, summaryText, logText) {
  const source = result.possible ? result.recommendation : result.fallback || result.fullArmyEvaluation;
  const enemyCounts = collectCounts(ENEMY_UNITS);
  const allyCounts = collectCounts(ALLY_UNITS);
  return {
    source: "optimizer",
    sourceLabel: "Optimizer",
    reportedAt: new Date().toISOString(),
    stage,
    mode: meta.mode,
    diversityMode: Boolean(meta.diversityMode),
    modeLabel: getModeLabel(meta.mode, meta.diversityMode),
    enemyCounts,
    allyCounts,
    matchSignature: buildOptimizerMatchSignature(stage, enemyCounts, allyCounts),
    recommendationCounts: source?.counts || null,
    summaryText,
    logText,
    possible: result.possible,
    usedPoints: source ? Math.round(source.avgUsedPoints || 0) : 0,
    lostBlood: source && Number.isFinite(source.avgLostBlood) ? Math.round(source.avgLostBlood) : null,
    winRate: source ? Math.round((source.winRate || 0) * 100) : 0,
    pointLimit: maxPoints,
    usedCapacity: Math.round(source?.avgUsedCapacity || 0)
  };
}

function openWrongReportModal(report) {
  pendingWrongReport = report;
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
  pendingWrongReport = null;
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

function buildOptimizerMatchSignature(stage, enemyCounts, allyCounts) {
  const enemySignature = ENEMY_UNITS.map((unit) => enemyCounts[unit.key] || 0).join("|");
  const allySignature = ALLY_UNITS.map((unit) => allyCounts[unit.key] || 0).join("|");
  return `${stage}|${enemySignature}|${allySignature}`;
}

function renderMatchedActualReport() {
  matchedActualPanel.innerHTML = "";
  if (!currentWrongCandidate) {
    return;
  }

  const signature = currentWrongCandidate.matchSignature || buildOptimizerMatchSignature(
    currentWrongCandidate.stage,
    currentWrongCandidate.enemyCounts,
    currentWrongCandidate.allyCounts
  );
  const matched = wrongReports.find((item) =>
    item.source === "optimizer" &&
    Number(item.stage) === Number(currentWrongCandidate.stage) &&
    (item.matchSignature === signature || buildOptimizerMatchSignature(item.stage, item.enemyCounts || {}, item.allyCounts || {}) === signature)
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
  renderStyledLines((matched.summaryText || currentWrongCandidate.summaryText || "").split("\n"), expectedBlock);
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

function renderActualWrongSummaryPreview() {
  actualWrongSummaryPreview.innerHTML = "";
  renderStyledLines(buildActualSummaryText().split("\n"), actualWrongSummaryPreview);
}

function getSummaryUnitName(key) {
  const names = {
    bats: "Yarasa Surusu (T1)",
    ghouls: "Gulyabani (T2)",
    thralls: "Vampir Kole (T3)",
    banshees: "Banshee (T4)",
    necromancers: "Olu Cagirici (T5)",
    gargoyles: "Gargoyle (T6)",
    witches: "Kan Cadisi (T7)",
    rotmaws: "Curuk Girtlak (T8)"
  };
  return names[key] || key;
}

function renderMatchedSavedStrategy() {
  const stage = getCommittedStage();
  const enemyCounts = collectCounts(ENEMY_UNITS);
  const allyPool = collectCounts(ALLY_UNITS);
  matchedSavedPanel.innerHTML = "";

  if (!stage) {
    return;
  }

  const enemySignature = getEnemySignature(stage, enemyCounts);
  const matched = approvedStrategies.find((candidate) => candidate.enemySignature === enemySignature);
  if (!matched) {
    return;
  }

  const card = document.createElement("article");
  card.className = "saved-match-card";

  const enoughArmy = ALLY_UNITS.every((unit) => (allyPool[unit.key] || 0) >= (matched.recommendationCounts[unit.key] || 0));
  const head = document.createElement("div");
  head.className = "saved-match-head";
  head.innerHTML = `<strong>Onaylanmis Cozum Bulundu</strong><span>${matched.modeLabel} / ${formatDate(matched.savedAt)}</span>`;

  const body = document.createElement("div");
  body.className = "saved-match-meta";
  body.innerHTML = `
    <span>Kazanma orani: <strong>%${matched.winRate}</strong></span>
    <span>Kan kaybi: <strong>${matched.lostBlood}</strong></span>
    <span>Puan: <strong>${matched.usedPoints}</strong></span>
    <span>Durum: <strong>${enoughArmy ? "Uygulanabilir" : "Eksik birlik var"}</strong></span>
  `;

  const list = document.createElement("ul");
  list.className = "recommend-list";
  Object.entries(matched.recommendationCounts)
    .filter(([, value]) => value > 0)
    .forEach(([key, value]) => {
      const row = document.createElement("li");
      row.className = "recommend-row";
      const owned = allyPool[key] || 0;
      row.innerHTML = `<span>${key}</span><strong>${value} / sende ${owned}</strong>`;
      list.appendChild(row);
    });

  if (!list.children.length) {
    const row = document.createElement("li");
    row.className = "recommend-row";
    row.innerHTML = "<span>Kayitli dizilim bos</span><strong>0</strong>";
    list.appendChild(row);
  }

  card.append(head, body, list);
  matchedSavedPanel.appendChild(card);
}

function restoreFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const savedId = params.get("saved");
  if (!savedId) {
    return;
  }

  const item = approvedStrategies.find((candidate) => candidate.id === savedId);
  if (!item) {
    return;
  }

  stageInput.value = String(item.stage);
  ENEMY_UNITS.forEach((unit) => {
    optimizerInputs[unit.key].value = String(item.enemyCounts[unit.key] || 0);
  });
  ALLY_UNITS.forEach((unit) => {
    optimizerInputs[unit.key].value = String(item.allyPool?.[unit.key] || item.recommendationCounts[unit.key] || 0);
  });
  optimizerMode = item.mode || "balanced";
  optimizerDiversityMode = Boolean(item.diversityMode);
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === optimizerMode));
  syncDiversityModeButton();
}

function applyStageFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const stage = params.get("stage");
  if (stage && /^\d+$/.test(stage)) {
    stageInput.value = stage;
  }
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
