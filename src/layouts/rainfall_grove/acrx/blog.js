import { header }  from "./header.js";
import { footer }  from "./footer.js";
import { sidebar } from "./sidebar.js";
import {
    showSidebar, mainGridStyle, layoutCfg,
    postCard, breadcrumbs, pagination
} from "./utils.js";

export function blog(params) {
    const posts = params.posts || [];
    const show  = showSidebar(params, "blog");
    const L     = layoutCfg(params);
    const pos   = L.sidebar?.position || "right";

    const cards = posts.length
        ? posts.map((p, i) => postCard(p, { featured: i === 0 })).join("")
        : `<div class="rg-empty-state">
               <div class="rg-empty-state__icon" aria-hidden="true">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
               </div>
               <p class="rg-empty-state__text">No stories published yet. The grove is waiting.</p>
           </div>`;

    const content = `
        ${breadcrumbs([{ label: "Home", url: "/" }, { label: "Blog", url: "/blog" }])}
        <header class="rg-page-header">
            <p class="rg-eyebrow">All dispatches</p>
            <h1 class="rg-page-title">From the grove</h1>
            <p class="rg-page-lead">Stories, essays, and long-form writing — shaped by atmosphere.</p>
        </header>
        <div class="rg-post-grid">
            ${cards}
        </div>
        ${pagination(params.pagination)}
    `;

    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}
        <!-- Subtle page atmosphere -->
        <div class="rg-page-atmosphere" aria-hidden="true"></div>
        <main class="rg-main" id="main-content">
            <div class="rg-layout-grid" style="${mainGridStyle(params, "blog")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="rg-content">${content}</div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>
        ${footer(params)}
    `;
}
