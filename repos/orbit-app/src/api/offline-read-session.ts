import type { OfflineReadEnvelope, ReadIdentityState, ReadScope } from './contract/universal-read';
import { offlineReadEnvelopeSchema, readScopeSchema } from './schema/universal-read';

const maximumLeaseAgeMs = 7 * 24 * 60 * 60 * 1000;

export interface OfflineReadIdentityCheck {
  actorId: string;
  subject: string;
  revoked?: boolean;
}

function normalizedBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/u, '')}`;
  } catch {
    return null;
  }
}

function decodedEnvelope(value: unknown): OfflineReadEnvelope | null {
  const parsed = offlineReadEnvelopeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Checks lease rules only. Callers must verify issuance, active identity and storage separately. */
export function evaluateOfflineRead(value: unknown, baseUrl: string, now: number, identity?: OfflineReadIdentityCheck): ReadIdentityState {
  if (identity?.revoked) return 'revoked';
  const envelope = decodedEnvelope(value);
  if (!envelope || !Number.isSafeInteger(now) || now < 0) return 'locked';
  const expectedUrl = normalizedBaseUrl(baseUrl);
  if (!expectedUrl || normalizedBaseUrl(envelope.baseUrl) !== expectedUrl) return 'locked';
  if (identity && (envelope.actorId !== identity.actorId || envelope.subject !== identity.subject)) return 'locked';
  const { lastVerifiedAt, offlineReadExpiresAt, sessionExpiresAt } = envelope;
  if (![lastVerifiedAt, offlineReadExpiresAt, sessionExpiresAt].every(Number.isSafeInteger)
    || now < lastVerifiedAt || now >= offlineReadExpiresAt || now >= sessionExpiresAt
    || offlineReadExpiresAt > sessionExpiresAt || offlineReadExpiresAt - lastVerifiedAt > maximumLeaseAgeMs) return 'locked';
  return 'local-read';
}

/** A pure predicate; it does not establish that the supplied online state is authoritative. */
export function assertOnlineMutation(state: ReadIdentityState): void {
  if (state !== 'online') throw new Error('ONLINE_REQUIRED');
}

/** Checks exact lease membership, not current server authorization or mirror completeness. */
export function assertOfflineReadGrant(value: unknown, scope: ReadScope, now: number, identity?: OfflineReadIdentityCheck): void {
  const parsedScope = readScopeSchema.safeParse(scope);
  if (!parsedScope.success || evaluateOfflineRead(value, scope.baseUrl, now, identity) !== 'local-read') throw new Error('OFFLINE_READ_LOCKED');
  const envelope = decodedEnvelope(value)!;
  if (envelope.actorId !== scope.actorId || !envelope.grants.some(grant => grant.workspaceId === scope.workspaceId
    && grant.domainId === scope.domainId && grant.authorizationEpoch === scope.authorizationEpoch)) throw new Error('OFFLINE_READ_NOT_AUTHORIZED');
}
