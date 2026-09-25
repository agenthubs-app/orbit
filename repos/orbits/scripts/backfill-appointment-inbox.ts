import { createConfiguredEventOperationsPostgresRuntime } from '../features/events/event-operations/storage/postgres-client';
import { runAppointmentInboxBackfillPass } from '../features/notifications/appointment-inbox-backfill';
import { loadLocalEnv } from './load-local-env';

function args(argv: readonly string[]) {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (!name?.startsWith('--')) throw Error('Expected named appointment backfill options.');
    if (name === '--writers-ready') {
      if (result.has(name)) throw Error(`Duplicate option ${name}.`);
      result.set(name, 'true');
      continue;
    }
    const value = argv[++index];
    if (!value || value.startsWith('--') || result.has(name)) throw Error(`Invalid or duplicate option ${name}.`);
    result.set(name, value);
  }
  const allowed = new Set(['--actor', '--batch-id', '--cutoff', '--limit', '--writers-ready']);
  for (const name of result.keys()) if (!allowed.has(name)) throw Error(`Unknown option ${name}.`);
  const actorId = result.get('--actor');
  const batchId = result.get('--batch-id');
  const cutoff = result.get('--cutoff');
  if (!actorId || !batchId || !cutoff || !result.has('--writers-ready')) {
    throw Error('Required: --actor <id> --batch-id <id> --cutoff <RFC3339> --writers-ready.');
  }
  const limit = result.has('--limit') ? Number(result.get('--limit')) : 10;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw Error('--limit must be an integer from 1 to 25.');
  return { actorId, batchId, cutoff, limit };
}

async function main() {
  loadLocalEnv();
  const input = args(process.argv.slice(2));
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) throw Error('Appointment inbox backfill requires the explicitly configured local Event Operations database.');
  try {
    const result = await runAppointmentInboxBackfillPass({ runtime, ...input, writersReady: true });
    process.stdout.write(`${JSON.stringify({ event: 'appointment_inbox_backfill_pass', ...result })}\n`);
  } finally {
    await runtime.client.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : 'Appointment inbox backfill failed.', event: 'appointment_inbox_backfill_failed' })}\n`);
  process.exitCode = 1;
});
