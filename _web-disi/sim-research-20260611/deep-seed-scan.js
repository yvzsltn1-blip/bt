"use strict";
// Kalan yanlislari cok derin seed taramasiyla dener (yazi-tura sonrasi nadir yollar?).
// Kullanim: node deep-seed-scan.js [maxSeeds]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];

const context = { console, window: {} };
context.window.window = context.window;
vm.createContext(context);
const flagsArg = process.argv[3] ? JSON.parse(process.argv[3]) : null;
const corePath = flagsArg ? path.join(__dirname, "battle-core-flags.js") : path.join(ROOT, "battle-core.js");
vm.runInContext(fs.readFileSync(corePath, "utf8"), context, { filename: path.basename(corePath) });
if (flagsArg) context.window.__SIM_FLAGS__ = { noRecomputeOnZeroDamage: true, ...flagsArg };
const core = context.window.BattleCore;

function parseCountsBlock(text, prefix, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  const re = new RegExp(prefix + "(\\d+):(\\d+)", "g");
  let m;
  while ((m = re.exec(text)) !== null) counts[keys[Number(m[1]) - 1]] = Number(m[2]);
  return counts;
}
function parseNumber(t) { return Number(String(t).replace(/\./g, "").trim()); }
function parseLosses(text) {
  const losses = Object.fromEntries(ALLY_KEYS.map((k) => [k, 0]));
  if (!text || text.trim() === "-") return losses;
  const re = /\(T(\d)\)\s*x(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) losses[ALLY_KEYS[Number(m[1]) - 1]] = Number(m[2]);
  return losses;
}
const failFile = fs.readdirSync(DATA_DIR).find((f) => f.includes("-fail-"));
const text = fs.readFileSync(path.join(DATA_DIR, failFile), "utf8");
const recs = [];
for (const block of text.split(/\r?\n(?=#\d+ )/g)) {
  const head = block.match(/^#(\d+) \[(DOGRU|YANLIS)\] (\d+)\. Kat/);
  if (!head) continue;
  recs.push({
    num: Number(head[1]), stage: Number(head[3]),
    enemyCounts: parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS),
    allyCounts: parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS),
    expectedWinner: block.match(/Gerceklesen sonuc:\s*(\S+)/)[1].startsWith("Galibiyet") ? "ally" : "enemy",
    expectedBlood: parseNumber(block.match(/Gerceklesen kayip:\s*([\d.]+)/)[1]),
    expectedLosses: parseLosses((block.match(/Gerceklesen kayip birlik:\s*(.*)/) || [])[1])
  });
}
function matches(rec, result) {
  if (result.winner !== rec.expectedWinner) return false;
  if (Number(result.lostBloodTotal || 0) !== rec.expectedBlood) return false;
  return ALLY_KEYS.every((k) => Number(result.allyLosses[k] || 0) === rec.expectedLosses[k]);
}
function distance(rec, result) {
  let d = 0;
  if (result.winner !== rec.expectedWinner) d += 1000;
  d += Math.abs(Number(result.lostBloodTotal || 0) - rec.expectedBlood);
  for (const k of ALLY_KEYS) d += 10 * Math.abs(Number(result.allyLosses[k] || 0) - rec.expectedLosses[k]);
  return d;
}
const maxSeeds = Number(process.argv[2] || 65536);
const only = new Set([1, 2, 4, 7, 8, 11]);
for (const rec of recs) {
  if (!only.has(rec.num)) continue;
  let best = null, bestD = Infinity, matchedSeed = -1, distinct = new Map();
  for (let seed = 0; seed < maxSeeds; seed += 1) {
    const result = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed, collectLog: false, roundingMode: "legacy" });
    const key = `${result.winner}|${result.lostBloodTotal}|${ALLY_KEYS.map((k) => result.allyLosses[k] || 0).join(",")}`;
    distinct.set(key, (distinct.get(key) || 0) + 1);
    const d = distance(rec, result);
    if (d < bestD) { bestD = d; best = key; }
    if (matches(rec, result)) { matchedSeed = seed; break; }
  }
  if (matchedSeed >= 0) {
    console.log(`#${rec.num} (kat${rec.stage}): ESLESTI seed ${matchedSeed}`);
  } else {
    const expKey = `${rec.expectedWinner}|${rec.expectedBlood}|${ALLY_KEYS.map((k) => rec.expectedLosses[k]).join(",")}`;
    console.log(`#${rec.num} (kat${rec.stage}): eslesme yok (${maxSeeds} seed, ${distinct.size} farkli sonuc)`);
    console.log(`   beklenen: ${expKey}`);
    console.log(`   en yakin: ${best} (mesafe ${bestD})`);
    const top = [...distinct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [k, c] of top) console.log(`   sik sonuc: ${k}  x${c}`);
  }
}
