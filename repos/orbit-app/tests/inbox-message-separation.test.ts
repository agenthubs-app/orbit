import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxFeedFromSources } from '../src/view-models/inbox-feed';
import { relationshipConversationListToInbox } from '../src/api/message-state';
import { runInboxReadBatch } from '../src/view-models/inbox-read-batch';

const at = '2026-09-16T01:00:00.000Z';
const conversation = {
  conversationId: 'c-one', contactId: 'contact-one', qualificationVersion: 'q-one', status: 'active',
  participantAccountIds: ['a', 'b'], participantDisplayNames: { a: '我', b: '佐藤健一' },
  createdAt: at, updatedAt: at, unreadCount: 1,
  messages: [{ messageId: 'm-one', conversationId: 'c-one', senderAccountId: 'b', senderDisplayName: '佐藤健一', body: '报价资料收到了，谢谢。', sentAt: at, deliveryState: 'delivered' }],
};
const sources = {
  actorId: 'a', conversationsData: { conversations: [conversation], refreshedAt: at }, language: 'zh' as const, now: at,
  notificationsData: { state: 'success', notificationInteractions: {}, reminders: [{ reminderId: 'n-one', title: '发送报价资料', href: '/tasks/t-one', occurredAt: at }] }, signalsData: { signals: [] },
};

test('notification feed cannot duplicate real messages or expose their read cursors', () => {
  const view = inboxFeedFromSources(sources);
  assert.deepEqual(view.items.map(i => i.id), ['notification:n-one']);
  assert.equal(view.unreadCount, 1);
});

test('notification mark-all-read never sends a conversation read mutation', async () => {
  const paths: string[] = [];
  await runInboxReadBatch({ items: inboxFeedFromSources(sources).items, isCurrent: () => true,
    execute: async action => { paths.push(action.endpoint); return { success: true, status: 200, data: { notificationId: 'n-one', state: 'read', updatedAt: at }, meta: { featureMode: null, privacy: null, runtimeBoundary: null } }; },
  });
  assert.deepEqual(paths, ['/api/notifications/n-one/state']);
  assert.equal(relationshipConversationListToInbox(sources.conversationsData, 'a')?.conversations[0]?.unreadCount, 1);
});

test('message history retains literal names and text beyond notification age window', () => {
  const old = { ...conversation, updatedAt: '2025-01-01T00:00:00Z' };
  const view = relationshipConversationListToInbox({ conversations: [old], refreshedAt: at }, 'a');
  assert.equal(view?.conversations[0]?.name, '佐藤健一');
  assert.equal(view?.conversations[0]?.preview, '报价资料收到了，谢谢。');
  assert.equal(relationshipConversationListToInbox(sources.conversationsData, 'other'), null);
});

test('notification availability does not depend on a failed communication request', () => {
  assert.equal(inboxFeedFromSources({ ...sources, conversationsData: null }).coverageConfirmed, true);
});

test('message bulk read contains only message cursors, including older conversation history', async () => {
  const module = await import('../src/view-models/inbox-feed');
  const readItems = (module as any).inboxMessageReadItems;
  assert.equal(typeof readItems, 'function');
  const items = readItems(sources.conversationsData, 'a');
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].readAction.body, { lastReadMessageId: 'm-one' });
  assert.equal(items[0].readAction.endpoint, '/api/relationship-communication/conversations/c-one/read');
});
