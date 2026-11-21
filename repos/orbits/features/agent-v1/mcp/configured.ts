/**
 * agent-design AG17: the MCP services on the product data path — the configured record store (the same connection the
 * product uses; the local eval database in the eval), the ledger of each account, the read adapters of AG05 and the
 * deployment secret. Null when no database or no secret is configured: the endpoints then answer 503 and issue nothing.
 *
 * The actor resolver is passed in (the API layer's single identity boundary); this module never reads a session.
 */
import { readAccountRightsGateState } from "../../account/data-rights/access-policy";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import { createOrbitAgentRuntimeService } from "../../agent/runtime/service-factory";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createConfiguredInboxRuntime } from "../../notifications/inbox-record-service-factory";
import { configuredRecordAccess } from "../domains/configured";
import { emitTrace } from "../observability/trace";
import { externalProposalInboxEntry } from "./inbox";
import { createClientRegistry } from "./auth/clients";
import { mcpAddresses, mcpSecret, type McpAddresses } from "./auth/config";
import { createAuthorizationServer, type AuthorizationServer } from "./auth/server";
import { createProposalService, type ProposalSeams, type ProposalService } from "./confirm-link";
import { createConnectionService, type AgentConnection, type ConnectionService } from "./connections";
import { createMcpRecords } from "./records";
import { createCursorSealer } from "./tools/cursor";
import { createMcpEndpoint } from "./transport";

export interface McpServices {
  addresses: (request: Request) => McpAddresses | null;
  auth: AuthorizationServer;
  connections: ConnectionService;
  proposals: ProposalService;
  endpoint: ReturnType<typeof createMcpEndpoint>;
  /** Revokes a connection of this account and voids what it proposed that nobody confirmed. Null when it is not theirs. */
  revoke: (input: { connectionId: string; accountId: string }) => Promise<{ connection: AgentConnection; voided: number } | null>;
  runtimeFor: (accountId: string) => AgentRuntimeService;
}

export interface ConfiguredMcpOptions {
  /** The canonical account behind a sign-in subject (app/api/_shared/authenticated-actor.ts); null when there is none. */
  resolveAccountId: (userId: string) => Promise<string | null>;
}

/**
 * A new proposal writes one inbox entry with source «外部提议» (AG15's inbox). The one-off timer that marks the card
 * expired at its time needs nothing here: the account's ledger sets it for every card it freezes.
 */
export const PROPOSAL_SEAMS: ProposalSeams = {
  async notifyProposed({ action, connection, proposal }) {
    const inbox = createConfiguredInboxRuntime();
    if (!inbox) throw new Error("The inbox is not configured.");
    const written = await inbox.service.upsert(externalProposalInboxEntry({ action, connection, now: new Date().toISOString(), proposal }));
    emitTrace({ cardId: action.actionId, connectionId: connection.id, inboxId: written.id, outcome: "written", sourceKind: "external_proposal", type: "notify.inbox" });
  },
};

const globalCache = globalThis as typeof globalThis & { __orbitMcpServices?: McpServices | null };

export function configuredMcp(options: ConfiguredMcpOptions): McpServices | null {
  if (globalCache.__orbitMcpServices) return globalCache.__orbitMcpServices;
  const secret = mcpSecret();
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!secret || !configured) return null;
  const now = () => new Date().toISOString();
  const records = createMcpRecords(configured.store, configured.workspaceId);
  const connections = createConnectionService({ now, records, workspaceId: configured.workspaceId });
  const runtimeFor = (accountId: string) => createOrbitAgentRuntimeService("live", { actorId: accountId });
  const proposals = createProposalService({ connections, now, records, runtimeFor, seams: PROPOSAL_SEAMS, secret });
  const auth = createAuthorizationServer({ clients: createClientRegistry(), connections, now, onRevoked: async (connection) => void (await proposals.voidOpen(connection)), records, secret });
  const access = configuredRecordAccess();
  const endpoint = createMcpEndpoint({
    accountOpen: async (connection) => {
      // The same identity boundary a session goes through; an account being deleted is closed to its connections too.
      const accountId = await options.resolveAccountId(connection.userId);
      if (accountId !== connection.accountId) return false;
      return (await readAccountRightsGateState(connection.userId)) === "active";
    },
    addresses: (request) => mcpAddresses(request),
    auth,
    connections,
    tools: { cursors: createCursorSealer(secret), now, proposals, records: (accountId) => (access ? { reader: access.reader, scope: access.scope(accountId) } : null) },
  });
  const services: McpServices = {
    addresses: (request) => mcpAddresses(request),
    auth,
    connections,
    endpoint,
    proposals,
    async revoke(input) {
      const revoked = await connections.revoke({ accountId: input.accountId, connectionId: input.connectionId, reason: "user" });
      if (!revoked) return null;
      // Marked first (the next call is refused), then the open proposals are voided; done again on a repeat, harmlessly.
      const { voided } = await proposals.voidOpen(revoked.connection);
      return { connection: revoked.connection, voided };
    },
    runtimeFor,
  };
  globalCache.__orbitMcpServices = services;
  return services;
}

export function resetConfiguredMcpForTests(): void {
  globalCache.__orbitMcpServices = undefined;
}
