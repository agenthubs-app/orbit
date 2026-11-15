/**
 * The graph's thread state (设计稿 §3.9 "状态里放什么", agent-design AG03).
 *
 * One request is one thread (thread id = requestId). The state holds references and progress only:
 * the request context, each part as offsets into this turn's message plus its route and status, the
 * records it was bound to by id, the budget and how many model calls were used. The message text,
 * the context given to the model, record bodies and the model's raw output are not in it; they live
 * in the run (AgentGraphRun) for the duration of the request and are never checkpointed.
 */
import { Annotation } from "@langchain/langgraph";

import type { AgentPartResult } from "../../../shared/contract/agent-v1";
import type { FirstLayerContext } from "../context/build";
import type { Capability, Route, Verdict, WaitReason } from "../route/capabilities";
import type { PartStatus } from "../route/decide";
import type { UnderstandOutput } from "../understand/schema";

export interface GraphPartRef {
  entity: string;
  /** The product id the clue was bound to (null: not bound). */
  recordId: string | null;
}

export interface GraphPart {
  localId: string;
  /** sourceQuote as [start, end) in this turn's message (the message is read back by its request). */
  quote: [number, number];
  verdict: Verdict | null;
  route: Route | null;
  waitReason: WaitReason | null;
  status: PartStatus;
  /** A short code: why the part ended where it did (not_in_this_version, budget, model_error …). */
  reason: string | null;
  capabilities: Capability[];
  dependsOn: string[];
  refs: GraphPartRef[];
  /** The open item this part answers or accepts (its stored ref). */
  continues: { kind: string; ref: string } | null;
}

const replace = <T>(fallback: () => T) => Annotation<T>({ default: fallback, reducer: (_previous, next) => next });

export const AgentGraphAnnotation = Annotation.Root({
  requestId: replace<string>(() => ""),
  sessionId: replace<string>(() => ""),
  /** Where the turn's words are kept: the request record of this requestId. */
  messageRef: replace<string>(() => ""),
  asOf: replace<string>(() => ""),
  timeZone: replace<string>(() => "Asia/Tokyo"),
  language: replace<"zh" | "ja" | "en">(() => "en"),
  /** Authorized @ references of this turn (product ids). */
  references: replace<string[]>(() => []),
  context: replace<{ idle: boolean; idleMinutes: number | null; messages: number; handles: number; openItems: number } | null>(() => null),
  budget: replace<{ limit: number; used: number }>(() => ({ limit: 4, used: 0 })),
  repairs: replace<number>(() => 0),
  understanding: replace<"pending" | "understood" | "invalid" | "model_error" | "budget">(() => "pending"),
  plainChat: replace<boolean>(() => false),
  parts: replace<GraphPart[]>(() => []),
  acceptedAlternativeRef: replace<string | null>(() => null),
  requestStatus: replace<"completed" | "waiting_user" | null>(() => null),
  delivered: replace<boolean>(() => false),
});

export type AgentGraphState = typeof AgentGraphAnnotation.State;
export type AgentGraphUpdate = typeof AgentGraphAnnotation.Update;

/** What one request needs while it runs and must never be checkpointed. */
export interface AgentGraphRun {
  message: string;
  locale: string;
  actorId: string;
  cardPrepared: boolean;
  context: FirstLayerContext | null;
  understood: UnderstandOutput | null;
  plainReply: string | null;
  answers: Map<string, string>;
  /** The delivered text and part results (filled by deliver). */
  text: string;
  partResults: AgentPartResult[];
}
