/**
 * W0048a：快照的 sourceDataVersion（按来源分别定义版本算法，R-5）。
 *
 *   sha256(JSON.stringify(["network.snapshot@2", promptVersion,
 *     contactsAnalysisGraphSourceDataVersion(graphVersion, profileSection),
 *     planNeedVersion, strengthVersion, [timelineVersion, planLogVersion]]))
 *
 * | 组成 | 来源 | 算法 |
 * | graphVersion | orbit_records 六集合（DASHBOARD_GRAPH_VERSION_COLLECTIONS） | 复用 readDashboardGraphState：count:sum:max(sync_revision)；
 *   本库没有 sync_revision 时退回 count:sum(epoch updated_at):max(updated_at)（与 W0047 来源戳同一退路） |
 * | timelineVersion | orbit_records 的 notes／human_encounters／personal_schedule_items（W0046 时间线来源、不在六集合内） | 同上 |
 * | planLogVersion | plan_log（没有 sync_revision） | count(*):sum(seq):max(seq) |
 * | planNeedVersion | plans／plan_items | 生效计划 id:version + network_need 条目 count、max(updated_at)、sum(epoch updated_at)；无生效计划 "none" |
 * | strengthVersion | W0047 relationship_strengths | W0047 的 sourceStamp + rulesVersion |
 *
 * 全部只读；不改 DASHBOARD_GRAPH_VERSION_COLLECTIONS；计划只经直接只读 SQL，不经 PlanService.getCurrentView（R-6）。
 */
import { createHash } from "node:crypto";

import { readDashboardGraphState, DASHBOARD_GRAPH_VERSION_COLLECTIONS } from "../dashboard/storage/dashboard-snapshot";
import { contactsAnalysisGraphSourceDataVersion } from "../mobile/contacts-analysis-report-provider";
import {
  relationshipStrengthStampFrom,
  relationshipStrengthStampSql,
  type RelationshipStrengthStampMode,
} from "../relationship-strength/read-model";
import { RELATIONSHIP_STRENGTH_RULES } from "../relationship-strength/rules";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

export const SNAPSHOT_TIMELINE_VERSION_COLLECTIONS = ["notes", "human_encounters", "personal_schedule_items"] as const;

export interface SnapshotSourceParts {
  graphVersion: string;
  timelineVersion: string;
  planLogVersion: string;
  planNeedVersion: string;
  strengthVersion: string;
}

export interface SnapshotSourceVersion {
  sourceDataVersion: string;
  goalDigest: string;
  parts: SnapshotSourceParts;
}

type Row = Record<string, unknown>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function snapshotGoalDigest(goal: string | null | undefined): string {
  return sha256((goal ?? "").trim());
}

export function composeSnapshotSourceDataVersion(input: { promptVersion: string; parts: SnapshotSourceParts; profileSection: unknown }): string {
  return sha256(JSON.stringify([
    "network.snapshot@2",
    input.promptVersion,
    contactsAnalysisGraphSourceDataVersion(input.parts.graphVersion, input.profileSection),
    input.parts.planNeedVersion,
    input.parts.strengthVersion,
    [input.parts.timelineVersion, input.parts.planLogVersion],
  ]));
}

const literalList = (names: readonly string[]) => names.map((name) => `'${name}'`).join(", ");

function recordsVersionSql(mode: RelationshipStrengthStampMode, names: readonly string[]): string {
  return mode === "revision"
    ? `select count(*)::text || ':' || coalesce(sum(sync_revision), 0)::text || ':' || coalesce(max(sync_revision), 0)::text
      from orbit_records where workspace_id = $1 and user_id = $2 and collection_name in (${literalList(names)})`
    : `select 'ts:' || count(*)::text || ':' || coalesce(sum(extract(epoch from updated_at)), 0)::text || ':' || coalesce(max(updated_at)::text, '')
      from orbit_records where workspace_id = $1 and user_id = $2 and collection_name in (${literalList(names)})`;
}

/** 一条语句：时间线三集合 + plan_log + 生效计划的人脉需求。 */
export function snapshotTimelinePlanVersionSql(mode: RelationshipStrengthStampMode): string {
  return `/* network-snapshot:version:timeline-plan:${mode} */
  select
    (${recordsVersionSql(mode, SNAPSHOT_TIMELINE_VERSION_COLLECTIONS)}) as timeline_version,
    (select count(*)::text || ':' || coalesce(sum(seq), 0)::text || ':' || coalesce(max(seq), 0)::text
       from plan_log where workspace_id = $1 and actor_id = $2) as plan_log_version,
    coalesce((
      select p.id || ':' || p.version::text || ':' || count(i.id)::text || ':' || coalesce(max(i.updated_at)::text, '') || ':' || coalesce(sum(extract(epoch from i.updated_at)), 0)::text
      from plans p
      left join plan_items i on i.workspace_id = p.workspace_id and i.actor_id = p.actor_id and i.plan_id = p.id and i.kind = 'network_need'
      where p.workspace_id = $1 and p.actor_id = $2 and p.status = 'active'
      group by p.id, p.version
      limit 1
    ), 'none') as plan_need_version`;
}

const GRAPH_TIMESTAMP_SQL = `/* network-snapshot:version:graph:timestamp */
  select (${recordsVersionSql("timestamp", DASHBOARD_GRAPH_VERSION_COLLECTIONS)}) as graph_version`;

function isUndefinedColumn(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42703";
}

export interface SnapshotSourceVersionReader {
  read(input: { actorId: string; goal: string | null; profileSection: unknown; promptVersion: string }): Promise<SnapshotSourceVersion>;
}

/** 本库是否有 sync_revision 由能力检测决定（进程内记住），与 W0047 来源戳同一退路。 */
export function createSnapshotSourceVersionReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  /** 测试覆盖点：强度规则版本（默认 W0047 当前规则表）。 */
  strengthRulesVersion?: () => string;
}): SnapshotSourceVersionReader {
  const { client, workspaceId } = input;
  const rulesVersion = input.strengthRulesVersion ?? (() => RELATIONSHIP_STRENGTH_RULES.version);
  let mode: RelationshipStrengthStampMode = "revision";

  async function withMode<T>(run: (current: RelationshipStrengthStampMode) => Promise<T>): Promise<T> {
    try {
      return await run(mode);
    } catch (error) {
      if (mode !== "revision" || !isUndefinedColumn(error)) throw error;
      mode = "timestamp";
      return run(mode);
    }
  }

  return {
    async read({ actorId, goal, profileSection, promptVersion }) {
      const graphState = await readDashboardGraphState(client, workspaceId, actorId);
      const graphVersion = graphState
        ? graphState.graphVersion
        : String((await client.query<Row>(GRAPH_TIMESTAMP_SQL, [workspaceId, actorId])).rows[0]?.graph_version ?? "ts:0");
      if (!graphState) mode = "timestamp";
      const row = await withMode(async (current) => (await client.query<Row>(snapshotTimelinePlanVersionSql(current), [workspaceId, actorId])).rows[0]);
      const strengthRow = await withMode(async (current) => ({
        current,
        row: (await client.query<Row>(relationshipStrengthStampSql(current), [workspaceId, actorId, `relationship-strength-state:${actorId}`])).rows[0],
      }));
      const parts: SnapshotSourceParts = {
        graphVersion,
        planLogVersion: String(row?.plan_log_version ?? "0:0:0"),
        planNeedVersion: String(row?.plan_need_version ?? "none"),
        strengthVersion: `${relationshipStrengthStampFrom(strengthRow.current, strengthRow.row)}@${rulesVersion()}`,
        timelineVersion: String(row?.timeline_version ?? "0"),
      };
      return {
        goalDigest: snapshotGoalDigest(goal),
        parts,
        sourceDataVersion: composeSnapshotSourceDataVersion({ parts, profileSection, promptVersion }),
      };
    },
  };
}
