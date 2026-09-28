import { createHash } from "node:crypto";

/**
 * A domain watermark is the cheapest honest answer to "did anything this
 * response depends on change?": one indexed row of max(updated_at) + count(*)
 * over the collections a read touches. Soft deletes move updated_at; the count
 * catches hard deletes. Private domains pass userId so another user's writes
 * never move this user's watermark.
 */
export interface DomainWatermarkSqlClient {
  query<TRow = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: readonly TRow[] }>;
}

export interface DomainWatermarkInput {
  client: DomainWatermarkSqlClient;
  workspaceId: string;
  collections: readonly string[];
  /** Private domains: only this user's rows in `collections` count. Omit for workspace-wide domains. */
  userId?: string;
  /** Workspace-wide collections folded into the same single statement (e.g. authorization collections). */
  sharedCollections?: readonly string[];
}

export interface DomainWatermark {
  maxUpdatedAt: string | null;
  count: number;
  fingerprint: string;
}

/** Collections whose change means an actor's authorization may have changed; every conditional read includes them. */
export const READ_AUTHORIZATION_COLLECTIONS = ["accounts", "auth_users", "permissions"] as const;

const WORKSPACE_WATERMARK_SQL = `
  /* domain:watermark */
  select max(updated_at)::text as max_updated_at, count(*)::text as count
  from orbit_records
  where workspace_id = $1
    and collection_name = any($2::text[])
    and lifecycle_state <> 'deleted'
`;

const USER_WATERMARK_SQL = `
  /* domain:watermark:user */
  select max(updated_at)::text as max_updated_at, count(*)::text as count
  from orbit_records
  where workspace_id = $1
    and lifecycle_state <> 'deleted'
    and ((collection_name = any($2::text[]) and user_id = $3)
      or collection_name = any($4::text[]))
`;

/**
 * Sprint 0118 (from 0117): the sync manifest's watermark. Every insert and
 * update of an orbit_records row takes a new sync_revision from one sequence,
 * so max(sync_revision) moves on every write, whatever the write does to
 * updated_at (a replayed save or a backfill can set an earlier time, which
 * max(updated_at) + count(*) never saw). count(*) still catches a hard delete
 * of a row that is not the latest. One statement: the actor's own rows in
 * `collections`, the workspace-wide `sharedCollections` (authorization) and the
 * actor's personal sub-workspace rows in `subspaceCollections`.
 */
export interface RevisionWatermarkInput {
  client: DomainWatermarkSqlClient;
  workspaceId: string;
  userId: string;
  collections: readonly string[];
  sharedCollections?: readonly string[];
  subspace?: { workspaceId: string; collections: readonly string[] };
}

const REVISION_WATERMARK_SQL = `
  /* domain:watermark:revision */
  select max(sync_revision)::text as max_revision, count(*)::text as count
  from orbit_records
  where (workspace_id = $1
      and ((collection_name = any($2::text[]) and user_id = $3) or collection_name = any($4::text[])))
    or (workspace_id = $5 and collection_name = any($6::text[]))
`;

export async function readRevisionWatermark({ client, workspaceId, userId, collections, sharedCollections = [], subspace }: RevisionWatermarkInput): Promise<{ maxRevision: string | null; count: number; fingerprint: string }> {
  if (!workspaceId.trim() || !userId.trim()) throw new Error("A workspace and a user are required for a revision watermark.");
  const own = [...new Set(collections)].sort();
  const shared = [...new Set(sharedCollections)].sort();
  const personal = subspace ? [...new Set(subspace.collections)].sort() : [];
  const result = await client.query<{ max_revision: string | null; count: string }>(REVISION_WATERMARK_SQL, [workspaceId, own, userId, shared, subspace?.workspaceId ?? null, personal]);
  const maxRevision = result.rows[0]?.max_revision ?? null;
  const count = Number(result.rows[0]?.count ?? 0);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(["revision", workspaceId, userId, own, shared, subspace?.workspaceId ?? null, personal, maxRevision, count]))
    .digest("hex");
  return { maxRevision, count, fingerprint };
}

export async function readDomainWatermark({
  client,
  workspaceId,
  collections,
  userId,
  sharedCollections = [],
}: DomainWatermarkInput): Promise<DomainWatermark> {
  if (!workspaceId.trim()) throw new Error("A workspace is required for a domain watermark.");
  if (collections.length === 0) throw new Error("At least one collection is required for a domain watermark.");
  const own = [...new Set(collections)].sort();
  const shared = [...new Set(sharedCollections)].sort();
  type Row = { max_updated_at: string | null; count: string };
  const result = userId === undefined
    ? await client.query<Row>(WORKSPACE_WATERMARK_SQL, [workspaceId, [...new Set([...own, ...shared])].sort()])
    : await client.query<Row>(USER_WATERMARK_SQL, [workspaceId, own, userId, shared]);
  const row = result.rows[0];
  const maxUpdatedAt = row?.max_updated_at ?? null;
  const count = Number(row?.count ?? 0);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([workspaceId, userId ?? null, own, shared, maxUpdatedAt, count]))
    .digest("hex");
  return { maxUpdatedAt, count, fingerprint };
}
