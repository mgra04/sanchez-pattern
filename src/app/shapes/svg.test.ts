import { describe, expect, it } from "vitest";
import { hasShapeStrokePaint, sanitizeShapeSvg } from "./svg";

describe("shape SVG sanitization", () => {
  it("retains positive decimal rectangular viewBoxes", () => {
    const result = sanitizeShapeSvg(
      '<svg width="12.5" height="20.75" viewBox="0 0 12.5 20.75"><path d="M0 0H12.5V20.75Z"/></svg>',
    );
    expect(result.width).toBe(12.5);
    expect(result.height).toBe(20.75);
    expect(result.viewBox).toEqual({ height: 20.75, minX: 0, minY: 0, width: 12.5 });
  });

  it("accepts the rounded Figma triangle frame without changing path coordinates", () => {
    const result = sanitizeShapeSvg(
      '<svg width="24" height="21" viewBox="0 0 24 21"><path d="M12 0L24 20.7846H0Z"/></svg>',
    );
    expect(result.body).toContain("20.7846");
    expect(result.viewBox.height).toBe(21);
  });

  it("rejects unsafe, zero, and mismatched dimensions", () => {
    expect(() => sanitizeShapeSvg('<svg width="0" height="24" viewBox="0 0 0 24"><path d=""/></svg>')).toThrow();
    expect(() => sanitizeShapeSvg('<svg width="24" height="24" viewBox="0 0 12 24"><path d=""/></svg>')).toThrow();
    expect(() => sanitizeShapeSvg('<svg width="24" height="24" viewBox="0 0 24 24"><script/></svg>')).toThrow();
  });

  it("preserves safe monochrome stroke-only geometry as dynamic paint", () => {
    const result = sanitizeShapeSvg(
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 2L22 22" stroke="black" stroke-width="1.5"/><path d="M22 2L2 22" stroke="#000" stroke-linecap="round"/></svg>',
    );

    expect(hasShapeStrokePaint(result.body)).toBe(true);
    expect(result.body.match(/data-shape-paint="stroke"/g)).toHaveLength(2);
    expect(result.body.match(/fill="none"/g)).toHaveLength(2);
    expect(result.body).toContain('stroke-width="1.5"');
    expect(result.body).not.toMatch(/stroke=(?:"|')(?:black|#000)/i);
  });

  it("rejects mixed fill and stroke bodies without explicit paint roles", () => {
    expect(() => sanitizeShapeSvg(
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 2L22 22" stroke="black"/><path d="M4 4H20V20Z" fill="black"/></svg>',
    )).toThrow(/Mixed fill and stroke/);
  });
});
