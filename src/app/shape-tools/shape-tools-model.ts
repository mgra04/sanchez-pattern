import type { ToolcraftState } from "@/toolcraft/runtime";

import { decodeSvgDataUrl } from "../shapes/svg";
import {
  normalizeTriangleSvg,
  type ShapeNormalizationMode,
  type ShapeNormalizationResult,
} from "./normalization";

export const shapeToolsTargets = {
  activeMediaId: "shapeTools.activeMediaId",
  mode: "shapeTools.mode",
  sideLength: "shapeTools.sideLength",
  libraryForm: "shapeTools.libraryForm",
  libraryStatus: "shapeTools.libraryStatus",
  upload: "shapeTools.upload",
} as const;

export type ShapeToolsLibraryForm = {
  category: "base" | "complex";
  collectionDisplayName: string;
  collectionId: string;
  displayName: string;
  familyId: string;
  mainInnerGap: string;
  opacityMode: "separate-elements" | "whole-svg";
  profileId: string;
  profileLabel: string;
  thicknesses: string;
  variantId: string;
};

export const defaultShapeToolsLibraryForm: ShapeToolsLibraryForm = {
  category: "complex",
  collectionDisplayName: "",
  collectionId: "",
  displayName: "",
  familyId: "",
  mainInnerGap: "",
  opacityMode: "whole-svg",
  profileId: "",
  profileLabel: "",
  thicknesses: "",
  variantId: "base",
};

export type ShapeToolFileResult =
  | {
      assetId: string;
      fileName: string;
      result: ShapeNormalizationResult;
      source: string;
      status: "valid";
    }
  | {
      assetId: string;
      error: string;
      fileName: string;
      status: "error";
    };

export function getShapeToolsMode(value: unknown): ShapeNormalizationMode {
  return value === "full" || value === "half" ? value : "auto";
}

export function getShapeToolsSideLength(value: unknown): number {
  const side = Number(value);
  return Number.isFinite(side) && side > 0 ? side : 24;
}

export function getShapeToolResults(state: ToolcraftState): ShapeToolFileResult[] {
  const mode = getShapeToolsMode(state.values[shapeToolsTargets.mode]);
  const sideLength = getShapeToolsSideLength(state.values[shapeToolsTargets.sideLength]);
  return state.mediaAssets
    .filter((asset) => asset.sourceTarget === shapeToolsTargets.upload)
    .map((asset) => {
      try {
        const source = decodeSvgDataUrl(asset.dataUrl);
        return {
          assetId: asset.id,
          fileName: asset.fileName,
          result: normalizeTriangleSvg({ fileName: asset.fileName, mode, sideLength, source }),
          source,
          status: "valid" as const,
        };
      } catch (error) {
        return {
          assetId: asset.id,
          error: error instanceof Error ? error.message : "Unable to normalize SVG.",
          fileName: asset.fileName,
          status: "error" as const,
        };
      }
    });
}

export function getActiveShapeToolResult(state: ToolcraftState): ShapeToolFileResult | undefined {
  const results = getShapeToolResults(state);
  const requested = state.values[shapeToolsTargets.activeMediaId];
  return (
    results.find((result) => result.assetId === requested) ??
    results.find((result) => result.status === "valid") ??
    results[0]
  );
}
