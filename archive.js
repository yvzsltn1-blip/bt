"use strict";

const archiveList = document.querySelector("#archiveList");
const archiveCountLabel = document.querySelector("#archiveCountLabel");
const archivePagination = document.querySelector("#archivePagination");
const archivePrevPageBtn = document.querySelector("#archivePrevPageBtn");
const archiveNextPageBtn = document.querySelector("#archiveNextPageBtn");
const archivePageInfo = document.querySelector("#archivePageInfo");
const archiveAdminAuthStatus = document.querySelector("#archiveAdminAuthStatus");
const archiveAdminEmailInput = document.querySelector("#archiveAdminEmailInput");
const archiveAdminPasswordInput = document.querySelector("#archiveAdminPasswordInput");
const archiveAdminLoginBtn = document.querySelector("#archiveAdminLoginBtn");
const archiveAdminLogoutBtn = document.querySelector("#archiveAdminLogoutBtn");

const PAGE_SIZE = 40;

let isAdminSession = false;
let allArchiveItems = [];
let archiveRemoteCursor = null;
let archiveRemoteHasMore = false;
let archiveCurrentPage = 0;

void bindAdminAuth();
void renderOverviewArchive();

archivePrevPageBtn?.addEventListener("click", () => {
  if (archiveCurrentPage <= 0) {
    return;
  }
  archiveCurrentPage -= 1;
  renderArchivePage();
});

archiveNextPageBtn?.addEventListener("click", async () => {
  const nextPageStart = (archiveCurrentPage + 1) * PAGE_SIZE;
  if (nextPageStart >= allArchiveItems.length && archiveRemoteHasMore) {
    await loadOverviewArchivePage();
  }
  if (nextPageStart >= allArchiveItems.length) {
    return;
  }
  archiveCurrentPage += 1;
  renderArchivePage();
});

archiveList?.addEventListener("click", async (event) => {
  const actionButton = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!actionButton) {
    return;
  }

  const action = actionButton.getAttribute("data-action");
  const id = actionButton.getAttribute("data-id") || "";
  if (!id) {
    return;
  }

  if (!isAdminSession) {
    window.alert("Bu islem icin once admin girisi yapin.");
    return;
  }

  if (action === "delete") {
    await handleDeleteArchive(id);
    return;
  }

  if (action === "edit") {
    await handleEditArchive(id);
  }
});

async function bindAdminAuth() {
  if (!window.AdminAuthUI || typeof window.AdminAuthUI.bindAdminControls !== "function") {
    return;
  }

  await window.AdminAuthUI.bindAdminControls({
    statusLabel: archiveAdminAuthStatus,
    emailInput: archiveAdminEmailInput,
    passwordInput: archiveAdminPasswordInput,
    loginButton: archiveAdminLoginBtn,
    logoutButton: archiveAdminLogoutBtn,
    onStateChange: (isAdmin) => {
      isAdminSession = isAdmin;
      renderArchivePage();
    }
  });
}

async function renderOverviewArchive() {
  await loadOverviewArchivePage({ reset: true });
  renderArchivePage();
}

function mergeArchiveItems(items) {
  const merged = new Map(allArchiveItems.map((item) => [item.id, item]));
  (items || []).forEach((item) => {
    if (item?.id) {
      merged.set(item.id, item);
    }
  });
  allArchiveItems = [...merged.values()].sort((left, right) => String(right?.savedAt || "").localeCompare(String(left?.savedAt || "")));
}

async function loadOverviewArchivePage({ reset = false } = {}) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchivesPage !== "function") {
    return;
  }

  if (reset) {
    archiveRemoteCursor = null;
    archiveRemoteHasMore = false;
    archiveCurrentPage = 0;
    allArchiveItems = [];
  }

  try {
    const page = await window.BTFirebase.loadOverviewArchivesPage({
      pageSize: PAGE_SIZE,
      cursor: reset ? null : archiveRemoteCursor
    });
    archiveRemoteCursor = page.cursor || archiveRemoteCursor;
    archiveRemoteHasMore = Boolean(page.hasMore);
    mergeArchiveItems(page.items || []);
  } catch (error) {
    console.warn("Arsiv sayfasi yuklenemedi.", error);
    if (typeof window.BTFirebase.loadOverviewArchives === "function") {
      mergeArchiveItems(await window.BTFirebase.loadOverviewArchives());
      archiveRemoteHasMore = false;
      archiveRemoteCursor = null;
    }
  }
}

function renderArchivePage() {
  if (!archiveList || !archiveCountLabel) {
    return;
  }

  archiveCountLabel.textContent = String(allArchiveItems.length);

  if (!allArchiveItems.length) {
    archiveList.innerHTML = '<p class="summary-empty">Henuz arsiv kaydi yok.</p>';
    if (archivePagination) {
      archivePagination.hidden = true;
    }
    return;
  }

  const start = archiveCurrentPage * PAGE_SIZE;
  const pageItems = allArchiveItems.slice(start, start + PAGE_SIZE);

  archiveList.innerHTML = `
    <div class="archive-table-wrap">
      <table class="archive-table">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Gold</th>
            <th>Ganimet Altin</th>
            <th>EXP</th>
            <th>Birlik Gucu</th>
            <th>Seviye</th>
            <th>Islem</th>
          </tr>
        </thead>
        <tbody>
          ${pageItems.map((item) => renderArchiveRow(item)).join("")}
        </tbody>
      </table>
    </div>
  `;

  if (archivePagination && archivePageInfo && archivePrevPageBtn && archiveNextPageBtn) {
    archivePagination.hidden = allArchiveItems.length <= PAGE_SIZE && !archiveRemoteHasMore;
    archivePageInfo.textContent = `${start + 1}-${start + pageItems.length} / ${allArchiveItems.length}`;
    archivePrevPageBtn.disabled = archiveCurrentPage === 0;
    archiveNextPageBtn.disabled = start + PAGE_SIZE >= allArchiveItems.length && !archiveRemoteHasMore;
  }
}

function renderArchiveRow(item) {
  const sourceType = item?.sourceType === "fill" ? "fill" : "manual";
  const manualIcon = sourceType === "manual"
    ? '<span class="archive-source-icon" title="Manuel kayit" aria-label="Manuel kayit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 5-3.4 9.2-7 10-3.6-.8-7-5-7-10V6l7-3z"></path><path d="M9.5 12.5l1.7 1.7 3.8-4.2"></path></svg></span>'
    : "";
  const savedAt = escapeHtml(formatDateTime(item?.savedAt));
  const goldValue = Number.isFinite(Number(item?.goldValue))
    ? Number(item.goldValue).toLocaleString("tr-TR")
    : String(item?.goldText || "-");
  const lootGoldValue = Number.isFinite(Number(item?.lootGoldValue))
    ? Number(item.lootGoldValue).toLocaleString("tr-TR")
    : String(item?.lootGoldText || "-");
  const expValue = Number.isFinite(Number(item?.expValue))
    ? Number(item.expValue).toLocaleString("tr-TR")
    : String(item?.expText || "-");
  const armyPowerDisplay = escapeHtml(formatArmyPowerDisplay(item?.armyPowerText || "-"));
  const actionDisabled = isAdminSession ? "" : "disabled";

  return `
    <tr>
      <td>${savedAt}</td>
      <td>
        <span class="archive-gold-cell">${manualIcon}<span>${escapeHtml(goldValue)}</span></span>
      </td>
      <td>${escapeHtml(lootGoldValue)}</td>
      <td>${escapeHtml(expValue)}</td>
      <td>${armyPowerDisplay}</td>
      <td>${escapeHtml(item?.levelText || "-")}</td>
      <td>
        <div class="archive-action-group">
          <button class="button button-ghost archive-action-btn" type="button" data-action="edit" data-id="${escapeAttribute(item?.id || "")}" ${actionDisabled} title="Duzenle" aria-label="Duzenle">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
          <button class="button button-ghost archive-action-btn archive-action-btn-danger" type="button" data-action="delete" data-id="${escapeAttribute(item?.id || "")}" ${actionDisabled} title="Sil" aria-label="Sil">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function formatArmyPowerDisplay(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") {
    return "-";
  }

  const slashMatch = text.match(/\/\s*(\d+)/);
  if (slashMatch) {
    const total = Number.parseInt(slashMatch[1], 10);
    if (!Number.isFinite(total)) {
      return "-";
    }
    return String(Math.max(0, Math.floor((total - 10) / 10)));
  }

  const directNumber = Number.parseInt(text.replace(/[^\d-]/g, ""), 10);
  if (Number.isFinite(directNumber)) {
    return String(directNumber);
  }

  return text;
}

async function handleDeleteArchive(id) {
  const item = allArchiveItems.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  if (!window.confirm("Bu satir silinsin mi?")) {
    return;
  }

  try {
    await window.BTFirebase.deleteOverviewArchive(id);
    allArchiveItems = allArchiveItems.filter((entry) => entry.id !== id);
    const maxPage = Math.max(0, Math.ceil(allArchiveItems.length / PAGE_SIZE) - 1);
    archiveCurrentPage = Math.min(archiveCurrentPage, maxPage);
    renderArchivePage();
  } catch (error) {
    console.warn("Arsiv satiri silinemedi.", error);
    window.alert(error?.message || "Satir silinemedi.");
  }
}

async function handleEditArchive(id) {
  const item = allArchiveItems.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  const currentGold = Number.isFinite(Number(item?.goldValue))
    ? Number(item.goldValue).toLocaleString("tr-TR")
    : String(item?.goldText || "");
  const currentArmyPower = formatArmyPowerDisplay(item?.armyPowerText || "-");
  const currentLevel = String(item?.levelText || "-");

  const nextGold = window.prompt("Yeni gold degeri", currentGold);
  if (nextGold === null) {
    return;
  }

  const nextArmyPower = window.prompt("Yeni birlik gucu degeri", currentArmyPower);
  if (nextArmyPower === null) {
    return;
  }

  const nextLevel = window.prompt("Yeni seviye", currentLevel);
  if (nextLevel === null) {
    return;
  }

  const normalizedGoldDigits = String(nextGold).replace(/[^\d]/g, "");
  const normalizedArmyPowerDigits = String(nextArmyPower).replace(/[^\d]/g, "");
  const normalizedLevelDigits = String(nextLevel).replace(/[^\d]/g, "");

  if (!normalizedGoldDigits) {
    window.alert("Gold sayisal olmali.");
    return;
  }

  if (!normalizedArmyPowerDigits) {
    window.alert("Birlik gucu sayisal olmali.");
    return;
  }

  if (!normalizedLevelDigits) {
    window.alert("Seviye sayisal olmali.");
    return;
  }

  const updatedItem = {
    ...item,
    goldText: normalizedGoldDigits,
    goldValue: Number.parseInt(normalizedGoldDigits, 10),
    armyPowerText: normalizedArmyPowerDigits,
    levelText: normalizedLevelDigits,
    updatedAt: new Date().toISOString()
  };

  try {
    const saved = await window.BTFirebase.updateOverviewArchive(updatedItem);
    allArchiveItems = allArchiveItems.map((entry) => (entry.id === id ? { ...saved, id } : entry));
    renderArchivePage();
  } catch (error) {
    console.warn("Arsiv satiri guncellenemedi.", error);
    window.alert(error?.message || "Satir guncellenemedi.");
  }
}

function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return String(value || "-");
  }
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
