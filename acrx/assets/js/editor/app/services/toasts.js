// acrx/assets/js/editor/app/services/toasts.js
//
// Toasts reuse the platform helper (window.System.showToast from
// system/_shared.js) when present; otherwise a minimal token-styled fallback
// container is used. One API, no duplicate toast systems.

let fallbackRoot = null;

const TOAST_ICONS = {
  success: "fa-circle-check",
  error: "fa-triangle-exclamation",
  warning: "fa-triangle-exclamation",
  info: "fa-circle-info",
};

function fallback(msg, type) {
  if (!fallbackRoot) {
    fallbackRoot = document.createElement("div");
    fallbackRoot.className = "acrx-toasts";
    fallbackRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(fallbackRoot);
  }
  const el = document.createElement("div");
  el.className = `acrx-toast acrx-toast-${type || "info"}`;
  const icon = document.createElement("i");
  icon.className = `fa-duotone ${TOAST_ICONS[type] || TOAST_ICONS.info}`;
  icon.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = msg;
  el.append(icon, text);
  fallbackRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3600);
}

export function toast(msg, type = "info") {
  try {
    if (window.System && typeof window.System.showToast === "function") {
      window.System.showToast(msg, type);
      return;
    }
  } catch { /* fall through to local */ }
  fallback(msg, type);
}

export default { toast };
