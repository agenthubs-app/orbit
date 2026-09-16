import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditReadSurfaces, extractReadCalls } from '../scripts/audit-offline-read-surfaces';
import { resolveReadSurface, matchTemplate, surfaces } from '../src/data/offline-read/route-domain-inventory';

// Each assertion protects a persistence boundary, or exercises the audit on real AST inputs.
test('unknown and secret endpoints never default to persistence', () => {
  assert.throws(() => resolveReadSurface('GET', '/api/new-private-domain'), /UNREGISTERED_READ/);
  assert.equal(resolveReadSurface('GET', '/api/auth/session').readPersistence, 'online_only_secret');
  assert.equal(resolveReadSurface('GET', '/api/notes/n1').domainId, 'notes');
  assert.equal(resolveReadSurface('GET', '/api/notes?actorId=other').domainId, 'notes');
  assert.equal(resolveReadSurface('POST', '/api/notes').mutationPolicy, 'online_only');
  assert.throws(() => resolveReadSurface('DELETE', '/api/auth/session'), /UNREGISTERED_READ/);
  const providerTodo = resolveReadSurface('GET', '/api/relationship-signals/email-calendar');
  assert.match(providerTodo.selector, /^todo:external-provider-oauth$/);
  assert.equal(providerTodo.readPersistence, 'online_only_secret');
  assert.equal(providerTodo.binaryPolicy, 'never_local');
  for (const [method, path] of [
    ['POST', '/api/account/session/sign-out'],
    ['POST', '/api/auth/register'],
    ['POST', '/api/auth/mobile/credentials'],
    ['POST', '/api/auth/mobile/google/exchange'],
    ['GET', '/api/auth/mobile/providers'],
    ['GET', '/api/auth/session'],
    ['POST', '/api/devices/push-tokens'],
    ['DELETE', '/api/devices/push-token'],
  ] as const) {
    const surface = resolveReadSurface(method, path);
    assert.equal(surface.readPersistence, 'online_only_secret', `${method} ${path}`);
    assert.equal(surface.binaryPolicy, 'never_local', `${method} ${path}`);
  }
});

test('path matching rejects malformed paths and never widens literal or segment boundaries', () => {
  for (const path of ['/api/notes/', '/api/notes/a/extra', '/api/notes//', '/api/notes/%2f', '/api/notes/%2e%2e', '/api/notes/%ZZ', 'https://other.test/api/notes/a', '//api/notes/a', '/api/notes/../a']) {
    assert.equal(matchTemplate('/api/notes/:id', path), false, path);
  }
  assert.equal(matchTemplate('/api/notes/:id', '/api/notes/n1?q=hello'), true);
  assert.equal(matchTemplate('/api/notes/:id', '/api/tasks/n1'), false);
});

test('the actual native consumers all have explicit versioned policies', async () => {
  const root = resolve(import.meta.dirname, '..');
  const extracted = await extractReadCalls(root);
  assert.ok(extracted.calls.some(row => row.endpointTemplate === '/api/notes' && row.method === 'GET'));
  assert.ok(extracted.calls.some(row => row.endpointTemplate.includes('/messages')));
  const actual = new Set(extracted.calls.map(row => `${row.consumerFile} ${row.method} ${row.endpointTemplate}`));
  for (const expected of [
    'src/screens/inbox/NotificationDetailScreen.tsx GET /api/inbox/notifications/:id',
    'src/screens/inbox/NotificationDetailScreen.tsx POST /api/inbox/notifications/:id/actions',
    'src/screens/settings/NotificationDeliverySettings.tsx GET /api/inbox/delivery/preferences',
    'src/screens/settings/NotificationDeliverySettings.tsx POST /api/inbox/delivery/preferences',
    'src/screens/settings/NotificationDiscoverySettings.tsx GET /api/inbox/discovery/preferences',
    'src/screens/settings/NotificationDiscoverySettings.tsx POST /api/inbox/discovery/preferences',
    'src/screens/inbox/RelationshipInboxScreen.tsx POST /api/relationship-communication/conversations/:id/read',
    'src/screens/inbox/RelationshipInboxScreen.tsx GET /api/chat/privacy',
    'src/screens/inbox/RelationshipInboxScreen.tsx PATCH /api/agent/signals/:id',
    'src/screens/inbox/RelationshipInboxScreen.tsx POST /api/notifications/:id/state',
  ]) assert.ok(actual.has(expected), expected);
  assert.deepEqual(await auditReadSurfaces(root), { unregistered: [], invalid: [] });
  assert.ok(surfaces.some(row => row.readPersistence === 'device_only' && row.mutationPolicy === 'local_only'));
  assert.ok(surfaces.every(row => row.mutationPolicy !== 'offline_queue'));
});

test('wrapper aliases, generic requests and computed client methods are audited independently', async t => {
  const root = await fixture(t, {
    'src/api/wrappers.ts': 'export const clientGet = (path: string) => client.get(path);',
    'src/screens/Aliased.ts': 'import { clientGet as load } from "../api/wrappers"; load("/api/alias-read");',
    'src/screens/Generic.ts': 'function request(method: "get" | "post", path: string) { return client[method](path); } request("post", "/api/generic-write");',
    'src/screens/Computed.ts': 'const method = enabled ? "get" : "patch"; client[method]("/api/computed");',
  });
  const result = await extractReadCalls(root);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.calls.map(row => [row.consumerFile, row.method, row.endpointTemplate]).sort(), [
    ['src/screens/Aliased.ts', 'GET', '/api/alias-read'],
    ['src/screens/Computed.ts', 'GET', '/api/computed'],
    ['src/screens/Computed.ts', 'PATCH', '/api/computed'],
    ['src/screens/Generic.ts', 'POST', '/api/generic-write'],
  ]);
});

test('computed clients and generic requests reject unresolved methods and paths', async t => {
  const root = await fixture(t, {
    'src/screens/Hidden.tsx': 'client[chooseMethod()]("/api/computed"); request("get", computeRemotePath());',
  });
  const result = await auditReadSurfaces(root);
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_METHOD')));
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_PATH')));
});

test('reads and mutations on one endpoint remain separate registered surfaces', () => {
  const read = resolveReadSurface('GET', '/api/inbox/delivery/preferences');
  const mutation = resolveReadSurface('POST', '/api/inbox/delivery/preferences');
  assert.notEqual(read.selector, mutation.selector);
  assert.equal(read.domainId, 'notification-delivery');
  assert.equal(mutation.mutationPolicy, 'online_only');
  assert.equal(resolveReadSurface('GET', '/api/inbox/discovery/preferences').domainId, 'notification-discovery');
  assert.equal(resolveReadSurface('GET', '/api/chat/privacy?conversationId=c1').domainId, 'chat-privacy');
  assert.equal(resolveReadSurface('POST', '/api/notifications/n1/state').domainId, 'message-read-state');
  assert.equal(resolveReadSurface('POST', '/api/relationship-communication/conversations/c1/read').domainId, 'message-read-state');
});

async function fixture(t: test.TestContext, files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'orbit-read-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}

test('AST audit follows imported constants, aliases, templates, mutations and raw streams', async t => {
  const root = await fixture(t, {
    'src/api/paths.ts': 'export const paths = { notes: "/api/notes" }; export const detail = (id: string) => `${paths.notes}/${encodeURIComponent(id)}`;',
    'app/hidden.tsx': 'import { paths as p, detail as d } from "../src/api/paths"; client.get(p.notes); client.patch(d(id), {}); fetch("/api/new-private-domain"); fetch(`/api/raw/${encodeURIComponent(id)}`, { method: "POST" });',
  });
  const result = await extractReadCalls(root);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.calls.filter(row => row.consumerFile === 'app/hidden.tsx').map(row => [row.method, row.endpointTemplate]).sort(), [
    ['GET', '/api/new-private-domain'], ['GET', '/api/notes'], ['PATCH', '/api/notes/:id'], ['POST', '/api/raw/:id'],
  ]);
  const audit = await auditReadSurfaces(root);
  assert.ok(audit.unregistered.some(row => row.includes('/api/new-private-domain')));
  // A known endpoint in an unregistered consumer must also fail.
  assert.ok(audit.unregistered.some(row => row.includes('app/hidden.tsx') && row.includes('/api/notes')));
});

test('unresolved computed paths and dynamic HTTP methods fail the audit', async t => {
  const root = await fixture(t, { 'src/screens/Hidden.tsx': 'client.get(computeRemotePath()); fetch(remoteUrl, { method: chooseMethod() });' });
  const result = await auditReadSurfaces(root);
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_PATH')));
  assert.ok(result.invalid.some(row => row.includes('UNRESOLVED_METHOD')));
});

test('an empty source tree cannot pass coverage', async t => {
  const root = await fixture(t, {});
  assert.ok((await auditReadSurfaces(root)).invalid.includes('NO_READ_CONSUMERS'));
});
