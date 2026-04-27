"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS
} = window.BattleCore;

const savedList = document.querySelector("#savedList");
const savedCountLabel = document.querySelector("#savedCountLabel");
const clearSavedBtn = document.querySelector("#clearSavedBtn");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminLoginBtn = document.querySelector("#adminLoginBtn");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";

let isAdminSession = false;

syncAdminActions();

void renderSavedStrategies();
void bindAdminAuth();

clearSavedBtn.addEventListener("click", async () => {
  if (!isAdminSession) {
    return;
  }
  const items = await loadSavedStrategies();
  if (items.length === 0) {
    return;
  }
  if (!window.confirm("Tum onaylanan kayitlar silinsin mi?")) {
    return;
  }
  clearSavedBtn.disabled = true;
  try {
    await window.BTFirebase.clearApprovedStrategies();
    await renderSavedStrategies();
  } catch (error) {
    console.warn("Kayitlar silinemedi.", error);
  } finally {
    syncAdminActions();
  }
});

function syncAdminActions() {
  clearSavedBtn.disabled = !isAdminSession;
  clearSavedBtn.title = isAdminSession ? "" : "Tum kayitlari silmek icin admin girisi gerekli.";
}

async function bindAdminAuth() {
  if (!window.AdminAuthUI || typeof window.AdminAuthUI.bindAdminControls !== "function") {
    return;
  }

  await window.AdminAuthUI.bindAdminControls({
    statusLabel: adminAuthStatus,
    emailInput: adminEmailInput,
    passwordInput: adminPasswordInput,
    loginButton: adminLoginBtn,
    logoutButton: adminLogoutBtn,
    onStateChange: async (isAdmin) => {
      isAdminSession = isAdmin;
      syncAdminActions();
      await renderSavedStrategies();
    }
  });
}

async function loadSavedStrategies() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadApprovedStrategies !== "function") {
    return [];
  }
  try {
    return await window.BTFirebase.loadApprovedStrategies();
  } catch (error) {
    console.warn("Kayitli cozumler yuklenemedi.", error);
    return [];
  }
}

async function renderSavedStrategies() {
  const items = (await loadSavedStrategies()).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  savedCountLabel.textContent = String(items.length);
  savedList.innerHTML = "";
  syncAdminActions();

  if (items.length === 0) {
    savedList.innerHTML = '<p class="summary-empty">Henuz onaylanmis bir kayit yok.</p>';
    return;
  }

  items.forEach((item) => {
    const source = getApprovedSource(item);
    const card = document.createElement("article");
    card.className = "saved-card";

    const head = document.createElement("div");
    head.className = "saved-card-head";

    const title = document.createElement("div");
    if (source === "simulation") {
      title.innerHTML = `<strong>${item.variantTitle || "Onayli Dovus"} / ${item.enemyTitle || "Versus"}</strong><span>${item.stage ? `${item.stage}. Kademe / ` : ""}Simulasyon / ${formatDate(item.savedAt)}</span>`;
    } else {
      title.innerHTML = `<strong>${item.stage}. Kademe / ${item.enemyTitle || "Versus"}</strong><span>${formatDate(item.savedAt)}</span>`;
    }

    const actions = document.createElement("div");
    actions.className = "actions actions-inline";

    if (source === "simulation") {
      const openBtn = document.createElement("button");
      openBtn.className = "button button-secondary";
      openBtn.type = "button";
      openBtn.textContent = "Simulasyonda Ac";
      openBtn.addEventListener("click", () => {
        openSimulationForCounts(item.enemyCounts || {}, item.allyCounts || {});
      });
      actions.append(openBtn);
    } else {
      const openBtn = document.createElement("a");
      openBtn.className = "button button-secondary";
      openBtn.href = `optimizer.html?stage=${encodeURIComponent(item.stage)}&saved=${encodeURIComponent(item.id)}`;
      openBtn.textContent = "Optimizer'da Ac";
      actions.append(openBtn);
    }

    if (isAdminSession) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "button button-ghost";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Sil";
      deleteBtn.addEventListener("click", async () => {
        deleteBtn.disabled = true;
        try {
          await window.BTFirebase.deleteApprovedStrategy(item.id);
          await renderSavedStrategies();
        } finally {
          deleteBtn.disabled = false;
        }
      });
      actions.append(deleteBtn);
    }
    head.append(title, actions);

    const meta = document.createElement("div");
    meta.className = "saved-meta";
    if (source === "simulation") {
      meta.innerHTML = `
        <span>Sonuc: <strong>${item.winner === "enemy" ? "Maglubiyet" : "Zafer"}</strong></span>
        <span>Olasilik: <strong>%${formatStoredProbability(item.probabilityBasisPoints)}</strong></span>
        <span>Kan kaybi: <strong>${item.lostBlood ?? 0}</strong></span>
        <span>Kullanilan puan: <strong>${item.usedPoints ?? 0}</strong></span>
      `;
    } else {
      meta.innerHTML = `
        <span>Kullanilan puan: <strong>${item.usedPoints}</strong></span>
        <span>Kan kaybi: <strong>${item.lostBlood}</strong></span>
        <span>Kazanma orani: <strong>%${item.winRate}</strong></span>
        <span>Mod: <strong>${item.modeLabel}</strong></span>
      `;
    }

    const grid = document.createElement("div");
    grid.className = "saved-columns";
    if (source === "simulation") {
      grid.append(
        renderCountBlock("Rakip Ordu", item.enemyCounts, ENEMY_UNITS),
        renderCountBlock("Onaylanan Dovus", item.allyCounts, ALLY_UNITS)
      );
    } else {
      grid.append(
        renderCountBlock("Rakip Ordu", item.enemyCounts, ENEMY_UNITS),
        renderCountBlock("Onaylanan Cozum", item.recommendationCounts, ALLY_UNITS)
      );
    }

    card.append(head, meta, grid);

    if (source === "simulation") {
      if (isAdminSession) {
        card.appendChild(renderSimulationStageEditor(item));
      }
      card.appendChild(renderSimulationSavedDetails(item));
    }

    savedList.appendChild(card);
  });
}

function getApprovedSource(item) {
  return item?.source === "simulation" ? "simulation" : "optimizer";
}

function openSimulationForCounts(enemyCounts, allyCounts) {
  try {
    window.sessionStorage.setItem(OPTIMIZER_SIMULATION_STORAGE_KEY, JSON.stringify({
      enemyCounts,
      allyCounts
    }));
    const opened = window.open("index.html", "_blank");
    if (!opened) {
      window.alert("Simulasyon yeni sekmede acilamadi. Lutfen popup engelleyiciyi kontrol edin.");
      return;
    }
    opened.focus?.();
  } catch (error) {
    window.alert(`Simulasyon ekranina gecilemedi: ${error.message}`);
  }
}

function renderSimulationSavedDetails(item) {
  const wrap = document.createElement("div");
  wrap.className = "saved-simulation-details";

  if (item.summaryText) {
    const summaryBlock = document.createElement("div");
    summaryBlock.className = "terminal-block saved-text-block";
    summaryBlock.textContent = item.summaryText;
    wrap.appendChild(summaryBlock);
  }

  if (item.logText) {
    const logWrap = document.createElement("details");
    logWrap.className = "wrong-log-wrap";

    const summary = document.createElement("summary");
    summary.textContent = "Savas gunlugunu goster";

    const logBlock = document.createElement("div");
    logBlock.className = "terminal-block wrong-log-block saved-text-block";
    logBlock.textContent = item.logText;

    logWrap.append(summary, logBlock);
    wrap.appendChild(logWrap);
  }

  return wrap;
}

function renderSimulationStageEditor(item) {
  const wrap = document.createElement("div");
  wrap.className = "saved-stage-editor";

  const label = document.createElement("span");
  label.className = "saved-stage-editor-label";
  label.textContent = "Admin kademe girisi";

  const input = document.createElement("input");
  input.className = "admin-auth-input saved-stage-input";
  input.type = "text";
  input.inputMode = "numeric";
  input.pattern = "[0-9]*";
  input.placeholder = "Kademe";
  input.value = item.stage ? String(item.stage) : "";
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D+/g, "");
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "button button-ghost";
  saveBtn.type = "button";
  saveBtn.textContent = "Kademe Kaydet";
  saveBtn.addEventListener("click", async () => {
    const rawValue = input.value.trim();
    const nextStage = rawValue === "" ? undefined : Number.parseInt(rawValue, 10);
    if (rawValue !== "" && (!Number.isInteger(nextStage) || nextStage < 1 || nextStage > 9999)) {
      window.alert("Kademe 1 ile 9999 arasinda olmali.");
      return;
    }
    saveBtn.disabled = true;
    try {
      await window.BTFirebase.saveApprovedStrategy({
        ...item,
        stage: nextStage
      });
      await renderSavedStrategies();
    } catch (error) {
      window.alert(`Kademe kaydedilemedi: ${error.message}`);
    } finally {
      saveBtn.disabled = false;
    }
  });

  wrap.append(label, input, saveBtn);
  return wrap;
}

function renderCountBlock(title, counts, units) {
  const wrap = document.createElement("section");
  wrap.className = "saved-mini-block";

  const heading = document.createElement("h3");
  heading.textContent = title;
  wrap.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "recommend-list";
  const entries = (units || []).map((unit) => [unit.key, counts?.[unit.key] || 0]).filter(([, value]) => value > 0);

  if (entries.length === 0) {
    const row = document.createElement("li");
    row.className = "recommend-row";
    row.innerHTML = "<span>Kayit yok</span><strong>0</strong>";
    list.appendChild(row);
  } else {
    entries.forEach(([key, value]) => {
      const row = document.createElement("li");
      row.className = "recommend-row";
      row.innerHTML = `<span>${getUnitLabel(key)}</span><strong>${value}</strong>`;
      list.appendChild(row);
    });
  }

  wrap.appendChild(list);
  return wrap;
}

function getUnitLabel(key) {
  return [...ENEMY_UNITS, ...ALLY_UNITS].find((unit) => unit.key === key)?.label || key;
}

function formatStoredProbability(basisPoints) {
  const value = Number(basisPoints || 0) / 100;
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("tr-TR");
}
