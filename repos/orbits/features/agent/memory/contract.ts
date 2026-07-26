export const AGENT_MEMORY_CATEGORIES = [
  "identity",
  "goal",
  "preference",
  "constraint",
] as const;

export type AgentMemoryCategory =
  (typeof AGENT_MEMORY_CATEGORIES)[number];

export interface AgentMemory {
  memoryId: string;
  category: AgentMemoryCategory;
  content: string;
  source: "manual" | "conversation";
  createdAt: string;
  updatedAt: string;
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
}

export interface UpdateAgentMemoryInput {
  category?: AgentMemoryCategory;
  content?: string;
}

export interface AgentMemoryService {
  list: () => Promise<readonly AgentMemory[]>;
  create: (input: CreateAgentMemoryInput) => Promise<AgentMemory>;
  update: (
    memoryId: string,
    input: UpdateAgentMemoryInput,
  ) => Promise<AgentMemory>;
  remove: (memoryId: string) => Promise<void>;
  getSettings: () => Promise<AgentMemorySettings>;
  updateSettings: (
    patch: Partial<
      Pick<
        AgentMemorySettings,
        "enabled" | "allowConversationLearning"
      >
    >,
  ) => Promise<AgentMemorySettings>;
  context: (limit?: number) => Promise<readonly AgentMemoryContext[]>;
}
