/**
 * W0048a：快照与后台任务的 Postgres 仓储。
 *
 * - 写新快照在**同一事务**里：按人 advisory lock → 归档旧 current → 插入新版本 → 修剪到最近 12 版（W48-4）；
 *   worker 写入时带租约守卫（事务内锁住 job 行并核对 lease_owner），丢了租约的 worker 写不进去（R-2 ④）。
 * - 页面视图只取请求语言那一列 narrative_<lang> 与 evidence，**不取** included_contact_ids；
 *   依据里已删除（或不再属于本人）的联系人在读取时剔除。
 * - 判定所需的计数（已确认人数、快照纳入且仍在的人数、新增人数）一条语句在 SQL 里算出，不把 id 列表读回应用。
 */
import { randomUUID } from "node:crypto";

import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import {
  SNAPSHOT_RETAINED_VERSIONS,
  type NetworkAnalysisSnapshot,
  type SnapshotBlock,
  type SnapshotBlockKind,
  type SnapshotEvidence,
  type SnapshotLanguage,
  type SnapshotOrigin,
  type SnapshotTrigger,
} from "./contract";

type Row = Record<string, unknown>;

/** 本人已确认联系人（与计划输入 PLAN_INPUT_CONTACTS_SQL、引导进度同一归属口径）。$1 workspace，$2 actor。 */
export function confirmedContactPredicate(alias: string): string {
  return `${alias}.workspace_id = $1
    and ${alias}.collection_name = 'contacts'
    and ${alias}.lifecycle_state <> 'deleted'
    and ${alias}.user_id = $2
    and (${alias}.payload->'accountId' is null or ${alias}.payload->'accountId' = 'null'::jsonb or ${alias}.payload->'accountId' = to_jsonb($2::text))
    and jsonb_typeof(${alias}.payload->'id') = 'string'
    and ${alias}.payload->>'lifecycleInitialization' is distinct from 'pending'
    and coalesce(trim(${alias}.payload->>'displayName'), '') <> ''`;
}

export const SNAPSHOT_REFRESH_STATE_SQL = `/* network-snapshot:refresh-state */
  with confirmed as materialized (
    select c.record_id from orbit_records c where ${confirmedContactPredicate("c")}
  ), snap as (
    select id, source_data_version, goal_digest, contact_count, included_contact_ids
    from network_analysis_snapshots
    where workspace_id = $1 and actor_id = $2 and status = 'current'
  ), job as (
    select status, not_before, lease_expires_at from network_analysis_jobs
    where workspace_id = $1 and actor_id = $2 and kind = 'snapshot'
  )
  select
    (select count(*) from confirmed)::int as confirmed_count,
    snap.id as snapshot_id, snap.source_data_version, snap.goal_digest, snap.contact_count,
    (select count(*) from confirmed where snap.id is not null and confirmed.record_id = any(snap.included_contact_ids))::int as retained_count,
    (select count(*) from confirmed where snap.id is not null and not (confirmed.record_id = any(snap.included_contact_ids)))::int as new_count,
    job.status as job_status, job.not_before as job_not_before
  from (select 1) one
  left join snap on true
  left join job on true`;

function viewSql(language: SnapshotLanguage): string {
  const column = language === "en" ? "narrative_en" : "narrative_zh";
  return `/* network-snapshot:view:${language} */
  select s.generated_at, s.contact_count, s.${column} as narrative, s.evidence,
    array(
      select distinct ref.contact_id
      from jsonb_each(s.evidence) as e(block_key, value)
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.value->'contactIds') = 'array' then e.value->'contactIds' else '[]'::jsonb end) as ref(contact_id)
      where exists (select 1 from orbit_records c where c.record_id = ref.contact_id and ${confirmedContactPredicate("c")})
    ) as live_contact_ids
  from network_analysis_snapshots s
  where s.workspace_id = $1 and s.actor_id = $2 and s.status = 'current'`;
}

export interface SnapshotRefreshState {
  confirmedCount: number;
  snapshot: { id: string; sourceDataVersion: string; goalDigest: string; contactCount: number; retainedCount: number; newContactCount: number } | null;
  job: { status: "pending" | "running" | "deferred"; notBefore: string } | null;
}

export interface SnapshotViewRecord {
  generatedAt: string;
  contactCount: number;
  blocks: { key: string; kind: SnapshotBlockKind; text: string; evidence: SnapshotEvidence; needId?: string }[];
}

export interface NewSnapshotInput {
  actorId: string;
  origin: SnapshotOrigin;
  planId: string | null;
  trigger: SnapshotTrigger;
  sourceDataVersion: string;
  goalDigest: string;
  includedContactIds: readonly string[];
  blocks: readonly SnapshotBlock[];
  generator: NetworkAnalysisSnapshot["generator"];
  operationId: string | null;
  generatedAt: Date;
}

export interface SnapshotJob {
  actorId: string;
  kind: "snapshot" | "enrichment";
  status: "pending" | "running" | "deferred";
  trigger: string | null;
  notBefore: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  operationId: string | null;
  contactIds: string[];
  sourceKey: string | null;
  createdAt: string;
  /** job 创建时刻（微秒，数据库时钟）：自动预留幂等键的一部分。 */
  createdKey: string;
}

export interface NetworkAnalysisRepository {
  readRefreshState(actorId: string): Promise<SnapshotRefreshState>;
  readView(actorId: string, language: SnapshotLanguage): Promise<SnapshotViewRecord | null>;
  /** 需要双语的调用方（W0048b 计划流水线）读完整的 current 快照。 */
  getCurrent(actorId: string, options?: { languages?: readonly SnapshotLanguage[] }): Promise<NetworkAnalysisSnapshot | null>;
  /** 写新版本（同一事务归档 + 修剪）；leaseOwner 给出时先核对 job 租约，丢了租约返回 null。 */
  writeSnapshot(input: NewSnapshotInput, guard?: { leaseOwner: string }): Promise<NetworkAnalysisSnapshot | null>;
  /** 请求路径判定为自动时只 upsert 一行 pending job（不预留、不写 operation_id）；已有 job 不动。 */
  enqueueSnapshotJob(actorId: string, trigger: string, now: Date): Promise<void>;
  /** CAS 取得租约：pending／到期 deferred／租约过期的 running → running。 */
  claimJob(actorId: string, kind: SnapshotJob["kind"], owner: string, now: Date, leaseMs: number): Promise<SnapshotJob | null>;
  /** 维护任务：领取到期的 job（跳过别人锁住的行）。 */
  claimDueJobs(owner: string, now: Date, leaseMs: number, limit: number): Promise<SnapshotJob[]>;
  /** 在调用方事务里把 operation_id 写回 job（只在仍持有租约时）。 */
  setJobOperation(executor: TransactionalSqlExecutor, actorId: string, kind: SnapshotJob["kind"], owner: string, operationId: string | null): Promise<boolean>;
  deferJob(actorId: string, kind: SnapshotJob["kind"], owner: string, notBefore: string): Promise<void>;
  /** 回到 pending 待重试（attempt_count + 1，operation_id 清空）；超过上限删除。返回 true 表示已删除。 */
  releaseJob(actorId: string, kind: SnapshotJob["kind"], owner: string, maxAttempts: number): Promise<boolean>;
  deleteJob(actorId: string, kind: SnapshotJob["kind"], owner: string): Promise<void>;
  /** 补全顺延：并入 enrichment job（去重、上限 200），not_before = 次日 00:00 东京。 */
  deferEnrichment(actorId: string, contactIds: readonly string[], sourceKey: string, notBefore: string): Promise<void>;
  /** 维护任务消化顺延行后仍有剩余：只留剩余 id，改回 deferred 到 notBefore（只在仍持有租约时）。 */
  rescheduleEnrichment(actorId: string, owner: string, contactIds: readonly string[], notBefore: string): Promise<void>;
  /** 对象生命期内的事务入口（worker 预留 + 写回 operation_id 同一事务）。 */
  transaction<T>(operation: (executor: TransactionalSqlExecutor) => Promise<T>): Promise<T>;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value ?? fallback) as T;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jobFrom(row: Row): SnapshotJob {
  return {
    actorId: String(row.actor_id),
    attemptCount: Number(row.attempt_count ?? 0),
    contactIds: stringArray(row.contact_ids),
    createdAt: iso(row.created_at),
    createdKey: String(row.created_us ?? ""),
    kind: row.kind as SnapshotJob["kind"],
    leaseExpiresAt: row.lease_expires_at ? iso(row.lease_expires_at) : null,
    leaseOwner: typeof row.lease_owner === "string" ? row.lease_owner : null,
    notBefore: iso(row.not_before),
    operationId: typeof row.operation_id === "string" ? row.operation_id : null,
    sourceKey: typeof row.source_key === "string" ? row.source_key : null,
    status: row.status as SnapshotJob["status"],
    trigger: typeof row.trigger === "string" ? row.trigger : null,
  };
}

interface StoredNarrative {
  key: string;
  kind: SnapshotBlockKind;
  text: string;
  needId?: string;
}

function snapshotFrom(row: Row, languages: readonly SnapshotLanguage[]): NetworkAnalysisSnapshot {
  const zh = languages.includes("zh") ? json<StoredNarrative[]>(row.narrative_zh, []) : [];
  const en = languages.includes("en") ? json<StoredNarrative[]>(row.narrative_en, []) : [];
  const evidence = json<Record<string, SnapshotEvidence>>(row.evidence, {});
  const keys = (zh.length ? zh : en).map((block) => block.key);
  const byKey = (list: StoredNarrative[]) => new Map(list.map((block) => [block.key, block]));
  const zhByKey = byKey(zh);
  const enByKey = byKey(en);
  return {
    actorId: String(row.actor_id),
    blocks: keys.map((key) => {
      const base = zhByKey.get(key) ?? enByKey.get(key)!;
      return {
        evidence: evidence[key] ?? { contactIds: [], recordIds: [] },
        key,
        kind: base.kind,
        ...(base.needId ? { needId: base.needId } : {}),
        text: { en: enByKey.get(key)?.text ?? "", zh: zhByKey.get(key)?.text ?? "" },
      };
    }),
    contactCount: Number(row.contact_count ?? 0),
    generatedAt: iso(row.generated_at),
    generator: { model: String(row.model), promptVersion: String(row.prompt_version), provider: row.provider as "deepseek" | "mock" },
    goalDigest: String(row.goal_digest),
    id: String(row.id),
    includedContactIds: stringArray(row.included_contact_ids),
    origin: row.origin as SnapshotOrigin,
    planId: typeof row.plan_id === "string" ? row.plan_id : null,
    sourceDataVersion: String(row.source_data_version),
    trigger: row.trigger as SnapshotTrigger,
    version: Number(row.version),
  };
}

const JOB_COLUMNS = "actor_id, kind, status, trigger, not_before, lease_owner, lease_expires_at, attempt_count, operation_id, contact_ids, source_key, created_at, (extract(epoch from created_at) * 1000000)::bigint::text as created_us";

export function createPostgresNetworkAnalysisRepository(input: { client: TransactionalPostgresClient; workspaceId: string }): NetworkAnalysisRepository {
  const { client, workspaceId } = input;
  const transaction = <T>(operation: (executor: TransactionalSqlExecutor) => Promise<T>) =>
    client.transaction(operation, { isolation: "read committed" });

  return {
    transaction,
    async readRefreshState(actorId) {
      const row = (await client.query<Row>(SNAPSHOT_REFRESH_STATE_SQL, [workspaceId, actorId])).rows[0] ?? {};
      return {
        confirmedCount: Number(row.confirmed_count ?? 0),
        job: row.job_status ? { notBefore: iso(row.job_not_before), status: row.job_status as "pending" | "running" | "deferred" } : null,
        snapshot: row.snapshot_id
          ? {
              contactCount: Number(row.contact_count ?? 0),
              goalDigest: String(row.goal_digest),
              id: String(row.snapshot_id),
              newContactCount: Number(row.new_count ?? 0),
              retainedCount: Number(row.retained_count ?? 0),
              sourceDataVersion: String(row.source_data_version),
            }
          : null,
      };
    },
    async readView(actorId, language) {
      const row = (await client.query<Row>(viewSql(language), [workspaceId, actorId])).rows[0];
      if (!row) return null;
      const live = new Set(stringArray(row.live_contact_ids));
      const evidence = json<Record<string, SnapshotEvidence>>(row.evidence, {});
      const blocks = json<StoredNarrative[]>(row.narrative, []).flatMap((block) => {
        const stored = evidence[block.key] ?? { contactIds: [], recordIds: [] };
        const contactIds = stored.contactIds.filter((id) => live.has(id));
        const recordIds = stored.recordIds;
        // 依据剔空（只剩已删除的联系人）的块不返回。
        if (contactIds.length + recordIds.length === 0) return [];
        return [{ evidence: { contactIds, recordIds }, key: block.key, kind: block.kind, ...(block.needId ? { needId: block.needId } : {}), text: block.text }];
      });
      return { blocks, contactCount: Number(row.contact_count ?? 0), generatedAt: iso(row.generated_at) };
    },
    async getCurrent(actorId, options = {}) {
      const languages = options.languages?.length ? options.languages : (["zh", "en"] as const);
      const row = (await client.query<Row>(
        `/* network-snapshot:current */
        select id, actor_id, version, origin, plan_id, trigger, source_data_version, goal_digest, generated_at, contact_count,
          included_contact_ids, ${languages.includes("zh") ? "narrative_zh" : "'[]'::jsonb as narrative_zh"},
          ${languages.includes("en") ? "narrative_en" : "'[]'::jsonb as narrative_en"}, evidence, provider, model, prompt_version
        from network_analysis_snapshots where workspace_id = $1 and actor_id = $2 and status = 'current'`,
        [workspaceId, actorId],
      )).rows[0];
      return row ? snapshotFrom(row, languages) : null;
    },
    async writeSnapshot(snapshot, guard) {
      return transaction(async (tx) => {
        await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`network-snapshot:${workspaceId}:${snapshot.actorId}`]);
        if (guard) {
          const held = await tx.query<Row>(
            `select 1 from network_analysis_jobs
             where workspace_id = $1 and actor_id = $2 and kind = 'snapshot' and status = 'running' and lease_owner = $3
             for update`,
            [workspaceId, snapshot.actorId, guard.leaseOwner],
          );
          if (!held.rows[0]) return null;
        }
        const next = Number((await tx.query<Row>(
          `select coalesce(max(version), 0) + 1 as next from network_analysis_snapshots where workspace_id = $1 and actor_id = $2`,
          [workspaceId, snapshot.actorId],
        )).rows[0]?.next ?? 1);
        await tx.query(
          `update network_analysis_snapshots set status = 'superseded' where workspace_id = $1 and actor_id = $2 and status = 'current'`,
          [workspaceId, snapshot.actorId],
        );
        const narrative = (language: SnapshotLanguage) =>
          JSON.stringify(snapshot.blocks.map((block) => ({ key: block.key, kind: block.kind, ...(block.needId ? { needId: block.needId } : {}), text: block.text[language] })));
        const evidence = JSON.stringify(Object.fromEntries(snapshot.blocks.map((block) => [block.key, block.evidence])));
        const id = `nas_${randomUUID()}`;
        const inserted = (await tx.query<Row>(
          `insert into network_analysis_snapshots (
             workspace_id, id, actor_id, version, status, origin, plan_id, trigger, source_data_version, goal_digest,
             included_contact_ids, contact_count, narrative_zh, narrative_en, evidence, provider, model, prompt_version, operation_id, generated_at)
           values ($1, $2, $3, $4, 'current', $5, $6, $7, $8, $9, $10::text[], cardinality($10::text[]), $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18::timestamptz)
           returning version`,
          [
            workspaceId, id, snapshot.actorId, next, snapshot.origin, snapshot.planId, snapshot.trigger, snapshot.sourceDataVersion,
            snapshot.goalDigest, [...new Set(snapshot.includedContactIds)], narrative("zh"), narrative("en"), evidence,
            snapshot.generator.provider, snapshot.generator.model, snapshot.generator.promptVersion, snapshot.operationId,
            snapshot.generatedAt.toISOString(),
          ],
        )).rows[0]!;
        await tx.query(
          `delete from network_analysis_snapshots where workspace_id = $1 and actor_id = $2 and version <= $3`,
          [workspaceId, snapshot.actorId, next - SNAPSHOT_RETAINED_VERSIONS],
        );
        // 只回读版本号（不把刚写入的叙述与 id 列表再读回来）。
        const includedContactIds = [...new Set(snapshot.includedContactIds)];
        return {
          actorId: snapshot.actorId,
          blocks: snapshot.blocks.map((block) => ({ ...block, evidence: { ...block.evidence }, text: { ...block.text } })),
          contactCount: includedContactIds.length,
          generatedAt: snapshot.generatedAt.toISOString(),
          generator: { ...snapshot.generator },
          goalDigest: snapshot.goalDigest,
          id,
          includedContactIds,
          origin: snapshot.origin,
          planId: snapshot.planId,
          sourceDataVersion: snapshot.sourceDataVersion,
          trigger: snapshot.trigger,
          version: Number(inserted.version),
        };
      });
    },
    async enqueueSnapshotJob(actorId, trigger, now) {
      await client.query(
        `/* network-snapshot:job:enqueue */
        insert into network_analysis_jobs (workspace_id, actor_id, kind, status, trigger, not_before, created_at, updated_at)
        values ($1, $2, 'snapshot', 'pending', $3, $4::timestamptz, clock_timestamp(), clock_timestamp())
        on conflict (workspace_id, actor_id, kind) do nothing`,
        [workspaceId, actorId, trigger, now.toISOString()],
      );
    },
    async claimJob(actorId, kind, owner, now, leaseMs) {
      const row = (await client.query<Row>(
        `/* network-snapshot:job:claim */
        update network_analysis_jobs
        set status = 'running', lease_owner = $4, lease_expires_at = $5::timestamptz + make_interval(secs => $6::double precision / 1000), updated_at = $5::timestamptz
        where workspace_id = $1 and actor_id = $2 and kind = $3
          and ((status in ('pending', 'deferred') and not_before <= $5::timestamptz) or (status = 'running' and lease_expires_at <= $5::timestamptz))
        returning ${JOB_COLUMNS}`,
        [workspaceId, actorId, kind, owner, now.toISOString(), leaseMs],
      )).rows[0];
      return row ? jobFrom(row) : null;
    },
    async claimDueJobs(owner, now, leaseMs, limit) {
      const rows = (await client.query<Row>(
        `/* network-snapshot:job:claim-due */
        update network_analysis_jobs j
        set status = 'running', lease_owner = $2, lease_expires_at = $3::timestamptz + make_interval(secs => $4::double precision / 1000), updated_at = $3::timestamptz
        from (
          select actor_id, kind from network_analysis_jobs
          where workspace_id = $1
            and ((status in ('pending', 'deferred') and not_before <= $3::timestamptz) or (status = 'running' and lease_expires_at <= $3::timestamptz))
          order by not_before, actor_id, kind
          limit $5
          for update skip locked
        ) due
        where j.workspace_id = $1 and j.actor_id = due.actor_id and j.kind = due.kind
        returning ${JOB_COLUMNS.split(", ").map((column) => (column.includes("(") ? column.replace("created_at", "j.created_at") : `j.${column}`)).join(", ")}`,
        [workspaceId, owner, now.toISOString(), leaseMs, limit],
      )).rows;
      return rows.map(jobFrom);
    },
    async setJobOperation(executor, actorId, kind, owner, operationId) {
      const rows = (await executor.query<Row>(
        `update network_analysis_jobs set operation_id = $5, updated_at = now()
         where workspace_id = $1 and actor_id = $2 and kind = $3 and status = 'running' and lease_owner = $4
         returning actor_id`,
        [workspaceId, actorId, kind, owner, operationId],
      )).rows;
      return rows.length > 0;
    },
    async deferJob(actorId, kind, owner, notBefore) {
      await client.query(
        `update network_analysis_jobs
         set status = 'deferred', not_before = $5::timestamptz, lease_owner = null, lease_expires_at = null, operation_id = null, updated_at = now()
         where workspace_id = $1 and actor_id = $2 and kind = $3 and lease_owner = $4`,
        [workspaceId, actorId, kind, owner, notBefore],
      );
    },
    async releaseJob(actorId, kind, owner, maxAttempts) {
      const row = (await client.query<Row>(
        `update network_analysis_jobs
         set status = 'pending', lease_owner = null, lease_expires_at = null, operation_id = null,
           attempt_count = attempt_count + 1, updated_at = now()
         where workspace_id = $1 and actor_id = $2 and kind = $3 and lease_owner = $4
         returning attempt_count`,
        [workspaceId, actorId, kind, owner],
      )).rows[0];
      if (row && Number(row.attempt_count) >= maxAttempts) {
        await client.query(
          `delete from network_analysis_jobs where workspace_id = $1 and actor_id = $2 and kind = $3 and status = 'pending' and lease_owner is null`,
          [workspaceId, actorId, kind],
        );
        return true;
      }
      return false;
    },
    async deleteJob(actorId, kind, owner) {
      await client.query(
        `delete from network_analysis_jobs where workspace_id = $1 and actor_id = $2 and kind = $3 and lease_owner = $4`,
        [workspaceId, actorId, kind, owner],
      );
    },
    async rescheduleEnrichment(actorId, owner, contactIds, notBefore) {
      await client.query(
        `update network_analysis_jobs
         set status = 'deferred', not_before = $5::timestamptz, contact_ids = $4::text[], lease_owner = null, lease_expires_at = null,
           operation_id = null, updated_at = now()
         where workspace_id = $1 and actor_id = $2 and kind = 'enrichment' and lease_owner = $3`,
        [workspaceId, actorId, owner, [...new Set(contactIds)].slice(0, 200), notBefore],
      );
    },
    async deferEnrichment(actorId, contactIds, sourceKey, notBefore) {
      await client.query(
        `/* network-snapshot:job:defer-enrichment */
        insert into network_analysis_jobs (workspace_id, actor_id, kind, status, trigger, not_before, contact_ids, source_key)
        values ($1, $2, 'enrichment', 'deferred', 'auto', $3::timestamptz, (select coalesce(array_agg(distinct c order by c), '{}') from unnest($4::text[]) c), $5)
        on conflict (workspace_id, actor_id, kind) do update set
          contact_ids = (
            select coalesce(array_agg(c order by c), '{}') from (
              select distinct c from unnest(network_analysis_jobs.contact_ids || excluded.contact_ids) c order by c limit 200
            ) merged
          ),
          not_before = greatest(network_analysis_jobs.not_before, excluded.not_before),
          source_key = excluded.source_key,
          updated_at = now()`,
        [workspaceId, actorId, notBefore, contactIds.slice(0, 200), sourceKey],
      );
    },
  };
}
