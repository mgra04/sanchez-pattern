import type { ToolcraftState } from "@/toolcraft/runtime";

import { builtInShapeCatalog } from "./catalog";
import { defaultShapeImportForm, type ShapeImportForm } from "./import-form";
import { decodeSvgDataUrl, sanitizeShapeSvg } from "./svg";
import { listStoredShapeFamilies, mergeShapeCatalogs, saveStoredShapeFamily } from "./storage";
import {
  shapeWeightOrder,
  type ShapeFamily,
  type ShapeVariant,
} from "./types";

export { defaultShapeImportForm } from "./import-form";
export type { ShapeImportForm } from "./import-form";

const variantFilePattern = /^(weight|form)-([^_]+)__radius-(\d+)\.svg$/i;
const tokenPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ShapeImportField = keyof ShapeImportForm | "file";
export type ShapeImportErrors = Partial<Record<ShapeImportField, string>>;

export function slugifyShapeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseVariantMetadataFromFileName(
  fileName: string,
): Pick<ShapeImportForm, "radiusPx" | "variantName" | "variantType"> | null {
  const match = fileName.match(variantFilePattern);
  if (!match) return null;

  return {
    radiusPx: match[3]!,
    variantName: slugifyShapeToken(match[2]!),
    variantType: match[1]!.toLowerCase() as ShapeImportForm["variantType"],
  };
}

export function validateShapeImportForm(
  form: ShapeImportForm,
  hasFile: boolean,
): ShapeImportErrors {
  const errors: ShapeImportErrors = {};
  const familyId = form.familyId.trim();
  const variantName = form.variantName.trim();
  const radius = Number(form.radiusPx);

  if (!hasFile) errors.file = "Choose an SVG file before importing.";
  if (!familyId || !tokenPattern.test(familyId)) {
    errors.familyId = "Use a lowercase kebab-case family ID, for example rounded-cross.";
  }
  if (form.mode === "new" && !form.displayName.trim()) {
    errors.displayName = "Display name is required for a new family.";
  }
  if (!variantName || !tokenPattern.test(variantName)) {
    errors.variantName = "Use a lowercase kebab-case token.";
  } else if (
    form.variantType === "weight" &&
    !shapeWeightOrder.includes(variantName as (typeof shapeWeightOrder)[number])
  ) {
    errors.variantName = `Weight must be one of: ${shapeWeightOrder.join(", ")}.`;
  }
  if (!Number.isInteger(radius) || radius < 0 || radius > 12) {
    errors.radiusPx = "Corner radius must be a whole number from 0 to 12.";
  }
  if (form.mode === "new" && form.geometryMode !== "standard") {
    if (!form.setId.trim() || !tokenPattern.test(form.setId.trim())) {
      errors.setId = "Use a lowercase kebab-case Shape Set ID.";
    }
    if (!form.setDisplayName.trim()) {
      errors.setDisplayName = "Shape Set name is required.";
    }
    const side = Number(form.sideLength);
    if (!Number.isFinite(side) || side <= 0 || side > 512) {
      errors.sideLength = "Side length must be greater than 0 and at most 512px.";
    }
  }

  return errors;
}

export async function importShapeFromToolcraftState(
  state: ToolcraftState,
  rawForm: ShapeImportForm,
): Promise<{ family: ShapeFamily; mediaIds: string[] }> {
  const media = state.mediaAssets.filter((asset) => asset.sourceTarget === "library.upload");
  const fieldErrors = validateShapeImportForm(rawForm, media.length > 0);
  if (Object.keys(fieldErrors).length > 0) {
    throw Object.assign(new Error("Correct the highlighted import fields."), { fieldErrors });
  }
  if (media.length === 0) throw new Error("Choose an SVG file before importing.");

  const form: ShapeImportForm = {
    ...rawForm,
    familyId: slugifyShapeToken(rawForm.familyId),
    radiusPx: String(Number(rawForm.radiusPx)),
    variantName: slugifyShapeToken(rawForm.variantName),
  };
  const parsedMedia = media.map((asset) => {
    const parsed = parseVariantMetadataFromFileName(asset.fileName);
    if (media.length > 1 && !parsed) {
      throw Object.assign(
        new Error(`Batch file ${asset.fileName} does not follow the variant filename convention.`),
        { fieldErrors: { file: "Every batch file must use type-name__radius-N.svg." } },
      );
    }
    const metadata = parsed ?? {
      radiusPx: form.radiusPx,
      variantName: form.variantName,
      variantType: form.variantType,
    };
    const svg = sanitizeShapeSvg(decodeSvgDataUrl(asset.dataUrl));
    return {
      asset,
      svg,
      variant: {
        axis: metadata.variantType,
        axisValue: metadata.variantName,
        fileName: asset.fileName,
        id: `${metadata.variantType}-${metadata.variantName}__radius-${Number(metadata.radiusPx)}`,
        opacityUnits: { count: 1, mode: "whole-svg" },
        radiusPx: Number(metadata.radiusPx),
        svgBody: svg.body,
      } satisfies ShapeVariant,
    };
  });
  const stored = await listStoredShapeFamilies();
  const catalog = mergeShapeCatalogs(builtInShapeCatalog, stored);
  const existing = catalog.find(
    (family) => family.category === form.category && family.id === form.familyId,
  );

  if (form.mode === "variant" && !existing) {
    throw Object.assign(
      new Error(`Family ${form.category}/${form.familyId} does not exist.`),
      { fieldErrors: { familyId: "This family does not exist in the selected category." } },
    );
  }
  if (form.mode === "new" && existing) {
    throw Object.assign(
      new Error(`Family ${form.category}/${form.familyId} already exists.`),
      { fieldErrors: { familyId: "This family already exists. Import the SVG as a variant." } },
    );
  }

  const variants = new Map((existing?.variants ?? []).map((entry) => [entry.id, entry]));
  const batchIds = new Set<string>();
  for (const entry of parsedMedia) {
    if (batchIds.has(entry.variant.id)) {
      throw Object.assign(new Error(`Duplicate variant ${entry.variant.id} in batch.`), {
        fieldErrors: { file: "The batch contains duplicate variant metadata." },
      });
    }
    batchIds.add(entry.variant.id);
    variants.set(entry.variant.id, entry.variant);
  }
  const first = parsedMedia[0]!;
  const side = Number(form.sideLength);
  const triangleRole =
    form.geometryMode === "triangle-full"
      ? "triangle-full"
      : form.geometryMode === "triangle-half"
        ? "triangle-half"
        : null;
  const exactHeight = side * Math.sqrt(3) / 2;
  const frame = existing?.frame ?? (
    triangleRole
      ? { height: exactHeight, width: triangleRole === "triangle-full" ? side : side / 2 }
      : { height: first.svg.height, width: first.svg.width }
  );
  const viewBox = existing?.viewBox ?? (
    triangleRole
      ? { height: exactHeight, minX: 0, minY: 0, width: frame.width }
      : first.svg.viewBox
  );
  const family: ShapeFamily = {
    category: form.category,
    defaultVariantId: existing?.defaultVariantId ?? first.variant.id,
    displayName: existing?.displayName ?? form.displayName.trim(),
    frame,
    frameKind: existing?.frameKind ?? (
      triangleRole === "triangle-full"
        ? "equilateral-full"
        : triangleRole === "triangle-half"
          ? "equilateral-half"
          : "square"
    ),
    id: form.familyId,
    tile: existing?.tile ?? (triangleRole ? {
      canonicalOrientation: "up",
      profileId: `equilateral-${side}`,
      role: triangleRole,
      setDisplayName: form.setDisplayName.trim(),
      setId: slugifyShapeToken(form.setId),
      sideLength: side,
    } : undefined),
    variants: [...variants.values()],
    viewBox,
  };

  await saveStoredShapeFamily(family);
  return { family, mediaIds: media.map((asset) => asset.id) };
}
