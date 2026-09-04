import { sanitizeShapeSvg } from "./svg";
import { parseShapeCollectionManifest } from "./collections";
import { validateShapeOpacityUnits } from "./opacity-units";
import {
  getShapeWeightLabel,
  shapeWeightOrder,
  type ShapeCategory,
  type ShapeCollection,
  type ShapeFamily,
  type ShapeFrameKind,
  type ShapeVariant,
} from "./types";

const svgModules = import.meta.glob(
  "../../../shapes-library/{base,complex}/*/*.svg",
  { eager: true, import: "default", query: "?raw" },
) as Record<string, string>;
const manifestModules = import.meta.glob(
  "../../../shapes-library/{base,complex}/*/shape.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;
const collectionManifestModules = import.meta.glob(
  "../../../shapes-library/collections/*.collection.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

type ShapeVariantManifest = {
  axis?: ShapeVariant["axis"];
  axisValue?: string;
  file: string;
  id: string;
  nominalThicknessPx?: number;
  opacityUnits?: ShapeVariant["opacityUnits"];
  profileId?: string;
  radiusPx?: number;
};

type ShapeManifest = Pick<ShapeFamily, "displayName" | "frame" | "tile" | "viewBox"> & {
  defaultVariantId?: string;
  frameKind?: ShapeFrameKind;
  schemaVersion?: 1 | 2;
  variants?: readonly ShapeVariantManifest[];
};

const variantFilePattern = /^(weight|form)-([^_]+)__radius-(\d+)\.svg$/;
const commonBaseThickness: Record<string, number> = {
  "extra-bold": 10,
  "extra-light": 2,
  base: 6,
  bold: 8,
  light: 4,
};
const diamondThickness: Record<string, number> = {
  "extra-bold": 7,
  "extra-light": 1,
  base: 4,
  bold: 6,
  light: 2,
};

function getDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => {
      if (part === "u" || part === "x") {
        return part.toUpperCase();
      }

      if (/^v\d+$/i.test(part)) {
        return part.toUpperCase();
      }

      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function getNominalThickness(
  category: ShapeCategory,
  familyId: string,
  axis: string,
  axisValue: string,
): number | undefined {
  if (category !== "base" || axis !== "weight") {
    return undefined;
  }

  return (familyId === "diamond" ? diamondThickness : commonBaseThickness)[axisValue];
}

function getVariantSortValue(variant: ShapeVariant): number {
  const axisOffset = variant.axis === "weight" ? 0 : 100;
  const weightIndex = shapeWeightOrder.indexOf(variant.axisValue as never);
  const valueIndex = weightIndex >= 0 ? weightIndex : 50;

  return axisOffset + valueIndex * 20 + variant.radiusPx;
}

function resolveDefaultVariant(variants: readonly ShapeVariant[]): ShapeVariant {
  return (
    variants.find(
      (variant) =>
        variant.axis === "weight" && variant.axisValue === "base" && variant.radiusPx === 0,
    ) ??
    variants.find((variant) => variant.radiusPx === 0) ??
    variants[0]
  )!;
}

function resolveFrameKind(
  manifest: ShapeManifest | undefined,
  intrinsic: ReturnType<typeof sanitizeShapeSvg> | null,
  familyId: string,
): ShapeFrameKind {
  if (manifest?.frameKind) return manifest.frameKind;
  if (manifest?.tile?.role === "triangle-full") return "equilateral-full";
  if (manifest?.tile?.role === "triangle-half") return "equilateral-half";
  const frame = manifest?.frame ?? intrinsic;
  if (frame && Math.abs(frame.width - frame.height) <= 0.000001) return "square";
  throw new Error(`Shape family ${familyId} requires an explicit frameKind.`);
}

function getFamilyManifest(category: ShapeCategory, familyId: string): ShapeManifest | undefined {
  const manifestPath = Object.keys(manifestModules).find((path) =>
    path.replaceAll("\\", "/").endsWith(`shapes-library/${category}/${familyId}/shape.json`),
  );
  return manifestPath ? (manifestModules[manifestPath] as ShapeManifest) : undefined;
}

function buildLegacyVariant(params: {
  category: ShapeCategory;
  familyId: string;
  fileName: string;
  source: string;
}): ShapeVariant {
  const fileMatch = params.fileName.match(variantFilePattern);
  if (!fileMatch) throw new Error(`Invalid shape variant filename: ${params.fileName}`);
  const axis = fileMatch[1] as ShapeVariant["axis"];
  const axisValue = fileMatch[2]!;
  const radiusPx = Number(fileMatch[3]);
  const svg = sanitizeShapeSvg(params.source);
  return {
    axis,
    axisValue,
    fileName: params.fileName,
    id: `${axis}-${axisValue}__radius-${radiusPx}`,
    nominalThicknessPx: getNominalThickness(params.category, params.familyId, axis, axisValue),
    opacityUnits: { count: 1, mode: "whole-svg" },
    radiusPx,
    svgBody: svg.body,
  };
}

function buildExplicitVariants(params: {
  category: ShapeCategory;
  familyId: string;
  files: ReadonlyMap<string, string>;
  manifest: ShapeManifest;
}): ShapeVariant[] {
  if (!params.manifest.variants?.length) {
    throw new Error(`Shape family ${params.category}/${params.familyId} schemaVersion 2 requires variants.`);
  }
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  const variants = params.manifest.variants.map((entry) => {
    if (!entry.id?.trim() || seenIds.has(entry.id)) {
      throw new Error(`Shape family ${params.category}/${params.familyId} contains an invalid or duplicate variant id.`);
    }
    if (!entry.file?.trim() || seenFiles.has(entry.file)) {
      throw new Error(`Shape family ${params.category}/${params.familyId} contains an invalid or duplicate variant file.`);
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.svg$/.test(entry.file)) {
      throw new Error(`Shape family ${params.category}/${params.familyId} contains an unsafe variant filename ${entry.file}.`);
    }
    const source = params.files.get(entry.file);
    if (!source) {
      throw new Error(`Shape family ${params.category}/${params.familyId} references missing SVG ${entry.file}.`);
    }
    seenIds.add(entry.id);
    seenFiles.add(entry.file);
    const svg = sanitizeShapeSvg(source);
    const opacityUnits = validateShapeOpacityUnits(svg.body, entry.opacityUnits);
    const axis = entry.axis ?? "form";
    if (axis !== "form" && axis !== "weight") {
      throw new Error(`Shape family ${params.category}/${params.familyId}/${entry.id} has an invalid axis.`);
    }
    return {
      axis,
      axisValue: entry.axisValue?.trim() || entry.profileId?.trim() || entry.id,
      fileName: entry.file,
      id: entry.id,
      ...(Number.isFinite(entry.nominalThicknessPx)
        ? { nominalThicknessPx: entry.nominalThicknessPx }
        : {}),
      opacityUnits,
      ...(entry.profileId?.trim() ? { profileId: entry.profileId.trim() } : {}),
      radiusPx: Number.isFinite(entry.radiusPx) ? entry.radiusPx! : 0,
      svgBody: svg.body,
    } satisfies ShapeVariant;
  });
  const unreferenced = [...params.files.keys()].filter((file) => !seenFiles.has(file));
  if (unreferenced.length > 0) {
    throw new Error(`Shape family ${params.category}/${params.familyId} contains unreferenced SVG ${unreferenced[0]}.`);
  }
  return variants;
}

function buildCatalog(): ShapeFamily[] {
  const grouped = new Map<string, {
    category: ShapeCategory;
    familyId: string;
    files: Map<string, string>;
  }>();

  for (const [modulePath, source] of Object.entries(svgModules)) {
    const normalizedPath = modulePath.replaceAll("\\", "/");
    const pathMatch = normalizedPath.match(/shapes-library\/(base|complex)\/([^/]+)\/([^/]+\.svg)$/);

    if (!pathMatch) {
      continue;
    }

    const category = pathMatch[1] as ShapeCategory;
    const familyId = pathMatch[2]!;
    const fileName = pathMatch[3]!;
    const key = `${category}/${familyId}`;
    const entry = grouped.get(key) ?? { category, familyId, files: new Map<string, string>() };
    entry.files.set(fileName, source);
    grouped.set(key, entry);
  }

  return [...grouped.values()]
    .map(({ category, familyId, files }) => {
      const manifest = getFamilyManifest(category, familyId);
      const variants = manifest?.schemaVersion === 2
        ? buildExplicitVariants({ category, familyId, files, manifest })
        : [...files.entries()].map(([fileName, source]) =>
            buildLegacyVariant({ category, familyId, fileName, source }),
          );
      const sortedVariants = variants.sort((left, right) => getVariantSortValue(left) - getVariantSortValue(right));
      const requestedDefault = manifest?.defaultVariantId
        ? sortedVariants.find((variant) => variant.id === manifest.defaultVariantId)
        : undefined;
      if (manifest?.defaultVariantId && !requestedDefault) {
        throw new Error(`Shape family ${category}/${familyId} references missing default variant ${manifest.defaultVariantId}.`);
      }
      const defaultVariant = requestedDefault ?? resolveDefaultVariant(sortedVariants);
      const firstSource = files.values().next().value as string | undefined;
      const intrinsic = firstSource ? sanitizeShapeSvg(firstSource) : null;

      return {
        category,
        defaultVariantId: defaultVariant.id,
        displayName: manifest?.displayName ?? getDisplayName(familyId),
        frame: manifest?.frame ?? { height: intrinsic?.height ?? 24, width: intrinsic?.width ?? 24 },
        frameKind: resolveFrameKind(manifest, intrinsic, `${category}/${familyId}`),
        id: familyId,
        tile: manifest?.tile,
        variants: sortedVariants,
        viewBox: manifest?.viewBox ?? intrinsic?.viewBox ?? { height: 24, minX: 0, minY: 0, width: 24 },
      } satisfies ShapeFamily;
    })
    .sort((left, right) =>
      left.category === right.category
        ? left.displayName.localeCompare(right.displayName)
        : left.category.localeCompare(right.category),
    );
}

export const builtInShapeCatalog = buildCatalog();
export const builtInShapeCollections: readonly ShapeCollection[] = Object.entries(
  collectionManifestModules,
)
  .map(([path, manifest]) =>
    parseShapeCollectionManifest(
      manifest,
      builtInShapeCatalog,
      path.replaceAll("\\", "/"),
    ),
  )
  .sort((left, right) => left.displayName.localeCompare(right.displayName));

export function getBuiltInShapeFamily(category: ShapeCategory, familyId: string): ShapeFamily | undefined {
  return builtInShapeCatalog.find(
    (family) => family.category === category && family.id === familyId,
  );
}

export function getShapeVariantLabel(variant: ShapeVariant): string {
  const semantic =
    variant.axis === "form" ? getShapeWeightLabel(variant.axisValue) : getShapeWeightLabel(variant.axisValue);
  const thickness = variant.nominalThicknessPx ? ` (${variant.nominalThicknessPx}px)` : "";

  return `${semantic}${thickness}`;
}
