// acrx/assets/js/editor/app/canvas/rendering.js
//
// Canvas rendering: document model -> shell-contract DOM.
// Every top-level block becomes:
//
//   .block-wrap[data-for-block-id]
//     label.block-handle[data-handle-block-id] (drag span + .block-check)
//     .block[data-block-id, data-index, data-depth, data-type]
//       .block-child[data-child-id, data-parent-id, ...] (editable or widget)
//
// The renderer never owns state: it reads blueprint blocks and patches the
// canvas. Focused editables listed in skipIds keep their live DOM (no caret
// clobbering during typing). Selection visuals are toggled here from the
// passed selectedIds set. renderExportHTML produces clean published output
// (no handles, selection, contentEditable or placeholders) from the same
// views, so editor and published output match by construction.

import {
  CATALOG_BY_TYPE, CONTAINER_TYPES, inlineToText, blockLabel,
  blockCSS, blockCustomCSS, resolveAttr,
} from "../core/model.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return esc(s).replace(/'/g, "&#039;");
}

function cleanIcon(name) {
  return String(name || "").trim().replace(/[^a-z0-9-]/gi, "") || "circle";
}

function safeUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(value)) return value;
  return "";
}

function inlineHTML(content) {
  if (!Array.isArray(content)) return "";
  return content.map((node) => {
    if (!node || node.type !== "text") return "";
    let html = esc(node.text);
    for (const mark of node.marks || []) {
      if (mark.type === "bold") html = `<strong>${html}</strong>`;
      else if (mark.type === "italic") html = `<em>${html}</em>`;
      else if (mark.type === "underline") html = `<u>${html}</u>`;
      else if (mark.type === "strike" || mark.type === "strikethrough") html = `<s>${html}</s>`;
      else if (mark.type === "inlineCode" || mark.type === "code") html = `<code>${html}</code>`;
      else if (mark.type === "link") {
        const href = safeUrl(mark.attrs?.href) || "#";
        html = `<a href="${escAttr(href)}">${html}</a>`;
      }
    }
    return html;
  }).join("");
}

// Block-level identity/attribute helpers shared by every widget root.
// Returns parts (never whole attributes) so wrappers compose valid HTML.
function blockIdentity(block) {
  const dataAttrs = Object.entries(block.dataAttrs || {})
    .filter(([k, v]) => /^[a-zA-Z][\w.-]*$/.test(k) && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => ` data-${escAttr(k)}="${escAttr(v)}"`).join("");
  return {
    id: block.customId || "",
    cls: ["acrx-block", `acrx-${block.type}`, block.customClasses || ""].filter(Boolean).join(" ").trim(),
    tail: (block.ariaLabel ? ` aria-label="${escAttr(block.ariaLabel)}"` : "") + dataAttrs,
  };
}

function htmlIsEmpty(html) {
  return !String(html ?? "").replace(/<[^>]*>/g, "").replace(/[\u200B\uFEFF\xA0]/g, "").trim();
}

function editableChild(block, childId, depth, index, inner, placeholder, extra = "") {
  const cls = htmlIsEmpty(inner) ? "block-child is-empty" : "block-child";
  return `<div id="child_${childId}" class="${cls}" data-block-id="${escAttr(block.id)}" ` +
    `data-child-id="${escAttr(childId)}" data-index="${index}" data-depth="${depth}" ` +
    `data-type="${escAttr(block.type)}" contenteditable="true" data-placeholder="${escAttr(placeholder || "Start typing...")}"${extra}>${inner}</div>`;
}

function widgetChild(block, childId, depth, inner, widgetClass) {
  return `<div id="child_${childId}" class="block-child ${widgetClass || ""}" data-block-id="${escAttr(block.id)}" ` +
    `data-child-id="${escAttr(childId)}" data-depth="${depth}" data-type="${escAttr(block.type)}">${inner}</div>`;
}

function containerLayoutCSS(block) {
  const layout = (block.data && block.data.layout) || {};
  const props = {};
  const display = layout.display || "block";
  if (display === "flex") {
    props.display = "flex";
    props["flex-direction"] = layout.direction === "row" ? "row" : "column";
    if (layout.wrap) props["flex-wrap"] = "wrap";
    const justify = { "flex-start": "flex-start", center: "center", "flex-end": "flex-end", "space-between": "space-between", "space-around": "space-around" };
    props["justify-content"] = justify[layout.justify] || "flex-start";
    const align = { stretch: "stretch", "flex-start": "flex-start", center: "center", "flex-end": "flex-end" };
    props["align-items"] = align[layout.align] || "stretch";
    if (layout.gap !== undefined && layout.gap !== "") props.gap = `${layout.gap}px`;
  } else if (display === "grid") {
    props.display = "grid";
    props["grid-template-columns"] = layout.columns || "1fr 1fr";
    if (layout.gap !== undefined && layout.gap !== "") props.gap = `${layout.gap}px`;
    const align = { stretch: "stretch", "flex-start": "start", center: "center", "flex-end": "end" };
    props["align-items"] = align[layout.align] || "stretch";
  }
  return props;
}

function styleAttrFor(block, device, extraProps = {}) {
  const props = { ...extraProps };
  const css = blockCSS(block, device);
  const combined = css + (Object.keys(props).length > 0
    ? (css ? ";" : "") + Object.keys(props).sort().map((k) => `${k}:${props[k]}`).join(";")
    : "");
  return combined ? ` style="${escAttr(combined)}"` : "";
}

function tagFor(block, fallback) {
  const tag = String(block.tag || "").trim().toLowerCase();
  if (/^[a-z][a-z0-9-]*$/.test(tag)) return tag;
  return fallback;
}

// Render inner content for one block (children HTML passed for containers).
function blockInner(block, depth, childrenHTML, deviceMode) {
  const d = block.data || {};
  const align = resolveAttr(block, deviceMode, "attrs.align", block.attrs?.align || (d.align || ""));
  const alignStyle = align && align !== "left" ? `text-align:${align}` : "";

  switch (block.type) {
    case "paragraph": {
      const tag = tagFor(block, "p");
      const inner = editableChild(block, `${block.id}-p`, depth + 1, 0, inlineHTML(block.content), "Start typing...");
      if (tag === "p") return inner;
      const ident = blockIdentity(block);
      return `<${tag}${ident.id ? ` id="${escAttr(ident.id)}"` : ""} class="${escAttr(ident.cls)}"${ident.tail}${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>${inner}</${tag}>`;
    }
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(d.level) || 2));
      return `<div class="acrx-heading acrx-heading-${level}"${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>` +
        editableChild(block, `${block.id}-h`, depth + 1, 0, inlineHTML(block.content), "Heading...") + `</div>`;
    }
    case "blockquote":
      return `<div class="acrx-quote"${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>` +
        editableChild(block, `${block.id}-q`, depth + 1, 0, inlineHTML(block.content), "Quote...") +
        (d.author ? `<cite class="acrx-quote-author">— ${esc(d.author)}</cite>` : "") +
        (d.cite ? `<cite class="acrx-quote-cite">${esc(d.cite)}</cite>` : "") + `</div>`;
    case "codeblock": {
      const raw = inlineToText(block.content);
      const lines = raw.split("\n");
      // Line numbers belong in the LEFT column (the .acrx-code grid puts the
      // first child in the narrow gutter column). Highlighting is a display
      // pass (highlightCodeblocks) over raw source, never stored in the doc.
      const numbered = d.lineNumbers !== false
        ? `<div class="acrx-code-lines" aria-hidden="true">${lines.map((_, i) => `<span>${i + 1}</span>`).join("")}</div>` : "";
      const codeId = `${block.id}-code-text`;
      return widgetChild(block, `${block.id}-code`, depth + 1,
        `<div class="acrx-codeblock"${styleAttrFor(block, deviceMode)}>` +
        `<div class="acrx-codebar"><span class="acrx-code-title">${esc(d.title || "")}</span>` +
        `<span class="acrx-code-lang">${esc(d.language || "txt")}</span>` +
        `<button type="button" class="acrx-code-copy" data-action="edit-code" data-title="Edit code"><i class="fa-duotone fa-pen"></i></button>` +
        `<button type="button" class="acrx-code-copy" data-action="copy-code" data-title="Copy code"><i class="fa-duotone fa-copy"></i></button></div>` +
        `<pre class="acrx-code${d.wrap ? " is-wrapped" : ""}">${numbered}<code id="${escAttr(codeId)}" class="language-${escAttr(d.language || "txt")}" ` +
        `data-block-id="${escAttr(block.id)}" data-codeblock="1" contenteditable="true" spellcheck="false" data-placeholder="Code...">${esc(raw || "")}</code></pre></div>`, "widget-code");
    }
    case "bulletList":
    case "orderedList": {
      const tag = block.type === "bulletList" ? "ul" : "ol";
      const items = Array.isArray(d.items) && d.items.length > 0 ? d.items : [""];
      return `<${tag} class="acrx-list"${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>` + items.map((item, i) => {
        // Items are inline-model arrays (P0-02); legacy strings still render.
        const inner = Array.isArray(item) ? inlineHTML(item) : esc(item ?? "");
        const empty = Array.isArray(item) ? htmlIsEmpty(inner) : !(item && String(item).trim());
        return `<li class="block-child${empty ? " is-empty" : ""}" data-block-id="${escAttr(block.id)}" data-child-id="${escAttr(block.id)}-li${i}" ` +
        `data-parent-id="${escAttr(block.id)}-list" data-depth="${depth + 2}" data-type="list-item" ` +
        `contenteditable="true" data-placeholder="List item..." data-item-index="${i}">${inner}</li>`;
      }).join("") + `</${tag}>`;
    }
    case "alert":
      return `<div class="acrx-alert acrx-alert-${escAttr(d.tone || "info")}"${styleAttrFor(block, deviceMode)} role="alert">` +
        (d.title ? `<div class="acrx-alert-title">${esc(d.title)}</div>` : "") +
        editableChild(block, `${block.id}-alert`, depth + 1, 0, inlineHTML(block.content), "Alert message...") +
        (d.dismissible ? `<button type="button" class="acrx-alert-close" data-action="dismiss-alert" aria-label="Dismiss">×</button>` : "") + `</div>`;
    case "image": {
      const ratio = d.ratio ? `aspect-ratio:${d.ratio};` : "";
      const fit = d.objectFit && d.objectFit !== "cover" ? `object-fit:${d.objectFit};` : "";
      const pos = d.objectPosition && d.objectPosition !== "center" ? `object-position:${d.objectPosition};` : "";
      const img = d.src
        ? `<img src="${escAttr(d.src)}" alt="${escAttr(d.alt || "")}"${d.title ? ` title="${escAttr(d.title)}"` : ""}${d.lazy === false ? "" : ' loading="lazy"'}${d.width ? ` style="width:${escAttr(d.width)};${ratio}${fit}${pos}"` : (ratio || fit || pos) ? ` style="${ratio}${fit}${pos}"` : ""} draggable="false">`
        : `<div class="acrx-media-empty" data-action="pick-media"><i class="fa-duotone fa-image"></i><span>Add image</span></div>`;
      const linked = d.href ? `<a href="${escAttr(safeUrl(d.href) || "#")}" class="acrx-image-link"${d.target === "_blank" ? ' target="_blank" rel="noopener"' : ""} contenteditable="false">${img}</a>` : img;
      return widgetChild(block, `${block.id}-image`, depth + 1,
        `<figure class="acrx-figure"${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : "")}>${linked}` +
        (d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : "") + `</figure>`, "widget-image");
    }
    case "gallery": {
      const images = Array.isArray(d.images) ? d.images : [];
      const cols = Math.min(6, Math.max(1, Number(resolveAttr(block, deviceMode, "columns", d.columns) || 3)));
      const gap = Number(resolveAttr(block, deviceMode, "gap", d.gap) ?? 12);
      const ratio = d.ratio && d.ratio !== "auto" ? d.ratio : "1/1";
      const cells = images.map((src, i) => {
        const url = typeof src === "string" ? src : src.url;
        return `<div class="acrx-gallery-item"><img src="${escAttr(url)}" alt="" loading="lazy" draggable="false" data-gindex="${i}"></div>`;
      }).join("");
      return widgetChild(block, `${block.id}-gallery`, depth + 1,
        `<div class="acrx-gallery" style="--acrx-gallery-cols:${cols};--acrx-gallery-gap:${gap}px;--acrx-gallery-ratio:${ratio};--acrx-gallery-fit:${escAttr(d.fit || "cover")}"${styleAttrFor(block, deviceMode)}>` +
        (cells || `<div class="acrx-media-empty" data-action="pick-media"><i class="fa-duotone fa-images"></i><span>Add images</span></div>`) +
        `</div><div class="acrx-hint">Click to manage images</div>`, "widget-gallery");
    }
    case "video": {
      const ratio = d.ratio && d.ratio !== "auto" ? `aspect-ratio:${d.ratio};` : "";
      return widgetChild(block, `${block.id}-video`, depth + 1,
        d.src ? `<div class="acrx-video"${styleAttrFor(block, deviceMode, ratio ? { "aspect-ratio": d.ratio } : {})}><video src="${escAttr(d.src)}"${d.poster ? ` poster="${escAttr(d.poster)}"` : ""} controls${d.autoplay ? " autoplay muted playsinline" : ""}${d.muted ? " muted" : ""}${d.loop ? " loop" : ""} preload="metadata"></video></div>`
          : `<div class="acrx-media-empty" data-action="pick-media"><i class="fa-duotone fa-video"></i><span>Add video</span></div>`, "widget-video");
    }
    case "audio":
      return widgetChild(block, `${block.id}-audio`, depth + 1,
        d.src ? `<div class="acrx-audio"${styleAttrFor(block, deviceMode)}><span class="acrx-audio-title">${esc(d.title || "Audio")}</span><audio src="${escAttr(d.src)}" controls preload="metadata"></audio></div>`
          : `<div class="acrx-media-empty" data-action="pick-media"><i class="fa-duotone fa-music"></i><span>Add audio</span></div>`, "widget-audio");
    case "button": {
      const variant = d.variant || "primary";
      const size = d.size || "medium";
      const widthCls = d.width === "full" ? " is-full" : "";
      const href = d.linkType === "email" && d.href && !d.href.startsWith("mailto:")
        ? `mailto:${d.href}` : (d.linkType === "anchor" && d.href && !d.href.startsWith("#") ? `#${d.href}` : (safeUrl(d.href) || "#"));
      const rel = [d.rel, d.target === "_blank" ? "noopener" : ""].filter(Boolean).join(" ");
      const iconHtml = d.icon ? `<i class="fa-duotone fa-${cleanIcon(d.icon)} acrx-btn-icon"></i>` : "";
      const label = `<span class="acrx-btn-label" data-btn-text>${esc(d.text || "Button")}</span>`;
      const inner = d.iconPosition === "right" ? label + iconHtml : iconHtml + label;
      const tag = d.href ? "a" : "button";
      const tagAttrs = d.href
        ? ` href="${escAttr(href)}"${d.target === "_blank" ? ' target="_blank"' : ""}${rel ? ` rel="${escAttr(rel)}"` : ""}`
        : ` type="button"`;
      return widgetChild(block, `${block.id}-button`, depth + 1,
        `<span class="acrx-btn-wrap" style="${alignStyle || "text-align:left"}"><${tag} class="acrx-btn acrx-btn-${escAttr(variant)} acrx-btn-${escAttr(size)}${widthCls}"${tagAttrs}${d.ariaLabel || block.ariaLabel ? ` aria-label="${escAttr(d.ariaLabel || block.ariaLabel)}"` : ""}${styleAttrFor(block, deviceMode)}>${inner}</${tag}></span>`, "widget-button");
    }
    case "divider": {
      const thickness = Math.min(12, Math.max(1, Number(d.thickness) || 1));
      const width = d.width || "100%";
      const divAlign = d.align || "center";
      const color = d.color || "";
      return widgetChild(block, `${block.id}-divider`, depth + 1,
        `<div class="acrx-divider-wrap" style="text-align:${divAlign}"><hr class="acrx-divider acrx-divider-${escAttr(d.style || "solid")}" style="width:${escAttr(width)};border-top-width:${thickness}px;${color ? `border-top-color:${escAttr(color)};` : ""}"${styleAttrFor(block, deviceMode)}></div>`, "widget-divider");
    }
    case "spacer":
      return widgetChild(block, `${block.id}-spacer`, depth + 1,
        `<div class="acrx-spacer" style="height:${Number(d.height ?? 24)}px" aria-hidden="true"></div>`, "widget-spacer");
    case "columns": {
      const cols = Math.min(4, Math.max(1, Number(resolveAttr(block, deviceMode, "columns", d.columns) || 2)));
      const gap = Number(resolveAttr(block, deviceMode, "gap", d.gap) ?? 16);
      const widths = String(resolveAttr(block, deviceMode, "widths", d.widths) || "").trim();
      const template = widths || `repeat(${cols}, minmax(0, 1fr))`;
      const stack = d.stackOnMobile === false ? "" : " data-stack=\"1\"";
      return `<div class="acrx-columns" data-columns="${cols}" style="grid-template-columns:${escAttr(template)};gap:${gap}px"${stack}${styleAttrFor(block, deviceMode)}>${childrenHTML}</div>`;
    }
    case "column": {
      const tag = tagFor(block, "div");
      return `<${tag} class="acrx-column"${styleAttrFor(block, deviceMode)}>${childrenHTML}</${tag}>`;
    }
    case "container": {
      const tag = tagFor(block, "div");
      return `<${tag} class="acrx-container"${styleAttrFor(block, deviceMode, containerLayoutCSS(block))}>${childrenHTML}</${tag}>`;
    }
    case "grid": {
      const cols = String(resolveAttr(block, deviceMode, "columns", d.columns) || "1fr 1fr 1fr").trim() || "1fr 1fr 1fr";
      const gap = Number(resolveAttr(block, deviceMode, "gap", d.gap) ?? 16);
      const rowGap = Number(d.rowGap ?? gap);
      const tag = tagFor(block, "div");
      return `<${tag} class="acrx-grid"${styleAttrFor(block, deviceMode, { "grid-template-columns": cols, gap: `${gap}px`, "row-gap": `${rowGap}px` })}>${childrenHTML}</${tag}>`;
    }
    case "group": {
      const tag = tagFor(block, "div");
      return `<${tag} class="acrx-group"${styleAttrFor(block, deviceMode, containerLayoutCSS(block))}>${childrenHTML}</${tag}>`;
    }
    case "stack": {
      const layout = { display: "flex", direction: "column", gap: 16, align: "stretch", justify: "flex-start", ...((block.data && block.data.layout) || {}) };
      const tag = tagFor(block, "div");
      return `<${tag} class="acrx-stack"${styleAttrFor(block, deviceMode, containerLayoutCSS({ ...block, data: { ...(block.data || {}), layout } }))}>${childrenHTML}</${tag}>`;
    }
    case "row": {
      const layout = { display: "flex", direction: "row", wrap: true, gap: 12, align: "center", justify: "flex-start", ...((block.data && block.data.layout) || {}) };
      const tag = tagFor(block, "div");
      return `<${tag} class="acrx-row"${styleAttrFor(block, deviceMode, containerLayoutCSS({ ...block, data: { ...(block.data || {}), layout } }))}>${childrenHTML}</${tag}>`;
    }
    case "split": {
      const ratios = { "50/50": "1fr 1fr", "60/40": "3fr 2fr", "40/60": "2fr 3fr", "33/67": "1fr 2fr", "67/33": "2fr 1fr" };
      const template = ratios[d.ratio] || "1fr 1fr";
      const gap = Number(d.gap ?? 24);
      const tag = tagFor(block, "div");
      return `<${tag} class="acrx-split"${styleAttrFor(block, deviceMode, { "grid-template-columns": template, gap: `${gap}px`, "align-items": d.align || "center" })}${d.stack === false ? "" : ' data-stack="1"'}>${childrenHTML}</${tag}>`;
    }
    case "link": {
      const href = safeUrl(d.href) || "#";
      const linkInner = inlineHTML(block.content);
      return `<a id="child_${block.id}-link" class="block-child acrx-link${htmlIsEmpty(linkInner) ? " is-empty" : ""}" data-block-id="${escAttr(block.id)}" ` +
        `data-child-id="${escAttr(block.id)}-link" data-depth="${depth + 1}" data-type="link" contenteditable="true" ` +
        `data-placeholder="Link text..." href="${escAttr(href)}"${d.target === "_blank" ? ' target="_blank" rel="noopener"' : ""}${d.rel ? ` rel="${escAttr(d.rel)}"` : ""}${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>${inlineHTML(block.content)}</a>`;
    }
    case "icon": {
      const size = d.size || "24px";
      return widgetChild(block, `${block.id}-icon`, depth + 1,
        `<span class="acrx-icon"${styleAttrFor(block, deviceMode, { "font-size": size })}><i class="fa-duotone fa-${cleanIcon(d.icon || "star")}"></i></span>`, "widget-icon");
    }
    case "testimonial": {
      const rating = Math.min(5, Math.max(0, Number(d.rating) || 0));
      const stars = Array.from({ length: 5 }, (_, i) =>
        `<i class="fa-${i < rating ? "solid" : "regular"} fa-star"></i>`).join("");
      return widgetChild(block, `${block.id}-testimonial`, depth + 1,
        `<figure class="acrx-testimonial"${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>` +
        `<div class="acrx-stars" aria-label="Rated ${rating} of 5">${stars}</div>` +
        editableChild(block, `${block.id}-t-text`, depth + 2, 0, inlineHTML(block.content), "Testimonial…") +
        `<figcaption class="acrx-testimonial-who">` +
        (d.avatar ? `<img src="${escAttr(d.avatar)}" alt="" loading="lazy" draggable="false">` : "") +
        `<span><span class="acrx-testimonial-author">${esc(d.author || "")}</span>` +
        (d.role ? `<span class="acrx-testimonial-role">${esc(d.role)}</span>` : "") + `</span></figcaption></figure>`, "widget-testimonial");
    }
    case "stats": {
      const stats = Array.isArray(d.stats) ? d.stats : [];
      const cols = Math.min(6, Math.max(1, Number(d.columns) || 3));
      return widgetChild(block, `${block.id}-stats`, depth + 1,
        `<div class="acrx-stats" style="--acrx-stats-cols:${cols}"${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>` +
        stats.map((s) =>
          `<div class="acrx-stat"><div class="acrx-stat-value">${esc(s.value || "")}</div>` +
          `<div class="acrx-stat-label">${esc(s.label || "")}</div></div>`
        ).join("") + `</div>`, "widget-stats");
    }
    case "card": {
      const direction = d.direction || "vertical";
      return widgetChild(block, `${block.id}-card`, depth + 1,
        `<article class="acrx-card is-${direction}"${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>` +
        (d.image ? `<img class="acrx-card-image" src="${escAttr(d.image)}" alt="" loading="lazy" draggable="false">` : "") +
        `<div class="acrx-card-body">` +
        (d.badge ? `<span class="acrx-card-badge">${esc(d.badge)}</span>` : "") +
        (d.title ? `<div class="acrx-card-title">${esc(d.title)}</div>` : "") +
        (d.description ? `<div class="acrx-card-desc">${esc(d.description)}</div>` : "") +
        (d.buttonText ? `<span class="acrx-btn acrx-btn-primary acrx-btn-small">${esc(d.buttonText)}</span>` : "") +
        `</div><div class="acrx-hint">Edit card content in Block settings →</div></article>`, "widget-card");
    }
    case "hero": {
      const heroAlign = d.align || "center";
      const bg = d.backgroundImage ? `background-image:url("${d.backgroundImage}");background-size:cover;background-position:center;` : "";
      return widgetChild(block, `${block.id}-hero`, depth + 1,
        `<div class="acrx-hero is-${heroAlign}"${styleAttrFor(block, deviceMode, bg ? { background: bg } : {})}>` +
        `<div class="acrx-hero-inner" style="max-width:${escAttr(d.maxWidth || "720px")}">` +
        (d.eyebrow ? `<div class="acrx-hero-eyebrow">${esc(d.eyebrow)}</div>` : "") +
        `<div class="acrx-hero-title">${esc(d.title || "")}</div>` +
        (d.subtitle ? `<div class="acrx-hero-subtitle">${esc(d.subtitle)}</div>` : "") +
        `<div class="acrx-hero-actions">` +
        (d.buttonText ? `<span class="acrx-btn acrx-btn-primary">${esc(d.buttonText)}</span>` : "") +
        (d.secondaryText ? `<span class="acrx-btn acrx-btn-ghost">${esc(d.secondaryText)}</span>` : "") +
        `</div></div></div>`, "widget-hero");
    }
    case "cta": {
      const ctaAlign = d.align || "center";
      return widgetChild(block, `${block.id}-cta`, depth + 1,
        `<div class="acrx-cta is-${ctaAlign}"${styleAttrFor(block, deviceMode)}><div class="acrx-cta-title">${esc(d.title || "")}</div>` +
        (d.description ? `<div class="acrx-cta-desc">${esc(d.description)}</div>` : "") +
        `<div class="acrx-cta-actions">` +
        (d.buttonText ? `<span class="acrx-btn acrx-btn-primary">${esc(d.buttonText)}</span>` : "") +
        (d.secondaryText ? `<span class="acrx-btn acrx-btn-ghost">${esc(d.secondaryText)}</span>` : "") +
        `</div></div>`, "widget-cta");
    }
    case "faq": {
      const items = Array.isArray(d.items) ? d.items : [];
      return widgetChild(block, `${block.id}-faq`, depth + 1,
        `<div class="acrx-faq"${styleAttrFor(block, deviceMode)}>` + items.map((item, i) =>
          `<details class="acrx-faq-item"${i === 0 ? " open" : ""}><summary>${esc(item.q || `Question ${i + 1}`)}</summary><div>${esc(item.a || "")}</div></details>`
        ).join("") + `<div class="acrx-hint">Edit questions in Block settings →</div></div>`, "widget-faq");
    }
    case "pricing": {
      const plans = Array.isArray(d.plans) ? d.plans : [];
      return widgetChild(block, `${block.id}-pricing`, depth + 1,
        `<div class="acrx-pricing"${styleAttrFor(block, deviceMode)}>` + plans.map((plan) =>
          `<div class="acrx-plan${plan.highlight ? " is-highlight" : ""}">` +
          `<div class="acrx-plan-name">${esc(plan.name || "")}</div>` +
          `<div class="acrx-plan-price">${esc(plan.price || "")}${plan.period ? `<span class="acrx-plan-period">${esc(plan.period)}</span>` : ""}</div>` +
          (plan.description ? `<div class="acrx-plan-desc">${esc(plan.description)}</div>` : "") +
          `<ul>${(plan.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` +
          (plan.ctaText ? `<span class="acrx-btn acrx-btn-primary acrx-btn-small">${esc(plan.ctaText)}</span>` : "") +
          `</div>`
        ).join("") + `</div>`, "widget-pricing");
    }
    case "table": {
      const rows = Array.isArray(d.rows) ? d.rows : [["", ""]];
      const hasHeader = d.hasHeader !== false;
      const body = rows.map((row, ri) => {
        const cells = (Array.isArray(row) ? row : [row]).map((cell, ci) => {
          const tag = ri === 0 && hasHeader ? "th" : "td";
          // Cells are inline-model arrays (P0-02); legacy strings still render.
          const inner = Array.isArray(cell) ? inlineHTML(cell) : esc(cell ?? "");
          const empty = Array.isArray(cell) ? htmlIsEmpty(inner) : !(cell && String(cell).trim());
          return `<${tag} class="block-child${empty ? " is-empty" : ""}" data-block-id="${escAttr(block.id)}" data-child-id="${escAttr(block.id)}-c${ri}-${ci}" data-depth="${depth + 2}" data-type="table-cell" data-row="${ri}" data-col="${ci}" contenteditable="true" data-placeholder="Cell">${inner}</${tag}>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      return widgetChild(block, `${block.id}-table`, depth + 1,
        `<div class="acrx-table-wrap"${styleAttrFor(block, deviceMode)}><table class="acrx-table">${body}</table></div>`, "widget-table");
    }
    case "embed": {
      const src = safeUrl(d.src);
      const ratio = d.ratio && d.ratio !== "auto" ? d.ratio : "16/9";
      return widgetChild(block, `${block.id}-embed`, depth + 1,
        src ? `<div class="acrx-embed" style="aspect-ratio:${escAttr(ratio)}"${styleAttrFor(block, deviceMode)}><span class="acrx-embed-url">${esc(src)}</span><span class="acrx-hint">Live embed renders on the site</span></div>`
          : `<div class="acrx-media-empty"><i class="fa-duotone fa-arrow-up-right-from-square"></i><span>Paste an embed URL in Block settings →</span></div>`, "widget-embed");
    }
    case "tabs": {
      const tabs = Array.isArray(d.tabs) ? d.tabs : [];
      const active = Math.min(tabs.length - 1, Math.max(0, Number(d.active) || 0));
      return widgetChild(block, `${block.id}-tabs`, depth + 1,
        `<div class="acrx-tabs"${styleAttrFor(block, deviceMode)}>` +
        `<div class="acrx-tabs-bar" role="tablist">` + tabs.map((t, i) =>
          `<button type="button" role="tab" aria-selected="${i === active}" class="acrx-tab-btn${i === active ? " is-active" : ""}" data-tab-index="${i}">${esc(t.label || `Tab ${i + 1}`)}</button>`
        ).join("") + `</div><div class="acrx-tabs-body">` + tabs.map((t, i) =>
          `<div class="acrx-tab-pane${i === active ? " is-active" : ""}" role="tabpanel"${i === active ? "" : " hidden"}>${esc(t.content || "")}</div>`
        ).join("") + `</div><div class="acrx-hint">Edit tabs in Block settings →</div></div>`, "widget-tabs");
    }
    case "accordion": {
      const items = Array.isArray(d.items) ? d.items : [];
      return widgetChild(block, `${block.id}-accordion`, depth + 1,
        `<div class="acrx-accordion"${styleAttrFor(block, deviceMode)}>` + items.map((item, i) =>
          `<details class="acrx-accordion-item"${i === 0 ? " open" : ""}><summary>${esc(item.q || `Section ${i + 1}`)}</summary><div class="acrx-accordion-body">${esc(item.a || "")}</div></details>`
        ).join("") + `<div class="acrx-hint">Edit sections in Block settings →</div></div>`, "widget-accordion");
    }
    case "timeline": {
      const events = Array.isArray(d.events) ? d.events : [];
      return widgetChild(block, `${block.id}-timeline`, depth + 1,
        `<ol class="acrx-timeline"${styleAttrFor(block, deviceMode)}>` + events.map((ev) =>
          `<li class="acrx-timeline-item">` +
          (ev.date ? `<div class="acrx-timeline-date">${esc(ev.date)}</div>` : "") +
          (ev.title ? `<div class="acrx-timeline-title">${esc(ev.title)}</div>` : "") +
          (ev.text ? `<div class="acrx-timeline-text">${esc(ev.text)}</div>` : "") + `</li>`
        ).join("") + `</ol>`, "widget-timeline");
    }
    case "features": {
      const feats = Array.isArray(d.features) ? d.features : [];
      return widgetChild(block, `${block.id}-features`, depth + 1,
        `<div class="acrx-features"${styleAttrFor(block, deviceMode, alignStyle ? { "text-align": align } : {})}>` + feats.map((f) =>
          `<div class="acrx-feature">` +
          `<span class="acrx-feature-icon"><i class="fa-duotone fa-${cleanIcon(f.icon || "star")}"></i></span>` +
          (f.title ? `<div class="acrx-feature-title">${esc(f.title)}</div>` : "") +
          (f.text ? `<div class="acrx-feature-text">${esc(f.text)}</div>` : "") + `</div>`
        ).join("") + `</div>`, "widget-features");
    }
    case "section": {
      return `<section class="acrx-section"${styleAttrFor(block, deviceMode, containerLayoutCSS(block))}>${childrenHTML}</section>`;
    }
    case "unresolved":
      return widgetChild(block, `${block.id}-unresolved`, depth + 1,
        `<div class="acrx-unresolved"${styleAttrFor(block, deviceMode)}><i class="fa-duotone fa-triangle-exclamation"></i>` +
        `<div><div class="acrx-unresolved-title">Unable to render “${esc(d.originalType || "unknown")}”.</div>` +
        `<div class="acrx-hint">Original data is preserved. Remove this block or inspect its payload in Block settings →</div></div></div>`, "widget-unresolved");
    default:
      return editableChild(block, `${block.id}-x`, depth + 1, 0, esc(inlineToText(block.content)), "Start typing...");
  }
}

function blockWrap(block, index, depth, childrenHTML, deviceMode, selectedIds, multiSelected, opts = {}) {
  const label = blockLabel(block);
  const isSelected = selectedIds && selectedIds.has(block.id);
  const classes = ["block-wrap"];
  if (isSelected) classes.push(multiSelected ? "is-multiselected" : "is-selected");
  if (block.locked) classes.push("is-locked");
  if (block.hidden) classes.push("is-hidden");
  const exportMode = opts.exportMode === true;
  const ident = blockIdentity(block);
  const handle = exportMode ? "" :
    `<label class="block-handle" for="block-${escAttr(block.id)}-check" data-handle-block-id="${escAttr(block.id)}" title="${escAttr(label.base)} — drag to move" draggable="true">` +
    `<span class="block-drag-handle"><i class="fa-duotone fa-grip-dots-vertical"></i></span>` +
    `<input id="block-${escAttr(block.id)}-check" type="checkbox" class="block-check hidden"${multiSelected ? " checked" : ""}>` +
    `</label>`;
  const domId = exportMode ? (ident.id || "") : (ident.id || `block-${block.id}`);
  return `<div${exportMode ? "" : ` id="block-wrap-${escAttr(block.id)}"`} class="${classes.join(" ")}" data-for-block-id="${escAttr(block.id)}" ` +
    `data-label="${escAttr(label.base)}">` + handle +
    `<div${domId ? ` id="${escAttr(domId)}"` : ""} class="block ${escAttr(ident.cls)}${block.hidden ? " is-hidden" : ""}" data-block-id="${escAttr(block.id)}" ` +
    `data-index="${index}" data-depth="${depth}" data-type="${escAttr(block.type)}"${ident.tail}>` +
    blockInner(block, depth, childrenHTML, deviceMode) +
    `</div>${blockCustomCSS(block)}</div>`;
}

function renderNode(blocks, block, index, depth, deviceMode, selectedIds, multiIds, skipIds, opts = {}) {
  if (!block || skipIds.has(block.id)) return null; // live-edited: keep DOM
  let childrenHTML = "";
  if (CONTAINER_TYPES.has(block.type)) {
    childrenHTML = (block.children || []).map((cid, i) => {
      const child = blocks[cid];
      if (!child) return "";
      const html = renderNode(blocks, child, i, depth + 1, deviceMode, selectedIds, multiIds, skipIds, opts);
      if (html === null && !opts.exportMode && typeof document !== "undefined") {
        return document.getElementById(`block-wrap-${CSS.escape(child.id)}`)?.outerHTML || "";
      }
      return html || "";
    }).join("");
    // Genuinely empty containers get an in-flow hint (render-time truth, not
    // an overlay): it disappears the moment a child exists. Export mode and
    // the reconciler's skip path never see stale hints.
    if (!childrenHTML && !opts.exportMode) {
      childrenHTML = `<div class="container-empty-hint"><i class="fa-duotone fa-plus"></i><span>Drop blocks here</span></div>`;
    }
  }
  return blockWrap(block, index, depth, childrenHTML, deviceMode, selectedIds, multiIds.has(block.id), opts);
}

// Cursor-walk reconciler: walks the desired sequence (zone, wrap, zone, wrap…)
// and creates/moves existing nodes into place. Live editables in skipIds are
// moved, never rebuilt, so the caret survives structural renders elsewhere.
export function renderCanvas(canvas, docState, opts = {}) {
  const blocks = docState.blocks || {};
  const order = (docState.blockOrder || []).filter((id) => blocks[id]);
  const deviceMode = opts.deviceMode || "desktop";
  const selectedIds = opts.selectedIds || new Set();
  const multiIds = opts.multiIds || new Set();
  const skipIds = opts.skipIds || new Set();

  const mainInput = canvas.querySelector("#canvas-main-input");
  let cursor = mainInput ? mainInput.nextSibling : canvas.firstChild;

  const zoneHTML = (afterId) =>
    `<div class="block-insert-zone" data-after="${escAttr(afterId || "")}"><button type="button" class="block-insert-btn" data-action="insert-here" data-after="${escAttr(afterId || "")}" title="Insert block here" aria-label="Insert block here" aria-haspopup="listbox"><i class="fa-solid fa-plus"></i></button></div>`;

  const placeZone = (afterId) => {
    const isZone = (n) => n && n.nodeType === 1 && n.classList && n.classList.contains("block-insert-zone");
    if (isZone(cursor) && cursor.getAttribute("data-after") === (afterId || "")) {
      cursor = cursor.nextSibling;
      return;
    }
    const existing = canvas.querySelector(`:scope > .block-insert-zone[data-after="${CSS.escape(afterId || "")}"]`);
    const tmp = document.createElement("div");
    tmp.innerHTML = zoneHTML(afterId);
    const zone = existing || tmp.firstChild;
    canvas.insertBefore(zone, cursor);
    cursor = zone.nextSibling;
  };

  const placeWrap = (id, index) => {
    const sel = `:scope > .block-wrap[data-for-block-id="${CSS.escape(id)}"]`;
    const wrap = skipIds.has(id) ? canvas.querySelector(sel) : null;
    if (wrap) {
      if (cursor !== wrap) canvas.insertBefore(wrap, cursor);
      wrap.querySelector(".block")?.setAttribute("data-index", String(index));
      cursor = wrap.nextSibling;
      return;
    }
    const html = renderNode(blocks, blocks[id], index, 0, deviceMode, selectedIds, multiIds, skipIds);
    if (!html) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const fresh = tmp.firstChild;
    canvas.insertBefore(fresh, cursor);
    cursor = fresh.nextSibling;
  };

  let prevId = "";
  order.forEach((id, i) => {
    placeZone(prevId);
    placeWrap(id, i);
    prevId = id;
  });

  // Remove anything left over (stale wraps/zones), keep empty-state + input.
  while (cursor) {
    const next = cursor.nextSibling;
    if (cursor.nodeType === 1 && !cursor.classList.contains("canvas-empty-state") && cursor.id !== "canvas-main-input") {
      cursor.remove();
    }
    cursor = next;
  }

  // Empty state.
  let empty = canvas.querySelector(":scope > .canvas-empty-state");
  // The phantom main input is the reconciler anchor: keep it in the DOM
  // but hide it while the canvas is empty so the empty state is the only
  // "start" affordance. "Start writing" inserts a real paragraph instead.
  if (mainInput) mainInput.style.display = order.length === 0 ? "none" : "";
  if (order.length === 0) {
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "canvas-empty-state";
      empty.innerHTML =
        `<div class="canvas-empty-box"><i class="fa-duotone fa-pen-nib"></i>` +
        `<p class="canvas-empty-title">Start creating</p>` +
        `<p class="canvas-empty-text">Write, generate with AI, or drop in a layout — or press <kbd>/</kbd> in any text block to insert.</p>` +
        `<div class="canvas-empty-actions">` +
        `<button type="button" class="axed-btn axed-primary" data-action="insert-here" data-after="">Start writing</button>` +
        `<button type="button" class="axed-btn" data-action="ai-generate">Generate with AI</button>` +
        `</div><div class="canvas-empty-actions">` +
        `<button type="button" class="axed-btn" data-action="layout-columns">Columns</button>` +
        `<button type="button" class="axed-btn" data-action="layout-grid">Grid</button>` +
        `<button type="button" class="axed-btn" data-action="layout-hero">Hero</button>` +
        `<button type="button" class="axed-btn" data-action="browse-widgets">All widgets</button>` +
        `</div></div>`;
      canvas.appendChild(empty);
    }
    empty.style.display = "";
  } else if (empty) {
    empty.style.display = "none";
  }

  highlightCodeblocks(canvas);
  return { rendered: order.length };
}

// Syntax-highlight Code Block source via the bundled highlight.js asset.
// Highlighting is a display-only pass applied over the RAW text; it is reset
// to plain text while the pane is focused (so contenteditable edits never
// operate on token spans) and reapplied on blur/render. Falls back to plain
// escaped text when hljs isn't present or the language is unsupported.
function highlightCodeblocks(root) {
  const hljs = typeof window !== "undefined" ? window.hljs : null;
  root.querySelectorAll(".acrx-code code[data-codeblock]").forEach((code) => {
    if (document.activeElement === code) return;
    const lang = (code.className.match(/language-([\w-]+)/) || [])[1] || "";
    const text = code.textContent;
    if (!hljs || !text) return;
    try {
      const html = hljs.getLanguage(lang)
        ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(text).value;
      code.innerHTML = html;
    } catch {
      code.textContent = text;
    }
  });
}

// Clean published output from the same views: no handles, selection,
// contentEditable, placeholders or editor-only hints. Custom IDs, classes,
// styles and scoped custom CSS are preserved.
export function renderExportHTML(docState, opts = {}) {
  const blocks = docState.blocks || {};
  const order = (docState.blockOrder || []).filter((id) => blocks[id]);
  const deviceMode = opts.deviceMode || "desktop";
  const html = order.map((id, i) => {
    const out = renderNode(blocks, blocks[id], i, 0, deviceMode, new Set(), new Set(), new Set(), { exportMode: true });
    return out || "";
  }).join("\n");
  return html
    .replace(/\scontenteditable="[^"]*"/g, "")
    .replace(/\sdata-placeholder="[^"]*"/g, "")
    .replace(/\sdata-index="[^"]*"/g, "")
    .replace(/\sdata-depth="[^"]*"/g, "")
    .replace(/<div class="acrx-hint">[^<]*<\/div>/g, "")
    .replace(/\sdata-action="[^"]*"/g, "")
    .replace(/\sdata-tab-index="[^"]*"/g, "")
    .replace(/\sdata-gindex="[^"]*"/g, "")
    .replace(/\sdata-item-index="[^"]*"/g, "")
    .replace(/\sdata-row="[^"]*"/g, "")
    .replace(/\sdata-col="[^"]*"/g, "")
    .replace(/\sdata-hero-field="[^"]*"/g, "")
    .replace(/\sdata-btn-text="[^"]*"/g, "");
}

export function blockElement(canvas, blockId) {
  return canvas.querySelector(`:scope .block[data-block-id="${CSS.escape(blockId)}"]`);
}

export function wrapElement(canvas, blockId) {
  return canvas.querySelector(`:scope > .block-wrap[data-for-block-id="${CSS.escape(blockId)}"]`);
}

export default { renderCanvas, renderExportHTML, blockElement, wrapElement, inlineHTML };
