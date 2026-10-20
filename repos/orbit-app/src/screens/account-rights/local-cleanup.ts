type Scope = { baseUrl: string; actorId: string };

export async function clearAccountRightsSyncScope(lifecycle: {
  setScope(scope: Scope | null): Promise<boolean>;
  withDatabase(scope: Scope, operation: (database: { run(sql: string): Promise<unknown> }) => Promise<void>): Promise<void | null>;
}, scope: Scope, options: { close?: boolean } = {}): Promise<boolean> {
  if (!await lifecycle.setScope(scope)) return false;
  const cleared = await lifecycle.withDatabase(scope, async database => {
    await database.run("DELETE FROM sync_outbox");
    await database.run("DELETE FROM sync_aliases");
  });
  if (cleared === null) return false;
  return options.close === false ? true : lifecycle.setScope(null);
}
