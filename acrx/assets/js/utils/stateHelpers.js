/**
 * stateHelpers.js — Acroxa UI Behavior Framework
 *
 * Declarative, dependency-free UI behavior layer.
 *
 * Usage:
 *   import { sidebar } from './utils/stateHelpers.js';
 *   import Framework from './utils/stateHelpers.js';   // default also works
 */

// ─── Internal Helpers ─────────────────────────────────────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);

function _activatePanel(sideConfig, panelId) {
  for (const panel of sideConfig.panels) {
    const btn  = $(panel.buttonSelector);
    const pane = $(panel.panelSelector);
    const hit  = panel.id === panelId;
    btn?.classList.toggle('sdb-btn-active',   hit);
    pane?.classList.toggle('sdb-panel-active', hit);
  }
}

function _deactivatePanels(sideConfig) {
  for (const panel of sideConfig.panels) {
    $(panel.buttonSelector)?.classList.remove('sdb-btn-active');
    $(panel.panelSelector)?.classList.remove('sdb-panel-active');
  }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

/**
 * Wire up a two-sided sidebar system.
 *
 * Config shape:
 * {
 *   bodySelector: string,          // receives .sdb-open / .sdb-left / .sdb-right
 *   left: {
 *     toggleSelector: string,
 *     panels: [{ id, buttonSelector, panelSelector }]
 *   },
 *   right: { ...same }
 * }
 *
 * Returns a controller: { open, close, toggle, isOpen, activePanel }
 */
export function sidebar(config = {}) {
  const body = $(config.bodySelector);
  if (!body) {
    console.warn('[Framework.sidebar] bodySelector not found:', config.bodySelector);
    return null;
  }

  const sideState = {
    left:  { open: false, activePanel: null },
    right: { open: false, activePanel: null }
  };

  function syncBody() {
    body.classList.toggle('sdb-open',  sideState.left.open || sideState.right.open);
    body.classList.toggle('sdb-left',  sideState.left.open);
    body.classList.toggle('sdb-right', sideState.right.open);
  }

  function handlePanelClick(side, panelId) {
    const state      = sideState[side];
    const sideConfig = config[side];

    if (!state.open) {
      state.open        = true;
      state.activePanel = panelId;
      _activatePanel(sideConfig, panelId);
    } else if (state.activePanel === panelId) {
      state.open        = false;
      state.activePanel = null;
      _deactivatePanels(sideConfig);
    } else {
      state.activePanel = panelId;
      _activatePanel(sideConfig, panelId);
    }

    syncBody();
  }

  function handleToggleClick(side) {
    const state      = sideState[side];
    const sideConfig = config[side];

    if (state.open) {
      state.open        = false;
      state.activePanel = null;
      _deactivatePanels(sideConfig);
    } else {
      state.open = true;
      const target = state.activePanel ?? sideConfig.panels[0]?.id;
      if (target) {
        state.activePanel = target;
        _activatePanel(sideConfig, target);
      }
    }

    syncBody();
  }

  // Wire event listeners
  for (const side of ['left', 'right']) {
    const sideConfig = config[side];
    if (!sideConfig) continue;

    $(sideConfig.toggleSelector)?.addEventListener('click', () => handleToggleClick(side));

    for (const panel of sideConfig.panels) {
      const btn = $(panel.buttonSelector);
      if (!btn) {
        console.warn(`[Framework.sidebar] button not found for panel "${panel.id}":`, panel.buttonSelector);
        continue;
      }
      btn.addEventListener('click', () => handlePanelClick(side, panel.id));
    }
  }

  // Programmatic controller
  return {
    open(side, panelId) {
      const sideConfig = config[side];
      if (!sideConfig) return;
      const target = panelId ?? sideConfig.panels[0]?.id;
      if (!target) return;
      sideState[side].open        = true;
      sideState[side].activePanel = target;
      _activatePanel(sideConfig, target);
      syncBody();
    },
    close(side) {
      const sideConfig = config[side];
      if (!sideConfig) return;
      sideState[side].open        = false;
      sideState[side].activePanel = null;
      _deactivatePanels(sideConfig);
      syncBody();
    },
    toggle(side) {
      sideState[side].open ? this.close(side) : this.open(side);
    },
    isOpen(side) {
      return sideState[side].open;
    },
    activePanel(side) {
      return sideState[side].activePanel;
    }
  };
}

// ─── Tabs (stub) ──────────────────────────────────────────────────────────────

export function tabs(config = {}) {
  console.warn('[Framework.tabs] not yet implemented.');
}

// ─── Toggle (stub) ────────────────────────────────────────────────────────────

export function toggle(config = {}) {
  console.warn('[Framework.toggle] not yet implemented.');
}

// ─── Namespace object (for default import) ────────────────────────────────────

const Framework = { sidebar, tabs, toggle };

export default Framework;