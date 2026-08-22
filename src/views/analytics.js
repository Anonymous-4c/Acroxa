// src/views/analytics.js
// Analytics Dashboard Renderer
// Follows the same component + composition pattern as approval.js and framework.js

const {
  el,
  icon,
  PageWrapper,
  MainContent
} = require("./lib/framework");

// ─── Header ──────────────────────────────────────────────────────

function AnalyticsHeader({ searchId = "search-analytics", title = "Analytics" } = {}) {
  return el("div", { class: "main-head analytics-header" },
    el("div", { class: "d-flex align-center" },
      el("h1", {}, title)
    ),
    el("div", { class: "media-actions d-flex align-center gap-3" },

      // Date range picker trigger (JS will attach a picker here)
      el("button", {
        class: "btn ghost date-range-btn",
        id: "date-range-btn",
        title: "Select date range"
      },
        icon("calendar-days"),
        el("span", { class: "date-range-label" }, "Last 7 days")
      ),

      // Refresh
      el("button", {
        class: "btn ghost refresh-btn",
        title: "Refresh data"
      }, icon("refresh")),

      // Export
      el("button", {
        class: "btn ghost export-btn",
        title: "Export report"
      }, icon("download"))
    )
  );
}

// ─── Metric Card (reuses MetricCard style, analytics-specific data) ──

function OverviewCard({ iconName, title, value, change, changeType = "steady" }) {
  const changeClass = changeType === "up" ? "up"
    : changeType === "down" ? "down"
    : "steady";
  const arrow = changeType === "up" ? "caret-up"
    : changeType === "down" ? "caret-down"
    : "minus";

  return el("div", { class: "metric-card" },
    el("div", { class: "metric-icon" }, icon(iconName)),
    el("div", { class: "card-content" },
      el("h3", {}, title),
      el("p", { class: "metric-value", id: `metric-${title.toLowerCase().replace(/\s+/g, "-")}` }, value),
      el("span", { class: `metric-change ${changeClass}` },
        icon(arrow, "solid"), " ", change
      )
    )
  );
}

// ─── Overview Strip ───────────────────────────────────────────────

function OverviewStrip() {
  const cards = [
    { iconName: "eye",          title: "Page Views",    value: "—", change: "—" },
    { iconName: "users",        title: "Sessions",      value: "—", change: "—" },
    { iconName: "user",         title: "Unique Users",  value: "—", change: "—" },
    { iconName: "arrow-right-from-bracket", title: "Bounce Rate", value: "—", change: "—" },
    { iconName: "clock",        title: "Avg Duration",  value: "—", change: "—" }
  ];

  return el("div", { class: "overview-metrics grid slide-up", id: "overview-strip" },
    ...cards.map(OverviewCard)
  );
}

// ─── Chart Panel ─────────────────────────────────────────────────

function ChartPanel({ id, title, iconName, extraClass = "" }) {
  return el("div", { class: `widget card slide-up ${extraClass}`.trim(), id },
    el("div", { class: "widget-header" },
      el("h2", {}, icon(iconName), " ", title),
      el("div", { class: "widget-actions" },
        // JS will populate these as metric selectors / interval switchers
      )
    ),
    el("div", { class: "chart-body", id: `${id}-body` },
      // Chart.js / D3 canvas injected here by analytics.client.js
      el("div", { class: "chart-placeholder" },
        icon("chart-line", "duotone")
      )
    )
  );
}

// ─── Data Table ───────────────────────────────────────────────────

function AnalyticsTable({ id, title, iconName, columns = [] }) {
  return el("div", { class: "widget card slide-up", id },
    el("div", { class: "widget-header" },
      el("h2", {}, icon(iconName), " ", title)
    ),
    el("div", { class: "acrx-ttc-wrap" },
      el("div", { class: "acrx-ttc" },

        // Table header
        el("div", { class: "ttc-ph" },
          ...columns.flatMap((col, i) => [
            el("div", { class: col.class || "name" }, col.label),
            i < columns.length - 1 ? el("sep") : null
          ].filter(Boolean))
        ),

        // Table body — rows injected by JS
        el("div", { class: "ttc-pis", id: `${id}-tbody` },
          el("div", { class: "text-center py-5 text-muted" },
            icon("hourglass-half", "duotone"),
            el("p", { class: "mt-3" }, "Loading data...")
          )
        )
      )
    )
  );
}

// ─── Top Pages Table ──────────────────────────────────────────────

function TopPagesTable() {
  return AnalyticsTable({
    id: "top-pages-table",
    title: "Top Pages",
    iconName: "file-lines",
    columns: [
      { label: "Page",        class: "name" },
      { label: "Views",       class: "status" },
      { label: "Avg Duration",class: "date" },
      { label: "Exit Rate",   class: "status" }
    ]
  });
}

// ─── Traffic Sources Table ────────────────────────────────────────

function TrafficSourcesTable() {
  return AnalyticsTable({
    id: "traffic-sources-table",
    title: "Traffic Sources",
    iconName: "share-nodes",
    columns: [
      { label: "Source",    class: "name" },
      { label: "Sessions",  class: "status" },
      { label: "Channel",   class: "categories" }
    ]
  });
}

// ─── Device Breakdown ─────────────────────────────────────────────

function DeviceBreakdownWidget() {
  return el("div", { class: "widget card slide-up", id: "device-widget" },
    el("div", { class: "widget-header" },
      el("h2", {}, icon("mobile-screen"), " Devices")
    ),
    el("div", { class: "device-breakdown d-flex gap-4", id: "device-breakdown-body" },
      // JS renders 3 donut chart segments here: mobile / desktop / tablet
      el("div", { class: "chart-placeholder" },
        icon("chart-pie", "duotone")
      )
    )
  );
}

// ─── AI Insights Panel ────────────────────────────────────────────

function InsightBadge(severity = "low") {
  const colorMap = { low: "blue", medium: "orange", high: "red" };
  return el("div", {
    class: "acrx-itn status status-post",
    "data-": colorMap[severity] || "blue"
  }, severity.charAt(0).toUpperCase() + severity.slice(1));
}

function InsightRow(insight) {
  return el("div", { class: "insight-row d-flex align-center gap-3", "data-id": insight.id || "" },
    el("div", { class: "insight-icon" },
      icon(insight.insight_type === "anomaly" ? "triangle-exclamation"
        : insight.insight_type === "prediction" ? "chart-line"
        : insight.insight_type === "recommendation" ? "lightbulb"
        : "circle-info", "duotone")
    ),
    el("div", { class: "insight-content flex-1" },
      el("p", { class: "insight-text" }, insight.insight || "—"),
      insight.suggestion
        ? el("p", { class: "insight-suggestion text-muted" },
            icon("arrow-right", "solid"), " ", insight.suggestion
          )
        : null
    ),
    el("div", { class: "insight-meta d-flex gap-2 align-center" },
      InsightBadge(insight.severity),
      el("span", { class: "text-muted" },
        insight.confidence
          ? `${Math.round(insight.confidence * 100)}% confidence`
          : ""
      ),
      el("button", {
        class: "btn-act dismiss-insight",
        "data-id": insight.id || "",
        title: "Dismiss"
      }, icon("xmark"))
    )
  );
}

function InsightsPanel({ insights = [] }) {
  return el("div", { class: "widget card slide-up", id: "insights-panel" },
    el("div", { class: "widget-header" },
      el("h2", {}, icon("brain-circuit", "duotone"), " AI Insights"),
      el("div", { class: "widget-actions" },
        el("button", {
          class: "btn ghost",
          id: "refresh-insights",
          title: "Refresh insights"
        }, icon("refresh"))
      )
    ),
    el("div", { class: "insights-list", id: "insights-list" },
      insights.length > 0
        ? insights.map(InsightRow)
        : el("div", { class: "text-center py-5 text-muted" },
            icon("lightbulb", "duotone"),
            el("p", { class: "mt-3" }, "No insights yet — check back once data is collected.")
          )
    )
  );
}

// ─── Anomalies Panel ─────────────────────────────────────────────

function AnomalyRow(anomaly) {
  return el("div", { class: "anomaly-row d-flex align-center gap-3" },
    el("div", { class: "anomaly-icon" },
      icon("triangle-exclamation", "duotone")
    ),
    el("div", { class: "anomaly-content flex-1" },
      el("p", { class: "anomaly-text" }, anomaly.insight || "—"),
      anomaly.possible_reason
        ? el("p", { class: "text-muted" },
            icon("circle-info", "solid"), " ", anomaly.possible_reason
          )
        : null,
      anomaly.affected_scope
        ? el("p", { class: "text-muted" },
            icon("crosshairs", "solid"), " Scope: ", anomaly.affected_scope
          )
        : null
    ),
    InsightBadge(anomaly.severity)
  );
}

function AnomaliesPanel({ anomalies = [] }) {
  return el("div", { class: "widget card slide-up", id: "anomalies-panel" },
    el("div", { class: "widget-header" },
      el("h2", {}, icon("triangle-exclamation", "duotone"), " Anomalies")
    ),
    el("div", { class: "anomalies-list", id: "anomalies-list" },
      anomalies.length > 0
        ? anomalies.map(AnomalyRow)
        : el("div", { class: "text-center py-5 text-muted" },
            icon("circle-check", "duotone"),
            el("p", { class: "mt-3" }, "No anomalies detected in this period.")
          )
    )
  );
}

// ─── Section Tabs (mirrors approval.js StatusTabs pattern) ────────

function AnalyticsTabs({ active = "overview" } = {}) {
  const tabs = [
    { id: "overview",  label: "Overview"  },
    { id: "pages",     label: "Pages"     },
    { id: "sources",   label: "Sources"   },
    { id: "devices",   label: "Devices"   },
    { id: "funnels",   label: "Funnels"   },
    { id: "insights",  label: "Insights"  }
  ];

  return el("div", { class: "links" },
    ...tabs.flatMap((tab, i) => [
      el("div", {
        class: `pages ${tab.id === active ? "active" : ""}`,
        "data-tab": tab.id
      }, tab.label),
      i < tabs.length - 1 ? el("sep") : null
    ].filter(Boolean))
  );
}

// ─── Full Page Render ─────────────────────────────────────────────

// pages.js calls render functions as renderFn(req, res).
// We ignore those args and use defaults — all data is loaded client-side via the analytics API.
function renderAnalytics(_req, _res, { insights = [], anomalies = [] } = {}) {
  return PageWrapper({ className: "acrx-dshb-wr analytics-page" },

    AnalyticsHeader(),

    MainContent(

      // Section tabs
      el("div", { class: "header-info-sec" },
        AnalyticsTabs({ active: "overview" })
      ),

      // ── Overview KPI strip ──────────────────────────────────────
      el("section", { class: "analytics-section", id: "section-overview" },
        OverviewStrip(),

        // Traffic trend chart
        ChartPanel({
          id: "traffic-trend-chart",
          title: "Traffic Trend",
          iconName: "chart-line"
        }),

        // Two-col row: top pages + sources
        el("div", { class: "grid-2col slide-up" },
          TopPagesTable(),
          TrafficSourcesTable()
        ),

        // Two-col row: device breakdown + AI insights
        el("div", { class: "grid-2col slide-up" },
          DeviceBreakdownWidget(),
          InsightsPanel({ insights })
        ),

        // Anomalies (full width, only shown when anomalies exist)
        anomalies.length > 0
          ? AnomaliesPanel({ anomalies })
          : null
      )
    )
  );
}

// ─── Partial Renderers (for AJAX hot-swap, mirrors approval.js pattern) ──

/**
 * Render a single top-page row for AJAX injection.
 */
function TopPageRow({ page, views, avg_duration, exit_rate }) {
  return el("div", { class: "ttc-pi" },
    el("div", { class: "acrx-itn name name-post" },
      el("span", { class: "page-url" }, page),
      el("button", { class: "edit-title" }, icon("arrow-up-right-from-square"))
    ),
    el("div", { class: "acrx-itn status" }, String(views ?? 0)),
    el("div", { class: "acrx-itn date" }, avg_duration ? `${avg_duration}s` : "—"),
    el("div", { class: "acrx-itn status" }, exit_rate ? `${exit_rate}%` : "—")
  );
}

/**
 * Render a single traffic source row for AJAX injection.
 */
function SourceRow({ source, referrer, sessions, channel }) {
  const label = source || referrer || "—";
  return el("div", { class: "ttc-pi" },
    el("div", { class: "acrx-itn name name-post" }, label),
    el("div", { class: "acrx-itn status" }, String(sessions ?? 0)),
    el("div", { class: "acrx-itn categories" }, channel || "—")
  );
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  renderAnalytics,
  AnalyticsHeader,
  AnalyticsTabs,
  OverviewStrip,
  OverviewCard,
  ChartPanel,
  TopPagesTable,
  TrafficSourcesTable,
  DeviceBreakdownWidget,
  InsightsPanel,
  InsightRow,
  InsightBadge,
  AnomaliesPanel,
  AnomalyRow,
  TopPageRow,
  SourceRow
};