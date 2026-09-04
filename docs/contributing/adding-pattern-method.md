# Adding a pattern method

A pattern method is a complete generation strategy, not only a new panel. It must define serializable settings, validation, seeded output, controls, committed snapshot behavior, preview, export, persistence, and tests.

## Design first

Open a proposal describing:

- the visual result and use cases;
- the grid or geometry model;
- compatible shape frame kinds;
- controls, defaults, constraints, and validation messages;
- deterministic seed behavior;
- preview and export expectations;
- workload limits and likely performance risks.

Examples or diagrams are welcome, but only include material you may redistribute.

## Implementation touchpoints

1. Add the method identifier, settings, defaults, normalization, cloning, and snapshot type in `src/app/pattern-model.ts`.
2. Map settings to Toolcraft runtime targets in `src/app/pattern-state.ts`.
3. Put generation and validation in a dedicated directory under `src/app/pattern-methods/`.
4. Register the strategy in `src/app/pattern-methods/registry.ts`.
5. Add the method option and schema-backed controls in `src/app/app-schema.ts`; use an app-level custom control only when built-in controls cannot represent the workflow.
6. Make the renderer and export metadata understand the new snapshot without duplicating the generation algorithm.
7. Update history restoration and settings transfer when the method introduces new persisted state.

Do not store method state in route-local React state, add app UI to `canvasContent`, or patch `src/toolcraft` for product-specific behavior.

## Required coverage

- Unit tests for defaults, normalization, validation, seeded determinism, edge cases, and geometry.
- Acceptance entries for every visible entity and action.
- Browser tests that select the method, edit its controls, generate, restore history, and export.
- Performance scenarios when the method changes renderer workload, output size, or live-control responsiveness.

Run `npm run verify:final` before review. A large renderer or architecture change may also require the dedicated performance checkpoint described by the project contract.
