"use strict";

const { ENEMY_UNITS, ALLY_UNITS } = window.BattleCore;

const wrongList = document.querySelector("#wrongList");
const wrongCountLabel = document.querySelector("#wrongCountLabel");
const clearWrongBtn = document.querySelector("#clearWrongBtn");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminLoginBtn = document.querySelector("#adminLoginBtn");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";
const unitLabelMap = new Map(
  [...ENEMY_UNITS, ...ALLY_UNITS].map((unit) => [unit.key, unit.label])
);

let isAdminSession = false;

syncAdminActions();

void renderWrongReports();
void bindAdminAuth();

clearWrongBtn.addEventListener("click", async () => {
  if (!isAdminSession) {
    return;
  }
  const items = await loadWrongReports();
  if (items.length === 0) {
    return;
  }
  if (!window.confirm("Tum yanlis raporlari silinsin mi?")) {
    return;
  }
  clearWrongBtn.disabled = true;
  try {
    await window.BTFirebase.clearWrongReports();
    await renderWrongReports();
  } catch (error) {
    console.warn("Yanlis raporlari silinemedi.", error);
  } finally {
    syncAdminActions();
  }
});

function syncAdminActions() {
  clearWrongBtn.disabled = !isAdminSession;
  clearWrongBtn.title = isAdminSession ? "" : "Tum raporlari silmek icin admin girisi gerekli.";
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
      await renderWrongReports();
    }
  });
}

async function loadWrongReports() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadWrongReports !== "function") {
    return [];
  }
  try {
    return await window.BTFirebase.loadWrongReports();
  } catch (error) {
    console.warn("Yanlis raporlari yuklenemedi.", error);
    return [];
  }
}

async function renderWrongReports() {
  const items = (await loadWrongReports()).sort((a, b) => (b.reportedAt || "").localeCompare(a.reportedAt || ""));
  wrongCountLabel.textContent = String(items.length);
  wrongList.innerHTML = "";
  syncAdminActions();

  if (items.length === 0) {
    wrongList.innerHTML = '<p class="summary-empty">Henuz kaydedilmis yanlis raporu yok.</p>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "saved-card";

    const head = document.createElement("div");
    head.className = "saved-card-head";

    const title = document.createElement("div");
    const titleText = item.source === "optimizer" && item.stage
      ? `${item.sourceLabel || "Optimizer"} / ${item.stage}. Kademe`
      : item.sourceLabel || "Simulasyon";
    title.innerHTML = `<strong>${titleText}</strong><span>${formatDate(item.reportedAt)}</span>`;

    const actions = document.createElement("div");
    actions.className = "actions actions-inline";
    if (hasCountsForSimulation(item)) {
      const openBtn = document.createElement("button");
      openBtn.className = "button button-secondary";
      openBtn.type = "button";
      openBtn.textContent = "Simulasyonda Ac";
      openBtn.addEventListener("click", () => {
        openSimulationForCounts(item.enemyCounts || {}, item.allyCounts || {});
      });
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
          await window.BTFirebase.deleteWrongReport(item.id);
          await renderWrongReports();
        } finally {
          deleteBtn.disabled = false;
        }
      });
      actions.append(deleteBtn);
    }
    head.append(title, actions);

    const meta = document.createElement("div");
    meta.className = "saved-meta";
    const metaParts = [
      `<span>Kaynak: <strong>${item.sourceLabel || "-"}</strong></span>`,
      item.stage ? `<span>Kademe: <strong>${item.stage}</strong></span>` : "",
      item.modeLabel ? `<span>Mod: <strong>${item.modeLabel}</strong></span>` : "",
      Number.isFinite(item.pointLimit) ? `<span>Limit: <strong>${item.pointLimit}</strong></span>` : "",
      Number.isFinite(item.usedPoints) ? `<span>Kullanilan puan: <strong>${item.usedPoints}</strong></span>` : "",
      Number.isFinite(item.winRate) ? `<span>Kazanma orani: <strong>%${item.winRate}</strong></span>` : "",
      Number.isFinite(item.lostBlood) ? `<span>Kan kaybi: <strong>${item.lostBlood}</strong></span>` : ""
    ].filter(Boolean);
    meta.innerHTML = metaParts.join("");

    const grid = document.createElement("div");
    grid.className = "saved-columns";
    grid.append(renderCountBlock("Rakip Ordu", item.enemyCounts || {}, ENEMY_UNITS));
    grid.append(renderCountBlock(item.source === "optimizer" ? "Bizdeki Ordu" : "Muttefikler", item.allyCounts || {}, ALLY_UNITS));
    if (item.recommendationCounts) {
      grid.append(renderCountBlock("Onerilen Cozum", item.recommendationCounts, ALLY_UNITS));
    }

    const summaryGrid = document.createElement("div");
    summaryGrid.className = "wrong-summary-grid";

    const expectedWrap = document.createElement("section");
    expectedWrap.className = "wrong-summary-block";
    const expectedHeading = document.createElement("h3");
    expectedHeading.textContent = "Beklenen Sonuc";
    const expectedBlock = document.createElement("div");
    expectedBlock.className = "terminal-block";
    renderStyledLines((item.summaryText || "").split("\n"), expectedBlock);
    expectedWrap.append(expectedHeading, expectedBlock);

    const actualWrap = document.createElement("section");
    actualWrap.className = "wrong-summary-block";
    const actualHeading = document.createElement("h3");
    actualHeading.textContent = "Gercek Sonuc";
    const actualBlock = document.createElement("div");
    actualBlock.className = "terminal-block";
    renderStyledLines((item.actualSummaryText || "Gercek sonuc girilmemis.").split("\n"), actualBlock);
    actualWrap.append(actualHeading, actualBlock);
    summaryGrid.append(expectedWrap, actualWrap);

    const logWrap = document.createElement("details");
    logWrap.className = "wrong-log-wrap";
    const logSummary = document.createElement("summary");
    logSummary.textContent = "Savas Gunlugunu Goster";
    const logBlock = document.createElement("div");
    logBlock.className = "terminal-block wrong-log-block";
    renderStyledLines((item.logText || "").split("\n"), logBlock);
    logWrap.append(logSummary, logBlock);

    if (item.actualNote) {
      const note = document.createElement("p");
      note.className = "summary-empty";
      note.textContent = `Not: ${item.actualNote}`;
      card.append(head, meta, grid, summaryGrid, note, logWrap);
    } else {
      card.append(head, meta, grid, summaryGrid, logWrap);
    }
    wrongList.appendChild(card);
  });
}

function hasCountsForSimulation(item) {
  return !!(
    item &&
    item.enemyCounts &&
    item.allyCounts &&
    Object.keys(item.enemyCounts).length > 0 &&
    Object.keys(item.allyCounts).length > 0
  );
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

function renderCountBlock(title, counts, units) {
  const wrap = document.createElement("section");
  wrap.className = "saved-mini-block";

  const heading = document.createElement("h3");
  heading.textContent = title;
  wrap.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "recommend-list";
  const entries = (units || [])
    .map((unit) => [unit.key, counts?.[unit.key] || 0])
    .filter(([, value]) => value > 0);

  if (entries.length === 0) {
    const row = document.createElement("li");
    row.className = "recommend-row";
    row.innerHTML = "<span>Kayit yok</span><strong>0</strong>";
    list.appendChild(row);
  } else {
    entries.forEach(([key, value]) => {
      const row = document.createElement("li");
      row.className = "recommend-row";
      row.innerHTML = `<span>${unitLabelMap.get(key) || key}</span><strong>${value}</strong>`;
      list.appendChild(row);
    });
  }

  wrap.appendChild(list);
  return wrap;
}

function renderStyledLines(lines, target) {
  lines.forEach((line) => {
    const row = document.createElement("span");
    const cssClass = classifyLine(line);
    row.className = `log-line${cssClass ? ` ${cssClass}` : ""}`;
    appendLineWithHighlights(row, line, cssClass);
    target.appendChild(row);
  });
}

const HIGHLIGHTABLE_CLASSES = new Set(["damage", "splash", "buff", "disadv", "status", "event", "ally", "enemy", "formula", "section-total", "matchup"]);

const HIGHLIGHT_PATTERNS = [
  { regex: /\b\d+\s+(?:\S+\s+){0,2}(?:hasar(?:i)?|damage)\b/g, kind: "hl-damage" },
  { regex: /\b\d+\s+(?:toplam\s+|total\s+)?(?:can|hp|birim|units|atk)\b/g, kind: "hl-stat" },
  { regex: /^\s*\d+(?=\s+\S)/g, kind: "hl-stat" },
  { regex: /\+%\d+(?:\.\d+)?/g, kind: "hl-mult" },
  { regex: /-%\d+(?:\.\d+)?/g, kind: "hl-mult-neg" },
  { regex: /(?<!\w)x\d+(?:\.\d+)?(?=\s|$|\])/g, kind: "hl-mult" }
];

function appendLineWithHighlights(row, line, cssClass) {
  if (!HIGHLIGHTABLE_CLASSES.has(cssClass)) {
    row.textContent = line;
    return;
  }
  const matches = [];
  HIGHLIGHT_PATTERNS.forEach((p) => {
    p.regex.lastIndex = 0;
    let m;
    while ((m = p.regex.exec(line)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], kind: p.kind });
    }
  });
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered = [];
  let lastEnd = 0;
  matches.forEach((m) => {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  });
  if (filtered.length === 0) {
    row.textContent = line;
    return;
  }
  let cursor = 0;
  filtered.forEach((m) => {
    if (m.start > cursor) {
      row.appendChild(document.createTextNode(line.slice(cursor, m.start)));
    }
    const span = document.createElement("span");
    span.className = m.kind;
    span.textContent = m.text;
    row.appendChild(span);
    cursor = m.end;
  });
  if (cursor < line.length) {
    row.appendChild(document.createTextNode(line.slice(cursor)));
  }
}

function classifyLine(line) {
  const stripped = line.trim();
  if (stripped.startsWith("---")) {
    return "sep";
  }
  if (stripped.includes("═")) {
    return "banner";
  }
  if (stripped.startsWith("── Raund") && stripped.endsWith("sonu ──")) {
    return "round-end";
  }
  if (stripped === "DUSMAN SAFLARI" || stripped === "MUTTEFIK SAFLARI" || stripped === "ENEMY RANKS" || stripped === "ALLY RANKS") {
    return "section-head";
  }
  if (
    stripped.startsWith("─ Dusman toplam atak") ||
    stripped.startsWith("─ Muttefik toplam atak") ||
    stripped.startsWith("─ Enemy total attack") ||
    stripped.startsWith("─ Ally total attack")
  ) {
    return "section-total";
  }
  if (stripped.startsWith(">>")) {
    return "win";
  }
  if (/^(?:Hamle|Turn)\s+\d+$/.test(stripped)) {
    return "turn";
  }
  if (stripped.startsWith("Raund") || stripped.startsWith("Round")) {
    return "round";
  }
  if (stripped.startsWith("Hesap:") || stripped.startsWith("Calc:")) {
    return "formula";
  }
  if (stripped.includes(" → ") && !stripped.startsWith("-") && !stripped.startsWith("↳")) {
    return "matchup";
  }
  if (
    stripped.startsWith("Kayip Birlikler") ||
    stripped.startsWith("Lost Units") ||
    stripped.startsWith("Toplam birlik kapasitesi") ||
    stripped.startsWith("Total army capacity") ||
    stripped.includes("SAVAS  SONUCU") ||
    stripped.includes("OPTIMIZER  SONUCU") ||
    stripped.includes("ORNEK  SAVAS") ||
    stripped.includes("TUR  TUR  ANALIZ")
  ) {
    return "header";
  }
  if (stripped.includes("yok edildi") || stripped.includes("completely destroyed")) {
    return "destroy";
  }
  if (
    stripped.startsWith("her raundun") ||
    stripped.startsWith("each round's") ||
    stripped.startsWith("onerilen duzenin") ||
    stripped.startsWith("sample battle log") ||
    stripped.startsWith("Baslangic muharebe duzeni") ||
    stripped.startsWith("Initial battle formation")
  ) {
    return "subhead";
  }
  if (stripped.includes("hasar vurdu") || stripped.includes("damage dealt")) {
    return "damage";
  }
  if (
    stripped.includes("yayilma hasari") ||
    stripped.includes("intikam hasari") ||
    stripped.includes("splash damage") ||
    stripped.includes("revenge damage") ||
    stripped.includes("overkill damage") ||
    stripped.includes("(overkill)")
  ) {
    return "splash";
  }
  if (
    stripped.includes("birim kaybetti") ||
    stripped.includes("units lost") ||
    stripped.includes("birim / ") ||
    stripped.includes("units / ") ||
    stripped.includes("birim kaldi") ||
    stripped.includes("units remaining") ||
    stripped.startsWith("↳")
  ) {
    return "status";
  }
  if (
    stripped.includes("ustunlugune sahip") ||
    stripped.includes("type advantage") ||
    stripped.includes("carpani kazandi") ||
    stripped.includes("damage multiplier") ||
    stripped.includes("guclendirdi") ||
    stripped.includes("empowered") ||
    stripped.includes("biriktirdi") ||
    stripped.includes("stored damage") ||
    stripped.includes("dogurdu") ||
    stripped.includes("spawned") ||
    stripped.includes("geri dirildi") ||
    stripped.includes("revived with") ||
    /\+%\d/.test(stripped)
  ) {
    return "buff";
  }
  if (
    stripped.includes("dezavantajli") ||
    stripped.includes("type-disadvantaged") ||
    stripped.includes("azalmis hasar") ||
    stripped.includes("reduced damage") ||
    stripped.includes("azaltti") ||
    stripped.includes("azaltiyor") ||
    stripped.includes("is reducing") ||
    stripped.includes("hizini") ||
    stripped.includes("speed by") ||
    stripped.includes("hizi artik") ||
    stripped.includes("speed is now") ||
    stripped.includes("sifirlandi") ||
    stripped.includes("was reset") ||
    /-%\d/.test(stripped)
  ) {
    return "disadv";
  }
  if (stripped.startsWith("-") || stripped.startsWith("=")) {
    return "event";
  }
  if (stripped.includes(" can") || stripped.includes(" hp")) {
    return isAllyLine(stripped) ? "ally" : "enemy";
  }
  return "";
}

function isAllyLine(line) {
  const allyNames = [
    "Yarasalar", "Gulyabaniler", "Vampir Koleler", "Bansiler",
    "Nekromantlar", "Gargoyller", "Kan Cadilari", "Curuk Ceneler",
    "Bats", "Ghouls", "Thralls", "Banshees",
    "Necromancers", "Gargoyles", "Blood Witches", "Rotmaws"
  ];
  return allyNames.some((name) => line.includes(name));
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
