import * as React from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";

import type {
  ToolcraftControlRendererMap,
  ToolcraftCustomControlRendererProps,
} from "@/toolcraft/runtime/react";
import {
  Button,
  ControlFieldLabel,
  Field,
  FieldError,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from "@/toolcraft/ui";

import { geometryFitsViewport, measureSvgGeometryBounds } from "./geometry-bounds";
import {
  defaultShapeToolsLibraryForm,
  getActiveShapeToolResult,
  getShapeToolResults,
  shapeToolsTargets,
  type ShapeToolsLibraryForm,
} from "./shape-tools-model";
import { validateShapeToolsLibraryForm } from "./library-authoring";

type GeometryStatus = { error?: string; fits: boolean };

function formatFrame(width: number, height: number): string {
  const format = (value: number) => Number(value.toFixed(4)).toString();
  return `${format(width)} × ${format(height)}`;
}

function SvgThumbnail({ source }: { source: string }): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="grid aspect-square min-w-0 place-items-center overflow-hidden rounded-md border bg-[color:var(--background)] p-2 [&>svg]:max-h-full [&>svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: source }}
    />
  );
}

function ShapeNormalizationResultsControl({
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps<string>): React.JSX.Element {
  const results = React.useMemo(
    () => getShapeToolResults(state),
    [state.mediaAssets, state.values["shapeTools.mode"], state.values["shapeTools.sideLength"]],
  );
  const [geometryStatus, setGeometryStatus] = React.useState<Record<string, GeometryStatus>>({});
  const validResults = React.useMemo(
    () => results.filter((entry) => entry.status === "valid"),
    [results],
  );

  React.useEffect(() => {
    if (results.some((entry) => entry.assetId === value)) return;
    setValue(validResults[0]?.assetId ?? "", { history: "skip" });
  }, [results, setValue, validResults, value]);

  React.useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let index = 0;
    const next: Record<string, GeometryStatus> = {};
    const measureBatch = () => {
      const end = Math.min(index + 3, validResults.length);
      for (; index < end; index += 1) {
        const entry = validResults[index]!;
        try {
          const bounds = measureSvgGeometryBounds(entry.result.normalizedSource);
          next[entry.assetId] = {
            fits: geometryFitsViewport(bounds, entry.result.targetViewport),
          };
        } catch (error) {
          next[entry.assetId] = {
            error: error instanceof Error ? error.message : "Unable to measure geometry.",
            fits: false,
          };
        }
      }
      if (cancelled) return;
      if (index < validResults.length) {
        frame = requestAnimationFrame(measureBatch);
      } else {
        setGeometryStatus(next);
      }
    };
    frame = requestAnimationFrame(measureBatch);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [validResults]);

  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-sm text-[color:var(--muted-foreground)]" data-testid="shape-tools-empty">
        Add one or more SVG files to validate their triangle frames.
      </div>
    );
  }

  return (
    <div className="grid gap-2" data-testid="shape-tools-results">
      {results.map((entry) => {
        const selected = entry.assetId === value;
        const measured = geometryStatus[entry.assetId];
        const geometryValid = entry.status === "valid" && measured?.fits !== false;
        return (
          <Button
            aria-label={`Select result ${entry.fileName}`}
            aria-pressed={selected}
            className={
              selected
                ? "h-auto min-w-0 flex-col items-stretch gap-2 border-[color:var(--link)] bg-[color:color-mix(in_oklab,var(--link)_14%,transparent)] p-2 text-left"
                : "h-auto min-w-0 flex-col items-stretch gap-2 border-transparent bg-[color:var(--muted)]/55 p-2 text-left"
            }
            data-shape-tool-result={entry.assetId}
            key={entry.assetId}
            onClick={() => setValue(entry.assetId, { history: "record" })}
            style={{ containIntrinsicSize: "180px", contentVisibility: "auto" }}
            title={entry.fileName}
            type="button"
            variant="outline"
          >
            <span className="flex min-w-0 items-center gap-2">
              {entry.status === "valid" && geometryValid ? (
                <CheckCircleIcon className="shrink-0 text-[color:var(--success)]" />
              ) : (
                <WarningCircleIcon className="shrink-0 text-[color:var(--attention)]" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{entry.fileName}</span>
            </span>
            {entry.status === "valid" ? (
              <>
                <span className="grid grid-cols-2 gap-2">
                  <SvgThumbnail source={entry.source} />
                  <SvgThumbnail source={entry.result.normalizedSource} />
                </span>
                <span className="grid gap-0.5 text-[10px] leading-4 text-[color:var(--muted-foreground)]">
                  <span>{entry.result.role === "equilateral-full" ? "Full" : "Half"} · {entry.result.alreadyNormalized ? "Already normalized" : "Root viewport corrected"}</span>
                  <span>
                    {formatFrame(entry.result.originalViewport.width, entry.result.originalViewport.height)} → {formatFrame(entry.result.targetViewport.width, entry.result.targetViewport.height)}
                  </span>
                  <span>{entry.result.geometryUnchanged ? "Geometry unchanged" : "Geometry changed"}</span>
                  {measured?.fits === false ? (
                    <span className="text-[color:var(--destructive)]">
                      {measured.error ?? "Geometry extends outside the canonical viewport."}
                    </span>
                  ) : null}
                </span>
              </>
            ) : (
              <span className="text-xs leading-5 text-[color:var(--destructive)]">{entry.error}</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

function ShapeLibraryDetailsControl({
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps<ShapeToolsLibraryForm>): React.JSX.Element {
  const form = { ...defaultShapeToolsLibraryForm, ...(value ?? {}) };
  const active = getActiveShapeToolResult(state);
  const errors = validateShapeToolsLibraryForm(form, active?.status === "valid");
  const status = String(state.values[shapeToolsTargets.libraryStatus] ?? "");

  function update(patch: Partial<ShapeToolsLibraryForm>): void {
    setValue({ ...form, ...patch }, { history: "merge" });
  }

  function field(params: {
    label: string;
    name: keyof ShapeToolsLibraryForm;
    placeholder?: string;
  }): React.JSX.Element {
    return (
      <Field>
        <ControlFieldLabel>{params.label}</ControlFieldLabel>
        <Input
          aria-invalid={Boolean(errors[params.name] && form[params.name])}
          onChange={(event) => update({ [params.name]: event.currentTarget.value })}
          placeholder={params.placeholder}
          value={form[params.name]}
        />
        {errors[params.name] && form[params.name] ? <FieldError>{errors[params.name]}</FieldError> : null}
      </Field>
    );
  }

  return (
    <div className="grid gap-4" data-testid="shape-tools-library-details">
      <div>
        <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Category</div>
        <ToggleGroup
          aria-label="Library category"
          className="w-full"
          onValueChange={(next) => {
            const category = next[0];
            if (category === "base" || category === "complex") update({ category });
          }}
          value={[form.category]}
          variant="outline"
        >
          <ToggleGroupItem className="min-w-0 flex-1" value="base">Base</ToggleGroupItem>
          <ToggleGroupItem className="min-w-0 flex-1" value="complex">Complex</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div>
        <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Opacity structure</div>
        <ToggleGroup
          aria-label="Opacity structure"
          className="w-full"
          onValueChange={(next) => {
            const opacityMode = next[0];
            if (opacityMode === "whole-svg" || opacityMode === "separate-elements") update({ opacityMode });
          }}
          value={[form.opacityMode]}
          variant="outline"
        >
          <ToggleGroupItem className="min-w-0 flex-1" value="whole-svg">Whole</ToggleGroupItem>
          <ToggleGroupItem className="min-w-0 flex-1" value="separate-elements">Elements</ToggleGroupItem>
        </ToggleGroup>
        <div className="mt-2 text-xs text-[color:var(--muted-foreground)]">
          {form.opacityMode === "separate-elements"
            ? "Drawable nodes are numbered automatically in document order."
            : "The complete SVG receives one generated opacity value."}
        </div>
      </div>

      {field({ label: "Family ID", name: "familyId", placeholder: "equilateral-triangle-glyph-16" })}
      {field({ label: "Display name", name: "displayName", placeholder: "Glyph 16" })}
      {field({ label: "Variant ID", name: "variantId", placeholder: "profile-a" })}

      <div className="border-t pt-4">
        <div className="mb-3 text-xs font-medium">Optional collection and profile</div>
        <div className="grid gap-4">
          {field({ label: "Collection ID", name: "collectionId", placeholder: "equilateral-triangle-glyphs-local" })}
          {field({ label: "Collection name", name: "collectionDisplayName", placeholder: "Triangle Glyphs" })}
          {field({ label: "Profile ID", name: "profileId", placeholder: "a" })}
          {field({ label: "Profile label", name: "profileLabel", placeholder: "1/2 · Gap 2" })}
          {field({ label: "Thicknesses", name: "thicknesses", placeholder: "1, 2" })}
          {field({ label: "Main–inner gap", name: "mainInnerGap", placeholder: "2" })}
        </div>
      </div>

      {errors.source ? <div className="text-xs text-[color:var(--destructive)]">{errors.source}</div> : null}
      {status ? <div aria-live="polite" className="text-xs text-[color:var(--muted-foreground)]">{status}</div> : null}
    </div>
  );
}

export const shapeToolsControlRenderers: ToolcraftControlRendererMap = {
  shapeLibraryDetails: (props) => (
    <ShapeLibraryDetailsControl
      {...(props as ToolcraftCustomControlRendererProps<ShapeToolsLibraryForm>)}
    />
  ),
  shapeNormalizationResults: (props) => (
    <ShapeNormalizationResultsControl
      {...(props as ToolcraftCustomControlRendererProps<string>)}
    />
  ),
};
