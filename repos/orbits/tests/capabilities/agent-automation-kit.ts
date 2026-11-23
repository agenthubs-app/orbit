/**
 * agent-design AG15 test kit (not a test file): a rule spec, the automation service over the in-memory due index, and a
 * dispatcher whose period computation, inbox and timers are counted fakes — so the tests see how many times a period
 * was computed, what was delivered and what was read.
 */
import type { AgentAutomation, AgentAutomationRecordPayload, AgentRuleSpec } from "../../features/agent/automations/contract";
import type { RuleInboxWriter } from "../../features/agent/automations/delivery";
import { dispatchDueAutomations, type AutomationDispatchDeps } from "../../features/agent/automations/dispatcher";
import { createMemoryAutomationStorage, type AutomationStorage } from "../../features/agent/automations/due-index";
import type { RulePeriodResult } from "../../features/agent/automations/run-rule";
import { createAutomationRunStore } from "../../features/agent/automations/runs";
import { createStorageAgentAutomationService } from "../../features/agent/automations/service";
import type { InboxNotificationUpsert } from "../../features/notifications/inbox-record-service";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export const WORKSPACE = "workspace:ag15-test";
export const FRIDAY_9 = { daysOfWeek: [5], kind: "weekly" as const, time: "09:00", timeZone: "Asia/Tokyo" };

export function ruleSpec(overrides: Partial<AgentRuleSpec> = {}): AgentRuleSpec {
  return {
    action: "pick",
    locale: "zh",
    maxItems: 3,
    notify: { inApp: true, push: false },
    onEmpty: "silent",
    ranking: { field: { direction: "asc", name: "startsAt" } },
    rankingBasis: "按开始时间从早到晚",
    references: [],
    scope: { domain: "event", window: "weekend" },
    scopeText: "周末活动",
    validUntil: null,
    ...overrides,
  };
}

export function serviceFor(storage: AutomationStorage, actorId: string, now: () => string) {
  return createStorageAgentAutomationService({ actorId, now, storage, store: storage.direct.store as unknown as LiveRecordStoreLike<AgentAutomationRecordPayload>, workspaceId: storage.workspaceId });
}

export async function createRule(storage: AutomationStorage, actorId: string, now: () => string, overrides: { rule?: Partial<AgentRuleSpec>; title?: string; schedule?: typeof FRIDAY_9 | { kind: "daily"; time: string; timeZone: string } } = {}): Promise<AgentAutomation> {
  return serviceFor(storage, actorId, now).create({ capabilityId: "events.recommend", delivery: "in_app", instruction: "周末活动", rule: ruleSpec(overrides.rule), title: overrides.title ?? "每周五挑三场周末活动", trigger: { kind: "schedule", schedule: overrides.schedule ?? FRIDAY_9 } });
}

export interface DispatchKit {
  storage: AutomationStorage;
  clock: { now: string };
  now: () => string;
  /** Every period computed: who, which rule, which period, what it was told to leave out. */
  computed: { ownerId: string; automationId: string; scheduledAt: string; told: string[]; previousCardId: string | null }[];
  inbox: InboxNotificationUpsert[];
  inboxFails: { value: boolean };
  expired: string[];
  unreadable: Set<string>;
  result: { value: (input: { ownerId: string; scheduledAt: string; told: ReadonlySet<string> }) => RulePeriodResult | Promise<RulePeriodResult> };
  deps: AutomationDispatchDeps;
  dispatch(at: string): ReturnType<typeof dispatchDueAutomations>;
  runs(ownerId: string, automationId: string): ReturnType<ReturnType<typeof createAutomationRunStore>["list"]>;
}

export const picked = (ids: readonly string[]): RulePeriodResult => ({ items: ids.map((id) => ({ id, kind: "event" as const, line: id, ref: `event:${id}`, title: id })), outcome: ids.length ? "computed" : "no_match", text: ids.length ? `结果：${ids.join("、")}` : "" });

export function createDispatchKit(start = "2026-11-15T01:00:00.000Z"): DispatchKit {
  const storage = createMemoryAutomationStorage(WORKSPACE);
  const clock = { now: start };
  const now = () => clock.now;
  const computed: DispatchKit["computed"] = [];
  const inbox: InboxNotificationUpsert[] = [];
  const inboxFails = { value: false };
  const expired: string[] = [];
  const unreadable = new Set<string>();
  const result: DispatchKit["result"] = { value: () => picked(["E101", "E102", "E105"]) };
  const writer: RuleInboxWriter = async (entry) => {
    if (inboxFails.value) throw new Error("inbox write failed");
    // The inbox's own producer write is idempotent by actor and semantic key.
    if (!inbox.some((existing) => existing.actorId === entry.actorId && existing.semanticKey === entry.semanticKey)) inbox.push(entry);
    return { id: `inbox:${entry.actorId}:${entry.semanticKey}` };
  };
  let lease = 0;
  const deps: AutomationDispatchDeps = {
    delivery: { inbox: writer, now, storage, visible: async (_ownerId, refs) => new Set(refs.filter((ref) => !unreadable.has(ref))) },
    leaseId: () => `lease-${(lease += 1)}`,
    now,
    runPeriod: async (input) => {
      computed.push({ automationId: input.automation.automationId, ownerId: input.ownerId, previousCardId: input.previousCardId, scheduledAt: input.scheduledAt, told: [...input.told].sort() });
      return result.value(input);
    },
    storage,
    timers: {
      async expireCard(_ownerId, actionId) {
        expired.push(actionId);
        return "expired";
      },
    },
  };
  return {
    clock,
    computed,
    deps,
    dispatch(at) {
      clock.now = new Date(at).toISOString();
      return dispatchDueAutomations(deps);
    },
    expired,
    inbox,
    inboxFails,
    now,
    result,
    runs: (ownerId, automationId) => createAutomationRunStore(storage.direct.store, storage.workspaceId).list(ownerId, automationId, 50),
    storage,
    unreadable,
  };
}
