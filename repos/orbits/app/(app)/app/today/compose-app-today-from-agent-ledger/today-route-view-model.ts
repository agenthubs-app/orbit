/**
 * Today 决策收件箱 route view-model。
 *
 * Today 不持有自己的数据，它只是操作账本的一个视图：
 *   awaiting_confirmation → 需要你决定
 *   executing             → ORBIT 已准备
 *   completed / failed / partially_failed / undone → 最近完成
 * deferred（稍后处理）刻意不在 Today 出现，只在 All actions 可见。
 */
import {
  agentLedgerFailureToAppError,
  type AgentLedgerEntry,
  type AgentLedgerEntryStatus,
} from "../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../features/agent/service-factory";
import { isUnviewedPreEventBriefEntry } from "../../../../../features/agent/ledger/pre-event-brief";

export type AppTodaySearchParams = Record<
  string,
  string | string[] | undefined
>;

export type TodaySectionKey = "decide" | "prepared" | "recent";

export interface TodaySectionViewModel {
  key: TodaySectionKey;
  title: string;
  entries: readonly AgentLedgerEntry[];
}

export interface AppTodayRouteViewModel {
  state: "success" | "empty" | "failure";
  decideCount: number;
  sections: readonly TodaySectionViewModel[];
  selectedEntry: AgentLedgerEntry | null;
  evidenceIds: readonly string[];
  errorCode: string | null;
  failureMessage: string | null;
}

const SECTION_TITLES: Record<TodaySectionKey, string> = {
  decide: "需要你决定",
  prepared: "ORBIT 已准备",
  recent: "最近完成",
};

/** 每个账本状态在 Today 的归属。null = 刻意不在 Today 出现（只在 All actions 可见）。
 *  用 Record 而不是数组，这样新增状态时 TypeScript 会强制做出归属决定。 */
export const TODAY_SECTION_BY_STATUS: Record<
  AgentLedgerEntryStatus,
  TodaySectionKey | null
> = {
  approved: "prepared",
  awaiting_confirmation: "decide",
  canceled: "recent",
  completed: "recent",
  deferred: null,
  executing: "prepared",
  failed: "recent",
  partially_failed: "recent",
  rejected: "recent",
  undone: "recent",
};

export function todaySectionForEntry(
  entry: AgentLedgerEntry,
): TodaySectionKey | null {
  if (isUnviewedPreEventBriefEntry(entry)) return "prepared";
  return TODAY_SECTION_BY_STATUS[entry.status];
}

const SECTION_ORDER: readonly TodaySectionKey[] = ["decide", "prepared", "recent"];

function readParam(
  params: AppTodaySearchParams | undefined,
  key: string,
): string | null {
  const value = params?.[key];

  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;

  return null;
}

export async function loadAppTodayRouteViewModel(
  searchParams?: AppTodaySearchParams,
): Promise<AppTodayRouteViewModel> {
  const service = createAgentLedgerService();
  const result = await service.listEntries({
    scenario: readParam(searchParams, "scenario"),
  });

  if (result.success === false) {
    return {
      decideCount: 0,
      errorCode: result.error.code,
      evidenceIds: result.error.evidenceIds,
      failureMessage: agentLedgerFailureToAppError(result).message,
      sections: [],
      selectedEntry: null,
      state: "failure",
    };
  }

  const entries = result.data.entries;
  const sections = SECTION_ORDER.map((key) => ({
    entries: entries.filter((entry) => todaySectionForEntry(entry) === key),
    key,
    title: SECTION_TITLES[key],
  })).filter((section) => section.entries.length > 0);

  const decideEntries =
    sections.find((section) => section.key === "decide")?.entries ?? [];
  const requestedEntryId = readParam(searchParams, "entry");
  const selectedEntry =
    entries.find((entry) => entry.entryId === requestedEntryId) ??
    decideEntries[0] ??
    null;

  return {
    decideCount: decideEntries.length,
    errorCode: null,
    evidenceIds: result.data.provenance.evidenceIds,
    failureMessage: null,
    sections,
    selectedEntry,
    state: sections.length === 0 ? "empty" : "success",
  };
}
