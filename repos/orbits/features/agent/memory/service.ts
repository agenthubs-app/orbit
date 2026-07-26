import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import {
  AGENT_MEMORY_CATEGORIES,
  type AgentMemory,
  type AgentMemoryCategory,
  type AgentMemoryRecordPayload,
  type AgentMemoryService,
} from "./contract";

export const AGENT_MEMORY_COLLECTION = "agentMemories" as const;
const SETTINGS_RECORD_ID = "settings";
const DEFAULT_SETTINGS = {
  enabled: true,
  allowConversationLearning: false,
  updatedAt: "1970-01-01T00:00:00.000Z",
} as const;

export interface StorageAgentMemoryServiceOptions {
  actorId: string;
  store: LiveRecordStoreLike<AgentMemoryRecordPayload>;
  workspaceId: string;
  now?: () => string;
  id?: () => string;
}

function actorWorkspaceId(workspaceId: string, actorId: string): string {
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) {
    throw new Error("Authenticated actor is required for Agent memory.");
  }
  return `${workspaceId}:agent-actor:${normalizedActorId}`;
}

function content(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Memory content is required.");
  if (normalized.length > 600) {
    throw new Error("Memory content must be 600 characters or fewer.");
  }
  return normalized;
}

function category(value: string): AgentMemoryCategory {
  if (
    !AGENT_MEMORY_CATEGORIES.includes(
      value as AgentMemoryCategory,
    )
  ) {
    throw new Error(`Unknown Agent memory category: ${value}`);
  }
  return value as AgentMemoryCategory;
}

function memoryId(value: string | undefined, fallback: () => string): string {
  const normalized = value?.trim() || fallback();
  if (!normalized || normalized === SETTINGS_RECORD_ID) {
    throw new Error("A valid Agent memory id is required.");
  }
  if (normalized.length > 180) {
    throw new Error("Agent memory id must be 180 characters or fewer.");
  }
  return normalized;
}

function memoryRecord(
  workspaceId: string,
  memory: AgentMemory,
): LiveRecord<AgentMemoryRecordPayload> {
  return {
    workspaceId,
    collectionName: AGENT_MEMORY_COLLECTION,
    recordId: memory.memoryId,
    sourceType: memory.source === "manual" ? "manual" : "agent_action",
    sourceId: memory.memoryId,
    sourceLabel:
      memory.source === "manual"
        ? "User-managed Agent memory"
        : "User-approved conversation memory",
    evidenceIds: [],
    lifecycleState: "active",
    searchText: `${memory.category} ${memory.content}`,
    payload: { kind: "memory", memory },
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

export function createStorageAgentMemoryService({
  actorId,
  store,
  workspaceId,
  now = () => new Date().toISOString(),
  id = () => crypto.randomUUID(),
}: StorageAgentMemoryServiceOptions): AgentMemoryService {
  const scopedWorkspaceId = actorWorkspaceId(workspaceId, actorId);
  let mutationQueue: Promise<void> = Promise.resolve();

  async function serial<T>(operation: () => Promise<T>): Promise<T> {
    const previous = mutationQueue;
    let release: () => void = () => undefined;
    mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function records(): Promise<
    readonly LiveRecord<AgentMemoryRecordPayload>[]
  > {
    return store.listRecords({
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_MEMORY_COLLECTION,
    });
  }

  async function list(): Promise<readonly AgentMemory[]> {
    return (await records())
      .flatMap((record) =>
        record.payload.kind === "memory"
          ? [record.payload.memory]
          : [],
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function required(memoryId: string): Promise<AgentMemory> {
    const normalizedId = memoryId.trim();
    if (!normalizedId) throw new Error("Memory id is required.");
    const record = await store.getRecord({
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_MEMORY_COLLECTION,
      recordId: normalizedId,
    });
    if (!record || record.payload.kind !== "memory") {
      throw new Error(`Agent memory ${normalizedId} was not found.`);
    }
    return record.payload.memory;
  }

  async function settingsRecord() {
    const record = await store.getRecord({
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_MEMORY_COLLECTION,
      recordId: SETTINGS_RECORD_ID,
    });
    return record?.payload.kind === "settings"
      ? record.payload.settings
      : { ...DEFAULT_SETTINGS };
  }

  return {
    list,
    async create(input) {
      return serial(async () => {
        const createdAt = now();
        const memory: AgentMemory = {
          memoryId: memoryId(input.memoryId, id),
          category: category(input.category),
          content: content(input.content),
          source: input.source === "conversation" ? "conversation" : "manual",
          createdAt,
          updatedAt: createdAt,
        };
        await store.upsertRecord(memoryRecord(scopedWorkspaceId, memory));
        return memory;
      });
    },
    async update(memoryId, input) {
      return serial(async () => {
        const existing = await required(memoryId);
        const memory: AgentMemory = {
          ...existing,
          category:
            input.category === undefined
              ? existing.category
              : category(input.category),
          content:
            input.content === undefined
              ? existing.content
              : content(input.content),
          updatedAt: now(),
        };
        await store.upsertRecord(memoryRecord(scopedWorkspaceId, memory));
        return memory;
      });
    },
    async remove(memoryId) {
      await serial(async () => {
        const existing = await required(memoryId);
        await store.deleteRecord({
          workspaceId: scopedWorkspaceId,
          collectionName: AGENT_MEMORY_COLLECTION,
          recordId: existing.memoryId,
          deletedAt: now(),
        });
      });
    },
    getSettings: settingsRecord,
    async updateSettings(patch) {
      return serial(async () => {
        const existing = await settingsRecord();
        const updatedAt = now();
        const settings = {
          enabled: patch.enabled ?? existing.enabled,
          allowConversationLearning:
            patch.allowConversationLearning ??
            existing.allowConversationLearning,
          updatedAt,
        };
        await store.upsertRecord({
          workspaceId: scopedWorkspaceId,
          collectionName: AGENT_MEMORY_COLLECTION,
          recordId: SETTINGS_RECORD_ID,
          sourceType: "manual",
          sourceId: "agent-memory-settings",
          sourceLabel: "User-managed Agent memory settings",
          evidenceIds: [],
          lifecycleState: "active",
          searchText: "agent memory settings",
          payload: { kind: "settings", settings },
          createdAt: existing.updatedAt,
          updatedAt,
        });
        return settings;
      });
    },
    async context(limit = 20) {
      const settings = await settingsRecord();
      if (!settings.enabled) return [];
      return (await list())
        .slice(0, Math.max(0, Math.min(50, Math.floor(limit))))
        .map((memory) => ({
          category: memory.category,
          content: memory.content,
        }));
    },
  };
}
