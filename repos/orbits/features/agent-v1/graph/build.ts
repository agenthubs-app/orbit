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
import { allowContactMethodsFrom } from "../domains/contact/field-grants";
import { Command, END, START, StateGraph } from "@langchain/langgraph";

import { emitTrace, runWithTraceContext } from "../observability/trace";
import type { AgentGraphDependencies, AgentGraphInput, GraphNode, NodeScope } from "./deps";
import { answerNode } from "./nodes/answer";
import { clarifyNode } from "./nodes/clarify";
import { deliverNode } from "./nodes/deliver";
import { functionsDue, functionsNode } from "./nodes/functions";
import { newJudgmentBudget } from "../judgment/ask";
import { emptyTurnMemory } from "../domains/memory/turn";
import { intakeNode } from "./nodes/intake";
import { proposeDue, proposeNode } from "./nodes/propose";
import { probeNode, webDue, webPartReads } from "./nodes/probe";
import { resolveNode } from "./nodes/resolve";
import { routeNode } from "./nodes/route";
import { understandNode } from "./nodes/understand";
import { verifyNode } from "./nodes/verify";
import { AgentGraphAnnotation, type AgentGraphRun, type AgentGraphState, type GraphResolution } from "./state";
import type { AgentActionPreviewContract, AgentAnswerBasisContract, AgentAnswerBlockContract, AgentAnswerMemoryUseContract, AgentClarificationContract, AgentPartResult, AgentRunStage, AgentWebResultContract } from "../../../shared/contract/agent-v1";

export const GRAPH_NODES = ["intake", "understand", "route", "functions", "resolve", "probe", "propose", "clarify", "answer", "verify", "deliver"] as const;

/** AG07: the progress a client shows while a node runs ("正在查你的笔记…", "正在整理回答…"), chosen by code. */
const STAGE_OF: Partial<Record<(typeof GRAPH_NODES)[number], AgentRunStage>> = { answer: "composing", functions: "reading", probe: "reading", propose: "composing", resolve: "reading" };

function traced(name: (typeof GRAPH_NODES)[number], requestId: string, node: GraphNode, onStage?: (stage: AgentRunStage) => void): GraphNode {
  return (state) => runWithTraceContext({ node: name, requestId }, async () => {
    emitTrace({ budget: state.budget, node: name, parts: state.parts.length, type: "node.enter" });
    const stage = STAGE_OF[name];
    if (stage && onStage) {
      try {
        onStage(stage);
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "graph.stage" });
      }
    }
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
// AG09: a web part that also reads the user's records reads them first (webPartReads).
const readDue = (state: AgentGraphState) => state.parts.some((part) => (part.route === "read" || webPartReads(part)) && part.status === "answered" && !part.reads && !part.gaps && touchedBy(state, part));

export function buildAgentGraph(scope: NodeScope) {
  const id = scope.input.requestId;
  // A discussion part to answer (first pass only), or a part that read (records, or AG09 a web page) and has something to answer from.
  const answerDue = (state: AgentGraphState) => (state.touched === null && state.parts.some((part) => part.route === "answer" && part.status === "answered"))
    || state.parts.some((part) => (part.route === "read" || part.route === "web_lookup") && part.status === "answered" && (scope.run.materials.get(part.localId)?.length ?? 0) > 0 && touchedBy(state, part));
  const web = (state: AgentGraphState) => webDue(scope, state);
  return new StateGraph(AgentGraphAnnotation)
    .addNode("intake", traced("intake", id, intakeNode(scope)))
    .addNode("understand", traced("understand", id, understandNode(scope)))
    .addNode("route", traced("route", id, routeNode(scope)))
    .addNode("functions", traced("functions", id, functionsNode(scope), scope.deps.onStage))
    .addNode("resolve", traced("resolve", id, resolveNode(scope), scope.deps.onStage))
    .addNode("propose", traced("propose", id, proposeNode(scope), scope.deps.onStage))
    .addNode("clarify", traced("clarify", id, clarifyNode(scope)))
    .addNode("answer", traced("answer", id, answerNode(scope), scope.deps.onStage))
    .addNode("probe", traced("probe", id, probeNode(scope), scope.deps.onStage))
    .addNode("verify", traced("verify", id, verifyNode(scope)))
    .addNode("deliver", traced("deliver", id, deliverNode(scope)))
    .addEdge(START, "intake")
    .addEdge("intake", "understand")
    .addConditionalEdges("understand", (state: AgentGraphState) => (state.understanding === "understood" ? "route" : "deliver"), ["route", "deliver"])
    // AG05: parts that read go through resolve first (it may find several people and need a question).
    // AG04: parts that need questions or directions go through clarify's prepare pass.
    // AG06: parts that write go through propose (after the reads, so a person found by a read is known).
    // AG08: parts that pick or order contacts or events go through functions first (code, one judgment at most).
    .addConditionalEdges("route", (state: AgentGraphState) => (functionsDue(state, scope) ? "functions" : readDue(state) ? "resolve" : web(state) ? "probe" : proposeDue(state) ? "propose" : scope.run.needsDirections ? "clarify" : answerDue(state) ? "answer" : "deliver"), ["functions", "resolve", "probe", "propose", "clarify", "answer", "deliver"])
    .addConditionalEdges("functions", (state: AgentGraphState) => (readDue(state) ? "resolve" : web(state) ? "probe" : proposeDue(state) ? "propose" : scope.run.needsDirections ? "clarify" : answerDue(state) ? "answer" : "verify"), ["resolve", "probe", "propose", "clarify", "answer", "verify"])
    // Hotfix 2026-11-20: a read answered by code alone (resolve's wider read) still has its citations checked.
    .addConditionalEdges("resolve", (state: AgentGraphState) => (web(state) ? "probe" : proposeDue(state) ? "propose" : scope.run.needsDirections ? "clarify" : answerDue(state) ? "answer" : state.parts.some((part) => part.cites?.length) ? "verify" : "deliver"), ["probe", "propose", "clarify", "answer", "verify", "deliver"])
    // AG09: the web step, after the record reads and before the card and the answer.
    .addConditionalEdges("probe", (state: AgentGraphState) => (proposeDue(state) ? "propose" : scope.run.needsDirections ? "clarify" : answerDue(state) ? "answer" : "deliver"), ["propose", "clarify", "answer", "deliver"])
    // AG10: a card turn that cites a record (an extraction) is verified like an answer (its links, the basis line).
    .addConditionalEdges("propose", (state: AgentGraphState) => (scope.run.needsDirections ? "clarify" : answerDue(state) ? "answer" : state.parts.some((part) => part.cites?.length) ? "verify" : "deliver"), ["clarify", "answer", "verify", "deliver"])
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
  /** AG07: the basis line and record links of the answer (from sourceRefs), written by code. */
  basis: AgentAnswerBasisContract | null;
  /** AG07: the part of `text` that stands for the card (clients that show the card leave it out). */
  cardLine: string | null;
  /** AG06: the card this request froze (this pass), from the ledger's one preview. */
  actionPreview: AgentActionPreviewContract | null;
  /** AG09: the queries sent and the pages opened in this pass. */
  web: AgentWebResultContract;
  /** AG19: the answer laid out in blocks (paragraphs, points, record cards, the note of what was not done). */
  blocks: AgentAnswerBlockContract[];
  /** AG14 UI: the memory chips at the start of the answer. */
  memoryUse: AgentAnswerMemoryUseContract[];
}

function newRun(input: AgentGraphInput, extras: ResumeExtras = {}): AgentGraphRun {
  return {
    actorId: input.actorId,
    answers: new Map(),
    candidates: new Map(),
    cardPrepared: input.cardPrepared,
    judgment: newJudgmentBudget(),
    clarifications: [],
    context: null,
    earlier: [],
    gapLines: new Map(),
    staleProfiles: [],
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
    carriedQuestions: new Map(),
    lastList: null,
    repeatedLists: new Map(),
    showAllRead: new Set(),
    references: [],
    readSources: new Map(),
    basis: null,
    sourceRefs: [],
    steps: new Map(),
    codeAnswers: new Set(),
    text: "",
    understood: null,
    writeLines: new Map(),
    actionPreview: null,
    cardLine: null,
    web: { pages: [], queries: [] },
    webDone: new Set(),
    webQuestions: new Map(),
    webUrls: new Set(),
    topicMatched: false,
    functionsDone: new Set(),
    questionLines: new Map(),
    leadLines: new Map(),
    presetIntents: new Map(),
    memory: emptyTurnMemory(),
    sessionState: null,
    answerBlocks: new Map(),
    modelAnswers: new Set(),
    recordCards: new Map(),
    blocks: [],
    eventFacts: new Map(),
    recordSort: new Map(),
    memoryNotes: new Map(),
    memoryUse: [],
    conversation: null,
  };
}

const PAUSED_AT = "clarify";

async function resultOf(graph: ReturnType<typeof buildAgentGraph>, run: AgentGraphRun, state: AgentGraphState, threadId: string): Promise<AgentGraphResult> {
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  return {
    actionPreview: run.actionPreview,
    clarifications: run.clarifications,
    earlier: run.earlier,
    modelCalls: state.budget.used,
    partResults: run.partResults,
    paused: snapshot.next.includes(PAUSED_AT),
    sourceRefs: run.sourceRefs,
    basis: run.basis,
    blocks: run.blocks,
    memoryUse: run.memoryUse,
    cardLine: run.cardLine,
    state,
    status: state.requestStatus ?? "completed",
    text: run.text,
    web: run.web,
  };
}

export async function runAgentGraph(deps: AgentGraphDependencies, input: AgentGraphInput): Promise<AgentGraphResult> {
  // AG12-5: contact methods the user typed in this message may go to the model; no other.
  allowContactMethodsFrom(input.requestId, input.message);
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
  allowContactMethodsFrom(input.requestId, input.message);
  const run = newRun(input, extras);
  const graph = buildAgentGraph({ deps, input, run });
  const config = { configurable: { thread_id: input.requestId } };
  const before = await graph.getState(config);
  if (!before.next.includes(PAUSED_AT)) throw new GraphNotPausedError(input.requestId);
  const state = (await graph.invoke(new Command({ resume: resolution }), config)) as AgentGraphState;
  return resultOf(graph, run, state, input.requestId);
}
