import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";
import {
    showSidebar,
    mainGridStyle,
    layoutCfg,
    postCard,
    breadcrumbs,
    pagination
} from "./utils.js";

export function blog(params) {
    const posts = params.posts || [];
    const show = showSidebar(params, "blog");
    const L = layoutCfg(params);
    const pos = L.sidebar?.position || "right";

    const cards = posts.length
        ? posts.map((p, i) => postCard(p, { featured: i === 0 })).join("")
        : `<p class="as-alert as-alert--info">No posts published yet.</p>`;

    const grid = `
        <header class="as-article-header">
            ${breadcrumbs([{ label: "Home", url: "/" }, { label: "Blog", url: "/blog" }])}
            <h1 class="as-page-title">Blog</h1>
            <p class="as-section-lead" style="margin:0;">Articles, updates, and long-form writing.</p>
        </header>
        <div class="as-post-grid">
            ${cards}
        </div>
        ${pagination(params.pagination)}
    `;

    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}
        <main class="as-main" id="main-content">
            <div class="as-layout-grid" style="${mainGridStyle(params, "blog")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="as-content">${grid}</div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>
        ${footer(params)}
    `;
}
