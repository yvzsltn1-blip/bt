"use strict";
require("../../battle-core.js");
const core = globalThis.BattleCore;
function cfg(stage){const so={fast:1301,balanced:2603,deep:5209,ultra:9203};const sb=41017+stage*31+7919;return{trialCount:6,fullArmyTrials:10,beamWidth:10,maxIterations:4,eliteCount:6,stabilityTrials:18,exploratoryCandidateCount:100,exhaustiveCandidateLimit:6000,diversityCandidateCount:0,tekilCandidateCount:0,baseSeed:sb+so.balanced,timeBudgetMs:0,alternateBaseSeeds:[so.fast,so.deep,so.ultra].map(o=>sb+o)};}
const stage=23;
const enemy={skeletons:16,zombies:37,cultists:19,bonewings:15,corpses:3,wraiths:0,revenants:0,giants:0,broodmothers:0,liches:0};
const pool={bats:99,ghouls:99,thralls:99,banshees:99,necromancers:99,gargoyles:99,witches:99,rotmaws:1};
const maxPoints=240;const rc=cfg(stage);
const t0=Date.now();
const r=core.optimizeArmyUsage(pool,enemy,{maxPoints,minimumUsedPoints:Math.ceil(maxPoints*0.75),maximumUsedPoints:maxPoints,minimumRequiredCounts:{},requiredLossCounts:{},requiredLossExactFlags:{},minWinRate:0.75,trialCount:rc.trialCount,fullArmyTrials:rc.fullArmyTrials,beamWidth:rc.beamWidth,maxIterations:rc.maxIterations,eliteCount:rc.eliteCount,stabilityTrials:rc.stabilityTrials,baseSeed:rc.baseSeed,objective:"min_loss",roundingMode:"legacy",stoneMode:false,diversityMode:false,tekilMode:false,tekilV2Mode:true,exploratoryCandidateCount:rc.exploratoryCandidateCount,exhaustiveCandidateLimit:rc.exhaustiveCandidateLimit,timeBudgetMs:rc.timeBudgetMs,alternateBaseSeeds:rc.alternateBaseSeeds,diversityCandidateCount:rc.diversityCandidateCount,tekilCandidateCount:rc.tekilCandidateCount,knownSignatures:[],seedCandidates:[]});
console.log("sure(ms):",Date.now()-t0,"possible:",r.possible,"winRate:",r.recommendation?r.recommendation.winRate:null,"simRuns:",r.simulationRuns);
