/* ../src/views/setupFirstUser.js */
'use strict';

const {
  el, icon,
  div, span, p, h1, h2, h3, strong,
  footer,
  Input, CustomDropdown,
} = require('./lib/framework');

function SetupFirstUserPage() {
  return '<!DOCTYPE html>' + el('html', { lang: 'en' },
    el('head', {},
      el('meta', { charset: 'UTF-8' }),
      el('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
      el('title', {}, 'Acroxa CMS — Setup Wizard'),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/root.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/ad-c.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/ad-ds.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/ad-regf.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/all.css' }),
      el('link', { rel: 'stylesheet', href: '/acrx/assets/css/setup.css' }),
      el('link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }),
      el('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }),
      el('link', { href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap', rel: 'stylesheet' }),
      el('link', { id: 'favicon', rel: 'icon', type: 'image/svg+xml', href: '/acrx/assets/images/icon.svg' })
    ),
    el('body', {},
      el('div', { id: 'toastContainer', class: 'toast-container' }),
      _buildPage(),
      el('script', { src: '/acrx/assets/js/utils.js' }),
      el('script', { src: '/acrx/assets/js/setup.js' })
    )
  );
}

function _buildPage() {
  return div({ class: 'setup-wrap' },
    _branding(),
    _stepNav(),
    _card()
  );
}

function _branding() {
  return div({ class: 'setup-brand' },
    el('img', { src: '/acrx/assets/images/icon.svg', alt: 'Acroxa', class: 'ic' }),
    h1({}, 'Acroxa Setup')
  );
}

function _stepNav() {
  return div({ class: 'setup-nav', id: 'setupNav' },
    _navStep(1, 'Admin', true),
    _navStep(2, 'Profile'),
    _navStep(3, 'Website'),
    _navStep(4, 'Database'),
    _navStep(5, 'Review')
  );
}

function _navStep(num, label, active) {
  const cls = active ? ' active' : '';
  return div({ class: 'setup-nav-step' + cls, 'data-step': num },
    span({}, label)
  );
}

function _card() {
  return div({ class: 'setup-card' },
    _stepAdmin(),
    _stepProfile(),
    _stepWebsite(),
    _stepDatabase(),
    _stepReview(),
    _actions()
  );
}

/* ═══ Step 1: Admin Account ═══ */
function _stepAdmin() {
  return div({ class: 'setup-step active', 'data-step': '1' },
    h3({}, 'Create Admin Account'),
    p({}, 'This account will have full control over your CMS.'),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Username *'),
      el('input', { class: 'setup-input', id: 'username', type: 'text', placeholder: 'Choose a unique username', required: 'true' })
    ),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Email Address *'),
      el('input', { class: 'setup-input', id: 'email', type: 'email', placeholder: 'your.email@example.com', required: 'true' })
    ),
    div({ class: 'field-row' },
      div({ class: 'field' },
        el('label', { class: 'field-label' }, 'Password *'),
        el('input', { class: 'setup-input', id: 'password', type: 'password', placeholder: 'Strong password', required: 'true' }),
        div({ class: 'strength-bar' }, div({ class: 'strength-fill', id: 'pwFill' })),
        span({ class: 'strength-text', id: 'pwText' }, 'Enter a password'),
        div({ class: 'strength-reqs', id: 'pwReqs' },
          _req('length', 'At least 8 characters'),
          _req('upper', 'One uppercase letter'),
          _req('lower', 'One lowercase letter'),
          _req('number', 'One number'),
          _req('special', 'One special character')
        )
      ),
      div({ class: 'field' },
        el('label', { class: 'field-label' }, 'Confirm Password *'),
        el('input', { class: 'setup-input', id: 'confirmPassword', type: 'password', placeholder: 'Retype password', required: 'true' })
      )
    ),
    el('div', { class: 'callout callout-info' },
      el('i', { class: 'fa-solid fa-circle-info' }),
      span({}, 'Use at least 8 characters with a mix of uppercase, lowercase, numbers, and special characters.')
    )
  );
}

function _req(name, text) {
  return div({ class: 'req', 'data-check': name },
    el('i', { class: 'fa-solid fa-circle' }),
    span({}, text)
  );
}

/* ═══ Step 2: Profile ═══ */
function _stepProfile() {
  return div({ class: 'setup-step', 'data-step': '2' },
    h3({}, 'Administrator Profile'),
    p({}, 'Tell us about yourself.'),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Full Name *'),
      el('input', { class: 'setup-input', id: 'fullName', type: 'text', placeholder: 'John Doe', required: 'true' })
    ),
    div({ class: 'field-row' },
      div({ class: 'field' },
        el('label', { class: 'field-label' }, 'Professional Title'),
        el('input', { class: 'setup-input', id: 'jobTitle', type: 'text', placeholder: 'Content Creator' }),
        span({ class: 'field-hint' }, 'e.g., Developer, Blogger, Designer')
      ),
      div({ class: 'field' },
        el('label', { class: 'field-label' }, 'Phone Number'),
        el('input', { class: 'setup-input', id: 'phone', type: 'tel', placeholder: '+1 (555) 123-4567' })
      )
    ),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Location'),
      el('input', { class: 'setup-input', id: 'location', type: 'text', placeholder: 'City, Country' })
    ),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Bio / About You'),
      el('textarea', { class: 'setup-input', id: 'bio', rows: '3', placeholder: 'Write a short description about yourself...' })
    )
  );
}

/* ═══ Step 3: Website ═══ */
function _stepWebsite() {
  return div({ class: 'setup-step', 'data-step': '3' },
    h3({}, 'Website Configuration'),
    p({}, 'Configure your website branding and identity.'),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Site Name *'),
      el('input', { class: 'setup-input', id: 'siteName', type: 'text', placeholder: 'My Awesome Website', required: 'true' })
    ),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Site Tagline'),
      el('input', { class: 'setup-input', id: 'siteTagline', type: 'text', placeholder: 'Your catchy tagline or slogan' })
    ),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Site Description *'),
      el('textarea', { class: 'setup-input', id: 'siteDescription', rows: '3', placeholder: 'Describe what your website is about...', required: 'true' })
    ),
    div({ class: 'field-row' },
      div({ class: 'field' },
        el('label', { class: 'field-label' }, 'Website Type *'),
        CustomDropdown({ id: 'siteType', name: 'siteType', value: 'blog', items: [
          { label: 'Personal Blog', value: 'blog' },
          { label: 'Business Website', value: 'business' },
          { label: 'Portfolio', value: 'portfolio' },
          { label: 'Magazine / News', value: 'magazine' },
          { label: 'E-commerce', value: 'ecommerce' },
          { label: 'Educational', value: 'education' },
          { label: 'Non-Profit', value: 'nonprofit' },
          { label: 'Other', value: 'other' },
        ]})
      ),
      div({ class: 'field' },
        el('label', { class: 'field-label' }, 'Primary Language *'),
        CustomDropdown({ id: 'siteLanguage', name: 'siteLanguage', value: 'en', items: [
          { label: 'English', value: 'en' },
          { label: 'Spanish', value: 'es' },
          { label: 'French', value: 'fr' },
          { label: 'German', value: 'de' },
          { label: 'Italian', value: 'it' },
          { label: 'Portuguese', value: 'pt' },
          { label: 'Chinese', value: 'zh' },
          { label: 'Japanese', value: 'ja' },
          { label: 'Arabic', value: 'ar' },
        ]})
      )
    ),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Contact Email'),
      el('input', { class: 'setup-input', id: 'contactEmail', type: 'email', placeholder: 'contact@yoursite.com' })
    )
  );
}

/* ═══ Step 4: Database ═══ */
function _stepDatabase() {
  return div({ class: 'setup-step', 'data-step': '4' },
    h3({}, 'Database Configuration'),
    p({}, 'Configure your database connection.'),
    el('div', { class: 'callout callout-warning' },
      el('i', { class: 'fa-solid fa-triangle-exclamation' }),
      span({}, 'Make sure your database is properly set up before proceeding.')
    ),
    div({ class: 'field' },
      el('label', { class: 'field-label' }, 'Database Type *'),
      div({ class: 'radio-group', id: 'dbTypeGroup' },
        _dbRadio('mongodb', 'fa-envira', 'fa-brands', 'MongoDB', 'NoSQL, flexible schema, great for scalability'),
        _dbRadio('mysql', 'database', 'fa-solid', 'MySQL', 'Popular relational database, widely supported'),
        _dbRadio('postgresql', 'database', 'fa-solid', 'PostgreSQL', 'Advanced relational database'),
        _dbRadio('sqlite', 'file-code', 'fa-solid', 'SQLite', 'File-based, perfect for small to medium sites')
      )
    ),
    div({ id: 'dbFieldsContainer' },
      div({ class: 'field-row' },
        div({ class: 'field' },
          el('label', { class: 'field-label' }, 'Host'),
          el('input', { class: 'setup-input', id: 'dbHost', type: 'text', placeholder: '127.0.0.1', value: '127.0.0.1' })
        ),
        div({ class: 'field' },
          el('label', { class: 'field-label' }, 'Port'),
          el('input', { class: 'setup-input', id: 'dbPort', type: 'text', placeholder: '27017 / 3306 / 5432' })
        )
      ),
      div({ class: 'field' },
        el('label', { class: 'field-label' }, 'Database Name'),
        el('input', { class: 'setup-input', id: 'dbName', type: 'text', placeholder: 'acroxa_cms', value: 'acroxa_cms' })
      ),
      div({ class: 'field-row' },
        div({ class: 'field' },
          el('label', { class: 'field-label' }, 'Username'),
          el('input', { class: 'setup-input', id: 'dbUser', type: 'text', placeholder: 'Database username' })
        ),
        div({ class: 'field' },
          el('label', { class: 'field-label' }, 'Password'),
          el('input', { class: 'setup-input', id: 'dbPass', type: 'password', placeholder: 'Database password' })
        )
      )
    )
  );
}

function _dbRadio(value, iconName, iconStyle, label, desc) {
  return div({ class: 'radio-card', 'data-value': value },
    div({ class: 'radio-dot' }),
    div({ class: 'radio-info' },
      strong({}, el('i', { class: `${iconStyle} fa-${iconName}` }), ' ', label),
      span({}, desc)
    )
  );
}

/* ═══ Step 5: Review ═══ */
function _stepReview() {
  return div({ class: 'setup-step', 'data-step': '5' },
    h3({}, 'Review & Complete'),
    p({}, 'Review all settings before finishing.'),
    el('div', { class: 'callout callout-success' },
      el('i', { class: 'fa-solid fa-circle-check' }),
      span({}, 'Click "Complete Setup" to initialize your CMS.')
    ),
    div({ class: 'review-grid', id: 'reviewContent' })
  );
}

/* ═══ Actions ═══ */
function _actions() {
  return div({ class: 'setup-actions' },
    el('button', { class: 'setup-btn', id: 'prevBtn', style: 'display:none;' },
      icon('arrow-left', 'solid'), ' Previous'
    ),
    div({}),
    el('button', { class: 'setup-btn setup-btn-primary', id: 'nextBtn' },
      'Next ', icon('arrow-right', 'solid')
    ),
    el('button', { class: 'setup-btn setup-btn-success', id: 'completeBtn', style: 'display:none;' },
      icon('circle-check', 'solid'), ' Complete Setup'
    )
  );
}

module.exports = { SetupFirstUserPage };
