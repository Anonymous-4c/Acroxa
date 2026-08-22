import { header }  from "./header.js";
import { footer }  from "./footer.js";
import { sidebar } from "./sidebar.js";
import { showSidebar, mainGridStyle, layoutCfg, breadcrumbs } from "./utils.js";

function contactLayout(pg) {
    return `
        <div class="rg-contact-grid">
            <!-- Info column -->
            <div class="rg-contact-info">
                <div class="rg-rich-content">${pg.content || ""}</div>

                <div class="rg-contact-details">
                    <div class="rg-contact-detail">
                        <span class="rg-contact-detail__icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
                        </span>
                        <div>
                            <strong>Get in touch</strong>
                            <p>We read every message from the grove.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Form column -->
            <form class="rg-form rg-contact-form" action="#" method="post" onsubmit="return false;" aria-label="Contact form">
                <div class="rg-field">
                    <label for="rg-contact-name" class="rg-label">Name</label>
                    <input id="rg-contact-name" name="name" type="text" class="rg-input" required autocomplete="name" placeholder="Your name">
                </div>
                <div class="rg-field">
                    <label for="rg-contact-email" class="rg-label">Email</label>
                    <input id="rg-contact-email" name="email" type="email" class="rg-input" required autocomplete="email" placeholder="you@example.com">
                </div>
                <div class="rg-field">
                    <label for="rg-contact-subject" class="rg-label">Subject</label>
                    <input id="rg-contact-subject" name="subject" type="text" class="rg-input" placeholder="What's on your mind?">
                </div>
                <div class="rg-field">
                    <label for="rg-contact-message" class="rg-label">Message</label>
                    <textarea id="rg-contact-message" name="message" class="rg-input rg-textarea" rows="6" required placeholder="Tell us your story..."></textarea>
                </div>
                <button type="submit" class="rg-btn rg-btn--primary rg-btn--full">
                    Send into the grove
                    <svg class="rg-btn__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
                </button>
            </form>
        </div>`;
}

function aboutLayout(pg) {
    return `
        <div class="rg-about-layout">
            <div class="rg-about-hero">
                ${pg.image ? `
                <div class="rg-about-hero__image">
                    <img src="${pg.image}" alt="${pg.title || "About"}">
                    <div class="rg-about-hero__image-mist" aria-hidden="true"></div>
                </div>` : `
                <div class="rg-about-hero__visual" aria-hidden="true">
                    <div class="rg-about-hero__grove">
                        <svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <defs>
                                <radialGradient id="fogGrad" cx="50%" cy="100%" r="60%">
                                    <stop offset="0%" stop-color="currentColor" stop-opacity="0.4"/>
                                    <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
                                </radialGradient>
                            </defs>
                            <ellipse cx="300" cy="280" rx="300" ry="40" fill="url(#fogGrad)"/>
                            <rect x="80" y="120" width="10" height="160" rx="3" fill="currentColor" opacity="0.5"/>
                            <polygon points="85,30 50,125 120,125" fill="currentColor" opacity="0.5"/>
                            <polygon points="85,60 55,125 115,125" fill="currentColor" opacity="0.4"/>
                            <rect x="270" y="80" width="14" height="200" rx="3" fill="currentColor" opacity="0.7"/>
                            <polygon points="277,10 230,85 324,85" fill="currentColor" opacity="0.7"/>
                            <polygon points="277,45 235,85 319,85" fill="currentColor" opacity="0.6"/>
                            <polygon points="277,72 238,85 316,85" fill="currentColor" opacity="0.5"/>
                            <rect x="460" y="140" width="9" height="140" rx="3" fill="currentColor" opacity="0.45"/>
                            <polygon points="465,60 432,145 498,145" fill="currentColor" opacity="0.45"/>
                            <polygon points="465,90 435,145 495,145" fill="currentColor" opacity="0.35"/>
                        </svg>
                    </div>
                </div>`}
            </div>
            <div class="rg-rich-content rg-about-content">${pg.content || ""}</div>
        </div>`;
}

export function page(params) {
    const pg   = params.page || {};
    const slug = (pg.slug || "").toLowerCase();
    const show = showSidebar(params, "page");
    const L    = layoutCfg(params);
    const pos  = L.sidebar?.position || "right";

    let body;

    if (slug === "contact") {
        body = `
            ${breadcrumbs([{ label: "Home", url: "/" }, { label: "Contact", url: "#" }])}
            <header class="rg-page-header">
                <p class="rg-eyebrow">Get in touch</p>
                <h1 class="rg-page-title">${pg.title || "Contact"}</h1>
                <p class="rg-page-lead">Every great conversation starts in the forest of ideas.</p>
            </header>
            ${contactLayout(pg)}
        `;
    } else if (slug === "about") {
        body = `
            ${breadcrumbs([{ label: "Home", url: "/" }, { label: "About", url: "#" }])}
            <header class="rg-page-header">
                <p class="rg-eyebrow">Our story</p>
                <h1 class="rg-page-title">${pg.title || "About"}</h1>
            </header>
            ${aboutLayout(pg)}
        `;
    } else {
        const featured = pg.image
            ? `<div class="rg-featured-image"><img src="${pg.image}" alt=""><div class="rg-featured-image__mist" aria-hidden="true"></div></div>`
            : "";
        body = `
            ${breadcrumbs([{ label: "Home", url: "/" }, { label: pg.title || "Page", url: "#" }])}
            <header class="rg-page-header">
                <h1 class="rg-page-title">${pg.title || ""}</h1>
            </header>
            ${featured}
            <div class="rg-rich-content">${pg.content || ""}</div>
            <div style="margin-top:var(--space-8);">
                <a href="/" class="rg-btn rg-btn--ghost">← Back to home</a>
            </div>
        `;
    }

    const sidebarBlock = show ? sidebar(params) : "";

    return `
        ${header(params)}
        <div class="rg-page-atmosphere" aria-hidden="true"></div>
        <main class="rg-main" id="main-content">
            <div class="rg-layout-grid" style="${mainGridStyle(params, "page")}">
                ${pos === "left" ? sidebarBlock : ""}
                <div class="rg-content">${body}</div>
                ${pos === "right" ? sidebarBlock : ""}
            </div>
        </main>
        ${footer(params)}
    `;
}
