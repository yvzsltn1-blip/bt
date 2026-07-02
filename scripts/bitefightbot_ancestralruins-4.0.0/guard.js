// 📁 guard.js
// Capa de Bloqueo Preventivo con Soporte de Caché
(function() {
    'use strict';

    const BF_STORAGE_KEY = 'bf_elite_session';
    const BF_CACHE_KEY = 'bf_char_cache';
    let blockTimer = null;

    function blockUI() {
        if (window.location.hostname.includes('lobby.')) return;
        if (document.getElementById('bf-guard-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'bf-guard-overlay';
        overlay.style = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.95);
            z-index: 1000000; display: flex; flex-direction: column;
            justify-content: center; align-items: center; color: white;
            font-family: sans-serif; pointer-events: all;
        `;
        overlay.innerHTML = `
            <div style="font-size:24px; font-weight:bold; color:#ff3e3e; margin-bottom:10px;">🛡️ GUARDIA BITE ELITE</div>
            <p style="color:#aaa; font-size:12px;">Verificando autorización...</p>
        `;
        document.documentElement.appendChild(overlay);
    }

    function unblockUI() {
        if (blockTimer) clearTimeout(blockTimer);
        const overlay = document.getElementById('bf-guard-overlay');
        if (overlay) overlay.remove();
        console.log("🔓 Guardia: Interfaz liberada.");
    }

    async function checkFastAuth() {
        return new Promise((resolve) => {
            chrome.storage.local.get([BF_STORAGE_KEY, BF_CACHE_KEY], (res) => {
                const session = res[BF_STORAGE_KEY];
                const cache = res[BF_CACHE_KEY] || {};
                const cachedId = cache[window.location.hostname];

                // Si hay sesión válida y coincide con el ID guardado para este server
                if (session && session.charId === cachedId && session.expiry > Date.now()) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
    }

    // El guard por diseño NO bloquea el lobby
    if (window.location.hostname.includes('lobby.')) return;

    async function initGuard() {
        const isAuth = await checkFastAuth();
        if (isAuth) {
            console.log("🔓 Guardia: Acceso rápido concedido por caché.");
            unblockUI();
        } else {
            console.log("🔐 Guardia: Bloqueando hasta validar...");
            // Retardo de 300ms antes de bloquear para evitar parpadeos
            blockTimer = setTimeout(() => {
                if (document.body) blockUI();
                else {
                    const checkBody = setInterval(() => {
                        if (document.body) {
                            clearInterval(checkBody);
                            blockUI();
                        }
                    }, 50);
                }
            }, 300);
        }
    }

    // Escuchar el éxito de auth para desbloquear
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "AUTH_SUCCESS") {
            unblockUI();
            console.log("🔓 Guardia: Desbloqueado por AUTH_SUCCESS.");
        }
    });

    initGuard();
})();
