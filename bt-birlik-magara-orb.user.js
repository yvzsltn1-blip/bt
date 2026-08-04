// ==UserScript==
// @name         BiteFight Birlik + Magara + Orb
// @namespace    https://bt-analiz.web.app
// @version      1.2.1
// @description  Birlik, magara, orb ve skill basmayi tek panelde birlestirir; oncelikli tek tus baslatma.
// @match        https://bt-analiz.web.app/*
// @match        *://*.bitefight.org/*
// @match        *://*.bitefight.gameforge.com/*
// @require      https://bt-analiz.web.app/battle-core.js?v=20260702-2
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      bt-analiz.web.app
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  if (window.__BFOrbHarvestLoaded) {
    return;
  }
  window.__BFOrbHarvestLoaded = true;

  const SCRIPT_TAG = "[BF Orb]";
  const SCRIPT_VERSION = "2.9.8";
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
  const DISCARD_STATE_KEY = "BFItemDiscardStateV1";
  const FLOOR_COORDINATION_KEY = "BFOrbFloorCoordinator";
  // Kat botu kilidi bu sureden uzun tazelenmezse bayat sayilir (sekme kapandi/cokme).
  const FLOOR_LOCK_STALE_MS = 10 * 60 * 1000;
  // "Uygun aksiyon bulunamadi" durumunda robbery uzerinden kac kez yeniden denenir.
  const NO_ACTION_RETRY_KEY = "BFOrbNoActionRetries";
  const NO_ACTION_MAX_RETRIES = 3;
  // Script kalici olarak durmaz: sorun (enerji bitti, sayfa okunamadi vb.)
  // durumunda bu araliklarla bekleyip robbery/index uzerinden tekrar dener.
  const RETRY_WAIT_MIN_MS = 10 * 60 * 1000; // enerji/uzun sorunlar icin alt sinir
  const RETRY_WAIT_MAX_MS = 20 * 60 * 1000;
  const SHORT_RETRY_MIN_MS = 2 * 60 * 1000; // gecici sayfa sorunlari icin alt sinir
  const SHORT_RETRY_MAX_MS = 5 * 60 * 1000;
  // Ayni sebepli Telegram bilgi mesaji bu sure icinde tekrarlanmaz (spam onleme).
  const INFO_REPEAT_SUPPRESS_MS = 45 * 60 * 1000;

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
    // Sorun sonrasi (enerji bitti vb.) tekrar deneme zamani; script bu zamana
    // kadar bekler ama asla kalici durmaz.
    retryAt: 0,
    // Telegram bilgi mesaji spam onleme: son gonderilen sebep + zamani.
    lastInfoKey: "",
    lastInfoAt: 0,
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
    merged.retryAt = Math.max(0, Number(merged.retryAt) || 0);
    merged.lastInfoKey = typeof merged.lastInfoKey === "string" ? merged.lastInfoKey : "";
    merged.lastInfoAt = Math.max(0, Number(merged.lastInfoAt) || 0);

    return merged;
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error(SCRIPT_TAG, "Ayarlar kaydedilemedi:", error);
    }
  }

  function loadDiscardState() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(DISCARD_STATE_KEY) || "{}") || {};
      return {
        running: parsed.running === true,
        trigger: String(parsed.trigger || ""),
        returnUrl: String(parsed.returnUrl || ""),
        initialCount: Math.max(0, Number(parsed.initialCount) || 0),
        clickedCount: Math.max(0, Number(parsed.clickedCount) || 0),
        remainingCount: Math.max(0, Number(parsed.remainingCount) || 0),
        nextClickAt: Math.max(0, Number(parsed.nextClickAt) || 0),
        status: String(parsed.status || ""),
      };
    } catch {
      return { running: false, trigger: "", returnUrl: "", initialCount: 0, clickedCount: 0, remainingCount: 0, nextClickAt: 0, status: "" };
    }
  }

  function saveDiscardState(state) {
    window.localStorage.setItem(DISCARD_STATE_KEY, JSON.stringify(state));
    refreshDiscardPanel(state);
  }

  function isProfilePage() {
    return /^\/profile\/index(?:\/|$)/.test(location.pathname);
  }

  function profileUrl() {
    return `${location.origin}/profile/index`;
  }

  function discardButtonLabel(element) {
    return normalizeText(element?.textContent || element?.value || "").toLocaleLowerCase("tr-TR");
  }

  function findDiscardButtons() {
    if (!isProfilePage()) return [];
    return Array.from(document.querySelectorAll('a.btn[href*="/profile/discardItem/"]')).filter((element) => {
      if (discardButtonLabel(element) !== "at" || element.dataset.bfDiscardClicked === "1") return false;
      try {
        const url = new URL(element.href, location.href);
        return url.origin === location.origin && /^\/profile\/discardItem\/\d+\/\d+/.test(url.pathname);
      } catch {
        return false;
      }
    });
  }

  function beginDiscardRun(trigger, returnUrl, navigateNow = true) {
    const current = loadDiscardState();
    const state = {
      running: true,
      trigger: String(trigger || "manual"),
      returnUrl: String(returnUrl || ""),
      initialCount: 0,
      clickedCount: 0,
      remainingCount: 0,
      nextClickAt: 0,
      status: current.running ? current.status : "Profil kontrol ediliyor...",
    };
    saveDiscardState(state);
    if (!isProfilePage() && navigateNow) {
      window.location.assign(profileUrl());
      return;
    }
    if (isProfilePage()) void runDiscardQueue();
  }

  let discardQueueActive = false;

  async function runDiscardQueue() {
    if (discardQueueActive) return;
    let discardState = loadDiscardState();
    if (!discardState.running) {
      refreshDiscardPanel(discardState);
      return;
    }
    if (!isProfilePage()) {
      if (/^\/profile\/discardItem\//.test(location.pathname)) {
        window.setTimeout(() => {
          if (loadDiscardState().running) window.location.assign(profileUrl());
        }, 1500);
      } else {
        window.location.assign(profileUrl());
      }
      return;
    }

    discardQueueActive = true;
    try {
      while (discardState.running && isProfilePage()) {
        const buttons = findDiscardButtons();
        if (discardState.initialCount === 0) discardState.initialCount = buttons.length;
        discardState.remainingCount = buttons.length;

        if (buttons.length === 0) {
          discardState.running = false;
          discardState.nextClickAt = 0;
          discardState.status = `Tamamlandi: ${discardState.clickedCount} item atildi.`;
          const returnUrl = discardState.returnUrl;
          discardState.returnUrl = "";
          saveDiscardState(discardState);
          if (returnUrl && returnUrl !== location.href) {
            await delay(1000);
            window.location.assign(returnUrl);
          }
          return;
        }

        const waitSeconds = randomInt(7, 10);
        discardState.nextClickAt = Date.now() + waitSeconds * 1000;
        discardState.status = `${buttons.length} item kaldi; siradaki At ${waitSeconds} sn sonra.`;
        saveDiscardState(discardState);

        while (Date.now() < discardState.nextClickAt) {
          await delay(Math.min(1000, discardState.nextClickAt - Date.now()));
          discardState = loadDiscardState();
          if (!discardState.running || !isProfilePage()) return;
          refreshDiscardPanel(discardState);
        }

        const nextButton = findDiscardButtons()[0];
        if (!nextButton) continue;
        nextButton.dataset.bfDiscardClicked = "1";
        discardState.clickedCount += 1;
        discardState.remainingCount = Math.max(0, findDiscardButtons().length);
        discardState.nextClickAt = 0;
        discardState.status = `${discardState.clickedCount}. item icin At tiklandi.`;
        saveDiscardState(discardState);
        nextButton.click();
        await delay(1500);
        discardState = loadDiscardState();
      }
    } finally {
      discardQueueActive = false;
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
    discardItems() {
      beginDiscardRun("manual", isProfilePage() ? "" : location.href);
    },
    discardStatus() {
      return { ...loadDiscardState(), visibleButtons: findDiscardButtons().length };
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
    // Manuel baslatma onceki bekleme kilidini iptal eder; hemen denenir.
    settings.retryAt = 0;
    saveSettings();
    clearNoActionRetries();
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

  // Av basariyla ilerledigi anda (hasat kutusu/Yeniden bulundu) tum deneme
  // sayaclarini ve bekleme kilidini temizler.
  function clearRetryState() {
    clearNoActionRetries();
    if (settings.retryAt) {
      settings.retryAt = 0;
      saveSettings();
    }
  }

  function randomRetryWaitMs() {
    return randomInt(RETRY_WAIT_MIN_MS, RETRY_WAIT_MAX_MS);
  }

  function shortRetryWaitMs() {
    return randomInt(SHORT_RETRY_MIN_MS, SHORT_RETRY_MAX_MS);
  }

  // Script kalici olarak durmaz: verilen sure kadar bekleyip robbery/index
  // uzerinden kaldigi yerden devam eder. Sebep + bekleme suresi Telegram'a
  // bilgi mesaji olarak gider (durum takibi).
  function enterRetryWait(reason, waitMs) {
    const ms = Math.max(60 * 1000, Math.round(Number(waitMs) || 0));
    settings.retryAt = Date.now() + ms;
    saveSettings();
    clearNoActionRetries();
    clearCountdown();
    const message = `${reason} ${formatDurationTr(ms)} sonra otomatik devam edilecek. Orb scripti calismaya devam ediyor.`;
    setStatus(message, "warn");
    log(message);
    void sendOrbInfoNotification(message, reason);
    if (!isRobberyIndexPage(location.href)) {
      window.setTimeout(() => {
        if (settings.running) {
          window.location.assign(`${location.origin}/robbery/index`);
        }
      }, 1500);
      return;
    }
    scheduleMain(Math.min(ms, 15000));
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
        // Beklenmeyen hatada durmak yerine kisa bir bekleme sonrasi
        // robbery/index uzerinden devam edilir.
        enterRetryWait(`Hata: ${error.message}.`, shortRetryWaitMs());
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

  function handoffToFloorBot(message, navigationTarget = "") {
    const coordinator = orbPriorityCoordinator();
    const floorUrl = coordinator.floorUrl;
    if (!coordinator.orbPriority || !floorUrl) {
      // Kat botu yoksa durmak yerine enerji yenilenmesini bekleyip devam et.
      enterRetryWait(message, randomRetryWaitMs());
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
    window.location.assign(navigationTarget || floorUrl);
  }

  function waitForOrbRenewal(message, navigationTarget = "") {
    const coordinator = orbPriorityCoordinator();
    if (coordinator.orbPriority && coordinator.floorUrl) {
      handoffToFloorBot(message, navigationTarget);
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
    // Durum takibi: bekleme suresi Telegram'a bildirilir (or. "3/3 kure doldu.
    // Beklenecek sure: 5 saat 3 dk. Orb scripti calismaya devam ediyor.").
    if (waitMs > 0) {
      void sendOrbInfoNotification(
        `${message} Beklenecek sure: ${formatDurationTr(waitMs)}. Orb scripti calismaya devam ediyor.`,
        `renewal:${message}`
      );
    }

    if (navigationTarget || !isRobberyIndexPage(location.href)) {
      window.location.assign(navigationTarget || `${location.origin}/robbery/index`);
      return;
    }
    scheduleMain(waitMs > 0 ? Math.min(1000, waitMs) : 3000);
  }

  async function main() {
    if (loadDiscardState().running) {
      return;
    }
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
      // retryAt: sorun sonrasi bekleme kilidi de burada dikkate alinir.
      const waitMs = Math.max(settings.orbCollectAt, settings.retryAt || 0) - Date.now();
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
        // Sorun sonrasi bekleme kilidi (enerji bitti vb.): suresi dolana kadar
        // ava girilmez, dolunca temizlenip normal akis devam eder.
        const retryWaitMs = (settings.retryAt || 0) - Date.now();
        if (retryWaitMs > 0) {
          setStatus(`Tekrar deneme icin bekleniyor: ${formatDuration(retryWaitMs)}`, "warn");
          scheduleMain(Math.min(retryWaitMs, 15000));
          return;
        }
        if (settings.retryAt) {
          settings.retryAt = 0;
          saveSettings();
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
        clearRetryState();
        await handleHarvestBox(harvestBox);
        return;
      }

      const repeatRequest = buildRepeatRequest(document, location.href);
      if (!repeatRequest) {
        if (orbPriorityCoordinator().orbPriority) {
          handoffToFloorBot("Av enerjisi veya tekrar aksiyonu kalmadi.");
          return;
        }
        // Robbery/index uzerinden birkac kez yeniden denenir; yine olmazsa
        // script DURMAZ: kure sayacindan okunan sure (varsa) ya da rastgele
        // enerji beklemesi kadar bekleyip kaldigi yerden devam eder.
        const attempts = getNoActionRetries() + 1;
        if (attempts > NO_ACTION_MAX_RETRIES) {
          const scheduledMs = updateOrbScheduleFromPage();
          enterRetryWait(
            `Uygun tekrar aksiyonu ${NO_ACTION_MAX_RETRIES} denemede bulunamadi (enerji bitmis olabilir).`,
            scheduledMs > 0 ? scheduledMs : randomRetryWaitMs()
          );
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

      clearRetryState();
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
        enterRetryWait("Hasat bolumu bulundu ama iksir sinifi okunamadi.", shortRetryWaitMs());
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
      // Kure kalmadiysa durmak yerine yenilenme suresini okuyup bekle.
      waitForOrbRenewal(`${potionClass} sinifi bulundu ama kullanilabilir kure yok.`);
      return;
    }

    const extractButton = findExtractButton(harvestBox);
    if (!extractButton || extractButton.disabled) {
      enterRetryWait(`${potionClass} sinifi bulundu ama Cikarmak butonu aktif degil.`, shortRetryWaitMs());
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
      enterRetryWait("Cikarma sonrasi sayfa durumu dogrulanamadi.", shortRetryWaitMs());
      return;
    }

    await sendOrbCollectedNotification(potionClass);

    const refreshedHarvestBox = findHarvestBox(document);
    const refreshedOrbInfo = getOrbInfo(refreshedHarvestBox);
    if (refreshedOrbInfo.total > 0) {
      log(`${refreshedOrbInfo.available}/${refreshedOrbInfo.total} kure kullanilabilir.`);
    }

    if (refreshedOrbInfo.total > 0 && refreshedOrbInfo.available === 0) {
      const coordinator = orbPriorityCoordinator();
      const returnUrl = coordinator.orbPriority && coordinator.floorUrl
        ? coordinator.floorUrl
        : `${location.origin}/robbery/index`;
      beginDiscardRun("orb", returnUrl, false);
      waitForOrbRenewal("3/3 kure doldu.", profileUrl());
      return;
    }

    const repeatRequest = buildRepeatRequest(document, location.href);
    if (!repeatRequest) {
      // Yeniden butonu yoksa robbery/index'e donup normal akista devam edilir.
      log("Cikarma tamamlandi ama Yeniden butonu yok; robbery sayfasindan devam edilecek.");
      setStatus("Yeniden butonu yok, robbery sayfasina donuluyor...", "warn");
      window.location.assign(`${location.origin}/robbery/index`);
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

  // Telegram mesajlari icin okunakli sure: "5 saat 3 dk", "45 dk" gibi.
  function formatDurationTr(milliseconds) {
    const totalMinutes = Math.max(1, Math.round(Number(milliseconds || 0) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours} saat ${minutes} dk`;
    if (hours > 0) return `${hours} saat`;
    return `${minutes} dk`;
  }

  // Durum takibi bilgi mesaji (script durmaz; ne yaptigini Telegram'a bildirir).
  // Ayni sebepli mesaj INFO_REPEAT_SUPPRESS_MS icinde tekrarlanmaz.
  async function sendOrbInfoNotification(message, dedupeKey) {
    const key = String(dedupeKey || message);
    const now = Date.now();
    if (settings.lastInfoKey === key && now - settings.lastInfoAt < INFO_REPEAT_SUPPRESS_MS) {
      log(`Telegram bilgi mesaji atlandi (yakin zamanda ayni sebep): ${message}`);
      return;
    }
    settings.lastInfoKey = key;
    settings.lastInfoAt = now;
    saveSettings();
    const docId = `orbinfo_${now}_${Math.random().toString(36).slice(2, 9) || "0"}`;
    try {
      const response = await fetch(`${ORB_NOTIFICATIONS_URL}?documentId=${docId}&key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            kind: { stringValue: "info" },
            message: { stringValue: `🔮 ${String(message)}`.slice(0, 300) },
            host: { stringValue: location.host },
            createdAt: { stringValue: new Date().toISOString() }
          }
        })
      });
      if (!response.ok) throw new Error(`Firestore ${response.status}: ${await response.text()}`);
      log(`Telegram bilgi mesaji planlandi: ${message}`);
    } catch (error) {
      console.error(SCRIPT_TAG, "Bilgi Telegram bildirimi gonderilemedi.", error);
    }
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
    discardCount: null,
    discardStatus: null,
    discardBtn: null,
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

        <div class="bf-orb-discard">
          <div class="bf-orb-discard-summary">Atilabilir item: <strong id="bf-orb-discard-count">--</strong></div>
          <div class="bf-orb-hint" id="bf-orb-discard-status">Profil kontrol edilmedi.</div>
          <button type="button" class="bf-orb-recheck" id="bf-orb-discard-start">At itemlerini simdi temizle</button>
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
    ui.discardCount = root.querySelector("#bf-orb-discard-count");
    ui.discardStatus = root.querySelector("#bf-orb-discard-status");
    ui.discardBtn = root.querySelector("#bf-orb-discard-start");
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

    ui.discardBtn.addEventListener("click", () => {
      const discardState = loadDiscardState();
      if (discardState.running) return;
      beginDiscardRun("manual", isProfilePage() ? "" : location.href);
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
    refreshDiscardPanel();
    window.setInterval(updateOrbSchedulePanel, 1000);
    window.setInterval(() => refreshDiscardPanel(), 1000);
    window.setTimeout(() => void runDiscardQueue(), 500);
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

  function refreshDiscardPanel(stateOverride = null) {
    if (!ui.discardCount || !ui.discardStatus || !ui.discardBtn) return;
    const discardState = stateOverride || loadDiscardState();
    const visibleCount = isProfilePage() ? findDiscardButtons().length : discardState.remainingCount;
    ui.discardCount.textContent = String(visibleCount);

    if (discardState.running) {
      const remainingSeconds = discardState.nextClickAt > Date.now()
        ? Math.max(1, Math.ceil((discardState.nextClickAt - Date.now()) / 1000))
        : 0;
      ui.discardStatus.textContent = remainingSeconds > 0
        ? `${discardState.clickedCount} atildi, ${visibleCount} kaldi; ${remainingSeconds} sn bekleniyor.`
        : (discardState.status || "Temizlik devam ediyor...");
      ui.discardBtn.textContent = "Item temizligi calisiyor";
      ui.discardBtn.disabled = true;
      return;
    }

    ui.discardStatus.textContent = discardState.status
      || (isProfilePage() ? `${visibleCount} adet At butonu bulundu.` : "Manuel kontrolde profil sayfasi acilir.");
    ui.discardBtn.textContent = "At itemlerini simdi temizle";
    ui.discardBtn.disabled = false;
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
      .bf-orb-discard {
        display: grid; gap: 6px; padding: 8px 10px; border-radius: 8px;
        background: #1a120c; border: 1px solid #5a3d22; color: #c8b79f;
      }
      .bf-orb-discard-summary { font-size: 11px; }
      .bf-orb-discard-summary strong { color: #ffcf80; float: right; font-variant-numeric: tabular-nums; }
      .bf-orb-discard .bf-orb-recheck:disabled { opacity: .55; cursor: wait; }
      .bf-orb-status-ok { border-color: #2f9e44; color: #8ce99a; }
      .bf-orb-status-warn { border-color: #e8a317; color: #ffd479; }
    `;
    document.head.appendChild(style);
  }

  // Panel'i kur (yalnizca orb sayfalarinda; bekci modunda panel gosterilmez,
  // boylece diger sayfalardaki kat botu paneliyle cakismaz)
  if (true) {
    if (document.body) {
      buildPanel();
    } else {
      window.addEventListener("DOMContentLoaded", buildPanel);
    }
  }
})();


// NOT: Savas motoru @require ile kurulumda gomulur. Motor (battle-core.js) guncellenirse
// bu scriptin surumunu artir ki Tampermonkey @require kopyasini yenilesin.

(function () {
  'use strict';

  const ITEM_DISCARD_STATE_KEY = 'BFItemDiscardStateV1';
  const FIREBASE_API_KEY = 'AIzaSyB6_mwliHgUXjCSidzZIBiQj_8hLkYvZV4';
  const FIRESTORE_ARCHIVE_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/overviewArchives';
  const FIRESTORE_ARCHIVE_HOSTS_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/archiveHosts';
  const FIRESTORE_REMINDERS_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/floorReminders';
  // Kat hatirlatmalari: bu katlar bitince ilgili bant suresi kadar sonra Telegram
  // bildirimi planlanir (timer'i sunucu tutar -> telefon kilitliyken de gelir).
  const REMINDER_ENABLED_KEY = 'btReminderEnabled';
  // Her bant onceki banttan 30 dk daha uzun yenilenme suresine sahip (oyun kurali).
  // 41-50 ve sonrasi bantlar bu oruntunun devami varsayilarak eklendi (kat 101'e kadar).
  const FLOOR_REMINDERS = [
    { floor: 1, bandLabel: '1-10', intervalSec: 60 * 60 },     // 1 saat
    { floor: 11, bandLabel: '11-20', intervalSec: 90 * 60 },   // 1.5 saat
    { floor: 21, bandLabel: '21-30', intervalSec: 120 * 60 },  // 2 saat
    { floor: 31, bandLabel: '31-40', intervalSec: 150 * 60 },  // 2.5 saat
    { floor: 41, bandLabel: '41-50', intervalSec: 180 * 60 },  // 3 saat
    { floor: 51, bandLabel: '51-60', intervalSec: 210 * 60 },  // 3.5 saat
    { floor: 61, bandLabel: '61-70', intervalSec: 240 * 60 },  // 4 saat
    { floor: 71, bandLabel: '71-80', intervalSec: 270 * 60 },  // 4.5 saat
    { floor: 81, bandLabel: '81-90', intervalSec: 300 * 60 },  // 5 saat
    { floor: 91, bandLabel: '91-100', intervalSec: 330 * 60 }, // 5.5 saat
    { floor: 101, bandLabel: '101', intervalSec: 360 * 60 }    // 6 saat
  ];
  const LAST_ARCHIVE_ID_KEY = 'btLastArchiveId';
  const REGISTERED_HOST_KEY = 'btArchiveRegisteredHost';
  const LAST_ARCHIVE_PAYLOAD_KEY = 'btLastArchivePayload';
  const LAST_LOOT_SYNC_KEY = 'btLastLootSyncSignature';
  // Bu savasta hayata dondurme icin harcanan cehennem tasi sayisi (arsiv sutunu).
  // '' = bilinmiyor (manuel) -> arsiv "-"; '0' = harcanmadi; sayi = harcanan.
  const LAST_REVIVE_STONES_KEY = 'btLastReviveStones';
  const ALLY_TIER_LABELS = {
    'dehset kurdu': 'T1',
    'yikici': 'T2',
    'gece avcisi': 'T3',
    'fantom dehseti': 'T4',
    'kurt saman': 'T5',
    'mezar pencesi': 'T6',
    'kanli ay kahini': 'T7',
    'cehennem ucurumu': 'T8',
    // Oyunda kullanilan guncel birim adlari (battle-core ALLY_UNITS ile ayni).
    'yarasa surusu': 'T1',
    'gulyabani': 'T2',
    'vampir kolu': 'T3',
    'banshee': 'T4',
    'olu cagirici': 'T5',
    'gargoyle': 'T6',
    'kan cadisi': 'T7',
    'curuk girtlak': 'T8'
  };
  const ENEMY_SLOT_LABELS = {
    1: 'R1',
    2: 'R2',
    3: 'R3',
    4: 'R4',
    5: 'R5',
    6: 'R6',
    7: 'R7',
    8: 'R8',
    9: 'R9',
    10: 'R10'
  };

  if (location.hostname === 'bt-analiz.web.app') {
    const observer = new MutationObserver(() => {
      const popup = document.querySelector('#quickResultPopup');
      if (!popup || !popup.classList.contains('is-visible')) return;

      const units = {};
      popup.querySelectorAll('.quick-popup-unit-item').forEach((item) => {
        const nameEl = item.querySelector('.quick-popup-unit-name');
        const countEl = item.querySelector('.quick-popup-unit-count');
        if (!nameEl || !countEl) return;
        const match = nameEl.textContent.match(/T(\d+)/);
        const count = parseInt(countEl.textContent.split('/')[0].trim(), 10);
        if (match && !Number.isNaN(count) && count > 0) {
          units[match[1]] = count;
        }
      });

      if (Object.keys(units).length === 0) return;

      GM_setValue('btUnits', JSON.stringify(units));

      const btn = document.querySelector('#mobilSaveBtn');
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Bitefight icin kaydedildi!';
        btn.style.background = '#1a6b2a';
        setTimeout(() => {
          btn.textContent = prev;
          btn.style.background = '';
        }, 2500);
      }
    });

    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    return;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeTurkishText(value) {
    return cleanText(value)
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');
  }

  function parseDigits(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    if (!digits) return 0;
    return Number.parseInt(digits, 10) || 0;
  }

  function hasRecordedOutcome(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    if (Number(payload.lootGoldValue || 0) > 0 || Number(payload.expValue || 0) > 0) {
      return true;
    }
    const lootGoldText = cleanText(payload.lootGoldText || '');
    const expText = cleanText(payload.expText || '');
    const fallenUnitsText = cleanText(payload.fallenUnitsText || '');
    return (
      (lootGoldText && lootGoldText !== '-') ||
      (expText && expText !== '-') ||
      (fallenUnitsText && fallenUnitsText !== '-' && fallenUnitsText !== 'Olenler : 0')
    );
  }

  function clearPendingArchiveSync() {
    GM_setValue(LAST_ARCHIVE_ID_KEY, '');
    GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, '');
    GM_setValue(LAST_LOOT_SYNC_KEY, '');
    GM_setValue(LAST_REVIVE_STONES_KEY, '');
  }

  function getReviveStoneCostFromElement(root) {
    if (!root) {
      return 0;
    }
    const value = Math.abs(parseQtyValue(root.querySelector('span')?.textContent) || 0);
    return value > 0 ? value : 0;
  }

  function getReviveStoneCostFromDom() {
    return getReviveStoneCostFromElement(document.querySelector('#showReviveBtn'))
      || getReviveStoneCostFromElement(document.querySelector('#reviveBtn'));
  }

  function hasReviveSuccessMessage() {
    return !!document.querySelector('#revivedResult .success-message, #revivedResult .revived-banner');
  }

  function readReviveStoneText() {
    const raw = GM_getValue(LAST_REVIVE_STONES_KEY, '');
    const domCost = getReviveStoneCostFromDom();
    if ((raw === '' || raw === null || raw === undefined) && hasReviveSuccessMessage() && domCost > 0) {
      GM_setValue(LAST_REVIVE_STONES_KEY, String(domCost));
      return String(domCost);
    }
    if (String(raw) === '0' && hasReviveSuccessMessage() && domCost > 0) {
      GM_setValue(LAST_REVIVE_STONES_KEY, String(domCost));
      return String(domCost);
    }
    return raw === '' || raw === null || raw === undefined ? '-' : String(raw);
  }

  function savePendingArchivePayload(payload) {
    GM_setValue(LAST_ARCHIVE_ID_KEY, '');
    GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, JSON.stringify(payload));
    GM_setValue(LAST_LOOT_SYNC_KEY, '');
  }

  function getArmyPowerText() {
    const el = document.querySelector('h2.armyPower');
    if (!el) return '';
    const text = cleanText(el.textContent);
    const match = text.match(/(\d+\s*\/\s*\d+)/);
    return match ? match[1].replace(/\s+/g, '') : '';
  }

  function getLevelText() {
    const goldEl = document.querySelector('div.gold');
    if (!goldEl) return '';
    const levelIcon = goldEl.querySelector('img[alt="Seviye"]');
    if (!levelIcon) return '';
    let node = levelIcon.nextSibling;
    while (node) {
      const text = cleanText(node.textContent);
      const match = text.match(/\d+/);
      if (match) {
        return match[0];
      }
      node = node.nextSibling;
    }
    return '';
  }

  function getLootGoldText() {
    const el = document.querySelector('.lootItems.lootGold p');
    return el ? cleanText(el.textContent) : '';
  }

  function getLootExpText() {
    const el = document.querySelector('.lootItems.lootEXP p');
    return el ? cleanText(el.textContent) : '';
  }

  function collapseRepeatedEntries(items) {
    if (!Array.isArray(items) || items.length < 2) {
      return items;
    }
    for (let chunkSize = 1; chunkSize <= Math.floor(items.length / 2); chunkSize += 1) {
      if (items.length % chunkSize !== 0) {
        continue;
      }
      const firstChunk = items.slice(0, chunkSize);
      let repeated = true;
      for (let index = chunkSize; index < items.length; index += chunkSize) {
        const chunk = items.slice(index, index + chunkSize);
        if (chunk.length !== firstChunk.length || chunk.some((entry, entryIndex) => entry !== firstChunk[entryIndex])) {
          repeated = false;
          break;
        }
      }
      if (repeated) {
        return firstChunk;
      }
    }
    return items;
  }

  function getFallenUnitsText() {
    // Sonuc sayfasinda olen birimler iki yerde listelenir: ana "Olen birimler"
    // bolumu ve hayata dondurme popup'i (.revivePopUp). Popup'taki adetler
    // farkli olabildiginden (or. diriltilebilir sayi) yalnizca ana liste okunur;
    // aksi halde olenler mukerrer yazilir.
    const items = collapseRepeatedEntries(
      [...document.querySelectorAll('.allFallenUnits .fallenUnit')]
      .filter((item) => !item.closest('.revivePopUp'))
      .map((item) => {
        const name = cleanText(item.querySelector('.fallenUnitName')?.textContent || '');
        const qty = parseQtyValue(item.querySelector('.fallenUnitQty')?.textContent || '');
        if (!name || qty === null) {
          return null;
        }
        const tier = ALLY_TIER_LABELS[normalizeTurkishText(name)];
        const displayName = tier ? `${name}(${tier})` : name;
        return `${displayName} x${qty}`;
      })
      .filter(Boolean)
    );
    return items.length ? `Olenler : [${items.join(', ')}]` : 'Olenler : 0';
  }

  function parseQtyValue(value) {
    const match = cleanText(value).match(/-?\d+/);
    return match ? Number.parseInt(match[0], 10) : null;
  }

  function buildRosterText(label, counts, formatter) {
    if (!Array.isArray(counts) || !counts.length) {
      return '-';
    }
    const entries = typeof formatter === 'function'
      ? counts.map((count, index) => formatter(count, index)).filter(Boolean)
      : counts.filter((count) => count !== null && count !== undefined).map((count) => String(count));
    return entries.length ? `${label} : [${entries.join('-')}]` : '-';
  }

  function getEnemyRosterText() {
    const entries = [...document.querySelectorAll('.enemySlot')]
      .map((slot, index) => {
        const styleText = slot.getAttribute('style') || '';
        const match = styleText.match(/enemyUnit_(\d+)\.jpg/i);
        const qtyEl = slot.querySelector('.qtyValue');
        const qty = parseQtyValue(qtyEl ? qtyEl.textContent : '');
        if (!match || qty === null) {
          return null;
        }
        return {
          order: Number.parseInt(match[1], 10),
          qty,
          index
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.order === right.order) {
          return left.index - right.index;
        }
        return left.order - right.order;
      });

    return buildRosterText('Rakip', entries, (entry) => {
      const tier = ENEMY_SLOT_LABELS[entry.order] || `R${entry.order}`;
      return `${tier}:${entry.qty}`;
    });
  }

  function getOpenAllyTiers() {
    return [...new Set(
      [...document.querySelectorAll('.stepBtn[data-id]')]
        .map((button) => Number.parseInt(button.getAttribute('data-id') || '', 10))
        .filter((tier) => Number.isInteger(tier) && tier > 0)
    )].sort((left, right) => left - right);
  }

  function findAllyCardRoot(tier) {
    const button = document.querySelector(`.stepBtn[data-id="${tier}"]`);
    let node = button;
    for (let depth = 0; node && depth < 8; depth += 1) {
      if (node.querySelector('.qtyValue')) {
        return node;
      }
      node = node.parentElement;
    }
    return button ? button.parentElement : null;
  }

  function getAllyRosterText(targets, preferTargets) {
    const tiers = getOpenAllyTiers();
    if (!tiers.length) {
      return '-';
    }

    const counts = tiers.map((tier) => {
      const explicitCount = targets && Object.prototype.hasOwnProperty.call(targets, tier)
        ? Number.parseInt(targets[tier], 10)
        : null;
      if (preferTargets && Number.isInteger(explicitCount)) {
        return explicitCount;
      }

      const root = findAllyCardRoot(tier);
      const qtyEl = root ? root.querySelector('.qtyValue') : null;
      const qty = parseQtyValue(qtyEl ? qtyEl.textContent : '');
      if (qty !== null) {
        return qty;
      }
      return Number.isInteger(explicitCount) ? explicitCount : 0;
    });

    return buildRosterText('Biz', counts, (count, index) => `T${index + 1}:${count}`);
  }

  function getOverviewPayload(sourceType, options = {}) {
    const nowIso = new Date().toISOString();
    const enemyRosterText = getEnemyRosterText();
    const allyRosterText = getAllyRosterText(options.targets, Boolean(options.preferTargets));
    return {
      savedAt: nowIso,
      updatedAt: nowIso,
      lootGoldText: '-',
      lootGoldValue: 0,
      expText: '-',
      expValue: 0,
      armyPowerText: getArmyPowerText() || '-',
      levelText: getLevelText() || '-',
      enemyRosterText,
      allyRosterText,
      fallenUnitsText: 'Olenler : 0',
      reviveStoneText: '-',
      sourceType: sourceType === 'fill' ? 'fill' : 'manual',
      host: location.host,
      pageUrl: location.href,
      pageTitle: document.title || ''
    };
  }

  function toFirestoreFieldMap(payload) {
    return {
      savedAt: { stringValue: payload.savedAt },
      updatedAt: { stringValue: payload.updatedAt },
      lootGoldText: { stringValue: payload.lootGoldText },
      lootGoldValue: { integerValue: String(payload.lootGoldValue) },
      expText: { stringValue: payload.expText },
      expValue: { integerValue: String(payload.expValue) },
      armyPowerText: { stringValue: payload.armyPowerText },
      levelText: { stringValue: payload.levelText },
      enemyRosterText: { stringValue: payload.enemyRosterText || '-' },
      allyRosterText: { stringValue: payload.allyRosterText || '-' },
      fallenUnitsText: { stringValue: payload.fallenUnitsText || 'Olenler : 0' },
      reviveStoneText: { stringValue: payload.reviveStoneText || '-' },
      sourceType: { stringValue: payload.sourceType },
      host: { stringValue: payload.host },
      pageUrl: { stringValue: payload.pageUrl },
      pageTitle: { stringValue: payload.pageTitle }
    };
  }

  // Host'u archiveHosts meta koleksiyonuna upsert eder; arsiv sayfasindaki sunucu
  // dropdown'u bu listeden beslenir. Ayni host icin tekrar yazmamak adina GM'de tutulur.
  async function registerArchiveHost(host) {
    const normalized = String(host || '').trim();
    if (!normalized || GM_getValue(REGISTERED_HOST_KEY, '') === normalized) {
      return;
    }
    try {
      const response = await fetch(`${FIRESTORE_ARCHIVE_HOSTS_URL}/${encodeURIComponent(normalized)}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            host: { stringValue: normalized },
            updatedAt: { stringValue: new Date().toISOString() }
          }
        })
      });
      if (response.ok) {
        GM_setValue(REGISTERED_HOST_KEY, normalized);
      }
    } catch {
      // best-effort; arsiv kaydini engellemesin
    }
  }

  async function postArchiveRecord(payload, docId = '') {
    const finalDocId = docId || `overview_${Date.now()}_${Math.random().toString(36).slice(2, 9) || '0'}`;
    const response = await fetch(`${FIRESTORE_ARCHIVE_URL}?documentId=${encodeURIComponent(finalDocId)}&key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: toFirestoreFieldMap(payload)
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Kayit basarisiz: ${response.status} ${response.statusText} ${message}`);
    }

    void registerArchiveHost(payload.host);
    return finalDocId;
  }

  async function createArchiveRecord(sourceType, options = {}) {
    const payload = getOverviewPayload(sourceType, options);
    if (sourceType === 'fill' && !hasRecordedOutcome(payload)) {
      savePendingArchivePayload(payload);
      return { docId: '', payload, queued: true };
    }

    const docId = await postArchiveRecord(payload);

    if (hasRecordedOutcome(payload)) {
      clearPendingArchiveSync();
    } else {
      GM_setValue(LAST_ARCHIVE_ID_KEY, docId);
      GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, JSON.stringify(payload));
      GM_setValue(LAST_LOOT_SYNC_KEY, '');
    }
    return { docId, payload };
  }

  function syncPendingArchiveRosterBeforeFight() {
    const rawPayload = GM_getValue(LAST_ARCHIVE_PAYLOAD_KEY, '');
    let payload = null;
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = null;
      }
    }

    if (!payload || hasRecordedOutcome(payload)) {
      GM_setValue(LAST_REVIVE_STONES_KEY, '');
      savePendingArchivePayload(getOverviewPayload('manual'));
      return;
    }

    GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, JSON.stringify({
      ...payload,
      updatedAt: new Date().toISOString(),
      allyRosterText: getAllyRosterText(null, false),
      armyPowerText: getArmyPowerText() || payload.armyPowerText || '-'
    }));
  }

  function watchFightSubmission() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('#fightBtn')) {
        syncPendingArchiveRosterBeforeFight();
      }
    }, true);
  }

  // Sonuc sayfasinda hem watchLootPage gozlemcisi hem de runBotTick (handleResultPage/
  // handleAutoResultPage) bu fonksiyonu cagirir ve sayfa kademeli yuklendiginden ayni
  // anda birden cok kez tetiklenebilir. Mukerrer kaydi onleyen imza ancak POST bittikten
  // sonra yazildigi icin, kilit olmadan es zamanli cagrilarin hepsi ayri doküman olusturup
  // arsive ayni saniyeli 2-4 mukerrer kayit dusururdu. Bu kilit es zamanli cagrilari tek
  // calisan isleme baglar; islem bitince imza/temizlik yazildigindan sonraki cagrilar erken cikar.
  let lootSyncInFlight = null;

  // force=true: diriltme beklemesini atlar. Bot sonuc sayfasindan ayrilmadan
  // hemen once kullanilir; aksi halde ertelenen kayit sonraki savasin payload'i
  // tarafindan ezilip tamamen kaybolur.
  function syncLootResultToLastArchive(options = {}) {
    const force = options.force === true;
    if (lootSyncInFlight && !force) {
      return lootSyncInFlight;
    }
    const previous = lootSyncInFlight;
    const run = (async () => {
      if (previous) {
        // Devam eden (ertelenmis) cagri bitsin ki ayni kayit iki kez yazilmasin.
        try { await previous; } catch { /* onceki deneme hatasi bunu engellemesin */ }
      }
      try {
        return await runLootResultSync(options);
      } finally {
        if (lootSyncInFlight === run) {
          lootSyncInFlight = null;
        }
      }
    })();
    lootSyncInFlight = run;
    return run;
  }

  async function runLootResultSync(options = {}) {
    const force = options.force === true;
    const lootGoldText = getLootGoldText();
    const expText = getLootExpText();
    const fallenUnitsText = getFallenUnitsText();
    if (!lootGoldText && !expText && fallenUnitsText === 'Olenler : 0') {
      return false;
    }

    const rawPayload = GM_getValue(LAST_ARCHIVE_PAYLOAD_KEY, '');
    if (!rawPayload) {
      return false;
    }

    let payload;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return false;
    }
    if (hasRecordedOutcome(payload)) {
      clearPendingArchiveSync();
      return false;
    }

    // Bot aktifken, diriltme acikken ve henuz diriltilmemis olen birim varsa,
    // harcanan cehennem tasi sayisi netlesene kadar (diriltme butonu kaybolana
    // kadar) kaydi beklet. Diriltme kapaliyken buton kalici oldugundan beklenmez.
    //
    // Kat numarasi sonuc sayfasindan okunamaz (URL'de layerId, DOM'da kat karti
    // yok) -> detectSelectedStage() null doner ve isReviveBandEnabled null'i
    // "acik" sayar. Bu yuzden diriltmenin KAPALI oldugu bantlarda buton hic
    // kaybolmadigindan kayit sonsuza dek ertelenip sonraki savasta kayboluyordu.
    // Gate, diriltmenin kullandigi kayitli kat ile ayni kaynagi kullanir.
    const resultStage = Number(GM_getValue(BOT_NEXT_STAGE_KEY, 0)) || detectSelectedStage();
    if (!force && isBotEnabled() && isReviveEnabledForFloor(resultStage) && document.querySelector('#showReviveBtn')) {
      return false;
    }

    const reviveStoneText = readReviveStoneText();
    const pendingDocId = GM_getValue(LAST_ARCHIVE_ID_KEY, '');
    const syncSignature = `${pendingDocId || 'queued'}|${location.pathname}|${lootGoldText}|${expText}|${fallenUnitsText}|${reviveStoneText}`;
    if (GM_getValue(LAST_LOOT_SYNC_KEY, '') === syncSignature) {
      return true;
    }

    const nextPayload = {
      ...payload,
      updatedAt: new Date().toISOString(),
      lootGoldText: lootGoldText || payload.lootGoldText || '-',
      lootGoldValue: lootGoldText ? parseDigits(lootGoldText) : (payload.lootGoldValue || 0),
      expText: expText || payload.expText || '-',
      expValue: expText ? parseDigits(expText) : (payload.expValue || 0),
      fallenUnitsText,
      reviveStoneText,
      host: location.host,
      pageUrl: location.href,
      pageTitle: document.title || payload.pageTitle || ''
    };

    if (pendingDocId) {
      const response = await fetch(`${FIRESTORE_ARCHIVE_URL}/${encodeURIComponent(pendingDocId)}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: toFirestoreFieldMap(nextPayload)
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Ganimet kaydi guncellenemedi: ${response.status} ${response.statusText} ${message}`);
      }
    } else {
      await postArchiveRecord(nextPayload);
    }

    GM_setValue(LAST_LOOT_SYNC_KEY, syncSignature);
    clearPendingArchiveSync();
    return true;
  }

  async function fillUnits(targets) {
    for (const tier in targets) {
      const count = targets[tier];
      const plus10 = document.querySelector(`.stepBtn.btnPlus10[data-id="${tier}"]`);
      const plus1 = document.querySelector(`.stepBtn.btnPlus1[data-id="${tier}"]`);
      if (!plus10 || !plus1) continue;

      const plus10Clicks = Math.floor(count / 10);
      const plus1Clicks = count % 10;

      for (let i = 0; i < plus10Clicks; i += 1) {
        plus10.click();
        await timedSleep('fill');
      }

      for (let j = 0; j < plus1Clicks; j += 1) {
        plus1.click();
        await timedSleep('fill');
      }

      await timedSleep('fill');
    }
  }

  // ====================== KAT BOTU ======================
  // Akis: kat sayfasinda GIR -> savas sayfasinda rakibi oku, BattleCore ile lokalde
  // quick.html varsayilanlariyla cozum ara, doldur, BASLA -> sonuc sayfasinda hayata
  // dondur + ILERI -> kat sayfasinda bir sonraki kati sec -> tekrar GIR.
  // Hesap tamamen bu sekmede yapilir; quick.html sekmesine gerek yoktur.

  const BOT_ENABLED_KEY = 'btBotEnabled';
  const BOT_NEXT_STAGE_KEY = 'btBotNextStage';
  const BOT_STOP_STAGE_KEY = 'btBotStopStage';
  const BOT_DONE_KEY = 'btBotDone';
  // Girise kapali (bekleme suresi olan) katlari atlarken art arda kac kat atlandigini
  // tutar; sonsuz atlamayi onlemek icin kullanilir. Basarili giris/zaferde sifirlanir.
  const BOT_SKIP_COUNT_KEY = 'btBotSkipCount';
  // Sayfa taninmayinca (yarim yuklenmis sayfa, gecici hata) yapilan toparlanma denemesi
  // sayacini ve zaman damgasini tutar; surekli basarisiz toparlanmada bot durur.
  const BOT_RECOVER_KEY = 'btBotRecoverState';
  // Onerilen cozumun kazanma orani bunun altindaysa bot durur (quick popup %100 esdegeri).
  // Panelden secilebilir; GM'de saklanir. Varsayilan: %99.5.
  const BOT_MIN_WIN_RATE_DEFAULT = 0.995;
  const BOT_MIN_WIN_RATE_KEY = 'btBotMinWinRate';
  const BOT_ROUNDING_MODE_KEY = 'btBotRoundingMode';
  // Tekil v2 (kayip deseni onceligi): varsayilan acik, panelden kapatilabilir.
  const BOT_TEKIL_V2_KEY = 'btBotTekilV2Mode';
  const BOT_UNIT_LIMITS_KEY = 'btBotUnitLimits';
  const BOT_UNIT_LIMIT_DEFAULTS = [99, 99, 99, 99, 99, 99, 99, 1];
  const BOT_ROUNDING_MODES = {
    legacy: 'Degismemis',
    exact: 'OG Mod',
    safe: 'Guvenli',
    extround: 'Extround',
    simulat: 'Simulator'
  };
  // Panel simge durumuna kucululdu mu (kullanici tercihi, GM'de saklanir).
  const BOT_PANEL_MINIMIZED_KEY = 'btBotPanelMinimized';
  // Kenardan tutup boyutlandirilan panelin son genisligi/yuksekligi (px).
  const BOT_PANEL_WIDTH_KEY = 'btBotPanelWidth';
  const BOT_PANEL_HEIGHT_KEY = 'btBotPanelHeight';
  const BOT_PANEL_MAX_DESKTOP_WIDTH = 860;
  // Genislik bu degere kadar (varsayilan ~760px'in %80 kadarini) kisilabilir.
  const BOT_PANEL_MIN_WIDTH = 170;
  const BOT_PANEL_MIN_HEIGHT = 140;
  const BOT_PANEL_TOUCH_MIN_WIDTH = 240;
  // Panel kendi genisligi bu esigin altina inince tek sutuna gecer (kompakt mod).
  const BOT_PANEL_NARROW_WIDTH = 380;
  // Panele konacak kazanma orani secenekleri (yuzde). 'custom' -> elle giris.
  const BOT_WIN_RATE_PRESETS = [90, 95, 99.5, 100];
  // Dengeli cozumun beklenen kan kaybi bu esigi asarsa hizli ve derin modlar da
  // taranir; en dusuk kayipli guvenli cozum hangi moddaysa onunla savasilir.
  const BOT_LOSS_ESCALATION_THRESHOLD = 90;
  const BOT_MODE_LABELS = { fast: 'hizli', balanced: 'dengeli', deep: 'derin' };
  // Sonuc sayfasinda olen birimleri hayata dondurme tercihi (varsayilan: acik).
  const BOT_REVIVE_KEY = 'btBotReviveEnabled';
  // Diriltmenin hangi 10'luk kat bantlarinda aktif oldugu (varsayilan: hepsi acik).
  const BOT_REVIVE_BANDS_KEY = 'btBotReviveBands';
  const BATTLE_CORE_URL = 'https://bt-analiz.web.app/battle-core.js';

  // ====================== OTO KAT MODU ======================
  // Manuel kat botunun ustune oturan otomatik zamanlayici. Secilen kat araligini
  // sirayla kontrol eder, girilebilen katlari tamamlar. Son kat kontrol edilince
  // ayarlanan sure kadar bekleyip secilen ilk kattan yeniden baslar.
  const AUTO_ENABLED_KEY = 'btAutoEnabled';
  const AUTO_WAIT_UNTIL_KEY = 'btAutoWaitUntil';
  const AUTO_INTERVAL_KEY = 'btAutoIntervalSec';
  const AUTO_INTERVAL_MIN_KEY = 'btAutoIntervalMinSec';
  const AUTO_INTERVAL_MAX_KEY = 'btAutoIntervalMaxSec';
  const AUTO_START_FLOOR_KEY = 'btAutoStartFloor';
  const AUTO_END_FLOOR_KEY = 'btAutoEndFloor';
  const AUTO_ACTIVE_START_KEY = 'btAutoActiveStart';
  const AUTO_ACTIVE_END_KEY = 'btAutoActiveEnd';
  // Baslama/bitis saatine eklenecek rastgele surenin ust siniri (dk). 0 = kapali.
  const AUTO_ACTIVE_EXTRA_KEY = 'btAutoActiveExtraMin';
  // Gunun rastgele kaymasi ({date, extra, start, end}); gun boyunca sabit kalir.
  const AUTO_ACTIVE_OFFSETS_KEY = 'btAutoActiveOffsetsV1';
  const AUTO_BAND_RANGES_KEY = 'btAutoBandExtraRangesV2';
  const AUTO_BAND_DUE_KEY = 'btAutoBandDueV2';
  // Oto ayarlar tek kayit halinde de tutulur. Boylece panel yeniden cizilirken
  // ayarlarin bir kismi eski anahtarlardan/varsayilanlardan okunup ezilmez.
  const AUTO_SETTINGS_KEY = 'btAutoSettingsV1';
  const ORB_COORDINATION_KEY = 'BFOrbFloorCoordinator';
  const AUTO_DEFAULT_INTERVAL_SEC = 180;
  const AUTO_MIN_INTERVAL_SEC = 10;
  const AUTO_MIN_FLOOR = 1;
  const AUTO_MAX_FLOOR = 101;
  const AUTO_DEFAULT_ACTIVE_START = '07:02';
  const AUTO_DEFAULT_ACTIVE_END = '23:44';
  // Bant basina "yenilenme sonrasi" rastgele ek bekleme (dk) varsayilanlari. Index = bant
  // no (0 = kat 1-10, 1 = kat 11-20, ...). 41-50 ve sonrasi icin ozel bir varsayilan
  // belirtilmedigi surece son bilinen bant (31-40) ile ayni varsayilan kullanilir;
  // panelden kat basina ayrica ayarlanabilir.
  const AUTO_DEFAULT_BAND_RANGES = [
    { min: 2, max: 5 },
    { min: 2, max: 6 },
    { min: 2, max: 7 },
    { min: 2, max: 7 },
    { min: 2, max: 7 },
    { min: 5, max: 15 },
    { min: 5, max: 15 },
    { min: 5, max: 15 },
    { min: 5, max: 15 },
    { min: 5, max: 15 },
    { min: 5, max: 15 }
  ];

  function isAutoEnabled() {
    return GM_getValue(AUTO_ENABLED_KEY, false) === true;
  }

  // Kilit kalp atisi: bot aktifken busy kilidinin updatedAt'ini tazele. Orb botu
  // 10 dk tazelenmeyen kilidi bayat sayip yok sayar; boylece sekme coker/kapanirsa
  // orb sonsuza dek "kat botu calisiyor" diye beklemez.
  window.setInterval(() => {
    try {
      if (GM_getValue(AUTO_ENABLED_KEY, false) !== true && GM_getValue(BOT_ENABLED_KEY, false) !== true) return;
      const coordinator = JSON.parse(localStorage.getItem(ORB_COORDINATION_KEY) || '{}');
      if (coordinator.busy !== true) return;
      coordinator.updatedAt = Date.now();
      localStorage.setItem(ORB_COORDINATION_KEY, JSON.stringify(coordinator));
    } catch { /* localStorage kapaliysa eski bagimsiz davranis surer */ }
  }, 60 * 1000);

  function setOrbFloorBusy(busy, resumeAt = 0, orbPriority = false, floorUrl = '') {
    try {
      localStorage.setItem(ORB_COORDINATION_KEY, JSON.stringify({
        busy: Boolean(busy),
        resumeAt: Number(resumeAt) || 0,
        orbPriority: Boolean(orbPriority),
        floorUrl: String(floorUrl || ''),
        updatedAt: Date.now()
      }));
    } catch {
      // localStorage kapaliysa botlar eski bagimsiz davranislarini surdurur.
    }
  }

  function orbHasPriority() {
    try {
      return JSON.parse(localStorage.getItem(ORB_COORDINATION_KEY) || '{}').orbPriority === true;
    } catch {
      return false;
    }
  }

  function isOrbHuntEnabled() {
    try {
      return JSON.parse(localStorage.getItem('BFOrbSettings') || '{}').running === true;
    } catch {
      return false;
    }
  }

  // Ana kontrol panelinden secilen oncelik sirasi (varsayilan: orb > birlik > magara).
  const MASTER_CONTROL_KEY = 'BFMasterControlV1';
  const MASTER_DEFAULT_PRIORITY = ['orb', 'birlik', 'magara'];

  function masterPriorityOrder() {
    try {
      const list = JSON.parse(localStorage.getItem(MASTER_CONTROL_KEY) || '{}').priority;
      return Array.isArray(list) && list.length === 3 ? list : MASTER_DEFAULT_PRIORITY;
    } catch {
      return MASTER_DEFAULT_PRIORITY;
    }
  }

  // Orb, kat botundan once mi? Once ise kat botu 10'luk sinirlarda sirayi orb'a
  // devreder (eski davranis). Degilse kat botu turunu bolmez; orb, kat botu
  // bekleme penceresine girince (setOrbFloorBusy(false, ...)) calisir.
  function orbOutranksFloorBot() {
    const order = masterPriorityOrder();
    const orbIndex = order.indexOf('orb');
    const botIndex = order.indexOf('birlik');
    if (orbIndex < 0 || botIndex < 0) return true;
    return orbIndex < botIndex;
  }

  function orbCollectionIsDue() {
    try {
      if (!orbOutranksFloorBot()) return false;
      const orb = JSON.parse(localStorage.getItem('BFOrbSettings') || '{}');
      if (orb.running !== true) return false;
      const collectAt = Number(orb.orbCollectAt || 0);
      return collectAt <= 0 || collectAt <= Date.now();
    } catch {
      return false;
    }
  }

  function startOrbPriorityTurn(floor) {
    const target = Number(floor) || autoFloorRange().start;
    GM_setValue(BOT_NEXT_STAGE_KEY, target);
    setOrbFloorBusy(false, 0, true, buildFloorUrl(target));
    setBotStatus(`Orb oncelikli: Kat ${target} baslamadan once orb turu tamamlanacak`);
    location.assign(robberyIndexUrl());
  }

  function robberyIndexUrl() {
    return `${location.origin}/robbery/index`;
  }

  function autoIntervalRange() {
    const snapshot = autoSettingsSnapshot();
    const legacy = Number(GM_getValue(AUTO_INTERVAL_KEY, AUTO_DEFAULT_INTERVAL_SEC));
    const fallback = Number.isFinite(legacy) && legacy >= AUTO_MIN_INTERVAL_SEC
      ? Math.round(legacy)
      : AUTO_DEFAULT_INTERVAL_SEC;
    const savedMin = Number(snapshot.intervalMin ?? GM_getValue(AUTO_INTERVAL_MIN_KEY, fallback));
    const savedMax = Number(snapshot.intervalMax ?? GM_getValue(AUTO_INTERVAL_MAX_KEY, fallback));
    const min = Number.isFinite(savedMin) && savedMin >= AUTO_MIN_INTERVAL_SEC
      ? Math.round(savedMin)
      : fallback;
    const max = Number.isFinite(savedMax) && savedMax >= min ? Math.round(savedMax) : min;
    return { min, max };
  }

  function randomAutoIntervalSeconds() {
    const { min, max } = autoIntervalRange();
    return Math.round(min + Math.random() * (max - min));
  }

  function parseStoredJson(key, fallback) {
    try {
      const parsed = JSON.parse(GM_getValue(key, ''));
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function autoSettingsSnapshot() {
    const gmSettings = parseStoredJson(AUTO_SETTINGS_KEY, {});
    let localSettings = {};
    try {
      localSettings = JSON.parse(localStorage.getItem(AUTO_SETTINGS_KEY) || '{}') || {};
    } catch (_) { /* localStorage kullanilamiyorsa GM kaydi yeterlidir */ }
    return Number(localSettings.savedAt || 0) > Number(gmSettings.savedAt || 0)
      ? localSettings
      : gmSettings;
  }

  function saveAutoSettingsSnapshot(settings) {
    const snapshot = { ...settings, savedAt: Date.now() };
    GM_setValue(AUTO_SETTINGS_KEY, JSON.stringify(snapshot));
    try {
      localStorage.setItem(AUTO_SETTINGS_KEY, JSON.stringify(snapshot));
    } catch (_) { /* localStorage kullanilamiyorsa GM kaydi yeterlidir */ }
    return snapshot;
  }

  function autoActiveHours() {
    const snapshot = autoSettingsSnapshot();
    const valid = (value, fallback) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : fallback;
    return {
      start: valid(snapshot.activeStart ?? GM_getValue(AUTO_ACTIVE_START_KEY, AUTO_DEFAULT_ACTIVE_START), AUTO_DEFAULT_ACTIVE_START),
      end: valid(snapshot.activeEnd ?? GM_getValue(AUTO_ACTIVE_END_KEY, AUTO_DEFAULT_ACTIVE_END), AUTO_DEFAULT_ACTIVE_END)
    };
  }

  function istanbulMinuteOfDay(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Number(values.hour) * 60 + Number(values.minute);
  }

  function timeTextToMinutes(value) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  function autoActiveExtraMinutes() {
    const snapshot = autoSettingsSnapshot();
    const value = Number(snapshot.activeExtra ?? GM_getValue(AUTO_ACTIVE_EXTRA_KEY, 0));
    return Number.isFinite(value) && value > 0 ? Math.min(180, Math.round(value)) : 0;
  }

  function istanbulDateText(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
  }

  // Gunluk rastgele kayma: baslama ve bitis saatine ayri ayri 0..extra dk eklenir.
  // Kayma gun icinde sabit kalsin diye tarihiyle birlikte GM'de saklanir; her
  // kontrolde yeni rastgele deger uretilse pencere sinirinda gel-git yasanirdi.
  // Gun degisince veya +dk ayari degisince yeni kayma cekilir.
  function autoActiveOffsets(now = new Date()) {
    const extra = autoActiveExtraMinutes();
    if (extra <= 0) return { start: 0, end: 0 };
    const today = istanbulDateText(now);
    const saved = parseStoredJson(AUTO_ACTIVE_OFFSETS_KEY, {});
    if (saved.date === today && saved.extra === extra
      && Number.isInteger(saved.start) && saved.start >= 0 && saved.start <= extra
      && Number.isInteger(saved.end) && saved.end >= 0 && saved.end <= extra) {
      return { start: saved.start, end: saved.end };
    }
    const offsets = {
      date: today,
      extra,
      start: Math.floor(Math.random() * (extra + 1)),
      end: Math.floor(Math.random() * (extra + 1))
    };
    GM_setValue(AUTO_ACTIVE_OFFSETS_KEY, JSON.stringify(offsets));
    return { start: offsets.start, end: offsets.end };
  }

  function minutesToTimeText(totalMinutes) {
    const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
  }

  // Gunun rastgele kaymasi eklenmis fiili baslama/bitis saatleri (durum mesaji icin).
  function effectiveActiveHoursText(now = new Date()) {
    const { start, end } = autoActiveHours();
    const offsets = autoActiveOffsets(now);
    return {
      start: minutesToTimeText(timeTextToMinutes(start) + offsets.start),
      end: minutesToTimeText(timeTextToMinutes(end) + offsets.end)
    };
  }

  function isInsideAutoActiveHours(now = new Date()) {
    const { start, end } = autoActiveHours();
    const offsets = autoActiveOffsets(now);
    const current = istanbulMinuteOfDay(now);
    const startMinute = (timeTextToMinutes(start) + offsets.start) % 1440;
    const endMinute = (timeTextToMinutes(end) + offsets.end) % 1440;
    if (startMinute === endMinute) return true;
    return startMinute < endMinute
      ? current >= startMinute && current <= endMinute
      : current >= startMinute || current <= endMinute;
  }

  function autoBandRanges() {
    const snapshot = autoSettingsSnapshot();
    const saved = Array.isArray(snapshot.bandRanges)
      ? snapshot.bandRanges
      : parseStoredJson(AUTO_BAND_RANGES_KEY, AUTO_DEFAULT_BAND_RANGES);
    return AUTO_DEFAULT_BAND_RANGES.map((fallback, index) => {
      const item = Array.isArray(saved) ? saved[index] : null;
      const min = Number.isInteger(item?.min) && item.min >= 1 ? item.min : fallback.min;
      const max = Number.isInteger(item?.max) && item.max >= min ? item.max : Math.max(min, fallback.max);
      return { min, max };
    });
  }

  function totalAutoBands() {
    return Math.ceil(AUTO_MAX_FLOOR / 10);
  }

  function floorBandIndex(floor) {
    const maxBand = totalAutoBands() - 1;
    return Math.min(maxBand, Math.max(0, Math.floor((floor - 1) / 10)));
  }

  // Bir bandin kapsadigi kat araligi (son bant AUTO_MAX_FLOOR'da kirpilir, or. 101-101).
  function bandFloorRange(bandIndex) {
    const start = bandIndex * 10 + 1;
    const end = Math.min(AUTO_MAX_FLOOR, start + 9);
    return { start, end };
  }

  function autoBandDueTimes() {
    const saved = parseStoredJson(AUTO_BAND_DUE_KEY, {});
    return saved && !Array.isArray(saved) ? saved : {};
  }

  function markAutoBandCompleted(floor) {
    const band = floorBandIndex(floor);
    const ranges = autoBandRanges();
    const range = ranges[band];
    const extraMinutes = Math.round(range.min + Math.random() * (range.max - range.min));
    const renewalSeconds = FLOOR_REMINDERS[band]?.intervalSec || 0;
    const due = autoBandDueTimes();
    due[band] = Date.now() + renewalSeconds * 1000 + extraMinutes * 60 * 1000;
    GM_setValue(AUTO_BAND_DUE_KEY, JSON.stringify(due));
    return extraMinutes;
  }

  function scheduleBandFromRemaining(floor, remainingSeconds) {
    const band = floorBandIndex(floor);
    const range = autoBandRanges()[band];
    const extraMinutes = Math.round(range.min + Math.random() * (range.max - range.min));
    const due = autoBandDueTimes();
    due[band] = Date.now() + Math.max(0, remainingSeconds) * 1000 + extraMinutes * 60 * 1000;
    GM_setValue(AUTO_BAND_DUE_KEY, JSON.stringify(due));
    return { extraMinutes, dueAt: due[band] };
  }

  function nextDueFloor(fromFloor, endFloor) {
    const due = autoBandDueTimes();
    let floor = fromFloor;
    while (floor <= endFloor) {
      const band = floorBandIndex(floor);
      // Grubun ilk kati gecildiyse ayni turdaki kalan katlari zaman kilidine takma.
      if (floor % 10 !== 1) return floor;
      if (Number(due[band] || 0) <= Date.now()) return floor;
      floor = Math.min(endFloor + 1, (band + 1) * 10 + 1);
    }
    return 0;
  }

  function autoFloorRange() {
    const snapshot = autoSettingsSnapshot();
    const savedStart = Number(snapshot.start ?? GM_getValue(AUTO_START_FLOOR_KEY, AUTO_MIN_FLOOR));
    const savedEnd = Number(snapshot.end ?? GM_getValue(AUTO_END_FLOOR_KEY, AUTO_MAX_FLOOR));
    const start = Math.min(AUTO_MAX_FLOOR, Math.max(AUTO_MIN_FLOOR,
      Number.isInteger(savedStart) ? savedStart : AUTO_MIN_FLOOR));
    const end = Math.min(AUTO_MAX_FLOOR, Math.max(start,
      Number.isInteger(savedEnd) ? savedEnd : AUTO_MAX_FLOOR));
    return { start, end };
  }

  // Bekleme penceresini baslatir ve secilen ilk kata doner; gerceklesecek geri sayim
  // handleAutoFloorPage icinde yapilir.
  function beginAutoWait(waitSeconds) {
    const { start } = autoFloorRange();
    GM_setValue(AUTO_WAIT_UNTIL_KEY, Date.now() + waitSeconds * 1000);
    GM_setValue(BOT_NEXT_STAGE_KEY, start);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    const resumeAt = Date.now() + waitSeconds * 1000;
    setOrbFloorBusy(false, resumeAt, false, buildFloorUrl(start));
    location.assign(isOrbHuntEnabled() ? robberyIndexUrl() : buildFloorUrl(start));
  }

  function startAuto(startFloor, endFloor) {
    GM_setValue(AUTO_START_FLOOR_KEY, startFloor);
    GM_setValue(AUTO_END_FLOOR_KEY, endFloor);
    saveAutoSettingsSnapshot({ ...autoSettingsSnapshot(), start: startFloor, end: endFloor });
    GM_setValue(AUTO_ENABLED_KEY, true);
    GM_setValue(BOT_ENABLED_KEY, true);
    GM_setValue(BOT_NEXT_STAGE_KEY, startFloor);
    GM_setValue(BOT_STOP_STAGE_KEY, 0);
    GM_setValue(BOT_DONE_KEY, 0);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    GM_setValue(BOT_RECOVER_KEY, '');
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    void acquireWakeLock();
    setBotStatus(`Oto kat modu basladi: Kat ${startFloor}-${endFloor} taraniyor`);
    renderBotPanel();
    botTickStarted = false;
    if (orbCollectionIsDue()) {
      startOrbPriorityTurn(startFloor);
      return;
    }
    setOrbFloorBusy(true);
    // Kat sayfasinda degilsek tarama secilen ilk kattan baslasin diye oraya git.
    if (!isFloorPage()) {
      location.assign(buildFloorUrl(startFloor));
      return;
    }
    void runBotTick();
  }

  // Oto kat modunu navigasyon yapmadan acar. Ana kontrol paneli once tum
  // modullerin bayraklarini yazar, sonra sayfayi yeniler (F5); her modul kendi
  // sayfa acilis rutininde kaldigi yerden devam eder.
  function enableAutoWithoutNavigation(startFloor, endFloor) {
    const range = autoFloorRange();
    const start = Number.isInteger(Number(startFloor)) ? Number(startFloor) : range.start;
    const end = Number.isInteger(Number(endFloor)) ? Number(endFloor) : range.end;
    GM_setValue(AUTO_START_FLOOR_KEY, start);
    GM_setValue(AUTO_END_FLOOR_KEY, end);
    saveAutoSettingsSnapshot({ ...autoSettingsSnapshot(), start, end });
    GM_setValue(AUTO_ENABLED_KEY, true);
    GM_setValue(BOT_ENABLED_KEY, true);
    GM_setValue(BOT_NEXT_STAGE_KEY, start);
    GM_setValue(BOT_STOP_STAGE_KEY, 0);
    GM_setValue(BOT_DONE_KEY, 0);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    GM_setValue(BOT_RECOVER_KEY, '');
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    setBotStatus(`Oto kat modu kuyruga alindi: Kat ${start}-${end}`);
    return { start, end };
  }

  // Ana kontrol paneli (Kontrol sekmesi) ve skill modulu bu API'yi kullanir.
  window.BFFloorBot = {
    startAuto: (startFloor, endFloor) => {
      const range = autoFloorRange();
      startAuto(Number(startFloor) || range.start, Number(endFloor) || range.end);
    },
    enableAuto: enableAutoWithoutNavigation,
    startManual: (startStage, stopStage) => startBot(Number(startStage) || 1, Number(stopStage) || 0),
    stop: (reason) => stopBot(reason || 'ana kontrol panelinden durduruldu'),
    isRunning: () => isBotEnabled() === true,
    isAutoRunning: () => isAutoEnabled() === true,
    range: () => autoFloorRange(),
    floorUrl: (stage) => buildFloorUrl(Number(stage) || autoFloorRange().start),
    status: () => String(GM_getValue('btBotStatus', ''))
  };

  // Sonuc sayfasindaki olen birimleri (panelde aciksa) hayata dondurur. Manuel ve
  // oto sonuc isleyicilerinin ortak yardimcisi.
  async function reviveFallenIfNeeded(stage) {
    const reviveOpener = isReviveEnabledForFloor(stage)
      ? (document.querySelector('#showReviveBtn') || await waitForElement('#showReviveBtn', 2500))
      : null;
    if (!reviveOpener) {
      return;
    }
    // Diriltme maliyeti butonda gosterilir (or. "-1"). Senkron yarisini onlemek icin
    // tasi diriltmeden once yaz; bakiye degisirse gercek harcama sonra guncellenir.
    const reviveCost = getReviveStoneCostFromElement(reviveOpener);
    const balanceBefore = parseDigits(document.querySelector('#devil_stone_balance')?.textContent);
    GM_setValue(LAST_REVIVE_STONES_KEY, String(reviveCost));

    setBotStatus(`Kat ${stage}: olen birimler hayata donduruluyor...`);
    await timedSleep('button');
    reviveOpener.click();
    const confirmBtn = await waitForElement('.revivePopUpActivated #reviveBtn', 5000)
      || document.querySelector('#reviveBtn');
    if (confirmBtn) {
      const confirmCost = getReviveStoneCostFromElement(confirmBtn);
      if (confirmCost > 0) {
        GM_setValue(LAST_REVIVE_STONES_KEY, String(confirmCost));
      }
      await timedSleep('button');
      confirmBtn.click();
      await waitForElement('#revivedResult .success-message, #revivedResult .revived-banner', 7000);
      await timedSleep('button');
      const balanceAfter = parseDigits(document.querySelector('#devil_stone_balance')?.textContent);
      const spentByBalance = balanceBefore && balanceAfter ? Math.max(0, balanceBefore - balanceAfter) : 0;
      if (spentByBalance > 0) {
        GM_setValue(LAST_REVIVE_STONES_KEY, String(spentByBalance));
      }
    }
  }

  // Oto mod kat sayfasi: once bekleme penceresi, sonra hedef kati ac/atla/gir.
  async function handleAutoFloorPage() {
    const { start, end } = autoFloorRange();
    if (!isInsideAutoActiveHours()) {
      const effective = effectiveActiveHoursText();
      setBotStatus(`Oto mod saat penceresi disinda. Istanbul ${effective.start}-${effective.end} bekleniyor (bugunun rastgele kaymasi dahil)`);
      await sleep(30000);
      if (isAutoEnabled()) location.reload();
      return;
    }
    const waitUntil = GM_getValue(AUTO_WAIT_UNTIL_KEY, 0);
    if (waitUntil && Date.now() < waitUntil) {
      setOrbFloorBusy(false, waitUntil);
      if (isOrbHuntEnabled()) {
        location.assign(robberyIndexUrl());
        return;
      }
      while (Date.now() < waitUntil) {
        if (!isAutoEnabled()) {
          return;
        }
        const remaining = Math.ceil((waitUntil - Date.now()) / 1000);
        setBotStatus(`Kat ${start}-${end} taramasi tamamlandi. Yeniden deneme: ${remaining} sn`);
        await sleep(1000);
      }
      if (!isAutoEnabled()) {
        return;
      }
      GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
      setOrbFloorBusy(true);
      GM_setValue(BOT_NEXT_STAGE_KEY, start);
      if (!(await ensureOnline('Yeniden deneme'))) {
        return;
      }
      // Guncel girilebilirlik icin secilen ilk kati tazele.
      location.assign(buildFloorUrl(start));
      return;
    }

    const savedTarget = Number(GM_getValue(BOT_NEXT_STAGE_KEY, start));
    const candidate = savedTarget >= start && savedTarget <= end ? savedTarget : start;
    const target = nextDueFloor(candidate, end) || nextDueFloor(start, Math.min(end, candidate - 1));
    if (!target) {
      const dueValues = Object.values(autoBandDueTimes()).map(Number).filter((value) => value > Date.now());
      const waitSeconds = dueValues.length ? Math.max(10, Math.ceil((Math.min(...dueValues) - Date.now()) / 1000)) : randomAutoIntervalSeconds();
      setBotStatus(`Tum kat gruplari beklemede. ${waitSeconds} sn sonra tekrar kontrol edilecek`);
      beginAutoWait(waitSeconds);
      return;
    }
    if (target !== candidate) GM_setValue(BOT_NEXT_STAGE_KEY, target);
    const targetPage = Math.ceil(target / 10);
    // Dogru 10'luk dilimde miyiz? (Kart numaralarina gore.) Degilse o dilime git.
    if (currentFloorPage() !== targetPage) {
      setBotStatus(`Kat ${target} aciliyor...`);
      await timedSleep('button');
      if (!(await ensureOnline(`Kat ${target}`))) {
        return;
      }
      location.assign(buildFloorUrl(target));
      return;
    }

    // Hedef kati aktif et, sonra gercek "Kat N" kartindan girilebilirligini oku.
    await activateFloor(target);
    let entryBtn = floorEntryButton(target);
    let available = !!entryBtn && entryBtn.classList.contains('entryAvailable');
    if (!available) {
      // Yeni temizlenen kat icin durum gec yansiyabilir; kisa bekleyip tekrar dene.
      await sleep(1200);
      await activateFloor(target);
      entryBtn = floorEntryButton(target);
      available = !!entryBtn && entryBtn.classList.contains('entryAvailable');
    }

    if (!available) {
      // Grup basindaki kat kapaliysa oyunun gosterdigi gercek kalan sureyi oku.
      // Grup, sayaç bittikten sonra paneldeki rastgele ek gecikme kadar daha bekler.
      if (target % 10 === 1) {
        const remainingSeconds = floorCooldownSeconds(target);
        if (remainingSeconds != null && remainingSeconds > 0) {
          const scheduled = scheduleBandFromRemaining(target, remainingSeconds);
          const totalMinutes = Math.ceil((remainingSeconds + scheduled.extraMinutes * 60) / 60);
          const nextBandStart = target + 10;
          if (nextBandStart <= end) {
            GM_setValue(BOT_NEXT_STAGE_KEY, nextBandStart);
            setBotStatus(`Kat ${target}: ${Math.ceil(remainingSeconds / 60)} dk kaldi; +${scheduled.extraMinutes} dk gecikme. Kat ${nextBandStart} kontrol ediliyor`);
            location.assign(buildFloorUrl(nextBandStart));
            return;
          }
          setBotStatus(`Kat ${target}: yenilenme + ek gecikme sonrasi yaklasik ${totalMinutes} dk sonra tekrar kontrol edilecek`);
          beginAutoWait(Math.max(10, Math.ceil((scheduled.dueAt - Date.now()) / 1000)));
          return;
        }
      }
      // Hedef kat girise kapali: siradaki kati kontrol et. Secilen son kat da kapaliysa
      // turun tamaminda girilebilen baska kat kalmadigindan beklemeye gir.
      if (target >= end) {
        const waitSeconds = randomAutoIntervalSeconds();
        setBotStatus(`Kat ${target} kapali. ${waitSeconds} sn sonra Kat ${start}'den bastan denenecek`);
        beginAutoWait(waitSeconds);
        return;
      }
      const next = target + 1;
      GM_setValue(BOT_NEXT_STAGE_KEY, next);
      setBotStatus(`Kat ${target} kapali -> Kat ${next} kontrol ediliyor`);
      await timedSleep('button');
      if (!(await ensureOnline(`Kat ${next}`))) {
        return;
      }
      location.assign(buildFloorUrl(next));
      return;
    }

    setBotStatus(`Kat ${target}: giriliyor...`);
    await timedSleep('button');
    if (!(await ensureOnline(`Kat ${target}`))) {
      return;
    }
    await clickFloorEntry(target);
  }

  // Oto mod sonuc sayfasi: olenleri dondur, zaferde bir sonraki kata gec;
  // Secilen son kat bitince beklemeye girilir.
  async function handleAutoResultPage() {
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    const { start, end } = autoFloorRange();
    const victory = !!document.querySelector('h1.combatResultHeader.resultVictory');

    await reviveFallenIfNeeded(stage);
    try {
      // Diriltme denemesi bitti ve bot bu sayfadan ayrilmak uzere. Diriltme
      // butonu hala duruyorsa (bant kapali, diriltme basarisiz, kullanici elle
      // diriltiyor) beklemenin anlami yok: beklenirse kayit sonraki savasin
      // payload'i tarafindan ezilip tamamen kaybolur.
      await syncLootResultToLastArchive({ force: true });
    } catch (error) {
      console.error('Diriltme sonrasi arsiv kaydi guncellenemedi.', error);
    }

    if (!victory) {
      stopBot(`Kat ${stage}: zafer goremedim, sonucu kontrol et`);
      return;
    }

    const done = GM_getValue(BOT_DONE_KEY, 0) + 1;
    GM_setValue(BOT_DONE_KEY, done);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);

    // Bant-basi kat (1/11/21/31) ise bant suresi kadar sonrasi icin Telegram
    // hatirlatmasini planla. (Diger katlar icin kayit yazilmaz.)
    await scheduleFloorReminder(stage);

    // Her grubun ilk kati referanstir. Rastgele sonraki tur zamani kalici olarak saklanir.
    if (stage % 10 === 1) {
      markAutoBandCompleted(stage);
    }

    // Baslamis 10'lu kat serisini asla bolme. Orb ancak 10/20/30/40 sinirinda
    // devralabilir; hem sonraki kat grubu hem orb hazirsa oncelik orbundur.
    if (stage % 10 === 0 && orbCollectionIsDue()) {
      const nextAfterBlock = nextDueFloor(stage + 1, end)
        || nextDueFloor(start, Math.min(end, stage));
      startOrbPriorityTurn(nextAfterBlock || start);
      return;
    }

    if (stage >= end) {
      // Aktif 10'lu grup tamamen bitti. Bu sirada suresi dolan daha onceki bir grup
      // varsa genel beklemeye girmeden ona don; grup ortasinda asla gecis yapilmaz.
      const readyFloor = nextDueFloor(start, end);
      if (readyFloor) {
        GM_setValue(BOT_NEXT_STAGE_KEY, readyFloor);
        setBotStatus(`Kat ${stage} tamam (${done} kat). Hazir bekleyen Kat ${readyFloor}-${Math.min(end, Math.ceil(readyFloor / 10) * 10)} grubuna geciliyor`);
        await timedSleep('button');
        location.assign(buildFloorUrl(readyFloor));
        return;
      }
      const dueValues = Object.values(autoBandDueTimes()).map(Number).filter((value) => value > Date.now());
      const waitSeconds = dueValues.length ? Math.max(10, Math.ceil((Math.min(...dueValues) - Date.now()) / 1000)) : randomAutoIntervalSeconds();
      setBotStatus(`Kat ${stage} tamam (${done} kat). Kat ${start}-${end} taramasi bitti, ${waitSeconds} sn sonra Kat ${start}'den tekrar`);
      beginAutoWait(waitSeconds);
      return;
    }

    const next = nextDueFloor(stage + 1, end) || nextDueFloor(start, Math.min(end, stage));
    if (!next) {
      const dueValues = Object.values(autoBandDueTimes()).map(Number).filter((value) => value > Date.now());
      const waitSeconds = dueValues.length ? Math.max(10, Math.ceil((Math.min(...dueValues) - Date.now()) / 1000)) : randomAutoIntervalSeconds();
      beginAutoWait(waitSeconds);
      return;
    }
    GM_setValue(BOT_NEXT_STAGE_KEY, next);

    // Katlar arasi bekleme: saniyelik geri sayim; Durdur bu sirada da calisir.
    const floorRange = loadBotTiming().floor;
    const waitSeconds = Math.max(0, Math.round(floorRange.min + Math.random() * (floorRange.max - floorRange.min)));
    for (let remaining = waitSeconds; remaining > 0; remaining -= 1) {
      if (!isAutoEnabled()) {
        return;
      }
      setBotStatus(`Kat ${stage} tamam (${done} kat). Kat ${next} icin bekleme: ${remaining} sn`);
      await sleep(1000);
    }
    if (!isAutoEnabled()) {
      return;
    }
    if (!(await ensureOnline(`Kat ${next}`))) {
      return;
    }
    location.assign(buildFloorUrl(next));
  }
  // ====================== /OTO KAT MODU ======================

  // Panelden ayarlanabilen bekleme sureleri (saniye). Her parametre min-max araligi;
  // bot her seferinde bu araliktan rastgele bir sure secer. GM'de saklanir.
  const BOT_TIMING_KEY = 'btBotTimingSettings';
  const BOT_SETTINGS_OPEN_KEY = 'btBotSettingsOpen';
  const BOT_TIMING_FIELDS = [
    { key: 'button', label: 'Buton basma (GIR/BASLA/dondur)', min: 0.7, max: 1.6 },
    { key: 'fill', label: 'Birim doldurma tiklamasi', min: 0.25, max: 0.42 },
    { key: 'floor', label: 'Katlar arasi gecis', min: 5, max: 11 }
  ];
  const BOT_TIMING_DEFAULTS = Object.fromEntries(
    BOT_TIMING_FIELDS.map((field) => [field.key, { min: field.min, max: field.max }])
  );

  // Kabul edilen minimum kazanma orani (kesir). Panelden secilir, GM'de saklanir.
  function getBotMinWinRate() {
    const stored = Number(GM_getValue(BOT_MIN_WIN_RATE_KEY, BOT_MIN_WIN_RATE_DEFAULT));
    if (!Number.isFinite(stored) || stored <= 0 || stored > 1) {
      return BOT_MIN_WIN_RATE_DEFAULT;
    }
    return stored;
  }

  function setBotMinWinRate(rate) {
    const clamped = Math.min(1, Math.max(0.01, Number(rate)));
    GM_setValue(BOT_MIN_WIN_RATE_KEY, Number.isFinite(clamped) ? clamped : BOT_MIN_WIN_RATE_DEFAULT);
  }

  function getBotRoundingMode() {
    const stored = String(GM_getValue(BOT_ROUNDING_MODE_KEY, 'legacy') || 'legacy');
    return Object.prototype.hasOwnProperty.call(BOT_ROUNDING_MODES, stored) ? stored : 'legacy';
  }

  function setBotRoundingMode(mode) {
    const normalized = Object.prototype.hasOwnProperty.call(BOT_ROUNDING_MODES, mode) ? mode : 'legacy';
    GM_setValue(BOT_ROUNDING_MODE_KEY, normalized);
    return normalized;
  }

  function isBotTekilV2Enabled() {
    return GM_getValue(BOT_TEKIL_V2_KEY, true) !== false;
  }

  function setBotTekilV2Enabled(enabled) {
    GM_setValue(BOT_TEKIL_V2_KEY, enabled === true);
    return enabled === true;
  }

  // Nihai dogrulamada kullanilacak minimum deneme sayisi: yuksek esiklerde kucuk
  // orneklemde sansla "%100" gorunen adaylari gercek oranina ceker (battle-core
  // minVerifyTrials). Esik ne kadar yuksekse o kadar cok dogrulama denemesi.
  function getBotMinVerifyTrials() {
    const rate = getBotMinWinRate();
    if (rate >= 0.99) {
      return 480;
    }
    if (rate >= 0.95) {
      return 360;
    }
    return 240;
  }

  function isBotPanelMinimized() {
    return GM_getValue(BOT_PANEL_MINIMIZED_KEY, false) === true;
  }

  function setBotPanelMinimized(minimized) {
    GM_setValue(BOT_PANEL_MINIMIZED_KEY, minimized === true);
  }

  // Kullanicinin kenardan tutup ayarladigi panel boyutu (0 = otomatik/varsayilan).
  function getBotPanelSize() {
    const width = Number(GM_getValue(BOT_PANEL_WIDTH_KEY, 0)) || 0;
    const height = Number(GM_getValue(BOT_PANEL_HEIGHT_KEY, 0)) || 0;
    return { width, height };
  }

  function setBotPanelSize(width, height) {
    GM_setValue(BOT_PANEL_WIDTH_KEY, Math.round(width) || 0);
    if (height !== undefined) {
      GM_setValue(BOT_PANEL_HEIGHT_KEY, Math.round(height) || 0);
    }
  }

  // Bazi yonetici/surum kombinasyonlarinda GM degeri yanlislikla iki kez JSON'lanip
  // string olarak geri gelebiliyor (or. '"[99,99,...]"'). Bu durumda dizi/nesne elde
  // edene kadar cozeriz; asla bir string'i karakter karakter indekslemeyiz (aksi halde
  // '[' ve ',' konumlari sayiya donmeyip limitler bozuk okunur).
  function parseStoredValue(raw) {
    let value = raw;
    for (let depth = 0; depth < 4 && typeof value === 'string'; depth += 1) {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      try {
        value = JSON.parse(trimmed);
      } catch {
        return null;
      }
    }
    return value;
  }

  function loadBotTiming() {
    const parsed = parseStoredValue(GM_getValue(BOT_TIMING_KEY, ''));
    const stored = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const result = {};
    BOT_TIMING_FIELDS.forEach((field) => {
      const entry = stored[field.key] || {};
      let min = Number(entry.min);
      let max = Number(entry.max);
      if (!Number.isFinite(min) || min < 0) {
        min = field.min;
      }
      if (!Number.isFinite(max) || max < 0) {
        max = field.max;
      }
      if (min > max) {
        [min, max] = [max, min];
      }
      result[field.key] = { min, max };
    });
    return result;
  }

  function saveBotTiming(timing) {
    GM_setValue(BOT_TIMING_KEY, JSON.stringify(timing));
  }

  function loadBotUnitLimits() {
    const parsed = parseStoredValue(GM_getValue(BOT_UNIT_LIMITS_KEY, ''));
    // Yalnizca gercek bir dizi indekslenir; string ise (bozuk/cift JSON) yok sayilir.
    const stored = Array.isArray(parsed) ? parsed : [];
    return BOT_UNIT_LIMIT_DEFAULTS.map((fallback, index) => {
      const value = Number(stored[index]);
      return Number.isInteger(value) && value >= 0 ? value : fallback;
    });
  }

  function saveBotUnitLimits(limits) {
    const normalized = BOT_UNIT_LIMIT_DEFAULTS.map((fallback, index) => {
      const value = Number(limits[index]);
      return Number.isInteger(value) && value >= 0 ? value : fallback;
    });
    GM_setValue(BOT_UNIT_LIMITS_KEY, JSON.stringify(normalized));
  }

  // Verilen parametrenin araligindan rastgele bekleme (ms). Parametre yoksa sabit ms'e duser.
  function timedSleep(categoryOrMs) {
    if (typeof categoryOrMs === 'number') {
      return sleep(categoryOrMs);
    }
    const timing = loadBotTiming();
    const range = timing[categoryOrMs] || BOT_TIMING_DEFAULTS[categoryOrMs] || { min: 0.7, max: 1.6 };
    const ms = (range.min + Math.random() * (range.max - range.min)) * 1000;
    return sleep(Math.max(0, Math.round(ms)));
  }
  // battle-core.js'teki ENEMY_UNITS / ALLY_UNITS sirasiyla ayni olmali.
  const BOT_ENEMY_KEYS = ['skeletons', 'zombies', 'cultists', 'bonewings', 'corpses', 'wraiths', 'revenants', 'giants', 'broodmothers', 'liches'];
  const BOT_ALLY_KEYS = ['bats', 'ghouls', 'thralls', 'banshees', 'necromancers', 'gargoyles', 'witches', 'rotmaws'];

  let battleCorePromise = null;
  let botTickStarted = false;

  function gmFetchText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText);
          } else {
            reject(new Error(`HTTP ${response.status}`));
          }
        },
        onerror: () => reject(new Error('istek basarisiz'))
      });
    });
  }

  // Anlik internet kesintilerinde botu durdurmak yerine baglanti geri gelene kadar
  // bekletir. navigator.onLine cevrimdisi oldugunda kesin false doner; cevrimici
  // gorunup istekler patladiginda ise gmFetchTextWithRetry devreye girer.
  // Donus: true = cevrimici ve bot hala acik; false = bot durduruldu (cagiran cikmali).
  async function ensureOnline(contextLabel) {
    if (navigator.onLine !== false) {
      return true;
    }
    let waited = 0;
    while (isBotEnabled() && navigator.onLine === false) {
      setBotStatus(`${contextLabel || 'Bot'}: internet bekleniyor... (${waited} sn)`);
      await sleep(2000);
      waited += 2;
      void acquireWakeLock();
    }
    return isBotEnabled() && navigator.onLine !== false;
  }

  // gmFetchText'i gecici ag hatalarinda yeniden dener; her denemeden once baglantinin
  // geri gelmesini bekler. Tum denemeler basarisiz olursa son hatayi firlatir.
  async function gmFetchTextWithRetry(url, options = {}) {
    const attempts = options.attempts || 5;
    const label = options.label || 'Indirme';
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (isBotEnabled() && !(await ensureOnline(label))) {
        throw new Error('bot durduruldu');
      }
      try {
        return await gmFetchText(url);
      } catch (error) {
        lastError = error;
        const backoff = Math.min(8000, 1500 * attempt);
        setBotStatus(`${label}: baglanti hatasi, ${Math.round(backoff / 1000)} sn sonra tekrar (${attempt}/${attempts})`);
        await sleep(backoff);
      }
    }
    throw lastError || new Error('indirme basarisiz');
  }

  // Tampermonkey korumali alani saf hesap donglerini ciddi yavaslatir (with-proxy
  // sarmalayici). Bu yuzden asil hesap, motor kaynagindan kurulan bir Web Worker'da
  // native hizda yapilir; worker kurulamazsa @require ile gomulu motora dusulur.
  const BOT_CORE_SOURCE_CACHE_KEY = 'btBotCoreSource';

  async function getBattleCoreSource() {
    try {
      const code = await gmFetchText(`${BATTLE_CORE_URL}?bot=${Date.now()}`);
      if (code && code.includes('BattleCore')) {
        try {
          GM_setValue(BOT_CORE_SOURCE_CACHE_KEY, JSON.stringify({ code, fetchedAt: Date.now() }));
        } catch {
          // kaynak cache'i best-effort
        }
        return code;
      }
    } catch {
      // indirme basarisiz; cache'e dus
    }
    try {
      const cached = JSON.parse(GM_getValue(BOT_CORE_SOURCE_CACHE_KEY, '') || 'null');
      if (cached && typeof cached.code === 'string' && cached.code) {
        return cached.code;
      }
    } catch {
      // cache bozuk
    }
    return '';
  }

  // Worker icinde optimizeArmyUsage kosar; sonucun yalnizca botun kullandigi alanlari doner.
  async function computeViaWorker(pool, enemyCounts, options, onTick) {
    if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL === 'undefined') {
      throw new Error('Worker destegi yok');
    }
    const coreSource = await getBattleCoreSource();
    if (!coreSource) {
      throw new Error('motor kaynagi indirilemedi');
    }

    const workerSource = `${coreSource}
self.onmessage = (event) => {
  const message = event.data || {};
  try {
    const result = self.BattleCore.optimizeArmyUsage(message.pool, message.enemy, message.options);
    const source = result.possible ? result.recommendation : null;
    const sample = result.sampleBattle;
    const lossValue = sample && Number.isFinite(Number(sample.lostBloodTotal))
      ? Number(sample.lostBloodTotal)
      : (source && Number.isFinite(source.expectedLostBlood) ? source.expectedLostBlood : null);
    self.postMessage({
      ok: true,
      possible: !!result.possible,
      counts: source ? source.counts : null,
      winRate: source ? source.winRate : 0,
      avgUsedPoints: source ? source.avgUsedPoints : 0,
      lossValue
    });
  } catch (error) {
    self.postMessage({ ok: false, message: String((error && error.message) || error) });
  }
};`;

    const blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const worker = new Worker(blobUrl);
    const startedAt = Date.now();
    const ticker = typeof onTick === 'function'
      ? setInterval(() => onTick(Math.round((Date.now() - startedAt) / 1000)), 1000)
      : 0;

    try {
      return await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('hesap zaman asimina ugradi')), 180000);
        worker.onmessage = (event) => {
          clearTimeout(timeoutId);
          const data = event.data || {};
          if (data.ok) {
            resolve(data);
          } else {
            reject(new Error(data.message || 'worker hatasi'));
          }
        };
        worker.onerror = (event) => {
          clearTimeout(timeoutId);
          reject(new Error(event.message || 'worker baslatilamadi'));
        };
        worker.postMessage({ pool, enemy: enemyCounts, options });
      });
    } finally {
      if (ticker) {
        clearInterval(ticker);
      }
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
    }
  }

  function getEmbeddedBattleCore() {
    const candidates = [
      typeof window !== 'undefined' ? window.BattleCore : null,
      typeof globalThis !== 'undefined' ? globalThis.BattleCore : null,
      typeof unsafeWindow !== 'undefined' ? unsafeWindow.BattleCore : null
    ];
    return candidates.find((core) => core && typeof core.optimizeArmyUsage === 'function') || null;
  }

  // Motor @require ile kurulumda gomulur; o yoksa son care canli siteden cekip eval dener.
  function loadBattleCore() {
    const embedded = getEmbeddedBattleCore();
    if (embedded) {
      return Promise.resolve(embedded);
    }
    if (!battleCorePromise) {
      battleCorePromise = (async () => {
        const code = await gmFetchTextWithRetry(`${BATTLE_CORE_URL}?bot=${Date.now()}`, { label: 'Motor yukleme' });
        (0, eval)(code);
        const core = getEmbeddedBattleCore();
        if (!core) {
          throw new Error('BattleCore yuklenemedi (scripti Tampermonkey\'de yeniden kur: @require motoru gomer)');
        }
        return core;
      })();
      battleCorePromise.catch(() => {
        battleCorePromise = null;
      });
    }
    return battleCorePromise;
  }

  // optimizer.js getRunConfig presetlerinin runIndex=1 karsiliklari (quick.html varsayilani).
  // optimizer.js'te preset degisirse burayi da guncelle.
  function getQuickRunConfig(stage, mode = 'balanced') {
    const seedOffsets = { fast: 1301, balanced: 2603, deep: 5209, ultra: 9203 };
    const presets = {
      fast: {
        trialCount: 4,
        fullArmyTrials: 6,
        beamWidth: 7,
        maxIterations: 3,
        eliteCount: 4,
        stabilityTrials: 8,
        exploratoryCandidateCount: 60,
        exhaustiveCandidateLimit: 1500
      },
      balanced: {
        trialCount: 6,
        fullArmyTrials: 10,
        beamWidth: 10,
        maxIterations: 4,
        eliteCount: 6,
        stabilityTrials: 18,
        exploratoryCandidateCount: 100,
        exhaustiveCandidateLimit: 6000
      },
      deep: {
        trialCount: 10,
        fullArmyTrials: 16,
        beamWidth: 14,
        maxIterations: 5,
        eliteCount: 8,
        stabilityTrials: 40,
        exploratoryCandidateCount: 224,
        exhaustiveCandidateLimit: 20000
      }
    };
    const preset = presets[mode] || presets.balanced;
    const seedOffset = Object.prototype.hasOwnProperty.call(seedOffsets, mode) ? seedOffsets[mode] : seedOffsets.balanced;
    const seedBase = 41017 + stage * 31 + 7919;
    return {
      ...preset,
      diversityCandidateCount: 0,
      tekilCandidateCount: 0,
      baseSeed: seedBase + seedOffset,
      timeBudgetMs: 0,
      alternateBaseSeeds: Object.entries(seedOffsets)
        .filter(([offsetMode]) => offsetMode !== mode)
        .map(([, offset]) => seedBase + offset)
    };
  }

  function parseEnemyCountsForBot() {
    const counts = Object.fromEntries(BOT_ENEMY_KEYS.map((key) => [key, 0]));
    let total = 0;
    document.querySelectorAll('.enemySlot').forEach((slot) => {
      const styleText = slot.getAttribute('style') || '';
      const match = styleText.match(/enemyUnit_(\d+)\.jpg/i);
      const qty = parseQtyValue(slot.querySelector('.qtyValue')?.textContent || '');
      if (!match || qty === null) {
        return;
      }
      const key = BOT_ENEMY_KEYS[Number.parseInt(match[1], 10) - 1];
      if (key) {
        counts[key] += qty;
        total += qty;
      }
    });
    return { counts, total };
  }

  // quick.html varsayilan havuzu: acik kademelerde 99 (T8 icin 1), kapali kademelerde 0.
  function buildBotAllyPool() {
    const openTiers = new Set(getOpenAllyTiers());
    const limits = loadBotUnitLimits();
    return Object.fromEntries(BOT_ALLY_KEYS.map((key, index) => {
      const tier = index + 1;
      if (!openTiers.has(tier)) {
        return [key, 0];
      }
      return [key, limits[index]];
    }));
  }

  function parseBotMaxPoints() {
    const text = getArmyPowerText();
    const match = text.match(/\/(\d+)$/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  function getLayerIdFromHref(href) {
    const match = String(href || '').match(/[?&]layerId=(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  // Kat sayfasi URL'i: page = 10'luk dilim (1-10 -> page 1, 11-20 -> page 2 ...),
  // layerId = mutlak kat numarasi. Ornek: kat 12 -> page=2&layerId=12,
  // kat 22 -> page=3&layerId=22. Sayfa-ici kat dugmeleri yine 1-10 indekslidir.
  function buildFloorUrl(stage) {
    const page = Math.ceil(stage / 10);
    return `${location.origin}/ancestral/index?page=${page}&layerId=${stage}`;
  }

  // Bir href'teki mutlak layerId'den kat numarasi. (Geri/teshis amacli.)
  function getFloorFromHref(href) {
    const text = String(href || '');
    const layerMatch = text.match(/[?&]layerId=(\d+)/);
    if (layerMatch) {
      return Number.parseInt(layerMatch[1], 10);
    }
    return 0;
  }

  // Kat kartindaki "Kat N" yazisindan mutlak kat numarasi.
  function floorNumberOfContainer(container) {
    if (!container) return 0;
    const text = container.querySelector('.layer-number')?.textContent || '';
    return Number.parseInt(text.replace(/[^\d]/g, ''), 10) || 0;
  }

  // Sayfada gosterilen 10'luk dilim (kart numaralarina gore; yoksa URL page'i).
  function currentFloorPage() {
    const nums = [...document.querySelectorAll('.layerInfoContainer')]
      .map(floorNumberOfContainer)
      .filter((n) => n > 0);
    if (nums.length) {
      return Math.ceil(Math.min(...nums) / 10);
    }
    const page = Number.parseInt(new URLSearchParams(location.search).get('page') || '', 10);
    return page > 0 ? page : 1;
  }

  // Mutlak kata ait kat karti (icindeki "Kat N" ile eslesir).
  function findFloorContainer(stage) {
    return [...document.querySelectorAll('.layerInfoContainer')]
      .find((container) => floorNumberOfContainer(container) === stage) || null;
  }

  // Mutlak kata ait giris butonu; kart bulunamazsa gorunur kartin butonu.
  function findFloorEntryButton(stage) {
    const container = findFloorContainer(stage);
    if (container) {
      return container.querySelector('a.layerEntryBtn');
    }
    return document.querySelector('.layerInfoContainer[style*="block"] a.layerEntryBtn');
  }

  // Hedef katin kat butonuna (#layerN, sayfa-ici 1-10 indeks) basarak oyunun kendi
  // secim mantigini (onclick="setLayerActive(page, indeks)") calistirir. Tum giris
  // butonlari ayni href'i tasidigindan ve girilebilirlik bayragi cogu zaman ancak
  // kat aktif edilince guncellendiginden, okuma/giristen once bu sart.
  async function activateFloor(stage) {
    const within = ((stage - 1) % 10) + 1;
    const layerBtn = document.querySelector(`#layer${within}`);
    if (layerBtn && !layerBtn.classList.contains('activeLayerBtn')) {
      layerBtn.click();
      await sleep(450);
    }
  }

  // O an aktif/gorunur kat kartinin giris butonu (hedef kart bulunabiliyorsa onunki).
  function floorEntryButton(stage) {
    const container = findFloorContainer(stage) || document.querySelector('.layerInfoContainer[style*="block"]');
    return container ? container.querySelector('a.layerEntryBtn') : null;
  }

  // Kapali kat kartindaki oyun sayacini saniyeye cevirir. Ornekler: "40m 24s",
  // "1h 20m 5s" veya "01:20:05". Sayac bulunamazsa null doner.
  function floorCooldownSeconds(stage) {
    const container = findFloorContainer(stage) || document.querySelector('.layerInfoContainer[style*="block"]');
    const text = cleanText(container?.textContent || '').toLowerCase();
    const clock = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    if (clock) {
      return clock[3]
        ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
        : Number(clock[1]) * 60 + Number(clock[2]);
    }
    const hours = text.match(/(\d+)\s*(?:h|sa(?:at)?)/)?.[1];
    const minutes = text.match(/(\d+)\s*(?:m|dk|dak(?:ika)?)/)?.[1];
    const seconds = text.match(/(\d+)\s*(?:s|sn|san(?:iye)?)/)?.[1];
    if (hours == null && minutes == null && seconds == null) return null;
    return Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0);
  }

  // Hedef kati aktif edip giris butonuna tiklar.
  async function clickFloorEntry(stage) {
    await activateFloor(stage);
    const entry = floorEntryButton(stage);
    if (entry) {
      entry.click();
      return true;
    }
    return false;
  }

  async function waitForElement(selector, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const el = document.querySelector(selector);
      if (el) {
        return el;
      }
      await sleep(250);
    }
    return null;
  }

  // Secili kat: gorunur (display:block) kat kartindaki gercek "Kat N" numarasi;
  // o yoksa URL'deki mutlak layerId.
  function detectSelectedStage() {
    const activeNum = floorNumberOfContainer(document.querySelector('.layerInfoContainer[style*="block"]'));
    if (activeNum) {
      return activeNum;
    }
    return getFloorFromHref(location.href) || null;
  }

  function isBattleSetupPage() {
    return !!document.querySelector('form[action*="ancestral/fight"]')
      && !!document.querySelector('.stepBtn')
      && !!document.querySelector('.enemySlot');
  }

  function isResultPage() {
    return !!document.querySelector('h1.combatResultHeader');
  }

  function isFloorPage() {
    return !isResultPage() && !!document.querySelector('.layerButtons');
  }

  function isBotEnabled() {
    return GM_getValue(BOT_ENABLED_KEY, false) === true;
  }

  function isReviveEnabled() {
    return GM_getValue(BOT_REVIVE_KEY, true) !== false;
  }

  // Bant bazli diriltme bayraklari (index = floorBandIndex). Kayitli olmayan/
  // bozuk girdiler acik kabul edilir, boylece eski kullanicilar icin davranis degismez.
  function reviveBandFlags() {
    let stored = null;
    try {
      const parsed = JSON.parse(GM_getValue(BOT_REVIVE_BANDS_KEY, ''));
      stored = Array.isArray(parsed) ? parsed : null;
    } catch (_) { /* kayit yok/bozuk: tumu acik varsayilir */ }
    const source = stored || [false];   // index 0 = 1-10 bandı, varsayılan kapalı
    return Array.from({ length: totalAutoBands() }, (_, i) => source[i] !== false);
  }

  function isReviveBandEnabled(floor) {
    if (!Number.isInteger(floor)) return true;
    return reviveBandFlags()[floorBandIndex(floor)] !== false;
  }

  function isReviveEnabledForFloor(floor) {
    return isReviveEnabled() && isReviveBandEnabled(floor);
  }

  function isReminderEnabled() {
    return GM_getValue(REMINDER_ENABLED_KEY, true) !== false;
  }

  // Oyun host'undan sunucu etiketini cikarir (ornek: "s65.bitefight.gameforge.com"
  // -> "s65"). Taninmazsa dokuman id'sinde guvenli kullanilacak sekilde host'u
  // sadelestirir.
  function reminderServerLabel() {
    // Ilk etiketteki sunucu numarasini al: "s66-tr.bitefight..." -> "s66".
    const first = String(location.host || '').split('.')[0].trim();
    const match = first.match(/^s\d+/i);
    if (match) {
      return match[0].toLowerCase();
    }
    return String(location.host || 'unknown').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'unknown';
  }

  // Bant-basi bir kat (1/11/21/31) bitince Firestore'a hatirlatma kaydi yazar.
  // Kayit dueAt (epoch ms) tasir; sunucudaki sendFloorReminders fonksiyonu vakti
  // gelince Telegram'a yollar. Dokuman id'si kat basina sabittir (floorrem_<kat>),
  // boylece ayni kat yeniden temizlenince timer bastan kurulur (oyun mantigiyla ayni).
  async function scheduleFloorReminder(floor) {
    if (!isReminderEnabled()) {
      return;
    }
    const config = FLOOR_REMINDERS.find((entry) => entry.floor === floor);
    if (!config) {
      return;
    }
    const dueAt = Date.now() + config.intervalSec * 1000;
    // Sunucu basina ayri dokuman: paralel oynanan her sunucu (s65/s66/s62...) icin
    // ayri hatirlatma tutulur; boylece biri digerinin kaydini ezmez.
    const server = reminderServerLabel();
    const docId = `floorrem_${server}_${floor}`;
    try {
      const response = await fetch(`${FIRESTORE_REMINDERS_URL}/${docId}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            floor: { integerValue: String(floor) },
            bandLabel: { stringValue: config.bandLabel },
            dueAt: { integerValue: String(dueAt) },
            intervalSec: { integerValue: String(config.intervalSec) },
            host: { stringValue: location.host },
            server: { stringValue: server },
            createdAt: { stringValue: new Date().toISOString() },
            sent: { booleanValue: false }
          }
        })
      });
      if (!response.ok) {
        console.error('Kat hatirlatmasi kaydedilemedi.', floor, await response.text());
        return;
      }
      const dueText = new Date(dueAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      setBotStatus(`Kat ${floor} tamam. Hatirlatma kuruldu: ${dueText} (${config.bandLabel} bandi)`);
    } catch (error) {
      console.error('Kat hatirlatmasi kaydedilemedi.', floor, error);
    }
  }

  // Bot calisirken ekranin kararip kapanmasini onler (Wake Lock API). Kilit sayfa
  // gecislerinde ve sekme arkaya alininca duser; bu yuzden her bot tetiginde ve
  // sayfa tekrar gorunur oldugunda yeniden alinir.
  let wakeLockSentinel = null;

  async function acquireWakeLock() {
    if (!isBotEnabled() || document.visibilityState !== 'visible') {
      return;
    }
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
      return;
    }
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      return;
    }
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (error) {
      console.warn('Ekran uyanik tutulamadi.', error);
    }
  }

  function releaseWakeLock() {
    try {
      wakeLockSentinel?.release();
    } catch {
      // zaten birakilmis olabilir
    }
    wakeLockSentinel = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void acquireWakeLock();
    }
  });

  // Internet geri geldiginde ekran kilidini tekrar al. ensureOnline'in bekleme
  // donguleri zaten 2 sn'de bir baglantiyi kontrol edip kaldigi yerden devam eder.
  window.addEventListener('online', () => {
    if (isBotEnabled()) {
      void acquireWakeLock();
    }
  });

  function setBotStatus(text) {
    GM_setValue('btBotStatus', text);
    const statusEl = document.querySelector('#bt-bot-status');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function stopBot(reason) {
    GM_setValue(BOT_ENABLED_KEY, false);
    GM_setValue(AUTO_ENABLED_KEY, false);
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    setOrbFloorBusy(false);
    releaseWakeLock();
    setBotStatus(`Durdu: ${reason}`);
    renderBotPanel();
  }

  function startBot(startStage, stopStage) {
    setOrbFloorBusy(true);
    GM_setValue(BOT_ENABLED_KEY, true);
    GM_setValue(AUTO_ENABLED_KEY, false);
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    GM_setValue(BOT_NEXT_STAGE_KEY, startStage);
    GM_setValue(BOT_STOP_STAGE_KEY, stopStage || 0);
    GM_setValue(BOT_DONE_KEY, 0);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    GM_setValue(BOT_RECOVER_KEY, '');
    void acquireWakeLock();
    setBotStatus(`Bot basladi: Kat ${startStage}`);
    renderBotPanel();
    botTickStarted = false;
    void runBotTick();
  }

  // Sureleri yeniden kontrol et: GM'de saklanan bekleme sayaclari (bant yenilenme,
  // tur bekleme) sunucular arasinda ortak oldugundan sunucu degisince eski sunucunun
  // sureleri gecerli sanilir. Bu fonksiyon sayaclari sifirlar; oto mod acikken secilen
  // ilk kata gidip gercek sureleri bu sunucunun sayfasindan yeniden okutur ve kat
  // musaitse girer, degilse yeni sureleri kaydedip beklemeye gecer.
  function recheckFloorTimers() {
    GM_setValue(AUTO_BAND_DUE_KEY, '');
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    if (isAutoEnabled()) {
      const { start } = autoFloorRange();
      GM_setValue(BOT_NEXT_STAGE_KEY, start);
      if (orbCollectionIsDue()) {
        startOrbPriorityTurn(start);
        return;
      }
      setOrbFloorBusy(true);
      setBotStatus(`Sureler sifirlandi; Kat ${start}'den bu sunucunun guncel sureleri okunuyor...`);
      location.assign(buildFloorUrl(start));
      return;
    }
    setBotStatus('Kat sureleri sifirlandi; bot baslatilinca bu sunucudaki guncel surelerle taranacak.');
    renderBotPanel();
  }

  async function handleBattlePage() {
    // Hedef kat, kat sayfasinda girilmeden hemen once GM'ye yazilir; esas o.
    // Geri linkindeki mutlak layerId, GM bos oldugunda yedek olarak kullanilir.
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0)
      || getFloorFromHref(document.querySelector('a.combatBackBtn')?.href);
    if (!stage) {
      stopBot('Kat bilgisi yok; bota kat sayfasindan basla');
      return;
    }
    GM_setValue(BOT_NEXT_STAGE_KEY, stage);

    setBotStatus(`Kat ${stage}: rakip okunuyor...`);
    const enemy = parseEnemyCountsForBot();
    if (!enemy.total) {
      stopBot(`Kat ${stage}: rakip dizilisi okunamadi`);
      return;
    }

    const pool = buildBotAllyPool();
    const maxPoints = parseBotMaxPoints() || getEmbeddedBattleCore()?.getStagePointLimit(stage) || 0;
    if (!maxPoints) {
      stopBot(`Kat ${stage}: puan limiti okunamadi`);
      return;
    }

    setBotStatus(`Kat ${stage}: cozum araniyor (puan ${maxPoints})...`);
    await sleep(150);

    let chosenMode = 'balanced';
    let outcome;
    try {
      outcome = await computeBotOutcome(stage, 'balanced', pool, enemy.counts, maxPoints);
    } catch (error) {
      stopBot(`Kat ${stage}: hesap hatasi (${error.message})`);
      return;
    }

    // Dengeli cozumun beklenen kan kaybi esigi asiyorsa hizli ve derin modlari da
    // tara; guvenli cozum veren modlar arasinda en dusuk kayipli olanla savas.
    if (isSafeBotOutcome(outcome) && Number.isFinite(outcome.lossValue) && outcome.lossValue > BOT_LOSS_ESCALATION_THRESHOLD) {
      const candidates = [{ mode: 'balanced', outcome }];
      for (const mode of ['fast', 'deep']) {
        if (!isBotEnabled()) {
          return;
        }
        try {
          candidates.push({ mode, outcome: await computeBotOutcome(stage, mode, pool, enemy.counts, maxPoints) });
        } catch (error) {
          console.warn(`Kat ${stage}: ${BOT_MODE_LABELS[mode] || mode} mod hesabi basarisiz, atlandi.`, error);
        }
      }
      let bestEntry = null;
      candidates.forEach((entry) => {
        if (!isSafeBotOutcome(entry.outcome) || !Number.isFinite(entry.outcome.lossValue)) {
          return;
        }
        if (!bestEntry || entry.outcome.lossValue < bestEntry.outcome.lossValue) {
          bestEntry = entry;
        }
      });
      if (bestEntry) {
        chosenMode = bestEntry.mode;
        outcome = bestEntry.outcome;
      }
    }

    const winRate = Number(outcome.winRate || 0);
    if (!isSafeBotOutcome(outcome)) {
      stopBot(`Kat ${stage}: guvenli cozum yok (kazanma %${Math.round(winRate * 100)})`);
      return;
    }

    const targets = {};
    BOT_ALLY_KEYS.forEach((key, index) => {
      const count = Number(outcome.counts?.[key] || 0);
      if (count > 0) {
        targets[index + 1] = count;
      }
    });

    const lossNote = Number.isFinite(outcome.lossValue) ? `, kayip ${Math.round(outcome.lossValue)}` : '';
    setBotStatus(`Kat ${stage}: %${Math.round(winRate * 100)} cozum dolduruluyor (${BOT_MODE_LABELS[chosenMode] || chosenMode}${lossNote})...`);
    try {
      await createArchiveRecord('fill', { targets, preferTargets: true });
    } catch (error) {
      console.error('Otomatik arsiv kaydi olusturulamadi.', error);
    }

    await fillUnits(targets);
    if (!isBotEnabled()) {
      return;
    }

    const startBtn = document.querySelector('#fightBtn');
    if (!startBtn) {
      stopBot(`Kat ${stage}: BASLA (#fightBtn) bulunamadi`);
      return;
    }
    // Bu savas icin tas sayacini sifirla; diriltme olursa sonuc sayfasinda guncellenir.
    GM_setValue(LAST_REVIVE_STONES_KEY, '0');
    setBotStatus(`Kat ${stage}: savas baslatiliyor...`);
    await timedSleep('button');
    if (!(await ensureOnline(`Kat ${stage}`))) {
      return;
    }
    startBtn.click();
  }

  function buildBotSearchOptions(runConfig, maxPoints) {
    return {
      maxPoints,
      minimumUsedPoints: Math.max(0, Math.ceil(maxPoints * 0.75)),
      maximumUsedPoints: maxPoints,
      minimumRequiredCounts: {},
      requiredLossCounts: {},
      requiredLossExactFlags: {},
      minWinRate: getBotMinWinRate(),
      minVerifyTrials: getBotMinVerifyTrials(),
      trialCount: runConfig.trialCount,
      fullArmyTrials: runConfig.fullArmyTrials,
      beamWidth: runConfig.beamWidth,
      maxIterations: runConfig.maxIterations,
      eliteCount: runConfig.eliteCount,
      stabilityTrials: runConfig.stabilityTrials,
      baseSeed: runConfig.baseSeed,
      objective: 'min_loss',
      roundingMode: getBotRoundingMode(),
      stoneMode: false,
      diversityMode: false,
      tekilMode: false,
      tekilV2Mode: isBotTekilV2Enabled(),
      exploratoryCandidateCount: runConfig.exploratoryCandidateCount,
      exhaustiveCandidateLimit: runConfig.exhaustiveCandidateLimit,
      timeBudgetMs: runConfig.timeBudgetMs,
      alternateBaseSeeds: runConfig.alternateBaseSeeds,
      diversityCandidateCount: runConfig.diversityCandidateCount,
      tekilCandidateCount: runConfig.tekilCandidateCount,
      knownSignatures: [],
      seedCandidates: []
    };
  }

  // Quick popup'taki "Kan Kaybi" esdegeri: temsilci savasin toplam kan kaybi,
  // o yoksa onerinin beklenen kan kaybi (optimizer.js getDisplayedRepresentativeLossValue).
  function extractBotLossValue(result, source) {
    const sample = result ? result.sampleBattle : null;
    if (sample && Number.isFinite(Number(sample.lostBloodTotal))) {
      return Number(sample.lostBloodTotal);
    }
    return source && Number.isFinite(source.expectedLostBlood) ? source.expectedLostBlood : null;
  }

  function isSafeBotOutcome(entry) {
    return !!entry && entry.possible && !!entry.counts && Number(entry.winRate || 0) >= getBotMinWinRate();
  }

  // Verilen modda cozum arar: once Web Worker (native hiz, UI donmaz), olmazsa
  // korumali alandaki gomulu motor. Hata durumunda throw eder.
  async function computeBotOutcome(stage, mode, pool, enemyCounts, maxPoints) {
    const searchOptions = buildBotSearchOptions(getQuickRunConfig(stage, mode), maxPoints);
    const modeLabel = BOT_MODE_LABELS[mode] || mode;
    try {
      return await computeViaWorker(pool, enemyCounts, searchOptions, (seconds) => {
        setBotStatus(`Kat ${stage}: cozum araniyor (${modeLabel})... ${seconds} sn`);
      });
    } catch (error) {
      console.warn(`Worker hesabi basarisiz (${modeLabel}), gomulu motora dusuluyor.`, error);
    }

    setBotStatus(`Kat ${stage}: cozum araniyor (${modeLabel}, yedek motor)...`);
    await sleep(150);
    const core = await loadBattleCore();
    const result = core.optimizeArmyUsage(pool, enemyCounts, searchOptions);
    const source = result.possible ? result.recommendation : null;
    return {
      possible: !!result.possible,
      counts: source ? source.counts : null,
      winRate: source ? source.winRate : 0,
      lossValue: extractBotLossValue(result, source)
    };
  }

  async function handleResultPage() {
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    const victory = !!document.querySelector('h1.combatResultHeader.resultVictory');

    // Olen birim varsa ve panelde diriltme acik ise hayata dondur (yenilgide de
    // tas varsa kurtarmaya calis). Diriltme kapaliysa buton hic tiklanmaz.
    await reviveFallenIfNeeded(stage);
    try {
      // Diriltme denemesi bitti ve bot bu sayfadan ayrilmak uzere. Diriltme
      // butonu hala duruyorsa (bant kapali, diriltme basarisiz, kullanici elle
      // diriltiyor) beklemenin anlami yok: beklenirse kayit sonraki savasin
      // payload'i tarafindan ezilip tamamen kaybolur.
      await syncLootResultToLastArchive({ force: true });
    } catch (error) {
      console.error('Diriltme sonrasi arsiv kaydi guncellenemedi.', error);
    }

    if (!victory) {
      stopBot(`Kat ${stage}: zafer goremedim, sonucu kontrol et`);
      return;
    }

    const done = GM_getValue(BOT_DONE_KEY, 0) + 1;
    GM_setValue(BOT_DONE_KEY, done);
    GM_setValue(BOT_NEXT_STAGE_KEY, stage + 1);
    // Zafer = ilerleme; girise kapali kat atlama sayacini sifirla.
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);

    // Bant-basi kat (1/11/21/31) ise bant suresi kadar sonrasi icin Telegram
    // hatirlatmasini planla (oto kat modundaki ile ayni davranis).
    await scheduleFloorReminder(stage);

    const stopStage = GM_getValue(BOT_STOP_STAGE_KEY, 0);
    if (stopStage && stage >= stopStage) {
      stopBot(`Hedef kat (${stopStage}) tamamlandi, ${done} kat gecildi`);
      return;
    }

    // Ileri linki ayni kata doner; bot sonraki katin sayfasina dogrudan gider.
    // Katlar arasi bekleme: saniyelik geri sayim, Durdur butonu bu sirada da calisir.
    const floorRange = loadBotTiming().floor;
    const waitSeconds = Math.max(0, Math.round(floorRange.min + Math.random() * (floorRange.max - floorRange.min)));
    for (let remaining = waitSeconds; remaining > 0; remaining -= 1) {
      if (!isBotEnabled()) {
        return;
      }
      setBotStatus(`Kat ${stage} tamam (${done} kat). Kat ${stage + 1} icin bekleme: ${remaining} sn`);
      await sleep(1000);
    }
    if (!isBotEnabled()) {
      return;
    }
    if (!(await ensureOnline(`Kat ${stage + 1}`))) {
      return;
    }
    location.assign(buildFloorUrl(stage + 1));
  }

  async function handleFloorPage() {
    const target = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    if (!target) {
      stopBot('Hedef kat yok');
      return;
    }

    const targetPage = Math.ceil(target / 10);
    if (currentFloorPage() !== targetPage) {
      // Hedef kat baska bir 10'luk dilimde; o dilime git.
      setBotStatus(`Kat ${target} aciliyor...`);
      await timedSleep('button');
      if (!(await ensureOnline(`Kat ${target}`))) {
        return;
      }
      location.assign(buildFloorUrl(target));
      return;
    }

    await activateFloor(target);
    const enterLink = floorEntryButton(target);
    if (!enterLink || !enterLink.classList.contains('entryAvailable')) {
      // Kat girise kapali (bekleme suresi / cooldown / acma sarti). Bota gore: durma,
      // bir sonraki kata atla ve oradan devam et. Sonsuz atlamayi onlemek icin Son kat
      // sinirina gelince ya da Son kat girilmemisken art arda 50 kat atlaninca dur.
      const stopStage = GM_getValue(BOT_STOP_STAGE_KEY, 0);
      if (stopStage && target >= stopStage) {
        stopBot(`Kat ${target}: giris kapali ve hedef kat (${stopStage}) sinirina gelindi`);
        return;
      }
      const skipCount = (GM_getValue(BOT_SKIP_COUNT_KEY, 0) || 0) + 1;
      if (!stopStage && skipCount > 50) {
        stopBot(`Kat ${target}: giris kapali; art arda 50 kat atlandi, durduruldu`);
        return;
      }
      GM_setValue(BOT_SKIP_COUNT_KEY, skipCount);
      const next = target + 1;
      GM_setValue(BOT_NEXT_STAGE_KEY, next);
      setBotStatus(`Kat ${target}: giris kapali, atlaniyor -> Kat ${next}`);
      await timedSleep('button');
      if (!(await ensureOnline(`Kat ${next}`))) {
        return;
      }
      location.assign(buildFloorUrl(next));
      return;
    }
    // Basarili giris: atlama sayacini sifirla.
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    setBotStatus(`Kat ${target}: giriliyor...`);
    await timedSleep('button');
    if (!(await ensureOnline(`Kat ${target}`))) {
      return;
    }
    await clickFloorEntry(target);
  }

  // Sayfa taninmayinca cagrilir: beklenen kata geri donerek toparlanir. 2 dk'lik
  // pencerede 8'den fazla toparlanma denenirse (genelde kalici bir sorun: oturum
  // kapanmis, captcha, bakim) botu durdurur ki sonsuz reload olmasin.
  async function recoverFromUnknownPage() {
    let recover = {};
    try {
      recover = JSON.parse(GM_getValue(BOT_RECOVER_KEY, '') || '{}') || {};
    } catch {
      recover = {};
    }
    const now = Date.now();
    if (!recover.ts || now - recover.ts > 120000) {
      recover = { count: 0, ts: now };
    }
    recover.count = (recover.count || 0) + 1;
    recover.ts = now;
    GM_setValue(BOT_RECOVER_KEY, JSON.stringify(recover));

    if (recover.count > 8) {
      stopBot('Sayfa surekli taninmiyor; toparlanamadi (oturum kapanmis / captcha / bakim olabilir)');
      return;
    }

    const target = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    setBotStatus(`Sayfa taninmadi, toparlaniyor... (${recover.count}/8)`);
    await sleep(4000);
    if (!isBotEnabled()) {
      return;
    }
    if (!(await ensureOnline('Toparlanma'))) {
      return;
    }
    if (target) {
      location.assign(buildFloorUrl(target));
    } else {
      location.reload();
    }
  }

  // Oto mod beklerken kullanicinin magara, sehir, market vb. sayfalarda kalmasina
  // izin verir. Kayitli kontrol zamani gelince hedef kata otomatik doner.
  function scheduleAutoReturnFromOtherPage() {
    if (orbHasPriority()) {
      setBotStatus('Orb oncelikli calisiyor; kat botu teslimi bekliyor');
      // Orb devri gecici olarak takili kalirsa bu sayfada kat kontrolu tamamen
      // sahipsiz kalmasin; oncelik kalkana kadar dusuk frekansta yeniden bak.
      window.setTimeout(() => {
        if (isAutoEnabled()) scheduleAutoReturnFromOtherPage();
      }, 5000);
      return;
    }
    const now = Date.now();
    const waitUntil = Number(GM_getValue(AUTO_WAIT_UNTIL_KEY, 0));
    const dueTimes = autoBandDueTimes();
    const futureDueTimes = Object.values(dueTimes)
      .map(Number)
      .filter((value) => value > now);
    const { start, end } = autoFloorRange();
    const savedTarget = Number(GM_getValue(BOT_NEXT_STAGE_KEY, start));
    const candidate = savedTarget >= start && savedTarget <= end ? savedTarget : start;
    const readyTarget = nextDueFloor(candidate, end)
      || nextDueFloor(start, Math.min(end, candidate - 1));
    const target = readyTarget || candidate;
    if (readyTarget && readyTarget !== savedTarget) {
      GM_setValue(BOT_NEXT_STAGE_KEY, readyTarget);
    }
    const targetDueAt = target % 10 === 1 ? Number(dueTimes[floorBandIndex(target)] || 0) : 0;
    const nextCheckAt = waitUntil > now
      ? waitUntil
      : (readyTarget || targetDueAt <= now
        ? now
        : (targetDueAt || (futureDueTimes.length ? Math.min(...futureDueTimes) : now)));
    const delay = Math.max(500, Math.min(2147480000, nextCheckAt - now));
    const remaining = Math.max(0, Math.ceil((nextCheckAt - now) / 1000));
    setOrbFloorBusy(remaining <= 0, nextCheckAt);
    setBotStatus(remaining > 0
      ? `Oto mod arka planda bekliyor. Kat kontrolune ${remaining} sn kaldi`
      : 'Oto mod: kat kontrolu baslatiliyor');
    window.setTimeout(() => {
      if (!isAutoEnabled()) return;
      setOrbFloorBusy(true);
      location.assign(buildFloorUrl(target || autoFloorRange().start));
    }, delay);
  }

  async function runBotTick() {
    try {
      if (JSON.parse(localStorage.getItem(ITEM_DISCARD_STATE_KEY) || '{}').running === true) {
        setBotStatus('Profil item temizligi bitene kadar kat botu bekliyor');
        return;
      }
    } catch { /* bozuk gecici durum kat botunu engellemesin */ }
    if (botTickStarted || !isBotEnabled()) {
      return;
    }
    botTickStarted = true;
    void acquireWakeLock();
    try {
      const recognized = isBattleSetupPage() || isResultPage() || isFloorPage();
      if (recognized) {
        // Bilinen bir sayfaya ulasildi; toparlanma sayacini sifirla.
        GM_setValue(BOT_RECOVER_KEY, '');
      }
      if (isBattleSetupPage()) {
        await handleBattlePage();
      } else if (isResultPage()) {
        await (isAutoEnabled() ? handleAutoResultPage() : handleResultPage());
      } else if (isFloorPage()) {
        await (isAutoEnabled() ? handleAutoFloorPage() : handleFloorPage());
      } else if (isAutoEnabled()) {
        // Normal oyun sayfasi kullanici gezintisidir; bekleme bitene kadar dokunma.
        scheduleAutoReturnFromOtherPage();
      } else if (isBotEnabled()) {
        // Bot acik ama sayfa taninmiyor: yarim yuklenmis sayfa, gecici sunucu hatasi
        // veya kisa internet kesintisinin ardindan gelen bos/hata sayfasi olabilir.
        // Kisa bekleyip beklenen kata geri donerek toparlanmayi dene. Surekli
        // basarisiz olursa (or. cikis yapilmis / captcha) durdur.
        await recoverFromUnknownPage();
      }
      // Diger durumlarda (bot kapali) dokunma; kullanici gezinmeye devam edebilir.
    } catch (error) {
      console.error('Kat botu hatasi', error);
      stopBot(`Beklenmeyen hata: ${error.message}`);
    }
  }

  // Gecici: sayfanin temizlenmis HTML'ini botDumps koleksiyonuna yollar ki buton
  // seciciler gercek DOM'a gore yazilabilsin. Oturum/sifre benzeri degerler maskelenir.
  const FIRESTORE_BOT_DUMPS_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/botDumps';

  function buildPageDumpHtml() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, style, link, noscript, iframe, svg').forEach((el) => el.remove());
    let html = clone.outerHTML;
    // Olasi oturum degerlerini maskele.
    html = html.replace(/((?:sh|sid|session|sessionid|hash|token|key)=)[^&"'\s]+/gi, '$1X');
    if (html.length > 700000) {
      html = html.slice(0, 700000);
    }
    return html;
  }

  async function sendPageDump(statusEl) {
    const docId = `dump_${Date.now()}_${Math.random().toString(36).slice(2, 9) || '0'}`;
    const body = {
      fields: {
        savedAt: { stringValue: new Date().toISOString() },
        pageUrl: { stringValue: String(location.href).slice(0, 400) },
        pageTitle: { stringValue: String(document.title || '').slice(0, 160) },
        kind: { stringValue: 'bitefight-page' },
        html: { stringValue: buildPageDumpHtml() }
      }
    };
    const response = await fetch(`${FIRESTORE_BOT_DUMPS_URL}?documentId=${encodeURIComponent(docId)}&key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (statusEl) {
      statusEl.textContent = `Gonderildi: ${docId}`;
    }
    return docId;
  }

  function injectBotPanelStyles() {
    if (document.querySelector('#bt-bot-panel-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'bt-bot-panel-styles';
    style.textContent = `
      #bt-bot-panel {
        /* Boyutlandirma buyuk, dokunmatik uyumlu ozel kose tutamaciyla yapilir. */
        box-sizing: border-box;
        width: min(760px, calc(100vw - 36px));
        padding: 12px 14px 11px !important;
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        align-content: start;
        column-gap: 12px !important;
        row-gap: 8px !important;
        resize: none;
        overflow-x: hidden;
        overflow-y: auto;
        min-width: ${BOT_PANEL_MIN_WIDTH}px !important;
        min-height: ${BOT_PANEL_MIN_HEIGHT}px;
        max-width: min(${BOT_PANEL_MAX_DESKTOP_WIDTH}px, calc(100vw - 36px));
        max-height: min(720px, calc(100dvh - 44px));
        scrollbar-width: thin;
        scrollbar-color: rgba(201, 164, 109, .45) transparent;
        border: 1px solid rgba(210, 170, 115, .28) !important;
        border-radius: 16px !important;
        background:
          linear-gradient(158deg, #100a08 0%, #080604 100%),
          radial-gradient(120% 55% at 88% 8%, rgba(212, 170, 100, .10), transparent 68%) !important;
        box-shadow:
          0 22px 60px -16px rgba(0, 0, 0, .88),
          0 8px 22px rgba(0, 0, 0, .55),
          inset 0 1px 0 rgba(255, 255, 255, .06),
          inset 0 -1px 0 rgba(0, 0, 0, .4) !important;
        color: #f5e9d2 !important;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
      }

      .bt-panel-resize-handle {
        position: fixed;
        width: 40px;
        height: 40px;
        z-index: 100000;
        cursor: nwse-resize;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        border-radius: 14px 0 14px 0;
        background: radial-gradient(circle at 100% 100%, rgba(210, 168, 108, .18), transparent 68%);
        opacity: .72;
        transition: opacity .16s ease, background-color .16s ease;
      }

      .bt-panel-resize-handle::before,
      .bt-panel-resize-handle::after {
        content: "";
        position: absolute;
        right: 8px;
        bottom: 10px;
        width: 18px;
        height: 2px;
        border-radius: 999px;
        background: rgba(225, 190, 137, .9);
        box-shadow: 0 1px 3px rgba(0, 0, 0, .55);
        transform: rotate(-45deg);
        transform-origin: right center;
      }

      .bt-panel-resize-handle::after {
        bottom: 7px;
        width: 10px;
        opacity: .72;
      }

      .bt-panel-resize-handle:hover,
      .bt-panel-resize-handle:focus-visible,
      .bt-panel-resize-handle.is-active {
        opacity: 1;
        outline: none;
        background-color: rgba(210, 168, 108, .08);
      }

      #bt-bot-panel.is-resizing {
        border-color: rgba(225, 190, 137, .58) !important;
        box-shadow: 0 24px 68px -16px rgba(0, 0, 0, .92), 0 0 0 1px rgba(210, 168, 108, .12) !important;
      }

      #bt-bot-panel::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 2.5px;
        background: linear-gradient(180deg, #d4af77, #7a3725 72%, transparent);
        border-radius: 2px 0 0 2px;
      }

      #bt-bot-panel::-webkit-scrollbar {
        width: 7px;
      }

      #bt-bot-panel::-webkit-scrollbar-thumb {
        border: 2px solid transparent;
        border-radius: 999px;
        background: rgba(201, 164, 109, .42);
        background-clip: padding-box;
      }

      #bt-bot-panel .bt-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 2px 2px;
      }

      /* Bu ogeler iki sutunu da kaplar; geri kalan bolumler 2 sutuna dagilir. */
      #bt-bot-panel .bt-panel-head,
      #bt-bot-status,
      #bt-bot-panel .bt-floor-shortcuts,
      #bt-bot-panel .bt-panel-mode,
      #bt-bot-panel .bt-auto-countdowns {
        grid-column: 1 / -1 !important;
      }

      #bt-bot-panel .bt-auto-countdowns {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        padding: 7px;
        border: 1px solid rgba(210, 168, 108, .12);
        border-radius: 12px;
        background: linear-gradient(145deg, rgba(212, 168, 108, .055), rgba(255, 255, 255, .012));
      }

      #bt-bot-panel .bt-auto-countdown-card {
        min-width: 0;
        padding: 7px 8px;
        border-left: 2px solid rgba(212, 168, 108, .38);
        border-radius: 7px;
        background: rgba(0, 0, 0, .22);
      }

      #bt-bot-panel .bt-auto-countdown-card.is-ready {
        border-left-color: #5fc89a;
        background: rgba(55, 125, 91, .10);
      }

      #bt-bot-panel .bt-auto-countdown-card.bt-orb-countdown-card {
        grid-column: 1 / -1;
        border-left-color: #dca52f;
      }

      #bt-bot-panel .bt-auto-countdown-floor {
        color: #a99373;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .09em;
        text-transform: uppercase;
      }

      #bt-bot-panel .bt-auto-countdown-value {
        margin-top: 3px;
        color: #f5e9d2;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.25;
      }

      #bt-bot-panel .bt-floor-shortcuts > div:last-child {
        display: flex;
        gap: 6px;
      }

      #bt-bot-panel .bt-panel-kicker {
        color: #a38b68;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: .22em;
        text-transform: uppercase;
        opacity: .85;
      }

      #bt-bot-panel .bt-panel-title {
        margin-top: 0;
        color: #f8f0d8;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: .01em;
        line-height: 1;
      }

      #bt-bot-panel .bt-panel-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #7c6350;
        box-shadow: 0 0 0 3px rgba(124, 99, 80, .16);
        border: 1px solid rgba(212, 175, 110, .22);
      }

      #bt-bot-panel .bt-panel-dot.is-active {
        background: #5fc89a;
        border-color: rgba(95, 200, 154, .35);
        box-shadow: 0 0 0 3px rgba(95, 200, 154, .12), 0 0 12px rgba(95, 200, 154, .45);
      }

      #bt-bot-status {
        max-width: none !important;
        padding: 8px 10px !important;
        border: 1px solid rgba(255, 255, 255, .045);
        border-radius: 10px;
        background: rgba(255, 255, 255, .022);
        color: #d8c7a6 !important;
        font-size: 11px !important;
        line-height: 1.38;
      }

      #bt-bot-panel input[type="number"],
      #bt-bot-panel select {
        appearance: textfield;
        -moz-appearance: textfield;
        min-width: 0;
        height: 31px;
        box-sizing: border-box;
        padding: 0 10px !important;
        border: 1px solid rgba(198, 160, 90, .28) !important;
        border-radius: 8px !important;
        outline: none;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .03), transparent),
          #18120e !important;
        color: #fff6dc !important;
        caret-color: #f1c46d;
        font: 700 12.5px/1 ui-monospace, SFMono-Regular, Consolas, monospace !important;
        text-align: left;
        letter-spacing: 0;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04), inset 0 -1px 0 rgba(0,0,0,.32);
        transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
      }

      #bt-bot-panel input[type="number"]::-webkit-outer-spin-button,
      #bt-bot-panel input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      #bt-bot-panel input[type="number"]::placeholder {
        color: rgba(245, 233, 210, .5);
        font-weight: 600;
      }

      #bt-bot-panel input[type="number"]:focus,
      #bt-bot-panel select:focus {
        border-color: #d4af77 !important;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .04), transparent),
          #221b15 !important;
        box-shadow: 0 0 0 3px rgba(212, 175, 110, .10), inset 0 1px 0 rgba(255,255,255,.05);
      }

      #bt-bot-panel select {
        height: 31px;
        font-size: 12.5px !important;
        color: #f5e9d2 !important;
      }

      #bt-bot-panel button,
      #bt-filler-actions button {
        min-height: 33px;
        border: 1px solid rgba(210, 168, 108, .42) !important;
        border-radius: 9px !important;
        background: linear-gradient(155deg, #4f1c18, #2f100d) !important;
        color: #f4e6c3 !important;
        font-family: inherit !important;
        font-weight: 700 !important;
        letter-spacing: .008em;
        box-shadow: 0 8px 18px rgba(0, 0, 0, .52), inset 0 1px 0 rgba(255, 255, 255, .06) !important;
        transition: transform .14s cubic-bezier(.2,.0,.1,1), filter .14s ease, border-color .14s ease;
      }

      #bt-bot-panel button:hover,
      #bt-filler-actions button:hover {
        filter: brightness(1.1) saturate(1.02);
        border-color: #d4af77 !important;
        transform: translateY(-1px);
        box-shadow: 0 11px 24px rgba(0, 0, 0, .56), inset 0 1px 0 rgba(255, 255, 255, .08) !important;
      }

      #bt-bot-panel button:active,
      #bt-filler-actions button:active {
        transform: translateY(0) scale(.985);
        filter: brightness(.95);
      }

      #bt-bot-panel button:focus-visible,
      #bt-filler-actions button:focus-visible {
        outline: 2px solid rgba(212, 175, 110, .2);
        outline-offset: 1px;
      }

      #bt-bot-panel .bt-auto-button {
        border-color: rgba(82, 158, 112, .48) !important;
        background: linear-gradient(155deg, #1a3f2e, #0f241a) !important;
        box-shadow: 0 8px 18px rgba(0, 0, 0, .52), inset 0 1px 0 rgba(255, 255, 255, .07) !important;
      }

      #bt-bot-panel .bt-settings-header {
        min-height: 22px;
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #c9a46d !important;
        font-weight: 700 !important;
        font-size: 11px !important;
      }

      #bt-bot-panel .bt-settings-header:hover {
        filter: none;
        transform: none;
        color: #ddb97e !important;
      }

      #bt-bot-panel .bt-secondary-button {
        border-color: rgba(255, 255, 255, .09) !important;
        background: rgba(255, 255, 255, .035) !important;
        color: #c8b49a !important;
        box-shadow: none !important;
      }

      #bt-bot-panel .bt-panel-mode {
        color: #d4af77 !important;
        font-size: 10.5px !important;
        letter-spacing: .025em;
        font-weight: 600;
      }

      #bt-bot-panel .bt-panel-row {
        display: grid !important;
        grid-template-columns: 1fr 1fr;
        gap: 5px !important;
      }

      #bt-bot-panel .bt-panel-row input {
        width: 100% !important;
      }

      #bt-bot-panel .bt-panel-section {
        margin-top: 0 !important;
        padding: 8px !important;
        gap: 6px !important;
        border: 1px solid rgba(255, 255, 255, .04) !important;
        border-radius: 10px;
        background: linear-gradient(145deg, rgba(255, 255, 255, .022), rgba(255, 255, 255, .008));
      }

      #bt-bot-panel .bt-panel-section label {
        justify-content: space-between;
        color: #c8b49a !important;
        line-height: 1.25;
        font-size: 11px;
      }

      #bt-bot-panel .bt-panel-section label span:first-child {
        flex: 1;
      }

      #bt-bot-panel .bt-inline-field {
        display: grid !important;
        grid-template-columns: minmax(68px, 1fr) 56px 56px;
        align-items: center;
        gap: 6px !important;
      }

      #bt-bot-panel .bt-small-number {
        width: 56px !important;
      }

      #bt-bot-panel .bt-unit-limit-grid {
        display: grid !important;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px !important;
      }

      #bt-bot-panel .bt-unit-limit-grid > label {
        min-width: 0;
      }

      #bt-bot-panel .bt-unit-limit-input {
        width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box;
        padding: 0 4px !important;
        text-align: center;
      }

      #bt-bot-panel .bt-timing-inputs {
        display: grid !important;
        grid-template-columns: 56px auto 56px;
        align-items: center;
        gap: 5px !important;
      }

      #bt-bot-panel .bt-panel-section .bt-timing-label {
        color: #d8c6a6 !important;
        font-size: 10.5px !important;
      }

      #bt-bot-panel .bt-panel-toggle {
        padding: 2px 1px;
        color: #c8b49a !important;
        font-size: 11px !important;
      }

      #bt-bot-panel input[type="checkbox"] {
        width: 15px;
        height: 15px;
        accent-color: #c9a36a !important;
        border-radius: 3px;
      }

      #bt-filler-actions {
        padding: 6px;
        border: 1px solid rgba(210, 168, 108, .18);
        border-radius: 12px;
        background: rgba(16, 10, 7, .94);
        box-shadow: 0 16px 42px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255,255,255,.035);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }

      #bt-filler-actions button {
        padding: 8px 14px !important;
        font-size: 11.5px !important;
        min-height: 30px;
      }

      #bt-filler-actions button.is-loading {
        background: linear-gradient(155deg, #6c421a, #3f2a12) !important;
      }

      #bt-filler-actions button.is-success {
        border-color: rgba(82, 158, 112, .48) !important;
        background: linear-gradient(155deg, #1a3f2e, #0f241a) !important;
      }

      /* Panel kendi genisligine gore yeniden dizilir (ekran degil, panel olcusu).
         Kullanici kenardan daralttikca JS bu sinifi ekler -> tek sutun + kompakt. */
      #bt-bot-panel.is-narrow {
        grid-template-columns: 1fr !important;
        column-gap: 0 !important;
        row-gap: 6px !important;
        padding: 9px 11px 8px !important;
      }

      #bt-bot-panel.is-narrow .bt-panel-title {
        font-size: 16px;
      }

      #bt-bot-panel.is-narrow input[type="number"],
      #bt-bot-panel.is-narrow select {
        height: 29px !important;
        font-size: 11.5px !important;
      }

      #bt-bot-panel.is-narrow button,
      #bt-bot-panel.is-narrow #bt-filler-actions button {
        min-height: 30px;
      }

      #bt-bot-panel.is-narrow .bt-panel-section {
        padding: 7px !important;
        gap: 4px !important;
      }

      #bt-bot-panel.is-narrow .bt-floor-shortcuts > div:last-child {
        flex-wrap: wrap;
      }

      #bt-bot-panel.is-narrow .bt-auto-countdowns {
        grid-template-columns: 1fr 1fr;
      }

      @media (max-width: 720px) {
        #bt-bot-panel {
          grid-template-columns: 1fr 1fr !important;
          width: min(560px, calc(100vw - 16px)) !important;
          max-width: calc(100vw - 16px);
        }
      }

      @media (max-width: 520px) {
        #bt-bot-panel {
          left: 8px !important;
          bottom: 8px !important;
          width: min(340px, calc(100vw - 16px)) !important;
          grid-template-columns: 1fr !important;
          max-height: 54vh;
          max-height: min(440px, 54dvh);
          padding: 8px 10px 7px !important;
          row-gap: 5px !important;
          overflow-y: auto;
          overscroll-behavior: contain;
          border-radius: 12px !important;
        }

        .bt-panel-resize-handle {
          width: 48px;
          height: 48px;
        }

        #bt-bot-panel.has-custom-size {
          max-height: min(720px, calc(100dvh - 16px));
        }

        #bt-bot-panel .bt-panel-kicker {
          font-size: 8px;
          letter-spacing: .18em;
        }

        #bt-bot-panel .bt-panel-title {
          font-size: 16px;
        }

        #bt-bot-status {
          padding: 6px 8px !important;
          font-size: 10px !important;
          line-height: 1.3;
        }

        #bt-bot-panel input[type="number"],
        #bt-bot-panel select {
          height: 28px !important;
          padding: 0 8px !important;
          font-size: 11.5px !important;
          border-radius: 7px !important;
        }

        #bt-bot-panel button,
        #bt-filler-actions button {
          min-height: 30px;
        }

        #bt-bot-panel .bt-panel-section {
          padding: 6px !important;
          gap: 4px !important;
          border-radius: 8px;
        }

        #bt-bot-panel .bt-inline-field {
          grid-template-columns: minmax(64px, 1fr) 52px 52px;
          gap: 5px !important;
        }

        #bt-bot-panel .bt-small-number {
          width: 52px !important;
        }

        #bt-bot-panel .bt-auto-countdowns {
          grid-template-columns: 1fr 1fr;
          padding: 5px;
        }

        #bt-bot-panel .bt-timing-inputs {
          grid-template-columns: 52px auto 52px;
          gap: 4px !important;
        }

        #bt-bot-panel .bt-settings-header {
          min-height: 20px;
          font-size: 10.5px !important;
        }

        #bt-filler-actions {
          right: 8px !important;
          bottom: 8px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Panel simge durumundayken gosterilen kucuk yuvarlak buton.
  function renderBotPanelMinimized() {
    const icon = document.createElement('button');
    icon.id = 'bt-bot-panel-mini';
    icon.type = 'button';
    icon.title = 'Kat botu panelini ac';
    icon.textContent = '⚔';
    icon.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'left:20px',
      'z-index:99999',
      'width:38px',
      'height:38px',
      'border-radius:50%',
      'background:#100a08',
      `border:1.5px solid ${isBotEnabled() ? '#5fc89a' : '#d4af77'}`,
      'color:#d4af77',
      'font-size:17px',
      'cursor:pointer',
      'box-shadow:0 6px 16px rgba(0,0,0,0.7)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:0'
    ].join(';');
    icon.onclick = () => {
      setBotPanelMinimized(false);
      renderBotPanel();
    };
    document.body.appendChild(icon);
  }

  let autoCountdownTimer = 0;

  // Oto ayar girdilerini depodaki guncel degerlerle esitleyen kanca. Panel her
  // cizimde yeniden atanir; bot calisirken veya panel yokken null kalir. Amac:
  // bfcache'ten donen ya da arka planda beklemis bir panelin bayat degerleri
  // gostermesini (ve sonraki kayitta depoyu bu bayat degerlerle ezmesini) onlemek.
  let refreshAutoPanelInputs = null;

  function formatAutoCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} dk ${String(seconds).padStart(2, '0')} sn sonra girilecek`;
  }

  function formatOrbCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  }

  function appendAutoCountdowns(panel) {
    if (!isAutoEnabled()) return;
    const selectedRange = autoFloorRange();
    const wrap = document.createElement('section');
    wrap.className = 'bt-auto-countdowns';
    wrap.setAttribute('aria-label', 'Kat grubu giris zamanlari');
    const cards = [];

    for (let band = 0; band < totalAutoBands(); band += 1) {
      const { start: floorStart, end: floorEnd } = bandFloorRange(band);
      if (floorEnd < selectedRange.start || floorStart > selectedRange.end) continue;
      const card = document.createElement('div');
      card.className = 'bt-auto-countdown-card';
      const floor = document.createElement('div');
      floor.className = 'bt-auto-countdown-floor';
      floor.textContent = `Kat ${Math.max(floorStart, selectedRange.start)}-${Math.min(floorEnd, selectedRange.end)}`;
      const value = document.createElement('div');
      value.className = 'bt-auto-countdown-value';
      card.append(floor, value);
      wrap.appendChild(card);
      cards.push({ card, value, band });
    }

    const orbCard = document.createElement('div');
    orbCard.className = 'bt-auto-countdown-card bt-orb-countdown-card';
    const orbLabel = document.createElement('div');
    orbLabel.className = 'bt-auto-countdown-floor';
    orbLabel.textContent = 'Kure toplamaya';
    const orbValue = document.createElement('div');
    orbValue.className = 'bt-auto-countdown-value';
    orbCard.append(orbLabel, orbValue);
    wrap.appendChild(orbCard);

    const update = () => {
      const due = autoBandDueTimes();
      cards.forEach(({ card, value, band }) => {
        const dueAt = Number(due[band] || 0);
        const remaining = dueAt - Date.now();
        card.classList.toggle('is-ready', dueAt > 0 && remaining <= 0);
        if (!dueAt) {
          value.textContent = 'Ilk kontrol bekleniyor';
        } else if (remaining <= 0) {
          value.textContent = 'Simdi kontrol ediliyor';
        } else {
          value.textContent = formatAutoCountdown(remaining);
        }
      });
      try {
        const orb = JSON.parse(localStorage.getItem('BFOrbSettings') || '{}');
        const collectAt = Number(orb.orbCollectAt || 0);
        if (orb.running !== true) {
          orbValue.textContent = 'Orb botu kapali';
          orbCard.classList.remove('is-ready');
        } else if (collectAt > Date.now()) {
          orbValue.textContent = formatOrbCountdown(collectAt - Date.now());
          orbCard.classList.remove('is-ready');
        } else {
          orbValue.textContent = 'Hazir - ilk uygun anda kontrol edilecek';
          orbCard.classList.add('is-ready');
        }
      } catch {
        orbValue.textContent = 'Orb zamani okunamadi';
        orbCard.classList.remove('is-ready');
      }
    };

    update();
    panel.appendChild(wrap);
    autoCountdownTimer = window.setInterval(update, 1000);
  }

  function renderBotPanel() {
    injectBotPanelStyles();
    refreshAutoPanelInputs = null;
    if (autoCountdownTimer) {
      window.clearInterval(autoCountdownTimer);
      autoCountdownTimer = 0;
    }
    const existing = document.querySelector('#bt-bot-panel');
    if (existing) {
      existing.remove();
    }
    const existingMini = document.querySelector('#bt-bot-panel-mini');
    if (existingMini) {
      existingMini.remove();
    }
    const existingResizeHandle = document.querySelector('#bt-bot-panel-resize-handle');
    if (existingResizeHandle) {
      existingResizeHandle.remove();
    }
    if (!isBattleSetupPage() && !isResultPage() && !isFloorPage() && !isBotEnabled()) {
      return;
    }
    if (isBotPanelMinimized()) {
      renderBotPanelMinimized();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'bt-bot-panel';
    panel.style.cssText = [
      'position:fixed',
      'bottom:22px',
      'left:22px',
      'z-index:99999'
    ].join(';');

    const panelHead = document.createElement('div');
    panelHead.className = 'bt-panel-head';
    const panelHeading = document.createElement('div');
    const panelKicker = document.createElement('div');
    panelKicker.className = 'bt-panel-kicker';
    panelKicker.textContent = `BiteFight otomasyon v${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || '?'}`;
    const panelTitle = document.createElement('div');
    panelTitle.className = 'bt-panel-title';
    panelTitle.textContent = 'Kat Kontrolü';
    panelHeading.append(panelKicker, panelTitle);
    const panelDot = document.createElement('span');
    panelDot.className = `bt-panel-dot${isBotEnabled() ? ' is-active' : ''}`;
    panelDot.title = isBotEnabled() ? 'Bot aktif' : 'Bot beklemede';
    const headControls = document.createElement('div');
    headControls.style.cssText = 'display:flex;align-items:center;gap:8px';
    const minimizeBtn = document.createElement('button');
    minimizeBtn.type = 'button';
    minimizeBtn.title = 'Simge durumuna kucult';
    minimizeBtn.textContent = '–';
    minimizeBtn.style.cssText = 'background:transparent;border:none;color:#c9a46d;font-size:18px;line-height:1;cursor:pointer;padding:0 3px;box-shadow:none';
    minimizeBtn.onclick = () => {
      setBotPanelMinimized(true);
      renderBotPanel();
    };
    headControls.append(panelDot, minimizeBtn);
    panelHead.append(panelHeading, headControls);
    panel.appendChild(panelHead);

    const status = document.createElement('div');
    status.id = 'bt-bot-status';
    status.style.cssText = 'color:#d8c7a6;font-size:11px';
    status.textContent = GM_getValue('btBotStatus', 'Kat botu hazir');
    panel.appendChild(status);

    appendAutoCountdowns(panel);

    appendFloorShortcuts(panel);

    const recheckBtn = buildActionButton('Sureleri yeniden kontrol et', 'padding:6px 12px;font-size:12px;background:#1a2f4f');
    recheckBtn.title = 'Kayitli bekleme sayaclarini sifirlar ve kat surelerini bu sunucudan yeniden okur (sunucu degistirince kullan)';
    recheckBtn.onclick = () => {
      recheckFloorTimers();
    };
    panel.appendChild(recheckBtn);

    if (isBotEnabled()) {
      const modeLabel = document.createElement('div');
      modeLabel.className = 'bt-panel-mode';
      modeLabel.style.cssText = 'color:#ffd700;font-size:12px;font-weight:bold';
      modeLabel.textContent = isAutoEnabled() ? '⟳ Oto kat modu aktif' : '▶ Manuel kat botu aktif';
      panel.appendChild(modeLabel);

      const stopBtn = buildActionButton(isAutoEnabled() ? 'Oto Modu Durdur' : 'Botu Durdur', 'padding:8px 14px;font-size:13px');
      stopBtn.onclick = () => {
        stopBot('kullanici durdurdu');
      };
      panel.appendChild(stopBtn);
    } else {
      const startWrap = document.createElement('div');
      startWrap.className = 'bt-panel-section bt-start-section';
      startWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';

      const row = document.createElement('div');
      row.className = 'bt-panel-row';
      row.style.cssText = 'display:flex;gap:6px;align-items:center';

      const startInput = document.createElement('input');
      startInput.type = 'number';
      startInput.min = '1';
      startInput.placeholder = 'Kat';
      startInput.style.cssText = 'width:100%';
      const detected = detectSelectedStage() || GM_getValue(BOT_NEXT_STAGE_KEY, 0);
      if (detected) {
        startInput.value = String(detected);
      }

      const stopInput = document.createElement('input');
      stopInput.type = 'number';
      stopInput.min = '0';
      stopInput.placeholder = 'Son kat';
      stopInput.title = 'Varsayilan: icinde bulunulan onluk dilimin sonu (or. 23 -> 30)';
      stopInput.style.cssText = startInput.style.cssText;

      // Son kat varsayilani: baslangic katinin onluk dilim sonu (23->30, 31->40, 1->10).
      // Baslangic degistikce otomatik guncellenir; kullanici sonradan elle degistirebilir.
      const blockEndOf = (stage) => Math.ceil(stage / 10) * 10;
      const syncStopToStart = () => {
        const startStage = Number.parseInt(startInput.value, 10);
        stopInput.value = Number.isInteger(startStage) && startStage > 0 ? String(blockEndOf(startStage)) : '';
      };
      syncStopToStart();
      startInput.addEventListener('input', syncStopToStart);

      row.appendChild(startInput);
      row.appendChild(stopInput);
      startWrap.appendChild(row);

      const startBtn = buildActionButton('Botu Baslat', 'padding:6px 12px;font-size:12px');
      startBtn.onclick = () => {
        const startStage = Number.parseInt(startInput.value, 10);
        if (!Number.isInteger(startStage) || startStage < 1) {
          setBotStatus('Gecerli bir baslangic kati gir');
          return;
        }
        const stopStage = Number.parseInt(stopInput.value, 10);
        startBot(startStage, Number.isInteger(stopStage) && stopStage > 0 ? stopStage : 0);
      };
      startWrap.appendChild(startBtn);
      panel.appendChild(startWrap);

      // --- Oto kat modu ---
      const autoWrap = document.createElement('div');
      autoWrap.className = 'bt-panel-section';
      autoWrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;flex-direction:column;gap:4px';

      const savedAutoRange = autoFloorRange();
      const autoFloorRow = document.createElement('label');
      autoFloorRow.className = 'bt-inline-field';
      autoFloorRow.style.cssText = 'display:flex;gap:4px;align-items:center;color:#c8b49a;font-size:10.5px';
      const autoFloorText = document.createElement('span');
      autoFloorText.textContent = 'Kat araligi:';
      const autoStartInput = document.createElement('input');
      autoStartInput.type = 'number';
      autoStartInput.min = String(AUTO_MIN_FLOOR);
      autoStartInput.max = String(AUTO_MAX_FLOOR);
      autoStartInput.value = String(savedAutoRange.start);
      autoStartInput.title = 'Oto taramanin baslayacagi kat';
      autoStartInput.className = 'bt-small-number';
      autoStartInput.style.cssText = '';
      const autoEndInput = document.createElement('input');
      autoEndInput.type = 'number';
      autoEndInput.min = String(AUTO_MIN_FLOOR);
      autoEndInput.max = String(AUTO_MAX_FLOOR);
      autoEndInput.value = String(savedAutoRange.end);
      autoEndInput.title = 'Oto taramanin bitecegi kat';
      autoEndInput.style.cssText = autoStartInput.style.cssText;
      autoEndInput.className = autoStartInput.className;
      autoFloorRow.append(autoFloorText, autoStartInput, autoEndInput);
      autoWrap.appendChild(autoFloorRow);

      const activeHours = autoActiveHours();
      const autoHoursRow = document.createElement('label');
      autoHoursRow.className = 'bt-inline-field';
      autoHoursRow.style.cssText = autoFloorRow.style.cssText;
      const autoHoursText = document.createElement('span');
      autoHoursText.textContent = 'Istanbul saati:';
      const autoHoursStartInput = document.createElement('input');
      autoHoursStartInput.type = 'time';
      autoHoursStartInput.value = activeHours.start;
      autoHoursStartInput.style.cssText = 'width:76px';
      const autoHoursEndInput = document.createElement('input');
      autoHoursEndInput.type = 'time';
      autoHoursEndInput.value = activeHours.end;
      autoHoursEndInput.style.cssText = autoHoursStartInput.style.cssText;
      const autoHoursExtraText = document.createElement('span');
      autoHoursExtraText.textContent = '+dk:';
      const autoHoursExtraInput = document.createElement('input');
      autoHoursExtraInput.type = 'number';
      autoHoursExtraInput.min = '0';
      autoHoursExtraInput.max = '180';
      autoHoursExtraInput.step = '1';
      autoHoursExtraInput.className = 'bt-small-number';
      autoHoursExtraInput.value = String(autoActiveExtraMinutes());
      autoHoursExtraInput.title = 'Baslama ve bitis saatine gunluk 0-bu deger dk arasi rastgele sure eklenir (or. 10 -> 07:02 yerine 07:02-07:12 arasi baslar). 0 = kapali';
      autoHoursRow.append(autoHoursText, autoHoursStartInput, autoHoursEndInput, autoHoursExtraText, autoHoursExtraInput);
      autoWrap.appendChild(autoHoursRow);

      // Bant satirlari (yenilenme sonrasi rastgele ek dk) yalnizca su an secili kat
      // araligina denk gelen bantlar icin gosterilir (or. 1-50 secince 1-10..41-50
      // gorunur). bandInputs bant NO'suna gore anahtarlanir (dizideki konuma gore degil)
      // ki gizli bantlarin ayarlari kaybolmasin/ezilmesin.
      const bandRowsWrap = document.createElement('div');
      bandRowsWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px';
      autoWrap.appendChild(bandRowsWrap);
      let bandInputs = {};

      const visibleBandRange = () => {
        const typedStart = Number.parseInt(autoStartInput.value, 10);
        const typedEnd = Number.parseInt(autoEndInput.value, 10);
        const fallback = autoFloorRange();
        const start = Number.isInteger(typedStart)
          ? Math.min(AUTO_MAX_FLOOR, Math.max(AUTO_MIN_FLOOR, typedStart)) : fallback.start;
        const end = Number.isInteger(typedEnd)
          ? Math.min(AUTO_MAX_FLOOR, Math.max(AUTO_MIN_FLOOR, typedEnd)) : fallback.end;
        return { start, end: Math.max(start, end) };
      };

      const renderBandRows = () => {
        bandRowsWrap.innerHTML = '';
        bandInputs = {};
        const { start, end } = visibleBandRange();
        const currentRanges = autoBandRanges();
        for (let band = floorBandIndex(start); band <= floorBandIndex(end); band += 1) {
          const { start: bandStart, end: bandEnd } = bandFloorRange(band);
          const range = currentRanges[band] || { min: 5, max: 15 };
          const bandRow = document.createElement('label');
          bandRow.className = 'bt-inline-field';
          bandRow.style.cssText = autoFloorRow.style.cssText;
          const bandText = document.createElement('span');
          bandText.textContent = `${bandStart}-${bandEnd} yenilenme sonrasi (dk):`;
          const minInput = document.createElement('input');
          minInput.type = 'number';
          minInput.min = '1';
          minInput.value = String(range.min);
          minInput.className = 'bt-small-number';
          const maxInput = document.createElement('input');
          maxInput.type = 'number';
          maxInput.min = '1';
          maxInput.value = String(range.max);
          maxInput.className = 'bt-small-number';
          bandInputs[band] = { minInput, maxInput };
          bandRow.append(bandText, minInput, maxInput);
          bandRowsWrap.appendChild(bandRow);
          bindPersist(minInput, band);
          bindPersist(maxInput, band);
        }
      };

      const autoIntervalRow = document.createElement('label');
      autoIntervalRow.className = 'bt-inline-field';
      autoIntervalRow.style.cssText = 'display:flex;gap:4px;align-items:center;color:#c8b49a;font-size:10.5px';
      const autoIntervalText = document.createElement('span');
      autoIntervalText.textContent = 'Yeniden deneme (sn):';
      const savedAutoInterval = autoIntervalRange();
      const autoIntervalMinInput = document.createElement('input');
      autoIntervalMinInput.type = 'number';
      autoIntervalMinInput.min = String(AUTO_MIN_INTERVAL_SEC);
      autoIntervalMinInput.step = '1';
      autoIntervalMinInput.className = 'bt-small-number';
      autoIntervalMinInput.style.cssText = '';
      autoIntervalMinInput.value = String(savedAutoInterval.min);
      autoIntervalMinInput.title = 'En az beklenecek saniye';
      const autoIntervalMaxInput = document.createElement('input');
      autoIntervalMaxInput.type = 'number';
      autoIntervalMaxInput.min = String(AUTO_MIN_INTERVAL_SEC);
      autoIntervalMaxInput.step = '1';
      autoIntervalMaxInput.style.cssText = autoIntervalMinInput.style.cssText;
      autoIntervalMaxInput.className = autoIntervalMinInput.className;
      autoIntervalMaxInput.value = String(savedAutoInterval.max);
      autoIntervalMaxInput.title = 'En fazla beklenecek saniye';
      autoIntervalRow.append(autoIntervalText, autoIntervalMinInput, autoIntervalMaxInput);
      autoWrap.appendChild(autoIntervalRow);

      // Oto ayarlarini degisiklik aninda ALAN BAZINDA kaydet. Eski surum her tus
      // vurusunda TUM alanlari girdilerden okuyup yaziyordu; panel bayatsa
      // (bfcache'ten geri donus, ikinci sekme, yeniden cizim) diger alanlarin
      // eski degerleri depoyu eziyordu. Ayrica yalnizca eski tekil anahtarlara
      // yazip snapshot'i guncellemedigi icin panel yeniden cizilince yazilanlar
      // geri donuyordu (okuma snapshot'i tercih eder). Simdi her dinleyici
      // sadece kendi alanini dogrular ve guncel snapshot'in ustune isler.
      const persistAutoField = (field) => {
        const patch = {};
        if (field === 'floors') {
          const autoStart = Number.parseInt(autoStartInput.value, 10);
          const autoEnd = Number.parseInt(autoEndInput.value, 10);
          if (!Number.isInteger(autoStart) || !Number.isInteger(autoEnd)
            || autoStart < AUTO_MIN_FLOOR || autoEnd > AUTO_MAX_FLOOR || autoStart > autoEnd) return;
          GM_setValue(AUTO_START_FLOOR_KEY, autoStart);
          GM_setValue(AUTO_END_FLOOR_KEY, autoEnd);
          patch.start = autoStart;
          patch.end = autoEnd;
        } else if (field === 'hours') {
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(autoHoursStartInput.value)
            || !/^([01]\d|2[0-3]):[0-5]\d$/.test(autoHoursEndInput.value)) return;
          GM_setValue(AUTO_ACTIVE_START_KEY, autoHoursStartInput.value);
          GM_setValue(AUTO_ACTIVE_END_KEY, autoHoursEndInput.value);
          patch.activeStart = autoHoursStartInput.value;
          patch.activeEnd = autoHoursEndInput.value;
        } else if (field === 'extra') {
          const extraMinutes = Number.parseInt(autoHoursExtraInput.value, 10);
          if (!Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 180) return;
          GM_setValue(AUTO_ACTIVE_EXTRA_KEY, extraMinutes);
          patch.activeExtra = extraMinutes;
        } else if (field === 'interval') {
          const intervalMin = Number.parseInt(autoIntervalMinInput.value, 10);
          const intervalMax = Number.parseInt(autoIntervalMaxInput.value, 10);
          if (!Number.isInteger(intervalMin) || !Number.isInteger(intervalMax)
            || intervalMin < AUTO_MIN_INTERVAL_SEC || intervalMin > intervalMax) return;
          GM_setValue(AUTO_INTERVAL_MIN_KEY, intervalMin);
          GM_setValue(AUTO_INTERVAL_MAX_KEY, intervalMax);
          patch.intervalMin = intervalMin;
          patch.intervalMax = intervalMax;
        } else if (typeof field === 'number') {
          const { minInput, maxInput } = bandInputs[field];
          const min = Number.parseInt(minInput.value, 10);
          const max = Number.parseInt(maxInput.value, 10);
          if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) return;
          // Diger bantlari depodaki guncel degerlerinden al; yalnizca duzenlenen
          // banti degistir. Boylece bayat girdiler diger bantlari ezemez.
          const merged = autoBandRanges();
          merged[field] = { min, max };
          GM_setValue(AUTO_BAND_RANGES_KEY, JSON.stringify(merged));
          patch.bandRanges = merged;
        }
        saveAutoSettingsSnapshot({ ...autoSettingsSnapshot(), ...patch });
      };
      const bindPersist = (input, field) => {
        // 'change' blur bekler; panel bot akisinda her an yeniden cizilebildigi
        // icin yazilan deger blur'dan once kaybolabiliyordu. 'input' ile her tus
        // vurusunda kaydet (gecersiz ara degerler persistAutoField'da elenir).
        input.addEventListener('change', () => persistAutoField(field));
        input.addEventListener('input', () => persistAutoField(field));
      };
      bindPersist(autoStartInput, 'floors');
      bindPersist(autoEndInput, 'floors');
      bindPersist(autoHoursStartInput, 'hours');
      bindPersist(autoHoursEndInput, 'hours');
      bindPersist(autoHoursExtraInput, 'extra');
      bindPersist(autoIntervalMinInput, 'interval');
      bindPersist(autoIntervalMaxInput, 'interval');
      // Ilk cizim: su anki kat araligina denk gelen bant satirlarini olustur.
      renderBandRows();
      // Kat araligi degistikce (or. 40 -> 50) gorunur bant listesini de guncelle,
      // boylece yeni acilan 41-50 bandi icin de rastgele bekleme alani belirir.
      autoStartInput.addEventListener('input', renderBandRows);
      autoEndInput.addEventListener('input', renderBandRows);

      // Panel gorunur olunca girdileri depodaki guncel degerlerle esitle.
      // Kullanici panel icinde yaziyorsa dokunma; yazilani ezmeyelim.
      refreshAutoPanelInputs = () => {
        const active = document.activeElement;
        if (active && panel.contains(active)) return;
        const range = autoFloorRange();
        autoStartInput.value = String(range.start);
        autoEndInput.value = String(range.end);
        const hours = autoActiveHours();
        autoHoursStartInput.value = hours.start;
        autoHoursEndInput.value = hours.end;
        autoHoursExtraInput.value = String(autoActiveExtraMinutes());
        renderBandRows();
        const interval = autoIntervalRange();
        autoIntervalMinInput.value = String(interval.min);
        autoIntervalMaxInput.value = String(interval.max);
      };

      // Tum oto ayarlarini dogrulayip GM'e yazar. Gecersiz alan varsa durum
      // mesajiyla bildirir ve null doner; gecerliyse {start, end} doner.
      const saveAutoSettingsFromInputs = () => {
        const autoStart = Number.parseInt(autoStartInput.value, 10);
        const autoEnd = Number.parseInt(autoEndInput.value, 10);
        if (!Number.isInteger(autoStart) || !Number.isInteger(autoEnd)
          || autoStart < AUTO_MIN_FLOOR || autoEnd > AUTO_MAX_FLOOR || autoStart > autoEnd) {
          setBotStatus(`Oto kat araligi ${AUTO_MIN_FLOOR}-${AUTO_MAX_FLOOR} icinde ve baslangic bitisten kucuk olmali`);
          return null;
        }
        const intervalMin = Number.parseInt(autoIntervalMinInput.value, 10);
        const intervalMax = Number.parseInt(autoIntervalMaxInput.value, 10);
        if (!Number.isInteger(intervalMin) || !Number.isInteger(intervalMax)
          || intervalMin < AUTO_MIN_INTERVAL_SEC || intervalMin > intervalMax) {
          setBotStatus(`Yeniden deneme araligi en az ${AUTO_MIN_INTERVAL_SEC} sn olmali ve minimum maksimumdan buyuk olmamali`);
          return null;
        }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(autoHoursStartInput.value)
          || !/^([01]\d|2[0-3]):[0-5]\d$/.test(autoHoursEndInput.value)) {
          setBotStatus('Gecerli Istanbul baslangic ve bitis saati gir');
          return null;
        }
        // Yalnizca su an ekranda gorunen bantlari guncelle; gizli bantlarin kayitli
        // degerleri (autoBandRanges() ile alinan tam liste) korunur.
        const bandRanges = autoBandRanges();
        for (const [bandKey, { minInput, maxInput }] of Object.entries(bandInputs)) {
          const min = Number.parseInt(minInput.value, 10);
          const max = Number.parseInt(maxInput.value, 10);
          if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) {
            setBotStatus('Kat grubu beklemelerinde minimum 1 dk olmali ve maksimum minimumdan kucuk olmamali');
            return null;
          }
          bandRanges[Number(bandKey)] = { min, max };
        }
        const extraMinutes = Number.parseInt(autoHoursExtraInput.value, 10);
        GM_setValue(AUTO_START_FLOOR_KEY, autoStart);
        GM_setValue(AUTO_END_FLOOR_KEY, autoEnd);
        GM_setValue(AUTO_INTERVAL_MIN_KEY, intervalMin);
        GM_setValue(AUTO_INTERVAL_MAX_KEY, intervalMax);
        GM_setValue(AUTO_ACTIVE_START_KEY, autoHoursStartInput.value);
        GM_setValue(AUTO_ACTIVE_END_KEY, autoHoursEndInput.value);
        GM_setValue(AUTO_ACTIVE_EXTRA_KEY, Number.isInteger(extraMinutes) && extraMinutes >= 0 && extraMinutes <= 180 ? extraMinutes : 0);
        GM_setValue(AUTO_BAND_RANGES_KEY, JSON.stringify(bandRanges));
        // Guncel snapshot'in ustune isle: formda olmayan/ileride eklenecek
        // alanlar kaybolmasin, baska sekmenin yazdiklari silinmesin.
        saveAutoSettingsSnapshot({
          ...autoSettingsSnapshot(),
          start: autoStart,
          end: autoEnd,
          intervalMin,
          intervalMax,
          activeStart: autoHoursStartInput.value,
          activeEnd: autoHoursEndInput.value,
          activeExtra: Number.isInteger(extraMinutes) && extraMinutes >= 0 && extraMinutes <= 180 ? extraMinutes : 0,
          bandRanges
        });
        return { start: autoStart, end: autoEnd };
      };

      const saveBtn = buildActionButton('Ayarlari Kaydet', 'padding:6px 12px;font-size:12px');
      saveBtn.title = 'Yukaridaki oto kat ayarlarini botu baslatmadan kaydeder';
      saveBtn.onclick = () => {
        const saved = saveAutoSettingsFromInputs();
        if (saved) {
          setBotStatus(`Oto kat ayarlari kaydedildi (kat ${saved.start}-${saved.end})`);
        }
      };
      autoWrap.appendChild(saveBtn);

      const autoBtn = buildActionButton('Oto Kat Modu Baslat', 'padding:6px 12px;font-size:12px;background:#0a3a1a');
      autoBtn.classList.add('bt-auto-button');
      autoBtn.title = 'Secilen kat araligini sirayla tarar; girilebilen katlari tamamlar, tur bitince bekleyip ilk kattan tekrar dener';
      autoBtn.onclick = () => {
        const saved = saveAutoSettingsFromInputs();
        if (!saved) {
          return;
        }
        startAuto(saved.start, saved.end);
      };
      autoWrap.appendChild(autoBtn);
      panel.appendChild(autoWrap);
    }

    const reviveRow = document.createElement('label');
    reviveRow.className = 'bt-panel-toggle';
    reviveRow.style.cssText = 'display:flex;gap:5px;align-items:center;color:#c8b49a;font-size:11px;cursor:pointer';
    const reviveCheckbox = document.createElement('input');
    reviveCheckbox.type = 'checkbox';
    reviveCheckbox.checked = isReviveEnabled();
    reviveCheckbox.style.cssText = 'accent-color:#ffd700;margin:0';
    reviveCheckbox.onchange = () => {
      GM_setValue(BOT_REVIVE_KEY, reviveCheckbox.checked);
      setBotStatus(reviveCheckbox.checked
        ? 'Olen birimler hayata dondurulecek'
        : 'Diriltme kapali: olenler dondurulmeden devam edilecek');
    };
    const reviveLabel = document.createElement('span');
    reviveLabel.textContent = 'Olen birimleri hayata dondur';
    reviveRow.append(reviveCheckbox, reviveLabel);
    panel.appendChild(reviveRow);

    const reviveBandsWrap = document.createElement('div');
    reviveBandsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 4px 18px';
    reviveBandsWrap.title = 'Isaretli olmayan kat gruplarinda olen birimler hayata dondurulmez';
    const reviveBandFlagsNow = reviveBandFlags();
    for (let band = 0; band < totalAutoBands(); band += 1) {
      const { start: bandStart, end: bandEnd } = bandFloorRange(band);
      const bandLabel = document.createElement('label');
      bandLabel.style.cssText = 'display:flex;gap:3px;align-items:center;color:#c8b49a;font-size:10px;cursor:pointer;background:#2a2118;border:1px solid #4a3d2a;border-radius:3px;padding:2px 5px';
      const bandCheckbox = document.createElement('input');
      bandCheckbox.type = 'checkbox';
      bandCheckbox.checked = reviveBandFlagsNow[band] !== false;
      bandCheckbox.style.cssText = 'accent-color:#ffd700;margin:0';
      bandCheckbox.onchange = () => {
        const flags = reviveBandFlags();
        flags[band] = bandCheckbox.checked;
        GM_setValue(BOT_REVIVE_BANDS_KEY, JSON.stringify(flags));
        setBotStatus(`Kat ${bandStart}-${bandEnd}: diriltme ${bandCheckbox.checked ? 'acik' : 'kapali'}`);
      };
      const bandText = document.createElement('span');
      bandText.textContent = `${bandStart}-${bandEnd}`;
      bandLabel.append(bandCheckbox, bandText);
      reviveBandsWrap.appendChild(bandLabel);
    }
    panel.appendChild(reviveBandsWrap);

    const reminderRow = document.createElement('label');
    reminderRow.className = 'bt-panel-toggle';
    reminderRow.style.cssText = 'display:flex;gap:5px;align-items:center;color:#c8b49a;font-size:11px;cursor:pointer';
    const reminderCheckbox = document.createElement('input');
    reminderCheckbox.type = 'checkbox';
    reminderCheckbox.checked = isReminderEnabled();
    reminderCheckbox.style.cssText = 'accent-color:#ffd700;margin:0';
    reminderCheckbox.onchange = () => {
      GM_setValue(REMINDER_ENABLED_KEY, reminderCheckbox.checked);
      setBotStatus(reminderCheckbox.checked
        ? 'Kat suresi dolunca Telegram bildirimi gonderilecek (kat 1/11/21/31)'
        : 'Kat suresi bildirimi kapali');
    };
    const reminderLabel = document.createElement('span');
    reminderLabel.textContent = 'Kat suresi dolunca Telegram bildirimi';
    reminderRow.append(reminderCheckbox, reminderLabel);
    panel.appendChild(reminderRow);

    appendWinRateSetting(panel);
    appendRoundingModeSetting(panel);
    appendTekilV2Setting(panel);
    appendTimingSettings(panel);

    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'bt-bot-panel-resize-handle';
    resizeHandle.className = 'bt-panel-resize-handle';
    resizeHandle.tabIndex = 0;
    resizeHandle.setAttribute('role', 'button');
    resizeHandle.setAttribute('aria-label', 'Paneli yeniden boyutlandir');
    resizeHandle.title = 'Surukleyerek paneli boyutlandir';

    document.body.appendChild(panel);
    document.body.appendChild(resizeHandle);
    applyAndTrackPanelSize(panel);
    enableBotPanelResize(panel, resizeHandle);
  }

  // Panelin kendi genisligine gore tek/cift sutun yerlesimini ayarlar.
  function updateBotPanelDensity(panel, width) {
    panel.classList.toggle('is-narrow', width > 0 && width < BOT_PANEL_NARROW_WIDTH);
  }

  function enableBotPanelResize(panel, handle) {
    let dragState = null;
    let animationFrame = 0;
    let pendingSize = null;

    const updateHandlePosition = () => {
      const rect = panel.getBoundingClientRect();
      handle.style.left = `${Math.round(rect.right - handle.offsetWidth)}px`;
      handle.style.top = `${Math.round(rect.bottom - handle.offsetHeight)}px`;
    };

    const limits = () => {
      const rect = panel.getBoundingClientRect();
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 520;
      const maxWidth = Math.max(1, Math.min(BOT_PANEL_MAX_DESKTOP_WIDTH, window.innerWidth - rect.left - 8));
      const maxHeight = Math.max(1, Math.min(720, rect.bottom - 8));
      return {
        minWidth: Math.min(coarsePointer ? BOT_PANEL_TOUCH_MIN_WIDTH : BOT_PANEL_MIN_WIDTH, maxWidth),
        minHeight: Math.min(BOT_PANEL_MIN_HEIGHT, maxHeight),
        maxWidth,
        maxHeight
      };
    };

    const applySize = (size) => {
      panel.classList.add('has-custom-size');
      panel.style.setProperty('width', `${Math.round(size.width)}px`, 'important');
      panel.style.height = `${Math.round(size.height)}px`;
      updateBotPanelDensity(panel, size.width);
      updateHandlePosition();
    };

    const scheduleSize = (size) => {
      pendingSize = size;
      if (animationFrame) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        if (pendingSize) {
          applySize(pendingSize);
          pendingSize = null;
        }
      });
    };

    const finishResize = (event) => {
      if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) {
        return;
      }
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      if (pendingSize) {
        applySize(pendingSize);
        pendingSize = null;
      }
      try {
        if (typeof handle.releasePointerCapture === 'function') {
          handle.releasePointerCapture(dragState.pointerId);
        }
      } catch {
        // Pointer yakalama tarayici tarafindan zaten sonlandirilmis olabilir.
      }
      dragState = null;
      panel.classList.remove('is-resizing');
      handle.classList.remove('is-active');
      const rect = panel.getBoundingClientRect();
      setBotPanelSize(rect.width, rect.height);
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: rect.width,
        height: rect.height
      };
      if (typeof handle.setPointerCapture === 'function') {
        handle.setPointerCapture(event.pointerId);
      }
      panel.classList.add('is-resizing');
      handle.classList.add('is-active');
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      event.preventDefault();
      const currentLimits = limits();
      scheduleSize({
        width: Math.min(currentLimits.maxWidth, Math.max(currentLimits.minWidth, dragState.width + event.clientX - dragState.startX)),
        height: Math.min(currentLimits.maxHeight, Math.max(currentLimits.minHeight, dragState.height - event.clientY + dragState.startY))
      });
    });

    handle.addEventListener('pointerup', finishResize);
    handle.addEventListener('pointercancel', finishResize);

    handle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const currentLimits = limits();
      const step = event.shiftKey ? 32 : 12;
      const widthDelta = event.key === 'ArrowLeft' ? -step : (event.key === 'ArrowRight' ? step : 0);
      const heightDelta = event.key === 'ArrowUp' ? step : (event.key === 'ArrowDown' ? -step : 0);
      applySize({
        width: Math.min(currentLimits.maxWidth, Math.max(currentLimits.minWidth, rect.width + widthDelta)),
        height: Math.min(currentLimits.maxHeight, Math.max(currentLimits.minHeight, rect.height + heightDelta))
      });
      const finalRect = panel.getBoundingClientRect();
      setBotPanelSize(finalRect.width, finalRect.height);
    });

    updateHandlePosition();
    if (typeof ResizeObserver === 'function') {
      const positionObserver = new ResizeObserver(updateHandlePosition);
      positionObserver.observe(panel);
    }
  }

  // Kayitli genislik+yuksekligi uygular ve kullanicinin kenardan yaptigi
  // yeniden boyutlandirmayi (iki yonde de) saklar. Sayfa gecislerinde son
  // boyut korunur; boylece her seferinde yeniden ayarlamak gerekmez.
  function applyAndTrackPanelSize(panel) {
    const saved = getBotPanelSize();
    const viewportWidthLimit = Math.max(BOT_PANEL_MIN_WIDTH, window.innerWidth - 36);
    if (saved.width >= BOT_PANEL_MIN_WIDTH) {
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 520;
      const minimumWidth = Math.min(coarsePointer ? BOT_PANEL_TOUCH_MIN_WIDTH : BOT_PANEL_MIN_WIDTH, viewportWidthLimit);
      const width = Math.max(minimumWidth, Math.min(saved.width, BOT_PANEL_MAX_DESKTOP_WIDTH, viewportWidthLimit));
      panel.style.setProperty('width', `${width}px`, 'important');
      updateBotPanelDensity(panel, width);
    }
    if (saved.height >= BOT_PANEL_MIN_HEIGHT) {
      const viewportHeightLimit = Math.max(BOT_PANEL_MIN_HEIGHT, window.innerHeight - 44);
      const height = Math.min(saved.height, viewportHeightLimit);
      panel.classList.add('has-custom-size');
      panel.style.height = `${height}px`;
    }
    if (typeof ResizeObserver !== 'function') {
      return;
    }
    let saveTimer = 0;
    // Acilis sirasindaki yerlesim oturana kadarki olcumleri kaydetme; yalnizca
    // kullanicinin kenardan cekmesiyle olusan gercek boyut degisimlerini sakla.
    const mountedAt = Date.now();
    const observer = new ResizeObserver(() => {
      const rect = panel.getBoundingClientRect();
      // Sutun yerlesimini aninda guncelle (kaydetmeden bagimsiz).
      updateBotPanelDensity(panel, rect.width);
      if (Date.now() - mountedAt < 800) {
        return;
      }
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      // Kullanici tutup birakana kadar bekle, sonra son boyutu kaydet.
      saveTimer = setTimeout(() => {
        const finalRect = panel.getBoundingClientRect();
        if (finalRect.width >= BOT_PANEL_MIN_WIDTH) {
          const width = Math.min(finalRect.width, BOT_PANEL_MAX_DESKTOP_WIDTH);
          // Yukseklik yalnizca kullanici elle ayarlamissa (inline stil varsa) kaydedilir;
          // aksi halde icerige gore degisen yukseklik sabitlenmesin diye 0 saklanir.
          const userSetHeight = panel.style.height ? finalRect.height : 0;
          setBotPanelSize(width, userSetHeight);
        }
      }, 320);
    });
    observer.observe(panel);
  }

  // Panele "Kazanma orani" secimi ekler: bot yalnizca bu oranin uzerindeki
  // (guvenli) cozumleri doldurur. Hazir kademeler + elle giris.
  function appendWinRateSetting(panel) {
    const wrap = document.createElement('div');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;flex-direction:column;gap:4px';

    const label = document.createElement('span');
    label.textContent = 'Kazanma orani (min)';
    label.style.cssText = 'color:#c8b49a;font-size:10.5px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:center';

    const select = document.createElement('select');
    select.style.cssText = 'flex:1;height:31px;padding:0 8px;border-radius:8px;border:1px solid rgba(210,168,108,.35);background:#18120e;color:#f5e9d2;font-size:11.5px';
    BOT_WIN_RATE_PRESETS.forEach((percent) => {
      const option = document.createElement('option');
      option.value = String(percent);
      option.textContent = percent === 99.5 ? '%99.5 (varsayilan)' : `%${percent}`;
      select.appendChild(option);
    });
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Ozel';
    select.appendChild(customOption);

    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.min = '1';
    customInput.max = '100';
    customInput.step = '0.1';
    customInput.className = 'bt-small-number';
    customInput.style.cssText = 'width:52px';

    const currentPercent = Math.round(getBotMinWinRate() * 1000) / 10;
    const matchedPreset = BOT_WIN_RATE_PRESETS.find((percent) => Math.abs(percent - currentPercent) < 1e-6);
    if (matchedPreset !== undefined) {
      select.value = String(matchedPreset);
      customInput.value = String(matchedPreset);
      customInput.style.display = 'none';
    } else {
      select.value = 'custom';
      customInput.value = String(currentPercent);
      customInput.style.display = '';
    }

    const applyPercent = (percent) => {
      if (!Number.isFinite(percent)) {
        return;
      }
      const clamped = Math.min(100, Math.max(1, percent));
      setBotMinWinRate(clamped / 100);
      setBotStatus(`Kazanma orani esigi %${clamped} olarak ayarlandi`);
    };

    select.onchange = () => {
      if (select.value === 'custom') {
        customInput.style.display = '';
        applyPercent(Number(customInput.value));
      } else {
        customInput.style.display = 'none';
        customInput.value = select.value;
        applyPercent(Number(select.value));
      }
    };
    customInput.onchange = () => {
      applyPercent(Number(customInput.value));
    };

    row.append(select, customInput);
    wrap.append(label, row);
    panel.appendChild(wrap);
  }

  function appendRoundingModeSetting(panel) {
    const wrap = document.createElement('label');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;flex-direction:column;gap:4px';

    const label = document.createElement('span');
    label.textContent = 'Tarama hesap modu';
    label.style.cssText = 'color:#c8b49a;font-size:10.5px';

    const select = document.createElement('select');
    select.style.cssText = 'width:100%;height:31px;padding:0 8px;border-radius:8px;border:1px solid rgba(210,168,108,.35);background:#18120e;color:#f5e9d2;font-size:11.5px';
    Object.entries(BOT_ROUNDING_MODES).forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    });
    select.value = getBotRoundingMode();
    select.onchange = () => {
      const mode = setBotRoundingMode(select.value);
      setBotStatus(`Tarama hesap modu: ${BOT_ROUNDING_MODES[mode]}`);
    };

    wrap.append(label, select);
    panel.appendChild(wrap);
  }

  function appendTekilV2Setting(panel) {
    const wrap = document.createElement('label');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;align-items:center;gap:6px;cursor:pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isBotTekilV2Enabled();
    checkbox.style.cssText = 'width:14px;height:14px;accent-color:#c9a46d;cursor:pointer';

    const label = document.createElement('span');
    label.textContent = 'Tekil v2 modu';
    label.style.cssText = 'color:#c8b49a;font-size:10.5px';
    label.title = 'Acikken arama, kayip desenini oncelikli kiyaslar (quick.html Tekil v2 esdegeri). Kapatirsan duz en-az-kayip aramasi yapilir.';

    checkbox.onchange = () => {
      const enabled = setBotTekilV2Enabled(checkbox.checked);
      setBotStatus(`Tekil v2 modu ${enabled ? 'acildi' : 'kapatildi'}`);
    };

    wrap.append(checkbox, label);
    panel.appendChild(wrap);
  }

  // Panele acilip kapanan "Bekleme Ayarlari" bolumu: her parametre icin min-max (sn).
  function appendTimingSettings(panel) {
    const timing = loadBotTiming();
    const unitLimits = loadBotUnitLimits();
    const wrap = document.createElement('div');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;flex-direction:column;gap:5px';

    const isOpen = () => GM_getValue(BOT_SETTINGS_OPEN_KEY, false) === true;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'bt-settings-header';
    header.style.cssText = 'background:transparent;border:none;color:#c9a46d;font-size:11px;font-weight:700;cursor:pointer;padding:0;display:flex;align-items:center;gap:4px;width:100%;text-align:left';

    const body = document.createElement('div');
    body.style.cssText = 'flex-direction:column;gap:5px';

    const inputStyle = '';
    const fieldInputs = {};
    BOT_TIMING_FIELDS.forEach((field) => {
      const fieldRow = document.createElement('div');
      fieldRow.style.cssText = 'display:flex;flex-direction:column;gap:2px';

      const label = document.createElement('span');
      label.textContent = `${field.label} (sn)`;
      label.className = 'bt-timing-label';
      label.style.cssText = 'color:#d8c6a6;font-size:10px';

      const inputs = document.createElement('div');
      inputs.className = 'bt-timing-inputs';
      inputs.style.cssText = 'display:flex;gap:4px;align-items:center';

      const minInput = document.createElement('input');
      minInput.type = 'number';
      minInput.min = '0';
      minInput.step = '0.1';
      minInput.className = 'bt-small-number';
      minInput.style.cssText = inputStyle;
      minInput.value = String(timing[field.key].min);

      const sep = document.createElement('span');
      sep.textContent = '-';
      sep.style.cssText = 'color:#ffd700';

      const maxInput = document.createElement('input');
      maxInput.type = 'number';
      maxInput.min = '0';
      maxInput.step = '0.1';
      maxInput.className = 'bt-small-number';
      maxInput.style.cssText = inputStyle;
      maxInput.value = String(timing[field.key].max);

      inputs.append(minInput, sep, maxInput);
      fieldRow.append(label, inputs);
      body.appendChild(fieldRow);
      fieldInputs[field.key] = { minInput, maxInput };
    });

    const unitLimitsLabel = document.createElement('span');
    unitLimitsLabel.textContent = 'Kullanilabilecek birlik limiti';
    unitLimitsLabel.style.cssText = 'color:#d8c6a6;font-size:10px;margin-top:3px';
    body.appendChild(unitLimitsLabel);

    const unitLimitGrid = document.createElement('div');
    unitLimitGrid.className = 'bt-unit-limit-grid';
    const unitLimitInputs = [];
    BOT_UNIT_LIMIT_DEFAULTS.forEach((fallback, index) => {
      const field = document.createElement('label');
      field.style.cssText = 'display:flex;flex-direction:column;gap:2px;color:#c8b49a;font-size:9.5px';
      const caption = document.createElement('span');
      caption.textContent = `T${index + 1}`;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.className = 'bt-unit-limit-input';
      input.value = String(unitLimits[index] ?? fallback);
      input.title = `Bot T${index + 1} biriminden en fazla bu kadar kullanabilir`;
      field.append(caption, input);
      unitLimitGrid.appendChild(field);
      unitLimitInputs.push(input);
    });
    body.appendChild(unitLimitGrid);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:4px';
    const saveBtn = buildActionButton('Kaydet', 'padding:5px 10px;font-size:11px');
    const resetBtn = buildActionButton('Varsayilan', 'padding:5px 10px;font-size:11px;background:#3a0a0a');
    resetBtn.classList.add('bt-secondary-button');
    actions.append(saveBtn, resetBtn);
    body.appendChild(actions);

    const syncHeader = () => {
      header.textContent = `${isOpen() ? '▾' : '▸'} Bekleme Ayarlari`;
      body.style.display = isOpen() ? 'flex' : 'none';
    };
    syncHeader();

    header.onclick = () => {
      GM_setValue(BOT_SETTINGS_OPEN_KEY, !isOpen());
      syncHeader();
    };

    saveBtn.onclick = () => {
      const next = {};
      BOT_TIMING_FIELDS.forEach((field) => {
        let min = Number(fieldInputs[field.key].minInput.value);
        let max = Number(fieldInputs[field.key].maxInput.value);
        if (!Number.isFinite(min) || min < 0) {
          min = field.min;
        }
        if (!Number.isFinite(max) || max < 0) {
          max = field.max;
        }
        if (min > max) {
          [min, max] = [max, min];
        }
        next[field.key] = { min, max };
      });
      saveBotTiming(next);
      saveBotUnitLimits(unitLimitInputs.map((input, index) => {
        const value = Number(input.value);
        return Number.isInteger(value) && value >= 0 ? value : BOT_UNIT_LIMIT_DEFAULTS[index];
      }));
      GM_setValue(BOT_SETTINGS_OPEN_KEY, false);
      setBotStatus('Bekleme ayarlari ve birlik limitleri kaydedildi');
      renderBotPanel();
    };

    resetBtn.onclick = () => {
      BOT_TIMING_FIELDS.forEach((field) => {
        fieldInputs[field.key].minInput.value = String(field.min);
        fieldInputs[field.key].maxInput.value = String(field.max);
      });
      BOT_UNIT_LIMIT_DEFAULTS.forEach((value, index) => {
        unitLimitInputs[index].value = String(value);
      });
    };

    wrap.append(header, body);
    panel.appendChild(wrap);
  }
  // ====================== /KAT BOTU ======================

  // Panele kat 1 / 11 / 21 / 31'e hizli gecis baglantilari ekler (yan yana).
  // Tiklayinca ilgili katin sayfasina gider (buildFloorUrl ile dogru page+layerId).
  function appendFloorShortcuts(panel) {
    const wrap = document.createElement('div');
    wrap.className = 'bt-panel-section bt-floor-shortcuts';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    const label = document.createElement('span');
    label.textContent = 'Katlara git';
    label.style.cssText = 'color:#c8b49a;font-size:10.5px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center';

    [1, 11, 21, 31].forEach((stage) => {
      const link = document.createElement('a');
      link.href = buildFloorUrl(stage);
      link.textContent = `Kat ${stage}`;
      link.title = `Kat ${stage} sayfasina git`;
      link.style.cssText = [
        'flex:1',
        'text-align:center',
        'background:#18120e',
        'color:#f4e6c3',
        'border:1px solid rgba(210,168,108,.42)',
        'padding:6px 4px',
        'border-radius:9px',
        'font-size:11.5px',
        'font-weight:700',
        'cursor:pointer',
        'text-decoration:none',
        'white-space:nowrap'
      ].join(';');
      row.appendChild(link);
    });

    wrap.append(label, row);
    panel.appendChild(wrap);
  }

  function buildActionButton(label, extraStyle) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = [
      'background:#4f1c18',
      'color:#f4e6c3',
      'border:1px solid rgba(210,168,108,.42)',
      'padding:6px 12px',
      'border-radius:9px',
      'font-size:12px',
      'font-weight:700',
      'cursor:pointer',
      'box-shadow:0 6px 14px rgba(0,0,0,.5)',
      extraStyle || ''
    ].join(';');
    return button;
  }

  function injectButtons() {
    if (document.querySelector('#bt-filler-actions')) return;
    if (!document.querySelector('.stepBtn')) return;
    injectBotPanelStyles();

    const panel = document.createElement('div');
    panel.id = 'bt-filler-actions';
    panel.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:99999',
      'display:flex',
      'gap:10px',
      'align-items:center'
    ].join(';');

    const fillBtn = buildActionButton('BT Doldur', '');
    fillBtn.id = 'bt-filler-btn';

    fillBtn.onclick = async () => {
      const raw = GM_getValue('btUnits', null);
      if (!raw) {
        fillBtn.textContent = 'Veri yok! bt-analiz ac';
        setTimeout(() => {
          fillBtn.textContent = 'BT Doldur';
        }, 2500);
        return;
      }

      const targets = JSON.parse(raw);
      fillBtn.textContent = 'Dolduruluyor...';
      fillBtn.classList.add('is-loading');
      fillBtn.style.background = '#8a4b00';
      fillBtn.style.borderColor = '#ffd27a';
      fillBtn.style.color = '#fff4db';
      fillBtn.disabled = true;

      // Manuel doldurmada harcanan tas otomatik takip edilmez; arsivde "-" gosterilsin.
      GM_setValue(LAST_REVIVE_STONES_KEY, '');

      try {
        await createArchiveRecord('fill', { targets, preferTargets: true });
      } catch (error) {
        console.error('Otomatik arsiv kaydi olusturulamadi.', error);
      }

      await fillUnits(targets);

      fillBtn.textContent = 'Tamamlandi!';
      fillBtn.classList.remove('is-loading');
      fillBtn.classList.add('is-success');
      fillBtn.style.background = '#1a6b2a';
      setTimeout(() => {
        fillBtn.textContent = 'BT Doldur';
        fillBtn.classList.remove('is-success');
        fillBtn.style.background = '#6b0000';
        fillBtn.disabled = false;
      }, 3000);
    };

    panel.appendChild(fillBtn);
    document.body.appendChild(panel);
  }

  function watchLootPage() {
    let syncTimer = 0;
    const attemptSync = async () => {
      try {
        await syncLootResultToLastArchive();
      } catch (error) {
        console.error(error);
      }
    };
    const scheduleSync = () => {
      window.clearTimeout(syncTimer);
      // Sonuc sayfasi kademeli yuklenebiliyor; botun #showReviveBtn'i gorup
      // harcanan tasi yazmasina firsat vermeden arsivi "0" ile kapatma.
      syncTimer = window.setTimeout(attemptSync, 1200);
    };

    if (document.querySelector('.lootItemsDiv')) {
      scheduleSync();
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector('.lootItemsDiv')) {
        return;
      }
      scheduleSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  injectButtons();
  watchFightSubmission();
  watchLootPage();
  new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });

  // Sekme one gelince / bfcache'ten geri donunce oto ayar girdilerini depoyla
  // esitle: bot gezinirken ya da baska sekmede kaydedilen degerler, bayat
  // girdiler uzerinden bir sonraki kayitta ezilmesin.
  window.addEventListener('pageshow', () => { refreshAutoPanelInputs?.(); });
  window.addEventListener('focus', () => { refreshAutoPanelInputs?.(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAutoPanelInputs?.();
  });

  // Kat botu: panel + sayfa yerlestikten sonra tek tetik.
  window.setTimeout(() => {
    try {
      renderBotPanel();
    } catch (error) {
      console.error('Kat botu paneli kurulamadi', error);
    }
    void runBotTick();
  }, 700);
})();


(function () {
    'use strict';

    const STORAGE_KEY = 'bfGrotteLoopStateV1';
    const PANEL_ID = 'bf-grotte-loop-panel';
    const DEFAULT_CONFIG = {
        minDelay: 700,
        maxDelay: 1200,
        maxRuns: null,
        minHealth: 0,
        minEnergy: 0,
        minGold: 0,
        wakeHoldSec: 0
    };
    const DEBUG = true;

    function getConfig(state = loadState()) {
        const merged = {
            ...DEFAULT_CONFIG,
            ...(state.config || {})
        };

        const minDelay = Number.isFinite(merged.minDelay) ? Math.max(0, merged.minDelay) : DEFAULT_CONFIG.minDelay;
        const maxDelay = Number.isFinite(merged.maxDelay) ? Math.max(minDelay, merged.maxDelay) : DEFAULT_CONFIG.maxDelay;
        const maxRuns = Number.isFinite(merged.maxRuns) && merged.maxRuns > 0 ? Math.floor(merged.maxRuns) : null;
        const minHealth = Number.isFinite(merged.minHealth) ? Math.max(0, Math.floor(merged.minHealth)) : 0;
        const minEnergy = Number.isFinite(merged.minEnergy) ? Math.max(0, Math.floor(merged.minEnergy)) : 0;
        const minGold = Number.isFinite(merged.minGold) ? Math.max(0, Math.floor(merged.minGold)) : 0;
        const wakeHoldSec = Number.isFinite(merged.wakeHoldSec) ? Math.max(0, Math.floor(merged.wakeHoldSec)) : 0;

        return {
            minDelay,
            maxDelay,
            maxRuns,
            minHealth,
            minEnergy,
            minGold,
            wakeHoldSec
        };
    }

    function randomDelay(state = loadState()) {
        const config = getConfig(state);
        return config.minDelay + Math.random() * (config.maxDelay - config.minDelay);
    }

    function debugLog(...args) {
        if (DEBUG) {
            console.log('[Grotte Loop]', ...args);
        }
    }

    function normalizeText(value) {
        return (value || '')
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function loadState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (error) {
            console.warn('[Grotte Loop] State okunamadi, sifirlaniyor.', error);
            return {};
        }
    }

    function saveState(nextState) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    }

    function updateState(patch) {
        const nextState = { ...loadState(), ...patch };
        saveState(nextState);
        refreshPanel();
        return nextState;
    }

    function clearState() {
        localStorage.removeItem(STORAGE_KEY);
        releaseWakeLock();
        refreshPanel();
    }

    // Bot calisirken ekranin kararip kapanmasini onler. Wake Lock bazi mobil
    // tarayicilarda sayfa gecislerinde duser; fallback'ler kullanici etkilesimiyle
    // baslatilir ve bot durana kadar canli tutulur.
    let wakeLockSentinel = null;
    let wakeFallbackVideo = null;
    let wakeFallbackCanvas = null;
    let wakeFallbackTimer = null;
    let wakeAudioContext = null;
    let wakeHeartbeatTimer = null;
    let wakeReleaseTimer = null;
    let wakeLockRequestPending = false;

    function isLoopEnabled() {
        return loadState().enabled === true;
    }

    // Bot acikken veya bot durduktan sonra "wakeHoldSec" penceresi icindeyken
    // ekran uyanik tutulur; pencere kapaninca kilit birakilir ve telefonun
    // kendi ekran zaman asimi devreye girer.
    function shouldHoldWakeLock() {
        const state = loadState();
        if (state.enabled === true) {
            return true;
        }
        const holdMs = getConfig(state).wakeHoldSec * 1000;
        return holdMs > 0
            && Number.isFinite(state.lastStoppedAt)
            && Date.now() - state.lastStoppedAt < holdMs;
    }

    function startWakeFallbacks() {
        if (!shouldHoldWakeLock() || document.visibilityState !== 'visible') {
            return;
        }

        try {
            if (!wakeFallbackVideo && HTMLCanvasElement.prototype.captureStream) {
                wakeFallbackCanvas = document.createElement('canvas');
                wakeFallbackCanvas.width = 2;
                wakeFallbackCanvas.height = 2;
                const context = wakeFallbackCanvas.getContext('2d');
                let tick = 0;

                wakeFallbackTimer = window.setInterval(() => {
                    if (!shouldHoldWakeLock()) {
                        releaseWakeLock();
                        return;
                    }
                    context.fillStyle = tick % 2 ? '#000' : '#111';
                    context.fillRect(0, 0, 2, 2);
                    tick += 1;
                }, 1000);

                wakeFallbackVideo = document.createElement('video');
                wakeFallbackVideo.muted = true;
                wakeFallbackVideo.loop = true;
                wakeFallbackVideo.playsInline = true;
                wakeFallbackVideo.setAttribute('playsinline', 'playsinline');
                wakeFallbackVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px;';
                wakeFallbackVideo.srcObject = wakeFallbackCanvas.captureStream(1);
                document.documentElement.appendChild(wakeFallbackVideo);
            }

            if (wakeFallbackVideo && wakeFallbackVideo.paused) {
                void wakeFallbackVideo.play().catch(() => {});
            }
        } catch (error) {
            debugLog('Video wake fallback baslatilamadi:', error);
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
            if (wakeAudioContext?.state === 'suspended') {
                void wakeAudioContext.resume().catch(() => {});
            }
        } catch (error) {
            debugLog('Audio wake fallback baslatilamadi:', error);
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
            if (!shouldHoldWakeLock()) {
                releaseWakeLock();
                return;
            }
            if (document.visibilityState !== 'visible') {
                return;
            }
            startWakeFallbacks();
            if (navigator.wakeLock && typeof navigator.wakeLock.request === 'function'
                && (!wakeLockSentinel || wakeLockSentinel.released)) {
                void acquireWakeLock();
            }
        }, 8000);
    }

    async function acquireWakeLock() {
        if (!shouldHoldWakeLock() || document.visibilityState !== 'visible') {
            return;
        }
        startWakeFallbacks();
        startWakeHeartbeat();
        if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
            return;
        }
        if (wakeLockRequestPending || (wakeLockSentinel && !wakeLockSentinel.released)) {
            return;
        }

        wakeLockRequestPending = true;
        try {
            const sentinel = await navigator.wakeLock.request('screen');
            // Istek beklerken bot durmus olabilir; eskimis kilidi hemen birak,
            // yoksa script kapaliyken ekran sonsuza kadar acik kalir.
            if (!shouldHoldWakeLock() || (wakeLockSentinel && !wakeLockSentinel.released)) {
                try {
                    void sentinel.release();
                } catch {
                    // Kilit zaten birakilmis olabilir.
                }
                return;
            }
            wakeLockSentinel = sentinel;
            wakeLockSentinel.addEventListener?.('release', () => {
                if (wakeLockSentinel === sentinel) {
                    wakeLockSentinel = null;
                }
                // Sistem kilidi dusurdu; kilit hala tutulmali ve sayfa gorunurse
                // hemen geri al. Kisa gecikme art arda istek dongusunu onler.
                if (shouldHoldWakeLock() && document.visibilityState === 'visible') {
                    window.setTimeout(() => { void acquireWakeLock(); }, 500);
                }
            });
        } catch (error) {
            console.warn('[Grotte Loop] Ekran uyanik tutulamadi.', error);
        } finally {
            wakeLockRequestPending = false;
        }
    }

    function releaseWakeLock() {
        try {
            wakeLockSentinel?.release();
        } catch {
            // Kilit tarayici tarafindan daha once birakilmis olabilir.
        }
        wakeLockSentinel = null;

        if (wakeReleaseTimer) {
            window.clearTimeout(wakeReleaseTimer);
            wakeReleaseTimer = null;
        }
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

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            void acquireWakeLock();
        }
    });

    window.addEventListener('online', () => {
        if (shouldHoldWakeLock()) {
            void acquireWakeLock();
        }
    });

    ['click', 'touchstart', 'pointerdown', 'keydown'].forEach(eventName => {
        document.addEventListener(eventName, () => {
            if (shouldHoldWakeLock()) {
                startWakeFallbacks();
                void acquireWakeLock();
            }
        }, true);
    });

    function delay(ms, callback) {
        window.setTimeout(() => {
            if (!isLoopEnabled()) {
                if (!shouldHoldWakeLock()) {
                    releaseWakeLock();
                }
                return;
            }
            void acquireWakeLock();
            callback();
        }, ms);
    }

    function getClickableElements() {
        return Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"]'));
    }

    function parseNumber(text) {
        const digits = (text || '').replace(/[^\d]/g, '');
        return digits ? parseInt(digits, 10) : null;
    }

    function collectRatioPairs(sourceText) {
        const matches = Array.from((sourceText || '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)\s*\/\s*(\d{1,3}(?:\.\d{3})+|\d+)/g));
        return matches
            .map(match => ({
                current: parseNumber(match[1]),
                max: parseNumber(match[2]),
                raw: match[0]
            }))
            .filter(item => item.current !== null && item.max !== null && item.current <= item.max);
    }

    function getStatusSourceText() {
        const infobar = document.getElementById('infobar');
        if (infobar && infobar.textContent) {
            return infobar.textContent;
        }

        return document.body ? document.body.innerText : '';
    }

    function findCurrentEnergy() {
        const parsed = collectRatioPairs(getStatusSourceText())
            .filter(item => item.max >= 50 && item.max <= 500)
            .sort((a, b) => b.max - a.max);

        if (parsed.length === 0) {
            return null;
        }

        debugLog(`Enerji bulundu: ${parsed[0].raw}`);
        return parsed[0].current;
    }

    function findCurrentHealth() {
        const parsed = collectRatioPairs(getStatusSourceText())
            .sort((a, b) => b.max - a.max);

        if (parsed.length === 0) {
            return null;
        }

        debugLog(`Can bulundu: ${parsed[0].raw}`);
        return parsed[0].current;
    }

    function getCurrentReportId() {
        const match = location.pathname.match(/\/report\/fightreport\/(\d+)\/grotte/);
        return match ? match[1] : null;
    }

    function findLootGold() {
        const sourceText = normalizeText(document.body ? document.body.innerText : '');
        const match = sourceText.match(/alinan ganimet.*?([\d.]+)\s*altin/);
        return match ? parseNumber(match[1]) : null;
    }

    function getElementLabel(element) {
        return normalizeText(
            element.textContent ||
            element.value ||
            element.getAttribute('title') ||
            element.getAttribute('aria-label')
        );
    }

    function getDifficultyOptions() {
        const options = [];

        for (const element of getClickableElements()) {
            const label = getElementLabel(element);

            if (label === 'kolay' || label === 'orta' || label === 'zor') {
                options.push({
                    key: label,
                    element
                });
            }
        }

        return options;
    }

    function findDifficultyOption(difficulty) {
        return getDifficultyOptions().find(option => option.key === normalizeText(difficulty)) || null;
    }

    function findBackButton() {
        const candidates = getClickableElements();

        return candidates.find(element => {
            const label = getElementLabel(element);
            return label === 'geri';
        }) || null;
    }

    function clickElement(element, reason) {
        if (!element) {
            return false;
        }

        debugLog(`${reason} tiklaniyor.`);
        element.click();
        return true;
    }

    function isGrottePage() {
        return /\/city\/grotte(?:\/.*)?$/.test(location.pathname);
    }

    function isFightReportPage() {
        return /\/report\/fightreport\/.+\/grotte/.test(location.pathname);
    }

    function stopLoop(reason = 'manuel') {
        updateState({
            enabled: false,
            expectDifficultyClick: false,
            stopReason: reason,
            lastStoppedAt: Date.now()
        });
        scheduleWakeLockRelease();
        debugLog(`Dongu durduruldu. Sebep: ${reason}`);
    }

    // Bot durunca kilidi ya hemen ya da ayarlanan sure sonunda birakir; boylece
    // telefonun kendi ekran zaman asimi yeniden devreye girer.
    function scheduleWakeLockRelease() {
        if (wakeReleaseTimer) {
            window.clearTimeout(wakeReleaseTimer);
            wakeReleaseTimer = null;
        }

        const holdMs = getConfig().wakeHoldSec * 1000;
        if (holdMs <= 0) {
            releaseWakeLock();
            return;
        }

        debugLog(`Ekran kilidi ${holdMs / 1000} sn sonra birakilacak.`);
        wakeReleaseTimer = window.setTimeout(() => {
            wakeReleaseTimer = null;
            if (!isLoopEnabled()) {
                releaseWakeLock();
            }
        }, holdMs);
    }

    function startLoop(difficulty) {
        const normalizedDifficulty = normalizeText(difficulty);
        const valid = ['kolay', 'orta', 'zor'];

        if (!valid.includes(normalizedDifficulty)) {
            console.warn('[Grotte Loop] Gecerli zorluklar: kolay, orta, zor');
            return false;
        }

        updateState({
            enabled: true,
            difficulty: normalizedDifficulty,
            expectDifficultyClick: isGrottePage(),
            lastUpdatedAt: Date.now(),
            completedRuns: 0,
            lastCountedReportId: null,
            lastLootGold: null,
            stopReason: null
        });

        void acquireWakeLock();
        debugLog(`Dongu baslatildi. Zorluk: ${normalizedDifficulty}`);

        if (isGrottePage()) {
            queueDifficultyClick(normalizedDifficulty);
        }

        return true;
    }

    function setConfig(patch) {
        const nextState = loadState();
        nextState.config = {
            ...getConfig(nextState),
            ...patch
        };

        saveState(nextState);
        debugLog('Ayarlar guncellendi:', nextState.config);
        refreshPanel();
        return nextState.config;
    }

    function setDelay(minDelay, maxDelay = minDelay) {
        const parsedMin = Number(minDelay);
        const parsedMax = Number(maxDelay);

        if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax)) {
            console.warn('[Grotte Loop] Gecikme sayi olmali.');
            return false;
        }

        setConfig({
            minDelay: Math.max(0, parsedMin),
            maxDelay: Math.max(Math.max(0, parsedMin), parsedMax)
        });
        return true;
    }

    function setMaxRuns(maxRuns) {
        if (maxRuns === null || maxRuns === undefined || Number(maxRuns) <= 0) {
            setConfig({ maxRuns: null });
            return true;
        }

        const parsed = Number(maxRuns);
        if (!Number.isFinite(parsed)) {
            console.warn('[Grotte Loop] maxRuns sayi olmali.');
            return false;
        }

        setConfig({ maxRuns: Math.floor(parsed) });
        return true;
    }

    function setMinHealth(minHealth) {
        const parsed = Number(minHealth);
        if (!Number.isFinite(parsed)) {
            console.warn('[Grotte Loop] minHealth sayi olmali.');
            return false;
        }

        setConfig({ minHealth: Math.max(0, Math.floor(parsed)) });
        return true;
    }

    function setMinEnergy(minEnergy) {
        const parsed = Number(minEnergy);
        if (!Number.isFinite(parsed)) {
            console.warn('[Grotte Loop] minEnergy sayi olmali.');
            return false;
        }

        setConfig({ minEnergy: Math.max(0, Math.floor(parsed)) });
        return true;
    }

    function setMinGold(minGold) {
        const parsed = Number(minGold);
        if (!Number.isFinite(parsed)) {
            console.warn('[Grotte Loop] minGold sayi olmali.');
            return false;
        }

        setConfig({ minGold: Math.max(0, Math.floor(parsed)) });
        return true;
    }

    function configure(options = {}) {
        const patch = {};

        if (Object.prototype.hasOwnProperty.call(options, 'minDelay')) {
            patch.minDelay = Math.max(0, Number(options.minDelay) || 0);
        }
        if (Object.prototype.hasOwnProperty.call(options, 'maxDelay')) {
            patch.maxDelay = Math.max(0, Number(options.maxDelay) || 0);
        }
        if (Object.prototype.hasOwnProperty.call(options, 'maxRuns')) {
            const parsed = Number(options.maxRuns);
            patch.maxRuns = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
        }
        if (Object.prototype.hasOwnProperty.call(options, 'minHealth')) {
            patch.minHealth = Math.max(0, Math.floor(Number(options.minHealth) || 0));
        }
        if (Object.prototype.hasOwnProperty.call(options, 'minEnergy')) {
            patch.minEnergy = Math.max(0, Math.floor(Number(options.minEnergy) || 0));
        }
        if (Object.prototype.hasOwnProperty.call(options, 'minGold')) {
            patch.minGold = Math.max(0, Math.floor(Number(options.minGold) || 0));
        }
        if (Object.prototype.hasOwnProperty.call(options, 'wakeHoldSec')) {
            patch.wakeHoldSec = Math.max(0, Math.floor(Number(options.wakeHoldSec) || 0));
        }

        if (Object.keys(patch).length === 0) {
            return getConfig();
        }

        if (patch.minDelay !== undefined && patch.maxDelay !== undefined && patch.maxDelay < patch.minDelay) {
            patch.maxDelay = patch.minDelay;
        }

        return setConfig(patch);
    }

    function exposeApi() {
        window.bfGrotteLoop = {
            start: startLoop,
            stop: stopLoop,
            status: () => loadState(),
            config: () => getConfig(),
            configure,
            setDelay,
            setMaxRuns,
            setMinHealth,
            setMinEnergy,
            setMinGold,
            reset: () => {
                clearState();
                debugLog('State temizlendi.');
            }
        };
    }

    function getDefaultPanelPosition() {
        return {
            top: window.innerHeight,
            left: window.innerWidth
        };
    }

    function applyPanelPosition(panel, position) {
        const width = panel.offsetWidth || 280;
        const height = panel.offsetHeight || 360;
        const top = Math.max(8, Math.min(position.top, window.innerHeight - height - 8));
        const left = Math.max(8, Math.min(position.left, window.innerWidth - width - 8));

        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.right = 'auto';
    }

    function savePanelPosition(position) {
        const nextState = loadState();
        nextState.panelPosition = position;
        saveState(nextState);
    }

    function enablePanelDragging(panel, handle) {
        handle.style.cursor = 'move';
        let dragState = null;

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) {
                return;
            }

            const rect = panel.getBoundingClientRect();
            dragState = {
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top
            };

            handle.setPointerCapture(event.pointerId);
            panel.dataset.dragging = '1';
            event.preventDefault();
        });

        handle.addEventListener('pointermove', event => {
            if (!dragState) {
                return;
            }

            applyPanelPosition(panel, {
                left: event.clientX - dragState.offsetX,
                top: event.clientY - dragState.offsetY
            });
        });

        function stopDragging(event) {
            if (!dragState) {
                return;
            }

            try {
                handle.releasePointerCapture(event.pointerId);
            } catch (error) {
                debugLog('Pointer capture birakilamadi.', error);
            }

            dragState = null;
            panel.dataset.dragging = '0';
            savePanelPosition({
                top: parseFloat(panel.style.top) || getDefaultPanelPosition().top,
                left: parseFloat(panel.style.left) || getDefaultPanelPosition().left
            });
        }

        handle.addEventListener('pointerup', stopDragging);
        handle.addEventListener('pointercancel', stopDragging);
    }

    function injectPanelStyles() {
        if (document.getElementById('bf-grotte-loop-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'bf-grotte-loop-styles';
        style.textContent = `
            #${PANEL_ID} {
                display: block !important;
                position: fixed !important;
                z-index: 99999 !important;
                width: 280px !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 14px !important;
                float: none !important;
                clear: both !important;
                background: linear-gradient(180deg, rgba(26, 14, 14, 0.96), rgba(12, 8, 8, 0.96)) !important;
                border: 1px solid #8b1e1e !important;
                border-radius: 10px !important;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255, 80, 80, 0.05) !important;
                color: #f2f2f2 !important;
                font-family: 'Segoe UI', Tahoma, Verdana, sans-serif !important;
                font-size: 12px !important;
                line-height: 1.4 !important;
                text-align: left !important;
                backdrop-filter: blur(6px) !important;
                -webkit-backdrop-filter: blur(6px) !important;
            }
            #${PANEL_ID} *,
            #${PANEL_ID} *::before,
            #${PANEL_ID} *::after {
                box-sizing: border-box !important;
                font-family: inherit !important;
                float: none !important;
                position: static !important;
            }
            #${PANEL_ID} .bf-title::before {
                position: static !important;
            }
            #${PANEL_ID} .bf-title {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                margin: 0 0 12px 0 !important;
                padding: 0 0 10px 0 !important;
                border-bottom: 1px solid rgba(139, 30, 30, 0.45) !important;
                font-size: 14px !important;
                font-weight: 700 !important;
                letter-spacing: 0.3px !important;
                color: #ffb0b0 !important;
                user-select: none !important;
                cursor: move !important;
            }
            #${PANEL_ID} .bf-title::before {
                content: '' !important;
                width: 8px !important;
                height: 8px !important;
                background: #d8434f !important;
                border-radius: 50% !important;
                box-shadow: 0 0 8px rgba(216, 67, 79, 0.7) !important;
                flex: 0 0 auto !important;
            }
            #${PANEL_ID} .bf-field {
                display: grid !important;
                grid-template-columns: 86px 1fr !important;
                align-items: center !important;
                gap: 8px !important;
                width: 100% !important;
                clear: both !important;
                margin: 0 0 6px 0 !important;
                padding: 0 !important;
                font-size: 12px !important;
                font-weight: normal !important;
                color: #c8c8c8 !important;
            }
            #${PANEL_ID} .bf-field-label {
                margin: 0 !important;
                padding: 0 !important;
                color: #c8c8c8 !important;
                font-weight: 500 !important;
                white-space: nowrap !important;
            }
            #${PANEL_ID} .bf-input,
            #${PANEL_ID} .bf-select {
                width: 100% !important;
                height: 28px !important;
                margin: 0 !important;
                padding: 4px 8px !important;
                background: #1a1212 !important;
                border: 1px solid #5a1f1f !important;
                border-radius: 5px !important;
                color: #f2f2f2 !important;
                font-size: 12px !important;
                line-height: 1.2 !important;
                outline: none !important;
                box-shadow: none !important;
                transition: border-color 0.15s ease, background 0.15s ease !important;
                appearance: none !important;
                -webkit-appearance: none !important;
                -moz-appearance: textfield !important;
            }
            #${PANEL_ID} .bf-input:focus,
            #${PANEL_ID} .bf-select:focus {
                border-color: #d8434f !important;
                background: #221717 !important;
            }
            #${PANEL_ID} .bf-input::-webkit-outer-spin-button,
            #${PANEL_ID} .bf-input::-webkit-inner-spin-button {
                -webkit-appearance: none !important;
                margin: 0 !important;
            }
            #${PANEL_ID} .bf-select {
                padding-right: 26px !important;
                background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3e%3cpath fill='%23d8434f' d='M2 4l4 4 4-4z'/%3e%3c/svg%3e") !important;
                background-repeat: no-repeat !important;
                background-position: right 8px center !important;
                background-size: 10px !important;
            }
            #${PANEL_ID} .bf-row {
                display: flex !important;
                flex-wrap: nowrap !important;
                width: 100% !important;
                clear: both !important;
                gap: 6px !important;
                margin: 10px 0 0 0 !important;
                padding: 0 !important;
            }
            #${PANEL_ID} .bf-button {
                flex: 1 1 0 !important;
                height: 32px !important;
                margin: 0 !important;
                padding: 0 10px !important;
                background: #2a1c1c !important;
                border: 1px solid #5a1f1f !important;
                border-radius: 5px !important;
                color: #f2f2f2 !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                line-height: 1 !important;
                letter-spacing: 0.2px !important;
                text-transform: none !important;
                text-shadow: none !important;
                cursor: pointer !important;
                outline: none !important;
                box-shadow: none !important;
                transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease !important;
                appearance: none !important;
                -webkit-appearance: none !important;
            }
            #${PANEL_ID} .bf-button:hover {
                background: #3a2424 !important;
                border-color: #8b1e1e !important;
            }
            #${PANEL_ID} .bf-button:active {
                transform: translateY(1px) !important;
            }
            #${PANEL_ID} .bf-button.bf-primary {
                background: linear-gradient(180deg, #a82828, #7a1c1c) !important;
                border-color: #c83838 !important;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
            }
            #${PANEL_ID} .bf-button.bf-primary:hover {
                background: linear-gradient(180deg, #c03030, #8e2020) !important;
            }
            #${PANEL_ID} .bf-button.bf-ghost {
                background: transparent !important;
                border-style: dashed !important;
                color: #d8d8d8 !important;
            }
            #${PANEL_ID} .bf-button.bf-ghost:hover {
                background: rgba(139, 30, 30, 0.18) !important;
                border-style: solid !important;
            }
            #${PANEL_ID} .bf-status {
                display: block !important;
                width: 100% !important;
                clear: both !important;
                margin: 12px 0 0 0 !important;
                padding: 8px 10px !important;
                background: rgba(0, 0, 0, 0.3) !important;
                border: 1px solid #3a1414 !important;
                border-radius: 5px !important;
                font-size: 11px !important;
                line-height: 1.7 !important;
                color: #d0d0d0 !important;
            }
            #${PANEL_ID} .bf-status strong {
                color: #ffd0d0 !important;
                font-weight: 600 !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function createField(labelText, control) {
        const wrapper = document.createElement('label');
        wrapper.className = 'bf-field';

        const label = document.createElement('span');
        label.className = 'bf-field-label';
        label.textContent = labelText;

        const isSelect = control.tagName === 'SELECT';
        control.classList.add(isSelect ? 'bf-select' : 'bf-input');

        wrapper.appendChild(label);
        wrapper.appendChild(control);
        return wrapper;
    }

    function createButton(text, onClick, variant = 'default') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.className = 'bf-button';
        if (variant === 'primary') {
            button.classList.add('bf-primary');
        } else if (variant === 'ghost') {
            button.classList.add('bf-ghost');
        }
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    function applyPanelConfig() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) {
            return null;
        }

        const difficulty = panel.querySelector('[data-role="difficulty"]')?.value || 'kolay';
        const minDelay = Number(panel.querySelector('[data-role="minDelay"]')?.value || 0);
        const maxDelay = Number(panel.querySelector('[data-role="maxDelay"]')?.value || 0);
        const maxRunsValue = panel.querySelector('[data-role="maxRuns"]')?.value || '';
        const minHealth = Number(panel.querySelector('[data-role="minHealth"]')?.value || 0);
        const minEnergy = Number(panel.querySelector('[data-role="minEnergy"]')?.value || 0);
        const minGold = Number(panel.querySelector('[data-role="minGold"]')?.value || 0);
        const wakeHoldSec = Number(panel.querySelector('[data-role="wakeHoldSec"]')?.value || 0);

        configure({
            minDelay,
            maxDelay,
            maxRuns: maxRunsValue === '' ? null : Number(maxRunsValue),
            minHealth,
            minEnergy,
            minGold,
            wakeHoldSec
        });

        updateState({ difficulty });
        return difficulty;
    }

    function createControlPanel() {
        if (document.getElementById(PANEL_ID)) {
            return;
        }

        injectPanelStyles();

        const panel = document.createElement('div');
        panel.id = PANEL_ID;

        const title = document.createElement('div');
        title.className = 'bf-title';
        title.textContent = 'Grotte Loop';
        panel.appendChild(title);
        enablePanelDragging(panel, title);

        const difficultySelect = document.createElement('select');
        difficultySelect.dataset.role = 'difficulty';
        ['kolay', 'orta', 'zor'].forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            difficultySelect.appendChild(option);
        });
        panel.appendChild(createField('Zorluk', difficultySelect));

        const minDelayInput = document.createElement('input');
        minDelayInput.dataset.role = 'minDelay';
        minDelayInput.type = 'number';
        minDelayInput.min = '0';
        panel.appendChild(createField('Min ms', minDelayInput));

        const maxDelayInput = document.createElement('input');
        maxDelayInput.dataset.role = 'maxDelay';
        maxDelayInput.type = 'number';
        maxDelayInput.min = '0';
        panel.appendChild(createField('Max ms', maxDelayInput));

        const maxRunsInput = document.createElement('input');
        maxRunsInput.dataset.role = 'maxRuns';
        maxRunsInput.type = 'number';
        maxRunsInput.min = '0';
        maxRunsInput.placeholder = 'sinirsiz';
        panel.appendChild(createField('Max tur', maxRunsInput));

        const minHealthInput = document.createElement('input');
        minHealthInput.dataset.role = 'minHealth';
        minHealthInput.type = 'number';
        minHealthInput.min = '0';
        panel.appendChild(createField('Min can', minHealthInput));

        const minEnergyInput = document.createElement('input');
        minEnergyInput.dataset.role = 'minEnergy';
        minEnergyInput.type = 'number';
        minEnergyInput.min = '0';
        panel.appendChild(createField('Min enerji', minEnergyInput));

        const minGoldInput = document.createElement('input');
        minGoldInput.dataset.role = 'minGold';
        minGoldInput.type = 'number';
        minGoldInput.min = '0';
        panel.appendChild(createField('Min altin', minGoldInput));

        const wakeHoldInput = document.createElement('input');
        wakeHoldInput.dataset.role = 'wakeHoldSec';
        wakeHoldInput.type = 'number';
        wakeHoldInput.min = '0';
        wakeHoldInput.placeholder = '0 = hemen';
        panel.appendChild(createField('Durunca ekran (sn)', wakeHoldInput));

        const buttonRow = document.createElement('div');
        buttonRow.className = 'bf-row';

        buttonRow.appendChild(createButton('Baslat', () => {
            const difficulty = applyPanelConfig();
            if (!difficulty) {
                return;
            }

            startLoop(difficulty);

            if (isFightReportPage()) {
                handleFightReportPage();
            }
        }, 'primary'));

        buttonRow.appendChild(createButton('Durdur', () => {
            stopLoop('panelden durduruldu');
        }));

        buttonRow.appendChild(createButton('Sifirla', () => {
            clearState();
        }, 'ghost'));

        panel.appendChild(buttonRow);

        const applyButtonRow = document.createElement('div');
        applyButtonRow.className = 'bf-row';
        applyButtonRow.appendChild(createButton('Ayarlari Kaydet', () => {
            applyPanelConfig();
        }));
        panel.appendChild(applyButtonRow);

        const status = document.createElement('div');
        status.dataset.role = 'status';
        status.className = 'bf-status';
        panel.appendChild(status);

        document.body.appendChild(panel);
        const state = loadState();
        applyPanelPosition(panel, state.panelPosition || getDefaultPanelPosition());
        refreshPanel();
    }

    function refreshPanel() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) {
            return;
        }

        const state = loadState();
        const config = getConfig(state);
        const difficulty = state.difficulty || 'kolay';

        const difficultySelect = panel.querySelector('[data-role="difficulty"]');
        const minDelayInput = panel.querySelector('[data-role="minDelay"]');
        const maxDelayInput = panel.querySelector('[data-role="maxDelay"]');
        const maxRunsInput = panel.querySelector('[data-role="maxRuns"]');
        const minHealthInput = panel.querySelector('[data-role="minHealth"]');
        const minEnergyInput = panel.querySelector('[data-role="minEnergy"]');
        const minGoldInput = panel.querySelector('[data-role="minGold"]');
        const wakeHoldInput = panel.querySelector('[data-role="wakeHoldSec"]');
        const status = panel.querySelector('[data-role="status"]');
        const currentHealth = findCurrentHealth();
        const currentEnergy = findCurrentEnergy();

        if (difficultySelect && document.activeElement !== difficultySelect) {
            difficultySelect.value = difficulty;
        }
        if (minDelayInput && document.activeElement !== minDelayInput) {
            minDelayInput.value = String(config.minDelay);
        }
        if (maxDelayInput && document.activeElement !== maxDelayInput) {
            maxDelayInput.value = String(config.maxDelay);
        }
        if (maxRunsInput && document.activeElement !== maxRunsInput) {
            maxRunsInput.value = config.maxRuns === null ? '' : String(config.maxRuns);
        }
        if (minHealthInput && document.activeElement !== minHealthInput) {
            minHealthInput.value = String(config.minHealth);
        }
        if (minEnergyInput && document.activeElement !== minEnergyInput) {
            minEnergyInput.value = String(config.minEnergy);
        }
        if (minGoldInput && document.activeElement !== minGoldInput) {
            minGoldInput.value = String(config.minGold);
        }
        if (wakeHoldInput && document.activeElement !== wakeHoldInput) {
            wakeHoldInput.value = String(config.wakeHoldSec);
        }

        if (status) {
            const enabledText = state.enabled ? 'acik' : 'kapali';
            const runs = state.completedRuns || 0;
            const lastGold = state.lastLootGold ?? '-';
            const stopReason = state.stopReason || '-';
            status.innerHTML = [
                `Durum: <strong>${enabledText}</strong>`,
                `Can / Enerji: <strong>${currentHealth ?? '-'} / ${currentEnergy ?? '-'}</strong>`,
                `Tur: <strong>${runs}</strong>`,
                `Son altin: <strong>${lastGold}</strong>`,
                `Sebep: <strong>${stopReason}</strong>`
            ].join('<br>');
        }
    }

    function bindManualSelectionCapture() {
        const options = getDifficultyOptions();

        if (options.length === 0) {
            debugLog('Zorluk butonlari bulunamadi.');
            return;
        }

        for (const option of options) {
            if (option.element.dataset.bfGrotteLoopBound === '1') {
                continue;
            }

            option.element.dataset.bfGrotteLoopBound = '1';
            option.element.addEventListener('click', event => {
                if (!event.isTrusted) {
                    return;
                }

                const prevState = loadState();

                updateState({
                    enabled: true,
                    difficulty: option.key,
                    expectDifficultyClick: false,
                    lastManualSelectionAt: Date.now(),
                    completedRuns: prevState.enabled ? prevState.completedRuns || 0 : 0,
                    lastCountedReportId: prevState.enabled ? prevState.lastCountedReportId || null : null,
                    stopReason: null
                });

                void acquireWakeLock();
                debugLog(`Manuel secim yakalandi: ${option.key}`);
            }, true);
        }
    }

    function queueDifficultyClick(difficulty) {
        const state = loadState();
        const config = getConfig(state);

        if (!state.enabled || !difficulty) {
            return;
        }

        if (config.maxRuns !== null && (state.completedRuns || 0) >= config.maxRuns) {
            stopLoop(`maksimum tur sayisina ulasildi (${state.completedRuns}/${config.maxRuns})`);
            return;
        }

        const option = findDifficultyOption(difficulty);

        if (!option) {
            debugLog(`Secili zorluk bulunamadi: ${difficulty}`);
            return;
        }

        updateState({
            expectDifficultyClick: false,
            lastAutoDifficultyAt: Date.now()
        });

        delay(randomDelay(state), () => {
            clickElement(option.element, `${difficulty} secenegi`);
        });
    }

    function handleGrottePage() {
        bindManualSelectionCapture();

        const state = loadState();
        const config = getConfig(state);
        const currentHealth = findCurrentHealth();
        const currentEnergy = findCurrentEnergy();

        // Birlesik otomasyonun her dongu icin sectigi rastgele enerji rezervi.
        // Zorluk tiklanmadan once kontrol edilir; hedefte yeni savasa girilmez.
        if (state.enabled && currentEnergy !== null) {
            try {
                const suite = JSON.parse(localStorage.getItem('BFAutomationSuiteSettingsV1') || '{}');
                const reserveEnergy = Number(suite.reserveEnergy || 0);
                if (suite.autoEnabled === true && suite.autoOwned === true && suite.drainActive === true
                    && reserveEnergy > 0 && currentEnergy <= reserveEnergy) {
                    stopLoop(`otomatik enerji rezervine ulasildi (${currentEnergy}/${reserveEnergy})`);
                    return;
                }
            } catch {
                // Ayar okunamazsa magaranin bagimsiz davranisi surer.
            }
        }

        if (state.enabled && config.maxRuns !== null && (state.completedRuns || 0) >= config.maxRuns) {
            stopLoop(`maksimum tur sayisina ulasildi (${state.completedRuns}/${config.maxRuns})`);
            return;
        }

        if (state.enabled && config.minHealth > 0) {
            if (currentHealth !== null && currentHealth < config.minHealth) {
                stopLoop(`can esiginin altina indi (${currentHealth} < ${config.minHealth})`);
                return;
            }

            if (currentHealth === null) {
                debugLog('Can okunamadi, can kontrolu atlandi.');
            }
        }

        if (state.enabled) {
            if (currentEnergy !== null && currentEnergy <= 0) {
                stopLoop(`enerji bitti (${currentEnergy})`);
                return;
            }

            if (config.minEnergy > 0 && currentEnergy !== null && currentEnergy < config.minEnergy) {
                stopLoop(`enerji esiginin altina indi (${currentEnergy} < ${config.minEnergy})`);
                return;
            }

            if (config.minEnergy > 0 && currentEnergy === null) {
                debugLog('Enerji okunamadi, enerji kontrolu atlandi.');
            }
        }

        if (state.enabled && state.expectDifficultyClick && state.difficulty) {
            queueDifficultyClick(state.difficulty);
        } else if (state.enabled && state.difficulty) {
            debugLog(`Hazir. Mevcut zorluk: ${state.difficulty}. Tur: ${state.completedRuns || 0}`);
        } else {
            debugLog('Dongu pasif. Baslatmak icin zorlugu manuel sec veya console: bfGrotteLoop.start("zor")');
        }
    }

    function handleFightReportPage() {
        const state = loadState();
        const config = getConfig(state);

        if (!state.enabled || !state.difficulty) {
            debugLog('Dongu pasif. Rapor sayfasinda bekleniyor.');
            return;
        }

        const reportId = getCurrentReportId();
        const lootGold = findLootGold();
        let completedRuns = state.completedRuns || 0;

        if (reportId && state.lastCountedReportId !== reportId) {
            completedRuns += 1;
            updateState({
                completedRuns,
                lastCountedReportId: reportId,
                lastLootGold: lootGold,
                lastReportSeenAt: Date.now()
            });
            debugLog(`Tur tamamlandi: ${completedRuns}. Ganimet: ${lootGold === null ? 'okunamadi' : lootGold}`);
        } else {
            updateState({
                lastLootGold: lootGold,
                lastReportSeenAt: Date.now()
            });
        }

        if (config.minGold > 0 && lootGold !== null && lootGold < config.minGold) {
            stopLoop(`ganimet esiginin altina indi (${lootGold} < ${config.minGold})`);
            return;
        }

        if (config.maxRuns !== null && completedRuns >= config.maxRuns) {
            stopLoop(`maksimum tur sayisina ulasildi (${completedRuns}/${config.maxRuns})`);
            return;
        }

        const backButton = findBackButton();

        updateState({
            expectDifficultyClick: true,
            lastReportSeenAt: Date.now()
        });

        delay(randomDelay(state), () => {
            const clicked = clickElement(backButton, 'Geri butonu');
            if (!clicked) {
                debugLog('Geri butonu bulunamadi, history.back() deneniyor.');
                history.back();
            }
        });
    }

    function route() {
        exposeApi();
        createControlPanel();
        void acquireWakeLock();

        if (isFightReportPage()) {
            handleFightReportPage();
            return;
        }

        if (isGrottePage()) {
            handleGrottePage();
        }
    }

    // Magara dongusu her tur tam bir sayfa yeniden yuklemesi yapar; wake lock
    // sayfaya bagli oldugu icin her navigasyonda duser. Otobirlik ise turlar
    // arasinda ayni sayfada bekledigi icin kilidi kesintisiz tutar ve telefonda
    // ekran kilidi olmaz. Bu farki kapatmak icin script document-start'ta calisir
    // ve kilidi sayfa daha cizilmeden, mumkun olan en erken anda alir; boylece
    // navigasyonlar arasindaki kilitsiz bosluk minimuma iner.
    void acquireWakeLock();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', route, { once: true });
    } else {
        route();
    }
})();


(function () {
  'use strict';

  if (window.__BFAutomationSuiteLoaded || location.hostname === 'bt-analiz.web.app') return;
  window.__BFAutomationSuiteLoaded = true;

  const ROOT_ID = 'bf-automation-suite';
  const STYLE_ID = 'bf-automation-suite-styles';
  // Panel basliginda gosterilir; deploy sonrasi dogru surumun yuklendigini dogrular.
  const SUITE_VERSION = '1.2.1';
  const SETTINGS_KEY = 'BFAutomationSuiteSettingsV1';
  const ORB_KEY = 'BFOrbSettings';
  const CAVE_KEY = 'bfGrotteLoopStateV1';
  const COORD_KEY = 'BFOrbFloorCoordinator';
  const ITEM_DISCARD_KEY = 'BFItemDiscardStateV1';
  // Magara baslama/durma bildirimleri orb ile ayni Firestore koleksiyonu
  // uzerinden Telegram'a gider (functions/index.js -> kind: 'info').
  const SUITE_FIREBASE_API_KEY = 'AIzaSyB6_mwliHgUXjCSidzZIBiQj_8hLkYvZV4';
  const SUITE_NOTIFICATIONS_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/orbNotifications';
  const DEFAULTS = {
    rulesVersion: 2,
    autoEnabled: true,
    activeTab: 'kontrol',
    collapsed: false,
    panelPos: null,
    blockHours: 2,
    conditionalHours: 5,
    energyPercent: 10,
    reservePercent: 0,
    reserveEnergy: 0,
    drainActive: false,
    autoOwned: false,
    manualCavePaused: false,
    returnUrl: '',
    // Magara basladi bildirimi gonderildi mi (durunca sifirlanir; spam onler)
    caveNotifyActive: false
  };

  const storedSettings = loadJson(SETTINGS_KEY, {});
  let settings = { ...DEFAULTS, ...storedSettings };
  if (Number(storedSettings.rulesVersion || 0) < 2) {
    settings.rulesVersion = 2;
    settings.energyPercent = 10;
    settings.reservePercent = 0;
    settings.reserveEnergy = 0;
    saveSettings();
  }
  let observer = null;
  let lastNavigationAt = 0;

  function loadJson(key, fallback = {}) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalizeSettings() {
    settings.blockHours = clamp(settings.blockHours, 0.1, 24, DEFAULTS.blockHours);
    settings.conditionalHours = clamp(settings.conditionalHours, settings.blockHours, 48, DEFAULTS.conditionalHours);
    settings.energyPercent = clamp(settings.energyPercent, 1, 100, DEFAULTS.energyPercent);
    saveSettings();
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{position:fixed;right:18px;top:54px;width:min(540px,calc(100vw - 24px));max-height:min(620px,72dvh);z-index:1000000;background:#100d0b;border:1px solid #6d5133;border-radius:12px;box-shadow:0 16px 46px rgba(0,0,0,.56);color:#eadbc5;font:11px/1.35 Arial,sans-serif;overflow:hidden}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID}.is-collapsed .bf-suite-tabs,#${ROOT_ID}.is-collapsed .bf-suite-content{display:none}
      #${ROOT_ID} .bf-suite-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:linear-gradient(135deg,#221911,#15100c);border-bottom:1px solid #4e3824;cursor:move;user-select:none}
      #${ROOT_ID} .bf-suite-title{font-size:12px;font-weight:800;letter-spacing:.3px;color:#f4dfbd}
      #${ROOT_ID} .bf-suite-sub{font-size:9px;color:#9e8566;margin-left:7px}
      #${ROOT_ID} .bf-suite-collapse{border:1px solid #65482e;background:#21170f;color:#e8c794;border-radius:6px;width:25px;height:22px;cursor:pointer}
      #${ROOT_ID} .bf-suite-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:6px;background:#15100d;border-bottom:1px solid #403020}
      #${ROOT_ID} .bf-suite-tab{border:1px solid #4e3824;background:#1c1510;color:#a9957b;border-radius:7px;padding:6px 3px;cursor:pointer;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}
      #${ROOT_ID} .bf-suite-tab.is-active{color:#181008;background:#d3aa6b;border-color:#e6c48c}
      #${ROOT_ID} .bf-suite-content{max-height:min(530px,calc(72dvh - 82px));overflow:auto;padding:6px;background:#0f0c0a;scrollbar-width:thin;scrollbar-color:#6d5133 transparent}
      #${ROOT_ID} .bf-suite-pane{display:none}
      #${ROOT_ID} .bf-suite-pane.is-active{display:block}
      #${ROOT_ID} .bf-suite-auto{padding:11px;margin-bottom:9px;border:1px solid #503a25;border-radius:10px;background:#18120e}
      #${ROOT_ID} .bf-suite-auto-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
      #${ROOT_ID} .bf-suite-auto-title{font-weight:800;color:#f0d7ae}
      #${ROOT_ID} .bf-suite-auto input[type=checkbox]{width:17px;height:17px;accent-color:#c89a54}
      #${ROOT_ID} .bf-suite-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
      #${ROOT_ID} .bf-suite-field{display:flex;flex-direction:column;gap:4px;color:#a99273;font-size:10px}
      #${ROOT_ID} .bf-suite-field input{width:100%;border:1px solid #594027;background:#100c09;color:#f2dfc1;border-radius:7px;padding:7px}
      #${ROOT_ID} .bf-suite-cave-toggle{width:100%;margin-top:8px;padding:7px;border:1px solid #8b3b2f;border-radius:7px;background:#5a211b;color:#ffe3d5;font-size:10px;font-weight:800;cursor:pointer}
      #${ROOT_ID} .bf-suite-cave-toggle.is-paused{border-color:#3f7859;background:#183d2b;color:#c9f4d9}
      #${ROOT_ID} .bf-suite-status{margin-top:9px;padding:8px;border-radius:7px;background:#0d0a08;border:1px solid #352719;color:#c9b497;min-height:34px}
      #${ROOT_ID} .bf-master{padding:11px;border:1px solid #503a25;border-radius:10px;background:#18120e}
      #${ROOT_ID} .bf-master-top{display:flex;align-items:center;gap:8px;margin-bottom:9px}
      #${ROOT_ID} .bf-master-badge{padding:3px 8px;border-radius:99px;font-size:9px;font-weight:800;letter-spacing:.6px;background:#3a2c1c;color:#d9bd90;border:1px solid #5c4429}
      #${ROOT_ID} .bf-master-badge.is-running{background:#123a20;color:#8ce9a4;border-color:#2f7a48}
      #${ROOT_ID} .bf-master-badge.is-paused{background:#3d3210;color:#ffd479;border-color:#8a6f22}
      #${ROOT_ID} .bf-master-hint{font-size:9px;color:#9e8566;line-height:1.3}
      #${ROOT_ID} .bf-master-list{display:flex;flex-direction:column;gap:5px}
      #${ROOT_ID} .bf-master-row{display:flex;align-items:center;gap:7px;padding:6px 8px;border:1px solid #4a3521;border-radius:8px;background:#120e0a}
      #${ROOT_ID} .bf-master-row.is-off{opacity:.5}
      #${ROOT_ID} .bf-master-rank{width:17px;height:17px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;border-radius:5px;background:#d3aa6b;color:#191008;font-size:9px;font-weight:800}
      #${ROOT_ID} .bf-master-row input[type=checkbox]{width:15px;height:15px;accent-color:#c89a54;margin:0}
      #${ROOT_ID} .bf-master-name{flex:1;font-size:11px;font-weight:700;color:#f0d7ae}
      #${ROOT_ID} .bf-master-note{font-size:9px;color:#9e8566;font-weight:400}
      #${ROOT_ID} .bf-master-move{width:22px;height:22px;border:1px solid #5c4429;border-radius:6px;background:#231a12;color:#e8c794;cursor:pointer;font-size:10px;line-height:1;padding:0}
      #${ROOT_ID} .bf-master-move:disabled{opacity:.3;cursor:default}
      #${ROOT_ID} .bf-master-actions{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:6px;margin-top:9px}
      #${ROOT_ID} .bf-master-btn{padding:9px 4px;border-radius:8px;border:1px solid #5c4429;background:#241a12;color:#f0d7ae;font-size:10px;font-weight:800;cursor:pointer}
      #${ROOT_ID} .bf-master-btn.is-start{background:linear-gradient(160deg,#2f9e44,#40c057);border-color:#49b45c;color:#06220e}
      #${ROOT_ID} .bf-master-btn.is-pause{background:#4a3a12;border-color:#8a6f22;color:#ffd479}
      #${ROOT_ID} .bf-master-btn.is-stop{background:#5a211b;border-color:#8b3b2f;color:#ffe3d5}
      #${ROOT_ID} .bf-master-btn:disabled{opacity:.42;cursor:default}
      #${ROOT_ID} .bf-master-check{display:flex;align-items:center;gap:6px;margin:10px 0 6px;font-size:10px;color:#c9b497;cursor:pointer}
      #${ROOT_ID} .bf-master-check input{width:15px;height:15px;accent-color:#c89a54;margin:0}
      #${ROOT_ID} .bf-master-keys{display:flex;flex-direction:column;gap:4px}
      #${ROOT_ID} .bf-master-key{display:flex;align-items:center;gap:7px;font-size:10px;color:#a99273}
      #${ROOT_ID} .bf-master-key span{flex:1}
      #${ROOT_ID} .bf-master-key kbd{min-width:96px;text-align:center;padding:4px 6px;border:1px solid #594027;border-radius:6px;background:#100c09;color:#f2dfc1;font:700 10px/1 monospace}
      #${ROOT_ID} .bf-master-key button{padding:4px 8px;border:1px solid #5c4429;border-radius:6px;background:#231a12;color:#e8c794;font-size:9px;cursor:pointer}
      #${ROOT_ID} .bf-master-key.is-capturing kbd{border-color:#d3aa6b;color:#ffd479}
      #${ROOT_ID} #bt-bot-panel,#${ROOT_ID} #bf-grotte-loop-panel,#${ROOT_ID} #bf-orb-panel,#${ROOT_ID} #bt-bot-panel-mini{position:static!important;inset:auto!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;transform:none!important;width:100%!important;min-width:0!important;max-width:none!important;max-height:none!important;height:auto!important;margin:0!important;z-index:auto!important;box-shadow:none!important}
      #${ROOT_ID} #bt-bot-panel{padding:7px 8px!important;column-gap:7px!important;row-gap:5px!important;border-radius:10px!important;font-size:10px!important}
      #${ROOT_ID} #bt-bot-panel .bt-panel-head{padding-bottom:0!important}
      #${ROOT_ID} #bt-bot-panel .bt-panel-title{font-size:14px!important;line-height:1.1!important}
      #${ROOT_ID} #bt-bot-panel .bt-panel-kicker{font-size:7px!important}
      #${ROOT_ID} #bt-bot-panel .bt-panel-section{padding:6px!important;gap:4px!important;border-radius:8px!important}
      #${ROOT_ID} #bt-bot-panel .bt-floor-shortcuts,#${ROOT_ID} #bt-bot-panel .bt-auto-countdowns{padding:5px!important;gap:4px!important}
      #${ROOT_ID} #bt-bot-panel button{min-height:27px!important;padding-top:4px!important;padding-bottom:4px!important;font-size:10px!important}
      #${ROOT_ID} #bt-bot-panel input[type="number"],#${ROOT_ID} #bt-bot-panel select{height:27px!important;font-size:10px!important}
      #${ROOT_ID} #bt-bot-panel-resize-handle{display:none!important}
      @media(max-width:560px){#${ROOT_ID}{right:8px;top:44px;width:calc(100vw - 16px);max-height:calc(100dvh - 56px)}#${ROOT_ID} .bf-suite-content{max-height:calc(100dvh - 132px)}#${ROOT_ID} .bf-suite-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (!document.body || document.getElementById(ROOT_ID)) return;
    injectStyles();
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="bf-suite-head">
        <div><span class="bf-suite-title">BiteFight Otomasyon</span><span class="bf-suite-sub">Kontrol · Birlik · Mağara · Orb · Skill — v${SUITE_VERSION}</span></div>
        <button class="bf-suite-collapse" type="button" title="Küçült / büyüt">—</button>
      </div>
      <nav class="bf-suite-tabs" aria-label="Otomasyon bölümleri">
        <button class="bf-suite-tab" type="button" data-tab="kontrol">Kontrol</button>
        <button class="bf-suite-tab" type="button" data-tab="birlik">Birlik</button>
        <button class="bf-suite-tab" type="button" data-tab="magara">Mağara</button>
        <button class="bf-suite-tab" type="button" data-tab="orb">Orb</button>
        <button class="bf-suite-tab" type="button" data-tab="skill">Skill</button>
      </nav>
      <div class="bf-suite-content">
        <div class="bf-suite-pane" data-pane="kontrol">
          <div class="bf-master">
            <div class="bf-master-top">
              <span class="bf-master-badge" data-master="badge">BOŞTA</span>
              <span class="bf-master-hint">Öncelik sırası: üstteki modül sırayı ilk alır.</span>
            </div>
            <div class="bf-master-list" data-master="list"></div>
            <div class="bf-master-actions">
              <button class="bf-master-btn is-start" data-master="start" type="button">▶ Tek Tuşla Başlat</button>
              <button class="bf-master-btn is-pause" data-master="pause" type="button">⏸ Duraklat</button>
              <button class="bf-master-btn is-stop" data-master="stop" type="button">⏹ Durdur</button>
            </div>
            <label class="bf-master-check"><input data-master="hotkeys" type="checkbox"><span>Klavye kısayolları aktif</span></label>
            <div class="bf-master-keys" data-master="keys"></div>
            <div class="bf-suite-status" data-master="status">Hazır.</div>
          </div>
        </div>
        <div class="bf-suite-pane" data-pane="birlik"><div data-slot="birlik"></div></div>
        <div class="bf-suite-pane" data-pane="magara">
          <div class="bf-suite-auto">
            <div class="bf-suite-auto-top"><span class="bf-suite-auto-title">Üçlü otomatik koordinasyon</span><input data-suite="enabled" type="checkbox"></div>
            <div class="bf-suite-grid">
              <label class="bf-suite-field">Orb koruma (saat)<input data-suite="block" type="number" min="0.1" max="24" step="0.1"></label>
              <label class="bf-suite-field">Koşullu üst sınır (saat)<input data-suite="conditional" type="number" min="0.1" max="48" step="0.1"></label>
              <label class="bf-suite-field">Enerji başlatma (%)<input data-suite="energy" type="number" min="1" max="100" step="1"></label>
            </div>
            <button class="bf-suite-cave-toggle" data-suite="cave-toggle" type="button"></button>
            <div class="bf-suite-status" data-suite="status">Durum okunuyor…</div>
          </div>
          <div data-slot="magara"></div>
        </div>
        <div class="bf-suite-pane" data-pane="orb"><div data-slot="orb"></div></div>
        <div class="bf-suite-pane" data-pane="skill"><div data-slot="skill"></div></div>
      </div>
    `;
    document.body.appendChild(root);
    bindPanel(root);
    applyPanelPosition(root);
    selectTab(settings.activeTab);
    attachNativePanels();
  }

  function bindPanel(root) {
    root.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => selectTab(button.dataset.tab));
    });
    root.querySelector('.bf-suite-collapse').addEventListener('click', event => {
      event.stopPropagation();
      settings.collapsed = !settings.collapsed;
      root.classList.toggle('is-collapsed', settings.collapsed);
      saveSettings();
    });
    root.classList.toggle('is-collapsed', settings.collapsed);
    const enabled = root.querySelector('[data-suite="enabled"]');
    const block = root.querySelector('[data-suite="block"]');
    const conditional = root.querySelector('[data-suite="conditional"]');
    const energy = root.querySelector('[data-suite="energy"]');
    const caveToggle = root.querySelector('[data-suite="cave-toggle"]');
    enabled.checked = settings.autoEnabled;
    block.value = settings.blockHours;
    conditional.value = settings.conditionalHours;
    energy.value = settings.energyPercent;
    updateCavePauseButton();
    caveToggle.addEventListener('click', () => {
      settings.manualCavePaused = !settings.manualCavePaused;
      saveSettings();
      updateCavePauseButton();
      if (settings.manualCavePaused) {
        stopAutoCave('kullanıcı otomatik mağarayı durdurdu');
        setSuiteStatus('Otomatik mağara kullanıcı tarafından durduruldu. Devam Ettir düğmesine kadar başlamayacak.');
      } else {
        setSuiteStatus('Otomatik mağara yeniden etkinleştirildi. Şartlar kontrol ediliyor…');
        automationTick();
      }
    });
    enabled.addEventListener('change', () => {
      settings.autoEnabled = enabled.checked;
      if (!settings.autoEnabled) stopAutoCave('otomatik koordinasyon kapatıldı');
      saveSettings();
      automationTick();
    });
    [block, conditional, energy].forEach(input => input.addEventListener('change', () => {
      settings.blockHours = block.value;
      settings.conditionalHours = conditional.value;
      settings.energyPercent = energy.value;
      normalizeSettings();
      block.value = settings.blockHours;
      conditional.value = settings.conditionalHours;
      energy.value = settings.energyPercent;
      automationTick();
    }));
    root.addEventListener('click', event => {
      const button = event.target.closest('#bf-grotte-loop-panel button');
      if (!button || button.textContent.trim().toLocaleLowerCase('tr-TR') !== 'durdur') return;
      settings.manualCavePaused = true;
      saveSettings();
      updateCavePauseButton();
      stopAutoCave('mağara panelinden durduruldu');
      setSuiteStatus('Otomatik mağara durduruldu. Devam Ettir düğmesine kadar yeniden başlamayacak.');
    }, true);
    bindMasterPanel(root);
    enableDrag(root.querySelector('.bf-suite-head'), root);
  }

  function updateCavePauseButton() {
    const button = document.querySelector(`#${ROOT_ID} [data-suite="cave-toggle"]`);
    if (!button) return;
    button.textContent = settings.manualCavePaused
      ? 'Otomatik Mağarayı Devam Ettir'
      : 'Otomatik Mağarayı Durdur';
    button.classList.toggle('is-paused', settings.manualCavePaused === true);
  }

  function selectTab(tab) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const valid = ['kontrol', 'birlik', 'magara', 'orb', 'skill'].includes(tab) ? tab : 'kontrol';
    settings.activeTab = valid;
    saveSettings();
    root.querySelectorAll('[data-tab]').forEach(el => el.classList.toggle('is-active', el.dataset.tab === valid));
    root.querySelectorAll('[data-pane]').forEach(el => el.classList.toggle('is-active', el.dataset.pane === valid));
  }

  function attachNativePanels() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const targets = [
      ['#bt-bot-panel', 'birlik'],
      ['#bt-bot-panel-mini', 'birlik'],
      ['#bf-grotte-loop-panel', 'magara'],
      ['#bf-orb-panel', 'orb'],
      ['#bf-skill-panel', 'skill']
    ];
    for (const [selector, slotName] of targets) {
      const panel = document.querySelector(selector);
      const slot = root.querySelector(`[data-slot="${slotName}"]`);
      if (panel && slot && panel.parentElement !== slot) slot.appendChild(panel);
    }
  }

  function applyPanelPosition(root) {
    const pos = settings.panelPos;
    if (!pos || !Number.isFinite(Number(pos.left)) || !Number.isFinite(Number(pos.top))) return;
    root.style.left = `${Math.max(0, Math.min(innerWidth - 80, Number(pos.left)))}px`;
    root.style.top = `${Math.max(0, Math.min(innerHeight - 42, Number(pos.top)))}px`;
    root.style.right = 'auto';
  }

  function enableDrag(handle, root) {
    let drag = null;
    handle.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = root.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!drag) return;
      root.style.left = `${Math.max(0, Math.min(innerWidth - 80, drag.left + event.clientX - drag.x))}px`;
      root.style.top = `${Math.max(0, Math.min(innerHeight - 42, drag.top + event.clientY - drag.y))}px`;
      root.style.right = 'auto';
    });
    const finish = () => {
      if (!drag) return;
      const rect = root.getBoundingClientRect();
      settings.panelPos = { left: Math.round(rect.left), top: Math.round(rect.top) };
      saveSettings();
      drag = null;
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  // ===================== ANA KONTROL (tek tusla baslat) =====================
  // Uc modulun ortak anahtari. Birlik botu da bu anahtardaki oncelik sirasini
  // okur (orbCollectionIsDue -> orbOutranksFloorBot).
  const MASTER_KEY = 'BFMasterControlV1';
  const MASTER_MODULES = [
    { id: 'orb', label: 'Orb Toplayıcı', note: 'küre avı' },
    { id: 'birlik', label: 'Birlik · Oto Kat', note: 'atalar katları' },
    { id: 'magara', label: 'Mağara · Zor', note: 'artan enerji' }
  ];
  const MASTER_DEFAULTS = {
    priority: ['orb', 'birlik', 'magara'],
    modules: { orb: true, birlik: true, magara: true },
    state: 'idle',
    pendingBirlik: false,
    pendingSince: 0,
    caveWasActive: false,
    resumeAfterSkill: false,
    hotkeysEnabled: true,
    hotkeys: { start: 'Ctrl+Alt+S', pause: 'Ctrl+Alt+P', stop: 'Ctrl+Alt+X' },
    updatedAt: 0
  };
  // Magara onceligi birligi bu sureden uzun bekletemez (kilitlenme emniyeti).
  const MASTER_PENDING_MAX_MS = 30 * 60 * 1000;

  let master = normalizeMaster(loadJson(MASTER_KEY, {}));
  let hotkeyCapture = '';
  // Liste/kisayol satirlari innerHTML ile cizildigi icin yalnizca icerik
  // degistiginde yeniden cizilir (5 sn'lik tick odagi bozmasin).
  let masterListSignature = '';
  let masterKeysSignature = '';

  function normalizeMaster(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const next = { ...MASTER_DEFAULTS, ...source };
    next.modules = { ...MASTER_DEFAULTS.modules, ...(source.modules || {}) };
    next.hotkeys = { ...MASTER_DEFAULTS.hotkeys, ...(source.hotkeys || {}) };
    const ids = MASTER_MODULES.map(item => item.id);
    const ordered = Array.isArray(source.priority) ? source.priority.filter(id => ids.includes(id)) : [];
    next.priority = [...new Set(ordered)].concat(ids.filter(id => !ordered.includes(id)));
    if (!['idle', 'running', 'paused'].includes(next.state)) next.state = 'idle';
    return next;
  }

  function saveMaster() {
    master.updatedAt = Date.now();
    localStorage.setItem(MASTER_KEY, JSON.stringify(master));
  }

  function masterRank(id) {
    const index = master.priority.indexOf(id);
    return index < 0 ? 99 : index;
  }

  function masterSelected(id) {
    return master.modules[id] !== false;
  }

  function isGameHost() {
    return /bitefight/i.test(location.host);
  }

  function setMasterStatus(message) {
    const status = document.querySelector(`#${ROOT_ID} [data-master="status"]`);
    if (status) status.textContent = message;
  }

  function moduleStates() {
    let botRunning = false;
    try { botRunning = window.BFFloorBot?.isRunning?.() === true; } catch { botRunning = false; }
    return {
      orb: loadJson(ORB_KEY).running === true,
      birlik: botRunning,
      magara: caveState().enabled === true
    };
  }

  function moduleStateText() {
    const states = moduleStates();
    return master.priority
      .filter(id => masterSelected(id))
      .map(id => `${MASTER_MODULES.find(item => item.id === id).label.split(' ')[0]} ${states[id] ? '✔' : '⏳'}`)
      .join(' · ');
  }

  function renderMaster() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const list = root.querySelector('[data-master="list"]');
    const listSignature = master.priority.map(id => `${id}:${masterSelected(id) ? 1 : 0}`).join('|');
    if (list && listSignature !== masterListSignature) {
      masterListSignature = listSignature;
      list.innerHTML = master.priority.map((id, index) => {
        const item = MASTER_MODULES.find(entry => entry.id === id);
        const on = masterSelected(id);
        return `<div class="bf-master-row${on ? '' : ' is-off'}">
          <span class="bf-master-rank">${index + 1}</span>
          <input type="checkbox" data-master-module="${id}"${on ? ' checked' : ''}>
          <span class="bf-master-name">${item.label} <span class="bf-master-note">${item.note}</span></span>
          <button class="bf-master-move" type="button" data-master-move="up" data-module="${id}"${index === 0 ? ' disabled' : ''}>▲</button>
          <button class="bf-master-move" type="button" data-master-move="down" data-module="${id}"${index === master.priority.length - 1 ? ' disabled' : ''}>▼</button>
        </div>`;
      }).join('');
    }

    const keys = root.querySelector('[data-master="keys"]');
    const keysSignature = `${hotkeyCapture}|${master.hotkeys.start}|${master.hotkeys.pause}|${master.hotkeys.stop}`;
    if (keys && keysSignature !== masterKeysSignature) {
      masterKeysSignature = keysSignature;
      keys.innerHTML = [['start', 'Başlat'], ['pause', 'Duraklat'], ['stop', 'Durdur']].map(([action, label]) => {
        const capturing = hotkeyCapture === action;
        const combo = master.hotkeys[action] || '—';
        return `<div class="bf-master-key${capturing ? ' is-capturing' : ''}">
          <span>${label}</span><kbd>${capturing ? 'Tuşa bas…' : combo}</kbd>
          <button type="button" data-master-key="${action}">${capturing ? 'Vazgeç' : 'Değiştir'}</button>
        </div>`;
      }).join('');
    }

    const badge = root.querySelector('[data-master="badge"]');
    if (badge) {
      badge.textContent = master.state === 'running' ? 'ÇALIŞIYOR' : master.state === 'paused' ? 'DURAKLADI' : 'BOŞTA';
      badge.classList.toggle('is-running', master.state === 'running');
      badge.classList.toggle('is-paused', master.state === 'paused');
    }

    const hotkeyBox = root.querySelector('[data-master="hotkeys"]');
    if (hotkeyBox) hotkeyBox.checked = master.hotkeysEnabled !== false;

    const startBtn = root.querySelector('[data-master="start"]');
    const pauseBtn = root.querySelector('[data-master="pause"]');
    const stopBtn = root.querySelector('[data-master="stop"]');
    if (startBtn) startBtn.textContent = master.state === 'paused' ? '▶ Devam Et' : '▶ Tek Tuşla Başlat';
    if (startBtn) startBtn.disabled = master.state === 'running';
    if (pauseBtn) pauseBtn.disabled = master.state !== 'running';
    if (stopBtn) stopBtn.disabled = master.state === 'idle';

    const enabledBox = root.querySelector('[data-suite="enabled"]');
    if (enabledBox) enabledBox.checked = settings.autoEnabled === true;
  }

  function moveModule(id, direction) {
    const index = master.priority.indexOf(id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= master.priority.length) return;
    const next = [...master.priority];
    next.splice(target, 0, next.splice(index, 1)[0]);
    master.priority = next;
    saveMaster();
    renderMaster();
    setMasterStatus(`Öncelik sırası: ${master.priority.join(' > ')}. ${master.state === 'running' ? 'Yeni sıra için tekrar başlat.' : 'Başlat’a basınca uygulanır.'}`);
  }

  function comboFromEvent(event) {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    parts.push(key);
    return parts.join('+');
  }

  function isModifierKey(key) {
    return ['Control', 'Alt', 'Shift', 'Meta'].includes(key);
  }

  function handleHotkey(event) {
    if (hotkeyCapture) {
      if (isModifierKey(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        hotkeyCapture = '';
        renderMaster();
        return;
      }
      master.hotkeys[hotkeyCapture] = comboFromEvent(event);
      hotkeyCapture = '';
      saveMaster();
      renderMaster();
      setMasterStatus('Kısayol kaydedildi.');
      return;
    }
    if (master.hotkeysEnabled === false || isModifierKey(event.key)) return;
    const target = event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''))) return;
    const combo = comboFromEvent(event).toLowerCase();
    const action = ['start', 'pause', 'stop']
      .find(name => String(master.hotkeys[name] || '').toLowerCase() === combo);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'start') void masterStart();
    else if (action === 'pause') void masterPause('klavye kısayolu');
    else void masterStop('klavye kısayolu');
  }

  function bindMasterPanel(root) {
    const pane = root.querySelector('[data-pane="kontrol"]');
    if (!pane) return;
    pane.addEventListener('click', event => {
      const move = event.target.closest('[data-master-move]');
      if (move) {
        moveModule(move.dataset.module, move.dataset.masterMove);
        return;
      }
      const keyButton = event.target.closest('[data-master-key]');
      if (keyButton) {
        hotkeyCapture = hotkeyCapture === keyButton.dataset.masterKey ? '' : keyButton.dataset.masterKey;
        renderMaster();
        return;
      }
      const action = event.target.closest('button[data-master]')?.dataset.master;
      if (action === 'start') void masterStart();
      else if (action === 'pause') void masterPause('kullanıcı duraklattı');
      else if (action === 'stop') void masterStop('kullanıcı durdurdu');
    });
    pane.addEventListener('change', event => {
      const moduleBox = event.target.closest('[data-master-module]');
      if (moduleBox) {
        master.modules[moduleBox.dataset.masterModule] = moduleBox.checked;
        saveMaster();
        renderMaster();
        setMasterStatus(master.state === 'running'
          ? 'Modül seçimi değişti; yeni seçim için tekrar başlat.'
          : 'Modül seçimi kaydedildi.');
        return;
      }
      if (event.target.matches('[data-master="hotkeys"]')) {
        master.hotkeysEnabled = event.target.checked;
        saveMaster();
        setMasterStatus(master.hotkeysEnabled ? 'Klavye kısayolları açık.' : 'Klavye kısayolları kapalı.');
      }
    });
    renderMaster();
  }

  // Secilen modullerin bayraklarini yazar; navigasyon yapmaz. Sayfa yenilendikten
  // sonra her modul kendi acilis rutininde kaldigi yerden devam eder.
  function applyMasterModules() {
    const wantOrb = masterSelected('orb');
    const wantBot = masterSelected('birlik');
    const wantCave = masterSelected('magara');
    const orbFirst = masterRank('orb') < masterRank('birlik');
    const caveBeforeBot = masterRank('magara') < masterRank('birlik');

    const orb = loadJson(ORB_KEY);
    orb.running = wantOrb;
    if (wantOrb) orb.retryAt = 0;
    localStorage.setItem(ORB_KEY, JSON.stringify(orb));

    // Magara birlikten oncelikliyse: once magara enerjiyi rezerve kadar harcar,
    // sonra birlik devreye girer (masterTick serbest birakir).
    const holdBot = wantBot && wantCave && caveBeforeBot;
    master.pendingBirlik = holdBot;
    master.pendingSince = holdBot ? Date.now() : 0;
    master.caveWasActive = false;
    if (wantBot && !holdBot) {
      try { window.BFFloorBot?.enableAuto?.(); } catch (error) { console.error('[BF Suite] Birlik başlatılamadı', error); }
    } else {
      try { window.BFFloorBot?.stop?.(holdBot ? 'mağara önceliği bekleniyor' : 'ana kontrol: birlik kapalı'); } catch { /* bot modulu yoksa gec */ }
    }

    settings.autoEnabled = wantCave;
    if (wantCave) settings.manualCavePaused = false;
    saveSettings();
    updateCavePauseButton();

    const botActive = wantBot && !holdBot;
    const start = Number(window.BFFloorBot?.range?.().start) || 1;
    localStorage.setItem(COORD_KEY, JSON.stringify({
      busy: botActive && (!wantOrb || !orbFirst),
      resumeAt: 0,
      orbPriority: wantOrb && botActive && orbFirst,
      floorUrl: window.BFFloorBot?.floorUrl?.(start) || '',
      updatedAt: Date.now()
    }));
  }

  async function masterStopModules(reason) {
    try { window.BFOrbHunter?.stop?.(); } catch { /* orb modulu yoksa gec */ }
    try {
      const orb = loadJson(ORB_KEY);
      orb.running = false;
      localStorage.setItem(ORB_KEY, JSON.stringify(orb));
    } catch { /* localStorage kapali */ }
    try { window.BFFloorBot?.stop?.(reason); } catch { /* bot modulu yoksa gec */ }
    settings.autoEnabled = false;
    saveSettings();
    await stopAutoCave(reason);
    localStorage.setItem(COORD_KEY, JSON.stringify({
      busy: false, resumeAt: 0, orbPriority: false, floorUrl: '', updatedAt: Date.now()
    }));
    updateCavePauseButton();
  }

  async function masterStart() {
    const selected = master.priority.filter(id => masterSelected(id));
    if (!selected.length) {
      setMasterStatus('En az bir modül seçmelisin.');
      return;
    }
    if (!isGameHost()) {
      setMasterStatus('Bu sayfa oyun sitesi değil. Oyun sekmesinde başlat.');
      return;
    }
    master.state = 'running';
    applyMasterModules();
    saveMaster();
    renderMaster();
    setMasterStatus(`Başlatılıyor: ${selected.join(' > ')}. Sayfa yenileniyor…`);
    // Kullanicinin elle F5 atmasina gerek kalmasin: bayraklar yazildiktan sonra
    // sayfa yenilenir, her modul acilis rutininde devreye girer.
    window.setTimeout(() => location.reload(), 400);
  }

  async function masterPause(reason) {
    if (master.state !== 'running') return;
    await masterStopModules(reason);
    master.state = 'paused';
    master.pendingBirlik = false;
    saveMaster();
    renderMaster();
    setMasterStatus(`Duraklatıldı (${reason}). Devam Et’e basınca kaldığı yerden sürer.`);
  }

  async function masterStop(reason) {
    await masterStopModules(reason);
    master.state = 'idle';
    master.pendingBirlik = false;
    master.pendingSince = 0;
    master.caveWasActive = false;
    master.resumeAfterSkill = false;
    saveMaster();
    renderMaster();
    setMasterStatus(`Durduruldu (${reason}).`);
  }

  // Magara onceligi: magara enerjiyi rezerve kadar harcayinca birlik devralir.
  function masterTick() {
    renderMaster();
    if (master.state !== 'running') return;
    if (!master.pendingBirlik || !masterSelected('birlik')) {
      setMasterStatus(`Çalışıyor · Sıra: ${master.priority.filter(id => masterSelected(id)).join(' > ')} · ${moduleStateText()}`);
      return;
    }
    if (settings.drainActive) {
      if (!master.caveWasActive) {
        master.caveWasActive = true;
        saveMaster();
      }
      return;
    }
    const waitedTooLong = master.pendingSince > 0 && Date.now() - master.pendingSince > MASTER_PENDING_MAX_MS;
    if (!master.caveWasActive && !waitedTooLong) {
      setMasterStatus(`Birlik bekliyor: mağara sırası. ${moduleStateText()}`);
      return;
    }
    master.pendingBirlik = false;
    master.pendingSince = 0;
    saveMaster();
    try { window.BFFloorBot?.enableAuto?.(); } catch (error) { console.error('[BF Suite] Birlik devralamadı', error); }
    setMasterStatus(waitedTooLong
      ? 'Mağara sırası zaman aşımına uğradı; birlik devraldı.'
      : 'Mağara turu bitti; birlik (oto kat) devraldı.');
  }

  // Skill basma modulu botlari gecici durdurup sonra geri acmak icin kullanir.
  window.BFMasterControl = {
    start: () => void masterStart(),
    pause: reason => void masterPause(reason || 'skill basma'),
    stop: reason => void masterStop(reason || 'dış istek'),
    status: () => ({ ...master, moduleStates: moduleStates() }),
    isRunning: () => master.state === 'running',
    // Skill basma sirasinda botlari durdurur; bitince resume() geri acar.
    async suspendForSkill() {
      if (master.state !== 'running') return false;
      await masterStopModules('skill basma sırası');
      master.state = 'paused';
      master.resumeAfterSkill = true;
      master.pendingBirlik = false;
      saveMaster();
      renderMaster();
      setMasterStatus('Skill basma için botlar duraklatıldı.');
      return true;
    },
    resumeAfterSkill() {
      if (!master.resumeAfterSkill) return false;
      master.resumeAfterSkill = false;
      saveMaster();
      void masterStart();
      return true;
    }
  };

  function energyInfo() {
    const source = document.getElementById('infobar')?.textContent || document.body?.innerText || '';
    const pairs = Array.from(source.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)\s*\/\s*(\d{1,3}(?:\.\d{3})+|\d+)/g))
      .map(match => ({ current: parseGameNumber(match[1]), max: parseGameNumber(match[2]) }))
      .filter(item => item.current !== null && item.max >= 50 && item.max <= 500 && item.current <= item.max)
      .sort((a, b) => b.max - a.max);
    if (!pairs.length) return null;
    return { ...pairs[0], percent: pairs[0].max > 0 ? pairs[0].current / pairs[0].max * 100 : 0 };
  }

  function parseGameNumber(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return digits ? Number.parseInt(digits, 10) : null;
  }

  function orbRemainingMs() {
    const orb = loadJson(ORB_KEY);
    const readyAt = Number(orb.orbReadyAt || orb.orbCollectAt || 0);
    if (!readyAt) return null;
    return Math.max(0, readyAt - Date.now());
  }

  function formatTime(ms) {
    if (ms === null) return 'okunamadı';
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
  }

  function isCavePage() {
    return /\/city\/grotte(?:\/|$)|\/report\/fightreport\/.+\/grotte/.test(location.pathname);
  }

  function caveState() {
    return loadJson(CAVE_KEY);
  }

  function coordinator() {
    return loadJson(COORD_KEY);
  }

  function ensureEnergyReserve(energy) {
    if (Number(settings.reservePercent) >= 1 && Number(settings.reservePercent) <= 5
        && Number(settings.reserveEnergy) > 0) {
      return { percent: Number(settings.reservePercent), energy: Number(settings.reserveEnergy) };
    }
    if (!energy || !Number.isFinite(energy.max) || energy.max <= 0) return null;
    const percent = Math.floor(Math.random() * 5) + 1;
    const reserveEnergy = Math.max(1, Math.round(energy.max * percent / 100));
    settings.reservePercent = percent;
    settings.reserveEnergy = reserveEnergy;
    saveSettings();
    return { percent, energy: reserveEnergy };
  }

  function navigate(url) {
    if (!url || Date.now() - lastNavigationAt < 10000 || location.href === url) return;
    lastNavigationAt = Date.now();
    location.assign(url);
  }

  // Telegram mesajlari icin okunakli sure: "3 saat 13 dk", "45 dk" gibi.
  function formatTimeTr(ms) {
    if (ms === null) return 'okunamadı';
    const totalMinutes = Math.max(1, Math.round(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours} saat ${minutes} dk`;
    if (hours > 0) return `${hours} saat`;
    return `${minutes} dk`;
  }

  let caveNotificationPending = null;
  let caveNotificationPendingType = '';

  async function sendSuiteNotification(message) {
    const docId = `orbinfo_${Date.now()}_${Math.random().toString(36).slice(2, 9) || '0'}`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${SUITE_NOTIFICATIONS_URL}?documentId=${docId}&key=${SUITE_FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            kind: { stringValue: 'info' },
            message: { stringValue: String(message).slice(0, 300) },
            host: { stringValue: location.host },
            createdAt: { stringValue: new Date().toISOString() }
          }
        }),
        keepalive: true,
        signal: controller.signal
      });
      if (!response.ok) {
        console.error('[BF Suite] Telegram bildirimi reddedildi:', response.status);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[BF Suite] Telegram bildirimi gonderilemedi.', error);
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function caveStatusSuffix() {
    const energy = energyInfo();
    const remaining = orbRemainingMs();
    const energyText = energy ? `${energy.current}/${energy.max}` : 'okunamadı';
    return `Enerji: ${energyText} · Orb yenilenme: ${formatTimeTr(remaining)}`;
  }

  async function notifyCaveStarted(reason) {
    if (settings.caveNotifyActive === true) return true;
    if (caveNotificationPending) {
      const pendingType = caveNotificationPendingType;
      const pendingResult = await caveNotificationPending;
      if (pendingType === 'start') return pendingResult;
      if (settings.caveNotifyActive === true) return true;
    }
    const pending = (async () => {
      const sent = await sendSuiteNotification(`⛏️ Mağara (zor mod) başladı: ${reason} ${caveStatusSuffix()}`);
      if (sent) {
        settings.caveNotifyActive = true;
        saveSettings();
      }
      return sent;
    })();
    caveNotificationPending = pending;
    caveNotificationPendingType = 'start';
    try {
      return await pending;
    } finally {
      if (caveNotificationPending === pending) {
        caveNotificationPending = null;
        caveNotificationPendingType = '';
      }
    }
  }

  async function notifyCaveStopped(reason) {
    if (caveNotificationPending) {
      const pendingType = caveNotificationPendingType;
      const pendingResult = await caveNotificationPending;
      if (pendingType === 'stop') return pendingResult;
    }
    if (settings.caveNotifyActive !== true) return true;
    const pending = (async () => {
      const sent = await sendSuiteNotification(`⛏️ Mağara (zor mod) durdu: ${reason}. ${caveStatusSuffix()}`);
      if (sent) {
        settings.caveNotifyActive = false;
        saveSettings();
      }
      return sent;
    })();
    caveNotificationPending = pending;
    caveNotificationPendingType = 'stop';
    try {
      return await pending;
    } finally {
      if (caveNotificationPending === pending) {
        caveNotificationPending = null;
        caveNotificationPendingType = '';
      }
    }
  }

  async function startAutoCave(reason) {
    const coord = coordinator();
    if (coord.orbPriority === true || coord.busy === true) {
      setSuiteStatus(`Mağara bekliyor: ${coord.orbPriority ? 'orb öncelikli' : 'birlik çalışıyor'}.`);
      return;
    }
    const reserve = ensureEnergyReserve(energyInfo());
    if (!reserve) {
      setSuiteStatus('Mağara bekliyor: enerji rezervi hesaplanamadı.');
      return;
    }
    const currentEnergy = energyInfo();
    if (currentEnergy && currentEnergy.current <= reserve.energy) {
      await stopAutoCave(`rastgele enerji rezervine ulaşıldı (%${reserve.percent})`);
      setSuiteStatus(`Mağara tamamlandı: %${reserve.percent} rezerv korundu (${currentEnergy.current}/${currentEnergy.max}).`);
      return;
    }
    settings.drainActive = true;
    settings.autoOwned = true;
    if (!settings.returnUrl && !isCavePage()) settings.returnUrl = String(coord.floorUrl || location.href);
    saveSettings();
    await notifyCaveStarted(reason);
    if (!isCavePage()) {
      setSuiteStatus(`${reason} Mağaraya geçiliyor…`);
      navigate(`${location.origin}/city/grotte`);
      return;
    }
    const api = window.bfGrotteLoop;
    const state = typeof api?.status === 'function' ? api.status() : caveState();
    const config = typeof api?.config === 'function' ? api.config() : null;
    if (typeof api?.configure === 'function' && config
        && (config.maxRuns !== null || Number(config.minEnergy || 0) !== 0)) {
      api.configure({ maxRuns: null, minEnergy: 0 });
    }
    if (typeof api?.start === 'function' && (!state.enabled || state.difficulty !== 'zor')) api.start('zor');
    setSuiteStatus(`${reason} Zor mod %${reserve.percent} rezerv (${reserve.energy} enerji) kalana kadar çalışıyor.`);
  }

  async function stopAutoCave(reason, destination = '') {
    if (settings.autoOwned || settings.drainActive) {
      if (typeof window.bfGrotteLoop?.stop === 'function') window.bfGrotteLoop.stop(reason);
      else {
        const state = caveState();
        localStorage.setItem(CAVE_KEY, JSON.stringify({ ...state, enabled: false, expectDifficultyClick: false, stopReason: reason, lastStoppedAt: Date.now() }));
      }
      await notifyCaveStopped(reason);
    }
    settings.drainActive = false;
    settings.autoOwned = false;
    settings.reservePercent = 0;
    settings.reserveEnergy = 0;
    const returnUrl = destination || settings.returnUrl;
    settings.returnUrl = '';
    saveSettings();
    if (returnUrl && isCavePage()) navigate(returnUrl);
  }

  function setSuiteStatus(message) {
    const status = document.querySelector(`#${ROOT_ID} [data-suite="status"]`);
    if (status) status.textContent = message;
  }

  async function automationTick() {
    attachNativePanels();
    masterTick();
    if (loadJson(ITEM_DISCARD_KEY).running === true) {
      setSuiteStatus('Profil item temizligi tamamlanana kadar otomasyon bekliyor.');
      return;
    }
    if (!settings.autoEnabled) {
      setSuiteStatus('Otomatik koordinasyon kapalı.');
      return;
    }
    if (settings.manualCavePaused) {
      setSuiteStatus('Otomatik mağara kullanıcı tarafından durduruldu. Devam Ettir düğmesine kadar başlamayacak.');
      updateCavePauseButton();
      return;
    }
    const remaining = orbRemainingMs();
    const energy = energyInfo();
    // Magara orb'dan oncelikliyse "orb korumasi" penceresi uygulanmaz: magara
    // ancak orb gercekten sirayi devraldiginda (orbPriority) durur.
    const caveOverOrb = masterRank('magara') < masterRank('orb');
    const blockMs = caveOverOrb ? 0 : settings.blockHours * 3600000;
    const conditionalMs = settings.conditionalHours * 3600000;
    const energyText = energy ? `${energy.current}/${energy.max} (%${Math.round(energy.percent)})` : 'okunamadı';
    const orb = loadJson(ORB_KEY);
    const coord = coordinator();

    if (coord.orbPriority === true || (remaining !== null && remaining <= blockMs)) {
      const reason = coord.orbPriority
        ? 'orb önceliği başladı'
        : (caveOverOrb ? 'orb küreleri hazır' : `orb süresi ${settings.blockHours} saatin altına indi`);
      await stopAutoCave(reason, orb.running === true ? `${location.origin}/robbery/index` : '');
      setSuiteStatus(`Mağara kapalı: ${reason}. Orb: ${formatTime(remaining)} · Enerji: ${energyText}`);
      return;
    }

    if (coord.busy === true) {
      await stopAutoCave('birlik botuna sıra verildi');
      setSuiteStatus(`Mağara bekliyor: birlik çalışıyor. Orb: ${formatTime(remaining)} · Enerji: ${energyText}`);
      return;
    }

    if (settings.drainActive && energy && Number(settings.reserveEnergy) > 0
        && energy.current <= Number(settings.reserveEnergy)) {
      const reservePercent = Number(settings.reservePercent) || 1;
      const reserveEnergy = Number(settings.reserveEnergy);
      await stopAutoCave(`rastgele enerji rezervine ulaşıldı (%${reservePercent})`);
      setSuiteStatus(`Mağara tamamlandı: %${reservePercent} rezerv korundu (${energy.current}/${energy.max}, hedef ${reserveEnergy}).`);
      return;
    }

    if (energy && energy.current <= 0) {
      await stopAutoCave('enerji bitti');
      setSuiteStatus(`Mağara tamamlandı: enerji bitti. Orb: ${formatTime(remaining)}`);
      return;
    }

    if (remaining === null) {
      await stopAutoCave('orb süresi okunamadı');
      setSuiteStatus(`Mağara bekliyor: orb süresi okunamadı. Enerji: ${energyText}`);
      return;
    }

    if (settings.drainActive && energy && energy.current > 0) {
      await startAutoCave(`Orb: ${formatTime(remaining)} · Enerji: ${energyText}.`);
      return;
    }

    if (remaining > conditionalMs && energy && energy.current > 0) {
      await startAutoCave(`Orb süresi ${settings.conditionalHours} saatten fazla.`);
      return;
    }

    if (remaining > blockMs && remaining <= conditionalMs && energy && energy.percent > settings.energyPercent) {
      await startAutoCave(`Enerji %${settings.energyPercent} eşiğini geçti.`);
      return;
    }

    setSuiteStatus(`Mağara bekliyor. Orb: ${formatTime(remaining)} · Enerji: ${energyText}`);
  }

  function init() {
    normalizeSettings();
    buildPanel();
    window.addEventListener('keydown', handleHotkey, true);
    // Baska sekmede yapilan ana kontrol degisikligi bu paneli de tazelesin.
    window.addEventListener('storage', event => {
      if (event.key !== MASTER_KEY) return;
      master = normalizeMaster(loadJson(MASTER_KEY, {}));
      masterListSignature = '';
      masterKeysSignature = '';
      renderMaster();
    });
    observer = new MutationObserver(() => attachNativePanels());
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => { void automationTick(); }, 1200);
    window.setInterval(() => { void automationTick(); }, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();


// =============================================================================
// SKILL BASMA (Kontrol panelindeki "Skill" sekmesi)
// Kaynak: skill-basma.user.js. Ayni localStorage anahtarlarini kullanir; ayri
// script kuruluysa cift panel olmasin diye asagidaki bayrak set edilir.
// =============================================================================
(function () {
  'use strict';

  if (window.__BFSkillTrainerIntegrated) return;
  window.__BFSkillTrainerIntegrated = true;

  const PANEL_ID = 'bf-skill-panel';
  const STYLE_ID = 'bf-skill-panel-styles';
  const STORAGE_KEY = 'btSkillTrainerConfigV1';
  const RUN_STATE_KEY = 'btSkillTrainerRunV1';
  const TAB_ID_KEY = 'btSkillTrainerTabIdV1';
  const SKILLS = [
    { id: 1, name: 'Güç', keys: ['guc', 'strength', 'starke'] },
    { id: 2, name: 'Savunma', keys: ['savunma', 'defense', 'verteidigung'] },
    { id: 3, name: 'Beceri', keys: ['beceri', 'dexterity', 'geschicklichkeit'] },
    { id: 4, name: 'Dayanıklılık', keys: ['dayaniklilik', 'endurance', 'ausdauer'] },
    { id: 5, name: 'Karizma', keys: ['karizma', 'charisma'] }
  ];
  const DISCOUNTS = {
    none: { label: 'İndirim yok', multiplier: 1 },
    30: { label: '%30', multiplier: 0.7 },
    60: { label: '%60', multiplier: 0.4 }
  };
  const DEFAULTS = { skillId: 1, count: 300, minDelay: 1, maxDelay: 3, discount: '60' };

  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  let running = false;
  let cycleTimer = null;
  let completed = 0;
  let spent = 0;

  function isProfilePage() {
    return /^\/profile\/index(?:\/|$)/.test(location.pathname);
  }

  function profileUrl() {
    return `${location.origin}/profile/index`;
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ı/g, 'i')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function parseNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? Number.parseInt(digits, 10) : 0;
  }

  function parseFirstNumber(value) {
    const match = String(value || '').match(/\d[\d.,]*/);
    return match ? parseNumber(match[0]) : 0;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('tr-TR').format(Math.max(0, Math.floor(Number(value) || 0)));
  }

  function loadConfig() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function loadRunState() {
    try {
      return JSON.parse(localStorage.getItem(RUN_STATE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveRunState(state) {
    localStorage.setItem(RUN_STATE_KEY, JSON.stringify(state));
    return state;
  }

  function saveConfig() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || !panel.querySelector('#bfs-skill')) return;
    const stored = loadConfig();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...stored,
      skillId: Number(panel.querySelector('#bfs-skill').value),
      count: Math.max(1, parseNumber(panel.querySelector('#bfs-count').value)),
      minDelay: Math.max(0, Number(panel.querySelector('#bfs-min').value) || 0),
      maxDelay: Math.max(0, Number(panel.querySelector('#bfs-max').value) || 0),
      discount: panel.querySelector('[name="bfs-discount"]:checked')?.value || 'none'
    }));
  }

  function getGold(doc = document) {
    const goldBox = doc.querySelector('div.gold, .gold');
    if (goldBox) {
      for (const node of goldBox.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const value = parseFirstNumber(node.textContent);
        if (value) return value;
      }
      const labelled = goldBox.textContent.match(/(?:altın|altin|gold)\D*([\d.,]+)/i);
      const fallbackValue = parseFirstNumber(labelled ? labelled[1] : goldBox.textContent);
      if (fallbackValue) return fallbackValue;
    }
    const direct = doc.querySelector('#gold_value, #gold_amount');
    return direct ? parseFirstNumber(direct.textContent) : 0;
  }

  function findTrainingLink(doc, skillId) {
    return [...doc.querySelectorAll(`a[href*="/profile/training/${skillId}"]`)]
      .find((link) => link.querySelector('img[src*="iconplus" i]')) ||
      doc.querySelector(`a[href*="/profile/training/${skillId}"]`);
  }

  function findRow(doc, skill) {
    const link = findTrainingLink(doc, skill.id);
    if (link?.closest('tr')) return link.closest('tr');
    return [...doc.querySelectorAll('tr')].find((row) => {
      const label = normalize(row.cells?.[0]?.textContent);
      return skill.keys.some((key) => label.includes(key));
    }) || null;
  }

  function getLevel(doc, skill) {
    const row = findRow(doc, skill);
    if (!row) return 0;
    for (const tooltip of [...row.querySelectorAll('.tooltip')]) {
      const match = normalize(tooltip.textContent).match(/(?:temel deger|base value|grundwert)\s*[:：]?\s*(\d[\d.]*)/i);
      if (match) return parseNumber(match[1]);
    }
    const levelCell = row.querySelector('td[nowrap]') || row.cells?.[1];
    if (!levelCell) return 0;
    const ownText = [...levelCell.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' ');
    const ownNumbers = ownText.match(/\d[\d.]*/g);
    if (ownNumbers?.length) return parseNumber(ownNumbers[0]);
    const numbers = levelCell.textContent.match(/\d[\d.]*/g) || [];
    return numbers.length ? parseNumber(numbers[0]) : 0;
  }

  function getTooltipCost(doc, skillId) {
    const link = findTrainingLink(doc, skillId);
    const cell = link?.closest('td');
    const tooltip = cell?.querySelector('.tooltip') || link?.parentElement?.querySelector('.tooltip');
    if (!tooltip) return 0;
    const text = tooltip.textContent || '';
    const labelled = text.match(/(?:fiyat|price|kosten)\s*[:：]?\s*([\d.,]+)/i);
    return parseNumber(labelled ? labelled[1] : text);
  }

  function skillCost(level, multiplier) {
    return Math.floor(Math.pow(Math.max(5, level) - 4, 2.4) * multiplier);
  }

  function totalCost(level, count, multiplier) {
    let total = 0;
    for (let index = 0; index < count; index += 1) total += skillCost(level + index, multiplier);
    return total;
  }

  // Eldeki altinla kac basim yapilabilir? (Her basimda maliyet arttigi icin
  // adim adim toplanir.)
  function affordableCount(level, gold, multiplier) {
    if (!level || !gold) return 0;
    let total = 0;
    let count = 0;
    while (count < 50000) {
      const next = total + skillCost(level + count, multiplier);
      if (next > gold) break;
      total = next;
      count += 1;
    }
    return count;
  }

  function selectedSkill() {
    const id = Number(document.querySelector('#bfs-skill')?.value || 1);
    return SKILLS.find((skill) => skill.id === id) || SKILLS[0];
  }

  function readForm() {
    const min = Math.max(0, Number(document.querySelector('#bfs-min').value) || 0);
    const max = Math.max(min, Number(document.querySelector('#bfs-max').value) || 0);
    return {
      skill: selectedSkill(),
      count: Math.min(50000, Math.max(1, parseNumber(document.querySelector('#bfs-count').value))),
      minDelay: min,
      maxDelay: max,
      discount: document.querySelector('[name="bfs-discount"]:checked')?.value || 'none'
    };
  }

  function setStatus(text, tone = '') {
    const el = document.querySelector('#bfs-status');
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }

  function updateProgress(total) {
    const bar = document.querySelector('#bfs-progress-bar');
    if (!bar) return;
    const percent = total ? Math.min(100, (completed / total) * 100) : 0;
    bar.style.width = `${percent}%`;
    document.querySelector('#bfs-progress-text').textContent = `${formatNumber(completed)} / ${formatNumber(total)}`;
    document.querySelector('#bfs-spent').textContent = `${formatNumber(spent)} altın`;
  }

  function formatDuration(seconds) {
    const rounded = Math.max(0, Math.round(seconds));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    return [hours ? `${hours} sa` : '', minutes ? `${minutes} dk` : '', `${secs} sn`].filter(Boolean).join(' ');
  }

  function refreshEstimate() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || !panel.querySelector('#bfs-skill') || running) return;
    const form = readForm();
    const level = getLevel(document, form.skill);
    const gold = getGold(document);
    const multiplier = DISCOUNTS[form.discount].multiplier;
    const estimate = level ? totalCost(level, form.count, multiplier) : 0;
    const secondsMin = form.count > 1 ? (form.count - 1) * form.minDelay : 0;
    const secondsMax = form.count > 1 ? (form.count - 1) * form.maxDelay : 0;
    const enough = Boolean(estimate) && Boolean(gold) && estimate <= gold;

    panel.querySelector('#bfs-current').textContent = level ? formatNumber(level) : 'Bulunamadı';
    panel.querySelector('#bfs-gold').textContent = gold ? `${formatNumber(gold)} altın` : 'Bulunamadı';
    panel.querySelector('#bfs-cost').textContent = estimate ? `${formatNumber(estimate)} altın` : 'Hesaplanamadı';
    panel.querySelector('#bfs-remaining').textContent = estimate && gold
      ? `${formatNumber(Math.max(0, gold - estimate))} altın${enough ? '' : ' · yetersiz'}`
      : '—';
    panel.querySelector('#bfs-duration').textContent = `${formatDuration(secondsMin)} – ${formatDuration(secondsMax)}`;
    panel.querySelector('#bfs-max-count').textContent = level && gold
      ? `${formatNumber(affordableCount(level, gold, multiplier))} basım`
      : '—';

    if (!level) setStatus('Skill tablosu bulunamadı; Profil > Özellikler sekmesini aç.', 'error');
    else if (!enough) setStatus('Altın tahmini maliyetin altında; basım altın bitince durur.', 'warn');
    else setStatus('Hazır · altın yeterli.', 'ready');
    saveConfig();
  }

  function randomDelay(min, max) {
    return (min + Math.random() * (max - min)) * 1000;
  }

  function renderRunState(state) {
    const owned = state?.owner === tabId;
    running = Boolean(state?.active && owned);
    completed = Math.max(0, Number(state?.completed) || 0);
    spent = Math.max(0, Number(state?.spent) || 0);
    updateProgress(Math.max(0, Number(state?.count) || 0));

    const panel = document.getElementById(PANEL_ID);
    if (!panel || !panel.querySelector('#bfs-start')) return;
    panel.querySelector('#bfs-start').disabled = Boolean(state?.active);
    panel.querySelector('#bfs-stop').disabled = !running;
    panel.querySelectorAll('input, select').forEach((input) => {
      input.disabled = running;
    });

    if (state?.active && !owned) setStatus('Basım başka sekmede çalışıyor.', 'warn');
    else if (state?.status) setStatus(state.status, state.tone || '');
  }

  // Basim bitince/durunca ana kontrol panelinde duraklatilan botlari geri ac.
  function resumeMasterIfNeeded(state) {
    if (state?.pausedMaster !== true) return;
    try { window.BFMasterControl?.resumeAfterSkill?.(); } catch { /* ana kontrol yoksa gec */ }
  }

  function finishTraining(state, status, tone) {
    clearTimeout(cycleTimer);
    const next = saveRunState({ ...state, active: false, pending: null, status, tone });
    renderRunState(next);
    resumeMasterIfNeeded(next);
  }

  function performNavigationStep() {
    const state = loadRunState();
    if (!state?.active || state.owner !== tabId || state.pending) return;
    const skill = SKILLS.find((item) => item.id === Number(state.skillId)) || SKILLS[0];
    const link = findTrainingLink(document, skill.id);
    if (!link) {
      finishTraining(state, `${skill.name} basma bağlantısı bulunamadı`, 'error');
      return;
    }

    const actualCost = getTooltipCost(document, skill.id);
    const currentGold = getGold(document);
    const currentLevel = getLevel(document, skill);
    if (actualCost && currentGold && actualCost > currentGold) {
      finishTraining(state, `Altın yetersiz · gereken ${formatNumber(actualCost)}`, 'error');
      return;
    }

    const actionUrl = new URL(link.getAttribute('href'), location.origin);
    if (!actionUrl.searchParams.get('__token')) {
      finishTraining(state, 'Güncel token bulunamadı', 'error');
      return;
    }

    const pendingState = saveRunState({
      ...state,
      pending: { level: currentLevel, gold: currentGold, cost: actualCost },
      status: `${state.completed + 1}. ${skill.name} basılıyor…`,
      tone: 'running'
    });
    renderRunState(pendingState);
    location.assign(actionUrl.href);
  }

  function scheduleNextNavigation(state) {
    clearTimeout(cycleTimer);
    const tick = () => {
      const current = loadRunState();
      if (!current?.active || current.owner !== tabId || current.pending) return;
      const remaining = Math.max(0, (current.nextAt || 0) - Date.now());
      if (remaining <= 0) {
        performNavigationStep();
        return;
      }
      setStatus(`Sonraki basım ${(remaining / 1000).toFixed(1)} sn · ${current.completed + 1}/${current.count}`, 'running');
      cycleTimer = window.setTimeout(tick, 100);
    };
    renderRunState(state);
    tick();
  }

  function resumeTraining() {
    let state = loadRunState();
    if (!state) return;
    renderRunState(state);
    if (!state.active || state.owner !== tabId) return;

    if (state.pending) {
      const skill = SKILLS.find((item) => item.id === Number(state.skillId)) || SKILLS[0];
      const currentLevel = getLevel(document, skill);
      const currentGold = getGold(document);
      const succeeded = (currentLevel > 0 && currentLevel > state.pending.level) ||
        (currentGold > 0 && state.pending.gold > 0 && currentGold < state.pending.gold);
      if (!succeeded) {
        finishTraining(state, 'Basım doğrulanamadı; işlem durduruldu', 'error');
        return;
      }

      state = saveRunState({
        ...state,
        completed: state.completed + 1,
        spent: state.spent + (state.pending.cost || 0),
        pending: null
      });
      if (state.completed >= state.count) {
        finishTraining(state, `Tamamlandı · ${state.completed} basım`, 'success');
        return;
      }
      state = saveRunState({
        ...state,
        nextAt: Date.now() + randomDelay(state.minDelay, state.maxDelay),
        status: 'Sayfa yenilendi · sonraki basım bekleniyor',
        tone: 'running'
      });
    }
    scheduleNextNavigation(state);
  }

  async function startTraining() {
    if (running) return;
    const form = readForm();
    if (!findTrainingLink(document, form.skill.id)) {
      setStatus('Önce Profil > Özellikler sekmesini aç.', 'error');
      return;
    }

    saveConfig();
    // Basim sayfa yenilemeleriyle ilerledigi icin botlar ayni sekmede gezinemez:
    // calisiyorlarsa duraklatilir, basim bitince otomatik geri acilir.
    let pausedMaster = false;
    try {
      pausedMaster = (await window.BFMasterControl?.suspendForSkill?.()) === true;
    } catch (error) {
      console.error('[BF Skill] Botlar duraklatılamadı', error);
    }

    const state = saveRunState({
      active: true,
      owner: tabId,
      skillId: form.skill.id,
      count: form.count,
      minDelay: form.minDelay,
      maxDelay: form.maxDelay,
      completed: 0,
      spent: 0,
      pending: null,
      pausedMaster,
      nextAt: Date.now(),
      status: pausedMaster ? 'Botlar duraklatıldı · basım başlıyor…' : 'Basım başlatılıyor…',
      tone: 'running'
    });
    scheduleNextNavigation(state);
  }

  function stopTraining() {
    const state = loadRunState();
    if (!state?.active || state.owner !== tabId) return;
    finishTraining(state, `Durduruldu · ${state.completed} basım tamamlandı`, 'stopped');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{color:#eadbc5;font:11px/1.35 Arial,sans-serif}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID} .bfs-box{padding:11px;border:1px solid #503a25;border-radius:10px;background:#18120e}
      #${PANEL_ID} .bfs-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      #${PANEL_ID} label{display:grid;gap:4px;color:#a99273;font-size:10px}
      #${PANEL_ID} input,#${PANEL_ID} select{width:100%;height:29px;padding:0 8px;color:#f2dfc1;background:#100c09;border:1px solid #594027;border-radius:7px;outline:none;font:inherit}
      #${PANEL_ID} input:focus,#${PANEL_ID} select:focus{border-color:#d3aa6b}
      #${PANEL_ID} .bfs-discounts{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:9px 0}
      #${PANEL_ID} .bfs-discounts label{display:block}
      #${PANEL_ID} .bfs-discounts input{position:absolute;opacity:0;pointer-events:none}
      #${PANEL_ID} .bfs-discounts span{display:block;padding:6px 3px;text-align:center;border:1px solid #4a3521;border-radius:7px;background:#120e0a;color:#a9957b;cursor:pointer;font-weight:700}
      #${PANEL_ID} .bfs-discounts input:checked+span{color:#191008;background:#d3aa6b;border-color:#e6c48c}
      #${PANEL_ID} .bfs-metrics{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#3b2c1c;border:1px solid #3b2c1c;border-radius:8px;overflow:hidden;margin:9px 0}
      #${PANEL_ID} .bfs-metric{padding:7px 8px;background:#120e0a}
      #${PANEL_ID} .bfs-metric small{display:block;color:#8d7a5f;font-size:9px;text-transform:uppercase;letter-spacing:.4px}
      #${PANEL_ID} .bfs-metric strong{display:block;margin-top:2px;font-size:11px;color:#f0d7ae}
      #${PANEL_ID} .bfs-progress{height:5px;background:#291f14;border-radius:99px;overflow:hidden}
      #${PANEL_ID} .bfs-progress i{display:block;width:0;height:100%;background:linear-gradient(90deg,#bf6c25,#f1bd62);transition:width .2s}
      #${PANEL_ID} .bfs-progress-row{display:flex;justify-content:space-between;color:#9e8566;font-size:10px;margin:6px 0 9px}
      #${PANEL_ID} .bfs-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      #${PANEL_ID} .bfs-actions button,#${PANEL_ID} .bfs-fill{padding:9px 4px;border-radius:8px;border:1px solid #5c4429;font-size:10px;font-weight:800;cursor:pointer;background:#241a12;color:#f0d7ae}
      #${PANEL_ID} .bfs-fill{width:100%;margin-bottom:7px}
      #${PANEL_ID} #bfs-start{background:linear-gradient(160deg,#2f9e44,#40c057);border-color:#49b45c;color:#06220e}
      #${PANEL_ID} #bfs-stop{background:#5a211b;border-color:#8b3b2f;color:#ffe3d5}
      #${PANEL_ID} button:disabled{opacity:.42;cursor:default}
      #${PANEL_ID} #bfs-status{margin-top:9px;padding:8px;border-radius:7px;background:#0d0a08;border:1px solid #352719;border-left-width:3px;color:#c9b497;min-height:32px}
      #${PANEL_ID} #bfs-status[data-tone=running]{border-left-color:#d89a3d;color:#efc982}
      #${PANEL_ID} #bfs-status[data-tone=success]{border-left-color:#4daa72;color:#8ed6aa}
      #${PANEL_ID} #bfs-status[data-tone=warn]{border-left-color:#e8a317;color:#ffd479}
      #${PANEL_ID} #bfs-status[data-tone=error]{border-left-color:#c94d4d;color:#ef9999}
      #${PANEL_ID} .bfs-note{padding:11px;border:1px solid #503a25;border-radius:10px;background:#18120e;color:#c9b497;line-height:1.5}
      #${PANEL_ID} .bfs-note button{margin-top:9px;width:100%;padding:9px 4px;border-radius:8px;border:1px solid #5c4429;background:#241a12;color:#f0d7ae;font-size:10px;font-weight:800;cursor:pointer}
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (!document.body || document.getElementById(PANEL_ID)) return;
    injectStyles();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    if (!isProfilePage()) {
      panel.innerHTML = `<div class="bfs-note">
        Skill basma yalnızca <strong>Profil &gt; Özellikler</strong> sayfasında çalışır.
        Basım sırasında botlar otomatik duraklatılır, bitince geri açılır.
        <button type="button" id="bfs-goto">Profil sayfasını aç</button>
      </div>`;
      document.body.appendChild(panel);
      panel.querySelector('#bfs-goto').addEventListener('click', () => location.assign(profileUrl()));
      return;
    }

    const config = loadConfig();
    panel.innerHTML = `
      <div class="bfs-box">
        <div class="bfs-grid">
          <label>Skill<select id="bfs-skill">${SKILLS.map((skill) => `<option value="${skill.id}"${skill.id === Number(config.skillId) ? ' selected' : ''}>${skill.name}</option>`).join('')}</select></label>
          <label>Basım adedi<input id="bfs-count" type="number" min="1" max="50000" value="${config.count}"></label>
          <label>Min. bekleme (sn)<input id="bfs-min" type="number" min="0" step="0.1" value="${config.minDelay}"></label>
          <label>Maks. bekleme (sn)<input id="bfs-max" type="number" min="0" step="0.1" value="${config.maxDelay}"></label>
        </div>
        <div class="bfs-discounts" role="radiogroup" aria-label="Skill indirimi">
          ${Object.entries(DISCOUNTS).map(([value, item]) => `<label><input type="radio" name="bfs-discount" value="${value}"${String(config.discount) === value ? ' checked' : ''}><span>${item.label}</span></label>`).join('')}
        </div>
        <div class="bfs-metrics">
          <div class="bfs-metric"><small>Mevcut skill</small><strong id="bfs-current">—</strong></div>
          <div class="bfs-metric"><small>Mevcut altın</small><strong id="bfs-gold">—</strong></div>
          <div class="bfs-metric"><small>Tahmini maliyet</small><strong id="bfs-cost">—</strong></div>
          <div class="bfs-metric"><small>Tahmini kalan</small><strong id="bfs-remaining">—</strong></div>
          <div class="bfs-metric"><small>Süre aralığı</small><strong id="bfs-duration">—</strong></div>
          <div class="bfs-metric"><small>Altın yeter</small><strong id="bfs-max-count">—</strong></div>
        </div>
        <button class="bfs-fill" id="bfs-max-btn" type="button">Altının yettiği kadar bas</button>
        <div class="bfs-progress"><i id="bfs-progress-bar"></i></div>
        <div class="bfs-progress-row"><span>İlerleme</span><strong id="bfs-progress-text">0 / 0</strong></div>
        <div class="bfs-progress-row"><span>Gerçek harcama</span><strong id="bfs-spent">0 altın</strong></div>
        <div class="bfs-actions">
          <button id="bfs-start" type="button">Basmayı başlat</button>
          <button id="bfs-stop" type="button" disabled>Durdur</button>
        </div>
        <div id="bfs-status" data-tone="ready">Hazır</div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelectorAll('input, select').forEach((input) => input.addEventListener('input', refreshEstimate));
    panel.querySelector('#bfs-start').addEventListener('click', () => void startTraining());
    panel.querySelector('#bfs-stop').addEventListener('click', stopTraining);
    panel.querySelector('#bfs-max-btn').addEventListener('click', () => {
      const form = readForm();
      const level = getLevel(document, form.skill);
      const gold = getGold(document);
      const max = affordableCount(level, gold, DISCOUNTS[form.discount].multiplier);
      if (!max) {
        setStatus('Altın tek basıma bile yetmiyor.', 'error');
        return;
      }
      panel.querySelector('#bfs-count').value = max;
      refreshEstimate();
    });
    refreshEstimate();
  }

  function init() {
    // Ayri kurulu skill-basma.user.js paneli varsa cift panel olusmasin.
    document.getElementById('bt-skill-trainer')?.remove();
    buildPanel();
    resumeTraining();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
