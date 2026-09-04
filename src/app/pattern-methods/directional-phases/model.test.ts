import { describe, expect, it } from "vitest";

import type { DirectionalPhase } from "../../pattern-model";
import {
  getDirectionalShareUnitOptions,
  normalizePhaseShares,
  phaseShareFromUnit,
  phaseShareToUnit,
  transitionWidthFromUnit,
  transitionWidthToUnit,
} from "./model";

const transitionToNext = {
  direction: "previous" as const,
  enabled: false,
  maxWidthPercent: 12.5,
  strength: 100,
};

const phases: DirectionalPhase[] = [
  { distribution: "equal", id: "a", name: "A", share: 50, sourceIds: ["shape"], transitionToNext },
  { distribution: "equal", id: "b", name: "B", share: 20, sourceIds: ["shape"], transitionToNext },
  { distribution: "equal", id: "c", name: "C", share: 10, sourceIds: ["shape"], transitionToNext },
];

describe("directional phase model", () => {
  it("normalizes shares to exactly 100 while preserving ratios", () => {
    const normalized = normalizePhaseShares(phases);
    expect(normalized.reduce((sum, phase) => sum + phase.share, 0)).toBe(100);
    expect(normalized.map((phase) => phase.share)).toEqual([62.5, 25, 12.5]);
  });

  it("offers count units only at matching cardinal angles", () => {
    expect(getDirectionalShareUnitOptions(0)).toEqual(["percent", "columns"]);
    expect(getDirectionalShareUnitOptions(90)).toEqual(["percent", "rows"]);
    expect(getDirectionalShareUnitOptions(180)).toEqual(["percent", "columns"]);
    expect(getDirectionalShareUnitOptions(30)).toEqual(["percent"]);
  });

  it("round-trips percentages through column and row counts", () => {
    expect(phaseShareToUnit(62.5, "columns", 16, 16)).toBe(10);
    expect(phaseShareFromUnit(10, "columns", 16, 16)).toBe(62.5);
    expect(phaseShareToUnit(25, "rows", 8, 16)).toBe(2);
    expect(phaseShareFromUnit(2, "rows", 8, 16)).toBe(25);
    expect(transitionWidthToUnit(12.5, "columns", 8, 16)).toBe(2);
    expect(transitionWidthFromUnit(2, "columns", 8, 16)).toBe(12.5);
  });
});
