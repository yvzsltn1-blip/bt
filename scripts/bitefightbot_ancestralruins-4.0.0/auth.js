// 📁 auth.js
// Capa de Autenticación Proactiva - Mejorada con Reintentos y Más Selectores
(function() {
    'use strict';

    const BF_STORAGE_KEY = 'bf_elite_session';
    const BF_CACHE_KEY = 'bf_char_cache';
    const BF_TRIAL_PERIOD = 24 * 60 * 60 * 1000;
    let isRevalidating = false;

    function log(msg) { console.log("[SAAS-AUTH]: " + msg); }
    
    // Función de normalización universal de ID
    function normalizeId(id) {
        if (!id) return null;
        return id.toString().trim().replace(/^0+/, '');
    }

    function getNormalizedServer() {
        return window.location.hostname.toLowerCase();
    }

    async function getCachedId() {
        return new Promise((resolve) => {
            chrome.storage.local.get([BF_CACHE_KEY], (res) => {
                const cache = res[BF_CACHE_KEY] || {};
                resolve(cache[getNormalizedServer()] || null);
            });
        });
    }

    async function setCachedId(id) {
        if (!id) return;
        return new Promise((resolve) => {
            chrome.storage.local.get([BF_CACHE_KEY], (res) => {
                const cache = res[BF_CACHE_KEY] || {};
                cache[getNormalizedServer()] = id;
                chrome.storage.local.set({ [BF_CACHE_KEY]: cache }, resolve);
            });
        });
    }

    async function extractCharacterId() {
        // 0. Prioridad 0: Si ya validamos en esta carga de página, devolverlo (Bloqueo de Sesión)
        if (window.bf_validated_id) return window.bf_validated_id;

        let id = null;

        // 1. PRIORIDAD: Detección en el DOM (ID REAL EN PANTALLA)
        // Buscamos primero en el perfil del usuario (Spieler-ID o ID:)
        const profileTableId = Array.from(document.querySelectorAll('td, span, div'))
            .find(el => {
                const txt = el.innerText || "";
                return (txt.includes('ID:') || txt.includes('Spieler-ID')) && el.nextElementSibling && /^\d+$/.test(el.nextElementSibling.innerText.trim());
            });
        
        if (profileTableId) {
            id = profileTableId.nextElementSibling.innerText.trim();
        }

        if (!id) {
            const internalLinks = [
                'div#character_tab a[href*="/profile/player/"]',
                'a[href*="/msg/write/"]',
                'div.user_menu a[href*="/profile/player/"]',
                'a[href*="/settings/index/"]',
                '#character_name a',
                '.charlink'
            ];

            for (let selector of internalLinks) {
                const node = document.querySelector(selector);
                if (node) {
                    const href = node.getAttribute('href') || "";
                    const match = href.match(/player\/(\d+)|write\/(\d+)/);
                    if (match) {
                        id = match[1] || match[2];
                        if (id) break;
                    }
                }
            }
        }

        // 2. SECUNDARIO: Sticky ID en sessionStorage (Solo si el DOM no dio nada)
        if (!id) {
            const sessionStoredId = sessionStorage.getItem('bf_sticky_id');
            if (sessionStoredId) return sessionStoredId;
        }

        // 2. Si no se encuentra en el DOM actual, revisamos caché local ANTES del fetch
        if (!id) {
            let cached = await getCachedId();
            if (cached) id = cached;
        }

        // 3. Último recurso: Fetch de seguridad (solo si no estamos en lobby)
        if (!id && !window.location.hostname.includes('lobby.')) {
            try {
                log("ID no visible, consultando código interno del perfil...");
                const response = await fetch(window.location.origin + "/profile/index");
                const html = await response.text();
                const matchName = html.match(/profile\/player\/(\d+)/);
                if (matchName && matchName[1]) id = matchName[1];
            } catch (e) { log("Error al leer código interno: " + e.message); }
        }

        if (id) {
            id = normalizeId(id);
            window.bf_validated_id = id;
            sessionStorage.setItem('bf_sticky_id', id); // Persistencia en la pestaña actual
            await setCachedId(id);
            return id;
        }

        return null;
    }

    async function validateFlow(user) {
        if (isRevalidating) return;
        isRevalidating = true;

        let charId = null;
        let retries = 0;

        const detectionInterval = setInterval(async () => {
            charId = await extractCharacterId();
            retries++;

            if (charId || retries > 12) {
                clearInterval(detectionInterval);
                isRevalidating = false;
                
                if (charId) {
                    processLicense(user, charId);
                } else {
                    log("No se pudo detectar el ID. Por favor visita el perfil o la vista general.");
                    showBlock(user, "Unknown", "NO SE DETECTÓ PERSONAJE", false);
                }
            }
        }, 800);
    }

    async function processLicense(user, charId) {
        const server = getNormalizedServer();
        const legacyServer = location.hostname.toLowerCase(); // El formato viejo usaba todo el hostname
        const cleanId = normalizeId(charId);
        
        const normalizedKey = `${server}_${cleanId}`;
        const legacyKey = `${legacyServer}_${cleanId}`;
        
        try {
            // DOBLE VERIFICACIÓN AGRESIVA
            const targetDoc = await firebase.firestore().collection('licenses').doc(normalizedKey).get();
            
            if (targetDoc.exists) {
                const data = targetDoc.data();
                
                // SINCRONIZACIÓN DE PROPIEDAD: Prioridad al Email Verificado
                const isOwnerByUid = data.userId && data.userId === user.uid;
                const isOwnerByEmail = data.email && data.email === user.email;

                if (isOwnerByUid || isOwnerByEmail) {
                    // Si entró por email pero el UID es diferente, sincronizamos el nuevo dispositivo
                    if (!isOwnerByUid) {
                        log("Sincronizando nuevo dispositivo para: " + user.email);
                        firebase.firestore().collection('licenses').doc(targetDoc.id).update({
                            userId: user.uid,
                            lastSync: firebase.firestore.FieldValue.serverTimestamp()
                        }).catch(e => log("Error al sincronizar UID: " + e.message));
                    }
                    
                    const expiry = data.expiryDate.seconds ? data.expiryDate.seconds * 1000 : new Date(data.expiryDate).getTime();
                    if (expiry > Date.now()) {
                        saveSession(cleanId, data.type, expiry);
                        return;
                    } else {
                        showBlock(user, cleanId, "LICENCIA EXPIRADA", true, false, true);
                        return;
                    }
                }

                // Si llegamos aquí, el ID tiene dueño y NO es quien está logueado
                showBlock(user, cleanId, "ACCESO DENEGADO", false, true, true, data.email);
            } else {
                showBlock(user, cleanId, "PERSONAJE NO REGISTRADO", false, false, false);
            }
        } catch (e) {
            log("Error Firestore: " + e.message);
            if (e.message.includes("permission-denied") || e.code === "permission-denied") {
                // Posiblemente el documento existe pero el usuario no tiene permiso para leerlo (reglas firestore)
                showBlock(user, cleanId, "PERSONAJE REGISTRADO POR OTROS", false, true, true);
            }
        }
    }

    function saveSession(charId, type, expiry) {
        const cleanId = normalizeId(charId);
        const session = {
            charId: cleanId,
            server: getNormalizedServer(),
            type: type,
            expiry: expiry,
            token: btoa(cleanId + "|" + type + "|" + expiry)
        };
        chrome.storage.local.set({ [BF_STORAGE_KEY]: session }, () => {
            chrome.runtime.sendMessage({ action: "AUTH_SUCCESS", session: session });
            const p = document.getElementById('bf-auth-panel');
            if (p) p.remove();
            removeLoginUI();
        });
    }

    function removeLoginUI() {
        const p = document.getElementById('bf-login-full');
        if (p) {
            log("🧹 Limpiando interfaz de login (Usuario detectado).");
            p.remove();
        }
    }

    function showBlock(user, charId, title, isExpired, isConflict, hasLicense, ownerEmail = "???") {
        if (document.getElementById('bf-auth-panel')) document.getElementById('bf-auth-panel').remove();
        
        const panel = document.createElement('div');
        panel.id = 'bf-auth-panel';
        panel.style = `position:fixed;bottom:20px;right:20px;z-index:999999;background:#111;color:white;border:1px solid #ff3e3e;padding:20px;border-radius:15px;width:280px;box-shadow:0 10px 30px #000;font-family:sans-serif;text-align:center;`;
        
        let warningMsg = (isConflict || hasLicense) ? 
            `<div style="background:rgba(255,165,0,0.1); border:1px solid orange; padding:10px; border-radius:8px; font-size:11px; margin-bottom:15px; color:#ffa500;">
                <b>CONFLICTO DE IDENTIDAD:</b><br><br>
                Licencia de: <b>${ownerEmail}</b><br>
                Sesión actual: <b style="color:white;">${user.email}</b><br><br>
                <small>Si eres el dueño, inicia sesión con el correo exacto de la licencia.</small>
            </div>` :
            `<div style="background:rgba(255,62,62,0.1); border:1px solid #ff3e3e; padding:10px; border-radius:8px; font-size:11px; margin-bottom:15px; color:#ddd;">
                <b>SESIÓN ACTIVA:</b> ${user.email}<br>
                <small>Prueba gratuita de 24h disponible para personajes nuevos.</small>
            </div>`;

        const canTrial = !isExpired && !isConflict && !hasLicense && charId !== "Unknown";

        const htmlContent = `
            <div style="color:#ff3e3e; font-weight:bold; font-size:14px; margin-bottom:5px;">BITE ELITE BITEFIGHT</div>
            <p style="color:#666; font-size:10px; margin-bottom:15px;">Ancestral Ruins Edition</p>
            <h3 id="auth-title" style="color:#fff; font-size:12px; margin:0 0 10px 0;"></h3>
            
            <div id="auth-warning"></div>
            <div style="background:#000;padding:10px;border-radius:5px;font-size:11px;margin-bottom:15px;text-align:left;">
                <b>ID:</b> <span id="auth-char-id"></span><br><b>Server:</b><br><small id="auth-server"></small>
            </div>
            <div id="auth-trial-container"></div>
            <a href="https://discord.gg/3J8jxCzG" target="_blank" style="display:block;padding:10px;background:#ff3e3e;color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin-bottom:10px;box-sizing:border-box; font-size:11px;">COMPRAR PREMIUM</a>
            <button id="btn-logout-auth" style="background:none;border:none;color:#555;font-size:11px;text-decoration:underline;cursor:pointer;">Cerrar Sesión</button>
        `;
        panel.innerHTML = htmlContent;

        // Update dynamic values safely
        const titleEl = panel.querySelector('#auth-title'); if (titleEl) titleEl.textContent = title;
        const charIdEl = panel.querySelector('#auth-char-id'); if (charIdEl) charIdEl.textContent = charId;
        const serverEl = panel.querySelector('#auth-server'); if (serverEl) serverEl.textContent = getNormalizedServer();

        const warningEl = panel.querySelector('#auth-warning');
        if (warningEl) {
            if (isConflict || hasLicense) {
                warningEl.style.background = "rgba(255,165,0,0.1)";
                warningEl.style.border = "1px solid orange";
                warningEl.style.padding = "10px";
                warningEl.style.borderRadius = "8px";
                warningEl.style.fontSize = "11px";
                warningEl.style.marginBottom = "15px";
                warningEl.style.color = "#ffa500";
                
                const b1 = document.createElement('b'); b1.textContent = "CONFLICTO DE IDENTIDAD:";
                const br1 = document.createElement('br');
                const br2 = document.createElement('br');
                const t1 = document.createTextNode("Licencia de: ");
                const b2 = document.createElement('b'); b2.textContent = ownerEmail;
                const br3 = document.createElement('br');
                const t2 = document.createTextNode("Sesión actual: ");
                const b3 = document.createElement('b'); b3.style.color = "white"; b3.textContent = user.email;
                const br4 = document.createElement('br');
                const br5 = document.createElement('br');
                const small = document.createElement('small'); small.textContent = "Si eres el dueño, inicia sesión con el correo exacto de la licencia.";

                warningEl.appendChild(b1); warningEl.appendChild(br1); warningEl.appendChild(br2);
                warningEl.appendChild(t1); warningEl.appendChild(b2); warningEl.appendChild(br3);
                warningEl.appendChild(t2); warningEl.appendChild(b3); warningEl.appendChild(br4);
                warningEl.appendChild(br5); warningEl.appendChild(small);
            } else {
                warningEl.style.background = "rgba(255,62,62,0.1)";
                warningEl.style.border = "1px solid #ff3e3e";
                warningEl.style.padding = "10px";
                warningEl.style.borderRadius = "8px";
                warningEl.style.fontSize = "11px";
                warningEl.style.marginBottom = "15px";
                warningEl.style.color = "#ddd";

                const b1 = document.createElement('b'); b1.textContent = "SESIÓN ACTIVA:";
                const t1 = document.createTextNode(" " + user.email);
                const br1 = document.createElement('br');
                const small = document.createElement('small'); small.textContent = "Prueba gratuita de 24h disponible para personajes nuevos.";

                warningEl.appendChild(b1); warningEl.appendChild(t1); warningEl.appendChild(br1); warningEl.appendChild(small);
            }
        }

        if (canTrial) {
            const trialContainer = panel.querySelector('#auth-trial-container');
            const trialBtn = document.createElement('button');
            trialBtn.id = "act-trial";
            trialBtn.style.width = "100%";
            trialBtn.style.padding = "10px";
            trialBtn.style.background = "#27ae60";
            trialBtn.style.color = "white";
            trialBtn.style.border = "none";
            trialBtn.style.borderRadius = "8px";
            trialBtn.style.cursor = "pointer";
            trialBtn.style.fontWeight = "bold";
            trialBtn.style.marginBottom = "10px";
            trialBtn.style.transition = "0.3s";
            trialBtn.style.fontSize = "11px";
            trialBtn.textContent = "ACTIVAR PRUEBA (24H GRATIS)";
            trialContainer.appendChild(trialBtn);
        }
        document.body.appendChild(panel);

        document.getElementById('btn-logout-auth').onclick = () => firebase.auth().signOut().then(()=>location.reload());

        const btnTrial = document.getElementById('act-trial');
        if (btnTrial && user) {
            btnTrial.onclick = async () => {
                btnTrial.disabled = true; btnTrial.innerText = "REGISTRANDO...";
                const expiry = new Date(Date.now() + BF_TRIAL_PERIOD);
                const server = getNormalizedServer();
                const cleanId = normalizeId(charId);
                const licenseKey = `${server}_${cleanId}`;

                try {
                    // Check before set just in case, though rules will also block
                    const checkDoc = await firebase.firestore().collection('licenses').doc(licenseKey).get();
                    if (checkDoc.exists) {
                        alert("SEGURIDAD: Este personaje ya tiene una licencia registrada en el sistema.");
                        location.reload();
                        return;
                    }

                    await firebase.firestore().collection('licenses').doc(licenseKey).set({
                        userId: user.uid,
                        email: user.email,
                        characterId: cleanId,
                        server: server,
                        type: 'trial',
                        expiryDate: expiry,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    processLicense(user, cleanId);
                } catch (e) {
                    alert("Error al registrar licencia: " + e.message);
                    location.reload();
                }
            };
        }
    }

    function injectLogin() {
        if (document.getElementById('bf-login-full')) return;
        const div = document.createElement('div');
        div.id = 'bf-login-full';
        div.style = `position:fixed;bottom:20px;right:20px;z-index:999999;font-family:sans-serif;`;
        const loginHtml = `
            <div style="background:#111;padding:20px;border-radius:12px;border:1px solid #ff3e3e;width:260px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.8);">
                <div style="font-size:16px; font-weight:bold; color:#ff3e3e; margin-bottom:2px;">BITE ELITE</div>
                <p style="color:#666; font-size:9px; margin-bottom:15px; text-transform:uppercase; letter-spacing:1px;">Ancestral Ruins Edition</p>
                <input type="email" id="f-email" placeholder="Email" style="width:100%;padding:10px;margin-bottom:10px;background:#222;border:1px solid #333;color:white;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;">
                <input type="password" id="f-pass" placeholder="Password" style="width:100%;padding:10px;margin-bottom:20px;background:#222;border:1px solid #333;color:white;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;">
                <button id="f-btn" style="width:100%;padding:12px;background:#ff3e3e;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:12px;margin-bottom:8px;box-shadow:0 4px 15px rgba(255,62,62,0.3);">ENTRAR</button>
                <div style="margin-bottom:10px;"><button id="f-forgot" style="background:none;border:none;color:#888;font-size:10px;text-decoration:underline;cursor:pointer;">¿Olvidaste tu contraseña?</button></div>
                <div style="color:#555; font-size:10px; margin:10px 0;">¿No tienes cuenta? Usa el botón de abajo</div>
                <button id="f-reg" style="width:100%;padding:12px;background:#27ae60;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:12px;box-shadow:0 4px 15px rgba(39,174,96,0.3);">CREAR CUENTA</button>
            </div>
        `;
        div.innerHTML = loginHtml;
        document.body.appendChild(div);

        document.getElementById('f-btn').onclick = async () => {
            const e = document.getElementById('f-email').value;
            const p = document.getElementById('f-pass').value;
            if (!e || !p) { alert("Usuario y contraseña requeridos."); return; }
            try {
                await firebase.auth().signInWithEmailAndPassword(e, p);
                location.reload();
            } catch(ex) { alert("Error: " + ex.message); }
        };

        document.getElementById('f-forgot').onclick = async () => {
            const e = document.getElementById('f-email').value;
            if (!e) { alert("Ingresa tu email para restablecer la contraseña."); return; }
            try {
                await firebase.auth().sendPasswordResetEmail(e);
                alert("Se ha enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.");
            } catch(ex) { alert("Error: " + ex.message); }
        };

        document.getElementById('f-reg').onclick = async () => {
            const e = document.getElementById('f-email').value;
            const p = document.getElementById('f-pass').value;
            if (!e || !p) { alert("Completa los campos para crear tu cuenta."); return; }
            try {
                await firebase.auth().createUserWithEmailAndPassword(e, p);
                alert("Cuenta creada con éxito. Ya puedes ENTRAR.");
                location.reload();
            } catch(ex) { alert("Error al registrar: " + ex.message); }
        };
    }

    let isAuthorized = false;

    if (!window.location.hostname.includes('lobby.')) {
        // INICIO INMEDIATO: Si hay sesión válida local, no esperamos a Firebase
        chrome.storage.local.get([BF_STORAGE_KEY], (res) => {
            const session = res[BF_STORAGE_KEY];
            if (session && session.expiry > Date.now()) {
                log("🚀 Sesión local válida detectada. Iniciando bot inmediatamente...");
                isAuthorized = true;
                removeLoginUI();
                chrome.runtime.sendMessage({ action: "AUTH_SUCCESS", session: session });
            }
        });

        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .then(() => {
                firebase.auth().onAuthStateChanged(async user => {
                    if (user) {
                        log("✅ Autenticado en Firebase.");
                        isAuthorized = true;
                        removeLoginUI();
                        validateFlow(user);
                    } else {
                        // RECHECK RAPIDO: Si no hay usuario en 1.5s y no hay sesión local, mostrar login
                        setTimeout(() => {
                            chrome.storage.local.get([BF_STORAGE_KEY], (res) => {
                                const session = res[BF_STORAGE_KEY];
                                const hasValidSession = session && session.expiry > Date.now();
                                
                                if (!firebase.auth().currentUser && !hasValidSession && !isAuthorized) {
                                    log("🔒 No hay sesión activa. Mostrando login.");
                                    injectLogin();
                                }
                            });
                        }, 1500);
                    }
                });
            })
            .catch(err => log("Error de persistencia: " + err.message));
    }

})();
