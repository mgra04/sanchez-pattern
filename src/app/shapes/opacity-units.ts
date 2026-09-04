import type { ShapeOpacityUnits } from "./types";

const unitAttributePattern = /\sdata-shape-opacity-unit=["']([^"']+)["']/gi;
const drawableElementPattern = /<(path|rect|circle|ellipse|line|polygon|polyline)\b[^>]*>/gi;

function readUnitIds(svgBody: string): number[] {
  return [...svgBody.matchAll(unitAttributePattern)].map((match) => Number(match[1]));
}

export function getShapeOpacityUnitIds(svgBody: string): number[] {
  const unitIds = [...new Set(readUnitIds(svgBody))].sort((left, right) => left - right);
  if (unitIds.length === 0) return [];
  if (unitIds.some((unit) => !Number.isInteger(unit) || unit <= 0)) {
    throw new Error("Shape opacity unit indices must be positive integers.");
  }
  unitIds.forEach((unit, index) => {
    if (unit !== index + 1) {
      throw new Error("Shape opacity unit indices must form a contiguous sequence starting at 1.");
    }
  });
  return unitIds;
}

export function validateShapeOpacityUnits(
  svgBody: string,
  metadata: ShapeOpacityUnits | undefined,
): ShapeOpacityUnits {
  if (!metadata || metadata.mode === "whole-svg") {
    if (metadata && metadata.count !== 1) {
      throw new Error("Whole-SVG opacity metadata must declare exactly one unit.");
    }
    return { count: 1, mode: "whole-svg" };
  }

  if (!Number.isInteger(metadata.count) || metadata.count < 1) {
    throw new Error("Separate-element opacity metadata requires a positive unit count.");
  }
  const unitIds = getShapeOpacityUnitIds(svgBody);
  if (unitIds.length !== metadata.count) {
    throw new Error(
      `Shape opacity metadata declares ${metadata.count} units but SVG contains ${unitIds.length}.`,
    );
  }
  return { count: metadata.count, mode: "separate-elements" };
}

export function annotateTopLevelDrawableOpacityUnits(svgSource: string): {
  count: number;
  source: string;
} {
  let count = 0;
  const source = svgSource.replace(drawableElementPattern, (element) => {
    if (/\sdata-shape-opacity-unit=/i.test(element)) return element;
    count += 1;
    return element.replace(/\s*\/?>(?=[^>]*$)/, (ending) =>
      ` data-shape-opacity-unit="${count}"${ending}`,
    );
  });
  if (count === 0) {
    throw new Error("SVG does not contain drawable elements that can become opacity units.");
  }
  return { count, source };
}

export function applyOpacitySignatureToSvgBody(
  svgBody: string,
  signature: readonly number[],
): string {
  if (signature.length === 0) return svgBody;
  return svgBody.replace(
    /<(path|rect|circle|ellipse|line|polygon|polyline)\b([^>]*?)\sdata-shape-opacity-unit=["'](\d+)["']([^>]*)>/gi,
    (element, _name: string, _before: string, unitValue: string) => {
      const opacity = signature[Number(unitValue) - 1];
      if (opacity === undefined) return element;
      const existingOpacity = element.match(/\sopacity=["']([^"']*)["']/i)?.[1];
      const parsedExistingOpacity = existingOpacity === undefined ? 1 : Number(existingOpacity);
      const combinedOpacity = opacity * (
        Number.isFinite(parsedExistingOpacity) ? parsedExistingOpacity : 1
      );
      const withoutOpacity = element.replace(/\sopacity=["'][^"']*["']/gi, "");
      return withoutOpacity.replace(
        /\s*\/?>$/,
        (ending) => ` opacity="${Number(combinedOpacity.toFixed(6))}"${ending}`,
      );
    },
  );
}
