// acrx/assets/js/editor/app/panels/responsive-ui.js
//
// Device preview: desktop/tablet/mobile canvas widths driven by State
// deviceMode, honoring the responsive engine's breakpoints. Inspector edits
// style keys per breakpoint through the controller; this module owns the
// canvas presentation + device state.

import { State } from "../core/store.js";

let ctx = null;

const WIDTHS = { desktop: "100%", tablet: "768px", mobile: "390px" };

export function initResponsive(shared) {
  ctx = shared;
  window.addEventListener("resize", () => apply());
}

export function setDevice(mode) {
  if (!["desktop", "tablet", "mobile"].includes(mode)) return;
  State.patch("editor", { deviceMode: mode });
  apply();
  ctx.render();
  ctx.updateFooter();
}

export function deviceMode() {
  return State.value("editor.deviceMode") || "desktop";
}

export function apply() {
  const canvas = ctx.canvas();
  const mode = deviceMode();
  canvas.classList.remove("acrx-device-desktop", "acrx-device-tablet", "acrx-device-mobile");
  canvas.classList.add(`acrx-device-${mode}`);
  canvas.style.setProperty("--acrx-canvas-width", WIDTHS[mode]);
}

export default { initResponsive, setDevice, deviceMode, apply };
