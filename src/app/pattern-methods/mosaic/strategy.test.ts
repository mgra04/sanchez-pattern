import { describe, expect, it } from "vitest";

import { createDefaultMosaicSettings, createPatternSource } from "../../pattern-model";
import { generateMosaicCells, getMosaicOutputSize, validateMosaic } from "./strategy";

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
      variantId: "base",
    }),
    frameHeight: 12,
    frameWidth: 12,
    id,
    weight,
  };
}

describe("mosaic strategy", () => {
  it("generates per-cell frame geometry and stable source selection", () => {
    const sources = [makeSource("a"), makeSource("b")];
    const mosaic = createDefaultMosaicSettings("a");
    mosaic.levels = mosaic.levels.map((level) => ({ ...level, sourceIds: ["a", "b"] }));
    const snapshot = {
      grid: { autoFit: true, columns: 16, gap: 2, rows: 12, seed: 7 },
      method: "multi-size-mosaic" as const,
      mosaic,
      sources,
    };
    expect(validateMosaic(snapshot).valid).toBe(true);
    const cells = generateMosaicCells(snapshot);
    expect(new Set(cells.map((cell) => cell.frameWidth))).toEqual(new Set([12, 26, 54]));
    expect(generateMosaicCells(snapshot).map((cell) => cell.source.id)).toEqual(
      cells.map((cell) => cell.source.id),
    );
    expect(getMosaicOutputSize(snapshot)).toEqual({ height: 166, width: 222 });
  });
});
