// src/layouts/zenith/acrx/footer.js
// Modern light-theme footer with nested menu support

const el = (tag, attrs = {}, ...children) => {
  let html = `<${tag}`;
  for (const [key, val] of Object.entries(attrs || {})) {
    if (key === 'class') {
      html += ` class="${val}"`;
    } else if (key !== 'children') {
      html += ` ${key}="${val}"`;
    }
  }
  html += '>';
  if (typeof children[0] === 'string') {
    html += children[0];
  } else {
    html += children.filter(Boolean).join('');
  }
  html += `</${tag}>`;
  return html;
};

const renderMenuTree = (items) => {
  if (!Array.isArray(items) || items.length === 0) return '';

  return items.map(item => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const itemIcon = item.icon ? `<i class="zen-icon fa-duotone ${item.icon}"></i>` : '';

    if (hasChildren) {
      return `
        <li class="zen-footer-item zen-footer-item--group">
          <strong class="zen-footer-group-title">${item.label || 'Untitled'}</strong>
          <ul class="zen-footer-sublist">
            ${renderMenuTree(item.children)}
          </ul>
        </li>
      `;
    }

    return `
      <li class="zen-footer-item">
        <a href="${item.url || '#'}" class="zen-footer-link">
          ${itemIcon}
          <span>${item.label || 'Untitled'}</span>
        </a>
      </li>
    `;
  }).join('');
};

export const footer = (data) => {
  const { menus = {} } = data || {};
  const footerMenu = menus.footer || null;
  const menuItems = footerMenu?.items || [];

  return `
    <footer class="zen-footer">
      <div class="zen-container">
        <div class="zen-footer-content">
          <!-- Footer Navigation / Menu -->
          <div class="zen-footer-section">
            <h3 class="zen-section-title">Navigation</h3>
            <ul class="zen-footer-list">
              ${renderMenuTree(menuItems)}
            </ul>
          </div>

          <!-- Divider -->
          <div class="zen-footer-divider"></div>

          <!-- Footer Info -->
          <div class="zen-footer-info">
            <p class="zen-footer-copyright">&copy; 2026 Your Company. All rights reserved.</p>
            <div class="zen-footer-meta">
              <a href="/privacy" class="zen-footer-meta-link">Privacy Policy</a>
              <span class="zen-footer-meta-sep">·</span>
              <a href="/terms" class="zen-footer-meta-link">Terms of Service</a>
            </div>
          </div>
        </div>
      </div>
    </footer>

    <style>
      .zen-footer {
        background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
        border-top: 1px solid #e5e7eb;
        padding: 3rem 2rem 2rem;
        margin-top: 4rem;
      }

      .zen-footer-content {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 3rem;
        align-items: start;
      }

      .zen-footer-section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .zen-section-title {
        font-size: 0.95rem;
        font-weight: 700;
        color: #1f2937;
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .zen-footer-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .zen-footer-item {
        margin: 0;
      }

      .zen-footer-item--group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .zen-footer-group-title {
        font-size: 0.85rem;
        font-weight: 600;
        color: #4b5563;
        margin: 0;
        padding-top: 0.5rem;
      }

      .zen-footer-sublist {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding-left: 1rem;
      }

      .zen-footer-link {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #4b5563;
        text-decoration: none;
        font-size: 0.9rem;
        transition: all 0.3s ease;
      }

      .zen-footer-link:hover {
        color: #0284c7;
        transform: translateX(2px);
      }

      .zen-icon {
        font-size: 0.85rem;
      }

      .zen-footer-divider {
        width: 2px;
        height: auto;
        min-height: 100px;
        background: linear-gradient(180deg, rgba(229, 231, 235, 0), #e5e7eb, rgba(229, 231, 235, 0));
      }

      .zen-footer-info {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        text-align: right;
      }

      .zen-footer-copyright {
        font-size: 0.85rem;
        color: #64748b;
        margin: 0;
      }

      .zen-footer-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
        font-size: 0.85rem;
      }

      .zen-footer-meta-link {
        color: #4b5563;
        text-decoration: none;
        transition: color 0.3s ease;
      }

      .zen-footer-meta-link:hover {
        color: #0284c7;
      }

      .zen-footer-meta-sep {
        color: #d1d5db;
      }

      @media (max-width: 768px) {
        .zen-footer {
          padding: 2rem 1rem;
          margin-top: 2rem;
        }

        .zen-footer-content {
          grid-template-columns: 1fr;
          gap: 2rem;
        }

        .zen-footer-divider {
          display: none;
        }

        .zen-footer-info {
          text-align: left;
        }

        .zen-footer-meta {
          justify-content: flex-start;
        }
      }
    </style>
  `;
};
