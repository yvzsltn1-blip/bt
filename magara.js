// ==UserScript==
// @name         BiteFight Grotte Loop
// @namespace    https://bitefight.gameforge.com
// @version      1.3
// @description  Magara ekraninda secilen zorlugu dongu halinde tekrarlar.
// @match        https://*.bitefight.gameforge.com/city/grotte
// @match        https://*.bitefight.gameforge.com/city/grotte/*
// @match        https://*.bitefight.gameforge.com/report/fightreport/*/grotte
// @grant        none
// ==/UserScript==

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
        minGold: 0
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

        return {
            minDelay,
            maxDelay,
            maxRuns,
            minHealth,
            minEnergy,
            minGold
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
        refreshPanel();
    }

    function delay(ms, callback) {
        window.setTimeout(callback, ms);
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
        debugLog(`Dongu durduruldu. Sebep: ${reason}`);
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

        configure({
            minDelay,
            maxDelay,
            maxRuns: maxRunsValue === '' ? null : Number(maxRunsValue),
            minHealth,
            minEnergy,
            minGold
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

        if (state.enabled && config.minEnergy > 0) {
            if (currentEnergy !== null && currentEnergy < config.minEnergy) {
                stopLoop(`enerji esiginin altina indi (${currentEnergy} < ${config.minEnergy})`);
                return;
            }

            if (currentEnergy === null) {
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

        if (isFightReportPage()) {
            handleFightReportPage();
            return;
        }

        if (isGrottePage()) {
            handleGrottePage();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', route, { once: true });
    } else {
        route();
    }
})();
