import { describe, expect, it } from "vitest";

import {
  getCollectionVariantForProfile,
  getShapeVariantParameters,
  validateShapeCollectionProfileCoverage,
  validateShapeVariantProfiles,
} from "./profiles";
import type { ShapeCollection, ShapeFamily } from "./types";

const family: ShapeFamily = {
  category: "complex",
  defaultVariantId: "profile-a",
  displayName: "Glyph",
  frame: { height: 20.7846096908, width: 24 },
  frameKind: "equilateral-full",
  id: "glyph",
  variants: ["a", "b"].map((profileId) => ({
    axis: "form",
    axisValue: "glyph",
    fileName: `${profileId}.svg`,
    id: `profile-${profileId}`,
    opacityUnits: { count: 2, mode: "separate-elements" },
    profileId,
    radiusPx: 0,
    svgBody: '<path data-shape-opacity-unit="1"/><path data-shape-opacity-unit="2"/>',
  })),
  viewBox: { height: 20.7846096908, minX: 0, minY: 0, width: 24 },
};

const collection: ShapeCollection = {
  cover: { category: "complex", familyId: "glyph" },
  description: "Glyphs",
  displayName: "Glyphs",
  id: "glyphs",
  members: [{ category: "complex", familyId: "glyph" }],
  parameterDefinitions: [{ id: "gap", kind: "number", label: "Gap", unit: "px" }],
  profileCoverage: "complete",
  schemaVersion: 2,
  tags: ["glyph"],
  variantProfiles: [
    { id: "a", label: "A", parameters: { gap: 2 } },
    { id: "b", label: "B", parameters: { gap: 1.5 } },
  ],
};

describe("shape variant profiles", () => {
  it("resolves a family variant and its shared parameters", () => {
    const variant = getCollectionVariantForProfile(collection, family, "b")!;
    expect(variant.id).toBe("profile-b");
    expect(getShapeVariantParameters(collection, variant)).toEqual({ gap: 1.5 });
  });

  it("validates typed profile values and complete coverage", () => {
    expect(() => validateShapeVariantProfiles({
      definitions: collection.parameterDefinitions,
      profiles: collection.variantProfiles,
      source: "fixture",
    })).not.toThrow();
    expect(() => validateShapeCollectionProfileCoverage(collection, [family], "fixture"))
      .not.toThrow();
    expect(() => validateShapeCollectionProfileCoverage(
      collection,
      [{ ...family, variants: family.variants.slice(0, 1) }],
      "fixture",
    )).toThrow(/missing profile b/);
  });
});
