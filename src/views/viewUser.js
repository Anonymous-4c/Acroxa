// src/views/viewUser.js — User detail page
'use strict';

const {
  el,
  icon,
  PageWrapper,
  MainHeader,
  MainContent,
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
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function format(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const ROLE_ICONS = {
  admin: 'shield-halved', editor: 'pen-nib', author: 'feather',
  seo: 'magnifying-glass-chart', designer: 'paintbrush', developer: 'code', user: 'user'
};

function InfoRow(label, value, opts = {}) {
  return el('div', { class: 'vu-info-row' },
    el('span', { class: 'vu-info-label' }, label),
    el('span', { class: `vu-info-value ${opts.muted ? 'vu-info-value--muted' : ''} ${opts.class || ''}` }, value)
  );
}

function Section(title, content) {
  return el('div', { class: 'vu-section' },
    el('h3', { class: 'vu-section-title' }, title),
    content
  );
}

async function renderViewUser(req, res) {
  const userId = req.params.id;
  let user = null;
  let sessionUser = null;
  let error = null;

  // Get session user
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

  // Fetch user data
  try {
    const { connectDB } = require('../core/connect-db');
    const models = await connectDB();
    const User = models.User;

    if (User) {
      const data = await User.findById(userId)
        .select('-password -__v -resetPasswordToken -emailVerificationCode')
        .lean();

      if (data) {
        user = {
          ...data,
          id: data._id?.toString() || data.id,
        };
      }
    }
  } catch (err) {
    console.error('[viewUser.js] Error:', err.message);
    error = err.message;
  }

  if (error) {
    return PageWrapper({ className: 'acrx-dshb-wr acrx-users-wr' },
      MainHeader({ title: 'User Not Found' }),
      MainContent(
        el('div', { class: 'vu-error' },
          el('i', { class: 'fa-solid fa-circle-exclamation' }),
          el('p', {}, error || 'User not found.')
        )
      )
    );
  }

  if (!user) {
    return PageWrapper({ className: 'acrx-dshb-wr acrx-users-wr' },
      MainHeader({ title: 'User Not Found' }),
      MainContent(
        el('div', { class: 'vu-error' },
          el('i', { class: 'fa-solid fa-user-slash' }),
          el('p', {}, 'User not found.')
        )
      )
    );
  }

  const roleIcon = ROLE_ICONS[user.role] || 'user';
  const isSelf = sessionUser && user.id === sessionUser.userId;
  const sv = user.sessionVersion || 1;

  const initials = (user.fullName || user.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

  const avatar = user.avatar
    ? el('div', { class: 'vu-avatar' }, el('img', { src: user.avatar, alt: user.username }))
    : el('div', { class: `vu-avatar vu-avatar--initials role-${user.role}` }, initials);

  // Status
  let statusClass = 'active';
  let statusLabel = 'Active';
  if (user.isSuspended) { statusClass = 'suspended'; statusLabel = 'Suspended'; }
  else if (!user.isActive) { statusClass = 'inactive'; statusLabel = 'Inactive'; }

  // Session stats
  const svClass = sv > 1 ? 'vu-sv-bumped' : '';

  return PageWrapper({ className: 'acrx-dshb-wr acrx-users-wr' },

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
      // Profile card
      el('div', { class: 'vu-profile-card' },
        el('div', { class: 'vu-profile-header' },
          el('div', { class: 'vu-avatar-wrap' },
            avatar,
            el('div', { class: `vu-status-dot vu-status-dot--${statusClass}` })
          ),
          el('div', { class: 'vu-profile-info' },
            el('div', { class: 'vu-profile-name' },
              el('h2', {}, user.fullName || user.username),
              isSelf ? el('span', { class: 'u-self-badge' }, 'You') : null,
            ),
            el('div', { class: 'vu-profile-meta' },
              el('span', { class: `vu-role-badge role-${user.role}` },
                el('i', { class: `fa-solid fa-${roleIcon}` }), ' ', user.role
              ),
              el('span', { class: `vu-status-pill vu-status-pill--${statusClass}` }, statusLabel),
              el('span', { class: `vu-sv-badge ${svClass}` }, `Session v${sv}`)
            ),
            el('p', { class: 'vu-profile-email' }, user.email)
          )
        )
      ),

      // Info sections
      el('div', { class: 'vu-grid' },

        Section('Account Details',
          el('div', { class: 'vu-info-card' },
            InfoRow('Username', user.username),
            InfoRow('Full Name', user.fullName || '—'),
            InfoRow('Email', user.email),
            InfoRow('Role', user.role.charAt(0).toUpperCase() + user.role.slice(1)),
            InfoRow('Status', statusLabel),
            InfoRow('Default Admin', user.isDefaultAdmin ? 'Yes' : 'No'),
          )
        ),

        Section('Session & Security',
          el('div', { class: 'vu-info-card' },
            InfoRow('Session Version', `v${sv}`, { class: svClass }),
            InfoRow('Session Note', sv > 1 ? 'User was previously force-logged out' : 'No forced logouts'),
            InfoRow('Last Login', user.lastLogin ? `${relativeTime(user.lastLogin)} (${format(user.lastLogin)})` : 'Never logged in'),
            InfoRow('Login Count', user.loginCount || '—'),
            InfoRow('IP Address', user.ip || user.lastLoginIp || '—'),
            InfoRow('User Agent', user.userAgent || '—', { muted: true }),
          )
        ),

        Section('Timestamps',
          el('div', { class: 'vu-info-card' },
            InfoRow('Created', format(user.createdAt)),
            InfoRow('Last Updated', format(user.updatedAt)),
          )
        ),

        Section('Activity',
          el('div', { class: 'vu-info-card' },
            InfoRow('Posts', user.postCount || '0'),
            InfoRow('Pages', user.pageCount || '0'),
          )
        ),
      ),

      el('script', { id: 'viewuser-state', type: 'application/json' },
        JSON.stringify({ userId: user.id, sessionUser })
      )
    ),

    el('script', { src: '/acrx/assets/js/viewUser.js' })
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
      '/acrx/assets/css/viewUser.css'
    ],
    js: [
      '/acrx/assets/js/system/_shared.js',
    ],
    layout: 'full'
  }
];
