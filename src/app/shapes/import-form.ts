import type { ShapeCategory, ShapeVariantAxis } from "./types";

export type ShapeImportForm = {
  category: ShapeCategory;
  displayName: string;
  familyId: string;
  geometryMode: "standard" | "triangle-full" | "triangle-half";
  mode: "new" | "variant";
  radiusPx: string;
  variantName: string;
  variantType: ShapeVariantAxis;
  setDisplayName: string;
  setId: string;
  sideLength: string;
};

export const defaultShapeImportForm: ShapeImportForm = {
  category: "base",
  displayName: "",
  familyId: "",
  geometryMode: "standard",
  mode: "new",
  radiusPx: "0",
  variantName: "base",
  variantType: "weight",
  setDisplayName: "",
  setId: "",
  sideLength: "24",
};
