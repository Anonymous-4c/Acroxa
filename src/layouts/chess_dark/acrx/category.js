import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";

function postCard(post, index) {
    const imgContent = post.image
        ? `<img src="${post.image}" alt="${post.title}" loading="lazy">`
        : `<div class="card-img-placeholder">♟</div>`;

    const delay = Math.min(index + 1, 4);
    return `
        <a href="/post/${post.slug}" class="post-card fade-up fade-up-${delay}">
            <div class="card-img">${imgContent}</div>
            <div class="card-meta">
                <span class="card-category">${post.category || 'Uncategorized'}</span>
                <span class="card-date">${post.date || ''}</span>
            </div>
            <div class="card-title">${post.title}</div>
            <div class="card-excerpt">${post.excerpt || ''}</div>
            <div class="card-footer">
                <span class="card-author">By ${post.author || 'Admin'}</span>
                <span class="card-read-time">${post.read_time || 1} min read</span>
            </div>
        </a>
    `;
}

export function category(params) {
    const posts = params.posts || [];
    const hero  = params.hero  || {};
    const showSidebar = params.layout?.sidebar?.enabled !== false;

    const postsHTML = posts.length
        ? posts.map((post, i) => postCard(post, i)).join('')
        : `<div style="padding:3rem; color:var(--chess-cream); opacity:0.4; text-align:center; grid-column:1/-1; font-family:var(--font-display); font-style:italic;">No posts in this category yet.</div>`;

    return `
        ${header(params)}
        <main class="site-main">
            <div class="main-content">
                <nav class="breadcrumb fade-up">
                    <a href="/">Home</a>
                    <span class="breadcrumb-sep">♟</span>
                    <a href="/blog">Blog</a>
                    <span class="breadcrumb-sep">♟</span>
                    <span>${params.page_title || 'Category'}</span>
                </nav>

                <header class="category-header fade-up">
                    <div class="category-badge">Category</div>
                    <h1 class="category-title">${hero.title || params.page_title || 'Posts'}</h1>
                    <p style="color:var(--chess-cream); opacity:0.55; font-size:0.9rem;">
                        ${hero.subtitle || ''}
                    </p>
                </header>

                <div class="section-header">
                    <div class="section-title">${posts.length} Post${posts.length !== 1 ? 's' : ''}</div>
                    <a href="/blog" class="section-link">All posts →</a>
                </div>

                <div class="posts-grid">
                    ${postsHTML}
                </div>
            </div>

            ${showSidebar ? sidebar(params) : ''}
        </main>
        ${footer(params)}
    `;
}