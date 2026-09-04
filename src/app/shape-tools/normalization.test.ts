import { describe, expect, it } from "vitest";

import {
  formatCanonicalNumber,
  normalizeTriangleSvg,
  ShapeNormalizationError,
} from "./normalization";

const full = `<svg width="24" height="21" viewBox="0 0 24 21" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M10.7285 15.7881L13.6133 20.7842H0L1.44141 18.2881H5.20605L3.7627 15.7871L10.7285 15.7881Z" fill="black"/>
</svg>`;
const half = `<svg width="12" height="21" viewBox="0 0 12 21" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 13.7861H9V11.1943L7.50391 13.7861H4.04004L12 0V13.7861Z" fill="black"/>
</svg>`;

describe("triangle SVG normalization", () => {
  it("detects Full and Half rounded Figma exports", () => {
    const normalizedFull = normalizeTriangleSvg({ fileName: "full.svg", mode: "auto", source: full });
    const normalizedHalf = normalizeTriangleSvg({ fileName: "half.svg", mode: "auto", source: half });

    expect(normalizedFull.role).toBe("equilateral-full");
    expect(normalizedFull.targetViewport.width).toBe(24);
    expect(normalizedHalf.role).toBe("equilateral-half");
    expect(normalizedHalf.targetViewport.width).toBe(12);
    expect(normalizedFull.targetViewport.height).toBeCloseTo(24 * Math.sqrt(3) / 2, 10);
    expect(normalizedHalf.targetViewport.height).toBeCloseTo(24 * Math.sqrt(3) / 2, 10);
  });

  it("rewrites only root viewport bytes and preserves intentional inset geometry", () => {
    const result = normalizeTriangleSvg({ fileName: "inset.svg", mode: "full", sideLength: 24, source: full });
    expect(result.geometryUnchanged).toBe(true);
    expect(result.normalizedBody).toBe(result.originalBody);
    expect(result.normalizedSource).toContain('height="20.7846096908"');
    expect(result.normalizedSource).toContain('viewBox="0 0 24 20.7846096908"');
    expect(result.normalizedSource).toContain("M10.7285 15.7881");
    expect(result.outputFileName).toBe("inset-normalized.svg");
  });

  it("is idempotent for canonical viewports", () => {
    const first = normalizeTriangleSvg({ fileName: "full.svg", mode: "auto", source: full });
    const second = normalizeTriangleSvg({ fileName: first.outputFileName, mode: "auto", source: first.normalizedSource });
    expect(second.alreadyNormalized).toBe(true);
    expect(second.normalizedSource).toBe(first.normalizedSource);
  });

  it("rejects unsafe, incompatible, and ambiguous input", () => {
    expect(() => normalizeTriangleSvg({
      fileName: "unsafe.svg",
      mode: "auto",
      source: '<svg width="24" height="21" viewBox="0 0 24 21"><script/></svg>',
    })).toThrow(/unsafe|unsupported/i);
    expect(() => normalizeTriangleSvg({ fileName: "full.svg", mode: "half", sideLength: 24, source: full })).toThrow(/does not match/);
    expect(() => normalizeTriangleSvg({
      fileName: "other.svg",
      mode: "auto",
      source: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M0 0H20V20Z"/></svg>',
    })).toThrow(ShapeNormalizationError);
  });

  it("formats deterministic canonical numbers", () => {
    expect(formatCanonicalNumber(24)).toBe("24");
    expect(formatCanonicalNumber(24 * Math.sqrt(3) / 2)).toBe("20.7846096908");
  });
});
