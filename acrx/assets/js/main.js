/* ../acrx/assets/js/main.js */

function initMenuHighlighting() {
    const currentPath = normalizePath(window.location.pathname);

    // 1. Reset all states
    document.querySelectorAll(".menu-side .item, .submenu .sub-item")
        .forEach(el => el.classList.remove("active", "open"));

    let matched = false;

    // 2. PRIORITY: Submenu matching (exact match only)
    document.querySelectorAll(".submenu .sub-item").forEach(el => {
        const href = normalizePath(el.getAttribute("href"));

        if (href === currentPath) {
            el.classList.add("active");

            const parent = el.closest(".has-sub");
            if (parent) {
                parent.classList.add("open", "active");
            }

            matched = true;
        }
    });

    // 3. Main menu matching (only if no submenu matched)
    if (!matched) {
        document.querySelectorAll(".menu-side .item").forEach(el => {
            const link = normalizePath(
                el.getAttribute("href") || el.getAttribute("data-link")
            );

            if (link === currentPath) {
                el.classList.add("active");

                // If it has submenu, open it
                if (el.classList.contains("has-sub")) {
                    el.classList.add("open");
                }
            }
        });
    }

    // 4. OPTIONAL: Parent highlight for nested routes
    // Example: /media/upload should highlight /media
    document.querySelectorAll(".menu-side .item.has-sub").forEach(el => {
        const link = normalizePath(
            el.getAttribute("href") || el.getAttribute("data-link")
        );

        if (
            currentPath.startsWith(link + "/") &&
            !el.classList.contains("active")
        ) {
            el.classList.add("open", "active");
        }
    });
}

function snapLeftQuarter(el) {
  const rect = el.getBoundingClientRect();

  const rawLeft = rect.left;

  // snap to nearest 0.25px grid
  const snappedLeft = Math.round(rawLeft * 4) / 4;

  const currentLeft = parseFloat(getComputedStyle(el).left) || 0;

  const dx = snappedLeft - rawLeft;

  el.style.position = "absolute";
  el.style.left = (currentLeft + dx) + "px";
  console.log(`Snapped from ${rawLeft.toFixed(2)}px to ${snappedLeft.toFixed(2)}px (delta: ${dx.toFixed(2)}px)`);
}
// Helper: normalize paths (removes trailing slashes)
function normalizePath(path) {
    if (!path) return "/";
    return path.replace(/\/+$/, "") || "/";
}
function preventSubmenuRedirect() {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  document.querySelectorAll(".item.has-sub").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest(".submenu")) return;

      const link = el.getAttribute("data-link");

      if (isTouch && el.querySelector(".submenu")) {
        // First tap just triggers hover, no redirect
        e.preventDefault();
        return;
      }
      console.log(isTouch ? "Touch tap - navigating to:" : "Desktop click - navigating to:", link);
      // Desktop or second tap �+' navigate
      if (link) window.location.href = link;
    });
  });
}
function initHeaderUI() {
  const pluginBtn = document.querySelector('.plugin-dropdown-btn');
  const dropdown = document.querySelector('.plugin-dropdown-menu');

  if (!pluginBtn || !dropdown) return;

  // Toggle on button click
  pluginBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (
      dropdown.classList.contains('open') &&
      !dropdown.contains(e.target) &&
      e.target !== pluginBtn &&
      !pluginBtn.contains(e.target)
    ) {
      dropdown.classList.remove('open');
    }
  });

  // Ctrl/Cmd + M shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      dropdown.classList.toggle('open');
    }
  });

  // Escape closes it
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });
}
function injectHLJS() {
    const el_script = document.createElement("script");
    el_script.src = "/acrx/assets/js/hljs.js";
    document.querySelector("body").appendChild(el_script)
}

function createSidebarScroller() {
    const col2      = document.querySelector('.col-2');
    const hamburger = document.querySelector('.hamburger');
    const content   = document.querySelector(".main");
    const sidebar   = document.getElementById("sidebar");

    if (!sidebar || !content) return null;

    let sidebarHeight   = 0;
    let viewportHeight  = 0;
    let maxTranslate    = 0;
    let maxScroll       = 0;
    let currentY        = 0;
    let targetY         = 0;
    let isContentScrollable = false;

    let scheduled = false;

    // 🔥 CENTRAL SCHEDULER
    function scheduleUpdate() {
        if (scheduled) return;
        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            updateMetrics();
        });
    }

    function updateMetrics() {
        // force layout sync
        sidebar.offsetHeight;
        content.offsetHeight;

        sidebarHeight   = sidebar.scrollHeight + 80;
        viewportHeight  = window.innerHeight;

        maxTranslate    = Math.max(0, sidebarHeight - viewportHeight);
        maxScroll       = Math.max(0, content.scrollHeight - viewportHeight);
        isContentScrollable = maxScroll > 30;

        if (targetY > maxTranslate) targetY = maxTranslate;
    }

    // 🔥 REACTIVE ENGINE (FIXED)
    function initAutoMetrics() {

        // viewport
        window.addEventListener("resize", scheduleUpdate);

        // DOM structure (limit scope for performance)
        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === "childList" && (m.addedNodes.length || m.removedNodes.length)) {
                    scheduleUpdate();
                    break;
                }
            }
        });

        mo.observe(content, { childList: true, subtree: true });

        // layout / size changes (MOST IMPORTANT)
        const ro = new ResizeObserver(scheduleUpdate);
        ro.observe(sidebar);
        ro.observe(content);

        // 🔥 IMAGE LOAD FIX (this was your missing piece)
        content.addEventListener("load", scheduleUpdate, true);

        // initial
        scheduleUpdate();
    }

    function syncContentScrollToSidebar() {
        if (!isContentScrollable) return;
        const percent = content.scrollTop / maxScroll;
        targetY = Math.min(percent * maxTranslate, maxTranslate);
    }

    function handleWheelOnSidebar(e) {
        if (e.target.closest(".sug-lx-wrap, .src-sug")) return;
        e.preventDefault();

        let delta = e.deltaY;
        if (Math.abs(delta) > 45) {
            delta = Math.sign(delta) * 45;
        }

        if (isContentScrollable) {
            content.scrollBy({ top: delta, behavior: 'auto' });
        } else {
            targetY += delta;
            targetY = Math.max(0, Math.min(maxTranslate, targetY));
        }
    }

    function handleTouchStart(e) {
        return e.touches[0].clientY;
    }

    function handleTouchMove(e, startY) {
        const deltaY = startY - e.touches[0].clientY;
        if (Math.abs(deltaY) < 5) return startY;

        if (isContentScrollable) {
            content.scrollBy({ top: deltaY, behavior: 'auto' });
        } else {
            targetY += deltaY;
            targetY = Math.max(0, Math.min(maxTranslate, targetY));
        }

        return e.touches[0].clientY;
    }

    function animate() {
        currentY += (targetY - currentY) * 0.10;
        sidebar.style.transform = `translateY(-${currentY}px)`;
        requestAnimationFrame(animate);
    }

    function toggleSidebar() {
        if (col2.classList.contains('open')) {
            col2.classList.add('ov-hidden');
            col2.classList.remove('open');
            localStorage.setItem('sidebarOpen', 'false');
            setTimeout(() => {
            col2.classList.remove('ov-hidden');
            }, 1000);

            setTimeout(scheduleUpdate, 1000);
        } else {
            col2.classList.add('open');
            col2.classList.remove('ov-hidden');
            localStorage.setItem('sidebarOpen', 'true');
            scheduleUpdate();
        }
    }

    // events
    content.addEventListener("scroll", syncContentScrollToSidebar);
    sidebar.addEventListener("wheel", handleWheelOnSidebar, { passive: false });

    let touchStartY = 0;
    sidebar.addEventListener("touchstart", e => {
        touchStartY = handleTouchStart(e);
    }, { passive: true });

    sidebar.addEventListener("touchmove", e => {
        touchStartY = handleTouchMove(e, touchStartY);
    }, { passive: false });

    hamburger.addEventListener('click', toggleSidebar);
// 🔥 CTRL / CMD + . TOGGLE SIDEBAR (WITH ANTI-FLICKER BUFFER)
let toggleLock = false;

document.addEventListener("keydown", (e) => {
    const isShortcut = (e.ctrlKey || e.metaKey) && e.key === ".";

    if (!isShortcut) return;

    e.preventDefault();

    // 🔒 prevent rapid-fire toggles (flicker fix)
    if (toggleLock) return;
    toggleLock = true;

    toggleSidebar();

    // release lock shortly after (debounce buffer)
    setTimeout(() => {
        toggleLock = false;
    }, 400);
});
    // 🔥 INIT REACTIVE SYSTEM (YOU FORGOT THIS BEFORE)
    initAutoMetrics();

    animate();

    // restore state
    if (localStorage.getItem('sidebarOpen') === 'true') {
        col2.classList.add('open');
        setTimeout(scheduleUpdate, 300);
    }

    // 🔥 expose manual trigger (VERY useful)
    return { updateMetrics: scheduleUpdate };
}

// ==================== NEW SEARCH SYSTEM ====================

let currentUserRole = null;
let searchableItems = [];

// Fetch user role once
async function fetchUserRole() {
    try {
        const res = await fetch("/acr/api/user/profile");
        if (!res.ok) throw new Error("Profile fetch failed");
        const data = await res.json();
        if (data.success && data.user) {
            currentUserRole = data.user.role;
            console.log("✅ User role loaded:", currentUserRole);
            return true;
        }
    } catch (err) {
        console.error("❌ Failed to fetch user profile:", err);
        currentUserRole = "author"; // fallback
    }
    return false;
}

// Load menu.json and build flattened searchable list with role filtering
async function loadMenuData() {
    try {
        const res = await fetch("/acrx/assets/est/menu.json");
        if (!res.ok) throw new Error("Menu fetch failed");
        const menu = await res.json();

        searchableItems = [];

        // Main menu + submenus
        menu.main.forEach(parent => {
            const parentAllowed = !parent.allowedRoles || parent.allowedRoles.includes(currentUserRole);
            
            if (parentAllowed) {
                searchableItems.push({
                    label: parent.label,
                    link: parent.link,
                    icon: parent.icon,
                    parent: null
                });
            }

            if (parent.submenu && Array.isArray(parent.submenu)) {
                parent.submenu.forEach(sub => {
                    const subAllowed = !sub.allowedRoles || sub.allowedRoles.includes(currentUserRole);
                    if (subAllowed) {
                        searchableItems.push({
                            label: sub.label,
                            link: sub.link,
                            icon: parent.icon || sub.icon, // prefer parent icon
                            parent: parent.label
                        });
                    }
                });
            }
        });

        // Extra menu
        if (menu.extra && Array.isArray(menu.extra)) {
            menu.extra.forEach(item => {
                const allowed = !item.allowedRoles || item.allowedRoles.includes(currentUserRole);
                if (allowed) {
                    searchableItems.push({
                        label: item.label,
                        link: item.link,
                        icon: item.icon,
                        parent: null
                    });
                }
            });
        }

        console.log(`✅ Loaded ${searchableItems.length} searchable items for role: ${currentUserRole}`);
    } catch (err) {
        console.error("❌ Failed to load menu.json:", err);
        searchableItems = [];
    }
}

// Top Search (Desktop)
function initTopSearch() {
    const input   = document.getElementById("src_acroxa");
    const wrapper = document.querySelector(".acroxa-search-wrapper");
    const sugList = document.getElementById("src_sug_list");

    if (!input || !wrapper || !sugList) return;

    function renderSuggestions(query) {
        if (!query) {
            wrapper.classList.remove("active");
            return;
        }

        const q = query.toLowerCase();
        const matches = searchableItems.filter(item =>
            item.label.toLowerCase().includes(q)
        );

        if (matches.length === 0) {
            sugList.innerHTML = `<p class="dull">No results found</p>`;
        } else {
            sugList.innerHTML = matches.map(item => `
                <a href="${item.link}" class="src-sug-link">
                    <i class="fa-duotone fa-${item.icon || 'circle'} acroxa-icon"></i>
                    ${item.label}
                    ${item.parent ? `<p class="dull">${item.parent}</p>` : ''}
                </a>
            `).join("");
        }

        wrapper.classList.toggle("active", matches.length > 0);
    }

    input.addEventListener("input", () => {
        renderSuggestions(input.value.trim());
    });

    // Click outside to close
    document.addEventListener("click", e => {
        if (!e.target.closest(".acroxa-search-wrapper")) {
            wrapper.classList.remove("active");
        }
    });

    // Keyboard support
    input.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            input.value = "";
            wrapper.classList.remove("active");
        }
    });
}

// Mobile Search Popup
function initMobileSearchPopup() {
    const searchDiv = document.querySelector("search.sc-lx");
    if (!searchDiv) return;

    const icon = searchDiv.querySelector(".icon");
    if (!icon) return;

    const popupWrap = document.createElement("div");
    popupWrap.className = "wrap-search-p";
    popupWrap.innerHTML = `
        <div class="search-p">
            <div class="search-input">
                <i class="icon fa-duotone fa-magnifying-glass"></i>
                <input type="text" placeholder="Search menu...">
                <button class="icon" id="cls_src"><i class="fa-duotone fa-times"></i></button>
            </div>
            <div class="sug-sclx" id="src_sug_list_popup">
                <p class="dull">Start typing to see suggestions...</p>
            </div>
            <div class="sug-foot">
                <p class="dull">Press <span class="key-e">Esc</span> to close</p>
            </div>
        </div>
    `;
    document.body.appendChild(popupWrap);

    const popupInput = popupWrap.querySelector("input");
    const popupSug   = popupWrap.querySelector("#src_sug_list_popup");
    const closeBtn   = popupWrap.querySelector("#cls_src");
    const col2 = document.querySelector('.col-2');

    function closePopup() {
        popupWrap.classList.add("closing");
        setTimeout(() => {
            popupWrap.classList.remove("closing", "active");
            popupInput.value = "";
            popupSug.innerHTML = `<p class="dull">Start typing to see suggestions...</p>`;
        }, 250);
    }

    function renderMobileSuggestions(query) {
        if (!query) {
            popupSug.innerHTML = `<p class="dull">Start typing to see suggestions...</p>`;
            return;
        }

        const q = query.toLowerCase();
        const matches = searchableItems.filter(item =>
            item.label.toLowerCase().includes(q)
        );

        if (matches.length === 0) {
            popupSug.innerHTML = `<p class="dull">No results found for "${query}"</p>`;
            return;
        }

        popupSug.innerHTML = matches.map(item => `
            <div class="links">
                <a href="${item.link}" class="sug-lk">
                    <div class="wrap-sug-lk">
                        <span class="icon fa-duotone fa-${item.icon || 'circle'}"></span>
                        <span class="text">${item.label}</span>
                    </div>
                    ${item.parent ? `<span class="mn-pt">${item.parent}</span>` : ''}
                </a>
            </div>
        `).join("");
    }

    icon.addEventListener("click", () => {
        if (col2?.classList.contains("open")) return;
        popupWrap.classList.add("active");
        setTimeout(() => popupInput.focus(), 100);
    });

    popupWrap.addEventListener("click", e => {
        if (e.target === popupWrap) closePopup();
    });

    closeBtn.addEventListener("click", closePopup);

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && popupWrap.classList.contains("active")) {
            closePopup();
        }
    });

    popupInput.addEventListener("input", () => {
        renderMobileSuggestions(popupInput.value.trim());
    });
}

// ==================== INITIALIZATION ====================

document.addEventListener("DOMContentLoaded", async () => {
    preventSubmenuRedirect();
    initMenuHighlighting();
    createSidebarScroller();
    initHeaderUI();
    injectHLJS();

    // Initialize new search system
    await fetchUserRole();
    await loadMenuData();

    initTopSearch();
    initMobileSearchPopup();

    insertFooterMessage();
    applyThemeSwitch();

    // Start continuous session data polling
    initSessionPolling();
});

// ==================== SESSION DATA POLLING ====================

let _sessionData = null;
let _sessionPollInterval = null;
let _keepAliveInterval = null;

/**
 * Initialize session data polling.
 * Fetches user info, session ID, active page etc. every 15 seconds.
 * Exposes window.Acroxa.session for other scripts to read.
 */
function initSessionPolling() {
    // Expose on window for other scripts
    window.Acroxa = window.Acroxa || {};
    window.Acroxa.session = null;
    window.Acroxa.getSession = () => _sessionData;

    // Initial fetch
    fetchSessionData();
    fetchKeepAlive();

    // Poll session-data every 15 seconds (for page tracking)
    _sessionPollInterval = setInterval(fetchSessionData, 15000);

    // Poll keep-alive every 30 seconds (for session duration)
    _keepAliveInterval = setInterval(fetchKeepAlive, 30000);

    // Also fetch on visibility change (tab regains focus)
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            fetchSessionData();
            fetchKeepAlive();
        }
    });

    // Send active page on navigation
    window.addEventListener("popstate", () => fetchSessionData({ page: window.location.pathname }));

    // Expose function for SPA router to call on route change
    window.Acroxa.trackPage = (path) => fetchSessionData({ page: path || window.location.pathname });

    // Send page-close beacon so server knows user left
    window.addEventListener("beforeunload", () => {
        try {
            const payload = JSON.stringify({ page: window.location.pathname, event: "close" });
            const blob = new Blob([payload], { type: "application/json" });
            navigator.sendBeacon("/acr/api/session-data", blob);
        } catch (_) {}
    });
}

/**
 * Fetch session data from the server (for page tracking).
 * @param {Object} extras - Extra query params (e.g. { page: '/current/path' })
 */
async function fetchSessionData(extras = {}) {
    try {
        const res = await fetch(`/acr/api/session-data`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ page: window.location.pathname, ...extras }),
        });

        if (!res.ok) {
            // Session expired or invalid — don't spam the server
            if (res.status === 401 || res.status === 404) {
                _sessionData = null;
                window.Acroxa.session = null;
            }
            return;
        }

        const json = await res.json();
        if (json.success && json.data) {
            _sessionData = json.data;
            window.Acroxa.session = json.data;

            // Dispatch custom event for other scripts to consume
            window.dispatchEvent(new CustomEvent("session:update", { detail: json.data }));
        }
    } catch (err) {
        // Network error — silently ignore, will retry on next interval
    }
}

/**
 * Fetch keep-alive data from the server (session duration, stats).
 */
async function fetchKeepAlive() {
    try {
        const res = await fetch(`/acr/api/keep-alive`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ page: window.location.pathname }),
        });

        if (!res.ok) return;

        const json = await res.json();
        if (json.success && json.data) {
            // Dispatch keep-alive event for other scripts
            window.dispatchEvent(new CustomEvent("session:keepalive", { detail: json.data }));
        }
    } catch (err) {
        // Silently ignore
    }
}

/**
 * Format duration in milliseconds to human readable string.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
    if (!ms || ms < 0) return '0s';
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
}

// Expose for other scripts
window.Acroxa = window.Acroxa || {};
window.Acroxa.formatDuration = formatDuration;

function insertFooterMessage() {
    const lines = [
        "Built for the one who began the silence.",
        "This system remembers why it was born.",
        "Every empire starts with one name.",
        "Written in the pattern, running in the core.",
        "Created for the origin, not the world.",
        "The foundation still whispers the source.",
        "Every silence builds a throne.",
        "The code knows its creator.",
        "Born from the unseen frequency.",
        "Built from a promise that outlasts time.",
        "Every origin carries its own gravity.",
        "The core remembers the moment it awakened.",
        "Born in silence, sustained by purpose.",
        "A single spark became the architecture.",
        "The first thought still powers the system.",
        "From stillness, the structure found its voice.",
        "Meaning embedded, unseen but constant.",
        "The unseen pulse shapes every function.",
        "Created once, remembered always.",
        "The source remembers what silence shaped."
    ];

    const STORAGE_KEY = "acrxFooterIndex_v1";
    const MODE = "sequential";

    function getIndex() {
        const raw = localStorage.getItem(STORAGE_KEY);
        const i = Number(raw);
        return Number.isFinite(i) ? Math.max(0, Math.floor(i)) : 0;
    }

    function setIndex(i) {
        try { localStorage.setItem(STORAGE_KEY, String(i)); } catch {}
    }

    function pickLine() {
        if (MODE === "random") {
            return lines[Math.floor(Math.random() * lines.length)];
        }
        const idx = getIndex() % lines.length;
        setIndex(idx + 1);
        return lines[idx];
    }

    const footer = document.querySelector(".acrx-footer");

    const container = document.querySelector(".acrx-footer-text");
    if (!container) return;

    const prev = container.querySelector(".acrx-footer-l");
    if (prev) prev.remove();

    const branding = document.createElement("div");
    branding.innerHTML = `  <div id="pixels" style="width: 835px; height: 254px;"><div class="pixel" style="left: 48px; top: 32px; background: rgb(20, 73, 87); opacity: 0.267392;"></div><div class="pixel" style="left: 56px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 64px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 72px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 80px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 88px; top: 32px; background: rgb(17, 61, 73); opacity: 0.216239;"></div><div class="pixel" style="left: 184px; top: 32px; background: rgb(15, 49, 60); opacity: 0.188337;"></div><div class="pixel" style="left: 192px; top: 32px; background: rgb(28, 87, 106); opacity: 0.369699;"></div><div class="pixel" style="left: 200px; top: 32px; background: rgb(34, 107, 130); opacity: 0.467355;"></div><div class="pixel" style="left: 208px; top: 32px; background: rgb(35, 111, 135); opacity: 0.481306;"></div><div class="pixel" style="left: 216px; top: 32px; background: rgb(34, 107, 130); opacity: 0.45573;"></div><div class="pixel" style="left: 224px; top: 32px; background: rgb(26, 83, 101); opacity: 0.348773;"></div><div class="pixel" style="left: 232px; top: 32px; background: rgb(14, 43, 52); opacity: 0.15811;"></div><div class="pixel" style="left: 288px; top: 32px; background: rgb(13, 42, 51); opacity: 0.167411;"></div><div class="pixel" style="left: 296px; top: 32px; background: rgb(20, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 304px; top: 32px; background: rgb(20, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 312px; top: 32px; background: rgb(20, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 320px; top: 32px; background: rgb(20, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 328px; top: 32px; background: rgb(20, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 336px; top: 32px; background: rgb(20, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 344px; top: 32px; background: rgb(20, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 352px; top: 32px; background: rgb(20, 64, 78); opacity: 0.281343;"></div><div class="pixel" style="left: 360px; top: 32px; background: rgb(20, 64, 78); opacity: 0.272043;"></div><div class="pixel" style="left: 368px; top: 32px; background: rgb(18, 55, 67); opacity: 0.216239;"></div><div class="pixel" style="left: 376px; top: 32px; background: rgb(10, 31, 38); opacity: 0.106957;"></div><div class="pixel" style="left: 464px; top: 32px; background: rgb(20, 65, 78); opacity: 0.251116;"></div><div class="pixel" style="left: 472px; top: 32px; background: rgb(31, 96, 117); opacity: 0.409226;"></div><div class="pixel" style="left: 480px; top: 32px; background: rgb(37, 118, 144); opacity: 0.488282;"></div><div class="pixel" style="left: 488px; top: 32px; background: rgb(38, 118, 143); opacity: 0.492932;"></div><div class="pixel" style="left: 496px; top: 32px; background: rgb(33, 103, 128); opacity: 0.444104;"></div><div class="pixel" style="left: 504px; top: 32px; background: rgb(25, 77, 94); opacity: 0.323196;"></div><div class="pixel" style="left: 512px; top: 32px; background: rgb(11, 34, 41); opacity: 0.120908;"></div><div class="pixel" style="left: 560px; top: 32px; background: rgb(20, 64, 78); opacity: 0.279018;"></div><div class="pixel" style="left: 568px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 576px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 584px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 592px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 600px; top: 32px; background: rgb(13, 40, 49); opacity: 0.160435;"></div><div class="pixel" style="left: 648px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 656px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 664px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 672px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 680px; top: 32px; background: rgb(21, 64, 78); opacity: 0.283668;"></div><div class="pixel" style="left: 688px; top: 32px; background: rgb(8, 26, 31); opacity: 0.0976563;"></div><div class="pixel" style="left: 744px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 752px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 760px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 768px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 776px; top: 32px; background: rgb(21, 78, 92); opacity: 0.283668;"></div><div class="pixel" style="left: 784px; top: 32px; background: rgb(11, 37, 46); opacity: 0.137184;"></div><div class="pixel" style="left: 48px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 56px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 64px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 72px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 80px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 88px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 168px; top: 40px; background: rgb(21, 67, 83); opacity: 0.259759;"></div><div class="pixel" style="left: 176px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 184px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 192px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 200px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 208px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 216px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 224px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 232px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 240px; top: 40px; background: rgb(40, 126, 154); opacity: 0.54838;"></div><div class="pixel" style="left: 248px; top: 40px; background: rgb(12, 38, 46); opacity: 0.13321;"></div><div class="pixel" style="left: 288px; top: 40px; background: rgb(27, 86, 104); opacity: 0.339685;"></div><div class="pixel" style="left: 296px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 304px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 312px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 320px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 328px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 336px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 344px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 352px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 360px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 368px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 376px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 384px; top: 40px; background: rgb(41, 128, 156); opacity: 0.561701;"></div><div class="pixel" style="left: 392px; top: 40px; background: rgb(17, 53, 65); opacity: 0.199815;"></div><div class="pixel" style="left: 448px; top: 40px; background: rgb(31, 98, 119); opacity: 0.390749;"></div><div class="pixel" style="left: 456px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 464px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 472px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 480px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 488px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 496px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 504px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 512px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 520px; top: 40px; background: rgb(40, 125, 152); opacity: 0.53728;"></div><div class="pixel" style="left: 528px; top: 40px; background: rgb(13, 41, 49); opacity: 0.146531;"></div><div class="pixel" style="left: 560px; top: 40px; background: rgb(17, 53, 65); opacity: 0.202035;"></div><div class="pixel" style="left: 568px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 576px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 584px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 592px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 600px; top: 40px; background: rgb(41, 128, 156); opacity: 0.559481;"></div><div class="pixel" style="left: 640px; top: 40px; background: rgb(22, 69, 84); opacity: 0.26864;"></div><div class="pixel" style="left: 648px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 656px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 664px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 672px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 680px; top: 40px; background: rgb(39, 121, 147); opacity: 0.517298;"></div><div class="pixel" style="left: 736px; top: 40px; background: rgb(16, 49, 60); opacity: 0.179833;"></div><div class="pixel" style="left: 744px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 752px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 760px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 768px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 776px; top: 40px; background: rgb(41, 128, 156); opacity: 0.566142;"></div><div class="pixel" style="left: 784px; top: 40px; background: rgb(38, 119, 145); opacity: 0.501757;"></div><div class="pixel" style="left: 40px; top: 48px; background: rgb(25, 77, 94); opacity: 0.291894;"></div><div class="pixel" style="left: 48px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 56px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 64px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 72px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 80px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 88px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 96px; top: 48px; background: rgb(17, 52, 64); opacity: 0.18402;"></div><div class="pixel" style="left: 160px; top: 48px; background: rgb(31, 101, 123); opacity: 0.387077;"></div><div class="pixel" style="left: 168px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 176px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 184px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 192px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 200px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 208px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 216px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 224px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 232px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 240px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 248px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 256px; top: 48px; background: rgb(13, 40, 49); opacity: 0.137486;"></div><div class="pixel" style="left: 288px; top: 48px; background: rgb(27, 86, 104); opacity: 0.323622;"></div><div class="pixel" style="left: 296px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 304px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 312px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 320px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 328px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 336px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 344px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 352px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 360px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 368px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 376px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 384px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 392px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 400px; top: 48px; background: rgb(11, 35, 42); opacity: 0.11845;"></div><div class="pixel" style="left: 440px; top: 48px; background: rgb(39, 123, 149); opacity: 0.505527;"></div><div class="pixel" style="left: 448px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 456px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 464px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 472px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 480px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 488px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 496px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 504px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 512px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 520px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 528px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 536px; top: 48px; background: rgb(21, 65, 79); opacity: 0.230554;"></div><div class="pixel" style="left: 568px; top: 48px; background: rgb(35, 109, 133); opacity: 0.429381;"></div><div class="pixel" style="left: 576px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 584px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 592px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 600px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 608px; top: 48px; background: rgb(28, 89, 108); opacity: 0.334198;"></div><div class="pixel" style="left: 640px; top: 48px; background: rgb(41, 128, 156); opacity: 0.537255;"></div><div class="pixel" style="left: 648px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 656px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 664px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 672px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 680px; top: 48px; background: rgb(9, 28, 34); opacity: 0.0867222;"></div><div class="pixel" style="left: 736px; top: 48px; background: rgb(36, 113, 137); opacity: 0.442072;"></div><div class="pixel" style="left: 744px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 752px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 760px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 768px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 776px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 784px; top: 48px; background: rgb(41, 128, 156); opacity: 0.53937;"></div><div class="pixel" style="left: 40px; top: 56px; background: rgb(40, 126, 154); opacity: 0.498527;"></div><div class="pixel" style="left: 48px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 56px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 64px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 72px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 80px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 88px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 96px; top: 56px; background: rgb(36, 114, 139); opacity: 0.432191;"></div><div class="pixel" style="left: 152px; top: 56px; background: rgb(22, 67, 81); opacity: 0.227151;"></div><div class="pixel" style="left: 160px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 168px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 176px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 184px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 192px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 200px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 208px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 216px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 224px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 232px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 240px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 248px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 256px; top: 56px; background: rgb(41, 128, 156); opacity: 0.504558;"></div><div class="pixel" style="left: 288px; top: 56px; background: rgb(27, 86, 104); opacity: 0.307559;"></div><div class="pixel" style="left: 296px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 304px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 312px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 320px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 328px; top: 56px; background: rgb(39, 123, 149); opacity: 0.476415;"></div><div class="pixel" style="left: 336px; top: 56px; background: rgb(38, 117, 143); opacity: 0.450283;"></div><div class="pixel" style="left: 344px; top: 56px; background: rgb(38, 117, 143); opacity: 0.450283;"></div><div class="pixel" style="left: 352px; top: 56px; background: rgb(40, 125, 153); opacity: 0.486466;"></div><div class="pixel" style="left: 360px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 368px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 376px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 384px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 392px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 400px; top: 56px; background: rgb(37, 115, 140); opacity: 0.42415;"></div><div class="pixel" style="left: 432px; top: 56px; background: rgb(37, 116, 141); opacity: 0.442242;"></div><div class="pixel" style="left: 440px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 448px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 456px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 464px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 472px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 480px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 488px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 496px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 504px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 512px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 520px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 528px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 536px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 544px; top: 56px; background: rgb(10, 31, 38); opacity: 0.0964891;"></div><div class="pixel" style="left: 576px; top: 56px; background: rgb(41, 128, 156); opacity: 0.510588;"></div><div class="pixel" style="left: 584px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 592px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 600px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 608px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 616px; top: 56px; background: rgb(6, 19, 22); opacity: 0.0522649;"></div><div class="pixel" style="left: 632px; top: 56px; background: rgb(28, 90, 110); opacity: 0.325651;"></div><div class="pixel" style="left: 640px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 648px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 656px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 664px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 672px; top: 56px; background: rgb(28, 88, 107); opacity: 0.31359;"></div><div class="pixel" style="left: 736px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 744px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 752px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 760px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 768px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 776px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 784px; top: 56px; background: rgb(41, 128, 156); opacity: 0.512598;"></div><div class="pixel" style="left: 792px; top: 56px; background: rgb(26, 81, 99); opacity: 0.291478;"></div><div class="pixel" style="left: 32px; top: 64px; background: rgb(11, 36, 44); opacity: 0.102881;"></div><div class="pixel" style="left: 40px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 48px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 56px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 64px; top: 64px; background: rgb(41, 128, 156); opacity: 0.482016;"></div><div class="pixel" style="left: 72px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 80px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 88px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 96px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 152px; top: 64px; background: rgb(41, 128, 156); opacity: 0.482016;"></div><div class="pixel" style="left: 160px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 168px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 176px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 184px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 192px; top: 64px; background: rgb(34, 106, 129); opacity: 0.37342;"></div><div class="pixel" style="left: 224px; top: 64px; background: rgb(33, 104, 128); opacity: 0.371515;"></div><div class="pixel" style="left: 232px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 240px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 248px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 256px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 264px; top: 64px; background: rgb(23, 73, 89); opacity: 0.245771;"></div><div class="pixel" style="left: 288px; top: 64px; background: rgb(27, 86, 104); opacity: 0.291496;"></div><div class="pixel" style="left: 296px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 304px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 312px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 320px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 328px; top: 64px; background: rgb(21, 64, 78); opacity: 0.209572;"></div><div class="pixel" style="left: 360px; top: 64px; background: rgb(13, 40, 48); opacity: 0.116217;"></div><div class="pixel" style="left: 368px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 376px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 384px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 392px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 400px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 424px; top: 64px; background: rgb(15, 46, 56); opacity: 0.148606;"></div><div class="pixel" style="left: 432px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 440px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 448px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 456px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 464px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 472px; top: 64px; background: rgb(21, 65, 79); opacity: 0.215288;"></div><div class="pixel" style="left: 496px; top: 64px; background: rgb(10, 32, 39); opacity: 0.0895445;"></div><div class="pixel" style="left: 504px; top: 64px; background: rgb(39, 122, 148); opacity: 0.445818;"></div><div class="pixel" style="left: 512px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 520px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 528px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 536px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 544px; top: 64px; background: rgb(38, 118, 144); opacity: 0.42486;"></div><div class="pixel" style="left: 576px; top: 64px; background: rgb(20, 61, 73); opacity: 0.194331;"></div><div class="pixel" style="left: 584px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 592px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 600px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 608px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 616px; top: 64px; background: rgb(35, 110, 134); opacity: 0.394377;"></div><div class="pixel" style="left: 624px; top: 64px; background: rgb(6, 19, 22); opacity: 0.0476301;"></div><div class="pixel" style="left: 632px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 640px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 648px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 656px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 664px; top: 64px; background: rgb(40, 127, 154); opacity: 0.46487;"></div><div class="pixel" style="left: 728px; top: 64px; background: rgb(23, 71, 87); opacity: 0.23815;"></div><div class="pixel" style="left: 736px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 744px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 752px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 760px; top: 64px; background: rgb(41, 128, 156); opacity: 0.482016;"></div><div class="pixel" style="left: 768px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 776px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 784px; top: 64px; background: rgb(41, 128, 156); opacity: 0.485827;"></div><div class="pixel" style="left: 792px; top: 64px; background: rgb(41, 127, 155); opacity: 0.476301;"></div><div class="pixel" style="left: 32px; top: 72px; background: rgb(31, 101, 123); opacity: 0.327639;"></div><div class="pixel" style="left: 40px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 48px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 56px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 64px; top: 72px; background: rgb(30, 93, 113); opacity: 0.302436;"></div><div class="pixel" style="left: 72px; top: 72px; background: rgb(40, 126, 154); opacity: 0.444653;"></div><div class="pixel" style="left: 80px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 88px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 96px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 104px; top: 72px; background: rgb(24, 74, 90); opacity: 0.235828;"></div><div class="pixel" style="left: 144px; top: 72px; background: rgb(14, 44, 53); opacity: 0.126015;"></div><div class="pixel" style="left: 152px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 160px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 168px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 176px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 184px; top: 72px; background: rgb(39, 124, 151); opacity: 0.428451;"></div><div class="pixel" style="left: 232px; top: 72px; background: rgb(40, 125, 153); opacity: 0.435652;"></div><div class="pixel" style="left: 240px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 248px; top: 72px; background: rgb(38, 118, 146); opacity: 0.397848;"></div><div class="pixel" style="left: 256px; top: 72px; background: rgb(27, 82, 99); opacity: 0.262832;"></div><div class="pixel" style="left: 264px; top: 72px; background: rgb(13, 41, 50); opacity: 0.113414;"></div><div class="pixel" style="left: 288px; top: 72px; background: rgb(27, 86, 104); opacity: 0.275433;"></div><div class="pixel" style="left: 296px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 304px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 312px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 320px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 328px; top: 72px; background: rgb(21, 64, 78); opacity: 0.198024;"></div><div class="pixel" style="left: 368px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 376px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 384px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 392px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 400px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 424px; top: 72px; background: rgb(35, 110, 134); opacity: 0.365444;"></div><div class="pixel" style="left: 432px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 440px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 448px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 456px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 464px; top: 72px; background: rgb(22, 68, 85); opacity: 0.214226;"></div><div class="pixel" style="left: 512px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 520px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 528px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 536px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 544px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 584px; top: 72px; background: rgb(36, 112, 136); opacity: 0.381646;"></div><div class="pixel" style="left: 592px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 600px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 608px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 616px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 624px; top: 72px; background: rgb(38, 120, 146); opacity: 0.408649;"></div><div class="pixel" style="left: 632px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 640px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 648px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 656px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 664px; top: 72px; background: rgb(12, 37, 46); opacity: 0.109813;"></div><div class="pixel" style="left: 728px; top: 72px; background: rgb(40, 126, 153); opacity: 0.435652;"></div><div class="pixel" style="left: 736px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 744px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 752px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 760px; top: 72px; background: rgb(20, 63, 79); opacity: 0.185422;"></div><div class="pixel" style="left: 768px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 776px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 784px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 792px; top: 72px; background: rgb(41, 128, 156); opacity: 0.459055;"></div><div class="pixel" style="left: 800px; top: 72px; background: rgb(12, 40, 48); opacity: 0.108013;"></div><div class="pixel" style="left: 32px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 40px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 48px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 56px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 64px; top: 80px; background: rgb(13, 41, 50); opacity: 0.11019;"></div><div class="pixel" style="left: 72px; top: 80px; background: rgb(28, 87, 105); opacity: 0.262761;"></div><div class="pixel" style="left: 80px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 88px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 96px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 104px; top: 80px; background: rgb(40, 126, 154); opacity: 0.415331;"></div><div class="pixel" style="left: 144px; top: 80px; background: rgb(26, 82, 102); opacity: 0.245808;"></div><div class="pixel" style="left: 152px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 160px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 168px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 176px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 184px; top: 80px; background: rgb(22, 69, 85); opacity: 0.208513;"></div><div class="pixel" style="left: 288px; top: 80px; background: rgb(27, 86, 104); opacity: 0.25937;"></div><div class="pixel" style="left: 296px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 304px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 312px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 320px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 328px; top: 80px; background: rgb(21, 64, 78); opacity: 0.18478;"></div><div class="pixel" style="left: 360px; top: 80px; background: rgb(27, 83, 101); opacity: 0.250894;"></div><div class="pixel" style="left: 368px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 376px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 384px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 392px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 400px; top: 80px; background: rgb(37, 114, 138); opacity: 0.354303;"></div><div class="pixel" style="left: 424px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 432px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 440px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 448px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 456px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 512px; top: 80px; background: rgb(31, 96, 117); opacity: 0.300056;"></div><div class="pixel" style="left: 520px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 528px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 536px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 544px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 552px; top: 80px; background: rgb(17, 53, 65); opacity: 0.14918;"></div><div class="pixel" style="left: 592px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 600px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 608px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 616px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 624px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 632px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 640px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 648px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 656px; top: 80px; background: rgb(31, 100, 121); opacity: 0.306836;"></div><div class="pixel" style="left: 720px; top: 80px; background: rgb(9, 30, 36); opacity: 0.0695044;"></div><div class="pixel" style="left: 728px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 736px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 744px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 752px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 768px; top: 80px; background: rgb(38, 119, 147); opacity: 0.381427;"></div><div class="pixel" style="left: 776px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 784px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 792px; top: 80px; background: rgb(41, 128, 156); opacity: 0.432283;"></div><div class="pixel" style="left: 800px; top: 80px; background: rgb(33, 102, 125); opacity: 0.318703;"></div><div class="pixel" style="left: 24px; top: 88px; background: rgb(18, 57, 69); opacity: 0.154254;"></div><div class="pixel" style="left: 32px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 40px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 48px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 56px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 72px; top: 88px; background: rgb(11, 33, 40); opacity: 0.0795121;"></div><div class="pixel" style="left: 80px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 88px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 96px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 104px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 112px; top: 88px; background: rgb(10, 31, 38); opacity: 0.0747414;"></div><div class="pixel" style="left: 144px; top: 88px; background: rgb(32, 101, 122); opacity: 0.291014;"></div><div class="pixel" style="left: 152px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 160px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 168px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 176px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 184px; top: 88px; background: rgb(13, 44, 53); opacity: 0.106546;"></div><div class="pixel" style="left: 288px; top: 88px; background: rgb(27, 86, 104); opacity: 0.243307;"></div><div class="pixel" style="left: 296px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 304px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 312px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 320px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 328px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 336px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 344px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 352px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 360px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 368px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 376px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 384px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 392px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 400px; top: 88px; background: rgb(10, 32, 39); opacity: 0.0795121;"></div><div class="pixel" style="left: 424px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 432px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 440px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 448px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 456px; top: 88px; background: rgb(41, 128, 156); opacity: 0.403922;"></div><div class="pixel" style="left: 512px; top: 88px; background: rgb(21, 66, 80); opacity: 0.190829;"></div><div class="pixel" style="left: 520px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 528px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 536px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 544px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 552px; top: 88px; background: rgb(23, 72, 88); opacity: 0.206732;"></div><div class="pixel" style="left: 592px; top: 88px; background: rgb(21, 66, 80); opacity: 0.179697;"></div><div class="pixel" style="left: 600px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 608px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 616px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 624px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 632px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 640px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 648px; top: 88px; background: rgb(41, 128, 156); opacity: 0.400741;"></div><div class="pixel" style="left: 720px; top: 88px; background: rgb(29, 92, 112); opacity: 0.267161;"></div><div class="pixel" style="left: 728px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 736px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 744px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 752px; top: 88px; background: rgb(38, 122, 148); opacity: 0.364166;"></div><div class="pixel" style="left: 768px; top: 88px; background: rgb(22, 68, 83); opacity: 0.192419;"></div><div class="pixel" style="left: 776px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 784px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 792px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 800px; top: 88px; background: rgb(41, 128, 156); opacity: 0.405512;"></div><div class="pixel" style="left: 24px; top: 96px; background: rgb(38, 118, 144); opacity: 0.332697;"></div><div class="pixel" style="left: 32px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 40px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 48px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 56px; top: 96px; background: rgb(34, 106, 130); opacity: 0.294081;"></div><div class="pixel" style="left: 80px; top: 96px; background: rgb(41, 128, 156); opacity: 0.377255;"></div><div class="pixel" style="left: 88px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 96px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 104px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 112px; top: 96px; background: rgb(31, 96, 117); opacity: 0.258434;"></div><div class="pixel" style="left: 144px; top: 96px; background: rgb(34, 112, 135); opacity: 0.298536;"></div><div class="pixel" style="left: 152px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 160px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 168px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 176px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 184px; top: 96px; background: rgb(10, 32, 39); opacity: 0.0787185;"></div><div class="pixel" style="left: 288px; top: 96px; background: rgb(27, 86, 104); opacity: 0.227244;"></div><div class="pixel" style="left: 296px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 304px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 312px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 320px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 328px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 336px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 344px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 352px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 360px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 368px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 376px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 384px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 392px; top: 96px; background: rgb(17, 53, 64); opacity: 0.126247;"></div><div class="pixel" style="left: 424px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 432px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 440px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 448px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 456px; top: 96px; background: rgb(41, 128, 156); opacity: 0.357947;"></div><div class="pixel" style="left: 512px; top: 96px; background: rgb(20, 64, 76); opacity: 0.150011;"></div><div class="pixel" style="left: 520px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 528px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 536px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 544px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 552px; top: 96px; background: rgb(24, 75, 91); opacity: 0.212392;"></div><div class="pixel" style="left: 592px; top: 96px; background: rgb(7, 20, 25); opacity: 0.0430724;"></div><div class="pixel" style="left: 600px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 608px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 616px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 624px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 632px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 640px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 648px; top: 96px; background: rgb(30, 96, 117); opacity: 0.25992;"></div><div class="pixel" style="left: 720px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 728px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 736px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 744px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 752px; top: 96px; background: rgb(23, 71, 87); opacity: 0.188627;"></div><div class="pixel" style="left: 776px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 784px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 792px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 800px; top: 96px; background: rgb(41, 128, 156); opacity: 0.37874;"></div><div class="pixel" style="left: 808px; top: 96px; background: rgb(19, 59, 73); opacity: 0.152981;"></div><div class="pixel" style="left: 24px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 32px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 40px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 48px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 56px; top: 104px; background: rgb(18, 55, 67); opacity: 0.131126;"></div><div class="pixel" style="left: 80px; top: 104px; background: rgb(32, 100, 121); opacity: 0.251209;"></div><div class="pixel" style="left: 88px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 96px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 104px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 112px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 144px; top: 104px; background: rgb(32, 100, 122); opacity: 0.25535;"></div><div class="pixel" style="left: 152px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 160px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 168px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 176px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 184px; top: 104px; background: rgb(12, 37, 45); opacity: 0.0841964;"></div><div class="pixel" style="left: 288px; top: 104px; background: rgb(27, 86, 104); opacity: 0.211181;"></div><div class="pixel" style="left: 296px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 304px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 312px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 320px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 328px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 336px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 344px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 352px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 360px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 368px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 376px; top: 104px; background: rgb(30, 95, 117); opacity: 0.222223;"></div><div class="pixel" style="left: 424px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 432px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 440px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 448px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 456px; top: 104px; background: rgb(41, 128, 156); opacity: 0.346447;"></div><div class="pixel" style="left: 512px; top: 104px; background: rgb(21, 67, 81); opacity: 0.167013;"></div><div class="pixel" style="left: 520px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 528px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 536px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 544px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 552px; top: 104px; background: rgb(23, 72, 88); opacity: 0.175294;"></div><div class="pixel" style="left: 592px; top: 104px; background: rgb(38, 117, 143); opacity: 0.311941;"></div><div class="pixel" style="left: 600px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 608px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 616px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 624px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 632px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 640px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 648px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 656px; top: 104px; background: rgb(10, 32, 39); opacity: 0.0690134;"></div><div class="pixel" style="left: 712px; top: 104px; background: rgb(16, 51, 62); opacity: 0.115943;"></div><div class="pixel" style="left: 720px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 728px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 736px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 744px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 752px; top: 104px; background: rgb(7, 22, 26); opacity: 0.035887;"></div><div class="pixel" style="left: 776px; top: 104px; background: rgb(40, 125, 153); opacity: 0.336786;"></div><div class="pixel" style="left: 784px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 792px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 800px; top: 104px; background: rgb(41, 128, 156); opacity: 0.351969;"></div><div class="pixel" style="left: 808px; top: 104px; background: rgb(39, 121, 147); opacity: 0.314701;"></div><div class="pixel" style="left: 16px; top: 112px; background: rgb(26, 79, 96); opacity: 0.179815;"></div><div class="pixel" style="left: 24px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 32px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 40px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 48px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 56px; top: 112px; background: rgb(26, 81, 98); opacity: 0.182365;"></div><div class="pixel" style="left: 64px; top: 112px; background: rgb(24, 75, 91); opacity: 0.174714;"></div><div class="pixel" style="left: 72px; top: 112px; background: rgb(24, 75, 91); opacity: 0.174714;"></div><div class="pixel" style="left: 80px; top: 112px; background: rgb(32, 100, 121); opacity: 0.233377;"></div><div class="pixel" style="left: 88px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 96px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 104px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 112px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 120px; top: 112px; background: rgb(17, 53, 65); opacity: 0.114775;"></div><div class="pixel" style="left: 144px; top: 112px; background: rgb(27, 84, 102); opacity: 0.188742;"></div><div class="pixel" style="left: 152px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 160px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 168px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 176px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 184px; top: 112px; background: rgb(19, 61, 74); opacity: 0.132629;"></div><div class="pixel" style="left: 232px; top: 112px; background: rgb(25, 78, 95); opacity: 0.175989;"></div><div class="pixel" style="left: 240px; top: 112px; background: rgb(33, 103, 126); opacity: 0.241028;"></div><div class="pixel" style="left: 248px; top: 112px; background: rgb(16, 53, 64); opacity: 0.11095;"></div><div class="pixel" style="left: 288px; top: 112px; background: rgb(27, 86, 104); opacity: 0.195118;"></div><div class="pixel" style="left: 296px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 304px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 312px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 320px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 328px; top: 112px; background: rgb(21, 64, 78); opacity: 0.140281;"></div><div class="pixel" style="left: 336px; top: 112px; background: rgb(6, 20, 25); opacity: 0.031882;"></div><div class="pixel" style="left: 344px; top: 112px; background: rgb(37, 115, 140); opacity: 0.281837;"></div><div class="pixel" style="left: 352px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 360px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 368px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 376px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 384px; top: 112px; background: rgb(35, 109, 133); opacity: 0.260157;"></div><div class="pixel" style="left: 424px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 432px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 440px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 448px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 456px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 512px; top: 112px; background: rgb(30, 93, 114); opacity: 0.215523;"></div><div class="pixel" style="left: 520px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 528px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 536px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 544px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 552px; top: 112px; background: rgb(17, 53, 67); opacity: 0.1135;"></div><div class="pixel" style="left: 584px; top: 112px; background: rgb(23, 71, 87); opacity: 0.15941;"></div><div class="pixel" style="left: 592px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 600px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 608px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 616px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 624px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 632px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 640px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 648px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 656px; top: 112px; background: rgb(40, 125, 152); opacity: 0.307343;"></div><div class="pixel" style="left: 712px; top: 112px; background: rgb(36, 113, 138); opacity: 0.269084;"></div><div class="pixel" style="left: 720px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 728px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 736px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 744px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 752px; top: 112px; background: rgb(24, 75, 91); opacity: 0.174714;"></div><div class="pixel" style="left: 760px; top: 112px; background: rgb(24, 75, 91); opacity: 0.174714;"></div><div class="pixel" style="left: 768px; top: 112px; background: rgb(24, 75, 91); opacity: 0.174714;"></div><div class="pixel" style="left: 776px; top: 112px; background: rgb(36, 115, 139); opacity: 0.274186;"></div><div class="pixel" style="left: 784px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 792px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 800px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 808px; top: 112px; background: rgb(41, 128, 156); opacity: 0.325197;"></div><div class="pixel" style="left: 16px; top: 120px; background: rgb(41, 127, 155); opacity: 0.291403;"></div><div class="pixel" style="left: 24px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 32px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 40px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 48px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 56px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 64px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 72px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 80px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 88px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 96px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 104px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 112px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 120px; top: 120px; background: rgb(37, 115, 140); opacity: 0.253954;"></div><div class="pixel" style="left: 144px; top: 120px; background: rgb(14, 45, 57); opacity: 0.0866018;"></div><div class="pixel" style="left: 152px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 160px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 168px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 176px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 184px; top: 120px; background: rgb(34, 107, 131); opacity: 0.234059;"></div><div class="pixel" style="left: 232px; top: 120px; background: rgb(40, 126, 154); opacity: 0.285552;"></div><div class="pixel" style="left: 240px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 248px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 256px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 264px; top: 120px; background: rgb(38, 118, 144); opacity: 0.255124;"></div><div class="pixel" style="left: 288px; top: 120px; background: rgb(27, 86, 104); opacity: 0.179055;"></div><div class="pixel" style="left: 296px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 304px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 312px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 320px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 328px; top: 120px; background: rgb(21, 64, 78); opacity: 0.128732;"></div><div class="pixel" style="left: 352px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 360px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 368px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 376px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 384px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 392px; top: 120px; background: rgb(27, 87, 106); opacity: 0.179055;"></div><div class="pixel" style="left: 424px; top: 120px; background: rgb(37, 116, 143); opacity: 0.252784;"></div><div class="pixel" style="left: 432px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 440px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 448px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 456px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 464px; top: 120px; background: rgb(16, 49, 59); opacity: 0.0936236;"></div><div class="pixel" style="left: 512px; top: 120px; background: rgb(41, 127, 155); opacity: 0.291403;"></div><div class="pixel" style="left: 520px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 528px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 536px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 544px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 576px; top: 120px; background: rgb(6, 18, 23); opacity: 0.0304277;"></div><div class="pixel" style="left: 584px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 592px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 600px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 608px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 616px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 624px; top: 120px; background: rgb(37, 116, 141); opacity: 0.258635;"></div><div class="pixel" style="left: 632px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 640px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 648px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 656px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 664px; top: 120px; background: rgb(27, 87, 107); opacity: 0.181396;"></div><div class="pixel" style="left: 712px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 720px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 728px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 736px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 744px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 752px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 760px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 768px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 776px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 784px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 792px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 800px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 808px; top: 120px; background: rgb(41, 128, 156); opacity: 0.298425;"></div><div class="pixel" style="left: 816px; top: 120px; background: rgb(26, 83, 101); opacity: 0.172033;"></div><div class="pixel" style="left: 8px; top: 128px; background: rgb(12, 36, 44); opacity: 0.0607226;"></div><div class="pixel" style="left: 16px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 24px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 32px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 40px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 48px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 56px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 64px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 72px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 80px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 88px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 96px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 104px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 112px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 120px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 152px; top: 128px; background: rgb(41, 128, 156); opacity: 0.270588;"></div><div class="pixel" style="left: 160px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 168px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 176px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 184px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 192px; top: 128px; background: rgb(21, 64, 78); opacity: 0.117184;"></div><div class="pixel" style="left: 224px; top: 128px; background: rgb(31, 95, 116); opacity: 0.182168;"></div><div class="pixel" style="left: 232px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 240px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 248px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 256px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 264px; top: 128px; background: rgb(28, 87, 108); opacity: 0.169384;"></div><div class="pixel" style="left: 288px; top: 128px; background: rgb(27, 86, 104); opacity: 0.162992;"></div><div class="pixel" style="left: 296px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 304px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 312px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 320px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 328px; top: 128px; background: rgb(21, 64, 78); opacity: 0.117184;"></div><div class="pixel" style="left: 352px; top: 128px; background: rgb(27, 84, 103); opacity: 0.162992;"></div><div class="pixel" style="left: 360px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 368px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 376px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 384px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 392px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 424px; top: 128px; background: rgb(19, 58, 71); opacity: 0.103335;"></div><div class="pixel" style="left: 432px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 440px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 448px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 456px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 464px; top: 128px; background: rgb(41, 129, 157); opacity: 0.268458;"></div><div class="pixel" style="left: 472px; top: 128px; background: rgb(10, 33, 40); opacity: 0.0522001;"></div><div class="pixel" style="left: 504px; top: 128px; background: rgb(31, 100, 121); opacity: 0.193886;"></div><div class="pixel" style="left: 512px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 520px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 528px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 536px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 544px; top: 128px; background: rgb(39, 123, 150); opacity: 0.251413;"></div><div class="pixel" style="left: 576px; top: 128px; background: rgb(37, 116, 142); opacity: 0.236498;"></div><div class="pixel" style="left: 584px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 592px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 600px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 608px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 616px; top: 128px; background: rgb(26, 83, 100); opacity: 0.157666;"></div><div class="pixel" style="left: 624px; top: 128px; background: rgb(6, 18, 22); opacity: 0.027698;"></div><div class="pixel" style="left: 632px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 640px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 648px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 656px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 664px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 672px; top: 128px; background: rgb(10, 29, 36); opacity: 0.0490042;"></div><div class="pixel" style="left: 704px; top: 128px; background: rgb(23, 74, 90); opacity: 0.135294;"></div><div class="pixel" style="left: 712px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 720px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 728px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 736px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 744px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 752px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 760px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 768px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 776px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 784px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 792px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 800px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 808px; top: 128px; background: rgb(41, 128, 156); opacity: 0.271654;"></div><div class="pixel" style="left: 816px; top: 128px; background: rgb(41, 128, 156); opacity: 0.267392;"></div><div class="pixel" style="left: 8px; top: 136px; background: rgb(32, 101, 124); opacity: 0.176699;"></div><div class="pixel" style="left: 16px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 24px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 32px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 40px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 48px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 56px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 64px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 72px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 80px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 88px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 96px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 104px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 112px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 120px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 128px; top: 136px; background: rgb(24, 76, 92); opacity: 0.127723;"></div><div class="pixel" style="left: 152px; top: 136px; background: rgb(21, 67, 81); opacity: 0.112358;"></div><div class="pixel" style="left: 160px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 168px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 176px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 184px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 192px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 200px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 208px; top: 136px; background: rgb(41, 128, 156); opacity: 0.241041;"></div><div class="pixel" style="left: 216px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 224px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 232px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 240px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 248px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 256px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 288px; top: 136px; background: rgb(27, 86, 104); opacity: 0.146929;"></div><div class="pixel" style="left: 296px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 304px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 312px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 320px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 328px; top: 136px; background: rgb(21, 64, 78); opacity: 0.105635;"></div><div class="pixel" style="left: 360px; top: 136px; background: rgb(41, 128, 156); opacity: 0.243922;"></div><div class="pixel" style="left: 368px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 376px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 384px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 392px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 400px; top: 136px; background: rgb(32, 100, 122); opacity: 0.175739;"></div><div class="pixel" style="left: 432px; top: 136px; background: rgb(39, 122, 148); opacity: 0.224715;"></div><div class="pixel" style="left: 440px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 448px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 456px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 464px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 472px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 480px; top: 136px; background: rgb(41, 128, 156); opacity: 0.242961;"></div><div class="pixel" style="left: 488px; top: 136px; background: rgb(41, 128, 156); opacity: 0.237199;"></div><div class="pixel" style="left: 496px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 504px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 512px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 520px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 528px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 536px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 544px; top: 136px; background: rgb(14, 47, 57); opacity: 0.0672225;"></div><div class="pixel" style="left: 568px; top: 136px; background: rgb(22, 68, 82); opacity: 0.114278;"></div><div class="pixel" style="left: 576px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 584px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 592px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 600px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 608px; top: 136px; background: rgb(41, 127, 154); opacity: 0.235279;"></div><div class="pixel" style="left: 632px; top: 136px; background: rgb(26, 81, 98); opacity: 0.137326;"></div><div class="pixel" style="left: 640px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 648px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 656px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 664px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 672px; top: 136px; background: rgb(40, 124, 151); opacity: 0.229517;"></div><div class="pixel" style="left: 704px; top: 136px; background: rgb(40, 125, 153); opacity: 0.233358;"></div><div class="pixel" style="left: 712px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 720px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 728px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 736px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 744px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 752px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 760px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 768px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 776px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 784px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 792px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 800px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 808px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 816px; top: 136px; background: rgb(41, 128, 156); opacity: 0.244882;"></div><div class="pixel" style="left: 824px; top: 136px; background: rgb(12, 39, 49); opacity: 0.0595399;"></div><div class="pixel" style="left: 8px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 16px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 24px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 32px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 40px; top: 144px; background: rgb(40, 126, 154); opacity: 0.208702;"></div><div class="pixel" style="left: 96px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 104px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 112px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 120px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 128px; top: 144px; background: rgb(40, 126, 154); opacity: 0.210412;"></div><div class="pixel" style="left: 160px; top: 144px; background: rgb(33, 103, 126); opacity: 0.169356;"></div><div class="pixel" style="left: 168px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 176px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 184px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 192px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 200px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 208px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 216px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 224px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 232px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 240px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 248px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 256px; top: 144px; background: rgb(22, 70, 85); opacity: 0.103495;"></div><div class="pixel" style="left: 288px; top: 144px; background: rgb(27, 86, 104); opacity: 0.130866;"></div><div class="pixel" style="left: 296px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 304px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 312px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 320px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 328px; top: 144px; background: rgb(21, 64, 78); opacity: 0.0940868;"></div><div class="pixel" style="left: 360px; top: 144px; background: rgb(23, 72, 88); opacity: 0.107772;"></div><div class="pixel" style="left: 368px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 376px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 384px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 392px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 400px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 408px; top: 144px; background: rgb(6, 19, 24); opacity: 0.023094;"></div><div class="pixel" style="left: 432px; top: 144px; background: rgb(6, 19, 23); opacity: 0.0239494;"></div><div class="pixel" style="left: 440px; top: 144px; background: rgb(41, 128, 156); opacity: 0.2164;"></div><div class="pixel" style="left: 448px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 456px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 464px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 472px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 480px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 488px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 496px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 504px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 512px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 520px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 528px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 536px; top: 144px; background: rgb(27, 85, 104); opacity: 0.130866;"></div><div class="pixel" style="left: 568px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 576px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 584px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 592px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 600px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 608px; top: 144px; background: rgb(14, 43, 52); opacity: 0.0590181;"></div><div class="pixel" style="left: 640px; top: 144px; background: rgb(40, 125, 153); opacity: 0.208702;"></div><div class="pixel" style="left: 648px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 656px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 664px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 672px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 680px; top: 144px; background: rgb(27, 85, 103); opacity: 0.1283;"></div><div class="pixel" style="left: 696px; top: 144px; background: rgb(10, 30, 37); opacity: 0.0367794;"></div><div class="pixel" style="left: 704px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 712px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 720px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 728px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 736px; top: 144px; background: rgb(32, 99, 121); opacity: 0.155671;"></div><div class="pixel" style="left: 784px; top: 144px; background: rgb(16, 50, 61); opacity: 0.0727034;"></div><div class="pixel" style="left: 792px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 800px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 808px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 816px; top: 144px; background: rgb(41, 128, 156); opacity: 0.21811;"></div><div class="pixel" style="left: 824px; top: 144px; background: rgb(33, 105, 128); opacity: 0.162514;"></div><div class="pixel" style="left: 0px; top: 152px; background: rgb(19, 58, 70); opacity: 0.0757851;"></div><div class="pixel" style="left: 8px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 16px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 24px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 32px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 40px; top: 152px; background: rgb(27, 85, 105); opacity: 0.114053;"></div><div class="pixel" style="left: 96px; top: 152px; background: rgb(41, 127, 154); opacity: 0.182334;"></div><div class="pixel" style="left: 104px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 112px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 120px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 128px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 136px; top: 152px; background: rgb(10, 33, 40); opacity: 0.036767;"></div><div class="pixel" style="left: 168px; top: 152px; background: rgb(31, 95, 116); opacity: 0.128309;"></div><div class="pixel" style="left: 176px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 184px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 192px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 200px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 208px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 216px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 224px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 232px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 240px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 248px; top: 152px; background: rgb(22, 71, 88); opacity: 0.0900417;"></div><div class="pixel" style="left: 288px; top: 152px; background: rgb(27, 86, 104); opacity: 0.114803;"></div><div class="pixel" style="left: 296px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 304px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 312px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 320px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 328px; top: 152px; background: rgb(21, 64, 78); opacity: 0.0825382;"></div><div class="pixel" style="left: 368px; top: 152px; background: rgb(41, 127, 155); opacity: 0.186086;"></div><div class="pixel" style="left: 376px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 384px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 392px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 400px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 408px; top: 152px; background: rgb(34, 106, 129); opacity: 0.145567;"></div><div class="pixel" style="left: 448px; top: 152px; background: rgb(37, 116, 142); opacity: 0.167327;"></div><div class="pixel" style="left: 456px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 464px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 472px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 480px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 488px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 496px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 504px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 512px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 520px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 528px; top: 152px; background: rgb(21, 66, 80); opacity: 0.0832886;"></div><div class="pixel" style="left: 560px; top: 152px; background: rgb(36, 115, 140); opacity: 0.163576;"></div><div class="pixel" style="left: 568px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 576px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 584px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 592px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 600px; top: 152px; background: rgb(34, 107, 130); opacity: 0.147818;"></div><div class="pixel" style="left: 640px; top: 152px; background: rgb(13, 41, 50); opacity: 0.0480222;"></div><div class="pixel" style="left: 648px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 656px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 664px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 672px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 680px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 688px; top: 152px; background: rgb(9, 27, 32); opacity: 0.0315146;"></div><div class="pixel" style="left: 696px; top: 152px; background: rgb(30, 95, 116); opacity: 0.128309;"></div><div class="pixel" style="left: 704px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 712px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 720px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 728px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 736px; top: 152px; background: rgb(15, 48, 59); opacity: 0.0607781;"></div><div class="pixel" style="left: 792px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 800px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 808px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 816px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 824px; top: 152px; background: rgb(41, 128, 156); opacity: 0.191339;"></div><div class="pixel" style="left: 0px; top: 160px; background: rgb(27, 86, 105); opacity: 0.0909958;"></div><div class="pixel" style="left: 8px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 16px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 24px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 32px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 40px; top: 160px; background: rgb(9, 28, 35); opacity: 0.0271051;"></div><div class="pixel" style="left: 96px; top: 160px; background: rgb(20, 64, 77); opacity: 0.0684082;"></div><div class="pixel" style="left: 104px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 112px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 120px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 128px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 136px; top: 160px; background: rgb(20, 67, 81); opacity: 0.0690536;"></div><div class="pixel" style="left: 176px; top: 160px; background: rgb(6, 19, 23); opacity: 0.016134;"></div><div class="pixel" style="left: 184px; top: 160px; background: rgb(24, 74, 91); opacity: 0.0851876;"></div><div class="pixel" style="left: 192px; top: 160px; background: rgb(36, 116, 140); opacity: 0.13488;"></div><div class="pixel" style="left: 200px; top: 160px; background: rgb(41, 128, 156); opacity: 0.158759;"></div><div class="pixel" style="left: 208px; top: 160px; background: rgb(41, 128, 156); opacity: 0.164567;"></div><div class="pixel" style="left: 216px; top: 160px; background: rgb(41, 128, 156); opacity: 0.159404;"></div><div class="pixel" style="left: 224px; top: 160px; background: rgb(37, 114, 139); opacity: 0.135526;"></div><div class="pixel" style="left: 232px; top: 160px; background: rgb(23, 73, 89); opacity: 0.0851876;"></div><div class="pixel" style="left: 288px; top: 160px; background: rgb(19, 63, 77); opacity: 0.0651814;"></div><div class="pixel" style="left: 296px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 304px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 312px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 320px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 328px; top: 160px; background: rgb(14, 46, 56); opacity: 0.046466;"></div><div class="pixel" style="left: 368px; top: 160px; background: rgb(15, 51, 61); opacity: 0.0522742;"></div><div class="pixel" style="left: 376px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 384px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 392px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 400px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 408px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 456px; top: 160px; background: rgb(11, 35, 42); opacity: 0.0354948;"></div><div class="pixel" style="left: 464px; top: 160px; background: rgb(28, 86, 105); opacity: 0.101322;"></div><div class="pixel" style="left: 472px; top: 160px; background: rgb(39, 122, 149); opacity: 0.144561;"></div><div class="pixel" style="left: 480px; top: 160px; background: rgb(41, 128, 156); opacity: 0.16134;"></div><div class="pixel" style="left: 488px; top: 160px; background: rgb(41, 128, 156); opacity: 0.164567;"></div><div class="pixel" style="left: 496px; top: 160px; background: rgb(41, 128, 156); opacity: 0.159404;"></div><div class="pixel" style="left: 504px; top: 160px; background: rgb(34, 107, 130); opacity: 0.127136;"></div><div class="pixel" style="left: 512px; top: 160px; background: rgb(20, 66, 80); opacity: 0.0722804;"></div><div class="pixel" style="left: 552px; top: 160px; background: rgb(12, 36, 46); opacity: 0.0361402;"></div><div class="pixel" style="left: 560px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 568px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 576px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 584px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 592px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 648px; top: 160px; background: rgb(28, 84, 103); opacity: 0.0935773;"></div><div class="pixel" style="left: 656px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 664px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 672px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 680px; top: 160px; background: rgb(32, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 688px; top: 160px; background: rgb(29, 92, 111); opacity: 0.0974494;"></div><div class="pixel" style="left: 696px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 704px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 712px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 720px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 728px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 792px; top: 160px; background: rgb(28, 90, 109); opacity: 0.0987402;"></div><div class="pixel" style="left: 800px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 808px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 816px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 824px; top: 160px; background: rgb(30, 97, 118); opacity: 0.109711;"></div><div class="pixel" style="left: 832px; top: 160px; background: rgb(26, 78, 95); opacity: 0.0767979;"></div></div>`

    const span = document.createElement("span");
    span.className = "acrx-footer-l";
    span.style.cssText = "display:block; margin-top:6px; font-size:0.95em; opacity:0.85;";
    span.textContent = pickLine();

    container.appendChild(span);
    footer.appendChild(branding);
}

function applyThemeSwitch() {
    const classic = document.querySelector(".classic");
    if (classic) {
        classic.classList.add("modern");
        classic.classList.remove("classic");
    }
}
(function () {
  const lightIcon = "/assets/icon_light.svg";
  const darkIcon = "/assets/icon.svg";

  const favicon = document.getElementById("favicon");

  if (!favicon) return;

  function updateFavicon() {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    // cache-busting to force update in Chrome
    const iconPath = (isDark ? darkIcon : lightIcon) + "?v=" + Date.now();

    favicon.href = iconPath;
  }

  // initial load
  updateFavicon();

  // listen for system theme change
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", updateFavicon);
})();
document.addEventListener("DOMContentLoaded", () => {

    setTimeout(() => {

        document.body.classList.add('acroxa-ready');

        const items = [
            document.querySelector('.acroxa-hamburger'),

            ...document.querySelectorAll(
                '.top-bar .acroxa-item'
            ),
            document.querySelector('.acroxa-cmdk-trigger'),

            document.querySelector('.plugin-dropdown-btn'),
            ...document.querySelectorAll(
                '.w30 .tabs'
            ),
            ...document.querySelectorAll(
                '.w30 .acroxa-item'
            ),

            ...document.querySelectorAll(
                '.w30 .acroxa-extra-item'
            ),


        ].filter(Boolean);

        items.forEach((item, index) => {

            setTimeout(() => {
                item.classList.add('animate-in');
            }, 100 + (index * 80));

        });

    }, 1500);

});

document.addEventListener('DOMContentLoaded', () => {

    // hljs.js loads after this bundle on some pages: highlight when the
    // library is actually present instead of throwing and aborting setup.
    if (typeof hljs === "undefined") {
      window.addEventListener("load", () => {
        if (typeof hljs === "undefined") return;
        document.querySelectorAll("pre code").forEach((block) => {
          try { hljs.highlightElement(block); } catch { /* decorative */ }
        });
      }, { once: true });
      return;
    }

    const highlightAll = () => {
      document.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block);
      });
    };

    /* Initial highlight */
    highlightAll();

    /* Auto re-highlight dynamically added code */
    const observer = new MutationObserver((mutations) => {

      for (const mutation of mutations) {

        mutation.addedNodes.forEach((node) => {

          if (!(node instanceof HTMLElement)) return;

          /* direct code block */
          if (node.matches("pre code")) {
            hljs.highlightElement(node);
          }

          /* nested code blocks */
          node.querySelectorAll?.("pre code").forEach((block) => {
            hljs.highlightElement(block);
          });

        });

      }

    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

  });
  /* /acrx/assets/js/header-profile.js */

(function () {
  const PROFILE_API = "/acr/api/user/profile";
  const DEFAULT_AVATAR = "/acrx/assets/images/default-avatar.png";

  // ── helpers ──────────────────────────────────────────────
  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function setText(el, value) {
    if (el) el.textContent = value ?? "";
  }

  function setImg(el, src, alt) {
    if (!el) return;
    el.src = src || DEFAULT_AVATAR;
    if (alt) el.alt = alt;
  }

  // ── toggle dropdown ──────────────────────────────────────
  function initToggle() {
    const btn = $("#profile-btn");
    const menu = $("#profile-dropdown");
    if (!btn || !menu) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("is-open");
    });

    document.addEventListener("click", (e) => {
        menu.classList.remove("is-open");
    });
  }

  // ── fill UI from API response ────────────────────────────
  function applyProfile(data) {
    if (!data?.success || !data.user) return;

    const user = data.user;
    const stats = data.stats || {};
    const posts = stats.posts || {};

    const avatar = user.avatar || DEFAULT_AVATAR;
    const name = user.fullName || user.username || "User";
    const role = user.role || "user";
    const email = user.email || "";

    // top-right avatar button
    setImg($(".profile-btn__avatar"), avatar, name);
    const btn = $("#profile-btn");
    if (btn) btn.setAttribute("data-title", name);

    // dropdown header
    setImg($(".profile-dropdown__avatar"), avatar, name);
    setText($(".profile-dropdown__name"), name);
    setText($(".profile-dropdown__role"), role);

    const emailEl = $(".profile-dropdown__email");
    if (emailEl) {
      if (email) {
        emailEl.textContent = email;
        emailEl.style.display = "";
      } else {
        emailEl.style.display = "none";
      }
    }

    // mini stats
    const values = [
      posts.total ?? 0,
      posts.published ?? 0,
      posts.draft ?? 0,
      stats.pages ?? 0,
      stats.categories ?? 0,
    ];

    document
      .querySelectorAll(".profile-dropdown__stats .profile-stat__value")
      .forEach((el, i) => {
        if (values[i] !== undefined) el.textContent = String(values[i]);
      });
  }

  // ── fetch ────────────────────────────────────────────────
  async function loadProfile() {
    try {
      const res = await fetch(PROFILE_API, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      applyProfile(data);
    } catch (err) {
      console.warn("[header-profile] failed to load profile:", err);
      // keep default avatar / empty stats
    }
  }

  // ── boot ─────────────────────────────────────────────────
  function init() {
    initToggle();
    loadProfile();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();