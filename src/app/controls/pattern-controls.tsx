import * as React from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  XIcon,
} from "@phosphor-icons/react";

import type {
  ToolcraftCustomControlRendererProps,
  ToolcraftControlRendererMap,
} from "@/toolcraft/runtime/react";
import {
  Button,
  ControlFieldLabel,
  ControlFieldLabelHelpProvider,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldError,
  Input,
  StaticSelect,
  ToggleGroup,
  ToggleGroupItem,
} from "@/toolcraft/ui";

import { PatternSourcePreview, ShapePreview } from "../components/shape-preview";
import { DirectionalPhasesControl } from "./directional-phases-control";
import { MosaicControl } from "./mosaic-control";
import { TriangleControl } from "./triangle-control";
import { OpacityDistributionControl } from "./opacity-distribution-control";
import {
  clonePatternSource,
  createPatternSource,
  getPatternHistory,
  getPatternSources,
  getUniquePatternName,
  type DirectionalPhase,
  type MosaicSettings,
  type OpacityDistributionSettings,
  type PatternHistoryEntry,
  type PatternSource,
  type TriangleSettings,
} from "../pattern-model";
import {
  getCurrentPatternSnapshot,
  getDirectionalPhases,
  getEffectivePatternSources,
  getMosaicSettings,
  getTriangleSettings,
  getSelectedSource,
  loadSnapshotIntoDraft,
  loadSourceIntoInspector,
  patternTargets,
  persistSelectedSource,
  selectPatternSource,
  type PatternVariantValue,
} from "../pattern-state";
import { validatePatternSnapshot } from "../pattern-methods/registry";
import {
  builtInShapeCatalog,
  builtInShapeCollections,
  getShapeVariantLabel,
} from "../shapes/catalog";
import {
  familyMatchesShapeFilters,
  getCollectionFamilies,
  getShapeCollectionMatch,
  getTopLevelShapeFamilies,
  type ShapeFrameFilter,
} from "../shapes/collections";
import {
  getCollectionVariantForProfile,
  getShapeVariantParameters,
} from "../shapes/profiles";
import {
  defaultShapeImportForm,
  importShapeFromToolcraftState,
  parseVariantMetadataFromFileName,
  slugifyShapeToken,
  validateShapeImportForm,
  type ShapeImportErrors,
  type ShapeImportForm,
} from "../shapes/import";
import {
  listStoredShapeCollections,
  listStoredShapeFamilies,
  mergeShapeCatalogs,
  mergeShapeCollections,
} from "../shapes/storage";
import type { ShapeCategory, ShapeCollection, ShapeFamily, ShapeVariant } from "../shapes/types";

function useShapeLibrary(revision: unknown): {
  catalog: ShapeFamily[];
  collections: ShapeCollection[];
} {
  const [library, setLibrary] = React.useState({
    catalog: [...builtInShapeCatalog],
    collections: [...builtInShapeCollections],
  });

  React.useEffect(() => {
    let cancelled = false;
    void Promise.all([listStoredShapeFamilies(), listStoredShapeCollections()]).then(([families, collections]) => {
      if (!cancelled) {
        setLibrary({
          catalog: mergeShapeCatalogs(builtInShapeCatalog, families),
          collections: mergeShapeCollections(builtInShapeCollections, collections),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  return library;
}

function getDefaultVariant(family: ShapeFamily): ShapeVariant {
  return (
    family.variants.find((variant) => variant.id === family.defaultVariantId) ??
    family.variants[0]
  )!;
}

function LibraryControl({
  dispatch,
  state,
}: ToolcraftCustomControlRendererProps<string>): React.JSX.Element {
  const revision = state.values["library.revision"];
  const [open, setOpen] = React.useState(false);
  const { catalog, collections } = useShapeLibrary(revision);
  const [category, setCategory] = React.useState<ShapeCategory>("base");
  const [frameFilter, setFrameFilter] = React.useState<ShapeFrameFilter>("all");
  const [collectionId, setCollectionId] = React.useState<string | null>(null);
  const [profileId, setProfileId] = React.useState("");
  const collectionMatches = collections
    .map((collection) =>
      getShapeCollectionMatch(collection, catalog, category, frameFilter),
    )
    .filter((match): match is NonNullable<typeof match> => Boolean(match));
  const activeCollection = collectionId
    ? collections.find((collection) => collection.id === collectionId)
    : undefined;
  const resolvedProfileId = activeCollection?.variantProfiles.some(
    (profile) => profile.id === profileId,
  )
    ? profileId
    : activeCollection?.variantProfiles[0]?.id ?? "";
  const families = activeCollection
    ? getCollectionFamilies(activeCollection, catalog).filter((entry) =>
        familyMatchesShapeFilters(entry, category, frameFilter),
      )
    : getTopLevelShapeFamilies(catalog, collectionMatches, category, frameFilter);
  const [familyKey, setFamilyKey] = React.useState<string>(() => {
    const first = builtInShapeCatalog.find((family) => family.category === "base");
    return first ? `${first.category}/${first.id}` : "";
  });
  const family =
    families.find((entry) => `${entry.category}/${entry.id}` === familyKey) ?? families[0];
  const [variantId, setVariantId] = React.useState<string>(
    family?.defaultVariantId ?? "",
  );
  const profileVariant = activeCollection && resolvedProfileId && family
    ? getCollectionVariantForProfile(activeCollection, family, resolvedProfileId)
    : undefined;
  const variant =
    profileVariant ?? family?.variants.find((entry) => entry.id === variantId) ??
    (family ? getDefaultVariant(family) : undefined);
  const axisOptions = family
    ? [...new Map(family.variants.map((entry) => [`${entry.axis}:${entry.axisValue}`, entry])).values()]
    : [];
  const radiusOptions = family && variant
    ? family.variants.filter(
        (entry) => entry.axis === variant.axis && entry.axisValue === variant.axisValue,
      )
    : [];

  React.useEffect(() => {
    if (family && !family.variants.some((entry) => entry.id === variantId)) {
      setVariantId(family.defaultVariantId);
    }
  }, [family, variantId]);

  React.useEffect(() => {
    if (family) {
      const key = `${family.category}/${family.id}`;
      if (key !== familyKey) {
        setFamilyKey(key);
        setVariantId(family.defaultVariantId);
      }
    } else if (familyKey) {
      setFamilyKey("");
      setVariantId("");
    }
  }, [family, familyKey]);

  function chooseFamily(nextFamily: ShapeFamily): void {
    setFamilyKey(`${nextFamily.category}/${nextFamily.id}`);
    setVariantId(
      (activeCollection && resolvedProfileId
        ? getCollectionVariantForProfile(activeCollection, nextFamily, resolvedProfileId)?.id
        : undefined) ?? nextFamily.defaultVariantId,
    );
  }

  function chooseAxis(next: ShapeVariant): void {
    const preferred = family?.variants.find(
      (entry) =>
        entry.axis === next.axis && entry.axisValue === next.axisValue && entry.radiusPx === 0,
    );
    setVariantId((preferred ?? next).id);
  }

  function addSource(): void {
    if (!family || !variant) {
      return;
    }

    const sources = persistSelectedSource(dispatch, state);
    const availableVariants = family.variants.map((entry) => ({
      ...entry,
      parameters: activeCollection
        ? getShapeVariantParameters(activeCollection, entry)
        : entry.parameters,
    }));
    const source = createPatternSource({
      availableVariants,
      axis: variant.axis,
      axisValue: variant.axisValue,
      category: family.category,
      familyId: family.id,
      familyName: family.displayName,
      frame: family.frame,
      opacityUnits: variant.opacityUnits,
      parameters: activeCollection
        ? getShapeVariantParameters(activeCollection, variant)
        : variant.parameters,
      profileId: variant.profileId,
      radiusPx: variant.radiusPx,
      svgBody: variant.svgBody,
      tile: family.tile,
      variantId: variant.id,
      viewBox: family.viewBox,
    });
    const nextSources = [...sources, source];
    dispatch({
      history: "record",
      label: `Add ${family.displayName}`,
      target: patternTargets.sources,
      type: "controls.setValue",
      value: nextSources,
    });
    loadSourceIntoInspector(dispatch, source);
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button className="w-full" type="button" variant="outline" />}>
        Open library
      </DialogTrigger>
      <DialogContent layout="sections" size="2xl">
        <DialogHeader>
          <DialogTitle>Shapes Library</DialogTitle>
          <DialogDescription>
            Choose a family, then resolve only the weight and radius combinations that exist.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto">
          <ToggleGroup
            aria-label="Shape category"
            data-testid="shape-library-category"
            onValueChange={(nextValue) => {
              const nextCategory = nextValue[0] as ShapeCategory | undefined;
              if (nextCategory !== "base" && nextCategory !== "complex") return;
              setCategory(nextCategory);
            }}
            value={[category]}
          >
            <ToggleGroupItem value="base">Base</ToggleGroupItem>
            <ToggleGroupItem value="complex">Complex</ToggleGroupItem>
          </ToggleGroup>

          <div className="grid gap-2" data-testid="shape-frame-filter">
            <div className="text-xs text-[color:var(--muted-foreground)]">Frame</div>
            <StaticSelect
              ariaLabel="Frame"
              onValueChange={(value) =>
                setFrameFilter(value as ShapeFrameFilter)
              }
              options={[
                { label: "All frames", value: "all" },
                { label: "Square", value: "square" },
                { label: "Equilateral full", value: "equilateral-full" },
                { label: "Equilateral half", value: "equilateral-half" },
              ]}
              value={frameFilter}
            />
          </div>

          {activeCollection ? (
            <div className="grid gap-2 rounded-xl border bg-[color:var(--muted)]/35 p-3" data-testid="shape-collection-summary">
              <Button
                className="w-fit"
                data-testid="shape-collection-back"
                onClick={() => setCollectionId(null)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <ArrowLeftIcon /> All shapes
              </Button>
              <div>
                <div className="text-sm font-medium">{activeCollection.displayName}</div>
                <div className="text-xs leading-5 text-[color:var(--muted-foreground)]">
                  {activeCollection.description} · {families.length} of {activeCollection.members.length} shapes
                </div>
              </div>
              {activeCollection.variantProfiles.length > 0 ? (
                <div className="grid gap-2" data-testid="shape-profile-selector">
                  <div className="text-xs text-[color:var(--muted-foreground)]">Profile</div>
                  <StaticSelect
                    ariaLabel="Profile"
                    onValueChange={(nextProfileId) => {
                      setProfileId(nextProfileId);
                      const nextVariant = family
                        ? getCollectionVariantForProfile(activeCollection, family, nextProfileId)
                        : undefined;
                      if (nextVariant) setVariantId(nextVariant.id);
                    }}
                    options={activeCollection.variantProfiles.map((profile) => ({
                      label: profile.label,
                      value: profile.id,
                    }))}
                    value={resolvedProfileId}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-4 gap-2" data-testid="shape-family-grid">
            {!activeCollection
              ? collectionMatches.map((match) => (
                  <Button
                    aria-label={`Open collection ${match.collection.displayName}`}
                    className="h-auto min-h-24 flex-col gap-1.5 py-3"
                    data-shape-collection-id={match.collection.id}
                    key={`collection/${match.collection.id}`}
                    onClick={() => {
                      const nextProfileId = match.collection.variantProfiles[0]?.id ?? "";
                      const nextFamily = match.matchingFamilies[0]!;
                      setCollectionId(match.collection.id);
                      setProfileId(nextProfileId);
                      setFamilyKey(`${nextFamily.category}/${nextFamily.id}`);
                      setVariantId(
                        (nextProfileId
                          ? getCollectionVariantForProfile(match.collection, nextFamily, nextProfileId)?.id
                          : undefined) ?? nextFamily.defaultVariantId,
                      );
                    }}
                    title={match.collection.description}
                    type="button"
                    variant="outline"
                  >
                    <ShapePreview
                      className="size-8"
                      svgBody={match.coverVariant.svgBody}
                      viewBox={match.coverFamily.viewBox}
                    />
                    <span className="max-w-full truncate text-xs">{match.collection.displayName}</span>
                    <span className="rounded bg-[color:var(--muted)] px-1.5 py-0.5 text-[10px] text-[color:var(--muted-foreground)]">
                      Collection
                    </span>
                    <span className="max-w-full truncate text-[10px] text-[color:var(--muted-foreground)]">
                      {match.matchingFamilies.length} of {match.totalCount} shapes
                      {match.collection.variantProfiles.length > 0
                        ? ` · ${match.collection.variantProfiles.length} profiles`
                        : ""}
                    </span>
                  </Button>
                ))
              : null}
            {families.map((entry) => {
              const preview = activeCollection && resolvedProfileId
                ? getCollectionVariantForProfile(activeCollection, entry, resolvedProfileId) ?? getDefaultVariant(entry)
                : getDefaultVariant(entry);
              const selected = family?.category === entry.category && family.id === entry.id;
              return (
                <Button
                  aria-label={`Select shape ${entry.displayName}`}
                  aria-pressed={selected}
                  className="h-auto min-h-20 flex-col gap-2 py-3"
                  data-shape-family-id={entry.id}
                  key={`${entry.category}/${entry.id}`}
                  onClick={() => chooseFamily(entry)}
                  type="button"
                  variant="outline"
                >
                  <ShapePreview className="size-8" svgBody={preview.svgBody} viewBox={entry.viewBox} />
                  <span className="max-w-full truncate text-xs">{entry.displayName}</span>
                  {entry.tile ? (
                    <span className="max-w-full truncate text-[10px] text-[color:var(--muted-foreground)]">
                      {entry.tile.setDisplayName} · {entry.tile.role === "triangle-full" ? "Full" : "Half"}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>

          {families.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-[color:var(--muted-foreground)]" role="status">
              No shapes match the selected category and frame.
            </div>
          ) : null}

          {family && variant ? (
            <div className="grid gap-4 rounded-xl border p-3">
              <div className="flex items-center gap-3">
                <ShapePreview className="size-14" svgBody={variant.svgBody} viewBox={family.viewBox} />
                <div>
                  <div className="text-sm font-medium">{family.displayName}</div>
                  <div className="text-xs text-[color:var(--muted-foreground)]">
                    {activeCollection && variant.profileId
                      ? activeCollection.variantProfiles.find((profile) => profile.id === variant.profileId)?.label
                      : `${getShapeVariantLabel(variant)} · radius ${variant.radiusPx}px`}
                    {` · ${variant.opacityUnits.count} opacity ${variant.opacityUnits.count === 1 ? "unit" : "units"}`}
                  </div>
                </div>
              </div>
              {!activeCollection?.variantProfiles.length ? <div>
                <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Weight / form</div>
                <div className="flex flex-wrap gap-2">
                  {axisOptions.map((entry) => (
                    <Button
                      aria-pressed={
                        entry.axis === variant.axis && entry.axisValue === variant.axisValue
                      }
                      key={`${entry.axis}:${entry.axisValue}`}
                      onClick={() => chooseAxis(entry)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {getShapeVariantLabel(entry)}
                    </Button>
                  ))}
                </div>
              </div> : null}
              {!activeCollection?.variantProfiles.length ? <div>
                <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Radius</div>
                <div className="flex flex-wrap gap-2">
                  {radiusOptions.map((entry) => (
                    <Button
                      aria-pressed={entry.id === variant.id}
                      key={entry.id}
                      onClick={() => setVariantId(entry.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {entry.radiusPx}px
                    </Button>
                  ))}
                </div>
              </div> : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            nativeButton={false}
            render={<a href="/shape-tools" rel="noreferrer" target="_blank" />}
            type="button"
            variant="secondary"
          >
            <ArrowSquareOutIcon /> Shape tools
          </Button>
          <Button aria-label="Add shape" data-testid="shape-library-add" disabled={!family || !variant} onClick={addSource} type="button">
            <PlusIcon /> Add shape
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CanvasSizingHelpControl(): React.JSX.Element {
  return (
    <div className="rounded-lg border bg-[color:var(--muted)]/30 p-3 text-xs leading-5 text-[color:var(--muted-foreground)]">
      <strong className="text-[color:var(--foreground)]">Canvas and grid sizing</strong>
      <p className="mt-1">
        Custom Aspect ratio Width/Height are proportions such as 16 and 9. Canvas width and
        height are final export pixels. Auto-fit output resizes the canvas only when the grid
        extent changes; a manual canvas size remains unchanged until then.
      </p>
    </div>
  );
}

function EmptySelectionControl(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-dashed p-3 text-sm text-[color:var(--muted-foreground)]">
      No shape selected.
    </div>
  );
}

function ExportHelpControl(): React.JSX.Element {
  return (
    <p className="text-xs leading-5 text-[color:var(--muted-foreground)]">
      File name applies to both exports. Image format and resolution apply only to Export Image; SVG remains vector.
    </p>
  );
}

function ImportDetailsControl({
  dispatch,
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps<ShapeImportForm>): React.JSX.Element {
  const form = { ...defaultShapeImportForm, ...(value ?? {}) };
  const media = state.mediaAssets.filter((asset) => asset.sourceTarget === "library.upload");
  const [errors, setErrors] = React.useState<ShapeImportErrors>({});
  const [status, setStatus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const lastPrefilledMediaId = React.useRef<string | null>(null);

  function update(patch: Partial<ShapeImportForm>): void {
    setValue({ ...form, ...patch }, { history: "merge" });
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch) as (keyof ShapeImportForm)[]) delete next[key];
      return next;
    });
    setStatus("");
  }

  React.useEffect(() => {
    const firstMedia = media[0];
    if (!firstMedia || lastPrefilledMediaId.current === firstMedia.id) return;
    lastPrefilledMediaId.current = firstMedia.id;
    const parsed = parseVariantMetadataFromFileName(firstMedia.fileName);
    if (parsed) setValue({ ...form, ...parsed }, { history: "merge" });
  }, [form, media, setValue]);

  async function importShape(): Promise<void> {
    const nextErrors = validateShapeImportForm(form, media.length > 0);
    setErrors(nextErrors);
    setStatus("");
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const imported = await importShapeFromToolcraftState(state, form);
      for (const mediaId of imported.mediaIds) {
        dispatch({ mediaId, type: "media.delete" });
      }
      dispatch({
        history: "record",
        target: "library.revision",
        type: "controls.setValue",
        value: Number(state.values["library.revision"] ?? 0) + 1,
      });
      setStatus(`${imported.family.displayName} imported.`);
      setErrors({});
    } catch (error) {
      const importError = error as Error & { fieldErrors?: ShapeImportErrors };
      setErrors(importError.fieldErrors ?? {});
      setStatus(importError.message);
    } finally {
      setBusy(false);
    }
  }

  function inputField(params: {
    error?: string;
    help?: string;
    label: string;
    onChange: (value: string) => void;
    value: string;
  }): React.JSX.Element {
    return (
      <Field>
        <ControlFieldLabelHelpProvider help={params.help ?? ""} label={params.label}>
          <ControlFieldLabel>{params.label}</ControlFieldLabel>
        </ControlFieldLabelHelpProvider>
        <Input
          aria-invalid={Boolean(params.error)}
          onChange={(event) => params.onChange(event.currentTarget.value)}
          value={params.value}
        />
        {params.error ? <FieldError>{params.error}</FieldError> : null}
      </Field>
    );
  }

  return (
    <div className="grid gap-4" data-testid="shape-import-details">
      <div>
        <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Import as</div>
        <ToggleGroup
          aria-label="Import as"
          className="w-full"
          onValueChange={(next) => {
            const mode = next[0];
            if (mode === "new" || mode === "variant") update({ mode });
          }}
          value={[form.mode]}
          variant="outline"
        >
          <ToggleGroupItem className="min-w-0 flex-1" value="new">New</ToggleGroupItem>
          <ToggleGroupItem className="min-w-0 flex-1" value="variant">Variant</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {form.mode === "new" ? (
        <div>
          <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Frame</div>
          <ToggleGroup
            aria-label="Frame"
            className="w-full"
            onValueChange={(next) => {
              const geometryMode = next[0] as ShapeImportForm["geometryMode"] | undefined;
              if (geometryMode) update({ geometryMode });
            }}
            value={[form.geometryMode]}
            variant="outline"
          >
            <ToggleGroupItem className="min-w-0 flex-1" value="standard">Standard</ToggleGroupItem>
            <ToggleGroupItem className="min-w-0 flex-1" value="triangle-full">Full</ToggleGroupItem>
            <ToggleGroupItem className="min-w-0 flex-1" value="triangle-half">Half</ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}

      {inputField({
        error: errors.familyId,
        label: "Family ID",
        onChange: (familyId) => update({ familyId }),
        value: form.familyId,
      })}
      {form.mode === "new"
        ? inputField({
            error: errors.displayName,
            label: "Display name",
            onChange: (displayName) => update({ displayName }),
            value: form.displayName,
          })
        : null}

      {form.mode === "new" && form.geometryMode !== "standard" ? (
        <>
          {inputField({
            error: errors.setId,
            help: "Full and Half member families with the same ID form one coordinated Shape Set.",
            label: "Shape Set ID",
            onChange: (setId) => update({ setId }),
            value: form.setId,
          })}
          {inputField({
            error: errors.setDisplayName,
            label: "Shape Set name",
            onChange: (setDisplayName) => update({ setDisplayName }),
            value: form.setDisplayName,
          })}
          {inputField({
            error: errors.sideLength,
            help: "The exact height is derived automatically. A 24×21 Figma frame is normalized to 24×20.7846 without scaling its path.",
            label: "Triangle side",
            onChange: (sideLength) => update({ sideLength }),
            value: form.sideLength,
          })}
        </>
      ) : null}

      <div>
        <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Category</div>
        <ToggleGroup
          aria-label="Category"
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
        <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Variant type</div>
        <ToggleGroup
          aria-label="Variant type"
          className="w-full"
          onValueChange={(next) => {
            const variantType = next[0];
            if (variantType === "weight" || variantType === "form") {
              update({
                variantName: variantType === "weight" ? "base" : "filled",
                variantType,
              });
            }
          }}
          value={[form.variantType]}
          variant="outline"
        >
          <ToggleGroupItem className="min-w-0 flex-1" value="weight">Weight</ToggleGroupItem>
          <ToggleGroupItem className="min-w-0 flex-1" value="form">Form</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {inputField({
        error: errors.variantName,
        help: "Weight accepts extra-light, light, semi-light, base, semi-bold, bold, or extra-bold. Form accepts a lowercase kebab-case token such as filled, outline, blank, or cut-corner.",
        label: "Variant name",
        onChange: (variantName) => update({ variantName }),
        value: form.variantName,
      })}
      {inputField({
        error: errors.radiusPx,
        label: "Corner radius",
        onChange: (radiusPx) => update({ radiusPx }),
        value: form.radiusPx,
      })}

      {errors.file ? <div className="text-xs text-[color:var(--destructive)]">{errors.file}</div> : null}
      {status ? <div aria-live="polite" className="text-xs text-[color:var(--muted-foreground)]">{status}</div> : null}
      <Button className="w-full" disabled={busy} onClick={() => void importShape()} type="button" variant="secondary">
        {busy ? "Importing…" : "Import SVG"}
      </Button>
    </div>
  );
}

function PatternSourcesControl({
  dispatch,
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps<PatternSource[]>): React.JSX.Element {
  const storedSources = getPatternSources(value);
  const sources = getEffectivePatternSources(state.values);
  const selected = getSelectedSource(state.values);
  const validation = validatePatternSnapshot(getCurrentPatternSnapshot(state.values));
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const copiedSource = React.useRef<PatternSource | null>(null);

  function updateSources(nextSources: PatternSource[], label: string): void {
    setValue(nextSources, { history: "record" });
  }

  function duplicateSource(source: PatternSource): void {
    const copy = clonePatternSource(source, sources.map((entry) => entry.name));
    const sourceIndex = sources.findIndex((entry) => entry.id === source.id);
    const nextSources = [...sources];
    nextSources.splice(sourceIndex + 1, 0, copy);
    updateSources(nextSources, "Duplicate shape");
    loadSourceIntoInspector(dispatch, copy);
  }

  function removeSource(sourceId: string): void {
    const nextSources = sources.filter((source) => source.id !== sourceId);
    updateSources(nextSources, "Remove shape");
    dispatch({
      history: "merge",
      target: patternTargets.phases,
      type: "controls.setValue",
      value: getDirectionalPhases(state.values).map((phase) => ({
        ...phase,
        sourceIds: phase.sourceIds.filter((id) => id !== sourceId),
      })),
    });
    const mosaic = getMosaicSettings(state.values);
    dispatch({
      history: "merge",
      target: patternTargets.mosaicConfig,
      type: "controls.setValue",
      value: {
        clusters: mosaic.clusters,
        levels: mosaic.levels.map((level) => ({
          ...level,
          sourceIds: level.sourceIds.filter((id) => id !== sourceId),
        })),
      },
    });
    const triangle = getTriangleSettings(state.values);
    dispatch({
      history: "merge",
      target: patternTargets.triangleConfig,
      type: "controls.setValue",
      value: {
        ...triangle,
        fullPool: {
          ...triangle.fullPool,
          sourceIds: triangle.fullPool.sourceIds.filter((id) => id !== sourceId),
        },
        halfPool: {
          ...triangle.halfPool,
          sourceIds: triangle.halfPool.sourceIds.filter((id) => id !== sourceId),
        },
      },
    });
    if (selected?.id === sourceId) {
      if (nextSources[0]) {
        loadSourceIntoInspector(dispatch, nextSources[0]);
      } else {
        dispatch({
          history: "skip",
          target: patternTargets.selectedSourceId,
          type: "controls.setValue",
          value: "",
        });
        dispatch({
          history: "skip",
          target: patternTargets.fillMode,
          type: "controls.setValue",
          value: "",
        });
      }
    }
  }

  function moveSource(sourceId: string, direction: -1 | 1): void {
    const currentIndex = sources.findIndex((source) => source.id === sourceId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sources.length) return;
    const nextSources = [...sources];
    const [moved] = nextSources.splice(currentIndex, 1);
    nextSources.splice(nextIndex, 0, moved!);
    updateSources(nextSources, "Reorder shapes");
  }

  function normalizeFrames(): void {
    const reference = selected ?? sources[0];
    if (!reference) return;
    const nextSources = sources.map((source) => ({
      ...source,
      frameHeight: reference.frameHeight,
      frameWidth: reference.frameWidth,
    }));
    updateSources(nextSources, "Normalize frames");
    const nextSelected = nextSources.find((source) => source.id === selected?.id);
    if (nextSelected) loadSourceIntoInspector(dispatch, nextSelected);
  }

  function startRename(source: PatternSource): void {
    setEditingId(source.id);
    setDraftName(source.name);
  }

  function commitRename(sourceId: string): void {
    const name = draftName.trim();
    if (!name) return;
    updateSources(
      sources.map((source) => (source.id === sourceId ? { ...source, name } : source)),
      "Rename shape",
    );
    setEditingId(null);
  }

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;

      if (event.key.toLowerCase() === "c" && selected) {
        copiedSource.current = globalThis.structuredClone
          ? globalThis.structuredClone(selected)
          : { ...selected };
        event.preventDefault();
      }
      if (event.key.toLowerCase() === "v" && copiedSource.current) {
        duplicateSource(copiedSource.current);
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, sources]);

  return (
    <div className="grid gap-2" data-testid="pattern-source-list">
      {sources.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-sm text-[color:var(--attention)]" role="status">
          You must add a shape.
        </div>
      ) : null}
      {sources.map((source, index) => (
        <div
          className={
            source.id === selected?.id
              ? "grid min-w-0 gap-2 rounded-lg border border-[color:var(--link)] bg-[color:color-mix(in_oklab,var(--link)_14%,transparent)] p-2 text-[color:var(--foreground)]"
              : "grid min-w-0 gap-2 rounded-lg border border-transparent bg-[color:var(--muted)]/55 p-2 text-[color:var(--muted-foreground)]"
          }
          data-selected={source.id === selected?.id ? "true" : undefined}
          key={source.id}
        >
          {editingId === source.id ? (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1">
              <Input
                aria-label={`Rename ${source.name}`}
                autoFocus
                onChange={(event) => setDraftName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename(source.id);
                  if (event.key === "Escape") setEditingId(null);
                }}
                value={draftName}
              />
              <Button aria-label="Save name" onClick={() => commitRename(source.id)} size="icon-sm" type="button" variant="secondary">
                <CheckIcon />
              </Button>
              <Button aria-label="Cancel rename" onClick={() => setEditingId(null)} size="icon-sm" type="button" variant="secondary">
                <XIcon />
              </Button>
            </div>
          ) : (
            <Button
              aria-label={`Edit ${source.name}`}
              className="h-auto min-w-0 justify-start gap-3 px-1 py-1 text-left"
              onClick={() => selectPatternSource(dispatch, state, source.id)}
              title={source.name}
              type="button"
              variant="ghost"
            >
              <span
                className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--background)]"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, color-mix(in oklab, var(--muted) 70%, transparent) 25%, transparent 25%), linear-gradient(-45deg, color-mix(in oklab, var(--muted) 70%, transparent) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, color-mix(in oklab, var(--muted) 70%, transparent) 75%), linear-gradient(-45deg, transparent 75%, color-mix(in oklab, var(--muted) 70%, transparent) 75%)",
                  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
                  backgroundSize: "8px 8px",
                }}
              >
                <PatternSourcePreview className="size-7" source={source} />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{source.name}</span>
            </Button>
          )}
          {editingId !== source.id ? (
            <div className="grid grid-cols-5 gap-1">
              {[
                { label: `Rename ${source.name}`, icon: <PencilSimpleIcon />, action: () => startRename(source), disabled: false },
                { label: `Duplicate ${source.name}`, icon: <CopyIcon />, action: () => duplicateSource(source), disabled: false },
                { label: `Move ${source.name} up`, icon: <ArrowUpIcon />, action: () => moveSource(source.id, -1), disabled: index === 0 },
                { label: `Move ${source.name} down`, icon: <ArrowDownIcon />, action: () => moveSource(source.id, 1), disabled: index === sources.length - 1 },
                { label: `Remove ${source.name}`, icon: <TrashIcon />, action: () => removeSource(source.id), disabled: false },
              ].map((item) => (
                <Button
                  aria-label={item.label}
                  className="w-full"
                  disabled={item.disabled}
                  key={item.label}
                  onClick={item.action}
                  size="icon-sm"
                  title={item.label}
                  type="button"
                  variant="secondary"
                >
                  {item.icon}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {!validation.valid ? (
        <div className="text-xs text-[color:var(--attention)]" role="status">
          {validation.errors[0]}
        </div>
      ) : null}
      {sources.length > 1 ? (
        <Button className="w-full" onClick={normalizeFrames} size="sm" type="button" variant="secondary">
          Normalize frames
        </Button>
      ) : null}
      {sources.length > 0 ? (
        <div className="text-xs text-[color:var(--muted-foreground)]">Ctrl+C / Ctrl+V duplicates the selected shape.</div>
      ) : null}
      <span className="sr-only">{storedSources.length} stored pattern shapes</span>
    </div>
  );
}

function PatternHistoryControl({
  dispatch,
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps<PatternHistoryEntry[]>): React.JSX.Element {
  const history = getPatternHistory(value);
  const activeId = history.at(-1)?.id;
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");

  function setRuntimeValue(target: string, nextValue: unknown): void {
    dispatch({ history: "skip", target, type: "controls.setValue", value: nextValue });
  }

  function activate(entry: PatternHistoryEntry): void {
    setValue([...history.filter((candidate) => candidate.id !== entry.id), entry], { history: "skip" });
    setRuntimeValue(patternTargets.patternName, entry.name);
  }

  function loadDraft(entry: PatternHistoryEntry): void {
    activate(entry);
    loadSnapshotIntoDraft(dispatch, entry.snapshot);
  }

  function remove(entry: PatternHistoryEntry): void {
    const nextHistory = history.filter((candidate) => candidate.id !== entry.id);
    setValue(nextHistory, { history: "record" });
    if (activeId !== entry.id) return;

    const nextActive = nextHistory.at(-1);
    setRuntimeValue(patternTargets.patternName, nextActive?.name ?? `Pattern ${nextHistory.length + 1}`);
  }

  function startRename(entry: PatternHistoryEntry): void {
    setEditingId(entry.id);
    setDraftName(entry.name);
  }

  function commitRename(entry: PatternHistoryEntry): void {
    const name = getUniquePatternName(
      draftName,
      history.filter((candidate) => candidate.id !== entry.id),
    );
    setValue(
      history.map((candidate) =>
        candidate.id === entry.id ? { ...candidate, name, updatedAt: Date.now() } : candidate,
      ),
      { history: "record" },
    );
    if (activeId === entry.id) setRuntimeValue(patternTargets.patternName, name);
    setEditingId(null);
  }

  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-sm text-[color:var(--muted-foreground)]" data-testid="pattern-history-empty">
        No patterns yet. Configure the draft and choose Create pattern.
      </div>
    );
  }

  return (
    <div className="grid gap-2" data-testid="pattern-history-list">
      {[...history].reverse().map((entry) => {
        const active = entry.id === activeId;
        return (
          <div
            className={
              active
                ? "grid min-w-0 gap-2 rounded-lg border border-[color:var(--link)] bg-[color:color-mix(in_oklab,var(--link)_14%,transparent)] p-2"
                : "grid min-w-0 gap-2 rounded-lg border border-transparent bg-[color:var(--muted)]/55 p-2"
            }
            data-active={active ? "true" : undefined}
            key={entry.id}
          >
            {editingId === entry.id ? (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1">
                <Input
                  aria-label={`Rename ${entry.name}`}
                  autoFocus
                  onChange={(event) => setDraftName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename(entry);
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  value={draftName}
                />
                <Button aria-label="Save pattern name" onClick={() => commitRename(entry)} size="icon-sm" type="button" variant="secondary"><CheckIcon /></Button>
                <Button aria-label="Cancel pattern rename" onClick={() => setEditingId(null)} size="icon-sm" type="button" variant="secondary"><XIcon /></Button>
              </div>
            ) : (
              <Button
                aria-pressed={active}
                className="h-auto min-w-0 justify-start px-2 py-2 text-left"
                onClick={() => activate(entry)}
                title={entry.name}
                type="button"
                variant="ghost"
              >
                <EyeIcon />
                <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                <span className="rounded bg-[color:var(--muted)] px-1.5 py-0.5 text-[10px] text-[color:var(--muted-foreground)]">
                  {entry.snapshot.method === "directional-phases"
                    ? "Gradient"
                    : entry.snapshot.method === "multi-size-mosaic"
                      ? "Mosaic"
                      : entry.snapshot.method === "triangle-lattice"
                        ? "Triangle"
                      : "Base"}
                </span>
                {active ? <CheckIcon className="text-[color:var(--link)]" /> : null}
              </Button>
            )}
            {editingId !== entry.id ? (
              <div className="grid grid-cols-3 gap-1">
                <Button className="w-full" onClick={() => loadDraft(entry)} size="sm" title={`Load ${entry.name} into editor`} type="button" variant="secondary"><ArrowCounterClockwiseIcon /> Edit</Button>
                <Button className="w-full" onClick={() => startRename(entry)} size="sm" title={`Rename ${entry.name}`} type="button" variant="secondary"><PencilSimpleIcon /></Button>
                <Button className="w-full" onClick={() => remove(entry)} size="sm" title={`Delete ${entry.name}`} type="button" variant="secondary"><TrashIcon /></Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ShapeVariantControl({
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps<PatternVariantValue>): React.JSX.Element {
  const source = getSelectedSource(state.values);
  const current = value;
  if (!source) return <div className="text-xs text-[color:var(--muted-foreground)]">No selected shape.</div>;
  const sourceFamilyId = source.familyId;
  const variants = source.availableVariants;
  const selected = variants.find((variant) => variant.id === current?.id) ??
    variants.find((variant) => variant.id === source.variantId) ?? variants[0];
  if (!selected) return <div className="text-xs text-[color:var(--muted-foreground)]">Imported variant only.</div>;
  const axes = [...new Map(variants.map((entry) => [`${entry.axis}:${entry.axisValue}`, entry])).values()];
  const radii = variants.filter(
    (entry) => entry.axis === selected.axis && entry.axisValue === selected.axisValue,
  );

  function commit(variant: ShapeVariant): void {
    setValue(
      {
        axis: variant.axis,
        axisValue: variant.axisValue,
        familyId: sourceFamilyId,
        id: variant.id,
        opacityUnits: variant.opacityUnits,
        parameters: variant.parameters,
        profileId: variant.profileId,
        radiusPx: variant.radiusPx,
        svgBody: variant.svgBody,
      },
      { history: "record" },
    );
  }

  const profileVariants = variants.filter((variant) => variant.profileId);
  if (profileVariants.length > 0) {
    return (
      <div className="grid gap-2" data-testid="shape-variant-control">
        <div className="grid grid-cols-3 gap-1.5">
          {profileVariants.map((entry) => (
            <Button
              aria-pressed={entry.id === selected.id}
              key={entry.id}
              onClick={() => commit(entry)}
              size="sm"
              type="button"
              variant="outline"
            >
              Profile {entry.profileId?.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="text-xs text-[color:var(--muted-foreground)]">
          {Object.entries(selected.parameters ?? {}).map(([key, parameter]) =>
            `${key}: ${Array.isArray(parameter) ? parameter.join(", ") : parameter}`,
          ).join(" · ")} · {selected.opacityUnits.count} opacity {selected.opacityUnits.count === 1 ? "unit" : "units"}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2" data-testid="shape-variant-control">
      <div className="grid grid-cols-2 gap-1.5">
        {axes.map((entry) => (
          <Button
            aria-pressed={entry.axis === selected.axis && entry.axisValue === selected.axisValue}
            key={`${entry.axis}:${entry.axisValue}`}
            onClick={() =>
              commit(
                variants.find(
                  (variant) =>
                    variant.axis === entry.axis &&
                    variant.axisValue === entry.axisValue &&
                    variant.radiusPx === 0,
                ) ?? entry,
              )
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {getShapeVariantLabel(entry)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {radii.map((entry) => (
          <Button
            aria-pressed={entry.id === selected.id}
            key={entry.id}
            onClick={() => commit(entry)}
            size="xs"
            type="button"
            variant="outline"
          >
            {entry.radiusPx}px
          </Button>
        ))}
      </div>
    </div>
  );
}

export const patternControlRenderers: ToolcraftControlRendererMap = {
  canvasSizingHelp: () => <CanvasSizingHelpControl />,
  emptySelection: () => <EmptySelectionControl />,
  directionalPhases: (props) => (
    <DirectionalPhasesControl
      {...(props as ToolcraftCustomControlRendererProps<DirectionalPhase[]>)}
    />
  ),
  mosaicConfig: (props) => (
    <MosaicControl
      {...(props as ToolcraftCustomControlRendererProps<Pick<MosaicSettings, "clusters" | "levels">>)}
    />
  ),
  opacityDistribution: (props) => (
    <OpacityDistributionControl
      {...(props as ToolcraftCustomControlRendererProps<OpacityDistributionSettings>)}
    />
  ),
  triangleConfig: (props) => (
    <TriangleControl
      {...(props as ToolcraftCustomControlRendererProps<TriangleSettings>)}
    />
  ),
  exportHelp: () => <ExportHelpControl />,
  shapeImportDetails: (props) => (
    <ImportDetailsControl
      {...(props as ToolcraftCustomControlRendererProps<ShapeImportForm>)}
    />
  ),
  patternSources: (props) => (
    <PatternSourcesControl
      {...(props as ToolcraftCustomControlRendererProps<PatternSource[]>)}
    />
  ),
  patternHistory: (props) => (
    <PatternHistoryControl
      {...(props as ToolcraftCustomControlRendererProps<PatternHistoryEntry[]>)}
    />
  ),
  shapeLibrary: (props) => (
    <LibraryControl {...(props as ToolcraftCustomControlRendererProps<string>)} />
  ),
  shapeVariant: (props) => (
    <ShapeVariantControl
      {...(props as ToolcraftCustomControlRendererProps<PatternVariantValue>)}
    />
  ),
};
