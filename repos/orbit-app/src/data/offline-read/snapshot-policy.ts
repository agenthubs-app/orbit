import type { ReadScope, ReadSurface } from '../../api/contract/universal-read';

interface SnapshotSchema {
  safeParse(value: unknown): { success: boolean; data?: unknown };
}
export interface SnapshotTtlConfiguration {
  selector: string;
  schemaVersion: number;
  maxTtlMs: number;
  schema: SnapshotSchema;
}
export interface SnapshotPolicyDependencies {
  resolveSurface(selector: string): ReadSurface | null;
  ttlConfigurations?: readonly SnapshotTtlConfiguration[];
  currentScope(): ReadScope | null;
  sha256(bytes: Uint8Array): Promise<string>;
}
export interface SnapshotInput {
  selector: string;
  scope: ReadScope;
  schemaVersion: number;
  expiresAt: number;
  payload: unknown;
  byteLength?: number;
  sha256?: string;
}
export interface ValidatedSnapshot {
  readonly selector: string;
  readonly scope: Readonly<ReadScope>;
  readonly schemaVersion: number;
  readonly expiresAt: number;
  readonly serializedPayload: string;
  readonly byteLength: number;
  readonly sha256: string;
}
const MAX_SNAPSHOT_BYTES = 262144;
const SCOPE_KEYS = ['baseUrl', 'actorId', 'workspaceId', 'domainId', 'authorizationEpoch'] as const;
const SECRET_FIELDS = new Set(['password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken', 'idtoken', 'authorization', 'cookie', 'secret', 'clientsecret', 'apikey', 'credentials', 'privatekey', 'databasekey', 'databasekeyref', 'providertoken', 'providercredentials', 'provideraccesstoken', 'providerrefreshtoken']);
function sameScope(left: Readonly<ReadScope>, right: ReadScope | null): boolean {
  return right !== null && SCOPE_KEYS.every((key) => typeof left[key] === 'string' && left[key].length > 0 && left[key] === right[key]);
}
// Copy JSON before any await; reject values serialization would silently drop or change.
function snapshotJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) throw new Error('SNAPSHOT_BINARY');
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || value === null) throw new Error('SNAPSHOT_NON_JSON');
  if (ancestors.has(value)) throw new Error('SNAPSHOT_CYCLE');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('SNAPSHOT_NON_JSON');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) throw new Error('SNAPSHOT_NON_JSON');
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error('SNAPSHOT_NON_JSON');
        return snapshotJson(descriptor.value, ancestors);
      });
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new Error('SNAPSHOT_NON_JSON');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error('SNAPSHOT_NON_JSON');
      const normalized = key.toLowerCase().replace(/[_-]/g, '');
      if (SECRET_FIELDS.has(normalized) || normalized === 'base64' || normalized === 'binarydata') throw new Error('SNAPSHOT_FORBIDDEN_FIELD');
      result[key] = snapshotJson(descriptor.value, ancestors);
    }
    return result;
  } finally { ancestors.delete(value); }
}
export function createSnapshotPolicy(deps: SnapshotPolicyDependencies) {
  const configurations = (deps.ttlConfigurations ?? []).map((entry) => ({ ...entry }));
  return {
    async validateSnapshot(input: SnapshotInput, now: number): Promise<ValidatedSnapshot> {
      const { selector, schemaVersion, expiresAt, byteLength: claimedLength, sha256: claimedHash } = input;
      const scope = Object.freeze({
        baseUrl: input.scope.baseUrl, actorId: input.scope.actorId,
        workspaceId: input.scope.workspaceId, domainId: input.scope.domainId,
        authorizationEpoch: input.scope.authorizationEpoch,
      });
      const current = deps.currentScope();
      if (!sameScope(scope, current)) throw new Error('SNAPSHOT_NOT_AUTHORIZED');
      const binding = Object.freeze({ ...current }) as Readonly<ReadScope>;
      const surface = deps.resolveSurface(selector);
      const matches = configurations.filter((entry) => entry.selector === selector && entry.schemaVersion === schemaVersion);
      if (!surface || surface.selector !== selector || surface.method !== 'GET' || surface.readPersistence !== 'encrypted_ttl_snapshot' || surface.domainId !== scope.domainId || surface.schemaVersion !== schemaVersion || surface.binaryPolicy !== 'metadata_only' || matches.length !== 1) throw new Error('SNAPSHOT_SURFACE_DENIED');
      const configuration = matches[0]!;
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= now || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1 || !Number.isSafeInteger(configuration.maxTtlMs) || configuration.maxTtlMs <= 0 || expiresAt - now > configuration.maxTtlMs) throw new Error('SNAPSHOT_EXPIRY_OR_SCHEMA');
      const payload = snapshotJson(input.payload);
      const serializedPayload = JSON.stringify(payload);
      const parsed = configuration.schema.safeParse(payload);
      // A stripping/defaulting schema is not a strict response gate.
      if (!parsed.success || JSON.stringify(snapshotJson(parsed.data)) !== serializedPayload) throw new Error('SNAPSHOT_SCHEMA');
      const bytes = new TextEncoder().encode(serializedPayload);
      if (bytes.byteLength > MAX_SNAPSHOT_BYTES || (claimedLength !== undefined && claimedLength !== bytes.byteLength)) throw new Error('SNAPSHOT_BYTE_LENGTH');
      const sha256 = await deps.sha256(bytes.slice());
      if (!/^[a-f0-9]{64}$/.test(sha256) || (claimedHash !== undefined && claimedHash !== sha256)) throw new Error('SNAPSHOT_HASH');
      if (!sameScope(binding, deps.currentScope())) throw new Error('SNAPSHOT_NOT_AUTHORIZED');
      return Object.freeze({ selector, scope, schemaVersion, expiresAt, serializedPayload, byteLength: bytes.byteLength, sha256 });
    },
  };
}
