// src/layouts/zenith/acrx/post.js
// Modern light-theme blog post template

import { renderContent, getPlainText } from "./renderContent.js";

export const post = (data) => {
  const { title = 'Untitled Post', meta = {} } = data || {};
  const showSidebar = data?.config?.sidebar?.show_on_posts !== false;
  const author = meta.author || 'Anonymous';
  const date = meta.date || new Date().toLocaleDateString();
  const readTime = meta.readTime || '5 min read';

  // Use widget renderer for JSON content, fallback to HTML
  const content = renderContent(data);
  // Keep raw text available as fallback
  if (!content && data.contentRaw) {
    return renderPostHTML(title, author, date, readTime, data.contentRaw, showSidebar);
  }

  return `
    <div class="zen-layout zen-layout--post">
      <main class="zen-main" role="main">
        <div class="zen-post-wrapper ${showSidebar ? 'zen-post-has-sidebar' : ''}">
          <article class="zen-post">
            <header class="zen-post-header">
              <h1 class="zen-post-title">${escapeHtml(title)}</h1>
              <div class="zen-post-meta">
                <span class="zen-post-author">By <strong>${escapeHtml(author)}</strong></span>
                <span class="zen-post-separator">·</span>
                <time class="zen-post-date">${escapeHtml(date)}</time>
                <span class="zen-post-separator">·</span>
                <span class="zen-post-read-time">${escapeHtml(readTime)}</span>
              </div>
            </header>
            <div class="zen-post-content">
              ${content}
            </div>
          </article>
        </div>
      </main>
    </div>

    <style>
      .zen-post-wrapper {
        max-width: 900px;
        margin: 0 auto;
        padding: 3rem 2rem;
      }

      .zen-post-has-sidebar {
        max-width: 100%;
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 2rem;
      }

      .zen-post {
        background: white;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        padding: 2rem;
      }

      .zen-post-header {
        margin-bottom: 2rem;
        padding-bottom: 2rem;
        border-bottom: 2px solid #f3f4f6;
      }

      .zen-post-title {
        font-size: 2.75rem;
        font-weight: 800;
        color: #1f2937;
        margin: 0 0 1rem 0;
        line-height: 1.1;
      }

      .zen-post-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #64748b;
        font-size: 0.95rem;
        flex-wrap: wrap;
      }

      .zen-post-author {
        color: #4b5563;
      }

      .zen-post-separator {
        color: #cbd5e1;
      }

      .zen-post-content {
        color: #374151;
        line-height: 1.8;
        font-size: 1.05rem;
      }

      .zen-post-content h2,
      .zen-post-content h3,
      .zen-post-content h4 {
        color: #1f2937;
        margin: 2rem 0 1rem 0;
        font-weight: 700;
      }

      .zen-post-content h2 {
        font-size: 1.75rem;
        padding-top: 1rem;
        border-top: 1px solid #f3f4f6;
      }

      .zen-post-content h3 {
        font-size: 1.5rem;
      }

      .zen-post-content p {
        margin-bottom: 1rem;
      }

      .zen-post-content a {
        color: #0284c7;
        text-decoration: underline;
        transition: color 0.3s ease;
      }

      .zen-post-content a:hover {
        color: #06b6d4;
        text-decoration-thickness: 2px;
      }

      .zen-post-content ul,
      .zen-post-content ol {
        margin: 1rem 0 1rem 2rem;
      }

      .zen-post-content li {
        margin-bottom: 0.75rem;
      }

      .zen-post-content blockquote {
        margin: 2rem 0;
        padding: 1.5rem;
        border-left: 4px solid #0284c7;
        background: linear-gradient(90deg, rgba(2, 132, 199, 0.08), transparent);
        font-style: italic;
        color: #4b5563;
        font-size: 1.1rem;
      }

      .zen-post-content code {
        background: #f3f4f6;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.9em;
        color: #ef4444;
      }

      .zen-post-content pre {
        background: #1f2937;
        color: #f0f9ff;
        padding: 1.5rem;
        border-radius: 8px;
        overflow-x: auto;
        margin: 1.5rem 0;
        border: 1px solid #374151;
      }

      .zen-post-content pre code {
        background: none;
        color: inherit;
        padding: 0;
      }

      .zen-post-content img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        margin: 1.5rem 0;
      }

      @media (max-width: 1024px) {
        .zen-post-has-sidebar {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 768px) {
        .zen-post-wrapper {
          padding: 1.5rem 1rem;
        }

        .zen-post {
          padding: 1.5rem;
        }

        .zen-post-title {
          font-size: 2rem;
        }

        .zen-post-content {
          font-size: 1rem;
        }
      }
    </style>
  `;
};

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

function renderPostHTML(title, author, date, readTime, content, showSidebar) {
  return `
    <div class="zen-layout zen-layout--post">
      <main class="zen-main" role="main">
        <div class="zen-post-wrapper ${showSidebar ? 'zen-post-has-sidebar' : ''}">
          <article class="zen-post">
            <header class="zen-post-header">
              <h1 class="zen-post-title">${escapeHtml(title)}</h1>
              <div class="zen-post-meta">
                <span class="zen-post-author">By <strong>${escapeHtml(author)}</strong></span>
                <span class="zen-post-separator">·</span>
                <time class="zen-post-date">${escapeHtml(date)}</time>
                <span class="zen-post-separator">·</span>
                <span class="zen-post-read-time">${escapeHtml(readTime)}</span>
              </div>
            </header>
            <div class="zen-post-content">
              ${content}
            </div>
          </article>
        </div>
      </main>
    </div>
  `;
}
