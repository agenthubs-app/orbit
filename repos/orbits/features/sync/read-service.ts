import { createHash } from "node:crypto";

import type {
  SyncChange,
  SyncChangeKind,
  SyncPage,
} from "../../shared/contract/sync";
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

export const SYNC_DEFAULT_LIMIT = 100;
export const SYNC_MAX_LIMIT = 200;
export const SYNC_MAX_PAYLOAD_BYTES = 256 * 1_024;
export const SYNC_MAX_PAGE_BYTES = 1_024 * 1_024;

export type SyncReadErrorCode =
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
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : undefined;
}

function put(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) target[key] = value;
}

function mapNotePayload(payload: Record<string, unknown>, actorId: string, recordId: string) {
  const note = asRecord(payload.note);
  if (
    !note
    || note.id !== recordId
    || note.accountId !== actorId
    || note.ownerUserId !== actorId
    || !string(note.title)
    || !string(note.body)
    || !string(note.createdAt)
    || !string(note.updatedAt)
    || !finiteNumber(note.version)
  ) return null;
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
  for (const field of ["manualContactIds", "contactIds", "eventIds"] as const) {
    put(result, field, stringArray(note[field]));
  }
  if (Array.isArray(note.mentions)) {
    const mentions = note.mentions.flatMap((value) => {
      const mention = asRecord(value);
      if (!mention || !string(mention.contactId) || !string(mention.displayText)) return [];
      const start = finiteNumber(mention.start);
      const end = finiteNumber(mention.end);
      return start === undefined || end === undefined
        ? []
        : [{ contactId: mention.contactId, start, end, displayText: mention.displayText }];
    });
    if (mentions.length !== note.mentions.length) return null;
    result.mentions = mentions;
  }
  return result;
}

function mapTaskPayload(payload: Record<string, unknown>, actorId: string, recordId: string) {
  const nested = asRecord(payload.task);
  if (!nested) {
    if (
      payload.id !== recordId
      || payload.accountId !== actorId
      || !string(payload.title)
      || !string(payload.createdAt)
      || !string(payload.updatedAt)
    ) return null;
    const status = payload.status === "completed"
      ? "completed"
      : payload.status === "cancelled" || payload.status === "dismissed"
        ? "cancelled"
        : "open";
    const result: Record<string, unknown> = {
      id: recordId,
      accountId: actorId,
      ownerUserId: actorId,
      title: payload.title,
      status,
      category: string(payload.category) ?? "relationship",
      priority: payload.priority === "high" ? "high" : "normal",
      source: "ai_confirmed",
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    };
    for (const field of ["notes", "location", "plannedDate", "dueAt"] as const) {
      put(result, field, string(payload[field]));
    }
    put(result, "relatedContactId", string(payload.contactId));
    put(result, "relatedEventId", string(payload.eventId));
    put(result, "relatedMeetingId", string(payload.meetingId));
    if (status === "completed") {
      put(result, "completedAt", string(payload.completedAt) ?? string(payload.updatedAt));
      result.completedBy = actorId;
      result.completionSource = "agent_confirmed";
    }
    return result;
  }
  const task = nested;
  if (
    task.id !== recordId
    || task.accountId !== actorId
    || task.ownerUserId !== actorId
    || !string(task.title)
    || !string(task.status)
    || !string(task.category)
    || !string(task.priority)
    || !string(task.source)
    || !string(task.createdAt)
    || !string(task.updatedAt)
  ) return null;
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
  ] as const) put(result, field, string(task[field]));
  put(result, "sourceNoteVersion", finiteNumber(task.sourceNoteVersion));
  return result;
}

function mapSchedulePayload(payload: Record<string, unknown>, actorId: string, recordId: string) {
  if (
    payload.id !== recordId
    || payload.accountId !== actorId
    || payload.ownerUserId !== actorId
    || !string(payload.title)
    || !string(payload.kind)
    || !string(payload.category)
    || !string(payload.state)
    || !string(payload.sourceId)
    || !string(payload.startsAt)
    || !string(payload.createdAt)
    || !string(payload.updatedAt)
  ) return null;
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
  ] as const) put(result, field, string(payload[field]));
  if (typeof payload.allDay === "boolean") result.allDay = payload.allDay;
  put(result, "evidenceIds", stringArray(payload.evidenceIds));
  return result;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function kindFor(collectionName: SyncReadRow["collection_name"]): SyncChangeKind {
  if (collectionName === "notes") return "note";
  if (collectionName === "tasks") return "task";
  return "personal_schedule";
}

function changeFromRow(row: SyncReadRow, actorId: string): SyncChange | null {
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
  const payload = asRecord(row.payload);
  if (!payload) return null;
  const mapped = row.collection_name === "notes"
    ? mapNotePayload(payload, actorId, row.record_id)
    : row.collection_name === "tasks"
      ? mapTaskPayload(payload, actorId, row.record_id)
      : mapSchedulePayload(payload, actorId, row.record_id);
  if (!mapped) return null;
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
  const value = rows[0]?.high_watermark ?? "0";
  return /^(?:0|[1-9]\d*)$/.test(value) ? value : "0";
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
      const hasMore = result.rows.length > input.limit;
      afterRevision = hasMore
        ? String(pageRows.at(-1)?.sync_revision ?? afterRevision)
        : highWatermark;
      const changes = pageRows.flatMap((row) => {
        const mapped = changeFromRow(row, input.actorId);
        return mapped ? [mapped] : [];
      });
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
