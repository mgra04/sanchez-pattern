import { describe, expect, it } from "vitest";

import {
  clonePatternSnapshot,
  clonePatternSource,
  defaultMosaicAnchorCoverage,
  createPatternHistoryEntry,
  createPatternSource,
  getPatternHistory,
  normalizeHexColor,
  normalizePatternSnapshot,
} from "./pattern-model";
import { applyInspectorValues, patternTargets } from "./pattern-state";
import type { ShapeVariant } from "./shapes/types";

const squareVariant: ShapeVariant = {
  axis: "weight" as const,
  axisValue: "base",
  fileName: "weight-base__radius-0.svg",
  id: "weight-base__radius-0",
  opacityUnits: { count: 1, mode: "whole-svg" },
  radiusPx: 0,
  svgBody: '<path d="M0 0H24V24H0Z"/>',
};

function source() {
  return createPatternSource({
    availableVariants: [squareVariant],
    axis: squareVariant.axis,
    axisValue: squareVariant.axisValue,
    category: "base",
    familyId: "square",
    familyName: "Square",
    radiusPx: 0,
    svgBody: squareVariant.svgBody,
    variantId: squareVariant.id,
  });
}

describe("pattern source state", () => {
  it("normalizes Toolcraft color objects", () => {
    expect(normalizeHexColor({ hex: "#12AB34" }, "#FFFFFF")).toBe("#12AB34");
    expect(normalizeHexColor("#ABCDEF", "#FFFFFF")).toBe("#ABCDEF");
  });

  it("clones style with a unique editable name and id", () => {
    const original = { ...source(), name: "Accent" };
    const first = clonePatternSource(original, ["Accent"]);
    const second = clonePatternSource(original, ["Accent", "Accent copy"]);

    expect(first.id).not.toBe(original.id);
    expect(first.name).toBe("Accent copy");
    expect(second.name).toBe("Accent copy 2");
    expect(first.gradient).not.toBe(original.gradient);
  });

  it("does not apply a reset variant from another family", () => {
    const original = source();
    const next = applyInspectorValues(original, {
      [patternTargets.color]: { hex: "#FF3366" },
      [patternTargets.variant]: {
        axis: "weight",
        axisValue: "base",
        familyId: "circle",
        id: "weight-base__radius-0",
        radiusPx: 0,
        svgBody: '<circle cx="12" cy="12" r="12"/>',
      },
    });

    expect(next.color).toBe("#FF3366");
    expect(next.familyId).toBe("square");
    expect(next.svgBody).toBe(original.svgBody);
  });

  it("creates independent, uniquely named history snapshots", () => {
    const snapshot = {
      grid: { autoFit: true, columns: 2, distribution: "equal" as const, gap: 1, rows: 1, seed: 42 },
      method: "base-grid" as const,
      sources: [source()],
    };
    const first = createPatternHistoryEntry({ history: [], name: "Pattern", now: 10, snapshot });
    const second = createPatternHistoryEntry({ history: [first], name: "Pattern", now: 20, snapshot });

    snapshot.sources[0]!.name = "Changed draft";

    expect(first.name).toBe("Pattern");
    expect(second.name).toBe("Pattern 2");
    expect(first.snapshot.sources[0]?.name).not.toBe("Changed draft");
    expect(getPatternHistory([first, { nope: true }])).toHaveLength(1);
  });

  it("migrates persisted pre-method history snapshots to Base", () => {
    const legacy = {
      createdAt: 10,
      id: "legacy-pattern",
      name: "Legacy pattern",
      snapshot: {
        grid: { autoFit: true, columns: 2, distribution: "equal", gap: 1, rows: 1, seed: 42 },
        sources: [source()],
      },
      updatedAt: 10,
    };

    const [entry] = getPatternHistory([legacy]);

    expect(entry?.snapshot.method).toBe("base-grid");
    expect(entry?.snapshot.grid.columns).toBe(2);
    expect(entry?.snapshot.sources).toHaveLength(1);
  });

  it("migrates old Gradient phases to independent disabled transition defaults", () => {
    const oldSnapshot = {
      directional: {
        angle: 0,
        phases: [
          { distribution: "equal", id: "a", name: "A", share: 50, sourceIds: ["shape"] },
          { distribution: "equal", id: "b", name: "B", share: 50, sourceIds: ["shape"] },
        ],
      },
      grid: { autoFit: true, columns: 2, gap: 1, rows: 1, seed: 42 },
      method: "directional-phases",
      sources: [{ ...source(), id: "shape" }],
    };
    const normalized = normalizePatternSnapshot(oldSnapshot);

    expect(normalized?.method).toBe("directional-phases");
    if (normalized?.method !== "directional-phases") throw new Error("Expected Gradient snapshot");
    expect(normalized.directional.phases.map((phase) => phase.transitionToNext)).toEqual([
      { direction: "previous", enabled: false, maxWidthPercent: 12.5, strength: 100 },
      { direction: "previous", enabled: false, maxWidthPercent: 12.5, strength: 100 },
    ]);
    expect(normalized.directional.phases[0]!.transitionToNext).not.toBe(
      normalized.directional.phases[1]!.transitionToNext,
    );

    const cloned = clonePatternSnapshot(normalized);
    if (cloned.method !== "directional-phases") throw new Error("Expected cloned Gradient snapshot");
    cloned.directional.phases[0]!.transitionToNext.enabled = true;
    expect(normalized.directional.phases[0]!.transitionToNext.enabled).toBe(false);
  });

  it("migrates Mosaic clusters without Anchor coverage to the approved default", () => {
    const shape = { ...source(), id: "shape" };
    const oldSnapshot = {
      grid: { autoFit: true, columns: 16, gap: 1, rows: 8, seed: 42 },
      method: "multi-size-mosaic",
      mosaic: {
        amountMode: "count",
        clusters: [{
          allocations: [
            { count: 4, coverageShare: 100, levelId: "mosaic-level-2" },
            { count: 1, coverageShare: 100, levelId: "mosaic-level-3" },
          ],
          id: "legacy-cluster",
          name: "Legacy cluster",
          spread: 25,
        }],
        levels: [
          { coverage: 75, count: 0, distribution: "equal", id: "mosaic-level-1", sourceIds: ["shape"] },
          { coverage: 12.5, count: 4, distribution: "equal", id: "mosaic-level-2", sourceIds: ["shape"] },
          { coverage: 12.5, count: 1, distribution: "equal", id: "mosaic-level-3", sourceIds: ["shape"] },
        ],
      },
      sources: [shape],
    };
    const normalized = normalizePatternSnapshot(oldSnapshot);

    expect(normalized?.method).toBe("multi-size-mosaic");
    if (normalized?.method !== "multi-size-mosaic") throw new Error("Expected Mosaic snapshot");
    expect(normalized.mosaic.clusters[0]?.anchorCoverage).toBe(defaultMosaicAnchorCoverage);
    const cloned = clonePatternSnapshot(normalized);
    if (cloned.method !== "multi-size-mosaic") throw new Error("Expected cloned Mosaic snapshot");
    expect(cloned.mosaic.clusters[0]?.anchorCoverage).toBe(
      defaultMosaicAnchorCoverage,
    );
  });

  it("migrates old Triangle snapshots without odd-row element alternation", () => {
    const shape = { ...source(), id: "shape" };
    const oldSnapshot = {
      grid: { autoFit: true, columns: 2, gap: 1, rows: 2, seed: 42 },
      method: "triangle-lattice",
      sources: [shape],
      triangle: {
        alternateColumns: false,
        alternateRows: true,
        fullPool: { distribution: "equal", sourceIds: ["shape"] },
        fullTriangles: 3,
        halfPool: { distribution: "equal", sourceIds: ["shape"] },
        innerGap: 1,
        startMirrorX: false,
        startMirrorY: false,
      },
    };

    const normalized = normalizePatternSnapshot(oldSnapshot);

    expect(normalized?.method).toBe("triangle-lattice");
    if (normalized?.method !== "triangle-lattice") throw new Error("Expected Triangle snapshot");
    expect(normalized.triangle.alternateElementsInRow).toBe(false);
    const cloned = clonePatternSnapshot({
      ...normalized,
      triangle: { ...normalized.triangle, alternateElementsInRow: true },
    });
    if (cloned.method !== "triangle-lattice") throw new Error("Expected cloned Triangle snapshot");
    expect(cloned.triangle.alternateElementsInRow).toBe(true);
  });
});
