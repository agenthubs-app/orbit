import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const implementationPromise: Promise<any> = import('../../scripts/prepare-simulator-acceptance-fixtures').catch((error: any) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const target = {databaseId: 'isolated-sprint0046', workspaceId: 'workspace:qa:sprint0046'};
const records = [
  {collection: 'messages', id: 'exact-message-a', actorId: 'qa-a', role: 'message-a', payload: {body: 'synthetic-only'}},
  {collection: 'messages', id: 'exact-message-b', actorId: 'qa-b', role: 'message-b', payload: {body: 'synthetic-only'}},
  ...['reminder', 'suggestion', 'update'].map(kind => ({collection: 'inbox_notifications', id: `exact-${kind}`, actorId: 'qa-a', role: `notification-${kind}`, payload: {kind}})),
  {collection: 'needs', id: 'exact-need', actorId: 'qa-a', role: 'saved-need', payload: {text: 'synthetic-only'}},
  {collection: 'events', id: 'exact-event', actorId: 'qa-a', role: 'registration-event', payload: {status: 'confirmed'}},
];
const input = () => ({target, allowedTargets: [target], allowedActorIds: ['qa-a', 'qa-b'], allowedRecordIds: records.map(r => r.id), records});

test('default fixture preparation is dry-run with exact IDs and no payload disclosure', async () => {
  const implementation = await implementationPromise;
  assert.equal(typeof implementation.prepareAcceptanceFixtures, 'function', 'fixture planner is not implemented');
  const result = implementation.prepareAcceptanceFixtures(input());
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.realSamplesVerified, false);
  assert.equal(result.records.length, 7);
  assert.equal(JSON.stringify(result).includes('synthetic-only'), false);
  assert.deepEqual(result.pendingLiveChecks, ['message-binding-and-readback', 'notification-source-access', 'saved-need-results', 'event-registration-eligibility']);
});
test('unlisted target, actor, record and duplicate identity are rejected', async () => {
  const implementation = await implementationPromise;
  assert.equal(typeof implementation.prepareAcceptanceFixtures, 'function');
  for (const patch of [
    {target: {...target, databaseId: 'production'}},
    {target: {...target, databaseId: 'postgres://private-connection-test-sentinel'}, allowedTargets: [{...target, databaseId: 'postgres://private-connection-test-sentinel'}]},
    {allowedActorIds: ['qa-a']}, {allowedRecordIds: []}, {records: [...records, records[0]]},
    {records: records.filter(record => record.role !== 'saved-need')},
    {records: records.map(record => record.role === 'message-b' ? {...record, actorId: 'qa-a'} : record)},
  ]) assert.throws(() => implementation.prepareAcceptanceFixtures({...input(), ...patch}));
  assert.throws(() => implementation.prepareAcceptanceFixtures({...input(), mode: 'apply'}), /REAL_APPLY_NOT_AUTHORIZED/);
});
test('test adapter replay creates once; cleanup removes only unchanged exact created records', async () => {
  const implementation = await implementationPromise;
  assert.equal(typeof implementation.runAcceptanceFixtureTestAdapter, 'function');
  const store = new Map<string, any>([['unrelated', {body: 'keep'}]]);
  const adapter = {target, records: store};
  const manifest = await implementation.runAcceptanceFixtureTestAdapter(input(), adapter);
  assert.equal(manifest.scope, 'test-adapter-only');
  assert.equal(manifest.createdIds.length, 7);
  const replay = await implementation.runAcceptanceFixtureTestAdapter(input(), adapter);
  assert.equal(replay.createdIds.length, 0);
  assert.equal(store.size, 8);
  store.set('exact-message-a', {scope: 'test-adapter-only', planSha256: manifest.planSha256});
  const cleanup = await implementation.cleanupAcceptanceFixtureTestAdapter(manifest, adapter);
  assert.deepEqual(cleanup.retainedChangedIds, ['exact-message-a']);
  assert.equal(cleanup.deletedIds.length, 6);
  assert.deepEqual(store.get('unrelated'), {body: 'keep'});
  assert.equal(store.size, 2);
  const repeatedCleanup = await implementation.cleanupAcceptanceFixtureTestAdapter(manifest, adapter);
  assert.equal(repeatedCleanup.deletedIds.length, 0);
  assert.equal(repeatedCleanup.absentIds.length, 6);
  assert.deepEqual(repeatedCleanup.retainedChangedIds, ['exact-message-a']);
});
test('fixture CLI rejects real apply with an exact safe failure code and no argument disclosure', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prepare-simulator-acceptance-fixtures.ts', '--apply', 'private-secret-test-sentinel'], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stderr.trim());
  assert.equal(output.status, 'failed');
  assert.equal(output.code, 'REAL_APPLY_NOT_AUTHORIZED');
  assert.equal(result.stderr.includes('private-secret-test-sentinel'), false);
});
test('preexisting collision and wrong cleanup target cause no mutation', async () => {
  const implementation = await implementationPromise;
  assert.equal(typeof implementation.runAcceptanceFixtureTestAdapter, 'function');
  const store = new Map<string, any>([['exact-message-a', {foreign: true}]]);
  const adapter = {target, records: store};
  await assert.rejects(() => implementation.runAcceptanceFixtureTestAdapter(input(), adapter), /RECORD_COLLISION/);
  assert.equal(store.size, 1);
  store.clear();
  store.set('exact-event', {foreign: true});
  await assert.rejects(() => implementation.runAcceptanceFixtureTestAdapter(input(), adapter), /RECORD_COLLISION/);
  assert.equal(store.size, 1);
  await assert.rejects(() => implementation.cleanupAcceptanceFixtureTestAdapter({target, scope: 'test-adapter-only', createdIds: [], records: []}, {...adapter, target: {...target, workspaceId: 'other'}}), /TARGET_NOT_ALLOWED/);
  await assert.rejects(() => implementation.runAcceptanceFixtureTestAdapter(input(), {target, records: {get: () => null, set: () => {throw new Error('must not invoke a external adapter');}}}), /MEMORY_ADAPTER_REQUIRED/);
});
