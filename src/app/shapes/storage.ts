import type { ShapeCollection, ShapeFamily, ShapeFrameKind } from "./types";

function getLegacyFrameKind(family: ShapeFamily): ShapeFrameKind {
  if (family.frameKind) return family.frameKind;
  if (family.tile?.role === "triangle-full") return "equilateral-full";
  if (family.tile?.role === "triangle-half") return "equilateral-half";
  if (
    family.frame &&
    Number.isFinite(family.frame.width) &&
    Number.isFinite(family.frame.height) &&
    Math.abs(family.frame.width - family.frame.height) <= 0.000001
  ) {
    return "square";
  }
  throw new Error(`Stored shape ${family.category}/${family.id} requires frame geometry metadata.`);
}

function normalizeFamily(family: ShapeFamily): ShapeFamily {
  return {
    ...family,
    frameKind: getLegacyFrameKind(family),
    variants: family.variants.map((variant) => ({
      ...variant,
      opacityUnits: variant.opacityUnits ?? { count: 1, mode: "whole-svg" },
    })),
    viewBox: family.viewBox ?? {
      height: family.frame?.height ?? 24,
      minX: 0,
      minY: 0,
      width: family.frame?.width ?? 24,
    },
  };
}

const databaseName = "toolcraft-sanchez-pattern-shapes";
const familyStoreName = "families";
const collectionStoreName = "collections";
const databaseVersion = 2;

type StoredFamilyRecord = {
  family: ShapeFamily;
  key: string;
  updatedAt: number;
};

type StoredCollectionRecord = {
  collection: ShapeCollection;
  key: string;
  updatedAt: number;
};

function getFamilyKey(family: Pick<ShapeFamily, "category" | "id">): string {
  return `${family.category}/${family.id}`;
}

function openShapeDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onerror = () => reject(request.error ?? new Error("Unable to open shape library."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(familyStoreName)) {
        database.createObjectStore(familyStoreName, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(collectionStoreName)) {
        database.createObjectStore(collectionStoreName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function listStoredShapeFamilies(): Promise<ShapeFamily[]> {
  const database = await openShapeDatabase();
  if (!database) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(familyStoreName, "readonly");
    const request = transaction.objectStore(familyStoreName).getAll();

    request.onerror = () => reject(request.error ?? new Error("Unable to read shape library."));
    request.onsuccess = () =>
      resolve(
        (request.result as StoredFamilyRecord[])
          .flatMap((record) => {
            try {
              return [normalizeFamily(record.family)];
            } catch {
              return [];
            }
          })
          .sort((left, right) => left.displayName.localeCompare(right.displayName)),
      );
    transaction.oncomplete = () => database.close();
  });
}

export async function saveStoredShapeFamily(family: ShapeFamily): Promise<void> {
  const database = await openShapeDatabase();
  if (!database) {
    throw new Error("This browser does not support IndexedDB shape persistence.");
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(familyStoreName, "readwrite");
    transaction.objectStore(familyStoreName).put({
      family: normalizeFamily(family),
      key: getFamilyKey(family),
      updatedAt: Date.now(),
    } satisfies StoredFamilyRecord);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save shape."));
    transaction.oncomplete = () => resolve();
  });
  database.close();
}

function normalizeCollection(collection: ShapeCollection): ShapeCollection {
  return {
    ...collection,
    parameterDefinitions: collection.parameterDefinitions ?? [],
    profileCoverage: collection.profileCoverage ?? "sparse",
    schemaVersion: collection.schemaVersion ?? 1,
    variantProfiles: collection.variantProfiles ?? [],
  };
}

export async function listStoredShapeCollections(): Promise<ShapeCollection[]> {
  const database = await openShapeDatabase();
  if (!database) return [];
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(collectionStoreName, "readonly");
    const request = transaction.objectStore(collectionStoreName).getAll();
    request.onerror = () => reject(request.error ?? new Error("Unable to read shape collections."));
    request.onsuccess = () => resolve(
      (request.result as StoredCollectionRecord[])
        .map((record) => normalizeCollection(record.collection))
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    );
    transaction.oncomplete = () => database.close();
  });
}

export async function saveStoredShapeCollection(collection: ShapeCollection): Promise<void> {
  const database = await openShapeDatabase();
  if (!database) throw new Error("This browser does not support IndexedDB shape persistence.");
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(collectionStoreName, "readwrite");
    transaction.objectStore(collectionStoreName).put({
      collection: normalizeCollection(collection),
      key: collection.id,
      updatedAt: Date.now(),
    } satisfies StoredCollectionRecord);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save shape collection."));
    transaction.oncomplete = () => resolve();
  });
  database.close();
}

export function mergeShapeCollections(
  builtIn: readonly ShapeCollection[],
  stored: readonly ShapeCollection[],
): ShapeCollection[] {
  const collections = new Map(builtIn.map((collection) => [collection.id, normalizeCollection(collection)]));
  for (const collection of stored) {
    if (collections.has(collection.id)) {
      throw new Error(`Local shape collection ${collection.id} conflicts with a built-in collection.`);
    }
    collections.set(collection.id, normalizeCollection(collection));
  }
  return [...collections.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function mergeShapeCatalogs(
  builtIn: readonly ShapeFamily[],
  stored: readonly ShapeFamily[],
): ShapeFamily[] {
  const families = new Map<string, ShapeFamily>();

  for (const family of builtIn) {
    families.set(getFamilyKey(family), normalizeFamily(family));
  }

  for (const family of stored) {
    const normalizedFamily = normalizeFamily(family);
    const key = getFamilyKey(normalizedFamily);
    const previous = families.get(key);
    if (!previous) {
      families.set(key, normalizedFamily);
      continue;
    }

    const variants = new Map(previous.variants.map((variant) => [variant.id, variant]));
    for (const variant of normalizedFamily.variants) {
      variants.set(variant.id, variant);
    }
    const mergedVariants = [...variants.values()];

    families.set(key, {
      ...previous,
      ...normalizedFamily,
      defaultVariantId: mergedVariants.some(
        (variant) => variant.id === normalizedFamily.defaultVariantId,
      )
        ? normalizedFamily.defaultVariantId
        : previous.defaultVariantId,
      variants: mergedVariants,
    });
  }

  return [...families.values()].sort((left, right) =>
    left.category === right.category
      ? left.displayName.localeCompare(right.displayName)
      : left.category.localeCompare(right.category),
  );
}
