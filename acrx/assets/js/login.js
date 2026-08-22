// public/acrx/assets/js/login.js
document.addEventListener("DOMContentLoaded", async () => {

  // ─────────────────────────────
  // STATE
  // ─────────────────────────────
  let failedAttempts = 0;

  // ─────────────────────────────
  // VERIFY EXISTING SESSION
  // ─────────────────────────────
  try {
    const verifyRes = await fetch("/acr/api/verify", {
      method: "GET",
      credentials: "include"
    });

    if (verifyRes.status === 200) {
      const data = await verifyRes.json();
      if (data.success) {
        const params      = new URLSearchParams(window.location.search);
        let   redirectUrl = params.get("acrx") || "/acrx/dashboard";
        try { redirectUrl = decodeURIComponent(redirectUrl); } catch (e) {}
        window.location.replace(redirectUrl);
        return;
      }
    }
  } catch (err) {
    console.log("Verify failed:", err);
  }
  (function () {

  // ── TOGGLE: show/hide dropdown ───────────────────────────────
  const toggle = document.getElementById("keepMeToggle");
  const dropdown = document.getElementById("dropdown-keep-me-logged-in");

  if (toggle && dropdown) {
    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        dropdown.classList.add("active");
      } else {
        dropdown.classList.remove("active");
      }
    });
  }

  // ── DROPDOWN: selection system ────────────────────────────────
  const menuButtons = document.querySelectorAll(".dropdown-item");

  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const itemvalue = btn.getAttribute("data-value");
        console.log(itemvalue);
      const dropdownRoot = btn.closest(".dropdown");
      const toggleBtn = dropdownRoot.querySelector(".dropdown-toggle");

      // set label
      if (toggleBtn) {
        toggleBtn.childNodes[0].textContent = btn.textContent + " ";
      }

      // store selected value
      dropdownRoot.setAttribute("data-selected", itemvalue);
        const input = document.getElementById("keepMeDuration-hidden");
        input.value = itemvalue;
        
      // close menu after select
      const menu = dropdownRoot.querySelector(".dropdown-menu");
      menu.classList.remove("active");
    });
  });

  // ── OPEN/CLOSE DROPDOWN ───────────────────────────────────────
  const dropdownToggles = document.querySelectorAll(".dropdown-toggle");

  dropdownToggles.forEach(btn => {
    btn.addEventListener("click", () => {
      const menu = btn.closest(".dropdown").querySelector(".dropdown-menu");
      if (!menu) return;

      menu.classList.toggle("active");
    });
  });

})();

  // ─────────────────────────────
  // ELEMENTS
  // ─────────────────────────────
  const loginForm    = document.querySelector(".main");
  const resetBox     = document.querySelector(".reset-box");
  const loginBtn     = document.querySelector('[data-set-op="log"]');
  const forgotBtn    = document.querySelector(".fg-p");
  const emailInput   = document.getElementById("okl");
  const passInput    = document.getElementById("pwd");
  const keepToggle   = document.getElementById("keepMeToggle");
  const keepDuration = document.getElementById("keepMeDuration-hidden");

  const step1       = document.querySelector(".step1");
  const step2       = document.querySelector(".step2");
  const sendCodeBtn = document.getElementById("sendCodeBtn");
  const resetPwdBtn = document.getElementById("resetPwdBtn");

  // ─────────────────────────────
  // HELPERS
  // ─────────────────────────────
  const showToast = (msg, type = "info") => {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 50);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  const shake = (el) => {
    if (!el) return;
    el.classList.add("shake");
    setTimeout(() => el.classList.remove("shake"), 500);
  };

  /** Returns the selected keepMe value, or "2h" if the toggle is off. */
  function getKeepMe() {
    if (!keepToggle?.checked) return "2h";
    return keepDuration?.value || "7d";
  }

  // ─────────────────────────────
  // LOGIN HANDLER
  // ─────────────────────────────
  loginBtn?.addEventListener("click", async () => {
    const username = emailInput?.value.trim();
    const password = passInput?.value.trim();
    const keepMe   = getKeepMe();

    if (!username || !password) {
      shake(loginBtn);
      showToast("Please enter username and password", "error");
      return;
    }

    loginBtn.disabled     = true;
    loginBtn.innerText    = "Logging in...";
    loginBtn.classList.add("loading");
    console.log("Logging in with:", { username, password, keepMe });
    try {
      const res = await fetch("/acr/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Mode": "acr-login"
        },
        credentials: "include",
        body: JSON.stringify({ username, password, keepMe })
      });

      const data = await res.json();

      // ── Firewall / rate-limit responses ────────────────────────────────────
      if (res.status === 429) {
        failedAttempts++;
        showToast("Too many attempts. Please wait.", "error");
        shake(loginBtn);
        if (failedAttempts >= 3) showToast("Security system tightening...", "error");
        return;
      }

      if (res.status === 403 || res.status === 404) {
        failedAttempts++;
        showToast("Access denied.", "error");
        shake(loginBtn);
        return;
      }

      // ── Login failure ───────────────────────────────────────────────────────
      if (!data.success) {
        failedAttempts++;
        showToast("Invalid credentials.", "error");
        shake(loginBtn);
        if (failedAttempts === 3) showToast("Warning: multiple failed attempts", "error");
        if (failedAttempts === 5) showToast("Further attempts may be restricted", "error");
        return;
      }

      // ── Success ─────────────────────────────────────────────────────────────
      failedAttempts = 0;
      showToast("Login successful!", "success");

      const params      = new URLSearchParams(window.location.search);
      let   redirectUrl = params.get("acrx") || "/acrx/dashboard";
      try { redirectUrl = decodeURIComponent(redirectUrl); } catch (e) {}

      setTimeout(() => window.location.replace(redirectUrl), 700);

    } catch (err) {
      console.error(err);
      showToast("Connection error.", "error");
      shake(loginBtn);
    } finally {
      loginBtn.disabled  = false;
      loginBtn.innerText = "Login";
      loginBtn.classList.remove("loading");
    }
  });

  // ─────────────────────────────
  // FORGOT PASSWORD UI
  // ─────────────────────────────
  forgotBtn?.addEventListener("click", () => {
    loginForm.classList.add("hidden");
    setTimeout(() => {
      loginForm.style.display = "none";
      resetBox.style.display  = "block";
      setTimeout(() => resetBox.classList.remove("hidden"), 50);
    }, 300);
  });

  // ─────────────────────────────
  // RESET STEP 1 — send code
  // ─────────────────────────────
  sendCodeBtn?.addEventListener("click", async () => {
    const identifier = document.getElementById("identifier").value.trim();

    if (!identifier) {
      shake(sendCodeBtn);
      showToast("Enter email or username.", "error");
      return;
    }

    sendCodeBtn.disabled    = true;
    sendCodeBtn.innerText   = "Sending...";

    try {
      const res  = await fetch("/acr/api/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier })
      });
      const data = await res.json();

      if (data.success) {
        showToast("Code sent!", "success");
        step1.style.display = "none";
        step2.style.display = "block";
      } else {
        showToast(data.message || "Failed to send code.", "error");
      }
    } catch (err) {
      showToast("Connection error.", "error");
    } finally {
      sendCodeBtn.disabled  = false;
      sendCodeBtn.innerText = "Send Reset Code";
    }
  });

  // ─────────────────────────────
  // RESET STEP 2 — submit new pw
  // ─────────────────────────────
  resetPwdBtn?.addEventListener("click", async () => {
    const identifier  = document.getElementById("identifier").value.trim();
    const code        = document.getElementById("code").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();

    if (!code || !newPassword) {
      shake(resetPwdBtn);
      showToast("Fill all fields.", "error");
      return;
    }

    resetPwdBtn.disabled  = true;
    resetPwdBtn.innerText = "Resetting...";

    try {
      const res  = await fetch("/acr/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier, code, newPassword })
      });
      const data = await res.json();

      if (data.success) {
        showToast("Password updated!", "success");
        setTimeout(() => {
          resetBox.style.display  = "none";
          loginForm.style.display = "flex";
          loginForm.classList.remove("hidden");
        }, 800);
      } else {
        showToast(data.message || "Invalid code.", "error");
      }
    } catch (err) {
      showToast("Connection error.", "error");
    } finally {
      resetPwdBtn.disabled  = false;
      resetPwdBtn.innerText = "Reset Password";
    }
  });

  // ─────────────────────────────
  // ENTER KEY HANDLING
  // ─────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const active = document.activeElement;

    if (loginForm.contains(active) && !loginForm.classList.contains("hidden")) {
      e.preventDefault();
      loginBtn?.click();
    } else if (step1.contains(active) && step1.style.display !== "none") {
      e.preventDefault();
      sendCodeBtn?.click();
    } else if (step2.contains(active) && step2.style.display !== "none") {
      e.preventDefault();
      resetPwdBtn?.click();
    }
  });

});
