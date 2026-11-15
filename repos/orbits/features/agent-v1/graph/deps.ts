import type { BaseCheckpointSaver } from "@langchain/langgraph";

import type { AiPageContextContract, AiSessionReferenceContract } from "../../../shared/contract/ai-sessions";
import type { ContextMessage } from "../context/build";
import type { AgentSessionStateStore, NamedRecordRef } from "../context/session-state";
import type { AgentGraphRun, AgentGraphState } from "./state";

/** What the graph needs from the outside; every one is replaceable in tests. */
export interface AgentGraphDependencies {
  /** Authorizes this turn's @ references (contacts in AG03) and returns them with names; throws AgentEntryExecutionError. */
  authorizeReferences(actorId: string, references: readonly AiSessionReferenceContract[]): Promise<NamedRecordRef[]>;
  /** The session's latest messages, oldest first, with their time and record refs. */
  loadMessages(sessionId: string): Promise<ContextMessage[]>;
  sessionState: AgentSessionStateStore;
  checkpointer: BaseCheckpointSaver;
  /** The model call's fetch (the entry's stoppable fetch; a stub in tests). */
  fetchImplementation?: typeof fetch;
  now(): string;
  timeZone?: string;
  /** The round's model call limit (models/main.ts modelCallLimit by default). */
  modelCallLimit?: number;
}

export interface AgentGraphInput {
  actorId: string;
  requestId: string;
  sessionId: string;
  message: string;
  locale: string;
  references: readonly AiSessionReferenceContract[];
  /** A card of this request already exists in the ledger (shown by the confirmation boundary). */
  cardPrepared: boolean;
  /** AG04: the page the message was sent from (its route picks the most likely reading and directions). */
  pageContext?: AiPageContextContract;
}

export type GraphNode = (state: AgentGraphState) => Promise<Partial<AgentGraphState>>;

export interface NodeScope {
  deps: AgentGraphDependencies;
  input: AgentGraphInput;
  run: AgentGraphRun;
}
