/**
 * 建议与行动的三档分档（纯函数，可在客户端复用）。Sprint 0122 从
 * actions-route-view-model.ts 抽出：页面「加载更多」取回的更早记录按同一规则分档。
 */
import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import type {
  AgentActionsRouteViewModel,
  AgentActionsTierKey,
  AgentActionsTierViewModel,
} from "./actions-route-view-model";

function tierKeyForStatus(entry: AgentLedgerEntry): AgentActionsTierKey | null {
  switch (entry.status) {
    case "awaiting_confirmation":
      return "decide";
    case "approved":
    case "executing":
      return "today";
    case "deferred":
      return "later";
    default:
      return null;
  }
}

function isCompletedToday(entry: AgentLedgerEntry, dayStart: Date): boolean {
  if (!entry.completedAt) return false;
  const completed = new Date(entry.completedAt);
  return Number.isFinite(completed.getTime()) && completed >= dayStart;
}

/**
 * Groups ledger entries into the three tiers and today's progress. Pure, so
 * the page applies the same rules to older pages it loads later (0122).
 */
export function groupAgentActionEntries(
  entries: readonly AgentLedgerEntry[],
  now: Date = new Date(),
): Pick<AgentActionsRouteViewModel, "completedToday" | "tiers" | "todaysTotal"> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const grouped: Record<AgentActionsTierKey, AgentLedgerEntry[]> = {
    decide: [],
    later: [],
    today: [],
  };
  let completedToday = 0;
  for (const entry of entries) {
    const tier = tierKeyForStatus(entry);
    if (tier) {
      grouped[tier].push(entry);
    } else if (isCompletedToday(entry, dayStart)) {
      completedToday += 1;
    }
  }

  const tiers: readonly AgentActionsTierViewModel[] = [
    { entries: grouped.decide, key: "decide" },
    { entries: grouped.today, key: "today" },
    { entries: grouped.later, key: "later" },
  ];
  const actionable =
    grouped.decide.length + grouped.today.length + grouped.later.length;
  return { completedToday, tiers, todaysTotal: actionable + completedToday };
}
