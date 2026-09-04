import type {
  ToolcraftComponentAcceptance,
  ToolcraftTransferMode,
} from "../app-acceptance";

export const shapeToolsTransferMode: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  mode: "new-toolcraft-app",
};

export const shapeToolsAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName: "normalizes rounded triangle SVG roots without changing geometry",
    browser: true,
    browserTestName: "browser: normalizes a Figma triangle SVG without moving geometry",
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    expectedObservable:
      "Uploading one or more SVG files creates an ordered local validation batch; thumbnail reorder changes runtime media order and the validation preview consumes that order, removing or clearing files removes their results, and Reset clears the batch because no default asset exists.",
    fixture: "rounded 24 by 21 Figma-exported equilateral triangle SVG",
    id: "shapeTools.upload",
    kind: "control",
    target: "shapeTools.upload",
    userAction:
      "Upload two SVG files, reorder their thumbnails and verify the result preview follows the new runtime media order, remove one, upload it again, run Reset, and verify the local media batch and canvas preview clear without changing either file's geometry.",
  },
  {
    automated: true,
    automatedTestName: "normalizes rounded triangle SVG roots without changing geometry",
    browser: true,
    browserTestName: "browser: normalizes a Figma triangle SVG without moving geometry",
    componentType: "segmented",
    evidence: "product-output",
    expectedObservable:
      "Auto detects Full or Half equilateral frames, while Full and Half manual choices derive the requested canonical frame and update every result preview.",
    fixture: "full and half rounded Figma triangle SVG batch",
    id: "shapeTools.mode",
    kind: "control",
    optionCoverage: ["auto", "full", "half"],
    target: "shapeTools.mode",
    userAction:
      "Switch Auto, Full, and Half and verify the per-file status, normalized frame dimensions, selected result, and canvas output update.",
  },
  {
    automated: true,
    automatedTestName: "normalizes rounded triangle SVG roots without changing geometry",
    browser: true,
    browserTestName: "browser: normalizes a Figma triangle SVG without moving geometry",
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "The side slider is hidden and unavailable in Auto, becomes visible in manual Full or Half mode, and changes only the root width, height, and viewBox while descendant SVG markup stays byte-for-byte unchanged.",
    fixture: "manual 24 px equilateral triangle normalization",
    id: "shapeTools.sideLength",
    kind: "control",
    target: "shapeTools.sideLength",
    userAction:
      "Verify Triangle side is hidden in Auto, choose Full or Half and verify it becomes visible, change it and compare the normalized root frame, unchanged geometry preview, and canvas output, then return to Auto and verify the slider is hidden again.",
  },
  {
    automated: true,
    automatedTestName: "normalizes rounded triangle SVG roots without changing geometry",
    browser: true,
    browserTestName: "browser: normalizes a Figma triangle SVG without moving geometry",
    builtInFitCheck: {
      checkedBuiltIns: ["fileDrop", "collectionActions", "actions", "imagePicker"],
      closestBuiltIn: "collectionActions",
      productObservable:
        "Each uploaded file needs status, before and after SVG previews, detected role, exact frame values, geometry-integrity feedback, and active-result selection.",
      whyInsufficient:
        "CollectionActions cannot compute and display per-file SVG validation, paired vector previews, geometry bounds, role detection, and one active downloadable result as a single atomic review surface.",
    },
    componentType: "shapeNormalizationResults",
    customControlCoverage: "all-custom-control-behavior",
    evidence: "product-output",
    expectedObservable:
      "Every file has an independent valid or error result; selecting a valid row changes the canvas preview and invalid or overflowing geometry cannot be downloaded.",
    fixture: "one valid rounded triangle and one incompatible SVG",
    id: "shapeTools.activeMediaId",
    kind: "control",
    target: "shapeTools.activeMediaId",
    userAction:
      "Upload a mixed batch, inspect the paired previews and errors, select a valid result, verify the canvas preview changes, and confirm geometry overflow blocks output.",
  },
  {
    automated: true,
    automatedTestName: "validates local shape package metadata and annotates automatic opacity units",
    browser: true,
    browserTestName: "browser: saves a normalized SVG to the local shape library",
    builtInFitCheck: {
      checkedBuiltIns: ["text", "select", "segmented", "collectionActions", "actions"],
      closestBuiltIn: "collectionActions",
      productObservable:
        "One authoring transaction combines family destination, variant identity, category, whole-or-separate opacity structure, optional collection/profile parameters, validation, and browser-local persistence.",
      whyInsufficient:
        "Separate built-ins cannot validate family/profile consistency, annotate ordered SVG units, and atomically save a normalized family plus optional collection profile.",
    },
    componentType: "shapeLibraryDetails",
    customControlCoverage: "all-custom-control-behavior",
    evidence: "persistence-state",
    expectedObservable:
      "A valid normalized result can be saved as a local family variant; Separate Elements assigns stable numeric units, optional collection/profile metadata is retained, and invalid or colliding built-in metadata is rejected inline.",
    fixture: "normalized four-path equilateral triangle glyph with Profile A parameters",
    id: "shapeTools.libraryForm",
    kind: "control",
    target: "shapeTools.libraryForm",
    userAction:
      "Select a valid normalized SVG, enter local family and variant metadata, choose Separate Elements, optionally enter a collection profile, save it, then open Shapes Library and verify the persisted variant and unit count after reload.",
  },
  {
    actionCoverage: ["save-local-shape", "download-normalized-svg"],
    automated: true,
    automatedTestName: "normalizes rounded triangle SVG roots without changing geometry",
    browser: true,
    browserTestName: "browser: downloads the selected normalized SVG",
    componentType: "panelActions",
    evidence: "exported-bytes",
    expectedObservable:
      "Download SVG emits the selected sanitized SVG with canonical root dimensions and viewBox, unchanged descendant markup, and a normalized filename.",
    fixture: "selected valid full-triangle normalization result",
    id: "actions.shapeTools",
    kind: "control",
    target: "actions.shapeTools",
    userAction:
      "Select a valid normalization result, click Download SVG, and inspect the filename and bytes for the canonical root-only rewrite.",
  },
];
