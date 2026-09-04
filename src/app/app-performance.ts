import {
  defineToolcraftPerformance,
  type ToolcraftPerformanceConfig,
  type ToolcraftPerformanceScenario,
  type ToolcraftPerformanceStressFixture,
} from "@/toolcraft/runtime";

type ScenarioSpec = {
  controlLabel?: string;
  id: string;
  interaction: ToolcraftPerformanceScenario["interaction"];
  stress?: boolean;
  stressFixture?: ToolcraftPerformanceStressFixture;
  target?: string;
  values?: ToolcraftPerformanceScenario["values"];
  workload?: boolean;
};

function numericStressFixture(
  target: string,
  max: number,
): ToolcraftPerformanceStressFixture {
  return {
    kind: "max-value",
    loadProfile: {
      hardLimit: max,
      metric: "numeric-max",
      smoothTarget: max,
      smoothTargetRatio: 1,
      target,
      userFacingRange: "fully-guaranteed",
    },
    reason: `The schema maximum for ${target} is the heaviest supported user value.`,
    value: max,
  };
}

function customStressFixture(
  target: string,
  value: unknown,
): ToolcraftPerformanceStressFixture {
  const fixtureValue = { [target]: value };
  return {
    kind: "custom",
    loadProfile: {
      hardLimit: fixtureValue,
      metric: "custom",
      smoothTarget: fixtureValue,
      smoothTargetRatio: 1,
      target,
      userFacingRange: "fully-guaranteed",
    },
    reason: `The documented ${target} maximum exercises its heaviest supported runtime state.`,
    value: fixtureValue,
  };
}

function makeScenario(spec: ScenarioSpec): ToolcraftPerformanceScenario {
  const isExport = spec.interaction === "export-copy";
  const isFillMode = spec.id === "fill-mode-change";
  const isPatternCommit =
    spec.id === "pattern-commit-workload" || spec.id === "triangle-commit-workload";
  const isPreview = spec.interaction === "preview-render";
  const isShapeToolsBatch = spec.id === "shape-tools-batch-normalization";
  const isViewport = spec.interaction === "viewport-stability";
  const isZoom = spec.interaction === "viewport-zoom-stress";

  return {
    automated: true,
    automatedTestName: "perf: pattern state changes stay within budget",
    browser: true,
    browserTestName: `browser perf: ${spec.id}`,
    budget: isExport
      ? { maxExportMs: 8000 }
      : isShapeToolsBatch
        ? { maxPreviewMs: 2000 }
      : isPatternCommit
        ? { maxLongTaskMs: 250, maxPreviewMs: 2000 }
      : isPreview
        ? { maxLongTaskMs: 250, maxPreviewMs: 500 }
        : isViewport
          ? { maxFrameGapMs: 120 }
          : isZoom
            ? { maxFrameGapMs: 120, maxInteractionMs: 1000, maxLongTaskMs: 100 }
            : { maxFrameGapMs: 120, maxInteractionMs: 2000 },
    controlLabel: spec.controlLabel,
    expectedObservable: `${spec.id} completes within budget while the SVG pattern and Toolcraft viewport remain responsive.`,
    fixture: spec.stress
      ? "64 by 64 multi-source SVG grid"
      : isFillMode
        ? "single-cell square SVG grid for isolated gradient-control responsiveness"
        : "default 8 by 16 square SVG grid",
    id: spec.id,
    interaction: spec.interaction,
    stress: spec.stress,
    stressFixture: spec.stressFixture,
    target: spec.target,
    values: spec.values,
    workload: spec.workload ?? false,
  };
}

const scenarioSpecs: readonly ScenarioSpec[] = [
  { controlLabel: "Canvas sizing", id: "canvas-sizing-help", interaction: "control-change", target: "ui.canvasSizingHelp" },
  { controlLabel: "Shapes library", id: "shape-library-change", interaction: "control-change", target: "pattern.selectedSourceId" },
  {
    controlLabel: "SVG files",
    id: "shape-tools-batch-normalization",
    interaction: "preview-render",
    stress: true,
    stressFixture: customStressFixture(
      "shapeTools.upload",
      "36 rounded Full/Half triangle SVG files normalized locally",
    ),
    target: "shapeTools.upload",
    values: { default: "0 files", max: "36 files", min: "0 files" },
    workload: true,
  },
  { controlLabel: "SVG file", id: "svg-upload-change", interaction: "control-change", target: "library.upload" },
  { controlLabel: "Import details", id: "import-form-change", interaction: "control-change", target: "library.importForm" },
  {
    controlLabel: "Pattern shapes",
    id: "pattern-sources-workload",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.sources", "6 configured SVG sources"),
    target: "pattern.sources",
    values: { default: "1 source", max: "6 sources", min: "1 source" },
    workload: true,
  },
  { controlLabel: "Selected shape empty state", id: "selected-shape-empty", interaction: "control-change", target: "ui.selectedShapeEmpty" },
  { controlLabel: "Variant", id: "shape-variant-change", interaction: "control-change", target: "pattern.source.variant" },
  {
    controlLabel: "Frame width",
    id: "frame-width-workload",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.source.frameWidth", 256),
    target: "pattern.source.frameWidth",
    values: { default: 24, max: 256, min: 1 },
    workload: true,
  },
  {
    controlLabel: "Frame height",
    id: "frame-height-workload",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.source.frameHeight", 256),
    target: "pattern.source.frameHeight",
    values: { default: 24, max: 256, min: 1 },
    workload: true,
  },
  {
    controlLabel: "Shape scale",
    id: "shape-scale-workload",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.source.scale", 200),
    target: "pattern.source.scale",
    values: { default: 100, max: 200, min: 5 },
    workload: true,
  },
  { controlLabel: "Rotation", id: "rotation-drag", interaction: "control-drag", target: "pattern.source.rotation" },
  {
    controlLabel: "Probability",
    id: "probability-workload",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.source.weight", 100),
    target: "pattern.source.weight",
    values: { default: 1, max: 100, min: 1 },
    workload: true,
  },
  { controlLabel: "Fill", id: "fill-mode-change", interaction: "control-change", target: "pattern.source.fillMode" },
  { controlLabel: "Shape fill empty state", id: "shape-fill-empty", interaction: "control-change", target: "ui.shapeFillEmpty" },
  { controlLabel: "Color", id: "shape-color-change", interaction: "control-change", target: "pattern.source.color" },
  { controlLabel: "Gradient", id: "gradient-change", interaction: "control-change", target: "pattern.source.gradient" },
  { controlLabel: "Opacity", id: "opacity-drag", interaction: "control-drag", target: "pattern.source.opacity" },
  {
    controlLabel: "Method",
    id: "pattern-method-change",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.method", "directional-phases"),
    target: "pattern.method",
    values: { default: "base-grid", max: "directional-phases", min: "base-grid" },
    workload: true,
  },
  {
    controlLabel: "Direction angle",
    id: "direction-angle-drag",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.directionalPhases.angle", 359),
    target: "pattern.directionalPhases.angle",
    values: { default: 0, max: 359, min: 0 },
    workload: true,
  },
  {
    controlLabel: "Gradient phases",
    id: "phase-editor-change",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.directionalPhases.phases", "8 phases with 7 enabled Transition Spreads"),
    target: "pattern.directionalPhases.phases",
    values: { default: "3 phases", max: "8 phases", min: "2 phases" },
    workload: true,
  },
  {
    controlLabel: "Mosaic amount mode",
    id: "mosaic-amount-mode-change",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.mosaic.amountMode", "coverage"),
    target: "pattern.mosaic.amountMode",
    values: { default: "count", max: "coverage", min: "count" },
    workload: true,
  },
  {
    controlLabel: "Mosaic recipe",
    id: "mosaic-editor-change",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.mosaic.config", "6 sizes with 8 clusters and a 24/2 organic branch workload"),
    target: "pattern.mosaic.config",
    values: { default: "3 sizes with 1 cluster", max: "6 sizes with 8 clusters and a 24/2 organic branch workload", min: "2 sizes with 1 cluster" },
    workload: true,
  },
  {
    controlLabel: "Mosaic Anchor coverage",
    id: "mosaic-anchor-coverage-drag",
    interaction: "control-drag",
    stressFixture: customStressFixture("pattern.mosaic.config", "48 by 24 Mosaic with 24 support tiles, 2 anchors, and Anchor coverage at 100%"),
    target: "pattern.mosaic.config",
    values: { default: 80, max: 100, min: 0 },
    workload: true,
  },
  {
    controlLabel: "Triangle lattice",
    id: "triangle-editor-change",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.triangle.config", "12 Full triangles with compatible Full/Half pools"),
    target: "pattern.triangle.config",
    values: { default: "2 Full triangles", max: "12 Full triangles", min: "1 Full triangle" },
    workload: true,
  },
  {
    controlLabel: "Create Triangle pattern",
    id: "triangle-commit-workload",
    interaction: "preview-render",
    stress: true,
    stressFixture: customStressFixture(
      "actions.pattern",
      "commit a 64 by 64 Triangle snapshot with 12 Full triangles per element (57,344 slots)",
    ),
    target: "actions.pattern",
  },
  {
    controlLabel: "Transition strength",
    id: "transition-strength-drag",
    interaction: "control-drag",
    stressFixture: customStressFixture("pattern.directionalPhases.phases", "Phase 1 Transition Spread strength at 50%"),
    target: "pattern.directionalPhases.phases",
    values: { default: 100, max: 100, min: 0 },
    workload: true,
  },
  {
    controlLabel: "Rows",
    id: "rows-workload",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.baseGrid.rows", 64),
    target: "pattern.baseGrid.rows",
    values: { default: 8, max: 64, min: 1 },
    workload: true,
  },
  {
    controlLabel: "Columns",
    id: "columns-workload",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.baseGrid.columns", 64),
    target: "pattern.baseGrid.columns",
    values: { default: 16, max: 64, min: 1 },
    workload: true,
  },
  {
    controlLabel: "Gap",
    id: "gap-workload",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.baseGrid.gap", 48),
    target: "pattern.baseGrid.gap",
    values: { default: 1, max: 48, min: 0 },
    workload: true,
  },
  {
    controlLabel: "Distribution",
    id: "distribution-workload",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.baseGrid.distribution", "weighted"),
    target: "pattern.baseGrid.distribution",
    values: { default: "equal", max: "weighted", min: "equal" },
    workload: true,
  },
  {
    controlLabel: "Seed",
    id: "seed-workload",
    interaction: "control-drag",
    stressFixture: numericStressFixture("pattern.baseGrid.seed", 99999),
    target: "pattern.baseGrid.seed",
    values: { default: 42, max: 99999, min: 0 },
    workload: true,
  },
  {
    controlLabel: "Auto-fit output",
    id: "auto-fit-workload",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.baseGrid.autoFit", true),
    target: "pattern.baseGrid.autoFit",
    values: { default: true, max: true, min: false },
    workload: true,
  },
  { controlLabel: "New seed", id: "regenerate-action-change", interaction: "control-change", target: "actions.regenerate" },
  {
    controlLabel: "Opacity Distribution",
    id: "opacity-distribution-workload",
    interaction: "control-change",
    stressFixture: customStressFixture(
      "pattern.appearance.opacityDistribution",
      "Each Element with 8 weighted opacity values across 6 four-unit SVG sources",
    ),
    target: "pattern.appearance.opacityDistribution",
    values: {
      default: "disabled with 1 opacity value",
      max: "Each Element with 8 opacity values and 6 four-unit sources",
      min: "disabled",
    },
    workload: true,
  },
  { controlLabel: "Pattern name", id: "pattern-name-change", interaction: "control-change", target: "pattern.name" },
  {
    controlLabel: "Create or update pattern",
    id: "pattern-commit-workload",
    interaction: "preview-render",
    stress: true,
    stressFixture: customStressFixture("actions.pattern", "commit a 64 by 64 pattern snapshot"),
    target: "actions.pattern",
  },
  {
    controlLabel: "Pattern history",
    id: "pattern-history-workload",
    interaction: "control-change",
    stressFixture: customStressFixture("pattern.history", "20 stored pattern snapshots"),
    target: "pattern.history",
    values: { default: "1 snapshot", max: "20 snapshots", min: "0 snapshots" },
    workload: true,
  },
  { controlLabel: "Include", id: "background-include-change", interaction: "control-change", target: "export.includeBackground" },
  { controlLabel: "Background", id: "background-color-change", interaction: "control-change", target: "appearance.background" },
  { controlLabel: "File name", id: "export-file-name", interaction: "control-change", target: "export.fileName" },
  { controlLabel: "Format", id: "image-format-change", interaction: "control-change", target: "export.image.format" },
  { controlLabel: "Export help", id: "export-help", interaction: "control-change", target: "ui.exportHelp" },
  {
    controlLabel: "Resolution",
    id: "image-resolution-workload",
    interaction: "control-change",
    stressFixture: {
      kind: "custom",
      loadProfile: {
        hardLimit: { "export.resolution": "8k" },
        metric: "custom",
        smoothTarget: { "export.resolution": "8k" },
        smoothTargetRatio: 1,
        target: "export.image.resolution",
        userFacingRange: "fully-guaranteed",
      },
      reason: "8K is the heaviest supported image export resolution.",
      value: { "export.resolution": "8k" },
    },
    target: "export.image.resolution",
    values: { default: "4k", max: "8k", min: "2k" },
    workload: true,
  },
  {
    id: "preview-stress",
    interaction: "preview-render",
    stress: true,
    stressFixture: {
      kind: "custom",
      reason: "A 64 by 64 grid is the maximum 4096-cell SVG preview workload.",
      value: { fixture: "64 by 64 multi-source gradient grid" },
    },
  },
  { id: "viewport-stability", interaction: "viewport-stability" },
  {
    id: "viewport-zoom-stress",
    interaction: "viewport-zoom-stress",
    stress: true,
    stressFixture: {
      kind: "custom",
      reason: "The maximum SVG grid proves zoom transforms do not rebuild product geometry.",
      value: { fixture: "64 by 64 multi-source gradient grid" },
    },
  },
  { id: "export-output", interaction: "export-copy" },
];

const workloadTargets = [
  "pattern.sources",
  "pattern.source.frameWidth",
  "pattern.source.frameHeight",
  "pattern.source.scale",
  "pattern.source.weight",
  "pattern.method",
  "pattern.directionalPhases.angle",
  "pattern.directionalPhases.phases",
  "pattern.mosaic.amountMode",
  "pattern.mosaic.config",
  "pattern.triangle.config",
  "pattern.baseGrid.rows",
  "pattern.baseGrid.columns",
  "pattern.baseGrid.gap",
  "pattern.baseGrid.distribution",
  "pattern.baseGrid.seed",
  "pattern.baseGrid.autoFit",
  "pattern.appearance.opacityDistribution",
  "pattern.history",
  "export.image.resolution",
] as const;

export const appPerformance: ToolcraftPerformanceConfig = defineToolcraftPerformance({
  browserCheckPolicy: {
    fallbackRunner: "playwright",
    fallbackWhen: ["agent-browser-unavailable", "ci"],
    preferredRunner: "agent-browser",
  },
  rendererPipeline: {
    interactionInvalidation: [
      {
        interaction: "control-change",
        invalidates: ["svg-vector-build"],
        targets: [...workloadTargets, "actions.pattern"],
      },
      {
        interaction: "control-change",
        invalidates: ["shape-tools-normalize"],
        targets: ["shapeTools.mode", "shapeTools.sideLength", "shapeTools.activeMediaId"],
      },
      {
        interaction: "media-import",
        invalidates: ["shape-tools-normalize"],
        targets: ["shapeTools.upload"],
      },
      {
        interaction: "control-drag",
        invalidates: ["svg-vector-build"],
        targets: workloadTargets,
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: ["svg-vector-build"],
        targets: ["canvas.viewport.zoom"],
      },
      {
        interaction: "export",
        invalidates: ["still-export"],
        targets: ["actions.output", "export.image.format", "export.image.resolution"],
      },
      {
        interaction: "export",
        invalidates: ["shape-tools-download"],
        targets: ["actions.shapeTools"],
      },
    ],
    passes: [
      {
        id: "svg-vector-build",
        inputs: [
          "pattern.method",
          "pattern.sources",
          "pattern.baseGrid.rows",
          "pattern.baseGrid.columns",
          "pattern.directionalPhases.angle",
          "pattern.directionalPhases.phases",
          "pattern.mosaic.amountMode",
          "pattern.mosaic.config",
          "pattern.triangle.config",
          "pattern.appearance.opacityDistribution",
        ],
        invalidatedBy: ["pattern.controls", "pattern.source.inspector", "pattern.appearance.opacityDistribution"],
        kind: "vector-build",
        output: "preview",
        quality: "full",
        runsOn: "main",
      },
      {
        id: "still-export",
        inputs: ["svg-vector-build", "export.image.resolution", "appearance.background"],
        invalidatedBy: ["actions.output"],
        kind: "export",
        output: "export",
        quality: "export",
        runsOn: "export-only",
      },
      {
        cacheKey: ["media-id", "data-url", "shapeTools.mode", "shapeTools.sideLength"],
        id: "shape-tools-normalize",
        inputs: ["shapeTools.upload", "shapeTools.mode", "shapeTools.sideLength"],
        invalidatedBy: ["shapeTools.upload", "shapeTools.mode", "shapeTools.sideLength"],
        kind: "preprocess",
        output: "preview",
        quality: "full",
        runsOn: "main",
      },
      {
        id: "shape-tools-download",
        inputs: ["shape-tools-normalize", "shapeTools.activeMediaId"],
        invalidatedBy: ["actions.shapeTools"],
        kind: "export",
        output: "export",
        quality: "export",
        runsOn: "export-only",
      },
    ],
  },
  rendererStrategy: "svg",
  rendererTechnique: {
    exportRenderer: "canvas-2d",
    fidelityRisks: [
      "JPG export is intentionally rasterized from the shared SVG document.",
      "Angular and diamond gradient modes use documented SVG approximations.",
    ],
    layers: [
      {
        content: ["geometry"],
        exportMode: "included",
        id: "pattern-background",
        kind: "background",
        primitiveCount: "low",
        renderer: "svg",
        uiSelector: "[data-pattern-background]",
      },
      {
        content: ["dense-pattern", "geometry"],
        exportMode: "included",
        id: "pattern-grid",
        kind: "product-foreground",
        primitiveCount: "high",
        renderer: "svg",
        uiSelector: "[data-pattern-grid]",
      },
      {
        content: ["composite"],
        exportMode: "composited",
        id: "raster-export-composite",
        intentionalRasterizationReason:
          "PNG and JPG delivery intentionally rasterizes the shared SVG document only during export.",
        kind: "export-composite",
        primitiveCount: "low",
        renderer: "canvas-2d",
      },
      {
        content: ["geometry"],
        exportMode: "included",
        id: "shape-tools-preview",
        kind: "product-foreground",
        primitiveCount: "low",
        renderer: "svg",
        uiSelector: "[data-shape-tools-preview]",
      },
    ],
    performanceRisks: [
      "The maximum 64 by 64 grid creates 4096 SVG cell groups.",
      "Committed snapshots progressively mount preview cells in 128-cell animation-frame batches so maximum output completes within the explicit preview budget without one full 4096-node mount.",
      "Editing shared geometry or assignment inputs rebuilds deterministic cells on the main thread only when Create or Update commits the draft.",
      "Directional phase classification adds one projection and one ordered phase lookup per committed grid cell.",
      "Enabled Transition Spread adds at most two adjacent-boundary probability checks and stateless hashes per committed cell.",
    ],
    previewRenderer: "svg",
    previewExportDifferenceReason:
      "Live preview and SVG export remain vector; optional PNG and JPG delivery rasterizes through Canvas 2D only after the export action.",
    productRepresentation: "mixed",
    rendererStrategy: "svg",
    rendererWorkload: "simple-composition",
    sourceRepresentation: "svg",
    whyNotAlternativeStrategies: [
      "DOM would not preserve vector clipping and gradient export fidelity.",
      "Canvas 2D would rasterize the live product and weaken SVG export parity.",
      "WebGL and WebGPU add shader and path tessellation complexity without improving the editable vector source of truth.",
    ],
  },
  rendererWorkload: "simple-composition",
  scenarios: scenarioSpecs.map(makeScenario),
  usesCustomRenderer: true,
  workloadTargets,
});
