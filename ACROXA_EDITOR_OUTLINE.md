# ACROXA EDITOR — BLUEPRINT OUTLINE

> Condensed overview of the full 72-section implementation blueprint.
> Full document: `ACROXA_EDITOR_MASTER_BLUEPRINT.md` (6,700+ lines)

---

## PART I: CURRENT STATE ANALYSIS

### 1. Executive Summary
- **Status**: Editor shell exists (HTML), runtime logic missing (42 lines of JS)
- **Backend**: Solid — APIs, models, revisions, media, SEO all working
- **Goal**: Professional block-based editor (Gutenberg/Elementor-class)

### 2. Repository Exploration Method
- Explored: `src/`, `acrx/`, models, routes, controllers, views, JS modules
- Key paths identified for modification

### 3. Existing Architecture
- Express server → route discovery → auth middleware → page renderer → client scripts
- Server-rendered HTML shell with header, sidebars, canvas, toolbar, footer

### 4. Existing Directory Structure
```
src/views/editor.js          — Server-rendered editor HTML (complete)
acrx/assets/js/editor.js     — Client init (42 lines — sidebar only)
acrx/assets/js/utils/state.js — Reactive state engine (238 lines, ready)
acrx/assets/js/components/mediaPicker.js — Media picker (functional)
src/models/sql/shared/contentSchema.js — { json, html, raw, conditionalJS }
```

### 5. Existing Blocks/Widgets
- Slash menu: paragraph, heading, image, gallery, video, button, alert, code-block, columns, hero, cta, faq, pricing, table, divider, embed
- Toolbar: bold, italic, strike, inline-code, blockquote, alignment, lists

### 6. Existing Problems & Missing Systems
| System | Status |
|--------|--------|
| Editor HTML shell | ✅ Complete |
| Sidebar toggle + tabs | ✅ Complete |
| Reactive state engine | ✅ Complete |
| Media picker | ✅ Complete |
| Editor APIs (save/load) | ✅ Complete |
| Document model (client) | ❌ Missing |
| Block engine | ❌ Missing |
| Text editing engine | ❌ Missing |
| Selection engine | ❌ Missing |
| Command engine | ❌ Missing |
| Keyboard system | ❌ Missing |
| Slash menu logic | ❌ Missing |
| Command palette logic | ❌ Missing |
| Layers panel logic | ❌ Missing |
| Inspector panel logic | ❌ Missing |
| Persistence (auto-save) | ❌ Missing |
| History (undo/redo) | ❌ Missing |
| Drag and drop | ❌ Missing |
| Copy/paste | ❌ Missing |
| Responsive editing | ❌ Missing |

---

## PART II: TARGET ARCHITECTURE

### 7. Target Editor Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    EDITOR SHELL (server-rendered)         │
├─────────────────────────────────────────────────────────┤
│                    EDITOR RUNTIME (client-side)           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Document │  │Selection │  │ Command  │              │
│  │ Engine   │  │ Engine   │  │ Engine   │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Block   │  │ Keyboard │  │ History  │              │
│  │  Engine  │  │  Engine  │  │  Engine  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Text    │  │ Insertion│  │Persistnce│              │
│  │  Engine  │  │  Engine  │  │  Engine  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Layers   │  │Inspector │  │  Slash   │              │
│  │  Panel   │  │  Panel   │  │  Menu    │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Command  │  │Drag/Drop │  │  Media   │              │
│  │ Palette  │  │  Engine  │  │  Picker  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

### 8. Target Document Model
```javascript
{
  id: "block_abc123",
  type: "paragraph",
  content: [{ type: "text", text: "Hello", marks: [{ type: "bold" }] }],
  attrs: { level: 1, align: "left" },
  styles: { margin: {}, padding: {}, backgroundColor: "" },
  responsive: { mobile: {}, tablet: {}, desktop: {} },
  children: [],
  parent: "block_root",
  locked: false,
  hidden: false
}
```

### 9. State Architecture
| Store | Purpose | Persistence |
|-------|---------|-------------|
| `editor` | UI state (sidebar, panels, selection) | Session only |
| `document` | Block content model | API (save/load) |
| `history` | Undo/redo stacks | Session only |
| `selection` | Current selection state | Transient |

---

## PART III: ENGINE SPECIFICATIONS

### 10-12. Core Engines
| Engine | Responsibility | Key APIs |
|--------|---------------|----------|
| **Selection** | Track text/block/widget selection | `selectBlock()`, `selectText()`, `clearSelection()` |
| **Command** | Registry + execution of all actions | `registerCommand()`, `executeCommand()` |
| **Block** | CRUD, rendering, nesting, transformation | `insertBlock()`, `deleteBlock()`, `duplicateBlock()` |

### 13-16. Content Engines
| Engine | Responsibility | Key APIs |
|--------|---------------|----------|
| **Widget** | Widget lifecycle, configuration, rendering | `registerWidget()`, `createWidget()` |
| **Text** | Inline content, marks, contentEditable | `toggleMark()`, `applyMarks()` |
| **Insertion** | Unified insertion from all sources | `insertAt()`, `insertAfter()` |
| **History** | Undo/redo with transaction grouping | `undo()`, `redo()`, `record()` |

### 17-20. System Engines
| Engine | Responsibility | Key APIs |
|--------|---------------|----------|
| **Serialization** | Document ↔ JSON ↔ HTML | `serialize()`, `deserialize()` |
| **Persistence** | Auto-save, manual save, revisions | `save()`, `load()`, `autoSave()` |
| **Plugin** | Extension discovery, hooks, lifecycle | `use()`, `hook()`, `emit()` |
| **Events** | Pub/sub for editor lifecycle | `on()`, `off()`, `emit()` |

### 21-22. Interaction Systems
| System | Responsibility | Key APIs |
|--------|---------------|----------|
| **Keyboard** | All shortcuts, focus management | `handleKeydown()`, `registerShortcut()` |
| **Slash Menu** | "/" trigger, search, filter, insert | `open()`, `filter()`, `select()` |
| **Command Palette** | Ctrl+K, search commands, execute | `open()`, `search()`, `execute()` |
| **Context Menus** | Right-click menus for blocks/widgets | `show()`, `hide()` |

---

## PART IV: UI PANEL SPECIFICATIONS

### 23-26. Editor Shell & Sidebars
| Panel | Content | Data Source |
|-------|---------|-------------|
| **Top Bar** | Back, undo/redo, title, save, device mode, publish | Editor state |
| **Left Sidebar** | Layers, Widgets, Patterns tabs | Document tree, API |
| **Right Sidebar** | Post, SEO, Block tabs | Post model, SEO data, selected block |

### 27-30. Left Sidebar Panels
| Panel | Features |
|-------|----------|
| **Layers** | Hierarchical tree, expand/collapse, reorder, visibility, lock |
| **Widgets** | Categorized grid, search, preview, drag/click to insert |
| **Patterns** | Saved patterns, categories, search, preview, insert |

### 31-34. Right Sidebar Panels
| Panel | Features |
|-------|----------|
| **Post** | Title, slug, status, author, date, featured image, excerpt, categories, tags, template |
| **SEO** | Title, description, keyword, canonical, robots, Open Graph, score |
| **Block Inspector** | Identity, layout, typography, background, border, effects, responsive, advanced |

### 35-38. Canvas Features
| Feature | Description |
|---------|-------------|
| **Block Rendering** | DOM generation from document model, contentEditable for text |
| **Selection** | Click to select, Shift/Ctrl for multi, hover highlights |
| **Drag/Drop** | Block handle drag, insertion zones, nesting support |
| **Responsive** | Desktop/tablet/mobile breakpoints, inherited/overridden values |

---

## PART V: QUALITY & SECURITY

### 39-42. Quality Systems
| System | Key Requirements |
|--------|-----------------|
| **Accessibility** | Keyboard-only editing, ARIA labels, focus management, screen reader |
| **Security** | HTML sanitization, XSS prevention, URL validation, auth tokens |
| **Performance** | <16ms text input, <100ms block ops, virtualization for 500+ blocks |
| **Error Handling** | Graceful degradation, retry logic, user-facing toasts |

### 43-44. Testing
| Type | Coverage |
|------|----------|
| **Unit** | Document model, block CRUD, marks, selection, history |
| **Integration** | Block insert → render → state, text edit → persist |
| **Browser** | Full workflow: create, edit, save, load, undo/redo |

---

## PART VI: IMPLEMENTATION PLAN

### 45-48. Schema & Data Flows
- **Document Schema**: JSON with versioning, migrations, backwards compatibility
- **Save Flow**: Auto-save (30s) → POST → revision → response → clear dirty
- **Load Flow**: GET → parse → State.patch → renderCanvas → ready
- **Undo/Redo**: Snapshot document + selection → push stack → restore

### 49-50. Dependencies & Roadmap
```
Phase 1: Document Model + State (foundation)
    ↓
Phase 2: Block Engine (rendering)
    ↓
Phase 3: Text Engine (editing)
    ↓
Phase 4: Selection Engine
    ↓
Phase 5: Keyboard System
    ↓
Phase 6: Command Engine + Slash Menu + Command Palette
    ↓
Phase 7: History Engine
    ↓
Phase 8: UI Panels (Layers, Inspector, Post, SEO)
    ↓
Phase 9: Insertion + Drag/Drop
    ↓
Phase 10: Persistence + Auto-Save
    ↓
Phase 11: Advanced (Copy/Paste, Responsive, Patterns, Media)
```

### 51-62. File-Level Change Plan
| Phase | Files Created | Files Modified |
|-------|--------------|----------------|
| 1 | `editor/document.js`, `editor/blocks.js`, `editor/state.js` | `editor.js` |
| 2 | `editor/rendering.js`, `editor/blockEngine.js` | `editor.js` |
| 3 | `editor/textEngine.js`, `editor/marks.js` | `editor/rendering.js` |
| 4 | `editor/selection.js` | `editor/state.js` |
| 5 | `editor/keyboard.js` | `editor.js` |
| 6 | `editor/commands.js`, `editor/slashMenu.js`, `editor/commandPalette.js` | — |
| 7 | `editor/history.js` | `editor/state.js` |
| 8 | `editor/layersPanel.js`, `editor/inspectorPanel.js`, `editor/postPanel.js`, `editor/seoPanel.js` | — |
| 9 | `editor/insertion.js`, `editor/dragDrop.js` | — |
| 10 | `editor/persistence.js` | `editor.js` |
| 11 | `editor/copyPaste.js`, `editor/responsive.js`, `editor/patterns.js` | — |

---

## PART VII: CODING-AGENT PROMPTS

Each phase includes:
- **Context**: What exists, what was built previously
- **Objective**: What to implement
- **Files to Create/Modify**: Exact paths
- **Requirements**: Code examples and specifications
- **Acceptance Criteria**: Checkbox list
- **Testing**: Browser testing steps

| Phase | Prompt Section | Lines |
|-------|---------------|-------|
| Phase 1 | §10 | ~200 |
| Phase 2 | §11 | ~200 |
| Phase 3 | §12 | ~150 |
| Phase 4 | §64 | ~170 |
| Phase 5 | §65 | ~120 |
| Phase 6 | §66 | ~90 |
| Phase 7 | §67 | ~110 |
| Phase 8 | §68 | ~45 |
| Phase 9 | §69 | ~100 |
| Phase 10 | §70 | ~110 |
| Phase 11 | §71 | ~40 |

---

## QUICK REFERENCE

### Key Files to Know
| File | Purpose |
|------|---------|
| `src/views/editor.js` | Server-rendered HTML shell |
| `acrx/assets/js/editor.js` | Client init (expand this) |
| `acrx/assets/js/utils/state.js` | Reactive state engine |
| `acrx/assets/js/utils/stateHelpers.js` | Sidebar/tab behavior |
| `acrx/assets/js/components/mediaPicker.js` | Media picker component |
| `src/models/sql/shared/contentSchema.js` | Content schema definition |
| `src/controllers/cmsController.js` | Editor save/load APIs |

### Key API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/acr/api/editor/:id/data` | GET | Full editor data |
| `/acr/api/editor/:id/content` | GET | Load content |
| `/acr/api/editor/:id/content` | POST | Save content |
| `/acr/api/media/upload` | POST | Upload media |
| `/acr/api/media/files` | GET | List media |

### Key State Stores
| Store | Key Fields |
|-------|-----------|
| `editor` | documentId, title, status, isDirty, selectedBlockId, deviceMode |
| `document` | blocks, blockOrder, rootId, version |
| `history` | undoStack, redoStack, currentVersion |
| `selection` | anchorBlockId, focusBlockId, selectedBlockIds |
