import { performance } from 'node:perf_hooks';
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { AppError } from '../../shared/errors/app-error';
import type { InboxProjectionWriter } from '../notifications/storage/inbox-projection-work';
import { createScheduleReminderWindowRepository } from './reminder-window-storage';
import { createPersonalScheduleService } from './service';

/** Pool acquisition remains governed by the runtime's connection timeout.
 * Once acquired, each SQL statement gets the remaining transaction budget. */
async function boundedWindowTransaction<T>(input: {
  client: TransactionalPostgresClient; deadline?: number;
}, clock: () => Date, operation: (tx: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
  return input.client.transaction(async executor => {
    const started = performance.now();
    const budget = Math.min(5000, input.deadline === undefined ? 5000 : input.deadline - clock().getTime());
    if (budget <= 0) throw Error('Schedule window transaction budget exhausted');
    await executor.query("select set_config('statement_timeout',$1,true),set_config('lock_timeout','1000',true),set_config('idle_in_transaction_session_timeout','5000',true)", [String(Math.max(1, Math.floor(budget)))]);
    return operation({ async query<TRow>(sql: string, values?: readonly unknown[]) {
      const remaining = Math.min(budget - (performance.now() - started), input.deadline === undefined ? Infinity : input.deadline - clock().getTime());
      if (remaining < 1) throw Error('Schedule window transaction budget exhausted');
      await executor.query("select set_config('statement_timeout',$1,true)", [String(Math.max(1, Math.floor(remaining)))]);
      return executor.query<TRow>(sql, values);
    } });
  });
}

export async function runScheduleReminderWindowPass(input: {
  client: TransactionalPostgresClient; workspaceId: string; inboxProjection: InboxProjectionWriter;
  now: () => string; clock?: () => Date; deadline?: number; limit?: number;
}) {
  const result = { windowExamined: 0, windowExtended: 0, windowSkipped: 0, windowFailed: 0, windowDeferred: 0 };
  const clock = input.clock ?? (() => new Date());
  if (input.deadline !== undefined && clock().getTime() >= input.deadline) return { ...result, windowDeferred: 1 };
  const windows = createScheduleReminderWindowRepository(input);
  let candidates;
  try { candidates = await boundedWindowTransaction(input, clock, tx => windows.due(input.now(), input.limit ?? 10, tx)); }
  catch { return { ...result, windowFailed: 1 }; }
  for (const candidate of candidates) {
    if (input.deadline !== undefined && clock().getTime() >= input.deadline) { result.windowDeferred++; break; }
    result.windowExamined++;
    try {
      let outcome: 'extended' | 'skipped' | 'deferred' = 'skipped';
      for (let attempt = 0; ; attempt++) {
        if (input.deadline !== undefined && clock().getTime() >= input.deadline) { outcome = 'deferred'; break; }
        try {
          outcome = await boundedWindowTransaction(input, clock, async tx => {
            // Same order as a schedule mutation: actor, window, plan/work.
            const lock = await tx.query<{ acquired: boolean }>('select pg_try_advisory_xact_lock(hashtextextended($1,0)) as acquired', [JSON.stringify(['personal-schedule', input.workspaceId, candidate.actorId])]);
            if (!lock.rows[0]?.acquired || !await windows.current(tx, candidate, input.now())) return 'skipped';
            const schedule = createPersonalScheduleService({ ...input, executor: tx, store: createPostgresLiveRecordStore({ client: tx }) });
            try { await schedule.refreshReminderPlansForSeries({ actorId: candidate.actorId, id: candidate.seriesId }); }
            catch (error) {
              if (!(error instanceof AppError && error.code === 'NOT_FOUND')) throw error;
              await windows.missing(tx, candidate, input.now());
              return 'skipped';
            }
            return 'extended';
          });
          break;
        } catch (error) {
          if (attempt >= 2 || !['40001', '40P01'].includes(String((error as { code?: string })?.code))) throw error;
        }
      }
      if (outcome === 'extended') result.windowExtended++;
      else if (outcome === 'deferred') result.windowDeferred++;
      else result.windowSkipped++;
    } catch {
      result.windowFailed++;
      // A failed failure-marker write cannot turn this pass into success or
      // prevent independent candidates/notification workers from progressing.
      try { await boundedWindowTransaction(input, clock, tx => windows.fail(candidate, input.now(), tx)); }
      catch { result.windowDeferred++; }
    }
  }
  return result;
}
