// Sadece quick.html'de calisir (quickUnitList elementine gore tespit eder)
if (!document.querySelector('#quickResultPopup')) return;

const TIER_MAP = {
  'Yarasa Surusu': 1,
  'Gulyabani': 2,
  'Vampir Kole': 3,
  'Banshee': 4,
  'Olu Cagirici': 5,
  'Gargoyle': 6,
  'Kan Cadisi': 7,
  'Curuk Girtlak': 8
};

function readAndSaveUnits() {
  const popup = document.querySelector('#quickResultPopup');
  if (!popup || !popup.classList.contains('is-visible')) return;

  const units = {};
  document.querySelectorAll('#quickUnitList .quick-popup-unit-item').forEach(item => {
    const nameEl = item.querySelector('.quick-popup-unit-name');
    const countEl = item.querySelector('.quick-popup-unit-count');
    if (!nameEl || !countEl) return;

    const fullName = nameEl.textContent.trim();
    const tierMatch = fullName.match(/T(\d+)/);
    let tier = tierMatch ? parseInt(tierMatch[1]) : null;

    if (!tier) {
      for (const key in TIER_MAP) {
        if (fullName.includes(key)) { tier = TIER_MAP[key]; break; }
      }
    }

    const count = parseInt(countEl.textContent.trim().split('/')[0].trim());
    if (tier && !isNaN(count) && count > 0) units[tier] = count;
  });

  if (Object.keys(units).length === 0) return;

  chrome.storage.local.set({ btUnits: units }, () => {
    const btn = document.querySelector('#copyBitefightBtn');
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = 'Bitefight icin kaydedildi!';
    btn.style.background = '#1a6b2a';
    setTimeout(() => {
      btn.textContent = prev;
      btn.style.background = '';
    }, 2000);
  });
}

const observer = new MutationObserver(readAndSaveUnits);
observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
