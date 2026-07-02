// --- BROWSER EXTENSION SHIMS FOR TAMPERMONKEY ---
function GM_addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
}

function GM_getValue(key, defaultValue) {
    const val = localStorage.getItem(key);
    if (val === null) return defaultValue;
    try {
        // Tampermonkey stores objects as JSON or raw. We try to parse first.
        return JSON.parse(val);
    } catch (e) {
        return val;
    }
}

function GM_setValue(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// --- ORIGINAL CODE BELOW (PRESERVING INTEGRITY) ---

(function () {
    'use strict';

    if (window.bf_elite_loaded) return;
    window.bf_elite_loaded = true;

    GM_addStyle(`
        #bot-status-panel {
            background: rgba(10, 10, 12, 0.98) !important;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(155, 89, 182, 0.3) !important;
            border-right: 4px solid #9b59b6 !important;
            padding: 8px !important;
            border-radius: 12px 0 0 12px;
            position: fixed !important;
            top: 5px !important; right: 0 !important;
            z-index: 9999999 !important;
            color: #f8f9fa;
            font-family: 'Inter', sans-serif;
            width: 240px !important;
            max-height: 98vh;
            overflow-y: auto;
            box-shadow: -10px 0 50px rgba(0,0,0,0.8);
            scrollbar-width: none;
        }
        #bot-status-panel.minimized {
            width: 35px !important; height: 180px !important; border-radius: 12px 0 0 12px;
            right: 0 !important; top: 120px !important; padding: 0 !important;
            background: rgba(155, 89, 182, 0.6) !important;
            border-right: 4px solid #9b59b6 !important;
            overflow: hidden; cursor: pointer; z-index: 10000001 !important;
        }
        .mini-icon { 
            display: none; writing-mode: vertical-rl; transform: rotate(180deg); 
            height: 100%; width: 100%; justify-content: center; align-items: center; 
            font-size: 11px; font-weight: 900; color: #fff; letter-spacing: 2px;
            text-transform: uppercase; pointer-events: none;
        }
        #bot-status-panel.minimized .mini-icon { display: flex; }
        #bot-status-panel.minimized > *:not(.mini-icon) { display: none !important; }
        .bot-brand { font-size: 11px !important; font-weight: 900; letter-spacing: 0.5px; }
        .bot-brand span { color: #9b59b6; }
        .bot-status-tag { font-size: 7px !important; padding: 1px 5px !important; border-radius: 8px; font-weight: 900; text-transform: uppercase; }
        
        .bot-section { margin-bottom: 6px !important; position: relative; }
        .bot-section-title { 
            font-size: 8px !important; color: rgba(255,255,255,0.25); font-weight: 800; 
            text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px !important;
            display: flex; align-items: center; gap: 5px;
        }
        .bot-section-title::after { content: ""; flex: 1; height: 1px; background: rgba(155, 89, 182, 0.08); }

        .bot-card { background: rgba(255,255,255,0.01); border-radius: 8px; padding: 5px 8px !important; border: 1px solid rgba(255,255,255,0.02); }
        
        .bot-row { margin-bottom: 3px !important; display: flex; justify-content: space-between; align-items: center; font-size: 10px; }
        .bot-row:last-child { margin-bottom: 0; }
        .bot-label { font-size: 8px !important; color: rgba(255,255,255,0.3); }
        
        .bot-select, .bot-input { 
            background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.08); 
            border-radius: 5px; padding: 2px 6px !important; width: 100%; font-size: 9px !important; outline: none;
        }
        
        .grotto-grid, .train-grid-v3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px !important; }
        .train-grid-v3 { grid-template-columns: repeat(5, 1fr); }
        
        .grid-btn { 
            background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); 
            color: rgba(255,255,255,0.3); padding: 2px 0 !important; border-radius: 4px !important; 
            font-size: 8px !important; font-weight: 700; cursor: pointer;
        }
        .grid-btn.active { background: #9b59b6 !important; color: #fff !important; border-color: #9b59b6 !important; }
        
        .bot-btn-main { 
            background: #2ecc71; color: #fff; border: none; padding: 8px !important; 
            border-radius: 8px; cursor: pointer; font-size: 11px !important; font-weight: 900; 
            width: 100%; margin-top: 5px; text-transform: uppercase;
        }
        
        #bot-logs { 
            max-height: 45px !important; overflow-y: auto; font-size: 8px !important; 
            background: rgba(0,0,0,0.2); padding: 3px; border-radius: 6px;
            scrollbar-width: none;
        }
        #bot-logs::-webkit-scrollbar { display: none; }
        
        input[type=range] { width: 100%; appearance: none; background: rgba(255,255,255,0.05); height: 3px; border-radius: 10px; margin: 8px 0; }
        input[type=range]::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; background: #9b59b6; border-radius: 50%; border: 2px solid #fff; }
        
        .history-item { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 10px; }
    `);

    console.log("[BOT] Iniciando carga de compatibilidad absoluta...");

    // --- CONFIGURACIÓN DE TROPAS SEGÚN CAPA (1-47) ---
    var TROOP_PRESETS = {
        1: { lobo: 7, dev: 2, caz: 0, terr: 0 },
        2: { lobo: 5, dev: 3, caz: 1, terr: 1 },
        3: { lobo: 11, dev: 2, caz: 1, terr: 1 },
        4: { lobo: 13, dev: 3, caz: 2, terr: 1 },
        5: { lobo: 14, dev: 3, caz: 2, terr: 2 },
        6: { lobo: 16, dev: 4, caz: 3, terr: 2 },
        7: { lobo: 21, dev: 5, caz: 4, terr: 1 },
        8: { lobo: 24, dev: 4, caz: 4, terr: 2 },
        9: { lobo: 24, dev: 5, caz: 4, terr: 3 },
        10: { lobo: 27, dev: 4, caz: 4, terr: 4 },
        11: { lobo: 11, dev: 14, caz: 14, terr: 1 },
        12: { lobo: 14, dev: 14, caz: 15, terr: 1 },
        13: { lobo: 16, dev: 16, caz: 15, terr: 1 },
        14: { lobo: 18, dev: 18, caz: 15, terr: 1 },
        15: { lobo: 24, dev: 20, caz: 13, terr: 1 },
        16: { lobo: 26, dev: 22, caz: 13, terr: 1 },
        17: { lobo: 28, dev: 24, caz: 13, terr: 1 },
        18: { lobo: 30, dev: 26, caz: 13, terr: 1 },
        19: { lobo: 32, dev: 28, caz: 13, terr: 1 },
        20: { lobo: 34, dev: 30, caz: 13, terr: 1 },
        21: { lobo: 36, dev: 20, caz: 15, terr: 4 },
        22: { lobo: 30, dev: 25, caz: 15, terr: 5 },
        23: { lobo: 32, dev: 27, caz: 15, terr: 5 },
        24: { lobo: 37, dev: 27, caz: 15, terr: 5 },
        25: { lobo: 35, dev: 28, caz: 16, terr: 6 },
        26: { lobo: 36, dev: 31, caz: 14, terr: 7 },
        27: { lobo: 35, dev: 27, caz: 20, terr: 7 },
        28: { lobo: 31, dev: 28, caz: 22, terr: 8 },
        29: { lobo: 35, dev: 30, caz: 21, terr: 8 },
        30: { lobo: 35, dev: 32, caz: 22, terr: 8 },
        31: { lobo: 50, dev: 37, caz: 11, terr: 6 },
        32: { lobo: 56, dev: 42, caz: 10, terr: 6 },
        33: { lobo: 68, dev: 35, caz: 10, terr: 7 },
        34: { lobo: 60, dev: 38, caz: 9, terr: 10 },
        35: { lobo: 68, dev: 41, caz: 11, terr: 5 },
        36: { lobo: 60, dev: 38, caz: 9, terr: 10 },
        37: { lobo: 69, dev: 41, caz: 11, terr: 5 },
        38: { lobo: 68, dev: 41, caz: 12, terr: 6 },
        39: { lobo: 65, dev: 45, caz: 15, terr: 5 },
        40: { lobo: 51, dev: 51, caz: 13, terr: 9 },
        41: { lobo: 53, dev: 53, caz: 13, terr: 9 },
        42: { lobo: 70, dev: 43, caz: 10, terr: 10 },
        43: { lobo: 60, dev: 40, caz: 16, terr: 12 },
        44: { lobo: 58, dev: 65, caz: 10, terr: 7 },
        45: { lobo: 65, dev: 45, caz: 16, terr: 10 },
        46: { lobo: 64, dev: 69, caz: 10, terr: 5 },
        47: { lobo: 60, dev: 57, caz: 14, terr: 9 }
    };

    var SELECTORS = {
        spheres: ".slot, .extraction-spheres-percentage, #essence_percent, .essences_percent",
        orbFilled: "img[src*='BloodOrbFilled']",
        orbEmpty: "img[src*='BloodOrbEmpty']",
        sanctuaryBtn: "a[href*='crimson_sanctuary'], a[href*='ancestors_pits'], a[href*='ancestral'], a[href*='nourishing'], .menu_sanctuary",
        huntBtn: "a[href*='human_hunt'], a[href*='robbery'], .menu_humanhunt",
        extractBtnId: "#extractBloodBtn",
        extractEssenceBtnId: "#extractEssenceBtn",
        genericExtract: "button[onclick*='extract'], button[onclick*='harvest']",
        fightBtnId: "#fightBtn",
        repeatHunt: "button.btn"
    };

    // --- SISTEMA DE AISLAMIENTO POR ID (NECESARIO PARA MULTI-CUENTA) ---
    function getPlayerID() {
        var profileLink = document.querySelector("a[href*='profile/player/']");
        if (profileLink) {
            var match = profileLink.href.match(/player\/(\d+)/);
            if (match) return match[1];
        }
        return null;
    }

    function normalizeId(id) {
        if (!id) return null;
        return id.toString().trim().replace(/^0+/, '');
    }

    var current_server = (function () {
        var h = location.hostname.toLowerCase();
        var m = h.match(/^([a-z0-9\-]+)\.bitefight/);
        return m ? m[1] : h;
    })();

    console.log("[BOT] Iniciando BeetleJuice Elite 2.2...");

    var current_detected_id = (function () {
        try {
            // 1. PRIORIDAD: Detección en el DOM (ID REAL EN PANTALLA)
            var profileSelectors = [
                "a[href*='profile/player/']",
                "a[href*='/msg/write/']",
                "a[href*='/settings/index/']",
                "#character_name a",
                ".charlink"
            ];
            var id = null;
            
            // Intentar detectar ID en tabla de perfil (Spieler-ID)
            var cells = document.querySelectorAll('td');
            for(var i=0; i<cells.length; i++) {
                var txt = cells[i].innerText;
                if(txt.indexOf('ID:') !== -1 || txt.indexOf('Spieler-ID') !== -1) {
                    var next = cells[i].nextElementSibling;
                    if(next && /^\d+$/.test(next.innerText.trim())) {
                        id = next.innerText.trim();
                        break;
                    }
                }
            }

            if (!id) {
                for (var s = 0; s < profileSelectors.length; s++) {
                    var node = document.querySelector(profileSelectors[s]);
                    if (node) {
                        var href = node.getAttribute('href') || "";
                        var match = href.match(/player\/(\d+)|write\/(\d+)/);
                        if (match) { id = match[1] || match[2]; if (id) break; }
                    }
                }
            }

            if (id) {
                id = normalizeId(id);
                sessionStorage.setItem('bf_sticky_id', id);
                GM_setValue("last_id_" + current_server, id);
                return id;
            }

            // 2. PRIORIDAD: Sticky ID en sessionStorage (Fallback)
            var sticky = sessionStorage.getItem('bf_sticky_id');
            if (sticky) return normalizeId(sticky);

            // 3. PRIORIDAD: Caché persistente (GM_getValue)
            var cached = GM_getValue("last_id_" + current_server);
            if (cached) return normalizeId(cached);

            return "15670"; // Fallback final
        } catch(e) { return "15670"; }
    })();

    function getUniqueKey(baseKey) {
        return current_server + "_" + current_detected_id + "_" + baseKey;
    }

    console.log("[BOT] ID Detectado:", current_detected_id);

    // CARGA DE CONFIGURACIÓN AISLADA
    var botEnabled = GM_getValue(getUniqueKey("botEnabled"), false);
    var botMode = GM_getValue(getUniqueKey("botMode"), "hunt"); // DEFAULT CAMBIADO A HUNT
    var huntLevel = GM_getValue(getUniqueKey("huntLevel"), 5);
    var limitLayer = GM_getValue(getUniqueKey("limitLayer"), 10);
    var sanctuaryOnly = GM_getValue(getUniqueKey("sanctuaryOnly"), false);
    var USER_PRESETS = GM_getValue(getUniqueKey("userPresets"), {});
    var grottoActive = GM_getValue(getUniqueKey("grottoActive"), false);
    var grottoDifficulty = GM_getValue(getUniqueKey("grottoDifficulty"), 1); // 1=Fácil, 2=Medio, 3=Difícil
    var grottoDelay = GM_getValue(getUniqueKey("grottoDelay"), 5);
    var grottoCount = 0;

    // CONFIGURACIÓN ENTRENAMIENTO
    var trainEnabled = GM_getValue(getUniqueKey("trainEnabled"), {});
    var trainCosts = GM_getValue(getUniqueKey("trainCosts"), { 1: 50000, 2: 50000, 3: 50000, 4: 50000, 5: 50000 });
    var lastTrainCheck = GM_getValue(getUniqueKey("lastTrainCheck"), 0);
    var lastHandledGold = 0;

    // CONFIGURACIÓN CACERÍA AVANZADA
    var rankS_active = GM_getValue(getUniqueKey("rankS_active"), true);
    var rankA_active = GM_getValue(getUniqueKey("rankA_active"), true);
    var rankB_active = GM_getValue(getUniqueKey("rankB_active"), true);

    // NUEVO: CONFIGURACIÓN RELOJ RUINAS (10-15 min)
    var lastRuinCheck = GM_getValue(getUniqueKey("lastRuinCheck"), 0);
    var nextRuinDelay = GM_getValue(getUniqueKey("nextRuinDelay"), getRandomDelay(600000, 300000));
    var checkedInCycle = GM_getValue(getUniqueKey("checkedInCycle"), []);

    // --- RANDOMIZER HUMANO ---
    var randomizerEnabled = GM_getValue(getUniqueKey("randomizerEnabled"), false);
    var randomizerMax = GM_getValue(getUniqueKey("randomizerMax"), 5000);

    // --- FUNCIÓN DE ALEATORIEDAD HUMANA ---
    function getRandomDelay(base, maxJitter) {
        if (randomizerEnabled) {
            // Reducimos el mínimo al 35% del máximo para que la diferencia en segundos sea muy notable
            var rMin = Math.max(2100, randomizerMax * 0.35);
            var rMax = randomizerMax;
            var delay = Math.floor(Math.random() * (rMax - rMin + 1)) + rMin;
            return delay;
        }
        var minSafety = 2000;
        var calculated = base + Math.floor(Math.random() * maxJitter);
        return Math.max(calculated, minSafety);
    }

    // --- VARIABLES DE ELITE 2.2 (SaaS) ---
    var WATCHDOG_TIME = 150000; // 150s para multi-cuenta / segundo plano
    var lastInteraction = Date.now();
    var FIREBASE_URL = "https://beetlejuice-bf-bot-ruins-default-rtdb.firebaseio.com/";

    function updateWatchdog() {
        lastInteraction = Date.now();
    }

    function log(msg) {
        var now = new Date();
        var date = String(now.getDate()).padStart(2, '0') + "/" + String(now.getMonth() + 1).padStart(2, '0') + "/" + String(now.getFullYear()).slice(-2);
        var time = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0') + ":" + String(now.getSeconds()).padStart(2, '0') + "." + String(now.getMilliseconds()).padStart(3, '0');
        var fullStamp = `[${date} ${time}]`;

        console.log(`${fullStamp} [BOT]: ${msg}`);

        // PERSISTENCIA EN HISTORIAL (Última hora)
        var history = GM_getValue(getUniqueKey("botLogsHistory"), []);
        var sixtyMinsAgo = Date.now() - 3600000;
        history = history.filter(item => item.t > sixtyMinsAgo);
        history.push({ t: Date.now(), s: fullStamp, m: msg });
        GM_setValue(getUniqueKey("botLogsHistory"), history);

        var logPanel = document.getElementById('bot-logs');
        if (logPanel) {
            const stampSpan = document.createElement('span');
            stampSpan.style.color = "#666";
            stampSpan.style.fontFamily = "monospace";
            stampSpan.style.fontSize = "9px";
            stampSpan.style.marginRight = "5px";
            stampSpan.textContent = fullStamp;

            const msgSpan = document.createElement('span');
            msgSpan.style.color = "#bdc3c7";
            msgSpan.textContent = msg;

            item.appendChild(stampSpan);
            item.appendChild(msgSpan);
            logPanel.appendChild(item);
            logPanel.scrollTop = logPanel.scrollHeight;
        }
    }

    function injectUI() {
        if (!document.body) {
            console.log("[BOT] Esperando a document.body...");
            return;
        }
        if (document.getElementById('bot-status-panel')) return;
        
        console.log("[BOT] Iniciando renderizado de panel Premium v3...");
        try {
            var panel = document.createElement('div');
            panel.id = 'bot-status-panel';
            if (GM_getValue("botMinimized", false) === true) panel.classList.add('minimized');

            const htmlContent = `
                <div class="mini-icon">BEETLEJUICE ELITE</div>
                <div class="bot-header">
                    <div class="bot-brand">BEETLEJUICE <span>ELITE</span></div>
                    <div id="bot-status-text" class="bot-status-tag"></div>
                    <button id="bot-minimize-btn" style="background:none; border:none; color:#555; cursor:pointer; font-size:20px;">−</button>
                </div>
                
                <div class="bot-main-layout" style="display:block;">
                    <!-- CONFIGURACIÓN -->
                    <div class="bot-section">
                        <div class="bot-section-title">CONFIGURACIÓN</div>
                        <div class="bot-card">
                            <div class="bot-row">
                                <span class="bot-label">ID SESIÓN:</span>
                                <span id="bot-detected-id-val" style="color:#f1c40f; font-weight:bold;"></span>
                            </div>
                            <div class="bot-row">
                                <select id="bot-mode-selector" class="bot-select">
                                    <option value="hunt">MODO: CACERÍA</option>
                                    <option value="grotto">MODO: GRUTA</option>
                                    <option value="ruins">MODO: RUINAS</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- CACERÍA -->
                    <div class="bot-section">
                        <div class="bot-section-title">CACERÍA</div>
                        <div class="bot-card">
                            <div class="bot-row">
                                <select id="bot-hunt-level" class="bot-select">
                                    <option value="1">NIVEL: GRANJA</option>
                                    <option value="2">NIVEL: ALDEA</option>
                                    <option value="3">NIVEL: VILLA</option>
                                    <option value="4">NIVEL: CIUDAD</option>
                                    <option value="5">NIVEL: G. CIUDAD</option>
                                </select>
                            </div>
                            <div class="bot-row" style="justify-content:center; gap:12px; margin-top:5px;">
                                <label style="font-size:10px;"><input type="checkbox" id="check-rank-s"> S</label>
                                <label style="font-size:10px;"><input type="checkbox" id="check-rank-a"> A</label>
                                <label style="font-size:10px;"><input type="checkbox" id="check-rank-b"> B</label>
                            </div>
                        </div>
                    </div>

                    <!-- GRUTA & ENTRENAMIENTO -->
                    <div class="bot-section">
                        <div class="bot-section-title">GRUTA & GYM</div>
                        <div class="bot-card">
                            <div class="grotto-grid">
                                <button class="grid-btn grotto" id="grotto-diff-1" data-diff="1">FÁCIL</button>
                                <button class="grid-btn grotto" id="grotto-diff-2" data-diff="2">MEDIO</button>
                                <button class="grid-btn grotto" id="grotto-diff-3" data-diff="3">DIFÍCIL</button>
                            </div>
                            <div class="train-grid-v3" style="margin-top:10px;">
                                <button class="grid-btn train" id="train-stat-1" data-stat="1">FUE</button>
                                <button class="grid-btn train" id="train-stat-2" data-stat="2">DEF</button>
                                <button class="grid-btn train" id="train-stat-3" data-stat="3">DES</button>
                                <button class="grid-btn train" id="train-stat-4" data-stat="4">RES</button>
                                <button class="grid-btn train" id="train-stat-5" data-stat="5">CAR</button>
                            </div>
                        </div>
                    </div>

                    <!-- RUINAS -->
                    <div class="bot-section">
                        <div class="bot-section-title">RUINAS ANCESTRALES</div>
                        <div class="bot-card">
                            <div class="bot-row">
                                <span class="bot-label">CAPA LÍMITE:</span>
                                <input type="number" id="bot-limit-layer" class="bot-input" style="width:50px; text-align:center;">
                            </div>
                            <button id="open-troop-config" class="bot-btn-main" style="background:rgba(155, 89, 182, 0.2); color:#9b59b6; border:1px solid rgba(155, 89, 182, 0.3); padding:8px; font-size:10px;">GESTIONAR TROPAS</button>
                        </div>
                    </div>

                    <!-- RANDOMIZER -->
                    <div class="bot-section">
                        <div class="bot-section-title">HUMAN RANDOMIZER</div>
                        <div class="bot-card">
                            <div class="bot-row">
                                <select id="bot-randomizer-toggle" class="bot-select" style="width:70px;">
                                    <option value="false">OFF</option>
                                    <option value="true">ON</option>
                                </select>
                                <div style="font-size:10px; color:#2ecc71; font-weight:bold;">
                                    <span id="randomizer-min-val"></span>s - <span id="randomizer-val"></span>s
                                </div>
                            </div>
                            <input type="range" id="bot-randomizer-slider" min="3000" max="8000" step="100">
                        </div>
                    </div>

                    <!-- REGISTRO -->
                    <div class="bot-section">
                        <div class="bot-section-title">ACTIVIDAD</div>
                        <div id="bot-logs"></div>
                        <div style="display:flex; gap:8px; margin-top:15px;">
                            <button id="toggle-bot" class="bot-btn-main" style="flex:2;"></button>
                            <button id="open-history" class="bot-btn-main" style="background:#34495e; width:60px;">LOGS</button>
                            <button id="clear-logs" class="bot-btn-main" style="background:#c0392b; width:45px;">✖</button>
                        </div>
                    </div>
                </div>

                <div id="bot-troop-config-section" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(10,10,12,0.99); border-radius:12px; padding:12px; z-index:10001; box-shadow:0 0 30px rgba(0,0,0,0.8);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div class="bot-section-title" style="margin:0;">EDITOR DE TROPAS</div>
                        <button id="close-troop-config" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-weight:bold; font-size:14px;">✕</button>
                    </div>
                    <div class="bot-row">
                        <span class="bot-label">CAPA A EDITAR:</span>
                        <select id="layer-to-edit" class="bot-select" style="width:100px;">
                            ${(function () { var o = ""; for (var i = 1; i <= 47; i++) o += '<option value="' + i + '">Capa ' + i + '</option>'; return o; })()}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-top:8px;">
                        <div class="bot-row"><span class="bot-label">U1:</span><input type="number" id="in-u1" class="bot-input" style="width:60px;"></div>
                        <div class="bot-row"><span class="bot-label">U2:</span><input type="number" id="in-u2" class="bot-input" style="width:60px;"></div>
                        <div class="bot-row"><span class="bot-label">U3:</span><input type="number" id="in-u3" class="bot-input" style="width:60px;"></div>
                        <div class="bot-row"><span class="bot-label">U4:</span><input type="number" id="in-u4" class="bot-input" style="width:60px;"></div>
                        <div class="bot-row"><span class="bot-label">U5:</span><input type="number" id="in-u5" class="bot-input" style="width:60px;"></div>
                        <div class="bot-row"><span class="bot-label">U6:</span><input type="number" id="in-u6" class="bot-input" style="width:60px;"></div>
                        <div class="bot-row"><span class="bot-label">U7:</span><input type="number" id="in-u7" class="bot-input" style="width:60px;"></div>
                        <div class="bot-row"><span class="bot-label">U8:</span><input type="number" id="in-u8" class="bot-input" style="width:60px;"></div>
                    </div>
                    <button id="save-layer-config" class="bot-btn-main" style="background:#2ecc71; margin-top:12px; padding:10px !important;">GUARDAR PRESET</button>
                </div>

                <div id="bot-history-modal">
                    <div class="history-content">
                        <div class="history-header">
                            <span>📜 HISTORIAL BEETLEJUICE ELITE</span>
                            <span class="history-close" id="close-history" style="cursor:pointer; font-size:24px;">&times;</span>
                        </div>
                        <div class="history-list" id="history-container"></div>
                    </div>
                </div>
            `;
            panel.innerHTML = htmlContent;

            // Sync values safely
            const idVal = panel.querySelector('#bot-detected-id-val');
            if (idVal) idVal.textContent = current_detected_id;

            const st = panel.querySelector('#bot-status-text');
            if (st) {
                st.textContent = botEnabled ? 'ACTIVO' : 'PAUSADO';
                st.style.background = botEnabled ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)';
                st.style.color = botEnabled ? '#2ecc71' : '#e74c3c';
            }

            const toggleBtn = panel.querySelector('#toggle-bot');
            if (toggleBtn) {
                toggleBtn.textContent = botEnabled ? 'DETENER' : 'INICIAR';
                toggleBtn.style.background = botEnabled ? '#e67e22' : '#2ecc71';
            }

            const modeSelector = panel.querySelector('#bot-mode-selector');
            if (modeSelector) modeSelector.value = botMode;

            const huntSelector = panel.querySelector('#bot-hunt-level');
            if (huntSelector) huntSelector.value = huntLevel;

            const rankS = panel.querySelector('#check-rank-s'); if (rankS) rankS.checked = rankS_active;
            const rankA = panel.querySelector('#check-rank-a'); if (rankA) rankA.checked = rankA_active;
            const rankB = panel.querySelector('#check-rank-b'); if (rankB) rankB.checked = rankB_active;

            const limitInput = panel.querySelector('#bot-limit-layer'); if (limitInput) limitInput.value = limitLayer;

            const randomToggle = panel.querySelector('#bot-randomizer-toggle'); if (randomToggle) randomToggle.value = randomizerEnabled.toString();
            const randomSlider = panel.querySelector('#bot-randomizer-slider'); if (randomSlider) randomSlider.value = randomizerMax;
            
            const rMinVal = panel.querySelector('#randomizer-min-val'); if (rMinVal) rMinVal.textContent = (Math.max(2100, randomizerMax * 0.35) / 1000).toFixed(1);
            const rVal = panel.querySelector('#randomizer-val'); if (rVal) rVal.textContent = (randomizerMax / 1000).toFixed(1);

            // Set active states for grids
            if (grottoActive) {
                const gBtn = panel.querySelector(`#grotto-diff-${grottoDifficulty}`);
                if (gBtn) gBtn.classList.add('active');
            }
            for (let s = 1; s <= 5; s++) {
                if (trainEnabled[s]) {
                    const tBtn = panel.querySelector(`#train-stat-${s}`);
                    if (tBtn) tBtn.classList.add('active');
                }
            }
            document.body.appendChild(panel);

            // EVENTOS
            document.getElementById('bot-minimize-btn').onclick = (e) => {
                e.stopPropagation();
                panel.classList.add('minimized');
                GM_setValue("botMinimized", true);
            };

            panel.onclick = () => {
                if (panel.classList.contains('minimized')) {
                    panel.classList.remove('minimized');
                    GM_setValue("botMinimized", false);
                }
            };

            document.getElementById('toggle-bot').onclick = function () {
                botEnabled = !botEnabled;
                GM_setValue(getUniqueKey("botEnabled"), botEnabled);
                this.innerText = botEnabled ? "DETENER" : "INICIAR";
                this.style.background = botEnabled ? "#e67e22" : "#2ecc71";
                var st = document.getElementById('bot-status-text');
                if (st) {
                    st.innerText = botEnabled ? "ACTIVO" : "PAUSADO";
                    st.style.background = botEnabled ? "rgba(46,204,113,0.1)" : "rgba(231,76,60,0.1)";
                    st.style.color = botEnabled ? "#2ecc71" : "#e74c3c";
                }
                log(botEnabled ? "🟢 Bot Iniciado" : "🔴 Bot Detenido");
                if (botEnabled) mainLoop();
            };

            window.updateUIValues = function () {
                var st = document.getElementById('bot-status-text');
                if (st) {
                    st.innerText = botEnabled ? "ACTIVO" : "PAUSADO";
                    st.style.color = botEnabled ? "#2ecc71" : "#e74c3c";
                }
            };

            document.getElementById('bot-mode-selector').onchange = function () { botMode = this.value; GM_setValue(getUniqueKey("botMode"), botMode); log("Modo: " + botMode); };
            document.getElementById('bot-hunt-level').onchange = function () { huntLevel = parseInt(this.value); GM_setValue(getUniqueKey("huntLevel"), huntLevel); log("Nivel: " + huntLevel); };
            
            ['s','a','b'].forEach(r => {
                document.getElementById('check-rank-'+r).onchange = function() {
                    if(r==='s') rankS_active=this.checked; if(r==='a') rankA_active=this.checked; if(r==='b') rankB_active=this.checked;
                    GM_setValue(getUniqueKey("rank"+r.toUpperCase()+"_active"), this.checked);
                    log("Filtro "+r.toUpperCase()+": "+(this.checked?"ON":"OFF"));
                };
            });

            document.getElementById('bot-limit-layer').onchange = function () { limitLayer = parseInt(this.value) || 1; GM_setValue(getUniqueKey("limitLayer"), limitLayer); log("Capa: " + limitLayer); };

            document.getElementById('open-troop-config').onclick = function () {
                document.getElementById('bot-troop-config-section').style.display = 'block';
                updateLayerInputs(parseInt(document.getElementById('layer-to-edit').value));
            };

            document.getElementById('close-troop-config').onclick = function () {
                document.getElementById('bot-troop-config-section').style.display = 'none';
            };

            document.getElementById('layer-to-edit').onchange = function () { updateLayerInputs(parseInt(this.value)); };
            document.getElementById('save-layer-config').onclick = function () {
                const l = parseInt(document.getElementById('layer-to-edit').value);
                const v = id => parseInt(document.getElementById(id).value) || 0;
                USER_PRESETS[l] = { u1: v('in-u1'), u2: v('in-u2'), u3: v('in-u3'), u4: v('in-u4'), u5: v('in-u5'), u6: v('in-u6'), u7: v('in-u7'), u8: v('in-u8') };
                GM_setValue(getUniqueKey("userPresets"), USER_PRESETS);
                log("✅ Capa " + l + " guardada.");
            };

            function updateLayerInputs(l) {
                const t = USER_PRESETS[l] || TROOP_PRESETS[l] || {};
                for (let i = 1; i <= 8; i++) {
                    const el = document.getElementById('in-u' + i);
                    if (el) el.value = t['u' + i] || t[Object.keys(t)[i - 1]] || 0;
                }
            }

            document.querySelectorAll('.grid-btn.grotto').forEach(btn => {
                btn.onclick = function () {
                    grottoDifficulty = parseInt(this.dataset.diff); grottoActive = true;
                    GM_setValue(getUniqueKey("grottoDifficulty"), grottoDifficulty);
                    GM_setValue(getUniqueKey("grottoActive"), grottoActive);
                    document.querySelectorAll('.grid-btn.grotto').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    if (botMode !== 'grotto') { botMode = 'grotto'; document.getElementById('bot-mode-selector').value = 'grotto'; GM_setValue(getUniqueKey("botMode"), 'grotto'); }
                    log("Gruta: " + grottoDifficulty);
                };
            });

            document.querySelectorAll('.grid-btn.train').forEach(btn => {
                btn.onclick = function () {
                    const s = this.getAttribute('data-stat'); trainEnabled[s] = !trainEnabled[s];
                    GM_setValue(getUniqueKey("trainEnabled"), trainEnabled);
                    this.classList.toggle('active');
                    log("Gym " + s + ": " + (trainEnabled[s] ? "ON" : "OFF"));
                };
            });

            const rndToggle = document.getElementById('bot-randomizer-toggle');
            const rndSlider = document.getElementById('bot-randomizer-slider');
            if (rndToggle && rndSlider) {
                rndToggle.onchange = function () { randomizerEnabled = this.value === "true"; GM_setValue(getUniqueKey("randomizerEnabled"), randomizerEnabled); log("Randomizer: " + (randomizerEnabled ? "ON" : "OFF")); };
                rndSlider.oninput = function () {
                    randomizerMax = parseInt(this.value);
                    const minVal = Math.max(2100, randomizerMax * 0.35);
                    document.getElementById('randomizer-val').innerText = (randomizerMax / 1000).toFixed(1) + "s";
                    document.getElementById('randomizer-min-val').innerText = (minVal / 1000).toFixed(1);
                };
                rndSlider.onchange = function () { GM_setValue(getUniqueKey("randomizerMax"), randomizerMax); log("Máx Random: " + (randomizerMax / 1000).toFixed(1) + "s"); };
            }

            document.getElementById('clear-logs').onclick = function () { var lp = document.getElementById('bot-logs'); if (lp) lp.innerHTML = ""; GM_setValue(getUniqueKey("botLogsHistory"), []); log("🧹 Logs limpios."); };
            
            const hM = document.getElementById('bot-history-modal');
            document.getElementById('open-history').onclick = function () {
                const h = GM_getValue(getUniqueKey("botLogsHistory"), []);
                const container = document.getElementById('history-container');
                if (!h.length) {
                    container.textContent = "Vacío";
                } else {
                    container.innerHTML = "";
                    h.forEach(i => {
                        const div = document.createElement('div');
                        div.className = "history-item";
                        const stamp = document.createElement('span');
                        stamp.style.color = "#666";
                        stamp.textContent = i.s;
                        div.appendChild(stamp);
                        div.appendChild(document.createTextNode(" " + i.m));
                        container.appendChild(div);
                    });
                }
                hM.style.display = "flex";
            };
            document.getElementById('close-history').onclick = () => { hM.style.display = "none"; };
            hM.onclick = (e) => { if (e.target === hM) hM.style.display = "none"; };

        } catch (e) { console.error("[BOT] Error fatal UI:", e); }
    }

    // --- LÓGICA GRUTA (Versión Automática Fetch sin Botones Físicos) ---
    var grottoExecuting = false;
    function executeGrotto() {
        if ((!grottoActive && botMode !== "grotto") || grottoExecuting) return;

        var isGrotto = location.href.indexOf("/city/grotte") !== -1;
        if (!isGrotto) {
            log("Navegando a Gruta...");
            updateWatchdog();
            location.href = location.origin + "/city/grotte";
            grottoExecuting = true;
            return;
        }

        grottoExecuting = true;

        var csrfInput = document.querySelector('input[name="csrf_token"]');
        var csrf = csrfInput ? csrfInput.value : null;
        var tokenMatch = location.href.match(/__token=([a-f0-9]+)/);
        var token = tokenMatch ? tokenMatch[1] : null;

        // Detección universal sin filtros css complejos (Zero-Text definitivo)
        var formPresent = document.querySelector("form input[type='submit'], form button.btn, button[type='submit'], input[name='difficulty']") !== null;

        if (!csrf || !formPresent) {
            grottoCount++;
            var counterEl = document.getElementById('grotto-counter');
            if (counterEl) counterEl.innerText = grottoCount;
            log("[GRUTA] 🛡️ Batalla vencida exitosamente. Contador: " + grottoCount);

            setTimeout(function () {
                var mainLink = document.querySelector(".btn[href*='/city/grotte']");
                log("[SISTEMA] 🔄 Preparando siguiente asalto...");
                updateWatchdog();
                if (mainLink) mainLink.click();
                else location.href = location.origin + "/city/grotte";
            }, getRandomDelay(1000, 500));
            return;
        }

        // Detección dinámica de valores de dificultad para multi-idioma y compatibilidad con misiones
        var diffButtons = document.querySelectorAll("input[name='difficulty']");
        var actualDiffValue = grottoDifficulty; // Fallback numérico
        if (diffButtons.length >= grottoDifficulty) {
            actualDiffValue = diffButtons[grottoDifficulty - 1].value;
            log("[GRUTA] 🛡️ Usando valor de dificultad detectado: " + actualDiffValue);
        }

        // Lógica Restaurada: URLSearchParams ha demostrado ser universal para los servidores de Gameforge
        var url = "/city/grotte/" + (token ? "?__token=" + token : "");
        var bodyParams = new URLSearchParams();
        bodyParams.append('difficulty', actualDiffValue);
        bodyParams.append('csrf_token', csrf);

        updateWatchdog();
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: bodyParams.toString()
        }).then(function (res) {
            if (res.ok) {
                lastInteraction = Date.now();
                log("[GRUTA] ⚔️ Ataque ejecutado correctamente.");
            }
            setTimeout(function () {
                grottoExecuting = false;
                log("[SISTEMA] 🌐 Recargando página para sincronizar estado...");
                location.reload();
            }, getRandomDelay(3000, 2000));
        }).catch(function (err) {
            log("[ERROR] ❌ Fallo en conexión de Gruta.");
            grottoExecuting = false;
        });
    }



    // --- LÓGICA ENTRENAMIENTO ---
    function getGold() {
        var goldEl = document.getElementById('gold_value') ||
            document.getElementById('s_gold') ||
            document.querySelector('.gold') ||
            document.getElementById('gold_amount');

        if (!goldEl) {
            var header = document.querySelector('.header_values, #stats, .header-stats');
            if (header) {
                var m = header.innerText.match(/([\d\.]+)/);
                if (m) return parseInt(m[1].replace(/\./g, ''));
            }
            return 0;
        }

        var txt = goldEl.innerText.replace(/\./g, '').replace(/,/g, '');
        var m = txt.match(/(\d+)/);
        return m ? parseInt(m[1]) : 0;
    }

    var trainExecuting = false;
    var cachedToken = null;

    function executeTrainingGhost() {
        if (trainExecuting) return;
        var curGold = getGold();
        log("[ENTRENAMIENTO] 🔥 Iniciando ciclo de mejora de habilidades...");

        trainExecuting = true;
        fetch(location.origin + "/profile/index")
            .then(function (res) { return res.text(); })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, "text/html");
                var tkMatch = html.match(/__token=([a-f0-9]+)/);
                cachedToken = tkMatch ? tkMatch[1] : "";

                // Actualizar oro real desde el HTML del perfil
                var goldEl = doc.getElementById('gold_value') || doc.getElementById('s_gold') || doc.querySelector('.gold');
                if (goldEl) {
                    var m = goldEl.innerText.replace(/\./g, '').replace(/,/g, '').match(/(\d+)/);
                    if (m) curGold = parseInt(m[1]);
                }

                function performSequentialTrain() {
                    var statsToTrain = [];
                    for (var s = 1; s <= 5; s++) {
                        if (!trainEnabled[s]) continue;

                        var aLink = doc.querySelector("a[href*='/profile/training/" + s + "']");
                        var plusBtn = aLink ? aLink.querySelector("img[src*='iconplus.png']") : null;

                        if (plusBtn) {
                            var container = plusBtn.closest("td");
                            var tooltip = container ? container.querySelector(".tooltip") : null;
                            var cost = 999999999;
                            if (tooltip) {
                                var costsM = tooltip.innerText.replace(/\./g, "").match(/(\d+)/);
                                if (costsM) cost = parseInt(costsM[1]);
                            }
                            trainCosts[s] = cost;
                            if (curGold >= cost) {
                                statsToTrain.push({ id: s, cost: cost });
                            }
                        }
                    }

                    GM_setValue(getUniqueKey("trainCosts"), trainCosts);

                    if (statsToTrain.length > 0) {
                        var target = statsToTrain[0];
                        log("⚡ Entrenando Habilidad " + target.id + " (Costo: " + target.cost + ")");

                        fetch(location.origin + "/profile/training/" + target.id + (cachedToken ? "?__token=" + cachedToken : ""))
                            .then(function (resp) {
                                if (resp.ok) {
                                    curGold -= target.cost;
                                    // Actualizar visualmente el oro si el elemento existe
                                    var goldDisplay = document.getElementById('gold_value') || document.getElementById('s_gold') || document.querySelector('.gold');
                                    if (goldDisplay) goldDisplay.innerText = curGold.toLocaleString('de-DE');

                                    // Intentar entrenar la siguiente sin recargar
                                    setTimeout(performSequentialTrain, getRandomDelay(150, 100));
                                } else {
                                    log("Bitefight rechazó el entrenamiento rápido. Recargando...");
                                    location.reload();
                                }
                            })
                            .catch(function () { location.reload(); });
                    } else {
                        log("Entrenamiento completado o sin oro.");
                        trainExecuting = false;
                        // Si estamos en la página de perfil, recargamos para ver cambios, si no, seguimos
                        if (location.href.indexOf("/profile/") !== -1) location.reload();
                    }
                }

                performSequentialTrain();
            })
            .catch(function () { trainExecuting = false; });
    }

    function getCurrentLayer() {
        var url = location.href;

        // --- PRIORIDAD 1: LINK / URL (PELEA O REPORTE) ---
        var mUrl = url.match(/\/(show|report|ancestral)\/(\d+)/i) || url.match(/layerId=(\d+)/i);
        if (mUrl && url.indexOf("/index") === -1) {
            var val = mUrl[2] || mUrl[1];
            return parseInt(val);
        }

        // --- PRIORIDAD 2: BOTÓN ACTIVO (NUEVA PRIORIDAD ALTA PARA MAPA) ---
        // Buscamos el botón que tiene el estilo de "seleccionado" en la interfaz
        var activeBtn = document.querySelector(".activeLayerBtn, .currentLayer, .layerActive, [class*='current']");
        if (activeBtn) {
            var mId = activeBtn.id.match(/(\d+)/) || (activeBtn.getAttribute('onclick') || "").match(/layerId=(\d+)/);
            if (mId) {
                var relId = parseInt(mId[1]);
                var pg = getCurrentPage();
                // Si el ID detectado es pequeño (1-10) pero estamos en página 2+, calculamos el absoluto
                if (relId <= 10) return ((pg - 1) * 10) + relId;
                return relId;
            }
        }

        // --- PRIORIDAD 3: PARÁMETROS DE URL EN MAPA ---
        var mLayerId = url.match(/layerId=(\d+)/i);
        if (mLayerId) {
            var relId = parseInt(mLayerId[1]);
            var pg = getCurrentPage();
            return ((pg - 1) * 10) + relId;
        }

        // --- PRIORIDAD 4: ESCANEO DE MAPA (FALLBACK) ---
        if (url.indexOf("/ancestral/index") !== -1 || document.querySelector(".ruins_map")) {
            var maxL = 0;
            var entries = document.querySelectorAll(".layerEntryBtn, a[href*='/show/'], button[onclick*='ancestralEnter']");
            for (var i = 0; i < entries.length; i++) {
                var href = entries[i].getAttribute("href") || entries[i].getAttribute("onclick") || "";
                var m = href.match(/\/show\/(\d+)/i) || href.match(/layerId=(\d+)/i) || href.match(/(\d+)/);
                if (m) {
                    var n = parseInt(m[1]);
                    // Si el escaneo devuelve el más alto, solo lo usamos si no hay nada más
                    if (n > maxL && n <= limitLayer) maxL = n;
                }
            }
            if (maxL > 0) return maxL;
        }

        return 0;
    }

    function getCurrentPage() {
        var m = location.href.match(/page=(\d+)/i);
        return m ? parseInt(m[1]) : 1;
    }

    function getSpheresPercent() {
        var el = document.querySelector(SELECTORS.spheres);
        if (!el) {
            var spans = document.getElementsByTagName("span");
            for (var i = 0; i < spans.length; i++) {
                if (spans[i].innerText.indexOf("%") !== -1) {
                    var m = spans[i].innerText.match(/(\d+)%/);
                    if (m) return parseInt(m[1]);
                }
            }
            return 0;
        }
        var m2 = el.innerText.match(/(\d+)%/);
        return m2 ? parseInt(m2[1]) : 0;
    }

    function hasAvailableOrbs() {
        var slots = document.querySelectorAll(".slot, .orb_slot, [class*='orb']");
        if (slots.length === 0) {
            // Fallback: Si no hay slots pero hay porcentaje > 0, hay energía
            if (getSpheresPercent() > 0) return true;
            return true; // Si no detectamos nada, permitimos un intento por seguridad
        }

        var available = 0;
        var emptyCount = 0;
        for (var i = 0; i < slots.length; i++) {
            var img = slots[i].querySelector("img");
            if (img) {
                var src = img.src.toLowerCase();
                // Si NO es la imagen de "vacío", asumimos que tiene algo
                if (src.indexOf("empty") === -1 && src.indexOf("vacio") === -1) {
                    available++;
                } else {
                    emptyCount++;
                }
            }
        }
        
        // Si detectamos al menos una esfera que no está vacía, o si la detección falla (0/0), seguimos
        var hasEnergy = available > 0 || (available === 0 && emptyCount === 0);
        log("[SISTEMA] Energía detectada: " + available + " esferas llenas.");
        return hasEnergy;
    }

    function handleHumanHunt() {
        log("Analizando cacería...");

        // --- VERIFICACIÓN DE ESFERAS ---
        if (!hasAvailableOrbs()) {
            log("⚠️ Todas las esferas están vacías. Deteniendo cacería.");
            return false;
        }

        var repeatBtn = null;
        var candidateButtons = document.querySelectorAll(SELECTORS.repeatHunt);
        for (var i = 0; i < candidateButtons.length; i++) {
            var btn = candidateButtons[i];
            var html = btn.innerHTML.toLowerCase();
            var innerImg = btn.querySelector("img");
            var src = innerImg ? innerImg.src.toLowerCase() : "";

            // DETECCIÓN EXTREMADAMENTE ROBUSTA: "igen", ap.gif, action, "- 1", o cualquier submit con imagen
            if (
                (src.indexOf("ap") !== -1 || src.indexOf("action") !== -1 || html.indexOf("igen") !== -1 || html.indexOf("- 1") !== -1) ||
                (btn.type === "submit" && (innerImg || html.indexOf("cost") !== -1))
            ) {
                repeatBtn = btn;
                break;
            }
        }

        var extractBtn = document.querySelector(SELECTORS.extractBtnId) || document.querySelector(SELECTORS.genericExtract);

        if (extractBtn) {
            var isHigh = false;
            var detectedRank = "BAJO";

            // 1. PRIORIDAD: Buscar Rangos S y A (Patrones Mobile Blood_X_2 proporcionados por usuario)
            var rankSImg = document.querySelector("img[src*='Blood_1_2'], img[src*='rank_s']");
            var rankAImg = document.querySelector("img[src*='Blood_2_2'], img[src*='rank_a']");
            var rankBImg = document.querySelector("img[src*='Blood_3_2'], img[src*='rank_b']");

            // Respaldo por Texto (Multi-idioma) - Buscamos en el contenedor de rango
            var rankLine = document.querySelector(".rank-line");
            var rankText = rankLine ? rankLine.innerText : "";

            if (rankSImg || rankText.indexOf("S -") !== -1) {
                detectedRank = "S";
                if (rankS_active) isHigh = true;
            } else if (rankAImg || rankText.indexOf("A -") !== -1) {
                detectedRank = "A";
                if (rankA_active) isHigh = true;
            } else if (rankBImg || rankText.indexOf("B -") !== -1) {
                detectedRank = "B";
                if (rankB_active) isHigh = true;
            }

            // 2. FILTRADO: Si NO es un rango configurado como "High", verificamos si hay que saltar
            if (!isHigh) {
                var forbidden = document.querySelector("img[src*='Blood_6_2'], img[src*='Blood_5_2'], img[src*='Blood_4_2']");
                if (forbidden) {
                    if (repeatBtn) {
                        log("⏭️ Saltando Rango Bajo detectado (" + detectedRank + ")");
                        updateWatchdog();
                        repeatBtn.click();
                        return true;
                    }
                    return false;
                }
            }

            if (isHigh) {
                log("⭐ ¡Rango " + detectedRank + " aceptado! Extrayendo...");
                updateWatchdog();

                // Priorizar extracción de esencia si existe el botón, sino usar el genérico
                var essBtn = document.querySelector(SELECTORS.extractEssenceBtnId);
                var finalBtn = essBtn || extractBtn;

                finalBtn.click();
                return true;
            } else if (repeatBtn) {
                log("⏭️ Rango " + detectedRank + " ignorado por filtros. Saltando...");
                updateWatchdog();
                repeatBtn.click();
                return true;
            }
        }

        if (repeatBtn) {
            updateWatchdog();
            repeatBtn.click();
            return true;
        }

        // 3. INICIO DE CACERÍA (Selección técnica por función doHunt)
        var doLevel = huntLevel;
        // Buscamos específicamente el botón o el div que tiene la función del nivel elegido
        var doHuntBtn = document.querySelector(`button[onclick*='doHunt(${doLevel})']`) || 
                        document.querySelector(`.mjs[onclick*='doHunt(${doLevel})']`) ||
                        document.querySelector(`[onclick*='doHunt(${doLevel})']`);

        if (doHuntBtn) {
            log("[CACERÍA] 🚀 Iniciando cacería Nivel " + doLevel);
            updateWatchdog();
            doHuntBtn.click();
            return true;
        }

        // 4. ATAQUE A OBJETIVOS (Metrópolis / Cacería de Esencias)
        var targets = document.querySelectorAll("tr, .huntRow, .mjs, .targetRow, .enemy-list tr");
        var actionTaken = false;
        for (var k = 0; k < targets.length; k++) {
            // Detección de rango por imagen o por texto (S, A, B)
            var hasRank = targets[k].querySelector("img[src*='rank_'], img[src*='Blood_'], .rank-icon");
            var textContent = targets[k].innerText || "";
            var isTargetRank = hasRank || /(S|A|B) \-/.test(textContent);

            if (isTargetRank) {
                var attack = targets[k].querySelector("button, a[href*='attack'], a[href*='demon_hunt'], .attack-btn");
                if (attack) {
                    log("⚔️ Atacando objetivo detectado...");
                    updateWatchdog();
                    attack.click();
                    actionTaken = true;
                    return true;
                }
            }
        }

        if (location.href.indexOf("report") !== -1 || location.href.indexOf("show") !== -1) {
            var backBtn = document.querySelector(SELECTORS.huntBtn) ||
                document.querySelector("a[href*='robbery/index'], a[href*='human_hunt/index'], a[href*='metropolis']");
            if (backBtn) {
                updateWatchdog();
                backBtn.click();
                return true;
            }
        }
        
        // Si no encontró nada pero tiene energía, intentamos recargar para ver si aparecen nuevos objetivos
        if (hasAvailableOrbs()) {
            log("[SISTEMA] 🔄 Buscando objetivos...");
            setTimeout(() => { location.reload(); }, 3000);
            return true;
        }

        return false;
    }

    function endRuinCycle(reason) {
        log("[RUINAS] 🛑 Ciclo detenido: " + reason);
        lastRuinCheck = Date.now();

        // Lógica de seguridad: 60 minutos base + [7 a 15 minutos] aleatorios
        var baseWait = 3600000; // 60 min
        var extraRandom = getRandomDelay(900000, 420000);
        nextRuinDelay = baseWait + extraRandom;

        var totalWaitMin = Math.floor(nextRuinDelay / 60000);
        log("[SISTEMA] 💤 Próxima validación en aproximadamente " + totalWaitMin + " minutos.");

        GM_setValue(getUniqueKey("lastRuinCheck"), lastRuinCheck);
        GM_setValue(getUniqueKey("nextRuinDelay"), nextRuinDelay);
        GM_setValue(getUniqueKey("checkedInCycle"), []); // Reset memória

        setTimeout(() => { location.href = location.origin + "/city/index"; }, getRandomDelay(3000, 1000));
    }

    function automateSanctuary() {
        var url = location.href;
        var isMap = url.indexOf("/ancestral/index") !== -1 || document.querySelector(".ruins_map");
        var isCombat = url.indexOf("/ancestral/show/") !== -1 || document.querySelector("input[name^='units[']");
        var isReport = url.indexOf("/report") !== -1 || document.querySelector(".combatReport, .report_view");

        // --- DETECCIÓN DE PÁGINA DE SELECCIÓN DE RUINAS Y TABS ---
        if (isMap || url.includes("/nourishing/index")) {
            if (!isCombat && !isReport) {
                // Si estamos en la pestaña de Criaderos (Nourishing), buscamos volver a las ruinas
                var ruinsTab = document.querySelector("a[href*='/ancestral/index'], .ruins_tab_btn") ||
                    Array.from(document.querySelectorAll('a')).find(a => a.innerText.includes('Ruinas de la Antigüedad'));

                if (ruinsTab && url.includes("/nourishing/")) {
                    log("[SISTEMA] 🛡️ Regresando de Criaderos a Ruinas de la Antigüedad...");
                    setTimeout(() => { updateWatchdog(); ruinsTab.click(); }, getRandomDelay(1500, 500));
                    return;
                }

                var ruinSelectionBtn = document.querySelector("a[href*='crimson_sanctuary'], a[href*='ancestors_pits']");
                // Si solo vemos selección de ruina y no tenemos capa activa, entramos
                if (ruinSelectionBtn && !url.includes("layerId=")) {
                    log("[SISTEMA] 🗺️ Seleccionando zona de ruinas disponible...");
                    setTimeout(() => { updateWatchdog(); ruinSelectionBtn.click(); }, getRandomDelay(1500, 500));
                    return;
                }
            }
        }

        var continueBtn = document.querySelector(".combatBtn.combatLink, .report_view a, .ancestralReport a");
        if ((isReport || continueBtn) && !isCombat && !isMap) {
            if (continueBtn) {
                setTimeout(function () { updateWatchdog(); continueBtn.click(); }, getRandomDelay(1200, 600));
                return;
            }
        }

        var activeLayer = getCurrentLayer();
        var currentPage = getCurrentPage();

        // --- SALIDA DE CAPA NO DESEADA ---
        if (isCombat && !isReport) {
            if (activeLayer > limitLayer || activeLayer === 0) {
                log("[RUINAS] ❌ Capa no autorizada detectada (" + activeLayer + "). Regresando al mapa seguro...");
                var backBtn = document.querySelector("a[href*='/ancestral/index'], .backLink, .regresarBtn") ||
                    Array.from(document.querySelectorAll('a')).find(a => a.innerText.toLowerCase().includes('regresar'));
                if (backBtn) {
                    updateWatchdog();
                    backBtn.click();
                } else {
                    location.href = location.origin + "/ancestral/index?page=1&layerId=1";
                }
                return;
            }
        }

        // --- LOGICA DE PAGINACIÓN Y SIGUIENTE CAPA ---
        var nextLayer = 0;
        for (var n = 1; n <= limitLayer; n++) {
            if (checkedInCycle.indexOf(n) === -1) {
                nextLayer = n;
                break;
            }
        }

        // Si ya completamos todo el ciclo hasta el límite
        if (nextLayer === 0 || nextLayer > limitLayer) {
            endRuinCycle("Punto límite " + limitLayer + " completado.");
            return;
        }

        // Registrar capa si estamos dentro de una Y está dentro del límite
        if (activeLayer > 0 && activeLayer <= limitLayer && checkedInCycle.indexOf(activeLayer) === -1) {
            checkedInCycle.push(activeLayer);
            GM_setValue(getUniqueKey("checkedInCycle"), checkedInCycle);
        }

        if (isMap && !isCombat && !isReport) {
            var targetPage = Math.ceil(nextLayer / 10);
            var relativeLayerId = ((nextLayer - 1) % 10) + 1;

            // VERIFICACIÓN ESTRICTA DE URL: Si no estamos en la página y capa exacta, forzamos navegación
            var hasCorrectPage = url.includes("page=" + targetPage);
            var hasCorrectLayer = url.includes("layerId=" + relativeLayerId);

            if (!hasCorrectPage || !hasCorrectLayer) {
                log("[RUINAS] 🌐 Posicionando en Página " + targetPage + ", Capa " + nextLayer + "...");
                setTimeout(() => {
                    location.href = location.origin + "/ancestral/index?page=" + targetPage + "&layerId=" + relativeLayerId;
                }, getRandomDelay(2000, 1000));
                return;
            }

            // Verificar cooldown en la capa actual
            var timer = document.querySelector(".timer, #timeout_ruins_ancestor, [id*='timer'], .ruins_timer");
            var hasCD = !!(timer || document.body.innerText.match(/\d+h |\d+m \d+s/i));

            if (hasCD && activeLayer === nextLayer) {
                log("[RUINAS] ⏳ Capa " + nextLayer + " en espera. Buscando alternativa...");
                checkedInCycle.push(nextLayer); // La marcamos como "revisada" en este pulso
                GM_setValue(getUniqueKey("checkedInCycle"), checkedInCycle);
                setTimeout(automateSanctuary, 500); // Re-evaluar siguiente capa
                return;
            }

            // Si estamos en la página correcta, buscar el botón de selección de la capa
            // Nota: En cada página los IDs de las capas se reinician del 1 al 10 en la interfaz
            var layerBtn = document.getElementById("layer" + relativeLayerId) ||
                document.querySelector(".layerSelector a[href*='layerId=" + relativeLayerId + "']");

            // Si la capa activa en el mapa NO es la que queremos, hacemos clic en el botón de la capa
            if (layerBtn && activeLayer !== nextLayer) {
                log("[RUINAS] 📍 Seleccionando Capa " + nextLayer + " (Relativa: " + relativeLayerId + ")");
                updateWatchdog();
                layerBtn.click();
                return;
            }

            // CRÍTICO: Solo intentamos entrar si el activeLayer es el que buscamos
            if (activeLayer === nextLayer && !hasCD) {
                // Buscamos el link de entrada específico para esa capa
                var enterLink = document.querySelector("a[href*='/show/" + nextLayer + "']");
                var genericEnter = document.querySelector(".layerEntryBtn, .combatEntryBtn, .combatBtn, button.btn, .btn_combat");

                // Búsqueda por texto "ENTRAR" como último recurso
                var textEnter = Array.from(document.querySelectorAll('a, button, div.btn')).find(el => {
                    var t = el.innerText.toUpperCase();
                    return t === "ENTRAR" || t === "ENTER" || t === "COMENZAR";
                });

                var finalEnter = enterLink || (activeLayer === nextLayer ? (genericEnter || textEnter) : null);

                if (finalEnter) {
                    log("[RUINAS] 🚪 Entrando a la Capa " + nextLayer + "...");
                    updateWatchdog();
                    setTimeout(() => { finalEnter.click(); }, getRandomDelay(1500, 500));
                    return;
                }
            }
        }

        if (isCombat && !isReport && !continueBtn) {
            var unitInputs = document.querySelectorAll("input[name^='units[']");
            if (unitInputs.length === 0) return;

            var allUnitsCorrect = true;
            var clickAssignTroops = function (id) {
                var el = document.querySelector("input[name='units[" + id + "]']");
                var label = document.getElementById("qtyValue" + id);
                if (!el || !label) return;

                var targetV = 0;
                if (USER_PRESETS[activeLayer]) {
                    targetV = USER_PRESETS[activeLayer]['u' + id] || 0;
                } else if (TROOP_PRESETS[activeLayer]) {
                    var names = ["lobo", "dev", "caz", "terr"];
                    targetV = TROOP_PRESETS[activeLayer][names[id - 1]] || 0;
                }

                var maxUnassigned = parseInt(el.getAttribute("max")) || 0;
                var currentV = parseInt(label.innerText) || 0;
                var totalAvailableForUnit = maxUnassigned + currentV;

                // CRÍTICO: Si el total que posee el usuario es menor a lo que pide el preset, NO SE PELEA
                if (totalAvailableForUnit < targetV) {
                    allUnitsCorrect = false;
                    endRuinCycle("Tropas insuficientes para Capa " + activeLayer + " (" + totalAvailableForUnit + "/" + targetV + ").");
                    return;
                }

                var diff = targetV - currentV;

                if (diff === 0) return;
                allUnitsCorrect = false;

                var clickStep = function (step) {
                    var btn = document.querySelector("button.stepBtn[data-id='" + id + "'][data-step='" + step + "']");
                    if (btn) { updateWatchdog(); btn.click(); }
                };

                if (diff >= 10) clickStep(10);
                else if (diff > 0) clickStep(1);
                else if (diff <= -10) clickStep(-10);
                else if (diff < 0) clickStep(-1);
            };

            for (var u = 0; u < unitInputs.length; u++) {
                var mId = unitInputs[u].name.match(/\[(\d+)\]/);
                if (mId) clickAssignTroops(parseInt(mId[1]));
            }

            var fight = document.getElementById("fightBtn") || document.querySelector(SELECTORS.fightBtnId);
            if (fight && !fight.classList.contains("entryLocked") && allUnitsCorrect) {
                log("⚔️ ¡A las armas! Iniciando combate...");
                updateWatchdog();
                fight.click();
            }
        }
    }

    // --- SISTEMA DE ESPERA POST-CARGA (SEGURIDAD USUARIO) ---
    var scriptStartTime = Date.now();

    function mainLoop() {
        // Esperar siempre 2 segundos tras cada carga de página antes de actuar
        if (Date.now() - scriptStartTime < 2000) {
            setTimeout(mainLoop, 500);
            return;
        }

        // En lugar de inyectar, solo actualizamos los valores dinámicos
        updateUIValues();

        // --- WATCHDOG ---
        if (botEnabled && (Date.now() - lastInteraction > WATCHDOG_TIME)) {
            location.reload();
            return;
        }

        if (!botEnabled) {
            setTimeout(mainLoop, getRandomDelay(1500, 500));
            return;
        }

        // --- ACTUALIZACIÓN UI ---
        var isRuinsPage = location.href.indexOf("/ancestral/") !== -1 || document.querySelector("input[name^='units[']");
        var saveBtn = document.getElementById('save-presets');
        if (saveBtn) saveBtn.style.display = (isRuinsPage ? "block" : "none");

        // RESET WATCHDOG SOLO SI HAY TIMERS O ESTADO OCUPADO (ESPERA LEGÍTIMA)
        var hasLegitTimer = document.querySelector(".timer, .cooldown, #timeout_ruins_ancestor, [id*='timer'], .ruins_timer") !== null;
        if (hasLegitTimer || grottoExecuting || trainExecuting) updateWatchdog();

        if (document.getElementById('grotto-counter')) document.getElementById('grotto-counter').innerText = grottoCount;

        // --- PRIORIDAD 1: ENTRENAMIENTO DE HABILIDADES (CADA 10 MIN) ---
        var anyTrain = Object.values(trainEnabled).some(v => v === true);
        if (anyTrain && !trainExecuting && (Date.now() - lastTrainCheck > 600000)) {
            lastTrainCheck = Date.now();
            GM_setValue(getUniqueKey("lastTrainCheck"), lastTrainCheck);
            executeTrainingGhost();
            setTimeout(mainLoop, getRandomDelay(2000, 1000));
            return;
        }

        if (trainExecuting) {
            updateWatchdog(); 
            setTimeout(mainLoop, getRandomDelay(800, 400));
            return;
        }

        if (document.getElementById('grotto-counter')) document.getElementById('grotto-counter').innerText = grottoCount;

        // --- PRIORIDAD 2: LÓGICA DE MODOS ---
        switch (botMode) {
            case "hunt":
                var isHuntPage = /human_hunt|robbery|report|demon_hunt/.test(location.href);
                if (isHuntPage) {
                    updateWatchdog();
                    handleHumanHunt();
                    // Si después de analizar seguimos en la misma página y no hubo acción, reintentar rápido
                    setTimeout(mainLoop, getRandomDelay(2000, 1000));
                } else {
                    log("[SISTEMA] 📍 Iniciando navegación a Cacería...");
                    updateWatchdog();
                    // Navegación directa para evitar fallos de traducción en el menú
                    location.href = location.origin + "/robbery/index";
                }
                return;

            case "grotto":
                var inGrotte = location.href.indexOf("/city/grotte") !== -1;
                if (inGrotte) {
                    updateWatchdog();
                    executeGrotto();
                    setTimeout(mainLoop, getRandomDelay(800, 500));
                } else if (!grottoExecuting) {
                    log("[SISTEMA] 📍 Navegando a zona de Gruta...");
                    location.href = location.origin + "/city/grotte";
                } else {
                    setTimeout(mainLoop, getRandomDelay(1500, 500));
                }
                return;

            case "ruins":
                var inRuins = /crimson_sanctuary|ancestors_pits|ancestral|nourishing/.test(location.href);
                var timePassed = Date.now() - lastRuinCheck;

                if (inRuins) {
                    automateSanctuary();
                    setTimeout(mainLoop, getRandomDelay(2000, 1200));
                } else if (timePassed > nextRuinDelay) {
                    var sBtnR = document.querySelector(SELECTORS.sanctuaryBtn);

                    // Limpiar memoria para nueva validación
                    checkedInCycle = [];
                    GM_setValue(getUniqueKey("checkedInCycle"), []);

                    if (sBtnR) {
                        log("[SISTEMA] ⏰ Ciclo de Ruinas reiniciado. Entrando...");
                        updateWatchdog();
                        sBtnR.click();
                    } else {
                        location.href = location.origin + "/ancestral/index?page=1&layerId=1";
                    }
                } else {
                    var waitMin = Math.ceil((nextRuinDelay - timePassed) / 60000);
                    if (Date.now() % 30000 < 2000) log("⏳ Esperando validación de Ruinas... (" + waitMin + " min)");
                    setTimeout(mainLoop, getRandomDelay(5000, 2000));
                }
                return;

            case "auto":
                log("[SISTEMA] 🔄 Modo Automático detectado. Redirigiendo a Cacería...");
                botMode = "hunt";
                GM_setValue(getUniqueKey("botMode"), "hunt");
                setTimeout(mainLoop, 100);
                return;
        }

        var isCombatPage = location.href.indexOf("/ancestral/show/") !== -1;
        var nextPulse = isCombatPage ? getRandomDelay(400, 300) : getRandomDelay(1200, 800);
        // No reset watchdog here to allow it to trigger on dead states (no action + no timers)
        setTimeout(mainLoop, nextPulse);
    }

    // --- SISTEMA ANTI-HIBERNACIÓN (AUDIO HEARTBEAT AGRESIVO) ---
    function startAntiThrottling() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            setInterval(() => {
                if (botEnabled) {
                    try {
                        ctx.resume();
                        const oscillator = ctx.createOscillator();
                        const gainNode = ctx.createGain();
                        oscillator.type = 'sine';
                        oscillator.frequency.setValueAtTime(1, ctx.currentTime);
                        gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
                        oscillator.connect(gainNode);
                        gainNode.connect(ctx.destination);
                        oscillator.start();
                        oscillator.stop(ctx.currentTime + 0.001);
                    } catch(e) {}
                }
            }, 10000);
            console.log("[SISTEMA] Anti-Throttling Activado (Audio Heartbeat)");
        } catch (e) {
            console.warn("[SISTEMA] No se pudo activar Audio Heartbeat.");
        }
    }
    
    // Iniciar anti-hibernación al cargar
    if (document.body) startAntiThrottling();
    else document.addEventListener('DOMContentLoaded', startAntiThrottling);

    // --- LISTENER DE PULSO (PARA EVITAR CONGELACIÓN EN SEGUNDO PLANO) ---
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "PING" && botEnabled) {
            updateWatchdog();
            // Si el bot detecta que fue despertado por el background, relanza el bucle si estaba parado
            if (Date.now() - lastWatchdogUpdate > 40000) {
                console.log("[SISTEMA] ⚡ Recibido pulso de fondo. Re-activando bucle...");
                mainLoop();
            }
        }
    });

    console.log("[BOT] BeetleJuice Elite cargado. Esperando cuerpo del documento...");

    try {
        // INICIALIZACIÓN INMEDIATA DEL PANEL
        const startUI = () => {
            if (document.getElementById('bot-status-panel')) return;
            if (document.body) {
                console.log("[BOT] Cuerpo detectado. Inyectando panel...");
                injectUI();
            } else {
                setTimeout(startUI, 100);
            }
        };
        startUI();

        // VERIFICACIÓN CONSTANTE (Por si el juego limpia el DOM)
        setInterval(() => {
            if (document.body && !document.getElementById('bot-status-panel')) {
                console.log("[BOT] Panel desaparecido. Recuperando...");
                injectUI();
            }
            // AUTO-DESPERTAR: Si el bot está ON pero el watchdog está muy viejo (> 60s)
            var lastPulse = GM_getValue(getUniqueKey("watchdog"), Date.now());
            if (botEnabled && (Date.now() - lastPulse > 60000)) {
                console.log("[BOT] 💤 Inactividad detectada. Auto-despertando...");
                updateWatchdog();
                location.reload();
            }
        }, 3000);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { 
                console.log("[BOT] DOM listo. Iniciando bucle...");
                setTimeout(mainLoop, 200); 
            });
        } else {
            console.log("[BOT] Documento ya cargado. Iniciando bucle...");
            setTimeout(mainLoop, 200);
        }
    } catch (e) {
        console.error("[BOT] Error fatal de inicio: ", e);
    }

})();
