import { defineToolcraft } from "@/toolcraft/runtime";

import { defaultShapeToolsLibraryForm, shapeToolsTargets } from "./shape-tools-model";

export const shapeToolsControlSectionInventory = [
  {
    entity: "source SVG batch",
    groupingReason: "Built-in FileDrop owns upload, ordering, removal, and reset for the working batch.",
    targets: [shapeToolsTargets.upload],
    title: "Source SVGs",
    workflowStage: "source selection",
  },
  {
    entity: "equilateral frame model",
    groupingReason: "Role detection and manual side length jointly derive one canonical viewport.",
    targets: [shapeToolsTargets.mode, shapeToolsTargets.sideLength],
    title: "Triangle Frame",
    workflowStage: "normalization model",
  },
  {
    entity: "normalization results",
    groupingReason: "Per-file integrity, before/after previews, errors, and active selection form one validation result set.",
    targets: [shapeToolsTargets.activeMediaId],
    title: "Validation",
    workflowStage: "review",
  },
  {
    entity: "browser-local shape package",
    groupingReason: "Destination, structure, profile, and typed parameters form one validated local-library record.",
    targets: [shapeToolsTargets.libraryForm],
    title: "Local Library",
    workflowStage: "library authoring",
  },
] as const;

export const shapeToolsSchema = defineToolcraft({
  canvas: {
    draggable: true,
    enabled: true,
    size: { height: 512, unit: "px", width: 512 },
    sizing: { mode: "editable-output" },
    upload: false,
  },
  panels: {
    controls: {
      sections: [
        {
          controls: {
            upload: {
              accept: ".svg,image/svg+xml",
              assetKind: "file",
              defaultValue: null,
              description: "Files remain in this browser tab and are never uploaded to a server.",
              label: "SVG files",
              multiple: true,
              performanceReason: "A batch is parsed and validated locally when media changes.",
              performanceRole: "workload",
              target: shapeToolsTargets.upload,
              type: "fileDrop",
            },
          },
          title: "Source SVGs",
        },
        {
          controls: {
            mode: {
              defaultValue: "auto",
              description: "Auto distinguishes rounded Full and Half equilateral viewports; use manual mode only when detection is ambiguous.",
              label: "Mode",
              options: [
                { label: "Auto", value: "auto" },
                { label: "Full", value: "full" },
                { label: "Half", value: "half" },
              ],
              performanceReason: "Changing role recomputes validation for the local SVG batch.",
              performanceRole: "workload",
              target: shapeToolsTargets.mode,
              type: "segmented",
            },
            sideLength: {
              defaultValue: 24,
              description: "The exact height is derived as side × √3 / 2; descendant geometry is never scaled.",
              label: "Triangle side",
              max: 512,
              min: 1,
              performanceReason: "Manual side changes recompute canonical viewports for the local SVG batch.",
              performanceRole: "workload",
              step: 1,
              target: shapeToolsTargets.sideLength,
              type: "slider",
              unit: "px",
              visibleWhen: { notEquals: "auto", target: shapeToolsTargets.mode },
            },
          },
          title: "Triangle Frame",
        },
        {
          controls: {
            results: {
              defaultValue: "",
              description: "Select a valid result to inspect it on the canvas and download the exact root-only rewrite.",
              label: false,
              performanceReason: "The result list computes status and compact SVG previews for every uploaded file.",
              performanceRole: "workload",
              target: shapeToolsTargets.activeMediaId,
              type: "shapeNormalizationResults",
            },
          },
          title: "Validation",
        },
        {
          controls: {
            details: {
              defaultValue: defaultShapeToolsLibraryForm,
              description: "Store the active normalized SVG as a local family variant, optionally inside a parameterized collection profile.",
              label: false,
              performanceReason: "Library metadata changes do not rebuild canvas geometry until Save is used.",
              performanceRole: "responsiveness",
              target: shapeToolsTargets.libraryForm,
              type: "shapeLibraryDetails",
            },
          },
          title: "Local Library",
        },
        {
          actionGroup: "primary",
          controls: {
            download: {
              actions: [
                {
                  icon: "check",
                  label: "Save to Library",
                  value: "save-local-shape",
                  variant: "secondary",
                },
                {
                  icon: "upload-simple",
                  label: "Download SVG",
                  value: "download-normalized-svg",
                  variant: "secondary",
                },
              ],
              label: false,
              target: "actions.shapeTools",
              type: "panelActions",
            },
          },
          title: "Download",
        },
      ],
      title: "Shape Tools",
    },
    layers: false,
    timeline: false,
  },
  persistence: { storage: "none" },
  settingsTransfer: false,
  toolbar: {
    history: true,
    radar: true,
    theme: true,
    zoom: true,
  },
});
