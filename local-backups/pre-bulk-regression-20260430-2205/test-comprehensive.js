"use strict";

const fs = require("fs");
const path = require("path");

// ============================================================
// Mod yukleme
// ============================================================

function loadBattleCore() {
  // Her seferinde temiz yukleme icin cache temizle
  delete require.cache[require.resolve("./battle-core.js")];
  require("./battle-core.js");
  return globalThis.BattleCore;
}

let BattleCore = loadBattleCore();
let { simulateBattle, ENEMY_UNITS, ALLY_UNITS, UNIT_DESC, BLOOD_BY_ALLY_KEY } = BattleCore;

// ============================================================
// Yardimci fonksiyonlar
// ============================================================

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

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
  const losses = createZeroCounts(ALLY_UNITS);
  if (!summaryText) return losses;
  const lines = summaryText.split("\n");
  let inLossSection = false;
  for (const line of lines) {
    if (line.includes("Kayip Birlikler")) { inLossSection = true; continue; }
    if (inLossSection && line.startsWith("=")) break;
    if (!inLossSection) continue;
    const match = line.match(/-\s+(\d+)\s+(.+)/);
    if (!match) continue;
    const count = parseInt(match[1], 10);
    const unitName = match[2].trim();
    if (unitName.includes("Yarasa")) losses.bats = count;
    else if (unitName.includes("Gulyabani")) losses.ghouls = count;
    else if (unitName.includes("Vampir") || unitName.includes("Kole")) losses.thralls = count;
    else if (unitName.includes("Bansi")) losses.banshees = count;
    else if (unitName.includes("Nekromant")) losses.necromancers = count;
    else if (unitName.includes("Gargoyl")) losses.gargoyles = count;
    else if (unitName.includes("Cadisi") || unitName.includes("Cadilari")) losses.witches = count;
    else if (unitName.includes("Cene") || unitName.includes("Ceneler")) losses.rotmaws = count;
  }
  return losses;
}

function parseSummaryBlood(summaryText) {
  if (!summaryText) return 0;
  const totalMatch = summaryText.match(/=\s*\d+\s+toplam\s+\(+\s*(\d+)\s+kan\)/);
  if (totalMatch) return parseInt(totalMatch[1], 10);
  return 0;
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
// Yanlis Sonuclar.txt parser
// ============================================================

function parseYanlisSonuclar() {
  const filePath = path.join(__dirname, "sonuc-arsivi", "Yanlis Sonuclar.txt");
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const reports = [];
  const blocks = text.split(/\nRapor \d+/);

  for (const block of blocks) {
    const enemyMatch = block.match(/Rakip dizilis \(T1-T10\):\s*([\d-]+)/);
    const allyMatch = block.match(/Bizim dizilis \(T1-T8\):\s*([\d-]+)/);
    const expectedMatch = block.match(/Beklenen kayiplar \(T1-T8\):\s*([\d-]+)/);
    const actualMatch = block.match(/Gercek kayiplar \(T1-T8\):\s*([\d-]+)/);
    const expectedBloodMatch = block.match(/Beklenen toplam kan kaybi:\s*(\d+)/);
    const actualBloodMatch = block.match(/Gercek toplam kan kaybi:\s*(\d+)/);

    if (!enemyMatch || !allyMatch || !expectedMatch || !actualMatch) continue;

    const enemyParts = enemyMatch[1].split("-").map(Number);
    const allyParts = allyMatch[1].split("-").map(Number);
    const expectedParts = expectedMatch[1].split("-").map(Number);
    const actualParts = actualMatch[1].split("-").map(Number);

    const enemyCounts = {};
    ENEMY_UNITS.forEach((u, i) => { enemyCounts[u.key] = enemyParts[i] || 0; });

    const allyCounts = {};
    ALLY_UNITS.forEach((u, i) => { allyCounts[u.key] = allyParts[i] || 0; });

    const expectedLosses = {};
    ALLY_UNITS.forEach((u, i) => { expectedLosses[u.key] = expectedParts[i] || 0; });

    const actualLosses = {};
    ALLY_UNITS.forEach((u, i) => { actualLosses[u.key] = actualParts[i] || 0; });

    reports.push({
      id: `yanlis-${reports.length + 1}`,
      enemyCounts,
      allyCounts,
      expectedLosses,
      expectedBlood: parseInt(expectedBloodMatch?.[1] || "0", 10),
      actualLosses,
      actualBlood: parseInt(actualBloodMatch?.[1] || "0", 10)
    });
  }

  return reports;
}

// ============================================================
// 101 Katman JSON parser
// ============================================================

function loadLayers101() {
  const filePath = path.join(__dirname, "sonuc-arsivi", "layers_1_101_export.json");
  if (!fs.existsSync(filePath)) return [];
  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const results = [];

  for (const row of rows) {
    const enemyCounts = createZeroCounts(ENEMY_UNITS);
    const allyCounts = createZeroCounts(ALLY_UNITS);
    const expectedLosses = createZeroCounts(ALLY_UNITS);

    const ENEMY_KEY_BY_NAME = {
      skeleton: "skeletons", skeletons: "skeletons", zombie: "zombies", zombies: "zombies",
      cultist: "cultists", cultists: "cultists", "bone wing": "bonewings", "bone wings": "bonewings",
      bonewing: "bonewings", bonewings: "bonewings", obese: "corpses", corpse: "corpses", corpses: "corpses",
      wraith: "wraiths", wraiths: "wraiths", revenant: "revenants", revenants: "revenants",
      "bone giant": "giants", "bone giants": "giants", bonegiant: "giants", bonegiants: "giants",
      broodmother: "broodmothers", broodmothers: "broodmothers", lich: "liches", liches: "liches"
    };

    // Enemy parse
    for (const source of [row.frontlineEnemies, row.backlineEnemies].filter(Boolean)) {
      const parts = String(source).split(",");
      for (const rawPart of parts) {
        const part = rawPart.trim();
        if (!part) continue;
        const match = part.match(/^(\d+)\s+(.+)$/);
        if (!match) continue;
        const amount = parseInt(match[1], 10);
        const normalizedName = match[2].trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
        const key = ENEMY_KEY_BY_NAME[normalizedName];
        if (key) enemyCounts[key] += amount;
      }
    }

    // Ally parse
    ALLY_UNITS.forEach((u, i) => { allyCounts[u.key] = (row.allyCounts && row.allyCounts[i]) || 0; });
    ALLY_UNITS.forEach((u, i) => { expectedLosses[u.key] = (row.expectedLosses && row.expectedLosses[i]) || 0; });

    results.push({
      id: `layer-${row.layer}`,
      layer: row.layer,
      enemyCounts,
      allyCounts,
      expectedLosses,
      expectedBlood: row.expectedLostBlood || 0,
      expectedWinner: "ally",
      isRandom: (enemyCounts.cultists || 0) > 0
    });
  }

  return results;
}

// ============================================================
// Firestore verileri
// ============================================================

function loadWrongFromFirestore() {
  const filePath = path.join(__dirname, "wrongReports.firestoredump.json");
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
  const reports = [];

  for (const doc of raw.documents || []) {
    const f = doc.fields || {};
    const ecRaw = f.enemyCounts;
    const acRaw = f.allyCounts;
    const enemyCounts = parseFirestoreMap(ecRaw?.mapValue || ecRaw);
    const allyCounts = parseFirestoreMap(acRaw?.mapValue || acRaw);

    const actualSummary = f.actualSummaryText?.stringValue || "";
    const actualLosses = parseSummaryLosses(actualSummary);
    const actualBlood = parseSummaryBlood(actualSummary);

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
      simBlood
    });
  }
  return reports;
}

function loadApprovedFromFirestore() {
  const filePath = path.join(__dirname, "approvedStrategies.firestoredump.json");
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
  const reports = [];

  for (const doc of raw.documents || []) {
    const f = doc.fields || {};
    const ecRaw = f.enemyCounts;
    const acRaw = f.allyCounts;
    const enemyCounts = parseFirestoreMap(ecRaw?.mapValue || ecRaw);
    const allyCounts = parseFirestoreMap(acRaw?.mapValue || acRaw);

    const summaryText = f.summaryText?.stringValue || "";
    const expectedLosses = parseSummaryLosses(summaryText);
    const expectedBlood = parseInt(f.lostBlood?.integerValue || f.lostBlood?.stringValue || "0", 10) || parseSummaryBlood(summaryText);
    const winner = f.winner?.stringValue || "ally";

    // LogText'ten temsilci seed'i bul
    const logText = f.logText?.stringValue || "";
    const seedMatch = logText.match(/temsilci seed:\s*(\d+)/);
    const seed = seedMatch ? parseInt(seedMatch[1], 10) : null;

    reports.push({
      id: doc.name.split("/").pop(),
      enemyCounts,
      allyCounts,
      expectedLosses,
      expectedBlood,
      winner,
      seed
    });
  }
  return reports;
}

// ============================================================
// Test motoru
// ============================================================

function findMatchingSeed(enemyCounts, allyCounts, expectedLosses, expectedBlood, expectedWinner, maxSeeds) {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    if (lossesMatch(result.allyLosses, expectedLosses) && result.lostBloodTotal === expectedBlood && result.winner === expectedWinner) {
      return { found: true, seed, result };
    }
  }
  return { found: false };
}

function findClosestSeed(enemyCounts, allyCounts, expectedLosses, expectedBlood, expectedWinner, maxSeeds) {
  let bestSeed = 1;
  let bestResult = null;
  let bestDiff = Infinity;
  let bestBloodDiff = Infinity;

  for (let seed = 1; seed <= maxSeeds; seed++) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    const diff = countDifferences(result.allyLosses, expectedLosses);
    const bloodDiff = Math.abs(result.lostBloodTotal - expectedBlood);
    const winnerOk = result.winner === expectedWinner;

    // Winner uyumsuzlugunu agir cezalandir
    const score = (winnerOk ? 0 : 1000) + diff * 100 + bloodDiff;

    if (score < bestDiff * 100 + bestBloodDiff || (diff < bestDiff)) {
      bestDiff = diff;
      bestBloodDiff = bloodDiff;
      bestSeed = seed;
      bestResult = result;
    }
  }

  return { seed: bestSeed, result: bestResult, diff: bestDiff, bloodDiff: bestBloodDiff };
}

function runFullTest(config) {
  const wrongReports = config.wrongReports || [];
  const approvedReports = config.approvedReports || [];
  const layers101 = config.layers101 || [];
  const maxSeedsWrong = config.maxSeedsWrong || 64;
  const maxSeedsApproved = config.maxSeedsApproved || 32;
  const maxSeedsLayers = config.maxSeedsLayers || 512;

  // WRONG TESTS
  let wrongFixed = 0, wrongStillWrong = 0, wrongWorse = 0;
  const wrongDetails = [];

  for (const r of wrongReports) {
    const simDiff = countDifferences(r.simLosses || r.expectedLosses || {}, r.actualLosses);
    const match = findMatchingSeed(r.enemyCounts, r.allyCounts, r.actualLosses, r.actualBlood, "ally", maxSeedsWrong);

    if (match.found) {
      wrongFixed++;
      wrongDetails.push({ id: r.id, status: "FIXED", seed: match.seed });
    } else {
      const closest = findClosestSeed(r.enemyCounts, r.allyCounts, r.actualLosses, r.actualBlood, "ally", maxSeedsWrong);
      if (closest.diff < simDiff) {
        wrongFixed++;
        wrongDetails.push({ id: r.id, status: "IMPROVED", seed: closest.seed, diff: closest.diff, prevDiff: simDiff });
      } else if (closest.diff > simDiff) {
        wrongWorse++;
        wrongDetails.push({ id: r.id, status: "WORSE", seed: closest.seed, diff: closest.diff, prevDiff: simDiff });
      } else {
        wrongStillWrong++;
        wrongDetails.push({ id: r.id, status: "STILL_WRONG", seed: closest.seed, diff: closest.diff });
      }
    }
  }

  // APPROVED TESTS
  let approvedKept = 0, approvedBroken = 0;
  const approvedBrokenDetails = [];

  for (const r of approvedReports) {
    const match = findMatchingSeed(r.enemyCounts, r.allyCounts, r.expectedLosses, r.expectedBlood, r.winner || "ally", maxSeedsApproved);
    if (match.found) {
      approvedKept++;
    } else {
      approvedBroken++;
      const closest = findClosestSeed(r.enemyCounts, r.allyCounts, r.expectedLosses, r.expectedBlood, r.winner || "ally", 8);
      approvedBrokenDetails.push({
        id: r.id,
        expected: formatLosses(r.expectedLosses),
        actual: formatLosses(closest.result?.allyLosses || {}),
        expectedBlood: r.expectedBlood,
        actualBlood: closest.result?.lostBloodTotal || 0
      });
    }
  }

  // 101 LAYER TESTS
  let layers101Exact = 0, layers101Blood = 0, layers101Total = layers101.length;
  const layers101Details = [];

  for (const r of layers101) {
    const isRandom = r.isRandom;
    const seedsToTry = isRandom ? maxSeedsLayers : 1;

    let exactFound = false;
    let bloodFound = false;
    let bestSeed = 1;
    let bestResult = null;
    let bestDiff = Infinity;

    for (let seed = 1; seed <= seedsToTry; seed++) {
      const result = simulateBattle(r.enemyCounts, r.allyCounts, { seed, collectLog: false });
      const diff = countDifferences(result.allyLosses, r.expectedLosses);
      const sameWinner = result.winner === (r.expectedWinner || "ally");
      const sameBlood = sameWinner && result.lostBloodTotal === r.expectedBlood;
      const sameLosses = lossesMatch(result.allyLosses, r.expectedLosses);

      if (diff < bestDiff) {
        bestDiff = diff;
        bestSeed = seed;
        bestResult = result;
      }

      if (sameBlood && !bloodFound) bloodFound = true;
      if (sameBlood && sameLosses) { exactFound = true; break; }
    }

    if (exactFound) layers101Exact++;
    if (bloodFound) layers101Blood++;

    if (!exactFound) {
      layers101Details.push({
        id: r.id,
        layer: r.layer,
        expectedBlood: r.expectedBlood,
        actualBlood: bestResult?.lostBloodTotal || 0,
        expected: formatLosses(r.expectedLosses),
        actual: formatLosses(bestResult?.allyLosses || {}),
        diff: bestDiff
      });
    }
  }

  return {
    wrong: { total: wrongReports.length, fixed: wrongFixed, stillWrong: wrongStillWrong, worse: wrongWorse, details: wrongDetails },
    approved: { total: approvedReports.length, kept: approvedKept, broken: approvedBroken, brokenDetails: approvedBrokenDetails },
    layers101: { total: layers101Total, exact: layers101Exact, bloodMatch: layers101Blood, details: layers101Details }
  };
}

// ============================================================
// Ana test akisi
// ============================================================

function main() {
  console.log("============================================================");
  console.log("   SAVAS SIMULATORU KAPSAMLI TEST ARACI");
  console.log("============================================================\n");

  console.log("Veriler yukleniyor...");
  const wrongFirestore = loadWrongFromFirestore();
  const wrongYanlis = parseYanlisSonuclar();
  const approvedReports = loadApprovedFromFirestore();
  const layers101 = loadLayers101();

  // Tum wrong'lari birlestir
  const allWrong = [...wrongFirestore];
  // wrongYanlis'dakileri eger firestore'da yoksa ekle
  for (const r of wrongYanlis) {
    if (!allWrong.some((w) => w.allyCounts && JSON.stringify(w.allyCounts) === JSON.stringify(r.allyCounts) &&
        w.enemyCounts && JSON.stringify(w.enemyCounts) === JSON.stringify(r.enemyCounts))) {
      allWrong.push(r);
    }
  }

  console.log(`  Wrong (Firestore): ${wrongFirestore.length}`);
  console.log(`  Wrong (Yanlis Sonuclar.txt): ${wrongYanlis.length}`);
  console.log(`  Wrong (birlesik): ${allWrong.length}`);
  console.log(`  Approved: ${approvedReports.length}`);
  console.log(`  101 Katman: ${layers101.length}\n`);

  // ============================================================
  // TEST 0: BASELINE
  // ============================================================
  console.log("============================================================");
  console.log("  TEST 0: MEVCUT DURUM (Baseline)");
  console.log("============================================================");

  const baseline = runFullTest({
    wrongReports: allWrong,
    approvedReports,
    layers101,
    maxSeedsWrong: 64,
    maxSeedsApproved: 32,
    maxSeedsLayers: 512
  });

  console.log(`  Wrong: ${baseline.wrong.fixed}/${baseline.wrong.total} duzeldi/iyilesti, ${baseline.wrong.stillWrong} hala yanlis, ${baseline.wrong.worse} daha kotu`);
  console.log(`  Approved: ${baseline.approved.kept}/${baseline.approved.total} korundu, ${baseline.approved.broken} bozuldu`);
  console.log(`  101 Katman: ${baseline.layers101.exact}/${baseline.layers101.total} tam eslesti, ${baseline.layers101.bloodMatch} kan eslesti\n`);

  // Yanlis detaylari
  for (const d of baseline.wrong.details) {
    if (d.status !== "FIXED") {
      console.log(`    ${d.id}: ${d.status} (fark: ${d.diff})${d.prevDiff !== undefined ? ` onceki: ${d.prevDiff}` : ""}`);
    }
  }
  console.log();

  // ============================================================
  // Simulasyonu yeniden yukle (temiz baslangic)
  // ============================================================
  function reloadCore() {
    BattleCore = loadBattleCore();
    simulateBattle = BattleCore.simulateBattle;
  }

  // ============================================================
  // FIX 1: Round-start Gargoyle (T6) slow
  // Her raund basinda gargoyle hayattaysa, en hizli dusmana -2 speed
  // ============================================================
  console.log("============================================================");
  console.log("  FIX 1: Round-start Gargoyle slow (en hizli dusman)");
  console.log("============================================================");

  reloadCore();

  // Battle-core.js'deki simulateBattle fonksiyonunu wrap et
  const origSimulate = simulateBattle;

  // Monkey-patch: simulateBattle'i override et
  const patchedSimulate1 = function(enemyCounts, allyCounts, options = {}) {
    // Once orijinal simulasyonu calistir
    const result = origSimulate(enemyCounts, allyCounts, options);
    return result;
  };

  // Bunun yerine battle-core.js'de dogrudan degisiklik yapmam lazim.
  // Simdiye kadar monkey-patch ile yapalim.

  // Aslında, dogrudan battle-core.js'de degisiklik yaparak test edeyim.
  // Bunun icin test scriptinde simulasyonu wrap eden bir fonksiyon yazayim.

  console.log("  [Bu test battle-core.js uzerinden calistirilacak]\n");

  // ============================================================
  // Sonuc raporu
  // ============================================================
  console.log("============================================================");
  console.log("  SONUC RAPORU");
  console.log("============================================================\n");

  console.log("Baseline:");
  console.log(`  Wrong fixed/total: ${baseline.wrong.fixed}/${baseline.wrong.total}`);
  console.log(`  Approved kept/total: ${baseline.approved.kept}/${baseline.approved.total}`);
  console.log(`  101-layer exact/total: ${baseline.layers101.exact}/${baseline.layers101.total}`);
  console.log();
}

main();
