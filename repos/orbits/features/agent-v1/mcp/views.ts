/**
 * agent-design AG17: what Orbit's own pages get about connections and external proposals (the signed-in user's
 * interfaces, never the agent's): the settings list, the consent page's content and the confirm-link page's card.
 */
import type { AgentConnectionConsentContract, AgentConnectionContract, AgentConnectionScopeOptionContract, AgentProposalViewContract } from "../../../shared/contract/agent-v1";
import { agentCardPreview } from "../../agent/runtime/card-view";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import type { AuthorizationRequest } from "./auth/server";
import type { ProposalService } from "./confirm-link";
import type { AgentConnection } from "./connections";
import { scopeCatalogue } from "./scopes";

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

const LOOPBACK = new Set(["127.0.0.1", "[::1]", "localhost"]);

export const scopeOptions = (): AgentConnectionScopeOptionContract[] => scopeCatalogue();

export function connectionView(connection: AgentConnection & { lastUsedAt: string | null }): AgentConnectionContract {
  return { clientHost: hostOf(connection.clientId), clientName: connection.clientName, createdAt: connection.createdAt, id: connection.id, lastUsedAt: connection.lastUsedAt, scopes: [...connection.scopes] };
}

/** The consent page names the host the client's document lives on (the document's own name is self-asserted) and where the browser goes back to. */
export function consentView(request: AuthorizationRequest): AgentConnectionConsentContract {
  const redirectHost = hostOf(request.redirectUri);
  return { clientHost: hostOf(request.clientId), clientName: request.clientName, options: scopeOptions(), redirectHost, redirectIsLoopback: LOOPBACK.has(redirectHost), requestedScopes: [...request.scopes] };
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
  return { card, clientName: proposal.clientName, createdAt: proposal.createdAt, proposalId: proposal.id };
}
