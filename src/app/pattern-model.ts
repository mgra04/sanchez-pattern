import type {
  ShapeCategory,
  ShapeOpacityUnits,
  ShapeParameterValue,
  ShapeTileMetadata,
  ShapeVariant,
  ShapeVariantAxis,
  ShapeViewBox,
} from "./shapes/types";

export type PatternGradientStop = {
  color: string;
  opacity?: number;
  position: string;
};

export type PatternGradient = {
  angle: number;
  gradientType: "angular" | "diamond" | "linear" | "radial";
  stops: readonly PatternGradientStop[];
};

export type PatternDistribution = "equal" | "weighted";
export type PatternMethod =
  | "base-grid"
  | "directional-phases"
  | "multi-size-mosaic"
  | "triangle-lattice";
export type PhaseShareUnit = "columns" | "percent" | "rows";
export type TransitionSpreadDirection = "next" | "previous";
export type MosaicAmountMode = "count" | "coverage";

export type TransitionSpreadSettings = {
  direction: TransitionSpreadDirection;
  enabled: boolean;
  maxWidthPercent: number;
  strength: number;
};

export type PatternSource = {
  availableVariants: readonly ShapeVariant[];
  axis: ShapeVariantAxis;
  axisValue: string;
  category: ShapeCategory;
  color: string;
  familyId: string;
  familyName: string;
  fillMode: "gradient" | "solid";
  frameHeight: number;
  frameWidth: number;
  gradient: PatternGradient;
  id: string;
  name: string;
  opacity: number;
  opacityUnits: ShapeOpacityUnits;
  parameters?: Readonly<Record<string, ShapeParameterValue>>;
  profileId?: string;
  radiusPx: number;
  rotation: number;
  scale: number;
  svgBody: string;
  tile?: ShapeTileMetadata;
  variantId: string;
  viewBox: ShapeViewBox;
  weight: number;
};

export type ToolcraftColorValue = string | { hex?: unknown };

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (value && typeof value === "object") {
    const hex = (value as { hex?: unknown }).hex;
    if (typeof hex === "string" && hex.trim()) {
      return hex;
    }
  }

  return fallback;
}

function createSourceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `shape-${Date.now()}-${Math.random()}`;
}

export type PatternGridSettings = {
  autoFit: boolean;
  columns: number;
  gap: number;
  rows: number;
  seed: number;
};

export type BaseGridSettings = PatternGridSettings & {
  distribution: PatternDistribution;
};

export type DirectionalPhase = {
  distribution: PatternDistribution;
  id: string;
  name: string;
  share: number;
  sourceIds: readonly string[];
  transitionToNext: TransitionSpreadSettings;
};

export type DirectionalPhasesSettings = {
  angle: number;
  phases: readonly DirectionalPhase[];
};

export type MosaicLevel = {
  coverage: number;
  count: number;
  distribution: PatternDistribution;
  id: string;
  sourceIds: readonly string[];
};

export type MosaicClusterLevelAllocation = {
  count: number;
  coverageShare: number;
  levelId: string;
};

export type MosaicCluster = {
  allocations: readonly MosaicClusterLevelAllocation[];
  anchorCoverage: number;
  id: string;
  name: string;
  spread: number;
};

export type MosaicSettings = {
  amountMode: MosaicAmountMode;
  clusters: readonly MosaicCluster[];
  levels: readonly MosaicLevel[];
};

export type TriangleSourcePool = {
  distribution: PatternDistribution;
  sourceIds: readonly string[];
};

export type TriangleSettings = {
  alternateColumns: boolean;
  alternateElementsInRow: boolean;
  alternateRows: boolean;
  fullPool: TriangleSourcePool;
  fullTriangles: number;
  halfPool: TriangleSourcePool;
  innerGap: number;
  startMirrorX: boolean;
  startMirrorY: boolean;
};

export type OpacityDistributionEntry = {
  chance: number;
  id: string;
  opacity: number;
};

export type OpacityDistributionSettings = {
  enabled: boolean;
  mode: "each-element" | "whole-shape";
  seed: number;
  variants: readonly OpacityDistributionEntry[];
};

export type PatternAppearanceSettings = {
  opacityDistribution: OpacityDistributionSettings;
};

export type BasePatternSnapshot = {
  appearance?: PatternAppearanceSettings;
  grid: BaseGridSettings;
  method: "base-grid";
  sources: readonly PatternSource[];
};

export type DirectionalPatternSnapshot = {
  appearance?: PatternAppearanceSettings;
  directional: DirectionalPhasesSettings;
  grid: PatternGridSettings;
  method: "directional-phases";
  sources: readonly PatternSource[];
};

export type MosaicPatternSnapshot = {
  appearance?: PatternAppearanceSettings;
  grid: PatternGridSettings;
  method: "multi-size-mosaic";
  mosaic: MosaicSettings;
  sources: readonly PatternSource[];
};

export type TrianglePatternSnapshot = {
  appearance?: PatternAppearanceSettings;
  grid: PatternGridSettings;
  method: "triangle-lattice";
  sources: readonly PatternSource[];
  triangle: TriangleSettings;
};

export type PatternSnapshot =
  | BasePatternSnapshot
  | DirectionalPatternSnapshot
  | MosaicPatternSnapshot
  | TrianglePatternSnapshot;

export type PatternHistoryEntry = {
  createdAt: number;
  id: string;
  name: string;
  snapshot: PatternSnapshot;
  updatedAt: number;
};

export const defaultPatternGradient: PatternGradient = {
  angle: 45,
  gradientType: "linear",
  stops: [
    { color: "#FFFFFF", opacity: 100, position: "0%" },
    { color: "#8A8A8A", opacity: 100, position: "100%" },
  ],
};

export const defaultMosaicAnchorCoverage = 80;

export const defaultOpacityDistribution: OpacityDistributionSettings = {
  enabled: false,
  mode: "whole-shape",
  seed: 17,
  variants: [{ chance: 100, id: "opacity-1", opacity: 100 }],
};

export function normalizeOpacityDistribution(value: unknown): OpacityDistributionSettings {
  if (!value || typeof value !== "object") {
    return { ...defaultOpacityDistribution, variants: defaultOpacityDistribution.variants.map((entry) => ({ ...entry })) };
  }
  const candidate = value as Partial<OpacityDistributionSettings>;
  const variants = Array.isArray(candidate.variants)
    ? candidate.variants.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Partial<OpacityDistributionEntry>;
        const opacity = numberValue(item.opacity, 100);
        const chance = numberValue(item.chance, 0);
        return [{
          chance: Math.min(100, Math.max(0, chance)),
          id: typeof item.id === "string" && item.id ? item.id : `opacity-${index + 1}`,
          opacity: Math.min(100, Math.max(0, opacity)),
        }];
      })
    : [];
  return {
    enabled: candidate.enabled === true,
    mode: candidate.mode === "each-element" ? "each-element" : "whole-shape",
    seed: numberValue(candidate.seed, defaultOpacityDistribution.seed),
    variants: variants.length > 0
      ? variants
      : defaultOpacityDistribution.variants.map((entry) => ({ ...entry })),
  };
}

export function normalizePatternAppearance(value: unknown): PatternAppearanceSettings {
  const candidate = value && typeof value === "object"
    ? value as Partial<PatternAppearanceSettings>
    : {};
  return { opacityDistribution: normalizeOpacityDistribution(candidate.opacityDistribution) };
}

export function validateOpacityDistribution(settings: OpacityDistributionSettings): string[] {
  const errors: string[] = [];
  if (settings.variants.length === 0) errors.push("Add at least one opacity variant.");
  if (Math.abs(settings.variants.reduce((sum, entry) => sum + entry.chance, 0) - 100) > 0.000001) {
    errors.push("Opacity chances must total 100%.");
  }
  if (new Set(settings.variants.map((entry) => entry.id)).size !== settings.variants.length) {
    errors.push("Opacity variant IDs must be unique.");
  }
  return errors;
}

export function createDefaultTriangleSettings(
  sources: readonly PatternSource[],
): TriangleSettings {
  const fullIds = sources
    .filter((source) => source.tile?.role === "triangle-full")
    .map((source) => source.id);
  const halfIds = sources
    .filter((source) => source.tile?.role === "triangle-half")
    .map((source) => source.id);
  return {
    alternateColumns: false,
    alternateElementsInRow: false,
    alternateRows: false,
    fullPool: { distribution: "equal", sourceIds: fullIds },
    fullTriangles: 2,
    halfPool: { distribution: "equal", sourceIds: halfIds },
    innerGap: 1,
    startMirrorX: false,
    startMirrorY: false,
  };
}

export function createDefaultTransitionSpread(): TransitionSpreadSettings {
  return {
    direction: "previous",
    enabled: false,
    maxWidthPercent: 12.5,
    strength: 100,
  };
}

export function createDefaultDirectionalPhases(sourceId: string): DirectionalPhase[] {
  return [
    { distribution: "equal", id: "phase-1", name: "Phase 1", share: 62.5, sourceIds: [sourceId], transitionToNext: createDefaultTransitionSpread() },
    { distribution: "equal", id: "phase-2", name: "Phase 2", share: 25, sourceIds: [sourceId], transitionToNext: createDefaultTransitionSpread() },
    { distribution: "equal", id: "phase-3", name: "Phase 3", share: 12.5, sourceIds: [sourceId], transitionToNext: createDefaultTransitionSpread() },
  ];
}

export function createDefaultMosaicSettings(sourceId: string): MosaicSettings {
  const levels: MosaicLevel[] = [
    { coverage: 75, count: 0, distribution: "equal", id: "mosaic-level-1", sourceIds: [sourceId] },
    { coverage: 12.5, count: 4, distribution: "equal", id: "mosaic-level-2", sourceIds: [sourceId] },
    { coverage: 12.5, count: 1, distribution: "equal", id: "mosaic-level-3", sourceIds: [sourceId] },
  ];

  return {
    amountMode: "count",
    clusters: [
      {
        allocations: levels.slice(1).map((level) => ({
          count: level.count,
          coverageShare: 100,
          levelId: level.id,
        })),
        anchorCoverage: defaultMosaicAnchorCoverage,
        id: "mosaic-cluster-1",
        name: "Cluster 1",
        spread: 25,
      },
    ],
    levels,
  };
}

export function createPatternSource(params: {
  availableVariants?: readonly ShapeVariant[];
  axis: ShapeVariantAxis;
  axisValue: string;
  category: ShapeCategory;
  familyId: string;
  familyName: string;
  frame?: { height: number; width: number };
  opacityUnits?: ShapeOpacityUnits;
  parameters?: Readonly<Record<string, ShapeParameterValue>>;
  profileId?: string;
  radiusPx: number;
  svgBody: string;
  tile?: ShapeTileMetadata;
  variantId: string;
  viewBox?: ShapeViewBox;
}): PatternSource {
  return {
    ...params,
    availableVariants: params.availableVariants ?? [],
    color: "#FFFFFF",
    fillMode: "solid",
    frameHeight: params.frame?.height ?? 24,
    frameWidth: params.frame?.width ?? 24,
    gradient: defaultPatternGradient,
    id: createSourceId(),
    name: params.familyName,
    opacity: 100,
    opacityUnits: params.opacityUnits ?? { count: 1, mode: "whole-svg" },
    rotation: 0,
    scale: 100,
    viewBox: params.viewBox ?? { height: 24, minX: 0, minY: 0, width: 24 },
    weight: 1,
  };
}

export function clonePatternSource(
  source: PatternSource,
  existingNames: readonly string[],
): PatternSource {
  const baseName = `${source.name || source.familyName} copy`;
  let name = baseName;
  let suffix = 2;
  const names = new Set(existingNames.map((entry) => entry.trim().toLowerCase()));

  while (names.has(name.toLowerCase())) {
    name = `${baseName} ${suffix}`;
    suffix += 1;
  }

  return {
    ...source,
    gradient: {
      ...source.gradient,
      stops: source.gradient.stops.map((stop) => ({ ...stop })),
    },
    id: createSourceId(),
    name,
  };
}

export function isPatternSource(value: unknown): value is PatternSource {
  if (!value || typeof value !== "object") {
    return false;
  }

  const source = value as Partial<PatternSource>;

  return (
    typeof source.id === "string" &&
    typeof source.familyId === "string" &&
    typeof source.svgBody === "string" &&
    typeof source.frameWidth === "number" &&
    typeof source.frameHeight === "number"
  );
}

export function getPatternSources(value: unknown): PatternSource[] {
  return Array.isArray(value)
    ? value.filter(isPatternSource).map((source) => ({
        ...source,
        color: normalizeHexColor(source.color, "#FFFFFF"),
        opacityUnits: source.opacityUnits ?? { count: 1, mode: "whole-svg" },
        name:
          typeof source.name === "string" && source.name.trim()
            ? source.name.trim()
            : source.familyName,
        viewBox: source.viewBox ?? {
          height: source.frameHeight,
          minX: 0,
          minY: 0,
          width: source.frameWidth,
        },
      }))
    : [];
}

export function clonePatternSnapshot(snapshot: PatternSnapshot): PatternSnapshot {
  const common = {
    appearance: normalizePatternAppearance(snapshot.appearance),
    grid: { ...snapshot.grid },
    sources: getPatternSources(snapshot.sources).map((source) => ({
      ...source,
      availableVariants: source.availableVariants.map((variant) => ({ ...variant })),
      gradient: {
        ...source.gradient,
        stops: source.gradient.stops.map((stop) => ({ ...stop })),
      },
    })),
  };

  if (snapshot.method === "directional-phases") {
    return {
      ...common,
      directional: {
        angle: snapshot.directional.angle,
        phases: snapshot.directional.phases.map((phase) => ({
          ...phase,
          sourceIds: [...phase.sourceIds],
          transitionToNext: { ...phase.transitionToNext },
        })),
      },
      method: "directional-phases",
    };
  }

  if (snapshot.method === "multi-size-mosaic") {
    return {
      ...common,
      method: "multi-size-mosaic",
      mosaic: {
        amountMode: snapshot.mosaic.amountMode,
        clusters: snapshot.mosaic.clusters.map((cluster) => ({
          ...cluster,
          allocations: cluster.allocations.map((allocation) => ({ ...allocation })),
        })),
        levels: snapshot.mosaic.levels.map((level) => ({
          ...level,
          sourceIds: [...level.sourceIds],
        })),
      },
    };
  }

  if (snapshot.method === "triangle-lattice") {
    return {
      ...common,
      method: "triangle-lattice",
      triangle: {
        ...snapshot.triangle,
        fullPool: {
          ...snapshot.triangle.fullPool,
          sourceIds: [...snapshot.triangle.fullPool.sourceIds],
        },
        halfPool: {
          ...snapshot.triangle.halfPool,
          sourceIds: [...snapshot.triangle.halfPool.sourceIds],
        },
      },
    };
  }

  return { ...common, grid: { ...snapshot.grid }, method: "base-grid" };
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function distributionValue(value: unknown): PatternDistribution {
  return value === "weighted" ? "weighted" : "equal";
}

function normalizeTransitionSpread(value: unknown): TransitionSpreadSettings {
  const fallback = createDefaultTransitionSpread();
  if (!value || typeof value !== "object") return fallback;
  const transition = value as Partial<TransitionSpreadSettings>;

  return {
    direction: transition.direction === "next" ? "next" : "previous",
    enabled: booleanValue(transition.enabled, fallback.enabled),
    maxWidthPercent: numberValue(transition.maxWidthPercent, fallback.maxWidthPercent),
    strength: numberValue(transition.strength, fallback.strength),
  };
}

function normalizeGrid(value: unknown): BaseGridSettings | null {
  if (!value || typeof value !== "object") return null;
  const grid = value as Partial<BaseGridSettings>;
  return {
    autoFit: booleanValue(grid.autoFit, true),
    columns: numberValue(grid.columns, 16),
    distribution: distributionValue(grid.distribution),
    gap: numberValue(grid.gap, 1),
    rows: numberValue(grid.rows, 8),
    seed: numberValue(grid.seed, 42),
  };
}

export function normalizeDirectionalPhase(value: unknown, index: number): DirectionalPhase | null {
  if (!value || typeof value !== "object") return null;
  const phase = value as Partial<DirectionalPhase>;
  if (!Array.isArray(phase.sourceIds)) return null;

  return {
    distribution: distributionValue(phase.distribution),
    id: typeof phase.id === "string" && phase.id ? phase.id : `phase-${index + 1}`,
    name:
      typeof phase.name === "string" && phase.name.trim()
        ? phase.name.trim()
        : `Phase ${index + 1}`,
    share: numberValue(phase.share, 0),
    sourceIds: phase.sourceIds.filter((id): id is string => typeof id === "string"),
    transitionToNext: normalizeTransitionSpread(phase.transitionToNext),
  };
}

function normalizeMosaicLevel(value: unknown, index: number): MosaicLevel | null {
  if (!value || typeof value !== "object") return null;
  const level = value as Partial<MosaicLevel>;
  if (!Array.isArray(level.sourceIds)) return null;

  return {
    coverage: numberValue(level.coverage, index === 0 ? 100 : 0),
    count: numberValue(level.count, 0),
    distribution: distributionValue(level.distribution),
    id: typeof level.id === "string" && level.id ? level.id : `mosaic-level-${index + 1}`,
    sourceIds: level.sourceIds.filter((id): id is string => typeof id === "string"),
  };
}

function normalizeMosaicCluster(value: unknown, index: number): MosaicCluster | null {
  if (!value || typeof value !== "object") return null;
  const cluster = value as Partial<MosaicCluster>;
  if (!Array.isArray(cluster.allocations)) return null;

  const allocations = cluster.allocations.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const allocation = value as Partial<MosaicClusterLevelAllocation>;
    if (typeof allocation.levelId !== "string") return [];
    return [{
      count: numberValue(allocation.count, 0),
      coverageShare: numberValue(allocation.coverageShare, 0),
      levelId: allocation.levelId,
    }];
  });
  if (allocations.length !== cluster.allocations.length) return null;

  return {
    allocations,
    anchorCoverage: numberValue(cluster.anchorCoverage, defaultMosaicAnchorCoverage),
    id: typeof cluster.id === "string" && cluster.id ? cluster.id : `mosaic-cluster-${index + 1}`,
    name:
      typeof cluster.name === "string" && cluster.name.trim()
        ? cluster.name.trim()
        : `Cluster ${index + 1}`,
    spread: numberValue(cluster.spread, 25),
  };
}

export function normalizePatternSnapshot(value: unknown): PatternSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    appearance?: unknown;
    directional?: unknown;
    grid?: unknown;
    method?: unknown;
    mosaic?: unknown;
    sources?: unknown;
    triangle?: unknown;
  };
  const grid = normalizeGrid(candidate.grid);
  const sources = getPatternSources(candidate.sources);
  const appearance = normalizePatternAppearance(candidate.appearance);
  if (!grid || !Array.isArray(candidate.sources)) return null;

  if (candidate.method === "directional-phases") {
    if (!candidate.directional || typeof candidate.directional !== "object") return null;
    const directional = candidate.directional as { angle?: unknown; phases?: unknown };
    if (!Array.isArray(directional.phases)) return null;
    const phases = directional.phases.flatMap((phase, index) => {
      const normalized = normalizeDirectionalPhase(phase, index);
      return normalized ? [normalized] : [];
    });
    if (phases.length !== directional.phases.length) return null;

    return {
      appearance,
      directional: { angle: numberValue(directional.angle, 0), phases },
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


  if (candidate.method === "multi-size-mosaic") {
    if (!candidate.mosaic || typeof candidate.mosaic !== "object") return null;
    const mosaic = candidate.mosaic as {
      amountMode?: unknown;
      clusters?: unknown;
      levels?: unknown;
    };
    if (!Array.isArray(mosaic.levels) || !Array.isArray(mosaic.clusters)) return null;
    const levels = mosaic.levels.flatMap((level, index) => {
      const normalized = normalizeMosaicLevel(level, index);
      return normalized ? [normalized] : [];
    });
    const clusters = mosaic.clusters.flatMap((cluster, index) => {
      const normalized = normalizeMosaicCluster(cluster, index);
      return normalized ? [normalized] : [];
    });
    if (levels.length !== mosaic.levels.length || clusters.length !== mosaic.clusters.length) {
      return null;
    }

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
      mosaic: {
        amountMode: mosaic.amountMode === "coverage" ? "coverage" : "count",
        clusters,
        levels,
      },
      sources,
    };
  }

  if (candidate.method === "triangle-lattice") {
    const fallback = createDefaultTriangleSettings(sources);
    if (!candidate.triangle || typeof candidate.triangle !== "object") return null;
    const triangle = candidate.triangle as Partial<TriangleSettings>;
    const normalizePool = (
      value: unknown,
      fallbackPool: TriangleSourcePool,
    ): TriangleSourcePool => {
      if (!value || typeof value !== "object") return fallbackPool;
      const pool = value as Partial<TriangleSourcePool>;
      return {
        distribution: distributionValue(pool.distribution),
        sourceIds: Array.isArray(pool.sourceIds)
          ? pool.sourceIds.filter((id): id is string => typeof id === "string")
          : fallbackPool.sourceIds,
      };
    };
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
      triangle: {
        alternateColumns: booleanValue(triangle.alternateColumns, fallback.alternateColumns),
        alternateElementsInRow: booleanValue(
          triangle.alternateElementsInRow,
          fallback.alternateElementsInRow,
        ),
        alternateRows: booleanValue(triangle.alternateRows, fallback.alternateRows),
        fullPool: normalizePool(triangle.fullPool, fallback.fullPool),
        fullTriangles: numberValue(triangle.fullTriangles, fallback.fullTriangles),
        halfPool: normalizePool(triangle.halfPool, fallback.halfPool),
        innerGap: numberValue(triangle.innerGap, fallback.innerGap),
        startMirrorX: booleanValue(triangle.startMirrorX, fallback.startMirrorX),
        startMirrorY: booleanValue(triangle.startMirrorY, fallback.startMirrorY),
      },
    };
  }

  if (candidate.method !== undefined && candidate.method !== "base-grid") return null;

  return { appearance, grid, method: "base-grid", sources };
}

export function getPatternHistory(value: unknown): PatternHistoryEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const entry = candidate as Partial<PatternHistoryEntry>;
    if (
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.createdAt !== "number" ||
      typeof entry.updatedAt !== "number" ||
      !normalizePatternSnapshot(entry.snapshot)
    ) {
      return [];
    }

    const snapshot = normalizePatternSnapshot(entry.snapshot)!;
    return [{
      createdAt: entry.createdAt,
      id: entry.id,
      name: entry.name.trim() || "Untitled pattern",
      snapshot: clonePatternSnapshot(snapshot),
      updatedAt: entry.updatedAt,
    }];
  });
}

export function getUniquePatternName(
  requestedName: unknown,
  history: readonly PatternHistoryEntry[],
): string {
  const requested =
    typeof requestedName === "string" && requestedName.trim()
      ? requestedName.trim()
      : `Pattern ${history.length + 1}`;
  const names = new Set(history.map((entry) => entry.name.trim().toLowerCase()));

  if (!names.has(requested.toLowerCase())) return requested;

  let suffix = 2;
  while (names.has(`${requested} ${suffix}`.toLowerCase())) suffix += 1;
  return `${requested} ${suffix}`;
}

export function createPatternHistoryEntry(params: {
  history: readonly PatternHistoryEntry[];
  name: unknown;
  now?: number;
  snapshot: PatternSnapshot;
}): PatternHistoryEntry {
  const now = params.now ?? Date.now();
  return {
    createdAt: now,
    id: globalThis.crypto?.randomUUID?.() ?? `pattern-${now}-${Math.random()}`,
    name: getUniquePatternName(params.name, params.history),
    snapshot: clonePatternSnapshot(params.snapshot),
    updatedAt: now,
  };
}
