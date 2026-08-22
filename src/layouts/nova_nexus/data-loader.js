/**
 * Nova Nexus Data Loader
 * Fetches posts, pages, and categories from database
 */

const { connectDB, getDbType } = require("../core/connect-db");

// Helper to get models
async function getModels() {
    try {
        const models = await connectDB();
        
        if (!models || !models.Post || !models.Page || !models.Category) {
            throw new Error("Models not available");
        }
        
        return models;
    } catch (err) {
        console.warn("⚠️ Nova Nexus: Could not load models", err.message);
        throw err;
    }
}

/**
 * Get all published posts with author and categories
 */
async function getPublishedPosts(limit = null) {
    try {
        const models = await getModels();
        const Post = models.Post;
        const dbType = getDbType();
        const isMongo = dbType === "mongodb";
        
        let posts;

        if (!isMongo) {
            // Sequelize
            const query = {
                where: { status: 'published' },
                order: [['publishDate', 'DESC']]
            };
            if (limit) query.limit = limit;
            posts = await Post.findAll(query);
        } else {
            // MongoDB
            let query = Post.find({ status: 'published' })
                .populate({ path: 'author', select: 'username email', strictPopulate: false })
                .populate({ path: 'categories', select: 'name slug color', strictPopulate: false })
                .sort({ publishDate: -1 });
            
            if (limit) query = query.limit(limit);
            posts = await query.lean();
        }

        return posts || [];
    } catch (err) {
        console.error("❌ Nova Nexus: Error fetching posts:", err.message);
        return [];
    }
}

/**
 * Get single post by slug
 */
async function getPostBySlug(slug) {
    try {
        const models = await getModels();
        const Post = models.Post;
        const dbType = getDbType();
        const isMongo = dbType === "mongodb";
        
        let post;

        if (!isMongo) {
            // Sequelize
            post = await Post.findOne({ where: { slug, status: 'published' } });
        } else {
            // MongoDB
            post = await Post.findOne({ slug, status: 'published' })
                .populate({ path: 'author', select: 'username email', strictPopulate: false })
                .populate({ path: 'categories', select: 'name slug color', strictPopulate: false })
                .lean();
        }

        return post;
    } catch (err) {
        console.error("❌ Nova Nexus: Error fetching post:", err.message);
        return null;
    }
}

/**
 * Get recent posts for sidebar
 */
async function getRecentPosts(limit = 3) {
    try {
        const posts = await getPublishedPosts(limit);
        return posts.map(post => ({
            title: post.title,
            url: `/post/${post.slug}`
        }));
    } catch (err) {
        console.error("❌ Nova Nexus: Error fetching recent posts:", err.message);
        return [];
    }
}

/**
 * Get all categories with post count
 */
async function getCategories() {
    try {
        const models = await getModels();
        const Category = models.Category;
        const Post = models.Post;
        const dbType = getDbType();
        const isMongo = dbType === "mongodb";
        
        let categories;

        if (!isMongo) {
            // Sequelize
            categories = await Category.findAll({ order: [['name', 'ASC']] });
        } else {
            // MongoDB
            categories = await Category.find().sort({ name: 1 }).lean();
        }

        // Get post count for each category
        const categoriesWithCount = await Promise.all(
            categories.map(async (cat) => {
                const categoryId = cat._id || cat.id;
                let count;
                
                if (!isMongo) {
                    // Sequelize - depends on how categories are stored
                    // If using many-to-many junction table
                    count = await Post.count({ 
                        include: [{
                            model: Category,
                            where: { id: categoryId },
                            required: true
                        }],
                        where: { status: 'published' }
                    });
                } else {
                    // MongoDB
                    count = await Post.countDocuments({ 
                        categories: categoryId, 
                        status: 'published' 
                    });
                }

                return {
                    name: cat.name,
                    slug: cat.slug,
                    color: cat.color,
                    count: count
                };
            })
        );

        return categoriesWithCount;
    } catch (err) {
        console.error("❌ Nova Nexus: Error fetching categories:", err.message);
        return [];
    }
}

/**
 * Get posts by category slug
 */
async function getPostsByCategory(categorySlug, limit = null) {
    try {
        const models = await getModels();
        const Category = models.Category;
        const Post = models.Post;
        const dbType = getDbType();
        const isMongo = dbType === "mongodb";
        
        let category;
        
        if (!isMongo) {
            // Sequelize
            category = await Category.findOne({ where: { slug: categorySlug } });
        } else {
            // MongoDB
            category = await Category.findOne({ slug: categorySlug }).lean();
        }

        if (!category) return [];

        let posts;
        const categoryId = category._id || category.id;

        if (!isMongo) {
            // Sequelize
            const query = {
                include: [{
                    model: Category,
                    where: { id: categoryId },
                    required: true
                }],
                where: { status: 'published' },
                order: [['publishDate', 'DESC']]
            };
            if (limit) query.limit = limit;
            posts = await Post.findAll(query);
        } else {
            // MongoDB
            let query = Post.find({ 
                status: 'published',
                categories: categoryId 
            })
                .populate({ path: 'author', select: 'username email', strictPopulate: false })
                .populate({ path: 'categories', select: 'name slug color', strictPopulate: false })
                .sort({ publishDate: -1 });
            
            if (limit) query = query.limit(limit);
            posts = await query.lean();
        }

        return posts || [];
    } catch (err) {
        console.error("❌ Nova Nexus: Error fetching posts by category:", err.message);
        return [];
    }
}

/**
 * Get all published pages
 */
async function getPublishedPages() {
    try {
        const models = await getModels();
        const Page = models.Page;
        const dbType = getDbType();
        const isMongo = dbType === "mongodb";
        
        let pages;

        if (!isMongo) {
            // Sequelize
            pages = await Page.findAll({
                where: { status: 'Published' },
                order: [['publishDate', 'DESC']]
            });
        } else {
            // MongoDB
            pages = await Page.find({ status: 'Published' })
                .populate({ path: 'author', select: 'username email', strictPopulate: false })
                .sort({ publishDate: -1 })
                .lean();
        }

        return pages || [];
    } catch (err) {
        console.error("❌ Nova Nexus: Error fetching pages:", err.message);
        return [];
    }
}

/**
 * Get single page by slug
 */
async function getPageBySlug(slug) {
    try {
        const models = await getModels();
        const Page = models.Page;
        const dbType = getDbType();
        const isMongo = dbType === "mongodb";
        
        let page;

        if (!isMongo) {
            // Sequelize
            page = await Page.findOne({ where: { slug, status: 'Published' } });
        } else {
            // MongoDB
            page = await Page.findOne({ slug, status: 'Published' })
                .populate({ path: 'author', select: 'username email', strictPopulate: false })
                .lean();
        }

        return page;
    } catch (err) {
        console.error("❌ Nova Nexus: Error fetching page:", err.message);
        return null;
    }
}

/**
 * Format post data for Nova Nexus template
 */
function formatPostForTemplate(post) {
    if (!post) return null;

    return {
        id: post.id || post._id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt || '',
        content: post.content,
        image: post.featuredImage || '',
        date: formatDate(post.publishDate),
        category: post.categories?.[0]?.name || 'Uncategorized',
        author: post.author?.username || 'Admin',
        read_time: calculateReadTime(post.content)
    };
}

/**
 * Format page data for Nova Nexus template
 */
function formatPageForTemplate(page) {
    if (!page) return null;

    return {
        title: page.title,
        content: page.content,
        image: page.featuredImage || ''
    };
}

/**
 * Format date to readable string
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

/**
 * Calculate reading time
 */
function calculateReadTime(content) {
    if (!content) return 1;
    const words = content.split(/\s+/).length;
    const minutes = Math.ceil(words / 200);
    return minutes;
}

module.exports = {
    getPublishedPosts,
    getPostBySlug,
    getRecentPosts,
    getCategories,
    getPostsByCategory,
    getPublishedPages,
    getPageBySlug,
    formatPostForTemplate,
    formatPageForTemplate
};