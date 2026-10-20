import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";

type Method = "credentials" | "google";

async function readConfiguredMethod(actorId: string, userId: string): Promise<Method | null> {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  return readAccountDeletionMethod(runtime.client, runtime.workspaceId, actorId, userId);
}

export async function readAccountDeletionMethod(db: TransactionalSqlExecutor, workspaceId: string, actorId: string, userId: string): Promise<Method | null> {
  const found = await db.query<{ provider: string }>(`select a.payload->>'provider' as provider from orbit_records a
    join orbit_records p on p.workspace_id=a.workspace_id and p.collection_name='profiles'
      and p.payload->>'accountId'=$3 and p.user_id=$3 and p.lifecycle_state='active'
      and (p.provider_record_id=$2 or p.payload->>'id'=$2)
    where a.workspace_id=$1 and a.collection_name='auth_users' and a.payload->>'id'=$2 and a.lifecycle_state='active' limit 2`,
  [workspaceId, userId, actorId]);
  const provider = found.rows.length === 1 ? found.rows[0]?.provider : null;
  return provider === "credentials" || provider === "google" ? provider : null;
}

export function createAccountDeletionMethodHandler(deps: {
  resolveActor?: ResolveAuthenticatedApiActor;
  readMethod?: (actorId: string, userId: string) => Promise<Method | null>;
} = {}) {
  return async (): Promise<Response> => {
    const headers = { "cache-control": "private, no-store" };
    try {
      const actor = await (deps.resolveActor ?? resolveAuthenticatedApiActor)();
      if (!actor?.id || !actor.userId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      const method = await (deps.readMethod ?? readConfiguredMethod)(actor.id, actor.userId);
      return method ? Response.json({ method }, { headers }) : Response.json({ error: "unavailable" }, { status: 503, headers });
    } catch { return Response.json({ error: "unavailable" }, { status: 503, headers }); }
  };
}
