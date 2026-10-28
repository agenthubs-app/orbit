import { createHash } from "node:crypto";

import type { DomainWatermarkSqlClient } from "./domain-watermark";

/**
 * Web change tokens (GET /api/changes): one opaque fingerprint per area of the signed-in person's data, so a
 * page reads an area again only when its token moved (the GitHub notifications / Gmail historyId pattern),
 * instead of re-reading every list on a timer.
 *
 * - Built from watermarks only — max(updated_at) and the live row count of the person's own rows in each
 *   area's collections (a delete lowers the count), the member rows of their conversations (max sync_revision,
 *   which a new message or a read moves) and their iOrbit sessions in the personal sub-workspace. No content.
 * - Every token is a sha256 of (area, actor, workspace, watermarks): it tells nothing about the data, and two
 *   people never share one.
 * - Two indexed statements (the conversation one may be absent where the message tables are not set up).
 */

export const CHANGE_AREAS = ["inbox", "contacts", "tasks", "calendar", "memo", "agent"] as const;
export type ChangeArea = (typeof CHANGE_AREAS)[number];

/** The person's own orbit_records collections each area is drawn from. */
const AREA_COLLECTIONS: Readonly<Record<Exclude<ChangeArea, "agent">, readonly string[]>> = {
  inbox: ["inboxNotifications", "notifications"],
  contacts: ["contacts", "connections", "contact_detail_states", "evidence"],
  tasks: ["tasks", "followups"],
  calendar: ["personal_schedule_items", "personal_schedule_occurrence_exceptions", "tasks"],
  memo: ["notes"],
};
/** iOrbit: the session organizations in the base workspace, the sessions themselves in the personal sub-workspace. */
const AGENT_OWN = ["orbit_agent_chat_session_organizations"];
const AGENT_SUBSPACE = ["orbit_agent_chat_sessions"];

const OWN_COLLECTIONS = [...new Set([...Object.values(AREA_COLLECTIONS).flat(), ...AGENT_OWN])].sort();

const RECORDS_SQL = `
  /* changes:records */
  select collection_name, max(updated_at)::text as max_updated_at, count(*)::text as count
  from orbit_records
  where lifecycle_state <> 'deleted'
    and ((workspace_id = $1 and user_id = $2 and collection_name = any($3::text[]))
      or (workspace_id = $4 and collection_name = any($5::text[])))
  group by collection_name
`;

const MESSAGES_SQL = `
  /* changes:messages */
  select max(sync_revision)::text as max_revision, count(*)::text as count
  from relationship_conversation_members
  where workspace_id = $1 and account_id = $2
`;

export interface ChangeTokenInput {
  client: DomainWatermarkSqlClient;
  workspaceId: string;
  /** orbit_records owner (user_id). */
  actorId: string;
  /** Conversation member id (the account). */
  accountId: string;
  /** The person's iOrbit sub-workspace. */
  agentWorkspaceId: string;
}

export async function readChangeTokens(input: ChangeTokenInput): Promise<Record<ChangeArea, string>> {
  if (!input.workspaceId.trim() || !input.actorId.trim() || !input.accountId.trim()) throw new Error("A workspace and an actor are required for change tokens.");
  const records = await input.client.query<{ collection_name: string; max_updated_at: string | null; count: string }>(
    RECORDS_SQL, [input.workspaceId, input.actorId, OWN_COLLECTIONS, input.agentWorkspaceId, AGENT_SUBSPACE],
  );
  const byCollection = new Map(records.rows.map((row) => [row.collection_name, `${row.max_updated_at ?? ""}/${row.count}`]));
  // The message tables exist only where relationship messages are set up; without them the area keeps its records' token.
  const messages = await input.client.query<{ max_revision: string | null; count: string }>(MESSAGES_SQL, [input.workspaceId, input.accountId])
    .then((result) => `${result.rows[0]?.max_revision ?? ""}/${result.rows[0]?.count ?? "0"}`)
    .catch(() => "none");
  const token = (area: ChangeArea, parts: readonly string[]) => createHash("sha256")
    .update(JSON.stringify([area, input.workspaceId, input.actorId, ...parts]))
    .digest("hex")
    .slice(0, 32);
  const watermarks = (collections: readonly string[]) => collections.map((name) => `${name}=${byCollection.get(name) ?? "-"}`);
  return {
    inbox: token("inbox", [...watermarks(AREA_COLLECTIONS.inbox), `messages=${messages}`]),
    contacts: token("contacts", watermarks(AREA_COLLECTIONS.contacts)),
    tasks: token("tasks", watermarks(AREA_COLLECTIONS.tasks)),
    calendar: token("calendar", watermarks(AREA_COLLECTIONS.calendar)),
    memo: token("memo", watermarks(AREA_COLLECTIONS.memo)),
    agent: token("agent", watermarks([...AGENT_OWN, ...AGENT_SUBSPACE])),
  };
}
