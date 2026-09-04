# Shapes Library

The library separates visual construction, variants, browsing groups, and pattern geometry.

## Terms

- **Category**: `base` or `complex`.
- **Shape Family**: one silhouette and its sparse `weight` / `form` / `radius` variants.
- **Shape Collection**: a curated browsing group of several Shape Families.
- **Frame Kind**: `square`, `equilateral-full`, or `equilateral-half`.
- **Shape Set / Tile Profile**: Triangle Pattern compatibility metadata. Collection membership never implies tile compatibility.

## Family layout

```text
shapes-library/base/example-shape/
├── shape.json
├── weight-base__radius-0.svg
└── form-filled__radius-0.svg
```

New non-square families require `shape.json`. Store exact numeric `frame`, `viewBox`, and semantic `frameKind`. Triangle families also store their existing `tile` metadata.

Triangle tile geometry may opt into a family-level transform that aligns authored SVG orientation with the Triangle Pattern slot without rewriting descendant geometry:

```json
{
  "tile": {
    "canonicalOrientation": "up",
    "canonicalTransform": { "mirrorY": true }
  }
}
```

Missing `canonicalTransform` means identity for backward compatibility. Use it only when the authored Full/Half triangle is mirrored relative to the established slot orientation; pattern row/column mirrors are composed with this transform in preview and export.

## Collection layout

Collections live in `shapes-library/collections/*.collection.json` so they may reference Base/Complex and Full/Half families without moving those families:

```json
{
  "schemaVersion": 1,
  "id": "example-collection",
  "displayName": "Example Collection",
  "description": "Related shapes with different constructions.",
  "tags": ["example"],
  "cover": {
    "category": "base",
    "familyId": "example-shape",
    "variantId": "form-filled__radius-0"
  },
  "members": [
    { "category": "base", "familyId": "example-shape" }
  ]
}
```

Every member and cover reference is validated during catalog build.

## Explicit variants, profiles, and opacity units

Manifest schema version `2` is the canonical format for parameterized families. Variant files may use compact technical names because the manifest owns their meaning:

```json
{
  "id": "profile-b",
  "file": "g01-b.svg",
  "profileId": "profile-b",
  "opacityUnits": { "mode": "separate-elements", "count": 4 }
}
```

A version-two collection may define shared Variant Profiles once and require complete or sparse member coverage. For example, `equilateral-triangle-glyphs` and `drafting-triangle-glyphs` define profiles A/B/C with shared `thicknesses` and `main-inner-gap` parameters, while each glyph family only links its three concrete variants to those profile IDs. The former uses `equilateral-full` frames; the latter uses `equilateral-half` frames and remains directly compatible with half-triangle slots in Triangle Pattern.

Separate-element SVGs use stable, contiguous document-order annotations:

```svg
<path data-shape-opacity-unit="1" ... />
<path data-shape-opacity-unit="2" ... />
```

These IDs are technical randomization keys, not semantic part names. Legacy families and whole-SVG variants remain one atomic opacity unit. Source opacity still multiplies the pattern-wide weighted opacity and any opacity already present on an SVG element.

Opacity-unit counts belong to individual variants, not implicitly to their family. Profiles may legitimately contain different path counts when their authored construction differs; `drafting-triangle-glyph-02`, for example, uses 3/2/3 units across profiles A/B/C.

The `/shape-tools` route can save a normalized result directly to the browser-local library. It accepts compact family and variant IDs, optional collection/profile metadata, typed thickness/gap parameters, and Whole SVG or Separate Elements preparation. Repository packages and browser-local IndexedDB records normalize to the same catalog model; built-in repository collections remain read-only in the browser.

## Travel Icon Set

`travel-icon-set` is a Base/Square collection containing eleven icon families. Each family uses schema version `2` and exposes two explicit form variants: `form-outline__radius-0` (default) and `form-filled__radius-0`. Both variants are atomic whole-SVG opacity units.

Most outlines are authored as filled paths. Monochrome stroke-only sources are also supported when the root or every stroked drawable explicitly uses `fill="none"`. During sanitization, black stroke paint is replaced with the technical `data-shape-paint="stroke"` marker; preview and export then apply the source's solid color or gradient to the stroke. Mixed fill/stroke bodies are rejected until they can declare explicit paint roles, preventing accidental inherited strokes on filled geometry.

## Figma triangle exports

For side length `s`, the canonical height is `s × sqrt(3) / 2`. Figma may export a `24 × 20.7846` frame as `24 × 21`. Normalize only root `width`, `height`, and `viewBox`; never scale, center, snap, or rewrite descendant geometry. The local `/shape-tools` route performs this root-only normalization.
