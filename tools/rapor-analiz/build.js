"use strict";
// Exe olusturur: node build.js  ->  dist/SavasRaporuAnalizi.exe (Node SEA, gomulu ui.html + battle-core.js)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = __dirname;
const dist = path.join(dir, "dist");
const exe = path.join(dist, "SavasRaporuAnalizi.exe");
const blob = path.join(dist, "sea-prep.blob");
fs.mkdirSync(dist, { recursive: true });

const config = {
  main: path.join(dir, "main.js"),
  output: blob,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  assets: { "ui.html": path.join(dir, "ui.html"), "battle-core.js": path.join(dir, "../../battle-core.js") }
};
const configPath = path.join(dist, "sea-config.json");
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

execFileSync(process.execPath, ["--experimental-sea-config", configPath], { stdio: "inherit" });
// Exe aciksa silinemez ama yeniden adlandirilabilir; eskileri firsat buldukca temizle.
for (const f of fs.readdirSync(dist)) if (/^SavasRaporuAnalizi\.eski-\d+\.exe$/.test(f)) { try { fs.rmSync(path.join(dist, f)); } catch {} }
if (fs.existsSync(exe)) {
  try { fs.rmSync(exe); } catch { fs.renameSync(exe, path.join(dist, `SavasRaporuAnalizi.eski-${Date.now()}.exe`)); }
}
fs.copyFileSync(process.execPath, exe);
execFileSync("npx", ["--yes", "postject", "dist/SavasRaporuAnalizi.exe", "NODE_SEA_BLOB", "dist/sea-prep.blob", "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"], { stdio: "inherit", shell: true, cwd: dir });
fs.rmSync(blob);
fs.rmSync(configPath);
console.log(`Hazir: ${exe}`);
