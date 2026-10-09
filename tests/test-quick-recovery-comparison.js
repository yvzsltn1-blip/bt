"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
require(path.join(root, "battle-core.js"));
const core = globalThis.BattleCore;
const source = fs.readFileSync(path.join(root, "optimizer.js"), "utf8");
const context = { ...core };
vm.createContext(context);
for (const name of ["getRepresentativeBattle", "getQuickRecoveryComparison"]) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\nfunction ", start + 1);
  vm.runInContext(source.slice(start, end), context);
}

for (const [deaths, revived, permanent] of [[1, 1, 0], [4, 1, 3], [5, 1, 4], [6, 2, 4], [14, 3, 11]]) {
  const result = context.getQuickRecoveryComparison(null, { sampleBattle: { allyLosses: { rotmaws: deaths } } });
  assert.equal(result.revivedUnits, revived);
  assert.equal(result.lostBlood, deaths * 150);
  assert.equal(result.recoveryMinutes, deaths * 180);
  assert.equal(result.stoneLostBlood, permanent * 150);
  assert.equal(result.stoneRecoveryMinutes, permanent * 180);
}

// Screenshot casualties: T3 controls recovery before and after stones.
const screenshotLosses = { bats: 10, ghouls: 11, thralls: 8, banshees: 1, necromancers: 1, gargoyles: 2 };
const screenshot = context.getQuickRecoveryComparison(null, { sampleBattle: { allyLosses: screenshotLosses } });
assert.equal(screenshot.lostBlood, 660);
assert.equal(screenshot.recoveryMinutes, 80);
assert.equal(screenshot.stoneLostBlood, 395);
assert.equal(screenshot.stoneRecoveryMinutes, 60);

// Recovery must switch bottlenecks, rather than subtract a single tier's time.
const switchTier = context.getQuickRecoveryComparison(null, { sampleBattle: { allyLosses: { rotmaws: 1, witches: 4 } } });
assert.equal(switchTier.recoveryMinutes, 180);
assert.equal(switchTier.stoneRecoveryMinutes, 135);
const empty = context.getQuickRecoveryComparison();
assert.equal(empty.lostBlood, 0);
assert.equal(empty.recoveryMinutes, 0);
assert.equal(empty.stoneRecoveryMinutes, 0);

// A selected stone objective must still show the raw losses in the comparison.
const fallback = context.getQuickRecoveryComparison({ stoneMode: true,
  expectedAllyLosses: { rotmaws: 1 }, expectedStoneAdjustedAllyLosses: { rotmaws: 0 } });
assert.equal(fallback.lostBlood, 150);
assert.equal(fallback.stoneLostBlood, 0);
const rounded = context.getQuickRecoveryComparison({ expectedAllyLosses: { ghouls: 5.6 } });
assert.equal(rounded.losses.ghouls, 6);
assert.equal(rounded.stoneLostBlood, 60);
console.log("PASS: popup blood and recovery, stone examples, screenshot and raw-loss fallback");
