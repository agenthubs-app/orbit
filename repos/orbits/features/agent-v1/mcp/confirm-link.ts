/**
 * agent-design AG17 (设计稿 §5.4「确认链接」, §5.1): what an external agent proposes becomes a card in the ledger, waiting
 * for the user. The agent gets back only an id, a link and when the link stops working:
 *
 *   proposal_id   an opaque id: HMAC(deployment key, connection + the agent's own idempotency key). Not guessable, and
 *                 the same key from the same connection always means the same proposal.
 *   confirm_url   /app/agent/proposals/<proposal_id> — nothing else in it: no account, no token, no record content.
 *   expires_at    24 hours after the card was made (the card's own expiresAt; checked whenever the card is read or decided).
 *
 * The card's own id is derived separately and is never given to the agent; the page shows the card only to the account
 * the proposal belongs to. Nothing here can confirm a card: that is the signed-in user's click on the decision interface.
 *
 * Two parts wait for AG15 behind `ProposalSeams`: the inbox entry «外部提议» and the one-off timer that marks the card
 * expired at its time. Without the timer nothing is unsafe: reading and deciding both judge expiry from expiresAt.
 */
import type { AgentActionRecord } from "../../agent/runtime/contract";
import type { CardOperationIntent } from "../../agent/runtime/card-operations";
import { cardOperationStatus, effectiveCardStatus } from "../../agent/runtime/decision";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import { derivedKey, hmac, PROPOSAL_PAGE_PATH, sha256, type McpAddresses } from "./auth/config";
import { isActive, type AgentConnection, type ConnectionService } from "./connections";
import { PROPOSAL_COLLECTION, PROPOSAL_LIST_LIMIT, type McpRecords } from "./records";

export interface StoredProposal {
  id: string;
  connectionId: string;
  accountId: string;
  /** The ledger card; never leaves the server towards the agent. */
  actionId: string;
  /** What was proposed, hashed: the same key with other content is a conflict. */
  requestHash: string;
  clientName: string;
  createdAt: string;
  version: number;
}

/** AG15 connects these two; until then they do nothing (see the file comment). */
export interface ProposalSeams {
  /** Writes the inbox entry with source «外部提议», saying which client proposed it. */
  notifyProposed?: (input: { proposal: StoredProposal; action: AgentActionRecord; connection: AgentConnection }) => Promise<void>;
  /** Asks the one-off timer to mark the card expired at `expiresAt`. */
  scheduleExpiry?: (input: { proposal: StoredProposal; actionId: string; accountId: string; expiresAt: string }) => Promise<void>;
}

export type ProposeOutcome =
  | { kind: "proposed"; proposal: StoredProposal; action: AgentActionRecord; created: boolean }
  /** The same idempotency key was used before with different operations. */
  | { kind: "conflict" }
  /** A record to change does not exist (or is not this account's); nothing was made. */
  | { kind: "missing"; targets: readonly string[] }
  /** The connection was revoked while this was running; the card was voided. */
  | { kind: "revoked" }
  /** The connection already made as many proposals in the last 24 hours as one connection may. */
  | { kind: "too_many"; limit: number };

export interface ProposalReceipt {
  proposal: StoredProposal;
  status: AgentActionRecord["status"];
  expiresAt: string | null;
  items: { index: number; op: string; state: string }[];
}

export interface ProposalService {
  propose(input: { connection: AgentConnection; idempotencyKey: string; intents: readonly CardOperationIntent[]; request: unknown }): Promise<ProposeOutcome>;
  /** The state and receipts of a proposal this connection made; null for any other id. */
  receipt(input: { connection: AgentConnection; proposalId: string }): Promise<ProposalReceipt | null>;
  /** For the confirm page: the proposal, only when it belongs to this account. An unknown id and another account's read the same. */
  forAccount(input: { proposalId: string; accountId: string }): Promise<StoredProposal | null>;
  /** Voids every proposal of the connection that nobody confirmed; what was already carried out stays. */
  voidOpen(connection: AgentConnection): Promise<{ voided: number }>;
  confirmUrl(addresses: McpAddresses, proposalId: string): string;
}

const OPEN: readonly AgentActionRecord["status"][] = ["awaiting_confirmation", "deferred"];

/**
 * How many new proposals one connection may make in 24 hours. An agent cannot fill the user's Orbit with cards, and
 * because a proposal lives 24 hours, every proposal that can still be confirmed is among the latest PROPOSAL_LIST_LIMIT
 * rows a revocation looks at (the cap is far below that limit).
 */
export const MAX_PROPOSALS_PER_DAY = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Key order does not change what was proposed. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function createProposalService(deps: {
  secret: string;
  records: McpRecords;
  connections: ConnectionService;
  runtimeFor: (accountId: string) => AgentRuntimeService;
  now: () => string;
  seams?: ProposalSeams;
  maxProposalsPerDay?: number;
}): ProposalService {
  const dailyLimit = deps.maxProposalsPerDay ?? MAX_PROPOSALS_PER_DAY;
  const idKey = derivedKey(deps.secret, "proposal-id");
  const cardKey = derivedKey(deps.secret, "proposal-card");
  const proposalIdOf = (connectionId: string, idempotencyKey: string) => `prop_${hmac(idKey, `${connectionId}\u0000${idempotencyKey}`)}`;
  const actionIdOf = (proposalId: string) => `card:mcp:${hmac(cardKey, proposalId)}`;
  const read = async (proposalId: string) => (await deps.records.get<StoredProposal>(PROPOSAL_COLLECTION, proposalId))?.value ?? null;

  async function voidCard(runtime: AgentRuntimeService, actionId: string): Promise<boolean> {
    const action = await runtime.getAction(actionId);
    // Already decided, or already past its time: nothing to void.
    if (!action || !OPEN.includes(action.status) || effectiveCardStatus(action, deps.now()) === "expired") return false;
    try {
      await runtime.cancelAction(actionId);
      return true;
    } catch {
      // Decided in between (confirmed, rejected): what the user already did stands.
      return false;
    }
  }

  return {
    confirmUrl: (addresses, proposalId) => `${addresses.issuer}${PROPOSAL_PAGE_PATH}/${proposalId}`,

    async propose(input) {
      const { connection } = input;
      const runtime = deps.runtimeFor(connection.accountId);
      if (!runtime.freezeCard) throw new Error("Cards cannot be frozen here.");
      const id = proposalIdOf(connection.id, input.idempotencyKey);
      const requestHash = sha256(canonical(input.request));
      const existing = await read(id);
      if (existing) {
        if (existing.requestHash !== requestHash) return { kind: "conflict" };
        const action = await runtime.getAction(existing.actionId);
        if (action) return { action, created: false, kind: "proposed", proposal: existing };
      } else {
        // A new proposal: counted against the connection's last 24 hours before anything is frozen.
        const since = Date.parse(deps.now()) - DAY_MS;
        const recent = (await deps.records.list<StoredProposal>(PROPOSAL_COLLECTION, connection.accountId, { limit: PROPOSAL_LIST_LIMIT, sourceId: connection.id })).filter((item) => item.connectionId === connection.id && Date.parse(item.createdAt) > since);
        if (recent.length >= dailyLimit) return { kind: "too_many", limit: dailyLimit };
      }
      const actionId = actionIdOf(id);
      // The server reads the records itself and freezes what it found; nothing the agent says about old values is used.
      const frozen = await runtime.freezeCard({ actionId, intents: input.intents, locale: connection.locale, origin: { connectionId: connection.id, externalRequestKey: input.idempotencyKey, kind: "connection" } });
      if (!frozen.action) return { kind: "missing", targets: frozen.missingTargets };
      const at = deps.now();
      const proposal: StoredProposal = { accountId: connection.accountId, actionId, clientName: connection.clientName, connectionId: connection.id, createdAt: frozen.action.createdAt, id, requestHash, version: 1 };
      const inserted = existing ? false : await deps.records.insert(PROPOSAL_COLLECTION, id, connection.accountId, proposal, at, { sourceId: connection.id });
      const stored = inserted ? proposal : await read(id);
      if (!stored) throw new Error("The proposal could not be recorded.");
      if (stored.requestHash !== requestHash) return { kind: "conflict" };
      // Revoked while this ran: the revocation may have looked for open proposals before this one was recorded.
      if (!isActive(await deps.connections.get(connection.id))) {
        await voidCard(runtime, actionId);
        return { kind: "revoked" };
      }
      if (inserted && frozen.created) {
        await deps.seams?.notifyProposed?.({ action: frozen.action, connection, proposal: stored });
        if (frozen.action.expiresAt) await deps.seams?.scheduleExpiry?.({ accountId: connection.accountId, actionId, expiresAt: frozen.action.expiresAt, proposal: stored });
      }
      return { action: frozen.action, created: inserted, kind: "proposed", proposal: stored };
    },

    async receipt(input) {
      const proposal = await read(input.proposalId);
      if (!proposal || proposal.connectionId !== input.connection.id || proposal.accountId !== input.connection.accountId) return null;
      const runtime = deps.runtimeFor(proposal.accountId);
      const action = await runtime.getAction(proposal.actionId);
      if (!action) return null;
      const now = deps.now();
      const detail = await runtime.getRun(action.runId);
      return {
        expiresAt: action.expiresAt ?? null,
        // Per item: what it is and how it went. No record content.
        items: action.operations.map((op, index) => ({ index: index + 1, op: op.capability ?? op.operationType, state: cardOperationStatus(op.operationId, action, detail, now) })),
        proposal,
        status: effectiveCardStatus(action, now),
      };
    },

    async forAccount(input) {
      const proposal = await read(input.proposalId);
      return proposal && proposal.accountId === input.accountId ? proposal : null;
    },

    async voidOpen(connection) {
      const runtime = deps.runtimeFor(connection.accountId);
      const proposals = await deps.records.list<StoredProposal>(PROPOSAL_COLLECTION, connection.accountId, { limit: PROPOSAL_LIST_LIMIT, sourceId: connection.id });
      let voided = 0;
      for (const proposal of proposals) {
        if (proposal.connectionId !== connection.id) continue;
        if (await voidCard(runtime, proposal.actionId)) voided += 1;
      }
      return { voided };
    },
  };
}
