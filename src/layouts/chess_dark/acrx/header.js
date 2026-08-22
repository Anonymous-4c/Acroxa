export function header(params) {
    const menuItems = (params.menu || []).map(item => `
        <a href="${item.url || item.link || '#'}">${item.label}</a>
    `).join('');

    return `
        <div class="chess-bg"></div>
        <div class="site-shell">
        <header class="site-header">
            <a href="/" class="site-logo">
                <span class="logo-icon">♛</span>
                <span>${params.site_title || 'Chess Dark'}</span>
            </a>
            <nav class="site-nav">
                ${menuItems}
            </nav>
        </header>
    `;
}