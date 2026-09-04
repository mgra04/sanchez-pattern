import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";
import { Button, Input, ToggleGroup, ToggleGroupItem } from "@/toolcraft/ui";
import {
  Slider as PrimitiveSlider,
  Switch as PrimitiveSwitch,
} from "@/toolcraft/ui/components/primitives";

import { PatternSourcePreview } from "../components/shape-preview";
import {
  getPatternSources,
  normalizeDirectionalPhase,
  type DirectionalPhase,
  type PatternDistribution,
  type PhaseShareUnit,
  type TransitionSpreadDirection,
} from "../pattern-model";
import {
  createDirectionalPhase,
  getDirectionalShareUnitOptions,
  normalizePhaseShares,
  phaseShareFromUnit,
  phaseShareToUnit,
  transitionWidthFromUnit,
  transitionWidthToUnit,
} from "../pattern-methods/directional-phases/model";
import { patternTargets } from "../pattern-state";

function getPhases(value: unknown): DirectionalPhase[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((phase, index) => {
    const normalized = normalizeDirectionalPhase(phase, index);
    return normalized ? [normalized] : [];
  });
}

function formatShare(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function DirectionalPhasesControl({
  dispatch,
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps<DirectionalPhase[]>): React.JSX.Element {
  const phases = getPhases(value);
  const sources = getPatternSources(state.values[patternTargets.sources]);
  const angle = Number(state.values[patternTargets.angle] ?? 0);
  const rows = Number(state.values[patternTargets.rows] ?? 8);
  const columns = Number(state.values[patternTargets.columns] ?? 16);
  const unitOptions = getDirectionalShareUnitOptions(Number.isFinite(angle) ? angle : 0);
  const storedUnit = state.values[patternTargets.shareUnit];
  const unit: PhaseShareUnit = unitOptions.includes(storedUnit as PhaseShareUnit)
    ? (storedUnit as PhaseShareUnit)
    : "percent";
  const [selectedId, setSelectedId] = React.useState<string | null>(phases[0]?.id ?? null);
  const selected = phases.find((phase) => phase.id === selectedId) ?? phases[0];
  const selectedIndex = selected ? phases.findIndex((phase) => phase.id === selected.id) : -1;
  const nextPhase = selectedIndex >= 0 ? phases[selectedIndex + 1] : undefined;
  const total = phases.reduce((sum, phase) => sum + phase.share, 0);
  const totalValid = Math.abs(total - 100) <= 0.0001;

  React.useEffect(() => {
    if (selectedId && phases.some((phase) => phase.id === selectedId)) return;
    setSelectedId(phases[0]?.id ?? null);
  }, [phases, selectedId]);

  React.useEffect(() => {
    if (unitOptions.includes(storedUnit as PhaseShareUnit)) return;
    dispatch({
      history: "skip",
      target: patternTargets.shareUnit,
      type: "controls.setValue",
      value: "percent",
    });
  }, [dispatch, storedUnit, unitOptions]);

  function commit(next: DirectionalPhase[], history: "merge" | "record" = "record"): void {
    setValue(next, { history });
  }

  function updatePhase(phaseId: string, patch: Partial<DirectionalPhase>, history: "merge" | "record" = "record"): void {
    commit(phases.map((phase) => (phase.id === phaseId ? { ...phase, ...patch } : phase)), history);
  }

  function addPhase(): void {
    const phase = {
      ...createDirectionalPhase(phases.length, sources[0] ? [sources[0].id] : []),
      share: phases.length > 0 ? 100 / (phases.length + 1) : 100,
    };
    const next = normalizePhaseShares([...phases, phase]);
    commit(next);
    setSelectedId(phase.id);
  }

  function removePhase(phaseId: string): void {
    if (phases.length <= 2) return;
    const next = normalizePhaseShares(phases.filter((phase) => phase.id !== phaseId));
    commit(next);
    setSelectedId(next[0]?.id ?? null);
  }

  function movePhase(phaseId: string, direction: -1 | 1): void {
    const currentIndex = phases.findIndex((phase) => phase.id === phaseId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= phases.length) return;
    const next = [...phases];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(nextIndex, 0, moved!);
    commit(next);
  }

  function setUnit(nextUnit: PhaseShareUnit): void {
    dispatch({
      history: "skip",
      target: patternTargets.shareUnit,
      type: "controls.setValue",
      value: nextUnit,
    });
  }

  function toggleSource(phase: DirectionalPhase, sourceId: string): void {
    const assigned = phase.sourceIds.includes(sourceId);
    updatePhase(phase.id, {
      sourceIds: assigned
        ? phase.sourceIds.filter((id) => id !== sourceId)
        : [...phase.sourceIds, sourceId],
    });
  }

  function updateTransition(
    phase: DirectionalPhase,
    patch: Partial<DirectionalPhase["transitionToNext"]>,
    history: "merge" | "record" = "record",
  ): void {
    updatePhase(
      phase.id,
      { transitionToNext: { ...phase.transitionToNext, ...patch } },
      history,
    );
  }

  return (
    <div className="grid gap-3" data-testid="directional-phases-control">
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--muted-foreground)]">
          <span>Share unit</span>
          <span data-testid="phase-share-total">Total: {formatShare(total)}%</span>
        </div>
        <ToggleGroup
          aria-label="Phase share unit"
          className="w-full"
          onValueChange={(values) => {
            const next = values.at(-1) as PhaseShareUnit | undefined;
            if (next && unitOptions.includes(next)) setUnit(next);
          }}
          value={[unit]}
          variant="outline"
        >
          {unitOptions.map((option) => (
            <ToggleGroupItem className="min-w-0 flex-1" key={option} value={option}>
              {option === "percent" ? "%" : option === "columns" ? "Columns" : "Rows"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-2" data-testid="phase-list">
        {phases.map((phase, index) => {
          const active = phase.id === selected?.id;
          const invalid = phase.share <= 0 || phase.sourceIds.length === 0 || !phase.name.trim();
          const displayShare = phaseShareToUnit(phase.share, unit, rows, columns);
          return (
            <div
              className={
                active
                  ? "grid gap-2 rounded-lg border border-[color:var(--link)] bg-[color:color-mix(in_oklab,var(--link)_14%,transparent)] p-2"
                  : "grid gap-2 rounded-lg border border-transparent bg-[color:var(--muted)]/55 p-2"
              }
              data-invalid={invalid ? "true" : undefined}
              data-phase-id={phase.id}
              data-selected={active ? "true" : undefined}
              key={phase.id}
            >
              <Button
                aria-label={`Edit ${phase.name}`}
                className="h-auto min-w-0 justify-start px-2 py-1.5 text-left"
                onClick={() => setSelectedId(phase.id)}
                type="button"
                variant="ghost"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[color:var(--muted)] text-xs font-semibold">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{phase.name}</span>
                <span className="text-xs text-[color:var(--muted-foreground)]">{formatShare(displayShare)}{unit === "percent" ? "%" : ""}</span>
              </Button>
              {active ? (
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                  <Input
                    aria-label={`Name for ${phase.name}`}
                    onChange={(event) => updatePhase(phase.id, { name: event.currentTarget.value }, "merge")}
                    value={phase.name}
                  />
                  <Input
                    aria-label={`Share for ${phase.name}`}
                    min={unit === "percent" ? 0.0001 : 0}
                    onChange={(event) => {
                      const next = Number(event.currentTarget.value);
                      if (Number.isFinite(next)) {
                        updatePhase(
                          phase.id,
                          { share: phaseShareFromUnit(next, unit, rows, columns) },
                          "merge",
                        );
                      }
                    }}
                    step={unit === "percent" ? 0.1 : 1}
                    type="number"
                    value={formatShare(displayShare)}
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-3 gap-1">
                <Button aria-label={`Move ${phase.name} up`} disabled={index === 0} onClick={() => movePhase(phase.id, -1)} size="icon-sm" type="button" variant="secondary"><ArrowUpIcon /></Button>
                <Button aria-label={`Move ${phase.name} down`} disabled={index === phases.length - 1} onClick={() => movePhase(phase.id, 1)} size="icon-sm" type="button" variant="secondary"><ArrowDownIcon /></Button>
                <Button aria-label={`Remove ${phase.name}`} disabled={phases.length <= 2} onClick={() => removePhase(phase.id)} size="icon-sm" type="button" variant="secondary"><TrashIcon /></Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button onClick={addPhase} size="sm" type="button" variant="secondary"><PlusIcon /> Add phase</Button>
        <Button onClick={() => commit(normalizePhaseShares(phases))} size="sm" type="button" variant="secondary">Normalize shares</Button>
      </div>

      {!totalValid ? (
        <div className="text-xs text-[color:var(--attention)]" role="status">
          Phase shares must total 100%. Current total: {formatShare(total)}%.
        </div>
      ) : null}
      {phases.length > 8 ? (
        <div className="text-xs text-[color:var(--muted-foreground)]">More than eight phases may make the editor harder to scan.</div>
      ) : null}

      {selected ? (
        <div className="grid gap-2 border-t border-[color:var(--border)] pt-3" data-testid="selected-phase-settings">
          <div className="text-xs font-medium">Shapes in {selected.name}</div>
          {sources.length === 0 ? (
            <div className="text-xs text-[color:var(--attention)]">Add a Pattern Shape before assigning this phase.</div>
          ) : (
            <div className="grid gap-1.5">
              {sources.map((source) => {
                const assigned = selected.sourceIds.includes(source.id);
                return (
                  <Button
                    aria-label={`${assigned ? "Remove" : "Add"} ${source.name} ${assigned ? "from" : "to"} ${selected.name}`}
                    aria-pressed={assigned}
                    className="h-auto min-w-0 justify-start gap-2 px-2 py-1.5"
                    key={source.id}
                    onClick={() => toggleSource(selected, source.id)}
                    type="button"
                    variant={assigned ? "outline" : "secondary"}
                  >
                    <PatternSourcePreview className="size-5 shrink-0" source={source} />
                    <span className="min-w-0 flex-1 truncate text-left">{source.name}</span>
                  </Button>
                );
              })}
            </div>
          )}

          <div className="grid gap-1.5">
            <span className="text-xs text-[color:var(--muted-foreground)]">Distribution</span>
            <ToggleGroup
              aria-label={`Distribution for ${selected.name}`}
              className="w-full"
              onValueChange={(values) => {
                const distribution = values.at(-1) as PatternDistribution | undefined;
                if (distribution) updatePhase(selected.id, { distribution });
              }}
              value={[selected.distribution]}
              variant="outline"
            >
              <ToggleGroupItem className="min-w-0 flex-1" value="equal">Equal</ToggleGroupItem>
              <ToggleGroupItem className="min-w-0 flex-1" value="weighted">Weighted</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {selected.sourceIds.length === 0 ? (
            <div className="text-xs text-[color:var(--attention)]" role="status">{selected.name} must use at least one Pattern Shape.</div>
          ) : null}

          {nextPhase ? (
            <div
              className="grid gap-2 border-t border-[color:var(--border)] pt-3"
              data-testid={`transition-spread-${selected.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">Transition to {nextPhase.name}</div>
                  <div className="text-[11px] text-[color:var(--muted-foreground)]">Mix individual cells near this boundary.</div>
                </div>
                <PrimitiveSwitch
                  aria-label={`Enable transition from ${selected.name} to ${nextPhase.name}`}
                  checked={selected.transitionToNext.enabled}
                  onCheckedChange={(checked) => updateTransition(selected, { enabled: checked })}
                />
              </div>

              {selected.transitionToNext.enabled ? (
                <div className="grid gap-3" data-testid="transition-spread-settings">
                  <div className="grid gap-1.5">
                    <span className="text-xs text-[color:var(--muted-foreground)]">Direction</span>
                    <ToggleGroup
                      aria-label={`Transition direction from ${selected.name} to ${nextPhase.name}`}
                      className="w-full"
                      onValueChange={(values) => {
                        const direction = values.at(-1) as TransitionSpreadDirection | undefined;
                        if (direction) updateTransition(selected, { direction });
                      }}
                      value={[selected.transitionToNext.direction]}
                      variant="outline"
                    >
                      <ToggleGroupItem className="min-w-0 flex-1" value="previous">Previous</ToggleGroupItem>
                      <ToggleGroupItem className="min-w-0 flex-1" value="next">Next</ToggleGroupItem>
                    </ToggleGroup>
                    <div className="text-[11px] text-[color:var(--muted-foreground)]">
                      {selected.transitionToNext.direction === "previous"
                        ? `${nextPhase.name} enters the ${selected.name} side.`
                        : `${selected.name} enters the ${nextPhase.name} side.`}
                    </div>
                  </div>

                  <label className="grid gap-1.5 text-xs">
                    <span className="flex items-center justify-between gap-2 text-[color:var(--muted-foreground)]">
                      <span>Max width</span>
                      <span>{unit === "percent" ? "%" : unit === "columns" ? "Columns" : "Rows"}</span>
                    </span>
                    <Input
                      aria-label={`Transition max width from ${selected.name} to ${nextPhase.name}`}
                      max={unit === "percent" ? 100 : unit === "columns" ? columns : rows}
                      min={unit === "percent" ? 0.1 : 0.01}
                      onChange={(event) => {
                        const next = Number(event.currentTarget.value);
                        if (Number.isFinite(next)) {
                          updateTransition(
                            selected,
                            { maxWidthPercent: transitionWidthFromUnit(next, unit, rows, columns) },
                            "merge",
                          );
                        }
                      }}
                      step={unit === "percent" ? 0.1 : 0.01}
                      type="number"
                      value={formatShare(transitionWidthToUnit(
                        selected.transitionToNext.maxWidthPercent,
                        unit,
                        rows,
                        columns,
                      ))}
                    />
                  </label>

                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--muted-foreground)]">
                      <span>Strength</span>
                      <span>{formatShare(selected.transitionToNext.strength)}%</span>
                    </div>
                    <PrimitiveSlider
                      getAriaLabel={() => `Transition strength from ${selected.name} to ${nextPhase.name}`}
                      max={100}
                      min={0}
                      onValueChange={(next) => {
                        const strength = Array.isArray(next) ? next[0] : next;
                        if (typeof strength === "number") {
                          updateTransition(selected, { strength }, "merge");
                        }
                      }}
                      onValueCommitted={(next) => {
                        const strength = Array.isArray(next) ? next[0] : next;
                        if (typeof strength === "number") {
                          updateTransition(selected, { strength }, "record");
                        }
                      }}
                      showFill
                      step={1}
                      value={[selected.transitionToNext.strength]}
                    />
                  </div>

                  {selected.transitionToNext.maxWidthPercent <= 0 || selected.transitionToNext.maxWidthPercent > 100 ? (
                    <div className="text-xs text-[color:var(--attention)]" role="status">Max width must be greater than 0% and at most 100%.</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
