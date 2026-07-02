    function injectUI() {
        if (!document.body || document.getElementById('bot-status-panel')) return;
        try {
            var panel = document.createElement('div');
            panel.id = 'bot-status-panel';
            // Por defecto viene abierto
            if (GM_getValue("botMinimized", false) === true) panel.classList.add('minimized');

            panel.innerHTML = `
                <div class="mini-icon">👑 ELITE BOT</div>
                <div class="bot-header">
                    <span style="color:#ff3e3e; font-weight:bold; font-size:12px;">ELITE 2.2</span>
                    <button id="bot-minimize-btn" style="background:none; border:none; color:#666; cursor:pointer; font-size:16px;">−</button>
                </div>
                <div id="bot-content-area">
                    <a href="https://www.paypal.com/paypalme/BiteTV41?country.x=CO&locale.x=es_XC" target="_blank" class="donate-btn" style="margin-top:0;">DONAR PAYPAL</a>
                <div style="padding:10px; border-bottom:1px solid rgba(155, 89, 182, 0.3); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:900; color:#9b59b6; font-size:12px;">BEETLEJUICE ELITE</span>
                    <span id="bot-detected-id-val" style="font-size:10px; color:#666;"></span>
                </div>
                <div style="padding:0 10px 10px 10px;">
                    <div id="bot-status-text" style="font-size:11px; font-weight:bold; margin-bottom:8px;"></div>
                    <div id="bot-mode-text" style="font-size:10px; color:#888;"></div>
                </div>
                    <div class="bot-row"><span class="bot-label">MODO:</span>
                        <select id="bot-mode-selector" class="bot-select" style="width:100px; font-size:11px;">
                            <option value="hunt" ${botMode === "hunt" ? "selected" : ""}>Cacería</option>
                            <option value="grotto" ${botMode === "grotto" ? "selected" : ""}>Gruta</option>
                            <option value="ruins" ${botMode === "ruins" ? "selected" : ""}>Ruinas</option>
                        </select>
                    </div>

                    <div style="margin-bottom:8px; border-top:1px solid #333; padding-top:8px;">
                        <span class="bot-label">NIVEL HUNT:</span>
                        <select id="bot-hunt-level" class="bot-select" style="font-size:11px;">
                            <option value="1" ${huntLevel == 1 ? "selected" : ""}>1-Granja</option>
                            <option value="5" ${huntLevel == 5 ? "selected" : ""}>5-Ciudad</option>
                        </select>
                    </div>

                    <div class="bot-row"><span class="bot-label">CAPA RUINAS:</span>
                        <input type="number" id="bot-limit-layer" class="bot-input" style="width:40px; font-size:11px;" value="${limitLayer}">
                    </div>

                    <button id="toggle-bot" class="bot-btn" style="background:${botEnabled ? '#e67e22' : '#27ae60'}; padding:6px; font-size:11px;">${botEnabled ? 'DETENER' : 'INICIAR'}</button>
                    <button id="open-troop-config" class="bot-btn" style="background:#8e44ad; padding:6px; font-size:11px; margin-top:4px;">TROPAS RUINAS</button>
                    
                    <div id="bot-logs" style="margin-top:8px; font-size:10px; max-height:80px;"></div>
                </div>
            `;
            document.body.appendChild(panel);

            document.getElementById('bot-minimize-btn').onclick = function(e){
                e.stopPropagation();
                var isMin = panel.classList.toggle('minimized');
                GM_setValue("botMinimized", isMin);
            };
            panel.querySelector('.mini-icon').onclick = function(){
                panel.classList.remove('minimized');
                GM_setValue("botMinimized", false);
            };

            document.getElementById('toggle-bot').addEventListener('click', function () {
                botEnabled = !botEnabled;
                GM_setValue(getUniqueKey("botEnabled"), botEnabled);
                this.innerText = botEnabled ? "DETENER" : "INICIAR";
                this.style.background = botEnabled ? "#e67e22" : "#27ae60";
                document.getElementById('bot-status-text').innerText = botEnabled ? "ON" : "OFF";
                document.getElementById('bot-status-text').style.color = botEnabled ? "#27ae60" : "#e74c3c";
                log(botEnabled ? "Bot Iniciado" : "Bot Detenido");
                if (botEnabled) mainLoop();
            });

            document.getElementById('bot-mode-selector').addEventListener('change', function () {
                botMode = this.value;
                GM_setValue(getUniqueKey("botMode"), botMode);
                log("Modo cambiado a: " + botMode);
            });

            document.getElementById('bot-hunt-level').addEventListener('change', function () {
                huntLevel = parseInt(this.value);
                GM_setValue(getUniqueKey("huntLevel"), huntLevel);
                log("Nivel de cacería: " + huntLevel);
            });

            document.getElementById('bot-limit-layer').addEventListener('change', function () {
                limitLayer = parseInt(this.value);
                GM_setValue(getUniqueKey("limitLayer"), limitLayer);
                log("Capa límite: " + limitLayer);
            });

            document.getElementById('open-troop-config').addEventListener('click', function () {
                var section = document.getElementById('bot-troop-config-section');
                section.style.display = (section.style.display === 'none' || section.style.display === '') ? 'block' : 'none';
            });

        } catch (e) {
            console.error("[BOT] Error inyectando UI:", e);
        }
    }
