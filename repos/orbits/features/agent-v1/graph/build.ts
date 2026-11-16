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
import { Command, END, START, StateGraph } from "@langchain/langgraph";

import { emitTrace, runWithTraceContext } from "../observability/trace";
import type { AgentGraphDependencies, AgentGraphInput, GraphNode, NodeScope } from "./deps";
import { answerNode } from "./nodes/answer";
import { clarifyNode } from "./nodes/clarify";
import { deliverNode } from "./nodes/deliver";
import { intakeNode } from "./nodes/intake";
import { resolveNode } from "./nodes/resolve";
import { routeNode } from "./nodes/route";
import { understandNode } from "./nodes/understand";
import { verifyNode } from "./nodes/verify";
import { AgentGraphAnnotation, type AgentGraphRun, type AgentGraphState, type GraphResolution } from "./state";
import type { AgentClarificationContract, AgentPartResult } from "../../../shared/contract/agent-v1";

export const GRAPH_NODES = ["intake", "understand", "route", "resolve", "clarify", "answer", "verify", "deliver"] as const;

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

const touchedBy = (state: AgentGraphState, part: { localId: string }) => state.touched === null || state.touched.includes(part.localId);
/** AG05: parts routed to read whose read has not run yet in this pass. */
const readDue = (state: AgentGraphState) => state.parts.some((part) => part.route === "read" && part.status === "answered" && !part.reads && !part.gaps && touchedBy(state, part));

export function buildAgentGraph(scope: NodeScope) {
  const id = scope.input.requestId;
  // A discussion part to answer (first pass only), or a part that read and has something to answer from.
  const answerDue = (state: AgentGraphState) => (state.touched === null && state.parts.some((part) => part.route === "answer" && part.status === "answered"))
    || state.parts.some((part) => part.route === "read" && part.status === "answered" && (scope.run.materials.get(part.localId)?.length ?? 0) > 0 && touchedBy(state, part));
  return new StateGraph(AgentGraphAnnotation)
    .addNode("intake", traced("intake", id, intakeNode(scope)))
    .addNode("understand", traced("understand", id, understandNode(scope)))
    .addNode("route", traced("route", id, routeNode(scope)))
    .addNode("resolve", traced("resolve", id, resolveNode(scope)))
    .addNode("clarify", traced("clarify", id, clarifyNode(scope)))
    .addNode("answer", traced("answer", id, answerNode(scope)))
    .addNode("verify", traced("verify", id, verifyNode(scope)))
    .addNode("deliver", traced("deliver", id, deliverNode(scope)))
    .addEdge(START, "intake")
    .addEdge("intake", "understand")
    .addConditionalEdges("understand", (state: AgentGraphState) => (state.understanding === "understood" ? "route" : "deliver"), ["route", "deliver"])
    // AG05: parts that read go through resolve first (it may find several people and need a question).
    // AG04: parts that need questions or directions go through clarify's prepare pass.
    .addConditionalEdges("route", (state: AgentGraphState) => (readDue(state) ? "resolve" : scope.run.needsDirections ? "clarify" : answerDue(state) ? "answer" : "deliver"), ["resolve", "clarify", "answer", "deliver"])
    .addConditionalEdges("resolve", (state: AgentGraphState) => (scope.run.needsDirections ? "clarify" : answerDue(state) ? "answer" : "deliver"), ["clarify", "answer", "deliver"])
    // After prepare: answer or deliver. After a resume: route again (a click to carry out) or deliver (closed from outside).
    .addConditionalEdges("clarify", (state: AgentGraphState) => state.resumeNext ?? (answerDue(state) ? "answer" : "deliver"), ["route", "answer", "deliver"])
    .addEdge("answer", "verify")
    .addEdge("verify", "deliver")
    // Directions left open: the thread waits in clarify (interrupt) until a click, an answer or shelving resumes it.
    .addConditionalEdges("deliver", (state: AgentGraphState) => (state.pausing ? "clarify" : END), ["clarify", END])
    .compile({ checkpointer: scope.deps.checkpointer });
}

export interface AgentGraphResult {
  text: string;
  partResults: AgentPartResult[];
  status: "completed" | "waiting_user";
  modelCalls: number;
  state: AgentGraphState;
  /** AG04: the request's clickable directions, as the result document shows them. */
  clarifications: AgentClarificationContract[];
  /** AG04: the thread waits for a click or an answer (clarify's interrupt). */
  paused: boolean;
  /** AG04: earlier requests this one answered or shelved (the executor writes them back). */
  earlier: AgentGraphRun["earlier"];
  /** AG05: the records the answer cites (verified, openable now), as typed refs. */
  sourceRefs: string[];
}

function newRun(input: AgentGraphInput, extras: ResumeExtras = {}): AgentGraphRun {
  return {
    actorId: input.actorId,
    answers: new Map(),
    candidates: new Map(),
    cardPrepared: input.cardPrepared,
    clarifications: [],
    context: null,
    earlier: [],
    gapLines: new Map(),
    locale: input.locale,
    materials: new Map(),
    message: input.message,
    names: new Map(Object.entries(extras.names ?? {})),
    needsDirections: false,
    optionLabels: new Map(),
    partResults: [],
    plainReply: null,
    previousClarifications: extras.previousClarifications ?? null,
    readNames: new Map(),
    readNotes: new Map(),
    references: [],
    sourceRefs: [],
    steps: new Map(),
    text: "",
    understood: null,
  };
}

const PAUSED_AT = "clarify";

async function resultOf(graph: ReturnType<typeof buildAgentGraph>, run: AgentGraphRun, state: AgentGraphState, threadId: string): Promise<AgentGraphResult> {
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  return {
    clarifications: run.clarifications,
    earlier: run.earlier,
    modelCalls: state.budget.used,
    partResults: run.partResults,
    paused: snapshot.next.includes(PAUSED_AT),
    sourceRefs: run.sourceRefs,
    state,
    status: state.requestStatus ?? "completed",
    text: run.text,
  };
}

export async function runAgentGraph(deps: AgentGraphDependencies, input: AgentGraphInput): Promise<AgentGraphResult> {
  const run = newRun(input);
  const graph = buildAgentGraph({ deps, input, run });
  const state = (await graph.invoke({ requestId: input.requestId, sessionId: input.sessionId }, { configurable: { thread_id: input.requestId } })) as AgentGraphState;
  return resultOf(graph, run, state, input.requestId);
}

export interface ResumeExtras {
  /** The clarifications the result document shows (their labels; the checkpoint has ids only). */
  previousClarifications?: readonly AgentClarificationContract[] | null;
  /** Names of records an option points at, from the result document. */
  names?: Record<string, string>;
}

export class GraphNotPausedError extends Error {
  constructor(readonly requestId: string) {
    super(`The request ${requestId} is not waiting in clarify; there is nothing to resume.`);
  }
}

/**
 * Resumes a paused request (设计稿 §3.9 暂停与恢复): the same thread (requestId), from clarify, with a
 * resolution of ids only. understand is not run again and no model is called.
 */
export async function resumeAgentGraph(deps: AgentGraphDependencies, input: AgentGraphInput, resolution: GraphResolution, extras: ResumeExtras = {}): Promise<AgentGraphResult> {
  const run = newRun(input, extras);
  const graph = buildAgentGraph({ deps, input, run });
  const config = { configurable: { thread_id: input.requestId } };
  const before = await graph.getState(config);
  if (!before.next.includes(PAUSED_AT)) throw new GraphNotPausedError(input.requestId);
  const state = (await graph.invoke(new Command({ resume: resolution }), config)) as AgentGraphState;
  return resultOf(graph, run, state, input.requestId);
}
