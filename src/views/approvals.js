// src/views/approval.js
const {
  el,
  icon,
  PageWrapper,
  MainContent
} = require("./lib/framework");

// ==================== Approval Header ====================
function ApprovalHeader({ searchId = 'search-approval' }) {
  return el('div', { class: 'main-head approvals-header' },
    el('div', { class: 'd-flex align-center' },
      el('h1', {}, 'Approval Requests')
    ),
    el('div', { class: 'media-actions d-flex align-center gap-3' },
      // Search Input
      el('input', {
        type: 'text',
        id: searchId,
        placeholder: 'Search by filename or requester...',
        class: 'search-input'
      }),

      // Refresh Button
      el('button', {
        class: 'btn ghost refresh-btn',
        title: 'Refresh List'
      }, icon('refresh'))
    )
  );
}

// Status Badge
function StatusBadge(status) {
  let dataAttr = 'orange';
  let text = 'Pending';

  if (status === 'approved') {
    dataAttr = 'green';
    text = 'Approved';
  } else if (status === 'rejected') {
    dataAttr = 'red';
    text = 'Rejected';
  }

  return el('div', { 
    class: 'acrx-itn status status-post', 
    'data-': dataAttr 
  }, text);
}

// Single Approval Row (without checkbox column)
function ApprovalRow(approval) {
  const isPending = approval.status === "pending";
  const id = approval.id || approval._id;

  return el('div', { class: 'ttc-pi', 'data-id': id },

    // Type
    el('div', { class: 'acrx-itn name name-post' },
      el('strong', {}, approval.type.toUpperCase())
    ),

    // File Name
    el('div', { class: 'acrx-itn name name-post' },
      approval.fileName,
      el('button', { class: 'edit-title' }, icon('pen-to-square'))
    ),

    // Change (for rename)
    el('div', { class: 'acrx-itn taxonomies taxonomies-post' },
      approval.oldName 
        ? `${approval.oldName} → ${approval.newName}` 
        : '—'
    ),

    // Requested By + Date
    el('div', { class: 'acrx-itn date date-post' },
      approval.requestedBy?.username || approval.requestedBy || 'Unknown',
      el('br'),
      el('small', {}, approval.createdAt ? new Date(approval.createdAt).toLocaleDateString() : '')
    ),

    // Status
    StatusBadge(approval.status),

    // Actions
    el('div', { class: 'acrx-itn actions actions-post' },
      isPending ? 
        el('div', { class: 'd-flex gap-2' },
          el('button', {
            class: 'btn-act approve-btn',
            'data-id': id,
            title: 'Approve Request'
          }, icon('check')),
          el('button', {
            class: 'btn-act reject-btn',
            'data-id': id,
            title: 'Reject Request'
          }, icon('xmark'))
        ) :
        el('span', { class: 'text-muted' }, 'Processed')
    )
  );
}

// Main Approval Page
function renderApproval({ approvals = [], total = 0 }) {
  return PageWrapper({ className: 'acrx-dshb-wr approvals-page' },

    ApprovalHeader({ searchId: 'search-approval' }),

    MainContent(

      // Status Tabs
      el('div', { class: 'header-info-sec' },
        el('div', { class: 'links' },
          el('div', { class: 'pages active', 'data-filter': 'all' }, 'All'),
          el('sep'),
          el('div', { class: 'pages', 'data-filter': 'pending' }, 'Pending'),
          el('sep'),
          el('div', { class: 'pages', 'data-filter': 'approved' }, 'Approved'),
          el('sep'),
          el('div', { class: 'pages', 'data-filter': 'rejected' }, 'Rejected')
        )
      ),

      // Table Container
      el('div', { class: 'acrx-ttc-wrap' },
        el('div', { class: 'acrx-ttc' },

          // Table Header (without checkbox column)
          el('div', { class: 'ttc-ph' },
            el('div', { class: 'name' }, 'Type'),
            el('sep'),
            el('div', { class: 'name-info' }, 'File Name'),
            el('sep'),
            el('div', { class: 'taxonomies' }, 'Change'),
            el('sep'),
            el('div', { class: 'date' }, 'Requested By'),
            el('sep'),
            el('div', { class: 'status' }, 'Status'),
            el('sep'),
            el('div', { class: 'actions' }, 'Actions')
          ),

          // Table Body
          el('div', { class: 'ttc-pis', id: 'approvals-tbody' },
            approvals.length > 0 
              ? approvals.map(ApprovalRow)
              : el('div', { class: 'text-center py-5 text-muted' },
                  icon('inbox', 'duotone'),
                  el('p', { class: 'mt-3' }, 'No pending approval requests at the moment.')
                )
          )
        )
      ),

      el('div', { class: 'd-flex justify-between align-center mt-4 text-muted' },
        el('div', {}, `Showing ${approvals.length} requests`)
      )
    )
  );
}

module.exports = {
  renderApproval,
  ApprovalRow,
  StatusBadge,
  ApprovalHeader
};

module.exports.meta = [
  {
    "path": "/acrx/approvals",
    "render": "renderApproval",
    "title": "Approval Requests - Acroxa",
    "css": [
      "/acrx/assets/css/ad-media.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    "js": [
      "/acrx/assets/js/approvals.js"
    ],
    "layout": "full",
    "header": null,
    "sidebar": null,
    "footer": null
  }
];
