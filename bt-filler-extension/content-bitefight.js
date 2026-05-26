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
      await sleep(180 + Math.random() * 140);
    }
    for (let j = 0; j < count % 10; j++) {
      plus1.click();
      await sleep(130 + Math.random() * 100);
    }
    await sleep(350 + Math.random() * 200);
  }
}

function injectButton() {
  if (document.querySelector('#bt-filler-btn')) return;
  if (!document.querySelector('.stepBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'bt-filler-btn';
  btn.textContent = 'BT Doldur';
  btn.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'z-index:99999',
    'background:#6b0000',
    'color:#ffd700',
    'border:2px solid #ffd700',
    'padding:10px 18px',
    'border-radius:8px',
    'font-size:14px',
    'font-weight:bold',
    'cursor:pointer',
    'box-shadow:0 2px 8px rgba(0,0,0,0.6)',
    'transition:background 0.2s'
  ].join(';');

  btn.onmouseenter = () => { btn.style.background = '#9b0000'; };
  btn.onmouseleave = () => { btn.style.background = '#6b0000'; };

  btn.onclick = async () => {
    const data = await chrome.storage.local.get('btUnits');
    const targets = data.btUnits;

    if (!targets || Object.keys(targets).length === 0) {
      btn.textContent = 'Veri yok! quick.html ac';
      setTimeout(() => { btn.textContent = 'BT Doldur'; }, 2500);
      return;
    }

    btn.textContent = 'Dolduruluyor...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    await fillUnits(targets);

    btn.textContent = 'Tamamlandi!';
    btn.style.background = '#1a6b2a';
    btn.style.opacity = '1';
    setTimeout(() => {
      btn.textContent = 'BT Doldur';
      btn.style.background = '#6b0000';
      btn.disabled = false;
    }, 3000);
  };

  document.body.appendChild(btn);
}

// Sayfa dinamik yukleniyorsa bekle
injectButton();
const obs = new MutationObserver(injectButton);
obs.observe(document.body, { childList: true, subtree: true });
