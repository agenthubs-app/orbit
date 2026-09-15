import { createHash } from "node:crypto";

import type {
  SyncChange,
  SyncChangeKind,
  SyncPage,
} from "../../shared/contract/sync";
import type { TaskDTO as LegacyTaskDTO } from "../../shared/domain/contracts";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../shared/storage/live-database-config";
import {
  createPgLiveRecordSqlClient,
  type PgLiveRecordSqlClientOptions,
} from "../../shared/storage/postgres-live-record-store";
import {
  createSyncCursorCodec,
  type SyncCursorCodec,
} from "./cursor";
import { noteRecordFromLiveRecord } from "../notes/note-record";
import { canonicalScheduleItemSchema } from "../personal-schedule/authority-contract";
import { legacyTaskToTaskItem } from "../tasks/legacy-task-adapter";
import { taskRecordFromLiveRecord } from "../tasks/task-record";

export const SYNC_DEFAULT_LIMIT = 100;
export const SYNC_MAX_LIMIT = 200;
export const SYNC_MAX_PAYLOAD_BYTES = 256 * 1_024;
export const SYNC_MAX_PAGE_BYTES = 1_024 * 1_024;

export type SyncReadErrorCode =
  | "SYNC_INVALID_HIGH_WATERMARK"
  | "SYNC_INVALID_RECORD"
  | "SYNC_PAYLOAD_TOO_LARGE"
  | "SYNC_PAGE_TOO_LARGE"
  | "SYNC_SCOPE_MISMATCH";

export class SyncReadError extends Error {
  constructor(
    readonly code: SyncReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SyncReadError";
  }
}

export interface SyncReadRow {
  collection_name: "notes" | "tasks" | "personal_schedule_items";
  deleted_at: Date | string | null;
  lifecycle_state: string;
  payload: Record<string, unknown> | string;
  record_id: string;
  sync_revision: bigint | number | string;
  updated_at: Date | string;
  user_id: string;
  workspace_id: string;
}

export interface SyncSqlClient {
  query<TRow = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: readonly TRow[] }>;
}

export interface IncrementalSyncReadInput {
  actorId: string;
  workspaceId: string;
  cursor?: string;
  limit: number;
}

export interface IncrementalSyncReadService {
  readPage(input: IncrementalSyncReadInput): Promise<SyncPage>;
}

interface IncrementalSyncReadServiceOptions {
  client: SyncSqlClient;
  cursorSecret: string;
  now?: () => string;
}

interface ConfiguredIncrementalSyncReadServiceOptions {
  createClient?: (options: PgLiveRecordSqlClientOptions) => SyncSqlClient;
  env?: LiveDatabaseEnv;
}

const HIGH_WATERMARK_SQL = `
  /* sync:high-watermark */
  select coalesce(max(sync_revision), 0)::text as high_watermark
  from orbit_records
  where workspace_id = $1
    and user_id = $2
    and collection_name in ('notes', 'tasks', 'personal_schedule_items')
`;

const PAGE_SQL = `
  /* sync:page */
  select workspace_id, collection_name, record_id, user_id, lifecycle_state,
    payload, updated_at, deleted_at, sync_revision::text as sync_revision
  from orbit_records
  where workspace_id = $1
    and user_id = $2
    and sync_revision > $3::bigint
    and sync_revision <= $4::bigint
    and collection_name in ('notes', 'tasks', 'personal_schedule_items')
  order by sync_revision asc
  limit $5
`;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function put(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) target[key] = value;
}

function liveRecordFromRow(
  row: SyncReadRow,
  payload: Record<string, unknown>,
): LiveRecord<Record<string, unknown>> {
  const updatedAt = timestamp(row.updated_at);
  return {
    workspaceId: row.workspace_id,
    collectionName: row.collection_name,
    recordId: row.record_id,
    userId: row.user_id,
    sourceType: "system",
    sourceId: row.record_id,
    evidenceIds: [],
    createdAt: updatedAt,
    updatedAt,
    ...(row.deleted_at === null ? {} : { deletedAt: timestamp(row.deleted_at) }),
    lifecycleState: row.lifecycle_state as LiveRecord["lifecycleState"],
    payload,
  };
}

function mapNotePayload(row: SyncReadRow, actorId: string) {
  const payload = asRecord(row.payload);
  if (!payload) return null;
  const parsed = noteRecordFromLiveRecord(liveRecordFromRow(row, payload), actorId);
  const note = parsed?.note;
  if (!note || note.id !== row.record_id) return null;
  const result: Record<string, unknown> = {
    id: note.id,
    accountId: actorId,
    ownerUserId: actorId,
    title: note.title,
    body: note.body,
    version: note.version,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
  result.manualContactIds = [...note.manualContactIds];
  result.contactIds = [...note.contactIds];
  result.eventIds = [...note.eventIds];
  result.mentions = note.mentions.map((mention) => ({ ...mention }));
  return result;
}

const legacyStatuses = new Set(["open", "scheduled", "completed", "dismissed"]);
const legacySourceTypes = new Set([
  "manual",
  "business_card_ocr",
  "qr_scan",
  "event_import",
  "external_contacts",
  "email_signal",
  "calendar_signal",
  "referral",
  "chat_summary",
  "agent_action",
  "system",
]);

function isoDateTime(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function optionalNonEmpty(value: unknown): value is string | undefined {
  return value === undefined || string(value) !== undefined;
}

function legacyTaskFromPayload(
  payload: Record<string, unknown>,
  actorId: string,
  recordId: string,
): LegacyTaskDTO | null {
  const source = asRecord(payload.source);
  const evidenceIds = payload.evidenceIds;
  if (
    (Object.hasOwn(payload, "accountId") && payload.accountId !== actorId)
    || (Object.hasOwn(payload, "ownerUserId") && payload.ownerUserId !== actorId)
    || payload.id !== recordId
    || !string(payload.title)
    || !legacyStatuses.has(String(payload.status))
    || !optionalNonEmpty(payload.contactId)
    || !optionalNonEmpty(payload.connectionId)
    || (payload.dueAt !== undefined && !isoDateTime(payload.dueAt))
    || !source
    || !legacySourceTypes.has(String(source.type))
    || !string(source.id)
    || !optionalNonEmpty(source.label)
    || !Array.isArray(evidenceIds)
    || evidenceIds.length === 0
    || !evidenceIds.every((value) => string(value) !== undefined)
    || !isoDateTime(payload.createdAt)
    || !isoDateTime(payload.updatedAt)
  ) return null;
  return {
    id: payload.id,
    title: payload.title,
    status: payload.status,
    ...(payload.contactId === undefined ? {} : { contactId: payload.contactId }),
    ...(payload.connectionId === undefined ? {} : { connectionId: payload.connectionId }),
    ...(payload.dueAt === undefined ? {} : { dueAt: payload.dueAt }),
    source: {
      type: source.type,
      id: source.id,
      ...(source.label === undefined ? {} : { label: source.label }),
    },
    evidenceIds: evidenceIds as [string, ...string[]],
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  } as LegacyTaskDTO;
}

function mapTaskPayload(row: SyncReadRow, actorId: string) {
  const payload = asRecord(row.payload);
  if (!payload) return null;
  const canonical = taskRecordFromLiveRecord(liveRecordFromRow(row, payload), actorId)?.task;
  const legacy = canonical ? null : legacyTaskFromPayload(payload, actorId, row.record_id);
  const task = canonical ?? (legacy ? legacyTaskToTaskItem(legacy, actorId) : null);
  if (!task || task.id !== row.record_id) return null;
  const result: Record<string, unknown> = {
    id: task.id,
    accountId: actorId,
    ownerUserId: actorId,
    title: task.title,
    status: task.status,
    category: task.category,
    priority: task.priority,
    source: task.source,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
  for (const field of [
    "notes",
    "location",
    "plannedDate",
    "dueAt",
    "relatedContactId",
    "relatedEventId",
    "relatedMeetingId",
    "relatedConversationId",
    "suggestionId",
    "sourceNoteId",
    "completedAt",
    "completedBy",
    "completionSource",
  ] as const) put(result, field, task[field]);
  put(result, "sourceNoteVersion", task.sourceNoteVersion);
  return result;
}

function mapSchedulePayload(row: SyncReadRow, actorId: string) {
  const candidate = asRecord(row.payload);
  if (!candidate) return null;
  const parsed = canonicalScheduleItemSchema.safeParse(candidate);
  if (
    !parsed.success
    || parsed.data.id !== row.record_id
    || parsed.data.accountId !== actorId
    || parsed.data.ownerUserId !== actorId
  ) return null;
  const payload = parsed.data;
  const result: Record<string, unknown> = {
    id: payload.id,
    accountId: actorId,
    ownerUserId: actorId,
    title: payload.title,
    kind: payload.kind,
    category: payload.category,
    state: payload.state,
    sourceId: payload.sourceId,
    startsAt: payload.startsAt,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
  for (const field of [
    "details",
    "endsAt",
    "contactId",
    "eventId",
    "location",
    "meetingId",
    "meetingMethod",
    "timeZone",
  ] as const) put(result, field, payload[field]);
  if (typeof payload.allDay === "boolean") result.allDay = payload.allDay;
  result.evidenceIds = [...payload.evidenceIds];
  return result;
}

function timestamp(value: Date | string): string {
  let normalized: string;
  try {
    normalized = value instanceof Date ? value.toISOString() : value;
  } catch {
    throw new SyncReadError("SYNC_INVALID_RECORD", "A canonical sync record is invalid.");
  }
  if (!isoDateTime(normalized)) {
    throw new SyncReadError("SYNC_INVALID_RECORD", "A canonical sync record is invalid.");
  }
  return normalized;
}

function kindFor(collectionName: SyncReadRow["collection_name"]): SyncChangeKind {
  if (collectionName === "notes") return "note";
  if (collectionName === "tasks") return "task";
  return "personal_schedule";
}

function changeFromRow(row: SyncReadRow, actorId: string): SyncChange {
  const common = {
    aiVisibility: "available_when_synced" as const,
    id: row.record_id,
    kind: kindFor(row.collection_name),
    revision: String(row.sync_revision),
    updatedAt: timestamp(row.updated_at),
  };
  if (row.lifecycle_state === "deleted") {
    return { ...common, operation: "delete" };
  }
  if (row.lifecycle_state !== "active") {
    throw new SyncReadError("SYNC_INVALID_RECORD", "A canonical sync record is invalid.");
  }
  const mapped = row.collection_name === "notes"
    ? mapNotePayload(row, actorId)
    : row.collection_name === "tasks"
      ? mapTaskPayload(row, actorId)
      : mapSchedulePayload(row, actorId);
  if (!mapped) {
    throw new SyncReadError("SYNC_INVALID_RECORD", "A canonical sync record is invalid.");
  }
  if (Buffer.byteLength(JSON.stringify(mapped), "utf8") > SYNC_MAX_PAYLOAD_BYTES) {
    throw new SyncReadError(
      "SYNC_PAYLOAD_TOO_LARGE",
      "A mapped sync payload exceeds the configured limit.",
    );
  }
  return { ...common, operation: "upsert", payload: mapped };
}

function validLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= SYNC_MAX_LIMIT;
}

function highWatermarkFrom(rows: readonly { high_watermark: string }[]): string {
  const value = rows[0]?.high_watermark;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new SyncReadError(
      "SYNC_INVALID_HIGH_WATERMARK",
      "The sync high watermark is invalid.",
    );
  }
  return value;
}

export function createIncrementalSyncReadService({
  client,
  cursorSecret,
  now = () => new Date().toISOString(),
}: IncrementalSyncReadServiceOptions): IncrementalSyncReadService {
  const cursors: SyncCursorCodec = createSyncCursorCodec({ secret: cursorSecret });
  return {
    async readPage(input) {
      if (!input.actorId.trim() || !input.workspaceId.trim()) {
        throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Authenticated sync scope is required.");
      }
      if (!validLimit(input.limit)) {
        throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync limit is invalid.");
      }
      const issuedAt = Date.parse(now());
      const decoded = input.cursor
        ? cursors.decode(input.cursor, input, issuedAt)
        : null;
      let afterRevision = decoded?.afterRevision ?? "0";
      let highWatermark = decoded?.highWatermark ?? "0";
      if (!decoded || decoded.afterRevision === decoded.highWatermark) {
        const result = await client.query<{ high_watermark: string }>(
          HIGH_WATERMARK_SQL,
          [input.workspaceId, input.actorId],
        );
        highWatermark = highWatermarkFrom(result.rows);
      }
      const result = await client.query<SyncReadRow>(PAGE_SQL, [
        input.workspaceId,
        input.actorId,
        afterRevision,
        highWatermark,
        input.limit + 1,
      ]);
      const pageRows = result.rows.slice(0, input.limit);
      if (pageRows.some((row) => row.workspace_id !== input.workspaceId || row.user_id !== input.actorId)) {
        throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync rows must match the authenticated scope.");
      }
      const hasMore = result.rows.length > input.limit;
      afterRevision = hasMore
        ? String(pageRows.at(-1)?.sync_revision ?? afterRevision)
        : highWatermark;
      const changes = pageRows.map((row) => changeFromRow(row, input.actorId));
      const page: SyncPage = {
        workspaceId: input.workspaceId,
        changes,
        nextCursor: cursors.encode({
          actorId: input.actorId,
          workspaceId: input.workspaceId,
          afterRevision,
          highWatermark,
        }, issuedAt),
        hasMore,
        highWatermark,
        serverTime: new Date(issuedAt).toISOString(),
      };
      if (
        Buffer.byteLength(
          JSON.stringify({ success: true, data: page }),
          "utf8",
        ) > SYNC_MAX_PAGE_BYTES
      ) {
        throw new SyncReadError(
          "SYNC_PAGE_TOO_LARGE",
          "The mapped sync page exceeds the configured limit.",
        );
      }
      return page;
    },
  };
}

let configuredCache: {
  key: string;
  service: IncrementalSyncReadService;
} | null = null;

export function createConfiguredIncrementalSyncReadService({
  createClient = createPgLiveRecordSqlClient,
  env = process.env,
}: ConfiguredIncrementalSyncReadServiceOptions = {}): IncrementalSyncReadService | null {
  const config = resolveLiveDatabaseConnectionConfig(env);
  const cursorSecret = env.ORBIT_SYNC_CURSOR_SECRET?.trim();
  if (!config || !cursorSecret) return null;
  const key = createHash("sha256")
    .update(`${config.connectionString}\u0000${config.workspaceId}\u0000${cursorSecret}`)
    .digest("hex");
  if (configuredCache?.key === key) return configuredCache.service;
  const scoped = createIncrementalSyncReadService({
    client: createClient({ connectionString: config.connectionString, max: 2 }),
    cursorSecret,
  });
  const service: IncrementalSyncReadService = {
    readPage(input) {
      if (input.workspaceId !== config.workspaceId) {
        throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Authenticated workspace is unavailable.");
      }
      return scoped.readPage(input);
    },
  };
  configuredCache = { key, service };
  return service;
}
