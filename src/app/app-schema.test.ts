import { describe, expect, it } from "vitest";

import { appSchema } from "./app-schema";
import { shapeToolsSchema } from "./shape-tools/shape-tools-schema";
import { generateBaseGridCells, validateBaseGrid } from "./pattern-methods/base-grid/strategy";
import { analyzeMosaicSnapshot } from "./pattern-methods/mosaic/model";
import { planMosaicLayout } from "./pattern-methods/mosaic/packing";
import { getCurrentPatternSnapshot, patternTargets } from "./pattern-state";

describe("appSchema", () => {
  it("publishes the Pattern Creator through the Toolcraft runtime shell", () => {
    expect(appSchema.canvas).toMatchObject({
      draggable: true,
      enabled: true,
      sizing: { mode: "editable-output" },
      upload: false,
    });
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(appSchema.panels.controls?.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "Shape Library",
        "Pattern Method",
        "SVG file",
        "Import Details",
        "Pattern Shapes",
        "Selected Shape",
        "Shape Fill",
        "Grid",
        "Background",
        "Image Export",
        "Export",
      ]),
    );
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline).toBeUndefined();
    expect(appSchema.toolbar).toEqual({
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    });
    expect(appSchema.assembly.components).toEqual(["canvas", "controlsPanel", "toolbar"]);
  });

  it("validates pattern controls and deterministic vector output", () => {
    const values = Object.fromEntries(
      appSchema.panels.controls?.sections.flatMap((section) =>
        Object.values(section.controls).map((control) => [control.target, control.defaultValue]),
      ) ?? [],
    );
    const snapshot = getCurrentPatternSnapshot(values);

    expect(values[patternTargets.rows]).toBe(8);
    expect(values[patternTargets.columns]).toBe(16);
    expect(snapshot.method).toBe("base-grid");
    if (snapshot.method !== "base-grid") throw new Error("Default snapshot must use Base Grid.");
    expect(validateBaseGrid(snapshot.sources, snapshot.grid)).toEqual({ errors: [], valid: true });
    expect(generateBaseGridCells(snapshot)).toHaveLength(128);
    expect(generateBaseGridCells(snapshot)).toEqual(generateBaseGridCells(snapshot));
  });

  it("keeps timeline and layers disabled for the single-output still pattern", () => {
    expect(appSchema.assembly.capabilities).not.toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
    expect(appSchema.assembly.capabilities).not.toContain("layers.panel");
  });

  it("uses browser-local runtime persistence for editable product state", () => {
    expect(appSchema.persistence).toEqual({
      include: ["values", "canvas", "panels"],
      key: "toolcraft:sanchez-pattern:state:v1",
      storage: "localStorage",
      version: 1,
    });
  });

  it("restores persisted pattern settings after reload", () => {
    expect(appSchema.persistence.storage).toBe("localStorage");
    if (appSchema.persistence.storage !== "localStorage") {
      throw new Error("Pattern settings must use localStorage persistence.");
    }
    expect(appSchema.persistence.include).toEqual(expect.arrayContaining(["values", "canvas"]));
  });

  it("validates Mosaic amount modes and deterministic packing", () => {
    const values = Object.fromEntries(
      appSchema.panels.controls?.sections.flatMap((section) =>
        Object.values(section.controls).map((control) => [control.target, control.defaultValue]),
      ) ?? [],
    );
    values[patternTargets.method] = "multi-size-mosaic";
    const countSnapshot = getCurrentPatternSnapshot(values);
    if (countSnapshot.method !== "multi-size-mosaic") throw new Error("Expected Mosaic snapshot");
    const countAnalysis = analyzeMosaicSnapshot(countSnapshot);
    const firstPlan = planMosaicLayout(countSnapshot, countAnalysis);
    const repeatedPlan = planMosaicLayout(countSnapshot, countAnalysis);

    values[patternTargets.mosaicAmountMode] = "coverage";
    const coverageSnapshot = getCurrentPatternSnapshot(values);
    if (coverageSnapshot.method !== "multi-size-mosaic") throw new Error("Expected Coverage Mosaic snapshot");
    const coverageAnalysis = analyzeMosaicSnapshot(coverageSnapshot);

    expect(countAnalysis.valid, countAnalysis.errors.join(" ")).toBe(true);
    expect(coverageAnalysis.valid, coverageAnalysis.errors.join(" ")).toBe(true);
    expect(firstPlan).toEqual(repeatedPlan);
  });
});

describe("shapeToolsSchema", () => {
  it("publishes ephemeral SVG normalization through the Toolcraft runtime shell", () => {
    expect(shapeToolsSchema.canvas).toMatchObject({
      draggable: true,
      enabled: true,
      sizing: { mode: "editable-output" },
      upload: false,
    });
    expect(shapeToolsSchema.panels.controls?.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(["Source SVGs", "Triangle Frame", "Validation", "Export"]),
    );
    expect(shapeToolsSchema.persistence).toEqual({ storage: "none" });
    expect(shapeToolsSchema.panels.layers).toBeUndefined();
    expect(shapeToolsSchema.panels.timeline).toBeUndefined();
    expect(shapeToolsSchema.assembly.components).toEqual(["canvas", "controlsPanel", "toolbar"]);
  });
});
