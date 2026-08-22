/**
 * Nova Nexus Layout Initializer
 * Entry point for Acroxa CMS integration
 */

const path = require('path');
const { initializeRoutes } = require('./routes.js');

/**
 * Initialize Nova Nexus Layout
 * @param {object} acrx - Global Acroxa instance with registered functions
 */
function initialize(acrx) {

    // Inject Framework CSS Files
    const frameworkPath = path.join(__dirname, '../framework');
    const cssFiles = [
        'reset.css',
        'variables.css',
        'typography.css',
        'components.css',
        'utilities.css',
        'layout-grid.css',
        'layout-flex.css',
        'animations.css',
        'responsive.css',
        'filter-effects.css'
    ];

    cssFiles.forEach(file => {
        acrx.injectPublicAsset({
            type: 'style',
            url: `/layouts/framework/${file}`,
            location: 'head',
            plugin: 'nova_nexus'
        });
    });

    // Inject Custom Nova Nexus Styles
    acrx.injectPublicInline({
        location: 'head',
        content: `
<style>
    /* Nova Nexus Custom Styles */
    body {
        background: linear-gradient(180deg, #0a0a14 0%, #1a1a2e 100%);
        color: rgba(255, 255, 255, 0.9);
        min-height: 100vh;
    }

    /* Glassmorphism base */
    .glass {
        background: rgba(10, 10, 20, 0.7) !important;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
    }

    /* Neon glow effects */
    .neon-cyan {
        box-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
    }

    .neon-purple {
        box-shadow: 0 0 20px rgba(124, 58, 237, 0.5);
    }

    /* Smooth scrolling */
    html {
        scroll-behavior: smooth;
    }

    /* Custom scrollbar */
    ::-webkit-scrollbar {
        width: 12px;
    }

    ::-webkit-scrollbar-track {
        background: rgba(10, 10, 20, 0.5);
    }

    ::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #00f0ff, #7c3aed);
        border-radius: 6px;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, #00f0ff, #ec4899);
    }

    /* Selection color */
    ::selection {
        background: rgba(0, 240, 255, 0.3);
        color: #fff;
    }

    /* Focus outline */
    *:focus-visible {
        outline: 2px solid #00f0ff;
        outline-offset: 2px;
    }

    /* Loading animation */
    .nn-loading {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(0, 240, 255, 0.3);
        border-radius: 50%;
        border-top-color: #00f0ff;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
        `,
        plugin: 'nova_nexus'
    });

    // Inject Scroll Reveal Script
    acrx.injectPublicInline({
        location: 'body',
        content: `
<script>
    // Nova Nexus Scroll Reveal Animation
    document.addEventListener('DOMContentLoaded', function() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, { 
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        // Observe elements with animation classes
        document.querySelectorAll('.slide-up, .nn-card, .fade-in, .scale-up').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'all 0.6s ease-out';
            observer.observe(el);
        });
    });

    // Mobile menu toggle (if needed)
    function toggleMobileMenu() {
        const menu = document.querySelector('.nn-nav-menu');
        if (menu) {
            menu.classList.toggle('active');
        }
    }
</script>
        `,
        plugin: 'nova_nexus'
    });

    // Initialize public routes
    initializeRoutes(acrx);

}

module.exports = { initialize };