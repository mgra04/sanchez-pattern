import type {
  MosaicCluster,
  MosaicPatternSnapshot,
  PatternSource,
} from "../../pattern-model";
import { validatePatternGrid } from "../grid";

export const mosaicClusterLimit = 16;
export const mosaicRecommendedClusterLimit = 8;
const percentageTolerance = 0.01;

export type MosaicDerivedLevel = {
  actualCoverage: number;
  frameHeight: number;
  frameWidth: number;
  id: string;
  index: number;
  requestedCoverage: number;
  sourceIds: readonly string[];
  span: number;
  theoreticalMax: number;
  tileCount: number;
};

export type MosaicDerivedCluster = {
  anchorCoverage: number;
  counts: Readonly<Record<string, number>>;
  id: string;
  localAnchorLevelId: string | null;
  name: string;
  spread: number;
  supportLevelId: string | null;
};

export type MosaicAnalysis = {
  baseFrame: { height: number; width: number } | null;
  clusters: readonly MosaicDerivedCluster[];
  errors: readonly string[];
  levels: readonly MosaicDerivedLevel[];
  maxLevels: number;
  nonBaseArea: number;
  smallestCount: number;
  totalSlots: number;
  valid: boolean;
};

function roundCoverage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function getMosaicMaxLevels(rows: number, columns: number): number {
  const smallestDimension = Math.min(rows, columns);
  if (!Number.isFinite(smallestDimension) || smallestDimension <= 1) return 0;
  return Math.ceil(Math.log2(smallestDimension));
}

export function getMosaicFrameSize(
  baseWidth: number,
  baseHeight: number,
  gap: number,
  span: number,
): { height: number; width: number } {
  return {
    height: span * baseHeight + (span - 1) * gap,
    width: span * baseWidth + (span - 1) * gap,
  };
}

function uniqueAssignedSources(snapshot: MosaicPatternSnapshot): PatternSource[] {
  const sourceById = new Map(snapshot.sources.map((source) => [source.id, source]));
  const assignedIds = new Set(snapshot.mosaic.levels.flatMap((level) => level.sourceIds));
  return [...assignedIds].flatMap((id) => {
    const source = sourceById.get(id);
    return source ? [source] : [];
  });
}

function deriveCoverageCounts(
  requested: readonly number[],
  spans: readonly number[],
  totalSlots: number,
): number[] | null {
  const candidateSets = requested.slice(1).map((coverage, index) => {
    if (coverage <= 0) return [0];
    const area = spans[index + 1] ** 2;
    const ideal = (coverage / 100) * totalSlots / area;
    return [...new Set([Math.floor(ideal), Math.ceil(ideal)])].filter((value) => value >= 0);
  });

  let best: { counts: number[]; maxError: number; score: number } | null = null;

  function visit(index: number, counts: number[]): void {
    if (index < candidateSets.length) {
      for (const count of candidateSets[index]) visit(index + 1, [...counts, count]);
      return;
    }

    const nonBaseArea = counts.reduce(
      (sum, count, countIndex) => sum + count * spans[countIndex + 1] ** 2,
      0,
    );
    if (nonBaseArea > totalSlots) return;

    const allCounts = [totalSlots - nonBaseArea, ...counts];
    const actual = allCounts.map((count, levelIndex) =>
      (count * spans[levelIndex] ** 2 * 100) / totalSlots,
    );
    const errors = actual.map((value, levelIndex) => Math.abs(value - requested[levelIndex]));
    const score = errors.reduce((sum, error) => sum + error ** 2, 0);
    const maxError = Math.max(...errors);

    if (
      !best ||
      score < best.score - 1e-9 ||
      (Math.abs(score - best.score) <= 1e-9 && maxError < best.maxError - 1e-9) ||
      (Math.abs(score - best.score) <= 1e-9 &&
        Math.abs(maxError - best.maxError) <= 1e-9 &&
        counts.slice().reverse().join(",") < best.counts.slice(1).reverse().join(","))
    ) {
      best = { counts: allCounts, maxError, score };
    }
  }

  visit(0, []);
  const resolved = best as { counts: number[]; maxError: number; score: number } | null;
  return resolved ? resolved.counts : null;
}

function apportion(total: number, clusters: readonly MosaicCluster[], levelId: string): number[] {
  if (total <= 0) return clusters.map(() => 0);
  const quotas = clusters.map((cluster) => {
    const allocation = cluster.allocations.find((entry) => entry.levelId === levelId);
    return total * ((allocation?.coverageShare ?? 0) / 100);
  });
  const counts = quotas.map(Math.floor);
  let remainder = total - counts.reduce((sum, count) => sum + count, 0);
  const order = quotas
    .map((quota, index) => ({ fraction: quota - Math.floor(quota), index }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const entry of order) {
    if (remainder <= 0) break;
    counts[entry.index] += 1;
    remainder -= 1;
  }
  return counts;
}

export function analyzeMosaicSnapshot(snapshot: MosaicPatternSnapshot): MosaicAnalysis {
  const errors: string[] = [];
  const totalSlots = snapshot.grid.rows * snapshot.grid.columns;
  const maxLevels = getMosaicMaxLevels(snapshot.grid.rows, snapshot.grid.columns);
  const assignedSources = uniqueAssignedSources(snapshot);
  errors.push(...validatePatternGrid(assignedSources, snapshot.grid).errors);

  if (snapshot.mosaic.levels.length < 2) errors.push("Mosaic requires at least two size levels.");
  if (snapshot.mosaic.levels.length > maxLevels) {
    errors.push(`This Grid supports at most ${maxLevels} Mosaic size levels.`);
  }
  if (snapshot.mosaic.clusters.length < 1) errors.push("Mosaic requires at least one cluster.");
  if (snapshot.mosaic.clusters.length > mosaicClusterLimit) {
    errors.push(`Mosaic supports at most ${mosaicClusterLimit} clusters.`);
  }

  const sourceById = new Map(snapshot.sources.map((source) => [source.id, source]));
  snapshot.mosaic.levels.forEach((level, index) => {
    if (level.sourceIds.length === 0) errors.push(`Size ${index + 1} must use at least one Pattern Shape.`);
    for (const id of level.sourceIds) {
      if (!sourceById.has(id)) errors.push(`Size ${index + 1} references a missing Pattern Shape.`);
    }
  });

  const baseSource = assignedSources[0];
  const baseFrame = baseSource
    ? { height: baseSource.frameHeight, width: baseSource.frameWidth }
    : null;
  if (
    baseSource &&
    assignedSources.some(
      (source) =>
        source.frameWidth !== baseSource.frameWidth || source.frameHeight !== baseSource.frameHeight,
    )
  ) {
    errors.push("All Pattern Shapes assigned to Mosaic sizes must use the same base frame.");
  }

  const spans = snapshot.mosaic.levels.map((_, index) => 2 ** index);
  let counts: number[] = [];

  if (snapshot.mosaic.amountMode === "coverage") {
    const requested = snapshot.mosaic.levels.map((level) => level.coverage);
    if (requested.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      errors.push("Every Mosaic Coverage value must be between 0% and 100%.");
    }
    const total = requested.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > percentageTolerance) {
      errors.push(`Mosaic Coverage must total 100% (currently ${roundCoverage(total)}%).`);
    }
    counts = deriveCoverageCounts(requested, spans, totalSlots) ?? [];
    if (counts.length === 0) errors.push("Mosaic Coverage cannot fit inside the current Grid.");
    requested.forEach((coverage, index) => {
      if (coverage > 0 && (counts[index] ?? 0) === 0) {
        const minimum = totalSlots > 0 ? (spans[index] ** 2 * 100) / totalSlots : 100;
        errors.push(
          `Size ${index + 1} needs at least ${roundCoverage(minimum)}% Coverage on this Grid.`,
        );
      }
    });
  } else {
    const nonBaseCounts = snapshot.mosaic.levels.slice(1).map((level, index) => {
      if (!Number.isInteger(level.count) || level.count < 0) {
        errors.push(`Size ${index + 2} Count must be a non-negative whole number.`);
      }
      return Number.isInteger(level.count) && level.count >= 0 ? level.count : 0;
    });
    const nonBaseArea = nonBaseCounts.reduce(
      (sum, count, index) => sum + count * spans[index + 1] ** 2,
      0,
    );
    if (nonBaseArea >= totalSlots) {
      errors.push("Count mode must leave at least one smallest slot available.");
    }
    counts = [Math.max(0, totalSlots - nonBaseArea), ...nonBaseCounts];
  }

  const derivedClusters = snapshot.mosaic.clusters.map((cluster, clusterIndex) => {
    const clusterCounts: Record<string, number> = {};
    snapshot.mosaic.levels.slice(1).forEach((level, levelOffset) => {
      const allocation = cluster.allocations.find((entry) => entry.levelId === level.id);
      if (!allocation) errors.push(`${cluster.name} is missing the Size ${levelOffset + 2} allocation.`);
      if (snapshot.mosaic.amountMode === "coverage") {
        if (
          allocation &&
          (!Number.isFinite(allocation.coverageShare) ||
            allocation.coverageShare < 0 ||
            allocation.coverageShare > 100)
        ) {
          errors.push(`${cluster.name} has an invalid Size ${levelOffset + 2} share.`);
        }
      } else if (allocation && (!Number.isInteger(allocation.count) || allocation.count < 0)) {
        errors.push(`${cluster.name} has an invalid Size ${levelOffset + 2} Count.`);
      }
      clusterCounts[level.id] = snapshot.mosaic.amountMode === "count" ? allocation?.count ?? 0 : 0;
    });
    if (!Number.isFinite(cluster.spread) || cluster.spread < 0 || cluster.spread > 100) {
      errors.push(`${cluster.name} Spread must be between 0 and 100.`);
    }
    if (
      !Number.isFinite(cluster.anchorCoverage) ||
      cluster.anchorCoverage < 0 ||
      cluster.anchorCoverage > 100
    ) {
      errors.push(`${cluster.name} Anchor coverage must be between 0 and 100.`);
    }
    return {
      anchorCoverage: cluster.anchorCoverage,
      counts: clusterCounts,
      id: cluster.id,
      localAnchorLevelId: null,
      name: cluster.name || `Cluster ${clusterIndex + 1}`,
      spread: cluster.spread,
      supportLevelId: null,
    } satisfies MosaicDerivedCluster;
  });

  snapshot.mosaic.levels.slice(1).forEach((level, levelOffset) => {
    const expected = counts[levelOffset + 1] ?? 0;
    if (snapshot.mosaic.amountMode === "coverage") {
      const shareTotal = snapshot.mosaic.clusters.reduce((sum, cluster) => {
        const allocation = cluster.allocations.find((entry) => entry.levelId === level.id);
        return sum + (allocation?.coverageShare ?? 0);
      }, 0);
      if (Math.abs(shareTotal - 100) > percentageTolerance) {
        errors.push(`Size ${levelOffset + 2} cluster shares must total 100% (currently ${roundCoverage(shareTotal)}%).`);
      }
      const apportioned = apportion(expected, snapshot.mosaic.clusters, level.id);
      apportioned.forEach((count, clusterIndex) => {
        (derivedClusters[clusterIndex].counts as Record<string, number>)[level.id] = count;
      });
    } else {
      const actual = derivedClusters.reduce((sum, cluster) => sum + (cluster.counts[level.id] ?? 0), 0);
      if (actual !== expected) {
        errors.push(`Size ${levelOffset + 2} cluster Counts must total ${expected} (currently ${actual}).`);
      }
    }
  });

  const clusters = derivedClusters.map((cluster) => {
    const allocatedLevels = snapshot.mosaic.levels
      .slice(1)
      .filter((level) => (cluster.counts[level.id] ?? 0) > 0);
    const localAnchor = allocatedLevels.at(-1);
    const supportLevel = allocatedLevels.at(-2);
    if (!localAnchor) errors.push(`${cluster.name} must contain at least one non-base tile.`);
    return {
      ...cluster,
      localAnchorLevelId: localAnchor?.id ?? null,
      supportLevelId: supportLevel?.id ?? null,
    };
  });

  const levels = snapshot.mosaic.levels.map((level, index) => {
    const span = spans[index];
    const tileCount = counts[index] ?? 0;
    const size = baseFrame
      ? getMosaicFrameSize(baseFrame.width, baseFrame.height, snapshot.grid.gap, span)
      : { height: 0, width: 0 };
    return {
      actualCoverage: totalSlots > 0 ? roundCoverage((tileCount * span ** 2 * 100) / totalSlots) : 0,
      frameHeight: size.height,
      frameWidth: size.width,
      id: level.id,
      index,
      requestedCoverage: level.coverage,
      sourceIds: level.sourceIds,
      span,
      theoreticalMax:
        Math.floor(snapshot.grid.rows / span) * Math.floor(snapshot.grid.columns / span),
      tileCount,
    } satisfies MosaicDerivedLevel;
  });

  levels.slice(1).forEach((level) => {
    if (level.tileCount > level.theoreticalMax) {
      errors.push(`Size ${level.index + 1} exceeds its theoretical maximum of ${level.theoreticalMax}.`);
    }
  });

  const nonBaseArea = levels.slice(1).reduce(
    (sum, level) => sum + level.tileCount * level.span ** 2,
    0,
  );

  return {
    baseFrame,
    clusters,
    errors: [...new Set(errors)],
    levels,
    maxLevels,
    nonBaseArea,
    smallestCount: counts[0] ?? 0,
    totalSlots,
    valid: errors.length === 0,
  };
}
