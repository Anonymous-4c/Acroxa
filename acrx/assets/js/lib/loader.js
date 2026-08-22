// acrx/assets/js/lib/loader.js
"use strict";

/**
 * Client-side script loader that ensures scripts load only once,
 * maintains dependency execution order, and manages a global registry.
 */
class ScriptLoader {
  constructor() {
    this.loadedScripts = new Set();
    this.loadingPromises = {};
    
    // Scan existing scripts in DOM to seed the registry
    document.querySelectorAll("script[src]").forEach(script => {
      const src = script.getAttribute("src");
      if (src) this.loadedScripts.add(src);
    });
  }

  /**
   * Loads a single script and returns a Promise.
   * @param {String} src 
   * @returns {Promise}
   */
  load(src) {
    if (!src) return Promise.resolve();

    // Check if script is already loaded
    if (this.loadedScripts.has(src)) {
      return Promise.resolve();
    }

    // Check if script is currently loading
    if (this.loadingPromises[src]) {
      return this.loadingPromises[src];
    }

    this.loadingPromises[src] = new Promise((resolve, reject) => {
      console.log(`[ScriptLoader] Dynamic loading: ${src}`);
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      
      // Support ESM modules if script extension is .mjs or includes type module
      if (src.endsWith(".mjs") || src.includes("type=module")) {
        script.type = "module";
      } else {
        script.type = "text/javascript";
      }

      script.onload = () => {
        this.loadedScripts.add(src);
        delete this.loadingPromises[src];
        resolve();
      };

      script.onerror = (err) => {
        delete this.loadingPromises[src];
        reject(new Error(`Failed to load script: ${src}`));
      };

      document.head.appendChild(script);
    });

    return this.loadingPromises[src];
  }

  /**
   * Loads a list of scripts sequentially to maintain dependency order.
   * @param {Array} srcList 
   * @returns {Promise}
   */
  loadAll(srcList) {
    if (!Array.isArray(srcList) || srcList.length === 0) {
      return Promise.resolve();
    }

    return srcList.reduce((promiseChain, currentSrc) => {
      return promiseChain.then(() => this.load(currentSrc));
    }, Promise.resolve());
  }
}

// Bind to window global scope
window.AcroxaScriptLoader = new ScriptLoader();
