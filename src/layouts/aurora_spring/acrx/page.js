import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";
import { showSidebar, mainGridStyle, layoutCfg, breadcrumbs } from "./utils.js";
import { btnPrimary } from "./components/buttons.js";

function contactLayout(pg) {
    return `
        <div class="as-contact-grid">
            <div>
                <div class="as-rich-content">${pg.content || ""}</div>
                <div class="as-alert as-alert--info" style="margin-top:1.5rem;">
                    This form is a layout preview. Wire your endpoint in the CMS or a plugin.
                </div>
            </div>
            <form class="as-form" action="#" method="post" onsubmit="return false;" aria-label="Contact form">
                <div class="as-field">
                    <label for="contact-name">Name</label>
                    <input id="contact-name" name="name" type="text" required autocomplete="name">
                </div>
                <div class="as-field">
                    <label for="contact-email">Email</label>
                    <input id="contact-email" name="email" type="email" required autocomplete="email">
                </div>
                <div class="as-field">
                    <label for="contact-message">Message</label>
                    <textarea id="contact-message" name="message" required></textarea>
                </div>
                <button type="submit" class="as-btn as-btn--primary">Send message</button>
            </form>
        </div>`;
}

function aboutLayout(pg) {
    return `
        <div class="as-page-hero as-page-hero--narrow">
            <p class="as-eyebrow">About</p>
            <h1 class="as-page-title">${pg.title || "About"}</h1>
        </div>
        <div class="as-rich-content">${pg.content || ""}</div>`;
}

export function page(params) {
    const pg = params.page || {};
    const slug = (pg.slug || "").toLowerCase();
    const show = showSidebar(params, "page");
    const L = layoutCfg(params);
    const pos = L.sidebar?.position || "right";
    const featured = pg.image ? `<img src="${pg.image}" alt="" class="as-featured-image">` : "";

    let body;
    if (slug === "contact") {
        body = `
            ${breadcrumbs([{ label: "Home", url: "/" }, { label: "Contact", url: "#" }])}
            <header class="as-article-header">
                <h1 class="as-page-title">${pg.title || "Contact"}</h1>
                <p class="as-section-lead" style="margin:0;">We’d love to hear from you.</p>
            </header>
            ${contactLayout(pg)}
        `;
    } else if (slug === "about") {
        body = `
            ${breadcrumbs([{ label: "Home", url: "/" }, { label: "About", url: "#" }])}
            ${featured}
            ${aboutLayout(pg)}
        `;
    } else {
        body = `
            ${breadcrumbs([{ label: "Home", url: "/" }, { label: pg.title || "Page", url: "#" }])}
            <header class="as-article-header">
                <h1 class="as-page-title">${pg.title || ""}</h1>
            </header>
            ${featured}
            <div class="as-rich-content">${pg.content || ""}</div>
            <div style="margin-top:2rem;">${btnPrimary("Back to home", "/")}</div>
        `;
    }

    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}
        <main class="as-main" id="main-content">
            <div class="as-layout-grid" style="${mainGridStyle(params, "page")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="as-content">${body}</div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>
        ${footer(params)}
    `;
}
