import assert from 'node:assert/strict';
import test from 'node:test';
import type { OfflineReadEnvelope, ReadIdentityState, ReadScope } from '../src/api/contract/universal-read';
import { assertOfflineReadGrant, assertOnlineMutation, evaluateOfflineRead } from '../src/api/offline-read-session';

const now = 1_000_000;
const maxAge = 7 * 24 * 60 * 60 * 1000;
const identity = { actorId: 'account-a', subject: 'auth-subject-a' };
const envelope: OfflineReadEnvelope = {
  version: 2, baseUrl: 'https://orbit.example/api-root/', ...identity,
  sessionExpiresAt: now + maxAge, offlineReadExpiresAt: now + 1000,
  lastVerifiedAt: now, databaseKeyRef: 'opaque-key-reference',
  grants: ['notes', 'tasks', 'personal-schedule', 'messages', 'events', 'ai-history'].map(domainId => ({
    workspaceId: 'workspace-a', domainId, authorizationEpoch: 'epoch-a',
  })),
};
const scope: ReadScope = { baseUrl: envelope.baseUrl, actorId: identity.actorId, workspaceId: 'workspace-a', domainId: 'messages', authorizationEpoch: 'epoch-a' };

test('missing, legacy and malformed envelopes cannot unlock', () => {
  for (const value of [null, undefined, { cookieHeader: 'legacy' }, { ...envelope, version: 1 }, { ...envelope, token: 'extra' }, { ...envelope, grants: [{ ...envelope.grants[0], extra: true }] }, { ...envelope, databaseKeyRef: '' }]) {
    assert.equal(evaluateOfflineRead(value, envelope.baseUrl, now), 'locked');
  }
});

test('lease evaluation normalizes the server URL and checks both identity fields', () => {
  assert.equal(evaluateOfflineRead(envelope, 'https://ORBIT.example:443/api-root', now, identity), 'local-read');
  for (const baseUrl of ['https://other.example/api-root', 'https://orbit.example/other', 'https://user@orbit.example/api-root', 'https://orbit.example/api-root?scope=other', 'invalid']) {
    assert.equal(evaluateOfflineRead(envelope, baseUrl, now, identity), 'locked');
  }
  assert.equal(evaluateOfflineRead(envelope, envelope.baseUrl, now, { ...identity, actorId: 'account-b' }), 'locked');
  assert.equal(evaluateOfflineRead(envelope, envelope.baseUrl, now, { ...identity, subject: 'auth-subject-b' }), 'locked');
});

test('expiry, server session bound and seven-day maximum fail closed', () => {
  for (const value of [
    { ...envelope, offlineReadExpiresAt: now },
    { ...envelope, sessionExpiresAt: now },
    { ...envelope, offlineReadExpiresAt: envelope.sessionExpiresAt + 1 },
    { ...envelope, sessionExpiresAt: now + maxAge + 1, offlineReadExpiresAt: now + maxAge + 1 },
  ]) assert.equal(evaluateOfflineRead(value, envelope.baseUrl, now), 'locked');
  assert.equal(evaluateOfflineRead({ ...envelope, offlineReadExpiresAt: now + maxAge }, envelope.baseUrl, now), 'local-read');
});

test('backward clocks and unsafe timestamps cannot unlock', () => {
  for (const time of [now - 1, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(evaluateOfflineRead(envelope, envelope.baseUrl, time), 'locked');
  }
  assert.equal(evaluateOfflineRead({ ...envelope, sessionExpiresAt: Number.MAX_SAFE_INTEGER + 1 }, envelope.baseUrl, now), 'locked');
});

test('explicit revocation cannot be undone by a still-valid lease', () => {
  assert.equal(evaluateOfflineRead(envelope, envelope.baseUrl, now, { ...identity, revoked: true }), 'revoked');
  assert.throws(() => assertOfflineReadGrant(envelope, scope, now, { ...identity, revoked: true }), /OFFLINE_READ_LOCKED/);
});

test('only online state satisfies the pure mutation guard', () => {
  for (const state of ['checking', 'local-read', 'locked', 'revoked'] as ReadIdentityState[]) {
    assert.throws(() => assertOnlineMutation(state), /ONLINE_REQUIRED/);
  }
  assert.doesNotThrow(() => assertOnlineMutation('online'));
});

test('read grants are exact across account, workspace, domain and authorization epoch', () => {
  assert.doesNotThrow(() => assertOfflineReadGrant(envelope, scope, now, identity));
  for (const changed of [{ actorId: 'account-b' }, { workspaceId: 'workspace-b' }, { domainId: 'unknown' }, { authorizationEpoch: 'epoch-b' }, { baseUrl: 'https://other.example' }]) {
    assert.throws(() => assertOfflineReadGrant(envelope, { ...scope, ...changed }, now, identity));
  }
  assert.throws(() => assertOfflineReadGrant({ ...envelope, grants: [] }, scope, now, identity), /OFFLINE_READ_NOT_AUTHORIZED/);
});

test('all granted read domains are eligible independently of the initial mutation set', () => {
  for (const domainId of ['messages', 'events', 'ai-history']) {
    assert.doesNotThrow(() => assertOfflineReadGrant(envelope, { ...scope, domainId }, now, identity));
  }
  // A lease-rule result neither establishes storage readiness nor issues online capability.
  assert.equal(evaluateOfflineRead({ ...envelope, grants: [] }, envelope.baseUrl, now), 'local-read');
  assert.throws(() => assertOnlineMutation(evaluateOfflineRead(envelope, envelope.baseUrl, now)), /ONLINE_REQUIRED/);
});
