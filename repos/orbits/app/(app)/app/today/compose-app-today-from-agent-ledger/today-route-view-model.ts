/**
 * Today 决策收件箱 route view-model。
 *
 * Today 不持有自己的数据，它只是操作账本的一个视图：
 *   awaiting_confirmation → 需要你决定
 *   executing             → 已准备的操作
 *   completed / failed / partially_failed / canceled / rejected / undone → 最近动态
 * deferred（稍后处理）刻意不在 Today 出现，只在 All actions 可见。
 */
import {
  AGENT_LEDGER_ERROR_DEFINITIONS,
  agentLedgerFailureToAppError,
  type AgentLedgerEntry,
  type AgentLedgerEntryStatus,
} from "../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../features/agent/service-factory";
import type { AgentLedgerService } from "../../../../../features/agent/ledger/service";
import { isUnviewedPreEventBriefEntry } from "../../../../../features/agent/ledger/pre-event-brief";

export interface AppTodaySearchParams {
  entry?: string | string[];
}
export interface AppTodayRouteControls {
  scenario?: "empty" | "failure";
}

export type TodaySectionKey = "decide" | "prepared" | "recent";

export interface TodaySectionViewModel {
  key: TodaySectionKey;
  title: string;
  entries: readonly AgentLedgerEntry[];
}

export interface AppTodayRouteViewModel {
  state: "success" | "empty" | "failure";
  decideCount: number;
  hiddenDecisionCount: number;
  sections: readonly TodaySectionViewModel[];
  selectedEntry: AgentLedgerEntry | null;
  evidenceIds: readonly string[];
  errorCode: string | null;
  failureMessage: string | null;
}

export interface AppTodayRouteDependencies {
  ledgerService?: AgentLedgerService | null;
}

const SECTION_TITLES: Record<TodaySectionKey, string> = {
  decide: "需要你决定",
  prepared: "已准备的操作",
  recent: "最近动态",
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
const TODAY_DECISION_LIMIT = 5;

const OPERATION_STAGE_WEIGHT: Partial<
  Record<AgentLedgerEntry["operations"][number]["operationType"], number>
> = {
  propose_meeting_slots: 35,
  create_intro_request: 32,
  accept_intro_request: 32,
  create_followup_task: 28,
  create_followup_reminder: 26,
  add_to_orbit_schedule: 24,
  save_message_draft: 20,
  generate_meeting_brief: 18,
  create_preparation_task: 18,
  save_event_goal: 16,
  save_meeting_note: 12,
  save_memory: 8,
  archive_contacts: 4,
  sync_event_to_calendar: 2,
};

const RISK_WEIGHT: Record<NonNullable<AgentLedgerEntry["riskLevel"]>, number> = {
  external: 40,
  write: 30,
  draft: 15,
  read: 5,
};

function operationDueAt(entry: AgentLedgerEntry): number | null {
  const times = entry.operations.flatMap((operation) => {
    const dueAt = operation.payload?.dueAt;
    if (typeof dueAt !== "string") return [];
    const parsed = Date.parse(dueAt);
    return Number.isFinite(parsed) ? [parsed] : [];
  });
  return times.length > 0 ? Math.min(...times) : null;
}

function decisionPriority(entry: AgentLedgerEntry, nowMs: number): number {
  const dueAt = operationDueAt(entry);
  const dueWeight =
    dueAt === null
      ? 0
      : dueAt <= nowMs
        ? 100
        : dueAt - nowMs <= 86_400_000
          ? 85
          : dueAt - nowMs <= 7 * 86_400_000
            ? 60
            : 25;
  const riskWeight = RISK_WEIGHT[entry.riskLevel ?? "read"];
  const stageWeight = Math.max(
    0,
    ...entry.operations.map(
      (operation) => OPERATION_STAGE_WEIGHT[operation.operationType] ?? 0,
    ),
  );
  const hasExplicitGoal = entry.operations.some(
    (operation) =>
      typeof operation.payload?.goal === "string" &&
      operation.payload.goal.trim().length > 0,
  );

  return dueWeight + riskWeight + stageWeight + (hasExplicitGoal ? 15 : 0);
}

function decisionContactKey(entry: AgentLedgerEntry): string {
  const contactName = entry.contactName?.trim().toLocaleLowerCase();
  return contactName ? `contact:${contactName}` : `entry:${entry.entryId}`;
}

function visibleDecisionEntries(
  entries: readonly AgentLedgerEntry[],
  requestedEntryId: string | null,
  nowMs: number,
): AgentLedgerEntry[] {
  const ranked = [...entries].sort((left, right) => {
    const priorityDelta =
      decisionPriority(right, nowMs) - decisionPriority(left, nowMs);
    if (priorityDelta !== 0) return priorityDelta;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
  const requested = requestedEntryId
    ? ranked.find((entry) => entry.entryId === requestedEntryId)
    : null;
  const candidates = requested
    ? [requested, ...ranked.filter((entry) => entry.entryId !== requested.entryId)]
    : ranked;
  const seenContacts = new Set<string>();
  const visible: AgentLedgerEntry[] = [];

  for (const entry of candidates) {
    const contactKey = decisionContactKey(entry);
    if (seenContacts.has(contactKey)) continue;
    seenContacts.add(contactKey);
    visible.push(entry);
    if (visible.length === TODAY_DECISION_LIMIT) break;
  }

  return visible;
}

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
  dependencies: AppTodayRouteDependencies = {},
  controls: AppTodayRouteControls = {},
): Promise<AppTodayRouteViewModel> {
  if (dependencies.ledgerService === null) {
    return {
      decideCount: 0,
      hiddenDecisionCount: 0,
      errorCode: "AGENT_LEDGER_ACTOR_REQUIRED",
      evidenceIds: [],
      failureMessage:
        AGENT_LEDGER_ERROR_DEFINITIONS.AGENT_LEDGER_ACTOR_REQUIRED.message,
      sections: [],
      selectedEntry: null,
      state: "failure",
    };
  }

  const service =
    dependencies.ledgerService ?? createAgentLedgerService();
  const result = await service.listEntries({
    scenario: controls.scenario,
  });

  if (result.success === false) {
    return {
      decideCount: 0,
      hiddenDecisionCount: 0,
      errorCode: result.error.code,
      evidenceIds: result.error.evidenceIds,
      failureMessage: agentLedgerFailureToAppError(result).message,
      sections: [],
      selectedEntry: null,
      state: "failure",
    };
  }

  const entries = result.data.entries;
  const requestedEntryId = readParam(searchParams, "entry");
  const allDecideEntries = entries.filter(
    (entry) => todaySectionForEntry(entry) === "decide",
  );
  const decideEntries = visibleDecisionEntries(
    allDecideEntries,
    requestedEntryId,
    Date.now(),
  );
  const sections = SECTION_ORDER.map((key) => ({
    entries:
      key === "decide"
        ? decideEntries
        : entries.filter((entry) => todaySectionForEntry(entry) === key),
    key,
    title: SECTION_TITLES[key],
  })).filter((section) => section.entries.length > 0);

  const selectedEntry =
    entries.find((entry) => entry.entryId === requestedEntryId) ??
    decideEntries[0] ??
    null;

  return {
    decideCount: decideEntries.length,
    hiddenDecisionCount: Math.max(
      0,
      allDecideEntries.length - decideEntries.length,
    ),
    errorCode: null,
    evidenceIds: result.data.provenance.evidenceIds,
    failureMessage: null,
    sections,
    selectedEntry,
    state: sections.length === 0 ? "empty" : "success",
  };
}

export const __internal = {
  decisionPriority,
  visibleDecisionEntries,
};
