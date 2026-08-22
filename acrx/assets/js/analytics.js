// public/assets/js/analytics.js
// Analytics Dashboard — Client JS
// Follows the same fetch → render → inject pattern as posts.js / approvals.js

(() => {
  "use strict";

  // ─── State ────────────────────────────────────────────────────────

  const state = {
    from: null,
    to: null,
    activeTab: "overview",
    loading: false,
  };

  // ─── Date Range Helpers ───────────────────────────────────────────

  function defaultRange() {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }

  function buildQuery(extra = {}) {
    const params = new URLSearchParams({
      from: state.from,
      to: state.to,
      ...extra,
    });
    return params.toString();
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "—";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  function formatNumber(n) {
    if (n == null) return "—";
    return Number(n).toLocaleString();
  }

  function formatPct(n) {
    if (n == null) return "—";
    return `${parseFloat(n).toFixed(1)}%`;
  }

  // ─── API Fetch ────────────────────────────────────────────────────

  async function apiFetch(path) {
    const res = await fetch(`/acr/api${path}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
    const json = await res.json();
    if (json.status !== "success") throw new Error(json.error || "Unknown error");
    return json.data;
  }

  async function apiPost(path, body) {
    const res = await fetch(`/acr/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
    const json = await res.json();
    if (json.status !== "success") throw new Error(json.error || "Unknown error");
    return json.data;
  }

  // ─── Loading State ────────────────────────────────────────────────

  function setLoading(ids, on) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (on) {
        el.classList.add("loading");
      } else {
        el.classList.remove("loading");
      }
    });
  }

  // ─── Overview Strip ───────────────────────────────────────────────

  async function loadOverview() {
    setLoading(["overview-strip"], true);
    try {
      const data = await apiFetch(`/analytics/overview?${buildQuery()}`);

      setValue("metric-page-views",   formatNumber(data.page_views));
      setValue("metric-sessions",     formatNumber(data.sessions));
      setValue("metric-unique-users", formatNumber(data.unique_users));
      setValue("metric-bounce-rate",  formatPct(data.bounce_rate));
      setValue("metric-avg-duration", formatDuration(data.avg_session_duration));
    } catch (err) {
      console.error("[Analytics] Overview failed:", err);
    } finally {
      setLoading(["overview-strip"], false);
    }
  }

  function setValue(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ─── Traffic Trend Chart ──────────────────────────────────────────

  let trendChart = null;

  async function loadTrendChart() {
    const body = document.getElementById("traffic-trend-chart-body");
    if (!body) return;

    try {
      const data = await apiFetch(
        `/analytics/timeseries?${buildQuery({ metric: "page_views", interval: "daily" })}`
      );

      const labels = (data.series || []).map((p) => formatDate(p.timestamp));
      const values = (data.series || []).map((p) => p.value ?? 0);

      // Destroy previous chart instance if re-rendering
      if (trendChart) {
        trendChart.destroy();
        trendChart = null;
      }

      // Remove placeholder, inject canvas
      body.innerHTML = `<canvas id="trend-canvas"></canvas>`;
      const ctx = document.getElementById("trend-canvas").getContext("2d");

      trendChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Page Views",
              data: values,
              borderColor: "var(--color-primary-500, #6366f1)",
              backgroundColor: "transparent",
              borderWidth: 2.5,
              tension: 0.35,
              pointRadius: 3,
              pointHoverRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${formatNumber(ctx.parsed.y)} views`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 8, color: "var(--color-text-muted)" },
            },
            y: {
              beginAtZero: true,
              grid: { color: "var(--color-border, rgba(0,0,0,.08))" },
              ticks: {
                color: "var(--color-text-muted)",
                callback: (v) => formatNumber(v),
              },
            },
          },
        },
      });
    } catch (err) {
      console.error("[Analytics] Trend chart failed:", err);
    }
  }

  // ─── Top Pages Table ──────────────────────────────────────────────

  async function loadTopPages() {
    const tbody = document.getElementById("top-pages-table-tbody");
    if (!tbody) return;

    try {
      const data = await apiFetch(`/analytics/pages?${buildQuery({ limit: 20 })}`);
      const pages = data.pages || [];

      if (pages.length === 0) {
        tbody.innerHTML = emptyRow("No page data yet.");
        return;
      }

      tbody.innerHTML = pages
        .map(
          (p) => `
        <div class="ttc-pi">
          <div class="acrx-itn name name-post">
            <span class="page-url" title="${escHtml(p.page)}">${escHtml(truncate(p.page, 55))}</span>
          </div>
          <sep></sep>
          <div class="acrx-itn status">${formatNumber(p.views)}</div>
          <sep></sep>
          <div class="acrx-itn date">${formatDuration(p.avg_duration)}</div>
          <sep></sep>
          <div class="acrx-itn status">${p.exit_rate != null ? formatPct(p.exit_rate) : "—"}</div>
        </div>`
        )
        .join("");
    } catch (err) {
      console.error("[Analytics] Top pages failed:", err);
      if (tbody) tbody.innerHTML = errorRow("Failed to load pages.");
    }
  }

  // ─── Traffic Sources Table ────────────────────────────────────────

  async function loadSources() {
    const tbody = document.getElementById("traffic-sources-table-tbody");
    if (!tbody) return;

    try {
      const data = await apiFetch(`/analytics/sources?${buildQuery()}`);
      const rows = [
        ...(data.referrers || []).map((r) => ({ label: r.referrer, sessions: r.sessions, channel: "referral" })),
        ...(data.channels  || []).map((c) => ({ label: c.channel,  sessions: c.sessions, channel: c.channel  })),
      ]
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 15);

      if (rows.length === 0) {
        tbody.innerHTML = emptyRow("No source data yet.");
        return;
      }

      tbody.innerHTML = rows
        .map(
          (r) => `
        <div class="ttc-pi">
          <div class="acrx-itn name name-post">${escHtml(r.label || "—")}</div>
          <sep></sep>
          <div class="acrx-itn status">${formatNumber(r.sessions)}</div>
          <sep></sep>
          <div class="acrx-itn categories">${escHtml(r.channel || "—")}</div>
        </div>`
        )
        .join("");
    } catch (err) {
      console.error("[Analytics] Sources failed:", err);
      if (tbody) tbody.innerHTML = errorRow("Failed to load sources.");
    }
  }

  // ─── Device Breakdown ─────────────────────────────────────────────

  let deviceChart = null;

  async function loadDevices() {
    const body = document.getElementById("device-breakdown-body");
    if (!body) return;

    try {
      const data = await apiFetch(`/analytics/devices?${buildQuery()}`);
      const types = (data.device_types || []).filter((d) => d.count > 0);

      if (types.length === 0) {
        body.innerHTML = emptyRow("No device data yet.");
        return;
      }

      if (deviceChart) {
        deviceChart.destroy();
        deviceChart = null;
      }

      body.innerHTML = `<canvas id="device-canvas" style="max-height:180px"></canvas>`;
      const ctx = document.getElementById("device-canvas").getContext("2d");

      const COLORS = [
        "var(--color-primary-500, #6366f1)",
        "var(--color-accent, #06b6d4)",
        "var(--color-warning, #f59e0b)",
      ];

      deviceChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: types.map((d) => capitalize(d.type)),
          datasets: [
            {
              data: types.map((d) => d.count),
              backgroundColor: COLORS.slice(0, types.length),
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "right",
              labels: { color: "var(--color-text)", padding: 16 },
            },
          },
          cutout: "65%",
        },
      });
    } catch (err) {
      console.error("[Analytics] Devices failed:", err);
    }
  }

  // ─── AI Insights ─────────────────────────────────────────────────

  async function loadInsights() {
    const list = document.getElementById("insights-list");
    if (!list) return;

    try {
      const data = await apiFetch(`/analytics/insights?${buildQuery()}`);
      const insights = data.insights || [];

      if (insights.length === 0) {
        list.innerHTML = `
          <div class="text-center py-5 text-muted">
            <i class="fa-duotone fa-lightbulb"></i>
            <p class="mt-3">No insights yet — check back once data is collected.</p>
          </div>`;
        return;
      }

      list.innerHTML = insights.map(renderInsightRow).join("");
      bindDismissButtons();
    } catch (err) {
      console.error("[Analytics] Insights failed:", err);
    }
  }

  function renderInsightRow(insight) {
    const iconMap = {
      anomaly:        "triangle-exclamation",
      prediction:     "chart-line",
      recommendation: "lightbulb",
      trend:          "arrow-trend-up",
      summary:        "circle-info",
    };
    const iconName = iconMap[insight.insight_type] || "circle-info";
    const severityColor = { low: "blue", medium: "orange", high: "red" }[insight.severity] || "blue";
    const confidencePct = insight.confidence != null
      ? `${Math.round(insight.confidence * 100)}% confidence`
      : "";

    return `
      <div class="insight-row d-flex align-center gap-3" data-id="${escHtml(insight.id || "")}">
        <div class="insight-icon">
          <i class="fa-duotone fa-${iconName}"></i>
        </div>
        <div class="insight-content flex-1">
          <p class="insight-text">${escHtml(insight.insight || "—")}</p>
          ${insight.suggestion
            ? `<p class="insight-suggestion text-muted">
                <i class="fa-solid fa-arrow-right"></i> ${escHtml(insight.suggestion)}
               </p>`
            : ""}
        </div>
        <div class="insight-meta d-flex gap-2 align-center">
          <div class="acrx-itn status status-post" data-="${severityColor}">
            ${capitalize(insight.severity || "low")}
          </div>
          ${confidencePct ? `<span class="text-muted">${confidencePct}</span>` : ""}
          <button class="btn-act dismiss-insight" data-id="${escHtml(insight.id || "")}" title="Dismiss">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>`;
  }

  function bindDismissButtons() {
    document.querySelectorAll(".dismiss-insight").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (!id) return;
        try {
          await apiPost(`/analytics/insights/${id}/dismiss`, {});
          const row = btn.closest(".insight-row");
          if (row) row.remove();
        } catch (err) {
          console.error("[Analytics] Dismiss insight failed:", err);
        }
      });
    });
  }

  // ─── Anomalies ────────────────────────────────────────────────────

  async function loadAnomalies() {
    const list = document.getElementById("anomalies-list");
    if (!list) return;

    try {
      const data = await apiFetch(`/analytics/anomalies?${buildQuery()}`);
      const anomalies = data.anomalies || [];

      if (anomalies.length === 0) {
        list.innerHTML = `
          <div class="text-center py-5 text-muted">
            <i class="fa-duotone fa-circle-check"></i>
            <p class="mt-3">No anomalies detected in this period.</p>
          </div>`;

        // Hide the whole panel if no anomalies
        const panel = document.getElementById("anomalies-panel");
        if (panel) panel.style.display = "none";
        return;
      }

      list.innerHTML = anomalies.map(renderAnomalyRow).join("");

      const panel = document.getElementById("anomalies-panel");
      if (panel) panel.style.display = "";
    } catch (err) {
      console.error("[Analytics] Anomalies failed:", err);
    }
  }

  function renderAnomalyRow(anomaly) {
    const severityColor = { low: "blue", medium: "orange", high: "red" }[anomaly.severity] || "blue";
    return `
      <div class="anomaly-row d-flex align-center gap-3">
        <div class="anomaly-icon">
          <i class="fa-duotone fa-triangle-exclamation"></i>
        </div>
        <div class="anomaly-content flex-1">
          <p class="anomaly-text">${escHtml(anomaly.insight || "—")}</p>
          ${anomaly.possible_reason
            ? `<p class="text-muted"><i class="fa-solid fa-circle-info"></i> ${escHtml(anomaly.possible_reason)}</p>`
            : ""}
          ${anomaly.affected_scope
            ? `<p class="text-muted"><i class="fa-solid fa-crosshairs"></i> Scope: ${escHtml(anomaly.affected_scope)}</p>`
            : ""}
        </div>
        <div class="acrx-itn status status-post" data-="${severityColor}">
          ${capitalize(anomaly.severity || "low")}
        </div>
      </div>`;
  }

  // ─── Date Range Label ─────────────────────────────────────────────

  function updateDateLabel() {
    const label = document.querySelector(".date-range-label");
    if (!label) return;
    const from = new Date(state.from);
    const to = new Date(state.to);
    const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24));
    const presets = { 7: "Last 7 days", 14: "Last 14 days", 30: "Last 30 days", 90: "Last 90 days" };
    label.textContent = presets[diffDays] || `${formatDate(state.from)} – ${formatDate(state.to)}`;
  }

  // ─── Date Range Dropdown ──────────────────────────────────────────

  function buildDateDropdown() {
    const btn = document.getElementById("date-range-btn");
    if (!btn) return;

    // Remove any existing dropdown
    const existing = document.getElementById("date-range-menu");
    if (existing) existing.remove();

    const presets = [
      { label: "Last 7 days",  days: 7  },
      { label: "Last 14 days", days: 14 },
      { label: "Last 30 days", days: 30 },
      { label: "Last 90 days", days: 90 },
    ];

    const menu = document.createElement("div");
    menu.id = "date-range-menu";
    menu.className = "pp-dropdown-menu date-range-menu";
    menu.innerHTML = `
      <div class="wrap-menu-dp">
        ${presets
          .map(
            (p) => `<button class="pp-dropdown-item" data-days="${p.days}">${p.label}</button>`
          )
          .join("")}
      </div>`;

    btn.parentElement.style.position = "relative";
    btn.parentElement.appendChild(menu);

    // Toggle
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("open");
    });

    menu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-days]");
      if (!item) return;
      const days = parseInt(item.dataset.days);
      const to = new Date();
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      state.from = from.toISOString().slice(0, 10);
      state.to = to.toISOString().slice(0, 10);
      updateDateLabel();
      menu.classList.remove("open");
      loadAll();
    });

    document.addEventListener("click", () => menu.classList.remove("open"));
  }

  // ─── Tab Switching ────────────────────────────────────────────────

  function bindTabs() {
    document.querySelectorAll("[data-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll("[data-tab]").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        state.activeTab = tab.dataset.tab;
        // All content lives in #section-overview for now.
        // Future: swap visible section per tab.
      });
    });
  }

  // ─── Refresh Button ───────────────────────────────────────────────

  function bindRefresh() {
    const btn = document.querySelector(".refresh-btn");
    if (!btn) return;
    btn.addEventListener("click", () => loadAll());

    const insightsRefresh = document.getElementById("refresh-insights");
    if (insightsRefresh) {
      insightsRefresh.addEventListener("click", () => {
        loadInsights();
        loadAnomalies();
      });
    }
  }

  // ─── Export Button ────────────────────────────────────────────────

  function bindExport() {
    const btn = document.querySelector(".export-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        const res = await fetch("/acr/api/analytics/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportType: "full",
            format: "csv",
            from: state.from,
            to: state.to,
          }),
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analytics-${state.from}-to-${state.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("[Analytics] Export failed:", err);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ─── Load All ────────────────────────────────────────────────────

  async function loadAll() {
    // Destroy charts before re-fetching so they get rebuilt cleanly
    if (trendChart)  { trendChart.destroy();  trendChart  = null; }
    if (deviceChart) { deviceChart.destroy(); deviceChart = null; }

    await Promise.allSettled([
      loadOverview(),
      loadTrendChart(),
      loadTopPages(),
      loadSources(),
      loadDevices(),
      loadInsights(),
      loadAnomalies(),
    ]);
  }

  // ─── Utilities ────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncate(str, max) {
    return str && str.length > max ? str.slice(0, max) + "…" : str;
  }

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
  }

  function emptyRow(msg) {
    return `<div class="text-center py-5 text-muted">
      <i class="fa-duotone fa-inbox"></i>
      <p class="mt-3">${escHtml(msg)}</p>
    </div>`;
  }

  function errorRow(msg) {
    return `<div class="text-center py-5 text-muted">
      <i class="fa-duotone fa-circle-exclamation"></i>
      <p class="mt-3">${escHtml(msg)}</p>
    </div>`;
  }

  // ─── Boot ─────────────────────────────────────────────────────────

  function init() {
    const { from, to } = defaultRange();
    state.from = from;
    state.to = to;

    updateDateLabel();
    buildDateDropdown();
    bindTabs();
    bindRefresh();
    bindExport();
    loadAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();