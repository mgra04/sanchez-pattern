import {
  normalizePatternAppearance,
  type OpacityDistributionSettings,
  type PatternSnapshot,
  type PatternSource,
} from "./pattern-model";
import { deterministicUnitHash } from "./pattern-methods/random";

export type PatternCellAppearance = {
  signature: string;
  unitOpacities: readonly number[];
  wholeOpacity: number;
};

function drawOpacity(
  settings: OpacityDistributionSettings,
  cellIndex: number,
  sourceId: string,
  unitIndex: number,
): number {
  const random = deterministicUnitHash(
    settings.seed,
    "opacity",
    cellIndex,
    sourceId,
    unitIndex,
  ) * 100;
  let cursor = 0;
  for (const variant of settings.variants) {
    cursor += variant.chance;
    if (random < cursor) return variant.opacity / 100;
  }
  return (settings.variants.at(-1)?.opacity ?? 100) / 100;
}

export function getPatternCellAppearance(params: {
  cellIndex: number;
  snapshot: PatternSnapshot;
  source: PatternSource;
}): PatternCellAppearance {
  const settings = normalizePatternAppearance(params.snapshot.appearance).opacityDistribution;
  if (!settings.enabled) {
    return { signature: "default", unitOpacities: [], wholeOpacity: 1 };
  }

  const unitCount = params.source.opacityUnits?.mode === "separate-elements"
    ? params.source.opacityUnits.count
    : 1;
  if (settings.mode === "whole-shape" || unitCount === 1) {
    const wholeOpacity = drawOpacity(settings, params.cellIndex, params.source.id, 1);
    return {
      signature: `whole-${wholeOpacity}`,
      unitOpacities: [],
      wholeOpacity,
    };
  }

  const unitOpacities = Array.from({ length: unitCount }, (_, index) =>
    drawOpacity(settings, params.cellIndex, params.source.id, index + 1),
  );
  return {
    signature: `units-${unitOpacities.join("-")}`,
    unitOpacities,
    wholeOpacity: 1,
  };
}

export function getUsedPatternAppearanceSignatures(snapshot: PatternSnapshot): Map<string, Set<string>> {
  const signatures = new Map<string, Set<string>>();
  const settings = normalizePatternAppearance(snapshot.appearance).opacityDistribution;
  if (!settings.enabled) return signatures;
  for (const source of snapshot.sources) signatures.set(source.id, new Set<string>());
  return signatures;
}
