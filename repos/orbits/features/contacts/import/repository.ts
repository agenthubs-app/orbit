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

export type ContactImportBatchStatus = "parsed" | "reviewing" | "committing" | "completed" | "cancelled" | "expired";
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
  enrichment_deferred_until, created_at, updated_at, completed_at, expires_at, rows_purged_at`;

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
           and not (t.parse_issues && array['missing_name', 'decode_failed']::text[])
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
           count(*) filter (where parse_issues && array['missing_name', 'decode_failed']::text[])::int as blocked_count,
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
           layers_pending = case when $8 then array_append(layers_pending, $7) else layers_pending end,
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

    /** 领取本批的三层更新（租约）；拿不到（没有待办或别人正在做）返回 null。 */
    async claimLayers(executor: TransactionalSqlExecutor, actorId: string, batchId: string, now: Date, leaseMs: number): Promise<number[] | null> {
      const result = await executor.query<{ layers_pending: unknown[] }>(
        `/* contact-import:claim-layers */
         update contact_import_batches set
           layers_lease_until = $4::timestamptz + ($5::int * interval '1 millisecond'),
           layers_attempts = layers_attempts + 1,
           updated_at = $4
         where workspace_id = $1 and actor_id = $2 and id = $3
           and layers_status in ('pending', 'retry')
           and (layers_lease_until is null or layers_lease_until < $4)
         returning layers_pending`,
        [workspaceId, actorId, batchId, now.toISOString(), leaseMs],
      );
      const row = result.rows[0];
      return row ? (row.layers_pending ?? []).map(Number).sort((a, b) => a - b) : null;
    },

    async chunkContactIds(executor: TransactionalSqlExecutor, batchId: string, chunk: number): Promise<string[]> {
      const result = await executor.query<{ contact_id: string }>(
        `/* contact-import:chunk-contacts */
         select contact_id from contact_import_rows
         where workspace_id = $1 and batch_id = $2 and layers_chunk = $3 and contact_id is not null and status in ('created', 'merged', 'skipped')
         order by seq`,
        [workspaceId, batchId, chunk],
      );
      return [...new Set(result.rows.map((row) => String(row.contact_id)))];
    },

    async completeLayersChunk(executor: TransactionalSqlExecutor, batchId: string, chunk: number, deferredUntil: string | null, now: Date): Promise<void> {
      await executor.query(
        `/* contact-import:complete-layers-chunk */
         update contact_import_batches set
           layers_pending = array_remove(layers_pending, $3),
           enrichment_deferred_until = case when $4::timestamptz is null then enrichment_deferred_until
                                            else greatest(coalesce(enrichment_deferred_until, $4::timestamptz), $4::timestamptz) end,
           updated_at = $5
         where workspace_id = $1 and id = $2`,
        [workspaceId, batchId, chunk, deferredUntil, now.toISOString()],
      );
    },

    async releaseLayers(executor: TransactionalSqlExecutor, batchId: string, input: { failed: string | null; now: Date }): Promise<void> {
      await executor.query(
        `/* contact-import:release-layers */
         update contact_import_batches set
           layers_status = case when $3::text is not null then 'retry'
                                when cardinality(layers_pending) = 0 then 'done' else layers_status end,
           layers_last_error = case when $3::text is not null then $3 when cardinality(layers_pending) = 0 then null else layers_last_error end,
           layers_lease_until = null,
           updated_at = $4
         where workspace_id = $1 and id = $2`,
        [workspaceId, batchId, input.failed, input.now.toISOString()],
      );
    },

    /** 维护任务：到期需要（重新）做三层更新的批次（租约空或过期）。 */
    async dueLayerBatches(executor: TransactionalSqlExecutor, now: Date, limit: number): Promise<{ actorId: string; batchId: string }[]> {
      const result = await executor.query<{ actor_id: string; id: string }>(
        `/* contact-import:due-layers */
         select actor_id, id from contact_import_batches
         where workspace_id = $1 and layers_status in ('pending', 'retry') and (layers_lease_until is null or layers_lease_until < $2)
           and updated_at < $2::timestamptz - interval '1 minute'
         order by updated_at limit $3`,
        [workspaceId, now.toISOString(), limit],
      );
      return result.rows.map((row) => ({ actorId: String(row.actor_id), batchId: String(row.id) }));
    },

    /** 维护任务：删过期批次的解析行；未完成的批次标 expired。返回清理的批次数。 */
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
           status = case when b.status in ('parsed', 'reviewing') then 'expired' else b.status end,
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
