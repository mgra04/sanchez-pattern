import * as React from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";
import { Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, ToggleGroup, ToggleGroupItem } from "@/toolcraft/ui";
import { Slider as PrimitiveSlider } from "@/toolcraft/ui/components/primitives";

import { PatternSourcePreview } from "../components/shape-preview";
import { defaultMosaicAnchorCoverage, getPatternSources, type MosaicCluster, type MosaicLevel, type MosaicSettings, type PatternDistribution } from "../pattern-model";
import { analyzeMosaicSnapshot, mosaicClusterLimit } from "../pattern-methods/mosaic/model";
import { planMosaicLayout } from "../pattern-methods/mosaic/packing";
import { getCurrentPatternSnapshot, getMosaicSettings, patternTargets } from "../pattern-state";

type MosaicConfigValue = Pick<MosaicSettings, "clusters" | "levels">;
const numberText = (value: number) => Number(value.toFixed(4)).toString();
const createId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random()}`;

export function MosaicControl({ setValue, state }: ToolcraftCustomControlRendererProps<MosaicConfigValue>): React.JSX.Element {
  const settings = getMosaicSettings(state.values);
  const levels = [...settings.levels];
  const clusters = [...settings.clusters];
  const sources = getPatternSources(state.values[patternTargets.sources]);
  const snapshot = getCurrentPatternSnapshot(state.values);
  const analysis = snapshot.method === "multi-size-mosaic" ? analyzeMosaicSnapshot(snapshot) : null;
  const packing = snapshot.method === "multi-size-mosaic" && analysis?.valid ? planMosaicLayout(snapshot, analysis) : null;

  function commit(nextLevels: readonly MosaicLevel[], nextClusters: readonly MosaicCluster[], history: "merge" | "record" = "record") {
    setValue({ clusters: nextClusters, levels: nextLevels }, { history });
  }
  function updateLevel(levelId: string, patch: Partial<MosaicLevel>, history: "merge" | "record" = "record") {
    commit(levels.map((level) => level.id === levelId ? { ...level, ...patch } : level), clusters, history);
  }
  function updateCluster(clusterId: string, patch: Partial<MosaicCluster>, history: "merge" | "record" = "record") {
    commit(levels, clusters.map((cluster) => cluster.id === clusterId ? { ...cluster, ...patch } : cluster), history);
  }
  function addLevel() {
    if (!analysis || levels.length >= analysis.maxLevels) return;
    const levelId = createId("mosaic-level");
    const nextLevel: MosaicLevel = { coverage: 0, count: 0, distribution: "equal", id: levelId, sourceIds: sources[0] ? [sources[0].id] : [] };
    commit([...levels, nextLevel], clusters.map((cluster, index) => ({ ...cluster, allocations: [...cluster.allocations, { count: 0, coverageShare: index === 0 ? 100 : 0, levelId }] })));
  }
  function removeHighestLevel() {
    if (levels.length <= 2) return;
    const removed = levels.at(-1)!;
    commit(levels.slice(0, -1), clusters.map((cluster) => ({ ...cluster, allocations: cluster.allocations.filter((allocation) => allocation.levelId !== removed.id) })));
  }
  function toggleSource(level: MosaicLevel, sourceId: string) {
    updateLevel(level.id, { sourceIds: level.sourceIds.includes(sourceId) ? level.sourceIds.filter((id) => id !== sourceId) : [...level.sourceIds, sourceId] });
  }
  function normalizeCoverage() {
    const total = levels.reduce((sum, level) => sum + Math.max(0, level.coverage), 0);
    const normalized = levels.map((level, index) => ({ ...level, coverage: index === levels.length - 1 ? 0 : total > 0 ? Math.max(0, level.coverage) / total * 100 : 100 / levels.length }));
    const preceding = normalized.slice(0, -1).reduce((sum, level) => sum + level.coverage, 0);
    normalized[normalized.length - 1] = { ...normalized.at(-1)!, coverage: Math.max(0, 100 - preceding) };
    commit(normalized, clusters);
  }
  function addCluster() {
    if (clusters.length >= mosaicClusterLimit) return;
    commit(levels, [...clusters, { allocations: levels.slice(1).map((level) => ({ count: 0, coverageShare: 0, levelId: level.id })), anchorCoverage: defaultMosaicAnchorCoverage, id: createId("mosaic-cluster"), name: `Cluster ${clusters.length + 1}`, spread: 25 }]);
  }
  function removeCluster(clusterId: string) {
    if (clusters.length <= 1) return;
    const removed = clusters.find((cluster) => cluster.id === clusterId);
    const remaining = clusters.filter((cluster) => cluster.id !== clusterId);
    if (!removed) return;
    const receiverId = remaining[0].id;
    commit(levels, remaining.map((cluster) => cluster.id !== receiverId ? cluster : { ...cluster, allocations: cluster.allocations.map((allocation) => { const transferred = removed.allocations.find((entry) => entry.levelId === allocation.levelId); return { ...allocation, count: allocation.count + (transferred?.count ?? 0), coverageShare: allocation.coverageShare + (transferred?.coverageShare ?? 0) }; }) }));
  }
  function updateAllocation(cluster: MosaicCluster, levelId: string, field: "count" | "coverageShare", value: number) {
    updateCluster(cluster.id, { allocations: cluster.allocations.map((allocation) => allocation.levelId === levelId ? { ...allocation, [field]: value } : allocation) }, "merge");
  }

  const firstError = analysis?.errors[0] ?? packing?.errors[0];
  const coverageTotal = levels.reduce((sum, level) => sum + level.coverage, 0);
  return (
    <div className="grid gap-4" data-testid="mosaic-editor">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-[color:var(--muted-foreground)]">{analysis ? `${analysis.totalSlots} slots · ${levels.length} sizes · ${clusters.length} clusters` : "Configure Mosaic"}</div>
        <Dialog>
          <DialogTrigger render={<Button size="sm" type="button" variant="ghost" />}>Guide</DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Mosaic guide</DialogTitle><DialogDescription>How recursive sizes and automatic clusters fill the Grid.</DialogDescription></DialogHeader><DialogBody className="grid gap-3 text-sm"><p>Rows and Columns count the smallest slots. Each next size spans twice as many slots per axis, so 12px with a 2px gap becomes 26px, then 54px.</p><p>Count uses exact tile totals. Coverage uses occupied slot area; discrete tile sizes can make Actual differ slightly from Requested. In Coverage mode, each Size share is distributed across all clusters and every Size column must total 100%.</p><p>Every cluster can use any non-base sizes. Its largest assigned size is its local anchor. Anchor coverage controls how much of that anchor perimeter the next smaller assigned size should border; Actual may differ because tiles are discrete or insufficient.</p><p>Spread controls anchor looseness and the reach of balanced branches without changing counts or Anchor coverage. Low values stay local; high values allow offset, diagonal, or briefly separated anchors and wider branches.</p><p>Different clusters keep one smallest-slot moat. Smallest shapes fill that moat and every remaining slot.</p><p>Create and Update run the same seeded packing used by preview and export.</p></DialogBody></DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-2" data-testid="mosaic-levels">
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">Sizes</span><div className="flex gap-1">{levels.length > 2 ? <Button aria-label="Remove highest Mosaic size" onClick={removeHighestLevel} size="icon-sm" type="button" variant="ghost"><TrashIcon /></Button> : null}{analysis && levels.length < analysis.maxLevels ? <Button aria-label="Add Mosaic size" onClick={addLevel} size="icon-sm" type="button" variant="secondary"><PlusIcon /></Button> : null}</div></div>
        {levels.map((level, index) => {
          const derived = analysis?.levels[index];
          return <div className="grid gap-2 rounded-lg bg-[color:var(--muted)] p-2" data-testid={`mosaic-level-${index + 1}`} key={level.id}>
            <div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium">Size {index + 1}</span><span className="text-[color:var(--muted-foreground)]">{derived ? `${derived.span}×${derived.span} · ${numberText(derived.frameWidth)}×${numberText(derived.frameHeight)}px` : "—"}</span></div>
            <div className="flex flex-wrap gap-1" aria-label={`Pattern Shapes for Size ${index + 1}`}>{sources.map((source) => { const active = level.sourceIds.includes(source.id); return <Button aria-label={`${active ? "Remove" : "Add"} ${source.name} ${active ? "from" : "to"} Size ${index + 1}`} aria-pressed={active} className="size-9 p-1" key={source.id} onClick={() => toggleSource(level, source.id)} type="button" variant={active ? "secondary" : "ghost"}><PatternSourcePreview className="size-6" source={source} /></Button>; })}</div>
            <ToggleGroup aria-label={`Distribution for Size ${index + 1}`} className="w-full" onValueChange={(values) => { const distribution = values.at(-1) as PatternDistribution | undefined; if (distribution) updateLevel(level.id, { distribution }); }} value={[level.distribution]} variant="outline"><ToggleGroupItem className="min-w-0 flex-1" value="equal">Equal</ToggleGroupItem><ToggleGroupItem className="min-w-0 flex-1" value="weighted">Weighted</ToggleGroupItem></ToggleGroup>
            <label className="grid gap-1 text-xs text-[color:var(--muted-foreground)]">{settings.amountMode === "coverage" ? "Requested coverage" : index === 0 ? "Derived count" : "Global count"}<Input disabled={index === 0 && settings.amountMode === "count"} min={0} onChange={(event) => { const next = Number(event.currentTarget.value); if (Number.isFinite(next)) updateLevel(level.id, settings.amountMode === "coverage" ? { coverage: next } : { count: next }, "merge"); }} step={settings.amountMode === "coverage" ? 0.1 : 1} type="number" value={settings.amountMode === "coverage" ? numberText(level.coverage) : numberText(derived?.tileCount ?? level.count)} /></label>
            {settings.amountMode === "coverage" && derived ? <div className="text-[11px] text-[color:var(--muted-foreground)]">Requested {numberText(level.coverage)}% · Actual {numberText(derived.actualCoverage)}%</div> : null}
          </div>;
        })}
        {settings.amountMode === "coverage" ? <div className="grid gap-1"><div className="flex items-center justify-between text-xs"><span>Total coverage</span><span data-testid="mosaic-coverage-total">{numberText(coverageTotal)}%</span></div><Button className="w-full" onClick={normalizeCoverage} size="sm" type="button" variant="secondary">Normalize coverage</Button></div> : null}
      </div>

      <div className="grid gap-2 border-t border-[color:var(--border)] pt-3" data-testid="mosaic-clusters">
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">Clusters</span>{clusters.length < mosaicClusterLimit ? <Button aria-label="Add Mosaic cluster" onClick={addCluster} size="icon-sm" type="button" variant="secondary"><PlusIcon /></Button> : null}</div>
        {clusters.map((cluster, clusterIndex) => {
          const derived = analysis?.clusters.find((entry) => entry.id === cluster.id);
          const packingSummary = packing?.clusterSummaries[cluster.id];
          return <div className="grid gap-2 rounded-lg bg-[color:var(--muted)] p-2" data-testid={`mosaic-cluster-${clusterIndex + 1}`} key={cluster.id}>
            <div className="flex gap-1"><Input aria-label={`Cluster ${clusterIndex + 1} name`} className="min-w-0 flex-1" onChange={(event) => updateCluster(cluster.id, { name: event.currentTarget.value }, "merge")} value={cluster.name} />{clusters.length > 1 ? <Button aria-label={`Remove ${cluster.name}`} onClick={() => removeCluster(cluster.id)} size="icon-sm" type="button" variant="ghost"><TrashIcon /></Button> : null}</div>
            <div className="text-[11px] text-[color:var(--muted-foreground)]">Anchor: {derived?.localAnchorLevelId ? `Size ${levels.findIndex((level) => level.id === derived.localAnchorLevelId) + 1}` : "none"}</div>
            <div className="grid grid-cols-2 gap-2">{levels.slice(1).map((level, levelIndex) => { const allocation = cluster.allocations.find((entry) => entry.levelId === level.id); const field = settings.amountMode === "coverage" ? "coverageShare" : "count"; return <label className="grid gap-1 text-[11px] text-[color:var(--muted-foreground)]" key={level.id}>Size {levelIndex + 2} {settings.amountMode === "coverage" ? "share" : "count"}<Input min={0} onChange={(event) => { const next = Number(event.currentTarget.value); if (Number.isFinite(next)) updateAllocation(cluster, level.id, field, next); }} step={settings.amountMode === "coverage" ? 0.1 : 1} type="number" value={numberText(allocation?.[field] ?? 0)} /></label>; })}</div>
            {derived?.supportLevelId ? <div className="grid gap-1" data-testid={`mosaic-anchor-coverage-${clusterIndex + 1}`}>
              <div className="flex items-center justify-between text-xs text-[color:var(--muted-foreground)]"><span>Anchor coverage</span><span>{numberText(cluster.anchorCoverage)}%</span></div>
              <PrimitiveSlider getAriaLabel={() => `Anchor coverage for ${cluster.name}`} max={100} min={0} onValueChange={(next) => { const anchorCoverage = Array.isArray(next) ? next[0] : next; if (typeof anchorCoverage === "number") updateCluster(cluster.id, { anchorCoverage }, "merge"); }} onValueCommitted={(next) => { const anchorCoverage = Array.isArray(next) ? next[0] : next; if (typeof anchorCoverage === "number") updateCluster(cluster.id, { anchorCoverage }, "record"); }} showFill step={1} value={[cluster.anchorCoverage]} />
              {packingSummary ? <div className="text-[11px] text-[color:var(--muted-foreground)]" data-testid={`mosaic-anchor-coverage-actual-${clusterIndex + 1}`}>Actual {numberText(packingSummary.achievedAnchorCoverage)}%</div> : null}
            </div> : null}
            <div className="grid gap-1"><div className="flex items-center justify-between text-xs text-[color:var(--muted-foreground)]"><span>Spread</span><span>{numberText(cluster.spread)}%</span></div><PrimitiveSlider getAriaLabel={() => `Spread for ${cluster.name}`} max={100} min={0} onValueChange={(next) => { const spread = Array.isArray(next) ? next[0] : next; if (typeof spread === "number") updateCluster(cluster.id, { spread }, "merge"); }} onValueCommitted={(next) => { const spread = Array.isArray(next) ? next[0] : next; if (typeof spread === "number") updateCluster(cluster.id, { spread }, "record"); }} showFill step={1} value={[cluster.spread]} /></div>
          </div>;
        })}
      </div>
      {analysis ? <div className="rounded-lg border border-[color:var(--border)] p-2 text-[11px] text-[color:var(--muted-foreground)]" data-testid="mosaic-capacity-summary">{analysis.nonBaseArea} non-base slots · {analysis.smallestCount} smallest tiles · max {analysis.maxLevels} sizes</div> : null}
      {firstError ? <div className="text-xs text-[color:var(--attention)]" data-testid="mosaic-error" role="status">{firstError}</div> : packing?.valid ? <div className="text-xs text-[color:var(--muted-foreground)]" data-testid="mosaic-valid" role="status">Recipe fits the current Grid.</div> : null}
    </div>
  );
}
