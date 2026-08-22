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
  return String(str).replace(/"/g, "&quot;");
}

function buildStyleString(style = {}) {
  if (!style || typeof style !== "object") return "";
  return Object.entries(style)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => {
      const prop = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${prop}: ${v}`;
    })
    .join("; ");
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
  const content = escapeHTML(attrs.content || "");
  const style = buildStyleString(node.style || {});
  const className = `wdg-heading wdg-${node.id || ""}`;
  return `<h${level} class="${className}" style="${style}" data-block-id="${node.id || ""}" data-block-type="heading">${content}</h${level}>`;
}

function renderParagraph(node, ctx) {
  const attrs = node.attributes || {};
  const content = attrs.content || "";
  const style = buildStyleString(node.style || {});
  const className = `wdg-paragraph wdg-${node.id || ""}`;
  // Content may contain inline HTML (bold, italic, links, etc.)
  return `<p class="${className}" style="${style}" data-block-id="${node.id || ""}" data-block-type="paragraph">${content}</p>`;
}

function renderBlockquote(node, ctx) {
  const attrs = node.attributes || {};
  const content = attrs.content || "";
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
// sublists. Inline HTML is trusted the same way paragraph content is.
function renderListItem(item, ctx) {
  if (typeof item !== "object" || item === null) {
    return `<li>${escapeHTML(String(item ?? ""))}</li>`;
  }
  const text = item.content || "";
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
      const text = typeof item === "string" ? escapeHTML(item) : (obj.content || "");
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
  return `<video class="${className}" src="${src}" ${poster} ${autoplay} ${controls} style="${style}" data-block-id="${node.id || ""}" data-block-type="video"></video>`;
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
  return `<div class="wdg-container wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="container">${childrenHTML}</div>`;
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
  const description = attrs.description || "";
  const image = attrs.image ? `<img src="${escapeAttr(attrs.image)}" alt="${escapeAttr(attrs.title || "")}" />` : "";
  const link = attrs.link ? `onclick="window.location.href='${escapeAttr(attrs.link)}'"` : "";
  const style = buildStyleString(node.style || {});
  return `<div class="wdg-card wdg-${node.id || ""}" ${link} style="${style}" data-block-id="${node.id || ""}" data-block-type="card">${image}<h3>${title}</h3><div class="wdg-card-body">${description}</div></div>`;
}

function renderHero(node, ctx) {
  const attrs = node.attributes || {};
  const title = escapeHTML(attrs.title || "");
  const subtitle = escapeHTML(attrs.subtitle || "");
  const buttonText = escapeHTML(attrs.buttonText || "");
  const buttonUrl = escapeAttr(attrs.buttonUrl || "#");
  const background = attrs.background ? `background-image: url(${escapeAttr(attrs.background)});` : "";
  const style = buildStyleString({ ...node.style, background });
  const button = buttonText ? `<a href="${buttonUrl}" class="wdg-hero-btn">${buttonText}</a>` : "";
  return `<section class="wdg-hero wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="hero"><div class="wdg-hero-content"><h1>${title}</h1><p>${subtitle}</p>${button}</div></section>`;
}

function renderCTA(node, ctx) {
  const attrs = node.attributes || {};
  const title = escapeHTML(attrs.title || "");
  const description = escapeHTML(attrs.description || "");
  const buttonText = escapeHTML(attrs.buttonText || "");
  const buttonUrl = escapeAttr(attrs.buttonUrl || "#");
  const style = buildStyleString(node.style || {});
  return `<section class="wdg-cta wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="cta"><h2>${title}</h2><p>${description}</p>${buttonText ? `<a href="${buttonUrl}" class="wdg-cta-btn">${buttonText}</a>` : ""}</section>`;
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
  return `<div class="wdg-faq wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="faq">${itemsHTML}</div>`;
}

function renderPricing(node, ctx) {
  const attrs = node.attributes || {};
  const plans = Array.isArray(attrs.plans) ? attrs.plans : [];
  const plansHTML = plans
    .map((plan) => {
      const name = escapeHTML(plan.name || "");
      const price = escapeHTML(plan.price || "");
      const features = Array.isArray(plan.features)
        ? plan.features.map((f) => `<li>${escapeHTML(f)}</li>`).join("")
        : "";
      return `<div class="wdg-pricing-plan"><h3>${name}</h3><div class="wdg-pricing-price">${price}</div><ul>${features}</ul></div>`;
    })
    .join("");
  const style = buildStyleString(node.style || {});
  return `<div class="wdg-pricing wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="pricing">${plansHTML}</div>`;
}

function renderAlert(node, ctx) {
  const attrs = node.attributes || {};
  const content = attrs.content || "";
  const style = buildStyleString(node.style || {});
  const variant = attrs.style || "info";
  return `<div class="wdg-alert wdg-alert-${variant} wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="alert">${content}</div>`;
}

function renderTable(node, ctx) {
  const attrs = node.attributes || {};
  const rows = Array.isArray(attrs.rows) ? attrs.rows : [];
  const columns = Array.isArray(attrs.columns) ? attrs.columns : [];
  const style = buildStyleString(node.style || {});
  const renderCell = (cell) =>
    (cell && typeof cell === "object") ? (cell.content || "") : escapeHTML(String(cell ?? ""));
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
  return `<div class="wdg-accordion wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="accordion">${itemsHTML}</div>`;
}

function renderTabs(node, ctx) {
  const attrs = node.attributes || {};
  const tabs = Array.isArray(attrs.tabs) ? attrs.tabs : [];
  const tabsId = `tabs-${node.id || Math.random().toString(36).slice(2, 8)}`;
  const tabButtons = tabs.map((tab, i) => `<button class="wdg-tab-btn" data-tab="${tabsId}-${i}">${escapeHTML(tab.title || "")}</button>`).join("");
  const tabPanels = tabs.map((tab, i) => `<div class="wdg-tab-panel" data-panel="${tabsId}-${i}">${escapeHTML(tab.content || "")}</div>`).join("");
  const style = buildStyleString(node.style || {});
  return `<div class="wdg-tabs wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="tabs"><div class="wdg-tab-buttons">${tabButtons}</div><div class="wdg-tab-panels">${tabPanels}</div></div>`;
}

function renderSearchForm(node, ctx) {
  const attrs = node.attributes || {};
  const placeholder = escapeAttr(attrs.placeholder || "Search...");
  const buttonText = escapeHTML(attrs.buttonText || "Search");
  const style = buildStyleString(node.style || {});
  return `<form class="wdg-search-form wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="search-form" action="/search" method="get"><input type="search" name="q" placeholder="${placeholder}" /><button type="submit">${buttonText}</button></form>`;
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
  return `<div class="wdg-group wdg-${node.id || ""}" style="${style}" data-block-id="${node.id || ""}" data-block-type="group">${childrenHTML}</div>`;
}

function renderCustomHTML(node, ctx) {
  const attrs = node.attributes || {};
  return `<div class="wdg-custom-html wdg-${node.id || ""}" data-block-id="${node.id || ""}" data-block-type="custom-html">${attrs.html || ""}</div>`;
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
      return `<div class="wdg-error" data-error="${escapeAttr(type)}">Error rendering widget</div>`;
    }
  }

  // Unknown widget type: render content as plain if available
  const attrs = node.attributes || {};
  if (attrs.html) return attrs.html;
  if (attrs.content) return `<div class="wdg-unknown" data-type="${escapeAttr(type)}">${escapeHTML(attrs.content)}</div>`;
  if (node.children) return renderChildren(node.children, ctx);
  return "";
}

function renderChildren(children, ctx) {
  if (!Array.isArray(children)) return "";
  return children.map((child) => renderNode(child, ctx)).join("");
}

function renderDocument(doc, ctx = {}) {
  if (!doc || typeof doc !== "object") return "";
  const rules = [];
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
  if (doc.type === "doc" && Array.isArray(doc.content)) {
    return doc.content.map(extractTextFromNode).join(" ").trim();
  }
  return "";
}

module.exports = {
  renderNode,
  renderChildren,
  renderDocument,
  extractTextFromDocument,
  extractTextFromNode,
  RENDERERS,
};