// src/views/system/systemViews.js
'use strict';

const {
  el, icon,
  PageWrapper, MainHeader, MainContent,
  Input, CustomDropdown,
  IconDropdown,
  // Settings form primitives (now shared)
  Icon, Field, Section, FieldGrid, Toggle, NumberInput,
  Dropdown, SaveBar, Badge, Textarea, ColorPicker,
  DangerZone, Callout,
} = require('./lib/framework');

// ─── /acrx/system  — Navigation landing ──────────────────────────────────────

function SystemNavPage() {
  const sections = [
  {
    group: 'Site Configuration',
    items: [
      { icon: 'gear',                   label: 'General',      desc: 'Site identity, URL, branding',             href: '/acrx/system/general' },
      { icon: 'earth-asia',             label: 'Localization', desc: 'Language, timezone, date & currency',      href: '/acrx/system/localization' },
      { icon: 'file-lines',             label: 'Content',      desc: 'Post defaults, media storage, versioning', href: '/acrx/system/content' },
      // ── NEW ──
              {
          icon: 'route',
          label: 'Routing',
          desc: 'Homepage, blog archive, permalinks & URL structure',
          href: '/acrx/system/routing'
        },

      { icon: 'magnifying-glass-chart', label: 'SEO',          desc: 'Meta tags, sitemaps, Open Graph, schema',  href: '/acrx/system/seo' },
    ]
  },
  {
    group: 'Integrations',
    items: [
      { icon: 'robot',            label: 'AI Settings', desc: 'Provider keys, models, content features', href: '/acrx/system/ai' },
      { icon: 'plug-circle-bolt', label: 'API',         desc: 'API keys, rate limits, webhooks',         href: '/acrx/system/api' },
      { icon: 'puzzle-piece',     label: 'Plugins',     desc: 'Installed plugins, auto-updates, config', href: '/acrx/system/plugins' },
      { icon: 'chart-bar',        label: 'Analytics',   desc: 'Tracking IDs, cookie consent, events',   href: '/acrx/system/analytics' },
    ]
  },
  {
    group: 'Security & Operations',
    items: [
      { icon: 'shield-halved', label: 'Security',    desc: 'Login limits, 2FA, CORS, password policy', href: '/acrx/system/security' },
      { icon: 'floppy-disk',   label: 'Backups',     desc: 'Local, Git & cloud backup schedules',      href: '/acrx/system/backups' },
      { icon: 'scroll',        label: 'Logs',        desc: 'System event logs, error tracking',        href: '/acrx/system/logs' },
      { icon: 'wrench',        label: 'Maintenance', desc: 'Maintenance mode, caching, task runner',   href: '/acrx/system/maintenance' },
      { icon: 'sliders',       label: 'Advanced',    desc: 'Debug, CDN, environment, cache TTL',       href: '/acrx/system/advanced' },
    ]
  }
  ];

  return PageWrapper({ className: 'acrx-dshb-wr system-nav-page settings-nav' },
  MainHeader({ title: 'System Settings' }),
  MainContent(
    el('div', { class: 'system-nav-intro mb-4' },
      Callout({ type: 'info', message: 'Changes here affect the entire CMS. Review each section carefully before saving.' })
    ),
    ...sections.map(group =>
      el('div', { class: 'nav-group settings-group' },
        el('h2', { class: 'nav-group-title section-title' }, group.group),
        el('div', { class: 'nav-cards-grid card-grid' },
          ...group.items.map(item =>
            el('a', { href: item.href, class: 'nav-card settings-card' },
              el('div', { class: 'nav-card-icon icon' }, icon(item.icon)),
              el('div', { class: 'nav-card-body' },
                el('h3', { class: 'nav-card-title' }, item.label),
                el('p', { class: 'nav-card-desc text-muted' }, item.desc)
              ),
              el('div', { class: 'nav-card-arrow icon' }, icon('angle-right', 'solid', ""))
            )
          )
        )
      )
    )
  )
  );
}


// ─── /acrx/system/general ────────────────────────────────────────────────────

function GeneralSettingsPage(data = {}) {
  const g = data.general || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'General Settings', actions: [{ icon: 'floppy-disk', class: 'btn ghost', dataClick: '#general-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'general-settings-form', class: 'settings-form form-container' },

        Section({ title: 'Site Identity', description: 'Your CMS\'s public-facing name and description.', icon: ['duotone','id-card'] },
          FieldGrid(
            Field({ label: 'Site Name', forId: 'siteName' },
              Input({ id: 'siteName', placeholder: 'Acroxa CMS', attrs: { value: g.siteName || '' } })
            ),
            Field({ label: 'Tagline', forId: 'siteTagline' },
              Input({ id: 'siteTagline', placeholder: 'Just another CMS…', attrs: { value: g.siteTagline || '' } })
            )
          ),
          Field({ label: 'Description', forId: 'siteDescription' },
            Textarea({ id: 'siteDescription', value: g.siteDescription || '', placeholder: 'A short description of your site…' })
          )
        ),

        Section({ title: 'URLs & Contact', description: 'Primary site URL and admin contact.', icon: ['duotone','link'] },
          FieldGrid(
            Field({ label: 'Site URL', forId: 'siteURL' },
              Input({ id: 'siteURL', placeholder: 'https://example.com', attrs: { value: g.siteURL || '' } })
            ),
            Field({ label: 'Admin Email', forId: 'adminEmail' },
              Input({ type: 'email', id: 'adminEmail', placeholder: 'admin@example.com', attrs: { value: g.adminEmail || '' } })
            )
          )
        ),

        Section({ title: 'Branding', description: 'Logo and favicon assets.', icon: ['duotone','paintbrush'] },
          FieldGrid(
            Field({ label: 'Site Logo', hint: 'SVG or PNG recommended' },
              el('div', { class: 'file-upload-wrap form-upload-group' },
                el('button', { id: 'logo-upload-btn', class: 'btn-upload btn btn-secondary' },
                  Icon('image'), el('span', {}, 'Choose Logo')
                ),
                el('input', { type: 'file', id: 'siteLogo', name: 'siteLogo', accept: 'image/*', hidden: true }),
                g.siteLogo ? el('img', { src: g.siteLogo, class: 'preview-thumb upload-preview', alt: 'Logo' }) : null
              )
            ),
            Field({ label: 'Favicon', hint: 'ICO, PNG 32×32 or SVG' },
              el('div', { class: 'file-upload-wrap form-upload-group' },
                el('button', { id: 'favicon-upload-btn', class: 'btn-upload btn btn-secondary' },
                  Icon('star'), el('span', {}, 'Choose Favicon')
                ),
                el('input', { type: 'file', id: 'siteFavicon', name: 'siteFavicon', accept: 'image/*', hidden: true }),
                g.siteFavicon ? el('img', { src: g.siteFavicon, class: 'preview-thumb upload-preview', alt: 'Favicon' }) : null
              )
            )
          )
        ),

        SaveBar({ id: 'general-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/localization ────────────────────────────────────────────────

function LocalizationPage(data = {}) {
  const l = data.localization || {};

  const languages = [
    { value: 'en', label: 'English' }, { value: 'ur', label: 'Urdu' },
    { value: 'ar', label: 'Arabic' },  { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },  { value: 'es', label: 'Spanish' },
    { value: 'zh', label: 'Chinese' },
  ];

  const currencies = [
    { value: 'USD', label: 'USD — US Dollar' }, { value: 'EUR', label: 'EUR — Euro' },
    { value: 'GBP', label: 'GBP — British Pound' }, { value: 'PKR', label: 'PKR — Pakistani Rupee' },
    { value: 'AED', label: 'AED — UAE Dirham' }, { value: 'SAR', label: 'SAR — Saudi Riyal' },
  ];

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Localization', actions: [{ icon: 'floppy-disk', class: 'btn ghost', dataClick: '#localization-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'localization-form', class: 'settings-form form-container' },

        Section({ title: 'Language & Region', icon: ['duotone','earth-asia'], description: 'Primary language and geographic settings.' },
          FieldGrid(
            Field({ label: 'Language', forId: 'language' },
              Dropdown({ id: 'language', options: languages, value: l.language || 'en' })
            ),
            Field({ label: 'Timezone', forId: 'timezone', hint: 'e.g. Asia/Karachi, UTC, America/New_York' },
              Input({ id: 'timezone', placeholder: 'UTC', attrs: { value: l.timezone || '' } })
            )
          )
        ),

        Section({ title: 'Date & Time', icon: ['duotone','calendar-days'], description: 'How dates and times are displayed across the CMS.' },
          FieldGrid(
            Field({ label: 'Date Format', forId: 'dateFormat', hint: 'DD/MM/YYYY · MM-DD-YYYY ' },
              Input({ id: 'dateFormat', placeholder: 'DD/MM/YYYY', attrs: { value: l.dateFormat || 'DD/MM/YYYY' } })
            ),
            Field({ label: 'Time Format' },
              Dropdown({
                id: 'timeFormat',
                options: [{ value: '24h', label: '24-hour (14:30)' }, { value: '12h', label: '12-hour (2:30 PM)' }],
                value: l.timeFormat || '24h'
              })
            )
          )
        ),

        Section({ title: 'Currency', icon: ['duotone','coins'], description: 'Default currency for pricing and display.' },
          Field({ label: 'Currency', forId: 'currency' },
            Dropdown({ id: 'currency', options: currencies, value: l.currency || 'USD' })
          )
        ),

        SaveBar({ id: 'localization-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/content ────────────────────────────────────────────────────

function ContentSettingsPage(data = {}) {
  const c = data.content || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Content Settings', actions: [{ icon: 'floppy-disk', class: 'btn ghost', dataClick: '#content-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'content-form', class: 'settings-form form-container' },

        Section({ title: 'Post Defaults', icon: ['duotone','file-pen'], description: 'Default behaviour for newly created posts.' },
          FieldGrid(
            Field({ label: 'Default Post Status' },
              Dropdown({
                id: 'defaultPostStatus',
                options: [
                  { value: 'draft', label: 'Draft' },
                  { value: 'published', label: 'Published' },
                  { value: 'private', label: 'Private' },
                ],
                value: c.defaultPostStatus || 'draft'
              })
            ),
            Field({ label: 'Posts Per Page', forId: 'postsPerPage' },
              NumberInput({ id: 'postsPerPage', value: c.postsPerPage || 10, min: 1, max: 500 })
            )
          ),
          Toggle({ id: 'allowComments', label: 'Allow comments on new posts', checked: c.allowComments !== false })
        ),

        Section({ title: 'Media Storage', icon: ['duotone','hard-drive'], description: 'Where and how uploaded files are stored.' },
          FieldGrid(
            Field({ label: 'Storage Driver' },
              Dropdown({
                id: 'storageDriver',
                options: [
                  { value: 'local', label: 'Local Disk' }, { value: 's3', label: 'Amazon S3' },
                  { value: 'cloudinary', label: 'Cloudinary' }, { value: 'custom', label: 'Custom' },
                ],
                value: c.storageDriver || 'local'
              })
            ),
            Field({ label: 'Upload Strategy' },
              Dropdown({
                id: 'uploadStrategy',
                options: [
                  { value: 'auto', label: 'Auto' }, { value: 'stream', label: 'Stream' }, { value: 'chunk', label: 'Chunked' },
                ],
                value: c.uploadStrategy || 'auto'
              })
            )
          ),
          Field({ label: 'Media File Naming' },
            Dropdown({
              id: 'mediaNaming',
              options: [
                { value: 'uuid', label: 'UUID (random)' }, { value: 'original', label: 'Original filename' }, { value: 'slug', label: 'Slugified name' },
              ],
              value: c.mediaNaming || 'uuid'
            })
          ),
          Toggle({ id: 'autoOrganizeMedia', label: 'Auto-organise media into folders by date/type', checked: c.autoOrganizeMedia !== false })
        ),

        Section({ title: 'Image Optimisation', icon: ['duotone','image'], description: 'Compress and convert images on upload.' },
          Toggle({ id: 'imageOptEnabled', label: 'Enable image optimisation', checked: c.imageOptimization?.enabled !== false }),
          Field({ label: 'Quality', forId: 'imageOptQuality', hint: '1–100, default 80' },
            NumberInput({ id: 'imageOptQuality', value: c.imageOptimization?.quality || 80, min: 1, max: 100 })
          ),
          Toggle({ id: 'imageOptWebp', label: 'Convert uploads to WebP', checked: (c.imageOptimization?.formats || []).includes('webp') })
        ),

        Section({ title: 'Versioning & Autosave', icon: ['duotone','clock-rotate-left'] },
          Toggle({ id: 'versioningEnabled', label: 'Enable post revisions', checked: c.versioning?.enabled !== false }),
          Field({ label: 'Max Revisions', forId: 'maxRevisions', hint: 'Older revisions pruned automatically' },
            NumberInput({ id: 'maxRevisions', value: c.versioning?.maxRevisions || 10, min: 1, max: 100 })
          ),
          Toggle({ id: 'autosaveEnabled', label: 'Enable autosave', checked: c.autosave?.enabled !== false }),
          Field({ label: 'Autosave Interval', forId: 'autosaveInterval' },
            NumberInput({ id: 'autosaveInterval', value: c.autosave?.interval || 30, min: 5, suffix: 'seconds' })
          )
        ),

        SaveBar({ id: 'content-save-btn' })
      )
    )
  );
}
function RoutingSettingsPage(data = {}) {

  const s = data.routing || {};
  const homepage = s.homepage || {};
  const blogPage = s.blogPage || {};
  const routing = s.routing || {};

  return PageWrapper(
    { className: 'acrx-dshb-wr settings-page' },

    MainHeader({
      title: 'Routing & Homepage',
      actions: [
        {
          icon: 'floppy-disk',
          class: 'btn ghost',
          dataClick: '#routing-save-btn',
          title: 'Save'
        }
      ]
    }),

    MainContent(

      el('div', {
        id: 'routing-form',
        class: 'settings-form form-container'
      },

        // ── HOMEPAGE ─────────────────────────────────────
        Section({
          title: 'Homepage',
          icon: ['duotone', 'house'],
          description: 'Control what renders on the root route (/).'
        },

          FieldGrid(

            Field({ label: 'Homepage Mode' },

              Dropdown({
                id: 'homepageMode',
                options: [
                  { value: 'posts', label: 'Posts Archive' },
                  { value: 'page', label: 'Static Page' },
                  { value: 'landing', label: 'Landing Page' },
                ],
                value: homepage.mode || 'posts'
              })

            ),

            Field({
              label: 'Homepage Template',
              hint: 'Layout template used for homepage rendering.'
            },

              Input({
                id: 'homepageTemplate',
                placeholder: 'homepage',
                attrs: {
                  value: homepage.template || 'homepage'
                }
              })

            )

          ),

          Field({
            label: 'Homepage Page ID',
            hint: 'Used when homepage mode is page or landing.'
          },

            Input({
              id: 'homepagePageId',
              placeholder: 'page-id',
              attrs: {
                value: homepage.pageId || ''
              }
            })

          )

        ),

        // ── BLOG PAGE ────────────────────────────────────
        Section({
          title: 'Blog Archive',
          icon: ['duotone', 'newspaper'],
          description: 'Assign a page as the posts archive route.'
        },

          Toggle({
            id: 'blogPageEnabled',
            label: 'Enable Blog Archive Page',
            checked: blogPage.enabled === true
          }),

          FieldGrid(

            Field({
              label: 'Blog Page ID',
              hint: 'Slug of this page becomes the posts archive.'
            },

              Input({
                id: 'blogPageId',
                placeholder: 'blog-page-id',
                attrs: {
                  value: blogPage.pageId || ''
                }
              })

            ),

            Field({
              label: 'Blog Template'
            },

              Input({
                id: 'blogPageTemplate',
                placeholder: 'blog',
                attrs: {
                  value: blogPage.template || 'blog'
                }
              })

            )

          ),

          Field({
            label: 'Posts Per Page'
          },

            NumberInput({
              id: 'blogPostsPerPage',
              value: blogPage.postsPerPage || 10,
              min: 1,
              max: 500
            })

          )

        ),

        // ── ROUTING ──────────────────────────────────────
        Section({
          title: 'Routing Structure',
          icon: ['duotone', 'route'],
          description: 'Configure URL prefixes and permalink structures.'
        },

          FieldGrid(

            Field({
              label: 'Post Prefix',
              hint: '/post/my-post'
            },

              Input({
                id: 'postPrefix',
                placeholder: 'post',
                attrs: {
                  value: routing.postPrefix || 'post'
                }
              })

            ),

            Field({
              label: 'Category Prefix',
              hint: '/category/design'
            },

              Input({
                id: 'categoryPrefix',
                placeholder: 'category',
                attrs: {
                  value: routing.categoryPrefix || 'category'
                }
              })

            ),

            Field({
              label: 'Page Prefix',
              hint: 'Leave empty for clean page URLs.'
            },

              Input({
                id: 'pagePrefix',
                placeholder: '',
                attrs: {
                  value: routing.pagePrefix || ''
                }
              })

            ),

            Field({
              label: 'Landing Page Prefix',
              hint: '/landing/hero-page'
            },

              Input({
                id: 'landingPagePrefix',
                placeholder: 'landing',
                attrs: {
                  value: routing.landingPagePrefix || 'landing'
                }
              })

            )

          ),

          Toggle({
            id: 'enablePrettyURLs',
            label: 'Enable Pretty URLs',
            checked: routing.enablePrettyURLs !== false
          }),

          Field({
            label: 'Permalink Structure',
            hint: 'Variables: :slug, :postPrefix'
          },

            Input({
              id: 'permalinkStructure',
              placeholder: '/:postPrefix/:slug',
              attrs: {
                value: routing.permalinkStructure || '/:postPrefix/:slug'
              }
            })

          )

        ),

        SaveBar({
          id: 'routing-save-btn'
        })

      )

    )

  );

}
// ─── /acrx/system/seo ────────────────────────────────────────────────────────

function SeoSettingsPage(data = {}) {
  const s = data.seo || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'SEO', actions: [{ icon: 'floppy-disk', class: 'btn ghost', dataClick: '#seo-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'seo-form', class: 'settings-form form-container' },

        Section({ title: 'Global Meta', icon: ['duotone','tags'], description: 'Default meta values when page-level overrides are absent.' },
          Field({ label: 'Meta Title', forId: 'metaTitle', hint: 'Shown in browser tab and search results' },
            Input({ id: 'metaTitle', placeholder: 'Site Title — Tagline', attrs: { value: s.metaTitle || '' } })
          ),
          Field({ label: 'Meta Description', forId: 'metaDescription', hint: '120–160 characters ideal' },
            Textarea({ id: 'metaDescription', value: s.metaDescription || '', placeholder: 'Brief site description…', rows: 3 })
          ),
          Field({ label: 'Meta Keywords', forId: 'metaKeywords', hint: 'Comma-separated, optional' },
            Input({ id: 'metaKeywords', placeholder: 'cms, acroxa, blog', attrs: { value: s.metaKeywords || '' } })
          )
        ),

        Section({ title: 'Technical SEO', icon: ['duotone','wrench'], description: 'Crawling and indexing controls.' },
          Toggle({ id: 'enableSitemap',   label: 'Generate XML sitemap (/sitemap.xml)', checked: s.enableSitemap !== false }),
          Toggle({ id: 'enableRobotsTxt', label: 'Serve robots.txt',                    checked: s.enableRobotsTxt !== false }),
          Toggle({ id: 'canonicalURL',    label: 'Auto-inject canonical URL tags',       checked: s.canonicalURL !== false })
        ),

        Section({ title: 'Open Graph', icon: ['duotone','share-nodes'], description: 'Controls social media preview cards.' },
          Toggle({ id: 'ogEnabled', label: 'Enable Open Graph tags', checked: s.openGraph?.enabled !== false }),
          Field({ label: 'Default OG Image', hint: 'Fallback image if post has no featured image' },
            el('div', { class: 'file-upload-wrap form-upload-group' },
              el('button', { id: 'og-image-btn', class: 'btn-upload btn btn-secondary' }, Icon('image'), el('span', {}, 'Choose Image')),
              el('input', { type: 'file', id: 'ogDefaultImage', name: 'ogDefaultImage', accept: 'image/*', hidden: true })
            )
          )
        ),

        Section({ title: 'Twitter Cards', icon: ['brands','x-twitter'], description: 'Twitter-specific sharing metadata.' },
          Toggle({ id: 'twitterEnabled', label: 'Enable Twitter Card tags', checked: s.twitterCards?.enabled !== false }),
          Field({ label: 'Twitter Site Handle', forId: 'twitterHandle', hint: 'e.g. @acroxa' },
            Input({ id: 'twitterHandle', placeholder: '@youraccount', attrs: { value: s.twitterCards?.siteHandle || '' } })
          )
        ),

        Section({ title: 'Schema Markup', icon: ['duotone','code'], description: 'Structured data for rich search results.' },
          Toggle({ id: 'schemaEnabled', label: 'Enable JSON-LD schema markup', checked: s.schemaMarkup?.enabled !== false }),
          Field({ label: 'Schema Type' },
            Dropdown({
              id: 'schemaType',
              options: [
                { value: 'Organization', label: 'Organization' }, { value: 'WebSite', label: 'WebSite' },
                { value: 'Blog', label: 'Blog' }, { value: 'LocalBusiness', label: 'LocalBusiness' }, { value: 'Person', label: 'Person' },
              ],
              value: s.schemaMarkup?.type || 'Organization'
            })
          )
        ),

        SaveBar({ id: 'seo-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/ai ─────────────────────────────────────────────────────────

function AiSettingsPage(data = {}) {
  const ai     = data.ai || {};
  const openai = ai.providers?.openai || {};
  const gemini = ai.providers?.gemini || {};
  const custom = ai.providers?.custom || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'AI Settings', actions: [{ icon: 'floppy-disk', class: 'btn ghost', dataClick : '#ai-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'ai-form', class: 'settings-form form-container' },

        Section({ title: 'AI Engine', icon: ['duotone','sparkles'], description: 'Master switch and default provider.' },
          Toggle({ id: 'aiEnabled', label: 'Enable AI features across the CMS', checked: ai.enabled !== false }),
          Field({ label: 'Default Provider' },
            Dropdown({
              id: 'defaultProvider',
              options: [
                { value: 'openai', label: 'OpenAI (GPT)' },
                { value: 'gemini', label: 'Google Gemini' },
                { value: 'custom', label: 'Custom / Self-hosted' },
              ],
              value: ai.defaultProvider || 'openai'
            })
          )
        ),

        Section({ title: 'OpenAI', icon: ['brands','openai'], description: 'Configuration for OpenAI GPT models.' },
          Toggle({ id: 'openaiEnabled', label: 'Enable OpenAI provider', checked: openai.enabled !== false }),
          FieldGrid(
            Field({ label: 'API Key', forId: 'openaiKey', hint: 'Stored encrypted' },
              Input({ id: 'openaiKey', type: 'password', placeholder: 'sk-…', attrs: { value: openai.apiKey || '', autocomplete: 'off' } })
            ),
            Field({ label: 'Model' },
              Dropdown({
                id: 'openaiModel',
                options: [
                  { value: 'gpt-4o', label: 'GPT-4o' }, { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
                  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }, { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
                ],
                value: openai.model || 'gpt-4o-mini'
              })
            )
          ),
          el('div', { class: 'inline-action mt-3' },
            el('button', { id: 'test-openai', class: 'btn-test btn btn-secondary' },
              Icon('plug-circle-check', 'solid'), el('span', {}, 'Test Connection')
            )
          )
        ),

        Section({ title: 'Google Gemini', icon: ['brands','google'], description: 'Configuration for Google Gemini models.' },
          Toggle({ id: 'geminiEnabled', label: 'Enable Gemini provider', checked: gemini.enabled === true }),
          FieldGrid(
            Field({ label: 'API Key', forId: 'geminiKey' },
              Input({ id: 'geminiKey', type: 'password', placeholder: 'AIza…', attrs: { value: gemini.apiKey || '', autocomplete: 'off' } })
            ),
            Field({ label: 'Model' },
              Dropdown({
                id: 'geminiModel',
                options: [
                  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
                  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
                  { value: 'gemini-pro', label: 'Gemini Pro' },
                ],
                value: gemini.model || 'gemini-1.5-flash'
              })
            )
          ),
          el('div', { class: 'inline-action mt-3' },
            el('button', { id: 'test-gemini', class: 'btn-test btn btn-secondary' },
              Icon('plug-circle-check', 'solid'), el('span', {}, 'Test Connection')
            )
          )
        ),

        Section({ title: 'Custom Provider', icon: ['duotone','server'], description: 'Point to your own OpenAI-compatible endpoint.' },
          FieldGrid(
            Field({ label: 'Endpoint URL', forId: 'customEndpoint' },
              Input({ id: 'customEndpoint', placeholder: 'https://my-llm.internal/v1', attrs: { value: custom.endpoint || '' } })
            ),
            Field({ label: 'API Key', forId: 'customKey', hint: 'Leave blank if not required' },
              Input({ id: 'customKey', type: 'password', placeholder: 'Bearer token…', attrs: { value: custom.apiKey || '', autocomplete: 'off' } })
            )
          ),
          el('div', { class: 'inline-action mt-3' },
            el('button', { id: 'test-custom', class: 'btn-test btn btn-secondary' },
              Icon('plug-circle-check', 'solid'), el('span', {}, 'Test Connection')
            )
          )
        ),

        Section({ title: 'AI Features', icon: ['duotone','wand-magic-sparkles'], description: 'Toggle individual AI capabilities.' },
          Toggle({ id: 'contentSuggestions',       label: 'Content suggestions in editor',        checked: ai.features?.contentSuggestions !== false }),
          Toggle({ id: 'seoSuggestions',            label: 'SEO keyword & meta suggestions',       checked: ai.features?.seoSuggestions !== false }),
          Toggle({ id: 'autoTitleGeneration',       label: 'Auto-generate post titles',            checked: ai.features?.autoTitleGeneration !== false }),
          Toggle({ id: 'autoDescriptionGeneration', label: 'Auto-generate meta descriptions',      checked: ai.features?.autoDescriptionGeneration !== false }),
          Toggle({ id: 'chatAssistant',             label: 'Chat assistant panel',                 checked: ai.features?.chatAssistant !== false }),
          Toggle({
            id:      'customizerEnabled',
            label:   'Enable AI in Customizer',
            hint:    'Show AI suggestions and tools inside the visual customizer.',
            checked: ai.features?.customizerEnabled !== false,
          })
        ),

        SaveBar({ id: 'ai-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/security ───────────────────────────────────────────────────

function SecuritySettingsPage(data = {}) {
  const s  = data.security || {};
  const pp = s.passwordPolicy || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Security', actions: [{ icon: 'floppy-disk', class: 'btn ghost',  dataClick: '#general-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'security-form', class: 'settings-form form-container' },

        Section({ title: 'Authentication', icon: ['duotone','lock'], description: 'Login limits and session control.' },
          FieldGrid(
            Field({ label: 'Max Login Attempts', forId: 'loginAttemptsLimit', hint: 'Account locked after N failed tries' },
              NumberInput({ id: 'loginAttemptsLimit', value: s.loginAttemptsLimit || 5, min: 1, max: 100 })
            ),
            Field({ label: 'Session Timeout', forId: 'sessionTimeout' },
              NumberInput({ id: 'sessionTimeout', value: s.sessionTimeout || 3600, min: 60, suffix: 'seconds' })
            )
          ),
          Toggle({ id: 'twoFactorEnabled', label: 'Require two-factor authentication (2FA)', checked: s.twoFactorEnabled === true })
        ),

        Section({ title: 'Password Policy', icon: ['duotone','key'], description: 'Enforce strong passwords for all users.' },
          Field({ label: 'Minimum Length', forId: 'pwMinLength' },
            NumberInput({ id: 'pwMinLength', value: pp.minLength || 8, min: 6, max: 128 })
          ),
          Toggle({ id: 'requireNumbers',   label: 'Require at least one number',            checked: pp.requireNumbers !== false }),
          Toggle({ id: 'requireSymbols',   label: 'Require at least one special character', checked: pp.requireSymbols === true }),
          Toggle({ id: 'requireUppercase', label: 'Require at least one uppercase letter',  checked: pp.requireUppercase !== false })
        ),

        Section({ title: 'Access Control', icon: ['duotone','shield-halved'], description: 'IP and CORS restrictions.' },
          Field({ label: 'Allowed IP Addresses', forId: 'allowedIPs', hint: 'Comma-separated. Leave blank to allow all.' },
            Textarea({ id: 'allowedIPs', value: (s.allowedIPs || []).join(', '), placeholder: '192.168.1.1, 10.0.0.0/24', rows: 3 })
          ),
          Field({ label: 'CORS Origins', forId: 'corsOrigins', hint: 'Use * to allow all origins' },
            Textarea({ id: 'corsOrigins', value: (s.corsOrigins || ['*']).join(', '), placeholder: 'https://yourapp.com', rows: 3 })
          )
        ),

        DangerZone(
          el('div', { class: 'danger-action' },
            el('div', {},
              el('strong', {}, 'Force Sign Out All Users'),
              el('p', { class: 'text-muted' }, 'Invalidates all active sessions immediately.')
            ),
            el('button', { id: 'force-signout-all', class: 'btn-danger btn btn-danger' },
              Icon('right-from-bracket', 'solid'), el('span', {}, 'Sign Out Everyone')
            )
          )
        ),

        SaveBar({ id: 'security-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/api ────────────────────────────────────────────────────────

function ApiSettingsPage(data = {}) {
  const a    = data.api || {};
  const keys = a.thirdPartyKeys || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'API & Integrations', actions: [{ icon: 'floppy-disk', class: 'btn ghost',  dataClick: '#api-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'api-form', class: 'settings-form form-container' },

        Section({ title: 'CMS API', icon: ['duotone','plug'], description: 'Built-in REST API access and rate limiting.' },
          Toggle({ id: 'apiEnabled', label: 'Enable the CMS REST API', checked: a.apiEnabled !== false }),
          Field({ label: 'Rate Limit', forId: 'apiRateLimit', hint: 'Maximum requests per minute per IP' },
            NumberInput({ id: 'apiRateLimit', value: a.apiRateLimit || 100, min: 10, max: 10000, suffix: 'req/min' })
          ),
        ),

        Section({ title: 'Webhooks', icon: ['duotone','webhook'], description: 'POST event payloads to external endpoints.' },
          Field({ label: 'Webhook URLs', forId: 'webhookURLs', hint: 'One URL per line' },
            Textarea({ id: 'webhookURLs', value: (a.webhookURLs || []).join('\n'), placeholder: 'https://hooks.example.com/cms-events', rows: 4 })
          )
        ),

        Section({ title: 'Third-Party Keys', icon: ['duotone','key'], description: 'API credentials for external services.' },
          Field({ label: 'Google Analytics Measurement ID', forId: 'gaKey' },
            Input({ id: 'gaKey', placeholder: 'G-XXXXXXXXXX', attrs: { value: keys.googleAnalytics || '' } })
          ),
          FieldGrid(
            Field({ label: 'Stripe Secret Key', forId: 'stripeKey' },
              Input({ id: 'stripeKey', type: 'password', placeholder: 'sk_live_…', attrs: { value: keys.stripe || '', autocomplete: 'off' } })
            ),
            Field({ label: 'OpenAI API Key', forId: 'openaiApiKey' },
              Input({ id: 'openaiApiKey', type: 'password', placeholder: 'sk-…', attrs: { value: keys.openai || '', autocomplete: 'off' } })
            )
          ),
          Field({ label: 'Google Gemini API Key', forId: 'geminiApiKey' },
            Input({ id: 'geminiApiKey', type: 'password', placeholder: 'AIza…', attrs: { value: keys.gemini || '', autocomplete: 'off' } })
          )
        ),

        SaveBar({ id: 'api-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/analytics ──────────────────────────────────────────────────

function AnalyticsSettingsPage(data = {}) {
  const a = data.analytics || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Analytics', actions: [{ icon: 'floppy-disk', class: 'btn ghost',  dataClick: '#analytics-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'analytics-form', class: 'settings-form form-container' },

        Section({ title: 'Tracking', icon: ['duotone','chart-bar'], description: 'Configure analytics tracking for this site.' },
          Toggle({ id: 'analyticsEnabled', label: 'Enable analytics tracking', checked: a.analyticsEnabled !== false }),
          Field({ label: 'Tracking / Measurement ID', forId: 'trackingID', hint: 'Google Analytics 4: G-XXXXXXXXXX' },
            Input({ id: 'trackingID', placeholder: 'G-XXXXXXXXXX', attrs: { value: a.trackingID || '' } })
          )
        ),

        Section({ title: 'Privacy & Consent', icon: ['duotone','cookie-bite'], description: 'GDPR and cookie compliance.' },
          Toggle({ id: 'cookieConsentRequired', label: 'Show cookie consent banner to visitors', checked: a.cookieConsentRequired !== false }),
          Callout({ type: 'info', message: 'When enabled, tracking scripts are delayed until the visitor accepts cookies.' })
        ),

        SaveBar({ id: 'analytics-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/backups ────────────────────────────────────────────────────

function BackupsPage(data = {}) {
  const bp = data.backupPolicy || {};
  const sc = bp.schedule || {};
  const tg = bp.targets  || {};
  const gc = bp.git      || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Backups', actions: [{ icon: 'floppy-disk', class: 'btn ghost',  dataClick: '#backup-save-btn', title: 'Save Policy' }] }),
    MainContent(
      el('div', { id: 'backup-policy-form', class: 'settings-form form-container' },

        el('div', { class: 'backup-actions-bar action-bar mb-4' },
          el('button', { id: 'export-backup-btn', class: 'btn-export btn btn-secondary' },
            Icon('cloud-arrow-down'), el('span', {}, 'Export Backup Now')
          ),
          el('button', { id: 'import-backup-btn', class: 'btn-import btn btn-secondary' },
            Icon('cloud-arrow-up'), el('span', {}, 'Restore from Backup')
          ),
          el('input', { type: 'file', id: 'restore-input', accept: '.json', hidden: true })
        ),

        Section({ title: 'Backup Schedule', icon: ['duotone','clock'], description: 'Automate periodic backups.' },
          Toggle({ id: 'backupEnabled', label: 'Enable automated backups', checked: bp.enabled === true }),
          FieldGrid(
            Field({ label: 'Frequency' },
              Dropdown({
                id: 'backupInterval',
                options: [
                  { value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' }, { value: 'custom', label: 'Custom interval' },
                ],
                value: sc.interval || 'daily'
              })
            ),
            Field({ label: 'Time (daily/weekly)', forId: 'backupTime', hint: '24-hour HH:MM, server timezone' },
              Input({ id: 'backupTime', placeholder: '02:00', attrs: { value: sc.time || '02:00' } })
            )
          ),
          Field({ label: 'Custom Interval', forId: 'customInterval', hint: 'Only used when Frequency = Custom' },
            NumberInput({ id: 'customInterval', value: sc.customInterval || 0, min: 60, suffix: 'seconds' })
          )
        ),

        Section({ title: 'Backup Targets', icon: ['duotone','server'], description: 'Where backups are stored.' },
          Toggle({ id: 'targetLocal',  label: 'Local disk (pub-dist/backups/)',    checked: tg.local !== false }),
          Toggle({ id: 'targetGit',    label: 'Git repository (structured data)',  checked: tg.git   === true }),
          Toggle({ id: 'targetCloud',  label: 'Cloud storage (media files)',       checked: tg.cloud === true }),
          Toggle({ id: 'includeMedia', label: 'Include media files in backup',     checked: bp.includeMedia === true })
        ),

        Section({ title: 'Git Repository', icon: ['duotone','code-branch'], description: 'Commit CMS data to a Git remote. Media files are never included.' },
          FieldGrid(
            Field({ label: 'Repository URL', forId: 'gitRepoURL' },
              Input({ id: 'gitRepoURL', placeholder: 'https://github.com/org/repo.git', attrs: { value: gc.repoURL || '' } })
            ),
            Field({ label: 'Branch', forId: 'gitBranch' },
              Input({ id: 'gitBranch', placeholder: 'main', attrs: { value: gc.branch || 'main' } })
            )
          ),
          Field({ label: 'Personal Access Token', forId: 'gitToken', hint: gc.tokenSet ? 'A token is already saved — leave blank to keep it.' : 'Stored encrypted. GitHub, GitLab, Bitbucket supported.' },
            Input({ id: 'gitToken', type: 'password', placeholder: gc.tokenSet ? '••••••••  (saved — type to replace)' : 'ghp_…', attrs: { value: '', autocomplete: 'off' } })
          ),
          FieldGrid(
            Field({ label: 'Commit Author Name', forId: 'gitAuthorName' },
              Input({ id: 'gitAuthorName', placeholder: 'Acroxa CMS', attrs: { value: gc.authorName || 'Acroxa CMS' } })
            ),
            Field({ label: 'Commit Author Email', forId: 'gitAuthorEmail' },
              Input({ id: 'gitAuthorEmail', type: 'email', placeholder: 'cms@acroxa.io', attrs: { value: gc.authorEmail || '' } })
            )
          )
        ),

        Section({ title: 'Cloud Storage Connections', icon: ['duotone','cloud'], description: 'Add one or more storage destinations. Each connection can be reused by multiple backup jobs.' },

          // ── Saved connections list (populated + managed by backups.js) ──────────
          el('div', { class: 'connections-list', id: 'connections-list' },
            el('p', { class: 'loading-text text-muted' }, Icon('spinner', 'solid'), ' Loading connections…')
          ),

          el('div', { class: 'action-bar mt-3 mb-3' },
            el('button', { id: 'add-connection-btn', class: 'btn btn-secondary', type: 'button' },
              Icon('circle-plus'), el('span', {}, 'Add Connection')
            )
          ),

          // ── Add/Edit connection form (hidden until "Add Connection" is clicked) ──
          el('div', { id: 'connection-form-wrap', class: 'connection-form-wrap', hidden: true },

            el('input', { type: 'hidden', id: 'connectionEditId', value: '' }),

            Field({ label: 'Storage Provider' },
              IconDropdown({
                id: 'cloudProvider',
                label: 'Select Storage Provider',
                items: [
                  { value: 's3',        label: 'Amazon S3',                 icon: 'aws',            iconStyle: 'brands' },
                  { value: 'r2',        label: 'Cloudflare R2',             icon: 'cloudflare',     iconStyle: 'brands' },
                  { value: 'b2',        label: 'Backblaze B2',              icon: 'hard-drive',     iconStyle: 'solid'  },
                  { value: 'gdrive',    label: 'Google Drive',              icon: 'google-drive',   iconStyle: 'brands' },
                  { value: 'dropbox',   label: 'Dropbox',                   icon: 'dropbox',        iconStyle: 'brands' },
                  { value: 'onedrive',  label: 'Microsoft OneDrive',        icon: 'microsoft',      iconStyle: 'brands' },
                  { value: 'azure',     label: 'Azure Blob Storage',        icon: 'microsoft',      iconStyle: 'brands' },
                  { value: 'gcs',       label: 'Google Cloud Storage',      icon: 'google',         iconStyle: 'brands' },
                  { value: 'spaces',    label: 'DigitalOcean Spaces',       icon: 'digital-ocean',  iconStyle: 'brands' },
                  { value: 'wasabi',    label: 'Wasabi',                    icon: 'server',         iconStyle: 'solid'  },
                  { value: 'linode',    label: 'Linode Object Storage',     icon: 'server',         iconStyle: 'solid'  },
                  { value: 'vultr',     label: 'Vultr Object Storage',      icon: 'server',         iconStyle: 'solid'  },
                  { value: 'minio',     label: 'MinIO',                     icon: 'database',       iconStyle: 'solid'  },
                  { value: 'ftp',       label: 'FTP',                       icon: 'folder-network', iconStyle: 'solid'  },
                  { value: 'sftp',      label: 'SFTP',                      icon: 'lock',           iconStyle: 'solid'  },
                  { value: 'webdav',    label: 'WebDAV',                    icon: 'globe',          iconStyle: 'solid'  },
                  { value: 'custom-s3', label: 'Custom S3 Compatible',      icon: 'boxes-stacked',  iconStyle: 'solid'  },
                ]
              })
            ),

            // ============================================================================
            // Each block below is hidden/shown by backups.js based on the selected
            // provider. data-provider is the switch key; data-connection-fields marks
            // the whole container so JS can query all provider blocks at once.
            // ============================================================================
            el('div', { id: 'connection-fields', 'data-connection-fields': true },

              // ── AMAZON S3 ──
              el('div', { class: 'provider-fields', 'data-provider': 's3', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 's3ConnectionName', placeholder: 'Production S3' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 's3Bucket' })),
                  Field({ label: 'Region' }, Input({ id: 's3Region', placeholder: 'us-east-1' }))
                ),
                FieldGrid(
                  Field({ label: 'Access Key ID' }, Input({ id: 's3AccessKey', type: 'password' })),
                  Field({ label: 'Secret Access Key' }, Input({ id: 's3SecretKey', type: 'password' }))
                ),
                Field({ label: 'Storage Class (Optional)' }, Input({ id: 's3StorageClass', placeholder: 'STANDARD' }))
              ),

              // ── CLOUDFLARE R2 ──
              el('div', { class: 'provider-fields', 'data-provider': 'r2', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'r2ConnectionName', placeholder: 'Cloudflare R2' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 'r2Bucket' })),
                  Field({ label: 'Account ID' }, Input({ id: 'r2AccountId' }))
                ),
                FieldGrid(
                  Field({ label: 'Access Key ID' }, Input({ id: 'r2AccessKey', type: 'password' })),
                  Field({ label: 'Secret Access Key' }, Input({ id: 'r2SecretKey', type: 'password' }))
                ),
                Field({ label: 'Endpoint URL' }, Input({ id: 'r2Endpoint' }))
              ),

              // ── BACKBLAZE B2 ──
              el('div', { class: 'provider-fields', 'data-provider': 'b2', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'b2ConnectionName' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 'b2Bucket' })),
                  Field({ label: 'Region' }, Input({ id: 'b2Region' }))
                ),
                FieldGrid(
                  Field({ label: 'Key ID' }, Input({ id: 'b2KeyId', type: 'password' })),
                  Field({ label: 'Application Key' }, Input({ id: 'b2ApplicationKey', type: 'password' }))
                ),
                Field({ label: 'Endpoint URL' }, Input({ id: 'b2Endpoint' }))
              ),

              // ── GOOGLE DRIVE ──
              el('div', { class: 'provider-fields', 'data-provider': 'gdrive', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'gdriveConnectionName' })),
                FieldGrid(
                  Field({ label: 'Google Cloud Project ID' }, Input({ id: 'gdriveProjectId' })),
                  Field({ label: 'Root Folder ID' }, Input({ id: 'gdriveRootFolder', placeholder: 'Optional' }))
                ),
                FieldGrid(
                  Field({ label: 'OAuth Client ID' }, Input({ id: 'gdriveClientId' })),
                  Field({ label: 'OAuth Client Secret' }, Input({ id: 'gdriveClientSecret', type: 'password' }))
                ),
                Field({ label: 'Refresh Token' }, Input({ id: 'gdriveRefreshToken', type: 'password' }))
              ),

              // ── DROPBOX ──
              el('div', { class: 'provider-fields', 'data-provider': 'dropbox', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'dropboxConnectionName' })),
                FieldGrid(
                  Field({ label: 'App Key' }, Input({ id: 'dropboxAppKey' })),
                  Field({ label: 'App Secret' }, Input({ id: 'dropboxAppSecret', type: 'password' }))
                ),
                Field({ label: 'Refresh Token' }, Input({ id: 'dropboxRefreshToken', type: 'password' })),
                Field({ label: 'Folder Path' }, Input({ id: 'dropboxFolder', placeholder: '/Acroxa' }))
              ),

              // ── MICROSOFT ONEDRIVE ──
              el('div', { class: 'provider-fields', 'data-provider': 'onedrive', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'onedriveConnectionName' })),
                FieldGrid(
                  Field({ label: 'Application (Client) ID' }, Input({ id: 'onedriveClientId' })),
                  Field({ label: 'Tenant ID' }, Input({ id: 'onedriveTenantId' }))
                ),
                Field({ label: 'Client Secret' }, Input({ id: 'onedriveClientSecret', type: 'password' })),
                Field({ label: 'Refresh Token' }, Input({ id: 'onedriveRefreshToken', type: 'password' })),
                Field({ label: 'Root Folder' }, Input({ id: 'onedriveRootFolder' }))
              ),

              // ── AZURE BLOB STORAGE ──
              el('div', { class: 'provider-fields', 'data-provider': 'azure', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'azureConnectionName' })),
                FieldGrid(
                  Field({ label: 'Storage Account' }, Input({ id: 'azureStorageAccount' })),
                  Field({ label: 'Container Name' }, Input({ id: 'azureContainer' }))
                ),
                Field({ label: 'Account Key' }, Input({ id: 'azureAccountKey', type: 'password' })),
                Field({ label: 'Endpoint URL' }, Input({ id: 'azureEndpoint' }))
              ),

              // ── GOOGLE CLOUD STORAGE ──
              el('div', { class: 'provider-fields', 'data-provider': 'gcs', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'gcsConnectionName' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 'gcsBucket' })),
                  Field({ label: 'Project ID' }, Input({ id: 'gcsProjectId' }))
                ),
                Field({ label: 'Service Account JSON' }, Textarea({ id: 'gcsServiceAccount', placeholder: 'Paste service account JSON here...' })),
                Field({ label: 'Folder Prefix' }, Input({ id: 'gcsFolderPrefix' }))
              ),

              // ── DIGITALOCEAN SPACES ──
              el('div', { class: 'provider-fields', 'data-provider': 'spaces', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'spacesConnectionName' })),
                FieldGrid(
                  Field({ label: 'Space Name' }, Input({ id: 'spacesName' })),
                  Field({ label: 'Region' }, Input({ id: 'spacesRegion' }))
                ),
                FieldGrid(
                  Field({ label: 'Access Key' }, Input({ id: 'spacesAccessKey', type: 'password' })),
                  Field({ label: 'Secret Key' }, Input({ id: 'spacesSecretKey', type: 'password' }))
                ),
                Field({ label: 'Endpoint URL' }, Input({ id: 'spacesEndpoint' }))
              ),

              // ── WASABI ──
              el('div', { class: 'provider-fields', 'data-provider': 'wasabi', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'wasabiConnectionName' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 'wasabiBucket' })),
                  Field({ label: 'Region' }, Input({ id: 'wasabiRegion' }))
                ),
                FieldGrid(
                  Field({ label: 'Access Key' }, Input({ id: 'wasabiAccessKey', type: 'password' })),
                  Field({ label: 'Secret Key' }, Input({ id: 'wasabiSecretKey', type: 'password' }))
                ),
                Field({ label: 'Endpoint URL' }, Input({ id: 'wasabiEndpoint' }))
              ),

              // ── LINODE OBJECT STORAGE ──
              el('div', { class: 'provider-fields', 'data-provider': 'linode', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'linodeConnectionName' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 'linodeBucket' })),
                  Field({ label: 'Cluster / Region' }, Input({ id: 'linodeRegion' }))
                ),
                FieldGrid(
                  Field({ label: 'Access Key' }, Input({ id: 'linodeAccessKey', type: 'password' })),
                  Field({ label: 'Secret Key' }, Input({ id: 'linodeSecretKey', type: 'password' }))
                ),
                Field({ label: 'Endpoint URL' }, Input({ id: 'linodeEndpoint' }))
              ),

              // ── VULTR OBJECT STORAGE ──
              el('div', { class: 'provider-fields', 'data-provider': 'vultr', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'vultrConnectionName' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 'vultrBucket' })),
                  Field({ label: 'Region' }, Input({ id: 'vultrRegion' }))
                ),
                FieldGrid(
                  Field({ label: 'Access Key' }, Input({ id: 'vultrAccessKey', type: 'password' })),
                  Field({ label: 'Secret Key' }, Input({ id: 'vultrSecretKey', type: 'password' }))
                ),
                Field({ label: 'Endpoint URL' }, Input({ id: 'vultrEndpoint' }))
              ),

              // ── MINIO ──
              el('div', { class: 'provider-fields', 'data-provider': 'minio', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'minioConnectionName' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 'minioBucket' })),
                  Field({ label: 'Endpoint URL' }, Input({ id: 'minioEndpoint' }))
                ),
                FieldGrid(
                  Field({ label: 'Access Key' }, Input({ id: 'minioAccessKey', type: 'password' })),
                  Field({ label: 'Secret Key' }, Input({ id: 'minioSecretKey', type: 'password' }))
                ),
                Toggle({ id: 'minioSSL', label: 'Use SSL' })
              ),

              // ── FTP ──
              el('div', { class: 'provider-fields', 'data-provider': 'ftp', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'ftpConnectionName' })),
                FieldGrid(
                  Field({ label: 'Host' }, Input({ id: 'ftpHost' })),
                  Field({ label: 'Port' }, NumberInput({ id: 'ftpPort', value: 21 }))
                ),
                FieldGrid(
                  Field({ label: 'Username' }, Input({ id: 'ftpUsername' })),
                  Field({ label: 'Password' }, Input({ id: 'ftpPassword', type: 'password' }))
                ),
                Field({ label: 'Remote Directory' }, Input({ id: 'ftpDirectory' })),
                Toggle({ id: 'ftpPassive', label: 'Passive Mode' }),
                Toggle({ id: 'ftpTLS', label: 'Use TLS' })
              ),

              // ── SFTP ──
              el('div', { class: 'provider-fields', 'data-provider': 'sftp', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'sftpConnectionName' })),
                FieldGrid(
                  Field({ label: 'Host' }, Input({ id: 'sftpHost' })),
                  Field({ label: 'Port' }, NumberInput({ id: 'sftpPort', value: 22 }))
                ),
                Field({ label: 'Username' }, Input({ id: 'sftpUsername' })),
                Field({ label: 'Password' }, Input({ id: 'sftpPassword', type: 'password' })),
                Field({ label: 'Private Key (Optional)' }, Textarea({ id: 'sftpPrivateKey' })),
                Field({ label: 'Remote Directory' }, Input({ id: 'sftpDirectory' }))
              ),

              // ── WEBDAV ──
              el('div', { class: 'provider-fields', 'data-provider': 'webdav', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'webdavConnectionName' })),
                Field({ label: 'Server URL' }, Input({ id: 'webdavUrl' })),
                FieldGrid(
                  Field({ label: 'Username' }, Input({ id: 'webdavUsername' })),
                  Field({ label: 'Password' }, Input({ id: 'webdavPassword', type: 'password' }))
                ),
                Field({ label: 'Base Folder' }, Input({ id: 'webdavFolder' }))
              ),

              // ── CUSTOM S3 COMPATIBLE ──
              el('div', { class: 'provider-fields', 'data-provider': 'custom-s3', hidden: true },
                Field({ label: 'Connection Name' }, Input({ id: 'customS3ConnectionName' })),
                FieldGrid(
                  Field({ label: 'Bucket Name' }, Input({ id: 'customS3Bucket' })),
                  Field({ label: 'Region' }, Input({ id: 'customS3Region' }))
                ),
                Field({ label: 'Endpoint URL' }, Input({ id: 'customS3Endpoint' })),
                FieldGrid(
                  Field({ label: 'Access Key' }, Input({ id: 'customS3AccessKey', type: 'password' })),
                  Field({ label: 'Secret Key' }, Input({ id: 'customS3SecretKey', type: 'password' }))
                ),
                Toggle({ id: 'customS3SSL', label: 'Use SSL' }),
                Toggle({ id: 'customS3PathStyle', label: 'Force Path Style' })
              )
            ),

            el('div', { class: 'action-bar mt-3' },
              el('button', { id: 'test-connection-btn', class: 'btn btn-secondary', type: 'button' },
                Icon('plug'), el('span', {}, 'Test Connection')
              ),
              el('button', { id: 'save-connection-btn', class: 'btn btn-primary', type: 'button' },
                Icon('floppy-disk'), el('span', {}, 'Save Connection')
              ),
              el('button', { id: 'cancel-connection-btn', class: 'btn ghost', type: 'button' },
                el('span', {}, 'Cancel')
              )
            )
          )
        ),

        Section({ title: 'Backup Jobs', icon: ['duotone','list-check'], description: 'Each job runs an upload to one connection. Enable a job and it will run whenever a cloud backup is triggered (manual or scheduled).' },
          el('div', { class: 'jobs-list', id: 'jobs-list' },
            el('p', { class: 'loading-text text-muted' }, Icon('spinner', 'solid'), ' Loading jobs…')
          ),

          el('div', { class: 'action-bar mt-3 mb-3' },
            el('button', { id: 'add-job-btn', class: 'btn btn-secondary', type: 'button' },
              Icon('circle-plus'), el('span', {}, 'Add Job')
            )
          ),

          el('div', { id: 'job-form-wrap', class: 'job-form-wrap', hidden: true },
            el('input', { type: 'hidden', id: 'jobEditId', value: '' }),

            Field({ label: 'Job Name' }, Input({ id: 'jobName', placeholder: 'Nightly media sync' })),

            Field({ label: 'Connection' },
              el('div', { id: 'jobConnectionSelectWrap' },
                Dropdown({ id: 'jobConnectionId', options: [], value: '' })
              )
            ),

            Field({ label: 'Remote Path', forId: 'jobBackupPath', hint: 'Optional folder/prefix within the destination' },
              Input({ id: 'jobBackupPath', placeholder: 'backups/acroxa' })
            ),

            Toggle({ id: 'jobEnabled', label: 'Job enabled', checked: true }),
            Toggle({ id: 'jobIncludeMedia', label: 'Include media files', checked: true }),

            el('div', { class: 'action-bar mt-3' },
              el('button', { id: 'save-job-btn', class: 'btn btn-primary', type: 'button' },
                Icon('floppy-disk'), el('span', {}, 'Save Job')
              ),
              el('button', { id: 'cancel-job-btn', class: 'btn ghost', type: 'button' },
                el('span', {}, 'Cancel')
              )
            )
          )
        ),

        Section({ title: 'Backup History', icon: ['duotone','history'], description: 'Previously generated local backups.' },
          el('div', { class: 'backup-history', id: 'backup-history' },
            el('p', { class: 'loading-text text-muted' }, Icon('spinner', 'solid'), ' Loading backup history…')
          )
        ),

        SaveBar({ id: 'backup-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/logs ───────────────────────────────────────────────────────

function LogsPage() {
  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'System Logs' }),
    MainContent(
      Section({ title: 'Log Viewer', icon: ['duotone','scroll'], description: 'Live system event and error logs.' },
        el('div', { class: 'log-controls control-bar mb-3' },
          Dropdown({
            id: 'logLevelFilter',
            options: [
              { value: 'all', label: 'All Levels' }, { value: 'error', label: 'Errors Only' },
              { value: 'warn', label: 'Warnings' },  { value: 'info', label: 'Info' }, { value: 'debug', label: 'Debug' },
            ],
            value: 'all'
          }),
          Input({ id: 'log-search', placeholder: 'Search logs…', className: 'log-search-input form-input' }),
          el('button', { id: 'refresh-logs', class: 'btn-icon btn btn-secondary', title: 'Refresh' }, Icon('rotate', 'solid')),
          el('button', { id: 'clear-logs',   class: 'btn-icon btn btn-danger-ghost', title: 'Clear logs' }, Icon('trash', 'solid'))
        ),
        el('div', { class: 'log-viewer', id: 'log-viewer' },
        )
      )
    )
  );
}

// ─── /acrx/system/maintenance ────────────────────────────────────────────────

function MaintenancePage(data = {}) {
  const sys = data.system   || {};
  const adv = data.advanced || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Maintenance', actions: [{ icon: 'floppy-disk', class: 'btn ghost',  dataClick: '#general-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'maintenance-form', class: 'settings-form form-container' },

        Section({ title: 'Maintenance Mode', icon: ['duotone','wrench'], description: 'Take the site offline for maintenance.' },
          sys.maintenanceMode
            ? Callout({ type: 'warning', title: 'Maintenance mode is ON', message: 'Public-facing pages are hidden. Only admins can access the CMS.' })
            : Callout({ type: 'info', message: 'The site is currently live and accessible to all visitors.' }),
          el('div', { class: 'maintenance-toggle-row d-flex align-items-center gap-3' },
            Toggle({ id: 'maintenanceMode', label: 'Enable maintenance mode', checked: sys.maintenanceMode === true }),
            el('button', {
              id: 'toggle-maintenance-btn',
              class: `btn-maintenance btn ${sys.maintenanceMode ? 'btn-success' : 'btn-secondary'}`
            },
              Icon(sys.maintenanceMode ? 'circle-check' : 'wrench', 'solid'),
              el('span', {}, sys.maintenanceMode ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode')
            )
          )
        ),

        Section({ title: 'Cache', icon: ['duotone','bolt'], description: 'Control server-side response caching.' },
          Toggle({ id: 'cacheEnabled', label: 'Enable caching', checked: adv.cacheEnabled !== false }),
          Field({ label: 'Cache TTL', forId: 'cacheTTL', hint: 'Time-to-live in seconds' },
            NumberInput({ id: 'cacheTTL', value: adv.cacheTTL || 3600, min: 0, suffix: 'seconds' })
          ),
          el('button', { id: 'flush-cache-btn', class: 'btn-secondary btn' },
            Icon('rotate', 'solid'), el('span', {}, 'Flush Cache Now')
          )
        ),

        Section({ title: 'Registration', icon: ['duotone','user-plus'], description: 'Control public user signups.' },
          Toggle({ id: 'registrationEnabled', label: 'Allow new user registrations', checked: sys.registrationEnabled !== false }),
          Field({ label: 'Default Role for New Users' },
            Dropdown({
              id: 'defaultUserRole',
              options: [
                { value: 'user',   label: 'User' },   { value: 'author', label: 'Author' },
                { value: 'editor', label: 'Editor' }, { value: 'admin',  label: 'Admin' },
              ],
              value: sys.defaultUserRole || 'user'
            })
          ),
          Toggle({ id: 'contentModerationRequired', label: 'Require moderation for user-submitted content', checked: sys.contentModerationRequired === true })
        ),

        Section({ title: 'Auto-save & Pagination', icon: ['duotone','floppy-disk'] },
          FieldGrid(
            Field({ label: 'Auto-save Interval', forId: 'autoSaveInterval' },
              NumberInput({ id: 'autoSaveInterval', value: sys.autoSaveInterval || 30, min: 5, suffix: 'seconds' })
            ),
            Field({ label: 'Items Per Page', forId: 'paginationLimit', hint: 'Default pagination for list views' },
              NumberInput({ id: 'paginationLimit', value: sys.paginationLimit || 10, min: 1, max: 500 })
            )
          )
        ),

        SaveBar({ id: 'maintenance-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/advanced ───────────────────────────────────────────────────

function AdvancedSettingsPage(data = {}) {
  const a = data.advanced || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Advanced', actions: [{ icon: 'floppy-disk', class: 'btn ghost',  dataClick: '#general-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'advanced-form', class: 'settings-form form-container' },

        Callout({ type: 'warning', title: 'Handle with care', message: 'Changes here affect core CMS behaviour. Incorrect values can break the application.' }),

        Section({ title: 'Environment', icon: ['duotone','server'], description: 'Deployment context and CDN.' },
          Field({ label: 'Environment' },
            Dropdown({
              id: 'environment',
              options: [
                { value: 'development', label: 'Development' },
                { value: 'staging',     label: 'Staging' },
                { value: 'production',  label: 'Production' },
              ],
              value: a.environment || 'production'
            })
          ),
          Field({ label: 'CDN URL', forId: 'cdnURL', hint: 'Leave blank to serve assets locally' },
            Input({ id: 'cdnURL', placeholder: 'https://cdn.example.com', attrs: { value: a.cdnURL || '' } })
          )
        ),

        Section({ title: 'Logging', icon: ['duotone','scroll'], description: 'Log verbosity and debug output.' },
          Field({ label: 'Log Level' },
            Dropdown({
              id: 'logLevel',
              options: [
                { value: 'error', label: 'Error' }, { value: 'warn',  label: 'Warn' },
                { value: 'info',  label: 'Info' },  { value: 'debug', label: 'Debug' },
              ],
              value: a.logLevel || 'info'
            })
          ),
          Toggle({ id: 'debugMode', label: 'Enable debug mode', hint: 'Verbose logs. Disable in production.', checked: a.debugMode === true })
        ),

        Section({ title: 'Custom Code', icon: ['duotone','code'], description: 'Injected into every page. Use sparingly.' },
          Field({ label: 'Custom CSS', forId: 'customCSS' },
            Textarea({ id: 'customCSS', value: data.appearance?.customCSS || '', placeholder: '/* your styles */', rows: 6 })
          ),
          Field({ label: 'Custom JavaScript', forId: 'customJS' },
            Textarea({ id: 'customJS', value: data.appearance?.customJS || '', placeholder: '// your script', rows: 6 })
          )
        ),

        DangerZone(
          el('div', { class: 'danger-action' },
            el('div', {},
              el('strong', {}, 'Reset All Settings to Defaults'),
              el('p', { class: 'text-muted' }, 'This will wipe every setting and restore factory defaults. Cannot be undone.')
            ),
            el('button', { id: 'reset-all-settings-btn', class: 'btn-danger btn btn-danger' },
              Icon('rotate-left', 'solid'), el('span', {}, 'Reset Everything')
            )
          )
        ),

        SaveBar({ id: 'advanced-save-btn' })
      )
    )
  );
}

// ─── /acrx/system/email ─────────────────────────────────────────────────────

function EmailSettingsPage(data = {}) {
  const e = data.email || {};

  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Email Settings', actions: [{ icon: 'floppy-disk', class: 'btn ghost', dataClick: '#email-save-btn', title: 'Save' }] }),
    MainContent(
      el('div', { id: 'email-form', class: 'settings-form form-container' },

        Section({ title: 'SMTP Configuration', icon: ['duotone','envelope'], description: 'Configure outbound email delivery via SMTP.' },
          Toggle({ id: 'emailEnabled', label: 'Enable email sending', checked: e.enabled === true }),
          FieldGrid(
            Field({ label: 'SMTP Host', forId: 'emailHost', hint: 'e.g. smtp.gmail.com' },
              Input({ id: 'emailHost', placeholder: 'smtp.example.com', attrs: { value: e.host || '' } })
            ),
            Field({ label: 'SMTP Port', forId: 'emailPort' },
              NumberInput({ id: 'emailPort', value: e.port || 587, min: 1, max: 65535 })
            )
          ),
          FieldGrid(
            Field({ label: 'Username', forId: 'emailUsername' },
              Input({ id: 'emailUsername', placeholder: 'user@example.com', attrs: { value: e.username || '' } })
            ),
            Field({ label: 'Password', forId: 'emailPassword' },
              Input({ id: 'emailPassword', type: 'password', placeholder: '••••••••', attrs: { value: e.password || '', autocomplete: 'off' } })
            )
          ),
          Field({ label: 'Encryption' },
            Dropdown({
              id: 'emailEncryption',
              options: [
                { value: 'starttls', label: 'STARTTLS (Recommended)' },
                { value: 'ssl',      label: 'SSL / TLS' },
                { value: 'none',     label: 'None (Not Recommended)' },
              ],
              value: e.encryption || 'starttls'
            })
          )
        ),

        Section({ title: 'Sender Information', icon: ['duotone','paper-plane'], description: 'Who emails appear to be from.' },
          FieldGrid(
            Field({ label: 'Sender Name', forId: 'emailSenderName', hint: 'Displayed as the "From" name' },
              Input({ id: 'emailSenderName', placeholder: 'Acroxa CMS', attrs: { value: e.senderName || '' } })
            ),
            Field({ label: 'Sender Email Address', forId: 'emailSenderAddress' },
              Input({ id: 'emailSenderAddress', type: 'email', placeholder: 'noreply@example.com', attrs: { value: e.senderAddress || '' } })
            )
          )
        ),

        Section({ title: 'Test Connection', icon: ['duotone','plug'], description: 'Verify your SMTP settings work before saving.' },
          Field({ label: 'Test Email Address', forId: 'emailTestAddress', hint: 'A test email will be sent here' },
            Input({ id: 'emailTestAddress', type: 'email', placeholder: 'you@example.com' })
          ),
          el('div', { class: 'inline-action mt-2 d-flex gap-2' },
            el('button', { id: 'test-email-connection', class: 'btn-test btn btn-secondary', type: 'button' },
              Icon('plug-circle-check', 'solid'), el('span', {}, 'Test SMTP Connection')
            ),
            el('button', { id: 'test-email-send', class: 'btn-test btn btn-primary', type: 'button' },
              Icon('paper-plane', 'solid'), el('span', {}, 'Send Test Email')
            )
          )
        ),

        SaveBar({ id: 'email-save-btn' })
      )
    )
  );
}

function PluginsPage(data = {}) {
  return PageWrapper({ className: 'acrx-dshb-wr settings-page' },
    MainHeader({ title: 'Plugins' }),
    MainContent(
      el('div', { class: 'settings-form form-container' },
        Section({ title: 'Installed Plugins', icon: ['duotone','puzzle-piece'], description: 'Manage your installed plugins and extensions.' },
          el('div', { class: 'empty-state', style: 'text-align:center; padding:60px 20px; color:var(--text-muted);' },
            el('i', { class: 'fa-duotone fa-puzzle-piece', style: 'font-size:48px; margin-bottom:16px; display:block; opacity:0.4;' }),
            el('h3', { style: 'margin-bottom:8px; color:var(--text-color);' }, 'No plugins installed'),
            el('p', {}, 'Plugins extend Acroxa with new features. Browse the plugin directory to get started.'),
            el('a', { href: '#', class: 'btn btn-primary', style: 'margin-top:16px; display:inline-flex; align-items:center; gap:8px;' },
              Icon('store', 'solid'), el('span', {}, 'Browse Plugins')
            )
          )
        )
      )
    )
  );
}


// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  SystemNavPage,
  GeneralSettingsPage,
  LocalizationPage,
  RoutingSettingsPage,
  ContentSettingsPage,
  SeoSettingsPage,
  AiSettingsPage,
  SecuritySettingsPage,
  ApiSettingsPage,
  AnalyticsSettingsPage,
  BackupsPage,
  LogsPage,
  MaintenancePage,
  AdvancedSettingsPage,
  EmailSettingsPage,
  PluginsPage,
  // Primitives
  Icon, Field, Section, FieldGrid, Toggle, NumberInput,
  Dropdown, SaveBar, Badge, Textarea, ColorPicker,
  DangerZone, Callout,
};



module.exports.meta = [
  {
    path: "/acrx/system",
    render: "SystemNavPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/system-nav.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/general",
    render: "GeneralSettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/general.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/routing",
    render: "RoutingSettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/routing.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/localization",
    render: "LocalizationPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/localization.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/content",
    render: "ContentSettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/content.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/seo",
    render: "SeoSettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/seo.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/ai",
    render: "AiSettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/ai.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/security",
    render: "SecuritySettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/security.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/api",
    render: "ApiSettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/api.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/analytics",
    render: "AnalyticsSettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/analytics.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/backups",
    render: "BackupsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css",
      "/acrx/assets/css/ad-ds.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/backups.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/logs",
    render: "LogsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/logs.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/maintenance",
    render: "MaintenancePage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/maintenance.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/advanced",
    render: "AdvancedSettingsPage",
    title: "System - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/advanced.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/email",
    render: "EmailSettingsPage",
    title: "Email Settings - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [
      "/acrx/assets/js/system/_shared.js",
      "/acrx/assets/js/system/email.js"
    ],
    layout: "full"
  },

  {
    path: "/acrx/system/plugins",
    render: "PluginsPage",
    title: "Plugins - Acroxa",
    css: [
      "/acrx/assets/css/ad-st.css",
      "/acrx/assets/css/ad-ap.css"
    ],
    js: [],
    layout: "full"
  }
];