import { z } from 'zod';
import type { AssetManifest, DomainManifest, DomainPage, OfflineReadEnvelope, ReadScope } from '../contract/universal-read';

const id = z.string().trim().min(1).max(512);
const nonnegative = z.number().int().nonnegative();
export const binaryPolicySchema = z.enum(['metadata_only', 'on_demand_encrypted', 'user_pinned_encrypted', 'never_local']);
export const readScopeSchema = z.object({
  baseUrl: z.string().url(), actorId: id, workspaceId: id, domainId: id, authorizationEpoch: id,
}).strict() as z.ZodType<ReadScope>;
export const offlineReadEnvelopeSchema = z.object({
  version: z.literal(2), baseUrl: z.string().url(), actorId: id, subject: id,
  sessionExpiresAt: nonnegative, offlineReadExpiresAt: nonnegative, lastVerifiedAt: nonnegative,
  grants: z.array(z.object({ workspaceId: id, domainId: id, authorizationEpoch: id }).strict()),
  databaseKeyRef: id,
}).strict() as z.ZodType<OfflineReadEnvelope>;
export const domainChangeSchema = z.object({
  id, revision: id, operation: z.enum(['upsert', 'delete', 'visibility-delete']), payload: z.record(z.string(), z.unknown()).nullable(),
}).strict();
export const domainPageSchema = z.object({
  domainId: id, schemaVersion: nonnegative, registryVersion: nonnegative, authorizationEpoch: id,
  changes: z.array(domainChangeSchema), nextCursor: z.string(), highWatermark: id, hasMore: z.boolean(), generation: id,
  serverTime: z.string().datetime({ offset: true }),
}).strict() as z.ZodType<DomainPage>;
export const domainManifestSchema = z.object({
  registryVersion: nonnegative,
  domains: z.array(z.object({
    domainId: id, schemaVersion: nonnegative, workspaceId: id, authorizationEpoch: id, generation: id,
    watermark: id, history: z.enum(['complete', 'server-manifest']), membershipCursor: z.string().nullable(),
  }).strict()),
}).strict() as z.ZodType<DomainManifest>;
export const assetManifestSchema = z.object({
  id, scope: readScopeSchema, mediaType: id, byteLength: nonnegative, sha256: id, revision: id,
  policy: binaryPolicySchema, status: z.enum(['not-downloaded', 'partial', 'verified', 'failure']),
}).strict() as z.ZodType<AssetManifest>;
