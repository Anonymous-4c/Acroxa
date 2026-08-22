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

export function category(params) {
    const posts = params.posts || [];
    const cat = params.category || {};
    const name = cat.name || params.page_title || "Category";
    const show = showSidebar(params, "category");
    const L = layoutCfg(params);
    const pos = L.sidebar?.position || "right";

    const cards = posts.length
        ? posts.map((p, i) => postCard(p, { featured: false })).join("")
        : `<p class="as-alert as-alert--info">No posts in this category yet.</p>`;

    const content = `
        ${breadcrumbs([
            { label: "Home", url: "/" },
            { label: "Blog", url: "/blog" },
            { label: name, url: "#" }
        ])}
        <header class="as-article-header">
            <p class="as-eyebrow">Category</p>
            <h1 class="as-page-title">${name}</h1>
        </header>
        <div class="as-post-grid">${cards}</div>
        ${pagination(params.pagination)}
    `;

    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}
        <main class="as-main" id="main-content">
            <div class="as-layout-grid" style="${mainGridStyle(params, "category")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="as-content">${content}</div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>
        ${footer(params)}
    `;
}
