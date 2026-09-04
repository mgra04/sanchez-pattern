import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";

import { exportPatternImage, exportPatternSvg } from "./pattern-export";
import {
  clonePatternSnapshot,
  createPatternHistoryEntry,
  getPatternHistory,
  getUniquePatternName,
} from "./pattern-model";
import {
  getActivePatternSnapshot,
  getCurrentPatternSnapshot,
  patternTargets,
} from "./pattern-state";
import { validatePatternSnapshot } from "./pattern-methods/registry";

function requireValidDraft(state: Parameters<ToolcraftPanelActionHandler>[0]["state"]) {
  const current = getCurrentPatternSnapshot(state.values);
  const validation = validatePatternSnapshot(current);

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  return current;
}

function requireActiveSnapshot(
  state: Parameters<ToolcraftPanelActionHandler>[0]["state"],
) {
  const snapshot = getActivePatternSnapshot(state.values);
  if (!snapshot) {
    throw new Error("Create or select a pattern before exporting.");
  }
  return snapshot;
}

export const handlePatternPanelAction: ToolcraftPanelActionHandler = async ({
  action,
  dispatch,
  reportProgress,
  state,
}) => {
  if (action.value === "regenerate") {
    const currentSeed = Number(state.values[patternTargets.seed] ?? 0);
    dispatch({
      history: "record",
      target: patternTargets.seed,
      type: "controls.setValue",
      value: Number.isFinite(currentSeed) ? currentSeed + 1 : 1,
    });
    return;
  }

  if (action.value === "create-pattern") {
    const snapshot = requireValidDraft(state);
    const history = getPatternHistory(state.values[patternTargets.history]);
    const entry = createPatternHistoryEntry({
      history,
      name: state.values[patternTargets.patternName],
      snapshot,
    });
    dispatch({
      history: "record",
      label: `Create ${entry.name}`,
      target: patternTargets.history,
      type: "controls.setValue",
      value: [...history, entry],
    });
    dispatch({ history: "skip", target: patternTargets.sources, type: "controls.setValue", value: entry.snapshot.sources });
    dispatch({ history: "skip", target: patternTargets.patternName, type: "controls.setValue", value: entry.name });
    return;
  }

  if (action.value === "update-pattern") {
    const snapshot = requireValidDraft(state);
    const history = getPatternHistory(state.values[patternTargets.history]);
    const active = history.at(-1);
    if (!active) {
      throw new Error("Select a pattern from history before updating it.");
    }
    const otherEntries = history.filter((entry) => entry.id !== active.id);
    const requestedName = state.values[patternTargets.patternName];
    const name =
      typeof requestedName === "string" && requestedName.trim() === active.name
        ? active.name
        : getUniquePatternName(requestedName, otherEntries);
    const updated = {
      ...active,
      name,
      snapshot: clonePatternSnapshot(snapshot),
      updatedAt: Date.now(),
    };
    dispatch({
      history: "record",
      label: `Update ${updated.name}`,
      target: patternTargets.history,
      type: "controls.setValue",
      value: history.map((entry) => (entry.id === active.id ? updated : entry)),
    });
    dispatch({ history: "skip", target: patternTargets.sources, type: "controls.setValue", value: updated.snapshot.sources });
    dispatch({ history: "skip", target: patternTargets.patternName, type: "controls.setValue", value: updated.name });
    return;
  }

  if (action.value === "export-svg" || action.value === "export-image") {
    reportProgress(0.1);
    const snapshot = requireActiveSnapshot(state);

    reportProgress(0.35);
    if (action.value === "export-svg") {
      await exportPatternSvg(state, snapshot);
    } else {
      await exportPatternImage(state, snapshot);
    }
    reportProgress(1);
  }
};
