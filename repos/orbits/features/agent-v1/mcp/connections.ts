/**
 * agent-design AG17 (设计稿 §5.4「用户怎样管理连接」, 附录 E「外部连接」): the connections of an account — one per
 * client: a later authorisation by the same client changes the connection it already has (视觉稿第 3 组; the user may
 * lower a level there too) — with their scopes, when they were last used and when they were revoked; and the record
 * of every tool call (connection, tool, scopes, how many records went back).
 *
 * Revoking marks the connection first; every call reads the connection, so the next call is refused whatever its token
 * says. The proposals it made that nobody confirmed are then voided by the caller (proposals.ts).
 */
import { randomToken } from "./auth/config";
import { CALL_COLLECTION, CONNECTION_COLLECTION, CONNECTION_LIST_LIMIT, USAGE_COLLECTION, type McpRecords, type StoredRow } from "./records";
import type { McpScope } from "./scopes";

export interface AgentConnection {
  id: string;
  /** The canonical account the connection reads and proposes for. */
  accountId: string;
  /** The sign-in subject the account was authorised under; the actor is resolved from it on every call. */
  userId: string;
  workspaceId: string;
  clientId: string;
  clientName: string;
  scopes: McpScope[];
  /** The language of the cards this connection's proposals become (the user's language when they agreed). */
  locale: "zh" | "ja" | "en";
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
  /** Why it ended: the user revoked it, or a spent code or refresh token was presented again. */
  revokedReason?: "user" | "code_reuse" | "refresh_reuse";
  version: number;
}

export interface AgentConnectionCall {
  id: string;
  connectionId: string;
  accountId: string;
  /** tools/list, or the tool that was called. */
  tool: string;
  scopes: McpScope[];
  /** ok, or why the call was refused (insufficient_scope, invalid_arguments …). */
  outcome: string;
  /** How many records went back in the result. */
  count: number;
  protocolVersion: string;
  at: string;
  version: number;
}

export interface ConnectionService {
  create(input: Pick<AgentConnection, "accountId" | "userId" | "clientId" | "clientName" | "scopes" | "locale">): Promise<AgentConnection>;
  get(connectionId: string): Promise<AgentConnection | null>;
  /** The account's active connection of this client (the newest, should there ever be two), or null. */
  findActive(accountId: string, clientId: string): Promise<AgentConnection | null>;
  /** Replaces what an active connection may do (the same client authorised again). Null when it is gone or revoked. */
  regrant(input: { connectionId: string; scopes: readonly McpScope[]; locale: AgentConnection["locale"]; userId: string }): Promise<AgentConnection | null>;
  /** The account's connections, newest first, with their last use. Revoked ones are left out unless asked for. */
  list(accountId: string, options?: { includeRevoked?: boolean }): Promise<(AgentConnection & { lastUsedAt: string | null })[]>;
  /** Marks the connection revoked (idempotent). Null when it is not this account's; `changed` is false when it already was. */
  revoke(input: { connectionId: string; accountId?: string; reason: NonNullable<AgentConnection["revokedReason"]> }): Promise<{ connection: AgentConnection; changed: boolean } | null>;
  recordCall(connection: AgentConnection, call: Pick<AgentConnectionCall, "tool" | "outcome" | "count" | "protocolVersion">): Promise<void>;
}

export const isActive = (connection: AgentConnection | null | undefined): connection is AgentConnection => Boolean(connection) && !connection!.revokedAt;

export function createConnectionService(deps: { records: McpRecords; workspaceId: string; now: () => string }): ConnectionService {
  const { records } = deps;
  const read = (connectionId: string) => records.get<AgentConnection>(CONNECTION_COLLECTION, connectionId);
  return {
    async create(input) {
      const at = deps.now();
      const connection: AgentConnection = { ...input, createdAt: at, id: `conn_${randomToken(18)}`, scopes: [...input.scopes], updatedAt: at, version: 1, workspaceId: deps.workspaceId };
      if (!(await records.insert(CONNECTION_COLLECTION, connection.id, connection.accountId, connection, at))) throw new Error("A connection with this id already exists.");
      return connection;
    },
    async get(connectionId) {
      return (await read(connectionId))?.value ?? null;
    },
    async findActive(accountId, clientId) {
      const connections = await records.list<AgentConnection>(CONNECTION_COLLECTION, accountId, { limit: CONNECTION_LIST_LIMIT });
      return connections.filter((connection) => connection.accountId === accountId && connection.clientId === clientId && !connection.revokedAt).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
    },
    async regrant(input) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const current: StoredRow<AgentConnection> | null = await read(input.connectionId);
        if (!current || current.value.revokedAt) return null;
        const at = deps.now();
        const next: AgentConnection = { ...current.value, locale: input.locale, scopes: [...input.scopes], updatedAt: at, userId: input.userId, version: current.value.version + 1 };
        if (await records.replace(CONNECTION_COLLECTION, next.id, next.accountId, current, next, at)) return next;
      }
      throw new Error("The connection kept changing while what it may do was being changed.");
    },
    async list(accountId, options = {}) {
      const connections = (await records.list<AgentConnection>(CONNECTION_COLLECTION, accountId, { limit: CONNECTION_LIST_LIMIT }))
        .filter((connection) => connection.accountId === accountId && (options.includeRevoked || !connection.revokedAt))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const listed: (AgentConnection & { lastUsedAt: string | null })[] = [];
      for (const connection of connections) {
        const usage = await records.get<{ lastUsedAt: string; version: number }>(USAGE_COLLECTION, connection.id);
        listed.push({ ...connection, lastUsedAt: usage?.value.lastUsedAt ?? null });
      }
      return listed;
    },
    async revoke(input) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const current: StoredRow<AgentConnection> | null = await read(input.connectionId);
        if (!current || (input.accountId !== undefined && current.value.accountId !== input.accountId)) return null;
        if (current.value.revokedAt) return { changed: false, connection: current.value };
        const at = deps.now();
        const next: AgentConnection = { ...current.value, revokedAt: at, revokedReason: input.reason, updatedAt: at, version: current.value.version + 1 };
        if (await records.replace(CONNECTION_COLLECTION, next.id, next.accountId, current, next, at)) return { changed: true, connection: next };
      }
      throw new Error("The connection kept changing while it was being revoked.");
    },
    async recordCall(connection, call) {
      const at = deps.now();
      const row: AgentConnectionCall = { ...call, accountId: connection.accountId, at, connectionId: connection.id, id: `call_${randomToken(12)}`, scopes: [...connection.scopes], version: 1 };
      await records.insert(CALL_COLLECTION, row.id, connection.accountId, row, at, { sourceId: connection.id });
      await records.put(USAGE_COLLECTION, connection.id, connection.accountId, { connectionId: connection.id, lastUsedAt: at, version: 1 }, at);
    },
  };
}
