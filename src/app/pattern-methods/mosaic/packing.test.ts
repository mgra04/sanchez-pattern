import { describe, expect, it } from "vitest";

import {
  createDefaultMosaicSettings,
  createPatternSource,
  type MosaicPatternSnapshot,
} from "../../pattern-model";
import { planMosaicLayout } from "./packing";

function shareEdge(
  left: { column: number; row: number; span: number },
  right: { column: number; row: number; span: number },
): boolean {
  const verticalOverlap =
    Math.min(left.row + left.span, right.row + right.span) - Math.max(left.row, right.row);
  const horizontalOverlap =
    Math.min(left.column + left.span, right.column + right.span) - Math.max(left.column, right.column);
  return (
    ((left.column + left.span === right.column || right.column + right.span === left.column) && verticalOverlap > 0) ||
    ((left.row + left.span === right.row || right.row + right.span === left.row) && horizontalOverlap > 0)
  );
}

function silhouetteMetrics(placements: ReturnType<typeof planMosaicLayout>["placements"]) {
  const tiles = placements.filter((placement) => placement.clusterId);
  const anchors = tiles.filter((placement) => placement.span === Math.max(...tiles.map((tile) => tile.span)));
  const anchor = anchors.reduce(
    (sum, tile) => ({
      x: sum.x + tile.column + tile.span / 2,
      y: sum.y + tile.row + tile.span / 2,
    }),
    { x: 0, y: 0 },
  );
  anchor.x /= anchors.length;
  anchor.y /= anchors.length;
  const minColumn = Math.min(...tiles.map((tile) => tile.column));
  const minRow = Math.min(...tiles.map((tile) => tile.row));
  const maxColumn = Math.max(...tiles.map((tile) => tile.column + tile.span));
  const maxRow = Math.max(...tiles.map((tile) => tile.row + tile.span));
  const occupiedArea = tiles.reduce((sum, tile) => sum + tile.span ** 2, 0);
  return {
    density: occupiedArea / ((maxColumn - minColumn) * (maxRow - minRow)),
    endpoints: tiles.filter(
      (tile, index) => tiles.filter((other, otherIndex) => index !== otherIndex && shareEdge(tile, other)).length === 1,
    ).length,
    reach: Math.max(
      ...tiles.map((tile) =>
        Math.hypot(tile.column + tile.span / 2 - anchor.x, tile.row + tile.span / 2 - anchor.y),
      ),
    ),
  };
}

function makeSnapshot(seed = 42): MosaicPatternSnapshot {
  const source = {
    ...createPatternSource({
      axis: "weight" as const,
      axisValue: "base",
      category: "base" as const,
      familyId: "square",
      familyName: "Square",
      radiusPx: 0,
      svgBody: '<path d="M0 0H24V24H0Z"/>',
      variantId: "base",
    }),
    frameHeight: 12,
    frameWidth: 12,
    id: "source",
  };
  return {
    grid: { autoFit: true, columns: 16, gap: 2, rows: 12, seed },
    method: "multi-size-mosaic",
    mosaic: createDefaultMosaicSettings(source.id),
    sources: [source],
  };
}

function makeBranchSnapshot(seed = 73): MosaicPatternSnapshot {
  const value = makeSnapshot(seed);
  value.grid = { ...value.grid, columns: 48, rows: 24 };
  const [base, middle, largest] = value.mosaic.levels;
  value.mosaic = {
    ...value.mosaic,
    levels: [base, { ...middle, count: 24 }, { ...largest, count: 2 }],
    clusters: [{
      allocations: [
        { count: 24, coverageShare: 100, levelId: middle.id },
        { count: 2, coverageShare: 100, levelId: largest.id },
      ],
      anchorCoverage: 80,
      id: "organic-cluster",
      name: "Organic",
      spread: 0,
    }],
  };
  return value;
}

describe("mosaic packing", () => {
  it("places exact tiles and fills every remaining smallest slot", () => {
    const value = makeSnapshot();
    const plan = planMosaicLayout(value);
    expect(plan.valid, plan.errors.join(" ")).toBe(true);
    expect(plan.placements.filter((placement) => placement.span === 4)).toHaveLength(1);
    expect(plan.placements.filter((placement) => placement.span === 2)).toHaveLength(4);
    const occupiedArea = plan.placements.reduce((sum, placement) => sum + placement.span ** 2, 0);
    expect(occupiedArea).toBe(value.grid.rows * value.grid.columns);
  });

  it("is deterministic and Seed changes the silhouette", () => {
    const first = planMosaicLayout(makeSnapshot(11)).placements;
    expect(planMosaicLayout(makeSnapshot(11)).placements).toEqual(first);
    expect(planMosaicLayout(makeSnapshot(12)).placements).not.toEqual(first);
  });

  it("allows a middle-only cluster and keeps a one-slot moat", () => {
    const value = makeSnapshot();
    const [base, middle, largest] = value.mosaic.levels;
    value.mosaic = {
      ...value.mosaic,
      levels: [base, { ...middle, count: 2 }, { ...largest, count: 1 }],
      clusters: [
        {
          allocations: [
            { count: 0, coverageShare: 0, levelId: middle.id },
            { count: 1, coverageShare: 100, levelId: largest.id },
          ],
          anchorCoverage: 80,
          id: "large-cluster",
          name: "Large",
          spread: 0,
        },
        {
          allocations: [
            { count: 2, coverageShare: 100, levelId: middle.id },
            { count: 0, coverageShare: 0, levelId: largest.id },
          ],
          anchorCoverage: 80,
          id: "middle-cluster",
          name: "Middle only",
          spread: 0,
        },
      ],
    };
    const plan = planMosaicLayout(value);
    expect(plan.valid, plan.errors.join(" ")).toBe(true);
    const nonBase = plan.placements.filter((placement) => placement.clusterId);
    for (const left of nonBase) for (const right of nonBase) {
      if (left.clusterId === right.clusterId) continue;
      const separated =
        left.column + left.span < right.column || right.column + right.span < left.column ||
        left.row + left.span < right.row || right.row + right.span < left.row;
      expect(separated).toBe(true);
    }
  });

  it("turns high Spread into longer, sparser, multi-endpoint branches", () => {
    const compact = makeBranchSnapshot();
    const organic = structuredClone(compact);
    organic.mosaic.clusters[0]!.spread = 100;

    const compactPlan = planMosaicLayout(compact);
    const organicPlan = planMosaicLayout(organic);
    expect(compactPlan.valid, compactPlan.errors.join(" ")).toBe(true);
    expect(organicPlan.valid, organicPlan.errors.join(" ")).toBe(true);
    const compactMetrics = silhouetteMetrics(compactPlan.placements);
    const organicMetrics = silhouetteMetrics(organicPlan.placements);

    expect(organicMetrics.reach).toBeGreaterThan(compactMetrics.reach);
    expect(organicMetrics.density).toBeLessThan(compactMetrics.density);
    expect(organicMetrics.endpoints).toBeGreaterThan(compactMetrics.endpoints);
  });

  it("keeps Anchor coverage independent from Spread and reports discrete Actual values", () => {
    const coverageValues = [0, 50, 80, 100].map((anchorCoverage) => {
      const value = makeBranchSnapshot();
      value.mosaic.clusters[0]!.anchorCoverage = anchorCoverage;
      value.mosaic.clusters[0]!.spread = 50;
      const plan = planMosaicLayout(value);
      expect(plan.valid, plan.errors.join(" ")).toBe(true);
      return plan.clusterSummaries["organic-cluster"]!.achievedAnchorCoverage;
    });
    expect(coverageValues).toEqual([...coverageValues].sort((left, right) => left - right));
    expect(coverageValues[0]).toBe(0);
    expect(coverageValues.at(-1)).toBeGreaterThan(coverageValues[1]!);

    const compact = makeBranchSnapshot();
    const organic = structuredClone(compact);
    organic.mosaic.clusters[0]!.spread = 100;
    const compactActual = planMosaicLayout(compact).clusterSummaries["organic-cluster"]!.achievedAnchorCoverage;
    const organicActual = planMosaicLayout(organic).clusterSummaries["organic-cluster"]!.achievedAnchorCoverage;
    expect(Math.abs(compactActual - organicActual)).toBeLessThanOrEqual(15);
  });

  it("balances branch budgets and permits loose anchor constellations", () => {
    const organic = makeBranchSnapshot();
    organic.mosaic.clusters[0]!.spread = 100;
    const plan = planMosaicLayout(organic);
    expect(plan.valid, plan.errors.join(" ")).toBe(true);
    const summary = plan.clusterSummaries["organic-cluster"]!;
    const sorted = [...summary.branchLengths].sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    expect(summary.branchLengths.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...summary.branchLengths)).toBeLessThanOrEqual(Math.ceil(median * 1.5));

    const gaps = Array.from({ length: 24 }, (_, seed) => {
      const value = makeBranchSnapshot(seed + 1);
      value.mosaic.clusters[0]!.spread = 100;
      return planMosaicLayout(value).clusterSummaries["organic-cluster"]!.maxAnchorGap;
    });
    expect(gaps.some((gap) => gap >= 1 && gap <= 2)).toBe(true);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2);
  });
});
