import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { createDefaultMosaicSettings, createPatternSource } from "./pattern-model";
import { createPatternSvgMarkup, PatternSvgDocument } from "./pattern-svg";

function readAttribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

function getTriangleHalfGroups(markup: string): Array<{ inner: string; outer: string }> {
  const groups: Array<{ inner: string; outer: string }> = [];
  const marker = 'data-pattern-role="triangle-half"';
  let searchFrom = 0;
  while (true) {
    const markerIndex = markup.indexOf(marker, searchFrom);
    if (markerIndex < 0) break;
    const outerStart = markup.lastIndexOf("<g", markerIndex);
    const outerEnd = markup.indexOf(">", markerIndex) + 1;
    const innerStart = markup.indexOf("<g", outerEnd);
    const innerEnd = markup.indexOf(">", innerStart) + 1;
    groups.push({
      inner: markup.slice(innerStart, innerEnd),
      outer: markup.slice(outerStart, outerEnd),
    });
    searchFrom = outerEnd;
  }
  return groups;
}

describe("portable pattern SVG export", () => {
  it("exports deterministic per-element opacity from annotated composite shapes", () => {
    const source = {
      ...createPatternSource({
        axis: "form",
        axisValue: "glyph",
        category: "complex",
        familyId: "glyph",
        familyName: "Glyph",
        opacityUnits: { count: 3, mode: "separate-elements" },
        radiusPx: 0,
        svgBody: '<path data-shape-opacity-unit="1" d="M0 0H8V8Z"/><path data-shape-opacity-unit="2" d="M8 8H16V16Z"/><path data-shape-opacity-unit="3" d="M16 16H24V24Z"/>',
        variantId: "profile-a",
      }),
      id: "glyph-source",
    };
    const params = {
      background: "#FFFFFF",
      canvasHeight: 24,
      canvasWidth: 49,
      includeBackground: false,
      snapshot: {
        appearance: {
          opacityDistribution: {
            enabled: true,
            mode: "each-element" as const,
            seed: 31,
            variants: [
              { chance: 50, id: "low", opacity: 25 },
              { chance: 50, id: "high", opacity: 100 },
            ],
          },
        },
        grid: { autoFit: true, columns: 2, distribution: "equal" as const, gap: 1, rows: 1, seed: 42 },
        method: "base-grid" as const,
        sources: [source],
      },
    };
    const markup = createPatternSvgMarkup(params);
    expect(markup).toBe(createPatternSvgMarkup(params));
    expect(markup).toContain('data-shape-opacity-unit="1"');
    expect(markup).toMatch(/opacity="(?:0\.25|1)"/);
    expect(markup).not.toContain("<use");
  });

  it("expands direct geometry without clip paths or use references", () => {
    const source = {
      ...createPatternSource({
        axis: "weight",
        axisValue: "base",
        category: "base",
        familyId: "square",
        familyName: "Square",
        radiusPx: 0,
        svgBody: '<path d="M0 0H24V24H0Z"/>',
        variantId: "weight-base__radius-0",
      }),
      color: "#FF3366",
      id: "square-source",
    };
    const markup = createPatternSvgMarkup({
      background: "#334455",
      canvasHeight: 24,
      canvasWidth: 49,
      includeBackground: true,
      snapshot: {
        grid: { autoFit: true, columns: 2, distribution: "equal", gap: 1, rows: 1, seed: 42 },
        method: "base-grid",
        sources: [source],
      },
    });

    expect(markup).not.toContain("<use");
    expect(markup).not.toContain("clip-path=");
    expect(markup.match(/<path/g)).toHaveLength(3);
    expect(markup).toContain('fill="#FF3366"');
    expect(markup).toContain('fill="#334455"');
  });

  it("exports stroke-only icon geometry with the selected dynamic paint", () => {
    const source = {
      ...createPatternSource({
        axis: "form",
        axisValue: "outline",
        category: "base",
        familyId: "travel-cloud-2",
        familyName: "Cloud 2",
        radiusPx: 0,
        svgBody: '<path data-shape-paint="stroke" fill="none" d="M2 12H22" stroke-width="1.5"/>',
        variantId: "form-outline__radius-0",
      }),
      color: "#2468AC",
      id: "travel-cloud-source",
    };
    const markup = createPatternSvgMarkup({
      background: "#FFFFFF",
      canvasHeight: 24,
      canvasWidth: 24,
      includeBackground: false,
      snapshot: {
        grid: { autoFit: true, columns: 1, distribution: "equal", gap: 0, rows: 1, seed: 42 },
        method: "base-grid",
        sources: [source],
      },
    });

    expect(markup).toContain('data-pattern-source="travel-cloud-source"');
    expect(markup).toContain('fill="#2468AC"');
    expect(markup).toContain('stroke="#2468AC"');
    expect(markup).toContain('data-shape-paint="stroke"');
    expect(markup).toContain('fill="none"');
    expect(markup).not.toContain("<use");
  });

  it("exports deterministic Transition Spread observability with final phase ownership", () => {
    const first = {
      ...createPatternSource({
        axis: "weight",
        axisValue: "base",
        category: "base",
        familyId: "first",
        familyName: "First",
        radiusPx: 0,
        svgBody: '<circle cx="12" cy="12" r="5"/>',
        variantId: "weight-base__radius-0",
      }),
      id: "first-source",
    };
    const second = { ...first, familyId: "second", id: "second-source", name: "Second" };
    const snapshot = {
      directional: {
        angle: 0,
        phases: [
          {
            distribution: "equal" as const,
            id: "first-phase",
            name: "First phase",
            share: 50,
            sourceIds: [first.id],
            transitionToNext: {
              direction: "previous" as const,
              enabled: true,
              maxWidthPercent: 25,
              strength: 100,
            },
          },
          {
            distribution: "equal" as const,
            id: "second-phase",
            name: "Second phase",
            share: 50,
            sourceIds: [second.id],
            transitionToNext: {
              direction: "previous" as const,
              enabled: false,
              maxWidthPercent: 12.5,
              strength: 100,
            },
          },
        ],
      },
      grid: { autoFit: true, columns: 16, gap: 1, rows: 8, seed: 42 },
      method: "directional-phases" as const,
      sources: [first, second],
    };
    const params = {
      background: "#FFFFFF",
      canvasHeight: 199,
      canvasWidth: 399,
      includeBackground: false,
      snapshot,
    };
    const firstMarkup = createPatternSvgMarkup(params);
    const repeatedMarkup = createPatternSvgMarkup(params);

    expect(firstMarkup).toBe(repeatedMarkup);
    expect(firstMarkup).toContain('data-pattern-baseline-phase="first-phase"');
    expect(firstMarkup).toContain('data-pattern-phase="second-phase"');
    expect(firstMarkup).toContain('data-pattern-spread-boundary="first-phase--second-phase"');
  });

  it("exports Mosaic levels with their derived frame transforms", () => {
    const source = {
      ...createPatternSource({
        axis: "weight",
        axisValue: "base",
        category: "base",
        familyId: "square",
        familyName: "Square",
        radiusPx: 0,
        svgBody: '<path d="M0 0H24V24H0Z"/>',
        variantId: "weight-base__radius-0",
      }),
      id: "mosaic-source",
    };
    const snapshot = {
      grid: { autoFit: true, columns: 16, gap: 1, rows: 8, seed: 42 },
      method: "multi-size-mosaic" as const,
      mosaic: createDefaultMosaicSettings(source.id),
      sources: [source],
    };
    const markup = createPatternSvgMarkup({
      background: "#FFFFFF",
      canvasHeight: 199,
      canvasWidth: 399,
      includeBackground: false,
      snapshot,
    });

    expect(markup).toContain('data-pattern-level="mosaic-level-1"');
    expect(markup).toContain('data-pattern-level="mosaic-level-2"');
    expect(markup).toContain('data-pattern-level="mosaic-level-3"');
    expect(markup).toContain('data-pattern-span="4"');
    expect(markup).toContain("scale(4.125 4.125)");
  });

  it("exports clipped Triangle slots with subpixel geometry", () => {
    const height = 24 * Math.sqrt(3) / 2;
    const makeSource = (role: "triangle-full" | "triangle-half", id: string) => ({
      ...createPatternSource({
        axis: "form" as const,
        axisValue: "filled",
        category: "base" as const,
        familyId: id,
        familyName: id,
        frame: { height, width: role === "triangle-full" ? 24 : 12 },
        radiusPx: 0,
        svgBody: role === "triangle-full"
          ? `<path d="M12 0L24 ${height}H0Z"/>`
          : `<path d="M0 0H12L0 ${height}Z"/>`,
        tile: {
          canonicalOrientation: "up" as const,
          profileId: "equilateral-24",
          role,
          setDisplayName: "Test",
          setId: "test",
          sideLength: 24,
        },
        variantId: "form-filled__radius-0",
        viewBox: { height, minX: 0, minY: 0, width: role === "triangle-full" ? 24 : 12 },
      }),
      id,
    });
    const full = makeSource("triangle-full", "full");
    const half = makeSource("triangle-half", "half");
    const markup = createPatternSvgMarkup({
      background: "#FFFFFF",
      canvasHeight: height,
      canvasWidth: 39.4641016151,
      includeBackground: false,
      snapshot: {
        grid: { autoFit: true, columns: 1, gap: 1, rows: 1, seed: 42 },
        method: "triangle-lattice",
        sources: [full, half],
        triangle: {
          alternateColumns: false,
          alternateElementsInRow: false,
          alternateRows: false,
          fullPool: { distribution: "equal", sourceIds: [full.id] },
          fullTriangles: 2,
          halfPool: { distribution: "equal", sourceIds: [half.id] },
          innerGap: 1,
          startMirrorX: false,
          startMirrorY: false,
        },
      },
    });
    expect(markup).toContain('data-pattern-role="triangle-full"');
    expect(markup).toContain('data-pattern-role="triangle-half"');
    expect(markup).toContain('clip-path="url(#pattern-clip-triangle-full)"');
    expect(markup).toContain('clipPathUnits="userSpaceOnUse"');
    expect(markup).not.toContain('clipPathUnits="objectBoundingBox"');
    expect(markup).toContain(
      `<polygon points="0,${height} 12,0 24,${height}"></polygon>`,
    );
    expect(markup).toContain(
      `<polygon points="0,0 12,0 0,${height}"></polygon>`,
    );
    expect(markup).toContain("20.784609690826528");
  });

  it("keeps logical slot mirrors outside fixed clipping and canonical mirrors inside", () => {
    const height = 24 * Math.sqrt(3) / 2;
    const full = {
      ...createPatternSource({
        axis: "form" as const,
        axisValue: "filled",
        category: "base" as const,
        familyId: "full",
        familyName: "Full",
        frame: { height, width: 24 },
        radiusPx: 0,
        svgBody: `<path d="M12 0L24 ${height}H0Z"/>`,
        tile: {
          canonicalOrientation: "up" as const,
          profileId: "equilateral-24",
          role: "triangle-full" as const,
          setDisplayName: "Test",
          setId: "test",
          sideLength: 24,
        },
        variantId: "filled",
        viewBox: { height, minX: 0, minY: 0, width: 24 },
      }),
      id: "full",
    };
    const half = {
      ...createPatternSource({
        axis: "form" as const,
        axisValue: "glyph",
        category: "complex" as const,
        familyId: "drafting-half",
        familyName: "Drafting Half",
        frame: { height, width: 12 },
        radiusPx: 0,
        svgBody: `<path d="M0 0V${height}H12Z"/>`,
        tile: {
          canonicalOrientation: "up" as const,
          canonicalTransform: { mirrorY: true },
          profileId: "equilateral-24",
          role: "triangle-half" as const,
          setDisplayName: "Test",
          setId: "test",
          sideLength: 24,
        },
        variantId: "glyph",
        viewBox: { height, minX: 0, minY: 0, width: 12 },
      }),
      id: "drafting-half",
    };
    const snapshot = {
      grid: { autoFit: true, columns: 2, gap: 0, rows: 2, seed: 42 },
      method: "triangle-lattice" as const,
      sources: [full, half],
      triangle: {
        alternateColumns: true,
        alternateElementsInRow: false,
        alternateRows: true,
        fullPool: { distribution: "equal" as const, sourceIds: [full.id] },
        fullTriangles: 2,
        halfPool: { distribution: "equal" as const, sourceIds: [half.id] },
        innerGap: 0,
        startMirrorX: false,
        startMirrorY: false,
      },
    };

    const renderParams = {
      background: "#FFFFFF",
      canvasHeight: height * 2,
      canvasWidth: 72,
      includeBackground: false,
      snapshot,
    };
    const markups = [
      renderToStaticMarkup(
        <PatternSvgDocument {...renderParams} portableInstances={false} />,
      ),
      createPatternSvgMarkup({
        background: "#FFFFFF",
        canvasHeight: height * 2,
        canvasWidth: 72,
        includeBackground: false,
        snapshot,
      }),
    ];

    for (const markup of markups) {
      const halfGroups = getTriangleHalfGroups(markup);
      expect(halfGroups).toHaveLength(8);
      const logicalCombinations = new Set<string>();
      for (const { inner, outer } of halfGroups) {
        const slotMirrorX = readAttribute(outer, "data-pattern-mirror-x") === "true";
        const slotMirrorY = readAttribute(outer, "data-pattern-mirror-y") === "true";
        const effectiveMirrorX = readAttribute(outer, "data-pattern-effective-mirror-x") === "true";
        const effectiveMirrorY = readAttribute(outer, "data-pattern-effective-mirror-y") === "true";
        const outerTransform = readAttribute(outer, "transform") ?? "";
        logicalCombinations.add(`${slotMirrorX}/${slotMirrorY}`);

        expect(outerTransform.includes("scale(-1 1)")).toBe(slotMirrorX);
        expect(outerTransform.includes("scale(1 -1)")).toBe(slotMirrorY);
        expect(effectiveMirrorX).toBe(slotMirrorX);
        expect(effectiveMirrorY).toBe(!slotMirrorY);
        expect(readAttribute(inner, "data-pattern-canonical-mirror-x")).toBe("false");
        expect(readAttribute(inner, "data-pattern-canonical-mirror-y")).toBe("true");
        expect(readAttribute(inner, "data-pattern-canonical-source")).toBe("true");
        expect(readAttribute(inner, "transform")).toContain("scale(1 -1)");
      }
      expect(logicalCombinations).toEqual(
        new Set(["false/false", "false/true", "true/false", "true/true"]),
      );
      expect(markup).toContain('clipPathUnits="userSpaceOnUse"');
      expect(markup).not.toContain('clipPathUnits="objectBoundingBox"');
    }
  });
});
