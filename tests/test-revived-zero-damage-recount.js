"use strict";

// Regresyon: Kan Cadisi cift raundda 0 hasar vurdugunda dirilen zombi sayimi
// yeniden hesaplanmamali. Onceki hata: 1 canlik dirilenler hasarsiz sekilde
// 7 canlik kovalara dusup (orn. 29 -> 5) Curuk Girtlak'a eksik hasar vuruyordu.
// Vaka: test-sonuclari-fail-kat1-40 #8 (19. Kat / s66, 09.06.2026 10:22:28).

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
    skeletons: 16,
    zombies: 29,
    cultists: 22,
    bonewings: 12,
    corpses: 0,
    wraiths: 0,
    revenants: 0,
    giants: 0,
    broodmothers: 0,
    liches: 0
  },
  {
    bats: 11,
    ghouls: 0,
    thralls: 0,
    banshees: 10,
    necromancers: 1,
    gargoyles: 0,
    witches: 1,
    rotmaws: 1
  },
  {
    seed: 0,
    collectLog: false,
    roundingMode: "legacy"
  }
);

assert.equal(result.winner, "ally");
assert.equal(result.lostBloodTotal, 200);
assert.deepEqual(
  JSON.parse(JSON.stringify(result.allyLosses)),
  {
    bats: 0,
    ghouls: 0,
    thralls: 0,
    banshees: 0,
    necromancers: 1,
    gargoyles: 0,
    witches: 0,
    rotmaws: 1
  }
);

console.log("Revived zero-damage recount regression passed.");
