/* ../src/views/setupSuccess.js */
'use strict';

const {
  el, icon,
  div, span, p, h1, h2, h3, strong,
  Input,
} = require('./lib/framework');

function SetupSuccessPage({ controlKey, controlUrl, siteName, username }) {
  return '<!DOCTYPE html>' + el('html', { lang: 'en' },
    el('head', {},
      el('meta', { charset: 'UTF-8' }),
      el('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
      el('title', {}, 'Acroxa CMS — Setup Complete'),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/root.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/ad-c.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/ad-ds.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/ad-regf.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/all.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/setup.css' }),
      el('link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }),
      el('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }),
      el('link', { href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap', rel: 'stylesheet' }),
      el('link', { id: 'favicon', rel: 'icon', type: 'image/svg+xml', href: '/acrx/assets/images/icon.svg' }),
      el('style', {}, `
        .success-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-primary-100);
          font-family: 'Outfit', system-ui, sans-serif;
          padding: 2rem;
        }
        .success-card {
          max-width: 520px;
          width: 100%;
          background: linear-gradient(135deg, var(--accent-100) 0%, var(--color-primary-200) 100%);
          border-radius: 24px;
          padding: 3rem 2.5rem;
          text-align: center;
          border: 1px solid var(--color-primary-300);
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        .success-icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 1.5rem;
          background: var(--accent-500);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          color: #fff;
          animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .success-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--color-primary-800);
          margin-bottom: 0.5rem;
        }
        .success-subtitle {
          font-size: 1rem;
          color: var(--color-primary-600);
          margin-bottom: 2rem;
          line-height: 1.5;
        }
        .control-box {
          background: rgba(0,0,0,0.15);
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          text-align: left;
        }
        .control-label {
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--color-primary-500);
          margin-bottom: 0.5rem;
        }
        .control-key-display {
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 0.85rem;
          word-break: break-all;
          background: rgba(0,0,0,0.2);
          border-radius: 8px;
          padding: 0.75rem;
          color: var(--accent-700);
          margin-bottom: 0.75rem;
          position: relative;
          line-height: 1.5;
        }
        .copy-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: var(--accent-500);
          border: none;
          border-radius: 6px;
          padding: 4px 10px;
          color: #fff;
          font-size: 0.7rem;
          cursor: pointer;
          font-weight: 600;
        }
        .copy-btn:hover { opacity: 0.85; }
        .control-hint {
          font-size: 0.78rem;
          color: var(--color-primary-500);
          opacity: 0.7;
          line-height: 1.4;
        }
        .success-actions {
          display: flex;
          gap: 12px;
          margin-top: 1.5rem;
        }
        .success-btn {
          flex: 1;
          padding: 0.85rem 1.5rem;
          border: none;
          border-radius: 48px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
        }
        .success-btn-primary {
          background: var(--accent-500);
          color: #fff;
        }
        .success-btn-primary:hover {
          background: var(--accent-600);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .success-btn-secondary {
          background: transparent;
          border: 1.5px solid var(--color-primary-400);
          color: var(--color-primary-700);
        }
        .success-btn-secondary:hover {
          background: var(--color-primary-300);
        }
        .success-footer {
          margin-top: 2rem;
          font-size: 0.75rem;
          color: var(--color-primary-500);
          opacity: 0.5;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 1.5rem;
          text-align: left;
        }
        .info-item {
          background: rgba(0,0,0,0.08);
          border-radius: 10px;
          padding: 0.75rem;
        }
        .info-item-label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--color-primary-500);
          margin-bottom: 4px;
        }
        .info-item-value {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--color-primary-800);
        }
      `)
    ),
    el('body', {},
      div({ class: 'success-wrap' },
        div({ class: 'success-card' },
          div({ class: 'success-icon' },
            el('i', { class: 'fa-solid fa-check' })
          ),
          h1({ class: 'success-title' }, 'Account Created!'),
          p({ class: 'success-subtitle' },
            'Your admin account for ', strong({}, siteName || 'Acroxa CMS'), ' has been created successfully.'
          ),
          div({ class: 'info-grid' },
            div({ class: 'info-item' },
              div({ class: 'info-item-label' }, 'Username'),
              div({ class: 'info-item-value' }, username || '—')
            ),
            div({ class: 'info-item' },
              div({ class: 'info-item-label' }, 'Site'),
              div({ class: 'info-item-value' }, siteName || '—')
            )
          ),
          div({ class: 'control-box' },
            div({ class: 'control-label' }, 'Your Control Key'),
            div({ class: 'control-key-display', id: 'controlKeyText' },
              controlKey || '—',
              el('button', { class: 'copy-btn', id: 'copyKeyBtn', type: 'button' }, 'Copy')
            ),
            p({ class: 'control-hint' },
              'Save this key securely. You will need it to access your account via the control page. This key is shown only once.'
            )
          ),
          div({ class: 'success-actions' },
            el('a', {
              class: 'success-btn success-btn-primary',
              href: controlUrl || '#',
              id: 'goToControlBtn'
            },
              icon('key', 'solid'), ' Go to Control Page'
            ),
            el('a', {
              class: 'success-btn success-btn-secondary',
              href: '/acroxa/login'
            },
              icon('right-to-bracket', 'solid'), ' Login Instead'
            )
          ),
          p({ class: 'success-footer' }, 'Acroxa CMS Alpha v1.0.0')
        )
      ),
      el('script', {}, `
        document.addEventListener('DOMContentLoaded', function() {
          var copyBtn = document.getElementById('copyKeyBtn');
          var keyText = document.getElementById('controlKeyText');
          if (copyBtn && keyText) {
            copyBtn.addEventListener('click', function() {
              var key = keyText.textContent.replace('Copy', '').trim();
              navigator.clipboard.writeText(key).then(function() {
                copyBtn.textContent = 'Copied!';
                setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
              }).catch(function() {
                var range = document.createRange();
                range.selectNodeContents(keyText);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('copy');
                sel.removeAllRanges();
                copyBtn.textContent = 'Copied!';
                setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
              });
            });
          }
        });
      `)
    )
  );
}

module.exports = { SetupSuccessPage };
