/** Shared helpers for Rainfall Grove templates */

export function cfg(params) {
    return params.layoutConfig || {};
}

export function layoutCfg(params) {
    return cfg(params).layout || params.layout || {};
}

export function homeCfg(params) {
    const layout = layoutCfg(params);
    return layout.homepage || cfg(params).homepage || {};
}

export function colors(params) {
    const layout = layoutCfg(params);
    return layout.colors || cfg(params).colors || {};
}

export function showSidebar(params, context) {
    const L = layoutCfg(params);
    if (L.sidebar?.enabled === false) return false;
    const key = {
        homepage: "show_on_homepage",
        post:     "show_on_posts",
        page:     "show_on_pages",
        blog:     "show_on_pages",
        category: "show_on_pages"
    }[context] || "show_on_pages";
    return L.sidebar?.[key] !== false;
}

export function shellAttrs(params) {
    const L = layoutCfg(params);
    const T = L.typography || cfg(params).typography || {};
    const density     = L.spacingDensity || "spacious";
    const container   = L.containerWidth || "medium";
    const headerStyle = L.headerStyle    || "transparent";
    const typeScale   = T.scale          || "spacious";
    const rainIntensity = L.rainIntensity || "medium";
    return `data-rg-density="${density}" data-rg-container="${container}" data-rg-header="${headerStyle}" data-rg-type-scale="${typeScale}" data-rg-rain="${rainIntensity}"`;
}

export function mainGridStyle(params, context) {
    const L    = layoutCfg(params);
    const show = showSidebar(params, context);
    const pos  = L.sidebar?.position || "right";
    const w    = L.sidebar?.width    || "320px";
    if (!show) return "grid-template-columns: 1fr;";
    return pos === "left"
        ? `grid-template-columns: ${w} 1fr;`
        : `grid-template-columns: 1fr ${w};`;
}

export function menuItems(params) {
    const menus = params.menus || {};
    if (menus.primary?.length)                       return menus.primary;
    if (Array.isArray(params.menu) && params.menu.length) return params.menu;
    return [
        { label: "Home",    url: "/" },
        { label: "Blog",    url: "/blog" },
        { label: "About",   url: "/page/about" },
        { label: "Contact", url: "/page/contact" }
    ];
}

export function renderMenuTree(items, depth = 0) {
    if (!Array.isArray(items) || !items.length) return "";
    return items.map(item => {
        const url   = item.url || item.link || "#";
        const label = item.label || "Link";
        const kids  = item.children;
        if (Array.isArray(kids) && kids.length) {
            return `
                <li class="rg-nav-item rg-nav-item--has-children">
                    <a href="${url}" class="rg-nav-link">${label}</a>
                    <ul class="rg-nav-submenu" aria-label="${label} submenu">
                        ${renderMenuTree(kids, depth + 1)}
                    </ul>
                </li>`;
        }
        return `<li class="rg-nav-item"><a href="${url}" class="rg-nav-link">${label}</a></li>`;
    }).join("");
}

export function footerMenuItems(params) {
    const menus = params.menus || {};
    if (menus.footer?.length) return menus.footer;
    return menuItems(params);
}

/** Render a blog/post card in Rainfall Grove style */
export function postCard(post, opts = {}) {
    const featured = opts.featured;
    const href = post.slug ? `/post/${post.slug}` : (post.url || "#");
    const img  = post.image
        ? `<img src="${post.image}" alt="${post.title || ""}" loading="lazy">`
        : `<div class="rg-card-media-placeholder" aria-hidden="true"></div>`;
    const cls  = featured
        ? "rg-card rg-card--post rg-card--featured"
        : "rg-card rg-card--post";

    return `
        <a href="${href}" class="${cls}">
            <div class="rg-card-media">${img}</div>
            <div class="rg-card-body">
                <div class="rg-card-meta">
                    <span class="rg-badge">${post.category || "Article"}</span>
                    ${post.date ? `<time class="rg-card-date">${post.date}</time>` : ""}
                </div>
                <h3 class="rg-card-title">${post.title || ""}</h3>
                ${post.excerpt ? `<p class="rg-card-excerpt">${post.excerpt}</p>` : ""}
                <div class="rg-card-footer">
                    <span class="rg-card-author">${post.author ? `By ${post.author}` : ""}</span>
                    ${post.read_time ? `<span class="rg-card-read-time">${post.read_time} min read</span>` : ""}
                </div>
            </div>
        </a>`;
}

export function breadcrumbs(items) {
    const trail = items || [];
    if (!trail.length) return "";
    return `
        <nav class="rg-breadcrumb" aria-label="Breadcrumb">
            ${trail.map((item, i) => {
                const isLast = i === trail.length - 1;
                if (isLast) return `<span class="rg-breadcrumb-current" aria-current="page">${item.label}</span>`;
                return `<a href="${item.url}">${item.label}</a><span class="rg-breadcrumb-sep" aria-hidden="true">/</span>`;
            }).join("")}
        </nav>`;
}

export function pagination(pg) {
    if (!pg || pg.totalPages <= 1) return "";
    const { page, totalPages, prevUrl, nextUrl } = pg;
    let pages = "";
    for (let p = 1; p <= totalPages; p++) {
        const active = p === page ? " rg-pagination__link--active" : "";
        pages += `<a href="?page=${p}" class="rg-pagination__link${active}"${p === page ? ' aria-current="page"' : ""}>${p}</a>`;
    }
    return `
        <nav class="rg-pagination" aria-label="Pagination">
            ${prevUrl ? `<a href="${prevUrl}" class="rg-pagination__prev">← Previous</a>` : `<span class="rg-pagination__prev rg-pagination__prev--disabled">← Previous</span>`}
            <div class="rg-pagination__pages">${pages}</div>
            ${nextUrl ? `<a href="${nextUrl}" class="rg-pagination__next">Next →</a>` : `<span class="rg-pagination__next rg-pagination__next--disabled">Next →</span>`}
        </nav>`;
}
