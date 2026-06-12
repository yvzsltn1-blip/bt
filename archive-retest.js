"use strict";

(function attachArchiveRegressionRetest(globalScope) {
  const INITIAL_SEED_COUNT = 64;
  const DEEP_SEED_COUNT = 1024;

  function getBattleCore() {
    return globalScope.BattleCore || {};
  }

  function getEnemyUnits() {
    return getBattleCore().ENEMY_UNITS || [];
  }

  function getAllyUnits() {
    return getBattleCore().ALLY_UNITS || [];
  }

  function cloneCounts(source, units) {
    return Object.fromEntries((units || []).map((unit) => [unit.key, Number(source?.[unit.key] || 0)]));
  }

  function hasPositiveCounts(counts) {
    return Object.values(counts || {}).some((value) => Number(value || 0) > 0);
  }

  function areLossesEqual(left, right) {
    return getAllyUnits().every(
      (unit) => Number(left?.[unit.key] || 0) === Number(right?.[unit.key] || 0)
    );
  }

  function isWinnerComparable(value) {
    return value === "ally" || value === "enemy";
  }

  function isExactMatch(expected, actual) {
    return (
      (!isWinnerComparable(expected.winner) || expected.winner === actual.winner) &&
      Number(expected.lostBloodTotal || 0) === Number(actual.lostBloodTotal || 0) &&
      areLossesEqual(expected.allyLosses, actual.allyLosses)
    );
  }

  function fingerprintDistance(expected, actual) {
    let score = 0;
    if (isWinnerComparable(expected.winner) && expected.winner !== actual.winner) {
      score += 1000000;
    }
    score += Math.abs(Number(expected.lostBloodTotal || 0) - Number(actual.lostBloodTotal || 0)) * 100;
    getAllyUnits().forEach((unit) => {
      score += Math.abs(Number(expected.allyLosses?.[unit.key] || 0) - Number(actual.allyLosses?.[unit.key] || 0));
    });
    return score;
  }

  function getExpectedFingerprint(item) {
    return {
      winner: item?.expectedWinner === "ally" || item?.expectedWinner === "enemy"
        ? item.expectedWinner
        : "unknown",
      lostBloodTotal: Number.isFinite(Number(item?.expectedLostBlood))
        ? Number(item.expectedLostBlood)
        : 0,
      allyLosses: cloneCounts(item?.expectedAllyLosses || {}, getAllyUnits())
    };
  }

  function getResultFingerprint(result) {
    return {
      winner: result?.winner === "enemy" ? "enemy" : "ally",
      lostBloodTotal: Number(result?.lostBloodTotal || 0),
      allyLosses: cloneCounts(result?.allyLosses || {}, getAllyUnits())
    };
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

  function buildDeterministicSeeds(item, count) {
    const source = [
      item?.archiveId || item?.id || "",
      item?.archiveSavedAt || "",
      item?.stage ?? "",
      JSON.stringify(item?.enemyCounts || {}),
      JSON.stringify(item?.allyCounts || {}),
      ""
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

  function formatSignedNumber(value) {
    const numeric = Number(value || 0);
    return numeric > 0 ? `+${numeric}` : String(numeric);
  }

  function buildLossDeltaBreakdown(expected, actual) {
    return getAllyUnits().map((unit, index) => {
      const delta = Number(actual?.[unit.key] || 0) - Number(expected?.[unit.key] || 0);
      return delta ? `T${index + 1} ${formatSignedNumber(delta)}` : "";
    }).filter(Boolean).join(", ");
  }

  function buildDifferences(expected, actual) {
    const parts = [];
    if (isWinnerComparable(expected.winner) && expected.winner !== actual.winner) {
      parts.push(`Sonuc: ${expected.winner === "ally" ? "Zafer" : "Maglubiyet"} -> ${actual.winner === "ally" ? "Zafer" : "Maglubiyet"}`);
    }
    const bloodDelta = Number(actual.lostBloodTotal || 0) - Number(expected.lostBloodTotal || 0);
    if (bloodDelta) {
      parts.push(`Kan kaybi: ${formatSignedNumber(bloodDelta)}`);
    }
    const lossDelta = buildLossDeltaBreakdown(expected.allyLosses, actual.allyLosses);
    if (lossDelta) {
      parts.push(`Kayip farki: ${lossDelta}`);
    }
    return parts.join(" | ");
  }

  function retestItem(item, options = {}) {
    const simulateBattle = getBattleCore().simulateBattle;
    const enemyCounts = cloneCounts(item?.enemyCounts || {}, getEnemyUnits());
    const allyCounts = cloneCounts(item?.allyCounts || {}, getAllyUnits());
    const testedAt = new Date().toISOString();

    if (typeof simulateBattle !== "function" || !hasPositiveCounts(enemyCounts) || !hasPositiveCounts(allyCounts)) {
      return {
        previousResult: item?.result || "skipped",
        result: "skipped",
        testedAt,
        actualWinner: "unknown",
        actualLostBlood: null,
        actualAllyLosses: cloneCounts({}, getAllyUnits()),
        differences: "",
        note: "Eksik kadro veya simulator servisi nedeniyle yeniden test edilemedi."
      };
    }

    const expected = getExpectedFingerprint(item);
    const initialCount = Number(options.initialSeedCount || INITIAL_SEED_COUNT);
    const deepCount = Math.max(initialCount, Number(options.deepSeedCount || DEEP_SEED_COUNT));
    const seeds = buildDeterministicSeeds(item, deepCount);
    const roundingMode = options.roundingMode || "legacy";
    // Eslesme bulunamazsa uzanti motoru yuvarlamasiyla (extround) ikinci tur denenir.
    // Dogrular ilk turda eslestigi icin davranislari degismez; yalnizca
    // yanlislarin bir kismi bu alternatif yuvarlama dunyasinda yakalanir.
    const roundingModePasses = roundingMode === "extround"
      ? ["extround"]
      : [roundingMode, "extround"];
    let closest = null;
    let closestScore = Number.POSITIVE_INFINITY;
    let matched = null;
    let matchedRoundingMode = null;
    let scanned = 0;

    outer:
    for (const passRoundingMode of roundingModePasses) {
      for (let index = 0; index < seeds.length; index += 1) {
        const seed = seeds[index];
        const actual = getResultFingerprint(simulateBattle(enemyCounts, allyCounts, {
          seed,
          collectLog: false,
          roundingMode: passRoundingMode
        }));
        scanned = index + 1;

        const score = fingerprintDistance(expected, actual);
        if (score < closestScore) {
          closest = { ...actual, seed };
          closestScore = score;
        }
        if (isExactMatch(expected, actual)) {
          matched = { ...actual, seed };
          matchedRoundingMode = passRoundingMode;
          break outer;
        }
        if (scanned === initialCount && options.deepScan === false) {
          break;
        }
      }
    }

    const actual = matched || closest || {
      winner: "unknown",
      lostBloodTotal: 0,
      allyLosses: cloneCounts({}, getAllyUnits()),
      seed: null
    };
    const result = matched ? "pass" : "fail";

    return {
      previousResult: item?.result || "skipped",
      result,
      testedAt,
      actualWinner: actual.winner,
      actualLostBlood: actual.lostBloodTotal,
      actualAllyLosses: actual.allyLosses,
      differences: matched ? "" : buildDifferences(expected, actual),
      note: matched
        ? `Yeniden test: beklenen sonuc ${scanned} seed icinde bulundu (seed ${matched.seed}${matchedRoundingMode === "extround" ? ", extround yuvarlama" : ""}).`
        : `Yeniden test: beklenen sonuc ${scanned} deterministik seed icinde bulunamadi (extround dahil).`
    };
  }

  function buildUpdatedPayload(item, audit) {
    return {
      ...item,
      result: audit.result,
      testedAt: audit.testedAt,
      actualWinner: audit.actualWinner,
      actualLostBlood: audit.actualLostBlood,
      actualAllyLosses: audit.actualAllyLosses,
      differences: audit.differences,
      note: audit.note
    };
  }

  function summarize(results) {
    const summary = {
      total: 0,
      unchangedPass: 0,
      unchangedFail: 0,
      passToFail: 0,
      failToPass: 0,
      skipped: 0
    };
    (results || []).forEach((audit) => {
      summary.total += 1;
      if (audit.result === "skipped") {
        summary.skipped += 1;
      } else if (audit.previousResult === "pass" && audit.result === "pass") {
        summary.unchangedPass += 1;
      } else if (audit.previousResult === "fail" && audit.result === "fail") {
        summary.unchangedFail += 1;
      } else if (audit.previousResult === "pass" && audit.result === "fail") {
        summary.passToFail += 1;
      } else if (audit.previousResult === "fail" && audit.result === "pass") {
        summary.failToPass += 1;
      }
    });
    return summary;
  }

  globalScope.ArchiveRegressionRetest = {
    INITIAL_SEED_COUNT,
    DEEP_SEED_COUNT,
    buildDeterministicSeeds,
    buildUpdatedPayload,
    retestItem,
    summarize
  };
})(typeof window !== "undefined" ? window : globalThis);
