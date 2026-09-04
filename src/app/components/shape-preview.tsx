import * as React from "react";

import type { PatternSource } from "../pattern-model";
import { hasShapeStrokePaint, scopeShapeSvgBody } from "../shapes/svg";

export function ShapePreview({
  className,
  svgBody,
  viewBox = { height: 24, minX: 0, minY: 0, width: 24 },
}: {
  className?: string;
  svgBody: string;
  viewBox?: { height: number; minX: number; minY: number; width: number };
}): React.JSX.Element {
  const usesStrokePaint = hasShapeStrokePaint(svgBody);
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      stroke={usesStrokePaint ? "currentColor" : undefined}
      viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
    >
      <g dangerouslySetInnerHTML={{ __html: svgBody }} />
    </svg>
  );
}

export function PatternSourcePreview({
  className,
  source,
}: {
  className?: string;
  source: PatternSource;
}): React.JSX.Element {
  const scope = React.useId().replace(/[^a-z0-9_-]/gi, "-");
  const gradientId = `preview-gradient-${scope}`;
  const scale = Math.max(0.05, source.scale / 100);
  const gradient = source.gradient;
  const isRadial = gradient.gradientType === "radial" || gradient.gradientType === "diamond";
  const fill = source.fillMode === "solid" ? source.color : `url(#${gradientId})`;
  const scopedSvgBody = scopeShapeSvgBody(source.svgBody, `preview-shape-${scope}`);
  const usesStrokePaint = hasShapeStrokePaint(source.svgBody);

  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox={`${source.viewBox.minX} ${source.viewBox.minY} ${source.viewBox.width} ${source.viewBox.height}`}
    >
      <defs>
        {isRadial ? (
          <radialGradient id={gradientId}>
            {gradient.stops.map((stop, index) => (
              <stop
                key={`${stop.position}-${index}`}
                offset={stop.position}
                stopColor={stop.color}
                stopOpacity={(stop.opacity ?? 100) / 100}
              />
            ))}
          </radialGradient>
        ) : (
          <linearGradient
            gradientTransform={`rotate(${gradient.angle} .5 .5)`}
            id={gradientId}
            x1="0%"
            x2="100%"
            y1="50%"
            y2="50%"
          >
            {gradient.stops.map((stop, index) => (
              <stop
                key={`${stop.position}-${index}`}
                offset={stop.position}
                stopColor={stop.color}
                stopOpacity={(stop.opacity ?? 100) / 100}
              />
            ))}
          </linearGradient>
        )}
      </defs>
      <g
        dangerouslySetInnerHTML={{ __html: scopedSvgBody }}
        data-pattern-source-geometry="true"
        fill={fill}
        opacity={Math.min(100, Math.max(0, source.opacity)) / 100}
        stroke={usesStrokePaint ? fill : undefined}
        transform={`translate(${source.viewBox.minX + source.viewBox.width / 2} ${source.viewBox.minY + source.viewBox.height / 2}) rotate(${source.rotation}) scale(${scale}) translate(${-source.viewBox.minX - source.viewBox.width / 2} ${-source.viewBox.minY - source.viewBox.height / 2})`}
      />
    </svg>
  );
}
