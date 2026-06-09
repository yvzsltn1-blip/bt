"use strict";
// node inspect.js <failNum> [seed] [corePath] : yanlis vakanin tam savas logunu basar
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
const num = Number(process.argv[2] || 1);
const seed = Number(process.argv[3] || 0);
const corePath = process.argv[4] ? path.resolve(process.argv[4]) : path.join(ROOT, "battle-core.js");

const block = text.split(/\r?\n(?=#\d+ )/g).find((b) => b.startsWith(`#${num} `));
const enemyCounts = parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS);
const allyCounts = parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS);

console.log(block.split("\n").slice(0, 9).join("\n"));
console.log("=========================================");
const core = loadBattleCore(corePath);
const result = core.simulateBattle(enemyCounts, allyCounts, { seed, collectLog: true, roundingMode: "legacy" });
console.log(result.logText);
console.log("WINNER:", result.winner, "| BLOOD:", result.lostBloodTotal, "| LOSSES:", JSON.stringify(result.allyLosses));
