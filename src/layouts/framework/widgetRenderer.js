// src/layouts/framework/widgetRenderer.js
// Converts Acroxa widget JSON tree to HTML for public frontend rendering
// Used by LayoutEngine and layout templates

function escapeHTML(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Minimal inline-HTML sanitizer for widget rich-text (no new deps).
// Preserves formatting tags produced by the editor (b/i/strong/em/a/span/br/u/s/code)
// while stripping executable vectors: script/style/iframe/object/embed/form,
// event-handler attributes (on*), and javascript:/data:text/html URLs.
function sanitizeInlineHTML(html = "") {
  let out = String(html || "");
  // Strip dangerous elements with their content.
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|base|form)[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|base)[^>]*\/?>/gi, "");
  // Strip event-handler attributes (onload=, onclick=, ...), quoted or not.
  out = out.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Neutralize javascript:/data:text/html:/vbscript: URLs in href/src/xlink:href.
  out = out.replace(/\s(href|src|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi, (m, attr, _v, d, s) => {
    const raw = (d !== undefined ? d : (s !== undefined ? s : _v)).trim();
    if (/^\s*(javascript|data\s*:\s*text\/html|vbscript)\s*:/i.test(raw)) return ` ${attr}="#"`;
    return m;
  });
  // Keep only an allowlist of inline tags; escape everything else.
  const allowed = new Set(["b", "i", "strong", "em", "a", "span", "br", "u", "s", "code"]);
  out = out.replace(/<\/?([a-zA-Z0-9]+)(\s[^<>]*)?\/?>/g, (m, tag, attrs) => {
    const t = String(tag).toLowerCase();
    if (allowed.has(t)) {
      if (t === "a") {
        // Only safe hrefs survive on links.
        const href = /href\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/i.exec(attrs || "");
        const raw = href ? (href[2] !== undefined ? href[2] : (href[3] !== undefined ? href[3] : href[1])) : "#";
        if (/^\s*(javascript|data\s*:\s*text\/html|vbscript)\s*:/i.test(String(raw))) return t === "a" && m.startsWith("</") ? "</a>" : '<a href="#">';
        return m.startsWith("</") ? "</a>" : `<a href="${escapeAttr(raw).slice(0, 500)}">`;
      }
      return m.startsWith("</") ? `</${t}>` : (t === "br" ? "<br>" : `<${t}>`);
    }
    return escapeHTML(m).slice(0, 200);
  });
  return out.slice(0, 50000);
}

function buildStyleString(style = {}) {
  if (!style || typeof style !== "object") return "";
  return Object.entries(style)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => {
      const prop = String(k).replace(/([A-Z])/g, "-$1").toLowerCase();
      if (!/^[a-z-]+$/.test(prop) || prop.length > 40) return "";
      const val = String(v);
      if (val.length > 300) return "";
      if (/[<>"]/.test(val)) return "";
      if (/url\s*\(\s*(javascript|data\s*:\s*text\/html|vbscript)\s*:/i.test(val)) return "";
      if (/expression\s*\(/i.test(val)) return "";
      return `${prop}: ${escapeAttr(val)}`;
    })
    .filter(Boolean)
    .join("; ");
}

// AcroxaJS render boundary for section-level containers.
// Stable id `boundary:core:<name>.<nodeId>` survives rerenders; positional
// indexes are never used. Registers the boundary target + graph edges so
// RC can map source changes to affected boundaries. Additive attributes
// only — no wrapper divs, no layout change.
function boundaryAttrs(node, name) {
  const nodeId = (node && node.id) || "anon";
  const id = `boundary:core:${name}.${nodeId}`;
  let rev = 0;
  try { rev = require("../../core/runtime/revision").get(); } catch (_) {}
  try {
    require("../../core/runtime/targets").register({
      id, type: "boundary", owner: "core", node, component: name,
      hydrate: "immediate", rev, generation: rev, boundary: id,
    });
  } catch (_) {}
  try {
    const graph = require("../../core/runtime/graph");
    graph.depend(id, [`widget:core:${name}`, `node:${nodeId}`]);
  } catch (_) {}
  return `data-acrx-id="${id}" data-acrx-hydrate="immediate" data-acrx-component="${name}" data-acrx-owner="core" data-acrx-rev="${rev}" data-acrx-generation="${rev}"`;
}

// AcroxaJS identity for patchable widgets (generalized tabs pattern).
// Emits compact data-acrx-* metadata + registers the render target so the
// fragment endpoint can re-render it by id. hydrate="none" means the widget
// needs no JS behavior (native <details>/<video>/<form>) but stays a valid
// patch target. Static text/image widgets stay untouched (lean visitor HTML).
function acrxTarget(node, component, hydrate = "none") {
  const key = `${component}-${(node && node.id) || "anon"}`;
  const id = `widget:core:${key}`;
  let rev = 0;
  try { rev = require("../../core/runtime/revision").get(); } catch (_) {}
  try {
    require("../../core/runtime/targets").register({ id, type: "widget", owner: "core", node, component, hydrate, rev, generation: rev });
  } catch (_) {}
  // Dependency edges so the graph knows widget→node-type and target→source.
  try {
    const graph = require("../../core/runtime/graph");
    graph.depend(id, [`widget:core:${component}`, `node:${(node && node.id) || "anon"}`]);
  } catch (_) {}
  return `data-acrx-id="${id}" data-acrx-hydrate="${hydrate}" data-acrx-component="${component}" data-acrx-owner="core" data-acrx-rev="${rev}" data-acrx-generation="${rev}"`;
}

function buildResponsiveStyles(responsive = {}) {
  if (!responsive || typeof responsive !== "object") return { base: "", mobile: "", tablet: "" };
  const cssVars = [];
  if (responsive.mobile && Object.keys(responsive.mobile).length > 0) {
    cssVars.push(`@media (max-width: 767px) { .wdg-${responsive.id || "x"} { ${buildStyleString(responsive.mobile)} } }`);
  }
  if (responsive.tablet && Object.keys(responsive.tablet).length > 0) {
    cssVars.push(`@media (min-width: 768px) and (max-width: 1023px) { .wdg-${responsive.id || "x"} { ${buildStyleString(responsive.tablet)} } }`);
  }
  return { base: buildStyleString(responsive.desktop || {}), mobile: "", tablet: "" };
}

function checkVisibility(visibility = {}, context = {}) {
  if (!visibility) return true;
  if (context.device === "mobile" && visibility.mobile === false) return false;
  if (context.device === "tablet" && visibility.tablet === false) return false;
  if (context.device === "desktop" && visibility.desktop === false) return false;
  return true;
}

function renderHeading(node, ctx) {
  const attrs = node.attributes || {};
  const level = Math.min(Math.max(attrs.level || 2, 1), 6);
  // Sanitized inline HTML: editor bold/links render, scripts/handlers do not.
  const content = sanitizeInlineHTML(attrs.content || "");
  const style = buildStyleString(node.style || {});
  const className = `wdg-heading wdg-${node.id || ""}`;
  return `<h${level} class="${className}" style="${style}" data-block-id="${node.id || ""}" data-block-type="heading">${content}</h${level}>`;
}

function renderParagraph(node, ctx) {
  const attrs = node.attributes || {};
  const content = sanitizeInlineHTML(attrs.content || "");
  const style = buildStyleString(node.style || {});
  const className = `wdg-paragraph wdg-${node.id || ""}`;
  // Content may contain inline HTML (bold, italic, links, etc.)
  return `<p class="${className}" style="${style}" data-block-id="${node.id || ""}" data-block-type="paragraph">${content}</p>`;
}

function renderBlockquote(node, ctx) {
  const attrs = node.attributes || {};
  // Sanitized inline HTML, same trust as paragraphs (see renderHeading).
  const content = sanitizeInlineHTML(attrs.content || "");
  const style = buildStyleString(node.style || {});
  const className = `wdg-blockquote wdg-${node.id || ""}`;
  return `<blockquote class="${className}" style="${style}" data-block-id="${node.id || ""}" data-block-type="blockquote">${content}</blockquote>`;
}

function renderCodeBlock(node, ctx) {
  const attrs = node.attributes || {};
  const content = escapeHTML(attrs.content || "");
  const language = escapeAttr(attrs.language || "");
  const style = buildStyleString(node.style || {});
  const className = `wdg-code-block wdg-${node.id || ""}`;
  return `<pre class="${className}${language ? ` language-${language}` : ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="code-block"><code>${content}</code></pre>`;
}

function renderOrderedList(node, ctx) {
  const attrs = node.attributes || {};
  const items = Array.isArray(attrs.items) ? attrs.items : [];
  const style = buildStyleString(node.style || {});
  const itemsHTML = items.map((item) => renderListItem(item, ctx)).join("");
  return `<ol class="wdg-ordered-list wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="ordered-list">${itemsHTML}</ol>`;
}

function renderUnorderedList(node, ctx) {
  const attrs = node.attributes || {};
  const items = Array.isArray(attrs.items) ? attrs.items : [];
  const style = buildStyleString(node.style || {});
  const itemsHTML = items.map((item) => renderListItem(item, ctx)).join("");
  return `<ul class="wdg-unordered-list wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="unordered-list">${itemsHTML}</ul>`;
}

// A list item may be a plain string (legacy, still escaped) or an object
// carrying rich inline HTML authored in the editor plus optional nested
// sublists. Inline HTML is sanitized the same way paragraph content is.
function renderListItem(item, ctx) {
  if (typeof item !== "object" || item === null) {
    return `<li>${escapeHTML(String(item ?? ""))}</li>`;
  }
  const text = sanitizeInlineHTML(item.content || "");
  const kids = Array.isArray(item.children)
    ? renderChildren(item.children, ctx)
    : "";
  return `<li>${text}${kids}</li>`;
}

function renderTaskList(node, ctx) {
  const attrs = node.attributes || {};
  const items = Array.isArray(attrs.items) ? attrs.items : [];
  const style = buildStyleString(node.style || {});
  const itemsHTML = items
    .map((item) => {
      const obj = typeof item === "object" && item !== null ? item : {};
      const checked = !!obj.checked;
      const text = typeof item === "string" ? escapeHTML(item) : sanitizeInlineHTML(obj.content || "");
      return `<li class="wdg-task-item${checked ? " is-checked" : ""}" data-checked="${checked}">` +
        `<input type="checkbox" disabled${checked ? " checked" : ""} />` +
        `<span>${text}</span></li>`;
    })
    .join("");
  return `<ul class="wdg-task-list wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="task-list">${itemsHTML}</ul>`;
}

function renderImage(node, ctx) {
  const attrs = node.attributes || {};
  const src = escapeAttr(attrs.src || "");
  const alt = escapeAttr(attrs.alt || "");
  const caption = attrs.caption ? `<figcaption>${escapeHTML(attrs.caption)}</figcaption>` : "";
  const style = buildStyleString(node.style || {});
  const className = `wdg-image wdg-${node.id || ""}`;
  return `<figure class="${className}" style="${style}" data-block-id="${node.id || ""}" data-block-type="image"><img src="${src}" alt="${alt}" loading="lazy" />${caption}</figure>`;
}

function renderVideo(node, ctx) {
  const attrs = node.attributes || {};
  const src = escapeAttr(attrs.src || "");
  const poster = attrs.poster ? `poster="${escapeAttr(attrs.poster)}"` : "";
  const autoplay = attrs.autoplay ? "autoplay" : "";
  const controls = attrs.controls !== false ? "controls" : "";
  const style = buildStyleString(node.style || {});
  const className = `wdg-video wdg-${node.id || ""}`;
  return `<video class="${className}" src="${src}" ${poster} ${autoplay} ${controls} style="${style}" data-block-id="${node.id || ""}" data-block-type="video" ${acrxTarget(node, "video")}></video>`;
}

function renderGallery(node, ctx) {
  const attrs = node.attributes || {};
  const images = Array.isArray(attrs.images) ? attrs.images : [];
  const columns = attrs.columns || 3;
  const style = buildStyleString(node.style || {});
  const items = images
    .map((img) => `<img src="${escapeAttr(img.src || "")}" alt="${escapeAttr(img.alt || "")}" loading="lazy" />`)
    .join("");
  const className = `wdg-gallery wdg-${node.id || ""}`;
  return `<div class="${className}" style="${style}; display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 10px;" data-block-id="${node.id || ""}" data-block-type="gallery">${items}</div>`;
}

function renderAudio(node, ctx) {
  const attrs = node.attributes || {};
  const src = escapeAttr(attrs.src || "");
  const title = escapeAttr(attrs.title || "");
  const style = buildStyleString(node.style || {});
  return `<figure class="wdg-audio wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="audio"><figcaption>${escapeHTML(title)}</figcaption><audio src="${src}" controls></audio></figure>`;
}

function renderEmbed(node, ctx) {
  const attrs = node.attributes || {};
  const url = escapeAttr(attrs.url || "");
  const style = buildStyleString(node.style || {});
  return `<div class="wdg-embed wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="embed"><iframe src="${url}" frameborder="0" allowfullscreen></iframe></div>`;
}

function renderButton(node, ctx) {
  const attrs = node.attributes || {};
  const label = escapeHTML(attrs.label || "");
  const url = escapeAttr(attrs.url || "#");
  const target = attrs.target === "_blank" ? 'target="_blank" rel="noopener noreferrer"' : "";
  const style = buildStyleString(node.style || {});
  return `<a href="${url}" ${target} class="wdg-button wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="button">${label}</a>`;
}

function renderDivider(node, ctx) {
  const attrs = node.attributes || {};
  const style = buildStyleString({ ...node.style, borderTop: `${attrs.thickness || 1}px ${attrs.style || "solid"} ${attrs.color || "currentColor"}`, width: attrs.width || "100%" });
  return `<hr class="wdg-divider wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="divider" />`;
}

function renderSpacer(node, ctx) {
  const attrs = node.attributes || {};
  const height = attrs.height || "40px";
  return `<div class="wdg-spacer wdg-${node.id || ""}" style="height: ${escapeAttr(height)};" data-block-id="${node.id || ""}" data-block-type="spacer"></div>`;
}

function renderContainer(node, ctx) {
  const attrs = node.attributes || {};
  const childrenHTML = renderChildren(node.children || [], ctx);
  const style = buildStyleString({
    ...node.style,
    maxWidth: attrs.maxWidth ? `${attrs.maxWidth}px` : undefined,
    padding: attrs.padding != null ? `${attrs.padding}px` : undefined,
  });
  const boundary = node && node.id ? ` ${boundaryAttrs(node, "section")}` : "";
  return `<div class="wdg-container wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="container"${boundary}>${childrenHTML}</div>`;
}

function renderGrid(node, ctx) {
  const attrs = node.attributes || {};
  const columns = attrs.columns || 3;
  const gap = attrs.gap != null ? `${attrs.gap}px` : "10px";
  const childrenHTML = renderChildren(node.children || [], ctx);
  const style = buildStyleString({ ...node.style, display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap });
  return `<div class="wdg-grid wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="grid">${childrenHTML}</div>`;
}

function renderColumns(node, ctx) {
  const attrs = node.attributes || {};
  const columns = attrs.columns || 2;
  const gap = attrs.gap != null ? `${attrs.gap}px` : "10px";
  const childrenHTML = renderChildren(node.children || [], ctx);
  const style = buildStyleString({ ...node.style, display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap });
  return `<div class="wdg-columns wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="columns">${childrenHTML}</div>`;
}

function renderCard(node, ctx) {
  const attrs = node.attributes || {};
  const title = escapeHTML(attrs.title || "");
  const description = sanitizeInlineHTML(attrs.description || "");
  const badge = attrs.badge ? `<span class="wdg-card-badge">${escapeHTML(attrs.badge)}</span>` : "";
  const button = attrs.buttonText
    ? `<a href="${escapeAttr(attrs.buttonUrl || "#")}" class="wdg-card-btn">${escapeHTML(attrs.buttonText)}</a>`
    : "";
  const image = attrs.image ? `<img src="${escapeAttr(attrs.image)}" alt="${escapeAttr(attrs.title || "")}" />` : "";
  const link = attrs.link ? `onclick="window.location.href='${escapeAttr(attrs.link)}'"` : "";
  const style = buildStyleString(node.style || {});
  return `<div class="wdg-card wdg-${node.id || ""}" ${link} style="${style}" data-block-id="${node.id || ""}" data-block-type="card">${image}${badge}<h3>${title}</h3><div class="wdg-card-body">${description}</div>${button}</div>`;
}

function renderHero(node, ctx) {
  const attrs = node.attributes || {};
  const eyebrow = attrs.eyebrow ? `<div class="wdg-hero-eyebrow">${escapeHTML(attrs.eyebrow)}</div>` : "";
  const title = escapeHTML(attrs.title || "");
  const subtitle = escapeHTML(attrs.subtitle || "");
  const buttonText = escapeHTML(attrs.buttonText || "");
  const buttonUrl = escapeAttr(attrs.buttonUrl || "#");
  const background = attrs.background ? `background-image: url(${escapeAttr(attrs.background)});` : "";
  const style = buildStyleString({ ...node.style, background });
  const button = buttonText ? `<a href="${buttonUrl}" class="wdg-hero-btn">${buttonText}</a>` : "";
  const secondary = attrs.secondaryText
    ? `<a href="${escapeAttr(attrs.secondaryUrl || "#")}" class="wdg-hero-btn wdg-hero-btn-secondary">${escapeHTML(attrs.secondaryText)}</a>`
    : "";
  const boundary = node && node.id ? ` ${boundaryAttrs(node, "hero")}` : "";
  return `<section class="wdg-hero wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="hero"${boundary}><div class="wdg-hero-content">${eyebrow}<h1>${title}</h1><p>${subtitle}</p>${button}${secondary}</div></section>`;
}

function renderCTA(node, ctx) {
  const attrs = node.attributes || {};
  const title = escapeHTML(attrs.title || "");
  const description = escapeHTML(attrs.description || "");
  const buttonText = escapeHTML(attrs.buttonText || "");
  const buttonUrl = escapeAttr(attrs.buttonUrl || "#");
  const button = buttonText ? `<a href="${buttonUrl}" class="wdg-cta-btn">${buttonText}</a>` : "";
  const secondary = attrs.secondaryText
    ? `<a href="${escapeAttr(attrs.secondaryUrl || "#")}" class="wdg-cta-btn wdg-cta-btn-secondary">${escapeHTML(attrs.secondaryText)}</a>`
    : "";
  const style = buildStyleString(node.style || {});
  return `<section class="wdg-cta wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="cta"><h2>${title}</h2><p>${description}</p>${button}${secondary}</section>`;
}

function renderFAQ(node, ctx) {
  const attrs = node.attributes || {};
  const items = Array.isArray(attrs.items) ? attrs.items : [];
  const itemsHTML = items
    .map((item, i) => {
      const q = escapeHTML(item.question || "");
      const a = escapeHTML(item.answer || "");
      return `<details class="wdg-faq-item"><summary>${q}</summary><div>${a}</div></details>`;
    })
    .join("");
  const style = buildStyleString(node.style || {});
  return `<div class="wdg-faq wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="faq" ${acrxTarget(node, "faq")}">${itemsHTML}</div>`;
}

function renderPricing(node, ctx) {
  const attrs = node.attributes || {};
  const plans = Array.isArray(attrs.plans) ? attrs.plans : [];
  const plansHTML = plans
    .map((plan) => {
      const name = escapeHTML(plan.name || "");
      const price = escapeHTML(plan.price || "");
      const period = plan.period ? `<span class="wdg-pricing-period">${escapeHTML(plan.period)}</span>` : "";
      const desc = plan.description ? `<div class="wdg-pricing-desc">${escapeHTML(plan.description)}</div>` : "";
      const cta = plan.ctaText
        ? `<a href="${escapeAttr(plan.ctaUrl || "#")}" class="wdg-pricing-cta">${escapeHTML(plan.ctaText)}</a>`
        : "";
      const features = Array.isArray(plan.features)
        ? plan.features.map((f) => `<li>${escapeHTML(f)}</li>`).join("")
        : "";
      return `<div class="wdg-pricing-plan"><h3>${name}</h3><div class="wdg-pricing-price">${price}${period}</div>${desc}<ul>${features}</ul>${cta}</div>`;
    })
    .join("");
  const style = buildStyleString(node.style || {});
  return `<div class="wdg-pricing wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="pricing">${plansHTML}</div>`;
}

function renderAlert(node, ctx) {
  const attrs = node.attributes || {};
  const content = sanitizeInlineHTML(attrs.content || "");
  const style = buildStyleString(node.style || {});
  const variant = attrs.style || "info";
  return `<div class="wdg-alert wdg-alert-${variant} wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="alert">${content}</div>`;
}

function renderTable(node, ctx) {
  const attrs = node.attributes || {};
  let rows = Array.isArray(attrs.rows) ? attrs.rows : [];
  let columns = Array.isArray(attrs.columns) ? attrs.columns : [];
  // Blueprint tables carry the header as rows[0] + hasHeader (no columns
  // array): promote it so the thead renders instead of vanishing the row.
  // Legacy nodes are untouched (they speak columns/header, not hasHeader).
  if (attrs.hasHeader && attrs.header !== false && columns.length === 0 && rows.length > 0) {
    columns = rows[0];
    rows = rows.slice(1);
  }
  const style = buildStyleString(node.style || {});
  const renderCell = (cell) =>
    (cell && typeof cell === "object") ? sanitizeInlineHTML(cell.content || "") : escapeHTML(String(cell ?? ""));
  const header = attrs.header !== false && columns.length > 0
    ? `<thead><tr>${columns.map((c) => `<th>${renderCell(c)}</th>`).join("")}</tr></thead>`
    : "";
  const body = `<tbody>${rows.map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${renderCell(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table class="wdg-table wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="table">${header}${body}</table>`;
}

function renderIcon(node, ctx) {
  const attrs = node.attributes || {};
  const iconName = escapeHTML(attrs.name || "star");
  const style = buildStyleString(node.style || {});
  return `<i class="fa-solid fa-${iconName} wdg-icon wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="icon"></i>`;
}

function renderAccordion(node, ctx) {
  const attrs = node.attributes || {};
  const items = Array.isArray(attrs.items) ? attrs.items : [];
  const itemsHTML = items
    .map((item) => {
      const t = escapeHTML(item.title || "");
      const c = escapeHTML(item.content || "");
      return `<details class="wdg-accordion-item"><summary>${t}</summary><div>${c}</div></details>`;
    })
    .join("");
  const style = buildStyleString(node.style || {});
  return `<div class="wdg-accordion wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="accordion" ${acrxTarget(node, "accordion")}">${itemsHTML}</div>`;
}

function renderTabs(node, ctx) {
  const attrs = node.attributes || {};
  const tabs = Array.isArray(attrs.tabs) ? attrs.tabs : [];
  // Deterministic identity: stable across renders (no Math.random per render).
  const tabsId = `tabs-${node.id || "anon"}`;
  const tabButtons = tabs.map((tab, i) => `<button class="wdg-tab-btn" data-tab="${tabsId}-${i}">${escapeHTML(tab.title || "")}</button>`).join("");
  const tabPanels = tabs.map((tab, i) => `<div class="wdg-tab-panel" data-panel="${tabsId}-${i}">${escapeHTML(tab.content || "")}</div>`).join("");
  const style = buildStyleString(node.style || {});
  // acrxTarget (not a hand-rolled copy): identical id shape, plus
  // data-acrx-rev/generation + target registration + graph edges — same
  // contract as video/faq/accordion/search-form.
  return `<div class="wdg-tabs wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="tabs" ${acrxTarget(node, "tabs", "interaction")}><div class="wdg-tab-buttons">${tabButtons}</div><div class="wdg-tab-panels">${tabPanels}</div></div>`;
}

function renderTestimonial(node, ctx) {
  const attrs = node.attributes || {};
  const content = sanitizeInlineHTML(attrs.content || "");
  const author = escapeHTML(attrs.author || "");
  const role = attrs.role ? `<span class="wdg-testimonial-role">${escapeHTML(attrs.role)}</span>` : "";
  const style = buildStyleString(node.style || {});
  return `<figure class="wdg-testimonial wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="testimonial"><blockquote>${content}</blockquote><figcaption><span class="wdg-testimonial-author">${author}</span>${role}</figcaption></figure>`;
}

function renderStats(node, ctx) {
  const attrs = node.attributes || {};
  const stats = Array.isArray(attrs.stats) ? attrs.stats : [];
  const style = buildStyleString(node.style || {});
  const items = stats
    .map((s) => `<div class="wdg-stat"><div class="wdg-stat-value">${escapeHTML(s.value || "")}</div><div class="wdg-stat-label">${escapeHTML(s.label || "")}</div></div>`)
    .join("");
  return `<div class="wdg-stats wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="stats">${items}</div>`;
}

function renderTimeline(node, ctx) {
  const attrs = node.attributes || {};
  const events = Array.isArray(attrs.events) ? attrs.events : [];
  const style = buildStyleString(node.style || {});
  const items = events
    .map((e) => `<div class="wdg-timeline-event"><div class="wdg-timeline-date">${escapeHTML(e.date || "")}</div><div class="wdg-timeline-title">${escapeHTML(e.title || "")}</div><div class="wdg-timeline-text">${escapeHTML(e.text || "")}</div></div>`)
    .join("");
  return `<div class="wdg-timeline wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="timeline">${items}</div>`;
}

function renderFeatures(node, ctx) {
  const attrs = node.attributes || {};
  const features = Array.isArray(attrs.features) ? attrs.features : [];
  const style = buildStyleString(node.style || {});
  const items = features
    .map((f) => `<div class="wdg-feature"><div class="wdg-feature-title">${escapeHTML(f.title || "")}</div><div class="wdg-feature-text">${escapeHTML(f.text || "")}</div></div>`)
    .join("");
  return `<div class="wdg-features wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="features">${items}</div>`;
}

function renderSearchForm(node, ctx) {
  const attrs = node.attributes || {};
  const placeholder = escapeAttr(attrs.placeholder || "Search...");
  const buttonText = escapeHTML(attrs.buttonText || "Search");
  const style = buildStyleString(node.style || {});
  return `<form class="wdg-search-form wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="search-form" ${acrxTarget(node, "search-form")} action="/search" method="get"><input type="search" name="q" placeholder="${placeholder}" /><button type="submit">${buttonText}</button></form>`;
}

function renderAuthor(node, ctx) {
  const attrs = node.attributes || {};
  const style = buildStyleString(node.style || {});
  // Author info is resolved at render time from page context (ctx.author)
  const author = ctx.author || { name: "Author", bio: "", avatar: "" };
  const avatar = attrs.showAvatar !== false && author.avatar ? `<img src="${escapeAttr(author.avatar)}" alt="${escapeAttr(author.name)}" />` : "";
  const bio = attrs.showBio !== false && author.bio ? `<p>${escapeHTML(author.bio)}</p>` : "";
  return `<div class="wdg-author wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="author">${avatar}<div><strong>${escapeHTML(author.name)}</strong>${bio}</div></div>`;
}

function renderLatestPosts(node, ctx) {
  const attrs = node.attributes || {};
  const limit = attrs.limit || 6;
  const posts = (ctx.latestPosts || []).slice(0, limit);
  const style = buildStyleString(node.style || {});
  const postsHTML = posts
    .map((post) => `<article class="wdg-latest-post"><h3><a href="${escapeAttr(post.url || "#")}">${escapeHTML(post.title || "")}</a></h3></article>`)
    .join("");
  return `<div class="wdg-latest-posts wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="latest-posts">${postsHTML}</div>`;
}

function renderGroup(node, ctx) {
  const childrenHTML = renderChildren(node.children || [], ctx);
  const style = buildStyleString(node.style || {});
  const boundary = node && node.id ? ` ${boundaryAttrs(node, "group")}` : "";
  return `<div class="wdg-group wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="group"${boundary}>${childrenHTML}</div>`;
}

function renderCustomHTML(node, ctx) {
  const attrs = node.attributes || {};
  // Custom HTML is admin-authored; still sanitize on public runtime renders
  // (fragment endpoint) so a stored payload cannot execute scripts.
  const raw = String(attrs.html || "");
  const html = (ctx && ctx.runtime) ? sanitizeInlineHTML(raw) : raw;
  return `<div class="wdg-custom-html wdg-${node.id || ""}" data-block-id="${node.id || ""}" data-block-type="custom-html">${html}</div>`;
}

const RENDERERS = {
  heading: renderHeading,
  paragraph: renderParagraph,
  blockquote: renderBlockquote,
  "code-block": renderCodeBlock,
  "ordered-list": renderOrderedList,
  "unordered-list": renderUnorderedList,
  image: renderImage,
  video: renderVideo,
  gallery: renderGallery,
  audio: renderAudio,
  embed: renderEmbed,
  button: renderButton,
  divider: renderDivider,
  spacer: renderSpacer,
  container: renderContainer,
  section: renderContainer,
  grid: renderGrid,
  columns: renderColumns,
  card: renderCard,
  hero: renderHero,
  cta: renderCTA,
  faq: renderFAQ,
  pricing: renderPricing,
  alert: renderAlert,
  table: renderTable,
  icon: renderIcon,
  accordion: renderAccordion,
  tabs: renderTabs,
  testimonial: renderTestimonial,
  stats: renderStats,
  timeline: renderTimeline,
  features: renderFeatures,
  "task-list": renderTaskList,
  "search-form": renderSearchForm,
  author: renderAuthor,
  "latest-posts": renderLatestPosts,
  group: renderGroup,
  "custom-html": renderCustomHTML,
};

function renderNode(node, ctx = {}) {
  if (!node || typeof node !== "object") return "";
  if (!checkVisibility(node.visibility || {}, ctx)) return "";

  const type = node.type;
  const renderer = RENDERERS[type];

  if (renderer) {
    try {
      return renderer(node, ctx);
    } catch (err) {
      console.error(`[widgetRenderer] Error rendering ${type}:`, err.message);
      // Error boundary: contain the failure to this widget, keep the page
      // alive, report a structured diagnostic (never a silent empty page).
      try { require("../../core/runtime/events").emit("runtime:error", { type: "RENDER_ERROR", widget: String(type), message: err.message }); } catch (_) {}
      try { require("../../core/runtime/registry").register({ type: "widget", owner: "core", name: `failed:${type}`, meta: { lastError: err.message }, status: "failed" }); } catch (_) {}
      return `<div class="wdg-error" data-error="${escapeAttr(type)}" data-acrx-error="render" data-acrx-owner="core">Error rendering widget</div>`;
    }
  }

  // Unknown widget type: never crash the page and never emit raw stored
  // HTML (which would be an injection sink). Escaped text keeps any words
  // visible; details go to the server log, never to visitors.
  const attrs = node.attributes || {};
  if (attrs.html) {
    console.warn(`[widgetRenderer] unknown block type "${type}" — escaped fallback`);
    return `<div class="wdg-unknown" data-type="${escapeAttr(type)}">${escapeHTML(attrs.html)}</div>`;
  }
  if (attrs.content) return `<div class="wdg-unknown" data-type="${escapeAttr(type)}">${escapeHTML(attrs.content)}</div>`;
  if (node.children) return renderChildren(node.children, ctx);
  return "";
}

function renderChildren(children, ctx) {
  if (!Array.isArray(children)) return "";
  return children.map((child) => renderNode(child, ctx)).join("");
}

// ─── Blueprint adapter (P0-05) ─────────────────────────────────────────
// The editor client persists blueprint shape
// ({ version, blocks: {id: block}, blockOrder, rootId }) with words in
// `content[]` (inline model) and widget settings under `data`. The legacy
// renderers below speak `{ id, type, attributes, style, children[] }`, so
// this adapter translates once, up front: render, preview, derivation and
// every layout template render real content instead of "".
function isBlueprintShape(doc) {
  return !!doc && typeof doc === "object" && !Array.isArray(doc) &&
    !!doc.blocks && typeof doc.blocks === "object" && Array.isArray(doc.blockOrder);
}

// Client canvas parity for URLs: same allowlist the canvas safeUrl uses.
function blueprintSafeUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(value)) return value;
  return "";
}

// Port of the canvas inlineHTML (app/rendering.js): escaped text wrapped in
// mark tags in array order, link outermost-safe via href fallback.
function blueprintInlineHTML(content) {
  if (!Array.isArray(content)) return "";
  return content.map((node) => {
    if (!node || node.type !== "text") return "";
    let html = escapeHTML(node.text || "");
    for (const mark of node.marks || []) {
      if (!mark || typeof mark.type !== "string") continue;
      if (mark.type === "bold") html = `<strong>${html}</strong>`;
      else if (mark.type === "italic") html = `<em>${html}</em>`;
      else if (mark.type === "underline") html = `<u>${html}</u>`;
      else if (mark.type === "strike" || mark.type === "strikethrough") html = `<s>${html}</s>`;
      else if (mark.type === "inlineCode" || mark.type === "code") html = `<code>${html}</code>`;
      else if (mark.type === "link") {
        const href = blueprintSafeUrl(mark.attrs && mark.attrs.href) || "#";
        html = `<a href="${escapeAttr(href)}">${html}</a>`;
      }
    }
    return html;
  }).join("");
}

function blueprintPlainText(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((n) => n && n.type === "text").map((n) => n.text || "").join("");
}

// One list item or table cell to plain text (inline array or legacy string).
function blueprintInlineItemText(item) {
  if (typeof item === "string") return item;
  if (Array.isArray(item)) return blueprintPlainText(item);
  if (item && typeof item === "object") return [item.q, item.a].filter(Boolean).join(" — ");
  return "";
}

const BLUEPRINT_TYPE_MAP = {
  paragraph: "paragraph", heading: "heading", blockquote: "blockquote",
  codeblock: "code-block", bulletList: "unordered-list", orderedList: "ordered-list",
  image: "image", video: "video", gallery: "gallery", audio: "audio", embed: "embed",
  button: "button", divider: "divider", spacer: "spacer",
  container: "container", section: "section", grid: "grid", columns: "columns",
  column: "group", group: "group",
  card: "card", hero: "hero", cta: "cta", faq: "faq", pricing: "pricing",
  alert: "alert", table: "table", icon: "icon", accordion: "accordion", tabs: "tabs",
  link: "paragraph", testimonial: "testimonial", stats: "stats",
  timeline: "timeline", features: "features",
};

const BLUEPRINT_CONTAINER_TYPES = new Set(["container", "section", "grid", "columns", "column", "group"]);

function blueprintToLegacyNode(b, byId, visit) {
  const s = (b && b.data) || {};
  const type = BLUEPRINT_TYPE_MAP[b.type] || "paragraph";
  const node = {
    id: b.id,
    type,
    attributes: {},
    style: { ...(b.styles || {}) },
    responsive: b.responsive,
    children: [],
  };
  if (BLUEPRINT_CONTAINER_TYPES.has(b.type)) {
    node.children = (Array.isArray(b.children) ? b.children : []).map(visit).filter(Boolean);
  }
  const inline = blueprintInlineHTML(b.content);
  const plain = blueprintPlainText(b.content);
  const a = node.attributes;
  switch (type) {
    case "paragraph":
      if (b.type === "link" && s.href) {
        a.content = `<a href="${escapeAttr(blueprintSafeUrl(s.href) || "#")}">${inline || escapeHTML(plain)}</a>`;
      } else {
        a.content = inline;
      }
      break;
    case "heading":
      a.level = s.level || 2;
      a.content = inline;
      break;
    case "blockquote": {
      let cite = "";
      if (s.author || s.cite) cite = `<cite>— ${escapeHTML([s.author, s.cite].filter(Boolean).join(", "))}</cite>`;
      a.content = inline + cite;
      break;
    }
    case "code-block":
      a.content = plain;
      a.language = s.language || "";
      break;
    case "unordered-list":
    case "ordered-list":
      // Items are inline-model arrays (editor P0-02); legacy strings pass
      // through. Objects ({q,a} from FAQ-shaped payloads) flatten to text.
      a.items = Array.isArray(s.items) ? s.items.map(blueprintInlineItemText) : [];
      break;
    case "image":
      a.src = s.src || "";
      a.alt = s.alt || "";
      a.caption = s.caption || "";
      break;
    case "button":
      a.label = s.text || plain;
      a.url = s.href || "#";
      a.target = s.target;
      break;
    case "divider":
      a.style = s.style;
      a.thickness = s.thickness;
      a.width = s.width;
      a.color = s.color;
      break;
    case "spacer":
      a.height = s.height;
      break;
    case "icon":
      a.name = s.icon;
      break;
    case "hero":
      a.eyebrow = s.eyebrow || "";
      a.title = s.title || plain;
      a.subtitle = s.subtitle || "";
      a.buttonText = s.buttonText || "";
      a.buttonUrl = s.buttonUrl || "#";
      a.secondaryText = s.secondaryText || "";
      a.secondaryUrl = s.secondaryUrl || "#";
      a.background = s.backgroundImage || "";
      break;
    case "cta":
      a.title = s.title || plain;
      a.description = s.description || "";
      a.buttonText = s.buttonText || "";
      a.buttonUrl = s.buttonUrl || "#";
      a.secondaryText = s.secondaryText || "";
      a.secondaryUrl = s.secondaryUrl || "#";
      break;
    case "card":
      a.title = s.title || "";
      a.description = s.description || "";
      a.image = s.image || "";
      a.badge = s.badge || "";
      a.buttonText = s.buttonText || "";
      a.buttonUrl = s.buttonUrl || "";
      a.link = s.buttonUrl || "";
      break;
    case "faq":
      a.items = Array.isArray(s.items) ? s.items.map((i) => ({ question: i.q || "", answer: i.a || "" })) : [];
      break;
    case "accordion":
      a.items = Array.isArray(s.items) ? s.items.map((i) => ({ title: i.q || "", content: i.a || "" })) : [];
      break;
    case "tabs":
      a.tabs = Array.isArray(s.tabs) ? s.tabs.map((t) => ({ title: t.label || "", content: t.content || "" })) : [];
      break;
    case "pricing":
      a.plans = Array.isArray(s.plans) ? s.plans.map((p) => ({
        name: p.name || "", price: p.price || "", period: p.period || "",
        description: p.description || "", features: p.features || [],
        ctaText: p.ctaText || "", ctaUrl: p.ctaUrl || "",
      })) : [];
      break;
    case "alert": {
      const title = s.title ? `<strong>${escapeHTML(s.title)}</strong> ` : "";
      a.content = title + inline;
      a.style = s.tone || "info";
      break;
    }
    case "table":
      a.rows = Array.isArray(s.rows)
        ? s.rows.map((row) => (Array.isArray(row) ? row : [row]).map(blueprintInlineItemText))
        : [];
      a.columns = [];
      a.header = s.hasHeader !== false;
      a.hasHeader = !!s.hasHeader;
      break;
    case "embed":
      a.url = s.src || "";
      a.ratio = s.ratio;
      break;
    case "testimonial":
      a.content = inline || escapeHTML(s.text || "");
      a.author = s.author || "";
      a.role = s.role || "";
      a.rating = s.rating;
      break;
    case "stats":
      a.stats = Array.isArray(s.stats) ? s.stats : [];
      a.columns = s.columns;
      break;
    case "timeline":
      a.events = Array.isArray(s.events) ? s.events : [];
      break;
    case "features":
      a.features = Array.isArray(s.features) ? s.features : [];
      break;
    default:
      Object.assign(a, s);
      if (!a.content) a.content = inline;
      break;
  }
  return node;
}

function blueprintTopNodes(doc) {
  const byId = doc.blocks || {};
  const seen = new Set();
  const visit = (id) => {
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const b = byId[id];
    if (!b || typeof b !== "object") return null;
    return blueprintToLegacyNode(b, byId, visit);
  };
  return (doc.blockOrder || []).map(visit).filter(Boolean);
}

// Server mirror of the client's text harvest: every word a blueprint block
// holds, for derivation (raw/reading-time/search) when the client omits it.
function blueprintBlockText(b) {
  const parts = [];
  const grab = (v) => { if (typeof v === "string" && v.trim() !== "") parts.push(v.trim()); };
  grab(blueprintPlainText(b.content));
  const d = (b && b.data) || {};
  if (Array.isArray(d.items)) {
    for (const item of d.items) {
      if (typeof item === "string") grab(item);
      else if (Array.isArray(item)) grab(blueprintPlainText(item));
      else if (item && typeof item === "object") { grab(item.q); grab(item.a); }
    }
  }
  if (Array.isArray(d.rows)) {
    for (const row of d.rows) {
      const cells = (Array.isArray(row) ? row : [row])
        .map((c) => (typeof c === "string" ? c : blueprintPlainText(c)))
        .map((c) => String(c ?? "")).filter((c) => c !== "");
      if (cells.length) parts.push(cells.join(" "));
    }
  }
  for (const key of ["title", "text", "description", "caption", "cite", "author", "role", "badge", "eyebrow", "subtitle", "buttonText", "secondaryText", "alt"]) {
    grab(d[key]);
  }
  if (Array.isArray(d.plans)) {
    for (const p of d.plans) {
      if (!p || typeof p !== "object") continue;
      grab(p.name); grab(p.price); grab(p.period); grab(p.description); grab(p.ctaText);
      if (Array.isArray(p.features)) p.features.forEach(grab);
    }
  }
  if (Array.isArray(d.tabs)) {
    for (const t of d.tabs) { if (t && typeof t === "object") { grab(t.label); grab(t.content); } }
  }
  if (Array.isArray(d.stats)) {
    for (const s of d.stats) { if (s && typeof s === "object") { grab(s.value); grab(s.label); } }
  }
  if (Array.isArray(d.events)) {
    for (const e of d.events) { if (e && typeof e === "object") { grab(e.date); grab(e.title); grab(e.text); } }
  }
  if (Array.isArray(d.features)) {
    for (const f of d.features) { if (f && typeof f === "object") { grab(f.title); grab(f.text); } }
  }
  return parts.join(" ");
}

function renderDocument(doc, ctx = {}) {
  if (!doc || typeof doc !== "object") return "";
  const rules = [];
  // Blueprint shape (what the editor client saves): adapt to legacy nodes
  // first so preview, derivation and templates all render real content.
  if (isBlueprintShape(doc)) {
    const nodes = blueprintTopNodes(doc);
    nodes.forEach((node) => collectResponsiveCSS(node, rules));
    const styleTag = rules.length
      ? `<style data-acroxa-responsive>${rules.join(" ")}</style>`
      : "";
    return styleTag + nodes.map((node) => renderNode(node, ctx)).join("");
  }
  if (doc.type === "doc" && Array.isArray(doc.content)) {
    doc.content.forEach((node) => collectResponsiveCSS(node, rules));
    const styleTag = rules.length
      ? `<style data-acroxa-responsive>${rules.join(" ")}</style>`
      : "";
    return styleTag + renderChildren(doc.content, ctx);
  }
  // Backwards-compat: bare array of nodes
  if (Array.isArray(doc)) {
    doc.forEach((node) => collectResponsiveCSS(node, rules));
    const styleTag = rules.length
      ? `<style data-acroxa-responsive>${rules.join(" ")}</style>`
      : "";
    return styleTag + renderChildren(doc, ctx);
  }
  return renderNode(doc, ctx);
}

// Editor blocks may carry per-breakpoint style overrides (responsive.mobile /
// responsive.tablet). They become scoped @media rules keyed by the block's
// .wdg-<id> class, so device-specific values reach the public site unchanged.
function collectResponsiveCSS(node, out) {
  if (!node || typeof node !== "object") return out;
  const r = node.responsive;
  if (r && typeof r === "object" && node.id) {
    const base = `.wdg-${node.id}`;
    if (r.mobile && Object.keys(r.mobile).length) {
      out.push(`@media (max-width: 767px){ ${base} { ${buildStyleString(r.mobile)} } }`);
    }
    if (r.tablet && Object.keys(r.tablet).length) {
      out.push(`@media (min-width: 768px) and (max-width: 1023px){ ${base} { ${buildStyleString(r.tablet)} } }`);
    }
  }
  if (Array.isArray(node.children)) node.children.forEach((c) => collectResponsiveCSS(c, out));
  return out;
}

function extractTextFromNode(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return node.text || "";
  const attrs = node.attributes || {};
  if (attrs.content && typeof attrs.content === "string") return attrs.content;
  if (attrs.items && Array.isArray(attrs.items)) {
    return attrs.items.map((item) => (typeof item === "string" ? item : item.text || item.content || "")).join(" ");
  }
  if (node.children && Array.isArray(node.children)) {
    return node.children.map(extractTextFromNode).join(" ");
  }
  return "";
}

function extractTextFromDocument(doc) {
  if (!doc) return "";
  if (isBlueprintShape(doc)) {
    const byId = doc.blocks || {};
    const seen = new Set();
    const parts = [];
    const walkId = (id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const b = byId[id];
      if (!b || typeof b !== "object") return;
      const text = blueprintBlockText(b);
      if (text) parts.push(text);
      if (Array.isArray(b.children)) b.children.forEach(walkId);
    };
    (doc.blockOrder || []).forEach(walkId);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  if (doc.type === "doc" && Array.isArray(doc.content)) {
    return doc.content.map(extractTextFromNode).join(" ").trim();
  }
  return "";
}

// Scoped @media rules for a document's responsive overrides, for <head>
// injection when the template renders stored HTML (which carries no style
// tag of its own). Blueprint and legacy shapes both supported.
function responsiveCSSForDocument(doc) {
  if (!doc || typeof doc !== "object") return "";
  const rules = [];
  if (isBlueprintShape(doc)) {
    blueprintTopNodes(doc).forEach((node) => collectResponsiveCSS(node, rules));
  } else if (doc.type === "doc" && Array.isArray(doc.content)) {
    doc.content.forEach((node) => collectResponsiveCSS(node, rules));
  } else if (Array.isArray(doc)) {
    doc.forEach((node) => collectResponsiveCSS(node, rules));
  } else {
    collectResponsiveCSS(doc, rules);
  }
  return rules.join(" ");
}

module.exports = {
  renderNode,
  renderChildren,
  renderDocument,
  extractTextFromDocument,
  extractTextFromNode,
  responsiveCSSForDocument,
  RENDERERS,
};