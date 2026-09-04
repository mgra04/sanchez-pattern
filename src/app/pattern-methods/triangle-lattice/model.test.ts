import { describe, expect, it } from "vitest";
import {
  getTriangleElementSlots,
  getTriangleGeometry,
} from "./model";

describe("Triangle lattice geometry", () => {
  it("derives exact equilateral dimensions and the approved two-triangle spacing", () => {
    const geometry = getTriangleGeometry(24, 2, 1);
    expect(geometry.height).toBeCloseTo(20.7846096908, 9);
    expect(geometry.pitch - 24).toBeCloseTo(-10.8452994616, 9);
    expect(geometry.elementWidth).toBeCloseTo(39.4641016151, 9);
  });

  it("creates two caps and alternating full slots", () => {
    const slots = getTriangleElementSlots({
      fullTriangles: 2,
      innerGap: 1,
      mirrorX: false,
      mirrorY: false,
      side: 24,
    });
    expect(slots.map((slot) => slot.role)).toEqual([
      "triangle-half",
      "triangle-full",
      "triangle-full",
      "triangle-half",
    ]);
    expect(slots.filter((slot) => slot.role === "triangle-full").map((slot) => slot.mirrorY))
      .toEqual([false, true]);
  });

  it("treats horizontal mirroring as a topology no-op for odd counts", () => {
    const base = getTriangleElementSlots({
      fullTriangles: 3,
      innerGap: 1,
      mirrorX: false,
      mirrorY: false,
      side: 24,
    });
    const mirrored = getTriangleElementSlots({
      fullTriangles: 3,
      innerGap: 1,
      mirrorX: true,
      mirrorY: false,
      side: 24,
    });
    expect(mirrored).toEqual(base);
  });
});
