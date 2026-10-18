import assert from 'node:assert/strict';
import test from 'node:test';
import { readEventSecretarySourceState } from '../../features/notifications/secretary/source-access';
import type { InboxNotificationSource } from '../../shared/contract/inbox-notifications';

const now = '2026-10-07T00:00:00.000Z';
const source = (sourceKind: 'event_deadline' | 'event_prep' | 'event_pick', sourceId = 'event-1'): InboxNotificationSource => ({
  sourceKind, sourceId, sourceRevision: '1', occurredAt: now, readAt: now,
});

function reader(rows: Record<string, Record<string, unknown>>) {
  const seen: string[] = [];
  const query = async (sql: string, values?: readonly unknown[]) => {
    assert.deepEqual(values?.slice(0, 2), ['workspace', 'actor']);
    const marker = sql.match(/secretary:([\w-]+)/)?.[1] ?? '';
    seen.push(marker);
    return { rows: rows[marker] ? [rows[marker]!] : [] };
  };
  return { query: { query }, seen };
}

test('deadline requires a published upcoming event, active plan and open registration', async () => {
  const good = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' }, deadline: { planned: true, registered: false, closes_at: '2026-10-08T00:00:00Z' } });
  assert.equal(await readEventSecretarySourceState(good.query as never, 'workspace', 'actor', source('event_deadline'), now), 'available');
  for (const deadline of [{ planned: false, registered: false, closes_at: '2026-10-08T00:00:00Z' }, { planned: true, registered: true, closes_at: '2026-10-08T00:00:00Z' }, { planned: true, registered: false, closes_at: '2026-10-06T00:00:00Z' }]) {
    const stale = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' }, deadline });
    assert.equal(await readEventSecretarySourceState(stale.query as never, 'workspace', 'actor', source('event_deadline'), now), 'unavailable');
  }
});

test('prep requires current membership; cancelled event or withdrawn membership is unavailable', async () => {
  const good = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' }, prep: { status: 'rsvped' } });
  assert.equal(await readEventSecretarySourceState(good.query as never, 'workspace', 'actor', source('event_prep'), now), 'available');
  const gone = reader({ event: { lifecycle_state_v2: 'cancelled', starts_at: '2026-10-09T00:00:00Z' }, prep: { status: 'rsvped' } });
  assert.equal(await readEventSecretarySourceState(gone.query as never, 'workspace', 'actor', source('event_prep'), now), 'unavailable');
  const withdrawn = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' }, prep: { status: 'cancelled' } });
  assert.equal(await readEventSecretarySourceState(withdrawn.query as never, 'workspace', 'actor', source('event_prep'), now), 'unavailable');
});

test('R26 pick needs an owned ready assessment and an available event', async () => {
  const good = reader({ assessment: { event_id: 'event-1', status: 'ready', user_decision: null }, event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' } });
  assert.equal(await readEventSecretarySourceState(good.query as never, 'workspace', 'actor', source('event_pick', 'assessment-1'), now), 'available');
  const otherOwner = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' } });
  assert.equal(await readEventSecretarySourceState(otherOwner.query as never, 'workspace', 'actor', source('event_pick', 'assessment-1'), now), 'unavailable');
});

test('daily pick uses the event as source, excludes dismissed or registered events', async () => {
  const daily = { ...source('event_pick'), sourceRevision: 'daily:2026-10-07' };
  const good = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' }, feedback: { dismissed: false }, prep: { status: 'cancelled' }, plan: { active: true } });
  assert.equal(await readEventSecretarySourceState(good.query as never, 'workspace', 'actor', daily, now), 'available');
  assert.equal(good.seen.includes('assessment'), false);
  const dismissed = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' }, feedback: { dismissed: true }, prep: { status: 'cancelled' }, plan: { active: true } });
  assert.equal(await readEventSecretarySourceState(dismissed.query as never, 'workspace', 'actor', daily, now), 'unavailable');
  const registered = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' }, feedback: { dismissed: false }, prep: { status: 'rsvped' }, plan: { active: true } });
  assert.equal(await readEventSecretarySourceState(registered.query as never, 'workspace', 'actor', daily, now), 'unavailable');
  const noPlan = reader({ event: { lifecycle_state_v2: 'published', starts_at: '2026-10-09T00:00:00Z' }, feedback: { dismissed: false }, prep: { status: 'cancelled' }, plan: { active: false } });
  assert.equal(await readEventSecretarySourceState(noPlan.query as never, 'workspace', 'actor', daily, now), 'unavailable');
});
