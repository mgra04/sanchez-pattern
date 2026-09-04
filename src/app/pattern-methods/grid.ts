import type { PatternGridSettings, PatternSource } from "../pattern-model";
import type { PatternOutputSize, PatternValidation } from "./types";

export const patternGridLimits = {
  columns: { max: 64, min: 1 },
  gap: { max: 48, min: 0 },
  rows: { max: 64, min: 1 },
} as const;

export function validatePatternGrid(
  sources: readonly PatternSource[],
  grid: PatternGridSettings,
): PatternValidation {
  const errors: string[] = [];

  if (sources.length === 0) errors.push("Add at least one shape to generate a pattern.");

  const first = sources[0];
  if (
    first &&
    sources.some(
      (source) =>
        source.frameWidth !== first.frameWidth || source.frameHeight !== first.frameHeight,
    )
  ) {
    errors.push("All active shapes must use the same frame width and height.");
  }

  if (
    !Number.isInteger(grid.columns) ||
    grid.columns < patternGridLimits.columns.min ||
    grid.columns > patternGridLimits.columns.max
  ) {
    errors.push(
      `Columns must be between ${patternGridLimits.columns.min} and ${patternGridLimits.columns.max}.`,
    );
  }

  if (
    !Number.isInteger(grid.rows) ||
    grid.rows < patternGridLimits.rows.min ||
    grid.rows > patternGridLimits.rows.max
  ) {
    errors.push(`Rows must be between ${patternGridLimits.rows.min} and ${patternGridLimits.rows.max}.`);
  }

  if (
    !Number.isFinite(grid.gap) ||
    grid.gap < patternGridLimits.gap.min ||
    grid.gap > patternGridLimits.gap.max
  ) {
    errors.push(`Gap must be between ${patternGridLimits.gap.min} and ${patternGridLimits.gap.max}px.`);
  }

  return { errors, valid: errors.length === 0 };
}

export function getPatternGridOutputSize(
  sources: readonly PatternSource[],
  grid: PatternGridSettings,
): PatternOutputSize {
  const source = sources[0];
  if (!source) return { height: 0, width: 0 };

  return {
    height: grid.rows * source.frameHeight + (grid.rows - 1) * grid.gap,
    width: grid.columns * source.frameWidth + (grid.columns - 1) * grid.gap,
  };
}
