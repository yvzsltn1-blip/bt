"use strict";

(function attachBattleCore(globalScope) {
  const ENEMY_UNITS = [
    { key: "skeletons", label: "Iskelet (R1)", sample: 0 },
    { key: "zombies", label: "Zombi (R2)", sample: 14 },
    { key: "cultists", label: "Namevt Kultist (R3)", sample: 3 },
    { key: "bonewings", label: "Kemik Kanat (R4)", sample: 29 },
    { key: "corpses", label: "Sismis Kadavra (R5)", sample: 21 },
    { key: "wraiths", label: "Mezar Dehseti (R6)", sample: 15 },
    { key: "revenants", label: "Hortlaksi (R7)", sample: 11 },
    { key: "giants", label: "Kemik Izbandut (R8)", sample: 9 },
    { key: "broodmothers", label: "Kulucka Anasi (R9)", sample: 4 },
    { key: "liches", label: "Ceset (R10)", sample: 5 }
  ];

  const ALLY_UNITS = [
    { key: "bats", label: "Yarasa Surusu (T1)", sample: 69 },
    { key: "ghouls", label: "Gulyabani (T2)", sample: 91 },
    { key: "thralls", label: "Vampir Kole (T3)", sample: 60 },
    { key: "banshees", label: "Banshee (T4)", sample: 5 },
    { key: "necromancers", label: "Olu Cagirici (T5)", sample: 1 },
    { key: "gargoyles", label: "Gargoyle (T6)", sample: 14 },
    { key: "witches", label: "Kan Cadisi (T7)", sample: 3 },
    { key: "rotmaws", label: "Curuk Girtlak (T8)", sample: 2 }
  ];

  const ALLY_POINT_COSTS = [2, 3, 4, 7, 10, 15, 18, 30];

  const UNIT_DESC = [
    ["Iskelet (R1)", "enemy", "brute", "front", 3, 4, 3, 0, 0],
    ["Zombi (R2)", "enemy", "brute", "front", 2, 7, 2, 0, 0],
    ["Namevt Kultist (R3)", "enemy", "occult", "rear", 5, 1, 1, 0, 0],
    ["Kemik Kanat (R4)", "enemy", "occult", "rear", 6, 3, 4, 0, 0],
    ["Sismis Kadavra (R5)", "enemy", "monster", "front", 1, 10, 1, 0, 0],
    ["Mezar Dehseti (R6)", "enemy", "occult", "rear", 7, 2, 4, 0, 0],
    ["Hortlaksi (R7)", "enemy", "brute", "front", 8, 12, 4, 0, 0],
    ["Kemik Izbandut (R8)", "enemy", "monster", "front", 10, 25, 1, 0, 0],
    ["Kulucka Anasi (R9)", "enemy", "monster", "rear", 9, 18, 2, 0, 0],
    ["Ceset (R10)", "enemy", "occult", "rear", 40, 25, 3, 0, 0],
    ["Yarasa Surusu (T1)", "ally", "brute", "rear", 8, 2, 5, 2, 10],
    ["Gulyabani (T2)", "ally", "brute", "front", 3, 5, 2, 3, 15],
    ["Vampir Kole (T3)", "ally", "occult", "front", 6, 6, 4, 4, 20],
    ["Banshee (T4)", "ally", "monster", "rear", 7, 4, 4, 7, 35],
    ["Olu Cagirici (T5)", "ally", "occult", "rear", 9, 5, 2, 10, 50],
    ["Gargoyle (T6)", "ally", "monster", "front", 12, 12, 3, 15, 75],
    ["Kan Cadisi (T7)", "ally", "occult", "rear", 14, 8, 3, 18, 90],
    ["Curuk Girtlak (T8)", "ally", "monster", "front", 30, 90, 1, 30, 150],
    ["Diriltilmis Zombiler", "enemy", "brute", "front", 2, 1, 2, 0, 0],
    ["Orumcekler", "enemy", "monster", "rear", 1, 1, 6, 0, 0]
  ];

  const NAME_INDEX = 0;
  const SIDE_INDEX = 1;
  const TYPE_INDEX = 2;
  const POSITION_INDEX = 3;
  const ATTACK_INDEX = 4;
  const HEALTH_INDEX = 5;
  const SPEED_INDEX = 6;
  const SPACE_INDEX = 7;
  const BLOOD_INDEX = 8;

  const SKELETONS_INDEX = 0;
  const ZOMBIES_INDEX = 1;
  const CULTISTS_INDEX = 2;
  const BONEWINGS_INDEX = 3;
  const CORPSES_INDEX = 4;
  const WRAITHS_INDEX = 5;
  const REVENANTS_INDEX = 6;
  const GIANTS_INDEX = 7;
  const BROODMOTHERS_INDEX = 8;
  const LICHES_INDEX = 9;
  const BATS_INDEX = 10;
  const GHOULS_INDEX = 11;
  const THRALLS_INDEX = 12;
  const BANSHEES_INDEX = 13;
  const NECROMANCERS_INDEX = 14;
  const GARGOYLES_INDEX = 15;
  const WITCHES_INDEX = 16;
  const ROTMAWS_INDEX = 17;
  const REVIVED_INDEX = 18;
  const SPIDERLINGS_INDEX = 19;

  const BLOOD_BY_ALLY_KEY = Object.fromEntries(
    ALLY_UNITS.map((unit, index) => [unit.key, UNIT_DESC[BATS_INDEX + index][BLOOD_INDEX]])
  );
  const POINTS_BY_ALLY_KEY = Object.fromEntries(
    ALLY_UNITS.map((unit, index) => [unit.key, ALLY_POINT_COSTS[index]])
  );

  function parseCount(value, label) {
    const trimmed = String(value).trim();
    if (trimmed === "") {
      return 0;
    }
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`${label} icin gecersiz deger: ${JSON.stringify(value)}`);
    }
    return Number.parseInt(trimmed, 10);
  }

  function cloneCounts(source, units) {
    const result = {};
    units.forEach((unit) => {
      result[unit.key] = source[unit.key] || 0;
    });
    return result;
  }

  function calculateArmyPoints(counts) {
    return ALLY_UNITS.reduce((sum, unit) => sum + (counts[unit.key] || 0) * POINTS_BY_ALLY_KEY[unit.key], 0);
  }

  function getStagePointLimit(stage) {
    return stage * 10 + 10;
  }

  function normalizeCandidateToPointLimit(sourceCounts, maxPoints) {
    const counts = cloneCounts(sourceCounts, ALLY_UNITS);
    if (!(maxPoints >= 0)) {
      return counts;
    }

    const priority = [...ALLY_UNITS].sort((left, right) => {
      const pointDelta = POINTS_BY_ALLY_KEY[right.key] - POINTS_BY_ALLY_KEY[left.key];
      if (pointDelta !== 0) {
        return pointDelta;
      }
      return BLOOD_BY_ALLY_KEY[right.key] - BLOOD_BY_ALLY_KEY[left.key];
    });

    let totalPoints = calculateArmyPoints(counts);
    while (totalPoints > maxPoints) {
      let removed = false;
      for (const unit of priority) {
        if ((counts[unit.key] || 0) > 0) {
          counts[unit.key] -= 1;
          totalPoints -= POINTS_BY_ALLY_KEY[unit.key];
          removed = true;
          break;
        }
      }
      if (!removed) {
        break;
      }
    }

    return counts;
  }

  function buildOrders(unitSpeed) {
    const minSpeed = Math.min(...unitSpeed);
    const maxSpeed = Math.max(...unitSpeed);

    const attackerOrder = [];
    for (let speed = maxSpeed; speed >= minSpeed; speed -= 1) {
      for (let j = UNIT_DESC.length - 1; j >= 0; j -= 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "ally" && UNIT_DESC[j][POSITION_INDEX] === "rear") {
          attackerOrder.push(j);
        }
      }
      for (let j = UNIT_DESC.length - 1; j >= 0; j -= 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "enemy" && UNIT_DESC[j][POSITION_INDEX] === "rear") {
          attackerOrder.push(j);
        }
      }
      for (let j = UNIT_DESC.length - 1; j >= 0; j -= 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "ally" && UNIT_DESC[j][POSITION_INDEX] === "front") {
          attackerOrder.push(j);
        }
      }
      for (let j = UNIT_DESC.length - 1; j >= 0; j -= 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "enemy" && UNIT_DESC[j][POSITION_INDEX] === "front") {
          attackerOrder.push(j);
        }
      }
    }

    const defenderOrderFront = [];
    for (let speed = minSpeed; speed <= maxSpeed; speed += 1) {
      for (let j = 0; j < UNIT_DESC.length; j += 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "enemy" && UNIT_DESC[j][POSITION_INDEX] === "front") {
          defenderOrderFront.push(j);
        }
      }
      for (let j = 0; j < UNIT_DESC.length; j += 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "ally" && UNIT_DESC[j][POSITION_INDEX] === "front") {
          defenderOrderFront.push(j);
        }
      }
    }

    const defenderOrderRear = [];
    for (let speed = minSpeed; speed <= maxSpeed; speed += 1) {
      for (let j = 0; j < UNIT_DESC.length; j += 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "enemy" && UNIT_DESC[j][POSITION_INDEX] === "rear") {
          defenderOrderRear.push(j);
        }
      }
      for (let j = 0; j < UNIT_DESC.length; j += 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "ally" && UNIT_DESC[j][POSITION_INDEX] === "rear") {
          defenderOrderRear.push(j);
        }
      }
    }

    const defenderOrderFrontFirst = defenderOrderFront.slice();
    const defenderOrderRearFirst = defenderOrderRear.slice();

    for (let i = 0; i < defenderOrderRear.length; i += 1) {
      defenderOrderFrontFirst.push(defenderOrderRear[i]);
    }

    for (let i = 0; i < defenderOrderFront.length; i += 1) {
      defenderOrderRearFirst.push(defenderOrderFront[i]);
    }

    return {
      attackerOrder,
      defenderOrderFrontFirst,
      defenderOrderRearFirst
    };
  }

  function createRng(seed) {
    if (typeof seed !== "number") {
      return Math.random;
    }
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInt(max, rng) {
    return Math.floor(rng() * max);
  }

  function formatUnitLine(count, name, hp) {
    return `${String(count).padStart(3)} ${name.padEnd(28)} ${String(hp).padStart(4)} can`;
  }

  function printBattlefield(log, unitNumbers, unitHealth, order, side) {
    if (side === "enemy") {
      for (let i = order.length - 1; i >= 0; i -= 1) {
        const index = order[i];
        if (unitNumbers[index] > 0 && UNIT_DESC[index][SIDE_INDEX] === side) {
          log(formatUnitLine(unitNumbers[index], UNIT_DESC[index][NAME_INDEX], unitHealth[index]));
        }
      }
      return;
    }

    for (let i = 0; i < order.length; i += 1) {
      const index = order[i];
      if (unitNumbers[index] > 0 && UNIT_DESC[index][SIDE_INDEX] === side) {
        log(formatUnitLine(unitNumbers[index], UNIT_DESC[index][NAME_INDEX], unitHealth[index]));
      }
    }
  }

  function simulateBattle(enemyCounts, allyCounts, options = {}) {
    const collectLog = options.collectLog !== false;
    const rng = createRng(options.seed);
    const logs = [];
    const log = (line = "") => {
      if (collectLog) {
        logs.push(line);
      }
    };

    const zombies = enemyCounts.zombies;
    const corpses = enemyCounts.corpses;

    const unitNumbersInitial = [
      enemyCounts.skeletons,
      enemyCounts.zombies,
      enemyCounts.cultists,
      enemyCounts.bonewings,
      enemyCounts.corpses,
      enemyCounts.wraiths,
      enemyCounts.revenants,
      enemyCounts.giants,
      enemyCounts.broodmothers,
      enemyCounts.liches,
      allyCounts.bats,
      allyCounts.ghouls,
      allyCounts.thralls,
      allyCounts.banshees,
      allyCounts.necromancers,
      allyCounts.gargoyles,
      allyCounts.witches,
      allyCounts.rotmaws,
      0,
      0
    ];

    const unitNumbers = unitNumbersInitial.slice();
    const unitSpeed = UNIT_DESC.map((unit) => unit[SPEED_INDEX]);
    const unitHealth = unitNumbers.map((count, index) => count * UNIT_DESC[index][HEALTH_INDEX]);
    const unitBuffs = Array(20).fill(1);

    let orders = buildOrders(unitSpeed);
    let attackerOrder = orders.attackerOrder;
    let defenderOrderFrontFirst = orders.defenderOrderFrontFirst;
    let defenderOrderRearFirst = orders.defenderOrderRearFirst;

    let roundCount = 0;
    let turnCount = 0;
    let enemyCapable = true;
    let allyCapable = true;
    let winner = "";

    log("--------------------------------------------------");
    log(`Raund ${roundCount} - Hamle ${turnCount}`);
    log("- Baslangic muharebe duzeni");
    log("");
    printBattlefield(log, unitNumbers, unitHealth, defenderOrderFrontFirst, "enemy");
    log("");
    printBattlefield(log, unitNumbers, unitHealth, defenderOrderFrontFirst, "ally");
    log("--------------------------------------------------");

    while (enemyCapable && allyCapable) {
      roundCount += 1;
      turnCount = 0;
      enemyCapable = false;
      allyCapable = false;

      for (let j = 0; j < unitNumbers.length; j += 1) {
        if (unitNumbers[j] > 0 && UNIT_DESC[j][SIDE_INDEX] === "enemy") {
          enemyCapable = true;
          break;
        }
      }
      if (!enemyCapable) {
        winner = "ally";
        log(">> Dusman yenildi! Zafer muttefiklerin.");
        break;
      }

      for (let j = 0; j < unitNumbers.length; j += 1) {
        if (unitNumbers[j] > 0 && UNIT_DESC[j][SIDE_INDEX] === "ally") {
          allyCapable = true;
          break;
        }
      }
      if (!allyCapable) {
        winner = "enemy";
        log(">> Muttefikler yenildi! Savas meydani dusmanin.");
        break;
      }

      let bansheesReduceRound = -1;
      let bansheesReduceTarget = -1;
      let gargoylesReduceEvent = false;
      let gargoylesReduceEnemyIndex = -1;

      if (unitNumbers[GARGOYLES_INDEX] > 0) {
        for (let k = 0; k < 100; k += 1) {
          const randomIndex = randomInt(unitNumbers.length, rng);
          if (unitNumbers[randomIndex] > 0 && UNIT_DESC[randomIndex][SIDE_INDEX] === "enemy") {
            unitSpeed[randomIndex] -= 2;
            gargoylesReduceEnemyIndex = randomIndex;
            gargoylesReduceEvent = true;
            break;
          }
        }

        orders = buildOrders(unitSpeed);
        attackerOrder = orders.attackerOrder;
        defenderOrderFrontFirst = orders.defenderOrderFrontFirst;
        defenderOrderRearFirst = orders.defenderOrderRearFirst;
      }

      for (let j = 0; j < attackerOrder.length; j += 1) {
        let attackerIndex = -1;
        let defenderIndex = -1;
        let foundAttacker = false;
        let foundDefender = false;

        if (unitNumbers[attackerOrder[j]] > 0) {
          attackerIndex = attackerOrder[j];
          foundAttacker = true;
        }

        let defenderOrder = defenderOrderFrontFirst;

        if (foundAttacker) {
          const attackerSide = UNIT_DESC[attackerIndex][SIDE_INDEX];
          const defenderSide = attackerSide === "ally" ? "enemy" : "ally";
          if (attackerIndex === BONEWINGS_INDEX || attackerIndex === BANSHEES_INDEX) {
            defenderOrder = defenderOrderRearFirst;
          }

          for (let l = 0; l < defenderOrder.length; l += 1) {
            if (unitNumbers[defenderOrder[l]] > 0 && UNIT_DESC[defenderOrder[l]][SIDE_INDEX] === defenderSide) {
              defenderIndex = defenderOrder[l];
              foundDefender = true;
              break;
            }
          }
        }

        if (!foundDefender) {
          continue;
        }

        turnCount += 1;
        log(`Raund ${roundCount} - Hamle ${turnCount}`);

        let damageMultiplier = 1;
        const attackerType = UNIT_DESC[attackerIndex][TYPE_INDEX];
        const defenderType = UNIT_DESC[defenderIndex][TYPE_INDEX];

        if (unitNumbers[REVENANTS_INDEX] > 0) {
          if (UNIT_DESC[attackerIndex][SIDE_INDEX] === "ally" && UNIT_DESC[attackerIndex][POSITION_INDEX] === "rear") {
            log(`- ${UNIT_DESC[REVENANTS_INDEX][NAME_INDEX]}, ${UNIT_DESC[attackerIndex][NAME_INDEX]} hasarini %15 azaltiyor`);
          }
        }

        if (gargoylesReduceEvent) {
          log(`- ${UNIT_DESC[GARGOYLES_INDEX][NAME_INDEX]}, ${UNIT_DESC[gargoylesReduceEnemyIndex][NAME_INDEX]} hizini 2 azaltti; ${UNIT_DESC[gargoylesReduceEnemyIndex][NAME_INDEX]} hizi artik ${unitSpeed[gargoylesReduceEnemyIndex]}`);
          gargoylesReduceEvent = false;
        }

        if (attackerIndex === BONEWINGS_INDEX && UNIT_DESC[defenderIndex][SIDE_INDEX] === "ally" && UNIT_DESC[defenderIndex][POSITION_INDEX] === "rear") {
          log(`- ${UNIT_DESC[BONEWINGS_INDEX][NAME_INDEX]}, muttefik on saflari asip arka saflari hedef aldi`);
        }

        if (attackerIndex === BANSHEES_INDEX && UNIT_DESC[defenderIndex][SIDE_INDEX] === "enemy" && UNIT_DESC[defenderIndex][POSITION_INDEX] === "rear") {
          log(`- ${UNIT_DESC[BANSHEES_INDEX][NAME_INDEX]}, dusman on saflari asip arka saflari hedef aldi`);
        }

        if (attackerType === "brute" && defenderType === "occult") {
          damageMultiplier = 1.5;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, ${UNIT_DESC[defenderIndex][NAME_INDEX]} karsisinda tip ustunlugune sahip (+%50 hasar)`);
        }
        if (attackerType === "brute" && defenderType === "monster") {
          damageMultiplier = 0.5;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, ${UNIT_DESC[defenderIndex][NAME_INDEX]} karsisinda tip dezavantajli (-%50 hasar)`);
        }
        if (attackerType === "occult" && defenderType === "brute" && defenderIndex !== GHOULS_INDEX && attackerIndex !== WRAITHS_INDEX) {
          damageMultiplier = 0.5;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, ${UNIT_DESC[defenderIndex][NAME_INDEX]} karsisinda tip dezavantajli (-%50 hasar)`);
        }
        if (attackerType === "occult" && defenderType === "monster" && attackerIndex !== WRAITHS_INDEX) {
          damageMultiplier = 1.5;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, ${UNIT_DESC[defenderIndex][NAME_INDEX]} karsisinda tip ustunlugune sahip (+%50 hasar)`);
        }
        if (attackerType === "monster" && defenderType === "brute" && defenderIndex !== GHOULS_INDEX && attackerIndex !== ROTMAWS_INDEX) {
          damageMultiplier = 1.5;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, ${UNIT_DESC[defenderIndex][NAME_INDEX]} karsisinda tip ustunlugune sahip (+%50 hasar)`);
        }
        if (attackerType === "monster" && defenderType === "occult" && attackerIndex !== ROTMAWS_INDEX) {
          damageMultiplier = 0.5;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, ${UNIT_DESC[defenderIndex][NAME_INDEX]} karsisinda tip dezavantajli (-%50 hasar)`);
        }

        if (attackerIndex === WRAITHS_INDEX) {
          damageMultiplier = 1;
          log(`- ${UNIT_DESC[WRAITHS_INDEX][NAME_INDEX]}, birim tipini onemsemiyor`);
        }
        if (defenderIndex === GHOULS_INDEX) {
          damageMultiplier = 0.5;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, ${UNIT_DESC[GHOULS_INDEX][NAME_INDEX]} uzerine -%50 azalmis hasarla saldiriyor`);
        }
        if (attackerIndex === ROTMAWS_INDEX) {
          damageMultiplier = 1;
          log(`- ${UNIT_DESC[ROTMAWS_INDEX][NAME_INDEX]}, birim tipini onemsemiyor`);
        }

        const unitNumbersBefore = unitNumbers.slice();

        if (attackerIndex === BONEWINGS_INDEX && turnCount === 1) {
          damageMultiplier *= 1.2;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, turun ilki oldugu icin +%20 hasar kazandi`);
        }

        if (attackerIndex === WRAITHS_INDEX) {
          let wraithsDamageMultiplier = 1;
          let allyUnitNumbers = unitNumbers[defenderIndex];
          while (allyUnitNumbers >= 2 * unitNumbers[WRAITHS_INDEX]) {
            wraithsDamageMultiplier += 0.5;
            allyUnitNumbers -= unitNumbers[WRAITHS_INDEX];
          }
          damageMultiplier *= wraithsDamageMultiplier;
          log(`- ${UNIT_DESC[WRAITHS_INDEX][NAME_INDEX]}, ${wraithsDamageMultiplier.toFixed(2)}x hasar carpani kazandi`);
        }

        if (unitNumbers[REVENANTS_INDEX] > 0) {
          if (UNIT_DESC[attackerIndex][SIDE_INDEX] === "ally" && UNIT_DESC[attackerIndex][POSITION_INDEX] === "rear") {
            damageMultiplier *= 0.85;
          }
        }

        if (attackerIndex === BATS_INDEX && roundCount === 1) {
          damageMultiplier *= 1.25;
          log(`- ${UNIT_DESC[BATS_INDEX][NAME_INDEX]}, ilk turda +%25 hasarla saldiriyor`);
        }

        if (attackerIndex === THRALLS_INDEX && unitSpeed[defenderIndex] < 3) {
          damageMultiplier *= 1.33;
          log(`- ${UNIT_DESC[THRALLS_INDEX][NAME_INDEX]}, yavas dusmana +%33 hasarla saldiriyor`);
        }

        if (attackerIndex === BANSHEES_INDEX) {
          bansheesReduceRound = roundCount;
          bansheesReduceTarget = defenderIndex;
          log(`- ${UNIT_DESC[BANSHEES_INDEX][NAME_INDEX]}, ${UNIT_DESC[bansheesReduceTarget][NAME_INDEX]} hasarini %25 azaltti`);
        }
        if (bansheesReduceRound === roundCount && attackerIndex === bansheesReduceTarget) {
          damageMultiplier *= 0.75;
          log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, -%25 azalmis hasarla saldiriyor`);
        }

        if (attackerIndex === NECROMANCERS_INDEX) {
          const necromancersMultiplyPercent = Math.trunc(unitBuffs[NECROMANCERS_INDEX] * 100);
          log(`- ${UNIT_DESC[NECROMANCERS_INDEX][NAME_INDEX]}, +%${necromancersMultiplyPercent} hasarla saldiriyor`);
        }

        if (attackerIndex === GIANTS_INDEX) {
          const giantsMultiplyPercent = Math.trunc(unitBuffs[GIANTS_INDEX] * 100);
          log(`- ${UNIT_DESC[GIANTS_INDEX][NAME_INDEX]}, +%${giantsMultiplyPercent} hasarla saldiriyor`);
        }

        let lichesSplashDamage = 0;
        let witchesSplashDamage = 0;
        let rotmawsOverkillDamage = 0;

        const attackerDamage = Math.round(unitNumbers[attackerIndex] * UNIT_DESC[attackerIndex][ATTACK_INDEX] * damageMultiplier * unitBuffs[attackerIndex] + 0.001);
        unitHealth[defenderIndex] -= attackerDamage;
        log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]}, ${UNIT_DESC[defenderIndex][NAME_INDEX]} uzerine ${attackerDamage} hasar vurdu`);

        if (attackerIndex === WITCHES_INDEX && unitNumbers[WITCHES_INDEX] > 0 && roundCount % 2 === 0) {
          witchesSplashDamage = Math.round(attackerDamage * 0.25 + 0.001);
        }

        if (unitHealth[defenderIndex] <= 0) {
          if (attackerIndex === LICHES_INDEX) {
            lichesSplashDamage = Math.round(attackerDamage * 0.5 + 0.001);
          }
          if (attackerIndex === ROTMAWS_INDEX) {
            rotmawsOverkillDamage = unitHealth[defenderIndex] * -1;
          }
          unitHealth[defenderIndex] = 0;
          log(`- ${UNIT_DESC[defenderIndex][NAME_INDEX]} tamamen yok edildi`);
        }

        unitNumbers[defenderIndex] = Math.ceil(unitHealth[defenderIndex] / UNIT_DESC[defenderIndex][HEALTH_INDEX]);

        if (lichesSplashDamage > 0) {
          for (let n = 0; n < defenderOrder.length; n += 1) {
            if (unitNumbers[defenderOrder[n]] > 0 && UNIT_DESC[defenderOrder[n]][SIDE_INDEX] === "ally" && UNIT_DESC[defenderOrder[n]][POSITION_INDEX] === "rear") {
              unitHealth[defenderOrder[n]] -= lichesSplashDamage;
              log(`- ${UNIT_DESC[LICHES_INDEX][NAME_INDEX]}, ${UNIT_DESC[defenderOrder[n]][NAME_INDEX]} uzerine ${lichesSplashDamage} yayilma hasari verdi`);
              if (unitHealth[defenderOrder[n]] <= 0) {
                unitHealth[defenderOrder[n]] = 0;
                log(`- ${UNIT_DESC[defenderOrder[n]][NAME_INDEX]} tamamen yok edildi`);
              }
              unitNumbers[defenderOrder[n]] = Math.ceil(unitHealth[defenderOrder[n]] / UNIT_DESC[defenderOrder[n]][HEALTH_INDEX]);
              break;
            }
          }
        }

        if (witchesSplashDamage > 0) {
          for (let m = 0; m < UNIT_DESC.length; m += 1) {
            if (UNIT_DESC[m][SIDE_INDEX] === "enemy" && UNIT_DESC[m][POSITION_INDEX] === "rear") {
              let unitWasAlive = false;
              if (unitHealth[m] > 0) {
                unitWasAlive = true;
                log(`- ${UNIT_DESC[WITCHES_INDEX][NAME_INDEX]}, ${UNIT_DESC[m][NAME_INDEX]} uzerine ${witchesSplashDamage} yayilma hasari verdi`);
              }
              unitHealth[m] -= witchesSplashDamage;
              if (unitHealth[m] < 0) {
                unitHealth[m] = 0;
                if (unitWasAlive) {
                  log(`- ${UNIT_DESC[m][NAME_INDEX]} tamamen yok edildi`);
                }
              }
              unitNumbers[m] = Math.ceil(unitHealth[m] / UNIT_DESC[m][HEALTH_INDEX]);
            }
          }
        }

        if (rotmawsOverkillDamage > 0) {
          for (let n = 0; n < unitNumbers.length; n += 1) {
            if (unitNumbers[n] > 0 && UNIT_DESC[n][SIDE_INDEX] === "enemy") {
              unitHealth[n] -= rotmawsOverkillDamage;
              log(`- ${UNIT_DESC[ROTMAWS_INDEX][NAME_INDEX]}, ${UNIT_DESC[n][NAME_INDEX]} uzerine ${rotmawsOverkillDamage} artik (overkill) hasar verdi`);
              if (unitHealth[n] <= 0) {
                unitHealth[n] = 0;
                log(`- ${UNIT_DESC[n][NAME_INDEX]} tamamen yok edildi`);
              }
              unitNumbers[n] = Math.ceil(unitHealth[n] / UNIT_DESC[n][HEALTH_INDEX]);
              break;
            }
          }
        }

        const zombiesNumbersDiff = unitNumbersBefore[ZOMBIES_INDEX] - unitNumbers[ZOMBIES_INDEX];
        if (zombiesNumbersDiff > 0 && unitNumbers[ZOMBIES_INDEX] === 0) {
          unitNumbers[REVIVED_INDEX] = zombies;
          unitHealth[REVIVED_INDEX] = zombies * UNIT_DESC[REVIVED_INDEX][HEALTH_INDEX];
          log(`- ${UNIT_DESC[ZOMBIES_INDEX][NAME_INDEX]}, her biri 1 canla geri dirildi`);
        }

        if (attackerIndex === CULTISTS_INDEX && unitNumbers[CULTISTS_INDEX] > 0) {
          for (let n = 0; n < 50; n += 1) {
            const randomUnitIndex = randomInt(unitNumbers.length, rng);
            if (randomUnitIndex !== CULTISTS_INDEX && unitNumbers[randomUnitIndex] > 0 && UNIT_DESC[randomUnitIndex][SIDE_INDEX] === "enemy") {
              unitBuffs[randomUnitIndex] += 0.1;
              log(`- ${UNIT_DESC[CULTISTS_INDEX][NAME_INDEX]}, ${UNIT_DESC[randomUnitIndex][NAME_INDEX]} birimini +%10 hasar artisiyla guclendirdi`);
              break;
            }
          }
        }

        const corpsesNumbersDiff = unitNumbersBefore[CORPSES_INDEX] - unitNumbers[CORPSES_INDEX];
        if (corpsesNumbersDiff > 0 && unitNumbers[CORPSES_INDEX] === 0) {
          const corpsesDamage = Math.ceil(corpses * UNIT_DESC[CORPSES_INDEX][HEALTH_INDEX] * 0.2);
          unitHealth[attackerIndex] -= corpsesDamage;
          log(`- ${UNIT_DESC[CORPSES_INDEX][NAME_INDEX]}, ${UNIT_DESC[attackerIndex][NAME_INDEX]} karsisinda ${corpsesDamage} intikam hasari verdi`);
          if (unitHealth[attackerIndex] <= 0) {
            unitHealth[attackerIndex] = 0;
            log(`- ${UNIT_DESC[attackerIndex][NAME_INDEX]} tamamen yok edildi`);
          }
          unitNumbers[attackerIndex] = Math.ceil(unitHealth[attackerIndex] / UNIT_DESC[attackerIndex][HEALTH_INDEX]);
        }

        if (defenderIndex === GIANTS_INDEX && unitNumbers[GIANTS_INDEX] > 0) {
          unitBuffs[GIANTS_INDEX] += 0.05;
          log(`- ${UNIT_DESC[GIANTS_INDEX][NAME_INDEX]}, +%5 hasar biriktirdi`);
        }

        if (attackerIndex === GIANTS_INDEX) {
          unitBuffs[GIANTS_INDEX] = 1;
          log("- Kemik Izbandutun biriktirdigi hasar sifirlandi");
        }

        if (unitNumbers[NECROMANCERS_INDEX] > 0) {
          for (let m = 0; m < unitNumbers.length; m += 1) {
            if (unitNumbersBefore[m] - unitNumbers[m] > 0 && unitNumbers[m] === 0) {
              unitBuffs[NECROMANCERS_INDEX] += 0.1;
              log(`- ${UNIT_DESC[NECROMANCERS_INDEX][NAME_INDEX]}, yok edilen ${UNIT_DESC[m][NAME_INDEX]} sayesinde +%10 hasar kazandi`);
            }
          }
        }

        let detectedNextAttackerUnit = false;
        for (let l = j + 1; l < unitNumbers.length - 1; l += 1) {
          if (unitNumbers[attackerOrder[l]] > 0) {
            detectedNextAttackerUnit = true;
          }
        }

        if (!detectedNextAttackerUnit && unitNumbers[BROODMOTHERS_INDEX] > 0) {
          unitNumbers[SPIDERLINGS_INDEX] += 10;
          unitHealth[SPIDERLINGS_INDEX] += 10 * UNIT_DESC[SPIDERLINGS_INDEX][HEALTH_INDEX];
          log(`- ${UNIT_DESC[BROODMOTHERS_INDEX][NAME_INDEX]}, 10 yeni ${UNIT_DESC[SPIDERLINGS_INDEX][NAME_INDEX]} dogurdu`);
        }

        log("");
        printBattlefield(log, unitNumbers, unitHealth, defenderOrderFrontFirst, "enemy");
        log("");
        printBattlefield(log, unitNumbers, unitHealth, defenderOrderFrontFirst, "ally");
        log("--------------------------------------------------");
      }
    }

    if (!winner) {
      winner = enemyCapable ? "enemy" : "ally";
    }

    log("--------------------------------------------------");
    log("Kayip Birlikler");

    let lostUnitsTotal = 0;
    let lostBloodTotal = 0;
    const allyLosses = {};
    for (let i = BATS_INDEX; i < REVIVED_INDEX; i += 1) {
      const lostUnits = unitNumbersInitial[i] - unitNumbers[i];
      const allyKey = ALLY_UNITS[i - BATS_INDEX].key;
      allyLosses[allyKey] = lostUnits;
      if (lostUnits > 0) {
        lostUnitsTotal += lostUnits;
        const lostBlood = lostUnits * UNIT_DESC[i][BLOOD_INDEX];
        lostBloodTotal += lostBlood;
        log(`- ${String(lostUnits).padStart(3)} ${UNIT_DESC[i][NAME_INDEX].padEnd(28)} (${String(lostBlood).padStart(4)} kan)`);
      }
    }
    log("");
    log(`= ${String(lostUnitsTotal).padStart(3)} toplam ${"".padEnd(21)} (${String(lostBloodTotal).padStart(4)} kan)`);
    log("--------------------------------------------------");

    let capacity = 0;
    let usedUnitsTotal = 0;
    for (let i = BATS_INDEX; i < REVIVED_INDEX; i += 1) {
      capacity += unitNumbersInitial[i] * UNIT_DESC[i][SPACE_INDEX];
      usedUnitsTotal += unitNumbersInitial[i];
    }
    const usedPoints = calculateArmyPoints(allyCounts);
    log(`Toplam birlik kapasitesi: ${capacity}`);

    let enemyRemainingHealth = 0;
    let enemyRemainingUnits = 0;
    let allyRemainingHealth = 0;
    let allyRemainingUnits = 0;

    for (let i = 0; i < unitNumbers.length; i += 1) {
      if (UNIT_DESC[i][SIDE_INDEX] === "enemy") {
        enemyRemainingHealth += unitHealth[i];
        enemyRemainingUnits += unitNumbers[i];
      } else {
        allyRemainingHealth += unitHealth[i];
        allyRemainingUnits += unitNumbers[i];
      }
    }

    return {
      winner,
      victory: winner,
      roundCount,
      turnCount,
      lostUnitsTotal,
      lostBloodTotal,
      usedCapacity: capacity,
      usedPoints,
      usedUnitsTotal,
      allyLosses,
      enemyRemainingHealth,
      enemyRemainingUnits,
      allyRemainingHealth,
      allyRemainingUnits,
      remainingNumbers: unitNumbers.slice(),
      logText: collectLog ? logs.join("\n") : ""
    };
  }

  function getCountSignature(counts, units) {
    return units.map((unit) => counts[unit.key] || 0).join("|");
  }

  function createSeededRandom(seed) {
    let state = (seed >>> 0) || 1;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function shuffleUnits(units, random) {
    const result = [...units];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const swapIndex = Math.floor(random() * (i + 1));
      [result[i], result[swapIndex]] = [result[swapIndex], result[i]];
    }
    return result;
  }

  function scaleCounts(source, ratio) {
    const result = {};
    ALLY_UNITS.forEach((unit) => {
      const value = source[unit.key] || 0;
      if (value === 0) {
        result[unit.key] = 0;
        return;
      }
      const scaled = Math.floor(value * ratio);
      result[unit.key] = ratio > 0 && scaled === 0 ? 1 : scaled;
    });
    return result;
  }

  function fillCandidateToPointLimit(sourceCounts, availableAllyCounts, maxPoints) {
    const counts = normalizeCandidateToPointLimit(sourceCounts, maxPoints);
    if (!(maxPoints >= 0)) {
      return counts;
    }

    const priority = [...ALLY_UNITS].sort((left, right) => {
      const pointDelta = POINTS_BY_ALLY_KEY[left.key] - POINTS_BY_ALLY_KEY[right.key];
      if (pointDelta !== 0) {
        return pointDelta;
      }
      return BLOOD_BY_ALLY_KEY[left.key] - BLOOD_BY_ALLY_KEY[right.key];
    });

    let totalPoints = calculateArmyPoints(counts);
    let added = true;
    while (added) {
      added = false;
      for (const unit of priority) {
        const current = counts[unit.key] || 0;
        const max = availableAllyCounts[unit.key] || 0;
        const cost = POINTS_BY_ALLY_KEY[unit.key];
        if (current >= max || totalPoints + cost > maxPoints) {
          continue;
        }
        counts[unit.key] = current + 1;
        totalPoints += cost;
        added = true;
        break;
      }
    }

    return counts;
  }

  function buildSparsePointFilledCandidates(availableAllyCounts, maxPoints) {
    const availableUnits = ALLY_UNITS.filter((unit) => (availableAllyCounts[unit.key] || 0) > 0);
    if (availableUnits.length === 0) {
      return [];
    }

    const fillerUnit = [...availableUnits].sort((left, right) => {
      const pointDelta = POINTS_BY_ALLY_KEY[left.key] - POINTS_BY_ALLY_KEY[right.key];
      if (pointDelta !== 0) {
        return pointDelta;
      }
      return BLOOD_BY_ALLY_KEY[left.key] - BLOOD_BY_ALLY_KEY[right.key];
    })[0];

    const seedUnits = availableUnits.filter((unit) => unit.key !== fillerUnit.key);
    const partial = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
    const candidates = [];

    function collect(index, selectedTypes) {
      if (index >= seedUnits.length) {
        if (selectedTypes > 0) {
          candidates.push(fillCandidateToPointLimit(partial, availableAllyCounts, maxPoints));
        }
        return;
      }

      collect(index + 1, selectedTypes);
      if (selectedTypes >= 3) {
        return;
      }

      const unit = seedUnits[index];
      const maxCount = Math.min(2, availableAllyCounts[unit.key] || 0);
      for (let count = 1; count <= maxCount; count += 1) {
        partial[unit.key] = count;
        collect(index + 1, selectedTypes + 1);
      }
      partial[unit.key] = 0;
    }

    collect(0, 0);
    return candidates;
  }

  function buildLowTierProfileCandidates(availableAllyCounts, maxPoints) {
    const batsMax = availableAllyCounts.bats || 0;
    const ghoulsMax = availableAllyCounts.ghouls || 0;
    const thrallsMax = availableAllyCounts.thralls || 0;
    const bansheesMax = availableAllyCounts.banshees || 0;

    if (batsMax <= 0 || (ghoulsMax <= 0 && thrallsMax <= 0 && bansheesMax <= 0)) {
      return [];
    }

    const candidates = [];
    const ghoulLimit = Math.min(6, ghoulsMax, Math.floor(maxPoints / POINTS_BY_ALLY_KEY.ghouls));
    const thrallLimit = Math.min(10, thrallsMax, Math.floor(maxPoints / POINTS_BY_ALLY_KEY.thralls));
    const bansheeLimit = Math.min(6, bansheesMax, Math.floor(maxPoints / POINTS_BY_ALLY_KEY.banshees));

    for (let ghouls = 0; ghouls <= ghoulLimit; ghouls += 1) {
      for (let thralls = 0; thralls <= thrallLimit; thralls += 1) {
        for (let banshees = 0; banshees <= bansheeLimit; banshees += 1) {
          if (ghouls + thralls + banshees === 0) {
            continue;
          }

          const baseCounts = {
            bats: 0,
            ghouls,
            thralls,
            banshees,
            necromancers: 0,
            gargoyles: 0,
            witches: 0,
            rotmaws: 0
          };
          const usedPoints = calculateArmyPoints(baseCounts);
          if (usedPoints > maxPoints) {
            continue;
          }

          const maxBats = Math.min(batsMax, Math.floor((maxPoints - usedPoints) / POINTS_BY_ALLY_KEY.bats));
          const batOptions = new Set([
            maxBats,
            Math.max(0, maxBats - 1),
            Math.max(0, maxBats - 2),
            Math.max(0, maxBats - 4)
          ]);

          batOptions.forEach((bats) => {
            const candidate = {
              bats,
              ghouls,
              thralls,
              banshees,
              necromancers: 0,
              gargoyles: 0,
              witches: 0,
              rotmaws: 0
            };
            const points = calculateArmyPoints(candidate);
            if (points <= maxPoints && points >= Math.max(18, maxPoints - 24)) {
              candidates.push(candidate);
            }
          });
        }
      }
    }

    return candidates;
  }

  function buildDiversityCandidates(availableAllyCounts, maxPoints, options = {}) {
    const availableUnits = ALLY_UNITS.filter((unit) => (availableAllyCounts[unit.key] || 0) > 0);
    if (availableUnits.length === 0) {
      return [];
    }

    const candidateCount = Math.max(0, options.count || 0);
    if (candidateCount === 0) {
      return [];
    }

    const random = createSeededRandom(options.seed || 1);
    const knownSignatures = new Set(options.knownSignatures || []);
    const minPoints = Math.max(14, Math.floor(maxPoints * 0.42));
    const candidates = [];
    const maxAttempts = Math.max(candidateCount * 8, 24);

    for (let attempt = 0; attempt < maxAttempts && candidates.length < candidateCount; attempt += 1) {
      const candidate = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
      const variant = attempt % 4;
      const orderedUnits = shuffleUnits(availableUnits, random);

      if (variant === 0) {
        const pickedTypes = Math.max(1, Math.min(orderedUnits.length, 1 + Math.floor(random() * Math.min(4, orderedUnits.length))));
        orderedUnits.slice(0, pickedTypes).forEach((unit) => {
          const max = availableAllyCounts[unit.key] || 0;
          candidate[unit.key] = Math.max(1, Math.floor(max * (0.2 + random() * 0.8)));
        });
      } else if (variant === 1) {
        orderedUnits.forEach((unit, index) => {
          const max = availableAllyCounts[unit.key] || 0;
          const activationChance = index < 2 ? 0.85 : 0.55;
          if (random() <= activationChance) {
            const ratio = 0.08 + random() * random() * 0.92;
            candidate[unit.key] = Math.max(1, Math.floor(max * ratio));
          }
        });
      } else if (variant === 2) {
        const anchorCount = Math.max(1, Math.min(orderedUnits.length, 2 + Math.floor(random() * Math.min(3, orderedUnits.length))));
        orderedUnits.slice(0, anchorCount).forEach((unit, index) => {
          const max = availableAllyCounts[unit.key] || 0;
          const ratio = index === 0 ? 0.55 + random() * 0.45 : 0.15 + random() * 0.45;
          candidate[unit.key] = Math.max(1, Math.floor(max * Math.min(ratio, 1)));
        });
      } else {
        orderedUnits.forEach((unit, index) => {
          const max = availableAllyCounts[unit.key] || 0;
          if (index === 0) {
            candidate[unit.key] = max;
            return;
          }
          const roll = random();
          if (roll >= 0.72) {
            candidate[unit.key] = Math.max(1, Math.floor(max * (0.45 + random() * 0.55)));
          } else if (roll >= 0.44) {
            candidate[unit.key] = Math.max(1, Math.floor(max * (0.08 + random() * 0.22)));
          }
        });
      }

      if (calculateArmyPoints(candidate) < minPoints) {
        orderedUnits.slice(0, Math.max(1, Math.min(2, orderedUnits.length))).forEach((unit) => {
          const max = availableAllyCounts[unit.key] || 0;
          candidate[unit.key] = Math.max(candidate[unit.key] || 0, Math.max(1, Math.floor(max * (0.35 + random() * 0.65))));
        });
      }

      const normalized = normalizeCandidateToPointLimit(candidate, maxPoints);
      const finalCandidate = calculateArmyPoints(normalized) < minPoints
        ? fillCandidateToPointLimit(normalized, availableAllyCounts, maxPoints)
        : normalized;

      const signature = getCountSignature(finalCandidate, ALLY_UNITS);
      if (knownSignatures.has(signature)) {
        continue;
      }

      knownSignatures.add(signature);
      candidates.push(finalCandidate);
    }

    return candidates;
  }

  function compareEvaluations(a, b) {
    if (a.feasible !== b.feasible) {
      return a.feasible ? -1 : 1;
    }
    if (a.feasible) {
      if (a.winRate !== b.winRate) {
        return b.winRate - a.winRate;
      }
      if (a.avgLostBlood !== b.avgLostBlood) {
        return a.avgLostBlood - b.avgLostBlood;
      }
      if (a.avgUsedPoints !== b.avgUsedPoints) {
        return a.avgUsedPoints - b.avgUsedPoints;
      }
      if (a.avgUsedCapacity !== b.avgUsedCapacity) {
        return a.avgUsedCapacity - b.avgUsedCapacity;
      }
      if (a.avgLostUnits !== b.avgLostUnits) {
        return a.avgLostUnits - b.avgLostUnits;
      }
      return a.signature.localeCompare(b.signature);
    }

    if (a.winRate !== b.winRate) {
      return b.winRate - a.winRate;
    }
    if (a.avgEnemyRemainingHealth !== b.avgEnemyRemainingHealth) {
      return a.avgEnemyRemainingHealth - b.avgEnemyRemainingHealth;
    }
    if (a.avgEnemyRemainingUnits !== b.avgEnemyRemainingUnits) {
      return a.avgEnemyRemainingUnits - b.avgEnemyRemainingUnits;
    }
    return a.signature.localeCompare(b.signature);
  }

  function buildMutationSteps(current, max) {
    const coarse = Math.max(1, Math.ceil(max * 0.15));
    const medium = Math.max(1, Math.ceil(current * 0.25));
    return new Set([
      Math.max(0, current - coarse),
      Math.max(0, current - medium),
      Math.max(0, current - 1),
      Math.min(max, current + 1),
      Math.min(max, current + medium),
      Math.min(max, current + coarse)
    ]);
  }

  function getNeighborCandidates(baseCounts, availableAllyCounts, maxPoints) {
    const neighbors = [];

    ALLY_UNITS.forEach((unit) => {
      const current = baseCounts[unit.key] || 0;
      const max = availableAllyCounts[unit.key] || 0;
      buildMutationSteps(current, max).forEach((nextValue) => {
        if (nextValue === current) {
          return;
        }
        const candidate = cloneCounts(baseCounts, ALLY_UNITS);
        candidate[unit.key] = nextValue;
        neighbors.push(normalizeCandidateToPointLimit(candidate, maxPoints));
      });
    });

    ALLY_UNITS.forEach((reduceUnit) => {
      const currentReduce = baseCounts[reduceUnit.key] || 0;
      if (currentReduce <= 0) {
        return;
      }
      ALLY_UNITS.forEach((increaseUnit) => {
        if (reduceUnit.key === increaseUnit.key) {
          return;
        }
        const currentIncrease = baseCounts[increaseUnit.key] || 0;
        const maxIncrease = availableAllyCounts[increaseUnit.key] || 0;
        if (currentIncrease >= maxIncrease) {
          return;
        }

        const candidate = cloneCounts(baseCounts, ALLY_UNITS);
        candidate[reduceUnit.key] = currentReduce - 1;
        candidate[increaseUnit.key] = currentIncrease + 1;
        neighbors.push(normalizeCandidateToPointLimit(candidate, maxPoints));
      });
    });

    return neighbors;
  }

  function optimizeArmyUsage(availableAllyCounts, enemyCounts, options = {}) {
    const maxPoints = options.maxPoints ?? Number.POSITIVE_INFINITY;
    const minWinRate = options.minWinRate || 0.75;
    const trialCount = options.trialCount || 6;
    const fullArmyTrials = options.fullArmyTrials || 12;
    const beamWidth = options.beamWidth || 10;
    const maxIterations = options.maxIterations || 4;
    const eliteCount = options.eliteCount || Math.max(4, Math.min(beamWidth, 8));
    const stabilityTrials = options.stabilityTrials || Math.max(fullArmyTrials, trialCount * 3);
    const baseSeed = options.baseSeed || 42042;
    const diversityMode = Boolean(options.diversityMode);
    const knownSignatures = new Set(options.knownSignatures || []);
    const diversityCandidateCount = diversityMode
      ? Math.max(18, options.diversityCandidateCount || beamWidth * 3)
      : 0;
    const evaluations = new Map();
    const uniqueSignatures = new Set();
    let simulationRuns = 0;
    const initialCandidates = [];

    initialCandidates.push(normalizeCandidateToPointLimit(availableAllyCounts, maxPoints));
    [0.3, 0.4, 0.5, 0.6, 0.72, 0.84, 1].forEach((ratio) => {
      initialCandidates.push(normalizeCandidateToPointLimit(scaleCounts(availableAllyCounts, ratio), maxPoints));
    });

    ALLY_UNITS.forEach((unit) => {
      [0, 0.35, 0.65].forEach((ratio) => {
        const candidate = cloneCounts(availableAllyCounts, ALLY_UNITS);
        const source = availableAllyCounts[unit.key] || 0;
        candidate[unit.key] = source === 0 ? 0 : Math.max(0, Math.floor(source * ratio));
        initialCandidates.push(normalizeCandidateToPointLimit(candidate, maxPoints));
      });
    });

    for (let i = 0; i < 16; i += 1) {
      const candidate = {};
      ALLY_UNITS.forEach((unit, index) => {
        const max = availableAllyCounts[unit.key] || 0;
        if (max === 0) {
          candidate[unit.key] = 0;
          return;
        }
        const ratioSeed = ((i + 1) * (index + 3) * 17) % 100;
        const ratio = 0.25 + ratioSeed / 140;
        candidate[unit.key] = Math.max(0, Math.min(max, Math.floor(max * Math.min(ratio, 1))));
      });
      initialCandidates.push(normalizeCandidateToPointLimit(candidate, maxPoints));
    }

    initialCandidates.push(...buildSparsePointFilledCandidates(availableAllyCounts, maxPoints));
    initialCandidates.push(...buildLowTierProfileCandidates(availableAllyCounts, maxPoints));
    if (diversityMode) {
      initialCandidates.push(...buildDiversityCandidates(availableAllyCounts, maxPoints, {
        count: diversityCandidateCount,
        seed: baseSeed + 17041,
        knownSignatures
      }));
    }

    function evaluateCandidate(counts, localTrialCount = trialCount) {
      const signature = getCountSignature(counts, ALLY_UNITS);
      uniqueSignatures.add(signature);
      if (evaluations.has(`${signature}:${localTrialCount}`)) {
        return evaluations.get(`${signature}:${localTrialCount}`);
      }

      let wins = 0;
      let winLostBloodSum = 0;
      let winLostUnitsSum = 0;
      let usedCapacitySum = 0;
      let usedPointsSum = 0;
      let enemyRemainingHealthSum = 0;
      let enemyRemainingUnitsSum = 0;
      const allyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
      const winningSeeds = [];

      for (let trial = 0; trial < localTrialCount; trial += 1) {
        simulationRuns += 1;
        const seed = baseSeed + trial * 977 + signature.length * 13;
        const result = simulateBattle(enemyCounts, counts, { seed, collectLog: false });
        usedCapacitySum += result.usedCapacity;
        usedPointsSum += result.usedPoints;
        enemyRemainingHealthSum += result.enemyRemainingHealth;
        enemyRemainingUnitsSum += result.enemyRemainingUnits;
        if (result.winner === "ally") {
          wins += 1;
          winLostBloodSum += result.lostBloodTotal;
          winLostUnitsSum += result.lostUnitsTotal;
          ALLY_UNITS.forEach((unit) => {
            allyLossesSum[unit.key] += result.allyLosses?.[unit.key] || 0;
          });
          winningSeeds.push(seed);
        }
      }

      const winRate = wins / localTrialCount;
      const evaluation = {
        counts: cloneCounts(counts, ALLY_UNITS),
        signature,
        trials: localTrialCount,
        wins,
        winRate,
        feasible: winRate >= minWinRate,
        avgLostBlood: wins > 0 ? winLostBloodSum / wins : Number.POSITIVE_INFINITY,
        avgLostUnits: wins > 0 ? winLostUnitsSum / wins : Number.POSITIVE_INFINITY,
        avgUsedCapacity: usedCapacitySum / localTrialCount,
        avgUsedPoints: usedPointsSum / localTrialCount,
        avgEnemyRemainingHealth: enemyRemainingHealthSum / localTrialCount,
        avgEnemyRemainingUnits: enemyRemainingUnitsSum / localTrialCount,
        avgAllyLosses: Object.fromEntries(
          ALLY_UNITS.map((unit) => [unit.key, wins > 0 ? allyLossesSum[unit.key] / wins : 0])
        ),
        winningSeeds
      };

      evaluations.set(`${signature}:${localTrialCount}`, evaluation);
      return evaluation;
    }

    function collectTopEvaluations(candidateList, localTrialCount = trialCount) {
      const unique = new Map();
      candidateList.forEach((candidate) => {
        unique.set(getCountSignature(candidate, ALLY_UNITS), candidate);
      });
      return [...unique.values()]
        .map((candidate) => evaluateCandidate(candidate, localTrialCount))
        .sort(compareEvaluations);
    }

    function sanitizeEvaluation(entry) {
      if (!entry) {
        return null;
      }
      return {
        counts: cloneCounts(entry.counts, ALLY_UNITS),
        signature: entry.signature,
        trials: entry.trials,
        wins: entry.wins,
        winRate: entry.winRate,
        feasible: entry.feasible,
        avgLostBlood: entry.avgLostBlood,
        avgLostUnits: entry.avgLostUnits,
        avgUsedCapacity: entry.avgUsedCapacity,
        avgUsedPoints: entry.avgUsedPoints,
        avgEnemyRemainingHealth: entry.avgEnemyRemainingHealth,
        avgEnemyRemainingUnits: entry.avgEnemyRemainingUnits,
        avgAllyLosses: { ...(entry.avgAllyLosses || {}) },
        winningSeeds: [...(entry.winningSeeds || [])]
      };
    }

    function getRoundedLossSignature(entry) {
      if (!entry || !entry.avgAllyLosses) {
        return "none";
      }

      const parts = ALLY_UNITS.map((unit) => {
        const rounded = Math.max(0, Math.round(entry.avgAllyLosses[unit.key] || 0));
        return rounded > 0 ? `${unit.key}:${rounded}` : null;
      }).filter(Boolean);

      return parts.length > 0 ? parts.join("|") : "none";
    }

    function collectBestUniqueEvaluations(limit) {
      const unique = new Map();
      evaluations.forEach((entry) => {
        const existing = unique.get(entry.signature);
        if (!existing || compareEvaluations(entry, existing) < 0) {
          unique.set(entry.signature, entry);
        }
      });
      return [...unique.values()]
        .sort(compareEvaluations)
        .slice(0, limit)
        .map(sanitizeEvaluation);
    }

    function collectBestLossPatternEvaluations(limit) {
      const unique = new Map();
      evaluations.forEach((entry) => {
        const lossSignature = getRoundedLossSignature(entry);
        const existing = unique.get(lossSignature);
        if (!existing || compareEvaluations(entry, existing) < 0) {
          unique.set(lossSignature, entry);
        }
      });
      return [...unique.values()]
        .sort(compareEvaluations)
        .slice(0, limit)
        .map(sanitizeEvaluation);
    }

    let ranked = collectTopEvaluations(initialCandidates);
    let best = ranked[0];
    let beam = ranked.slice(0, beamWidth);
    const elitePool = [...beam];

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const mutated = [];
      beam.forEach((entry) => {
        mutated.push(...getNeighborCandidates(entry.counts, availableAllyCounts, maxPoints));
      });

      ranked = collectTopEvaluations(mutated);
      if (ranked.length === 0) {
        break;
      }

      const candidateBest = ranked[0];
      if (compareEvaluations(candidateBest, best) < 0) {
        best = candidateBest;
      }

      beam = [...beam, ...ranked].sort(compareEvaluations).slice(0, beamWidth);
      elitePool.push(...beam);
    }

    const eliteCandidates = [...elitePool]
      .sort(compareEvaluations)
      .slice(0, eliteCount);

    const unitPriority = [...ALLY_UNITS].sort((left, right) => BLOOD_BY_ALLY_KEY[right.key] - BLOOD_BY_ALLY_KEY[left.key]);

    function refineEvaluation(entry) {
      let refined = entry;
      let improved = true;

      while (improved) {
        improved = false;
        for (const unit of unitPriority) {
          const currentCount = refined.counts[unit.key];
          if (currentCount === 0) {
            continue;
          }

          const testValues = Array.from(new Set([
            0,
            Math.max(0, Math.floor(currentCount * 0.5)),
            Math.max(0, currentCount - Math.max(1, Math.ceil(currentCount * 0.2))),
            Math.max(0, currentCount - 1)
          ])).sort((a, b) => a - b);

          for (const nextValue of testValues) {
            if (nextValue >= currentCount) {
              continue;
            }
            const candidate = cloneCounts(refined.counts, ALLY_UNITS);
            candidate[unit.key] = nextValue;
            const evaluation = evaluateCandidate(normalizeCandidateToPointLimit(candidate, maxPoints));
            if (evaluation.feasible && compareEvaluations(evaluation, refined) < 0) {
              refined = evaluation;
              improved = true;
              break;
            }
          }

          if (improved) {
            break;
          }
        }
      }

      const localNeighbors = collectTopEvaluations(
        getNeighborCandidates(refined.counts, availableAllyCounts, maxPoints),
        trialCount
      );
      if (localNeighbors.length > 0 && compareEvaluations(localNeighbors[0], refined) < 0) {
        return refineEvaluation(localNeighbors[0]);
      }

      return refined;
    }

    const refinedElite = eliteCandidates
      .map((entry) => entry.feasible ? refineEvaluation(entry) : entry)
      .sort(compareEvaluations);

    if (refinedElite.length > 0 && compareEvaluations(refinedElite[0], best) < 0) {
      best = refinedElite[0];
    }

    const stabilityCandidates = [...beam, ...ranked, ...refinedElite, best]
      .filter(Boolean)
      .sort(compareEvaluations)
      .slice(0, Math.max(eliteCount, 6));

    const stableRanked = collectTopEvaluations(
      stabilityCandidates.map((entry) => entry.counts),
      stabilityTrials
    );

    if (stableRanked.length > 0 && compareEvaluations(stableRanked[0], best) < 0) {
      best = stableRanked[0];
    }

    const fullArmyEvaluation = evaluateCandidate(normalizeCandidateToPointLimit(availableAllyCounts, maxPoints), fullArmyTrials);
    const stableFullArmyEvaluation = evaluateCandidate(
      normalizeCandidateToPointLimit(availableAllyCounts, maxPoints),
      Math.max(fullArmyTrials, stabilityTrials)
    );
    const fallbackEvaluation = compareEvaluations(stableFullArmyEvaluation, fullArmyEvaluation) < 0
      ? stableFullArmyEvaluation
      : fullArmyEvaluation;
    const finalEvaluation = best.feasible ? best : fallbackEvaluation;

    let sampleBattle = null;
    if (finalEvaluation.winningSeeds.length > 0) {
      sampleBattle = simulateBattle(enemyCounts, finalEvaluation.counts, {
        seed: finalEvaluation.winningSeeds[0],
        collectLog: true
      });
    } else {
      sampleBattle = simulateBattle(enemyCounts, finalEvaluation.counts, {
        seed: baseSeed + 999,
        collectLog: true
      });
    }

    const topCandidatePool = new Map();
    [...collectBestUniqueEvaluations(80), ...collectBestLossPatternEvaluations(80)].forEach((entry) => {
      if (!entry) {
        return;
      }
      const existing = topCandidatePool.get(entry.signature);
      if (!existing || compareEvaluations(entry, existing) < 0) {
        topCandidatePool.set(entry.signature, entry);
      }
    });

    return {
      possible: best.feasible,
      recommendation: best.feasible ? best : null,
      fallback: best.feasible ? null : fallbackEvaluation,
      fullArmyEvaluation,
      topCandidates: [...topCandidatePool.values()].sort(compareEvaluations).slice(0, 120),
      searchedCandidates: evaluations.size,
      uniqueCandidateCount: uniqueSignatures.size,
      uniqueCandidateSignatures: [...uniqueSignatures],
      simulationRuns,
      sampleBattle
    };
  }

  globalScope.BattleCore = {
    ENEMY_UNITS,
    ALLY_UNITS,
    UNIT_DESC,
    POINTS_BY_ALLY_KEY,
    parseCount,
    cloneCounts,
    calculateArmyPoints,
    getStagePointLimit,
    normalizeCandidateToPointLimit,
    simulateBattle,
    optimizeArmyUsage,
    BLOOD_BY_ALLY_KEY
  };
})(typeof window !== "undefined" ? window : globalThis);
