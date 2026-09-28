import { createHash } from "node:crypto";
import type { DomainChange } from "../../shared/contract/universal-read";
import { orbitAgentChatSessionActorWorkspaceId } from "../orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { AI_SESSION_MESSAGE_DEVICE_WINDOW, AI_SESSION_OPENED_LIMIT } from "./domain-registry";
import { SyncReadError } from "./read-service";

/**
 * Sprint 0118 (AI B3): the readers behind the personal sub-workspace domains.
 *
 * Owner: the actor's personal sub-workspace (orbitAgentChatSessionActorWorkspaceId).
 * Every statement is bound to that workspace, derived from the authenticated
 * actor, so another actor's session ids name nothing here. The session's
 * organization row (pinned, custom title, group) is the actor's own row in the
 * base workspace (user_id = actor).
 *
 * "ai-sessions": one row per session. Its revision is the greater of the
 * session row's and its organization row's sync_revision, so renaming, pinning
 * or grouping resends the row. A deleted (or no longer listable) session is a
 * delete; a first pull sends no tombstones. The payload is the list item the
 * server's summary page returns (orbit-agent-chat-session-summary-page.ts).
 *
 * "ai-session-messages": only the sessions the device names (the ones it has
 * opened, at most AI_SESSION_OPENED_LIMIT). A session the device starts holding
 * is sent from its latest AI_SESSION_MESSAGE_DEVICE_WINDOW messages; after that
 * only messages whose sync_revision is past the device's bookmark (new or
 * edited), and tombstones when the session is deleted.
 */
interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

export function aiSubspaceOf(input: { workspaceId: string; actorId: string }): string {
  return orbitAgentChatSessionActorWorkspaceId(input.workspaceId, input.actorId);
}

function validRevision(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) throw new SyncReadError("SYNC_INVALID_HIGH_WATERMARK", "The sync high watermark is invalid.");
  return value;
}

// ---------- ai-sessions ----------

const ORGANIZATIONS_CTE = `organizations as (
    select payload->>'sessionId' as session_id, payload, lifecycle_state, sync_revision
    from orbit_records
    where workspace_id = $2 and collection_name = 'orbit_agent_chat_session_organizations' and user_id = $3
  )`;

const SESSIONS_HIGH_WATERMARK_SQL = `
  /* sync:ai-sessions:high-watermark */
  select greatest(
    (select coalesce(max(sync_revision), 0) from orbit_records where workspace_id = $1 and collection_name = 'orbit_agent_chat_sessions'),
    (select coalesce(max(sync_revision), 0) from orbit_records where workspace_id = $2 and collection_name = 'orbit_agent_chat_session_organizations' and user_id = $3)
  )::text as high_watermark
`;

const SESSIONS_PAGE_SQL = `
  /* sync:ai-sessions:page */
  with ${ORGANIZATIONS_CTE},
  candidates as (
    select s.record_id, s.lifecycle_state, s.payload, o.payload as organization, o.lifecycle_state as organization_state,
      greatest(s.sync_revision, coalesce(o.sync_revision, 0)) as revision
    from orbit_records s
    left join organizations o on o.session_id = s.record_id
    where s.workspace_id = $1 and s.collection_name = 'orbit_agent_chat_sessions'
  )
  select record_id, lifecycle_state, payload, organization, organization_state, revision::text as revision
  from candidates
  where revision > $4::bigint and revision <= $5::bigint
  order by candidates.revision asc
  limit $6
`;

interface SessionRow {
  record_id: string;
  lifecycle_state: string;
  payload: Record<string, unknown> | string;
  organization: Record<string, unknown> | string | null;
  organization_state: string | null;
  revision: string;
}

const json = <T>(value: T | string): T => (typeof value === "string" ? JSON.parse(value) as T : value);
const codePoints = (value: string, max: number) => [...value].slice(0, max).join("");

export interface AiSessionDeviceRow {
  id: string;
  title: string;
  firstUserText: string;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messageRevision: number;
  organization: { customTitle: string | null; groupId: string | null; pinned: boolean; revision: number };
}

/** The server summary page's list item for one session row, or null when the summary would not list it. */
export function aiSessionDeviceRow(recordId: string, payload: Record<string, unknown>, organization: Record<string, unknown> | null): AiSessionDeviceRow | null {
  if (payload.id !== recordId || typeof payload.title !== "string" || payload.title === "" || typeof payload.createdAt !== "string" || typeof payload.updatedAt !== "string") return null;
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const sessionCustomTitle = typeof payload.customTitle === "string" ? payload.customTitle : null;
  const revision = organization && typeof organization.revision === "number" && Number.isSafeInteger(organization.revision) && organization.revision >= 0 ? organization.revision : 0;
  return {
    id: recordId,
    title: codePoints(payload.title, 120),
    firstUserText: codePoints(typeof payload.firstUserMessage === "string" ? payload.firstUserMessage : "", 240),
    lastMessagePreview: codePoints(typeof payload.lastMessagePreview === "string" ? payload.lastMessagePreview : "", 240),
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    messageCount: count(payload.messageCount),
    messageRevision: count(payload.messageRevision),
    organization: organization
      ? {
          customTitle: typeof organization.customTitle === "string" ? organization.customTitle : null,
          groupId: typeof organization.groupId === "string" ? organization.groupId : null,
          pinned: organization.pinned === true,
          revision,
        }
      : { customTitle: sessionCustomTitle, groupId: null, pinned: payload.pinned === true, revision: 0 },
  };
}

export async function readAiSessionsHighWatermark(client: Queryable, input: { workspaceId: string; actorId: string }): Promise<string> {
  const result = await client.query<{ high_watermark: string }>(SESSIONS_HIGH_WATERMARK_SQL, [aiSubspaceOf(input), input.workspaceId, input.actorId]);
  return validRevision(result.rows[0]?.high_watermark);
}

export async function readAiSessionsPage(
  client: Queryable,
  input: { workspaceId: string; actorId: string; afterRevision: string; highWatermark: string; limit: number },
): Promise<{ changes: DomainChange[]; hasMore: boolean; lastRevision: string | null }> {
  const result = await client.query<SessionRow>(SESSIONS_PAGE_SQL, [aiSubspaceOf(input), input.workspaceId, input.actorId, input.afterRevision, input.highWatermark, input.limit + 1]);
  const pageRows = result.rows.slice(0, input.limit);
  const firstPull = input.afterRevision === "0";
  const changes: DomainChange[] = [];
  for (const row of pageRows) {
    const organization = row.organization && row.organization_state !== "deleted" ? json(row.organization) : null;
    const item = row.lifecycle_state === "deleted" ? null : aiSessionDeviceRow(row.record_id, json(row.payload), organization);
    if (!item) {
      if (!firstPull) changes.push({ id: row.record_id, revision: row.revision, operation: "delete", payload: null });
      continue;
    }
    changes.push({ id: row.record_id, revision: row.revision, operation: "upsert", payload: item as unknown as Record<string, unknown> });
  }
  return { changes, hasMore: result.rows.length > input.limit, lastRevision: pageRows.length ? pageRows.at(-1)!.revision : null };
}

// ---------- ai-session-messages ----------

/** The short stable name of an opened session inside a cursor (the ids themselves would outgrow it). */
export function aiSessionPartitionKey(sessionId: string): string {
  return createHash("sha256").update(`ai-session-partition:${sessionId}`).digest("hex").slice(0, 12);
}

/** The opened sessions a request names: unique, bounded, plain ids. */
export function openedAiSessions(raw: readonly string[] | undefined): string[] {
  const ids = [...new Set((raw ?? []).map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length > AI_SESSION_OPENED_LIMIT || ids.some((id) => id.length > 160)) {
    throw new SyncReadError("SYNC_SCOPE_MISMATCH", `At most ${AI_SESSION_OPENED_LIMIT} opened AI sessions, each id up to 160 characters.`);
  }
  return ids;
}

const MESSAGES_HIGH_WATERMARK_SQL = `
  /* sync:ai-session-messages:high-watermark */
  select coalesce(max(sync_revision), 0)::text as high_watermark
  from orbit_records
  where workspace_id = $1 and collection_name = 'orbit_agent_chat_messages'
`;

const POSITION = "(case when jsonb_typeof(m.payload->'index')='number' then (m.payload->>'index')::numeric end)";
const NEXT_INDEX = `coalesce(
    case when jsonb_typeof(s.payload->'nextMessageIndex')='number' then (s.payload->>'nextMessageIndex')::numeric end,
    case when jsonb_typeof(s.payload->'messageCount')='number' then (s.payload->>'messageCount')::numeric end,
    0)`;

// $6: send only a session's latest window (a session the device starts holding).
const MESSAGES_PAGE_SQL = `
  /* sync:ai-session-messages:page */
  select m.record_id, m.target_id, m.lifecycle_state, m.payload, m.created_at, m.sync_revision::text as sync_revision
  from orbit_records m
  join orbit_records s on s.workspace_id = m.workspace_id and s.collection_name = 'orbit_agent_chat_sessions' and s.record_id = m.target_id
  where m.workspace_id = $1
    and m.collection_name = 'orbit_agent_chat_messages'
    and m.target_id = any($2::text[])
    and m.sync_revision > $3::bigint
    and m.sync_revision <= $4::bigint
    and (not $6::boolean or ${POSITION} >= ${NEXT_INDEX} - ${AI_SESSION_MESSAGE_DEVICE_WINDOW})
  order by m.sync_revision asc
  limit $5
`;

interface MessageRow { record_id: string; target_id: string; lifecycle_state: string; payload: Record<string, unknown> | string; created_at: Date | string; sync_revision: string }

export interface AiSessionMessageDeviceRow {
  sessionId: string;
  id: string;
  role: "user" | "assistant";
  text: string;
  references?: { id: string; type: string }[];
  index: number;
  createdAt: string;
}

function messageDeviceRow(row: MessageRow): AiSessionMessageDeviceRow | null {
  const payload = json(row.payload);
  if ((payload.role !== "user" && payload.role !== "assistant") || typeof payload.text !== "string" || !payload.text.trim()
    || typeof payload.index !== "number" || !Number.isFinite(payload.index) || payload.sessionId !== row.target_id) return null;
  const references = Array.isArray(payload.references)
    ? payload.references.flatMap((reference) => reference && typeof reference === "object" && typeof (reference as { id?: unknown }).id === "string" && typeof (reference as { type?: unknown }).type === "string"
      ? [{ id: (reference as { id: string }).id, type: (reference as { type: string }).type }] : [])
    : [];
  return {
    sessionId: row.target_id,
    id: typeof payload.id === "string" && payload.id ? payload.id : `legacy-index:${payload.index}`,
    role: payload.role,
    text: payload.text,
    ...(references.length ? { references } : {}),
    index: payload.index,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : new Date(row.created_at).toISOString(),
  };
}

export async function readAiSessionMessagesHighWatermark(client: Queryable, input: { workspaceId: string; actorId: string }): Promise<string> {
  return validRevision((await client.query<{ high_watermark: string }>(MESSAGES_HIGH_WATERMARK_SQL, [aiSubspaceOf(input)])).rows[0]?.high_watermark);
}

/**
 * One page of the named sessions' messages with sync_revision in
 * (afterRevision, highWatermark]. `window` sends only each session's latest
 * window and no tombstones (the device does not hold the session yet).
 */
export async function readAiSessionMessagesPage(
  client: Queryable,
  input: { workspaceId: string; actorId: string; sessionIds: readonly string[]; afterRevision: string; highWatermark: string; limit: number; window: boolean },
): Promise<{ changes: DomainChange[]; hasMore: boolean; lastRevision: string | null }> {
  if (input.sessionIds.length === 0 || BigInt(input.afterRevision) >= BigInt(input.highWatermark)) return { changes: [], hasMore: false, lastRevision: null };
  const result = await client.query<MessageRow>(MESSAGES_PAGE_SQL, [aiSubspaceOf(input), [...input.sessionIds], input.afterRevision, input.highWatermark, input.limit + 1, input.window]);
  if (result.rows.some((row) => !input.sessionIds.includes(row.target_id))) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync rows must match the named sessions.");
  const pageRows = result.rows.slice(0, input.limit);
  const changes: DomainChange[] = [];
  for (const row of pageRows) {
    const item = row.lifecycle_state === "deleted" ? null : messageDeviceRow(row);
    if (!item) {
      if (!input.window) changes.push({ id: row.record_id, revision: row.sync_revision, operation: "delete", payload: null });
      continue;
    }
    changes.push({ id: row.record_id, revision: row.sync_revision, operation: "upsert", payload: item as unknown as Record<string, unknown> });
  }
  return { changes, hasMore: result.rows.length > input.limit, lastRevision: pageRows.length ? pageRows.at(-1)!.sync_revision : null };
}
