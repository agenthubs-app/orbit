import assert from 'node:assert/strict';
import test from 'node:test';
import { filterMessageCards } from '../../app/(app)/app/inbox/bounded-contact-messages-view-model';

test('message search filters the authorized page by participant and preview, without changing its cursor', () => {
  const page = { items: [
    { id: 'a', name: '佐藤 美咲', preview: '会場について', unread: 2, updatedAt: '2026-10-19T00:00:00Z' },
    { id: 'b', name: '田中 陸', preview: '来週の面談', unread: 0, updatedAt: '2026-10-18T00:00:00Z' },
  ], nextCursor: 'signed-next' };
  assert.deepEqual(filterMessageCards(page.items, '  佐藤  ').map(row => row.id), ['a']);
  assert.deepEqual(filterMessageCards(page.items, '面談').map(row => row.id), ['b']);
  assert.deepEqual(filterMessageCards(page.items, '').map(row => row.id), ['a', 'b']);
  assert.equal(page.nextCursor, 'signed-next');
});
