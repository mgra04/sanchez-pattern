import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceArgument = process.argv[2];
const usage = "Usage: node scripts/import-drafting-triangle-glyphs.mjs <source-directory>";
if (!sourceArgument || sourceArgument === "--help" || sourceArgument === "-h") {
  const output = `${usage}\n`;
  (sourceArgument ? process.stdout : process.stderr).write(output);
  process.exit(sourceArgument ? 0 : 1);
}
const sourceRoot = path.resolve(sourceArgument);
const libraryRoot = path.join(projectRoot, "shapes-library");
const exactWidth = 12;
const exactHeight = 20.7846096908;
const profileIds = ["a", "b", "c"];

function prepareSvg(source, sourceName) {
  const root = source.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  if (!/\bwidth="12"/.test(root) || !/\bheight="20\.7846096908"/.test(root)) {
    throw new Error(`${sourceName} must use the exact 12 × ${exactHeight} root frame.`);
  }
  if (!/\bviewBox="0 0 12 20\.7846096908"/.test(root)) {
    throw new Error(`${sourceName} must use the exact normalized viewBox.`);
  }
  if (/\bdata-shape-opacity-unit=/i.test(source)) {
    throw new Error(`${sourceName} already contains opacity-unit annotations.`);
  }
  const unsupportedDrawables = source.match(/<(?:circle|ellipse|image|line|polygon|polyline|rect|text|use)\b/gi);
  if (unsupportedDrawables) {
    throw new Error(`${sourceName} contains unsupported drawable nodes for this audited batch.`);
  }

  let count = 0;
  const annotated = source.replace(/<path\b/gi, () => {
    count += 1;
    return `<path data-shape-opacity-unit="${count}"`;
  });
  if (count === 0) {
    throw new Error(`${sourceName} contains no path elements.`);
  }
  return { annotated, count };
}

const members = [];
let importedVariants = 0;
for (let glyphIndex = 1; glyphIndex <= 13; glyphIndex += 1) {
  const number = String(glyphIndex).padStart(2, "0");
  const familyId = `drafting-triangle-glyph-${number}`;
  const destination = path.join(libraryRoot, "complex", familyId);
  await mkdir(destination, { recursive: true });
  const variants = [];

  for (const profileId of profileIds) {
    const sourceName = `g${number}-${profileId}-normalized.svg`;
    const destinationName = `g${number}-${profileId}.svg`;
    const source = await readFile(path.join(sourceRoot, sourceName), "utf8");
    const { annotated, count } = prepareSvg(source, sourceName);
    await writeFile(path.join(destination, destinationName), annotated, "utf8");
    variants.push({
      axis: "form",
      axisValue: "glyph",
      file: destinationName,
      id: `profile-${profileId}`,
      opacityUnits: {
        count,
        mode: "separate-elements",
      },
      profileId,
      radiusPx: 0,
    });
    importedVariants += 1;
  }

  const manifest = {
    schemaVersion: 2,
    displayName: `Glyph ${number}`,
    defaultVariantId: "profile-a",
    frameKind: "equilateral-half",
    frame: { width: exactWidth, height: exactHeight },
    viewBox: { minX: 0, minY: 0, width: exactWidth, height: exactHeight },
    tile: {
      canonicalOrientation: "up",
      canonicalTransform: { mirrorY: true },
      profileId: "equilateral-24",
      role: "triangle-half",
      setDisplayName: "Drafting Triangle Glyphs",
      setId: "drafting-triangle-glyphs",
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
  id: "drafting-triangle-glyphs",
  displayName: "Drafting Triangle Glyphs",
  description: "Thirteen drafting-triangle glyphs in three shared thickness and gap profiles.",
  tags: ["triangle", "drafting-triangle", "glyph", "multi-part"],
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
    familyId: "drafting-triangle-glyph-01",
    variantId: "profile-a",
  },
  members,
};

await mkdir(path.join(libraryRoot, "collections"), { recursive: true });
await writeFile(
  path.join(libraryRoot, "collections", "drafting-triangle-glyphs.collection.json"),
  `${JSON.stringify(collection, null, 2)}\n`,
  "utf8",
);

if (members.length !== 13 || importedVariants !== 39) {
  throw new Error(`Import matrix is incomplete: ${members.length} families, ${importedVariants} variants.`);
}

process.stdout.write(`Imported ${importedVariants} SVG variants from ${sourceRoot}.\n`);
