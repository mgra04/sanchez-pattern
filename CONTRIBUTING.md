# Contributing to Sanchez Pattern

Thank you for helping improve the project. Contributions can include bug fixes, UX improvements, performance work, documentation, new SVG shapes, or new pattern-generation methods.

Please keep discussions constructive and respectful. Critique ideas and implementations rather than people.

## Before you start

1. Search existing issues and pull requests.
2. Open an issue before a broad UI, state-model, renderer, or pattern-method change.
3. Keep one pull request focused on one outcome.
4. Do not include personal files, exported patterns, local environment files, or machine-specific paths.

By contributing code or assets, you agree that your contribution can be distributed under the project’s [MIT License](LICENSE.md). Only submit work you created or have permission to redistribute. Document any third-party source and license in the pull request.

## Local setup

Use Node.js 24 (the version in `.nvmrc`), then run:

```bash
npm ci
npm run dev
```

Run the complete gate before requesting review:

```bash
npm run verify:final
```

## Choose the right guide

- Shapes, variants, frame types, collections, and opacity units: [Adding shapes](docs/contributing/adding-shapes.md)
- A new pattern-generation workflow: [Adding a pattern method](docs/contributing/adding-pattern-method.md)
- Fixes, optimizations, refactors, and UX work: [Code improvements](docs/contributing/code-improvements.md)
- Boundaries between product code and the embedded runtime: [Architecture](docs/architecture.md)

## Pull request expectations

- Explain the user-visible result and why the change is needed.
- Include screenshots for visible UI changes and before/after evidence for visual fixes.
- Add or update unit, acceptance, and browser coverage for changed behavior.
- Keep `docs/toolcraft/agent-worklog.md` current when a product decision or verification scope changes.
- Preserve `LICENSE.md`, `NOTICE.md`, and `THIRD_PARTY_NOTICES.md`.
- Do not patch `src/toolcraft` for an app-specific need. Prefer the public schema, commands, renderer hooks, and custom-control extension points.

Maintainers may ask to split a large contribution or refine its product behavior before merge.
