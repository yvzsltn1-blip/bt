"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  parseCount,
  normalizeRoundingMode,
  calculateArmyPoints,
  BLOOD_BY_ALLY_KEY,
  simulateBattle,
  analyzeKnifeEdgeRisk
} = window.BattleCore;

const inputRefs = {};
const actualLossInputs = {};
const enemyInputs = document.querySelector("#enemyInputs");
const allyInputs = document.querySelector("#allyInputs");
const summaryPanel = document.querySelector("#summaryPanel");
const simulationMetaPanel = document.querySelector("#simulationMetaPanel");
const logOutput = document.querySelector("#logOutput");
const simulationLogPanel = document.querySelector("#simulationLogPanel");
const simulationLogFullscreenBtn = document.querySelector("#simulationLogFullscreenBtn");
const downloadLogTxtBtn = document.querySelector("#downloadLogTxtBtn");
const downloadLogPngBtn = document.querySelector("#downloadLogPngBtn");
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
const actualOutcomeModeButtons = [...document.querySelectorAll(".actual-outcome-mode-button")];
const actualCapacityInput = document.querySelector("#actualCapacityInput");
const actualNoteInput = document.querySelector("#actualNoteInput");
const expectedWrongSummaryPreview = document.querySelector("#expectedWrongSummaryPreview");
const actualWrongSummaryPreview = document.querySelector("#actualWrongSummaryPreview");
const wrongReportErrorBox = document.querySelector("#wrongReportErrorBox");
const wrongLossInputs = document.querySelector("#wrongLossInputs");
const matchedActualPanel = document.querySelector("#matchedActualPanel");
const simulationAdminActionsPanel = document.querySelector("#simulationAdminActionsPanel");
const variantInsightsPanel = document.querySelector("#variantInsightsPanel");
const variantToggleBtn = document.querySelector("#variantToggleBtn");
const variantDetailsPanel = document.querySelector("#variantDetailsPanel");
const nearbyAdvicePanel = document.querySelector("#nearbyAdvicePanel");
const nearbyAdviceToggleBtn = document.querySelector("#nearbyAdviceToggleBtn");
const nearbyAdviceDetailsPanel = document.querySelector("#nearbyAdviceDetailsPanel");
const variantLogModal = document.querySelector("#variantLogModal");
const closeVariantLogBtn = document.querySelector("#closeVariantLogBtn");
const variantLogTitle = document.querySelector("#variantLogTitle");
const variantLogMeta = document.querySelector("#variantLogMeta");
const variantLogSummary = document.querySelector("#variantLogSummary");
const variantLogInfo = document.querySelector("#variantLogInfo");
const variantLogOutput = document.querySelector("#variantLogOutput");
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";
const LOSS_REDUCTION_ICON_URL = "https://s66-tr.bitefight.gameforge.com/img/voodoo/res3_rotation.gif";
let currentSimulationReport = null;
let pendingWrongSimulationReport = null;
let wrongReports = [];
let currentLogLang = "tr";
let lastSummaryTextTr = "";
let lastLogTextTr = "";
let simulationLogFullscreenFallback = false;
let currentVariantAnalysis = null;
let variantAnalysisRunId = 0;
let currentNearbyAdvice = null;
let nearbyAdviceRunId = 0;
let isAdminSession = false;
let currentSimulationResult = null;
let currentKnifeEdgeRisk = null;
let isLossReductionActive = false;
let pendingHydratedSimulationSeed = null;
let currentActualOutcomeMode = "victory";
let cachedVictoryActualLosses = {};
let cachedVictoryActualCapacity = "";
let expectedWrongLosses = {};
const VARIANT_SAMPLE_COUNT = 480;
const VARIANT_INITIAL_VISIBLE_COUNT = 20;
const VARIANT_VISIBLE_STEP = 20;
const RANDOM_BENCHMARK_SAMPLE_COUNT = 480;
const RANDOM_BENCHMARK_SEED_MIN = 10000;
const RANDOM_BENCHMARK_SEED_MAX = 99999;
const NEARBY_VICTORY_MAX_EXTRA_UNITS = 5;
const NEARBY_IMPROVEMENT_MAX_EXTRA_UNITS = 3;
const NEARBY_ADVICE_MAX_RESULTS = 5;

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
void refreshMatchedActualReport();
bindAdminSession();

simulateBtn.addEventListener("click", () => {
  try {
    const enemy = collectCounts(ENEMY_UNITS);
    const ally = collectCounts(ALLY_UNITS);
    const seed = consumeSimulationSeed();
    statusLabel.textContent = "Simulasyon calisiyor";
    const result = simulateBattle(enemy, ally, {
      seed,
      collectLog: true
    });
    renderSimulation(result, { seed });
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
  currentSimulationResult = null;
  currentKnifeEdgeRisk = null;
  currentVariantAnalysis = null;
  currentNearbyAdvice = null;
  nearbyAdviceRunId += 1;
  isLossReductionActive = false;
  pendingHydratedSimulationSeed = null;
  reportWrongSimulationBtn.disabled = true;
  renderSimulationMeta();
  closeVariantLogModal();
  syncSimulationAdminActions();
  syncVariantInsightsUi();
  syncNearbyAdviceUi();
});

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

function buildSimulationLogExportFilename(extension) {
  const lang = currentLogLang === "en" ? "en" : "tr";
  const seedPart = Number.isInteger(currentSimulationReport?.seed) ? `seed-${currentSimulationReport.seed}` : "manual";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `tam-gunluk-${seedPart}-${lang}-${timestamp}.${extension}`;
}

function getRenderedLogPlainText() {
  if (!logOutput) {
    return "";
  }
  const renderedLines = Array.from(logOutput.querySelectorAll(".log-line"));
  if (renderedLines.length > 0) {
    return renderedLines.map((row) => row.textContent || "").join("\n");
  }
  return (logOutput.textContent || "").trim();
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function parsePixelValue(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildCanvasFont(style) {
  const fontStyle = style.fontStyle && style.fontStyle !== "normal" ? `${style.fontStyle} ` : "";
  const fontWeight = style.fontWeight && style.fontWeight !== "normal" ? `${style.fontWeight} ` : "";
  const fontSize = style.fontSize || "13px";
  const fontFamily = style.fontFamily || "monospace";
  return `${fontStyle}${fontWeight}${fontSize} ${fontFamily}`.trim();
}

function hasVisibleFill(colorValue) {
  return Boolean(colorValue) && colorValue !== "transparent" && colorValue !== "rgba(0, 0, 0, 0)";
}

function measureAndDrawText(ctx, text, x, y, letterSpacing = 0, shouldDraw = true) {
  if (!text) {
    return 0;
  }
  if (!letterSpacing) {
    if (shouldDraw) {
      ctx.fillText(text, x, y);
    }
    return ctx.measureText(text).width;
  }

  let cursor = x;
  const chars = Array.from(text);
  chars.forEach((char, index) => {
    if (shouldDraw) {
      ctx.fillText(char, cursor, y);
    }
    cursor += ctx.measureText(char).width;
    if (index < chars.length - 1) {
      cursor += letterSpacing;
    }
  });
  return cursor - x;
}

function drawLogTextNode(ctx, text, x, y, style) {
  ctx.font = buildCanvasFont(style);
  ctx.fillStyle = style.color || "#d6dff0";
  ctx.textBaseline = "top";
  const letterSpacing = parsePixelValue(style.letterSpacing, 0);
  return measureAndDrawText(ctx, text, x, y, letterSpacing, true);
}

function drawLogLineToCanvas(ctx, row, contentOriginX, rowTop, contentWidth, rowStyle = window.getComputedStyle(row), rowHeight = null) {
  const effectiveRowHeight = rowHeight ?? Math.max(
    parsePixelValue(rowStyle.lineHeight, parsePixelValue(rowStyle.fontSize, 13) * 1.4) + parsePixelValue(rowStyle.paddingTop, 0) + parsePixelValue(rowStyle.paddingBottom, 0),
    parsePixelValue(rowStyle.fontSize, 13)
  );
  const rowPaddingTop = parsePixelValue(rowStyle.paddingTop, 0);

  if (hasVisibleFill(rowStyle.backgroundColor)) {
    ctx.fillStyle = rowStyle.backgroundColor;
    ctx.fillRect(contentOriginX, rowTop, contentWidth, effectiveRowHeight);
  }

  let cursorX = contentOriginX;
  const textY = rowTop + rowPaddingTop;
  Array.from(row.childNodes).forEach((childNode) => {
    if (childNode.nodeType === Node.TEXT_NODE) {
      cursorX += drawLogTextNode(ctx, childNode.textContent || "", cursorX, textY, rowStyle);
      return;
    }
    if (childNode.nodeType === Node.ELEMENT_NODE) {
      const childStyle = window.getComputedStyle(childNode);
      cursorX += drawLogTextNode(ctx, childNode.textContent || "", cursorX, textY, childStyle);
    }
  });
}

function drawRoundedPanel(ctx, x, y, width, height, radius, fillColor, borderColor, borderWidth) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, safeRadius);
  } else {
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();
  }
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (borderWidth > 0 && hasVisibleFill(borderColor)) {
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
  }
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Canvas PNG olarak disa aktarilamadi."));
    }, type);
  });
}

async function exportSimulationLogAsPng() {
  if (!simulationLogPanel || !logOutput) {
    throw new Error("Gunluk paneli bulunamadi.");
  }

  const createExportSnapshot = window.SimulationLogExport?.createExportSnapshot;
  const buildSequentialLogLayout = window.SimulationLogExport?.buildSequentialLogLayout;
  const exportSnapshot = typeof createExportSnapshot === "function"
    ? createExportSnapshot(simulationLogPanel)
    : null;
  const exportPanel = exportSnapshot?.panel || simulationLogPanel;
  const exportLogOutput = exportSnapshot?.logOutput || logOutput;

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (error) {
      // Fontlar hazir degilse export mevcut durumla devam eder.
    }
  }

  try {
    const panelRect = exportPanel.getBoundingClientRect();
    const panelWidth = Math.max(1, Math.ceil(panelRect.width));
    const logHead = exportSnapshot?.logHead || exportPanel.querySelector(".log-head");
    const logHeadTitle = exportSnapshot?.logHeadTitle || exportPanel.querySelector(".log-head-title");
    const headHeight = logHead ? Math.ceil(logHead.getBoundingClientRect().height) : 0;
    const panelStyles = window.getComputedStyle(exportPanel);
    const headStyles = logHead ? window.getComputedStyle(logHead) : null;
    const titleStyles = logHeadTitle ? window.getComputedStyle(logHeadTitle) : null;
    const outputStyles = window.getComputedStyle(exportLogOutput);
    const renderedLines = Array.from(exportLogOutput.querySelectorAll(".log-line"));
    const renderedLineLayouts = typeof buildSequentialLogLayout === "function"
      ? buildSequentialLogLayout(
        renderedLines.map((row) => ({
          element: row,
          style: window.getComputedStyle(row)
        })),
        headHeight + parsePixelValue(outputStyles.paddingTop, 18)
      )
      : null;
    const borderTop = parseFloat(panelStyles.borderTopWidth) || 0;
    const borderBottom = parseFloat(panelStyles.borderBottomWidth) || 0;
    const exportLogHeight = Math.max(
      exportLogOutput.scrollHeight,
      Math.ceil(exportLogOutput.getBoundingClientRect().height),
      Math.ceil(
        renderedLineLayouts
          ? (renderedLineLayouts.totalHeight - headHeight + parsePixelValue(outputStyles.paddingBottom, 18))
          : parsePixelValue(outputStyles.paddingTop, 18) + parsePixelValue(outputStyles.paddingBottom, 18)
      )
    );
    const exportHeight = Math.max(1, Math.ceil(headHeight + exportLogHeight + borderTop + borderBottom));
    const MIN_EXPORT_SCALE = 2;
    const MAX_EXPORT_SCALE = 4;
    const baseScale = Math.min(Math.max(window.devicePixelRatio || 1, MIN_EXPORT_SCALE), MAX_EXPORT_SCALE);
    const MAX_CANVAS_WIDTH = 8192;
    const MAX_CANVAS_HEIGHT = 8192;
    const MAX_CANVAS_AREA = 32 * 1024 * 1024;
    const widthLimitedScale = MAX_CANVAS_WIDTH / panelWidth;
    const heightLimitedScale = MAX_CANVAS_HEIGHT / exportHeight;
    const areaLimitedScale = Math.sqrt(MAX_CANVAS_AREA / (panelWidth * exportHeight));
    const scale = Math.max(0.1, Math.min(baseScale, widthLimitedScale, heightLimitedScale, areaLimitedScale));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(panelWidth * scale));
    canvas.height = Math.max(1, Math.round(exportHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas baglami olusturulamadi.");
    }

    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;

    const borderRadius = parsePixelValue(panelStyles.borderRadius, 20);
    const borderWidth = parsePixelValue(panelStyles.borderTopWidth, 1);
    drawRoundedPanel(
      ctx,
      borderWidth / 2,
      borderWidth / 2,
      panelWidth - borderWidth,
      exportHeight - borderWidth,
      borderRadius,
      panelStyles.backgroundColor || "#0a0f15",
      panelStyles.borderColor || "rgba(160, 185, 214, 0.18)",
      borderWidth
    );

    if (headStyles) {
      const headPaddingLeft = parsePixelValue(headStyles.paddingLeft, 16);
      const headPaddingTop = parsePixelValue(headStyles.paddingTop, 12);
      const titleText = logHeadTitle?.textContent || "Tam Gunluk";
      const dividerY = headHeight - parsePixelValue(headStyles.borderBottomWidth, 1) / 2;

      if (parsePixelValue(headStyles.borderBottomWidth, 0) > 0 && hasVisibleFill(headStyles.borderBottomColor)) {
        ctx.beginPath();
        ctx.moveTo(0, dividerY);
        ctx.lineTo(panelWidth, dividerY);
        ctx.lineWidth = parsePixelValue(headStyles.borderBottomWidth, 1);
        ctx.strokeStyle = headStyles.borderBottomColor;
        ctx.stroke();
      }

      if (titleStyles) {
        ctx.font = buildCanvasFont(titleStyles);
        ctx.fillStyle = titleStyles.color || "#98a7bf";
        ctx.textBaseline = "top";
        measureAndDrawText(
          ctx,
          titleText,
          headPaddingLeft,
          headPaddingTop,
          parsePixelValue(titleStyles.letterSpacing, 0),
          true
        );
      }
    }

    const contentOriginX = parsePixelValue(outputStyles.paddingLeft, 16);
    const contentOriginY = headHeight;
    const contentWidth = panelWidth - contentOriginX - parsePixelValue(outputStyles.paddingRight, 16);

    if (hasVisibleFill(outputStyles.backgroundColor)) {
      ctx.fillStyle = outputStyles.backgroundColor;
      ctx.fillRect(
        borderWidth,
        contentOriginY,
        Math.max(0, panelWidth - borderWidth * 2),
        Math.max(0, exportHeight - contentOriginY - borderWidth)
      );
    }

    if (renderedLines.length > 0) {
      if (renderedLineLayouts) {
        renderedLineLayouts.rows.forEach((layoutRow) => {
          drawLogLineToCanvas(
            ctx,
            layoutRow.source.element,
            contentOriginX,
            layoutRow.top,
            contentWidth,
            layoutRow.source.style,
            layoutRow.height
          );
        });
      } else {
        renderedLines.forEach((row) => {
          drawLogLineToCanvas(ctx, row, contentOriginX, contentOriginY + row.offsetTop, contentWidth);
        });
      }
    } else {
      ctx.font = buildCanvasFont(outputStyles);
      ctx.fillStyle = outputStyles.color || "#d6dff0";
      ctx.textBaseline = "top";
      measureAndDrawText(
        ctx,
        exportLogOutput.textContent || "Gunluk henuz olusturulmadi.",
        contentOriginX,
        contentOriginY + parsePixelValue(outputStyles.paddingTop, 18),
        parsePixelValue(outputStyles.letterSpacing, 0),
        true
      );
    }

    const pngBlob = await canvasToBlob(canvas, "image/png");
    triggerBlobDownload(pngBlob, buildSimulationLogExportFilename("png"));
  } finally {
    exportSnapshot?.dispose();
  }
}

if (downloadLogTxtBtn) {
  downloadLogTxtBtn.addEventListener("click", () => {
    const logText = getRenderedLogPlainText();
    const exportText = logText || "Gunluk henuz olusturulmadi.";
    const txtBlob = new Blob(["\uFEFF", exportText], { type: "text/plain;charset=utf-8" });
    triggerBlobDownload(txtBlob, buildSimulationLogExportFilename("txt"));
  });
}

if (downloadLogPngBtn) {
  downloadLogPngBtn.addEventListener("click", async () => {
    downloadLogPngBtn.disabled = true;
    try {
      await exportSimulationLogAsPng();
    } catch (error) {
      window.alert(error?.message || "Gunluk PNG olarak indirilemedi.");
    } finally {
      downloadLogPngBtn.disabled = false;
    }
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

  if (variantLogModal && !variantLogModal.hidden) {
    closeVariantLogModal();
    return;
  }

  if (!simulationLogFullscreenFallback || getNativeFullscreenElement() === simulationLogPanel) {
    return;
  }

  void exitSimulationLogFullscreen();
});

closeWrongReportBtn.addEventListener("click", closeWrongReportModal);
cancelWrongReportBtn.addEventListener("click", closeWrongReportModal);

if (closeVariantLogBtn) {
  closeVariantLogBtn.addEventListener("click", closeVariantLogModal);
}

submitWrongReportBtn.addEventListener("click", async () => {
  if (!pendingWrongSimulationReport) {
    return;
  }

  const report = {
    ...pendingWrongSimulationReport,
    ...buildActualOutcomePayload(),
    actualSummaryText: buildActualSummaryText(),
    actualNote: actualNoteInput.value.trim()
  };

  try {
    submitWrongReportBtn.disabled = true;
    await window.BTFirebase.saveWrongReport(report);
    await refreshMatchedActualReport();
    clearWrongReportError();
    closeWrongReportModal();
    window.alert("Gercek sonuc kaydedildi.");
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

if (variantLogModal) {
  variantLogModal.addEventListener("click", (event) => {
    if (event.target === variantLogModal) {
      closeVariantLogModal();
    }
  });
}

function bindAdminSession() {
  if (!window.BTFirebase || typeof window.BTFirebase.onAdminStateChanged !== "function") {
    return;
  }

  window.BTFirebase.onAdminStateChanged((isAdmin) => {
    isAdminSession = isAdmin;
    syncSimulationAdminActions();
    syncVariantInsightsUi();
  });
}

async function initializeWrongReports() {
  await refreshMatchedActualReport();
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

  actualOutcomeModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActualOutcomeMode(button.dataset.actualOutcomeMode || "victory");
      renderActualWrongSummaryPreview();
    });
  });
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

    pendingHydratedSimulationSeed = Number.isInteger(payload.seed) ? payload.seed : null;

    ENEMY_UNITS.forEach((unit) => {
      inputRefs[unit.key].value = String(payload.enemyCounts[unit.key] || 0);
    });
    ALLY_UNITS.forEach((unit) => {
      inputRefs[unit.key].value = String(payload.allyCounts[unit.key] || 0);
    });
    renderAllyPoints();
    statusLabel.textContent = pendingHydratedSimulationSeed ? "Kayitli seed ile sonuc yuklendi" : "Optimizer sonucu yuklendi";
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

function buildRuntimeSeed() {
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return Math.max(1, values[0] >>> 0);
  }
  return 10000 + Math.floor(Math.random() * 90000);
}

function consumeSimulationSeed() {
  if (Number.isInteger(pendingHydratedSimulationSeed)) {
    const seed = pendingHydratedSimulationSeed;
    pendingHydratedSimulationSeed = null;
    return seed;
  }
  return buildRuntimeSeed();
}

function normalizeLossCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function hasPositiveLosses(losses = {}) {
  return Object.values(losses || {}).some((value) => normalizeLossCount(value) > 0);
}

function getReducedLossCount(value) {
  const count = normalizeLossCount(value);
  if (count <= 0) {
    return 0;
  }
  return Math.max(0, count - Math.ceil(count / 5));
}

function applyLossReductionToLosses(losses = {}) {
  const reduced = {};
  ALLY_UNITS.forEach((unit) => {
    const nextCount = getReducedLossCount(losses?.[unit.key] || 0);
    if (nextCount > 0) {
      reduced[unit.key] = nextCount;
    }
  });
  return reduced;
}

function calculateLostBloodFromLosses(losses = {}) {
  return ALLY_UNITS.reduce((sum, unit) =>
    sum + normalizeLossCount(losses?.[unit.key] || 0) * (BLOOD_BY_ALLY_KEY[unit.key] || 0), 0);
}

function buildLossSummaryText(summaryText, losses = {}) {
  const lines = String(summaryText || "").split("\n");
  const lossHeaderIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === "Kayip Birlikler" || trimmed === "Lost Units";
  });
  if (lossHeaderIndex < 0) {
    return String(summaryText || "");
  }

  const capacityIndex = lines.findIndex((line, index) => {
    if (index <= lossHeaderIndex) {
      return false;
    }
    const trimmed = line.trim();
    return trimmed.startsWith("Toplam birlik kapasitesi") || trimmed.startsWith("Total army capacity");
  });

  const unitLines = [];
  let totalUnits = 0;
  let totalBlood = 0;
  ALLY_UNITS.forEach((unit) => {
    const count = normalizeLossCount(losses?.[unit.key] || 0);
    if (count <= 0) {
      return;
    }
    const blood = count * (BLOOD_BY_ALLY_KEY[unit.key] || 0);
    totalUnits += count;
    totalBlood += blood;
    unitLines.push(`- ${String(count).padStart(3)} ${getSummaryUnitName(unit.key)} (${blood} kan)`);
  });

  const before = lines.slice(0, lossHeaderIndex + 1);
  const after = capacityIndex >= 0 ? lines.slice(capacityIndex) : [];
  return [
    ...before,
    ...unitLines,
    "",
    `= ${String(totalUnits).padStart(3)} toplam ${"".padEnd(21)} (${totalBlood} kan)`,
    "--------------------------------------------------",
    ...after
  ].join("\n");
}

function getDisplayedSimulationLosses(report) {
  const baseLosses = report?.expectedAllyLosses && hasPositiveLosses(report.expectedAllyLosses)
    ? report.expectedAllyLosses
    : extractLossesFromSummary(report?.summaryText || "");
  return isLossReductionActive ? applyLossReductionToLosses(baseLosses) : baseLosses;
}

function getDisplayedSimulationLostBlood(report, result) {
  const displayedLosses = getDisplayedSimulationLosses(report);
  if (isLossReductionActive && hasPositiveLosses(displayedLosses)) {
    return calculateLostBloodFromLosses(displayedLosses);
  }
  return result?.lostBloodTotal ?? report?.lostBlood ?? 0;
}

function getLossAdjustedSummaryText(summaryText, losses) {
  if (!isLossReductionActive) {
    return String(summaryText || "");
  }
  return buildLossSummaryText(summaryText, applyLossReductionToLosses(losses));
}

function createMetaField(label, value) {
  const field = document.createElement("span");
  field.innerHTML = `${label}: <strong>${value}</strong>`;
  return field;
}

function createLossReductionToggleButton(isActive, onToggle) {
  const button = document.createElement("button");
  button.className = `loss-toggle-button${isActive ? " is-active" : ""}`;
  button.type = "button";
  button.setAttribute("aria-pressed", isActive ? "true" : "false");
  button.title = isActive
    ? "Azaltilmis kayiplari gosteriyorsun. Tekrar basarsan normal sonuc doner."
    : "Kayiplari birlik bazinda 5'te 1 azaltip goster.";
  button.innerHTML = `
    <img src="${LOSS_REDUCTION_ICON_URL}" alt="" loading="lazy">
  `;
  button.addEventListener("click", onToggle);
  return button;
}

function renderSimulationMeta(report = null, result = null) {
  if (!simulationMetaPanel) {
    return;
  }
  if (!report || !result) {
    simulationMetaPanel.innerHTML = "";
    return;
  }

  simulationMetaPanel.innerHTML = "";
  if (Number.isInteger(report.seed)) {
    simulationMetaPanel.appendChild(createMetaField("Seed", report.seed));
  }
  simulationMetaPanel.appendChild(createMetaField("Sonuc", result.winner === "enemy" ? "Maglubiyet" : "Zafer"));
  simulationMetaPanel.appendChild(createMetaField("Kan kaybi", getDisplayedSimulationLostBlood(report, result)));
  simulationMetaPanel.appendChild(createMetaField("Kullanilan puan", report.usedPoints ?? 0));
  simulationMetaPanel.appendChild(createMetaField("Kapasite", report.usedCapacity ?? 0));
}

function renderSimulation(result, options = {}) {
  const enemyCounts = collectCounts(ENEMY_UNITS);
  const allyCounts = collectCounts(ALLY_UNITS);
  const seed = Number.isInteger(options.seed) ? options.seed : (Number.isInteger(result?.seed) ? result.seed : null);
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

  const summaryText = [
    "======================  SAVAS  SONUCU  ======================",
    ...(summaryLines.length > 0 ? summaryLines : ["  (sonuc henuz belirlenmedi)"])
  ].join("\n");
  const detailText = [
    "======================  TUR  TUR  ANALIZ  ======================",
    `  seed: ${seed ?? "-"}`,
    "  her raundun olaylari ve muharebe duzeni asagidadir",
    "",
    ...detailLines
  ].join("\n");

  isLossReductionActive = false;
  lastSummaryTextTr = summaryText;
  lastLogTextTr = detailText;
  paintLogPanels();

  currentSimulationReport = {
    source: "simulation",
    sourceLabel: "Simulasyon",
    reportedAt: new Date().toISOString(),
    enemyCounts,
    allyCounts,
    seed,
    matchSignature: buildMatchSignature("simulation", enemyCounts, allyCounts),
    summaryText,
    logText: detailText,
    usedCapacity: result.usedCapacity,
    usedPoints: calculateArmyPoints(allyCounts),
    roundingMode: result.roundingMode,
    lostBlood: result.lostBloodTotal,
    expectedWinner: result.winner,
    expectedLostBlood: result.lostBloodTotal,
    expectedUsedCapacity: result.usedCapacity,
    expectedUsedPoints: calculateArmyPoints(allyCounts),
    expectedAllyLosses: { ...(result.allyLosses || {}) },
    expectedVariantSignature: buildVariantSignature(result)
  };
  currentSimulationResult = {
    winner: result.winner,
    lostBloodTotal: result.lostBloodTotal,
    variantSignature: buildVariantSignature(result),
    roundingMode: result.roundingMode,
    seed
  };
  currentKnifeEdgeRisk = analyzeKnifeEdgeRisk(enemyCounts, allyCounts, {
    seed: Number.isInteger(seed) ? seed : 1,
    result,
    roundingMode: result.roundingMode
  });
  reportWrongSimulationBtn.disabled = false;
  renderSimulationMeta(currentSimulationReport, currentSimulationResult);
  closeVariantLogModal();
  void refreshMatchedActualReport();
  syncSimulationAdminActions();
  startVariantAnalysis(enemyCounts, allyCounts, result);
  startNearbyAdviceAnalysis(enemyCounts, allyCounts, result);
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
    syncSimulationAdminActions();
    syncVariantInsightsUi();
  }, 0);
}

function startNearbyAdviceAnalysis(enemyCounts, allyCounts, currentResult) {
  const runId = nearbyAdviceRunId + 1;
  nearbyAdviceRunId = runId;
  currentNearbyAdvice = {
    loading: true,
    expanded: false,
    hasContent: true,
    suggestions: [],
    closestSuggestion: null,
    mode: currentResult?.winner === "enemy" ? "defeat" : "victory"
  };
  syncNearbyAdviceUi();

  window.setTimeout(() => {
    const analysis = analyzeNearbyAdvice(enemyCounts, allyCounts, currentResult);
    if (runId !== nearbyAdviceRunId) {
      return;
    }
    currentNearbyAdvice = analysis;
    syncNearbyAdviceUi();
  }, 0);
}

function openWrongReportModal(report) {
  pendingWrongSimulationReport = report;
  clearWrongReportError();
  expectedWrongSummaryPreview.innerHTML = "";
  renderStyledLines(report.summaryText.split("\n"), expectedWrongSummaryPreview);
  expectedWrongLosses = extractLossesFromSummary(report.summaryText);
  cachedVictoryActualLosses = { ...expectedWrongLosses };
  cachedVictoryActualCapacity = String(report.usedCapacity || 0);
  actualCapacityInput.value = String(report.usedCapacity || 0);
  actualNoteInput.value = "";
  setActualLossInputs(expectedWrongLosses);
  setActualOutcomeMode(inferActualOutcomeModeFromLine(extractOutcomeLine(report.summaryText)));
  renderActualWrongSummaryPreview();
  wrongReportModal.hidden = false;
}

function closeWrongReportModal() {
  wrongReportModal.hidden = true;
  pendingWrongSimulationReport = null;
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

function normalizeActualOutcomeMode(mode) {
  return mode === "defeat" ? "defeat" : "victory";
}

function getActualOutcomeLineForMode(mode) {
  return normalizeActualOutcomeMode(mode) === "defeat"
    ? ">> Muttefikler yenildi! Savas meydani dusmanin."
    : ">> Dusman yenildi! Zafer muttefiklerin.";
}

function inferActualOutcomeModeFromLine(outcomeLine) {
  return inferWinnerFromOutcomeLine(outcomeLine) === "enemy" ? "defeat" : "victory";
}

function getPendingWrongReportAllyCounts() {
  return pendingWrongSimulationReport?.allyCounts || pendingWrongSimulationReport?.recommendationCounts || {};
}

function collectActualLossInputsRaw() {
  const losses = {};
  ALLY_UNITS.forEach((unit) => {
    losses[unit.key] = parseCount(actualLossInputs[unit.key].value || "0", unit.label);
  });
  return losses;
}

function setActualLossInputs(losses = {}) {
  ALLY_UNITS.forEach((unit) => {
    actualLossInputs[unit.key].value = String(losses[unit.key] || 0);
  });
}

if (nearbyAdviceToggleBtn) {
  nearbyAdviceToggleBtn.addEventListener("click", () => {
    if (!currentNearbyAdvice || !currentNearbyAdvice.hasContent) {
      return;
    }
    currentNearbyAdvice.expanded = !currentNearbyAdvice.expanded;
    syncNearbyAdviceUi();
  });
}

function setActualOutcomeMode(mode) {
  currentActualOutcomeMode = normalizeActualOutcomeMode(mode);
  actualOutcomeInput.value = getActualOutcomeLineForMode(currentActualOutcomeMode);

  if (currentActualOutcomeMode === "defeat") {
    cachedVictoryActualLosses = collectActualLossInputsRaw();
    cachedVictoryActualCapacity = actualCapacityInput.value;
    const fullLosses = {};
    const allyCounts = getPendingWrongReportAllyCounts();
    ALLY_UNITS.forEach((unit) => {
      fullLosses[unit.key] = Number(allyCounts[unit.key] || 0);
    });
    setActualLossInputs(fullLosses);
    if (pendingWrongSimulationReport) {
      actualCapacityInput.value = String(pendingWrongSimulationReport.usedCapacity || 0);
    }
  } else {
    const nextLosses = hasPositiveLosses(cachedVictoryActualLosses)
      ? cachedVictoryActualLosses
      : expectedWrongLosses;
    setActualLossInputs(nextLosses);
    if (cachedVictoryActualCapacity !== "") {
      actualCapacityInput.value = cachedVictoryActualCapacity;
    }
  }

  const isDefeat = currentActualOutcomeMode === "defeat";
  actualOutcomeModeButtons.forEach((button) => {
    const active = normalizeActualOutcomeMode(button.dataset.actualOutcomeMode) === currentActualOutcomeMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  ALLY_UNITS.forEach((unit) => {
    actualLossInputs[unit.key].disabled = isDefeat;
  });
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
  return collectActualLossInputsRaw();
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
  const actualOutcomeLine = getActualOutcomeLineForMode(currentActualOutcomeMode);
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
    actualWinner: currentActualOutcomeMode === "defeat" ? "enemy" : "ally",
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
    lines.push(`- ${String(count).padStart(3)} ${getSummaryUnitName(unit.key)} (${blood} kan)`);
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

function buildMatchSignature(source, enemyCounts, allyCounts) {
  const enemySignature = ENEMY_UNITS.map((unit) => enemyCounts[unit.key] || 0).join("|");
  const allySignature = ALLY_UNITS.map((unit) => allyCounts[unit.key] || 0).join("|");
  return `${source}|${enemySignature}|${allySignature}`;
}

function getCurrentSimulationMatchSignature() {
  if (!currentSimulationReport) {
    return "";
  }
  return currentSimulationReport.matchSignature || buildMatchSignature(
    "simulation",
    currentSimulationReport.enemyCounts,
    currentSimulationReport.allyCounts
  );
}

async function refreshMatchedActualReport() {
  matchedActualPanel.innerHTML = "";
  if (!currentSimulationReport) {
    wrongReports = [];
    return;
  }
  const signature = getCurrentSimulationMatchSignature();
  if (!signature) {
    wrongReports = [];
    return;
  }
  if (!window.BTFirebase || typeof window.BTFirebase.findWrongReportsByMatchSignature !== "function") {
    wrongReports = await loadWrongReports();
  } else {
    try {
      wrongReports = await window.BTFirebase.findWrongReportsByMatchSignature("simulation", signature);
    } catch (error) {
      console.warn("Hedefli wrong report okunamadi.", error);
      wrongReports = await loadWrongReports();
    }
  }
  renderMatchedActualReport();
}

function renderMatchedActualReport() {
  matchedActualPanel.innerHTML = "";
  if (!currentSimulationReport) {
    return;
  }

  const signature = getCurrentSimulationMatchSignature();
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
  const expectedSummaryText = getLossAdjustedSummaryText(
    matched.summaryText || currentSimulationReport.summaryText || "",
    matched.expectedAllyLosses || extractLossesFromSummary(matched.summaryText || currentSimulationReport.summaryText || "")
  );
  renderStyledLines(expectedSummaryText.split("\n"), expectedBlock);
  expectedWrap.append(expectedTitle, expectedBlock);

  const actualWrap = document.createElement("section");
  actualWrap.className = "wrong-summary-block";
  const actualTitle = document.createElement("h3");
  actualTitle.textContent = "Gercek";
  const actualBlock = document.createElement("div");
  actualBlock.className = "terminal-block";
  const actualSummaryText = getLossAdjustedSummaryText(
    matched.actualSummaryText || "",
    matched.actualLosses || extractLossesFromSummary(matched.actualSummaryText || "")
  );
  renderStyledLines(actualSummaryText.split("\n"), actualBlock);
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

function paintLogPanels() {
  const translate = (window.BattleCore && window.BattleCore.translateLogText) || ((t) => t);
  const baseSummaryText = getLossAdjustedSummaryText(
    lastSummaryTextTr,
    currentSimulationReport?.expectedAllyLosses || extractLossesFromSummary(lastSummaryTextTr)
  );
  const summaryText = translate(baseSummaryText, currentLogLang);
  const detailText = translate(lastLogTextTr, currentLogLang);

  summaryPanel.innerHTML = "";
  if (lastSummaryTextTr) {
    if (currentKnifeEdgeRisk?.isKnifeEdge) {
      summaryPanel.appendChild(buildKnifeEdgeNotice(currentKnifeEdgeRisk));
    }
    const summaryShell = document.createElement("div");
    summaryShell.className = "loss-summary-shell";
    const summaryHead = document.createElement("div");
    summaryHead.className = "loss-summary-head";
    const summaryTitle = document.createElement("span");
    summaryTitle.className = "loss-summary-label";
    summaryTitle.textContent = "Kayip Ozeti";
    summaryHead.appendChild(summaryTitle);
    summaryHead.appendChild(createLossReductionToggleButton(isLossReductionActive, () => {
      isLossReductionActive = !isLossReductionActive;
      renderSimulationMeta(currentSimulationReport, currentSimulationResult);
      paintLogPanels();
      void refreshMatchedActualReport();
    }));
    const summaryBlock = document.createElement("div");
    summaryBlock.className = "terminal-block";
    renderStyledLines(summaryText.split("\n"), summaryBlock);
    summaryShell.append(summaryHead, summaryBlock);
    summaryPanel.appendChild(summaryShell);
  }

  logOutput.innerHTML = "";
  if (lastLogTextTr) {
    renderStyledLines(detailText.split("\n"), logOutput);
  }
}

function buildKnifeEdgeNotice(risk) {
  const card = document.createElement("article");
  card.className = `knife-edge-warning severity-${risk.severity || "medium"}`;

  const title = document.createElement("strong");
  title.textContent = "Bicak sirti dizilis";

  const body = document.createElement("span");
  const exampleText = risk.examples?.length ? ` Ornek: ${risk.examples.join(", ")}.` : "";
  body.textContent = `${risk.flipCount}/${risk.checkedCount} yakin varyasyonda sonuc kayba donuyor.${exampleText}`;

  card.append(title, body);
  return card;
}

function analyzeSimulationVariants(enemyCounts, allyCounts, currentResult) {
  const currentSignature = buildVariantSignature(currentResult);
  const fixedSeeds = Array.from({ length: VARIANT_SAMPLE_COUNT }, (_, index) => index + 1);
  const roundingMode = normalizeRoundingMode(currentResult?.roundingMode);
  const fixedAnalysis = analyzeSimulationSeedSet(enemyCounts, allyCounts, fixedSeeds, currentSignature, roundingMode);
  const randomSeeds = buildRandomBenchmarkSeeds(RANDOM_BENCHMARK_SAMPLE_COUNT);
  const randomBenchmark = analyzeSimulationSeedSet(enemyCounts, allyCounts, randomSeeds, "", roundingMode);

  return {
    ...fixedAnalysis,
    randomBenchmark: {
      sampleCount: randomBenchmark.sampleCount,
      averageLostBlood: randomBenchmark.averageLostBlood,
      victoryProbability: randomBenchmark.victoryProbability,
      defeatProbability: randomBenchmark.defeatProbability,
      bestVariant: randomBenchmark.bestVariant,
      worstVariant: randomBenchmark.worstVariant,
      sampleSeeds: randomSeeds.slice(0, 5)
    }
  };
}

function analyzeSimulationSeedSet(enemyCounts, allyCounts, seeds, currentSignature = "", roundingMode = "safe") {
  const variantsBySignature = new Map();

  for (const seed of seeds) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false, roundingMode });
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

  const variants = [...variantsBySignature.values()]
    .map((entry) => ({
      ...entry,
      probability: entry.count / seeds.length,
      isCurrent: currentSignature ? entry.signature === currentSignature : false
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
    sampleCount: seeds.length,
    enemyCounts: { ...enemyCounts },
    allyCounts: { ...allyCounts },
    variants,
    bestVariant,
    worstVariant,
    averageLostBlood,
    victoryProbability,
    defeatProbability,
    expanded: false,
    visibleCount: Math.min(VARIANT_INITIAL_VISIBLE_COUNT, variants.length),
    focusedVariantIndex: -1
  };
}

function buildRandomBenchmarkSeeds(count = RANDOM_BENCHMARK_SAMPLE_COUNT) {
  const seedRange = RANDOM_BENCHMARK_SEED_MAX - RANDOM_BENCHMARK_SEED_MIN + 1;
  const uniqueSeeds = new Set();
  const seeds = [];

  while (seeds.length < count) {
    const seed = RANDOM_BENCHMARK_SEED_MIN + getRuntimeRandomInt(seedRange);
    if (uniqueSeeds.has(seed)) {
      continue;
    }
    uniqueSeeds.add(seed);
    seeds.push(seed);
  }

  return seeds;
}

function getRuntimeRandomInt(maxExclusive) {
  const limit = Math.max(1, Math.floor(maxExclusive));
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % limit;
  }
  return Math.floor(Math.random() * limit);
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

function syncNearbyAdviceUi() {
  if (!nearbyAdvicePanel || !nearbyAdviceToggleBtn || !nearbyAdviceDetailsPanel) {
    return;
  }

  const isLoading = Boolean(currentNearbyAdvice?.loading);
  const hasContent = Boolean(currentNearbyAdvice?.hasContent);
  nearbyAdvicePanel.hidden = !isLoading && !hasContent;
  nearbyAdviceToggleBtn.hidden = isLoading || !hasContent;
  nearbyAdviceDetailsPanel.hidden = !isLoading && (!hasContent || !currentNearbyAdvice?.expanded);

  if (isLoading) {
    nearbyAdviceToggleBtn.setAttribute("aria-expanded", "false");
    nearbyAdviceDetailsPanel.hidden = false;
    nearbyAdviceDetailsPanel.innerHTML = '<div class="variant-loading-state">Yakin ordu onerileri araniyor...</div>';
    return;
  }

  if (!hasContent || !currentNearbyAdvice) {
    nearbyAdviceToggleBtn.setAttribute("aria-expanded", "false");
    nearbyAdviceDetailsPanel.innerHTML = "";
    return;
  }

  nearbyAdviceToggleBtn.textContent = currentNearbyAdvice.expanded
    ? "Yakin Ordu Onerilerini Gizle"
    : currentNearbyAdvice.toggleLabel;
  nearbyAdviceToggleBtn.setAttribute("aria-expanded", String(currentNearbyAdvice.expanded));

  if (!currentNearbyAdvice.expanded) {
    nearbyAdviceDetailsPanel.innerHTML = "";
    return;
  }

  renderNearbyAdviceDetails(currentNearbyAdvice);
}

function renderNearbyAdviceDetails(analysis) {
  nearbyAdviceDetailsPanel.innerHTML = "";

  const head = document.createElement("div");
  head.className = "variant-details-head";
  head.innerHTML = `
    <strong>${analysis.title}</strong>
    <span>Seed ${analysis.seed ?? "-"} / ${analysis.checkedCount} yakin kombinasyon tarandi.</span>
  `;

  const summary = document.createElement("div");
  summary.className = "nearby-advice-summary";
  if (analysis.mode === "defeat" && Number.isInteger(analysis.winningFoundAtUnits)) {
    summary.appendChild(buildNearbySummaryCard("Ilk kazanan seviye", `+${analysis.winningFoundAtUnits} birim`, "Daha fazla ekleme taranmadi."));
  } else {
    summary.appendChild(buildNearbySummaryCard("Tarama siniri", `+${analysis.maxExtraUnits} birim`, "Yakin cevre eklemeleri tarandi."));
  }
  if (analysis.suggestions.length > 0) {
    summary.appendChild(buildNearbySummaryCard("Bulunan oneriler", String(analysis.suggestions.length), analysis.mode === "defeat" ? "En yakin kazananlar" : "Kaybi azaltanlar"));
  } else if (analysis.closestSuggestion) {
    summary.appendChild(buildNearbySummaryCard("En yakin aday", analysis.closestSuggestion.deltaLabel, "Ama sonuc hala yeterli degil."));
  }

  const list = document.createElement("div");
  list.className = "nearby-advice-list";

  if (analysis.suggestions.length > 0) {
    analysis.suggestions.forEach((suggestion, index) => {
      list.appendChild(buildNearbyAdviceCard(suggestion, analysis.mode, index === 0));
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "knife-edge-warning severity-medium";
    const title = document.createElement("strong");
    title.textContent = "Yakin oneride sonuc bulunamadi";
    const body = document.createElement("span");
    body.textContent = analysis.emptyText;
    empty.append(title, body);
    list.appendChild(empty);

    if (analysis.closestSuggestion) {
      list.appendChild(buildNearbyAdviceCard(analysis.closestSuggestion, "fallback", true));
    }
  }

  nearbyAdviceDetailsPanel.append(head, summary, list);
}

function buildNearbySummaryCard(label, value, meta) {
  const card = document.createElement("article");
  card.className = "variant-summary-card";
  card.innerHTML = `
    <span class="variant-summary-label">${label}</span>
    <strong class="variant-summary-value">${value}</strong>
    <span class="variant-summary-meta">${meta}</span>
  `;
  return card;
}

function buildNearbyAdviceCard(suggestion, mode, isPrimary = false) {
  const card = document.createElement("article");
  card.className = `nearby-advice-card${isPrimary ? " is-primary" : ""}`;
  const titleText = mode === "defeat"
    ? `${suggestion.deltaLabel} eklersen kazanirsin`
    : mode === "victory"
      ? `${suggestion.deltaLabel} eklersen kaybin azalir`
      : `${suggestion.deltaLabel} en yakin aday`;
  const metaText = mode === "defeat"
    ? "Sonucu zafere cevirir"
    : mode === "victory"
      ? "Galibiyeti koruyup kaybi iyilestirir"
      : "Yakin cevrede bulunan en iyi aday";

  card.innerHTML = `
    <div class="nearby-advice-head">
      <div>
        <strong>${titleText}</strong>
        <span>${metaText}</span>
      </div>
      <div class="variant-badges">
        <span class="variant-badge">Ek puan <strong>+${suggestion.addedPoints}</strong></span>
        <span class="variant-badge">Ek birlik <strong>+${suggestion.addedUnits}</strong></span>
      </div>
    </div>
  `;

  const stats = document.createElement("div");
  stats.className = "nearby-advice-stats";
  stats.append(
    buildNearbyAdviceStat("Sonuc", suggestion.winner === "ally" ? "Zafer" : "Maglubiyet"),
    buildNearbyAdviceStat("Kan kaybi", `${suggestion.lostBlood} (${formatSignedDeltaValue(suggestion.lostBloodDelta)})`),
    buildNearbyAdviceStat("Toplam kayip", `${suggestion.lossUnits} (${formatSignedDeltaValue(suggestion.lossUnitDelta)})`),
    buildNearbyAdviceStat("Yeni kapasite", String(suggestion.result?.usedCapacity ?? 0))
  );
  card.appendChild(stats);
  return card;
}

function buildNearbyAdviceStat(label, value) {
  const wrap = document.createElement("span");
  wrap.innerHTML = `<small>${label}</small><strong>${value}</strong>`;
  return wrap;
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
    buildVariantSummaryCard("En iyi sonuc", analysis.bestVariant, () => {
      focusVariantInDetails(analysis, analysis.bestVariant);
    }),
    buildVariantSummaryCard("En kotu sonuc", analysis.worstVariant, () => {
      focusVariantInDetails(analysis, analysis.worstVariant);
    }),
    buildAverageSummaryCard(analysis.averageLostBlood),
    buildProbabilitySummaryCard("Zafer olasiligi", analysis.victoryProbability),
    buildProbabilitySummaryCard("Maglubiyet olasiligi", analysis.defeatProbability, () => {
      const defeatVariant = getMostLikelyOutcomeVariant(analysis, "enemy");
      if (!defeatVariant) {
        return;
      }
      focusVariantInDetails(analysis, defeatVariant);
      showVariantInMainResult(analysis, defeatVariant);
    })
  );

  const randomBenchmarkPanel = analysis.randomBenchmark
    ? buildRandomBenchmarkPanel(analysis.randomBenchmark, analysis.sampleCount)
    : null;

  const list = document.createElement("div");
  list.className = "variant-list";

  for (let index = 0; index < analysis.visibleCount; index += 1) {
    const variant = analysis.variants[index];
    const card = document.createElement("article");
    card.className = `variant-card${variant.isCurrent ? " is-primary" : ""}${analysis.focusedVariantIndex === index ? " is-focused" : ""}`;
    card.dataset.variantIndex = String(index);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${index + 1}. ${variant.winner === "ally" ? "Zafer" : "Maglubiyet"} senaryosunu ana sonuc ekraninda goster`);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      showVariantInMainResult(analysis, variant);
    });
    card.addEventListener("keydown", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      showVariantInMainResult(analysis, variant);
    });

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

    const actions = document.createElement("div");
    actions.className = "variant-actions";

    const causePanel = document.createElement("div");
    causePanel.className = "variant-cause-summary";
    causePanel.hidden = !variant.causeExpanded;

    const causeButton = document.createElement("button");
    causeButton.type = "button";
    causeButton.className = "button button-ghost variant-cause-toggle";
    causeButton.setAttribute("aria-expanded", String(Boolean(variant.causeExpanded)));
    causeButton.textContent = variant.causeExpanded ? "Nedeni Gizle" : "Neden?";
    causeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      variant.causeExpanded = !variant.causeExpanded;
      if (variant.causeExpanded) {
        variant.causeSummary = variant.causeSummary || buildVariantCauseSummary(analysis, variant);
        renderVariantCauseSummary(causePanel, variant.causeSummary, variant, analysis);
      }
      causePanel.hidden = !variant.causeExpanded;
      causeButton.setAttribute("aria-expanded", String(Boolean(variant.causeExpanded)));
      causeButton.textContent = variant.causeExpanded ? "Nedeni Gizle" : "Neden?";
    });

    if (isAdminSession) {
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "button button-secondary";
      saveButton.textContent = "Onayli Dovuse Kaydet";
      saveButton.addEventListener("click", async () => {
        await saveVariantAsApproved(analysis, variant, saveButton);
      });
      actions.appendChild(saveButton);
    }

    actions.appendChild(causeButton);

    card.append(headRow, losses, note, actions, causePanel);
    if (variant.causeExpanded && variant.causeSummary) {
      renderVariantCauseSummary(causePanel, variant.causeSummary, variant, analysis);
    }
    list.appendChild(card);
  }

  variantDetailsPanel.append(head, summary);
  if (randomBenchmarkPanel) {
    variantDetailsPanel.appendChild(randomBenchmarkPanel);
  }
  variantDetailsPanel.appendChild(list);

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

  scrollToFocusedVariantCard(analysis);
}

function syncSimulationAdminActions() {
  if (!simulationAdminActionsPanel) {
    return;
  }

  simulationAdminActionsPanel.innerHTML = "";

  const shouldShowFavoriteActions = Boolean(
    isAdminSession &&
    currentSimulationReport &&
    currentSimulationResult
  );

  simulationAdminActionsPanel.hidden = !shouldShowFavoriteActions;
  if (!shouldShowFavoriteActions) {
    return;
  }

  const card = document.createElement("article");
  card.className = "saved-match-card";

  const head = document.createElement("div");
  head.className = "saved-match-head";
  head.innerHTML = "<strong>Kayit Islemleri</strong><span>Mevcut simulasyon sonucunu onayli veya favori olarak kaydedebilirsin.</span>";

  const actions = document.createElement("div");
  actions.className = "actions actions-inline";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "button button-secondary";
  saveButton.textContent = "Onayli Dovuse Kaydet";
  saveButton.addEventListener("click", async () => {
    await saveCurrentSimulationAsApproved(saveButton);
  });

  const favoriteButton = document.createElement("button");
  favoriteButton.type = "button";
  favoriteButton.className = "button button-secondary";
  favoriteButton.textContent = "Favorilere Ekle";
  favoriteButton.addEventListener("click", async () => {
    await saveCurrentSimulationAsFavorite(favoriteButton);
  });

  actions.append(saveButton, favoriteButton);
  card.append(head, actions);
  simulationAdminActionsPanel.appendChild(card);
}

function focusVariantInDetails(analysis, variant) {
  if (!analysis || !variant) {
    return;
  }

  const targetIndex = analysis.variants.findIndex((item) => item.signature === variant.signature);
  if (targetIndex < 0) {
    return;
  }

  analysis.focusedVariantIndex = targetIndex;
  if (analysis.visibleCount <= targetIndex) {
    analysis.visibleCount = Math.min(
      analysis.variants.length,
      Math.max(targetIndex + 1, analysis.visibleCount + VARIANT_VISIBLE_STEP)
    );
  }
  renderVariantDetails(analysis);
}

function scrollToFocusedVariantCard(analysis) {
  if (!analysis || analysis.focusedVariantIndex < 0) {
    return;
  }

  const target = variantDetailsPanel.querySelector(`[data-variant-index="${analysis.focusedVariantIndex}"]`);
  if (!target) {
    return;
  }

  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function showVariantInMainResult(analysis, variant) {
  if (!analysis || !variant) {
    return;
  }

  const enemyCounts = { ...(analysis.enemyCounts || {}) };
  const allyCounts = { ...(analysis.allyCounts || {}) };
  const logView = ensureVariantLogView(enemyCounts, allyCounts, variant);
  const roundingMode = normalizeRoundingMode(currentSimulationResult?.roundingMode || currentSimulationReport?.roundingMode);
  const result = logView.result || simulateBattle(enemyCounts, allyCounts, {
    seed: logView.seed,
    collectLog: true,
    roundingMode
  });
  const variantSignature = buildVariantSignature(result);

  isLossReductionActive = false;
  lastSummaryTextTr = logView.summaryText;
  lastLogTextTr = logView.detailText;

  currentSimulationReport = {
    source: "simulation",
    sourceLabel: "Simulasyon",
    reportedAt: new Date().toISOString(),
    enemyCounts,
    allyCounts,
    seed: logView.seed,
    matchSignature: buildMatchSignature("simulation", enemyCounts, allyCounts),
    summaryText: logView.summaryText,
    logText: logView.detailText,
    usedCapacity: result.usedCapacity,
    usedPoints: calculateArmyPoints(allyCounts),
    roundingMode: result.roundingMode,
    lostBlood: result.lostBloodTotal,
    expectedWinner: result.winner,
    expectedLostBlood: result.lostBloodTotal,
    expectedUsedCapacity: result.usedCapacity,
    expectedUsedPoints: calculateArmyPoints(allyCounts),
    expectedAllyLosses: { ...(result.allyLosses || {}) },
    expectedVariantSignature: variantSignature
  };
  currentSimulationResult = {
    winner: result.winner,
    lostBloodTotal: result.lostBloodTotal,
    variantSignature,
    roundingMode: result.roundingMode,
    seed: logView.seed,
    allyLosses: { ...(result.allyLosses || {}) }
  };

  analysis.variants.forEach((item) => {
    item.isCurrent = item.signature === variantSignature;
  });
  currentVariantAnalysis = analysis;
  currentKnifeEdgeRisk = analyzeKnifeEdgeRisk(enemyCounts, allyCounts, {
    seed: logView.seed,
    result,
    roundingMode: result.roundingMode
  });

  reportWrongSimulationBtn.disabled = false;
  renderSimulationMeta(currentSimulationReport, currentSimulationResult);
  paintLogPanels();
  closeVariantLogModal();
  void refreshMatchedActualReport();
  syncSimulationAdminActions();
  syncVariantInsightsUi();
  startNearbyAdviceAnalysis(enemyCounts, allyCounts, result);
  statusLabel.textContent = `Temsilci seed ${logView.seed} gosteriliyor`;

  window.requestAnimationFrame(() => {
    summaryPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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

const VARIANT_CAUSE_SEED_LIMIT = 40;
const VARIANT_CAUSE_RIVAL_SEED_LIMIT = 60;
const VARIANT_CAUSE_MIN_LIFT = 0.2;

function pickSpreadSeeds(seeds, limit) {
  const list = Array.isArray(seeds) ? seeds : [];
  if (list.length <= limit) {
    return [...list];
  }
  const step = list.length / limit;
  const picked = [];
  for (let index = 0; index < limit; index += 1) {
    picked.push(list[Math.floor(index * step)]);
  }
  return picked;
}

function collectRivalVariantSeeds(analysis, variant, limit) {
  const others = (analysis?.variants || []).filter(
    (item) => item !== variant && Array.isArray(item.seeds) && item.seeds.length > 0
  );
  if (others.length === 0) {
    return [];
  }
  const perVariant = Math.max(1, Math.floor(limit / others.length));
  const pool = [];
  others.forEach((item) => {
    pool.push(...pickSpreadSeeds(item.seeds, perVariant));
  });
  return pickSpreadSeeds(pool, limit);
}

function collectVariantRouteStats(analysis, seeds) {
  const roundingMode = normalizeRoundingMode(
    currentSimulationResult?.roundingMode || currentSimulationReport?.roundingMode
  );
  const byRoute = new Map();
  let scanned = 0;

  seeds.forEach((seed) => {
    const result = simulateBattle(analysis.enemyCounts, analysis.allyCounts, {
      seed,
      collectLog: true,
      roundingMode
    });
    const events = extractVariantCauseEvents(result.logText);
    if (events.length === 0) {
      return;
    }

    scanned += 1;
    const routesSeenInSeed = new Set();
    events.forEach((event) => {
      const entry = byRoute.get(event.route) || {
        route: event.route,
        attacker: event.attacker,
        target: event.target,
        seedCount: 0,
        damages: new Set(),
        seedDamages: new Map(),
        breakdowns: new Map(),
        reasons: new Map()
      };
      if (!routesSeenInSeed.has(event.route)) {
        entry.seedCount += 1;
        routesSeenInSeed.add(event.route);
      }
      if (event.damage) {
        entry.damages.add(event.damage);
        const damageValue = Number(event.damage);
        if (Number.isFinite(damageValue)) {
          const seedValues = entry.seedDamages.get(seed) || new Set();
          seedValues.add(damageValue);
          entry.seedDamages.set(seed, seedValues);

          if (Number.isFinite(event.unitCount)) {
            const breakdown = entry.breakdowns.get(damageValue) || {
              unitCounts: new Set(),
              multipliers: new Set(),
              attackValue: event.attackValue
            };
            breakdown.unitCounts.add(event.unitCount);
            if (Number.isFinite(event.multiplier)) {
              breakdown.multipliers.add(event.multiplier);
            }
            entry.breakdowns.set(damageValue, breakdown);
          }
        }
      }
      event.reasons.forEach((reason) => {
        const reasonSeeds = entry.reasons.get(reason) || new Set();
        reasonSeeds.add(seed);
        entry.reasons.set(reason, reasonSeeds);
      });
      byRoute.set(event.route, entry);
    });
  });

  return { scanned, byRoute };
}

function groupRouteStatsByAttacker(byRoute) {
  const grouped = new Map();
  byRoute.forEach((entry) => {
    const list = grouped.get(entry.attacker) || [];
    list.push(entry);
    grouped.set(entry.attacker, list);
  });
  return grouped;
}

function normalizeRouteDamages(damages) {
  return [...damages]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function topRouteReasons(reasons, limit) {
  return [...reasons.entries()]
    .sort((left, right) => right[1].size - left[1].size)
    .slice(0, limit)
    .map(([reason, seedSet]) => ({ reason, count: seedSet.size }));
}

function summarizeRouteDamageSplit(ownEntry, rivalEntry, rivalSample) {
  if (!rivalEntry || rivalSample <= 0) {
    return null;
  }

  const ownValues = normalizeRouteDamages(ownEntry.damages);
  if (ownValues.length === 0) {
    return null;
  }

  const ownMin = ownValues[0];
  const ownMax = ownValues[ownValues.length - 1];
  const outsideValues = [];
  let outsideSeedCount = 0;

  rivalEntry.seedDamages.forEach((seedValues) => {
    let outside = false;
    seedValues.forEach((value) => {
      if (value < ownMin || value > ownMax) {
        outside = true;
        outsideValues.push(value);
      }
    });
    if (outside) {
      outsideSeedCount += 1;
    }
  });

  const rate = outsideSeedCount / rivalSample;
  if (rate < VARIANT_CAUSE_MIN_LIFT) {
    return null;
  }

  const ownUnitCounts = new Set();
  const ownMultipliers = new Set();
  let attackValue = null;
  ownEntry.breakdowns.forEach((breakdown) => {
    breakdown.unitCounts.forEach((value) => ownUnitCounts.add(value));
    breakdown.multipliers.forEach((value) => ownMultipliers.add(value));
    if (attackValue === null && Number.isFinite(breakdown.attackValue)) {
      attackValue = breakdown.attackValue;
    }
  });

  const rivalUnitCounts = new Set();
  const outsideSet = new Set(outsideValues);
  rivalEntry.breakdowns.forEach((breakdown, damageValue) => {
    if (!outsideSet.has(damageValue)) {
      return;
    }
    breakdown.unitCounts.forEach((value) => rivalUnitCounts.add(value));
  });

  const sharedUnitCount = [...rivalUnitCounts].some((value) => ownUnitCounts.has(value));
  const driver = ownUnitCounts.size === 0 || rivalUnitCounts.size === 0
    ? "unknown"
    : sharedUnitCount
      ? "rounding"
      : "units";

  return {
    ownMin,
    ownMax,
    rate,
    below: outsideValues.filter((value) => value < ownMin).sort((left, right) => left - right),
    above: outsideValues.filter((value) => value > ownMax).sort((left, right) => left - right),
    driver,
    attackValue,
    ownUnitCounts: [...ownUnitCounts].sort((left, right) => left - right),
    rivalUnitCounts: [...rivalUnitCounts].sort((left, right) => left - right),
    multipliers: [...ownMultipliers].sort((left, right) => left - right)
  };
}

function buildVariantCauseSummary(analysis, variant) {
  const ownSeeds = pickSpreadSeeds(variant?.seeds, VARIANT_CAUSE_SEED_LIMIT);
  const own = collectVariantRouteStats(analysis, ownSeeds);
  const rivalSeeds = collectRivalVariantSeeds(analysis, variant, VARIANT_CAUSE_RIVAL_SEED_LIMIT);
  const rival = collectVariantRouteStats(analysis, rivalSeeds);

  const ownSample = Math.max(1, own.scanned);
  const rivalSample = rival.scanned;
  const ownByAttacker = groupRouteStatsByAttacker(own.byRoute);
  const rivalByAttacker = groupRouteStatsByAttacker(rival.byRoute);

  const decisive = [];
  if (rivalSample > 0) {
    ownByAttacker.forEach((routes, attacker) => {
      const rivalRoutes = rivalByAttacker.get(attacker) || [];
      routes.forEach((entry) => {
        const rivalEntry = rivalRoutes.find((item) => item.route === entry.route);
        const ownRate = entry.seedCount / ownSample;
        const rivalRate = rivalEntry ? rivalEntry.seedCount / rivalSample : 0;
        const lift = ownRate - rivalRate;
        const base = {
          route: entry.route,
          attacker,
          target: entry.target,
          seedCount: entry.seedCount,
          sampleCount: ownSample,
          probability: ownRate,
          rivalSampleCount: rivalSample,
          damages: normalizeRouteDamages(entry.damages),
          reasons: topRouteReasons(entry.reasons, 1)
        };

        if (lift >= VARIANT_CAUSE_MIN_LIFT) {
          const alternatives = rivalRoutes
            .filter((item) => item.route !== entry.route)
            .sort((left, right) => right.seedCount - left.seedCount)
            .slice(0, 2)
            .map((item) => ({
              target: item.target,
              probability: item.seedCount / rivalSample
            }));

          decisive.push({
            ...base,
            kind: "target",
            rivalProbability: rivalRate,
            lift,
            alternatives
          });
          return;
        }

        if (ownRate < 0.5) {
          return;
        }

        const damageSplit = summarizeRouteDamageSplit(entry, rivalEntry, rivalSample);
        if (!damageSplit) {
          return;
        }

        decisive.push({
          ...base,
          kind: "damage",
          lift: damageSplit.rate,
          damageSplit
        });
      });
    });
  }

  decisive.sort((left, right) =>
    right.lift - left.lift ||
    right.probability - left.probability ||
    left.route.localeCompare(right.route, "tr")
  );

  const targetCountByAttacker = new Map();
  ownByAttacker.forEach((routes, attacker) => {
    targetCountByAttacker.set(attacker, routes.length);
  });

  const entries = [...own.byRoute.values()]
    .map((entry) => ({
      route: entry.route,
      seedCount: entry.seedCount,
      sampleCount: ownSample,
      probability: entry.seedCount / ownSample,
      damages: normalizeRouteDamages(entry.damages),
      reasons: topRouteReasons(entry.reasons, 2),
      variationScore:
        entry.seedCount < ownSample ? 3 : targetCountByAttacker.get(entry.attacker) > 1 ? 2 : 0
    }))
    .sort((left, right) =>
      right.variationScore - left.variationScore ||
      right.seedCount - left.seedCount ||
      left.route.localeCompare(right.route, "tr")
    )
    .slice(0, 6);

  return {
    scannedSeedCount: own.scanned,
    rivalSeedCount: rival.scanned,
    decisive: decisive.slice(0, 6),
    entries
  };
}

function extractVariantCauseEvents(logText) {
  const lines = String(logText || "").split("\n");
  const events = [];
  let currentEvent = null;

  const flushEvent = () => {
    if (currentEvent?.route) {
      events.push(currentEvent);
    }
    currentEvent = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (/^Hamle\s+\d+/.test(trimmed)) {
      flushEvent();
      currentEvent = {
        reasons: [],
        route: "",
        attacker: "",
        target: "",
        damage: "",
        unitCount: null,
        attackValue: null,
        multiplier: null
      };
      return;
    }
    if (!currentEvent) {
      return;
    }

    if (trimmed.startsWith("- ") && !currentEvent.hasAttack) {
      currentEvent.reasons.push(trimmed.slice(2).trim());
      return;
    }

    const attackMatch = trimmed.match(/^(.+?)\s+→\s+(.+?)\s*$/);
    if (attackMatch) {
      currentEvent.attacker = attackMatch[1].trim();
      currentEvent.target = attackMatch[2].trim();
      currentEvent.route = `${currentEvent.attacker} → ${currentEvent.target}`;
      currentEvent.hasAttack = true;
      return;
    }

    if (trimmed.startsWith("Hesap:")) {
      const damageMatch = trimmed.match(/=\s*([\d.]+)\s+hasar/);
      currentEvent.damage = damageMatch?.[1] || "";
      const breakdownMatch = trimmed.match(/Hesap:\s*([\d.]+)\s+birim\s*×\s*([\d.]+)\s+atk(?:\s*×\s*([\d.]+)\s+carpan)?/);
      if (breakdownMatch) {
        currentEvent.unitCount = Number(breakdownMatch[1]);
        currentEvent.attackValue = Number(breakdownMatch[2]);
        currentEvent.multiplier = breakdownMatch[3] ? Number(breakdownMatch[3]) : null;
      }
    }
  });
  flushEvent();
  return events;
}

function renderVariantCauseSummary(target, causeSummary, variant, analysis) {
  target.innerHTML = "";

  const head = document.createElement("div");
  head.className = "variant-cause-head";

  const title = document.createElement("strong");
  title.textContent = "Bu sonuç hangi koşullarda oluşuyor?";

  const meta = document.createElement("span");
  meta.textContent = `${variant.count}/${analysis.sampleCount} seed (%${formatProbability(variant.probability)}) · ${variant.winner === "ally" ? "Zafer" : "Mağlubiyet"} · ${variant.lostBloodTotal} kan kaybı`;
  head.append(title, meta);
  target.appendChild(head);

  if (!causeSummary.entries.length) {
    const empty = document.createElement("p");
    empty.className = "variant-cause-empty";
    empty.textContent = "Bu sonuç grubu için özetlenebilir bir saldırı akışı bulunamadı.";
    target.appendChild(empty);
    return;
  }

  if (causeSummary.decisive?.length) {
    renderVariantCauseDecisiveList(target, causeSummary, variant);
    return;
  }

  const intro = document.createElement("p");
  intro.className = "variant-cause-intro";
  intro.textContent = `Bu sonuç grubundaki ${causeSummary.scannedSeedCount} seed içinde en sık görülen akışlar:`;
  target.appendChild(intro);

  const list = document.createElement("ul");
  list.className = "variant-cause-list";
  causeSummary.entries.forEach((entry) => {
    const item = document.createElement("li");
    const route = document.createElement("strong");
    route.textContent = entry.route;
    item.appendChild(route);

    const details = [];
    details.push(`${entry.seedCount}/${entry.sampleCount} seed (%${formatProbability(entry.probability)})`);
    if (entry.damages.length) {
      const minDamage = entry.damages[0];
      const maxDamage = entry.damages[entry.damages.length - 1];
      details.push(`hasar: ${minDamage === maxDamage ? minDamage : `${minDamage}–${maxDamage}`}`);
    }
    if (entry.reasons.length) {
      details.push(`koşul: ${entry.reasons.map((item) => `${item.reason} (${item.count}/${entry.sampleCount})`).join("; ")}`);
    }

    const detail = document.createElement("span");
    detail.textContent = details.join(" · ");
    item.appendChild(detail);
    list.appendChild(item);
  });
  target.appendChild(list);

  const note = document.createElement("p");
  note.className = "variant-cause-note";
  note.textContent = "Ana yüzde sonuç grubunun oranıdır; satır yüzdeleri yalnızca bu grubun içindeki akışların görülme oranını gösterir. Bu satırlar tek başına kesin neden değil, sonucu ayıran öne çıkan koşullardır.";
  target.appendChild(note);
}

function formatDamageRangeText(minValue, maxValue) {
  return minValue === maxValue ? `${minValue}` : `${minValue}–${maxValue}`;
}

function formatUnitCountListText(values) {
  if (!values.length) {
    return "";
  }
  const isContiguous = values.every((value, index) => index === 0 || value === values[index - 1] + 1);
  if (values.length > 2 && isContiguous) {
    return `${values[0]}–${values[values.length - 1]}`;
  }
  return values.join(" / ");
}

function formatCauseNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function causeUnitClassName(name) {
  if (/\(T\d+\)/.test(name)) {
    return "cause-unit-ally";
  }
  if (/\(R\d+\)/.test(name)) {
    return "cause-unit-enemy";
  }
  return "cause-unit-neutral";
}

function appendCausePieces(parent, pieces) {
  pieces.forEach((piece) => {
    if (!piece || !piece.text) {
      return;
    }
    const span = document.createElement("span");
    span.className = piece.className || "cause-plain";
    span.textContent = piece.text;
    parent.appendChild(span);
  });
  return parent;
}

function buildCauseDetailRow(groups) {
  const row = document.createElement("span");
  row.className = "variant-cause-detail";
  groups
    .filter((pieces) => pieces && pieces.length)
    .forEach((pieces, index) => {
      if (index > 0) {
        appendCausePieces(row, [{ text: " · ", className: "cause-sep" }]);
      }
      appendCausePieces(row, pieces);
    });
  return row;
}

function buildDamageDriverPieces(split) {
  const attackText = Number.isFinite(split.attackValue) ? `${split.attackValue} atk` : "atk";
  const multiplierText = split.multipliers.length
    ? ` × ${split.multipliers.map((value) => value.toFixed(2)).join("/")} çarpan`
    : "";

  if (split.driver === "units") {
    return [
      { text: "sebep: ", className: "cause-tag" },
      { text: "hayattaki birim sayısı", className: "cause-tag-value" },
      { text: " — bu sonuçta ", className: "cause-plain" },
      {
        text: `${formatUnitCountListText(split.ownUnitCounts)} birim × ${attackText}${multiplierText}`,
        className: "cause-value-own"
      },
      { text: ", diğer sonuçlarda ", className: "cause-plain" },
      { text: `${formatUnitCountListText(split.rivalUnitCounts)} birim`, className: "cause-value-rival" },
      { text: " kalıyor", className: "cause-plain" }
    ];
  }

  if (split.driver === "rounding") {
    const perUnitDamage = Number.isFinite(split.attackValue) && split.multipliers.length <= 1
      ? split.attackValue * (split.multipliers[0] ?? 1)
      : null;
    return [
      { text: "sebep: ", className: "cause-tag" },
      { text: "yarım kesir yuvarlaması", className: "cause-tag-value" },
      { text: " — birim sayısı aynı (", className: "cause-plain" },
      {
        text: `${formatUnitCountListText(split.ownUnitCounts)} birim × ${attackText}${multiplierText}`,
        className: "cause-value-own"
      },
      {
        text: perUnitDamage === null
          ? "), birim başına kalan .5 kesir her birim için ayrı yazı-tura ile yuvarlanıyor"
          : `), birim başına ${formatCauseNumber(perUnitDamage)} hasarın .5 kesri her birim için ayrı yazı-tura ile yuvarlanıyor`,
        className: "cause-plain"
      }
    ];
  }

  return [];
}

function buildTargetReasonPieces(entry) {
  return [
    { text: "koşul: ", className: "cause-tag" },
    { text: entry.reasons.map((reason) => reason.reason).join("; "), className: "cause-plain" }
  ];
}

function renderVariantCauseDecisiveList(target, causeSummary, variant) {
  const intro = document.createElement("p");
  intro.className = "variant-cause-intro";
  intro.textContent = `Bu sonuç şu koşullar sağlandığında çıkıyor (bu grubun ${causeSummary.scannedSeedCount} seedi, diğer sonuçların ${causeSummary.rivalSeedCount} seedi ile karşılaştırıldı):`;
  target.appendChild(intro);

  const list = document.createElement("ul");
  list.className = "variant-cause-list";

  causeSummary.decisive.forEach((entry) => {
    const item = document.createElement("li");
    const headline = document.createElement("strong");
    const detailGroups = [];

    appendCausePieces(headline, [
      { text: entry.attacker, className: causeUnitClassName(entry.attacker) },
      { text: " → ", className: "cause-arrow" },
      { text: entry.target, className: causeUnitClassName(entry.target) }
    ]);

    if (entry.kind === "damage") {
      const split = entry.damageSplit;
      appendCausePieces(headline, [
        { text: ": ", className: "cause-plain" },
        { text: `${formatDamageRangeText(split.ownMin, split.ownMax)} hasar`, className: "cause-value-own" },
        { text: " vurursa", className: "cause-plain" }
      ]);

      detailGroups.push([
        { text: `${entry.seedCount}/${entry.sampleCount} seed`, className: "cause-value-own" },
        { text: " hep bu aralıkta", className: "cause-plain" }
      ]);

      const otherBands = [];
      if (split.below.length) {
        otherBands.push(formatDamageRangeText(split.below[0], split.below[split.below.length - 1]));
      }
      if (split.above.length) {
        otherBands.push(formatDamageRangeText(split.above[0], split.above[split.above.length - 1]));
      }
      detailGroups.push([
        { text: "diğer sonuçların ", className: "cause-plain" },
        { text: `%${formatProbability(split.rate)}`, className: "cause-value-rival" },
        { text: " kadarında dışında", className: "cause-plain" },
        otherBands.length ? { text: ` (${otherBands.join(" veya ")})`, className: "cause-value-rival" } : null
      ].filter(Boolean));

      detailGroups.push(buildDamageDriverPieces(split));
    } else {
      appendCausePieces(headline, [{ text: " hedefini seçerse", className: "cause-plain" }]);

      detailGroups.push([
        { text: `${entry.seedCount}/${entry.sampleCount} seed`, className: "cause-value-own" },
        { text: ` (%${formatProbability(entry.probability)})`, className: "cause-value-own" }
      ]);
      detailGroups.push([
        { text: "diğer sonuçlarda ", className: "cause-plain" },
        { text: `%${formatProbability(entry.rivalProbability)}`, className: "cause-value-rival" },
        { text: ` (${entry.rivalSampleCount} seed)`, className: "cause-plain" }
      ]);
      if (entry.damages.length) {
        detailGroups.push([
          { text: "hasar: ", className: "cause-plain" },
          {
            text: formatDamageRangeText(entry.damages[0], entry.damages[entry.damages.length - 1]),
            className: "cause-value-own"
          }
        ]);
      }
      if (entry.alternatives.length) {
        const alternativePieces = [{ text: "sebep: ", className: "cause-tag" }, { text: "hedef seçimi", className: "cause-tag-value" }, { text: " — bunun yerine ", className: "cause-plain" }];
        entry.alternatives.forEach((alternative, index) => {
          if (index > 0) {
            alternativePieces.push({ text: ", ", className: "cause-plain" });
          }
          alternativePieces.push({ text: alternative.target, className: "cause-value-rival" });
          alternativePieces.push({
            text: ` (%${formatProbability(alternative.probability)})`,
            className: "cause-plain"
          });
        });
        alternativePieces.push({ text: " hedeflenirse başka sonuç çıkıyor", className: "cause-plain" });
        detailGroups.push(alternativePieces);
      } else {
        detailGroups.push([
          { text: "diğer sonuçlarda bu birim bu hedefi seçmiyor", className: "cause-plain" }
        ]);
      }
    }

    if (entry.reasons.length) {
      detailGroups.push(buildTargetReasonPieces(entry));
    }

    item.appendChild(headline);
    item.appendChild(buildCauseDetailRow(detailGroups));
    list.appendChild(item);
  });

  target.appendChild(list);

  const note = document.createElement("p");
  note.className = "variant-cause-note";
  note.textContent = `Bu koşullar birlikte gerçekleştiğinde %${formatProbability(variant.probability)} olasılıklı bu sonuç (${variant.lostBloodTotal} kan kaybı) çıkıyor. Bu adımlardan biri farklı geliştiğinde (başka hedef seçildiğinde veya hasar bu aralığın dışına çıktığında) sonuç başka bir senaryoya kayıyor.`;
  target.appendChild(note);
}

function getMostLikelyOutcomeVariant(analysis, winner) {
  if (!analysis || !Array.isArray(analysis.variants)) {
    return null;
  }

  return analysis.variants
    .filter((variant) => variant.winner === winner)
    .sort((left, right) =>
      right.count - left.count ||
      right.lostBloodTotal - left.lostBloodTotal ||
      left.seeds[0] - right.seeds[0]
    )[0] || null;
}

function buildVariantSummaryCard(label, variant, onActivate) {
  const card = document.createElement(onActivate ? "button" : "section");
  card.className = `variant-summary-card${onActivate ? " is-action" : ""}`;
  if (onActivate) {
    card.type = "button";
    card.addEventListener("click", onActivate);
  }

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
  return buildMetricSummaryCard("Ortalama kan kaybi", `${formatAverageValue(averageLostBlood)} kan`, "Agirlikli beklenen deger");
}

function buildProbabilitySummaryCard(label, probability, onActivate = null) {
  const hasAction = typeof onActivate === "function" && probability > 0;
  return buildMetricSummaryCard(
    label,
    `%${formatProbability(probability)}`,
    hasAction ? "Tikla: temsili senaryo sonucunu gor" : "Seed dagilimi uzerinden tahmini oran",
    hasAction ? onActivate : null
  );
}

function buildMetricSummaryCard(label, value, metaText, onActivate = null) {
  const hasAction = typeof onActivate === "function";
  const card = document.createElement(hasAction ? "button" : "section");
  card.className = `variant-summary-card${hasAction ? " is-action" : ""}`;
  if (hasAction) {
    card.type = "button";
    card.addEventListener("click", onActivate);
  }

  const heading = document.createElement("span");
  heading.className = "variant-summary-label";
  heading.textContent = label;

  const valueNode = document.createElement("strong");
  valueNode.className = "variant-summary-value";
  valueNode.textContent = value;

  const meta = document.createElement("span");
  meta.className = "variant-summary-meta";
  meta.textContent = metaText;

  card.append(heading, valueNode, meta);
  return card;
}

function buildRandomBenchmarkPanel(benchmark, fixedSampleCount) {
  const wrapper = document.createElement("section");
  wrapper.className = "variant-benchmark-panel";

  const head = document.createElement("div");
  head.className = "variant-benchmark-head";
  head.innerHTML = `
    <strong>Ek benchmark: random ${benchmark.sampleCount} seed</strong>
    <span>Bu calistirmada uretilen alternatif 5 haneli seed blogu. Sabit 1..${fixedSampleCount} sonucunu degistirmez, sadece ek guven resmi verir.</span>
  `;

  const grid = document.createElement("div");
  grid.className = "variant-summary variant-summary-secondary";
  grid.append(
    buildMetricSummaryCard(
      "Random ortalama kan kaybi",
      `${formatAverageValue(benchmark.averageLostBlood)} kan`,
      `Ornek seedler: ${(benchmark.sampleSeeds || []).join(", ")}`
    ),
    buildMetricSummaryCard(
      "Random zafer olasiligi",
      `%${formatProbability(benchmark.victoryProbability)}`,
      "Alternatif benchmark blok sonucu"
    ),
    buildMetricSummaryCard(
      "Random maglubiyet olasiligi",
      `%${formatProbability(benchmark.defeatProbability)}`,
      "Alternatif benchmark blok sonucu"
    ),
    buildMetricSummaryCard(
      "Random min / max",
      `${benchmark.bestVariant?.lostBloodTotal ?? "-"} / ${benchmark.worstVariant?.lostBloodTotal ?? "-"}`,
      "Bu bloktaki en iyi ve en kotu sonuc"
    )
  );

  wrapper.append(head, grid);
  return wrapper;
}

function formatProbability(value) {
  return (value * 100).toFixed(value * 100 >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatAverageValue(value) {
  return value.toFixed(value >= 100 ? 0 : 1).replace(/\.0+$/, "");
}

function formatSignedDeltaValue(value) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized === 0) {
    return "0";
  }
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

async function saveVariantAsApproved(analysis, variant, triggerButton) {
  if (!isAdminSession) {
    window.alert("Bu islem icin yavuz@gmail.com admin oturumu gerekli.");
    return;
  }
  if (!window.BTFirebase || typeof window.BTFirebase.saveApprovedStrategy !== "function") {
    window.alert("Kayit servisi hazir degil.");
    return;
  }

  try {
    triggerButton.disabled = true;
    const entry = createApprovedSimulationEntry(analysis, variant);
    await window.BTFirebase.saveApprovedStrategy(entry);
    window.alert("Senaryo onaylanmis dovuslere kaydedildi.");
  } catch (error) {
    window.alert(`Onayli dovus kaydedilemedi: ${error.message}`);
  } finally {
    triggerButton.disabled = false;
  }
}

async function saveCurrentSimulationAsApproved(triggerButton) {
  if (!isAdminSession) {
    window.alert("Bu islem icin yavuz@gmail.com admin oturumu gerekli.");
    return;
  }
  if (!currentSimulationReport || !currentSimulationResult) {
    window.alert("Kaydedilecek bir savas sonucu yok.");
    return;
  }
  if (!window.BTFirebase || typeof window.BTFirebase.saveApprovedStrategy !== "function") {
    window.alert("Kayit servisi hazir degil.");
    return;
  }

  try {
    triggerButton.disabled = true;
    const entry = createApprovedSimulationEntryFromCurrentResult();
    await window.BTFirebase.saveApprovedStrategy(entry);
    window.alert("Dovus onaylanmis dovuslere kaydedildi.");
  } catch (error) {
    window.alert(`Onayli dovus kaydedilemedi: ${error.message}`);
  } finally {
    triggerButton.disabled = false;
  }
}

async function saveCurrentSimulationAsFavorite(triggerButton) {
  if (!isAdminSession) {
    window.alert("Bu islem icin yavuz@gmail.com admin oturumu gerekli.");
    return;
  }
  if (!currentSimulationReport || !currentSimulationResult) {
    window.alert("Favoriye eklenecek bir savas sonucu yok.");
    return;
  }
  if (!window.BTFirebase || typeof window.BTFirebase.saveFavoriteStrategy !== "function") {
    window.alert("Favori kayit servisi hazir degil.");
    return;
  }

  try {
    triggerButton.disabled = true;
    const entry = createFavoriteEntryFromCurrentSimulationResult();
    await window.BTFirebase.saveFavoriteStrategy(entry);
    window.alert("Dizilim favorilere eklendi.");
  } catch (error) {
    showCopyableError("Favori Kaydedilemedi", `Favori kaydedilemedi:\n\n${error.message}`);
  } finally {
    triggerButton.disabled = false;
  }
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

function createApprovedSimulationEntry(analysis, variant) {
  const enemyCounts = { ...(analysis?.enemyCounts || {}) };
  const allyCounts = { ...(analysis?.allyCounts || {}) };
  const logView = ensureVariantLogView(enemyCounts, allyCounts, variant);
  return {
    source: "simulation",
    sourceLabel: "Simulasyon",
    savedAt: new Date().toISOString(),
    enemyTitle: buildEnemyTitle(enemyCounts),
    enemyCounts,
    allyCounts,
    matchSignature: buildMatchSignature("simulation", enemyCounts, allyCounts),
    variantSignature: variant.signature,
    representativeSeed: logView.seed,
    variantTitle: `${variant.winner === "ally" ? "Zafer" : "Maglubiyet"} senaryosu`,
    probabilityBasisPoints: Math.round((variant.probability || 0) * 10000),
    winner: variant.winner === "enemy" ? "enemy" : "ally",
    summaryText: logView.summaryText,
    logText: logView.detailText,
    usedCapacity: logView.usedCapacity,
    usedPoints: calculateArmyPoints(allyCounts),
    roundingMode: normalizeRoundingMode(currentSimulationResult?.roundingMode || currentSimulationReport?.roundingMode),
    lostBlood: variant.lostBloodTotal
  };
}

function createApprovedSimulationEntryFromCurrentResult() {
  const enemyCounts = { ...(currentSimulationReport?.enemyCounts || {}) };
  const allyCounts = { ...(currentSimulationReport?.allyCounts || {}) };
  return {
    source: "simulation",
    sourceLabel: "Simulasyon",
    savedAt: new Date().toISOString(),
    enemyTitle: buildEnemyTitle(enemyCounts),
    enemyCounts,
    allyCounts,
    matchSignature: buildMatchSignature("simulation", enemyCounts, allyCounts),
    representativeSeed: currentSimulationReport?.seed,
    variantSignature: currentSimulationResult?.variantSignature || `${buildMatchSignature("simulation", enemyCounts, allyCounts)}|single`,
    variantTitle: `${currentSimulationResult?.winner === "enemy" ? "Maglubiyet" : "Zafer"} senaryosu`,
    probabilityBasisPoints: 10000,
    winner: currentSimulationResult?.winner === "enemy" ? "enemy" : "ally",
    summaryText: currentSimulationReport?.summaryText || "",
    logText: currentSimulationReport?.logText || "",
    usedCapacity: currentSimulationReport?.usedCapacity || 0,
    usedPoints: calculateArmyPoints(allyCounts),
    roundingMode: normalizeRoundingMode(currentSimulationResult?.roundingMode || currentSimulationReport?.roundingMode),
    lostBlood: currentSimulationResult?.lostBloodTotal || 0
  };
}

function createFavoriteEntryFromCurrentSimulationResult() {
  const enemyCounts = { ...(currentSimulationReport?.enemyCounts || {}) };
  const allyCounts = { ...(currentSimulationReport?.allyCounts || {}) };
  return {
    source: "simulation",
    sourceLabel: "Simulasyon Fav",
    savedAt: new Date().toISOString(),
    mode: "balanced",
    objective: "min_loss",
    diversityMode: false,
    stoneMode: false,
    modeLabel: "Simulasyon Fav",
    roundingMode: normalizeRoundingMode(currentSimulationResult?.roundingMode || currentSimulationReport?.roundingMode),
    enemySignature: ENEMY_UNITS.map((unit) => enemyCounts[unit.key] || 0).join("|"),
    enemyTitle: buildEnemyTitle(enemyCounts),
    enemyCounts,
    allyPool: allyCounts,
    recommendationCounts: allyCounts,
    usedPoints: calculateArmyPoints(allyCounts),
    lostBlood: currentSimulationResult?.lostBloodTotal || 0,
    winRate: currentSimulationResult?.winner === "enemy" ? 0 : 100
  };
}

function openVariantLogModal(analysis, variant) {
  if (!variantLogModal || !variantLogOutput || !variantLogSummary || !variantLogInfo) {
    return;
  }

  const enemyCounts = analysis?.enemyCounts || {};
  const allyCounts = analysis?.allyCounts || {};
  const logView = ensureVariantLogView(enemyCounts, allyCounts, variant);

  if (variantLogTitle) {
    variantLogTitle.textContent = `${variant.winner === "ally" ? "Zafer" : "Maglubiyet"} senaryosu`;
  }
  if (variantLogMeta) {
    variantLogMeta.innerHTML = `
      <span>Olasilik: <strong>%${formatProbability(variant.probability)}</strong></span>
      <span>Kan kaybi: <strong>${variant.lostBloodTotal}</strong></span>
      <span>Temsilci seed: <strong>${logView.seed}</strong></span>
      <span>Sonuc: <strong>${variant.winner === "ally" ? "Zafer" : "Maglubiyet"}</strong></span>
    `;
  }

  variantLogSummary.innerHTML = "";
  renderStyledLines(logView.summaryText.split("\n"), variantLogSummary);

  renderVariantScenarioInfo(variantLogInfo, {
    enemyCounts,
    allyCounts,
    seeds: variant.seeds,
    fallbackSeed: logView.seed,
    usedCapacity: logView.usedCapacity
  });

  variantLogOutput.innerHTML = "";
  renderStyledLines(logView.detailText.split("\n"), variantLogOutput);
  variantLogModal.hidden = false;
}

function closeVariantLogModal() {
  if (!variantLogModal) {
    return;
  }
  variantLogModal.hidden = true;
}

function ensureVariantLogView(enemyCounts, allyCounts, variant) {
  if (variant?.logView) {
    return variant.logView;
  }

  const seeds = Array.isArray(variant?.seeds) && variant.seeds.length ? variant.seeds : [1];
  let selectedSeed = seeds[0];
  let selectedResult = null;
  const roundingMode = normalizeRoundingMode(currentSimulationResult?.roundingMode || currentSimulationReport?.roundingMode);

  for (const seed of seeds.slice(0, 8)) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: true, roundingMode });
    if (buildVariantSignature(result) === variant.signature) {
      selectedSeed = seed;
      selectedResult = result;
      break;
    }
  }

  if (!selectedResult) {
    selectedResult = simulateBattle(enemyCounts, allyCounts, { seed: selectedSeed, collectLog: true, roundingMode });
  }

  variant.logView = buildVariantLogView(selectedResult, enemyCounts, allyCounts, selectedSeed);
  return variant.logView;
}

function buildVariantLogView(result, enemyCounts, allyCounts, seed) {
  const lines = result.logText.split("\n");
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

  const summaryText = [
    "======================  SAVAS  SONUCU  ======================",
    ...(summaryLines.length > 0 ? summaryLines : ["  (sonuc henuz belirlenmedi)"])
  ].join("\n");

  const detailText = [
    "======================  TUR  TUR  ANALIZ  ======================",
    `  temsilci seed: ${seed}`,
    "",
    ...detailLines
  ].join("\n");

  return {
    seed,
    result,
    usedCapacity: result.usedCapacity,
    summaryText,
    detailText
  };
}

function buildEnemyTitle(enemyCounts) {
  return buildRosterLabel(enemyCounts, ENEMY_UNITS, 2) || "Versus";
}

function buildRosterLabel(counts, units, limit = null) {
  const parts = units
    .filter((unit) => (counts?.[unit.key] || 0) > 0)
    .map((unit) => `${counts[unit.key]} ${unit.label}`);
  return (limit ? parts.slice(0, limit) : parts).join(" / ");
}

function buildRosterEntries(counts, units) {
  return units
    .filter((unit) => (counts?.[unit.key] || 0) > 0)
    .map((unit) => `${counts[unit.key]} ${unit.label}`);
}

function renderVariantScenarioInfo(target, { enemyCounts, allyCounts, seeds, fallbackSeed, usedCapacity }) {
  target.innerHTML = "";

  const sections = [
    {
      label: "Rakip",
      tone: "enemy",
      entries: buildRosterEntries(enemyCounts, ENEMY_UNITS)
    },
    {
      label: "Muttefikler",
      tone: "ally",
      entries: buildRosterEntries(allyCounts, ALLY_UNITS)
    }
  ];

  sections.forEach((section, index) => {
    const block = document.createElement("section");
    block.className = "variant-info-section";

    const heading = document.createElement("div");
    heading.className = `variant-info-label is-${section.tone}`;
    heading.textContent = section.label;

    const roster = document.createElement("div");
    roster.className = "variant-info-roster";

    if (section.entries.length === 0) {
      const emptyChip = document.createElement("span");
      emptyChip.className = `variant-info-chip is-${section.tone}`;
      emptyChip.textContent = "Birim yok";
      roster.appendChild(emptyChip);
    } else {
      section.entries.forEach((entry) => {
        const chip = document.createElement("span");
        chip.className = `variant-info-chip is-${section.tone}`;
        chip.textContent = entry;
        roster.appendChild(chip);
      });
    }

    block.append(heading, roster);
    target.appendChild(block);

    if (index < sections.length - 1) {
      const divider = document.createElement("div");
      divider.className = "variant-info-divider";
      target.appendChild(divider);
    }
  });

  const sampleSeeds = Array.isArray(seeds) && seeds.length ? seeds.slice(0, 5).join(", ") : String(fallbackSeed);
  [
    {
      label: "Ornek seedler",
      value: sampleSeeds,
      tone: "seed"
    },
    {
      label: "Toplam birlik kapasitesi",
      value: String(usedCapacity),
      tone: "capacity"
    }
  ].forEach((item) => {
    const row = document.createElement("div");
    row.className = `variant-info-meta-row is-${item.tone}`;

    const label = document.createElement("span");
    label.className = "variant-info-meta-label";
    label.textContent = item.label;

    const value = document.createElement("strong");
    value.className = "variant-info-meta-value";
    value.textContent = item.value;

    row.append(label, value);
    target.appendChild(row);
  });
}

function renderPlainTextBlock(text, target) {
  target.innerHTML = "";
  text.split("\n").forEach((line) => {
    const row = document.createElement("span");
    row.className = "log-line";
    row.textContent = line;
    target.appendChild(row);
  });
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
    const lossSummaryParts = parseLossSummaryLine(line);
    if (lossSummaryParts) {
      appendLossSummaryLine(row, lossSummaryParts);
      target.appendChild(row);
      return;
    }
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

function parseLossSummaryLine(line) {
  const match = String(line || "").match(/^([-=])\s*(\d+)\s+(.+?)\s+\(\s*(\d+)\s+(kan|blood)\)$/i);
  if (!match) {
    return null;
  }
  const [, marker, count, label, bloodValue, bloodUnit] = match;
  const normalizedLabel = label.trim();
  if (marker === "=" && !/^(toplam|total)$/i.test(normalizedLabel)) {
    return null;
  }
  if (marker !== "-" && marker !== "=") {
    return null;
  }
  return {
    marker,
    count,
    label: normalizedLabel,
    bloodText: `(${bloodValue} ${bloodUnit})`,
    isTotal: marker === "="
  };
}

function analyzeNearbyAdvice(enemyCounts, allyCounts, currentResult) {
  const baselineWinner = currentResult?.winner === "enemy" ? "enemy" : "ally";
  const baselineLostBlood = Number(currentResult?.lostBloodTotal || 0);
  const baselineLossUnits = getTotalLossUnits(currentResult?.allyLosses || {});
  const seed = Number.isInteger(currentResult?.seed)
    ? currentResult.seed
    : (Number.isInteger(currentSimulationReport?.seed) ? currentSimulationReport.seed : 1);
  const roundingMode = normalizeRoundingMode(currentResult?.roundingMode);
  const maxExtraUnits = baselineWinner === "enemy" ? NEARBY_VICTORY_MAX_EXTRA_UNITS : NEARBY_IMPROVEMENT_MAX_EXTRA_UNITS;
  const allowedUnits = getNearbyAllowedUnits(allyCounts);
  const allowedUnitKeys = new Set(allowedUnits.map((unit) => unit.key));
  let checkedCount = 0;
  let suggestions = [];
  let closestSuggestion = null;
  let winningFoundAtUnits = null;

  for (let totalAddedUnits = 1; totalAddedUnits <= maxExtraUnits; totalAddedUnits += 1) {
    const deltas = buildNearbyAdditionDeltas(totalAddedUnits, allowedUnits);
    const unitLevelSuggestions = [];

    deltas.forEach((deltaCounts) => {
      const nextCounts = addNearbyDeltaToCounts(allyCounts, deltaCounts);
      const result = simulateBattle(enemyCounts, nextCounts, {
        seed,
        collectLog: false,
        roundingMode
      });
      checkedCount += 1;
      const suggestion = buildNearbySuggestion(deltaCounts, result, baselineLostBlood, baselineLossUnits);

      if (baselineWinner === "enemy") {
        if (suggestion.winner === "ally") {
          unitLevelSuggestions.push(suggestion);
        } else if (!closestSuggestion || compareNearbyDefeatFallback(suggestion, closestSuggestion) < 0) {
          closestSuggestion = suggestion;
        }
        return;
      }

      if (isNearbyImprovementSuggestion(suggestion, baselineLostBlood, baselineLossUnits)) {
        suggestions.push(suggestion);
      }
    });

    if (baselineWinner === "enemy" && unitLevelSuggestions.length > 0) {
      suggestions = unitLevelSuggestions
        .sort(compareNearbySuggestionPriority)
        .slice(0, NEARBY_ADVICE_MAX_RESULTS);
      winningFoundAtUnits = totalAddedUnits;
      break;
    }
  }

  if (baselineWinner === "ally") {
    suggestions.sort(compareNearbySuggestionPriority);
    suggestions = suggestions.slice(0, NEARBY_ADVICE_MAX_RESULTS);
  }

  suggestions = suggestions.filter((suggestion) => isNearbySuggestionAllowed(suggestion, allowedUnitKeys));
  if (closestSuggestion && !isNearbySuggestionAllowed(closestSuggestion, allowedUnitKeys)) {
    closestSuggestion = null;
  }

  const hasSuggestions = suggestions.length > 0;
  const mode = baselineWinner === "enemy" ? "defeat" : "victory";
  return {
    loading: false,
    expanded: hasSuggestions || !closestSuggestion,
    hasContent: true,
    mode,
    checkedCount,
    maxExtraUnits,
    winningFoundAtUnits,
    suggestions,
    closestSuggestion,
    seed,
    roundingMode,
    title: mode === "defeat" ? "Yakin kazanma onerileri" : "Yakin iyilestirme onerileri",
    toggleLabel: mode === "defeat"
      ? `Yakin Kazanma Onerilerini Goster${hasSuggestions ? ` (${suggestions.length})` : ""}`
      : `Yakin Iyilestirme Onerilerini Goster${hasSuggestions ? ` (${suggestions.length})` : ""}`,
    emptyText: mode === "defeat"
      ? `${maxExtraUnits} birime kadar ekleme tarandi ama yakin cevrede zafer bulunamadi.`
      : `${maxExtraUnits} birime kadar ekleme tarandi ama daha az kayipli yakin sonuc bulunamadi.`
  };
}

function buildNearbyAdditionDeltas(totalUnits, allowedUnits = ALLY_UNITS) {
  const results = [];
  const draft = createEmptyNearbyCounts();

  function walk(remaining, startIndex) {
    if (remaining <= 0) {
      results.push({ ...draft });
      return;
    }
    for (let index = startIndex; index < allowedUnits.length; index += 1) {
      draft[allowedUnits[index].key] += 1;
      walk(remaining - 1, index);
      draft[allowedUnits[index].key] -= 1;
    }
  }

  walk(totalUnits, 0);
  return results;
}

function getNearbyAllowedUnits(baseCounts) {
  const usedUnits = ALLY_UNITS.filter((unit) => Number(baseCounts?.[unit.key] || 0) > 0);
  return usedUnits;
}

function isNearbySuggestionAllowed(suggestion, allowedUnitKeys) {
  if (!suggestion || !(allowedUnitKeys instanceof Set) || allowedUnitKeys.size <= 0) {
    return false;
  }
  return Object.entries(suggestion.deltaCounts || {}).every(([unitKey, count]) => {
    return Number(count || 0) <= 0 || allowedUnitKeys.has(unitKey);
  });
}

function createEmptyNearbyCounts() {
  const counts = {};
  ALLY_UNITS.forEach((unit) => {
    counts[unit.key] = 0;
  });
  return counts;
}

function addNearbyDeltaToCounts(baseCounts, deltaCounts) {
  const next = {};
  ALLY_UNITS.forEach((unit) => {
    next[unit.key] = Number(baseCounts?.[unit.key] || 0) + Number(deltaCounts?.[unit.key] || 0);
  });
  return next;
}

function getTotalLossUnits(losses = {}) {
  return ALLY_UNITS.reduce((sum, unit) => sum + Number(losses?.[unit.key] || 0), 0);
}

function buildNearbySuggestion(deltaCounts, result, baselineLostBlood, baselineLossUnits) {
  const addedUnits = getTotalLossUnits(deltaCounts);
  const addedPoints = calculateArmyPoints(deltaCounts);
  const lostBlood = Number(result?.lostBloodTotal || 0);
  const lossUnits = getTotalLossUnits(result?.allyLosses || {});
  return {
    deltaCounts: { ...deltaCounts },
    deltaLabel: formatNearbyDeltaLabel(deltaCounts),
    addedUnits,
    addedPoints,
    winner: result?.winner === "enemy" ? "enemy" : "ally",
    lostBlood,
    lossUnits,
    lostBloodDelta: lostBlood - baselineLostBlood,
    lossUnitDelta: lossUnits - baselineLossUnits,
    result
  };
}

function formatNearbyDeltaLabel(deltaCounts) {
  return ALLY_UNITS
    .filter((unit) => Number(deltaCounts?.[unit.key] || 0) > 0)
    .map((unit) => `+${deltaCounts[unit.key]} ${unit.label}`)
    .join(" / ");
}

function compareNearbySuggestionPriority(left, right) {
  return (
    left.addedUnits - right.addedUnits ||
    left.addedPoints - right.addedPoints ||
    left.lostBlood - right.lostBlood ||
    left.lossUnits - right.lossUnits
  );
}

function compareNearbyDefeatFallback(left, right) {
  return (
    left.lostBlood - right.lostBlood ||
    left.lossUnits - right.lossUnits ||
    left.addedUnits - right.addedUnits ||
    left.addedPoints - right.addedPoints
  );
}

function isNearbyImprovementSuggestion(suggestion, baselineLostBlood, baselineLossUnits) {
  if (suggestion.winner !== "ally") {
    return false;
  }
  if (suggestion.lostBlood < baselineLostBlood) {
    return true;
  }
  if (suggestion.lostBlood === baselineLostBlood && suggestion.lossUnits < baselineLossUnits) {
    return true;
  }
  return false;
}

function appendLossSummaryLine(row, parts) {
  row.classList.add(parts.isTotal ? "loss-total" : "loss-entry");

  const count = document.createElement("span");
  count.className = "loss-count";
  count.textContent = `${parts.marker} ${parts.count}`;

  const label = document.createElement("span");
  label.className = "loss-name";
  label.textContent = parts.label;

  const blood = document.createElement("span");
  blood.className = "loss-blood";
  blood.textContent = parts.bloodText;

  row.append(count, label, blood);
}

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
    "Yarasa Surusu", "Gulyabani", "Vampir Kole", "Banshee",
    "Olu Cagirici", "Gargoyle", "Kan Cadisi", "Curuk Girtlak",
    "Bats", "Ghouls", "Thralls", "Banshees",
    "Necromancers", "Gargoyles", "Blood Witches", "Rotmaws"
  ];
  return allyNames.some((name) => line.includes(name));
}
