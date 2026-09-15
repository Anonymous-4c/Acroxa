# AcroxaJS — Runtime Architecture (as implemented)

AcroxaJS is the runtime layer underneath Acroxa. Acroxa's CMS (layouts, views,
extensions, editor, admin, visitor pages) runs on top of it. This document
describes the system as implemented — no fictional components.

> Non-goals (enforced): no React, no Next.js, no Prisma, no Clerk, no virtual
> DOM. Server rendering stays string-based (`el()`); the runtime adds
> identity, lifecycle, and transport around it.

## 1. Update propagation chain

```
source change
  → hot-reloader (chokidar dir-watch, 250ms coalescing → ONE transaction)
  → pipeline.classify (kind/scope) + owners.ownerOf (owner)
  → planner.choose (smallest safe strategy)
  → scoped require.cache eviction (never cascades into src/core/)
  → local rebuild (pages router / loadRoutes / layout init)
  → invalidate / bundle (rev bump, graph walk, cache drop, SSE broadcast)
  → transport (SSE event + ping/sync/fragment endpoints)
  → client runtime (visitor: acroxa-runtime.js / admin: acrx-admin-runtime.js)
  → target lookup ([data-acrx-id]) → DOM patch / fragment swap
  → rehydrate affected subtree only (hydration.js, idempotent)
  → diagnostics (knob panel, log stream, revision history)
```

Invalidation ("your representation may be stale") and update (replacement
payload) are separate steps. Full document reload is never automatic: the
`full-reload` strategy only marks the document stale with a reason.

## 2. Server modules (`src/core/runtime/`)

| Module | Responsibility |
|---|---|
| `revision.js` | Monotonic rev + bootId in a global slot (survives re-require; resets only on process restart). Keeps last-50 history for resync. |
| `registry.js` | Central capability registry. Entry `{id,type,owner,name,version,deps,status,meta,dispose}`, id = `type:owner:name`. Re-register updates in place; `disposeOwner` cleans one owner with error isolation. |
| `graph.js` | Resource dependency graph (global-slot backed): `depend`, `dependenciesOf`, `dependentsOf`, `affectedBy` (BFS, capped). Keys are normalized (win32 separators). Populated by `pages.js` (each admin page depends on its view source file in the same bare-path key space invalidations query); `hot-reloader` removes a deleted file's edges on unlink. Admin client skips swaps for pages an invalidation doesn't name. |
| `owners.js` | File → owner attribution (explicit map + layout/view/route/plugin heuristics). |
| `pipeline.js` | `classify` (path → kind/scope) + `handleFileChange` (classify → owner → plan → invalidate). Watchers never touch the browser directly. |
| `planner.js` | `choose` → smallest safe strategy: `stylesheet-refresh`, `rehydrate`, `fragment-replace`, `subtree-reconcile`, `module-reload`, `navigation`, `full-reload` (each with a human reason). |
| `invalidate.js` | `invalidate` / `bundle`. Bumps rev, walks dependents, emits `runtime:invalidated`, runs hook fan-out, drops dependent cache entries, broadcasts SSE (+ legacy `layout.updated`/`page.updated` compat). Timed via `perf`. |
| `lifecycle.js` | `defineModule` with stages discover→…→dispose; failures mark the module failed and clean its registrations, core stays alive. `track` ties any disposer to an owner. |
| `hookBus.js` | First-class hooks: `domain:action` names, priority (core 0 → extension 10 → module 20 → component 30), sync/async modes, failure isolation, per-owner disposal. `pluginAPI.addHook/runHooks` delegate to it. |
| `events.js` | Namespaced (`domain:action`) disposable event bus with per-owner disposal. |
| `cache.js` | Named TTL caches with explicit dep indexing, targeted `invalidate(dep)` (+ `prefix:*`), hit/miss stats, and `versionTag` (content-hash in prod, nonce in dev). |
| `apiRegistry.js` | Stable dispatch table + single proxy router mounted once. Re-registration updates in place — reloads never duplicate Express layers. |
| `targets.js` | Server render-target registry: `id → {type,owner,node,rev}` (in-memory, TTL-pruned). Backs `POST /acr/api/runtime/fragment {type:"target"}`. |
| `identity.js` | Stable target ids `type:owner:key` + compact `data-acrx-*` attribute helpers. |
| `perf.js` | Real timing via `performance.now()`: `measure`/`measureAsync`/`record` + per-stage `{count,avgMs,maxMs,lastMs}` aggregates. Capped, no timers, no I/O. Instrumented: `invalidate`, `invalidate-bundle`, `pipeline`, `fragment:*`. Surfaced in `shell.snapshot().perf`, admin snapshot, and public manifest. |
| `shell.js` | Wires registries/lifecycle/events; `snapshot()` aggregates ONLY live state (revision, registry, events, layout, SSE, graph, targets, logs, perf). |

Legacy `pluginAPI.registered` arrays remain canonical for menus/widgets/etc;
the runtime registry tracks disposability alongside them, and every
`register*` returns a disposer (`disposeOwner` removes all of an owner).

## 3. Process-stable core boundary

`src/core/` holds the runtime singletons and is **never cascade-evicted**:

- `hot-reloader.clearModuleScoped` and index.js `rebuildPagesRouter` skip
  `src/core/` in dependency walks (only an explicitly changed core file may
  drop itself; core behavior changes take effect on restart).
- Rationale: evicting the registry/hookBus as a side effect of editing an
  unrelated controller silently wipes all registrations and kills every hook
  until restart (found live during implementation, fixed, regression-tested
  in `__tests__/core-stability.test.mjs`).
- `revision.js` and `graph.js` additionally persist in global slots.

## 4. Rendering model

- `src/views/lib/framework.js` `el()` is unchanged string rendering. Opt-in
  identity only: `el.h()` (boxed String carrying `__acrx` meta) and
  `el.describe()` (plain-JSON transport-safe descriptor). Deterministic
  hashed ids — never random per render.
- `src/layouts/framework/widgetRenderer.js`: interactive widgets
  (tabs, faq, accordion, video, search-form) emit `data-acrx-id` via one
  `acrxTarget()` helper AND register the target for fragment re-render.
  Static text/image widgets stay untouched (lean visitor HTML).
- `LayoutEngine` (`src/layouts/framework/`) renders full documents; partial
  output comes from `POST /acr/api/runtime/fragment` (`widget-node` /
  `widget-doc` public echo, `target` registered-target render with cache,
  `template` authenticated). Only scalar params cross the boundary.
- Layout switching (`init.js`) builds the new engine BEFORE retiring the old
  one — a failed reload never leaves the site engineless.

## 5. Transport (`src/routes/runtimeRoutes.js` + `src/core/sseHub.js`)

Mounted at `/acr/api/runtime/*` via the hot-reloadable `loadRoutes` proxy:

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /runtime/ping` | public | rev + bootId + maintenance, `no-store` |
| `GET /runtime/sync?since=` | public | current rev + missed history slice (reconcile, not reload) |
| `GET /runtime/sse` | public | SSE stream: `connected` (rev), `ping`, `runtime.invalidated` (+ legacy compat events) |
| `POST /runtime/fragment` | public except `template` | targeted render (validated, never executes client code) |
| `GET /runtime/manifest` | public | runtime manifest: rev, transports, capabilities, hook names, aggregate counts, perf |
| `POST /runtime/invalidate` | admin | explicit invalidation |
| `GET /runtime/capabilities` | admin | hooks/routes/registry/graph discovery |
| `GET /acr/api/system/runtime` | admin | full live snapshot (see `runtimeController.getSnapshot`) |

Clients use revision ordering (stale `inv.v <= lastRev` ignored),
AbortController-guarded fragment fetches, exponential-backoff reconnect with
visibility awareness, and `sync()` resync on reconnect/boot change.

## 6. Client runtimes (separate by design)

- **Visitor** (`public/assets/acroxa-runtime.js`, live pages only): SSE
  invalidation + targeted fragment patch. Stylesheet-refresh swaps links
  without DOM churn; focused-input subtrees are never clobbered (marked
  stale instead); focus/scroll preserved; never auto-reloads.
- **Widget hydration** (`src/layouts/framework/hydration-snippet.js`, inlined
  per page): delegated, idempotent tab runtime; inert without widgets.
- **Admin** (`acrx/assets/js/` loaded via `src/modules/head.js`):
  - `hydration.js` — first-class hydration: `define/registerTarget/hydrate/
    update/dispose`, strategies immediate/idle/visible/interaction/none,
    disposers run before replace, server HTML never destroyed on failure.
  - `dom-patch.js` — no vDOM: attribute diff + keyed children, else targeted
    subtree replace; preserves focus/selection/input values.
  - `acrx-update-guard.js` — `canPatch()` defers while editor canvas is
    dirty/focused; customizer syncs its dirty flag into it.
  - `acrx-admin-runtime.js` — content-region (`#acrx-content`) swaps from
    `?_frag=content` JSON, stale-marking when unsafe, `acrx:update` events,
    zero `location.reload`.
  - `acrx-runtime-knob.js` — bottom-left dot → panel (Overview/Logs/
    Warnings/Errors/Modules/Views/Hooks/Targets/Network/Updates/Performance/
    Runtime). All numbers from live endpoints; honest empty states; hides
    when unauthenticated (401 self-hide).

## 7. Hooks, extensions, routes/APIs

- Hooks fire at render (`render:beforeRender/afterRender`,
  `page:beforeRender/afterRender`), invalidation (`runtime:invalidated`),
  lifecycle (`module:updated/disposed`, `extension:loaded`), and API
  (`api:registered/invalidated`). Every registration has an owner; owner
  unload disposes hooks, events, APIs, and legacy entries together.
- Extensions participate via owner-scoped registration + `disposeOwner`;
  routes/APIs reload atomically through `loadRoutes` / `apiRegistry` proxy
  swaps (in-flight requests finish on the old router; failures keep it).
- Admin pages rebuild through the stable `pagesProxy` +
  `rebuildPagesRouter` (bounded cache drop, atomic swap, previous router kept
  on failure, broken views skipped per-file).

## 8. Dev vs production

Dev: chokidar dir-watch, coalesced hot-reload, liveReload fallback,
verbose logs, knob, detailed diagnostics. Production: deterministic boot,
content-hash asset tags, no watcher machinery, slim visitor runtime, admin
runtime only on `/acrx/*`, privileged endpoints admin-gated.

## 9. Known limitations (honest)

- New-file (`add`) detection requires the directory watcher (fixed this
  session; file-list watching missed brand-new files).
- Direct edits to `src/core/` runtime files take full effect on restart;
  hot-swap treats them as restart-class (same policy as config).
- `full-reload` strategy exists for genuinely unsafe cases (config/DB/auth
  shape changes) and marks stale with a reason instead of reloading.
- Authed admin E2E (dashboard swap, file-touch→swap) needs `E2E_STORAGE_STATE`;
  public protocol surface is covered without auth.
- Seed content has no interactive-widget pages, so visitor target-patching
  is proven via echo→register→fetch roundtrip rather than a seeded page.
- Watcher/plumbing edits (`hot-reloader.js`, `index.js` boot closures) take
  effect on restart; feature-code edits (views/routes/layouts) hot-swap.
  Verified live: stale running instances silently ignore new watcher logic.
