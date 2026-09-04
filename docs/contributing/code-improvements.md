# Code, performance, and UX improvements

## Bug fixes

Start from a minimal reproduction and identify the state, rendering, or export boundary that is actually wrong. Add a regression test that fails before the fix whenever practical. Preview and exported output must remain consistent.

## UX changes

Describe the user problem and expected workflow, not only the desired styling. Reuse Toolcraft schema controls and runtime commands. Check empty, selected, invalid, disabled, narrow-panel, keyboard, and reset states. Include screenshots for visible changes.

## Performance work

Measure before and after using a representative heavy pattern. Preserve deterministic output while changing caches or execution order. Update `src/app/app-performance.ts` only for product-specific workloads; do not copy runtime validators into it. Performance claims need reproducible evidence.

## Refactors

Keep refactors behavior-preserving and focused. Avoid combining a broad rewrite with a new feature. Pattern generation belongs under `src/app/pattern-methods`, state mapping belongs in `pattern-state.ts`, and routes stay thin. Changes to `src/toolcraft` require an intentional runtime-level decision and broader verification.

## Verification guidance

- Documentation-only change: targeted docs check.
- Local control presentation: focused component test and browser check.
- Schema, persistence, or product behavior: `npm run verify:quick` plus relevant browser acceptance.
- Renderer, export, canvas, or heavy interaction: quick checks, targeted browser coverage, and touched performance scenarios.
- Dependency, architecture, or release-wide work: `npm run verify:final`.

Record skipped checks and their reason in the pull request. A passing typecheck alone is not sufficient evidence for user-visible behavior.
