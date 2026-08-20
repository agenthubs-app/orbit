import type { AgentSignal } from "./contract";

export interface AgentHomeSignalSelectionOptions {
  activeLimit?: number;
  resolvedLimit?: number;
}

function descendingImportance(left: AgentSignal, right: AgentSignal): number {
  return (
    right.importance - left.importance ||
    right.lastMeaningfulChangeAt.localeCompare(left.lastMeaningfulChangeAt) ||
    left.signalId.localeCompare(right.signalId)
  );
}

function descendingResolution(left: AgentSignal, right: AgentSignal): number {
  return (
    (right.resolvedAt ?? right.lastObservedAt).localeCompare(
      left.resolvedAt ?? left.lastObservedAt,
    ) || descendingImportance(left, right)
  );
}

export function selectAgentHomeSignals(
  signals: readonly AgentSignal[],
  options: AgentHomeSignalSelectionOptions = {},
): readonly AgentSignal[] {
  const activeLimit = Math.max(0, options.activeLimit ?? 3);
  const resolvedLimit = Math.max(0, options.resolvedLimit ?? 1);
  const active = signals
    .filter(
      (signal) =>
        signal.status === "new" || signal.status === "acknowledged",
    )
    .sort(descendingImportance)
    .slice(0, activeLimit);
  const resolved = signals
    .filter((signal) => signal.status === "resolved")
    .sort(descendingResolution)
    .slice(0, resolvedLimit);

  return [...active, ...resolved];
}
