/**
 * W0052（RN-10）：人脉概览（`/app/contacts/dashboard` 无 tab）的服务端附加读取。只有概览读，示例期不读。
 *
 * 读取边界（R-6、D46③，与 W0050 机会标签同一口径）：
 * - 计划只经 `PlanService.getCurrent()`（只读事务）+ W0050 纯投影 `toOpportunityPlanView`；不调 getCurrentView／enterCurrentPhase；
 * - 快照经 W0048a `readView(…, { enqueue: false })`：打开概览不排队、不生成；
 * - 待确认匹配只读（`listPending`，只在计划有人脉需求时读，W0050 口径）；
 * - 时间线最近 5 条 = W0046 `readRecentRelationshipTimelineForActor`；重点联系人 = W0047 档位看板每列前 2 位；
 * - 依据、动态、重点联系人的姓名合并成一次只读语句（W0049 `readEvidenceContactNames`）。
 * 整个加载 0 次 INSERT／UPDATE／DELETE、计划生成器 0 次解析、付费 AI 0 次。各部分失败互不影响：失败的那块按「读不到」处理，其余照常。
 */
import type { NetworkSnapshotView, SnapshotLanguage } from "../../../../../features/network-analysis/contract";
import { readEvidenceContactNames, type EvidenceContactName } from "../../../../../features/network-analysis/evidence-contacts";
import { getConfiguredNetworkAnalysisRuntime, readCurrentPlanForSnapshot } from "../../../../../features/network-analysis/runtime";
import { unavailableSnapshotView } from "../../../../../features/network-analysis/service";
import type { PlanSnapshot } from "../../../../../features/plans/contract";
import { toOpportunityPlanView } from "../../../../../features/plans/coverage";
import { getConfiguredPlanMatchingRuntime } from "../../../../../features/plans/matching-runtime";
import type { PlanMatchCandidatesView } from "../../../../../features/plans/matching-service";
import { readRelationshipTierBoard, type RelationshipTierBoard } from "../../../../../features/relationship-strength/read-model";
import { readRecentRelationshipTimelineForActor } from "../../../../../features/relationship-timeline/reader";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { RelationshipTimelineResult } from "../../../../../shared/contract/relationship-timeline";
import {
  OVERVIEW_ACTIVITY_LIMIT,
  OVERVIEW_HIGHLIGHT_LIMIT,
  overviewNameIds,
  type OverviewCockpitParts,
  type OverviewTierBoardColumns,
} from "../network-0918/network-overview-cockpit-model";

export interface OverviewCockpitLoaderDeps {
  readPlan: (actorId: string) => Promise<PlanSnapshot | null>;
  /** 只读快照视图；null = 快照服务不可用。 */
  readSnapshot: ((actorId: string, language: SnapshotLanguage) => Promise<NetworkSnapshotView>) | null;
  /** null = 匹配服务不可用。 */
  readPending: ((actorId: string) => Promise<PlanMatchCandidatesView>) | null;
  readTimeline: (actorId: string, now: Date) => Promise<RelationshipTimelineResult>;
  readBoard: (actorId: string) => Promise<Pick<RelationshipTierBoard, "columns">>;
  readContactNames: (actorId: string, recordIds: readonly string[]) => Promise<Map<string, EvidenceContactName>>;
}

export function defaultOverviewCockpitLoaderDeps(): OverviewCockpitLoaderDeps {
  const runtime = getConfiguredNetworkAnalysisRuntime();
  const matching = getConfiguredPlanMatchingRuntime();
  return {
    readBoard: (actorId) => readRelationshipTierBoard({ actorId, perColumn: OVERVIEW_HIGHLIGHT_LIMIT }),
    readContactNames: runtime
      ? (actorId, ids) => readEvidenceContactNames({ client: runtime.client, workspaceId: runtime.workspaceId }, actorId, ids)
      : async () => { throw new Error("Contact names are unavailable"); },
    readPending: matching ? (actorId) => matching.service.listPending({ actorId }) : null,
    readPlan: (actorId) => readCurrentPlanForSnapshot(actorId),
    readSnapshot: runtime ? (actorId, language) => runtime.service.readView(actorId, language, { enqueue: false }) : null,
    readTimeline: (actorId, now) => readRecentRelationshipTimelineForActor({ actorId, limit: OVERVIEW_ACTIVITY_LIMIT, now }),
  };
}

function log(event: string, actorId: string, error: unknown) {
  console.error(JSON.stringify({ actorId, error: error instanceof Error ? error.name : "unknown", event }));
}

/** 概览附加数据（不含分析与名单——它们由页面已有的并行读取给出）。 */
export async function loadOverviewCockpit(
  input: { actorId: string; language: OrbitLanguage; now: Date },
  deps: OverviewCockpitLoaderDeps = defaultOverviewCockpitLoaderDeps(),
): Promise<Omit<OverviewCockpitParts, "sourceFacets">> {
  const { actorId, now } = input;
  const language: SnapshotLanguage = input.language === "zh" ? "zh" : "en";
  const guard = <T>(event: string, run: () => Promise<T>, fallback: T): Promise<T> =>
    Promise.resolve().then(run).catch((error: unknown) => { log(event, actorId, error); return fallback; });

  const planPromise = guard(
    "overview_cockpit_plan_failed",
    async () => { const snapshot = await deps.readPlan(actorId); return snapshot ? toOpportunityPlanView(snapshot, now) : null; },
    undefined,
  );
  const snapshotPromise: Promise<NetworkSnapshotView> = deps.readSnapshot
    ? guard("overview_cockpit_snapshot_failed", () => deps.readSnapshot!(actorId, language), unavailableSnapshotView())
    : Promise.resolve(unavailableSnapshotView());
  const timelinePromise = guard<OverviewCockpitParts["timeline"]>(
    "overview_cockpit_timeline_failed",
    async () => {
      const result = await deps.readTimeline(actorId, now);
      return { items: result.items.slice(0, OVERVIEW_ACTIVITY_LIMIT), unavailable: result.unavailableSources.length > 0 };
    },
    null,
  );
  const boardPromise = guard<OverviewTierBoardColumns | null>(
    "overview_cockpit_board_failed",
    async () => {
      const board = await deps.readBoard(actorId);
      return { active: board.columns.active.slice(0, OVERVIEW_HIGHLIGHT_LIMIT), core: board.columns.core.slice(0, OVERVIEW_HIGHLIGHT_LIMIT) };
    },
    null,
  );
  // 依赖计划的读取：无计划、计划读取失败或计划没有人脉需求时不读候选（W0050 口径）。
  const pendingPromise = planPromise.then((plan): Promise<number | null> | number | null =>
    plan === undefined ? null
      : plan && plan.needs.length > 0
        ? deps.readPending
          ? guard("overview_cockpit_pending_failed", async () => (await deps.readPending!(actorId)).contactCount, null)
          : null
        : 0);

  const [plan, snapshot, timeline, board] = await Promise.all([planPromise, snapshotPromise, timelinePromise, boardPromise]);
  const ids = overviewNameIds({ board, plan, snapshot, timeline });
  const namesPromise = ids.length > 0
    ? guard<Map<string, EvidenceContactName> | null>("overview_cockpit_names_failed", () => deps.readContactNames(actorId, ids), null)
    : Promise.resolve(new Map<string, EvidenceContactName>());
  const [pendingMatches, names] = await Promise.all([pendingPromise, namesPromise]);
  return { board, names, pendingMatches, plan, snapshot, timeline };
}
