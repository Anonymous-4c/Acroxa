// src/layouts/zenith/acrx/sidebar.js
// Modern light-theme sidebar with widget areas

export const sidebar = (data) => {
  const { widgets = {}, config = {} } = data || {};
  const sidebarWidgets = widgets['sidebar'] || [];

  return `
    <aside class="zen-sidebar" role="complementary">
      <div class="zen-sidebar-inner">
        ${sidebarWidgets.map(w => `
          <div class="zen-widget">
            ${w.rendered || ''}
          </div>
        `).join('')}
      </div>
    </aside>

    <style>
      .zen-sidebar {
        flex: 0 0 320px;
        background: rgba(255, 255, 255, 0.5);
        border-left: 1px solid #e5e7eb;
        padding: 2rem;
        position: sticky;
        top: 120px;
        height: fit-content;
        max-height: calc(100vh - 140px);
        overflow-y: auto;
      }

      .zen-sidebar-inner {
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .zen-widget {
        padding: 1.5rem;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        transition: all 0.3s ease;
      }

      .zen-widget:hover {
        border-color: #bfdbfe;
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.05);
      }

      .zen-widget h3,
      .zen-widget h4 {
        margin-top: 0;
        font-size: 1rem;
        color: #1f2937;
      }

      .zen-widget p {
        margin: 0.5rem 0 0 0;
        color: #4b5563;
        font-size: 0.9rem;
      }

      .zen-widget ul,
      .zen-widget ol {
        margin: 0.5rem 0 0 0;
        padding-left: 1.5rem;
      }

      .zen-widget li {
        color: #4b5563;
        font-size: 0.9rem;
        margin-bottom: 0.5rem;
      }

      .zen-widget a {
        color: #0284c7;
        text-decoration: none;
        transition: color 0.3s ease;
      }

      .zen-widget a:hover {
        color: #06b6d4;
      }

      @media (max-width: 1024px) {
        .zen-sidebar {
          flex: 0 0 280px;
          padding: 1.5rem;
        }
      }

      @media (max-width: 768px) {
        .zen-sidebar {
          display: none;
        }
      }
    </style>
  `;
};
