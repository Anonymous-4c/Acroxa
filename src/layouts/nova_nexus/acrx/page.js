import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";

export function page(params) {
    const showSidebar = 
        params.layout.sidebar.enabled && 
        params.layout.sidebar.show_on_pages;

    const sidebarPosition = params.layout.sidebar.position || 'right';
    const sidebarWidth = params.layout.sidebar.width || '300px';

    const page = params.page || {
        title: 'Sample Page',
        content: `
            <p>This is a sample page demonstrating the Nova Nexus layout for static pages.</p>
            <h3>About This Page</h3>
            <p>Pages are perfect for static content like About, Contact, Privacy Policy, and Terms of Service.</p>
            <p>The Nova Nexus layout provides a clean, futuristic design that makes your content stand out.</p>
        `
    };

    return `
        ${header(params)}

        <main class="nn-main" style="
            max-width: 1400px;
            margin: 0 auto;
            padding: var(--space-8) var(--space-6);
            min-height: 60vh;
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
                
                <div class="nn-page fade-in" style="
                    background: rgba(10, 10, 20, 0.5);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(0, 240, 255, 0.2);
                    border-radius: var(--radius-lg);
                    padding: var(--space-8);
                ">
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
                        ${page.title}
                    </h1>

                    <div class="nn-page-content" style="
                        color: rgba(255, 255, 255, 0.8);
                        line-height: var(--line-relaxed);
                        font-size: var(--font-lg);
                    ">
                        ${page.content}
                    </div>
                </div>

                ${sidebarPosition === 'right' && showSidebar ? sidebar(params) : ''}
            </div>
        </main>

        ${footer(params)}

        <style>
            .nn-page-content p {
                margin-bottom: var(--space-4);
            }
            .nn-page-content h3 {
                color: #00f0ff;
                margin-top: var(--space-6);
                margin-bottom: var(--space-4);
                font-size: var(--font-2xl);
                text-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
            }
            @media (max-width: 1024px) {
                .nn-layout-wrapper {
                    grid-template-columns: 1fr !important;
                }
            }
        </style>
    `;
}