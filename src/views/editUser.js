// src/views/editUser.js — Edit User page (using framework components)
'use strict';

const {
  el,
  icon,
  PageWrapper,
  MainHeader,
  MainContent,
  Input,
  CustomDropdown,
  Toggle
} = require('./lib/framework');

module.exports.meta = [
  {
    path: "/acrx/users/:id/edit",
    render: "renderEditUser",
    title: "Edit User - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/profile.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js"
    ],
    layout: "full"
  }
];

const ROLE_ICONS = {
  admin: 'shield-halved', editor: 'pen-nib', author: 'feather',
  seo: 'magnifying-glass-chart', designer: 'paintbrush', developer: 'code', user: 'user'
};

const ROLE_OPTIONS = [
  { label: 'User', value: 'user' },
  { label: 'Author', value: 'author' },
  { label: 'Editor', value: 'editor' },
  { label: 'SEO', value: 'seo' },
  { label: 'Designer', value: 'designer' },
  { label: 'Developer', value: 'developer' }
];

const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' }
];

function format(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function RoleBadge(role) {
  return el('span', { class: 'pf-role-badge role-' + role },
    el('i', { class: 'fa-solid fa-' + (ROLE_ICONS[role] || 'user') }), ' ', role
  );
}

async function renderEditUser(req, res) {
  const userId = req.params.id;
  let user = null;
  let error = null;
  let sessionUser = null;

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

      if (data) {
        user = { ...data, id: data._id?.toString() || data.id };
      }
    }
  } catch (err) {
    console.error('[editUser.js] Error:', err.message);
    error = err.message;
  }

  if (error || !user) {
    return PageWrapper({ className: 'acrx-dshb-wr acrx-profile-wr' },
      MainHeader({ title: 'User Not Found' }),
      MainContent(el('div', { class: 'pf-error' },
        el('i', { class: 'fa-solid fa-' + (error ? 'circle-exclamation' : 'user-slash') }),
        el('p', {}, error || 'User not found.')
      ))
    );
  }

  const isSelf = sessionUser && user.id === sessionUser.userId;
  const sv = user.sessionVersion || 1;
  const statusValue = user.isSuspended ? 'suspended' : 'active';
  const social = user.socialLinks || {};
  const skills = (user.skills || []).join(', ');

  const initials = (user.fullName || user.username || '?')
    .split(' ').slice(0, 2).map(function(w) { return w[0]?.toUpperCase() || ''; }).join('');

  const avatar = user.avatar
    ? el('div', { class: 'pf-avatar' }, el('img', { src: user.avatar, alt: user.username }))
    : el('div', { class: 'pf-avatar pf-avatar--initials role-' + user.role }, initials);

  return PageWrapper({ className: 'acrx-dshb-wr acrx-profile-wr' },

    MainHeader({
      title: 'Edit User',
      subtitle: user.fullName || user.username,
      actions: [
        { icon: 'arrow-left', title: 'Back to User', class: 'btn ghost', dataClick: 'go-back' },
        { icon: 'eye', title: 'View Profile', class: 'btn ghost', dataClick: 'view-profile' }
      ]
    }),

    MainContent(
      el('div', { class: 'pf-bento' },

        el('div', { class: 'pf-bento-card pf-card-profile' },
          el('div', { class: 'pf-profile-row' },
            el('div', { class: 'pf-avatar-wrap' },
              avatar
            ),
            el('div', { class: 'pf-profile-info' },
              el('h2', { class: 'pf-name' }, user.fullName || user.username),
              el('div', { class: 'pf-profile-meta' },
                RoleBadge(user.role),
                el('span', { class: 'pf-status-pill ' + (statusValue === 'suspended' ? 'pf-status--offline' : 'pf-status--online') },
                  el('i', { class: 'pf-status-dot' }), statusValue === 'suspended' ? 'Suspended' : 'Active'
                ),
                el('span', { class: 'pf-sv-badge' }, 'Session v' + sv)
              ),
              el('p', { class: 'pf-email' }, user.email),
              user.fullName ? el('p', { class: 'pf-username' }, '@' + user.username) : null
            )
          )
        ),

        el('div', { class: 'pf-bento-card pf-card-account' },
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-user' }),
            el('span', {}, 'Account')
          ),
          el('form', { id: 'editUserForm', class: 'pf-form' },
            el('div', { class: 'pf-form-row' },
              Input({ id: 'username', name: 'username', placeholder: 'Username', value: user.username, required: true }),
              Input({ id: 'email', name: 'email', type: 'email', placeholder: 'Email', value: user.email, required: true })
            ),
            el('div', { class: 'pf-form-row' },
              Input({ id: 'fullName', name: 'fullName', placeholder: 'Full Name', value: user.fullName || '' }),
              el('div', { class: 'pf-form-group' },
                el('label', { for: 'role' }, 'Role'),
                CustomDropdown({
                  label: 'Role',
                  items: ROLE_OPTIONS.map(function(r) { return { label: r.label, value: r.value }; }),
                  name: 'role',
                  value: user.role
                })
              )
            ),
            el('div', { class: 'pf-form-row' },
              el('div', { class: 'pf-form-group' },
                el('label', { for: 'accountStatus' }, 'Account Status'),
                CustomDropdown({
                  label: 'Account Status',
                  items: STATUS_OPTIONS.map(function(s) { return { label: s.label, value: s.value }; }),
                  name: 'accountStatus',
                  value: statusValue
                })
              ),
              el('div', { class: 'pf-form-group', style: 'opacity:.5;pointer-events:none;' },
                el('label', {}, 'Password'),
                Input({ type: 'password', id: 'password', name: 'password', disabled: true, value: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', title: 'Password cannot be changed here. Use the password reset flow.' }),
                el('p', { class: 'pf-field-hint' }, 'Use the password reset flow to change password.')
              )
            ),
            el('div', { class: 'pf-form-group' },
              el('label', { for: 'isSuspended' }, 'Suspended'),
              Toggle({
                id: 'isSuspended',
                name: 'isSuspended',
                label: 'Suspended',
                checked: user.isSuspended,
                hint: 'Toggle to suspend/activate user'
              })
            )
          )
        ),

        el('div', { class: 'pf-bento-card pf-card-profile-info' },
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-id-card' }),
            el('span', {}, 'Profile')
          ),
          el('form', { id: 'editProfileForm' },
            el('div', { class: 'pf-form-row' },
              Input({ id: 'fullName2', name: 'fullName', placeholder: 'Full Name', value: user.fullName || '' }),
              Input({ id: 'jobTitle', name: 'jobTitle', placeholder: 'Job Title', value: user.jobTitle || '' })
            ),
            el('div', { class: 'pf-form-row' },
              Input({ id: 'phone', name: 'phone', type: 'tel', placeholder: 'Phone', value: user.phone || '' }),
              Input({ id: 'location', name: 'location', placeholder: 'Location', value: user.location || '' })
            ),
            el('div', { class: 'pf-form-row' },
              Input({ id: 'department', name: 'department', placeholder: 'Department', value: user.department || '' }),
              Input({ id: 'website', name: 'website', type: 'url', placeholder: 'https://...', value: user.website || '' })
            ),
            el('div', { class: 'pf-form-group' },
              el('label', { for: 'bio' }, 'Bio'),
              el('textarea', { id: 'bio', name: 'bio', rows: '3', placeholder: 'Short bio...' }, user.bio || '')
            )
          )
        ),

        el('div', { class: 'pf-bento-card pf-card-social' },
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-link' }),
            el('span', {}, 'Social Links')
          ),
          el('form', { id: 'editSocialForm' },
            el('div', { class: 'pf-form-row' },
              Input({ id: 'socialTwitter', name: 'socialTwitter', placeholder: '@username', value: (user.socialLinks && user.socialLinks.twitter) || '' }),
              Input({ id: 'socialLinkedin', name: 'socialLinkedin', type: 'url', placeholder: 'LinkedIn URL', value: (user.socialLinks && user.socialLinks.linkedin) || '' })
            ),
            el('div', { class: 'pf-form-row' },
              Input({ id: 'socialGithub', name: 'socialGithub', placeholder: 'GitHub username', value: (user.socialLinks && user.socialLinks.github) || '' }),
              Input({ id: 'socialWebsite', name: 'socialWebsite', type: 'url', placeholder: 'https://...', value: (user.socialLinks && user.socialLinks.website) || '' })
            )
          )
        ),

        el('div', { class: 'pf-bento-card pf-card-skills' },
          el('div', { class: 'pf-card-header' },
            el('i', { class: 'fa-solid fa-code' }),
            el('span', {}, 'Skills')
          ),
          el('form', { id: 'editSkillsForm' },
            Input({ id: 'skills', name: 'skills', placeholder: 'e.g. JavaScript, SEO, Design', value: (user.skills || []).join(', ') })
          )
        ),

        el('div', { class: 'pf-bento-card pf-card-actions' },
          el('div', { class: 'pf-form-actions' },
            el('button', { id: 'saveBtn', type: 'button', class: 'button-pst primary' }, 'Save Changes'),
            el('button', { id: 'cancelBtn', type: 'button', class: 'button-pst ghost', dataClick: 'go-back' }, 'Cancel')
          )
        )

      )
    )
  );
}

module.exports = { renderEditUser, meta: module.exports.meta };