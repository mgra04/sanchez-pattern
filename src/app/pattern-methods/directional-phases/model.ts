import {
  createDefaultTransitionSpread,
  type DirectionalPhase,
  type PhaseShareUnit,
} from "../../pattern-model";
import { normalizeDirectionAngle } from "./strategy";

export function getDirectionalShareUnitOptions(angle: number): readonly PhaseShareUnit[] {
  const normalized = normalizeDirectionAngle(angle);
  if (normalized === 0 || normalized === 180) return ["percent", "columns"];
  if (normalized === 90 || normalized === 270) return ["percent", "rows"];
  return ["percent"];
}

export function normalizePhaseShares(phases: readonly DirectionalPhase[]): DirectionalPhase[] {
  if (phases.length === 0) return [];
  const positive = phases.map((phase) => Math.max(0, Number.isFinite(phase.share) ? phase.share : 0));
  const total = positive.reduce((sum, share) => sum + share, 0);
  const raw = total > 0 ? positive.map((share) => (share / total) * 100) : phases.map(() => 100 / phases.length);
  let allocated = 0;

  return phases.map((phase, index) => {
    const share = index === phases.length - 1 ? Number((100 - allocated).toFixed(6)) : Number(raw[index]!.toFixed(6));
    allocated += share;
    return { ...phase, share };
  });
}

export function phaseShareToUnit(
  share: number,
  unit: PhaseShareUnit,
  rows: number,
  columns: number,
): number {
  if (unit === "columns") return (share / 100) * columns;
  if (unit === "rows") return (share / 100) * rows;
  return share;
}

export function phaseShareFromUnit(
  value: number,
  unit: PhaseShareUnit,
  rows: number,
  columns: number,
): number {
  if (unit === "columns") return columns > 0 ? (value / columns) * 100 : 0;
  if (unit === "rows") return rows > 0 ? (value / rows) * 100 : 0;
  return value;
}

export function transitionWidthToUnit(
  widthPercent: number,
  unit: PhaseShareUnit,
  rows: number,
  columns: number,
): number {
  return phaseShareToUnit(widthPercent, unit, rows, columns);
}

export function transitionWidthFromUnit(
  value: number,
  unit: PhaseShareUnit,
  rows: number,
  columns: number,
): number {
  return phaseShareFromUnit(value, unit, rows, columns);
}

export function createDirectionalPhase(
  index: number,
  sourceIds: readonly string[],
): DirectionalPhase {
  return {
    distribution: "equal",
    id: globalThis.crypto?.randomUUID?.() ?? `phase-${Date.now()}-${Math.random()}`,
    name: `Phase ${index + 1}`,
    share: 0,
    sourceIds: [...sourceIds],
    transitionToNext: createDefaultTransitionSpread(),
  };
}
