import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceArgument = process.argv[2];
const usage = "Usage: node scripts/import-travel-icon-set.mjs <source-directory>";
if (!sourceArgument || sourceArgument === "--help" || sourceArgument === "-h") {
  const output = `${usage}\n`;
  (sourceArgument ? process.stdout : process.stderr).write(output);
  process.exit(sourceArgument ? 0 : 1);
}
const sourceRoot = path.resolve(sourceArgument);
const libraryRoot = path.join(projectRoot, "shapes-library");
const icons = [
  { displayName: "Airplane", id: "airplane", source: "airplane" },
  { displayName: "Bus", id: "bus", source: "bus" },
  { displayName: "Cloud 1", id: "cloud-1", source: "cloud1" },
  { displayName: "Cloud 2", id: "cloud-2", source: "cloud2" },
  { displayName: "Compass", id: "compass", source: "compass" },
  { displayName: "Image Mountain", id: "image-mountain", source: "image-mountain" },
  { displayName: "Map", id: "map", source: "map" },
  { displayName: "Pin", id: "pin", source: "pin" },
  { displayName: "Signpost", id: "signpost", source: "signpost" },
  { displayName: "Suitcase", id: "suitcase", source: "suitcase" },
  { displayName: "Sun", id: "sun", source: "sun" },
];
const forms = ["outline", "filled"];

function auditSvg(source, sourceName) {
  const root = source.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  if (!/\bwidth="24"/.test(root) || !/\bheight="24"/.test(root)) {
    throw new Error(`${sourceName} must use an exact 24 × 24 root frame.`);
  }
  if (!/\bviewBox="0 0 24 24"/.test(root)) {
    throw new Error(`${sourceName} must use viewBox 0 0 24 24.`);
  }
  if (/<(?:script|foreignObject|iframe|object|embed|image|video|audio|canvas|style|link|meta|use)\b|<!DOCTYPE|<\?xml|\s(?:on[a-z]+|href|xlink:href|style)\s*=/i.test(source)) {
    throw new Error(`${sourceName} contains unsafe or unsupported markup.`);
  }
  if (!/<(?:path|rect|circle|polygon|ellipse|line|polyline)\b/i.test(source)) {
    throw new Error(`${sourceName} contains no drawable geometry.`);
  }
}

const expectedSourceNames = icons
  .flatMap((icon) => forms.map((form) => `${icon.source}-${form}.svg`))
  .sort();
const actualSourceNames = (await readdir(sourceRoot))
  .filter((entry) => entry.toLowerCase().endsWith(".svg"))
  .sort();
if (JSON.stringify(actualSourceNames) !== JSON.stringify(expectedSourceNames)) {
  throw new Error(
    `Travel icon matrix mismatch. Expected ${expectedSourceNames.length} files; found ${actualSourceNames.length}.`,
  );
}

const members = [];
let importedVariants = 0;
for (const icon of icons) {
  const familyId = `travel-${icon.id}`;
  const destination = path.join(libraryRoot, "base", familyId);
  await mkdir(destination, { recursive: true });
  const variants = [];

  for (const form of forms) {
    const sourceName = `${icon.source}-${form}.svg`;
    const destinationName = `form-${form}__radius-0.svg`;
    const source = await readFile(path.join(sourceRoot, sourceName), "utf8");
    auditSvg(source, sourceName);
    await writeFile(path.join(destination, destinationName), source, "utf8");
    variants.push({
      axis: "form",
      axisValue: form,
      file: destinationName,
      id: `form-${form}__radius-0`,
      opacityUnits: { count: 1, mode: "whole-svg" },
      radiusPx: 0,
    });
    importedVariants += 1;
  }

  const manifest = {
    schemaVersion: 2,
    displayName: icon.displayName,
    defaultVariantId: "form-outline__radius-0",
    frameKind: "square",
    frame: { width: 24, height: 24 },
    viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
    variants,
  };
  await writeFile(
    path.join(destination, "shape.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  members.push({ category: "base", familyId });
}

const collection = {
  schemaVersion: 1,
  id: "travel-icon-set",
  displayName: "Travel Icon Set",
  description: "Eleven travel icons with matching outline and filled variants.",
  tags: ["travel", "icons", "outline", "filled"],
  cover: {
    category: "base",
    familyId: "travel-airplane",
    variantId: "form-outline__radius-0",
  },
  members,
};

await mkdir(path.join(libraryRoot, "collections"), { recursive: true });
await writeFile(
  path.join(libraryRoot, "collections", "travel-icon-set.collection.json"),
  `${JSON.stringify(collection, null, 2)}\n`,
  "utf8",
);

if (members.length !== 11 || importedVariants !== 22) {
  throw new Error(
    `Import matrix is incomplete: ${members.length} families, ${importedVariants} variants.`,
  );
}

process.stdout.write(`Imported ${importedVariants} Travel Icon Set variants from ${sourceRoot}.\n`);
