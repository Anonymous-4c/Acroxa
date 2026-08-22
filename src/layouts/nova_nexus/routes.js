/**
 * Nova Nexus Public Routes
 * Registers all public-facing routes for posts, pages, and categories
 */

const { render } = require('./main.js');
const {
    getPublishedPosts,
    getPostBySlug,
    getRecentPosts,
    getCategories,
    getPostsByCategory,
    getPageBySlug,
    formatPostForTemplate,
    formatPageForTemplate
} = require('./data-loader.js');

/**
 * Initialize Nova Nexus routes
 * @param {object} acrx - Global Acroxa instance
 */
function initializeRoutes(acrx) {
    const { registerPublicRoute ,publicRegistered } = require('../../core/publicAPI.js');

    // Default layout configuration
    const defaultLayoutConfig = {
        sidebar: {
            enabled: true,
            position: 'right',
            width: '300px',
            show_on_homepage: true,
            show_on_pages: true,
            show_on_posts: true
        }
    };

    /**
     * Helper: Build base params
     */
    async function getBaseParams() {
        const recent_posts = await getRecentPosts(5);
        const categories = await getCategories();

        return {
            site_title: acrx.config?.site_title || 'Nova Nexus',
            site_description: acrx.config?.site_description || 'Powered by Acroxa CMS',
            menu: acrx.config?.menu || [
                { label: 'Home', url: '/' },
                { label: 'Blog', url: '/blog' },
                { label: 'About', url: '/about' },
                { label: 'Contact', url: '/contact' }
            ],
            recent_posts,
            categories,
            layout: defaultLayoutConfig
        };
    }

    /**
     * Helper: Render complete HTML with injected assets
     */
    function renderHTML(content, params) {
        // Get injected assets from registered public inject
        const headAssets = (acrx.registered?.publicInject || [])
            .filter(asset => asset.location === 'head')
            .map(asset => {
                if (asset.type === 'inline') {
                    return asset.content;
                } else if (asset.type === 'script') {
                    return `<script src="${asset.url}"></script>`;
                } else if (asset.type === 'style') {
                    return `<link rel="stylesheet" href="${asset.url}">`;
                }
                return '';
            })
            .join('\n    ');

        const bodyAssets = (acrx.registered?.publicInject || [])
            .filter(asset => asset.location === 'body')
            .map(asset => {
                if (asset.type === 'inline') {
                    return asset.content;
                } else if (asset.type === 'script') {
                    return `<script src="${asset.url}"></script>`;
                }
                return '';
            })
            .join('\n    ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${params.site_description || ''}">
    <title>${params.page_title || params.site_title || 'Nova Nexus'}</title>
    ${headAssets}
</head>
<body>
    ${content}
    ${bodyAssets}
</body>
</html>`;
    }

    // ============================================
    // Homepage Route
    // ============================================
    registerPublicRoute({
        path: '/',
        method: 'get',
        handler: async (req, res) => {
            try {
                const baseParams = await getBaseParams();
                const posts = await getPublishedPosts(9);

                const params = {
                    ...baseParams,
                    page_title: baseParams.site_title,
                    hero: {
                        title: 'Welcome to Nova Nexus',
                        subtitle: 'Experience the future of web design with cutting-edge glassmorphism and neon aesthetics.',
                        cta_primary: { text: 'Explore Posts', url: '/blog' },
                        cta_secondary: { text: 'Learn More', url: '/about' }
                    },
                    posts: posts.map(formatPostForTemplate)
                };

                const content = render('homepage', params);
                const html = renderHTML(content, params);
                res.send(html);
            } catch (err) {
                console.error("❌ Nova Nexus homepage error:", err);
                res.status(500).send("Error loading homepage");
            }
        },
        plugin: 'nova_nexus'
    });

    // ============================================
    // Blog Archive Route
    // ============================================
    registerPublicRoute({
        path: '/blog',
        method: 'get',
        handler: async (req, res) => {
            try {
                const baseParams = await getBaseParams();
                const posts = await getPublishedPosts();

                const params = {
                    ...baseParams,
                    page_title: `Blog - ${baseParams.site_title}`,
                    hero: {
                        title: 'Blog',
                        subtitle: 'Read our latest articles and insights.',
                        cta_primary: { text: 'Home', url: '/' },
                        cta_secondary: { text: 'Categories', url: '/categories' }
                    },
                    posts: posts.map(formatPostForTemplate)
                };

                const content = render('homepage', params);
                const html = renderHTML(content, params);
                res.send(html);
            } catch (err) {
                console.error("❌ Nova Nexus blog error:", err);
                res.status(500).send("Error loading blog");
            }
        },
        plugin: 'nova_nexus'
    });

    // ============================================
    // Single Post Route
    // ============================================
    registerPublicRoute({
        path: '/post/:slug',
        method: 'get',
        handler: async (req, res) => {
            try {
                const { slug } = req.params;
                const baseParams = await getBaseParams();
                const post = await getPostBySlug(slug);

                if (!post) {
                    return res.status(404).send(render404(baseParams));
                }

                const params = {
                    ...baseParams,
                    page_title: `${post.title} - ${baseParams.site_title}`,
                    post: formatPostForTemplate(post)
                };

                const content = render('post', params);
                const html = renderHTML(content, params);
                res.send(html);
            } catch (err) {
                console.error("❌ Nova Nexus post error:", err);
                res.status(500).send("Error loading post");
            }
        },
        plugin: 'nova_nexus'
    });

    // ============================================
    // Category Archive Route
    // ============================================
    registerPublicRoute({
        path: '/category/:slug',
        method: 'get',
        handler: async (req, res) => {
            try {
                const { slug } = req.params;
                const baseParams = await getBaseParams();
                const posts = await getPostsByCategory(slug);

                const category = baseParams.categories.find(cat => cat.slug === slug);
                const categoryName = category?.name || slug;

                const params = {
                    ...baseParams,
                    page_title: `${categoryName} - ${baseParams.site_title}`,
                    hero: {
                        title: categoryName,
                        subtitle: `Browse all posts in ${categoryName}`,
                        cta_primary: { text: 'All Posts', url: '/blog' },
                        cta_secondary: { text: 'Home', url: '/' }
                    },
                    posts: posts.map(formatPostForTemplate)
                };

                const content = render('homepage', params);
                const html = renderHTML(content, params);
                res.send(html);
            } catch (err) {
                console.error("❌ Nova Nexus category error:", err);
                res.status(500).send("Error loading category");
            }
        },
        plugin: 'nova_nexus'
    });

    // ============================================
    // Page Route
    // ============================================
    registerPublicRoute({
        path: '/page/:slug',
        method: 'get',
        handler: async (req, res) => {
            try {
                const { slug } = req.params;
                const baseParams = await getBaseParams();
                const page = await getPageBySlug(slug);

                if (!page) {
                    return res.status(404).send(render404(baseParams));
                }

                const params = {
                    ...baseParams,
                    page_title: `${page.title} - ${baseParams.site_title}`,
                    page: formatPageForTemplate(page)
                };

                const content = render('page', params);
                const html = renderHTML(content, params);
                res.send(html);
            } catch (err) {
                console.error("❌ Nova Nexus page error:", err);
                res.status(500).send("Error loading page");
            }
        },
        plugin: 'nova_nexus'
    });

    // ============================================
    // Common Pages (About, Contact, etc.)
    // ============================================
    const commonPages = ['about', 'contact', 'privacy', 'terms'];
    
    commonPages.forEach(pageName => {
        registerPublicRoute({
            path: `/${pageName}`,
            method: 'get',
            handler: async (req, res) => {
                try {
                    const baseParams = await getBaseParams();
                    const page = await getPageBySlug(pageName);

                    if (page) {
                        const params = {
                            ...baseParams,
                            page_title: `${page.title} - ${baseParams.site_title}`,
                            page: formatPageForTemplate(page)
                        };
                        const content = render('page', params);
                        const html = renderHTML(content, params);
                        res.send(html);
                    } else {
                        res.status(404).send(render404(baseParams));
                    }
                } catch (err) {
                    console.error(`❌ Nova Nexus ${pageName} error:`, err);
                    res.status(500).send(`Error loading ${pageName}`);
                }
            },
            plugin: 'nova_nexus'
        });
    });

    // ============================================
    // 404 Handler
    // ============================================
    function render404(baseParams) {
        const params = {
            ...baseParams,
            page_title: '404 - Page Not Found'
        };
        const content = render('404', params);
        return renderHTML(content, params);
    }

    console.log("✅ Nova Nexus routes initialized");
}

module.exports = { initializeRoutes };