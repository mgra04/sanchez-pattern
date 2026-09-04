# Toolcraft Agent Worklog

## Status

Mode: product

Sanchez Pattern is a working local-first pattern editor with four generation methods, a repository and browser-local SVG library, deterministic history, and SVG/raster export.

## Decisions

The product uses Toolcraft as its editor shell and keeps product behavior in typed, serializable app state. This public-safe worklog records the current architecture and release evidence; private discovery notes and workstation paths are intentionally excluded from the repository.

## Renderer

- Decision: Render committed pattern snapshots as deterministic SVG product content through `src/app/pattern-renderer.tsx` and method strategies under `src/app/pattern-methods/`.
- Reason: One snapshot-driven pipeline keeps canvas preview, history restoration, and exports reproducible.
- Evidence: `src/app/pattern-renderer.tsx`, `src/app/pattern-methods/registry.ts`, renderer unit tests, browser export coverage, and `renderer-technique-inventory` contract checks.

## Timeline

- Decision: Do not enable a timeline.
- Reason: Generated patterns are still outputs; seeds alter a committed result but do not create time-based animation.
- Evidence: `src/app/app-schema.ts`, `src/app/app-acceptance.ts`, and `timeline-mode-choice` contract checks.

## Layers

- Decision: Do not expose Toolcraft layers; editable pattern sources and generated history are product entities instead.
- Reason: Shapes combine into one generated output and are already controlled through Pattern Shapes and method-specific pools.
- Evidence: `src/app/app-schema.ts`, pattern history browser tests, and `layers-enable-only-when-needed` contract checks.

## Controls

- Decision: Store product settings in Toolcraft schema controls and commands, using app-level custom renderers only for shape and method workflows that built-in controls cannot express.
- Reason: Schema-backed state preserves reset, persistence, acceptance, and panel behavior while supporting specialized editors.
- Evidence: `src/app/app-schema.ts`, `src/app/custom-controls.tsx`, `src/app/pattern-state.ts`, component tests, and browser acceptance.

## Export

- Decision: Export the committed snapshot through the shared product-output pipeline as SVG, PNG, or JPG with standard background and image-export settings.
- Reason: Exported bytes must match the visible pattern, selected dimensions, appearance seed, and background choice.
- Evidence: `src/app/pattern-export.ts`, `src/app/app-shell.tsx`, export unit tests, downloaded-file browser assertions, and `output-export-required` checks.

## Performance

- Decision: Declare representative heavy workloads in `src/app/app-performance.ts` and measure only the affected scenarios during later feature loops.
- Reason: Base, Gradient, Mosaic, Triangle, library interaction, and SVG export have different workload drivers and need explicit budgets.
- Evidence: `src/app/app-performance.ts`; the first working product baseline passed `npm run verify:perf` through the documented Playwright fallback with 36 browser performance tests.

## Decision Trail

### Iteration 1 — Public product baseline

- Request: Preserve the completed pattern creator as a maintainable product and prepare it for continued feature development.
- Task type: Product architecture, renderer, controls, persistence, library, export, and verification.
- User-visible result: A local-first editor that generates Base, Gradient, Mosaic, and Triangle patterns from reusable SVG shapes and exports reproducible results.
- Source/reference checked: Product requirements, bundled shape manifests, current Toolcraft contracts, and browser-observed output.
- Reference inputs: User-authored geometric, triangle-glyph, and travel-icon SVG assets plus product behavior descriptions.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, runtime boundary, setup/export, control, renderer, acceptance, and performance contracts.
- Contract rules applied: `runtime-shell-required`, `canvas-no-app-ui`, `controls-product-coverage`, `renderer-technique-inventory`, `output-export-required`, `persistence-policy-explicit`, and `workflow-required`.
- Decision: Keep routes thin, product state serializable, method algorithms isolated, shapes sanitized, and preview/history/export driven by the committed snapshot.
- Alternatives rejected: Route-local product state, UI inside canvas content, nondeterministic exports, and app-specific patches to the embedded Toolcraft runtime.
- State/output mapping: Schema values map through `pattern-state.ts` into typed snapshots; registered method strategies generate cells; the renderer and exporters consume the same snapshot.
- Files changed: Product files under `src/app`, thin screens under `src/routes`, manifests under `shapes-library`, tests, and public documentation.
- Verification: `npm run verify:final` passed for the working product baseline; `npm run verify:perf` passed via `playwright-fallback` with 36 performance tests.
- Skipped checks: None for the first working product baseline; the fallback was used because an agent-controlled browser was unavailable in that environment.
- Risks: Very large grids and SVG catalogs remain naturally workload-sensitive, so new methods and catalog features must update targeted performance scenarios.

### Iteration 2 — Open-source publication baseline

- Request: Prepare the completed application for a public GitHub source release with clear credits, contributor instructions, clean repository contents, and quick local startup.
- Task type: Tier 4 documentation, licensing, repository automation, dependency hygiene, and release verification.
- User-visible result: New users can understand, clone, install, run, verify, and contribute to the project from public documentation; Pixel Point and the product author receive separate, explicit credit.
- Source/reference checked: Current MIT license, package and lock metadata, dependency licenses and audit results, shape manifests, import scripts, GitHub repository conventions, and the complete local product flow.
- Reference inputs: User decisions on author naming, Pixel Point credit, redistribution rights for bundled shapes, private-file exclusions, and source-only release scope.
- Docs/contracts read: Root `AGENTS.md`, `docs/toolcraft/workflow.md`, and the brainstorming, writing-plans, systematic-debugging, and browser workflow skills.
- Contract rules applied: `workflow-required`, `renderer-technique-inventory`, `acceptance-product-observable`, `performance-coverage-levels`, and the Tier 4 final-delivery gate.
- Decision: Publish under MIT with `Mikołaj Grabowski (Nick Sanchez)` in legal metadata, a separate Pixel Point notice, public contributor guides, Node 24, deterministic CI, and no bundled internal planning history.
- Alternatives rejected: Using only an alias in legal notices, combining Pixel Point and product authorship into one ambiguous credit, committing workstation-specific import defaults, publishing stale internal plans, and testing a cold Vite development optimizer in CI.
- State/output mapping: Product state and output are unchanged; repository metadata and documentation explain the existing schema-to-snapshot-to-render/export flow, while CI exercises the existing app through its release gate.
- Files changed: Root legal/community files, `.github/`, `.gitignore`, package metadata and lockfile, contributor docs, reusable importer inputs, Playwright reliability fixtures/config, and this public worklog.
- Verification: Clean `npm ci` passed; `npm audit --json` reported zero vulnerabilities; `npm run verify:final` passed with 319 unit/contract tests, a production build, and 32 Chromium scenarios; the README capture verified `/` and `/shape-tools` in a real browser.
- Skipped checks: Full browser performance checkpoint is not required for this post-first-working non-performance publication edit; renderer workload, canvas behavior, and export behavior are unchanged.
- Risks: The main production JavaScript bundle remains large and is recorded as a future optimization opportunity; automated cross-browser coverage is still Chromium-only.

## Evidence

- Source reviewed: `src/app/app-schema.ts`, `src/app/pattern-model.ts`, `src/app/pattern-state.ts`, `src/app/pattern-renderer.tsx`, `src/app/pattern-methods/`, `src/app/shapes/`, and `shapes-library/`.
- Contract applied: Root `AGENTS.md`, `docs/toolcraft/workflow.md`, local core modules, acceptance rules, and performance rules.
- Evidence: Unit and contract suites cover model normalization, generation strategies, SVG handling, UI mapping, persistence, and export; Playwright covers real product flows.

## Verification

- Run: `npm run verify:final` — passed for the working product baseline, including tests, typecheck, production build, and functional Chromium browser acceptance.
- Run: `npm run verify:perf` — passed via `playwright-fallback`; 36 browser performance tests passed.
- Fallback reason: An agent-controlled browser was unavailable for that baseline, so the repository’s Playwright performance runner was used.
- Browser: Canvas generation, history, shape-library interactions, persistence, SVG export, and raster export were exercised in the real UI.
- Run: `npm ci` — passed from the committed lockfile shape; `npm audit --json` — passed with zero known vulnerabilities.
- Run: `npm run verify:final` — passed for the public-release candidate with 319 unit/contract tests, production typecheck/build, and 32 functional Chromium tests.
- Browser: The README capture script loaded and verified both `/` and `/shape-tools` and saved `docs/assets/sanchez-pattern.png`.
- Full browser performance checkpoint: not required for this post-first-working non-performance publication edit; product state, renderer workload, canvas, and exports are unchanged.

## Risks

- Risk: The embedded Toolcraft source makes the repository larger and should only be changed through an intentional runtime-level contribution.
- Risk: Browser automation currently covers Chromium; additional engines should be added before claiming equivalent support.
- Risk: Dependency and third-party notice summaries must be reviewed whenever the lockfile changes.
