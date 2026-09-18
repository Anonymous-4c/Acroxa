// ../src/views/posts.js

const {
  MainHeader,
  PostsPerPageDropdown,
  CategoryFilter,
  // StatusFilter,     // commented in original → you can add later
  PaginationControls,
  StatusTabs,
  PostsTableSkeleton,
  PostsMainContent,
  el
} = require('./lib/framework');   // adjust path

function renderPosts() {
  return el('div', { class: 'posts-pg-st' },

    // Header (outside main content)
    MainHeader({
      title: 'Posts',
      actions: [
        {
          class: 'btn accent',                    // ← this is the key change
          icon: 'circle-plus',                            // or 'plus', 'circle-plus' whatever matches your icon set
          text: 'Create New',                     // text inside button
          href: '/admin/posts/new-post',          // goes into data-=""
          title: 'Create new post'
        }
      ],
      // optional: extraClasses: 'posts-header'   if you want different styling sometimes
    }),

    // Everything else wrapped in main content div
    PostsMainContent(

el('div', { class: 'sec-wrap' },

        el('div', { class: 'header-info' },

          PostsPerPageDropdown({ current: 10 }),

          el('div', { class: 'filters d-flex' },
            CategoryFilter(),
          ),

          PaginationControls()
        ),

        el('div', { class: 'header-info-sec' },
          StatusTabs({ active: 'all' })
        )
      ),

      PostsTableSkeleton()
    )
  );
}

module.exports = { renderPosts };
module.exports.meta = [
  {
    path: "/acrx/posts",
    render: "renderPosts",
    title: "Posts - Acroxa",
    css: [
      "/acrx/assets/css/ad-ps.css",
      "/acrx/assets/css/ad-st.css"
    ],
    js: [
      "/acrx/assets/js/posts.js"
    ],
    layout: "full"
  },
];


2


3


