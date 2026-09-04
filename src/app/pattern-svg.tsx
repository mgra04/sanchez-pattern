import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PatternGradient, PatternSnapshot, PatternSource } from "./pattern-model";
import { getPatternCellAppearance } from "./pattern-appearance";
import { generatePatternCells, getPatternOutputSize } from "./pattern-methods/registry";
import { applyOpacitySignatureToSvgBody } from "./shapes/opacity-units";
import { hasShapeStrokePaint, scopeShapeSvgBody } from "./shapes/svg";

function safeId(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "-");
}

function parsePosition(position: string): number {
  const value = Number.parseFloat(position);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function getLinearCoordinates(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(radians) * 0.5;
  const y = Math.sin(radians) * 0.5;
  return {
    x1: `${(0.5 - x) * 100}%`,
    x2: `${(0.5 + x) * 100}%`,
    y1: `${(0.5 - y) * 100}%`,
    y2: `${(0.5 + y) * 100}%`,
  };
}

function GradientStops({ gradient }: { gradient: PatternGradient }): React.JSX.Element {
  return (
    <>
      {[...gradient.stops]
        .sort((left, right) => parsePosition(left.position) - parsePosition(right.position))
        .map((stop, index) => (
          <stop
            key={`${stop.position}-${stop.color}-${index}`}
            offset={`${parsePosition(stop.position)}%`}
            stopColor={stop.color}
            stopOpacity={Math.min(100, Math.max(0, stop.opacity ?? 100)) / 100}
          />
        ))}
    </>
  );
}

const SourceDefinitions = React.memo(function SourceDefinitions({
  definitionSuffix = "",
  renderFill = true,
  source,
  unitOpacities = [],
}: {
  definitionSuffix?: string;
  renderFill?: boolean;
  source: PatternSource;
  unitOpacities?: readonly number[];
}): React.JSX.Element {
  const id = safeId(source.id);
  const definitionId = `${id}${definitionSuffix}`;
  const opacityBody = applyOpacitySignatureToSvgBody(source.svgBody, unitOpacities);
  const scopedBody = scopeShapeSvgBody(opacityBody, definitionId);
  const coordinates = getLinearCoordinates(
    source.gradient.angle + (source.gradient.gradientType === "angular" ? 90 : 0),
  );
  const useRadial =
    source.gradient.gradientType === "radial" ||
    source.gradient.gradientType === "diamond";
  const scale = Math.max(0.05, source.scale / 100);
  const centerX = source.frameWidth / 2;
  const centerY = source.frameHeight / 2;
  const geometryScaleX = source.frameWidth / source.viewBox.width;
  const geometryScaleY = source.frameHeight / source.viewBox.height;

  return (
    <>
      <g
        dangerouslySetInnerHTML={{ __html: scopedBody }}
        id={`shape-instance-${definitionId}`}
        transform={`translate(${centerX} ${centerY}) rotate(${source.rotation}) scale(${scale}) translate(${-centerX} ${-centerY}) scale(${geometryScaleX} ${geometryScaleY}) translate(${-source.viewBox.minX} ${-source.viewBox.minY})`}
      />
      {renderFill && useRadial ? (
        <radialGradient
          cx="50%"
          cy="50%"
          gradientTransform={
            source.gradient.gradientType === "diamond"
              ? "rotate(45 .5 .5) scale(1.15 .72)"
              : undefined
          }
          id={`shape-fill-${id}`}
          r={source.gradient.gradientType === "diamond" ? "72%" : "70%"}
        >
          <GradientStops gradient={source.gradient} />
        </radialGradient>
      ) : renderFill ? (
        <linearGradient id={`shape-fill-${id}`} {...coordinates}>
          <GradientStops gradient={source.gradient} />
        </linearGradient>
      ) : null}
    </>
  );
}, (previous, next) =>
  previous.definitionSuffix === next.definitionSuffix &&
  previous.renderFill === next.renderFill &&
  previous.unitOpacities?.join("|") === next.unitOpacities?.join("|") &&
  previous.source.id === next.source.id &&
  previous.source.svgBody === next.source.svgBody &&
  previous.source.gradient === next.source.gradient &&
  previous.source.frameHeight === next.source.frameHeight &&
  previous.source.frameWidth === next.source.frameWidth &&
  previous.source.rotation === next.source.rotation &&
  previous.source.scale === next.source.scale,
);

function getFrameMirrorTransform(params: {
  frameHeight: number;
  frameWidth: number;
  mirrorX: boolean;
  mirrorY: boolean;
}): string {
  return `${params.mirrorX ? `translate(${params.frameWidth} 0) scale(-1 1)` : ""} ${params.mirrorY ? `translate(0 ${params.frameHeight}) scale(1 -1)` : ""}`.trim();
}

function getTriangleTransforms(params: {
  frameHeight: number;
  frameWidth: number;
  source: PatternSource;
  triangleMirrorX?: boolean;
  triangleMirrorY?: boolean;
}) {
  const slotMirrorX = Boolean(params.triangleMirrorX);
  const slotMirrorY = Boolean(params.triangleMirrorY);
  const canonicalMirrorX = Boolean(params.source.tile?.canonicalTransform?.mirrorX);
  const canonicalMirrorY = Boolean(params.source.tile?.canonicalTransform?.mirrorY);
  return {
    canonicalMirrorX,
    canonicalMirrorY,
    canonicalTransform: getFrameMirrorTransform({
      frameHeight: params.frameHeight,
      frameWidth: params.frameWidth,
      mirrorX: canonicalMirrorX,
      mirrorY: canonicalMirrorY,
    }),
    effectiveMirrorX: slotMirrorX !== canonicalMirrorX,
    effectiveMirrorY: slotMirrorY !== canonicalMirrorY,
    slotMirrorX,
    slotMirrorY,
    slotTransform: getFrameMirrorTransform({
      frameHeight: params.frameHeight,
      frameWidth: params.frameWidth,
      mirrorX: slotMirrorX,
      mirrorY: slotMirrorY,
    }),
  };
}

const PatternCell = React.memo(function PatternCell({
  baselinePhaseId,
  cellIndex,
  definitionId,
  frameHeight,
  frameWidth,
  mosaicClusterId,
  mosaicLevelId,
  mosaicSpan,
  phaseId,
  portable,
  source,
  sourceId,
  spreadBoundaryId,
  triangleElementColumn,
  triangleElementRow,
  triangleMirrorX,
  triangleMirrorY,
  triangleRole,
  triangleSlot,
  unitOpacities,
  wholeOpacity,
  x,
  y,
}: {
  baselinePhaseId?: string;
  cellIndex: number;
  definitionId: string;
  frameHeight: number;
  frameWidth: number;
  mosaicClusterId?: string;
  mosaicLevelId?: string;
  mosaicSpan?: number;
  phaseId?: string;
  portable: boolean;
  source: PatternSource;
  sourceId: string;
  spreadBoundaryId?: string;
  triangleElementColumn?: number;
  triangleElementRow?: number;
  triangleMirrorX?: boolean;
  triangleMirrorY?: boolean;
  triangleRole?: "triangle-full" | "triangle-half";
  triangleSlot?: number;
  unitOpacities: readonly number[];
  wholeOpacity: number;
  x: number;
  y: number;
}): React.JSX.Element {
  if (portable) {
    const id = safeId(source.id);
    const scale = Math.max(0.05, source.scale / 100);
    const centerX = source.frameWidth / 2;
    const centerY = source.frameHeight / 2;
    const geometryScaleX = source.frameWidth / source.viewBox.width;
    const geometryScaleY = source.frameHeight / source.viewBox.height;
    const cellScaleX = frameWidth / source.frameWidth;
    const cellScaleY = frameHeight / source.frameHeight;

    const geometry = (
      <g
        data-pattern-baseline-phase={baselinePhaseId}
        data-pattern-cluster={mosaicClusterId}
        data-pattern-level={mosaicLevelId}
        data-pattern-phase={phaseId}
        data-pattern-span={mosaicSpan}
        data-pattern-spread-boundary={spreadBoundaryId}
        dangerouslySetInnerHTML={{
          __html: scopeShapeSvgBody(
            applyOpacitySignatureToSvgBody(source.svgBody, unitOpacities),
            `${id}-cell-${cellIndex}`,
          ),
        }}
        opacity={wholeOpacity}
        transform={`scale(${cellScaleX} ${cellScaleY}) translate(${centerX} ${centerY}) rotate(${source.rotation}) scale(${scale}) translate(${-centerX} ${-centerY}) scale(${geometryScaleX} ${geometryScaleY}) translate(${-source.viewBox.minX} ${-source.viewBox.minY})`}
      />
    );
    if (!triangleRole) {
      return <g transform={`translate(${x} ${y})`}>{geometry}</g>;
    }
    const orientation = getTriangleTransforms({
      frameHeight,
      frameWidth,
      source,
      triangleMirrorX,
      triangleMirrorY,
    });
    return (
      <g
        clipPath={`url(#pattern-clip-${triangleRole})`}
        data-pattern-effective-mirror-x={orientation.effectiveMirrorX ? "true" : "false"}
        data-pattern-effective-mirror-y={orientation.effectiveMirrorY ? "true" : "false"}
        data-pattern-element-column={triangleElementColumn}
        data-pattern-element-row={triangleElementRow}
        data-pattern-mirror-x={orientation.slotMirrorX ? "true" : "false"}
        data-pattern-mirror-y={orientation.slotMirrorY ? "true" : "false"}
        data-pattern-role={triangleRole}
        data-pattern-slot={triangleSlot}
        transform={`translate(${x} ${y}) ${orientation.slotTransform}`}
      >
        <g
          data-pattern-canonical-mirror-x={orientation.canonicalMirrorX ? "true" : "false"}
          data-pattern-canonical-mirror-y={orientation.canonicalMirrorY ? "true" : "false"}
          data-pattern-canonical-source="true"
          transform={orientation.canonicalTransform || undefined}
        >
          {geometry}
        </g>
      </g>
    );
  }

  const instance = (
    <use
      data-pattern-baseline-phase={baselinePhaseId}
      data-pattern-cluster={mosaicClusterId}
      data-pattern-level={mosaicLevelId}
      data-pattern-phase={phaseId}
      data-pattern-span={mosaicSpan}
      data-pattern-spread-boundary={spreadBoundaryId}
      data-pattern-opacity-signature={definitionId}
      href={`#shape-instance-${definitionId}`}
      opacity={wholeOpacity}
      transform={`scale(${frameWidth / source.frameWidth} ${frameHeight / source.frameHeight})`}
    />
  );
  if (!triangleRole) {
    return <g transform={`translate(${x} ${y})`}>{instance}</g>;
  }
  const orientation = getTriangleTransforms({
    frameHeight,
    frameWidth,
    source,
    triangleMirrorX,
    triangleMirrorY,
  });
  return (
    <g
      clipPath={`url(#pattern-clip-${triangleRole})`}
      data-pattern-effective-mirror-x={orientation.effectiveMirrorX ? "true" : "false"}
      data-pattern-effective-mirror-y={orientation.effectiveMirrorY ? "true" : "false"}
      data-pattern-element-column={triangleElementColumn}
      data-pattern-element-row={triangleElementRow}
      data-pattern-mirror-x={orientation.slotMirrorX ? "true" : "false"}
      data-pattern-mirror-y={orientation.slotMirrorY ? "true" : "false"}
      data-pattern-role={triangleRole}
      data-pattern-slot={triangleSlot}
      transform={`translate(${x} ${y}) ${orientation.slotTransform}`}
    >
      <g
        data-pattern-canonical-mirror-x={orientation.canonicalMirrorX ? "true" : "false"}
        data-pattern-canonical-mirror-y={orientation.canonicalMirrorY ? "true" : "false"}
        data-pattern-canonical-source="true"
        transform={orientation.canonicalTransform || undefined}
      >
        {instance}
      </g>
    </g>
  );
}, (previous, next) =>
  previous.portable === next.portable &&
  previous.baselinePhaseId === next.baselinePhaseId &&
  previous.phaseId === next.phaseId &&
  previous.frameHeight === next.frameHeight &&
  previous.frameWidth === next.frameWidth &&
  previous.mosaicClusterId === next.mosaicClusterId &&
  previous.mosaicLevelId === next.mosaicLevelId &&
  previous.mosaicSpan === next.mosaicSpan &&
  previous.spreadBoundaryId === next.spreadBoundaryId &&
  previous.triangleMirrorX === next.triangleMirrorX &&
  previous.triangleMirrorY === next.triangleMirrorY &&
  previous.triangleRole === next.triangleRole &&
  previous.triangleSlot === next.triangleSlot &&
  previous.cellIndex === next.cellIndex &&
  previous.definitionId === next.definitionId &&
  previous.wholeOpacity === next.wholeOpacity &&
  previous.unitOpacities === next.unitOpacities &&
  previous.x === next.x &&
  previous.y === next.y &&
  previous.sourceId === next.sourceId &&
  previous.source === next.source,
);

export const PatternSvgDocument = React.memo(function PatternSvgDocument({
  background,
  cellLimit,
  canvasHeight,
  canvasWidth,
  includeBackground,
  portableInstances = false,
  snapshot,
}: {
  background: string;
  cellLimit?: number;
  canvasHeight: number;
  canvasWidth: number;
  includeBackground: boolean;
  portableInstances?: boolean;
  snapshot: PatternSnapshot;
}): React.JSX.Element {
  const allCells = React.useMemo(() => generatePatternCells(snapshot), [snapshot]);
  const cells =
    typeof cellLimit === "number" ? allCells.slice(0, Math.max(0, cellLimit)) : allCells;
  const renderedCells = React.useMemo(
    () => cells.map((cell) => ({
      appearance: getPatternCellAppearance({
        cellIndex: cell.index,
        snapshot,
        source: cell.source,
      }),
      cell,
    })),
    [cells, snapshot],
  );
  const unitDefinitions = React.useMemo(() => {
    const definitions = new Map<string, {
      definitionId: string;
      signature: string;
      source: PatternSource;
      unitOpacities: readonly number[];
    }>();
    for (const rendered of renderedCells) {
      if (rendered.appearance.unitOpacities.length === 0) continue;
      const sourceId = safeId(rendered.cell.source.id);
      const definitionId = `${sourceId}-${safeId(rendered.appearance.signature)}`;
      definitions.set(`${rendered.cell.source.id}/${rendered.appearance.signature}`, {
        definitionId,
        signature: rendered.appearance.signature,
        source: rendered.cell.source,
        unitOpacities: rendered.appearance.unitOpacities,
      });
    }
    return [...definitions.values()];
  }, [renderedCells]);
  const outputSize = getPatternOutputSize(snapshot);
  const offsetX = (canvasWidth - outputSize.width) / 2;
  const offsetY = (canvasHeight - outputSize.height) / 2;
  const triangleFullCell = allCells.find((cell) => cell.triangleRole === "triangle-full");
  const triangleHalfCell = allCells.find((cell) => cell.triangleRole === "triangle-half");
  const triangleClipHeight = triangleFullCell?.frameHeight ?? triangleHalfCell?.frameHeight;
  const triangleFullWidth = triangleFullCell?.frameWidth;
  const triangleHalfWidth = triangleHalfCell?.frameWidth;

  return (
    <svg
      data-toolcraft-product-output="pattern"
      data-pattern-cell-count={cells.length}
      data-pattern-cell-total={allCells.length}
      data-pattern-method={snapshot.method}
      height={canvasHeight}
      role="img"
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      width={canvasWidth}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {triangleClipHeight !== undefined && triangleFullWidth !== undefined ? (
          <clipPath clipPathUnits="userSpaceOnUse" id="pattern-clip-triangle-full">
            <polygon
              points={`0,${triangleClipHeight} ${triangleFullWidth / 2},0 ${triangleFullWidth},${triangleClipHeight}`}
            />
          </clipPath>
        ) : null}
        {triangleClipHeight !== undefined && triangleHalfWidth !== undefined ? (
          <clipPath clipPathUnits="userSpaceOnUse" id="pattern-clip-triangle-half">
            <polygon points={`0,0 ${triangleHalfWidth},0 0,${triangleClipHeight}`} />
          </clipPath>
        ) : null}
        {snapshot.sources.map((source) => (
          <SourceDefinitions key={source.id} source={source} />
        ))}
        {!portableInstances
          ? unitDefinitions.map((definition) => (
              <SourceDefinitions
                definitionSuffix={`-${safeId(definition.signature)}`}
                key={definition.definitionId}
                renderFill={false}
                source={definition.source}
                unitOpacities={definition.unitOpacities}
              />
            ))
          : null}
      </defs>
      {includeBackground ? (
        <rect data-pattern-background="true" fill={background} height={canvasHeight} width={canvasWidth} />
      ) : null}
      <g data-pattern-grid="true" transform={`translate(${offsetX} ${offsetY})`}>
        {snapshot.sources.map((source) => {
          const fill =
            source.fillMode === "solid"
              ? source.color
              : `url(#shape-fill-${safeId(source.id)})`;
          const stroke = hasShapeStrokePaint(source.svgBody) ? fill : undefined;

          return (
            <g
              data-pattern-source={source.id}
              fill={fill}
              key={source.id}
              opacity={Math.min(100, Math.max(0, source.opacity)) / 100}
              stroke={stroke}
            >
              {renderedCells
                .filter(({ cell }) => cell.source.id === source.id)
                .map(({ appearance, cell }) => {
                  const definitionId = appearance.unitOpacities.length > 0
                    ? `${safeId(cell.source.id)}-${safeId(appearance.signature)}`
                    : safeId(cell.source.id);
                  return (
                  <PatternCell
                    baselinePhaseId={cell.baselinePhaseId}
                    cellIndex={cell.index}
                    definitionId={definitionId}
                    frameHeight={cell.frameHeight}
                    frameWidth={cell.frameWidth}
                    key={cell.index}
                    mosaicClusterId={cell.mosaicClusterId}
                    mosaicLevelId={cell.mosaicLevelId}
                    mosaicSpan={cell.mosaicSpan}
                    phaseId={cell.phaseId}
                    portable={portableInstances}
                    source={cell.source}
                    sourceId={cell.source.id}
                    spreadBoundaryId={cell.spreadBoundaryId}
                    triangleElementColumn={cell.triangleElementColumn}
                    triangleElementRow={cell.triangleElementRow}
                    triangleMirrorX={cell.triangleMirrorX}
                    triangleMirrorY={cell.triangleMirrorY}
                    triangleRole={cell.triangleRole}
                    triangleSlot={cell.triangleSlot}
                    unitOpacities={appearance.unitOpacities}
                    wholeOpacity={appearance.wholeOpacity}
                    x={cell.x}
                    y={cell.y}
                  />
                  );
                })}
            </g>
          );
        })}
      </g>
    </svg>
  );
});

export function createPatternSvgMarkup(params: {
  background: string;
  canvasHeight: number;
  canvasWidth: number;
  includeBackground: boolean;
  snapshot: PatternSnapshot;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>${renderToStaticMarkup(
    <PatternSvgDocument {...params} portableInstances />,
  )}`;
}
