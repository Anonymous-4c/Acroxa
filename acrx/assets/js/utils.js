/* utils.js */

const Mini = (() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /* -------------------------
     Internal Resolvers
  ------------------------- */
  function resolve(target, root = document) {
    if (!target) return null;

    if (target instanceof Element ||
        target instanceof Document ||
        target instanceof Window)
      return target;

    if (typeof target === 'string')
      return root.querySelector(target);

    return null;
  }

  function resolveAll(target, root = document) {
    if (!target) return [];

    if (Array.isArray(target)) return target;

    if (target instanceof NodeList || target instanceof HTMLCollection)
      return [...target];

    if (target instanceof Element)
      return [target];

    if (typeof target === 'string')
      return [...root.querySelectorAll(target)];

    return [];
  }

  /* -------------------------
     Element Creator
  ------------------------- */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const key in attrs) {
      const value = attrs[key];

      if (value == null || value === false) continue;

      // class
      if (key === 'class') {
        node.className = value;
      }

      // style object
      else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value);
      }

      // native events: onclick, oninput etc
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2), value);
      }

      // boolean attrs
      else if (value === true) {
        node.setAttribute(key, '');
      }

      // everything else (data-*, aria-*, title, id...)
      else {
        node.setAttribute(key, value);
      }
    }

    children.flat(Infinity).forEach(child => {
      if (child == null || child === false) return;

      node.appendChild(
        child instanceof Node
          ? child
          : document.createTextNode(String(child))
      );
    });

    return node;
  }

  /* -------------------------
     Expanded Query Helpers
  ------------------------- */
  function parent(target) {
    return resolve(target)?.parentElement || null;
  }

  function children(target) {
    return [...(resolve(target)?.children || [])];
  }

  function next(target) {
    return resolve(target)?.nextElementSibling || null;
  }

  function prev(target) {
    return resolve(target)?.previousElementSibling || null;
  }

  function closest(target, selector) {
    return resolve(target)?.closest(selector) || null;
  }

  function find(target, selector) {
    return resolve(target)?.querySelector(selector) || null;
  }

  /* -------------------------
     Event Helpers
  ------------------------- */
  function on(target, event, callback, options) {
    resolveAll(target).forEach(el =>
      el.addEventListener(event, callback, options)
    );
  }

  function off(target, event, callback, options) {
    resolveAll(target).forEach(el =>
      el.removeEventListener(event, callback, options)
    );
  }

  function once(target, event, callback) {
    resolveAll(target).forEach(el =>
      el.addEventListener(event, callback, { once: true })
    );
  }

  function trigger(target, event, detail = {}) {
    resolveAll(target).forEach(el =>
      el.dispatchEvent(
        new CustomEvent(event, {
          bubbles: true,
          cancelable: true,
          detail
        })
      )
    );
  }

  function click(target) {
    resolveAll(target).forEach(el => el.click());
  }

  function dblclick(target) {
    resolveAll(target).forEach(el => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  }

  function hover(target, enterCallback, leaveCallback) {
    on(target, 'mouseenter', enterCallback);
    if (leaveCallback) on(target, 'mouseleave', leaveCallback);
  }

  function leave(target, callback) {
    on(target, 'mouseleave', callback);
  }

  function focus(target) {
    resolveAll(target).forEach(el => el.focus());
  }

  function blur(target) {
    resolveAll(target).forEach(el => el.blur());
  }

  function change(target) {
    resolveAll(target).forEach(el => el.dispatchEvent(new Event('change', { bubbles: true })));
  }

  function input(target) {
    resolveAll(target).forEach(el => el.dispatchEvent(new Event('input', { bubbles: true })));
  }

  function keydown(target, callback) {
    on(target, 'keydown', callback);
  }

  function keyup(target, callback) {
    on(target, 'keyup', callback);
  }

  function resize(callback) {
    window.addEventListener('resize', callback);
  }

  function scroll(callback) {
    window.addEventListener('scroll', callback);
  }

  /* -------------------------
     Class Helpers
  ------------------------- */
  function addClass(target, ...classes) {
    resolveAll(target).forEach(el =>
      el.classList.add(...classes)
    );
  }

  function removeClass(target, ...classes) {
    resolveAll(target).forEach(el =>
      el.classList.remove(...classes)
    );
  }

  function toggleClass(target, className, force) {
    resolveAll(target).forEach(el =>
      el.classList.toggle(className, force)
    );
  }

  function replaceClass(target, oldClass, newClass) {
    resolveAll(target).forEach(el =>
      el.classList.replace(oldClass, newClass)
    );
  }

  function hasClass(target, className) {
    const el = resolve(target);
    return el ? el.classList.contains(className) : false;
  }

  function clearClasses(target) {
    resolveAll(target).forEach(el => {
      el.className = '';
    });
  }

  /* -------------------------
     Visibility Helpers
  ------------------------- */
  function show(target) {
    resolveAll(target).forEach(el => {
      el.hidden = false;
      el.style.display = '';
    });
  }

  function hide(target) {
    resolveAll(target).forEach(el => {
      el.hidden = true;
    });
  }

  function toggle(target) {
    resolveAll(target).forEach(el => {
      el.hidden = !el.hidden;
    });
  }

  function fadeIn(target, duration = 300) {
    resolveAll(target).forEach(el => {
      el.style.transition = `opacity ${duration}ms ease`;
      el.style.opacity = '0';
      el.hidden = false;
      // Trigger reflow
      void el.offsetWidth;
      el.style.opacity = '1';
    });
  }

  function fadeOut(target, duration = 300) {
    resolveAll(target).forEach(el => {
      el.style.transition = `opacity ${duration}ms ease`;
      el.style.opacity = '0';
      setTimeout(() => {
        el.hidden = true;
        el.style.opacity = '';
      }, duration);
    });
  }

  /* -------------------------
     HTML Helpers
  ------------------------- */
  function html(target, value) {
    const el = resolve(target);
    if (!el) return value === undefined ? '' : undefined;

    if (value === undefined) return el.innerHTML;
    el.innerHTML = value;
  }

  function text(target, value) {
    const el = resolve(target);
    if (!el) return value === undefined ? '' : undefined;

    if (value === undefined) return el.textContent;
    el.textContent = value;
  }

  function append(target, child) {
    resolveAll(target).forEach(el => {
      if (child instanceof Node) {
        el.appendChild(child);
      } else if (child != null) {
        el.appendChild(document.createTextNode(String(child)));
      }
    });
  }

  function prepend(target, child) {
    resolveAll(target).forEach(el => {
      if (child instanceof Node) {
        el.prepend(child);
      } else if (child != null) {
        el.prepend(document.createTextNode(String(child)));
      }
    });
  }

  function before(target, sibling) {
    resolveAll(target).forEach(el => {
      const parentEl = el.parentNode;
      if (parentEl) {
        if (sibling instanceof Node) {
          parentEl.insertBefore(sibling, el);
        } else if (sibling != null) {
          parentEl.insertBefore(document.createTextNode(String(sibling)), el);
        }
      }
    });
  }

  function after(target, sibling) {
    resolveAll(target).forEach(el => {
      const parentEl = el.parentNode;
      if (parentEl) {
        if (sibling instanceof Node) {
          parentEl.insertBefore(sibling, el.nextSibling);
        } else if (sibling != null) {
          parentEl.insertBefore(document.createTextNode(String(sibling)), el.nextSibling);
        }
      }
    });
  }

  function empty(target) {
    resolveAll(target).forEach(el => {
      el.innerHTML = '';
    });
  }

  /* -------------------------
     CSS Helpers
  ------------------------- */
  function css(target, property, value) {
    const elements = resolveAll(target);
    if (!elements.length) return;

    if (typeof property === 'object' && value === undefined) {
      elements.forEach(el => Object.assign(el.style, property));
      return;
    }

    if (value === undefined) {
      return getComputedStyle(elements[0])[property];
    }

    elements.forEach(el => {
      el.style[property] = value;
    });
  }

  function width(target) {
    return resolve(target)?.offsetWidth || 0;
  }

  function height(target) {
    return resolve(target)?.offsetHeight || 0;
  }

  function rect(target) {
    return resolve(target)?.getBoundingClientRect() || null;
  }

  /* -------------------------
     Attribute Helpers
  ------------------------- */
  function attr(target, name, value) {
    const el = resolve(target);
    if (!el) return;

    if (value === undefined) return el.getAttribute(name);
    el.setAttribute(name, value);
  }

  function removeAttr(target, name) {
    resolveAll(target).forEach(el => el.removeAttribute(name));
  }

  function data(target, key, value) {
    const el = resolve(target);
    if (!el) return;

    if (value === undefined) return el.dataset[key];
    el.dataset[key] = value;
  }

  function prop(target, name, value) {
    const el = resolve(target);
    if (!el) return;

    if (value === undefined) return el[name];
    el[name] = value;
  }

  /* -------------------------
     Form Helpers
  ------------------------- */
  function value(target, newValue) {
    const el = resolve(target);
    if (!el) return;

    if (newValue === undefined) return el.value;
    el.value = newValue;
  }

  function enable(target) {
    resolveAll(target).forEach(el => {
      el.disabled = false;
    });
  }

  function disable(target) {
    resolveAll(target).forEach(el => {
      el.disabled = true;
    });
  }

  /* -------------------------
     DOM Helpers
  ------------------------- */
  function remove(target) {
    resolveAll(target).forEach(el => el.remove());
  }

  function clone(target) {
    return resolve(target)?.cloneNode(true) || null;
  }

  /* -------------------------
     Smart Click Helpers
  ------------------------- */
  function clickToggle(trigger, target, className = 'active') {
    on(trigger, 'click', () => {
      toggleClass(target, className);
    });
  }

  function clickAdd(trigger, target, className = 'active') {
    on(trigger, 'click', () => {
      addClass(target, className);
    });
  }

  function clickRemove(trigger, target, className = 'active') {
    on(trigger, 'click', () => {
      removeClass(target, className);
    });
  }

  function clickShow(trigger, target) {
    on(trigger, 'click', () => show(target));
  }

  function clickHide(trigger, target) {
    on(trigger, 'click', () => hide(target));
  }

  function clickToggleDisplay(trigger, target) {
    on(trigger, 'click', () => toggle(target));
  }

  function clickCss(trigger, target, styles) {
    on(trigger, 'click', () => css(target, styles));
  }

  function clickAttr(trigger, target, name, value) {
    on(trigger, 'click', () => attr(target, name, value));
  }

  /* -------------------------
     Outside Click
  ------------------------- */
  const outsideHandlers = new WeakMap();

  function outsideClick(target, callback) {
    const el = resolve(target);
    if (!el) return;

    const handler = (e) => {
      if (!el.contains(e.target)) {
        callback(e);
      }
    };

    document.addEventListener('click', handler);
    outsideHandlers.set(el, handler);
    return handler;
  }

  function removeOutsideClick(target) {
    const el = resolve(target);
    if (!el) return;
    const handler = outsideHandlers.get(el);
    if (handler) {
      document.removeEventListener('click', handler);
      outsideHandlers.delete(el);
    }
  }

  /* -------------------------
     Keyboard Helpers
  ------------------------- */
  function escape(callback) {
    once(document, 'keydown', (e) => {
      if (e.key === 'Escape') callback(e);
    });
  }

  function enter(target, callback) {
    on(target, 'keydown', (e) => {
      if (e.key === 'Enter') callback(e);
    });
  }

  /* -------------------------
     Global Data-* Behaviors
  ------------------------- */
  function initBehaviors() {
    const handleClick = (e) => {
      const target = e.target.closest('*');
      if (!target) return;

      /* data-click="#id" */
      const clicker = target.closest('[data-click]');
      if (clicker) {
        const el = $(clicker.dataset.click);
        if (el) el.click();
      }

      /* data-focus="#id" */
      const focuser = target.closest('[data-focus]');
      if (focuser) {
        const el = $(focuser.dataset.focus);
        if (el) el.focus();
      }

      /* data-toggle */
      const toggler = target.closest('[data-toggle]');
      if (toggler) {
        const selector = toggler.dataset.toggle;
        const toggleEl = $(selector);
        if (toggleEl) {
          const className = toggler.dataset.toggleClass || 'active';
          toggleClass(toggleEl, className);
        }
      }

      /* data-add */
      const adder = target.closest('[data-add]');
      if (adder) {
        const selector = adder.dataset.add;
        const addEl = $(selector);
        if (addEl) {
          const className = adder.dataset.class || 'active';
          addClass(addEl, className);
        }
      }

      /* data-remove */
      const remover = target.closest('[data-remove]');
      if (remover) {
        const selector = remover.dataset.remove;
        const removeEl = $(selector);
        if (removeEl) {
          const className = remover.dataset.class || 'active';
          removeClass(removeEl, className);
        }
      }

      /* data-show="#id" */
      const shower = target.closest('[data-show]');
      if (shower) {
        const el = $(shower.dataset.show);
        if (el) show(el);
      }

      /* data-hide="#id" */
      const hider = target.closest('[data-hide]');
      if (hider) {
        const el = $(hider.dataset.hide);
        if (el) hide(el);
      }

      /* data-link="url" */
      const linker = target.closest('[data-link]');
      if (linker) {
        const url = linker.dataset.link;
        if (url) window.location.href = url;
      }

      /* data-submit="#form" */
      const submitter = target.closest('[data-submit]');
      if (submitter) {
        const form = $(submitter.dataset.submit);
        if (form?.requestSubmit) form.requestSubmit();
      }

      /* data-toggle-class with data-old / data-new */
      const classToggler = target.closest('[data-toggle-class]');
      if (classToggler) {
        const selector = classToggler.dataset.toggleClass;
        const el = $(selector);
        if (el) {
          const oldClass = classToggler.dataset.old || 'active';
          const newClass = classToggler.dataset.new || '';
          if (hasClass(el, oldClass)) {
            removeClass(el, oldClass);
            if (newClass) addClass(el, newClass);
          } else {
            addClass(el, oldClass);
            if (newClass) removeClass(el, newClass);
          }
        }
      }

      /* data-display */
      const displayer = target.closest('[data-display]');
      if (displayer) {
        const selector = displayer.dataset.displayTarget || displayer.dataset.toggle;
        const el = selector ? $(selector) : null;
        if (el) {
          const displayValue = displayer.dataset.display || 'block';
          el.style.display = displayValue;
          el.hidden = false;
        }
      }
    };

    document.addEventListener('click', handleClick);
  }

/* -------------------------
      Dropdown Engine (Centralized)
      Handles: .dropdown, .split-dropdown, .icon-dropdown, .IconDropdown
      Menu class: .active
      Item selection: updates toggle label, sets hidden input value, dispatches change
   ------------------------- */
function initDropdowns() {
  const handleClick = (e) => {
    const target = e.target.closest("*");
    if (!target) return;

    const toggle = target.closest(".dropdown-toggle, .split-dropdown-toggle, .icon-dropdown-toggle, .pp-dropdown-toggle, .cust-dd-toggle, [data-schema-dd-toggle], [data-toggle], .plugin-dropdown-btn");
    if (toggle) {
      const dropdown = toggle.closest(".dropdown-field-wrap, .dropdown, .split-dropdown, .icon-dropdown, .IconDropdown, .num-exp, .pp-dropdown, .cust-schema-dropdown, [data-dropdown], .plugin-dropdown");
      const menu = dropdown?.querySelector(".dropdown-menu, .pp-dropdown-menu, .plugin-dropdown-menu");
      if (!menu) return;

      const wasOpen = menu.classList.contains("active");
      console.log('[utils.js] Toggle clicked:', { wasOpen, dropdown: dropdown?.className, menu: menu.className, toggle: toggle.className });
      // Close all other open menus
      $$(".dropdown-menu.active, .pp-dropdown-menu.active, .plugin-dropdown-menu.active").forEach(el => {
        if (el !== menu) removeClass(el, "active");
      });
      // Toggle this menu
      if (wasOpen) {
        removeClass(menu, "active");
      } else {
        addClass(menu, "active");
      }
      e.stopPropagation();
      return;
    }

    const item = target.closest(".dropdown-item, .pp-dropdown-item");
    if (item) {
      const dropdown = item.closest(".dropdown-field-wrap, .dropdown, .split-dropdown, .icon-dropdown, .IconDropdown, .num-exp, .pp-dropdown, .cust-schema-dropdown, [data-dropdown], .plugin-dropdown");
      const menu = dropdown?.querySelector(".dropdown-menu, .pp-dropdown-menu, .plugin-dropdown-menu");
      const toggle = dropdown?.querySelector(".dropdown-toggle, .split-dropdown-toggle, .icon-dropdown-toggle, .pp-dropdown-toggle, [data-schema-dd-toggle], [data-toggle], .plugin-dropdown-btn");
      const hidden = dropdown?.querySelector("input[type=hidden].dropdown-hidden-input, input[type=hidden][data-schema-key], input[type=hidden][data-dropdown-id], input[type=hidden][name]");

      const val = item.dataset.value ?? item.textContent.trim();
      const label = item.textContent.trim();

      console.log('[utils.js] Dropdown item clicked:', { val, label, dropdown: dropdown?.className, hidden: hidden?.name || hidden?.id, hiddenValue: hidden?.value });

      if (hidden) {
        hidden.value = val;
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (toggle) {
        const icon = toggle.querySelector("i, .icon, .fa-solid, .fa-duotone, .fa-regular");
        [...toggle.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).forEach(n => n.remove());
        const textNode = document.createTextNode(label + " ");
        if (icon) toggle.insertBefore(textNode, icon);
        else toggle.prepend(textNode);

        if (toggle.dataset) {
          toggle.dataset.selectedValue = val;
          toggle.dataset.label = label;
        }
      }

      if (menu) removeClass(menu, "active");

      dropdown?.querySelectorAll(".dropdown-item, .pp-dropdown-item").forEach(i => i.removeAttribute("data-active"));
      item.setAttribute("data-active", "true");
      
      console.log('[utils.js] After update, hidden value:', hidden?.value);
      return;
    }

    const inside = target.closest(".dropdown, .split-dropdown, .icon-dropdown, .IconDropdown, .num-exp, .pp-dropdown, .cust-schema-dropdown, [data-dropdown], .dropdown-field-wrap, .plugin-dropdown");
    if (!inside) {
      $$(".dropdown-menu.active, .pp-dropdown-menu.active, .plugin-dropdown-menu.active").forEach(menu => removeClass(menu, "active"));
    }
  };

  document.addEventListener("click", handleClick);

  // Hover follows active: mouseover sets data-active on the hovered item
  document.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".dropdown-item, .pp-dropdown-item");
    if (!item) return;
    const menu = item.closest(".dropdown-menu, .pp-dropdown-menu, .plugin-dropdown-menu");
    if (!menu || !menu.classList.contains("active")) return;
    menu.querySelectorAll(".dropdown-item[data-active], .pp-dropdown-item[data-active]").forEach(i => i.removeAttribute("data-active"));
    item.setAttribute("data-active", "true");
  });

  // ── Auto-scroll on dropdown edge hover ──────────────────────────────────
  const EDGE_PX = 20;
  const SCROLL_SPEED = 2;
  let _scrollRaf = null;
  let _scrollContainer = null;
  let _scrollDir = 0;

  function _stopAutoScroll() {
    if (_scrollRaf) { cancelAnimationFrame(_scrollRaf); _scrollRaf = null; }
    _scrollContainer = null;
    _scrollDir = 0;
  }

  function _tickScroll() {
    if (!_scrollContainer || !_scrollContainer.isConnected) { _stopAutoScroll(); return; }
    if (_scrollContainer.scrollHeight <= _scrollContainer.clientHeight) { _stopAutoScroll(); return; }
    _scrollContainer.scrollTop += _scrollDir;
    _scrollRaf = requestAnimationFrame(_tickScroll);
  }

  document.addEventListener("mousemove", (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;

    const menu = el.closest(".dropdown-menu.active, .pp-dropdown-menu.active, .plugin-dropdown-menu.active");
    if (!menu) { if (_scrollContainer) _stopAutoScroll(); return; }

    const scrollContainer = menu.querySelector(".wrap-menu-dp");
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const distFromTop = e.clientY - rect.top;
    const distFromBottom = rect.bottom - e.clientY;

    if (distFromTop <= EDGE_PX) {
      if (_scrollContainer !== scrollContainer || _scrollDir !== -SCROLL_SPEED) {
        _stopAutoScroll();
        _scrollContainer = scrollContainer;
        _scrollDir = -SCROLL_SPEED;
        _scrollRaf = requestAnimationFrame(_tickScroll);
      }
    } else if (distFromBottom <= EDGE_PX) {
      if (_scrollContainer !== scrollContainer || _scrollDir !== SCROLL_SPEED) {
        _stopAutoScroll();
        _scrollContainer = scrollContainer;
        _scrollDir = SCROLL_SPEED;
        _scrollRaf = requestAnimationFrame(_tickScroll);
      }
    } else {
      if (_scrollContainer) _stopAutoScroll();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $$(".dropdown-menu.active, .pp-dropdown-menu.active, .plugin-dropdown-menu.active").forEach(menu => removeClass(menu, "active"));
      return;
    }

    // Arrow key navigation inside open dropdowns
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const openMenu = e.target.closest(".dropdown, .split-dropdown, .icon-dropdown, .IconDropdown, .num-exp, .pp-dropdown, .cust-schema-dropdown, [data-dropdown], .dropdown-field-wrap, .plugin-dropdown")
        ?.querySelector(".dropdown-menu.active, .pp-dropdown-menu.active, .plugin-dropdown-menu.active");
      if (!openMenu) return;

      const items = [...openMenu.querySelectorAll(".dropdown-item, .pp-dropdown-item")];
      if (!items.length) return;

      const current = openMenu.querySelector("[data-active]");
      let idx = current ? items.indexOf(current) : -1;

      if (e.key === "ArrowDown") {
        idx = idx < items.length - 1 ? idx + 1 : 0;
      } else {
        idx = idx > 0 ? idx - 1 : items.length - 1;
      }

      items.forEach(i => i.removeAttribute("data-active"));
      items[idx].setAttribute("data-active", "true");
      items[idx].scrollIntoView({ block: "nearest" });
      e.preventDefault();
      return;
    }

    // Enter to select highlighted item
    if (e.key === "Enter") {
      const openMenu = e.target.closest(".dropdown, .split-dropdown, .icon-dropdown, .IconDropdown, .num-exp, .pp-dropdown, .cust-schema-dropdown, [data-dropdown], .dropdown-field-wrap, .plugin-dropdown")
        ?.querySelector(".dropdown-menu.active, .pp-dropdown-menu.active, .plugin-dropdown-menu.active");
      if (!openMenu) return;

      const active = openMenu.querySelector("[data-active]");
      if (active) {
        active.click();
        e.preventDefault();
      }
    }
  });
}

  /* -------------------------
     Helpers
  ------------------------- */
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function init() {
    initBehaviors();
    initDropdowns();
  }

  /* -------------------------
     Utility
  ------------------------- */
  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function throttle(fn, delay = 100) {
    let waiting = false;
    return (...args) => {
      if (waiting) return;
      waiting = true;
      fn(...args);
      setTimeout(() => { waiting = false; }, delay);
    };
  }

  /* auto start */
  ready(init);

  return {
    // Query
    $,
    $$,

    // Resolvers
    resolve,
    resolveAll,

    // Expanded Query
    parent,
    children,
    next,
    prev,
    closest,
    find,

    // Creator
    el,

    // Helpers
    ready,
    init,
    initDropdowns,

    // Events
    on,
    off,
    once,
    trigger,
    click,
    dblclick,
    hover,
    leave,
    focus,
    blur,
    change,
    input,
    keydown,
    keyup,
    resize,
    scroll,

    // Classes
    addClass,
    removeClass,
    toggleClass,
    replaceClass,
    hasClass,
    clearClasses,

    // Visibility
    show,
    hide,
    toggle,
    fadeIn,
    fadeOut,

    // Content / HTML
    html,
    text,
    append,
    prepend,
    before,
    after,
    empty,

    // Attributes
    attr,
    removeAttr,
    data,
    prop,

    // CSS
    css,
    width,
    height,
    rect,

    // Forms
    value,
    enable,
    disable,

    // DOM
    remove,
    clone,

    // Utilities
    debounce,
    throttle,

    // Smart Click Helpers
    clickToggle,
    clickAdd,
    clickRemove,
    clickShow,
    clickHide,
    clickToggleDisplay,
    clickCss,
    clickAttr,

    // Outside Click
    outsideClick,
    removeOutsideClick,

    // Keyboard
    escape,
    enter,
  };
})();


Mini.OrbitalWheel = (() => {
  const TAU = Math.PI * 2;
  const instances = new Map(); // rootEl -> OrbitalWheel instance
 
  // Every toggle this component supports, with its default. Anything not
  // passed by the caller falls back to these. See init()'s JSDoc for the
  // full description of each flag.
  const DEFAULT_SETTINGS = {
    drag: true,        // mouse-driven pointer drag rotation
    touch: true,       // touch-driven pointer drag rotation
    scroll: true,      // mouse-wheel / trackpad wheel rotation
    keyboard: true,    // left/right arrow key navigation
    controls: true,    // prev/next circular nav buttons
    dots: true,        // dot indicators row
    branding: true,    // top-left brand label + dot
    hint: true,        // top-right hint label
    autoSnap: true,    // snap to nearest card after drag/inertia settles
  };
 
  function mergeSettings(base, overrides) {
    return { ...DEFAULT_SETTINGS, ...base, ...overrides };
  }
 
  /* ---------------------------------------------------------------------
     PhysicsEngine — critically-damped spring integrator for the wheel's
     single rotation scalar (radians). Also supports free-spin w/ friction
     for inertial release before handing back off to the spring for snap.
  --------------------------------------------------------------------- */
  class PhysicsEngine {
    constructor({ stiffness = 190, damping = 24, mass = 1 } = {}) {
      this.stiffness = stiffness;
      this.damping = damping;
      this.mass = mass;
      this.position = 0;
      this.velocity = 0;
      this.target = 0;
    }
    setTarget(t) { this.target = t; }
    step(dt) {
      const displacement = this.position - this.target;
      const springForce = -this.stiffness * displacement;
      const dampingForce = -this.damping * this.velocity;
      const accel = (springForce + dampingForce) / this.mass;
      this.velocity += accel * dt;
      this.position += this.velocity * dt;
      const settled = Math.abs(displacement) < 0.0008 && Math.abs(this.velocity) < 0.0008;
      return !settled;
    }
    stepFree(dt, friction) {
      this.position += this.velocity * dt;
      this.velocity *= Math.pow(friction, dt * 60);
      return Math.abs(this.velocity) > 0.0006;
    }
  }
 
  /* ---------------------------------------------------------------------
     Card — one orbiting module. Builds its DOM via Mini.el(), owns its
     orbital index, and renders its own transform every tick based on the
     parent wheel's current rotation.
  --------------------------------------------------------------------- */
  class Card {
    constructor(data, index, wheel) {
      this.data = data;
      this.index = index;
      this.wheel = wheel;
      this.el = this._build();
    }
 
    _sparkPaths(values) {
      const w = 96, h = 28, pad = 3;
      const safe = (values && values.length) ? values : [1, 1];
      const max = Math.max(...safe), min = Math.min(...safe);
      const range = (max - min) || 1;
      const stepX = (w - pad * 2) / (safe.length - 1 || 1);
      const pts = safe.map((v, i) => [
        pad + i * stepX,
        h - pad - ((v - min) / range) * (h - pad * 2)
      ]);
      let line = `M ${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) line += ` L ${pts[i][0]},${pts[i][1]}`;
      const fill = `${line} L ${pts[pts.length - 1][0]},${h} L ${pts[0][0]},${h} Z`;
      return { line, fill, w, h };
    }
 
    _svg(tag, attrs = {}, ...children) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        node.setAttribute(k, v);
      }
      children.flat().forEach(c => c && node.appendChild(c));
      return node;
    }
 
    _build() {
      // NOTE: must call as this.wheel.c(...) (not destructured) so `c`'s
      // internal `this.prefix` lookup stays bound to the wheel instance.
      const c = (name) => this.wheel.c(name);
      const d = this.data;
      const { line, fill, w, h } = this._sparkPaths(d.spark);
 
      const spark = this._svg('svg', { class: c('spark'), viewBox: `0 0 ${w} ${h}` },
        this._svg('path', { class: c('fill'), d: fill }),
        this._svg('path', { class: c('line'), d: line })
      );
 
      const face = Mini.el('div', { class: c('card-face'), style: { '--card-accent': d.accent || '' } },
        Mini.el('div', { class: c('card-top') },
          Mini.el('div', { class: c('card-eyebrow') },
            Mini.el('div', { class: c('card-glyph') },
              Mini.el('i', { class: `fa-solid fa-${d.icon || 'circle'}` })
            ),
            Mini.el('div', { class: c('card-title') }, d.title || '')
          ),
          Mini.el('div', { class: c('status-badge') },
            Mini.el('span', { class: c('pulse') }),
            d.status || ''
          )
        ),
        Mini.el('div', { class: c('card-metric') },
          Mini.el('span', { class: c('value') }, d.value || ''),
          Mini.el('span', { class: c('unit') }, d.unit || ''),
          Mini.el('span', { class: c('delta') }, d.delta || '')
        ),
        Mini.el('div', { class: c('card-bottom') },
          Mini.el('div', { class: c('card-sub') }, d.sub || ''),
          spark
        )
      );
 
      return Mini.el('div', { class: c('card'), dataIndex: this.index, dataKey: d.key || '' }, face);
    }
 
    relativeAngle() {
      const n = this.wheel.count;
      let a = (this.index * (TAU / n)) - this.wheel.physics.position;
      a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
      return a;
    }
 
    render() {
      const angle = this.relativeAngle();
      const R = this.wheel.radius;
 
      const x = Math.sin(angle) * R;
      const yRaw = -Math.cos(angle) * R;
      const depth = (Math.cos(angle) + 1) / 2; // 1 = top/active, 0 = bottom/hidden
 
      const scale = Math.min(0.62 + depth * 0.5, 1.06);
      const opacity = Math.max(0, Math.min(1, depth * 1.35 - 0.12));
      const blurAmt = (1 - depth) * 5;
      const yOffset = yRaw * 0.6;
      const z = Math.round(depth * 1000);
 
      this.el.style.transform = `translate3d(${x.toFixed(2)}px, ${yOffset.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
      this.el.style.opacity = opacity.toFixed(3);
      this.el.style.filter = `blur(${blurAmt.toFixed(2)}px)`;
      this.el.style.zIndex = z;
      this.el.style.pointerEvents = depth > 0.55 ? 'auto' : 'none';
    }
  }
 
  /* ---------------------------------------------------------------------
     DragController — pointer / touch / trackpad input -> angular delta.
     Uses Mini.on() so listeners are registered the same way as the rest
     of the codebase.
 
     Three independent gates, not one combined "enabled" flag:
       - drag:   mouse-driven pointer drag (pointerType === 'mouse')
       - touch:  touch-driven pointer drag (pointerType === 'touch')
       - scroll: mouse-wheel / trackpad wheel events
     Pointer Events don't separate mouse from touch until the event fires
     (pointerType is only known once a pointerdown lands), so gating happens
     per-event rather than by not registering a listener at all. All three
     are checked live (not just at bind time), so callers can flip any of
     them on a running instance via wheel.setDragEnabled() / .setTouchEnabled()
     / .setScrollEnabled() without needing to re-bind anything.
  --------------------------------------------------------------------- */
  class DragController {
    constructor(viewportEl, onDrag, onRelease, gates = {}) {
      this.viewportEl = viewportEl;
      this.onDrag = onDrag;
      this.onRelease = onRelease;
      this.gates = { drag: true, touch: true, scroll: true, ...gates };
      this.active = false;
      this.activePointerType = null;
      this.lastX = 0;
      this.lastT = 0;
      this.velocityHistory = [];
      this._bind();
    }
 
    // whether the given pointerType is currently allowed to drive a drag
    _pointerTypeAllowed(pointerType) {
      if (pointerType === 'touch') return this.gates.touch;
      // 'mouse' and 'pen' both fall under the "drag" gate
      return this.gates.drag;
    }
 
    _bind() {
      const v = this.viewportEl;
      Mini.on(v, 'pointerdown', (e) => {
        if (this._pointerTypeAllowed(e.pointerType)) this._start(e);
      });
 
      // NOTE: window/document-level listeners are attached directly via
      // addEventListener rather than Mini.on(). Mini's resolveAll() only
      // special-cases Element / NodeList / HTMLCollection / string targets —
      // passing `window` through it silently resolves to an empty array,
      // so no listener would ever be attached and drag would appear "dead"
      // (pointerdown fires, but move/up never do). Keep these three raw.
      window.addEventListener('pointermove', (e) => this._move(e));
      window.addEventListener('pointerup', () => this._end());
      window.addEventListener('pointercancel', () => this._end());
 
      Mini.on(v, 'wheel', (e) => {
        if (!this.gates.scroll) return; // let the page scroll normally instead
        e.preventDefault();
        const delta = (e.deltaX !== 0 ? e.deltaX : e.deltaY) * 0.0026;
        this.onDrag(delta);
      }, { passive: false });
    }
 
    _start(e) {
      this.active = true;
      this.activePointerType = e.pointerType;
      this.lastX = e.clientX;
      this.lastT = performance.now();
      this.velocityHistory = [];
      Mini.addClass(this.viewportEl, 'dragging');
      this.viewportEl.setPointerCapture && this.viewportEl.setPointerCapture(e.pointerId);
    }
 
    _move(e) {
      if (!this.active) return;
      if (!this._pointerTypeAllowed(this.activePointerType)) return;
      const now = performance.now();
      const dx = e.clientX - this.lastX;
      const dt = Math.max(now - this.lastT, 1);
      const radiansPerPx = 0.0058;
      const delta = -dx * radiansPerPx;
 
      this.onDrag(delta);
 
      this.velocityHistory.push({ v: delta / dt * 16.6667 });
      if (this.velocityHistory.length > 6) this.velocityHistory.shift();
 
      this.lastX = e.clientX;
      this.lastT = now;
    }
 
    _end() {
      if (!this.active) return;
      this.active = false;
      this.activePointerType = null;
      Mini.removeClass(this.viewportEl, 'dragging');
      let avgV = 0;
      if (this.velocityHistory.length) {
        avgV = this.velocityHistory.reduce((s, e) => s + e.v, 0) / this.velocityHistory.length;
      }
      this.onRelease(avgV);
    }
 
    // Flip any of the three gates on or off without re-binding listeners.
    // If a drag is mid-flight using the pointer type being disabled, end
    // it cleanly first.
    setGate(name, value) {
      this.gates[name] = value;
      if (this.active && !this._pointerTypeAllowed(this.activePointerType)) {
        this._end();
        Mini.removeClass(this.viewportEl, 'dragging');
      }
    }
 
    destroy() {
      // window-level listeners are intentionally left attached since Mini.on
      // has no scoped-off; instances are expected to live for the page's
      // lifetime. If teardown is needed later, track handler refs here.
    }
  }
 
  /* ---------------------------------------------------------------------
     SnapController — resolves nearest card index & drives magnetic snap.
  --------------------------------------------------------------------- */
  class SnapController {
    constructor(wheel) { this.wheel = wheel; }
 
    nearestStepAngle(position) {
      const step = TAU / this.wheel.count;
      return Math.round(position / step) * step;
    }
 
    snapTo(position) {
      const target = this.nearestStepAngle(position);
      this.wheel.physics.setTarget(target);
      this.wheel.settling = true;
    }
 
    activeIndex(position) {
      const step = TAU / this.wheel.count;
      const n = this.wheel.count;
      let idx = Math.round(position / step) % n;
      return ((idx % n) + n) % n;
    }
  }
 
  /* ---------------------------------------------------------------------
     AnimationLoop — single rAF driver, one per wheel instance.
  --------------------------------------------------------------------- */
  class AnimationLoop {
    constructor(tickFn) {
      this.tickFn = tickFn;
      this.lastTime = performance.now();
      this._raf = this._raf.bind(this);
      this._running = false;
    }
    start() {
      this._running = true;
      requestAnimationFrame(this._raf);
    }
    stop() { this._running = false; }
    _raf(now) {
      if (!this._running) return;
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.tickFn(dt);
      requestAnimationFrame(this._raf);
    }
  }
 
  /* ---------------------------------------------------------------------
     OrbitalWheelInstance — orchestrates one wheel: cards, physics, drag,
     snap, and the small bits of chrome (active label, dots, accent color)
     that live outside the card DOM.
  --------------------------------------------------------------------- */
  class OrbitalWheelInstance {
    constructor(rootEl, items, prefix, settings) {
      this.root = rootEl;
      this.prefix = prefix;
      this.items = items;
      this.count = items.length;
      this.settings = settings;
      this.settling = false;
      this.freeSpinning = false;
      this.currentActive = 0;
      this._chromeInit = false;
 
      this.physics = new PhysicsEngine({ stiffness: 190, damping: 24 });
      this.snap = new SnapController(this);
 
      this.viewportEl = Mini.find(rootEl, `.${this.c('viewport')}`);
      this.hubEl = Mini.find(rootEl, `.${this.c('hub')}`);
      this.dotsEl = Mini.find(rootEl, `.${this.c('dots')}`);
      this.footerNameEl = Mini.find(rootEl, `.${this.c('name')}`);
      this.footerDescEl = Mini.find(rootEl, `.${this.c('desc')}`);
      this.brandDotEl = Mini.find(rootEl, `.${this.c('dot')}`);
 
      this.radius = this._computeRadius();
      console.log(this.settings)
      // Clear any server-rendered cards and replace with live, JS-driven ones
      // (keeps SSR output visually correct pre-hydration, then takes over).
      Mini.empty(this.hubEl);
      this.cards = this.items.map((d, i) => new Card(d, i, this));
      this.cards.forEach(card => this.hubEl.appendChild(card.el));
 
      this._applyStaticSettings();
      this._bindControls();
      this._bindKeyboard();
      Mini.resize(() => { this.radius = this._computeRadius(); });
 
      this.drag = new DragController(
        this.viewportEl,
        (delta) => this._onDrag(delta),
        (velocity) => this._onRelease(velocity),
        { drag: this.settings.drag, touch: this.settings.touch, scroll: this.settings.scroll }
      );
 
      this.loop = new AnimationLoop((dt) => this._tick(dt));
      this.loop.start();
 
      this._updateChrome(0);
    }
 
    // prefixed class-name helper, e.g. instance.c('card') -> 'ow-card'
    c(name) { return `${this.prefix}${name}`; }
 
    _computeRadius() {
      const w = this.root.clientWidth || window.innerWidth;
      if (w < 480) return 150;
      if (w < 720) return 200;
      return 250;
    }
 
    // Applies every "on/off" style toggle that doesn't need to react to
    // live state — branding/hint labels, controls, dots, and the drag
    // cursor affordance. Called once at construction; individual toggles
    // can also be flipped later via the setter methods below.
    _applyStaticSettings() {
      const s = this.settings;
      const c = (name) => this.c(name);
 
      const brandEl = Mini.find(this.root, `.${c('brand')}`);
      const hintEl = Mini.find(this.root, `.${c('hint')}`);
      const controlsEl = Mini.find(this.root, `.${c('controls')}`);
 
      if (brandEl) Mini.toggleClass(brandEl, `${this.prefix}hidden`, !s.branding);
      if (hintEl) Mini.toggleClass(hintEl, `${this.prefix}hidden`, !s.hint);
      if (controlsEl) Mini.toggleClass(controlsEl, `${this.prefix}hidden`, !s.controls);
      if (this.dotsEl) Mini.toggleClass(this.dotsEl, `${this.prefix}hidden`, !s.dots);
 
      // Cursor/touch-action affordance: only reflects pointer-driven drag
      // (mouse + touch). Mouse-wheel `scroll` doesn't change the cursor —
      // there's nothing to grab for a wheel gesture, so it gets its own
      // gate with no visual affordance to update.
      const noPointerDrag = !s.drag && !s.touch;
      Mini.toggleClass(this.viewportEl, `${this.prefix}no-drag`, noPointerDrag);
    }
 
    _onDrag(delta) {
      this.freeSpinning = false;
      this.settling = false;
      this.physics.position += delta;
      this.physics.velocity = delta * 60;
      this.physics.target = this.physics.position;
    }
 
    _onRelease(velocity) {
      this.physics.velocity = velocity * 0.9;
      this.freeSpinning = Math.abs(this.physics.velocity) > 0.02;
      if (!this.freeSpinning && this.settings.autoSnap) this.snap.snapTo(this.physics.position);
    }
 
    _tick(dt) {
      if (this.freeSpinning) {
        const stillMoving = this.physics.stepFree(dt, 0.055);
        if (!stillMoving || Math.abs(this.physics.velocity) < 0.35) {
          this.freeSpinning = false;
          if (this.settings.autoSnap) {
            this.snap.snapTo(this.physics.position);
          } else {
            this.physics.velocity = 0; // just stop in place, no magnetic pull
          }
        }
      } else if (this.settling) {
        const stillSettling = this.physics.step(dt);
        if (!stillSettling) {
          this.physics.position = this.physics.target;
          this.physics.velocity = 0;
          this.settling = false;
        }
      }
 
      this.cards.forEach(card => card.render());
 
      const idx = this.snap.activeIndex(this.physics.position);
      if (idx !== this.currentActive || !this._chromeInit) {
        this.currentActive = idx;
        this._updateChrome(idx);
        this._chromeInit = true;
      }
    }
 
    goTo(index) {
      const step = TAU / this.count;
      const current = this.physics.position;
      const currentIdx = Math.round(current / step);
      const currentBase = currentIdx * step;
      let shift = index - (((currentIdx % this.count) + this.count) % this.count);
      if (shift > this.count / 2) shift -= this.count;
      if (shift < -this.count / 2) shift += this.count;
      const target = currentBase + shift * step;
 
      this.freeSpinning = false;
      this.physics.setTarget(target);
      this.settling = true;
    }
 
    next() { this.goTo(this.snap.activeIndex(this.physics.position) + 1); }
    prev() { this.goTo(this.snap.activeIndex(this.physics.position) - 1); }
 
    _bindControls() {
      const prevBtn = Mini.find(this.root, `.${this.c('nav-btn')}[data-action="prev"]`);
      const nextBtn = Mini.find(this.root, `.${this.c('nav-btn')}[data-action="next"]`);
      if (prevBtn) Mini.on(prevBtn, 'click', () => this.prev());
      if (nextBtn) Mini.on(nextBtn, 'click', () => this.next());
 
      if (this.dotsEl) {
        Mini.children(this.dotsEl).forEach((dot, i) => {
          Mini.on(dot, 'click', () => this.goTo(i));
        });
      }
    }
 
    _bindKeyboard() {
      // Scoped: only respond to arrow keys when this wheel (or something
      // inside it) has focus-within, so multiple instances on one page
      // don't fight over the keyboard.
      Mini.on(this.root, 'keydown', (e) => {
        if (!this.settings.keyboard) return;
        if (e.key === 'ArrowRight') { this.next(); e.preventDefault(); }
        if (e.key === 'ArrowLeft') { this.prev(); e.preventDefault(); }
      });
      if (this.settings.keyboard && !this.root.hasAttribute('tabindex')) {
        this.root.setAttribute('tabindex', '0');
      }
    }
 
    _updateChrome(idx) {
      const mod = this.items[idx];
 
      if (this.footerNameEl) Mini.text(this.footerNameEl, mod.title || '');
      if (this.footerDescEl) Mini.text(this.footerDescEl, mod.sub || '');
 
      // scope the accent CSS var to this instance's root only, so multiple
      // wheels on the same page never clash on a shared document-level var
      if (mod.accent) this.root.style.setProperty('--accent', mod.accent);
 
      if (this.dotsEl) {
        Mini.children(this.dotsEl).forEach((dot, i) => {
          Mini.toggleClass(dot, 'active', i === idx);
        });
      }
    }
 
    // ---- Public runtime setting toggles -------------------------------
    // Each of these updates both the live behavior and the settings object
    // itself, so a later call to _applyStaticSettings() (or a fresh look
    // at this.settings) stays consistent with what's actually happening.
 
    // Recomputes the no-drag cursor/touch-action affordance. Shared by
    // setDragEnabled/setTouchEnabled since either one flipping can change
    // whether pointer-driven dragging is possible at all.
    _refreshDragAffordance() {
      const noPointerDrag = !this.settings.drag && !this.settings.touch;
      Mini.toggleClass(this.viewportEl, `${this.prefix}no-drag`, noPointerDrag);
    }
 
    setDragEnabled(enabled) {
      this.settings.drag = enabled;
      this.drag.setGate('drag', enabled);
      this._refreshDragAffordance();
    }
 
    setTouchEnabled(enabled) {
      this.settings.touch = enabled;
      this.drag.setGate('touch', enabled);
      this._refreshDragAffordance();
    }
 
    setScrollEnabled(enabled) {
      this.settings.scroll = enabled;
      this.drag.setGate('scroll', enabled);
      // no cursor/touch-action change here — wheel gestures have no
      // pointer-drag affordance to update.
    }
 
    setKeyboardEnabled(enabled) {
      this.settings.keyboard = enabled;
    }
 
    setAutoSnapEnabled(enabled) {
      this.settings.autoSnap = enabled;
    }
 
    setBrandingVisible(visible) {
      this.settings.branding = visible;
      const brandEl = Mini.find(this.root, `.${this.c('brand')}`);
      if (brandEl) Mini.toggleClass(brandEl, `${this.prefix}hidden`, !visible);
    }
 
    setHintVisible(visible) {
      this.settings.hint = visible;
      const hintEl = Mini.find(this.root, `.${this.c('hint')}`);
      if (hintEl) Mini.toggleClass(hintEl, `${this.prefix}hidden`, !visible);
    }
 
    setControlsVisible(visible) {
      this.settings.controls = visible;
      const controlsEl = Mini.find(this.root, `.${this.c('controls')}`);
      if (controlsEl) Mini.toggleClass(controlsEl, `${this.prefix}hidden`, !visible);
    }
 
    setDotsVisible(visible) {
      this.settings.dots = visible;
      if (this.dotsEl) Mini.toggleClass(this.dotsEl, `${this.prefix}hidden`, !visible);
    }
 
    destroy() {
      this.loop.stop();
      this.drag.destroy();
    }
  }
 
  /* ---------------------------------------------------------------------
     Public API
  --------------------------------------------------------------------- */
 
  // Detects the prefix an instance is using by inspecting its class list
  // for a class ending in "wheel" (e.g. "ow-wheel" -> prefix "ow-").
  function detectPrefix(rootEl) {
    const match = [...rootEl.classList].find(c => c.endsWith('wheel'));
    if (!match) return 'ow-';
    return match.slice(0, match.length - 'wheel'.length);
  }
 
  function readItems(rootEl, fallbackItems) {
    if (Array.isArray(fallbackItems) && fallbackItems.length) return fallbackItems;
    const raw = rootEl.getAttribute('data-orbital-items');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error('Mini.OrbitalWheel: failed to parse data-orbital-items', err);
      return [];
    }
  }
 
  // Reads settings the same way readItems() reads cards: explicit JS object
  // wins, falling back to a data-orbital-settings JSON attribute (which the
  // backend OrbitalWheel() can emit), falling back to DEFAULT_SETTINGS.
  function readSettings(rootEl, explicitSettings) {
    let fromAttr = {};
    const raw = rootEl.getAttribute('data-orbital-settings');
    if (raw) {
      try {
        fromAttr = JSON.parse(raw);
      } catch (err) {
        console.error('Mini.OrbitalWheel: failed to parse data-orbital-settings', err);
      }
    }
    return mergeSettings(fromAttr, explicitSettings || {});
  }
 
  /**
   * Initialize one or more OrbitalWheel instances.
   *
   * @param {Object}   [opts]
   * @param {string|Element} [opts.root] - a selector or element. If omitted,
   *        every element carrying [data-orbital-items] on the page is
   *        initialized (each as its own independent instance).
   * @param {Array}    [opts.items] - explicit items array; overrides whatever
   *        is embedded in the root's data-orbital-items attribute. Useful
   *        when items are fetched/generated client-side.
   * @param {string}   [opts.prefix] - explicit class prefix; overrides
   *        auto-detection from the root's class list.
   * @param {Object}   [opts.settings] - feature toggles. Anything omitted
   *        falls back to whatever's embedded in data-orbital-settings (if
   *        the backend rendered it), then to these defaults:
   *          drag:      true   - mouse-driven pointer drag rotation.
   *          touch:     true   - touch-driven pointer drag rotation.
   *          scroll:    true   - mouse-wheel / trackpad wheel rotation.
   *                     Pass `scroll: false` to let the page scroll
   *                     normally under the wheel instead of rotating it,
   *                     independently of drag/touch. All three default to
   *                     true and can be toggled independently — e.g.
   *                     `{ scroll: false }` keeps drag/touch working while
   *                     only disabling the wheel gesture, or
   *                     `{ drag: false, touch: false }` makes the wheel
   *                     click/keyboard-only while still scrolling normally.
   *          keyboard:  true   - left/right arrow key navigation.
   *          controls:  true   - the prev/next circular nav buttons.
   *          dots:      true   - the dot indicator row.
   *          branding:  true   - the top-left brand label + dot.
   *          hint:      true   - the top-right hint label.
   *          autoSnap:  true   - magnetically snap to the nearest card once
   *                     a drag/inertial spin settles. `autoSnap: false`
   *                     lets the wheel come to rest wherever momentum
   *                     leaves it (still snaps on next()/prev()/dot clicks,
   *                     since those always call goTo() directly).
   * @returns {OrbitalWheelInstance[]} the instances created by this call.
   */
  function init(opts = {}) {
    const created = [];
 
    const roots = opts.root
      ? Mini.resolveAll(opts.root)
      : Mini.resolveAll('[data-orbital-items]');
 
    roots.forEach((rootEl) => {
      if (instances.has(rootEl)) return; // already initialized, skip
 
      const prefix = opts.prefix || detectPrefix(rootEl);
      const items = readItems(rootEl, opts.items);
      const settings = readSettings(rootEl, opts.settings);
 
      if (!items.length) {
        console.warn('Mini.OrbitalWheel: no items found for', rootEl);
        return;
      }
 
      const instance = new OrbitalWheelInstance(rootEl, items, prefix, settings);
      instances.set(rootEl, instance);
      created.push(instance);
    });
 
    return created;
  }
 
  function destroy(root) {
    const rootEl = Mini.resolve(root);
    const instance = instances.get(rootEl);
    if (instance) {
      instance.destroy();
      instances.delete(rootEl);
    }
  }
 
  function getInstance(root) {
    return instances.get(Mini.resolve(root));
  }
 
  return { init, destroy, getInstance };
})();
/* ─── Mini.InstrumentDial ────────────────────────────────────────────────
   Frontend behavior for the InstrumentDial SSR component.

   Usage:
      Mini.ready(() => {
        Mini.InstrumentDial.init();                        // auto-discovers
                                                             // every
                                                             // [data-instrument-items]
                                                             // grid on the page
        // or, scoped to one instance:
        Mini.InstrumentDial.init({ root: '#main-instruments' });
      });

   Design notes:
   - Each grid (the element carrying data-instrument-items) becomes one
     InstrumentDialGroup instance, owning every card inside it — multiple
     groups on a page are fully independent.
   - The thumb is the primary interactive handle (per the brief's signature
     interaction): activating it "unzips" — a short outward slide along the
     ring's tangent — before the morph sequence begins. The whole card
     remains a fallback click/keyboard target for discoverability and
     accessibility; both paths converge on the same expand() call.
   - The morph (circle -> oval -> capsule -> panel) uses the Web Animations
     API with explicit keyframes rather than a single CSS transition, since
     a single continuous transition can't guarantee a real intermediate
     "oval" / "capsule" silhouette — WAAPI interpolates between as many
     explicit stops as we give it.
   ------------------------------------------------------------------------ */
Mini.InstrumentDial = (() => {
  const groups = new Map(); // rootEl -> InstrumentDialGroup instance

  const DEFAULT_SETTINGS = {
    interactive: true,
    idleAnimation: true,
    thumbHandle: true,
  };

  function mergeSettings(base, overrides) {
    return { ...DEFAULT_SETTINGS, ...base, ...overrides };
  }

  // Same easing used throughout the CSS, mirrored here for the WAAPI
  // keyframe steps so JS-driven and CSS-driven motion feel like one system.
  const EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'; // Material standard easing
const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)'; // smooth ease-out
const EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)'; // smooth in-out

  // Shared morph keyframe constants — kept in sync with CSS .id-expanded-state
  // and the collapse reverse sequence. Changing these requires updating both
  // the expand() and collapse() keyframe arrays.
  const MORPH_KEYFRAMES = {
    // Circle -> Oval -> Capsule -> Panel
    expand: [
      { borderRadius: '50%',             offset: 0 },
      { borderRadius: '50%',             offset: 0.32 },  // oval (still 50%)
      { borderRadius: '999px',           offset: 0.6 },   // capsule
      { borderRadius: 'var(--id-panel-radius)', offset: 1 },
    ],
    collapse: [
      { borderRadius: 'var(--id-panel-radius)', offset: 0 },
      { borderRadius: '999px',                    offset: 0.4 },   // capsule
      { borderRadius: '50%',                      offset: 0.68 },  // oval
      { borderRadius: '50%',                      offset: 1 },
    ],
  };


  /* ---------------------------------------------------------------------
     Instrument — one gauge card: ring, well, thumb, compact + expanded
     content. Owns its own progress reveal, morph sequence, and stagger
     orchestration.
  --------------------------------------------------------------------- */
  class Instrument {
    constructor(el, data, index, group) {
      this.el = el;
      this.data = data;
      this.index = index;
      this.group = group;
      this.prefix = group.prefix;

      this.RADIUS = 92;
      this.CENTER = 100;
      this.CIRC = 2 * Math.PI * this.RADIUS;

      this.progressCircle = Mini.find(el, `.${this.c('progress')}`);
      this.thumb = Mini.find(el, `.${this.c('thumb')}`);
      this.closeBtn = Mini.find(el, `.${this.c('close-btn')}`);
      this.actionBtn = Mini.find(el, `.${this.c('action-btn')}`);

      this.expanded = false;
      this.animating = false; // guards against re-entrant expand/collapse calls

      // Read nudge from CSS custom properties (set on the instrument by SSR)
      this.nudgeX = parseFloat(el.style.getPropertyValue(`--${this.prefix}nudge-x`)) || 0;
      this.nudgeY = parseFloat(el.style.getPropertyValue(`--${this.prefix}nudge-y`)) || 0;

      this._bind();
      this._revealProgress();
    }

    c(name) { return `${this.prefix}${name}`; }

    // ---- angle/position math -------------------------------------------
    // The ring's <svg> is rotated -90deg in CSS so 0% sits at 12 o'clock;
    // progress sweeps clockwise from there. angleForValue returns radians
    // in the ring's own (unrotated) coordinate space — i.e. 0 = 3 o'clock,
    // increasing clockwise — then _placeThumb layers the same -90deg
    // rotation on top via the trig itself (cos/sin shifted by -90deg)
    // rather than relying on any CSS transform on the thumb (the thumb is
    // NOT a child of the rotated <svg>, so it must replicate that rotation
    // in its own math to land in the same visual position as the arc).
    angleForValue(value) {
      const pct = Math.max(0, Math.min(100, value)) / 100;
      return (pct * Math.PI * 2) - Math.PI / 2; // -90deg offset = 12 o'clock start
    }

    _placeThumb(value, extraOffsetPx = 0) {
      if (!this.thumb) return;
      const angle = this.angleForValue(value);
      // position thumb center on the ring path, in the SVG's 0-200 space,
      // then convert to a percentage of the card so it tracks responsively
      // regardless of the instrument's actual rendered pixel size.
      const x = this.CENTER + Math.cos(angle) * this.RADIUS;
      const y = this.CENTER + Math.sin(angle) * this.RADIUS;
      const xPct = (x / 200) * 100;
      const yPct = (y / 200) * 100;

      // Apply the deterministic nudge (from SSR hash) so each card sits
      // slightly off-center in a stable, reproducible way.
      const nudgedXPct = xPct + (this.nudgeX / 2); // 200px viewbox -> 1px = 0.5%
      const nudgedYPct = yPct + (this.nudgeY / 2);

      // tangent direction at this angle, used for the "unzip" slide so the
      // thumb travels along the ring rather than radially in/out
      const tangentX = -Math.sin(angle);
      const tangentY = Math.cos(angle);
      const slide = extraOffsetPx;

      this.thumb.style.left = `${nudgedXPct}%`;
      this.thumb.style.top = `${nudgedYPct}%`;
      this.thumb.style.transform =
        `translate3d(calc(-50% + ${(tangentX * slide).toFixed(2)}px), calc(-50% + ${(tangentY * slide).toFixed(2)}px), 0)`;
    }

    // ---- initial reveal: thumb leads, arc follows ------------------------
    // Both are driven from one rAF loop rather than two separately-timed
    // CSS transitions, so "thumb leads" is an actual guarantee (a fixed
    // lead time + faster ease) rather than hoping two independent
    // transition-durations stay visually offset.
    _revealProgress() {
      const targetValue = this.data.value;
      const DURATION = 1100;
      const THUMB_LEAD = 220;

      if (this.progressCircle) {
        this.progressCircle.style.strokeDashoffset = String(this.CIRC);
      }
      this._placeThumb(0);

      const start = performance.now();

      const tick = (now) => {
        const elapsed = now - start;

        // thumb: smooth ease-out
        const thumbT = Math.min(Math.max((elapsed) / (DURATION - THUMB_LEAD), 0), 1);
        const thumbEased = thumbT * thumbT * (3 - 2 * thumbT); // smoothstep
        this._placeThumb(targetValue * thumbEased);

        // arc: starts THUMB_LEAD ms later, smoothstep
        const arcT = Math.min(Math.max((elapsed - THUMB_LEAD) / (DURATION - THUMB_LEAD), 0), 1);
        const arcEased = arcT * arcT * (3 - 2 * arcT);
        if (this.progressCircle) {
          const offset = this.CIRC - (targetValue * arcEased / 100) * this.CIRC;
          this.progressCircle.style.strokeDashoffset = String(offset);
        }

        if (thumbT < 1 || arcT < 1) {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    }

    // ---- interaction ------------------------------------------------------
    _bind() {
      if (this.thumb && this.group.settings.thumbHandle && this.group.settings.interactive) {
        Mini.on(this.thumb, 'click', (e) => {
          e.stopPropagation();
          this._unzipThenExpand();
        });
      }

      if (this.group.settings.interactive) {
        Mini.on(this.el, 'click', (e) => {
          if (e.target.closest(`.${this.c('close-btn')}`)) return;
          if (e.target.closest(`.${this.c('action-btn')}`)) { e.stopPropagation(); return; }
          if (e.target.closest(`.${this.c('thumb')}`)) return; // handled above
          if (this.el.classList.contains(this.c('expanded-state'))) return;
          if (this.el.classList.contains('placeholder')) return;
          this.group.requestExpand(this);
        });
      }

      if (this.closeBtn) {
        Mini.on(this.closeBtn, 'click', (e) => {
          e.stopPropagation();
          this.group.collapse();
        });
      }

      // Keyboard support
      Mini.on(this.el, 'keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!this.expanded) this.group.requestExpand(this);
        }
      });
    }

    // The signature interaction: thumb briefly slides further along its
    // tangent (as if the mechanism is being pulled to unlock), THEN the
    // normal expand sequence begins. Purely visual lead-in — expand() does
    // the real work.
    _unzipThenExpand() {
      if (this.animating || this.expanded) return;
      if (!this.thumb) { this.group.requestExpand(this); return; }

      Mini.addClass(this.thumb, this.c('unzipping'));
      this._placeThumb(this.data.value, 8); // slide along the tangent

      setTimeout(() => {
        this.group.requestExpand(this);
      }, 180);
    }

    _clearUnzip() {
      if (this.thumb) {
        Mini.removeClass(this.thumb, this.c('unzipping'));
        this._placeThumb(this.data.value, 0);
      }
    }
  }

  /* ---------------------------------------------------------------------
     InstrumentDialGroup — owns every Instrument inside one grid root,
     and the morph/expand/collapse choreography shared across them (only
     one instrument can be expanded at a time per group).
  --------------------------------------------------------------------- */
  class InstrumentDialGroup {
    constructor(rootEl, items, prefix, settings) {
      this.root = rootEl;
      this.prefix = prefix;
      this.items = items;
      this.settings = settings;
      this.current = null; // { instrument, slot, placeholder }

      this.instruments = [];
      Mini.children(rootEl).forEach((slot, i) => {
        if (!slot.classList.contains(this.c('slot'))) return;
        const cardEl = Mini.find(slot, `.${this.c('instrument')}`);
        if (!cardEl) return;
        const data = items[i];
        if (!data) return;
        this.instruments.push(new Instrument(cardEl, data, i, this));
      });

      if (this.settings.idleAnimation) {
        this.instruments.forEach(inst => Mini.addClass(inst.el, this.c('idle-on')));
      }

      // Click outside to collapse
      Mini.on(document.body, 'click', (e) => {
        if (!this.current) return;
        if (e.target.closest(`.${this.c('instrument')}`) === this.current.instrument.el) return;
        if (e.target.closest(`.${this.c('instrument')}`)) return;
        this.collapse();
      });

      // Escape key collapses
      Mini.on(document, 'keydown', (e) => {
        if (e.key === 'Escape') this.collapse();
      });

      // Reposition on resize/scroll
      Mini.resize(() => {
        if (!this.current) return;
        this._repositionExpanded();
      });
    }

    c(name) { return `${this.prefix}${name}`; }

    _targetGeometry() {
      const w = Math.min(window.innerWidth * 0.9, 440);
      const h = window.innerWidth < 560 ? 440 : 380;
      return {
        width: w,
        height: h,
        top: window.innerHeight / 2 - h / 2 + window.scrollY,
        left: window.innerWidth / 2 - w / 2,
      };
    }

    _repositionExpanded() {
      if (!this.current) return;
      const g = this._targetGeometry();
      const el = this.current.instrument.el;
      el.style.top = `${g.top}px`;
      el.style.left = `${g.left}px`;
      el.style.width = `${g.width}px`;
      el.style.height = `${g.height}px`;
    }

    requestExpand(instrument) {
      if (this.current) return;
      this.expand(instrument);
    }

    // ---- morph: Circle -> Oval -> Capsule -> Panel -----------------------
    // Driven by WAAPI with explicit intermediate keyframes so the shape
    // genuinely passes through an oval and a capsule silhouette rather than
    // the browser choosing its own (usually straight-line) interpolation
    // between a circle and a rounded rectangle. A short compression dip
    // (scale down) plays first, as a "building tension" beat before the
    // shape starts opening.
    expand(instrument) {
      const el = instrument.el;
      const slot = el.closest(`.${this.c('slot')}`);
      const rect = el.getBoundingClientRect();

      const placeholder = document.createElement('div');
      placeholder.className = `${this.c('placeholder')} ${this.c('instrument')}`;
      placeholder.style.width = `${rect.width}px`;
      placeholder.style.height = `${rect.height}px`;
      placeholder.style.flexShrink = '0'; // prevent collapsing in grid
      slot.appendChild(placeholder);

      this.current = { instrument, slot, placeholder };
      instrument.expanded = true;
      instrument.animating = true;

      instrument._clearUnzip();

      // compression dip first (brief tension beat)
      Mini.addClass(el, this.c('compressing'));

      setTimeout(() => {
        Mini.removeClass(el, this.c('compressing'));

        el.style.position = 'fixed';
        el.style.top = `${rect.top}px`;
        el.style.left = `${rect.left}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        el.style.margin = '0';
        el.style.zIndex = '1000';
        document.body.appendChild(el);

        Mini.removeClass(el, this.c('static'));
        Mini.addClass(slot, this.c('is-source'));
        Mini.addClass(this.root, this.c('has-expanded'));

        const g = this._targetGeometry();

        // Explicit shape stops: circle -> oval (widened, still rounded
        // fully) -> capsule (pill, height still short) -> final panel
        // dimensions with panel corner radius. Each stop's border-radius
        // is expressed as "50%" only for true circle/ellipse stops;
        // percentage border-radius on a non-square box naturally reads as
        // an ellipse/capsule without needing separate x/y radius syntax.
        const keyframes = [
          { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: '50%', offset: 0 },
          { top: `${rect.top - 6}px`, left: `${rect.left - rect.width * 0.18}px`, width: `${rect.width * 1.36}px`, height: `${rect.height * 0.86}px`, borderRadius: '50%', offset: 0.32 },
          { top: `${rect.top + rect.height * 0.1}px`, left: `${rect.left - rect.width * 0.3}px`, width: `${rect.width * 1.7}px`, height: `${rect.height * 0.62}px`, borderRadius: '999px', offset: 0.6 },
          { top: `${g.top}px`, left: `${g.left}px`, width: `${g.width}px`, height: `${g.height}px`, borderRadius: 'var(--id-panel-radius)', offset: 1 },
        ];

        const anim = el.animate(keyframes, {
          duration: 520, // slightly faster, matches new collapse feel
          easing: EASE,
          fill: 'forwards',
        });

        el.style.boxShadow = 'var(--id-shadow-panel)';

        Mini.addClass(el, this.c('expanded-state'));
        el.setAttribute('aria-expanded', 'true');

        anim.onfinish = () => {
          // lock in final geometry as real styles so resize handling
          // (which sets top/left/width/height directly) has something
          // consistent to adjust from
          el.style.top = `${g.top}px`;
          el.style.left = `${g.left}px`;
          el.style.width = `${g.width}px`;
          el.style.height = `${g.height}px`;
          el.style.borderRadius = 'var(--id-panel-radius)';
          instrument.animating = false;
        };
      }, 120); // matches the .id-compressing CSS transition duration
    }

    collapse() {
      if (!this.current) return;
      const { instrument, slot, placeholder } = this.current;
      const el = instrument.el;

      if (instrument.animating) return;
      instrument.animating = true;

      const rect = placeholder.getBoundingClientRect();
      const startRect = el.getBoundingClientRect();

      // reverse the content stagger first — recommendations/description/etc
      // retreat before the shell starts shrinking, per the brief.
      Mini.addClass(el, this.c('collapsing'));
      Mini.removeClass(el, this.c('expanded-state'));
      el.setAttribute('aria-expanded', 'false');

      const STAGGER_OUT_DURATION = 200; // slightly shorter, feels snappier

      setTimeout(() => {
        // Now shrink the shell back through the same intermediate shape
        // stops, in reverse: Panel -> Capsule -> Oval -> Circle.
        const keyframes = [
          { top: `${startRect.top}px`, left: `${startRect.left}px`, width: `${startRect.width}px`, height: `${startRect.height}px`, borderRadius: 'var(--id-panel-radius)', offset: 0 },
          { top: `${rect.top + rect.height * 0.08}px`, left: `${rect.left - rect.width * 0.28}px`, width: `${rect.width * 1.6}px`, height: `${rect.height * 0.65}px`, borderRadius: '999px', offset: 0.35 },
          { top: `${rect.top - 8}px`, left: `${rect.left - rect.width * 0.16}px`, width: `${rect.width * 1.32}px`, height: `${rect.height * 0.88}px`, borderRadius: '50%', offset: 0.65 },
          { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: '50%', offset: 1 },
        ];

        const anim = el.animate(keyframes, {
          duration: 480, // slightly faster, feels crisper
          easing: EASE,
          fill: 'forwards',
        });

        el.style.boxShadow = 'var(--id-shadow-rest)';
        Mini.removeClass(this.root, this.c('has-expanded'));

        anim.onfinish = () => {
          // Add static class to reset all positioning without inline styles
          Mini.addClass(el, this.c('static'));

          el.style.position = '';
          el.style.top = '';
          el.style.left = '';
          el.style.width = '';
          el.style.height = '';
          el.style.margin = '';
          el.style.zIndex = '';
          el.style.borderRadius = '';
          el.style.boxShadow = '';

          Mini.removeClass(el, this.c('collapsing'));
          Mini.removeClass(slot, this.c('is-source'));
          slot.replaceChild(el, placeholder);

          instrument.expanded = false;
          instrument.animating = false;
          instrument._placeThumb(instrument.data.value, 0);

          this.current = null;
        };
      }, STAGGER_OUT_DURATION);
    }
  }

  /* ---------------------------------------------------------------------
     Public API
  --------------------------------------------------------------------- */
  function detectPrefix(rootEl) {
    const match = [...rootEl.classList].find(c => c.endsWith('grid'));
    if (!match) return 'id-';
    return match.slice(0, match.length - 'grid'.length);
  }

  function readItems(rootEl, fallbackItems) {
    if (Array.isArray(fallbackItems) && fallbackItems.length) return fallbackItems;
    const raw = rootEl.getAttribute('data-instrument-items');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error('Mini.InstrumentDial: failed to parse data-instrument-items', err);
      return [];
    }
  }

  function readSettings(rootEl, explicitSettings) {
    let fromAttr = {};
    const raw = rootEl.getAttribute('data-instrument-settings');
    if (raw) {
      try {
        fromAttr = JSON.parse(raw);
      } catch (err) {
        console.error('Mini.InstrumentDial: failed to parse data-instrument-settings', err);
      }
    }
    return mergeSettings(fromAttr, explicitSettings || {});
  }

  /**
   * Initialize one or more InstrumentDial groups.
   *
   * @param {Object}   [opts]
   * @param {string|Element} [opts.root] - a selector or element. If omitted,
   *        every element carrying [data-instrument-items] is initialized.
   * @param {Array}    [opts.items] - explicit items array; overrides the
   *        root's data-instrument-items attribute.
   * @param {string}   [opts.prefix] - explicit class prefix; overrides
   *        auto-detection from the root's class list.
   * @param {Object}   [opts.settings] - feature toggles; see
   *        InstrumentDial.backend.js's doc comment for the full list
   *        (interactive / idleAnimation / thumbHandle).
   * @returns {InstrumentDialGroup[]} the groups created by this call.
   */
  function init(opts = {}) {
    const created = [];

    const roots = opts.root
      ? Mini.resolveAll(opts.root)
      : Mini.resolveAll('[data-instrument-items]');

    roots.forEach((rootEl) => {
      if (groups.has(rootEl)) return;

      const prefix = opts.prefix || detectPrefix(rootEl);
      const items = readItems(rootEl, opts.items);
      const settings = readSettings(rootEl, opts.settings);

      if (!items.length) {
        console.warn('Mini.InstrumentDial: no items found for', rootEl);
        return;
      }

      const group = new InstrumentDialGroup(rootEl, items, prefix, settings);
      groups.set(rootEl, group);
      created.push(group);
    });

    return created;
  }

  function getGroup(root) {
    return groups.get(Mini.resolve(root));
  }

  return { init, getGroup };
})();