"use strict";

// Hipotez testleri: witch splash revert + cultist buff inheritance
// node test-hipotez-2026-05-01.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MAX_SEEDS = 512;

// Orijinal kodu string olarak yukle, sonra patch'le
function loadPatchedCore(patches) {
  let code = fs.readFileSync(path.join(__dirname, "battle-core.js"), "utf8");
  code = code.replace(/\r\n/g, "\n"); // normalize CRLF → LF for patch matching
  for (const patch of patches) {
    if (patch.from && !code.includes(patch.from)) {
      throw new Error(`Patch string not found in source: ${patch.from.substring(0, 80)}...`);
    }
    code = code.replace(patch.from, patch.to);
  }
  const ctx = { globalThis: {} };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.globalThis.BattleCore;
}

// === PATCH TANIMLARI ===

// Orijinal (mevcut) - Witch splash: KILL'de
const WITCH_KILL_PATCH = {
  // Bu hali MEVCUT durumu temsil ediyor - patch YALITILMIŞ test icin
  from: null, to: null  // placeholder
};

// Hipotez A: Witch splash revert (kill condition kaldir)
// Mevcut JS: splash sadece kill'de
// Python gibi: her even round saldirida splash (kill'de degil)
const WITCH_REVERT = {
  from: `        if (unitHealth[defenderIndex] <= 0) {
          if (witchesSplashEligible) {
            witchesSplashDamage = ceilCombatValue(attackerDamage * 0.25);
          }
          if (attackerIndex === LICHES_INDEX) {`,
  to: `        if (witchesSplashEligible) {
          witchesSplashDamage = ceilCombatValue(attackerDamage * 0.25);
        }

        if (unitHealth[defenderIndex] <= 0) {
          if (attackerIndex === LICHES_INDEX) {`
};

// Hipotez B: Cultist buff → Revived zombie inheritance
const CULTIST_REVIVED_BUFF = {
  from: `          unitBuffs[randomUnitIndex] += 0.1;
              log`,
  to: `          unitBuffs[randomUnitIndex] += 0.1;
              if (randomUnitIndex === ZOMBIES_INDEX) {
                unitBuffs[REVIVED_INDEX] = unitBuffs[ZOMBIES_INDEX];
              }
              log`
};

function parseYanlisFile(bc) {
  const text = fs.readFileSync(path.join(__dirname, "sonuc-arsivi", "Yanlis Sonuclar.txt"), "utf8");
  const reports = [];
  const rawBlocks = text.split(/\nRapor (\d+)/);

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

    const ec = {}, ac = {}, al = {}, sl = {};
    bc.ENEMY_UNITS.forEach((u, i) => { ec[u.key] = ep[i] || 0; });
    bc.ALLY_UNITS.forEach((u, i) => { ac[u.key] = ap[i] || 0; });
    bc.ALLY_UNITS.forEach((u, i) => { al[u.key] = actp[i] || 0; });
    bc.ALLY_UNITS.forEach((u, i) => { sl[u.key] = simp[i] || 0; });

    reports.push({ id:`R${num}`, enemyCounts:ec, allyCounts:ac, actualLosses:al,
      actualBlood: parseInt(actualBloodMatch?.[1]||"0",10), simLosses:sl,
      simBlood: parseInt(simBloodMatch?.[1]||"0",10) });
  }
  return reports;
}

function parseDogru(bc) {
  const text = fs.readFileSync(path.join(__dirname, "sonuc-arsivi", "dogru.txt"), "utf8");
  const reports = [];
  const rawBlocks = text.split(/\nKayit (\d+)/);
  for (let i = 1; i < rawBlocks.length; i += 2) {
    const num = rawBlocks[i];
    const block = rawBlocks[i + 1] || "";
    const em = block.match(/Rakip dizilis \(T1-T10\):\s*([\d-]+)/);
    const am = block.match(/Bizim dizilis \(T1-T8\):\s*([\d-]+)/);
    const xm = block.match(/Beklenen kayiplar \(T1-T8\):\s*([\d-]+)/);
    const bm = block.match(/Beklenen toplam kan kaybi:\s*(\d+)/);
    if (!em || !am || !xm) continue;
    const ep = em[1].split("-").map(Number);
    const ap = am[1].split("-").map(Number);
    const xp = xm[1].split("-").map(Number);
    const ec = {}, ac = {}, xl = {};
    bc.ENEMY_UNITS.forEach((u, i) => { ec[u.key] = ep[i] || 0; });
    bc.ALLY_UNITS.forEach((u, i) => { ac[u.key] = ap[i] || 0; });
    bc.ALLY_UNITS.forEach((u, i) => { xl[u.key] = xp[i] || 0; });
    reports.push({ id:`D${num}`, enemyCounts:ec, allyCounts:ac, expectedLosses:xl,
      expectedBlood: parseInt(bm?.[1]||"0",10) });
  }
  return reports;
}

function lossesMatch(a, b, units) {
  return units.every(u => (a[u.key]||0) === (b[u.key]||0));
}

function countDiff(a, b, units) {
  let d = 0;
  for (const u of units) d += Math.abs((a[u.key]||0) - (b[u.key]||0));
  return d;
}

function lossStr(losses, units) {
  return units.map(u => losses[u.key]||0).join("-");
}

function runTest(bc, yanlis, dogru, label) {
  const { simulateBattle, ALLY_UNITS, ENEMY_UNITS } = bc;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`${"=".repeat(60)}`);

  let fixed=0, improved=0, same=0, worse=0;

  for (const r of yanlis) {
    const simDiff = countDiff(r.simLosses, r.actualLosses, ALLY_UNITS);
    let exactSeed=-1, bestDiff=Infinity, bestSeed=-1, bestLosses=null;

    for (let seed=0; seed<MAX_SEEDS; seed++) {
      const res = simulateBattle(r.enemyCounts, r.allyCounts, {seed, collectLog:false});
      if (lossesMatch(res.allyLosses, r.actualLosses, ALLY_UNITS) && res.lostBloodTotal===r.actualBlood) {
        exactSeed=seed; break;
      }
      const d = countDiff(res.allyLosses, r.actualLosses, ALLY_UNITS);
      if (d<bestDiff) { bestDiff=d; bestSeed=seed; bestLosses=res.allyLosses; }
    }

    const t9 = r.enemyCounts.broodmothers||0;
    if (exactSeed>=0) {
      fixed++;
      console.log(`✅ ${r.id} DÜZELDI (seed=${exactSeed}) T9=${t9}`);
    } else if (bestDiff < simDiff) {
      improved++;
      console.log(`🔶 ${r.id} İYİLEŞTİ (${simDiff}→${bestDiff}) T9=${t9}  best:${lossStr(bestLosses,ALLY_UNITS)}`);
    } else if (bestDiff > simDiff) {
      worse++;
      console.log(`❌ ${r.id} KÖTÜLEŞTI (${simDiff}→${bestDiff}) T9=${t9}  best:${lossStr(bestLosses,ALLY_UNITS)}`);
    } else {
      same++;
      console.log(`⬜ ${r.id} AYNI (${bestDiff}) T9=${t9}`);
    }
  }

  console.log(`\nÖzet: Düzeldi=${fixed} İyileşti=${improved} Aynı=${same} Kötüleşti=${worse}`);

  // Dogru testi
  let ok=0, broken=0;
  for (const r of dogru) {
    let found=false;
    for (let seed=0; seed<64; seed++) {
      const res = simulateBattle(r.enemyCounts, r.allyCounts, {seed, collectLog:false});
      if (lossesMatch(res.allyLosses, r.expectedLosses, ALLY_UNITS) && res.lostBloodTotal===r.expectedBlood) {
        found=true; break;
      }
    }
    if (found) ok++; else { broken++; console.log(`  ❌ DOGRU BOZULDU: ${r.id}`); }
  }
  console.log(`Doğru korunan: ${ok}/${dogru.length}${broken===0?' ✅':' ❌ REGRESYON!'}`);
  return { fixed, improved, same, worse, brokenDogru: broken };
}

// === ANA TESTLER ===

// Baseline (mevcut motor)
{
  delete require.cache[require.resolve("./battle-core.js")];
  require("./battle-core.js");
  const bc = globalThis.BattleCore;
  const yanlis = parseYanlisFile(bc);
  const dogru = parseDogru(bc);
  runTest(bc, yanlis, dogru, "BASELINE (mevcut motor)");
}

// Hipotez A: Witch splash REVERT (no kill condition - Python gibi)
{
  try {
    const bc = loadPatchedCore([WITCH_REVERT]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ A: Witch Splash REVERT (no kill condition)");
  } catch(e) {
    console.log("HİPOTEZ A HATASI:", e.message.substring(0,200));
  }
}

// Hipotez B: Cultist buff → Revived zombie
{
  try {
    const bc = loadPatchedCore([CULTIST_REVIVED_BUFF]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ B: Cultist Buff → Revived Zombies");
  } catch(e) {
    console.log("HİPOTEZ B HATASI:", e.message.substring(0,200));
  }
}

// Hipotez C: Her ikisi birlikte
{
  try {
    const bc = loadPatchedCore([WITCH_REVERT, CULTIST_REVIVED_BUFF]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ C: Witch REVERT + Cultist Buff Inheritance");
  } catch(e) {
    console.log("HİPOTEZ C HATASI:", e.message.substring(0,200));
  }
}

// Hipotez D: Count tie-break kaldır (order rank ile tie-break)
// Sebep: Bansheler round 3'te Bonewings (7 birim) yerine Spiderlings (10 birim) hedeflıyor
// çünkü count>bestCount tie-break'i daha fazla birime sahip Spiderlings'i kazandırıyor.
// Bonewings index 3, Spiderlings index 19 → order rank'ta Bonewings önce geliyor.
const COUNT_TIEBREAK_REMOVE = {
  from: `        (positionRank === bestPositionRank && speed === bestSpeed && count > bestCount) ||
        (positionRank === bestPositionRank && speed === bestSpeed && count === bestCount && i < bestOrderRank);`,
  to: `        (positionRank === bestPositionRank && speed === bestSpeed && i < bestOrderRank);`
};

{
  try {
    const bc = loadPatchedCore([COUNT_TIEBREAK_REMOVE]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ D: Count Tie-break Kaldır (order rank ile)");
  } catch(e) {
    console.log("HİPOTEZ D HATASI:", e.message.substring(0,200));
  }
}

// Hipotez E: D + Witch REVERT (count tiebreak kaldır + splash no-kill condition)
{
  try {
    const bc = loadPatchedCore([COUNT_TIEBREAK_REMOVE, WITCH_REVERT]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ E: Count Tie-break Kaldır + Witch REVERT");
  } catch(e) {
    console.log("HİPOTEZ E HATASI:", e.message.substring(0,200));
  }
}

// Hipotez F: Spiderlings düşük öncelikli hedef (count tie-break korunuyor ama spiderling her zaman sona kalıyor)
// Neden: D tam fix ama 12 onaylı kaydı bozuyor. Sorun spiderlings'e özgü — diğer birimler için count tie-break doğru.
// Fix: Spiderlings olmayan birim, Spiderlings'den her zaman daha iyi hedef sayılır.
const SPIDERLINGS_LOW_PRIORITY = {
  from: `        (positionRank === bestPositionRank && speed === bestSpeed && count > bestCount) ||
        (positionRank === bestPositionRank && speed === bestSpeed && count === bestCount && i < bestOrderRank);`,
  to: `        (positionRank === bestPositionRank && speed === bestSpeed && defenderIndex !== SPIDERLINGS_INDEX && bestDefenderIndex === SPIDERLINGS_INDEX) ||
        (positionRank === bestPositionRank && speed === bestSpeed && (defenderIndex === SPIDERLINGS_INDEX) === (bestDefenderIndex === SPIDERLINGS_INDEX) && count > bestCount) ||
        (positionRank === bestPositionRank && speed === bestSpeed && (defenderIndex === SPIDERLINGS_INDEX) === (bestDefenderIndex === SPIDERLINGS_INDEX) && count === bestCount && i < bestOrderRank);`
};

{
  try {
    const bc = loadPatchedCore([SPIDERLINGS_LOW_PRIORITY]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ F: Spiderlings Düşük Öncelikli Hedef");
  } catch(e) {
    console.log("HİPOTEZ F HATASI:", e.message.substring(0,200));
  }
}

// Hipotez G: F + Witch REVERT
{
  try {
    const bc = loadPatchedCore([SPIDERLINGS_LOW_PRIORITY, WITCH_REVERT]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ G: Spiderlings Düşük Öncelik + Witch REVERT");
  } catch(e) {
    console.log("HİPOTEZ G HATASI:", e.message.substring(0,200));
  }
}

// Hipotez I: Spiderlings SADECE SLOWLANDI ise düşük öncelik
// Önceki deneme (yanlış yön): bestDefenderIndex=Spiderlings iken current=non-spider → ama
// gerçekte Bonewings (j=3) önce en iyi oluyor, sonra Spiderlings (j=19) onu geçmeye çalışıyor.
// Doğru fix: Spiderlings slowed iken count ile best'i geçemesin.
// spiderBlocked = current IS slowed spiderlings, best is NOT spiderlings, same speed&position
const SLOWED_SPIDERLINGS_LOW_PRIORITY = {
  from: `      const isBetter =
        positionRank < bestPositionRank ||
        (positionRank === bestPositionRank && speed < bestSpeed) ||
        (positionRank === bestPositionRank && speed === bestSpeed && count > bestCount) ||
        (positionRank === bestPositionRank && speed === bestSpeed && count === bestCount && i < bestOrderRank);`,
  to: `      const spiderBlocked = defenderIndex === SPIDERLINGS_INDEX && bestDefenderIndex !== SPIDERLINGS_INDEX && bestDefenderIndex !== -1 && unitSpeed[SPIDERLINGS_INDEX] < UNIT_DESC[SPIDERLINGS_INDEX][SPEED_INDEX] && positionRank === bestPositionRank && speed === bestSpeed;
      const isBetter = !spiderBlocked && (
        positionRank < bestPositionRank ||
        (positionRank === bestPositionRank && speed < bestSpeed) ||
        (positionRank === bestPositionRank && speed === bestSpeed && count > bestCount) ||
        (positionRank === bestPositionRank && speed === bestSpeed && count === bestCount && i < bestOrderRank));`
};

{
  try {
    const bc = loadPatchedCore([SLOWED_SPIDERLINGS_LOW_PRIORITY]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ I: Slowed Spiderlings Düşük Öncelik");
  } catch(e) {
    console.log("HİPOTEZ I HATASI:", e.message.substring(0,200));
  }
}

// Hipotez J: I + Witch REVERT
{
  try {
    const bc = loadPatchedCore([SLOWED_SPIDERLINGS_LOW_PRIORITY, WITCH_REVERT]);
    const yanlis = parseYanlisFile(bc);
    const dogru = parseDogru(bc);
    runTest(bc, yanlis, dogru, "HİPOTEZ J: Slowed Spiderlings Düşük Öncelik + Witch REVERT");
  } catch(e) {
    console.log("HİPOTEZ J HATASI:", e.message.substring(0,200));
  }
}
