// src/layouts/zenith/acrx/header.js
// Modern light-theme header with nested menu support

import { icon } from "../../../views/lib/framework.js";

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
        <li class="zen-nav-item zen-nav-item--dropdown">
          <button class="zen-nav-link zen-nav-dropdown-toggle">
            ${itemIcon}
            <span>${item.label || 'Untitled'}</span>
            <i class="fa-duotone fa-chevron-down zen-nav-chevron"></i>
          </button>
          <ul class="zen-nav-submenu">
            ${renderMenuTree(item.children)}
          </ul>
        </li>
      `;
    }

    return `
      <li class="zen-nav-item">
        <a href="${item.url || '#'}" class="zen-nav-link">
          ${itemIcon}
          <span>${item.label || 'Untitled'}</span>
        </a>
      </li>
    `;
  }).join('');
};

export const header = (data) => {
  const { menus = {} } = data || {};
  const primaryMenu = menus.primary || null;
  const menuItems = primaryMenu?.items || [];

  return `
    <header class="zen-header">
      <div class="zen-container">
        <div class="zen-header-inner">
          <!-- Logo / Brand -->
          <div class="zen-brand">
            <a href="/" class="zen-logo">
              <span class="zen-logo-icon">Z</span>
              <span class="zen-logo-text">Zenith</span>
            </a>
          </div>

          <!-- Primary Navigation -->
          <nav class="zen-nav" role="navigation">
            <ul class="zen-nav-list">
              ${renderMenuTree(menuItems)}
            </ul>
          </nav>

          <!-- Mobile Menu Toggle -->
          <button class="zen-mobile-toggle" aria-label="Toggle menu" id="zen-mobile-menu-btn">
            <i class="fa-duotone fa-bars"></i>
          </button>
        </div>
      </div>
    </header>

    <style>
      .zen-header {
        position: sticky;
        top: 0;
        z-index: 100;
        border-bottom: 1px solid #e5e7eb;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      .zen-container {
        max-width: 1280px;
        margin: 0 auto;
        padding: 0 2rem;
      }

      .zen-header-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 0;
        gap: 2rem;
      }

      .zen-brand {
        flex-shrink: 0;
      }

      .zen-logo {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 700;
        font-size: 1.25rem;
        color: #1f2937;
        transition: all 0.3s ease;
        text-decoration: none;
      }

      .zen-logo:hover {
        color: #0284c7;
      }

      .zen-logo-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #0284c7, #06b6d4);
        color: white;
        border-radius: 8px;
        font-weight: 800;
      }

      .zen-nav {
        flex: 1;
      }

      .zen-nav-list {
        display: flex;
        align-items: center;
        list-style: none;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
      }

      .zen-nav-item {
        position: relative;
      }

      .zen-nav-link {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        color: #4b5563;
        text-decoration: none;
        font-size: 0.95rem;
        font-weight: 500;
        border-radius: 6px;
        transition: all 0.3s ease;
        background: transparent;
        border: none;
        cursor: pointer;
        white-space: nowrap;
      }

      .zen-nav-link:hover {
        color: #0284c7;
        background: rgba(2, 132, 199, 0.08);
        transform: translateY(-2px);
      }

      .zen-icon {
        font-size: 1rem;
      }

      .zen-nav-chevron {
        font-size: 0.75rem;
        transition: transform 0.3s ease;
        margin-left: 0.25rem;
      }

      .zen-nav-item--dropdown:hover .zen-nav-chevron {
        transform: rotate(180deg);
      }

      .zen-nav-submenu {
        position: absolute;
        top: 100%;
        left: 0;
        min-width: 220px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        list-style: none;
        margin: 0.5rem 0 0 0;
        padding: 0.5rem;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px);
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        z-index: 1000;
      }

      .zen-nav-item--dropdown:hover .zen-nav-submenu {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .zen-nav-submenu .zen-nav-item {
        width: 100%;
      }

      .zen-nav-submenu .zen-nav-link {
        width: 100%;
        padding: 0.5rem 0.75rem;
        font-size: 0.9rem;
        justify-content: flex-start;
      }

      .zen-nav-submenu .zen-nav-item--dropdown .zen-nav-submenu {
        position: absolute;
        top: 0;
        left: 100%;
        margin: 0 0 0 0.5rem;
        opacity: 0;
        visibility: hidden;
        transform: translateX(-8px) translateY(0);
      }

      .zen-nav-submenu .zen-nav-item--dropdown:hover .zen-nav-submenu {
        opacity: 1;
        visibility: visible;
        transform: translateX(0);
      }

      .zen-mobile-toggle {
        display: none;
        flex-shrink: 0;
        background: none;
        border: none;
        padding: 0.5rem;
        font-size: 1.5rem;
        color: #1f2937;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.3s ease;
      }

      .zen-mobile-toggle:hover {
        background: rgba(2, 132, 199, 0.08);
        color: #0284c7;
      }

      @media (max-width: 768px) {
        .zen-mobile-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .zen-nav {
          display: none;
        }

        .zen-header-inner {
          padding: 0.75rem 0;
          gap: 1rem;
        }
      }
    </style>
  `;
};
