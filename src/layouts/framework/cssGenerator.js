// src/layouts/framework/cssGenerator.js
//
// Generates /src/layouts/framework/variables.css from the active layout config.
// Called on:
//   1. Layout config save (updateConfig in layoutController)
//   2. Layout activation (setActiveLayout in layoutController)
//   3. Server boot (after bootLayout)
//
// What it generates:
//   - Full primary   50→950 shade scale from one hex
//   - Full secondary 50→950 shade scale from one hex
//   - BG + Text colors for light AND dark theme (user-picked)
//   - @font-face blocks for heading + body fonts (from /uploads/fonts/)
//   - CSS custom properties for base font size, font families
//   - Dark theme: primary/secondary shades are "shuffled" (mapped in reverse lightness),
//     bg and text use the user's dark-mode picks

"use strict";

const fs   = require("fs");
const path = require("path");

const FRAMEWORK_DIR  = __dirname;
const VARIABLES_FILE = path.join(FRAMEWORK_DIR, "variables.css");
const FONTS_DIR      = path.join(__dirname, "../../uploads/fonts");

// ─────────────────────────────────────────────────────────────────────────────
// COLOR MATH
// ─────────────────────────────────────────────────────────────────────────────

function hexToHsl(hex) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const num = parseInt(hex, 16);
  let r = (num >> 16) & 255;
  let g = (num >>  8) & 255;
  let b =  num        & 255;

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h =  (b - r) / d + 2;  break;
      case b: h =  (r - g) / d + 4;  break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

// Generate a perceptually balanced 50-950 scale from one base hex.
// The base color lands closest to the 500 shade.
// Lightness ramp: 50=95%, 100=90%, 200=80%, 300=68%, 400=58%, 500=48%,
//                 600=38%, 700=28%, 800=18%, 900=10%, 950=6%
const SHADE_LIGHTNESS = {
   50: 96,
  100: 91,
  200: 81,
  300: 69,
  400: 58,
  500: 47,
  600: 37,
  700: 27,
  800: 17,
  900:  9,
  950:  5,
};

function generateShadeScale(hex) {
  const { h, s } = hexToHsl(hex);
  // Clamp saturation — desaturate slightly at extremes for naturalness
  const shades = {};
  for (const [shade, lightness] of Object.entries(SHADE_LIGHTNESS)) {
    const sat = Math.min(100, s * (lightness > 70 ? 0.6 : lightness < 20 ? 0.8 : 1.0));
    shades[shade] = hslToHex(h, sat, lightness);
  }
  return shades;
}

// Dark theme shade shuffle: map light shades to their mirror counterparts
// 50↔950, 100↔900, 200↔800, 300↔700, 400↔600, 500↔500
const DARK_SHUFFLE = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 };

// ─────────────────────────────────────────────────────────────────────────────
// FONT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function slugify(family = "") {
  return family.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function loadFontMeta(family) {
  if (!family) return null;
  const slug    = slugify(family);
  const metaFile = path.join(FONTS_DIR, slug, "_meta.json");
  if (!fs.existsSync(metaFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaFile, "utf-8"));
  } catch {
    return null;
  }
}

function buildFontFace(family, role = "primary") {
  const meta = loadFontMeta(family);
  if (!meta?.files?.length) return "";

  const lines = [];
  // Each file in meta.files is a public URL like /uploads/fonts/...
  // We generate one @font-face per file. For proper weight mapping
  // we'd need per-file metadata, but since Google Fonts download gives
  // a single file for the default weight, we default to 400.
  meta.files.forEach((filePath, i) => {
    const fmt  = filePath.endsWith(".woff2") ? "woff2"
               : filePath.endsWith(".woff")  ? "woff"
               : filePath.endsWith(".ttf")   ? "truetype"
               : "opentype";
    lines.push(`/* ${role}: ${meta.family} */`);
    lines.push(`@font-face {`);
    lines.push(`  font-family: '${meta.family}';`);
    lines.push(`  src: url('${filePath}') format('${fmt}');`);
    lines.push(`  font-weight: ${i === 0 ? "400" : "700"};`);
    lines.push(`  font-style: normal;`);
    lines.push(`  font-display: swap;`);
    lines.push(`}`);
  });
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate variables.css from layout config.
 *
 * @param {object} config  - The full merged layout config from DB
 * Expected shape:
 * {
 *   colors: {
 *     primary:   "#hex",   // base color → generates 50-950
 *     secondary: "#hex",   // base color → generates 50-950
 *     // Light theme
 *     bgLight:   "#hex",   // --color-bg (light)
 *     textLight: "#hex",   // --color-text (light)
 *     // Dark theme
 *     bgDark:    "#hex",   // --color-bg (dark)
 *     textDark:  "#hex",   // --color-text (dark)
 *   },
 *   typography: {
 *     headingFont:  "Poller One",
 *     bodyFont:     "Inter",
 *     baseFontSize: 16,
 *   }
 * }
 */
async function generateVariablesCSS(config = {}) {
  // Config shape supports both:
  // - legacy: { colors, typography, ... }
  // - current DB shape: { layout: { colors, typography, ... } }
  const root   = config.layout && typeof config.layout === "object" ? config.layout : config;
  const colors = root.colors || config.colors || {};
  const typo   = root.typography || config.typography || {};
  console.log(`[CSSGenerator] Generating variables.css with config:`, { colors, typography: typo });
  // ── Color scales ────────────────────────────────────────────────────────
  const primaryHex   = colors.primary   || "#0ea5e9";
  const secondaryHex = colors.secondary || "#8b5cf6";

  const primaryShades   = generateShadeScale(primaryHex);
  const secondaryShades = generateShadeScale(secondaryHex);

  // Light theme base colors
  const bgLight   = colors.bgLight   || "#ffffff";
  const textLight = colors.textLight || "#0f172a";

  // Dark theme base colors
  const bgDark    = colors.bgDark    || "#0f172a";
  const textDark  = colors.textDark  || "#f1f5f9";

  // ── Typography ──────────────────────────────────────────────────────────
  const headingFamily  = typo.headingFont  || null;
  const bodyFamily     = typo.bodyFont     || null;
  const baseFontSize   = typo.baseFontSize || 16;

  const headingStack = headingFamily
    ? `'${headingFamily}', -apple-system, BlinkMacSystemFont, sans-serif`
    : `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

  const bodyStack = bodyFamily
    ? `'${bodyFamily}', -apple-system, BlinkMacSystemFont, sans-serif`
    : `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

  // ── @font-face blocks ───────────────────────────────────────────────────
  const headingFontFace = headingFamily ? buildFontFace(headingFamily, "heading") : "";
  const bodyFontFace    = (bodyFamily && bodyFamily !== headingFamily)
    ? buildFontFace(bodyFamily, "body")
    : "";

  // ── Build CSS ────────────────────────────────────────────────────────────
  const lines = [];

  lines.push(`/* ==============================================`);
  lines.push(`   VARIABLES.CSS - Design Tokens & Variables`);
  lines.push(`   AUTO-GENERATED by cssGenerator.js`);
  lines.push(`   Generated: ${new Date().toISOString()}`);
  lines.push(`   DO NOT EDIT MANUALLY — edit layout config instead`);
  lines.push(`   ============================================== */`);
  lines.push(``);

  // @font-face blocks at the top
  if (headingFontFace) {
    lines.push(headingFontFace);
    lines.push(``);
  }
  if (bodyFontFace) {
    lines.push(bodyFontFace);
    lines.push(``);
  }

  lines.push(`:root {`);
  lines.push(`  /* ============= PRIMARY COLOR SCALE ============= */`);
  lines.push(`  /* Base: ${primaryHex} */`);
  for (const [shade, hex] of Object.entries(primaryShades)) {
    lines.push(`  --color-primary-${shade}: ${hex};`);
  }
  lines.push(``);

  lines.push(`  /* ============= SECONDARY COLOR SCALE ============= */`);
  lines.push(`  /* Base: ${secondaryHex} */`);
  for (const [shade, hex] of Object.entries(secondaryShades)) {
    lines.push(`  --color-secondary-${shade}: ${hex};`);
  }
  lines.push(``);

  lines.push(`  /* ============= SEMANTIC COLORS ============= */`);
  lines.push(`  --color-success: #10b981;`);
  lines.push(`  --color-warning: #f59e0b;`);
  lines.push(`  --color-error:   #ef4444;`);
  lines.push(`  --color-info:    #3b82f6;`);
  lines.push(``);

  lines.push(`  /* ============= NEUTRAL SCALE ============= */`);
  const neutralShades = generateShadeScale("#6b7280");
  for (const [shade, hex] of Object.entries(neutralShades)) {
    lines.push(`  --color-neutral-${shade}: ${hex};`);
  }
  lines.push(`  --color-white: #ffffff;`);
  lines.push(`  --color-black: #000000;`);
  lines.push(``);

  lines.push(`  /* ============= LIGHT THEME (DEFAULT) ============= */`);
  lines.push(`  --color-bg:            ${bgLight};`);
  lines.push(`  --color-bg-secondary:  ${_lightenHex(bgLight, 4)};`);
  lines.push(`  --color-text:          ${textLight};`);
  lines.push(`  --color-text-muted:    var(--color-primary-700);`);
  lines.push(`  --color-border:        ${_lightenHex(textLight, 75)};`);
  lines.push(``);

  lines.push(`  /* ============= TYPOGRAPHY ============= */`);
  lines.push(`  --font-heading: ${headingStack};`);
  lines.push(`  --font-primary: ${bodyStack};`);
  lines.push(`  --font-mono:    'SF Mono', Monaco, 'Cascadia Code', Consolas, 'Courier New', monospace;`);
  lines.push(``);
  lines.push(`  /* Font Sizes — base: ${baseFontSize}px */`);
  const base = baseFontSize;
  lines.push(`  --font-xs:   ${_rem(base * 0.75)};`);
  lines.push(`  --font-sm:   ${_rem(base * 0.875)};`);
  lines.push(`  --font-base: ${_rem(base)};`);
  lines.push(`  --font-lg:   ${_rem(base * 1.125)};`);
  lines.push(`  --font-xl:   ${_rem(base * 1.25)};`);
  lines.push(`  --font-2xl:  ${_rem(base * 1.5)};`);
  lines.push(`  --font-3xl:  ${_rem(base * 1.875)};`);
  lines.push(`  --font-4xl:  ${_rem(base * 2.25)};`);
  lines.push(`  --font-5xl:  ${_rem(base * 3)};`);
  lines.push(`  --font-6xl:  ${_rem(base * 3.75)};`);
  lines.push(`  --font-7xl:  ${_rem(base * 4.5)};`);
  lines.push(``);
  lines.push(`  /* Font Weights */`);
  lines.push(`  --font-light:     300;`);
  lines.push(`  --font-normal:    400;`);
  lines.push(`  --font-medium:    500;`);
  lines.push(`  --font-semibold:  600;`);
  lines.push(`  --font-bold:      700;`);
  lines.push(`  --font-extrabold: 800;`);
  lines.push(``);
  lines.push(`  /* Line Heights */`);
  lines.push(`  --line-tight:   1.25;`);
  lines.push(`  --line-normal:  1.5;`);
  lines.push(`  --line-relaxed: 1.75;`);
  lines.push(`  --line-loose:   2;`);
  lines.push(``);
  lines.push(`  /* Letter Spacing */`);
  lines.push(`  --tracking-tight:  -0.05em;`);
  lines.push(`  --tracking-normal:  0;`);
  lines.push(`  --tracking-wide:    0.05em;`);
  lines.push(``);

  lines.push(`  /* ============= SPACING SCALE ============= */`);
  lines.push(`  --space-0:  0;`);
  lines.push(`  --space-1:  0.25rem;`);
  lines.push(`  --space-2:  0.5rem;`);
  lines.push(`  --space-3:  0.75rem;`);
  lines.push(`  --space-4:  1rem;`);
  lines.push(`  --space-5:  1.25rem;`);
  lines.push(`  --space-6:  1.5rem;`);
  lines.push(`  --space-8:  2rem;`);
  lines.push(`  --space-10: 2.5rem;`);
  lines.push(`  --space-12: 3rem;`);
  lines.push(`  --space-16: 4rem;`);
  lines.push(`  --space-20: 5rem;`);
  lines.push(`  --space-24: 6rem;`);
  lines.push(`  --space-32: 8rem;`);
  lines.push(``);

  lines.push(`  /* ============= BORDER RADIUS ============= */`);
  lines.push(`  --radius-none: 0;`);
  lines.push(`  --radius-sm:   0.25rem;`);
  lines.push(`  --radius-base: 0.375rem;`);
  lines.push(`  --radius-md:   0.5rem;`);
  lines.push(`  --radius-lg:   0.75rem;`);
  lines.push(`  --radius-xl:   1rem;`);
  lines.push(`  --radius-2xl:  1.5rem;`);
  lines.push(`  --radius-full: 9999px;`);
  lines.push(``);

  lines.push(`  /* ============= SHADOWS ============= */`);
  lines.push(`  --shadow-none:  none;`);
  lines.push(`  --shadow-xs:    0 1px 2px 0 rgba(0,0,0,0.05);`);
  lines.push(`  --shadow-sm:    0 1px 3px 0 rgba(0,0,0,0.10), 0 1px 2px -1px rgba(0,0,0,0.10);`);
  lines.push(`  --shadow-base:  0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10);`);
  lines.push(`  --shadow-md:    0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10);`);
  lines.push(`  --shadow-lg:    0 20px 25px -5px rgba(0,0,0,0.10), 0 8px 10px -6px rgba(0,0,0,0.10);`);
  lines.push(`  --shadow-xl:    0 25px 50px -12px rgba(0,0,0,0.25);`);
  lines.push(`  --shadow-inner: inset 0 2px 4px 0 rgba(0,0,0,0.05);`);
  lines.push(``);

  lines.push(`  /* ============= Z-INDEX ============= */`);
  lines.push(`  --z-base:     0;`);
  lines.push(`  --z-dropdown: 100;`);
  lines.push(`  --z-sticky:   200;`);
  lines.push(`  --z-fixed:    300;`);
  lines.push(`  --z-overlay:  400;`);
  lines.push(`  --z-modal:    500;`);
  lines.push(`  --z-popover:  600;`);
  lines.push(`  --z-tooltip:  700;`);
  lines.push(``);

  lines.push(`  /* ============= TRANSITIONS ============= */`);
  lines.push(`  --duration-instant: 75ms;`);
  lines.push(`  --duration-fast:    150ms;`);
  lines.push(`  --duration-base:    250ms;`);
  lines.push(`  --duration-slow:    350ms;`);
  lines.push(`  --duration-slower:  500ms;`);
  lines.push(`  --ease-linear:  linear;`);
  lines.push(`  --ease-in:      cubic-bezier(0.4, 0, 1, 1);`);
  lines.push(`  --ease-out:     cubic-bezier(0, 0, 0.2, 1);`);
  lines.push(`  --ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1);`);
  lines.push(``);

  lines.push(`  /* ============= CONTAINERS ============= */`);
  lines.push(`  --container-xs:   20rem;`);
  lines.push(`  --container-sm:   24rem;`);
  lines.push(`  --container-md:   28rem;`);
  lines.push(`  --container-lg:   32rem;`);
  lines.push(`  --container-xl:   36rem;`);
  lines.push(`  --container-2xl:  42rem;`);
  lines.push(`  --container-3xl:  48rem;`);
  lines.push(`  --container-4xl:  56rem;`);
  lines.push(`  --container-5xl:  64rem;`);
  lines.push(`  --container-6xl:  72rem;`);
  lines.push(`  --container-7xl:  80rem;`);
  lines.push(`  --container-full: 100%;`);
  lines.push(`}`);
  lines.push(``);

  // ── DARK THEME ─────────────────────────────────────────────────────────
  lines.push(`/* ============= DARK THEME ============= */`);
  lines.push(`/* Activated by: <html class="dark"> or @media (prefers-color-scheme: dark) */`);
  lines.push(``);
  lines.push(`@media (prefers-color-scheme: dark) {`);
  lines.push(`  :root:not([data-theme="light"]) {`);
  _appendDarkVars(lines, primaryShades, secondaryShades, bgDark, textDark);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`[data-theme="dark"] {`);
  _appendDarkVars(lines, primaryShades, secondaryShades, bgDark, textDark);
  lines.push(`}`);
  lines.push(``);

  const css = lines.join("\n");

  // Write to framework directory
  fs.writeFileSync(VARIABLES_FILE, css, "utf-8");
  console.log(`[CSSGenerator] ✅ variables.css written (${css.length} bytes)`);
  return css;
}

function _appendDarkVars(lines, primaryShades, secondaryShades, bgDark, textDark) {
  lines.push(`    /* Primary — shuffled shades */`);
  for (const [shade, _] of Object.entries(primaryShades)) {
    const mappedShade = DARK_SHUFFLE[shade] || shade;
    lines.push(`    --color-primary-${shade}: ${primaryShades[mappedShade]};`);
  }
  lines.push(`    /* Secondary — shuffled shades */`);
  for (const [shade, _] of Object.entries(secondaryShades)) {
    const mappedShade = DARK_SHUFFLE[shade] || shade;
    lines.push(`    --color-secondary-${shade}: ${secondaryShades[mappedShade]};`);
  }
  lines.push(`    /* Dark theme base */`);
  lines.push(`    --color-bg:           ${bgDark};`);
  lines.push(`    --color-bg-secondary: ${_darkenHex(bgDark, 4)};`);
  lines.push(`    --color-text:         ${textDark};`);
  lines.push(`    --color-text-muted:   ${_darkenHex(textDark, 35)};`);
  lines.push(`    --color-border:       ${_darkenHex(textDark, 70)};`);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────

function _rem(px) {
  return `${(px / 16).toFixed(4).replace(/\.?0+$/, "")}rem`;
}

function _lightenHex(hex, amount) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, l + amount));
}

function _darkenHex(hex, amount) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amount));
}

// Expose shade generator for use in customizer color panel
function getShadeScale(hex) {
  return generateShadeScale(hex);
}

module.exports = {
  generateVariablesCSS,
  generateShadeScale,
  getShadeScale,
};