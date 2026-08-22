import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";

function postCard(post, index) {
    const imgContent = post.image
        ? `<img src="${post.image}" alt="${post.title}" loading="lazy">`
        : `<div class="card-img-placeholder">♟</div>`;

    if (index === 0) {
        // Featured card — full width
        return `
            <a href="/post/${post.slug}" class="post-card post-card-featured fade-up fade-up-1">
                <div class="card-img">${imgContent}</div>
                <div style="flex:1; display:flex; flex-direction:column;">
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
                </div>
            </a>
        `;
    }

    const delay = Math.min(index, 4);
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

export function homepage(params) {
    const hero = params.hero || {};
    const posts = params.posts || [];
    const showSidebar = params.layout?.sidebar?.enabled !== false;

    const postsHTML = posts.length
        ? posts.map((post, i) => postCard(post, i)).join('')
        : `<div style="padding:3rem; color:var(--chess-cream); opacity:0.4; text-align:center; grid-column:1/-1; font-family:var(--font-display); font-style:italic;">No posts yet. The board awaits its first move.</div>`;

    return `
        ${header(params)}
        <main class="site-main">
            <div class="main-content">
                <div class="hero-block fade-up">
                    <div class="hero-label">Welcome</div>
                    <h1 class="hero-title">${hero.title || params.site_title || 'Chess Dark'}</h1>
                    <p class="hero-sub">${hero.subtitle || params.site_description || ''}</p>
                    <div class="hero-ctas">
                        ${hero.cta_primary ? `<a href="${hero.cta_primary.url}" class="btn btn-primary">${hero.cta_primary.text}</a>` : ''}
                        ${hero.cta_secondary ? `<a href="${hero.cta_secondary.url}" class="btn btn-secondary">${hero.cta_secondary.text}</a>` : ''}
                    </div>
                </div>

                <div class="section-header">
                    <div class="section-title">Latest Posts</div>
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