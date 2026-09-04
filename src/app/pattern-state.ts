import type { ToolcraftCommand, ToolcraftState } from "@/toolcraft/runtime";

import {
  defaultPatternGradient,
  clonePatternSnapshot,
  createDefaultDirectionalPhases,
  createDefaultMosaicSettings,
  createDefaultTriangleSettings,
  getPatternHistory,
  getPatternSources,
  normalizeDirectionalPhase,
  normalizeHexColor,
  normalizeOpacityDistribution,
  normalizePatternSnapshot,
  type BaseGridSettings,
  type DirectionalPhase,
  type DirectionalPhasesSettings,
  type PatternMethod,
  type MosaicSettings,
  type OpacityDistributionSettings,
  type PatternGradient,
  type PatternHistoryEntry,
  type PatternSnapshot,
  type PatternSource,
  type TriangleSettings,
} from "./pattern-model";
import type { ShapeVariant } from "./shapes/types";

export const patternTargets = {
  angle: "pattern.directionalPhases.angle",
  autoFit: "pattern.baseGrid.autoFit",
  color: "pattern.source.color",
  columns: "pattern.baseGrid.columns",
  distribution: "pattern.baseGrid.distribution",
  fillMode: "pattern.source.fillMode",
  frameHeight: "pattern.source.frameHeight",
  frameWidth: "pattern.source.frameWidth",
  gap: "pattern.baseGrid.gap",
  gradient: "pattern.source.gradient",
  history: "pattern.history",
  method: "pattern.method",
  mosaicAmountMode: "pattern.mosaic.amountMode",
  mosaicConfig: "pattern.mosaic.config",
  opacityDistribution: "pattern.appearance.opacityDistribution",
  opacity: "pattern.source.opacity",
  patternName: "pattern.name",
  rotation: "pattern.source.rotation",
  rows: "pattern.baseGrid.rows",
  scale: "pattern.source.scale",
  seed: "pattern.baseGrid.seed",
  selectedSourceId: "pattern.selectedSourceId",
  shareUnit: "pattern.directionalPhases.shareUnit",
  sources: "pattern.sources",
  triangleConfig: "pattern.triangle.config",
  phases: "pattern.directionalPhases.phases",
  variant: "pattern.source.variant",
  weight: "pattern.source.weight",
} as const;

export type PatternVariantValue = Pick<
  ShapeVariant,
  "axis" | "axisValue" | "id" | "opacityUnits" | "parameters" | "profileId" | "radiusPx" | "svgBody"
> & { familyId: string };

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

export function getBaseGridSettings(values: Record<string, unknown>): BaseGridSettings {
  return {
    autoFit: values[patternTargets.autoFit] !== false,
    columns: numberValue(values[patternTargets.columns], 16),
    distribution: stringValue(
      values[patternTargets.distribution],
      ["equal", "weighted"] as const,
      "equal",
    ),
    gap: numberValue(values[patternTargets.gap], 1),
    rows: numberValue(values[patternTargets.rows], 8),
    seed: numberValue(values[patternTargets.seed], 42),
  };
}

export function getPatternMethod(values: Record<string, unknown>): PatternMethod {
  if (values[patternTargets.method] === "directional-phases") return "directional-phases";
  if (values[patternTargets.method] === "multi-size-mosaic") return "multi-size-mosaic";
  if (values[patternTargets.method] === "triangle-lattice") return "triangle-lattice";
  return "base-grid";
}

export function getOpacityDistributionSettings(
  values: Record<string, unknown>,
): OpacityDistributionSettings {
  return normalizeOpacityDistribution(values[patternTargets.opacityDistribution]);
}

export function getTriangleSettings(values: Record<string, unknown>): TriangleSettings {
  const sources = getPatternSources(values[patternTargets.sources]);
  const fallback = createDefaultTriangleSettings(sources);
  const normalized = normalizePatternSnapshot({
    grid: getBaseGridSettings(values),
    method: "triangle-lattice",
    sources,
    triangle: values[patternTargets.triangleConfig] ?? fallback,
  });
  return normalized?.method === "triangle-lattice" ? normalized.triangle : fallback;
}

export function getMosaicSettings(values: Record<string, unknown>): MosaicSettings {
  const sources = getPatternSources(values[patternTargets.sources]);
  const fallback = createDefaultMosaicSettings(sources[0]?.id ?? "");
  const config = values[patternTargets.mosaicConfig];
  if (!config || typeof config !== "object") {
    return {
      ...fallback,
      amountMode: values[patternTargets.mosaicAmountMode] === "coverage" ? "coverage" : "count",
    };
  }
  const candidate = config as Partial<Pick<MosaicSettings, "clusters" | "levels">>;
  const normalized = normalizePatternSnapshot({
    grid: getBaseGridSettings(values),
    method: "multi-size-mosaic",
    mosaic: {
      amountMode: values[patternTargets.mosaicAmountMode] === "coverage" ? "coverage" : "count",
      clusters: candidate.clusters,
      levels: candidate.levels,
    },
    sources,
  });
  return normalized?.method === "multi-size-mosaic" ? normalized.mosaic : fallback;
}

export function getDirectionalPhases(values: Record<string, unknown>): DirectionalPhase[] {
  const sources = getPatternSources(values[patternTargets.sources]);
  const value = values[patternTargets.phases];
  if (!Array.isArray(value)) return createDefaultDirectionalPhases(sources[0]?.id ?? "");

  return value.flatMap((phase, index) => {
    const normalized = normalizeDirectionalPhase(phase, index);
    return normalized ? [normalized] : [];
  });
}

export function getDirectionalPhasesSettings(
  values: Record<string, unknown>,
): DirectionalPhasesSettings {
  return {
    angle: numberValue(values[patternTargets.angle], 0),
    phases: getDirectionalPhases(values),
  };
}

export function getSelectedSource(values: Record<string, unknown>): PatternSource | undefined {
  const sources = getPatternSources(values[patternTargets.sources]);
  const selectedId = values[patternTargets.selectedSourceId];

  return sources.find((source) => source.id === selectedId) ?? sources[0];
}

function isGradient(value: unknown): value is PatternGradient {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as PatternGradient).stops),
  );
}

function isVariantValue(value: unknown): value is PatternVariantValue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const variant = value as Partial<PatternVariantValue>;
  return (
    (variant.axis === "form" || variant.axis === "weight") &&
    typeof variant.axisValue === "string" &&
    typeof variant.id === "string" &&
    typeof variant.familyId === "string" &&
    Boolean(variant.opacityUnits) &&
    typeof variant.radiusPx === "number" &&
    typeof variant.svgBody === "string"
  );
}

export function applyInspectorValues(
  source: PatternSource,
  values: Record<string, unknown>,
): PatternSource {
  const variant = values[patternTargets.variant];
  const gradient = values[patternTargets.gradient];
  const nextVariant = isVariantValue(variant) ? variant : null;
  const resolvedVariant =
    nextVariant?.familyId === source.familyId &&
    source.availableVariants.some((entry) => entry.id === nextVariant.id)
      ? nextVariant
      : null;

  return {
    ...source,
    axis: resolvedVariant?.axis ?? source.axis,
    axisValue: resolvedVariant?.axisValue ?? source.axisValue,
    color: normalizeHexColor(values[patternTargets.color], source.color),
    fillMode: stringValue(
      values[patternTargets.fillMode],
      ["gradient", "solid"] as const,
      source.fillMode,
    ),
    frameHeight: numberValue(values[patternTargets.frameHeight], source.frameHeight),
    frameWidth: numberValue(values[patternTargets.frameWidth], source.frameWidth),
    gradient: isGradient(gradient) ? gradient : source.gradient,
    opacity: numberValue(values[patternTargets.opacity], source.opacity),
    opacityUnits: resolvedVariant?.opacityUnits ?? source.opacityUnits,
    parameters: resolvedVariant?.parameters ?? source.parameters,
    profileId: resolvedVariant?.profileId ?? source.profileId,
    radiusPx: resolvedVariant?.radiusPx ?? source.radiusPx,
    rotation: numberValue(values[patternTargets.rotation], source.rotation),
    scale: numberValue(values[patternTargets.scale], source.scale),
    svgBody: resolvedVariant?.svgBody ?? source.svgBody,
    variantId: resolvedVariant?.id ?? source.variantId,
    weight: numberValue(values[patternTargets.weight], source.weight),
  };
}

export function getEffectivePatternSources(values: Record<string, unknown>): PatternSource[] {
  const sources = getPatternSources(values[patternTargets.sources]);
  const selected = getSelectedSource(values);

  return sources.map((source) =>
    selected && source.id === selected.id ? applyInspectorValues(source, values) : source,
  );
}

export function getCurrentPatternSnapshot(values: Record<string, unknown>): PatternSnapshot {
  const grid = getBaseGridSettings(values);
  const sources = getEffectivePatternSources(values);
  const appearance = { opacityDistribution: getOpacityDistributionSettings(values) };
  if (getPatternMethod(values) === "directional-phases") {
    return {
      appearance,
      directional: getDirectionalPhasesSettings(values),
      grid: {
        autoFit: grid.autoFit,
        columns: grid.columns,
        gap: grid.gap,
        rows: grid.rows,
        seed: grid.seed,
      },
      method: "directional-phases",
      sources,
    };
  }

  if (getPatternMethod(values) === "multi-size-mosaic") {
    return {
      appearance,
      grid: {
        autoFit: grid.autoFit,
        columns: grid.columns,
        gap: grid.gap,
        rows: grid.rows,
        seed: grid.seed,
      },
      method: "multi-size-mosaic",
      mosaic: getMosaicSettings(values),
      sources,
    };
  }

  if (getPatternMethod(values) === "triangle-lattice") {
    return {
      appearance,
      grid: {
        autoFit: grid.autoFit,
        columns: grid.columns,
        gap: grid.gap,
        rows: grid.rows,
        seed: grid.seed,
      },
      method: "triangle-lattice",
      sources,
      triangle: getTriangleSettings(values),
    };
  }

  return { appearance, grid, method: "base-grid", sources };
}

export function getStoredPatternSnapshot(value: unknown): PatternSnapshot | null {
  return normalizePatternSnapshot(value);
}

export function getActivePattern(
  values: Record<string, unknown>,
): PatternHistoryEntry | null {
  return getPatternHistory(values[patternTargets.history]).at(-1) ?? null;
}

export function getActivePatternSnapshot(
  values: Record<string, unknown>,
): PatternSnapshot | null {
  const active = getActivePattern(values);
  return active ? clonePatternSnapshot(active.snapshot) : null;
}

function dispatchValue(
  dispatch: React.Dispatch<ToolcraftCommand>,
  target: string,
  value: unknown,
  history: "merge" | "record" | "skip" = "skip",
): void {
  dispatch({ history, target, type: "controls.setValue", value });
}

export function persistSelectedSource(
  dispatch: React.Dispatch<ToolcraftCommand>,
  state: ToolcraftState,
): PatternSource[] {
  const sources = getEffectivePatternSources(state.values);
  dispatchValue(dispatch, patternTargets.sources, sources, "skip");
  return sources;
}

export function loadSourceIntoInspector(
  dispatch: React.Dispatch<ToolcraftCommand>,
  source: PatternSource,
): void {
  dispatchValue(dispatch, patternTargets.selectedSourceId, source.id);
  dispatchValue(dispatch, patternTargets.frameWidth, source.frameWidth);
  dispatchValue(dispatch, patternTargets.frameHeight, source.frameHeight);
  dispatchValue(dispatch, patternTargets.scale, source.scale);
  dispatchValue(dispatch, patternTargets.rotation, source.rotation);
  dispatchValue(dispatch, patternTargets.opacity, source.opacity);
  dispatchValue(dispatch, patternTargets.weight, source.weight);
  dispatchValue(dispatch, patternTargets.fillMode, source.fillMode);
  dispatchValue(dispatch, patternTargets.color, source.color);
  dispatchValue(dispatch, patternTargets.gradient, source.gradient ?? defaultPatternGradient);
  dispatchValue(dispatch, patternTargets.variant, {
    axis: source.axis,
    axisValue: source.axisValue,
    familyId: source.familyId,
    id: source.variantId,
    opacityUnits: source.opacityUnits,
    parameters: source.parameters,
    profileId: source.profileId,
    radiusPx: source.radiusPx,
    svgBody: source.svgBody,
  } satisfies PatternVariantValue);
}

export function selectPatternSource(
  dispatch: React.Dispatch<ToolcraftCommand>,
  state: ToolcraftState,
  sourceId: string,
): void {
  const sources = persistSelectedSource(dispatch, state);
  const source = sources.find((entry) => entry.id === sourceId);

  if (source) {
    loadSourceIntoInspector(dispatch, source);
  }
}

export function loadSnapshotIntoDraft(
  dispatch: React.Dispatch<ToolcraftCommand>,
  snapshot: PatternSnapshot,
): void {
  const next = clonePatternSnapshot(snapshot);
  dispatchValue(dispatch, patternTargets.method, next.method, "record");
  dispatchValue(dispatch, patternTargets.sources, next.sources, "record");
  dispatchValue(dispatch, patternTargets.rows, next.grid.rows);
  dispatchValue(dispatch, patternTargets.columns, next.grid.columns);
  dispatchValue(dispatch, patternTargets.gap, next.grid.gap);
  dispatchValue(dispatch, patternTargets.seed, next.grid.seed);
  dispatchValue(dispatch, patternTargets.autoFit, next.grid.autoFit);
  dispatchValue(
    dispatch,
    patternTargets.opacityDistribution,
    next.appearance?.opacityDistribution ?? normalizeOpacityDistribution(undefined),
  );

  if (next.method === "directional-phases") {
    dispatchValue(dispatch, patternTargets.angle, next.directional.angle);
    dispatchValue(dispatch, patternTargets.phases, next.directional.phases);
    dispatchValue(dispatch, patternTargets.shareUnit, "percent");
  } else if (next.method === "multi-size-mosaic") {
    dispatchValue(dispatch, patternTargets.mosaicAmountMode, next.mosaic.amountMode);
    dispatchValue(dispatch, patternTargets.mosaicConfig, {
      clusters: next.mosaic.clusters,
      levels: next.mosaic.levels,
    });
  } else if (next.method === "triangle-lattice") {
    dispatchValue(dispatch, patternTargets.triangleConfig, next.triangle);
  } else {
    dispatchValue(dispatch, patternTargets.distribution, next.grid.distribution);
  }

  if (next.sources[0]) {
    loadSourceIntoInspector(dispatch, next.sources[0]);
  } else {
    dispatchValue(dispatch, patternTargets.selectedSourceId, "");
  }
}
