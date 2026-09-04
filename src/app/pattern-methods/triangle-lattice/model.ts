import type { TrianglePatternSnapshot } from "../../pattern-model";
import type { ShapeTileRole } from "../../shapes/types";

export const triangleFullCountLimits = { max: 12, min: 1 } as const;
export const equilateralSin60 = Math.sqrt(3) / 2;

export type TriangleSlot = {
  height: number;
  mirrorX: boolean;
  mirrorY: boolean;
  ordinal: number;
  role: ShapeTileRole;
  width: number;
  x: number;
  y: number;
};

export function getTriangleGeometry(side: number, fullTriangles: number, innerGap: number) {
  const height = side * equilateralSin60;
  const diagonalOffset = innerGap / equilateralSin60;
  const pitch = side / 2 + diagonalOffset;
  return {
    diagonalOffset,
    elementHeight: height,
    elementWidth: (fullTriangles + 1) * pitch,
    height,
    maxInnerGap: height / 2,
    pitch,
    side,
  };
}

function canonicalSlots(side: number, fullTriangles: number, innerGap: number): TriangleSlot[] {
  const geometry = getTriangleGeometry(side, fullTriangles, innerGap);
  const slots: TriangleSlot[] = [{
    height: geometry.height,
    mirrorX: false,
    mirrorY: false,
    ordinal: 0,
    role: "triangle-half",
    width: side / 2,
    x: 0,
    y: 0,
  }];
  for (let index = 0; index < fullTriangles; index += 1) {
    slots.push({
      height: geometry.height,
      mirrorX: false,
      mirrorY: index % 2 === 1,
      ordinal: index + 1,
      role: "triangle-full",
      width: side,
      x: geometry.diagonalOffset + index * geometry.pitch,
      y: 0,
    });
  }
  slots.push({
    height: geometry.height,
    mirrorX: true,
    mirrorY: fullTriangles % 2 === 0,
    ordinal: fullTriangles + 1,
    role: "triangle-half",
    width: side / 2,
    x: geometry.diagonalOffset + fullTriangles * geometry.pitch,
    y: 0,
  });
  return slots;
}

export function getTriangleElementSlots(params: {
  fullTriangles: number;
  innerGap: number;
  mirrorX: boolean;
  mirrorY: boolean;
  side: number;
}): TriangleSlot[] {
  const geometry = getTriangleGeometry(params.side, params.fullTriangles, params.innerGap);
  const applyMirrorX = params.fullTriangles % 2 === 0 && params.mirrorX;
  return canonicalSlots(params.side, params.fullTriangles, params.innerGap)
    .map((slot) => ({
      ...slot,
      mirrorX: slot.mirrorX !== applyMirrorX,
      mirrorY: slot.mirrorY !== params.mirrorY,
      x: applyMirrorX ? geometry.elementWidth - slot.x - slot.width : slot.x,
    }))
    .sort((left, right) => left.x - right.x)
    .map((slot, ordinal) => ({ ...slot, ordinal }));
}

export function getTriangleOutputSize(snapshot: TrianglePatternSnapshot): {
  height: number;
  width: number;
} {
  const side =
    snapshot.sources.find((source) => source.tile)?.tile?.sideLength ?? 24;
  const geometry = getTriangleGeometry(
    side,
    snapshot.triangle.fullTriangles,
    snapshot.triangle.innerGap,
  );
  return {
    height:
      snapshot.grid.rows * geometry.elementHeight +
      (snapshot.grid.rows - 1) * snapshot.grid.gap,
    width:
      snapshot.grid.columns * geometry.elementWidth +
      (snapshot.grid.columns - 1) * snapshot.grid.gap,
  };
}
