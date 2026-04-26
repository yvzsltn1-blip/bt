"use strict";

const savedList = document.querySelector("#savedList");
const savedCountLabel = document.querySelector("#savedCountLabel");
const clearSavedBtn = document.querySelector("#clearSavedBtn");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminLoginBtn = document.querySelector("#adminLoginBtn");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");

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
    const card = document.createElement("article");
    card.className = "saved-card";

    const head = document.createElement("div");
    head.className = "saved-card-head";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${item.stage}. Kademe / ${item.enemyTitle || "Versus"}</strong><span>${formatDate(item.savedAt)}</span>`;

    const actions = document.createElement("div");
    actions.className = "actions actions-inline";

    const openBtn = document.createElement("a");
    openBtn.className = "button button-secondary";
    openBtn.href = `optimizer.html?stage=${encodeURIComponent(item.stage)}&saved=${encodeURIComponent(item.id)}`;
    openBtn.textContent = "Optimizer'da Ac";

    actions.append(openBtn);

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
    meta.innerHTML = `
      <span>Kullanilan puan: <strong>${item.usedPoints}</strong></span>
      <span>Kan kaybi: <strong>${item.lostBlood}</strong></span>
      <span>Kazanma orani: <strong>%${item.winRate}</strong></span>
      <span>Mod: <strong>${item.modeLabel}</strong></span>
    `;

    const grid = document.createElement("div");
    grid.className = "saved-columns";
    grid.append(
      renderCountBlock("Rakip Ordu", item.enemyCounts),
      renderCountBlock("Onaylanan Cozum", item.recommendationCounts)
    );

    card.append(head, meta, grid);
    savedList.appendChild(card);
  });
}

function renderCountBlock(title, counts) {
  const wrap = document.createElement("section");
  wrap.className = "saved-mini-block";

  const heading = document.createElement("h3");
  heading.textContent = title;
  wrap.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "recommend-list";
  const entries = Object.entries(counts).filter(([, value]) => value > 0);

  if (entries.length === 0) {
    const row = document.createElement("li");
    row.className = "recommend-row";
    row.innerHTML = "<span>Kayit yok</span><strong>0</strong>";
    list.appendChild(row);
  } else {
    entries.forEach(([key, value]) => {
      const row = document.createElement("li");
      row.className = "recommend-row";
      row.innerHTML = `<span>${key}</span><strong>${value}</strong>`;
      list.appendChild(row);
    });
  }

  wrap.appendChild(list);
  return wrap;
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
