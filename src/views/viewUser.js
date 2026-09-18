// src/views/viewUser.js — User profile preview (bento grid, matches profile.js design)
'use strict';

const {
  el, icon, PageWrapper, MainHeader, MainContent
} = require('./lib/framework');

function relativeTime(date) {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function format(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDuration(ms) {
  if (!ms) return '0m';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

const ROLE_ICONS = {
  admin: 'shield-halved', editor: 'pen-nib', author: 'feather',
  seo: 'magnifying-glass-chart', designer: 'paintbrush', developer: 'code', user: 'user'
};

function SVGRing({ id, value, max, label, size = 100, stroke = 7, color = 'var(--accent)' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const dashoffset = circumference * (1 - pct);
  return el('div', { class: 'pf-ring-wrap', id },
    el('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'pf-ring-svg' },
      el('circle', { cx: size/2, cy: size/2, r: radius, fill: 'none', stroke: 'var(--color-primary-300)', 'stroke-width': stroke }),
      el('circle', { cx: size/2, cy: size/2, r: radius, fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': circumference, 'stroke-dashoffset': dashoffset, class: 'pf-ring-progress', 'data-circumference': circumference, 'data-target': dashoffset })
    ),
    el('div', { class: 'pf-ring-label' },
      el('span', { class: 'pf-ring-value' }, String(value)),
      el('span', { class: 'pf-ring-text' }, label)
    )
  );
}

function BentoCard(className, ...children) {
  return el('div', { class: `pf-bento-card ${className}` }, ...children);
}

function TimelineItem(page, enteredAt, duration) {
  return el('div', { class: 'pf-timeline-item' },
    el('div', { class: 'pf-timeline-dot' }),
    el('div', { class: 'pf-timeline-content' },
      el('span', { class: 'pf-timeline-page' }, page),
      el('div', { class: 'pf-timeline-meta' },
        el('span', {}, format(enteredAt)),
        duration ? el('span', { class: 'pf-timeline-dur' }, formatDuration(duration)) : null
      )
    )
  );
}

async function renderViewUser(req, res) {
  const userId = req.params.id;
  let user = null;
  let sessionUser = null;
  let error = null;
  let activity = null;

  try {
    const jwt = require('jsonwebtoken');
    const SECRET = process.env.JWT_SECRET || "acroxa_super_secret";
    const cookieHeader = req.headers?.cookie || '';
    const tokenMatch = cookieHeader.match(/auth_token=([^;]+)/);
    if (tokenMatch) {
      const decoded = jwt.verify(tokenMatch[1], SECRET);
      sessionUser = { userId: decoded.userId, role: decoded.role, username: decoded.username };
    }
  } catch (_) {}

  try {
    const { connectDB } = require('../core/connect-db');
    const models = await connectDB();
    const User = models.User;

    if (User) {
      const data = await User.findById(userId)
        .select('-password -__v -resetPasswordToken -emailVerificationCode')
        .lean();
      if (data) user = { ...data, id: data._id?.toString() || data.id };
    }

    if (models.SessionActivity && user) {
      try {
        activity = await models.SessionActivity.findOne({ userId: user.id })
          .select('activePage lastSeen ip isActive sessionId totalVisits todayVisits actionsToday pagesViewedToday totalTimeOnline pageHistory pagesVisited connectedAt')
          .lean();
      } catch (_) {}
    }
  } catch (err) {
    console.error('[viewUser.js] Error:', err.message);
    error = err.message;
  }

  if (error || !user) {
    return PageWrapper({ className: 'acrx-dshb-wr acrx-profile-wr' },
      MainHeader({ title: 'User Not Found' }),
      MainContent(el('div', { class: 'pf-error' },
        el('i', { class: `fa-solid fa-${error ? 'circle-exclamation' : 'user-slash'}` }),
        el('p', {}, error || 'User not found.')
      ))
    );
  }

  const isSelf = sessionUser && user.id === sessionUser.userId;
  const sv = user.sessionVersion || 1;
  const isOnline = activity?.isActive && activity?.lastSeen && (Date.now() - new Date(activity.lastSeen).getTime()) < 5 * 60 * 1000;

  const initials = (user.fullName || user.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

  const avatar = user.avatar
    ? el('div', { class: 'pf-avatar' }, el('img', { src: user.avatar, alt: user.username }))
    : el('div', { class: `pf-avatar pf-avatar--initials role-${user.role}` }, initials);

  let statusClass = 'active';
  let statusLabel = 'Active';
  if (user.isSuspended) { statusClass = 'suspended'; statusLabel = 'Suspended'; }
  else if (!user.isActive) { statusClass = 'inactive'; statusLabel = 'Inactive'; }

  const recentPages = (activity?.pageHistory || []).slice(-8).reverse();
  const uniquePages = [...new Set((activity?.pageHistory || []).map(p => p.page))];

  return PageWrapper({ className: 'acrx-dshb-wr acrx-profile-wr' },

    MainHeader({
      title: user.fullName || user.username,
      subtitle: user.email,
      actions: [
        { icon: 'arrow-left', title: 'Back to Users', class: 'btn ghost', dataClick: 'go-back' },
        ...(isSelf ? [] : [
          { icon: user.isSuspended ? 'circle-check' : 'ban', title: user.isSuspended ? 'Activate' : 'Suspend', class: 'btn ghost', dataClick: 'toggle-status' },
          { icon: 'right-from-bracket', title: 'Force Logout', class: 'btn ghost', dataClick: 'force-logout' },
          { icon: 'pen-to-square', title: 'Edit', class: 'btn primary', dataClick: 'edit-user' },
        ])
      ]
    }),

    MainContent(
      el('div', { class: 'pf-bento' },

        // ── Profile Card (spans 2 cols) ──
        BentoCard('pf-card-profile',
          el('div', { class: 'pf-profile-row' },
            el('div', { class: 'pf-avatar-wrap' },
              avatar,
              el('div', { class: `pf-online-dot ${isOnline ? 'is-online' : ''}`, 'data-field': 'online-dot' })
            ),
            el('div', { class: 'pf-profile-info' },
              el('h2', { class: 'pf-name' },
                user.fullName || user.username,
                isSelf ? el('span', { class: 'u-self-badge', style: 'margin-left:.5rem' }, 'You') : null
              ),
              el('div', { class: 'pf-profile-meta' },
                el('span', { class: `pf-role-badge role-${user.role}` },
                  el('i', { class: `fa-solid fa-${ROLE_ICONS[user.role] || 'user'}` }), ' ', user.role
                ),
                el('span', { class: `pf-status-pill ${isOnline ? 'pf-status--online' : 'pf-status--offline'}`, 'data-field': 'status-pill' },
                  el('i', { class: 'pf-status-dot' }), isOnline ? 'Online' : 'Offline'
                ),
                el('span', { class: 'pf-sv-badge' }, `Session v${sv}`)
              ),
              el('p', { class: 'pf-email' }, user.email),
              user.fullName ? el('p', { class: 'pf-username' }, `@${user.username}`) : null
            )
          )
        ),

        // ── Live Status Card ──
        BentoCard('pf-card-status',
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-signal' }),
            el('span', {}, 'Live Status')
          ),
          el('div', { class: 'pf-status-grid', 'data-field': 'live-grid' },
            el('div', { class: 'pf-stat-item' },
              el('span', { class: 'pf-stat-label' }, 'Status'),
              el('span', { class: `pf-stat-value ${isOnline ? 'pf-val--online' : ''}`, 'data-field': 'live-status' }, isOnline ? 'Online' : 'Offline')
            ),
            el('div', { class: 'pf-stat-item' },
              el('span', { class: 'pf-stat-label' }, 'Active Page'),
              el('span', { class: 'pf-stat-value', 'data-field': 'live-page' }, activity?.activePage || '—')
            ),
            el('div', { class: 'pf-stat-item' },
              el('span', { class: 'pf-stat-label' }, 'Last Seen'),
              el('span', { class: 'pf-stat-value', 'data-field': 'live-seen' }, activity?.lastSeen ? relativeTime(activity.lastSeen) : '—')
            ),
            el('div', { class: 'pf-stat-item' },
              el('span', { class: 'pf-stat-label' }, 'IP'),
              el('span', { class: 'pf-stat-value pf-val--mono', 'data-field': 'live-ip' }, activity?.ip || '—')
            )
          )
        ),

        // ── Today's Activity Rings ──
        BentoCard('pf-card-ring',
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-chart-simple' }),
            el('span', {}, "Today's Activity")
          ),
          el('div', { class: 'pf-rings-row' },
            SVGRing({ id: 'ring-visits', value: activity?.todayVisits || 0, max: Math.max(activity?.todayVisits || 10, 10), label: 'Visits', color: 'var(--accent)' }),
            SVGRing({ id: 'ring-pages', value: activity?.pagesViewedToday || 0, max: Math.max(activity?.pagesViewedToday || 10, 10), label: 'Pages', color: 'var(--color-info)' }),
            SVGRing({ id: 'ring-actions', value: activity?.actionsToday || 0, max: Math.max(activity?.actionsToday || 10, 10), label: 'Actions', color: 'var(--color-success)' }),
            SVGRing({ id: 'ring-time', value: Math.round((activity?.totalTimeOnline || 0) / 60000), max: 480, label: 'Minutes', color: 'var(--accent-300)' })
          )
        ),

        // ── Quick Stats ──
        BentoCard('pf-card-stats',
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-fire' }),
            el('span', {}, 'All Time')
          ),
          el('div', { class: 'pf-stats-list' },
            el('div', { class: 'pf-stats-row' },
              el('span', { class: 'pf-stats-label' }, 'Total Visits'),
              el('span', { class: 'pf-stats-value' }, String(activity?.totalVisits || 0))
            ),
            el('div', { class: 'pf-stats-row' },
              el('span', { class: 'pf-stats-label' }, 'Time Online Today'),
              el('span', { class: 'pf-stats-value' }, formatDuration(activity?.totalTimeOnline || 0))
            ),
            el('div', { class: 'pf-stats-row' },
              el('span', { class: 'pf-stats-label' }, 'Pages Visited Today'),
              el('span', { class: 'pf-stats-value' }, String(uniquePages.length))
            ),
            el('div', { class: 'pf-stats-row' },
              el('span', { class: 'pf-stats-label' }, 'Connected Since'),
              el('span', { class: 'pf-stats-value' }, activity?.connectedAt ? format(activity.connectedAt) : '—')
            )
          )
        ),

        // ── Account Info ──
        BentoCard('pf-card-account',
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-user' }),
            el('span', {}, 'Account')
          ),
          el('div', { class: 'pf-info-grid' },
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Username'),
              el('span', { class: 'pf-info-value' }, user.username)
            ),
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Full Name'),
              el('span', { class: 'pf-info-value' }, user.fullName || '—')
            ),
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Role'),
              el('span', { class: 'pf-info-value' }, user.role?.charAt(0).toUpperCase() + user.role?.slice(1))
            ),
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Status'),
              el('span', { class: 'pf-info-value' }, statusLabel)
            ),
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Last Login'),
              el('span', { class: 'pf-info-value' }, user.lastLogin ? relativeTime(user.lastLogin) : 'Never')
            ),
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Joined'),
              el('span', { class: 'pf-info-value' }, format(user.createdAt))
            )
          )
        ),

        // ── Session & Security ──
        BentoCard('pf-card-session',
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-shield-halved' }),
            el('span', {}, 'Session & Security')
          ),
          el('div', { class: 'pf-info-grid' },
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Session Version'),
              el('span', { class: 'pf-info-value' }, `v${sv}`)
            ),
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Session Note'),
              el('span', { class: 'pf-info-value' }, sv > 1 ? 'Previously force-logged out' : 'No forced logouts')
            ),
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Login Count'),
              el('span', { class: 'pf-info-value' }, String(user.loginCount || 0))
            ),
            el('div', { class: 'pf-info-item' },
              el('span', { class: 'pf-info-label' }, 'Last IP'),
              el('span', { class: 'pf-info-value pf-val--mono' }, user.ip || user.lastLoginIp || '—')
            )
          )
        ),

        // ── Recent Activity Timeline ──
        BentoCard('pf-card-history',
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-clock-rotate-left' }),
            el('span', {}, 'Recent Activity'),
            el('span', { class: 'pf-history-count' }, `${recentPages.length} entries`)
          ),
          recentPages.length
            ? el('div', { class: 'pf-timeline' },
                ...recentPages.map(p => TimelineItem(p.page, p.enteredAt, p.duration))
              )
            : el('div', { class: 'pf-empty' },
                el('i', { class: 'fa-regular fa-clock' }),
                el('p', {}, 'No activity recorded yet.')
              )
        ),

        // ── Pages Visited Today ──
        uniquePages.length > 0
          ? BentoCard('pf-card-pages',
              el('div', { class: 'pf-card-header' },
                el('i', { class: 'fa-solid fa-folder-open' }),
                el('span', {}, 'Pages Today'),
                el('span', { class: 'pf-history-count' }, `${uniquePages.length} unique`)
              ),
              el('div', { class: 'pf-pages-grid' },
                ...uniquePages.slice(0, 12).map(p =>
                  el('span', { class: 'pf-page-chip', title: p }, p)
                )
              )
            )
          : null
      ),

      el('script', { id: 'viewuser-state', type: 'application/json' },
        JSON.stringify({ userId: user.id, sessionUser, activity })
      ),

      el('script', { src: '/acrx/assets/js/viewUser.js' })
    )
  );
}

module.exports = { renderViewUser };

module.exports.meta = [
  {
    path: '/acrx/users/:id',
    title: 'User Profile — Acroxa',
    render: 'renderViewUser',
    css: [
      '/acrx/assets/css/ad-st.css',
      '/acrx/assets/css/ad-users.css',
      '/acrx/assets/css/profile.css'
    ],
    js: [
      '/acrx/assets/js/system/_shared.js',
    ],
    layout: 'full'
  }
];