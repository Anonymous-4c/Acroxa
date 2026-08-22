import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";
import { showSidebar, mainGridStyle, layoutCfg, breadcrumbs } from "./utils.js";
import { btnSecondary } from "./components/buttons.js";

export function post(params) {
    const p = params.post || {};
    const show = showSidebar(params, "post");
    const L = layoutCfg(params);
    const pos = L.sidebar?.position || "right";
    const featured = p.image ? `<img src="${p.image}" alt="" class="as-featured-image">` : "";

    const article = `
        ${breadcrumbs([
            { label: "Home", url: "/" },
            { label: "Blog", url: "/blog" },
            { label: p.category || "Post", url: "#" }
        ])}
        <article>
            <header class="as-article-header">
                <div class="as-card-meta" style="margin-bottom:0.75rem;">
                    <span class="as-badge">${p.category || "Article"}</span>
                    ${p.date ? `<time class="as-card-date">${p.date}</time>` : ""}
                </div>
                <h1 class="as-article-title">${p.title || ""}</h1>
                <div class="as-article-meta">
                    ${p.author ? `<span>By ${p.author}</span>` : ""}
                    ${p.read_time ? `<span>${p.read_time} min read</span>` : ""}
                </div>
            </header>
            ${featured}
            <div class="as-rich-content">
                ${p.content || ""}
            </div>
            <div style="margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--as-border);">
                ${btnSecondary("← Back to blog", "/blog")}
            </div>
        </article>
    `;

    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}
        <main class="as-main" id="main-content">
            <div class="as-layout-grid" style="${mainGridStyle(params, "post")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="as-content">${article}</div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>
        ${footer(params)}
    `;
}
