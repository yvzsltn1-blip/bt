"use strict";

// Deney duzenegi: test-sonuclari-1-40 arsivini battle-core (veya yamali kopyasi)
// ile yeniden oynatir, pass/fail skorunu verir.
// Kullanim: node harness.js [battle-core-path] [--verbose] [--only=fail]

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");

const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];

function loadBattleCore(corePath) {
  const source = fs.readFileSync(corePath, "utf8");
  const context = { console, window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: path.basename(corePath) });
  return context.window.BattleCore;
}

function parseNumber(text) {
  return Number(String(text).replace(/\./g, "").trim());
}

function parseCountsBlock(text, prefix, keys) {
  // text like: [R1:4-R2:26-R3:8]
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  const re = new RegExp(prefix + "(\\d+):(\\d+)", "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const idx = Number(m[1]) - 1;
    if (idx >= 0 && idx < keys.length) {
      counts[keys[idx]] = Number(m[2]);
    }
  }
  return counts;
}

function parseLosses(text) {
  const losses = Object.fromEntries(ALLY_KEYS.map((k) => [k, 0]));
  if (!text || text.trim() === "-") return losses;
  const re = /\(T(\d)\)\s*x(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    losses[ALLY_KEYS[Number(m[1]) - 1]] = Number(m[2]);
  }
  return losses;
}

function parseFile(filePath, kind) {
  const text = fs.readFileSync(filePath, "utf8");
  const records = [];
  const blocks = text.split(/\r?\n(?=#\d+ )/g);
  for (const block of blocks) {
    const head = block.match(/^#(\d+) \[(DOGRU|YANLIS)\] (\d+)\. Kat/);
    if (!head) continue;
    const enemyLine = block.match(/Rakip\s*:\s*\[([^\]]+)\]/);
    const allyLine = block.match(/Biz\s*:\s*\[([^\]]+)\]/);
    const realResult = block.match(/Gerceklesen sonuc:\s*(\S+)/);
    const realBlood = block.match(/Gerceklesen kayip:\s*([\d.]+)/);
    const realLosses = block.match(/Gerceklesen kayip birlik:\s*(.*)/);
    records.push({
      file: path.basename(filePath),
      kind,
      num: Number(head[1]),
      stage: Number(head[3]),
      enemyCounts: parseCountsBlock(enemyLine[1], "R", ENEMY_KEYS),
      allyCounts: parseCountsBlock(allyLine[1], "T", ALLY_KEYS),
      expectedWinner: realResult[1].startsWith("Galibiyet") ? "ally" : "enemy",
      expectedBlood: parseNumber(realBlood[1]),
      expectedLosses: parseLosses(realLosses ? realLosses[1] : "-")
    });
  }
  return records;
}

function loadRecords() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".txt"));
  const records = [];
  for (const f of files) {
    const kind = f.includes("-fail-") ? "fail" : "pass";
    records.push(...parseFile(path.join(DATA_DIR, f), kind));
  }
  return records;
}

function matches(rec, result) {
  if (result.winner !== rec.expectedWinner) return false;
  if (Number(result.lostBloodTotal || 0) !== rec.expectedBlood) return false;
  for (const k of ALLY_KEYS) {
    if (Number(result.allyLosses[k] || 0) !== rec.expectedLosses[k]) return false;
  }
  return true;
}

function testRecord(battleCore, rec, maxSeeds) {
  const deterministic = (rec.enemyCounts.cultists || 0) === 0;
  const seedCount = deterministic ? 1 : maxSeeds;
  for (let seed = 0; seed < seedCount; seed += 1) {
    const result = battleCore.simulateBattle(rec.enemyCounts, rec.allyCounts, {
      seed,
      collectLog: false,
      roundingMode: "legacy"
    });
    if (matches(rec, result)) return { ok: true, seed };
  }
  return { ok: false };
}

function main() {
  const args = process.argv.slice(2);
  const corePath = args.find((a) => !a.startsWith("--")) || path.join(ROOT, "battle-core.js");
  const verbose = args.includes("--verbose");
  const battleCore = loadBattleCore(path.resolve(corePath));
  const records = loadRecords();

  const passRecords = records.filter((r) => r.kind === "pass");
  const failRecords = records.filter((r) => r.kind === "fail");

  let passOk = 0;
  const brokenPasses = [];
  for (const rec of passRecords) {
    const r = testRecord(battleCore, rec, 256);
    if (r.ok) passOk += 1;
    else brokenPasses.push(rec);
  }

  let failFixed = 0;
  const stillFail = [];
  for (const rec of failRecords) {
    const r = testRecord(battleCore, rec, 1024);
    if (r.ok) failFixed += 1;
    else stillFail.push(rec);
  }

  console.log(`Core: ${corePath}`);
  console.log(`Dogrular : ${passOk} / ${passRecords.length}`);
  console.log(`Yanlislar: ${failFixed} / ${failRecords.length} duzeldi`);
  if (brokenPasses.length) {
    console.log(`BOZULAN DOGRULAR (${brokenPasses.length}):`);
    for (const rec of brokenPasses.slice(0, verbose ? 1000 : 15)) {
      console.log(`  ${rec.file} #${rec.num} kat ${rec.stage}`);
    }
  }
  if (stillFail.length) {
    console.log("Hala yanlis:", stillFail.map((r) => `#${r.num}(kat${r.stage})`).join(", "));
  }
}

main();
