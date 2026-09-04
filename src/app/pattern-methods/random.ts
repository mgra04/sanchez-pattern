import type { PatternDistribution, PatternSource } from "../pattern-model";

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mixHash(hash: number, value: number): number {
  let next = hash ^ value;
  next = Math.imul(next ^ (next >>> 16), 0x7feb352d);
  next = Math.imul(next ^ (next >>> 15), 0x846ca68b);
  return (next ^ (next >>> 16)) >>> 0;
}

export function deterministicUnitHash(
  seed: number,
  ...parts: readonly (number | string)[]
): number {
  let hash = mixHash(0x811c9dc5, seed >>> 0);

  for (const part of parts) {
    if (typeof part === "number") {
      hash = mixHash(hash, part >>> 0);
      continue;
    }

    for (let index = 0; index < part.length; index += 1) {
      hash = mixHash(hash, part.charCodeAt(index));
    }
    hash = mixHash(hash, 0xff);
  }

  return hash / 4294967296;
}

export function selectPatternSource(
  sources: readonly PatternSource[],
  distribution: PatternDistribution,
  random: number,
): PatternSource {
  if (distribution === "equal") {
    return sources[Math.min(sources.length - 1, Math.floor(random * sources.length))]!;
  }

  const weights = sources.map((source) => Math.max(0, source.weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random * total;

  for (let index = 0; index < sources.length; index += 1) {
    cursor -= weights[index] ?? 0;
    if (cursor <= 0) return sources[index]!;
  }

  return sources[sources.length - 1]!;
}
