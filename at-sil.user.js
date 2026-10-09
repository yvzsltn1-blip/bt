// ==UserScript==
// @name         At Nesnelerini At (BiteFight)
// @namespace    yvzslymn
// @version      2.0.0
// @description  Profil sayfasındaki "At" butonlarına sırayla basar; istisna listesindeki nesneler atılmaz
// @match        https://*.bitefight.gameforge.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const MIN_DELAY = 1200; // ms, iki tıklama arası en az bekleme
    const MAX_DELAY = 2200; // ms, en fazla bekleme
    const MAX_CLICKS = 200; // oturum başına güvenlik sınırı

    const running = GM_getValue('running', false);
    const keep = GM_getValue('keep', []); // nesne adı veya ID (ör. "Avobosh Ω" ya da "7710")

    const norm = s => String(s).trim().toLowerCase();

    function itemName(row) {
        const first = (row.innerText || '').split('\n').map(s => s.trim()).find(Boolean) || '';
        return first.split('(')[0].trim();
    }

    function findTargets() {
        const keepSet = new Set(keep.map(norm));
        return [...document.querySelectorAll('a.btn')]
            .filter(a => a.textContent.trim() === 'At' && a.href.includes('/profile/discardItem/'))
            .map(a => {
                const id = (a.href.match(/discardItem\/\d+\/(\d+)/) || [])[1] || '';
                const name = itemName(a.closest('tr') || a.parentElement);
                return { a, id, name, kept: keepSet.has(norm(name)) || keepSet.has(id) };
            });
    }

    function run() {
        if (!running) return;
        // Sadece profil sayfasında çalış; başka sayfada bekle
        if (!location.pathname.startsWith('/profile')) return;

        const targets = findTargets().filter(t => !t.kept);
        if (targets.length === 0) {
            console.log('[At Atıcı] Atılacak nesne kalmadı, kapatılıyor.');
            GM_setValue('running', false);
            return;
        }

        const next = targets[0];
        const clicks = GM_getValue('clicks', 0);
        // Aynı nesne tıklamadan sonra hâlâ duruyorsa (sunucu hatası vb.) döngüye girme
        if (next.id === GM_getValue('lastId', '') || clicks >= MAX_CLICKS) {
            console.warn('[At Atıcı] Durduruldu:', next.name, next.id);
            GM_setValue('running', false);
            return;
        }

        GM_setValue('lastId', next.id);
        GM_setValue('clicks', clicks + 1);
        console.log('[At Atıcı] Atılıyor:', next.name, next.id);
        const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
        setTimeout(() => {
            if (GM_getValue('running', false)) next.a.click();
        }, delay);
    }

    GM_registerMenuCommand(
        running ? 'Otomatik at: AÇIK (kapat)' : 'Otomatik at: KAPALI (aç)',
        () => {
            GM_setValue('running', !running);
            GM_setValue('lastId', '');
            GM_setValue('clicks', 0);
            location.reload();
        }
    );

    GM_registerMenuCommand('İstisnalar (ad veya ID, virgülle ayır)', () => {
        const input = prompt('Atılmayacak nesneler (ad veya ID, virgülle ayır):', keep.join(', '));
        if (input === null) return;
        GM_setValue('keep', input.split(',').map(s => s.trim()).filter(Boolean));
    });

    run();
})();
