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

const result = battleCore.simulateBattle(
  {
    skeletons: 6,
    zombies: 36,
    cultists: 14,
    bonewings: 2,
    corpses: 0,
    wraiths: 0,
    revenants: 0,
    giants: 0,
    broodmothers: 0,
    liches: 0
  },
  {
    bats: 26,
    ghouls: 0,
    thralls: 0,
    banshees: 1,
    necromancers: 0,
    gargoyles: 2,
    witches: 0,
    rotmaws: 1
  },
  {
    seed: 0,
    collectLog: false,
    roundingMode: "legacy"
  }
);

assert.equal(result.winner, "ally");
assert.equal(result.lostBloodTotal, 65);
assert.deepEqual(
  JSON.parse(JSON.stringify(result.allyLosses)),
  {
    bats: 3,
    ghouls: 0,
    thralls: 0,
    banshees: 1,
    necromancers: 0,
    gargoyles: 0,
    witches: 0,
    rotmaws: 0
  }
);

console.log("Rotmaw overkill targeting regression passed.");
