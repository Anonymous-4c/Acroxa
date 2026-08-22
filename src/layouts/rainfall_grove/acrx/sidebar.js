export function sidebar(params) {
    const recent     = (params.recent_posts || []).map(post => `
        <li><a href="${post.url || post.slug ? `/post/${post.slug}` : "#"}">${post.title}</a></li>
    `).join("");

    const categories = (params.categories || []).map(cat => `
        <li class="rg-category-row">
            <a href="/category/${cat.slug}">${cat.name}</a>
            <span class="rg-category-count">${cat.count || 0}</span>
        </li>
    `).join("");

    const tags = (params.tags || []).map(tag => `
        <a href="/category/${tag.slug}" class="rg-tag">${tag.name}</a>
    `).join("");

    return `
        <aside class="rg-sidebar" aria-label="Sidebar">
            <!-- Decorative grove accent -->
            <div class="rg-sidebar__accent" aria-hidden="true"></div>

            ${recent ? `
            <div class="rg-widget">
                <h2 class="rg-widget-title">From the grove</h2>
                <ul class="rg-widget-list rg-widget-list--recent">${recent}</ul>
            </div>` : ""}

            ${categories ? `
            <div class="rg-widget">
                <h2 class="rg-widget-title">Territories</h2>
                <ul class="rg-widget-list rg-widget-list--categories" style="list-style:none;padding:0;margin:0;">
                    ${categories}
                </ul>
            </div>` : ""}

            ${tags ? `
            <div class="rg-widget">
                <h2 class="rg-widget-title">Trails</h2>
                <div class="rg-tag-cloud">${tags}</div>
            </div>` : ""}

            <div class="rg-widget rg-widget--subscribe">
                <h2 class="rg-widget-title">Into the grove</h2>
                <p class="rg-widget-desc">
                    Get new dispatches delivered to your inbox.
                </p>
                <form class="rg-form" action="#" method="post" onsubmit="return false;">
                    <div class="rg-field">
                        <label for="rg-sidebar-email" class="rg-label">Email</label>
                        <input
                            id="rg-sidebar-email"
                            type="email"
                            class="rg-input"
                            placeholder="you@example.com"
                            autocomplete="email">
                    </div>
                    <button type="submit" class="rg-btn rg-btn--primary" style="width:100%;">Subscribe</button>
                </form>
            </div>
        </aside>
    `;
}
