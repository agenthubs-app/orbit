import assert from 'node:assert/strict';
import test from 'node:test';
import { createSecretaryPreviewGetHandler } from '../../app/api/inbox/secretary/preview/handler';
import { parseSecretaryPreviewForActor } from '../../shared/api-schema/secretary-preview';

const actor = { id: 'demo-actor', accountId: 'demo-actor', workspaceId: 'local' };

test('mock returns a private, owner-scoped demo preview without mail', async () => {
  const response = await createSecretaryPreviewGetHandler({ resolveActor: async () => actor, mode: () => 'mock' })();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  const preview = parseSecretaryPreviewForActor(body.data, actor.id);
  assert.equal(preview.items.length, 3);
  assert.equal(preview.items.every(item => item.notification.sample === true), true);
  assert.equal(preview.items.every(item => item.notification.sources.every(source => source.sourceKind !== 'mail_summary')), true);
});

test('live is explicitly unavailable and authentication is required', async () => {
  const unavailable = await createSecretaryPreviewGetHandler({ resolveActor: async () => actor, mode: () => 'live' })();
  assert.equal(unavailable.status, 503);
  const body = await unavailable.json();
  assert.equal(body.error.context.reason, 'NOT_IMPLEMENTED');
  assert.equal((await createSecretaryPreviewGetHandler({ resolveActor: async () => null, mode: () => 'mock' })()).status, 401);
});

test('live reads current actor notifications beyond the first page and never serves another actor', async () => {
  const seed = (await (await createSecretaryPreviewGetHandler({ resolveActor: async () => actor, mode: () => 'mock' })()).json()).data;
  const source = seed.items[0].notification;
  const pages = [
    { items: Array.from({ length: 50 }, (_, n) => ({ ...source, id: `ordinary-${n}`, sources: [{ ...source.sources[0], sourceKind: 'task' }] })), nextCursor: 'p2' },
    { items: [source], nextCursor: null },
  ];
  const response = await createSecretaryPreviewGetHandler({ resolveActor: async () => actor, mode: () => 'live', readLive: async actorId => {
    assert.equal(actorId, actor.id);
    return pages;
  } })();
  assert.equal(response.status, 200);
  assert.deepEqual(parseSecretaryPreviewForActor((await response.json()).data, actor.id).items.map(item => item.notification.id), [source.id]);
  const mixed = await createSecretaryPreviewGetHandler({ resolveActor: async () => actor, mode: () => 'live', readLive: async () => [{ items: [{ ...source, actorId: 'other' }], nextCursor: null }] })();
  assert.equal(mixed.status, 503);
});
