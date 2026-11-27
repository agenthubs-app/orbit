import { createHash } from "node:crypto";

import { normalizeAuthEmail } from "../../auth/contract";
import { acquireSyncCommitOrderLock } from "../../sync/commit-order-lock";
import { derivedOwnerTables } from "../../sync/domain-registry";
import { rotateAuthorizationEpochs } from "../../sync/owner-guard";
import { runInControlledAccountOpsScope } from "../data-rights/purge/local-gate";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { countHostRoles, isHost, maskEmail, resolveControlledAccountTarget, type ControlledAccountTarget } from "./target";

/**
 * Merges an account migrated from party-app (payload.migratedFrom) into the account its owner registered anew
 * (they lost access to the old address). One transaction; a dry run is the same transaction rolled back, so it
 * reports exactly what an apply would do, conflicts included.
 *
 * Rules (mature-product defaults: Slack/Notion style "merge into the surviving account"):
 * - The new account survives. Everything the old account owns moves to it; its sign-in row is archived (not deleted)
 *   with `mergedInto`, so the old address can neither sign in nor be reused, and the merge is traceable.
 * - Profile: the new account's values win; a field empty on the new account is filled from the old one.
 * - An event both accounts joined: the new account's registration stays; the old account's rows for that event stay
 *   on the archived account as history and are listed as conflicts (never overwritten).
 * - Per-account singletons (a record id naming the account, e.g. preferences): the new account's copy wins, the old
 *   one stays on the archived account and is listed.
 * - Kept as history, not moved: audit logs, AI usage ledgers, sign-up funnel, immutable repair/migration ledgers.
 * - Not merged: AI chat sessions (they live in the old account's personal sub-workspace) — counted, left in place.
 * Refused: the old account is not migrated, either account is being deleted, the old account hosts or co-operates an
 * event, or a table holds the old account in a shape this cannot move (fails closed, nothing written).
 */

export const MERGEABLE_MIGRATIONS = ["party-app:chinichi-2026"];
const MERGE_COLLECTION = "account_merges";
/** Stay with the old (archived) account. */
const KEEP_ON_OLD_COLLECTIONS = ["auth_users", "accounts", "profiles", "account_deletion_requests", "account_deletion_locks",
  "account_reauth_receipts", "account_reauth_limits", "account_rights_outbox", "account_purge_steps", "account_exports",
  "account_export_locks", "orbit_agent_chat_session_organizations", MERGE_COLLECTION];
const HISTORY_COLLECTIONS = ["relationship_lifecycle_audits", "relationship_lifecycle_migration_audits"];
const HISTORY_TABLES = ["event_ops_audit_log", "event_event_versions", "ai_usage_ledger", "ai_usage_calls", "signup_funnel_events",
  "event_ops_data_repair_items", "event_ops_data_repair_runs", "event_ops_canonical_membership_migration_events",
  "event_ops_canonical_membership_migration_runs", "relationship_lifecycle_migration_receipts", "event_host_notice_sends"];
/** Messaging threads: identity columns are guarded and the thread id is not the account; not moved here (refused if present). */
const UNSUPPORTED_TABLES = ["relationship_conversations", "relationship_conversation_members", "relationship_messages"];
const ACTOR_COLUMN = /(^|_)(actor|account|user|owner|host|inviter|invitee|redeemer|subject|sender|requester|target|decision|assigned_by|created_by|published_by|invited)(_[a-z]+)*_id$|^used_by$|^undone_by$|^invited_by$|^sent_by$|^user_id$/u;
/** Profile keys never copied across (identity and system state). */
const PROFILE_SYSTEM_KEY = /^(id|accountId|userId|version|createdAt|updatedAt|.*At)$|onboarding|guide|migrat/iu;

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
class DryRunRollback extends Error { constructor(readonly report: AccountMergeReport) { super("DRY_RUN_ROLLBACK"); } }

export interface AccountMergeSide { userId: string; actorId: string; email: string; migrated: string | null }
export interface AccountInventory { records: Record<string, number>; tables: Record<string, number>; aiSessions: number }
export interface AccountMergeReport {
  kind: "dry-run" | "merged" | "already-merged";
  from: { userId: string; actorId: string; email: string };
  to: { userId: string; actorId: string; email: string };
  before?: { from: AccountInventory; to: AccountInventory };
  moved?: {
    records: Record<string, number>;
    payloadReferencesRewritten: Record<string, number>;
    tables: Record<string, number>;
    republishedResults: number;
    profileFieldsFilled: string[];
  };
  conflicts?: { events: string[]; singletonRecords: Record<string, number> };
  keptAsHistory?: Record<string, number>;
  notMerged?: { aiSessions: number };
  /** After the move: what still names the old account (history, conflicts, JSON mentions outside known shapes). */
  remainingOnOld?: { records: Record<string, number>; tables: Record<string, number>; jsonMentions: Record<string, number> };
  mergedAt?: string;
}

function replaceDeep(value: unknown, map: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item, map));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceDeep(item, map)]));
  return value;
}
const isEmpty = (value: unknown) => value === undefined || value === null || value === "" ||
  (Array.isArray(value) && value.length === 0) || (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);
const parse = (value: unknown) => (typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : (value ?? {}) as Record<string, unknown>);

/** New wins; a field empty on the new profile is taken from the old one (one level into objects such as handles). */
export function mergeProfilePayload(next: Record<string, unknown>, old: Record<string, unknown>): { payload: Record<string, unknown>; filled: string[] } {
  const payload: Record<string, unknown> = { ...next };
  const filled: string[] = [];
  for (const [key, value] of Object.entries(old)) {
    if (PROFILE_SYSTEM_KEY.test(key) || isEmpty(value)) continue;
    const current = payload[key];
    if (isEmpty(current)) { payload[key] = value; filled.push(key); continue; }
    if (current && typeof current === "object" && !Array.isArray(current) && value && typeof value === "object" && !Array.isArray(value)) {
      const inner: Record<string, unknown> = { ...(current as Record<string, unknown>) };
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (!isEmpty(innerValue) && isEmpty(inner[innerKey])) { inner[innerKey] = innerValue; filled.push(`${key}.${innerKey}`); }
      }
      payload[key] = inner;
    }
  }
  return { payload, filled };
}

interface ActorColumnTable { table: string; columns: string[]; hasEvent: boolean; insertColumns: string[] }

async function actorTables(sql: TransactionalSqlExecutor): Promise<ActorColumnTable[]> {
  const columns = await sql.query<{ table_name: string; column_name: string; data_type: string; generated: boolean }>(`select c.table_name,c.column_name,c.data_type,
      (c.is_generated='ALWAYS' or c.identity_generation='ALWAYS') as generated
    from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
    where c.table_schema=current_schema() and t.table_type='BASE TABLE' and c.table_name<>'orbit_records' order by c.table_name,c.ordinal_position`);
  const byTable = new Map<string, typeof columns.rows>();
  for (const row of columns.rows) byTable.set(row.table_name, [...(byTable.get(row.table_name) ?? []), row]);
  const tables: ActorColumnTable[] = [];
  for (const [table, rows] of byTable) {
    if (!rows.some((row) => row.column_name === "workspace_id")) continue;
    const actorColumns = rows.filter((row) => ACTOR_COLUMN.test(row.column_name) && ["text", "character varying"].includes(row.data_type)).map((row) => row.column_name);
    if (!actorColumns.length) continue;
    tables.push({ table, columns: actorColumns,
      hasEvent: rows.some((row) => row.column_name === "event_id"), insertColumns: rows.filter((row) => !row.generated).map((row) => row.column_name) });
  }
  return tables;
}

/**
 * Tables whose account column is part of a foreign key (either side), or a guarded derived owner table: these
 * cannot be updated in place (the key would break, or the sync owner guard refuses), so their rows are taken out
 * child-first and put back parent-first with the new account.
 */
async function fkActorTables(sql: TransactionalSqlExecutor, tables: readonly ActorColumnTable[]): Promise<Set<string>> {
  const keys = await sql.query<{ child: string; parent: string; child_columns: string[]; parent_columns: string[] }>(`select conrelid::regclass::text as child,
      confrelid::regclass::text as parent,
      array(select attname::text from pg_attribute where attrelid=conrelid and attnum=any(conkey)) as child_columns,
      array(select attname::text from pg_attribute where attrelid=confrelid and attnum=any(confkey)) as parent_columns
    from pg_constraint where contype='f' and connamespace=current_schema()::regnamespace`);
  const columnsOf = new Map(tables.map((entry) => [entry.table, entry.columns]));
  const result = new Set<string>(derivedOwnerTables().map((entry) => entry.table));
  for (const key of keys.rows) {
    if (key.child_columns.some((column) => columnsOf.get(key.child)?.includes(column))) result.add(key.child);
    if (key.parent_columns.some((column) => columnsOf.get(key.parent)?.includes(column))) result.add(key.parent);
  }
  return result;
}

/** Parent-first order of the given tables (by foreign keys among them). */
async function parentFirst(sql: TransactionalSqlExecutor, tables: readonly string[]): Promise<string[]> {
  const edges = await sql.query<{ child: string; parent: string }>(`select conrelid::regclass::text as child, confrelid::regclass::text as parent
    from pg_constraint where contype='f' and connamespace=current_schema()::regnamespace`);
  const set = new Set(tables);
  const parents = new Map<string, Set<string>>();
  for (const edge of edges.rows) if (set.has(edge.child) && set.has(edge.parent) && edge.child !== edge.parent) {
    parents.set(edge.child, new Set([...(parents.get(edge.child) ?? []), edge.parent]));
  }
  const ordered: string[] = [];
  const visit = (table: string, path: Set<string>) => {
    if (ordered.includes(table) || path.has(table)) return;
    for (const parent of parents.get(table) ?? []) visit(parent, new Set([...path, table]));
    ordered.push(table);
  };
  for (const table of [...tables].sort()) visit(table, new Set());
  return ordered;
}

async function inventory(sql: TransactionalSqlExecutor, workspaceId: string, ids: readonly string[], tables: readonly ActorColumnTable[], actorId: string): Promise<AccountInventory> {
  const records = await sql.query<{ collection_name: string; n: number }>(`select collection_name,count(*)::int as n from orbit_records
    where workspace_id=$1 and user_id=any($2::text[]) and lifecycle_state<>'deleted' group by 1 order by 1`, [workspaceId, ids]);
  const tableCounts: Record<string, number> = {};
  for (const entry of tables) {
    const result = await sql.query<{ n: number }>(`select count(*)::int as n from ${quote(entry.table)} where workspace_id=$1 and (${
      entry.columns.map((column) => `${quote(column)}=any($2::text[])`).join(" or ")})`, [workspaceId, ids]);
    const n = result.rows[0]?.n ?? 0;
    if (n) tableCounts[entry.table] = n;
  }
  const ai = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id=$1`, [`${workspaceId}:actor:${encodeURIComponent(actorId)}`]);
  return { records: Object.fromEntries(records.rows.map((row) => [row.collection_name, row.n])), tables: tableCounts, aiSessions: ai.rows[0]?.n ?? 0 };
}

async function resolveSide(sql: TransactionalSqlExecutor, workspaceId: string, key: string): Promise<AccountMergeSide & ControlledAccountTarget> {
  let email = key.includes("@") ? normalizeAuthEmail(key) : null;
  if (!email) {
    const found = await sql.query<{ email: string }>(`select payload->>'email' as email from orbit_records where workspace_id=$1
      and collection_name='auth_users' and payload->>'id'=$2`, [workspaceId, key]);
    if (found.rows.length !== 1) throw new Error("MERGE_ACCOUNT_NOT_FOUND");
    email = normalizeAuthEmail(found.rows[0]!.email);
  }
  const target = await resolveControlledAccountTarget(sql, workspaceId, { email, ...(key.includes("@") ? {} : { userId: key }) });
  const auth = await sql.query<{ migrated: string | null; deletion: boolean }>(`select payload->>'migratedFrom' as migrated,
    coalesce(payload->>'deletionRequestedAt','')<>'' as deletion from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2`,
  [workspaceId, target.authRecordId]);
  if (auth.rows[0]?.deletion) throw new Error("MERGE_ACCOUNT_BEING_DELETED");
  return { ...target, migrated: auth.rows[0]?.migrated ?? null };
}

async function republishResults(sql: TransactionalSqlExecutor, workspaceId: string, eventIds: readonly string[], map: ReadonlyMap<string, string>): Promise<number> {
  const olds = [...map.keys()];
  let republished = 0;
  for (const eventId of eventIds) {
    const head = await sql.query<{ publication_id: string; generation_id: string }>(`select publication_id,generation_id from event_ops_publication_heads
      where workspace_id=$1 and event_id=$2 for update`, [workspaceId, eventId]);
    const current = head.rows[0];
    if (!current) continue;
    const publication = await sql.query<{ published_dto: unknown }>(`select published_dto from event_ops_publications where workspace_id=$1 and publication_id=$2`,
      [workspaceId, current.publication_id]);
    const dto = parse(publication.rows[0]?.published_dto);
    const text = JSON.stringify(dto);
    if (!olds.some((id) => text.includes(JSON.stringify(id)))) continue;
    const next = replaceDeep(dto, map);
    // Same pattern as the data-rights purge (§R18c-7): a new immutable snapshot and an advanced head; the old one stays.
    const suffix = sha(`${current.publication_id}\0merge\0${olds.join(",")}`).slice(0, 24);
    const generationId = `merge-gen:${suffix}`;
    const publicationId = `merge-pub:${suffix}`;
    await sql.query(`update event_ops_generations set status='superseded',revision=revision+1,updated_at=now()
      where workspace_id=$1 and generation_id=$2 and status='published'`, [workspaceId, current.generation_id]);
    await sql.query(`insert into event_ops_generations(workspace_id,generation_id,event_id,organizer_actor_id,idempotency_key,
        configuration_version,snapshot_hash,status,expected_task_count,completed_at,published_at,revision,created_at,updated_at,ai_request_fingerprint)
      select workspace_id,$3,event_id,organizer_actor_id,$4,configuration_version,snapshot_hash,'published',
        expected_task_count,completed_at,now(),1,now(),now(),ai_request_fingerprint from event_ops_generations
      where workspace_id=$1 and generation_id=$2`, [workspaceId, current.generation_id, generationId, `merge:${suffix}`]);
    await sql.query(`insert into event_ops_publications(workspace_id,publication_id,event_id,generation_id,snapshot_hash,dto_hash,published_dto,published_by_actor_id,published_at)
      select workspace_id,$3,event_id,$4,snapshot_hash,$5,$6::jsonb,published_by_actor_id,now() from event_ops_publications where workspace_id=$1 and publication_id=$2`,
    [workspaceId, current.publication_id, publicationId, generationId, sha(JSON.stringify(next)), JSON.stringify(next)]);
    const nodes = await sql.query<{ participant_id: string; node_payload: unknown }>(`select participant_id,node_payload from event_ops_graph_nodes
      where workspace_id=$1 and publication_id=$2`, [workspaceId, current.publication_id]);
    for (const node of nodes.rows) {
      await sql.query(`insert into event_ops_graph_nodes(workspace_id,publication_id,participant_id,node_payload) values($1,$2,$3,$4::jsonb)`,
        [workspaceId, publicationId, node.participant_id, JSON.stringify(replaceDeep(parse(node.node_payload), map))]);
    }
    const edges = await sql.query<{ edge_id: string; from_participant_id: string; to_participant_id: string; edge_kind: string; label: string; edge_payload: unknown }>(
      `select edge_id,from_participant_id,to_participant_id,edge_kind,label,edge_payload from event_ops_graph_edges where workspace_id=$1 and publication_id=$2`,
      [workspaceId, current.publication_id]);
    for (const edge of edges.rows) {
      await sql.query(`insert into event_ops_graph_edges(workspace_id,publication_id,edge_id,from_participant_id,to_participant_id,edge_kind,label,edge_payload)
        values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [workspaceId, publicationId, edge.edge_id, edge.from_participant_id, edge.to_participant_id,
        edge.edge_kind, edge.label, JSON.stringify(replaceDeep(parse(edge.edge_payload), map))]);
    }
    await sql.query(`update event_ops_publication_heads set publication_id=$3,generation_id=$4,revision=revision+1,updated_at=now()
      where workspace_id=$1 and event_id=$2 and publication_id=$5`, [workspaceId, eventId, publicationId, generationId, current.publication_id]);
    republished += 1;
  }
  return republished;
}

async function mergeInTransaction(sql: TransactionalSqlExecutor, workspaceId: string, fromKey: string, toKey: string, apply: boolean, at: string): Promise<AccountMergeReport> {
  // A finished merge archived the old sign-in row, so look it up by email or id in any state first (idempotent rerun).
  const previous = await sql.query<{ id: string; email: string }>(`select payload->>'id' as id,payload->>'email' as email from orbit_records
    where workspace_id=$1 and collection_name='auth_users' and (record_id=$2 or payload->>'id'=$3)`,
  [workspaceId, `auth_user:${normalizeAuthEmail(fromKey)}`, fromKey]);
  if (previous.rows.length === 1) {
    const done = await sql.query<{ payload: unknown }>(`select payload from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3`,
      [workspaceId, MERGE_COLLECTION, `merge:${sha(previous.rows[0]!.id)}`]);
    if (done.rows[0]) {
      const record = parse(done.rows[0].payload);
      const to = await resolveSide(sql, workspaceId, toKey);
      if (record.toUserId !== to.userId) throw new Error("MERGE_SOURCE_ALREADY_MERGED_ELSEWHERE");
      return { kind: "already-merged", from: { userId: String(record.fromUserId), actorId: String(record.fromActorId), email: maskEmail(previous.rows[0]!.email) },
        to: { userId: to.userId, actorId: to.actorId, email: maskEmail(to.email) }, mergedAt: String(record.mergedAt ?? "") };
    }
  }
  const from = await resolveSide(sql, workspaceId, fromKey);
  const to = await resolveSide(sql, workspaceId, toKey);
  const masked = { from: { userId: from.userId, actorId: from.actorId, email: maskEmail(from.email) }, to: { userId: to.userId, actorId: to.actorId, email: maskEmail(to.email) } };
  if (from.userId === to.userId || from.actorId === to.actorId) throw new Error("MERGE_SAME_ACCOUNT");
  if (!from.migrated || !MERGEABLE_MIGRATIONS.includes(from.migrated)) throw new Error("MERGE_SOURCE_NOT_MIGRATED");
  const target = await sql.query<{ merged: string | null }>(`select payload->>'mergedInto' as merged from orbit_records where workspace_id=$1
    and collection_name='auth_users' and record_id=$2`, [workspaceId, to.authRecordId]);
  if (target.rows[0]?.merged) throw new Error("MERGE_TARGET_WAS_MERGED_AWAY");
  if (isHost(await countHostRoles(sql, workspaceId, [from.userId, from.actorId]))) throw new Error("MERGE_SOURCE_IS_EVENT_HOST_OR_COHOST");

  await acquireSyncCommitOrderLock(sql);
  const map = new Map<string, string>([[from.actorId, to.actorId], [from.userId, to.userId]]);
  const olds = [...map.keys()];
  // Statement parameters: $1 workspace, $2 old ids, $3 conflict events, then (old, new) pairs from $4.
  const newOf = (column: string) => `case ${quote(column)} ${[...map].map((_, index) => `when $${4 + index * 2} then $${5 + index * 2}`).join(" ")} else ${quote(column)} end`;
  const mapValues = [...map].flatMap(([oldId, newId]) => [oldId, newId]);
  const tables = await actorTables(sql);
  const before = { from: await inventory(sql, workspaceId, olds, tables, from.actorId), to: await inventory(sql, workspaceId, [to.userId, to.actorId], tables, to.actorId) };

  const unsupported = Object.keys(before.from.tables).filter((table) => UNSUPPORTED_TABLES.includes(table));
  if (unsupported.length) throw new Error(`MERGE_UNSUPPORTED_DATA:${unsupported.join(",")}`);

  // Events both accounts joined: the new account's rows stay current; the old account's rows for them stay as history.
  const conflictEvents = (await sql.query<{ event_id: string }>(`select distinct o.event_id from (
      select event_id,actor_id from event_ops_membership_heads where workspace_id=$1
      union all select event_id,actor_id from event_ops_admission_application_heads where workspace_id=$1
      union all select event_id,actor_id from event_ops_profile_heads where workspace_id=$1) o
    join (select event_id,actor_id from event_ops_membership_heads where workspace_id=$1
      union all select event_id,actor_id from event_ops_admission_application_heads where workspace_id=$1
      union all select event_id,actor_id from event_ops_profile_heads where workspace_id=$1) n on n.event_id=o.event_id
    where o.actor_id=any($2::text[]) and n.actor_id=any($3::text[]) order by 1`, [workspaceId, olds, [to.actorId, to.userId]])).rows.map((row) => row.event_id);
  const fromEvents = (await sql.query<{ event_id: string }>(`select distinct event_id from event_ops_membership_heads where workspace_id=$1 and actor_id=any($2::text[])
    union select distinct event_id from event_ops_profile_heads where workspace_id=$1 and actor_id=any($2::text[])`, [workspaceId, olds])).rows
    .map((row) => row.event_id).filter((eventId) => !conflictEvents.includes(eventId));

  // 1. Dedicated tables. Keyed (the account is part of a unique key): copy parent-first, re-point the rest, delete child-first.
  const movable = tables.filter((entry) => !HISTORY_TABLES.includes(entry.table) && before.from.tables[entry.table]);
  const eventFilter = (entry: ActorColumnTable, alias = "") => entry.hasEvent ? ` and not (${alias}event_id = any($3::text[]))` : " and $3::text[] is not null";
  const where = (entry: ActorColumnTable, alias = "") => `${alias}workspace_id=$1 and (${entry.columns.map((column) => `${alias}${quote(column)}=any($2::text[])`).join(" or ")})${eventFilter(entry, alias)}`;
  const whereParams = [workspaceId, olds, conflictEvents];
  const params = [...whereParams, ...mapValues];
  const movedTables: Record<string, number> = {};
  const linked = await fkActorTables(sql, tables);
  const guardedHeads = new Set(derivedOwnerTables().map((entry) => entry.table));
  const relinked = await parentFirst(sql, movable.filter((entry) => linked.has(entry.table)).map((entry) => entry.table));
  const taken = new Map<string, Record<string, unknown>[]>();
  for (const name of [...relinked].reverse()) {
    const entry = movable.find((item) => item.table === name)!;
    const rows = await sql.query<{ row: Record<string, unknown> }>(`delete from ${quote(name)} t where ${where(entry, "t.")} returning to_jsonb(t) as row`, whereParams);
    taken.set(name, rows.rows.map((item) => item.row));
  }
  for (const name of relinked) {
    const entry = movable.find((item) => item.table === name)!;
    for (const row of taken.get(name) ?? []) {
      const next = { ...row };
      for (const column of entry.columns) if (typeof next[column] === "string" && map.has(next[column] as string)) next[column] = map.get(next[column] as string);
      // A guarded head is a new row for the new owner's devices: advance its revision like the product's own moves.
      if (guardedHeads.has(name) && next.revision !== undefined && next.revision !== null) next.revision = Number(next.revision) + 1;
      await sql.query(`insert into ${quote(name)} (${entry.insertColumns.map(quote).join(",")})
        select ${entry.insertColumns.map((column) => `r.${quote(column)}`).join(",")} from jsonb_populate_record(null::${quote(name)}, $1::jsonb) r`, [JSON.stringify(next)]);
    }
    movedTables[name] = taken.get(name)?.length ?? 0;
  }
  for (const entry of movable.filter((item) => !linked.has(item.table))) {
    const updated = await sql.query<{ n: number }>(`with changed as (update ${quote(entry.table)} set ${
      entry.columns.map((column) => `${quote(column)}=${newOf(column)}`).join(",")} where ${where(entry)} returning 1) select count(*)::int as n from changed`, params);
    movedTables[entry.table] = updated.rows[0]?.n ?? 0;
  }

  // 2. Matching results published with the old account's id: a new snapshot naming the new account.
  const republishedResults = fromEvents.length ? await republishResults(sql, workspaceId, fromEvents, map) : 0;

  // 3. orbit_records the old account owns: moved (delete + insert keeps the sync owner guard satisfied).
  const owned = await sql.query<{ row: Record<string, unknown> }>(`select to_jsonb(o) as row from orbit_records o where workspace_id=$1
    and user_id=any($2::text[]) and collection_name<>all($3::text[]) and lifecycle_state<>'deleted' order by collection_name,record_id`,
  [workspaceId, olds, [...KEEP_ON_OLD_COLLECTIONS, ...HISTORY_COLLECTIONS]]);
  const movedRecords: Record<string, number> = {};
  const singletonConflicts: Record<string, number> = {};
  for (const { row } of owned.rows) {
    const collection = String(row.collection_name);
    const recordId = String(row.record_id);
    let nextId = recordId;
    for (const [oldId, newId] of map) nextId = nextId.split(oldId).join(newId);
    const payload = replaceDeep(parse(row.payload), map) as Record<string, unknown>;
    // Event-scoped personal records for a conflict event stay with the old account.
    const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
    if (eventId && conflictEvents.includes(eventId)) { singletonConflicts[collection] = (singletonConflicts[collection] ?? 0) + 1; continue; }
    if (nextId !== recordId) {
      const taken = await sql.query(`select 1 from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3`, [workspaceId, collection, nextId]);
      if (taken.rows.length) { singletonConflicts[collection] = (singletonConflicts[collection] ?? 0) + 1; continue; }
    }
    await sql.query(`delete from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3`, [workspaceId, collection, recordId]);
    const owner = map.get(String(row.user_id)) ?? String(row.user_id);
    await sql.query(`insert into orbit_records select (jsonb_populate_record(null::orbit_records, $1::jsonb)).*`,
      [JSON.stringify({ ...row, record_id: nextId, user_id: owner, payload, updated_at: at })]);
    movedRecords[collection] = (movedRecords[collection] ?? 0) + 1;
  }

  // 4. Other records that name the old account inside their payload (registrations, links, introductions, …).
  const mentions = await sql.query<{ collection_name: string; record_id: string; payload: unknown }>(`select collection_name,record_id,payload from orbit_records
    where workspace_id=$1 and collection_name<>all($2::text[]) and (user_id is null or user_id<>all($3::text[]))
    and (${olds.map((_, index) => `position(to_jsonb($${4 + index}::text)::text in payload::text)>0`).join(" or ")}) for update`,
  [workspaceId, [...KEEP_ON_OLD_COLLECTIONS, ...HISTORY_COLLECTIONS], olds, ...olds]);
  const rewritten: Record<string, number> = {};
  for (const row of mentions.rows) {
    const current = parse(row.payload);
    const eventId = typeof current.eventId === "string" ? current.eventId
      : typeof (current.registration as Record<string, unknown> | undefined)?.eventId === "string" ? String((current.registration as Record<string, unknown>).eventId) : null;
    if (eventId && conflictEvents.includes(eventId)) continue;
    await sql.query(`update orbit_records set payload=$4::jsonb,updated_at=$5::timestamptz where workspace_id=$1 and collection_name=$2 and record_id=$3`,
      [workspaceId, row.collection_name, row.record_id, JSON.stringify(replaceDeep(current, map)), at]);
    rewritten[row.collection_name] = (rewritten[row.collection_name] ?? 0) + 1;
  }

  // 5. Profile: new wins, blanks filled from the old one.
  const profiles = await sql.query<{ record_id: string; user_id: string; payload: unknown }>(`select record_id,user_id,payload from orbit_records where workspace_id=$1
    and collection_name='profiles' and lifecycle_state<>'deleted' and (payload->>'id'=any($2::text[])) for update`, [workspaceId, [from.userId, to.userId]]);
  const oldProfile = profiles.rows.find((row) => parse(row.payload).id === from.userId);
  const newProfile = profiles.rows.find((row) => parse(row.payload).id === to.userId);
  let profileFieldsFilled: string[] = [];
  if (oldProfile && newProfile) {
    const merged = mergeProfilePayload(parse(newProfile.payload), parse(oldProfile.payload));
    profileFieldsFilled = merged.filled;
    if (merged.filled.length) {
      await sql.query(`update orbit_records set payload=$4::jsonb,updated_at=$5::timestamptz where workspace_id=$1 and collection_name='profiles' and record_id=$2 and user_id=$3`,
        [workspaceId, newProfile.record_id, newProfile.user_id, JSON.stringify({ ...merged.payload, updatedAt: at }), at]);
    }
  }

  // 6. The old account: archived, pointing at the survivor; its devices rebuild.
  const archived = await sql.query(`update orbit_records set lifecycle_state='archived',updated_at=$4::timestamptz,
      payload=(payload - 'passwordReset' - 'emailVerification') || jsonb_build_object('mergedInto',$3::text,'mergedAt',$4::text)
    where workspace_id=$1 and collection_name='auth_users' and record_id=$2 and lifecycle_state='active' returning record_id`,
  [workspaceId, from.authRecordId, to.userId, at]);
  if (archived.rows.length !== 1) throw new Error("MERGE_SOURCE_IDENTITY_CHANGED");
  if (oldProfile) {
    await sql.query(`update orbit_records set lifecycle_state='archived',updated_at=$3::timestamptz,payload=payload||jsonb_build_object('mergedInto',$4::text)
      where workspace_id=$1 and collection_name='profiles' and record_id=$2`, [workspaceId, oldProfile.record_id, at, to.actorId]);
  }
  await rotateAuthorizationEpochs(sql, workspaceId, [from.actorId, to.actorId]);

  // 7. What still names the old account.
  const remainingInventory = await inventory(sql, workspaceId, olds, tables, from.actorId);
  const jsonMentions: Record<string, number> = {};
  const jsonColumns = await sql.query<{ table_name: string; column_name: string }>(`select c.table_name,c.column_name from information_schema.columns c
    join information_schema.columns w on w.table_schema=c.table_schema and w.table_name=c.table_name and w.column_name='workspace_id'
    where c.table_schema=current_schema() and c.data_type='jsonb' and c.table_name<>'orbit_records'`);
  for (const column of jsonColumns.rows) {
    if (HISTORY_TABLES.includes(column.table_name)) continue;
    const found = await sql.query<{ n: number }>(`select count(*)::int as n from ${quote(column.table_name)} where workspace_id=$1 and
      (${olds.map((_, index) => `position(to_jsonb($${2 + index}::text)::text in ${quote(column.column_name)}::text)>0`).join(" or ")})`, [workspaceId, ...olds]);
    if (found.rows[0]?.n) jsonMentions[`${column.table_name}.${column.column_name}`] = found.rows[0].n;
  }
  const keptAsHistory = Object.fromEntries(Object.entries(remainingInventory.tables).filter(([table]) => HISTORY_TABLES.includes(table)));

  const report: AccountMergeReport = {
    kind: apply ? "merged" : "dry-run", ...masked, before,
    moved: { records: movedRecords, payloadReferencesRewritten: rewritten, tables: movedTables, republishedResults, profileFieldsFilled },
    conflicts: { events: conflictEvents, singletonRecords: singletonConflicts },
    keptAsHistory, notMerged: { aiSessions: before.from.aiSessions },
    remainingOnOld: { records: remainingInventory.records, tables: remainingInventory.tables, jsonMentions },
    mergedAt: at,
  };
  // 8. The trace (also the idempotency key: a second run finds it and does nothing).
  await sql.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
    values($1,$2,$3,null,'account-ops',$3,$4::jsonb,$5,$5)`, [workspaceId, MERGE_COLLECTION, `merge:${sha(from.userId)}`, JSON.stringify({
    fromUserId: from.userId, fromActorId: from.actorId, toUserId: to.userId, toActorId: to.actorId, mergedAt: at, operator: "controlled-account-ops",
    moved: report.moved, conflicts: report.conflicts, keptAsHistory, notMerged: report.notMerged }), at]);
  if (!apply) throw new DryRunRollback(report);
  return report;
}

/**
 * `from` / `to`: an email or a sign-in user id. Dry run (the full merge, rolled back) unless `apply` is exactly true.
 * Output names accounts by id and masked email only.
 */
export function runControlledAccountMerge(input: {
  db: TransactionalPostgresClient; workspaceId: string; from: string; to: string; apply?: boolean; now?: () => Date;
}): Promise<AccountMergeReport> {
  return runInControlledAccountOpsScope(async () => {
    if (!input.from?.trim() || !input.to?.trim()) throw new Error("MERGE_ACCOUNTS_REQUIRED");
    const at = (input.now ?? (() => new Date()))().toISOString();
    try {
      return await input.db.transaction((sql) => mergeInTransaction(sql, input.workspaceId, input.from.trim(), input.to.trim(), input.apply === true, at),
        { isolation: "serializable" });
    } catch (error) {
      if (error instanceof DryRunRollback) return error.report;
      throw error;
    }
  });
}
