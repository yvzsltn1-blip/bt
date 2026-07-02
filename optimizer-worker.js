"use strict";

// Optimizer arama isini ana thread disinda kosturan worker.
// optimizer.js her isi { allyPool, enemyCounts, options } olarak gonderir;
// sonuc { ok: true, result } veya { ok: false, error } olarak doner.
// battle-core.js worker ortaminda globalThis.BattleCore olarak yuklenir.
// Surum parametresi worker URL'inden devralinir (onbellek tutarliligi icin):
// optimizer.js worker'i "optimizer-worker.js?v=..." olarak kurar.
importScripts("battle-core.js" + (self.location.search || ""));

self.onmessage = (event) => {
  const { allyPool, enemyCounts, options } = event.data || {};
  try {
    const result = self.BattleCore.optimizeArmyUsage(allyPool, enemyCounts, options || {});
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: String((error && error.message) || error) });
  }
};
