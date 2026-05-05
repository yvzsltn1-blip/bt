"use strict";

(function attachBulkBattleRegression(globalScope) {
  const STORAGE_KEY = "bt-analiz.bulk-regression-report.v1";
  const REPORT_PAGE_URL = "regression-report.html";
  const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";

  function getBattleCore() {
    return globalScope.BattleCore || {};
  }

  function getEnemyUnits() {
    return getBattleCore().ENEMY_UNITS || [];
  }

  function getAllyUnits() {
    return getBattleCore().ALLY_UNITS || [];
  }

  function cloneCountMap(source, units) {
    const result = {};
    (units || []).forEach((unit) => {
      result[unit.key] = Number(source?.[unit.key] || 0);
    });
    return result;
  }

  function hasAnyPositiveCounts(counts) {
    return Object.values(counts || {}).some((value) => Number(value || 0) > 0);
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

  function extractOutcomeLine(summaryText) {
    return String(summaryText || "").split("\n").find((line) => line.trim().startsWith(">>")) || "";
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

  function extractLossesFromSummary(summaryText) {
    const nameMap = Object.fromEntries(
      getAllyUnits().map((unit) => [getSummaryUnitName(unit.key), unit.key])
    );
    const losses = {};
    String(summaryText || "").split("\n").forEach((line) => {
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

  function calculateLostBlood(losses) {
    const bloodByKey = getBattleCore().BLOOD_BY_ALLY_KEY || {};
    return getAllyUnits().reduce(
      (sum, unit) => sum + Number(losses?.[unit.key] || 0) * Number(bloodByKey[unit.key] || 0),
      0
    );
  }

  function buildVariantSignature(result) {
    return JSON.stringify({
      winner: result?.winner || "unknown",
      lostBloodTotal: Number(result?.lostBloodTotal || 0),
      allyLosses: cloneCountMap(result?.allyLosses || {}, getAllyUnits())
    });
  }

  function parseVariantSignature(signatureText) {
    if (!signatureText) {
      return null;
    }
    try {
      const parsed = JSON.parse(signatureText);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return {
        winner: parsed.winner === "enemy" ? "enemy" : (parsed.winner === "ally" ? "ally" : "unknown"),
        lostBloodTotal: Number(parsed.lostBloodTotal || 0),
        allyLosses: cloneCountMap(parsed.allyLosses || {}, getAllyUnits())
      };
    } catch {
      return null;
    }
  }

  function openSimulationForCounts(enemyCounts, allyCounts, seed = null) {
    try {
      globalScope.sessionStorage.setItem(OPTIMIZER_SIMULATION_STORAGE_KEY, JSON.stringify({
        enemyCounts: cloneCountMap(enemyCounts || {}, getEnemyUnits()),
        allyCounts: cloneCountMap(allyCounts || {}, getAllyUnits()),
        seed: Number.isInteger(seed) ? seed : null
      }));
      const opened = globalScope.open("index.html", "_blank");
      if (!opened) {
        globalScope.alert("Simulasyon yeni sekmede acilamadi. Lutfen popup engelleyiciyi kontrol et.");
        return false;
      }
      opened.focus?.();
      return true;
    } catch (error) {
      globalScope.alert(`Simulasyon ekranina gecilemedi: ${error.message}`);
      return false;
    }
  }

  function prepareApprovedItems(items) {
    return (items || []).map((item) => {
      const source = item?.source === "simulation" ? "simulation" : "optimizer";
      const allyCounts = source === "simulation"
        ? cloneCountMap(item?.allyCounts || {}, getAllyUnits())
        : cloneCountMap(item?.recommendationCounts || {}, getAllyUnits());

      return {
        id: String(item?.id || ""),
        source,
        savedAt: String(item?.savedAt || ""),
        stage: Number.isInteger(item?.stage) ? item.stage : null,
        enemyTitle: String(item?.enemyTitle || "Versus"),
        variantTitle: String(item?.variantTitle || ""),
        modeLabel: String(item?.modeLabel || ""),
        enemyCounts: cloneCountMap(item?.enemyCounts || {}, getEnemyUnits()),
        allyCounts,
        representativeSeed: Number.isInteger(item?.representativeSeed) ? item.representativeSeed : null,
        winner: item?.winner === "enemy" ? "enemy" : "ally",
        lostBlood: Number.isFinite(Number(item?.lostBlood)) ? Number(item.lostBlood) : null,
        usedCapacity: Number.isFinite(Number(item?.usedCapacity)) ? Number(item.usedCapacity) : null,
        usedPoints: Number.isFinite(Number(item?.usedPoints)) ? Number(item.usedPoints) : null,
        winRate: Number.isFinite(Number(item?.winRate)) ? Number(item.winRate) : null,
        probabilityBasisPoints: Number.isFinite(Number(item?.probabilityBasisPoints))
          ? Number(item.probabilityBasisPoints)
          : null,
        variantSignature: String(item?.variantSignature || ""),
        summaryText: String(item?.summaryText || "")
      };
    });
  }

  function getWrongSimulationCounts(item) {
    const counts = item?.source === "optimizer" && hasAnyPositiveCounts(item?.recommendationCounts)
      ? item.recommendationCounts
      : item?.allyCounts;
    return cloneCountMap(counts || {}, getAllyUnits());
  }

  function prepareWrongItems(items) {
    return (items || []).map((item) => ({
      id: String(item?.id || ""),
      source: item?.source === "optimizer" ? "optimizer" : "simulation",
      sourceLabel: String(item?.sourceLabel || (item?.source === "optimizer" ? "Optimizer" : "Simulasyon")),
      reportedAt: String(item?.reportedAt || ""),
      stage: Number.isInteger(item?.stage) ? item.stage : null,
      modeLabel: String(item?.modeLabel || ""),
      enemyTitle: String(item?.enemyTitle || ""),
      matchSignature: String(item?.matchSignature || ""),
      enemyCounts: cloneCountMap(item?.enemyCounts || {}, getEnemyUnits()),
      allyCounts: getWrongSimulationCounts(item),
      recommendationCounts: cloneCountMap(item?.recommendationCounts || {}, getAllyUnits()),
      seed: Number.isInteger(item?.seed) ? item.seed : null,
      summaryText: String(item?.summaryText || ""),
      actualSummaryText: String(item?.actualSummaryText || ""),
      actualNote: String(item?.actualNote || ""),
      logText: String(item?.logText || ""),
      pointLimit: Number.isFinite(Number(item?.pointLimit)) ? Number(item.pointLimit) : null,
      usedPoints: Number.isFinite(Number(item?.usedPoints)) ? Number(item.usedPoints) : null,
      usedCapacity: Number.isFinite(Number(item?.usedCapacity)) ? Number(item.usedCapacity) : null,
      expectedWinner: item?.expectedWinner === "enemy"
        ? "enemy"
        : (item?.expectedWinner === "ally" ? "ally" : "unknown"),
      expectedLostBlood: Number.isFinite(Number(item?.expectedLostBlood))
        ? Number(item.expectedLostBlood)
        : null,
      expectedUsedCapacity: Number.isFinite(Number(item?.expectedUsedCapacity))
        ? Number(item.expectedUsedCapacity)
        : null,
      expectedAllyLosses: cloneCountMap(item?.expectedAllyLosses || {}, getAllyUnits()),
      expectedVariantSignature: String(item?.expectedVariantSignature || "")
    }));
  }

  function writePayload(payload) {
    globalScope.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function readPayload() {
    try {
      const raw = globalScope.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function openReportPage(payload) {
    writePayload(payload);
    const opened = globalScope.open(REPORT_PAGE_URL, "_blank");
    if (!opened) {
      globalScope.alert("Rapor sayfasi yeni sekmede acilamadi. Lutfen popup engelleyiciyi kontrol et.");
      return false;
    }
    opened.focus?.();
    return true;
  }

  globalScope.BulkBattleRegression = {
    STORAGE_KEY,
    openReportPage,
    readPayload,
    openSimulationForCounts,
    prepareApprovedItems,
    prepareWrongItems,
    getWrongSimulationCounts,
    extractOutcomeLine,
    inferWinnerFromOutcomeLine,
    extractLossesFromSummary,
    calculateLostBlood,
    buildVariantSignature,
    parseVariantSignature,
    cloneCountMap,
    hasAnyPositiveCounts
  };
})(window);
