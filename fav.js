"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS
} = window.BattleCore;

const favoriteList = document.querySelector("#favoriteList");
const favoriteCountLabel = document.querySelector("#favoriteCountLabel");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminLoginBtn = document.querySelector("#adminLoginBtn");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";

let isAdminSession = false;
let favoriteItems = [];

void renderFavoriteStrategies();
void bindAdminAuth();

function showCopyableError(title, message) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "1000";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";
  overlay.style.padding = "18px";
  overlay.style.background = "rgba(6, 10, 14, 0.82)";

  const card = document.createElement("div");
  card.style.width = "min(920px, 100%)";
  card.style.maxHeight = "calc(100vh - 36px)";
  card.style.overflow = "auto";
  card.style.padding = "18px";
  card.style.border = "1px solid rgba(160, 185, 214, 0.14)";
  card.style.borderRadius = "24px";
  card.style.background = "rgba(10, 15, 22, 0.98)";
  card.style.boxShadow = "0 24px 80px rgba(0, 0, 0, 0.45)";

  const header = document.createElement("div");
  header.className = "panel-head";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "button button-ghost";
  closeBtn.type = "button";
  closeBtn.textContent = "Kapat";
  header.append(heading, closeBtn);

  const copyBtn = document.createElement("button");
  copyBtn.className = "button button-secondary";
  copyBtn.type = "button";
  copyBtn.textContent = "Kopyala";

  const text = document.createElement("textarea");
  text.className = "terminal-block";
  text.readOnly = true;
  text.value = message;
  text.style.width = "100%";
  text.style.minHeight = "320px";
  text.style.resize = "vertical";
  text.style.whiteSpace = "pre";

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(copyBtn);

  function close() {
    overlay.remove();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(message);
      copyBtn.textContent = "Kopyalandi";
    } catch {
      text.focus();
      text.select();
      copyBtn.textContent = "Secildi";
    }
  });

  card.append(header, actions, text);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  text.focus();
  text.select();
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
      await renderFavoriteStrategies();
    }
  });
}

async function loadFavoriteStrategies() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadFavoriteStrategies !== "function") {
    return [];
  }
  try {
    return await window.BTFirebase.loadFavoriteStrategies();
  } catch (error) {
    console.warn("Fav dizilimler yuklenemedi.", error);
    return [];
  }
}

async function renderFavoriteStrategies() {
  favoriteItems = (await loadFavoriteStrategies()).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  favoriteCountLabel.textContent = String(favoriteItems.length);
  favoriteList.innerHTML = "";

  if (!favoriteItems.length) {
    favoriteList.innerHTML = '<p class="summary-empty">Henuz favori dizilim yok.</p>';
    return;
  }

  favoriteItems.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "saved-card";

    const head = document.createElement("div");
    head.className = "saved-card-head";

    const title = document.createElement("div");
    const stageText = Number.isInteger(item.stage) ? `${item.stage}. Kademe / ` : "";
    title.innerHTML = `<strong>${index + 1}. ${item.enemyTitle || "Versus"}</strong><span>${stageText}${item.sourceLabel || "Fav"} / ${formatDate(item.savedAt)}</span>`;

    const actions = document.createElement("div");
    actions.className = "actions actions-inline";

    const openBtn = document.createElement("button");
    openBtn.className = "button button-secondary";
    openBtn.type = "button";
    openBtn.textContent = "Simulasyonda Ac";
    openBtn.addEventListener("click", () => {
      openSimulationForCounts(item.enemyCounts || {}, item.recommendationCounts || {});
    });
    actions.appendChild(openBtn);

    if (isAdminSession) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "button button-ghost";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Sil";
      deleteBtn.addEventListener("click", async () => {
        deleteBtn.disabled = true;
        try {
          await window.BTFirebase.deleteFavoriteStrategy(item.id);
          await renderFavoriteStrategies();
        } catch (error) {
          showCopyableError("Fav Silinemedi", error?.message || "Fav silinemedi.");
        } finally {
          deleteBtn.disabled = false;
        }
      });
      actions.appendChild(deleteBtn);
    }

    head.append(title, actions);

    const meta = document.createElement("div");
    meta.className = "saved-meta";
    meta.innerHTML = `
      <span>Kaynak: <strong>${item.sourceLabel || "-"}</strong></span>
      <span>Kan kaybi: <strong>${item.lostBlood ?? 0}</strong></span>
      <span>Kullanilan puan: <strong>${item.usedPoints ?? 0}</strong></span>
      <span>Kazanma orani: <strong>%${item.winRate ?? 0}</strong></span>
    `;

    const grid = document.createElement("div");
    grid.className = "saved-columns";
    grid.append(
      renderCountBlock("Rakip Ordu", item.enemyCounts, ENEMY_UNITS),
      renderCountBlock("Fav Dizilim", item.recommendationCounts, ALLY_UNITS)
    );

    card.append(head, meta, grid);
    favoriteList.appendChild(card);
  });
}

function openSimulationForCounts(enemyCounts, allyCounts, seed = null) {
  try {
    window.sessionStorage.setItem(OPTIMIZER_SIMULATION_STORAGE_KEY, JSON.stringify({
      enemyCounts,
      allyCounts,
      seed: Number.isInteger(seed) ? seed : null
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
