import { createHash } from "node:crypto";

/**
 * The authorization epoch is derived, not stored: one indexed row over the
 * actor's own authorization records (auth_users, accounts, permissions).
 * Any change there — revocation, membership, permission — moves the epoch,
 * which invalidates every domain cursor and lease grant issued under it.
 * No identity row at all means the actor is not authorized for the workspace.
 */
export interface AuthorizationEpochSqlClient {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

export interface AuthorizationEpoch {
  authorized: boolean;
  /** 32 hex characters; stable while the authorization rows are unchanged. */
  epoch: string;
  maxUpdatedAt: string | null;
  count: number;
}

const AUTHORIZATION_EPOCH_SQL = `
  /* sync:authorization-epoch */
  select max(updated_at)::text as max_updated_at,
    count(*)::text as count,
    count(*) filter (where collection_name in ('auth_users', 'accounts'))::text as identity_count
  from orbit_records
  where workspace_id = $1
    and lifecycle_state <> 'deleted'
    and ((collection_name in ('auth_users', 'accounts', 'permissions') and user_id = $2)
      or (collection_name = 'accounts' and record_id = $2))
`;

export async function resolveAuthorizationEpoch(input: {
  client: AuthorizationEpochSqlClient;
  actorId: string;
  workspaceId: string;
}): Promise<AuthorizationEpoch> {
  if (!input.actorId.trim() || !input.workspaceId.trim()) throw new Error("Authorization epoch requires an actor and a workspace.");
  const result = await input.client.query<{ max_updated_at: string | null; count: string; identity_count: string }>(
    AUTHORIZATION_EPOCH_SQL,
    [input.workspaceId, input.actorId],
  );
  const row = result.rows[0];
  const maxUpdatedAt = row?.max_updated_at ?? null;
  const count = Number(row?.count ?? 0);
  const authorized = Number(row?.identity_count ?? 0) > 0;
  const epoch = createHash("sha256")
    .update(JSON.stringify([input.actorId, input.workspaceId, maxUpdatedAt, count]))
    .digest("hex")
    .slice(0, 32);
  return { authorized, epoch, maxUpdatedAt, count };
}
