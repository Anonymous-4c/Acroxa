/** Shared helpers for Aurora Spring templates */

export function cfg(params) {
    return params.layoutConfig || {};
}

export function layoutCfg(params) {
    return cfg(params).layout || params.layout || {};
}

export function homeCfg(params) {
    // Get homepage config from layout.homepage first (customizer-saved), then fall back to root
    const layout = layoutCfg(params);
    return layout.homepage || cfg(params).homepage || {};
}

export function colors(params) {
    // Get colors config from layout.colors first (customizer-saved), then fall back to root
    const layout = layoutCfg(params);
    return layout.colors || cfg(params).colors || {};
}

export function showSidebar(params, context) {
    const L = layoutCfg(params);
    if (L.sidebar?.enabled === false) return false;
    const key = {
        homepage: "show_on_homepage",
        post: "show_on_posts",
        page: "show_on_pages",
        blog: "show_on_pages",
        category: "show_on_pages"
    }[context] || "show_on_pages";
    return L.sidebar?.[key] !== false;
}

export function shellAttrs(params) {
    const L = layoutCfg(params);
    // Get typography from layout.typography first, then fall back
    const T = L.typography || cfg(params).typography || {};
    const density = L.spacingDensity || "normal";
    const container = L.containerWidth || "medium";
    const headerStyle = L.headerStyle || "standard";
    const cardStyle = L.cardStyle || "soft";
    const typeScale = T.scale || "normal";
    return `data-as-density="${density}" data-as-container="${container}" data-as-header="${headerStyle}" data-as-card="${cardStyle}" data-as-type-scale="${typeScale}"`;
}

export function mainGridStyle(params, context) {
    const L = layoutCfg(params);
    const show = showSidebar(params, context);
    const pos = L.sidebar?.position || "right";
    const width = L.sidebar?.width || "320px";
    if (!show) return "grid-template-columns: 1fr;";
    return pos === "left"
        ? `grid-template-columns: ${width} 1fr;`
        : `grid-template-columns: 1fr ${width};`;
}

export function menuItems(params) {
    const menus = params.menus || {};
    if (menus.primary?.length) return menus.primary;
    if (Array.isArray(params.menu) && params.menu.length) return params.menu;
    return [
        { label: "Home", url: "/" },
        { label: "Blog", url: "/blog" },
        { label: "About", url: "/page/about" },
        { label: "Contact", url: "/page/contact" }
    ];
}

export function renderMenuTree(items, depth = 0) {
    if (!Array.isArray(items) || !items.length) return "";
    return items.map(item => {
        const url = item.url || item.link || "#";
        const label = item.label || "Link";
        const kids = item.children;
        if (Array.isArray(kids) && kids.length) {
            return `
                <li class="as-nav-item as-nav-item--has-children">
                    <a href="${url}" class="as-nav-link">${label}</a>
                    <ul class="as-nav-submenu" aria-label="${label} submenu">
                        ${renderMenuTree(kids, depth + 1)}
                    </ul>
                </li>`;
        }
        return `<li class="as-nav-item"><a href="${url}" class="as-nav-link">${label}</a></li>`;
    }).join("");
}

export function footerMenuItems(params) {
    const menus = params.menus || {};
    if (menus.footer?.length) return menus.footer;
    return menuItems(params);
}

export function postCard(post, opts = {}) {
    const featured = opts.featured;
    const img = post.image
        ? `<img src="${post.image}" alt="${post.title || ""}" loading="lazy">`
        : `<div class="as-card-media-placeholder" aria-hidden="true"></div>`;
    const href = post.slug ? `/post/${post.slug}` : (post.url || "#");
    const cls = featured ? "as-card as-card--post as-card--featured" : "as-card as-card--post";

    return `
        <a href="${href}" class="${cls}">
            <div class="as-card-media">${img}</div>
            <div class="as-card-body">
                <div class="as-card-meta">
                    <span class="as-badge">${post.category || "Article"}</span>
                    ${post.date ? `<time class="as-card-date">${post.date}</time>` : ""}
                </div>
                <h3 class="as-card-title">${post.title || ""}</h3>
                ${post.excerpt ? `<p class="as-card-excerpt">${post.excerpt}</p>` : ""}
                <div class="as-card-footer">
                    <span>${post.author ? `By ${post.author}` : ""}</span>
                    ${post.read_time ? `<span>${post.read_time} min read</span>` : ""}
                </div>
            </div>
        </a>`;
}

export function breadcrumbs(items) {
    const trail = items || [];
    if (!trail.length) return "";
    return `
        <nav class="as-breadcrumb" aria-label="Breadcrumb">
            ${trail.map((item, i) => {
                const isLast = i === trail.length - 1;
                if (isLast) return `<span class="as-breadcrumb-current" aria-current="page">${item.label}</span>`;
                return `<a href="${item.url}">${item.label}</a><span class="as-breadcrumb-sep" aria-hidden="true">/</span>`;
            }).join("")}
        </nav>`;
}

export function pagination(pagination) {
    if (!pagination || pagination.totalPages <= 1) return "";
    const { page, totalPages, prevUrl, nextUrl } = pagination;
    let pages = "";
    for (let p = 1; p <= totalPages; p++) {
        const active = p === page ? " as-pagination__link--active" : "";
        pages += `<a href="?page=${p}" class="as-pagination__link${active}"${p === page ? ' aria-current="page"' : ""}>${p}</a>`;
    }
    return `
        <nav class="as-pagination" aria-label="Pagination">
            ${prevUrl ? `<a href="${prevUrl}" class="as-pagination__prev">Previous</a>` : `<span class="as-pagination__prev as-pagination__prev--disabled">Previous</span>`}
            <div class="as-pagination__pages">${pages}</div>
            ${nextUrl ? `<a href="${nextUrl}" class="as-pagination__next">Next</a>` : `<span class="as-pagination__next as-pagination__next--disabled">Next</span>`}
        </nav>`;
}
