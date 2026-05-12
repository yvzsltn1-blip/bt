"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadBattleCore(fileName) {
  const source = fs.readFileSync(path.join(__dirname, "..", fileName), "utf8");
  const context = {
    console,
    window: {},
    globalThis: {}
  };

  context.window.window = context.window;
  context.globalThis = context.window;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: fileName });
  return context.window.BattleCore;
}

function assertUnitSummaryInLog(fileName) {
  const battleCore = loadBattleCore(fileName);
  const battleLogEnemyCounts = Object.fromEntries(battleCore.ENEMY_UNITS.map((unit) => [unit.key, 0]));
  const battleLogAllyCounts = Object.fromEntries(battleCore.ALLY_UNITS.map((unit) => [unit.key, 0]));
  battleLogEnemyCounts.cultists = 1;
  battleLogAllyCounts.thralls = 1;

  const battleLogResult = battleCore.simulateBattle(
    battleLogEnemyCounts,
    battleLogAllyCounts,
    { seed: 1, collectLog: true }
  );

  assert(
    battleLogResult.logText.includes("Namevt Kultist (R3) [Artci/O]"),
    `${fileName} should include rear position and occult type initial for enemy units`
  );
  assert(
    battleLogResult.logText.includes("Vampir Kole (T3) [Cephe/O]"),
    `${fileName} should include front position and occult type initial for ally units`
  );

  const lossEnemyCounts = Object.fromEntries(battleCore.ENEMY_UNITS.map((unit) => [unit.key, 0]));
  const lossAllyCounts = Object.fromEntries(battleCore.ALLY_UNITS.map((unit) => [unit.key, 0]));
  lossEnemyCounts.giants = 1;
  lossAllyCounts.thralls = 1;

  const lossResult = battleCore.simulateBattle(
    lossEnemyCounts,
    lossAllyCounts,
    { seed: 1, collectLog: true }
  );

  const lossSection = lossResult.logText.split("Kayip Birlikler")[1] || "";
  assert(
    lossSection.includes("Vampir Kole (T3)"),
    `${fileName} should include plain ally unit names in the loss summary`
  );
  assert(
    !lossSection.includes("Vampir Kole (T3) [Cephe/O]"),
    `${fileName} should not include position/type details in the loss summary`
  );
  assert(
    lossSection.includes("Vampir Kole (T3) (20 kan)"),
    `${fileName} should keep blood info on the same loss summary line`
  );
}

assertUnitSummaryInLog("battle-core.js");
assertUnitSummaryInLog("battle-core-v2.js");

console.log("Battle log unit summary checks passed.");
