import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";

export function post(params) {
    const showSidebar = 
        params.layout.sidebar.enabled && 
        params.layout.sidebar.show_on_posts;

    const sidebarPosition = params.layout.sidebar.position || 'right';
    const sidebarWidth = params.layout.sidebar.width || '300px';

    const post = params.post || {
        title: 'Sample Blog Post Title',
        date: '2025-01-15',
        author: 'Admin',
        category: 'Technology',
        image: 'https://via.placeholder.com/1200x600/1a1a2e/00f0ff?text=Blog+Post',
        content: `
            <p>This is a sample blog post demonstrating the Nova Nexus layout. The content area is designed with readability and aesthetics in mind.</p>
            <h3>Subheading Example</h3>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
            <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
        `
    };

    return `
        ${header(params)}

        <main class="nn-main" style="
            max-width: 1400px;
            margin: 0 auto;
            padding: var(--space-8) var(--space-6);
        ">
            <div class="nn-layout-wrapper" style="
                display: grid;
                grid-template-columns: ${
                    showSidebar 
                        ? (sidebarPosition === 'left' 
                            ? `${sidebarWidth} 1fr` 
                            : `1fr ${sidebarWidth}`)
                        : '1fr'
                };
                gap: var(--space-8);
            ">
                ${sidebarPosition === 'left' && showSidebar ? sidebar(params) : ''}
                
                <article class="nn-post fade-in" style="
                    background: rgba(10, 10, 20, 0.5);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(0, 240, 255, 0.2);
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                ">
                    ${post.image ? `
                        <div class="nn-post-image" style="
                            width: 100%;
                            height: 400px;
                            overflow: hidden;
                            position: relative;
                        ">
                            <img src="${post.image}" alt="${post.title}" style="
                                width: 100%;
                                height: 100%;
                                object-fit: cover;
                            ">
                            <div style="
                                position: absolute;
                                inset: 0;
                                background: linear-gradient(180deg, transparent, rgba(10, 10, 20, 0.8));
                            "></div>
                        </div>
                    ` : ''}

                    <div class="nn-post-content" style="
                        padding: var(--space-8);
                    ">
                        <div class="nn-post-meta" style="
                            display: flex;
                            gap: var(--space-4);
                            margin-bottom: var(--space-4);
                            flex-wrap: wrap;
                        ">
                            <span style="
                                padding: var(--space-2) var(--space-4);
                                background: rgba(0, 240, 255, 0.1);
                                border: 1px solid rgba(0, 240, 255, 0.3);
                                border-radius: var(--radius-full);
                                color: #00f0ff;
                                font-size: var(--font-xs);
                                font-weight: var(--font-semibold);
                                text-transform: uppercase;
                            ">
                                ${post.category}
                            </span>
                            <span style="
                                color: rgba(255, 255, 255, 0.6);
                                font-size: var(--font-sm);
                            ">
                                ${post.date}
                            </span>
                            <span style="
                                color: rgba(255, 255, 255, 0.6);
                                font-size: var(--font-sm);
                            ">
                                By ${post.author}
                            </span>
                        </div>

                        <h1 style="
                            font-size: clamp(var(--font-3xl), 5vw, var(--font-5xl));
                            font-weight: var(--font-extrabold);
                            background: linear-gradient(135deg, #00f0ff, #7c3aed);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            background-clip: text;
                            margin-bottom: var(--space-6);
                            line-height: var(--line-tight);
                        ">
                            ${post.title}
                        </h1>

                        <div class="nn-post-body" style="
                            color: rgba(255, 255, 255, 0.8);
                            line-height: var(--line-relaxed);
                            font-size: var(--font-lg);
                        ">
                            ${post.content}
                        </div>

                        <div class="nn-post-footer" style="
                            margin-top: var(--space-8);
                            padding-top: var(--space-6);
                            border-top: 1px solid rgba(0, 240, 255, 0.2);
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            flex-wrap: wrap;
                            gap: var(--space-4);
                        ">
                            <div class="nn-post-tags" style="
                                display: flex;
                                gap: var(--space-2);
                                flex-wrap: wrap;
                            ">
                                ${['JavaScript', 'Design', 'Tutorial'].map(tag => `
                                    <a href="/tag/${tag.toLowerCase()}" style="
                                        padding: var(--space-1) var(--space-3);
                                        background: rgba(124, 58, 237, 0.1);
                                        border: 1px solid rgba(124, 58, 237, 0.3);
                                        border-radius: var(--radius-full);
                                        color: #7c3aed;
                                        text-decoration: none;
                                        font-size: var(--font-xs);
                                        transition: all var(--duration-base) var(--ease-out);
                                    " onmouseover="
                                        this.style.background = 'rgba(124, 58, 237, 0.2)';
                                        this.style.boxShadow = '0 0 15px rgba(124, 58, 237, 0.3)';
                                    " onmouseout="
                                        this.style.background = 'rgba(124, 58, 237, 0.1)';
                                        this.style.boxShadow = 'none';
                                    ">
                                        #${tag}
                                    </a>
                                `).join('')}
                            </div>

                            <div class="nn-post-share" style="
                                display: flex;
                                gap: var(--space-2);
                            ">
                                ${['Share', 'Tweet', 'Save'].map(action => `
                                    <button style="
                                        padding: var(--space-2) var(--space-4);
                                        background: rgba(0, 240, 255, 0.1);
                                        border: 1px solid rgba(0, 240, 255, 0.3);
                                        border-radius: var(--radius-md);
                                        color: #00f0ff;
                                        font-size: var(--font-sm);
                                        cursor: pointer;
                                        transition: all var(--duration-base) var(--ease-out);
                                    " onmouseover="
                                        this.style.background = 'rgba(0, 240, 255, 0.2)';
                                        this.style.boxShadow = '0 0 15px rgba(0, 240, 255, 0.3)';
                                    " onmouseout="
                                        this.style.background = 'rgba(0, 240, 255, 0.1)';
                                        this.style.boxShadow = 'none';
                                    ">
                                        ${action}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </article>

                ${sidebarPosition === 'right' && showSidebar ? sidebar(params) : ''}
            </div>
        </main>

        ${footer(params)}

        <style>
            .nn-post-body p {
                margin-bottom: var(--space-4);
            }
            .nn-post-body h3 {
                color: #00f0ff;
                margin-top: var(--space-6);
                margin-bottom: var(--space-4);
                font-size: var(--font-2xl);
            }
            @media (max-width: 1024px) {
                .nn-layout-wrapper {
                    grid-template-columns: 1fr !important;
                }
            }
        </style>
    `;
}