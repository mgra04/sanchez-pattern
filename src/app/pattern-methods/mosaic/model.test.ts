import { describe, expect, it } from "vitest";

import {
  createDefaultMosaicSettings,
  createPatternSource,
  type MosaicPatternSnapshot,
} from "../../pattern-model";
import { analyzeMosaicSnapshot, getMosaicFrameSize, getMosaicMaxLevels } from "./model";

function makeSource(id = "source", width = 12, height = 12) {
  return {
    ...createPatternSource({
      axis: "weight" as const,
      axisValue: "base",
      category: "base" as const,
      familyId: id,
      familyName: id,
      radiusPx: 0,
      svgBody: '<path d="M0 0H24V24H0Z"/>',
      variantId: "base",
    }),
    frameHeight: height,
    frameWidth: width,
    id,
  };
}

function snapshot(): MosaicPatternSnapshot {
  const source = makeSource();
  return {
    grid: { autoFit: true, columns: 16, gap: 2, rows: 8, seed: 42 },
    method: "multi-size-mosaic",
    mosaic: createDefaultMosaicSettings(source.id),
    sources: [source],
  };
}

describe("mosaic model", () => {
  it("validates Mosaic amount modes and deterministic packing", () => {
    const countResult = analyzeMosaicSnapshot(snapshot());
    const coverageSnapshot = snapshot();
    coverageSnapshot.mosaic = {
      ...coverageSnapshot.mosaic,
      amountMode: "coverage",
    };
    const coverageResult = analyzeMosaicSnapshot(coverageSnapshot);

    expect(countResult.valid, countResult.errors.join(" ")).toBe(true);
    expect(coverageResult.valid, coverageResult.errors.join(" ")).toBe(true);
    expect(countResult.levels.map((level) => level.tileCount)).toEqual([96, 4, 1]);
    expect(coverageResult.levels.map((level) => level.tileCount)).toEqual([96, 4, 1]);
  });

  it("derives square and rectangular recurrence independently", () => {
    expect(getMosaicFrameSize(12, 12, 2, 4)).toEqual({ height: 54, width: 54 });
    expect(getMosaicFrameSize(12, 8, 2, 4)).toEqual({ height: 38, width: 54 });
  });

  it("derives the dynamic level ceiling", () => {
    expect(getMosaicMaxLevels(24, 48)).toBe(5);
    expect(getMosaicMaxLevels(64, 64)).toBe(6);
  });

  it("keeps the default Count recipe exact", () => {
    const result = analyzeMosaicSnapshot(snapshot());
    expect(result.valid, result.errors.join(" ")).toBe(true);
    expect(result.levels.map((level) => level.tileCount)).toEqual([96, 4, 1]);
    expect(result.levels.map((level) => [level.frameWidth, level.frameHeight])).toEqual([
      [12, 12], [26, 26], [54, 54],
    ]);
    expect(result.clusters[0]?.localAnchorLevelId).toBe("mosaic-level-3");
    expect(result.clusters[0]?.supportLevelId).toBe("mosaic-level-2");
    expect(result.clusters[0]?.anchorCoverage).toBe(80);
  });

  it("validates Anchor coverage without requiring a support level", () => {
    const value = snapshot();
    value.mosaic = {
      ...value.mosaic,
      clusters: value.mosaic.clusters.map((cluster) => ({
        ...cluster,
        allocations: cluster.allocations.map((allocation, index) => ({
          ...allocation,
          count: index === 0 ? 0 : allocation.count,
        })),
        anchorCoverage: 101,
      })),
      levels: value.mosaic.levels.map((level, index) => ({
        ...level,
        count: index === 1 ? 0 : level.count,
      })),
    };
    const invalid = analyzeMosaicSnapshot(value);
    expect(invalid.errors).toContain("Cluster 1 Anchor coverage must be between 0 and 100.");

    value.mosaic = {
      ...value.mosaic,
      clusters: value.mosaic.clusters.map((cluster) => ({ ...cluster, anchorCoverage: 100 })),
    };
    const valid = analyzeMosaicSnapshot(value);
    expect(valid.valid, valid.errors.join(" ")).toBe(true);
    expect(valid.clusters[0]?.supportLevelId).toBeNull();
  });

  it("quantizes non-representable Coverage and reports requested versus actual", () => {
    const value = snapshot();
    value.grid = { ...value.grid, columns: 48, rows: 24 };
    value.mosaic = {
      ...value.mosaic,
      amountMode: "coverage",
      levels: value.mosaic.levels.slice(0, 2).map((level, index) => ({
        ...level,
        coverage: index === 0 ? 90 : 10,
      })),
      clusters: value.mosaic.clusters.map((cluster) => ({
        ...cluster,
        allocations: cluster.allocations.slice(0, 1),
      })),
    };
    const result = analyzeMosaicSnapshot(value);
    expect(result.valid, result.errors.join(" ")).toBe(true);
    expect(result.levels[1].tileCount).toBe(29);
    expect(result.levels[1].actualCoverage).toBeCloseTo(10.0694, 4);
    expect(result.levels[0].actualCoverage).toBeCloseTo(89.9306, 4);
  });

  it("uses largest remainder for unequal cluster shares", () => {
    const value = snapshot();
    const target = value.mosaic.levels[2];
    value.mosaic = {
      ...value.mosaic,
      amountMode: "coverage",
      levels: value.mosaic.levels.map((level, index) => ({
        ...level,
        coverage: index === 0 ? 37.5 : index === 1 ? 0 : 62.5,
      })),
      clusters: [20, 20, 60].map((share, index) => ({
        allocations: [
          { count: 0, coverageShare: index === 0 ? 100 : 0, levelId: value.mosaic.levels[1].id },
          { count: 0, coverageShare: share, levelId: target.id },
        ],
        anchorCoverage: 80,
        id: `cluster-${index}`,
        name: `Cluster ${index + 1}`,
        spread: 25,
      })),
    };
    const result = analyzeMosaicSnapshot(value);
    expect(result.levels[2].tileCount).toBe(5);
    expect(result.clusters.map((cluster) => cluster.counts[target.id])).toEqual([1, 1, 3]);
  });
});
