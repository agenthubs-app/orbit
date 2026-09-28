import { createHash } from "node:crypto";
import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";

import { defaultMockFixtures } from "../../shared/mock/fixtures";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import { acquireSyncCommitOrderLock, isSyncCollection } from "./commit-order-lock";
import { findSyncOwnerChangeHandler, ownerGuardedCollections } from "./domain-registry";
import { SYNC_OWNER_CHANGE_SETTING } from "./owner-guard";

/**
 * Sprint 0114 (offline design step 8, decisions 2-4): give the contact rows
 * that sprint 0116 sends to devices an owner.
 *
 *   contacts               payload.accountId; else the one owner of the
 *                          connections that point to it; else the demo account
 *                          that generated it
 *   connections            the owner of its contact (payload.accountId must
 *                          agree); else payload.accountId; else the generator
 *   contact_detail_states  payload.actorId (the record id carries it); the
 *                          contact's owner must agree
 *   evidence (sources)     the owner(s) of the records that cite it. Live
 *                          references first, deleted ones only when no live
 *                          reference has an owner. Several owners: the owner
 *                          whose references cannot be re-pointed (or else the
 *                          lexically first) keeps the row, every other owner
 *                          gets a copy with a new id and its own references
 *                          are re-pointed to it. Cited only by platform public
 *                          data: left as is. No live citer with an owner
 *                          (orphans, sources cited only by deleted rows or by
 *                          owner-less demo rows): listed and left, unless
 *                          assignGeneratedSources, which gives it a deleted
 *                          citer's owner, else the demo account that generated
 *                          it. Owning such rows adds them to every owned-source
 *                          read (follow-ups, reminders, bootstrap) for nothing a
 *                          device receives, so that is an explicit choice.
 *
 * Anything else is listed as unresolvable and never guessed. An existing owner
 * never changes, so every owner write is guarded by `user_id is null`: this is
 * the registered first-owner handler "owner-backfill-0114"
 * (SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS), which the database guard does not
 * open for anything.
 */
export const OWNER_BACKFILL_HANDLER = "owner-backfill-0114";

export const OWNER_BACKFILL_COLLECTIONS = ["contacts", "connections", "contact_detail_states", "evidence"] as const;
type BackfillCollection = (typeof OWNER_BACKFILL_COLLECTIONS)[number];

/** Rows whose evidence references the backfill may re-point to a per-owner copy. */
const REPOINTABLE_COLLECTIONS: ReadonlySet<string> = new Set(["contacts", "connections", "contact_detail_states"]);

/**
 * Platform public / algorithm data: nobody's personal data, never backfilled.
 * A source cited only by these rows is part of it.
 */
export const PLATFORM_PUBLIC_COLLECTIONS: readonly string[] = [
  "attendees",
  "eventParticipantIntents",
  "networkPeople",
  "matchRecommendations",
  "personRelationshipEdges",
  "recommendationTests",
  "aiAnalyses",
];

/** provider → the demo account that generated its rows (the seed's own fallback owner). */
export const GENERATED_DATA_OWNERS: Readonly<Record<string, string>> = Object.freeze(
  defaultMockFixtures.accounts[0]?.id ? { "generated-relationship-fixtures": defaultMockFixtures.accounts[0].id } : {},
);

export function ownerBackfillCopyId(sourceRecordId: string, owner: string): string {
  return `${sourceRecordId}~owner-${createHash("sha256").update(owner).digest("hex").slice(0, 12)}`;
}

export type OwnerBackfillMode = "dry-run" | "preview" | "apply";

export interface OwnerBackfillAssignment { collectionName: BackfillCollection; recordId: string; owner: string; rule: string; deleted: boolean }
export interface OwnerBackfillRef { collectionName: string; recordId: string }
export interface OwnerBackfillCopy { sourceRecordId: string; copyRecordId: string; owner: string; existing: boolean; repoints: OwnerBackfillRef[] }
export interface OwnerBackfillListed { collectionName: string; recordId: string; reason: string }
export interface OwnerBackfillCollectionCounts {
  total: number;
  ownerlessBefore: number;
  assigned: number;
  copied: number;
  skipped: number;
  unresolvable: number;
  ownerlessAfter: number;
  byRule: Record<string, number>;
}

export interface OwnerBackfillPlan {
  assignments: OwnerBackfillAssignment[];
  copies: OwnerBackfillCopy[];
  skipped: OwnerBackfillListed[];
  unresolvable: OwnerBackfillListed[];
  counts: Record<BackfillCollection, OwnerBackfillCollectionCounts>;
}

export interface OwnerBackfillResult extends OwnerBackfillPlan {
  mode: OwnerBackfillMode;
  workspaceId: string;
  backup?: { path: string; rows: number; bytes: number };
  applied?: { assigned: number; copied: number; repointed: number };
  /** Apply only: the plan recomputed after the writes, in the same transaction, has nothing left to do. */
  verified?: boolean;
}

interface ScopeRow {
  collectionName: BackfillCollection;
  recordId: string;
  owner: string | null;
  deleted: boolean;
  provider: string | null;
  accountId: string | null;
  contactId: string | null;
  actorId: string | null;
  refs: string[];
}

interface ReferencingRow { collectionName: string; recordId: string; owner: string | null; deleted: boolean; refs: string[] }

/** Evidence ids a row cites: the envelope column, payload.evidenceIds and payload.nextAction.evidenceId. */
const REFS_SQL = `array(
  select distinct ref from (
    select unnest(r.evidence_ids) as ref
    union all select jsonb_array_elements_text(case when jsonb_typeof(r.payload->'evidenceIds') = 'array' then r.payload->'evidenceIds' else '[]'::jsonb end)
    union all select r.payload->'nextAction'->>'evidenceId' where jsonb_typeof(r.payload->'nextAction'->'evidenceId') = 'string'
  ) cited where ref is not null and ref <> ''
)`;

async function readRows(executor: TransactionalSqlExecutor, workspaceId: string): Promise<{ scope: ScopeRow[]; referencing: ReferencingRow[] }> {
  const scope = await executor.query<{
    collection_name: BackfillCollection; record_id: string; user_id: string | null; lifecycle_state: string; provider: string | null;
    account_id: string | null; contact_id: string | null; actor_id: string | null; refs: string[];
  }>(
    `select r.collection_name, r.record_id, nullif(r.user_id, '') as user_id, r.lifecycle_state, r.provider,
        r.payload->>'accountId' as account_id, r.payload->>'contactId' as contact_id, r.payload->>'actorId' as actor_id,
        ${REFS_SQL} as refs
       from orbit_records r
      where r.workspace_id = $1 and r.collection_name = any($2::text[])`,
    [workspaceId, [...OWNER_BACKFILL_COLLECTIONS]],
  );
  const referencing = await executor.query<{ collection_name: string; record_id: string; user_id: string | null; lifecycle_state: string; refs: string[] }>(
    `with sources as (
        select coalesce(array_agg(record_id), '{}') as ids from orbit_records where workspace_id = $1 and collection_name = 'evidence'
      ), cited as (
        select r.collection_name, r.record_id, nullif(r.user_id, '') as user_id, r.lifecycle_state, ${REFS_SQL} as refs
          from orbit_records r
         where r.workspace_id = $1 and r.collection_name <> all($2::text[])
      )
      select cited.* from cited, sources where cited.refs && sources.ids`,
    [workspaceId, [...OWNER_BACKFILL_COLLECTIONS]],
  );
  return {
    scope: scope.rows.map((row) => ({
      collectionName: row.collection_name, recordId: row.record_id, owner: row.user_id, deleted: row.lifecycle_state === "deleted",
      provider: row.provider, accountId: row.account_id || null, contactId: row.contact_id || null, actorId: row.actor_id || null, refs: row.refs ?? [],
    })),
    referencing: referencing.rows.map((row) => ({
      collectionName: row.collection_name, recordId: row.record_id, owner: row.user_id, deleted: row.lifecycle_state === "deleted", refs: row.refs ?? [],
    })),
  };
}

const key = (collectionName: string, recordId: string) => `${collectionName}\u0000${recordId}`;
const lexical = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

export function planOwnerBackfill(input: { scope: readonly ScopeRow[]; referencing: readonly ReferencingRow[]; assignGeneratedSources?: boolean }): OwnerBackfillPlan {
  const assignments: OwnerBackfillAssignment[] = [];
  const copies: OwnerBackfillCopy[] = [];
  const skipped: OwnerBackfillListed[] = [];
  const unresolvable: OwnerBackfillListed[] = [];
  const owner = new Map<string, string>();
  for (const row of input.scope) if (row.owner) owner.set(key(row.collectionName, row.recordId), row.owner);
  const assign = (row: ScopeRow, value: string, rule: string) => {
    assignments.push({ collectionName: row.collectionName, recordId: row.recordId, owner: value, rule, deleted: row.deleted });
    owner.set(key(row.collectionName, row.recordId), value);
  };
  const unresolved = (row: { collectionName: string; recordId: string }, reason: string) => unresolvable.push({ collectionName: row.collectionName, recordId: row.recordId, reason });
  const generator = (row: ScopeRow) => (row.provider ? GENERATED_DATA_OWNERS[row.provider] : undefined);
  const byCollection = (name: BackfillCollection) => input.scope.filter((row) => row.collectionName === name);

  // Contacts.
  const connectionOwnersByContact = new Map<string, Set<string>>();
  for (const row of byCollection("connections")) {
    const value = row.owner ?? row.accountId;
    if (!row.contactId || !value || row.deleted) continue;
    connectionOwnersByContact.set(row.contactId, (connectionOwnersByContact.get(row.contactId) ?? new Set()).add(value));
  }
  for (const row of byCollection("contacts")) {
    if (row.owner) continue;
    const viaConnections = [...(connectionOwnersByContact.get(row.recordId) ?? [])];
    if (row.accountId) assign(row, row.accountId, "contact.accountId");
    else if (viaConnections.length === 1) assign(row, viaConnections[0]!, "contact.referenced-by-connection");
    else if (viaConnections.length > 1) unresolved(row, `several owners reference this contact through connections: ${viaConnections.sort(lexical).join(", ")}`);
    else if (generator(row)) assign(row, generator(row)!, "generated-by-demo-account");
    else unresolved(row, "no accountId, no connection with an owner, and not generated by a demo account");
  }

  // Connections and detail states follow their contact.
  for (const row of byCollection("connections")) {
    if (row.owner) continue;
    const contactOwner = row.contactId ? owner.get(key("contacts", row.contactId)) : undefined;
    if (contactOwner && row.accountId && contactOwner !== row.accountId) unresolved(row, `accountId ${row.accountId} disagrees with the contact's owner ${contactOwner}`);
    else if (contactOwner) assign(row, contactOwner, "connection.contact-owner");
    else if (row.accountId) assign(row, row.accountId, "connection.accountId");
    else if (generator(row)) assign(row, generator(row)!, "generated-by-demo-account");
    else unresolved(row, "no contact owner, no accountId, and not generated by a demo account");
  }
  for (const row of byCollection("contact_detail_states")) {
    if (row.owner) continue;
    const contactOwner = row.contactId ? owner.get(key("contacts", row.contactId)) : undefined;
    if (row.actorId && contactOwner && contactOwner !== row.actorId) unresolved(row, `actorId ${row.actorId} disagrees with the contact's owner ${contactOwner}`);
    else if (row.actorId) assign(row, row.actorId, "detail-state.actorId");
    else unresolved(row, "no actorId");
  }

  // Sources.
  const evidenceRows = new Map(byCollection("evidence").map((row) => [row.recordId, row]));
  const citations = new Map<string, { collectionName: string; recordId: string; owner: string | null; deleted: boolean }[]>();
  const cite = (row: { collectionName: string; recordId: string; deleted: boolean; refs: readonly string[] }, value: string | null) => {
    for (const ref of row.refs) {
      if (!evidenceRows.has(ref) || (row.collectionName === "evidence" && ref === row.recordId)) continue;
      citations.set(ref, [...(citations.get(ref) ?? []), { collectionName: row.collectionName, recordId: row.recordId, owner: value, deleted: row.deleted }]);
    }
  };
  for (const row of input.scope) if (row.collectionName !== "evidence") cite(row, owner.get(key(row.collectionName, row.recordId)) ?? null);
  for (const row of input.referencing) cite(row, row.owner);

  for (const row of [...evidenceRows.values()].sort((left, right) => lexical(left.recordId, right.recordId))) {
    const all = citations.get(row.recordId) ?? [];
    const live = all.filter((citation) => !citation.deleted);
    const liveOwned = live.some((citation) => citation.owner);
    const publicOnly = live.length > 0 && live.every((citation) => PLATFORM_PUBLIC_COLLECTIONS.includes(citation.collectionName));
    if (!row.owner && !liveOwned && !publicOnly && !input.assignGeneratedSources) {
      // No live row with an owner cites it (an orphan, or cited only by deleted
      // rows or by owner-less demo rows), so no device will receive it with a
      // contact. Owning it only adds it to every "all my sources" read of that
      // owner (follow-ups, reminders, bootstrap), so by default it is listed.
      const candidate = [...new Set(all.flatMap((citation) => (citation.owner ? [citation.owner] : [])))].sort(lexical)[0] ?? generator(row);
      if (candidate) {
        const citedBy = live.length > 0 ? `owner-less ${[...new Set(live.map((citation) => citation.collectionName))].sort(lexical).join(", ")}` : all.length > 0 ? "deleted rows only" : "no row";
        skipped.push({ collectionName: "evidence", recordId: row.recordId, reason: `no live citing row has an owner (cited by ${citedBy}): left; --assign-generated-sources gives it to ${candidate}` });
        continue;
      }
    }
    const tier = live.some((citation) => citation.owner) ? live : all;
    const tierRule = tier === live ? "evidence.referenced" : "evidence.referenced-by-deleted";
    const owners = [...new Set(tier.flatMap((citation) => (citation.owner ? [citation.owner] : [])))].sort(lexical);
    if (owners.length === 0) {
      if (row.owner) continue;
      if (publicOnly) {
        skipped.push({ collectionName: "evidence", recordId: row.recordId, reason: `platform public data: cited only by ${[...new Set(live.map((citation) => citation.collectionName))].sort(lexical).join(", ")}` });
      } else if (generator(row)) {
        assign(row, generator(row)!, "generated-by-demo-account");
      } else {
        unresolved(row, live.length > 0 ? `cited only by rows without an owner (${[...new Set(live.map((citation) => citation.collectionName))].sort(lexical).join(", ")})` : "cited by nothing and not generated by a demo account");
      }
      continue;
    }
    const fixed = owners.filter((value) => tier.some((citation) => citation.owner === value && !REPOINTABLE_COLLECTIONS.has(citation.collectionName)));
    const outside = () => [...new Set(tier.filter((citation) => !REPOINTABLE_COLLECTIONS.has(citation.collectionName)).map((citation) => citation.collectionName))].sort(lexical).join(", ");
    if (!row.owner && fixed.length > 1) {
      unresolved(row, `shared by ${owners.join(", ")} with references outside the contact categories that cannot be re-pointed (${outside()})`);
      continue;
    }
    const keeper = row.owner ?? (fixed.length === 1 ? fixed[0]! : owners[0]!);
    // An owned source that another owner cites from outside the contact
    // categories (an event, a meeting) stays shared: nothing here re-points it.
    const foreignFixed = fixed.filter((value) => value !== keeper);
    if (foreignFixed.length > 0) {
      skipped.push({ collectionName: "evidence", recordId: row.recordId, reason: `owned by ${keeper}; also cited outside the contact categories (${outside()}) by ${foreignFixed.join(", ")}: left as is` });
    }
    const pendingCopies: OwnerBackfillCopy[] = [];
    let conflict: string | null = null;
    for (const value of owners.filter((candidate) => candidate !== keeper && !foreignFixed.includes(candidate))) {
      const copyRecordId = ownerBackfillCopyId(row.recordId, value);
      const existing = evidenceRows.get(copyRecordId);
      if (existing && existing.owner !== value) { conflict = `copy ${copyRecordId} exists with owner ${existing.owner ?? "none"}`; break; }
      const repoints = all
        .filter((citation) => citation.owner === value && REPOINTABLE_COLLECTIONS.has(citation.collectionName))
        .map(({ collectionName, recordId }) => ({ collectionName, recordId }));
      pendingCopies.push({ sourceRecordId: row.recordId, copyRecordId, owner: value, existing: Boolean(existing), repoints });
    }
    if (conflict) { unresolved(row, conflict); continue; }
    if (!row.owner) assign(row, keeper, owners.length === 1 ? tierRule : `${tierRule}.shared-keeper`);
    copies.push(...pendingCopies);
  }

  const counts = Object.fromEntries(OWNER_BACKFILL_COLLECTIONS.map((name) => {
    const rows = byCollection(name);
    const assigned = assignments.filter((item) => item.collectionName === name);
    const byRule: Record<string, number> = {};
    for (const item of assigned) byRule[item.rule] = (byRule[item.rule] ?? 0) + 1;
    const ownerlessBefore = rows.filter((row) => !row.owner).length;
    return [name, {
      total: rows.length,
      ownerlessBefore,
      assigned: assigned.length,
      copied: name === "evidence" ? copies.filter((copy) => !copy.existing).length : 0,
      skipped: skipped.filter((item) => item.collectionName === name).length,
      unresolvable: unresolvable.filter((item) => item.collectionName === name).length,
      ownerlessAfter: ownerlessBefore - assigned.length,
      byRule,
    } satisfies OwnerBackfillCollectionCounts];
  })) as Record<BackfillCollection, OwnerBackfillCollectionCounts>;
  const sortListed = (left: OwnerBackfillListed, right: OwnerBackfillListed) => lexical(left.collectionName, right.collectionName) || lexical(left.recordId, right.recordId);
  return { assignments, copies, skipped: skipped.sort(sortListed), unresolvable: unresolvable.sort(sortListed), counts };
}

/** Appends JSON lines to a new file (never overwrites) and flushes them to disk on close. */
function backupWriter(path: string) {
  const fd = openSync(path, "wx", 0o600);
  let rows = 0;
  let bytes = 0;
  return {
    write(kind: string, row: unknown) {
      bytes += writeSync(fd, `${JSON.stringify({ kind, row })}\n`);
      if (kind !== "header") rows += 1;
    },
    close() { fsyncSync(fd); closeSync(fd); return { rows, bytes }; },
  };
}

const REPOINT_PAYLOAD_SQL = `(select case when p->'nextAction'->>'evidenceId' = $4 then jsonb_set(p, '{nextAction,evidenceId}', to_jsonb($5::text)) else p end
  from (select case when jsonb_typeof(payload->'evidenceIds') = 'array'
    then jsonb_set(payload, '{evidenceIds}', (select coalesce(jsonb_agg(case when item = to_jsonb($4::text) then to_jsonb($5::text) else item end order by position), '[]'::jsonb)
      from jsonb_array_elements(payload->'evidenceIds') with ordinality as cited(item, position)))
    else payload end as p) repointed)`;

async function applyPlan(tx: TransactionalSqlExecutor, workspaceId: string, plan: OwnerBackfillPlan, backupPath: string) {
  const touched = new Map<string, OwnerBackfillRef>();
  for (const item of plan.assignments) touched.set(key(item.collectionName, item.recordId), item);
  for (const copy of plan.copies) {
    touched.set(key("evidence", copy.sourceRecordId), { collectionName: "evidence", recordId: copy.sourceRecordId });
    for (const ref of copy.repoints) touched.set(key(ref.collectionName, ref.recordId), ref);
  }
  for (const ref of touched.values()) {
    // The plan only rewrites contact rows; a sync collection is never touched.
    if (isSyncCollection(ref.collectionName) || ownerGuardedCollections().includes(ref.collectionName)) throw new Error(`OWNER_BACKFILL_REFUSED: the plan would write ${ref.collectionName}/${ref.recordId}.`);
  }

  // 1. Export every row the writes will touch, exactly as it is now.
  const writer = backupWriter(backupPath);
  let backup: { rows: number; bytes: number };
  try {
    writer.write("header", { sprint: "0114", handler: OWNER_BACKFILL_HANDLER, workspaceId, exportedAt: new Date().toISOString(), counts: plan.counts });
    const refs = [...touched.values()];
    for (let start = 0; start < refs.length; start += 500) {
      const page = refs.slice(start, start + 500);
      const rows = await tx.query<{ row: unknown }>(
        `select to_jsonb(r) as row from orbit_records r
          join unnest($2::text[], $3::text[]) as wanted(collection_name, record_id)
            on r.collection_name = wanted.collection_name and r.record_id = wanted.record_id
         where r.workspace_id = $1 order by r.collection_name, r.record_id`,
        [workspaceId, page.map((ref) => ref.collectionName), page.map((ref) => ref.recordId)],
      );
      if (rows.rows.length !== page.length) throw new Error("OWNER_BACKFILL_BACKUP_INCOMPLETE");
      for (const row of rows.rows) writer.write("before", row.row);
    }
  } finally {
    backup = writer.close();
  }

  // 2. First owners, grouped by collection and owner. Only owner-less rows can match.
  let assigned = 0;
  const groups = new Map<string, { collectionName: string; owner: string; ids: string[] }>();
  for (const item of plan.assignments) {
    const group = groups.get(key(item.collectionName, item.owner)) ?? { collectionName: item.collectionName, owner: item.owner, ids: [] };
    group.ids.push(item.recordId);
    groups.set(key(item.collectionName, item.owner), group);
  }
  for (const group of groups.values()) {
    const result = await tx.query<{ n: number }>(
      `with changed as (
         update orbit_records set user_id = $4
          where workspace_id = $1 and collection_name = $2 and record_id = any($3::text[])
            and (user_id is null or user_id = '')
         returning 1
       ) select count(*)::int as n from changed`,
      [workspaceId, group.collectionName, group.ids, group.owner],
    );
    const count = Number(result.rows[0]?.n ?? 0);
    if (count !== group.ids.length) throw new Error(`OWNER_BACKFILL_CONFLICT: ${group.collectionName} expected ${group.ids.length} owner-less row(s), found ${count}.`);
    assigned += count;
  }

  // 3. Per-owner copies of shared sources, then re-point that owner's references.
  let copied = 0;
  let repointed = 0;
  for (const copy of plan.copies) {
    if (!copy.existing) {
      const inserted = await tx.query<{ record_id: string }>(
        `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, provider,
            provider_record_id, evidence_ids, target_type, target_id, occurred_at, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at)
         select workspace_id, collection_name, $3, $4, source_type, source_id, source_label, provider,
            provider_record_id, array_replace(evidence_ids, record_id, $3), target_type,
            case when target_id = record_id then $3 else target_id end, occurred_at, lifecycle_state, search_text,
            case when payload->>'id' = record_id then jsonb_set(payload, '{id}', to_jsonb($3::text)) else payload end,
            created_at, updated_at, deleted_at
           from orbit_records where workspace_id = $1 and collection_name = 'evidence' and record_id = $2
         on conflict (workspace_id, collection_name, record_id) do nothing
         returning record_id`,
        [workspaceId, copy.sourceRecordId, copy.copyRecordId, copy.owner],
      );
      if (inserted.rows.length !== 1) throw new Error(`OWNER_BACKFILL_CONFLICT: copy ${copy.copyRecordId} could not be created.`);
      copied += 1;
    }
    for (const ref of copy.repoints) {
      const updated = await tx.query<{ record_id: string }>(
        `update orbit_records set evidence_ids = array_replace(evidence_ids, $4, $5), payload = ${REPOINT_PAYLOAD_SQL}
          where workspace_id = $1 and collection_name = $2 and record_id = $3 and user_id = $6
         returning record_id`,
        [workspaceId, ref.collectionName, ref.recordId, copy.sourceRecordId, copy.copyRecordId, copy.owner],
      );
      if (updated.rows.length !== 1) throw new Error(`OWNER_BACKFILL_CONFLICT: ${ref.collectionName}/${ref.recordId} is no longer owned by ${copy.owner}.`);
      repointed += 1;
    }
  }
  return { backup, applied: { assigned, copied, repointed } };
}

/**
 * Dry run and preview read only. Apply runs in one serializable transaction:
 * it marks the transaction as the registered first-owner handler, takes the
 * sync commit-order lock (so it stays correct once contacts are a sync domain),
 * plans from the same snapshot, exports every row it will touch to
 * `backupPath`, writes, then plans again and refuses to commit unless nothing
 * is left to do. Re-running changes 0 rows.
 */
export async function runOwnerBackfill(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  mode: OwnerBackfillMode;
  backupPath?: string;
  /** Also own sources no live owned row cites (deleted citers, owner-less demo citers, the generator). Off by default: see planOwnerBackfill. */
  assignGeneratedSources?: boolean;
}): Promise<OwnerBackfillResult> {
  if (findSyncOwnerChangeHandler(OWNER_BACKFILL_HANDLER)?.scope !== "first-owner") throw new Error("OWNER_BACKFILL_HANDLER_UNREGISTERED");
  if (input.mode !== "apply") {
    const plan = await input.client.transaction(async (tx) => {
      await tx.query("set transaction read only");
      return planOwnerBackfill({ ...(await readRows(tx, input.workspaceId)), assignGeneratedSources: input.assignGeneratedSources });
    });
    return { mode: input.mode, workspaceId: input.workspaceId, ...plan };
  }
  if (!input.backupPath) throw new Error("OWNER_BACKFILL_REFUSED: a backup path is required to apply.");
  const backupPath = input.backupPath;
  return input.client.transaction(async (tx) => {
    await tx.query("select set_config($1, $2, true)", [SYNC_OWNER_CHANGE_SETTING, OWNER_BACKFILL_HANDLER]);
    await acquireSyncCommitOrderLock(tx);
    const plan = planOwnerBackfill({ ...(await readRows(tx, input.workspaceId)), assignGeneratedSources: input.assignGeneratedSources });
    const { backup, applied } = await applyPlan(tx, input.workspaceId, plan, backupPath);
    const after = planOwnerBackfill({ ...(await readRows(tx, input.workspaceId)), assignGeneratedSources: input.assignGeneratedSources });
    if (after.assignments.length > 0 || after.copies.length > 0) {
      throw new Error(`OWNER_BACKFILL_NOT_CONVERGED: ${after.assignments.length} assignment(s) and ${after.copies.length} copy(ies) left after apply; rolled back.`);
    }
    return { mode: "apply" as const, workspaceId: input.workspaceId, ...plan, backup: { path: backupPath, ...backup }, applied, verified: true };
  });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** A remote database may be read (dry run, preview); applying there needs `--confirm-remote=<host>/<database>`. */
export function assertOwnerBackfillTarget(input: { connectionString: string; target: "local" | "cloud"; apply: boolean; confirmRemote?: string | null }): { host: string; database: string; remote: boolean } {
  let url: URL;
  try { url = new URL(input.connectionString); } catch { throw new Error("OWNER_BACKFILL_REFUSED: the database connection configuration is invalid."); }
  const host = url.hostname;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const remote = input.target !== "local" || !LOCAL_HOSTS.has(host);
  if (input.apply && remote && input.confirmRemote !== `${host}/${database}`) {
    throw new Error(`OWNER_BACKFILL_REFUSED: remote database; after the dry run and the backup plan are approved pass --confirm-remote=${host}/${database}.`);
  }
  return { host, database, remote };
}
