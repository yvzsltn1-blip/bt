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
const reportSummaryGrid = document.querySelector("#reportSummaryGrid");
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

let currentPayload = readPayload();
let lastAuditResults = [];
let promotableResults = [];
let isAdminSession = false;
let isPromotionRunning = false;

hydrateReportShell();
rerunReportBtn?.addEventListener("click", () => {
  void runRegressionAudit();
});
moveConfirmedWrongBtn?.addEventListener("click", () => {
  void promoteMatchedWrongReports();
});

void bindAdminAuth();
void runRegressionAudit();

function hydrateReportShell() {
  if (!currentPayload) {
    reportTitle.textContent = "Toplu Test Raporu";
    reportScope.textContent = "Aktif rapor verisi bulunamadi.";
    reportCountLabel.textContent = "0";
    if (reportBackLink) {
      reportBackLink.href = "saved.html";
      reportBackLink.textContent = "Onaylananlar";
    }
    syncPromotionUi();
    return;
  }

  reportTitle.textContent = currentPayload.title || "Toplu Test Raporu";
  reportScope.textContent = currentPayload.scopeLabel || "Secilen kayitlar kontrol edilecek.";
  reportCountLabel.textContent = `${currentPayload.selectedCount || 0}/${currentPayload.totalCount || 0}`;
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
    reportSkippedList.innerHTML = '<p class="summary-empty">Atlanan kayit yok.</p>';
    changedSectionMeta.textContent = "0 kayit";
    skippedSectionMeta.textContent = "0 kayit";
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
  reportSkippedList.innerHTML = '<p class="summary-empty">Kontrol suruyor...</p>';
  syncPromotionUi();

  const results = [];
  for (let index = 0; index < currentPayload.items.length; index += 1) {
    results.push(evaluateRecord(currentPayload.kind, currentPayload.items[index]));
    reportProgress.textContent = `${index + 1} / ${currentPayload.items.length}`;
    if ((index + 1) % 4 === 0) {
      await waitForNextFrame();
    }
  }

  renderAuditResults(results);
  reportProgress.textContent = `${currentPayload.items.length} / ${currentPayload.items.length}`;
  rerunReportBtn.disabled = false;
}

function evaluateRecord(kind, item) {
  try {
    if (kind === "approved") {
      return evaluateApprovedRecord(item);
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

  if (Number.isInteger(item.representativeSeed)) {
    const result = simulateBattle(item.enemyCounts, item.allyCounts, {
      seed: item.representativeSeed,
      collectLog: false
    });

    const actual = getResultFingerprint(result);
    const differences = collectFingerprintDifferences(expected, actual);

    return buildComparedRecord(item, {
      status: differences.length === 0 ? "same" : "changed",
      auditLabel: "Seedli simulasyon",
      seed: item.representativeSeed,
      expected,
      actual,
      differences,
      simulationTarget: {
        enemyCounts: item.enemyCounts,
        allyCounts: item.allyCounts,
        seed: item.representativeSeed
      }
    });
  }

  const sampleSeeds = buildDeterministicSampleSeeds(item, RANDOM_FALLBACK_SEED_COUNT);
  const sampled = evaluateSeedSample(item.enemyCounts, item.allyCounts, sampleSeeds, expected, null);
  const differences = collectFingerprintDifferences(expected, sampled.actual);

  return buildComparedRecord(item, {
    status: sampled.hasExpectedMatch ? "same" : "changed",
    auditLabel: `${sampled.sampleCount} seed orneklemi`,
    seed: sampled.representativeSeed,
    expected,
    actual: sampled.actual,
    differences: sampled.hasExpectedMatch ? [] : differences,
    samplingNote: sampled.note,
    simulationTarget: {
      enemyCounts: item.enemyCounts,
      allyCounts: item.allyCounts,
      seed: sampled.representativeSeed
    }
  });
}

function evaluateWrongRecord(item) {
  if (!hasAnyPositiveCounts(item.enemyCounts) || !hasAnyPositiveCounts(item.allyCounts)) {
    return buildSkippedRecord(item, "Eksik kadro", "Dusman veya test edilecek muttefik dizilimi eksik.");
  }

  const expected = getWrongExpectedFingerprint(item);
  const actualTruth = getActualTruthFingerprint(item.actualSummaryText);

  if (Number.isInteger(item.seed)) {
    const result = simulateBattle(item.enemyCounts, item.allyCounts, {
      seed: item.seed,
      collectLog: false
    });

    const actual = getResultFingerprint(result);
    const differences = collectFingerprintDifferences(expected, actual);
    const matchesStoredActual = Boolean(actualTruth) && buildVariantSignature(result) === actualTruth.signature;

    return buildComparedRecord(item, {
      status: differences.length === 0 ? "same" : "changed",
      auditLabel: item.source === "optimizer" ? "Kayitli optimizer savasi" : "Kayitli simulasyon",
      seed: item.seed,
      expected,
      actual,
      differences,
      matchesStoredActual,
      actualNote: item.actualNote || "",
      simulationTarget: {
        enemyCounts: item.enemyCounts,
        allyCounts: item.allyCounts,
        seed: item.seed
      }
    });
  }

  const sampleSeeds = buildDeterministicSampleSeeds(item, RANDOM_FALLBACK_SEED_COUNT);
  const sampled = evaluateSeedSample(item.enemyCounts, item.allyCounts, sampleSeeds, expected, actualTruth);
  const differences = collectFingerprintDifferences(expected, sampled.actual);

  return buildComparedRecord(item, {
    status: sampled.hasExpectedMatch ? "same" : "changed",
    auditLabel: `${item.source === "optimizer" ? "Optimizer" : "Simulasyon"} / ${sampled.sampleCount} seed orneklemi`,
    seed: sampled.representativeSeed,
    expected,
    actual: sampled.actual,
    differences: sampled.hasExpectedMatch ? [] : differences,
    matchesStoredActual: sampled.matchesStoredActual,
    actualNote: item.actualNote || "",
    samplingNote: sampled.note,
    simulationTarget: {
      enemyCounts: item.enemyCounts,
      allyCounts: item.allyCounts,
      seed: sampled.representativeSeed
    }
  });
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

  if (expected.winner !== actual.winner) {
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
    differences: details.differences || [],
    matchesStoredActual: Boolean(details.matchesStoredActual),
    actualNote: details.actualNote || "",
    samplingNote: details.samplingNote || "",
    simulationTarget: details.simulationTarget || null,
    sourceItem: item,
    versusLabel: buildRosterLabel(item.enemyCounts, ENEMY_UNITS, 2) || item.enemyTitle || "Versus",
    allyLabel: buildRosterLabel(item.allyCounts, ALLY_UNITS) || "Kayitli dizilim yok"
  };
}

function buildSkippedRecord(item, title, reason) {
  return {
    id: item.id || "",
    status: "skipped",
    title: buildRecordTitle(item),
    subtitle: buildRecordSubtitle(item),
    skipTitle: title,
    skipReason: reason,
    versusLabel: buildRosterLabel(item.enemyCounts, ENEMY_UNITS, 2) || item.enemyTitle || "Versus"
  };
}

function buildRecordTitle(item) {
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
  const actualMatchCount = results.filter((item) => item.matchesStoredActual).length;
  promotableResults = getPromotableResults(results);

  reportSummaryGrid.innerHTML = "";
  reportSummaryGrid.append(
    createSummaryCard("Ayni", String(sameCount), "same"),
    createSummaryCard("Degisen", String(changedCount), "changed"),
    createSummaryCard("Atlanan", String(skippedCount), "skipped")
  );

  if (currentPayload?.kind === "wrong") {
    reportSummaryGrid.appendChild(createSummaryCard("Gercekle eslesen", String(actualMatchCount), "actual"));
    reportSummaryGrid.appendChild(createSummaryCard("Tasinabilir", String(promotableResults.length), "promoted"));
  }

  changedSectionMeta.textContent = `${changedCount} kayit`;
  skippedSectionMeta.textContent = `${skippedCount} kayit`;

  renderChangedItems(changedItems);
  renderSkippedItems(skippedItems);
  syncPromotionUi();
}

function createSummaryCard(label, value, tone) {
  const card = document.createElement("article");
  card.className = `report-summary-card${tone ? ` is-${tone}` : ""}`;
  card.innerHTML = `
    <span class="report-summary-label">${label}</span>
    <strong>${value}</strong>
  `;
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
    reportChangedList.innerHTML = '<p class="summary-empty">Secilen kayitlarda beklenen sonuc degismedi.</p>';
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
      simulationBtn.textContent = "Simulasyona Git";
      simulationBtn.addEventListener("click", () => {
        openSimulationForCounts(
          item.simulationTarget.enemyCounts,
          item.simulationTarget.allyCounts,
          item.simulationTarget.seed
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
      item.seed !== null ? `<span>Seed: <strong>${item.seed}</strong></span>` : "",
      item.matchesStoredActual ? '<span class="report-status is-promoted">Tasinabilir</span>' : "",
      item.matchesStoredActual ? '<span>Durum: <strong>Kayitli gercekle artik ayni</strong></span>' : ""
    ].filter(Boolean);
    meta.innerHTML = metaParts.join("");

    const compare = document.createElement("div");
    compare.className = "report-compare-grid";
    compare.append(
      buildCompareCard("Beklenen", item.expected),
      buildCompareCard("Simdiki", item.actual)
    );

    const note = document.createElement("p");
    note.className = "report-note";
    note.textContent = `${item.versusLabel} | ${item.allyLabel}`;

    const diffList = document.createElement("div");
    diffList.className = "report-difference-list";
    (item.differences || []).forEach((difference) => {
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

function renderSkippedItems(items) {
  reportSkippedList.innerHTML = "";
  if (!items.length) {
    reportSkippedList.innerHTML = '<p class="summary-empty">Atlanan kayit yok.</p>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "saved-card report-entry-card";
    card.innerHTML = `
      <div class="saved-card-head">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.subtitle)}</span>
        </div>
      </div>
      <div class="saved-meta">
        <span class="report-status is-skipped">Atlandi</span>
        <span>${escapeHtml(item.skipTitle || "Atlandi")}</span>
      </div>
      <p class="report-note">${escapeHtml(item.skipReason || "")}</p>
      <p class="report-note">${escapeHtml(item.versusLabel || "")}</p>
    `;
    reportSkippedList.appendChild(card);
  });
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
  const result = simulateBattle(enemyCounts, allyCounts, {
    seed,
    collectLog: true
  });
  const actualFingerprint = getResultFingerprint(result);

  if (!isFingerprintExactMatch(actualFingerprint, item.actual)) {
    throw new Error("Temsilci seed tekrar calistirildiginda rapordaki dogrulanan sonuc yeniden uretilemedi.");
  }

  return {
    seed,
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

function evaluateSeedSample(enemyCounts, allyCounts, seeds, expected, actualTruth) {
  let representative = null;
  let representativeSeed = null;
  let actualRepresentative = null;
  let actualRepresentativeSeed = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let expectedMatchCount = 0;
  let actualMatchCount = 0;
  const frequencies = new Map();

  seeds.forEach((seed) => {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
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
    left.winner === right.winner &&
    Number(left.lostBloodTotal || 0) === Number(right.lostBloodTotal || 0) &&
    areLossMapsEqual(left.allyLosses, right.allyLosses)
  );
}

function fingerprintDistance(expected, actual) {
  let score = 0;
  if (expected.winner !== actual.winner) {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
