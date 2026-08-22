// acrx/assets/js/components/acrx-summary.js
//
// Acroxa Expandable Summary component.
//
// A reusable, accessible, div-based expandable section — NOT the browser's
// <details>/<summary>. Built with div + button + ARIA so it integrates cleanly
// with the Acroxa design system and can be reused outside the editor.
//
// Uses: Inspector sections, SEO sections, post settings, advanced settings,
// Data Grid expanded rows, widget configuration, AI panels, media metadata.

import { h } from "../editor/widgets/shared.js";

export class ExpandableSummary {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container]
   * @param {string}   options.title
   * @param {string}   [options.icon]
   * @param {boolean}  [options.defaultExpanded=false]
   * @param {Function} [options.renderContent]  () => HTMLElement|string
   * @param {string}   [options.className]
   */
  constructor(options = {}) {
    this._options = {
      defaultExpanded: false,
      ...options,
    };

    this._expanded = this._options.defaultExpanded;
    this._element = null;
    this._body = null;

    if (options.container) {
      this.render(options.container);
    }
  }

  get isOpen() {
    return this._expanded;
  }

  expand() {
    this._expanded = true;
    this._applyState();
  }

  collapse() {
    this._expanded = false;
    this._applyState();
  }

  toggle() {
    this._expanded = !this._expanded;
    this._applyState();
  }

  render(container) {
    const target = container || this._options.container;
    if (!target) return null;

    target.innerHTML = "";

    const wrap = h("div", {
      class: `acrx-summary${this._expanded ? " open" : ""}${this._options.className ? ` ${this._options.className}` : ""}`,
    });

    const header = h(
      "button",
      {
        type: "button",
        class: "acrx-summary-header",
        "aria-expanded": String(this._expanded),
        "aria-controls": `acrx-summary-body-${ExpandableSummary._idCounter}`,
      },
      this._options.icon
        ? (() => { const i = document.createElement("i"); i.className = `fa-solid fa-${this._options.icon} acrx-summary-icon`; return i; })()
        : null,
      h("span", { class: "acrx-summary-title" }, this._options.title)
    );

    header.addEventListener("click", () => this.toggle());

    const bodyId = `acrx-summary-body-${ExpandableSummary._idCounter}`;
    ExpandableSummary._idCounter += 1;

    const body = h("div", {
      id: bodyId,
      class: "acrx-summary-body",
      role: "region",
      "aria-labelledby": header.id || null,
    });

    const content = h("div", { class: "acrx-summary-content" });

    if (this._options.renderContent) {
      const rendered = this._options.renderContent();
      if (rendered instanceof Node) content.appendChild(rendered);
      else if (rendered) content.innerHTML = rendered;
    }

    body.appendChild(content);
    wrap.appendChild(header);
    wrap.appendChild(body);

    target.appendChild(wrap);

    this._element = wrap;
    this._body = body;
    this._header = header;

    this._applyState();

    return wrap;
  }

  _applyState() {
    if (!this._element) return;

    this._element.classList.toggle("open", this._expanded);
    this._header?.setAttribute("aria-expanded", String(this._expanded));
  }

  destroy() {
    this._element?.remove();
    this._element = null;
    this._body = null;
    this._header = null;
  }
}

ExpandableSummary._idCounter = 0;

export default ExpandableSummary;
