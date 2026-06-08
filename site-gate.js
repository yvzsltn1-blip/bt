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
    setupStandardNavigation();
  }

  function lock() {
    body.classList.add("site-gate-pending");
    body.classList.remove("site-gate-ready");
  }

  function setupStandardNavigation() {
    const nav = document.querySelector(".top-nav");
    if (!nav) return;

    // Detect which page we are on from pathname
    const currentPath = window.location.pathname.split("/").pop() || "index.html";

    // 4 visible links
    const visibleLinks = [
      {
        href: "index.html",
        label: "Simulasyon",
        class: "nav-sim",
        icon: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
      },
      {
        href: "quick.html",
        label: "Hizli",
        class: "nav-quick",
        icon: '<svg viewBox="0 0 24 24"><path d="M13 2L3 13h8l-1 9L21 11h-7L13 2z"/></svg>'
      },
      {
        href: "archive.html",
        label: "Arsiv",
        class: "nav-archive",
        icon: '<svg viewBox="0 0 24 24"><path d="M4 4h16v5H4z"/><path d="M6 9v11h12V9"/><path d="M9 13h6"/></svg>'
      },
      {
        href: "skill.html",
        label: "Skill",
        class: "nav-skill",
        icon: '<svg viewBox="0 0 24 24"><path d="M12 3 4 7v10l8 4 8-4V7l-8-4z"/><path d="m9 12 2 2 4-4"/></svg>'
      }
    ];

    // Other links inside the dropdown
    const hiddenLinks = [
      {
        href: "optimizer.html",
        label: "Optimizer",
        class: "nav-opt",
        icon: '<svg viewBox="0 0 24 24"><path d="M4 6h16"/><path d="M4 18h16"/><path d="M8 4v4"/><path d="M16 16v4"/></svg>'
      },
      {
        href: "optimizer-v2.html",
        label: "Optimizer v2",
        class: "nav-opt2",
        icon: '<svg viewBox="0 0 24 24"><path d="M7 7h10v10H7z"/><path d="M4 10V4h6"/><path d="M20 14v6h-6"/></svg>'
      },
      {
        href: "optimizer-minimum.html",
        label: "Min Kisit",
        class: "nav-min",
        icon: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
      },
      {
        href: "reliability.html",
        label: "Guvenilirlik",
        class: "nav-rel",
        icon: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-2.9 7.9-7 9-4.1-1.1-7-4.5-7-9V6l7-3z"/><path d="m9.5 12 1.8 1.8 3.7-3.8"/></svg>'
      },
      {
        href: "saved.html",
        label: "Onaylananlar",
        class: "nav-saved",
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-4.9"/></svg>'
      },
      {
        href: "fav.html",
        label: "Favlar",
        class: "nav-fav",
        icon: '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
      },
      {
        href: "test-sonuclari.html",
        label: "Test Sonuclari",
        class: "nav-tests",
        icon: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>'
      },
      {
        href: "wrong.html",
        label: "Yanlislar",
        class: "nav-wrong",
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>'
      },
      {
        href: "planlayici.html",
        label: "Planlayici",
        class: "nav-plan",
        icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      }
    ];

    nav.innerHTML = "";

    // Helper to check if a path matches current page
    function isCurrentPage(href) {
      return currentPath === href;
    }

    // Append visible links
    visibleLinks.forEach(link => {
      const a = document.createElement("a");
      a.className = `nav-link ${link.class}`;
      if (isCurrentPage(link.href)) {
        a.classList.add("active");
      }
      a.href = link.href;
      a.innerHTML = `<span class="nav-link-icon" aria-hidden="true">${link.icon}</span><span class="nav-link-label">${link.label}</span>`;
      nav.appendChild(a);
    });

    // Create dropdown container
    const dropdown = document.createElement("div");
    dropdown.className = "nav-dropdown";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-dropdown-toggle";
    toggle.innerHTML = "•••";
    toggle.title = "Diger Sayfalar";

    // If one of the hidden links is active, highlight the dropdown toggle
    const isAnyHiddenActive = hiddenLinks.some(link => isCurrentPage(link.href));
    if (isAnyHiddenActive) {
      toggle.classList.add("active");
    }

    const menu = document.createElement("div");
    menu.className = "nav-dropdown-menu";

    hiddenLinks.forEach(link => {
      const a = document.createElement("a");
      a.className = `nav-link ${link.class}`;
      if (isCurrentPage(link.href)) {
        a.classList.add("active");
      }
      a.href = link.href;
      a.innerHTML = `<span class="nav-link-icon" aria-hidden="true">${link.icon}</span><span class="nav-link-label">${link.label}</span>`;
      menu.appendChild(a);
    });

    dropdown.appendChild(toggle);
    dropdown.appendChild(menu);
    nav.appendChild(dropdown);

    // Event listeners
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("show");
    });

    document.addEventListener("click", () => {
      menu.classList.remove("show");
    });
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
