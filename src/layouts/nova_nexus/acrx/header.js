export function header(params) {
    const menuItems = params.menu || [
        { label: 'Home', url: '/' },
        { label: 'About', url: '/about' },
        { label: 'Blog', url: '/blog' },
        { label: 'Contact', url: '/contact' }
    ];

    return `
        <header class="nn-header glass fade-in" style="
            position: sticky;
            top: 0;
            z-index: 1000;
            background: rgba(10, 10, 20, 0.7);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(0, 240, 255, 0.2);
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
        ">
            <div class="container" style="
                max-width: 1400px;
                margin: 0 auto;
                padding: var(--space-4) var(--space-6);
            ">
                <nav class="flex-between" style="gap: var(--space-6);">
                    <div class="nn-brand" style="
                        font-size: var(--font-2xl);
                        font-weight: var(--font-bold);
                        background: linear-gradient(135deg, #00f0ff, #7c3aed);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                        letter-spacing: -0.02em;
                        text-shadow: 0 0 30px rgba(0, 240, 255, 0.5);
                    ">
                        ${params.site_title || 'Nova Nexus'}
                    </div>
                    
                    <ul class="nn-nav-menu flex-center" style="
                        gap: var(--space-6);
                        list-style: none;
                        margin: 0;
                        padding: 0;
                    ">
                        ${menuItems.map(item => `
                            <li>
                                <a href="${item.url}" class="nn-nav-link" style="
                                    color: rgba(255, 255, 255, 0.8);
                                    font-weight: var(--font-medium);
                                    text-decoration: none;
                                    padding: var(--space-2) var(--space-4);
                                    border-radius: var(--radius-md);
                                    transition: all var(--duration-base) var(--ease-out);
                                    position: relative;
                                " onmouseover="
                                    this.style.color = '#00f0ff';
                                    this.style.textShadow = '0 0 20px rgba(0, 240, 255, 0.8)';
                                    this.style.background = 'rgba(0, 240, 255, 0.1)';
                                " onmouseout="
                                    this.style.color = 'rgba(255, 255, 255, 0.8)';
                                    this.style.textShadow = 'none';
                                    this.style.background = 'transparent';
                                ">
                                    ${item.label}
                                </a>
                            </li>
                        `).join('')}
                    </ul>

                    <button class="nn-search-btn" style="
                        padding: var(--space-2) var(--space-4);
                        background: rgba(0, 240, 255, 0.1);
                        border: 1px solid rgba(0, 240, 255, 0.3);
                        border-radius: var(--radius-md);
                        color: #00f0ff;
                        cursor: pointer;
                        transition: all var(--duration-base) var(--ease-out);
                        font-size: var(--font-sm);
                        font-weight: var(--font-medium);
                    " onmouseover="
                        this.style.background = 'rgba(0, 240, 255, 0.2)';
                        this.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.4)';
                    " onmouseout="
                        this.style.background = 'rgba(0, 240, 255, 0.1)';
                        this.style.boxShadow = 'none';
                    ">
                        Search
                    </button>
                </nav>
            </div>
        </header>

        <style>
            @media (max-width: 768px) {
                .nn-nav-menu {
                    display: none;
                }
            }
        </style>
    `;
}