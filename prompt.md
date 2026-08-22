# ACROXA EDITOR — COMPLETE IMPLEMENTATION PROMPT

## HOW TO USE THIS PROMPT

This document contains everything an AI needs to implement the complete Acroxa Editor. Read the entire `.acroxa/architecture.md` first to understand the project structure, then follow this prompt section by section.

---

## 0. PROJECT ARCHITECTURE OVERVIEW

Acroxa is a self-hosted Node.js CMS:
- **Entry point:** `index.js` → Express 5.x server
- **Databases:** MongoDB (mongoose 8.x) OR SQL (sequelize 6.x — mysql, postgres, sqlite)
- **Frontend:** Server-rendered HTML + vanilla JS (NO SPA framework, NO React/Vue/Angular)
- **Admin panel:** Served from `/acrx/`
- **API namespace:** `/acr/api/`
- **Plugin API:** `global.acrx` (register routes, menus, widgets, hooks, schemas)
- **Hot reload:** Dev-only file watcher (chokidar)
- **Auth:** JWT cookies + WebAuthn passkeys

### Key Dynamic Loading Conventions:
1. **Routes:** Files matching `*Routes.js` in `src/routes/` are auto-discovered
2. **Views:** Files in `src/views/` exporting `{ meta: Array, renderFn }` become pages
3. **Models:** Files in `src/models/mongo/` or `src/models/sql/` exporting `{ buildModel }`
4. **Layouts:** `src/layouts/<name>/layout.js` exports `{ layouts: { templateKey: (params) => html } }`

### CSS Design System Variables (from `root.css`):
```
--color-primary-50 through --color-primary-1000 (grayscale)
--color-primary-{n}-a10 through -a90 (alpha variants)
--accent-50 through --accent-600 (brand colors)
--accent-{n}-a10 through -a90 (alpha variants)
--text-color: var(--gray-900)
--muted: #777777
--ic: var(--accent-500) (icon color)
--ease-spring: cubic-bezier(0.34, 1.56, 0.04, 1)
--ease-spring-soft: cubic-bezier(0.25, 1.25, 0.5, 1)
--ease-water: cubic-bezier(0.36, 0.66, 0.04, 1)
```

### Existing UI Patterns (from `ad-st.css`, `ad-ed.css`, `root.css`):
- Rounded corners: `border-radius: 5px` to `30px` (commonly 20px)
- Glass morphism: `backdrop-filter: blur(10px)` + semi-transparent backgrounds
- Tooltips: CSS anchor positioning with `data-title` attribute
- Transitions: `all 0.3s var(--ease-spring)` or `all 0.5s var(--ease-water)`
- Buttons: `.header-btn`, `.toolbar-btn`, `.block-action-btn` patterns
- Dropdowns: `.dropdown`, `.dropdown-toggle`, `.dropdown-menu`, `.dropdown-item`
- Inputs: transparent background, no outline, border-bottom focus
- Icons: Font Awesome via `<i class="fa-{style} fa-{name}">` or `<i class="fa-{style} fa-{name} {style}">`
- Font family: `'Outfit'` (loaded from Google Fonts)

---

## 1. DATABASE MODELS (EXISTING — USE THEM)

### 1.1 Widget Model (`src/models/mongo/Widget.js`)
```js
{
  name, slug, type, category, description, icon, version,
  content: { json, html, settings },  // json = renderable, html = preview
  styles, responsive: { mobile, tablet, desktop },
  customCSS, customJS, customAttributes,
  visibility: { mobile, tablet, desktop, loggedIn, loggedOut },
  conditions: ConditionNodeSchema,
  previewImage, tags, author, status, isGlobal, isLocked,
  usageCount, isDynamic, isStatic, plugin, metadata,
  schemaVersion, timestamps
}
// Statics: findActive(), findGlobal(), incrementUsage(), search()
// Methods: toPublic(), duplicate(), isVisibleFor()
```

### 1.2 Pattern Model (`src/models/mongo/Pattern.js`)
```js
{
  name, slug, description, type, category, icon,
  content: { nodes: [...], html, settings },  // nodes = serialized widget tree
  previewImage, tags, keywords,
  mode: 'snapshot' | 'global',
  overrides: [{ key, field, label }],
  author, status, visibility, isLocked, usageCount,
  version, history: [{ version, content, savedAt, savedBy }],
  plugin, metadata, schemaVersion, timestamps
}
// Statics: findActive(), findGlobal(), incrementUsage(), search()
// Methods: toPublic(), duplicate(), snapshotVersion()
```

### 1.3 Post Model (`src/models/mongo/Post.js`)
```js
{
  title, slug, content: { json, html, raw, conditionalJS },
  customCSS, excerpt, author, categories[], tags[],
  status: 'draft' | 'scheduled' | 'published' | 'archived' | 'trashed',
  publishDate, publishAt, featuredImage, featuredImageAlt,
  metaTitle, metaDescription, focusKeyword, keywords[],
  canonicalUrl, ogTitle, ogDescription, ogImage,
  seoReport: { score, scoreParts, suggestions, wordCount },
  isPillarContent, pillarParent, allowComments,
  noIndex, noFollow, views, likes, readingTime,
  timestamps
}
// Auto-creates Revision snapshot on every save (max 10)
```

### 1.4 Page Model (`src/models/mongo/Page.js`)
```js
{
  title, slug, content: { json, html, raw, conditionalJS },
  customCSS, excerpt, status, template, parent, order,
  showInMenu, featuredImage, timestamps
}
```

### 1.5 Revision Model (`src/models/mongo/Revision.js`)
```js
{
  documentId, documentType, content, title, status,
  revisionNumber, createdBy, timestamps
}
```

### 1.6 ContentSchema (`src/models/mongo/shared/contentSchema.js`)
```js
{
  json,      // Alpha document JSON (source of truth)
  html,      // Pre-rendered HTML
  raw,       // Plain extracted text
  conditionalJS  // Condition rule tree
}
```

---

## 2. BACKEND TO IMPLEMENT

### 2.1 Widget Routes (`src/routes/widgetRoutes.js`)
Must follow `*Routes.js` convention for auto-discovery.

```js
// GET    /acr/api/widgets              → list all widgets (filter by type, category, status)
// GET    /acr/api/widgets/:id          → get single widget
// POST   /acr/api/widgets              → create widget
// PUT    /acr/api/widgets/:id          → update widget
// DELETE /acr/api/widgets/:id          → delete widget
// POST   /acr/api/widgets/:id/duplicate → duplicate widget
// GET    /acr/api/widgets/search?q=    → search widgets
// GET    /acr/api/widgets/active       → list active widgets only
// POST   /acr/api/widgets/:id/usage    → increment usage count
```

### 2.2 Widget Controller (`src/controllers/widgetController.js`)
- `getWidgets(req, res)` — List with pagination, filtering by type/category/status
- `getWidget(req, res)` — Single by ID
- `createWidget(req, res)` — Create from body (validate required fields)
- `updateWidget(req, res)` — Update by ID
- `deleteWidget(req, res)` — Delete by ID
- `duplicateWidget(req, res)` — Use model's `duplicate()` method
- `searchWidgets(req, res)` — Use model's `search()` method
- `incrementUsage(req, res)` — Use model's `incrementUsage()` method

### 2.3 Pattern Routes (`src/routes/patternRoutes.js`)
```js
// GET    /acr/api/patterns              → list all patterns
// GET    /acr/api/patterns/:id          → get single pattern
// POST   /acr/api/patterns              → create pattern
// PUT    /acr/api/patterns/:id          → update pattern
// DELETE /acr/api/patterns/:id          → delete pattern
// POST   /acr/api/patterns/:id/duplicate → duplicate pattern
// POST   /acr/api/patterns/:id/snapshot  → snapshot version
// GET    /acr/api/patterns/search?q=    → search patterns
// GET    /acr/api/patterns/active       → list active patterns
// POST   /acr/api/patterns/from-selection → create from selected widgets
```

### 2.4 Pattern Controller (`src/controllers/patternController.js`)
- `getPatterns`, `getPattern`, `createPattern`, `updatePattern`, `deletePattern`
- `duplicatePattern` — Use model's `duplicate()`
- `snapshotVersion` — Use model's `snapshotVersion()`
- `searchPatterns` — Use model's `search()`
- `createFromSelection` — Accept widget tree from editor, serialize to pattern

### 2.5 Revision Routes (extend `cmsRoutes.js` or new `revisionRoutes.js`)
```js
// GET    /acr/api/posts/:id/revisions        → list revisions for post
// GET    /acr/api/posts/:id/revisions/:num   → get specific revision
// POST   /acr/api/posts/:id/revisions/:num/restore → restore revision
// GET    /acr/api/posts/:id/revisions/compare → compare two revisions
```

### 2.6 Revision Controller
- `getRevisions(req, res)` — List revisions for document
- `getRevision(req, res)` — Get specific revision
- `restoreRevision(req, res)` — Restore post/page to revision state
- `compareRevisions(req, res)` — Return diff between two revisions

### 2.7 Extend CMS Controller for Editor Save
Add to `cmsController.js`:
- `saveEditorContent(req, res)` — Save full editor JSON content to post/page
- `loadEditorContent(req, res)` — Load post/page with full JSON content for editor
- `getEditorData(req, res)` — Return post + widgets + patterns + SEO in single response

---

## 3. LAYOUT ENGINE UPDATES

### 3.1 Update `src/layouts/framework/dataLoader.js`
Must handle JSON content format from editor:

```js
// In getPostData() and getPageData():
// - Parse content.json if it's a string
// - Pass json content to template for rendering
// - Include content.html as pre-rendered fallback

async getPostData(slug) {
  const post = await this.getPostBySlug(slug);
  if (!post) return null;
  
  // Parse JSON content from editor
  let jsonContent = null;
  try {
    jsonContent = typeof post.content?.json === 'string' 
      ? JSON.parse(post.content.json) 
      : post.content?.json;
  } catch (e) {
    jsonContent = null;
  }
  
  return {
    page_title: post.title,
    post: this.formatPostForTemplate(post),
    // Editor-specific data
    editorContent: jsonContent,
    contentHtml: post.content?.html || '',
    contentRaw: post.content?.raw || '',
    seo: {
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      focusKeyword: post.focusKeyword,
      canonicalUrl: post.canonicalUrl,
      ogTitle: post.ogTitle,
      ogDescription: post.ogDescription,
      ogImage: post.ogImage,
      noIndex: post.noIndex,
      noFollow: post.noFollow,
    }
  };
}
```

### 3.2 Update `src/layouts/framework/layoutEngine.js`
- Pass `editorContent` to render context
- Handle JSON-based widget rendering in templates
- Support widget JSON → HTML conversion for frontend display

### 3.3 Template Updates (`src/layouts/*/acrx/post.js`, `page.js`)
Each layout's post/page templates must:
- Check for `editorContent` (JSON) first
- Fall back to `contentHtml` (pre-rendered)
- Fall back to `contentRaw` (plain text)
- Render widget tree from JSON if available

---

## 4. FRONTEND EDITOR ARCHITECTURE

### 4.1 File Structure
```
acrx/assets/js/editor/
├── app/
│   ├── index.js                    ← Entry point, exports createEditorApp()
│   ├── EditorController.js         ← Central orchestrator
│   ├── EditorState.js              ← State management with pub/sub
│   ├── SelectionController.js      ← Canonical selection state
│   ├── InspectorController.js      ← Schema-driven inspector
│   ├── WidgetRegistry.js           ← Widget definitions (fetches from DB)
│   ├── CommandRegistry.js          ← Command system
│   ├── PatternRegistry.js          ← Pattern definitions (fetches from DB)
│   ├── panels/
│   │   ├── LayersPanel.js          ← Tree view of document structure
│   │   ├── BreadcrumbsPanel.js     ← Selection path breadcrumbs
│   │   ├── CommandPalette.js       ← ⌘K command palette
│   │   ├── SlashMenu.js            ← / triggered insertion
│   │   ├── PostSettingsPanel.js    ← Post metadata panel
│   │   ├── SEOPanel.js             ← SEO settings + analysis
│   │   └── BlockInspectorPanel.js  ← Block-specific settings
│   └── services/
│       ├── Autosave.js             ← Debounced autosave
│       ├── MediaIntegration.js     ← Media picker integration
│       └── AIIntegration.js        ← AI content operations
```

### 4.2 Widget Registry (DB-Backed)
```js
// WidgetRegistry.js must:
// 1. On init, fetch widgets from /acr/api/widgets/active
// 2. Cache locally for performance
// 3. Provide get(), search(), byCategory(), createDefaultNode()
// 4. Widget type definitions include:
//    - type, category, label, icon, description, keywords
//    - schema (attribute definitions)
//    - inspector (which sections to show)
//    - allowedParents, allowedChildren
//    - capabilities (editable, container, media, etc.)
//    - defaults (default attribute values)

// Built-in widget types (must match DB widget slugs):
const BUILTIN_TYPES = [
  'paragraph', 'heading', 'blockquote', 'code-block',
  'ordered-list', 'unordered-list',
  'image', 'video', 'gallery', 'audio',
  'button', 'divider', 'spacer',
  'container', 'grid', 'columns',
  'card', 'hero', 'cta', 'faq', 'pricing',
  'embed', 'alert', 'table', 'icon',
  'accordion', 'tabs',
  'author', 'latest-posts', 'search-form'
];
```

### 4.3 Pattern Registry (DB-Backed)
```js
// PatternRegistry.js must:
// 1. On init, fetch patterns from /acr/api/patterns/active
// 2. Cache locally
// 3. Provide get(), search(), insert(), createFromSelection()
// 4. Pattern insertion:
//    - Fetch pattern by ID
//    - Clone content.nodes tree
//    - Generate new IDs for all nodes
//    - Insert at cursor position
```

### 4.4 Editor State Model
```js
{
  document: {                          // The editor document
    type: 'doc',
    content: [                         // Array of widget nodes
      {
        id: 'wdg_...',                 // Unique ID
        type: 'heading',               // Widget type
        attributes: { level: 2, content: '...' },
        style: {},                     // Inline styles
        responsive: { desktop: {}, tablet: {}, mobile: {} },
        visibility: {},                // Per-device visibility
        children: []                   // For container widgets
      }
    ]
  },
  postId: null,                        // DB post/page ID
  postType: 'post',                    // 'post' | 'page'
  postMeta: {                          // Post-level metadata
    title, slug, status, author, publishDate,
    modifiedDate, categories, tags, template,
    featuredImage, featuredImageAlt, excerpt,
    allowComments, parent, order, showInMenu
  },
  seo: {                               // SEO metadata
    metaTitle, metaDescription, focusKeyword,
    keywords, canonicalUrl, noIndex, noFollow,
    ogTitle, ogDescription, ogImage
  },
  ui: {                                // UI-only state (NOT serialized)
    activeLeftSidebar, activeRightSidebar,
    activeLeftPanel, activeRightPanel,
    selectedNodeId, expandedTreeNodes,
    commandPaletteOpen, slashMenuOpen,
    previewMode, devicePreview, zoom
  },
  persistence: {                       // Save state
    dirty, saving, lastSaved, saveError, autosaveEnabled
  }
}
```

### 4.5 Document JSON Format (Canonical)
```json
{
  "type": "doc",
  "content": [
    {
      "id": "wdg_82f3a1b2",
      "type": "heading",
      "attributes": { "level": 2, "content": "Hello World" },
      "style": { "textAlign": "center" },
      "responsive": {
        "desktop": { "fontSize": "2em" },
        "tablet": { "fontSize": "1.5em" },
        "mobile": { "fontSize": "1.25em" }
      },
      "visibility": { "desktop": true, "tablet": true, "mobile": true }
    },
    {
      "id": "wdg_93c4b2c3",
      "type": "paragraph",
      "attributes": { "content": "This is a paragraph." },
      "style": {},
      "responsive": {},
      "visibility": {}
    },
    {
      "id": "wdg_04d5c3d4",
      "type": "container",
      "attributes": { "maxWidth": 1200, "padding": 20 },
      "style": { "backgroundColor": "#f5f5f5" },
      "responsive": {},
      "visibility": {},
      "children": [
        {
          "id": "wdg_15e6d4e5",
          "type": "heading",
          "attributes": { "level": 3, "content": "Nested heading" },
          "style": {},
          "responsive": {},
          "visibility": {}
        }
      ]
    }
  ]
}
```

---

## 5. UI COMPONENT SPECIFICATIONS

### 5.1 Styling Rules (MUST FOLLOW)

**CRITICAL: All new UI elements MUST follow existing design patterns.**

#### Colors:
- Use CSS variables only — never hardcode colors
- Primary: `var(--color-primary-100)` through `var(--color-primary-1000)`
- Accent: `var(--accent-200)`, `var(--accent-300)`, `var(--accent-500)`
- Text: `var(--text-color)`
- Muted text: `var(--muted)`
- Icon color: `var(--ic)` or `var(--accent-500)`
- Backgrounds: `color-mix(var(--color-primary-100), var(--color-primary-200))` or `var(--color-primary-200-a40)`

#### Spacing:
- Gap between elements: `3px` to `10px`
- Padding: `5px` to `20px`
- Border radius: `5px` to `30px` (commonly `8px`, `10px`, `12px`, `20px`)

#### Typography:
- Font family: `'Outfit'` (already loaded)
- Sizes: `10px` (badges), `11px` (labels), `12px` (small text), `13px` (body), `14px` (headings)
- Font weight: `400` (normal), `500` (medium), `600` (semibold), `700` (bold)

#### Animations:
- Default: `all 0.3s var(--ease-spring)`
- Sidebar: `all 0.5s var(--ease-water)`
- Use CSS transitions, not JS animations

#### Glass Morphism (for floating panels):
```css
.floating-panel {
  background: color-mix(var(--color-primary-100), var(--color-primary-200-a50));
  border: 1px solid var(--color-primary-300);
  border-radius: 20px;
  backdrop-filter: blur(15px);
}
```

#### Tooltips (use existing pattern from `ad-ed.css`):
```css
.btn[data-title]::before {
  content: attr(data-title);
  position: fixed;
  position-anchor: --tooltip-anchor;
  top: anchor(bottom);
  left: anchor(center);
  translate: -50% 8px;
  padding: 6px 10px;
  background: var(--color-primary-200);
  border: 1px solid var(--accent-200);
  border-radius: 6px;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s var(--ease-spring);
}
.btn[data-title]:hover::before {
  opacity: 1;
  visibility: visible;
}
```

### 5.2 Header Components

#### Back Button (`#editor-back-btn`)
- Icon: `fa-angle-left`
- Click → history.back() (with dirty check)
- Tooltip: "Back"
- Keyboard: Esc (when no modal open)

#### Left Sidebar Toggle (`#editor-left-sidebar-toggle`)
- Icon: `fa-sidebar`
- Click → toggle `ui.activeLeftSidebar`
- Body class: `sdb-left` when open
- Keyboard: `Ctrl + \`

#### Autosave Toggle (`#editor-autosave-toggle`)
- Toggle component (use existing `.toggle-field.form-toggle` pattern)
- On by default
- When On: autosave every 8s if dirty + on blur + on tab switch
- Visual status in footer

#### Command Palette (`#editor-cmdk`)
- Trigger: Click on input or `Ctrl+K` / `⌘K`
- Opens centered dropdown with search
- Fuzzy search across: commands, widgets, patterns, blocks, SEO actions
- Arrow keys navigate, Enter executes, Esc closes
- Recent commands at top
- Categories with labels
- Keyboard shortcuts shown next to items

#### Save Dropdown (`#editor-save-dropdown`)
- Split button: main = "Save", dropdown = options
- Dropdown items: Save as Draft, Publish, Schedule
- Keyboard: `Ctrl+S`
- Shows saving spinner + success/error state

#### Right Sidebar Toggle (`#editor-right-sidebar-toggle`)
- Icon: `fa-sidebar-flip`
- Click → toggle `ui.activeRightSidebar`
- Body class: `sdb-right` when open

#### More Actions (`#editor-more-actions`)
- Icon: `fa-ellipsis`
- Dropdown menu:
  - Preview (desktop/tablet/mobile)
  - Export (HTML, JSON, Markdown)
  - Import
  - Version History
  - Duplicate
  - View on Frontend
  - Keyboard Shortcuts
  - Editor Settings

### 5.3 Left Sidebar

#### Tabs
- Layers (default), Widgets, Patterns
- Active tab: `anchor-name: --active-Ltab`
- Animated underline indicator (use existing `.sidebar-tabs::after` pattern)
- Keyboard: `Ctrl+1/2/3`

#### Layers Panel
- Hierarchical tree of all blocks
- Root node (always exists, cannot be deleted)
- Each node shows: icon, type label, content snippet, lock/eye icons
- Expand/collapse chevron
- Drag handle for reordering
- Click → select block on canvas
- Right-click context menu:
  - Select, Duplicate, Delete, Lock/Unlock, Hide/Show, Rename, Copy, Paste, Move to top/bottom, Convert to...
- Multi-select with Ctrl/Cmd or Shift
- Keyboard navigation: arrows, Enter, Delete
- Collapse All / Expand All buttons
- Filter by type

#### Widgets Panel
- Search with fuzzy matching
- Categories: Text, Media, Layout, Interactive, Dynamic, Advanced
- Widget cards: icon + name + description
- Drag to canvas or click to insert
- Recently used section
- Favorites (star icon)

#### Patterns Panel
- Search + tags
- Preview on hover
- Insert / Insert & Edit
- "Save Selection as Pattern" button
- Categories + folders

### 5.4 Toolbar + Block Actions

#### Floating Toolbar (text selection)
- Bold, Italic, Strikethrough, Underline, Inline Code
- Text color + highlight color pickers
- Link button (opens popover)
- Clear formatting
- Active states for current formatting
- Positioned above selection, flips if near viewport top

#### Block Actions Bar
- Transform dropdown (convert block type)
- Settings (opens Block inspector)
- Hide/Show (per device)
- Lock/Unlock
- Duplicate, Delete
- Move Up/Down
- More (⋯): Copy, Cut, Paste, Group, Create Pattern, Edit as HTML

### 5.5 Slash Menu
- Trigger: type `/` at start of empty paragraph
- Appears under cursor
- Live filter as you type
- Categories + icons
- Keyboard: ↑↓ navigate, Enter insert, Esc close
- Recent items at top
- "Browse all widgets" at bottom
- Inserts block and places cursor correctly

### 5.6 Canvas

#### Block Structure
- Every block has: unique ID, type, depth, index
- Nested structure (unlimited depth)
- `contenteditable` only on text-capable blocks
- Non-text blocks are NOT contenteditable

#### Selection System
- Single click selects block
- Double click enters text editing mode
- Triple click selects whole block content
- Click outside deselects
- Multi-select with mouse drag or Ctrl/Cmd
- "Blue ring" for primary selection

#### Drag & Drop
- Drag from handle or from layers
- Live preview of drop position (blue line)
- Can drop before, after, or inside containers
- Auto-scroll when dragging near edges
- Visual ghost of dragged block

#### Keyboard Editing
- Arrow keys move between blocks
- Enter creates new paragraph
- Shift+Enter soft break
- Backspace at start merges with previous
- Delete at end merges with next
- Tab/Shift+Tab for list indentation
- Ctrl+A: first time selects block content, second time selects whole page

#### Empty States
- Empty canvas: "Start typing or press /"
- Empty text blocks: placeholder text
- "Add first block" floating button when completely empty

### 5.7 Right Sidebar

#### Post Tab
- Title (live updates document title)
- Status dropdown (Draft/Pending/Private/Published/Scheduled)
- Visibility (Public/Private/Password)
- Publish date & time
- Featured Image (upload + focal point + remove)
- Excerpt (character counter)
- Categories (multi-select + create new)
- Tags (token input)
- Author (dropdown + search)
- Template selector
- Discussion settings (comments open/closed)
- Custom fields

#### SEO Tab
- Focus keyphrase
- SEO Title (with snippet preview)
- Meta Description (with character counter + snippet)
- Slug editor (live URL preview)
- Canonical URL
- Robots (index/noindex, follow/nofollow)
- Social cards (Facebook + Twitter/X preview with image upload)
- Readability score + suggestions
- Schema type selector + properties

#### Block Tab (Dynamic)
- Shows only when block is selected
- Common: Spacing, Sizing, Colors, Typography, Border, Shadow, Visibility, Animation, Advanced
- Block-specific controls (e.g., Image: source, alt, size, link)
- "Reset to default" button
- "Copy styles" / "Paste styles"

### 5.8 Footer
- Breadcrumbs: clickable path from Root → current block
- Status: Saved / Saving… / Unsaved / Conflict / Offline
- Word count + character count
- Zoom level indicator + controls
- Collaboration presence (avatars)

---

## 6. WIDGET TYPE SPECIFICATIONS

### 6.1 Text Widgets (RTE Allowed)
| Widget | Attributes | Inspector Sections |
|--------|-----------|-------------------|
| paragraph | content | content, typography, spacing, responsive |
| heading | level (1-6), content | content, typography, spacing, responsive |
| blockquote | content | content, typography, spacing, appearance |
| code-block | content, language | content, appearance |
| ordered-list | items[] | content, typography, spacing |
| unordered-list | items[] | content, typography, spacing |

### 6.2 Media Widgets (No RTE)
| Widget | Attributes | Inspector Sections |
|--------|-----------|-------------------|
| image | src, alt, caption, link, width, height, objectFit | content, layout, spacing, responsive |
| video | src, poster, autoplay, controls | content, layout, spacing |
| gallery | images[], columns, gap | content, layout, spacing |
| audio | src, title, autoplay | content, layout |
| embed | url, width, height, type | content, layout |

### 6.3 Layout Widgets (No RTE, Container)
| Widget | Attributes | Inspector Sections |
|--------|-----------|-------------------|
| container | maxWidth, padding, background, gap | layout, spacing, appearance, background, responsive |
| grid | columns, rows, gap, rowGap, alignItems | layout, spacing, responsive |
| columns | columns, gap, widths[], stackOnMobile | layout, spacing, responsive |
| divider | style, thickness, color, width | appearance, spacing |
| spacer | height | layout, responsive |

### 6.4 Content Widgets (Mixed)
| Widget | Attributes | Inspector Sections |
|--------|-----------|-------------------|
| card | title, description, image, link, imagePosition | content, layout, spacing, appearance, border |
| hero | title, subtitle, buttonText, buttonUrl, background, height, overlay | content, layout, spacing, appearance, background, responsive |
| cta | title, description, buttonText, buttonUrl, background | content, layout, spacing, appearance |
| faq | items[], allowMultiple | content, spacing, appearance |
| pricing | plans[], columns | content, layout, spacing, appearance |
| alert | content, style, dismissible | content, appearance, spacing |
| table | rows, columns, header, footer, striped | content, layout, appearance, spacing |

### 6.5 Interactive Widgets (No RTE)
| Widget | Attributes | Inspector Sections |
|--------|-----------|-------------------|
| button | label, url, style, size, target | content, layout, typography, appearance, spacing |
| accordion | items[], allowMultiple | content, spacing, appearance |
| tabs | tabs[], style | content, spacing, appearance |
| search-form | placeholder, buttonText, fullWidth | content, layout, appearance |

### 6.6 Dynamic Widgets (No RTE, Resolved at Render)
| Widget | Attributes | Inspector Sections |
|--------|-----------|-------------------|
| author | showAvatar, showBio, showSocial | layout, spacing, appearance |
| latest-posts | source, limit, sort, category, columns, showImage, showExcerpt, showDate | content, layout, spacing, responsive |

---

## 7. KEYBOARD SHORTCUTS

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Open command palette |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + Shift + D` | Duplicate block |
| `Ctrl/Cmd + Shift + ↑` | Move block up |
| `Ctrl/Cmd + Shift + ↓` | Move block down |
| `Ctrl/Cmd + \` | Toggle left sidebar |
| `Ctrl/Cmd + Shift + \` | Toggle right sidebar |
| `Ctrl/Cmd + 1/2/3` | Switch left sidebar tabs |
| `/` | Open slash menu (at block start) |
| `Esc` | Close modal/menu or go back |
| `Enter` | Create new paragraph |
| `Shift + Enter` | Soft line break |
| `Backspace` (at start) | Merge with previous block |
| `Delete` (at end) | Merge with next block |
| `Ctrl + A` | Select block content (first), select all (second) |

---

## 8. API INTEGRATION POINTS

### 8.1 Widget API
```
GET    /acr/api/widgets/active          → Widget[]  (for widget library)
GET    /acr/api/widgets/:id             → Widget    (single widget)
POST   /acr/api/widgets                 → Widget    (create)
PUT    /acr/api/widgets/:id             → Widget    (update)
DELETE /acr/api/widgets/:id             → void      (delete)
```

### 8.2 Pattern API
```
GET    /acr/api/patterns/active         → Pattern[] (for pattern library)
GET    /acr/api/patterns/:id            → Pattern   (single pattern)
POST   /acr/api/patterns                → Pattern   (create)
PUT    /acr/api/patterns/:id            → Pattern   (update)
DELETE /acr/api/patterns/:id            → void      (delete)
POST   /acr/api/patterns/from-selection → Pattern   (create from editor selection)
```

### 8.3 Post/Page API (Existing — Extend)
```
GET    /acr/api/posts/:id               → Post      (with full editor JSON)
PUT    /acr/api/posts/:id               → Post      (save with JSON content)
POST   /acr/api/posts                   → Post      (create with JSON content)
GET    /acr/api/posts/:id/revisions     → Revision[]
POST   /acr/api/posts/:id/revisions/:num/restore → Post
```

### 8.4 SEO API (Existing)
```
POST   /acr/api/seo/analyze             → { score, suggestions, wordCount }
```

### 8.5 Media API (Existing)
```
GET    /acr/api/media/files             → File[]
POST   /acr/api/media/upload            → File
POST   /acr/api/media/rename-file       → void
POST   /acr/api/media/delete-file       → void
```

### 8.6 AI API (Existing)
```
POST   /acr/api/ai/content/transform    → { text }
POST   /acr/api/ai/content/heading      → { headings[] }
POST   /acr/api/ai/content/excerpt      → { text }
POST   /acr/api/ai/content/seo-title    → { text }
POST   /acr/api/ai/content/meta-description → { text }
POST   /acr/api/ai/content/keywords     → { keywords[], focusKeyword }
POST   /acr/api/ai/content/alt-text     → { text }
```

---

## 9. IMPLEMENTATION ORDER

1. **Backend first:**
   - Widget routes + controller
   - Pattern routes + controller
   - Revision routes + controller
   - Extend CMS controller for editor save/load

2. **Layout Engine:**
   - Update `dataLoader.js` for JSON content
   - Update `layoutEngine.js` for widget rendering
   - Update templates to render widget JSON

3. **Frontend Core:**
   - `EditorState.js` — State management
   - `SelectionController.js` — Selection management
   - `WidgetRegistry.js` — Fetch from DB
   - `PatternRegistry.js` — Fetch from DB
   - `CommandRegistry.js` — Command system
   - `InspectorController.js` — Schema-driven inspector

4. **Frontend Panels:**
   - `LayersPanel.js`
   - `BreadcrumbsPanel.js`
   - `CommandPalette.js`
   - `SlashMenu.js`
   - `PostSettingsPanel.js`
   - `SEOPanel.js`
   - `BlockInspectorPanel.js`

5. **Frontend Services:**
   - `Autosave.js`
   - `MediaIntegration.js`
   - `AIIntegration.js`

6. **Editor Controller:**
   - `EditorController.js` — Wire everything together
   - `index.js` — Entry point

7. **Styling:**
   - `editor-polish.css`
   - `editor-panels.css`
   - Ensure all new elements follow existing design patterns

---

## 10. CRITICAL RULES

1. **NEVER redesign existing UI** — Follow existing CSS patterns, variables, and component structures
2. **NEVER hardcode colors** — Always use CSS variables
3. **NEVER duplicate existing systems** — Check if something exists before creating it
4. **ALWAYS use existing DB models** — Widget, Pattern, Post, Page, Revision models already exist
5. **ALWAYS follow naming conventions** — `*Routes.js`, `buildModel()`, `meta` exports
6. **ALWAYS use framework.js** — For HTML generation (`el()`, `div()`, `icon()`, `Input()`, etc.)
7. **ALWAYS use Font Awesome** — No custom icon libraries
8. **ALWAYS follow accessibility** — ARIA labels, keyboard navigation, focus management
9. **NEVER serialize UI state** — Only document content + post metadata + SEO goes to DB
10. **ALWAYS use ES modules** — `import`/`export` for frontend, `require`/`module.exports` for backend

---

## 11. EXISTING FILES TO REUSE

- `acrx/assets/js/components/mediaPicker.js` — Media picker (already functional)
- `acrx/assets/js/framework.js` — HTML element builders (`el`, `div`, `icon`, `Input`, `Toggle`, etc.)
- `acrx/assets/js/editor/src/` — Headless editor engine (text editing, transactions, history)
- `src/views/lib/framework.js` — Server-side HTML builders
- `acrx/assets/css/ad-ed.css` — Editor styles (already defined)
- `acrx/assets/css/root.css` — CSS variables and design system
- `acrx/assets/css/ad-st.css` — Admin styles (reference only — DO NOT copy section/field patterns from here, only dropdowns)
- `src/models/mongo/Widget.js` — Widget model (use for widget CRUD)
- `src/models/mongo/Pattern.js` — Pattern model (use for pattern CRUD)
- `src/models/mongo/Post.js` — Post model (extend for editor content)
- `src/models/mongo/Revision.js` — Revision model (use for version history)
- `src/controllers/cmsController.js` — CMS controller (extend for editor save/load)
- `src/controllers/aiController.js` — AI controller (reuse `callAI`, `getAISettings`)
- `src/controllers/mediaController.js` — Media controller (reuse upload/list/delete)
- `src/core/connect-db.js` — DB connection (use `getConnection()`)
- `src/middlewares/authMiddleware.js` — Auth (use `verifyAPIToken`, `requireRoles`)

---

## 12. ACCEPTANCE CRITERIA

The implementation is successful when:

- [ ] Widget library loads from DB (not hardcoded)
- [ ] Pattern library loads from DB (not hardcoded)
- [ ] Layers panel shows actual document tree from state
- [ ] Inspector shows correct controls for selected widget type
- [ ] Inspector changes update widget in state
- [ ] Widget Library inserts real widgets
- [ ] Slash commands insert real widgets
- [ ] Command Palette invokes real commands
- [ ] Containers/Grids/Columns work with nesting
- [ ] Moving, duplication, deletion work
- [ ] Responsive settings work per widget
- [ ] Post settings save to DB
- [ ] SEO panel works with analysis
- [ ] AI actions work with correct scopes
- [ ] Media integrates with existing picker
- [ ] Autosave works
- [ ] Publishing uses existing backend
- [ ] Undo/redo works
- [ ] Document state is serializable to JSON
- [ ] UI state is NOT serialized
- [ ] No duplicate Acroxa systems introduced
- [ ] No existing design unnecessarily replaced
- [ ] All new UI follows existing CSS patterns
- [ ] All keyboard shortcuts work
- [ ] All API endpoints follow REST conventions
- [ ] All DB operations use existing models
- [ ] Revision history works (list, restore, compare)
- [ ] Layout engine renders JSON content correctly
