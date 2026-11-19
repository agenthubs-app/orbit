export const AGENT_MEMORY_CATEGORIES = [
  "identity",
  "goal",
  "preference",
  "constraint",
] as const;

export type AgentMemoryCategory =
  (typeof AGENT_MEMORY_CATEGORIES)[number];

/**
 * agent-design AG14 (设计稿 §6, 附录 E): the kinds of task an entry applies to. `all` is every task (a standing rule such
 * as "回答用日语"). An entry with no `appliesTo` is not classified yet (older entries): it is used only where its own
 * words clearly name the task.
 */
export const AGENT_MEMORY_TASKS = [
  "all",
  "event.recommend",
  "contact.recommend",
  "memo.summarize",
  "todo.plan",
  "schedule.plan",
] as const;

export type AgentMemoryTask = (typeof AGENT_MEMORY_TASKS)[number];

export type AgentMemoryStatus = "active" | "deleted";

/** Values code ranks or filters with (a time preference, topics, the reply language); written with the words, from one payload. */
export interface AgentMemoryStructured {
  preferredDays?: ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun")[];
  dayPart?: "morning" | "afternoon" | "evening";
  strength?: "prefer" | "only" | "avoid";
  topics?: string[];
  replyLanguage?: "zh" | "ja" | "en";
}

export interface AgentMemory {
  memoryId: string;
  category: AgentMemoryCategory;
  /** Empty once the entry is deleted: the words are not kept (only the mark that it was deleted). */
  content: string;
  source: "manual" | "conversation";
  createdAt: string;
  updatedAt: string;
  /** AG14: 1 when created, +1 with every change and with the deletion. */
  revision: number;
  status: AgentMemoryStatus;
  appliesTo: AgentMemoryTask[];
  structured: AgentMemoryStructured | null;
  /** Days as YYYY-MM-DD, both inclusive; null: no limit. */
  validFrom: string | null;
  validUntil: string | null;
  /** The message a conversation entry came from ("request:<id>"); null for entries typed on the settings page. */
  sourceMessageRef: string | null;
  deletedAt?: string | null;
}

/** What is left of a deleted entry: enough to refuse proposing it again from the same old message; never its words. */
export interface AgentMemoryDeletionMark {
  memoryId: string;
  category: AgentMemoryCategory;
  appliesTo: AgentMemoryTask[];
  sourceMessageRef: string | null;
  revision: number;
  deletedAt: string;
}

export interface AgentMemorySettings {
  enabled: boolean;
  allowConversationLearning: boolean;
  updatedAt: string;
}

export interface AgentMemoryContext {
  category: AgentMemoryCategory;
  content: string;
}

export type AgentMemoryRecordPayload =
  | (Record<string, unknown> & {
      kind: "memory";
      memory: AgentMemory;
    })
  | (Record<string, unknown> & {
      kind: "settings";
      settings: AgentMemorySettings;
    });

export interface CreateAgentMemoryInput {
  category: AgentMemoryCategory;
  content: string;
  memoryId?: string;
  source?: AgentMemory["source"];
  appliesTo?: readonly AgentMemoryTask[];
  structured?: AgentMemoryStructured | null;
  validFrom?: string | null;
  validUntil?: string | null;
  sourceMessageRef?: string | null;
}

export interface UpdateAgentMemoryInput {
  category?: AgentMemoryCategory;
  content?: string;
  appliesTo?: readonly AgentMemoryTask[];
  structured?: AgentMemoryStructured | null;
  validFrom?: string | null;
  validUntil?: string | null;
  /** The revision the change was made from; another revision now is a conflict and nothing is written. */
  expectedRevision?: number;
}

export interface RemoveAgentMemoryInput {
  expectedRevision?: number;
}

/** The entry is not at the revision the change was made from (changed or deleted elsewhere since). */
export class AgentMemoryRevisionConflictError extends Error {
  readonly code = "MEMORY_REVISION_CONFLICT" as const;
  constructor(readonly memoryId: string, readonly expected: number, readonly current: number | null) {
    super(`Agent memory ${memoryId} is at revision ${current ?? "none"}, not ${expected}; nothing was written.`);
  }
}

/** One read of an account's memory in a workspace: the two switches, the entries in use, the deletion marks, the version. */
export interface AgentMemorySnapshot {
  settings: AgentMemorySettings;
  entries: AgentMemory[];
  marks: AgentMemoryDeletionMark[];
  version: number;
}

export interface AgentMemoryService {
  /** Everything a turn needs of the scope, in one read. */
  snapshot: () => Promise<AgentMemorySnapshot>;
  /** The entries in use (deleted ones are not listed). */
  list: () => Promise<readonly AgentMemory[]>;
  get: (memoryId: string) => Promise<AgentMemory | null>;
  create: (input: CreateAgentMemoryInput) => Promise<AgentMemory>;
  update: (
    memoryId: string,
    input: UpdateAgentMemoryInput,
  ) => Promise<AgentMemory>;
  /** Forgets the entry: its words are dropped, a deletion mark stays and the scope's memory version moves on. */
  remove: (memoryId: string, input?: RemoveAgentMemoryInput) => Promise<void>;
  getSettings: () => Promise<AgentMemorySettings>;
  updateSettings: (
    patch: Partial<
      Pick<
        AgentMemorySettings,
        "enabled" | "allowConversationLearning"
      >
    >,
  ) => Promise<AgentMemorySettings>;
  /** Marks of the entries deleted in this account and workspace. */
  deletionMarks: () => Promise<readonly AgentMemoryDeletionMark[]>;
  /** The scope's memory version: it moves with every entry created, changed or deleted. */
  version: () => Promise<number>;
  context: (limit?: number) => Promise<readonly AgentMemoryContext[]>;
}
