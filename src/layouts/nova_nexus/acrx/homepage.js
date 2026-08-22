import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";
import { hero } from "./components/hero.js";
import { grid } from "./components/grid.js";

export function homepage(params) {
    const showSidebar = 
        params.layout.sidebar.enabled && 
        params.layout.sidebar.show_on_homepage;

    const sidebarPosition = params.layout.sidebar.position || 'right';
    const sidebarWidth = params.layout.sidebar.width || '300px';

    const posts = params.posts || [
        {
            id: 1,
            title: 'Welcome to Nova Nexus',
            excerpt: 'Discover the future of web design with our cutting-edge futuristic layout.',
            image: 'https://via.placeholder.com/600x400/1a1a2e/00f0ff?text=Featured+Post',
            date: '2025-01-15',
            category: 'Technology'
        },
        {
            id: 2,
            title: 'Glassmorphism Design Trends',
            excerpt: 'Explore the latest design trends that are shaping modern web interfaces.',
            image: 'https://via.placeholder.com/600x400/1a1a2e/7c3aed?text=Design+Trends',
            date: '2025-01-14',
            category: 'Design'
        },
        {
            id: 3,
            title: 'Building with Acroxa CMS',
            excerpt: 'Learn how to leverage the power of Acroxa for your next project.',
            image: 'https://via.placeholder.com/600x400/1a1a2e/ec4899?text=Development',
            date: '2025-01-13',
            category: 'Development'
        }
    ];

    return `
        ${header(params)}
        
        ${hero(params)}

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
                
                <div class="nn-content">
                    <section class="nn-featured-section" style="
                        margin-bottom: var(--space-12);
                    ">
                        <h2 class="slide-up" style="
                            font-size: var(--font-4xl);
                            font-weight: var(--font-bold);
                            background: linear-gradient(135deg, #00f0ff, #7c3aed);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            background-clip: text;
                            margin-bottom: var(--space-8);
                            text-align: center;
                        ">
                            Featured Articles
                        </h2>

                        ${grid({ posts })}
                    </section>
                </div>

                ${sidebarPosition === 'right' && showSidebar ? sidebar(params) : ''}
            </div>
        </main>

        ${footer(params)}

        <style>
            @media (max-width: 1024px) {
                .nn-layout-wrapper {
                    grid-template-columns: 1fr !important;
                }
                .nn-sidebar {
                    order: 2;
                }
            }
        </style>

        <script>
            // Scroll reveal animation
            document.addEventListener('DOMContentLoaded', function() {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.style.opacity = '1';
                            entry.target.style.transform = 'translateY(0)';
                        }
                    });
                }, { threshold: 0.1 });

                document.querySelectorAll('.slide-up, .nn-card').forEach(el => {
                    el.style.opacity = '0';
                    el.style.transform = 'translateY(30px)';
                    el.style.transition = 'all 0.6s ease-out';
                    observer.observe(el);
                });
            });
        </script>
    `;
}