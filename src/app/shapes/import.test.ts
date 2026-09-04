import { describe, expect, it } from "vitest";

import {
  defaultShapeImportForm,
  parseVariantMetadataFromFileName,
  validateShapeImportForm,
} from "./import";

describe("shape import metadata", () => {
  it("prefills metadata only for the optional filename convention", () => {
    expect(parseVariantMetadataFromFileName("weight-extra-bold__radius-4.svg")).toEqual({
      radiusPx: "4",
      variantName: "extra-bold",
      variantType: "weight",
    });
    expect(parseVariantMetadataFromFileName("my arbitrary diamond.svg")).toBeNull();
  });

  it("validates explicit variant tokens and corner radius", () => {
    const errors = validateShapeImportForm(
      {
        ...defaultShapeImportForm,
        displayName: "Diamond",
        familyId: "Diamond family",
        radiusPx: "2.5",
        variantName: "very bold!",
      },
      true,
    );

    expect(errors.familyId).toMatch(/kebab-case/);
    expect(errors.variantName).toBeTruthy();
    expect(errors.radiusPx).toMatch(/whole number/);
  });

  it("accepts documented weight names and arbitrary kebab-case form names", () => {
    expect(
      validateShapeImportForm(
        { ...defaultShapeImportForm, displayName: "Square", familyId: "square", variantName: "extra-bold" },
        true,
      ),
    ).toEqual({});
    expect(
      validateShapeImportForm(
        {
          ...defaultShapeImportForm,
          displayName: "Corner",
          familyId: "corner",
          variantName: "open-top-left",
          variantType: "form",
        },
        true,
      ),
    ).toEqual({});
  });

  it("requires coordinated Shape Set metadata for new Triangle members", () => {
    const errors = validateShapeImportForm(
      {
        ...defaultShapeImportForm,
        displayName: "Triangle Full",
        familyId: "triangle-full",
        geometryMode: "triangle-full",
        setDisplayName: "",
        setId: "",
        sideLength: "0",
      },
      true,
    );
    expect(errors.setId).toBeTruthy();
    expect(errors.setDisplayName).toBeTruthy();
    expect(errors.sideLength).toBeTruthy();
  });
});
