export function sidebar(params) {
    const recentPosts = (params.recent_posts || []).map(post => `
        <a href="${post.url}" class="recent-post-item">
            <span class="recent-post-title">${post.title}</span>
        </a>
    `).join('');

    const categories = (params.categories || []).map(cat => `
        <li class="category-item">
            <a href="/category/${cat.slug}" class="category-link">${cat.name}</a>
            <span class="category-count">${cat.count || 0}</span>
        </li>
    `).join('');

    // Mini decorative chess board
    const pieces = { 12: '♜', 19: '♞', 44: '♟', 51: '♝' };
    const boardCells = Array.from({ length: 64 }, (_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isLight = (row + col) % 2 === 1;
        const piece = pieces[i] || '';
        return `<div class="board-cell ${isLight ? 'light' : ''} ${piece ? 'has-piece' : ''}">${piece}</div>`;
    }).join('');

    return `
        <aside class="site-sidebar">
            ${recentPosts ? `
            <div class="sidebar-widget">
                <div class="widget-title">♟ Recent Posts</div>
                ${recentPosts}
            </div>
            ` : ''}

            ${categories ? `
            <div class="sidebar-widget">
                <div class="widget-title">♜ Categories</div>
                <ul class="category-list">
                    ${categories}
                </ul>
            </div>
            ` : ''}

            <div class="sidebar-widget">
                <div class="widget-title">♞ The Board</div>
                <div class="sidebar-board">
                    ${boardCells}
                </div>
            </div>
        </aside>
    `;
}