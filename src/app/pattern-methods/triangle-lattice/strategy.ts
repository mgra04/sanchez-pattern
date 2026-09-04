import type {
  PatternSource,
  TrianglePatternSnapshot,
  TriangleSourcePool,
} from "../../pattern-model";
import { deterministicUnitHash, selectPatternSource } from "../random";
import { patternGridLimits } from "../grid";
import type { PatternCell, PatternMethodStrategy, PatternValidation } from "../types";
import {
  getTriangleElementSlots,
  getTriangleGeometry,
  getTriangleOutputSize,
  triangleFullCountLimits,
} from "./model";

function poolSources(
  snapshot: TrianglePatternSnapshot,
  pool: TriangleSourcePool,
): PatternSource[] {
  const ids = new Set(pool.sourceIds);
  return snapshot.sources.filter((source) => ids.has(source.id));
}

export function validateTrianglePattern(
  snapshot: TrianglePatternSnapshot,
): PatternValidation {
  const errors: string[] = [];
  const { grid, triangle } = snapshot;
  if (
    !Number.isInteger(grid.columns) ||
    grid.columns < patternGridLimits.columns.min ||
    grid.columns > patternGridLimits.columns.max
  ) errors.push("Columns must be between 1 and 64.");
  if (
    !Number.isInteger(grid.rows) ||
    grid.rows < patternGridLimits.rows.min ||
    grid.rows > patternGridLimits.rows.max
  ) errors.push("Rows must be between 1 and 64.");
  if (!Number.isFinite(grid.gap) || grid.gap < 0 || grid.gap > 48) {
    errors.push("Grid gap must be between 0 and 48px.");
  }
  if (
    !Number.isInteger(triangle.fullTriangles) ||
    triangle.fullTriangles < triangleFullCountLimits.min ||
    triangle.fullTriangles > triangleFullCountLimits.max
  ) errors.push("Full triangles must be a whole number from 1 to 12.");

  const full = poolSources(snapshot, triangle.fullPool);
  const half = poolSources(snapshot, triangle.halfPool);
  if (full.length === 0) errors.push("Assign at least one Full triangle shape.");
  if (half.length === 0) errors.push("Assign at least one Half triangle shape.");
  if (full.some((source) => source.tile?.role !== "triangle-full")) {
    errors.push("The Full pool can contain only Full triangle shapes.");
  }
  if (half.some((source) => source.tile?.role !== "triangle-half")) {
    errors.push("The Half pool can contain only Half triangle shapes.");
  }
  const tiled = [...full, ...half].filter((source) => source.tile);
  const profile = tiled[0]?.tile?.profileId;
  const side = tiled[0]?.tile?.sideLength ?? 24;
  if (
    tiled.some(
      (source) =>
        source.tile?.profileId !== profile || source.tile?.sideLength !== side,
    )
  ) errors.push("All assigned triangle shapes must share one Tile profile and side length.");
  const geometry = getTriangleGeometry(side, triangle.fullTriangles, triangle.innerGap);
  if (
    !Number.isFinite(triangle.innerGap) ||
    triangle.innerGap < 0 ||
    triangle.innerGap > geometry.maxInnerGap
  ) errors.push(`Inner gap must be between 0 and ${geometry.maxInnerGap.toFixed(2)}px.`);
  if (
    triangle.fullPool.distribution === "weighted" &&
    full.length > 0 &&
    full.every((source) => source.weight <= 0)
  ) errors.push("Weighted Full distribution needs a positive source probability.");
  if (
    triangle.halfPool.distribution === "weighted" &&
    half.length > 0 &&
    half.every((source) => source.weight <= 0)
  ) errors.push("Weighted Half distribution needs a positive source probability.");
  return { errors, valid: errors.length === 0 };
}

export function generateTriangleCells(snapshot: TrianglePatternSnapshot): PatternCell[] {
  const validation = validateTrianglePattern(snapshot);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const fullSources = poolSources(snapshot, snapshot.triangle.fullPool);
  const halfSources = poolSources(snapshot, snapshot.triangle.halfPool);
  const side = fullSources[0]!.tile!.sideLength;
  const geometry = getTriangleGeometry(
    side,
    snapshot.triangle.fullTriangles,
    snapshot.triangle.innerGap,
  );
  const cells: PatternCell[] = [];

  for (let row = 0; row < snapshot.grid.rows; row += 1) {
    for (let column = 0; column < snapshot.grid.columns; column += 1) {
      const mirrorX =
        snapshot.triangle.startMirrorX !==
        (snapshot.triangle.alternateColumns && column % 2 === 1);
      const alternateVerticalByRow =
        snapshot.triangle.alternateRows && row % 2 === 1;
      const alternateVerticalByElement =
        snapshot.triangle.fullTriangles % 2 === 1 &&
        snapshot.triangle.alternateElementsInRow &&
        column % 2 === 1;
      const mirrorY =
        snapshot.triangle.startMirrorY !==
        (alternateVerticalByRow !== alternateVerticalByElement);
      const slots = getTriangleElementSlots({
        fullTriangles: snapshot.triangle.fullTriangles,
        innerGap: snapshot.triangle.innerGap,
        mirrorX,
        mirrorY,
        side,
      });
      for (const slot of slots) {
        const pool =
          slot.role === "triangle-full" ? snapshot.triangle.fullPool : snapshot.triangle.halfPool;
        const candidates = slot.role === "triangle-full" ? fullSources : halfSources;
        const random = deterministicUnitHash(
          snapshot.grid.seed,
          "triangle",
          slot.role,
          row,
          column,
          slot.ordinal,
        );
        const index = cells.length;
        cells.push({
          column,
          frameHeight: slot.height,
          frameWidth: slot.width,
          index,
          row,
          source: selectPatternSource(candidates, pool.distribution, random),
          triangleElementColumn: column,
          triangleElementRow: row,
          triangleMirrorX: slot.mirrorX,
          triangleMirrorY: slot.mirrorY,
          triangleRole: slot.role,
          triangleSlot: slot.ordinal,
          x: column * (geometry.elementWidth + snapshot.grid.gap) + slot.x,
          y: row * (geometry.elementHeight + snapshot.grid.gap),
        });
      }
    }
  }
  return cells;
}

export const triangleLatticeStrategy: PatternMethodStrategy<TrianglePatternSnapshot> = {
  generateCells: generateTriangleCells,
  getCellCount: (snapshot) =>
    snapshot.grid.rows *
    snapshot.grid.columns *
    (snapshot.triangle.fullTriangles + 2),
  getOutputSize: getTriangleOutputSize,
  validate: validateTrianglePattern,
};
