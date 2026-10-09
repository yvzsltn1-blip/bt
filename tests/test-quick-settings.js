"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "..", "optimizer.js"), "utf8");
const stored = new Map();
const field = (id, value, options) => ({ id, value, tagName: options ? "SELECT" : "INPUT",
  options: (options || []).map((value) => ({ value })) });
const context = {
  window: { localStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) } },
  QUICK_SETTINGS_STORAGE_KEY: "settings", isQuickVariant: () => true,
  optimizerVariant: "quick", ALLY_UNITS: [{ key: "rotmaws" }],
  optimizerInputs: { rotmaws: field("ally-rotmaws", "6") },
  optimizerMinimumInputs: {}, optimizerRequiredLossInputs: {}, optimizerLossCapInputs: {}, optimizerRequiredLossExactInputs: {},
  optimizerSearchBandPresetInput: field("band", "custom", ["tight75", "custom", "full"]),
  optimizerSearchBandPresetMobileInput: field("mobile-band", "tight75"),
  optimizerCustomBandMinInput: field("band-min", "60"), optimizerCustomBandMaxInput: field("band-max", "100"),
  optimizerWinRateThresholdInput: field("win-rate", "100", ["75", "95", "100", "custom"]),
  optimizerCustomWinRateInput: field("custom-win-rate", "99"), optimizerBatchRunsInput: field("batch", "12"),
  optimizerManualMinPointsInput: field("min-points", "100"), optimizerManualMaxPointsInput: field("max-points", "430"),
  optimizerStoneUsageInputs: [{ value: "no", checked: true }, { value: "yes", checked: false }],
  optimizerMode: "deep", optimizerObjective: "min_time", optimizerStoneMode: true,
  optimizerDiversityMode: false, optimizerTekilMode: false, optimizerTekilV2Mode: true,
  optimizerManualPointRangeEnabled: true, lossConstraintModeEnabled: false, lossCapModeEnabled: false,
  setManualPointRangeManaged: (value) => { context.manualManaged = value; }
};
vm.createContext(context);
for (const name of ["normalizeOptimizerObjective", "getQuickSettingInputs", "persistQuickSettings", "loadQuickSettings", "syncStoneUsageInputs"]) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\nfunction ", start + 1);
  vm.runInContext(source.slice(start, end), context);
}
context.persistQuickSettings();
context.optimizerMode = "fast";
context.optimizerObjective = "min_loss";
context.optimizerStoneMode = false;
context.optimizerInputs.rotmaws.value = "1";
context.optimizerWinRateThresholdInput.value = "75";
context.loadQuickSettings();
context.syncStoneUsageInputs();
assert.equal(context.optimizerMode, "deep");
assert.equal(context.optimizerObjective, "min_time");
assert.equal(context.optimizerStoneMode, true);
assert.equal(context.optimizerInputs.rotmaws.value, "6");
assert.equal(context.optimizerWinRateThresholdInput.value, "100");
assert.equal(context.optimizerSearchBandPresetMobileInput.value, "custom");
assert.equal(context.manualManaged, false);
assert(context.optimizerStoneUsageInputs[1].checked);
assert(!context.optimizerStoneUsageInputs[0].checked);
context.optimizerStoneMode = false;
context.persistQuickSettings();
context.optimizerStoneMode = true;
context.loadQuickSettings();
assert.equal(context.optimizerStoneMode, false);
stored.set("settings", "invalid JSON");
assert.doesNotThrow(() => context.loadQuickSettings());
context.window.localStorage.setItem = () => { throw new Error("storage blocked"); };
assert.doesNotThrow(() => context.persistQuickSettings());
console.log("PASS: stone choice and search settings survive reload; invalid/blocked storage is safe");
