import * as React from "react";

import { shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

import {
  getActivePattern,
  getActivePatternSnapshot,
  patternTargets,
} from "./pattern-state";
import { getPatternCellCount, getPatternOutputSize } from "./pattern-methods/registry";
import { PatternSvgDocument } from "./pattern-svg";
import { normalizeHexColor } from "./pattern-model";

const previewCellBatchSize = 256;

function ProgressivePatternSvg({
  background,
  canvasHeight,
  canvasWidth,
  includeBackground,
  snapshot,
}: {
  background: string;
  canvasHeight: number;
  canvasWidth: number;
  includeBackground: boolean;
  snapshot: NonNullable<ReturnType<typeof getActivePatternSnapshot>>;
}): React.JSX.Element {
  const totalCells = getPatternCellCount(snapshot);
  const [cellLimit, setCellLimit] = React.useState(() => Math.min(1, totalCells));

  React.useEffect(() => {
    if (cellLimit >= totalCells) return;
    const frame = requestAnimationFrame(() => {
      setCellLimit((current) => Math.min(totalCells, current + previewCellBatchSize));
    });
    return () => cancelAnimationFrame(frame);
  }, [cellLimit, totalCells]);

  return (
    <PatternSvgDocument
      background={background}
      canvasHeight={canvasHeight}
      canvasWidth={canvasWidth}
      cellLimit={cellLimit}
      includeBackground={includeBackground}
      snapshot={snapshot}
    />
  );
}

export function PatternRenderer(): React.JSX.Element | null {
  const { dispatch, state } = useToolcraft();
  const lastAutoFitExtent = React.useRef<string | null>(null);
  const snapshot = React.useMemo(
    () => getActivePatternSnapshot(state.values),
    [
      state.values[patternTargets.history],
    ],
  );
  const activePattern = React.useMemo(
    () => getActivePattern(state.values),
    [state.values[patternTargets.history]],
  );

  React.useEffect(() => {
    if (!snapshot || !snapshot.grid.autoFit) {
      lastAutoFitExtent.current = null;
      return;
    }

    const size = getPatternOutputSize(snapshot);
    const extentKey = `${size.width}x${size.height}`;
    if (lastAutoFitExtent.current === extentKey) return;
    lastAutoFitExtent.current = extentKey;
    if (
      size.width > 0 &&
      size.height > 0 &&
      (size.width !== state.canvas.size.width || size.height !== state.canvas.size.height)
    ) {
      dispatch({ size: { ...size, unit: "px" }, type: "canvas.setSize" });
    }
  }, [
    snapshot,
    dispatch,
    state.canvas.size.height,
    state.canvas.size.width,
  ]);

  if (!snapshot) {
    return null;
  }

  const background = normalizeHexColor(state.values["appearance.background"], "#D9DCE4");
  const includeBackground = shouldIncludeToolcraftPreviewBackground({ state });
  const signature = JSON.stringify({
    method: snapshot.method,
    grid: snapshot.grid,
    directional: snapshot.method === "directional-phases" ? snapshot.directional : undefined,
    mosaic: snapshot.method === "multi-size-mosaic" ? snapshot.mosaic : undefined,
    triangle: snapshot.method === "triangle-lattice" ? snapshot.triangle : undefined,
    sources: snapshot.sources.map((source) => ({
      fillMode: source.fillMode,
      color: source.color,
      frameHeight: source.frameHeight,
      frameWidth: source.frameWidth,
      id: source.id,
      gradient: source.gradient,
      opacity: source.opacity,
      rotation: source.rotation,
      scale: source.scale,
      variantId: source.variantId,
      weight: source.weight,
      tile: source.tile,
      viewBox: source.viewBox,
    })),
  });

  return (
    <div
      className="absolute inset-0 size-full"
      data-pattern-signature={signature}
      data-testid="pattern-renderer"
    >
      <ProgressivePatternSvg
        background={background}
        canvasHeight={state.canvas.size.height}
        canvasWidth={state.canvas.size.width}
        includeBackground={includeBackground}
        key={`${activePattern?.id ?? "pattern"}-${activePattern?.updatedAt ?? 0}`}
        snapshot={snapshot}
      />
    </div>
  );
}
