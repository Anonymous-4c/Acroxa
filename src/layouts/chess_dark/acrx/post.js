import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";

export function post(params) {
    const p = params.post || {};
    const showSidebar = params.layout?.sidebar?.enabled !== false
                     && params.layout?.sidebar?.show_on_posts !== false;

    const featuredImg = p.image
        ? `<img src="${p.image}" alt="${p.title}" class="post-featured-img">`
        : '';

    return `
        ${header(params)}
        <main class="site-main ${showSidebar ? '' : 'no-sidebar'}">
            <div class="main-content">
                <nav class="breadcrumb fade-up">
                    <a href="/">Home</a>
                    <span class="breadcrumb-sep">♟</span>
                    <a href="/blog">Blog</a>
                    <span class="breadcrumb-sep">♟</span>
                    <span>${p.category || 'Post'}</span>
                </nav>

                <article>
                    <header class="post-header fade-up">
                        <div class="card-meta" style="margin-bottom:1rem;">
                            <span class="card-category">${p.category || 'Uncategorized'}</span>
                            <span class="card-date">${p.date || ''}</span>
                        </div>
                        <h1 class="post-title">${p.title || ''}</h1>
                        <div class="post-meta-bar">
                            <span class="post-meta-item highlight">♟ ${p.author || 'Admin'}</span>
                            <span class="post-meta-item">${p.date || ''}</span>
                            <span class="post-meta-item">${p.read_time || 1} min read</span>
                        </div>
                    </header>

                    ${featuredImg}

                    <div class="post-content fade-up fade-up-2">
                        ${p.content || ''}
                    </div>

                    <div class="chess-divider">♛</div>

                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; padding-top:1rem;">
                        <a href="/blog" class="btn btn-secondary">← Back to Blog</a>
                        <span style="font-size:0.7rem; color:var(--chess-gold-dim); letter-spacing:0.1em;">
                            Filed under: ${p.category || 'Uncategorized'}
                        </span>
                    </div>
                </article>
            </div>

            ${showSidebar ? sidebar(params) : ''}
        </main>
        ${footer(params)}
    `;
}