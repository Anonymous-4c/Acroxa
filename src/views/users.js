// src/views/users.js — v4 Complete Bento UI with SSE realtime
'use strict';

const {
  el,
  icon,
  PageWrapper,
  MainHeader,
  MainContent,
  Input,
  PaginationControls,
  CustomDropdown,
} = require('./lib/framework');

// ─── Utility ──────────────────────────────────────────────────────────────────
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

function loginRecencyClass(date) {
  if (!date) return 'recency-never';
  const hours = (Date.now() - new Date(date).getTime()) / 3600000;
  if (hours < 1)   return 'recency-now';
  if (hours < 24)  return 'recency-today';
  if (hours < 168) return 'recency-week';
  return 'recency-old';
}

function formatDuration(ms) {
  if (!ms) return '0m';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── SVG Ring Widget (stroke-dasharray) ──────────────────────────────
function SVGRing({ id, value, max, label, size = 80, stroke = 6, color = 'var(--accent)' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const dashoffset = circumference * (1 - pct);

  return el('div', { class: 'u-ring-widget', id },
    el('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'u-ring-svg' },
      el('circle', {
        cx: size / 2, cy: size / 2, r: radius,
        fill: 'none', stroke: 'var(--color-primary-300)', 'stroke-width': stroke
      }),
      el('circle', {
        cx: size / 2, cy: size / 2, r: radius,
        fill: 'none', stroke: color, 'stroke-width': stroke,
        'stroke-linecap': 'round',
        'stroke-dasharray': circumference,
        'stroke-dashoffset': dashoffset,
        class: 'u-ring-progress',
        'data-circumference': circumference,
        'data-target': dashoffset
      })
    ),
    el('div', { class: 'u-ring-center' },
      el('span', { class: 'u-ring-val', 'data-ring-value': id }, String(value)),
      el('span', { class: 'u-ring-lbl' }, label)
    )
  );
}

// ─── Bento Stats Widgets ─────────────────────────────────────────────
function BentoStats(users, meta, activityStats) {
  const total     = meta.total || users.length;
  const active    = users.filter(u => !u.isSuspended && u.isActive).length;
  const suspended = users.filter(u => u.isSuspended).length;
  const onlineNow = activityStats?.onlineNow || 0;
  const activeToday = activityStats?.activeToday || 0;
  const totalActions = activityStats?.totalActions || 0;

  return el('div', { class: 'u-bento-stats' },
    // Row 1: Metric cards
    el('div', { class: 'u-bento-metrics' },
      el('div', { class: 'u-bento-card u-bento-card--accent' },
        el('div', { class: 'u-bento-card-icon' }, el('i', { class: 'fa-solid fa-users' })),
        el('div', { class: 'u-bento-card-data' },
          el('span', { class: 'u-bento-val', id: 'bento-total' }, String(total)),
          el('span', { class: 'u-bento-label' }, 'Total Users')
        ),
        el('span', { class: 'u-bento-change steady' }, `${meta.pages || 1} page${meta.pages !== 1 ? 's' : ''}`)
      ),
      el('div', { class: 'u-bento-card u-bento-card--green' },
        el('div', { class: 'u-bento-card-icon' }, el('i', { class: 'fa-solid fa-circle-check' })),
        el('div', { class: 'u-bento-card-data' },
          el('span', { class: 'u-bento-val', id: 'bento-active' }, String(active)),
          el('span', { class: 'u-bento-label' }, 'Active')
        ),
        el('span', { class: 'u-bento-change up' }, total ? `${Math.round((active / total) * 100)}%` : '—')
      ),
      el('div', { class: 'u-bento-card u-bento-card--red' },
        el('div', { class: 'u-bento-card-icon' }, el('i', { class: 'fa-solid fa-ban' })),
        el('div', { class: 'u-bento-card-data' },
          el('span', { class: 'u-bento-val', id: 'bento-suspended' }, String(suspended)),
          el('span', { class: 'u-bento-label' }, 'Suspended')
        ),
        el('span', { class: 'u-bento-change' }, suspended > 0 ? 'review' : 'clear')
      ),
      el('div', { class: 'u-bento-card u-bento-card--online' },
        el('div', { class: 'u-bento-card-icon u-pulse-icon' }, el('i', { class: 'fa-solid fa-signal' })),
        el('div', { class: 'u-bento-card-data' },
          el('span', { class: 'u-bento-val u-val-live', id: 'bento-online' }, String(onlineNow)),
          el('span', { class: 'u-bento-label' }, 'Online Now')
        ),
        el('span', { class: 'u-bento-change up' }, 'live')
      )
    ),

    // Row 2: SVG rings + Live panel
    el('div', { class: 'u-bento-intel' },
      // Rings card
      el('div', { class: 'u-bento-card u-bento-card--rings' },
        el('div', { class: 'u-bento-card-header' },
          el('i', { class: 'fa-solid fa-chart-pie' }),
          el('span', {}, 'Activity Breakdown')
        ),
        el('div', { class: 'u-rings-grid' },
          SVGRing({ id: 'ring-online', value: onlineNow, max: Math.max(total, 1), label: 'Online', color: 'var(--color-success)' }),
          SVGRing({ id: 'ring-today', value: activeToday, max: Math.max(total, 1), label: 'Today', color: 'var(--accent)' }),
          SVGRing({ id: 'ring-actions', value: totalActions, max: Math.max(totalActions, 10), label: 'Actions', color: 'var(--color-info)' }),
          SVGRing({ id: 'ring-time', value: Math.round(activityStats?.avgTimeOnline / 60000) || 0, max: 480, label: 'Min Online', color: 'var(--accent-300)' })
        )
      ),

      // Live Online Users Panel
      el('div', { class: 'u-bento-card u-bento-card--live', id: 'live-panel' },
        el('div', { class: 'u-bento-card-header' },
          el('i', { class: 'fa-solid fa-bolt' }),
          el('span', {}, 'Live Users'),
          el('span', { class: 'u-live-count', id: 'live-count' }, String(onlineNow))
        ),
        el('div', { class: 'u-live-list', id: 'live-list' },
          el('div', { class: 'u-live-empty' }, 'Scanning...')
        )
      ),

      // Top Pages
      el('div', { class: 'u-bento-card u-bento-card--pages' },
        el('div', { class: 'u-bento-card-header' },
          el('i', { class: 'fa-solid fa-fire' }),
          el('span', {}, 'Top Pages')
        ),
        el('div', { class: 'u-top-pages', id: 'top-pages' },
          el('div', { class: 'u-live-empty' }, 'Loading...')
        )
      )
    )
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────
function RoleBadge(role) {
  const icons = {
    admin: 'shield-halved', editor: 'pen-nib', author: 'feather',
    seo: 'magnifying-glass-chart', designer: 'paintbrush', developer: 'code', user: 'user'
  };
  return el('span', { class: `u-role-badge role-${role}` },
    icon(icons[role] || 'user', 'solid'), ' ', role
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────
function StatusPill(user) {
  if (user.isSuspended) return el('span', { class: 'u-status suspended' }, el('i', { class: 'u-status-dot' }), 'Suspended');
  if (!user.isActive)   return el('span', { class: 'u-status inactive' }, el('i', { class: 'u-status-dot' }), 'Inactive');
  return el('span', { class: 'u-status active' }, el('i', { class: 'u-status-dot' }), 'Active');
}

// ─── Avatar Cell ─────────────────────────────────────────────────────
function AvatarCell(user) {
  const initials = (user.fullName || user.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  const recency = loginRecencyClass(user.lastLogin);
  const avatarEl = user.avatar
    ? el('div', { class: `u-avatar ${recency}` }, el('img', { src: user.avatar, alt: user.username, loading: 'lazy' }))
    : el('div', { class: `u-avatar u-avatar--initials role-${user.role} ${recency}` }, initials);
  return el('div', { class: 'u-avatar-wrap' }, avatarEl, el('i', { class: `u-pulse ${recency}` }));
}

// ─── Session Version Badge ────────────────────────────────────────────
function SessionBadge(user) {
  const sv = user.sessionVersion || 1;
  return el('span', {
    class: `u-session-ver ${sv > 1 ? 'bumped' : ''}`,
    title: `Session version ${sv}${sv > 1 ? ' — previously force-logged out' : ''}`
  }, `sv${sv}`);
}

// ─── Row Actions ─────────────────────────────────────────────────────
function RowActions(user) {
  const uid = user.id || user._id;
  return el('div', { class: 'u-row-actions' },
    el('button', { class: 'u-action-btn', title: 'View',   'data-action': 'view',   'data-id': uid }, icon('eye', 'regular')),
    el('button', { class: 'u-action-btn', title: 'Edit',   'data-action': 'edit',   'data-id': uid }, icon('pen-to-square', 'regular')),
    el('button', {
      class: 'u-action-btn',
      title: user.isSuspended ? 'Activate' : 'Suspend',
      'data-action': user.isSuspended ? 'activate' : 'suspend',
      'data-id': uid
    }, icon(user.isSuspended ? 'circle-check' : 'ban', 'regular')),
    el('button', { class: 'u-action-btn', title: 'Force Logout', 'data-action': 'logout', 'data-id': uid }, icon('right-from-bracket', 'regular')),
    el('button', { class: 'u-action-btn u-action-btn--danger', title: 'Delete', 'data-action': 'delete', 'data-id': uid }, icon('trash', 'regular'))
  );
}

// ─── User Row ────────────────────────────────────────────────────────
function UserRow(user, sessionUser, activity) {
  const uid = user.id || user._id;
  const relLogin = relativeTime(user.lastLogin);
  const absLogin = user.lastLogin
    ? new Date(user.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never logged in';
  const roleIcon = { admin: 'shield-halved', editor: 'pen-nib', author: 'feather', seo: 'magnifying-glass-chart', designer: 'paintbrush', developer: 'code', user: 'user' }[user.role] || 'user';
  const stateClass = user.isSuspended ? 'is-suspended' : !user.isActive ? 'is-inactive' : '';
  const isSelf = sessionUser && (uid === sessionUser.userId || uid === sessionUser.userId?.toString());
  const selfClass = isSelf ? ' u-row--self' : '';

  const act = activity || {};
  const activePage = act.activePage || '—';
  const isActiveNow = act.isActive && act.lastSeen && (Date.now() - new Date(act.lastSeen).getTime()) < 5 * 60 * 1000;
  const lastSeenRel = act.lastSeen ? relativeTime(act.lastSeen) : '—';
  const lastSeenAbs = act.lastSeen ? new Date(act.lastSeen).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const activityIp = act.ip || '—';

  return el('label', { class: `u-row ${stateClass}${selfClass}`, 'data-id': uid, ...(isSelf ? { 'data-self': 'true' } : {}) },
    el('input', { type: 'checkbox', class: 'u-row-select', 'data-id': uid, value: uid, ...(isSelf ? { disabled: true } : {}) }),
    el('div', { class: 'u-row-inner' },
      el('div', { class: 'u-sel-strip' }),
      el('div', { class: 'u-col u-col-avatar' }, AvatarCell(user)),
      el('div', { class: 'u-col u-col-identity' },
        el('div', { class: 'u-identity-main' },
          el('span', { class: 'u-username' }, user.username),
          isSelf ? el('span', { class: 'u-self-badge' }, 'You') : null,
          SessionBadge(user)
        ),
        user.fullName ? el('span', { class: 'u-fullname' }, user.fullName) : el('span', { class: 'u-fullname u-fullname--empty' }, '—'),
        el('span', { class: 'u-email-compact' }, user.email)
      ),
      el('div', { class: 'u-col u-col-email' }, el('span', { class: 'u-email' }, user.email)),
      el('div', { class: 'u-col u-col-role' }, RoleBadge(user.role)),
      el('div', { class: 'u-col u-col-status' }, StatusPill(user)),
      el('div', { class: 'u-col u-col-login' },
        el('span', { class: `u-last-login ${loginRecencyClass(user.lastLogin)}`, title: absLogin }, relLogin || '—')
      ),
      el('div', { class: 'u-col u-col-activity' },
        el('div', { class: 'u-activity-cell' },
          el('span', { class: `u-active-indicator ${isActiveNow ? 'is-online' : ''}`, title: isActiveNow ? `Active on ${activePage}` : `Last seen: ${lastSeenAbs}` }, isActiveNow ? '●' : '○'),
          el('span', { class: 'u-active-page', title: activePage }, activePage),
          el('span', { class: 'u-last-seen-time', title: lastSeenAbs }, lastSeenRel)
        )
      ),
      el('div', { class: 'u-col u-col-ip' }, el('span', { class: 'u-ip-addr', title: activityIp }, activityIp)),
      el('div', { class: 'u-col u-col-actions' }, RowActions(user))
    )
  );
}

// ─── Table Header ─────────────────────────────────────────────────────
function TableHeader() {
  return el('div', { class: 'u-table-head' },
    el('div', { class: 'u-th-sel-strip' }),
    el('label', { class: 'u-select-all-wrap', title: 'Select all visible' },
      el('input', { type: 'checkbox', id: 'select-all-users', class: 'u-select-all' }),
      el('span', { class: 'u-select-all-icon' }, icon('square-check', 'regular'))
    ),
    el('div', { class: 'u-th u-th-identity' }, 'User'),
    el('div', { class: 'u-th u-th-email' }, 'Email'),
    el('div', { class: 'u-th u-th-role' }, 'Role'),
    el('div', { class: 'u-th u-th-status' }, 'Status'),
    el('div', { class: 'u-th u-th-login' }, 'Last Login'),
    el('div', { class: 'u-th u-th-activity' }, 'Activity'),
    el('div', { class: 'u-th u-th-ip' }, 'IP'),
    el('div', { class: 'u-th u-th-actions' }, '')
  );
}

// ─── Empty State ─────────────────────────────────────────────────────
function EmptyState() {
  return el('div', { class: 'u-empty-state', id: 'users-empty' },
    el('div', { class: 'u-empty-icon' }, icon('users-slash', 'duotone')),
    el('p', { class: 'u-empty-title' }, 'No users found'),
    el('p', { class: 'u-empty-sub' }, 'Try adjusting your filters or search query.')
  );
}

// ─── Filter / Control Strip ───────────────────────────────────────────
function QuickChips() {
  const chips = [
    { id: 'chip-active',   label: 'Active',          icon: 'circle-check',  filter: 'status', value: 'active'    },
    { id: 'chip-suspended',label: 'Suspended',        icon: 'ban',           filter: 'status', value: 'suspended' },
    { id: 'chip-recent',   label: 'Online today',     icon: 'signal',        filter: 'status', value: 'recent'    },
    { id: 'chip-admins',   label: 'Admins',           icon: 'shield-halved', filter: 'role',   value: 'admin'     },
  ];
  return el('div', { class: 'u-quick-chips' },
    ...chips.map(c =>
      el('button', {
        class: 'u-chip', id: c.id,
        'data-chip-filter': c.filter, 'data-chip-value': c.value,
        title: `Filter: ${c.label}`
      }, icon(c.icon, 'regular'), ' ', c.label)
    )
  );
}

function FilterBar() {
  return el('div', { class: 'u-control-strip' },
    el('div', { class: 'u-filter-main' },
      el('div', { class: 'u-search-wrap' },
        icon('magnifying-glass', 'regular'),
        Input({ id: 'users-search', placeholder: 'Search users — name, email, username…', className: 'u-search-input', attrs: { autocomplete: 'off', spellcheck: 'false' } }),
        el('kbd', { class: 'u-search-kbd' }, '/')
      ),
      el('div', { class: 'u-filter-dropdowns' },
        CustomDropdown({ id: 'filter-role', label: 'Role', extraClass: 'u-filter-dropdown', items: [
          { label: 'All Roles', value: '' }, { label: 'Admin', value: 'admin' }, { label: 'Editor', value: 'editor' },
          { label: 'Author', value: 'author' }, { label: 'SEO', value: 'seo' }, { label: 'Designer', value: 'designer' },
          { label: 'Developer', value: 'developer' }, { label: 'User', value: 'user' }
        ]}),
        CustomDropdown({ id: 'filter-status', label: 'Status', extraClass: 'u-filter-dropdown', items: [
          { label: 'All', value: '' }, { label: 'Active', value: 'active' }, { label: 'Suspended', value: 'suspended' }, { label: 'Inactive', value: 'inactive' }
        ]}),
        el('button', { class: 'u-clear-filters', id: 'clear-filters', style: 'display:none', title: 'Reset all filters' },
          icon('arrow-rotate-left', 'regular'), ' Reset')
      ),
      QuickChips()
    )
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────
function BulkBar() {
  return el('div', { class: 'u-bulk-bar', id: 'bulk-bar', 'aria-hidden': 'true' },
    el('div', { class: 'u-bulk-identity' },
      el('span', { class: 'u-bulk-check-icon' }, icon('square-check', 'solid')),
      el('div', { class: 'u-bulk-count-wrap' },
        el('span', { class: 'u-bulk-count-num', id: 'bulk-count-num' }, '0'),
        el('span', { class: 'u-bulk-count-label' }, 'selected')
      )
    ),
    el('div', { class: 'u-bulk-divider' }),
    el('div', { class: 'u-bulk-group' },
      el('button', { class: 'u-bulk-btn', 'data-bulk-action': 'activate', title: 'Activate' }, icon('circle-check', 'regular'), ' Activate'),
      el('button', { class: 'u-bulk-btn u-bulk-btn--warn', 'data-bulk-action': 'suspend', title: 'Suspend' }, icon('ban', 'regular'), ' Suspend'),
      el('button', { class: 'u-bulk-btn', 'data-bulk-action': 'force-logout', title: 'Force Logout' }, icon('right-from-bracket', 'regular'), ' Force Logout')
    ),
    el('div', { class: 'u-bulk-divider' }),
    el('div', { class: 'u-bulk-group' },
      el('button', { class: 'u-bulk-btn u-bulk-btn--danger', 'data-bulk-action': 'delete', title: 'Delete' }, icon('trash', 'regular'), ' Delete')
    ),
    el('button', { class: 'u-bulk-dismiss', id: 'bulk-dismiss', title: 'Clear selection' }, icon('xmark', 'solid'))
  );
}

// ─── Table Shell ──────────────────────────────────────────────────────
function UsersTable(users = [], sessionUser, activityMap = {}) {
  return el('div', { class: 'u-table-wrap', id: 'users-table-wrap' },
    TableHeader(),
    el('div', { class: 'u-table-body', id: 'users-table-body' },
      users.length ? users.map(u => UserRow(u, sessionUser, activityMap[u.id || u._id])).join('') : EmptyState()
    )
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────
function Toolbar({ total = 0, limit = 20 } = {}) {
  const perPageOpts = [10, 20, 50, 100];
  return el('div', { class: 'u-toolbar' },
    el('div', { class: 'u-toolbar-left' },
      el('span', { class: 'u-total-count', id: 'users-total-count' }, total, ' users'),
      el('div', { class: 'u-perpage-wrap' },
        el('span', { class: 'u-perpage-label' }, 'per page'),
        el('select', { class: 'u-perpage-select', id: 'users-per-page' },
          ...perPageOpts.map(n => el('option', { value: n, ...(n === limit ? { selected: true } : {}) }, n))
        )
      )
    ),
    el('div', { class: 'u-toolbar-right' }, PaginationControls())
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────
function ConfirmModal() {
  return el('div', { class: 'u-modal-overlay', id: 'u-confirm-modal', 'aria-hidden': 'true' },
    el('div', { class: 'u-modal' },
      el('div', { class: 'u-modal-header' },
        el('h3', { id: 'u-modal-title' }, 'Confirm Action'),
        el('button', { class: 'u-modal-close', id: 'u-modal-close' }, icon('xmark', 'solid'))
      ),
      el('div', { class: 'u-modal-body' }, el('p', { id: 'u-modal-msg' }, '')),
      el('div', { class: 'u-modal-footer' },
        el('button', { class: 'ghost', id: 'u-modal-cancel' }, 'Cancel'),
        el('button', { class: 'u-modal-confirm-btn', id: 'u-modal-confirm' }, 'Confirm')
      )
    )
  );
}

function ToastContainer() {
  return el('div', { class: 'u-toast-stack', id: 'u-toast-stack', 'aria-live': 'polite' });
}

// ─── Main renderUsers ─────────────────────────────────────────────────
async function renderUsers(req, res) {
  let users = [];
  let meta = { page: 1, limit: 20, total: 0, pages: 1 };
  let sessionUser = null;
  let activityMap = {};
  let activityStats = { onlineNow: 0, activeToday: 0, totalActions: 0, totalPageViews: 0, topPages: [], avgTimeOnline: 0 };

  try {
    const { connectDB } = require('../core/connect-db');
    const models = await connectDB();
    const User = models.User;

    if (User) {
      const page = parseInt(req.query?.page) || 1;
      const limit = parseInt(req.query?.limit) || 20;
      const skip = (page - 1) * limit;

      const total = await User.countDocuments();
      const data = await User.find()
        .select('-password -__v -resetPasswordToken -emailVerificationCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      users = data.map(u => ({
        ...u,
        id: u._id?.toString() || u.id,
        profilePicture: u.avatar || u.profilePicture || '',
      }));

      meta = { page, limit, total, pages: Math.ceil(total / limit) };

      // Fetch session activity
      if (models.SessionActivity) {
        try {
          const userIds = users.map(u => u.id);
          const activities = await models.SessionActivity.find({ userId: { $in: userIds } })
            .select('userId activePage lastSeen ip isActive sessionId totalVisits todayVisits actionsToday pagesViewedToday totalTimeOnline pagesVisited')
            .lean();
          activities.forEach(a => {
            const uid = a.userId?.toString() || a.userId;
            activityMap[uid] = a;
          });

          // Get stats
          if (models.SessionActivity.getActivityStats) {
            activityStats = await models.SessionActivity.getActivityStats();
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[users.js] SSR preload error:', err.message);
  }

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

  return PageWrapper({ className: 'acrx-dshb-wr acrx-users-wr' },

    MainHeader({
      title: 'Users',
      actions: [
        { icon: 'rotate-right', title: 'Refresh',  class: 'btn ghost',    dataClick: 'refresh-users' },
        { icon: 'circle-plus',  title: 'Add User', class: 'btn primary',  dataClick: 'open-create-user' }
      ]
    }),

    MainContent(
      BentoStats(users, meta, activityStats),
      FilterBar(),
      BulkBar(),
      Toolbar({ total: meta.total, limit: meta.limit }),
      UsersTable(users, sessionUser, activityMap),
      el('div', { class: 'u-pagination-bottom' }, PaginationControls())
    ),

    ConfirmModal(),
    ToastContainer(),

    el('script', { id: 'users-page-state', type: 'application/json' },
      JSON.stringify({
        page: meta.page, limit: meta.limit, total: meta.total, pages: meta.pages,
        sessionUser: sessionUser,
        activityStats: activityStats
      })
    )
  );
}

module.exports = { renderUsers };

module.exports.meta = [
  {
    path: '/acrx/users',
    title: 'Users — Acroxa',
    render: 'renderUsers',
    css: [
      '/acrx/assets/css/ad-st.css',
      '/acrx/assets/css/ad-users.css'
    ],
    js: [
      '/acrx/assets/js/system/_shared.js',
      '/acrx/assets/js/users.js'
    ],
    layout: 'full'
  }
];