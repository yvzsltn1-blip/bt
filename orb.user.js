// ==UserScript==
// @name         BiteFight Sehir Orb Toplayici
// @namespace    av-analiz
// @version      2.9.6
// @description  Sehir avini otomatik tekrarlar; panelden secilen S/A/B sinifi iksirlerde, belirlenen gecikme sonrasi Cikarmak tiklar veya otomatik alma kapaliysa durup kullaniciya birakir. 0/3 kaldiginda yenilenmeyi bekler. Bot calisirken telefon ekran/tus kilidi kapanmaz. Diger sayfalarda bekci modunda calisir: orb suresi gelince robbery sayfasina kendisi gider.
// @match        https://*.bitefight.gameforge.com/*
// @downloadURL  https://bt-analiz.web.app/orb.user.js
// @updateURL    https://bt-analiz.web.app/orb.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  if (window.__BFOrbHarvestLoaded) {
    return;
  }
  window.__BFOrbHarvestLoaded = true;

  const SCRIPT_TAG = "[BF Orb]";
  const SCRIPT_VERSION = "2.9.6";
  const FIREBASE_API_KEY = "AIzaSyB6_mwliHgUXjCSidzZIBiQj_8hLkYvZV4";
  const ORB_NOTIFICATIONS_URL = "https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/orbNotifications";
  const LOCATIONS = [
    { id: "1", label: "Ciftlik" },
    { id: "2", label: "Koy" },
    { id: "3", label: "Kasaba" },
    { id: "4", label: "Sehir" },
    { id: "5", label: "Metropol" },
  ];
  const DEFAULT_LOCATION_ID = "4";
  const REPEAT_MIN_SEC = 0; // tekrar gecikmesi alt sinir (sn)
  const REPEAT_MAX_SEC = 60; // tekrar gecikmesi ust sinir (sn)
  const EXTRACT_TIMEOUT_MS = 12000;
  const EXTRACT_POLL_MS = 400;
  const SETTINGS_KEY = "BFOrbSettings";
  const FLOOR_COORDINATION_KEY = "BFOrbFloorCoordinator";
  // Kat botu kilidi bu sureden uzun tazelenmezse bayat sayilir (sekme kapandi/cokme).
  const FLOOR_LOCK_STALE_MS = 10 * 60 * 1000;
  // "Uygun aksiyon bulunamadi" durumunda robbery uzerinden kac kez yeniden denenir.
  const NO_ACTION_RETRY_KEY = "BFOrbNoActionRetries";
  const NO_ACTION_MAX_RETRIES = 3;

  const DEFAULT_SETTINGS = {
    classes: { S: true, A: true, B: true }, // toplanacak siniflar
    autoCollect: true, // false ise hedef bulununca durur, kullanici alir
    collectDelayMinSec: 3, // hedef bulununca alt sinir (sn) - bu aralikta rastgele beklenir
    collectDelayMaxSec: 5, // hedef bulununca ust sinir (sn)
    running: false, // av dongusu aktif mi (sayfalar arasinda korunur)
    location: DEFAULT_LOCATION_ID, // avlanacak yer (1 Ciftlik ... 5 Metropol)
    panelPos: null, // { left, top } - panelin surukle-birak konumu
    repeatMinSec: 0.3, // "Yeniden" basislari arasi gecikme alt sinir (sn)
    repeatMaxSec: 0.6, // "Yeniden" basislari arasi gecikme ust sinir (sn)
    orbReadyDelayMinMinutes: 3,
    orbReadyDelayMaxMinutes: 5,
    orbReadyAt: 0,
    orbCollectAt: 0,
    // Kat botuna teslimde yazilan sayaclar gecicidir; robbery sayfasinda
    // gercek sayac okunana kadar true kalir (bkz. updateOrbScheduleFromPage).
    orbTimersProvisional: false,
  };

  const settings = loadSettings();

  const state = {
    busy: false,
    countdownTimer: null,
  };

  // -------------------------------------------------------------------------
  // Ekran/tus kilidi onleme (Wake Lock)
  // Bot calisirken (settings.running) ekranin kararip kapanmasini onler. Wake
  // Lock bazi mobil tarayicilarda sayfa gecislerinde duser; video/ses fallback'leri
  // kullanici etkilesimiyle baslatilir ve bot durana kadar canli tutulur.
  // -------------------------------------------------------------------------

  let wakeLockSentinel = null;
  let wakeFallbackVideo = null;
  let wakeFallbackCanvas = null;
  let wakeFallbackTimer = null;
  let wakeAudioContext = null;
  let wakeHeartbeatTimer = null;

  function isWakeActive() {
    return settings.running === true;
  }

  function startWakeFallbacks() {
    if (!isWakeActive() || document.visibilityState !== "visible") {
      return;
    }

    try {
      if (!wakeFallbackVideo && HTMLCanvasElement.prototype.captureStream) {
        wakeFallbackCanvas = document.createElement("canvas");
        wakeFallbackCanvas.width = 2;
        wakeFallbackCanvas.height = 2;
        const context = wakeFallbackCanvas.getContext("2d");
        let tick = 0;

        wakeFallbackTimer = window.setInterval(() => {
          if (!isWakeActive()) {
            releaseWakeLock();
            return;
          }
          context.fillStyle = tick % 2 ? "#000" : "#111";
          context.fillRect(0, 0, 2, 2);
          tick += 1;
        }, 1000);

        wakeFallbackVideo = document.createElement("video");
        wakeFallbackVideo.muted = true;
        wakeFallbackVideo.loop = true;
        wakeFallbackVideo.playsInline = true;
        wakeFallbackVideo.setAttribute("playsinline", "playsinline");
        wakeFallbackVideo.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px;";
        wakeFallbackVideo.srcObject = wakeFallbackCanvas.captureStream(1);
        document.documentElement.appendChild(wakeFallbackVideo);
      }

      if (wakeFallbackVideo && wakeFallbackVideo.paused) {
        void wakeFallbackVideo.play().catch(() => {});
      }
    } catch (error) {
      log("Video wake fallback baslatilamadi: " + error);
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass && !wakeAudioContext) {
        wakeAudioContext = new AudioContextClass();
        const oscillator = wakeAudioContext.createOscillator();
        const gain = wakeAudioContext.createGain();
        gain.gain.value = 0.00001;
        oscillator.frequency.value = 1;
        oscillator.connect(gain);
        gain.connect(wakeAudioContext.destination);
        oscillator.start();
      }
      if (wakeAudioContext && wakeAudioContext.state === "suspended") {
        void wakeAudioContext.resume().catch(() => {});
      }
    } catch (error) {
      log("Audio wake fallback baslatilamadi: " + error);
    }
  }

  // Bot acikken her birkac saniyede bir kilidin hala canli oldugunu denetler.
  // Wake Lock sistem tarafindan sessizce dusurulurse (telefon ekrani karartmaya
  // calistiginda) veya fallback video duraklarsa otomatik geri alir. Boylece
  // kullanici ekrana dokunmasa bile kilit canli kalir.
  function startWakeHeartbeat() {
    if (wakeHeartbeatTimer) {
      return;
    }
    wakeHeartbeatTimer = window.setInterval(() => {
      if (!isWakeActive()) {
        releaseWakeLock();
        return;
      }
      if (document.visibilityState !== "visible") {
        return;
      }
      startWakeFallbacks();
      if (navigator.wakeLock && typeof navigator.wakeLock.request === "function" &&
          (!wakeLockSentinel || wakeLockSentinel.released)) {
        void acquireWakeLock();
      }
    }, 8000);
  }

  async function acquireWakeLock() {
    if (!isWakeActive() || document.visibilityState !== "visible") {
      return;
    }
    startWakeFallbacks();
    startWakeHeartbeat();
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== "function") {
      return;
    }
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      return;
    }

    try {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      wakeLockSentinel.addEventListener?.("release", () => {
        wakeLockSentinel = null;
        // Sistem kilidi dusurdu; bot hala acik ve sayfa gorunurse hemen geri al.
        // Kisa gecikme art arda istek dongusunu onler.
        if (isWakeActive() && document.visibilityState === "visible") {
          window.setTimeout(() => { void acquireWakeLock(); }, 500);
        }
      });
    } catch (error) {
      console.warn(SCRIPT_TAG, "Ekran uyanik tutulamadi.", error);
    }
  }

  function releaseWakeLock() {
    try {
      wakeLockSentinel?.release();
    } catch {
      // Kilit tarayici tarafindan daha once birakilmis olabilir.
    }
    wakeLockSentinel = null;

    if (wakeHeartbeatTimer) {
      window.clearInterval(wakeHeartbeatTimer);
      wakeHeartbeatTimer = null;
    }
    if (wakeFallbackTimer) {
      window.clearInterval(wakeFallbackTimer);
      wakeFallbackTimer = null;
    }
    if (wakeFallbackVideo) {
      wakeFallbackVideo.pause();
      wakeFallbackVideo.remove();
      wakeFallbackVideo.srcObject = null;
      wakeFallbackVideo = null;
    }
    wakeFallbackCanvas = null;
    if (wakeAudioContext) {
      void wakeAudioContext.close().catch(() => {});
      wakeAudioContext = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isWakeActive()) {
      void acquireWakeLock();
    }
  });

  window.addEventListener("online", () => {
    if (isWakeActive()) {
      void acquireWakeLock();
    }
  });

  ["click", "touchstart", "pointerdown", "keydown"].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (isWakeActive()) {
        startWakeFallbacks();
        void acquireWakeLock();
      }
    }, true);
  });

  // -------------------------------------------------------------------------
  // Ayarlar (localStorage)
  // -------------------------------------------------------------------------

  function loadSettings() {
    let parsed = {};
    try {
      parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}") || {};
    } catch (error) {
      parsed = {};
    }

    const merged = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      classes: { ...DEFAULT_SETTINGS.classes, ...(parsed.classes || {}) },
    };

    merged.autoCollect = Boolean(merged.autoCollect);
    merged.running = Boolean(merged.running);

    // eski tek-deger ayarini (collectDelaySec) araliga tasi
    if (parsed.collectDelayMinSec === undefined && parsed.collectDelayMaxSec === undefined &&
        parsed.collectDelaySec !== undefined) {
      merged.collectDelayMinSec = parsed.collectDelaySec;
      merged.collectDelayMaxSec = parsed.collectDelaySec;
    }
    delete merged.collectDelaySec;

    // alma gecikmesi: sayisal, sinirlar icinde, min <= max
    merged.collectDelayMinSec = clampNumber(merged.collectDelayMinSec, 0, 120, DEFAULT_SETTINGS.collectDelayMinSec);
    merged.collectDelayMaxSec = clampNumber(merged.collectDelayMaxSec, 0, 120, DEFAULT_SETTINGS.collectDelayMaxSec);
    if (merged.collectDelayMaxSec < merged.collectDelayMinSec) {
      merged.collectDelayMaxSec = merged.collectDelayMinSec;
    }

    // lokasyon gecerli bir id mi
    if (!LOCATIONS.some((loc) => loc.id === String(merged.location))) {
      merged.location = DEFAULT_LOCATION_ID;
    } else {
      merged.location = String(merged.location);
    }

    // panel konumu gecerli bir obje mi
    if (!merged.panelPos || typeof merged.panelPos !== "object" ||
        !Number.isFinite(Number(merged.panelPos.left)) ||
        !Number.isFinite(Number(merged.panelPos.top))) {
      merged.panelPos = null;
    }

    // tekrar gecikmesi: sayisal, sinirlar icinde, min <= max
    merged.repeatMinSec = clampNumber(merged.repeatMinSec, REPEAT_MIN_SEC, REPEAT_MAX_SEC, DEFAULT_SETTINGS.repeatMinSec);
    merged.repeatMaxSec = clampNumber(merged.repeatMaxSec, REPEAT_MIN_SEC, REPEAT_MAX_SEC, DEFAULT_SETTINGS.repeatMaxSec);
    if (merged.repeatMaxSec < merged.repeatMinSec) {
      merged.repeatMaxSec = merged.repeatMinSec;
    }

    merged.orbReadyDelayMinMinutes = clampNumber(merged.orbReadyDelayMinMinutes, 0, 180, DEFAULT_SETTINGS.orbReadyDelayMinMinutes);
    merged.orbReadyDelayMaxMinutes = clampNumber(merged.orbReadyDelayMaxMinutes, 0, 180, DEFAULT_SETTINGS.orbReadyDelayMaxMinutes);
    if (merged.orbReadyDelayMaxMinutes < merged.orbReadyDelayMinMinutes) {
      merged.orbReadyDelayMaxMinutes = merged.orbReadyDelayMinMinutes;
    }
    merged.orbReadyAt = Math.max(0, Number(merged.orbReadyAt) || 0);
    merged.orbCollectAt = Math.max(0, Number(merged.orbCollectAt) || 0);
    merged.orbTimersProvisional = merged.orbTimersProvisional === true;

    return merged;
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error(SCRIPT_TAG, "Ayarlar kaydedilemedi:", error);
    }
  }

  function getTargetClasses() {
    return new Set(
      Object.keys(settings.classes).filter((key) => settings.classes[key])
    );
  }

  // -------------------------------------------------------------------------
  // Public API (konsoldan da kullanilabilir)
  // -------------------------------------------------------------------------

  window.BFOrbHunter = {
    run() {
      startHunt();
    },
    stop() {
      stopHunt("Script manuel olarak durduruldu.", false);
    },
    settings,
    debug() {
      const harvestBox = findHarvestBox(document);
      const potionName = extractPotionName(harvestBox);
      const potionClass = extractPotionClass(potionName);
      const orbInfo = getOrbInfo(harvestBox);
      console.log(SCRIPT_TAG, {
        url: location.href,
        potionName,
        potionClass,
        orbInfo,
        settings,
        repeatRequest: buildRepeatRequest(document, location.href),
      });
    },
  };

  // -------------------------------------------------------------------------
  // Baslat / Durdur
  // -------------------------------------------------------------------------

  function startHunt() {
    if (getTargetClasses().size === 0) {
      setStatus("En az bir sinif (S/A/B) secmelisin.", "warn");
      log("Hic sinif secilmedi, baslatilmadi.");
      return;
    }
    settings.running = true;
    saveSettings();
    void acquireWakeLock();
    syncPanel();
    setStatus("Av basladi.", "ok");
    log("Av baslatildi.");
    scheduleMain(50);
  }

  // notify=false: kullanicinin kendi durdurmasi gibi bildirim gerektirmeyen durumlar.
  function stopHunt(message, notify = true) {
    const wasRunning = settings.running === true;
    settings.running = false;
    saveSettings();
    releaseWakeLock();
    clearCountdown();
    syncPanel();
    if (message) {
      setStatus(message, "warn");
      log(message);
    }
    if (notify && wasRunning && message) {
      void sendOrbEventNotification(message);
    }
  }

  // "Uygun aksiyon yok" yeniden deneme sayaci sekmeye ozeldir (sessionStorage):
  // navigasyonlar arasinda korunur, yeni sekmede sifirdan baslar.
  function getNoActionRetries() {
    return Number(window.sessionStorage.getItem(NO_ACTION_RETRY_KEY) || 0);
  }

  function setNoActionRetries(value) {
    try {
      window.sessionStorage.setItem(NO_ACTION_RETRY_KEY, String(value));
    } catch { /* yoksayilir */ }
  }

  function clearNoActionRetries() {
    try {
      window.sessionStorage.removeItem(NO_ACTION_RETRY_KEY);
    } catch { /* yoksayilir */ }
  }

  function clearCountdown() {
    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  // Hedef bulununca beklenecek gecikme (sn) - panelden ayarlanan aralikta rastgele
  function getCollectDelaySec() {
    const minSec = clampNumber(settings.collectDelayMinSec, 0, 120, DEFAULT_SETTINGS.collectDelayMinSec);
    const maxSec = clampNumber(settings.collectDelayMaxSec, 0, 120, DEFAULT_SETTINGS.collectDelayMaxSec);
    const lo = Math.min(minSec, maxSec);
    const hi = Math.max(minSec, maxSec);
    return Math.round((lo + Math.random() * (hi - lo)) * 10) / 10;
  }

  // "Yeniden" basislari arasi gecikme (ms) - panelden ayarlanir
  function getRepeatDelayMs() {
    const minMs = Math.round(clampNumber(settings.repeatMinSec, REPEAT_MIN_SEC, REPEAT_MAX_SEC, DEFAULT_SETTINGS.repeatMinSec) * 1000);
    const maxMs = Math.round(clampNumber(settings.repeatMaxSec, REPEAT_MIN_SEC, REPEAT_MAX_SEC, DEFAULT_SETTINGS.repeatMaxSec) * 1000);
    return randomInt(Math.min(minMs, maxMs), Math.max(minMs, maxMs));
  }

  // Robbery sayfasi her acildiginda sayaclari sayfadan tazele (bot kapali olsa da).
  // Kayitli sure ile sayfadaki gercek sayac 5 sn'den fazla ayrisirsa (or. sunucu
  // degisti) kayit guncellenir; boylece panel eski sunucunun suresini gostermez.
  if (isRobberyIndexPage(location.href)) {
    updateOrbScheduleFromPage();
  }

  // Sayfa yuklendiginde, av aciksa devam et (ve ekran kilidini hemen geri al)
  if (settings.running) {
    void acquireWakeLock();
    scheduleMain(getRepeatDelayMs());
  }

  function scheduleMain(delayMs) {
    window.setTimeout(() => {
      main().catch((error) => {
        console.error(SCRIPT_TAG, error);
        stopHunt(`Hata: ${error.message}`);
      });
    }, delayMs);
  }

  function floorBotIsBusy() {
    try {
      const coordinator = JSON.parse(window.localStorage.getItem(FLOOR_COORDINATION_KEY) || "{}");
      if (coordinator.busy !== true) {
        return false;
      }
      // Kat botu bir sonraki kontrol zamanini bekliyorsa aktif bir kat serisi
      // yurutmuyor demektir. Eski/yarista kalmis busy=true bayragi orb'un zamani
      // geldiginde robbery sayfasina gecmesini engellemesin.
      const resumeAt = Number(coordinator.resumeAt || 0);
      if (resumeAt > Date.now()) {
        return false;
      }
      // Kat botu calisirken kilidi periyodik tazeler; tazelenmeyen kilit
      // (sekme kapandi, tarayici coktu) orb'u sonsuza dek bekletmesin.
      const updatedAt = Number(coordinator.updatedAt || 0);
      if (!updatedAt || Date.now() - updatedAt > FLOOR_LOCK_STALE_MS) {
        log("Kat botu kilidi bayat (tazelenmiyor), yok sayiliyor.");
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function orbPriorityCoordinator() {
    try {
      return JSON.parse(window.localStorage.getItem(FLOOR_COORDINATION_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function claimOrbPriority() {
    const coordinator = orbPriorityCoordinator();
    if (!coordinator.floorUrl) return;
    coordinator.busy = false;
    coordinator.orbPriority = true;
    coordinator.updatedAt = Date.now();
    window.localStorage.setItem(FLOOR_COORDINATION_KEY, JSON.stringify(coordinator));
  }

  function handoffToFloorBot(message) {
    const coordinator = orbPriorityCoordinator();
    const floorUrl = coordinator.floorUrl;
    if (!coordinator.orbPriority || !floorUrl) {
      stopHunt(message);
      return;
    }
    coordinator.busy = true;
    coordinator.orbPriority = false;
    coordinator.updatedAt = Date.now();
    window.localStorage.setItem(FLOOR_COORDINATION_KEY, JSON.stringify(coordinator));
    // Kat serisi devam ederken Orb'un zamani tekrar "bilinmiyor/hazir" sayilmasin.
    // Sayfadan taze okunmus gercek bir sayac varsa ona dokunma; yoksa gecici
    // (orbTimersProvisional=true) bir kilit yaz — ilk robbery/index ziyaretinde
    // gercek sayacla degistirilir (kureler hazirsa aninda sifirlanir).
    if (settings.orbCollectAt <= Date.now()) {
      settings.orbReadyAt = Date.now() + 2 * 60 * 60 * 1000;
      settings.orbCollectAt = settings.orbReadyAt;
      settings.orbTimersProvisional = true;
    }
    saveSettings();
    clearCountdown();
    setStatus(`${message} Kat botuna geciliyor...`, "ok");
    log(message);
    window.location.assign(floorUrl);
  }

  function waitForOrbRenewal(message) {
    const coordinator = orbPriorityCoordinator();
    if (coordinator.orbPriority && coordinator.floorUrl) {
      handoffToFloorBot(message);
      return;
    }

    const waitMs = updateOrbScheduleFromPage();
    clearCountdown();
    updateOrbSchedulePanel();
    const statusMessage = waitMs > 0
      ? `${message} Yenilenme bekleniyor: ${formatDuration(waitMs)}`
      : `${message} Yenilenme suresi yeniden kontrol ediliyor...`;
    setStatus(statusMessage, "warn");
    log(statusMessage);

    if (!isRobberyIndexPage(location.href)) {
      window.location.assign(`${location.origin}/robbery/index`);
      return;
    }
    scheduleMain(waitMs > 0 ? Math.min(1000, waitMs) : 3000);
  }

  async function main() {
    if (state.busy || !settings.running) {
      return;
    }

    if (floorBotIsBusy()) {
      setStatus("Kat botu calisiyor; orb bekliyor...", "warn");
      scheduleMain(1000);
      return;
    }

    // Bekci modu: orb sayfalarinin disindaki herhangi bir bitefight sayfasi.
    // Burada av mantigi calismaz; sadece orb suresi dolunca (kat botu bosken)
    // robbery sayfasina gidilir. Sure dolmadiysa beklemeye devam edilir.
    if (!isOrbWorkPage(location.href)) {
      const waitMs = settings.orbCollectAt - Date.now();
      if (waitMs > 0) {
        scheduleMain(Math.min(waitMs, 15000));
        return;
      }
      log("Orb suresi geldi, robbery sayfasina gidiliyor.");
      window.location.assign(`${location.origin}/robbery/index`);
      return;
    }

    state.busy = true;
    try {
      if (isRobberyIndexPage(location.href)) {
        const waitMs = updateOrbScheduleFromPage();
        if (waitMs > 0) {
          updateOrbSchedulePanel();
          setStatus(`Kureler icin bekleniyor: ${formatDuration(waitMs)}`, "warn");
          scheduleMain(Math.min(1000, waitMs));
          return;
        }
        claimOrbPriority();
        const locLabel = getLocationLabel(settings.location);
        log(`${locLabel} avi baslatiliyor.`);
        setStatus(`${locLabel} avi baslatiliyor...`, "ok");
        submitSelectedLocation();
        return;
      }

      const harvestBox = findHarvestBox(document);
      if (harvestBox) {
        clearNoActionRetries();
        await handleHarvestBox(harvestBox);
        return;
      }

      const repeatRequest = buildRepeatRequest(document, location.href);
      if (!repeatRequest) {
        if (orbPriorityCoordinator().orbPriority) {
          handoffToFloorBot("Av enerjisi veya tekrar aksiyonu kalmadi.");
          return;
        }
        // Eskiden burada sessizce askida kaliniyordu (running=true ama is yok).
        // Simdi robbery/index uzerinden birkac kez yeniden denenir; olmazsa
        // bildirimli sekilde durulur.
        const attempts = getNoActionRetries() + 1;
        if (attempts > NO_ACTION_MAX_RETRIES) {
          clearNoActionRetries();
          stopHunt(`Uygun tekrar aksiyonu ${NO_ACTION_MAX_RETRIES} denemede bulunamadi (enerji bitmis olabilir). Script durdu.`);
          return;
        }
        setNoActionRetries(attempts);
        log(`Uygun aksiyon yok; robbery sayfasindan yeniden denenecek (${attempts}/${NO_ACTION_MAX_RETRIES}).`);
        setStatus(`Uygun aksiyon yok, yeniden deneniyor (${attempts}/${NO_ACTION_MAX_RETRIES})...`, "warn");
        window.setTimeout(() => {
          if (settings.running) {
            window.location.assign(`${location.origin}/robbery/index`);
          }
        }, 3000 + Math.round(Math.random() * 3000));
        return;
      }

      clearNoActionRetries();
      log("Yeniden butonu bulundu, av devam ediyor.");
      navigateWithRequest(repeatRequest);
    } finally {
      state.busy = false;
    }
  }

  async function handleHarvestBox(harvestBox) {
    const potionName = extractPotionName(harvestBox);
    const potionClass = extractPotionClass(potionName);
    const orbInfo = getOrbInfo(harvestBox);
    const targetClasses = getTargetClasses();

    if (orbInfo.total > 0) {
      log(`${orbInfo.available}/${orbInfo.total} kure kullanilabilir.`);
    } else {
      log("Kure bilgisi okunamadi.");
    }

    if (orbInfo.total > 0 && orbInfo.available === 0) {
      // Av sayfasindaki slot sayaclarindan gercek yenilenme suresini oku ki
      // panel 00:00:00 gostermesin ve bot hazir sanip bosuna ava girmesin.
      waitForOrbRenewal("3/3 kure doldu.");
      return;
    }

    if (!potionClass) {
      const repeatRequest = buildRepeatRequest(document, location.href);
      if (!repeatRequest) {
        stopHunt("Hasat bolumu bulundu ama iksir sinifi okunamadi.");
        return;
      }
      log("Iksir sinifi okunamadi, yeniden deneniyor.");
      navigateWithRequest(repeatRequest);
      return;
    }

    if (!targetClasses.has(potionClass)) {
      const repeatRequest = buildRepeatRequest(document, location.href);
      if (!repeatRequest) {
        // Enerji bittiyse mevcut kurelerin sayaçlarini oku. En uzun süre,
        // bir sonraki orb turunun baslangici olarak kabul edilir; bot kapanmaz.
        const waitMs = updateOrbScheduleFromPage();
        const message = waitMs > 0
          ? `${potionClass} sinifi bulundu; enerji bekleniyor (${formatDuration(waitMs)}).`
          : `${potionClass} sinifi bulundu; bot hazirda bekliyor.`;
        log(message);
        setStatus(message, "warn");
        window.location.assign(`${location.origin}/robbery/index`);
        return;
      }
      log(`${potionClass} sinifi bulundu (hedef disi), tekrar deneniyor.`);
      setStatus(`${potionClass} bulundu (hedef disi), donuluyor...`, "");
      navigateWithRequest(repeatRequest);
      return;
    }

    // --- Hedef sinif bulundu ---

    if (orbInfo.available <= 0) {
      stopHunt(`${potionClass} sinifi bulundu ama kullanilabilir kure yok. Script durdu.`);
      return;
    }

    const extractButton = findExtractButton(harvestBox);
    if (!extractButton || extractButton.disabled) {
      stopHunt(`${potionClass} sinifi bulundu ama Cikarmak butonu aktif degil.`);
      return;
    }

    // Otomatik alma kapali: dur ve kullaniciya birak
    if (!settings.autoCollect) {
      highlightHarvestBox(harvestBox);
      stopHunt(`${potionClass} sinifi bulundu! Otomatik alma kapali — kureyi sen al.`);
      setStatus(`${potionClass} bulundu! Kureyi kendin al (otomatik alma kapali).`, "ok");
      return;
    }

    // Otomatik alma acik: gecikme sonrasi tikla
    const collectDelaySec = getCollectDelaySec();
    if (collectDelaySec > 0) {
      log(`${potionClass} sinifi bulundu. ${collectDelaySec} sn sonra Cikarmak tiklanacak.`);
      const cancelled = await countdownDelay(
        collectDelaySec,
        (remaining) => setStatus(`${potionClass} bulundu! ${remaining} sn sonra aliniyor...`, "ok")
      );
      if (cancelled || !settings.running) {
        return;
      }
    }

    log(`${potionClass} sinifi bulundu. Cikarmak tiklaniyor.`);
    setStatus(`${potionClass} aliniyor...`, "ok");
    const beforeAvailable = orbInfo.available;
    extractButton.click();

    const extractionConfirmed = await waitForExtraction(beforeAvailable);
    if (!extractionConfirmed) {
      stopHunt("Cikarma sonrasi sayfa durumu dogrulanamadi. Script durdu.");
      return;
    }

    await sendOrbCollectedNotification(potionClass);

    const refreshedHarvestBox = findHarvestBox(document);
    const refreshedOrbInfo = getOrbInfo(refreshedHarvestBox);
    if (refreshedOrbInfo.total > 0) {
      log(`${refreshedOrbInfo.available}/${refreshedOrbInfo.total} kure kullanilabilir.`);
    }

    if (refreshedOrbInfo.total > 0 && refreshedOrbInfo.available === 0) {
      waitForOrbRenewal("3/3 kure doldu.");
      return;
    }

    const repeatRequest = buildRepeatRequest(document, location.href);
    if (!repeatRequest) {
      stopHunt("Cikarma tamamlandi ama Yeniden butonu bulunamadi.");
      return;
    }

    log("Cikarma tamamlandi, av devam ediyor.");
    await delay(randomInt(700, 1200));
    navigateWithRequest(repeatRequest);
  }

  // Saniye geri sayim; iptal edilirse (av durdurulursa) true doner.
  function countdownDelay(seconds, onTick) {
    return new Promise((resolve) => {
      let remaining = Math.ceil(seconds);
      if (typeof onTick === "function") {
        onTick(remaining);
      }
      clearCountdown();
      state.countdownTimer = window.setInterval(() => {
        if (!settings.running) {
          clearCountdown();
          resolve(true);
          return;
        }
        remaining -= 1;
        if (remaining <= 0) {
          clearCountdown();
          resolve(false);
          return;
        }
        if (typeof onTick === "function") {
          onTick(remaining);
        }
      }, 1000);
    });
  }

  async function waitForExtraction(beforeAvailable) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < EXTRACT_TIMEOUT_MS) {
      maybeConfirmModal();

      const harvestBox = findHarvestBox(document);
      const orbInfo = getOrbInfo(harvestBox);
      const extractButton = findExtractButton(harvestBox);

      if (orbInfo.total > 0 && orbInfo.available < beforeAvailable) {
        return true;
      }

      if (extractButton && extractButton.disabled && orbInfo.total > 0 && orbInfo.available <= beforeAvailable - 1) {
        return true;
      }

      await delay(EXTRACT_POLL_MS);
    }

    return false;
  }

  function maybeConfirmModal() {
    const buttons = [...document.querySelectorAll("button, input[type='button'], input[type='submit'], a")]
      .filter((node) => isVisible(node))
      .filter((node) => {
        const text = foldTurkish(node.textContent || node.value || "");
        return /^(evet|tamam|onayla|devam et)$/.test(text) || /^(ok|yes|confirm)$/.test(text);
      });

    for (const button of buttons) {
      const modal = button.closest(".modal, .dialog, .ui-dialog, .popup, [role='dialog']");
      if (!modal) {
        continue;
      }
      log("Onay penceresi algilandi, onay veriliyor.");
      button.click();
      return true;
    }

    return false;
  }

  function isVisible(node) {
    if (!node || !(node instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" && node.offsetParent !== null;
  }

  function findHarvestBox(doc) {
    for (const section of doc.querySelectorAll("#content #humanhunt, #humanhunt")) {
      const heading = normalizeText(section.querySelector("h2")?.textContent || "");
      if (/hasat/i.test(foldTurkish(heading))) {
        return section;
      }
    }
    return null;
  }

  function highlightHarvestBox(harvestBox) {
    if (!harvestBox) {
      return;
    }
    try {
      harvestBox.style.outline = "3px solid #ffd000";
      harvestBox.style.boxShadow = "0 0 18px rgba(255, 208, 0, 0.9)";
      harvestBox.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      // gormezden gel
    }
  }

  function extractPotionName(harvestBox) {
    if (!harvestBox) {
      return "";
    }

    const lines = [...harvestBox.querySelectorAll(".rank-line")]
      .map((node) => normalizeText(node.textContent || ""))
      .filter(Boolean);

    if (lines.length >= 2) {
      return `${lines[0]} ${lines[1]}`.trim();
    }

    if (lines.length === 1) {
      return lines[0];
    }

    const text = normalizeText(harvestBox.innerText || "");
    const match = foldTurkish(text).match(/([sabcde])\s*-\s*rutbe/i);
    return match ? match[0] : "";
  }

  function extractPotionClass(potionName) {
    const match = String(potionName || "").match(/\b([SABCDE])\b/i);
    return match ? match[1].toUpperCase() : "";
  }

  function getOrbInfo(harvestBox) {
    if (!harvestBox) {
      return { available: 0, total: 0, states: [] };
    }

    const slots = [...harvestBox.querySelectorAll(".slots .slot")];
    const states = slots.map((slot) => {
      const text = normalizeText(slot.innerText || "");
      const folded = foldTurkish(text);
      return {
        available: folded.includes("kullanilabilir"),
        text,
      };
    });

    return {
      available: states.filter((slot) => slot.available).length,
      total: states.length,
      states,
    };
  }

  function pageOrbRemainingSeconds() {
    const values = [];
    for (const node of document.querySelectorAll("#content span, #content div, #content p")) {
      const text = normalizeText(node.textContent || "");
      // Kure sayaci 1 saatin ustunde "1:03:47" (S:DD:SS), altinda "28:40" (DD:SS)
      // bicimindedir; iki bicim de okunmali yoksa kureler "hazir" sanilir.
      const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!match) continue;
      const seconds = match[3] !== undefined
        ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        : Number(match[1]) * 60 + Number(match[2]);
      if (seconds > 0) values.push(seconds);
    }
    return values.length >= 1 ? Math.max(...values) : 0;
  }

  function updateOrbScheduleFromPage() {
    // Kat botuna teslimde yazilan sayaclar geciciydi; robbery sayfasindayiz,
    // gercek durumu sayfadan okuyacagiz. Geciciyi sil ki kureler hazirken
    // (sayfada geri sayim yokken) sahte sure yuzunden saatlerce beklenmesin.
    if (settings.orbTimersProvisional) {
      settings.orbReadyAt = 0;
      settings.orbCollectAt = 0;
      settings.orbTimersProvisional = false;
      saveSettings();
    }
    // Av yalnizca tum kureler kullanilabilir durumdaysa baslasin. 1/3 veya 2/3
    // durumunda en son yenilenecek kurenin (en buyuk) sayacina gore beklenir.
    const orbInfo = getOrbInfo(document);
    if (orbInfo.total > 0 && orbInfo.available === orbInfo.total) {
      if (settings.orbCollectAt || settings.orbReadyAt) {
        settings.orbReadyAt = 0;
        settings.orbCollectAt = 0;
        saveSettings();
      }
      return 0;
    }
    const remainingSeconds = pageOrbRemainingSeconds();
    if (remainingSeconds > 0) {
      const detectedReadyAt = Date.now() + remainingSeconds * 1000;
      if (!settings.orbReadyAt || !settings.orbCollectAt || Math.abs(settings.orbReadyAt - detectedReadyAt) > 5000) {
        const min = settings.orbReadyDelayMinMinutes;
        const max = settings.orbReadyDelayMaxMinutes;
        const delayMinutes = min + Math.random() * (max - min);
        settings.orbReadyAt = detectedReadyAt;
        settings.orbCollectAt = detectedReadyAt + Math.round(delayMinutes * 60000);
        saveSettings();
      }
    }
    if (settings.orbCollectAt > Date.now()) {
      return settings.orbCollectAt - Date.now();
    }
    if (settings.orbCollectAt || settings.orbReadyAt) {
      settings.orbReadyAt = 0;
      settings.orbCollectAt = 0;
      saveSettings();
    }
    return 0;
  }

  function formatDuration(milliseconds) {
    const total = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  // Bot kendiliginden durunca Telegram'a haber ver (gece sessizce durmasin).
  async function sendOrbEventNotification(message) {
    const docId = `orbstop_${Date.now()}_${Math.random().toString(36).slice(2, 9) || "0"}`;
    try {
      const response = await fetch(`${ORB_NOTIFICATIONS_URL}?documentId=${docId}&key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            kind: { stringValue: "stopped" },
            message: { stringValue: String(message).slice(0, 300) },
            host: { stringValue: location.host },
            createdAt: { stringValue: new Date().toISOString() }
          }
        })
      });
      if (!response.ok) throw new Error(`Firestore ${response.status}: ${await response.text()}`);
      log(`Telegram bildirimi planlandi: Bot durdu (${message})`);
    } catch (error) {
      console.error(SCRIPT_TAG, "Durus Telegram bildirimi gonderilemedi.", error);
    }
  }

  async function sendOrbCollectedNotification(orbClass) {
    const normalizedClass = String(orbClass || "").toUpperCase();
    if (!["S", "A", "B"].includes(normalizedClass)) return;
    const docId = `orb_${Date.now()}_${Math.random().toString(36).slice(2, 9) || "0"}`;
    try {
      const response = await fetch(`${ORB_NOTIFICATIONS_URL}?documentId=${encodeURIComponent(docId)}&key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            orbClass: { stringValue: normalizedClass },
            host: { stringValue: location.host },
            createdAt: { stringValue: new Date().toISOString() }
          }
        })
      });
      if (!response.ok) throw new Error(`Firestore ${response.status}: ${await response.text()}`);
      log(`Telegram bildirimi planlandi: Orb alindi ${normalizedClass}`);
    } catch (error) {
      console.error(SCRIPT_TAG, "Orb Telegram bildirimi gonderilemedi.", error);
    }
  }

  function findExtractButton(harvestBox) {
    if (!harvestBox) {
      return null;
    }

    return harvestBox.querySelector("#extractBloodBtn, #extractBlood button, button[id*='extractBlood']");
  }

  function isRobberyIndexPage(url) {
    return /\/robbery\/index(?:[?#]|$)/i.test(String(url || ""));
  }

  // Orb botunun asil is yaptigi sayfalar (eski @match kapsami). Bunlarin
  // disindaki sayfalarda script yalnizca bekci modunda calisir.
  function isOrbWorkPage(url) {
    return /\/robbery\/index(?:[?#]|$)|\/robbery\/humanhunt\/|\/report\/fightreport\//i.test(String(url || ""));
  }

  function findLocationButton(locationId) {
    const escapedId = String(locationId).replace(/"/g, '\\"');
    return (
      document.querySelector(`#humanhunt button[onclick*="doHunt(${escapedId})"]`) ||
      document.querySelector(`#humanhunt [onclick*="doHunt(${escapedId})"]`) ||
      null
    );
  }

  function getLocationLabel(id) {
    const loc = LOCATIONS.find((item) => item.id === String(id));
    return loc ? loc.label : "Sehir";
  }

  function submitSelectedLocation() {
    const locationId = settings.location || DEFAULT_LOCATION_ID;
    const button = findLocationButton(locationId);
    if (!button) {
      if (orbPriorityCoordinator().orbPriority) {
        handoffToFloorBot("Av enerjisi veya av butonu kalmadi.");
        return;
      }
      throw new Error(`${getLocationLabel(locationId)} hunt butonu bulunamadi.`);
    }

    if (button.disabled || button.getAttribute("aria-disabled") === "true") {
      handoffToFloorBot("Av enerjisi bitti.");
      return;
    }

    if (typeof window.doHunt === "function") {
      window.doHunt(Number(locationId));
      return;
    }

    button.click();
  }

  function buildRepeatRequest(doc, baseUrl) {
    const triggerNodes = [...doc.querySelectorAll("button, input[type='submit'], input[type='button'], a[href], [onclick]")]
      .filter((node) => /yeniden/i.test(normalizeText(node.innerText || node.textContent || node.value || "")));

    for (const node of triggerNodes) {
      const form = node.closest("form");
      if (form) {
        return buildRequestFromForm(form, baseUrl, node);
      }

      const href = node.getAttribute("href");
      if (href && !href.startsWith("javascript:")) {
        return {
          url: new URL(href, baseUrl).href,
          method: "GET",
          body: null,
        };
      }

      const onclick = node.getAttribute("onclick") || "";
      const urlFromOnclick = extractUrlFromJs(onclick, baseUrl);
      if (urlFromOnclick) {
        return {
          url: urlFromOnclick,
          method: "GET",
          body: null,
        };
      }
    }

    const forms = [...doc.querySelectorAll("form")]
      .filter((form) => /yeniden/i.test(normalizeText(form.innerText || form.textContent || "")));

    for (const form of forms) {
      return buildRequestFromForm(form, baseUrl, null);
    }

    return null;
  }

  function buildRequestFromForm(form, baseUrl, clickedNode) {
    const action = form.getAttribute("action") || baseUrl;
    const url = new URL(action, baseUrl).href;
    const method = (form.getAttribute("method") || "GET").toUpperCase();
    const formData = new URLSearchParams();

    for (const element of form.querySelectorAll("input, select, textarea, button")) {
      const name = element.getAttribute("name");
      const tag = element.tagName.toUpperCase();
      const type = (element.getAttribute("type") || "").toLowerCase();

      if ((type === "checkbox" || type === "radio") && !element.checked) {
        continue;
      }

      if (tag === "BUTTON") {
        if (type && type !== "submit" && type !== "hidden" && type !== "button") {
          continue;
        }

        if (name && clickedNode && element === clickedNode) {
          formData.append(name, element.value || "");
        }
        continue;
      }

      if (!name) {
        continue;
      }

      formData.append(name, element.value || "");
    }

    return {
      url,
      method,
      body: method === "GET" ? "" : formData.toString(),
    };
  }

  function extractUrlFromJs(source, baseUrl) {
    if (!source) {
      return "";
    }

    const patterns = [
      /location\.href\s*=\s*['"]([^'"]+)['"]/i,
      /window\.location\s*=\s*['"]([^'"]+)['"]/i,
      /document\.location\s*=\s*['"]([^'"]+)['"]/i,
      /['"]((?:https?:\/\/|\/)[^'"]+)['"]/i,
    ];

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) {
        return new URL(match[1], baseUrl).href;
      }
    }

    return "";
  }

  function navigateWithRequest(request) {
    if (!request) {
      return;
    }

    if (request.method === "GET") {
      const targetUrl = request.body
        ? `${request.url}${request.url.includes("?") ? "&" : "?"}${request.body}`
        : request.url;
      window.location.assign(targetUrl);
      return;
    }

    const form = document.createElement("form");
    form.method = request.method;
    form.action = request.url;
    form.style.display = "none";

    const params = new URLSearchParams(request.body || "");
    for (const [key, value] of params.entries()) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function foldTurkish(value) {
    return normalizeText(value)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .replace(/İ/g, "I")
      .toLowerCase();
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, num));
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function log(message) {
    console.log(SCRIPT_TAG, message);
  }

  // =========================================================================
  // PANEL (Kullanici Arayuzu)
  // =========================================================================

  const ui = {
    root: null,
    classButtons: {},
    locationSelect: null,
    autoToggle: null,
    delayMinInput: null,
    delayMaxInput: null,
    repeatMinInput: null,
    repeatMaxInput: null,
    orbWaitMinInput: null,
    orbWaitMaxInput: null,
    orbReadyCountdown: null,
    orbCollectCountdown: null,
    startStopBtn: null,
    status: null,
  };

  function buildPanel() {
    if (document.getElementById("bf-orb-panel")) {
      return;
    }

    injectStyles();

    const root = document.createElement("div");
    root.id = "bf-orb-panel";
    root.innerHTML = `
      <div class="bf-orb-header">
        <span class="bf-orb-title">⚔️ Orb Toplayici <small class="bf-orb-version">v${SCRIPT_VERSION}</small></span>
        <button type="button" class="bf-orb-collapse" title="Kucult/Buyut">—</button>
      </div>
      <div class="bf-orb-body">
        <div class="bf-orb-section">
          <label class="bf-orb-label" for="bf-orb-location">Avlanacak yer</label>
          <select id="bf-orb-location" class="bf-orb-select">
            ${LOCATIONS.map((loc) => `<option value="${loc.id}">${loc.label}</option>`).join("")}
          </select>
        </div>

        <div class="bf-orb-section">
          <div class="bf-orb-label">Toplanacak siniflar</div>
          <div class="bf-orb-classes">
            <button type="button" class="bf-orb-class" data-class="S">S</button>
            <button type="button" class="bf-orb-class" data-class="A">A</button>
            <button type="button" class="bf-orb-class" data-class="B">B</button>
          </div>
        </div>

        <div class="bf-orb-section">
          <label class="bf-orb-switch-row">
            <span>Otomatik al</span>
            <span class="bf-orb-switch">
              <input type="checkbox" id="bf-orb-auto">
              <span class="bf-orb-slider"></span>
            </span>
          </label>
          <div class="bf-orb-hint" id="bf-orb-auto-hint"></div>
        </div>

        <div class="bf-orb-section">
          <button type="button" class="bf-orb-timing-toggle" id="bf-orb-timing-toggle">
            <span>Bekleme sureleri</span><span class="bf-orb-caret">▸</span>
          </button>
          <div class="bf-orb-timing" id="bf-orb-timing" style="display:none">
            <div class="bf-orb-section" id="bf-orb-delay-section" title="Hedef gelince bu aralikta rastgele beklenip alinir.">
              <div class="bf-orb-label">Alma gecikmesi (sn)</div>
              <div class="bf-orb-range">
                <input type="number" id="bf-orb-delay-min" min="0" max="120" step="0.1" title="En az">
                <span class="bf-orb-range-sep">–</span>
                <input type="number" id="bf-orb-delay-max" min="0" max="120" step="0.1" title="En cok">
              </div>
            </div>
            <div class="bf-orb-section" title="Her &quot;Yeniden&quot; basisindan once bu aralikta rastgele beklenir.">
              <div class="bf-orb-label">Yeniden gecikmesi (sn)</div>
              <div class="bf-orb-range">
                <input type="number" id="bf-orb-repeat-min" min="0" max="60" step="0.1" title="En az">
                <span class="bf-orb-range-sep">–</span>
                <input type="number" id="bf-orb-repeat-max" min="0" max="60" step="0.1" title="En cok">
              </div>
            </div>
            <div class="bf-orb-section" title="En son kure hazir olduktan sonra rastgele beklenir.">
              <div class="bf-orb-label">Kure hazir gecikmesi (dk)</div>
              <div class="bf-orb-range">
                <input type="number" id="bf-orb-wait-min" min="0" max="180" step="0.1" title="En az">
                <span class="bf-orb-range-sep">–</span>
                <input type="number" id="bf-orb-wait-max" min="0" max="180" step="0.1" title="En cok">
              </div>
            </div>
          </div>
        </div>

        <div class="bf-orb-schedule">
          <div>Kurelerin hazir olmasina: <strong id="bf-orb-ready-countdown">--:--:--</strong></div>
          <div>Orb toplamaya: <strong id="bf-orb-collect-countdown">--:--:--</strong></div>
        </div>

        <button type="button" class="bf-orb-recheck" id="bf-orb-recheck" title="Kayitli sayaclari sifirlar ve sureyi bu sunucudaki sayfadan yeniden okur (sunucu degistirince kullan)">Sureyi yeniden kontrol et</button>

        <button type="button" class="bf-orb-start" id="bf-orb-startstop">Baslat</button>

        <div class="bf-orb-status" id="bf-orb-status">Hazir.</div>
      </div>
    `;

    document.body.appendChild(root);

    ui.root = root;
    ui.locationSelect = root.querySelector("#bf-orb-location");
    ui.autoToggle = root.querySelector("#bf-orb-auto");
    ui.delayMinInput = root.querySelector("#bf-orb-delay-min");
    ui.delayMaxInput = root.querySelector("#bf-orb-delay-max");
    ui.repeatMinInput = root.querySelector("#bf-orb-repeat-min");
    ui.repeatMaxInput = root.querySelector("#bf-orb-repeat-max");
    ui.orbWaitMinInput = root.querySelector("#bf-orb-wait-min");
    ui.orbWaitMaxInput = root.querySelector("#bf-orb-wait-max");
    ui.orbReadyCountdown = root.querySelector("#bf-orb-ready-countdown");
    ui.orbCollectCountdown = root.querySelector("#bf-orb-collect-countdown");
    ui.recheckBtn = root.querySelector("#bf-orb-recheck");
    ui.startStopBtn = root.querySelector("#bf-orb-startstop");
    ui.status = root.querySelector("#bf-orb-status");

    // kaydedilmis panel konumunu uygula
    applyPanelPos();
    // header'dan surukle-birak
    enablePanelDrag(root.querySelector(".bf-orb-header"), root);

    // sinif butonlari
    root.querySelectorAll(".bf-orb-class").forEach((btn) => {
      const cls = btn.getAttribute("data-class");
      ui.classButtons[cls] = btn;
      btn.addEventListener("click", () => {
        settings.classes[cls] = !settings.classes[cls];
        saveSettings();
        syncPanel();
      });
    });

    // lokasyon secimi
    ui.locationSelect.addEventListener("change", () => {
      settings.location = ui.locationSelect.value;
      saveSettings();
      syncPanel();
    });

    // otomatik al toggle
    ui.autoToggle.addEventListener("change", () => {
      settings.autoCollect = ui.autoToggle.checked;
      saveSettings();
      syncPanel();
    });

    // alma gecikmesi (min / max)
    const onDelayChange = () => {
      let minVal = clampNumber(ui.delayMinInput.value, 0, 120, DEFAULT_SETTINGS.collectDelayMinSec);
      let maxVal = clampNumber(ui.delayMaxInput.value, 0, 120, DEFAULT_SETTINGS.collectDelayMaxSec);
      if (maxVal < minVal) {
        maxVal = minVal;
      }
      settings.collectDelayMinSec = minVal;
      settings.collectDelayMaxSec = maxVal;
      saveSettings();
      syncPanel();
    };
    ui.delayMinInput.addEventListener("change", onDelayChange);
    ui.delayMaxInput.addEventListener("change", onDelayChange);

    // tekrar gecikmesi (min / max)
    const onRepeatChange = () => {
      let minVal = clampNumber(ui.repeatMinInput.value, REPEAT_MIN_SEC, REPEAT_MAX_SEC, DEFAULT_SETTINGS.repeatMinSec);
      let maxVal = clampNumber(ui.repeatMaxInput.value, REPEAT_MIN_SEC, REPEAT_MAX_SEC, DEFAULT_SETTINGS.repeatMaxSec);
      if (maxVal < minVal) {
        maxVal = minVal;
      }
      settings.repeatMinSec = minVal;
      settings.repeatMaxSec = maxVal;
      saveSettings();
      syncPanel();
    };
    ui.repeatMinInput.addEventListener("change", onRepeatChange);
    ui.repeatMaxInput.addEventListener("change", onRepeatChange);

    const onOrbWaitChange = () => {
      let minVal = clampNumber(ui.orbWaitMinInput.value, 0, 180, DEFAULT_SETTINGS.orbReadyDelayMinMinutes);
      let maxVal = clampNumber(ui.orbWaitMaxInput.value, 0, 180, DEFAULT_SETTINGS.orbReadyDelayMaxMinutes);
      if (maxVal < minVal) maxVal = minVal;
      settings.orbReadyDelayMinMinutes = minVal;
      settings.orbReadyDelayMaxMinutes = maxVal;
      saveSettings();
      syncPanel();
    };
    ui.orbWaitMinInput.addEventListener("change", onOrbWaitChange);
    ui.orbWaitMaxInput.addEventListener("change", onOrbWaitChange);

    // sureyi yeniden kontrol et: kayitli sayaclari sifirla ve sayfadan tekrar oku.
    // Sunucu degisiminde eski sunucunun sayaclarinin kullanilmasini duzeltir.
    ui.recheckBtn.addEventListener("click", () => {
      settings.orbReadyAt = 0;
      settings.orbCollectAt = 0;
      saveSettings();
      if (!isRobberyIndexPage(location.href)) {
        setStatus("Sureler sifirlandi; robbery sayfasindan okunuyor...", "warn");
        window.location.assign(`${location.origin}/robbery/index`);
        return;
      }
      const waitMs = updateOrbScheduleFromPage();
      updateOrbSchedulePanel();
      if (waitMs > 0) {
        setStatus(`Sureler yeniden okundu. Kureler icin bekleme: ${formatDuration(waitMs)}`, "warn");
      } else if (settings.running) {
        setStatus("Sureler yeniden okundu, kureler hazir. Av basliyor...", "ok");
      } else {
        setStatus("Sureler yeniden okundu, kureler hazir.", "ok");
      }
    });

    // baslat / durdur
    ui.startStopBtn.addEventListener("click", () => {
      if (settings.running) {
        stopHunt("Durduruldu.", false);
      } else {
        startHunt();
      }
    });

    // kucult / buyut
    root.querySelector(".bf-orb-collapse").addEventListener("click", () => {
      root.classList.toggle("bf-orb-collapsed");
    });

    // bekleme sureleri ac / kapa
    const timingToggle = root.querySelector("#bf-orb-timing-toggle");
    const timingBox = root.querySelector("#bf-orb-timing");
    timingToggle.addEventListener("click", () => {
      const open = timingBox.style.display === "none";
      timingBox.style.display = open ? "" : "none";
      timingToggle.querySelector(".bf-orb-caret").textContent = open ? "▾" : "▸";
    });

    syncPanel();
    updateOrbSchedulePanel();
    window.setInterval(updateOrbSchedulePanel, 1000);
  }

  function syncPanel() {
    if (!ui.root) {
      return;
    }

    Object.keys(ui.classButtons).forEach((cls) => {
      ui.classButtons[cls].classList.toggle("active", Boolean(settings.classes[cls]));
    });

    if (ui.locationSelect) {
      ui.locationSelect.value = settings.location;
    }

    ui.autoToggle.checked = settings.autoCollect;

    if (ui.delayMinInput) {
      ui.delayMinInput.value = settings.collectDelayMinSec;
    }
    if (ui.delayMaxInput) {
      ui.delayMaxInput.value = settings.collectDelayMaxSec;
    }

    if (ui.repeatMinInput) {
      ui.repeatMinInput.value = settings.repeatMinSec;
    }
    if (ui.repeatMaxInput) {
      ui.repeatMaxInput.value = settings.repeatMaxSec;
    }
    if (ui.orbWaitMinInput) ui.orbWaitMinInput.value = settings.orbReadyDelayMinMinutes;
    if (ui.orbWaitMaxInput) ui.orbWaitMaxInput.value = settings.orbReadyDelayMaxMinutes;

    const autoHint = ui.root.querySelector("#bf-orb-auto-hint");
    const delaySection = ui.root.querySelector("#bf-orb-delay-section");
    if (settings.autoCollect) {
      autoHint.textContent = "Hedef gelince gecikme sonrasi kure otomatik alinir.";
      delaySection.style.display = "";
    } else {
      autoHint.textContent = "Hedef gelince durur, kureyi sen alirsin.";
      delaySection.style.display = "none";
    }

    if (settings.running) {
      ui.startStopBtn.textContent = "Durdur";
      ui.startStopBtn.classList.add("running");
    } else {
      ui.startStopBtn.textContent = "Baslat";
      ui.startStopBtn.classList.remove("running");
    }
  }

  function updateOrbSchedulePanel() {
    if (!ui.orbReadyCountdown || !ui.orbCollectCountdown) return;
    ui.orbReadyCountdown.textContent = settings.orbReadyAt > Date.now()
      ? formatDuration(settings.orbReadyAt - Date.now()) : "00:00:00";
    ui.orbCollectCountdown.textContent = settings.orbCollectAt > Date.now()
      ? formatDuration(settings.orbCollectAt - Date.now()) : "00:00:00";
  }

  function setStatus(message, type) {
    if (!ui.status) {
      return;
    }
    ui.status.textContent = message;
    ui.status.className = "bf-orb-status";
    if (type) {
      ui.status.classList.add(`bf-orb-status-${type}`);
    }
  }

  // Kaydedilmis konumu panele uygula (yoksa CSS varsayilani: sag-ust)
  function applyPanelPos() {
    if (!ui.root || !settings.panelPos) {
      return;
    }
    const { left, top } = clampPanelPos(settings.panelPos.left, settings.panelPos.top);
    ui.root.style.left = `${left}px`;
    ui.root.style.top = `${top}px`;
    ui.root.style.right = "auto";
    ui.root.style.bottom = "auto";
  }

  // Paneli ekran sinirlari icinde tut
  function clampPanelPos(left, top) {
    const rect = ui.root ? ui.root.getBoundingClientRect() : { width: 230, height: 120 };
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    return {
      left: clampNumber(left, 0, maxLeft, 0),
      top: clampNumber(top, 0, maxTop, 0),
    };
  }

  // Header'dan tutup paneli surukle (konum localStorage'a kaydedilir)
  function enablePanelDrag(handle, root) {
    if (!handle || !root) {
      return;
    }

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerDown = (event) => {
      // kucult/buyut butonuna basinca surukleme baslamasin
      if (event.target.closest(".bf-orb-collapse")) {
        return;
      }
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      dragging = true;
      const rect = root.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;

      // sabit sol/ust konuma gec
      root.style.left = `${startLeft}px`;
      root.style.top = `${startTop}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";

      handle.classList.add("bf-orb-dragging");
      try { handle.setPointerCapture(event.pointerId); } catch (e) {}
      event.preventDefault();
    };

    const onPointerMove = (event) => {
      if (!dragging) {
        return;
      }
      const next = clampPanelPos(
        startLeft + (event.clientX - startX),
        startTop + (event.clientY - startY)
      );
      root.style.left = `${next.left}px`;
      root.style.top = `${next.top}px`;
    };

    const onPointerUp = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      handle.classList.remove("bf-orb-dragging");
      try { handle.releasePointerCapture(event.pointerId); } catch (e) {}

      const rect = root.getBoundingClientRect();
      settings.panelPos = { left: Math.round(rect.left), top: Math.round(rect.top) };
      saveSettings();
    };

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);

    // pencere yeniden boyutlandirilirsa paneli ekranda tut
    window.addEventListener("resize", () => {
      if (!settings.panelPos) {
        return;
      }
      applyPanelPos();
    });
  }

  function injectStyles() {
    if (document.getElementById("bf-orb-styles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "bf-orb-styles";
    style.textContent = `
      #bf-orb-panel {
        position: fixed;
        top: 90px;
        right: 16px;
        width: 205px;
        z-index: 999999;
        background: linear-gradient(160deg, #1c1410, #2a1d14);
        border: 1px solid #5a3d22;
        border-radius: 10px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.6);
        color: #f0e6d6;
        font-family: "Segoe UI", Tahoma, sans-serif;
        font-size: 13px;
        user-select: none;
      }
      #bf-orb-panel * { box-sizing: border-box; }
      .bf-orb-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 12px;
        background: linear-gradient(90deg, #3a2616, #533318);
        border-bottom: 1px solid #6b4624;
        border-radius: 10px 10px 0 0;
        cursor: grab;
        touch-action: none;
      }
      .bf-orb-header.bf-orb-dragging { cursor: grabbing; }
      .bf-orb-title { font-weight: 700; letter-spacing: .3px; color: #ffcf80; }
      .bf-orb-version { font-size: 10px; font-weight: 600; color: #c8a47a; opacity: .8; }
      .bf-orb-collapse {
        background: transparent; border: none; color: #ffcf80;
        font-size: 16px; line-height: 1; cursor: pointer; padding: 0 4px;
      }
      .bf-orb-body { padding: 10px; display: flex; flex-direction: column; gap: 9px; }
      #bf-orb-panel.bf-orb-collapsed .bf-orb-body { display: none; }
      .bf-orb-section { display: flex; flex-direction: column; gap: 5px; }
      .bf-orb-timing-toggle {
        display: flex; align-items: center; justify-content: space-between;
        width: 100%; padding: 7px 9px; border-radius: 8px; cursor: pointer;
        border: 1px solid #5a3d22; background: #241a12; color: #c8a47a;
        font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
        transition: all .15s ease;
      }
      .bf-orb-timing-toggle:hover { border-color: #8a5d33; color: #ffcf80; }
      .bf-orb-caret { font-size: 12px; color: #ffcf80; }
      .bf-orb-timing { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
      .bf-orb-label { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #c8a47a; }
      .bf-orb-classes { display: flex; gap: 8px; }
      .bf-orb-class {
        flex: 1; padding: 7px 0; border-radius: 8px; cursor: pointer;
        border: 1px solid #5a3d22; background: #241a12; color: #b9a489;
        font-weight: 700; font-size: 14px; transition: all .15s ease;
      }
      .bf-orb-class:hover { border-color: #8a5d33; }
      .bf-orb-class.active {
        background: linear-gradient(160deg, #c8881f, #e0a52e);
        color: #1a1208; border-color: #ffd479;
        box-shadow: 0 0 10px rgba(224, 165, 46, .5);
      }
      .bf-orb-switch-row {
        display: flex; align-items: center; justify-content: space-between;
        cursor: pointer; font-weight: 600;
      }
      .bf-orb-switch { position: relative; width: 42px; height: 22px; }
      .bf-orb-switch input { opacity: 0; width: 0; height: 0; }
      .bf-orb-slider {
        position: absolute; inset: 0; background: #4a3322; border-radius: 22px;
        transition: .2s; cursor: pointer;
      }
      .bf-orb-slider::before {
        content: ""; position: absolute; height: 16px; width: 16px; left: 3px; top: 3px;
        background: #f0e6d6; border-radius: 50%; transition: .2s;
      }
      .bf-orb-switch input:checked + .bf-orb-slider { background: #e0a52e; }
      .bf-orb-switch input:checked + .bf-orb-slider::before { transform: translateX(20px); }
      .bf-orb-hint { font-size: 11px; color: #9c8a72; line-height: 1.3; }
      .bf-orb-select {
        width: 100%; padding: 8px 9px; border-radius: 8px;
        border: 1px solid #5a3d22; background: #241a12; color: #f0e6d6;
        font-size: 14px; cursor: pointer;
      }
      .bf-orb-select:hover { border-color: #8a5d33; }
      #bf-orb-delay {
        width: 100%; padding: 7px 9px; border-radius: 8px;
        border: 1px solid #5a3d22; background: #241a12; color: #f0e6d6;
        font-size: 14px;
      }
      .bf-orb-range { display: flex; align-items: center; gap: 8px; }
      .bf-orb-range input {
        flex: 1; min-width: 0; padding: 7px 9px; border-radius: 8px;
        border: 1px solid #5a3d22; background: #241a12; color: #f0e6d6;
        font-size: 14px; text-align: center;
      }
      .bf-orb-range-sep { color: #c8a47a; font-weight: 700; }
      .bf-orb-recheck {
        width: 100%; padding: 8px 0; border-radius: 8px; cursor: pointer;
        border: 1px solid #5a3d22; background: #241a12; color: #ffcf80;
        font-weight: 600; font-size: 12px; transition: all .15s ease;
      }
      .bf-orb-recheck:hover { border-color: #8a5d33; background: #2e2118; }
      .bf-orb-start {
        width: 100%; padding: 11px 0; border: none; border-radius: 8px;
        cursor: pointer; font-weight: 700; font-size: 14px; letter-spacing: .3px;
        background: linear-gradient(160deg, #2f9e44, #40c057); color: #06220e;
        transition: filter .15s ease;
      }
      .bf-orb-start:hover { filter: brightness(1.08); }
      .bf-orb-start.running {
        background: linear-gradient(160deg, #c92a2a, #e03131); color: #fff;
      }
      .bf-orb-status {
        font-size: 12px; padding: 8px 10px; border-radius: 8px;
        background: #1a120c; border: 1px solid #3a2818; color: #c8b79f;
        min-height: 32px; line-height: 1.35; word-break: break-word;
      }
      .bf-orb-schedule {
        padding: 8px 10px; border-radius: 8px; background: #1a120c;
        border: 1px solid #5a3d22; color: #c8b79f; font-size: 11px; line-height: 1.7;
      }
      .bf-orb-schedule strong { color: #ffcf80; float: right; font-variant-numeric: tabular-nums; }
      .bf-orb-status-ok { border-color: #2f9e44; color: #8ce99a; }
      .bf-orb-status-warn { border-color: #e8a317; color: #ffd479; }
    `;
    document.head.appendChild(style);
  }

  // Panel'i kur (yalnizca orb sayfalarinda; bekci modunda panel gosterilmez,
  // boylece diger sayfalardaki kat botu paneliyle cakismaz)
  if (isOrbWorkPage(location.href)) {
    if (document.body) {
      buildPanel();
    } else {
      window.addEventListener("DOMContentLoaded", buildPanel);
    }
  }
})();
