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
  assert.deepEqual(await auditReadSurfaces(root), { unregistered: [], invalid: [] });
  assert.ok(surfaces.some(row => row.readPersistence === 'device_only' && row.mutationPolicy === 'local_only'));
  assert.ok(surfaces.every(row => row.mutationPolicy !== 'offline_queue'));
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
