export type AiReadDomain =
  | "notes"
  | "tasks"
  | "followups"
  | "schedule"
  | "aiHistory"
  | "contacts"
  | "relationshipEvidence"
  | "messages"
  | "notifications"
  | "meetings"
  | "events"
  | "goals"
  | "agentData";

export type AiReadTool = `${AiReadDomain}.query`;

export interface ReadScope {
  actorId: string;
  workspaceId: string;
  authorizationEpoch: string;
}

export interface ReadInput {
  operation: "list" | "search" | "get";
  query: string;
  id?: string;
  cursor?: string;
  limit?: number;
  contactId?: string;
  eventId?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface CanonicalRow {
  id: string;
  revision: string;
  updatedAt: string;
  fields: Readonly<Record<string, unknown>>;
  evidenceIds: readonly string[];
  /** Opaque source continuation. It is sealed into a cursor and never exposed as result data. */
  position: string;
}

export interface ReadPage {
  rows: readonly CanonicalRow[];
  nextPosition?: string;
  snapshot: string;
  partialReasons: readonly ("text_limit" | "byte_limit" | "source_unavailable" | "known_stale")[];
}

export interface CanonicalRevisionFence {
  id: string;
  revision: string;
}

export interface ReadAdapter {
  authorize(scope: ReadScope): Promise<boolean>;
  page(scope: ReadScope, input: ReadInput, position?: string, snapshot?: string): Promise<ReadPage>;
  authorizeEvidence(scope: ReadScope, ids: readonly string[]): Promise<readonly string[]>;
  /**
   * Atomically reauthorizes source rows and evidence, verifies every expected revision,
   * and returns the canonical content read inside that same consistency boundary.
   * Missing, changed, or unauthorized rows must be omitted so the caller fails closed.
   */
  readCurrentAtRevision(
    scope: ReadScope,
    expected: readonly CanonicalRevisionFence[],
  ): Promise<readonly CanonicalRow[]>;
}

export interface AiReadResult {
  domain: AiReadDomain;
  operation: ReadInput["operation"];
  items: readonly Readonly<Record<string, unknown>>[];
  authority: "cloud_canonical";
  readAt: string;
  records: readonly { id: string; revision: string; updatedAt: string; evidenceIds: readonly string[] }[];
  truncated: boolean;
  nextCursor?: string;
  partialReasons: readonly string[];
  evidenceIds: readonly string[];
}

export interface AiReadPermission {
  tool: AiReadTool;
  domain: AiReadDomain;
  schemaVersion: 1;
  fields: readonly string[];
  maxItems: 10;
  enabled(scope: ReadScope): Promise<boolean>;
}

export interface ReadDependencies {
  permission(tool: AiReadTool): AiReadPermission;
  adapter(tool: AiReadTool): ReadAdapter;
  currentScope(): Promise<ReadScope>;
  readAuthorityExpiresAt(scope: ReadScope): Promise<string>;
  cursorKey: Uint8Array;
  now(): string;
}
