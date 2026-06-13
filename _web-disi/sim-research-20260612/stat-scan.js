"use strict";
// s65/s61 hipotez taramasi: muttefik birim statlari (atk, hp) carpaniyla olceklenirse
// hangi kombinasyon fail vakalarini eslestirir? Ortak kombinasyon = sunucu yukseltme kaniti.
const fs = require("fs"), path = require("path");
require("./battle-core-exp.js");
const { simulateBattle } = globalThis.BattleCore;
const ALLY_KEYS = ["bats","ghouls","thralls","banshees","necromancers","gargoyles","witches","rotmaws"];
const ENEMY_KEYS = ["skeletons","zombies","cultists","bonewings","corpses","wraiths","revenants","giants","broodmothers","liches"];
function hashText(text){let h=2166136261;const s=String(text||"");for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function buildSeeds(c,n){let st=hashText(JSON.stringify(c.enemy)+"|"+JSON.stringify(c.ally))||1;const out=[],seen=new Set();while(out.length<n){st=(Math.imul(st,1664525)+1013904223)>>>0;const s2=st||(out.length+1);if(seen.has(s2))continue;seen.add(s2);out.push(s2);}return out;}
function parseUnits(line,prefix,n){const arr=new Array(n).fill(0);const re=new RegExp(prefix+"(\\d+):(\\d+)","g");let m;while((m=re.exec(line))!==null)arr[parseInt(m[1])-1]=parseInt(m[2]);return arr;}
function parseLossUnits(line){const arr=new Array(8).fill(0);const re=/\(T(\d)\) x(\d+)/g;let m;while((m=re.exec(line))!==null)arr[parseInt(m[1])-1]=parseInt(m[2]);return arr;}
function toCounts(arr,keys){return Object.fromEntries(keys.map((k,i)=>[k,arr[i]||0]));}
function parseFile(file,tag){const txt=fs.readFileSync(file,"utf8");return txt.split(/\r?\n(?=#\d+ )/).filter(b=>b.trim().startsWith("#")).map(b=>({
  kat:parseInt(b.match(new RegExp("\\["+tag+"\\] (\\d+)\\. Kat"))[1]),
  server:b.match(/Kat \/ (s\d+)/)[1],
  enemy:toCounts(parseUnits(b.match(/Rakip : \[([^\]]+)\]/)[1],"R",10),ENEMY_KEYS),
  ally:toCounts(parseUnits(b.match(/Biz : \[([^\]]+)\]/)[1],"T",8),ALLY_KEYS),
  expWinner:/Gerceklesen sonuc: Galibiyet/.test(b)?"ally":"enemy",
  expBlood:parseInt(b.match(/Gerceklesen kayip: ([\d.]+) ;/)[1].replace(/\./g,"")),
  expLosses:toCounts(parseLossUnits(b.match(/Gerceklesen kayip birlik: (.*)/)[1]),ALLY_KEYS)}));}
const failFile = path.join("C:","Users","YAVUZ","Downloads","test-sonuclari-fail-tumkat-tumu25-20260612-1837.txt");
const failCases = parseFile(failFile,"YANLIS");
const targets = failCases.map((c,i)=>({...c,no:i+1})).filter(c=>c.server==="s65"||c.server==="s61");
function fpMatch(c,r){if(r.winner!==c.expWinner)return false;if(Number(r.lostBloodTotal||0)!==c.expBlood)return false;return ALLY_KEYS.every(k=>Number(r.allyLosses?.[k]||0)===Number(c.expLosses[k]||0));}
function testCase(c,seedCount,statMult){const seeds=buildSeeds(c,seedCount);for(const rm of["legacy","extround"]){for(const seed of seeds){if(fpMatch(c,simulateBattle(c.enemy,c.ally,{seed,collectLog:false,roundingMode:rm,allyStatMult:statMult})))return true;}}return false;}

const grid=[];
for(let a=100;a<=300;a+=10)for(let h=100;h<=300;h+=10)grid.push({atk:a/100,hp:h/100});
const perCase=new Map();
for(const c of targets){
  const hits=[];
  for(const g of grid){if(testCase(c,16,g))hits.push(g.atk+"/"+g.hp);}
  perCase.set("#"+c.no+"(K"+c.kat+","+c.server+")",hits);
}
let common=null;
for(const [name,hits] of perCase){
  console.log(name+": "+(hits.length?hits.slice(0,25).join(" ")+(hits.length>25?" ... ("+hits.length+")":""):"-"));
  const set=new Set(hits);
  common=common===null?set:new Set([...common].filter(x=>set.has(x)));
}
console.log("\nORTAK kombinasyonlar: "+(common&&common.size?[...common].join(" "):"YOK"));
