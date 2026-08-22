export function sidebar(params) {
    const recent = (params.recent_posts || []).map(post => `
        <li><a href="${post.url}">${post.title}</a></li>
    `).join("");

    const categories = (params.categories || []).map(cat => `
        <li class="as-category-row">
            <a href="/category/${cat.slug}">${cat.name}</a>
            <span class="as-category-count">${cat.count || 0}</span>
        </li>
    `).join("");

    return `
        <aside class="as-sidebar" aria-label="Sidebar">
            ${recent ? `
            <div class="as-widget">
                <h2 class="as-widget-title">Recent posts</h2>
                <ul class="as-widget-list">${recent}</ul>
            </div>` : ""}

            ${categories ? `
            <div class="as-widget">
                <h2 class="as-widget-title">Categories</h2>
                <ul class="as-widget-list" style="list-style:none;padding:0;margin:0;">
                    ${categories}
                </ul>
            </div>` : ""}

            <div class="as-widget">
                <h2 class="as-widget-title">Stay in touch</h2>
                <p style="font-size:0.9375rem;color:var(--as-text-muted);margin:0 0 0.75rem;line-height:1.5;">
                    Get new articles delivered to your inbox.
                </p>
                <form class="as-form" action="#" method="post" onsubmit="return false;">
                    <div class="as-field">
                        <label for="as-sidebar-email">Email</label>
                        <input id="as-sidebar-email" type="email" placeholder="you@example.com">
                    </div>
                    <button type="submit" class="as-btn as-btn--primary" style="width:100%;">Subscribe</button>
                </form>
            </div>
        </aside>
    `;
}
