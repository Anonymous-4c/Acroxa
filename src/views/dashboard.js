// ../src/views/dashboard.js

const {
  PageWrapper,
  MainHeader,
  MainContent,
  TrafficTrend,
  Scorecards,
  ActionGrid,
  hr
} = require('./lib/framework');
const { OrbitalWheel } = require('./lib/components/OrbitalWheel');
const { InstrumentDial } = require('./lib/components/InstrumentalDial');
function renderDashboard() {
  const orbitalItems = [
    {
      key: 'visitors',
      title: 'Visitors',
      icon: 'users',
      accent: 'var(--acc-users)',
      status: 'LIVE',
      value: '12.4K',
      unit: 'today',
      delta: '+8.4%',
      sub: 'Unique visitors across all channels',
      spark: [42, 55, 48, 67, 52, 71, 65, 82, 78, 91, 87, 104]
    },
    {
      key: 'conversions',
      title: 'Conversions',
      icon: 'chart-bar',
      accent: 'var(--acc-analytics)',
      status: 'ON TRACK',
      value: '1.9K',
      unit: 'this month',
      delta: '+2.1%',
      sub: 'Goal completions & sign-ups',
      spark: [12, 18, 15, 22, 19, 25, 28, 31, 27, 35, 33, 38]
    },
    {
      key: 'bounce',
      title: 'Bounce Rate',
      icon: 'chart-line-down',
      accent: 'var(--acc-security)',
      status: 'MONITORED',
      value: '36%',
      unit: 'avg',
      delta: '-4.3%',
      sub: 'Percentage of single-page sessions',
      spark: [45, 42, 48, 39, 41, 37, 44, 35, 38, 33, 36, 31]
    },
    {
      key: 'session',
      title: 'Avg. Session',
      icon: 'timer',
      accent: 'var(--acc-media)',
      status: 'STABLE',
      value: '3m 42s',
      unit: 'duration',
      delta: '0%',
      sub: 'Time spent per active user',
      spark: [180, 195, 210, 205, 225, 218, 240, 235, 255, 248, 260, 222]
    }
  ];

  const actions = [
    { iconName: 'user-gear', title: 'Manage Users', description: 'Configure permissions.', href: '/admin/users' },
    { iconName: 'pen-nib',   title: 'Content',      description: 'Draft new updates.',      href: '/admin/posts/new' },
    { iconName: 'database',  title: 'Reports',      description: 'Export raw data.',         href: '/admin/reports' },
    { iconName: 'wrench',    title: 'System',       description: 'Server & API status.',     href: '/admin/settings'},
  ];

  return PageWrapper({ className: 'acrx-dshb-wr' },
    MainHeader({
      title: 'Dashboard',
      actions: [
        { class: 'btn accent', title: 'Create New', icon: 'circle-plus' },
        { class: 'btn ghost',  title: 'Settings',   icon: 'gear', 'data-link': '/acrx/system' },
      ]
    }),

    MainContent(
      OrbitalWheel({
        id: 'main-orbital',
        prefix: 'ow-',                      // change to 'dash-' etc. for a
                                             // second, independently-themed
                                             // instance elsewhere on the page
        brandLabel: 'Acroxa · Live Overview',
        hintLabel: 'Drag or use arrows to explore',
        items: orbitalItems,
        settings: { scroll: false, hint: false, branding: false }
      }),
      hr(),
      TrafficTrend(),
      hr(),
      InstrumentDial({
        id: 'dashboard-instruments',
        prefix: 'id-',

        eyebrow: 'System Health',
        heading: 'Website Overview',
        description: 'Monitor the overall health of your website using Acroxa Instruments.',

        items: [
          {
            key: 'performance',
            title: 'Performance',
            value: 94,
            status: 'Optimized',
            description: 'Measures page rendering speed, Core Web Vitals, asset optimization, and overall frontend performance.',
            suggestions: [
              'Compress images',
              'Enable Brotli',
              'Optimize fonts',
              'Remove unused CSS'
            ],
            action: 'Analyze'
          },

          {
            key: 'seo',
            title: 'SEO Score',
            value: 86,
            status: 'Strong',
            description: 'Evaluates indexing readiness, metadata quality, semantic structure, and search engine visibility.',
            suggestions: [
              'Improve meta descriptions',
              'Add structured data',
              'Optimize headings',
              'Review canonical URLs'
            ],
            action: 'View Report'
          },

          {
            key: 'security',
            title: 'Security',
            value: 100,
            status: 'Secure',
            description: 'Checks security headers, authentication, dependency health, and server hardening.',
            suggestions: [
              'Review CSP policy',
              'Rotate API keys',
              'Verify backups',
              'Audit user permissions'
            ],
            action: 'Audit'
          }
        ],

        settings: {
          interactive: true,
          idleAnimation: true,
          thumbHandle: true
        }
      }),
      hr(),
      ActionGrid(actions)
    )
  );
}

module.exports = { renderDashboard };

module.exports.meta = [
  {
    path: '/acrx/dashboard',
    render: 'renderDashboard',
    title: 'Dashboard - Acroxa',
    css: [
      '/acrx/assets/css/ad-ds.css',
      '/acrx/assets/css/orbital-wheel.css',   // add the component stylesheet
      '/acrx/assets/css/instrumental-dial.css',   // add the component stylesheet
    ],
    js: [
      '/acrx/assets/js/dashboard.js',
    ],
    layout: 'full',
    header: null,
    sidebar: null,
    footer: null,
  },
];
