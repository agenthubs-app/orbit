/**
 * The request graph of the new Agent (设计稿 §3.9; agent-design AG03):
 *
 *   intake → understand → route → answer → deliver
 *                     ╰──(no usable output)──────╯   route ──(nothing to answer)── deliver
 *
 * One request is one thread (thread id = requestId) in the checkpointer. This sprint has no path
 * that reads business records (except intake's check of the @ contacts) and none that proposes a
 * write; parts that need them are routed and reported as not done yet. Nodes run inside the trace
 * context with their name, and each emits node.enter / node.exit.
 */
import { END, START, StateGraph } from "@langchain/langgraph";

import { emitTrace, runWithTraceContext } from "../observability/trace";
import type { AgentGraphDependencies, AgentGraphInput, GraphNode, NodeScope } from "./deps";
import { answerNode } from "./nodes/answer";
import { deliverNode } from "./nodes/deliver";
import { intakeNode } from "./nodes/intake";
import { routeNode } from "./nodes/route";
import { understandNode } from "./nodes/understand";
import { AgentGraphAnnotation, type AgentGraphRun, type AgentGraphState } from "./state";
import type { AgentPartResult } from "../../../shared/contract/agent-v1";

export const GRAPH_NODES = ["intake", "understand", "route", "answer", "deliver"] as const;

function traced(name: string, requestId: string, node: GraphNode): GraphNode {
  return (state) => runWithTraceContext({ node: name, requestId }, async () => {
    emitTrace({ budget: state.budget, node: name, parts: state.parts.length, type: "node.enter" });
    const update = await node(state);
    emitTrace({
      node: name,
      type: "node.exit",
      update: {
        budget: update.budget ?? state.budget,
        parts: (update.parts ?? state.parts).map((part) => ({ partId: part.localId, route: part.route, status: part.status, verdict: part.verdict })),
        ...(update.understanding ? { understanding: update.understanding } : {}),
        ...(update.requestStatus ? { requestStatus: update.requestStatus } : {}),
      },
    });
    return update;
  });
}

export function buildAgentGraph(scope: NodeScope) {
  const id = scope.input.requestId;
  return new StateGraph(AgentGraphAnnotation)
    .addNode("intake", traced("intake", id, intakeNode(scope)))
    .addNode("understand", traced("understand", id, understandNode(scope)))
    .addNode("route", traced("route", id, routeNode(scope)))
    .addNode("answer", traced("answer", id, answerNode(scope)))
    .addNode("deliver", traced("deliver", id, deliverNode(scope)))
    .addEdge(START, "intake")
    .addEdge("intake", "understand")
    .addConditionalEdges("understand", (state: AgentGraphState) => (state.understanding === "understood" ? "route" : "deliver"), ["route", "deliver"])
    .addConditionalEdges("route", (state: AgentGraphState) => (state.parts.some((part) => part.route === "answer" && part.status === "answered") ? "answer" : "deliver"), ["answer", "deliver"])
    .addEdge("answer", "deliver")
    .addEdge("deliver", END)
    .compile({ checkpointer: scope.deps.checkpointer });
}

export interface AgentGraphResult {
  text: string;
  partResults: AgentPartResult[];
  status: "completed" | "waiting_user";
  modelCalls: number;
  state: AgentGraphState;
}

export async function runAgentGraph(deps: AgentGraphDependencies, input: AgentGraphInput): Promise<AgentGraphResult> {
  const run: AgentGraphRun = {
    actorId: input.actorId,
    answers: new Map(),
    cardPrepared: input.cardPrepared,
    context: null,
    locale: input.locale,
    message: input.message,
    partResults: [],
    plainReply: null,
    text: "",
    understood: null,
  };
  const graph = buildAgentGraph({ deps, input, run });
  const state = (await graph.invoke({ requestId: input.requestId, sessionId: input.sessionId }, { configurable: { thread_id: input.requestId } })) as AgentGraphState;
  return { modelCalls: state.budget.used, partResults: run.partResults, state, status: state.requestStatus ?? "completed", text: run.text };
}
