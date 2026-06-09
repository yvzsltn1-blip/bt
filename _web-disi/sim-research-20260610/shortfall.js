"use strict";
// Her yanlis vakada T8'in (ve digerlerinin) savas sonunda kac canla kurtuldugunu olcer.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];

function loadBattleCore(corePath) {
  const source = fs.readFileSync(corePath, "utf8");
  const context = { console, window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: path.basename(corePath) });
  return context.window.BattleCore;
}

function parseCountsBlock(text, prefix, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  const re = new RegExp(prefix + "(\\d+):(\\d+)", "g");
  let m;
  while ((m = re.exec(text)) !== null) counts[keys[Number(m[1]) - 1]] = Number(m[2]);
  return counts;
}

const failFile = fs.readdirSync(DATA_DIR).find((f) => f.includes("-fail-"));
const text = fs.readFileSync(path.join(DATA_DIR, failFile), "utf8");
const core = loadBattleCore(path.join(ROOT, "battle-core.js"));

for (const block of text.split(/\r?\n(?=#\d+ )/g)) {
  const head = block.match(/^#(\d+) \[YANLIS\] (\d+)\. Kat/);
  if (!head) continue;
  const enemyCounts = parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS);
  const allyCounts = parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS);
  const realLossLine = (block.match(/Gerceklesen kayip birlik:\s*(.*)/) || [])[1] || "-";

  // remainingNumbers index 17 = rotmaws; also get remaining health via custom: use result fields
  let minRot = Infinity, maxRot = -Infinity, minRounds = Infinity, maxRounds = -Infinity;
  const seeds = (enemyCounts.cultists || 0) === 0 ? 1 : 256;
  let rotHpSamples = new Set();
  for (let seed = 0; seed < seeds; seed += 1) {
    const r = core.simulateBattle(enemyCounts, allyCounts, { seed, collectLog: true, roundingMode: "legacy" });
    // parse final rotmaw HP from logText last battlefield print
    const mHp = [...r.logText.matchAll(/Curuk Girtlak \(T8\) \[Cephe\/G\]\s+(\d+) can/g)];
    const finalHp = mHp.length ? Number(mHp[mHp.length - 1][1]) : null;
    if (finalHp !== null) {
      minRot = Math.min(minRot, finalHp);
      maxRot = Math.max(maxRot, finalHp);
      rotHpSamples.add(finalHp);
    }
    minRounds = Math.min(minRounds, r.roundCount);
    maxRounds = Math.max(maxRounds, r.roundCount);
  }
  console.log(`#${head[1]} kat${head[2]} | T8 kalan can min=${minRot === Infinity ? "-" : minRot} max=${maxRot === -Infinity ? "-" : maxRot} | raund ${minRounds}-${maxRounds} | gercek kayip: ${realLossLine.trim()}`);
}
