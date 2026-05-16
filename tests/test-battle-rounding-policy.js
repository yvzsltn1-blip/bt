"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadBattleCore() {
  const source = fs.readFileSync(path.join(__dirname, "..", "battle-core.js"), "utf8");
  const context = {
    console,
    window: {},
    globalThis: {}
  };

  context.window.window = context.window;
  context.globalThis = context.window;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "battle-core.js" });
  return context.window.BattleCore;
}

const battleCore = loadBattleCore();

const enemyCounts = {
  skeletons: 16,
  zombies: 5,
  cultists: 10,
  bonewings: 12,
  corpses: 9,
  wraiths: 13,
  revenants: 15,
  giants: 2,
  broodmothers: 0,
  liches: 0
};

const allyCounts = {
  bats: 21,
  ghouls: 33,
  thralls: 60,
  banshees: 2,
  necromancers: 1,
  gargoyles: 5,
  witches: 0,
  rotmaws: 0
};

const legacyResult = battleCore.simulateBattle(enemyCounts, allyCounts, {
  seed: 3625107134,
  collectLog: true,
  roundingMode: "legacy"
});

const safeResult = battleCore.simulateBattle(enemyCounts, allyCounts, {
  seed: 3625107134,
  collectLog: true,
  roundingMode: "safe"
});

const exactResult = battleCore.simulateBattle(enemyCounts, allyCounts, {
  seed: 3625107134,
  collectLog: true,
  roundingMode: "exact"
});

assert.equal(legacyResult.winner, "ally");
assert.equal(legacyResult.roundingMode, "legacy");

assert.equal(safeResult.winner, "enemy");
assert.equal(safeResult.roundingMode, "safe");
assert(
  safeResult.logText.includes("= 89 hasar"),
  "Safe mode should round ally damage down to 89"
);
assert(
  safeResult.logText.includes("1 birim / 1 can kaldi"),
  "Safe mode should leave the corpse stack at 1 HP"
);

assert.equal(exactResult.winner, "enemy");
assert.equal(exactResult.roundingMode, "exact");
assert(
  exactResult.logText.includes("= 89.25 hasar"),
  "Exact mode should keep the fractional ally damage"
);
assert(
  exactResult.logText.includes("1 birim / 0.75 can kaldi"),
  "Exact mode should preserve fractional remaining HP"
);

console.log("Battle rounding policy checks passed.");
