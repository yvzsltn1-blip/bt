"use strict";

(function attachAdminAuthUi(globalScope) {
  async function bindAdminControls(options = {}) {
    const api = globalScope.BTFirebase;
    const statusLabel = options.statusLabel || null;
    const emailInput = options.emailInput || null;
    const passwordInput = options.passwordInput || null;
    const loginButton = options.loginButton || null;
    const logoutButton = options.logoutButton || null;
    const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : null;

    if (emailInput && !emailInput.value && api?.ADMIN_EMAIL) {
      emailInput.value = api.ADMIN_EMAIL;
    }
    if (passwordInput) {
      passwordInput.autocomplete = "new-password";
      passwordInput.setAttribute("data-lpignore", "true");
      passwordInput.setAttribute("data-1p-ignore", "true");
      passwordInput.setAttribute("autocapitalize", "off");
      passwordInput.setAttribute("autocorrect", "off");
      passwordInput.setAttribute("spellcheck", "false");
    }

    function render(isAdmin, user, note = "") {
      if (statusLabel) {
        statusLabel.textContent = note || (isAdmin ? `Admin acik: ${user?.email || api?.ADMIN_EMAIL || "-"}` : "Admin kapali");
      }
      if (loginButton) {
        loginButton.hidden = isAdmin;
        loginButton.disabled = false;
      }
      if (logoutButton) {
        logoutButton.hidden = !isAdmin;
        logoutButton.disabled = false;
      }
      if (emailInput) {
        emailInput.disabled = isAdmin;
      }
      if (passwordInput) {
        if (isAdmin) {
          passwordInput.value = "";
          passwordInput.placeholder = "Firebase Auth sifresini tekrar gir";
        } else {
          passwordInput.placeholder = "Firebase Auth admin sifresi";
        }
      }
      if (onStateChange) {
        onStateChange(isAdmin, user, note);
      }
    }

    if (loginButton) {
      loginButton.addEventListener("click", async () => {
        if (!api || typeof api.signInAdmin !== "function") {
          render(false, null, "Admin girisi hazir degil.");
          return;
        }

        loginButton.disabled = true;
        render(false, null, "Admin girisi deneniyor...");
        try {
          const user = await api.signInAdmin(emailInput?.value || "", passwordInput?.value || "");
          render(true, user);
        } catch (error) {
          render(false, null, error?.message || "Admin girisi basarisiz.");
        } finally {
          loginButton.disabled = false;
        }
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        if (!api || typeof api.signOutAdmin !== "function") {
          render(false, null);
          return;
        }

        logoutButton.disabled = true;
        try {
          await api.signOutAdmin();
          render(false, null, "Admin cikisi yapildi.");
        } catch (error) {
          render(true, api.getCurrentUser?.() || null, error?.message || "Cikis yapilamadi.");
        } finally {
          logoutButton.disabled = false;
        }
      });
    }

    let unsubscribe = () => {};
    if (api && typeof api.onAdminStateChanged === "function") {
      unsubscribe = api.onAdminStateChanged((isAdmin, user) => {
        render(isAdmin, user);
      });
    } else {
      render(false, null, "Admin girisi hazir degil.");
    }

    return unsubscribe;
  }

  globalScope.AdminAuthUI = {
    bindAdminControls
  };
})(window);
