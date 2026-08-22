// ../src/views/profile.js

const {
  MainHeader,
  PostsMainContent,
  PageWrapper,
  el,
  icon
} = require('./lib/framework');

function renderProfile(user = {}, data = {}) {
  // Extract all useful data
  const postStats = data.stats?.posts || {};
  const recentPosts = data.recentPosts || [];
  const recentPages = data.recentPages || [];

  const formattedDate = user.createdAt 
    ? new Date(user.createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }) 
    : '—';

  // Simplified Post Rows (no checkbox, no pen icon in title)
  const postRows = recentPosts.map(post => {
    const statusClass = (post.status || 'draft').toLowerCase();
    const statusText = (post.status || 'Draft').charAt(0).toUpperCase() + (post.status || 'Draft').slice(1);

    return el('div', { class: 'ttc-pis' },
      el('div', { class: 'ttc-pi' },

        // Title (clean)
        el('div', { class: 'acrx-itn name name-post' },
          post.title || 'Untitled'
        ),

        // Status
        el('div', { 
          class: `acrx-itn status status-post`,
          'data-status': statusClass 
        }, statusText),

        // Date
        el('div', { class: 'acrx-itn date date-post' },
          post.date ? new Date(post.date).toLocaleDateString('en-US') : '—'
        ),

        // Actions
        el('div', { class: 'acrx-itn actions actions-post' },
          el('button', { 
            class: 'btn-act', 
            'data-action': 'view',
            'data-id': post.id,
            title: 'View Post'
          }, icon('eye', 'solid')),

          el('button', { 
            class: 'btn-act', 
            'data-action': 'edit',
            'data-id': post.id,
            title: 'Edit Post'
          }, icon('pen', 'solid')),

          el('button', { 
            class: 'btn-act', 
            'data-action': 'delete',
            'data-id': post.id,
            title: 'Delete Post'
          }, icon('trash', 'solid'))
        )
      )
    );
  });

  return PageWrapper({ className: 'profile-pg-st' },

    MainHeader({
      title: 'My Profile',
      actions: [
        {
          class: 'btn ghost',
          icon: 'pen-to-square',
          title: 'Edit Profile'
        }
      ]
    }),

    PostsMainContent(

      // Profile Info Card
      el('div', { class: 'profile-info-card card slide-up' },
        el('div', { class: 'profile-header' },
          el('div', { class: 'profile-avatar' },
            el('img', { 
              src: user.avatar || '/acrx/assets/default-avatar.png', 
              alt: user.fullName || user.username 
            })
          ),
          el('div', { class: 'profile-meta' },
            el('h2', {}, user.fullName || user.username),
            el('p', { class: 'username' }, `@${user.username}`),
            el('p', { class: 'role-badge' }, 
              el('span', { class: `role ${user.role || 'author'}` }, user.role || 'Author')
            )
          )
        ),

        el('div', { class: 'profile-details' },
          el('div', { class: 'info-grid' },
            el('div', { class: 'info-item' },
              el('span', { class: 'label' }, 'Member Since'),
              el('span', { class: 'value' }, formattedDate)
            ),
            el('div', { class: 'info-item' },
              el('span', { class: 'label' }, 'Email'),
              el('span', { class: 'value' }, user.email || '—')
            ),
            el('div', { class: 'info-item' },
              el('span', { class: 'label' }, 'Location'),
              el('span', { class: 'value' }, user.location || '—')
            ),
            el('div', { class: 'info-item' },
              el('span', { class: 'label' }, 'Job Title'),
              el('span', { class: 'value' }, user.jobTitle || '—')
            )
          )
        ),

        user.bio && el('div', { class: 'profile-bio' },
          el('h3', {}, 'Bio'),
          el('p', {}, user.bio)
        )
      ),

      // Statistics Cards - Now using real data
      el('div', { class: 'overview-metrics grid slide-up' },
        el('div', { class: 'metric-card' },
          el('div', { class: 'metric-icon' }, icon('file-lines')),
          el('div', { class: 'card-content' },
            el('h3', {}, 'Total Posts'),
            el('p', { class: 'metric-value' }, postStats.total || 0)
          )
        ),
        el('div', { class: 'metric-card' },
          el('div', { class: 'metric-icon' }, icon('check-circle')),
          el('div', { class: 'card-content' },
            el('h3', {}, 'Published'),
            el('p', { class: 'metric-value' }, postStats.published || 0)
          )
        ),
        el('div', { class: 'metric-card' },
          el('div', { class: 'metric-icon' }, icon('edit')),
          el('div', { class: 'card-content' },
            el('h3', {}, 'Drafts'),
            el('p', { class: 'metric-value' }, postStats.draft || 0)
          )
        ),
        el('div', { class: 'metric-card' },
          el('div', { class: 'metric-icon' }, icon('trash')),
          el('div', { class: 'card-content' },
            el('h3', {}, 'Trashed'),
            el('p', { class: 'metric-value' }, postStats.trashed || 0)
          )
        )
      ),

      // Recent Posts Section
      el('div', { class: 'recent-posts-section card slide-up' },
        el('div', { class: 'section-header' },
          el('h2', {}, icon('clock-rotate-left'), ' Recent Posts')
        ),

        el('div', { class: 'posts-ttc-wrap acrx-ttc-wrap' },
          el('div', { class: 'posts-ttc acrx-ttc' },
            // Simplified Header
            el('div', { class: 'ttc-ph' },
              el('div', { class: 'name' }, 'Title'),
              el('sep'),
              el('div', { class: 'status' }, 'Status'),
              el('sep'),
              el('div', { class: 'dated' }, 'Date'),
              el('sep'),
              el('div', { class: 'actions' }, 'Actions')
            ),

            // Table Body
            el('div', { class: 'ttc-pis ttc-pis-wrap' },
              postRows.length > 0 
                ? postRows.join('') 
                : el('div', { class: 'empty-state' }, 
                    el('p', {}, 'No recent posts yet.')
                  )
            )
          )
        )
      ),

      // Recent Pages Section (New!)
      recentPages.length > 0 && el('div', { class: 'recent-pages-section card slide-up' },
        el('div', { class: 'section-header' },
          el('h2', {}, icon('file', 'solid'), ' Recent Pages')
        ),
        el('div', { class: 'posts-ttc-wrap acrx-ttc-wrap' },
          el('div', { class: 'posts-ttc acrx-ttc' },
            el('div', { class: 'ttc-ph' },
              el('div', { class: 'name' }, 'Title'),
              el('sep'),
              el('div', { class: 'status' }, 'Status'),
              el('sep'),
              el('div', { class: 'dated' }, 'Date'),
              el('sep'),
              el('div', { class: 'actions' }, 'Actions')
            ),
            el('div', { class: 'ttc-pis ttc-pis-wrap' },
              recentPages.map(page => el('div', { class: 'ttc-pis' },
                el('div', { class: 'ttc-pi' },
                  el('div', { class: 'acrx-itn name name-post' }, page.title || 'Untitled'),
                  el('div', { 
                    class: `acrx-itn status status-post`,
                    'data-status': (page.status || 'draft').toLowerCase() 
                  }, (page.status || 'Draft').charAt(0).toUpperCase() + (page.status || 'Draft').slice(1)),
                  el('div', { class: 'acrx-itn date date-post' }, 
                    page.date ? new Date(page.date).toLocaleDateString('en-US') : '—'
                  ),
                  el('div', { class: 'acrx-itn actions actions-post' },
                    el('button', { class: 'btn-act', 'data-action': 'view-page', 'data-id': page.id }, icon('eye', 'solid')),
                    el('button', { class: 'btn-act', 'data-action': 'edit-page', 'data-id': page.id }, icon('pen', 'solid')),
                    el('button', { class: 'btn-act', 'data-action': 'delete-page', 'data-id': page.id }, icon('trash', 'solid'))
                  )
                )
              )).join('')
            )
          )
        )
      ),

      // Profile Actions
      el('div', { class: 'profile-actions d-flex flex-row gap-3 mt-4' },
        el('button', {
          class: 'p-2 button-pst',
          'data-action': 'change-password'
        },
          icon('key', 'solid'),
          el('span', {}, 'Change Password')
        ),

        user.role !== 'admin' && el('button', {
          class: 'p-2 button-pst btn-danger',
          'data-action': 'delete-account'
        },
          icon('user-slash', 'solid'),
          el('span', {}, 'Delete Account')
        )
      )
    )
  );
}

module.exports = { renderProfile };