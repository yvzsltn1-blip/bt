"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function createDoc(id, data) {
  return {
    id,
    data() {
      return { ...data };
    }
  };
}

function createFirestoreMock(byCollection) {
  return {
    collection(name) {
      const config = byCollection[name] || { orderedDocs: [], fullDocs: [] };
      return {
        orderBy() {
          return {
            startAfter(cursor) {
              return this;
            },
            limit() {
              return {
                async get() {
                  return { docs: config.orderedDocs };
                }
              };
            }
          };
        },
        async get() {
          return { docs: config.fullDocs };
        }
      };
    }
  };
}

async function main() {
  const source = fs.readFileSync(path.join(__dirname, "..", "firebase-client.js"), "utf8");
  const localStorage = createStorage();
  const firestore = createFirestoreMock({
    approvedStrategies: {
      orderedDocs: [],
      fullDocs: [
        createDoc("legacy-approved-1", {
          source: "optimizer",
          sourceLabel: "Optimizer",
          enemyTitle: "Legacy Approved"
        })
      ]
    },
    favoriteStrategies: {
      orderedDocs: [],
      fullDocs: [
        createDoc("legacy-fav-1", {
          source: "optimizer",
          sourceLabel: "Optimizer Fav",
          enemyTitle: "Legacy Favorite"
        })
      ]
    }
  });

  const context = {
    console,
    TextEncoder,
    localStorage,
    window: {
      firebase: {
        apps: [{}],
        initializeApp() {},
        firestore() {
          return firestore;
        },
        auth() {
          return {
            currentUser: null,
            onAuthStateChanged() {
              return () => {};
            }
          };
        }
      }
    }
  };
  context.window.window = context.window;
  context.window.localStorage = localStorage;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "firebase-client.js" });

  const approvedPage = await context.window.BTFirebase.loadApprovedStrategiesPage({ pageSize: 10 });
  const favoritePage = await context.window.BTFirebase.loadFavoriteStrategiesPage({ pageSize: 10 });

  assert.strictEqual(approvedPage.items.length, 1, "approved legacy items should fall back into first page");
  assert.strictEqual(approvedPage.items[0].id, "legacy-approved-1");
  assert.strictEqual(favoritePage.items.length, 1, "favorite legacy items should fall back into first page");
  assert.strictEqual(favoritePage.items[0].id, "legacy-fav-1");

  console.log("Firebase paged fallback checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
