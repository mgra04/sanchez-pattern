export type ShapeCategory = "base" | "complex";

export type ShapeFrameKind =
  | "square"
  | "equilateral-full"
  | "equilateral-half";

export type ShapeVariantAxis = "form" | "weight";

export type ShapeParameterValue = number | readonly number[] | string;

export type ShapeParameterDefinition = {
  id: string;
  kind: "number" | "number-list" | "token";
  label: string;
  unit?: "px";
};

export type ShapeVariantProfile = {
  id: string;
  label: string;
  parameters: Readonly<Record<string, ShapeParameterValue>>;
};

export type ShapeOpacityUnits =
  | { count: 1; mode: "whole-svg" }
  | { count: number; mode: "separate-elements" };

export type ShapeViewBox = {
  height: number;
  minX: number;
  minY: number;
  width: number;
};

export type ShapeTileRole = "triangle-full" | "triangle-half";

export type ShapeTileMetadata = {
  canonicalOrientation: "up";
  canonicalTransform?: {
    mirrorX?: boolean;
    mirrorY?: boolean;
  };
  profileId: string;
  role: ShapeTileRole;
  setDisplayName: string;
  setId: string;
  sideLength: number;
};

export type ShapeVariant = {
  axis: ShapeVariantAxis;
  axisValue: string;
  fileName: string;
  id: string;
  nominalThicknessPx?: number;
  opacityUnits: ShapeOpacityUnits;
  parameters?: Readonly<Record<string, ShapeParameterValue>>;
  profileId?: string;
  radiusPx: number;
  svgBody: string;
};

export type ShapeFamily = {
  category: ShapeCategory;
  defaultVariantId: string;
  displayName: string;
  frame: { height: number; width: number };
  frameKind: ShapeFrameKind;
  id: string;
  tile?: ShapeTileMetadata;
  variants: readonly ShapeVariant[];
  viewBox: ShapeViewBox;
};

export type ShapeCollectionMemberRef = {
  category: ShapeCategory;
  familyId: string;
};

export type ShapeCollectionCoverRef = ShapeCollectionMemberRef & {
  variantId?: string;
};

export type ShapeCollection = {
  cover: ShapeCollectionCoverRef;
  description: string;
  displayName: string;
  id: string;
  members: readonly ShapeCollectionMemberRef[];
  parameterDefinitions: readonly ShapeParameterDefinition[];
  profileCoverage: "complete" | "sparse";
  schemaVersion: 1 | 2;
  tags: readonly string[];
  variantProfiles: readonly ShapeVariantProfile[];
};

export type StoredShapeFamily = ShapeFamily & {
  storage: "indexeddb";
};

export const shapeWeightOrder = [
  "extra-light",
  "light",
  "semi-light",
  "base",
  "semi-bold",
  "bold",
  "extra-bold",
] as const;

export type ShapeWeightId = (typeof shapeWeightOrder)[number];

export function getShapeWeightLabel(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
