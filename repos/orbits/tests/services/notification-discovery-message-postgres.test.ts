import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoverySourceAdapters } from '../../features/notifications/discovery/source-adapters';
import type { DiscoveryPreferences } from '../../features/notifications/discovery/contract';
import { connect, createRelationshipHarness, relationshipPostgresSkip } from '../support/relationship-message-harness';

// Sprint 0109: discovery reads relationship messages from the message tables,
// only through the actor's own active member row.
const now = '2026-09-16T00:00:00.000Z';
test('message analysis requires explicit permission and current membership; author is the actual sender; scan stays in own conversations', { skip: relationshipPostgresSkip, timeout: 60_000 }, async (t) => {
  const h = await createRelationshipHarness({ prefix: 'discovery_message' });
  t.after(() => h.close());
  const preferences: DiscoveryPreferences = { actorId: 'a', enabled: true, messageAnalysisEnabled: true, timeZone: 'Asia/Tokyo', language: 'zh', revision: 1, generation: 1, enabledSince: '2026-09-15T00:00:00.000Z', messageEnabledSince: '2026-09-15T00:00:00.000Z', updatedAt: now };
  await h.store.upsertRecord({ workspaceId: h.workspaceId, collectionName: 'contacts', recordId: 'c', userId: 'a', payload: { id: 'c', displayName: '佐藤' }, sourceType: 'manual', sourceId: 'c', evidenceIds: [], lifecycleState: 'active', createdAt: now, updatedAt: now });
  const a = { accountId: 'a', displayName: '当前用户', email: 'a@example.test' }, other = { accountId: 'other', displayName: '佐藤', email: 'other@example.test' };
  const p = { accountId: 'p', displayName: 'P', email: 'p@example.test' }, q = { accountId: 'q', displayName: 'Q', email: 'q@example.test' };
  const { conversationId, qualificationVersion } = await connect(h, a, other, 'c');
  const m = (await h.service(other, { now: () => now }).sendMessage({ conversationId, qualificationVersion, requestId: 'm', body: '我会发送资料' })).message;
  const own = (await h.service(a, { now: () => '2026-09-16T00:00:01.000Z' }).sendMessage({ conversationId, qualificationVersion, requestId: 'own', body: '收到' })).message;
  const foreign = await connect(h, p, q, 'c-foreign');
  await h.service(p, { now: () => now }).sendMessage({ conversationId: foreign.conversationId, qualificationVersion: foreign.qualificationVersion, requestId: 'foreign', body: '别人的私信' });
  const adapters = createDiscoverySourceAdapters({ store: h.store, workspaceId: h.workspaceId, client: h.client, preferences: async () => preferences, now: () => now });
  const ref = { kind: 'message' as const, id: m.messageId, revision: m.sentAt, at: m.sentAt, key: 'message:' + m.messageId };
  const read = await adapters.read('a', ref);
  assert.equal(read?.authorId, 'other');
  assert.equal(read?.source.authorId, 'other');
  assert.equal(read?.text, '我会发送资料');
  assert.deepEqual(read?.objects, [{ id: 'c', name: '佐藤' }], 'the inviter sees the bound contact');
  assert.equal(read?.href, `/inbox/${encodeURIComponent(conversationId)}`);
  const remoteView = await createDiscoverySourceAdapters({ store: h.store, workspaceId: h.workspaceId, client: h.client, preferences: async () => ({ ...preferences, actorId: 'other' }), now: () => now }).read('other', ref);
  assert.deepEqual(remoteView?.objects, [{ id: 'a', name: '当前用户' }], 'the invitee sees the inviter by display name');
  assert.equal(await adapters.read('a', { ...ref, revision: 'stale' }), null);
  const scan = await adapters.scan('a', { at: '2026-09-15T00:00:00.000Z', key: '' }, '2026-09-17T00:00:00.000Z');
  assert.deepEqual(scan.refs.filter((r) => r.kind === 'message').map((r) => [r.id, r.revision]), [[m.messageId, m.sentAt], [own.messageId, own.sentAt]]);
  preferences.messageAnalysisEnabled = false;
  assert.equal(await adapters.read('a', ref), null);
  preferences.messageAnalysisEnabled = true;
  const outsider = createDiscoverySourceAdapters({ store: h.store, workspaceId: h.workspaceId, client: h.client, preferences: async () => ({ ...preferences, actorId: 'p' }), now: () => now });
  assert.equal(await outsider.read('p', ref), null, 'a non-member cannot read the message');
  await h.service(a).revokeContactBinding('c');
  assert.equal(await adapters.read('a', ref), null);
  assert.deepEqual((await adapters.scan('a', { at: '2026-09-15T00:00:00.000Z', key: '' }, '2026-09-17T00:00:00.000Z')).refs.filter((r) => r.kind === 'message'), []);
});
