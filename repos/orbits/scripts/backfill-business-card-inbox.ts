import { backfillBusinessCardInboxRecords } from '../features/notifications/inbox-business-refresh';
import { createConfiguredInboxRuntime } from '../features/notifications/inbox-record-service-factory';
import { loadLocalEnv } from './load-local-env';

function options(argv: readonly string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) throw Error('Expected unique --actor and --since options.');
    values.set(name, value);
  }
  for (const name of values.keys()) if (name !== '--actor' && name !== '--since') throw Error(`Unknown option ${name}.`);
  const actorId = values.get('--actor')?.trim();
  const since = values.get('--since')?.trim();
  if (!actorId || !since || !Number.isFinite(Date.parse(since))) throw Error('Required: --actor <account-id> --since <RFC3339>.');
  return { actorId, since: new Date(since).toISOString() };
}

async function main() {
  loadLocalEnv();
  const input = options(process.argv.slice(2));
  const runtime = createConfiguredInboxRuntime();
  if (!runtime) throw Error('Business-card inbox backfill requires configured notification storage.');
  try {
    const result = await backfillBusinessCardInboxRecords({ ...runtime, ...input });
    process.stdout.write(`${JSON.stringify({ event: 'business_card_inbox_backfill', ...input, ...result })}\n`);
  } finally {
    await runtime.client.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : 'Business-card inbox backfill failed.', event: 'business_card_inbox_backfill_failed' })}\n`);
  process.exitCode = 1;
});
