// src/views/controlEntry.js

const { el, Toggle } = require("./lib/framework");

const getModels = async () => {
  const { connectDB } = require("../core/connect-db");
  return await connectDB();
};

function renderControlEntryPageHTML({ controlKey } = {}) {
  const script = `
document.addEventListener("DOMContentLoaded", () => {
   async function verify() { try {
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
}
  verify();
  function getControlKey() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  }

  const CONTROL_KEY = getControlKey();

  const verifyBtn   = document.getElementById("verifyBtn");
  const statusEl    = document.getElementById("status");
  const keepMeEl    = document.getElementById("keepMe");

  const useSecretLink     = document.getElementById("useSecretLink");
  const secretPanel       = document.getElementById("secretPanel");
  const secretInput       = document.getElementById("secretInput");
  const secretVerifyBtn   = document.getElementById("secretVerifyBtn");
  const backToPasskeyLink = document.getElementById("backToPasskeyLink");

  const newDeviceLink      = document.getElementById("newDeviceLink");
  const newDevicePanel     = document.getElementById("newDevicePanel");
  const newDeviceUsername  = document.getElementById("newDeviceUsername");
  const newDevicePassword  = document.getElementById("newDevicePassword");
  const createPasskeyBtn   = document.getElementById("createPasskeyBtn");
  const backFromNewDeviceLink = document.getElementById("backFromNewDeviceLink");

  function setStatus(msg, type = "info") {
    statusEl.textContent = msg;
    statusEl.className = "status " + type;
  }

  function bufToB64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_")
      .replace(/=+$/, "");
  }

  function hideAllPanels() {
    secretPanel.style.display = "none";
    newDevicePanel.style.display = "none";
    verifyBtn.style.display = "none";
    useSecretLink.style.display = "none";
    newDeviceLink.style.display = "none";
  }

  function showPasskeyPanel() {
    hideAllPanels();
    verifyBtn.style.display = "block";
    useSecretLink.style.display = "block";
    newDeviceLink.style.display = "block";
    setStatus("Please Click the Button above.", "info");
  }

  function showSecretPanel() {
    hideAllPanels();
    secretPanel.style.display = "flex";
    setStatus("Enter your recovery secret.", "info");
  }

  function showNewDevicePanel() {
    hideAllPanels();
    newDevicePanel.style.display = "flex";
    setStatus("Enter your username and password to register this device.", "info");
  }

  async function startVerification() {
    verifyBtn.disabled = true;
    setStatus("Requesting challenge…", "info");

    const challenge = crypto.getRandomValues(new Uint8Array(32)).buffer;

    let assertion;

    try {
      setStatus("Waiting for passkey…", "info");

      assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: "required",
          rpId: window.location.hostname
        }
      });

    } catch (err) {
      verifyBtn.disabled = false;
      setStatus("Passkey error: " + err.message, "error");
      return;
    }

    setStatus("Verifying…", "info");

    try {
      const res = await fetch("/acr/api/control/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          controlKey: CONTROL_KEY,
          credentialId: bufToB64url(assertion.rawId),
          clientDataJSON: bufToB64url(assertion.response.clientDataJSON),
          authenticatorData: bufToB64url(assertion.response.authenticatorData),
          signature: bufToB64url(assertion.response.signature),
          userHandle: assertion.response.userHandle
            ? bufToB64url(assertion.response.userHandle)
            : null,
          keepMe: keepMeEl.checked ? "14d" : "7d"
        })
      });

      const data = await res.json();

      if (data.success) {
        setStatus("Verified! Redirecting…", "success");
        setTimeout(() => window.location.replace("/acroxa/login"), 600);
      } else {
        setStatus(data.message || "Verification failed.", "error");
        verifyBtn.disabled = false;
      }

    } catch (err) {
      console.error(err);
      setStatus("Connection error.", "error");
      verifyBtn.disabled = false;
    }
  }

  async function startSecretVerification() {
    const secretVal = (secretInput.value || "").trim();

    if (!secretVal) {
      setStatus("Enter your recovery secret.", "error");
      return;
    }

    secretVerifyBtn.disabled = true;
    setStatus("Verifying…", "info");

    try {
      const res = await fetch("/acr/api/control/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          controlKey: CONTROL_KEY,
          recoverySecret: secretVal,
          keepMe: keepMeEl.checked ? "14d" : "7d"
        })
      });

      const data = await res.json();

      if (data.success) {
        setStatus("Verified! Redirecting…", "success");
        setTimeout(() => window.location.replace("/acroxa/login"), 600);
      } else {
        setStatus(data.message || "Verification failed.", "error");
        secretVerifyBtn.disabled = false;
      }

    } catch (err) {
      console.error(err);
      setStatus("Connection error.", "error");
      secretVerifyBtn.disabled = false;
    }
  }

  async function startCreatePasskey() {
    const usernameVal = (newDeviceUsername.value || "").trim();
    const passwordVal = newDevicePassword.value || "";

    if (!usernameVal || !passwordVal) {
      setStatus("Enter both username and password.", "error");
      return;
    }

    if (!window.PublicKeyCredential) {
      setStatus("Passkeys not supported in this browser.", "error");
      return;
    }

    createPasskeyBtn.disabled = true;
    setStatus("Creating passkey…", "info");

    let credential;

    try {
      credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: {
            name: "Acroxa CMS",
            id: window.location.hostname
          },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: usernameVal,
            displayName: usernameVal
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },   // ES256
            { type: "public-key", alg: -257 }  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required"
          },
          timeout: 60000,
          attestation: "none"
        }
      });
    } catch (err) {
      createPasskeyBtn.disabled = false;
      setStatus("Passkey creation error: " + err.message, "error");
      return;
    }

    setStatus("Saving passkey…", "info");

    try {
      const res = await fetch("/acr/api/control/passkey/create-with-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: usernameVal,
          password: passwordVal,
          controlKey: CONTROL_KEY,
          credentialId: bufToB64url(credential.rawId),
          // NOTE: sending the raw attestationObject as a placeholder —
          // server-side COSE public key extraction (@simplewebauthn/server
          // or equivalent) still needs to replace this before production,
          // same TODO as _verifyWebAuthnSignature.
          publicKey: bufToB64url(credential.response.attestationObject),
          transports: credential.response.getTransports
            ? credential.response.getTransports()
            : []
        })
      });

      const data = await res.json();

      if (data.success) {
        setStatus("Passkey registered! You can verify with it now.", "success");
        newDevicePassword.value = "";
        setTimeout(() => showPasskeyPanel(), 1200);
      } else {
        setStatus(data.message || "Passkey registration failed.", "error");
        createPasskeyBtn.disabled = false;
      }

    } catch (err) {
      console.error(err);
      setStatus("Connection error.", "error");
      createPasskeyBtn.disabled = false;
    }
  }

  verifyBtn?.addEventListener("click", startVerification);
  secretVerifyBtn?.addEventListener("click", startSecretVerification);
  createPasskeyBtn?.addEventListener("click", startCreatePasskey);
  useSecretLink?.addEventListener("click", (e) => { e.preventDefault(); showSecretPanel(); });
  backToPasskeyLink?.addEventListener("click", (e) => { e.preventDefault(); showPasskeyPanel(); });
  newDeviceLink?.addEventListener("click", (e) => { e.preventDefault(); showNewDevicePanel(); });
  backFromNewDeviceLink?.addEventListener("click", (e) => { e.preventDefault(); showPasskeyPanel(); });

  if (!CONTROL_KEY) {
    setStatus("Invalid control key.", "error");
    verifyBtn.disabled = true;
    if (secretVerifyBtn) secretVerifyBtn.disabled = true;
    if (createPasskeyBtn) createPasskeyBtn.disabled = true;
    return;
  }

  if (!window.PublicKeyCredential) {
    setStatus("Passkeys not supported in this browser.", "error");
    verifyBtn.disabled = true;
    showSecretPanel();
  }

});
`;

  return "<!DOCTYPE html>" + el(
    "html",
    { lang: "en" },

    el(
      "head",
      {},
      el("meta", { charset: "UTF-8" }),
      el("meta", { name: "viewport", content: "width=device-width, initial-scale=1.0" }),
      el("title", {}, "Verify"),

      el("link", {
        rel: "stylesheet",
        href: "/acrx/assets/css/root.css"
      }),
      el("link", {
        rel: "stylesheet",
        href: "/acrx/assets/css/ad-st.css"
      }),
      el(
        "style",
        {},
        `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-primary-100);
          font-family: system-ui, sans-serif;
          color: var(--text, #f0f0f0);
        }

        .card {
          width: 100%;
          max-width: 380px;
          padding: 2.5rem 2rem;
          border-radius: 14px;
          background: linear-gradient(45deg, var(--accent-100) -40%, color-mix(var(--color-primary-100),var(--color-primary-200)));
          display: flex;
          flex-direction: column;
          gap: 1.4rem;
          filter: saturate(1.5);
        }

        .card-title {
          font-size: 1.15rem;
          font-weight: 600;
          text-align: center;
          opacity: 0.85;
        }

        .card-hint {
          font-size: 0.82rem;
          text-align: center;
          opacity: 0.45;
          line-height: 1.5;
        }

        .btn {
          width: 100%;
          padding: 0.75rem 1rem;
          border: none;
          border-radius: 48px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          background: var(--accent, #4f46e5);
          color: #fff;
          transition: opacity 0.15s, transform 0.1s;
        }

        .btn:hover:not(:disabled) { opacity: 0.88; }
        .btn:active:not(:disabled) { transform: scale(0.98); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .btn-secondary {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.2);
        }

        .status {
          font-size: 0.82rem;
          text-align: center;
          min-height: 1.2em;
          transition: color 0.2s;
        }

        .status.error   { color: #f87171; }
        .status.success { color: #4ade80; }
        .status.info    { opacity: 0.55; }

        .keep-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.82rem;
          opacity: 0.65;
          cursor: pointer;
          user-select: none;
        }

        .keep-row input {
          cursor: pointer;
          accent-color: var(--accent, #4f46e5);
        }

        .link-row {
          text-align: center;
          font-size: 0.8rem;
        }

        .link-row a {
          color: var(--accent, #4f46e5);
          cursor: pointer;
          text-decoration: none;
        }

        .link-row a:hover { text-decoration: underline; }

        .secret-panel, .new-device-panel {
          display: none;
          flex-direction: column;
          gap: 1rem;
        }

        .secret-input {
          width: 100%;
          padding: 0.7rem 0.9rem;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(0,0,0,0.2);
          color: inherit;
          font-size: 0.9rem;
        }

        .secret-input:focus {
          outline: none;
          border-color: var(--accent, #4f46e5);
        }
        `
      )
    ),

    el(
      "body",
      {},

      el(
        "div",
        { class: "card" },

        el("p", { class: "card-title" }, "Verify Identity"),
        el("p", { class: "card-hint" }, "Use your registered passkey to continue."),

        Toggle({
          id: "keepMe",
          label: "Keep me logged in for 14 days",
          checked: false
        }),

        el("button", { class: "btn", id: "verifyBtn" }, "Verify with Passkey"),

        el(
          "div",
          { class: "secret-panel", id: "secretPanel" },
          el("input", {
            class: "secret-input",
            id: "secretInput",
            type: "password",
            placeholder: "Recovery secret",
            autocomplete: "off"
          }),
          el("button", { class: "btn", id: "secretVerifyBtn" }, "Verify with Secret"),
          el(
            "div",
            { class: "link-row" },
            el("a", { id: "backToPasskeyLink" }, "← Back to passkey")
          )
        ),

        el(
          "div",
          { class: "new-device-panel", id: "newDevicePanel" },
          el("input", {
            class: "secret-input",
            id: "newDeviceUsername",
            type: "text",
            placeholder: "Username",
            autocomplete: "username"
          }),
          el("input", {
            class: "secret-input",
            id: "newDevicePassword",
            type: "password",
            placeholder: "Password",
            autocomplete: "current-password"
          }),
          el("button", { class: "btn", id: "createPasskeyBtn" }, "New Device — Create Passkey"),
          el(
            "div",
            { class: "link-row" },
            el("a", { id: "backFromNewDeviceLink" }, "← Back to passkey")
          )
        ),

        el(
          "div",
          { class: "link-row" },
          el("a", { id: "useSecretLink" }, "Don't have your passkey? Use recovery secret")
        ),

        el(
          "div",
          { class: "link-row" },
          el("a", { id: "newDeviceLink" }, "New device? Create passkey")
        ),

        el("p", { class: "status info", id: "status" }, "Please Click the Button above.")
      ),

      el("script", {}, script)
    )
  );
}

module.exports = { renderControlEntry: renderControlEntryPageHTML };

module.exports.meta = [
  {
    path: "/acroxa/token/control/:token",
    render: "renderControlEntryPage",
    title: "Verify - Acroxa",
    css: [],
    js: [],
    layout: "empty",
    header: null,
    sidebar: null,
    footer: null,
    public: true
  }
];

module.exports.renderControlEntryPage = async function (req, res) {
  const controlKey = req.params.token;

  if (!controlKey || !/^[a-f0-9]{64}$/i.test(controlKey)) {
    return res.status(404).send(
      await global.currentLayoutEngine?.render404() ||
      "<h1>404 Page Not Found</h1>"
    );
  }

  try {
    const models = await getModels();
    const user = await models.User.findByControlKey(controlKey);

    if (!user) {
      return res.status(404).send(
        await global.currentLayoutEngine?.render404() ||
        "<h1>404 Page Not Found</h1>"
      );
    }

    return res.send(renderControlEntryPageHTML({ controlKey }));

  } catch (err) {
    console.error("Control Entry Error:", err);
    return res.status(500).send("<h1>Internal Server Error</h1>");
  }
};