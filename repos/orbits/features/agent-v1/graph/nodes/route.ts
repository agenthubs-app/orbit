/**
 * route (code): verdict, route and wait reason per part (route/decide.ts), then the statuses this
 * sprint can reach, and dependencies settled. The first layer's handoff is traced here.
 */
import { emitTrace } from "../../observability/trace";
import { decideRoute, NOT_YET_ROUTES, settleDependencies, statusForRoute } from "../../route/decide";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";

export function routeNode({ input, run }: NodeScope): GraphNode {
  return async (state: AgentGraphState) => {
    const understood = run.understood;
    if (!understood) return {};
    const context = run.context!;
    let acceptedAlternativeRef: string | null = null;
    const parts: GraphPart[] = state.parts.map((part, index) => {
      const source = understood.parts[index];
      const accepted = part.continues?.kind === "alternative" ? context.openItems.find((item) => item.ref === part.continues!.ref && item.kind === "alternative") ?? null : null;
      const decision = decideRoute(source, { acceptedAlternative: accepted });
      if (accepted) acceptedAlternativeRef = accepted.ref;
      let status = statusForRoute(decision.route);
      let reason: string | null = NOT_YET_ROUTES.has(decision.route) ? "not_in_this_version" : null;
      if (decision.route === "propose_write" && run.cardPrepared) {
        status = "awaiting_confirmation";
        reason = null;
      }
      return { ...part, reason, route: decision.route, status, verdict: decision.verdict, waitReason: decision.waitReason };
    });
    settleDependencies(parts);
    for (const part of parts) if (part.status === "waiting_dependency") part.reason = "dependency_pending";
    emitTrace({
      acceptedAlternativeRef,
      parts: parts.map((part, index) => {
        const source = understood.parts[index];
        return {
          capabilities: part.capabilities,
          clarity: source.clarity,
          constraints: source.constraints,
          dataOwner: source.dataOwner,
          dataSources: source.dataSources,
          deliverable: source.deliverable,
          dependsOn: part.dependsOn,
          goal: source.goal,
          intentBasis: source.intentBasis,
          objectClues: source.objectClues.map((clue, clueIndex) => ({ ...clue, recordId: part.refs[clueIndex]?.recordId ?? null })),
          partId: part.localId,
          persistence: source.persistence,
          route: part.route,
          sourceQuote: source.sourceQuote,
          status: part.status,
          verdict: part.verdict,
          waitReason: part.waitReason,
          ...(part.continues ? { continues: part.continues } : {}),
        };
      }),
      plainChat: state.plainChat,
      requestId: input.requestId,
      type: "first_layer.handoff",
    });
    return { acceptedAlternativeRef, parts };
  };
}
