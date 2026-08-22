// src/layouts/zenith/acrx/page.js
// Modern light-theme page template

export const page = (data) => {
  const { title = 'Untitled Page', content = '', meta = {} } = data || {};
  const showSidebar = data?.config?.sidebar?.show_on_pages !== false;

  return `
    <div class="zen-layout zen-layout--page">
      <main class="zen-main" role="main">
        <div class="zen-page-wrapper ${showSidebar ? 'zen-page-has-sidebar' : ''}">
          <article class="zen-article">
            <header class="zen-article-header">
              <h1 class="zen-article-title">${title}</h1>
              ${meta.date ? `<time class="zen-article-date">${meta.date}</time>` : ''}
            </header>
            <div class="zen-article-content">
              ${content}
            </div>
          </article>
        </div>
      </main>
    </div>

    <style>
      .zen-page-wrapper {
        max-width: 900px;
        margin: 0 auto;
        padding: 3rem 2rem;
      }

      .zen-page-has-sidebar {
        max-width: 100%;
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 2rem;
      }

      .zen-article {
        background: white;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        padding: 2rem;
      }

      .zen-article-header {
        margin-bottom: 2rem;
        padding-bottom: 2rem;
        border-bottom: 2px solid #f3f4f6;
      }

      .zen-article-title {
        font-size: 2.5rem;
        font-weight: 800;
        color: #1f2937;
        margin: 0 0 0.5rem 0;
        line-height: 1.2;
      }

      .zen-article-date {
        color: #64748b;
        font-size: 0.95rem;
      }

      .zen-article-content {
        color: #374151;
        line-height: 1.8;
        font-size: 1.05rem;
      }

      .zen-article-content h2,
      .zen-article-content h3,
      .zen-article-content h4 {
        color: #1f2937;
        margin: 1.5rem 0 0.75rem 0;
        font-weight: 700;
      }

      .zen-article-content h2 {
        font-size: 1.75rem;
      }

      .zen-article-content h3 {
        font-size: 1.5rem;
      }

      .zen-article-content p {
        margin-bottom: 1rem;
      }

      .zen-article-content a {
        color: #0284c7;
        text-decoration: underline;
        transition: color 0.3s ease;
      }

      .zen-article-content a:hover {
        color: #06b6d4;
      }

      .zen-article-content ul,
      .zen-article-content ol {
        margin: 1rem 0 1rem 2rem;
      }

      .zen-article-content li {
        margin-bottom: 0.5rem;
      }

      .zen-article-content blockquote {
        margin: 1.5rem 0;
        padding: 1rem 1.5rem;
        border-left: 4px solid #0284c7;
        background: rgba(2, 132, 199, 0.05);
        font-style: italic;
        color: #4b5563;
      }

      .zen-article-content code {
        background: #f3f4f6;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.9em;
        color: #ef4444;
      }

      .zen-article-content pre {
        background: #1f2937;
        color: #f0f9ff;
        padding: 1rem;
        border-radius: 8px;
        overflow-x: auto;
        margin: 1rem 0;
      }

      .zen-article-content pre code {
        background: none;
        color: inherit;
        padding: 0;
      }

      @media (max-width: 1024px) {
        .zen-page-has-sidebar {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 768px) {
        .zen-page-wrapper {
          padding: 1.5rem 1rem;
        }

        .zen-article {
          padding: 1.5rem;
        }

        .zen-article-title {
          font-size: 1.75rem;
        }

        .zen-article-content {
          font-size: 1rem;
        }
      }
    </style>
  `;
};
