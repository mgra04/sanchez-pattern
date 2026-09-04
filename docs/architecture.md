# Architecture

Sanchez Pattern is a Vite, React, and TypeScript application assembled on the embedded Toolcraft runtime.

## Main boundaries

- `src/routes/` keeps routing thin. `/` hosts the pattern creator and `/shape-tools` hosts SVG normalization and library-authoring utilities.
- `src/app/app-schema.ts` declares product controls, sections, defaults, persistence, and panel actions.
- `src/app/pattern-model.ts` owns serializable pattern state and method-specific snapshots.
- `src/app/pattern-state.ts` maps runtime control values to and from pattern state.
- `src/app/pattern-methods/` contains the generation strategies for Base, Gradient, Mosaic, and Triangle.
- `src/app/pattern-renderer.tsx` renders committed product output on the Toolcraft canvas.
- `src/app/shapes/` parses, validates, sanitizes, imports, and indexes shape-library data.
- `shapes-library/` contains repository-owned SVG assets and manifests.
- `src/toolcraft/` is the embedded Toolcraft runtime. App-specific changes should use runtime extension points instead of modifying this directory.

## State and persistence

Toolcraft runtime state is the source of truth for settings and commands. A generated pattern is a serializable snapshot with a method discriminator, seed, source shapes, method settings, and output metadata. Settings and history persist in browser `localStorage`; user-imported shapes persist in IndexedDB. No application data is sent to a backend.

## Rendering and export

The committed snapshot is rendered as SVG product content inside the Toolcraft canvas. SVG export serializes that product output; raster export uses the runtime export helpers and current image-export settings. Preview and export must use the same snapshot and seeded choices so the result remains reproducible.

## Renderer Technique Decision Matrix

- `sourceRepresentation`: `svg` — every library variant retains sanitized vector geometry.
- `productRepresentation`: `mixed` — the product remains vector in preview and SVG export, with intentional rasterization only for PNG and JPG delivery.
- `previewRenderer`: `svg`.
- `exportRenderer`: `canvas-2d` for raster formats; SVG export serializes the shared vector document.
- `rendererStrategy`: `svg`.
- `rendererWorkload`: `simple-composition`, with a high primitive count for large grids.
- `fidelityRisks`: angular and diamond gradients use documented SVG approximations, and JPG necessarily rasterizes the vector source.
- `performanceRisks`: a 64 × 64 grid creates 4,096 SVG cell groups; committed previews therefore mount cells in bounded batches, and expensive geometry changes apply on Create or Update rather than on every draft edit.
- `whyNotAlternativeStrategies`: ordinary DOM composition would not preserve vector clipping and gradient export fidelity; Canvas 2D would rasterize the live product and weaken SVG export parity; WebGL or WebGPU would add path tessellation and shader complexity without improving the editable vector source of truth or product-quality SVG export/copy behavior.

## Renderer Layer Inventory

- `backgroundLayer` / `pattern-background`: low-count SVG geometry, included in export when the Background setting requests it.
- `productForegroundLayer` / `pattern-grid`: the dense, semantic SVG product foreground, included in every output.
- `editingHandlesLayer`: none; Toolcraft owns viewport and editor chrome outside product output.
- `exportComposite` / `raster-export-composite`: export-only Canvas 2D composition used for PNG and JPG.
- `shape-tools-preview`: low-count SVG product foreground on the authoring route.

The typed mirror of this layer inventory is `rendererTechnique.layers` in `src/app/app-performance.ts`.

## Render Pipeline Inventory

The typed `rendererPipeline` in `src/app/app-performance.ts` is authoritative. Its passes are:

1. `svg-vector-build`: full-quality main-thread preview construction from the committed method, sources, grid, appearance, and seed inputs.
2. `still-export`: export-only composition keyed by the vector result, resolution, format, and background settings.
3. `shape-tools-normalize`: full-quality SVG preprocessing with a cache key derived from media ID, source data, normalization mode, and side length.
4. `shape-tools-download`: export-only serialization of the normalized result.

Product control changes and control-drag commits invalidate `svg-vector-build`; shape-tool controls and media-import invalidate only normalization. Viewport-zoom and viewport-drag interactions must not invalidate product geometry. Export actions invalidate only their export pass. There is no animation-frame or timeline-playback invalidation because the product has no timeline; preview batching changes mount scheduling without changing the committed vector result.

## Extending the app

A new feature should preserve these boundaries:

1. Put serializable product behavior in the model and runtime state mapping.
2. Add controls through the schema or an app-level custom control renderer.
3. Add generation logic under `pattern-methods`, not inside a route or UI component.
4. Keep preview and export driven by the same committed snapshot.
5. Update acceptance, unit, browser, and performance coverage in proportion to the affected surface.
