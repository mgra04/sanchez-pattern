import { describe, expect, it } from "vitest";

import { createPatternSource, type PatternSnapshot } from "./pattern-model";
import { getPatternCellAppearance } from "./pattern-appearance";

function snapshot(mode: "each-element" | "whole-shape", seed = 11): PatternSnapshot {
  const source = createPatternSource({
    axis: "form",
    axisValue: "glyph",
    category: "complex",
    familyId: "glyph",
    familyName: "Glyph",
    opacityUnits: { count: 3, mode: "separate-elements" },
    radiusPx: 0,
    svgBody: '<path data-shape-opacity-unit="1"/><path data-shape-opacity-unit="2"/><path data-shape-opacity-unit="3"/>',
    variantId: "a",
  });
  source.id = "source";
  return {
    appearance: {
      opacityDistribution: {
        enabled: true,
        mode,
        seed,
        variants: [
          { chance: 50, id: "low", opacity: 25 },
          { chance: 50, id: "high", opacity: 100 },
        ],
      },
    },
    grid: { autoFit: true, columns: 1, distribution: "equal", gap: 0, rows: 1, seed: 1 },
    method: "base-grid",
    sources: [source],
  };
}

function fourWayElementSnapshot(): PatternSnapshot {
  const value = snapshot("each-element", 17);
  const source = value.sources[0]!;
  source.id = "source-123";
  source.opacityUnits = { count: 6, mode: "separate-elements" };
  source.svgBody = Array.from(
    { length: 6 },
    (_, index) => `<path data-shape-opacity-unit="${index + 1}"/>`,
  ).join("");
  value.appearance!.opacityDistribution.variants = [
    { chance: 25, id: "opacity-25", opacity: 25 },
    { chance: 25, id: "opacity-50", opacity: 50 },
    { chance: 25, id: "opacity-75", opacity: 75 },
    { chance: 25, id: "opacity-100", opacity: 100 },
  ];
  return value;
}

describe("pattern appearance", () => {
  it("replays whole-shape draws from the same seed", () => {
    const value = snapshot("whole-shape");
    expect(getPatternCellAppearance({ cellIndex: 7, snapshot: value, source: value.sources[0]! }))
      .toEqual(getPatternCellAppearance({ cellIndex: 7, snapshot: value, source: value.sources[0]! }));
  });

  it("applies deterministic weighted opacity to whole shapes and separate SVG elements", () => {
    const value = snapshot("each-element");
    const appearance = getPatternCellAppearance({ cellIndex: 4, snapshot: value, source: value.sources[0]! });
    expect(appearance.unitOpacities).toHaveLength(3);
    expect(appearance.wholeOpacity).toBe(1);
    expect(getPatternCellAppearance({ cellIndex: 4, snapshot: value, source: value.sources[0]! }))
      .toEqual(appearance);
  });

  it("mixes neighboring element draws instead of assigning one opacity to the whole glyph", () => {
    const value = fourWayElementSnapshot();
    const source = value.sources[0]!;
    const appearances = Array.from({ length: 16 }, (_, cellIndex) =>
      getPatternCellAppearance({ cellIndex, snapshot: value, source }),
    );
    const mixedGlyphs = appearances.filter(
      (appearance) => new Set(appearance.unitOpacities).size > 1,
    );

    expect(mixedGlyphs.length).toBeGreaterThanOrEqual(12);
    expect(appearances.flatMap((appearance) => appearance.unitOpacities))
      .toEqual(expect.arrayContaining([0.25, 0.5, 0.75, 1]));
    expect(getPatternCellAppearance({ cellIndex: 0, snapshot: value, source }))
      .toEqual(appearances[0]);
  });

  it("keeps disabled snapshots visually neutral", () => {
    const value = snapshot("each-element");
    value.appearance!.opacityDistribution.enabled = false;
    expect(getPatternCellAppearance({ cellIndex: 4, snapshot: value, source: value.sources[0]! }))
      .toEqual({ signature: "default", unitOpacities: [], wholeOpacity: 1 });
  });
});
