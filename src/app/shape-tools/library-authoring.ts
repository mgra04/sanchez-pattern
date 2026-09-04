import { builtInShapeCatalog, builtInShapeCollections } from "../shapes/catalog";
import { annotateTopLevelDrawableOpacityUnits, getShapeOpacityUnitIds } from "../shapes/opacity-units";
import { sanitizeShapeSvg } from "../shapes/svg";
import {
  listStoredShapeCollections,
  listStoredShapeFamilies,
  mergeShapeCatalogs,
  saveStoredShapeCollection,
  saveStoredShapeFamily,
} from "../shapes/storage";
import type {
  ShapeCollection,
  ShapeFamily,
  ShapeParameterDefinition,
  ShapeParameterValue,
  ShapeVariant,
} from "../shapes/types";
import { getActiveShapeToolResult, type ShapeToolsLibraryForm } from "./shape-tools-model";
import type { ToolcraftState } from "@/toolcraft/runtime";

const tokenPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ShapeToolsLibraryErrors = Partial<Record<keyof ShapeToolsLibraryForm | "source", string>>;

function parseNumberList(value: string): number[] | null {
  if (!value.trim()) return [];
  const values = value.split(",").map((entry) => Number(entry.trim()));
  return values.length > 0 && values.every((entry) => Number.isFinite(entry) && entry >= 0)
    ? values
    : null;
}

export function validateShapeToolsLibraryForm(
  form: ShapeToolsLibraryForm,
  hasSource: boolean,
): ShapeToolsLibraryErrors {
  const errors: ShapeToolsLibraryErrors = {};
  if (!hasSource) errors.source = "Select a valid normalized SVG.";
  if (!tokenPattern.test(form.familyId.trim())) errors.familyId = "Use lowercase kebab-case.";
  if (!form.displayName.trim()) errors.displayName = "Display name is required.";
  if (!tokenPattern.test(form.variantId.trim())) errors.variantId = "Use lowercase kebab-case.";
  if (form.collectionId.trim() && !tokenPattern.test(form.collectionId.trim())) {
    errors.collectionId = "Use lowercase kebab-case.";
  }
  if (form.collectionId.trim() && !form.collectionDisplayName.trim()) {
    errors.collectionDisplayName = "Collection name is required.";
  }
  if (form.profileId.trim() && !tokenPattern.test(form.profileId.trim())) {
    errors.profileId = "Use lowercase kebab-case.";
  }
  if (form.profileId.trim() && !form.collectionId.trim()) {
    errors.profileId = "Choose a collection before assigning a profile.";
  }
  if (form.profileId.trim() && !form.profileLabel.trim()) {
    errors.profileLabel = "Profile label is required.";
  }
  if (parseNumberList(form.thicknesses) === null) {
    errors.thicknesses = "Enter comma-separated non-negative numbers.";
  }
  if (form.mainInnerGap.trim()) {
    const gap = Number(form.mainInnerGap);
    if (!Number.isFinite(gap) || gap < 0) errors.mainInnerGap = "Enter a non-negative number.";
  }
  return errors;
}

function getParameters(form: ShapeToolsLibraryForm): Record<string, ShapeParameterValue> {
  const parameters: Record<string, ShapeParameterValue> = {};
  const thicknesses = parseNumberList(form.thicknesses) ?? [];
  if (thicknesses.length > 0) parameters.thicknesses = thicknesses;
  if (form.mainInnerGap.trim()) parameters["main-inner-gap"] = Number(form.mainInnerGap);
  return parameters;
}

function getParameterDefinitions(parameters: Record<string, ShapeParameterValue>): ShapeParameterDefinition[] {
  const definitions: ShapeParameterDefinition[] = [];
  if (parameters.thicknesses) {
    definitions.push({ id: "thicknesses", kind: "number-list", label: "Thicknesses", unit: "px" });
  }
  if (parameters["main-inner-gap"] !== undefined) {
    definitions.push({ id: "main-inner-gap", kind: "number", label: "Main–inner gap", unit: "px" });
  }
  return definitions;
}

function sameParameters(
  left: Readonly<Record<string, ShapeParameterValue>>,
  right: Readonly<Record<string, ShapeParameterValue>>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function saveActiveShapeToolToLibrary(
  state: ToolcraftState,
  form: ShapeToolsLibraryForm,
): Promise<{ collection?: ShapeCollection; family: ShapeFamily }> {
  const active = getActiveShapeToolResult(state);
  const errors = validateShapeToolsLibraryForm(form, active?.status === "valid");
  if (Object.keys(errors).length > 0) {
    throw Object.assign(new Error("Correct the highlighted library fields."), { fieldErrors: errors });
  }
  if (!active || active.status !== "valid") throw new Error("Select a valid normalized SVG.");

  const normalizedSource = active.result.normalizedSource;
  let preparedSource = normalizedSource;
  let unitCount = 1;
  if (form.opacityMode === "separate-elements") {
    const existing = sanitizeShapeSvg(normalizedSource);
    const existingUnits = getShapeOpacityUnitIds(existing.body);
    if (existingUnits.length > 0) {
      unitCount = existingUnits.length;
    } else {
      const annotated = annotateTopLevelDrawableOpacityUnits(normalizedSource);
      preparedSource = annotated.source;
      unitCount = annotated.count;
    }
  } else {
    preparedSource = normalizedSource.replace(/\sdata-shape-opacity-unit=["'][^"']+["']/gi, "");
  }
  const svg = sanitizeShapeSvg(preparedSource);
  const parameters = getParameters(form);
  const profileId = form.profileId.trim();
  const variantId = form.variantId.trim();
  const variant: ShapeVariant = {
    axis: "form",
    axisValue: "glyph",
    fileName: `${variantId}.svg`,
    id: variantId,
    opacityUnits: form.opacityMode === "separate-elements"
      ? { count: unitCount, mode: "separate-elements" }
      : { count: 1, mode: "whole-svg" },
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    ...(profileId ? { profileId } : {}),
    radiusPx: 0,
    svgBody: svg.body,
  };

  const storedFamilies = await listStoredShapeFamilies();
  const catalog = mergeShapeCatalogs(builtInShapeCatalog, storedFamilies);
  const existingFamily = catalog.find(
    (candidate) => candidate.category === form.category && candidate.id === form.familyId.trim(),
  );
  if (existingFamily && (
    existingFamily.frameKind !== active.result.role ||
    Math.abs(existingFamily.frame.width - active.result.targetViewport.width) > 0.000001 ||
    Math.abs(existingFamily.frame.height - active.result.targetViewport.height) > 0.000001
  )) {
    throw Object.assign(new Error("The destination family uses a different frame."), {
      fieldErrors: { familyId: "Choose a family with the same normalized frame." },
    });
  }
  const variants = new Map((existingFamily?.variants ?? []).map((entry) => [entry.id, entry]));
  variants.set(variant.id, variant);
  const sideLength = active.result.targetViewport.height * 2 / Math.sqrt(3);
  const family: ShapeFamily = {
    category: form.category,
    defaultVariantId: existingFamily?.defaultVariantId ?? variant.id,
    displayName: form.displayName.trim(),
    frame: {
      height: active.result.targetViewport.height,
      width: active.result.targetViewport.width,
    },
    frameKind: active.result.role,
    id: form.familyId.trim(),
    tile: existingFamily?.tile ?? {
      canonicalOrientation: "up",
      profileId: `equilateral-${Number(sideLength.toFixed(6))}`,
      role: active.result.role === "equilateral-full" ? "triangle-full" : "triangle-half",
      setDisplayName: form.collectionDisplayName.trim() || form.displayName.trim(),
      setId: form.collectionId.trim() || form.familyId.trim(),
      sideLength,
    },
    variants: [...variants.values()],
    viewBox: active.result.targetViewport,
  };
  const collectionId = form.collectionId.trim();
  if (!collectionId) {
    await saveStoredShapeFamily(family);
    return { family };
  }
  if (builtInShapeCollections.some((collection) => collection.id === collectionId)) {
    throw Object.assign(new Error("Built-in collections are read-only."), {
      fieldErrors: { collectionId: "Choose a new local collection ID." },
    });
  }
  const storedCollections = await listStoredShapeCollections();
  const existingCollection = storedCollections.find((collection) => collection.id === collectionId);
  const member = { category: family.category, familyId: family.id } as const;
  const members = existingCollection?.members.some(
    (entry) => entry.category === member.category && entry.familyId === member.familyId,
  )
    ? [...existingCollection.members]
    : [...(existingCollection?.members ?? []), member];
  const variantProfiles = [...(existingCollection?.variantProfiles ?? [])];
  if (profileId) {
    const existingProfile = variantProfiles.find((profile) => profile.id === profileId);
    if (existingProfile && !sameParameters(existingProfile.parameters, parameters)) {
      throw Object.assign(new Error("The profile already uses different parameters."), {
        fieldErrors: { profileId: "Use another profile ID or matching values." },
      });
    }
    if (!existingProfile) {
      variantProfiles.push({ id: profileId, label: form.profileLabel.trim(), parameters });
    }
  }
  const definitionsById = new Map(
    (existingCollection?.parameterDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  for (const definition of getParameterDefinitions(parameters)) definitionsById.set(definition.id, definition);
  const collection: ShapeCollection = {
    cover: existingCollection?.cover ?? { ...member, variantId: variant.id },
    description: existingCollection?.description ?? "Browser-local parameterized shape collection.",
    displayName: form.collectionDisplayName.trim(),
    id: collectionId,
    members,
    parameterDefinitions: [...definitionsById.values()],
    profileCoverage: "sparse",
    schemaVersion: 2,
    tags: existingCollection?.tags ?? ["local"],
    variantProfiles,
  };
  // Complete all cross-record validation before the first IndexedDB write so
  // an invalid collection/profile cannot leave a partially saved family.
  await saveStoredShapeFamily(family);
  await saveStoredShapeCollection(collection);
  return { collection, family };
}
