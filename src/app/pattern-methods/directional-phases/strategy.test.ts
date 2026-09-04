import { describe, expect, it } from "vitest";

import { createPatternSource, type DirectionalPatternSnapshot } from "../../pattern-model";
import { generateDirectionalPhaseCells, validateDirectionalPhases } from "./strategy";

function transition(
  overrides: Partial<{
    direction: "next" | "previous";
    enabled: boolean;
    maxWidthPercent: number;
    strength: number;
  }> = {},
) {
  return {
    direction: "previous" as const,
    enabled: false,
    maxWidthPercent: 12.5,
    strength: 100,
    ...overrides,
  };
}

function makeSource(id: string, weight = 1) {
  return {
    ...createPatternSource({
      axis: "weight",
      axisValue: "base",
      category: "base",
      familyId: id,
      familyName: id,
      radiusPx: 0,
      svgBody: '<path d="M0 0H24V24H0Z"/>',
      variantId: "weight-base__radius-0",
    }),
    id,
    weight,
  };
}

function snapshot(angle = 0): DirectionalPatternSnapshot {
  const sources = [makeSource("small"), makeSource("medium"), makeSource("large")];
  return {
    directional: {
      angle,
      phases: [
        { distribution: "equal", id: "phase-1", name: "Phase 1", share: 62.5, sourceIds: ["small"], transitionToNext: transition() },
        { distribution: "equal", id: "phase-2", name: "Phase 2", share: 25, sourceIds: ["medium"], transitionToNext: transition() },
        { distribution: "equal", id: "phase-3", name: "Phase 3", share: 12.5, sourceIds: ["large"], transitionToNext: transition() },
      ],
    },
    grid: { autoFit: true, columns: 16, gap: 1, rows: 16, seed: 42 },
    method: "directional-phases",
    sources,
  };
}

describe("directional phases strategy", () => {
  it("maps 62.5/25/12.5 to 10/4/2 columns at zero degrees", () => {
    const cells = generateDirectionalPhaseCells(snapshot());
    const counts = cells.reduce<Record<string, number>>((result, cell) => {
      result[cell.phaseId!] = (result[cell.phaseId!] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({ "phase-1": 160, "phase-2": 64, "phase-3": 32 });
    expect(cells.filter((cell) => cell.column < 10).every((cell) => cell.phaseId === "phase-1")).toBe(true);
  });

  it("uses counterclockwise direction with the first phase at the arrow tail", () => {
    const up = generateDirectionalPhaseCells(snapshot(90));
    const left = generateDirectionalPhaseCells(snapshot(180));
    const down = generateDirectionalPhaseCells(snapshot(270));

    expect(up.find((cell) => cell.row === 15 && cell.column === 0)?.phaseId).toBe("phase-1");
    expect(up.find((cell) => cell.row === 0 && cell.column === 0)?.phaseId).toBe("phase-3");
    expect(left.find((cell) => cell.row === 0 && cell.column === 15)?.phaseId).toBe("phase-1");
    expect(left.find((cell) => cell.row === 0 && cell.column === 0)?.phaseId).toBe("phase-3");
    expect(down.find((cell) => cell.row === 0 && cell.column === 0)?.phaseId).toBe("phase-1");
    expect(down.find((cell) => cell.row === 15 && cell.column === 0)?.phaseId).toBe("phase-3");
  });

  it("creates perpendicular diagonal bands at 30 degrees", () => {
    const cells = generateDirectionalPhaseCells(snapshot(30));

    expect(cells.find((cell) => cell.row === 15 && cell.column === 0)?.phaseId).toBe("phase-1");
    expect(cells.find((cell) => cell.row === 0 && cell.column === 15)?.phaseId).toBe("phase-3");
    expect(new Set(cells.map((cell) => cell.phaseId))).toEqual(new Set(["phase-1", "phase-2", "phase-3"]));
  });

  it("assigns an exact boundary center to the following phase", () => {
    const fixture = snapshot();
    fixture.grid = { ...fixture.grid, columns: 1, rows: 1 };
    fixture.directional.phases = [
      { distribution: "equal", id: "before", name: "Before", share: 50, sourceIds: ["small"], transitionToNext: transition() },
      { distribution: "equal", id: "after", name: "After", share: 50, sourceIds: ["large"], transitionToNext: transition() },
    ];

    expect(generateDirectionalPhaseCells(fixture)[0]?.phaseId).toBe("after");
  });

  it("reuses sources and applies deterministic weighted selection inside a phase", () => {
    const fixture = snapshot();
    fixture.sources = [makeSource("small", 1), makeSource("medium", 20)];
    fixture.directional.phases = [
      { distribution: "weighted", id: "phase-1", name: "Phase 1", share: 50, sourceIds: ["small", "medium"], transitionToNext: transition() },
      { distribution: "equal", id: "phase-2", name: "Phase 2", share: 50, sourceIds: ["small"], transitionToNext: transition() },
    ];
    const first = generateDirectionalPhaseCells(fixture);
    const second = generateDirectionalPhaseCells(fixture);
    const weighted = first.filter((cell) => cell.phaseId === "phase-1");

    expect(first.map((cell) => cell.source.id)).toEqual(second.map((cell) => cell.source.id));
    expect(weighted.filter((cell) => cell.source.id === "medium").length).toBeGreaterThan(
      weighted.filter((cell) => cell.source.id === "small").length * 5,
    );
    expect(first.some((cell) => cell.phaseId === "phase-2" && cell.source.id === "small")).toBe(true);
  });

  it("returns actionable validation errors", () => {
    const fixture = snapshot();
    fixture.directional.phases = [
      { distribution: "equal", id: "phase-1", name: "", share: 80, sourceIds: ["missing"], transitionToNext: transition() },
    ];
    const result = validateDirectionalPhases(fixture);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/at least two phases/i);
    expect(result.errors.join(" ")).toMatch(/total 100/i);
    expect(result.errors.join(" ")).toMatch(/needs a name/i);
    expect(result.errors.join(" ")).toMatch(/missing Pattern Shape/i);
  });

  it("keeps disabled and zero-strength transitions identical to the sharp result", () => {
    const sharp = snapshot();
    const zeroStrength = snapshot();
    zeroStrength.directional.phases[0]!.transitionToNext = transition({
      enabled: true,
      maxWidthPercent: 50,
      strength: 0,
    });

    const sharpCells = generateDirectionalPhaseCells(sharp);
    const zeroCells = generateDirectionalPhaseCells(zeroStrength);

    expect(zeroCells.map((cell) => [cell.phaseId, cell.source.id])).toEqual(
      sharpCells.map((cell) => [cell.phaseId, cell.source.id]),
    );
    expect(zeroCells.every((cell) => cell.spreadBoundaryId === undefined)).toBe(true);
  });

  it("mixes individual cells into the previous side of a boundary", () => {
    const fixture = snapshot();
    fixture.directional.phases[0]!.transitionToNext = transition({
      direction: "previous",
      enabled: true,
      maxWidthPercent: 25,
      strength: 100,
    });
    const cells = generateDirectionalPhaseCells(fixture);
    const replacements = cells.filter(
      (cell) => cell.baselinePhaseId === "phase-1" && cell.phaseId === "phase-2",
    );

    expect(replacements.length).toBeGreaterThan(0);
    expect(replacements.every((cell) => cell.column < 10)).toBe(true);
    expect(cells.some((cell) => cell.column === 9 && cell.phaseId === "phase-1")).toBe(true);
    expect(cells.filter((cell) => cell.column < 6).every((cell) => cell.phaseId === "phase-1")).toBe(true);
  });

  it("uses a fixed quadratic falloff from the nominal boundary", () => {
    const fixture = snapshot();
    fixture.grid = { ...fixture.grid, rows: 64 };
    fixture.directional.phases[0]!.transitionToNext = transition({
      enabled: true,
      maxWidthPercent: 25,
      strength: 100,
    });
    const replacements = generateDirectionalPhaseCells(fixture).filter(
      (cell) => cell.baselinePhaseId === "phase-1" && cell.phaseId === "phase-2",
    );
    const counts = [9, 8, 7, 6].map(
      (column) => replacements.filter((cell) => cell.column === column).length,
    );

    expect(counts[0]).toBeGreaterThan(counts[1]!);
    expect(counts[1]).toBeGreaterThan(counts[2]!);
    expect(counts[2]).toBeGreaterThanOrEqual(counts[3]!);
  });

  it("mixes individual cells into the next side and reproduces placement from Seed", () => {
    const fixture = snapshot();
    fixture.directional.phases[0]!.transitionToNext = transition({
      direction: "next",
      enabled: true,
      maxWidthPercent: 25,
      strength: 100,
    });
    const first = generateDirectionalPhaseCells(fixture);
    const repeated = generateDirectionalPhaseCells(fixture);
    const changedSeed = generateDirectionalPhaseCells({
      ...fixture,
      grid: { ...fixture.grid, seed: 43 },
    });
    const replacements = first.filter(
      (cell) => cell.baselinePhaseId === "phase-2" && cell.phaseId === "phase-1",
    );

    expect(replacements.length).toBeGreaterThan(0);
    expect(replacements.every((cell) => cell.column >= 10)).toBe(true);
    expect(first.map((cell) => cell.phaseId)).toEqual(repeated.map((cell) => cell.phaseId));
    expect(first.map((cell) => cell.phaseId)).not.toEqual(changedSeed.map((cell) => cell.phaseId));
  });

  it("supports isolated diagonal spread cells without lane displacement", () => {
    const fixture = snapshot(30);
    fixture.directional.phases[0]!.transitionToNext = transition({
      enabled: true,
      maxWidthPercent: 20,
      strength: 100,
    });
    const cells = generateDirectionalPhaseCells(fixture);
    const replacements = cells.filter(
      (cell) => cell.baselinePhaseId === "phase-1" && cell.phaseId === "phase-2",
    );

    expect(replacements.length).toBeGreaterThan(0);
    expect(new Set(replacements.map((cell) => cell.row)).size).toBeGreaterThan(2);
    expect(replacements.some((cell) => {
      const neighbors = cells.filter((other) =>
        Math.abs(other.row - cell.row) + Math.abs(other.column - cell.column) === 1,
      );
      return neighbors.some((neighbor) => neighbor.phaseId === "phase-1" && neighbor.spreadBoundaryId === undefined);
    })).toBe(true);
  });

  it("validates active transition settings but ignores the dormant last transition", () => {
    const fixture = snapshot();
    fixture.directional.phases[0]!.transitionToNext = transition({ enabled: true, maxWidthPercent: 0 });
    fixture.directional.phases[1]!.transitionToNext = transition({ enabled: true, strength: 101 });
    fixture.directional.phases[2]!.transitionToNext = transition({ enabled: true, maxWidthPercent: -1 });
    const result = validateDirectionalPhases(fixture);

    expect(result.errors.join(" ")).toMatch(/Phase 1 to Phase 2 transition max width/i);
    expect(result.errors.join(" ")).toMatch(/Phase 2 to Phase 3 transition strength/i);
    expect(result.errors.join(" ")).not.toMatch(/Phase 3 to/i);
  });
});
