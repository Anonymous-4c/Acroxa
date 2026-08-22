import { shellAttrs, menuItems, renderMenuTree } from "./utils.js";

export function header(params) {
    const items   = menuItems(params);
    const logo    = params.site_logo;
    const title   = params.site_title || "Rainfall Grove";
    const initial = (title.charAt(0) || "R").toUpperCase();

    return `
        <div class="rg-site-shell" ${shellAttrs(params)}>
        <header class="rg-header" role="banner">
            <div class="rg-container rg-header__inner">
                <a href="/" class="rg-brand" aria-label="${title} — home">
                    ${logo
                        ? `<img src="${logo}" alt="${title}" class="rg-brand__logo">`
                        : `<span class="rg-brand__mark" aria-hidden="true">${initial}</span>`}
                    <span class="rg-brand__text">${title}</span>
                </a>

                <nav class="rg-nav rg-nav--desktop" aria-label="Primary navigation">
                    <ul class="rg-nav-list">
                        ${renderMenuTree(items)}
                    </ul>
                </nav>

                <div class="rg-header-actions">
                    <a href="/blog" class="rg-btn rg-btn--primary rg-header-cta">
                        <span>Enter the grove</span>
                    </a>
                    <button
                        type="button"
                        class="rg-menu-toggle"
                        id="rg-menu-toggle"
                        aria-expanded="false"
                        aria-controls="rg-mobile-nav"
                        aria-label="Open navigation menu">
                        <span class="rg-menu-toggle__bar"></span>
                        <span class="rg-menu-toggle__bar"></span>
                        <span class="rg-menu-toggle__bar"></span>
                    </button>
                </div>
            </div>

            <div class="rg-mobile-panel" id="rg-mobile-nav" hidden>
                <div class="rg-container">
                    <nav aria-label="Mobile navigation">
                        <ul class="rg-nav-list rg-nav-list--mobile">
                            ${renderMenuTree(items)}
                        </ul>
                    </nav>
                    <div class="rg-mobile-panel__footer">
                        <a href="/blog" class="rg-btn rg-btn--primary" style="width:100%;justify-content:center;">Enter the grove</a>
                    </div>
                </div>
            </div>
        </header>
    `;
}
