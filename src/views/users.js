// src/views/users.js  — v2 (table approach + session data)
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
  MetricCard,
} = require('./lib/framework');

// ─── Utility ──────────────────────────────────────────────────────────────────

function relativeTime(date) {
  if (!date) return null;
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

// ─── Intelligence Widgets ─────────────────────────────────────────────────────

function computeStats(users = [], meta = {}) {
  const total      = meta.total || users.length;
  const active     = users.filter(u => !u.isSuspended && u.isActive).length;
  const suspended  = users.filter(u => u.isSuspended).length;
  const sevenDays  = Date.now() - 7 * 86400000;
  const newUsers   = users.filter(u => new Date(u.createdAt || 0) > sevenDays).length;

  const roles = {};
  users.forEach(u => { roles[u.role] = (roles[u.role] || 0) + 1; });

  const recentLogin = users.filter(u => {
    if (!u.lastLogin) return false;
    return (Date.now() - new Date(u.lastLogin).getTime()) < 86400000;
  }).length;

  return { total, active, suspended, newUsers, roles, recentLogin };
}

function RoleDistributionBar(roles = {}) {
  const order = ['admin','editor','author','designer','developer','seo','user'];
  const total  = Object.values(roles).reduce((s, n) => s + n, 0) || 1;

  const segments = order
    .filter(r => roles[r])
    .map(r => el('div', {
      class: `rd-seg role-${r}`,
      style: `width:${Math.max(4, (roles[r] / total) * 100).toFixed(1)}%`,
      title: `${r}: ${roles[r]}`
    }));

  const legend = order
    .filter(r => roles[r])
    .map(r => el('span', { class: `rd-leg-item role-${r}` },
      el('i'),
      ` ${r} `,
      el('b', {}, roles[r])
    ));

  return el('div', { class: 'u-widget u-widget--roles' },
    el('div', { class: 'u-widget-label' },
      icon('users-viewfinder', 'duotone'), ' Role Distribution'
    ),
    el('div', { class: 'rd-bar' }, ...segments),
    el('div', { class: 'rd-legend' }, ...legend)
  );
}

function LoginActivityWidget(recentLogin = 0, total = 0) {
  const pct = total ? Math.round((recentLogin / total) * 100) : 0;
  const ring = Math.max(4, pct);

  return el('div', { class: 'u-widget u-widget--activity' },
    el('div', { class: 'u-widget-label' },
      icon('signal', 'duotone'), ' Login Activity (24h)'
    ),
    el('div', { class: 'u-act-wrap' },
      el('div', { class: 'u-act-ring', style: `--pct:${ring}` },
        el('span', { class: 'u-act-num' }, recentLogin),
        el('span', { class: 'u-act-sub' }, 'active')
      ),
      el('div', { class: 'u-act-meta' },
        el('p', {}, el('b', {}, recentLogin), ` of ${total} users logged in today`),
        el('p', { class: 'u-act-pct' }, `${pct}% engagement rate`)
      )
    )
  );
}

function DashboardWidgets(users, meta) {
  const s = computeStats(users, meta);

  const metrics = [
    {
      icon: 'users',
      title: 'Total Users',
      value: s.total,
      change: `${meta.pages || 1} page${meta.pages !== 1 ? 's' : ''}`,
      changeType: 'steady'
    },
    {
      icon: 'circle-check',
      title: 'Active',
      value: s.active,
      change: s.total ? `${Math.round((s.active / s.total) * 100)}%` : '—',
      changeType: 'up'
    },
    {
      icon: 'ban',
      title: 'Suspended',
      value: s.suspended,
      change: s.suspended > 0 ? 'needs review' : 'all clear',
      changeType: s.suspended > 0 ? 'down' : 'steady'
    },
    {
      icon: 'user-plus',
      title: 'New (7d)',
      value: s.newUsers,
      change: 'this week',
      changeType: s.newUsers > 0 ? 'up' : 'steady'
    },
  ];

  return el('div', { class: 'u-dash-widgets' },
    el('div', { class: 'u-metrics-row' },
      ...metrics.map(MetricCard)
    ),
    el('div', { class: 'u-intel-row' },
      RoleDistributionBar(s.roles),
      LoginActivityWidget(s.recentLogin, s.total)
    )
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge(role) {
  const icons = {
    admin: 'shield-halved', editor: 'pen-nib', author: 'feather',
    seo: 'magnifying-glass-chart', designer: 'paintbrush', developer: 'code', user: 'user'
  };
  return el('span', { class: `u-role-badge role-${role}` },
    icon(icons[role] || 'user', 'solid'), ' ', role
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill(user) {
  if (user.isSuspended) {
    return el('span', { class: 'u-status suspended' },
      el('i', { class: 'u-status-dot' }), 'Suspended'
    );
  }
  if (!user.isActive) {
    return el('span', { class: 'u-status inactive' },
      el('i', { class: 'u-status-dot' }), 'Inactive'
    );
  }
  return el('span', { class: 'u-status active' },
    el('i', { class: 'u-status-dot' }), 'Active'
  );
}

// ─── Avatar Cell ─────────────────────────────────────────────────────────────

function AvatarCell(user) {
  const initials = (user.fullName || user.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

  const recency = loginRecencyClass(user.lastLogin);

  const avatarEl = user.avatar
    ? el('div', { class: `u-avatar ${recency}` },
        el('img', { src: user.avatar, alt: user.username, loading: 'lazy' })
      )
    : el('div', { class: `u-avatar u-avatar--initials role-${user.role} ${recency}` }, initials);

  return el('div', { class: 'u-avatar-wrap' },
    avatarEl,
    el('i', { class: `u-pulse ${recency}` })
  );
}

// ─── Session Version Indicator ────────────────────────────────────────────────

function SessionBadge(user) {
  const sv = user.sessionVersion || 1;
  return el('span', {
    class: `u-session-ver ${sv > 1 ? 'bumped' : ''}`,
    title: `Session version ${sv}${sv > 1 ? ' — previously force-logged out' : ''}`
  }, `sv${sv}`);
}

// ─── Row Actions ─────────────────────────────────────────────────────────────

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

// ─── Single User Row (enriched) ───────────────────────────────────────────────

function UserRow(user, sessionUser) {
  const uid        = user.id || user._id;
  const relLogin   = relativeTime(user.lastLogin);
  const absLogin   = user.lastLogin
    ? new Date(user.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never logged in';
  const stateClass = user.isSuspended ? 'is-suspended' : !user.isActive ? 'is-inactive' : '';
  const isSelf     = sessionUser && (uid === sessionUser.userId || uid === sessionUser.userId?.toString());
  const selfClass  = isSelf ? ' u-row--self' : '';

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
        user.fullName
          ? el('span', { class: 'u-fullname' }, user.fullName)
          : el('span', { class: 'u-fullname u-fullname--empty' }, '—'),
        el('span', { class: 'u-email-compact' }, user.email)
      ),

      el('div', { class: 'u-col u-col-email' },
        el('span', { class: 'u-email' }, user.email)
      ),

      el('div', { class: 'u-col u-col-role' },
        RoleBadge(user.role)
      ),

      el('div', { class: 'u-col u-col-status' },
        StatusPill(user)
      ),

      el('div', { class: 'u-col u-col-login' },
        el('span', {
          class: `u-last-login ${loginRecencyClass(user.lastLogin)}`,
          title: absLogin
        }, relLogin || '—')
      ),

      el('div', { class: 'u-col u-col-actions' }, RowActions(user))
    )
  );
}

// ─── Table Header ─────────────────────────────────────────────────────────────

function TableHeader() {
  return el('div', { class: 'u-table-head' },
    el('div', { class: 'u-th-sel-strip' }),
    el('label', { class: 'u-select-all-wrap', title: 'Select all visible' },
      el('input', { type: 'checkbox', id: 'select-all-users', class: 'u-select-all' }),
      el('span', { class: 'u-select-all-icon' },
        icon('square-check', 'regular')
      )
    ),
    el('div', { class: 'u-th u-th-identity' }, 'User'),
    el('div', { class: 'u-th u-th-email' }, 'Email'),
    el('div', { class: 'u-th u-th-role' }, 'Role'),
    el('div', { class: 'u-th u-th-status' }, 'Status'),
    el('div', { class: 'u-th u-th-login' },
      'Last Login', ' ',
      el('span', { class: 'u-th-hint' }, '↕')
    ),
    el('div', { class: 'u-th u-th-actions' }, '')
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return el('div', { class: 'u-empty-state', id: 'users-empty' },
    el('div', { class: 'u-empty-icon' }, icon('users-slash', 'duotone')),
    el('p', { class: 'u-empty-title' }, 'No users found'),
    el('p', { class: 'u-empty-sub' }, 'Try adjusting your filters or search query.')
  );
}

// ─── Filter / Control Strip ───────────────────────────────────────────────────

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
        class: 'u-chip',
        id: c.id,
        'data-chip-filter': c.filter,
        'data-chip-value': c.value,
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
        Input({
          id: 'users-search',
          placeholder: 'Search users — name, email, username…',
          className: 'u-search-input',
          attrs: { autocomplete: 'off', spellcheck: 'false' }
        }),
        el('kbd', { class: 'u-search-kbd' }, '/')
      ),
      el('div', { class: 'u-filter-dropdowns' },
        CustomDropdown({
          id: 'filter-role',
          label: 'Role',
          extraClass: 'u-filter-dropdown',
          items: [
            { label: 'All Roles',  value: '' },
            { label: 'Admin',      value: 'admin' },
            { label: 'Editor',     value: 'editor' },
            { label: 'Author',     value: 'author' },
            { label: 'SEO',        value: 'seo' },
            { label: 'Designer',   value: 'designer' },
            { label: 'Developer',  value: 'developer' },
            { label: 'User',       value: 'user' },
          ]
        }),
        CustomDropdown({
          id: 'filter-status',
          label: 'Status',
          extraClass: 'u-filter-dropdown',
          items: [
            { label: 'All',        value: '' },
            { label: 'Active',     value: 'active' },
            { label: 'Suspended',  value: 'suspended' },
            { label: 'Inactive',   value: 'inactive' },
          ]
        }),
        el('button', {
          class: 'u-clear-filters',
          id: 'clear-filters',
          style: 'display:none',
          title: 'Reset all filters'
        }, icon('arrow-rotate-left', 'regular'), ' Reset')
      ),
      QuickChips()
    )
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

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
      el('button', { class: 'u-bulk-btn', 'data-bulk-action': 'activate', title: 'Activate selected' }, icon('circle-check', 'regular'), ' Activate'),
      el('button', { class: 'u-bulk-btn u-bulk-btn--warn', 'data-bulk-action': 'suspend', title: 'Suspend selected' }, icon('ban', 'regular'), ' Suspend'),
      el('button', { class: 'u-bulk-btn', 'data-bulk-action': 'force-logout', title: 'Force logout' }, icon('right-from-bracket', 'regular'), ' Force Logout')
    ),
    el('div', { class: 'u-bulk-divider' }),
    el('div', { class: 'u-bulk-group' },
      el('button', { class: 'u-bulk-btn u-bulk-btn--danger', 'data-bulk-action': 'delete', title: 'Delete selected' }, icon('trash', 'regular'), ' Delete')
    ),
    el('button', { class: 'u-bulk-dismiss', id: 'bulk-dismiss', title: 'Clear selection' }, icon('xmark', 'solid'))
  );
}

// ─── Table Shell ──────────────────────────────────────────────────────────────

function UsersTable(users = [], sessionUser) {
  return el('div', { class: 'u-table-wrap', id: 'users-table-wrap' },
    TableHeader(),
    el('div', { class: 'u-table-body', id: 'users-table-body' },
      users.length ? users.map(u => UserRow(u, sessionUser)).join('') : EmptyState()
    )
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ total = 0, limit = 20 } = {}) {
  const perPageOpts = [10, 20, 50, 100];

  return el('div', { class: 'u-toolbar' },
    el('div', { class: 'u-toolbar-left' },
      el('span', { class: 'u-total-count', id: 'users-total-count' }, total, ' users'),
      el('div', { class: 'u-perpage-wrap' },
        el('span', { class: 'u-perpage-label' }, 'per page'),
        el('select', { class: 'u-perpage-select', id: 'users-per-page' },
          ...perPageOpts.map(n =>
            el('option', { value: n, ...(n === limit ? { selected: true } : {}) }, n)
          )
        )
      )
    ),
    el('div', { class: 'u-toolbar-right' },
      PaginationControls()
    )
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal() {
  return el('div', { class: 'u-modal-overlay', id: 'u-confirm-modal', 'aria-hidden': 'true' },
    el('div', { class: 'u-modal' },
      el('div', { class: 'u-modal-header' },
        el('h3', { id: 'u-modal-title' }, 'Confirm Action'),
        el('button', { class: 'u-modal-close', id: 'u-modal-close' }, icon('xmark', 'solid'))
      ),
      el('div', { class: 'u-modal-body' },
        el('p', { id: 'u-modal-msg' }, '')
      ),
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

// ─── Main renderUsers ─────────────────────────────────────────────────────────

async function renderUsers(req, res) {
  let users = [];
  let meta = { page: 1, limit: 20, total: 0, pages: 1 };
  let sessionUser = null;

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
    }
  } catch (err) {
    console.error('[users.js] SSR preload error:', err.message);
  }

  // Get session user from JWT
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
        { icon: 'rotate-right', title: 'Refresh',  class: 'btn ghost',    dataClick: 'refresh-users'    },
        { icon: 'circle-plus',  title: 'Add User', class: 'btn primary',  dataClick: 'open-create-user' }
      ]
    }),

    MainContent(
      DashboardWidgets(users, meta),
      FilterBar(),
      BulkBar(),
      Toolbar({ total: meta.total, limit: meta.limit }),
      UsersTable(users, sessionUser),
      el('div', { class: 'u-pagination-bottom' },
        PaginationControls()
      )
    ),

    ConfirmModal(),
    ToastContainer(),

    el('script', { id: 'users-page-state', type: 'application/json' },
      JSON.stringify({
        page: meta.page,
        limit: meta.limit,
        total: meta.total,
        pages: meta.pages,
        sessionUser: sessionUser
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
