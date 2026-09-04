# Adding shapes and collections

Repository shapes live under `shapes-library/base/` or `shapes-library/complex/`. Use `base` for a reusable geometric or icon family with straightforward variants. Use `complex` when one visual shape contains multiple meaningful geometry parts, uses component-level opacity, or needs richer collection parameters.

## Shape family structure

Create a stable kebab-case family directory containing `shape.json` and its SVG files:

```text
shapes-library/
  base/
    example-shape/
      shape.json
      outline.svg
      filled.svg
```

Use a schema-version 2 manifest for new work. At minimum it identifies a display name, default variant, exact frame and viewBox, frame kind, and variants. Existing manifests are the source of truth for the full shape schema; start from the closest comparable family and change every identifier deliberately.

Supported frame kinds include:

- `square` for ordinary 24 × 24 artwork;
- `equilateral-full` for a full equilateral-triangle tile;
- `equilateral-half` for a 30–60–90 drafting-triangle tile.

Triangle assets must use the exact normalized dimensions and canonical orientation expected by the Triangle method. Use `/shape-tools` to normalize Figma exports before adding them to the repository. Normalization preserves geometry placement while correcting the root frame and viewBox.

## Variants and metadata

Keep filenames short and put semantic metadata in `shape.json`, not in an ever-growing filename. Variant fields can describe axes, profile IDs, radius, nominal thickness, collection parameters, or a filled form. Do not invent a new manifest field without updating the parser, validation, types, fixtures, and documentation.

For multi-part shapes, annotate independently controlled drawable elements with stable `data-shape-opacity-unit` values and declare matching `opacityUnits` metadata. Unit identifiers only need to be stable and unique inside the variant; they do not need descriptive names.

Every SVG is untrusted input until it passes the project sanitizer. Do not add scripts, event handlers, external references, embedded images, foreign objects, or styles that depend on outside resources.

## Collections

Collections are manifests in `shapes-library/collections/*.collection.json`. A collection can mix base and complex families. Provide:

- a stable `id`, display name, description, and useful tags;
- a valid cover family and variant;
- every member’s category and family ID;
- shared parameter definitions and profiles when the collection exposes them.

## Import helpers

The audited batch helpers require an explicit source directory, for example:

```bash
node scripts/import-travel-icon-set.mjs ./incoming/travel-icon-set
```

They are examples for known source batches, not a generic bypass around manifest and SVG review.

## Verification checklist

1. Run `npm run verify:quick`.
2. Open the shape library and verify filters, family navigation, preview, and every variant.
3. Add the shapes to each compatible pattern method and generate several seeds.
4. Export SVG and PNG and compare them with the canvas preview.
5. Include source and licensing information in the pull request.
