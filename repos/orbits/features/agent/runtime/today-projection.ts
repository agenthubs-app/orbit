import type { AgentLedgerEntry } from "../ledger/contract";
import type { TodayWorkItem } from "./contract";

export function projectLedgerEntriesToTodayWorkItems(
  entries: readonly AgentLedgerEntry[],
): readonly TodayWorkItem[] {
  return entries.flatMap((entry) => {
    const section =
      entry.status === "awaiting_confirmation"
        ? "decide"
        : entry.status === "approved" || entry.status === "executing"
          ? "prepared"
          : entry.status === "deferred"
            ? null
            : "recent";
    if (!section) return [];
    return [
      {
        workItemId: `today:${entry.entryId}`,
        actionId: entry.entryId,
        runId: entry.runId,
        workflowKey: entry.workflowKey,
        section,
        title: entry.title,
        summary: entry.whyNow,
        status: entry.status,
        occurredAt: entry.updatedAt,
        evidenceIds: entry.evidenceIds,
      },
    ];
  });
}
