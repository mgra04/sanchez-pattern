import type { MosaicPatternSnapshot } from "../../pattern-model";
import { deterministicUnitHash } from "../random";
import {
  analyzeMosaicSnapshot,
  type MosaicAnalysis,
  type MosaicDerivedCluster,
  type MosaicDerivedLevel,
} from "./model";

export type MosaicPlacement = {
  clusterId?: string;
  column: number;
  levelId: string;
  row: number;
  span: number;
};

export type MosaicPlacementPlan = {
  analysis: MosaicAnalysis;
  clusterSummaries: Readonly<Record<string, MosaicClusterPackingSummary>>;
  errors: readonly string[];
  placements: readonly MosaicPlacement[];
  valid: boolean;
};

export type MosaicClusterPackingSummary = {
  achievedAnchorCoverage: number;
  branchLengths: readonly number[];
  coveredAnchorSegments: number;
  exposedAnchorSegments: number;
  maxAnchorGap: number;
  requestedAnchorCoverage: number;
};

type Bounds = { maxColumn: number; maxRow: number; minColumn: number; minRow: number };
type ClusterTile = Pick<MosaicPlacement, "column" | "levelId" | "row" | "span">;
type Point = { x: number; y: number };
type Candidate = { column: number; row: number };
type AnchorPerimeterSegment = { anchorIndex: number; key: string };
type BranchState = {
  heading: number;
  id: number;
  placed: number;
  target: number;
  tip: Point;
};

function rectangleGap(
  column: number,
  row: number,
  span: number,
  bounds: Bounds,
): number {
  const right = column + span - 1;
  const bottom = row + span - 1;
  const horizontal = Math.max(bounds.minColumn - right - 1, column - bounds.maxColumn - 1, 0);
  const vertical = Math.max(bounds.minRow - bottom - 1, row - bounds.maxRow - 1, 0);
  return Math.max(horizontal, vertical);
}

function mergeBounds(bounds: Bounds | undefined, column: number, row: number, span: number): Bounds {
  const next = {
    maxColumn: column + span - 1,
    maxRow: row + span - 1,
    minColumn: column,
    minRow: row,
  };
  if (!bounds) return next;
  return {
    maxColumn: Math.max(bounds.maxColumn, next.maxColumn),
    maxRow: Math.max(bounds.maxRow, next.maxRow),
    minColumn: Math.min(bounds.minColumn, next.minColumn),
    minRow: Math.min(bounds.minRow, next.minRow),
  };
}

function validCandidate(
  occupancy: Int16Array,
  rows: number,
  columns: number,
  column: number,
  row: number,
  span: number,
  owner: number,
): boolean {
  if (column < 0 || row < 0 || column + span > columns || row + span > rows) return false;

  for (let y = row; y < row + span; y += 1) {
    for (let x = column; x < column + span; x += 1) {
      if (occupancy[y * columns + x] !== 0) return false;
    }
  }

  for (let y = Math.max(0, row - 1); y <= Math.min(rows - 1, row + span); y += 1) {
    for (let x = Math.max(0, column - 1); x <= Math.min(columns - 1, column + span); x += 1) {
      const occupiedBy = occupancy[y * columns + x];
      if (occupiedBy !== 0 && occupiedBy !== owner) return false;
    }
  }
  return true;
}

function sameOwnerAdjacency(
  occupancy: Int16Array,
  rows: number,
  columns: number,
  column: number,
  row: number,
  span: number,
  owner: number,
): number {
  let adjacency = 0;
  for (let x = column; x < column + span; x += 1) {
    if (row > 0 && occupancy[(row - 1) * columns + x] === owner) adjacency += 1;
    if (row + span < rows && occupancy[(row + span) * columns + x] === owner) adjacency += 1;
  }
  for (let y = row; y < row + span; y += 1) {
    if (column > 0 && occupancy[y * columns + column - 1] === owner) adjacency += 1;
    if (column + span < columns && occupancy[y * columns + column + span] === owner) adjacency += 1;
  }
  return adjacency;
}

function sameOwnerProximity(
  occupancy: Int16Array,
  rows: number,
  columns: number,
  column: number,
  row: number,
  span: number,
  owner: number,
  maxGap: number,
): number {
  for (let gap = 0; gap <= maxGap; gap += 1) {
    const inset = gap + 1;
    const minColumn = Math.max(0, column - inset);
    const maxColumn = Math.min(columns - 1, column + span - 1 + inset);
    const minRow = Math.max(0, row - inset);
    const maxRow = Math.min(rows - 1, row + span - 1 + inset);
    for (let x = minColumn; x <= maxColumn; x += 1) {
      if (occupancy[minRow * columns + x] === owner) return gap;
      if (occupancy[maxRow * columns + x] === owner) return gap;
    }
    for (let y = minRow + 1; y < maxRow; y += 1) {
      if (occupancy[y * columns + minColumn] === owner) return gap;
      if (occupancy[y * columns + maxColumn] === owner) return gap;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function sameOwnerTouchingSides(
  occupancy: Int16Array,
  rows: number,
  columns: number,
  column: number,
  row: number,
  span: number,
  owner: number,
): number {
  let sides = 0;
  for (let x = column; row > 0 && x < column + span; x += 1) {
    if (occupancy[(row - 1) * columns + x] === owner) {
      sides += 1;
      break;
    }
  }
  for (let x = column; row + span < rows && x < column + span; x += 1) {
    if (occupancy[(row + span) * columns + x] === owner) {
      sides += 1;
      break;
    }
  }
  for (let y = row; column > 0 && y < row + span; y += 1) {
    if (occupancy[y * columns + column - 1] === owner) {
      sides += 1;
      break;
    }
  }
  for (let y = row; column + span < columns && y < row + span; y += 1) {
    if (occupancy[y * columns + column + span] === owner) {
      sides += 1;
      break;
    }
  }
  return sides;
}

function getTileCenter(tile: ClusterTile): Point {
  return { x: tile.column + tile.span / 2, y: tile.row + tile.span / 2 };
}

function getAnchorCenter(
  tiles: readonly ClusterTile[],
  anchorLevelId: string | null,
): Point | null {
  const anchors = tiles.filter((tile) => tile.levelId === anchorLevelId);
  const source = anchors.length > 0 ? anchors : tiles;
  if (source.length === 0) return null;
  const total = source.reduce(
    (sum, tile) => {
      const center = getTileCenter(tile);
      return { x: sum.x + center.x, y: sum.y + center.y };
    },
    { x: 0, y: 0 },
  );
  return { x: total.x / source.length, y: total.y / source.length };
}

function distanceFromOtherClusters(
  column: number,
  row: number,
  span: number,
  boundsByOwner: ReadonlyMap<number, Bounds>,
  owner: number,
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const [otherOwner, bounds] of boundsByOwner) {
    if (otherOwner === owner) continue;
    minimum = Math.min(minimum, rectangleGap(column, row, span, bounds));
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function smoothSpread(spread: number): number {
  const value = Math.max(0, Math.min(100, spread)) / 100;
  return value * value * (3 - 2 * value);
}

function angleDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
}

function rectangleEdgeKeys(column: number, row: number, span: number): string[] {
  const keys: string[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    keys.push(`h:${row}:${column + offset}`);
    keys.push(`h:${row + span}:${column + offset}`);
    keys.push(`v:${column}:${row + offset}`);
    keys.push(`v:${column + span}:${row + offset}`);
  }
  return keys;
}

function buildAnchorPerimeter(anchors: readonly ClusterTile[]): AnchorPerimeterSegment[] {
  const exposed = new Map<string, AnchorPerimeterSegment>();
  anchors.forEach((anchor, anchorIndex) => {
    for (const key of rectangleEdgeKeys(anchor.column, anchor.row, anchor.span)) {
      if (exposed.has(key)) exposed.delete(key);
      else exposed.set(key, { anchorIndex, key });
    }
  });
  return [...exposed.values()];
}

function candidatePerimeterCoverage(
  candidate: Candidate,
  span: number,
  perimeterByKey: ReadonlyMap<string, AnchorPerimeterSegment>,
): AnchorPerimeterSegment[] {
  return rectangleEdgeKeys(candidate.column, candidate.row, span).flatMap((key) => {
    const segment = perimeterByKey.get(key);
    return segment ? [segment] : [];
  });
}

function occupyPlacement(params: {
  boundsByOwner: Map<number, Bounds>;
  candidate: Candidate;
  clusterId: string;
  level: MosaicDerivedLevel;
  occupancy: Int16Array;
  owner: number;
  placements: MosaicPlacement[];
  tilesByOwner: Map<number, ClusterTile[]>;
  columns: number;
}): ClusterTile {
  for (let row = params.candidate.row; row < params.candidate.row + params.level.span; row += 1) {
    for (let column = params.candidate.column; column < params.candidate.column + params.level.span; column += 1) {
      params.occupancy[row * params.columns + column] = params.owner;
    }
  }
  params.boundsByOwner.set(
    params.owner,
    mergeBounds(
      params.boundsByOwner.get(params.owner),
      params.candidate.column,
      params.candidate.row,
      params.level.span,
    ),
  );
  const tile = {
    column: params.candidate.column,
    levelId: params.level.id,
    row: params.candidate.row,
    span: params.level.span,
  };
  const ownerTiles = params.tilesByOwner.get(params.owner) ?? [];
  ownerTiles.push(tile);
  params.tilesByOwner.set(params.owner, ownerTiles);
  params.placements.push({ ...tile, clusterId: params.clusterId });
  return tile;
}

function chooseAnchorCandidate(params: {
  anchors: readonly ClusterTile[];
  boundsByOwner: ReadonlyMap<number, Bounds>;
  cluster: MosaicDerivedCluster;
  columns: number;
  level: MosaicDerivedLevel;
  occupancy: Int16Array;
  ordinal: number;
  owner: number;
  rows: number;
  seed: number;
}): Candidate | null {
  const organic = smoothSpread(params.cluster.spread);
  const firstCenter = params.anchors[0] ? getTileCenter(params.anchors[0]) : null;
  const previousAngles = firstCenter
    ? params.anchors.slice(1).map((anchor) => {
        const center = getTileCenter(anchor);
        return Math.atan2(center.y - firstCenter.y, center.x - firstCenter.x);
      })
    : [];
  const gapPreference =
    organic *
    deterministicUnitHash(
      params.seed,
      "mosaic-anchor-gap",
      params.cluster.id,
      params.ordinal,
    ) *
    2;
  const candidates: Array<Candidate & { score: number }> = [];

  for (let row = 0; row <= params.rows - params.level.span; row += 1) {
    for (let column = 0; column <= params.columns - params.level.span; column += 1) {
      if (!validCandidate(
        params.occupancy,
        params.rows,
        params.columns,
        column,
        row,
        params.level.span,
        params.owner,
      )) continue;
      const random = deterministicUnitHash(
        params.seed,
        "mosaic-anchor-placement",
        params.cluster.id,
        params.ordinal,
        row,
        column,
      );
      if (params.anchors.length === 0) {
        const separation = distanceFromOtherClusters(
          column,
          row,
          params.level.span,
          params.boundsByOwner,
          params.owner,
        );
        candidates.push({ column, row, score: separation * 20 + random * 10 });
        continue;
      }
      const gap = sameOwnerProximity(
        params.occupancy,
        params.rows,
        params.columns,
        column,
        row,
        params.level.span,
        params.owner,
        2,
      );
      if (!Number.isFinite(gap)) continue;
      const adjacency = sameOwnerAdjacency(
        params.occupancy,
        params.rows,
        params.columns,
        column,
        row,
        params.level.span,
        params.owner,
      );
      const center = { x: column + params.level.span / 2, y: row + params.level.span / 2 };
      const dx = center.x - firstCenter!.x;
      const dy = center.y - firstCenter!.y;
      const angle = Math.atan2(dy, dx);
      const diversity = previousAngles.length === 0
        ? random
        : Math.min(...previousAngles.map((previous) => angleDistance(angle, previous))) / Math.PI;
      const maximumAxis = Math.max(Math.abs(dx), Math.abs(dy), 1);
      const axisAlignment = 1 - Math.min(Math.abs(dx), Math.abs(dy)) / maximumAxis;
      const diagonal = adjacency === 0 && gap === 0 ? 1 : 0;
      const compactScore = adjacency * 16 - gap * 30 - Math.hypot(dx, dy) * 0.2 + random * 5;
      const organicScore =
        -Math.abs(gap - gapPreference) * 24 +
        diversity * 28 +
        diagonal * 14 -
        axisAlignment * 10 -
        adjacency * 0.8 +
        random * 12;
      candidates.push({
        column,
        row,
        score: compactScore * (1 - organic) + organicScore * organic,
      });
    }
  }
  candidates.sort((left, right) =>
    right.score - left.score || left.row - right.row || left.column - right.column);
  return candidates[0] ?? null;
}

function chooseCoverageCandidate(params: {
  cluster: MosaicDerivedCluster;
  covered: ReadonlySet<string>;
  coveredByAnchor: readonly number[];
  exposedByAnchor: readonly number[];
  columns: number;
  level: MosaicDerivedLevel;
  occupancy: Int16Array;
  ordinal: number;
  owner: number;
  perimeterByKey: ReadonlyMap<string, AnchorPerimeterSegment>;
  rows: number;
  seed: number;
  targetSegments: number;
}): { candidate: Candidate; gained: readonly AnchorPerimeterSegment[] } | null {
  const candidates: Array<{
    candidate: Candidate;
    gained: readonly AnchorPerimeterSegment[];
    score: number;
  }> = [];
  for (let row = 0; row <= params.rows - params.level.span; row += 1) {
    for (let column = 0; column <= params.columns - params.level.span; column += 1) {
      if (!validCandidate(
        params.occupancy,
        params.rows,
        params.columns,
        column,
        row,
        params.level.span,
        params.owner,
      )) continue;
      const candidate = { column, row };
      const gained = candidatePerimeterCoverage(
        candidate,
        params.level.span,
        params.perimeterByKey,
      ).filter((segment) => !params.covered.has(segment.key));
      if (gained.length === 0) continue;
      const balance = gained.reduce((sum, segment) => {
        const exposed = params.exposedByAnchor[segment.anchorIndex] ?? 0;
        const covered = params.coveredByAnchor[segment.anchorIndex] ?? 0;
        return sum + (exposed > 0 ? 1 - covered / exposed : 0);
      }, 0);
      const after = params.covered.size + gained.length;
      const closeness = -Math.abs(params.targetSegments - after);
      const random = deterministicUnitHash(
        params.seed,
        "mosaic-anchor-coverage",
        params.cluster.id,
        params.ordinal,
        row,
        column,
      );
      candidates.push({
        candidate,
        gained,
        score: closeness * 20 + balance * 15 + random * 5,
      });
    }
  }
  candidates.sort((left, right) =>
    right.score - left.score ||
    left.candidate.row - right.candidate.row ||
    left.candidate.column - right.candidate.column);
  return candidates[0] ?? null;
}

function apportionBranchBudgets(
  total: number,
  branchCount: number,
  seed: number,
  clusterId: string,
  levelId: string,
): number[] {
  if (total <= 0 || branchCount <= 0) return [];
  const budgets = Array.from({ length: branchCount }, () => 1);
  let remaining = total - branchCount;
  if (remaining > 0) {
    const weights = budgets.map((_, index) =>
      0.85 + deterministicUnitHash(seed, "mosaic-branch-budget", clusterId, levelId, index) * 0.3);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const quotas = weights.map((weight) => remaining * weight / weightTotal);
    quotas.forEach((quota, index) => {
      const amount = Math.floor(quota);
      budgets[index] += amount;
      remaining -= amount;
    });
    const order = quotas
      .map((quota, index) => ({
        fraction: quota - Math.floor(quota),
        index,
        random: deterministicUnitHash(seed, "mosaic-branch-remainder", clusterId, levelId, index),
      }))
      .sort((left, right) =>
        right.fraction - left.fraction || right.random - left.random || left.index - right.index);
    for (const entry of order) {
      if (remaining <= 0) break;
      budgets[entry.index] += 1;
      remaining -= 1;
    }
  }

  for (let guard = 0; guard < total * 2; guard += 1) {
    const sorted = [...budgets].sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
    const maximum = Math.ceil(median * 1.5);
    const high = budgets.findIndex((budget) => budget > maximum);
    if (high < 0) break;
    const low = budgets.reduce(
      (best, budget, index) => budget < budgets[best] ? index : best,
      0,
    );
    budgets[high] -= 1;
    budgets[low] += 1;
  }
  return budgets;
}

function makeBranches(params: {
  cluster: MosaicDerivedCluster;
  clusterTiles: readonly ClusterTile[];
  level: MosaicDerivedLevel;
  remaining: number;
  seed: number;
}): BranchState[] {
  if (params.remaining <= 0) return [];
  const organic = smoothSpread(params.cluster.spread);
  const maximum = Math.min(6, Math.ceil(Math.sqrt(params.remaining)), params.remaining);
  const count = Math.max(1, Math.min(maximum, 1 + Math.round(organic * (maximum - 1))));
  const budgets = apportionBranchBudgets(
    params.remaining,
    count,
    params.seed,
    params.cluster.id,
    params.level.id,
  );
  const rotation = deterministicUnitHash(
    params.seed,
    "mosaic-branch-rotation",
    params.cluster.id,
  ) * Math.PI * 2;
  return budgets.map((target, index) => {
    const jitter =
      (deterministicUnitHash(
        params.seed,
        "mosaic-branch-angle-jitter",
        params.cluster.id,
        params.level.id,
        index,
      ) - 0.5) *
      (Math.PI / Math.max(6, count * 4));
    const heading = rotation + index * Math.PI * 2 / count + jitter;
    const origin = params.clusterTiles.reduce((best, tile) => {
      const center = getTileCenter(tile);
      const bestCenter = getTileCenter(best);
      const projection = center.x * Math.cos(heading) + center.y * Math.sin(heading);
      const bestProjection =
        bestCenter.x * Math.cos(heading) + bestCenter.y * Math.sin(heading);
      return projection > bestProjection ? tile : best;
    }, params.clusterTiles[0]!);
    return { heading, id: index, placed: 0, target, tip: getTileCenter(origin) };
  });
}

function chooseBranchCandidate(params: {
  anchorCenter: Point;
  branch: BranchState;
  cluster: MosaicDerivedCluster;
  columns: number;
  forbiddenPerimeter: ReadonlySet<string>;
  level: MosaicDerivedLevel;
  occupancy: Int16Array;
  ordinal: number;
  owner: number;
  perimeterByKey: ReadonlyMap<string, AnchorPerimeterSegment>;
  rows: number;
  seed: number;
}): Candidate | null {
  const organic = smoothSpread(params.cluster.spread);
  const maximumReach = Math.max(1, Math.hypot(params.columns, params.rows));
  const gapPreference =
    organic *
    deterministicUnitHash(
      params.seed,
      "mosaic-branch-gap",
      params.cluster.id,
      params.level.id,
      params.branch.id,
      params.ordinal,
    );
  const candidates: Array<Candidate & { forbidden: number; score: number }> = [];
  for (let row = 0; row <= params.rows - params.level.span; row += 1) {
    for (let column = 0; column <= params.columns - params.level.span; column += 1) {
      if (!validCandidate(
        params.occupancy,
        params.rows,
        params.columns,
        column,
        row,
        params.level.span,
        params.owner,
      )) continue;
      const gap = sameOwnerProximity(
        params.occupancy,
        params.rows,
        params.columns,
        column,
        row,
        params.level.span,
        params.owner,
        1,
      );
      if (!Number.isFinite(gap)) continue;
      const center = { x: column + params.level.span / 2, y: row + params.level.span / 2 };
      const tipDx = center.x - params.branch.tip.x;
      const tipDy = center.y - params.branch.tip.y;
      const direction = Math.atan2(tipDy, tipDx);
      const alignment = (Math.cos(direction - params.branch.heading) + 1) / 2;
      const tipDistance = Math.hypot(tipDx, tipDy) / maximumReach;
      const reach = Math.hypot(
        center.x - params.anchorCenter.x,
        center.y - params.anchorCenter.y,
      ) / maximumReach;
      const adjacency = sameOwnerAdjacency(
        params.occupancy,
        params.rows,
        params.columns,
        column,
        row,
        params.level.span,
        params.owner,
      );
      const touchingSides = sameOwnerTouchingSides(
        params.occupancy,
        params.rows,
        params.columns,
        column,
        row,
        params.level.span,
        params.owner,
      );
      const endpoint = touchingSides === 1 ? 1 : touchingSides === 0 ? 0.25 : 0;
      const forbidden = candidatePerimeterCoverage(
        { column, row },
        params.level.span,
        params.perimeterByKey,
      ).filter((segment) => params.forbiddenPerimeter.has(segment.key)).length;
      const random = deterministicUnitHash(
        params.seed,
        "mosaic-balanced-branch",
        params.cluster.id,
        params.level.id,
        params.branch.id,
        params.ordinal,
        row,
        column,
      );
      const compactScore = adjacency * 12 - reach * 38 - gap * 24 + random * 5;
      const completion = params.branch.target > 0
        ? params.branch.placed / params.branch.target
        : 1;
      const organicScore =
        alignment * 48 -
        tipDistance * 28 +
        reach * 24 * (1 - completion * 0.6) +
        endpoint * 22 -
        Math.abs(gap - gapPreference) * 18 +
        random * 10;
      candidates.push({
        column,
        forbidden,
        row,
        score: compactScore * (1 - organic) + organicScore * organic,
      });
    }
  }
  candidates.sort((left, right) =>
    left.forbidden - right.forbidden ||
    right.score - left.score ||
    left.row - right.row ||
    left.column - right.column);
  return candidates[0] ?? null;
}

function maximumAnchorGap(anchors: readonly ClusterTile[]): number {
  let maximum = 0;
  for (let left = 0; left < anchors.length; left += 1) {
    for (let right = left + 1; right < anchors.length; right += 1) {
      maximum = Math.max(
        maximum,
        rectangleGap(
          anchors[right]!.column,
          anchors[right]!.row,
          anchors[right]!.span,
          {
            maxColumn: anchors[left]!.column + anchors[left]!.span - 1,
            maxRow: anchors[left]!.row + anchors[left]!.span - 1,
            minColumn: anchors[left]!.column,
            minRow: anchors[left]!.row,
          },
        ),
      );
    }
  }
  return maximum;
}

export function planMosaicLayout(
  snapshot: MosaicPatternSnapshot,
  analysis = analyzeMosaicSnapshot(snapshot),
): MosaicPlacementPlan {
  if (!analysis.valid) {
    return { analysis, clusterSummaries: {}, errors: analysis.errors, placements: [], valid: false };
  }

  const occupancy = new Int16Array(snapshot.grid.rows * snapshot.grid.columns);
  const boundsByOwner = new Map<number, Bounds>();
  const tilesByOwner = new Map<number, ClusterTile[]>();
  const placements: MosaicPlacement[] = [];
  const clusterSummaries: Record<string, MosaicClusterPackingSummary> = {};
  const levelById = new Map(analysis.levels.map((level) => [level.id, level]));
  const clusterOrder = analysis.clusters
    .map((cluster, index) => ({
      cluster,
      index,
      span: cluster.localAnchorLevelId
        ? levelById.get(cluster.localAnchorLevelId)?.span ?? 0
        : 0,
    }))
    .sort((left, right) => right.span - left.span || left.index - right.index);

  for (const ordered of clusterOrder) {
    const owner = ordered.index + 1;
    const levels = analysis.levels
      .slice(1)
      .filter((level) => (ordered.cluster.counts[level.id] ?? 0) > 0)
      .sort((left, right) => right.span - left.span || left.index - right.index);
    const anchorLevel = levels.find((level) => level.id === ordered.cluster.localAnchorLevelId)!;
    const anchorCount = ordered.cluster.counts[anchorLevel.id] ?? 0;
    const anchors: ClusterTile[] = [];
    for (let ordinal = 0; ordinal < anchorCount; ordinal += 1) {
      const candidate = chooseAnchorCandidate({
        anchors,
        boundsByOwner,
        cluster: ordered.cluster,
        columns: snapshot.grid.columns,
        level: anchorLevel,
        occupancy,
        ordinal,
        owner,
        rows: snapshot.grid.rows,
        seed: snapshot.grid.seed,
      });
      if (!candidate) {
        const message = `${ordered.cluster.name} could place ${ordinal} of ${anchorCount} Size ${anchorLevel.index + 1} tiles. Reduce its Counts or Spread, reduce Clusters, or enlarge the Grid.`;
        return { analysis, clusterSummaries: {}, errors: [message], placements: [], valid: false };
      }
      anchors.push(occupyPlacement({
        boundsByOwner,
        candidate,
        clusterId: ordered.cluster.id,
        columns: snapshot.grid.columns,
        level: anchorLevel,
        occupancy,
        owner,
        placements,
        tilesByOwner,
      }));
    }

    const perimeter = buildAnchorPerimeter(anchors);
    const perimeterByKey = new Map(perimeter.map((segment) => [segment.key, segment]));
    const exposedByAnchor = anchors.map((_, anchorIndex) =>
      perimeter.filter((segment) => segment.anchorIndex === anchorIndex).length);
    const coveredByAnchor = anchors.map(() => 0);
    const covered = new Set<string>();
    const targetSegments = Math.round(
      perimeter.length * Math.max(0, Math.min(100, ordered.cluster.anchorCoverage)) / 100,
    );
    const supportLevel = levels.find((level) => level.id === ordered.cluster.supportLevelId);
    let supportPlaced = 0;
    const supportCount = supportLevel ? ordered.cluster.counts[supportLevel.id] ?? 0 : 0;

    if (supportLevel) {
      while (supportPlaced < supportCount) {
        const choice = chooseCoverageCandidate({
          cluster: ordered.cluster,
          columns: snapshot.grid.columns,
          covered,
          coveredByAnchor,
          exposedByAnchor,
          level: supportLevel,
          occupancy,
          ordinal: supportPlaced,
          owner,
          perimeterByKey,
          rows: snapshot.grid.rows,
          seed: snapshot.grid.seed,
          targetSegments,
        });
        if (!choice) break;
        const currentDifference = Math.abs(targetSegments - covered.size);
        const nextDifference = Math.abs(targetSegments - (covered.size + choice.gained.length));
        if (currentDifference <= nextDifference) break;
        occupyPlacement({
          boundsByOwner,
          candidate: choice.candidate,
          clusterId: ordered.cluster.id,
          columns: snapshot.grid.columns,
          level: supportLevel,
          occupancy,
          owner,
          placements,
          tilesByOwner,
        });
        for (const segment of choice.gained) {
          covered.add(segment.key);
          coveredByAnchor[segment.anchorIndex] =
            (coveredByAnchor[segment.anchorIndex] ?? 0) + 1;
        }
        supportPlaced += 1;
      }
    }

    const forbiddenPerimeter = new Set(
      perimeter.filter((segment) => !covered.has(segment.key)).map((segment) => segment.key),
    );
    let primaryBranchLengths: number[] = [];
    for (const level of levels) {
      if (level.id === anchorLevel.id) continue;
      const requested = ordered.cluster.counts[level.id] ?? 0;
      const alreadyPlaced = level.id === supportLevel?.id ? supportPlaced : 0;
      const remaining = requested - alreadyPlaced;
      if (remaining <= 0) continue;
      const clusterTiles = tilesByOwner.get(owner) ?? [];
      const branches = makeBranches({
        cluster: ordered.cluster,
        clusterTiles,
        level,
        remaining,
        seed: snapshot.grid.seed,
      });
      let placed = 0;
      while (placed < remaining) {
        const active = branches
          .filter((branch) => branch.placed < branch.target)
          .sort((left, right) =>
            left.placed / left.target - right.placed / right.target ||
            left.id - right.id);
        let branch = active[0];
        if (!branch) break;
        let candidate = chooseBranchCandidate({
          anchorCenter: getAnchorCenter(clusterTiles, anchorLevel.id)!,
          branch,
          cluster: ordered.cluster,
          columns: snapshot.grid.columns,
          forbiddenPerimeter,
          level,
          occupancy,
          ordinal: placed,
          owner,
          perimeterByKey,
          rows: snapshot.grid.rows,
          seed: snapshot.grid.seed,
        });
        if (!candidate) {
          branch.target = branch.placed;
          const remainder = remaining - placed;
          const receivers = branches.filter((entry) => entry !== branch);
          if (receivers.length === 0) break;
          for (let index = 0; index < remainder; index += 1) {
            receivers[index % receivers.length]!.target += 1;
          }
          continue;
        }
        const tile = occupyPlacement({
          boundsByOwner,
          candidate,
          clusterId: ordered.cluster.id,
          columns: snapshot.grid.columns,
          level,
          occupancy,
          owner,
          placements,
          tilesByOwner,
        });
        if (level.id === supportLevel?.id) {
          for (const segment of candidatePerimeterCoverage(
            candidate,
            level.span,
            perimeterByKey,
          )) {
            if (!covered.has(segment.key)) {
              covered.add(segment.key);
              coveredByAnchor[segment.anchorIndex] =
                (coveredByAnchor[segment.anchorIndex] ?? 0) + 1;
            }
          }
        }
        const center = getTileCenter(tile);
        const actualHeading = Math.atan2(
          center.y - branch.tip.y,
          center.x - branch.tip.x,
        );
        const turn =
          (deterministicUnitHash(
            snapshot.grid.seed,
            "mosaic-branch-turn",
            ordered.cluster.id,
            level.id,
            branch.id,
            branch.placed,
          ) - 0.5) *
          (0.45 - smoothSpread(ordered.cluster.spread) * 0.2);
        branch.heading = Math.atan2(
          Math.sin(branch.heading) * 0.7 + Math.sin(actualHeading) * 0.3,
          Math.cos(branch.heading) * 0.7 + Math.cos(actualHeading) * 0.3,
        ) + turn;
        branch.tip = center;
        branch.placed += 1;
        placed += 1;
      }
      if (placed < remaining) {
        const message = `${ordered.cluster.name} could place ${alreadyPlaced + placed} of ${requested} Size ${level.index + 1} tiles. Reduce its Counts or Spread, reduce Clusters, or enlarge the Grid.`;
        return { analysis, clusterSummaries: {}, errors: [message], placements: [], valid: false };
      }
      if (level.id === supportLevel?.id) {
        primaryBranchLengths = branches.map((branch) => branch.placed).filter((length) => length > 0);
      }
    }

    clusterSummaries[ordered.cluster.id] = {
      achievedAnchorCoverage:
        perimeter.length > 0 ? covered.size / perimeter.length * 100 : 0,
      branchLengths: primaryBranchLengths,
      coveredAnchorSegments: covered.size,
      exposedAnchorSegments: perimeter.length,
      maxAnchorGap: maximumAnchorGap(anchors),
      requestedAnchorCoverage: ordered.cluster.anchorCoverage,
    };
  }

  const baseLevel = analysis.levels[0];
  for (let row = 0; row < snapshot.grid.rows; row += 1) {
    for (let column = 0; column < snapshot.grid.columns; column += 1) {
      if (occupancy[row * snapshot.grid.columns + column] !== 0) continue;
      placements.push({ column, levelId: baseLevel.id, row, span: 1 });
    }
  }

  placements.sort(
    (left, right) =>
      left.row - right.row || left.column - right.column || right.span - left.span,
  );
  return { analysis, clusterSummaries, errors: [], placements, valid: true };
}
