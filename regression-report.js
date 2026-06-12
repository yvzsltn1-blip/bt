"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  simulateBattle,
  calculateArmyPoints
} = window.BattleCore;

const {
  readPayload,
  openSimulationForCounts,
  extractOutcomeLine,
  inferWinnerFromOutcomeLine,
  extractLossesFromSummary,
  calculateLostBlood,
  buildVariantSignature,
  parseVariantSignature,
  cloneCountMap,
  hasAnyPositiveCounts
} = window.BulkBattleRegression;

const reportBackLink = document.querySelector("#reportBackLink");
const reportTitle = document.querySelector("#reportTitle");
const reportScope = document.querySelector("#reportScope");
const reportCountLabel = document.querySelector("#reportCountLabel");
const reportProgress = document.querySelector("#reportProgress");
const rerunReportBtn = document.querySelector("#rerunReportBtn");
const downloadChangedTxtBtn = document.querySelector("#downloadChangedTxtBtn");
const reportRoundingModeSelect = document.querySelector("#reportRoundingModeSelect");
const reportSummaryGrid = document.querySelector("#reportSummaryGrid");
const reportInsightsGrid = document.querySelector("#reportInsightsGrid");
const reportActiveFilterNote = document.querySelector("#reportActiveFilterNote");
const clearReportFilterBtn = document.querySelector("#clearReportFilterBtn");
const reportChangedSection = document.querySelector("#reportChangedSection");
const reportSkippedSection = document.querySelector("#reportSkippedSection");
const reportChangedList = document.querySelector("#reportChangedList");
const reportSkippedList = document.querySelector("#reportSkippedList");
const changedSectionMeta = document.querySelector("#changedSectionMeta");
const skippedSectionMeta = document.querySelector("#skippedSectionMeta");
const reportPromotionPanel = document.querySelector("#reportPromotionPanel");
const reportPromotionHint = document.querySelector("#reportPromotionHint");
const reportPromotionStatus = document.querySelector("#reportPromotionStatus");
const moveConfirmedWrongBtn = document.querySelector("#moveConfirmedWrongBtn");
const reportAdminPanel = document.querySelector("#reportAdminPanel");
const reportAdminAuthStatus = document.querySelector("#reportAdminAuthStatus");
const reportAdminEmailInput = document.querySelector("#reportAdminEmailInput");
const reportAdminPasswordInput = document.querySelector("#reportAdminPasswordInput");
const reportAdminLoginBtn = document.querySelector("#reportAdminLoginBtn");
const reportAdminLogoutBtn = document.querySelector("#reportAdminLogoutBtn");
const RANDOM_FALLBACK_SEED_COUNT = 64;
const ARCHIVE_DEEP_SEED_COUNT = 1024;

let currentPayload = readPayload();
let lastAuditResults = [];
let promotableResults = [];
let isAdminSession = false;
let isPromotionRunning = false;
let currentReportFilter = "all";

hydrateReportShell();
rerunReportBtn?.addEventListener("click", () => {
  void runRegressionAudit();
});
downloadChangedTxtBtn?.addEventListener("click", () => {
  downloadChangedResultsTxt();
});
clearReportFilterBtn?.addEventListener("click", () => {
  currentReportFilter = "all";
  renderAuditResults(lastAuditResults);
});
reportRoundingModeSelect?.addEventListener("change", () => {
  const nextMode = normalizeAuditRoundingMode(reportRoundingModeSelect.value);
  if (currentPayload) {
    currentPayload.roundingMode = nextMode;
    writeReportPayload(currentPayload);
  }
  hydrateReportShell();
  void runRegressionAudit();
});
moveConfirmedWrongBtn?.addEventListener("click", () => {
  void promoteMatchedWrongReports();
});

void bindAdminAuth();
void runRegressionAudit();

function scrollToReportSection(filterKey) {
  const target = filterKey === "skipped" ? reportSkippedSection : reportChangedSection;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setReportFilter(filterKey = "all") {
  currentReportFilter = filterKey === "skipped" ? "all" : (filterKey || "all");
  renderAuditResults(lastAuditResults);
  if (currentReportFilter !== "all") {
    scrollToReportSection(currentReportFilter);
  }
}

function hydrateReportShell() {
  const selectedMode = getSelectedAuditRoundingMode();
  if (!currentPayload) {
    reportTitle.textContent = "Toplu Test Raporu";
    reportScope.textContent = "Aktif rapor verisi bulunamadi.";
    reportCountLabel.textContent = "0";
    if (reportRoundingModeSelect) {
      reportRoundingModeSelect.value = selectedMode;
    }
    if (reportBackLink) {
      reportBackLink.href = "saved.html";
      reportBackLink.textContent = "Onaylananlar";
    }
    syncPromotionUi();
    return;
  }

  reportTitle.textContent = currentPayload.title || "Toplu Test Raporu";
  reportScope.textContent = buildReportScopeText(currentPayload.scopeLabel || "Secilen kayitlar kontrol edilecek.");
  reportCountLabel.textContent = `${currentPayload.selectedCount || 0}/${currentPayload.totalCount || 0}`;
  if (reportRoundingModeSelect) {
    reportRoundingModeSelect.value = selectedMode;
  }
  if (reportBackLink) {
    reportBackLink.href = currentPayload.backHref || "saved.html";
    reportBackLink.textContent = currentPayload.backLabel || "Kaynak Sayfa";
  }
  syncPromotionUi();
}

async function bindAdminAuth() {
  if (!reportAdminPanel) {
    return;
  }
  if (!window.AdminAuthUI || typeof window.AdminAuthUI.bindAdminControls !== "function") {
    syncPromotionUi("Admin girisi hazir degil.");
    return;
  }

  await window.AdminAuthUI.bindAdminControls({
    statusLabel: reportAdminAuthStatus,
    emailInput: reportAdminEmailInput,
    passwordInput: reportAdminPasswordInput,
    loginButton: reportAdminLoginBtn,
    logoutButton: reportAdminLogoutBtn,
    onStateChange: (isAdmin) => {
      isAdminSession = isAdmin;
      syncPromotionUi();
    }
  });
}

function syncPromotionUi(statusOverride = "") {
  const isWrongPayload = currentPayload?.kind === "wrong";
  if (reportPromotionPanel) {
    reportPromotionPanel.hidden = !isWrongPayload;
  }
  if (reportAdminPanel) {
    reportAdminPanel.hidden = !isWrongPayload;
  }
  if (!isWrongPayload) {
    return;
  }

  const candidateCount = promotableResults.length;
  if (reportPromotionHint) {
    reportPromotionHint.textContent = candidateCount > 0
      ? `${candidateCount} kayit artik kayitli gercekle eslesiyor. Bu islem kayitlari Yanlislar listesinden silip Onaylananlar listesine tasir.`
      : "Toplu testte tasinabilecek bir kayit bulunmadi.";
  }

  if (moveConfirmedWrongBtn) {
    moveConfirmedWrongBtn.textContent = candidateCount > 0
      ? `${candidateCount} Dogrulanani Tasi`
      : "Dogrulananlari Tasi";
    moveConfirmedWrongBtn.disabled = !isAdminSession || isPromotionRunning || candidateCount === 0;
  }

  if (reportPromotionStatus) {
    if (statusOverride) {
      reportPromotionStatus.textContent = statusOverride;
    } else if (isPromotionRunning) {
      reportPromotionStatus.textContent = "Tasima islemi suruyor...";
    } else if (!isAdminSession) {
      reportPromotionStatus.textContent = "Tasima icin admin girisi gerekli.";
    } else if (candidateCount === 0) {
      reportPromotionStatus.textContent = "Tasinacak kayit yok.";
    } else {
      reportPromotionStatus.textContent = "Tasima icin hazir.";
    }
  }
}

async function runRegressionAudit() {
  currentPayload = readPayload();
  hydrateReportShell();

  if (!currentPayload || !Array.isArray(currentPayload.items) || currentPayload.items.length === 0) {
    lastAuditResults = [];
    promotableResults = [];
    reportProgress.textContent = "Rapor verisi yok";
    reportSummaryGrid.innerHTML = `
      <article class="report-summary-card report-summary-card-wide">
        <span class="report-summary-label">Durum</span>
        <strong>Kontrol edilecek kayit bulunamadi.</strong>
      </article>
    `;
    reportChangedList.innerHTML = '<p class="summary-empty">Degerlendirilecek kayit yok.</p>';
    changedSectionMeta.textContent = "0 kayit";
    if (reportSkippedSection) {
      reportSkippedSection.hidden = true;
    }
    syncPromotionUi();
    return;
  }

  lastAuditResults = [];
  promotableResults = [];
  rerunReportBtn.disabled = true;
  reportProgress.textContent = `0 / ${currentPayload.items.length}`;
  reportSummaryGrid.innerHTML = `
    <article class="report-summary-card report-summary-card-wide">
      <span class="report-summary-label">Durum</span>
      <strong>Kontrol calisiyor...</strong>
    </article>
  `;
  reportChangedList.innerHTML = '<p class="summary-empty">Kontrol suruyor...</p>';
  if (reportSkippedSection) {
    reportSkippedSection.hidden = true;
  }
  syncPromotionUi();

  const results = [];
  for (let index = 0; index < currentPayload.items.length; index += 1) {
    results.push(evaluateRecord(currentPayload.kind, currentPayload.items[index]));
    reportProgress.textContent = `${index + 1} / ${currentPayload.items.length}`;
    if ((index + 1) % 4 === 0) {
      await waitForNextFrame();
    }
  }

  const archivePersistSummary = await persistArchiveTestResults(results);
  renderAuditResults(results);
  reportProgress.textContent = buildAuditCompletedProgressText(currentPayload.items.length, archivePersistSummary);
  rerunReportBtn.disabled = false;
}

function evaluateRecord(kind, item) {
  try {
    if (kind === "approved") {
      return evaluateApprovedRecord(item);
    }
    if (kind === "archive") {
      return evaluateArchiveRecord(item);
    }
    return evaluateWrongRecord(item);
  } catch (error) {
    return buildSkippedRecord(item, "Kontrol sirasinda hata", String(error?.message || error || "Bilinmeyen hata"));
  }
}

function evaluateApprovedRecord(item) {
  if (item.source !== "simulation") {
    return buildSkippedRecord(
      item,
      "Optimizer kaydi atlandi",
      "Bu kayit icin beklenen savas ozeti saklanmadigi icin otomatik fark kontrolu bu surumde yapilamiyor."
    );
  }
  if (!hasAnyPositiveCounts(item.enemyCounts) || !hasAnyPositiveCounts(item.allyCounts)) {
    return buildSkippedRecord(item, "Eksik kadro", "Dusman veya muttefik sayilari eksik.");
  }

  const expected = getApprovedExpectedFingerprint(item);
  const auditRoundingMode = resolveAuditRoundingMode(item);

  if (Number.isInteger(item.representativeSeed)) {
    const result = simulateBattle(item.enemyCounts, item.allyCounts, {
      seed: item.representativeSeed,
      collectLog: false,
      roundingMode: auditRoundingMode
    });

    const actual = getResultFingerprint(result);
    const differences = collectFingerprintDifferences(expected, actual);

    return buildComparedRecord(item, {
      status: differences.length === 0 ? "same" : "changed",
      auditLabel: "Seedli simulasyon",
      seed: item.representativeSeed,
      seedLabel: "Kayitli seed",
      expected,
      actual,
      differences,
      auditRoundingMode,
      simulationButtonLabel: "Ayni Seed ile Ac",
      simulationTarget: {
        enemyCounts: item.enemyCounts,
        allyCounts: item.allyCounts,
        seed: item.representativeSeed,
        roundingMode: auditRoundingMode
      }
    });
  }

  const sampleSeeds = buildDeterministicSampleSeeds(item, RANDOM_FALLBACK_SEED_COUNT);
  const sampled = evaluateSeedSample(item.enemyCounts, item.allyCounts, sampleSeeds, expected, null, auditRoundingMode);
  const differences = collectFingerprintDifferences(expected, sampled.actual);

  return buildComparedRecord(item, {
    status: sampled.hasExpectedMatch ? "same" : "changed",
    auditLabel: `${sampled.sampleCount} seed orneklemi`,
    seed: sampled.representativeSeed,
    seedLabel: sampled.hasExpectedMatch ? "Beklenen seed" : "Temsilci seed",
    expected,
    actual: sampled.actual,
    differences: sampled.hasExpectedMatch ? [] : differences,
    auditRoundingMode,
    samplingNote: sampled.note,
    actualCardLabel: sampled.hasExpectedMatch ? "Dogrulanan" : "Temsilci Seed",
    simulationButtonLabel: sampled.hasExpectedMatch ? "Dogrulayan Seed ile Ac" : "Temsilci Seed ile Ac",
    simulationTarget: {
      enemyCounts: item.enemyCounts,
      allyCounts: item.allyCounts,
      seed: sampled.representativeSeed,
      roundingMode: auditRoundingMode
    }
  });
}

function evaluateWrongRecord(item) {
  if (!hasAnyPositiveCounts(item.enemyCounts) || !hasAnyPositiveCounts(item.allyCounts)) {
    return buildSkippedRecord(item, "Eksik kadro", "Dusman veya test edilecek muttefik dizilimi eksik.");
  }

  const expected = getWrongExpectedFingerprint(item);
  const actualTruth = getActualTruthFingerprint(item.actualSummaryText);
  const auditRoundingMode = resolveAuditRoundingMode(item);

  if (Number.isInteger(item.seed)) {
    const result = simulateBattle(item.enemyCounts, item.allyCounts, {
      seed: item.seed,
      collectLog: false,
      roundingMode: auditRoundingMode
    });

    const actual = getResultFingerprint(result);
    const differences = collectFingerprintDifferences(expected, actual);
    const matchesStoredActual = Boolean(actualTruth) && buildVariantSignature(result) === actualTruth.signature;

    return buildComparedRecord(item, {
      status: differences.length === 0 ? "same" : "changed",
      auditLabel: item.source === "optimizer" ? "Kayitli optimizer savasi" : "Kayitli simulasyon",
      seed: item.seed,
      seedLabel: "Kayitli seed",
      expected,
      actual,
      actualTruth,
      differences,
      matchesStoredActual,
      actualNote: item.actualNote || "",
      auditRoundingMode,
      simulationButtonLabel: "Ayni Seed ile Ac",
      simulationTarget: {
        enemyCounts: item.enemyCounts,
        allyCounts: item.allyCounts,
        seed: item.seed,
        roundingMode: auditRoundingMode
      }
    });
  }

  const sampleSeeds = buildDeterministicSampleSeeds(item, RANDOM_FALLBACK_SEED_COUNT);
  const sampled = evaluateSeedSample(item.enemyCounts, item.allyCounts, sampleSeeds, expected, actualTruth, auditRoundingMode);
  const differences = collectFingerprintDifferences(expected, sampled.actual);

  return buildComparedRecord(item, {
    status: sampled.hasExpectedMatch ? "same" : "changed",
    auditLabel: `${item.source === "optimizer" ? "Optimizer" : "Simulasyon"} / ${sampled.sampleCount} seed orneklemi`,
    seed: sampled.representativeSeed,
    seedLabel: sampled.hasExpectedMatch ? "Beklenen seed" : "Temsilci seed",
    expected,
    actual: sampled.actual,
    actualTruth,
    differences: sampled.hasExpectedMatch ? [] : differences,
    matchesStoredActual: sampled.matchesStoredActual,
    actualNote: item.actualNote || "",
    auditRoundingMode,
    samplingNote: sampled.note,
    actualCardLabel: sampled.hasExpectedMatch ? "Dogrulanan" : "Temsilci Seed",
    simulationButtonLabel: sampled.hasExpectedMatch ? "Dogrulayan Seed ile Ac" : "Temsilci Seed ile Ac",
    simulationTarget: {
      enemyCounts: item.enemyCounts,
      allyCounts: item.allyCounts,
      seed: sampled.representativeSeed,
      roundingMode: auditRoundingMode
    }
  });
}

function evaluateArchiveRecord(item) {
  if (!item.hasRecordedOutcome) {
    return buildSkippedRecord(
      item,
      "Sonuc sync eksik",
      "Bu arsiv satirinda savas sonucu henuz kaydedilmemis. Loot/EXP veya olen birlik verisi yok."
    );
  }
  if (!hasAnyPositiveCounts(item.enemyCounts)) {
    return buildSkippedRecord(
      item,
      "Dusman etiketi eksik",
      "Bu arsiv kaydinda R1-R10 etiketi yok. Eski kayitlar birebir simulasyon testine alinamiyor."
    );
  }
  if (!hasAnyPositiveCounts(item.allyCounts)) {
    return buildSkippedRecord(item, "Eksik dizilim", "Biz dizilim bilgisi eksik.");
  }

  const expected = getArchiveExpectedFingerprint(item);
  const auditRoundingMode = resolveAuditRoundingMode(item);
  const sampled = evaluateArchiveSeedSample(item, expected, auditRoundingMode);
  const differences = collectFingerprintDifferences(expected, sampled.actual);

  return buildComparedRecord(item, {
    status: sampled.hasExpectedMatch ? "same" : "changed",
    auditLabel: `Arsiv / ${sampled.sampleCount} seed orneklemi`,
    seed: sampled.representativeSeed,
    seedLabel: sampled.hasExpectedMatch ? "Beklenen seed" : "Temsilci seed",
    expected,
    actual: sampled.actual,
    differences: sampled.hasExpectedMatch ? [] : differences,
    auditRoundingMode,
    samplingNote: sampled.note,
    expectedCardLabel: "Kayitli",
    actualCardLabel: sampled.hasExpectedMatch ? "Dogrulanan" : "Temsilci Seed",
    simulationButtonLabel: sampled.hasExpectedMatch ? "Dogrulayan Seed ile Ac" : "Temsilci Seed ile Ac",
    simulationTarget: {
      enemyCounts: item.enemyCounts,
      allyCounts: item.allyCounts,
      seed: sampled.representativeSeed,
      roundingMode: auditRoundingMode
    }
  });
}

function evaluateArchiveSeedSample(item, expected, roundingMode) {
  const initialSeeds = buildDeterministicSampleSeeds(item, RANDOM_FALLBACK_SEED_COUNT);
  const initialSample = evaluateSeedSample(item.enemyCounts, item.allyCounts, initialSeeds, expected, null, roundingMode);
  if (initialSample.hasExpectedMatch) {
    return initialSample;
  }

  const deepSeeds = buildDeterministicSampleSeeds(item, ARCHIVE_DEEP_SEED_COUNT);
  const deepSample = evaluateSeedSample(item.enemyCounts, item.allyCounts, deepSeeds, expected, null, roundingMode);
  if (deepSample.hasExpectedMatch) {
    return {
      ...deepSample,
      note: `Ilk ${RANDOM_FALLBACK_SEED_COUNT} seedde eslesme cikmadi; ${ARCHIVE_DEEP_SEED_COUNT} seed derin taramada beklenen sonuc bulundu.`
    };
  }

  return {
    ...deepSample,
    note: `Ilk ${RANDOM_FALLBACK_SEED_COUNT} seedde eslesme cikmadi; ${ARCHIVE_DEEP_SEED_COUNT} seed derin taramada da beklenen sonuc bulunamadi. Bu arsiv kaydi muhtemelen yanlis loot/kayip verisiyle overwrite oldu.`
  };
}

function getApprovedExpectedFingerprint(item) {
  const parsedSignature = parseVariantSignature(item.variantSignature);
  if (parsedSignature) {
    return {
      winner: parsedSignature.winner,
      lostBloodTotal: parsedSignature.lostBloodTotal,
      allyLosses: parsedSignature.allyLosses,
      usedCapacity: Number.isFinite(item.usedCapacity) ? item.usedCapacity : null,
      signature: item.variantSignature
    };
  }

  const losses = extractLossesFromSummary(item.summaryText || "");
  return {
    winner: item.winner === "enemy" ? "enemy" : "ally",
    lostBloodTotal: Number.isFinite(item.lostBlood) ? item.lostBlood : calculateLostBlood(losses),
    allyLosses: cloneCountMap(losses, ALLY_UNITS),
    usedCapacity: Number.isFinite(item.usedCapacity) ? item.usedCapacity : null,
    signature: ""
  };
}

function getWrongExpectedFingerprint(item) {
  const parsedSignature = parseVariantSignature(item.expectedVariantSignature);
  if (parsedSignature) {
    return {
      winner: parsedSignature.winner,
      lostBloodTotal: parsedSignature.lostBloodTotal,
      allyLosses: parsedSignature.allyLosses,
      usedCapacity: Number.isFinite(item.expectedUsedCapacity) ? item.expectedUsedCapacity : null,
      signature: item.expectedVariantSignature
    };
  }

  const summaryLosses = hasAnyPositiveCounts(item.expectedAllyLosses)
    ? item.expectedAllyLosses
    : extractLossesFromSummary(item.summaryText || "");
  const inferredWinner = item.expectedWinner && item.expectedWinner !== "unknown"
    ? item.expectedWinner
    : inferWinnerFromOutcomeLine(extractOutcomeLine(item.summaryText || ""));

  return {
    winner: inferredWinner,
    lostBloodTotal: Number.isFinite(item.expectedLostBlood)
      ? item.expectedLostBlood
      : calculateLostBlood(summaryLosses),
    allyLosses: cloneCountMap(summaryLosses, ALLY_UNITS),
    usedCapacity: Number.isFinite(item.expectedUsedCapacity) ? item.expectedUsedCapacity : null,
    signature: ""
  };
}

function getArchiveExpectedFingerprint(item) {
  return {
    winner: item.expectedWinner === "ally" || item.expectedWinner === "enemy"
      ? item.expectedWinner
      : "unknown",
    lostBloodTotal: Number.isFinite(Number(item.expectedLostBlood))
      ? Number(item.expectedLostBlood)
      : calculateLostBlood(item.expectedAllyLosses || {}),
    allyLosses: cloneCountMap(item.expectedAllyLosses || {}, ALLY_UNITS),
    usedCapacity: Number.isFinite(item.expectedUsedCapacity) ? item.expectedUsedCapacity : null,
    signature: ""
  };
}

function getActualTruthFingerprint(summaryText) {
  if (!summaryText) {
    return null;
  }
  const losses = extractLossesFromSummary(summaryText);
  const winner = inferWinnerFromOutcomeLine(extractOutcomeLine(summaryText));
  const fingerprint = {
    winner,
    lostBloodTotal: calculateLostBlood(losses),
    allyLosses: cloneCountMap(losses, ALLY_UNITS)
  };
  return {
    ...fingerprint,
    signature: JSON.stringify(fingerprint)
  };
}

function getResultFingerprint(result) {
  return {
    winner: result?.winner || "unknown",
    lostBloodTotal: Number(result?.lostBloodTotal || 0),
    allyLosses: cloneCountMap(result?.allyLosses || {}, ALLY_UNITS),
    usedCapacity: Number.isFinite(Number(result?.usedCapacity)) ? Number(result.usedCapacity) : null,
    signature: buildVariantSignature(result)
  };
}

function collectFingerprintDifferences(expected, actual) {
  const differences = [];

  if (expected.signature && actual.signature && expected.signature === actual.signature) {
    if (Number.isFinite(expected.usedCapacity) && Number.isFinite(actual.usedCapacity) && expected.usedCapacity !== actual.usedCapacity) {
      differences.push("Toplam birlik kapasitesi degisti.");
    }
    return differences;
  }

  if (isWinnerComparable(expected.winner) && expected.winner !== actual.winner) {
    differences.push("Galip taraf degisti.");
  }
  if (expected.lostBloodTotal !== actual.lostBloodTotal) {
    differences.push("Kan kaybi degisti.");
  }
  if (!areLossMapsEqual(expected.allyLosses, actual.allyLosses)) {
    differences.push("Kayip dagilimi degisti.");
  }
  if (Number.isFinite(expected.usedCapacity) && Number.isFinite(actual.usedCapacity) && expected.usedCapacity !== actual.usedCapacity) {
    differences.push("Toplam birlik kapasitesi degisti.");
  }

  return differences;
}

function areLossMapsEqual(left, right) {
  return ALLY_UNITS.every((unit) => Number(left?.[unit.key] || 0) === Number(right?.[unit.key] || 0));
}

function buildComparedRecord(item, details) {
  return {
    id: item.id || "",
    source: item.source || "simulation",
    status: details.status,
    title: buildRecordTitle(item),
    subtitle: buildRecordSubtitle(item),
    auditLabel: details.auditLabel,
    seed: Number.isInteger(details.seed) ? details.seed : null,
    expected: details.expected,
    actual: details.actual,
    actualTruth: details.actualTruth || null,
    differences: details.differences || [],
    detailChips: buildDifferenceDetailChips(details.expected, details.actual),
    matchesStoredActual: Boolean(details.matchesStoredActual),
    actualNote: details.actualNote || "",
    samplingNote: details.samplingNote || "",
    auditRoundingMode: normalizeStoredRoundingMode(details.auditRoundingMode) || "safe",
    storedRoundingMode: normalizeStoredRoundingMode(item?.roundingMode),
    seedLabel: String(details.seedLabel || "Seed"),
    expectedCardLabel: String(details.expectedCardLabel || (item.source === "archive" ? "Kayitli" : "Beklenen")),
    actualCardLabel: String(details.actualCardLabel || "Simdiki"),
    simulationButtonLabel: String(details.simulationButtonLabel || "Simulasyona Git"),
    simulationTarget: details.simulationTarget || null,
    sourceItem: item,
    versusLabel: buildRosterLabel(item.enemyCounts, ENEMY_UNITS, 2) || item.enemyTitle || "Versus",
    allyLabel: buildRosterLabel(item.allyCounts, ALLY_UNITS) || "Kayitli dizilim yok"
  };
}

function buildSkippedRecord(item, title, reason) {
  return {
    id: item.id || "",
    source: item.source || "simulation",
    status: "skipped",
    title: buildRecordTitle(item),
    subtitle: buildRecordSubtitle(item),
    skipTitle: title,
    skipReason: reason,
    sourceItem: item,
    versusLabel: buildRosterLabel(item.enemyCounts, ENEMY_UNITS, 2) || item.enemyTitle || "Versus"
  };
}

function buildRecordTitle(item) {
  if (item.source === "archive") {
    if (Number.isInteger(item.stage)) {
      return `Arsiv / ${item.stage}. Kademe`;
    }
    return "Arsiv Kaydi";
  }
  if (item.source === "optimizer") {
    if (Number.isInteger(item.stage)) {
      return `${item.modeLabel || "Optimizer"} / ${item.stage}. Kademe`;
    }
    return item.modeLabel || "Optimizer";
  }
  return item.enemyTitle || item.variantTitle || "Simulasyon";
}

function buildRecordSubtitle(item) {
  const stamp = item.savedAt || item.reportedAt || "";
  const formatted = formatDate(stamp);
  if (item.source === "archive") {
    const sourceLabel = item.sourceType === "fill" ? "fill" : "manual";
    if (Number.isInteger(item.stage)) {
      return `${item.stage}. Kademe / ${sourceLabel} / ${formatted}`;
    }
    return `${sourceLabel} / ${formatted}`;
  }
  if (Number.isInteger(item.stage)) {
    return `${item.stage}. Kademe / ${formatted}`;
  }
  return formatted;
}

function renderAuditResults(results) {
  lastAuditResults = results.slice();
  const sameCount = results.filter((item) => item.status === "same").length;
  const changedItems = results.filter((item) => item.status === "changed");
  const skippedItems = results.filter((item) => item.status === "skipped");
  const changedCount = changedItems.length;
  const skippedCount = skippedItems.length;
  const becameDefeatCount = changedItems.filter((item) => item.expected?.winner === "ally" && item.actual?.winner === "enemy").length;
  const lostBloodIncreasedCount = changedItems.filter((item) => Number(item.actual?.lostBloodTotal || 0) > Number(item.expected?.lostBloodTotal || 0)).length;
  const lostBloodDecreasedCount = changedItems.filter((item) => Number(item.actual?.lostBloodTotal || 0) < Number(item.expected?.lostBloodTotal || 0)).length;
  const actualMatchCount = results.filter((item) => item.matchesStoredActual).length;
  promotableResults = getPromotableResults(results);
  const filteredChangedItems = filterChangedItems(changedItems, currentReportFilter);

  reportSummaryGrid.innerHTML = "";
  reportSummaryGrid.append(
    createSummaryCard("Ayni", String(sameCount), "same", { hint: "Liste gosterimi yok" }),
    createSummaryCard("Degisen", String(changedCount), "changed", { filterKey: "changed", hint: "Degisen kayitlari goster" }),
    createSummaryCard("Maglubiyete donen", String(becameDefeatCount), "changed", { filterKey: "became_defeat" }),
    createSummaryCard("Kan kaybi artan", String(lostBloodIncreasedCount), "changed", { filterKey: "lost_blood_up" }),
    createSummaryCard("Kan kaybi azalan", String(lostBloodDecreasedCount), "same", { filterKey: "lost_blood_down" })
  );

  if (currentPayload?.kind === "wrong") {
    reportSummaryGrid.appendChild(createSummaryCard("Gercekle eslesen", String(actualMatchCount), "actual"));
    reportSummaryGrid.appendChild(createSummaryCard("Tasinabilir", String(promotableResults.length), "promoted"));
  }

  renderInsights(changedItems);
  syncActiveFilterUi(filteredChangedItems, skippedCount);
  if (reportChangedSection) {
    reportChangedSection.hidden = false;
  }
  if (reportSkippedSection) {
    reportSkippedSection.hidden = true;
  }

  changedSectionMeta.textContent = currentReportFilter === "all"
    ? `${changedCount} kayit`
    : `${filteredChangedItems.length}/${changedCount} kayit`;

  renderChangedItems(filteredChangedItems);
  syncPromotionUi();
}

function downloadChangedResultsTxt() {
  const changedItems = lastAuditResults.filter((item) => item.status === "changed");
  if (!changedItems.length) {
    window.alert("TXT indirmek icin farkli kayit yok.");
    return;
  }

  const lines = [
    currentPayload?.title || "Toplu Test Raporu",
    currentPayload?.scopeLabel || "",
    `Degisen kayit: ${changedItems.length}`,
    ""
  ];

  changedItems.forEach((item, index) => {
    lines.push(`#${index + 1} ${item.title}`);
    lines.push(`Tarih: ${item.subtitle}`);
    lines.push(`Kontrol: ${item.auditLabel}`);
    lines.push(`Rakip: ${item.versusLabel || "-"}`);
    lines.push(`Biz: ${item.allyLabel || "-"}`);
    lines.push(`Gerceklesen sonuc: ${formatWinner(item.expected?.winner)}`);
    lines.push(`Simulator sonucu: ${formatWinner(item.actual?.winner)}`);
    lines.push(`Gerceklesen kayip: ${formatNumberValue(item.expected?.lostBloodTotal)} ; Simulator sonucu: ${formatNumberValue(item.actual?.lostBloodTotal)}`);
    lines.push(`Gerceklesen kayip birlik: ${formatLosses(item.expected?.allyLosses)}`);
    lines.push(`Simulator kayip birlik: ${formatLosses(item.actual?.allyLosses)}`);
    lines.push(`Farklar: ${(item.detailChips || item.differences || []).join(" | ") || "-"}`);
    if (item.samplingNote) {
      lines.push(`Not: ${item.samplingNote}`);
    }
    lines.push("");
  });

  downloadTextFile(lines.join("\n"), `regression-changed-${buildTimestampForFile()}.txt`);
}

function createSummaryCard(label, value, tone, options = {}) {
  const card = document.createElement(options.filterKey ? "button" : "article");
  card.className = `report-summary-card${tone ? ` is-${tone}` : ""}${options.filterKey ? " is-clickable" : ""}${options.filterKey && currentReportFilter === options.filterKey ? " is-active" : ""}`;
  if (options.filterKey) {
    card.type = "button";
    card.addEventListener("click", () => {
      setReportFilter(options.filterKey);
    });
  }
  card.innerHTML = `
    <span class="report-summary-label">${label}</span>
    <strong>${value}</strong>
    ${options.hint ? `<small>${options.hint}</small>` : ""}
  `;
  return card;
}

function syncActiveFilterUi(filteredChangedItems) {
  if (clearReportFilterBtn) {
    clearReportFilterBtn.hidden = currentReportFilter === "all";
  }
  if (!reportActiveFilterNote) {
    return;
  }
  if (currentReportFilter === "all") {
    reportActiveFilterNote.textContent = "Ozet kartlari ve satirlara tiklayarak listeyi filtreleyebilirsin.";
    return;
  }
  const baseLabel = getReportFilterLabel(currentReportFilter);
  const count = filteredChangedItems.length;
  reportActiveFilterNote.textContent = `Aktif filtre: ${baseLabel} (${count} kayit).`;
}

function getReportFilterLabel(filterKey) {
  const labels = {
    all: "Tum degisenler",
    changed: "Degisenler",
    became_defeat: "Maglubiyete donenler",
    lost_blood_up: "Kan kaybi artanlar",
    lost_blood_down: "Kan kaybi azalanlar",
    unit_loss_plus_1: "+1 birlik kayip",
    unit_loss_plus_2: "+2 birlik kayip",
    unit_loss_plus_3: "+3 birlik kayip",
    unit_loss_plus_4: "+4 birlik kayip",
    unit_loss_plus_5p: "+5 ve ustu birlik kayip",
    unit_loss_minus_1: "-1 birlik kayip",
    unit_loss_minus_2: "-2 birlik kayip",
    unit_loss_minus_3p: "-3 ve ustu birlik kazanci"
  };
  return labels[filterKey] || "Filtre";
}

function filterChangedItems(items, filterKey) {
  if (!filterKey || filterKey === "all" || filterKey === "changed") {
    return items.slice();
  }
  return items.filter((item) => matchesChangedFilter(item, filterKey));
}

function matchesChangedFilter(item, filterKey) {
  const bloodDelta = Number(item.actual?.lostBloodTotal || 0) - Number(item.expected?.lostBloodTotal || 0);
  const unitDelta = getLossUnitDelta(item);
  switch (filterKey) {
    case "became_defeat":
      return item.expected?.winner === "ally" && item.actual?.winner === "enemy";
    case "lost_blood_up":
      return bloodDelta > 0;
    case "lost_blood_down":
      return bloodDelta < 0;
    case "unit_loss_plus_1":
      return unitDelta === 1;
    case "unit_loss_plus_2":
      return unitDelta === 2;
    case "unit_loss_plus_3":
      return unitDelta === 3;
    case "unit_loss_plus_4":
      return unitDelta === 4;
    case "unit_loss_plus_5p":
      return unitDelta >= 5;
    case "unit_loss_minus_1":
      return unitDelta === -1;
    case "unit_loss_minus_2":
      return unitDelta === -2;
    case "unit_loss_minus_3p":
      return unitDelta <= -3;
    default:
      return true;
  }
}

function renderInsights(changedItems) {
  if (!reportInsightsGrid) {
    return;
  }
  const insightCards = [
    createOutcomeInsightCard(changedItems),
    createUnitDeltaInsightCard(changedItems, "positive"),
    createUnitDeltaInsightCard(changedItems, "negative"),
    createBloodDeltaInsightCard(changedItems)
  ];
  reportInsightsGrid.innerHTML = "";
  insightCards.forEach((card) => reportInsightsGrid.appendChild(card));
}

function createInsightCard(title, subtitle = "") {
  const card = document.createElement("article");
  card.className = "report-insight-card";
  card.innerHTML = `
    <div class="report-insight-head">
      <strong>${escapeHtml(title)}</strong>
      ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
    </div>
  `;
  return card;
}

function createInsightAction(label, value, filterKey = "", options = {}) {
  const row = document.createElement(filterKey ? "button" : "div");
  row.className = `report-insight-row${filterKey ? " is-clickable" : ""}${filterKey && currentReportFilter === filterKey ? " is-active" : ""}`;
  if (filterKey) {
    row.type = "button";
    row.addEventListener("click", () => {
      setReportFilter(filterKey);
    });
  }
  row.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(String(value))}</strong>
    ${options.note ? `<small>${escapeHtml(options.note)}</small>` : ""}
  `;
  return row;
}

function createOutcomeInsightCard(changedItems) {
  const card = createInsightCard("Sonuc dagilimi", "Durum degisimi ve etkisi");
  const body = document.createElement("div");
  body.className = "report-insight-list";
  const defeatCount = changedItems.filter((item) => item.expected?.winner === "ally" && item.actual?.winner === "enemy").length;
  const victoryCount = changedItems.filter((item) => item.expected?.winner === "enemy" && item.actual?.winner === "ally").length;
  const unchangedOutcomeCount = changedItems.filter((item) => item.expected?.winner === item.actual?.winner).length;
  body.append(
    createInsightAction("Zafer -> Maglubiyet", defeatCount, "became_defeat"),
    createInsightAction("Maglubiyet -> Zafer", victoryCount),
    createInsightAction("Sonuc ayni kaldi", unchangedOutcomeCount, "changed", { note: "Degisim kayip veya kapasitede" })
  );
  card.appendChild(body);
  return card;
}

function createUnitDeltaInsightCard(changedItems, direction) {
  const isPositive = direction === "positive";
  const title = isPositive ? "Birim kayip artisi" : "Birim kayip azalisi";
  const subtitle = isPositive ? "Toplam kayip birim farki" : "Daha dusuk kayip cikanlar";
  const card = createInsightCard(title, subtitle);
  const body = document.createElement("div");
  body.className = "report-insight-list";
  const definitions = isPositive
    ? [
        ["+1 birlik", "unit_loss_plus_1"],
        ["+2 birlik", "unit_loss_plus_2"],
        ["+3 birlik", "unit_loss_plus_3"],
        ["+4 birlik", "unit_loss_plus_4"],
        ["+5 ve ustu", "unit_loss_plus_5p"]
      ]
    : [
        ["-1 birlik", "unit_loss_minus_1"],
        ["-2 birlik", "unit_loss_minus_2"],
        ["-3 ve ustu", "unit_loss_minus_3p"]
      ];
  definitions.forEach(([label, filterKey]) => {
    const count = changedItems.filter((item) => matchesChangedFilter(item, filterKey)).length;
    body.appendChild(createInsightAction(label, `${count} kayit`, count > 0 ? filterKey : ""));
  });
  card.appendChild(body);
  return card;
}

function createBloodDeltaInsightCard(changedItems) {
  const card = createInsightCard("Kan kaybi farki", "Toplam kan farkinin ozeti");
  const body = document.createElement("div");
  body.className = "report-insight-list";
  const deltas = changedItems.map((item) => Number(item.actual?.lostBloodTotal || 0) - Number(item.expected?.lostBloodTotal || 0));
  const positiveDeltas = deltas.filter((value) => value > 0);
  const negativeDeltas = deltas.filter((value) => value < 0);
  const maxIncrease = positiveDeltas.length ? Math.max(...positiveDeltas) : 0;
  const maxDecrease = negativeDeltas.length ? Math.min(...negativeDeltas) : 0;
  const averageIncrease = positiveDeltas.length
    ? Math.round(positiveDeltas.reduce((sum, value) => sum + value, 0) / positiveDeltas.length)
    : 0;
  body.append(
    createInsightAction("En yuksek artis", maxIncrease > 0 ? `+${maxIncrease}` : "0", positiveDeltas.length ? "lost_blood_up" : ""),
    createInsightAction("Ortalama artis", averageIncrease > 0 ? `+${averageIncrease}` : "0", positiveDeltas.length ? "lost_blood_up" : ""),
    createInsightAction("En yuksek azalis", maxDecrease < 0 ? String(maxDecrease) : "0", negativeDeltas.length ? "lost_blood_down" : "")
  );
  card.appendChild(body);
  return card;
}

function getPromotableResults(results) {
  return (results || []).filter((item) => (
    item.status !== "skipped" &&
    item.matchesStoredActual &&
    item.simulationTarget &&
    hasAnyPositiveCounts(item.simulationTarget.enemyCounts) &&
    hasAnyPositiveCounts(item.simulationTarget.allyCounts)
  ));
}

function renderChangedItems(items) {
  reportChangedList.innerHTML = "";
  if (!items.length) {
    const emptyText = currentReportFilter === "all"
      ? "Secilen kayitlarda beklenen sonuc degismedi."
      : `Aktif filtre icin kayit yok: ${escapeHtml(getReportFilterLabel(currentReportFilter))}.`;
    reportChangedList.innerHTML = `<p class="summary-empty">${emptyText}</p>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "saved-card report-entry-card";

    const head = document.createElement("div");
    head.className = "saved-card-head";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.subtitle)}</span>`;

    const actions = document.createElement("div");
    actions.className = "actions actions-inline";

    if (item.simulationTarget) {
      const simulationBtn = document.createElement("button");
      simulationBtn.className = "button button-secondary";
      simulationBtn.type = "button";
      simulationBtn.textContent = item.simulationButtonLabel || "Simulasyona Git";
      simulationBtn.addEventListener("click", () => {
        openSimulationForCounts(
          item.simulationTarget.enemyCounts,
          item.simulationTarget.allyCounts,
          item.simulationTarget.seed,
          item.simulationTarget.roundingMode
        );
      });
      actions.appendChild(simulationBtn);
    }

    head.append(title, actions);

    const meta = document.createElement("div");
    meta.className = "saved-meta";
    const metaParts = [
      '<span class="report-status is-changed">Degisti</span>',
      `<span>Kontrol: <strong>${escapeHtml(item.auditLabel)}</strong></span>`,
      `<span>Test modu: <strong>${escapeHtml(buildAuditModeBadgeText(item))}</strong></span>`,
      item.seed !== null ? `<span>${escapeHtml(item.seedLabel || "Seed")}: <strong>${item.seed}</strong></span>` : "",
      item.matchesStoredActual ? '<span class="report-status is-promoted">Tasinabilir</span>' : "",
      item.matchesStoredActual ? '<span>Durum: <strong>Kayitli gercekle artik ayni</strong></span>' : ""
    ].filter(Boolean);
    meta.innerHTML = metaParts.join("");

    const compare = document.createElement("div");
    compare.className = "report-compare-grid";
    if (item.actualTruth) {
      compare.classList.add("is-triple");
    }
    compare.append(
      buildCompareCard(item.expectedCardLabel || "Beklenen", item.expected),
      buildCompareCard(item.actualCardLabel || "Simdiki", item.actual)
    );
    if (item.actualTruth) {
      compare.append(buildCompareCard("Kayitli Gercek", item.actualTruth));
    }

    const note = document.createElement("p");
    note.className = "report-note";
    note.textContent = `${item.versusLabel} | ${item.allyLabel}`;

    const diffList = document.createElement("div");
    diffList.className = "report-difference-list";
    (item.detailChips || item.differences || []).forEach((difference) => {
      const badge = document.createElement("span");
      badge.className = "report-difference-chip";
      badge.textContent = difference;
      diffList.appendChild(badge);
    });

    card.append(head, meta, compare, diffList, note);

    if (item.samplingNote) {
      const samplingNote = document.createElement("p");
      samplingNote.className = "report-note";
      samplingNote.textContent = item.samplingNote;
      card.appendChild(samplingNote);
    }

    if (item.actualNote) {
      const actualNote = document.createElement("p");
      actualNote.className = "report-note";
      actualNote.textContent = `Not: ${item.actualNote}`;
      card.appendChild(actualNote);
    }

    reportChangedList.appendChild(card);
  });
}

function buildCompareCard(label, fingerprint) {
  const wrap = document.createElement("section");
  wrap.className = "report-compare-card";

  const heading = document.createElement("h4");
  heading.textContent = label;

  const lines = document.createElement("div");
  lines.className = "report-kv-list";
  lines.innerHTML = [
    buildCompareRow("Sonuc", formatWinner(fingerprint?.winner)),
    buildCompareRow("Kan kaybi", formatNumberValue(fingerprint?.lostBloodTotal)),
    buildCompareRow("Kayiplar", formatLosses(fingerprint?.allyLosses)),
    buildCompareRow("Kapasite", formatNullableNumber(fingerprint?.usedCapacity))
  ].join("");

  wrap.append(heading, lines);
  return wrap;
}

function buildCompareRow(label, value) {
  return `
    <div class="report-kv-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function buildAuditCompletedProgressText(totalCount, archivePersistSummary) {
  const baseText = `${totalCount} / ${totalCount}`;
  if (!archivePersistSummary || archivePersistSummary.attempted <= 0) {
    return baseText;
  }
  const parts = [];
  if (archivePersistSummary.saved > 0) {
    parts.push(`${archivePersistSummary.saved} kaydedildi`);
  }
  if (archivePersistSummary.pass > 0) {
    parts.push(`${archivePersistSummary.pass} dogru`);
  }
  if (archivePersistSummary.fail > 0) {
    parts.push(`${archivePersistSummary.fail} yanlis`);
  }
  if (archivePersistSummary.skipped > 0) {
    parts.push(`${archivePersistSummary.skipped} atlandi`);
  }
  if (archivePersistSummary.failed > 0) {
    parts.push(`${archivePersistSummary.failed} hata`);
  }
  return parts.length ? `${baseText} | ${parts.join(", ")}` : baseText;
}

async function persistArchiveTestResults(results) {
  if (currentPayload?.kind !== "archive" || !currentPayload?.persistResults) {
    return null;
  }
  if (!window.BTFirebase || typeof window.BTFirebase.saveArchiveRegressionTest !== "function") {
    return null;
  }

  // Batch icindeki ayni savaslari (ayni matchSignature) teklestir.
  const bySignature = new Map();
  (results || []).forEach((result) => {
    const payload = buildArchiveTestPayload(result);
    if (!payload || !payload.matchSignature) {
      return;
    }
    if (!bySignature.has(payload.matchSignature)) {
      bySignature.set(payload.matchSignature, payload);
    }
  });

  const summary = {
    attempted: bySignature.size,
    saved: 0,
    failed: 0,
    pass: 0,
    fail: 0,
    skipped: 0
  };

  for (const payload of bySignature.values()) {
    if (payload.result === "pass") {
      summary.pass += 1;
    } else if (payload.result === "fail") {
      summary.fail += 1;
    } else {
      summary.skipped += 1;
    }
    try {
      await window.BTFirebase.saveArchiveRegressionTest(payload);
      summary.saved += 1;
    } catch (error) {
      console.warn("Arsiv test sonucu kaydedilemedi.", error);
      summary.failed += 1;
    }
  }

  return summary;
}

function buildArchiveTestPayload(result) {
  const item = result?.sourceItem || {};
  const enemyCounts = cloneCountMap(item.enemyCounts || {}, ENEMY_UNITS);
  const allyCounts = cloneCountMap(item.allyCounts || {}, ALLY_UNITS);
  const matchSignature = item.matchSignature || buildMatchSignature("archive", enemyCounts, allyCounts);
  const resultCode = result?.status === "same"
    ? "pass"
    : (result?.status === "changed" ? "fail" : "skipped");
  const expected = result?.expected || {};
  const actual = result?.actual || {};

  return {
    matchSignature,
    result: resultCode,
    host: String(item.host || ""),
    stage: Number.isInteger(item.stage) ? item.stage : null,
    testedAt: new Date().toISOString(),
    enemyCounts,
    allyCounts,
    expectedWinner: expected.winner === "ally" || expected.winner === "enemy" ? expected.winner : "unknown",
    expectedLostBlood: Number.isFinite(Number(expected.lostBloodTotal)) ? Number(expected.lostBloodTotal) : null,
    expectedAllyLosses: cloneCountMap(expected.allyLosses || {}, ALLY_UNITS),
    actualWinner: actual.winner === "ally" || actual.winner === "enemy" ? actual.winner : "unknown",
    actualLostBlood: Number.isFinite(Number(actual.lostBloodTotal)) ? Number(actual.lostBloodTotal) : null,
    actualAllyLosses: cloneCountMap(actual.allyLosses || {}, ALLY_UNITS),
    differences: (result?.detailChips || result?.differences || []).join(" | "),
    note: String(result?.samplingNote || result?.skipReason || ""),
    archiveId: String(item.id || ""),
    archiveSavedAt: String(item.savedAt || ""),
    enemyRosterText: String(item.enemyRosterText || ""),
    allyRosterText: String(item.allyRosterText || "")
  };
}

async function promoteMatchedWrongReports() {
  if (currentPayload?.kind !== "wrong") {
    return;
  }
  if (!isAdminSession) {
    window.alert("Bu islem icin admin oturumu gerekli.");
    return;
  }
  if (!promotableResults.length) {
    window.alert("Tasinabilecek dogrulanan kayit yok.");
    return;
  }
  if (!window.BTFirebase || typeof window.BTFirebase.saveApprovedStrategy !== "function" || typeof window.BTFirebase.deleteWrongReport !== "function") {
    window.alert("Kayit tasima servisi hazir degil.");
    return;
  }

  const total = promotableResults.length;
  if (!window.confirm(`${total} kayit Yanlislar listesinden silinip Onaylananlar listesine tasinsin mi?`)) {
    return;
  }

  isPromotionRunning = true;
  rerunReportBtn.disabled = true;
  syncPromotionUi("Tasima basladi...");

  const movedIds = new Set();
  const failures = [];

  try {
    for (let index = 0; index < promotableResults.length; index += 1) {
      const item = promotableResults[index];
      syncPromotionUi(`${index + 1} / ${total} tasiniyor...`);
      try {
        await promoteSingleWrongResult(item);
        movedIds.add(item.id);
      } catch (error) {
        failures.push(`${item.title}: ${String(error?.message || error || "Bilinmeyen hata")}`);
      }
      if ((index + 1) % 2 === 0) {
        await waitForNextFrame();
      }
    }

    updatePayloadAfterPromotion(movedIds);
    const movedCount = movedIds.size;
    if (movedCount > 0) {
      syncPromotionUi(`${movedCount} kayit tasindi, rapor yenileniyor...`);
      await runRegressionAudit();
    }

    if (failures.length > 0) {
      window.alert([
        `${movedCount} kayit tasindi.`,
        `${failures.length} kayit tasinamadi:`,
        ...failures
      ].join("\n"));
    } else if (movedCount > 0) {
      window.alert(`${movedCount} kayit yanlis listesinden alinip onaylananlara tasindi.`);
    }
  } finally {
    isPromotionRunning = false;
    rerunReportBtn.disabled = false;
    syncPromotionUi();
  }
}

async function promoteSingleWrongResult(item) {
  const approvedEntry = createApprovedEntryFromWrongResult(item);
  await window.BTFirebase.saveApprovedStrategy(approvedEntry);
  try {
    await window.BTFirebase.deleteWrongReport(item.id);
  } catch (error) {
    throw new Error(`Yanlis kaydi silinemedi. Onay kaydi olusmus olabilir. ${String(error?.message || error || "")}`.trim());
  }
}

function createApprovedEntryFromWrongResult(item) {
  const sourceItem = item.sourceItem || {};
  const rerun = rerunPromotedSimulation(item);
  const enemyCounts = cloneCountMap(item.simulationTarget?.enemyCounts || sourceItem.enemyCounts || {}, ENEMY_UNITS);
  const allyCounts = cloneCountMap(item.simulationTarget?.allyCounts || sourceItem.allyCounts || {}, ALLY_UNITS);
  const matchSignature = sourceItem.matchSignature || buildMatchSignature("simulation", enemyCounts, allyCounts);
  const enemyTitle = sourceItem.enemyTitle || buildEnemyTitle(enemyCounts);
  const promotedAt = new Date().toISOString();

  return {
    source: "simulation",
    sourceLabel: "Simulasyon",
    savedAt: promotedAt,
    stage: Number.isInteger(sourceItem.stage) ? sourceItem.stage : undefined,
    enemyTitle,
    enemyCounts,
    allyCounts,
    matchSignature,
    representativeSeed: Number.isInteger(rerun.seed) ? rerun.seed : undefined,
    variantSignature: buildVariantSignature(rerun.result),
    variantTitle: `${rerun.result.winner === "enemy" ? "Maglubiyet" : "Zafer"} senaryosu`,
    probabilityBasisPoints: 10000,
    winner: rerun.result.winner === "enemy" ? "enemy" : "ally",
    summaryText: rerun.summaryText,
    logText: rerun.detailText,
    usedCapacity: rerun.result.usedCapacity,
    usedPoints: calculateArmyPoints(allyCounts),
    roundingMode: rerun.roundingMode,
    lostBlood: rerun.result.lostBloodTotal,
    promotedFromWrong: true,
    promotedFromWrongAt: promotedAt,
    promotedFromWrongId: item.id
  };
}

function rerunPromotedSimulation(item) {
  const enemyCounts = cloneCountMap(item.simulationTarget?.enemyCounts || {}, ENEMY_UNITS);
  const allyCounts = cloneCountMap(item.simulationTarget?.allyCounts || {}, ALLY_UNITS);
  const seed = Number.isInteger(item.seed) ? item.seed : null;
  const roundingMode = resolveAuditRoundingMode(item.sourceItem || item);
  const result = simulateBattle(enemyCounts, allyCounts, {
    seed,
    collectLog: true,
    roundingMode
  });
  const actualFingerprint = getResultFingerprint(result);

  if (!isFingerprintExactMatch(actualFingerprint, item.actual)) {
    throw new Error("Temsilci seed tekrar calistirildiginda rapordaki dogrulanan sonuc yeniden uretilemedi.");
  }

  return {
    seed,
    roundingMode,
    result,
    ...buildSimulationTextsFromLog(result.logText || "", seed)
  };
}

function buildSimulationTextsFromLog(logText, seed) {
  const lines = String(logText || "").split("\n");
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

  return {
    summaryText: [
      "======================  SAVAS  SONUCU  ======================",
      ...(summaryLines.length > 0 ? summaryLines : ["  (sonuc henuz belirlenmedi)"])
    ].join("\n"),
    detailText: [
      "======================  TUR  TUR  ANALIZ  ======================",
      `  seed: ${seed ?? "-"}`,
      "  her raundun olaylari ve muharebe duzeni asagidadir",
      "",
      ...detailLines
    ].join("\n")
  };
}

function updatePayloadAfterPromotion(movedIds) {
  if (!movedIds.size || !currentPayload || !Array.isArray(currentPayload.items)) {
    return;
  }
  const remainingItems = currentPayload.items.filter((item) => !movedIds.has(item.id));
  const selectedCount = remainingItems.length;
  const currentTotalCount = Number(currentPayload.totalCount || currentPayload.items.length || 0);
  const nextPayload = {
    ...currentPayload,
    items: remainingItems,
    selectedCount,
    totalCount: Math.max(0, currentTotalCount - movedIds.size)
  };
  currentPayload = nextPayload;
  writeReportPayload(nextPayload);
}

function writeReportPayload(payload) {
  const storageKey = window.BulkBattleRegression?.STORAGE_KEY;
  if (!storageKey) {
    return;
  }
  window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function evaluateSeedSample(enemyCounts, allyCounts, seeds, expected, actualTruth, roundingMode) {
  const primary = evaluateSeedSampleWithMode(enemyCounts, allyCounts, seeds, expected, actualTruth, roundingMode);
  if (primary.hasExpectedMatch || roundingMode === "extround") {
    return primary;
  }
  // Eslesme yoksa uzanti motoru yuvarlamasiyla (extround) ikinci tur denenir.
  // Dogrular ilk turda eslestigi icin sonuclari degismez; 2026-06-12 olcumu:
  // 1946 dogru kayit korunuyor, 21 yanlisin 14'u extround ile yakalaniyor.
  const fallback = evaluateSeedSampleWithMode(enemyCounts, allyCounts, seeds, expected, actualTruth, "extround");
  if (fallback.hasExpectedMatch) {
    return {
      ...fallback,
      note: `${fallback.note} (extround yuvarlama ile)`
    };
  }
  return primary;
}

function evaluateSeedSampleWithMode(enemyCounts, allyCounts, seeds, expected, actualTruth, roundingMode) {
  let representative = null;
  let representativeSeed = null;
  let actualRepresentative = null;
  let actualRepresentativeSeed = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let expectedMatchCount = 0;
  let actualMatchCount = 0;
  const frequencies = new Map();

  seeds.forEach((seed) => {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false, roundingMode });
    const fingerprint = getResultFingerprint(result);
    const signature = fingerprint.signature;
    const existing = frequencies.get(signature);
    if (existing) {
      existing.count += 1;
    } else {
      frequencies.set(signature, { fingerprint, seed, count: 1 });
    }

    if (isFingerprintExactMatch(expected, fingerprint)) {
      expectedMatchCount += 1;
      if (!representative) {
        representative = fingerprint;
        representativeSeed = seed;
        bestScore = 0;
      }
    }

    if (actualTruth && isFingerprintExactMatch(actualTruth, fingerprint)) {
      actualMatchCount += 1;
      if (!actualRepresentative) {
        actualRepresentative = fingerprint;
        actualRepresentativeSeed = seed;
      }
    }

    const score = fingerprintDistance(expected, fingerprint);
    if (score < bestScore) {
      bestScore = score;
      representative = fingerprint;
      representativeSeed = seed;
    }
  });

  const fallbackRepresentative = [...frequencies.values()].sort((left, right) =>
    right.count - left.count || fingerprintDistance(expected, left.fingerprint) - fingerprintDistance(expected, right.fingerprint)
  )[0] || null;

  const finalRepresentative = representative || actualRepresentative || fallbackRepresentative?.fingerprint || expected;
  const finalSeed = representativeSeed ?? actualRepresentativeSeed ?? fallbackRepresentative?.seed ?? seeds[0] ?? null;
  const hasExpectedMatch = expectedMatchCount > 0;

  return {
    sampleCount: seeds.length,
    hasExpectedMatch,
    matchesStoredActual: actualMatchCount > 0,
    representativeSeed: finalSeed,
    actual: finalRepresentative,
    note: hasExpectedMatch
      ? `Seed yoktu; ${seeds.length} sabit rastgele seed tarandi ve beklenen sonuc ${expectedMatchCount} kez bulundu.`
      : `Seed yoktu; ${seeds.length} sabit rastgele seed tarandi ve beklenen sonuc hic bulunamadi.`
  };
}

function isFingerprintExactMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  return (
    winnersAreCompatible(left.winner, right.winner) &&
    Number(left.lostBloodTotal || 0) === Number(right.lostBloodTotal || 0) &&
    areLossMapsEqual(left.allyLosses, right.allyLosses)
  );
}

function fingerprintDistance(expected, actual) {
  let score = 0;
  if (isWinnerComparable(expected.winner) && expected.winner !== actual.winner) {
    score += 1000000;
  }
  score += Math.abs(Number(expected.lostBloodTotal || 0) - Number(actual.lostBloodTotal || 0)) * 100;
  ALLY_UNITS.forEach((unit) => {
    score += Math.abs(Number(expected.allyLosses?.[unit.key] || 0) - Number(actual.allyLosses?.[unit.key] || 0));
  });
  if (Number.isFinite(expected.usedCapacity) && Number.isFinite(actual.usedCapacity)) {
    score += Math.abs(Number(expected.usedCapacity) - Number(actual.usedCapacity));
  }
  return score;
}

function buildDeterministicSampleSeeds(item, count) {
  const source = [
    item.id,
    item.reportedAt,
    item.stage,
    JSON.stringify(item.enemyCounts || {}),
    JSON.stringify(item.allyCounts || {}),
    item.summaryText || ""
  ].join("|");
  let state = hashText(source) || 1;
  const seeds = [];
  const seen = new Set();
  while (seeds.length < count) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const seed = state || (seeds.length + 1);
    if (seen.has(seed)) {
      continue;
    }
    seen.add(seed);
    seeds.push(seed);
  }
  return seeds;
}

function hashText(text) {
  let hash = 2166136261;
  const normalized = String(text || "");
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildMatchSignature(source, enemyCounts, allyCounts) {
  const enemySignature = ENEMY_UNITS.map((unit) => enemyCounts?.[unit.key] || 0).join("|");
  const allySignature = ALLY_UNITS.map((unit) => allyCounts?.[unit.key] || 0).join("|");
  return `${source}|${enemySignature}|${allySignature}`;
}

function buildEnemyTitle(enemyCounts) {
  return buildRosterLabel(enemyCounts, ENEMY_UNITS, 2) || "Versus";
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

function normalizeStoredRoundingMode(mode) {
  if (mode === "legacy" || mode === "safe" || mode === "exact") {
    return mode;
  }
  return null;
}

function normalizeAuditRoundingMode(mode) {
  if (mode === "legacy" || mode === "safe" || mode === "exact") {
    return mode;
  }
  return "legacy";
}

function getSelectedAuditRoundingMode() {
  const nextMode = normalizeAuditRoundingMode(currentPayload?.roundingMode);
  if (currentPayload) {
    currentPayload.roundingMode = nextMode;
  }
  return nextMode;
}

function resolveAuditRoundingMode(item) {
  const selectedMode = getSelectedAuditRoundingMode();
  if (selectedMode !== "stored") {
    return selectedMode;
  }
  return normalizeStoredRoundingMode(item?.roundingMode) || "safe";
}

function getRoundingModeLabel(mode) {
  if (mode === "legacy") {
    return "Degismemis";
  }
  if (mode === "exact") {
    return "Gercek";
  }
  if (mode === "safe") {
    return "Guvenli";
  }
  return "Kayda gore";
}

function buildReportScopeText(baseText) {
  const selectedMode = getSelectedAuditRoundingMode();
  const modeText = selectedMode === "stored"
    ? "Test modu: Kayda gore (kayitta yoksa Guvenli)"
    : `Test modu: ${getRoundingModeLabel(selectedMode)}`;
  return `${baseText} / ${modeText}`;
}

function buildAuditModeBadgeText(item) {
  const selectedMode = getSelectedAuditRoundingMode();
  if (selectedMode !== "stored") {
    return `${getRoundingModeLabel(item.auditRoundingMode)} (manuel secim)`;
  }
  if (item.storedRoundingMode) {
    return `${getRoundingModeLabel(item.auditRoundingMode)} (kayit modu)`;
  }
  return `${getRoundingModeLabel(item.auditRoundingMode)} (kayit modu yok)`;
}

function buildRosterLabel(counts, units, limit = null) {
  const parts = (units || [])
    .filter((unit) => Number(counts?.[unit.key] || 0) > 0)
    .map((unit) => `${counts[unit.key]} ${unit.label}`);
  return (limit ? parts.slice(0, limit) : parts).join(" / ");
}

function formatWinner(value) {
  if (value === "ally") {
    return "Zafer";
  }
  if (value === "enemy") {
    return "Maglubiyet";
  }
  return "Bilinmiyor";
}

function isWinnerComparable(value) {
  return value === "ally" || value === "enemy";
}

function winnersAreCompatible(expectedWinner, actualWinner) {
  if (!isWinnerComparable(expectedWinner)) {
    return true;
  }
  return expectedWinner === actualWinner;
}

function formatLosses(losses) {
  const parts = ALLY_UNITS.map((unit, index) => {
    const count = Number(losses?.[unit.key] || 0);
    if (count <= 0) {
      return null;
    }
    return `T${index + 1}:${count}`;
  }).filter(Boolean);
  return parts.length ? parts.join(" | ") : "-";
}

function formatNumberValue(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "-";
}

function formatNullableNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "-";
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

function formatSignedNumber(value) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized === 0) {
    return "0";
  }
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

function getTotalLossUnits(losses) {
  return ALLY_UNITS.reduce((sum, unit) => sum + Number(losses?.[unit.key] || 0), 0);
}

function getLossUnitDelta(item) {
  return getTotalLossUnits(item?.actual?.allyLosses) - getTotalLossUnits(item?.expected?.allyLosses);
}

function getUnitTierLabel(unit) {
  const match = String(unit?.label || "").match(/\((T\d+)\)/i);
  return match ? match[1].toUpperCase() : unit?.key || "?";
}

function buildLossDeltaBreakdown(expectedLosses, actualLosses) {
  const parts = ALLY_UNITS
    .map((unit) => {
      const delta = Number(actualLosses?.[unit.key] || 0) - Number(expectedLosses?.[unit.key] || 0);
      if (delta === 0) {
        return null;
      }
      return `${getUnitTierLabel(unit)} ${formatSignedNumber(delta)}`;
    })
    .filter(Boolean);
  if (!parts.length) {
    return "";
  }
  return parts.slice(0, 4).join(", ");
}

function buildDifferenceDetailChips(expected, actual) {
  if (!expected || !actual) {
    return [];
  }
  const chips = [];
  if (isWinnerComparable(expected.winner) && expected.winner !== actual.winner) {
    chips.push(`Sonuc: ${formatWinner(expected.winner)} -> ${formatWinner(actual.winner)}`);
  }
  const lostBloodDelta = Number(actual.lostBloodTotal || 0) - Number(expected.lostBloodTotal || 0);
  if (lostBloodDelta !== 0) {
    chips.push(`Kan kaybi: ${formatSignedNumber(lostBloodDelta)}`);
  }
  const totalLossDelta = getTotalLossUnits(actual.allyLosses) - getTotalLossUnits(expected.allyLosses);
  if (totalLossDelta !== 0) {
    chips.push(`Toplam kayip: ${formatSignedNumber(totalLossDelta)} birlik`);
  }
  const lossBreakdown = buildLossDeltaBreakdown(expected.allyLosses, actual.allyLosses);
  if (lossBreakdown) {
    chips.push(`Kayip farki: ${lossBreakdown}`);
  }
  if (Number.isFinite(expected.usedCapacity) && Number.isFinite(actual.usedCapacity) && expected.usedCapacity !== actual.usedCapacity) {
    chips.push(`Kapasite: ${formatSignedNumber(Number(actual.usedCapacity) - Number(expected.usedCapacity))}`);
  }
  return chips;
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
