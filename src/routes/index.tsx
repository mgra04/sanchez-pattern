import { ToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "../app/app-schema";
import { patternControlRenderers } from "../app/controls/pattern-controls";
import { handlePatternPanelAction } from "../app/pattern-actions";
import { PatternRenderer } from "../app/pattern-renderer";

export function AppHome(): React.JSX.Element {
  return (
    <ToolcraftApp
      canvasContent={<PatternRenderer />}
      className="h-dvh min-h-dvh"
      controlRenderers={patternControlRenderers}
      onPanelAction={handlePatternPanelAction}
      renderDefaultCanvasMedia={false}
      schema={appSchema}
    />
  );
}
