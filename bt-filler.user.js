// ==UserScript==
// @name         BT Birlik Doldurucu
// @namespace    https://bt-analiz.web.app
// @version      1.0
// @description  quick.html sonuclarini Bitefight savasa otomatik doldurur
// @match        https://bt-analiz.web.app/*
// @match        *://*.bitefight.org/*
// @match        *://*.bitefight.gameforge.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  // ── quick.html tarafı ──────────────────────────────────────────────
  if (location.hostname === 'bt-analiz.web.app') {
    const observer = new MutationObserver(() => {
      const popup = document.querySelector('#quickResultPopup');
      if (!popup || !popup.classList.contains('is-visible')) return;

      const units = {};
      popup.querySelectorAll('.quick-popup-unit-item').forEach(item => {
        const nameEl = item.querySelector('.quick-popup-unit-name');
        const countEl = item.querySelector('.quick-popup-unit-count');
        if (!nameEl || !countEl) return;
        const m = nameEl.textContent.match(/T(\d+)/);
        const count = parseInt(countEl.textContent.split('/')[0].trim());
        if (m && !isNaN(count) && count > 0) units[m[1]] = count;
      });

      if (Object.keys(units).length === 0) return;

      GM_setValue('btUnits', JSON.stringify(units));

      // Butonu güncelle
      const btn = document.querySelector('#mobilSaveBtn');
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Bitefight icin kaydedildi!';
        btn.style.background = '#1a6b2a';
        setTimeout(() => { btn.textContent = prev; btn.style.background = ''; }, 2500);
      }
    });

    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    return;
  }

  // ── Bitefight tarafı ───────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function fillUnits(targets) {
    for (const tier in targets) {
      const count = targets[tier];
      const plus10 = document.querySelector(`.stepBtn.btnPlus10[data-id="${tier}"]`);
      const plus1 = document.querySelector(`.stepBtn.btnPlus1[data-id="${tier}"]`);
      if (!plus10 || !plus1) continue;
      for (let i = 0; i < Math.floor(count / 10); i++) {
        plus10.click();
        await sleep(190 + Math.random() * 130);
      }
      for (let j = 0; j < count % 10; j++) {
        plus1.click();
        await sleep(140 + Math.random() * 100);
      }
      await sleep(380 + Math.random() * 180);
    }
  }

  function injectButton() {
    if (document.querySelector('#bt-filler-btn')) return;
    if (!document.querySelector('.stepBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'bt-filler-btn';
    btn.textContent = 'BT Doldur';
    btn.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:2147483647',
      'background:#6b0000', 'color:#ffd700', 'border:2px solid #ffd700',
      'padding:12px 20px', 'border-radius:8px', 'font-size:15px',
      'font-weight:bold', 'cursor:grab', 'box-shadow:0 2px 10px rgba(0,0,0,0.7)',
      'user-select:none', 'touch-action:none'
    ].join(';');

    // Sürükleme
    let dragging = false, startX, startY, origRight, origBottom;
    btn.addEventListener('pointerdown', e => {
      dragging = false;
      startX = e.clientX; startY = e.clientY;
      const rect = btn.getBoundingClientRect();
      origRight = window.innerWidth - rect.right;
      origBottom = window.innerHeight - rect.bottom;
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', e => {
      if (Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) return;
      dragging = true;
      btn.style.cursor = 'grabbing';
      const rect = btn.getBoundingClientRect();
      btn.style.right = (window.innerWidth - rect.right - (e.clientX - startX)) + 'px';
      btn.style.bottom = (window.innerHeight - rect.bottom - (e.clientY - startY)) + 'px';
      startX = e.clientX; startY = e.clientY;
    });
    btn.addEventListener('pointerup', () => {
      btn.style.cursor = 'grab';
    });

    btn.onclick = async () => {
      if (dragging) return;
      const raw = GM_getValue('btUnits', null);
      if (!raw) {
        btn.textContent = 'Veri yok! bt-analiz ac';
        setTimeout(() => { btn.textContent = 'BT Doldur'; }, 2500);
        return;
      }

      const targets = JSON.parse(raw);
      btn.textContent = 'Dolduruluyor...';
      btn.disabled = true;

      await fillUnits(targets);

      btn.textContent = 'Tamamlandi!';
      btn.style.background = '#1a6b2a';
      setTimeout(() => {
        btn.textContent = 'BT Doldur';
        btn.style.background = '#6b0000';
        btn.disabled = false;
      }, 3000);
    };

    document.body.appendChild(btn);
  }

  injectButton();
  new MutationObserver(injectButton).observe(document.body, { childList: true, subtree: true });
})();
