import type { MosaicPatternSnapshot, PatternSource } from "../../pattern-model";
import { deterministicUnitHash, selectPatternSource } from "../random";
import type { PatternCell, PatternMethodStrategy, PatternValidation } from "../types";
import { analyzeMosaicSnapshot } from "./model";
import { planMosaicLayout } from "./packing";

function resolveLevelSources(
  snapshot: MosaicPatternSnapshot,
  sourceIds: readonly string[],
): PatternSource[] {
  const sourceById = new Map(snapshot.sources.map((source) => [source.id, source]));
  return sourceIds.flatMap((id) => {
    const source = sourceById.get(id);
    return source ? [source] : [];
  });
}

export function validateMosaic(snapshot: MosaicPatternSnapshot): PatternValidation {
  const analysis = analyzeMosaicSnapshot(snapshot);
  const errors = [...analysis.errors];
  snapshot.mosaic.levels.forEach((level, index) => {
    const sources = resolveLevelSources(snapshot, level.sourceIds);
    if (level.distribution === "weighted" && sources.length > 0 && sources.every((source) => source.weight <= 0)) {
      errors.push(`Size ${index + 1} Weighted distribution needs at least one positive source weight.`);
    }
  });
  if (errors.length === 0) errors.push(...planMosaicLayout(snapshot, analysis).errors);
  return { errors: [...new Set(errors)], valid: errors.length === 0 };
}

export function getMosaicOutputSize(snapshot: MosaicPatternSnapshot): { height: number; width: number } {
  const analysis = analyzeMosaicSnapshot(snapshot);
  if (!analysis.baseFrame) return { height: 0, width: 0 };
  return {
    height:
      snapshot.grid.rows * analysis.baseFrame.height +
      (snapshot.grid.rows - 1) * snapshot.grid.gap,
    width:
      snapshot.grid.columns * analysis.baseFrame.width +
      (snapshot.grid.columns - 1) * snapshot.grid.gap,
  };
}

export function generateMosaicCells(snapshot: MosaicPatternSnapshot): PatternCell[] {
  const validation = validateMosaic(snapshot);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const analysis = analyzeMosaicSnapshot(snapshot);
  const plan = planMosaicLayout(snapshot, analysis);
  if (!plan.valid || !analysis.baseFrame) throw new Error(plan.errors.join(" "));
  const baseFrame = analysis.baseFrame;

  const levelById = new Map(analysis.levels.map((level) => [level.id, level]));
  const modelLevelById = new Map(snapshot.mosaic.levels.map((level) => [level.id, level]));
  return plan.placements.map((placement, index) => {
    const level = levelById.get(placement.levelId)!;
    const modelLevel = modelLevelById.get(placement.levelId)!;
    const sources = resolveLevelSources(snapshot, modelLevel.sourceIds);
    const source = selectPatternSource(
      sources,
      modelLevel.distribution,
      deterministicUnitHash(
        snapshot.grid.seed,
        "mosaic-source",
        placement.levelId,
        placement.clusterId ?? "base",
        placement.row,
        placement.column,
      ),
    );
    return {
      column: placement.column,
      frameHeight: level.frameHeight,
      frameWidth: level.frameWidth,
      index,
      mosaicClusterId: placement.clusterId,
      mosaicLevelId: placement.levelId,
      mosaicSpan: placement.span,
      row: placement.row,
      source,
      x: placement.column * (baseFrame.width + snapshot.grid.gap),
      y: placement.row * (baseFrame.height + snapshot.grid.gap),
    };
  });
}

export const mosaicStrategy: PatternMethodStrategy<MosaicPatternSnapshot> = {
  generateCells: generateMosaicCells,
  getCellCount: (snapshot) => {
    const plan = planMosaicLayout(snapshot);
    return plan.valid ? plan.placements.length : 0;
  },
  getOutputSize: getMosaicOutputSize,
  validate: validateMosaic,
};
