import type { BaseGridSettings, BasePatternSnapshot, PatternSource } from "../../pattern-model";
import { getPatternGridOutputSize, patternGridLimits, validatePatternGrid } from "../grid";
import { createSeededRandom, selectPatternSource } from "../random";
import type { PatternCell, PatternMethodStrategy, PatternValidation } from "../types";

export const baseGridLimits = patternGridLimits;

export function validateBaseGrid(
  sources: readonly PatternSource[],
  grid: BaseGridSettings,
): PatternValidation {
  const base = validatePatternGrid(sources, grid);
  const errors = [...base.errors];

  if (grid.distribution === "weighted" && sources.length > 0 && sources.every((source) => source.weight <= 0)) {
    errors.push("Weighted distribution needs at least one positive source weight.");
  }

  return { errors, valid: errors.length === 0 };
}

export function getBaseGridOutputSize(snapshot: BasePatternSnapshot): { height: number; width: number } {
  return getPatternGridOutputSize(snapshot.sources, snapshot.grid);
}

export function generateBaseGridCells(snapshot: BasePatternSnapshot): PatternCell[] {
  const validation = validateBaseGrid(snapshot.sources, snapshot.grid);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const first = snapshot.sources[0]!;
  const random = createSeededRandom(snapshot.grid.seed);
  const cells: PatternCell[] = [];

  for (let row = 0; row < snapshot.grid.rows; row += 1) {
    for (let column = 0; column < snapshot.grid.columns; column += 1) {
      const index = row * snapshot.grid.columns + column;
      cells.push({
        column,
        frameHeight: first.frameHeight,
        frameWidth: first.frameWidth,
        index,
        row,
        source: selectPatternSource(snapshot.sources, snapshot.grid.distribution, random()),
        x: column * (first.frameWidth + snapshot.grid.gap),
        y: row * (first.frameHeight + snapshot.grid.gap),
      });
    }
  }

  return cells;
}

export const baseGridStrategy: PatternMethodStrategy<BasePatternSnapshot> = {
  generateCells: generateBaseGridCells,
  getCellCount: (snapshot) => snapshot.grid.rows * snapshot.grid.columns,
  getOutputSize: getBaseGridOutputSize,
  validate: (snapshot) => validateBaseGrid(snapshot.sources, snapshot.grid),
};
