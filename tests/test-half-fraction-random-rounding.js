"use strict";

// Regresyon: Tam .5 kesirli muttefik hasari legacy modda seed'li yazi-turayla
// yuvarlanir. Gerekce: ayni 1 Banshee x 7 atk x 0.5 = 3.5 vurusu arsivde bir
// savasta 4 kultist (kat2#5 dogru), digerinde 3 kultist (fail #3, kat8)
// olduruyor; deterministik bir kural ikisini birden saglayamiyor.
// Beklenti 1: fail #3 (8. Kat, 09.06.2026 08:41:39) gercek sonucu
//   (zafer, 150 kan, T8 x1) makul bir seed taramasinda bulunmali.
// Beklenti 2: kat2#5 dogrusu (zafer, 0 kayip) da bulunmaya devam etmeli.

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

function findMatchingSeed(enemyCounts, allyCounts, expected, maxSeeds) {
  for (let seed = 0; seed < maxSeeds; seed += 1) {
    const result = battleCore.simulateBattle(enemyCounts, allyCounts, {
      seed,
      collectLog: false,
      roundingMode: "legacy"
    });
    if (result.winner !== expected.winner) continue;
    if (Number(result.lostBloodTotal || 0) !== expected.lostBloodTotal) continue;
    const losses = JSON.parse(JSON.stringify(result.allyLosses));
    if (Object.keys(expected.allyLosses).every((k) => Number(losses[k] || 0) === expected.allyLosses[k])) {
      return seed;
    }
  }
  return -1;
}

// Fail #3 (8. Kat): gercekte T8 Curuk Girtlak x1 kaybedildi (150 kan).
const failSeed = findMatchingSeed(
  { skeletons: 7, zombies: 34, cultists: 5, bonewings: 0, corpses: 0, wraiths: 0, revenants: 0, giants: 0, broodmothers: 0, liches: 0 },
  { bats: 11, ghouls: 3, thralls: 0, banshees: 1, necromancers: 0, gargoyles: 0, witches: 0, rotmaws: 1 },
  {
    winner: "ally",
    lostBloodTotal: 150,
    allyLosses: { bats: 0, ghouls: 0, thralls: 0, banshees: 0, necromancers: 0, gargoyles: 0, witches: 0, rotmaws: 1 }
  },
  256
);
assert.ok(failSeed >= 0, "fail #3 gercek sonucu (150 kan, T8 x1) 256 seed icinde bulunamadi");

// kat2#5 dogrusu: 0 kayipli zafer korunmali.
const passSeed = findMatchingSeed(
  { skeletons: 2, zombies: 8, cultists: 4, bonewings: 0, corpses: 0, wraiths: 0, revenants: 0, giants: 0, broodmothers: 0, liches: 0 },
  { bats: 7, ghouls: 1, thralls: 0, banshees: 1, necromancers: 0, gargoyles: 0, witches: 0, rotmaws: 0 },
  {
    winner: "ally",
    lostBloodTotal: 0,
    allyLosses: { bats: 0, ghouls: 0, thralls: 0, banshees: 0, necromancers: 0, gargoyles: 0, witches: 0, rotmaws: 0 }
  },
  256
);
assert.ok(passSeed >= 0, "kat2#5 dogrusu (0 kayip) 256 seed icinde bulunamadi");

console.log("Half-fraction random rounding regression passed.");
