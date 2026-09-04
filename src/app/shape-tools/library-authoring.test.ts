import { describe, expect, it } from "vitest";

import { annotateTopLevelDrawableOpacityUnits } from "../shapes/opacity-units";
import { defaultShapeToolsLibraryForm } from "./shape-tools-model";
import { validateShapeToolsLibraryForm } from "./library-authoring";

describe("Shape Tools local library authoring", () => {
  it("validates local shape package metadata and annotates automatic opacity units", () => {
    expect(validateShapeToolsLibraryForm({
      ...defaultShapeToolsLibraryForm,
      collectionDisplayName: "Equilateral Triangle Glyphs",
      collectionId: "equilateral-triangle-glyphs-local",
      displayName: "Glyph 01",
      familyId: "equilateral-triangle-glyph-01-local",
      mainInnerGap: "1.5",
      opacityMode: "separate-elements",
      profileId: "profile-b",
      profileLabel: "Profile B",
      thicknesses: "1.5, 2",
      variantId: "profile-b",
    }, true)).toEqual({});
    expect(annotateTopLevelDrawableOpacityUnits(
      '<svg><path d="M0 0"/><path d="M1 1"/><path d="M2 2"/><path d="M3 3"/></svg>',
    )).toMatchObject({ count: 4 });
  });

  it("reports invalid identifiers, missing profile destination, and invalid numbers", () => {
    expect(validateShapeToolsLibraryForm({
      ...defaultShapeToolsLibraryForm,
      displayName: "Glyph",
      familyId: "Glyph 01",
      mainInnerGap: "-1",
      profileId: "profile-a",
      profileLabel: "Profile A",
      thicknesses: "1, nope",
      variantId: "Profile A",
    }, false)).toMatchObject({
      familyId: expect.any(String),
      mainInnerGap: expect.any(String),
      profileId: expect.any(String),
      source: expect.any(String),
      thicknesses: expect.any(String),
      variantId: expect.any(String),
    });
  });
});
