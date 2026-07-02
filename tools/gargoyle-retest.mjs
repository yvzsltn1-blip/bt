// Geçici analiz aracı: test-sonuclari-1-40 txt özetlerini parse edip
// battle-core simülatörünün gerçek sonuca seed taramasıyla ulaşıp ulaşamadığını ölçer.
// Amaç: Gargoyle (T6) tip düzeltmesi (monster->brute) pass'ları bozmadan fail düzeltiyor mu?
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TESTDIR = path.join(ROOT, "test-sonuclari-1-40");

const SEED_COUNT = Number(process.argv[2] || 1500);
const PATCH = process.argv.includes("--patch");      // Gargoyle monster->brute
const RR = process.argv.includes("--rr");            // randomized rounding (tum kesirler)

// --- battle-core yükle (gerekirse yamala) ---
let coreSrc = fs.readFileSync(path.join(ROOT, "battle-core.js"), "utf8").replace(/\r\n/g, "\n");
if (PATCH) {
  const before = coreSrc;
  coreSrc = coreSrc.replace(
    '["Gargoyle (T6)", "ally", "monster", "front", 12, 12, 3, 15, 75]',
    '["Gargoyle (T6)", "ally", "brute", "front", 12, 12, 3, 15, 75]'
  );
  if (coreSrc === before) throw new Error("Gargoyle satiri bulunamadi (patch basarisiz)");
}
if (process.argv.includes("--corpse2")) {
  let before = coreSrc;
  coreSrc = coreSrc.replace(
    "if (corpsesNumbersDiff > 0 && unitNumbers[CORPSES_INDEX] === 0) {",
    "if (corpsesNumbersDiff > 0) {"
  );
  if (coreSrc === before) throw new Error("corpse2 kosul bulunamadi");
  before = coreSrc;
  coreSrc = coreSrc.replace(
    "corpses * UNIT_DESC[CORPSES_INDEX][HEALTH_INDEX] * 0.2",
    "corpsesNumbersDiff * UNIT_DESC[CORPSES_INDEX][HEALTH_INDEX] * 0.2"
  );
  if (coreSrc === before) throw new Error("corpse2 miktar bulunamadi");
}
if (process.argv.includes("--corpse")) {
  const before = coreSrc;
  coreSrc = coreSrc.replace(
    "corpses * UNIT_DESC[CORPSES_INDEX][HEALTH_INDEX] * 0.2",
    "corpsesNumbersDiff * UNIT_DESC[CORPSES_INDEX][HEALTH_INDEX] * 0.2"
  );
  if (coreSrc === before) throw new Error("corpse blok bulunamadi");
}
if (RR) {
  const oldBlock = `          const perUnitDamage = normalizedValue / unitCount;
          const perUnitFraction = perUnitDamage - Math.floor(perUnitDamage);
          if (Math.abs(perUnitFraction - 0.5) < 1e-9) {
            let total = Math.floor(perUnitDamage) * unitCount;
            for (let u = 0; u < unitCount; u += 1) {
              if (rng() >= 0.5) {
                total += 1;
              }
            }
            return total;
          }`;
  const newBlock = `          const perUnitDamage = normalizedValue / unitCount;
          const floorPer = Math.floor(perUnitDamage);
          const perUnitFraction = perUnitDamage - floorPer;
          if (perUnitFraction > 1e-9) {
            let total = floorPer * unitCount;
            for (let u = 0; u < unitCount; u += 1) {
              if (rng() < perUnitFraction) {
                total += 1;
              }
            }
            return total;
          }
          return floorPer * unitCount;`;
  const before = coreSrc;
  coreSrc = coreSrc.replace(oldBlock, newBlock);
  if (coreSrc === before) throw new Error("RR blok bulunamadi (patch basarisiz)");
}
const context = { console, window: {} };
context.window.window = context.window;
context.globalThis = context.window;
vm.createContext(context);
vm.runInContext(coreSrc, context);
const BC = context.window.BattleCore;
const simulateBattle = BC.simulateBattle;

const R = ["skeletons","zombies","cultists","bonewings","corpses","wraiths","revenants","giants","broodmothers","liches"];
const T = ["bats","ghouls","thralls","banshees","necromancers","gargoyles","witches","rotmaws"];
const LABEL2KEY = {
  "Yarasa Sürüsü":"bats","Gulyabani":"ghouls","Vampir Kolu":"thralls","Banshee":"banshees",
  "Ölü Çağırıcı":"necromancers","Gargoyle":"gargoyles","Kan Cadısı":"witches","Çürük Gırtlak":"rotmaws"
};

function parseBracket(line, prefix) {
  // "Rakip : [R1:2-R2:9]" -> {skeletons:2, zombies:9,...}
  const m = line.match(/\[([^\]]*)\]/);
  const out = {};
  (prefix === "R" ? R : T).forEach(k => out[k] = 0);
  if (!m) return out;
  m[1].split("-").forEach(tok => {
    const mm = tok.match(/([RT])(\d+):(\d+)/);
    if (!mm) return;
    const arr = mm[1] === "R" ? R : T;
    const idx = Number(mm[2]) - 1;
    if (arr[idx]) out[arr[idx]] = Number(mm[3]);
  });
  return out;
}

function parseLosses(line) {
  // "Gerceklesen kayip birlik: Gulyabani (T2) x1, ..." veya "-"
  const out = Object.fromEntries(T.map(k => [k, 0]));
  const body = line.split(":").slice(1).join(":").trim();
  if (!body || body === "-") return out;
  body.split(",").forEach(part => {
    const mm = part.match(/\(T(\d)\)\s*x(\d+)/);
    if (!mm) return;
    const key = T[Number(mm[1]) - 1];
    if (key) out[key] = Number(mm[2]);
  });
  return out;
}

function parseFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const blocks = text.split(/\n(?=#\d+ \[)/);
  const cases = [];
  for (const b of blocks) {
    if (!/\[(DOGRU|YANLIS)\]/.test(b)) continue;
    const lines = b.split("\n");
    const get = (re) => lines.find(l => re.test(l)) || "";
    const enemy = parseBracket(get(/^Rakip\s*:/), "R");
    const ally = parseBracket(get(/^Biz\s*:/), "T");
    const realResLine = get(/^Gerceklesen sonuc:/);
    const winner = /Galibiyet/.test(realResLine) ? "ally" : "enemy";
    const bloodLine = get(/^Gerceklesen kayip:/);
    const bloodM = bloodLine.match(/Gerceklesen kayip:\s*([\d.]+)/);
    const lostBlood = bloodM ? Number(bloodM[1].replace(/\./g, "")) : 0;
    const losses = parseLosses(get(/^Gerceklesen kayip birlik:/));
    const isPass = /\[DOGRU\]/.test(b);
    const totalAlly = Object.values(ally).reduce((a,c)=>a+c,0);
    const totalEnemy = Object.values(enemy).reduce((a,c)=>a+c,0);
    if (!totalAlly || !totalEnemy) continue;
    cases.push({ enemy, ally, winner, lostBlood, losses, isPass });
  }
  return cases;
}

function lossesEq(a, b) {
  return T.every(k => Number(a[k]||0) === Number(b[k]||0));
}

const MODES_ARG = process.argv.find(a => a.startsWith("--modes="));
const ROUND_MODES = MODES_ARG ? MODES_ARG.slice(8).split(",") : ["legacy", "extround"];
function reachable(c) {
  for (const roundingMode of ROUND_MODES) {
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const r = simulateBattle(c.enemy, c.ally, { seed, collectLog: false, roundingMode });
      const w = r.winner === "enemy" ? "enemy" : "ally";
      if (w === c.winner &&
          Number(r.lostBloodTotal||0) === c.lostBlood &&
          lossesEq(r.allyLosses||{}, c.losses)) {
        return true;
      }
    }
  }
  return false;
}

// --- topla ---
let cases = [];
for (const f of fs.readdirSync(TESTDIR)) {
  if (!f.endsWith(".txt")) continue;
  cases = cases.concat(parseFile(path.join(TESTDIR, f)));
}
const passCases = cases.filter(c => c.isPass);
const failCases = cases.filter(c => !c.isPass);

let passReach = 0, failReach = 0;
const passBroken = [];
const failFixed = [];
for (const c of passCases) { if (reachable(c)) passReach++; else passBroken.push(c); }
for (const c of failCases) { if (reachable(c)) { failReach++; failFixed.push(c); } }

console.log(`MODE: ${PATCH ? "PATCHED (Gargoyle=brute)" : "BASELINE (Gargoyle=monster)"}  seeds=${SEED_COUNT}`);
console.log(`PASS cases: ${passCases.length} | ulasilabilir: ${passReach} | ULASILAMAYAN(=bozulan): ${passCases.length - passReach}`);
console.log(`FAIL cases: ${failCases.length} | ulasilabilir(=duzelen): ${failReach}`);
if (failFixed.length) {
  console.log("--- DUZELEN FAIL ornekleri ---");
  failFixed.slice(0,12).forEach(c => console.log("  ally", JSON.stringify(c.ally), "loss", JSON.stringify(c.losses)));
}
if (passBroken.length) {
  console.log("--- ULASILAMAYAN PASS: beklenen vs simulator ornek ---");
  passBroken.slice(0,4).forEach(c => {
    console.log("  enemy", JSON.stringify(c.enemy));
    console.log("  ally ", JSON.stringify(c.ally));
    console.log("  BEKLENEN: winner", c.winner, "blood", c.lostBlood, "loss", JSON.stringify(c.losses));
    for (const rm of ["legacy","extround"]) {
      const seen = new Set();
      for (let s=1;s<=8;s++){
        const r = simulateBattle(c.enemy, c.ally, {seed:s, collectLog:false, roundingMode:rm});
        seen.add(`${r.winner}|${r.lostBloodTotal}|${T.map(k=>r.allyLosses?.[k]||0).join(",")}`);
      }
      console.log(`  SIM ${rm}:`, [...seen].slice(0,4).join("  ;  "));
    }
    console.log("");
  });
}
