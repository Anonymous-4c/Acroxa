import { shellAttrs, menuItems, renderMenuTree } from "./utils.js";

export function header(params) {
    const items = menuItems(params);
    const logo = params.site_logo;
    const title = params.site_title || "Aurora Spring";
    const initial = (title.charAt(0) || "A").toUpperCase();

    return `
        <div class="as-site-shell" ${shellAttrs(params)}>
        <header class="as-header" role="banner">
            <div class="as-container as-header__inner">
                <a href="/" class="as-brand">
                    ${logo
                        ? `<img src="${logo}" alt="${title}">`
                        : `<span class="as-brand__mark" aria-hidden="true">${initial}</span>`}
                    <span class="as-brand__text">${title}</span>
                </a>

                <nav class="as-nav as-nav--desktop" aria-label="Primary">
                    <ul class="as-nav-list">
                        ${renderMenuTree(items)}
                    </ul>
                </nav>

                <div class="as-header-actions">
                    <a href="/blog" class="as-btn as-btn--primary as-header-cta">Get started</a>
                    <button type="button" class="as-menu-toggle" id="as-menu-toggle" aria-expanded="false" aria-controls="as-mobile-nav" aria-label="Open menu">
                        <span aria-hidden="true">☰</span>
                    </button>
                </div>
            </div>

            <div class="as-mobile-panel" id="as-mobile-nav" hidden>
                <div class="as-container">
                    <nav aria-label="Mobile">
                        <ul class="as-nav-list">
                            ${renderMenuTree(items)}
                        </ul>
                    </nav>
                </div>
            </div>
        </header>
    `;
}
