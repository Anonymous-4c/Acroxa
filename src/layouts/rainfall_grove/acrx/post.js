import { header }  from "./header.js";
import { footer }  from "./footer.js";
import { sidebar } from "./sidebar.js";
import { showSidebar, mainGridStyle, layoutCfg, breadcrumbs } from "./utils.js";

export function post(params) {
    const p    = params.post || {};
    const show = showSidebar(params, "post");
    const L    = layoutCfg(params);
    const pos  = L.sidebar?.position || "right";

    const featured = p.image
        ? `<div class="rg-post-hero-image">
               <img src="${p.image}" alt="${p.title || ""}" loading="eager">
               <div class="rg-post-hero-image__mist" aria-hidden="true"></div>
           </div>`
        : "";

    const tags = (p.tags || []).map(tag =>
        `<a href="/category/${tag.slug || tag}" class="rg-badge rg-badge--tag">${tag.name || tag}</a>`
    ).join("");

    const article = `
        ${breadcrumbs([
            { label: "Home", url: "/" },
            { label: "Blog", url: "/blog" },
            { label: p.category || "Post", url: p.category ? `/category/${p.category.toLowerCase().replace(/\s+/g, "-")}` : "#" }
        ])}

        <article class="rg-article">
            <header class="rg-article-header">
                <div class="rg-article-meta-top">
                    <span class="rg-badge">${p.category || "Article"}</span>
                    ${p.date ? `<time class="rg-article-date" datetime="${p.date}">${p.date}</time>` : ""}
                    ${p.read_time ? `<span class="rg-article-read-time">${p.read_time} min read</span>` : ""}
                </div>
                <h1 class="rg-article-title">${p.title || ""}</h1>
                ${p.excerpt ? `<p class="rg-article-lead">${p.excerpt}</p>` : ""}
                ${p.author ? `
                <div class="rg-article-byline">
                    <span class="rg-article-author">By ${p.author}</span>
                </div>` : ""}
            </header>

            ${featured}

            <div class="rg-rich-content">
                ${p.content || ""}
            </div>

            ${tags ? `
            <div class="rg-article-tags">
                <span class="rg-article-tags__label">Filed under:</span>
                ${tags}
            </div>` : ""}

            <footer class="rg-article-footer">
                <a href="/blog" class="rg-btn rg-btn--ghost">← Back to grove</a>
            </footer>
        </article>
    `;

    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}
        <div class="rg-page-atmosphere" aria-hidden="true"></div>
        <main class="rg-main" id="main-content">
            <div class="rg-layout-grid" style="${mainGridStyle(params, "post")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="rg-content">${article}</div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>
        ${footer(params)}
    `;
}
