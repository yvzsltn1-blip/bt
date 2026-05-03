"use strict";

const fs = require("fs");
const path = require("path");

function stripBom(text) { return text.replace(/^\uFEFF/, ""); }

function createZeroCounts(units) {
  return Object.fromEntries(units.map((u) => [u.key, 0]));
}

function parseFirestoreMap(mv) {
  const fields = mv?.fields || {};
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = Number.parseInt(val.integerValue || val.stringValue || "0", 10);
  }
  return result;
}

function main() {
  const raw = JSON.parse(stripBom(fs.readFileSync(path.join(__dirname, "approvedStrategies.firestoredump.json"), "utf8")));

  const brokenIds = ["sim_514f6da0", "sim_57f5df9c", "sim_61cdde6", "sim_a0242c31", "sim_a1908956"];

  console.log("=== BOZULAN APPROVED'LARIN DUSMAN ORDULARI ===\n");

  for (const doc of raw.documents || []) {
    const id = doc.name.split("/").pop();
    if (!brokenIds.includes(id)) continue;

    const f = doc.fields || {};
    const ec = parseFirestoreMap(f.enemyCounts?.mapValue || f.enemyCounts);
    const ac = parseFirestoreMap(f.allyCounts?.mapValue || f.allyCounts);
    const summaryText = f.summaryText?.stringValue || "";

    console.log(`${id}:`);
    console.log(`  Dusman: ${ec.skeletons}-${ec.zombies}-${ec.cultists}-${ec.bonewings}-${ec.corpses}-${ec.wraiths}-${ec.revenants}-${ec.giants}-${ec.broodmothers}-${ec.liches}`);
    console.log(`  Biz: ${ac.bats}-${ac.ghouls}-${ac.thralls}-${ac.banshees}-${ec.necromancers || 0}-${ac.gargoyles}-${ac.witches}-${ac.rotmaws}`);
    console.log(`  Has corpses(T5): ${ec.corpses > 0}, has revenants(T7): ${ec.revenants > 0}, has giants(T8): ${ec.giants > 0}`);
    console.log(`  Has cultists(T3): ${ec.cultists > 0}`);
    console.log();
  }

  // Ayrica korunan approved'larin dusman ordularini da gosterelim
  console.log("=== KORUNAN APPROVED'LARIN DUSMAN ORDULARI ===\n");

  for (const doc of raw.documents || []) {
    const id = doc.name.split("/").pop();
    if (brokenIds.includes(id)) continue;

    const f = doc.fields || {};
    const ec = parseFirestoreMap(f.enemyCounts?.mapValue || f.enemyCounts);
    const ac = parseFirestoreMap(f.allyCounts?.mapValue || f.allyCounts);

    console.log(`${id}:`);
    console.log(`  Dusman: ${ec.skeletons}-${ec.zombies}-${ec.cultists}-${ec.bonewings}-${ec.corpses}-${ec.wraiths}-${ec.revenants}-${ec.giants}-${ec.broodmothers}-${ec.liches}`);
    console.log(`  Biz: ${ac.bats}-${ac.ghouls}-${ac.thralls}-${ac.banshees}-${ec.necromancers || 0}-${ac.gargoyles}-${ac.witches}-${ac.rotmaws}`);
    console.log(`  Has corpses(T5): ${ec.corpses > 0}, has revenants(T7): ${ec.revenants > 0}, has giants(T8): ${ec.giants > 0}`);
    console.log();
  }
}

main();
