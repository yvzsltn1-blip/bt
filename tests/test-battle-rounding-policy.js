"use strict";

// Tek savas modeli regresyonu: 2026-09 oyun savas raporlariyla (s62) eylem eylem
// dogrulanmis savaslar. Her vaka gercek oyunda oynandi; beklenen degerler rapordan.
//  - roundingMode artik yok sayilir; her cagri ayni modeli kullanir.
//  - dirilen zombiler 1 can = 1 birim sayilir (rapor 2123, 2124).
//  - orumcek yavrulari tipsizdir: tip avantaji/dezavantaji almaz (rapor 2127).

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
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];
const toCounts = (keys, values) => Object.fromEntries(keys.map((key, index) => [key, values[index] || 0]));

function assertReportCase({ label, enemy, ally, blood, losses, seeds = 16 }) {
  const enemyCounts = toCounts(ENEMY_KEYS, enemy);
  const allyCounts = toCounts(ALLY_KEYS, ally);
  for (let seed = 0; seed < seeds; seed += 1) {
    const result = battleCore.simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    assert.equal(result.winner, "ally", `${label}: seed ${seed} zafer olmali`);
    assert.equal(result.lostBloodTotal, blood, `${label}: seed ${seed} kan kaybi ${blood} olmali`);
    assert.deepEqual(
      JSON.parse(JSON.stringify(result.allyLosses)),
      toCounts(ALLY_KEYS, losses),
      `${label}: seed ${seed} birim kayiplari rapordaki gibi olmali`
    );
  }
}

// Model secimi yok: eski mod adlari ayni sonucu verir ve sonuc tek modeli bildirir.
const kat15Enemy = toCounts(ENEMY_KEYS, [12, 43, 14, 4]);
const kat15Ally = toCounts(ALLY_KEYS, [24, 0, 2, 4, 0, 0, 0, 1]);
const modelResults = ["legacy", "safe", "exact", "simulat", undefined].map((roundingMode) =>
  battleCore.simulateBattle(kat15Enemy, kat15Ally, { seed: 7, collectLog: false, roundingMode })
);
modelResults.forEach((result) => {
  assert.equal(result.roundingMode, "extround");
  assert.equal(result.lostBloodTotal, modelResults[0].lostBloodTotal);
});

// Rapor 2122 (Kat 21): 60 kan (T1 x1, T5 x1).
assertReportCase({
  label: "Kat 21 / rapor 2122",
  enemy: [16, 38, 19, 13, 1],
  ally: [22, 1, 1, 16, 1, 1, 0, 1],
  blood: 60,
  losses: [1, 0, 0, 0, 1, 0, 0, 0]
});

// Rapor 2123 (Kat 15): dirilen 43 zombi, 8 hasar yiyince 35 birimle vurur ve T8'i oldurur.
assertReportCase({
  label: "Kat 15 / rapor 2123",
  enemy: [12, 43, 14, 4],
  ally: [24, 0, 2, 4, 0, 0, 0, 1],
  blood: 470,
  losses: [18, 0, 0, 4, 0, 0, 0, 1]
});

// Rapor 2124 (Kat 19): eski arsivde 50 kan idi; guncel oyunda T8 de olur.
assertReportCase({
  label: "Kat 19 / rapor 2124",
  enemy: [18, 38, 22, 8],
  ally: [13, 1, 0, 9, 1, 0, 1, 1],
  blood: 200,
  losses: [0, 0, 0, 0, 1, 0, 0, 1]
});

// Rapor 2127 (Kat 91): 10 dusman tipi; orumcek yavrularina tip carpani uygulanmaz.
const kat91 = battleCore.simulateBattle(
  toCounts(ENEMY_KEYS, [9, 14, 9, 26, 21, 5, 5, 9, 4, 7]),
  toCounts(ALLY_KEYS, [50, 55, 64, 3, 1, 6, 1, 1]),
  { seed: 0, collectLog: true }
);
assert.equal(kat91.winner, "ally");
assert.equal(kat91.lostBloodTotal, 1720);
assert(
  /Vampir Kolu \(T3\) → Örümcekler\n\s+Hesap: 64 birim × 6 atk = 384 hasar/.test(kat91.logText),
  "Gece avcisi orumcek yavrularina carpansiz 384 hasar vurmali"
);

// Rapor 2085 (Kat 6): Kurt saman "Ruh hasadi" sahadaki kita basina +%10 (7 kita = %70).
// 1 Kurt saman x 9 atk x 0.5 (zombiye) x 1.7 = 7.65 -> 8 hasar.
const kat6 = battleCore.simulateBattle(
  toCounts(ENEMY_KEYS, [4, 24, 6]),
  toCounts(ALLY_KEYS, [0, 2, 0, 1, 1, 0, 0, 1]),
  { seed: 0, collectLog: true }
);
assert(
  /Ölü Çağırıcı \(T5\), sahadaki 7 kita icin \+%70 hasarla saldiriyor[\s\S]*?Hesap: 1 birim × 9 atk × 0\.85 carpan = 8 hasar/.test(kat6.logText),
  "Kurt saman ilk saldirisinda 7 kita icin %70 alip 8 hasar vurmali"
);

// Rapor 2103 (Kat 9): Fantom dehseti Kultistlere vurur, Kultistler hayatta kalir ->
// rastgele dusman birimi +%10 kazanir. Gercek sonuc: zafer, 150 kan (Cehennem Ucurumu).
const kat9Enemy = toCounts(ENEMY_KEYS, [8, 34, 8]);
const kat9Ally = toCounts(ALLY_KEYS, [10, 1, 0, 1, 0, 1, 0, 1]);
const kat9Log = battleCore.simulateBattle(kat9Enemy, kat9Ally, { seed: 0, collectLog: true }).logText;
assert(
  /Kültist \(R3\) vurulup hayatta kaldi; .+ birimi \+%10 hasar kazandi/.test(kat9Log),
  "Kultistler vurulup hayatta kalinca buff tetiklenmeli"
);
let kat9Matched = false;
for (let seed = 0; seed < 64 && !kat9Matched; seed += 1) {
  const result = battleCore.simulateBattle(kat9Enemy, kat9Ally, { seed, collectLog: false });
  kat9Matched = result.winner === "ally" && result.lostBloodTotal === 150 && result.allyLosses.rotmaws === 1;
}
assert(kat9Matched, "Rapor 2103 sonucu (zafer, 150 kan, T8 x1) 64 seed icinde bulunmali");

// Kemik kanat / Mezar dehseti esitligi: hizli birim yokken sag kita sayisi tekse Kemik kanat once.
function firstOfPairPerRound(logText) {
  return logText.split(/═+\s+RAUND \d+\s+═+/).slice(2).map((body) => {
    const attackers = [...body.matchAll(/^  (.+?) → /gm)].map((m) => m[1]);
    const bonewings = attackers.indexOf("Kemik Kanat (R4)");
    const wraiths = attackers.indexOf("Mezar Dehşeti (R6)");
    if (bonewings < 0 && wraiths < 0) return "-";
    if (wraiths < 0 || (bonewings >= 0 && bonewings < wraiths)) return "R4";
    return "R6";
  });
}

// Rapor 2133 (Kat 34): 6 rakip + 3 bizim = 9 kita -> 1. turu Kemik kanat "Pike ucusu" ile acar.
const kat34 = battleCore.simulateBattle(
  toCounts(ENEMY_KEYS, [18, 34, 17, 13, 18, 4]),
  toCounts(ALLY_KEYS, [0, 1, 1, 0, 1, 0, 0, 0]),
  { seed: 0, collectLog: true }
);
assert.equal(firstOfPairPerRound(kat34.logText)[0], "R4", "Kat 34 / rapor 2133: 1. turu Kemik kanat acmali");
assert.equal(kat34.lostBloodTotal, 85);

// Rapor 2132 (Kat 37): T1 8 kita -> R6, T2 7 kita -> R4, T3 6 kita -> R6.
const kat37 = battleCore.simulateBattle(
  toCounts(ENEMY_KEYS, [26, 28, 21, 17, 15, 6]),
  toCounts(ALLY_KEYS, [0, 96, 0, 0, 0, 0, 0, 3]),
  { seed: 0, collectLog: true }
);
assert.deepEqual(firstOfPairPerRound(kat37.logText).slice(0, 3), ["R6", "R4", "R6"], "Kat 37 / rapor 2132 tur sirasi");
assert.equal(kat37.lostBloodTotal, 1890);

// Rapor 2177 (Kat 4): Kultist buff'i zombilere gider ve dirilen zombilere de gecer.
// 3. turda dirilen 13 zombi: 13 x 2 x 0.5 x 0.75 x 1.1 = 10.725 -> 11 hasar. Gercek: zafer, 0 kan.
const kat4Enemy = toCounts(ENEMY_KEYS, [3, 13, 7]);
const kat4Ally = toCounts(ALLY_KEYS, [1, 0, 0, 1, 0, 0, 0, 1]);
let kat4Matched = false;
for (let seed = 0; seed < 64 && !kat4Matched; seed += 1) {
  const result = battleCore.simulateBattle(kat4Enemy, kat4Ally, { seed, collectLog: true });
  kat4Matched = result.winner === "ally"
    && result.lostBloodTotal === 0
    && /Diriltilmiş Zombiler → Çürük Gırtlak \(T8\)\n\s+Hesap: 13 birim × 2 atk × 0\.41 carpan = 11 hasar/.test(result.logText);
}
assert(kat4Matched, "Rapor 2177: buff'li dirilen 13 zombi 11 hasar vurmali (64 seed icinde)");

// Kan cadisi yayilmasi (2026-09-27 raporlari). Kultist var -> seed aranir.
function findSeed(enemy, ally, predicate) {
  for (let seed = 0; seed < 64; seed += 1) {
    const result = battleCore.simulateBattle(toCounts(ENEMY_KEYS, enemy), toCounts(ALLY_KEYS, ally), { seed, collectLog: true });
    if (predicate(result)) return true;
  }
  return false;
}
// Rapor 46279 (Kat 42): Hortlak sahada -> yayilmaya Dehset felci -%15: 1 x 14 x 0.25 x 0.85 = 2.975 -> 3. Zafer, 325 kan.
assert(
  findSeed([16, 26, 25, 17, 15, 10, 1], [33, 9, 1, 16, 1, 10, 1, 1], (r) => r.winner === "ally" && r.lostBloodTotal === 325
    && /Kan Cadısı \(T7\), Mezar Dehşeti \(R6\) uzerine 3 yayilma hasari verdi/.test(r.logText)),
  "Rapor 46279: Hortlak varken cadi yayilmasi 3 olmali"
);
// Rapor 46513 (Kat 86): yayilma once Ceset'e (R10), sonra Mezar dehseti, Kemik kanat. Zafer, 1650 kan.
assert(
  findSeed([8, 13, 18, 10, 10, 13, 11, 5, 4, 7], [30, 50, 20, 11, 13, 1, 16, 1], (r) => {
    const splash = (r.logText.match(/Kan Cadısı \(T7\), (.+?) uzerine \d+ yayilma/g) || []).slice(0, 3).map((x) => x.match(/\(T7\), (.+?) uzerine/)[1]);
    return r.winner === "ally" && r.lostBloodTotal === 1650 && splash.join("|") === "Ceset (R10)|Mezar Dehşeti (R6)|Kemik Kanat (R4)";
  }),
  "Rapor 46513: cadi yayilma sirasi R10 → R6 → R4 olmali"
);

console.log("Battle model (report-verified) checks passed.");
