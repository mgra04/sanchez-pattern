import type { PatternSnapshot, PatternSource } from "../pattern-model";

export type PatternCell = {
  baselinePhaseId?: string;
  column: number;
  frameHeight: number;
  frameWidth: number;
  index: number;
  mosaicClusterId?: string;
  mosaicLevelId?: string;
  mosaicSpan?: number;
  phaseId?: string;
  row: number;
  source: PatternSource;
  spreadBoundaryId?: string;
  triangleElementColumn?: number;
  triangleElementRow?: number;
  triangleMirrorX?: boolean;
  triangleMirrorY?: boolean;
  triangleRole?: "triangle-full" | "triangle-half";
  triangleSlot?: number;
  x: number;
  y: number;
};

export type PatternValidation = {
  errors: readonly string[];
  valid: boolean;
};

export type PatternOutputSize = { height: number; width: number };

export type PatternMethodStrategy<TSnapshot extends PatternSnapshot = PatternSnapshot> = {
  generateCells: (snapshot: TSnapshot) => PatternCell[];
  getCellCount: (snapshot: TSnapshot) => number;
  getOutputSize: (snapshot: TSnapshot) => PatternOutputSize;
  validate: (snapshot: TSnapshot) => PatternValidation;
};
