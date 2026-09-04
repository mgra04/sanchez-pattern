import * as React from "react";

import { useToolcraft } from "@/toolcraft/runtime/react";

import { getActiveShapeToolResult, shapeToolsTargets } from "./shape-tools-model";

export function ShapeToolsRenderer(): React.JSX.Element | null {
  const { state } = useToolcraft();
  const active = React.useMemo(
    () => getActiveShapeToolResult(state),
    [
      state.mediaAssets,
      state.values[shapeToolsTargets.activeMediaId],
      state.values[shapeToolsTargets.mode],
      state.values[shapeToolsTargets.sideLength],
    ],
  );
  if (!active || active.status !== "valid") return null;

  return (
    <div
      className="absolute inset-[8%] grid place-items-center [&>svg]:max-h-full [&>svg]:max-w-full"
      data-shape-tools-preview={active.assetId}
      data-testid="shape-tools-preview"
      data-toolcraft-product-output
      dangerouslySetInnerHTML={{ __html: active.result.normalizedSource }}
    />
  );
}
