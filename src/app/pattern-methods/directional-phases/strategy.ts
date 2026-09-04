import type {
  DirectionalPatternSnapshot,
  DirectionalPhase,
  PatternSource,
} from "../../pattern-model";
import { getPatternGridOutputSize, validatePatternGrid } from "../grid";
import { createSeededRandom, deterministicUnitHash, selectPatternSource } from "../random";
import type { PatternCell, PatternMethodStrategy, PatternValidation } from "../types";

const shareTolerance = 0.0001;

type PhaseInterval = {
  end: number;
  index: number;
  phase: DirectionalPhase;
  start: number;
};

type SpreadCandidate = {
  boundaryId: string;
  boundaryIndex: number;
  distance: number;
  phase: DirectionalPhase;
};

export function normalizeDirectionAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function getResolvedPhaseSources(
  phase: DirectionalPhase,
  sourceMap: ReadonlyMap<string, PatternSource>,
): PatternSource[] {
  return [...new Set(phase.sourceIds)].flatMap((id) => {
    const source = sourceMap.get(id);
    return source ? [source] : [];
  });
}

function getUsedSources(snapshot: DirectionalPatternSnapshot): PatternSource[] {
  const sourceMap = new Map(snapshot.sources.map((source) => [source.id, source]));
  const ids = new Set(snapshot.directional.phases.flatMap((phase) => [...phase.sourceIds]));
  return [...ids].flatMap((id) => {
    const source = sourceMap.get(id);
    return source ? [source] : [];
  });
}

export function validateDirectionalPhases(
  snapshot: DirectionalPatternSnapshot,
): PatternValidation {
  const errors: string[] = [];
  const sourceMap = new Map(snapshot.sources.map((source) => [source.id, source]));
  const usedSources = getUsedSources(snapshot);
  errors.push(...validatePatternGrid(usedSources, snapshot.grid).errors);

  if (snapshot.directional.phases.length < 2) {
    errors.push("Gradient Pattern needs at least two phases.");
  }

  if (!Number.isFinite(snapshot.directional.angle)) {
    errors.push("Direction angle must be a finite number.");
  }

  const total = snapshot.directional.phases.reduce((sum, phase) => sum + phase.share, 0);
  if (Math.abs(total - 100) > shareTolerance) {
    errors.push(`Phase shares must total 100%. Current total: ${Number(total.toFixed(4))}%.`);
  }

  snapshot.directional.phases.forEach((phase, index) => {
    const label = phase.name.trim() || `Phase ${index + 1}`;
    if (!phase.name.trim()) errors.push(`Phase ${index + 1} needs a name.`);
    if (!Number.isFinite(phase.share) || phase.share <= 0) {
      errors.push(`${label} share must be greater than 0%.`);
    }
    if (phase.sourceIds.length === 0) {
      errors.push(`${label} must use at least one Pattern Shape.`);
    }
    const missing = phase.sourceIds.filter((sourceId) => !sourceMap.has(sourceId));
    if (missing.length > 0) errors.push(`${label} references a missing Pattern Shape.`);

    const resolved = getResolvedPhaseSources(phase, sourceMap);
    if (
      phase.distribution === "weighted" &&
      resolved.length > 0 &&
      resolved.every((source) => source.weight <= 0)
    ) {
      errors.push(`${label} Weighted distribution needs a positive source probability.`);
    }

    if (index < snapshot.directional.phases.length - 1 && phase.transitionToNext.enabled) {
      const next = snapshot.directional.phases[index + 1]!;
      const transitionLabel = `${label} to ${next.name.trim() || `Phase ${index + 2}`}`;
      if (phase.transitionToNext.direction !== "previous" && phase.transitionToNext.direction !== "next") {
        errors.push(`${transitionLabel} transition direction must be Previous or Next.`);
      }
      if (
        !Number.isFinite(phase.transitionToNext.maxWidthPercent) ||
        phase.transitionToNext.maxWidthPercent <= 0 ||
        phase.transitionToNext.maxWidthPercent > 100
      ) {
        errors.push(`${transitionLabel} transition max width must be greater than 0% and at most 100%.`);
      }
      if (
        !Number.isFinite(phase.transitionToNext.strength) ||
        phase.transitionToNext.strength < 0 ||
        phase.transitionToNext.strength > 100
      ) {
        errors.push(`${transitionLabel} transition strength must be between 0% and 100%.`);
      }
    }
  });

  return { errors: [...new Set(errors)], valid: errors.length === 0 };
}

export function getDirectionalPhasesOutputSize(
  snapshot: DirectionalPatternSnapshot,
): { height: number; width: number } {
  const usedSources = getUsedSources(snapshot);
  return getPatternGridOutputSize(usedSources.length > 0 ? usedSources : snapshot.sources, snapshot.grid);
}

function getPhaseIntervals(
  phases: readonly DirectionalPhase[],
): PhaseInterval[] {
  let start = 0;
  return phases.map((phase, index) => {
    const end = index === phases.length - 1 ? 1 : start + phase.share / 100;
    const interval = { end, index, phase, start };
    start = end;
    return interval;
  });
}

function getPhaseIntervalForPosition(
  intervals: readonly PhaseInterval[],
  position: number,
): PhaseInterval {
  for (let index = 0; index < intervals.length - 1; index += 1) {
    if (position < intervals[index]!.end - Number.EPSILON * 8) return intervals[index]!;
  }
  return intervals[intervals.length - 1]!;
}

function getSpreadPhase(
  baseline: PhaseInterval,
  intervals: readonly PhaseInterval[],
  position: number,
  seed: number,
  row: number,
  column: number,
): { boundaryId?: string; phase: DirectionalPhase } {
  const candidates: SpreadCandidate[] = [];
  const outgoing = intervals[baseline.index + 1];
  const incoming = intervals[baseline.index - 1];

  if (outgoing && baseline.phase.transitionToNext.enabled && baseline.phase.transitionToNext.direction === "previous") {
    const transition = baseline.phase.transitionToNext;
    const distance = Math.max(0, baseline.end - position);
    const width = transition.maxWidthPercent / 100;
    if (distance <= width) {
      const probability = (transition.strength / 100) * (1 - distance / width) ** 2;
      const boundaryId = `${baseline.phase.id}--${outgoing.phase.id}`;
      if (deterministicUnitHash(seed, "transition-spread", boundaryId, row, column) < probability) {
        candidates.push({ boundaryId, boundaryIndex: baseline.index, distance, phase: outgoing.phase });
      }
    }
  }

  if (incoming && incoming.phase.transitionToNext.enabled && incoming.phase.transitionToNext.direction === "next") {
    const transition = incoming.phase.transitionToNext;
    const distance = Math.max(0, position - baseline.start);
    const width = transition.maxWidthPercent / 100;
    if (distance <= width) {
      const probability = (transition.strength / 100) * (1 - distance / width) ** 2;
      const boundaryId = `${incoming.phase.id}--${baseline.phase.id}`;
      if (deterministicUnitHash(seed, "transition-spread", boundaryId, row, column) < probability) {
        candidates.push({ boundaryId, boundaryIndex: baseline.index - 1, distance, phase: incoming.phase });
      }
    }
  }

  candidates.sort((left, right) => left.distance - right.distance || left.boundaryIndex - right.boundaryIndex);
  return candidates[0]
    ? { boundaryId: candidates[0].boundaryId, phase: candidates[0].phase }
    : { phase: baseline.phase };
}

export function generateDirectionalPhaseCells(
  snapshot: DirectionalPatternSnapshot,
): PatternCell[] {
  const validation = validateDirectionalPhases(snapshot);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const sourceMap = new Map(snapshot.sources.map((source) => [source.id, source]));
  const usedSources = getUsedSources(snapshot);
  const first = usedSources[0]!;
  const size = getDirectionalPhasesOutputSize(snapshot);
  const radians = (normalizeDirectionAngle(snapshot.directional.angle) * Math.PI) / 180;
  const directionX = Math.cos(radians);
  const directionY = -Math.sin(radians);
  const cornerProjections = [
    0,
    size.width * directionX,
    size.height * directionY,
    size.width * directionX + size.height * directionY,
  ];
  const minimum = Math.min(...cornerProjections);
  const maximum = Math.max(...cornerProjections);
  const span = maximum - minimum;
  const random = createSeededRandom(snapshot.grid.seed);
  const intervals = getPhaseIntervals(snapshot.directional.phases);
  const cells: PatternCell[] = [];

  for (let row = 0; row < snapshot.grid.rows; row += 1) {
    for (let column = 0; column < snapshot.grid.columns; column += 1) {
      const index = row * snapshot.grid.columns + column;
      const x = column * (first.frameWidth + snapshot.grid.gap);
      const y = row * (first.frameHeight + snapshot.grid.gap);
      const centerX = x + first.frameWidth / 2;
      const centerY = y + first.frameHeight / 2;
      const projection = centerX * directionX + centerY * directionY;
      const position = span > 0 ? Math.min(1, Math.max(0, (projection - minimum) / span)) : 0;
      const baseline = getPhaseIntervalForPosition(intervals, position);
      const spread = getSpreadPhase(
        baseline,
        intervals,
        position,
        snapshot.grid.seed,
        row,
        column,
      );
      const phase = spread.phase;
      const phaseSources = getResolvedPhaseSources(phase, sourceMap);

      cells.push({
        baselinePhaseId: spread.boundaryId ? baseline.phase.id : undefined,
        column,
        frameHeight: first.frameHeight,
        frameWidth: first.frameWidth,
        index,
        phaseId: phase.id,
        row,
        source: selectPatternSource(phaseSources, phase.distribution, random()),
        spreadBoundaryId: spread.boundaryId,
        x,
        y,
      });
    }
  }

  return cells;
}

export const directionalPhasesStrategy: PatternMethodStrategy<DirectionalPatternSnapshot> = {
  generateCells: generateDirectionalPhaseCells,
  getCellCount: (snapshot) => snapshot.grid.rows * snapshot.grid.columns,
  getOutputSize: getDirectionalPhasesOutputSize,
  validate: validateDirectionalPhases,
};
