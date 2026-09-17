import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { z } from 'zod';
import type { ReadScope, ReadSurface } from '../src/api/contract/universal-read';
import { createSnapshotPolicy } from '../src/data/offline-read/snapshot-policy';
const scope: ReadScope = { baseUrl: 'https://example.invalid', actorId: 'a', workspaceId: 'w', domainId: 'test', authorizationEpoch: 'e' };
const surface: ReadSurface = { consumerFile: 'test-only', endpointTemplate: '/test', method: 'GET', domainId: 'test', selector: 'test', schemaVersion: 1, readPersistence: 'encrypted_ttl_snapshot', mutationPolicy: 'online_only', binaryPolicy: 'metadata_only' };
const schema = z.strictObject({ nested: z.strictObject({ text: z.string() }) });
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function fixture(hash = async (bytes: Uint8Array) => digest(bytes)) {
  let current: ReadScope | null = { ...scope };
  const policy = createSnapshotPolicy({ resolveSurface: (key) => key === 'test' ? surface : null, ttlConfigurations: [{ selector: 'test', schemaVersion: 1, maxTtlMs: 1000, schema }], currentScope: () => current, sha256: hash });
  return { policy, setScope: (value: ReadScope | null) => { current = value; } };
}
const input = () => ({ selector: 'test', scope: { ...scope }, schemaVersion: 1, expiresAt: 1000, payload: { nested: { text: '中文' } } });
test('actual UTF8/hash and immutable serialized result', async () => {
  const value = input(); const result = await fixture().policy.validateSnapshot(value, 100);
  assert.equal(result.serializedPayload, JSON.stringify(value.payload));
  assert.equal(result.byteLength, Buffer.byteLength(result.serializedPayload));
  assert.equal(result.sha256, digest(Buffer.from(result.serializedPayload)));
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.scope));
});
test('empty production TTL allowlist, unknown and non-TTL reject', async () => {
  const deps = { resolveSurface: () => surface, currentScope: () => scope, sha256: async (bytes: Uint8Array) => digest(bytes) };
  await assert.rejects(createSnapshotPolicy(deps).validateSnapshot(input(), 100));
  await assert.rejects(fixture().policy.validateSnapshot({ ...input(), selector: 'unknown' }, 100));
  for (const kind of ['durable_normalized', 'device_only', 'online_only_secret'] as const) await assert.rejects(createSnapshotPolicy({ ...deps, resolveSurface: () => ({ ...surface, readPersistence: kind }), ttlConfigurations: [{ selector: 'test', schemaVersion: 1, maxTtlMs: 1000, schema }] }).validateSnapshot(input(), 100));
});
test('strict nested DTO rejects unknown, secret, binary and non-JSON', async () => {
  for (const payload of [{ nested: { text: 'x', extra: 1 } }, { nested: { text: 'x' }, access_token: 'secret' }, { nested: { text: new Uint8Array([1]) } }, { nested: { text: 'data:image/png;base64,AA==' } }, { nested: { text: undefined } }]) await assert.rejects(fixture().policy.validateSnapshot({ ...input(), payload }, 100));
});
test('expiry/schema/scope/integrity and actual multibyte cap', async () => {
  for (const patch of [{ expiresAt: 100 }, { expiresAt: 1101 }, { expiresAt: NaN }, { schemaVersion: 2 }, { scope: { ...scope, actorId: 'other' } }, { byteLength: 1 }, { sha256: '0'.repeat(64) }, { payload: { nested: { text: '中'.repeat(90000) } } }]) await assert.rejects(fixture().policy.validateSnapshot({ ...input(), ...patch }, 100));
  for (const now of [NaN, Infinity, -1, 1.5]) await assert.rejects(fixture().policy.validateSnapshot(input(), now));
});
test('mutable nested input and scope snapshotted before await', async () => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); const value = input();
  const pending = fixture(async (bytes) => { await gate; return digest(bytes); }).policy.validateSnapshot(value, 100);
  value.payload.nested.text = 'mutated'; value.scope.authorizationEpoch = 'changed'; release();
  const result = await pending; assert.equal(result.serializedPayload, JSON.stringify({ nested: { text: '中文' } })); assert.equal(result.scope.authorizationEpoch, 'e');
});
test('revocation and every trusted scope change during await reject', async () => {
  for (const changed of [null, ...Object.keys(scope).map((key) => ({ ...scope, [key]: 'changed' }))]) {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); const f = fixture(async (bytes) => { await gate; return digest(bytes); });
    const pending = f.policy.validateSnapshot(input(), 100); f.setScope(changed); release(); await assert.rejects(pending);
  }
});
test('hash errors/invalid output fail visibly; bytes cannot mutate serialized result', async () => {
  await assert.rejects(fixture(async () => { throw new Error('hash failed'); }).policy.validateSnapshot(input(), 100), /hash failed/);
  await assert.rejects(fixture(async () => 'invalid').policy.validateSnapshot(input(), 100));
  const result = await fixture(async (bytes) => { const hash = digest(bytes); bytes.fill(0); return hash; }).policy.validateSnapshot(input(), 100);
  assert.equal(result.sha256, digest(Buffer.from(result.serializedPayload)));
});
test('rejects lossy JSON values, cyclic objects and array accessors', async () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const accessor: unknown[] = []; Object.defineProperty(accessor, '0', { get: () => 'x', enumerable: true });
  for (const payload of [cycle, { x: NaN }, { x: BigInt(1) }, { x: () => 1 }, { x: new Date() }, { x: new Array(1) }, { x: accessor }]) await assert.rejects(fixture().policy.validateSnapshot({ ...input(), payload }, 100));
});
test('scope output contains only owned scalar binding fields', async () => {
  const value = { ...input(), scope: { ...scope, extra: { mutable: true } } };
  const result = await fixture().policy.validateSnapshot(value, 100);
  assert.deepEqual(result.scope, scope);
});
test('valid array DTO still rejects accessor-backed array values', async () => {
  const items: string[] = []; Object.defineProperty(items, '0', { get: () => 'x', enumerable: true });
  const policy = createSnapshotPolicy({ resolveSurface: () => surface, currentScope: () => scope, sha256: async (bytes) => digest(bytes), ttlConfigurations: [{ selector: 'test', schemaVersion: 1, maxTtlMs: 1000, schema: z.strictObject({ items: z.array(z.string()) }) }] });
  await assert.rejects(policy.validateSnapshot({ ...input(), payload: { items } }, 100));
});
test('registered TTL surface must be GET even with otherwise valid configuration', async () => {
  for (const method of ['POST', 'PATCH']) {
    const policy = createSnapshotPolicy({ resolveSurface: () => ({ ...surface, method }), currentScope: () => scope, sha256: async (bytes) => digest(bytes), ttlConfigurations: [{ selector: 'test', schemaVersion: 1, maxTtlMs: 1000, schema }] });
    await assert.rejects(policy.validateSnapshot(input(), 100));
  }
});
test('strict DTO cannot authorize provider credential aliases with correct integrity', async () => {
  for (const field of ['providerToken', 'provider_credentials', 'provider-access-token', 'providerRefreshToken']) {
    const payload = { [field]: 'sensitive' };
    const serialized = JSON.stringify(payload);
    const policy = createSnapshotPolicy({ resolveSurface: () => surface, currentScope: () => scope, sha256: async (bytes) => digest(bytes), ttlConfigurations: [{ selector: 'test', schemaVersion: 1, maxTtlMs: 1000, schema: z.strictObject({ [field]: z.string() }) }] });
    await assert.rejects(policy.validateSnapshot({ ...input(), payload, byteLength: Buffer.byteLength(serialized), sha256: digest(Buffer.from(serialized)) }, 100));
  }
});
test('actual multibyte bytes exactly at cap allowed and one byte over rejected', async () => {
  const overhead = Buffer.byteLength(JSON.stringify({ nested: { text: '' } }));
  const available = 262144 - overhead;
  const text = '中'.repeat(Math.floor(available / 3)) + 'a'.repeat(available % 3);
  for (const extra of ['', 'a']) {
    const payload = { nested: { text: text + extra } }; const serialized = JSON.stringify(payload);
    const value = { ...input(), payload, byteLength: Buffer.byteLength(serialized), sha256: digest(Buffer.from(serialized)) };
    assert.equal(value.byteLength, 262144 + extra.length);
    if (extra) await assert.rejects(fixture().policy.validateSnapshot(value, 100), /SNAPSHOT_BYTE_LENGTH/);
    else assert.equal((await fixture().policy.validateSnapshot(value, 100)).byteLength, 262144);
  }
});
test('ordinary token counts and base64-like user text remain valid', async () => {
  const policy = createSnapshotPolicy({ resolveSurface: () => surface, currentScope: () => scope, sha256: async (bytes) => digest(bytes), ttlConfigurations: [{ selector: 'test', schemaVersion: 1, maxTtlMs: 1000, schema: z.strictObject({ tokenCount: z.number(), text: z.string() }) }] });
  const payload = { tokenCount: 2, text: 'YWJjZA==' };
  assert.equal((await policy.validateSnapshot({ ...input(), payload }, 100)).serializedPayload, JSON.stringify(payload));
});
