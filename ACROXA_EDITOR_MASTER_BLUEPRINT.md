# ACROXA EDITOR — MASTER ARCHITECTURE & IMPLEMENTATION BLUEPRINT

---

## 1. EXECUTIVE SUMMARY

Acroxa is a Node.js CMS with dual-database support (Sequelize/Mongoose), server-side HTML rendering, and a frontend editor shell. The editor currently has a **fully rendered HTML shell** with header, left sidebar (Layers/Widgets/Patterns tabs), main canvas, right sidebar (Post/SEO/Block tabs), toolbar, slash menu, block actions, and footer. The client-side editor JavaScript (`acrx/assets/js/editor.js`) is only **42 lines** — implementing sidebar toggles and tab switching. **All actual editor runtime logic is missing**: no block editing, no selection engine, no command system, no persistence, no layers sync, no inspector, no keyboard handling, no drag/drop, no undo/redo.

**Backend infrastructure is solid**: Content model (`json`/`html`/`raw`/`conditionalJS`), editor save/load APIs, revision system, media system with picker component, widget/pattern models, SEO analysis, and a reactive state engine (`state.js`) are all implemented and functional.

**Target**: A professional block-based content editor (similar to Gutenberg/Elementor) with full block editing, selection, commands, inspector, layers, patterns, media integration, responsive editing, and persistence.

---

## 2. REPOSITORY EXPLORATION METHOD

### 2.1 Repository Structure (Key Paths)

```
Acroxa/
├── src/                              # Backend (Node.js/Express)
│   ├── controllers/
│   │   ├── cmsController.js          # Posts, Pages, Categories, Editor save/load, SEO
│   │   ├── mediaController.js        # Upload, list, rename, delete, thumbnails
│   │   └── widgetController.js       # Widget CRUD
│   ├── models/
│   │   ├── sql/
│   │   │   ├── Post.js               # Post model (SQL)
│   │   │   ├── Page.js               # Page model (SQL)
│   │   │   ├── Widget.js             # Widget model (SQL)
│   │   │   ├── Pattern.js            # Pattern model (SQL)
│   │   │   ├── Revision.js           # Revision snapshots
│   │   │   └── shared/contentSchema.js  # { json, html, raw, conditionalJS }
│   │   └── mongo/                    # Same models for MongoDB
│   ├── views/
│   │   ├── editor.js                 # Server-rendered editor HTML shell
│   │   ├── lib/framework.js          # HTML generation (el, div, icon, Toggle, etc.)
│   │   └── posts.js                  # Posts list page
│   ├── routes/
│   │   ├── cmsRoutes.js              # /acr/api/editor/:id/{data,content}
│   │   └── pages.js                  # Auto-discovered page routes
│   └── migrate.js                    # Route migration (defines /acrx/editor)
├── acrx/assets/
│   ├── js/
│   │   ├── editor.js                 # Client editor init (42 lines — SIDEBAR ONLY)
│   │   ├── main.js                   # Global app init, search, sidebar scroller
│   │   ├── layout-editor.js          # Monaco code editor (COMPLETE)
│   │   ├── utils/
│   │   │   ├── state.js              # Reactive state engine (238 lines)
│   │   │   └── stateHelpers.js       # Sidebar/tab UI behavior (172 lines)
│   │   ├── components/
│   │   │   └── mediaPicker.js        # Full media picker component
│   │   ├── system/                   # Settings page scripts
│   │   ├── menus/                    # Menu manager modules
│   │   ├── posts.js                  # Posts list client JS
│   │   └── media.js                  # Media library client JS
│   └── css/
│       ├── ad-ed.css                 # Editor styles
│       ├── ad-st.css                 # System/settings styles
│       └── ad-layout-editor.css      # Layout editor styles
└── config/
    └── generated-paths.js            # Path configuration
```

---

## 3. EXISTING ARCHITECTURE

### 3.1 Application Layer

```
Application Startup
    ↓
Express Server + DB Connection (Sequelize OR Mongoose)
    ↓
Route Discovery (src/views/*.js → module.exports.meta)
    ↓
Auth Middleware (verifyAPIToken, requireRoles, attachAuthScript)
    ↓
Page Renderer (renderLayout → renderHeader + renderSidebar + renderContent + renderFooter)
    ↓
Client-Side Scripts (editor.js, main.js, etc.)
```

**Entry Point**: Express server loads all views from `src/views/`, each view exports `meta` with path/render/css/js. Routes are auto-registered in `src/routes/pages.js`.

### 3.2 Editor Shell (Server-Rendered)

**File**: `src/views/editor.js` — `renderEditor()` function

The editor shell is a complete HTML structure rendered server-side:

```
acrx-editor
├── acrx-editor-header
│   ├── LEFT: back-btn, left-sidebar-toggle, autosave-toggle
│   ├── CENTER: command-palette (⌘K search input + dropdown)
│   └── RIGHT: save-dropdown (Save/Publish/Schedule), right-sidebar-toggle, more-actions
├── acrx-editor-body
│   ├── command-palette (overlay)
│   ├── LEFT SIDEBAR
│   │   ├── Tabs: Layers | Widgets | Patterns
│   │   ├── Panel: layers-tree (hardcoded root → child → grandchild)
│   │   ├── Panel: widgets (EMPTY)
│   │   └── Panel: patterns (EMPTY)
│   ├── MAIN
│   │   ├── Toolbar (format/alignment/advanced groups)
│   │   ├── Block Actions (transform, settings, hide, lock, duplicate, delete, move)
│   │   ├── Slash Menu (16 items, hidden)
│   │   └── Canvas
│   │       ├── canvas-main-input (contentEditable, placeholder)
│   │       └── block-wrap-t_1 (hardcoded demo block)
│   │           ├── block handle + checkbox
│   │           └── block (data-block-id="t-1")
│   │               ├── child text block (contentEditable)
│   │               ├── child ordered list (2 items)
│   │               └── child heading
│   └── RIGHT SIDEBAR
│       ├── Tabs: Post | SEO | Block
│       ├── Panel: post (EMPTY)
│       ├── Panel: seo (EMPTY, active by default)
│       └── Panel: block/settings (EMPTY)
└── FOOTER
    ├── breadcrumbs (Root > Text Block > Paragraph > List)
    ├── center (save-status, stats, copyright)
    └── right (save status, line/col numbers)
```

### 3.3 Client-Side Editor (Currently)

**File**: `acrx/assets/js/editor.js` — 42 lines

```javascript
Mini.ready(() => {
    // Left Sidebar toggle
    Mini.clickToggle("#editor-left-sidebar-toggle", ".acrx-editor-body", "sdb-left");
    // Right Sidebar toggle
    Mini.clickToggle("#editor-right-sidebar-toggle", ".acrx-editor-body", "sdb-right");
    // Tab switching for both sidebars
    initSidebarTabs("#editor-left-sidebar");
    initSidebarTabs("#editor-right-sidebar");
});
```

**What exists**: Sidebar open/close, tab switching.
**What's missing**: Everything else — editing, selection, commands, persistence, layers, inspector, keyboard, drag/drop, undo/redo.

### 3.4 Reactive State Engine

**File**: `acrx/assets/js/utils/state.js` — 238 lines

A pure, UI-agnostic reactive state engine:
- `State.create(name, initialState)` — Create named store
- `State.get(name)` — Get store copy
- `State.value(path)` — Read dot-path value
- `State.set(path, value)` — Set value, notify watchers
- `State.patch(name, values)` — Shallow merge
- `State.watch(path, callback)` — Subscribe to changes
- `State.batch(fn)` — Batch updates

**Status**: IMPLEMENTED, ready to use for editor state management.

### 3.5 Content Data Model

```javascript
// ContentSchema (src/models/sql/shared/contentSchema.js)
{
  json: { ... },          // Alpha document JSON (source of truth)
  html: "",               // Rendered HTML derived from json
  raw: "",                // Plain extracted text
  conditionalJS: { ... }  // Structured conditional rule tree (NOT executable)
}
```

### 3.6 Editor API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/acr/api/editor/:id/data` | GET | Full editor data (document + widgets + patterns + SEO) |
| `/acr/api/editor/:id/content` | GET | Load editor content only |
| `/acr/api/editor/:id/content` | POST | Save editor content (with revision) |
| `/acr/api/media/upload` | POST | Upload files |
| `/acr/api/media/files` | GET | List media |
| `/acr/api/posts` | CRUD | Post management |
| `/acr/api/categories` | CRUD | Category management |

---

## 4. EXISTING BLOCKS / WIDGETS

### 4.1 Slash Menu Items (defined in src/views/editor.js)

```javascript
SLASH_ITEMS = [
  paragraph, heading, image, gallery, video, button, alert,
  code-block, columns, hero, cta, faq, pricing, table, divider, embed
]
```

### 4.2 Toolbar Actions

**Format**: bold, italic, strike, inline-code, blockquote
**Alignment**: left, center, right, justify
**Advanced**: code-block, table, bullet-list, ordered-list

### 4.3 Block Actions

Transform, settings, hide, lock, duplicate, delete, move-up, move-down, more-actions

---

## 5. EXISTING PROBLEMS & MISSING SYSTEMS

### 5.1 CRITICAL — Editor Runtime Not Implemented

The editor shell exists but has NO runtime logic. The canvas `contentEditable` div has hardcoded demo content. There is:
- No document model on the client
- No block creation/deletion/editing
- No text editing engine
- No selection system
- No command system
- No keyboard handling
- No drag and drop
- No undo/redo
- No layers synchronization
- No inspector/property panel
- No save/persistence from editor
- No slash menu functionality
- No command palette functionality

### 5.2 Architecture Gaps

| System | Status |
|--------|--------|
| Editor HTML shell | ✅ COMPLETE |
| Sidebar toggle | ✅ COMPLETE |
| Tab switching | ✅ COMPLETE |
| Reactive state engine | ✅ COMPLETE |
| Media picker component | ✅ COMPLETE |
| Editor APIs (save/load) | ✅ COMPLETE |
| Revision system | ✅ COMPLETE |
| Widget/Pattern models | ✅ COMPLETE |
| SEO analysis | ✅ COMPLETE |
| Document model (client) | ❌ MISSING |
| Block engine | ❌ MISSING |
| Text editing engine | ❌ MISSING |
| Selection engine | ❌ MISSING |
| Command engine | ❌ MISSING |
| Keyboard system | ❌ MISSING |
| Slash menu logic | ❌ MISSING |
| Command palette logic | ❌ MISSING |
| Block toolbar logic | ❌ MISSING |
| Layers panel logic | ❌ MISSING |
| Inspector panel logic | ❌ MISSING |
| Post panel logic | ❌ MISSING |
| SEO panel logic | ❌ MISSING |
| Persistence (auto-save) | ❌ MISSING |
| History (undo/redo) | ❌ MISSING |
| Drag and drop | ❌ MISSING |
| Copy/paste | ❌ MISSING |
| Block insertion | ❌ MISSING |
| Block deletion | ❌ MISSING |
| Block transformation | ❌ MISSING |
| Responsive editing | ❌ MISSING |
| Pattern insertion | ❌ MISSING |
| Widget library panel | ❌ MISSING |
| Empty states | ❌ MISSING |
| Loading states | ❌ MISSING |
| Error handling | ❌ MISSING |

---

## 6. TARGET ACROXA EDITOR ARCHITECTURE

### 6.1 Architecture Map

```
┌─────────────────────────────────────────────────────────┐
│                    EDITOR SHELL                          │
│  (src/views/editor.js — Server-Rendered HTML)           │
├─────────────────────────────────────────────────────────┤
│                    EDITOR RUNTIME                        │
│  (acrx/assets/js/editor/ — Client-Side Modules)         │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Document   │  │  Selection  │  │  Command    │    │
│  │  Engine     │  │  Engine     │  │  Engine     │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │             │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐    │
│  │  Block      │  │  Keyboard   │  │  History    │    │
│  │  Engine     │  │  Engine     │  │  Engine     │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │             │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐    │
│  │  Text       │  │  Insertion  │  │  Persistence│    │
│  │  Engine     │  │  Engine     │  │  Engine     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Layers     │  │  Inspector  │  │  Slash      │    │
│  │  Panel      │  │  Panel      │  │  Menu       │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Command    │  │  Drag/Drop  │  │  Media      │    │
│  │  Palette    │  │  Engine     │  │  Picker     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Toolbar    │  │  Copy/Paste │  │  Responsive │    │
│  │  Engine     │  │  Engine     │  │  Engine     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 6.2 State Architecture

```
State Stores (using existing state.js engine):

"editor" — Main editor state
├── documentId          (number|string)
├── postType            ("post"|"page")
├── title               (string)
├── status              ("draft"|"published"|"scheduled")
├── isDirty             (boolean)
├── isSaving            (boolean)
├── lastSavedAt         (Date|null)
├── autosaveEnabled     (boolean)
├── selectedBlockId     (string|null)
├── selectedBlockIds    (string[])
├── focusedElement      (string|null)
├── activePanel         (string: "post"|"seo"|"block")
├── leftSidebarOpen     (boolean)
├── rightSidebarOpen    (boolean)
├── leftActivePanel     (string: "layers"|"widgets"|"patterns")
├── rightActivePanel    (string: "post"|"seo"|"block")
├── deviceMode          ("desktop"|"tablet"|"mobile")
├── zoom                (number: 100)
└── commandPaletteOpen  (boolean)

"document" — Document content model
├── blocks              (Map<id, Block>)
├── blockOrder          (string[]: ordered block IDs)
├── rootId              (string: root block ID)
└── version             (number)

"history" — Undo/redo
├── undoStack           (StateSnapshot[])
├── redoStack           (StateSnapshot[])
├── currentVersion      (number)
└── maxVersions         (number)

"selection" — Selection state
├── anchorBlockId       (string)
├── anchorOffset        (number)
├── focusBlockId        (string)
├── focusOffset         (number)
├── isCollapsed         (boolean)
└── selectedBlockIds    (string[])
```

---

## 7. TARGET DOCUMENT MODEL

### 7.1 Block Structure

```javascript
{
  id: "block_abc123",          // Unique block ID
  type: "paragraph",           // Block type
  content: [                   // Child content nodes
    {
      type: "text",
      text: "Hello world",
      marks: [
        { type: "bold" },
        { type: "link", attrs: { href: "https://example.com" } }
      ]
    }
  ],
  attrs: {                     // Block-level attributes
    level: 1,                  // For headings
    align: "left",
    placeholder: "Start typing..."
  },
  styles: {                    // Block styling
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 16, right: 16, bottom: 16, left: 16 },
    backgroundColor: "#ffffff",
    textColor: "#000000",
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "#000000",
    opacity: 1,
    shadow: "none"
  },
  responsive: {                // Responsive overrides
    mobile: { styles: {}, attrs: {} },
    tablet: { styles: {}, attrs: {} },
    desktop: { styles: {}, attrs: {} }
  },
  children: ["block_def456"],  // Nested block IDs (for containers)
  parent: "block_root",        // Parent block ID
  locked: false,
  hidden: false,
  customClasses: "",
  customId: "",
  customAttributes: {}
}
```

### 7.2 Document Structure

```javascript
{
  version: 1,
  blocks: {
    "block_root": {
      id: "block_root",
      type: "document",
      content: [],
      attrs: {},
      styles: {},
      children: ["block_1", "block_2", "block_3"],
      parent: null
    },
    "block_1": {
      id: "block_1",
      type: "paragraph",
      content: [
        { type: "text", text: "Hello world", marks: [] }
      ],
      attrs: { align: "left" },
      styles: {},
      children: [],
      parent: "block_root"
    }
  },
  blockOrder: ["block_1", "block_2", "block_3"]
}
```

### 7.3 Block Types Registry

```javascript
const BLOCK_TYPES = {
  // Text blocks
  paragraph: { group: "text", editable: true, content: "inline*" },
  heading: { group: "text", editable: true, content: "inline*", attrs: { level: [1,2,3,4,5,6] } },
  blockquote: { group: "text", editable: true, content: "block+" },
  codeBlock: { group: "text", editable: true, content: "text", attrs: { language: "" } },
  
  // List blocks
  bulletList: { group: "text", editable: true, content: "listItem+" },
  orderedList: { group: "text", editable: true, content: "listItem+" },
  listItem: { group: "text", editable: true, content: "paragraph+" },
  taskList: { group: "text", editable: true, content: "taskItem+" },
  taskItem: { group: "text", editable: true, content: "paragraph", attrs: { checked: false } },
  
  // Media blocks
  image: { group: "media", editable: false, attrs: { src: "", alt: "", caption: "" } },
  gallery: { group: "media", editable: false, attrs: { images: [], columns: 3 } },
  video: { group: "media", editable: false, attrs: { src: "", poster: "" } },
  audio: { group: "media", editable: false, attrs: { src: "" } },
  
  // Layout blocks
  columns: { group: "layout", editable: false, content: "column+", attrs: { columns: 2 } },
  column: { group: "layout", editable: true, content: "block*" },
  container: { group: "layout", editable: true, content: "block+" },
  group: { group: "layout", editable: true, content: "block+" },
  
  // Widget blocks
  button: { group: "widget", editable: false, attrs: { text: "", url: "", variant: "primary" } },
  divider: { group: "widget", editable: false, attrs: { style: "solid" } },
  spacer: { group: "widget", editable: false, attrs: { height: 20 } },
  table: { group: "widget", editable: true, attrs: { rows: 3, cols: 3 } },
  embed: { group: "widget", editable: false, attrs: { url: "", provider: "" } },
  alert: { group: "widget", editable: true, attrs: { type: "info", title: "" } },
  hero: { group: "widget", editable: true, attrs: { title: "", subtitle: "", backgroundImage: "" } },
  cta: { group: "widget", editable: true, attrs: { title: "", buttonText: "", buttonUrl: "" } },
  faq: { group: "widget", editable: true, attrs: { items: [] } },
  pricing: { group: "widget", editable: true, attrs: { plans: [] } },
  
  // Special blocks
  reusable: { group: "special", editable: false, attrs: { patternId: "" } },
  dynamicContent: { group: "special", editable: false, attrs: { dataSource: "", field: "" } }
};
```

---

## 8. IMPLEMENTATION DEPENDENCY GRAPH

```
Phase 1: Document Model & State
    └── Document Model (client-side)
    └── State Store Setup
    └── Block Registry

Phase 2: Block Engine
    └── Block CRUD Operations
    └── Block Rendering
    └── Block Nesting Rules
    └── Block Transformation

Phase 3: Text Engine
    └── Inline Content Model
    └── Text Marks (bold, italic, etc.)
    └── Text Editing (contentEditable)
    └── Text Selection

Phase 4: Selection Engine
    └── Text Selection
    └── Block Selection
    └── Multi-Selection
    └── Selection Sync (canvas ↔ layers ↔ inspector)

Phase 5: Keyboard System
    └── Enter/Backspace/Delete
    └── Tab/Shift+Tab
    └── Arrow Keys
    └── Ctrl/Cmd shortcuts
    └── Focus Management

Phase 6: Command Engine
    └── Command Registry
    └── Command Execution
    └── Keyboard Shortcuts
    └── Slash Menu Commands

Phase 7: History Engine
    └── Undo/Redo
    └── Transaction Grouping
    └── History Persistence

Phase 8: UI Panels
    └── Slash Menu Logic
    └── Command Palette Logic
    └── Layers Panel Logic
    └── Inspector Panel Logic
    └── Post Panel Logic
    └── SEO Panel Logic

Phase 9: Insertion & Drag/Drop
    └── Block Insertion API
    └── Drag/Drop Engine
    └── Drop Zones
    └── Insertion Indicators

Phase 10: Persistence
    └── Auto-Save
    └── Manual Save
    └── Load/Restore
    └── Dirty State
    └── Revision Integration

Phase 11: Advanced Features
    └── Copy/Paste
    └── Responsive Editing
    └── Pattern Insertion
    └── Widget Library
    └── Media Integration
```

---

## 9. IMPLEMENTATION PHASES

### Phase 1: Document Model & State (Foundation)

**Objective**: Establish the client-side document model and state management.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/document.js` — Document model
- NEW: `acrx/assets/js/editor/blocks.js` — Block registry
- NEW: `acrx/assets/js/editor/state.js` — Editor state stores
- MODIFY: `acrx/assets/js/editor.js` — Import and initialize state

**Requirements**:
1. Create `Block` class with id, type, content, attrs, styles, children, parent
2. Create `Document` class with blocks map, blockOrder, version
3. Set up State stores: "editor", "document", "history", "selection"
4. Create block type registry with defaults for each block type
5. Implement `createBlock(type, attrs)` factory function
6. Implement `getBlock(id)`, `setBlock(id, data)`, `deleteBlock(id)`
7. Implement `getBlockChildren(id)`, `getBlockParent(id)`
8. Implement `insertBlock(afterId, block)`, `moveBlock(id, newParentId, index)`
9. Load document from API on editor init
10. Serialize document for save

**Acceptance Criteria**:
- Document can be loaded from API and represented as client-side model
- Blocks can be created, read, updated, deleted
- Block hierarchy (parent/child) is maintained
- State stores are reactive (watchers fire on changes)

---

### Phase 2: Block Engine

**Objective**: Render blocks in the canvas and handle block operations.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/rendering.js` — Block rendering
- NEW: `acrx/assets/js/editor/blockEngine.js` — Block operations
- MODIFY: `acrx/assets/js/editor.js` — Initialize rendering

**Requirements**:
1. Render blocks from document model into canvas
2. Each block gets a wrapper with data-block-id attribute
3. Text blocks get contentEditable child elements
4. Block types render appropriate content (paragraph → p, heading → h1-h6, etc.)
5. Block nesting rendered as nested DOM elements
6. Empty document shows placeholder
7. Block insertion between existing blocks
8. Block deletion with confirmation
9. Block duplication
10. Block transformation (paragraph → heading, etc.)
11. Block movement (up/down, drag target)

**Acceptance Criteria**:
- Blocks render correctly in canvas from document model
- New blocks can be inserted at any position
- Blocks can be deleted, duplicated, transformed
- Block hierarchy is visually represented
- Empty document shows appropriate placeholder

---

### Phase 3: Text Engine

**Objective**: Enable inline text editing with formatting marks.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/textEngine.js` — Text editing
- NEW: `acrx/assets/js/editor/marks.js` — Inline marks
- MODIFY: `acrx/assets/js/editor/rendering.js` — Text rendering

**Requirements**:
1. Text content stored as array of inline nodes: `[{ type: "text", text: "...", marks: [...] }]`
2. Marks: bold, italic, underline, strike, inlineCode, link
3. contentEditable on text block children
4. Input handler to update document model on text changes
5. Mark application/removal via commands
6. Mark preservation across typed characters
7. Link creation with URL input
8. Text selection within blocks

**Acceptance Criteria**:
- Text can be typed and edited in text blocks
- Bold/italic/underline/strike/code marks can be applied
- Marks persist across typing
- Links can be created and edited
- Document model updates in real-time with text changes

---

### Phase 4: Selection Engine

**Objective**: Track and manage text and block selections.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/selection.js` — Selection engine
- MODIFY: `acrx/assets/js/editor/state.js` — Selection state

**Requirements**:
1. Track text selection (anchorBlock, anchorOffset, focusBlock, focusOffset)
2. Track block selection (selected block IDs)
3. Multi-block selection with Ctrl+click or Shift+click
4. Selection sync with browser Selection API
5. Selection restoration after DOM updates
6. Block selection highlighting
7. Selection change events

**Acceptance Criteria**:
- Text selection works within blocks
- Blocks can be selected by clicking
- Multiple blocks can be selected
- Selection state is reactive (UI updates on selection change)
- Selection persists across inspector interactions

---

### Phase 5: Keyboard System

**Objective**: Handle all keyboard interactions for editing.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/keyboard.js` — Keyboard handler
- MODIFY: `acrx/assets/js/editor.js` — Register keyboard handler

**Requirements**:
1. Enter: Create new block below current
2. Shift+Enter: Soft line break within block
3. Backspace at block start: Merge with previous block or delete empty block
4. Backspace in empty block: Delete block and focus previous
5. Delete at block end: Merge with next block
6. Tab: Indent (in lists) or insert tab character
7. Shift+Tab: Outdent
8. ArrowUp/Down: Navigate between blocks
9. ArrowLeft/Right: Navigate within text
10. Ctrl/Cmd+A: Select all blocks
11. Ctrl/Cmd+B/I/U: Toggle marks
12. Ctrl/Cmd+Z: Undo
13. Ctrl/Cmd+Shift+Z: Redo
14. Ctrl/Cmd+K: Open command palette
15. Escape: Close menus/palette, deselect
16. Focus management: maintain focus through block operations

**Acceptance Criteria**:
- All keyboard shortcuts work as specified
- Focus is maintained through block operations
- No unexpected cursor jumps
- Keyboard navigation between blocks works
- Shortcuts don't conflict with browser defaults

---

### Phase 6: Command Engine

**Objective**: Centralized command system for all editor actions.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/commands.js` — Command registry
- NEW: `acrx/assets/js/editor/slashMenu.js` — Slash menu logic
- NEW: `acrx/assets/js/editor/commandPalette.js` — Command palette logic

**Requirements**:
1. Command registry with: id, label, category, shortcut, execute, canExecute
2. Commands receive context: { document, selection, editor }
3. Commands mutate document through defined API
4. Commands create history transactions
5. Slash menu: "/" trigger, search, filter, insert block
6. Command palette: Ctrl+K, search commands, execute
7. Available commands based on context
8. Command feedback (toasts, UI updates)

**Slash Menu Commands**:
- paragraph, heading (h1-h6), image, gallery, video, button, alert, code-block, columns, hero, cta, faq, pricing, table, divider, embed, blockquote, bulletList, orderedList, taskList, spacer, container

**Command Palette Commands**:
- All slash menu commands + undo, redo, save, toggle-sidebar, toggle-layers, etc.

**Acceptance Criteria**:
- Slash menu appears on "/" and filters with typing
- Selecting item inserts block at cursor
- Command palette opens on Ctrl+K
- Commands execute correctly
- Keyboard shortcuts trigger commands

---

### Phase 7: History Engine

**Objective**: Undo/redo functionality.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/history.js` — History engine
- MODIFY: `acrx/assets/js/editor/state.js` — History state

**Requirements**:
1. Undo stack and redo stack
2. State snapshots (document + selection)
3. Transaction grouping (batch related changes)
4. Undo: Restore previous state, update selection
5. Redo: Apply next state, update selection
6. Max history limit (100 steps)
7. History cleared on new change after undo
8. Keyboard shortcuts: Ctrl+Z, Ctrl+Shift+Z

**Acceptance Criteria**:
- Undo reverts last action
- Redo reapplies undone action
- Multiple undos/redos work correctly
- Selection restored with undo/redo
- History persists during session

---

### Phase 8: UI Panels

**Objective**: Implement all sidebar and overlay panels.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/layersPanel.js` — Layers panel
- NEW: `acrx/assets/js/editor/inspectorPanel.js` — Block inspector
- NEW: `acrx/assets/js/editor/postPanel.js` — Post settings
- NEW: `acrx/assets/js/editor/seoPanel.js` — SEO settings
- NEW: `acrx/assets/js/editor/blockToolbar.js` — Floating toolbar

**Requirements**:

**Layers Panel**:
1. Render document tree from block hierarchy
2. Show block type icon + label
3. Expand/collapse nested blocks
4. Click to select block
5. Drag to reorder
6. Visibility toggle (eye icon)
7. Lock toggle (lock icon)
8. Sync with canvas selection
9. Sync with canvas block changes

**Inspector Panel (Block Settings)**:
1. Show when block is selected
2. Display block type, ID, classes
3. Layout controls (margin, padding, width, height)
4. Typography controls (font, size, weight, color, alignment)
5. Background controls (color, image, gradient)
6. Border controls (width, style, color, radius)
7. Effects (opacity, shadow, transform)
8. Responsive overrides (mobile/tablet/desktop)
9. Custom CSS classes
10. Custom attributes

**Post Panel**:
1. Title (editable)
2. Slug (auto-generated, editable)
3. Status (draft/published/scheduled)
4. Author
5. Publish date
6. Featured image
7. Excerpt
8. Categories
9. Tags
10. Template

**SEO Panel**:
1. SEO title
2. Meta description
3. Focus keyword
4. Canonical URL
5. Robots directives (noIndex, noFollow)
6. Open Graph (title, description, image)
7. SEO score display
8. SEO suggestions

**Block Toolbar (Floating)**:
1. Appear on block selection
2. Transform block type
3. Toggle alignment
4. Toggle marks
5. Duplicate block
6. Delete block
7. Move up/down
8. More actions dropdown

**Acceptance Criteria**:
- Layers panel shows document tree
- Clicking layer selects block in canvas
- Inspector shows block properties
- Changing inspector updates block
- Post panel shows post metadata
- SEO panel shows SEO data
- Floating toolbar appears on selection

---

### Phase 9: Insertion & Drag/Drop

**Objective**: Content insertion and reordering via drag/drop.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/insertion.js` — Insertion engine
- NEW: `acrx/assets/js/editor/dragDrop.js` — Drag/drop engine

**Requirements**:

**Insertion**:
1. Insert block after current selection
2. Insert block at end of document
3. Insert block between blocks (drop zone)
4. Insert pattern (from patterns panel)
5. Insert widget (from widgets panel)
6. Insert from slash menu
7. Insert from command palette
8. Paste content (HTML → blocks)

**Drag/Drop**:
1. Drag block handle to reorder
2. Drop zones between blocks
3. Visual drop indicator
4. Nested drop zones (into containers)
5. Cancel drag with Escape
6. Touch support

**Acceptance Criteria**:
- Blocks can be inserted at any position
- Blocks can be dragged to reorder
- Drop zones appear between blocks
- Drop indicator shows insertion point
- Touch drag works on mobile

---

### Phase 10: Persistence

**Objective**: Save/load editor state to/from server.

**Files to Create/Modify**:
- NEW: `acrx/assets/js/editor/persistence.js` — Save/load logic
- MODIFY: `acrx/assets/js/editor.js` — Initialize persistence

**Requirements**:
1. Load document from API on init
2. Serialize document to content.json format
3. Auto-save on changes (debounced, 30s)
4. Manual save (Ctrl+S)
5. Save status indicator in footer
6. Dirty state tracking
7. Save queue with race prevention
8. Failed save retry
9. Conflict detection
10. Revision creation on save
11. Publish/draft/schedule status changes

**Save Payload**:
```javascript
POST /acr/api/editor/:id/content
{
  content: {
    json: { ... },      // Document model
    html: "...",        // Rendered HTML
    raw: "...",         // Plain text
    conditionalJS: null
  },
  title: "...",
  status: "draft",
  postType: "post",
  meta: { ... },
  seo: { ... }
}
```

**Acceptance Criteria**:
- Document loads from API on editor open
- Changes auto-save after debounce
- Ctrl+S saves immediately
- Save status shows in footer
- Failed saves retry
- Revisions created on save

---

## 10. CODING-AGENT PROMPT — PHASE 1

### Context
You are working on the Acroxa CMS editor. The editor shell is fully rendered server-side (`src/views/editor.js`) with header, sidebars, canvas, toolbar, and footer. The client-side editor JavaScript (`acrx/assets/js/editor.js`) currently only handles sidebar toggles and tab switching (42 lines). A reactive state engine exists at `acrx/assets/js/utils/state.js`. The editor save/load APIs exist at `/acr/api/editor/:id/content`.

### Objective
Implement Phase 1: Document Model & State. Create the client-side document model, block registry, and state stores that all subsequent editor features will build upon.

### Existing Architecture
- **State Engine**: `acrx/assets/js/utils/state.js` — `State.create()`, `State.get()`, `State.set()`, `State.watch()`, `State.batch()`
- **Editor HTML**: `src/views/editor.js` — `renderEditor()` returns complete HTML shell
- **Editor Init**: `acrx/assets/js/editor.js` — `Mini.ready(() => {...})` — currently only sidebar logic
- **API**: `GET /acr/api/editor/:id/data` returns `{ data: { document, widgets, patterns, seoReport } }`
- **Content Schema**: `{ json: {...}, html: "...", raw: "...", conditionalJS: {...} }`

### Files to Create
1. `acrx/assets/js/editor/document.js` — Document model classes
2. `acrx/assets/js/editor/blocks.js` — Block type registry
3. `acrx/assets/js/editor/state.js` — State store initialization

### Files to Modify
1. `acrx/assets/js/editor.js` — Import new modules, load document on init

### Requirements

**document.js**:
```javascript
// Block class
class Block {
  constructor({ id, type, content = [], attrs = {}, styles = {}, children = [], parent = null }) {
    this.id = id;
    this.type = type;
    this.content = content;  // Inline content nodes for text blocks
    this.attrs = attrs;
    this.styles = styles;
    this.responsive = { mobile: {}, tablet: {}, desktop: {} };
    this.children = children;  // Child block IDs for container blocks
    this.parent = parent;
    this.locked = false;
    this.hidden = false;
    this.customClasses = "";
    this.customId = "";
    this.customAttributes = {};
  }
}

// Document class
class Document {
  constructor(data = {}) {
    this.version = data.version || 1;
    this.blocks = new Map();
    this.blockOrder = [];
    this.rootId = null;
  }
  
  // Methods: addBlock, removeBlock, getBlock, setBlock, 
  // getBlockChildren, getBlockParent, insertBlock, moveBlock,
  // serialize, deserialize
}
```

**blocks.js**:
```javascript
// Block type definitions with defaults
const BLOCK_TYPES = {
  paragraph: { group: "text", label: "Paragraph", icon: "paragraph", content: "inline*", defaults: { content: [{ type: "text", text: "" }] } },
  heading: { group: "text", label: "Heading", icon: "heading", content: "inline*", attrs: { level: { type: "number", default: 2 } }, defaults: { attrs: { level: 2 } } },
  // ... all block types from slash menu
};

function createBlock(type, overrides = {}) {
  const def = BLOCK_TYPES[type];
  if (!def) throw new Error(`Unknown block type: ${type}`);
  return new Block({
    id: generateId(),
    type,
    ...def.defaults,
    ...overrides
  });
}

function generateId() {
  return "block_" + Math.random().toString(36).substr(2, 9);
}
```

**state.js**:
```javascript
import State from '../utils/state.js';

// Initialize editor stores
State.create("editor", {
  documentId: null,
  postType: "post",
  title: "",
  status: "draft",
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  autosaveEnabled: true,
  selectedBlockId: null,
  selectedBlockIds: [],
  focusedElement: null,
  activePanel: "post",
  leftSidebarOpen: false,
  rightSidebarOpen: false,
  leftActivePanel: "layers",
  rightActivePanel: "post",
  deviceMode: "desktop",
  zoom: 100,
  commandPaletteOpen: false
});

State.create("document", {
  blocks: {},
  blockOrder: [],
  rootId: null,
  version: 1
});

State.create("history", {
  undoStack: [],
  redoStack: [],
  currentVersion: 0,
  maxVersions: 100
});

State.create("selection", {
  anchorBlockId: null,
  anchorOffset: 0,
  focusBlockId: null,
  focusOffset: 0,
  isCollapsed: true,
  selectedBlockIds: []
});
```

**editor.js modifications**:
```javascript
import { Document, Block } from './document.js';
import { BLOCK_TYPES, createBlock } from './blocks.js';
import './state.js';

Mini.ready(async () => {
  // ... existing sidebar logic ...
  
  // Load document from API
  const docId = getDocumentIdFromUrl();
  if (docId) {
    const data = await fetchEditorData(docId);
    const doc = new Document(data.document.content.json);
    State.patch("document", doc.serialize());
    State.patch("editor", { documentId: docId, title: data.document.title });
  }
});
```

### Constraints
- Do NOT modify the server-rendered HTML structure
- Do NOT add any external dependencies
- Reuse the existing State engine (`state.js`)
- Follow existing code conventions (ES modules, Mini library for DOM)
- Keep all editor logic client-side

### Integration Requirements
- Document model must work with existing API payload format
- State stores must be reactive (watchers fire on changes)
- Block IDs must be unique and stable

### Testing
1. Load editor page in browser
2. Check console for initialization logs
3. Verify State stores are created
4. Verify document loads from API
5. Verify blocks are represented in state

### Browser Testing
1. Navigate to `/acrx/editor`
2. Open DevTools console
3. Verify no errors on load
4. Check `State.get("editor")` returns editor state
5. Check `State.get("document")` returns document state

### Completion Criteria
- [ ] Document model classes implemented
- [ ] Block registry implemented
- [ ] State stores initialized
- [ ] Document loads from API on editor init
- [ ] State reflects loaded document
- [ ] No console errors
- [ ] Existing sidebar functionality still works

### Failure Behavior
If you encounter unexpected architecture:
1. Document the actual structure found
2. Adapt the implementation to match
3. Report discrepancies from this blueprint

---

## 11. CODING-AGENT PROMPT — PHASE 2

### Context
Phase 1 is complete. Document model, block registry, and state stores are implemented. The editor loads document data from API and stores it in reactive state.

### Objective
Implement Phase 2: Block Engine. Render blocks from the document model into the canvas, and implement block CRUD operations.

### Files to Create
1. `acrx/assets/js/editor/rendering.js` — Block rendering functions
2. `acrx/assets/js/editor/blockEngine.js` — Block operations (insert, delete, duplicate, transform, move)

### Files to Modify
1. `acrx/assets/js/editor.js` — Initialize rendering, wire up block operations

### Requirements

**rendering.js**:
```javascript
import { BLOCK_TYPES } from './blocks.js';
import State from '../utils/state.js';

// Render all blocks from document state into canvas
function renderCanvas() {
  const canvas = document.getElementById("editor-canvas");
  const { blockOrder, blocks } = State.get("document");
  
  // Clear existing blocks (keep canvas-main-input)
  canvas.querySelectorAll(".block-wrap").forEach(el => el.remove());
  
  // Render each block
  blockOrder.forEach(blockId => {
    const block = blocks[blockId];
    if (block) {
      const el = renderBlock(block);
      canvas.appendChild(el);
    }
  });
}

// Render single block
function renderBlock(block) {
  const wrapper = document.createElement("div");
  wrapper.className = "block-wrap";
  wrapper.dataset.blockId = block.id;
  wrapper.dataset.forBlockId = block.id;
  
  // Add block handle
  const handle = renderBlockHandle(block);
  wrapper.appendChild(handle);
  
  // Render block content based on type
  const content = renderBlockContent(block);
  wrapper.appendChild(content);
  
  return wrapper;
}

// Render block content based on type
function renderBlockContent(block) {
  const el = document.createElement("div");
  el.className = "block";
  el.dataset.blockId = block.id;
  el.dataset.index = "0";
  el.dataset.depth = "0";
  
  switch (block.type) {
    case "paragraph":
    case "heading":
      el.contentEditable = "true";
      el.dataset.placeholder = "Start typing...";
      // Render inline content
      renderInlineContent(el, block.content);
      break;
    case "image":
      renderImageBlock(el, block);
      break;
    // ... other block types
  }
  
  return el;
}

// Render inline content (text with marks)
function renderInlineContent(el, content) {
  content.forEach(node => {
    if (node.type === "text") {
      const textEl = document.createTextNode(node.text);
      // Apply marks
      if (node.marks?.length) {
        const wrapper = applyMarks(node.marks, textEl);
        el.appendChild(wrapper);
      } else {
        el.appendChild(textEl);
      }
    }
  });
}
```

**blockEngine.js**:
```javascript
import State from '../utils/state.js';
import { createBlock, generateId } from './blocks.js';

// Insert block after given block ID
function insertBlock(afterId, type, attrs = {}) {
  const doc = State.get("document");
  const newBlock = createBlock(type, attrs);
  
  State.batch(() => {
    // Add block to document
    State.set(`document.blocks.${newBlock.id}`, newBlock);
    
    // Update block order
    const order = [...doc.blockOrder];
    const idx = order.indexOf(afterId);
    order.splice(idx + 1, 0, newBlock.id);
    State.set("document.blockOrder", order);
    
    // Mark dirty
    State.set("editor.isDirty", true);
  });
  
  return newBlock;
}

// Delete block
function deleteBlock(blockId) {
  const doc = State.get("document");
  const block = doc.blocks[blockId];
  if (!block || block.type === "document") return;
  
  State.batch(() => {
    // Remove from parent's children
    if (block.parent) {
      const parent = doc.blocks[block.parent];
      if (parent) {
        const children = parent.children.filter(id => id !== blockId);
        State.set(`document.blocks.${block.parent}.children`, children);
      }
    }
    
    // Remove block and descendants
    removeBlockRecursive(blockId);
    
    // Update block order
    const order = doc.blockOrder.filter(id => id !== blockId);
    State.set("document.blockOrder", order);
    
    // Clear selection if selected
    if (State.value("editor.selectedBlockId") === blockId) {
      State.set("editor.selectedBlockId", null);
    }
    
    State.set("editor.isDirty", true);
  });
}

// Duplicate block
function duplicateBlock(blockId) {
  const doc = State.get("document");
  const block = doc.blocks[blockId];
  if (!block) return;
  
  const newBlock = createBlock(block.type, {
    content: JSON.parse(JSON.stringify(block.content)),
    attrs: { ...block.attrs },
    styles: JSON.parse(JSON.stringify(block.styles))
  });
  
  insertBlock(blockId, newBlock);
  return newBlock;
}

// Transform block type
function transformBlock(blockId, newType) {
  const doc = State.get("document");
  const block = doc.blocks[blockId];
  if (!block) return;
  
  State.batch(() => {
    State.set(`document.blocks.${blockId}.type`, newType);
    // Update attrs/defaults for new type
    State.set("editor.isDirty", true);
  });
}

// Move block up/down
function moveBlock(blockId, direction) {
  const doc = State.get("document");
  const order = [...doc.blockOrder];
  const idx = order.indexOf(blockId);
  
  if (direction === "up" && idx > 0) {
    [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
  } else if (direction === "down" && idx < order.length - 1) {
    [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
  }
  
  State.set("document.blockOrder", order);
  State.set("editor.isDirty", true);
}
```

### Acceptance Criteria
- [ ] Blocks render in canvas from document state
- [ ] Text blocks are contentEditable
- [ ] New blocks can be inserted after any block
- [ ] Blocks can be deleted
- [ ] Blocks can be duplicated
- [ ] Blocks can be transformed (paragraph → heading)
- [ ] Blocks can be moved up/down
- [ ] Empty document shows placeholder
- [ ] Canvas updates reactively on state changes

---

## 12. CODING-AGENT PROMPT — PHASE 3

### Context
Phase 1-2 complete. Document model and block rendering are working. Blocks render in canvas and can be inserted/deleted/duplicated/transformed/moved.

### Objective
Implement Phase 3: Text Engine. Enable inline text editing with formatting marks.

### Files to Create
1. `acrx/assets/js/editor/textEngine.js` — Text editing logic
2. `acrx/assets/js/editor/marks.js` — Mark definitions and operations

### Requirements

**marks.js**:
```javascript
const MARK_DEFS = {
  bold: { tag: "strong", label: "Bold", shortcut: "Ctrl+B" },
  italic: { tag: "em", label: "Italic", shortcut: "Ctrl+I" },
  underline: { tag: "u", label: "Underline", shortcut: "Ctrl+U" },
  strike: { tag: "s", label: "Strike", shortcut: "Ctrl+Shift+X" },
  inlineCode: { tag: "code", label: "Code" },
  link: { tag: "a", label: "Link", shortcut: "Ctrl+K" }
};

function applyMarks(marks, textNode) {
  let el = textNode;
  marks.forEach(mark => {
    const wrapper = document.createElement(MARK_DEFS[mark.type].tag);
    if (mark.type === "link") wrapper.href = mark.attrs.href;
    wrapper.appendChild(el);
    el = wrapper;
  });
  return el;
}

function toggleMark(markType) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  // Get current marks at selection
  // Toggle mark on/off
  // Update document model
  // Re-render affected text
}
```

**textEngine.js**:
```javascript
// Handle text input in contentEditable blocks
function handleTextInput(blockId, event) {
  const doc = State.get("document");
  const block = doc.blocks[blockId];
  if (!block) return;
  
  // Get text from contentEditable element
  const el = event.target;
  const text = el.textContent;
  
  // Update block content
  State.set(`document.blocks.${blockId}.content`, [
    { type: "text", text, marks: [] }
  ]);
  
  State.set("editor.isDirty", true);
}

// Handle Enter key in text blocks
function handleEnterKey(blockId) {
  const doc = State.get("document");
  const block = doc.blocks[blockId];
  
  // Split text at cursor position
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  
  // Create new block with text after cursor
  const newBlock = createBlock(block.type, {
    content: [{ type: "text", text: getTextAfterCursor(range), marks: [] }]
  });
  
  // Truncate current block text
  const textBefore = getTextBeforeCursor(range);
  State.set(`document.blocks.${blockId}.content`, [
    { type: "text", text: textBefore, marks: [] }
  ]);
  
  // Insert new block
  insertBlock(blockId, newBlock);
  
  // Focus new block
  focusBlock(newBlock.id, 0);
}

// Handle Backspace at block start
function handleBackspaceAtStart(blockId) {
  const doc = State.get("document");
  const blockOrder = doc.blockOrder;
  const idx = blockOrder.indexOf(blockId);
  
  if (idx === 0) return; // Can't merge with nothing
  
  const prevBlockId = blockOrder[idx - 1];
  const prevBlock = doc.blocks[prevBlockId];
  const block = doc.blocks[blockId];
  
  // Merge text into previous block
  const prevText = prevBlock.content.map(n => n.text).join("");
  const currentText = block.content.map(n => n.text).join("");
  
  State.set(`document.blocks.${prevBlockId}.content`, [
    { type: "text", text: prevText + currentText, marks: [] }
  ]);
  
  // Delete current block
  deleteBlock(blockId);
  
  // Focus previous block at merge point
  focusBlock(prevBlockId, prevText.length);
}
```

### Acceptance Criteria
- [ ] Text can be typed in contentEditable blocks
- [ ] Text changes update document model
- [ ] Bold/italic/underline/strike/code marks can be toggled
- [ ] Marks applied via keyboard shortcuts
- [ ] Enter creates new block
- [ ] Backspace at start merges with previous block
- [ ] Text selection works within blocks

---

## 13. CODING-AGENT PROMPT — PHASE 4-11

*Note: Phases 4-11 follow the same pattern as Phases 1-3. Each phase creates specific files, modifies editor.js, and has clear acceptance criteria. The full prompts for each phase would be generated similarly, specifying exact files, requirements, and testing criteria based on the architecture defined in sections 6-9.*

---

## 14. FEATURE INTERACTION MATRIX

| Interaction | Initiating System | Receiving System | State Affected | History |
|-------------|-------------------|------------------|----------------|---------|
| Type text | Keyboard | Text Engine | Document, Editor | Yes |
| Insert block | Slash Menu | Block Engine, Insertion | Document, Selection | Yes |
| Select block | Mouse/Keyboard | Selection, Layers, Inspector | Selection, Editor | No |
| Change inspector | Inspector | Block Engine | Document | Yes |
| Undo | Keyboard | History | Document, Selection | Yes |
| Save | Keyboard/AutoSave | Persistence | Editor | No |
| Drag block | Mouse | Drag/Drop, Block Engine | Document | Yes |
| Apply mark | Keyboard/Toolbar | Text Engine | Document | Yes |
| Delete block | Keyboard/Block Actions | Block Engine | Document, Selection | Yes |
| Transform block | Block Actions/Slash Menu | Block Engine | Document | Yes |
| Toggle sidebar | Keyboard/Header | Editor UI | Editor | No |
| Command palette | Keyboard | Command Engine | Various | Depends |
| Paste content | Keyboard | Paste Engine | Document | Yes |

---

## 15. STATE MANAGEMENT SEPARATION

| State Category | Location | Persistence | Example |
|----------------|----------|-------------|---------|
| Document content | `document` store | Yes (API) | Blocks, text, styles |
| Editor UI state | `editor` store | No (session) | Sidebar open, active panel |
| Selection state | `selection` store | No (transient) | Selected block, cursor position |
| History state | `history` store | No (session) | Undo/redo stacks |
| Post metadata | Post panel → API | Yes (API) | Title, slug, status, categories |
| SEO metadata | SEO panel → API | Yes (API) | Meta title, description, keywords |
| Widget definitions | Widget panel → API | Yes (API) | Widget content, settings |
| Pattern definitions | Pattern panel → API | Yes (API) | Pattern content, settings |

---

## 16. DATA FLOW DIAGRAMS

### Block Insertion Flow
```
User action (slash menu / command palette / keyboard)
    ↓
Command execution
    ↓
insertBlock(afterId, type, attrs)
    ↓
createBlock(type, attrs) → new Block instance
    ↓
State.batch(() => {
  State.set("document.blocks[newBlock.id]", newBlock)
  State.set("document.blockOrder", [...order])
  State.set("editor.isDirty", true)
})
    ↓
State watcher triggers renderCanvas()
    ↓
Canvas DOM updated
    ↓
Selection focuses new block
    ↓
History transaction created
```

### Save Flow
```
Auto-save trigger (30s debounce) OR Ctrl+S
    ↓
persistence.save()
    ↓
State.get("document") → serialize to content.json
    ↓
POST /acr/api/editor/:id/content
{
  content: { json, html, raw },
  title, status, postType, meta, seo
}
    ↓
Server validates + saves + creates revision
    ↓
Response: { success: true, document }
    ↓
State.patch("editor", { isDirty: false, lastSavedAt: Date.now() })
    ↓
Footer updates "Saved" status
```

### Load Flow
```
Editor page load (/acrx/editor?id=123&type=post)
    ↓
GET /acr/api/editor/123/data?type=post
    ↓
Response: { document, widgets, patterns, seoReport }
    ↓
Parse content.json → Document model
    ↓
State.patch("document", doc.serialize())
State.patch("editor", { documentId, title, status })
    ↓
renderCanvas() draws blocks
    ↓
Sidebar panels populate
    ↓
Editor ready for interaction
```

---

## 17. EDGE CASES

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty document | Show placeholder "Start typing or use / to add a block" |
| Delete last block | Create empty paragraph block |
| Undo to empty document | Restore single empty paragraph |
| Paste HTML content | Parse into Acroxa blocks |
| Paste plain text | Create paragraph with text |
| Paste images | Create image blocks |
| Network failure on save | Show error toast, retry after delay |
| Concurrent edits | Last write wins (no real-time collab yet) |
| Unknown block type | Render as generic container with warning |
| Missing widget reference | Render placeholder with "Widget not found" |
| Very long document | Virtualize rendering if >500 blocks |
| Deeply nested blocks | Max nesting depth of 10 levels |
| Duplicate block IDs | Regenerate ID on conflict |
| Invalid selection | Reset to document start |
| Browser refresh | Warn if unsaved changes |
| Mobile editing | Simplified toolbar, touch-friendly targets |

---

## 18. PERFORMANCE REQUIREMENTS

| Metric | Target |
|--------|--------|
| Editor startup | <2s to interactive |
| Block insertion | <100ms |
| Text input latency | <16ms (60fps) |
| Auto-save completion | <2s |
| Canvas re-render | <50ms for 100 blocks |
| Slash menu open | <50ms |
| Command palette open | <50ms |
| Inspector update | <100ms |
| Memory usage | <100MB for 500 blocks |

---

## 19. SECURITY REQUIREMENTS

- Sanitize all HTML input (paste)
- Validate block types against registry
- Prevent script injection in custom attributes
- Validate URLs (links, media)
- Sanitize custom CSS classes
- Prevent XSS in text content
- Validate API responses
- Rate limit auto-save
- Auth token required for all API calls

---

## 20. TESTING STRATEGY

### Unit Tests
- Document model CRUD operations
- Block creation with all types
- Mark application/removal
- Selection state management
- History undo/redo
- Serialization/deserialization

### Integration Tests
- Block insertion → rendering → state update
- Text editing → model update → persistence
- Selection → inspector → model update
- Layers panel → selection → canvas highlight
- Slash menu → block insertion → canvas update

### Browser Tests
- Create new post, add blocks, save
- Edit existing post, verify load
- Test all keyboard shortcuts
- Test slash menu filtering
- Test command palette
- Test undo/redo
- Test drag/drop
- Test responsive modes
- Test save/load cycle

---

## 21. FINAL IMPLEMENTATION CHECKLIST

### Architecture
- [ ] Document model (client-side)
- [ ] State ownership defined
- [ ] Command system
- [ ] Selection engine
- [ ] History engine
- [ ] Serialization format
- [ ] Persistence layer
- [ ] Extension points

### Editor Core
- [ ] Block rendering
- [ ] Block CRUD operations
- [ ] Text editing
- [ ] Inline marks
- [ ] Block insertion
- [ ] Block deletion
- [ ] Block transformation
- [ ] Block movement
- [ ] Drag and drop
- [ ] Copy/paste
- [ ] Keyboard navigation

### UI Components
- [ ] Slash menu
- [ ] Command palette
- [ ] Floating toolbar
- [ ] Layers panel
- [ ] Block inspector
- [ ] Post panel
- [ ] SEO panel
- [ ] Widget library
- [ ] Pattern library
- [ ] Media picker integration

### Content
- [ ] Post settings
- [ ] SEO settings
- [ ] Responsive overrides
- [ ] Custom classes/attributes
- [ ] Dynamic content
- [ ] Patterns
- [ ] Reusable blocks

### Quality
- [ ] Unit tests
- [ ] Integration tests
- [ ] Browser tests
- [ ] Accessibility (keyboard, ARIA)
- [ ] Security (sanitization, validation)
- [ ] Performance (virtualization, debouncing)
- [ ] Error handling
- [ ] Loading states
- [ ] Empty states

---

## 22. SELECTION ENGINE

### Purpose & Responsibilities
The Selection Engine is a first-class subsystem responsible for tracking, synchronizing, and resolving all forms of user selection across the editor. It bridges the browser's native Selection API with the Acroxa document model, and keeps selection state consistent across the canvas, layers panel, and inspector.

### Selection Types
- **Text selection**: Character-level range within a single contentEditable block. Tracked as `{ anchorBlockId, anchorOffset, focusBlockId, focusOffset, isCollapsed }`.
- **Block selection**: One or more top-level blocks selected via click/Shift+click/Ctrl+click. Tracked as `selectedBlockIds: string[]`.
- **Widget selection**: A widget block selected in the canvas. Treated as block selection with type=widget, triggering widget-specific inspector panel.
- **Nested selection**: Selection inside a nested container (columns > column > paragraph). The engine resolves the deepest editable ancestor.
- **Parent/child selection**: Navigating up/down the block tree. Ctrl+click on a nested block selects the parent container.
- **Multi-selection**: Shift+click extends selection from anchor to clicked block. Ctrl+click toggles individual blocks.

### Inputs
- Mouse clicks (canvas, layers panel)
- Keyboard navigation (arrow keys, Tab, Shift+click)
- Programmatic selection from commands (insert block → focus new block)
- Browser Selection API change events (`selectionchange`)

### Outputs
- `selection` State store updates
- DOM visual feedback (block highlighting, text selection range)
- Events: `selectionChanged`, `blockSelected`, `textSelected`

### State Ownership
Owns the `selection` State store:
```javascript
{
  anchorBlockId: null,
  anchorOffset: 0,
  focusBlockId: null,
  focusOffset: 0,
  isCollapsed: true,
  selectedBlockIds: []
}
```
Reads from `editor` store (selectedBlockId, focusedElement). Does NOT own document state.

### API Surface
```javascript
Selection.selectBlock(blockId, opts?)       // Select single block
Selection.selectBlocks(blockIds)            // Select multiple blocks
Selection.selectText(blockId, offset)       // Place cursor in text block
Selection.selectRange(anchor, focus)        // Text range across blocks
Selection.clear()                           // Deselect all
Selection.get()                             // Get current selection state
Selection.restore(sel)                      // Restore a saved selection
Selection.resolveFromDOM()                  // Read browser Selection → internal state
Selection.getSelectedBlocks()               // Return block objects for selection
Selection.isCollapsed()                     // Check if text cursor (no range)
Selection.hasSelection()                    // Any selection active
```

### Behavior Specification
1. **Click on block**: Sets `selectedBlockIds` to `[blockId]`, clears text selection, highlights block in canvas, syncs layer panel highlight, updates inspector to show block settings.
2. **Click on text**: Places cursor at click position via browser Selection API, resolves to `{ blockId, offset }`, clears block selection.
3. **Shift+click**: Extends text range from anchor to clicked position, or extends block selection range.
4. **Ctrl+click**: Toggles block in multi-selection array.
5. **Arrow Up/Down at block boundaries**: Moves selection to adjacent block (first/last offset).
6. **Escape**: Clears all selection, deselects blocks, removes canvas highlighting.
7. **Selectionchange event**: Debounced handler reads browser selection, maps DOM positions to block IDs via `data-block-id` attributes, updates internal state.
8. **Canvas re-render**: After render, if selection was active, restore cursor position or block highlight.
9. **Layer panel click**: Triggers `Selection.selectBlock()`, syncs canvas highlight.
10. **Inspector interaction**: Selection persists while editing inspector fields.

### Integration Points
- **Block Engine**: Reads block IDs for validation, calls `getBlock()` to resolve positions.
- **Text Engine**: Coordinates with cursor placement after text mutations.
- **Layers Panel**: Bidirectional sync — canvas selection ↔ layer highlight.
- **Inspector Panel**: Selection determines which block's settings to display.
- **History Engine**: Selection state saved/restored with undo/redo snapshots.
- **Keyboard System**: Reads selection state for context-sensitive key handling.

### Edge Cases
- Selected block deleted → reset selection to nearest sibling or document root.
- Selected block moved → maintain selection on the same block ID.
- ContentEditable blur during selection → preserve selection state, re-sync on focus.
- Selection across nested containers → clamp to common ancestor.
- Browser selection doesn't map to known block → fall back to block-level selection.
- Empty document → no selection possible, show placeholder focus.

---

## 23. COMMAND ENGINE

### Purpose & Responsibilities
The Command Engine is the centralized registry and execution layer for all editor actions. Every user-initiated mutation (insert block, toggle bold, undo, save, etc.) flows through a registered command. Commands encapsulate undo/redo integration, availability checks, and keyboard shortcut binding.

### Command Structure
```javascript
{
  id: "editor.insertBlock",
  label: "Insert Block",
  category: "insertion",
  shortcut: null,             // e.g. "Ctrl+Shift+Enter"
  icon: "plus",
  aliases: ["add block", "new block"],
  canExecute: (ctx) => true,  // Context-aware availability
  execute: (ctx, args) => { ... },
  undoable: true
}
```

### Inputs
- Keyboard shortcut events
- Slash menu item selection
- Command palette search + execute
- Toolbar button clicks
- Programmatic calls from other engines

### Outputs
- Document mutations via Block/Text Engine APIs
- History transactions (undo/redo groups)
- UI feedback (toasts, focus changes)
- State updates across editor/document stores

### State Ownership
Owns the command registry (a `Map<string, Command>`). Does NOT own any state stores. Reads from `editor`, `document`, `selection` stores to build execution context.

### API Surface
```javascript
CommandEngine.register(command)              // Register a command
CommandEngine.unregister(id)                 // Remove command
CommandEngine.execute(id, args?)             // Execute by ID
CommandEngine.canExecute(id)                 // Check availability
CommandEngine.getCommand(id)                 // Get command definition
CommandEngine.getCommands(filter?)           // List commands, optionally filtered
CommandEngine.getShortcuts()                 // Map of shortcut → command ID
CommandEngine.buildContext()                 // Build { document, selection, editor } context
```

### Behavior Specification
1. **Registration**: Commands registered at editor init. Built-in commands first, then plugin-provided commands. Duplicate IDs rejected with warning.
2. **Execution**: `execute(id, args)` builds context, calls `canExecute`, wraps `execute` in history transaction if `undoable`, calls the command function.
3. **Shortcut handling**: Keyboard system maps `keydown` events to shortcuts via `CommandEngine.getShortcuts()`. Conflicts resolved by last-registered-wins with console warning.
4. **Context building**: `buildContext()` reads current state stores and returns `{ document, selection, editor, block, blockType }`.
5. **Availability**: `canExecute` receives context. Commands like "deleteBlock" return false if no block is selected. Slash menu filters items by availability.
6. **Feedback**: Commands may return `{ toast: "Saved", focus: blockId }` for post-execution UI actions.
7. **Transaction grouping**: Each undoable command creates a history transaction boundary. Typing sequences are grouped separately.

### Built-in Commands
- **Block CRUD**: insertBlock, deleteBlock, duplicateBlock, transformBlock, moveBlockUp, moveBlockDown
- **Text marks**: toggleBold, toggleItalic, toggleUnderline, toggleStrike, toggleCode, setLink
- **History**: undo, redo
- **Selection**: selectAll, deselect
- **Persistence**: save, publish, unpublish
- **UI**: toggleLeftSidebar, toggleRightSidebar, toggleLayers, toggleCommandPalette, openSlashMenu
- **Clipboard**: copyBlock, cutBlock, pasteBlock
- **Alignment**: alignLeft, alignCenter, alignRight, alignJustify

### Integration Points
- **Keyboard System**: Registers shortcut→command mappings, handles keydown dispatch.
- **Slash Menu**: Queries available commands for block insertion.
- **Command Palette**: Lists all commands with search/filter.
- **History Engine**: Wraps undoable commands in transactions.
- **Toolbar**: Binds button clicks to command execution.
- **Block Engine**: Executes block-level mutations through commands.

### Edge Cases
- Command executed during save → queue or reject, show "saving" state.
- Command executed on deleted block → canExecute returns false, no-op.
- Shortcut conflict → last registered wins, log warning.
- Plugin command throws → catch, log, show error toast, don't break editor.
- Command palette open + Escape → close palette, don't execute command.

---

## 24. BLOCK ENGINE

### Purpose & Responsibilities
The Block Engine manages the lifecycle of blocks within the document model: creation, deletion, transformation, movement, nesting, and rendering. It is the primary mutation layer for document content, ensuring block hierarchy integrity and type constraints.

### Block Lifecycle
1. **Creation**: `createBlock(type, overrides)` → Block instance with generated ID, defaults from BLOCK_TYPES registry.
2. **Insertion**: `insertBlock(afterId, block)` or `insertBlockAt(block, parentId, index)` → adds to document model, updates blockOrder.
3. **Rendering**: `renderBlock(block)` → DOM element with `data-block-id`, contentEditable where applicable.
4. **Mutation**: `updateBlock(id, patch)` → partial update of attrs, styles, content.
5. **Transformation**: `transformBlock(id, newType)` → changes block type, maps compatible content.
6. **Movement**: `moveBlock(id, targetParentId, index)` → repositions in hierarchy.
7. **Deletion**: `deleteBlock(id)` → removes block + descendants, updates parent references.

### Inputs
- Command Engine invocations (insertBlock, deleteBlock, etc.)
- Slash menu selections
- Drag/drop operations
- Paste operations
- Keyboard shortcuts (Enter, Backspace, Delete)

### Outputs
- Updated `document` State store (blocks map, blockOrder)
- Rendered DOM in canvas
- History transactions
- Selection updates (focus new block after insert)

### State Ownership
Owns mutations to the `document` store (`blocks`, `blockOrder`, `rootId`). Reads BLOCK_TYPES registry for defaults and constraints. Does NOT own selection, editor, or history stores.

### API Surface
```javascript
BlockEngine.createBlock(type, overrides?)           // Create block instance
BlockEngine.insertBlock(afterId, block)             // Insert after existing block
BlockEngine.insertBlockAt(block, parentId, index)   // Insert at specific position
BlockEngine.deleteBlock(blockId)                     // Remove block + descendants
BlockEngine.duplicateBlock(blockId)                  // Clone block with new IDs
BlockEngine.transformBlock(blockId, newType)         // Change block type
BlockEngine.moveBlock(blockId, direction)            // Move up/down in order
BlockEngine.moveBlockTo(blockId, parentId, index)    // Move to specific parent/index
BlockEngine.updateBlock(blockId, patch)              // Partial update
BlockEngine.getBlock(blockId)                        // Get block data
BlockEngine.getBlockChildren(blockId)                // Get child block IDs
BlockEngine.getBlockParent(blockId)                  // Get parent block ID
BlockEngine.getBlockDepth(blockId)                   // Nesting depth
BlockEngine.canNest(blockType, parentId)             // Check nesting rules
BlockEngine.renderCanvas()                           // Full canvas re-render
BlockEngine.renderBlock(block)                       // Render single block to DOM
```

### Behavior Specification
1. **Block creation**: Generates unique ID (`block_` + random), applies BLOCK_TYPES defaults, merges overrides, returns Block instance.
2. **Insertion order**: `insertBlock(afterId)` finds afterId in blockOrder, splices new block ID after it. For nested blocks, inserts into parent's children array.
3. **Deletion cascade**: `deleteBlock` recursively removes all descendant blocks, cleans up parent references, removes from blockOrder. If deleting last block, creates empty paragraph.
4. **Transformation rules**: paragraph→heading preserves text. heading→paragraph preserves text, resets level. image→paragraph not allowed (different content model). Incompatible transforms show toast.
5. **Movement**: Up/down swaps adjacent IDs in blockOrder. Cross-parent movement validates nesting rules.
6. **Nesting rules**: Containers (columns, column, group, container, blockquote, listItem) can accept children. Max depth: 10 levels. `canNest(type, parentId)` checks registry.
7. **Rendering**: Each block type maps to DOM structure. Text blocks get contentEditable. Media blocks render previews. Containers render nested blocks recursively.
8. **Empty document**: If blockOrder is empty after deletion, auto-insert empty paragraph block.

### Integration Points
- **Document Model**: Direct mutation of document store.
- **Text Engine**: Manages inline content within text-type blocks.
- **Selection Engine**: Updates selection after insert/delete/move.
- **History Engine**: Each mutation wrapped in transaction.
- **Rendering**: Triggers canvas re-render on state changes.
- **Layers Panel**: Syncs tree view on block changes.
- **Inspector**: Updates displayed block data on selection change.

### Edge Cases
- Insert block at invalid position → fall back to end of document.
- Delete root document block → prevent, show warning.
- Transform to incompatible type → toast "Cannot transform to {type}".
- Nesting depth exceeded → prevent, show "Maximum nesting depth reached".
- Concurrent block mutations → batch in State.batch(), single render.
- Block ID collision → regenerate ID.
- Block with missing parent reference → orphan detection on load, reparent to root.

---

## 25. WIDGET ENGINE

### Purpose & Responsibilities
The Widget Engine handles widget blocks — pre-configured, reusable content components (button, divider, embed, hero, CTA, FAQ, pricing, table, alert, spacer). It manages widget-specific configuration, rendering, and lifecycle distinct from standard text blocks.

### Widget Architecture
Widgets are block types with `group: "widget"` in the BLOCK_TYPES registry. They have:
- Fixed attributes defined by their type (e.g., button has `text`, `url`, `variant`)
- Non-editable content area (configured via inspector, not inline editing)
- Optional template rendering (e.g., pricing table renders from `plans` array)

### Widget Registry
```javascript
const WIDGET_REGISTRY = {
  button: {
    type: "button",
    label: "Button",
    icon: "button",
    config: {
      text: { type: "string", default: "Click me" },
      url: { type: "string", default: "#" },
      variant: { type: "select", options: ["primary", "secondary", "outline", "ghost"], default: "primary" },
      size: { type: "select", options: ["sm", "md", "lg"], default: "md" }
    },
    render: (attrs) => `<a class="btn btn-${attrs.variant} btn-${attrs.size}" href="${attrs.url}">${attrs.text}</a>`
  },
  // ... divider, spacer, embed, hero, cta, faq, pricing, table, alert
};
```

### Inputs
- Slash menu selection (insert widget)
- Command palette (insert widget)
- Inspector panel (configure widget attributes)
- Drag from widgets panel
- Pattern insertion (widgets within patterns)

### Outputs
- Widget block in document model
- Rendered widget DOM in canvas
- Widget configuration in inspector panel

### State Ownership
Widget definitions stored in `WIDGET_REGISTRY` (static). Widget instances stored as blocks in `document.blocks`. Configuration lives in block `attrs`. The widget panel reads from registry for display, reads from document for usage count.

### API Surface
```javascript
WidgetEngine.getWidgetDef(type)                // Get widget definition
WidgetEngine.createWidget(type, attrs?)        // Create widget block
WidgetEngine.renderWidget(block)               // Render widget to DOM
WidgetEngine.getConfigFields(type)             // Get configurable fields for inspector
WidgetEngine.updateWidgetAttrs(blockId, attrs) // Update widget configuration
WidgetEngine.getWidgetTypes()                  // List all widget types
WidgetEngine.validateWidget(block)             // Validate widget has required attrs
WidgetEngine.widgetFromPattern(patternData)    // Create widget from pattern definition
```

### Behavior Specification
1. **Widget creation**: Creates block with type from WIDGET_REGISTRY, applies default attrs, renders preview in canvas.
2. **Configuration**: Clicking widget block selects it, inspector shows widget-specific config fields. Changes update block attrs in real-time.
3. **Rendering**: `renderWidget(block)` calls the widget's `render(attrs)` function, returns HTML string or DOM element. Text widgets (alert, hero, CTA) have editable text zones.
4. **Widget panel**: Left sidebar "Widgets" tab shows grid of available widgets from WIDGET_REGISTRY. Drag to canvas or click to insert at cursor.
5. **Pattern integration**: Patterns may contain widget blocks. On pattern insertion, widgets are instantiated as独立 blocks with pattern-provided attrs.
6. **Media widgets**: Image, gallery, video widgets integrate with Media Picker for asset selection.
7. **Dynamic widgets**: Embed widget resolves URLs to provider-specific embeds (YouTube, Twitter, etc.).

### Integration Points
- **Block Engine**: Widgets are blocks; all block CRUD applies.
- **Inspector Panel**: Widget config fields rendered dynamically from WIDGET_REGISTRY.
- **Media Picker**: Image/gallery/video widgets open picker for asset selection.
- **Slash Menu**: Widgets listed with `group: "widget"` blocks.
- **Patterns**: Patterns can contain widget blocks.
- **Serialization**: Widget attrs serialized in document JSON.

### Edge Cases
- Widget with missing required attrs → render with defaults, show warning in inspector.
- Unknown widget type → render as generic container with "Unknown widget" label.
- Widget inside nested container → valid if container allows widget group.
- Widget attrs changed → re-render only that widget block, not full canvas.
- Media widget with deleted asset → show "Media not found" placeholder.
- Widget with script embed → sanitize URL, prevent XSS.

---

## 26. TEXT ENGINE

### Purpose & Responsibilities
The Text Engine manages inline text editing within text-type blocks (paragraph, heading, blockquote, codeBlock, listItem). It handles the contentEditable interaction layer, synchronizes DOM text state with the document model, and applies/manages inline marks (bold, italic, etc.).

### Inline Content Model
```javascript
// Block.content array for text blocks
[
  { type: "text", text: "Hello ", marks: [] },
  { type: "text", text: "world", marks: [{ type: "bold" }] },
  { type: "text", text: "!", marks: [{ type: "italic" }] }
]
```

### Mark Definitions
```javascript
const MARK_DEFS = {
  bold:       { tag: "strong", label: "Bold",       shortcut: "Ctrl+B" },
  italic:     { tag: "em",     label: "Italic",     shortcut: "Ctrl+I" },
  underline:  { tag: "u",      label: "Underline",  shortcut: "Ctrl+U" },
  strike:     { tag: "s",      label: "Strike",     shortcut: "Ctrl+Shift+X" },
  inlineCode: { tag: "code",   label: "Code",       shortcut: null },
  link:       { tag: "a",      label: "Link",       shortcut: "Ctrl+K" }
};
```

### Inputs
- Keyboard input (typing, shortcuts)
- Toolbar mark toggles
- Paste content (text with formatting)
- Slash menu (insert inline content)
- Programmatic commands (toggleBold, etc.)

### Outputs
- Updated `block.content` in document store
- Re-rendered text DOM within block
- Selection/cursor position maintained

### State Ownership
Owns `block.content` arrays for text blocks. Reads/writes to document store for text content. Coordinates with selection store for cursor position. Does NOT own block-level attrs/styles (handled by Block Engine/Inspector).

### API Surface
```javascript
TextEngine.handleInput(blockId, event)          // Handle text input event
TextEngine.handleKeyDown(blockId, event)        // Handle keydown in text block
TextEngine.insertText(blockId, text, marks?)    // Insert text at cursor
TextEngine.deleteText(blockId, from, to)        // Delete text range
TextEngine.splitBlock(blockId, offset)          // Split text at offset, create new block
TextEngine.mergeBlocks(sourceId, targetId)      // Merge text from source into target
TextEngine.toggleMark(markType)                 // Toggle mark at current selection
TextEngine.setMark(markType, attrs?)            // Apply mark to selection
TextEngine.removeMark(markType)                 // Remove mark from selection
TextEngine.getMarksAt(blockId, offset)          // Get marks active at position
TextEngine.applyMarks(marks, textNode)          // Wrap text node with mark elements
TextEngine.parseContentEditable(el)             // Read DOM → content array
TextEngine.renderContent(block)                 // Render content array → DOM
TextEngine.getPlainText(block)                  // Extract plain text from block
TextEngine.setCursorPosition(blockId, offset)   // Place cursor at offset
```

### Behavior Specification
1. **Text input**: `handleInput` reads `event.target.textContent`, parses into content array, updates document model. Debounced to avoid excessive updates during rapid typing.
2. **Mark toggling**: `toggleMark(type)` reads current selection marks, adds or removes mark from selected text nodes. If selection spans multiple text nodes with mixed marks, normalizes to consistent application.
3. **Enter key**: `splitBlock` takes text after cursor, creates new paragraph block with that text, truncates current block to text before cursor.
4. **Backspace at start**: `mergeBlocks` prepends current block's text to previous block's text, deletes current block.
5. **Delete at end**: `mergeBlocks` appends next block's text to current block, deletes next block.
6. **Soft break**: Shift+Enter inserts `<br>` within block (no new block).
7. **Link creation**: Ctrl+K opens URL input dialog, wraps selection in `<a>` tag with href, updates marks.
8. **Code block**: Plain text only, strips marks, renders in `<code>` with monospace font.
9. **Content sync**: After any DOM mutation, `parseContentEditable` reads DOM structure back to content array, ensuring model stays in sync.
10. **Cursor preservation**: After re-render, cursor position restored using saved offset or DOM range reconstruction.

### Integration Points
- **Block Engine**: Text blocks managed as blocks; splitting/merging calls Block Engine APIs.
- **Selection Engine**: Cursor positions tracked in selection state.
- **Command Engine**: Mark toggling registered as commands (toggleBold, etc.).
- **History Engine**: Text changes grouped in typing transactions (debounced 500ms).
- **Toolbar**: Mark buttons call TextEngine.toggleMark().
- **Rendering**: Text blocks rendered by TextEngine.renderContent().

### Edge Cases
- Paste into code block → strip all formatting, insert plain text.
- Empty text block after delete → keep block with empty content array.
- Marks across split point → new block inherits no marks (clean split).
- Link mark with empty href → remove link mark instead of creating broken link.
- ContentEditable reports different structure than expected → normalize to content array model.
- IME composition events → defer model update until compositionend.
- Very long text line → no wrapping in code blocks, horizontal scroll.

---

## 27. INSERTION ENGINE

### Purpose & Responsibilities
The Insertion Engine is the unified API layer for all content insertion methods. Whether content enters via slash menu, drag/drop, paste, command palette, or programmatic call, it flows through this engine. This ensures consistent behavior, undo/redo integration, and proper block placement.

### Insertion Methods
All methods ultimately call `InsertionEngine.insert()` with normalized parameters:
- **Slash menu**: User types `/`, searches, selects item → insert block at cursor
- **Command palette**: User searches command, selects "Insert {type}" → insert block
- **Toolbar**: Click "Insert block" button → insert at current selection
- **Drag/drop**: Drag block from panel → drop at indicator position
- **Paste**: Ctrl+V with content → parse and insert
- **Patterns**: Select pattern from panel → insert pattern blocks at cursor
- **Widget library**: Drag widget from panel → drop at position
- **Keyboard**: Enter at end of block → insert new paragraph below
- **Programmatic**: Plugin or script calls `InsertionEngine.insert()`

### Core Insertion API
```javascript
InsertionEngine.insert(type, opts?)
// opts: { afterId, parentId, index, attrs, content, focus, select }

InsertionEngine.insertBlocks(blocks, opts?)
// Insert multiple blocks (for patterns)

InsertionEngine.insertFromPaste(clipboardData, opts?)
// Parse and insert clipboard content

InsertionEngine.insertFromPattern(patternId, opts?)
// Load pattern and insert its blocks

InsertionEngine.insertFromDrag(dragData, dropTarget)
// Handle drag/drop insertion

InsertionEngine.resolveInsertionPoint()
// Determine where to insert based on current selection/cursor
```

### Inputs
- Slash menu item selection
- Command palette execution
- Drag/drop events
- Paste events
- Keyboard events (Enter, Tab)
- Programmatic API calls

### Outputs
- New blocks in document model
- Canvas DOM updates
- Selection moved to inserted content
- History transaction created

### State Ownership
Does NOT own any state. Reads `selection` store to determine insertion point, reads `document` store for block hierarchy. Writes to `document` store via Block Engine.

### API Surface
See Core Insertion API above. Additional helpers:
```javascript
InsertionEngine.getInsertionPoint()          // { afterId, parentId, index }
InsertionEngine.setInsertionPoint(point)     // Override insertion point
InsertionEngine.clearInsertionPoint()        // Reset to selection-based
InsertionEngine.canInsert(type)              // Check if type can be inserted at current point
InsertionEngine.showDropIndicator(position)  // Visual drop indicator
InsertionEngine.hideDropIndicator()          // Remove indicator
```

### Behavior Specification
1. **Insertion point resolution**: If text cursor active → insert after cursor's block. If block selected → insert after selected block. If nothing selected → insert at end of document.
2. **Block insertion**: Creates block via Block Engine, inserts at resolved point, focuses new block, creates history transaction.
3. **Multi-block insertion**: For patterns, inserts blocks sequentially, maintaining relative order and nesting.
4. **Paste insertion**: Parses clipboard HTML/text into block structure, inserts at cursor. Sanitizes HTML, strips unsafe attributes.
5. **Drop indicator**: Visual line shown between blocks during drag. Indicates exact insertion position. Snaps to valid positions only.
6. **Focus after insert**: New block receives focus. For text blocks, cursor placed at start. For widget blocks, block selected for inspector configuration.
7. **Empty document handling**: If document is empty, inserts as first block regardless of insertion point.
8. **Nesting on drop**: If dropped inside a container block (within its drop zone), inserts as child rather than sibling.

### Integration Points
- **Block Engine**: Creates and inserts blocks.
- **Selection Engine**: Updates selection after insertion.
- **Slash Menu**: Calls InsertionEngine.insert() on item selection.
- **Command Palette**: Calls InsertionEngine.insert() on command execution.
- **Drag/Drop**: Provides drop indicators and insertion point.
- **Paste Engine**: Parses clipboard and calls insert.
- **History Engine**: Wraps insertion in transaction.

### Edge Cases
- Insert at position that no longer exists (block deleted) → re-resolve insertion point.
- Insert invalid block type → reject, show toast.
- Paste with no clipboard data → no-op.
- Insert into locked block → prevent, show "Block is locked" toast.
- Insert into hidden block → prevent, unhide block first or show warning.
- Network lag during pattern insert → insert skeleton blocks, fill when loaded.
- Rapid successive insertions → queue, don't lose any.

---

## 28. HISTORY ENGINE

### Purpose & Responsibilities
The History Engine provides undo/redo functionality by managing state snapshots and transaction grouping. It captures document + selection state at meaningful boundaries, allowing users to step backward and forward through their edit history.

### Transaction Model
```javascript
{
  id: "txn_abc123",
  label: "Insert paragraph",       // Human-readable description
  timestamp: 1700000000000,
  documentSnapshot: { ... },       // Full document state at this point
  selectionSnapshot: { ... },      // Selection state at this point
  grouped: false                   // Part of a typing group?
}
```

### Inputs
- Undo command (Ctrl+Z)
- Redo command (Ctrl+Shift+Z)
- Document mutations (via Command Engine)
- Text input (grouped typing sequences)
- Inspector changes
- Block operations (insert, delete, move, transform)

### Outputs
- Restored document state (on undo/redo)
- Restored selection state
- Canvas re-render
- UI state updates (dirty flag, save status)

### State Ownership
Owns the `history` State store:
```javascript
{
  undoStack: [],       // Transaction[]
  redoStack: [],       // Transaction[]
  currentVersion: 0,
  maxVersions: 100
}
```
Reads `document` and `selection` stores for snapshots. Does NOT own document or selection.

### API Surface
```javascript
HistoryEngine.pushTransaction(label, opts?)   // Save current state as transaction
HistoryEngine.undo()                           // Restore previous state
HistoryEngine.redo()                           // Restore next state
HistoryEngine.canUndo()                        // Check if undo available
HistoryEngine.canRedo()                        // Check if redo available
HistoryEngine.startGroup(label)                // Start grouping transactions
HistoryEngine.endGroup()                       // End grouping
HistoryEngine.clear()                          // Clear all history
HistoryEngine.getHistory()                     // Get undo/redo stacks
HistoryEngine.createSnapshot()                 // Capture current document + selection
HistoryEngine.restoreSnapshot(snapshot)         // Restore from snapshot
```

### Behavior Specification
1. **Transaction creation**: Before any document mutation, `pushTransaction` captures current document + selection state, pushes to undoStack, clears redoStack.
2. **Undo**: Pops from undoStack, pushes current state to redoStack, restores popped snapshot, re-renders canvas, restores selection.
3. **Redo**: Pops from redoStack, pushes current state to undoStack, restores popped snapshot, re-renders canvas, restores selection.
4. **Typing grouping**: Text input events within 500ms of each other are grouped into a single transaction. `startGroup("typing")` on first keystroke, `endGroup()` on timeout or non-text action.
5. **Block operation grouping**: Related operations (e.g., split block + format new block) grouped in single transaction.
6. **Max history**: undoStack capped at `maxVersions` (100). Oldest transactions discarded.
7. **History cleared on new change after undo**: If user makes change after undoing, redoStack is cleared (standard behavior).
8. **Selection restoration**: Undo/redo restores both document state and selection state (cursor position, selected blocks).

### Integration Points
- **Command Engine**: Wraps undoable commands in transactions.
- **Text Engine**: Typing sequences grouped via startGroup/endGroup.
- **Block Engine**: Each block mutation pushes transaction.
- **Inspector**: Inspector changes push transactions (style changes, attr updates).
- **Persistence**: History NOT persisted across page loads (session only).
- **Selection**: Selection snapshots saved/restored with transactions.

### Edge Cases
- Undo to initial empty state → restore single empty paragraph.
- Redo stack cleared by new edit → expected behavior, no error.
- Undo during save → allowed, next save captures restored state.
- Max history reached → oldest transaction dropped silently.
- Transaction with missing snapshot → skip, log warning, continue.
- Undo after block deleted → block restored with original content.
- Browser refresh → history cleared (session-only). Warn if unsaved changes.

---

## 29. SERIALIZATION ENGINE

### Purpose & Responsibilities
The Serialization Engine transforms the in-memory document model to/from persistent formats: the Acroxa `contentSchema` JSON, rendered HTML, and plain text. It handles versioning, schema migrations, and ensures backward compatibility.

### Serialization Pipeline
```
Editor State (document blocks)
    ↓ serialize()
Acroxa Document JSON (contentSchema.json)
    ↓ generateHTML()
Rendered HTML (contentSchema.html)
    ↓ extractText()
Plain Text (contentSchema.raw)
    ↓ generateConditionalJS()
Conditional Rules (contentSchema.conditionalJS)
```

### Content Schema Format
```javascript
{
  json: {
    version: 1,
    blocks: { ... },         // Block map
    blockOrder: [...]        // Ordered block IDs
  },
  html: "<div>...</div>",   // Server-rendered HTML
  raw: "Plain text...",     // Extracted text
  conditionalJS: null       // Structured conditional rules
}
```

### Inputs
- Document state from `document` store
- Block content, attributes, styles
- Responsive overrides
- Widget configurations

### Outputs
- Serialized JSON for API save
- HTML string for rendering
- Plain text for SEO/excerpt
- Versioned format with migration support

### State Ownership
Does NOT own any state. Reads from `document` store for serialization, writes output to API payloads. Stateless transformation layer.

### API Surface
```javascript
SerializationEngine.serialize()                     // Full document → contentSchema
SerializationEngine.serializeJSON()                 // Document → JSON only
SerializationEngine.generateHTML(document)           // Document → HTML string
SerializationEngine.extractText(document)            // Document → plain text
SerializationEngine.deserialize(json)                // JSON → document state
SerializationEngine.migrateJSON(json, fromVersion)   // Migrate old schema to current
SerializationEngine.validateSchema(json)             // Validate JSON structure
SerializationEngine.getBlockHTML(block)              // Single block → HTML
SerializationEngine.getInlineHTML(content)           // Inline content → HTML
SerializationEngine.getMarkHTML(mark, text)          // Text with marks → HTML
```

### Behavior Specification
1. **JSON serialization**: Iterates blockOrder, serializes each block with id, type, content, attrs, styles, children, parent. Omits transient state (locked, hidden are included as they affect rendering).
2. **HTML generation**: Each block type has an HTML renderer. Text blocks → `<p>`, `<h1>`-`<h6>`. Media blocks → `<img>`, `<video>`. Containers → `<div>` with nested block HTML.
3. **Mark rendering**: Bold → `<strong>`, italic → `<em>`, link → `<a href>`, code → `<code>`.
4. **Text extraction**: Strips HTML tags, extracts text content, preserves paragraph breaks.
5. **Deserialization**: Parses JSON, reconstructs block map, validates structure, applies defaults for missing fields.
6. **Versioning**: `json.version` checked on load. If older version, `migrateJSON` applies sequential migrations.
7. **Responsive serialization**: Responsive overrides stored in block `responsive` object, only serialized if non-empty.
8. **Conditional JS**: Structured rule tree (not executable) serialized for server-side evaluation.

### Integration Points
- **Persistence Engine**: Calls serialize before API save, deserialize after API load.
- **Block Engine**: Provides block data for serialization.
- **Text Engine**: Provides inline content and marks for HTML generation.
- **Widget Engine**: Widget render functions called during HTML generation.
- **Rendering**: HTML output used for canvas preview and server rendering.

### Edge Cases
- Unknown block type → serialize as generic container, log warning.
- Missing block reference in children → skip, log warning.
- Circular parent references → detected on serialize, broken, log error.
- Very large document → serialize in chunks, report progress.
- Schema version mismatch → attempt migration, fallback to raw JSON if fails.
- Invalid HTML from widget render → sanitize, strip unsafe attributes.
- Empty document → serialize as empty blocks array, generate empty HTML.

---

## 30. PERSISTENCE ENGINE

### Purpose & Responsibilities
The Persistence Engine manages saving and loading editor content to/from the server. It handles auto-save, manual save, dirty state tracking, save queuing, retry logic, and revision management. It bridges the client-side editor state with the server-side API endpoints.

### Save Payload
```javascript
POST /acr/api/editor/:id/content
{
  content: {
    json: { ... },           // Serialized document JSON
    html: "...",             // Generated HTML
    raw: "...",              // Plain text
    conditionalJS: null
  },
  title: "Post Title",
  status: "draft",           // draft | published | scheduled
  postType: "post",
  meta: { ... },             // Post metadata
  seo: { ... }               // SEO metadata
}
```

### Inputs
- Auto-save timer (30s debounce)
- Manual save (Ctrl+S)
- Publish/unpublish commands
- Status changes from Post panel
- Title/slug changes

### Outputs
- API POST requests
- Save status updates (saving, saved, error)
- Dirty state flag
- Revision snapshots (server-side)
- Toast notifications

### State Ownership
Owns save-related fields in `editor` store: `isDirty`, `isSaving`, `lastSavedAt`, `autosaveEnabled`. Reads `document`, `editor` (title, status), post/SEO metadata for payload construction.

### API Surface
```javascript
PersistenceEngine.save()                        // Manual save
PersistenceEngine.autoSave()                    // Triggered by timer
PersistenceEngine.load(documentId, postType)    // Load document from API
PersistenceEngine.setDirty(isDirty)             // Mark dirty/clean
PersistenceEngine.isDirty()                     // Check dirty state
PersistenceEngine.enableAutoSave()              // Enable auto-save
PersistenceEngine.disableAutoSave()             // Disable auto-save
PersistenceEngine.saveNow()                     // Force immediate save (bypass debounce)
PersistenceEngine.retry()                       // Retry failed save
PersistenceEngine.publish()                     // Save with status=published
PersistenceEngine.unpublish()                   // Save with status=draft
PersistenceEngine.getSaveStatus()               // Get current save status
```

### Behavior Specification
1. **Auto-save**: On document mutation, start 30-second debounce timer. If no new mutations within 30s, trigger save. Timer reset on each mutation.
2. **Manual save**: Ctrl+S triggers immediate save, bypassing debounce. If already saving, queue after current save completes.
3. **Save flow**: Set `isSaving=true`, serialize document, POST to API, on success set `isDirty=false`, `lastSavedAt=Date.now()`, `isSaving=false`, show "Saved" toast. On failure, set `isSaving=false`, show error toast, schedule retry.
4. **Save queue**: If save requested while saving in progress, queue the request. After current save completes, execute queued save with latest state.
5. **Retry logic**: On save failure, retry after 5s, 15s, 30s (3 attempts). After 3 failures, show "Save failed" error, stop retrying until next manual save.
6. **Dirty tracking**: Any document mutation sets `isDirty=true`. Save clears it. `beforeunload` event checks `isDirty` and warns user.
7. **Load flow**: On editor init, GET `/acr/api/editor/:id/data`, deserialize JSON into document state, populate editor state (title, status, etc.).
8. **Publish flow**: `publish()` sets status to "published", saves, shows "Published" toast. `unpublish()` sets status to "draft".
9. **Revision integration**: Server creates revision on each save. Client doesn't manage revisions directly.

### Integration Points
- **Serialization Engine**: serialize/deserialize for JSON/HTML/text generation.
- **Block Engine**: Document mutations trigger dirty state.
- **Command Engine**: save, publish, unpublish registered as commands.
- **History Engine**: Save does NOT create history transaction (save is not undoable).
- **Editor State**: Updates isDirty, isSaving, lastSavedAt.
- **Footer**: Displays save status ("Saving...", "Saved at 10:30", "Unsaved changes").

### Edge Cases
- Save during network outage → queue, retry when online.
- Save with empty document → save empty document (don't prevent).
- Save with invalid blocks → validate before save, show validation errors.
- Multiple rapid saves → debounce prevents flooding, queue ensures latest state saved.
- Page close with unsaved changes → beforeunload warning.
- Load failed document → show error, offer to create new.
- Save response conflict (concurrent edit) → show "Document modified externally" warning.
- Auto-save disabled → only manual save triggers API call.
- Save with status change → include status in payload, server updates post status.

---

## 31. PLUGIN / EXTENSION ENGINE

### Purpose & Responsibilities
The Plugin/Extension Engine provides a system for discovering, registering, and lifecycle-managing editor extensions. It enables third-party or custom functionality (custom blocks, widgets, commands, keyboard shortcuts) to integrate with the editor without modifying core code.

### Plugin Architecture
Plugins follow Acroxa's existing discovery pattern — just as routes are auto-discovered from `src/views/*.js` via `module.exports.meta`, editor plugins are discovered from a designated directory structure.

### Plugin Structure
```javascript
// acrx/plugins/my-plugin/index.js
export default {
  id: "my-plugin",
  name: "My Custom Plugin",
  version: "1.0.0",
  
  // Lifecycle hooks
  onInit(editor) { },           // Called when editor initializes
  onReady(editor) { },          // Called after first render
  onDestroy(editor) { },        // Called when editor closes
  
  // Registration
  blocks: [ ... ],              // Custom block types
  widgets: [ ... ],             // Custom widget types
  commands: [ ... ],            // Custom commands
  shortcuts: { ... },           // Keyboard shortcuts
  
  // Hooks
  hooks: {
    beforeInsertBlock(block) { return block; },
    afterInsertBlock(block) { },
    beforeDeleteBlock(blockId) { return true; },  // false prevents deletion
    serialize(document) { return document; },
    deserialize(json) { return json; }
  }
};
```

### Discovery & Registration
```javascript
PluginEngine.discover()             // Scan plugin directory, load manifests
PluginEngine.register(plugin)       // Register a plugin
PluginEngine.unregister(id)         // Remove plugin
PluginEngine.getPlugin(id)          // Get plugin instance
PluginEngine.getPlugins()           // List all registered plugins
PluginEngine.executeHook(hook, args) // Execute a hook across all plugins
```

### Inputs
- Plugin files from `acrx/plugins/` directory
- Plugin registration via API (future)
- Plugin configuration from admin panel

### Outputs
- Registered blocks, widgets, commands, shortcuts
- Hook executions at lifecycle points
- Plugin-provided UI elements (panels, menus)

### State Ownership
Does NOT own state stores. Plugin-provided blocks/widgets stored in BLOCK_TYPES/WIDGET_REGISTRY. Plugin commands stored in Command Engine registry. Plugin state (if needed) managed by plugin itself via State.create() with plugin-namespaced store.

### Behavior Specification
1. **Discovery**: On editor init, scan `acrx/plugins/*/index.js`, import each, call `register()`.
2. **Registration**: Plugin's blocks added to BLOCK_TYPES, widgets to WIDGET_REGISTRY, commands to CommandEngine, shortcuts to Keyboard system.
3. **Lifecycle**: `onInit` called during editor startup. `onReady` called after first render. `onDestroy` called on editor close.
4. **Hooks**: Core engine calls `executeHook()` at defined points. Plugins can modify data or prevent actions (before hooks return false to cancel).
5. **Isolation**: Plugins can't access other plugins' internal state. Communication via events or shared State stores.
6. **Error handling**: Plugin errors caught and logged, don't break editor. Failed plugin skipped, warning shown.
7. **Hot reload**: During development, plugin changes reload without full page refresh (future).

### Integration Points
- **Block Engine**: Plugin blocks available for insertion.
- **Widget Engine**: Plugin widgets available in widget panel.
- **Command Engine**: Plugin commands available in slash menu and palette.
- **Keyboard System**: Plugin shortcuts registered.
- **Serialization**: Plugin hooks extend serialize/deserialize.
- **Events**: Plugins can subscribe to editor events.
- **State**: Plugins can create namespaced State stores.

### Edge Cases
- Plugin with duplicate block type ID → reject, log warning.
- Plugin depends on missing plugin → check dependencies, skip if missing.
- Plugin modifies core behavior dangerously → sandbox execution, timeout.
- Plugin registration after editor ready → register dynamically, trigger re-render.
- Plugin with invalid manifest → skip, log error.
- Plugin removed → unregister all contributions, clean up hooks.
- Plugin conflicts with another plugin → last registered wins, show conflict warning.

---

## 32. EVENT SYSTEM

### Purpose & Responsibilities
The Event System provides a publish/subscribe mechanism for inter-component communication. It allows subsystems to emit events and other subsystems to react to them without direct coupling. Events are categorized by ownership to avoid global pollution.

### Event Categories
```javascript
const EVENT_CATEGORIES = {
  editor: "editor",       // Editor lifecycle events
  document: "document",   // Document mutation events
  selection: "selection", // Selection change events
  block: "block",         // Block-specific events
  widget: "widget",       // Widget-specific events
  persistence: "persistence", // Save/load events
  command: "command",     // Command execution events
  ui: "ui"                // UI interaction events
};
```

### Event Catalog
```javascript
// Editor events
"editor:init"                // Editor initialized
"editor:ready"               // Editor fully loaded and rendered
"editor:destroy"             // Editor closing

// Document events
"document:changed"           // Any document mutation
"document:blockInserted"     // New block added
"document:blockRemoved"      // Block deleted
"document:blockMoved"        // Block repositioned
"document:blockTransformed"  // Block type changed
"document:loaded"            // Document loaded from API

// Selection events
"selection:changed"          // Any selection change
"selection:blockSelected"    // Block selected
"selection:textSelected"     // Text range selected
"selection:cleared"          // Selection cleared

// Widget events
"widget:inserted"            // Widget added to document
"widget:changed"             // Widget configuration updated
"widget:removed"             // Widget deleted

// Persistence events
"persistence:saveStarted"    // Save initiated
"persistence:saveCompleted"  // Save succeeded
"persistence:saveFailed"     // Save failed
"persistence:loaded"         // Document loaded

// Command events
"command:executed"           // Command executed
"command:failed"             // Command execution failed

// UI events
"ui:sidebarToggled"          // Sidebar open/close
"ui:panelChanged"            // Active panel changed
"ui:slashMenuOpened"         // Slash menu shown
"ui:commandPaletteOpened"    // Command palette shown
```

### API Surface
```javascript
EventSystem.on(event, callback, opts?)    // Subscribe to event
EventSystem.off(event, callback)          // Unsubscribe
EventSystem.emit(event, data)             // Emit event
EventSystem.once(event, callback)         // Subscribe once
EventSystem.emitCancellable(event, data)  // Emit, return false to cancel
EventSystem.getListeners(event)           // List subscribers
EventSystem.clear(category?)             // Clear all or category listeners
```

### Behavior Specification
1. **Subscription**: `on(event, callback)` registers listener. Optional `opts: { priority: 0, context: null }` for ordering.
2. **Emission**: `emit(event, data)` calls all listeners for that event in priority order. Data is immutable (clone before passing).
3. **Cancellable events**: `emitCancellable(event, data)` returns false if any listener calls `data.preventDefault()`. Used for before-hooks (beforeDelete, beforeSave).
4. **Once**: `once(event, callback)` auto-removes after first call.
5. **Priority**: Listeners called in priority order (higher = first). Default priority 0.
6. **Ownership**: Events namespaced by category (`block:inserted`). Subsystems subscribe to relevant categories only.
7. **Error handling**: Listener errors caught, logged, don't prevent other listeners from firing.
8. **Cleanup**: `clear(category)` removes all listeners in a category. Called on editor destroy.

### Integration Points
- **All engines**: Emit events on significant actions.
- **Plugin Engine**: Plugins subscribe to events for reactive behavior.
- **UI panels**: Subscribe to relevant events for live updates.
- **Persistence**: Emits save lifecycle events.
- **Logging/Analytics**: Subscribe to events for tracking (future).

### Edge Cases
- Listener throws error → catch, log, continue to next listener.
- Emit during emit (nested) → queue, process after current emission completes.
- Listener removes itself during emit → safe, removed after current emission.
- Event with no listeners → no-op, no error.
- Too many listeners (>1000) → warn, suggest cleanup.
- Memory leak from forgotten subscriptions → clear on component destroy.

---

## 33. KEYBOARD SYSTEM

### Purpose & Responsibilities
The Keyboard System handles all keyboard interactions in the editor: shortcuts, navigation, editing keys, and focus management. It maps key events to commands, handles intelligent behaviors for cursor movement, and manages focus across the editor's UI components.

### Shortcut Registry
```javascript
const SHORTCUTS = {
  // Editing
  "Enter":             "editor.splitBlock",
  "Shift+Enter":       "editor.softBreak",
  "Backspace":         "editor.backspace",
  "Delete":            "editor.deleteForward",
  "Tab":               "editor.indent",
  "Shift+Tab":         "editor.outdent",
  
  // Navigation
  "ArrowUp":           "editor.moveCursorUp",
  "ArrowDown":         "editor.moveCursorDown",
  "ArrowLeft":         "editor.moveCursorLeft",
  "ArrowRight":        "editor.moveCursorRight",
  "Home":              "editor.cursorHome",
  "End":               "editor.cursorEnd",
  
  // Selection
  "Ctrl+A":            "editor.selectAll",
  "Shift+ArrowUp":     "editor.extendSelectionUp",
  "Shift+ArrowDown":   "editor.extendSelectionDown",
  
  // Marks
  "Ctrl+B":            "editor.toggleBold",
  "Ctrl+I":            "editor.toggleItalic",
  "Ctrl+U":            "editor.toggleUnderline",
  "Ctrl+Shift+X":      "editor.toggleStrike",
  
  // History
  "Ctrl+Z":            "editor.undo",
  "Ctrl+Shift+Z":      "editor.redo",
  
  // System
  "Ctrl+S":            "editor.save",
  "Ctrl+K":            "editor.openCommandPalette",
  "Escape":            "editor.escape",
  
  // Blocks
  "Ctrl+Shift+Enter":  "editor.insertBlockAfter",
  "Ctrl+D":            "editor.duplicateBlock",
  "Ctrl+Shift+D":      "editor.deleteBlock",
  "Alt+ArrowUp":       "editor.moveBlockUp",
  "Alt+ArrowDown":     "editor.moveBlockDown"
};
```

### Inputs
- `keydown` events on editor shell
- `keyup` events for modifier tracking
- Focus changes between UI components

### Outputs
- Command execution via Command Engine
- Cursor movement
- Focus changes
- Selection updates

### State Ownership
Does NOT own state. Reads `editor` store for current focus, `selection` store for cursor position. Modifies selection via Selection Engine. Executes commands via Command Engine.

### API Surface
```javascript
KeyboardSystem.init()                          // Register keydown handler
KeyboardSystem.registerShortcut(shortcut, cmd) // Register shortcut
KeyboardSystem.unregisterShortcut(shortcut)    // Remove shortcut
KeyboardSystem.getShortcut(commandId)          // Get shortcut for command
KeyboardSystem.setFocusArea(area)              // Set active focus area
KeyboardSystem.getFocusArea()                  // Get current focus area
KeyboardSystem.focusBlock(blockId, offset?)    // Focus specific block
KeyboardSystem.focusNextBlock()                // Move focus to next block
KeyboardSystem.focusPreviousBlock()            // Move focus to previous block
KeyboardSystem.focusFirstBlock()               // Focus first block
KeyboardSystem.focusLastBlock()                // Focus last block
KeyboardSystem.isModifierDown(key)             // Check modifier state
```

### Behavior Specification
1. **Keydown handling**: Single `keydown` listener on editor shell. Reads key + modifiers (Ctrl, Shift, Alt, Meta), builds shortcut string ("Ctrl+Shift+Z"), looks up in SHORTCUTS registry, executes mapped command.
2. **Modifier tracking**: Tracks Ctrl, Shift, Alt, Meta state. Shortcuts require exact modifier match (Ctrl+B, not just B).
3. **Context sensitivity**: Some shortcuts only active in certain contexts. Tab only indents in lists. Arrow keys navigate blocks when cursor at block boundary.
4. **Enter key**: In text block → split block. In empty list item → outdent. At end of block → insert new paragraph. In container → focus first child.
5. **Backspace**: At block start → merge with previous. In empty block → delete block. In list → outdent if indented.
6. **Arrow keys**: Move cursor within text. At text boundary → move to adjacent block (first/last offset). Shift+Arrow extends selection.
7. **Tab**: In list items → indent/outdent. In code blocks → insert tab character. Elsewhere → insert tab or move to next focus area.
8. **Escape**: Close any open menu/palette/dialog. Clear selection. Blur current focus.
9. **Focus management**: After block operations (insert, delete, move), focus follows logical target. Insert → focus new block. Delete → focus previous/next. Move → maintain focus on moved block.
10. **Conflict prevention**: Prevent default browser behavior for handled shortcuts (Ctrl+B doesn't trigger browser bold). Unhandled keys pass through to browser.

### Integration Points
- **Command Engine**: Maps shortcuts to commands, executes them.
- **Selection Engine**: Reads/writes selection state for cursor movement.
- **Text Engine**: Handles text-specific key behavior (typing, splitting).
- **Block Engine**: Handles block-level key behavior (insert, delete, move).
- **Slash Menu**: "/" key triggers slash menu.
- **Command Palette**: Ctrl+K triggers command palette.
- **UI components**: Focus management between canvas, sidebars, panels.

### Edge Cases
- Keydown during IME composition → ignore, let IME handle.
- Keydown in input fields (inspector, title) → don't intercept, let field handle.
- Shortcut conflict with browser → preventDefault only for handled shortcuts.
- Multiple rapid keystrokes → queue, process sequentially.
- Focus lost during key handling → re-evaluate focus area.
- Unknown shortcut → no-op, no error.
- Modifier key held too long → release modifier resets state.
- Accessibility: All shortcuts work with keyboard only, no mouse required.

---

## 34. SLASH MENU

### Purpose & Responsibilities
The Slash Menu is a contextual insertion menu triggered by typing "/" in an empty or active text block. It provides searchable, categorized access to all insertable block types, widgets, and patterns.

### Trigger Behavior
1. User types "/" at the start of an empty block or after a space
2. Slash menu appears below the cursor position
3. Menu filters as user continues typing after "/"
4. Menu closes on Escape, selection, or clicking outside

### Menu Structure
```javascript
const SLASH_CATEGORIES = [
  {
    id: "text",
    label: "Text",
    items: [
      { id: "paragraph",   label: "Paragraph",   icon: "paragraph",   keywords: ["text", "p"] },
      { id: "heading",     label: "Heading",      icon: "heading",     keywords: ["h1", "h2", "title"] },
      { id: "blockquote",  label: "Blockquote",   icon: "blockquote",  keywords: ["quote"] },
      { id: "codeBlock",   label: "Code Block",   icon: "code",        keywords: ["code", "pre"] },
      { id: "bulletList",  label: "Bullet List",  icon: "list-ul",     keywords: ["ul", "unordered"] },
      { id: "orderedList", label: "Ordered List", icon: "list-ol",     keywords: ["ol", "ordered"] },
      { id: "taskList",    label: "Task List",    icon: "check-square",keywords: ["todo", "checkbox"] }
    ]
  },
  {
    id: "media",
    label: "Media",
    items: [
      { id: "image",  label: "Image",  icon: "image",  keywords: ["photo", "picture"] },
      { id: "gallery",label: "Gallery",icon: "images", keywords: ["photos", "grid"] },
      { id: "video",  label: "Video",  icon: "video",  keywords: ["movie", "youtube"] },
      { id: "embed",  label: "Embed",  icon: "code",   keywords: ["iframe", "link"] }
    ]
  },
  {
    id: "widgets",
    label: "Widgets",
    items: [
      { id: "button", label: "Button", icon: "button",  keywords: ["link", "cta"] },
      { id: "divider",label: "Divider",icon: "minus",   keywords: ["hr", "line", "separator"] },
      { id: "spacer", label: "Spacer", icon: "space",   keywords: ["gap", "margin"] },
      { id: "alert",  label: "Alert",  icon: "alert",   keywords: ["notice", "info", "warning"] },
      { id: "hero",   label: "Hero",   icon: "image",   keywords: ["banner", "jumbotron"] },
      { id: "cta",    label: "CTA",    icon: "pointer", keywords: ["call to action"] },
      { id: "table",  label: "Table",  icon: "table",   keywords: ["spreadsheet", "grid"] },
      { id: "faq",    label: "FAQ",    icon: "question",keywords: ["accordion"] },
      { id: "pricing",label: "Pricing",icon: "dollar",  keywords: ["plans", "pricing table"] }
    ]
  },
  {
    id: "layout",
    label: "Layout",
    items: [
      { id: "columns",  label: "Columns",  icon: "columns", keywords: ["grid", "side by side"] },
      { id: "container",label: "Container", icon: "box",     keywords: ["wrapper", "group"] }
    ]
  }
];
```

### API Surface
```javascript
SlashMenu.open()                     // Show slash menu at cursor
SlashMenu.close()                    // Hide slash menu
SlashMenu.isOpen()                   // Check if menu is visible
SlashMenu.search(query)              // Filter items by query
SlashMenu.selectItem(itemId)         // Insert item and close
SlashMenu.moveSelection(direction)   // Navigate items with arrow keys
SlashMenu.getPosition()              // Get menu position { top, left }
SlashMenu.setPosition(pos)           // Set menu position
SlashMenu.render()                   // Render menu DOM
SlashMenu.getFilteredItems(query)    // Get items matching query
```

### Behavior Specification
1. **Trigger**: "/" typed in empty block or after whitespace → `open()`. Menu appears 8px below cursor, aligned to left edge of block.
2. **Search**: Characters after "/" used as search query. Filtered against item labels and keywords. Categories with no matches hidden. Show "No results" if empty.
3. **Keyboard navigation**: ArrowUp/Down moves highlight. Enter selects highlighted item. Escape closes menu. Tab selects and moves to next category header.
4. **Selection**: Enter or click on item → `selectItem(itemId)`. Creates block of selected type, inserts at cursor position, closes menu.
5. **Positioning**: Menu positioned relative to cursor using `window.getSelection().getRangeAt(0).getBoundingClientRect()`. Adjusts if near viewport edges.
6. **Category headers**: Groups shown as headers above items. Clicking header does nothing (not selectable).
7. **Dynamic items**: Widget items pulled from WIDGET_REGISTRY. Plugin-provided items added dynamically.
8. **Nesting context**: If cursor is inside a container block, inserted block becomes child of that container.
9. **Cancellation**: Escape, clicking outside, scrolling, or switching focus closes menu without inserting.

### Integration Points
- **Insertion Engine**: Calls `InsertionEngine.insert()` on item selection.
- **Block Engine**: Creates block of selected type.
- **Widget Engine**: Widget items from WIDGET_REGISTRY.
- **Command Engine**: Slash menu commands registered as editor.openSlashMenu.
- **Keyboard System**: "/" key triggers open, arrow keys navigate, Enter selects.
- **Selection Engine**: Reads cursor position for menu placement and insertion point.
- **Plugin Engine**: Plugins can add custom items to slash menu.

### Edge Cases
- "/" typed in non-empty block → don't trigger (only in empty or after space).
- Menu open + block deleted → close menu.
- Menu open + cursor moved outside block → close menu.
- Very long query → truncate display, still filter.
- Unicode characters in search → case-insensitive, accent-insensitive matching.
- Menu near bottom of viewport → flip to appear above cursor.
- Menu open during auto-save → menu stays open, save doesn't interfere.
- Multiple "/" characters → only first "/" triggers, rest treated as search query.

---

## 35. COMMAND PALETTE

### Purpose & Responsibilities
The Command Palette (Ctrl+K) is a global search and execution interface for all editor commands. It provides keyboard-driven access to any action: block insertion, formatting, navigation, UI toggles, save/publish, and plugin commands.

### Palette Structure
```
┌─────────────────────────────────────┐
│ 🔍 Search commands...               │
├─────────────────────────────────────┤
│ Recently Used                        │
│   📝 Insert Paragraph               │
│   🎨 Toggle Bold                    │
├─────────────────────────────────────┤
│ Blocks                               │
│   📝 Paragraph                      │
│   📰 Heading                        │
│   📷 Image                          │
├─────────────────────────────────────┤
│ Formatting                           │
│   B  Bold                           │
│   I  Italic                         │
│   U  Underline                      │
├─────────────────────────────────────┤
│ Actions                              │
│   💾 Save                           │
│   📤 Publish                        │
│   ↩️ Undo                           │
│   ↪️ Redo                           │
├─────────────────────────────────────┤
│ UI                                   │
│   📋 Toggle Layers Panel            │
│   ⚙️ Toggle Inspector               │
│   🔲 Toggle Fullscreen              │
└─────────────────────────────────────┘
```

### Inputs
- Ctrl+K / Cmd+K keyboard shortcut
- Search query typing
- Arrow key navigation
- Enter to execute
- Escape to close

### Outputs
- Command execution via Command Engine
- UI state updates (panel toggles, etc.)
- Document mutations (block insertion, formatting)

### State Ownership
Owns `commandPaletteOpen` in `editor` store. Reads from Command Engine registry for available commands. Tracks `recentCommands` in local (non-persisted) state.

### API Surface
```javascript
CommandPalette.open()                  // Show command palette
CommandPalette.close()                 // Hide command palette
CommandPalette.isOpen()                // Check if open
CommandPalette.search(query)           // Filter commands
CommandPalette.executeSelected()       // Execute highlighted command
CommandPalette.moveSelection(dir)      // Navigate results
CommandPalette.getRecentCommands()     // Get recently used commands
CommandPalette.addRecentCommand(id)    // Track command usage
CommandPalette.render()                // Render palette DOM
CommandPalette.getFilteredCommands(q)  // Get commands matching query
CommandPalette.groupByCategory(cmds)   // Group commands by category
```

### Behavior Specification
1. **Opening**: Ctrl+K (or Cmd+K on Mac) opens palette. Focus moves to search input. Palette appears centered in viewport with backdrop overlay.
2. **Search**: As user types, commands filtered by label, category, aliases, and shortcuts. Results grouped by category. Recently used commands shown first.
3. **Navigation**: ArrowUp/Down moves highlight through results. Results are flat list (categories are visual only, not focusable). Page Up/Down for long lists.
4. **Execution**: Enter executes highlighted command. Palette closes after execution. Command executed via Command Engine with current context.
5. **Recent commands**: Last 5 executed commands shown at top under "Recently Used". Stored in localStorage for persistence across sessions.
6. **Command availability**: `canExecute` checked for each command. Unavailable commands shown greyed out with reason tooltip.
7. **Keyboard shortcuts**: Shortcuts displayed next to command labels (e.g., "Save  Ctrl+S").
8. **Categories**: Commands grouped as: Recently Used, Blocks, Formatting, Actions, UI, Plugin (dynamic).
9. **Closing**: Escape closes palette without executing. Clicking backdrop closes. Focus returns to previous element.
10. **Command feedback**: After execution, palette shows brief "Executed: {command}" confirmation before closing.

### Integration Points
- **Command Engine**: Reads all registered commands, executes selected command.
- **Keyboard System**: Ctrl+K shortcut registered.
- **Editor State**: `commandPaletteOpen` flag.
- **Slash Menu**: Complementary — slash menu for blocks only, palette for all commands.
- **Plugin Engine**: Plugin commands added to palette dynamically.
- **Recent commands**: localStorage for persistence.

### Edge Cases
- Palette open + Escape → close, return focus to canvas.
- Palette open + Ctrl+K → close palette (toggle behavior).
- No matching commands → show "No commands found" message.
- Command executed while palette open → palette closes, command runs.
- Very long command list → virtualize if >50 items.
- Special characters in search → treat as literal, not regex.
- Palette during save → palette works normally, save continues in background.
- Palette + slash menu both open → close slash menu when palette opens.

---

## 36. CONTEXT MENUS

### Purpose & Responsibilities
Context Menus provide right-click (or long-press on touch) contextual actions for different editor elements. Each context (text, block, widget, layer, empty canvas) has a tailored menu with relevant actions.

### Context Menu Types

#### Text Context Menu
```
Cut                     Ctrl+X
Copy                    Ctrl+C
Paste                   Ctrl+V
────────────────────
Bold                    Ctrl+B
Italic                  Ctrl+I
Underline               Ctrl+U
Strikethrough           Ctrl+Shift+X
────────────────────
Link                    Ctrl+K
Clear Formatting
────────────────────
Select All              Ctrl+A
```

#### Block Context Menu
```
Transform To
  → Paragraph
  → Heading 1-6
  → Blockquote
  → Code Block
────────────────────
Duplicate               Ctrl+D
Copy Block
Cut Block               Ctrl+X
────────────────────
Move Up                 Alt+↑
Move Down               Alt+↓
────────────────────
Insert Block Above
Insert Block Below
────────────────────
Lock
Hide
────────────────────
Delete                  Ctrl+Shift+D
```

#### Widget Context Menu
```
Configure Widget
Edit Content
────────────────────
Duplicate
Copy Widget
────────────────────
Move Up
Move Down
────────────────────
Replace Widget
────────────────────
Delete
```

#### Layer Context Menu
```
Select
Rename
────────────────────
Duplicate
Copy
────────────────────
Move Up
Move Down
Move to Parent
────────────────────
Visibility
Lock
────────────────────
Delete
```

#### Empty Canvas Context Menu
```
Paste                   Ctrl+V
────────────────────
Insert Block
  → Paragraph
  → Heading
  → Image
  → ...
────────────────────
Select All              Ctrl+A
```

### API Surface
```javascript
ContextMenu.open(context, position)      // Show menu for context at position
ContextMenu.close()                       // Hide menu
ContextMenu.isOpen()                       // Check if menu visible
ContextMenu.registerContext(context, items) // Register menu items for context
ContextMenu.unregisterContext(context)     // Remove context menu
ContextMenu.getItem(id)                    // Get menu item definition
ContextMenu.executeItem(id)                // Execute menu item action
ContextMenu.render(context, position)      // Render menu DOM
ContextMenu.adjustPosition(menu, viewport) // Adjust for viewport edges
```

### Behavior Specification
1. **Trigger**: Right-click on element → determine context from `data-*` attributes or DOM hierarchy. Long-press (500ms) on touch devices.
2. **Context detection**: Walk up DOM from event target. Find `data-block-id` → block context. Find `data-layer-id` → layer context. Find block with widget type → widget context. No block found → empty canvas context.
3. **Positioning**: Menu appears at cursor position. Adjusts if near viewport edges (flip to other side if needed).
4. **Item actions**: Click item → execute action, close menu. Actions call Command Engine or direct API.
5. **Submenus**: "Transform To" and "Insert Block" have submenus. Hover opens submenu after 200ms delay.
6. **Disabled items**: Items that can't execute in current context shown greyed out (e.g., "Move Up" on first block).
7. **Keyboard**: Arrow keys navigate items. Enter executes. Escape closes. Right arrow opens submenu. Left arrow closes submenu.
8. **Close on**: Escape, click outside, scroll, start typing, another menu opens.
9. **Touch support**: Long-press triggers context menu. Tap outside closes. Swipe dismisses.

### Integration Points
- **Command Engine**: Menu items execute commands.
- **Block Engine**: Block actions (duplicate, delete, move) via commands.
- **Widget Engine**: Widget-specific actions (configure, replace).
- **Selection Engine**: Select block on context menu open.
- **Layers Panel**: Layer context menu for tree items.
- **Keyboard System**: Keyboard navigation within menu.

### Edge Cases
- Right-click during drag → cancel drag, show context menu.
- Context menu + slash menu open → close slash menu.
- Context menu + command palette open → close palette.
- Block is locked → hide "Edit" options, show "Unlock" option.
- Block is hidden → show "Unhide" option prominently.
- No blocks in document → empty canvas menu only.
- Context menu for root document block → limited options (no delete, no move).
- Touch device + no right-click → long-press triggers menu.
- Multiple rapid right-clicks → close previous, open new.

---

## 37. EDITOR SHELL — TOP BAR, BREADCRUMBS, DOCUMENT TITLE, SAVE STATE, DEVICE CONTROLS, PUBLISH CONTROLS

### Purpose & Responsibilities
The Editor Shell is the outermost chrome that frames the entire editing experience. It contains the top bar (back button, document title, save status, device mode switcher, publish controls), breadcrumb navigation, and footer status. It is the server-rendered HTML structure (`src/views/editor.js`) that the client-side runtime enhances with live data.

### UI Structure

```
┌───────────────────────────────────────────────────────────────┐
│ [←] [≡] [title________________] [Draft▾] [Save▾] [⚙] [⋯]  │
│        ┌──────────────────────────────────────────┐          │
│        │ Desktop │ Tablet │ Mobile    [Preview]   │          │
│        └──────────────────────────────────────────┘          │
├───────────────────────────────────────────────────────────────┤
│  Canvas Area                                                  │
├───────────────────────────────────────────────────────────────┤
│ Root > Text Block > Paragraph    Saved 10:30   Ln 4, Col 12  │
└───────────────────────────────────────────────────────────────┘
```

### Top Bar Components
| Component | Element ID | Purpose | Behavior |
|-----------|-----------|---------|----------|
| Back button | `#editor-back-btn` | Return to posts list | Navigate to `/acrx/posts` |
| Sidebar toggle | `#editor-left-sidebar-toggle` | Toggle left sidebar | Toggle `.sdb-left` class |
| Document title | `#editor-doc-title` | Display/edit post title | contentEditable, syncs to `editor.title` |
| Autosave toggle | `#autosave-toggle` | Enable/disable autosave | Toggles `editor.autosaveEnabled` |
| Status dropdown | `#save-status-btn` | Show/set post status | Opens status dropdown (Draft/Published/Scheduled) |
| Save button | `#save-dropdown-btn` | Manual save | Calls `PersistenceEngine.save()` |
| Device mode | `#device-mode-group` | Switch viewport mode | desktop/tablet/mobile preview |
| Publish button | `#publish-btn` | Publish post | Calls `PersistenceEngine.publish()` |
| Right sidebar | `#editor-right-sidebar-toggle` | Toggle right sidebar | Toggle `.sdb-right` class |
| More actions | `#more-actions-btn` | Overflow menu | Opens more actions dropdown |

### Breadcrumb Navigation
The footer breadcrumb reflects the currently selected block's position in the document tree:
```
Root > Columns > Column > Paragraph
```
- Updates on selection change
- Each segment is clickable — navigates selection to that ancestor block
- Max depth: truncate with "..." for deeply nested paths

### Save State Display
Footer center shows save status:
- `Saving...` — during API call
- `Saved at HH:MM` — after successful save
- `Unsaved changes` — when dirty
- `Save failed` — on error

### Data Source
- `editor` State store: `title`, `status`, `isDirty`, `isSaving`, `lastSavedAt`, `autosaveEnabled`, `deviceMode`
- `selection` store: `selectedBlockId` for breadcrumb resolution
- `document` store: `blocks` for breadcrumb path computation

### Behavior Specification
1. **Document title editing**: Click title → contentEditable activates. On blur or Enter, updates `editor.title` in state and marks document dirty.
2. **Save flow**: Ctrl+S or click Save → `PersistenceEngine.save()` → footer shows "Saving..." → on success shows "Saved at {time}".
3. **Auto-save indicator**: When autosave enabled, pulse animation on save icon. When disabled, icon shows strikethrough.
4. **Device mode switching**: Click Desktop/Tablet/Mobile → updates `editor.deviceMode` → canvas applies viewport class (`device-desktop`, `device-tablet`, `device-mobile`) → responsive overrides activate.
5. **Publish flow**: Click Publish → confirmation dialog → `PersistenceEngine.publish()` → status changes to "published", button text changes to "Update".
6. **Status dropdown**: Draft → can publish or schedule. Published → can unpublish or schedule. Scheduled → can cancel schedule.
7. **Breadcrumb click**: Click any ancestor segment → `Selection.selectBlock(blockId)` for that ancestor.
8. **Dirty warning**: `beforeunload` event checks `editor.isDirty`, shows browser warning if unsaved changes.

### Integration Points
- **Persistence Engine**: Save/publish/unpublish calls
- **Selection Engine**: Breadcrumb updates on selection change
- **Responsive Engine**: Device mode affects canvas viewport
- **State Engine**: Reactive updates for title, status, save state
- **Block Engine**: Breadcrumb path computation from block hierarchy

### Edge Cases
- Title empty → show placeholder "Untitled", prevent publish
- Save during network failure → queue, retry, show error toast
- Device mode switch while editing → preserve selection, re-render responsive overrides
- Publish with empty document → warn "Document is empty", allow publish
- Rapid title changes → debounce 500ms before state update
- Breadcrumb for deeply nested block (10+ levels) → truncate middle with "..."

---

## 38. LEFT SIDEBAR — BLOCKS PANEL, LAYERS PANEL, PATTERNS PANEL, WIDGETS PANEL, TAB BEHAVIOR

### Purpose & Responsibilities
The Left Sidebar provides access to the Blocks panel (block insertion), Layers panel (document tree), Patterns panel (reusable patterns), and Widgets panel (widget library). It uses a tab-based interface with a shared toggle and persistent tab state.

### UI Structure

```
┌──────────────────────────────┐
│ [Blocks] [Layers] [Patterns] [Widgets] │
├──────────────────────────────┤
│                              │
│  (Active Panel Content)      │
│                              │
│                              │
│                              │
└──────────────────────────────┘
```

### Tab Definitions
| Tab | Panel ID | Icon | Content |
|-----|----------|------|---------|
| Blocks | `#blocks-panel` | grid | Block type grid for insertion |
| Layers | `#layers-panel` | layers | Document tree hierarchy |
| Patterns | `#patterns-panel` | layout | Reusable pattern library |
| Widgets | `#widgets-panel` | puzzle | Widget library grid |

### Tab Behavior
1. **Tab switching**: Click tab → hide all panels, show selected panel, update `editor.leftActivePanel` state
2. **Tab persistence**: Active tab remembered across sidebar close/reopen
3. **Tab keyboard**: Left/Right arrow keys navigate tabs when tab bar focused
4. **Badge counts**: Layers tab shows block count badge. Patterns tab shows saved count.
5. **Empty states**: Each panel shows appropriate empty state when no content

### Blocks Panel
Grid of insertable block types from BLOCK_TYPES registry, organized by category:
- **Text**: Paragraph, Heading, Blockquote, Code Block, Lists
- **Media**: Image, Gallery, Video, Embed
- **Layout**: Columns, Container
- **Widgets**: Button, Divider, Spacer, Alert, Hero, CTA, Table, FAQ, Pricing

Each block type shown as icon + label. Click to insert at cursor. Drag to insert at position.

### Data Source
- `editor.leftActivePanel` — current tab
- `editor.leftSidebarOpen` — visibility
- `document.blocks` / `document.blockOrder` — for layer count badge
- `WIDGET_REGISTRY` — for widgets panel
- `PATTERN_REGISTRY` — for patterns panel
- `BLOCK_TYPES` — for blocks panel

### Behavior Specification
1. **Open/close**: Toggle button in header. Sidebar slides in from left. Canvas narrows. Transition: 200ms ease.
2. **Tab activation**: Click tab → `State.set("editor.leftActivePanel", tabId)` → panel content switches.
3. **Block insertion from panel**: Click block type → `InsertionEngine.insert(type)` → block added at cursor, panel stays open.
4. **Drag from panel**: Drag block type icon → drag preview shows block outline → drop on canvas triggers insertion.
5. **Search in panels**: Each panel has search input. Filters items by label/keywords. Search persists until cleared.
6. **Responsive collapse**: On narrow viewport (< 768px), sidebar becomes overlay instead of inline.
7. **Panel height**: Panel fills available height, scrolls if content overflows.

### Integration Points
- **Insertion Engine**: Block/pattern/widget insertion calls
- **Selection Engine**: Layer panel syncs selection
- **Block Engine**: Block count for badge
- **Widget Engine**: Widget definitions for widgets panel
- **Pattern Engine**: Pattern definitions for patterns panel
- **State Engine**: Reactive sidebar state

### Edge Cases
- Sidebar open + block drag → sidebar auto-closes if overlap
- Tab switch during search → preserve search query per panel
- Empty document → blocks panel shows "Start typing or pick a block"
- No saved patterns → patterns panel shows "No patterns yet" with create button
- Sidebar resize → panels reflow, min-width 240px
- Multiple rapid tab switches → debounce, show final tab only

---

## 39. RIGHT SIDEBAR — POST PANEL, SEO PANEL, BLOCK INSPECTOR PANEL, TAB BEHAVIOR

### Purpose & Responsibilities
The Right Sidebar provides context-sensitive settings: Post panel (document-level metadata), SEO panel (search optimization), and Block Inspector panel (selected block properties). The Block Inspector tab activates automatically when a block is selected.

### UI Structure

```
┌──────────────────────────────┐
│ [Post] [SEO] [Block]         │
├──────────────────────────────┤
│                              │
│  (Active Panel Content)      │
│                              │
│                              │
└──────────────────────────────┘
```

### Tab Definitions
| Tab | Panel ID | Default Active | Content |
|-----|----------|----------------|---------|
| Post | `#post-panel` | No | Post metadata controls |
| SEO | `#seo-panel` | Yes (initially) | SEO settings + analysis |
| Block | `#block-panel` | On block select | Block inspector controls |

### Tab Behavior
1. **Auto-switch to Block tab**: When a block is selected in canvas and right sidebar is open, automatically switch to Block tab. When block deselected, revert to previously active tab.
2. **Tab persistence**: Post/SEO tabs remember last active. Block tab auto-activates on selection.
3. **Tab badge**: Block tab shows block type icon when a block is selected.

### Data Source
- `editor.rightActivePanel` — current tab
- `editor.rightSidebarOpen` — visibility
- `editor.selectedBlockId` — triggers Block tab activation
- Post data: `editor.title`, `editor.status`, post metadata
- SEO data: `seo` store
- Block data: `document.blocks[selectedBlockId]`

### Behavior Specification
1. **Open/close**: Toggle button in header. Sidebar slides in from right. Canvas narrows.
2. **Block tab auto-activation**: `State.watch("editor.selectedBlockId", id => { if (id) switchToTab("block") })` — only when sidebar is open.
3. **Post panel**: Title input (syncs with top bar title), slug input (auto-generated from title, editable), status selector, author display, date picker, featured image selector, excerpt textarea, category checkboxes, tag input, template selector.
4. **SEO panel**: Title input with character count, description textarea with count, focus keyword input, canonical URL, robots checkbox (noIndex/noFollow), Open Graph fields, SEO score display with suggestions.
5. **Block inspector**: Dynamic content based on selected block type. Shows identity, layout, typography, background, border, effects, responsive, and advanced sections.
6. **Inspector update flow**: Change control → `State.set("document.blocks.${id}.styles.${prop}", value)` → canvas re-render → history transaction → dirty state.
7. **Responsive overrides**: Inspector shows current device mode. Changes apply to `block.responsive.${deviceMode}` if not in desktop mode.

### Integration Points
- **Block Inspector** (section 41): Block tab panel content
- **Post Controls** (section 42): Post panel content
- **SEO Panel** (section 43): SEO panel content
- **Selection Engine**: Block tab activates on selection
- **State Engine**: Reactive panel state
- **History Engine**: Inspector changes create undo transactions
- **Persistence Engine**: Post/SEO changes mark dirty

### Edge Cases
- Block deleted while Block tab active → switch to Post or SEO tab
- Inspector change on deleted block → no-op, switch tab
- Post panel + top bar title out of sync → both sync to `editor.title`
- SEO title exceeds limit → show red count, trim on save
- Inspector for locked block → show "Block is locked" message, disable controls
- Sidebar narrow (< 280px) → collapse labels, show icons only

---

## 40. LAYERS PANEL — HIERARCHICAL TREE, PARENT/CHILD, EXPAND/COLLAPSE, REORDER, VISIBILITY, LOCK

### Purpose & Responsibilities
The Layers Panel renders the document as a hierarchical tree, mirroring the block structure. It provides selection, expand/collapse for nested blocks, drag-to-reorder, visibility toggling, and lock toggling. It is the structural overview of the document.

### UI Structure

```
▼ [的眼睛] [锁] Document
  ▼ [的眼睛] [锁] Columns
    ▶ [的眼睛] [锁] Column 1
    ▶ [的眼睛] [锁] Column 2
  ▶ [的眼睛] [锁] Paragraph
  ▶ [的眼睛] [锁] Image
```

### Tree Node Structure
Each node renders:
- **Expand/collapse arrow**: Toggles child visibility (only for blocks with children)
- **Visibility icon**: Eye/eye-off toggle for `block.hidden`
- **Lock icon**: Lock/unlock toggle for `block.locked`
- **Block type icon**: Icon matching block type
- **Block label**: Block type name + truncated text preview
- **Selection highlight**: Blue background when selected

### Data Source
- `document.blocks` — all blocks
- `document.blockOrder` — root-level order
- `editor.selectedBlockId` — current selection highlight
- Block hierarchy: `block.children`, `block.parent`

### Behavior Specification
1. **Tree rendering**: Walk `blockOrder` recursively. For each block, render node, then render children if `block.children.length > 0`. Indentation: 16px per depth level.
2. **Selection sync**: Click node → `Selection.selectBlock(blockId)` → canvas highlights block, inspector shows block settings. Canvas selection → layer node highlights.
3. **Expand/collapse**: Click arrow → toggle `node.expanded` state (local UI state, not in document model). All expanded by default.
4. **Visibility toggle**: Click eye icon → `State.set("document.blocks.${id}.hidden", !hidden)` → canvas block gets `display: none` or opacity treatment. Hidden blocks shown with dimmed icon.
5. **Lock toggle**: Click lock icon → `State.set("document.blocks.${id}.locked", !locked)` → block cannot be edited, moved, or deleted. Locked blocks show lock icon overlay in canvas.
6. **Drag reorder**: Drag node handle → show drop indicator between nodes → drop triggers `BlockEngine.moveBlockTo(id, newParentId, index)`.
7. **Rename**: Double-click node label → inline edit → update block label (for blocks that support naming, e.g., containers).
8. **Context menu**: Right-click node → context menu with Duplicate, Copy, Move Up/Down, Delete, Lock, Hide, etc.
9. **Multi-select**: Ctrl+click nodes → add to `editor.selectedBlockIds`.
10. **Scroll sync**: When canvas scrolls to a block, layer panel scrolls to show that node.

### Tree Update Triggers
- Block inserted → add node in tree
- Block deleted → remove node
- Block moved → reorder nodes
- Block type changed → update icon/label
- Selection changed → update highlight

### Integration Points
- **Block Engine**: Reads block hierarchy, executes move/delete/duplicate
- **Selection Engine**: Bidirectional sync — canvas ↔ layers
- **Inspector Panel**: Click layer → inspector shows block settings
- **Drag/Drop Engine**: Layer drag uses same drop indicator system
- **History Engine**: Reorder operations create undo transactions

### Edge Cases
- Document with 500+ blocks → virtualize tree rendering (render visible nodes only)
- Deeply nested blocks (10+ levels) → horizontal scroll, truncated labels
- Block deleted → remove node, select nearest sibling or parent
- Block moved to different parent → tree re-renders, selection maintained
- Hidden blocks → shown in tree with dimmed style, not hidden in tree itself
- Locked blocks → drag disabled, context menu limited
- Circular parent reference → break cycle, reparent to root
- Empty document → show "No blocks" message in layers panel

---

## 41. BLOCK INSPECTOR — IDENTITY, LAYOUT, TYPOGRAPHY, BACKGROUND, BORDER, EFFECTS, RESPONSIVE, ADVANCED

### Purpose & Responsibilities
The Block Inspector is the right sidebar's Block tab panel. It displays and allows editing of the currently selected block's properties, organized into collapsible sections: Identity, Layout, Typography, Background, Border, Effects, Responsive, and Advanced.

### Inspector Sections

#### Identity
- Block type display (read-only)
- Block ID (read-only, copyable)
- CSS classes input
- Custom HTML ID input
- Custom data attributes

#### Layout
- Display mode (block/inline/flex/grid)
- Width/Height (px, %, auto)
- Min/Max width/height
- Margin (top/right/bottom/left)
- Padding (top/right/bottom/left)
- Gap (for flex/grid)
- Alignment (horizontal/vertical)
- Overflow (visible/hidden/scroll/auto)

#### Typography
- Font family (dropdown with common fonts)
- Font size (number + unit selector)
- Font weight (100-900 slider/dropdown)
- Line height (number + unit)
- Letter spacing (number + unit)
- Text alignment (left/center/right/justify)
- Text color (color picker)
- Text decoration (none/underline/overline/line-through)
- Text transform (none/uppercase/lowercase/capitalize)

#### Background
- Background color (color picker)
- Background image (URL or media picker)
- Background position (x/y)
- Background size (cover/contain/auto/custom)
- Background repeat (no-repeat/repeat/repeat-x/repeat-y)
- Gradient (type, angle, color stops)

#### Border
- Border width (top/right/bottom/left)
- Border style (none/solid/dashed/dotted/double)
- Border color (color picker)
- Border radius (top-left/top-right/bottom-left/bottom-right)
- Individual side toggles

#### Effects
- Opacity (0-1 slider)
- Box shadow (x/y/blur/spread/color)
- Text shadow (x/y/blur/color)
- Transform (translate/scale/rotate/skew)
- Transition (property/duration/timing/delay)
- CSS filter (blur/brightness/contrast/drop-shadow)

#### Responsive
- Device-specific overrides (desktop/tablet/mobile)
- Per-device visibility toggle
- Per-device layout changes
- "Inherited" indicator for values from parent breakpoint
- "Override" indicator for device-specific values

#### Advanced
- Custom CSS classes (comma-separated)
- Custom HTML attributes (key-value pairs)
- Conditional visibility rules
- Custom CSS (text area, sanitized)

### Data Source
- `document.blocks[selectedBlockId]` — block data
- `block.styles` — layout, typography, background, border, effects
- `block.attrs` — block attributes
- `block.responsive` — responsive overrides
- `block.customClasses`, `block.customId`, `block.customAttributes`

### Behavior Specification
1. **Panel population**: On block selection change, read block data, populate all controls. Each control shows current value from block.
2. **Control change flow**: Change control → `State.set("document.blocks.${id}.styles.${prop}", value)` → canvas re-render → history transaction → dirty state.
3. **Unit selectors**: Numeric inputs have unit dropdown (px, %, em, rem, vh, vw). Default: px.
4. **Color pickers**: Open color picker overlay. Supports hex, rgba, named colors. Recently used colors saved.
5. **Responsive mode**: When device mode ≠ desktop, changes go to `block.responsive.${deviceMode}.styles`. Desktop shows base values.
6. **Inherited values**: In responsive mode, values not overridden show as "(from Desktop)" with italic text.
7. **Reset to default**: Each section has reset button. Resets to BLOCK_TYPES defaults.
8. **Section collapse**: Each section collapsible. State saved in localStorage.
9. **Multi-block selection**: When multiple blocks selected, shows common properties. Different values shown as "Mixed".

### Integration Points
- **Block Engine**: Reads/writes block data
- **Selection Engine**: Reads selected block ID
- **Responsive Engine**: Reads device mode, writes responsive overrides
- **History Engine**: Each change creates undo transaction
- **Rendering**: Canvas re-renders on style changes
- **Media Picker**: Background image and media selection

### Edge Cases
- No block selected → show "Select a block to edit" message
- Block deleted while editing → switch to "No selection" state
- Invalid CSS value → revert to previous valid value, show toast
- Locked block → all controls disabled, show "Block is locked"
- Responsive override on desktop mode → apply to base styles
- Very deep nesting → inspector shows full path in identity section
- Mixed multi-selection values → show "Mixed", clear on individual edit

---

## 42. POST CONTROLS — TITLE, SLUG, STATUS, AUTHOR, DATE, FEATURED IMAGE, EXCERPT, CATEGORIES, TAGS, TEMPLATE

### Purpose & Responsibilities
The Post Controls panel (Post tab in right sidebar) manages document-level metadata: title, URL slug, publishing status, author, publish date, featured image, excerpt, categories, tags, and template selection. Changes here affect the post entity, not individual blocks.

### Panel Fields

| Field | Type | Source | Behavior |
|-------|------|--------|----------|
| Title | text input | `editor.title` | Syncs with top bar title, debounce 500ms |
| Slug | text input | `editor.slug` | Auto-generated from title, editable |
| Status | dropdown | `editor.status` | draft/published/scheduled |
| Author | display | `editor.author` | Read-only, shows current user |
| Publish date | datetime picker | `editor.publishDate` | Future date = scheduled |
| Featured image | media picker | `editor.featuredImage` | Opens media picker |
| Excerpt | textarea | `editor.excerpt` | Max 300 chars, word count |
| Categories | checkbox list | `editor.categories` | Fetched from API |
| Tags | tag input | `editor.tags` | Type + Enter to add, comma to separate |
| Template | dropdown | `editor.template` | Fetched from API |

### Data Source
- `editor` State store: `title`, `slug`, `status`, `author`, `publishDate`, `featuredImage`, `excerpt`, `categories`, `tags`, `template`
- API: `GET /api/categories` for category list
- API: `GET /api/templates` for template list

### Behavior Specification
1. **Title sync**: Title input in Post panel bidirectionally syncs with top bar title. Changes in either update `editor.title`.
2. **Slug auto-generation**: On first title change, slug auto-generated (lowercase, hyphens, strip special chars). After manual edit, auto-generation stops.
3. **Status flow**: Draft → can Publish or Schedule. Published → can Unpublish or Schedule. Scheduled → can Cancel Schedule or Publish Now.
4. **Featured image**: Click placeholder → opens Media Picker → selection sets `editor.featuredImage` with `{ url, alt, width, height }`.
5. **Categories**: Checkbox list loaded from API. Max selection configurable. Nested categories shown with indentation.
6. **Tags**: Type tag name + Enter → adds tag. Comma also separates. Backspace removes last tag. Tags shown as removable chips.
7. **Template**: Dropdown with available templates. "Default" template uses standard layout.
8. **Publish date**: If date is in future, status automatically becomes "scheduled". If date is past or now, status becomes "published".

### Integration Points
- **Persistence Engine**: Post data included in save payload
- **Top Bar**: Title syncs bidirectionally
- **SEO Panel**: Title/description may reference post title
- **Media Picker**: Featured image selection
- **History Engine**: Post changes create undo transactions
- **Validation Engine**: Title required for publish

### Edge Cases
- Title empty → slug field disabled, publish button disabled
- Slug conflict → append numeric suffix (-2, -3)
- Publish date in past → treat as "publish now"
- Categories API fails → show "Failed to load categories" with retry
- Tags with special characters → strip HTML, sanitize
- Featured image deleted from media library → show "Image not found" in panel
- Template not found → fall back to default template
- Status change during save → queue status change with next save

---

## 43. SEO — TITLE, DESCRIPTION, KEYWORD, CANONICAL, ROBOTS, OPEN GRAPH, ANALYSIS

### Purpose & Responsibilities
The SEO Panel (SEO tab in right sidebar) manages search engine optimization metadata and provides real-time SEO analysis. It stores SEO data separately from document content, in the `seo` State store.

### Panel Fields

| Field | Type | Max Length | Purpose |
|-------|------|-----------|---------|
| SEO Title | text input | 60 chars | Page title in search results |
| Meta Description | textarea | 160 chars | Description in search results |
| Focus Keyword | text input | — | Primary keyword for analysis |
| Canonical URL | text input | — | Override canonical URL |
| No Index | checkbox | — | Prevent search engine indexing |
| No Follow | checkbox | — | Prevent link following |
| OG Title | text input | — | Open Graph title |
| OG Description | textarea | — | Open Graph description |
| OG Image | media picker | — | Open Graph image |
| Twitter Card | select | — | summary / summary_large_image |

### SEO Analysis
Real-time analysis displays:
- **Title length**: Green (30-60), Yellow (20-29 or 61-70), Red (<20 or >70)
- **Description length**: Green (120-160), Yellow (80-119 or 161-200), Red (<80 or >200)
- **Keyword in title**: Yes/No indicator
- **Keyword in description**: Yes/No indicator
- **Keyword density**: Calculated percentage with recommendation
- **Content length**: Word count with recommendation
- **Readability**: Flesch-Kincaid score estimate
- **Overall score**: 0-100 score with color coding

### Search Preview
Shows how the page would appear in Google search:
```
┌─────────────────────────────────────┐
│ Page Title — Site Name              │
│ https://site.com/page-slug          │
│ Meta description text appears here  │
│ with up to 160 characters...        │
└─────────────────────────────────────┘
```

### Data Source
- `seo` State store: `title`, `description`, `keyword`, `canonical`, `robots`, `og`, `twitter`
- `editor` store: `title`, `slug` (for default SEO title/description)
- `document` store: `blocks` (for content analysis)

### Behavior Specification
1. **Default values**: On first load, SEO title defaults to post title, description defaults to excerpt or first 160 chars of content.
2. **Character counting**: Real-time character count with color indicators. Over-limit shown in red.
3. **Keyword analysis**: On keyword input, scan document text for keyword occurrences. Calculate density (keyword count / total words × 100).
4. **Analysis refresh**: Recalculate on any document change (debounced 1s).
5. **OG fallback**: If OG title empty, use SEO title. If OG description empty, use meta description.
6. **Canonical auto-generation**: If canonical URL empty, auto-generate from site URL + slug.
7. **Score calculation**: Weighted formula: title (20%), description (20%), keyword in title (15%), keyword in description (10%), keyword density (15%), content length (10%), readability (10%).

### Integration Points
- **Persistence Engine**: SEO data included in save payload as `seo` object
- **Post Controls**: Title/description reference post title/excerpt
- **Document Model**: Content analysis reads block text
- **Server-side SEO**: `seoReport` from API for initial state
- **Validation**: SEO title required, description recommended

### Edge Cases
- No focus keyword → skip keyword-related analysis items
- Content too short for analysis → show "Add more content for analysis"
- Special characters in title → count as single character
- Very long content (10k+ words) → analysis capped, show "Extensive content"
- SEO panel opened before document loaded → show loading state
- Keyword in HTML tags → only count visible text occurrences
- Multiple focus keywords → only primary keyword analyzed (future: multiple keywords)

---

## 44. PATTERNS — REUSABLE PATTERNS, SAVED BLOCKS, CATEGORIES, SEARCH, PREVIEW, INSERTION

### Purpose & Responsibilities
The Patterns Panel provides access to reusable content patterns — pre-designed block arrangements that can be inserted into the document. Patterns are saved to the server and available across all documents.

### Panel Structure

```
┌──────────────────────────────┐
│ 🔍 Search patterns...        │
├──────────────────────────────┤
│ Categories:                  │
│ [All] [Headers] [CTAs]      │
│ [Footers] [Features] [FAQ]  │
├──────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ 📷  │ │ 📷  │ │ 📷  │    │
│ │ Pat1│ │ Pat2│ │ Pat3│    │
│ └─────┘ └─────┘ └─────┘    │
│ ┌─────┐ ┌─────┐             │
│ │ 📷  │ │ 📷  │             │
│ │ Pat4│ │ Pat5│             │
│ └─────┘ └─────┘             │
└──────────────────────────────┘
```

### Pattern Structure
```javascript
{
  id: "pattern_abc123",
  name: "Hero Section",
  category: "headers",
  thumbnail: "/media/pattern-thumb.jpg",
  blocks: [ ... ],           // Array of block definitions
  tags: ["hero", "banner", "header"],
  createdAt: "2025-01-15",
  updatedAt: "2025-06-20"
}
```

### Data Source
- API: `GET /acr/api/patterns` — list all patterns
- API: `GET /acr/api/patterns/:id` — get pattern details
- `editor` store: for current device mode (thumbnail preview)

### Behavior Specification
1. **Pattern loading**: On panel open, fetch patterns from API. Cache in local state. Show loading skeleton during fetch.
2. **Category filtering**: Category tabs filter pattern grid. "All" shows all patterns.
3. **Search**: Filter patterns by name and tags. Debounced 300ms search.
4. **Preview on hover**: Hover pattern thumbnail → show enlarged preview with block outline.
5. **Insertion**: Click pattern → `InsertionEngine.insertFromPattern(patternId)` → blocks inserted at cursor position.
6. **Drag to insert**: Drag pattern thumbnail → drop indicator on canvas → insert at drop position.
7. **Pattern saving**: "Save as Pattern" in block context menu → saves selected blocks as new pattern.
8. **Pattern editing**: Click pattern in canvas → shows "Edit Pattern" button → opens pattern in isolation mode (future).
9. **Thumbnail generation**: Pattern thumbnails auto-generated from rendered pattern preview.
10. **Categories**: Predefined categories (Headers, CTAs, Footers, Features, FAQ, Testimonials, Pricing) + custom categories from server.

### Integration Points
- **Insertion Engine**: Pattern insertion via `insertFromPattern()`
- **Block Engine**: Creates blocks from pattern definition
- **Media Picker**: Pattern thumbnails use media system
- **Persistence Engine**: Patterns saved/loaded via API
- **Plugin Engine**: Plugins can register custom patterns

### Edge Cases
- API fetch fails → show "Failed to load patterns" with retry button
- Pattern contains deleted widget blocks → insert with placeholder
- Pattern too large (>50 blocks) → warn "Large pattern, may affect performance"
- Pattern with responsive overrides → overrides preserved on insertion
- Pattern insertion into locked block → prevent, show "Cannot insert into locked block"
- No patterns available → show "No patterns yet. Save blocks as a pattern to start."
- Pattern thumbnail generation fails → show pattern name instead of image

---

## 45. WIDGET LIBRARY — DISCOVERY, REGISTRATION, CATEGORIES, SEARCH, PREVIEW, INSERTION

### Purpose & Responsibilities
The Widget Library panel provides a catalog of available widget types that can be inserted into the document. Widgets are pre-built, configurable content components (buttons, dividers, alerts, heroes, etc.) defined in the WIDGET_REGISTRY and optionally provided by plugins.

### Panel Structure

```
┌──────────────────────────────┐
│ 🔍 Search widgets...         │
├──────────────────────────────┤
│ Categories:                  │
│ [All] [Basic] [Media]       │
│ [Interactive] [Layout]      │
├──────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ 🔲  │ │ ⚡  │ │ 📷  │    │
│ │Buttn│ │Divid│ │Image│    │
│ └─────┘ └─────┘ └─────┘    │
│ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ 📊  │ │ ❓  │ │ 💰  │    │
│ │Table│ │ FAQ │ │Price│    │
│ └─────┘ └─────┘ └─────┘    │
└──────────────────────────────┘
```

### Widget Categories
| Category | Widgets |
|----------|---------|
| Basic | Button, Divider, Spacer, Table |
| Media | Image, Gallery, Video, Embed |
| Interactive | Alert, FAQ, Pricing |
| Layout | Hero, CTA, Columns |

### Data Source
- `WIDGET_REGISTRY` — built-in widget definitions
- Plugin-provided widgets — registered via Plugin Engine
- API: `GET /acr/api/widgets` — custom saved widgets (future)

### Behavior Specification
1. **Widget discovery**: On panel open, enumerate WIDGET_REGISTRY + plugin widgets. Build display list with icons, labels, descriptions.
2. **Category filtering**: Category tabs filter widget grid. "All" shows all widgets.
3. **Search**: Filter widgets by label, category, description. Debounced 300ms.
4. **Preview on hover**: Hover widget → show rendered preview with example data.
5. **Insertion**: Click widget → `InsertionEngine.insert(type)` → widget block inserted at cursor.
6. **Drag to insert**: Drag widget icon → drop indicator on canvas → insert at drop position.
7. **Widget configuration**: After insertion, widget selected → Block Inspector shows widget-specific config fields from WIDGET_REGISTRY.
8. **Plugin widgets**: Dynamically registered widgets appear in library with "Plugin" badge.
9. **Widget description**: Each widget shows brief description on hover tooltip.

### Widget Registration
```javascript
// Built-in registration
WIDGET_REGISTRY.set("button", {
  type: "button",
  label: "Button",
  icon: "button",
  category: "basic",
  description: "A clickable button with link",
  config: {
    text: { type: "string", default: "Click me" },
    url: { type: "string", default: "#" },
    variant: { type: "select", options: ["primary", "secondary", "outline", "ghost"] }
  },
  render: (attrs) => `<a class="btn btn-${attrs.variant}">${attrs.text}</a>`
});

// Plugin registration
PluginEngine.registerWidget({
  type: "custom-form",
  label: "Custom Form",
  icon: "form",
  category: "interactive",
  render: (attrs) => `<form>...</form>`
});
```

### Integration Points
- **Widget Engine**: Widget definitions, creation, rendering
- **Insertion Engine**: Widget insertion via `insert()`
- **Block Inspector**: Widget configuration fields
- **Plugin Engine**: Plugin-provided widgets
- **Media Picker**: Image/gallery/video widget asset selection

### Edge Cases
- Widget type not in registry → render "Unknown widget" placeholder
- Plugin widget with missing render function → show config only, no preview
- Widget with required config fields → show "Configure" prompt after insertion
- Widget inside container → valid if container allows widget group
- Widget with deleted media asset → show "Media not found" in widget preview
- Too many widgets in library → virtualize grid if >50 widgets
- Widget with XSS in config → sanitize all string values

---

## 46. MEDIA — MEDIA PICKER, UPLOAD, SEARCH, FILTERING, IMAGE SELECTION, ALT TEXT, CAPTIONS

### Purpose & Responsibilities
The Media system provides image and file selection for blocks (image, gallery, video, button backgrounds, etc.). It includes a Media Picker component (already implemented at `acrx/assets/js/components/mediaPicker.js`), media library browsing, upload functionality, and image metadata management.

### Media Picker Component
The existing `mediaPicker.js` component is a full-featured media picker. It integrates with the editor for:
- Image block source selection
- Gallery block image selection
- Featured image selection (Post panel)
- Background image selection (Block Inspector)
- Pattern thumbnail selection

### Panel Structure (Media Library)
```
┌──────────────────────────────┐
│ 🔍 Search media...    [Upload]│
├──────────────────────────────┤
│ Filters: [All] [Images]      │
│ [Videos] [Documents]         │
├──────────────────────────────┤
│ ┌───┐ ┌───┐ ┌───┐ ┌───┐    │
│ │   │ │   │ │   │ │   │    │
│ │   │ │   │ │   │ │   │    │
│ └───┘ └───┘ └───┘ └───┘    │
│ ┌───┐ ┌───┐ ┌───┐ ┌───┐    │
│ │   │ │   │ │   │ │   │    │
│ └───┘ └───┘ └───┘ └───┘    │
└──────────────────────────────┘
```

### Media Selection Flow
```
User clicks image block placeholder
    ↓
Media Picker opens
    ↓
User searches/browses/uploads
    ↓
User selects image
    ↓
Metadata panel shows: alt text, caption, dimensions, file size
    ↓
User sets alt text + caption
    ↓
"Insert" button
    ↓
Image block attrs updated: { src, alt, caption, width, height }
    ↓
Canvas re-renders image
    ↓
History transaction created
```

### Image Metadata
```javascript
{
  id: "media_abc123",
  url: "/uploads/image.jpg",
  alt: "Descriptive alt text",
  caption: "Optional caption text",
  width: 1200,
  height: 800,
  fileSize: 245000,
  mimeType: "image/jpeg",
  focalPoint: { x: 50, y: 50 }   // Percentage-based
}
```

### Data Source
- API: `GET /acr/api/media/files` — list media files
- API: `POST /acr/api/media/upload` — upload new files
- `acrx/assets/js/components/mediaPicker.js` — existing picker component
- Block attrs: `src`, `alt`, `caption` for image blocks

### Behavior Specification
1. **Picker opening**: Click image placeholder or "Change Image" → Media Picker opens as modal overlay.
2. **Browsing**: Grid view of media library. Click thumbnail → select, show metadata panel.
3. **Search**: Search by filename, alt text, tags. Debounced 300ms.
4. **Filtering**: Filter by type (images, videos, documents), date, size.
5. **Upload**: Drag file onto picker or click Upload button. Progress indicator. Multiple files supported.
6. **Alt text**: Required field shown on selection. Character count. Accessibility recommendation.
7. **Caption**: Optional text field. Stored with image metadata.
8. **Focal point**: Click image to set focal point (for responsive cropping).
9. **Image replacement**: Click existing image block → picker opens → select new image → replaces src, preserves alt/caption.
10. **Gallery selection**: Multi-select mode for gallery blocks. Click to add/remove. Order shown.

### Integration Points
- **Media Picker Component**: Existing `mediaPicker.js`
- **Block Engine**: Image/gallery/video block attrs
- **Persistence Engine**: Media files stored server-side
- **API Endpoints**: `/acr/api/media/upload`, `/acr/api/media/files`
- **Block Inspector**: Alt text and caption editing

### Edge Cases
- Upload fails → show error, allow retry
- Image deleted from library while referenced → show "Image not found" in block
- Very large image (>10MB) → warn, offer resize on upload
- Non-image file for image block → reject, show "Please select an image"
- Alt text empty → show accessibility warning in inspector
- Media picker during save → picker works independently
- Concurrent uploads → queue, show individual progress
- Image with EXIF orientation → auto-correct on display

---

## 47. RESPONSIVE EDITING — BREAKPOINTS, INHERITED/OVERRIDDEN VALUES, VISIBILITY, DEVICE PREVIEW

### Purpose & Responsibilities
The Responsive Editing system allows setting different styles and layouts for different device breakpoints (desktop, tablet, mobile). Values set in desktop mode are inherited by smaller breakpoints unless explicitly overridden.

### Breakpoints
| Mode | Viewport Width | CSS Class | Default |
|------|---------------|-----------|---------|
| Desktop | >= 1024px | `device-desktop` | Base styles |
| Tablet | 768px - 1023px | `device-tablet` | Inherits from desktop |
| Mobile | < 768px | `device-mobile` | Inherits from desktop |

### Inheritance Model
```
Desktop (base styles)
    ↓ inherited by
Tablet (can override specific values)
    ↓ inherited by
Mobile (can override specific values)
```

- Styles set in desktop mode → applied to `block.styles`
- Styles set in tablet mode → applied to `block.responsive.tablet.styles`
- Styles set in mobile mode → applied to `block.responsive.mobile.styles`
- At render time, mobile overrides tablet overrides desktop base

### Device Preview
The canvas switches viewport width when device mode changes:
- **Desktop**: Full canvas width
- **Tablet**: Canvas constrained to 768px width, centered
- **Mobile**: Canvas constrained to 375px width, centered

### UI Indicators
In the Block Inspector, when in tablet/mobile mode:
- Fields with inherited values show `(from Desktop)` in italic
- Fields with overrides show `Override` badge in blue
- Reset button per field to remove override and inherit from desktop

### Visibility Per Device
Each block has per-device visibility:
```javascript
block.responsive = {
  mobile: { hidden: false },
  tablet: { hidden: false },
  desktop: { hidden: false }
}
```
- Hidden blocks shown in canvas with dashed border and "Hidden on {device}" label
- Hidden blocks shown in layers panel with eye-off icon

### Data Source
- `editor.deviceMode` — current device mode
- `block.styles` — desktop/base styles
- `block.responsive.mobile` — mobile overrides
- `block.responsive.tablet` — tablet overrides
- Canvas viewport CSS

### Behavior Specification
1. **Device mode switch**: Click Desktop/Tablet/Mobile in top bar → `State.set("editor.deviceMode", mode)` → canvas applies viewport class, inspector shows mode-specific values.
2. **Style setting in responsive mode**: In tablet mode, changing a style writes to `block.responsive.tablet.styles.${prop}`. In mobile mode, writes to `block.responsive.mobile.styles.${prop}`.
3. **Value resolution**: Inspector reads from `block.responsive.${deviceMode}.styles.${prop}` if exists, else from `block.styles.${prop}` (desktop base).
4. **Override indicator**: If value comes from responsive override, show blue "Override" badge. If inherited, show "(from Desktop)" label.
5. **Reset to inherited**: Click reset on a field → remove override → value falls back to desktop base.
6. **Visibility toggle**: Per-device visibility in inspector or layers panel. Hidden blocks rendered with placeholder in canvas.
7. **Canvas preview**: Canvas width transitions smoothly between device widths. 200ms animation.
8. **Inspector re-render**: On device mode change, all inspector controls re-read values for the new mode.
9. **Preview mode**: "Preview" button in device mode bar hides all editor chrome, shows pure content at device width.

### Integration Points
- **Block Inspector** (section 41): Reads device mode, writes responsive overrides
- **Rendering**: Canvas applies device class, blocks check responsive hidden state
- **Serialization**: Responsive overrides serialized in block `responsive` object
- **Layers Panel**: Shows per-device visibility icons
- **Persistence**: Responsive overrides saved in document JSON

### Edge Cases
- Setting same value as desktop → don't create override (optimization)
- All devices hidden → warn "Block hidden on all devices"
- Device mode switch during text editing → preserve cursor position
- Responsive override on deleted property → clean up orphan overrides
- Deeply nested responsive blocks → each level inherits independently
- Print media → treated as desktop mode
- Canvas resize below tablet breakpoint → don't auto-switch device mode

---

## 48. DYNAMIC/CONDITIONAL CONTENT — CONDITIONAL RENDERING, DYNAMIC FIELDS, VISIBILITY CONDITIONS

### Purpose & Responsibilities
The Dynamic/Conditional Content system allows blocks to be conditionally rendered based on rules (user role, date, URL parameters, etc.) and to display dynamic data fields. Conditions are stored as structured data in the document model, NOT as executable JavaScript.

### Condition Model
```javascript
// Block-level conditional visibility
block.conditions = {
  enabled: true,
  logic: "all",        // "all" = AND, "any" = OR
  rules: [
    {
      type: "userRole",
      operator: "equals",
      value: "admin",
      action: "show"    // "show" or "hide"
    },
    {
      type: "dateRange",
      operator: "between",
      value: { start: "2025-01-01", end: "2025-12-31" },
      action: "show"
    }
  ],
  fallback: "hidden"    // "hidden" = hide, "default" = show default content
};

// Dynamic content fields
block.dynamicFields = {
  fieldName: {
    type: "text",       // "text", "image", "url", "date", "number"
    source: "post",     // "post", "user", "custom"
    path: "title"       // Dot-path to data source
  }
};
```

### Condition Types
| Type | Description | Operators | Values |
|------|-------------|-----------|--------|
| userRole | Current user's role | equals, not_equals | admin, editor, author, subscriber |
| loggedIn | User authentication | is_true, is_false | — |
| dateRange | Current date | between, before, after | ISO date strings |
| urlParam | URL parameter | equals, contains, exists | Parameter name + value |
| screenWidth | Viewport width | greater, less, equals | Pixel value |
| customField | Post custom field | equals, contains, exists | Field name + value |

### Dynamic Fields
Dynamic fields replace block content with server-side data:
```html
<!-- Editor shows placeholder -->
<p data-dynamic-field="post.title" class="dynamic-placeholder">[Post Title]</p>

<!-- Rendered output -->
<p>Hello World</p>
```

### Data Source
- `block.conditions` — conditional rules
- `block.dynamicFields` — dynamic field definitions
- Server-side evaluation at render time
- `contentSchema.conditionalJS` — serialized condition tree

### Behavior Specification
1. **Condition editor**: In Block Inspector → Advanced → Conditional Visibility. Add rules with type/operator/value dropdowns. Logic toggle (All/Any).
2. **Condition preview**: In editor, blocks with conditions shown with a small condition icon. Hover shows rule summary. Blocks always visible in editor (conditions evaluated at runtime).
3. **Dynamic field editor**: In Block Inspector → Advanced → Dynamic Fields. Map block content fields to data sources.
4. **Dynamic field placeholder**: In canvas, dynamic content shown as `[FieldName]` placeholder with dashed border.
5. **Runtime evaluation**: Server evaluates conditions before rendering HTML. Blocks that fail conditions omitted from output.
6. **Editor always shows all blocks**: Conditions do NOT hide blocks in editor. They are metadata for runtime evaluation only.
7. **Serialization**: Conditions stored in `contentSchema.conditionalJS`. Document model stores structured rules.
8. **Condition nesting**: Conditions can reference other conditions (future: complex rule trees).

### Integration Points
- **Block Inspector**: Condition and dynamic field configuration UI
- **Serialization Engine**: Conditions serialized to `conditionalJS`
- **Server-side rendering**: Conditions evaluated during HTML generation
- **Document Model**: `block.conditions` and `block.dynamicFields` properties
- **Rendering**: Editor shows placeholders, not evaluated results

### Edge Cases
- Invalid condition rule → show warning in inspector, skip rule at runtime
- Circular condition references → detected on save, prevented
- Dynamic field with missing data source → show "[No data]" placeholder
- All conditions fail → block hidden at runtime, shown in editor with "Hidden" badge
- Conditions on container blocks → apply to all children at runtime
- Editor preview of conditions → "Preview as Admin" mode available (future)
- Empty condition rules array → conditions disabled, block always shown
- Condition with unknown type → skip, log warning

---

## 49. COPY/PASTE — INTERNAL/EXTERNAL COPY, PASTE NORMALIZATION, SANITIZATION, ID REGENERATION

### Purpose & Responsibilities
The Copy/Paste system handles copying blocks within the editor (internal), copying from external sources (external), and pasting content from various sources into the editor. It normalizes pasted content, sanitizes HTML, regenerates block IDs, and handles nested structures.

### Copy Types

#### Internal Copy (Ctrl+C within editor)
- Copies selected blocks to internal clipboard
- Preserves block structure, attrs, styles, children
- Stores as Acroxa block JSON

#### External Copy (from other sources)
- Copies block as HTML to system clipboard
- Allows pasting into other editors/applications

#### Multi-Block Copy
- Copies multiple selected blocks in order
- Preserves relative hierarchy

### Paste Sources

| Source | Format | Handling |
|--------|--------|----------|
| Internal copy | Acroxa JSON | Direct block insertion with new IDs |
| HTML from web | HTML | Parse into Acroxa blocks |
| Plain text | text | Create paragraph blocks |
| Microsoft Word | HTML (with Word markup) | Strip Word-specific markup, parse |
| Images | File/binary | Create image blocks |
| Tables | HTML table | Create table block |
| Rich text | HTML with formatting | Parse with marks |

### Clipboard Data Model
```javascript
// Internal clipboard
{
  source: "internal",
  blocks: [ ... ],           // Array of block objects
  timestamp: Date.now()
}

// External clipboard (system)
// Uses ClipboardItem with:
//   text/html — rendered HTML
//   text/plain — plain text
```

### Sanitization Rules
```javascript
const SANITIZE_CONFIG = {
  allowedTags: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "u", "s", "a", "img", "ul", "ol", "li", "blockquote", "code", "pre", "table", "thead", "tbody", "tr", "th", "td", "br", "hr", "div", "span"],
  allowedAttributes: {
    "a": ["href", "title", "target"],
    "img": ["src", "alt", "width", "height"],
    "*": ["class", "id", "style"]
  },
  allowedSchemes: ["http", "https", "mailto"],
  stripUnknownTags: true,
  stripUnknownAttributes: true
};
```

### ID Regeneration
On paste, all block IDs regenerated to prevent duplicates:
```javascript
function regenerateIds(blocks) {
  const idMap = {};
  return blocks.map(block => {
    const newId = generateId();
    idMap[block.id] = newId;
    return {
      ...block,
      id: newId,
      children: block.children.map(cid => idMap[cid] || cid),
      parent: idMap[block.parent] || block.parent
    };
  });
}
```

### Data Source
- System Clipboard API (`navigator.clipboard`)
- Internal clipboard (in-memory)
- `BLOCK_TYPES` for block creation during paste

### Behavior Specification
1. **Copy**: Ctrl+C → check selection → if block selection, copy blocks to internal clipboard + system clipboard HTML. If text selection, copy text only.
2. **Cut**: Ctrl+X → copy + delete selected blocks.
3. **Paste**: Ctrl+V → check clipboard → if internal JSON, insert blocks with new IDs. If HTML, parse into blocks. If text, create paragraphs.
4. **HTML parsing**: Use DOMParser to parse HTML → walk DOM tree → map HTML elements to Acroxa blocks (p → paragraph, h1-h6 → heading, img → image, etc.).
5. **Mark preservation**: HTML inline formatting mapped to marks: `<strong>` → bold, `<em>` → italic, `<a>` → link.
6. **Table parsing**: `<table>` → table block with rows/cells.
7. **Image paste**: Pasted image file → upload to server → create image block with returned URL.
8. **Paste into text block**: If cursor in text block, paste inline content (text, formatted text) at cursor position, not as new block.
9. **Paste between blocks**: If no text cursor, paste as new blocks after current block.
10. **Sanitization**: All pasted HTML sanitized per SANITIZE_CONFIG. Script tags, event handlers, dangerous attributes stripped.
11. **ID regeneration**: All pasted block IDs regenerated. Parent/child references updated to new IDs.

### Integration Points
- **Block Engine**: Creates blocks from pasted content
- **Insertion Engine**: `insertFromPaste()` for paste handling
- **Text Engine**: Inline paste into text blocks
- **History Engine**: Paste creates undo transaction
- **Media System**: Image paste triggers upload
- **Security**: HTML sanitization prevents XSS

### Edge Cases
- Paste with no clipboard data → no-op
- Paste binary image data → upload and create image block
- Paste from Word with complex formatting → strip Word markup, preserve basic structure
- Paste deeply nested HTML → map to Acroxa nesting, cap at max depth
- Paste with external images → download and upload (or reference external URL)
- Paste into locked block → prevent, show toast
- Paste with duplicate IDs → regenerate IDs
- Paste very large content (>100 blocks) → warn "Pasting large content"
- Paste during text selection → replace selection with pasted content
- Paste into code block → strip formatting, paste plain text only

---

## 50. DRAG/DROP — BLOCK DRAGGING, INSERTION ZONES, NESTING, REORDER, DRAG PREVIEW, CANCELLATION

### Purpose & Responsibilities
The Drag/Drop system enables reordering blocks within the canvas, moving blocks between containers, and inserting new blocks from sidebars via drag. It provides visual drop indicators, supports nesting, and handles both mouse and touch input.

### Drag Sources
| Source | Data | Trigger |
|--------|------|---------|
| Block handle (canvas) | Block ID | Mousedown on block handle |
| Layer panel node | Block ID | Mousedown on layer node |
| Blocks panel item | Block type | Mousedown on block type icon |
| Patterns panel item | Pattern ID | Mousedown on pattern thumbnail |
| Widgets panel item | Widget type | Mousedown on widget icon |

### Drop Targets
| Target | Behavior |
|--------|----------|
| Between blocks (top) | Insert before block |
| Between blocks (bottom) | Insert after block |
| Inside container block | Insert as child of container |
| Empty canvas | Insert as first block |
| Empty container | Insert as first child |

### Drag Preview
During drag, a semi-transparent preview follows the cursor:
- Shows block type icon + label for block drags
- Shows block type icon for new block insertion
- Preview opacity: 0.7
- Preview offset: 16px below cursor

### Drop Indicator
A blue horizontal line (2px) shown at the insertion point:
- Positioned between blocks for reordering
- Positioned inside container for nesting
- Animated appearance (fade in 100ms)
- Snaps to valid drop positions only

### Data Source
- `document.blocks` — block data for dragged blocks
- `document.blockOrder` — for reorder operations
- `BLOCK_TYPES` / `WIDGET_REGISTRY` — for new block/widget insertion
- Mouse/Touch events — drag coordinates

### Behavior Specification
1. **Drag initiation**: Mousedown on drag handle → after 5px movement threshold → drag starts. Prevent text selection during drag.
2. **Drop zone detection**: On mousemove, find nearest valid drop position by comparing cursor Y to block boundaries. Highlight nearest drop indicator.
3. **Nesting detection**: If cursor is inside a container block's bounds and hover duration > 200ms, show nested drop indicator (indented).
4. **Invalid positions**: Cannot drop block inside itself or its descendants. Cannot drop into locked blocks. Drop indicator hidden for invalid positions.
5. **Drop execution**: On mouseup at valid position → execute move/insert:
   - Block reorder: `BlockEngine.moveBlockTo(blockId, newParentId, index)`
   - New block: `InsertionEngine.insert(type, { afterId, parentId })`
   - Pattern: `InsertionEngine.insertFromPattern(patternId, { afterId, parentId })`
6. **Drag cancellation**: Escape key or right-click during drag → cancel, return block to original position.
7. **Touch support**: Touchstart → long press (200ms) → drag starts. Touchmove → update position. Touchend → drop.
8. **Scroll during drag**: When cursor near viewport edges (50px), auto-scroll canvas at proportional speed.
9. **Layer panel drag**: Dragging layer node shows drop indicator in tree. Reorder within tree structure.
10. **Cross-panel drag**: Drag from blocks panel to canvas. Shows block type preview. Drops as new block.

### Visual Feedback
```
Drag state:
- Dragged block: opacity 0.5, dashed border
- Drop indicator: 2px blue line, full width between blocks
- Nested indicator: 2px blue line, indented 16px
- Invalid target: no indicator shown
- Cursor: grabbing during drag
```

### API Surface
```javascript
DragDropEngine.startDrag(dragData, event)     // Initiate drag
DragDropEngine.updateDrag(event)               // Update position during drag
DragDropEngine.endDrag(event)                  // Complete drop
DragDropEngine.cancelDrag()                    // Cancel drag
DragDropEngine.getDropPosition(event)          // Calculate drop target
DragDropEngine.showDropIndicator(position)     // Show visual indicator
DragDropEngine.hideDropIndicator()             // Remove indicator
DragDropEngine.isValidDrop(source, target)     // Check if drop allowed
DragDropEngine.getDragPreview(dragData)        // Create preview element
```

### Integration Points
- **Block Engine**: Move/insert blocks on drop
- **Insertion Engine**: New block/pattern/widget insertion
- **Layers Panel**: Drag reorder in tree, syncs with canvas
- **Selection Engine**: Select dropped block after drop
- **History Engine**: Drop creates undo transaction
- **Keyboard System**: Escape cancels drag

### Edge Cases
- Drag cancelled → block returns to original position, no state change
- Drop on locked block → prevent, show "Cannot drop into locked block"
- Drag block into itself → invalid, no indicator shown
- Drag very large block (deeply nested) → preview shows truncated label
- Drag during autosave → drag works independently, save continues
- Multiple rapid drags → cancel previous, start new
- Touch drag on iOS → use `touch-action: none` to prevent scroll
- Drag to invalid position (e.g., list item into non-list) → no indicator, drop ignored
- Browser native drag events → prevent default, use custom drag implementation
- Drag across iframes (future) → not supported, prevent cross-frame drag

---

*This blueprint is the technical source of truth for the Acroxa Editor implementation. Every coding agent should read this document, inspect the actual repository, verify assumptions, and implement the assigned phase with full awareness of the architecture, state ownership, data flow, and completion criteria defined herein.*

---

## 51. ACCESSIBILITY — KEYBOARD NAVIGATION, FOCUS MANAGEMENT, ARIA, LABELS, SCREEN READER

### Purpose & Responsibilities
The Accessibility system ensures the Acroxa editor is fully usable via keyboard, screen reader, and assistive technology. It provides keyboard navigation for all operations, proper ARIA attributes on all interactive elements, focus management across panels and menus, and screen reader announcements for state changes.

### Keyboard Navigation
All editor operations must be reachable via keyboard alone:

| Operation | Keyboard Shortcut | Focus Target |
|-----------|------------------|--------------|
| Open slash menu | `/` in empty block | Slash menu search |
| Open command palette | Ctrl+K | Palette search input |
| Toggle bold | Ctrl+B | Text selection |
| Toggle italic | Ctrl+I | Text selection |
| Save | Ctrl+S | None (global) |
| Undo | Ctrl+Z | Canvas |
| Redo | Ctrl+Shift+Z | Canvas |
| Delete block | Ctrl+Shift+D | Previous/next block |
| Duplicate block | Ctrl+D | Duplicated block |
| Move block up | Alt+ArrowUp | Moved block |
| Move block down | Alt+ArrowDown | Moved block |
| Navigate blocks | ArrowUp/ArrowDown | Target block |
| Select all | Ctrl+A | All blocks |
| Escape | Escape | Previous focus |
| Toggle left sidebar | Ctrl+[ | Toggle button |
| Toggle right sidebar | Ctrl+] | Toggle button |
| Insert block after | Ctrl+Shift+Enter | New block |

### Focus Management

#### Focus Areas
The editor has distinct focus areas tracked in `editor.focusedArea`:
- `"canvas"` — editing blocks in the main canvas
- `"sidebar-left"` — left sidebar tabs/panels
- `"sidebar-right"` — right sidebar tabs/panels
- `"slash-menu"` — slash menu overlay
- `"command-palette"` — command palette overlay
- `"dialog"` — modal dialog
- `"toolbar"` — floating block toolbar

#### Focus Rules
1. **Block insertion**: After inserting a block, focus moves to the new block. For text blocks, cursor placed at start. For widget blocks, block selected for inspector configuration.
2. **Block deletion**: After deleting a block, focus moves to the previous block. If first block, focus next. If no blocks, focus canvas placeholder.
3. **Menu close**: On Escape, focus returns to the element that opened the menu.
4. **Sidebar toggle**: When sidebar opens, focus moves to first tab. When closes, focus returns to canvas.
5. **Inspector interaction**: Focus stays in inspector while editing. Escape from inspector returns focus to canvas.
6. **Slash menu**: Focus trapped in menu. Escape returns to canvas block. Selection inserts block and returns focus to canvas.
7. **Command palette**: Focus trapped in palette. Escape returns to previous focus. Execution returns focus to canvas.

#### Focus Restoration
After any UI state change (menu close, dialog close, panel switch), focus must be restored to the logical previous element. The `FocusManager` tracks a focus stack:
```javascript
FocusManager.push(element)        // Push current focus
FocusManager.pop()                // Restore previous focus
FocusManager.restore(element)     // Restore specific element
FocusManager.getFocused()         // Get currently focused element
```

### ARIA Attributes

#### Editor Shell
```html
<div class="acrx-editor" role="application" aria-label="Acroxa Editor">
  <div class="acrx-editor-header" role="toolbar" aria-label="Editor toolbar">
  <div class="acrx-editor-body" role="main">
  <div class="acrx-editor-footer" role="status">
```

#### Canvas
```html
<div class="canvas" role="document" aria-label="Editor canvas" aria-multiline="true">
  <div class="block-wrap" role="article" aria-label="Paragraph block" data-block-id="block_1">
    <div class="block" contenteditable="true" role="textbox" aria-label="Paragraph text" aria-multiline="true">
    </div>
  </div>
</div>
```

#### Sidebars
```html
<div class="sidebar" role="complementary" aria-label="Layers panel">
  <div role="tablist" aria-label="Sidebar tabs">
    <button role="tab" aria-selected="true" aria-controls="layers-panel">Layers</button>
    <button role="tab" aria-selected="false" aria-controls="widgets-panel">Widgets</button>
  </div>
  <div role="tabpanel" id="layers-panel">
    <div role="tree" aria-label="Document layers">
      <div role="treeitem" aria-expanded="true" aria-selected="true">
        <span>Columns</span>
        <div role="group">
          <div role="treeitem">Column 1</div>
          <div role="treeitem">Column 2</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

#### Slash Menu
```html
<div class="slash-menu" role="listbox" aria-label="Insert block" aria-expanded="true">
  <div role="option" aria-selected="true" aria-label="Paragraph block">Paragraph</div>
  <div role="option" aria-selected="false" aria-label="Heading block">Heading</div>
</div>
```

#### Command Palette
```html
<div class="command-palette" role="dialog" aria-label="Command palette" aria-modal="true">
  <input role="searchbox" aria-label="Search commands" aria-autocomplete="list">
  <div role="listbox" aria-label="Commands">
    <div role="option" aria-selected="true">Save</div>
  </div>
</div>
```

#### Inspector Controls
```html
<div class="inspector-field">
  <label for="block-padding-top">Padding Top</label>
  <input id="block-padding-top" type="number" aria-describedby="padding-top-help">
  <span id="padding-top-help">Enter value in pixels</span>
</div>
```

### Screen Reader Announcements
Use `aria-live` regions for dynamic state changes:
```html
<div aria-live="polite" aria-atomic="true" class="sr-only" id="editor-announcer">
</div>
```

Announcements for:
- Block inserted: "Paragraph block inserted after Heading block"
- Block deleted: "Paragraph block deleted"
- Block moved: "Paragraph block moved up"
- Selection changed: "Paragraph block selected"
- Save started: "Saving document"
- Save completed: "Document saved"
- Undo: "Undo: Insert paragraph"
- Redo: "Redo: Delete paragraph"

### Labels and Descriptions
Every interactive element must have an accessible name:
- Buttons: `aria-label` or visible text
- Inputs: `<label>` element or `aria-label`
- Icons: `aria-label` on icon buttons (e.g., "Delete block", "Toggle visibility")
- Color pickers: `aria-label="Background color"`
- Dropdowns: `aria-label` + `aria-describedby` for current value

### Keyboard-Only Editing
The entire editing workflow must work without a mouse:
1. Tab through header controls, sidebar tabs, sidebar content, canvas, footer
2. Arrow keys navigate between blocks and within text
3. Enter/Backspace for block creation/deletion
4. Shortcuts for formatting, history, commands
5. Slash menu navigable with arrow keys + Enter
6. Command palette navigable with arrow keys + Enter
7. Inspector navigable with Tab + arrow keys
8. Layers panel navigable with arrow keys (tree navigation)

### Integration Points
- **Keyboard System** (section 33): All keyboard interactions
- **Selection Engine** (section 22): Focus tracking
- **UI panels**: ARIA attributes on all panels
- **Slash Menu** (section 34): ARIA listbox pattern
- **Command Palette** (section 35): ARIA dialog pattern
- **Layers Panel** (section 40): ARIA tree pattern
- **Block Inspector** (section 41): ARIA form patterns

### Edge Cases
- Screen reader announces during rapid typing → debounce announcements to 500ms
- Focus lost during re-render → restore focus from FocusManager stack
- Dynamic content loaded (patterns, widgets) → announce "Loaded {n} items"
- Error occurred → announce error via `aria-live="assertive"`
- Modal opened over canvas → focus trapped in modal until closed
- Multiple modals → focus managed by modal stack

---

## 52. SECURITY — HTML SANITIZATION, SCRIPT INJECTION, CUSTOM ATTRIBUTES, PERMISSIONS, API AUTH

### Purpose & Responsibilities
The Security system protects against XSS, script injection, and unauthorized operations. It sanitizes all HTML input, validates block types and attributes, enforces API authentication, and restricts editor capabilities based on user roles.

### HTML Sanitization

#### Paste Sanitization
All pasted HTML is sanitized before insertion:
```javascript
const SANITIZE_CONFIG = {
  allowedTags: [
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "em", "u", "s", "a", "img",
    "ul", "ol", "li", "blockquote", "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td",
    "br", "hr", "div", "span", "figure", "figcaption"
  ],
  allowedAttributes: {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "width", "height", "loading"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan"],
    "*": ["class", "id"]
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  disallowedTagsMode: "discard"
};
```

#### Stripped Content
The following is ALWAYS stripped from pasted content:
- `<script>` tags and all contents
- `<iframe>` tags (except approved embed providers)
- `<object>`, `<embed>` tags
- `on*` event handlers (onclick, onerror, etc.)
- `javascript:` URLs
- `data:` URLs (except images)
- `style` attributes (optionally, based on config)
- `<form>` tags and form elements
- `<input>`, `<textarea>`, `<select>` tags

#### Sanitization Pipeline
```
Raw HTML input
    ↓ DOMParser.parseFromString()
Parsed DOM tree
    ↓ walkDOM() — visit every node
Node-by-node validation
    ↓ isAllowedTag() → keep/discard
Attribute validation
    ↓ isAllowedAttribute() → keep/discard
URL validation
    ↓ isAllowedScheme() → keep/discard/rebuild
Clean DOM tree
    ↓ serializeToString()
Sanitized HTML string
```

### Script Injection Prevention
1. **Never use innerHTML with user content** — use textContent or DOM manipulation
2. **Never evaluate user-provided JavaScript** — `conditionalJS` is structured data, not executable
3. **Never use `eval()`, `Function()`, `setTimeout(string)`** — only `setTimeout(function)`
4. **Validate all URLs** — only http/https/mailto/tel schemes allowed
5. **Sanitize CSS values** — prevent `expression()`, `url(javascript:...)` in styles
6. **Escape HTML in text content** — when rendering user text outside contentEditable

### Custom Attributes Security
Custom attributes (`block.customAttributes`) are validated:
```javascript
function validateCustomAttributes(attrs) {
  const sanitized = {};
  const BLOCKED_KEYS = ["onclick", "onerror", "onload", "style", "class", "id"];
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on")) continue;
    if (BLOCKED_KEYS.includes(key)) continue;
    if (typeof value === "string") {
      sanitized[key] = value.replace(/[<>]/g, "").substring(0, 256);
    }
  }
  return sanitized;
}
```

### Permissions Model
Editor capabilities by role:

| Role | Can Edit | Can Publish | Can Delete | Can Manage Patterns | Can Manage Widgets |
|------|----------|-------------|------------|--------------------|--------------------|
| Admin | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | Yes | Yes |
| Author | Yes | Own posts | Own blocks | No | No |
| Contributor | Yes | No | Own blocks | No | No |
| Subscriber | No | No | No | No | No |

### API Authentication
All API calls require:
1. **Auth token** — `verifyAPIToken` middleware on all `/acr/api/*` routes
2. **Role verification** — `requireRoles` middleware for write operations
3. **CSRF protection** — tokens for state-changing operations
4. **Rate limiting** — max 60 save requests per minute per user

### Media Upload Security
- File type validation: only allowed MIME types (image/jpeg, image/png, image/gif, image/webp, video/mp4, application/pdf)
- File size limit: 10MB per file
- Filename sanitization: strip special characters, prevent path traversal
- Upload directory: outside web root
- Thumbnail generation: server-side, not client-side

### Integration Points
- **Paste Engine**: Sanitizes pasted HTML
- **Block Engine**: Validates block types and attributes
- **Inspector**: Sanitizes custom CSS and attributes
- **Persistence Engine**: Auth tokens on API calls
- **Media System**: File type/size validation
- **Server-side**: `verifyAPIToken`, `requireRoles` middleware

### Edge Cases
- Paste with scripts → scripts stripped, content preserved
- Custom attribute with event handler → handler stripped, attribute preserved
- User role changed during editing → capabilities re-evaluated on next action
- API token expired → show "Session expired" toast, redirect to login
- Upload with malicious filename → sanitize, prevent path traversal
- CSS injection attempt → sanitize CSS values, strip dangerous patterns
- Very long custom attribute value → truncate to 256 characters

---

## 53. PERFORMANCE — RERENDER OPTIMIZATION, DOM QUERIES, MEMORY LEAKS, DEBOUNCING, VIRTUALIZATION

### Purpose & Responsibilities
The Performance system ensures the editor remains responsive with large documents. It optimizes re-rendering, minimizes DOM queries, prevents memory leaks, debounces rapid operations, and virtualizes large lists.

### Re-render Optimization

#### Selective Rendering
Full canvas re-render is expensive. Use selective updates:
```javascript
// Instead of full re-render:
renderCanvas();  // BAD — re-renders all blocks

// Use targeted updates:
BlockEngine.renderBlock(blockId);  // GOOD — re-renders one block
updateBlockDOM(blockId, changes);  // BETTER — patches only changed parts
```

#### Rendering Rules
1. **Text input**: Only re-render the edited block's text content
2. **Style change**: Only re-render the affected block's style attributes
3. **Block insert**: Only insert the new block DOM
4. **Block delete**: Only remove the deleted block DOM
5. **Block move**: Only move the block DOM node
6. **Selection change**: Only update selection highlighting
7. **Layers panel**: Only update changed tree nodes
8. **Inspector**: Only update controls for the selected block

#### Batch DOM Updates
```javascript
requestAnimationFrame(() => {
  blockEl.classList.add("selected");
  blockEl.style.paddingTop = "16px";
  layerNode.classList.add("active");
});
```

### DOM Query Optimization

#### Cache DOM References
```javascript
const blockCache = new Map();
function getBlockElement(blockId) {
  if (!blockCache.has(blockId)) {
    blockCache.set(blockId, document.querySelector(`[data-block-id="${blockId}"]`));
  }
  return blockCache.get(blockId);
}
```

### Memory Leak Prevention

#### Resource Tracking
Every subsystem that allocates resources must provide cleanup:
```javascript
const Cleanup = {
  listeners: [],
  observers: [],
  timers: [],
  addListener(element, event, handler) {
    element.addEventListener(event, handler);
    this.listeners.push({ element, event, handler });
  },
  cleanup() {
    this.listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.timers.forEach(id => clearTimeout(id));
    this.observers.forEach(obs => obs.disconnect());
  }
};
```

### Debouncing

| Operation | Debounce | Reason |
|-----------|----------|--------|
| Text input → model update | 0ms (immediate) | Real-time feedback |
| Text input → save | 500ms | Group typing into one transaction |
| Auto-save | 30s | Don't save on every keystroke |
| Search filtering | 300ms | Wait for user to finish typing |
| SEO analysis | 1s | Expensive computation |
| Window resize | 100ms | Debounce layout recalculation |
| Inspector input | 100ms | Don't update on every keystroke |
| Scroll sync | 16ms (requestAnimationFrame) | Throttle to 60fps |

### Virtualization

For documents with 500+ blocks, virtualize canvas rendering:
```javascript
function renderVisibleBlocks() {
  const scrollTop = canvas.scrollTop;
  const viewportHeight = canvas.clientHeight;
  const blockHeight = 80;
  const startIndex = Math.floor(scrollTop / blockHeight);
  const endIndex = Math.ceil((scrollTop + viewportHeight) / blockHeight);
  const overscan = 5;
  const visibleStart = Math.max(0, startIndex - overscan);
  const visibleEnd = Math.min(blockOrder.length - 1, endIndex + overscan);
  for (let i = visibleStart; i <= visibleEnd; i++) {
    renderBlock(blockOrder[i]);
  }
  topSpacer.style.height = (visibleStart * blockHeight) + "px";
  bottomSpacer.style.height = ((blockOrder.length - visibleEnd - 1) * blockHeight) + "px";
}
```

### Performance Budgets

| Metric | Budget |
|--------|--------|
| First contentful paint | <1s |
| Time to interactive | <2s |
| Block insert → visible | <50ms |
| Text input → visible | <16ms (60fps) |
| Auto-save completion | <2s |
| Canvas re-render (100 blocks) | <50ms |
| Memory usage (500 blocks) | <100MB |
| Slash menu open | <50ms |
| Command palette open | <50ms |
| Inspector update | <50ms |

### Integration Points
- **Rendering**: Selective block updates
- **State Engine**: Batch updates via `State.batch()`
- **All engines**: Cleanup on destroy
- **Canvas**: Virtualization for large documents
- **Persistence**: Debounced auto-save

---

## 54. ERROR HANDLING — INVALID DOCUMENT, MISSING WIDGET, FAILED SAVE, API ERRORS, USER FEEDBACK

### Purpose & Responsibilities
The Error Handling system ensures the editor degrades gracefully under all failure conditions. It catches errors at engine boundaries, provides user-friendly feedback, preserves unsaved work, and prevents data loss.

### Error Categories

| Category | Severity | User Impact | Recovery |
|----------|----------|-------------|----------|
| Invalid document | Critical | Cannot load | Offer create new |
| Malformed block | High | Block rendered as placeholder | Log, continue |
| Missing widget | Medium | Widget shows placeholder | Continue editing |
| Failed save | High | Show error, retry | Auto-retry 3x |
| API error | Medium | Show toast | Retry or manual |
| Network failure | High | Queue saves | Auto-retry |
| Schema migration fail | Critical | Cannot load | Fallback raw JSON |
| Unknown block type | Low | Generic container | Continue editing |

### Error Handling Strategy
Every engine wraps critical operations in try/catch:
```javascript
function safeExecute(operation, fallback) {
  try {
    return operation();
  } catch (error) {
    console.error(`[Engine] ${operation.name} failed:`, error);
    ErrorReporter.log(error, { engine: this.name, operation: operation.name });
    if (fallback) return fallback();
    return null;
  }
}
```

### Specific Error Behaviors

#### Invalid Document
```javascript
function handleInvalidDocument(json) {
  const recovered = SerializationEngine.attemptRecovery(json);
  if (recovered) {
    showToast("Document had errors, some content may be missing", "warning");
    return recovered;
  }
  showToast("Cannot load document. It may be corrupted.", "error");
  return createEmptyDocument();
}
```

#### Failed Save
```javascript
async function handleSaveFailure(error, retryCount) {
  const maxRetries = 3;
  const retryDelays = [5000, 15000, 30000];
  if (retryCount < maxRetries) {
    showToast(`Save failed, retrying in ${retryDelays[retryCount]/1000}s...`, "warning");
    setTimeout(() => PersistenceEngine.save(true), retryDelays[retryCount]);
  } else {
    showToast("Save failed after 3 attempts. Please save manually.", "error");
    State.set("editor.isSaving", false);
  }
}
```

#### API Error
```javascript
function handleAPIError(response, operation) {
  switch (response.status) {
    case 401:
      showToast("Session expired. Please log in again.", "error");
      setTimeout(() => window.location.href = "/login", 2000);
      break;
    case 403:
      showToast("You don't have permission to perform this action.", "error");
      break;
    case 404:
      showToast(`${operation} failed: Resource not found.`, "error");
      break;
    case 429:
      showToast("Too many requests. Please wait a moment.", "warning");
      break;
    case 500:
      showToast("Server error. Please try again later.", "error");
      break;
    default:
      showToast(`${operation} failed. Please try again.`, "error");
  }
}
```

### User Feedback — Toast Notifications
```javascript
function showToast(message, type = "info", duration = 5000) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-fade-out");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
```

### Error Recovery Patterns
1. **Save failure queue**: Failed saves queued, retried with exponential backoff
2. **Document recovery**: On load failure, attempt partial recovery before creating empty document
3. **State rollback**: On critical error, offer to revert to last saved state
4. **Session recovery**: On page reload after crash, recover from auto-save if available
5. **Graceful degradation**: If a subsystem fails, other subsystems continue working

### Integration Points
- **All engines**: Try/catch at engine boundaries
- **Persistence Engine**: Save failure handling and retry
- **Serialization Engine**: Document recovery on load
- **UI panels**: Error states and retry mechanisms

---

## 55. TESTING ARCHITECTURE — UNIT TESTS, INTEGRATION TESTS, BROWSER TESTS, TEST PATTERNS

### Purpose & Responsibilities
The Testing Architecture defines the testing strategy: unit tests for isolated logic, integration tests for engine interactions, and browser tests for real user behavior.

### Test Structure
```
tests/
├── unit/
│   ├── document.test.js
│   ├── blocks.test.js
│   ├── selection.test.js
│   ├── commands.test.js
│   ├── history.test.js
│   ├── serialization.test.js
│   ├── textEngine.test.js
│   └── insertion.test.js
├── integration/
│   ├── block-rendering.test.js
│   ├── selection-sync.test.js
│   ├── save-load.test.js
│   ├── slash-menu.test.js
│   ├── inspector.test.js
│   └── undo-redo.test.js
├── browser/
│   ├── editor.smoke.test.js
│   ├── typing.test.js
│   ├── formatting.test.js
│   ├── blocks.test.js
│   ├── drag-drop.test.js
│   ├── shortcuts.test.js
│   └── save.test.js
└── helpers/
    ├── testDocument.js
    └── mockState.js
```

### Unit Tests
```javascript
describe("Document", () => {
  test("creates empty document", () => {
    const doc = new Document();
    expect(doc.blocks.size).toBe(0);
    expect(doc.blockOrder).toEqual([]);
  });
  test("adds block", () => {
    const doc = new Document();
    const block = createBlock("paragraph");
    doc.addBlock(block);
    expect(doc.blocks.has(block.id)).toBe(true);
  });
});

describe("CommandEngine", () => {
  test("registers and executes command", () => {
    const executed = jest.fn();
    CommandEngine.register({ id: "test.cmd", execute: executed });
    CommandEngine.execute("test.cmd");
    expect(executed).toHaveBeenCalled();
  });
});

describe("HistoryEngine", () => {
  test("undo restores previous state", () => {
    const original = JSON.parse(JSON.stringify(State.get("document")));
    BlockEngine.insertBlock(null, "paragraph");
    HistoryEngine.undo();
    expect(State.get("document")).toEqual(original);
  });
});
```

### Integration Tests
```javascript
describe("Block Rendering", () => {
  test("renders blocks from document state", () => {
    const doc = createTestDocumentWithBlocks();
    State.patch("document", doc);
    renderCanvas();
    const blocks = canvas.querySelectorAll(".block");
    expect(blocks.length).toBe(doc.blockOrder.length);
  });
});

describe("Save/Load", () => {
  test("save serializes document correctly", async () => {
    BlockEngine.insertBlock(null, "paragraph");
    await PersistenceEngine.save();
    const saved = await fetchSavePayload();
    expect(saved.content.json).toBeDefined();
  });
});
```

### Browser Tests
```javascript
describe("Editor Smoke", () => {
  test("editor loads without errors", async () => {
    await page.goto("/acrx/editor?id=1&type=post");
    await page.waitForSelector(".acrx-editor");
    const errors = [];
    page.on("pageerror", err => errors.push(err));
    expect(errors.length).toBe(0);
  });
});
```

### Integration Points
- **All engines**: Unit test coverage
- **Rendering**: Integration tests for DOM output
- **Persistence**: Integration tests for save/load
- **Browser automation**: End-to-end user flows

---

## 56. BROWSER TESTING STRATEGY — MANUAL TESTING CHECKLIST, REGRESSION TESTS, CROSS-BROWSER

### Purpose & Responsibilities
The Browser Testing Strategy defines how to verify the editor works in real browsers. It includes manual testing checklists, regression test suites, and cross-browser compatibility requirements.

### Manual Testing Checklist

#### Core Editing
- [ ] Editor loads without console errors
- [ ] Can type text in paragraph block
- [ ] Can create new block with Enter
- [ ] Can delete block with Backspace at start
- [ ] Can apply bold (Ctrl+B)
- [ ] Can apply italic (Ctrl+I)
- [ ] Can apply underline (Ctrl+U)
- [ ] Marks persist across typed characters
- [ ] Can undo (Ctrl+Z)
- [ ] Can redo (Ctrl+Shift+Z)

#### Block Operations
- [ ] Can insert block via slash menu
- [ ] Can delete block via block actions
- [ ] Can duplicate block
- [ ] Can transform paragraph to heading
- [ ] Can move block up/down
- [ ] Block selection highlights block in canvas
- [ ] Block selection syncs to layers panel

#### UI Panels
- [ ] Left sidebar opens/closes
- [ ] Right sidebar opens/closes
- [ ] Layers panel shows document tree
- [ ] Clicking layer selects block in canvas
- [ ] Block inspector shows selected block properties
- [ ] Changing inspector updates block in canvas
- [ ] Post panel shows post metadata
- [ ] SEO panel shows SEO settings
- [ ] Slash menu appears on "/" and filters
- [ ] Command palette opens on Ctrl+K

#### Persistence
- [ ] Document saves with Ctrl+S
- [ ] Auto-save triggers after 30s
- [ ] Save status shows in footer
- [ ] Document loads correctly on page reload
- [ ] Changes persist after save + reload

### Regression Tests
1. Load editor → type text → save → reload → verify text persists
2. Insert block → undo → verify block removed → redo → verify block restored
3. Select block → change style in inspector → verify canvas updates
4. Drag block → verify new order persists after save
5. Paste HTML → verify blocks created correctly
6. Open slash menu → search → select → verify block inserted
7. Open command palette → search → execute → verify command runs
8. Toggle sidebar → verify state persists during session
9. Switch device mode → verify canvas viewport changes
10. Publish post → verify status changes to published

### Cross-Browser Requirements

| Browser | Minimum Version | Priority |
|---------|----------------|----------|
| Chrome | 90+ | Critical |
| Firefox | 88+ | Critical |
| Safari | 14+ | High |
| Edge | 90+ | High |
| Mobile Chrome | 90+ | Medium |
| Mobile Safari | 14+ | Medium |

### Integration Points
- **All features**: Browser verification required
- **CI/CD**: Automated browser tests in pipeline
- **Release process**: Cross-browser testing before release

---

## 57. DOCUMENT SCHEMA — JSON SCHEMA DEFINITION, VERSIONING, MIGRATIONS, BACKWARDS COMPATIBILITY

### Purpose & Responsibilities
The Document Schema defines the structure, validation, and versioning of the Acroxa document model. It ensures documents can be loaded across editor versions, supports migration from older formats, and validates document integrity.

### JSON Schema Definition
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Acroxa Document",
  "type": "object",
  "required": ["version", "blocks", "blockOrder"],
  "properties": {
    "version": { "type": "integer", "minimum": 1 },
    "blocks": {
      "type": "object",
      "additionalProperties": { "$ref": "#/definitions/Block" }
    },
    "blockOrder": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "definitions": {
    "Block": {
      "type": "object",
      "required": ["id", "type"],
      "properties": {
        "id": { "type": "string", "pattern": "^block_[a-z0-9]+$" },
        "type": { "type": "string" },
        "content": { "type": "array", "items": { "$ref": "#/definitions/InlineNode" } },
        "attrs": { "type": "object" },
        "styles": { "$ref": "#/definitions/BlockStyles" },
        "responsive": { "$ref": "#/definitions/ResponsiveOverrides" },
        "children": { "type": "array", "items": { "type": "string" } },
        "parent": { "type": ["string", "null"] },
        "locked": { "type": "boolean", "default": false },
        "hidden": { "type": "boolean", "default": false },
        "customClasses": { "type": "string", "maxLength": 500 },
        "customId": { "type": "string", "maxLength": 100 },
        "customAttributes": { "type": "object", "maxProperties": 20 }
      }
    },
    "InlineNode": {
      "type": "object",
      "required": ["type", "text"],
      "properties": {
        "type": { "type": "string", "enum": ["text"] },
        "text": { "type": "string" },
        "marks": { "type": "array", "items": { "$ref": "#/definitions/Mark" } }
      }
    },
    "Mark": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "type": "string", "enum": ["bold", "italic", "underline", "strike", "inlineCode", "link"] },
        "attrs": { "type": "object" }
      }
    },
    "BlockStyles": {
      "type": "object",
      "properties": {
        "margin": { "$ref": "#/definitions/Spacing" },
        "padding": { "$ref": "#/definitions/Spacing" },
        "backgroundColor": { "type": "string" },
        "textColor": { "type": "string" },
        "fontSize": { "type": "number" },
        "fontFamily": { "type": "string" },
        "textAlign": { "type": "string", "enum": ["left", "center", "right", "justify"] }
      }
    },
    "Spacing": {
      "type": "object",
      "properties": {
        "top": { "type": "number" },
        "right": { "type": "number" },
        "bottom": { "type": "number" },
        "left": { "type": "number" }
      }
    },
    "ResponsiveOverrides": {
      "type": "object",
      "properties": {
        "mobile": { "type": "object" },
        "tablet": { "type": "object" },
        "desktop": { "type": "object" }
      }
    }
  }
}
```

### Validation
```javascript
function validateDocument(json) {
  const errors = [];
  if (!json.version) errors.push("Missing version");
  if (!json.blocks) errors.push("Missing blocks");
  if (!json.blockOrder) errors.push("Missing blockOrder");
  if (json.version > CURRENT_VERSION) errors.push(`Unknown version: ${json.version}`);
  for (const [id, block] of Object.entries(json.blocks || {})) {
    if (!block.id) errors.push(`Block ${id} missing id`);
    if (!block.type) errors.push(`Block ${id} missing type`);
    if (!BLOCK_TYPES[block.type]) errors.push(`Block ${id} unknown type: ${block.type}`);
  }
  return errors;
}
```

### Integration Points
- **Serialization Engine**: Validates on serialize/deserialize
- **Persistence Engine**: Validates before save, after load
- **Block Engine**: Validates block operations

---

## 58. SCHEMA VERSIONING — VERSION NUMBERS, MIGRATION FUNCTIONS, COMPATIBILITY CHECKS

### Purpose & Responsibilities
Schema Versioning manages document format evolution. It assigns version numbers to schema changes, provides migration functions to upgrade old documents, and ensures backwards compatibility.

### Version Numbering
```javascript
const SCHEMA_VERSION = 2;
const VERSION_HISTORY = {
  1: { released: "2025-01-01", description: "Initial schema" },
  2: { released: "2025-06-01", description: "Added responsive overrides, conditions" }
};
```

### Migration Functions
```javascript
const MIGRATIONS = {
  "1→2": (json) => {
    for (const [id, block] of Object.entries(json.blocks)) {
      if (!block.responsive) block.responsive = { mobile: {}, tablet: {}, desktop: {} };
      if (!block.conditions) block.conditions = null;
    }
    json.version = 2;
    return json;
  }
};

function migrateDocument(json, fromVersion, toVersion) {
  let current = json;
  for (let v = fromVersion; v < toVersion; v++) {
    const migrationFn = MIGRATIONS[`${v}→${v + 1}`];
    if (!migrationFn) throw new Error(`No migration from version ${v} to ${v + 1}`);
    current = migrationFn(JSON.parse(JSON.stringify(current)));
  }
  return current;
}
```

### Compatibility Rules

#### Forward Compatibility
- Unknown fields in JSON: ignored (not stripped)
- Unknown block types: rendered as generic container
- Unknown attributes: preserved, not rendered

#### Backward Compatibility
- Missing fields: filled with defaults from BLOCK_TYPES
- Missing responsive: empty object `{}`
- Missing conditions: `null`

### Integration Points
- **Serialization Engine**: Version check on deserialize
- **Persistence Engine**: Migration on load

---

## 59. DATA FLOW DIAGRAMS — BLOCK INSERTION, SAVE, LOAD, UNDO/REDO, SELECTION SYNC FLOWS

### Block Insertion Flow
```
User action (slash menu / command palette / keyboard)
    ↓
Keyboard System detects "/" or shortcut
    ↓
Command Engine.execute("editor.insertBlock")
    ↓
Slash Menu opens (if "/" trigger)
    ↓
User selects item
    ↓
InsertionEngine.insert(type, { afterId })
    ↓
resolveInsertionPoint() → { afterId, parentId, index }
    ↓
BlockEngine.createBlock(type) → new Block instance
    ↓
State.batch(() => {
    State.set("document.blocks[newBlock.id]", newBlock)
    State.set("document.blockOrder", [...order])
    State.set("editor.isDirty", true)
})
    ↓
Rendering: renderBlock(newBlock) → DOM inserted
    ↓
Selection: selectBlock(newBlock.id) → canvas highlight
    ↓
History: pushTransaction("Insert paragraph")
    ↓
Layers: addNode(newBlock) → tree updated
    ↓
Footer: "Unsaved changes"
```

### Save Flow
```
Auto-save timer (30s) OR Ctrl+S
    ↓
PersistenceEngine.save()
    ↓
State.set("editor.isSaving", true)
    ↓
Footer: "Saving..."
    ↓
SerializationEngine.serialize()
    ├→ serializeJSON() → content.json
    ├→ generateHTML() → content.html
    └→ extractText() → content.raw
    ↓
POST /acr/api/editor/:id/content
    ↓
Server validates + saves + creates revision
    ↓
Response: { success: true }
    ↓
State.batch(() => {
    State.set("editor.isDirty", false)
    State.set("editor.lastSavedAt", Date.now())
    State.set("editor.isSaving", false)
})
    ↓
Footer: "Saved at 10:30"
```

### Load Flow
```
Editor page load (/acrx/editor?id=123&type=post)
    ↓
GET /acr/api/editor/123/data?type=post
    ↓
Response: { document, widgets, patterns, seoReport }
    ↓
validateDocument(json)
    ↓
migrateDocument(json, version, CURRENT_VERSION) if needed
    ↓
SerializationEngine.deserialize(json)
    ↓
State.batch(() => {
    State.patch("document", doc)
    State.patch("editor", { documentId, title, status })
    State.patch("seo", seoData)
})
    ↓
renderCanvas() → draw all blocks
    ↓
Layers: renderTree() → document tree
    ↓
Editor ready for interaction
```

### Undo/Redo Flow
```
User presses Ctrl+Z
    ↓
Keyboard System: shortcut "Ctrl+Z" → "editor.undo"
    ↓
Command Engine.execute("editor.undo")
    ↓
HistoryEngine.undo()
    ↓
Pop from undoStack → previousTransaction
    ↓
Push current state to redoStack
    ↓
restoreSnapshot(previousTransaction.documentSnapshot)
    ↓
State.patch("document", snapshot.document)
    ↓
restoreSelection(previousTransaction.selectionSnapshot)
    ↓
State.patch("selection", snapshot.selection)
    ↓
renderCanvas() → update DOM
    ↓
Layers: renderTree() → update tree
    ↓
Announcer: "Undo: Insert paragraph"
```

### Selection Sync Flow
```
User clicks block in canvas
    ↓
Mouse event handler: event.target.closest(".block")
    ↓
Extract blockId from data-block-id attribute
    ↓
SelectionEngine.selectBlock(blockId)
    ↓
State.batch(() => {
    State.set("selection.selectedBlockIds", [blockId])
    State.set("editor.selectedBlockId", blockId)
})
    ↓
Canvas: highlightBlock(blockId) → add "selected" class
    ↓
Layers: highlightNode(blockId) → tree node active
    ↓
Inspector: switchToBlockTab() → show block properties
    ↓
Inspector: populateControls(block) → fill fields
    ↓
Breadcrumbs: updatePath(blockId) → show hierarchy
```

### Inspector Change Flow
```
User changes padding in inspector
    ↓
Inspector control: input event → new value
    ↓
Validation: isValidPadding(value)
    ↓
State.set("document.blocks.${blockId}.styles.padding.top", value)
    ↓
Canvas: updateBlockStyle(blockId, "padding-top", value)
    ↓
History: pushTransaction("Change padding")
    ↓
State.set("editor.isDirty", true)
    ↓
Footer: "Unsaved changes"
    ↓
Auto-save timer: restart 30s debounce
```

---

## 60. DEPENDENCY GRAPH — PHASE DEPENDENCIES, MODULE RELATIONSHIPS, BUILD ORDER

### Phase Dependencies
```
Phase 1: Document Model & State
    ↓ (no dependencies)
Phase 2: Block Engine
    ↓ (depends on Phase 1)
Phase 3: Text Engine
    ↓ (depends on Phase 1, 2)
Phase 4: Selection Engine
    ↓ (depends on Phase 1, 2)
Phase 5: Keyboard System
    ↓ (depends on Phase 2, 3, 4)
Phase 6: Command Engine + Slash Menu + Command Palette
    ↓ (depends on Phase 2, 3, 4, 5)
Phase 7: History Engine
    ↓ (depends on Phase 1, 2, 6)
Phase 8: UI Panels
    ↓ (depends on Phase 1, 2, 4, 6)
Phase 9: Insertion + Drag/Drop
    ↓ (depends on Phase 2, 4, 6)
Phase 10: Persistence + Auto-Save
    ↓ (depends on Phase 1, 2, 7)
Phase 11: Advanced Features
    ↓ (depends on all previous phases)
```

### Module Relationships
```
State Engine (state.js) → Editor/Document/History/Selection Stores
Document Model (document.js) → Block class
Block Registry (blocks.js) → BLOCK_TYPES, createBlock()
Rendering (rendering.js) → renderCanvas, renderBlock
Block Engine (blockEngine.js) → CRUD operations
Text Engine (textEngine.js) → handleInput, toggleMark
Selection Engine (selection.js) → selectBlock, selectText
Keyboard System (keyboard.js) → init, handleKeydown
Command Engine (commands.js) → register, execute
Slash Menu (slashMenu.js) → open, close, search
Command Palette (commandPalette.js) → open, close, search
History Engine (history.js) → pushTransaction, undo, redo
Layers Panel (layersPanel.js) → renderTree, selectNode
Inspector Panel (inspectorPanel.js) → populateControls
Persistence Engine (persistence.js) → save, load
Insertion Engine (insertion.js) → insert, insertFromPaste
Drag/Drop Engine (dragDrop.js) → startDrag, endDrag
```

### Build Order
```
1.  State Engine (state.js)
2.  Document Model (document.js)
3.  Block Registry (blocks.js)
4.  Rendering (rendering.js)
5.  Block Engine (blockEngine.js)
6.  Text Engine (textEngine.js)
7.  Selection Engine (selection.js)
8.  Keyboard System (keyboard.js)
9.  Command Engine (commands.js)
10. Slash Menu (slashMenu.js)
11. Command Palette (commandPalette.js)
12. History Engine (history.js)
13. Layers Panel (layersPanel.js)
14. Inspector Panel (inspectorPanel.js)
15. Persistence Engine (persistence.js)
16. Insertion Engine (insertion.js)
17. Drag/Drop Engine (dragDrop.js)
18. Post Panel (postPanel.js)
19. SEO Panel (seoPanel.js)
20. Block Toolbar (blockToolbar.js)
21. Copy/Paste (copyPaste.js)
22. Responsive Engine (responsive.js)
23. Pattern Engine (patternEngine.js)
24. Widget Engine (widgetEngine.js)
25. Media Integration (mediaIntegration.js)
```

---

## 61. IMPLEMENTATION ROADMAP — TIMELINE, MILESTONES, PRIORITY ORDERING

### Priority Order

| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Phase 1: Document Model & State | 2 days | Foundation for everything |
| P0 | Phase 2: Block Engine | 3 days | Core editing capability |
| P0 | Phase 3: Text Engine | 3 days | Text editing |
| P1 | Phase 4: Selection Engine | 2 days | Selection and focus |
| P1 | Phase 5: Keyboard System | 3 days | All keyboard interactions |
| P1 | Phase 6: Command Engine + Menus | 3 days | Commands and UI menus |
| P2 | Phase 7: History Engine | 2 days | Undo/redo |
| P2 | Phase 8: UI Panels | 4 days | Inspector, layers, post, SEO |
| P2 | Phase 9: Insertion + Drag/Drop | 3 days | Content insertion |
| P3 | Phase 10: Persistence | 2 days | Save/load |
| P3 | Phase 11: Advanced Features | 5 days | Copy/paste, responsive, patterns |

### Milestones

#### Milestone 1: Basic Editing (Week 1-2)
- [ ] Document loads from API
- [ ] Blocks render in canvas
- [ ] Text can be typed and edited
- [ ] Bold/italic marks work
- [ ] New blocks can be inserted
- [ ] Blocks can be deleted

#### Milestone 2: Full Editing (Week 3-4)
- [ ] Selection works across blocks
- [ ] All keyboard shortcuts work
- [ ] Slash menu inserts blocks
- [ ] Command palette executes commands
- [ ] Undo/redo works
- [ ] Layers panel syncs with canvas

#### Milestone 3: Complete Editor (Week 5-6)
- [ ] Inspector controls update blocks
- [ ] Post panel manages metadata
- [ ] SEO panel manages SEO settings
- [ ] Blocks can be reordered
- [ ] Drag/drop works

#### Milestone 4: Production Ready (Week 7-8)
- [ ] Save/load works reliably
- [ ] Auto-save with debounce
- [ ] Copy/paste works
- [ ] Responsive editing works
- [ ] Patterns can be inserted
- [ ] All edge cases handled

---

## 62. PHASE-BY-PHASE IMPLEMENTATION — DETAILED PHASES WITH FILES, REQUIREMENTS, ACCEPTANCE CRITERIA

### Phase 4: Selection Engine

**Files to Create**: `acrx/assets/js/editor/selection.js`
**Files to Modify**: `acrx/assets/js/editor.js`

**Requirements**:
1. Track text selection (anchorBlock, anchorOffset, focusBlock, focusOffset)
2. Track block selection (selected block IDs)
3. Multi-block selection with Ctrl+click or Shift+click
4. Selection sync with browser Selection API
5. Selection restoration after DOM updates
6. Block selection highlighting
7. Selection change events

**Acceptance Criteria**:
- [ ] Text selection works within blocks
- [ ] Blocks can be selected by clicking
- [ ] Multiple blocks can be selected
- [ ] Selection state is reactive
- [ ] Selection persists across inspector interactions

---

### Phase 5: Keyboard System

**Files to Create**: `acrx/assets/js/editor/keyboard.js`
**Files to Modify**: `acrx/assets/js/editor.js`

**Requirements**:
1. Enter: Create new block below current
2. Shift+Enter: Soft line break within block
3. Backspace at block start: Merge with previous block
4. Backspace in empty block: Delete block
5. Delete at block end: Merge with next block
6. Tab/Shift+Tab: Indent/outdent
7. ArrowUp/Down: Navigate between blocks
8. ArrowLeft/Right: Navigate within text
9. Ctrl/Cmd+A: Select all blocks
10. Ctrl/Cmd+B/I/U: Toggle marks
11. Ctrl/Cmd+Z: Undo
12. Ctrl/Cmd+Shift+Z: Redo
13. Ctrl/Cmd+K: Open command palette
14. Escape: Close menus, deselect

**Acceptance Criteria**:
- [ ] All keyboard shortcuts work as specified
- [ ] Focus is maintained through block operations
- [ ] No unexpected cursor jumps
- [ ] Shortcuts don't conflict with browser defaults

---

### Phase 6: Command Engine + Slash Menu + Command Palette

**Files to Create**:
- `acrx/assets/js/editor/commands.js`
- `acrx/assets/js/editor/slashMenu.js`
- `acrx/assets/js/editor/commandPalette.js`

**Requirements**:
1. Command registry with id, label, category, shortcut, execute, canExecute
2. Commands receive context: { document, selection, editor }
3. Slash menu: "/" trigger, search, filter, insert block
4. Command palette: Ctrl+K, search commands, execute

**Acceptance Criteria**:
- [ ] Slash menu appears on "/" and filters with typing
- [ ] Selecting item inserts block at cursor
- [ ] Command palette opens on Ctrl+K
- [ ] Commands execute correctly

---

### Phase 7: History Engine

**Files to Create**: `acrx/assets/js/editor/history.js`
**Files to Modify**: `acrx/assets/js/editor.js`

**Requirements**:
1. Undo stack and redo stack
2. State snapshots (document + selection)
3. Transaction grouping
4. Max history limit (100 steps)
5. History cleared on new change after undo

**Acceptance Criteria**:
- [ ] Undo reverts last action
- [ ] Redo reapplies undone action
- [ ] Multiple undos/redos work correctly
- [ ] Selection restored with undo/redo

---

### Phase 8: UI Panels

**Files to Create**:
- `acrx/assets/js/editor/layersPanel.js`
- `acrx/assets/js/editor/inspectorPanel.js`
- `acrx/assets/js/editor/postPanel.js`
- `acrx/assets/js/editor/seoPanel.js`
- `acrx/assets/js/editor/blockToolbar.js`

**Acceptance Criteria**:
- [ ] Layers panel shows document tree
- [ ] Clicking layer selects block in canvas
- [ ] Inspector shows and updates block properties
- [ ] Post panel manages post metadata
- [ ] SEO panel manages SEO settings
- [ ] Block toolbar appears on selection

---

### Phase 9: Insertion + Drag/Drop

**Files to Create**:
- `acrx/assets/js/editor/insertion.js`
- `acrx/assets/js/editor/dragDrop.js`

**Acceptance Criteria**:
- [ ] Blocks can be inserted at any position
- [ ] Blocks can be dragged to reorder
- [ ] Drop zones appear between blocks
- [ ] Paste HTML creates correct blocks

---

### Phase 10: Persistence + Auto-Save

**Files to Create**: `acrx/assets/js/editor/persistence.js`
**Files to Modify**: `acrx/assets/js/editor.js`

**Acceptance Criteria**:
- [ ] Document loads from API on editor open
- [ ] Changes auto-save after debounce
- [ ] Ctrl+S saves immediately
- [ ] Save status shows in footer
- [ ] Failed saves retry

---

### Phase 11: Advanced Features

**Files to Create**:
- `acrx/assets/js/editor/copyPaste.js`
- `acrx/assets/js/editor/responsive.js`
- `acrx/assets/js/editor/patternEngine.js`
- `acrx/assets/js/editor/mediaIntegration.js`

**Acceptance Criteria**:
- [ ] Copy/paste works for blocks
- [ ] HTML paste creates correct blocks
- [ ] Device mode switches correctly
- [ ] Responsive overrides apply
- [ ] Patterns insert correctly
- [ ] Media picker opens for image blocks

---

## 63. FILE-LEVEL CHANGE PLAN — EVERY FILE TO CREATE/MODIFY WITH PURPOSE AND DEPENDENCIES

### Files to Create

| File | Purpose | Dependencies |
|------|---------|--------------|
| `acrx/assets/js/editor/document.js` | Document model classes | None |
| `acrx/assets/js/editor/blocks.js` | Block type registry | document.js |
| `acrx/assets/js/editor/state.js` | State store initialization | state.js (utils) |
| `acrx/assets/js/editor/rendering.js` | Block rendering functions | blocks.js, state.js |
| `acrx/assets/js/editor/blockEngine.js` | Block CRUD operations | document.js, blocks.js |
| `acrx/assets/js/editor/textEngine.js` | Text editing logic | blockEngine.js |
| `acrx/assets/js/editor/marks.js` | Mark definitions | None |
| `acrx/assets/js/editor/selection.js` | Selection engine | state.js |
| `acrx/assets/js/editor/keyboard.js` | Keyboard handler | commands.js, selection.js |
| `acrx/assets/js/editor/commands.js` | Command registry | state.js |
| `acrx/assets/js/editor/slashMenu.js` | Slash menu logic | commands.js, insertion.js |
| `acrx/assets/js/editor/commandPalette.js` | Command palette logic | commands.js |
| `acrx/assets/js/editor/history.js` | History engine | state.js |
| `acrx/assets/js/editor/layersPanel.js` | Layers panel | blockEngine.js, selection.js |
| `acrx/assets/js/editor/inspectorPanel.js` | Block inspector | blockEngine.js, selection.js |
| `acrx/assets/js/editor/postPanel.js` | Post settings | state.js |
| `acrx/assets/js/editor/seoPanel.js` | SEO settings | state.js |
| `acrx/assets/js/editor/blockToolbar.js` | Floating toolbar | commands.js, selection.js |
| `acrx/assets/js/editor/insertion.js` | Insertion engine | blockEngine.js, selection.js |
| `acrx/assets/js/editor/dragDrop.js` | Drag/drop engine | blockEngine.js, insertion.js |
| `acrx/assets/js/editor/persistence.js` | Save/load logic | state.js |
| `acrx/assets/js/editor/copyPaste.js` | Copy/paste engine | blockEngine.js, insertion.js |
| `acrx/assets/js/editor/responsive.js` | Responsive engine | state.js |
| `acrx/assets/js/editor/patternEngine.js` | Pattern insertion | insertion.js |
| `acrx/assets/js/editor/mediaIntegration.js` | Media integration | mediaPicker.js |
| `acrx/assets/js/editor/focusManager.js` | Focus management | None |
| `acrx/assets/js/editor/errorHandler.js` | Error handling | None |
| `acrx/assets/js/editor/accessibility.js` | Accessibility helpers | focusManager.js |
| `acrx/assets/js/editor/security.js` | Security/sanitization | None |

### Files to Modify

| File | Changes | Reason |
|------|---------|--------|
| `acrx/assets/js/editor.js` | Import all new modules, initialize all engines | Main entry point |
| `acrx/assets/js/utils/state.js` | Add batch helper if missing | Used by all engines |
| `src/views/editor.js` | Add ARIA attributes to HTML shell | Accessibility |
| `acrx/assets/css/ad-ed.css` | Add styles for new UI elements | Inspector, layers, menus |

---

## 64. CODING-AGENT PROMPT — PHASE 4 (SELECTION ENGINE)

### Context
Phases 1-3 are complete. Document model, block registry, state stores, block rendering, and text editing are implemented. The editor now needs a selection system to track which block/text is selected and sync selection across canvas, layers panel, and inspector.

### Objective
Implement Phase 4: Selection Engine. Create the selection tracking system that manages text selection, block selection, multi-selection, and synchronizes selection state across all editor components.

### Existing Architecture
- **State Engine**: `acrx/assets/js/utils/state.js`
- **Block Engine**: `acrx/assets/js/editor/blockEngine.js`
- **Rendering**: `acrx/assets/js/editor/rendering.js`
- **Selection State**: Already defined in `acrx/assets/js/editor/state.js`

### Files to Create
1. `acrx/assets/js/editor/selection.js`

### Files to Modify
1. `acrx/assets/js/editor.js` — Initialize selection engine, wire up click handlers

### Requirements

**selection.js**:
```javascript
import State from '../utils/state.js';

const Selection = {
  selectBlock(blockId, opts = {}) {
    State.batch(() => {
      State.set("selection.selectedBlockIds", [blockId]);
      State.set("selection.isCollapsed", true);
      State.set("editor.selectedBlockId", blockId);
    });
    this.highlightBlock(blockId);
    this.syncLayers(blockId);
    this.syncInspector(blockId);
  },
  selectBlocks(blockIds) {
    State.batch(() => {
      State.set("selection.selectedBlockIds", blockIds);
      State.set("editor.selectedBlockId", blockIds[0]);
    });
  },
  selectText(blockId, offset) {
    State.batch(() => {
      State.set("selection.anchorBlockId", blockId);
      State.set("selection.anchorOffset", offset);
      State.set("selection.focusBlockId", blockId);
      State.set("selection.focusOffset", offset);
      State.set("selection.isCollapsed", true);
      State.set("selection.selectedBlockIds", []);
      State.set("editor.selectedBlockId", null);
    });
    this.restoreCursor(blockId, offset);
  },
  clear() {
    State.batch(() => {
      State.set("selection.selectedBlockIds", []);
      State.set("selection.anchorBlockId", null);
      State.set("selection.focusBlockId", null);
      State.set("editor.selectedBlockId", null);
    });
    this.clearHighlights();
  },
  get() { return State.get("selection"); },
  highlightBlock(blockId) {
    this.clearHighlights();
    const el = document.querySelector(`[data-block-id="${blockId}"]`);
    if (el) el.closest(".block-wrap")?.classList.add("selected");
  },
  clearHighlights() {
    document.querySelectorAll(".block-wrap.selected").forEach(el => {
      el.classList.remove("selected");
    });
  },
  syncLayers(blockId) {
    document.dispatchEvent(new CustomEvent("selection:change", { detail: { blockId } }));
  },
  syncInspector(blockId) {
    document.dispatchEvent(new CustomEvent("selection:blockSelected", { detail: { blockId } }));
  },
  restoreCursor(blockId, offset) {
    const el = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!el) return;
    const textNode = el.querySelector(".block") || el;
    if (textNode.childNodes.length > 0) {
      const range = document.createRange();
      const sel = window.getSelection();
      let charCount = 0;
      for (const node of textNode.childNodes) {
        const nodeLength = node.textContent.length;
        if (charCount + nodeLength >= offset) {
          range.setStart(node, Math.min(offset - charCount, node.textContent.length));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          break;
        }
        charCount += nodeLength;
      }
    }
  },
  resolveFromDOM() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const blockEl = range.startContainer.closest?.("[data-block-id]") || range.startContainer.parentElement?.closest("[data-block-id]");
    if (!blockEl) return;
    const blockId = blockEl.dataset.blockId;
    let offset = 0;
    const walker = document.createTreeWalker(blockEl.querySelector(".block") || blockEl, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode === range.startContainer) { offset += range.startOffset; break; }
      offset += walker.currentNode.textContent.length;
    }
    State.batch(() => {
      State.set("selection.anchorBlockId", blockId);
      State.set("selection.anchorOffset", offset);
      State.set("selection.focusBlockId", blockId);
      State.set("selection.focusOffset", offset);
      State.set("selection.isCollapsed", range.collapsed);
    });
  },
  hasSelection() {
    const sel = this.get();
    return sel.selectedBlockIds.length > 0 || sel.anchorBlockId !== null;
  }
};

export default Selection;
```

**editor.js modifications**:
```javascript
import Selection from './selection.js';

Mini.ready(async () => {
  // ... existing code ...
  canvas.addEventListener("click", (e) => {
    const blockEl = e.target.closest("[data-block-id]");
    if (blockEl) {
      Selection.selectBlock(blockEl.dataset.blockId);
    } else {
      Selection.clear();
    }
  });
  document.addEventListener("layer:click", (e) => {
    Selection.selectBlock(e.detail.blockId);
  });
  document.addEventListener("selectionchange", () => {
    Selection.resolveFromDOM();
  });
});
```

### Acceptance Criteria
- [ ] Clicking a block in canvas selects it (highlight appears)
- [ ] Clicking a layer node selects the corresponding block
- [ ] Selected block shows in inspector panel
- [ ] Clicking empty canvas area deselects all
- [ ] Multiple blocks can be selected with Ctrl+click
- [ ] Selection state is reactive
- [ ] Text cursor placement works within blocks
- [ ] Selection syncs between canvas, layers, and inspector

### Testing Steps
1. Load editor in browser
2. Click on a block → verify highlight appears
3. Click on layer node → verify block highlights in canvas
4. Ctrl+click multiple blocks → verify multi-selection
5. Click empty area → verify selection clears
6. Check inspector updates when block selected
7. Type text → verify cursor position tracked

---

## 65. CODING-AGENT PROMPT — PHASE 5 (KEYBOARD SYSTEM)

### Context
Phases 1-4 are complete. Document model, block rendering, text editing, and selection engine are implemented. Now the editor needs keyboard handling for all editing operations.

### Objective
Implement Phase 5: Keyboard System. Create the centralized keyboard handler that maps key events to editor commands, handles editing keys (Enter, Backspace, Tab), and manages focus.

### Files to Create
1. `acrx/assets/js/editor/keyboard.js`

### Files to Modify
1. `acrx/assets/js/editor.js` — Register keyboard handler

### Requirements

**keyboard.js**:
```javascript
import State from '../utils/state.js';
import Selection from './selection.js';

const SHORTCUTS = {
  "Enter": "editor.splitBlock",
  "Shift+Enter": "editor.softBreak",
  "Backspace": "editor.backspace",
  "Delete": "editor.deleteForward",
  "Tab": "editor.indent",
  "Shift+Tab": "editor.outdent",
  "ArrowUp": "editor.moveCursorUp",
  "ArrowDown": "editor.moveCursorDown",
  "Ctrl+A": "editor.selectAll",
  "Ctrl+B": "editor.toggleBold",
  "Ctrl+I": "editor.toggleItalic",
  "Ctrl+U": "editor.toggleUnderline",
  "Ctrl+Z": "editor.undo",
  "Ctrl+Shift+Z": "editor.redo",
  "Ctrl+S": "editor.save",
  "Ctrl+K": "editor.openCommandPalette",
  "Escape": "editor.escape",
  "Ctrl+D": "editor.duplicateBlock",
  "Alt+ArrowUp": "editor.moveBlockUp",
  "Alt+ArrowDown": "editor.moveBlockDown"
};

const KeyboardSystem = {
  init() {
    document.addEventListener("keydown", this.handleKeydown.bind(this));
  },
  handleKeydown(event) {
    const target = event.target;
    if (target.matches("input, textarea") && !target.isContentEditable) return;
    if (event.isComposing) return;
    const shortcut = this.buildShortcut(event);
    const commandId = SHORTCUTS[shortcut];
    if (commandId) {
      event.preventDefault();
      this.executeCommand(commandId, event);
      return;
    }
    this.handleSpecialKey(event);
  },
  buildShortcut(event) {
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
    if (event.shiftKey) parts.push("Shift");
    if (event.altKey) parts.push("Alt");
    parts.push(event.key);
    return parts.join("+");
  },
  executeCommand(commandId, event) {
    switch (commandId) {
      case "editor.splitBlock": this.handleEnter(event); break;
      case "editor.backspace": this.handleBackspace(event); break;
      case "editor.selectAll": this.handleSelectAll(); break;
      case "editor.toggleBold": document.execCommand("bold"); break;
      case "editor.toggleItalic": document.execCommand("italic"); break;
      case "editor.toggleUnderline": document.execCommand("underline"); break;
      case "editor.escape": this.handleEscape(); break;
    }
  },
  handleEnter(event) {
    const sel = Selection.get();
    if (sel.selectedBlockIds.length > 0) {
      document.dispatchEvent(new CustomEvent("command:execute", {
        detail: { command: "editor.insertBlockAfter", args: { blockId: sel.selectedBlockIds[0] } }
      }));
    }
  },
  handleBackspace(event) {
    const sel = Selection.get();
    if (sel.selectedBlockIds.length > 0) {
      document.dispatchEvent(new CustomEvent("command:execute", {
        detail: { command: "editor.deleteBlock", args: { blockId: sel.selectedBlockIds[0] } }
      }));
    }
  },
  handleSelectAll() {
    const doc = State.get("document");
    Selection.selectBlocks(doc.blockOrder);
  },
  handleEscape() {
    Selection.clear();
    document.dispatchEvent(new CustomEvent("editor:escape"));
  },
  handleSpecialKey(event) { /* Arrow keys, Tab delegation */ }
};

export default KeyboardSystem;
```

### Acceptance Criteria
- [ ] Enter creates new block after current
- [ ] Backspace at block start merges with previous
- [ ] Ctrl+B toggles bold
- [ ] Ctrl+I toggles italic
- [ ] Ctrl+U toggles underline
- [ ] Ctrl+Z triggers undo
- [ ] Ctrl+Shift+Z triggers redo
- [ ] Ctrl+A selects all blocks
- [ ] Escape clears selection
- [ ] Shortcuts don't conflict with browser defaults

---

## 66. CODING-AGENT PROMPT — PHASE 6 (COMMAND ENGINE + SLASH MENU + COMMAND PALETTE)

### Context
Phases 1-5 are complete. Now the editor needs a centralized command system, slash menu for block insertion, and command palette for global command search.

### Objective
Implement Phase 6: Command Engine + Slash Menu + Command Palette.

### Files to Create
1. `acrx/assets/js/editor/commands.js`
2. `acrx/assets/js/editor/slashMenu.js`
3. `acrx/assets/js/editor/commandPalette.js`

### Files to Modify
1. `acrx/assets/js/editor.js`

### Requirements

**commands.js**:
```javascript
import State from '../utils/state.js';
import BlockEngine from './blockEngine.js';

const CommandEngine = {
  commands: new Map(),
  register(command) {
    if (this.commands.has(command.id)) { console.warn(`Command ${command.id} already registered`); return; }
    this.commands.set(command.id, command);
  },
  execute(id, args = {}) {
    const command = this.commands.get(id);
    if (!command) { console.error(`Unknown command: ${id}`); return; }
    const ctx = this.buildContext();
    if (command.canExecute && !command.canExecute(ctx, args)) return;
    try { command.execute(ctx, args); } catch (error) { console.error(`Command ${id} failed:`, error); }
  },
  canExecute(id) {
    const command = this.commands.get(id);
    if (!command) return false;
    return command.canExecute ? command.canExecute(this.buildContext()) : true;
  },
  buildContext() {
    return {
      document: State.get("document"),
      selection: State.get("selection"),
      editor: State.get("editor"),
      selectedBlockId: State.value("editor.selectedBlockId")
    };
  },
  getCommands(filter) {
    const commands = Array.from(this.commands.values());
    if (!filter) return commands;
    return commands.filter(cmd => cmd.label.toLowerCase().includes(filter.toLowerCase()));
  }
};

function registerBuiltinCommands() {
  CommandEngine.register({ id: "editor.insertBlock", label: "Insert Block", category: "blocks",
    execute: (ctx, args) => BlockEngine.insertBlock(args.afterId || ctx.selectedBlockId, args.type) });
  CommandEngine.register({ id: "editor.deleteBlock", label: "Delete Block", category: "blocks", shortcut: "Ctrl+Shift+D",
    canExecute: (ctx) => !!ctx.selectedBlockId, execute: (ctx) => BlockEngine.deleteBlock(ctx.selectedBlockId) });
  CommandEngine.register({ id: "editor.duplicateBlock", label: "Duplicate Block", category: "blocks", shortcut: "Ctrl+D",
    canExecute: (ctx) => !!ctx.selectedBlockId, execute: (ctx) => BlockEngine.duplicateBlock(ctx.selectedBlockId) });
  CommandEngine.register({ id: "editor.undo", label: "Undo", category: "history", shortcut: "Ctrl+Z",
    execute: () => document.dispatchEvent(new CustomEvent("command:undo")) });
  CommandEngine.register({ id: "editor.redo", label: "Redo", category: "history", shortcut: "Ctrl+Shift+Z",
    execute: () => document.dispatchEvent(new CustomEvent("command:redo")) });
  CommandEngine.register({ id: "editor.save", label: "Save", category: "persistence", shortcut: "Ctrl+S",
    execute: () => document.dispatchEvent(new CustomEvent("command:save")) });
  CommandEngine.register({ id: "editor.openCommandPalette", label: "Command Palette", category: "ui", shortcut: "Ctrl+K",
    execute: () => document.dispatchEvent(new CustomEvent("command:openPalette")) });
}

export { CommandEngine, registerBuiltinCommands };
```

**slashMenu.js**: Slash menu with categories, search, keyboard navigation, and item selection calling `CommandEngine.execute("editor.insertBlock", { type, afterId })`.

**commandPalette.js**: Command palette with search, keyboard navigation, and command execution via `CommandEngine.execute()`.

### Acceptance Criteria
- [ ] Slash menu appears when "/" typed in empty block
- [ ] Slash menu filters items as user types
- [ ] Selecting item inserts block at cursor
- [ ] Command palette opens on Ctrl+K
- [ ] Command palette searches and executes commands
- [ ] All built-in commands registered
- [ ] Escape closes both menus

---

## 67. CODING-AGENT PROMPT — PHASE 7 (HISTORY ENGINE)

### Context
Phases 1-6 are complete. Now the editor needs undo/redo functionality.

### Objective
Implement Phase 7: History Engine with undo/redo, state snapshots, and transaction grouping.

### Files to Create
1. `acrx/assets/js/editor/history.js`

### Files to Modify
1. `acrx/assets/js/editor.js` — Wire up undo/redo events

### Requirements

**history.js**:
```javascript
import State from '../utils/state.js';

const HistoryEngine = {
  pushTransaction(label) {
    const doc = State.get("document");
    const sel = State.get("selection");
    const transaction = {
      id: "txn_" + Math.random().toString(36).substr(2, 9),
      label, timestamp: Date.now(),
      documentSnapshot: JSON.parse(JSON.stringify(doc)),
      selectionSnapshot: JSON.parse(JSON.stringify(sel))
    };
    State.batch(() => {
      const history = State.get("history");
      const undoStack = [...history.undoStack, transaction];
      if (undoStack.length > history.maxVersions) undoStack.shift();
      State.set("history.undoStack", undoStack);
      State.set("history.redoStack", []);
      State.set("history.currentVersion", history.currentVersion + 1);
    });
  },
  undo() {
    const history = State.get("history");
    if (history.undoStack.length === 0) return false;
    const currentDoc = State.get("document");
    const currentSel = State.get("selection");
    const transaction = history.undoStack[history.undoStack.length - 1];
    const redoTransaction = {
      id: "txn_" + Math.random().toString(36).substr(2, 9),
      label: "Current state", timestamp: Date.now(),
      documentSnapshot: JSON.parse(JSON.stringify(currentDoc)),
      selectionSnapshot: JSON.parse(JSON.stringify(currentSel))
    };
    State.batch(() => {
      State.set("history.undoStack", history.undoStack.slice(0, -1));
      State.set("history.redoStack", [...history.redoStack, redoTransaction]);
      State.set("history.currentVersion", history.currentVersion - 1);
      State.patch("document", transaction.documentSnapshot);
      State.patch("selection", transaction.selectionSnapshot);
    });
    return transaction.label;
  },
  redo() {
    const history = State.get("history");
    if (history.redoStack.length === 0) return false;
    const currentDoc = State.get("document");
    const currentSel = State.get("selection");
    const transaction = history.redoStack[history.redoStack.length - 1];
    const undoTransaction = {
      id: "txn_" + Math.random().toString(36).substr(2, 9),
      label: "Current state", timestamp: Date.now(),
      documentSnapshot: JSON.parse(JSON.stringify(currentDoc)),
      selectionSnapshot: JSON.parse(JSON.stringify(currentSel))
    };
    State.batch(() => {
      State.set("history.redoStack", history.redoStack.slice(0, -1));
      State.set("history.undoStack", [...history.undoStack, undoTransaction]);
      State.set("history.currentVersion", history.currentVersion + 1);
      State.patch("document", transaction.documentSnapshot);
      State.patch("selection", transaction.selectionSnapshot);
    });
    return transaction.label;
  },
  canUndo() { return State.get("history").undoStack.length > 0; },
  canRedo() { return State.get("history").redoStack.length > 0; },
  clear() {
    State.batch(() => {
      State.set("history.undoStack", []);
      State.set("history.redoStack", []);
      State.set("history.currentVersion", 0);
    });
  }
};

export default HistoryEngine;
```

**editor.js modifications**: Wire `command:undo` and `command:redo` events to `HistoryEngine.undo()` and `HistoryEngine.redo()`.

### Acceptance Criteria
- [ ] Undo reverts last document change
- [ ] Redo re-applies undone change
- [ ] Multiple undos/redos work correctly
- [ ] Selection restored with undo/redo
- [ ] Undo stack capped at 100
- [ ] Redo cleared on new change after undo
- [ ] Ctrl+Z triggers undo
- [ ] Ctrl+Shift+Z triggers redo

---

## 68. CODING-AGENT PROMPT — PHASE 8 (UI PANELS: LAYERS, INSPECTOR, POST, SEO)

### Context
Phases 1-7 are complete. Now the editor needs the sidebar UI panels.

### Objective
Implement Phase 8: UI Panels — Layers, Inspector, Post, SEO, and Block Toolbar.

### Files to Create
1. `acrx/assets/js/editor/layersPanel.js`
2. `acrx/assets/js/editor/inspectorPanel.js`
3. `acrx/assets/js/editor/postPanel.js`
4. `acrx/assets/js/editor/seoPanel.js`
5. `acrx/assets/js/editor/blockToolbar.js`

### Files to Modify
1. `acrx/assets/js/editor.js` — Initialize panels

### Requirements

**layersPanel.js**: Render document tree from `document.blockOrder` and `document.blocks`. Each node shows expand/collapse arrow, block type icon, label, visibility toggle, lock toggle. Click selects block. Expand/collapse toggles children. Visibility/lock toggles update block state.

**inspectorPanel.js**: Watch `editor.selectedBlockId`. When a block is selected, populate inspector controls (Identity, Layout, Typography, Background sections). Each control reads from `document.blocks[id].styles`. On change, update state and trigger canvas re-render.

**postPanel.js**: Display and edit `editor.title`, `editor.status`, `editor.excerpt`. Title syncs with top bar. Status dropdown updates state.

**seoPanel.js**: Create `seo` state store. Display and edit SEO title (60 char limit), meta description (160 char limit), focus keyword. Character count displays.

**blockToolbar.js**: Appear when block selected. Position near selected block. Show bold, italic, duplicate, delete buttons. Each button triggers command execution.

### Acceptance Criteria
- [ ] Layers panel shows document tree
- [ ] Clicking layer selects block in canvas
- [ ] Expand/collapse works in layers
- [ ] Visibility and lock toggles work
- [ ] Inspector shows selected block properties
- [ ] Changing inspector updates block in canvas
- [ ] Post panel shows title, status, excerpt
- [ ] SEO panel shows title, description, keyword with character counts
- [ ] Block toolbar appears on selection
- [ ] Toolbar buttons execute correct commands

---

## 69. CODING-AGENT PROMPT — PHASE 9 (INSERTION + DRAG/DROP)

### Context
Phases 1-8 are complete. Now the editor needs content insertion from multiple sources and block reordering via drag/drop.

### Objective
Implement Phase 9: Insertion + Drag/Drop.

### Files to Create
1. `acrx/assets/js/editor/insertion.js`
2. `acrx/assets/js/editor/dragDrop.js`

### Files to Modify
1. `acrx/assets/js/editor.js` — Initialize insertion and drag/drop

### Requirements

**insertion.js**:
```javascript
import State from '../utils/state.js';
import BlockEngine from './blockEngine.js';
import Selection from './selection.js';

const InsertionEngine = {
  insert(type, opts = {}) {
    const targetAfterId = opts.afterId || State.value("editor.selectedBlockId");
    const newBlock = BlockEngine.createBlock(type);
    BlockEngine.insertBlock(targetAfterId, newBlock);
    if (opts.focus !== false) Selection.selectBlock(newBlock.id);
    return newBlock;
  },
  insertBlocks(blocks, opts = {}) {
    let lastId = opts.afterId || State.value("editor.selectedBlockId");
    for (const blockData of blocks) {
      const block = BlockEngine.createBlock(blockData.type, blockData);
      BlockEngine.insertBlock(lastId, block);
      lastId = block.id;
    }
  },
  insertFromPaste(clipboardData, opts = {}) {
    const html = clipboardData.getData("text/html");
    const text = clipboardData.getData("text/plain");
    if (html) { this.insertBlocks(this.parseHTML(html), opts); }
    else if (text) {
      this.insertBlocks(text.split("\n").map(line => ({
        type: "paragraph", content: [{ type: "text", text: line, marks: [] }]
      })), opts);
    }
  },
  parseHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const blocks = [];
    doc.body.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        blocks.push({ type: "paragraph", content: [{ type: "text", text: node.textContent, marks: [] }] });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagMap = { "p": "paragraph", "h1": "heading", "h2": "heading", "h3": "heading", "ul": "bulletList", "ol": "orderedList" };
        const type = tagMap[node.tagName.toLowerCase()];
        if (type) blocks.push({ type, content: [{ type: "text", text: node.textContent, marks: [] }] });
      }
    });
    return blocks;
  },
  showDropIndicator(position) {
    let indicator = document.getElementById("drop-indicator");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = "drop-indicator";
      indicator.className = "drop-indicator";
      document.querySelector(".canvas").appendChild(indicator);
    }
    indicator.style.top = position.top + "px";
    indicator.style.display = "block";
  },
  hideDropIndicator() {
    const indicator = document.getElementById("drop-indicator");
    if (indicator) indicator.style.display = "none";
  }
};

export default InsertionEngine;
```

**dragDrop.js**: Implement drag initiation, preview creation, drop position detection, drop execution, and cancellation. Support block reordering and new block insertion from panels.

**editor.js**: Wire paste event to `InsertionEngine.insertFromPaste()`. Wire drag from block handles and sidebar panels to `DragDropEngine.startDrag()`.

### Acceptance Criteria
- [ ] Blocks can be inserted at any position
- [ ] Blocks can be dragged to reorder
- [ ] Drop zones appear between blocks
- [ ] Drop indicator shows insertion point
- [ ] Paste HTML creates correct blocks
- [ ] Paste plain text creates paragraphs
- [ ] Escape cancels drag
- [ ] Drop indicator hidden after drop

---

## 70. CODING-AGENT PROMPT — PHASE 10 (PERSISTENCE + AUTO-SAVE)

### Context
Phases 1-9 are complete. Now the editor needs save/load with auto-save, dirty state tracking, and retry logic.

### Objective
Implement Phase 10: Persistence + Auto-Save.

### Files to Create
1. `acrx/assets/js/editor/persistence.js`

### Files to Modify
1. `acrx/assets/js/editor.js` — Initialize persistence, wire up save

### Requirements

**persistence.js**:
```javascript
import State from '../utils/state.js';

const PersistenceEngine = {
  autoSaveTimer: null,
  retryCount: 0,
  maxRetries: 3,
  retryDelays: [5000, 15000, 30000],

  async load(documentId, postType) {
    try {
      const response = await fetch(`/acr/api/editor/${documentId}/data?type=${postType}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const json = data.document.content.json;
      State.batch(() => {
        State.patch("document", { blocks: json.blocks || {}, blockOrder: json.blockOrder || [], version: json.version || 1 });
        State.patch("editor", { documentId, title: data.document.title || "", status: data.document.status || "draft", isDirty: false, lastSavedAt: null });
        if (data.seoReport) State.patch("seo", data.seoReport);
      });
      return true;
    } catch (error) { console.error("Load failed:", error); return false; }
  },

  async save(isManual = false) {
    if (State.value("editor.isSaving")) { this.scheduleAutoSave(5000); return; }
    State.set("editor.isSaving", true);
    try {
      const documentId = State.value("editor.documentId");
      const doc = State.get("document");
      const editor = State.get("editor");
      const payload = {
        content: { json: { version: doc.version, blocks: doc.blocks, blockOrder: doc.blockOrder }, html: "", raw: "", conditionalJS: null },
        title: editor.title, status: editor.status, postType: editor.postType || "post"
      };
      const response = await fetch(`/acr/api/editor/${documentId}/content`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      State.batch(() => {
        State.set("editor.isDirty", false);
        State.set("editor.lastSavedAt", Date.now());
        State.set("editor.isSaving", false);
      });
      this.retryCount = 0;
      return true;
    } catch (error) {
      console.error("Save failed:", error);
      State.set("editor.isSaving", false);
      this.handleSaveFailure(error);
      return false;
    }
  },

  handleSaveFailure(error) {
    if (this.retryCount < this.maxRetries) {
      const delay = this.retryDelays[this.retryCount];
      this.retryCount++;
      setTimeout(() => this.save(true), delay);
    }
  },

  scheduleAutoSave(delay = 30000) {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => this.save(), delay);
  },

  initAutoSave() {
    State.watch("editor.isDirty", (isDirty) => {
      if (isDirty && State.value("editor.autosaveEnabled")) {
        this.scheduleAutoSave();
      }
    });
  }
};

export default PersistenceEngine;
```

**editor.js modifications**: Initialize persistence, wire Ctrl+S to save, load document on init, set up auto-save.

### Acceptance Criteria
- [ ] Document loads from API on editor open
- [ ] Changes auto-save after 30s debounce
- [ ] Ctrl+S saves immediately
- [ ] Save status shows in footer ("Saving...", "Saved at HH:MM")
- [ ] Failed saves retry 3 times with backoff
- [ ] Dirty state tracked correctly
- [ ] beforeunload warns on unsaved changes

---

## 71. CODING-AGENT PROMPT — PHASE 11 (ADVANCED: COPY/PASTE, RESPONSIVE, PATTERNS, MEDIA)

### Context
Phases 1-10 are complete. The editor has full editing, UI, persistence, and history. Now it needs advanced features: copy/paste, responsive editing, pattern insertion, and media integration.

### Objective
Implement Phase 11: Advanced Features.

### Files to Create
1. `acrx/assets/js/editor/copyPaste.js`
2. `acrx/assets/js/editor/responsive.js`
3. `acrx/assets/js/editor/patternEngine.js`
4. `acrx/assets/js/editor/mediaIntegration.js`

### Files to Modify
1. `acrx/assets/js/editor.js` — Initialize advanced features

### Requirements

**copyPaste.js**: Internal copy (block JSON to clipboard), external copy (HTML to clipboard), paste from various sources (HTML, plain text, images), HTML sanitization, ID regeneration on paste.

**responsive.js**: Device mode switching (desktop/tablet/mobile), canvas viewport adjustment, responsive override inheritance (desktop → tablet → mobile), per-device visibility, inspector mode-specific value display.

**patternEngine.js**: Load patterns from API, display pattern grid in left sidebar Patterns tab, pattern preview, insert pattern blocks into document, pattern categories and search.

**mediaIntegration.js**: Open existing `mediaPicker.js` for image block source selection, featured image selection in Post panel, background image selection in Inspector, image block attrs update (src, alt, caption).

### Acceptance Criteria
- [ ] Copy/paste works for blocks (internal and external)
- [ ] HTML paste creates correct block types
- [ ] Plain text paste creates paragraphs
- [ ] Device mode switches canvas viewport
- [ ] Responsive overrides apply per device
- [ ] Patterns load from API and display in panel
- [ ] Pattern insertion adds blocks to document
- [ ] Media picker opens for image blocks
- [ ] Image block attrs update correctly
- [ ] Featured image selectable in Post panel

---

## 72. FINAL VERIFICATION CHECKLIST

### Architecture
- [ ] Document model (client-side) implemented
- [ ] State ownership defined and enforced
- [ ] Command system centralized
- [ ] Selection engine with sync
- [ ] History engine with undo/redo
- [ ] Serialization format defined
- [ ] Persistence layer functional
- [ ] Extension points defined

### Editor Core
- [ ] Block rendering from document model
- [ ] Block CRUD operations (insert, delete, duplicate, transform, move)
- [ ] Text editing in contentEditable blocks
- [ ] Inline marks (bold, italic, underline, strike, code, link)
- [ ] Block insertion at any position
- [ ] Block deletion with confirmation
- [ ] Block transformation (paragraph ↔ heading)
- [ ] Block movement (up/down, drag)
- [ ] Drag and drop reordering
- [ ] Copy/paste (internal and external)
- [ ] Keyboard navigation between blocks

### UI Components
- [ ] Slash menu with search and filtering
- [ ] Command palette with search and execution
- [ ] Floating block toolbar
- [ ] Layers panel with tree view
- [ ] Block inspector with all sections
- [ ] Post panel with metadata controls
- [ ] SEO panel with analysis
- [ ] Widget library panel
- [ ] Pattern library panel
- [ ] Media picker integration

### Content
- [ ] Post settings (title, slug, status, excerpt)
- [ ] SEO settings (title, description, keyword, canonical)
- [ ] Responsive overrides per device
- [ ] Custom CSS classes per block
- [ ] Custom attributes per block
- [ ] Conditional visibility rules
- [ ] Dynamic content placeholders
- [ ] Pattern insertion
- [ ] Reusable block support

### Quality
- [ ] Unit tests for all engines
- [ ] Integration tests for engine interactions
- [ ] Browser tests for user flows
- [ ] Accessibility (keyboard, ARIA, screen reader)
- [ ] Security (sanitization, validation, auth)
- [ ] Performance (virtualization, debouncing, <16ms text input)
- [ ] Error handling (graceful degradation)
- [ ] Loading states
- [ ] Empty states
- [ ] Toast notifications for feedback

### Persistence
- [ ] Document loads from API on editor open
- [ ] Auto-save with 30s debounce
- [ ] Manual save with Ctrl+S
- [ ] Save status in footer
- [ ] Failed save retry (3 attempts)
- [ ] Dirty state tracking
- [ ] beforeunload warning
- [ ] Revision creation on save

### Integration
- [ ] All modules import correctly
- [ ] State stores reactive across modules
- [ ] Event system for inter-component communication
- [ ] Focus management across panels and menus
- [ ] Selection syncs between canvas, layers, inspector
- [ ] History captures all document mutations
- [ ] Commands execute through command engine
- [ ] No console errors on load or interaction
