const SKILL_CALC_SKILLS = [
  { key: "strength", label: "Guc", icon: "S" },
  { key: "defense", label: "Savunma", icon: "D" },
  { key: "dexterity", label: "Beceri", icon: "B" },
  { key: "endurance", label: "Dayaniklilik", icon: "Y" },
  { key: "charisma", label: "Karizma", icon: "K" }
];

const skillCalcState = {
  mode: "target",
  selectedSkill: "strength",
  activeDiscount: "none",
  strategy: "equal",
  selectedMultiSkills: new Set(SKILL_CALC_SKILLS.map((skill) => skill.key)),
  plannerStrategy: "optimal",
  selectedPlannerSkills: new Set(SKILL_CALC_SKILLS.map((skill) => skill.key))
};

const skillCalcElements = {
  targetModeBtn: document.getElementById("targetModeBtn"),
  budgetModeBtn: document.getElementById("budgetModeBtn"),
  multiModeBtn: document.getElementById("multiModeBtn"),
  discount60Toggle: document.getElementById("skillDiscount60Toggle"),
  discount30Toggle: document.getElementById("skillDiscount30Toggle"),
  statusLabel: document.getElementById("skillStatusLabel"),
  resultCaption: document.getElementById("skillResultCaption"),
  singleSkillSection: document.getElementById("singleSkillSection"),
  multiSkillSection: document.getElementById("multiSkillSection"),
  singleSkillGrid: document.getElementById("singleSkillGrid"),
  multiSkillGrid: document.getElementById("multiSkillGrid"),
  currentSkillLabel: document.getElementById("currentSkillLabel"),
  targetSkillLabel: document.getElementById("targetSkillLabel"),
  currentSkillInput: document.getElementById("currentSkillInput"),
  targetSkillInput: document.getElementById("targetSkillInput"),
  goldSkillInput: document.getElementById("goldSkillInput"),
  goldSkillField: document.getElementById("goldSkillField"),
  targetSkillField: document.getElementById("targetSkillField"),
  summaryPanel: document.getElementById("skillSummaryPanel"),
  equalStrategyBtn: document.getElementById("equalStrategyBtn"),
  optimalStrategyBtn: document.getElementById("optimalStrategyBtn"),
  resetSingleBtn: document.getElementById("skillResetSingleBtn"),
  quickExampleBtn: document.getElementById("skillQuickExampleBtn"),
  resetMultiBtn: document.getElementById("skillResetMultiBtn"),
  presetAllSkillsBtn: document.getElementById("presetAllSkillsBtn"),
  presetFightSkillsBtn: document.getElementById("presetFightSkillsBtn"),
  presetWarriorSkillsBtn: document.getElementById("presetWarriorSkillsBtn"),
  presetTankSkillsBtn: document.getElementById("presetTankSkillsBtn"),
  multiStrengthInput: document.getElementById("multiStrengthInput"),
  multiDefenseInput: document.getElementById("multiDefenseInput"),
  multiDexterityInput: document.getElementById("multiDexterityInput"),
  multiEnduranceInput: document.getElementById("multiEnduranceInput"),
  multiCharismaInput: document.getElementById("multiCharismaInput"),
  multiGoldInput: document.getElementById("multiGoldInput"),
  plannerSkillGrid: document.getElementById("plannerSkillGrid"),
  plannerSummaryPanel: document.getElementById("skillGoldPlannerSummary"),
  plannerEqualBtn: document.getElementById("plannerEqualBtn"),
  plannerOptimalBtn: document.getElementById("plannerOptimalBtn"),
  plannerPresetAllBtn: document.getElementById("plannerPresetAllBtn"),
  plannerPresetFightBtn: document.getElementById("plannerPresetFightBtn"),
  plannerPresetWarriorBtn: document.getElementById("plannerPresetWarriorBtn"),
  plannerPresetTankBtn: document.getElementById("plannerPresetTankBtn"),
  plannerResetBtn: document.getElementById("plannerResetBtn"),
  plannerStrengthInput: document.getElementById("plannerStrengthInput"),
  plannerDefenseInput: document.getElementById("plannerDefenseInput"),
  plannerDexterityInput: document.getElementById("plannerDexterityInput"),
  plannerEnduranceInput: document.getElementById("plannerEnduranceInput"),
  plannerCharismaInput: document.getElementById("plannerCharismaInput"),
  plannerGoldInput: document.getElementById("plannerGoldInput")
};

function skillCalcFormat(value) {
  return new Intl.NumberFormat("tr-TR").format(Math.max(0, Math.floor(Number(value) || 0)));
}

function skillCalcCleanNumber(value) {
  const parsed = parseInt(String(value || "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function skillCalcGetDiscountMultiplier() {
  if (skillCalcState.activeDiscount === "60") {
    return 0.4;
  }
  if (skillCalcState.activeDiscount === "30") {
    return 0.7;
  }
  return 1;
}

function skillCalcGetDiscountLabel() {
  if (skillCalcState.activeDiscount === "60") {
    return "%60 indirimli";
  }
  if (skillCalcState.activeDiscount === "30") {
    return "%30 indirimli";
  }
  return "Normal";
}

function skillCalcCost(level, multiplier = skillCalcGetDiscountMultiplier()) {
  const normalizedLevel = Math.max(5, Number(level) || 5);
  const baseCost = Math.pow(normalizedLevel - 4, 2.4);
  return Math.floor(baseCost * multiplier);
}

function skillCalcTotalCost(fromLevel, toLevel, multiplier = skillCalcGetDiscountMultiplier()) {
  const startLevel = Math.max(5, skillCalcCleanNumber(fromLevel));
  const endLevel = Math.max(startLevel, skillCalcCleanNumber(toLevel));
  let total = 0;
  for (let level = startLevel; level < endLevel; level += 1) {
    total += skillCalcCost(level, multiplier);
  }
  return total;
}

function skillCalcBuyWithBudget(startLevel, goldBudget, multiplier = skillCalcGetDiscountMultiplier()) {
  let level = Math.max(5, skillCalcCleanNumber(startLevel));
  let remaining = Math.max(0, skillCalcCleanNumber(goldBudget));
  let spent = 0;
  const steps = [];

  while (steps.length < 50000) {
    const nextCost = skillCalcCost(level, multiplier);
    if (nextCost > remaining) {
      break;
    }
    remaining -= nextCost;
    spent += nextCost;
    steps.push({ from: level, to: level + 1, cost: nextCost });
    level += 1;
  }

  return {
    finalLevel: level,
    gainedLevels: steps.length,
    spentGold: spent,
    remainingGold: remaining,
    steps
  };
}

function skillCalcGetValuesFromInputs(inputs) {
  return {
    strength: skillCalcCleanNumber(inputs.strength.value),
    defense: skillCalcCleanNumber(inputs.defense.value),
    dexterity: skillCalcCleanNumber(inputs.dexterity.value),
    endurance: skillCalcCleanNumber(inputs.endurance.value),
    charisma: skillCalcCleanNumber(inputs.charisma.value)
  };
}

function skillCalcGetMultiValues() {
  return skillCalcGetValuesFromInputs({
    strength: skillCalcElements.multiStrengthInput,
    defense: skillCalcElements.multiDefenseInput,
    dexterity: skillCalcElements.multiDexterityInput,
    endurance: skillCalcElements.multiEnduranceInput,
    charisma: skillCalcElements.multiCharismaInput
  });
}

function skillCalcGetPlannerValues() {
  return skillCalcGetValuesFromInputs({
    strength: skillCalcElements.plannerStrengthInput,
    defense: skillCalcElements.plannerDefenseInput,
    dexterity: skillCalcElements.plannerDexterityInput,
    endurance: skillCalcElements.plannerEnduranceInput,
    charisma: skillCalcElements.plannerCharismaInput
  });
}

function skillCalcEqualDistribution(values, goldBudget, selectedKeysSource = skillCalcState.selectedMultiSkills) {
  const selectedKeys = Array.isArray(selectedKeysSource) ? selectedKeysSource : [...selectedKeysSource];
  const share = selectedKeys.length ? Math.floor(goldBudget / selectedKeys.length) : 0;
  const splitRemainder = selectedKeys.length ? goldBudget - share * selectedKeys.length : goldBudget;

  const rows = SKILL_CALC_SKILLS.map((skill) => {
    const selected = selectedKeys.includes(skill.key);
    const result = skillCalcBuyWithBudget(values[skill.key], selected ? share : 0);
    return {
      ...skill,
      selected,
      startLevel: values[skill.key],
      nextCost: skillCalcCost(result.finalLevel),
      ...result
    };
  });

  return {
    rows,
    selectedCount: selectedKeys.length,
    share,
    spentGold: rows.reduce((sum, row) => sum + row.spentGold, 0),
    gainedLevels: rows.reduce((sum, row) => sum + row.gainedLevels, 0),
    remainingGold: rows.reduce((sum, row) => sum + row.remainingGold, 0) + splitRemainder
  };
}

function skillCalcOptimalDistribution(values, goldBudget, selectedKeysSource = skillCalcState.selectedMultiSkills) {
  const selectedKeys = Array.isArray(selectedKeysSource) ? new Set(selectedKeysSource) : new Set(selectedKeysSource);
  let remainingGold = Math.max(0, skillCalcCleanNumber(goldBudget));
  const steps = [];
  const rows = SKILL_CALC_SKILLS.map((skill) => ({
    ...skill,
    selected: selectedKeys.has(skill.key),
    startLevel: values[skill.key],
    finalLevel: Math.max(5, values[skill.key]),
    spentGold: 0,
    gainedLevels: 0
  }));

  let safetyCounter = 0;
  while (safetyCounter < 50000) {
    const candidate = rows
      .filter((row) => row.selected)
      .map((row) => ({ key: row.key, nextCost: skillCalcCost(row.finalLevel) }))
      .sort((left, right) => left.nextCost - right.nextCost)[0];

    if (!candidate || candidate.nextCost > remainingGold) {
      break;
    }

    const row = rows.find((item) => item.key === candidate.key);
    steps.push({
      key: row.key,
      label: row.label,
      from: row.finalLevel,
      to: row.finalLevel + 1,
      cost: candidate.nextCost
    });
    row.finalLevel += 1;
    row.spentGold += candidate.nextCost;
    row.gainedLevels += 1;
    remainingGold -= candidate.nextCost;
    safetyCounter += 1;
  }

  rows.forEach((row) => {
    row.nextCost = skillCalcCost(row.finalLevel);
  });

  return {
    rows,
    selectedCount: [...selectedKeys].length,
    share: 0,
    spentGold: rows.reduce((sum, row) => sum + row.spentGold, 0),
    gainedLevels: rows.reduce((sum, row) => sum + row.gainedLevels, 0),
    remainingGold,
    steps
  };
}

function skillCalcSummaryCard(title, value, copy) {
  return `
    <article class="skill-summary-card">
      <span class="skill-summary-eyebrow">${title}</span>
      <span class="skill-summary-value">${value}</span>
      <p class="skill-summary-copy">${copy}</p>
    </article>
  `;
}

function skillCalcBreakdownRow(label, value) {
  return `
    <div class="skill-breakdown-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function skillCalcBadge(label) {
  return `<span class="skill-plan-badge">${label}</span>`;
}

function skillCalcGetSelectionModeLabel(selectedCount, strategy) {
  if (selectedCount <= 1) {
    return "Tek Skill Odagi";
  }
  return strategy === "equal" ? "Esit Dagit" : "Optimum Dagit";
}

function skillCalcRenderSkillButtons(container, selectedKeys, isMultiMode) {
  container.innerHTML = SKILL_CALC_SKILLS.map((skill) => {
    const active = isMultiMode ? selectedKeys.has(skill.key) : selectedKeys === skill.key;
    return `
      <button class="skill-chip${active ? " is-active" : ""}" type="button" data-skill-key="${skill.key}">
        <span class="skill-chip-emoji" aria-hidden="true">${skill.icon}</span>
        <span class="skill-chip-label">${skill.label}</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll("[data-skill-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const skillKey = button.getAttribute("data-skill-key");
      if (isMultiMode) {
        if (skillCalcState.selectedMultiSkills.has(skillKey)) {
          skillCalcState.selectedMultiSkills.delete(skillKey);
        } else {
          skillCalcState.selectedMultiSkills.add(skillKey);
        }
      } else {
        skillCalcState.selectedSkill = skillKey;
      }
      skillCalcRender();
    });
  });
}

function skillCalcRenderSingleResults() {
  const activeSkill = SKILL_CALC_SKILLS.find((skill) => skill.key === skillCalcState.selectedSkill);
  const currentLevel = skillCalcCleanNumber(skillCalcElements.currentSkillInput.value);
  const targetLevel = skillCalcCleanNumber(skillCalcElements.targetSkillInput.value);
  const goldBudget = skillCalcCleanNumber(skillCalcElements.goldSkillInput.value);

  skillCalcElements.currentSkillLabel.textContent = `Mevcut ${activeSkill.label}`;
  skillCalcElements.targetSkillLabel.textContent = `Hedef ${activeSkill.label}`;

  if (skillCalcState.mode === "target") {
    const totalCost = skillCalcTotalCost(currentLevel, targetLevel);
    const undiscountedCost = skillCalcTotalCost(currentLevel, targetLevel, 1);

    skillCalcElements.summaryPanel.innerHTML = `
      <div class="skill-summary-grid">
        ${skillCalcSummaryCard("Toplam Maliyet", `${skillCalcFormat(totalCost)} altin`, `${skillCalcFormat(currentLevel)} -> ${skillCalcFormat(Math.max(currentLevel, targetLevel))} ${activeSkill.label.toLowerCase()} gecisi`)}
        ${skillCalcSummaryCard("Skill Artisi", `+${skillCalcFormat(Math.max(0, targetLevel - currentLevel))}`, "Bu mod sadece hedef seviye arasindaki farki hesaplar.")}
        ${skillCalcSummaryCard("Indirim Kazanci", `${skillCalcFormat(Math.max(0, undiscountedCost - totalCost))} altin`, skillCalcState.activeDiscount === "none" ? "Indirim kapali, ek tasarruf yok." : `${skillCalcGetDiscountLabel()} secili oldugu icin toplam tasarruf.`)}
      </div>
      <section class="skill-breakdown-card">
        <h3 class="skill-note-title">Hesap Ozeti</h3>
        <div class="skill-breakdown-list">
          ${skillCalcBreakdownRow("Aktif skill", activeSkill.label)}
          ${skillCalcBreakdownRow("Baslangic seviyesi", `${skillCalcFormat(currentLevel)} skill`)}
          ${skillCalcBreakdownRow("Hedef seviye", `${skillCalcFormat(Math.max(currentLevel, targetLevel))} skill`)}
          ${skillCalcBreakdownRow("Maliyet modeli", skillCalcGetDiscountLabel())}
        </div>
      </section>
    `;
    return;
  }

  const budgetResult = skillCalcBuyWithBudget(currentLevel, goldBudget);
  const stepsMarkup = budgetResult.steps.slice(0, 6).map((step) => (
    skillCalcBreakdownRow(`${skillCalcFormat(step.from)} -> ${skillCalcFormat(step.to)}`, `${skillCalcFormat(step.cost)} altin`)
  )).join("");

  skillCalcElements.summaryPanel.innerHTML = `
    <div class="skill-summary-grid">
      ${skillCalcSummaryCard("Ulasilacak Seviye", `${skillCalcFormat(budgetResult.finalLevel)} ${activeSkill.label}`, `Toplam +${skillCalcFormat(budgetResult.gainedLevels)} skill puani`)}
      ${skillCalcSummaryCard("Harcanan Altin", `${skillCalcFormat(budgetResult.spentGold)} altin`, `Kalan: ${skillCalcFormat(budgetResult.remainingGold)} altin`)}
      ${skillCalcSummaryCard("Sonraki Basim", `${skillCalcFormat(skillCalcCost(budgetResult.finalLevel))} altin`, "Butce bittiginde siradaki tek basim maliyeti")}
    </div>
    <section class="skill-breakdown-card">
      <h3 class="skill-note-title">Ilk Basimlar</h3>
      <div class="skill-breakdown-list">
        ${stepsMarkup || '<p class="skill-empty">Bu butce ile bir sonraki skill puani alinmiyor.</p>'}
      </div>
    </section>
  `;
}

function skillCalcRenderMultiResults() {
  const values = skillCalcGetMultiValues();
  const goldBudget = skillCalcCleanNumber(skillCalcElements.multiGoldInput.value);
  const result = skillCalcState.strategy === "equal"
    ? skillCalcEqualDistribution(values, goldBudget)
    : skillCalcOptimalDistribution(values, goldBudget);

  const rowsMarkup = result.rows.map((row) => (
    skillCalcBreakdownRow(
      `${row.label}: ${skillCalcFormat(row.startLevel)} -> ${skillCalcFormat(row.finalLevel)}`,
      `+${skillCalcFormat(row.gainedLevels)} / ${skillCalcFormat(row.spentGold)} altin`
    )
  )).join("");

  skillCalcElements.summaryPanel.innerHTML = `
    <div class="skill-summary-grid">
      ${skillCalcSummaryCard("Toplam Artis", `+${skillCalcFormat(result.gainedLevels)}`, "Secili skilller arasinda dagitilan toplam puan")}
      ${skillCalcSummaryCard("Harcanan Altin", `${skillCalcFormat(result.spentGold)} altin`, `Kalan: ${skillCalcFormat(result.remainingGold)} altin`)}
      ${skillCalcSummaryCard("Dagitim Turu", skillCalcState.strategy === "equal" ? "Esit" : "Optimum", skillCalcState.strategy === "equal" ? `Skill basi pay: ${skillCalcFormat(result.share)} altin` : "Her turda en ucuz puan satin alinir")}
    </div>
    <section class="skill-breakdown-card">
      <h3 class="skill-note-title">Skill Bazli Dagilim</h3>
      <div class="skill-breakdown-list">
        ${rowsMarkup || '<p class="skill-empty">En az bir skill secilmedigi icin dagitim yapilmadi.</p>'}
      </div>
    </section>
  `;
}

function skillCalcRenderPlannerResults() {
  const values = skillCalcGetPlannerValues();
  const goldBudget = skillCalcCleanNumber(skillCalcElements.plannerGoldInput.value);
  const selectedKeys = [...skillCalcState.selectedPlannerSkills];

  if (!selectedKeys.length) {
    skillCalcElements.plannerSummaryPanel.innerHTML = `
      <section class="skill-breakdown-card">
        <h3 class="skill-note-title">Altin Plani</h3>
        <p class="skill-empty">Altini dagitmak icin en az bir skill sec.</p>
      </section>
    `;
    return;
  }

  const result = skillCalcState.plannerStrategy === "equal"
    ? skillCalcEqualDistribution(values, goldBudget, selectedKeys)
    : skillCalcOptimalDistribution(values, goldBudget, selectedKeys);
  const selectedRows = result.rows.filter((row) => row.selected);
  const highestRow = [...selectedRows].sort((left, right) => right.finalLevel - left.finalLevel)[0] || null;
  const planModeLabel = skillCalcGetSelectionModeLabel(selectedKeys.length, skillCalcState.plannerStrategy);
  const previewSteps = skillCalcState.plannerStrategy === "optimal"
    ? (result.steps || []).slice(0, 8)
    : selectedRows.flatMap((row) => row.steps.slice(0, 2).map((step) => ({
      label: row.label,
      from: step.from,
      to: step.to,
      cost: step.cost
    }))).slice(0, 8);
  const detailRows = selectedRows.map((row) => (
    skillCalcBreakdownRow(
      `${row.label}: ${skillCalcFormat(row.startLevel)} -> ${skillCalcFormat(row.finalLevel)}`,
      `+${skillCalcFormat(row.gainedLevels)} / ${skillCalcFormat(row.spentGold)} altin / sonraki ${skillCalcFormat(row.nextCost)}`
    )
  )).join("");
  const stepRows = previewSteps.map((step, index) => (
    skillCalcBreakdownRow(
      `${index + 1}. ${step.label}: ${skillCalcFormat(step.from)} -> ${skillCalcFormat(step.to)}`,
      `${skillCalcFormat(step.cost)} altin`
    )
  )).join("");

  skillCalcElements.plannerSummaryPanel.innerHTML = `
    <div class="skill-summary-grid">
      ${skillCalcSummaryCard("Toplam Artis", `+${skillCalcFormat(result.gainedLevels)}`, `${skillCalcFormat(goldBudget)} altin ile secili skilllere eklenen toplam puan`)}
      ${skillCalcSummaryCard("Plan Tipi", planModeLabel, `${selectedKeys.length === 1 ? "Tum altin tek skill'e yukleniyor." : skillCalcState.plannerStrategy === "equal" ? `Skill basi pay: ${skillCalcFormat(result.share)} altin` : "Her turda en ucuz puan satin alinir."}`)}
      ${skillCalcSummaryCard("Lider Sonuc", highestRow ? `${highestRow.label} ${skillCalcFormat(highestRow.finalLevel)}` : "-", `Harcanan ${skillCalcFormat(result.spentGold)} / kalan ${skillCalcFormat(result.remainingGold)} altin`)}
    </div>
    <div class="skill-plan-badge-row">
      ${skillCalcBadge(`Secili: ${selectedKeys.length} skill`)}
      ${skillCalcBadge(`Indirim: ${skillCalcGetDiscountLabel()}`)}
      ${skillCalcBadge(`Basim Plani: ${skillCalcState.plannerStrategy === "equal" ? "Esit" : "Optimum"}`)}
    </div>
    <section class="skill-breakdown-card">
      <h3 class="skill-note-title">Secili Skill Sonuclari</h3>
      <div class="skill-breakdown-list">
        ${detailRows}
      </div>
    </section>
    <section class="skill-breakdown-card">
      <h3 class="skill-note-title">Ilk Alim Sirasi</h3>
      <div class="skill-breakdown-list">
        ${stepRows || '<p class="skill-empty">Bu altinla yeni basim alinmiyor.</p>'}
      </div>
    </section>
  `;
}

function skillCalcRender() {
  skillCalcElements.targetModeBtn.classList.toggle("is-active", skillCalcState.mode === "target");
  skillCalcElements.budgetModeBtn.classList.toggle("is-active", skillCalcState.mode === "budget");
  skillCalcElements.multiModeBtn.classList.toggle("is-active", skillCalcState.mode === "multi");
  skillCalcElements.equalStrategyBtn.classList.toggle("is-active", skillCalcState.strategy === "equal");
  skillCalcElements.optimalStrategyBtn.classList.toggle("is-active", skillCalcState.strategy === "optimal");
  skillCalcElements.plannerEqualBtn.classList.toggle("is-active", skillCalcState.plannerStrategy === "equal");
  skillCalcElements.plannerOptimalBtn.classList.toggle("is-active", skillCalcState.plannerStrategy === "optimal");
  skillCalcElements.discount60Toggle.classList.toggle("is-on", skillCalcState.activeDiscount === "60");
  skillCalcElements.discount30Toggle.classList.toggle("is-on", skillCalcState.activeDiscount === "30");
  skillCalcElements.discount60Toggle.setAttribute("aria-pressed", skillCalcState.activeDiscount === "60" ? "true" : "false");
  skillCalcElements.discount30Toggle.setAttribute("aria-pressed", skillCalcState.activeDiscount === "30" ? "true" : "false");
  skillCalcElements.singleSkillSection.hidden = skillCalcState.mode === "multi";
  skillCalcElements.multiSkillSection.hidden = skillCalcState.mode !== "multi";
  skillCalcElements.targetSkillField.hidden = skillCalcState.mode !== "target";
  skillCalcElements.goldSkillField.hidden = skillCalcState.mode !== "budget";
  skillCalcElements.statusLabel.textContent = skillCalcState.mode === "target" ? "Hedef" : skillCalcState.mode === "budget" ? "Butce" : "Coklu";
  skillCalcElements.resultCaption.textContent = skillCalcState.mode === "target"
    ? "Tek skill hedef maliyeti gosteriliyor."
    : skillCalcState.mode === "budget"
      ? "Belirli bir butceyle alinabilecek tek skill artisi gosteriliyor."
      : "Butceyi secili skilller arasinda dagitip toplu sonuc cikariliyor.";

  skillCalcRenderSkillButtons(skillCalcElements.singleSkillGrid, skillCalcState.selectedSkill, false);
  skillCalcRenderSkillButtons(skillCalcElements.multiSkillGrid, skillCalcState.selectedMultiSkills, true);
  skillCalcRenderSkillButtons(skillCalcElements.plannerSkillGrid, skillCalcState.selectedPlannerSkills, true);

  if (skillCalcState.mode === "multi") {
    skillCalcRenderMultiResults();
  } else {
    skillCalcRenderSingleResults();
  }
  skillCalcRenderPlannerResults();
}

function skillCalcBindNumericInput(input) {
  input.addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "");
    skillCalcRender();
  });
}

[
  skillCalcElements.currentSkillInput,
  skillCalcElements.targetSkillInput,
  skillCalcElements.goldSkillInput,
  skillCalcElements.multiStrengthInput,
  skillCalcElements.multiDefenseInput,
  skillCalcElements.multiDexterityInput,
  skillCalcElements.multiEnduranceInput,
  skillCalcElements.multiCharismaInput,
  skillCalcElements.multiGoldInput,
  skillCalcElements.plannerStrengthInput,
  skillCalcElements.plannerDefenseInput,
  skillCalcElements.plannerDexterityInput,
  skillCalcElements.plannerEnduranceInput,
  skillCalcElements.plannerCharismaInput,
  skillCalcElements.plannerGoldInput
].forEach(skillCalcBindNumericInput);

skillCalcElements.targetModeBtn.addEventListener("click", () => {
  skillCalcState.mode = "target";
  skillCalcRender();
});

skillCalcElements.budgetModeBtn.addEventListener("click", () => {
  skillCalcState.mode = "budget";
  skillCalcRender();
});

skillCalcElements.multiModeBtn.addEventListener("click", () => {
  skillCalcState.mode = "multi";
  skillCalcRender();
});

skillCalcElements.discount60Toggle.addEventListener("click", () => {
  skillCalcState.activeDiscount = skillCalcState.activeDiscount === "60" ? "none" : "60";
  skillCalcRender();
});

skillCalcElements.discount30Toggle.addEventListener("click", () => {
  skillCalcState.activeDiscount = skillCalcState.activeDiscount === "30" ? "none" : "30";
  skillCalcRender();
});

skillCalcElements.equalStrategyBtn.addEventListener("click", () => {
  skillCalcState.strategy = "equal";
  skillCalcRender();
});

skillCalcElements.optimalStrategyBtn.addEventListener("click", () => {
  skillCalcState.strategy = "optimal";
  skillCalcRender();
});

skillCalcElements.plannerEqualBtn.addEventListener("click", () => {
  skillCalcState.plannerStrategy = "equal";
  skillCalcRender();
});

skillCalcElements.plannerOptimalBtn.addEventListener("click", () => {
  skillCalcState.plannerStrategy = "optimal";
  skillCalcRender();
});

skillCalcElements.resetSingleBtn.addEventListener("click", () => {
  skillCalcElements.currentSkillInput.value = "500";
  skillCalcElements.targetSkillInput.value = "503";
  skillCalcElements.goldSkillInput.value = "500000000";
  skillCalcState.selectedSkill = "strength";
  skillCalcState.mode = "target";
  skillCalcRender();
});

skillCalcElements.quickExampleBtn.addEventListener("click", () => {
  skillCalcElements.currentSkillInput.value = "500";
  skillCalcElements.targetSkillInput.value = "503";
  skillCalcState.mode = "target";
  skillCalcRender();
});

skillCalcElements.presetAllSkillsBtn.addEventListener("click", () => {
  skillCalcState.selectedMultiSkills = new Set(SKILL_CALC_SKILLS.map((skill) => skill.key));
  skillCalcRender();
});

skillCalcElements.presetFightSkillsBtn.addEventListener("click", () => {
  skillCalcState.selectedMultiSkills = new Set(["strength", "dexterity"]);
  skillCalcRender();
});

skillCalcElements.presetWarriorSkillsBtn.addEventListener("click", () => {
  skillCalcState.selectedMultiSkills = new Set(["strength", "defense", "dexterity"]);
  skillCalcRender();
});

skillCalcElements.presetTankSkillsBtn.addEventListener("click", () => {
  skillCalcState.selectedMultiSkills = new Set(["defense", "endurance"]);
  skillCalcRender();
});

skillCalcElements.resetMultiBtn.addEventListener("click", () => {
  skillCalcElements.multiStrengthInput.value = "500";
  skillCalcElements.multiDefenseInput.value = "500";
  skillCalcElements.multiDexterityInput.value = "500";
  skillCalcElements.multiEnduranceInput.value = "500";
  skillCalcElements.multiCharismaInput.value = "500";
  skillCalcElements.multiGoldInput.value = "500000000";
  skillCalcState.selectedMultiSkills = new Set(SKILL_CALC_SKILLS.map((skill) => skill.key));
  skillCalcState.strategy = "equal";
  skillCalcRender();
});

skillCalcElements.plannerPresetAllBtn.addEventListener("click", () => {
  skillCalcState.selectedPlannerSkills = new Set(SKILL_CALC_SKILLS.map((skill) => skill.key));
  skillCalcRender();
});

skillCalcElements.plannerPresetFightBtn.addEventListener("click", () => {
  skillCalcState.selectedPlannerSkills = new Set(["strength", "dexterity"]);
  skillCalcRender();
});

skillCalcElements.plannerPresetWarriorBtn.addEventListener("click", () => {
  skillCalcState.selectedPlannerSkills = new Set(["strength", "defense", "dexterity"]);
  skillCalcRender();
});

skillCalcElements.plannerPresetTankBtn.addEventListener("click", () => {
  skillCalcState.selectedPlannerSkills = new Set(["defense", "endurance"]);
  skillCalcRender();
});

skillCalcElements.plannerResetBtn.addEventListener("click", () => {
  skillCalcElements.plannerStrengthInput.value = "500";
  skillCalcElements.plannerDefenseInput.value = "500";
  skillCalcElements.plannerDexterityInput.value = "500";
  skillCalcElements.plannerEnduranceInput.value = "500";
  skillCalcElements.plannerCharismaInput.value = "500";
  skillCalcElements.plannerGoldInput.value = "500000000";
  skillCalcState.selectedPlannerSkills = new Set(SKILL_CALC_SKILLS.map((skill) => skill.key));
  skillCalcState.plannerStrategy = "optimal";
  skillCalcRender();
});

skillCalcRender();
