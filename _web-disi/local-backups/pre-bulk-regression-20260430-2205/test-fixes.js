"use strict";

const fs = require("fs");
const path = require("path");

// battle-core.js'i yukle (global scope'a ekler)
require("./battle-core.js");

const { simulateBattle, ENEMY_UNITS, ALLY_UNITS, UNIT_DESC, BLOOD_BY_ALLY_KEY } = globalThis.BattleCore;

// ============================================================
// Yardimci fonksiyonlar
// ============================================================

function createZeroCounts(units) {
  return Object.fromEntries(units.map((u) => [u.key, 0]));
}

function parseFirestoreMap(mv) {
  const fields = mv?.fields || {};
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = Number.parseInt(val.integerValue || val.stringValue || "0", 10);
  }
  return result;
}

function parseSummaryLosses(summaryText) {
  // "Kayip Birlikler" bolumundeki kayiplari parse et
  const losses = createZeroCounts(ALLY_UNITS);
  if (!summaryText) return losses;

  const lines = summaryText.split("\n");
  let inLossSection = false;
  for (const line of lines) {
    if (line.includes("Kayip Birlikler")) {
      inLossSection = true;
      continue;
    }
    if (inLossSection && line.startsWith("=")) break;
    if (!inLossSection) continue;

    // "-   9 Yarasalar (T1)               (  90 kan)" formati
    const match = line.match(/-\s+(\d+)\s+(.+)/);
    if (!match) continue;
    const count = parseInt(match[1], 10);
    const unitName = match[2].trim();

    for (const unit of ALLY_UNITS) {
      if (unitName.includes(unit.label) || unitName.includes(`(${unit.key === "bats" ? "T1" : ""}`)) {
        // Label ile eslestir
      }
    }

    // Daha guvenli eslestirme
    if (unitName.includes("Yarasa") || unitName.includes("(T1)") && unitName.includes("Yarasa")) losses.bats = count;
    else if (unitName.includes("Gulyabani") || unitName.includes("Gulyabaniler")) losses.ghouls = count;
    else if (unitName.includes("Vampir") || unitName.includes("Kole")) losses.thralls = count;
    else if (unitName.includes("Bansi") || unitName.includes("Bansiler")) losses.banshees = count;
    else if (unitName.includes("Nekromant") || unitName.includes("Nekromantlar")) losses.necromancers = count;
    else if (unitName.includes("Gargoyl") || unitName.includes("Gargoyller")) losses.gargoyles = count;
    else if (unitName.includes("Cadisi") || unitName.includes("Cadilari")) losses.witches = count;
    else if (unitName.includes("Cene") || unitName.includes("Ceneler")) losses.rotmaws = count;
  }
  return losses;
}

function parseSummaryBlood(summaryText) {
  if (!summaryText) return 0;
  const match = summaryText.match(/(\d+)\s*kan\)/g);
  if (!match) return 0;
  // Son toplam satirindan kan degerini al
  const totalMatch = summaryText.match(/=\s*\d+\s+toplam\s+\(+\s*(\d+)\s+kan\)/);
  if (totalMatch) return parseInt(totalMatch[1], 10);

  // Alternatif: tum kan degerlerini topla
  let total = 0;
  for (const m of match) {
    const num = parseInt(m, 10);
    if (!isNaN(num)) total += num;
  }
  return total;
}

function lossesMatch(actual, expected) {
  return ALLY_UNITS.every((unit) => (actual[unit.key] || 0) === (expected[unit.key] || 0));
}

function countDifferences(actual, expected) {
  let diff = 0;
  for (const unit of ALLY_UNITS) {
    diff += Math.abs((actual[unit.key] || 0) - (expected[unit.key] || 0));
  }
  return diff;
}

function formatLosses(losses) {
  return ALLY_UNITS.map((u) => losses[u.key] || 0).join("-");
}

function formatEnemy(counts) {
  return ENEMY_UNITS.map((u) => counts[u.key] || 0).join("-");
}

// ============================================================
// Veri yukleme
// ============================================================

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function loadWrongReports() {
  const raw = JSON.parse(stripBom(fs.readFileSync(path.join(__dirname, "wrongReports.firestoredump.json"), "utf8")));
  const reports = [];

  for (const doc of raw.documents || []) {
    const f = doc.fields || {};
    // Firestore mapValue yapisini handle et
    const ecRaw = f.enemyCounts;
    const acRaw = f.allyCounts;
    const enemyMap = ecRaw?.mapValue || ecRaw;
    const allyMap = acRaw?.mapValue || acRaw;
    const enemyCounts = parseFirestoreMap(enemyMap);
    const allyCounts = parseFirestoreMap(allyMap);

    // actualSummaryText'ten gercek kayiplari al
    const actualSummary = f.actualSummaryText?.stringValue || "";
    const actualLosses = parseSummaryLosses(actualSummary);
    const actualBlood = parseSummaryBlood(actualSummary);

    // summaryText'ten simulator kayiplarini al
    const simSummary = f.summaryText?.stringValue || "";
    const simLosses = parseSummaryLosses(simSummary);
    const simBlood = parseSummaryBlood(simSummary);

    reports.push({
      id: doc.name.split("/").pop(),
      enemyCounts,
      allyCounts,
      actualLosses,
      actualBlood,
      simLosses,
      simBlood,
      actualSummary,
      simSummary
    });
  }

  return reports;
}

function loadApprovedStrategies() {
  const raw = JSON.parse(stripBom(fs.readFileSync(path.join(__dirname, "approvedStrategies.firestoredump.json"), "utf8")));
  const reports = [];

  for (const doc of raw.documents || []) {
    const f = doc.fields || {};
    const enemyCounts = parseFirestoreMap(f.enemyCounts?.mapValue || f.enemyCounts);
    const allyCounts = parseFirestoreMap(f.allyCounts?.mapValue || f.allyCounts);

    const summaryText = f.summaryText?.stringValue || "";
    const expectedLosses = parseSummaryLosses(summaryText);
    const expectedBlood = parseInt(f.lostBlood?.integerValue || f.lostBlood?.stringValue || "0", 10);
    const winner = f.winner?.stringValue || "ally";

    // matchSignature'dan beklenen degerleri de al
    const sig = f.matchSignature?.stringValue || "";
    const sigParts = sig.split("|");

    reports.push({
      id: doc.name.split("/").pop(),
      enemyCounts,
      allyCounts,
      expectedLosses,
      expectedBlood: expectedBlood || parseSummaryBlood(summaryText),
      winner,
      stage: parseInt(f.stage?.integerValue || "0", 10),
      summaryText,
      seed: null // seed logText icinde
    });
  }

  return reports;
}

// ============================================================
// Test motoru
// ============================================================

function runTest(wrongReports, approvedReports, options = {}) {
  const maxSeedsForWrong = options.maxSeedsForWrong || 64;
  const maxSeedsForApproved = options.maxSeedsForApproved || 1;

  let wrongFixed = 0;
  let wrongStillWrong = 0;
  let wrongNowWorse = 0;
  const wrongDetails = [];

  let approvedKept = 0;
  let approvedBroken = 0;
  const approvedDetails = [];

  // WRONG REPORTS TEST
  for (const report of wrongReports) {
    let foundMatch = false;
    let bestSeed = 1;
    let bestResult = null;
    let bestDiff = Infinity;

    for (let seed = 1; seed <= maxSeedsForWrong; seed++) {
      const result = simulateBattle(report.enemyCounts, report.allyCounts, { seed, collectLog: false });
      const diff = countDifferences(result.allyLosses, report.actualLosses);
      const bloodDiff = Math.abs(result.lostBloodTotal - report.actualBlood);

      if (diff < bestDiff || (diff === bestDiff && bloodDiff < Math.abs((bestResult?.lostBloodTotal || 0) - report.actualBlood))) {
        bestDiff = diff;
        bestSeed = seed;
        bestResult = result;
      }

      if (lossesMatch(result.allyLosses, report.actualLosses) && result.lostBloodTotal === report.actualBlood) {
        foundMatch = true;
        break;
      }
    }

    if (foundMatch || bestDiff === 0) {
      wrongFixed++;
      wrongDetails.push({ id: report.id, status: "FIXED", seed: bestSeed, bestDiff });
    } else if (bestDiff > countDifferences(report.simLosses, report.actualLosses)) {
      wrongNowWorse++;
      wrongDetails.push({ id: report.id, status: "WORSE", seed: bestSeed, bestDiff, prevDiff: countDifferences(report.simLosses, report.actualLosses) });
    } else {
      wrongStillWrong++;
      wrongDetails.push({ id: report.id, status: "STILL_WRONG", seed: bestSeed, bestDiff, losses: formatLosses(bestResult?.allyLosses || {}) });
    }
  }

  // APPROVED STRATEGIES TEST
  for (const report of approvedReports) {
    let foundMatch = false;

    for (let seed = 1; seed <= maxSeedsForApproved; seed++) {
      const result = simulateBattle(report.enemyCounts, report.allyCounts, { seed, collectLog: false });

      if (lossesMatch(result.allyLosses, report.expectedLosses) && result.lostBloodTotal === report.expectedBlood && result.winner === report.winner) {
        foundMatch = true;
        break;
      }
    }

    if (foundMatch) {
      approvedKept++;
    } else {
      // Daha fazla seed ile dene
      let fixedWithMoreSeeds = false;
      for (let seed = 1; seed <= 16; seed++) {
        const result = simulateBattle(report.enemyCounts, report.allyCounts, { seed, collectLog: false });
        if (lossesMatch(result.allyLosses, report.expectedLosses) && result.lostBloodTotal === report.expectedBlood) {
          fixedWithMoreSeeds = true;
          break;
        }
      }

      if (fixedWithMoreSeeds) {
        approvedKept++;
      } else {
        approvedBroken++;
        // Detaylari kaydet
        const result1 = simulateBattle(report.enemyCounts, report.allyCounts, { seed: 1, collectLog: false });
        approvedDetails.push({
          id: report.id,
          expected: formatLosses(report.expectedLosses),
          actual: formatLosses(result1.allyLosses),
          expectedBlood: report.expectedBlood,
          actualBlood: result1.lostBloodTotal
        });
      }
    }
  }

  return {
    wrong: { total: wrongReports.length, fixed: wrongFixed, stillWrong: wrongStillWrong, worse: wrongNowWorse, details: wrongDetails },
    approved: { total: approvedReports.length, kept: approvedKept, broken: approvedBroken, details: approvedDetails }
  };
}

// ============================================================
// Ana test akisi
// ============================================================

function main() {
  console.log("=== Savas Simuluator Test Araci ===\n");

  console.log("Veriler yukleniyor...");
  const wrongReports = loadWrongReports();
  const approvedReports = loadApprovedStrategies();
  console.log(`  Wrong reports: ${wrongReports.length}`);
  console.log(`  Approved strategies: ${approvedReports.length}\n`);

  // Debug: ilk wrong report
  if (wrongReports.length > 0) {
    const w0 = wrongReports[0];
    console.log("  [DEBUG] Ilk wrong report:");
    console.log(`    enemy: ${JSON.stringify(w0.enemyCounts)}`);
    console.log(`    ally: ${JSON.stringify(w0.allyCounts)}`);
    console.log(`    actual losses: ${formatLosses(w0.actualLosses)} (blood ${w0.actualBlood})`);
    console.log(`    sim losses: ${formatLosses(w0.simLosses)} (blood ${w0.simBlood})`);
    console.log();
  }

  // TEST 0: Mevcut durum (baseline)
  console.log("--- TEST 0: MEVCUT DURUM (Baseline) ---");
  const baseline = runTest(wrongReports, approvedReports, { maxSeedsForWrong: 64, maxSeedsForApproved: 1 });
  console.log(`  Wrong: ${baseline.wrong.fixed}/${baseline.wrong.total} duzeldi, ${baseline.wrong.stillWrong} hala yanlis, ${baseline.wrong.worse} daha kotu`);
  console.log(`  Approved: ${baseline.approved.kept}/${baseline.approved.total} korundu, ${baseline.approved.broken} bozuldu\n`);

  // Yanlis detaylarini goster
  if (baseline.wrong.stillWrong > 0 || baseline.wrong.worse > 0) {
    console.log("  Hala yanlis olanlar:");
    for (const d of baseline.wrong.details.filter((x) => x.status !== "FIXED")) {
      console.log(`    ${d.id}: ${d.status} (en iyi fark: ${d.bestDiff})${d.losses ? ` kayiplar: ${d.losses}` : ""}`);
    }
  }
  if (baseline.approved.broken > 0) {
    console.log("  Bozulan approved:");
    for (const d of baseline.approved.details.slice(0, 5)) {
      console.log(`    ${d.id}: beklenen ${d.expected} (kan ${d.expectedBlood}) -> gercek ${d.actual} (kan ${d.actualBlood})`);
    }
    if (baseline.approved.details.length > 5) {
      console.log(`    ... ve ${baseline.approved.details.length - 5} tane daha`);
    }
  }
  console.log();

  // Yanlis raporlarin detaylarini goster
  console.log("--- WRONG RAPOR DETAYLARI ---");
  for (const r of wrongReports) {
    console.log(`  ${r.id}:`);
    console.log(`    Dusman: ${formatEnemy(r.enemyCounts)}`);
    console.log(`    Biz: ${formatLosses(r.allyCounts)}`);
    console.log(`    Sim kayip: ${formatLosses(r.simLosses)} (kan ${r.simBlood})`);
    console.log(`    Gercek kayip: ${formatLosses(r.actualLosses)} (kan ${r.actualBlood})`);
    const diff = countDifferences(r.simLosses, r.actualLosses);
    console.log(`    Fark: ${diff} birim`);
  }
  console.log();
}

main();
