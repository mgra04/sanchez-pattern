import {
  normalizePatternAppearance,
  validateOpacityDistribution,
  type PatternSnapshot,
} from "../pattern-model";
import { baseGridStrategy } from "./base-grid/strategy";
import { directionalPhasesStrategy } from "./directional-phases/strategy";
import { mosaicStrategy } from "./mosaic/strategy";
import { triangleLatticeStrategy } from "./triangle-lattice/strategy";
import type { PatternCell, PatternOutputSize, PatternValidation } from "./types";

export function validatePatternSnapshot(snapshot: PatternSnapshot): PatternValidation {
  const methodValidation = (() => {
    switch (snapshot.method) {
      case "base-grid": return baseGridStrategy.validate(snapshot);
      case "directional-phases": return directionalPhasesStrategy.validate(snapshot);
      case "multi-size-mosaic": return mosaicStrategy.validate(snapshot);
      case "triangle-lattice": return triangleLatticeStrategy.validate(snapshot);
    }
  })();
  const opacity = normalizePatternAppearance(snapshot.appearance).opacityDistribution;
  const appearanceErrors = opacity.enabled ? validateOpacityDistribution(opacity) : [];
  const errors = [...methodValidation.errors, ...appearanceErrors];
  return { errors, valid: errors.length === 0 };
}

export function generatePatternCells(snapshot: PatternSnapshot): PatternCell[] {
  switch (snapshot.method) {
    case "base-grid": return baseGridStrategy.generateCells(snapshot);
    case "directional-phases": return directionalPhasesStrategy.generateCells(snapshot);
    case "multi-size-mosaic": return mosaicStrategy.generateCells(snapshot);
    case "triangle-lattice": return triangleLatticeStrategy.generateCells(snapshot);
  }
}

export function getPatternCellCount(snapshot: PatternSnapshot): number {
  switch (snapshot.method) {
    case "base-grid": return baseGridStrategy.getCellCount(snapshot);
    case "directional-phases": return directionalPhasesStrategy.getCellCount(snapshot);
    case "multi-size-mosaic": return mosaicStrategy.getCellCount(snapshot);
    case "triangle-lattice": return triangleLatticeStrategy.getCellCount(snapshot);
  }
}

export function getPatternOutputSize(snapshot: PatternSnapshot): PatternOutputSize {
  switch (snapshot.method) {
    case "base-grid": return baseGridStrategy.getOutputSize(snapshot);
    case "directional-phases": return directionalPhasesStrategy.getOutputSize(snapshot);
    case "multi-size-mosaic": return mosaicStrategy.getOutputSize(snapshot);
    case "triangle-lattice": return triangleLatticeStrategy.getOutputSize(snapshot);
  }
}
