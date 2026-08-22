// src/layouts/zenith/acrx/homepage.js
// Modern light-theme homepage

export const homepage = (data) => {
  const { title = 'Welcome', content = '', meta = {} } = data || {};

  return `
    <div class="zen-layout zen-layout--homepage">
      <main class="zen-main" role="main">
        <div class="zen-container">
          <section class="zen-hero">
            <h1 class="zen-hero-title">${title}</h1>
            <div class="zen-hero-content">
              ${content}
            </div>
          </section>
        </div>
      </main>
    </div>

    <style>
      .zen-layout {
        display: flex;
        flex-direction: column;
        min-height: calc(100vh - 200px);
      }

      .zen-main {
        flex: 1;
        padding: 4rem 2rem;
      }

      .zen-hero {
        text-align: center;
        padding: 2rem 0;
      }

      .zen-hero-title {
        font-size: 3rem;
        font-weight: 800;
        color: #1f2937;
        margin: 0 0 1rem 0;
        background: linear-gradient(135deg, #0284c7, #06b6d4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .zen-hero-content {
        font-size: 1.1rem;
        color: #4b5563;
        max-width: 800px;
        margin: 0 auto;
        line-height: 1.8;
      }

      @media (max-width: 768px) {
        .zen-main {
          padding: 2rem 1rem;
        }

        .zen-hero-title {
          font-size: 2rem;
        }

        .zen-hero-content {
          font-size: 1rem;
        }
      }
    </style>
  `;
};
