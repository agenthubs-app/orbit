import type { BaseCheckpointSaver } from "@langchain/langgraph";

import type { AiPageContextContract } from "../../../shared/contract/ai-sessions";
import type { AgentReferenceContract } from "../../../shared/contract/agent-v1";
import type { RecordSource } from "../domains/source";
import type { DomainReader, DomainScope } from "../domains/types";
import type { ContextMessage } from "../context/build";
import type { AgentSessionStateStore, NamedRecordRef } from "../context/session-state";
import type { AgentGraphRun, AgentGraphState } from "./state";
import type { CardOperationIntent } from "../../agent/runtime/card-operations";
import type { AgentActionPreviewContract as CardPreview } from "../../../shared/contract/agent-v1";

/**
 * AG06: the request's card in the action ledger (one card per request, conversationCardId). `freeze` is
 * idempotent per request: a card that exists already is returned as it is.
 */
export interface AgentCardAccess {
  freeze(input: { requestId: string; sessionId: string; locale: string; intents: readonly CardOperationIntent[] }): Promise<CardPreview | null>;
}

/**
 * AG05: how the graph reads the user's records — the domain registry (five read adapters through
 * executeAiRead), the record source (encounters, existence checks) and the scope of an account.
 */
export interface AgentRecordAccess {
  reader: DomainReader;
  source: RecordSource;
  scope(actorId: string): DomainScope;
  /** Which of these typed refs ("memo:note:…") the account may still read now. Ids only, never a record. */
  visible(actorId: string, refs: readonly string[]): Promise<Set<string>>;
  /** Pages per read of one subgoal. */
  maxPages: number;
}

/** A reference of this turn as intake keeps it: named when accessible; `accessible: false` when not (AG05). */
export type ReferenceHandle = NamedRecordRef & { accessible?: boolean };

/** What the graph needs from the outside; every one is replaceable in tests. */
export interface AgentGraphDependencies {
  /**
   * Authorizes this turn's @ references and returns them with names. AG05: one result per reference —
   * one that is not accessible comes back with `accessible: false` (and no name) instead of failing the turn.
   */
  authorizeReferences(actorId: string, references: readonly AgentReferenceInput[]): Promise<ReferenceHandle[]>;
  /** AG05: reading the user's records (absent: parts that read are answered as unreadable sources). */
  records?: AgentRecordAccess;
  /** AG06: the request's card (absent: write parts are reported as not done). */
  cards?: AgentCardAccess;
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
  references: readonly AgentReferenceInput[];
  /** A card of this request already exists in the ledger (shown by the confirmation boundary). */
  cardPrepared: boolean;
  /** AG04: the page the message was sent from (its route picks the most likely reading and directions). */
  pageContext?: AiPageContextContract;
}

/** A reference as the protocol sends it (AG05: six kinds; "note" is the old name of a memo). */
export type AgentReferenceInput = Pick<AgentReferenceContract, "id" | "type">;

export type GraphNode =(state: AgentGraphState) => Promise<Partial<AgentGraphState>>;

export interface NodeScope {
  deps: AgentGraphDependencies;
  input: AgentGraphInput;
  run: AgentGraphRun;
}
