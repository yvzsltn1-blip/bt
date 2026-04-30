"use strict";

(function attachBattleCore(globalScope) {
  const ENEMY_UNITS = [
    { key: "skeletons", label: "Iskelet (T1)", sample: 0 },
    { key: "zombies", label: "Zombi (T2)", sample: 14 },
    { key: "cultists", label: "Tarikatci (T3)", sample: 3 },
    { key: "bonewings", label: "Kemik Kanat (T4)", sample: 29 },
    { key: "corpses", label: "Sismis Ceset (T5)", sample: 21 },
    { key: "wraiths", label: "Hayalet (T6)", sample: 15 },
    { key: "revenants", label: "Hortlak (T7)", sample: 11 },
    { key: "giants", label: "Kemik Dev (T8)", sample: 9 },
    { key: "broodmothers", label: "Yavrulayan Ana (T9)", sample: 4 },
    { key: "liches", label: "Lich (T10)", sample: 5 }
  ];

  const ALLY_UNITS = [
    { key: "bats", label: "Yarasa (T1)", sample: 69 },
    { key: "ghouls", label: "Gulyabani (T2)", sample: 91 },
    { key: "thralls", label: "Vampir Kole (T3)", sample: 60 },
    { key: "banshees", label: "Bansi (T4)", sample: 5 },
    { key: "necromancers", label: "Nekromant (T5)", sample: 1 },
    { key: "gargoyles", label: "Gargoyl (T6)", sample: 14 },
    { key: "witches", label: "Kan Cadisi (T7)", sample: 3 },
    { key: "rotmaws", label: "Curuk Cene (T8)", sample: 2 }
  ];

  const ALLY_POINT_COSTS = [2, 3, 4, 7, 10, 15, 18, 30];

  const UNIT_DESC = [
    ["Iskeletler (T1)", "enemy", "brute", "front", 3, 4, 3, 0, 0],
    ["Zombiler (T2)", "enemy", "brute", "front", 2, 7, 2, 0, 0],
    ["Olumsuz Tarikatcilar (T3)", "enemy", "occult", "rear", 5, 1, 1, 0, 0],
    ["Kemik Kanatlar (T4)", "enemy", "occult", "rear", 6, 3, 4, 0, 0],
    ["Sismis Cesetler (T5)", "enemy", "monster", "front", 1, 10, 1, 0, 0],
    ["Hayaletler (T6)", "enemy", "occult", "rear", 7, 2, 4, 0, 0],
    ["Hortlaklar (T7)", "enemy", "brute", "front", 8, 12, 4, 0, 0],
    ["Kemik Devler (T8)", "enemy", "monster", "front", 10, 25, 1, 0, 0],
    ["Yavrulayan Analar (T9)", "enemy", "monster", "rear", 9, 18, 2, 0, 0],
    ["Lichler (T10)", "enemy", "occult", "rear", 40, 25, 3, 0, 0],
    ["Yarasalar (T1)", "ally", "brute", "rear", 8, 2, 5, 2, 10],
    ["Gulyabaniler (T2)", "ally", "brute", "front", 3, 5, 2, 3, 15],
    ["Vampir Koleler (T3)", "ally", "occult", "front", 6, 6, 4, 4, 20],
    ["Bansiler (T4)", "ally", "monster", "rear", 7, 4, 4, 7, 35],
    ["Nekromantlar (T5)", "ally", "occult", "rear", 9, 5, 2, 10, 50],
    ["Gargoyller (T6)", "ally", "monster", "front", 12, 12, 3, 15, 75],
    ["Kan Cadilari (T7)", "ally", "occult", "rear", 14, 8, 3, 18, 90],
    ["Curuk Ceneler (T8)", "ally", "monster", "front", 30, 90, 1, 30, 150],
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

  function getDefenderOrderForAttacker(attackerIndex, unitNumbers, unitHealth, defenderOrderFrontFirst, defenderOrderRearFirst, roundCount) {
    if (attackerIndex === BONEWINGS_INDEX || attackerIndex === BANSHEES_INDEX) {
      return defenderOrderRearFirst;
    }

    if (
      attackerIndex === WRAITHS_INDEX &&
      roundCount >= 2 &&
      unitNumbers[GHOULS_INDEX] > 0 &&
      unitNumbers[GHOULS_INDEX] < unitNumbers[WRAITHS_INDEX] &&
      unitNumbers[BANSHEES_INDEX] > 0
    ) {
      const canKillBanshees =
        unitNumbers[WRAITHS_INDEX] * UNIT_DESC[WRAITHS_INDEX][ATTACK_INDEX] >= unitHealth[BANSHEES_INDEX];
      if (canKillBanshees) {
        return [BANSHEES_INDEX, ...defenderOrderRearFirst.filter((idx) => idx !== BANSHEES_INDEX)];
      }
    }

    return defenderOrderFrontFirst;
  }

  function findDefenderForAttacker(attackerIndex, unitNumbers, unitHealth, unitSpeed, defenderOrderFrontFirst, defenderOrderRearFirst, roundCount) {
    const attackerSide = UNIT_DESC[attackerIndex][SIDE_INDEX];
    const defenderSide = attackerSide === "ally" ? "enemy" : "ally";
    const defenderOrder = getDefenderOrderForAttacker(
      attackerIndex,
      unitNumbers,
      unitHealth,
      defenderOrderFrontFirst,
      defenderOrderRearFirst,
      roundCount
    );

    const prioritizeRear = defenderOrder === defenderOrderRearFirst;
    let bestOrderRank = Number.POSITIVE_INFINITY;
    let bestDefenderIndex = -1;
    let bestPositionRank = Number.POSITIVE_INFINITY;
    let bestSpeed = Number.POSITIVE_INFINITY;
    let bestCount = -1;

    for (let i = 0; i < defenderOrder.length; i += 1) {
      const defenderIndex = defenderOrder[i];
      if (unitNumbers[defenderIndex] <= 0 || UNIT_DESC[defenderIndex][SIDE_INDEX] !== defenderSide) {
        continue;
      }

      const defenderPosition = UNIT_DESC[defenderIndex][POSITION_INDEX];
      const positionRank = prioritizeRear
        ? (defenderPosition === "rear" ? 0 : 1)
        : (defenderPosition === "front" ? 0 : 1);
      const speed = unitSpeed[defenderIndex];
      const count = unitNumbers[defenderIndex];

      const isBetter =
        positionRank < bestPositionRank ||
        (positionRank === bestPositionRank && speed < bestSpeed) ||
        (positionRank === bestPositionRank && speed === bestSpeed && count > bestCount) ||
        (positionRank === bestPositionRank && speed === bestSpeed && count === bestCount && i < bestOrderRank);

      if (isBetter) {
        bestDefenderIndex = defenderIndex;
        bestPositionRank = positionRank;
        bestSpeed = speed;
        bestCount = count;
        bestOrderRank = i;
      }
    }

    return { defenderIndex: bestDefenderIndex, defenderOrder };
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

  function ceilCombatValue(value) {
    return Math.ceil(Math.max(0, value) - 1e-9);
  }

  function bannerLine(text) {
    const padded = "  " + text + "  ";
    const total = 60;
    const sides = Math.max(2, total - padded.length);
    const left = Math.floor(sides / 2);
    const right = sides - left;
    return "═".repeat(left) + padded + "═".repeat(right);
  }

  function formatUnitLine(count, name, hp, attack) {
    const totalAttack = count * attack;
    return `   ${String(count).padStart(3)}  ${name.padEnd(26)}  ${String(hp).padStart(4)} can   ${String(attack).padStart(3)} atk   ${String(totalAttack).padStart(5)} toplam atk`;
  }

  function printBattlefield(log, unitNumbers, unitHealth, order, side) {
    const sectionLabel = side === "enemy" ? "DUSMAN SAFLARI" : "MUTTEFIK SAFLARI";
    const totalLabel = side === "enemy" ? "Dusman toplam atak" : "Muttefik toplam atak";
    log(sectionLabel);
    let sideTotalAttack = 0;
    if (side === "enemy") {
      for (let i = order.length - 1; i >= 0; i -= 1) {
        const index = order[i];
        if (unitNumbers[index] > 0 && UNIT_DESC[index][SIDE_INDEX] === side) {
          log(formatUnitLine(unitNumbers[index], UNIT_DESC[index][NAME_INDEX], unitHealth[index], UNIT_DESC[index][ATTACK_INDEX]));
          sideTotalAttack += unitNumbers[index] * UNIT_DESC[index][ATTACK_INDEX];
        }
      }
    } else {
      for (let i = 0; i < order.length; i += 1) {
        const index = order[i];
        if (unitNumbers[index] > 0 && UNIT_DESC[index][SIDE_INDEX] === side) {
          log(formatUnitLine(unitNumbers[index], UNIT_DESC[index][NAME_INDEX], unitHealth[index], UNIT_DESC[index][ATTACK_INDEX]));
          sideTotalAttack += unitNumbers[index] * UNIT_DESC[index][ATTACK_INDEX];
        }
      }
    }
    log(`   ─ ${totalLabel}: ${sideTotalAttack}`);
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

    log("");
    log(bannerLine("RAUND 0"));
    log("                  Baslangic muharebe duzeni");
    log("");
    printBattlefield(log, unitNumbers, unitHealth, defenderOrderFrontFirst, "enemy");
    log("");
    printBattlefield(log, unitNumbers, unitHealth, defenderOrderFrontFirst, "ally");
    log("");

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

      orders = buildOrders(unitSpeed);
      attackerOrder = orders.attackerOrder;
      defenderOrderFrontFirst = orders.defenderOrderFrontFirst;
      defenderOrderRearFirst = orders.defenderOrderRearFirst;

      log("");
      log(bannerLine(`RAUND ${roundCount}`));
      log("");

      let bansheesReduceRound = -1;
      let bansheesReduceTarget = -1;
      let gargoylesReactiveReduceEvent = false;
      let gargoylesReactiveReduceEnemyIndex = -1;

      if (unitNumbers[GARGOYLES_INDEX] > 0) {
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
          const target = findDefenderForAttacker(
            attackerIndex,
            unitNumbers,
            unitHealth,
            unitSpeed,
            defenderOrderFrontFirst,
            defenderOrderRearFirst,
            roundCount
          );
          defenderIndex = target.defenderIndex;
          defenderOrder = target.defenderOrder;
          foundDefender = defenderIndex !== -1;
        }

        if (!foundDefender) {
          continue;
        }

        turnCount += 1;
        log(`Hamle ${turnCount}`);

        let damageMultiplier = 1;
        const attackerType = UNIT_DESC[attackerIndex][TYPE_INDEX];
        const defenderType = UNIT_DESC[defenderIndex][TYPE_INDEX];

        if (unitNumbers[REVENANTS_INDEX] > 0) {
          if (UNIT_DESC[attackerIndex][SIDE_INDEX] === "ally" && UNIT_DESC[attackerIndex][POSITION_INDEX] === "rear") {
            log(`- ${UNIT_DESC[REVENANTS_INDEX][NAME_INDEX]}, ${UNIT_DESC[attackerIndex][NAME_INDEX]} hasarini %15 azaltiyor`);
          }
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

        const attackerDamage = ceilCombatValue(
          unitNumbers[attackerIndex] * UNIT_DESC[attackerIndex][ATTACK_INDEX] * damageMultiplier * unitBuffs[attackerIndex]
        );
        unitHealth[defenderIndex] -= attackerDamage;
        const totalDamageMultiplier = damageMultiplier * unitBuffs[attackerIndex];
        const multiplierText = Math.abs(totalDamageMultiplier - 1) < 1e-9 ? "" : ` × ${totalDamageMultiplier.toFixed(2)} carpan`;
        log(`  ${UNIT_DESC[attackerIndex][NAME_INDEX]} → ${UNIT_DESC[defenderIndex][NAME_INDEX]}`);
        log(`     Hesap: ${unitNumbers[attackerIndex]} birim × ${UNIT_DESC[attackerIndex][ATTACK_INDEX]} atk${multiplierText} = ${attackerDamage} hasar`);

        if (
          defenderIndex === GARGOYLES_INDEX &&
          UNIT_DESC[attackerIndex][SIDE_INDEX] === "enemy"
        ) {
          unitSpeed[attackerIndex] -= 2;
          gargoylesReactiveReduceEnemyIndex = attackerIndex;
          gargoylesReactiveReduceEvent = true;
          orders = buildOrders(unitSpeed);
          defenderOrderFrontFirst = orders.defenderOrderFrontFirst;
          defenderOrderRearFirst = orders.defenderOrderRearFirst;
        }

        if (gargoylesReactiveReduceEvent) {
          log(`- ${UNIT_DESC[GARGOYLES_INDEX][NAME_INDEX]}, kendisine saldiran ${UNIT_DESC[gargoylesReactiveReduceEnemyIndex][NAME_INDEX]} hizini 2 azaltti; ${UNIT_DESC[gargoylesReactiveReduceEnemyIndex][NAME_INDEX]} hizi artik ${unitSpeed[gargoylesReactiveReduceEnemyIndex]}`);
          gargoylesReactiveReduceEvent = false;
        }

        if (attackerIndex === WITCHES_INDEX && unitNumbers[WITCHES_INDEX] > 0 && roundCount % 2 === 0) {
          witchesSplashDamage = ceilCombatValue(attackerDamage * 0.25);
        }

        if (unitHealth[defenderIndex] <= 0) {
          if (attackerIndex === LICHES_INDEX) {
            lichesSplashDamage = ceilCombatValue(attackerDamage * 0.5);
          }
          if (attackerIndex === ROTMAWS_INDEX) {
            rotmawsOverkillDamage = unitHealth[defenderIndex] * -1;
          }
          unitHealth[defenderIndex] = 0;
          log(`     ↳ ${UNIT_DESC[defenderIndex][NAME_INDEX]} tamamen yok edildi`);
        }

        if (defenderIndex === REVIVED_INDEX) {
          if (unitHealth[defenderIndex] > 0) {
            const baseHp = UNIT_DESC[ZOMBIES_INDEX][HEALTH_INDEX];
            unitNumbers[defenderIndex] = Math.ceil(unitHealth[defenderIndex] / baseHp);
          } else {
            unitNumbers[defenderIndex] = 0;
          }
        } else {
          unitNumbers[defenderIndex] = Math.ceil(unitHealth[defenderIndex] / UNIT_DESC[defenderIndex][HEALTH_INDEX]);
        }

        if (unitNumbers[defenderIndex] > 0) {
          const defenderLost = unitNumbersBefore[defenderIndex] - unitNumbers[defenderIndex];
          if (defenderLost > 0) {
            log(`     ↳ ${UNIT_DESC[defenderIndex][NAME_INDEX]}: ${defenderLost} birim kaybetti, ${unitNumbers[defenderIndex]} birim / ${unitHealth[defenderIndex]} can kaldi`);
          } else {
            log(`     ↳ ${UNIT_DESC[defenderIndex][NAME_INDEX]}: ${unitNumbers[defenderIndex]} birim / ${unitHealth[defenderIndex]} can kaldi (sadece can kaybi)`);
          }
        }

        if (lichesSplashDamage > 0) {
          for (let n = 0; n < defenderOrder.length; n += 1) {
            if (unitNumbers[defenderOrder[n]] > 0 && UNIT_DESC[defenderOrder[n]][SIDE_INDEX] === "ally" && UNIT_DESC[defenderOrder[n]][POSITION_INDEX] === "rear") {
              unitHealth[defenderOrder[n]] -= lichesSplashDamage;
              log(`     ↳ ${UNIT_DESC[LICHES_INDEX][NAME_INDEX]}, ${UNIT_DESC[defenderOrder[n]][NAME_INDEX]} uzerine ${lichesSplashDamage} yayilma hasari verdi`);
              if (unitHealth[defenderOrder[n]] <= 0) {
                unitHealth[defenderOrder[n]] = 0;
                log(`     ↳ ${UNIT_DESC[defenderOrder[n]][NAME_INDEX]} tamamen yok edildi`);
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
                log(`     ↳ ${UNIT_DESC[WITCHES_INDEX][NAME_INDEX]}, ${UNIT_DESC[m][NAME_INDEX]} uzerine ${witchesSplashDamage} yayilma hasari verdi`);
              }
              unitHealth[m] -= witchesSplashDamage;
              if (unitHealth[m] < 0) {
                unitHealth[m] = 0;
                if (unitWasAlive) {
                  log(`     ↳ ${UNIT_DESC[m][NAME_INDEX]} tamamen yok edildi`);
                }
              }
              unitNumbers[m] = Math.ceil(unitHealth[m] / UNIT_DESC[m][HEALTH_INDEX]);
            }
          }
        }

        if (rotmawsOverkillDamage > 0) {
          const nextTarget = findDefenderForAttacker(
            attackerIndex,
            unitNumbers,
            unitHealth,
            defenderOrderFrontFirst,
            defenderOrderRearFirst,
            roundCount
          );
          if (nextTarget.defenderIndex !== -1) {
            const nextTargetIndex = nextTarget.defenderIndex;
            unitHealth[nextTargetIndex] -= rotmawsOverkillDamage;
            log(`     ↳ ${UNIT_DESC[ROTMAWS_INDEX][NAME_INDEX]}, ${UNIT_DESC[nextTargetIndex][NAME_INDEX]} uzerine ${rotmawsOverkillDamage} artik (overkill) hasar verdi`);
            if (unitHealth[nextTargetIndex] <= 0) {
              unitHealth[nextTargetIndex] = 0;
              log(`     ↳ ${UNIT_DESC[nextTargetIndex][NAME_INDEX]} tamamen yok edildi`);
            }
            unitNumbers[nextTargetIndex] = Math.ceil(unitHealth[nextTargetIndex] / UNIT_DESC[nextTargetIndex][HEALTH_INDEX]);
          }
        }

        const zombiesNumbersDiff = unitNumbersBefore[ZOMBIES_INDEX] - unitNumbers[ZOMBIES_INDEX];
        if (zombiesNumbersDiff > 0 && unitNumbers[ZOMBIES_INDEX] === 0) {
          unitNumbers[REVIVED_INDEX] = zombies;
          unitHealth[REVIVED_INDEX] = zombies * UNIT_DESC[REVIVED_INDEX][HEALTH_INDEX];
          // Revived zombies keep any speed penalties the original stack had accumulated.
          unitSpeed[REVIVED_INDEX] = unitSpeed[ZOMBIES_INDEX];
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
          log(`     ↳ ${UNIT_DESC[CORPSES_INDEX][NAME_INDEX]}, ${UNIT_DESC[attackerIndex][NAME_INDEX]} karsisinda ${corpsesDamage} intikam hasari verdi`);
          if (unitHealth[attackerIndex] <= 0) {
            unitHealth[attackerIndex] = 0;
            log(`     ↳ ${UNIT_DESC[attackerIndex][NAME_INDEX]} tamamen yok edildi`);
          }
          unitNumbers[attackerIndex] = Math.ceil(unitHealth[attackerIndex] / UNIT_DESC[attackerIndex][HEALTH_INDEX]);
        }

        if (defenderIndex === GIANTS_INDEX && unitNumbers[GIANTS_INDEX] > 0) {
          unitBuffs[GIANTS_INDEX] += 0.05;
          log(`- ${UNIT_DESC[GIANTS_INDEX][NAME_INDEX]}, +%5 hasar biriktirdi`);
        }

        if (attackerIndex === GIANTS_INDEX) {
          unitBuffs[GIANTS_INDEX] = 1;
          log("- Kemik Devlerin biriktirdigi hasar sifirlandi");
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
      }

      log(`── Raund ${roundCount} sonu ──`);
      log("");
      printBattlefield(log, unitNumbers, unitHealth, defenderOrderFrontFirst, "enemy");
      log("");
      printBattlefield(log, unitNumbers, unitHealth, defenderOrderFrontFirst, "ally");
      log("");
    }

    if (!winner) {
      winner = enemyCapable ? "enemy" : "ally";
    }

    log("");
    log(bannerLine(winner === "ally" ? "ZAFER" : "MAGLUBIYET"));
    log("");
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
        log(`- ${String(lostUnits).padStart(3)} ${UNIT_DESC[i][NAME_INDEX].padEnd(28)} (${lostBlood} kan)`);
      }
    }
    log("");
    log(`= ${String(lostUnitsTotal).padStart(3)} toplam ${"".padEnd(21)} (${lostBloodTotal} kan)`);
    log("");

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
      seed: typeof options.seed === "number" ? options.seed : null,
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

  function getStoneReviveCount(lossCount) {
    const normalized = Math.max(0, Number(lossCount) || 0);
    if (normalized <= 0) {
      return 0;
    }
    return Math.ceil(normalized / 5);
  }

  function getStoneAdjustedLossProfile(lossesByKey) {
    const permanentLossesByKey = {};
    const revivesByKey = {};
    let stoneCount = 0;
    let permanentLostUnits = 0;
    let permanentLostBlood = 0;
    let revivedUnits = 0;

    ALLY_UNITS.forEach((unit) => {
      const lossCount = Math.max(0, Number(lossesByKey?.[unit.key]) || 0);
      const reviveCount = Math.min(lossCount, getStoneReviveCount(lossCount));
      const permanentLossCount = Math.max(0, lossCount - reviveCount);

      revivesByKey[unit.key] = reviveCount;
      permanentLossesByKey[unit.key] = permanentLossCount;
      revivedUnits += reviveCount;
      permanentLostUnits += permanentLossCount;
      permanentLostBlood += permanentLossCount * (BLOOD_BY_ALLY_KEY[unit.key] || 0);
      if (reviveCount > stoneCount) {
        stoneCount = reviveCount;
      }
    });

    return {
      stoneCount,
      revivedUnits,
      revivesByKey,
      permanentLossesByKey,
      permanentLostUnits,
      permanentLostBlood
    };
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

  function createEmptyAllyCounts() {
    return Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  }

  function fillCandidateToPointLimitByPriority(sourceCounts, availableAllyCounts, maxPoints, priorityUnits) {
    const counts = normalizeCandidateToPointLimit(sourceCounts, maxPoints);
    if (!(maxPoints >= 0)) {
      return counts;
    }

    const seen = new Set();
    const orderedPriority = [...(priorityUnits || []), ...ALLY_UNITS]
      .filter((unit) => {
        if (!unit || seen.has(unit.key)) {
          return false;
        }
        seen.add(unit.key);
        return true;
      });

    let totalPoints = calculateArmyPoints(counts);
    let added = true;
    while (added) {
      added = false;
      for (const unit of orderedPriority) {
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

  function buildBoundedExhaustiveCandidates(availableAllyCounts, maxPoints, limit) {
    if (!(limit > 0) || !(maxPoints >= 0)) {
      return [];
    }

    const candidates = [];
    const counts = createEmptyAllyCounts();
    let overflow = false;

    function walk(unitIndex, remainingPoints) {
      if (overflow) {
        return;
      }
      if (unitIndex >= ALLY_UNITS.length) {
        candidates.push(cloneCounts(counts, ALLY_UNITS));
        if (candidates.length > limit) {
          overflow = true;
        }
        return;
      }

      const unit = ALLY_UNITS[unitIndex];
      const cost = POINTS_BY_ALLY_KEY[unit.key];
      const maxCount = Math.min(availableAllyCounts[unit.key] || 0, Math.floor(remainingPoints / cost));
      for (let count = 0; count <= maxCount; count += 1) {
        counts[unit.key] = count;
        walk(unitIndex + 1, remainingPoints - count * cost);
        if (overflow) {
          return;
        }
      }
      counts[unit.key] = 0;
    }

    walk(0, maxPoints);
    return overflow ? [] : candidates;
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

  function compareEvaluations(a, b, options = {}) {
    const objective = options.objective === "min_army" ? "min_army" : "min_loss";
    const stoneMode = Boolean(options.stoneMode);
    const lossMetricKey = stoneMode ? "expectedStoneAdjustedLostBlood" : "expectedLostBlood";
    const lossUnitsMetricKey = stoneMode ? "expectedStoneAdjustedLostUnits" : "expectedLostUnits";

    if (a.feasible !== b.feasible) {
      return a.feasible ? -1 : 1;
    }
    if (a.feasible) {
      if (a.winRate !== b.winRate) {
        return b.winRate - a.winRate;
      }
      if (objective === "min_army") {
        if (a.avgUsedPoints !== b.avgUsedPoints) {
          return a.avgUsedPoints - b.avgUsedPoints;
        }
        if ((a[lossMetricKey] ?? Number.POSITIVE_INFINITY) !== (b[lossMetricKey] ?? Number.POSITIVE_INFINITY)) {
          return (a[lossMetricKey] ?? Number.POSITIVE_INFINITY) - (b[lossMetricKey] ?? Number.POSITIVE_INFINITY);
        }
      } else {
        if ((a[lossMetricKey] ?? Number.POSITIVE_INFINITY) !== (b[lossMetricKey] ?? Number.POSITIVE_INFINITY)) {
          return (a[lossMetricKey] ?? Number.POSITIVE_INFINITY) - (b[lossMetricKey] ?? Number.POSITIVE_INFINITY);
        }
        if (a.avgUsedPoints !== b.avgUsedPoints) {
          return a.avgUsedPoints - b.avgUsedPoints;
        }
      }
      if (a.avgUsedCapacity !== b.avgUsedCapacity) {
        return a.avgUsedCapacity - b.avgUsedCapacity;
      }
      if ((a[lossUnitsMetricKey] ?? Number.POSITIVE_INFINITY) !== (b[lossUnitsMetricKey] ?? Number.POSITIVE_INFINITY)) {
        return (a[lossUnitsMetricKey] ?? Number.POSITIVE_INFINITY) - (b[lossUnitsMetricKey] ?? Number.POSITIVE_INFINITY);
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

  function getBroadNeighborCandidates(baseCounts, availableAllyCounts, enemyCounts, maxPoints) {
    const neighbors = [];
    const strategicOrder = getStrategicUnitOrder(availableAllyCounts, enemyCounts);
    const priorityKeys = strategicOrder.map((unit) => unit.key);

    ALLY_UNITS.forEach((unit) => {
      const current = baseCounts[unit.key] || 0;
      const max = availableAllyCounts[unit.key] || 0;
      if (max <= 0) {
        return;
      }

      const values = new Set([
        0,
        1,
        Math.max(0, current - Math.ceil(Math.max(1, current * 0.5))),
        Math.max(0, current - Math.ceil(Math.max(1, current * 0.25))),
        Math.max(0, current - 2),
        Math.max(0, current - 1),
        Math.min(max, current + 1),
        Math.min(max, current + 2),
        Math.min(max, current + Math.ceil(Math.max(1, max * 0.18))),
        Math.min(max, current + Math.ceil(Math.max(1, max * 0.35))),
        max
      ]);

      values.forEach((nextValue) => {
        if (nextValue === current) {
          return;
        }
        const candidate = cloneCounts(baseCounts, ALLY_UNITS);
        candidate[unit.key] = nextValue;
        neighbors.push(normalizeCandidateToPointLimit(candidate, maxPoints));
        neighbors.push(fillCandidateToPointLimitByPriority(candidate, availableAllyCounts, maxPoints, strategicOrder));
      });
    });

    strategicOrder.slice(0, Math.min(5, strategicOrder.length)).forEach((increaseUnit) => {
      ALLY_UNITS.forEach((reduceUnit) => {
        if (increaseUnit.key === reduceUnit.key || (baseCounts[reduceUnit.key] || 0) <= 0) {
          return;
        }

        [1, 2, 4, Math.ceil((baseCounts[reduceUnit.key] || 0) * 0.25)].forEach((reduction) => {
          const candidate = cloneCounts(baseCounts, ALLY_UNITS);
          candidate[reduceUnit.key] = Math.max(0, candidate[reduceUnit.key] - reduction);
          const freedPoints = calculateArmyPoints(baseCounts) - calculateArmyPoints(candidate);
          const addCount = Math.min(
            (availableAllyCounts[increaseUnit.key] || 0) - (candidate[increaseUnit.key] || 0),
            Math.floor(freedPoints / POINTS_BY_ALLY_KEY[increaseUnit.key])
          );
          if (addCount <= 0) {
            return;
          }
          candidate[increaseUnit.key] += addCount;
          const orderedForFill = [
            increaseUnit,
            ...strategicOrder.filter((unit) => unit.key !== increaseUnit.key && priorityKeys.includes(unit.key))
          ];
          neighbors.push(fillCandidateToPointLimitByPriority(candidate, availableAllyCounts, maxPoints, orderedForFill));
        });
      });
    });

    return neighbors;
  }

  function getBloodEfficiency(unit) {
    return (unit.attack * unit.health) / BLOOD_BY_ALLY_KEY[unit.key];
  }

  function getTypeMultiplier(attackerType, defenderType) {
    const advantages = {
      brute: { occult: 1.5, monster: 0.5 },
      occult: { brute: 0.5, monster: 1.5 },
      monster: { brute: 1.5, occult: 0.5 }
    };
    return advantages[attackerType]?.[defenderType] || 1.0;
  }

  function calculateTypeAdvantageScore(allyCounts, enemyCounts) {
    let score = 0;
    ALLY_UNITS.forEach((ally) => {
      const allyCount = allyCounts[ally.key] || 0;
      if (allyCount === 0) return;
      ENEMY_UNITS.forEach((enemy) => {
        const enemyCount = enemyCounts[enemy.key] || 0;
        if (enemyCount === 0) return;
        const multiplier = getTypeMultiplier(ally.type, enemy.type);
        score += allyCount * enemyCount * (multiplier - 1) * 10;
      });
    });
    return score;
  }

  function getAllyUnitStats(unit) {
    const index = BATS_INDEX + ALLY_UNITS.findIndex((candidate) => candidate.key === unit.key);
    const desc = UNIT_DESC[index] || [];
    return {
      type: desc[TYPE_INDEX] || unit.type,
      position: desc[POSITION_INDEX] || "front",
      attack: desc[ATTACK_INDEX] || 0,
      health: desc[HEALTH_INDEX] || 0,
      speed: desc[SPEED_INDEX] || 0,
      blood: desc[BLOOD_INDEX] || BLOOD_BY_ALLY_KEY[unit.key] || 0,
      points: POINTS_BY_ALLY_KEY[unit.key] || 1
    };
  }

  function getEnemyProfile(enemyCounts) {
    let totalHealth = 0;
    let rearHealth = 0;
    let frontHealth = 0;
    const typeHealth = {};

    ENEMY_UNITS.forEach((unit, index) => {
      const count = enemyCounts[unit.key] || 0;
      if (count <= 0) {
        return;
      }
      const desc = UNIT_DESC[index] || [];
      const health = count * (desc[HEALTH_INDEX] || 0);
      const type = desc[TYPE_INDEX] || unit.type;
      totalHealth += health;
      typeHealth[type] = (typeHealth[type] || 0) + health;
      if (desc[POSITION_INDEX] === "rear") {
        rearHealth += health;
      } else {
        frontHealth += health;
      }
    });

    return {
      totalHealth,
      rearHealth,
      frontHealth,
      typeHealth
    };
  }

  function getUnitStrategicScore(unit, enemyCounts) {
    const stats = getAllyUnitStats(unit);
    const profile = getEnemyProfile(enemyCounts);
    const totalEnemyHealth = profile.totalHealth || 1;
    const matchupScore = Object.entries(profile.typeHealth).reduce((sum, [enemyType, health]) => {
      return sum + getTypeMultiplier(stats.type, enemyType) * (health / totalEnemyHealth);
    }, 0);
    const rearBias = profile.rearHealth / totalEnemyHealth;
    const positionScore = stats.position === "rear" ? 1 + rearBias * 0.18 : 1 + (profile.frontHealth / totalEnemyHealth) * 0.08;
    const tempoScore = 1 + Math.min(stats.speed, 15) / 35;
    const durabilityScore = 1 + Math.sqrt(Math.max(stats.health, 1)) / 12;
    const rawPower = Math.max(1, stats.attack) * durabilityScore * tempoScore * matchupScore * positionScore;
    return rawPower / Math.max(1, stats.points);
  }

  function estimateCandidateStrategicScore(counts, enemyCounts, maxPoints) {
    const pointUsage = maxPoints > 0 && Number.isFinite(maxPoints)
      ? calculateArmyPoints(counts) / maxPoints
      : 1;
    return ALLY_UNITS.reduce((sum, unit) => {
      return sum + (counts[unit.key] || 0) * POINTS_BY_ALLY_KEY[unit.key] * getUnitStrategicScore(unit, enemyCounts);
    }, 0) * (0.7 + Math.min(1, pointUsage) * 0.3);
  }

  function spreadSelectCandidates(scoredCandidates, limit) {
    if (limit <= 0) {
      return [];
    }
    if (scoredCandidates.length <= limit) {
      return scoredCandidates.map((entry) => entry.candidate);
    }

    const sorted = [...scoredCandidates].sort((left, right) => right.score - left.score);
    const selected = new Map();
    const topCount = Math.max(1, Math.floor(limit * 0.72));

    sorted.slice(0, topCount).forEach((entry) => {
      selected.set(getCountSignature(entry.candidate, ALLY_UNITS), entry.candidate);
    });

    const remainingSlots = limit - selected.size;
    const stride = Math.max(1, Math.floor(sorted.length / Math.max(1, remainingSlots)));
    for (let index = Math.floor(stride / 2); index < sorted.length && selected.size < limit; index += stride) {
      const candidate = sorted[index].candidate;
      selected.set(getCountSignature(candidate, ALLY_UNITS), candidate);
    }

    return [...selected.values()];
  }

  function getStrategicUnitOrder(availableAllyCounts, enemyCounts) {
    return ALLY_UNITS
      .filter((unit) => (availableAllyCounts[unit.key] || 0) > 0)
      .sort((left, right) => {
        const scoreDelta = getUnitStrategicScore(right, enemyCounts) - getUnitStrategicScore(left, enemyCounts);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return POINTS_BY_ALLY_KEY[left.key] - POINTS_BY_ALLY_KEY[right.key];
      });
  }

  function getCountOptionsForUnit(unit, availableAllyCounts, maxPoints) {
    const maxByPool = availableAllyCounts[unit.key] || 0;
    const maxByPoints = Math.floor(maxPoints / POINTS_BY_ALLY_KEY[unit.key]);
    const max = Math.max(0, Math.min(maxByPool, maxByPoints));
    if (max <= 0) {
      return [0];
    }

    return [...new Set([
      0,
      1,
      Math.max(1, Math.floor(max * 0.12)),
      Math.max(1, Math.floor(max * 0.25)),
      Math.max(1, Math.floor(max * 0.4)),
      Math.max(1, Math.floor(max * 0.6)),
      Math.max(1, Math.floor(max * 0.8)),
      max
    ])].sort((a, b) => a - b);
  }

  function buildStrategicGridCandidates(availableAllyCounts, enemyCounts, maxPoints, options = {}) {
    const orderedUnits = getStrategicUnitOrder(availableAllyCounts, enemyCounts);
    if (orderedUnits.length === 0) {
      return [];
    }

    const selectedUnits = orderedUnits.slice(0, Math.min(5, orderedUnits.length));
    const candidateLimit = Math.max(0, options.limit || 700);
    const scoredCandidates = [];
    const partial = createEmptyAllyCounts();

    function collect(index) {
      if (index >= selectedUnits.length) {
        const points = calculateArmyPoints(partial);
        if (points > 0 && points <= maxPoints) {
          const filled = fillCandidateToPointLimitByPriority(partial, availableAllyCounts, maxPoints, orderedUnits);
          const raw = normalizeCandidateToPointLimit(partial, maxPoints);
          scoredCandidates.push({
            candidate: filled,
            score: estimateCandidateStrategicScore(filled, enemyCounts, maxPoints)
          });
          scoredCandidates.push({
            candidate: raw,
            score: estimateCandidateStrategicScore(raw, enemyCounts, maxPoints) * 0.92
          });
        }
        return;
      }

      const unit = selectedUnits[index];
      const optionsForUnit = getCountOptionsForUnit(unit, availableAllyCounts, maxPoints);
      for (const count of optionsForUnit) {
        partial[unit.key] = count;
        if (calculateArmyPoints(partial) <= maxPoints) {
          collect(index + 1);
        }
      }
      partial[unit.key] = 0;
    }

    collect(0);
    return spreadSelectCandidates(scoredCandidates, candidateLimit);
  }

  function buildStrategicRandomCandidates(availableAllyCounts, enemyCounts, maxPoints, options = {}) {
    const orderedUnits = getStrategicUnitOrder(availableAllyCounts, enemyCounts);
    if (orderedUnits.length === 0) {
      return [];
    }

    const candidateCount = Math.max(0, options.count || 0);
    const random = createSeededRandom(options.seed || 1);
    const scores = orderedUnits.map((unit) => Math.max(0.05, getUnitStrategicScore(unit, enemyCounts)));
    const candidates = [];
    const attempts = Math.max(candidateCount * 5, 30);

    function pickWeightedUnit() {
      const total = scores.reduce((sum, score) => sum + score, 0);
      let roll = random() * total;
      for (let index = 0; index < orderedUnits.length; index += 1) {
        roll -= scores[index];
        if (roll <= 0) {
          return orderedUnits[index];
        }
      }
      return orderedUnits[orderedUnits.length - 1];
    }

    for (let attempt = 0; attempt < attempts && candidates.length < candidateCount; attempt += 1) {
      const candidate = createEmptyAllyCounts();
      const targetPoints = Math.max(1, Math.floor(maxPoints * (0.34 + random() * 0.66)));
      let points = 0;
      let stalled = 0;

      while (points < targetPoints && stalled < orderedUnits.length * 3) {
        const unit = pickWeightedUnit();
        const cost = POINTS_BY_ALLY_KEY[unit.key];
        const current = candidate[unit.key] || 0;
        const max = availableAllyCounts[unit.key] || 0;
        if (current >= max || points + cost > maxPoints) {
          stalled += 1;
          continue;
        }
        const burst = random() < 0.22 ? 1 + Math.floor(random() * 3) : 1;
        let added = 0;
        while (added < burst && candidate[unit.key] < max && points + cost <= maxPoints && points < targetPoints) {
          candidate[unit.key] += 1;
          points += cost;
          added += 1;
        }
      }

      if (calculateArmyPoints(candidate) <= 0) {
        continue;
      }

      const shouldFill = random() < 0.55;
      candidates.push(shouldFill
        ? fillCandidateToPointLimitByPriority(candidate, availableAllyCounts, maxPoints, orderedUnits)
        : normalizeCandidateToPointLimit(candidate, maxPoints));
    }

    return candidates;
  }

  function buildStrategicCandidates(availableAllyCounts, enemyCounts, maxPoints) {
    const candidates = [];
    const availableUnits = ALLY_UNITS.filter((unit) => (availableAllyCounts[unit.key] || 0) > 0);
    if (availableUnits.length === 0) return candidates;

    // Strateji 1: Tip avantajlı birimlere odaklan
    const enemyTypes = {};
    ENEMY_UNITS.forEach((unit) => {
      const count = enemyCounts[unit.key] || 0;
      if (count > 0) enemyTypes[unit.type] = (enemyTypes[unit.type] || 0) + count;
    });

    const counterMap = {
      brute: ['occult', 'witches', 'banshees'],
      occult: ['monster', 'gargoyles', 'rotmaws'],
      monster: ['brute', 'ghouls', 'thralls']
    };

    const counterUnits = new Set();
    Object.keys(enemyTypes).forEach((enemyType) => {
      (counterMap[enemyType] || []).forEach((key) => counterUnits.add(key));
    });

    if (counterUnits.size > 0) {
      const counterCandidate = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
      let usedPoints = 0;
      const prioritizedUnits = availableUnits
        .filter((unit) => counterUnits.has(unit.key))
        .sort((a, b) => getBloodEfficiency(b) - getBloodEfficiency(a));

      prioritizedUnits.forEach((unit) => {
        const maxCount = availableAllyCounts[unit.key] || 0;
        const unitPoints = POINTS_BY_ALLY_KEY[unit.key];
        const canAfford = Math.min(maxCount, Math.floor((maxPoints - usedPoints) / unitPoints));
        if (canAfford > 0) {
          counterCandidate[unit.key] = canAfford;
          usedPoints += canAfford * unitPoints;
        }
      });

      if (usedPoints > 0) {
        candidates.push(fillCandidateToPointLimit(counterCandidate, availableAllyCounts, maxPoints));
      }
    }

    // Strateji 2: Kan verimliliği en yüksek birimler
    const sortedByEfficiency = [...availableUnits].sort((a, b) => getBloodEfficiency(b) - getBloodEfficiency(a));
    const topEfficient = sortedByEfficiency.slice(0, 3);

    topEfficient.forEach((primary) => {
      const maxCount = Math.min(
        availableAllyCounts[primary.key] || 0,
        Math.floor(maxPoints / POINTS_BY_ALLY_KEY[primary.key])
      );
      [0.6, 0.75, 0.9, 1.0].forEach((ratio) => {
        const candidate = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
        candidate[primary.key] = Math.max(1, Math.floor(maxCount * ratio));
        candidates.push(fillCandidateToPointLimit(candidate, availableAllyCounts, maxPoints));
      });
    });

    // Strateji 3: Nekromant + Hızlı Ölüm Ordusu sinerjisi
    if ((availableAllyCounts.necromancers || 0) > 0) {
      const necroCandidate = {
        bats: Math.min(availableAllyCounts.bats || 0, 50),
        ghouls: Math.min(availableAllyCounts.ghouls || 0, 20),
        necromancers: availableAllyCounts.necromancers || 0,
        thralls: 0, banshees: 0, gargoyles: 0, witches: 0, rotmaws: 0
      };
      candidates.push(normalizeCandidateToPointLimit(necroCandidate, maxPoints));
    }

    // Strateji 4: Kan Cadısı + Uzun Savaş sinerjisi
    if ((availableAllyCounts.witches || 0) > 0) {
      const witchCandidate = {
        witches: availableAllyCounts.witches || 0,
        gargoyles: Math.floor((availableAllyCounts.gargoyles || 0) * 0.5),
        thralls: Math.floor((availableAllyCounts.thralls || 0) * 0.7),
        bats: 0, ghouls: 0, banshees: 0, necromancers: 0, rotmaws: 0
      };
      candidates.push(normalizeCandidateToPointLimit(witchCandidate, maxPoints));
    }

    // Strateji 5: Çürük Çene + Düşük HP düşmanlar
    const lowHpEnemies = ENEMY_UNITS.filter((e) => (enemyCounts[e.key] || 0) > 0 && e.health < 5).length;
    if (lowHpEnemies >= 3 && (availableAllyCounts.rotmaws || 0) > 0) {
      const rotmawCandidate = {
        rotmaws: availableAllyCounts.rotmaws || 0,
        gargoyles: Math.floor((availableAllyCounts.gargoyles || 0) * 0.3),
        bats: 0, ghouls: 0, thralls: 0, banshees: 0, necromancers: 0, witches: 0
      };
      candidates.push(normalizeCandidateToPointLimit(rotmawCandidate, maxPoints));
    }

    return candidates;
  }

  function optimizeArmyUsage(availableAllyCounts, enemyCounts, options = {}) {
    const maxPoints = options.maxPoints ?? Number.POSITIVE_INFINITY;
    const minWinRate = options.minWinRate || 0.75;
    const objective = options.objective === "min_army" ? "min_army" : "min_loss";
    const stoneMode = Boolean(options.stoneMode);
    const trialCount = options.trialCount || 10;
    const fullArmyTrials = options.fullArmyTrials || 12;
    const beamWidth = options.beamWidth || 10;
    const maxIterations = options.maxIterations || 4;
    const eliteCount = options.eliteCount || Math.max(4, Math.min(beamWidth, 8));
    const stabilityTrials = options.stabilityTrials || Math.max(fullArmyTrials, trialCount * 3);
    const baseSeed = options.baseSeed || 42042;
    const diversityMode = Boolean(options.diversityMode);
    const knownSignatures = new Set(options.knownSignatures || []);
    const seedCandidates = Array.isArray(options.seedCandidates) ? options.seedCandidates : [];
    const diversityCandidateCount = diversityMode
      ? Math.max(18, options.diversityCandidateCount || beamWidth * 3)
      : 0;
    const exploratoryCandidateCount = Math.max(60, options.exploratoryCandidateCount || beamWidth * 8);
    const exhaustiveCandidateLimit = Math.max(0, options.exhaustiveCandidateLimit || 0);
    const evaluations = new Map();
    const uniqueSignatures = new Set();
    let simulationRuns = 0;
    const initialCandidates = [];
    const compareEntries = (left, right) => compareEvaluations(left, right, { objective, stoneMode });
    const strategicOrder = getStrategicUnitOrder(availableAllyCounts, enemyCounts);

    // Stratejik adayları ekle
    initialCandidates.push(...buildStrategicCandidates(availableAllyCounts, enemyCounts, maxPoints));
    initialCandidates.push(...buildBoundedExhaustiveCandidates(availableAllyCounts, maxPoints, exhaustiveCandidateLimit));
    initialCandidates.push(...buildStrategicGridCandidates(availableAllyCounts, enemyCounts, maxPoints, {
      limit: Math.max(300, beamWidth * 32)
    }));
    initialCandidates.push(...buildStrategicRandomCandidates(availableAllyCounts, enemyCounts, maxPoints, {
      count: exploratoryCandidateCount,
      seed: baseSeed + 91009
    }));
    seedCandidates.forEach((candidate) => {
      if (!candidate) {
        return;
      }
      initialCandidates.push(normalizeCandidateToPointLimit(cloneCounts(candidate, ALLY_UNITS), maxPoints));
    });
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

    strategicOrder.slice(0, Math.min(4, strategicOrder.length)).forEach((primaryUnit, primaryIndex) => {
      const primaryMax = Math.min(
        availableAllyCounts[primaryUnit.key] || 0,
        Math.floor(maxPoints / POINTS_BY_ALLY_KEY[primaryUnit.key])
      );
      if (primaryMax <= 0) {
        return;
      }
      [0.25, 0.45, 0.65, 0.85, 1].forEach((primaryRatio) => {
        const primaryCount = Math.max(1, Math.floor(primaryMax * primaryRatio));
        const candidate = createEmptyAllyCounts();
        candidate[primaryUnit.key] = primaryCount;
        initialCandidates.push(fillCandidateToPointLimitByPriority(candidate, availableAllyCounts, maxPoints, strategicOrder));
        strategicOrder.slice(0, Math.min(5, strategicOrder.length)).forEach((secondaryUnit, secondaryIndex) => {
          if (secondaryUnit.key === primaryUnit.key) {
            return;
          }
          const variant = cloneCounts(candidate, ALLY_UNITS);
          const remainingPoints = maxPoints - calculateArmyPoints(variant);
          const secondaryMax = Math.min(
            availableAllyCounts[secondaryUnit.key] || 0,
            Math.floor(Math.max(0, remainingPoints) / POINTS_BY_ALLY_KEY[secondaryUnit.key])
          );
          if (secondaryMax > 0) {
            const secondaryRatio = secondaryIndex <= primaryIndex ? 0.5 : 0.32;
            variant[secondaryUnit.key] = Math.max(1, Math.floor(secondaryMax * secondaryRatio));
          }
          initialCandidates.push(fillCandidateToPointLimitByPriority(variant, availableAllyCounts, maxPoints, strategicOrder));
          initialCandidates.push(normalizeCandidateToPointLimit(variant, maxPoints));
        });
      });
    });

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
      let totalLostBloodSum = 0;
      let totalLostUnitsSum = 0;
      let winLostBloodSum = 0;
      let winLostUnitsSum = 0;
      let totalStoneAdjustedLostBloodSum = 0;
      let totalStoneAdjustedLostUnitsSum = 0;
      let totalStoneCountSum = 0;
      let stoneAdjustedLostBloodSum = 0;
      let stoneAdjustedLostUnitsSum = 0;
      let stoneCountSum = 0;
      let usedCapacitySum = 0;
      let usedPointsSum = 0;
      let enemyRemainingHealthSum = 0;
      let enemyRemainingUnitsSum = 0;
      const totalAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
      const totalStoneAdjustedAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
      const allyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
      const stoneAdjustedAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
      const winningSeeds = [];

      for (let trial = 0; trial < localTrialCount; trial += 1) {
        simulationRuns += 1;
        const seed = baseSeed + trial * 977;
        const result = simulateBattle(enemyCounts, counts, { seed, collectLog: false });
        usedCapacitySum += result.usedCapacity;
        usedPointsSum += result.usedPoints;
        enemyRemainingHealthSum += result.enemyRemainingHealth;
        enemyRemainingUnitsSum += result.enemyRemainingUnits;
        totalLostBloodSum += result.lostBloodTotal;
        totalLostUnitsSum += result.lostUnitsTotal;
        const stoneProfile = getStoneAdjustedLossProfile(result.allyLosses || {});
        totalStoneAdjustedLostBloodSum += stoneProfile.permanentLostBlood;
        totalStoneAdjustedLostUnitsSum += stoneProfile.permanentLostUnits;
        totalStoneCountSum += stoneProfile.stoneCount;
        ALLY_UNITS.forEach((unit) => {
          totalAllyLossesSum[unit.key] += result.allyLosses?.[unit.key] || 0;
          totalStoneAdjustedAllyLossesSum[unit.key] += stoneProfile.permanentLossesByKey[unit.key] || 0;
        });
        if (result.winner === "ally") {
          wins += 1;
          winLostBloodSum += result.lostBloodTotal;
          winLostUnitsSum += result.lostUnitsTotal;
          stoneAdjustedLostBloodSum += stoneProfile.permanentLostBlood;
          stoneAdjustedLostUnitsSum += stoneProfile.permanentLostUnits;
          stoneCountSum += stoneProfile.stoneCount;
          ALLY_UNITS.forEach((unit) => {
            allyLossesSum[unit.key] += result.allyLosses?.[unit.key] || 0;
            stoneAdjustedAllyLossesSum[unit.key] += stoneProfile.permanentLossesByKey[unit.key] || 0;
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
        expectedLostBlood: totalLostBloodSum / localTrialCount,
        expectedLostUnits: totalLostUnitsSum / localTrialCount,
        avgLostBlood: wins > 0 ? winLostBloodSum / wins : Number.POSITIVE_INFINITY,
        avgLostUnits: wins > 0 ? winLostUnitsSum / wins : Number.POSITIVE_INFINITY,
        expectedStoneAdjustedLostBlood: totalStoneAdjustedLostBloodSum / localTrialCount,
        expectedStoneAdjustedLostUnits: totalStoneAdjustedLostUnitsSum / localTrialCount,
        avgStoneAdjustedLostBlood: wins > 0 ? stoneAdjustedLostBloodSum / wins : Number.POSITIVE_INFINITY,
        avgStoneAdjustedLostUnits: wins > 0 ? stoneAdjustedLostUnitsSum / wins : Number.POSITIVE_INFINITY,
        expectedStoneCount: totalStoneCountSum / localTrialCount,
        avgStoneCount: wins > 0 ? stoneCountSum / wins : 0,
        avgUsedCapacity: usedCapacitySum / localTrialCount,
        avgUsedPoints: usedPointsSum / localTrialCount,
        avgEnemyRemainingHealth: enemyRemainingHealthSum / localTrialCount,
        avgEnemyRemainingUnits: enemyRemainingUnitsSum / localTrialCount,
        expectedAllyLosses: Object.fromEntries(
          ALLY_UNITS.map((unit) => [unit.key, totalAllyLossesSum[unit.key] / localTrialCount])
        ),
        expectedStoneAdjustedAllyLosses: Object.fromEntries(
          ALLY_UNITS.map((unit) => [unit.key, totalStoneAdjustedAllyLossesSum[unit.key] / localTrialCount])
        ),
        avgAllyLosses: Object.fromEntries(
          ALLY_UNITS.map((unit) => [unit.key, wins > 0 ? allyLossesSum[unit.key] / wins : 0])
        ),
        avgStoneAdjustedAllyLosses: Object.fromEntries(
          ALLY_UNITS.map((unit) => [unit.key, wins > 0 ? stoneAdjustedAllyLossesSum[unit.key] / wins : 0])
        ),
        objective,
        stoneMode,
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
        .sort(compareEntries);
    }

    function dedupeCandidates(candidateList) {
      const unique = new Map();
      candidateList.forEach((candidate) => {
        if (!candidate) return;
        unique.set(getCountSignature(candidate, ALLY_UNITS), candidate);
      });
      return [...unique.values()];
    }

    // Successive halving: ucuz tier ile tara, en iyi yuzdeyi bir sonraki tiere
    // tasi. Net etki: ayni butce ile cok daha fazla aday taranir.
    function successiveHalvingEvaluation(candidateList) {
      const unique = dedupeCandidates(candidateList);
      if (unique.length === 0) {
        return [];
      }

      const finalTrials = trialCount;
      const cheapTrials = Math.max(2, Math.min(3, finalTrials));
      const midTrials = Math.max(cheapTrials + 1, Math.min(Math.ceil(finalTrials / 2), finalTrials));

      // Tier 1: cok ucuz tarama, sadece kazanan adaylari ileri tasi
      const tier1 = unique
        .map((candidate) => evaluateCandidate(candidate, cheapTrials))
        .sort(compareEntries);

      // Istatistiksel olarak %75 kazanma sansi olamayacaklari ele
      // (cheapTrials uzerinden 0 win = neredeyse imkansiz feasible)
      const cheapWinThreshold = Math.max(1, Math.ceil(cheapTrials * 0.5));
      const survivorsTier1 = tier1.filter((entry) => entry.wins >= cheapWinThreshold);
      const tier1Top = survivorsTier1.length > 0
        ? survivorsTier1.slice(0, Math.max(20, Math.ceil(survivorsTier1.length * 0.3)))
        : tier1.slice(0, Math.max(20, Math.ceil(tier1.length * 0.15)));

      // Tier 2: orta seviye dogrulama
      const tier2 = tier1Top
        .map((entry) => evaluateCandidate(entry.counts, midTrials))
        .sort(compareEntries);

      const tier2Top = tier2.slice(0, Math.max(beamWidth * 2, Math.ceil(tier2.length * 0.5)));

      // Tier 3: tam dogrulama
      const tier3 = tier2Top
        .map((entry) => evaluateCandidate(entry.counts, finalTrials))
        .sort(compareEntries);

      return tier3;
    }

    // Iki ebeveyn aday arasinda recombine: ortalama, max, min, agirlikli karisim
    function crossoverCandidates(parentA, parentB) {
      if (!parentA || !parentB) return [];
      const offspring = [];

      const avg = createEmptyAllyCounts();
      const maxMix = createEmptyAllyCounts();
      const minMix = createEmptyAllyCounts();
      const blendA = createEmptyAllyCounts();
      const blendB = createEmptyAllyCounts();
      const swapped = createEmptyAllyCounts();

      ALLY_UNITS.forEach((unit) => {
        const a = parentA[unit.key] || 0;
        const b = parentB[unit.key] || 0;
        const max = availableAllyCounts[unit.key] || 0;
        avg[unit.key] = Math.min(max, Math.round((a + b) / 2));
        maxMix[unit.key] = Math.min(max, Math.max(a, b));
        minMix[unit.key] = Math.min(max, Math.min(a, b));
        blendA[unit.key] = Math.min(max, Math.round(a * 0.7 + b * 0.3));
        blendB[unit.key] = Math.min(max, Math.round(a * 0.3 + b * 0.7));
      });

      // Tekli birim swap: yarisini parentA, yarisini parentB'den al (deterministik)
      const halfIndex = Math.floor(ALLY_UNITS.length / 2);
      ALLY_UNITS.forEach((unit, index) => {
        const max = availableAllyCounts[unit.key] || 0;
        const source = index < halfIndex ? parentA : parentB;
        swapped[unit.key] = Math.min(max, source[unit.key] || 0);
      });

      [avg, maxMix, minMix, blendA, blendB, swapped].forEach((child) => {
        offspring.push(normalizeCandidateToPointLimit(child, maxPoints));
      });
      return offspring;
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
        expectedLostBlood: entry.expectedLostBlood,
        expectedLostUnits: entry.expectedLostUnits,
        avgLostBlood: entry.avgLostBlood,
        avgLostUnits: entry.avgLostUnits,
        expectedStoneAdjustedLostBlood: entry.expectedStoneAdjustedLostBlood,
        expectedStoneAdjustedLostUnits: entry.expectedStoneAdjustedLostUnits,
        avgStoneAdjustedLostBlood: entry.avgStoneAdjustedLostBlood,
        avgStoneAdjustedLostUnits: entry.avgStoneAdjustedLostUnits,
        expectedStoneCount: entry.expectedStoneCount,
        avgStoneCount: entry.avgStoneCount,
        avgUsedCapacity: entry.avgUsedCapacity,
        avgUsedPoints: entry.avgUsedPoints,
        avgEnemyRemainingHealth: entry.avgEnemyRemainingHealth,
        avgEnemyRemainingUnits: entry.avgEnemyRemainingUnits,
        expectedAllyLosses: { ...(entry.expectedAllyLosses || {}) },
        expectedStoneAdjustedAllyLosses: { ...(entry.expectedStoneAdjustedAllyLosses || {}) },
        avgAllyLosses: { ...(entry.avgAllyLosses || {}) },
        avgStoneAdjustedAllyLosses: { ...(entry.avgStoneAdjustedAllyLosses || {}) },
        objective: entry.objective,
        stoneMode: entry.stoneMode,
        winningSeeds: [...(entry.winningSeeds || [])]
      };
    }

    function getRoundedLossSignature(entry) {
      const sourceLosses = stoneMode ? entry?.avgStoneAdjustedAllyLosses : entry?.avgAllyLosses;
      if (!entry || !sourceLosses) {
        return "none";
      }

      const parts = ALLY_UNITS.map((unit) => {
        const rounded = Math.max(0, Math.round(sourceLosses[unit.key] || 0));
        return rounded > 0 ? `${unit.key}:${rounded}` : null;
      }).filter(Boolean);

      return parts.length > 0 ? parts.join("|") : "none";
    }

    function collectBestUniqueEvaluations(limit) {
      const unique = new Map();
      evaluations.forEach((entry) => {
        const existing = unique.get(entry.signature);
        if (!existing || compareEntries(entry, existing) < 0) {
          unique.set(entry.signature, entry);
        }
      });
      return [...unique.values()]
        .sort(compareEntries)
        .slice(0, limit)
        .map(sanitizeEvaluation);
    }

    function collectBestLossPatternEvaluations(limit) {
      const unique = new Map();
      evaluations.forEach((entry) => {
        const lossSignature = getRoundedLossSignature(entry);
        const existing = unique.get(lossSignature);
        if (!existing || compareEntries(entry, existing) < 0) {
          unique.set(lossSignature, entry);
        }
      });
      return [...unique.values()]
        .sort(compareEntries)
        .slice(0, limit)
        .map(sanitizeEvaluation);
    }

    // Baslangic adaylarini successive halving ile tara: cok daha fazla aday
    // gorulebilir cunku zayif olanlar erken elenir.
    let ranked = successiveHalvingEvaluation(initialCandidates);
    let best = ranked[0];
    let beam = ranked.slice(0, beamWidth);
    const elitePool = [...beam];

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const mutated = [];
      beam.forEach((entry) => {
        mutated.push(...getNeighborCandidates(entry.counts, availableAllyCounts, maxPoints));
        if (iteration % 2 === 0 || entry.feasible) {
          mutated.push(...getBroadNeighborCandidates(entry.counts, availableAllyCounts, enemyCounts, maxPoints));
        }
      });

      // Crossover: en iyi beam uyelerinin parlak ozelliklerini birlestir.
      // Tek-aday mutasyonlarinin atlayamayacagi karisimlari uretir.
      const crossoverPool = beam.filter((entry) => entry?.counts).slice(0, Math.min(6, beam.length));
      for (let i = 0; i < crossoverPool.length; i += 1) {
        for (let j = i + 1; j < crossoverPool.length; j += 1) {
          mutated.push(...crossoverCandidates(crossoverPool[i].counts, crossoverPool[j].counts));
        }
      }

      // Mutasyon havuzunu da successive halving ile tara
      ranked = successiveHalvingEvaluation(mutated);
      if (ranked.length === 0) {
        break;
      }

      const candidateBest = ranked[0];
      if (compareEntries(candidateBest, best) < 0) {
        best = candidateBest;
      }

      beam = [...beam, ...ranked].sort(compareEntries).slice(0, beamWidth);
      elitePool.push(...beam);
    }

    const eliteCandidates = [...elitePool]
      .sort(compareEntries)
      .slice(0, eliteCount);

    const unitPriority = [...ALLY_UNITS].sort((left, right) => BLOOD_BY_ALLY_KEY[right.key] - BLOOD_BY_ALLY_KEY[left.key]);

    function refineEvaluation(entry) {
      let refined = entry;
      let improved = true;

      while (improved) {
        improved = false;

        // 1. Asama: tek birimi azaltarak gelisme ara
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
            if (evaluation.feasible && compareEntries(evaluation, refined) < 0) {
              refined = evaluation;
              improved = true;
              break;
            }
          }

          if (improved) {
            break;
          }
        }

        if (improved) {
          continue;
        }

        // 2. Asama: birim swap (1 azalt + 1 ekle). Refinement yalnizca azaltma
        // yapinca yerel optimumda takiliyor; swap karisimi degistirebiliyor.
        for (const reduceUnit of unitPriority) {
          const reduceFrom = refined.counts[reduceUnit.key] || 0;
          if (reduceFrom <= 0) continue;
          for (const increaseUnit of unitPriority) {
            if (increaseUnit.key === reduceUnit.key) continue;
            const increaseFrom = refined.counts[increaseUnit.key] || 0;
            const increaseMax = availableAllyCounts[increaseUnit.key] || 0;
            if (increaseFrom >= increaseMax) continue;

            const swapAmounts = Array.from(new Set([
              1,
              Math.max(1, Math.ceil(reduceFrom * 0.25)),
              Math.max(1, Math.ceil(reduceFrom * 0.5))
            ]));

            let swapImproved = false;
            for (const amount of swapAmounts) {
              const newReduce = Math.max(0, reduceFrom - amount);
              const candidate = cloneCounts(refined.counts, ALLY_UNITS);
              candidate[reduceUnit.key] = newReduce;
              const freedPoints = (reduceFrom - newReduce) * POINTS_BY_ALLY_KEY[reduceUnit.key];
              const addCount = Math.min(
                increaseMax - increaseFrom,
                Math.floor(freedPoints / POINTS_BY_ALLY_KEY[increaseUnit.key])
              );
              if (addCount <= 0) continue;
              candidate[increaseUnit.key] = increaseFrom + addCount;

              const evaluation = evaluateCandidate(normalizeCandidateToPointLimit(candidate, maxPoints));
              if (evaluation.feasible && compareEntries(evaluation, refined) < 0) {
                refined = evaluation;
                improved = true;
                swapImproved = true;
                break;
              }
            }
            if (swapImproved) break;
          }
          if (improved) break;
        }
      }

      const localNeighbors = collectTopEvaluations(
        [
          ...getNeighborCandidates(refined.counts, availableAllyCounts, maxPoints),
          ...getBroadNeighborCandidates(refined.counts, availableAllyCounts, enemyCounts, maxPoints)
        ],
        trialCount
      );
      if (localNeighbors.length > 0 && compareEntries(localNeighbors[0], refined) < 0) {
        return refineEvaluation(localNeighbors[0]);
      }

      return refined;
    }

    const refinedElite = eliteCandidates
      .map((entry) => entry.feasible ? refineEvaluation(entry) : entry)
      .sort(compareEntries);

    if (refinedElite.length > 0 && compareEntries(refinedElite[0], best) < 0) {
      best = refinedElite[0];
    }

    const stabilityCandidates = [...beam, ...ranked, ...refinedElite, best]
      .filter(Boolean)
      .sort(compareEntries)
      .slice(0, Math.max(eliteCount, 6));

    const stableRanked = collectTopEvaluations(
      stabilityCandidates.map((entry) => entry.counts),
      stabilityTrials
    );

    if (stableRanked.length > 0 && compareEntries(stableRanked[0], best) < 0) {
      best = stableRanked[0];
    }

    const fullArmyEvaluation = evaluateCandidate(normalizeCandidateToPointLimit(availableAllyCounts, maxPoints), fullArmyTrials);
    const stableFullArmyEvaluation = evaluateCandidate(
      normalizeCandidateToPointLimit(availableAllyCounts, maxPoints),
      Math.max(fullArmyTrials, stabilityTrials)
    );
    const fallbackEvaluation = compareEntries(stableFullArmyEvaluation, fullArmyEvaluation) < 0
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
      if (!existing || compareEntries(entry, existing) < 0) {
        topCandidatePool.set(entry.signature, entry);
      }
    });

    return {
      possible: best.feasible,
      recommendation: best.feasible ? best : null,
      fallback: best.feasible ? null : fallbackEvaluation,
      fullArmyEvaluation,
      topCandidates: [...topCandidatePool.values()].sort(compareEntries).slice(0, 120),
      searchedCandidates: evaluations.size,
      uniqueCandidateCount: uniqueSignatures.size,
      uniqueCandidateSignatures: [...uniqueSignatures],
      simulationRuns,
      sampleBattle
    };
  }

  const LOG_TRANSLATION_TR_EN = [
    ["Dusman yenildi! Zafer muttefiklerin.", "Enemy defeated! Victory to the allies."],
    ["Muttefikler yenildi! Savas meydani dusmanin.", "Allies defeated! The battlefield belongs to the enemy."],
    ["her raundun olaylari ve muharebe duzeni asagidadir", "each round's events and formation are below"],
    ["onerilen duzenin ornek savas gunlugu", "sample battle log of the recommended formation"],
    ["muttefik on saflari asip arka saflari hedef aldi", "bypassed ally front lines to target the rear"],
    ["dusman on saflari asip arka saflari hedef aldi", "bypassed enemy front lines to target the rear"],
    ["birimini +%10 hasar artisiyla guclendirdi", "empowered unit with +%10 damage gain"],
    ["birim tipini onemsemiyor", "ignores unit types"],
    ["her biri 1 canla geri dirildi", "each revived with 1 hp"],
    ["sadece can kaybi", "hp damage only"],
    ["tip ustunlugune sahip", "has type advantage"],
    ["tip dezavantajli", "is type-disadvantaged"],
    ["yayilma hasari verdi", "dealt splash damage"],
    ["intikam hasari verdi", "dealt revenge damage"],
    ["artik (overkill) hasar verdi", "dealt overkill damage"],
    ["hasar carpani kazandi", "gained damage multiplier"],
    ["azalmis hasarla saldiriyor", "is attacking with reduced damage"],
    ["hasarla saldiriyor", "is attacking with extra damage"],
    ["hasar kazandi", "gained damage"],
    ["biriktirdigi hasar sifirlandi", "stored damage was reset"],
    ["hasar biriktirdi", "stored damage"],
    ["hasar vurdu", "damage dealt"],
    ["tamamen yok edildi", "completely destroyed"],
    ["birim kaybetti", "units lost"],
    ["yok edilen", "destroyed"],
    ["turun ilki oldugu icin", "for being first this turn"],
    ["yavas dusmana", "against slow enemy"],
    ["ilk turda", "in the first turn"],
    ["sayesinde", "thanks to"],
    ["Baslangic muharebe duzeni", "Initial battle formation"],
    ["Toplam birlik kapasitesi", "Total army capacity"],
    ["Dusman toplam atak", "Enemy total attack"],
    ["Muttefik toplam atak", "Ally total attack"],
    ["DUSMAN SAFLARI", "ENEMY RANKS"],
    ["MUTTEFIK SAFLARI", "ALLY RANKS"],
    ["Kayip Birlikler", "Lost Units"],
    ["MAGLUBIYET", "DEFEAT"],
    ["ZAFER", "VICTORY"],
    ["RAUND", "ROUND"],
    ["Hesap:", "Calc:"],
    ["hizi artik", "speed is now"],
    ["hizini", "speed by"],
    ["azaltti", "reduced"],
    ["azaltiyor", "is reducing"],
    ["azalmis", "reduced"],
    ["sifirlandi", "reset"],
    ["hasarini", "damage"],
    ["Olumsuz Tarikatcilar", "Undead Cultists"],
    ["Sismis Cesetler", "Bloated Corpses"],
    ["Yavrulayan Analar", "Brood Mothers"],
    ["Diriltilmis Zombiler", "Revived Zombies"],
    ["Vampir Koleler", "Thralls"],
    ["Kemik Kanatlar", "Bone Wings"],
    ["Kemik Devlerin", "Bone Giants'"],
    ["Kemik Devler", "Bone Giants"],
    ["Kan Cadilari", "Blood Witches"],
    ["Curuk Ceneler", "Rotmaws"],
    ["Gulyabaniler", "Ghouls"],
    ["Nekromantlar", "Necromancers"],
    ["Iskeletler", "Skeletons"],
    ["Hayaletler", "Wraiths"],
    ["Hortlaklar", "Revenants"],
    ["Gargoyller", "Gargoyles"],
    ["Yarasalar", "Bats"],
    ["Bansiler", "Banshees"],
    ["Zombiler", "Zombies"],
    ["Lichler", "Liches"],
    ["Orumcekler", "Spiderlings"],
    ["Hamle", "Turn"],
    ["Raund", "Round"],
    ["birimini", "unit"],
    ["dogurdu", "spawned"],
    ["uzerine", "on"],
    ["karsisinda", "against"],
    ["kaldi", "remaining"],
    ["toplam", "total"],
    ["sonu", "end"],
    ["yeni", "new"],
    ["birim", "units"],
    ["carpan", "multiplier"],
    ["hasar", "damage"],
    ["kan", "blood"],
    ["can", "hp"]
  ];

  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function translateLogText(text, direction) {
    if (!text || direction !== "en") {
      return text;
    }
    let result = text;
    for (let i = 0; i < LOG_TRANSLATION_TR_EN.length; i += 1) {
      const [from, to] = LOG_TRANSLATION_TR_EN[i];
      result = result.replace(new RegExp(escapeRegex(from), "g"), to);
    }
    return result;
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
    BLOOD_BY_ALLY_KEY,
    getStoneReviveCount,
    getStoneAdjustedLossProfile,
    translateLogText
  };
})(typeof window !== "undefined" ? window : globalThis);
