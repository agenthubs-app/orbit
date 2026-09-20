// Sprint 0097: these three were defined identically here and in offline-policy.
// One definition, so the two files cannot drift apart, and so the shared export
// surface can name them without a collision.
export type { BinaryPolicy, MutationPolicy, ReadPersistence } from "./offline-policy";
import type { BinaryPolicy, MutationPolicy, ReadPersistence } from "./offline-policy";
export type ReadCompleteness = 'fresh' | 'stale' | 'partial' | 'not-downloaded' | 'not-authorized' | 'locked' | 'failure';
export type ReadIdentityState = 'checking' | 'online' | 'local-read' | 'locked' | 'revoked';

export interface ReadScope {
  baseUrl: string;
  actorId: string;
  workspaceId: string;
  domainId: string;
  authorizationEpoch: string;
}

export interface ReadSurface {
  consumerFile: string;
  endpointTemplate: string;
  method: string;
  domainId: string;
  selector: string;
  schemaVersion: number;
  readPersistence: ReadPersistence;
  mutationPolicy: MutationPolicy;
  binaryPolicy: BinaryPolicy;
}

export interface OfflineReadGrant {
  workspaceId: string;
  domainId: string;
  authorizationEpoch: string;
}

export interface OfflineReadEnvelope {
  version: 2;
  baseUrl: string;
  actorId: string;
  subject: string;
  sessionExpiresAt: number;
  offlineReadExpiresAt: number;
  lastVerifiedAt: number;
  grants: readonly OfflineReadGrant[];
  databaseKeyRef: string;
}

export interface DomainChange {
  id: string;
  revision: string;
  operation: 'upsert' | 'delete' | 'visibility-delete';
  payload: Record<string, unknown> | null;
}

export interface DomainPage {
  domainId: string;
  schemaVersion: number;
  registryVersion: number;
  authorizationEpoch: string;
  changes: readonly DomainChange[];
  nextCursor: string;
  highWatermark: string;
  hasMore: boolean;
  generation: string;
  serverTime: string;
}

export interface ReadGrant {
  actorId: string;
  workspaceId: string;
  domainId: string;
  authorizationEpoch: string;
}

export interface CursorClaims extends ReadGrant {
  schemaVersion: number;
  registryVersion: number;
  afterRevision: string;
  highWatermark: string;
  issuedAt: number;
  generation: string;
}

export interface DomainManifestEntry {
  domainId: string;
  schemaVersion: number;
  workspaceId: string;
  authorizationEpoch: string;
  generation: string;
  watermark: string;
  history: 'complete' | 'server-manifest';
  membershipCursor: string | null;
}

export interface DomainManifest {
  registryVersion: number;
  domains: readonly DomainManifestEntry[];
}

export interface AssetManifest {
  id: string;
  scope: ReadScope;
  mediaType: string;
  byteLength: number;
  sha256: string;
  revision: string;
  policy: BinaryPolicy;
  status: 'not-downloaded' | 'partial' | 'verified' | 'failure';
}
