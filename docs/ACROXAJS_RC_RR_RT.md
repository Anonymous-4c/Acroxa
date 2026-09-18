# AcroxaJS — RC / RR / RT (v2)

Versioned aliases over the proven pipeline. Legacy routes keep working;
new clients use `rc/rr/rt`. All three are public read-only (decision +
render + verdict) except RR `template`, which requires auth exactly like
the fragment endpoint. Rate-limited (120 req/min/IP, fail-open).

## RC — Runtime Check (`POST /acr/api/runtime/rc`)

Determines what changed, why, what depends on it, and whether targeted
rendering is safe. Deterministic + explains WHY (non-empty `why[]`).

Request `{ target?, changedFile?, kind?, scope? }` (one of target/file required).

Response `{ success, version: "rc/1", action, strategy, affected[], why[],
target, changedFile, needsHydration, needsModuleReload, generation, rev,
bootId, at }`.

Actions: `NOOP PATCH REPLACE INSERT REMOVE REHYDRATE MODULE_UPDATE
MODULE_RELOAD STYLE_UPDATE ASSET_UPDATE VIEW_UPDATE EXTENSION_UPDATE
FULL_REFRESH ERROR`. Strategy→action mapping lives in
`src/AcroxaJS/contracts/runtime-contracts.js` (`strategyToAction`);
critical boundaries (`bootstrap, runtime-root, layout-engine, transport,
auth`) always escalate to `FULL_REFRESH`.

Safety ladder (never step down on failure):
`NOOP → PATCH → REPLACE → REHYDRATE → MODULE_UPDATE → MODULE_RELOAD →
FULL_REFRESH` (`escalate()`).

## RR — Runtime Renderer (`POST /acr/api/runtime/rr`)

Renders one boundary. Never the whole document.

Request `{ target }` or `{ type: widget-node|widget-doc, node|doc }` or
`{ type: template, template, params }` (auth only).

Response envelope `{ success, version: "rr/1", boundary, html, rev,
bootId, generation, verify{hash,bytes}, assets{js,css}, hydrate,
strategy, selector, at }`. `verify.hash = sha256(html)[0:16]`
(`src/AcroxaJS/server/verify.js`). Unknown targets 404 — HTML is never
fabricated. Only scalar params cross the boundary.

## RT — Runtime Trigger (`POST /acr/api/runtime/rt`)

Validation/control layer. The server validates; the browser applies after
its own `transaction.decide` gate. The server never mutates DOM
(`applied: false` always).

Request `{ op, target?, generation? }`, op ∈ `patch replace insert
remove module-update module-reload hydrate style-update
controlled-refresh full-refresh rollback error`.

Responses: `{ success, version: "rt/1", op, target, generation, rev,
bootId, applied: false, selector, reason, at }`. Stale generations
(`generation < committed`) are rejected with **409 + `stale: true`** —
the client must drop them. Critical targets escalate non-refresh ops to
`full-refresh` with `escalation: true`.

## Wire envelope (SSE)

`runtime.invalidated` now carries `{ v, bootId, seq (=v), generation (=v),
type, id, scope, reason, targets, strategy, at }` — additive, backward
compatible. Clients order by `v`/`seq`, drop `v <= committed`.

Restart resync (no refresh demanded): on `bootId` change both runtimes
adopt the new generation and pull fresh state immediately — admin swaps
the content region, visitor resets its generation space (old generations
are incomparable across boots) and re-patches every on-page target.
Stale-mark happens ONLY when the update guard blocks (user input safe) or
the fetch fails. `ping` never adopts a foreign `bootId` silently — it
routes through `sync()`. `full-reload` strategy still only marks stale
(`data-acrx-stale`) and shows the visitor-safe banner — never
`location.reload()`.
