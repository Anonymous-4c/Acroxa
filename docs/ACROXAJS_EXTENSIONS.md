# AcroxaJS — Extension Runtime

Acroxa uses the term **extension** (never "plugin" for architecture).
`src/extensions/` on disk is optional; the registry is code-first via
`acrx.registerExtension(manifest)`.

## Manifest

`{ id, version (semver), deps[], conflicts[], capabilities[],
boundaries[], scripts[], styles[], hooks[], apis[], criticality
(core|system|normal|optional), enabled, owner }`.
Validated by `validateManifest()`; invalid manifests throw (never stored).

```js
acrx.registerExtension({
  id: "gallery", version: "1.2.0",
  boundaries: ["boundary:core:gallery"],
  hooks: ["render:beforeRender"],
  criticality: "normal",
});
```

Every registration mirrors into `registry` (disposable) and declares
graph edges (`extension:<id> → boundaries`). Enable/disable persists in
a global slot, bumps revision, and emits `extension:loaded/unloaded`.
`disposeOwner()` removes all of an owner (legacy arrays + runtime layers).

## Conflict detection (`detectConflicts()`)

- **Declared**: A lists B in `conflicts[]` and both are enabled.
- **Shared-target**: two enabled extensions share boundaries, hooks, or
  routes.

Each conflict explains itself:

> Extension A and Extension B both affect Navigation. Potentially
> affected: Header → Navigation. Reason: both registered mutations
> against the same runtime boundary.

Surfaced in: admin knob (Extensions tab), `GET /acr/api/runtime/capabilities`
(admin), `shell.snapshot().conflicts`, manifest counts (public, counts only).

## Hot reload

`src/extensions/**` (and legacy `src/plugins/**`) classify as
`extension/module` → `module-reload` strategy → owner-scoped dispose +
affected-boundary rehydrate. No full reload for extension changes unless
the extension is `core` criticality.
