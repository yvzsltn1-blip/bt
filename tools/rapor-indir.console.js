// Savas raporu indirici — oyunda /ancestral/battlereport sayfasinda tarayici konsoluna yapistirilir.
// Liste sayfalari en yeniden eskiye siralidir (1. sayfa = en yeni raporlar).
//
// Kullanim (en alttaki cagriyi duzenleyin):
//   raporlariIndir({ sonId: 46515 })             -> 46515'ten yeni raporlar; o ID'ye ulasinca okumayi durdurur
//   raporlariIndir({ sayfa: 10 })                -> yalniz en yeni 10 sayfadaki raporlar
//   raporlariIndir({ sayfa: 10, minKat: 41 })    -> en yeni 10 sayfadaki kat 41 ve ustu
//   raporlariIndir({ sonId: 46515, minKat: 41, maxKat: 60 })  -> secenekler birlikte kullanilabilir
// Secenekler: sonId (bu ID dahil ve oncesi alinmaz), sayfa (okunacak en yeni sayfa sayisi, 0 = sinirsiz),
//             minKat / maxKat (kat araligi, 0 = sinirsiz).
async function raporlariIndir(ayar = {}) {
  if (typeof ayar === "number") ayar = { sonId: ayar };
  const sonId = Number(ayar.sonId) || 0;
  const sayfa = Number(ayar.sayfa) || 0;
  const minKat = Number(ayar.minKat) || 0;
  const maxKat = Number(ayar.maxKat) || Infinity;
  if (!sonId && !sayfa) console.warn("sonId veya sayfa verilmedi: tum sayfalar okunacak.");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getDoc = async (u) =>
    new DOMParser().parseFromString(await (await fetch(u, { credentials: "include" })).text(), "text/html");
  const katUygun = (kat) => kat == null || (kat >= minKat && kat <= maxKat);

  function parse(d, id) {
    const c = d.querySelector("#combatContainer");
    if (!c) return { id, error: "rapor icerigi yok" };
    const R = { id, kat: "", result: "", mine: [], enemy: [], rounds: [] };
    let sec = null, unit = null, round = null, action = null, ev = null, lastPl = null;
    for (const e of c.querySelectorAll("*")) {
      if (e.children.length || !e.textContent.trim()) continue;
      const k = String(e.className || "").split(" ")[0];
      const tx = e.textContent.trim().replace(/\s+/g, " ");
      if (k === "brEyebrow") R.kat = tx;
      else if (k === "brTitle") R.result = tx;
      else if (k === "brSectionTitle") { sec = tx; unit = null; }
      else if (k === "unitName") { unit = { name: tx, nums: [] }; (sec === "Birimlerin" ? R.mine : R.enemy).push(unit); }
      else if (k === "unitRank" && unit) unit.rank = tx;
      else if (k === "num" && unit && /^[\d.]+$/.test(tx)) unit.nums.push(+tx.replace(/\./g, ""));
      else if (k === "brRoundHead") { round = { r: tx, a: [] }; R.rounds.push(round); unit = null; }
      else if (k === "brActionNo" && round) { action = { n: tx, ev: [] }; round.a.push(action); ev = null; }
      else if (k === "brEntityName" && action) { if (!ev || ev.t) { ev = { s: tx }; action.ev.push(ev); } else ev.t = tx; }
      else if (k === "pl" && ev) lastPl = tx;
      else if (k === "pv" && ev) ev[lastPl] = tx;
      else if (k === "modName" && ev) (ev.m = ev.m || []).push([tx]);
      else if (k === "modVal" && ev && ev.m) ev.m[ev.m.length - 1].push(tx);
    }
    return R;
  }

  // 1) Liste sayfalarini yalniz gerektigi kadar oku
  const first = await getDoc("/ancestral/battlereport");
  const maxPage = Math.max(1, ...[...first.querySelectorAll('a[href*="battlereport?page="]')]
    .map((a) => +(a.getAttribute("href").match(/page=(\d+)/) || [0, 1])[1]));
  const lastPage = sayfa > 0 ? Math.min(sayfa, maxPage) : maxPage;
  const rows = [];
  let atlananKat = 0;
  for (let p = 1; p <= lastPage; p++) {
    const d = p === 1 ? first : await getDoc("/ancestral/battlereport?page=" + p);
    let sonIdyeUlasildi = false;
    for (const a of d.querySelectorAll("a.clRow")) {
      const id = (a.getAttribute("href").match(/battlereport\/(\d+)/) || [])[1];
      if (!id) continue;
      if (sonId && +id <= sonId) { sonIdyeUlasildi = true; continue; }
      const katText = a.querySelector(".clLayerTitle")?.textContent || "";
      const kat = /\d/.test(katText) ? +katText.replace(/\D+/g, "") : null;
      if (!katUygun(kat)) { atlananKat++; continue; }
      rows.push({ id, kat, time: a.querySelector(".clTime")?.textContent.trim().replace(/\s+/g, " ") });
    }
    console.log(`Sayfa ${p}/${lastPage} okundu (${rows.length} rapor secildi${atlananKat ? `, ${atlananKat} kat filtresine takildi` : ""})`);
    if (sonIdyeUlasildi) { console.log(`#${sonId} bu sayfada; daha eski sayfalar okunmadi.`); break; }
    if (p < lastPage) await sleep(400);
  }

  // 2) Secilen raporlari ac ve ayristir
  const reports = [];
  for (const [i, row] of rows.entries()) {
    try {
      const rep = Object.assign(parse(await getDoc("/ancestral/battlereport/" + row.id), row.id), { time: row.time });
      // Listede kat okunamadiysa filtreyi rapor basligina gore uygula
      const katRapor = +((String(rep.kat || "").match(/#\s*(\d+)/) || [])[1] || 0) || null;
      if (row.kat == null && !katUygun(katRapor)) { atlananKat++; continue; }
      reports.push(rep);
    } catch (e) { reports.push({ id: row.id, error: String(e) }); }
    console.log(`${i + 1}/${rows.length} #${row.id}`);
    await sleep(500); // sunucuyu yormamak icin
  }

  if (!reports.length) {
    console.log("Kosullara uyan rapor yok, dosya indirilmedi.");
    return;
  }

  // 3) Indir (sayfanin Array.prototype.toJSON bozuklugunu gecici olarak devre disi birak)
  const saved = Array.prototype.toJSON;
  delete Array.prototype.toJSON;
  let json;
  try { json = JSON.stringify({ reports }, null, 1); } finally { if (saved) Array.prototype.toJSON = saved; }

  // Dosya adi: tarih + ilk/son rapor id'si (+ kat filtresi), or. savas-raporlari-2026-09-27_id_46233-46515_kat41+.json
  const ids = reports.map((r) => +r.id);
  const minId = Math.min(...ids);
  const maxId = Math.max(...ids);
  const idPart = minId === maxId ? `${minId}` : `${minId}-${maxId}`;
  const katPart = minKat || maxKat !== Infinity ? `_kat${minKat || 1}${maxKat === Infinity ? "+" : "-" + maxKat}` : "";
  const today = new Date().toLocaleDateString("sv-SE"); // yerel tarih, YYYY-MM-DD
  const fileName = `savas-raporlari-${today}_id_${idPart}${katPart}.json`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  console.log(`Bitti: ${reports.length} rapor indirildi -> ${fileName}`);
}
const tumRaporlariIndir = raporlariIndir; // eski ad

// ---- Burayi duzenleyin ----
raporlariIndir({ sayfa: 10, minKat: 41 });
