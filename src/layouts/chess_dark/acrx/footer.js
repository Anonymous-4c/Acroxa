export function footer(params) {
    const year = new Date().getFullYear();

    return `
        <footer class="site-footer">
            <div class="footer-brand">♛ ${params.site_title || 'Chess Dark'}</div>
            <div class="footer-links">
                <a href="/">Home</a>
                <a href="/blog">Blog</a>
                <a href="/page/about">About</a>
            </div>
            <div class="footer-copy">© ${year} — All rights reserved</div>
        </footer>
        </div><!-- /.site-shell -->
    `;
}