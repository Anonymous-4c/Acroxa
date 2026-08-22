export function sidebar(params) {
    const recentPosts = params.recent_posts || [
        { title: 'Getting Started with Nova Nexus', url: '/post/getting-started' },
        { title: 'Advanced Customization Guide', url: '/post/customization' },
        { title: 'Best Practices for Modern Web', url: '/post/best-practices' }
    ];

    const categories = params.categories || [
        { name: 'Technology', count: 12 },
        { name: 'Design', count: 8 },
        { name: 'Development', count: 15 },
        { name: 'Lifestyle', count: 6 }
    ];

    return `
        <aside class="nn-sidebar" style="
            background: rgba(10, 10, 20, 0.5);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 240, 255, 0.2);
            border-radius: var(--radius-lg);
            padding: var(--space-6);
            height: fit-content;
            position: sticky;
            top: 100px;
        ">
            <!-- Search Widget -->
            <div class="nn-widget slide-up" style="
                margin-bottom: var(--space-6);
                padding-bottom: var(--space-6);
                border-bottom: 1px solid rgba(0, 240, 255, 0.1);
            ">
                <h3 style="
                    font-size: var(--font-lg);
                    font-weight: var(--font-semibold);
                    color: #00f0ff;
                    margin-bottom: var(--space-4);
                    text-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
                ">
                    Search
                </h3>
                <div style="
                    position: relative;
                ">
                    <input type="text" placeholder="Search articles..." style="
                        width: 100%;
                        padding: var(--space-3);
                        background: rgba(0, 0, 0, 0.3);
                        border: 1px solid rgba(0, 240, 255, 0.3);
                        border-radius: var(--radius-md);
                        color: rgba(255, 255, 255, 0.9);
                        font-size: var(--font-sm);
                        transition: all var(--duration-base) var(--ease-out);
                    " onfocus="
                        this.style.borderColor = '#00f0ff';
                        this.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.3)';
                    " onblur="
                        this.style.borderColor = 'rgba(0, 240, 255, 0.3)';
                        this.style.boxShadow = 'none';
                    ">
                </div>
            </div>

            <!-- Recent Posts Widget -->
            <div class="nn-widget slide-up delay-150" style="
                margin-bottom: var(--space-6);
                padding-bottom: var(--space-6);
                border-bottom: 1px solid rgba(0, 240, 255, 0.1);
            ">
                <h3 style="
                    font-size: var(--font-lg);
                    font-weight: var(--font-semibold);
                    color: #00f0ff;
                    margin-bottom: var(--space-4);
                    text-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
                ">
                    Recent Posts
                </h3>
                <ul style="
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-3);
                ">
                    ${recentPosts.map(post => `
                        <li>
                            <a href="${post.url}" style="
                                color: rgba(255, 255, 255, 0.7);
                                text-decoration: none;
                                font-size: var(--font-sm);
                                line-height: var(--line-normal);
                                transition: all var(--duration-base) var(--ease-out);
                                display: block;
                                padding: var(--space-2);
                                border-radius: var(--radius-sm);
                            " onmouseover="
                                this.style.color = '#00f0ff';
                                this.style.background = 'rgba(0, 240, 255, 0.05)';
                                this.style.paddingLeft = 'calc(var(--space-2) + 8px)';
                            " onmouseout="
                                this.style.color = 'rgba(255, 255, 255, 0.7)';
                                this.style.background = 'transparent';
                                this.style.paddingLeft = 'var(--space-2)';
                            ">
                                ${post.title}
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>

            <!-- Categories Widget -->
            <div class="nn-widget slide-up delay-250" style="
                margin-bottom: var(--space-6);
                padding-bottom: var(--space-6);
                border-bottom: 1px solid rgba(0, 240, 255, 0.1);
            ">
                <h3 style="
                    font-size: var(--font-lg);
                    font-weight: var(--font-semibold);
                    color: #00f0ff;
                    margin-bottom: var(--space-4);
                    text-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
                ">
                    Categories
                </h3>
                <ul style="
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-2);
                ">
                    ${categories.map(category => `
                        <li>
                            <a href="/category/${category.name.toLowerCase()}" style="
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                padding: var(--space-2);
                                color: rgba(255, 255, 255, 0.7);
                                text-decoration: none;
                                font-size: var(--font-sm);
                                border-radius: var(--radius-sm);
                                transition: all var(--duration-base) var(--ease-out);
                            " onmouseover="
                                this.style.background = 'rgba(0, 240, 255, 0.1)';
                                this.style.color = '#00f0ff';
                            " onmouseout="
                                this.style.background = 'transparent';
                                this.style.color = 'rgba(255, 255, 255, 0.7)';
                            ">
                                <span>${category.name}</span>
                                <span style="
                                    padding: var(--space-1) var(--space-2);
                                    background: rgba(0, 240, 255, 0.1);
                                    border-radius: var(--radius-full);
                                    font-size: var(--font-xs);
                                    font-weight: var(--font-semibold);
                                ">
                                    ${category.count}
                                </span>
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>

            <!-- Newsletter Widget -->
            <div class="nn-widget slide-up delay-350" style="
                background: rgba(0, 240, 255, 0.05);
                border: 1px solid rgba(0, 240, 255, 0.2);
                border-radius: var(--radius-md);
                padding: var(--space-4);
            ">
                <h3 style="
                    font-size: var(--font-lg);
                    font-weight: var(--font-semibold);
                    color: #00f0ff;
                    margin-bottom: var(--space-3);
                    text-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
                ">
                    Newsletter
                </h3>
                <p style="
                    color: rgba(255, 255, 255, 0.6);
                    font-size: var(--font-sm);
                    margin-bottom: var(--space-3);
                    line-height: var(--line-relaxed);
                ">
                    Subscribe to get the latest updates.
                </p>
                <input type="email" placeholder="Your email" style="
                    width: 100%;
                    padding: var(--space-3);
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(0, 240, 255, 0.3);
                    border-radius: var(--radius-md);
                    color: rgba(255, 255, 255, 0.9);
                    font-size: var(--font-sm);
                    margin-bottom: var(--space-3);
                ">
                <button style="
                    width: 100%;
                    padding: var(--space-3);
                    background: linear-gradient(135deg, #00f0ff, #7c3aed);
                    border: none;
                    border-radius: var(--radius-md);
                    color: white;
                    font-weight: var(--font-semibold);
                    font-size: var(--font-sm);
                    cursor: pointer;
                    transition: all var(--duration-base) var(--ease-out);
                " onmouseover="
                    this.style.transform = 'translateY(-2px)';
                    this.style.boxShadow = '0 8px 30px rgba(0, 240, 255, 0.4)';
                " onmouseout="
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = 'none';
                ">
                    Subscribe
                </button>
            </div>
        </aside>
    `;
}