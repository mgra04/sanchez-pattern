import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createPatternSource } from "../pattern-model";
import { PatternSourcePreview, ShapePreview } from "./shape-preview";

function createDiamondSource() {
  return {
    ...createPatternSource({
      axis: "weight",
      axisValue: "base",
      category: "base" as const,
      familyId: "diamond",
      familyName: "Diamond",
      radiusPx: 0,
      svgBody:
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M24 12L12 24L0 12L12 0L24 12ZM9 12L12 15L15 12L12 9L9 12Z"/>',
      variantId: "weight-base__radius-0",
    }),
    color: "#123456",
    opacity: 75,
    rotation: 45,
    scale: 50,
  };
}

describe("PatternSourcePreview", () => {
  it("paints source geometry directly without a clip-path indirection", () => {
    const markup = renderToStaticMarkup(<PatternSourcePreview source={createDiamondSource()} />);

    expect(markup).toContain('data-pattern-source-geometry="true"');
    expect(markup).toContain('fill="#123456"');
    expect(markup).toContain('opacity="0.75"');
    expect(markup).toContain("rotate(45) scale(0.5)");
    expect(markup).toContain("<path");
    expect(markup).not.toContain("<clipPath");
    expect(markup).not.toContain("clip-path=");
  });

  it("applies a locally scoped gradient directly to source geometry", () => {
    const source = {
      ...createDiamondSource(),
      fillMode: "gradient" as const,
    };
    const markup = renderToStaticMarkup(<PatternSourcePreview source={source} />);
    const gradientId = markup.match(/<linearGradient[^>]*id="([^"]+)"/)?.[1];

    expect(gradientId).toBeTruthy();
    expect(markup).toContain(`fill="url(#${gradientId})"`);
    expect(markup).not.toContain("<clipPath");
  });

  it("applies the selected paint to sanitized stroke-only geometry", () => {
    const svgBody = '<path data-shape-paint="stroke" fill="none" d="M2 2L22 22" stroke-width="1.5"/>';
    const libraryMarkup = renderToStaticMarkup(<ShapePreview svgBody={svgBody} />);
    const source = {
      ...createDiamondSource(),
      svgBody,
    };
    const sourceMarkup = renderToStaticMarkup(<PatternSourcePreview source={source} />);

    expect(libraryMarkup).toContain('fill="currentColor"');
    expect(libraryMarkup).toContain('stroke="currentColor"');
    expect(sourceMarkup).toContain('fill="#123456"');
    expect(sourceMarkup).toContain('stroke="#123456"');
    expect(sourceMarkup).toContain('fill="none"');
  });
});
