"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createDoc(id, data) {
  return {
    id,
    data() {
      return data;
    }
  };
}

function createSnapshot(items) {
  return {
    docs: items.map((item) => createDoc(item.id, item.data))
  };
}

function createCollection(items, recorder) {
  return {
    orderBy(field, direction) {
      recorder.push({ type: "orderBy", field, direction });
      return createPagedQuery(items, recorder);
    },
    where(field, op, value) {
      recorder.push({ type: "where", field, op, value });
      const filtered = items.filter((item) => item.data[field] === value);
      return createFilteredQuery(filtered, recorder);
    },
    doc(id) {
      recorder.push({ type: "doc", id });
      return {
        async get() {
          const found = items.find((item) => item.id === id);
          return {
            exists: Boolean(found),
            id,
            data() {
              return found ? found.data : undefined;
            }
          };
        }
      };
    }
  };
}

function createPagedQuery(items, recorder) {
  return {
    limit(value) {
      recorder.push({ type: "limit", value });
      return {
        async get() {
          return createSnapshot(items.slice(0, value));
        }
      };
    },
    startAfter(doc) {
      recorder.push({ type: "startAfter", id: doc?.id || null });
      const index = items.findIndex((item) => item.id === doc?.id);
      const sliced = index >= 0 ? items.slice(index + 1) : items;
      return {
        limit(value) {
          recorder.push({ type: "limit", value });
          return {
            async get() {
              return createSnapshot(sliced.slice(0, value));
            }
          };
        }
      };
    }
  };
}

function createFilteredQuery(items, recorder) {
  return {
    where(field, op, value) {
      recorder.push({ type: "where", field, op, value });
      const filtered = items.filter((item) => item.data[field] === value);
      return createFilteredQuery(filtered, recorder);
    },
    orderBy(field, direction) {
      recorder.push({ type: "orderBy", field, direction });
      return {
        limit(value) {
          recorder.push({ type: "limit", value });
          return {
            async get() {
              return createSnapshot(items.slice(0, value));
            }
          };
        }
      };
    },
    limit(value) {
      recorder.push({ type: "limit", value });
      return {
        async get() {
          return createSnapshot(items.slice(0, value));
        }
      };
    },
    async get() {
      return createSnapshot(items);
    }
  };
}

function loadClient({ collections }) {
  const queryLog = [];
  const storage = createStorage();
  const context = {
    console,
    TextEncoder,
    localStorage: storage,
    fetch: async () => {
      throw new Error("fetch should not be called in this test");
    },
    window: null
  };

  context.window = context;
  context.firebase = {
    apps: [],
    initializeApp() {},
    firestore() {
      return {
        collection(name) {
          return createCollection(collections[name] || [], queryLog);
        }
      };
    },
    auth() {
      return {
        currentUser: null,
        onAuthStateChanged(callback) {
          callback(null);
          return () => {};
        }
      };
    }
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "..", "firebase-client.js"), "utf8"),
    context,
    { filename: "firebase-client.js" }
  );

  return {
    api: context.BTFirebase,
    queryLog,
    storage
  };
}

async function testApprovedStrategiesPagination() {
  const client = loadClient({
    collections: {
      approvedStrategies: [
        { id: "a1", data: { savedAt: "2026-05-05T12:00:00.000Z", source: "optimizer", enemySignature: "sig-1" } },
        { id: "a2", data: { savedAt: "2026-05-05T11:00:00.000Z", source: "optimizer", enemySignature: "sig-2" } },
        { id: "a3", data: { savedAt: "2026-05-05T10:00:00.000Z", source: "optimizer", enemySignature: "sig-3" } }
      ]
    }
  });

  const firstPage = await client.api.loadApprovedStrategiesPage({ pageSize: 2 });
  assert.equal(firstPage.items.length, 2);
  assert.equal(firstPage.items[0].id, "a1");
  assert.equal(firstPage.hasMore, true);
  assert.equal(client.queryLog[0].type, "orderBy");
  assert.equal(client.queryLog[1].type, "limit");
  assert.equal(client.queryLog[1].value, 3);

  const secondPage = await client.api.loadApprovedStrategiesPage({ pageSize: 2, cursor: firstPage.cursor });
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.items[0].id, "a3");
  assert.equal(secondPage.hasMore, false);
}

async function testWrongReportTargetLookup() {
  const client = loadClient({
    collections: {
      wrongReports: [
        { id: "w1", data: { source: "simulation", matchSignature: "sig-a", reportedAt: "2026-05-05T12:00:00.000Z" } },
        { id: "w2", data: { source: "simulation", matchSignature: "sig-b", reportedAt: "2026-05-05T11:00:00.000Z" } },
        { id: "w3", data: { source: "optimizer", matchSignature: "sig-a", reportedAt: "2026-05-05T10:00:00.000Z" } }
      ]
    }
  });

  const items = await client.api.findWrongReportsByMatchSignature("simulation", "sig-a");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "w1");
  assert.deepEqual(
    client.queryLog.filter((entry) => entry.type === "where").map((entry) => [entry.field, entry.value]),
    [["matchSignature", "sig-a"]]
  );
}

async function testApprovedOptimizerLookupByDocId() {
  const client = loadClient({
    collections: {
      approvedStrategies: [
        { id: "stage_61_deadbeef", data: { source: "optimizer", enemySignature: "61|1|2|3" } }
      ]
    }
  });

  const item = await client.api.findApprovedStrategyByDocId("stage_61_deadbeef");
  assert(item);
  assert.equal(item.id, "stage_61_deadbeef");
  assert.equal(client.queryLog.some((entry) => entry.type === "doc" && entry.id === "stage_61_deadbeef"), true);
}

async function run() {
  await testApprovedStrategiesPagination();
  await testWrongReportTargetLookup();
  await testApprovedOptimizerLookupByDocId();
  console.log("test-firestore-read-optimization passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
