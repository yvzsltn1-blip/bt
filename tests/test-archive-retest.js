"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = {
  console,
  window: {}
};
context.window.window = context.window;
context.globalThis = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "battle-core.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "archive-retest.js"), "utf8"), context);

const retest = context.window.ArchiveRegressionRetest;

const fixedFailure = {
  id: "arctest_fixed",
  archiveId: "archive-case-4",
  archiveSavedAt: "2026-06-09T12:04:30.000Z",
  stage: 12,
  result: "fail",
  enemyCounts: {
    skeletons: 6, zombies: 36, cultists: 14, bonewings: 2, corpses: 0,
    wraiths: 0, revenants: 0, giants: 0, broodmothers: 0, liches: 0
  },
  allyCounts: {
    bats: 26, ghouls: 0, thralls: 0, banshees: 1,
    necromancers: 0, gargoyles: 2, witches: 0, rotmaws: 1
  },
  expectedWinner: "ally",
  expectedLostBlood: 65,
  expectedAllyLosses: {
    bats: 3, ghouls: 0, thralls: 0, banshees: 1,
    necromancers: 0, gargoyles: 0, witches: 0, rotmaws: 0
  }
};

const fixedAudit = retest.retestItem(fixedFailure);
assert.equal(fixedAudit.previousResult, "fail");
assert.equal(fixedAudit.result, "pass");
assert.equal(fixedAudit.actualLostBlood, 65);

const remainingFailure = {
  ...fixedFailure,
  id: "arctest_remaining",
  archiveId: "archive-case-1",
  stage: 7,
  enemyCounts: {
    skeletons: 4, zombies: 26, cultists: 8, bonewings: 0, corpses: 0,
    wraiths: 0, revenants: 0, giants: 0, broodmothers: 0, liches: 0
  },
  allyCounts: {
    bats: 0, ghouls: 2, thralls: 0, banshees: 2,
    necromancers: 1, gargoyles: 0, witches: 0, rotmaws: 1
  },
  expectedLostBlood: 165,
  expectedAllyLosses: {
    bats: 0, ghouls: 1, thralls: 0, banshees: 0,
    necromancers: 0, gargoyles: 0, witches: 0, rotmaws: 1
  }
};

const remainingAudit = retest.retestItem(remainingFailure);
assert.equal(remainingAudit.result, "fail");

const summary = retest.summarize([fixedAudit, remainingAudit]);
assert.equal(summary.failToPass, 1);
assert.equal(summary.unchangedFail, 1);

console.log("Archive regression retest checks passed.");
