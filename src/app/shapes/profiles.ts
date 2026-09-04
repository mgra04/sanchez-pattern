import type {
  ShapeCollection,
  ShapeFamily,
  ShapeParameterDefinition,
  ShapeParameterValue,
  ShapeVariant,
  ShapeVariantProfile,
} from "./types";

const tokenPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isParameterValueValid(
  definition: ShapeParameterDefinition,
  value: ShapeParameterValue | undefined,
): boolean {
  if (definition.kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (definition.kind === "number-list") {
    return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item));
  }
  return typeof value === "string" && Boolean(value.trim());
}

export function validateShapeVariantProfiles(params: {
  definitions: readonly ShapeParameterDefinition[];
  profiles: readonly ShapeVariantProfile[];
  source: string;
}): void {
  const definitionIds = new Set<string>();
  for (const definition of params.definitions) {
    if (!tokenPattern.test(definition.id) || definitionIds.has(definition.id)) {
      throw new Error(`${params.source}.parameterDefinitions contains invalid or duplicate id ${definition.id}.`);
    }
    definitionIds.add(definition.id);
  }
  const profileIds = new Set<string>();
  for (const profile of params.profiles) {
    if (!tokenPattern.test(profile.id) || profileIds.has(profile.id)) {
      throw new Error(`${params.source}.variantProfiles contains invalid or duplicate id ${profile.id}.`);
    }
    profileIds.add(profile.id);
    for (const definition of params.definitions) {
      if (!isParameterValueValid(definition, profile.parameters[definition.id])) {
        throw new Error(`${params.source}.variantProfiles.${profile.id}.${definition.id} has an invalid value.`);
      }
    }
    for (const key of Object.keys(profile.parameters)) {
      if (!definitionIds.has(key)) {
        throw new Error(`${params.source}.variantProfiles.${profile.id} uses unknown parameter ${key}.`);
      }
    }
  }
}

export function getCollectionVariantForProfile(
  collection: ShapeCollection,
  family: ShapeFamily,
  profileId: string,
): ShapeVariant | undefined {
  if (!collection.variantProfiles.some((profile) => profile.id === profileId)) return undefined;
  return family.variants.find((variant) => variant.profileId === profileId);
}

export function getShapeVariantParameters(
  collection: ShapeCollection,
  variant: ShapeVariant,
): Readonly<Record<string, ShapeParameterValue>> {
  if (variant.parameters) return variant.parameters;
  return collection.variantProfiles.find((profile) => profile.id === variant.profileId)?.parameters ?? {};
}

export function validateShapeCollectionProfileCoverage(
  collection: ShapeCollection,
  families: readonly ShapeFamily[],
  source: string,
): void {
  if (collection.variantProfiles.length === 0) return;
  for (const member of collection.members) {
    const family = families.find(
      (candidate) => candidate.category === member.category && candidate.id === member.familyId,
    );
    if (!family) continue;
    const seen = new Set<string>();
    for (const variant of family.variants) {
      if (!variant.profileId) continue;
      if (!collection.variantProfiles.some((profile) => profile.id === variant.profileId)) {
        throw new Error(`${source} family ${member.category}/${member.familyId} uses unknown profile ${variant.profileId}.`);
      }
      if (seen.has(variant.profileId)) {
        throw new Error(`${source} family ${member.category}/${member.familyId} contains duplicate profile ${variant.profileId}.`);
      }
      seen.add(variant.profileId);
    }
    if (collection.profileCoverage === "complete") {
      for (const profile of collection.variantProfiles) {
        if (!seen.has(profile.id)) {
          throw new Error(`${source} family ${member.category}/${member.familyId} is missing profile ${profile.id}.`);
        }
      }
    }
  }
}
