import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";

describe("Base Pattern Creator performance declarations", () => {
  it("perf: pattern state changes stay within budget", () => {
    const scenarioIds = appPerformance.scenarios.map((scenario) => scenario.id);

    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(appPerformance.scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ interaction: "preview-render", stress: true }),
        expect.objectContaining({ interaction: "viewport-zoom-stress", stress: true }),
        expect.objectContaining({ interaction: "export-copy" }),
      ]),
    );
    expect(appPerformance.workloadTargets).toContain("pattern.baseGrid.rows");
    expect(appPerformance.workloadTargets).toContain("pattern.sources");
  });
});
