import { header }  from "./header.js";
import { footer }  from "./footer.js";
import { sidebar } from "./sidebar.js";
import {
    showSidebar, mainGridStyle, layoutCfg,
    postCard, breadcrumbs, pagination
} from "./utils.js";

export function category(params) {
    const posts = params.posts || [];
    const cat   = params.category || {};
    const name  = cat.name || params.page_title || "Category";
    const show  = showSidebar(params, "category");
    const L     = layoutCfg(params);
    const pos   = L.sidebar?.position || "right";

    const cards = posts.length
        ? posts.map(p => postCard(p, { featured: false })).join("")
        : `<div class="rg-empty-state">
               <p class="rg-empty-state__text">No stories in this territory yet.</p>
           </div>`;

    const content = `
        ${breadcrumbs([
            { label: "Home", url: "/" },
            { label: "Blog", url: "/blog" },
            { label: name, url: "#" }
        ])}
        <header class="rg-page-header">
            <p class="rg-eyebrow">Territory</p>
            <h1 class="rg-page-title">${name}</h1>
            ${cat.description ? `<p class="rg-page-lead">${cat.description}</p>` : ""}
        </header>
        <div class="rg-post-grid">${cards}</div>
        ${pagination(params.pagination)}
    `;

    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}
        <div class="rg-page-atmosphere" aria-hidden="true"></div>
        <main class="rg-main" id="main-content">
            <div class="rg-layout-grid" style="${mainGridStyle(params, "category")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="rg-content">${content}</div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>
        ${footer(params)}
    `;
}
