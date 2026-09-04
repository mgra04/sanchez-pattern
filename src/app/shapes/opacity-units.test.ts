import { describe, expect, it } from "vitest";

import {
  annotateTopLevelDrawableOpacityUnits,
  applyOpacitySignatureToSvgBody,
  getShapeOpacityUnitIds,
  validateShapeOpacityUnits,
} from "./opacity-units";

describe("shape opacity units", () => {
  it("annotates drawable nodes in document order", () => {
    const result = annotateTopLevelDrawableOpacityUnits(
      '<svg><path d="M0 0"/><rect width="1" height="1"/></svg>',
    );
    expect(result.count).toBe(2);
    expect(getShapeOpacityUnitIds(result.source)).toEqual([1, 2]);
  });

  it("validates contiguous indices and manifest count", () => {
    const body = '<path data-shape-opacity-unit="1"/><path data-shape-opacity-unit="2"/>';
    expect(validateShapeOpacityUnits(body, { count: 2, mode: "separate-elements" })).toEqual({
      count: 2,
      mode: "separate-elements",
    });
    expect(() => validateShapeOpacityUnits(body, { count: 3, mode: "separate-elements" }))
      .toThrow(/declares 3 units/);
    expect(() => getShapeOpacityUnitIds('<path data-shape-opacity-unit="2"/>'))
      .toThrow(/contiguous/);
  });

  it("adds explicit opacity without breaking self-closing geometry", () => {
    const body = '<path data-shape-opacity-unit="1" d="M0 0"/><path data-shape-opacity-unit="2" d="M1 1"/>';
    const styled = applyOpacitySignatureToSvgBody(body, [0.25, 0.75]);
    expect(styled).toContain('opacity="0.25"/>');
    expect(styled).toContain('opacity="0.75"/>');
  });

  it("multiplies generated opacity with an element's existing opacity", () => {
    expect(
      applyOpacitySignatureToSvgBody(
        '<path opacity="0.5" data-shape-opacity-unit="1" d="M0 0h1v1z"/>',
        [0.5],
      ),
    ).toContain('opacity="0.25"');
  });
});
