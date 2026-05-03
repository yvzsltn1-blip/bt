"use strict";

// Test: Yeni yanlis raporlari (Yanlis Sonuclar.txt) vs mevcut motor
// Calistirmak icin: node test-yanlis-2026-05-01.js

const fs = require("fs");
const path = require("path");

delete require.cache[require.resolve("./battle-core.js")];
require("./battle-core.js");
const { simulateBattle, ENEMY_UNITS, ALLY_UNITS } = globalThis.BattleCore;

const MAX_SEEDS = 512;

function parseYanlisFile() {
  const text = fs.readFileSync(path.join(__dirname, "sonuc-arsivi", "Yanlis Sonuclar.txt"), "utf8");
  const reports = [];
  const rawBlocks = text.split(/\nRapor (\d+)/);

  // rawBlocks[0] = header, then alternating [number, content]
  for (let i = 1; i < rawBlocks.length; i += 2) {
    const num = rawBlocks[i];
    const block = rawBlocks[i + 1] || "";

    const enemyMatch = block.match(/Rakip dizilis \(T1-T10\):\s*([\d-]+)/);
    const allyMatch = block.match(/Bizim dizilis \(T1-T8\):\s*([\d-]+)/);
    const actualMatch = block.match(/Gercek kayiplar \(T1-T8\):\s*([\d-]+)/);
    const actualBloodMatch = block.match(/Gercek toplam kan kaybi:\s*(\d+)/);
    const simMatch = block.match(/Beklenen kayiplar \(T1-T8\):\s*([\d-]+)/);
    const simBloodMatch = block.match(/Beklenen toplam kan kaybi:\s*(\d+)/);

    if (!enemyMatch || !allyMatch || !actualMatch) continue;

    const ep = enemyMatch[1].split("-").map(Number);
    const ap = allyMatch[1].split("-").map(Number);
    const actp = actualMatch[1].split("-").map(Number);
    const simp = simMatch ? simMatch[1].split("-").map(Number) : actp.map(() => 0);

    const enemyCounts = {};
    ENEMY_UNITS.forEach((u, i) => { enemyCounts[u.key] = ep[i] || 0; });

    const allyCounts = {};
    ALLY_UNITS.forEach((u, i) => { allyCounts[u.key] = ap[i] || 0; });

    const actualLosses = {};
    ALLY_UNITS.forEach((u, i) => { actualLosses[u.key] = actp[i] || 0; });

    const simLosses = {};
    ALLY_UNITS.forEach((u, i) => { simLosses[u.key] = simp[i] || 0; });

    reports.push({
      id: `R${num}`,
      enemyCounts,
      allyCounts,
      actualLosses,
      actualBlood: parseInt(actualBloodMatch?.[1] || "0", 10),
      simLosses,
      simBlood: parseInt(simBloodMatch?.[1] || "0", 10)
    });
  }
  return reports;
}

function parseDogru() {
  const text = fs.readFileSync(path.join(__dirname, "sonuc-arsivi", "dogru.txt"), "utf8");
  const reports = [];
  const rawBlocks = text.split(/\nKayit (\d+)/);

  for (let i = 1; i < rawBlocks.length; i += 2) {
    const num = rawBlocks[i];
    const block = rawBlocks[i + 1] || "";

    const enemyMatch = block.match(/Rakip dizilis \(T1-T10\):\s*([\d-]+)/);
    const allyMatch = block.match(/Bizim dizilis \(T1-T8\):\s*([\d-]+)/);
    const expectedMatch = block.match(/Beklenen kayiplar \(T1-T8\):\s*([\d-]+)/);
    const expectedBloodMatch = block.match(/Beklenen toplam kan kaybi:\s*(\d+)/);

    if (!enemyMatch || !allyMatch || !expectedMatch) continue;

    const ep = enemyMatch[1].split("-").map(Number);
    const ap = allyMatch[1].split("-").map(Number);
    const expp = expectedMatch[1].split("-").map(Number);

    const enemyCounts = {};
    ENEMY_UNITS.forEach((u, i) => { enemyCounts[u.key] = ep[i] || 0; });

    const allyCounts = {};
    ALLY_UNITS.forEach((u, i) => { allyCounts[u.key] = ap[i] || 0; });

    const expectedLosses = {};
    ALLY_UNITS.forEach((u, i) => { expectedLosses[u.key] = expp[i] || 0; });

    reports.push({
      id: `D${num}`,
      enemyCounts,
      allyCounts,
      expectedLosses,
      expectedBlood: parseInt(expectedBloodMatch?.[1] || "0", 10)
    });
  }
  return reports;
}

function lossesMatch(a, b) {
  return ALLY_UNITS.every(u => (a[u.key] || 0) === (b[u.key] || 0));
}

function countDiff(a, b) {
  let d = 0;
  for (const u of ALLY_UNITS) d += Math.abs((a[u.key] || 0) - (b[u.key] || 0));
  return d;
}

function lossStr(losses) {
  return ALLY_UNITS.map(u => losses[u.key] || 0).join("-");
}

function testCase(r, maxSeeds) {
  let bestDiff = Infinity;
  let bestSeed = -1;
  let bestLosses = null;
  let bestBlood = 0;
  let exactMatch = false;
  let exactSeed = -1;

  for (let seed = 0; seed < maxSeeds; seed++) {
    const result = simulateBattle(r.enemyCounts, r.allyCounts, { seed, collectLog: false });
    if (lossesMatch(result.allyLosses, r.actualLosses) && result.lostBloodTotal === r.actualBlood) {
      exactMatch = true;
      exactSeed = seed;
      break;
    }
    const d = countDiff(result.allyLosses, r.actualLosses);
    if (d < bestDiff) {
      bestDiff = d;
      bestSeed = seed;
      bestLosses = result.allyLosses;
      bestBlood = result.lostBloodTotal;
    }
  }

  if (exactMatch) {
    return { status: "EXACT", seed: exactSeed, diff: 0 };
  }

  const simDiff = countDiff(r.simLosses, r.actualLosses);

  return {
    status: bestDiff < simDiff ? "IMPROVED" : bestDiff === simDiff ? "SAME" : "WORSE",
    seed: bestSeed,
    diff: bestDiff,
    simDiff,
    bestLosses,
    bestBlood
  };
}

console.log("=== YANLIS RAPOR TESTİ (mevcut motor) ===\n");

const yanlis = parseYanlisFile();
const dogru = parseDogru();

console.log(`Yanlış rapor sayısı: ${yanlis.length}`);
console.log(`Doğru rapor sayısı: ${dogru.length}`);
console.log(`Max seed: ${MAX_SEEDS}`);
console.log("");

// --- YANLIS TEST ---
console.log("--- YANLIŞ RAPORLAR ---");
let fixedCount = 0;
let improvedCount = 0;
let sameCount = 0;
let worseCount = 0;

for (const r of yanlis) {
  const res = testCase(r, MAX_SEEDS);
  const simDiffStr = `eski_diff=${countDiff(r.simLosses, r.actualLosses)}`;
  const enemy9 = r.enemyCounts.broodmothers || 0;

  if (res.status === "EXACT") {
    fixedCount++;
    console.log(`✅ ${r.id} DÜZELDI (seed=${res.seed}) T9=${enemy9}`);
  } else if (res.status === "IMPROVED") {
    improvedCount++;
    console.log(`🔶 ${r.id} İYİLEŞTİ (diff=${res.diff} < ${res.simDiff}) T9=${enemy9}`);
    console.log(`   Gerçek:  ${lossStr(r.actualLosses)} (kan=${r.actualBlood})`);
    console.log(`   En iyi:  ${lossStr(res.bestLosses)} (kan=${res.bestBlood}) seed=${res.seed}`);
    console.log(`   Eski sim:${lossStr(r.simLosses)} (kan=${r.simBlood})`);
  } else if (res.status === "SAME") {
    sameCount++;
    console.log(`⬜ ${r.id} AYNI (diff=${res.diff}) T9=${enemy9}`);
    console.log(`   Gerçek:  ${lossStr(r.actualLosses)} (kan=${r.actualBlood})`);
    console.log(`   En iyi:  ${lossStr(res.bestLosses)} (kan=${res.bestBlood})`);
    console.log(`   Eski sim:${lossStr(r.simLosses)}`);
  } else {
    worseCount++;
    console.log(`❌ ${r.id} KÖTÜLEŞTI (diff=${res.diff} > ${res.simDiff}) T9=${enemy9}`);
    console.log(`   Gerçek:  ${lossStr(r.actualLosses)}`);
    console.log(`   En iyi:  ${lossStr(res.bestLosses)}`);
    console.log(`   Eski sim:${lossStr(r.simLosses)}`);
  }
}

console.log("");
console.log(`Özet → Düzeldi: ${fixedCount}, İyileşti: ${improvedCount}, Aynı: ${sameCount}, Kötüleşti: ${worseCount}`);
console.log("");

// --- DOĞRU TEST ---
console.log("--- DOĞRU RAPORLAR (regresyon kontrolü) ---");
let dogruOk = 0;
let dogruBroken = 0;

for (const r of dogru) {
  let found = false;
  for (let seed = 0; seed < 64; seed++) {
    const result = simulateBattle(r.enemyCounts, r.allyCounts, { seed, collectLog: false });
    if (lossesMatch(result.allyLosses, r.expectedLosses) && result.lostBloodTotal === r.expectedBlood) {
      found = true;
      break;
    }
  }
  if (found) {
    dogruOk++;
  } else {
    dogruBroken++;
    console.log(`❌ ${r.id} BOZULDU!  Beklenen: ${lossStr(r.expectedLosses)} kan=${r.expectedBlood}`);
  }
}

console.log(`Doğru korunan: ${dogruOk}/${dogru.length}`);
if (dogruBroken === 0) console.log("✅ Tüm doğrular sağlam!");
