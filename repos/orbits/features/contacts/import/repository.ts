/**
 * W0053：导入批次与解析行的 SQL（全部按 workspace + actor 隔离；别人的批次一律查不到）。
 * 表由 `migrations.ts` 创建。读取只取界面需要的列；核对表分页 50 行。
 */
import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import type { ContactCandidate } from "../business-card-contact-match";
import type { ContactImportDecision, ReviewedRow } from "./dedupe";
import { CONTACT_IMPORT_PAGE_SIZE } from "./limits";
import type { ContactImportFields, ContactImportFormat, ContactImportKind, ContactImportMapping, ContactImportParseIssue } from "./types";

type Row = Record<string, unknown>;

export type ContactImportBatchStatus = "parsed" | "reviewing" | "committing" | "completed" | "cancelled" | "expired" | "failed";
export type ContactImportRowStatus = "pending" | "created" | "merged" | "skipped" | "failed";
export type ContactImportLayersStatus = "none" | "pending" | "retry" | "done";

export interface ContactImportCounts {
  created: number;
  merged: number;
  skipped: number;
  failed: number;
}

export interface ContactImportBatchRecord {
  id: string;
  actorId: string;
  kind: ContactImportKind;
  format: ContactImportFormat;
  status: ContactImportBatchStatus;
  fileName: string;
  sourceEventId: string | null;
  encoding: string | null;
  rowCount: number;
  headers: string[];
  mapping: ContactImportMapping | null;
  idempotencyKey: string;
  version: number;
  counts: ContactImportCounts;
  commitIntentId: string | null;
  commitFingerprint: string | null;
  nextChunk: number;
  layersStatus: ContactImportLayersStatus;
  layersPending: number[];
  layersLastError: string | null;
  enrichmentDeferredUntil: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string;
  rowsPurgedAt: string | null;
  /** status = failed 时的原因（例如中断后过期无法续写：interrupted_expired）。 */
  failureReason: string | null;
}

export interface ContactImportRowRecord {
  seq: number;
  fields: ContactImportFields;
  cells: string[] | null;
  issues: ContactImportParseIssue[];
  inFileDuplicateOf: number | null;
  candidate: ContactCandidate | null;
  decision: ContactImportDecision | null;
  mergeIntoContactId: string | null;
  status: ContactImportRowStatus;
  contactId: string | null;
}

export type ContactImportRowFilter = "all" | "new" | "duplicates" | "issues";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

const BATCH_COLUMNS = `id, actor_id, kind, format, status, file_name, source_event_id, encoding, row_count, headers, mapping, idempotency_key,
  version, counts, commit_intent_id, commit_fingerprint, next_chunk, layers_status, layers_pending, layers_last_error,
  enrichment_deferred_until, created_at, updated_at, completed_at, expires_at, rows_purged_at, failure_reason`;

function mapBatch(row: Row): ContactImportBatchRecord {
  const counts = json<Partial<ContactImportCounts>>(row.counts, {});
  return {
    actorId: String(row.actor_id),
    commitFingerprint: (row.commit_fingerprint as string | null) ?? null,
    commitIntentId: (row.commit_intent_id as string | null) ?? null,
    completedAt: isoOrNull(row.completed_at),
    counts: { created: Number(counts.created ?? 0), failed: Number(counts.failed ?? 0), merged: Number(counts.merged ?? 0), skipped: Number(counts.skipped ?? 0) },
    createdAt: iso(row.created_at),
    encoding: (row.encoding as string | null) ?? null,
    enrichmentDeferredUntil: isoOrNull(row.enrichment_deferred_until),
    expiresAt: iso(row.expires_at),
    failureReason: (row.failure_reason as string | null) ?? null,
    fileName: String(row.file_name ?? ""),
    format: row.format as ContactImportFormat,
    headers: json<string[]>(row.headers, []),
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    kind: row.kind as ContactImportKind,
    layersLastError: (row.layers_last_error as string | null) ?? null,
    layersPending: ((row.layers_pending as unknown[] | null) ?? []).map(Number),
    layersStatus: row.layers_status as ContactImportLayersStatus,
    mapping: json<ContactImportMapping | null>(row.mapping, null),
    nextChunk: Number(row.next_chunk ?? 0),
    rowCount: Number(row.row_count),
    rowsPurgedAt: isoOrNull(row.rows_purged_at),
    sourceEventId: (row.source_event_id as string | null) ?? null,
    status: row.status as ContactImportBatchStatus,
    updatedAt: iso(row.updated_at),
    version: Number(row.version),
  };
}

function mapRow(row: Row): ContactImportRowRecord {
  return {
    candidate: json<ContactCandidate | null>(row.candidate, null),
    cells: json<string[] | null>(row.cells, null),
    contactId: (row.contact_id as string | null) ?? null,
    decision: (row.decision as ContactImportDecision | null) ?? null,
    fields: json<ContactImportFields>(row.fields, {} as ContactImportFields),
    inFileDuplicateOf: row.in_file_duplicate_of === null || row.in_file_duplicate_of === undefined ? null : Number(row.in_file_duplicate_of),
    issues: ((row.parse_issues as string[] | null) ?? []) as ContactImportParseIssue[],
    mergeIntoContactId: (row.merge_into_contact_id as string | null) ?? null,
    seq: Number(row.seq),
    status: row.status as ContactImportRowStatus,
  };
}

export interface InsertBatchInput {
  id: string;
  actorId: string;
  kind: ContactImportKind;
  format: ContactImportFormat;
  status: ContactImportBatchStatus;
  fileName: string;
  sourceEventId?: string | null;
  encoding?: string | null;
  headers: readonly string[];
  mapping: ContactImportMapping | null;
  idempotencyKey: string;
  now: Date;
  expiresAt: Date;
  rows: readonly (ReviewedRow & { cells: readonly string[] | null; contactId?: string | null })[];
}

function reviewedRowsJson(rows: InsertBatchInput["rows"]): string {
  return JSON.stringify(rows.map((row) => ({
    candidate: row.candidate,
    cells: row.cells,
    contact_id: row.contactId ?? null,
    decision: row.decision,
    fields: row.fields,
    in_file_duplicate_of: row.inFileDuplicateOf,
    merge_into_contact_id: row.mergeIntoContactId,
    parse_issues: row.issues,
    seq: row.seq,
  })));
}

export function createContactImportRepository(input: { workspaceId: string }) {
  const { workspaceId } = input;
  return {
    /** 插入批次与全部解析行（一条语句写行）；同一幂等键已存在时什么也不写，返回 null。 */
    async insertBatch(tx: TransactionalSqlExecutor, batch: InsertBatchInput): Promise<ContactImportBatchRecord | null> {
      const inserted = await tx.query<Row>(
        `/* contact-import:insert-batch */
         insert into contact_import_batches
           (workspace_id, id, actor_id, kind, format, status, file_name, source_event_id, encoding, row_count, headers, mapping,
            idempotency_key, created_at, updated_at, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $14, $15)
         on conflict (workspace_id, actor_id, idempotency_key) do nothing
         returning ${BATCH_COLUMNS}`,
        [workspaceId, batch.id, batch.actorId, batch.kind, batch.format, batch.status, batch.fileName.slice(0, 300), batch.sourceEventId ?? null,
          batch.encoding ?? null, batch.rows.length, JSON.stringify(batch.headers), batch.mapping ? JSON.stringify(batch.mapping) : null,
          batch.idempotencyKey, batch.now.toISOString(), batch.expiresAt.toISOString()],
      );
      if (!inserted.rows[0]) return null;
      if (batch.rows.length) {
        await tx.query(
          `/* contact-import:insert-rows */
           insert into contact_import_rows
             (workspace_id, batch_id, seq, fields, cells, parse_issues, in_file_duplicate_of, candidate, decision, merge_into_contact_id, contact_id)
           select $1, $2, r.seq, r.fields, r.cells, array(select jsonb_array_elements_text(r.parse_issues)), r.in_file_duplicate_of,
                  r.candidate, r.decision, r.merge_into_contact_id, r.contact_id
           from jsonb_to_recordset($3::jsonb) as r(seq integer, fields jsonb, cells jsonb, parse_issues jsonb, in_file_duplicate_of integer,
                                                   candidate jsonb, decision text, merge_into_contact_id text, contact_id text)`,
          [workspaceId, batch.id, reviewedRowsJson(batch.rows)],
        );
      }
      return mapBatch(inserted.rows[0]);
    },

    async getBatch(executor: TransactionalSqlExecutor, actorId: string, batchId: string, options: { lock?: boolean } = {}): Promise<ContactImportBatchRecord | null> {
      const result = await executor.query<Row>(
        `/* contact-import:get-batch */
         select ${BATCH_COLUMNS} from contact_import_batches
         where workspace_id = $1 and actor_id = $2 and id = $3${options.lock ? " for update" : ""}`,
        [workspaceId, actorId, batchId],
      );
      return result.rows[0] ? mapBatch(result.rows[0]) : null;
    },

    async getBatchByKey(executor: TransactionalSqlExecutor, actorId: string, idempotencyKey: string): Promise<ContactImportBatchRecord | null> {
      const result = await executor.query<Row>(
        `/* contact-import:get-batch-by-key */
         select ${BATCH_COLUMNS} from contact_import_batches
         where workspace_id = $1 and actor_id = $2 and idempotency_key = $3`,
        [workspaceId, actorId, idempotencyKey],
      );
      return result.rows[0] ? mapBatch(result.rows[0]) : null;
    },

    async listBatches(executor: TransactionalSqlExecutor, actorId: string, limit = 20): Promise<ContactImportBatchRecord[]> {
      const result = await executor.query<Row>(
        `/* contact-import:list-batches */
         select ${BATCH_COLUMNS} from contact_import_batches
         where workspace_id = $1 and actor_id = $2
         order by created_at desc, id desc limit $3`,
        [workspaceId, actorId, limit],
      );
      return result.rows.map(mapBatch);
    },

    async listRows(
      executor: TransactionalSqlExecutor,
      batchId: string,
      options: { afterSeq?: number; limit?: number; filter?: ContactImportRowFilter } = {},
    ): Promise<ContactImportRowRecord[]> {
      const filter = options.filter ?? "all";
      const where =
        filter === "new" ? "and candidate is null and in_file_duplicate_of is null and cardinality(parse_issues) = 0"
          : filter === "duplicates" ? "and (candidate is not null or in_file_duplicate_of is not null)"
            : filter === "issues" ? "and cardinality(parse_issues) > 0"
              : "";
      const result = await executor.query<Row>(
        `/* contact-import:list-rows */
         select seq, fields, null::jsonb as cells, parse_issues, in_file_duplicate_of, candidate, decision, merge_into_contact_id, status, contact_id
         from contact_import_rows
         where workspace_id = $1 and batch_id = $2 and seq > $3 ${where}
         order by seq limit $4`,
        // 多取 1 行只用来判断还有没有下一页（调用方截掉）。
        [workspaceId, batchId, options.afterSeq ?? 0, Math.min(options.limit ?? CONTACT_IMPORT_PAGE_SIZE, CONTACT_IMPORT_PAGE_SIZE) + 1],
      );
      return result.rows.map(mapRow);
    },

    /** 改字段对应时重算用：全部行的单元格与问题。 */
    async readAllRows(executor: TransactionalSqlExecutor, batchId: string): Promise<ContactImportRowRecord[]> {
      const result = await executor.query<Row>(
        `/* contact-import:read-all-rows */
         select seq, fields, cells, parse_issues, in_file_duplicate_of, candidate, decision, merge_into_contact_id, status, contact_id
         from contact_import_rows where workspace_id = $1 and batch_id = $2 order by seq`,
        [workspaceId, batchId],
      );
      return result.rows.map(mapRow);
    },

    async replaceReview(tx: TransactionalSqlExecutor, batchId: string, rows: readonly ReviewedRow[]): Promise<void> {
      await tx.query(
        `/* contact-import:replace-review */
         update contact_import_rows t set
           fields = r.fields,
           parse_issues = array(select jsonb_array_elements_text(r.parse_issues)),
           in_file_duplicate_of = r.in_file_duplicate_of,
           candidate = r.candidate,
           decision = r.decision,
           merge_into_contact_id = r.merge_into_contact_id,
           version = t.version + 1
         from jsonb_to_recordset($3::jsonb) as r(seq integer, fields jsonb, parse_issues jsonb, in_file_duplicate_of integer,
                                                 candidate jsonb, decision text, merge_into_contact_id text)
         where t.workspace_id = $1 and t.batch_id = $2 and t.seq = r.seq and t.status = 'pending'`,
        [workspaceId, batchId, reviewedRowsJson(rows.map((row) => ({ ...row, cells: null })))],
      );
    },

    async updateBatchMapping(tx: TransactionalSqlExecutor, batchId: string, mapping: ContactImportMapping, now: Date): Promise<void> {
      await tx.query(
        `/* contact-import:update-mapping */
         update contact_import_batches set mapping = $3::jsonb, version = version + 1, updated_at = $4
         where workspace_id = $1 and id = $2`,
        [workspaceId, batchId, JSON.stringify(mapping), now.toISOString()],
      );
    },

    /** 改决定：只改待处理、非阻塞的行；合并目标必须是该行的候选。返回实际改了的行号。 */
    async setDecisions(
      tx: TransactionalSqlExecutor,
      batchId: string,
      decisions: readonly { seq: number; decision: ContactImportDecision }[],
      now: Date,
    ): Promise<number[]> {
      if (!decisions.length) return [];
      const result = await tx.query<{ seq: number }>(
        `/* contact-import:set-decisions */
         update contact_import_rows t set
           decision = d.decision,
           merge_into_contact_id = case when d.decision = 'merge' then t.candidate->>'contactId' else null end,
           version = t.version + 1
         from jsonb_to_recordset($3::jsonb) as d(seq integer, decision text)
         where t.workspace_id = $1 and t.batch_id = $2 and t.seq = d.seq and t.status = 'pending'
           and not (t.parse_issues && array['missing_name', 'decode_failed', 'malformed_row']::text[])
           and (d.decision <> 'merge' or t.candidate is not null)
         returning t.seq`,
        [workspaceId, batchId, JSON.stringify(decisions)],
      );
      await tx.query(
        `update contact_import_batches set version = version + 1, updated_at = $3 where workspace_id = $1 and id = $2`,
        [workspaceId, batchId, now.toISOString()],
      );
      return result.rows.map((row) => Number(row.seq)).sort((a, b) => a - b);
    },

    /** 核对摘要：各决定计数、未决、阻塞、文件内重复、候选；以及待确认的合并（行号 → 目标联系人）。 */
    async reviewSummary(executor: TransactionalSqlExecutor, batchId: string) {
      const counts = await executor.query<Row>(
        `/* contact-import:review-summary */
         select
           count(*) filter (where status = 'pending' and decision = 'create')::int as create_count,
           count(*) filter (where status = 'pending' and decision = 'merge')::int as merge_count,
           count(*) filter (where status = 'pending' and decision = 'skip')::int as skip_count,
           count(*) filter (where status = 'pending' and decision is null)::int as undecided_count,
           count(*) filter (where parse_issues && array['missing_name', 'decode_failed', 'malformed_row']::text[])::int as blocked_count,
           count(*) filter (where in_file_duplicate_of is not null)::int as in_file_count,
           count(*) filter (where candidate is not null)::int as candidate_count,
           count(*) filter (where cardinality(parse_issues) > 0)::int as issue_count,
           coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'contactId', merge_into_contact_id) order by seq)
             filter (where status = 'pending' and decision = 'merge'), '[]'::jsonb) as merges
         from contact_import_rows where workspace_id = $1 and batch_id = $2`,
        [workspaceId, batchId],
      );
      const row = counts.rows[0] ?? {};
      return {
        blocked: Number(row.blocked_count ?? 0),
        candidates: Number(row.candidate_count ?? 0),
        create: Number(row.create_count ?? 0),
        inFileDuplicates: Number(row.in_file_count ?? 0),
        issues: Number(row.issue_count ?? 0),
        merge: Number(row.merge_count ?? 0),
        mergeConfirmations: json<{ seq: number; contactId: string }[]>(row.merges, []),
        skip: Number(row.skip_count ?? 0),
        undecided: Number(row.undecided_count ?? 0),
      };
    },

    async pendingChunk(tx: TransactionalSqlExecutor, batchId: string, limit: number): Promise<ContactImportRowRecord[]> {
      const result = await tx.query<Row>(
        `/* contact-import:pending-chunk */
         select seq, fields, null::jsonb as cells, parse_issues, in_file_duplicate_of, candidate, decision, merge_into_contact_id, status, contact_id
         from contact_import_rows where workspace_id = $1 and batch_id = $2 and status = 'pending'
         order by seq limit $3`,
        [workspaceId, batchId, limit],
      );
      return result.rows.map(mapRow);
    },

    async settleRows(
      tx: TransactionalSqlExecutor,
      batchId: string,
      chunk: number,
      outcomes: readonly { seq: number; status: Exclude<ContactImportRowStatus, "pending">; contactId: string | null }[],
    ): Promise<void> {
      if (!outcomes.length) return;
      await tx.query(
        `/* contact-import:settle-rows */
         update contact_import_rows t set status = o.status, contact_id = o.contact_id, layers_chunk = $3, version = t.version + 1
         from jsonb_to_recordset($4::jsonb) as o(seq integer, status text, contact_id text)
         where t.workspace_id = $1 and t.batch_id = $2 and t.seq = o.seq and t.status = 'pending'`,
        [workspaceId, batchId, chunk, JSON.stringify(outcomes.map((outcome) => ({ contact_id: outcome.contactId, seq: outcome.seq, status: outcome.status })))],
      );
    },

    async recordChunk(tx: TransactionalSqlExecutor, batchId: string, input: { chunk: number; delta: ContactImportCounts; hasContacts: boolean; now: Date }): Promise<void> {
      await tx.query(
        `/* contact-import:record-chunk */
         update contact_import_batches set
           counts = jsonb_build_object(
             'created', (counts->>'created')::int + $3, 'merged', (counts->>'merged')::int + $4,
             'skipped', (counts->>'skipped')::int + $5, 'failed', (counts->>'failed')::int + $6),
           next_chunk = $7 + 1,
           layers_status = case when $8 then (case when layers_status = 'retry' then 'retry' else 'pending' end) else layers_status end,
           version = version + 1,
           updated_at = $9
         where workspace_id = $1 and id = $2`,
        [workspaceId, batchId, input.delta.created, input.delta.merged, input.delta.skipped, input.delta.failed, input.chunk, input.hasContacts, input.now.toISOString()],
      );
    },

    async setStatus(
      tx: TransactionalSqlExecutor,
      batchId: string,
      input: { status: ContactImportBatchStatus; now: Date; expiresAt?: Date; commitIntentId?: string; commitFingerprint?: string; completed?: boolean },
    ): Promise<void> {
      await tx.query(
        `/* contact-import:set-status */
         update contact_import_batches set
           status = $3,
           commit_intent_id = coalesce($4, commit_intent_id),
           commit_fingerprint = coalesce($5, commit_fingerprint),
           completed_at = case when $6 then $7::timestamptz else completed_at end,
           expires_at = coalesce($8::timestamptz, expires_at),
           version = version + 1,
           updated_at = $7
         where workspace_id = $1 and id = $2`,
        [workspaceId, batchId, input.status, input.commitIntentId ?? null, input.commitFingerprint ?? null, input.completed === true,
          input.now.toISOString(), input.expiresAt?.toISOString() ?? null],
      );
    },

    /** 每个写入事务提交前登记一条三层更新任务（存这一事务的联系人 id；解析行清理后也不丢）。 */
    async insertFollowup(tx: TransactionalSqlExecutor, input: { batchId: string; chunk: number; actorId: string; contactIds: readonly string[]; now: Date }): Promise<void> {
      await tx.query(
        `/* contact-import:insert-followup */
         insert into contact_import_followups (workspace_id, batch_id, chunk, actor_id, contact_ids, created_at, updated_at)
         values ($1, $2, $3, $4, $5::text[], $6, $6)
         on conflict (workspace_id, batch_id, chunk) do nothing`,
        [workspaceId, input.batchId, input.chunk, input.actorId, [...input.contactIds], input.now.toISOString()],
      );
    },

    /**
     * 领取一条到期的三层更新任务（逐条领取、带租约令牌）：待处理的，或运行中但租约已过期的。
     * 传 batchId 时只领本人这一批（请求结束后的 after()）；不传时维护任务按更新时间最早领。
     */
    async claimFollowup(
      executor: TransactionalSqlExecutor,
      input: { now: Date; leaseMs: number; token: string; actorId?: string; batchId?: string },
    ): Promise<{ batchId: string; chunk: number; actorId: string; contactIds: string[] } | null> {
      const result = await executor.query<{ batch_id: string; chunk: number; actor_id: string; contact_ids: string[] }>(
        `/* contact-import:claim-followup */
         update contact_import_followups f set
           status = 'running', lease_token = $3, lease_until = $2::timestamptz + ($4::int * interval '1 millisecond'),
           attempts = f.attempts + 1, updated_at = $2
         where (f.workspace_id, f.batch_id, f.chunk) = (
           select workspace_id, batch_id, chunk from contact_import_followups
           where workspace_id = $1 and ($5::text is null or (batch_id = $5 and actor_id = $6))
             and (status = 'pending' or (status = 'running' and lease_until < $2))
           order by case when $5::text is null then updated_at end, chunk
           limit 1
           for update skip locked)
         returning f.batch_id, f.chunk, f.actor_id, f.contact_ids`,
        [workspaceId, input.now.toISOString(), input.token, input.leaseMs, input.batchId ?? null, input.actorId ?? null],
      );
      const row = result.rows[0];
      return row ? { actorId: String(row.actor_id), batchId: String(row.batch_id), chunk: Number(row.chunk), contactIds: (row.contact_ids ?? []).map(String) } : null;
    },

    /** 完成／失败都以租约令牌为前提：令牌已被别人换掉（租约过期后重领）时什么也不改，返回 false。 */
    async settleFollowup(
      executor: TransactionalSqlExecutor,
      input: { batchId: string; chunk: number; token: string; now: Date; outcome: { done: true; retryOn: string | null } | { done: false; error: string } },
    ): Promise<boolean> {
      const done = input.outcome.done;
      const result = await executor.query(
        `/* contact-import:settle-followup */
         update contact_import_followups set
           status = case when $5 then 'done' else 'pending' end,
           lease_token = null, lease_until = null,
           last_error = case when $5 then null else $6 end,
           enrichment_retry_on = case when $5 then $7::timestamptz else enrichment_retry_on end,
           updated_at = $4
         where workspace_id = $1 and batch_id = $2 and chunk = $3 and status = 'running' and lease_token = $8
         returning chunk`,
        [workspaceId, input.batchId, input.chunk, input.now.toISOString(), done,
          done ? null : (input.outcome as { error: string }).error.slice(0, 80), done ? (input.outcome as { retryOn: string | null }).retryOn : null, input.token],
      );
      return result.rows.length > 0;
    },

    /** 由任务行重算批次的后续更新状态（导入记录显示用）。 */
    async refreshFollowUp(executor: TransactionalSqlExecutor, batchId: string, now: Date): Promise<void> {
      await executor.query(
        `/* contact-import:refresh-followup */
         update contact_import_batches b set
           layers_status = case when f.total = 0 then b.layers_status when f.open = 0 then 'done' when f.errored > 0 then 'retry' else 'pending' end,
           layers_last_error = f.last_error,
           enrichment_deferred_until = coalesce(f.retry_on, b.enrichment_deferred_until),
           updated_at = case when b.status = 'committing' then b.updated_at else $3 end
         from (
           select count(*)::int as total,
                  count(*) filter (where status <> 'done')::int as open,
                  count(*) filter (where status <> 'done' and last_error is not null)::int as errored,
                  max(enrichment_retry_on) as retry_on,
                  max(last_error) filter (where status <> 'done') as last_error
           from contact_import_followups where workspace_id = $1 and batch_id = $2
         ) f
         where b.workspace_id = $1 and b.id = $2`,
        [workspaceId, batchId, now.toISOString()],
      );
    },

    /**
     * 维护任务（review P1-1）：领取写到一半中断的批次（committing 且久未推进、解析行还在）。
     * 「领取」= 把 updated_at 推到现在，别的执行器在 staleMs 内不会再领；续写本身在批次行锁下逐事务进行，重复执行也安全。
     */
    async claimStaleCommitting(executor: TransactionalSqlExecutor, now: Date, staleMs: number, limit: number) {
      const result = await executor.query<{ actor_id: string; id: string; source_event_id: string | null; file_name: string }>(
        `/* contact-import:claim-stale-committing */
         update contact_import_batches b set updated_at = $2
         where (b.workspace_id, b.id) in (
           select workspace_id, id from contact_import_batches
           where workspace_id = $1 and status = 'committing' and rows_purged_at is null
             and updated_at < $2::timestamptz - ($3::int * interval '1 millisecond')
           order by updated_at limit $4
           for update skip locked)
         returning b.actor_id, b.id, b.source_event_id, b.file_name`,
        [workspaceId, now.toISOString(), staleMs, limit],
      );
      return result.rows.map((row) => ({ actorId: String(row.actor_id), batchId: String(row.id), fileName: String(row.file_name ?? ""), sourceEventId: row.source_event_id ?? null }));
    },

    /**
     * 维护任务：删过期批次的解析行；核对中的标 expired，写到一半且没能续写完的标 failed（interrupted_expired）。
     * 三层更新任务另存在 contact_import_followups（带联系人 id），清理解析行不影响它们（review P1-2）。返回清理的批次数。
     */
    async purgeExpiredRows(executor: TransactionalSqlExecutor, now: Date, limit: number): Promise<number> {
      const result = await executor.query<{ id: string }>(
        `/* contact-import:purge-expired */
         with due as (
           select id from contact_import_batches
           where workspace_id = $1 and rows_purged_at is null and expires_at < $2
           order by expires_at limit $3
           for update skip locked
         ), purged as (
           delete from contact_import_rows r using due where r.workspace_id = $1 and r.batch_id = due.id
         )
         update contact_import_batches b set
           rows_purged_at = $2,
           status = case when b.status in ('parsed', 'reviewing') then 'expired'
                         when b.status = 'committing' then 'failed' else b.status end,
           failure_reason = case when b.status = 'committing' then 'interrupted_expired' else b.failure_reason end,
           updated_at = $2
         from due where b.workspace_id = $1 and b.id = due.id
         returning b.id`,
        [workspaceId, now.toISOString(), limit],
      );
      return result.rows.length;
    },
  };
}

export type ContactImportRepository = ReturnType<typeof createContactImportRepository>;
