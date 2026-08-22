// src/layouts/zenith/acrx/404.js
// Modern light-theme 404 error page

export const error404 = (data) => {
  return `
    <div class="zen-layout zen-layout--error">
      <main class="zen-main zen-main--error" role="main">
        <div class="zen-error-container">
          <div class="zen-error-code">404</div>
          <h1 class="zen-error-title">Page Not Found</h1>
          <p class="zen-error-description">
            Oops! The page you're looking for doesn't exist or has been moved.
          </p>
          <div class="zen-error-actions">
            <a href="/" class="zen-btn zen-btn--primary">Back to Home</a>
            <a href="/search" class="zen-btn zen-btn--secondary">Search</a>
          </div>
        </div>
      </main>
    </div>

    <style>
      .zen-layout--error {
        display: flex;
        flex-direction: column;
        min-height: calc(100vh - 200px);
      }

      .zen-main--error {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4rem 2rem;
      }

      .zen-error-container {
        text-align: center;
        max-width: 600px;
      }

      .zen-error-code {
        font-size: 8rem;
        font-weight: 800;
        background: linear-gradient(135deg, #0284c7, #06b6d4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1;
        margin-bottom: 1rem;
      }

      .zen-error-title {
        font-size: 2.5rem;
        font-weight: 800;
        color: #1f2937;
        margin: 0 0 1rem 0;
      }

      .zen-error-description {
        font-size: 1.1rem;
        color: #4b5563;
        margin: 0 0 2rem 0;
        line-height: 1.6;
      }

      .zen-error-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
      }

      .zen-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: 600;
        text-decoration: none;
        transition: all 0.3s ease;
        border: none;
        cursor: pointer;
        font-size: 1rem;
      }

      .zen-btn--primary {
        background: linear-gradient(135deg, #0284c7, #06b6d4);
        color: white;
      }

      .zen-btn--primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 16px rgba(2, 132, 199, 0.3);
      }

      .zen-btn--secondary {
        background: white;
        color: #0284c7;
        border: 2px solid #0284c7;
      }

      .zen-btn--secondary:hover {
        background: rgba(2, 132, 199, 0.08);
      }

      @media (max-width: 768px) {
        .zen-error-code {
          font-size: 5rem;
        }

        .zen-error-title {
          font-size: 1.75rem;
        }

        .zen-error-description {
          font-size: 1rem;
        }

        .zen-error-actions {
          gap: 0.75rem;
        }

        .zen-btn {
          padding: 0.625rem 1.25rem;
          font-size: 0.95rem;
          flex: 1;
        }

        .zen-main--error {
          padding: 2rem 1rem;
        }
      }
    </style>
  `;
};
