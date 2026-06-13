"use strict";
// 2026-06-12 deneyi: uzanti motorundan cikarilan 5 aday mekanik bayragi,
// tum pass arsivi (test-sonuclari-1-40 klasoru, kat41-101 dahil) + fail-25 dosyasina karsi.
// Es kriteri canli retest ile ayni: legacy -> extround fallback, kazanan+kan+birim kaybi parmak izi.
const fs = require("fs");
const path = require("path");

require("./battle-core-exp.js");
const { simulateBattle } = globalThis.BattleCore;

const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];

function hashText(text) {
  let hash = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function buildSeeds(caseObj, count) {
  let state = hashText(JSON.stringify(caseObj.enemy) + "|" + JSON.stringify(caseObj.ally)) || 1;
  const seeds = [], seen = new Set();
  while (seeds.length < count) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const seed = state || (seeds.length + 1);
    if (seen.has(seed)) continue;
    seen.add(seed);
    seeds.push(seed);
  }
  return seeds;
}

function parseUnits(line, prefix, n) {
  const arr = new Array(n).fill(0);
  const re = new RegExp(prefix + "(\\d+):(\\d+)", "g");
  let m;
  while ((m = re.exec(line)) !== null) arr[parseInt(m[1]) - 1] = parseInt(m[2]);
  return arr;
}
function parseLossUnits(line) {
  const arr = new Array(8).fill(0);
  const re = /\(T(\d)\) x(\d+)/g;
  let m;
  while ((m = re.exec(line)) !== null) arr[parseInt(m[1]) - 1] = parseInt(m[2]);
  return arr;
}
function toCounts(arr, keys) {
  return Object.fromEntries(keys.map((k, i) => [k, arr[i] || 0]));
}
function parseFile(file, tag) {
  const txt = fs.readFileSync(file, "utf8");
  return txt.split(/\r?\n(?=#\d+ )/).filter(b => b.trim().startsWith("#")).map(b => {
    const kat = parseInt(b.match(new RegExp(`\\[${tag}\\] (\\d+)\\. Kat`))[1]);
    return {
      kat,
      enemy: toCounts(parseUnits(b.match(/Rakip : \[([^\]]+)\]/)[1], "R", 10), ENEMY_KEYS),
      ally: toCounts(parseUnits(b.match(/Biz : \[([^\]]+)\]/)[1], "T", 8), ALLY_KEYS),
      expWinner: /Gerceklesen sonuc: Galibiyet/.test(b) ? "ally" : "enemy",
      expBlood: parseInt(b.match(/Gerceklesen kayip: ([\d.]+) ;/)[1].replace(/\./g, "")),
      expLosses: toCounts(parseLossUnits(b.match(/Gerceklesen kayip birlik: (.*)/)[1]), ALLY_KEYS)
    };
  });
}

const passDir = "C:\\Users\\YAVUZ\\Documents\\BT-Analyss - v6 - Kopya\\test-sonuclari-1-40";
const passCases = fs.readdirSync(passDir).filter(f => f.endsWith(".txt"))
  .flatMap(f => parseFile(path.join(passDir, f), "DOGRU"));
const failCases = parseFile("C:\\Users\\YAVUZ\\Downloads\\test-sonuclari-fail-tumkat-tumu25-20260612-1837.txt", "YANLIS");

function fingerprintMatch(c, result) {
  if (result.winner !== c.expWinner) return false;
  if (Number(result.lostBloodTotal || 0) !== c.expBlood) return false;
  return ALLY_KEYS.every(k => Number(result.allyLosses?.[k] || 0) === Number(c.expLosses[k] || 0));
}

// Canli davranis: once legacy tum seedler, sonra extround tum seedler.
function testCase(c, seedCount, extFlags) {
  const seeds = buildSeeds(c, seedCount);
  for (const roundingMode of ["legacy", "extround"]) {
    for (const seed of seeds) {
      const result = simulateBattle(c.enemy, c.ally, { seed, collectLog: false, roundingMode, extFlags });
      if (fingerprintMatch(c, result)) return roundingMode;
    }
  }
  return null;
}

const CONFIGS = {
  "base (canli motor)": {},
  "orderTie": { orderTie: true },
  "spiderNeutral": { spiderNeutral: true },
  "lichMeleeOnly": { lichMeleeOnly: true },
  "necroSingleRevive": { necroSingleRevive: true },
  "bonewingFirstAlive": { bonewingFirstAlive: true },
  "hepsi": { orderTie: true, spiderNeutral: true, lichMeleeOnly: true, necroSingleRevive: true, bonewingFirstAlive: true }
};

const only = process.argv[2];
for (const [name, extFlags] of Object.entries(CONFIGS)) {
  if (only && name !== only) continue;
  const t0 = Date.now();
  let passKept = 0;
  const brokenByLayer = new Map();
  for (const c of passCases) {
    if (testCase(c, 64, extFlags)) passKept++;
    else brokenByLayer.set(c.kat, (brokenByLayer.get(c.kat) || 0) + 1);
  }
  let failFixed = 0;
  const fixedList = [];
  failCases.forEach((c, i) => {
    const mode = testCase(c, 1024, extFlags);
    if (mode) { failFixed++; fixedList.push(`#${i + 1}(K${c.kat},${mode})`); }
  });
  console.log(`\n=== ${name} === (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  console.log(`Dogrular korunan: ${passKept}/${passCases.length} (bozulan: ${passCases.length - passKept})`);
  if (brokenByLayer.size) {
    console.log("Bozulan katlar: " + [...brokenByLayer.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `K${k}:${n}`).join(" "));
  }
  console.log(`Yanlislardan duzelen: ${failFixed}/${failCases.length}${fixedList.length ? "  -> " + fixedList.join(", ") : ""}`);
}
