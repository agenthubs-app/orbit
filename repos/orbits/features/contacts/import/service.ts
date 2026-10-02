/**
 * W0053：联系人导入服务（上传解析 → 字段对应 → 去重核对 → 幂等提交 → 三层更新）。
 *
 * - 上传：服务端解析（parse/*），每批只读一次本人联系人比对字段（listActorContactRecords），写批次与全部解析行；
 *   同一幂等键重放返回同一批次；
 * - 提交（`confirmationIntentId` 幂等）：服务端拒绝含未决行、或有「合并」行不在本次确认清单里的提交；
 *   每 ≤200 行一个事务（新建 id `contact:import:<sha24(actor, batch, seq)>`，重放得同一 id；合并复用
 *   mergeCardIntoContact，冲突写进「导入补充」段，补全字段经 canWriteEnrichedValue）；
 * - 三层更新：每个写入事务提交后对应一次 W0048a `runNewContactLayers`（来源键 `contact-import:<批次>:<事务号>`），
 *   在请求结束后（after）执行；入口失败不回滚联系人，批次标 retry，重试只重跑入口（入口自身按来源键幂等）；
 * - 本模块不调用模型、不碰配额账本、不写计划表（计划只经入口入队「待确认」）。
 */
import { createHash, randomUUID } from "node:crypto";

import type { ContactDTO } from "../../../shared/domain/contracts";
import { normalizeRegion } from "../../../shared/domain/regions";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { ContactMergeRejected, listActorContactRecords, mergeCardIntoContact } from "../business-card-contact-match";
import { applyEnrichedValues, type EnrichedValue } from "../enrichment/apply-enrichment";
import { createStorageBusinessCardContactWriteProvider } from "../storage/contact-write-live-record-provider";
import type { RunNewContactLayersInput, RunNewContactLayersResult } from "../../network-analysis/new-contact-layers";
import { importCardFields, reviewImportRows, type ContactImportDecision, type ReviewedRow } from "./dedupe";
import { listActorEventExchanges, summarizeImportableEvents, type ImportableEventSummary } from "./events-source";
import { CONTACT_IMPORT_CHUNK_SIZE, CONTACT_IMPORT_MAX_ROWS, CONTACT_IMPORT_PAGE_SIZE, CONTACT_IMPORT_ROW_TTL_MS } from "./limits";
import { normalizeCsvRow, sanitizeMapping } from "./parse/mapping";
import { parseImportFile } from "./parse/index";
import {
  createContactImportRepository,
  type ContactImportBatchRecord,
  type ContactImportCounts,
  type ContactImportRowFilter,
  type ContactImportRowRecord,
} from "./repository";
import { emptyImportFields, type ContactImportFields } from "./types";

export type ContactImportErrorCode =
  | "NOT_FOUND"
  | "NOT_REVIEWABLE"
  | "INVALID_MAPPING"
  | "INVALID_DECISIONS"
  | "UNDECIDED_ROWS"
  | "MERGE_NOT_CONFIRMED"
  | "INTENT_CONFLICT"
  | "NOTHING_TO_IMPORT";

export class ContactImportError extends Error {
  constructor(readonly code: ContactImportErrorCode, message: string, readonly detail?: Record<string, unknown>) {
    super(message);
  }
}

export type RunImportLayers = (input: RunNewContactLayersInput) => Promise<RunNewContactLayersResult>;

export interface ContactImportServiceDeps {
  client: TransactionalPostgresClient;
  workspaceId: string;
  /** W0048a 三层更新入口（生产：runConfiguredNewContactLayers；测试：真实入口 + mock 模型，或桩）。 */
  runLayers: RunImportLayers;
  /** 请求结束后执行（生产：next/server after）；测试里直接 await。 */
  schedule?: (task: () => Promise<void>) => void;
  now?: () => Date;
  layersLeaseMs?: number;
  log?: (line: Record<string, unknown>) => void;
}

export interface ContactImportReview {
  create: number;
  merge: number;
  skip: number;
  undecided: number;
  blocked: number;
  inFileDuplicates: number;
  candidates: number;
  issues: number;
  mergeConfirmations: { seq: number; contactId: string }[];
}

export interface ContactImportBatchView {
  id: string;
  kind: ContactImportBatchRecord["kind"];
  format: ContactImportBatchRecord["format"];
  status: ContactImportBatchRecord["status"];
  fileName: string;
  sourceEventId: string | null;
  rowCount: number;
  headers: string[];
  mapping: ContactImportBatchRecord["mapping"];
  counts: ContactImportCounts;
  review: ContactImportReview | null;
  followUp: {
    state: ContactImportBatchRecord["layersStatus"];
    enrichmentDeferredUntil: string | null;
  };
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
}

export interface ContactImportRowView {
  seq: number;
  fields: ContactImportFields;
  issues: ContactImportRowRecord["issues"];
  inFileDuplicateOf: number | null;
  candidate: ContactImportRowRecord["candidate"];
  decision: ContactImportDecision | null;
  mergeIntoContactId: string | null;
  status: ContactImportRowRecord["status"];
  contactId: string | null;
}

export interface MergeConfirmation {
  seq: number;
  contactId: string;
}

const SOURCE_LABEL: Record<"csv" | "vcard" | "event", string> = { csv: "CSV 导入", event: "活动导入", vcard: "vCard 导入" };
const SUPPLEMENT_LABEL = "导入补充";
const DEFAULT_LAYERS_LEASE_MS = 10 * 60 * 1000;

export function importContactId(actorId: string, batchId: string, seq: number): string {
  const digest = createHash("sha256").update(actorId).update("\u0000").update(batchId).update("\u0000").update(String(seq)).digest("hex").slice(0, 24);
  return `contact:import:${digest}`;
}

function recordStoreFor(executor: TransactionalSqlExecutor) {
  return createPostgresLiveRecordStore<Record<string, unknown>>({
    client: {
      async query(text: string, values?: readonly unknown[]) {
        const result = await executor.query(text, values);
        return { rows: result.rows as never[] };
      },
    },
  });
}

/** 合并／新建时附在备注里的导入信息（LinkedIn 链接、连接日期、文件备注）。 */
function importNoteLines(fields: ContactImportFields): string[] {
  return [
    ...fields.notes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    ...(fields.linkedinUrl ? [`LinkedIn: ${fields.linkedinUrl}`] : []),
    ...(fields.connectedOn ? [`LinkedIn 连接日期: ${fields.connectedOn}`] : []),
  ];
}

/** 文件里明确写出的国家（+ 城市）按 W0045 规则以 `card` 来源写入地区；不调模型。 */
function cardRegionValues(fields: ContactImportFields): EnrichedValue[] {
  if (!fields.countryCode) return [];
  const region = normalizeRegion(fields.countryCode, fields.city ?? null) ?? normalizeRegion(fields.countryCode, null);
  return region ? [{ field: "region", origin: "card", value: region, via: "rule" }] : [];
}

function contactFromRow(input: { actorId: string; batch: ContactImportBatchRecord; row: ContactImportRowRecord; at: string }): ContactDTO {
  const { fields } = input.row;
  const notes = importNoteLines(fields).join("\n");
  const contact: ContactDTO = {
    createdAt: input.at,
    displayName: fields.displayName.trim(),
    evidenceIds: [`evidence:contact-import:${input.batch.id}:${input.row.seq}`],
    id: importContactId(input.actorId, input.batch.id, input.row.seq),
    ...(fields.organization ? { organization: fields.organization } : {}),
    ...(fields.role ? { role: fields.role } : {}),
    ...(fields.location ? { location: fields.location } : {}),
    ...(fields.email ? { primaryEmail: fields.email } : {}),
    ...(fields.phone ? { primaryPhone: fields.phone } : {}),
    ...(notes ? { notes } : {}),
    source: {
      id: input.batch.id,
      label: SOURCE_LABEL[input.batch.kind],
      type: input.batch.kind === "event" ? "event_import" : "external_contacts",
    },
    stage: "captured",
    updatedAt: input.at,
  };
  const values = cardRegionValues(fields);
  if (!values.length) return contact;
  const payload = contact as unknown as Record<string, unknown>;
  applyEnrichedValues(payload, values, input.at);
  return payload as unknown as ContactDTO;
}

function fingerprint(confirmations: readonly MergeConfirmation[]): string {
  const canonical = [...confirmations].sort((a, b) => a.seq - b.seq).map((entry) => `${entry.seq}:${entry.contactId}`);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function toRowView(row: ContactImportRowRecord): ContactImportRowView {
  return {
    candidate: row.candidate,
    contactId: row.contactId,
    decision: row.decision,
    fields: row.fields,
    inFileDuplicateOf: row.inFileDuplicateOf,
    issues: row.issues,
    mergeIntoContactId: row.mergeIntoContactId,
    seq: row.seq,
    status: row.status,
  };
}

export function createContactImportService(deps: ContactImportServiceDeps) {
  const { client, workspaceId } = deps;
  const repository = createContactImportRepository({ workspaceId });
  const now = deps.now ?? (() => new Date());
  const schedule = deps.schedule ?? ((task: () => Promise<void>) => void task());
  const log = deps.log ?? ((line: Record<string, unknown>) => console.info(JSON.stringify(line)));
  const leaseMs = deps.layersLeaseMs ?? DEFAULT_LAYERS_LEASE_MS;

  async function view(executor: TransactionalSqlExecutor, batch: ContactImportBatchRecord): Promise<ContactImportBatchView> {
    const review = batch.rowsPurgedAt ? null : await repository.reviewSummary(executor, batch.id);
    return {
      completedAt: batch.completedAt,
      counts: batch.counts,
      createdAt: batch.createdAt,
      expiresAt: batch.expiresAt,
      fileName: batch.fileName,
      followUp: { enrichmentDeferredUntil: batch.enrichmentDeferredUntil, state: batch.layersStatus },
      format: batch.format,
      headers: batch.headers,
      id: batch.id,
      kind: batch.kind,
      mapping: batch.mapping,
      review,
      rowCount: batch.rowCount,
      sourceEventId: batch.sourceEventId,
      status: batch.status,
    };
  }

  async function requireBatch(executor: TransactionalSqlExecutor, actorId: string, batchId: string, lock = false): Promise<ContactImportBatchRecord> {
    const batch = await repository.getBatch(executor, actorId, batchId, { lock });
    if (!batch) throw new ContactImportError("NOT_FOUND", `import batch ${batchId} was not found`);
    return batch;
  }

  /** 写入一个事务（≤200 行待处理行）；没有待处理行返回 false。 */
  async function commitNextChunk(actorId: string, batchId: string, metEvent: { eventId: string; title: string } | null): Promise<boolean> {
    return client.transaction(async (tx) => {
      const batch = await requireBatch(tx, actorId, batchId, true);
      const rows = await repository.pendingChunk(tx, batch.id, CONTACT_IMPORT_CHUNK_SIZE);
      if (!rows.length) return false;
      const chunk = batch.nextChunk;
      const at = now();
      const store = recordStoreFor(tx);
      const provider = createStorageBusinessCardContactWriteProvider({ recordProvider: "orbit-contact-import", store, workspaceId });
      const delta: ContactImportCounts = { created: 0, failed: 0, merged: 0, skipped: 0 };
      const outcomes: { seq: number; status: "created" | "merged" | "skipped" | "failed"; contactId: string | null }[] = [];
      for (const row of rows) {
        if (row.decision === "skip" || row.decision === null) {
          const blocked = row.issues.includes("missing_name") || row.issues.includes("decode_failed");
          if (blocked) delta.failed += 1;
          else delta.skipped += 1;
          outcomes.push({ contactId: row.contactId, seq: row.seq, status: blocked ? "failed" : "skipped" });
          continue;
        }
        if (row.decision === "create") {
          const saved = await provider.saveContact(contactFromRow({ actorId, at: at.toISOString(), batch, row }), actorId);
          delta.created += 1;
          outcomes.push({ contactId: saved.id, seq: row.seq, status: "created" });
          continue;
        }
        const target = row.mergeIntoContactId!;
        if (metEvent) {
          // 活动导入：只补空「在该活动认识」，已经记着活动的不动（计为跳过，仍随这批走三层更新）。
          const current = await store.getRecord({ collectionName: "contacts", recordId: target, workspaceId });
          if (current && typeof current.payload.metEventId === "string" && current.payload.metEventId.trim()) {
            delta.skipped += 1;
            outcomes.push({ contactId: target, seq: row.seq, status: "skipped" });
            continue;
          }
        }
        try {
          await mergeCardIntoContact({
            actorId,
            card: metEvent ? { address: "", displayName: "", email: "", organization: "", phone: "", role: "" } : importCardFields(row.fields),
            cardNotes: metEvent ? "" : importNoteLines(row.fields).join("\n"),
            contactId: target,
            enrichment: { values: metEvent ? [] : cardRegionValues(row.fields) },
            evidenceIds: [`evidence:contact-import:${batch.id}:${row.seq}`],
            metEvent,
            now: () => at,
            store,
            supplementLabel: SUPPLEMENT_LABEL,
            workspaceId,
          });
          delta.merged += 1;
          outcomes.push({ contactId: target, seq: row.seq, status: "merged" });
        } catch (error) {
          if (!(error instanceof ContactMergeRejected)) throw error;
          // 目标联系人已删除／不归本人：这一行记失败，其余行照常。
          delta.failed += 1;
          outcomes.push({ contactId: null, seq: row.seq, status: "failed" });
        }
      }
      await repository.settleRows(tx, batch.id, chunk, outcomes);
      const hasContacts = outcomes.some((outcome) => outcome.contactId !== null && outcome.status !== "failed");
      await repository.recordChunk(tx, batch.id, { chunk, delta, hasContacts, now: at });
      return true;
    }, { isolation: "read committed" });
  }

  async function writeAllChunks(actorId: string, batchId: string, metEvent: { eventId: string; title: string } | null): Promise<void> {
    for (let guard = 0; guard <= Math.ceil(CONTACT_IMPORT_MAX_ROWS / CONTACT_IMPORT_CHUNK_SIZE) + 1; guard += 1) {
      if (!(await commitNextChunk(actorId, batchId, metEvent))) break;
    }
    await client.transaction(async (tx) => {
      const batch = await requireBatch(tx, actorId, batchId, true);
      if (batch.status !== "committing") return;
      const at = now();
      await repository.setStatus(tx, batch.id, { completed: true, expiresAt: new Date(at.getTime() + CONTACT_IMPORT_ROW_TTL_MS), now: at, status: "completed" });
    }, { isolation: "read committed" });
  }

  /** 三层更新：按事务号逐个调用入口；失败标 retry（联系人不回滚）。 */
  async function runPendingLayers(actorId: string, batchId: string): Promise<"done" | "retry" | "busy"> {
    const at = now();
    const pending = await repository.claimLayers(client, actorId, batchId, at, leaseMs);
    if (!pending) return "busy";
    for (const chunk of pending) {
      const contactIds = await repository.chunkContactIds(client, batchId, chunk);
      try {
        const result = contactIds.length
          ? await deps.runLayers({ actorId, contactIds, now: now(), sourceKey: `contact-import:${batchId}:${chunk}` })
          : null;
        await repository.completeLayersChunk(client, batchId, chunk, result?.enrichment === "deferred" ? (result.retryOn ?? null) : null, now());
      } catch (error) {
        log({ actorId, batchId, chunk, error: error instanceof Error ? error.name : "unknown", event: "contact_import_layers_failed" });
        await repository.releaseLayers(client, batchId, { failed: error instanceof Error ? error.name.slice(0, 80) : "unknown", now: now() });
        return "retry";
      }
    }
    await repository.releaseLayers(client, batchId, { failed: null, now: now() });
    return "done";
  }

  function scheduleLayers(actorId: string, batchId: string): void {
    schedule(async () => {
      try {
        await runPendingLayers(actorId, batchId);
      } catch (error) {
        log({ actorId, batchId, error: error instanceof Error ? error.name : "unknown", event: "contact_import_layers_schedule_failed" });
      }
    });
  }

  return {
    repository,
    runPendingLayers,

    async upload(input: { actorId: string; kind: "csv" | "vcard"; fileName: string; bytes: Uint8Array; idempotencyKey: string }): Promise<{ batch: ContactImportBatchView; replayed: boolean }> {
      const existing = await repository.getBatchByKey(client, input.actorId, input.idempotencyKey);
      if (existing) return { batch: await view(client, existing), replayed: true };
      const parsed = parseImportFile({ bytes: input.bytes, kind: input.kind });
      const records = await listActorContactRecords(recordStoreFor(client), workspaceId, input.actorId);
      const reviewed = reviewImportRows(parsed.rows.map((row, index) => ({ fields: row.fields, issues: row.issues, seq: index + 1 })), records, input.actorId);
      const at = now();
      const created = await client.transaction((tx) => repository.insertBatch(tx, {
        actorId: input.actorId,
        encoding: parsed.encoding,
        expiresAt: new Date(at.getTime() + CONTACT_IMPORT_ROW_TTL_MS),
        fileName: input.fileName,
        format: parsed.format,
        headers: parsed.headers,
        id: `contact-import:${randomUUID()}`,
        idempotencyKey: input.idempotencyKey,
        kind: parsed.kind,
        mapping: parsed.mapping,
        now: at,
        rows: reviewed.map((row) => ({ ...row, cells: parsed.rows[row.seq - 1]!.cells })),
        status: "reviewing",
      }), { isolation: "read committed" });
      if (created) return { batch: await view(client, created), replayed: false };
      // 并发的同键上传：另一个请求先写进去了。
      const winner = await repository.getBatchByKey(client, input.actorId, input.idempotencyKey);
      if (!winner) throw new Error("contact import batch vanished after idempotency conflict");
      return { batch: await view(client, winner), replayed: true };
    },

    async getBatch(actorId: string, batchId: string): Promise<ContactImportBatchView> {
      return view(client, await requireBatch(client, actorId, batchId));
    },

    async listBatches(actorId: string): Promise<ContactImportBatchView[]> {
      const batches = await repository.listBatches(client, actorId);
      // 导入记录只要摘要：不读核对计数。
      return batches.map((batch) => ({
        completedAt: batch.completedAt, counts: batch.counts, createdAt: batch.createdAt, expiresAt: batch.expiresAt, fileName: batch.fileName,
        followUp: { enrichmentDeferredUntil: batch.enrichmentDeferredUntil, state: batch.layersStatus }, format: batch.format, headers: [], id: batch.id,
        kind: batch.kind, mapping: null, review: null, rowCount: batch.rowCount, sourceEventId: batch.sourceEventId, status: batch.status,
      }));
    },

    async listRows(actorId: string, batchId: string, options: { afterSeq?: number; filter?: ContactImportRowFilter }): Promise<{ rows: ContactImportRowView[]; nextCursor: number | null }> {
      const batch = await requireBatch(client, actorId, batchId);
      const fetched = await repository.listRows(client, batch.id, options);
      const rows = fetched.slice(0, CONTACT_IMPORT_PAGE_SIZE);
      return { nextCursor: fetched.length > CONTACT_IMPORT_PAGE_SIZE ? rows.at(-1)!.seq : null, rows: rows.map(toRowView) };
    },

    /** 改字段对应：用存下的单元格重算全部行与去重（决定回到默认）。只在核对中、CSV 批次可用。 */
    async remap(actorId: string, batchId: string, rawMapping: unknown): Promise<ContactImportBatchView> {
      const records = await listActorContactRecords(recordStoreFor(client), workspaceId, actorId);
      return client.transaction(async (tx) => {
        const batch = await requireBatch(tx, actorId, batchId, true);
        if (batch.kind !== "csv" || batch.status !== "reviewing") throw new ContactImportError("NOT_REVIEWABLE", "Only CSV batches under review can be remapped.");
        const mapping = sanitizeMapping(rawMapping, batch.headers.length);
        if (!mapping) throw new ContactImportError("INVALID_MAPPING", "mapping must map known fields to header columns.");
        const rows = await repository.readAllRows(tx, batch.id);
        const reviewed: ReviewedRow[] = reviewImportRows(
          rows.map((row) => {
            const normalized = row.cells ? normalizeCsvRow(row.cells, mapping) : { fields: emptyImportFields(), issues: ["missing_name" as const] };
            return { fields: normalized.fields, issues: normalized.issues, seq: row.seq };
          }),
          records,
          actorId,
        );
        await repository.replaceReview(tx, batch.id, reviewed);
        await repository.updateBatchMapping(tx, batch.id, mapping, now());
        return view(tx, (await repository.getBatch(tx, actorId, batch.id))!);
      }, { isolation: "read committed" });
    },

    async setDecisions(actorId: string, batchId: string, decisions: readonly { seq: number; decision: ContactImportDecision }[]): Promise<{ batch: ContactImportBatchView; updated: number[] }> {
      if (decisions.some((entry) => !Number.isInteger(entry.seq) || entry.seq < 1 || !["create", "merge", "skip"].includes(entry.decision))) {
        throw new ContactImportError("INVALID_DECISIONS", "decisions must be [{ seq, decision: create|merge|skip }].");
      }
      return client.transaction(async (tx) => {
        const batch = await requireBatch(tx, actorId, batchId, true);
        if (batch.status !== "reviewing") throw new ContactImportError("NOT_REVIEWABLE", "This import is no longer under review.");
        const updated = await repository.setDecisions(tx, batch.id, decisions, now());
        return { batch: await view(tx, (await repository.getBatch(tx, actorId, batch.id))!), updated };
      }, { isolation: "read committed" });
    },

    async commit(actorId: string, batchId: string, input: { confirmationIntentId: string; mergeConfirmations: readonly MergeConfirmation[] }): Promise<{ batch: ContactImportBatchView; replayed: boolean }> {
      const intent = input.confirmationIntentId.trim();
      const print = fingerprint(input.mergeConfirmations);
      const start = await client.transaction(async (tx) => {
        const batch = await requireBatch(tx, actorId, batchId, true);
        if (batch.status === "completed" || batch.status === "committing") {
          if (batch.commitIntentId !== intent || batch.commitFingerprint !== print) {
            throw new ContactImportError("INTENT_CONFLICT", "This import was already submitted with a different confirmation.");
          }
          return { replayed: batch.status === "completed" };
        }
        if (batch.status !== "reviewing") throw new ContactImportError("NOT_REVIEWABLE", "This import can no longer be submitted.");
        const summary = await repository.reviewSummary(tx, batch.id);
        if (summary.undecided > 0) {
          throw new ContactImportError("UNDECIDED_ROWS", `${summary.undecided} possible duplicates still need a decision.`, { undecided: summary.undecided });
        }
        const confirmed = new Map(input.mergeConfirmations.map((entry) => [entry.seq, entry.contactId]));
        const missing = summary.mergeConfirmations.filter((entry) => confirmed.get(entry.seq) !== entry.contactId);
        const pendingMerges = new Set(summary.mergeConfirmations.map((entry) => entry.seq));
        const stray = input.mergeConfirmations.filter((entry) => !pendingMerges.has(entry.seq));
        if (missing.length || stray.length) {
          throw new ContactImportError("MERGE_NOT_CONFIRMED", "Every merge must be confirmed in this submission.", { missing: missing.length, stray: stray.length });
        }
        await repository.setStatus(tx, batch.id, { commitFingerprint: print, commitIntentId: intent, now: now(), status: "committing" });
        return { replayed: false };
      }, { isolation: "read committed" });
      if (!start.replayed) await writeAllChunks(actorId, batchId, null);
      const batch = await requireBatch(client, actorId, batchId);
      if (batch.layersStatus === "pending" || batch.layersStatus === "retry") scheduleLayers(actorId, batchId);
      return { batch: await view(client, batch), replayed: start.replayed };
    },

    async cancel(actorId: string, batchId: string): Promise<ContactImportBatchView> {
      return client.transaction(async (tx) => {
        const batch = await requireBatch(tx, actorId, batchId, true);
        if (batch.status === "cancelled") return view(tx, batch);
        if (batch.status !== "reviewing" && batch.status !== "parsed") throw new ContactImportError("NOT_REVIEWABLE", "Only an import under review can be cancelled.");
        const at = now();
        await repository.setStatus(tx, batch.id, { completed: true, expiresAt: new Date(at.getTime() + CONTACT_IMPORT_ROW_TTL_MS), now: at, status: "cancelled" });
        return view(tx, (await repository.getBatch(tx, actorId, batch.id))!);
      }, { isolation: "read committed" });
    },

    async listImportableEvents(actorId: string): Promise<ImportableEventSummary[]> {
      return summarizeImportableEvents(await listActorEventExchanges(client, { actorId, workspaceId }));
    },

    /** 活动导入：只导本人已互换的人（联系人已建出的）；只补空「在该活动认识」，整批走三层更新。 */
    async importEvent(input: { actorId: string; eventId: string; idempotencyKey: string }): Promise<{ batch: ContactImportBatchView; replayed: boolean }> {
      const existing = await repository.getBatchByKey(client, input.actorId, input.idempotencyKey);
      if (existing) {
        if (existing.status === "committing") await writeAllChunks(input.actorId, existing.id, existing.sourceEventId ? { eventId: existing.sourceEventId, title: existing.fileName } : null);
        const batch = await requireBatch(client, input.actorId, existing.id);
        if (batch.layersStatus === "pending" || batch.layersStatus === "retry") scheduleLayers(input.actorId, batch.id);
        return { batch: await view(client, batch), replayed: true };
      }
      const exchanges = (await listActorEventExchanges(client, { actorId: input.actorId, eventId: input.eventId, workspaceId })).filter((row) => row.projected);
      if (!exchanges.length) throw new ContactImportError("NOTHING_TO_IMPORT", "No exchanged contacts from this event are in your network yet.");
      const title = exchanges[0]!.eventTitle;
      const at = now();
      const rows = [...new Map(exchanges.map((row) => [row.contactId, row])).values()].map((row, index): ReviewedRow & { cells: null; contactId: string } => ({
        candidate: null,
        cells: null,
        contactId: row.contactId,
        decision: "merge",
        fields: { ...emptyImportFields(), displayName: row.displayName || row.contactId, metEventId: row.eventId, metEventTitle: title, organization: row.organization },
        inFileDuplicateOf: null,
        issues: [],
        mergeIntoContactId: row.contactId,
        seq: index + 1,
      }));
      const created = await client.transaction((tx) => repository.insertBatch(tx, {
        actorId: input.actorId,
        expiresAt: new Date(at.getTime() + CONTACT_IMPORT_ROW_TTL_MS),
        fileName: title,
        format: "event",
        headers: [],
        id: `contact-import:${randomUUID()}`,
        idempotencyKey: input.idempotencyKey,
        kind: "event",
        mapping: null,
        now: at,
        rows,
        sourceEventId: input.eventId,
        status: "committing",
      }), { isolation: "read committed" });
      const batchId = created?.id ?? (await repository.getBatchByKey(client, input.actorId, input.idempotencyKey))!.id;
      await writeAllChunks(input.actorId, batchId, { eventId: input.eventId, title });
      const batch = await requireBatch(client, input.actorId, batchId);
      if (batch.layersStatus === "pending" || batch.layersStatus === "retry") scheduleLayers(input.actorId, batchId);
      return { batch: await view(client, batch), replayed: !created };
    },
  };
}

export type ContactImportService = ReturnType<typeof createContactImportService>;
