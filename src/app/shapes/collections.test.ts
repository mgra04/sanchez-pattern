import { describe, expect, it } from "vitest";

import {
  getShapeCollectionMatch,
  getTopLevelShapeFamilies,
  parseShapeCollectionManifest,
} from "./collections";
import type { ShapeFamily } from "./types";

function family(
  id: string,
  category: ShapeFamily["category"],
  frameKind: ShapeFamily["frameKind"],
): ShapeFamily {
  return {
    category,
    defaultVariantId: "form-filled__radius-0",
    displayName: id,
    frame: { height: 24, width: 24 },
    frameKind,
    id,
    variants: [{
      axis: "form",
      axisValue: "filled",
      fileName: "form-filled__radius-0.svg",
      id: "form-filled__radius-0",
      opacityUnits: { count: 1, mode: "whole-svg" },
      radiusPx: 0,
      svgBody: '<path d="M0 0H24V24H0Z"/>',
    }],
    viewBox: { height: 24, minX: 0, minY: 0, width: 24 },
  };
}

const families = [
  family("square-a", "base", "square"),
  family("full-a", "base", "equilateral-full"),
  family("half-a", "complex", "equilateral-half"),
];

const manifest = {
  cover: { category: "base", familyId: "square-a", variantId: "form-filled__radius-0" },
  description: "Mixed members.",
  displayName: "Mixed",
  id: "mixed",
  members: [
    { category: "base", familyId: "square-a" },
    { category: "base", familyId: "full-a" },
    { category: "complex", familyId: "half-a" },
  ],
  schemaVersion: 1,
  tags: ["mixed"],
};

describe("shape collections", () => {
  it("validates mixed collections and falls back to a matching cover", () => {
    const collection = parseShapeCollectionManifest(manifest, families, "fixture");
    const match = getShapeCollectionMatch(
      collection,
      families,
      "base",
      "equilateral-full",
    );

    expect(match?.matchingFamilies.map((entry) => entry.id)).toEqual(["full-a"]);
    expect(match?.coverFamily.id).toBe("full-a");
    expect(match?.totalCount).toBe(3);
  });

  it("suppresses only matching members represented by visible collections", () => {
    const collection = parseShapeCollectionManifest(manifest, families, "fixture");
    const match = getShapeCollectionMatch(collection, families, "base", "square");
    expect(match).not.toBeNull();
    expect(getTopLevelShapeFamilies(families, [match!], "base", "square")).toEqual([]);
    expect(getTopLevelShapeFamilies(families, [], "base", "equilateral-full").map((entry) => entry.id)).toEqual(["full-a"]);
  });

  it("rejects missing, duplicate, and invalid cover references", () => {
    expect(() =>
      parseShapeCollectionManifest(
        { ...manifest, members: [{ category: "base", familyId: "missing" }] },
        families,
        "fixture",
      ),
    ).toThrow(/missing family base\/missing/);
    expect(() =>
      parseShapeCollectionManifest(
        { ...manifest, members: [manifest.members[0], manifest.members[0]] },
        families,
        "fixture",
      ),
    ).toThrow(/duplicate base\/square-a/);
    expect(() =>
      parseShapeCollectionManifest(
        { ...manifest, cover: { category: "base", familyId: "full-a", variantId: "missing" } },
        families,
        "fixture",
      ),
    ).toThrow(/missing variant/);
  });
});
