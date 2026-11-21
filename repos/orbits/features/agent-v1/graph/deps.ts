import type { PrivateEventService } from "../../events/private-events/service";
import type { AttendanceService } from "../../events/attendance-notes/service";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import type { AiPageContextContract } from "../../../shared/contract/ai-sessions";
import type { AgentReferenceContract, AgentRunStage } from "../../../shared/contract/agent-v1";
import type { RecordSource } from "../domains/source";
import type { DomainReader, DomainScope } from "../domains/types";
import type { ContextMessage } from "../context/build";
import type { AgentSessionStateStore, NamedRecordRef } from "../context/session-state";
import type { AgentGraphRun, AgentGraphState } from "./state";
import type { CardOperationIntent } from "../../agent/runtime/card-operations";
import type { AgentActionPreviewContract as CardPreview } from "../../../shared/contract/agent-v1";
import type { CanonicalEventRecord } from "../../events/core/contract";
import type { JudgmentAccess } from "../judgment/ask";
import type { AgentWebAccess } from "../web/service";
import type { ContactAccess } from "../domains/contact/types";
import type { AgentMemoryAccess } from "../domains/memory/turn";
import type { RuleSnapshot } from "../domains/rule/ops";

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
  /** AG08: the events the account may see, for ranking (graph/nodes/functions.ts filters them). */
  listEvents?(): Promise<readonly CanonicalEventRecord[]>;
  /** AG11: only the events with these ids (the ones the user picked); the caller still keeps those the account may see. */
  eventsByIds?(ids: readonly string[]): Promise<readonly CanonicalEventRecord[]>;
  /** Hotfix 2026-11-20 part 2: the ids of the published events the user is registered for (code only, never a model). */
  registeredEventIds?(actorId: string): Promise<readonly string[]>;
  /** AG12: the account's contacts for contact writes — duplicates, restore, import review (code only, never a model). */
  contacts?: ContactAccess;
  /** AG13: the account's private events, «我去过» notes and the records linking to an event (code only, never a model). */
  privateEvents?: Pick<PrivateEventService, "list" | "get" | "references">;
  attendance?: Pick<AttendanceService, "list">;
  /** Record ids that may not be read now (the same deny list the reader applies; the record finder's World uses it). */
  deniedReads?(): ReadonlySet<string>;
}

/** A reference of this turn as intake keeps it: named when accessible; `accessible: false` when not (AG05). */
export type ReferenceHandle = NamedRecordRef & {
  accessible?: boolean;
  /** AG11: where the user's markers for this record sit in this turn's message, [start, end) each (the client's positions). */
  marks?: [number, number][];
};

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
  /** AG07: told when the round reaches a step a client shows as progress (reading, composing). */
  onStage?: (stage: AgentRunStage) => void;
  /** AG08: the judgment model (absent, or no key: every judgment is unavailable and conservative). */
  judgment?: JudgmentAccess;
  /** AG09: the public web (absent, switched off or no key: not one web request is made). */
  web?: AgentWebAccess;
  /**
   * AG14 (replaces AG10's read-only `memories`): the account's saved memory, read once per turn — the two switches, the
   * entries in use, the deletion marks and the version (absent: the turn uses no memory and proposes no memory change).
   */
  memory?: AgentMemoryAccess;
  /** AG15: the account's own scheduled tasks (to pause, resume, change or remove one by its name; absent: said as unavailable). */
  rules?: { list(actorId: string): Promise<readonly RuleSnapshot[]> };
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
export type AgentReferenceInput = Pick<AgentReferenceContract, "id" | "type" | "start" | "end" | "eventKind">;

export type GraphNode =(state: AgentGraphState) => Promise<Partial<AgentGraphState>>;

export interface NodeScope {
  deps: AgentGraphDependencies;
  input: AgentGraphInput;
  run: AgentGraphRun;
}
