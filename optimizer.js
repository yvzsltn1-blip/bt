"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  parseCount,
  calculateArmyPoints,
  POINTS_BY_ALLY_KEY,
  BLOOD_BY_ALLY_KEY,
  getStagePointLimit,
  optimizeArmyUsage,
  getStoneAdjustedLossProfile,
  simulateBattle
} = window.BattleCore;

const optimizerVariant = document.body.dataset.optimizerVariant === "minimum" ? "minimum" : "standard";
const optimizerInputs = {};
const optimizerMinimumInputs = {};
const actualLossInputs = {};
const optimizerEnemyInputs = document.querySelector("#optimizerEnemyInputs");
const optimizerAllyInputs = document.querySelector("#optimizerAllyInputs");
const optimizerConstraintInfo = document.querySelector("#optimizerConstraintInfo");
const optimizerSearchBandPresetInput = document.querySelector("#optimizerSearchBandPreset");
const optimizerSearchBandPresetMobileInput = document.querySelector("#optimizerSearchBandPresetMobile");
const optimizerCustomBandInputs = document.querySelector("#optimizerCustomBandInputs");
const optimizerCustomBandMinInput = document.querySelector("#optimizerCustomBandMin");
const optimizerCustomBandMaxInput = document.querySelector("#optimizerCustomBandMax");
const optimizerSummary = document.querySelector("#optimizerSummary");
const recommendationPanel = document.querySelector("#recommendationPanel");
const rosterClipboardIndicator = null;
const optimizerLogPanel = document.querySelector("#optimizerLogPanel");
const optimizerLogOutput = document.querySelector("#optimizerLogOutput");
const optimizerLogFullscreenBtn = document.querySelector("#optimizerLogFullscreenBtn");
const optimizerStatus = document.querySelector("#optimizerStatus");
const optimizeBtn = document.querySelector("#optimizeBtn");
const diversityModeBtn = document.querySelector("#diversityModeBtn");
const batchRunButtons = [...document.querySelectorAll("[data-batch-runs]")];
const stopOptimizerBtn = document.querySelector("#stopOptimizerBtn");
const optimizerSampleBtn = document.querySelector("#optimizerSampleBtn");
const optimizerClearBtn = document.querySelector("#optimizerClearBtn");
const saveApprovedBtn = document.querySelector("#saveApprovedBtn");
const topResultsBtn = document.querySelector("#topResultsBtn");
const openReliabilityFromOptimizerBtn = document.querySelector("#openReliabilityFromOptimizerBtn");
const openSimulationFromOptimizerBtn = document.querySelector("#openSimulationFromOptimizerBtn");
const favoriteStrategyBtn = document.querySelector("#favoriteStrategyBtn");
const reportWrongOptimizerBtn = document.querySelector("#reportWrongOptimizerBtn");
const langToggleOptimizerBtn = document.querySelector("#langToggleOptimizerBtn");
const stageInput = document.querySelector("#stageInput");
const simulatedStageDisplay = document.querySelector("#simulatedStageDisplay");
const stageAutoAdvanceToggleBtn = document.querySelector("#stageAutoAdvanceToggleBtn");
const optimizerPointsValue = document.querySelector("#optimizerPointsValue");
const optimizerPointsLimit = document.querySelector("#optimizerPointsLimit");
const modeButtons = [...document.querySelectorAll(".mode-button")];
const objectiveButtons = [...document.querySelectorAll(".objective-button")];
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
const wrongReportErrorBox = document.querySelector("#wrongReportErrorBox");
const wrongLossInputs = document.querySelector("#wrongLossInputs");
const matchedActualPanel = document.querySelector("#matchedActualPanel");
const topResultsModal = document.querySelector("#topResultsModal");
const closeTopResultsBtn = document.querySelector("#closeTopResultsBtn");
const topResultsMeta = document.querySelector("#topResultsMeta");
const topResultsList = document.querySelector("#topResultsList");
const favoriteStrategiesModal = document.querySelector("#favoriteStrategiesModal");
const closeFavoriteStrategiesBtn = document.querySelector("#closeFavoriteStrategiesBtn");
const favoriteStrategiesMeta = document.querySelector("#favoriteStrategiesMeta");
const favoriteStrategiesCurrentAction = document.querySelector("#favoriteStrategiesCurrentAction");
const favoriteStrategiesList = document.querySelector("#favoriteStrategiesList");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminLoginBtn = document.querySelector("#adminLoginBtn");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");
const ROSTER_CLIPBOARD_STORAGE_KEY = "bt-analiz.optimizer.rosterClipboard.v1";
const ROSTER_CLIPBOARD_TTL_MS = 60 * 1000;
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";
const OPTIMIZER_RELIABILITY_STORAGE_KEY = "bt-analiz.optimizer-reliability.v1";
const FAVORITE_STRATEGIES_STORAGE_KEY = "bt-analiz.optimizer.favorite-strategies.v1";
const AUTO_STAGE_ADVANCE_STORAGE_KEY = "bt-analiz.optimizer.autoStageAdvance.v1";
const TOP_RESULTS_BENCHMARK_SAMPLE_COUNT = 240;

let optimizerSearchSession = createEmptySearchSession();
let optimizerMode = "balanced";
let optimizerObjective = "min_loss";
let optimizerDiversityMode = false;
let optimizerStoneMode = false;
let optimizerComparisonCache = new Map();
let comparePanelOpen = false;
let currentApprovedCandidate = null;
let currentWrongCandidate = null;
let currentTopResultsContext = null;
let currentTopResultsSort = "default";
let pendingWrongReport = null;
let approvedStrategies = [];
let wrongReports = [];
let favoriteStrategies = [];
let activeApprovedStrategyId = "";
let activeWrongReportSignature = "";
let activeFavoriteStrategySignature = "";
let approvedStrategyRequestId = 0;
let wrongReportRequestId = 0;
let favoriteStrategyRequestId = 0;
let optimizerStopRequested = false;
let isAdminSession = false;
let optimizerLogFullscreenFallback = false;
let rosterClipboardCache = null;
let rosterClipboardExpiresAt = 0;
let rosterClipboardExpiryTimer = null;
let rosterClipboardIndicatorTimer = null;
let optimizerIncumbentContext = null;
let currentFavoriteModalSignature = null;
let currentFavoriteModalPendingEntry = null;
let autoStageAdvanceEnabled = false;

function isMinimumOptimizerVariant() {
  return optimizerVariant === "minimum";
}

function normalizeSearchBandMode(mode) {
  if (mode === "full" || mode === "custom") {
    return mode;
  }
  return "tight75";
}

function clampBandPercent(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, parsed));
}

function getSearchBandLabel(mode) {
  if (mode === "full") {
    return "Tum uzay";
  }
  if (mode === "custom") {
    return "Ozel bant";
  }
  return "%75-%100";
}

function normalizeSearchBandSettings(settings = {}) {
  const mode = normalizeSearchBandMode(settings.mode);
  if (mode === "full") {
    return {
      mode,
      minPercent: 0,
      maxPercent: 100
    };
  }
  if (mode === "tight75") {
    return {
      mode,
      minPercent: 75,
      maxPercent: 100
    };
  }
  return {
    mode,
    minPercent: clampBandPercent(settings.minPercent, 75),
    maxPercent: clampBandPercent(settings.maxPercent, 100)
  };
}

function areSearchBandSettingsEqual(left, right) {
  const normalizedLeft = normalizeSearchBandSettings(left);
  const normalizedRight = normalizeSearchBandSettings(right);
  return normalizedLeft.mode === normalizedRight.mode &&
    normalizedLeft.minPercent === normalizedRight.minPercent &&
    normalizedLeft.maxPercent === normalizedRight.maxPercent;
}

function normalizeOptimizerObjective(objective) {
  if (objective === "min_army" || objective === "safe_win") {
    return objective;
  }
  return "min_loss";
}

function isSafeWinObjective(objective) {
  return normalizeOptimizerObjective(objective) === "safe_win";
}

function getOptimizerObjectiveStatusText(objective) {
  const normalizedObjective = normalizeOptimizerObjective(objective);
  if (normalizedObjective === "min_army") {
    return "Hedef: en az orduyla kazan";
  }
  if (normalizedObjective === "safe_win") {
    return "Hedef: daha guvenli kazan";
  }
  return "Hedef: en az kayipla kazan";
}

function getOptimizerMinWinRate(objective) {
  return isSafeWinObjective(objective) ? 0.9 : 0.75;
}

function getObjectiveAdjustedRunConfig(runConfig, objective) {
  if (!isSafeWinObjective(objective)) {
    return runConfig;
  }

  const boostedTrialCount = Math.max(runConfig.trialCount || 0, 14);
  const boostedFullArmyTrials = Math.max(runConfig.fullArmyTrials || 0, 18);
  return {
    ...runConfig,
    trialCount: boostedTrialCount,
    fullArmyTrials: boostedFullArmyTrials,
    eliteCount: Math.max(runConfig.eliteCount || 0, 6),
    stabilityTrials: Math.max(
      runConfig.stabilityTrials || 0,
      boostedFullArmyTrials,
      boostedTrialCount * 4
    ),
    exploratoryCandidateCount: Math.max(runConfig.exploratoryCandidateCount || 0, 16),
    diversityCandidateCount: Math.max(runConfig.diversityCandidateCount || 0, 24)
  };
}

function showCopyableError(title, message) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "1000";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";
  overlay.style.padding = "18px";
  overlay.style.background = "rgba(6, 10, 14, 0.82)";

  const card = document.createElement("div");
  card.style.width = "min(920px, 100%)";
  card.style.maxHeight = "calc(100vh - 36px)";
  card.style.overflow = "auto";
  card.style.padding = "18px";
  card.style.border = "1px solid rgba(160, 185, 214, 0.14)";
  card.style.borderRadius = "24px";
  card.style.background = "rgba(10, 15, 22, 0.98)";
  card.style.boxShadow = "0 24px 80px rgba(0, 0, 0, 0.45)";

  const header = document.createElement("div");
  header.className = "panel-head";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "button button-ghost";
  closeBtn.type = "button";
  closeBtn.textContent = "Kapat";
  header.append(heading, closeBtn);

  const copyBtn = document.createElement("button");
  copyBtn.className = "button button-secondary";
  copyBtn.type = "button";
  copyBtn.textContent = "Kopyala";

  const text = document.createElement("textarea");
  text.className = "terminal-block";
  text.readOnly = true;
  text.value = message;
  text.style.width = "100%";
  text.style.minHeight = "320px";
  text.style.resize = "vertical";
  text.style.whiteSpace = "pre";

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(copyBtn);

  function close() {
    overlay.remove();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(message);
      copyBtn.textContent = "Kopyalandi";
    } catch {
      text.focus();
      text.select();
      copyBtn.textContent = "Secildi";
    }
  });

  card.append(header, actions, text);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  text.focus();
  text.select();
}

function showInfoMessage(title, message) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "1000";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";
  overlay.style.padding = "18px";
  overlay.style.background = "rgba(6, 10, 14, 0.72)";

  const card = document.createElement("div");
  card.style.width = "min(560px, 100%)";
  card.style.padding = "18px";
  card.style.border = "1px solid rgba(160, 185, 214, 0.14)";
  card.style.borderRadius = "24px";
  card.style.background = "rgba(10, 15, 22, 0.98)";
  card.style.boxShadow = "0 24px 80px rgba(0, 0, 0, 0.45)";

  const header = document.createElement("div");
  header.className = "panel-head";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "button button-ghost";
  closeBtn.type = "button";
  closeBtn.textContent = "Kapat";
  header.append(heading, closeBtn);

  const body = document.createElement("div");
  body.className = "terminal-block";
  body.textContent = message;

  function close() {
    overlay.remove();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  card.append(header, body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function setOptimizeButtonLabel(text) {
  optimizeBtn.textContent = text;
}

function openSimulationForCounts(enemyCounts, allyCounts) {
  try {
    window.sessionStorage.setItem(OPTIMIZER_SIMULATION_STORAGE_KEY, JSON.stringify({
      enemyCounts,
      allyCounts
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

function createOpenSimulationButton(enemyCounts, allyCounts, label = "Simule Et") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary";
  button.textContent = label;
  button.addEventListener("click", () => {
    openSimulationForCounts(enemyCounts, allyCounts);
  });
  return button;
}

function openReliabilityForCounts(enemyCounts, allyCounts, context = {}) {
  try {
    window.sessionStorage.setItem(OPTIMIZER_RELIABILITY_STORAGE_KEY, JSON.stringify({
      enemyCounts,
      allyCounts,
      stage: context.stage || null,
      mode: context.mode || "balanced",
      objective: context.objective || "min_loss",
      diversityMode: Boolean(context.diversityMode),
      stoneMode: Boolean(context.stoneMode),
      optimizerWinRate: Number.isFinite(context.optimizerWinRate) ? context.optimizerWinRate : null,
      optimizerDisplayedLoss: Number.isFinite(context.optimizerDisplayedLoss) ? context.optimizerDisplayedLoss : null,
      optimizerAvgLostBlood: Number.isFinite(context.optimizerAvgLostBlood) ? context.optimizerAvgLostBlood : null,
      optimizerExpectedLostBlood: Number.isFinite(context.optimizerExpectedLostBlood) ? context.optimizerExpectedLostBlood : null
    }));
    const opened = window.open("reliability.html", "_blank");
    if (!opened) {
      window.alert("Guvenilirlik sayfasi yeni sekmede acilamadi. Lutfen popup engelleyiciyi kontrol edin.");
      return;
    }
    opened.focus?.();
  } catch (error) {
    window.alert(`Guvenilirlik sayfasi acilamadi: ${error.message}`);
  }
}

function openReliabilityForCurrentCandidate() {
  if (!currentApprovedCandidate) {
    return;
  }
  const source = getPrimaryOptimizerSource(currentApprovedCandidate.result);
  if (!source?.counts) {
    return;
  }
  openReliabilityForCounts(currentApprovedCandidate.enemyCounts, source.counts, {
    stage: currentApprovedCandidate.stage,
    mode: currentApprovedCandidate.mode,
    objective: currentApprovedCandidate.objective,
    diversityMode: currentApprovedCandidate.diversityMode,
    stoneMode: currentApprovedCandidate.stoneMode,
    optimizerWinRate: source.winRate,
    optimizerDisplayedLoss: getDisplayedLossValue(source),
    optimizerAvgLostBlood: source.avgLostBlood,
    optimizerExpectedLostBlood: source.expectedLostBlood
  });
}

if (openReliabilityFromOptimizerBtn) {
  openReliabilityFromOptimizerBtn.addEventListener("click", () => {
    openReliabilityForCurrentCandidate();
  });
}

if (openSimulationFromOptimizerBtn) {
  openSimulationFromOptimizerBtn.addEventListener("click", () => {
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

function syncOptimizeButtonCompletionState(hasCompleted) {
  optimizeBtn.classList.toggle("is-success", hasCompleted);
  optimizeBtn.setAttribute("aria-pressed", hasCompleted ? "true" : "false");
  optimizeBtn.title = hasCompleted ? "Mevcut sonuc simule edildi. Tekrar simule edebilirsin." : "";
}

function syncAdminRestrictedActions() {
  const isBusy = optimizeBtn.disabled;
  saveApprovedBtn.disabled = isBusy || !isAdminSession || !currentApprovedCandidate || !currentApprovedCandidate.result.possible;
  saveApprovedBtn.title = isAdminSession ? "" : "Onayli cozum kaydetmek icin admin girisi gerekli.";
  if (openReliabilityFromOptimizerBtn) {
    openReliabilityFromOptimizerBtn.disabled = isBusy || !currentApprovedCandidate || !getPrimaryOptimizerSource(currentApprovedCandidate.result)?.counts;
  }
  if (openSimulationFromOptimizerBtn) {
    openSimulationFromOptimizerBtn.disabled = isBusy || !currentApprovedCandidate || !getPrimaryOptimizerSource(currentApprovedCandidate.result)?.counts;
  }
  syncFavoriteStrategyButtonUi();
}

function createUnitInputStack(title, input, modifierClass = "") {
  const wrapper = document.createElement("div");
  wrapper.className = `unit-input-stack${modifierClass ? ` ${modifierClass}` : ""}`;

  const caption = document.createElement("span");
  caption.textContent = title;

  wrapper.append(caption, input);
  return wrapper;
}

async function bindAdminAuth() {
  if (!window.AdminAuthUI || typeof window.AdminAuthUI.bindAdminControls !== "function") {
    return;
  }

  await window.AdminAuthUI.bindAdminControls({
    statusLabel: adminAuthStatus,
    emailInput: adminEmailInput,
    passwordInput: adminPasswordInput,
    loginButton: adminLoginBtn,
    logoutButton: adminLogoutBtn,
    onStateChange: (isAdmin) => {
      isAdminSession = isAdmin;
      syncAdminRestrictedActions();
      renderFavoriteButtonState();
      if (!favoriteStrategiesModal?.hidden) {
        renderFavoriteStrategiesModal();
      }
    }
  });
}

saveApprovedBtn.disabled = true;
topResultsBtn.disabled = true;
if (favoriteStrategyBtn) {
  favoriteStrategyBtn.disabled = true;
}
if (openReliabilityFromOptimizerBtn) {
  openReliabilityFromOptimizerBtn.disabled = true;
}
if (openSimulationFromOptimizerBtn) {
  openSimulationFromOptimizerBtn.disabled = true;
}
reportWrongOptimizerBtn.disabled = true;
buildWrongLossInputs();

buildInputs(optimizerEnemyInputs, ENEMY_UNITS, "enemy");
buildInputs(optimizerAllyInputs, ALLY_UNITS, "ally");
wireSequentialInputOrder([
  optimizerSearchBandPresetInput,
  optimizerCustomBandMinInput,
  optimizerCustomBandMaxInput,
  ...ENEMY_UNITS.map((unit) => optimizerInputs[unit.key]),
  ...ALLY_UNITS.flatMap((unit) => {
    const inputs = [optimizerInputs[unit.key]];
    if (optimizerMinimumInputs[unit.key]) {
      inputs.push(optimizerMinimumInputs[unit.key]);
    }
    return inputs;
  })
]);
resetValues();
loadAutoStageAdvanceSetting();
syncAutoStageAdvanceToggle();
renderPointSummary();
applyStageFromQuery();
void initializeFavoriteStrategies();
void initializeApprovedStrategies();
void initializeWrongReports();
void bindAdminAuth();
syncDiversityModeButton();
syncObjectiveButtons();
syncSearchBandControls();
syncComparePanelToggle();
renderComparisonPanel();
optimizerStatus.textContent = getOptimizerObjectiveStatusText(optimizerObjective);

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    optimizerMode = button.dataset.mode || "balanced";
    modeButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    invalidateSearchSession();
  });
});

objectiveButtons.forEach((button) => {
  button.addEventListener("click", () => {
    optimizerObjective = normalizeOptimizerObjective(button.dataset.objective);
    syncObjectiveButtons();
    invalidateSearchSession();
    optimizerStatus.textContent = getOptimizerObjectiveStatusText(optimizerObjective);
  });
});

if (optimizerSearchBandPresetInput) {
  optimizerSearchBandPresetInput.addEventListener("change", () => {
    if (optimizerSearchBandPresetMobileInput && optimizerSearchBandPresetMobileInput.value !== optimizerSearchBandPresetInput.value) {
      optimizerSearchBandPresetMobileInput.value = optimizerSearchBandPresetInput.value;
    }
    syncSearchBandControls();
    invalidateSearchSession();
    renderPointSummary();
  });
}

if (optimizerSearchBandPresetMobileInput) {
  optimizerSearchBandPresetMobileInput.addEventListener("change", () => {
    if (optimizerSearchBandPresetInput && optimizerSearchBandPresetInput.value !== optimizerSearchBandPresetMobileInput.value) {
      optimizerSearchBandPresetInput.value = optimizerSearchBandPresetMobileInput.value;
    }
    syncSearchBandControls();
    invalidateSearchSession();
    renderPointSummary();
  });
}

[optimizerCustomBandMinInput, optimizerCustomBandMaxInput].forEach((input) => {
  if (!input) {
    return;
  }
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D+/g, "");
    invalidateSearchSession();
    renderPointSummary();
  });
  input.addEventListener("blur", () => {
    if (input.value.trim() === "") {
      input.value = input === optimizerCustomBandMinInput ? "75" : "100";
    }
    const clamped = clampBandPercent(input.value, input === optimizerCustomBandMinInput ? 75 : 100);
    input.value = String(clamped);
    renderPointSummary();
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

if (stageAutoAdvanceToggleBtn) {
  stageAutoAdvanceToggleBtn.addEventListener("click", () => {
    autoStageAdvanceEnabled = !autoStageAdvanceEnabled;
    persistAutoStageAdvanceSetting();
    syncAutoStageAdvanceToggle();
    optimizerStatus.textContent = autoStageAdvanceEnabled ? "Kademe +1 acildi" : "Kademe +1 kapatildi";
  });
}

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
  currentWrongCandidate = null;
  reportWrongOptimizerBtn.disabled = true;
  closeFavoriteStrategiesModal();
  renderFavoriteButtonState();
});

saveApprovedBtn.addEventListener("click", async () => {
  if (!isAdminSession) {
    window.alert("Bu islem icin admin girisi gerekli.");
    return;
  }
  if (!currentApprovedCandidate || !currentApprovedCandidate.result.possible) {
    window.alert("Kaydedilecek onayli bir cozum yok.");
    return;
  }

  const item = createSavedEntry(currentApprovedCandidate);
  try {
    saveApprovedBtn.disabled = true;
    const savedItem = await window.BTFirebase.saveApprovedStrategy(item);
    approvedStrategies = savedItem ? [savedItem] : [item];
    activeApprovedStrategyId = savedItem?.id || getCurrentApprovedStrategyDocId() || "";
    renderMatchedSavedStrategy();
    window.alert("Cozum onaylanip ortak kayitlara eklendi.");
  } catch (error) {
    window.alert(`Kayit sirasinda hata olustu: ${error.message}`);
  } finally {
    syncAdminRestrictedActions();
  }
});

topResultsBtn.addEventListener("click", () => {
  if (!currentTopResultsContext || !currentTopResultsContext.candidates.length) {
    window.alert("Gosterilecek alternatif sonuc yok.");
    return;
  }
  openTopResultsModal();
});

if (favoriteStrategyBtn) {
  favoriteStrategyBtn.addEventListener("click", () => {
    const context = getFavoriteEnemyContext();
    if (!context) {
      window.alert("Once kademe ve rakip dizilimini gir.");
      return;
    }

    const modalSignature = context.enemyRosterSignature || context.enemySignature;
    const existingFavorites = getFavoriteStrategiesForEnemySignature(modalSignature);
    const currentMatch = findMatchingFavoriteForCurrentRecommendation();
    const currentEntry = createFavoriteEntryFromCurrentRecommendation();

    if (existingFavorites.length > 0 || currentMatch) {
      openFavoriteStrategiesModal(modalSignature);
      return;
    }

    if (!currentEntry || currentEntry.enemyRosterSignature !== modalSignature) {
      window.alert("Favoriye eklemek icin once bu rakibe karsi bir sonuc uret.");
      return;
    }

    if (!isAdminSession) {
      window.alert("Fav kaydetmek icin admin girisi gerekli.");
      return;
    }

    void saveFavoriteStrategy(currentEntry)
      .then((saved) => {
        renderFavoriteButtonState();
        showInfoMessage("Fav Kaydedildi", `Dizilim favlandi. Artik ${saved.enemyTitle || "bu rakip"} icin favorilerde gorunecek.`);
      })
      .catch((error) => {
        showCopyableError("Fav Kaydedilemedi", `Fav kaydedilemedi:\n\n${error.message}`);
      });
  });
}

reportWrongOptimizerBtn.addEventListener("click", () => {
  if (!currentWrongCandidate) {
    window.alert("Raporlanacak bir sonuc yok.");
    return;
  }
  openWrongReportModal(currentWrongCandidate);
});

function getNativeFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

function isOptimizerLogFullscreen() {
  return getNativeFullscreenElement() === optimizerLogPanel || optimizerLogFullscreenFallback;
}

function syncOptimizerLogFullscreenUi() {
  if (!optimizerLogPanel || !optimizerLogFullscreenBtn) {
    return;
  }

  const isFullscreen = isOptimizerLogFullscreen();
  const fullscreenLabel = optimizerLogFullscreenBtn.querySelector(".button-label");
  optimizerLogPanel.classList.toggle("is-fullscreen", isFullscreen);
  document.body.classList.toggle("optimizer-log-fullscreen", isFullscreen);
  if (fullscreenLabel) {
    fullscreenLabel.textContent = isFullscreen ? "Kapat" : "Tam Ekran";
  }
  optimizerLogFullscreenBtn.setAttribute("aria-pressed", String(isFullscreen));
  optimizerLogFullscreenBtn.setAttribute("aria-label", isFullscreen ? "Gunlugu eski boyuta getir" : "Gunlugu tam ekran ac");
  optimizerLogFullscreenBtn.title = isFullscreen ? "Gunlugu eski boyuta getir" : "Gunlugu tam ekran ac";
}

async function requestOptimizerLogFullscreen() {
  if (!optimizerLogPanel) {
    return;
  }

  const requestFullscreen =
    optimizerLogPanel.requestFullscreen ||
    optimizerLogPanel.webkitRequestFullscreen ||
    optimizerLogPanel.msRequestFullscreen;

  if (typeof requestFullscreen === "function") {
    try {
      await requestFullscreen.call(optimizerLogPanel);
      optimizerLogFullscreenFallback = false;
      syncOptimizerLogFullscreenUi();
      return;
    } catch (error) {
      optimizerLogFullscreenFallback = true;
      syncOptimizerLogFullscreenUi();
      return;
    }
  }

  optimizerLogFullscreenFallback = true;
  syncOptimizerLogFullscreenUi();
}

async function exitOptimizerLogFullscreen() {
  const nativeFullscreenElement = getNativeFullscreenElement();

  if (nativeFullscreenElement === optimizerLogPanel) {
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

  optimizerLogFullscreenFallback = false;
  syncOptimizerLogFullscreenUi();
}

if (optimizerLogFullscreenBtn) {
  optimizerLogFullscreenBtn.addEventListener("click", () => {
    if (isOptimizerLogFullscreen()) {
      void exitOptimizerLogFullscreen();
      return;
    }
    void requestOptimizerLogFullscreen();
  });
}

document.addEventListener("fullscreenchange", () => {
  if (getNativeFullscreenElement() !== optimizerLogPanel) {
    optimizerLogFullscreenFallback = false;
  }
  syncOptimizerLogFullscreenUi();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if (!optimizerLogFullscreenFallback || getNativeFullscreenElement() === optimizerLogPanel) {
    return;
  }
  void exitOptimizerLogFullscreen();
});

closeWrongReportBtn.addEventListener("click", closeWrongReportModal);
cancelWrongReportBtn.addEventListener("click", closeWrongReportModal);

submitWrongReportBtn.addEventListener("click", async () => {
  if (!pendingWrongReport) {
    return;
  }

  const report = {
    ...pendingWrongReport,
    ...buildActualOutcomePayload(),
    actualSummaryText: buildActualSummaryText(),
    actualNote: actualNoteInput.value.trim()
  };

  try {
    submitWrongReportBtn.disabled = true;
    const savedReport = await window.BTFirebase.saveWrongReport(report);
    wrongReports = savedReport
      ? [savedReport, ...wrongReports.filter((item) => item.id !== savedReport.id)]
      : wrongReports;
    activeWrongReportSignature = getCurrentWrongReportSignature();
    renderMatchedActualReport();
    clearWrongReportError();
    closeWrongReportModal();
    window.alert("Optimizer icin gercek sonuc kaydedildi.");
  } catch (error) {
    showWrongReportError(error);
    window.alert("Yanlis raporu kaydedilemedi. Ayrintili neden pencerenin icinde gosterildi.");
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

if (closeFavoriteStrategiesBtn) {
  closeFavoriteStrategiesBtn.addEventListener("click", closeFavoriteStrategiesModal);
}

if (favoriteStrategiesModal) {
  favoriteStrategiesModal.addEventListener("click", (event) => {
    if (event.target === favoriteStrategiesModal) {
      closeFavoriteStrategiesModal();
    }
  });
}

async function initializeApprovedStrategies() {
  restoreFromQuery();
  renderPointSummary();
  renderMatchedSavedStrategy();
  renderFavoriteButtonState();
}

async function initializeWrongReports() {
  renderMatchedActualReport();
}

async function runOptimizerSearch(batchRuns) {
  try {
    const enemy = collectCounts(ENEMY_UNITS);
    const allyPool = collectCounts(ALLY_UNITS);
    const minimumRequiredCounts = collectMinimumRequiredCounts();
    const searchBandSettings = collectSearchBandSettings();
    const stage = getCommittedStage();
    if (!stage) {
      throw new Error("Lutfen gecerli bir kademe gir ve Enter ile onayla.");
    }

    const maxPoints = getStagePointLimit(stage);
    const searchBandRange = getSearchBandPointRange(maxPoints, searchBandSettings);
    validateMinimumRequiredCounts(allyPool, minimumRequiredCounts, maxPoints);
    const totalCombinationCount = calculateTotalCombinationCount(
      allyPool,
      maxPoints,
      minimumRequiredCounts,
      0,
      maxPoints
    );
    const bandCombinationCount = calculateTotalCombinationCount(
      allyPool,
      maxPoints,
      minimumRequiredCounts,
      searchBandRange.minUsedPoints,
      searchBandRange.maxUsedPoints
    );
    const incumbentSeedCandidates = getIncumbentSeedCandidates({
      stage,
      enemyCounts: enemy,
      allyPool,
      minimumRequiredCounts,
      searchBandSettings,
      mode: optimizerMode,
      objective: optimizerObjective,
      diversityMode: optimizerDiversityMode,
      stoneMode: optimizerStoneMode
    });
    const searchKey = createSearchKey(
      stage,
      enemy,
      allyPool,
      minimumRequiredCounts,
      searchBandSettings,
      optimizerMode,
      optimizerObjective,
      optimizerDiversityMode,
      optimizerStoneMode
    );
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
    syncOptimizeButtonCompletionState(false);
    setOptimizerBusy(true);

    for (let step = 1; step <= batchRuns; step += 1) {
      if (optimizerStopRequested) {
        break;
      }
      runIndex += 1;
      lastRunConfig = getObjectiveAdjustedRunConfig(
        getRunConfig(stage, runIndex, optimizerMode, optimizerDiversityMode),
        optimizerObjective
      );
      optimizerStatus.textContent = batchRuns === 1 ? "Hesapliyor" : `${batchRuns} tur araniyor (${step}/${batchRuns})`;
      setOptimizeButtonLabel(batchRuns === 1 ? "Simule Ediliyor" : `${batchRuns} Tur (${step}/${batchRuns})`);
      await waitForNextFrame();

      lastResult = optimizeArmyUsage(allyPool, enemy, {
        maxPoints,
        minimumUsedPoints: searchBandRange.minUsedPoints,
        maximumUsedPoints: searchBandRange.maxUsedPoints,
        minimumRequiredCounts,
        minWinRate: getOptimizerMinWinRate(optimizerObjective),
        trialCount: lastRunConfig.trialCount,
        fullArmyTrials: lastRunConfig.fullArmyTrials,
        beamWidth: lastRunConfig.beamWidth,
        maxIterations: lastRunConfig.maxIterations,
        eliteCount: lastRunConfig.eliteCount,
        stabilityTrials: lastRunConfig.stabilityTrials,
        baseSeed: lastRunConfig.baseSeed,
        objective: normalizeOptimizerObjective(optimizerObjective),
        stoneMode: optimizerStoneMode,
        diversityMode: optimizerDiversityMode,
        exploratoryCandidateCount: lastRunConfig.exploratoryCandidateCount,
        exhaustiveCandidateLimit: lastRunConfig.exhaustiveCandidateLimit,
        diversityCandidateCount: lastRunConfig.diversityCandidateCount,
        knownSignatures: [...uniqueSignatures],
        seedCandidates: continuing ? [] : incumbentSeedCandidates
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
    optimizerIncumbentContext = {
      stage,
      enemyCounts: { ...enemy },
      allyPool: { ...allyPool },
      minimumRequiredCounts: { ...minimumRequiredCounts },
      searchBandSettings: { ...searchBandSettings },
      mode: optimizerMode,
      objective: optimizerObjective,
      diversityMode: optimizerDiversityMode,
      stoneMode: optimizerStoneMode,
      topCandidates: mergeOptimizerCandidates([getPrimaryOptimizerSource(bestResult)], topCandidates, { limit: 24 })
        .map((entry) => ({ counts: { ...(entry?.counts || {}) } }))
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
      searchBandSettings,
      mode: optimizerMode,
      objective: optimizerObjective,
      diversityMode: optimizerDiversityMode,
      stoneMode: optimizerStoneMode,
      totalCombinationCount,
      bandCombinationCount,
      batchRuns: completedRuns,
      batchSimulationRuns
    });
    syncStageAfterSimulation(stage);

    setOptimizeButtonLabel("Tekrar Simule Et");
    syncOptimizeButtonCompletionState(true);
    optimizerStatus.textContent = optimizerStopRequested ? "Durduruldu" : "Tamamlandi";
  } catch (error) {
    setOptimizeButtonLabel("Tekrar Simule Et");
    syncOptimizeButtonCompletionState(false);
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

function isSupersetAllyPool(currentPool, previousPool) {
  return ALLY_UNITS.every((unit) => (currentPool?.[unit.key] || 0) >= (previousPool?.[unit.key] || 0));
}

function areMinimumRequiredCountsEqual(left, right) {
  return ALLY_UNITS.every((unit) => (left?.[unit.key] || 0) === (right?.[unit.key] || 0));
}

function isCandidateWithinPool(candidateCounts, allyPool) {
  return ALLY_UNITS.every((unit) => (candidateCounts?.[unit.key] || 0) <= (allyPool?.[unit.key] || 0));
}

function areEnemyCountsEqual(left, right) {
  return ENEMY_UNITS.every((unit) => (left?.[unit.key] || 0) === (right?.[unit.key] || 0));
}

function getIncumbentSeedCandidates(context) {
  if (!optimizerIncumbentContext) {
    return [];
  }

  const matchesScenario =
    optimizerIncumbentContext.stage === context.stage &&
    optimizerIncumbentContext.mode === context.mode &&
    optimizerIncumbentContext.objective === context.objective &&
    optimizerIncumbentContext.diversityMode === context.diversityMode &&
    optimizerIncumbentContext.stoneMode === context.stoneMode &&
    areSearchBandSettingsEqual(optimizerIncumbentContext.searchBandSettings, context.searchBandSettings) &&
    areMinimumRequiredCountsEqual(optimizerIncumbentContext.minimumRequiredCounts, context.minimumRequiredCounts) &&
    areEnemyCountsEqual(optimizerIncumbentContext.enemyCounts, context.enemyCounts) &&
    isSupersetAllyPool(context.allyPool, optimizerIncumbentContext.allyPool);

  if (!matchesScenario) {
    return [];
  }

  return (optimizerIncumbentContext.topCandidates || [])
    .map((entry) => entry?.counts || null)
    .filter((counts) => counts && isCandidateWithinPool(counts, context.allyPool));
}

function setOptimizerBusy(isBusy) {
  optimizeBtn.disabled = isBusy;
  stopOptimizerBtn.disabled = !isBusy;
  optimizerSampleBtn.disabled = isBusy;
  optimizerClearBtn.disabled = isBusy;
  diversityModeBtn.disabled = isBusy;
  stageInput.disabled = isBusy;
  if (stageAutoAdvanceToggleBtn) {
    stageAutoAdvanceToggleBtn.disabled = isBusy;
  }
  if (optimizerSearchBandPresetInput) {
    optimizerSearchBandPresetInput.disabled = isBusy;
  }
  if (optimizerSearchBandPresetMobileInput) {
    optimizerSearchBandPresetMobileInput.disabled = isBusy;
  }
  if (optimizerCustomBandMinInput) {
    optimizerCustomBandMinInput.disabled = isBusy || optimizerCustomBandInputs?.hidden;
  }
  if (optimizerCustomBandMaxInput) {
    optimizerCustomBandMaxInput.disabled = isBusy || optimizerCustomBandInputs?.hidden;
  }
  syncAdminRestrictedActions();
  topResultsBtn.disabled = isBusy || !currentTopResultsContext || !currentTopResultsContext.candidates.length;
  reportWrongOptimizerBtn.disabled = isBusy || !currentWrongCandidate;
  syncFavoriteStrategyButtonUi();
  modeButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  objectiveButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  Object.values(optimizerInputs).forEach((input) => {
    input.disabled = isBusy;
  });
  Object.values(optimizerMinimumInputs).forEach((input) => {
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

function syncAutoStageAdvanceToggle() {
  if (!stageAutoAdvanceToggleBtn) {
    return;
  }
  stageAutoAdvanceToggleBtn.classList.toggle("is-active", autoStageAdvanceEnabled);
  stageAutoAdvanceToggleBtn.setAttribute("aria-pressed", autoStageAdvanceEnabled ? "true" : "false");
  stageAutoAdvanceToggleBtn.setAttribute("aria-label", autoStageAdvanceEnabled ? "Kademe +1 acik" : "Kademe +1 kapali");
  stageAutoAdvanceToggleBtn.title = autoStageAdvanceEnabled ? "Kademe +1 acik" : "Kademe +1 kapali";
}

function loadAutoStageAdvanceSetting() {
  try {
    const raw = window.localStorage.getItem(AUTO_STAGE_ADVANCE_STORAGE_KEY);
    autoStageAdvanceEnabled = raw === "1";
  } catch (_error) {
    autoStageAdvanceEnabled = false;
  }
}

function persistAutoStageAdvanceSetting() {
  try {
    window.localStorage.setItem(AUTO_STAGE_ADVANCE_STORAGE_KEY, autoStageAdvanceEnabled ? "1" : "0");
  } catch (_error) {
    // localStorage erisimi yoksa ayar sadece bu sayfa oturumunda kalir.
  }
}

function syncObjectiveButtons() {
  objectiveButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.objective === optimizerObjective);
  });
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
  syncOptimizeButtonCompletionState(false);
  currentApprovedCandidate = null;
  currentWrongCandidate = null;
  currentTopResultsContext = null;
  syncAdminRestrictedActions();
  topResultsBtn.disabled = true;
  reportWrongOptimizerBtn.disabled = true;
  closeTopResultsModal();
  renderMatchedActualReport();
  renderComparisonPanel();
  renderFavoriteButtonState();
}

function createSearchKey(stage, enemy, allyPool, minimumRequiredCounts, searchBandSettings, mode, objective, diversityMode, stoneMode) {
  return JSON.stringify({
    stage,
    enemy,
    allyPool,
    minimumRequiredCounts,
    searchBandSettings: normalizeSearchBandSettings(searchBandSettings),
    mode,
    objective,
    diversityMode: Boolean(diversityMode),
    stoneMode: Boolean(stoneMode)
  });
}

function createComparisonKey(stage, enemy, allyPool, minimumRequiredCounts, searchBandSettings, mode, objective, stoneMode) {
  return JSON.stringify({
    stage,
    enemy,
    allyPool,
    minimumRequiredCounts,
    searchBandSettings: normalizeSearchBandSettings(searchBandSettings),
    mode,
    objective,
    stoneMode: Boolean(stoneMode)
  });
}

function validateMinimumRequiredCounts(allyPool, minimumRequiredCounts, maxPoints) {
  if (!isMinimumOptimizerVariant()) {
    return;
  }

  const exceedingUnit = ALLY_UNITS.find((unit) => (minimumRequiredCounts[unit.key] || 0) > (allyPool[unit.key] || 0));
  if (exceedingUnit) {
    throw new Error(`${exceedingUnit.label} icin minimum kullanim, eldeki adedi asamaz.`);
  }

  const minimumPoints = calculateArmyPoints(minimumRequiredCounts);
  if (minimumPoints > maxPoints) {
    throw new Error(`Minimum kullanim kisitlari puan limitini asiyor. Min ordu puani: ${minimumPoints}, limit: ${maxPoints}.`);
  }
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

async function initializeFavoriteStrategies() {
  await ensureFavoriteStrategiesLoaded();
  renderFavoriteButtonState();
}

function readFavoriteStrategiesCache() {
  try {
    const raw = window.localStorage.getItem(FAVORITE_STRATEGIES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry, index) => normalizeFavoriteStrategyEntry(entry, index))
      .filter(Boolean);
  } catch (error) {
    console.warn("Fav dizilimler okunamadi.", error);
    return [];
  }
}

function writeFavoriteStrategiesCache(items) {
  try {
    window.localStorage.setItem(FAVORITE_STRATEGIES_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn("Fav dizilimler kaydedilemedi.", error);
  }
}

function writeMergedFavoriteStrategiesCache(items) {
  const existing = readFavoriteStrategiesCache();
  const merged = new Map(existing.map((entry) => [entry.id, entry]));
  items.forEach((entry) => {
    if (entry?.id) {
      merged.set(entry.id, entry);
    }
  });
  writeFavoriteStrategiesCache([...merged.values()]);
}

function removeFavoriteStrategyFromCache(favoriteId) {
  writeFavoriteStrategiesCache(readFavoriteStrategiesCache().filter((entry) => entry.id !== favoriteId));
}

async function loadFavoriteStrategies() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadFavoriteStrategies !== "function") {
    return readFavoriteStrategiesCache();
  }
  try {
    const items = await window.BTFirebase.loadFavoriteStrategies();
    const normalized = items
      .map((entry, index) => normalizeFavoriteStrategyEntry(entry, index))
      .filter(Boolean);
    writeFavoriteStrategiesCache(normalized);
    return normalized;
  } catch (error) {
    console.warn("Fav dizilimler Firestore'dan yuklenemedi.", error);
    return readFavoriteStrategiesCache();
  }
}

function getCurrentApprovedStrategyDocId() {
  const stage = getCommittedStage();
  if (!stage || !window.BTFirebase || typeof window.BTFirebase.buildApprovedOptimizerDocId !== "function") {
    return "";
  }
  const enemyCounts = collectCounts(ENEMY_UNITS);
  return window.BTFirebase.buildApprovedOptimizerDocId(stage, getEnemySignature(stage, enemyCounts));
}

function getCurrentWrongReportSignature() {
  if (!currentWrongCandidate) {
    return "";
  }
  return currentWrongCandidate.matchSignature || buildOptimizerMatchSignature(
    currentWrongCandidate.stage,
    currentWrongCandidate.enemyCounts,
    currentWrongCandidate.allyCounts
  );
}

function getActiveFavoriteSignature(preferredSignature = null) {
  if (preferredSignature) {
    return preferredSignature;
  }
  const currentEntry = createFavoriteEntryFromCurrentRecommendation();
  const context = getFavoriteEnemyContext();
  return currentFavoriteModalSignature ||
    currentEntry?.enemyRosterSignature ||
    currentEntry?.enemySignature ||
    context?.enemyRosterSignature ||
    context?.enemySignature ||
    "";
}

function getCachedFavoriteStrategiesForSignature(signature) {
  if (!signature) {
    return [];
  }
  return readFavoriteStrategiesCache()
    .filter((entry) => entry.enemyRosterSignature === signature || entry.enemySignature === signature)
    .sort((left, right) => String(right.savedAt || "").localeCompare(String(left.savedAt || "")));
}

async function ensureApprovedStrategyLoaded(force = false) {
  const docId = getCurrentApprovedStrategyDocId();
  if (!docId) {
    activeApprovedStrategyId = "";
    approvedStrategies = [];
    return;
  }
  if (!force && docId === activeApprovedStrategyId) {
    return;
  }
  activeApprovedStrategyId = docId;
  const requestId = ++approvedStrategyRequestId;
  try {
    let item = null;
    if (window.BTFirebase && typeof window.BTFirebase.findApprovedStrategyByDocId === "function") {
      item = await window.BTFirebase.findApprovedStrategyByDocId(docId);
    } else {
      item = (await loadApprovedStrategies()).find((candidate) => candidate.id === docId) || null;
    }
    if (requestId !== approvedStrategyRequestId || activeApprovedStrategyId !== docId) {
      return;
    }
    approvedStrategies = item ? [item] : [];
    renderMatchedSavedStrategy();
  } catch (error) {
    console.warn("Onayli cozum hedefli yuklenemedi.", error);
  }
}

async function ensureWrongReportsLoaded(force = false) {
  const signature = getCurrentWrongReportSignature();
  if (!signature) {
    activeWrongReportSignature = "";
    wrongReports = [];
    return;
  }
  if (!force && signature === activeWrongReportSignature) {
    return;
  }
  activeWrongReportSignature = signature;
  const requestId = ++wrongReportRequestId;
  try {
    let items = [];
    if (window.BTFirebase && typeof window.BTFirebase.findWrongReportsByMatchSignature === "function") {
      items = await window.BTFirebase.findWrongReportsByMatchSignature("optimizer", signature);
    } else {
      items = (await loadWrongReports()).filter((item) => item.source === "optimizer" && item.matchSignature === signature);
    }
    if (requestId !== wrongReportRequestId || activeWrongReportSignature !== signature) {
      return;
    }
    wrongReports = items;
    renderMatchedActualReport();
  } catch (error) {
    console.warn("Wrong report hedefli yuklenemedi.", error);
  }
}

async function ensureFavoriteStrategiesLoaded(preferredSignature = null, force = false) {
  const signature = getActiveFavoriteSignature(preferredSignature);
  if (!signature) {
    activeFavoriteStrategySignature = "";
    favoriteStrategies = [];
    return;
  }
  favoriteStrategies = getCachedFavoriteStrategiesForSignature(signature);
  if (!force && signature === activeFavoriteStrategySignature) {
    return;
  }
  activeFavoriteStrategySignature = signature;
  const requestId = ++favoriteStrategyRequestId;
  try {
    let items = [];
    if (window.BTFirebase && typeof window.BTFirebase.findFavoriteStrategiesByEnemySignature === "function") {
      items = await window.BTFirebase.findFavoriteStrategiesByEnemySignature(signature, { pageSize: 10 });
    } else {
      items = await loadFavoriteStrategies();
    }
    if (requestId !== favoriteStrategyRequestId || activeFavoriteStrategySignature !== signature) {
      return;
    }
    favoriteStrategies = items
      .map((entry, index) => normalizeFavoriteStrategyEntry(entry, index))
      .filter(Boolean)
      .filter((entry) => entry.enemyRosterSignature === signature || entry.enemySignature === signature);
    writeMergedFavoriteStrategiesCache(favoriteStrategies);
    renderFavoriteButtonState();
  } catch (error) {
    console.warn("Fav hedefli yuklenemedi.", error);
  }
}

function normalizeFavoriteStrategyEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const stage = Number.parseInt(entry.stage, 10);
  const enemyCounts = normalizeFavoriteCounts(entry.enemyCounts, ENEMY_UNITS);
  const recommendationCounts = normalizeFavoriteCounts(entry.recommendationCounts, ALLY_UNITS);
  const allyPool = normalizeFavoriteCounts(entry.allyPool, ALLY_UNITS);
  const enemyRosterSignature = entry.enemyRosterSignature || getEnemyRosterSignature(enemyCounts);
  const enemySignature = entry.enemySignature || (Number.isFinite(stage) && stage > 0
    ? getEnemySignature(stage, enemyCounts)
    : enemyRosterSignature);

  if (!enemySignature || !enemyRosterSignature) {
    return null;
  }

  return {
    id: String(entry.id || `fav_${Date.now()}_${index}`),
    source: entry.source === "simulation" ? "simulation" : "optimizer",
    sourceLabel: entry.sourceLabel || (entry.source === "simulation" ? "Simulasyon Fav" : "Optimizer Fav"),
    savedAt: entry.savedAt || new Date().toISOString(),
    stage: Number.isFinite(stage) && stage > 0 ? stage : null,
    mode: entry.mode || "balanced",
    objective: normalizeOptimizerObjective(entry.objective),
    diversityMode: Boolean(entry.diversityMode),
    stoneMode: Boolean(entry.stoneMode),
    modeLabel: entry.modeLabel || getModeLabel(entry.mode || "balanced", normalizeOptimizerObjective(entry.objective), Boolean(entry.diversityMode), Boolean(entry.stoneMode)),
    enemySignature,
    enemyRosterSignature,
    enemyTitle: entry.enemyTitle || buildEnemyTitle(enemyCounts),
    enemyCounts,
    allyPool,
    recommendationCounts,
    usedPoints: Number.isFinite(Number(entry.usedPoints)) ? Math.round(Number(entry.usedPoints)) : 0,
    lostBlood: Number.isFinite(Number(entry.lostBlood)) ? Math.round(Number(entry.lostBlood)) : 0,
    winRate: Number.isFinite(Number(entry.winRate)) ? Math.round(Number(entry.winRate)) : 0
  };
}

function normalizeFavoriteCounts(counts, units) {
  const normalized = {};
  units.forEach((unit) => {
    const value = Number.parseInt(counts?.[unit.key] || 0, 10);
    normalized[unit.key] = Number.isFinite(value) && value > 0 ? value : 0;
  });
  return normalized;
}

function buildEnemyTitle(enemyCounts) {
  const parts = ENEMY_UNITS
    .filter((unit) => (enemyCounts?.[unit.key] || 0) > 0)
    .map((unit) => `${enemyCounts[unit.key]} ${unit.label}`);
  return parts.length ? parts.join(" / ") : "Versus";
}

function hasAnyEnemyUnits(enemyCounts) {
  return ENEMY_UNITS.some((unit) => (enemyCounts?.[unit.key] || 0) > 0);
}

function getEnemyRosterSignature(enemyCounts) {
  return ENEMY_UNITS.map((unit) => enemyCounts?.[unit.key] || 0).join("|");
}

function getFavoriteEnemyContext() {
  const enemyCounts = collectCounts(ENEMY_UNITS);
  const stage = getCommittedStage();
  if (!hasAnyEnemyUnits(enemyCounts)) {
    return null;
  }
  return {
    stage,
    enemyCounts,
    enemySignature: stage ? getEnemySignature(stage, enemyCounts) : getEnemyRosterSignature(enemyCounts),
    enemyRosterSignature: getEnemyRosterSignature(enemyCounts)
  };
}

function getCountsSignature(counts, units = ALLY_UNITS) {
  return units.map((unit) => counts?.[unit.key] || 0).join("|");
}

function createFavoriteEntryFromRecommendationCounts(recommendationCounts, options = {}) {
  const context = options.enemyCounts ? {
    stage: Number.isFinite(Number(options.stage)) ? Number(options.stage) : null,
    enemyCounts: normalizeFavoriteCounts(options.enemyCounts, ENEMY_UNITS),
    enemySignature: Number.isFinite(Number(options.stage)) && Number(options.stage) > 0
      ? getEnemySignature(Number(options.stage), normalizeFavoriteCounts(options.enemyCounts, ENEMY_UNITS))
      : getEnemyRosterSignature(normalizeFavoriteCounts(options.enemyCounts, ENEMY_UNITS)),
    enemyRosterSignature: getEnemyRosterSignature(normalizeFavoriteCounts(options.enemyCounts, ENEMY_UNITS))
  } : getFavoriteEnemyContext();

  if (!context || !hasAnyEnemyUnits(context.enemyCounts)) {
    return null;
  }
  const normalizedCounts = normalizeFavoriteCounts(recommendationCounts, ALLY_UNITS);
  const normalizedPool = normalizeFavoriteCounts(
    options.allyPool || currentApprovedCandidate?.allyPool || collectCounts(ALLY_UNITS),
    ALLY_UNITS
  );
  return {
    id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: options.source === "simulation" ? "simulation" : "optimizer",
    sourceLabel: options.sourceLabel || (options.source === "simulation" ? "Simulasyon Fav" : "Optimizer Fav"),
    savedAt: new Date().toISOString(),
    ...(context.stage ? { stage: context.stage } : {}),
    mode: options.mode || currentApprovedCandidate?.mode || "balanced",
    objective: normalizeOptimizerObjective(options.objective || currentApprovedCandidate?.objective),
    diversityMode: Boolean(options.diversityMode ?? currentApprovedCandidate?.diversityMode),
    stoneMode: Boolean(options.stoneMode ?? currentApprovedCandidate?.stoneMode),
    modeLabel: options.modeLabel || getModeLabel(
      options.mode || currentApprovedCandidate?.mode || "balanced",
      normalizeOptimizerObjective(options.objective || currentApprovedCandidate?.objective),
      Boolean(options.diversityMode ?? currentApprovedCandidate?.diversityMode),
      Boolean(options.stoneMode ?? currentApprovedCandidate?.stoneMode)
    ),
    enemySignature: context.enemySignature,
    enemyRosterSignature: context.enemyRosterSignature,
    enemyTitle: buildEnemyTitle(context.enemyCounts),
    enemyCounts: context.enemyCounts,
    allyPool: normalizedPool,
    minimumRequiredCounts: normalizeFavoriteCounts(
      options.minimumRequiredCounts || currentApprovedCandidate?.minimumRequiredCounts || {},
      ALLY_UNITS
    ),
    recommendationCounts: normalizedCounts,
    usedPoints: Number.isFinite(Number(options.usedPoints))
      ? Math.round(Number(options.usedPoints))
      : calculateArmyPoints(normalizedCounts),
    lostBlood: Number.isFinite(Number(options.lostBlood)) ? Math.round(Number(options.lostBlood)) : 0,
    winRate: Number.isFinite(Number(options.winRate)) ? Math.round(Number(options.winRate)) : 0
  };
}

function createFavoriteEntryFromCurrentRecommendation() {
  if (!currentApprovedCandidate) {
    return null;
  }
  const recommendation = getPrimaryOptimizerSource(currentApprovedCandidate.result);
  if (!recommendation?.counts) {
    return null;
  }
  return createFavoriteEntryFromRecommendationCounts(recommendation.counts, {
    stage: currentApprovedCandidate.stage,
    enemyCounts: currentApprovedCandidate.enemyCounts,
    allyPool: currentApprovedCandidate.allyPool,
    minimumRequiredCounts: currentApprovedCandidate.minimumRequiredCounts,
    mode: currentApprovedCandidate.mode,
    objective: normalizeOptimizerObjective(currentApprovedCandidate.objective),
    diversityMode: Boolean(currentApprovedCandidate.diversityMode),
    stoneMode: Boolean(currentApprovedCandidate.stoneMode),
    usedPoints: Math.round(recommendation.avgUsedPoints || 0),
    lostBlood: Number.isFinite(getDisplayedLossValue(recommendation)) ? Math.round(getDisplayedLossValue(recommendation)) : 0,
    winRate: Math.round((recommendation.winRate || 0) * 100)
  });
}

function getFavoriteStrategiesForEnemySignature(enemySignature) {
  return favoriteStrategies
    .filter((entry) => entry.enemyRosterSignature === enemySignature || entry.enemySignature === enemySignature)
    .sort((left, right) => String(right.savedAt || "").localeCompare(String(left.savedAt || "")));
}

function findMatchingFavoriteForEntry(entry) {
  if (!entry) {
    return null;
  }
  const signature = getCountsSignature(entry.recommendationCounts);
  return favoriteStrategies.find((candidate) =>
    (candidate.enemyRosterSignature === entry.enemyRosterSignature || candidate.enemySignature === entry.enemySignature) &&
    getCountsSignature(candidate.recommendationCounts) === signature
  ) || null;
}

function findMatchingFavoriteForCurrentRecommendation() {
  return findMatchingFavoriteForEntry(createFavoriteEntryFromCurrentRecommendation());
}

function syncFavoriteStrategyButtonUi() {
  if (!favoriteStrategyBtn) {
    return;
  }

  const context = getFavoriteEnemyContext();
  const currentEntry = createFavoriteEntryFromCurrentRecommendation();
  const activeSignature =
    currentEntry?.enemyRosterSignature ||
    currentEntry?.enemySignature ||
    context?.enemyRosterSignature ||
    context?.enemySignature ||
    null;
  const existingFavorites = activeSignature ? getFavoriteStrategiesForEnemySignature(activeSignature) : [];
  const currentMatch = findMatchingFavoriteForEntry(currentEntry);
  const isBusy = optimizeBtn.disabled;
  const canUseButton = Boolean(context || currentEntry || existingFavorites.length);

  favoriteStrategyBtn.disabled = isBusy || !canUseButton;
  favoriteStrategyBtn.classList.toggle("is-active", Boolean(currentMatch));
  favoriteStrategyBtn.classList.toggle("has-matches", existingFavorites.length > 0 && !currentMatch);

  if (currentMatch) {
    favoriteStrategyBtn.textContent = "Favli";
    favoriteStrategyBtn.title = "Bu dizilim zaten favli. Tiklayinca kayitli favlari gorursun.";
    return;
  }

  if (existingFavorites.length > 0) {
    favoriteStrategyBtn.textContent = "Favlari Gor";
    favoriteStrategyBtn.title = "Bu rakip icin kayitli favlari ac.";
    return;
  }

  favoriteStrategyBtn.textContent = "Favorilere Ekle";
  favoriteStrategyBtn.title = isAdminSession
    ? "Mevcut sonucu favorilere ekle."
    : "Fav kaydetmek icin admin girisi gerekli.";
}

async function saveFavoriteStrategy(entry) {
  const existing = favoriteStrategies.find((candidate) =>
    (candidate.enemyRosterSignature === entry.enemyRosterSignature || candidate.enemySignature === entry.enemySignature) &&
    getCountsSignature(candidate.recommendationCounts) === getCountsSignature(entry.recommendationCounts)
  );
  if (existing) {
    return existing;
  }

  const fallbackEntry = normalizeFavoriteStrategyEntry(entry, favoriteStrategies.length) || entry;
  if (!window.BTFirebase || typeof window.BTFirebase.saveFavoriteStrategy !== "function") {
    favoriteStrategies = [fallbackEntry, ...favoriteStrategies];
    writeMergedFavoriteStrategiesCache([fallbackEntry]);
    return fallbackEntry;
  }

  try {
    const saved = await window.BTFirebase.saveFavoriteStrategy(entry);
    const normalized = normalizeFavoriteStrategyEntry(saved, favoriteStrategies.length) || fallbackEntry;
    favoriteStrategies = [normalized, ...favoriteStrategies];
    writeMergedFavoriteStrategiesCache([normalized]);
    return normalized;
  } catch (error) {
    console.warn("Fav dizilim Firestore'a kaydedilemedi.", error);
    throw error;
  }
}

async function removeFavoriteStrategy(favoriteId) {
  if (!window.BTFirebase || typeof window.BTFirebase.deleteFavoriteStrategy !== "function") {
    favoriteStrategies = favoriteStrategies.filter((entry) => entry.id !== favoriteId);
    removeFavoriteStrategyFromCache(favoriteId);
    renderFavoriteButtonState();
    if (!favoriteStrategiesModal?.hidden) {
      renderFavoriteStrategiesModal();
    }
    return;
  }

  try {
    await window.BTFirebase.deleteFavoriteStrategy(favoriteId);
    favoriteStrategies = favoriteStrategies.filter((entry) => entry.id !== favoriteId);
    removeFavoriteStrategyFromCache(favoriteId);
  } catch (error) {
    console.warn("Fav dizilim silinemedi.", error);
    throw error;
  }
  renderFavoriteButtonState();
  if (!favoriteStrategiesModal?.hidden) {
    renderFavoriteStrategiesModal();
  }
}

function renderFavoriteButtonState() {
  void ensureFavoriteStrategiesLoaded();
  syncFavoriteStrategyButtonUi();
  if (!favoriteStrategiesModal?.hidden) {
    renderFavoriteStrategiesModal();
  }
  if (!topResultsModal.hidden) {
    renderTopResultsModal();
  }
}

function openFavoriteStrategiesModal(enemySignature = null, pendingEntry = null) {
  const context = getFavoriteEnemyContext();
  currentFavoriteModalSignature = enemySignature || context?.enemyRosterSignature || null;
  currentFavoriteModalPendingEntry = pendingEntry ? { ...pendingEntry } : null;
  renderFavoriteStrategiesModal();
  favoriteStrategiesModal.hidden = false;
  void ensureFavoriteStrategiesLoaded(currentFavoriteModalSignature, true);
}

function closeFavoriteStrategiesModal() {
  if (!favoriteStrategiesModal) {
    return;
  }
  favoriteStrategiesModal.hidden = true;
  currentFavoriteModalSignature = null;
  currentFavoriteModalPendingEntry = null;
}

function renderFavoriteStrategiesModal() {
  if (!favoriteStrategiesMeta || !favoriteStrategiesCurrentAction || !favoriteStrategiesList) {
    return;
  }

  favoriteStrategiesMeta.innerHTML = "";
  favoriteStrategiesCurrentAction.innerHTML = "";
  favoriteStrategiesList.innerHTML = "";

  const context = getFavoriteEnemyContext();
  const activeSignature = currentFavoriteModalSignature || context?.enemyRosterSignature || null;
  if (!activeSignature) {
    favoriteStrategiesList.innerHTML = '<p class="summary-empty">Bu rakip dizilimi icin gosterilecek fav yok.</p>';
    return;
  }

  const entries = getFavoriteStrategiesForEnemySignature(activeSignature);
  const referenceEntry = entries[0] || currentFavoriteModalPendingEntry || createFavoriteEntryFromCurrentRecommendation();
  const stage = referenceEntry?.stage || context?.stage || "-";
  const enemyCounts = referenceEntry?.enemyCounts || context?.enemyCounts || {};
  const currentEntry = currentFavoriteModalPendingEntry || createFavoriteEntryFromCurrentRecommendation();
  const currentMatch = findMatchingFavoriteForEntry(currentEntry);

  [
    `Kademe ${stage}`,
    buildEnemyTitle(enemyCounts),
    `${entries.length} fav kayit`,
    currentEntry && currentEntry.enemyRosterSignature === activeSignature
      ? "Mevcut sonuc ekranda"
      : "Su an yeni sonuc secili degil"
  ].forEach((value) => {
    const tag = document.createElement("span");
    tag.textContent = value;
    favoriteStrategiesMeta.appendChild(tag);
  });

  const currentActionCard = document.createElement("div");
  currentActionCard.className = "favorite-current-box";
  const currentActionText = document.createElement("span");

  if (currentMatch) {
    currentActionText.textContent = "Mevcut onerilen dizilim zaten favlarin arasinda.";
  } else if (currentEntry && currentEntry.enemyRosterSignature === activeSignature) {
    currentActionText.textContent = "Istersen secili dizilimi de bu rakip icin favlara ekleyebilirsin.";
    const addCurrentBtn = document.createElement("button");
    addCurrentBtn.type = "button";
    addCurrentBtn.className = "button button-secondary";
    addCurrentBtn.textContent = "Mevcut Sonucu Favla";
    addCurrentBtn.disabled = !isAdminSession;
    addCurrentBtn.title = isAdminSession ? "" : "Fav kaydetmek icin admin girisi gerekli.";
    addCurrentBtn.addEventListener("click", () => {
      if (!isAdminSession) {
        window.alert("Fav kaydetmek icin admin girisi gerekli.");
        return;
      }
      void saveFavoriteStrategy(currentEntry)
        .then(() => {
          renderFavoriteButtonState();
          renderFavoriteStrategiesModal();
        })
        .catch((error) => {
          showCopyableError("Fav Kaydedilemedi", `Fav kaydedilemedi:\n\n${error.message}`);
        });
    });
    currentActionCard.append(currentActionText, addCurrentBtn);
  } else {
    currentActionText.textContent = "Bu rakip icin kayitli favlar altta listeleniyor.";
  }

  if (!currentActionCard.childNodes.length) {
    currentActionCard.appendChild(currentActionText);
  }
  favoriteStrategiesCurrentAction.appendChild(currentActionCard);

  if (!entries.length) {
    favoriteStrategiesList.innerHTML = '<p class="summary-empty">Bu rakip dizilimi icin henuz fav yok.</p>';
    return;
  }

  const currentAllyPool = collectCounts(ALLY_UNITS);
  entries.forEach((entry, index) => {
    const enoughArmy = ALLY_UNITS.every((unit) => (currentAllyPool[unit.key] || 0) >= (entry.recommendationCounts[unit.key] || 0));
    const exactCurrent = Boolean(currentEntry) &&
      currentEntry.enemyRosterSignature === entry.enemyRosterSignature &&
      getCountsSignature(currentEntry.recommendationCounts) === getCountsSignature(entry.recommendationCounts);

    const card = document.createElement("article");
    card.className = `saved-match-card favorite-match-card${exactCurrent ? " is-current" : ""}`;

    const head = document.createElement("div");
    head.className = "saved-match-head";
    head.innerHTML = `<strong>${index + 1}. Fav Dizilim${exactCurrent ? " / su anki sonuc" : ""}</strong><span>${entry.modeLabel} / ${formatDate(entry.savedAt)}</span>`;

    const body = document.createElement("div");
    body.className = "saved-match-meta";
    body.innerHTML = `
      <span>Kazanma orani: <strong>%${entry.winRate}</strong></span>
      <span>Kan kaybi: <strong>${entry.lostBlood}</strong></span>
      <span>Puan: <strong>${entry.usedPoints}</strong></span>
      <span>Durum: <strong>${enoughArmy ? "Uygulanabilir" : "Eksik birlik var"}</strong></span>
    `;

    const note = document.createElement("p");
    note.className = "favorite-match-note";
    note.textContent = `${buildEnemyTitle(entry.enemyCounts)} rakibine karsi daha once kaydedildi.`;

    const actions = document.createElement("div");
    actions.className = "favorite-match-actions";
    actions.appendChild(createOpenSimulationButton(entry.enemyCounts, entry.recommendationCounts, "Simulasyonda Ac"));
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "button button-ghost";
    removeBtn.textContent = "Favdan Cikar";
    removeBtn.disabled = !isAdminSession;
    removeBtn.title = isAdminSession ? "" : "Fav silmek icin admin girisi gerekli.";
    removeBtn.addEventListener("click", () => {
      if (!isAdminSession) {
        window.alert("Fav silmek icin admin girisi gerekli.");
        return;
      }
      void removeFavoriteStrategy(entry.id).catch((error) => {
        showCopyableError("Fav Silinemedi", `Fav silinemedi:\n\n${error.message}`);
      });
    });
    actions.appendChild(removeBtn);

    card.append(head, body, note, actions, buildTopResultUnitList(entry.recommendationCounts));
    favoriteStrategiesList.appendChild(card);
  });
}

function createTopResultFavoriteButton(entry) {
  const favoriteEntry = createFavoriteEntryFromRecommendationCounts(entry.counts, {
    stage: currentTopResultsContext?.stage,
    enemyCounts: currentTopResultsContext?.enemyCounts || {},
    allyPool: currentApprovedCandidate?.allyPool || collectCounts(ALLY_UNITS),
    mode: currentTopResultsContext?.mode || currentApprovedCandidate?.mode || "balanced",
    objective: normalizeOptimizerObjective(currentTopResultsContext?.objective || currentApprovedCandidate?.objective),
    diversityMode: Boolean(currentTopResultsContext?.diversityMode ?? currentApprovedCandidate?.diversityMode),
    stoneMode: Boolean(entry.stoneMode ?? currentTopResultsContext?.stoneMode ?? currentApprovedCandidate?.stoneMode),
    usedPoints: Math.round(entry.avgUsedPoints || 0),
    lostBlood: Number.isFinite(getDisplayedLossValue(entry)) ? Math.round(getDisplayedLossValue(entry)) : 0,
    winRate: Math.round((entry.winRate || 0) * 100)
  });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-ghost top-result-favorite-button";
  button.textContent = "Favorilere Ekle";

  if (!favoriteEntry) {
    button.disabled = true;
    button.title = "Fav icin once gecerli rakip dizilimi gerekli.";
    return button;
  }

  const existingEnemyFavorites = getFavoriteStrategiesForEnemySignature(favoriteEntry.enemyRosterSignature);
  const exactMatch = findMatchingFavoriteForEntry(favoriteEntry);
  button.classList.toggle("is-active", Boolean(exactMatch));
  button.classList.toggle("has-matches", existingEnemyFavorites.length > 0 && !exactMatch);
  button.textContent = exactMatch ? "Favli" : "Favorilere Ekle";
  button.title = exactMatch
    ? "Bu dizilim zaten favli. Tiklayinca tum favlari gorursun."
    : existingEnemyFavorites.length > 0
      ? "Bu rakip icin daha once favlar var. Tiklayinca liste acilir."
      : (isAdminSession ? "Bu dizilimi favorilere ekle." : "Fav kaydetmek icin admin girisi gerekli.");

  button.addEventListener("click", () => {
    if (exactMatch || existingEnemyFavorites.length > 0) {
      openFavoriteStrategiesModal(favoriteEntry.enemyRosterSignature, favoriteEntry);
      return;
    }
    if (!isAdminSession) {
      window.alert("Fav kaydetmek icin admin girisi gerekli.");
      return;
    }
    void saveFavoriteStrategy(favoriteEntry)
      .then(() => {
        renderFavoriteButtonState();
        showInfoMessage("Fav Kaydedildi", "Dizilim favorilere eklendi.");
      })
      .catch((error) => {
        showCopyableError("Fav Kaydedilemedi", `Fav kaydedilemedi:\n\n${error.message}`);
      });
  });

  return button;
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
      exploratoryMultiplier: 6,
      exhaustiveLimit: 1500,
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
      exploratoryMultiplier: 10,
      exhaustiveLimit: 6000,
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
      exploratoryMultiplier: 16,
      exhaustiveLimit: 20000,
      seedOffset: 5209
    }
  };

  const preset = presets[mode] || presets.balanced;
  const trialCount = Math.min(preset.trialStart + (runIndex - 1) * preset.trialStep, preset.trialMax);
  const fullArmyTrials = Math.min(preset.fullStart + (runIndex - 1) * preset.fullStep, preset.fullMax);
  const beamWidth = Math.min(preset.beamStart + (runIndex - 1) * preset.beamStep, preset.beamMax);
  return {
    trialCount,
    fullArmyTrials,
    beamWidth,
    maxIterations: Math.min(preset.iterStart + (runIndex - 1) * preset.iterStep, preset.iterMax),
    eliteCount: preset.eliteCount,
    stabilityTrials: Math.max(fullArmyTrials, trialCount * preset.stabilityMultiplier),
    exploratoryCandidateCount: Math.min(Math.max(60, beamWidth * preset.exploratoryMultiplier), 640),
    exhaustiveCandidateLimit: preset.exhaustiveLimit,
    diversityCandidateCount: diversityMode
      ? Math.min(
        Math.max(24, Math.floor((beamWidth || 0) * 3)),
        144
      )
      : 0,
    baseSeed: 41017 + stage * 31 + runIndex * 7919 + preset.seedOffset + (diversityMode ? 170003 : 0)
  };
}

function pickBetterOptimizerResult(left, right) {
  const leftSource = left.possible ? left.recommendation : left.fallback || left.fullArmyEvaluation;
  const rightSource = right.possible ? right.recommendation : right.fallback || right.fullArmyEvaluation;
  if (!leftSource && !rightSource) {
    return right?.constraintIssue ? right : left;
  }
  if (!leftSource) {
    return right;
  }
  if (!rightSource) {
    return left;
  }
  const objective = normalizeOptimizerObjective(rightSource?.objective || leftSource?.objective);
  const stoneMode = Boolean(rightSource?.stoneMode || leftSource?.stoneMode);
  const lossKey = stoneMode ? "expectedStoneAdjustedLostBlood" : "expectedLostBlood";

  if (left.possible !== right.possible) {
    return left.possible ? left : right;
  }

  if (left.possible) {
    if (leftSource.winRate !== rightSource.winRate) {
      return leftSource.winRate > rightSource.winRate ? left : right;
    }
    if (objective === "min_army") {
      if (leftSource.avgUsedPoints !== rightSource.avgUsedPoints) {
        return leftSource.avgUsedPoints < rightSource.avgUsedPoints ? left : right;
      }
      if ((leftSource[lossKey] ?? Number.POSITIVE_INFINITY) !== (rightSource[lossKey] ?? Number.POSITIVE_INFINITY)) {
        return (leftSource[lossKey] ?? Number.POSITIVE_INFINITY) < (rightSource[lossKey] ?? Number.POSITIVE_INFINITY) ? left : right;
      }
    } else if (objective === "safe_win") {
      if ((leftSource[lossKey] ?? Number.POSITIVE_INFINITY) !== (rightSource[lossKey] ?? Number.POSITIVE_INFINITY)) {
        return (leftSource[lossKey] ?? Number.POSITIVE_INFINITY) < (rightSource[lossKey] ?? Number.POSITIVE_INFINITY) ? left : right;
      }
      if (leftSource.avgUsedPoints !== rightSource.avgUsedPoints) {
        return leftSource.avgUsedPoints > rightSource.avgUsedPoints ? left : right;
      }
    } else {
      if ((leftSource[lossKey] ?? Number.POSITIVE_INFINITY) !== (rightSource[lossKey] ?? Number.POSITIVE_INFINITY)) {
        return (leftSource[lossKey] ?? Number.POSITIVE_INFINITY) < (rightSource[lossKey] ?? Number.POSITIVE_INFINITY) ? left : right;
      }
      if (leftSource.avgUsedPoints !== rightSource.avgUsedPoints) {
        return leftSource.avgUsedPoints < rightSource.avgUsedPoints ? left : right;
      }
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
    const isMinimumAllyRow = side === "ally" && isMinimumOptimizerVariant();
    row.className = `unit-row${isMinimumAllyRow ? " unit-row-minimum" : ""}`;

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
      renderFavoriteButtonState();
      if (!favoriteStrategiesModal?.hidden) {
        renderFavoriteStrategiesModal();
      }
    });

    const inputGroup = document.createElement("div");
    inputGroup.className = "unit-row-inputs";
    inputGroup.appendChild(createUnitInputStack(isMinimumAllyRow ? "Havuz" : "Adet", input, isMinimumAllyRow ? "is-stock" : ""));

    if (isMinimumAllyRow) {
      const minInput = createNumberInput(`optimizer-min-${unit.key}`, "0");
      minInput.addEventListener("input", () => {
        invalidateSearchSession();
        renderPointSummary();
      });
      minInput.addEventListener("blur", renderPointSummary);
      optimizerMinimumInputs[unit.key] = minInput;
      inputGroup.classList.add("has-constraint");
      inputGroup.appendChild(createUnitInputStack("Min", minInput, "is-minimum"));
    }

    row.append(label, inputGroup);
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

function sanitizeRosterClipboardCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  const digits = String(value ?? "").match(/\d+/)?.[0] || "";
  return digits ? Number.parseInt(digits, 10) : 0;
}

function normalizeRosterClipboardCounts(units, source) {
  const counts = {};
  units.forEach((unit) => {
    counts[unit.key] = sanitizeRosterClipboardCount(source?.[unit.key]);
  });
  return counts;
}

function normalizeRosterClipboardPayload(raw) {
  if (!raw || raw.type !== "bt-analiz-roster" || !["ally", "enemy", "both"].includes(raw.scope)) {
    return null;
  }

  const payload = {
    type: "bt-analiz-roster",
    version: 1,
    scope: raw.scope
  };

  if (raw.scope === "ally" || raw.scope === "both") {
    payload.allyCounts = normalizeRosterClipboardCounts(ALLY_UNITS, raw.allyCounts);
  }

  if (raw.scope === "enemy" || raw.scope === "both") {
    payload.enemyCounts = normalizeRosterClipboardCounts(ENEMY_UNITS, raw.enemyCounts);
  }

  return payload;
}

function buildRosterClipboardPayload(scope) {
  return normalizeRosterClipboardPayload({
    type: "bt-analiz-roster",
    version: 1,
    scope,
    allyCounts: scope === "ally" || scope === "both" ? collectCounts(ALLY_UNITS) : undefined,
    enemyCounts: scope === "enemy" || scope === "both" ? collectCounts(ENEMY_UNITS) : undefined
  });
}

function formatRosterClipboardRemaining(expiresAt) {
  const remainingMs = Math.max(0, expiresAt - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setRosterClipboardIndicatorState(state, text) {
  if (!rosterClipboardIndicator) {
    return;
  }

  rosterClipboardIndicator.textContent = text;
  rosterClipboardIndicator.classList.toggle("is-active", state === "active");
  rosterClipboardIndicator.classList.toggle("is-expired", state === "expired");
  rosterClipboardIndicator.classList.toggle("is-empty", state === "empty");
}

function syncRosterClipboardIndicator() {
  if (rosterClipboardIndicatorTimer) {
    window.clearInterval(rosterClipboardIndicatorTimer);
    rosterClipboardIndicatorTimer = null;
  }

  if (rosterClipboardCache && rosterClipboardExpiresAt > Date.now()) {
    setRosterClipboardIndicatorState("active", `Kopya hazir ${formatRosterClipboardRemaining(rosterClipboardExpiresAt)}`);
    rosterClipboardIndicatorTimer = window.setInterval(() => {
      if (!rosterClipboardCache || !(rosterClipboardExpiresAt > Date.now())) {
        if (rosterClipboardIndicatorTimer) {
          window.clearInterval(rosterClipboardIndicatorTimer);
          rosterClipboardIndicatorTimer = null;
        }
        if (rosterClipboardCache) {
          clearRosterClipboardPayload();
        } else {
          setRosterClipboardIndicatorState("empty", "Kopya yok");
        }
        return;
      }
      setRosterClipboardIndicatorState("active", `Kopya hazir ${formatRosterClipboardRemaining(rosterClipboardExpiresAt)}`);
    }, 1000);
    return;
  }

  setRosterClipboardIndicatorState("empty", "Kopya yok");
}

function clearRosterClipboardPayload(showExpiredMessage = true) {
  rosterClipboardCache = null;
  rosterClipboardExpiresAt = 0;
  if (rosterClipboardExpiryTimer) {
    window.clearTimeout(rosterClipboardExpiryTimer);
    rosterClipboardExpiryTimer = null;
  }
  if (rosterClipboardIndicatorTimer) {
    window.clearInterval(rosterClipboardIndicatorTimer);
    rosterClipboardIndicatorTimer = null;
  }
  try {
    window.sessionStorage.removeItem(ROSTER_CLIPBOARD_STORAGE_KEY);
    window.localStorage.removeItem(ROSTER_CLIPBOARD_STORAGE_KEY);
  } catch (error) {
    // Storage erisimi engellense bile bellek ici cache temizlenmis olur.
  }
  if (showExpiredMessage) {
    setRosterClipboardIndicatorState("expired", "Kopya silindi");
    window.setTimeout(() => {
      if (!rosterClipboardCache && !(rosterClipboardExpiresAt > Date.now())) {
        setRosterClipboardIndicatorState("empty", "Kopya yok");
      }
    }, 1800);
    return;
  }
  setRosterClipboardIndicatorState("empty", "Kopya yok");
}

function armRosterClipboardExpiry(expiresAt) {
  if (rosterClipboardExpiryTimer) {
    window.clearTimeout(rosterClipboardExpiryTimer);
    rosterClipboardExpiryTimer = null;
  }

  if (!(expiresAt > Date.now())) {
    clearRosterClipboardPayload();
    return;
  }

  rosterClipboardExpiryTimer = window.setTimeout(() => {
    clearRosterClipboardPayload();
  }, Math.max(0, expiresAt - Date.now()));
}

function saveRosterClipboardPayload(payload) {
  rosterClipboardCache = payload;
  rosterClipboardExpiresAt = Date.now() + ROSTER_CLIPBOARD_TTL_MS;
  armRosterClipboardExpiry(rosterClipboardExpiresAt);
  syncRosterClipboardIndicator();
  try {
    window.sessionStorage.setItem(ROSTER_CLIPBOARD_STORAGE_KEY, JSON.stringify({
      payload,
      expiresAt: rosterClipboardExpiresAt
    }));
    window.localStorage.removeItem(ROSTER_CLIPBOARD_STORAGE_KEY);
  } catch (error) {
    // Storage engellense bile uygulama ici kopyalama cache ile devam eder.
  }
}

function loadStoredRosterClipboardPayload() {
  if (rosterClipboardCache && rosterClipboardExpiresAt > Date.now()) {
    armRosterClipboardExpiry(rosterClipboardExpiresAt);
    return rosterClipboardCache;
  }

  if (rosterClipboardCache) {
    clearRosterClipboardPayload(false);
  }

  try {
    window.localStorage.removeItem(ROSTER_CLIPBOARD_STORAGE_KEY);
    const raw = window.sessionStorage.getItem(ROSTER_CLIPBOARD_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const envelope = JSON.parse(raw);
    const expiresAt = Number(envelope?.expiresAt || 0);
    const parsed = normalizeRosterClipboardPayload(envelope?.payload);
    if (parsed && expiresAt > Date.now()) {
      rosterClipboardCache = parsed;
      rosterClipboardExpiresAt = expiresAt;
      armRosterClipboardExpiry(expiresAt);
      syncRosterClipboardIndicator();
      return parsed;
    }
    clearRosterClipboardPayload(false);
    return null;
  } catch (error) {
    clearRosterClipboardPayload(false);
    return null;
  }
}

async function writeRosterClipboardToSystem(payload) {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    return false;
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(payload));
    return true;
  } catch (error) {
    return false;
  }
}

async function readRosterClipboardFromSystem() {
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
    return null;
  }

  try {
    const rawText = await navigator.clipboard.readText();
    if (!rawText) {
      return null;
    }
    const parsed = normalizeRosterClipboardPayload(JSON.parse(rawText));
    if (parsed) {
      saveRosterClipboardPayload(parsed);
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function applyRosterCounts(units, counts) {
  units.forEach((unit) => {
    optimizerInputs[unit.key].value = String(counts?.[unit.key] || 0);
  });
}

function formatAppliedRosterLabels(labels) {
  if (labels.length <= 1) {
    return labels[0] || "veriler";
  }
  return `${labels.slice(0, -1).join(", ")} ve ${labels[labels.length - 1]}`;
}

async function copyRosterSelection(scope) {
  const payload = buildRosterClipboardPayload(scope);
  if (!payload) {
    return;
  }

  saveRosterClipboardPayload(payload);
  const copiedToSystem = await writeRosterClipboardToSystem(payload);

  if (scope === "both") {
    optimizerStatus.textContent = copiedToSystem ? "Iki tarafin ordusu kopyalandi" : "Iki tarafin ordusu hafizada tutuldu";
    return;
  }

  optimizerStatus.textContent = scope === "ally"
    ? (copiedToSystem ? "Eldeki ordu kopyalandi" : "Eldeki ordu hafizada tutuldu")
    : (copiedToSystem ? "Rakip ordu kopyalandi" : "Rakip ordu hafizada tutuldu");
}

async function getRosterClipboardPayload() {
  const storedPayload = loadStoredRosterClipboardPayload();
  if (storedPayload) {
    return storedPayload;
  }

  return readRosterClipboardFromSystem();
}

async function pasteRosterSelection(scope) {
  const payload = await getRosterClipboardPayload();
  if (!payload) {
    window.alert("Yapistirilacak bir ordu verisi bulunamadi.");
    syncRosterClipboardIndicator();
    return;
  }

  const appliedLabels = [];

  if ((scope === "ally" || scope === "both") && payload.allyCounts) {
    applyRosterCounts(ALLY_UNITS, payload.allyCounts);
    appliedLabels.push("eldeki ordu");
  }

  if ((scope === "enemy" || scope === "both") && payload.enemyCounts) {
    applyRosterCounts(ENEMY_UNITS, payload.enemyCounts);
    appliedLabels.push("rakip ordu");
  }

  if (!appliedLabels.length) {
    window.alert("Kopyalanan veri secilen alana uygun degil.");
    return;
  }

  invalidateSearchSession();
  renderPointSummary();
  renderMatchedSavedStrategy();
  optimizerStatus.textContent = `${formatAppliedRosterLabels(appliedLabels)} yapistirildi`;
  syncRosterClipboardIndicator();
}

function collectCounts(units) {
  const counts = {};
  units.forEach((unit) => {
    counts[unit.key] = parseCount(optimizerInputs[unit.key].value, unit.label);
  });
  return counts;
}

function formatPointBandText(minPoints, maxPoints) {
  if (!(maxPoints >= 0)) {
    return "-";
  }
  return `${Math.max(0, Math.round(minPoints))}-${Math.round(maxPoints)}`;
}

function collectSearchBandSettings() {
  const mode = normalizeSearchBandMode(optimizerSearchBandPresetInput?.value);
  if (mode === "full") {
    return normalizeSearchBandSettings({ mode });
  }
  if (mode === "tight75") {
    return normalizeSearchBandSettings({ mode });
  }

  const minPercent = optimizerCustomBandMinInput
    ? parseCount(optimizerCustomBandMinInput.value, "Ozel bant min yuzde")
    : 75;
  const maxPercent = optimizerCustomBandMaxInput
    ? parseCount(optimizerCustomBandMaxInput.value, "Ozel bant max yuzde")
    : 100;

  if (minPercent > 100 || maxPercent > 100) {
    throw new Error("Ozel bant yuzdeleri 0 ile 100 arasinda olmalidir.");
  }
  if (minPercent > maxPercent) {
    throw new Error("Ozel bantta min yuzde, max yuzdeden buyuk olamaz.");
  }

  return normalizeSearchBandSettings({
    mode,
    minPercent,
    maxPercent
  });
}

function applySearchBandSettings(settings = {}) {
  const normalized = normalizeSearchBandSettings(settings);
  if (optimizerSearchBandPresetInput) {
    optimizerSearchBandPresetInput.value = normalized.mode;
  }
  if (optimizerSearchBandPresetMobileInput) {
    optimizerSearchBandPresetMobileInput.value = normalized.mode;
  }
  if (optimizerCustomBandMinInput) {
    optimizerCustomBandMinInput.value = String(normalized.minPercent);
  }
  if (optimizerCustomBandMaxInput) {
    optimizerCustomBandMaxInput.value = String(normalized.maxPercent);
  }
  syncSearchBandControls();
}

function syncSearchBandControls() {
  const normalized = normalizeSearchBandSettings({
    mode: optimizerSearchBandPresetInput?.value,
    minPercent: optimizerCustomBandMinInput?.value,
    maxPercent: optimizerCustomBandMaxInput?.value
  });
  if (optimizerSearchBandPresetInput && optimizerSearchBandPresetInput.value !== normalized.mode) {
    optimizerSearchBandPresetInput.value = normalized.mode;
  }
  if (optimizerSearchBandPresetMobileInput && optimizerSearchBandPresetMobileInput.value !== normalized.mode) {
    optimizerSearchBandPresetMobileInput.value = normalized.mode;
  }
  const isCustom = normalized.mode === "custom";
  if (optimizerCustomBandInputs) {
    optimizerCustomBandInputs.hidden = !isCustom;
  }
  if (optimizerCustomBandMinInput) {
    optimizerCustomBandMinInput.disabled = !isCustom;
  }
  if (optimizerCustomBandMaxInput) {
    optimizerCustomBandMaxInput.disabled = !isCustom;
  }
}

function getSearchBandPointRange(maxPoints, settings = collectSearchBandSettings()) {
  if (!(maxPoints >= 0)) {
    return {
      minUsedPoints: 0,
      maxUsedPoints: 0
    };
  }
  const normalized = normalizeSearchBandSettings(settings);
  return {
    minUsedPoints: Math.max(0, Math.ceil(maxPoints * (normalized.minPercent / 100))),
    maxUsedPoints: Math.max(0, Math.floor(maxPoints * (normalized.maxPercent / 100)))
  };
}

function formatSearchBandSummary(maxPoints, settings) {
  const normalized = normalizeSearchBandSettings(settings);
  const range = getSearchBandPointRange(maxPoints, normalized);
  return `${getSearchBandLabel(normalized.mode)} (%${normalized.minPercent}-%${normalized.maxPercent} / ${formatPointBandText(range.minUsedPoints, range.maxUsedPoints)} puan)`;
}

function calculateTotalCombinationCount(allyPool, maxPoints, minimumRequiredCounts = null, minimumUsedPoints = 0, maximumUsedPoints = maxPoints) {
  if (!(maxPoints >= 0)) {
    return 0n;
  }

  const constrainedPool = {};
  let constrainedMaxPoints = Math.min(maxPoints, Math.max(0, Math.floor(maximumUsedPoints)));
  ALLY_UNITS.forEach((unit) => {
    const poolCount = allyPool[unit.key] || 0;
    const minimumCount = minimumRequiredCounts?.[unit.key] || 0;
    if (minimumCount > poolCount) {
      constrainedMaxPoints = -1;
    }
    constrainedPool[unit.key] = Math.max(0, poolCount - minimumCount);
    constrainedMaxPoints -= minimumCount * POINTS_BY_ALLY_KEY[unit.key];
  });

  if (constrainedMaxPoints < 0) {
    return 0n;
  }

  const constrainedMinimumPoints = Math.max(0, Math.ceil(minimumUsedPoints) - calculateArmyPoints(minimumRequiredCounts || {}));
  if (constrainedMinimumPoints > constrainedMaxPoints) {
    return 0n;
  }

  const activeUnits = ALLY_UNITS.filter((unit) => (constrainedPool[unit.key] || 0) > 0);
  const dp = Array.from({ length: constrainedMaxPoints + 1 }, () => 0n);
  dp[0] = 1n;

  activeUnits.forEach((unit) => {
    const cost = POINTS_BY_ALLY_KEY[unit.key];
    const maxCount = constrainedPool[unit.key] || 0;
    const next = Array.from({ length: constrainedMaxPoints + 1 }, () => 0n);

    for (let points = 0; points <= constrainedMaxPoints; points += 1) {
      if (dp[points] === 0n) {
        continue;
      }
      const maxTake = Math.min(maxCount, Math.floor((constrainedMaxPoints - points) / cost));
      for (let count = 0; count <= maxTake; count += 1) {
        next[points + count * cost] += dp[points];
      }
    }

    for (let index = 0; index <= constrainedMaxPoints; index += 1) {
      dp[index] = next[index];
    }
  });

  return dp.reduce((sum, value, index) => {
    return index >= constrainedMinimumPoints ? sum + value : sum;
  }, 0n);
}

function formatLargeInteger(value) {
  if (typeof value === "bigint") {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  if (Number.isFinite(value)) {
    return Math.round(value).toLocaleString("tr-TR");
  }
  return String(value ?? "-");
}

function resetValues() {
  renderSimulatedStageDisplay(null);
  [...ENEMY_UNITS, ...ALLY_UNITS].forEach((unit) => {
    optimizerInputs[unit.key].value = "0";
  });
  ALLY_UNITS.forEach((unit) => {
    if (optimizerMinimumInputs[unit.key]) {
      optimizerMinimumInputs[unit.key].value = "0";
    }
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
    if (optimizerMinimumInputs[unit.key]) {
      optimizerMinimumInputs[unit.key].value = "0";
    }
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
  renderConstraintInfo();
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
  renderFavoriteButtonState();
  if (!favoriteStrategiesModal?.hidden) {
    renderFavoriteStrategiesModal();
  }
}

function renderSimulatedStageDisplay(stage) {
  if (!simulatedStageDisplay) {
    return;
  }
  simulatedStageDisplay.value = Number.isFinite(stage) && stage > 0 ? String(stage) : "-";
}

function syncStageAfterSimulation(stage) {
  if (!Number.isFinite(stage) || stage <= 0) {
    return;
  }
  renderSimulatedStageDisplay(stage);
  if (!autoStageAdvanceEnabled) {
    return;
  }
  stageInput.value = String(stage + 1);
  commitStageInput();
}

function collectMinimumRequiredCounts() {
  const counts = {};
  ALLY_UNITS.forEach((unit) => {
    const input = optimizerMinimumInputs[unit.key];
    counts[unit.key] = input ? parseCount(input.value, `${unit.label} minimum kullanim`) : 0;
  });
  return counts;
}

function getActiveMinimumRequirementEntries() {
  if (!isMinimumOptimizerVariant()) {
    return [];
  }
  const minimumRequiredCounts = collectMinimumRequiredCounts();
  return ALLY_UNITS
    .map((unit) => ({ unit, count: minimumRequiredCounts[unit.key] || 0 }))
    .filter((entry) => entry.count > 0);
}

function formatMinimumRequirements(entries, maxItems = 4) {
  if (!entries.length) {
    return "yok";
  }
  const parts = entries.slice(0, maxItems).map((entry) => `${entry.unit.label}: ${entry.count}`);
  if (entries.length > maxItems) {
    parts.push(`+${entries.length - maxItems} daha`);
  }
  return parts.join(", ");
}

function renderConstraintInfo() {
  if (!optimizerConstraintInfo) {
    return;
  }

  const stage = getCommittedStage();
  const pointLimit = stage ? getStagePointLimit(stage) : null;
  const searchBandSettings = normalizeSearchBandSettings({
    mode: optimizerSearchBandPresetInput?.value,
    minPercent: optimizerCustomBandMinInput?.value,
    maxPercent: optimizerCustomBandMaxInput?.value
  });
  const activeEntries = getActiveMinimumRequirementEntries();
  const pointText = pointLimit === null
    ? "Kademe secildiginde secilen arama bandi puana cevrilir."
    : `Aktif arama bandi: ${formatSearchBandSummary(pointLimit, searchBandSettings)}. Optimizer sadece bu araliktaki dizilimleri tarar.`;

  if (!isMinimumOptimizerVariant()) {
    optimizerConstraintInfo.textContent = pointText;
    return;
  }

  if (!activeEntries.length) {
    optimizerConstraintInfo.textContent = `${pointText} Soldaki kutu eldeki adet, sagdaki Min kutusu ise onerilen dizilimde bu birlikten en az kac adet bulunmasi gerektigini belirler.`;
    return;
  }

  optimizerConstraintInfo.textContent = `${pointText} Aktif min kisitlar: ${formatMinimumRequirements(activeEntries)}. Optimizer bu birlikleri tum adaylarda zorunlu tutar.`;
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
  const lossLabel = meta.stoneMode ? "tas sonrasi kalici kayip" : "ortalama kan kaybi";
  const source = getPrimaryOptimizerSource(result);
  const activeMinimumEntries = getActiveMinimumRequirementEntries();
  const searchBandSettings = normalizeSearchBandSettings(meta.searchBandSettings);
  const progressLines = [
    `- profil: ${getModeLabel(meta.mode, meta.objective, meta.diversityMode, meta.stoneMode)}`,
    `- arama bandi: ${formatSearchBandSummary(maxPoints, searchBandSettings)}`,
    ...(activeMinimumEntries.length ? [`- min kullanim: ${formatMinimumRequirements(activeMinimumEntries, 6)}`] : []),
    `- arama bandindaki kombinasyon: ${formatLargeInteger(meta.bandCombinationCount)}`,
    `- toplam olasi kombinasyon: ${formatLargeInteger(meta.totalCombinationCount)}`,
    `- deneme: ${meta.runIndex}`,
    `- bu basista tur: ${meta.batchRuns || 1}`,
    `- bu tur taranan: ${meta.lastCandidates}`,
    `- toplam taranan: ${meta.totalCandidates}`,
    `- benzersiz kombinasyon: ${meta.lastUniqueCandidates} (bu tur) / ${meta.totalUniqueCandidates} (toplam)`,
    `- trial / aday: ${meta.runConfig.trialCount}`,
    `- beam genisligi: ${meta.runConfig.beamWidth}`,
    `- genis arama adaylari: ${meta.runConfig.exploratoryCandidateCount || "-"}`,
    `- exact tarama limiti: ${meta.runConfig.exhaustiveCandidateLimit || 0}`,
    `- elit aday: ${meta.runConfig.eliteCount}`,
    `- stabilite testi: ${meta.runConfig.stabilityTrials}`,
    `- bu basista savas kosusu: ${meta.batchSimulationRuns || result.simulationRuns}`
  ];

  let summaryLines;
  if (!source) {
    summaryLines = [
      "======================  OPTIMIZER  SONUCU  ======================",
      `>> ${stage}. kademe icin gecerli bir aday uretilemedi.`,
      `- puan limiti: ${maxPoints}`,
      `- neden: ${getConstraintIssueMessage(result?.constraintIssue)}`,
      ...progressLines
    ];
    renderStyledLines(summaryLines, summaryBlock);

    optimizerSummary.innerHTML = "";
    optimizerSummary.appendChild(summaryBlock);
    recommendationPanel.innerHTML = '<p class="summary-empty">Bu kosullarda simulasyona acilacak bir dizilim uretilemedi.</p>';
    optimizerLogOutput.textContent = "Gecerli bir aday uretilemedigi icin savas gunlugu hazirlanmadi.";
    currentApprovedCandidate = {
      stage,
      mode: meta.mode,
      objective: meta.objective,
      diversityMode: meta.diversityMode,
      stoneMode: meta.stoneMode,
      searchBandSettings: normalizeSearchBandSettings(meta.searchBandSettings),
      enemyCounts: collectCounts(ENEMY_UNITS),
      allyPool: collectCounts(ALLY_UNITS),
      minimumRequiredCounts: collectMinimumRequiredCounts(),
      result
    };
    currentTopResultsContext = {
      stage,
      maxPoints,
      mode: meta.mode,
      objective: meta.objective,
      diversityMode: meta.diversityMode,
      stoneMode: meta.stoneMode,
      searchBandSettings: normalizeSearchBandSettings(meta.searchBandSettings),
      enemyCounts: collectCounts(ENEMY_UNITS),
      candidates: [],
      benchmarkedCandidates: null,
      benchmarkPromise: null
    };
    currentTopResultsSort = "default";
    topResultsBtn.disabled = true;
    currentWrongCandidate = null;
    reportWrongOptimizerBtn.disabled = true;
    renderMatchedActualReport();
    renderComparisonPanel();
    renderFavoriteButtonState();
    syncAdminRestrictedActions();
    if (!favoriteStrategiesModal?.hidden) {
      renderFavoriteStrategiesModal();
    }
    return;
  }

  if (result.possible) {
    const recommendation = result.recommendation;
    summaryLines = [
      "======================  OPTIMIZER  SONUCU  ======================",
      `>> ${stage}. kademede bu savas kazanilabilir.`,
      `- puan limiti: ${maxPoints}`,
      `- beklenen kazanma orani: %${Math.round(recommendation.winRate * 100)}`,
      `- ${lossLabel}: ${Math.round(getDisplayedLossValue(recommendation))}`,
      `- kullanilan puan: ${Math.round(recommendation.avgUsedPoints)}`,
      ...(meta.stoneMode ? [`- ortalama tas ihtiyaci: ${formatMetricValue(getDisplayedStoneCount(source))}`] : []),
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
  const battleView = result.sampleBattle?.logText
    ? renderBattleLog(result.sampleBattle.logText)
    : {
        summaryText: "======================  ORNEK  SAVAS  ======================\n  (ornek savas gunlugu uretilemedi)",
        logText: "Ornek savas gunlugu uretilemedi."
      };

  currentApprovedCandidate = {
    stage,
    mode: meta.mode,
    objective: meta.objective,
    diversityMode: meta.diversityMode,
    stoneMode: meta.stoneMode,
    searchBandSettings: normalizeSearchBandSettings(meta.searchBandSettings),
    enemyCounts,
    allyPool,
    minimumRequiredCounts: collectMinimumRequiredCounts(),
    result,
    battleView
  };
  syncAdminRestrictedActions();
  currentTopResultsContext = {
    stage,
    maxPoints,
    mode: meta.mode,
    objective: meta.objective,
    diversityMode: meta.diversityMode,
    stoneMode: meta.stoneMode,
    searchBandSettings: normalizeSearchBandSettings(meta.searchBandSettings),
    enemyCounts,
    candidates: buildDisplayedTopCandidates(result),
    benchmarkedCandidates: null,
    benchmarkPromise: null
  };
  currentTopResultsSort = "default";
  topResultsBtn.disabled = !currentTopResultsContext.candidates.length;
  currentWrongCandidate = createWrongReportEntry(result, stage, maxPoints, meta, battleView.summaryText, battleView.logText);
  reportWrongOptimizerBtn.disabled = false;
  renderMatchedActualReport();
  renderComparisonPanel();
  renderFavoriteButtonState();
  if (!favoriteStrategiesModal?.hidden) {
    renderFavoriteStrategiesModal();
  }
}

function getConstraintIssueMessage(issue) {
  if (issue === "minimum-exceeds-pool") {
    return "Min kullanim kisiti eldeki ordudan buyuk.";
  }
  if (issue === "minimum-exceeds-points") {
    return "Min kullanim puani kademe limitini asiyor.";
  }
  if (issue === "minimum-used-points-exceeds-band") {
    return "Secilen arama bandi min puan ihtiyaci ile uyusmuyor.";
  }
  if (issue === "minimum-used-points-exceeds-limit") {
    return "Min puan ihtiyaci kademe limitini asiyor.";
  }
  if (issue === "minimum-used-points-exceeds-pool") {
    return "Eldeki ordu min puan kosulunu saglayamiyor.";
  }
  return "Gecerli sonuc uretilemedi.";
}

function cacheComparisonResult(stage, enemyCounts, allyPool, maxPoints, result, meta) {
  const source = getPrimaryOptimizerSource(result);
  if (!source) {
    return;
  }

  const minimumRequiredCounts = collectMinimumRequiredCounts();
  const searchBandSettings = collectSearchBandSettings();
  const key = createComparisonKey(stage, enemyCounts, allyPool, minimumRequiredCounts, searchBandSettings, meta.mode, meta.objective, meta.stoneMode);
  const entry = optimizerComparisonCache.get(key) || {
    key,
    stage,
    mode: meta.mode,
    objective: meta.objective,
    stoneMode: meta.stoneMode,
    maxPoints,
    enemyCounts: { ...enemyCounts },
    allyPool: { ...allyPool },
    minimumRequiredCounts: { ...minimumRequiredCounts },
    searchBandSettings: { ...searchBandSettings },
    benchmark: null,
    normal: null,
    diverse: null
  };

  const lane = meta.diversityMode ? "diverse" : "normal";
  const nextSnapshot = createComparisonSnapshot(source, meta);
  entry.stage = stage;
  entry.mode = meta.mode;
  entry.objective = meta.objective;
  entry.stoneMode = meta.stoneMode;
  entry.maxPoints = maxPoints;
  entry.enemyCounts = { ...enemyCounts };
  entry.allyPool = { ...allyPool };
  entry.minimumRequiredCounts = { ...minimumRequiredCounts };
  entry.searchBandSettings = { ...searchBandSettings };
  if (!areComparisonSnapshotsEqual(entry[lane], nextSnapshot)) {
    entry.benchmark = null;
  }
  entry[lane] = nextSnapshot;
  optimizerComparisonCache.set(key, entry);
}

function createComparisonSnapshot(source, meta) {
  return {
    label: meta.diversityMode ? "Cesitlilik" : "Standart",
    modeLabel: getModeLabel(meta.mode, meta.objective, meta.diversityMode, meta.stoneMode),
    feasible: Boolean(source.feasible),
    winRate: source.winRate || 0,
    expectedLostBlood: Number.isFinite(source.expectedLostBlood) ? source.expectedLostBlood : null,
    expectedLostUnits: Number.isFinite(source.expectedLostUnits) ? source.expectedLostUnits : null,
    avgLostBlood: Number.isFinite(source.avgLostBlood) ? source.avgLostBlood : null,
    expectedStoneAdjustedLostBlood: Number.isFinite(source.expectedStoneAdjustedLostBlood) ? source.expectedStoneAdjustedLostBlood : null,
    expectedStoneAdjustedLostUnits: Number.isFinite(source.expectedStoneAdjustedLostUnits) ? source.expectedStoneAdjustedLostUnits : null,
    avgStoneAdjustedLostBlood: Number.isFinite(source.avgStoneAdjustedLostBlood) ? source.avgStoneAdjustedLostBlood : null,
    avgStoneAdjustedLostUnits: Number.isFinite(source.avgStoneAdjustedLostUnits) ? source.avgStoneAdjustedLostUnits : null,
    expectedStoneCount: source.expectedStoneCount || 0,
    avgStoneCount: source.avgStoneCount || 0,
    avgUsedPoints: source.avgUsedPoints || 0,
    avgUsedCapacity: source.avgUsedCapacity || 0,
    avgEnemyRemainingHealth: source.avgEnemyRemainingHealth || 0,
    avgEnemyRemainingUnits: source.avgEnemyRemainingUnits || 0,
    expectedAllyLosses: { ...(source.expectedAllyLosses || {}) },
    expectedStoneAdjustedAllyLosses: { ...(source.expectedStoneAdjustedAllyLosses || {}) },
    avgAllyLosses: { ...(source.avgAllyLosses || {}) },
    avgStoneAdjustedAllyLosses: { ...(source.avgStoneAdjustedAllyLosses || {}) },
    objective: meta.objective,
    stoneMode: Boolean(meta.stoneMode),
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
  const minimumRequiredCounts = collectMinimumRequiredCounts();
  const searchBandSettings = normalizeSearchBandSettings({
    mode: optimizerSearchBandPresetInput?.value,
    minPercent: optimizerCustomBandMinInput?.value,
    maxPercent: optimizerCustomBandMaxInput?.value
  });
  const key = createComparisonKey(stage, enemyCounts, allyPool, minimumRequiredCounts, searchBandSettings, optimizerMode, optimizerObjective, optimizerStoneMode);
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
    if (left.winRate !== right.winRate) {
      return right.winRate - left.winRate;
    }
    const objective = normalizeOptimizerObjective(left.objective || right.objective);
    if (objective === "min_army") {
      if (left.avgUsedPoints !== right.avgUsedPoints) {
        return left.avgUsedPoints - right.avgUsedPoints;
      }
      if ((getDisplayedLossValue(left) ?? Number.POSITIVE_INFINITY) !== (getDisplayedLossValue(right) ?? Number.POSITIVE_INFINITY)) {
        return (getDisplayedLossValue(left) ?? Number.POSITIVE_INFINITY) - (getDisplayedLossValue(right) ?? Number.POSITIVE_INFINITY);
      }
    } else if (objective === "safe_win") {
      if ((getDisplayedLossValue(left) ?? Number.POSITIVE_INFINITY) !== (getDisplayedLossValue(right) ?? Number.POSITIVE_INFINITY)) {
        return (getDisplayedLossValue(left) ?? Number.POSITIVE_INFINITY) - (getDisplayedLossValue(right) ?? Number.POSITIVE_INFINITY);
      }
      if (left.avgUsedPoints !== right.avgUsedPoints) {
        return right.avgUsedPoints - left.avgUsedPoints;
      }
    } else {
      if ((getDisplayedLossValue(left) ?? Number.POSITIVE_INFINITY) !== (getDisplayedLossValue(right) ?? Number.POSITIVE_INFINITY)) {
        return (getDisplayedLossValue(left) ?? Number.POSITIVE_INFINITY) - (getDisplayedLossValue(right) ?? Number.POSITIVE_INFINITY);
      }
      if (left.avgUsedPoints !== right.avgUsedPoints) {
        return left.avgUsedPoints - right.avgUsedPoints;
      }
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
  const normalLoss = getDisplayedLossValue(benchmark.normal);
  const diverseLoss = getDisplayedLossValue(benchmark.diverse);
  const bloodDiff = Number.isFinite(normalLoss) && Number.isFinite(diverseLoss)
    ? Math.round(Math.abs(normalLoss - diverseLoss))
    : null;
  const pointsDiff = Math.abs(Math.round(benchmark.normal.avgUsedPoints) - Math.round(benchmark.diverse.avgUsedPoints));

  [
    ["Daha iyi sonuc", winner.label],
    [getLossMetricLabel(entry.stoneMode) + " farki", bloodDiff === null ? "Kiyas yok" : `${bloodDiff}`],
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
    [getLossMetricLabel(snapshot.stoneMode), snapshot.feasible && Number.isFinite(getDisplayedLossValue(snapshot)) ? `${Math.round(getDisplayedLossValue(snapshot))}` : "Kazanis yok"],
    ["Puan", `${Math.round(snapshot.avgUsedPoints)} / ${maxPoints}`],
    ["Kullanilan birlik", `${getSelectedUnitCount(snapshot)}`]
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    item.innerHTML = `${label}: <strong>${value}</strong>`;
    meta.appendChild(item);
  });

  const list = buildTopResultUnitList(snapshot.counts, { expectedLosses: getDisplayedLossBreakdownSource(snapshot) });
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
  let totalLostBloodSum = 0;
  let totalLostUnitsSum = 0;
  let totalLostBloodSquaredSum = 0;
  let lostBloodSum = 0;
  let lostUnitsSum = 0;
  let totalStoneAdjustedLostBloodSum = 0;
  let totalStoneAdjustedLostUnitsSum = 0;
  let totalStoneCountSum = 0;
  let totalStoneAdjustedLostBloodSquaredSum = 0;
  let stoneAdjustedLostBloodSum = 0;
  let stoneAdjustedLostUnitsSum = 0;
  let stoneCountSum = 0;
  let usedCapacitySum = 0;
  let usedPointsSum = 0;
  let enemyRemainingHealthSum = 0;
  let enemyRemainingUnitsSum = 0;
  let minLostBlood = Number.POSITIVE_INFINITY;
  let maxLostBlood = Number.NEGATIVE_INFINITY;
  let minStoneAdjustedLostBlood = Number.POSITIVE_INFINITY;
  let maxStoneAdjustedLostBlood = Number.NEGATIVE_INFINITY;
  const totalAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const totalStoneAdjustedAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const allyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const stoneAdjustedAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));

  seeds.forEach((seed) => {
    const result = simulateBattle(enemyCounts, snapshot.counts, { seed, collectLog: false });
    usedCapacitySum += result.usedCapacity;
    usedPointsSum += result.usedPoints;
    enemyRemainingHealthSum += result.enemyRemainingHealth;
    enemyRemainingUnitsSum += result.enemyRemainingUnits;
    totalLostBloodSum += result.lostBloodTotal;
    totalLostUnitsSum += result.lostUnitsTotal;
    totalLostBloodSquaredSum += result.lostBloodTotal * result.lostBloodTotal;
    const stoneProfile = getStoneAdjustedLossProfile(result.allyLosses || {});
    totalStoneAdjustedLostBloodSum += stoneProfile.permanentLostBlood;
    totalStoneAdjustedLostUnitsSum += stoneProfile.permanentLostUnits;
    totalStoneCountSum += stoneProfile.stoneCount;
    totalStoneAdjustedLostBloodSquaredSum += stoneProfile.permanentLostBlood * stoneProfile.permanentLostBlood;
    minLostBlood = Math.min(minLostBlood, result.lostBloodTotal);
    maxLostBlood = Math.max(maxLostBlood, result.lostBloodTotal);
    minStoneAdjustedLostBlood = Math.min(minStoneAdjustedLostBlood, stoneProfile.permanentLostBlood);
    maxStoneAdjustedLostBlood = Math.max(maxStoneAdjustedLostBlood, stoneProfile.permanentLostBlood);
    ALLY_UNITS.forEach((unit) => {
      totalAllyLossesSum[unit.key] += result.allyLosses?.[unit.key] || 0;
      totalStoneAdjustedAllyLossesSum[unit.key] += stoneProfile.permanentLossesByKey[unit.key] || 0;
    });
    if (result.winner === "ally") {
      wins += 1;
      lostBloodSum += result.lostBloodTotal;
      lostUnitsSum += result.lostUnitsTotal;
      stoneAdjustedLostBloodSum += stoneProfile.permanentLostBlood;
      stoneAdjustedLostUnitsSum += stoneProfile.permanentLostUnits;
      stoneCountSum += stoneProfile.stoneCount;
      ALLY_UNITS.forEach((unit) => {
        allyLossesSum[unit.key] += result.allyLosses?.[unit.key] || 0;
        stoneAdjustedAllyLossesSum[unit.key] += stoneProfile.permanentLossesByKey[unit.key] || 0;
      });
    }
  });

  const winRate = wins / seeds.length;
  const expectedLostBlood = totalLostBloodSum / seeds.length;
  const expectedStoneAdjustedLostBlood = totalStoneAdjustedLostBloodSum / seeds.length;
  const expectedLostBloodVariance = Math.max(0, totalLostBloodSquaredSum / seeds.length - expectedLostBlood * expectedLostBlood);
  const expectedStoneAdjustedLostBloodVariance = Math.max(
    0,
    totalStoneAdjustedLostBloodSquaredSum / seeds.length - expectedStoneAdjustedLostBlood * expectedStoneAdjustedLostBlood
  );
  return {
    ...snapshot,
    trials: seeds.length,
    wins,
    winRate,
    feasible: winRate >= 0.75,
    expectedLostBlood,
    expectedLostUnits: totalLostUnitsSum / seeds.length,
    avgLostBlood: wins > 0 ? lostBloodSum / wins : null,
    avgLostUnits: wins > 0 ? lostUnitsSum / wins : null,
    expectedLostBloodVariance,
    minLostBlood: Number.isFinite(minLostBlood) ? minLostBlood : null,
    maxLostBlood: Number.isFinite(maxLostBlood) ? maxLostBlood : null,
    expectedStoneAdjustedLostBlood,
    expectedStoneAdjustedLostUnits: totalStoneAdjustedLostUnitsSum / seeds.length,
    avgStoneAdjustedLostBlood: wins > 0 ? stoneAdjustedLostBloodSum / wins : null,
    avgStoneAdjustedLostUnits: wins > 0 ? stoneAdjustedLostUnitsSum / wins : null,
    expectedStoneAdjustedLostBloodVariance,
    minStoneAdjustedLostBlood: Number.isFinite(minStoneAdjustedLostBlood) ? minStoneAdjustedLostBlood : null,
    maxStoneAdjustedLostBlood: Number.isFinite(maxStoneAdjustedLostBlood) ? maxStoneAdjustedLostBlood : null,
    expectedStoneCount: totalStoneCountSum / seeds.length,
    avgStoneCount: wins > 0 ? stoneCountSum / wins : 0,
    avgUsedCapacity: usedCapacitySum / seeds.length,
    avgUsedPoints: usedPointsSum / seeds.length,
    avgEnemyRemainingHealth: enemyRemainingHealthSum / seeds.length,
    avgEnemyRemainingUnits: enemyRemainingUnitsSum / seeds.length,
    expectedAllyLosses: Object.fromEntries(
      ALLY_UNITS.map((unit) => [unit.key, totalAllyLossesSum[unit.key] / seeds.length])
    ),
    expectedStoneAdjustedAllyLosses: Object.fromEntries(
      ALLY_UNITS.map((unit) => [unit.key, totalStoneAdjustedAllyLossesSum[unit.key] / seeds.length])
    ),
    avgAllyLosses: Object.fromEntries(
      ALLY_UNITS.map((unit) => [unit.key, wins > 0 ? allyLossesSum[unit.key] / wins : 0])
    ),
    avgStoneAdjustedAllyLosses: Object.fromEntries(
      ALLY_UNITS.map((unit) => [unit.key, wins > 0 ? stoneAdjustedAllyLossesSum[unit.key] / wins : 0])
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

function getDisplayedLossValue(entry) {
  if (!entry) {
    return Number.POSITIVE_INFINITY;
  }
  const stoneMode = Boolean(entry.stoneMode);
  const value = stoneMode
    ? (entry.expectedStoneAdjustedLostBlood ?? entry.avgStoneAdjustedLostBlood)
    : (entry.expectedLostBlood ?? entry.avgLostBlood);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getDisplayedLossUnits(entry) {
  if (!entry) {
    return Number.POSITIVE_INFINITY;
  }
  const stoneMode = Boolean(entry.stoneMode);
  const value = stoneMode
    ? (entry.expectedStoneAdjustedLostUnits ?? entry.avgStoneAdjustedLostUnits)
    : (entry.expectedLostUnits ?? entry.avgLostUnits);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getDisplayedLossBreakdownSource(entry) {
  return entry?.stoneMode
    ? (entry.expectedStoneAdjustedAllyLosses || entry.avgStoneAdjustedAllyLosses || {})
    : (entry?.expectedAllyLosses || entry?.avgAllyLosses || {});
}

function getDisplayedLossRange(entry) {
  if (!entry) {
    return { min: null, max: null };
  }
  return entry.stoneMode
    ? {
        min: Number.isFinite(entry.minStoneAdjustedLostBlood) ? entry.minStoneAdjustedLostBlood : null,
        max: Number.isFinite(entry.maxStoneAdjustedLostBlood) ? entry.maxStoneAdjustedLostBlood : null
      }
    : {
        min: Number.isFinite(entry.minLostBlood) ? entry.minLostBlood : null,
        max: Number.isFinite(entry.maxLostBlood) ? entry.maxLostBlood : null
      };
}

function getDisplayedLossVariance(entry) {
  if (!entry) {
    return null;
  }
  const value = entry.stoneMode
    ? entry.expectedStoneAdjustedLostBloodVariance
    : entry.expectedLostBloodVariance;
  return Number.isFinite(value) ? value : null;
}

function getDisplayedLossStdDev(entry) {
  const variance = getDisplayedLossVariance(entry);
  return Number.isFinite(variance) ? Math.sqrt(Math.max(0, variance)) : null;
}

function getDisplayedStoneCount(entry) {
  const value = entry?.expectedStoneCount ?? entry?.avgStoneCount;
  return Number.isFinite(value) ? value : 0;
}

function getLossMetricLabel(stoneMode) {
  return stoneMode ? "Tas sonrasi kalici kayip" : "Ortalama kan kaybi";
}

function formatMetricValue(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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
    if (left.winRate !== right.winRate) {
      return right.winRate - left.winRate;
    }
    const objective = normalizeOptimizerObjective(left.objective || right.objective);
    if (objective === "min_army") {
      if (left.avgUsedPoints !== right.avgUsedPoints) {
        return left.avgUsedPoints - right.avgUsedPoints;
      }
      if (getDisplayedLossValue(left) !== getDisplayedLossValue(right)) {
        return getDisplayedLossValue(left) - getDisplayedLossValue(right);
      }
    } else if (objective === "safe_win") {
      if (getDisplayedLossValue(left) !== getDisplayedLossValue(right)) {
        return getDisplayedLossValue(left) - getDisplayedLossValue(right);
      }
      if (left.avgUsedPoints !== right.avgUsedPoints) {
        return right.avgUsedPoints - left.avgUsedPoints;
      }
    } else {
      if (getDisplayedLossValue(left) !== getDisplayedLossValue(right)) {
        return getDisplayedLossValue(left) - getDisplayedLossValue(right);
      }
      if (left.avgUsedPoints !== right.avgUsedPoints) {
        return left.avgUsedPoints - right.avgUsedPoints;
      }
    }
    if (left.avgUsedCapacity !== right.avgUsedCapacity) {
      return left.avgUsedCapacity - right.avgUsedCapacity;
    }
    if (getDisplayedLossUnits(left) !== getDisplayedLossUnits(right)) {
      return getDisplayedLossUnits(left) - getDisplayedLossUnits(right);
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
  const avgLosses = getDisplayedLossBreakdownSource(entry);
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

function getRoundedLossBreakdown(entry) {
  return Object.fromEntries(
    ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Math.round(getDisplayedLossBreakdownSource(entry)[unit.key] || 0))])
  );
}

function getSelectedUnitCount(entry) {
  return ALLY_UNITS.reduce((sum, unit) => sum + (entry?.counts?.[unit.key] || 0), 0);
}

function getSingularityPattern(entry) {
  return Object.values(getRoundedLossBreakdown(entry))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
}

function compareSingularityPatterns(left, right) {
  const minLength = Math.min(left.length, right.length);
  for (let index = 0; index < minLength; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return left.length - right.length;
}

function compareTopResultsBySortMode(left, right, sortMode = "default") {
  if (sortMode === "units") {
    if (left.feasible !== right.feasible) {
      return left.feasible ? -1 : 1;
    }
    const unitDelta = getSelectedUnitCount(left) - getSelectedUnitCount(right);
    if (unitDelta !== 0) {
      return unitDelta;
    }
    const bloodDelta = getDisplayedLossValue(left) - getDisplayedLossValue(right);
    if (bloodDelta !== 0) {
      return bloodDelta;
    }
    return compareOptimizerCandidates(left, right);
  }

  if (sortMode === "blood") {
    if (left.feasible !== right.feasible) {
      return left.feasible ? -1 : 1;
    }
    const bloodDelta = getDisplayedLossValue(left) - getDisplayedLossValue(right);
    if (bloodDelta !== 0) {
      return bloodDelta;
    }
    const unitDelta = getSelectedUnitCount(left) - getSelectedUnitCount(right);
    if (unitDelta !== 0) {
      return unitDelta;
    }
    return compareOptimizerCandidates(left, right);
  }

  if (sortMode === "singularity") {
    if (left.feasible !== right.feasible) {
      return left.feasible ? -1 : 1;
    }
    const patternDelta = compareSingularityPatterns(getSingularityPattern(left), getSingularityPattern(right));
    if (patternDelta !== 0) {
      return patternDelta;
    }
    const unitDelta = getSelectedUnitCount(left) - getSelectedUnitCount(right);
    if (unitDelta !== 0) {
      return unitDelta;
    }
    const bloodDelta = getDisplayedLossValue(left) - getDisplayedLossValue(right);
    if (bloodDelta !== 0) {
      return bloodDelta;
    }
    return compareOptimizerCandidates(left, right);
  }

  return 0;
}

function getSortedTopResultEntries() {
  const defaultSource = currentTopResultsContext?.candidates || [];
  const benchmarkedSource = currentTopResultsContext?.benchmarkedCandidates || [];
  if (!defaultSource.length) {
    return [];
  }

  if (currentTopResultsSort === "default") {
    const benchmarkedBySignature = new Map(
      benchmarkedSource.map((entry) => [getOptimizerCandidateSignature(entry), entry])
    );
    return defaultSource.map((entry, sourceIndex) => ({
      entry: benchmarkedBySignature.get(getOptimizerCandidateSignature(entry)) || entry,
      sourceIndex
    }));
  }

  return benchmarkedSource
    .map((entry, sourceIndex) => ({ entry, sourceIndex }))
    .sort((left, right) => {
      const compare = compareTopResultsBySortMode(left.entry, right.entry, currentTopResultsSort);
      if (compare !== 0) {
        return compare;
      }
      return left.sourceIndex - right.sourceIndex;
    });
}

function getRoundedSingularityProfile(entry) {
  const roundedLosses = getRoundedLossBreakdown(entry);
  const stoneProfile = getStoneAdjustedLossProfile(roundedLosses);
  return {
    roundedLosses,
    stoneCount: stoneProfile.stoneCount,
    permanentLostUnits: stoneProfile.permanentLostUnits,
    permanentLostBlood: stoneProfile.permanentLostBlood,
    revivedUnits: stoneProfile.revivedUnits
  };
}

function getSingularityFocusMetrics(entry) {
  const profile = getRoundedSingularityProfile(entry);
  const roundedMetrics = getRoundedLossMetrics(entry);
  return {
    selectedUnits: getSelectedUnitCount(entry),
    permanentLostBlood: profile.permanentLostBlood,
    permanentLostUnits: profile.permanentLostUnits,
    stoneCount: profile.stoneCount,
    repeatedOverflow: roundedMetrics.repeatedOverflow,
    maxRepeatedStack: roundedMetrics.maxRepeatedStack,
    singletonTypes: roundedMetrics.singletonTypes
  };
}

function normalizeMetric(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0;
  }
  return (value - min) / (max - min);
}

function dominatesSingularityCandidate(left, right) {
  const leftMetrics = getSingularityFocusMetrics(left);
  const rightMetrics = getSingularityFocusMetrics(right);
  const noWorse =
    leftMetrics.selectedUnits <= rightMetrics.selectedUnits &&
    leftMetrics.permanentLostBlood <= rightMetrics.permanentLostBlood &&
    leftMetrics.permanentLostUnits <= rightMetrics.permanentLostUnits &&
    leftMetrics.repeatedOverflow <= rightMetrics.repeatedOverflow;
  const strictlyBetter =
    leftMetrics.selectedUnits < rightMetrics.selectedUnits ||
    leftMetrics.permanentLostBlood < rightMetrics.permanentLostBlood ||
    leftMetrics.permanentLostUnits < rightMetrics.permanentLostUnits ||
    leftMetrics.repeatedOverflow < rightMetrics.repeatedOverflow;
  return noWorse && strictlyBetter;
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

function compareSingularityFocusedCandidates(left, right) {
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }

  if (left.feasible) {
    const leftUsedUnits = getSelectedUnitCount(left);
    const rightUsedUnits = getSelectedUnitCount(right);
    if (leftUsedUnits !== rightUsedUnits) {
      return leftUsedUnits - rightUsedUnits;
    }

    const leftProfile = getRoundedSingularityProfile(left);
    const rightProfile = getRoundedSingularityProfile(right);

    if (leftProfile.permanentLostBlood !== rightProfile.permanentLostBlood) {
      return leftProfile.permanentLostBlood - rightProfile.permanentLostBlood;
    }
    if (leftProfile.permanentLostUnits !== rightProfile.permanentLostUnits) {
      return leftProfile.permanentLostUnits - rightProfile.permanentLostUnits;
    }
    if (leftProfile.stoneCount !== rightProfile.stoneCount) {
      return leftProfile.stoneCount - rightProfile.stoneCount;
    }

    const leftMetrics = getRoundedLossMetrics(left);
    const rightMetrics = getRoundedLossMetrics(right);

    if (leftMetrics.repeatedOverflow !== rightMetrics.repeatedOverflow) {
      return leftMetrics.repeatedOverflow - rightMetrics.repeatedOverflow;
    }
    if (leftMetrics.maxRepeatedStack !== rightMetrics.maxRepeatedStack) {
      return leftMetrics.maxRepeatedStack - rightMetrics.maxRepeatedStack;
    }
    if (leftMetrics.repeatedTypes !== rightMetrics.repeatedTypes) {
      return leftMetrics.repeatedTypes - rightMetrics.repeatedTypes;
    }
    if (leftMetrics.singletonTypes !== rightMetrics.singletonTypes) {
      return rightMetrics.singletonTypes - leftMetrics.singletonTypes;
    }
  }

  return compareAlternativeTopCandidates(left, right);
}

function compareSingularitySlotCandidates(left, right) {
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }

  const leftProfile = getRoundedSingularityProfile(left);
  const rightProfile = getRoundedSingularityProfile(right);

  if (leftProfile.permanentLostUnits !== rightProfile.permanentLostUnits) {
    return leftProfile.permanentLostUnits - rightProfile.permanentLostUnits;
  }
  if (leftProfile.permanentLostBlood !== rightProfile.permanentLostBlood) {
    return leftProfile.permanentLostBlood - rightProfile.permanentLostBlood;
  }

  const leftSelectedUnits = getSelectedUnitCount(left);
  const rightSelectedUnits = getSelectedUnitCount(right);
  if (leftSelectedUnits !== rightSelectedUnits) {
    return leftSelectedUnits - rightSelectedUnits;
  }

  const leftDisplayedLoss = getDisplayedLossValue(left);
  const rightDisplayedLoss = getDisplayedLossValue(right);
  if (leftDisplayedLoss !== rightDisplayedLoss) {
    return leftDisplayedLoss - rightDisplayedLoss;
  }

  const leftRounded = getRoundedLossMetrics(left);
  const rightRounded = getRoundedLossMetrics(right);
  if (leftRounded.repeatedOverflow !== rightRounded.repeatedOverflow) {
    return leftRounded.repeatedOverflow - rightRounded.repeatedOverflow;
  }
  if (leftRounded.maxRepeatedStack !== rightRounded.maxRepeatedStack) {
    return leftRounded.maxRepeatedStack - rightRounded.maxRepeatedStack;
  }
  if (leftRounded.singletonTypes !== rightRounded.singletonTypes) {
    return rightRounded.singletonTypes - leftRounded.singletonTypes;
  }
  if (leftRounded.roundedBloodLoss !== rightRounded.roundedBloodLoss) {
    return leftRounded.roundedBloodLoss - rightRounded.roundedBloodLoss;
  }

  return compareSingularityFocusedCandidates(left, right);
}

function chooseSingularityFocusedCandidate(alternatives) {
  if (!alternatives.length) {
    return null;
  }

  const pool = alternatives.filter((entry) => entry.feasible);
  const source = pool.length ? pool : alternatives;
  return [...source].sort(compareSingularitySlotCandidates)[0] || null;
}

function buildDisplayedTopCandidates(result) {
  const primary = getPrimaryOptimizerSource(result);
  const ranked = mergeOptimizerCandidates(primary ? [primary] : [], result.topCandidates || [], { limit: 120 });
  if (!primary) {
    return ranked.slice(0, 6);
  }

  const primarySignature = getOptimizerCandidateSignature(primary);
  const alternatives = ranked
    .filter((entry) => getOptimizerCandidateSignature(entry) !== primarySignature);

  const sortedAlternatives = [...alternatives].sort((left, right) => {
    const compare = compareTopResultsBySortMode(left, right, "blood");
    if (compare !== 0) {
      return compare;
    }
    return compareOptimizerCandidates(left, right);
  });
  const singularityCandidate = chooseSingularityFocusedCandidate(alternatives);
  const singularitySignature = singularityCandidate ? getOptimizerCandidateSignature(singularityCandidate) : "";
  const displayAlternatives = sortedAlternatives
    .filter((entry) => getOptimizerCandidateSignature(entry) !== singularitySignature)
    .slice(0, singularityCandidate ? 4 : 5);

  if (singularityCandidate) {
    displayAlternatives.push({
      ...singularityCandidate,
      specialFocus: "singleton",
      specialFocusLabel: "Az birlik + tekillik odakli aday",
      specialFocusBadge: "Az birlik"
    });
  }

  return [
    {
      ...primary,
      signature: primarySignature
    },
    ...displayAlternatives
  ].slice(0, 6);
}

function getTopResultsBenchmarkSeeds() {
  return Array.from({ length: TOP_RESULTS_BENCHMARK_SAMPLE_COUNT }, (_, index) => index + 1);
}

function compareTopResultEntriesByBlood(left, right) {
  const compare = compareTopResultsBySortMode(left, right, "blood");
  if (compare !== 0) {
    return compare;
  }
  return compareOptimizerCandidates(left, right);
}

function normalizeScoreValue(value, min, max, options = {}) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 1;
  }
  const ratio = (value - min) / (max - min);
  return options.invert ? 1 - ratio : ratio;
}

function attachTopResultSmartScores(entries) {
  if (!entries.length) {
    return entries;
  }

  const winRates = entries.map((entry) => entry.winRate || 0);
  const losses = entries.map((entry) => getDisplayedLossValue(entry));
  const risks = entries.map((entry) => getDisplayedLossStdDev(entry) ?? 0);
  const minWinRate = Math.min(...winRates);
  const maxWinRate = Math.max(...winRates);
  const minLoss = Math.min(...losses);
  const maxLoss = Math.max(...losses);
  const minRisk = Math.min(...risks);
  const maxRisk = Math.max(...risks);

  return entries.map((entry) => {
    const winComponent = normalizeScoreValue(entry.winRate || 0, minWinRate, maxWinRate);
    const lossComponent = normalizeScoreValue(getDisplayedLossValue(entry), minLoss, maxLoss, { invert: true });
    const riskComponent = normalizeScoreValue(getDisplayedLossStdDev(entry) ?? 0, minRisk, maxRisk, { invert: true });
    const smartScore = (winComponent * 0.45 + lossComponent * 0.4 + riskComponent * 0.15) * 100;
    return {
      ...entry,
      smartScore
    };
  });
}

async function ensureTopResultsBenchmarked() {
  const context = currentTopResultsContext;
  if (!context || !context.candidates.length || context.benchmarkedCandidates) {
    return;
  }

  if (context.benchmarkPromise) {
    await context.benchmarkPromise;
    return;
  }

  context.benchmarkPromise = Promise.resolve().then(() => {
    const seeds = getTopResultsBenchmarkSeeds();
    context.benchmarkedCandidates = attachTopResultSmartScores(context.candidates
      .map((entry) => ({
        ...evaluateComparisonSnapshot(context.enemyCounts, entry, seeds),
        signature: getOptimizerCandidateSignature(entry),
        counts: { ...(entry.counts || {}) },
        objective: entry.objective,
        stoneMode: entry.stoneMode,
        specialFocus: entry.specialFocus,
        specialFocusLabel: entry.specialFocusLabel,
        specialFocusBadge: entry.specialFocusBadge
      }))
      .sort(compareTopResultEntriesByBlood));
  }).finally(() => {
    context.benchmarkPromise = null;
    if (context === currentTopResultsContext && !topResultsModal.hidden) {
      renderTopResultsModal();
    }
  });

  await context.benchmarkPromise;
}

function openTopResultsModal() {
  topResultsModal.hidden = false;
  renderTopResultsModal();
  void ensureTopResultsBenchmarked();
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
    ["default", "Varsayilan", "Ana", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v4H5V5zm0 5.5h9v4H5v-4zm0 5.5h14v3H5v-3z"></path></svg>'],
    ["singularity", "Tekillik", "Tek", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.4L20 11l-4 3.9.9 5.6-4.9-2.6-4.9 2.6.9-5.6L4 11l5.4-2.6L12 3z"></path></svg>'],
    ["units", "Kullanilan birlik", "Bir", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 11.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5zm9 0a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM3.5 19a4 4 0 014-4H8a4 4 0 014 4v1H3.5v-1zm8.5 1v-1a4.7 4.7 0 00-1.3-3.2A4 4 0 0114 14h.5a4 4 0 014 4v2H12z"></path></svg>'],
    ["blood", "Kan kaybi", "Kan", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.2 4.1 5.5 6.9 5.5 10A5.5 5.5 0 116.5 13c0-3.1 2.3-5.9 5.5-10zm0 14.5a2.5 2.5 0 002.5-2.5h-5a2.5 2.5 0 002.5 2.5z"></path></svg>']
  ].forEach(([mode, label, shortLabel, icon]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button button-ghost top-results-sort-button${currentTopResultsSort === mode ? " is-active" : ""}`;
    button.innerHTML = `${icon}<span class="top-results-sort-label">${label}</span><span class="top-results-sort-label-short">${shortLabel}</span>`;
    button.setAttribute("aria-pressed", String(currentTopResultsSort === mode));
    button.setAttribute("aria-label", label);
    button.title = label;
    button.addEventListener("click", () => {
      if (currentTopResultsSort === mode) {
        return;
      }
      currentTopResultsSort = mode;
      renderTopResultsModal();
    });
    topResultsMeta.appendChild(button);
  });

  if (!currentTopResultsContext.benchmarkedCandidates) {
    topResultsList.innerHTML = `<div class="variant-loading-state">${TOP_RESULTS_BENCHMARK_SAMPLE_COUNT} sabit seed ile ortalama kayiplar dogrulaniyor...</div>`;
    return;
  }

  getSortedTopResultEntries().forEach(({ entry, sourceIndex }, index) => {
    topResultsList.appendChild(createTopResultCard(entry, index, currentTopResultsContext.maxPoints, {
      isPrimary: currentTopResultsSort === "default" && sourceIndex === 0
    }));
  });
}

function createTopResultCard(entry, index, maxPoints, options = {}) {
  const isPrimary = Boolean(options.isPrimary);
  const card = document.createElement("article");
  card.className = `top-result-card${isPrimary ? " is-primary" : ""}`;

  const head = document.createElement("div");
  head.className = "top-result-head";

  const titleWrap = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = isPrimary ? "Ana sonuc" : `${index + 1}. sonuc`;
  const subtitle = document.createElement("span");
  subtitle.textContent = entry.specialFocusLabel || (entry.feasible ? "Kazanabilir dizilim" : "Kazanamayan ama en yakin alternatif");
  titleWrap.append(title, subtitle);

  const badge = document.createElement("span");
  badge.textContent = entry.specialFocusBadge || (entry.feasible ? "Kazanilir" : "Alternatif");
  head.append(titleWrap, badge);

  const summary = document.createElement("div");
  summary.className = "top-result-summary";

  const summaryStats = entry.feasible
    ? [
        ["Kazanma orani", `%${Math.round(entry.winRate * 100)}`],
        [getLossMetricLabel(entry.stoneMode), `${Math.round(getDisplayedLossValue(entry))}`],
        ["Kullanilan puan", `${Math.round(entry.avgUsedPoints)} / ${maxPoints}`],
        ["Kullanilan birlik", `${getSelectedUnitCount(entry)}`],
        ...(entry.stoneMode ? [["Ortalama tas", formatMetricValue(getDisplayedStoneCount(entry))]] : [])
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
    if (label === getLossMetricLabel(entry.stoneMode) && entry.feasible) {
      stat.classList.add("top-result-stat-loss");
      const headRow = document.createElement("div");
      headRow.className = "top-result-stat-head";
      labelNode.classList.add("top-result-stat-label");
      headRow.appendChild(labelNode);
      const scoreWrap = document.createElement("div");
      scoreWrap.className = "top-result-score-wrap";
      if (Number.isFinite(entry.smartScore)) {
        const scoreNode = document.createElement("span");
        scoreNode.className = "top-result-smart-badge";
        scoreNode.textContent = entry.smartScore.toFixed(1);
        scoreWrap.appendChild(scoreNode);
      }
      scoreWrap.appendChild(createTopResultFavoriteButton(entry));
      headRow.appendChild(scoreWrap);
      stat.appendChild(headRow);
      valueNode.className = "top-result-loss-value-wrap";
      const mainValue = document.createElement("span");
      mainValue.className = "top-result-loss-value";
      mainValue.textContent = value;
      valueNode.appendChild(mainValue);

      const range = getDisplayedLossRange(entry);
      if (Number.isFinite(range.min) && Number.isFinite(range.max)) {
        const rangeNode = document.createElement("span");
        rangeNode.className = "top-result-loss-range";
        rangeNode.textContent = `min ${Math.round(range.min)} / max ${Math.round(range.max)}`;
        valueNode.appendChild(rangeNode);
      }
    } else {
      stat.appendChild(labelNode);
      valueNode.textContent = value;
    }
    stat.appendChild(valueNode);

    if (label === getLossMetricLabel(entry.stoneMode)) {
      const lossNote = document.createElement("small");
      lossNote.className = "top-result-loss-note";
      lossNote.textContent = formatCandidateLossBreakdown(entry);
      stat.appendChild(lossNote);
    }

    summary.appendChild(stat);
  });

  const actions = document.createElement("div");
  actions.className = "top-result-actions";
  if (currentTopResultsContext?.enemyCounts) {
    actions.appendChild(createOpenSimulationButton(
      currentTopResultsContext.enemyCounts,
      entry.counts,
      "Simulasyonda Ac"
    ));
  }
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
    ["Kullanilan birlik", getSelectedUnitCount(entry)],
    ["Ortalama kayip birlik", Number.isFinite(getDisplayedLossUnits(entry)) ? Math.round(getDisplayedLossUnits(entry)) : "-"],
    ["Durum", entry.feasible ? "Kazanabilir" : "Alternatif deneme"],
    ["Yaklasik kayip", formatCandidateLossBreakdown(entry)],
    ...(entry.specialFocus === "singleton"
      ? [["Tekillik sonrasi kalici kayip", formatSingularityFocusSummary(entry)]]
      : []),
    ...(entry.stoneMode ? [["Ortalama tas", formatMetricValue(getDisplayedStoneCount(entry))]] : [])
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
  const avgLosses = getDisplayedLossBreakdownSource(entry);
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

  if (entry?.stoneMode) {
    return `${parts.join(", ")} | ~${formatMetricValue(getDisplayedStoneCount(entry))} tas`;
  }
  return parts.join(", ");
}

function formatSingularityFocusSummary(entry) {
  const profile = getRoundedSingularityProfile(entry);
  return `${profile.permanentLostBlood} kan / ${profile.permanentLostUnits} birlik | ${profile.stoneCount} tas`;
}

function renderRecommendationCards(result, maxPoints, meta) {
  recommendationPanel.innerHTML = "";

  const source = result.possible ? result.recommendation : result.fallback || result.fullArmyEvaluation;
  if (!source) {
    return;
  }

  const stats = [
    ["Kullanilan puan", `${Math.round(source.avgUsedPoints)} / ${maxPoints}`],
    [getLossMetricLabel(meta.stoneMode), result.possible ? `${Math.round(getDisplayedLossValue(source))}` : "Kazanis yok"],
    ["Kazanma orani", `%${Math.round(source.winRate * 100)}`],
    ["Toplam tarama", `${meta.totalCandidates} aday`],
    ...(meta.stoneMode ? [["Ortalama tas", formatMetricValue(getDisplayedStoneCount(source))]] : [])
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

  const listActions = document.createElement("div");
  listActions.className = "recommendation-actions";
  listActions.appendChild(createOpenSimulationButton(
    collectCounts(ENEMY_UNITS),
    source.counts,
    "Simulasyon Ekraninda Ac"
  ));

  const list = buildTopResultUnitList(source.counts, {
    expectedLosses: getDisplayedLossBreakdownSource(source)
  });

  listCard.append(listTitle, listActions, list);
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
  lastOptimizerLogTextTr = outputLines.join("\n");
  paintOptimizerLogPanel();
  return {
    logText: outputLines.join("\n"),
    summaryText: summaryBlockLines.join("\n")
  };
}

let currentOptimizerLogLang = "tr";
let lastOptimizerLogTextTr = "";

function paintOptimizerLogPanel() {
  const translate = (window.BattleCore && window.BattleCore.translateLogText) || ((t) => t);
  const text = translate(lastOptimizerLogTextTr, currentOptimizerLogLang);
  optimizerLogOutput.innerHTML = "";
  if (lastOptimizerLogTextTr) {
    renderStyledLines(text.split("\n"), optimizerLogOutput);
  }
}

if (langToggleOptimizerBtn) {
  langToggleOptimizerBtn.addEventListener("click", () => {
    currentOptimizerLogLang = currentOptimizerLogLang === "tr" ? "en" : "tr";
    langToggleOptimizerBtn.textContent = currentOptimizerLogLang === "tr" ? "EN" : "TR";
    langToggleOptimizerBtn.classList.toggle("is-active", currentOptimizerLogLang === "en");
    langToggleOptimizerBtn.title = currentOptimizerLogLang === "tr" ? "Gunlugu Ingilizceye cevir" : "Switch log to Turkish";
    paintOptimizerLogPanel();
  });
}

syncOptimizerLogFullscreenUi();

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
    stripped.includes("OPTIMIZER  SONUCU") ||
    stripped.includes("ORNEK  SAVAS") ||
    stripped.includes("TUR  TUR  ANALIZ")
  ) {
    return "header";
  }
  if (stripped.includes("yok edildi") || stripped.includes("completely destroyed")) {
    return "destroy";
  }
  if (
    stripped.startsWith("onerilen duzenin") ||
    stripped.startsWith("sample battle log") ||
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
    "Yarasa Surusu", "Gulyabani", "Vampir Kole", "Banshee",
    "Olu Cagirici", "Gargoyle", "Kan Cadisi", "Curuk Girtlak",
    "Bats", "Ghouls", "Thralls", "Banshees",
    "Necromancers", "Gargoyles", "Blood Witches", "Rotmaws"
  ];
  return allyNames.some((name) => line.includes(name));
}

function getSearchModeLabel(mode) {
  if (mode === "fast") {
    return "Hizli";
  }
  if (mode === "deep") {
    return "Derin";
  }
  return "Dengeli";
}

function getObjectiveLabel(objective) {
  const normalizedObjective = normalizeOptimizerObjective(objective);
  if (normalizedObjective === "min_army") {
    return "En Az Orduyla Kazan";
  }
  if (normalizedObjective === "safe_win") {
    return "Daha Guvenli Kazan";
  }
  return "En Az Kayipla Kazan";
}

function getModeLabel(mode, objective = "min_loss", diversityMode = false, stoneMode = false) {
  const parts = [getSearchModeLabel(mode), getObjectiveLabel(objective)];
  if (stoneMode) {
    parts.push("Tasli");
  }
  if (diversityMode) {
    parts.push("Cesitlilik");
  }
  return parts.join(" / ");
}

function getEnemySignature(stage, enemyCounts) {
  return `${stage}|${ENEMY_UNITS.map((unit) => enemyCounts[unit.key] || 0).join("|")}`;
}

function createSavedEntry(candidate) {
  const recommendation = candidate.result.recommendation;
  const sampleBattle = candidate.result.sampleBattle;
  const battleView = candidate.battleView || (sampleBattle?.logText ? renderBattleLog(sampleBattle.logText) : null);
  const enemyTitle = ENEMY_UNITS.filter((unit) => (candidate.enemyCounts[unit.key] || 0) > 0)
    .map((unit) => `${candidate.enemyCounts[unit.key]} ${unit.label}`)
    .slice(0, 2)
    .join(" / ");
  const matchSignature = buildOptimizerMatchSignature(candidate.stage, candidate.enemyCounts, recommendation.counts);

  return {
    source: "simulation",
    sourceLabel: "Optimizer",
    savedAt: new Date().toISOString(),
    stage: candidate.stage,
    enemyTitle: enemyTitle || "Versus",
    enemyCounts: candidate.enemyCounts,
    allyCounts: recommendation.counts,
    matchSignature,
    variantSignature: "optimizer",
    representativeSeed: Number.isInteger(sampleBattle?.seed) ? sampleBattle.seed : undefined,
    variantTitle: "Optimizer Onerisi",
    winner: "ally",
    probabilityBasisPoints: Math.round(recommendation.winRate * 10000),
    summaryText: battleView?.summaryText || "",
    logText: battleView?.logText || "",
    usedCapacity: sampleBattle?.usedCapacity || 0,
    usedPoints: Math.round(recommendation.avgUsedPoints),
    lostBlood: Math.round(getDisplayedLossValue(recommendation))
  };
}

function createWrongReportEntry(result, stage, maxPoints, meta, summaryText, logText) {
  const source = result.possible ? result.recommendation : result.fallback || result.fullArmyEvaluation;
  const sampleBattle = result.sampleBattle || null;
  const enemyCounts = collectCounts(ENEMY_UNITS);
  const allyCounts = collectCounts(ALLY_UNITS);
  return {
    source: "optimizer",
    sourceLabel: "Optimizer",
    reportedAt: new Date().toISOString(),
    stage,
    mode: meta.mode,
    objective: meta.objective,
    diversityMode: Boolean(meta.diversityMode),
    stoneMode: Boolean(meta.stoneMode),
    modeLabel: getModeLabel(meta.mode, meta.objective, meta.diversityMode, meta.stoneMode),
    enemyCounts,
    allyCounts,
    seed: Number.isInteger(sampleBattle?.seed) ? sampleBattle.seed : undefined,
    matchSignature: buildOptimizerMatchSignature(stage, enemyCounts, allyCounts),
    recommendationCounts: source?.counts || null,
    summaryText,
    logText,
    expectedWinner: sampleBattle ? (sampleBattle.winner === "enemy" ? "enemy" : "ally") : undefined,
    expectedLostBlood: Number.isFinite(sampleBattle?.lostBloodTotal) ? Math.round(sampleBattle.lostBloodTotal) : null,
    expectedAllyLosses: sampleBattle?.allyLosses ? { ...sampleBattle.allyLosses } : {},
    expectedUsedCapacity: Number.isFinite(sampleBattle?.usedCapacity) ? Math.round(sampleBattle.usedCapacity) : Math.round(source?.avgUsedCapacity || 0),
    expectedUsedPoints: Number.isFinite(sampleBattle?.usedPoints) ? Math.round(sampleBattle.usedPoints) : Math.round(source?.avgUsedPoints || 0),
    expectedVariantSignature: sampleBattle
      ? JSON.stringify({
        winner: sampleBattle.winner,
        lostBloodTotal: sampleBattle.lostBloodTotal,
        allyLosses: sampleBattle.allyLosses || {}
      })
      : "",
    possible: result.possible,
    usedPoints: source ? Math.round(source.avgUsedPoints || 0) : 0,
    lostBlood: source && Number.isFinite(getDisplayedLossValue(source)) ? Math.round(getDisplayedLossValue(source)) : null,
    winRate: source ? Math.round((source.winRate || 0) * 100) : 0,
    pointLimit: maxPoints,
    usedCapacity: Math.round(source?.avgUsedCapacity || 0)
  };
}

function openWrongReportModal(report) {
  pendingWrongReport = report;
  clearWrongReportError();
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
  clearWrongReportError();
}

function showWrongReportError(error) {
  if (!wrongReportErrorBox) {
    return;
  }
  wrongReportErrorBox.hidden = false;
  wrongReportErrorBox.textContent = String(error?.message || error || "Bilinmeyen hata");
}

function clearWrongReportError() {
  if (!wrongReportErrorBox) {
    return;
  }
  wrongReportErrorBox.hidden = true;
  wrongReportErrorBox.textContent = "";
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

function inferWinnerFromOutcomeLine(outcomeLine) {
  const normalized = String(outcomeLine || "").toLowerCase();
  if (normalized.includes("dusman yenildi") || normalized.includes("enemy defeated")) {
    return "ally";
  }
  if (normalized.includes("muttefikler yenildi") || normalized.includes("allies defeated")) {
    return "enemy";
  }
  return "unknown";
}

function buildActualOutcomePayload() {
  const actualOutcomeLine = actualOutcomeInput.value.trim() || ">> Gercek sonuc girilmedi.";
  const actualLosses = collectActualLosses();
  const actualCapacity = actualCapacityInput.value.trim() === "" ? 0 : Number.parseInt(actualCapacityInput.value, 10);
  let actualLostUnitsTotal = 0;
  let actualLostBlood = 0;

  ALLY_UNITS.forEach((unit) => {
    const lossCount = actualLosses[unit.key] || 0;
    actualLostUnitsTotal += lossCount;
    actualLostBlood += lossCount * (BLOOD_BY_ALLY_KEY[unit.key] || 0);
  });

  return {
    actualOutcomeLine,
    actualCapacity,
    actualLosses,
    actualWinner: inferWinnerFromOutcomeLine(actualOutcomeLine),
    actualLostUnitsTotal,
    actualLostBlood
  };
}

function buildActualSummaryText() {
  const details = buildActualOutcomePayload();
  const outcome = details.actualOutcomeLine;
  const losses = details.actualLosses;
  const capacity = details.actualCapacity;

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
    lines.push(`- ${String(count).padStart(3)} ${getSummaryUnitName(unit.key).padEnd(28)} (${blood} kan)`);
  });

  lines.push("");
  lines.push(`= ${String(totalUnits).padStart(3)} toplam ${"".padEnd(21)} (${totalBlood} kan)`);
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
    activeWrongReportSignature = "";
    wrongReports = [];
    return;
  }
  void ensureWrongReportsLoaded();

  const signature = currentWrongCandidate.matchSignature || buildOptimizerMatchSignature(
    currentWrongCandidate.stage,
    currentWrongCandidate.enemyCounts,
    currentWrongCandidate.allyCounts
  );
  const matched = wrongReports.find((item) =>
    item.source === "optimizer" &&
    (
      item.matchSignature === signature ||
      (
        Number.isInteger(item.stage) &&
        Number(item.stage) === Number(currentWrongCandidate.stage) &&
        buildOptimizerMatchSignature(item.stage, item.enemyCounts || {}, item.allyCounts || {}) === signature
      )
    )
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
    activeApprovedStrategyId = "";
    approvedStrategies = [];
    return;
  }
  void ensureApprovedStrategyLoaded();

  const enemySignature = getEnemySignature(stage, enemyCounts);
  const activeDocId = getCurrentApprovedStrategyDocId();
  const matched = approvedStrategies.find((candidate) => candidate.id === activeDocId) || approvedStrategies.find((candidate) => {
    if (candidate.source === "simulation") {
      return Number.isInteger(candidate.stage) && getEnemySignature(candidate.stage, candidate.enemyCounts) === enemySignature;
    }
    return candidate.enemySignature === enemySignature;
  });
  if (!matched) {
    return;
  }

  const recCounts = matched.source === "simulation" ? (matched.allyCounts || {}) : (matched.recommendationCounts || {});
  const displayWinRate = matched.source === "simulation" ? Math.round((matched.probabilityBasisPoints || 0) / 100) : (matched.winRate || 0);
  const displayModeLabel = matched.modeLabel || matched.sourceLabel || "-";

  const card = document.createElement("article");
  card.className = "saved-match-card";

  const enoughArmy = ALLY_UNITS.every((unit) => (allyPool[unit.key] || 0) >= (recCounts[unit.key] || 0));
  const head = document.createElement("div");
  head.className = "saved-match-head";
  head.innerHTML = `<strong>Onaylanmis Cozum Bulundu</strong><span>${displayModeLabel} / ${formatDate(matched.savedAt)}</span>`;

  const body = document.createElement("div");
  body.className = "saved-match-meta";
  body.innerHTML = `
    <span>Kazanma orani: <strong>%${displayWinRate}</strong></span>
    <span>Kan kaybi: <strong>${matched.lostBlood}</strong></span>
    <span>Puan: <strong>${matched.usedPoints}</strong></span>
    <span>Durum: <strong>${enoughArmy ? "Uygulanabilir" : "Eksik birlik var"}</strong></span>
  `;

  const list = document.createElement("ul");
  list.className = "recommend-list";
  Object.entries(recCounts)
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
    optimizerInputs[unit.key].value = String(item.allyPool?.[unit.key] || item.allyCounts?.[unit.key] || item.recommendationCounts?.[unit.key] || 0);
    if (optimizerMinimumInputs[unit.key]) {
      optimizerMinimumInputs[unit.key].value = String(item.minimumRequiredCounts?.[unit.key] || 0);
    }
  });
  optimizerMode = item.mode || "balanced";
  optimizerObjective = normalizeOptimizerObjective(item.objective);
  optimizerDiversityMode = Boolean(item.diversityMode);
  optimizerStoneMode = false;
  applySearchBandSettings(item.searchBandSettings || { mode: "tight75" });
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === optimizerMode));
  syncObjectiveButtons();
  syncDiversityModeButton();
  optimizerStatus.textContent = getOptimizerObjectiveStatusText(optimizerObjective);
}

function applyStageFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const stage = params.get("stage");
  if (stage && /^\d+$/.test(stage)) {
    stageInput.value = stage;
  }
  renderConstraintInfo();
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
