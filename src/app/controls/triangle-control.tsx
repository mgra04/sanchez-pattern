import * as React from "react";
import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from "@/toolcraft/ui";
import { Slider as PrimitiveSlider } from "@/toolcraft/ui/components/primitives";

import { PatternSourcePreview } from "../components/shape-preview";
import {
  getPatternSources,
  type PatternDistribution,
  type TriangleSettings,
  type TriangleSourcePool,
} from "../pattern-model";
import { getTriangleGeometry } from "../pattern-methods/triangle-lattice/model";
import { validateTrianglePattern } from "../pattern-methods/triangle-lattice/strategy";
import {
  getCurrentPatternSnapshot,
  getTriangleSettings,
  patternTargets,
} from "../pattern-state";

const numberText = (value: number) => Number(value.toFixed(2)).toString();

export function TriangleControl({
  setValue,
  state,
}: ToolcraftCustomControlRendererProps<TriangleSettings>): React.JSX.Element {
  const settings = getTriangleSettings(state.values);
  const sources = getPatternSources(state.values[patternTargets.sources]);
  const fullSources = sources.filter((source) => source.tile?.role === "triangle-full");
  const halfSources = sources.filter((source) => source.tile?.role === "triangle-half");
  const side =
    fullSources[0]?.tile?.sideLength ?? halfSources[0]?.tile?.sideLength ?? 24;
  const geometry = getTriangleGeometry(side, settings.fullTriangles, settings.innerGap);
  const snapshot = getCurrentPatternSnapshot(state.values);
  const validation =
    snapshot.method === "triangle-lattice" ? validateTrianglePattern(snapshot) : null;
  const cellCount =
    Number(state.values[patternTargets.rows] ?? 8) *
    Number(state.values[patternTargets.columns] ?? 16) *
    (settings.fullTriangles + 2);

  function commit(patch: Partial<TriangleSettings>, history: "merge" | "record" = "record") {
    setValue({ ...settings, ...patch }, { history });
  }

  function updatePool(
    key: "fullPool" | "halfPool",
    patch: Partial<TriangleSourcePool>,
  ) {
    commit({ [key]: { ...settings[key], ...patch } });
  }

  function poolEditor(
    label: string,
    key: "fullPool" | "halfPool",
    candidates: typeof sources,
  ): React.JSX.Element {
    const pool = settings[key];
    return (
      <div className="grid gap-2 rounded-lg bg-[color:var(--muted)] p-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{label}</span>
          <span className="text-[color:var(--muted-foreground)]">
            {pool.sourceIds.length} selected
          </span>
        </div>
        {candidates.length ? (
          <div className="flex flex-wrap gap-1" aria-label={`${label} source pool`}>
            {candidates.map((source) => {
              const active = pool.sourceIds.includes(source.id);
              return (
                <Button
                  aria-label={`${active ? "Remove" : "Add"} ${source.name} ${active ? "from" : "to"} ${label}`}
                  aria-pressed={active}
                  className="size-10 p-1"
                  key={source.id}
                  onClick={() =>
                    updatePool(key, {
                      sourceIds: active
                        ? pool.sourceIds.filter((id) => id !== source.id)
                        : [...pool.sourceIds, source.id],
                    })
                  }
                  title={source.name}
                  type="button"
                  variant={active ? "secondary" : "ghost"}
                >
                  <PatternSourcePreview className="size-7" source={source} />
                </Button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-[color:var(--muted-foreground)]">
            Add a compatible {label.toLowerCase()} member from Shapes Library.
          </p>
        )}
        <ToggleGroup
          aria-label={`${label} distribution`}
          className="w-full"
          onValueChange={(values) => {
            const distribution = values.at(-1) as PatternDistribution | undefined;
            if (distribution) updatePool(key, { distribution });
          }}
          value={[pool.distribution]}
          variant="outline"
        >
          <ToggleGroupItem className="min-w-0 flex-1" value="equal">Equal</ToggleGroupItem>
          <ToggleGroupItem className="min-w-0 flex-1" value="weighted">Weighted</ToggleGroupItem>
        </ToggleGroup>
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="triangle-editor">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-[color:var(--muted-foreground)]">
          {settings.fullTriangles + 2} slots per element · {cellCount} cells
        </div>
        <Dialog>
          <DialogTrigger render={<Button size="sm" type="button" variant="ghost" />}>
            Guide
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Triangle Pattern guide</DialogTitle>
              <DialogDescription>
                Build rectangular elements from an alternating equilateral lattice.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-3 text-sm">
              <p>Full triangles sets the middle sequence. Two Half caps are added automatically to close every element.</p>
              <p>Inner gap separates slanted edges inside an element. Grid gap separates complete elements.</p>
              <p>Rows and Columns count complete rectangular elements, not individual triangle slots.</p>
              <p>Start mirroring changes the first element. Alternate rows flips every second row vertically. For an odd Full count, Alternate in row flips every second element vertically inside each row.</p>
              <p>For an even Full count, Alternate columns keeps the existing horizontal reflection. Horizontal mirroring is redundant for an odd Full count.</p>
            </DialogBody>
          </DialogContent>
        </Dialog>
      </div>

      <label className="grid gap-1 text-xs text-[color:var(--muted-foreground)]">
        Full triangles
        <Input
          aria-label="Full triangles"
          max={12}
          min={1}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            if (Number.isFinite(value)) commit({ fullTriangles: value }, "merge");
          }}
          onBlur={() => commit({ fullTriangles: Math.min(12, Math.max(1, Math.round(settings.fullTriangles))) })}
          step={1}
          type="number"
          value={settings.fullTriangles}
        />
      </label>

      <div className="grid gap-1">
        <div className="flex items-center justify-between text-xs text-[color:var(--muted-foreground)]">
          <span>Inner gap</span><span>{numberText(settings.innerGap)}px</span>
        </div>
        <PrimitiveSlider
          getAriaLabel={() => "Triangle inner gap"}
          max={geometry.maxInnerGap}
          min={0}
          onValueChange={(next) => {
            const value = Array.isArray(next) ? next[0] : next;
            if (typeof value === "number") commit({ innerGap: value }, "merge");
          }}
          onValueCommitted={(next) => {
            const value = Array.isArray(next) ? next[0] : next;
            if (typeof value === "number") commit({ innerGap: value });
          }}
          showFill
          step={0.25}
          value={[Math.min(settings.innerGap, geometry.maxInnerGap)]}
        />
        <div className="text-[11px] text-[color:var(--muted-foreground)]">
          Element {numberText(geometry.elementWidth)}×{numberText(geometry.elementHeight)}px
        </div>
      </div>

      {poolEditor("Full shapes", "fullPool", fullSources)}
      {poolEditor("Half shapes", "halfPool", halfSources)}

      <div className="grid grid-cols-2 gap-2">
        <Button aria-pressed={settings.startMirrorY} onClick={() => commit({ startMirrorY: !settings.startMirrorY })} size="sm" type="button" variant={settings.startMirrorY ? "secondary" : "outline"}>Start vertical</Button>
        <Button aria-pressed={settings.alternateRows} onClick={() => commit({ alternateRows: !settings.alternateRows })} size="sm" type="button" variant={settings.alternateRows ? "secondary" : "outline"}>Alternate rows</Button>
        {settings.fullTriangles % 2 === 0 ? (
          <>
            <Button aria-pressed={settings.startMirrorX} onClick={() => commit({ startMirrorX: !settings.startMirrorX })} size="sm" type="button" variant={settings.startMirrorX ? "secondary" : "outline"}>Start horizontal</Button>
            <Button aria-pressed={settings.alternateColumns} onClick={() => commit({ alternateColumns: !settings.alternateColumns })} size="sm" type="button" variant={settings.alternateColumns ? "secondary" : "outline"}>Alternate columns</Button>
          </>
        ) : (
          <Button
            aria-pressed={settings.alternateElementsInRow}
            className="col-span-2"
            onClick={() => commit({ alternateElementsInRow: !settings.alternateElementsInRow })}
            size="sm"
            type="button"
            variant={settings.alternateElementsInRow ? "secondary" : "outline"}
          >
            Alternate elements in row
          </Button>
        )}
      </div>

      {validation?.valid ? (
        <div className="text-xs text-[color:var(--muted-foreground)]" data-testid="triangle-valid">
          Triangle recipe is ready.
        </div>
      ) : (
        <div className="text-xs text-[color:var(--attention)]" data-testid="triangle-error" role="status">
          {validation?.errors[0]}
        </div>
      )}
    </div>
  );
}
