// acrx/assets/js/editor.js — Editor shell behavior + application boot.
//
// Sidebar toggles and tab switching below are the original shell behavior and
// stay exactly as they were. The engine-driven editor application boots after
// them via ./editor/app/controller.js.
import { boot } from "./editor/app/core/controller.js";

Mini.ready(() => {
    // Left Sidebar
    Mini.clickToggle(
        "#editor-left-sidebar-toggle",
        ".acrx-editor-body",
        "sdb-left"
    );

    // Right Sidebar
    Mini.clickToggle(
        "#editor-right-sidebar-toggle",
        ".acrx-editor-body",
        "sdb-right"
    );
    function initSidebarTabs(sidebarId) {
        const container = Mini.$(sidebarId);
        if (!container) return;

        Mini.on(`${sidebarId} .sidebar-tab`, "click", function() {
            const tab = this;

            // Remove active from all tabs and panels in this sidebar
            Mini.removeClass(`${sidebarId} .sidebar-tab`, "active");
            Mini.removeClass(`${sidebarId} .sidebar-panel`, "active");

            // Activate clicked tab
            Mini.addClass(tab, "active");

            // Activate corresponding panel
            const panelId = tab.id.replace("btn-", "panel-");
            const panel = Mini.$(`#${panelId}`);

            if (panel) {
                Mini.addClass(panel, "active");
            }
        });
    }

    // Initialize both sidebars
    initSidebarTabs("#editor-left-sidebar");
    initSidebarTabs("#editor-right-sidebar");

    // Boot the engine-driven editor application (non-blocking for chrome).
    boot().catch((err) => {
        // Never leave a silent dead canvas: surface boot failures in place.
        // eslint-disable-next-line no-console
        console.error("[editor] boot failed:", err);
        const canvas = document.getElementById("editor-canvas");
        if (canvas && !canvas.querySelector(".canvas-load-error")) {
            const box = document.createElement("div");
            box.className = "canvas-load-error";
            const message = String((err && err.message) || err || "Unknown error").replace(/</g, "&lt;");
            box.innerHTML =
                '<p class="canvas-load-title">Editor failed to start</p>' +
                `<p class="canvas-load-text">${message}</p>` +
                '<button type="button" class="button-pst" id="editor-retry-boot">Retry</button>';
            canvas.appendChild(box);
            box.querySelector("#editor-retry-boot")?.addEventListener("click", () => window.location.reload());
        }
    });
});
