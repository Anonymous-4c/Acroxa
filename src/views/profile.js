// src/views/profile.js — /acrx/profile — Client-side rendered profile preview
'use strict';

const {
  el,
  icon,
  PageWrapper,
  MainHeader,
  PostsMainContent
} = require('./lib/framework');



async function renderProfile(req, res) {
  // Just pass session state to client; all rendering happens client-side
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

  return PageWrapper({ className: 'acrx-dshb-wr acrx-profile-wr' },

    MainHeader({
      title: 'My Profile',
      actions: [
        { icon: 'pen-to-square', title: 'Edit Profile', class: 'btn primary', dataClick: 'edit-profile' },
        { icon: 'right-from-bracket', title: 'Logout', class: 'btn ghost', dataClick: 'logout' }
      ]
    }),

    PostsMainContent(
      el('div', { id: 'profile-root', class: 'profile-pg-st' }),

      el('script', { id: 'profile-state', type: 'application/json' },
        JSON.stringify({ sessionUser })
      ),

      el('script', { src: '/acrx/assets/js/profile.js' })
    )
  );
}

module.exports = { renderProfile };
module.exports.meta = [
  {
    path: '/acrx/profile',
    title: 'My Profile — Acroxa',
    render: 'renderProfile',
    css: [
      '/acrx/assets/css/ad-st.css',
      '/acrx/assets/css/ad-users.css',
      '/acrx/assets/css/profile.css'
    ],
    js: [
      '/acrx/assets/js/system/_shared.js',
      '/acrx/assets/js/profile.js'
    ],
    layout: 'full'
  }
];