import { describe, expect, it } from "vitest";
import { createPatternSource, type TrianglePatternSnapshot } from "../../pattern-model";
import { generateTriangleCells, validateTrianglePattern } from "./strategy";

function tileSource(role: "triangle-full" | "triangle-half", id: string) {
  const side = 24;
  const height = side * Math.sqrt(3) / 2;
  const width = role === "triangle-full" ? side : side / 2;
  return {
    ...createPatternSource({
      axis: "form",
      axisValue: "filled",
      category: "base",
      familyId: id,
      familyName: id,
      frame: { height, width },
      radiusPx: 0,
      svgBody: role === "triangle-full"
        ? `<path d="M12 0L24 ${height}H0Z"/>`
        : `<path d="M0 0H12L0 ${height}Z"/>`,
      tile: {
        canonicalOrientation: "up",
        profileId: "equilateral-24",
        role,
        setDisplayName: "Test",
        setId: "test",
        sideLength: side,
      },
      variantId: "form-filled__radius-0",
      viewBox: { height, minX: 0, minY: 0, width },
    }),
    id,
  };
}

function snapshot(): TrianglePatternSnapshot {
  const full = tileSource("triangle-full", "full");
  const half = tileSource("triangle-half", "half");
  return {
    grid: { autoFit: true, columns: 2, gap: 3, rows: 2, seed: 42 },
    method: "triangle-lattice",
    sources: [full, half],
    triangle: {
      alternateColumns: true,
      alternateElementsInRow: false,
      alternateRows: true,
      fullPool: { distribution: "equal", sourceIds: [full.id] },
      fullTriangles: 2,
      halfPool: { distribution: "equal", sourceIds: [half.id] },
      innerGap: 1,
      startMirrorX: false,
      startMirrorY: false,
    },
  };
}

describe("validates Triangle lattice geometry and deterministic role pools", () => {
  it("validates compatible pools and generates every role deterministically", () => {
    const value = snapshot();
    expect(validateTrianglePattern(value)).toEqual({ errors: [], valid: true });
    const cells = generateTriangleCells(value);
    expect(cells).toHaveLength(16);
    expect(generateTriangleCells(value)).toEqual(cells);
    expect(cells.filter((cell) => cell.triangleRole === "triangle-full")).toHaveLength(8);
    expect(cells.filter((cell) => cell.triangleRole === "triangle-half")).toHaveLength(8);
    expect(cells.some((cell) => cell.triangleMirrorX)).toBe(true);
    expect(cells.some((cell) => cell.triangleMirrorY)).toBe(true);
  });

  it("rejects missing and wrong-role pools", () => {
    const value = snapshot();
    value.triangle.halfPool = { distribution: "equal", sourceIds: [] };
    expect(validateTrianglePattern(value).errors).toContain(
      "Assign at least one Half triangle shape.",
    );
  });

  it("alternates odd-topology elements vertically within each row", () => {
    const value = snapshot();
    value.triangle.fullTriangles = 3;
    value.triangle.alternateColumns = false;
    value.triangle.alternateElementsInRow = true;
    value.triangle.alternateRows = true;

    const leadingCaps = generateTriangleCells(value)
      .filter((cell) => cell.triangleRole === "triangle-half" && cell.triangleSlot === 0)
      .map((cell) => ({
        column: cell.triangleElementColumn,
        mirrorY: cell.triangleMirrorY,
        row: cell.triangleElementRow,
      }));

    expect(leadingCaps).toEqual([
      { column: 0, mirrorY: false, row: 0 },
      { column: 1, mirrorY: true, row: 0 },
      { column: 0, mirrorY: true, row: 1 },
      { column: 1, mirrorY: false, row: 1 },
    ]);
  });
});
