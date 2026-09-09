import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";

// Explicit maintenance setup only; not registered by an application factory.
export async function runLifecycleMigrationSchema(client: TransactionalSqlExecutor): Promise<void> {
  await client.query(`
    create table if not exists relationship_lifecycle_migration_receipts (
      workspace_id text not null,
      actor_id text not null,
      run_id text not null,
      request_hash text not null,
      response_hash text not null,
      response_receipt jsonb not null,
      created_at timestamptz not null,
      primary key (workspace_id, actor_id, run_id)
    )
  `);
}
