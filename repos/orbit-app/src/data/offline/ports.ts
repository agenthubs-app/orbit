export type ScopeCapability = object;

export interface ScopePort {
  assertLocalRead(scope: ScopeCapability, domainId: string): void;
  requireOnline(scope: ScopeCapability, domainId: string): Promise<void>;
  storageKey(scope: ScopeCapability, domainId: string): string;
  isActive(scope: ScopeCapability): boolean;
}

export interface ProjectionPort {
  parse(domainId: string, schemaVersion: number, payload: unknown): unknown;
  compareRevision(domainId: string, left: string, right: string): number;
}
