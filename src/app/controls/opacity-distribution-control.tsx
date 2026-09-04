import * as React from "react";
import { PlusIcon, ShuffleIcon, TrashIcon } from "@phosphor-icons/react";

import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";
import {
  Button,
  ControlFieldLabel,
  Field,
  Input,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@/toolcraft/ui";

import {
  normalizeOpacityDistribution,
  validateOpacityDistribution,
  type OpacityDistributionSettings,
} from "../pattern-model";

function nextVariantId(settings: OpacityDistributionSettings): string {
  let index = settings.variants.length + 1;
  const ids = new Set(settings.variants.map((entry) => entry.id));
  while (ids.has(`opacity-${index}`)) index += 1;
  return `opacity-${index}`;
}

export function OpacityDistributionControl({
  setValue,
  value,
}: ToolcraftCustomControlRendererProps<OpacityDistributionSettings>): React.JSX.Element {
  const settings = normalizeOpacityDistribution(value);
  const total = settings.variants.reduce((sum, entry) => sum + entry.chance, 0);
  const errors = settings.enabled ? validateOpacityDistribution(settings) : [];

  function update(patch: Partial<OpacityDistributionSettings>): void {
    setValue({ ...settings, ...patch }, { history: "merge" });
  }

  return (
    <div className="grid gap-4" data-testid="opacity-distribution-control">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[color:var(--foreground)]">Apply distribution</span>
        <Switch
          aria-label="Apply opacity distribution"
          checked={settings.enabled}
          name="opacity-distribution-enabled"
          onCheckedChange={(enabled) => update({ enabled })}
        />
      </div>

      {settings.enabled ? (
        <>
          <div>
            <div className="mb-2 text-xs text-[color:var(--muted-foreground)]">Apply to</div>
            <ToggleGroup
              aria-label="Opacity distribution mode"
              className="w-full"
              onValueChange={(next) => {
                const mode = next[0];
                if (mode === "whole-shape" || mode === "each-element") update({ mode });
              }}
              value={[settings.mode]}
              variant="outline"
            >
              <ToggleGroupItem className="min-w-0 flex-1" value="whole-shape">Whole</ToggleGroupItem>
              <ToggleGroupItem className="min-w-0 flex-1" value="each-element">Elements</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Field>
            <ControlFieldLabel>Appearance seed</ControlFieldLabel>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                aria-label="Appearance seed"
                min={0}
                onChange={(event) => update({ seed: Number(event.currentTarget.value) || 0 })}
                step={1}
                type="number"
                value={settings.seed}
              />
              <Button
                aria-label="New appearance seed"
                onClick={() => update({ seed: settings.seed + 1 })}
                size="icon"
                type="button"
                variant="secondary"
              >
                <ShuffleIcon />
              </Button>
            </div>
          </Field>

          <div className="grid gap-2">
            <div className="grid grid-cols-[1fr_1fr_32px] gap-2 text-[11px] text-[color:var(--muted-foreground)]">
              <span>Opacity</span>
              <span>Chance</span>
              <span className="sr-only">Remove</span>
            </div>
            {settings.variants.map((entry) => (
              <div className="grid grid-cols-[1fr_1fr_32px] gap-2" key={entry.id}>
                <Input
                  aria-label={`Opacity ${entry.id}`}
                  max={100}
                  min={0}
                  onChange={(event) => update({
                    variants: settings.variants.map((candidate) =>
                      candidate.id === entry.id
                        ? { ...candidate, opacity: Number(event.currentTarget.value) }
                        : candidate,
                    ),
                  })}
                  step={1}
                  type="number"
                  value={entry.opacity}
                />
                <Input
                  aria-label={`Chance ${entry.id}`}
                  max={100}
                  min={0}
                  onChange={(event) => update({
                    variants: settings.variants.map((candidate) =>
                      candidate.id === entry.id
                        ? { ...candidate, chance: Number(event.currentTarget.value) }
                        : candidate,
                    ),
                  })}
                  step={1}
                  type="number"
                  value={entry.chance}
                />
                <Button
                  aria-label={`Remove ${entry.id}`}
                  disabled={settings.variants.length <= 1}
                  onClick={() => update({
                    variants: settings.variants.filter((candidate) => candidate.id !== entry.id),
                  })}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <TrashIcon />
                </Button>
              </div>
            ))}
            <Button
              className="w-full"
              onClick={() => update({
                variants: [
                  ...settings.variants,
                  { chance: 0, id: nextVariantId(settings), opacity: 50 },
                ],
              })}
              type="button"
              variant="secondary"
            >
              <PlusIcon /> Add opacity
            </Button>
          </div>

          <div
            aria-live="polite"
            className={errors.length > 0
              ? "text-xs text-[color:var(--destructive)]"
              : "text-xs text-[color:var(--muted-foreground)]"}
          >
            Total: {total}%{errors[0] ? ` · ${errors[0]}` : ""}
          </div>
        </>
      ) : null}
    </div>
  );
}
