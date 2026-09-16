import assert from 'node:assert/strict';
import test from 'node:test';
import { issueOfflineReadLease, type OfflineReadLeaseContext, type OfflineReadLeaseDependencies } from '../../features/sync/offline-read-lease';
import { offlineReadEnvelopeSchema } from '../../shared/api-schema/universal-read';

const now = 1_000_000;
const week = 7 * 24 * 60 * 60 * 1000;
const context: OfflineReadLeaseContext = { actorId: 'account-a', subject: 'auth-subject-a', expiresAt: now + week * 2, baseUrl: 'https://orbit.example/', workspaceId: 'workspace-a', databaseKeyRef: 'opaque-reference' };
const domains = ['notes', 'messages', 'events', 'ai-history'];
// This fake port supplies fixture assertions only, never production authorization evidence.
const snapshot = { actorId: context.actorId, subject: context.subject, workspaceId: context.workspaceId, consistency: 'atomic', epochAuthority: 'durable', coveredDomainIds: domains, grants: domains.map(domainId => ({ workspaceId: context.workspaceId, domainId, authorizationEpoch: `persistent-fixture-${domainId}` })) };
function dependencies(value: unknown = snapshot): OfflineReadLeaseDependencies {
  return { registeredDomainIds: domains, authorizer: { readAtomicSnapshot: async () => value } };
}

test('issuer clamps to session, requested age and seven days without generating key material', async () => {
  for (const [sessionAge, requestedAge, expectedAge] of [[week * 2, week * 3, week], [100, 200, 100], [200, 100, 100]]) {
    const result = await issueOfflineReadLease({ ...context, expiresAt: now + sessionAge! }, now, requestedAge!, dependencies());
    assert.equal(result.offlineReadExpiresAt, now + expectedAge!);
    assert.equal(result.baseUrl, 'https://orbit.example');
    assert.equal(result.databaseKeyRef, context.databaseKeyRef);
    assert.equal(result.lastVerifiedAt, now);
    assert.equal(offlineReadEnvelopeSchema.safeParse(result).success, true);
  }
});

test('missing authorizer, registry, expiry and invalid clocks never issue a lease', async () => {
  await assert.rejects(issueOfflineReadLease(context, now, 100));
  await assert.rejects(issueOfflineReadLease(context, now, 100, { registeredDomainIds: [], authorizer: dependencies().authorizer }));
  for (const expiresAt of [undefined, now, now - 1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(issueOfflineReadLease({ ...context, expiresAt } as OfflineReadLeaseContext, now, 100, dependencies()));
  }
  for (const invalid of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(issueOfflineReadLease(context, invalid, 100, dependencies()));
  for (const invalid of [0, -1, Infinity, NaN, 0.5]) await assert.rejects(issueOfflineReadLease(context, now, invalid, dependencies()));
});

test('snapshot must bind canonical actor, raw subject and server workspace exactly', async () => {
  for (const change of [{ actorId: 'account-b' }, { subject: 'auth-subject-b' }, { workspaceId: 'workspace-b' }]) {
    await assert.rejects(issueOfflineReadLease(context, now, 100, dependencies({ ...snapshot, ...change })));
  }
});

test('partial coverage or absent atomic durable epoch qualification is rejected', async () => {
  for (const change of [{ consistency: 'partial' }, { epochAuthority: 'volatile' }, { coveredDomainIds: ['notes'] }, { coveredDomainIds: [...domains, 'unknown'] }, { coveredDomainIds: [...domains, domains[0]] }]) {
    await assert.rejects(issueOfflineReadLease(context, now, 100, dependencies({ ...snapshot, ...change })));
  }
});

test('unknown domain, foreign workspace, missing epoch and duplicate grants fail closed', async () => {
  for (const grants of [[{ ...snapshot.grants[0], domainId: 'unknown' }], [{ ...snapshot.grants[0], workspaceId: 'workspace-b' }], [{ ...snapshot.grants[0], authorizationEpoch: '' }], [snapshot.grants[0], snapshot.grants[0]]]) {
    await assert.rejects(issueOfflineReadLease(context, now, 100, dependencies({ ...snapshot, grants })));
  }
});

test('complete authorization coverage may deny domains without inventing grants', async () => {
  const result = await issueOfflineReadLease(context, now, 100, dependencies({ ...snapshot, grants: [] }));
  assert.deepEqual(result.grants, []);
  assert.deepEqual((await issueOfflineReadLease(context, now, 100, dependencies())).grants.map(grant => grant.domainId), domains);
});

test('authorizer failure and malformed server context cannot downgrade to a lease', async () => {
  const failed: OfflineReadLeaseDependencies = { registeredDomainIds: domains, authorizer: { readAtomicSnapshot: async () => { throw new Error('fixture-authorizer-unavailable'); } } };
  await assert.rejects(issueOfflineReadLease(context, now, 100, failed));
  for (const change of [{ baseUrl: 'https://user@orbit.example' }, { baseUrl: 'https://orbit.example?scope=other' }, { actorId: '' }, { subject: '' }, { databaseKeyRef: '' }, { workspaceId: '' }]) {
    await assert.rejects(issueOfflineReadLease({ ...context, ...change }, now, 100, dependencies()));
  }
});
