import { header } from "./header.js";
import { footer } from "./footer.js";
import { sidebar } from "./sidebar.js";

export function page(params) {
    const pg = params.page || {};
    const showSidebar = params.layout?.sidebar?.enabled !== false
                     && params.layout?.sidebar?.show_on_pages !== false;

    const featuredImg = pg.image
        ? `<img src="${pg.image}" alt="${pg.title}" class="post-featured-img">`
        : '';

    return `
        ${header(params)}
        <main class="site-main ${showSidebar ? '' : 'no-sidebar'}">
            <div class="main-content">
                <nav class="breadcrumb fade-up">
                    <a href="/">Home</a>
                    <span class="breadcrumb-sep">♟</span>
                    <span>${pg.title || 'Page'}</span>
                </nav>

                <article>
                    <header class="page-header fade-up">
                        <h1 class="page-title">${pg.title || ''}</h1>
                    </header>

                    ${featuredImg}

                    <div class="page-content fade-up fade-up-1">
                        ${pg.content || ''}
                    </div>

                    <div class="chess-divider">♛</div>

                    <a href="/" class="btn btn-secondary">← Home</a>
                </article>
            </div>

            ${showSidebar ? sidebar(params) : ''}
        </main>
        ${footer(params)}
    `;
}