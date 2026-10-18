import assert from 'node:assert/strict';
import test from 'node:test';
import { scanSecretaryNotificationPage, withoutMailSummary } from '../../shared/compute/secretary-source';
import type { InboxNotificationDTO, InboxNotificationListDTO } from '../../shared/contract/inbox-notifications';

const at = '2026-10-19T00:00:00.000Z';
function notification(id: string, sourceKind: 'note' | 'event_deadline'): InboxNotificationDTO {
  return { id, actorId: 'actor', kind: 'reminder', origin: 'automation', semanticKey: id,
    title: id, reason: id, revision: 1, actions: ['read'], disposition: 'open', readAt: null,
    occurredAt: at, updatedAt: at, dueAt: at,
    sources: [{ sourceKind, sourceId: id, sourceRevision: at, occurredAt: at, readAt: at }],
    target: { kind: sourceKind === 'note' ? 'source' : 'event', id, href: `/events/${id}`, status: 'available' } };
}
function page(items: InboxNotificationDTO[], nextCursor: string | null): InboxNotificationListDTO {
  return { enabled: true, asOf: at, items, nextCursor, unreadCount: 61 };
}

test('secretary tab scans beyond sixty ordinary notifications and preserves the global unread count', async () => {
  const pages = [page(Array.from({ length: 50 }, (_, i) => notification(`ordinary-${i}`, 'note')), 'after-50'),
    page([...Array.from({ length: 10 }, (_, i) => notification(`ordinary-${i + 50}`, 'note')), notification('event-1', 'event_deadline')], null)];
  const requested: Array<string | undefined> = [];
  const result = await scanSecretaryNotificationPage(async cursor => {
    requested.push(cursor);
    return pages[requested.length - 1]!;
  });
  assert.deepEqual(requested, [undefined, 'after-50']);
  assert.deepEqual(result.items.map(item => item.id), ['event-1']);
  assert.equal(result.unreadCount, 61);
  assert.equal(result.nextCursor, null);
});

test('secretary scan refuses a repeated cursor instead of presenting an incomplete list', async () => {
  await assert.rejects(() => scanSecretaryNotificationPage(async () => page([], 'same')), /cursor/i);
});

test('D-16 mail summary rows are hidden from all inbox categories', () => {
  const ordinary = notification('ordinary', 'note');
  const mail = { ...ordinary, id: 'mail', sources: [{ ...ordinary.sources[0]!, sourceKind: 'mail_summary' as const }] };
  assert.deepEqual(withoutMailSummary([mail, ordinary]).map(row => row.id), ['ordinary']);
});
