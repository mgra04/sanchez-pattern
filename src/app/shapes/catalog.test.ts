import { describe, expect, it } from "vitest";

import {
  builtInShapeCatalog,
  builtInShapeCollections,
  getBuiltInShapeFamily,
} from "./catalog";

describe("shape catalog", () => {
  it("discovers every supplied family and variant", () => {
    expect(builtInShapeCatalog).toHaveLength(56);
    expect(builtInShapeCatalog.flatMap((family) => family.variants)).toHaveLength(438);
  });

  it("keeps nominal thickness family-local", () => {
    const diamond = getBuiltInShapeFamily("base", "diamond");
    const square = getBuiltInShapeFamily("base", "square");

    expect(
      diamond?.variants.find(
        (variant) => variant.axisValue === "extra-light" && variant.radiusPx === 0,
      )?.nominalThicknessPx,
    ).toBe(1);
    expect(
      square?.variants.find(
        (variant) => variant.axisValue === "extra-light" && variant.radiusPx === 0,
      )?.nominalThicknessPx,
    ).toBe(2);
  });

  it("keeps legacy families square and discovers the coordinated Triangle Shape Set", () => {
    const standard = builtInShapeCatalog.filter((family) => !family.tile);
    expect(
      standard.every(
        (family) => family.frame.width === 24 && family.frame.height === 24,
      ),
    ).toBe(true);
    const tiles = builtInShapeCatalog.filter((family) => family.tile);
    expect(tiles.filter((family) => family.tile?.role === "triangle-full")).toHaveLength(16);
    expect(tiles.filter((family) => family.tile?.role === "triangle-half")).toHaveLength(14);
    expect(tiles.every((family) => family.tile?.profileId === "equilateral-24")).toBe(true);
    expect(tiles[0]?.frame.height).toBeCloseTo(24 * Math.sqrt(3) / 2, 8);
    expect(standard.every((family) => family.frameKind === "square")).toBe(true);
    expect(tiles.every((family) => family.frameKind.startsWith("equilateral-"))).toBe(true);
  });

  it("validates collection manifests against the built-in catalog", () => {
    expect(builtInShapeCollections).toHaveLength(4);
    expect(
      builtInShapeCollections.find((collection) => collection.id === "solid-triangles")?.members,
    ).toHaveLength(2);
    const glyphs = builtInShapeCollections.find(
      (collection) => collection.id === "equilateral-triangle-glyphs",
    );
    expect(glyphs?.members).toHaveLength(15);
    expect(glyphs?.variantProfiles).toHaveLength(3);
    expect(glyphs?.profileCoverage).toBe("complete");
    const draftingGlyphs = builtInShapeCollections.find(
      (collection) => collection.id === "drafting-triangle-glyphs",
    );
    expect(draftingGlyphs?.members).toHaveLength(13);
    expect(draftingGlyphs?.variantProfiles).toHaveLength(3);
    expect(draftingGlyphs?.profileCoverage).toBe("complete");
    const travelIcons = builtInShapeCollections.find(
      (collection) => collection.id === "travel-icon-set",
    );
    expect(travelIcons?.members).toHaveLength(11);
    expect(travelIcons?.cover).toEqual({
      category: "base",
      familyId: "travel-airplane",
      variantId: "form-outline__radius-0",
    });
  });

  it("loads the complete Travel Icon Set outline and filled matrix", () => {
    const travelIcons = builtInShapeCatalog.filter((family) =>
      family.id.startsWith("travel-"),
    );

    expect(travelIcons).toHaveLength(11);
    for (const family of travelIcons) {
      expect(family.category).toBe("base");
      expect(family.frameKind).toBe("square");
      expect(family.frame).toEqual({ height: 24, width: 24 });
      expect(family.viewBox).toEqual({ height: 24, minX: 0, minY: 0, width: 24 });
      expect(family.defaultVariantId).toBe("form-outline__radius-0");
      expect(family.variants.map((variant) => variant.id)).toEqual([
        "form-outline__radius-0",
        "form-filled__radius-0",
      ]);
      expect(family.variants.every((variant) =>
        variant.opacityUnits.mode === "whole-svg" && variant.opacityUnits.count === 1,
      )).toBe(true);
    }

    for (const familyId of ["travel-cloud-2", "travel-image-mountain"]) {
      const outline = getBuiltInShapeFamily("base", familyId)?.variants.find(
        (variant) => variant.id === "form-outline__radius-0",
      );
      expect(outline?.svgBody).toContain('data-shape-paint="stroke"');
      expect(outline?.svgBody).toContain('fill="none"');
    }
  });

  it("loads the complete 15 by 3 glyph matrix with audited opacity units", () => {
    const expectedUnits = [4, 3, 3, 4, 4, 2, 3, 3, 3, 3, 4, 6, 3, 3, 4];
    const glyphs = builtInShapeCatalog.filter((family) =>
      family.id.startsWith("equilateral-triangle-glyph-"),
    );
    expect(glyphs).toHaveLength(15);
    glyphs.forEach((family, index) => {
      expect(family.frame).toEqual({ height: 20.7846096908, width: 24 });
      expect(family.variants.map((variant) => variant.profileId)).toEqual(["a", "b", "c"]);
      expect(family.variants.every((variant) => !variant.fileName.includes("normalized"))).toBe(true);
      expect(family.variants.every((variant) =>
        variant.opacityUnits.mode === "separate-elements" &&
        variant.opacityUnits.count === expectedUnits[index],
      )).toBe(true);
    });
  });

  it("loads the complete 13 by 3 drafting glyph matrix with per-variant opacity units", () => {
    const expectedUnits = [
      [3, 3, 3],
      [3, 2, 3],
      [2, 2, 2],
      [3, 3, 3],
      [2, 2, 2],
      [4, 4, 4],
      [3, 3, 3],
      [2, 2, 2],
      [4, 4, 4],
      [3, 3, 3],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
    ];
    const glyphs = builtInShapeCatalog.filter((family) =>
      family.id.startsWith("drafting-triangle-glyph-"),
    );
    expect(glyphs).toHaveLength(13);
    glyphs.forEach((family, familyIndex) => {
      expect(family.frameKind).toBe("equilateral-half");
      expect(family.frame).toEqual({ height: 20.7846096908, width: 12 });
      expect(family.tile).toMatchObject({
        canonicalTransform: { mirrorY: true },
        profileId: "equilateral-24",
        role: "triangle-half",
        setId: "drafting-triangle-glyphs",
      });
      expect(family.variants.map((variant) => variant.profileId)).toEqual(["a", "b", "c"]);
      expect(family.variants.every((variant) => !variant.fileName.includes("normalized"))).toBe(true);
      expect(family.variants.map((variant) => variant.opacityUnits)).toEqual(
        expectedUnits[familyIndex]?.map((count) => ({ count, mode: "separate-elements" })),
      );
      family.variants.forEach((variant) => {
        const annotatedUnits = [...variant.svgBody.matchAll(/data-shape-opacity-unit="(\d+)"/g)]
          .map((match) => Number(match[1]));
        expect(annotatedUnits).toEqual(
          Array.from({ length: variant.opacityUnits.count }, (_, index) => index + 1),
        );
      });
    });
  });
});
