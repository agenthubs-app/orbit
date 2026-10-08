/**
 * W0050（RN-08）：「机会」标签的服务端读取（`/app/contacts/dashboard?tab=opportunities`，只有这个标签读）。
 *
 * 读取边界（R-6、D46③）：整个加载对任何表 0 次 INSERT／UPDATE／DELETE、计划生成器 0 次解析、付费 AI 0 次：
 * - 计划只经 `PlanService.getCurrent()`（只读事务）+ 纯投影 `toOpportunityPlanView`；不调 getCurrentView／enterCurrentPhase；
 * - 快照经 W0048a `readView(…, { enqueue: false })`：判定需要自动重算时也不排队（排队留给结构标签与维护任务）；
 * - 待确认候选只读（`listPending`）；现有联系人的 `'plan'` 匹配任务不在这里入队（计划保存后与 `plan-match` 维护任务兜底）；
 * - 活动、待唤醒、依据姓名都是一条只读语句。
 * 各部分失败互不影响：失败的那块如实显示「暂时读不到」，其余照常。
 */
import { createConfiguredCanonicalPublicEventCatalogue } from "../../../../../features/events/core/public-catalogue-runtime";
import { createConfiguredEventOperationsRepository } from "../../../../../features/events/event-operations/repository";
import { readPublicBookableEvents, type PublicBookableEvent } from "../../../../../features/events/public-goal-recommendations";
import type { NetworkSnapshotView, SnapshotLanguage } from "../../../../../features/network-analysis/contract";
import { analysisGate, belowThresholdSnapshotView, type AnalysisThreshold } from "../../../../../features/network-analysis/analysis-threshold";
import { readEvidenceContactNames, type EvidenceContactName } from "../../../../../features/network-analysis/evidence-contacts";
import { getConfiguredNetworkAnalysisRuntime, readCurrentPlanForSnapshot } from "../../../../../features/network-analysis/runtime";
import { unavailableSnapshotView } from "../../../../../features/network-analysis/service";
import type { PlanSnapshot } from "../../../../../features/plans/contract";
import { toOpportunityPlanView } from "../../../../../features/plans/coverage";
import { getConfiguredPlanMatchingRuntime } from "../../../../../features/plans/matching-runtime";
import type { PlanMatchCandidatesView } from "../../../../../features/plans/matching-service";
import { RELATIONSHIP_STRENGTH_COLLECTION } from "../../../../../features/relationship-strength/read-model";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { RelationshipTimelineSource } from "../../../../../shared/contract/relationship-timeline";
import type { LiveRecordSqlClient } from "../../../../../shared/storage/postgres-live-record-store";
import { readContactInsightNextSteps } from "../../../../../features/contacts/insights/read";
import {
  applyDormantInsights,
  buildOpportunitiesTabView,
  gapEvidenceIds,
  type DormantCandidate,
  type DormantInsight,
  type OpportunitiesTabView,
} from "./opportunities-view-model";

/** 待唤醒候选一次最多读多少位（按最近记录倒序；筛选后最多显示 5 位）。 */
export const DORMANT_CANDIDATE_READ_LIMIT = 200;

export interface OpportunitiesTabLoaderDeps {
  readPlan: (actorId: string) => Promise<PlanSnapshot | null>;
  /** 只读快照视图；null = 快照服务不可用。 */
  readSnapshot: ((actorId: string, language: SnapshotLanguage) => Promise<NetworkSnapshotView>) | null;
  /** null = 匹配服务不可用。 */
  readPending: ((actorId: string) => Promise<PlanMatchCandidatesView>) | null;
  readBookableEvents: (actorId: string, now: Date) => Promise<readonly PublicBookableEvent[]>;
  readDormant: (actorId: string) => Promise<DormantCandidate[]>;
  readContactNames: (actorId: string, recordIds: readonly string[]) => Promise<Map<string, EvidenceContactName>>;
  /** W0051：待唤醒的 ≤5 位联系人的洞察（只读 contact_insights，0 次 AI、0 次配额）。 */
  readInsights?: (actorId: string, contactIds: readonly string[], goal: string | null, now: Date) => Promise<Map<string, DormantInsight>>;
}

/** W0051：按待唤醒的 ≤5 位联系人读洞察行，换成视图状态（目标已更新等按当前目标判定）。 */
export async function readDormantInsights(actorId: string, contactIds: readonly string[], goal: string | null, _now: Date): Promise<Map<string, DormantInsight>> {
  const result = new Map<string, DormantInsight>();
  // 没有关系目标：一律 no_goal（不读）。
  if (!goal?.trim()) {
    for (const contactId of contactIds) result.set(contactId, { nextStep: null, state: "no_goal" });
    return result;
  }
  const rows = await readContactInsightNextSteps(actorId, contactIds);
  for (const contactId of contactIds) {
    const row = rows.get(contactId);
    const state = !row ? "none" : row.status === "ready" ? "ready" : row.status === "failed" ? "failed" : row.status === "blocked_no_goal" ? "none" : "pending";
    result.set(contactId, { nextStep: row?.nextStep ?? null, state });
  }
  return result;
}

const SOURCES = new Set<RelationshipTimelineSource>(["memo", "encounter", "note", "plan", "schedule", "followup_done", "capture"]);

/** dormant 强度行 × 本人联系人（同一归属谓词），只取最近一条信号与渲染所需的几列。 */
export const DORMANT_CANDIDATES_SQL = `/* opportunities:dormant-candidates */
  select s.payload->>'contactId' as contact_id,
    c.payload->>'id' as link_id,
    c.payload->>'displayName' as name,
    c.payload->>'organization' as organization,
    c.payload->>'role' as role,
    c.payload->>'primaryIndustryId' as primary_industry_id,
    (select sig from jsonb_array_elements(case when jsonb_typeof(s.payload->'signals') = 'array' then s.payload->'signals' else '[]'::jsonb end) as sig
      order by sig->>'occurredAt' desc limit 1) as last_signal
  from orbit_records s
  join orbit_records c
    on c.workspace_id = s.workspace_id and c.collection_name = 'contacts' and c.record_id = s.payload->>'contactId'
   and c.user_id = $2 and c.lifecycle_state <> 'deleted'
   and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))
  where s.workspace_id = $1 and s.collection_name = '${RELATIONSHIP_STRENGTH_COLLECTION}' and s.user_id = $2
    and s.lifecycle_state <> 'deleted' and (s.payload->>'dormant')::boolean
  order by s.payload->>'lastSignalAt' desc nulls last, s.record_id
  limit ${DORMANT_CANDIDATE_READ_LIMIT}`;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function readDormantCandidates(input: { client: LiveRecordSqlClient; workspaceId: string }, actorId: string): Promise<DormantCandidate[]> {
  const result = await input.client.query<Record<string, unknown>>(DORMANT_CANDIDATES_SQL, [input.workspaceId, actorId]);
  return result.rows.flatMap((row) => {
    const contactId = text(row.contact_id);
    const name = text(row.name);
    if (!contactId || !name) return [];
    const raw = (typeof row.last_signal === "string" ? JSON.parse(row.last_signal) : row.last_signal) as Record<string, unknown> | null;
    const recordId = text(raw?.timelineItemId);
    const occurredAt = text(raw?.occurredAt);
    const source = raw?.source as RelationshipTimelineSource | undefined;
    return [{
      contactId,
      dormant: true,
      lastSignal: recordId && occurredAt && source && SOURCES.has(source) ? { occurredAt, recordId, source } : null,
      linkId: text(row.link_id) ?? contactId,
      name,
      organization: text(row.organization),
      primaryIndustryId: text(row.primary_industry_id),
      role: text(row.role),
    }];
  });
}

async function readConfiguredBookableEvents(actorId: string, now: Date): Promise<readonly PublicBookableEvent[]> {
  return readPublicBookableEvents(
    {
      listMemberships: async ({ accountId, eventIds }) => {
        const repository = createConfiguredEventOperationsRepository();
        if (!repository) throw new Error("Canonical event operations are unavailable");
        return repository.listCanonicalRegistrationsForUser(accountId, eventIds);
      },
      readPublicCatalogue: async (at) => {
        const catalogue = createConfiguredCanonicalPublicEventCatalogue({ now: at });
        if (!catalogue) throw new Error("Canonical public event catalogue is unavailable");
        return catalogue.readRecords();
      },
    },
    actorId,
    now,
  );
}

export function defaultOpportunitiesTabLoaderDeps(): OpportunitiesTabLoaderDeps {
  const runtime = getConfiguredNetworkAnalysisRuntime();
  const matching = getConfiguredPlanMatchingRuntime();
  return {
    readBookableEvents: readConfiguredBookableEvents,
    readContactNames: runtime
      ? (actorId, ids) => readEvidenceContactNames({ client: runtime.client, workspaceId: runtime.workspaceId }, actorId, ids)
      : async () => new Map(),
    readDormant: runtime ? (actorId) => readDormantCandidates({ client: runtime.client, workspaceId: runtime.workspaceId }, actorId) : async () => [],
    readPending: matching ? (actorId) => matching.service.listPending({ actorId }) : null,
    readInsights: readDormantInsights,
    readPlan: (actorId) => readCurrentPlanForSnapshot(actorId),
    readSnapshot: runtime ? (actorId, language) => runtime.service.readView(actorId, language, { enqueue: false }) : null,
  };
}

function log(event: string, actorId: string, error: unknown) {
  console.error(JSON.stringify({ actorId, error: error instanceof Error ? error.name : "unknown", event }));
}

export async function loadOpportunitiesTab(
  input: {
    actorId: string;
    language: OrbitLanguage;
    now: Date;
    goal: Promise<string | null> | string | null;
    /** W0054：门槛读数；未达时不读快照、不读待唤醒洞察（报告卡换成门槛卡）。null／缺省 = 未知，照旧。 */
    threshold?: AnalysisThreshold | null;
  },
  deps: OpportunitiesTabLoaderDeps = defaultOpportunitiesTabLoaderDeps(),
): Promise<OpportunitiesTabView> {
  const { actorId, now } = input;
  const language: SnapshotLanguage = input.language === "zh" ? "zh" : "en";
  const guard = <T>(event: string, promise: Promise<T>, fallback: T): Promise<T> =>
    promise.catch((error: unknown) => { log(event, actorId, error); return fallback; });

  const planPromise = guard(
    "opportunities_tab_plan_failed",
    deps.readPlan(actorId).then((snapshot) => (snapshot ? toOpportunityPlanView(snapshot, now) : null)),
    undefined,
  );
  const below = Boolean(input.threshold && !input.threshold.met);
  const reportPromise = below
    ? Promise.resolve(belowThresholdSnapshotView())
    : deps.readSnapshot
    ? guard("opportunities_tab_snapshot_failed", deps.readSnapshot(actorId, language), unavailableSnapshotView())
    : Promise.resolve(unavailableSnapshotView());
  const dormantPromise = guard<DormantCandidate[] | null>("opportunities_tab_dormant_failed", deps.readDormant(actorId), null);
  // 依赖计划的读取：无计划或计划读取失败时不读候选与活动；只有还缺人的需求才读活动目录。
  const pendingPromise = planPromise.then((plan) =>
    plan && plan.needs.length > 0 && deps.readPending
      ? guard<PlanMatchCandidatesView | null>("opportunities_tab_pending_failed", deps.readPending(actorId), null)
      : plan ? { candidates: [], contactCount: 0, pendingByNeed: {} } : null);
  const bookablePromise = planPromise.then((plan) =>
    plan && plan.needs.some((need) => need.missing > 0)
      ? guard<readonly PublicBookableEvent[] | null>("opportunities_tab_events_failed", deps.readBookableEvents(actorId, now), null)
      : []);
  const gapNamesPromise = reportPromise.then((report) => {
    const ids = gapEvidenceIds(report);
    return ids.length > 0
      ? guard<Map<string, EvidenceContactName> | null>("opportunities_tab_evidence_failed", deps.readContactNames(actorId, ids), null)
      : new Map<string, EvidenceContactName>();
  });
  const goalPromise = Promise.resolve(input.goal).catch(() => null);

  const [plan, report, dormant, pending, bookable, gapNames, goal] = await Promise.all([
    planPromise, reportPromise, dormantPromise, pendingPromise, bookablePromise, gapNamesPromise, goalPromise,
  ]);
  const view = buildOpportunitiesTabView(
    { bookable, dormant, gapNames, goal, pending: pending ? { candidates: pending.candidates, contactCount: pending.contactCount } : null, plan, report },
    { language: input.language, now },
  );
  const gated: OpportunitiesTabView = { ...view, gate: analysisGate(input.threshold, report) };
  // W0051（W50-3 后半）：待唤醒的「为什么现在联系」在洞察 ready 时改读 nextStep；读失败保留规则拼句。
  // W0054：门槛未达时洞察文字不进页面数据（不读，保留规则拼句）。
  const rows = gated.dormant;
  if (below || !rows?.length || !deps.readInsights) return gated;
  const insights = await guard<Map<string, DormantInsight>>(
    "opportunities_tab_insights_failed",
    deps.readInsights(actorId, rows.map((row) => row.recordId ?? row.contactId), goal || plan?.goal || null, now),
    new Map(),
  );
  return { ...gated, dormant: applyDormantInsights(rows, insights, input.language) };
}
