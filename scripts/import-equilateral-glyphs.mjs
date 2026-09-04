import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceArgument = process.argv[2];
const usage = "Usage: node scripts/import-equilateral-glyphs.mjs <source-directory>";
if (!sourceArgument || sourceArgument === "--help" || sourceArgument === "-h") {
  const output = `${usage}\n`;
  (sourceArgument ? process.stdout : process.stderr).write(output);
  process.exit(sourceArgument ? 0 : 1);
}
const sourceRoot = path.resolve(sourceArgument);
const libraryRoot = path.join(projectRoot, "shapes-library");
const exactHeight = 20.7846096908;
const unitCounts = [4, 3, 3, 4, 4, 2, 3, 3, 3, 3, 4, 6, 3, 3, 4];

function annotatePaths(source, expectedCount, sourceName) {
  let index = 0;
  const annotated = source.replace(/<path\b/gi, () => {
    index += 1;
    return `<path data-shape-opacity-unit="${index}"`;
  });
  if (index !== expectedCount) {
    throw new Error(`${sourceName} contains ${index} paths; expected ${expectedCount}.`);
  }
  return annotated;
}

const members = [];
for (let glyphIndex = 1; glyphIndex <= 15; glyphIndex += 1) {
  const number = String(glyphIndex).padStart(2, "0");
  const familyId = `equilateral-triangle-glyph-${number}`;
  const destination = path.join(libraryRoot, "complex", familyId);
  await mkdir(destination, { recursive: true });
  const variants = [];
  for (const profileId of ["a", "b", "c"]) {
    const sourceName = `g${number}-${profileId}-normalized.svg`;
    const destinationName = `g${number}-${profileId}.svg`;
    const source = await readFile(path.join(sourceRoot, sourceName), "utf8");
    const annotated = annotatePaths(source, unitCounts[glyphIndex - 1], sourceName);
    await writeFile(path.join(destination, destinationName), annotated, "utf8");
    variants.push({
      axis: "form",
      axisValue: "glyph",
      file: destinationName,
      id: `profile-${profileId}`,
      opacityUnits: {
        count: unitCounts[glyphIndex - 1],
        mode: "separate-elements",
      },
      profileId,
      radiusPx: 0,
    });
  }
  const manifest = {
    schemaVersion: 2,
    displayName: `Glyph ${number}`,
    defaultVariantId: "profile-a",
    frameKind: "equilateral-full",
    frame: { width: 24, height: exactHeight },
    viewBox: { minX: 0, minY: 0, width: 24, height: exactHeight },
    tile: {
      canonicalOrientation: "up",
      profileId: "equilateral-24",
      role: "triangle-full",
      setDisplayName: "Equilateral Triangle Glyphs",
      setId: "equilateral-triangle-glyphs",
      sideLength: 24,
    },
    variants,
  };
  await writeFile(
    path.join(destination, "shape.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  members.push({ category: "complex", familyId });
}

const collection = {
  schemaVersion: 2,
  id: "equilateral-triangle-glyphs",
  displayName: "Equilateral Triangle Glyphs",
  description: "Fifteen equilateral-triangle glyphs in three shared thickness and gap profiles.",
  tags: ["triangle", "glyph", "multi-part"],
  parameterDefinitions: [
    { id: "thicknesses", label: "Thicknesses", kind: "number-list", unit: "px" },
    { id: "main-inner-gap", label: "Main–inner gap", kind: "number", unit: "px" },
  ],
  variantProfiles: [
    { id: "a", label: "1/2 · Gap 2", parameters: { thicknesses: [1, 2], "main-inner-gap": 2 } },
    { id: "b", label: "1.5/2 · Gap 2", parameters: { thicknesses: [1.5, 2], "main-inner-gap": 2 } },
    { id: "c", label: "1.5/2 · Gap 1.5", parameters: { thicknesses: [1.5, 2], "main-inner-gap": 1.5 } },
  ],
  profileCoverage: "complete",
  cover: {
    category: "complex",
    familyId: "equilateral-triangle-glyph-01",
    variantId: "profile-a",
  },
  members,
};

await mkdir(path.join(libraryRoot, "collections"), { recursive: true });
await writeFile(
  path.join(libraryRoot, "collections", "equilateral-triangle-glyphs.collection.json"),
  `${JSON.stringify(collection, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`Imported 45 SVG variants from ${sourceRoot}.\n`);
