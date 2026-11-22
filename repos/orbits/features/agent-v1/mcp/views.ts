/**
 * agent-design AG17: what Orbit's own pages get about connections and external proposals (the signed-in user's
 * interfaces, never the agent's): the settings list, the consent page's content and the confirm-link page's card.
 */
import type { AgentConnectionConsentContract, AgentConnectionContract, AgentConnectionScopeOptionContract, AgentProposalViewContract } from "../../../shared/contract/agent-v1";
import { agentCardPreview } from "../../agent/runtime/card-view";
import { canceledMessage, cardMessages, expiredMessage } from "../../agent/runtime/decision";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import { sha256 } from "./auth/config";
import type { AuthorizationRequest } from "./auth/server";
import type { ProposalService } from "./confirm-link";
import type { AgentConnection } from "./connections";
import { MCP_SCOPES, scopeCatalogue } from "./scopes";

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

const LOOPBACK = new Set(["127.0.0.1", "[::1]", "localhost"]);

export const scopeOptions = (): AgentConnectionScopeOptionContract[] => scopeCatalogue();

/** A connection in settings; `waitingProposals` is how many of its proposals still wait for the user (approved draft D10). */
export function connectionView(connection: AgentConnection & { lastUsedAt: string | null; waitingProposals?: number }): AgentConnectionContract {
  return { clientHost: hostOf(connection.clientId), clientName: connection.clientName, createdAt: connection.createdAt, id: connection.id, lastUsedAt: connection.lastUsedAt, scopes: [...connection.scopes], waitingProposals: connection.waitingProposals ?? 0 };
}

/**
 * What the consent page knows the signed-in account by: a key derived from the account (never the id itself), its
 * name and e-mail. The page sends the key back with the answer; another account in between is noticed (draft board 2).
 */
export const accountKeyOf = (accountId: string): string => `acct_${sha256(`orbit-consent-account\u0000${accountId}`).slice(0, 22)}`;

export interface ConsentAccount {
  id: string;
  name?: string | null;
  email?: string | null;
}

/**
 * The consent page names the host the client's document lives on (the document's own name is self-asserted) and where
 * the browser goes back to; who is signed in; and, when this client is already connected, what it may do now.
 *
 * Pre-set (approved draft D2): what the connection already has stays as it is; reading the client asks for and does not
 * have yet is pre-set; «可以提修改» never is — the client's wish is only marked, the tick is the user's own.
 */
export function consentView(request: AuthorizationRequest, context: { account?: ConsentAccount; current?: AgentConnection | null } = {}): AgentConnectionConsentContract {
  const redirectHost = hostOf(request.redirectUri);
  const current = context.current ?? null;
  const preselected = new Set<string>(current ? current.scopes : []);
  for (const scope of request.scopes) if (!scope.endsWith(":propose")) preselected.add(scope);
  const preselectedScopes = MCP_SCOPES.filter((scope) => preselected.has(scope));
  return {
    account: context.account ? { email: context.account.email ?? null, key: accountKeyOf(context.account.id), name: context.account.name ?? null } : { email: null, key: "", name: null },
    clientHost: hostOf(request.clientId),
    clientName: request.clientName,
    current: current ? { connectedAt: current.createdAt, scopes: [...current.scopes] } : null,
    options: scopeOptions(),
    preselectedScopes,
    redirectHost,
    redirectIsLoopback: LOOPBACK.has(redirectHost),
    requestedScopes: [...request.scopes],
  };
}

/**
 * The confirm-link page for the signed-in account. Null for an id that does not exist and for a proposal of another
 * account alike: the page then shows the same «换个账号» note for both and no content of any record.
 */
export async function proposalView(deps: { proposals: ProposalService; runtime: AgentRuntimeService; now: () => string }, input: { proposalId: string; accountId: string }): Promise<AgentProposalViewContract | null> {
  const proposal = await deps.proposals.forAccount(input);
  if (!proposal) return null;
  const action = await deps.runtime.getAction(proposal.actionId);
  if (!action) return null;
  // The card as stored now, with its differences made again from the stored state; expiry judged from expiresAt at this read.
  const card = agentCardPreview(action, await deps.runtime.getRun(action.runId), deps.now());
  // What the page says when nothing can be confirmed any more, in the card's language (written here, not by the page).
  const notice = card.status === "expired" ? expiredMessage(action) : card.status === "canceled" ? canceledMessage(action) : card.status === "rejected" ? cardMessages(action.locale).closedRejected : null;
  return { card, clientName: proposal.clientName, createdAt: proposal.createdAt, ...(notice ? { notice } : {}), proposalId: proposal.id };
}

/**
 * The one answer for «not here» (approved decision D7): another account's real link and a mistyped one get exactly
 * this — same status, code and words — so nobody can tell from the answer whether a link is real or whose it is.
 */
export const PROPOSAL_NOT_HERE = { error: { code: "NOT_FOUND", context: { reason: "PROPOSAL_NOT_FOUND" }, message: "There is no such change in this account." }, success: false } as const;

/**
 * GET /api/agent/proposals/<id> for the signed-in account. Both «not here» cases make the same reads (one look-up of
 * the id, which finds nothing for this account) before the same answer.
 */
export async function proposalResponse(deps: { proposals: ProposalService; runtime: AgentRuntimeService; now: () => string }, input: { proposalId: string; accountId: string }): Promise<{ status: 200 | 404; body: unknown }> {
  const view = await proposalView(deps, input);
  return view ? { body: { data: view, success: true }, status: 200 } : { body: PROPOSAL_NOT_HERE, status: 404 };
}
