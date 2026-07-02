// 📁 background.js
// Orquestador seguro de Bitefight Elite (Manifest V3)

const BF_STORAGE_KEY = 'bf_elite_session';

// --- PERSISTENCIA DE PESTAÑAS (ANTI-HIBERNACIÓN) ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url && tab.url.includes("bitefight.gameforge.com")) {
        chrome.tabs.update(tabId, { autoDiscardable: false });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "AUTH_SUCCESS") {
        console.log("🔓 Entorno autorizado. Inyectando bot en tab:", sender.tab.id);
        
        // Inyectar el bot original de manera segura
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            files: ['content.js']
        });
    }
});

// --- SISTEMA DE PULSO (HEARTBEAT) ---
chrome.alarms.create("heartbeat", { periodInMinutes: 1 }); // Mínimo permitido por MV3
chrome.alarms.create("checkExpiry", { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "heartbeat") {
        enviarRafagaDePulsos();
    }

    if (alarm.name === "checkExpiry") {
        chrome.storage.local.get([BF_STORAGE_KEY], (result) => {
            const session = result[BF_STORAGE_KEY];
            if (session && session.expiry < Date.now()) {
                console.log("🕒 [Background]: Sesión local expirada. Intentando mantener activa...");
            }
        });
    }
});

// Función para enviar pings repetidos cada minuto (simula un pulso constante)
function enviarRafagaDePulsos() {
    let count = 0;
    const interval = setInterval(() => {
        chrome.tabs.query({ url: "*://*.bitefight.gameforge.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: "PING" }).catch(() => {});
            });
        });
        count++;
        if (count >= 5) clearInterval(interval); // Enviar 5 pulsos (uno cada 10s) por cada minuto de alarma
    }, 10000);
}

// También enviar al arrancar
enviarRafagaDePulsos();
