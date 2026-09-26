"use strict";
// Savas Raporu Analizi: oyun savas raporlarini battle-core.js motoruyla karsilastirir.
// Exe (Node SEA) veya `node main.js` ile calisir; yerel sunucu acip tarayicida arayuzu gosterir.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const http = require("http");
const { exec } = require("child_process");

let sea = null;
try { sea = require("node:sea"); } catch { sea = null; }
const IS_SEA = !!(sea && sea.isSea && sea.isSea());
const BASE_DIR = IS_SEA ? path.dirname(process.execPath) : __dirname;
const VERSION = "1.0.0";

function readAsset(name) {
  if (IS_SEA) return sea.getAsset(name, "utf8");
  return fs.readFileSync(path.join(__dirname, name === "battle-core.js" ? "../../battle-core.js" : name), "utf8");
}

// Motor: exe klasorunde veya ust klasorlerde battle-core.js varsa o (guncel), yoksa gomulu kopya.
function loadEngineSource() {
  let dir = BASE_DIR;
  for (let i = 0; i < 5; i += 1) {
    const file = path.join(dir, "battle-core.js");
    if (fs.existsSync(file)) {
      const stat = fs.statSync(file);
      return { source: fs.readFileSync(file, "utf8"), label: file, mtime: stat.mtime.toISOString() };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { source: readAsset("battle-core.js"), label: "Gömülü motor (exe içinde)", mtime: null };
}

function createCore(source) {
  const ctx = { console, window: {} };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "battle-core.js" });
  if (!ctx.window.BattleCore) throw new Error("battle-core.js yüklenemedi (BattleCore bulunamadı)");
  return ctx.window.BattleCore;
}

// ---------------- Analiz ----------------
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];
const ENEMY_NAMES = ["İskelet", "Zombi", "Kültist", "Kemik kanat", "Şişmiş kadavra", "Mezar dehşeti", "Hortlak", "Kemik İzbandut", "Kuluçka Anası", "Ceset"];
const ALLY_NAMES = ["Yarasa sürüsü", "Gulyabani", "Vampir köle", "Banshee", "Ölü çağırıcı", "Gargoyle", "Kan cadısı", "Çürük Gırtlak"];
const ALLY_BLOOD = [10, 15, 20, 35, 50, 75, 90, 150];
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11 };
const REAL_ENEMY = { "iskelet": "R1", "zombi": "R2", "namevt kultist": "R3", "kultist": "R3", "kemik kanat": "R4", "sismis kadavra": "R5", "mezar dehseti": "R6", "hortlak": "R7", "hortlaksi": "R7", "kemik izbandut": "R8", "kulucka anasi": "R9", "ceset": "R10", "orumcek yavrusu": "S" };
const REAL_ALLY = { "dehset kurdu": "T1", "yikici": "T2", "gece avcisi": "T3", "fantom dehseti": "T4", "kurt saman": "T5", "mezar pencesi": "T6", "kanli ay kahini": "T7", "cehennem ucurumu": "T8", "yarasa surusu": "T1", "gulyabani": "T2", "vampir kolu": "T3", "vampir kole": "T3", "banshee": "T4", "olu cagirici": "T5", "gargoyle": "T6", "kan cadisi": "T7", "curuk girtlak": "T8" };
const CODE_NAMES = Object.fromEntries([...ENEMY_NAMES.map((n, i) => [`R${i + 1}`, n]), ...ALLY_NAMES.map((n, i) => [`T${i + 1}`, n]), ["S", "Örümcek yavrusu"]]);
const norm = (s) => String(s).toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").trim();
const realCode = (n) => REAL_ENEMY[norm(n)] || REAL_ALLY[norm(n)] || `?${n}`;
const simCode = (label) => {
  if (/Diriltilmi/.test(label)) return "R2";
  if (/Örümcek/.test(label)) return "S";
  const m = label.match(/\((R\d+|T\d)\)/);
  return m ? m[1] : `?${label}`;
};
const num = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));

const revive = (v) => {
  if (typeof v === "string" && /^\s*\[/.test(v)) { try { return revive(JSON.parse(v)); } catch { return v; } }
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") { for (const k of Object.keys(v)) v[k] = revive(v[k]); }
  return v;
};

function realActions(report) {
  const out = [];
  report.rounds.forEach((round, ri) => (round.a || []).forEach((a, ai) => (a.ev || []).forEach((e, ei) => {
    const units = String(e.Birimler || "").split("→").map((x) => num(x));
    out.push({ r: ri + 1, n: ai + 1, e: ei + 1, s: realCode(e.s), t: realCode(e.t), dmg: num(e.Zarar), before: units[0], after: units[1], hp: num(e["Yaşam Enerjisi"]), mods: (e.m || []).map((m) => m.join(" ")).join(", ") });
  })));
  return out;
}

function simActions(logText, zombieCount) {
  const out = [];
  let r = 0, n = 0, cur = null, pending = [];
  const cultBuff = {};
  for (const raw of logText.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = line.match(/RAUND (\d+)/))) { r = Number(m[1]); n = 0; continue; }
    if ((m = line.match(/^Hamle (\d+)$/))) { n = Number(m[1]); cur = null; pending = []; continue; }
    // Kalici kultist buff'i yalniz kazanildiginda loglanir; aciklama icin saldirilara ekle.
    if ((m = line.match(/vurulup hayatta kaldi; (.+?) birimi \+%(\d+) hasar kazandi/))) { const c = simCode(m[1]); cultBuff[c] = (cultBuff[c] || 0) + Number(m[2]); continue; }
    if (!cur && (m = line.match(/^- (.+)$/))) {
      // Izbandut toplam carpani yazar ("+%115" = x1.15)
      const g = m[1].match(/İzbandut \(R8\), \+%(\d+) hasarla saldiriyor/);
      pending.push(g ? `${m[1]} (+%${Number(g[1]) - 100} birikim)`.replace(/\+%\d+ hasarla/, "birikimli hasarla") : m[1]);
      continue;
    }
    if ((m = line.match(/^  (.+?) → (.+)$/))) {
      const code = simCode(m[1]);
      if (cultBuff[code]) pending.push(`Kalıcı kültist buff'ı +%${cultBuff[code]}`);
      cur = { r, n, e: 1, s: code, t: simCode(m[2]), tLabel: m[2], simMods: pending }; pending = []; out.push(cur); continue;
    }
    if (!cur) continue;
    if ((m = line.match(/Hesap: (.*) = (-?\d+) hasar/))) {
      cur.dmg = Number(m[2]);
      cur.calc = m[1].trim();
      const c = m[1].match(/(\d+) birim × (\d+(?:\.\d+)?) atk(?: × (\d+(?:\.\d+)?) carpan)?/);
      if (c) { cur.units = Number(c[1]); cur.atk = Number(c[2]); cur.mult = c[3] ? Number(c[3]) : 1; }
      continue;
    }
    if ((m = line.match(/↳ (.+?): (?:\d+ birim kaybetti, )?(\d+) birim \/ (-?\d+) can kaldi/))) {
      const ev = [...out].reverse().find((x) => x.r === r && x.n === n && x.tLabel === m[1] && x.after === undefined);
      if (ev) { ev.after = Number(m[2]); ev.hp = Number(m[3]); }
      continue;
    }
    if ((m = line.match(/↳ (.+?) tamamen yok edildi/))) {
      const ev = [...out].reverse().find((x) => x.r === r && x.n === n && x.tLabel === m[1] && x.after === undefined);
      if (ev) { ev.after = 0; ev.hp = 0; }
      continue;
    }
    if ((m = line.match(/↳ (.+?), (.+?) uzerine (\d+) (?:artik \(overkill\)|yayilma) hasari? verdi/))) {
      const sibling = out.filter((x) => x.r === r && x.n === n).length;
      out.push({ r, n, e: sibling + 1, s: simCode(m[1]), t: simCode(m[2]), tLabel: m[2], dmg: Number(m[3]) });
      continue;
    }
    if (/her biri 1 canla geri dirildi/.test(line)) {
      const ev = [...out].reverse().find((x) => x.r === r && x.n === n && x.t === "R2");
      if (ev) { ev.after = zombieCount; ev.hp = zombieCount; }
    }
  }
  // Kan cadisinin cift turdaki 0 hasarli ana vurusu raporda gorunmez; yayilma vurusu ilk eylem olur.
  return out
    .filter((x) => !(x.s === "T7" && x.e === 1 && x.dmg === 0 && x.r % 2 === 0))
    .map((x, i, arr) => (x.s === "T7" && x.r % 2 === 0 && x.e > 1 && !arr.some((y) => y !== x && y.r === x.r && y.n === x.n && y.e < x.e) ? { ...x, e: 1 } : x))
    .map(({ tLabel, ...rest }) => rest);
}

const FIELDS = ["s", "t", "dmg", "after", "hp"];
function diffFields(a, b) {
  if (!a || !b) return ["eksik"];
  const bad = FIELDS.filter((f) => b[f] !== undefined && a[f] !== b[f]);
  if (a.r !== b.r) bad.push("tur");
  return bad;
}
function compareActions(real, sim) {
  const len = Math.max(real.length, sim.length);
  const rows = [];
  let first = null, mismatches = 0;
  for (let i = 0; i < len; i += 1) {
    const bad = diffFields(real[i], sim[i]);
    if (bad.length) { mismatches += 1; if (first === null) first = i; }
    rows.push(bad);
  }
  return { first, mismatches, rows };
}
const sig = (x) => `${x.r}|${x.s}|${x.t}|${x.dmg}|${x.after ?? ""}|${x.hp ?? ""}`;
function sameMultiset(real, sim) {
  if (real.length !== sim.length) return false;
  const a = real.map(sig).sort(), b = sim.map(sig).sort();
  return a.every((v, i) => v === b[i]);
}
const lastRound = (acts) => acts.reduce((m, x) => Math.max(m, x.r || 0), 0);

function parseReport(report) {
  const enemyCounts = Object.fromEntries(ENEMY_KEYS.map((k) => [k, 0]));
  const allyCounts = Object.fromEntries(ALLY_KEYS.map((k) => [k, 0]));
  const realAlly = ALLY_KEYS.map(() => null);
  const realEnemy = ENEMY_KEYS.map(() => null);
  let realSpiders = null;
  const warnings = [];
  for (const u of report.mine || []) {
    const tier = ROMAN[String(u.rank || "").replace(/^Rütbe\s+/, "").trim()] || Number(realCode(u.name).slice(1));
    if (!tier || tier > 8) { warnings.push(`Tanınmayan birlik: ${u.name}`); continue; }
    allyCounts[ALLY_KEYS[tier - 1]] = u.nums[0];
    realAlly[tier - 1] = { start: u.nums[0], left: u.nums[1], lost: u.nums[2], blood: u.nums[3] || 0 };
  }
  for (const u of report.enemy || []) {
    const code = realCode(u.name);
    if (code === "S") { realSpiders = { start: u.nums[0], left: u.nums[1], lost: u.nums[2] }; continue; }
    if (code[0] !== "R") { warnings.push(`Tanınmayan düşman: ${u.name}`); continue; }
    const i = Number(code.slice(1)) - 1;
    enemyCounts[ENEMY_KEYS[i]] = u.nums[0];
    realEnemy[i] = { start: u.nums[0], left: u.nums[1], lost: u.nums[2] };
  }
  return { enemyCounts, allyCounts, realAlly, realEnemy, realSpiders, warnings };
}

function analyzeReport(core, report, seedCount) {
  const parsed = parseReport(report);
  const { enemyCounts, allyCounts, realAlly, realEnemy } = parsed;
  const real = realActions(report);
  const realWinner = /zafer/i.test(report.result || "") ? "ally" : "enemy";
  const realBlood = realAlly.reduce((s, x) => s + (x ? x.blood : 0), 0);
  const random = enemyCounts.cultists > 0;
  const seeds = random ? seedCount : 1;

  const outcomeOf = (res) => {
    const allyLost = ALLY_KEYS.map((k) => Number(res.allyLosses[k] || 0));
    const enemyLeft = ENEMY_KEYS.map((k, i) => Number(res.remainingNumbers[i] || 0) + (i === 1 ? Number(res.remainingNumbers[18] || 0) : 0));
    return { winner: res.winner, allyLost, enemyLeft, blood: res.lostBloodTotal };
  };
  const outcomeMatches = (o) => o.winner === realWinner
    && ALLY_KEYS.every((k, i) => o.allyLost[i] === (realAlly[i] ? realAlly[i].lost : 0))
    && o.blood === realBlood
    && ENEMY_KEYS.every((k, i) => !realEnemy[i] || o.enemyLeft[i] === realEnemy[i].left);

  let best = null;
  let sameOutcome = 0, simWins = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    const res = core.simulateBattle(enemyCounts, allyCounts, { seed, collectLog: true });
    const sim = simActions(res.logText, enemyCounts.zombies);
    const cmp = compareActions(real, sim);
    const outcome = outcomeOf(res);
    const lossOk = outcomeMatches(outcome);
    if (lossOk) sameOutcome += 1;
    if (res.winner === "ally") simWins += 1;
    const score = cmp.first === null ? Infinity : cmp.first;
    if (!best || (lossOk && !best.lossOk) || (lossOk === best.lossOk && (score > best.score || (score === best.score && cmp.mismatches < best.cmp.mismatches)))) {
      best = { seed, res, sim, cmp, score, lossOk, outcome };
    }
  }

  const exactFlow = best.cmp.first === null;
  let category;
  if (exactFlow && best.lossOk) category = "tam";
  else if (best.lossOk && sameMultiset(real, best.sim)) category = "sira";
  else if (best.lossOk) category = "akis";
  else category = "sonuc";

  const o = best.outcome;
  const unitRows = [];
  ALLY_KEYS.forEach((k, i) => {
    if (!allyCounts[k]) return;
    const r = realAlly[i] || { start: 0, left: 0, lost: 0, blood: 0 };
    const simLost = o.allyLost[i];
    const bloodPer = ALLY_BLOOD[i];
    unitRows.push({ side: "ally", name: ALLY_NAMES[i], code: `T${i + 1}`, start: r.start, realLeft: r.left, simLeft: r.start - simLost, realLost: r.lost, simLost, realBlood: r.blood, simBlood: simLost * bloodPer });
  });
  ENEMY_KEYS.forEach((k, i) => {
    if (!enemyCounts[k]) return;
    const r = realEnemy[i];
    unitRows.push({ side: "enemy", name: ENEMY_NAMES[i], code: `R${i + 1}`, start: r.start, realLeft: r.left, simLeft: o.enemyLeft[i], realLost: r.lost, simLost: r.start - o.enemyLeft[i] });
  });

  const diffReasons = [];
  if (o.winner !== realWinner) diffReasons.push("Kazanan farklı");
  if (o.blood !== realBlood) diffReasons.push(`Kan kaybı ${realBlood} ≠ ${o.blood}`);
  unitRows.forEach((u) => { if (u.realLeft !== u.simLeft) diffReasons.push(`${u.name}: kalan ${u.realLeft} ≠ ${u.simLeft}`); });
  if (!exactFlow) {
    const bad = best.cmp.rows[best.cmp.first];
    diffReasons.push(`İlk eylem sapması #${best.cmp.first + 1} (${bad.join("+")})`);
  }

  // Motorun kullandigi hizlar (RAUND 0 dizilim tablosundan)
  const simSpeeds = {};
  for (const line of best.res.logText.split("\n")) {
    if (/RAUND 1/.test(line)) break;
    const m = line.match(/\((R\d+|T\d)\).*?(\d+) hiz/);
    if (m) simSpeeds[m[1]] = Number(m[2]);
  }
  const katMatch = String(report.kat || "").match(/#\s*(\d+)/);
  return {
    id: String(report.id),
    kat: katMatch ? Number(katMatch[1]) : null,
    time: report.time || null,
    category,
    random,
    seed: best.seed,
    seedsTried: seeds,
    sameOutcomeSeeds: random ? sameOutcome : null,
    simWinRate: random ? simWins / seeds : null,
    real: { winner: realWinner, blood: realBlood, rounds: lastRound(real), actions: real.length, unitsLost: realAlly.reduce((s, x) => s + (x ? x.lost : 0), 0) },
    sim: { winner: o.winner, blood: o.blood, rounds: lastRound(best.sim), actions: best.sim.length, unitsLost: o.allyLost.reduce((a, b) => a + b, 0) },
    enemyCounts, allyCounts, units: unitRows,
    firstDiff: best.cmp.first,
    mismatchCount: best.cmp.mismatches,
    diffReasons,
    warnings: parsed.warnings,
    simSpeeds,
    actions: { real, sim: best.sim, bad: best.cmp.rows }
  };
}

async function analyze(text, options = {}, onProgress = () => {}) {
  const seedCount = Math.max(1, Math.min(4096, Number(options.seeds) || 256));
  const engine = options.engineSource ? { source: options.engineSource, label: options.engineLabel || "Özel motor", mtime: null } : loadEngineSource();
  const core = createCore(engine.source);
  let data = revive(JSON.parse(text.replace(/^﻿/, "")));
  if (Array.isArray(data)) data = { reports: data };
  const all = Array.isArray(data.reports) ? data.reports : [];
  const skipped = [];
  const battles = [];
  const started = Date.now();
  let done = 0;
  onProgress(0, all.length);
  for (const report of all) {
    done += 1;
    if (done > 1) { onProgress(done - 1, all.length); await new Promise((r) => setImmediate(r)); }
    if (!report || report.error || !report.mine || !report.rounds) {
      skipped.push({ id: report && report.id != null ? String(report.id) : "?", reason: report && report.error ? String(report.error) : "Rapor eksik (birlik/tur verisi yok)" });
      continue;
    }
    try { battles.push(analyzeReport(core, report, seedCount)); }
    catch (err) { skipped.push({ id: String(report.id), reason: `Analiz hatası: ${err.message}` }); }
  }
  onProgress(all.length, all.length);
  battles.sort((a, b) => Number(b.id) - Number(a.id));
  battles.forEach((b) => { b.explain = null; });
  try { explainBattles(battles); } catch (err) { console.error("Açıklama hatası:", err.stack); }
  const counts = { tam: 0, sira: 0, akis: 0, sonuc: 0 };
  battles.forEach((b) => { counts[b.category] += 1; });
  const buckets = {};
  battles.filter((b) => b.firstDiff !== null).forEach((b) => {
    const a = b.actions.real[b.firstDiff] || {}, s = b.actions.sim[b.firstDiff] || {};
    const key = `${b.actions.bad[b.firstDiff].join("+")} | gerçek ${a.s || "-"}→${a.t || "-"} / motor ${s.s || "-"}→${s.t || "-"}`;
    (buckets[key] = buckets[key] || []).push(b.id);
  });
  return {
    meta: {
      version: VERSION,
      fileName: options.fileName || null,
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      engine: { label: engine.label, mtime: engine.mtime, model: core.BATTLE_MODEL || null },
      seedCount,
      total: all.length,
      analyzed: battles.length
    },
    counts, skipped,
    buckets: Object.entries(buckets).sort((a, b) => b[1].length - a[1].length).map(([key, ids]) => ({ key, ids })),
    codeNames: CODE_NAMES,
    battles
  };
}

// ---------------- Sunucu ----------------
function startServer() {
  const html = readAsset("ui.html");
  let lastPing = Date.now();
  const jobs = new Map();
  let jobSeq = 0, running = 0;
  const server = http.createServer((req, res) => {
    const send = (code, type, body) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body); };
    if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) return send(200, "text/html; charset=utf-8", html);
    if (req.url === "/api/ping") { lastPing = Date.now(); return send(200, "application/json", "{}"); }
    if (req.url === "/api/engine") {
      try { const e = loadEngineSource(); return send(200, "application/json", JSON.stringify({ label: e.label, mtime: e.mtime, version: VERSION })); }
      catch (err) { return send(500, "application/json", JSON.stringify({ error: err.message })); }
    }
    if (req.method === "POST" && req.url.startsWith("/api/analyze")) {
      const url = new URL(req.url, "http://x");
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const id = String(++jobSeq);
        const job = { done: 0, total: 0, started: Date.now(), result: null, error: null };
        jobs.set(id, job);
        running += 1;
        analyze(Buffer.concat(chunks).toString("utf8"), { seeds: url.searchParams.get("seeds"), fileName: url.searchParams.get("name") }, (d, t) => { job.done = d; job.total = t; })
          .then((result) => { job.result = JSON.stringify(result); })
          .catch((err) => { job.error = err.message; })
          .finally(() => { running -= 1; });
        send(200, "application/json", JSON.stringify({ job: id }));
      });
      return;
    }
    if (req.url.startsWith("/api/job")) {
      lastPing = Date.now();
      const job = jobs.get(new URL(req.url, "http://x").searchParams.get("id"));
      if (!job) return send(404, "application/json", JSON.stringify({ error: "İş bulunamadı" }));
      if (job.error) return send(200, "application/json", JSON.stringify({ status: "error", error: job.error }));
      if (job.result) { jobs.delete(new URL(req.url, "http://x").searchParams.get("id")); return send(200, "application/json; charset=utf-8", `{"status":"done","result":${job.result}}`); }
      return send(200, "application/json", JSON.stringify({ status: "running", done: job.done, total: job.total, elapsedMs: Date.now() - job.started }));
    }
    send(404, "text/plain", "Bulunamadı");
  });
  server.listen(0, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log(`Savaş Raporu Analizi v${VERSION}`);
    console.log(`Arayüz: ${url}`);
    console.log("Bu pencereyi kapatarak programı kapatabilirsiniz (sekme kapanınca birkaç dakikada kendiliğinden de kapanır).");
    if (!process.argv.includes("--no-open")) exec(`cmd /c start "" "${url}"`);
  });
  // Sekme kapaninca (ping kesilince) cik. Arka plandaki sekmede tarayici ping'i dakikada bire dusurebilir; 5 dk bekle.
  setInterval(() => { if (!running && Date.now() - lastPing > 5 * 60000) process.exit(0); }, 10000).unref();
  process.on("uncaughtException", (err) => console.error("Hata:", err && err.message));
  setTimeout(() => {}, 1 << 30);
}

// ---------------- Sapma aciklamasi ----------------
// Kural tabanli: ilk sapan eylemi siniflandirir, ayni durumu dosyadaki tum savaslarda sayar
// (motorun zaten dogru buldugu durumlar = onerilen kural degisikliginin bozabilecegi yerler).
const SPEED = { R1: 3, R2: 2, R3: 1, R4: 4, R5: 1, R6: 4, R7: 4, R8: 1, R9: 2, R10: 3, T1: 5, T2: 2, T3: 4, T4: 4, T5: 2, T6: 3, T7: 3, T8: 1, S: 6 };
const UNIT_HP = { R1: 4, R2: 7, R3: 1, R4: 3, R5: 10, R6: 2, R7: 12, R8: 25, R9: 18, R10: 25, T1: 2, T2: 5, T3: 6, T4: 4, T5: 5, T6: 12, T7: 8, T8: 90, S: 1 };
const ROW = { R1: "cephe", R2: "cephe", R3: "artçı", R4: "artçı", R5: "cephe", R6: "artçı", R7: "cephe", R8: "cephe", R9: "artçı", R10: "artçı", T1: "artçı", T2: "cephe", T3: "cephe", T4: "artçı", T5: "artçı", T6: "cephe", T7: "artçı", T8: "cephe", S: "artçı" };
const KIND = { R1: "kaba", R2: "kaba", R3: "okült", R4: "okült", R5: "canavar", R6: "okült", R7: "kaba", R8: "canavar", R9: "canavar", R10: "okült", T1: "kaba", T2: "kaba", T3: "okült", T4: "canavar", T5: "okült", T6: "canavar", T7: "okült", T8: "canavar", S: "tipsiz" };
const uName = (c) => CODE_NAMES[c] || c;
const uDesc = (c) => `${uName(c)} (hız ${SPEED[c] ?? "?"}, ${ROW[c] || "?"}, ${KIND[c] || "?"})`;
const fmtIds = (ids, max = 25) => ids.length ? ids.slice(0, max).join(", ") + (ids.length > max ? ` … (+${ids.length - max})` : "") : "-";
const uniq = (arr) => [...new Set(arr)];

// Gercek rapordan her eylem oncesi birim/can durumu.
function realStates(b) {
  if (b._states) return b._states;
  const cnt = {}, hp = {};
  ENEMY_KEYS.forEach((k, i) => { const c = `R${i + 1}`; if (b.enemyCounts[k]) { cnt[c] = b.enemyCounts[k]; hp[c] = cnt[c] * UNIT_HP[c]; } });
  ALLY_KEYS.forEach((k, i) => { const c = `T${i + 1}`; if (b.allyCounts[k]) { cnt[c] = b.allyCounts[k]; hp[c] = cnt[c] * UNIT_HP[c]; } });
  const out = [];
  for (const a of b.actions.real) {
    out.push({ cnt: { ...cnt }, hp: { ...hp } });
    if (a.t && Number.isFinite(a.after)) cnt[a.t] = a.after;
    if (a.t && Number.isFinite(a.hp)) hp[a.t] = a.hp;
  }
  out.push({ cnt: { ...cnt }, hp: { ...hp } });
  Object.defineProperty(b, "_states", { value: out, enumerable: false });
  return out;
}
const aliveStacks = (st) => Object.entries(st.cnt).filter(([c, v]) => c !== "S" && v > 0).length;
const prefixLen = (b) => (b.firstDiff == null ? Math.min(b.actions.real.length, b.actions.sim.length) : b.firstDiff);
const roundStartIndex = (b, r) => Math.max(0, b.actions.real.findIndex((x) => x.r === r));

// Verilen durumlari (sonuc etiketli) tek basina ayiran basit koşullari bulur.
function findSeparators(rows, feats) {
  const outcomes = uniq(rows.map((x) => x.outcome));
  if (outcomes.length < 2) return [];
  const found = [];
  for (const [label, fn] of feats) {
    const map = {};
    let ok = true;
    for (const x of rows) {
      const v = fn(x);
      if (v == null) { ok = false; break; }
      if (map[v] && map[v] !== x.outcome) { ok = false; break; }
      map[v] = x.outcome;
    }
    if (ok && uniq(Object.values(map)).length > 1) found.push(`“${label}” ${rows.length}/${rows.length} durumu ayırıyor: ` + Object.entries(map).map(([v, o]) => `${v} → ${o}`).join("; "));
  }
  return found;
}

function parseRealMods(str) {
  return String(str || "").split(/,\s*/).filter(Boolean).map((t) => {
    const m = t.match(/^(.*?)\s*([+-]?\d+(?:[.,]\d+)?)%/);
    return m ? { name: m[1].trim(), pct: Number(m[2].replace(",", ".")), text: t } : { name: t.trim(), pct: null, text: t };
  });
}
function parseSimModPct(line) {
  let m = line.match(/([+-])%(\d+(?:\.\d+)?)/);
  if (m) return (m[1] === "-" ? -1 : 1) * Number(m[2]);
  m = line.match(/%(\d+(?:\.\d+)?)\s+(azalt|dusur|düşür)/i);
  if (m) return -Number(m[1]);
  m = line.match(/%(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
const near = (a, b, tol = 0.012) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

function explainOrder(b, i, all) {
  const a = b.actions.real[i], s = b.actions.sim[i];
  const A = a.s, B = s.s;
  const laterB = b.actions.real.findIndex((x, j) => j > i && x.r === a.r && x.s === B && x.e === 1);
  const st = realStates(b)[roundStartIndex(b, a.r)];
  const sp = (c) => (b.simSpeeds && b.simSpeeds[c] != null ? b.simSpeeds[c] : SPEED[c]);
  const speedNotes = [A, B].filter((c) => b.simSpeeds && b.simSpeeds[c] != null && b.simSpeeds[c] !== SPEED[c])
    .map((c) => `Motor ${uName(c)} hızını ${b.simSpeeds[c]} kullanıyor, bilinen değer ${SPEED[c]}: hız değeri hatalı olabilir.`);
  const summary = [
    `Tur ${a.r}'de gerçek oyunda sıradaki saldıran ${uName(A)}, motorda ise ${uName(B)}. Motordaki hızlar: ${uName(A)} ${sp(A)}, ${uName(B)} ${sp(B)}.`,
    ...speedNotes,
    speedNotes.length ? `Motordaki hız değeri bu iki birimin sırasını değiştiriyor.` : sp(A) === sp(B) ? `Motorda iki birimin hızı eşit (${sp(A)}); fark eşit hızlılar arasındaki sıra (beraberlik) kuralından ya da hız değerinden geliyor.`
      : sp(A) > sp(B) ? `Motorda ${uName(A)} daha hızlı olduğu halde ${uName(B)} önce oynatılmış: motorda bu birime özel bir sıra istisnası var.`
      : `Motor ${uName(B)} birimini daha hızlı (${sp(B)} > ${sp(A)}) sayıp öne almış; oyunda ${uName(A)} önce gitmiş. Ya motordaki hız değeri yanlış ya da oyunda hızdan bağımsız bir öncelik var.`,
    laterB >= 0 ? `${uName(B)} gerçekte aynı turda daha sonra (eylem #${laterB + 1}) saldırmış → yalnız sıra değişmiş.` : `${uName(B)} gerçekte bu turda hiç saldırmamış → ya ölüydü/saldıramadı ya da tur, motordan farklı bitti.`,
    `Tur başında sahada ${aliveStacks(st)} sağ kıta vardı.`
  ];
  // Kanit: A ve B'nin ayni turda birlikte hareket ettigi tum durumlar
  const rows = [];
  for (const x of all) {
    const lim = prefixLen(x);
    const rounds = uniq(x.actions.real.slice(0, lim).map((y) => y.r));
    for (const r of rounds) {
      const ia = x.actions.real.findIndex((y, j) => j < lim && y.r === r && y.s === A && y.e === 1);
      const ib = x.actions.real.findIndex((y, j) => j < lim && y.r === r && y.s === B && y.e === 1);
      if (ia < 0 || ib < 0) continue;
      rows.push({ id: x.id, r, stacks: aliveStacks(realStates(x)[roundStartIndex(x, r)]), outcome: `${uName(ia < ib ? A : B)} önce`, agree: true });
    }
    if (x.firstDiff != null) {
      const ra = x.actions.real[x.firstDiff], sa = x.actions.sim[x.firstDiff];
      if (ra && sa && ra.s !== sa.s && [ra.s, sa.s].sort().join() === [A, B].sort().join()) {
        rows.push({ id: x.id, r: ra.r, stacks: aliveStacks(realStates(x)[roundStartIndex(x, ra.r)]), outcome: `${uName(ra.s)} önce`, agree: false });
      }
    }
  }
  const agreeA = rows.filter((x) => x.agree && x.outcome.startsWith(uName(A)));
  const agreeB = rows.filter((x) => x.agree && x.outcome.startsWith(uName(B)));
  const bad = rows.filter((x) => !x.agree);
  const seps = findSeparators(rows, [
    ["Tur başı sağ kıta sayısı tek/çift", (x) => (x.stacks % 2 ? "tek" : "çift")],
    ["Tur numarası tek/çift", (x) => (x.r % 2 ? "tek" : "çift")],
    ["İlk tur mu", (x) => (x.r === 1 ? "1. tur" : "sonraki turlar")],
    ["Tur başı sağ kıta ≥ 10", (x) => (x.stacks >= 10 ? "≥10" : "<10")]
  ]);
  return {
    type: "sira", title: "Saldırı sırası farkı",
    summary,
    fix: [
      ...(speedNotes.length ? ["Önce motordaki hız değeri düzeltilmeli: " + speedNotes.join(" ")] : []),
      `Motorda ${uName(A)} ile ${uName(B)} arasındaki sıralama kuralı bu durumda ${uName(A)} birimini önce çalıştırmalı.`,
      ...(seps.length ? ["Veride koşulu açıklayan aday kural(lar):", ...seps.map((x) => "• " + x)] : ["Mevcut veride bu iki sırayı ayıran basit bir koşul (tur/kıta sayısı tek-çift vb.) bulunamadı; kural için daha fazla rapor gerekebilir."])
    ],
    impact: [
      `Bu iki birimin aynı turda birlikte saldırdığı ${rows.length} durum var: motorun zaten doğru bildiği ${agreeA.length} durumda ${uName(A)} önce, ${agreeB.length} durumda ${uName(B)} önce; motorun yanlış bildiği ${bad.length} durum (savaş: ${fmtIds(uniq(bad.map((x) => x.id)))}).`,
      ...(agreeA.length + agreeB.length === 0 && bad.length > 1 ? [`Motor bu iki birimin sırasını hiçbir durumda doğru bilmiyor: bu, tek seferlik değil sistematik bir kural/değer hatası (${bad.length} savaş).`] : []),
      agreeB.length ? `Koşulsuz “${uName(A)} hep önce” kuralı şu an doğru olan ${agreeB.length} turu BOZAR (savaş: ${fmtIds(uniq(agreeB.map((x) => x.id)))}). Kural bir koşula bağlanmalı.` : `Motorun doğru bildiği durumlarda hiç “${uName(B)} önce” örneği yok; “${uName(A)} önce” değişikliği mevcut doğru savaşları bu açıdan bozmaz.`
    ],
    relatedIds: uniq(bad.map((x) => x.id))
  };
}

function explainTarget(b, i, all) {
  const a = b.actions.real[i], s = b.actions.sim[i];
  const A = a.s, Tr = a.t, Ts = s.t;
  const st = realStates(b)[i];
  const summary = [
    `${uName(A)} gerçekte ${uDesc(Tr)} birimini, motorda ise ${uDesc(Ts)} birimini hedef aldı (Tur ${a.r}).`,
    `O anki durum (gerçek): ${uName(Tr)} ${st.cnt[Tr] ?? 0} birim / ${st.hp[Tr] ?? "?"} can · ${uName(Ts)} ${st.cnt[Ts] ?? 0} birim / ${st.hp[Ts] ?? "?"} can.`,
    ROW[Tr] !== ROW[Ts] ? `Hedefler farklı saflarda (${ROW[Tr]} ↔ ${ROW[Ts]}): saf seçimi/cepheyi aşma kuralı farklı işliyor olabilir.` : `İki hedef de ${ROW[Tr]} safında: aynı saf içindeki hedef önceliği (tip avantajı, birim sayısı, can) farklı.`,
    KIND[Tr] !== KIND[Ts] ? `Tipler farklı (${KIND[Tr]} ↔ ${KIND[Ts]}): tip avantajına göre hedef seçimi etkili olabilir.` : ""
  ].filter(Boolean);
  if (a.mods) summary.push(`Gerçek eylemin modları: ${a.mods}.`);
  const rows = [];
  for (const x of all) {
    const lim = prefixLen(x), states = realStates(x);
    x.actions.real.forEach((y, j) => {
      if (j >= lim || y.s !== A || y.e !== 1) return;
      const sj = states[j];
      if (!(sj.cnt[Tr] > 0 && sj.cnt[Ts] > 0)) return;
      rows.push({ id: x.id, r: y.r, j, st: sj, chosen: y.t, outcome: y.t === Tr ? uName(Tr) : y.t === Ts ? uName(Ts) : `başka (${uName(y.t)})`, agree: true });
    });
    if (x.firstDiff != null) {
      const ra = x.actions.real[x.firstDiff], sa = x.actions.sim[x.firstDiff];
      if (ra && sa && ra.s === A && sa.s === A && ra.t !== sa.t && [ra.t, sa.t].sort().join() === [Tr, Ts].sort().join()) {
        rows.push({ id: x.id, r: ra.r, j: x.firstDiff, st: realStates(x)[x.firstDiff], chosen: ra.t, outcome: uName(ra.t), agree: false });
      }
    }
  }
  const good = rows.filter((x) => x.agree);
  const goodTs = good.filter((x) => x.chosen === Ts), goodTr = good.filter((x) => x.chosen === Tr);
  const bad = rows.filter((x) => !x.agree);
  const two = rows.filter((x) => x.chosen === Tr || x.chosen === Ts);
  const seps = findSeparators(two, [
    [`${uName(Tr)} birim sayısı ${uName(Ts)} biriminden az mı`, (x) => (x.st.cnt[Tr] < x.st.cnt[Ts] ? "az" : "az değil")],
    [`${uName(Tr)} toplam canı ${uName(Ts)} biriminden az mı`, (x) => (x.st.hp[Tr] < x.st.hp[Ts] ? "az" : "az değil")],
    ["İlk tur mu", (x) => (x.r === 1 ? "1. tur" : "sonraki turlar")],
    ["Sahada sağ kıta sayısı tek/çift", (x) => (aliveStacks(x.st) % 2 ? "tek" : "çift")]
  ]);
  return {
    type: "hedef", title: "Hedef seçimi farkı",
    summary,
    fix: [
      `Motorda ${uName(A)} biriminin hedef seçimi, bu durumda ${uName(Ts)} yerine ${uName(Tr)} birimini seçecek şekilde değişmeli.`,
      ...(seps.length ? ["Veride seçimi açıklayan aday koşul(lar):", ...seps.map((x) => "• " + x)] : ["Mevcut veride seçimi ayıran basit bir koşul (birim sayısı/can/tur) bulunamadı."])
    ],
    impact: [
      `${uName(A)} biriminin hem ${uName(Tr)} hem ${uName(Ts)} sağken saldırdığı ${good.length} doğru bilinen eylem var: ${goodTr.length} kez ${uName(Tr)}, ${goodTs.length} kez ${uName(Ts)}, ${good.length - goodTr.length - goodTs.length} kez başka hedef seçilmiş. Motorun yanlış bildiği ${bad.length} durum (savaş: ${fmtIds(uniq(bad.map((x) => x.id)))}).`,
      goodTs.length ? `Koşulsuz “${uName(Tr)} birimini tercih et” kuralı şu an doğru olan ${goodTs.length} eylemi BOZAR (savaş: ${fmtIds(uniq(goodTs.map((x) => x.id)))}).` : `Doğru bilinen durumlarda ${uName(A)} hiç ${uName(Ts)} birimini seçmemiş; “${uName(Tr)} öncelikli” değişikliği bu açıdan mevcut doğru savaşları bozmaz.`
    ],
    relatedIds: uniq(bad.map((x) => x.id))
  };
}

function explainDamage(b, i, all) {
  const a = b.actions.real[i], s = b.actions.sim[i];
  const mods = parseRealMods(a.mods);
  const pctMods = mods.filter((m) => m.pct != null);
  const realProd = pctMods.reduce((p, m) => p * (1 + m.pct / 100), 1);
  const summary = [`${uName(a.s)} → ${uName(a.t)} (Tur ${a.r}${a.e > 1 ? ", yayılma/artık hasar eylemi" : ""}): gerçek zarar ${a.dmg}, motor ${s.dmg} (fark ${a.dmg - s.dmg > 0 ? "+" : ""}${a.dmg - s.dmg}, oran ×${s.dmg ? (a.dmg / s.dmg).toFixed(3) : "?"}).`];
  if (s.calc) summary.push(`Motor hesabı: ${s.calc} = ${s.dmg}.`);
  if (s.simMods && s.simMods.length) summary.push(`Motorun uyguladığı etkiler: ${s.simMods.join(" · ")}.`);
  summary.push(`Gerçek rapordaki modlar: ${a.mods || "(yok)"}.`);
  const fix = [];
  let suspect = null;
  const simPcts = (s.simMods || []).map((line) => ({ line, pct: parseSimModPct(line) })).filter((x) => x.pct != null);
  const restSim = simPcts.slice(), missing = [];
  for (const m of pctMods) {
    const k = restSim.findIndex((x) => Math.abs(x.pct - m.pct) < 0.01);
    if (k >= 0) restSim.splice(k, 1); else missing.push(m);
  }
  // Motorun kendi hesabi: hedefe uygulanan debuff satirlari ("... hasarini %25 azaltti") saldirana islemez; "1.50x hasar carpani" carpandir.
  // (234 tam uyumlu savasin 4178 eyleminde bu hesap motor zarariyla birebir ayni.)
  const dmgLines = (s.simMods || []).filter((l) => !/hasarini %d+ azaltti$/.test(l));
  const simProd = dmgLines.map(parseSimModPct).filter((x) => x != null).reduce((p, x) => p * (1 + x / 100), 1)
    * dmgLines.map((l) => { const k = l.match(/(d+(?:.d+)?)x hasar carpani/); return k ? Number(k[1]) : 1; }).reduce((p, x) => p * x, 1);
  const simRaw = s.units && s.atk ? s.units * s.atk * simProd : null;
  const selfConsistent = simRaw == null || Math.round(simRaw + 1e-9) === s.dmg;
  // Aday nedenler yalniz gercek/motor zarar oranini sayisal olarak aciklarsa kabul edilir
  // (oyun raporu hedefin uzerindeki, hasara etkisi olmayan etkileri de listeler).
  const ratio = s.dmg ? a.dmg / s.dmg : null;
  // Motor hesabi yoksa (yayilma/artik hasar) mod dogrulanamaz; aday uretme.
  const fits = (x) => ratio != null && simRaw != null && Math.round(simRaw * x + 1e-9) === a.dmg;
  const cands = [];
  missing.forEach((m) => { if (fits(1 + m.pct / 100)) cands.push({ kind: "eksik", name: m.name, pct: m.pct, text: m.text, msg: `Motor “${m.text}” etkisini bu eylemde uygulamıyor: eklenince oran ×${(1 + m.pct / 100).toFixed(3)} olur ve gerçek zarar (${a.dmg}) tutar.` }); });
  restSim.forEach((x) => { if (fits(1 / (1 + x.pct / 100))) cands.push({ kind: "fazla", name: x.line, text: x.line, msg: `Motor bu eylemde fazladan “${x.line}” uyguluyor: çıkarılınca gerçek zarar (${a.dmg}) tutar.` }); });
  missing.forEach((m) => restSim.forEach((x) => { if (fits((1 + m.pct / 100) / (1 + x.pct / 100))) cands.push({ kind: "deger", name: m.name, pct: m.pct, text: m.text, msg: `“${m.name}” etkisi gerçekte %${m.pct}, motorda %${x.pct} (“${x.line}”): motorun bu etkinin değerini hesaplayan formülü düzeltilmeli.` }); }));
  if (!selfConsistent) {
    suspect = { kind: "tutarsiz" };
    fix.push(`Motorun log'a yazdığı etkilerin çarpımı ${simProd.toFixed(3)} (→ ${simRaw.toFixed(1)} zarar), ama motor ${s.dmg} zarar uyguladı: motor bir etkiyi log'dakinden farklı bir değerle uyguluyor ya da log'a yazılmayan ek bir çarpan var. Gerçek zararın gerektirdiği çarpan ≈${(a.dmg / (s.units * s.atk)).toFixed(3)}.`);
    const cand = dmgLines.map((l) => ({ l, p: parseSimModPct(l) })).filter((x) => x.p != null);
    if (cand.length) fix.push("Gerçek zararı tutturmak için etkinin alması gereken değer (hangisi hatalıysa): " + cand.map((x) => `“${x.l}” %${x.p} yerine ≈%${Math.round(((a.dmg / (s.units * s.atk)) / (simProd / (1 + x.p / 100)) - 1) * 100)}`).join(" · "));
  } else if (cands.length === 1) { suspect = cands[0]; fix.push(cands[0].msg); }
  else if (cands.length > 1) { suspect = cands[0]; fix.push("Zarar oranını açıklayan birden çok olası neden var (biri ya da birkaçı):", ...cands.map((c) => "• " + c.msg)); }
  else if (Math.abs(a.dmg - s.dmg) <= 1) {
    suspect = { kind: "yuvarlama" };
    fix.push(simRaw == null
      ? `Fark 1 puan; bu bir yayılma/artık hasar eylemi (motor ayrı çarpan hesabı yazmıyor). Büyük olasılıkla yayılan hasarın hesaplanması/yuvarlanması oyundan farklı: motor ${s.dmg}, oyun ${a.dmg}. Yayılma hasarının hangi değerden (ana vuruş zararı mı, ham hasar mı) ve hangi yuvarlamayla türetildiği kontrol edilmeli.`
      : `Fark 1 puan ve hiçbir etki farkıyla açıklanmıyor: büyük olasılıkla yuvarlama kuralı farkı. Motor ham değeri (${s.calc || "?"}) ${s.dmg}'a yuvarlamış, oyun ${a.dmg}.`);
  } else if (false) {
    fix.push(`Motorun log'a yazdığı etkilerin çarpımı ${simProd.toFixed(3)}, ama uyguladığı çarpan ${s.mult.toFixed(2)}: motor bir etkiyi log'dakinden farklı bir değerle uyguluyor ya da log'a yazılmayan ek bir çarpan var. Gerçek zararın gerektirdiği çarpan ≈${s.units && s.atk ? (a.dmg / (s.units * s.atk)).toFixed(3) : "?"}.`);
    fix.push("Motor çarpanını tutturmak için her etkinin alması gereken değer: " + simPcts.map((x) => `“${x.line}” %${x.pct} yerine ≈%${Math.round((s.mult / (simProd / (1 + x.pct / 100)) - 1) * 100)}`).join(" · "));
  } else if (s.units && s.atk && s.mult && Math.round(a.dmg / (s.atk * s.mult)) !== s.units && Math.abs(a.dmg / (s.atk * s.mult) - Math.round(a.dmg / (s.atk * s.mult))) < 0.05) {
    suspect = { kind: "birim" };
    fix.push(`Zarar, saldıranın ${Math.round(a.dmg / (s.atk * s.mult))} birim olmasıyla tutuyor (motorda ${s.units}): saldıran birim sayısı daha önce görünmeyen bir şekilde farklılaşmış (kayıp/diriliş/çağırma).`);
  } else {
    fix.push(`Gerçek/motor zarar oranı ×${ratio ? ratio.toFixed(3) : "?"}; bunu tek bir etki açıklamıyor. Birden çok etki farklı olabilir ya da raporda görünmeyen bir etki var.${s.units && s.atk ? ` Gereken toplam çarpan ≈${(a.dmg / (s.units * s.atk)).toFixed(3)} (motor ${s.mult.toFixed(2)}).` : ""}`);
  }
  if (missing.length || restSim.length) {
    summary.push(`Mod listesi farkı (bilgi): ${missing.length ? `raporda olup motorda olmayan: ${missing.map((m) => m.text).join(", ")}` : ""}${missing.length && restSim.length ? " · " : ""}${restSim.length ? `motorda olup raporda olmayan: ${restSim.map((x) => x.line).join(" · ")}` : ""}. Not: rapor hedefin üzerindeki etkileri de gösterir, bunların hepsi zarara etki etmez.`);
  }
  if (s.units && s.atk) summary.push(`Gerçek zararın gerektirdiği çarpan ${(a.dmg / (s.units * s.atk)).toFixed(3)} · motorun çarpanı ${s.mult.toFixed(2)}.`);
  // Etki: ayni saldiran→hedef ve (varsa) ayni mod ile dogru bilinen eylemler
  const same = [], sameMod = [], bad = [];
  for (const x of all) {
    const lim = prefixLen(x);
    x.actions.real.forEach((y, j) => {
      if (j >= lim || y.s !== a.s) return;
      if (y.t === a.t && y.e === a.e) same.push(x.id);
      if (suspect && (suspect.kind === "eksik" || suspect.kind === "deger") && parseRealMods(y.mods).some((m) => m.name === suspect.name && m.pct === suspect.pct)) sameMod.push(x.id);
    });
    if (x.firstDiff != null) {
      const ra = x.actions.real[x.firstDiff], sa = x.actions.sim[x.firstDiff];
      if (ra && sa && ra.s === a.s && ra.t === a.t && sa.s === ra.s && sa.t === ra.t && ra.dmg !== sa.dmg) bad.push(x.id);
    }
  }
  const impact = [`${uName(a.s)} → ${uName(a.t)} ${a.e > 1 ? "yayılma " : ""}eyleminin motorca doğru hesaplandığı ${same.length} eylem var (${uniq(same).length} savaşta); aynı eylemde zararın yanlış olduğu savaşlar: ${fmtIds(uniq(bad))}.`];
  if (suspect && suspect.kind === "eksik") {
    impact.push(sameMod.length
      ? `“${suspect.text}” modu ${uName(a.s)} için ${sameMod.length} doğru eylemde zaten görünüyor ve motor onları doğru hesaplıyor (savaş: ${fmtIds(uniq(sameMod))}). Yani motor bu modu genelde uyguluyor; sorun modun bu durumda tetiklenmemesi. Modu koşulsuz eklemek o eylemleri BOZAR (çift sayılır); tetiklenme koşulu düzeltilmeli.`
      : `“${suspect.name}” modu ${uName(a.s)} biriminin doğru bilinen hiçbir eyleminde yok; bu modun eklenmesi mevcut doğru eylemleri doğrudan bozmaz, ancak koşulu doğru tanımlanmalı.`);
  } else if (suspect && suspect.kind === "deger") {
    impact.push(sameMod.length
      ? `“${suspect.text}” etkisi ${uName(a.s)} biriminin motorca doğru hesaplanan ${sameMod.length} eyleminde (${uniq(sameMod).length} savaş: ${fmtIds(uniq(sameMod))}) de var. Formül değişikliği bu eylemleri de etkiler; yeni formül onlarda da aynı sonucu vermeli (değişiklikten sonra dosya yeniden analiz edilerek doğrulanmalı).`
      : `“${suspect.name}” etkisinin doğru bilinen başka örneği yok; formül değişikliğinin yan etkisi bu dosyadan ölçülemiyor.`);
  } else if (suspect && suspect.kind === "yuvarlama") {
    impact.push("Yuvarlama kuralı tüm hasar hesaplarını etkiler: değişiklik yapılırsa bütün dosya yeniden analiz edilip tam uyumlu sayısının düşmediği kontrol edilmeli.");
  } else {
    impact.push(same.length ? `Bu eşleşme ${same.length} eylemde doğru; değişiklik yalnızca bu savaştaki özel duruma (modlar/buff) bağlanmalı, aksi halde bu eylemler bozulur.` : "Bu saldıran→hedef eşleşmesinin doğru bilinen başka örneği yok; değişikliğin yan etkisi bu dosyadan ölçülemiyor.");
  }
  return { type: "hasar", title: suspect && suspect.kind === "yuvarlama" ? "Hasar yuvarlama farkı" : "Hasar hesabı farkı", summary, fix, impact, relatedIds: uniq(bad) };
}

function explainLoss(b, i, all) {
  const a = b.actions.real[i], s = b.actions.sim[i];
  const st = realStates(b)[i];
  const hpBefore = st.hp[a.t], cntBefore = st.cnt[a.t];
  const expectHp = hpBefore - a.dmg;
  const expectCnt = Math.max(0, Math.ceil(expectHp / UNIT_HP[a.t]));
  const summary = [
    `${uName(a.s)} → ${uName(a.t)} (Tur ${a.r}): zarar iki tarafta da ${a.dmg}, ama sonuç farklı.`,
    `Önceki durum: ${cntBefore} birim / ${hpBefore} can (birim başı ${UNIT_HP[a.t]} can).`,
    `Gerçek: ${a.before} → ${a.after} birim, ${a.hp} can kaldı · Motor: ${s.after ?? "?"} birim, ${s.hp ?? "?"} can kaldı.`,
    `Basit hesap (can − zarar): ${expectHp} can, ${expectCnt} birim.`
  ];
  const fix = [];
  if (a.before !== cntBefore) fix.push(`Rapordaki “önce” birim sayısı (${a.before}) izlenen durumdan (${cntBefore}) farklı: bu eylemden önce görünmeyen bir değişim olmuş (diriliş, çağırma, iyileşme). Motorda bu görünmeyen etki eksik/farklı.`);
  if (a.hp === expectHp && s.hp !== expectHp) fix.push(`Gerçek sonuç düz “can − zarar” ile tutuyor; motor ek bir kural uyguluyor (ör. ölüm eşiği, kalkan, diriltme). Motorun bu hedefteki özel kuralı gözden geçirilmeli.`);
  else if (a.hp !== expectHp && s.hp === expectHp) fix.push(`Oyun “can − zarar”dan farklı bir sonuç veriyor (${a.hp} ≠ ${expectHp}); oyunda bu hedefe özel bir kural var (ör. zarar tavanı, birim başı taşma kuralı, hasar emme). Motora eklenmeli.`);
  else if (!fix.length) fix.push("Kayıp/can hesabı iki tarafta da farklı işliyor; birim başı can veya taşma (overkill) kuralı incelenmeli.");
  const good = [], bad = [];
  for (const x of all) {
    const lim = prefixLen(x);
    x.actions.real.forEach((y, j) => { if (j < lim && y.t === a.t) good.push(x.id); });
    if (x.firstDiff != null) {
      const ra = x.actions.real[x.firstDiff], sa = x.actions.sim[x.firstDiff];
      if (ra && sa && ra.t === a.t && ra.dmg === sa.dmg && (ra.after !== sa.after || ra.hp !== sa.hp)) bad.push(x.id);
    }
  }
  return {
    type: "kayip", title: "Kayıp / can hesabı farkı", summary, fix,
    impact: [`${uName(a.t)} birimine yapılan ${good.length} saldırıda (${uniq(good).length} savaş) motor kayıp/can sonucunu doğru buluyor; aynı hedefte hatalı olan savaşlar: ${fmtIds(uniq(bad))}.`,
      good.length ? "Değişiklik genel kayıp formülüne yapılırsa bu doğru eylemler bozulabilir; yalnız bu durumu ayıran koşula (hedef tipi, taşma, diriliş) bağlanmalı." : "Bu hedefe ait doğru bilinen başka örnek yok; yan etki bu dosyadan ölçülemiyor."],
    relatedIds: uniq(bad)
  };
}

function explainLength(b, i) {
  const a = b.actions.real[i], s = b.actions.sim[i];
  const realEnds = !a;
  return {
    type: "uzunluk", title: realEnds ? "Savaş gerçekte daha erken bitti" : "Motor savaşı daha erken bitirdi",
    summary: [realEnds ? `Gerçek rapor ${b.actions.real.length} eylemde bitiyor; motor devam ediyor (sıradaki motor eylemi: ${uName(s.s)} → ${uName(s.t)}, Tur ${s.r}).` : `Motor ${b.actions.sim.length} eylemde bitiriyor; gerçekte savaş sürüyor (sıradaki gerçek eylem: ${uName(a.s)} → ${uName(a.t)}, Tur ${a.r}).`,
      "Önceki tüm eylemler aynı olduğuna göre fark, eylemlerde görünmeyen bir durumdan (tur limiti, bitiş koşulu, kalan birim hesabı) kaynaklanıyor."],
    fix: ["Savaş bitiş koşulu (tüm kıtalar ölü mü, tur sınırı) ve son turlardaki kalan birim sayıları karşılaştırılmalı; birim tablosundaki kalan farkları ipucu verir."],
    impact: ["Bitiş koşulu değişikliği tüm savaşları etkiler; değişiklik sonrası dosyanın tamamı yeniden analiz edilmeli."],
    relatedIds: []
  };
}

function explainResultOnly(b, all) {
  const diffUnits = b.units.filter((u) => u.realLeft !== u.simLeft || (u.side === "ally" && u.realBlood !== u.simBlood));
  const same = diffUnits.map((u) => {
    const ok = all.filter((x) => x !== b && x.units.some((v) => v.code === u.code && v.realLeft === v.simLeft && (v.side !== "ally" || v.realBlood === v.simBlood))).length;
    return `${u.name}: bu birimin bulunduğu ${ok} savaşta özet doğru.`;
  });
  return {
    type: "ozet", title: "Eylemler aynı, özet sonuç farklı",
    summary: ["Tüm eylemler birebir aynı; farklılık yalnızca savaş sonu özet tablosunda.", ...diffUnits.map((u) => `${u.name}: kalan gerçek ${u.realLeft} / motor ${u.simLeft}${u.side === "ally" ? `, kan ${u.realBlood} / ${u.simBlood}` : ""}`)],
    fix: ["Bu genelde savaş sonrası uygulanan kurallardan (diriltme taşı, dirilen/çağrılan birimlerin özete sayılması, kan hesabı) ya da raporun özet tablosunun farklı sayılmasından kaynaklanır. Motorun savaş sonu özet hesabı bu birim için gözden geçirilmeli."],
    impact: same.length ? same : ["-"],
    relatedIds: []
  };
}

function explainBattles(battles) {
  for (const b of battles) {
    if (b.category === "tam") continue;
    const i = b.firstDiff;
    let ex;
    if (i == null) ex = explainResultOnly(b, battles);
    else {
      const a = b.actions.real[i], s = b.actions.sim[i], bad = b.actions.bad[i];
      if (!a || !s) ex = explainLength(b, i);
      else if (bad.includes("s") || bad.includes("tur")) ex = explainOrder(b, i, battles);
      else if (bad.includes("t")) ex = explainTarget(b, i, battles);
      else if (bad.includes("dmg")) ex = explainDamage(b, i, battles);
      else ex = explainLoss(b, i, battles);
    }
    if (i != null && b.mismatchCount > 1) ex.summary.push(`Bu ilk sapmadan sonra ${b.mismatchCount - 1} eylem daha farklı; bunların çoğu büyük olasılıkla ilk sapmanın zincirleme sonucudur. Önce ilk sapma düzeltilmeli.`);
    if (b.random) ex.summary.push(`Not: Savaşta kültist var (rastgele buff). ${b.seedsTried} tohum denendi, ${b.sameOutcomeSeeds} tanesi gerçek sonucu verdi${b.sameOutcomeSeeds ? "" : "; hiçbir tohum tutmuyor, yani fark rastgelelikten değil kural farkından"}.`);
    ex.relatedIds = (ex.relatedIds || []).filter((id) => id !== b.id);
    b.explain = ex;
  }
}

if (require.main === module || IS_SEA) {
  const cliIdx = process.argv.indexOf("--cli");
  if (cliIdx !== -1) {
    analyze(fs.readFileSync(process.argv[cliIdx + 1], "utf8"), { fileName: path.basename(process.argv[cliIdx + 1]) }).then((result) => console.log(JSON.stringify({ meta: result.meta, counts: result.counts, skipped: result.skipped.length, notExact: result.battles.filter((b) => b.category !== "tam").map((b) => `${b.id}:${b.category}`) }, null, 1)));
  } else {
    startServer();
  }
}

module.exports = { analyze };
