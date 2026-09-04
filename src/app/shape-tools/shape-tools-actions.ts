import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";

import { geometryFitsViewport, measureSvgGeometryBounds } from "./geometry-bounds";
import {
  defaultShapeToolsLibraryForm,
  getActiveShapeToolResult,
  shapeToolsTargets,
  type ShapeToolsLibraryForm,
} from "./shape-tools-model";
import { saveActiveShapeToolToLibrary } from "./library-authoring";

function downloadSvg(source: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const handleShapeToolsPanelAction: ToolcraftPanelActionHandler = async ({
  action,
  dispatch,
  reportProgress,
  state,
}) => {
  if (action.value === "save-local-shape") {
    reportProgress(0.15);
    const form = {
      ...defaultShapeToolsLibraryForm,
      ...(state.values[shapeToolsTargets.libraryForm] as Partial<ShapeToolsLibraryForm> | undefined),
    };
    const saved = await saveActiveShapeToolToLibrary(state, form);
    reportProgress(0.9);
    dispatch({
      history: "skip",
      target: shapeToolsTargets.libraryStatus,
      type: "controls.setValue",
      value: `${saved.family.displayName} saved to the local library.`,
    });
    reportProgress(1);
    return;
  }
  if (action.value !== "download-normalized-svg") return;
  reportProgress(0.15);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const active = getActiveShapeToolResult(state);
  if (!active) throw new Error("Add and select a valid SVG before downloading.");
  if (active.status === "error") throw new Error(active.error);
  reportProgress(0.5);
  const bounds = measureSvgGeometryBounds(active.result.normalizedSource);
  if (!geometryFitsViewport(bounds, active.result.targetViewport)) {
    throw new Error("Geometry extends outside the canonical viewport.");
  }
  if (!active.result.geometryUnchanged) {
    throw new Error("Normalization changed descendant geometry and was blocked.");
  }
  reportProgress(0.8);
  downloadSvg(active.result.normalizedSource, active.result.outputFileName);
  reportProgress(1);
};
