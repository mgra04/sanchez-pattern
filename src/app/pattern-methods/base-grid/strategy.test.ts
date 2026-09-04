import { describe, expect, it } from "vitest";

import { createPatternSource } from "../../pattern-model";
import { generateBaseGridCells, getBaseGridOutputSize, validateBaseGrid } from "./strategy";

function makeSource(id: string, weight = 1) {
  return {
    ...createPatternSource({
      axis: "weight" as const,
      axisValue: "base",
      category: "base" as const,
      familyId: id,
      familyName: id,
      radiusPx: 0,
      svgBody: '<path d="M0 0H24V24H0Z"/>',
      variantId: "weight-base__radius-0",
    }),
    id,
    weight,
  };
}

const defaultGrid = {
  autoFit: true,
  columns: 16,
  distribution: "equal" as const,
  gap: 1,
  rows: 8,
  seed: 42,
};

describe("base grid strategy", () => {
  it("matches the reference 8 by 16 output bounds", () => {
    expect(getBaseGridOutputSize({ grid: defaultGrid, method: "base-grid", sources: [makeSource("square")] })).toEqual({
      height: 199,
      width: 399,
    });
  });

  it("is deterministic for the same seed", () => {
    const snapshot = { grid: defaultGrid, method: "base-grid" as const, sources: [makeSource("a"), makeSource("b")] };
    const first = generateBaseGridCells(snapshot).map((cell) => cell.source.id);
    const second = generateBaseGridCells(snapshot).map((cell) => cell.source.id);

    expect(first).toEqual(second);
    expect(new Set(first)).toEqual(new Set(["a", "b"]));
  });

  it("supports weighted selection", () => {
    const cells = generateBaseGridCells({
      grid: { ...defaultGrid, columns: 64, distribution: "weighted", rows: 64 },
      method: "base-grid",
      sources: [makeSource("rare", 1), makeSource("common", 20)],
    });
    const rare = cells.filter((cell) => cell.source.id === "rare").length;
    const common = cells.length - rare;

    expect(common).toBeGreaterThan(rare * 10);
  });

  it("rejects mixed frame sizes", () => {
    const sources = [makeSource("a"), { ...makeSource("b"), frameWidth: 32 }];
    const result = validateBaseGrid(sources, defaultGrid);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/same frame width and height/i);
  });
});
