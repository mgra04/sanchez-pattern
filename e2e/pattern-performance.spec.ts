import { expect, test, type Page } from "./fixtures";

import type { ToolcraftPerformanceConfig } from "../src/toolcraft/runtime";
import {
  applyToolcraftPerformanceStressFixture,
  dragToolcraftSliderByLabel,
  dragToolcraftSliderToPerformanceStressValue,
  expectToolcraftCanvasViewportStable,
  expectToolcraftScenarioPerformanceBudget,
  measureToolcraftInteraction,
  waitForToolcraftAnimationFrames,
  zoomToolcraftCanvasViewport,
} from "./performance-helpers";

// Keep the Playwright process independent from the Vite-only SVG catalog
// (`import.meta.glob`). The typed app matrix remains authoritative; this small
// mirror only supplies budgets and stress values to browser helpers.
const numericStressValues: Record<string, number> = {
  "columns-workload": 64,
  "direction-angle-drag": 359,
  "frame-height-workload": 256,
  "frame-width-workload": 256,
  "gap-workload": 48,
  "probability-workload": 100,
  "rows-workload": 64,
  "seed-workload": 99999,
  "shape-scale-workload": 200,
};

const customStressValues: Record<string, Record<string, unknown>> = {
  "auto-fit-workload": { "pattern.baseGrid.autoFit": true },
  "distribution-workload": { "pattern.baseGrid.distribution": "weighted" },
  "image-resolution-workload": { "export.resolution": "8k" },
  "pattern-commit-workload": { "actions.pattern": "commit a 64 by 64 pattern snapshot" },
  "pattern-history-workload": { "pattern.history": "20 stored pattern snapshots" },
  "opacity-distribution-workload": {
    "pattern.appearance.opacityDistribution": "Each Element with 8 weighted opacity values across 6 four-unit SVG sources",
  },
  "pattern-method-change": { "pattern.method": "directional-phases" },
  "phase-editor-change": { "pattern.directionalPhases.phases": "8 phases with 7 enabled Transition Spreads" },
  "mosaic-amount-mode-change": { "pattern.mosaic.amountMode": "coverage" },
  "mosaic-editor-change": { "pattern.mosaic.config": "6 sizes with 8 clusters and a 24/2 organic branch workload" },
  "mosaic-anchor-coverage-drag": { "pattern.mosaic.config": "48 by 24 Mosaic with 24 support tiles, 2 anchors, and Anchor coverage at 100%" },
  "triangle-editor-change": { "pattern.triangle.config": "12 Full triangles with compatible Full/Half pools" },
  "triangle-commit-workload": { "actions.pattern": "commit a 64 by 64 Triangle snapshot with 12 Full triangles per element (57,344 slots)" },
  "transition-strength-drag": { "pattern.directionalPhases.phases": "Phase 1 Transition Spread strength at 50%" },
  "pattern-sources-workload": { "pattern.sources": "6 configured SVG sources" },
  "shape-tools-batch-normalization": { "shapeTools.upload": "36 rounded Full/Half triangle SVG files normalized locally" },
  "preview-stress": { fixture: "64 by 64 multi-source gradient grid" },
  "viewport-zoom-stress": { fixture: "64 by 64 multi-source gradient grid" },
};

const performanceScenarioIds = [
  "canvas-sizing-help", "shape-library-change", "shape-tools-batch-normalization", "svg-upload-change", "import-form-change", "pattern-sources-workload",
  "shape-variant-change", "frame-width-workload", "frame-height-workload", "shape-scale-workload",
  "selected-shape-empty", "rotation-drag", "probability-workload", "fill-mode-change", "shape-fill-empty", "shape-color-change",
  "gradient-change", "opacity-drag", "pattern-method-change", "direction-angle-drag", "phase-editor-change", "transition-strength-drag",
  "mosaic-amount-mode-change", "mosaic-editor-change", "mosaic-anchor-coverage-drag", "triangle-editor-change", "triangle-commit-workload",
  "rows-workload", "columns-workload", "gap-workload",
  "distribution-workload", "seed-workload", "auto-fit-workload", "regenerate-action-change",
  "opacity-distribution-workload",
  "pattern-name-change", "pattern-commit-workload", "pattern-history-workload",
  "background-include-change", "background-color-change", "export-file-name", "image-format-change",
  "export-help", "image-resolution-workload", "preview-stress", "viewport-stability", "viewport-zoom-stress",
  "export-output",
] as const;

const appPerformance = {
  scenarios: performanceScenarioIds.map((id) => ({
    budget:
      id === "export-output"
        ? { maxExportMs: 8000 }
        : id === "shape-tools-batch-normalization"
          ? { maxPreviewMs: 2000 }
        : id === "pattern-commit-workload" || id === "triangle-commit-workload"
          ? { maxLongTaskMs: 250, maxPreviewMs: 2000 }
        : id === "preview-stress"
          ? { maxLongTaskMs: 250, maxPreviewMs: 500 }
          : id === "viewport-stability"
            ? { maxFrameGapMs: 120 }
            : id === "viewport-zoom-stress"
              ? { maxFrameGapMs: 120, maxInteractionMs: 1000, maxLongTaskMs: 100 }
              : { maxFrameGapMs: 120, maxInteractionMs: 2000 },
    id,
    stressFixture:
      id in numericStressValues
        ? { kind: "max-value", value: numericStressValues[id] }
        : id in customStressValues
          ? { kind: "custom", value: customStressValues[id] }
          : undefined,
  })),
} as ToolcraftPerformanceConfig;

async function openSection(page: Page, name: string): Promise<void> {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = page
    .getByRole("button", { name: new RegExp(`${escapedName} section$`) })
    .first();
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
}

async function selectPatternMethod(page: Page, name: string): Promise<void> {
  const methodIndex = ["Base", "Gradient", "Mosaic", "Triangle"].indexOf(name);
  const control = page
    .getByText("Method", { exact: true })
    .first()
    .locator("xpath=ancestor::*[@role='group'][1]")
    .getByRole("combobox");
  await control.click();
  await page.locator('[role="listbox"] [role="option"]').nth(methodIndex).click();
}

async function addShapeFamily(page: Page, familyId: string): Promise<void> {
  await page.getByRole("button", { name: "Open library" }).click();
  const family = page.getByTestId("shape-family-grid").locator(`[data-shape-family-id="${familyId}"]`);
  if (await family.count() === 0) {
    await page
      .getByTestId("shape-family-grid")
      .locator('[data-shape-collection-id="solid-triangles"]')
      .click();
  }
  await family.click();
  await page.getByTestId("shape-library-add").click();
}

const appSectionNames = [
  "Canvas Sizing",
  "Shape Library",
  "SVG file",
  "Import Details",
  "Pattern Shapes",
  "Selected Shape",
  "Shape Fill",
  "Pattern Method",
  "Grid",
  "Pattern Output",
  "Pattern History",
  "Background",
  "Image Export",
] as const;

async function collapseSectionsExcept(page: Page, activeSection: string): Promise<void> {
  for (const sectionName of appSectionNames) {
    if (sectionName === activeSection) continue;
    const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const header = page
      .getByRole("button", { name: new RegExp(`${escapedName} section$`) })
      .first();
    if ((await header.getAttribute("aria-expanded")) === "true") {
      await header.click();
    }
  }
}

async function expectPattern(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
}

async function ensurePattern(page: Page): Promise<void> {
  if ((await page.locator('[data-testid="pattern-renderer"]').count()) > 0) return;
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Create pattern" }).click();
  await expectPattern(page);
}

function getFieldTextbox(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .first()
    .locator("xpath=ancestor::*[@role='group'][1]")
    .getByRole("textbox");
}

async function openAppSection(page: Page, section: string): Promise<void> {
  await page.goto("/");
  await ensurePattern(page);
  await collapseSectionsExcept(page, section);
  await openSection(page, section);
}

async function disableAutoFit(page: Page, returnToSection: string): Promise<void> {
  await collapseSectionsExcept(page, "Grid");
  await openSection(page, "Grid");
  const autoFit = page.getByRole("switch").first();
  if ((await autoFit.getAttribute("aria-checked")) === "true") {
    await autoFit.click();
  }
  await collapseSectionsExcept(page, returnToSection);
  await openSection(page, returnToSection);
  await waitForToolcraftAnimationFrames(page, 3);
}

async function enableAllTransitionSpreads(page: Page): Promise<void> {
  await collapseSectionsExcept(page, "Pattern Method");
  await openSection(page, "Pattern Method");
  await selectPatternMethod(page, "Gradient");
  const phases = page.getByTestId("phase-list").locator("[data-phase-id]");
  while ((await phases.count()) < 8) {
    await page.getByRole("button", { name: "Add phase" }).click();
  }
  for (let index = 1; index < 8; index += 1) {
    await page.getByRole("button", { name: `Edit Phase ${index}` }).click();
    const transition = page.getByRole("switch", {
      name: `Enable transition from Phase ${index} to Phase ${index + 1}`,
    });
    if ((await transition.getAttribute("aria-checked")) !== "true") await transition.click();
  }
  await page.getByRole("button", { name: "Normalize shares" }).click();
}

test("browser perf: canvas-sizing-help", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await openAppSection(page, "Canvas Sizing");
  });
  await expect(page.getByText(/Auto-fit output keeps the canvas/)).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "canvas-sizing-help");
});

test("browser perf: shape-library-change", async ({ page }) => {
  await openAppSection(page, "Shape Library");
  await page.getByRole("button", { name: "Open library" }).click();
  const result = await measureToolcraftInteraction(page, async () => {
    await page.locator('[role="dialog"] [role="combobox"]').first().click();
    await page.locator('[role="listbox"]').getByText("Equilateral full", { exact: true }).click();
    await page.locator('[data-shape-collection-id="solid-triangles"]').click();
  });
  await expect(page.getByTestId("shape-collection-summary")).toContainText("1 of 2 shapes");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "shape-library-change");
});

test("browser perf: shape-tools-batch-normalization", async ({ page }) => {
  await page.goto("/shape-tools");
  await openSection(page, "Source SVGs");
  const files = Array.from({ length: 36 }, (_, index) => ({
    buffer: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="21" viewBox="0 0 24 21"><path d="M12 ${0.2 + index / 10000} 23.75 20.7842H0.25Z"/></svg>`,
    ),
    mimeType: "image/svg+xml",
    name: `triangle-${String(index + 1).padStart(2, "0")}.svg`,
  }));
  const result = await measureToolcraftInteraction(page, async () => {
    await page.locator('input[type="file"]').first().setInputFiles(files);
    await expect(page.locator("[data-shape-tool-result]")).toHaveCount(36);
  });
  await expect(page.getByTestId("shape-tools-preview")).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(
    result,
    appPerformance,
    "shape-tools-batch-normalization",
  );
});

test("browser perf: svg-upload-change", async ({ page }) => {
  await openAppSection(page, "SVG file");
  const fileChooserEvent = page.waitForEvent("filechooser");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Browse file" }).click();
  });
  const fileChooser = await fileChooserEvent;
  await fileChooser.setFiles({
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24"/></svg>'),
    mimeType: "image/svg+xml",
    name: "form-filled__radius-0.svg",
  });
  await expect(page.getByText("form-filled__radius-0.svg")).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "svg-upload-change");
});

test("browser perf: import-form-change", async ({ page }) => {
  await openAppSection(page, "Import Details");
  const result = await measureToolcraftInteraction(page, async () => {
    await getFieldTextbox(page, "Variant name").fill("bold");
  });
  await expect(getFieldTextbox(page, "Variant name")).toHaveValue("bold");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "import-form-change");
});

test("browser perf: pattern-sources-workload", async ({ page }) => {
  await openAppSection(page, "Shape Library");
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "Open library" }).click();
    await page.getByText("Add shape", { exact: true }).click();
  }
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "pattern-sources-workload", {
    "pattern.sources": async () => {
      await page.getByRole("button", { name: "Open library" }).click();
      await page.getByText("Add shape", { exact: true }).click();
    },
  });
  await openSection(page, "Pattern Shapes");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Normalize frames" }).evaluate((element) => element.click());
  });
  await expect(page.getByTestId("pattern-source-list").getByRole("button", { name: /^Edit / })).toHaveCount(6);
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "pattern-sources-workload");
});

test("browser perf: selected-shape-empty", async ({ page }) => {
  await openAppSection(page, "Pattern Shapes");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: /^Remove / }).click();
  });
  await openSection(page, "Selected Shape");
  await expect(page.getByText("No shape selected").first()).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "selected-shape-empty");
});

test("browser perf: shape-fill-empty", async ({ page }) => {
  await openAppSection(page, "Pattern Shapes");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: /^Remove / }).click();
  });
  await openSection(page, "Shape Fill");
  await expect(page.getByText("No shape selected").last()).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "shape-fill-empty");
});

test("browser perf: shape-variant-change", async ({ page }) => {
  await openAppSection(page, "Selected Shape");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: /Bold/ }).first().click();
  });
  await expect(page.getByTestId("shape-variant-control")).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "shape-variant-change");
});

test("browser perf: frame-width-workload", async ({ page }) => {
  await openAppSection(page, "Selected Shape");
  await disableAutoFit(page, "Selected Shape");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Frame width", appPerformance, "frame-width-workload");
  });
  await dragToolcraftSliderByLabel(page, "Frame width", 0.9);
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "frame-width-workload");
});

test("browser perf: frame-height-workload", async ({ page }) => {
  await openAppSection(page, "Selected Shape");
  await disableAutoFit(page, "Selected Shape");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Frame height", appPerformance, "frame-height-workload");
  });
  await dragToolcraftSliderByLabel(page, "Frame height", 0.9);
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "frame-height-workload");
});

test("browser perf: shape-scale-workload", async ({ page }) => {
  await openAppSection(page, "Selected Shape");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Shape scale", appPerformance, "shape-scale-workload");
  });
  await dragToolcraftSliderByLabel(page, "Shape scale", 0.9);
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "shape-scale-workload");
});

test("browser perf: rotation-drag", async ({ page }) => {
  await openAppSection(page, "Selected Shape");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Source rotation", 0.75);
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "rotation-drag");
});

test("browser perf: probability-workload", async ({ page }) => {
  await openAppSection(page, "Selected Shape");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Probability", appPerformance, "probability-workload");
  });
  await dragToolcraftSliderByLabel(page, "Probability", 0.9);
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "probability-workload");
});

test("browser perf: fill-mode-change", async ({ page }) => {
  await openAppSection(page, "Shape Fill");
  await openSection(page, "Grid");
  await page.getByRole("slider", { name: "Rows" }).press("Home");
  await page.getByRole("slider", { name: "Columns" }).press("Home");
  await collapseSectionsExcept(page, "Shape Fill");
  await waitForToolcraftAnimationFrames(page, 4);
  await page.getByRole("group", { name: "Fill" }).getByRole("button", { name: "Gradient", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Gradient angle" })).toBeVisible();
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Solid", exact: true }).evaluate((element) => element.click());
  });
  await expect(page.getByRole("textbox", { name: "Color hex" })).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "fill-mode-change");
});

test("browser perf: shape-color-change", async ({ page }) => {
  await openAppSection(page, "Shape Fill");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("textbox", { name: "Color hex" }).fill("#ff3366");
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "shape-color-change");
});

test("browser perf: gradient-change", async ({ page }) => {
  await openAppSection(page, "Shape Fill");
  await openSection(page, "Grid");
  await page.getByRole("slider", { name: "Rows" }).press("Home");
  await page.getByRole("slider", { name: "Columns" }).press("Home");
  await collapseSectionsExcept(page, "Shape Fill");
  await waitForToolcraftAnimationFrames(page, 4);
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("group", { name: "Fill" }).getByRole("button", { name: "Gradient", exact: true }).evaluate((element) => element.click());
  });
  await expect(page.getByRole("textbox", { name: "Gradient angle" })).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "gradient-change");
});

test("browser perf: opacity-drag", async ({ page }) => {
  await openAppSection(page, "Shape Fill");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Source opacity", 0.65);
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "opacity-drag");
});

test("browser perf: pattern-method-change", async ({ page }) => {
  await openAppSection(page, "Pattern Method");
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "pattern-method-change", {
    "pattern.method": async () => selectPatternMethod(page, "Gradient"),
  });
  const result = await measureToolcraftInteraction(page, async () => {
    await selectPatternMethod(page, "Base");
  });
  await expect(page.getByRole("combobox")).toContainText("Base");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "pattern-method-change");
});

test("browser perf: direction-angle-drag", async ({ page }) => {
  await openAppSection(page, "Pattern Method");
  await selectPatternMethod(page, "Gradient");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Direction angle", appPerformance, "direction-angle-drag");
  });
  await dragToolcraftSliderByLabel(page, "Direction angle", 0.25);
  await expect(page.getByRole("slider", { name: "Direction angle" })).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "direction-angle-drag");
});

test("browser perf: phase-editor-change", async ({ page }) => {
  await openAppSection(page, "Pattern Method");
  await selectPatternMethod(page, "Gradient");
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "phase-editor-change", {
    "pattern.directionalPhases.phases": async () => {
      for (let index = 0; index < 5; index += 1) {
        await page.getByRole("button", { name: "Add phase" }).click();
      }
      for (let index = 1; index < 8; index += 1) {
        await page.getByRole("button", { name: `Edit Phase ${index}` }).click();
        await page.getByRole("switch", {
          name: `Enable transition from Phase ${index} to Phase ${index + 1}`,
        }).click();
      }
    },
  });
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Normalize shares" }).click();
  });
  await expect(page.getByTestId("phase-list").locator("[data-phase-id]")).toHaveCount(8);
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "phase-editor-change");
});

test("browser perf: mosaic-amount-mode-change", async ({ page }) => {
  await openAppSection(page, "Pattern Method");
  await selectPatternMethod(page, "Mosaic");
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "mosaic-amount-mode-change", {
    "pattern.mosaic.amountMode": async () => {
      await page.getByRole("group", { name: "Amount mode" }).getByRole("button", { name: "Coverage" }).click();
    },
  });
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("group", { name: "Amount mode" }).getByRole("button", { name: "Count" }).click();
  });
  await expect(page.getByRole("group", { name: "Amount mode" }).getByRole("button", { name: "Count" })).toHaveAttribute("aria-pressed", "true");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "mosaic-amount-mode-change");
});

test("browser perf: mosaic-editor-change", async ({ page }) => {
  await openAppSection(page, "Grid");
  await page.getByRole("slider", { name: "Rows" }).press("End");
  await page.getByRole("slider", { name: "Columns" }).press("End");
  await collapseSectionsExcept(page, "Pattern Method");
  await openSection(page, "Pattern Method");
  await selectPatternMethod(page, "Mosaic");
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "mosaic-editor-change", {
    "pattern.mosaic.config": async () => {
      while ((await page.getByTestId("mosaic-levels").locator('[data-testid^="mosaic-level-"]').count()) < 6) {
        await page.getByRole("button", { name: "Add Mosaic size" }).click();
      }
      while ((await page.getByTestId("mosaic-clusters").locator('[data-testid^="mosaic-cluster-"]').count()) < 8) {
        await page.getByRole("button", { name: "Add Mosaic cluster" }).click();
      }
      await page.getByTestId("mosaic-level-2").getByRole("spinbutton").fill("24");
      await page.getByTestId("mosaic-level-3").getByRole("spinbutton").fill("2");
      const clusterAllocations = page.getByTestId("mosaic-cluster-1").getByRole("spinbutton");
      await clusterAllocations.nth(0).fill("24");
      await clusterAllocations.nth(1).fill("2");
      await page.getByRole("slider", { name: "Spread for Cluster 1" }).press("Home");
    },
  });
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("slider", { name: "Spread for Cluster 1" }).press("End");
  });
  await expect(page.getByTestId("mosaic-levels").locator('[data-testid^="mosaic-level-"]')).toHaveCount(6);
  await expect(page.getByTestId("mosaic-clusters").locator('[data-testid^="mosaic-cluster-"]')).toHaveCount(8);
  await expect(page.getByRole("slider", { name: "Spread for Cluster 1" })).toHaveAttribute("aria-valuenow", "100");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "mosaic-editor-change");
});

test("browser perf: triangle-editor-change", async ({ page }) => {
  await openAppSection(page, "Pattern Method");
  await selectPatternMethod(page, "Triangle");
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "triangle-editor-change", {
    "pattern.triangle.config": async () => {
      await page.getByRole("spinbutton", { name: "Full triangles" }).fill("12");
      await page.getByRole("spinbutton", { name: "Full triangles" }).blur();
    },
  });
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("spinbutton", { name: "Full triangles" }).fill("11");
    await page.getByRole("spinbutton", { name: "Full triangles" }).blur();
  });
  await expect(page.getByTestId("triangle-editor")).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "triangle-editor-change");
});

test("browser perf: triangle-commit-workload", async ({ page }) => {
  await openAppSection(page, "Shape Library");
  await addShapeFamily(page, "solid-triangle-full");
  await addShapeFamily(page, "solid-triangle-half");

  await collapseSectionsExcept(page, "Pattern Method");
  await openSection(page, "Pattern Method");
  await selectPatternMethod(page, "Triangle");
  await page.getByRole("button", { name: /Add Solid Triangle Full to Full shapes/ }).click();
  await page.getByRole("button", { name: /Add Solid Triangle Half to Half shapes/ }).click();
  await page.getByRole("spinbutton", { name: "Full triangles" }).fill("12");
  await page.getByRole("spinbutton", { name: "Full triangles" }).blur();

  await collapseSectionsExcept(page, "Grid");
  await openSection(page, "Grid");
  await page.getByRole("slider", { name: "Rows" }).press("End");
  await page.getByRole("slider", { name: "Columns" }).press("End");

  await collapseSectionsExcept(page, "Pattern Output");
  await openSection(page, "Pattern Output");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Update pattern" }).click();
    await expect(page.locator("[data-pattern-cell-total]")).toHaveAttribute(
      "data-pattern-cell-total",
      "57344",
    );
  });
  expectToolcraftScenarioPerformanceBudget(
    { ...result, previewMs: result.durationMs },
    appPerformance,
    "triangle-commit-workload",
  );
});

test("browser perf: mosaic-anchor-coverage-drag", async ({ page }) => {
  await openAppSection(page, "Grid");
  await page.getByRole("slider", { name: "Rows" }).press("Home");
  for (let index = 1; index < 24; index += 1) await page.getByRole("slider", { name: "Rows" }).press("ArrowRight");
  await page.getByRole("slider", { name: "Columns" }).press("Home");
  for (let index = 1; index < 48; index += 1) await page.getByRole("slider", { name: "Columns" }).press("ArrowRight");
  await collapseSectionsExcept(page, "Pattern Method");
  await openSection(page, "Pattern Method");
  await selectPatternMethod(page, "Mosaic");
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "mosaic-anchor-coverage-drag", {
    "pattern.mosaic.config": async () => {
      await page.getByTestId("mosaic-level-2").getByRole("spinbutton").fill("24");
      await page.getByTestId("mosaic-level-3").getByRole("spinbutton").fill("2");
      const allocations = page.getByTestId("mosaic-cluster-1").getByRole("spinbutton");
      await allocations.nth(0).fill("24");
      await allocations.nth(1).fill("2");
      await page.getByRole("slider", { name: "Anchor coverage for Cluster 1" }).press("Home");
    },
  });
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("slider", { name: "Anchor coverage for Cluster 1" }).press("End");
  });
  await expect(page.getByRole("slider", { name: "Anchor coverage for Cluster 1" })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByTestId("mosaic-anchor-coverage-actual-1")).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "mosaic-anchor-coverage-drag");
});

test("browser perf: transition-strength-drag", async ({ page }) => {
  await openAppSection(page, "Pattern Method");
  await selectPatternMethod(page, "Gradient");
  await page.getByRole("switch", { name: "Enable transition from Phase 1 to Phase 2" }).click();
  const slider = page.getByRole("slider", { name: "Transition strength from Phase 1 to Phase 2" });
  const box = await slider.boundingBox();
  if (!box) throw new Error("Transition strength slider must have a measurable bounding box.");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
  });
  await expect(slider).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "transition-strength-drag");
});

test("browser perf: rows-workload", async ({ page }) => {
  await openAppSection(page, "Grid");
  await disableAutoFit(page, "Grid");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Rows", appPerformance, "rows-workload");
  });
  await dragToolcraftSliderByLabel(page, "Rows", 0.9);
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "rows-workload");
});

test("browser perf: columns-workload", async ({ page }) => {
  await openAppSection(page, "Grid");
  await disableAutoFit(page, "Grid");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Columns", appPerformance, "columns-workload");
  });
  await dragToolcraftSliderByLabel(page, "Columns", 0.9);
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "columns-workload");
});

test("browser perf: gap-workload", async ({ page }) => {
  await openAppSection(page, "Grid");
  await disableAutoFit(page, "Grid");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Gap", appPerformance, "gap-workload");
  });
  await dragToolcraftSliderByLabel(page, "Gap", 0.9);
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "gap-workload");
});

test("browser perf: distribution-workload", async ({ page }) => {
  await openAppSection(page, "Grid");
  const result = await measureToolcraftInteraction(page, async () => {
    await applyToolcraftPerformanceStressFixture(page, appPerformance, "distribution-workload", {
      "pattern.baseGrid.distribution": async () => page.getByRole("button", { name: "Weighted", exact: true }).click(),
    });
  });
  await expect(page.getByRole("button", { name: "Weighted", exact: true })).toHaveAttribute("aria-pressed", "true");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "distribution-workload");
});

test("browser perf: seed-workload", async ({ page }) => {
  await openAppSection(page, "Grid");
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(page, "Seed", appPerformance, "seed-workload");
  });
  await dragToolcraftSliderByLabel(page, "Seed", 0.9);
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "seed-workload");
});

test("browser perf: auto-fit-workload", async ({ page }) => {
  await openAppSection(page, "Grid");
  await disableAutoFit(page, "Grid");
  const result = await measureToolcraftInteraction(page, async () => {
    await applyToolcraftPerformanceStressFixture(page, appPerformance, "auto-fit-workload", {
      "pattern.baseGrid.autoFit": async () => page.getByRole("switch").first().click(),
    });
  });
  await expect(page.getByRole("switch").first()).toHaveAttribute("aria-checked", "true");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "auto-fit-workload");
});

test("browser perf: regenerate-action-change", async ({ page }) => {
  await openAppSection(page, "Grid");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "New seed" }).evaluate((element) => element.click());
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "regenerate-action-change");
});

test("browser perf: opacity-distribution-workload", async ({ page }) => {
  await openAppSection(page, "Opacity Distribution");
  const opacityControl = page.getByTestId("opacity-distribution-control");
  await opacityControl.getByRole("switch").click();
  const result = await measureToolcraftInteraction(page, async () => {
    await applyToolcraftPerformanceStressFixture(page, appPerformance, "opacity-distribution-workload", {
      "pattern.appearance.opacityDistribution": async () => {
        for (let index = 0; index < 7; index += 1) {
          await page.getByRole("button", { name: "Add opacity" }).click();
        }
        await opacityControl.getByRole("button", { name: "Elements" }).click();
      },
    });
  });
  await expect(page.getByRole("button", { name: "Remove opacity-8" })).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "opacity-distribution-workload");
});

test("browser perf: pattern-name-change", async ({ page }) => {
  await openAppSection(page, "Pattern Output");
  const result = await measureToolcraftInteraction(page, async () => {
    await getFieldTextbox(page, "Pattern name").fill("Performance pattern");
  });
  await expect(getFieldTextbox(page, "Pattern name")).toHaveValue("Performance pattern");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "pattern-name-change");
});

test("browser perf: pattern-commit-workload", async ({ page }) => {
  await openAppSection(page, "Grid");
  await page.getByRole("slider", { name: "Rows" }).press("End");
  await page.getByRole("slider", { name: "Columns" }).press("End");
  await enableAllTransitionSpreads(page);
  await openSection(page, "Pattern Output");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Create pattern" }).click();
    await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toHaveAttribute(
      "data-pattern-cell-count",
      "4096",
    );
  });
  await expectPattern(page);
  expectToolcraftScenarioPerformanceBudget(
    { ...result, previewMs: result.durationMs },
    appPerformance,
    "pattern-commit-workload",
  );
});

test("browser perf: pattern-history-workload", async ({ page }) => {
  await openAppSection(page, "Pattern Output");
  for (let index = 0; index < 19; index += 1) {
    await page.getByRole("button", { name: "Create pattern" }).click();
  }
  await openSection(page, "Pattern History");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByTestId("pattern-history-list").getByRole("button", { exact: true, name: "Pattern 1" }).click();
  });
  await expect(page.getByTestId("pattern-history-list").locator('[data-active="true"]')).toHaveCount(1);
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "pattern-history-workload");
});

test("browser perf: background-include-change", async ({ page }) => {
  await openAppSection(page, "Background");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("switch").last().click();
  });
  await expect(page.locator("[data-pattern-background]")).toHaveCount(0);
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "background-include-change");
});

test("browser perf: background-color-change", async ({ page }) => {
  await openAppSection(page, "Background");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("textbox", { name: "background hex" }).fill("#334455");
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "background-color-change");
});

test("browser perf: export-file-name", async ({ page }) => {
  await openAppSection(page, "Image Export");
  const result = await measureToolcraftInteraction(page, async () => {
    await getFieldTextbox(page, "File name").fill("my-pattern");
  });
  await expect(getFieldTextbox(page, "File name")).toHaveValue("my-pattern");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "export-file-name");
});

test("browser perf: image-format-change", async ({ page }) => {
  await openAppSection(page, "Image Export");
  await page.getByRole("combobox", { name: "PNG" }).click();
  await waitForToolcraftAnimationFrames(page, 4);
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByText("JPG", { exact: true }).evaluate((element) => element.click());
  });
  await expect(page.getByRole("combobox", { name: "JPG" })).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "image-format-change");
});

test("browser perf: export-help", async ({ page }) => {
  const result = await measureToolcraftInteraction(page, async () => {
    await openAppSection(page, "Image Export");
  });
  await expect(page.getByText(/Image format and resolution apply only to Export Image/)).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "export-help");
});

test("browser perf: image-resolution-workload", async ({ page }) => {
  await openAppSection(page, "Image Export");
  await page.getByRole("combobox", { name: "4K" }).click();
  await waitForToolcraftAnimationFrames(page, 4);
  const result = await measureToolcraftInteraction(page, async () => {
    await applyToolcraftPerformanceStressFixture(page, appPerformance, "image-resolution-workload", {
      "export.resolution": async () => {
        await page.getByText("8K", { exact: true }).evaluate((element) => element.click());
      },
    });
  });
  await expect(page.getByRole("combobox", { name: "8K" })).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "image-resolution-workload");
});

test("browser perf: preview-stress", async ({ page }) => {
  await openAppSection(page, "Grid");
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "preview-stress", {
    fixture: async () => {
      await dragToolcraftSliderByLabel(page, "Rows", 1);
      await dragToolcraftSliderByLabel(page, "Columns", 1);
    },
  });
  const measured = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "New seed" }).click();
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget({ ...measured, previewMs: measured.durationMs }, appPerformance, "preview-stress");
});

test("browser perf: viewport-stability", async ({ page }) => {
  await openAppSection(page, "Grid");
  const result = await expectToolcraftCanvasViewportStable(page, async () => {
    await page.getByRole("button", { name: "New seed" }).click();
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "viewport-stability");
});

test("browser perf: viewport-zoom-stress", async ({ page }) => {
  await openAppSection(page, "Grid");
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "viewport-zoom-stress", {
    fixture: async () => {
      await page.getByRole("slider", { name: "Rows" }).press("End");
      await page.getByRole("slider", { name: "Columns" }).press("End");
    },
  });
  await enableAllTransitionSpreads(page);
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toHaveAttribute(
    "data-pattern-cell-count",
    "4096",
  );
  await collapseSectionsExcept(page, "Grid");
  await openSection(page, "Grid");
  await waitForToolcraftAnimationFrames(page, 8);
  const result = await measureToolcraftInteraction(page, async () => {
    await zoomToolcraftCanvasViewport(page, 1);
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "viewport-zoom-stress");
});

test("browser perf: export-output", async ({ page }) => {
  await page.goto("/");
  await ensurePattern(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Image" }).click();
    await download;
  });
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  expectToolcraftScenarioPerformanceBudget({ ...result, exportMs: result.durationMs }, appPerformance, "export-output");
});
