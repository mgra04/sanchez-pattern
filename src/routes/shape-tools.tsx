import { ToolcraftApp } from "@/toolcraft/runtime/react";

import { handleShapeToolsPanelAction } from "../app/shape-tools/shape-tools-actions";
import { shapeToolsControlRenderers } from "../app/shape-tools/shape-tools-control";
import { ShapeToolsRenderer } from "../app/shape-tools/shape-tools-renderer";
import { shapeToolsSchema } from "../app/shape-tools/shape-tools-schema";

export function ShapeToolsHome(): React.JSX.Element {
  return (
    <ToolcraftApp
      canvasContent={<ShapeToolsRenderer />}
      className="h-dvh min-h-dvh"
      controlRenderers={shapeToolsControlRenderers}
      onPanelAction={handleShapeToolsPanelAction}
      renderDefaultCanvasMedia={false}
      schema={shapeToolsSchema}
    />
  );
}
