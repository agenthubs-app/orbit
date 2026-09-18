import { z } from 'zod';
import { offlineReadEnvelopeSchema } from '../../shared/api-schema/universal-read';
import type { OfflineReadEnvelope } from '../../shared/contract/universal-read';

const maximumLeaseAgeMs = 7 * 24 * 60 * 60 * 1000;
const identifier = z.string().min(1).max(512).refine(value => value.trim() === value);
const contextSchema = z.object({
  actorId: identifier, subject: identifier, workspaceId: identifier,
  expiresAt: z.number().int().nonnegative().refine(Number.isSafeInteger),
  baseUrl: z.string().url(), databaseKeyRef: identifier,
}).strict();
const snapshotSchema = z.object({
  actorId: identifier, subject: identifier, workspaceId: identifier,
  consistency: z.literal('atomic'), epochAuthority: z.literal('durable'),
  coveredDomainIds: z.array(identifier), grants: z.array(z.unknown()),
}).strict();

export type OfflineReadLeaseContext = z.infer<typeof contextSchema>;
export interface OfflineReadLeaseDependencies {
  /** Accepted server registry, never a request's domain list or an inventory-derived grant. */
  registeredDomainIds: readonly string[];
  authorizer: {
    /**
     * Trusted implementation must read bindings, complete coverage and durable epochs atomically.
     * Snapshot qualification strings assert this internal contract; they do not prove database authority.
     * Production authorization and epoch storage are not implemented by this issuer.
     */
    readAtomicSnapshot(context: Readonly<OfflineReadLeaseContext>): Promise<unknown>;
  };
}

/** Pure issuer consuming an already verified session and trusted authorization port; no route or storage wiring. */
export async function issueOfflineReadLease(context: OfflineReadLeaseContext, now: number, maxAgeMs: number, dependencies?: OfflineReadLeaseDependencies): Promise<OfflineReadEnvelope> {
  const bound = Object.freeze(contextSchema.parse(context));
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0 || bound.expiresAt <= now) throw new Error('OFFLINE_READ_INVALID_TIME');
  if (!dependencies?.authorizer || typeof dependencies.authorizer.readAtomicSnapshot !== 'function') throw new Error('OFFLINE_READ_AUTHORIZER_REQUIRED');
  const domainIds = z.array(identifier).min(1).parse(dependencies.registeredDomainIds);
  const registered = new Set(domainIds);
  if (registered.size !== domainIds.length) throw new Error('OFFLINE_READ_INVALID_REGISTRY');
  const url = new URL(bound.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('OFFLINE_READ_INVALID_BASE_URL');
  const baseUrl = `${url.origin}${url.pathname.replace(/\/+$/u, '')}`;
  const expiry = now + Math.min(maxAgeMs, maximumLeaseAgeMs);
  if (!Number.isSafeInteger(expiry)) throw new Error('OFFLINE_READ_INVALID_TIME');
  const snapshot = snapshotSchema.parse(await dependencies.authorizer.readAtomicSnapshot(bound));
  if (snapshot.actorId !== bound.actorId || snapshot.subject !== bound.subject || snapshot.workspaceId !== bound.workspaceId) throw new Error('OFFLINE_READ_SNAPSHOT_SCOPE_MISMATCH');
  const covered = new Set(snapshot.coveredDomainIds);
  if (covered.size !== snapshot.coveredDomainIds.length || covered.size !== registered.size || [...covered].some(domainId => !registered.has(domainId))) throw new Error('OFFLINE_READ_INCOMPLETE_COVERAGE');
  const envelope = offlineReadEnvelopeSchema.parse({
    version: 2, baseUrl, actorId: bound.actorId, subject: bound.subject,
    sessionExpiresAt: bound.expiresAt, offlineReadExpiresAt: Math.min(bound.expiresAt, expiry),
    lastVerifiedAt: now, databaseKeyRef: bound.databaseKeyRef, grants: snapshot.grants,
  });
  const granted = new Set<string>();
  for (const grant of envelope.grants) {
    if (grant.workspaceId !== bound.workspaceId || !registered.has(grant.domainId) || granted.has(grant.domainId)) throw new Error('OFFLINE_READ_INVALID_GRANT');
    granted.add(grant.domainId);
  }
  return envelope;
}
