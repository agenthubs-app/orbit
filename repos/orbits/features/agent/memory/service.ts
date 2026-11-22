import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import {
  AGENT_MEMORY_CATEGORIES,
  AGENT_MEMORY_TASKS,
  AgentMemoryRevisionConflictError,
  type AgentMemory,
  type AgentMemoryCategory,
  type AgentMemoryDeletionMark,
  type AgentMemoryRecordPayload,
  type AgentMemoryService,
  type AgentMemoryStructured,
  type AgentMemoryTask,
} from "./contract";

export const AGENT_MEMORY_COLLECTION = "agentMemories" as const;
const SETTINGS_RECORD_ID = "settings";
const DEFAULT_SETTINGS = {
  enabled: true,
  allowConversationLearning: false,
  updatedAt: "1970-01-01T00:00:00.000Z",
} as const;

export interface StorageAgentMemoryServiceOptions {
  /**
   * agent-design AG14 (设计稿 §6 账号一致性): the canonical account id of the owner — what
   * `resolveAuthenticatedApiActor()` returns as `id`. Never an Auth.js user id, a name or an e-mail address.
   */
  actorId: string;
  store: LiveRecordStoreLike<AgentMemoryRecordPayload>;
  workspaceId: string;
  now?: () => string;
  id?: () => string;
}

/** The partition of one account in one workspace: its entries, its two switches and its deletion marks. */
export function agentMemoryScopeId(workspaceId: string, actorId: string): string {
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

function appliesTo(value: readonly string[] | undefined | null): AgentMemoryTask[] {
  if (!value) return [];
  const out: AgentMemoryTask[] = [];
  for (const item of value) {
    if (!AGENT_MEMORY_TASKS.includes(item as AgentMemoryTask)) {
      throw new Error(`Unknown Agent memory task: ${item}`);
    }
    if (!out.includes(item as AgentMemoryTask)) out.push(item as AgentMemoryTask);
  }
  // "all" already covers every task.
  return out.includes("all") ? ["all"] : out;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

function day(value: string | null | undefined, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be a day written as YYYY-MM-DD.`);
  }
  return value;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function structured(value: AgentMemoryStructured | null | undefined): AgentMemoryStructured | null {
  if (!value || typeof value !== "object") return null;
  const out: AgentMemoryStructured = {};
  if (Array.isArray(value.preferredDays)) {
    const days = WEEKDAYS.filter((item) => value.preferredDays!.includes(item));
    if (days.length) out.preferredDays = [...days];
  }
  if (value.dayPart === "morning" || value.dayPart === "afternoon" || value.dayPart === "evening") out.dayPart = value.dayPart;
  if (value.strength === "prefer" || value.strength === "only" || value.strength === "avoid") out.strength = value.strength;
  if (Array.isArray(value.topics)) {
    const topics = value.topics.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 60)).slice(0, 8);
    if (topics.length) out.topics = topics;
  }
  if (value.replyLanguage === "zh" || value.replyLanguage === "ja" || value.replyLanguage === "en") out.replyLanguage = value.replyLanguage;
  return Object.keys(out).length ? out : null;
}

/** An entry as stored before AG14 has no revision, status or tasks: revision 1, in use, not classified. */
export function normalizeAgentMemory(raw: Partial<AgentMemory> & Pick<AgentMemory, "memoryId">): AgentMemory {
  const tasks = Array.isArray(raw.appliesTo) ? raw.appliesTo.filter((item): item is AgentMemoryTask => AGENT_MEMORY_TASKS.includes(item as AgentMemoryTask)) : [];
  return {
    appliesTo: tasks,
    category: AGENT_MEMORY_CATEGORIES.includes(raw.category as AgentMemoryCategory) ? (raw.category as AgentMemoryCategory) : "preference",
    content: typeof raw.content === "string" ? raw.content : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : DEFAULT_SETTINGS.updatedAt,
    ...(raw.status === "deleted" ? { deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : (typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_SETTINGS.updatedAt) } : {}),
    memoryId: raw.memoryId,
    revision: typeof raw.revision === "number" && Number.isInteger(raw.revision) && raw.revision >= 1 ? raw.revision : 1,
    source: raw.source === "conversation" ? "conversation" : "manual",
    sourceMessageRef: typeof raw.sourceMessageRef === "string" && raw.sourceMessageRef ? raw.sourceMessageRef : null,
    status: raw.status === "deleted" ? "deleted" : "active",
    structured: structured(raw.structured ?? null),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_SETTINGS.updatedAt,
    validFrom: typeof raw.validFrom === "string" && DAY.test(raw.validFrom) ? raw.validFrom : null,
    validUntil: typeof raw.validUntil === "string" && DAY.test(raw.validUntil) ? raw.validUntil : null,
  };
}

function memoryRecord(
  workspaceId: string,
  memory: AgentMemory,
  userId: string | null,
): LiveRecord<AgentMemoryRecordPayload> {
  return {
    workspaceId,
    collectionName: AGENT_MEMORY_COLLECTION,
    recordId: memory.memoryId,
    ...(userId ? { userId } : {}),
    sourceType: memory.source === "manual" ? "manual" : "agent_action",
    sourceId: memory.memoryId,
    sourceLabel:
      memory.source === "manual"
        ? "User-managed Agent memory"
        : "User-approved conversation memory",
    evidenceIds: [],
    lifecycleState: "active",
    // A deleted entry keeps no words anywhere, the search text included.
    searchText: memory.status === "deleted" ? "" : `${memory.category} ${memory.content}`,
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
  const scopedWorkspaceId = agentMemoryScopeId(workspaceId, actorId);
  const ownerId = actorId.trim();
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
      limit: "unbounded",
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_MEMORY_COLLECTION,
    });
  }

  /** Every entry of the scope, the deleted ones too (they carry the deletion marks and count in the version). */
  async function all(): Promise<AgentMemory[]> {
    return (await records()).flatMap((record) =>
      record.payload.kind === "memory"
        ? [normalizeAgentMemory(record.payload.memory)]
        : [],
    );
  }

  async function list(): Promise<readonly AgentMemory[]> {
    return (await all())
      .filter((memory) => memory.status === "active")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function stored(memoryId: string): Promise<{ memory: AgentMemory; record: LiveRecord<AgentMemoryRecordPayload> } | null> {
    const normalizedId = memoryId.trim();
    if (!normalizedId) throw new Error("Memory id is required.");
    const record = await store.getRecord({
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_MEMORY_COLLECTION,
      recordId: normalizedId,
    });
    if (!record || record.payload.kind !== "memory") return null;
    return { memory: normalizeAgentMemory(record.payload.memory), record };
  }

  async function required(memoryId: string): Promise<{ memory: AgentMemory; record: LiveRecord<AgentMemoryRecordPayload> }> {
    const found = await stored(memoryId);
    if (!found || found.memory.status !== "active") {
      throw new Error(`Agent memory ${memoryId.trim()} was not found.`);
    }
    return found;
  }

  /**
   * Writes the next revision of an entry only if it is still at the revision it was read at (a compare-and-swap in
   * the store when it has one); a change made in between is a conflict, never overwritten.
   */
  async function writeNext(previous: { memory: AgentMemory; record: LiveRecord<AgentMemoryRecordPayload> }, next: AgentMemory): Promise<AgentMemory> {
    const record = memoryRecord(scopedWorkspaceId, next, previous.record.userId ?? null);
    if (store.updateRecordIfCurrent) {
      // Entries stored before AG14 have no revision in their payload: the row's own timestamp is the condition then.
      const hasRevision = typeof (previous.record.payload as { memory?: { revision?: unknown } }).memory?.revision === "number";
      const written = await store.updateRecordIfCurrent(record, {
        updatedAt: previous.record.updatedAt,
        userId: previous.record.userId ?? null,
        ...(hasRevision ? { expectedPayloadVersion: { path: ["memory", "revision"], value: previous.memory.revision } } : {}),
      });
      if (!written) {
        const current = await stored(next.memoryId);
        throw new AgentMemoryRevisionConflictError(next.memoryId, previous.memory.revision, current?.memory.status === "active" ? current.memory.revision : null);
      }
      return next;
    }
    await store.upsertRecord(record);
    return next;
  }

  /** A later timestamp than the stored one, so the store's compare-and-swap never sees the same instant twice. */
  function later(previous: string): string {
    const current = now();
    return Date.parse(current) > Date.parse(previous) ? current : new Date(Date.parse(previous) + 1).toISOString();
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

  const markOf = (memory: AgentMemory): AgentMemoryDeletionMark => ({
    appliesTo: memory.appliesTo,
    category: memory.category,
    deletedAt: memory.deletedAt ?? memory.updatedAt,
    memoryId: memory.memoryId,
    revision: memory.revision,
    sourceMessageRef: memory.sourceMessageRef,
  });

  return {
    async snapshot() {
      const rows = await records();
      const stored = rows.flatMap((record) => (record.payload.kind === "memory" ? [normalizeAgentMemory(record.payload.memory)] : []));
      const settingsRow = rows.find((record) => record.recordId === SETTINGS_RECORD_ID);
      return {
        entries: stored.filter((memory) => memory.status === "active").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
        marks: stored.filter((memory) => memory.status === "deleted").map(markOf),
        settings: settingsRow?.payload.kind === "settings" ? settingsRow.payload.settings : { ...DEFAULT_SETTINGS },
        version: stored.reduce((sum, memory) => sum + memory.revision, 0),
      };
    },
    list,
    async get(memoryId) {
      const found = await stored(memoryId);
      return found && found.memory.status === "active" ? found.memory : null;
    },
    async create(input) {
      return serial(async () => {
        const createdAt = now();
        const from = day(input.validFrom, "validFrom");
        const until = day(input.validUntil, "validUntil");
        if (from && until && until < from) throw new Error("validUntil must not be before validFrom.");
        const memory: AgentMemory = {
          appliesTo: appliesTo(input.appliesTo),
          memoryId: memoryId(input.memoryId, id),
          category: category(input.category),
          content: content(input.content),
          source: input.source === "conversation" ? "conversation" : "manual",
          createdAt,
          revision: 1,
          sourceMessageRef: input.sourceMessageRef?.trim() || null,
          status: "active",
          structured: structured(input.structured),
          updatedAt: createdAt,
          validFrom: from,
          validUntil: until,
        };
        const record = memoryRecord(scopedWorkspaceId, memory, ownerId);
        if (store.insertRecordIfAbsent) {
          // An id is never reused: not for an entry in use, and not for one that was deleted (its mark stays).
          const inserted = await store.insertRecordIfAbsent(record);
          if (!inserted) {
            const existing = await stored(memory.memoryId);
            // The same confirmed card applied again (a retry): the entry it made is the result.
            if (existing?.memory.status === "active" && existing.memory.revision === 1 && existing.memory.content === memory.content && existing.memory.category === memory.category) return existing.memory;
            throw new Error(`Agent memory ${memory.memoryId} already exists.`);
          }
          return memory;
        }
        await store.upsertRecord(record);
        return memory;
      });
    },
    async update(memoryId, input) {
      return serial(async () => {
        const existing = await required(memoryId);
        if (input.expectedRevision !== undefined && input.expectedRevision !== existing.memory.revision) {
          throw new AgentMemoryRevisionConflictError(existing.memory.memoryId, input.expectedRevision, existing.memory.revision);
        }
        const from = input.validFrom === undefined ? existing.memory.validFrom : day(input.validFrom, "validFrom");
        const until = input.validUntil === undefined ? existing.memory.validUntil : day(input.validUntil, "validUntil");
        if (from && until && until < from) throw new Error("validUntil must not be before validFrom.");
        const memory: AgentMemory = {
          ...existing.memory,
          appliesTo: input.appliesTo === undefined ? existing.memory.appliesTo : appliesTo(input.appliesTo),
          category:
            input.category === undefined
              ? existing.memory.category
              : category(input.category),
          content:
            input.content === undefined
              ? existing.memory.content
              : content(input.content),
          revision: existing.memory.revision + 1,
          structured: input.structured === undefined ? existing.memory.structured : structured(input.structured),
          updatedAt: later(existing.record.updatedAt),
          validFrom: from,
          validUntil: until,
        };
        return writeNext(existing, memory);
      });
    },
    async remove(memoryId, input = {}) {
      await serial(async () => {
        const existing = await required(memoryId);
        if (input.expectedRevision !== undefined && input.expectedRevision !== existing.memory.revision) {
          throw new AgentMemoryRevisionConflictError(existing.memory.memoryId, input.expectedRevision, existing.memory.revision);
        }
        const deletedAt = later(existing.record.updatedAt);
        // The mark that stays: which entry, its kind, where it applied and the message it came from. Not its words.
        const mark: AgentMemory = {
          appliesTo: existing.memory.appliesTo,
          category: existing.memory.category,
          content: "",
          createdAt: existing.memory.createdAt,
          deletedAt,
          memoryId: existing.memory.memoryId,
          revision: existing.memory.revision + 1,
          source: existing.memory.source,
          sourceMessageRef: existing.memory.sourceMessageRef,
          status: "deleted",
          structured: null,
          updatedAt: deletedAt,
          validFrom: null,
          validUntil: null,
        };
        await writeNext(existing, mark);
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
    async deletionMarks() {
      return (await all()).filter((memory) => memory.status === "deleted").map(markOf);
    },
    async version() {
      // Every entry adds its revision, the deleted ones too: creating, changing and deleting each move it on by one.
      return (await all()).reduce((sum, memory) => sum + memory.revision, 0);
    },
    async context(limit = 20) {
      const settings = await settingsRecord();
      if (!settings.enabled) return [];
      // The older entry (no task of its own) gets the entries in use that are inside their validity days; deleted
      // entries are never listed, and an expired one is not handed over either.
      const today = now().slice(0, 10);
      return (await list())
        .filter((memory) => (!memory.validFrom || today >= memory.validFrom) && (!memory.validUntil || today <= memory.validUntil))
        .slice(0, Math.max(0, Math.min(50, Math.floor(limit))))
        .map((memory) => ({
          category: memory.category,
          content: memory.content,
        }));
    },
  };
}
