import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxUpsertFor } from '../../features/events/journey/live-mapping';

test('R27 deadline and prep map to reminders due at the real event times', () => {
  for (const sourceKind of ['event_deadline', 'event_prep'] as const) {
    const dueAt = sourceKind === 'event_deadline' ? '2026-10-03T14:59:00.000Z' : '2026-10-07T10:00:00.000Z';
    const result = inboxUpsertFor('actor', { semanticKey: `${sourceKind}:event`, sourceKind, eventId: 'event', title: 'Event', body: 'Body', href: '/events/event', at: dueAt }, '2026-10-01T00:00:00.000Z');
    assert.equal(result.kind, 'reminder');
    assert.equal(result.dueAt, dueAt);
    assert.equal(result.occurredAt, '2026-10-01T00:00:00.000Z');
  }
});
