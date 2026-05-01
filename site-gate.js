"use strict";

(function initSiteGate(globalScope) {
  const STORAGE_KEY = "btAnalyssSiteGateAuthedV1";
  const GATE_USERNAME = "yavuz";
  const GATE_PASSWORD = "12344321.yY";

  const body = document.body;
  if (!body) {
    return;
  }

  function normalize(value) {
    return String(value || "").trim();
  }

  function isAuthed() {
    return globalScope.localStorage?.getItem(STORAGE_KEY) === "1";
  }

  function unlock() {
    body.classList.remove("site-gate-pending");
    body.classList.add("site-gate-ready");
    document.querySelector(".site-gate-overlay")?.remove();
  }

  function lock() {
    body.classList.add("site-gate-pending");
    body.classList.remove("site-gate-ready");
  }

  function createField(labelText, placeholderText) {
    const wrap = document.createElement("label");
    wrap.className = "site-gate-field";

    const label = document.createElement("span");
    label.textContent = labelText;

    const input = document.createElement("textarea");
    input.rows = 1;
    input.className = "site-gate-textarea";
    input.placeholder = placeholderText;
    input.spellcheck = false;

    wrap.append(label, input);
    return { wrap, input };
  }

  function renderGate() {
    lock();

    const overlay = document.createElement("div");
    overlay.className = "site-gate-overlay";

    const card = document.createElement("div");
    card.className = "site-gate-card";

    const eyebrow = document.createElement("p");
    eyebrow.className = "site-gate-eyebrow";
    eyebrow.textContent = "BT ANALYSS";

    const title = document.createElement("h1");
    title.className = "site-gate-title";
    title.textContent = "Giris";

    const copy = document.createElement("p");
    copy.className = "site-gate-copy";
    copy.textContent = "Devam etmek icin kullanici adi ve sifre gir.";

    const usernameField = createField("Kullanici Adi", "Kullanici adini yaz");
    const passwordField = createField("Sifre", "Sifreyi yaz");

    const errorBox = document.createElement("div");
    errorBox.className = "site-gate-error";
    errorBox.hidden = true;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-primary site-gate-button";
    button.textContent = "Giris Yap";

    function submit() {
      const username = normalize(usernameField.input.value);
      const password = normalize(passwordField.input.value);

      if (username === GATE_USERNAME && password === GATE_PASSWORD) {
        globalScope.localStorage?.setItem(STORAGE_KEY, "1");
        unlock();
        return;
      }

      errorBox.hidden = false;
      errorBox.textContent = "Kullanici adi veya sifre hatali.";
      passwordField.input.focus();
      passwordField.input.select();
    }

    [usernameField.input, passwordField.input].forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          submit();
        }
      });
    });

    button.addEventListener("click", submit);

    card.append(
      eyebrow,
      title,
      copy,
      usernameField.wrap,
      passwordField.wrap,
      errorBox,
      button
    );
    overlay.appendChild(card);
    body.appendChild(overlay);
    usernameField.input.focus();
  }

  if (isAuthed()) {
    unlock();
    return;
  }

  renderGate();
})(window);
