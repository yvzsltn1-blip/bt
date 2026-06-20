// Arsivdeki (overviewArchives) mukerrer kayitlari teke dusurur.
//
// NEDEN: otobirlik.user.js sonuc sayfasinda syncLootResultToLastArchive'i ayni
// anda birden cok kez tetikleyebiliyordu (watchLootPage gozlemcisi + bot tick).
// Yaris kosulu yuzunden ayni savas, ayni saniyeli birden cok dokuman olarak
// yazildi. (Kok neden surumde duzeltildi; bu betik gecmis kopyalari temizler.)
//
// NASIL CALISIR: Mukerrerler ayni "fill" yukunden uretildigi icin savedAt
// (milisaniye hassasiyetli ISO) + host + rakip/biz dizilisleri AYNIdir; yalniz
// doc id ve bazen loot/tas/olen alanlari (diriltme oncesi/sonrasi) farkli olur.
// Bu yuzden bu dortlu anahtara gore gruplanir; her gruptan EN DOLU kayit tutulur,
// digerleri silinir. Farkli savaslar ayni milisaniyeyi paylasamayacagindan birbirine
// karismaz.
//
// KULLANIM:
//   1) https://bt-analiz.web.app/archive.html sayfasini ac ve ADMIN olarak giris yap
//      (silme yetkisi yalnizca admin oturumunda var).
//   2) Tarayici konsolunu ac (F12) ve bu dosyanin TAMAMINI yapistir, Enter'a bas.
//   3) Once kuru calisma raporu yazilir; SILINMEZ. Onaylamak icin:  __btDedupe.apply()
//
(function () {
  "use strict";

  const api = window.BTFirebase;
  if (!api || typeof api.loadOverviewArchives !== "function") {
    console.error("[dedupe] BTFirebase bulunamadi. Bu betigi archive.html sayfasinda calistir.");
    return;
  }

  function norm(value) {
    return String(value == null ? "" : value).trim();
  }

  // Ayni savas olayini tanimlayan anahtar. Mukerrerler bu alanlarda birebir aynidir.
  function groupKey(item) {
    return [
      norm(item.savedAt),
      norm(item.host),
      norm(item.enemyRosterText),
      norm(item.allyRosterText)
    ].join(" || ");
  }

  function hasBattleDetail(item) {
    const enemy = norm(item.enemyRosterText);
    const ally = norm(item.allyRosterText);
    const enemyHas = /R\d+\s*[:=]\s*\d|\(R\d+\)\s*x\s*\d/i.test(enemy);
    const allyHas = /T\d+\s*[:=]\s*\d|\(T\d+\)\s*x\s*\d|\[[\d\s-]+\]/i.test(ally);
    return enemyHas && allyHas;
  }

  function fallenPresent(item) {
    const text = norm(item.fallenUnitsText);
    return text && text !== "-" && text !== "Olenler : 0";
  }

  // Bir gruptan hangisinin tutulacagini belirler: en cok bilgi iceren kayit kazanir.
  // Daha buyuk skor = daha dolu. Esitlikte en son guncellenen tutulur.
  function completenessScore(item) {
    let score = 0;
    if (hasBattleDetail(item)) score += 1000;
    if (Number(item.lootGoldValue) > 0) score += 100;
    if (Number(item.expValue) > 0) score += 100;
    if (fallenPresent(item)) score += 50;
    if (norm(item.reviveStoneText) && norm(item.reviveStoneText) !== "-") score += 25;
    if (item.tested === true) score += 5;
    score += Math.min(Number(item.lootGoldValue) || 0, 1e12) / 1e15; // ince ayrim
    return score;
  }

  function pickKeeper(group) {
    return group.slice().sort((a, b) => {
      const diff = completenessScore(b) - completenessScore(a);
      if (diff !== 0) return diff;
      // Esit dolulukta en son guncellenen (yoksa savedAt) kazanir.
      return norm(b.updatedAt || b.savedAt).localeCompare(norm(a.updatedAt || a.savedAt));
    })[0];
  }

  async function buildPlan() {
    console.log("[dedupe] Arsiv kayitlari okunuyor...");
    const items = await api.loadOverviewArchives();
    const total = items.length;
    const groups = new Map();
    for (const item of items) {
      if (!item || !norm(item.id) || !norm(item.savedAt)) continue;
      const key = groupKey(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    const deleteIds = [];
    const examples = [];
    let dupGroups = 0;
    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      dupGroups += 1;
      const keeper = pickKeeper(group);
      const losers = group.filter((item) => item.id !== keeper.id);
      losers.forEach((item) => deleteIds.push(item.id));
      if (examples.length < 8) {
        examples.push({
          savedAt: keeper.savedAt,
          host: keeper.host,
          kopya: group.length,
          silinecek: losers.length,
          tutulan: keeper.id,
          loot: keeper.lootGoldText,
          olen: keeper.fallenUnitsText
        });
      }
    }

    return { total, uniqueGroups: groups.size, dupGroups, deleteIds, examples };
  }

  function report(plan) {
    console.log(
      `[dedupe] Toplam ${plan.total} kayit | ${plan.uniqueGroups} benzersiz savas | ` +
      `${plan.dupGroups} grupta mukerrer | SILINECEK: ${plan.deleteIds.length} kayit ` +
      `(${plan.total - plan.deleteIds.length} kalir)`
    );
    if (plan.examples.length) {
      console.log("[dedupe] Ornek gruplar (tutulan + silinecek sayisi):");
      console.table(plan.examples);
    }
  }

  const ctrl = {
    _plan: null,
    async scan() {
      this._plan = await buildPlan();
      report(this._plan);
      if (this._plan.deleteIds.length === 0) {
        console.log("[dedupe] Silinecek mukerrer yok. ✔");
      } else {
        console.log("%c[dedupe] Silmek icin:  __btDedupe.apply()", "color:#c9a46d;font-weight:bold");
      }
      return this._plan;
    },
    async apply() {
      if (!this._plan) {
        console.log("[dedupe] Once tarama yapiliyor...");
        await this.scan();
      }
      // En guncel durumu yeniden tara (arada veri degismis olabilir).
      const plan = await buildPlan();
      this._plan = plan;
      if (plan.deleteIds.length === 0) {
        console.log("[dedupe] Silinecek mukerrer yok. ✔");
        return plan;
      }
      if (typeof api.deleteOverviewArchives !== "function") {
        console.error("[dedupe] deleteOverviewArchives yok; SDK eksik.");
        return plan;
      }
      console.log(`[dedupe] ${plan.deleteIds.length} mukerrer siliniyor...`);
      const result = await api.deleteOverviewArchives(plan.deleteIds);
      console.log(`[dedupe] Bitti. Silinen: ${result?.deleted ?? plan.deleteIds.length}. Sayfayi yenile.`);
      this._plan = null;
      return result;
    }
  };

  window.__btDedupe = ctrl;
  // Otomatik kuru calisma.
  ctrl.scan();
})();
