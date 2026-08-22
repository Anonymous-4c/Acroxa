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
});