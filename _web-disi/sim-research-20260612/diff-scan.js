"use strict";
// Bayraklarin tek seed altinda kac savasin parmak izini degistirdigini sayar (kablolama dogrulamasi).
const fs = require("fs"), path = require("path");
require("./battle-core-exp.js");
const { simulateBattle } = globalThis.BattleCore;
const ALLY_KEYS = ["bats","ghouls","thralls","banshees","necromancers","gargoyles","witches","rotmaws"];
const ENEMY_KEYS = ["skeletons","zombies","cultists","bonewings","corpses","wraiths","revenants","giants","broodmothers","liches"];
function parseUnits(line, prefix, n){const arr=new Array(n).fill(0);const re=new RegExp(prefix+"(\\d+):(\\d+)","g");let m;while((m=re.exec(line))!==null)arr[parseInt(m[1])-1]=parseInt(m[2]);return arr;}
function toCounts(arr,keys){return Object.fromEntries(keys.map((k,i)=>[k,arr[i]||0]));}
function parseFile(file,tag){const txt=fs.readFileSync(file,"utf8");return txt.split(/\r?\n(?=#\d+ )/).filter(b=>b.trim().startsWith("#")).map(b=>({
  kat:parseInt(b.match(new RegExp("\\["+tag+"\\] (\\d+)\\. Kat"))[1]),
  enemy:toCounts(parseUnits(b.match(/Rakip : \[([^\]]+)\]/)[1],"R",10),ENEMY_KEYS),
  ally:toCounts(parseUnits(b.match(/Biz : \[([^\]]+)\]/)[1],"T",8),ALLY_KEYS)}));}
const passDir = path.join("C:", "Users", "YAVUZ", "Documents", "BT-Analyss - v6 - Kopya", "test-sonuclari-1-40");
const failFile = path.join("C:", "Users", "YAVUZ", "Downloads", "test-sonuclari-fail-tumkat-tumu25-20260612-1837.txt");
const cases = fs.readdirSync(passDir).filter(f=>f.endsWith(".txt")).flatMap(f=>parseFile(path.join(passDir,f),"DOGRU"))
  .concat(parseFile(failFile,"YANLIS"));
const fp = r => r.winner+"|"+r.lostBloodTotal+"|"+ALLY_KEYS.map(k=>r.allyLosses[k]||0).join(",");
const FLAGS = {
  orderTie:{orderTie:true}, spiderNeutral:{spiderNeutral:true}, lichMeleeOnly:{lichMeleeOnly:true},
  necroSingleRevive:{necroSingleRevive:true}, bonewingFirstAlive:{bonewingFirstAlive:true}
};
for (const [name, flags] of Object.entries(FLAGS)) {
  let changed = 0;
  for (const c of cases) {
    const a = simulateBattle(c.enemy, c.ally, {seed:123, collectLog:false, roundingMode:"legacy"});
    const b = simulateBattle(c.enemy, c.ally, {seed:123, collectLog:false, roundingMode:"legacy", extFlags:flags});
    if (fp(a) !== fp(b)) changed++;
  }
  console.log(name, "degisen savas:", changed, "/", cases.length);
}
