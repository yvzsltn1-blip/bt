"use strict";
// Fail #2: simulat motorunun tam logu + hr+necroEscalates eslesen seedin logu.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const context = { console, window: {} };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "battle-core-flags.js"), "utf8"), context, { filename: "battle-core-flags.js" });
let simulatSrc = fs.readFileSync(path.join(ROOT, "simulat.js"), "utf8");
// Hamle logunu disari alabilmek icin gecici yama: w() log toplasin, ozet yerine ham log donsun.
simulatSrc = simulatSrc.replace(/const baseResult = w\(allyNumbers, enemyNumbers, false, 0, \{\s*collectLog: false\s*\}\);/, "const baseResult = w(allyNumbers, enemyNumbers, false, 0, { collectLog: true });");
simulatSrc = simulatSrc.replace("result.logText = pe(result)", "result.logText = String(baseResult.log || \"\")");
vm.runInContext(simulatSrc, context, { filename: "simulat.js" });
const core = context.window.BattleCore;
const simulat = context.window.SimulatEngine;

const enemyCounts = { skeletons: 4, zombies: 34, cultists: 6, bonewings: 0, corpses: 0, wraiths: 0, revenants: 0, giants: 0, broodmothers: 0, liches: 0 };
const allyCounts = { bats: 0, ghouls: 0, thralls: 0, banshees: 4, necromancers: 1, gargoyles: 0, witches: 0, rotmaws: 1 };

console.log("==================== SIMULAT ====================");
const simRes = simulat.simulateBattle(enemyCounts, allyCounts, { collectLog: true });
const txt = String(simRes.logText || simRes.log || "").replace(/<[^>]+>/g, "");
console.log(txt.split("\n").filter((l) => l.trim()).join("\n"));
console.log("SONUC:", simRes.winner, simRes.lostBloodTotal, JSON.stringify(simRes.allyLosses));

console.log("==================== LEGACY hr+necroEscalates ====================");
context.window.__SIM_FLAGS__ = { noRecomputeOnZeroDamage: true, allyHalfRandomKeepSpecials: true, necroBuffEscalatesPerRound: true };
for (let seed = 0; seed < 1024; seed += 1) {
  const r = core.simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false, roundingMode: "legacy" });
  if (r.winner === "ally" && Number(r.lostBloodTotal) === 200 && r.allyLosses.necromancers === 1 && r.allyLosses.rotmaws === 1) {
    console.log("eslesen seed:", seed);
    const rl = core.simulateBattle(enemyCounts, allyCounts, { seed, collectLog: true, roundingMode: "legacy" });
    console.log(rl.logText);
    break;
  }
}
