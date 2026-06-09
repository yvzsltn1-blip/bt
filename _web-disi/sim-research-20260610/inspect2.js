"use strict";
// node inspect2.js <dosyaAdiParcasi> <num> <seed> '<flagsJson>' : kayit logunu flags ile basar
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];

const filePart = process.argv[2];
const num = Number(process.argv[3]);
const seed = Number(process.argv[4] || 0);
const flags = JSON.parse(process.argv[5] || "{}");

const file = fs.readdirSync(DATA_DIR).find((f) => f.includes(filePart));
const text = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
const block = text.split(/\r?\n(?=#\d+ )/g).find((b) => b.startsWith(`#${num} `));

function parseCountsBlock(t, prefix, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  const re = new RegExp(prefix + "(\\d+):(\\d+)", "g");
  let m;
  while ((m = re.exec(t)) !== null) counts[keys[Number(m[1]) - 1]] = Number(m[2]);
  return counts;
}
const enemyCounts = parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS);
const allyCounts = parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS);

const source = fs.readFileSync(path.join(__dirname, "battle-core-flags.js"), "utf8");
const context = { console, window: {} };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, { filename: "battle-core-flags.js" });
context.window.__SIM_FLAGS__ = flags;

console.log(block.split("\n").slice(0, 9).join("\n"));
console.log("===== FLAGS:", JSON.stringify(flags), "seed", seed, "=====");
const r = context.window.BattleCore.simulateBattle(enemyCounts, allyCounts, { seed, collectLog: true, roundingMode: "legacy" });
console.log(r.logText);
console.log("WINNER:", r.winner, "| BLOOD:", r.lostBloodTotal, "| LOSSES:", JSON.stringify(r.allyLosses));
