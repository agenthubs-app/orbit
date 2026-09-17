import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';

interface Target {databaseId: string; workspaceId: string;}
interface FixtureSpec {collection: string; id: string; actorId: string; role: string; payload: Record<string, unknown>;}
interface PreparationInput {target: Target; allowedTargets: Target[]; allowedActorIds: string[]; allowedRecordIds: string[]; records: FixtureSpec[]; mode?: string;}
interface PreparedRecord {collection: string; id: string; actorId: string; role: string; sha256: string;}
interface TestManifest {scope: 'test-adapter-only'; target: Target; planSha256: string; createdIds: string[]; records: PreparedRecord[];}
interface MemoryAdapter {target: Target; records: Map<string, unknown>;}
const requiredRoles = ['message-a', 'message-b', 'notification-reminder', 'notification-suggestion', 'notification-update', 'saved-need', 'registration-event'];
const pendingLiveChecks = ['message-binding-and-readback', 'notification-source-access', 'saved-need-results', 'event-registration-eligibility'];
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\s\u0000-\u001f\u007f*?]/u.test(value);
const sameTarget = (left: Target, right: Target) => left?.databaseId === right?.databaseId && left?.workspaceId === right?.workspaceId;
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  throw Error('JSON_FIXTURE_REQUIRED');
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

// No env loading, DB factory, auth provisioning, migration or business API call.
export function prepareAcceptanceFixtures(input: PreparationInput) {
  if (input.mode !== undefined && input.mode !== 'dry-run') throw Error('REAL_APPLY_NOT_AUTHORIZED');
  if (typeof input.target?.databaseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.target.databaseId)
    || !identifier(input.target?.workspaceId) || /[@/\\]/u.test(input.target.workspaceId)
    || !Array.isArray(input.allowedTargets) || !input.allowedTargets.some(target => sameTarget(target, input.target))) throw Error('TARGET_NOT_ALLOWED');
  if (!Array.isArray(input.records) || !Array.isArray(input.allowedActorIds) || !Array.isArray(input.allowedRecordIds)) throw Error('EXACT_ALLOWLIST_REQUIRED');
  const ids = new Set<string>();
  const records = input.records.map(record => {
    if (![record.collection, record.id, record.actorId, record.role].every(identifier)
      || !input.allowedActorIds.includes(record.actorId) || !input.allowedRecordIds.includes(record.id)) throw Error('RECORD_NOT_ALLOWED');
    if (ids.has(record.id)) throw Error('DUPLICATE_RECORD_ID');
    ids.add(record.id);
    return {collection: record.collection, id: record.id, actorId: record.actorId, role: record.role, sha256: digest(record)};
  });
  if (requiredRoles.some(role => records.filter(record => record.role === role).length !== 1)) throw Error('REQUIRED_SAMPLE_ROLE_MISSING_OR_DUPLICATE');
  if (records.find(record => record.role === 'message-a')!.actorId === records.find(record => record.role === 'message-b')!.actorId) throw Error('DISTINCT_MESSAGE_ACTORS_REQUIRED');
  const target = {...input.target};
  return {mode: 'dry-run' as const, target, records, planSha256: digest({target, records}), realSamplesVerified: false, pendingLiveChecks: [...pendingLiveChecks]};
}

function assertMemoryAdapter(adapter: MemoryAdapter, target: Target) {
  if (!sameTarget(adapter.target, target)) throw Error('TARGET_NOT_ALLOWED');
  // Genuine built-in Map only: user-provided I/O methods are never invoked.
  try {Map.prototype.has.call(adapter.records, '__memory_check__');} catch {throw Error('MEMORY_ADAPTER_REQUIRED');}
}

export async function runAcceptanceFixtureTestAdapter(input: PreparationInput, adapter: MemoryAdapter): Promise<TestManifest> {
  const plan = prepareAcceptanceFixtures(input);
  assertMemoryAdapter(adapter, plan.target);
  const entries = input.records.map(record => ({record, value: {scope: 'test-adapter-only', planSha256: plan.planSha256, record}}));
  // Check all collisions before changing even one memory record.
  for (const {record, value} of entries) {
    const existing = Map.prototype.get.call(adapter.records, record.id);
    if (Map.prototype.has.call(adapter.records, record.id) && digest(existing) !== digest(value)) throw Error('RECORD_COLLISION');
  }
  const createdIds: string[] = [];
  for (const {record, value} of entries) {
    if (!Map.prototype.has.call(adapter.records, record.id)) {
      Map.prototype.set.call(adapter.records, record.id, JSON.parse(canonical(value)));
      createdIds.push(record.id);
    }
  }
  return {scope: 'test-adapter-only', target: plan.target, planSha256: plan.planSha256, records: plan.records, createdIds};
}

export async function cleanupAcceptanceFixtureTestAdapter(manifest: TestManifest, adapter: MemoryAdapter) {
  assertMemoryAdapter(adapter, manifest.target);
  if (manifest.scope !== 'test-adapter-only' || !Array.isArray(manifest.records) || !Array.isArray(manifest.createdIds)
    || manifest.planSha256 !== digest({target: manifest.target, records: manifest.records})
    || new Set(manifest.createdIds).size !== manifest.createdIds.length
    || manifest.createdIds.some(id => !identifier(id) || manifest.records.filter(record => record.id === id).length !== 1)) throw Error('INVALID_CLEANUP_MANIFEST');
  const deletedIds: string[] = [], retainedChangedIds: string[] = [], absentIds: string[] = [];
  for (const id of manifest.createdIds) {
    if (!Map.prototype.has.call(adapter.records, id)) {absentIds.push(id); continue;}
    const value = Map.prototype.get.call(adapter.records, id) as {scope?: string; planSha256?: string; record?: FixtureSpec};
    let recordSha256: string | null = null;
    try {recordSha256 = digest(value?.record);} catch { /* Malformed/changed records must be retained, not abort cleanup. */ }
    if (value?.scope !== 'test-adapter-only' || value.planSha256 !== manifest.planSha256
      || recordSha256 !== manifest.records.find(record => record.id === id)!.sha256) {retainedChangedIds.push(id); continue;}
    Map.prototype.delete.call(adapter.records, id);
    deletedIds.push(id);
  }
  return {scope: 'test-adapter-only', target: {...manifest.target}, deletedIds, retainedChangedIds, absentIds, realCleanupPerformed: false};
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.some(value => ['--apply', '--cleanup'].includes(value))) throw Error('REAL_APPLY_NOT_AUTHORIZED');
  if (argv.length !== 2 || argv[0] !== '--plan' || !isAbsolute(argv[1])) throw Error('INVALID_ARGUMENTS');
  return prepareAcceptanceFixtures(JSON.parse(await readFile(argv[1], 'utf8')));
}
if (process.argv[1]?.endsWith('/prepare-simulator-acceptance-fixtures.ts')) {
  main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    const code = /^[A-Z][A-Z0-9_]+$/.test(error?.message) ? error.message : 'PREREQUISITE_UNAVAILABLE';
    console.error(JSON.stringify({status: 'failed', code, realSamplesVerified: false}));
    process.exitCode = 1;
  });
}
