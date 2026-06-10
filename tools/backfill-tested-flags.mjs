// Tek seferlik migration: overviewArchives dokumanlarina denormalize "tested"
// alanini yazar. Test durumu archiveRegressionTests koleksiyonundaki
// matchSignature'larla (bulk-regression.js'tekiyle ayni imza algoritmasi)
// eslestirilerek belirlenir. Calistirma: node tools/backfill-tested-flags.mjs
// Maliyet: ~1 okuma/dokuman (iki koleksiyon) + 1 yazma/arsiv dokumani.
"use strict";

const PROJECT_ID = "bt-analiz";
const API_KEY = "AIzaSyB6_mwliHgUXjCSidzZIBiQj_8hLkYvZV4";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// battle-core.js ile ayni birim siralari (imza bu siraya bagli).
const ENEMY_KEYS = [
  "skeletons", "zombies", "cultists", "bonewings", "corpses",
  "wraiths", "revenants", "giants", "broodmothers", "liches"
];
const ALLY_KEYS = [
  "bats", "ghouls", "thralls", "banshees",
  "necromancers", "gargoyles", "witches", "rotmaws"
];

// bulk-regression.js parseArchiveRosterCounts kopyasi.
function parseRosterCounts(text, keys, prefix, allowLegacySequential) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  const normalized = String(text || "");
  const labelMatches = [...normalized.matchAll(new RegExp(`${prefix}(\\d+)\\s*[:=]\\s*(\\d+)`, "gi"))];
  if (labelMatches.length > 0) {
    labelMatches.forEach((match) => {
      const index = Number.parseInt(match[1], 10) - 1;
      const qty = Number.parseInt(match[2], 10);
      if (keys[index] && Number.isFinite(qty) && qty > 0) {
        counts[keys[index]] = qty;
      }
    });
    return counts;
  }
  const nameMatches = [...normalized.matchAll(new RegExp(`\\(${prefix}(\\d+)\\)\\s*x\\s*(\\d+)`, "gi"))];
  if (nameMatches.length > 0) {
    nameMatches.forEach((match) => {
      const index = Number.parseInt(match[1], 10) - 1;
      const qty = Number.parseInt(match[2], 10);
      if (keys[index] && Number.isFinite(qty) && qty > 0) {
        counts[keys[index]] = qty;
      }
    });
    return counts;
  }
  if (!allowLegacySequential) {
    return counts;
  }
  const bracketMatch = normalized.match(/\[([^\]]+)\]/);
  if (!bracketMatch) {
    return counts;
  }
  bracketMatch[1]
    .split("-")
    .map((entry) => Number.parseInt(String(entry).trim(), 10))
    .filter((entry) => Number.isFinite(entry) && entry >= 0)
    .forEach((value, index) => {
      if (keys[index]) {
        counts[keys[index]] = value;
      }
    });
  return counts;
}

function buildSignature(enemyRosterText, allyRosterText) {
  const enemyCounts = parseRosterCounts(enemyRosterText, ENEMY_KEYS, "R", false);
  const allyCounts = parseRosterCounts(allyRosterText, ALLY_KEYS, "T", true);
  const enemySignature = ENEMY_KEYS.map((key) => Number(enemyCounts[key] || 0)).join("|");
  const allySignature = ALLY_KEYS.map((key) => Number(allyCounts[key] || 0)).join("|");
  const enemyTotal = ENEMY_KEYS.reduce((sum, key) => sum + Number(enemyCounts[key] || 0), 0);
  const allyTotal = ALLY_KEYS.reduce((sum, key) => sum + Number(allyCounts[key] || 0), 0);
  return {
    signature: `archive|${enemySignature}|${allySignature}`,
    // Iki taraftan biri cozumlemiyorsa savas yeniden kurulamaz -> test edilemez.
    testable: enemyTotal > 0 && allyTotal > 0
  };
}

function fieldString(doc, name) {
  return doc?.fields?.[name]?.stringValue || "";
}

function fieldBool(doc, name) {
  const value = doc?.fields?.[name];
  return typeof value?.booleanValue === "boolean" ? value.booleanValue : null;
}

async function runQueryAll(collectionId, selectFields) {
  // runQuery tum eslesen dokumanlari tek yanitta dondurur (limit yok).
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      select: { fields: selectFields.map((fieldPath) => ({ fieldPath })) }
    }
  };
  const response = await fetch(`${BASE}:runQuery?key=${encodeURIComponent(API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`runQuery ${collectionId} basarisiz: HTTP ${response.status}\n${await response.text()}`);
  }
  const rows = await response.json();
  return rows.filter((row) => row.document).map((row) => row.document);
}

// Not: batchWrite endpoint'i guvenlik kurallari yerine IAM yetkisi ister;
// anonim erisimde tekil PATCH (rules'a tabi) kullanmak gerekir.
async function patchDocument(write) {
  const maskParams = write.updateMask.fieldPaths
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join("&");
  const url = `https://firestore.googleapis.com/v1/${write.update.name}?${maskParams}&currentDocument.exists=true&key=${encodeURIComponent(API_KEY)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: write.update.fields })
  });
  if (!response.ok) {
    throw new Error(`PATCH ${write.update.name.split("/").pop()} basarisiz: HTTP ${response.status} ${await response.text()}`);
  }
}

async function main() {
  console.log("Test imzalari okunuyor (archiveRegressionTests)...");
  const testDocs = await runQueryAll("archiveRegressionTests", ["matchSignature", "testedAt"]);
  const testedAtBySignature = new Map();
  testDocs.forEach((doc) => {
    const signature = fieldString(doc, "matchSignature");
    if (!signature) {
      return;
    }
    const testedAt = fieldString(doc, "testedAt");
    const current = testedAtBySignature.get(signature) || "";
    if (testedAt >= current) {
      testedAtBySignature.set(signature, testedAt);
    }
  });
  console.log(`${testDocs.length} test kaydi, ${testedAtBySignature.size} benzersiz imza.`);

  console.log("Arsiv dokumanlari okunuyor (overviewArchives)...");
  const archiveDocs = await runQueryAll("overviewArchives", ["enemyRosterText", "allyRosterText", "tested", "testedSignature", "goldText", "goldValue"]);
  console.log(`${archiveDocs.length} arsiv dokumani.`);

  const writes = [];
  let alreadyCorrect = 0;
  let testedCount = 0;
  let untestableCount = 0;
  archiveDocs.forEach((doc) => {
    const { signature, testable } = buildSignature(fieldString(doc, "enemyRosterText"), fieldString(doc, "allyRosterText"));
    // Detayi olmayan (test edilemeyen) kayitlar da taranmis sayilir ki
    // "test edilmeyenler" filtresinde surekli one cikmasinlar.
    const isTested = !testable || testedAtBySignature.has(signature);
    if (isTested) {
      testedCount += 1;
    }
    if (!testable) {
      untestableCount += 1;
    }
    const currentTested = fieldBool(doc, "tested");
    const currentSignature = fieldString(doc, "testedSignature");
    const signatureCorrect = !testable || !isTested || currentSignature === signature;
    if (currentTested === isTested && signatureCorrect) {
      alreadyCorrect += 1;
      return;
    }
    const fields = { tested: { booleanValue: isTested } };
    const fieldPaths = ["tested"];
    // Kural semasinda olmayan legacy alanlar dokumani gecersiz kilip her
    // guncellemeyi engelliyor; ayni PATCH icinde sil (maskede olup fields'ta
    // olmayan alan silinir).
    if (doc.fields && ("goldText" in doc.fields || "goldValue" in doc.fields)) {
      fieldPaths.push("goldText", "goldValue");
    }
    if (isTested && testable) {
      fields.testedSignature = { stringValue: signature.slice(0, 200) };
      fieldPaths.push("testedSignature");
      const testedAt = testedAtBySignature.get(signature);
      if (testedAt) {
        fields.testedAt = { stringValue: testedAt.slice(0, 40) };
        fieldPaths.push("testedAt");
      }
    }
    writes.push({
      update: { name: doc.name, fields },
      updateMask: { fieldPaths },
      currentDocument: { exists: true }
    });
  });

  console.log(`Hedef: ${writes.length} guncelleme (${testedCount} tested [${untestableCount} detaysiz], ${archiveDocs.length - testedCount} untested; ${alreadyCorrect} zaten dogru).`);

  let written = 0;
  let failed = 0;
  const concurrency = 20;
  for (let start = 0; start < writes.length; start += concurrency) {
    const chunk = writes.slice(start, start + concurrency);
    const results = await Promise.allSettled(chunk.map((write) => patchDocument(write)));
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        written += 1;
      } else {
        failed += 1;
        if (failed <= 5) {
          console.warn(String(result.reason));
        }
      }
    });
    const done = Math.min(start + concurrency, writes.length);
    if (done % 400 < concurrency || done === writes.length) {
      console.log(`Ilerleme: ${done} / ${writes.length}`);
    }
  }

  console.log(`Bitti. Yazilan: ${written}, basarisiz: ${failed}.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
