import type {
  ShapeCategory,
  ShapeCollection,
  ShapeCollectionMemberRef,
  ShapeFamily,
  ShapeFrameKind,
  ShapeParameterDefinition,
  ShapeParameterValue,
  ShapeVariantProfile,
  ShapeVariant,
} from "./types";
import {
  validateShapeCollectionProfileCoverage,
  validateShapeVariantProfiles,
} from "./profiles";

const tokenPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ShapeFrameFilter = ShapeFrameKind | "all";

export type ShapeCollectionMatch = {
  collection: ShapeCollection;
  coverFamily: ShapeFamily;
  coverVariant: ShapeVariant;
  matchingFamilies: readonly ShapeFamily[];
  totalCount: number;
};

export function getShapeFamilyKey(
  family: Pick<ShapeFamily, "category" | "id"> | ShapeCollectionMemberRef,
): string {
  const id = "familyId" in family ? family.familyId : family.id;
  return `${family.category}/${id}`;
}

function readString(record: Record<string, unknown>, field: string, source: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${source}.${field} must be a non-empty string.`);
  }
  return value.trim();
}

function readMember(value: unknown, path: string): ShapeCollectionMemberRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const category = record.category;
  if (category !== "base" && category !== "complex") {
    throw new Error(`${path}.category must be base or complex.`);
  }
  const familyId = readString(record, "familyId", path);
  if (!tokenPattern.test(familyId)) {
    throw new Error(`${path}.familyId must use lowercase kebab-case.`);
  }
  return { category, familyId };
}

function readParameterDefinitions(value: unknown, source: string): ShapeParameterDefinition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${source}.parameterDefinitions must be an array.`);
  }
  return value.map((entry, index) => {
    const path = `${source}.parameterDefinitions[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${path} must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const kind = record.kind;
    if (kind !== "number" && kind !== "number-list" && kind !== "token") {
      throw new Error(`${path}.kind must be number, number-list, or token.`);
    }
    if (record.unit !== undefined && record.unit !== "px") {
      throw new Error(`${path}.unit must be px when provided.`);
    }
    return {
      id: readString(record, "id", path),
      kind,
      label: readString(record, "label", path),
      ...(record.unit === "px" ? { unit: "px" as const } : {}),
    };
  });
}

function readVariantProfiles(value: unknown, source: string): ShapeVariantProfile[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${source}.variantProfiles must be an array.`);
  }
  return value.map((entry, index) => {
    const path = `${source}.variantProfiles[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${path} must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    if (!record.parameters || typeof record.parameters !== "object" || Array.isArray(record.parameters)) {
      throw new Error(`${path}.parameters must be an object.`);
    }
    return {
      id: readString(record, "id", path),
      label: readString(record, "label", path),
      parameters: record.parameters as Record<string, ShapeParameterValue>,
    };
  });
}

export function parseShapeCollectionManifest(
  input: unknown,
  families: readonly ShapeFamily[],
  source = "shape collection",
): ShapeCollection {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${source} must contain an object.`);
  }
  const record = input as Record<string, unknown>;
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2) {
    throw new Error(`${source}.schemaVersion must be 1 or 2.`);
  }
  const schemaVersion = record.schemaVersion;
  const id = readString(record, "id", source);
  if (!tokenPattern.test(id)) {
    throw new Error(`${source}.id must use lowercase kebab-case.`);
  }
  const displayName = readString(record, "displayName", source);
  const description = readString(record, "description", source);
  if (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== "string" || !tag.trim())) {
    throw new Error(`${source}.tags must be an array of non-empty strings.`);
  }
  if (!Array.isArray(record.members) || record.members.length === 0) {
    throw new Error(`${source}.members must contain at least one family reference.`);
  }

  const members = record.members.map((member, index) =>
    readMember(member, `${source}.members[${index}]`),
  );
  const memberKeys = new Set<string>();
  const familyByKey = new Map(families.map((family) => [getShapeFamilyKey(family), family]));
  for (const member of members) {
    const key = getShapeFamilyKey(member);
    if (memberKeys.has(key)) {
      throw new Error(`${source}.members contains duplicate ${key}.`);
    }
    memberKeys.add(key);
    if (!familyByKey.has(key)) {
      throw new Error(`${source}.members references missing family ${key}.`);
    }
  }

  const coverMember = readMember(record.cover, `${source}.cover`);
  const coverKey = getShapeFamilyKey(coverMember);
  if (!memberKeys.has(coverKey)) {
    throw new Error(`${source}.cover must reference one of the collection members.`);
  }
  const coverRecord = record.cover as Record<string, unknown>;
  const variantId = coverRecord.variantId;
  if (variantId !== undefined && (typeof variantId !== "string" || !variantId.trim())) {
    throw new Error(`${source}.cover.variantId must be a non-empty string when provided.`);
  }
  const coverFamily = familyByKey.get(coverKey)!;
  if (
    typeof variantId === "string" &&
    !coverFamily.variants.some((variant) => variant.id === variantId)
  ) {
    throw new Error(`${source}.cover references missing variant ${coverKey}/${variantId}.`);
  }

  const parameterDefinitions = schemaVersion === 2
    ? readParameterDefinitions(record.parameterDefinitions, source)
    : [];
  const variantProfiles = schemaVersion === 2
    ? readVariantProfiles(record.variantProfiles, source)
    : [];
  const profileCoverage = schemaVersion === 2 && record.profileCoverage === "complete"
    ? "complete" as const
    : "sparse" as const;
  validateShapeVariantProfiles({
    definitions: parameterDefinitions,
    profiles: variantProfiles,
    source,
  });

  const collection: ShapeCollection = {
    cover: {
      ...coverMember,
      ...(typeof variantId === "string" ? { variantId: variantId.trim() } : {}),
    },
    description,
    displayName,
    id,
    members,
    parameterDefinitions,
    profileCoverage,
    schemaVersion,
    tags: (record.tags as string[]).map((tag) => tag.trim()),
    variantProfiles,
  };
  validateShapeCollectionProfileCoverage(collection, families, source);
  return collection;
}

export function familyMatchesShapeFilters(
  family: ShapeFamily,
  category: ShapeCategory,
  frameFilter: ShapeFrameFilter,
): boolean {
  return (
    family.category === category &&
    (frameFilter === "all" || family.frameKind === frameFilter)
  );
}

export function getCollectionFamilies(
  collection: ShapeCollection,
  families: readonly ShapeFamily[],
): ShapeFamily[] {
  const familyByKey = new Map(families.map((family) => [getShapeFamilyKey(family), family]));
  return collection.members
    .map((member) => familyByKey.get(getShapeFamilyKey(member)))
    .filter((family): family is ShapeFamily => Boolean(family));
}

export function getShapeCollectionMatch(
  collection: ShapeCollection,
  families: readonly ShapeFamily[],
  category: ShapeCategory,
  frameFilter: ShapeFrameFilter,
): ShapeCollectionMatch | null {
  const collectionFamilies = getCollectionFamilies(collection, families);
  const matchingFamilies = collectionFamilies.filter((family) =>
    familyMatchesShapeFilters(family, category, frameFilter),
  );
  if (matchingFamilies.length === 0) return null;

  const configuredCover = collectionFamilies.find(
    (family) => getShapeFamilyKey(family) === getShapeFamilyKey(collection.cover),
  );
  const coverFamily = configuredCover && matchingFamilies.includes(configuredCover)
    ? configuredCover
    : matchingFamilies[0]!;
  const configuredVariant =
    coverFamily === configuredCover && collection.cover.variantId
      ? coverFamily.variants.find((variant) => variant.id === collection.cover.variantId)
      : undefined;
  const coverVariant =
    configuredVariant ??
    coverFamily.variants.find((variant) => variant.id === coverFamily.defaultVariantId) ??
    coverFamily.variants[0]!;

  return {
    collection,
    coverFamily,
    coverVariant,
    matchingFamilies,
    totalCount: collectionFamilies.length,
  };
}

export function getTopLevelShapeFamilies(
  families: readonly ShapeFamily[],
  collectionMatches: readonly ShapeCollectionMatch[],
  category: ShapeCategory,
  frameFilter: ShapeFrameFilter,
): ShapeFamily[] {
  const groupedKeys = new Set(
    collectionMatches.flatMap((match) =>
      match.matchingFamilies.map((family) => getShapeFamilyKey(family)),
    ),
  );
  return families.filter(
    (family) =>
      familyMatchesShapeFilters(family, category, frameFilter) &&
      !groupedKeys.has(getShapeFamilyKey(family)),
  );
}
