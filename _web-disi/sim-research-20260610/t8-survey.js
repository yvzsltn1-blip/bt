"use strict";
// Pass kumesinde: rotmaw iceren savaslarin sonunda T8 kac canla kaliyor?
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];

const source = fs.readFileSync(path.join(ROOT, "battle-core.js"), "utf8");
const context = { console, window: {} };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, { filename: "battle-core.js" });
const core = context.window.BattleCore;

function parseCountsBlock(text, prefix, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  const re = new RegExp(prefix + "(\\d+):(\\d+)", "g");
  let m;
  while ((m = re.exec(text)) !== null) counts[keys[Number(m[1]) - 1]] = Number(m[2]);
  return counts;
}
function parseLosses(text) {
  const losses = Object.fromEntries(ALLY_KEYS.map((k) => [k, 0]));
  if (!text || text.trim() === "-") return losses;
  const re = /\(T(\d)\)\s*x(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) losses[ALLY_KEYS[Number(m[1]) - 1]] = Number(m[2]);
  return losses;
}

const hist = {}; // finalHp -> count (passes, T8 survived per reality)
let totalRot = 0, t8LostReal = 0;
for (const f of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".txt") && !f.includes("-fail-"))) {
  const text = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
  for (const block of text.split(/\r?\n(?=#\d+ )/g)) {
    const head = block.match(/^#(\d+) \[DOGRU\] (\d+)\. Kat/);
    if (!head) continue;
    const enemyCounts = parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS);
    const allyCounts = parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS);
    if (!allyCounts.rotmaws) continue;
    totalRot += 1;
    const realLosses = parseLosses((block.match(/Gerceklesen kayip birlik:\s*(.*)/) || [])[1]);
    if (realLosses.rotmaws > 0) { t8LostReal += 1; continue; }
    // T8 sag kalmis (gercekte). Sim final HP (seed 0 yeterli; kultist sadece hasar dagilimini degistirir)
    const r = core.simulateBattle(enemyCounts, allyCounts, { seed: 0, collectLog: true, roundingMode: "legacy" });
    const mHp = [...r.logText.matchAll(/Curuk Girtlak \(T8\) \[Cephe\/G\]\s+(\d+) can/g)];
    const finalHp = mHp.length ? Number(mHp[mHp.length - 1][1]) : 0;
    hist[finalHp] = (hist[finalHp] || 0) + 1;
  }
}
console.log(`Rotmaw'li pass savas: ${totalRot}, gercekte T8 kaybi olan: ${t8LostReal}`);
console.log("Gercekte T8 SAG kalan pass savaslarinda sim-final T8 HP dagilimi:");
for (const hp of Object.keys(hist).map(Number).sort((a, b) => a - b)) {
  console.log(`  HP ${String(hp).padStart(3)}: ${hist[hp]} savas`);
}
